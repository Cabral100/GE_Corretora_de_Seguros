(function () {
  "use strict";

  const config = Object.freeze({
    leadEndpoint: "/api/lead",
    whatsappNumber: "5511993505685",
    popupDelayMs: 900,
    autoOpenPopup: true,
    analyticsEventName: "generate_lead",
    brandName: "G.E. Corretora de Seguros",
    ...(window.GE_SITE_CONFIG || {})
  });

  const leadDialog = document.querySelector("#lead-dialog");
  const leadForm = document.querySelector("#lead-form");
  const contactForm = document.querySelector("#contact-form");
  const privacyDialog = document.querySelector("#privacy-dialog");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const navigation = document.querySelector("[data-nav]");
  const header = document.querySelector("[data-header]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileNavigation = window.matchMedia("(max-width: 860px)");

  let selectedInterest = "";
  let headerFrame = 0;
  let headerSettleTimer = 0;

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhone(value) {
    const digits = digitsOnly(value).slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  }

  function getCampaignData() {
    const params = new URLSearchParams(window.location.search);
    const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid"];
    return Object.fromEntries(allowed.map((key) => [key, (params.get(key) || "").slice(0, 180)]).filter((entry) => entry[1]));
  }

  function createWhatsappUrl(lead = {}) {
    const lines = [
      `Olá, equipe da ${config.brandName}! Gostaria de iniciar um atendimento.`,
      lead.name ? `Nome: ${lead.name}` : "",
      lead.phone ? `Meu WhatsApp: ${formatPhone(lead.phone)}` : "",
      lead.email ? `E-mail: ${lead.email}` : "",
      lead.interest ? `Interesse: ${lead.interest}` : "",
      lead.profile ? `Proteção para: ${lead.profile}` : "",
      lead.currentStatus ? `Situação atual: ${lead.currentStatus}` : "",
      lead.bestTime ? `Melhor horário: ${lead.bestTime}` : "",
      lead.message ? `Observações: ${lead.message}` : "",
      "Podem me ajudar com uma cotação?"
    ].filter(Boolean);
    const number = digitsOnly(config.whatsappNumber);
    const base = number ? `https://wa.me/${number}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  function openExternal(url) {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) newWindow.opener = null;
    return Boolean(newWindow);
  }

  function trackEvent(eventName, details = {}) {
    const safeDetails = {
      event: eventName,
      interest: details.interest || "",
      profile: details.profile || "",
      current_status: details.currentStatus || "",
      source: details.source || "site"
    };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(safeDetails);
    window.dispatchEvent(new CustomEvent("ge:lead-event", { detail: safeDetails }));
  }

  function announceLead(lead) {
    trackEvent(config.analyticsEventName, lead);
    window.dispatchEvent(new CustomEvent("ge:lead-created", { detail: lead }));
  }

  function setFieldError(input, message, errorId) {
    if (!input) return;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    const error = document.getElementById(errorId);
    if (error) {
      error.textContent = message;
      if (message) input.setAttribute("aria-describedby", errorId);
    }
  }

  function validateName(input, errorId) {
    const valid = Boolean(input && input.value.trim().length >= 2);
    setFieldError(input, valid ? "" : "Digite seu nome.", errorId);
    return valid;
  }

  function validatePhone(input, errorId) {
    const length = input ? digitsOnly(input.value).length : 0;
    const valid = length === 10 || length === 11;
    setFieldError(input, valid ? "" : "Digite um telefone com DDD.", errorId);
    return valid;
  }

  function validateEmail(input, errorId) {
    if (!input || !input.value.trim()) {
      setFieldError(input, "", errorId);
      return true;
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    setFieldError(input, valid ? "" : "Digite um e-mail válido.", errorId);
    return valid;
  }

  function validateSelect(input, errorId, message) {
    const valid = Boolean(input && input.value);
    setFieldError(input, valid ? "" : message, errorId);
    return valid;
  }

  function validateRadio(form, name, errorId, message) {
    const selected = form.querySelector(`input[name='${name}']:checked`);
    const error = document.getElementById(errorId);
    if (error) error.textContent = selected ? "" : message;
    form.querySelectorAll(`input[name='${name}']`).forEach((input) => input.setAttribute("aria-invalid", selected ? "false" : "true"));
    return Boolean(selected);
  }

  function getLeadFromForm(form, source) {
    const data = new FormData(form);
    const interest = String(data.get("interest") || selectedInterest || "").slice(0, 80);
    const profile = String(data.get("profile") || "Não informado").slice(0, 60);
    return {
      name: String(data.get("name") || "").trim().slice(0, 80),
      phone: digitsOnly(data.get("phone")).slice(0, 13),
      email: String(data.get("email") || "").trim().toLowerCase().slice(0, 120),
      interest,
      profile,
      preference: "WhatsApp",
      currentStatus: String(data.get("currentStatus") || "Não informado").slice(0, 80),
      bestTime: String(data.get("bestTime") || "").slice(0, 40),
      message: String(data.get("message") || "").trim().slice(0, 360),
      consent: data.get("consent") === "on",
      company: String(data.get("company") || "").slice(0, 120),
      source,
      page: window.location.pathname.slice(0, 180),
      campaign: getCampaignData(),
      tags: ["site-ge", slugify(interest), slugify(profile)].filter(Boolean)
    };
  }

  function sendLead(lead) {
    if (!config.leadEndpoint) return Promise.resolve({ ok: false, reason: "not_configured" });
    return fetch(config.leadEndpoint, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(lead)
    }).then((response) => ({ ok: response.ok })).catch(() => ({ ok: false, reason: "network" }));
  }

  function validateLeadForm() {
    if (!leadForm) return false;
    const nameValid = validateName(leadForm.elements.name, "lead-name-error");
    const phoneValid = validatePhone(leadForm.elements.phone, "lead-phone-error");
    const emailValid = validateEmail(leadForm.elements.email, "lead-email-error");
    const interestValid = validateSelect(leadForm.elements.interest, "lead-interest-error", "Escolha o que você procura.");
    const profileValid = validateRadio(leadForm, "profile", "lead-profile-error", "Escolha para quem é a proteção.");
    const statusValid = validateSelect(leadForm.elements.currentStatus, "lead-status-error", "Conte sua situação atual.");
    const consentValid = Boolean(leadForm.elements.consent && leadForm.elements.consent.checked);
    setFieldError(leadForm.elements.consent, consentValid ? "" : "Autorize o contato para enviar.", "lead-consent-error");
    return nameValid && phoneValid && emailValid && interestValid && profileValid && statusValid && consentValid;
  }

  function handleLeadSubmit(event) {
    event.preventDefault();
    if (!leadForm || !validateLeadForm()) {
      const invalid = leadForm && leadForm.querySelector("[aria-invalid='true']");
      if (invalid) invalid.focus({ preventScroll: false });
      return;
    }
    const lead = getLeadFromForm(leadForm, "popup");
    if (lead.company) return;
    const submit = leadForm.querySelector("[data-lead-submit]");
    const status = leadForm.querySelector(".lead-status");
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Abrindo uma conversa com suas respostas...";

    const opened = openExternal(createWhatsappUrl(lead));
    announceLead(lead);
    void sendLead(lead);

    if (status) status.textContent = opened ? "WhatsApp aberto. Suas respostas estão prontas para enviar." : "Permita a abertura de novas janelas para continuar no WhatsApp.";
    if (submit) submit.disabled = false;
  }

  function handleContactSubmit(event) {
    event.preventDefault();
    if (!contactForm) return;
    const nameValid = validateName(contactForm.elements.name, "contact-name-error");
    const phoneValid = validatePhone(contactForm.elements.phone, "contact-phone-error");
    const interestValid = validateSelect(contactForm.elements.interest, "contact-interest-error", "Escolha o que você procura.");
    const profileValid = validateSelect(contactForm.elements.profile, "contact-profile-error", "Escolha para quem é a proteção.");
    const consentValid = Boolean(contactForm.elements.consent.checked);
    setFieldError(contactForm.elements.consent, consentValid ? "" : "Autorize o contato para enviar.", "contact-consent-error");
    if (!nameValid || !phoneValid || !interestValid || !profileValid || !consentValid) {
      const invalid = contactForm.querySelector("[aria-invalid='true']");
      const status = contactForm.querySelector(".form-status");
      if (status) status.textContent = "Revise o campo indicado para continuar.";
      if (invalid) invalid.focus({ preventScroll: false });
      return;
    }

    const lead = getLeadFromForm(contactForm, "formulario_contato");
    if (lead.company) return;
    const status = contactForm.querySelector(".form-status");
    if (status) status.textContent = "Abrindo o WhatsApp...";
    const opened = openExternal(createWhatsappUrl(lead));
    announceLead(lead);
    void sendLead(lead);
    if (status) status.textContent = opened ? "Mensagem preparada no WhatsApp." : "Permita a abertura de novas janelas para continuar.";
  }

  function directWhatsapp() {
    openExternal(createWhatsappUrl({ interest: selectedInterest }));
    trackEvent("whatsapp_direct", { interest: selectedInterest || "não informado" });
  }

  function openLead(interest) {
    if (!leadDialog) return;
    selectedInterest = interest || selectedInterest;
    if (selectedInterest && leadForm && leadForm.elements.interest) leadForm.elements.interest.value = selectedInterest;
    closeMenu();
    if (!leadDialog.open) {
      if (typeof leadDialog.showModal === "function") leadDialog.showModal();
      else leadDialog.setAttribute("open", "");
    }
    document.body.classList.add("dialog-open");
    window.setTimeout(() => {
      const target = mobileNavigation.matches
        ? leadDialog.querySelector("[data-close-lead]")
        : leadForm && leadForm.elements.name;
      if (target) target.focus({ preventScroll: true });
    }, 100);
    trackEvent("lead_popup_open", { interest: selectedInterest, source: interest ? "cta" : "automatico" });
  }

  function closeLead() {
    if (leadDialog && leadDialog.open) {
      if (typeof leadDialog.close === "function") leadDialog.close();
      else leadDialog.removeAttribute("open");
    }
    document.body.classList.remove("dialog-open");
  }

  function setHealthProfile(profile) {
    const content = {
      individual: { title: "Plano individual", copy: "Orientação para comparar rede, acomodação e cobertura conforme suas prioridades." },
      familiar: { title: "Plano familiar", copy: "Avaliação de necessidades para buscar equilíbrio entre acesso, rede e proteção dos dependentes." },
      empresarial: { title: "Plano empresarial", copy: "Direcionamento para empresas que desejam cuidar da equipe e entender opções disponíveis." }
    };
    const selected = content[profile] || content.individual;
    document.querySelectorAll("[data-health-profile]").forEach((button) => button.classList.toggle("is-active", button.dataset.healthProfile === profile));
    const title = document.querySelector("[data-profile-title]");
    const copy = document.querySelector("[data-profile-copy]");
    if (title) title.textContent = selected.title;
    if (copy) copy.textContent = selected.copy;
  }

  function syncNavigationAccessibility() {
    if (!navigation || !menuToggle) return;
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    if (mobileNavigation.matches) {
      navigation.inert = !isOpen;
      navigation.setAttribute("aria-hidden", String(!isOpen));
    } else {
      navigation.inert = false;
      navigation.removeAttribute("aria-hidden");
    }
  }

  function closeMenu() {
    if (!navigation || !menuToggle) return;
    navigation.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
    document.body.classList.remove("menu-open");
    syncNavigationAccessibility();
  }

  function setupReveals() {
    const items = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!items.length) return;
    document.documentElement.classList.add("reveal-ready");
    items.forEach((item) => item.style.setProperty("--reveal-delay", String(item.dataset.revealDelay || 0)));
    if (!("IntersectionObserver" in window) || reducedMotion.matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -9%", threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
  }

  function setupFaq() {
    const faq = document.querySelector("[data-faq]");
    if (!faq) return;
    faq.querySelectorAll("details").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        faq.querySelectorAll("details").forEach((other) => {
          if (other !== details) other.open = false;
        });
      });
    });
  }

  function setupCarousel() {
    document.querySelectorAll("[data-carousel]").forEach((carousel) => {
      const track = carousel.querySelector("[data-carousel-track]");
      const previous = carousel.querySelector("[data-carousel-prev]");
      const next = carousel.querySelector("[data-carousel-next]");
      if (!track || !previous || !next) return;

      let timer = null;
      let scrollFrame = 0;
      let isVisible = true;
      const items = Array.from(track.querySelectorAll("[data-carousel-item]"));
      const dotsContainer = carousel.querySelector("[data-carousel-dots]");
      const getStep = () => {
        const first = items[0];
        const style = getComputedStyle(track);
        const gap = Number.parseFloat(style.columnGap || style.gap || 0);
        return first ? first.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
      };
      const move = (direction) => track.scrollBy({ left: getStep() * direction, behavior: reducedMotion.matches ? "auto" : "smooth" });

      const dots = dotsContainer ? items.map((item, index) => {
        const dot = document.createElement("button");
        const label = item.querySelector("h3")?.textContent?.trim() || `item ${index + 1}`;
        dot.type = "button";
        dot.setAttribute("aria-label", `Ver ${label}`);
        dot.addEventListener("click", () => track.scrollTo({ left: getStep() * index, behavior: reducedMotion.matches ? "auto" : "smooth" }));
        dotsContainer.appendChild(dot);
        return dot;
      }) : [];

      const updateState = () => {
        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        const current = Math.min(items.length - 1, Math.max(0, Math.round(track.scrollLeft / Math.max(1, getStep()))));
        previous.disabled = track.scrollLeft <= 4;
        next.disabled = track.scrollLeft >= maxScroll - 4;
        dots.forEach((dot, index) => {
          if (index === current) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });
      };

      previous.addEventListener("click", () => move(-1));
      next.addEventListener("click", () => move(1));
      track.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      });
      track.addEventListener("scroll", () => {
        if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
        scrollFrame = window.requestAnimationFrame(updateState);
      }, { passive: true });
      window.addEventListener("resize", updateState, { passive: true });

      const stop = () => {
        if (timer) window.clearInterval(timer);
        timer = null;
      };
      const start = () => {
        stop();
        if (!isVisible || reducedMotion.matches || carousel.dataset.carouselAutoplay !== "true") return;
        timer = window.setInterval(() => {
          const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 12;
          if (atEnd) track.scrollTo({ left: 0, behavior: "smooth" });
          else move(1);
        }, 4200);
      };
      carousel.addEventListener("mouseenter", stop);
      carousel.addEventListener("mouseleave", start);
      carousel.addEventListener("focusin", stop);
      carousel.addEventListener("focusout", start);
      carousel.addEventListener("touchstart", stop, { passive: true });
      if ("IntersectionObserver" in window) {
        const visibilityObserver = new IntersectionObserver(([entry]) => {
          isVisible = Boolean(entry && entry.isIntersecting);
          if (isVisible) start();
          else stop();
        }, { threshold: 0.08 });
        visibilityObserver.observe(carousel);
      }
      updateState();
      start();
    });
  }

  function updateHeaderState() {
    headerFrame = 0;
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 16);

    const sampleY = Math.min(window.innerHeight - 1, Math.max(1, Math.round(header.getBoundingClientRect().bottom + 2)));
    const section = document.elementsFromPoint(Math.round(window.innerWidth / 2), sampleY)
      .map((element) => element.closest && element.closest("main section"))
      .find(Boolean);
    const darkSurface = !section || section.matches(".opening, .solution-scroll, .health, .process, .contact");
    header.dataset.surface = darkSurface ? "dark" : "light";
  }

  function requestHeaderUpdate() {
    if (!headerFrame) headerFrame = window.requestAnimationFrame(updateHeaderState);
    if (headerSettleTimer) window.clearTimeout(headerSettleTimer);
    headerSettleTimer = window.setTimeout(() => {
      headerSettleTimer = 0;
      updateHeaderState();
    }, 120);
  }

  function setupHorizontalSolutions() {
    const section = document.querySelector("[data-horizontal-solutions]");
    const track = section?.querySelector("[data-solution-track]");
    const progressBar = section?.querySelector("[data-solution-progress]");
    if (!section || !track || reducedMotion.matches) return;

    const mobileSolutions = window.matchMedia("(max-width: 860px)");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (mobileSolutions.matches) {
        track.style.removeProperty("transform");
        const maxScroll = Math.max(1, track.scrollWidth - track.clientWidth);
        const mobileProgress = Math.min(1, Math.max(0, track.scrollLeft / maxScroll));
        if (progressBar) progressBar.style.transform = `scaleX(${mobileProgress})`;
        return;
      }
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, (window.scrollY - sectionTop) / travel));
      const distance = Math.max(0, track.scrollWidth - window.innerWidth);
      track.style.transform = `translate3d(${-distance * progress}px, 0, 0)`;
      if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    };
    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    track.addEventListener("scroll", requestUpdate, { passive: true });
    mobileSolutions.addEventListener("change", requestUpdate);
    update();
  }

  function setupNavigationSpy() {
    if (!("IntersectionObserver" in window)) return;
    const sections = Array.from(document.querySelectorAll("main section[id]"));
    const links = Array.from(document.querySelectorAll(".nav-links a"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          const active = link.getAttribute("href") === `#${entry.target.id}`;
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-35% 0px -55%", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }

  document.querySelectorAll("input[type='tel']").forEach((input) => input.addEventListener("input", () => { input.value = formatPhone(input.value); }));
  document.querySelectorAll("[data-open-lead]").forEach((button) => button.addEventListener("click", () => openLead(button.dataset.interest || "")));
  document.querySelectorAll("[data-close-lead]").forEach((button) => button.addEventListener("click", closeLead));
  document.querySelectorAll("[data-direct-whatsapp]").forEach((button) => button.addEventListener("click", directWhatsapp));
  document.querySelectorAll("[data-health-profile]").forEach((button) => button.addEventListener("click", () => setHealthProfile(button.dataset.healthProfile)));
  document.querySelectorAll("[data-privacy-open]").forEach((button) => button.addEventListener("click", () => {
    if (!privacyDialog || privacyDialog.open) return;
    if (typeof privacyDialog.showModal === "function") privacyDialog.showModal();
    else privacyDialog.setAttribute("open", "");
  }));
  document.querySelectorAll("[data-privacy-close]").forEach((button) => button.addEventListener("click", () => { if (privacyDialog && privacyDialog.open) privacyDialog.close(); }));

  if (leadForm) leadForm.addEventListener("submit", handleLeadSubmit);
  if (contactForm) contactForm.addEventListener("submit", handleContactSubmit);

  if (leadDialog) {
    leadDialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
    leadDialog.addEventListener("click", (event) => { if (event.target === leadDialog) closeLead(); });
  }
  if (privacyDialog) privacyDialog.addEventListener("click", (event) => { if (event.target === privacyDialog) privacyDialog.close(); });

  if (menuToggle && navigation) {
    menuToggle.addEventListener("click", () => {
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      menuToggle.setAttribute("aria-label", expanded ? "Abrir menu" : "Fechar menu");
      navigation.classList.toggle("is-open", !expanded);
      document.body.classList.toggle("menu-open", !expanded);
      syncNavigationAccessibility();
      if (!expanded) window.setTimeout(() => navigation.querySelector("a")?.focus(), 100);
    });
    navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    mobileNavigation.addEventListener("change", () => { if (!mobileNavigation.matches) closeMenu(); else syncNavigationAccessibility(); });
    syncNavigationAccessibility();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && mobileNavigation.matches && navigation?.classList.contains("is-open")) {
      const focusable = [menuToggle, ...navigation.querySelectorAll("a[href], button:not([disabled])")]
        .filter((element) => element && !element.inert);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (leadDialog && leadDialog.open) closeLead();
    else {
      const wasOpen = Boolean(navigation?.classList.contains("is-open"));
      closeMenu();
      if (wasOpen) menuToggle?.focus();
    }
  });

  window.addEventListener("scroll", requestHeaderUpdate, { passive: true });
  window.addEventListener("resize", requestHeaderUpdate, { passive: true });

  setupReveals();
  setupFaq();
  setupCarousel();
  setupHorizontalSolutions();
  setupNavigationSpy();
  updateHeaderState();

  if (config.autoOpenPopup && leadDialog) window.setTimeout(() => openLead(""), Math.max(250, Number(config.popupDelayMs) || 900));
})();
