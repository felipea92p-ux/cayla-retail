// Herramientas de la maqueta Premium (no son parte de la tienda). Uso, desde la raíz del repo:
//   node docs/maquetas/tienda-premium-2026-11/herramientas/maqueta.mjs actual      → capturas de cayla.pe (modo «Actual»)
//   node docs/maquetas/tienda-premium-2026-11/herramientas/maqueta.mjs datos       → relee prendas, precios y stock públicos → premium/datos.js
//   node docs/maquetas/tienda-premium-2026-11/herramientas/maqueta.mjs premium     → capturas de la maqueta (necesita el servidor en :3033)
//   node docs/maquetas/tienda-premium-2026-11/herramientas/maqueta.mjs comparar    → láminas Actual | Premium en comparativas/
// SOLO LECTURA sobre cayla.pe: todo lo que no es GET se aborta y `sendBeacon` no sale, así no se anotan visitas, mediciones ni nada.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAQUETA = path.resolve(AQUI, "..");
const RAIZ = path.resolve(MAQUETA, "../../..");
const { chromium } = createRequire(path.join(RAIZ, "apps/web/package.json"))("playwright");
const sharpDir = fs.readdirSync(path.join(RAIZ, "node_modules/.pnpm")).find(d => d.startsWith("sharp@"));
const sharp = createRequire(import.meta.url)(path.join(RAIZ, "node_modules/.pnpm", sharpDir, "node_modules/sharp"));
const ANCHOS = [[1440, 900, 1], [1280, 800, 1], [768, 1024, 1], [390, 844, 2], [360, 780, 2]];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const leerPantallas = () => new Function(`const window={};${fs.readFileSync(path.join(MAQUETA, "pantallas.js"), "utf8")};return window.PANTALLAS;`)();
// Rutas reales de cayla.pe para cada captura «Actual» (las de la maqueta viven en pantallas.js).
const RUTAS_ACTUAL = {
  inicio: "/inicio?sede=trujillo", catalogo: "/catalogo?sede=trujillo", categoria: "/catalogo?sede=trujillo&categoria=VES",
  nuevo: "/catalogo?lista=nuevo&sede=trujillo", ofertas: "/catalogo?lista=ofertas&sede=trujillo", vendidos: "/catalogo?lista=vendidos&sede=trujillo",
  "sin-resultados": "/catalogo?sede=trujillo&categoria=VES&talla=XXXL", ficha: "/catalogo/2c2aeab8-eb6b-4808-b5ea-c55cbbb4595f?sede=trujillo",
  looks: "/looks?sede=trujillo", look: "/looks/d38735cb-0b8f-4fc3-bf42-d65647a45f9c?sede=trujillo", arma: "/looks/arma?sede=trujillo", bolsa: "/bolsa",
  "como-separar": "/como-separar", tiendas: "/tiendas", cambios: "/cambios-y-devoluciones", privacidad: "/privacidad", terminos: "/terminos-del-club",
  entrar: "/entrar", "crear-cuenta": "/crear-cuenta", olvide: "/olvide-mi-contrasena", "nueva-contrasena": "/nueva-contrasena",
  restablecer: "/restablecer-acceso", club: "/cuenta/club", "no-existe": "/esta-pagina-no-existe",
};
async function soloLectura(ctx, imagenes = true) {
  await ctx.addInitScript(() => { try { navigator.sendBeacon = () => true; } catch {} });
  await ctx.route("**/*", r => {
    if (r.request().method() !== "GET") return r.abort();
    if (!imagenes && r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/png", body: PNG });
    return r.continue();
  });
}
const recorrer = p => p.evaluate(async () => { const t = document.scrollingElement.scrollHeight; for (let y = 0; y < t; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } window.scrollTo(0, 0); });

async function capturar(base, rutas, salida, { lectura = false, limpiar = false } = {}) {
  fs.mkdirSync(salida, { recursive: true });
  const b = await chromium.launch();
  const meta = fs.existsSync(path.join(salida, "capturas.json")) ? JSON.parse(fs.readFileSync(path.join(salida, "capturas.json"), "utf8")) : {};
  const errores = [];
  // Los cinco anchos a la vez, cada uno en su contexto (en serie tardaba ~50 min).
  await Promise.all(ANCHOS.map(async ([w, h, dsf]) => {
    const movil = w < 768;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: movil, hasTouch: movil, reducedMotion: "reduce", locale: "es-PE" });
    if (lectura) await soloLectura(ctx);
    const p = await ctx.newPage();
    p.on("pageerror", e => errores.push(`${w} ${e.message}`));
    for (const [slug, ruta] of rutas) {
      try {
        let resp = await p.goto(base + ruta, { waitUntil: "networkidle", timeout: 45000 });
        if (limpiar) { await p.evaluate(() => sessionStorage.clear()); resp = await p.reload({ waitUntil: "networkidle" }); }
        await recorrer(p); await p.waitForTimeout(700);
        const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
        if (ancho > w) errores.push(`${w} ${slug}: desborde horizontal de ${ancho - w}px`);
        const png = await p.screenshot({ fullPage: true, animations: "disabled" });
        const img = sharp(png, { limitInputPixels: false });
        const m = await img.metadata();
        await img.jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(salida, `${slug}-${w}.jpg`));
        meta[`${slug}-${w}`] = { url: base + ruta, final: p.url(), estado: resp?.status() ?? null, ancho: w, altoPx: m.height, escala: dsf, fecha: new Date().toISOString() };
        console.log("ok", slug, w);
      } catch (e) { console.log("FALLA", slug, w, e.message.slice(0, 140)); }
    }
    await ctx.close();
  }));
  fs.writeFileSync(path.join(salida, "capturas.json"), JSON.stringify(meta, null, 1));
  await b.close();
  if (errores.length) console.log("Avisos:\n" + errores.join("\n"));
}

