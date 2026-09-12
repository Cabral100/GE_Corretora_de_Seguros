import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const outputDirectory = new URL("../output/playwright/", import.meta.url);
const profileDirectory = new URL(`../tmp/browser-verify-profile-${process.pid}/`, import.meta.url);
const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const findBrowser = async () => {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Tenta o próximo navegador instalado.
    }
  }
  throw new Error("Chrome ou Edge não encontrado.");
};

class DevToolsSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id) {
        const request = this.pending.get(payload.id);
        if (!request) return;
        this.pending.delete(payload.id);
        if (payload.error) request.reject(new Error(payload.error.message));
        else request.resolve(payload.result || {});
        return;
      }
      (this.listeners.get(payload.method) || []).forEach((listener) => listener(payload.params || {}));
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function connectToBrowser(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:4173`, { method: "PUT" });
      if (response.ok) return response.json();
    } catch {
      // O navegador ainda está iniciando.
    }
    await sleep(250);
  }
  throw new Error("Não foi possível conectar ao navegador de teste.");
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Falha ao avaliar a página.");
  return result.result?.value;
}

async function screenshot(session, name) {
  const result = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(new URL(name, outputDirectory), Buffer.from(result.data, "base64"));
}

async function setViewport(session, width, height) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 620,
    screenWidth: width,
    screenHeight: height
  });
}

async function navigate(session, url) {
  await session.send("Page.navigate", { url });
  await sleep(1300);
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(profileDirectory, { recursive: true });

const browserPath = await findBrowser();
const port = 9300 + (process.pid % 500);
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(profileDirectory.pathname.replace(/^\//, ""))}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

const report = { checks: [], consoleErrors: [], failedLocalResources: [] };
const requestedUrls = new Map();
let session;

try {
  const target = await connectToBrowser(port);
  session = new DevToolsSession(target.webSocketDebuggerUrl);
  await session.open();
  session.on("Runtime.exceptionThrown", ({ exceptionDetails }) => report.consoleErrors.push(exceptionDetails?.text || "Erro JavaScript"));
  session.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error" && !String(entry.url || "").includes("google.com/maps")) report.consoleErrors.push(entry.text);
  });
  session.on("Network.requestWillBeSent", ({ requestId, request }) => {
    requestedUrls.set(requestId, request?.url || "");
  });
  session.on("Network.loadingFailed", (event) => {
    if (String(event.blockedReason || "") === "inspector") return;
    const url = requestedUrls.get(event.requestId) || "";
    if (url.startsWith("http://127.0.0.1:4173")) report.failedLocalResources.push(url);
  });
  await Promise.all([
    session.send("Page.enable"),
    session.send("Runtime.enable"),
    session.send("Log.enable"),
    session.send("Network.enable")
  ]);

  await setViewport(session, 390, 844);
  await navigate(session, "http://127.0.0.1:4173");
  const initial = await evaluate(session, `(() => ({
    textLength: document.body.innerText.trim().length,
    title: document.title,
    heading: document.querySelector('h1')?.textContent.trim(),
    overlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
    heroLogos: document.querySelectorAll('.hero-logo img').length,
    heroLogosStatic: Array.from(document.querySelectorAll('.hero-logo')).every((logo) => getComputedStyle(logo).animationName === 'none'),
    navOrder: Array.from(document.querySelectorAll('.nav-links a')).map((link) => link.textContent.trim()).join('|'),
    sectionLabels: document.querySelectorAll('.section-kicker, .location-index').length,
    insuranceCodes: document.querySelectorAll('.insurance-code').length,
    brokenImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src'))
  }))()`);
  assert(initial.textLength > 300, "A página abriu sem conteúdo suficiente.");
  assert(initial.heading === "Segurança para o que realmente importa", "O título do hero está incorreto.");
  assert(initial.heroLogos === 8, "Os logos do hero não foram renderizados.");
  assert(initial.heroLogosStatic, "Os logos do hero ainda possuem animação contínua.");
  assert(initial.navOrder === "Home|Seguros|Sobre nós|Plano de saúde|Contato", "A ordem do menu não acompanha as seções.");
  assert(initial.sectionLabels === 0, "Ainda existem rótulos pequenos acima das seções.");
  assert(initial.insuranceCodes === 0, "Ainda existem cápsulas de categoria no carrossel de seguros.");
  assert(!initial.overlay, "Uma sobreposição de erro foi encontrada.");
  assert(initial.brokenImages.length === 0, `Imagens quebradas no hero: ${initial.brokenImages.join(", ")}`);
  report.checks.push("hero mobile carregado");
  await evaluate(session, `(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const dialog = document.querySelector('#lead-dialog');
    if (dialog?.open) dialog.close();
    window.scrollTo(0, 0);
  })()`);
  await sleep(250);
  await screenshot(session, "mobile-hero-final.png");

  const menu = await evaluate(session, `(() => {
    document.querySelector('[data-menu-toggle]').click();
    const links = Array.from(document.querySelectorAll('.nav-links a'));
    return new Promise((resolve) => setTimeout(() => resolve({
      open: document.querySelector('[data-nav]').classList.contains('is-open'),
      links: links.length,
      visible: links.every((link) => getComputedStyle(link).visibility !== 'hidden')
    }), 650));
  })()`);
  assert(menu.open && menu.links === 5 && menu.visible, `O menu mobile não abriu corretamente: ${JSON.stringify(menu)}`);
  report.checks.push("menu mobile e links escalonados");
  await screenshot(session, "mobile-menu-final-2026.png");
  await evaluate(session, "document.querySelector('[data-menu-toggle]').click()");

  const mobileHeader = await evaluate(session, `(() => {
    window.scrollTo(0, 620);
    return new Promise((resolve) => setTimeout(() => {
      const rect = document.querySelector('[data-header]').getBoundingClientRect();
      const style = getComputedStyle(document.querySelector('[data-header]'));
      resolve({ top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), radius: parseFloat(style.borderTopLeftRadius), background: style.backgroundColor });
    }, 320));
  })()`);
  assert(mobileHeader.top >= 8 && mobileHeader.left === 10 && mobileHeader.width >= 368 && mobileHeader.radius > 20 && mobileHeader.background !== "rgba(0, 0, 0, 0)", "O cabeçalho mobile não assumiu o formato flutuante branco ao rolar.");
  report.checks.push("cabeçalho mobile flutuante após o scroll");
  await screenshot(session, "mobile-header-scrolled-final.png");

  const form = await evaluate(session, `(() => {
    document.querySelector('[data-open-lead]').click();
    window.open = (url) => { window.__whatsappTestUrl = url; return { opener: null }; };
    window.fetch = () => Promise.resolve({ ok: true });
    const form = document.querySelector('#lead-form');
    form.elements.name.value = 'Cliente Teste';
    form.elements.phone.value = '(11) 99999-9999';
    form.elements.interest.value = 'Seguro Auto';
    form.elements.profile[0].checked = true;
    form.elements.currentStatus.value = 'Não possuo';
    form.elements.message.value = 'Quero cobertura completa';
    form.elements.consent.checked = true;
    form.requestSubmit();
    const button = form.querySelector('[data-lead-submit]').getBoundingClientRect();
    const textarea = form.elements.message.getBoundingClientRect();
    return {
      removedCopy: !document.body.innerText.includes('Formulário rápido') && !document.body.innerText.includes('Uma única etapa') && !document.body.innerText.includes('Vamos começar'),
      opensWhatsapp: String(window.__whatsappTestUrl || '').startsWith('https://wa.me/'),
      preparedMessage: decodeURIComponent(String(window.__whatsappTestUrl || '')).includes('Cliente Teste') && decodeURIComponent(String(window.__whatsappTestUrl || '')).includes('Quero cobertura completa'),
      fullWidth: button.width >= form.getBoundingClientRect().width - 20,
      afterTextarea: button.top > textarea.bottom
    };
  })()`);
  assert(Object.values(form).every(Boolean), `O formulário não passou nos checks: ${JSON.stringify(form)}`);
  report.checks.push("formulário e mensagem pronta do WhatsApp");
  await evaluate(session, `(() => {
    const form = document.querySelector('#lead-form');
    form.scrollTop = form.scrollHeight;
  })()`);
  await sleep(250);
  await screenshot(session, "mobile-form-final-2026.png");
  await evaluate(session, "document.querySelector('[data-close-lead]').click()");

  const horizontal = await evaluate(session, `(() => {
    const section = document.querySelector('[data-horizontal-solutions]');
    window.scrollTo(0, section.offsetTop + section.offsetHeight * 0.52);
    return new Promise((resolve) => setTimeout(() => resolve({
      transform: getComputedStyle(document.querySelector('[data-solution-track]')).transform,
      progress: getComputedStyle(document.querySelector('[data-solution-progress]')).transform
    }), 350));
  })()`);
  assert(horizontal.transform !== "none" && !horizontal.transform.includes("matrix(1, 0, 0, 1, 0, 0)"), "A faixa horizontal não respondeu ao scroll.");
  report.checks.push("faixa horizontal acionada pelo scroll");
  await screenshot(session, "mobile-horizontal-final.png");

  const autoShopping = await evaluate(session, `(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const section = document.querySelector('.autoshopping');
    section.scrollIntoView({ block: 'start' });
    return new Promise((resolve) => setTimeout(() => {
      const image = section.querySelector('img');
      const rect = image.getBoundingClientRect();
      resolve({ loaded: image.complete && image.naturalWidth > 800, height: Math.round(rect.height), width: Math.round(rect.width) });
    }, 700));
  })()`);
  assert(autoShopping.loaded && autoShopping.height > 400 && autoShopping.width > 340, "A foto do AutoShopping não ficou grande no mobile.");
  report.checks.push("foto da gestora ampliada no mobile");
  await screenshot(session, "mobile-autoshopping-final.png");

  const carousel = await evaluate(session, `(() => {
    const section = document.querySelector('#seguros');
    window.scrollTo(0, section.offsetTop);
    const track = section.querySelector('[data-carousel-track]');
    const before = track.scrollLeft;
    section.querySelector('[data-carousel-next]').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      before,
      after: track.scrollLeft,
      slides: section.querySelectorAll('[data-carousel-item]').length,
      onePerView: Math.abs(track.querySelector('[data-carousel-item]').getBoundingClientRect().width - track.clientWidth) < 2,
      dots: section.querySelectorAll('[data-carousel-dots] button').length,
      activeDots: section.querySelectorAll('[data-carousel-dots] button[aria-current="true"]').length
    }), 650));
  })()`);
  assert(carousel.after > carousel.before && carousel.slides === 6 && carousel.onePerView && carousel.dots === 6 && carousel.activeDots === 1, "O carrossel de seguros não avançou corretamente.");
  report.checks.push("carrossel mobile com seis slides, setas e seis indicadores");
  await screenshot(session, "mobile-insurance-final.png");

  const healthMechanism = await evaluate(session, `(() => {
    const section = document.querySelector('#saude');
    section.scrollIntoView({ block: 'start' });
    section.querySelector('[data-health-profile="familiar"]').click();
    return new Promise((resolve) => setTimeout(() => {
      const stage = section.querySelector('.health-stage').getBoundingClientRect();
      const media = section.querySelector('.health-stage-media');
      resolve({
        stageWidth: Math.round(stage.width),
        stageHeight: Math.round(stage.height),
        mediaLoaded: media.complete && media.naturalWidth > 0,
        profileTitle: section.querySelector('[data-profile-title]').textContent.trim(),
        steps: section.querySelectorAll('.health-steps > div').length,
        titleColor: getComputedStyle(section.querySelector('h2')).color
      });
    }, 450));
  })()`);
  assert(healthMechanism.stageWidth >= 360 && healthMechanism.stageHeight > 700 && healthMechanism.mediaLoaded && healthMechanism.profileTitle === "Plano familiar" && healthMechanism.steps === 3 && healthMechanism.titleColor === "rgb(255, 255, 255)", "O mecanismo de plano de saúde não ficou integrado corretamente.");
  report.checks.push("mecanismo de saúde integrado e interativo");
  await screenshot(session, "mobile-health-mechanism-final.png");

  const location = await evaluate(session, `(() => {
    const section = document.querySelector('.location');
    section.scrollIntoView({ block: 'start' });
    const map = section.querySelector('iframe');
    const whatsApp = document.querySelector('.whatsapp-float');
    return new Promise((resolve) => setTimeout(() => resolve({
      title: section.querySelector('h2')?.textContent.trim(),
      mapVisible: map.getBoundingClientRect().height > 300,
      whatsappShadow: getComputedStyle(whatsApp).boxShadow
    }), 400));
  })()`);
  assert(location.title === "Venha conversar com a gente." && location.mapVisible && location.whatsappShadow === "none", "A seção de localização ou o botão do WhatsApp não está conforme o esperado.");
  report.checks.push("localização editorial e WhatsApp sem sombra");
  await screenshot(session, "mobile-location-final.png");

  const footer = await evaluate(session, `(() => {
    document.querySelector('.footer-wordmark').scrollIntoView({ block: 'center' });
    return new Promise((resolve) => setTimeout(() => resolve({
      letters: document.querySelectorAll('.footer-letter').length,
      visible: getComputedStyle(document.querySelector('.footer-letter')).opacity
    }), 1450));
  })()`);
  assert(footer.letters === 13 && Number(footer.visible) > 0.9, "O nome animado do rodapé não ficou visível.");
  report.checks.push("wordmark do rodapé alinhado entre linhas");
  await screenshot(session, "mobile-footer-final-2026.png");

  await setViewport(session, 1440, 900);
  await navigate(session, "http://127.0.0.1:4173");
  await evaluate(session, `(() => {
    const dialog = document.querySelector('#lead-dialog');
    if (dialog?.open) dialog.close();
    window.scrollTo(0, 0);
  })()`);
  await sleep(250);
  await screenshot(session, "desktop-hero-final-2026.png");
  const desktop = await evaluate(session, `(() => ({
    width: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    overflowingElements: Array.from(document.querySelectorAll('body *')).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    }).slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) })),
    heroHeight: Math.round(document.querySelector('.opening').getBoundingClientRect().height),
    h1Count: document.querySelectorAll('h1').length
  }))()`);
  report.desktop = desktop;
  assert(desktop.width >= 1400 && !desktop.overflow && desktop.h1Count === 1, "O layout desktop apresentou overflow ou estrutura incorreta.");
  report.checks.push("desktop sem overflow horizontal");

  const desktopRefinements = await evaluate(session, `(() => {
    window.scrollTo(0, 700);
    return new Promise((resolve) => setTimeout(() => {
      const header = document.querySelector('[data-header]');
      const headerRect = header.getBoundingClientRect();
      const autoPhoto = document.querySelector('.autoshopping-photo img');
      const c6 = document.querySelector('.partner-card-c6 img');
      resolve({
        headerTop: Math.round(headerRect.top),
        headerLeft: Math.round(headerRect.left),
        headerWidth: Math.round(headerRect.width),
        headerRadius: parseFloat(getComputedStyle(header).borderTopLeftRadius),
        autoPhotoLoaded: autoPhoto.complete && autoPhoto.naturalWidth > 800,
        autoPhotoRatio: autoPhoto.naturalWidth / Math.max(1, autoPhoto.naturalHeight),
        c6Filter: getComputedStyle(c6).filter,
        c6Opacity: getComputedStyle(c6).opacity
      });
    }, 500));
  })()`);
  assert(desktopRefinements.headerTop >= 12 && desktopRefinements.headerLeft >= 15 && desktopRefinements.headerWidth >= desktop.width * 0.94 && desktopRefinements.headerRadius > 25, "O cabeçalho desktop não ficou largo e flutuante após o scroll.");
  assert(desktopRefinements.autoPhotoLoaded && desktopRefinements.autoPhotoRatio > 2.2, "A foto editorial do AutoShopping não foi carregada.");
  assert(desktopRefinements.c6Filter.includes("brightness(0)") && desktopRefinements.c6Opacity === "1", "O logo C6 Seg continua sem contraste.");
  report.checks.push("foto do AutoShopping, C6 Seg e cabeçalho desktop refinados");
  await screenshot(session, "desktop-header-scrolled-final.png");

  await evaluate(session, `(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelector('.autoshopping').scrollIntoView({ block: 'center' });
  })()`);
  await sleep(900);
  await screenshot(session, "desktop-autoshopping-final.png");

  await evaluate(session, "document.querySelector('.partners').scrollIntoView({ block: 'center' })");
  await sleep(900);
  await screenshot(session, "desktop-partners-final.png");

  await evaluate(session, "document.querySelector('#saude').scrollIntoView({ block: 'center' })");
  await sleep(900);
  await screenshot(session, "desktop-health-mechanism-final.png");

  assert(report.consoleErrors.length === 0, `Erros de console: ${report.consoleErrors.join(" | ")}`);
  assert(report.failedLocalResources.length === 0, `Recursos locais com falha: ${report.failedLocalResources.join(" | ")}`);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (session) session.close();
  browser.kill();
  await writeFile(new URL("browser-report.json", outputDirectory), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
