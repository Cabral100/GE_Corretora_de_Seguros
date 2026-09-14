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
    heroLogos: document.querySelectorAll('.hero-partners-group img').length,
    heroMarquee: getComputedStyle(document.querySelector('.hero-partners-track')).animationName,
    heroRailBackground: getComputedStyle(document.querySelector('.hero-partners')).backgroundColor,
    heroLogoBackground: getComputedStyle(document.querySelector('.hero-partners-group span')).backgroundColor,
    heroBackdropLoaded: (() => { const image = document.querySelector('.hero-backdrop'); return image.complete && image.naturalWidth > 0; })(),
    heroBackdropSource: document.querySelector('.hero-backdrop')?.getAttribute('src'),
    finalStylesheet: Array.from(document.styleSheets).some((sheet) => String(sheet.href || '').includes('final-refresh.css')),
    navOrder: Array.from(document.querySelectorAll('.nav-links a')).map((link) => link.textContent.trim()).join('|'),
    headerSurface: document.querySelector('[data-header]')?.dataset.surface,
    headerBackground: getComputedStyle(document.querySelector('[data-header] .header-inner')).backgroundColor,
    initialNavColor: getComputedStyle(document.querySelector('.nav-links a')).color,
    initialToggleColor: getComputedStyle(document.querySelector('[data-menu-toggle] span')).backgroundColor,
    sectionLabels: document.querySelectorAll('.section-kicker, .location-index').length,
    insuranceCodes: document.querySelectorAll('.insurance-code').length,
    brokenImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')),
    autoPopupOpen: Boolean(document.querySelector('#lead-dialog')?.open)
  }))()`);
  assert(initial.textLength > 300, "A página abriu sem conteúdo suficiente.");
  assert(initial.heading === "Segurança para o que realmente importa", "O título do hero está incorreto.");
  assert(initial.heroLogos === 20, "A faixa duplicada de logos do hero não foi renderizada.");
  assert(initial.heroMarquee === "heroPartnersMarquee", "O carrossel infinito de marcas não está ativo.");
  assert(initial.heroRailBackground === "rgba(0, 0, 0, 0)" && initial.heroLogoBackground === "rgba(0, 0, 0, 0)", "As marcas do hero ainda estão sobre uma faixa ou cápsula.");
  assert(initial.heroBackdropLoaded, "A fotografia de fundo do hero não carregou.");
  assert(initial.heroBackdropSource === "assets/hero-family-protection.jpg", "O hero ainda usa a fotografia anterior.");
  assert(initial.finalStylesheet, "A camada visual final não foi carregada.");
  assert(initial.navOrder === "Home|Seguros|Sobre nós|Plano de saúde|Contato", "A ordem do menu não acompanha as seções.");
  assert(initial.headerSurface === "dark" && initial.headerBackground === "rgba(0, 0, 0, 0)" && initial.initialNavColor === "rgb(255, 255, 255)" && initial.initialToggleColor === "rgb(255, 255, 255)", `O cabeçalho inicial não está transparente e legível sobre o hero: ${JSON.stringify(initial)}`);
  assert(initial.sectionLabels === 0, "Ainda existem rótulos pequenos acima das seções.");
  assert(initial.insuranceCodes === 0, "Ainda existem cápsulas de categoria no carrossel de seguros.");
  assert(initial.autoPopupOpen, "O formulário automático não abriu ao carregar o site.");
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

  await evaluate(session, "window.scrollTo(0, 620)");
  await sleep(350);

  const menu = await evaluate(session, `(() => {
    document.querySelector('[data-menu-toggle]').click();
    const links = Array.from(document.querySelectorAll('.nav-links a'));
    const toggleStyle = getComputedStyle(document.querySelector('[data-menu-toggle]'));
    const header = document.querySelector('[data-header] .header-inner');
    const navigation = document.querySelector('[data-nav]');
    const brand = document.querySelector('[data-header] .brand');
    return new Promise((resolve) => setTimeout(() => resolve({
      open: document.querySelector('[data-nav]').classList.contains('is-open'),
      links: links.length,
      visible: links.every((link) => {
        const style = getComputedStyle(link);
        const rect = link.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.color === 'rgb(255, 255, 255)' && Number(style.opacity) > 0.95 && rect.width > 250 && rect.height > 30;
      }),
      toggleRadius: parseFloat(toggleStyle.borderTopLeftRadius),
      toggleBorder: toggleStyle.borderTopWidth,
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      navigationTop: Math.round(navigation.getBoundingClientRect().top),
      firstLinkTop: Math.round(links[0].getBoundingClientRect().top),
      firstLinkCenter: Math.round(links[0].getBoundingClientRect().left + links[0].getBoundingClientRect().width / 2),
      brandWidth: Math.round(brand.getBoundingClientRect().width),
      brandHeight: Math.round(brand.getBoundingClientRect().height),
      toggleLineColor: getComputedStyle(document.querySelector('[data-menu-toggle] span')).backgroundColor
    }), 650));
  })()`);
  assert(menu.open && menu.links === 5 && menu.visible && menu.toggleRadius === 0 && menu.toggleBorder === "0px" && menu.headerBottom === menu.navigationTop && menu.firstLinkTop >= 125 && Math.abs(menu.firstLinkCenter - 195) <= 1 && menu.brandWidth <= 84 && menu.brandHeight <= 48 && menu.toggleLineColor === "rgb(255, 255, 255)", `O menu mobile não abriu sem lacuna, centralizado e proporcional: ${JSON.stringify(menu)}`);
  report.checks.push("menu mobile e links escalonados");
  await screenshot(session, "mobile-menu-final-2026.png");
  await evaluate(session, "document.querySelector('[data-menu-toggle]').click()");

  const mobileHeader = await evaluate(session, `(() => {
    window.scrollTo(0, 620);
    return new Promise((resolve) => setTimeout(() => {
      const outer = document.querySelector('[data-header]');
      const element = outer.querySelector('.header-inner');
      const outerRect = outer.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const brandRect = outer.querySelector('.brand').getBoundingClientRect();
      resolve({ outerTop: Math.round(outerRect.top), outerWidth: Math.round(outerRect.width), top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), radius: parseFloat(style.borderTopLeftRadius), background: style.backgroundColor, surface: outer.dataset.surface, navColor: getComputedStyle(outer.querySelector('.nav-links a')).color, brandWidth: Math.round(brandRect.width), brandHeight: Math.round(brandRect.height) });
    }, 320));
  })()`);
  assert(mobileHeader.outerTop === 0 && mobileHeader.outerWidth === 390 && mobileHeader.top === 8 && mobileHeader.left === 10 && mobileHeader.width === 370 && mobileHeader.radius > 25 && mobileHeader.background === "rgba(28, 29, 28, 0.62)" && mobileHeader.surface === "dark" && mobileHeader.navColor === "rgb(255, 255, 255)" && mobileHeader.brandWidth <= 84 && mobileHeader.brandHeight <= 48, `O cabeçalho mobile não virou uma cápsula de vidro escura após o scroll: ${JSON.stringify(mobileHeader)}`);
  report.checks.push("cabeçalho mobile arredondado, proporcional e translúcido após o scroll");
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
      opensWhatsapp: String(window.__whatsappTestUrl || '').startsWith('https://wa.me/5511993135111'),
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
    section.scrollIntoView({ block: 'start' });
    const track = section.querySelector('[data-solution-track]');
    const firstCard = track.querySelector('.solution-panel');
    const before = track.scrollLeft;
    track.scrollTo({ left: firstCard.getBoundingClientRect().width + 12, behavior: 'auto' });
    return new Promise((resolve) => setTimeout(() => resolve({
      before,
      after: track.scrollLeft,
      transform: getComputedStyle(track).transform,
      snap: getComputedStyle(track).scrollSnapType,
      background: getComputedStyle(firstCard).backgroundImage,
      carouselImage: document.querySelector('#seguros .insurance-slide img')?.getAttribute('src'),
      sectionHeight: Math.round(section.getBoundingClientRect().height)
    }), 450));
  })()`);
  assert(horizontal.after > horizontal.before && horizontal.transform === "none" && horizontal.snap.includes("x") && horizontal.background.includes("solution-auto.jpg") && horizontal.carouselImage === "assets/insurance-auto.jpg" && horizontal.sectionHeight < 900, "O carrossel tátil de soluções não ficou fluido ou ainda repete a imagem do carrossel principal.");
  report.checks.push("soluções em carrossel tátil, sem travar a rolagem mobile");
  await screenshot(session, "mobile-horizontal-final.png");

  const about = await evaluate(session, `(() => {
    const section = document.querySelector('#sobre');
    section.scrollIntoView({ block: 'start' });
    const founder = section.querySelector('.about-founder-photo img');
    const copy = section.querySelector('.about-owner');
    return new Promise((resolve) => setTimeout(() => resolve({
      ownerClear: section.querySelector('h2')?.textContent.trim() === 'Sobre nós' && section.innerText.includes('foi fundada por Caio'),
      oldTitleRemoved: !section.innerText.includes('Uma corretora próxima, do primeiro contato à escolha.'),
      oldOwnerTitleRemoved: !section.innerText.includes('Caio é o proprietário da G.E. Corretora de Seguros.'),
      oldPartnershipRemoved: !section.querySelector('.about-partnership'),
      imageLoaded: founder.complete && founder.naturalWidth === 853 && founder.naturalHeight === 1280,
      portraitUncropped: Math.abs(founder.getBoundingClientRect().width / founder.getBoundingClientRect().height - 853 / 1280) < 0.01,
      copyBeforePhoto: copy.getBoundingClientRect().top < founder.getBoundingClientRect().top,
      whiteBackground: getComputedStyle(section).backgroundColor === 'rgb(255, 255, 255)',
      headerSurface: document.querySelector('[data-header]').dataset.surface,
      headerBackground: getComputedStyle(document.querySelector('[data-header] .header-inner')).backgroundColor,
      headerToggleColor: getComputedStyle(document.querySelector('[data-menu-toggle] span')).backgroundColor,
      headingColor: getComputedStyle(section.querySelector('h2')).color
    }), 400));
  })()`);
  assert(about.ownerClear && about.oldTitleRemoved && about.oldOwnerTitleRemoved && about.oldPartnershipRemoved && about.imageLoaded && about.portraitUncropped && about.copyBeforePhoto && about.whiteBackground && about.headerSurface === "light" && about.headerBackground === "rgba(255, 255, 255, 0.68)" && about.headerToggleColor === "rgb(17, 17, 17)" && about.headingColor === "rgb(17, 17, 17)", `A seção sobre ou o contraste adaptativo do cabeçalho não ficaram corretos: ${JSON.stringify(about)}`);
  report.checks.push("seção sobre com texto primeiro e retrato original completo do Caio");
  await screenshot(session, "mobile-about-final.png");
  await evaluate(session, "document.querySelector('.about-founder-photo').scrollIntoView({ block: 'center' })");
  await sleep(350);
  await screenshot(session, "mobile-caio-original-final.png");

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
        sectionHeight: Math.round(section.getBoundingClientRect().height),
        sectionPadding: getComputedStyle(section).padding,
        mediaLoaded: media.complete && media.naturalWidth > 0,
        profileTitle: section.querySelector('[data-profile-title]').textContent.trim(),
        steps: section.querySelectorAll('.health-steps > div').length,
        titleColor: getComputedStyle(section.querySelector('h2')).color,
        headerSurface: document.querySelector('[data-header]').dataset.surface,
        headerBackground: getComputedStyle(document.querySelector('[data-header] .header-inner')).backgroundColor,
        headerToggleColor: getComputedStyle(document.querySelector('[data-menu-toggle] span')).backgroundColor
      });
    }, 450));
  })()`);
  assert(healthMechanism.stageWidth === 390 && healthMechanism.stageHeight >= 844 && healthMechanism.sectionHeight === healthMechanism.stageHeight && healthMechanism.sectionPadding === "0px" && healthMechanism.mediaLoaded && healthMechanism.profileTitle === "Plano familiar" && healthMechanism.steps === 3 && healthMechanism.titleColor === "rgb(255, 255, 255)" && healthMechanism.headerSurface === "dark" && healthMechanism.headerBackground === "rgba(28, 29, 28, 0.62)" && healthMechanism.headerToggleColor === "rgb(255, 255, 255)", "O mecanismo de plano de saúde ou o contraste do cabeçalho não ficaram corretos.");
  report.checks.push("mecanismo de saúde integrado e interativo");
  await screenshot(session, "mobile-health-mechanism-final.png");

  const mobileProcessSticky = await evaluate(session, `(async () => {
    const cards = Array.from(document.querySelectorAll('.process-card'));
    const positions = cards.map((card) => card.getBoundingClientRect().top + scrollY);
    window.scrollTo(0, positions[1]);
    await new Promise((resolve) => setTimeout(resolve, 420));
    return cards.map((card) => ({ top: Math.round(card.getBoundingClientRect().top), position: getComputedStyle(card).position, transform: getComputedStyle(card).transform }));
  })()`);
  assert(mobileProcessSticky.every((card) => card.position === "sticky" && card.transform === "none") && mobileProcessSticky[0].top === 84 && mobileProcessSticky[1].top === 96, `Os cards 01, 02 e 03 perderam o sticky no mobile: ${JSON.stringify(mobileProcessSticky)}`);
  report.checks.push("cards 01, 02 e 03 sticky no mobile");
  await screenshot(session, "mobile-process-sticky-final.png");

  const location = await evaluate(session, `(() => {
    const section = document.querySelector('.location');
    section.scrollIntoView({ block: 'start' });
    const map = section.querySelector('iframe');
    const whatsApp = document.querySelector('.whatsapp-float');
    return new Promise((resolve) => setTimeout(() => resolve({
      title: section.querySelector('h2')?.textContent.trim(),
      titleColor: getComputedStyle(section.querySelector('h2')).color,
      titleSize: parseFloat(getComputedStyle(section.querySelector('h2')).fontSize),
      mapVisible: map.getBoundingClientRect().height > 300,
      whatsappShadow: getComputedStyle(whatsApp).boxShadow,
      headerSurface: document.querySelector('[data-header]').dataset.surface,
      headerToggleColor: getComputedStyle(document.querySelector('[data-menu-toggle] span')).backgroundColor
    }), 400));
  })()`);
  assert(location.title === "Contato e localização" && location.titleColor === "rgb(17, 17, 17)" && location.titleSize <= 38 && location.mapVisible && location.whatsappShadow === "none" && location.headerSurface === "light" && location.headerToggleColor === "rgb(17, 17, 17)", `A seção de localização ou seu contraste não estão conforme o esperado: ${JSON.stringify(location)}`);
  report.checks.push("contato e localização com hierarquia editorial e contraste correto");
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

  await setViewport(session, 320, 760);
  await navigate(session, "http://127.0.0.1:4173");
  await evaluate(session, `(() => {
    const dialog = document.querySelector('#lead-dialog');
    if (dialog?.open) dialog.close();
    document.querySelector('[data-menu-toggle]').click();
  })()`);
  await sleep(650);
  const narrowMobile = await evaluate(session, `(() => {
    const links = Array.from(document.querySelectorAll('.nav-links a'));
    const toggle = document.querySelector('[data-menu-toggle]');
    const header = document.querySelector('[data-header] .header-inner');
    const navigation = document.querySelector('[data-nav]');
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      headerWidth: Math.round(document.querySelector('[data-header]').getBoundingClientRect().width),
      toggleRadius: parseFloat(getComputedStyle(toggle).borderTopLeftRadius),
      menuGap: Math.round(navigation.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
      linksCenter: Math.round(links[0].getBoundingClientRect().left + links[0].getBoundingClientRect().width / 2),
      linksVisible: links.every((link) => {
        const style = getComputedStyle(link);
        const rect = link.getBoundingClientRect();
        return style.color === 'rgb(255, 255, 255)' && rect.width >= 270 && rect.height > 30;
      })
    };
  })()`);
  assert(!narrowMobile.overflow && narrowMobile.headerWidth === 320 && narrowMobile.toggleRadius === 0 && narrowMobile.menuGap === 0 && narrowMobile.linksCenter === 160 && narrowMobile.linksVisible, `O menu não ficou íntegro em 320 px: ${JSON.stringify(narrowMobile)}`);
  report.checks.push("menu e cabeçalho íntegros em 320 px");
  await screenshot(session, "mobile-320-menu-final.png");

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
      const header = document.querySelector('[data-header] .header-inner');
      const headerRect = header.getBoundingClientRect();
      const autoPhoto = document.querySelector('.autoshopping-photo img');
      const c6 = document.querySelector('.partner-card-c6 img');
      resolve({
        headerTop: Math.round(headerRect.top),
        headerLeft: Math.round(headerRect.left),
        headerWidth: Math.round(headerRect.width),
        headerRadius: parseFloat(getComputedStyle(header).borderTopLeftRadius),
        headerBackground: getComputedStyle(header).backgroundColor,
        autoPhotoLoaded: autoPhoto.complete && autoPhoto.naturalWidth > 800,
        autoPhotoRatio: autoPhoto.naturalWidth / Math.max(1, autoPhoto.naturalHeight),
        c6Filter: getComputedStyle(c6).filter,
        c6Opacity: getComputedStyle(c6).opacity
      });
    }, 500));
  })()`);
  assert(desktopRefinements.headerTop >= 9 && desktopRefinements.headerLeft >= 19 && desktopRefinements.headerWidth >= desktop.width * 0.94 && desktopRefinements.headerRadius > 25 && desktopRefinements.headerBackground.includes("87, 86, 82"), "O cabeçalho desktop não ficou largo, escuro e flutuante após o scroll.");
  assert(desktopRefinements.autoPhotoLoaded && desktopRefinements.autoPhotoRatio > 2.2, "A foto editorial do AutoShopping não foi carregada.");
  assert(desktopRefinements.c6Filter.includes("brightness(0)") && desktopRefinements.c6Opacity === "1", "O logo C6 Seg continua sem contraste.");
  report.checks.push("foto do AutoShopping, C6 Seg e cabeçalho desktop escuro refinados");
  await screenshot(session, "desktop-header-scrolled-final.png");

  const desktopHorizontal = await evaluate(session, `(async () => {
    const section = document.querySelector('[data-horizontal-solutions]');
    const sticky = section.querySelector('.solution-sticky');
    const panel = section.querySelector('.solution-panel');
    const travel = section.offsetHeight - innerHeight;
    window.scrollTo(0, section.offsetTop + travel * 0.5);
    await new Promise((resolve) => setTimeout(resolve, 420));
    const stickyRect = sticky.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      stickyPosition: getComputedStyle(sticky).position,
      stickyTop: Math.round(stickyRect.top),
      stickyHeight: Math.round(stickyRect.height),
      panelTop: Math.round(panelRect.top),
      panelHeight: Math.round(panelRect.height),
      transform: getComputedStyle(section.querySelector('[data-solution-track]')).transform,
      bodyOverflowX: getComputedStyle(document.body).overflowX
    };
  })()`);
  assert(desktopHorizontal.stickyPosition === "sticky" && desktopHorizontal.stickyTop === 0 && desktopHorizontal.stickyHeight === 900 && desktopHorizontal.panelTop === 0 && desktopHorizontal.panelHeight === 900 && desktopHorizontal.transform !== "none" && desktopHorizontal.bodyOverflowX === "clip", `A história horizontal deixou uma faixa vazia ou perdeu o sticky: ${JSON.stringify(desktopHorizontal)}`);
  report.checks.push("história horizontal ocupa a tela inteira e permanece sticky");
  await screenshot(session, "desktop-horizontal-sticky-final.png");

  await evaluate(session, `(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelector('.autoshopping').scrollIntoView({ block: 'center' });
  })()`);
  await sleep(900);
  await screenshot(session, "desktop-autoshopping-final.png");

  await evaluate(session, "document.querySelector('.partners').scrollIntoView({ block: 'center' })");
  await sleep(900);
  await screenshot(session, "desktop-partners-final.png");

  const desktopHealth = await evaluate(session, `(async () => {
    const section = document.querySelector('#saude');
    section.scrollIntoView({ block: 'start' });
    await new Promise((resolve) => setTimeout(resolve, 650));
    const stage = section.querySelector('.health-stage');
    const sectionRect = section.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return {
      sectionTop: Math.round(sectionRect.top),
      stageTop: Math.round(stageRect.top),
      sectionHeight: Math.round(sectionRect.height),
      stageHeight: Math.round(stageRect.height),
      paddingTop: getComputedStyle(section).paddingTop,
      paddingBottom: getComputedStyle(section).paddingBottom
    };
  })()`);
  assert(desktopHealth.sectionTop === desktopHealth.stageTop && desktopHealth.sectionHeight === desktopHealth.stageHeight && desktopHealth.paddingTop === "0px" && desktopHealth.paddingBottom === "0px", `A seção de saúde ainda tem campo azul fora da foto: ${JSON.stringify(desktopHealth)}`);
  report.checks.push("foto de saúde sem campos azuis nas bordas");
  await screenshot(session, "desktop-health-mechanism-final.png");

  const processSticky = await evaluate(session, `(async () => {
    const cards = Array.from(document.querySelectorAll('.process-card'));
    const positions = cards.map((card) => card.getBoundingClientRect().top + scrollY);
    window.scrollTo(0, positions[1]);
    await new Promise((resolve) => setTimeout(resolve, 420));
    return cards.map((card) => ({
      top: Math.round(card.getBoundingClientRect().top),
      position: getComputedStyle(card).position,
      transform: getComputedStyle(card).transform,
      color: getComputedStyle(card).color,
      contentTransition: getComputedStyle(card.querySelector('div')).transitionDuration
    }));
  })()`);
  assert(processSticky.every((card) => card.position === "sticky" && card.transform === "none") && processSticky[0].top === 114 && processSticky[1].top === 130 && processSticky[1].color === "rgb(17, 17, 17)" && processSticky[2].color === "rgb(17, 17, 17)" && processSticky[0].contentTransition.includes("0.68s"), `Os cards 01, 02 e 03 não empilham com animação e texto preto: ${JSON.stringify(processSticky)}`);
  report.checks.push("cards 01, 02 e 03 sticky, animados e com texto preto");
  await screenshot(session, "desktop-process-sticky-final.png");

  const desktopAbout = await evaluate(session, `(() => {
    const section = document.querySelector('#sobre');
    section.scrollIntoView({ block: 'center' });
    return new Promise((resolve) => setTimeout(() => {
      const copy = section.querySelector('.about-owner').getBoundingClientRect();
      const photo = section.querySelector('.about-founder-photo img');
      const photoRect = photo.getBoundingClientRect();
      resolve({
        copyLeft: Math.round(copy.left),
        photoLeft: Math.round(photoRect.left),
        naturalWidth: photo.naturalWidth,
        naturalHeight: photo.naturalHeight,
        renderedRatio: photoRect.width / photoRect.height
      });
    }, 500));
  })()`);
  assert(desktopAbout.copyLeft < desktopAbout.photoLeft && desktopAbout.naturalWidth === 853 && desktopAbout.naturalHeight === 1280 && Math.abs(desktopAbout.renderedRatio - 853 / 1280) < 0.01, "O retrato original do Caio não ficou inteiro à direita no desktop.");
  report.checks.push("retrato original do Caio inteiro à direita no desktop");
  await screenshot(session, "desktop-about-caio-final.png");

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
