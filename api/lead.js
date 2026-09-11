const MAX_BODY_SIZE = 12_000;
const REQUEST_TIMEOUT_MS = 8_000;

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 13);
}

function isEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    if (req.body.length > MAX_BODY_SIZE) throw new Error("payload_too_large");
    return JSON.parse(req.body);
  }
  const serialized = JSON.stringify(req.body);
  if (serialized.length > MAX_BODY_SIZE) throw new Error("payload_too_large");
  return req.body;
}

function normalizeLead(raw) {
  const campaign = raw.campaign && typeof raw.campaign === "object"
    ? Object.fromEntries(
        Object.entries(raw.campaign)
          .slice(0, 8)
          .map(([key, value]) => [clean(key, 40), clean(value, 180)])
      )
    : {};

  return {
    name: clean(raw.name, 80),
    phone: cleanPhone(raw.phone),
    email: clean(raw.email, 120).toLowerCase(),
    interest: clean(raw.interest, 80),
    profile: clean(raw.profile, 60),
    preference: clean(raw.preference, 60),
    currentStatus: clean(raw.currentStatus, 80),
    bestTime: clean(raw.bestTime, 40),
    message: clean(raw.message, 360),
    consent: raw.consent === true,
    company: clean(raw.company, 120),
    source: clean(raw.source, 60),
    page: clean(raw.page, 180),
    campaign,
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8).map((tag) => clean(tag, 48)).filter(Boolean) : []
  };
}

function validateLead(lead) {
  const errors = [];
  if (lead.name.length < 2) errors.push("name");
  if (![10, 11, 12, 13].includes(lead.phone.length)) errors.push("phone");
  if (!lead.interest) errors.push("interest");
  if (!lead.consent) errors.push("consent");
  if (!isEmail(lead.email)) errors.push("email");
  return errors;
}

async function sendEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_EMAIL_TO;
  const from = process.env.LEAD_EMAIL_FROM;
  if (!apiKey || !to || !from) return { channel: "email", status: "skipped" };

  const campaignLines = Object.entries(lead.campaign)
    .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`)
    .join("<br>");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111735;line-height:1.55">
      <h1 style="color:#101c4e;font-size:24px">Novo contato pelo site</h1>
      <p><strong>Nome:</strong> ${escapeHtml(lead.name)}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(lead.phone)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(lead.email || "Não informado")}</p>
      <p><strong>Interesse:</strong> ${escapeHtml(lead.interest)}</p>
      <p><strong>Perfil:</strong> ${escapeHtml(lead.profile || "Não informado")}</p>
      <p><strong>Preferência:</strong> ${escapeHtml(lead.preference || "Não informado")}</p>
      <p><strong>Situação atual:</strong> ${escapeHtml(lead.currentStatus || "Não informado")}</p>
      <p><strong>Melhor horário:</strong> ${escapeHtml(lead.bestTime || "Sem preferência")}</p>
      <p><strong>Observações:</strong> ${escapeHtml(lead.message || "Não informado")}</p>
      <p><strong>Origem:</strong> ${escapeHtml(lead.source || "Site")}</p>
      ${campaignLines ? `<p><strong>Campanha:</strong><br>${campaignLines}</p>` : ""}
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: lead.email || undefined,
      subject: `Novo lead: ${lead.interest}`,
      html
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  return { channel: "email", status: response.ok ? "sent" : "failed" };
}

async function sendWebhook(lead) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return { channel: "webhook", status: "skipped" };

  const headers = { "Content-Type": "application/json" };
  if (process.env.LEAD_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.LEAD_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event: "lead.created",
      occurredAt: new Date().toISOString(),
      lead
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  return { channel: "webhook", status: response.ok ? "sent" : "failed" };
}

async function syncActiveCampaign(lead) {
  const baseUrl = clean(process.env.ACTIVECAMPAIGN_URL, 300).replace(/\/$/, "");
  const token = process.env.ACTIVECAMPAIGN_TOKEN;
  if (!baseUrl || !token || !lead.email) return { channel: "activecampaign", status: "skipped" };

  const nameParts = lead.name.split(/\s+/);
  const firstName = nameParts.shift() || lead.name;
  const lastName = nameParts.join(" ");
  const response = await fetch(`${baseUrl}/api/3/contact/sync`, {
    method: "POST",
    headers: {
      "Api-Token": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contact: {
        email: lead.email,
        firstName,
        lastName,
        phone: lead.phone
      }
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  return { channel: "activecampaign", status: response.ok ? "sent" : "failed" };
}

function setHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export default async function handler(req, res) {
  setHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const allowedOrigin = process.env.SITE_ORIGIN;
  const requestOrigin = req.headers.origin;
  if (requestOrigin) {
    let originAllowed = false;
    try {
      const origin = new URL(requestOrigin);
      originAllowed = allowedOrigin
        ? requestOrigin === allowedOrigin
        : origin.host === req.headers.host;
    } catch {
      originAllowed = false;
    }
    if (!originAllowed) {
      return res.status(403).json({ ok: false, error: "origin_not_allowed" });
    }
  }

  try {
    const raw = getBody(req);
    const lead = normalizeLead(raw);

    if (lead.company) {
      return res.status(200).json({ ok: true });
    }

    const errors = validateLead(lead);
    if (errors.length) {
      return res.status(422).json({ ok: false, error: "invalid_fields", fields: errors });
    }

    const deliveries = await Promise.allSettled([
      sendEmail(lead),
      sendWebhook(lead),
      syncActiveCampaign(lead)
    ]);

    const statuses = deliveries.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { channel: "integration", status: "failed" }
    );
    const delivered = statuses.some((item) => item.status === "sent");

    if (!delivered) {
      return res.status(503).json({ ok: false, error: "delivery_unavailable" });
    }

    return res.status(200).json({ ok: true, deliveries: statuses });
  } catch (error) {
    const status = error && error.message === "payload_too_large" ? 413 : 400;
    return res.status(status).json({ ok: false, error: status === 413 ? "payload_too_large" : "invalid_request" });
  }
}