async function datos() {
  const B = "https://cayla.pe";
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await soloLectura(ctx, false);
  const p = await ctx.newPage();
  const tarjetas = () => p.$$eval("article.t-card", as => as.map(a => ({
    id: a.dataset.prenda, n: a.dataset.nombre, precio: a.dataset.precio, antes: a.dataset.antes || null, oferta: !!a.dataset.oferta, cat: a.dataset.categoria || null,
    fotos: [...a.querySelectorAll("img")].map(i => i.getAttribute("src")).filter(Boolean),
    nota: a.querySelector(".t-card-nota")?.textContent.trim() || null,
    colores: [...a.querySelectorAll(".t-muestras i")].map(i => ({ n: i.title, h: i.style.background || null })),
    masColores: a.querySelector(".t-muestras small")?.textContent || null,
  })));
  const out = { fecha: new Date().toISOString(), listas: {}, fichas: {} };
  for (const sede of ["trujillo", "arequipa", "lima"]) for (const lista of ["", "nuevo", "ofertas", "vendidos"]) {
    const k = `${sede}:${lista || "todo"}`; out.listas[k] = [];
    for (let pg = 1; pg < 20; pg++) {
      await p.goto(`${B}/catalogo?sede=${sede}${lista ? `&lista=${lista}` : ""}${pg > 1 ? `&pagina=${pg}` : ""}`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(400);
      const nuevos = (await tarjetas()).filter(x => !out.listas[k].some(y => y.id === x.id));
      if (!nuevos.length) break;
      out.listas[k].push(...nuevos);
    }
    console.log(k, out.listas[k].length);
  }
  await p.goto(`${B}/inicio?sede=trujillo`, { waitUntil: "domcontentloaded" });
  out.portada = await p.evaluate(() => document.body.innerText.slice(0, 12000));
  for (const id of new Set(Object.values(out.listas).flat().map(x => x.id))) {
    await p.goto(`${B}/catalogo/${id}?sede=trujillo`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(250);
    out.fichas[id] = await p.evaluate(() => ({
      texto: (document.querySelector(".t-pdp-info")?.innerText || "").slice(0, 2500),
      tallas: [...document.querySelectorAll(".t-talla")].map(t => ({ t: t.innerText.trim(), off: t.disabled || t.getAttribute("aria-disabled") === "true" })),
      fotos: [...document.querySelectorAll(".cp-galeria img, .t-galeria img")].map(i => i.getAttribute("src")).filter(Boolean),
    }));
  }
  await b.close();
  const vivo = path.join(AQUI, "vivo.json");
  fs.writeFileSync(vivo, JSON.stringify(out));
  console.log("prendas leídas:", Object.keys(out.fichas).length, "→", vivo, "(no se versiona). Ahora: node herramientas/convertir.cjs");
}

async function comparar() {
  const salida = path.join(MAQUETA, "comparativas");
  fs.mkdirSync(salida, { recursive: true });
  for (const x of leerPantallas()) for (const w of [1440, 390]) {
    const a = x.actual && path.join(MAQUETA, "actual", `${x.actual}-${w}.jpg`);
    const pr = path.join(MAQUETA, "premium-capturas", `${x.id}-${w}.jpg`);
    if (!fs.existsSync(pr)) continue;
    const ancho = w === 1440 ? 720 : 390;
    const lado = async f => f && fs.existsSync(f) ? sharp(f).resize({ width: ancho }).toBuffer() : sharp({ create: { width: ancho, height: 400, channels: 3, background: "#e9e9ec" } }).png().toBuffer();
    const [ba, bp] = await Promise.all([lado(a), lado(pr)]);
    const [ma, mp] = await Promise.all([sharp(ba).metadata(), sharp(bp).metadata()]);
    const alto = Math.min(Math.max(ma.height, mp.height), 9000);
    const cab = t => Buffer.from(`<svg width="${ancho}" height="36" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1d1d21"/><text x="12" y="23" font-family="Helvetica" font-size="14" fill="#fff">${t}</text></svg>`);
    await sharp({ create: { width: ancho * 2 + 16, height: alto + 36, channels: 3, background: "#e9e9ec" } })
      .composite([{ input: cab(`ACTUAL · ${x.nombre} · ${w}px`), left: 0, top: 0 }, { input: cab(`PREMIUM · ${x.nombre} · ${w}px`), left: ancho + 16, top: 0 },
        { input: await sharp(ba).extract({ left: 0, top: 0, width: ancho, height: Math.min(ma.height, alto) }).toBuffer(), left: 0, top: 36 },
        { input: await sharp(bp).extract({ left: 0, top: 0, width: ancho, height: Math.min(mp.height, alto) }).toBuffer(), left: ancho + 16, top: 36 }])
      .jpeg({ quality: 62, mozjpeg: true }).toFile(path.join(salida, `${x.id}-${w}.jpg`));
    console.log("lámina", x.id, w);
  }
}

const orden = process.argv[2];
if (orden === "actual") await capturar("https://cayla.pe", Object.entries(RUTAS_ACTUAL), path.join(MAQUETA, "actual"), { lectura: true });
else if (orden === "premium") await capturar("http://127.0.0.1:3033/premium/index.html#", leerPantallas().map(x => [x.id, x.ruta]), path.join(MAQUETA, "premium-capturas"), { limpiar: true });
else if (orden === "datos") await datos();
else if (orden === "comparar") await comparar();
else console.log("Uso: maqueta.mjs actual | datos | premium | comparar");
