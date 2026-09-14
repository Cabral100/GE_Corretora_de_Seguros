import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const requiredFiles = [
  "index.html",
  "styles.css",
  "enhancements.css",
  "final-refresh.css",
  "site-polish.css",
  "app.js",
  "site-config.js",
  "api/lead.js",
  "assets/ge-corretora-logo.jpg",
  "assets/hero-family-protection.jpg",
  "assets/solution-auto.jpg",
  "assets/solution-home.jpg",
  "assets/solution-life.jpg",
  "assets/health-section-bg.png",
  "assets/caio-original.png",
  "assets/incrivel-autoshopping-original.jpg",
  "assets/favicon.svg",
  "assets/apple-touch-icon.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
  "assets/og-cover.png"
];

const failures = [];
for (const file of requiredFiles) {
  try {
    const info = await stat(new URL(file, root));
    if (!info.isFile() || info.size === 0) failures.push(`${file}: arquivo vazio`);
  } catch {
    failures.push(`${file}: arquivo ausente`);
  }
}

const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("styles.css", root), "utf8");
const enhancements = await readFile(new URL("enhancements.css", root), "utf8");
const finalRefresh = await readFile(new URL("final-refresh.css", root), "utf8");
const sitePolish = await readFile(new URL("site-polish.css", root), "utf8");
const js = await readFile(new URL("app.js", root), "utf8");

const checks = [
  [/<h1\b/g, 1, "A página deve ter exatamente um h1"],
  [/<meta\s+name="viewport"/g, 1, "Meta viewport ausente"],
  [/<meta\s+property="og:image"/g, 1, "OG image ausente"],
  [/data-open-lead/g, 1, "Nenhum acionador do atendimento encontrado"]
];

for (const [pattern, minimum, message] of checks) {
  const count = (html.match(pattern) || []).length;
  if (count < minimum) failures.push(message);
}

if ((html.match(/<h1\b/g) || []).length !== 1) failures.push("Quantidade inválida de h1");
if (/lorem ipsum|REMOVE_THIS|blank-app-v1/i.test(`${html}${css}${enhancements}${finalRefresh}${sitePolish}${js}`)) failures.push("Placeholder encontrado");
if (/src=""/.test(html)) failures.push("Imagem com src vazio");
if (/h-screen/.test(`${html}${css}${enhancements}${finalRefresh}${sitePolish}${js}`)) failures.push("Classe h-screen encontrada");
if (!/@media \(prefers-reduced-motion: reduce\)/.test(`${css}${enhancements}${finalRefresh}${sitePolish}`)) failures.push("Fallback de movimento reduzido ausente");

const localSources = Array.from(html.matchAll(/(?:src|href)="((?:\.\/)?assets\/[^"?#]+)"/g), (match) => match[1]);
for (const source of new Set(localSources)) {
  try {
    const info = await stat(new URL(source.replace(/^\.\//, ""), root));
    if (!info.isFile() || info.size === 0) failures.push(`${source}: ativo vazio`);
  } catch {
    failures.push(`${source}: ativo ausente`);
  }
}

const imageTags = html.match(/<img\b[^>]*>/g) || [];
for (const tag of imageTags) {
  if (!/\balt="[^"]*"/.test(tag)) failures.push(`Imagem sem alt: ${tag.slice(0, 80)}`);
}

const assetNames = await readdir(new URL("assets/", root));
for (const name of assetNames) {
  const info = await stat(new URL(`assets/${name}`, root));
  if (info.isDirectory()) continue;
  if (name === "og-cover.svg") continue;
  const referenced = html.includes(`assets/${name}`) || css.includes(`assets/${name}`) || enhancements.includes(`assets/${name}`) || finalRefresh.includes(`assets/${name}`) || sitePolish.includes(`assets/${name}`);
  if (!referenced && !name.startsWith("icon-") && name !== "apple-touch-icon.png") {
    failures.push(`Ativo sem referência: ${name}`);
  }
}

if (failures.length) {
  console.error("Validação falhou:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Validação concluída: estrutura, acessibilidade básica e ativos aprovados.");
