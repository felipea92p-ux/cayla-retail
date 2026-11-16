#!/usr/bin/env node
// Barrido responsive de TODO el ERP — ver `responsive/README.md`, sección «Barrido».
//
// El Quality Gate (`cli.mjs`) prueba a fondo las pantallas registradas, con sus escenarios. El barrido es lo contrario:
// pasa por TODAS las rutas de `app/(app)` sin registrar nada, a pocos anchos (celular, tablet, laptop, escritorio), y
// mide lo que se puede medir sin conocer la pantalla:
//   · desborde: la página entera corre de lado (la peor falla: en el teléfono todo «baila»), con el culpable más externo;
//   · recortado: algo con texto o que se toca queda fuera de la ventana sin que la página corra (no se puede alcanzar);
//   · tapado: un control que queda debajo de una barra fija o pegada (al llegar arriba y al fondo de la página);
//   · táctil: con el dedo (375 y 768), lo que se toca en menos de 44 px (Apple) y en menos de 24 px (WCAG 2.5.8),
//     contando el área real (el `::after` de tacto.css, la etiqueta o la caja que envuelve al campo);
//   · zoom de iOS: un campo con letra de menos de 16 px a 375 (el iPhone agranda la página al enfocarlo);
//   · consola: errores de la página y de la consola, y respuestas 5xx.
// Las rutas con `[id]` se resuelven solas con el primer enlace que las cumpla en las pantallas ya visitadas.
// No escribe nada en la base: solo navega y mide. Se niega a correr fuera de localhost.
//
//   pnpm --filter web responsive:barrido -- [--base-url http://localhost:3010] [--anchos 375,768,1280,1440]
//        [--rutas /vender,/caja] [--cuenta admin] [--capturas] [--salida <carpeta>]

import { chromium } from "playwright";
import { mkdirSync, readdirSync, statSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAVE_LOCAL, porClave } from "../tema/cuentas.mjs";
import { analizarEnPagina, SELECTORES_POR_DEFECTO } from "./motor/deteccion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_APP = join(AQUI, "..", "app", "(app)");

// ---- argumentos ----
const argv = process.argv.slice(2).filter((a) => a !== "--");
const opt = (nombre, defecto) => {
  const i = argv.indexOf(nombre);
  return i >= 0 ? argv[i + 1] : defecto;
};
const BASE = opt("--base-url", process.env.RESPONSIVE_BASE_URL || "http://localhost:3010");
if (!/^http:\/\/(localhost|[a-z0-9-]+\.localhost)(:\d+)?$/.test(BASE)) {
  throw new Error("barrido: solo corre contra localhost (usa http://localhost:<puerto>, no 127.0.0.1: Next no hidrata ahí).");
}
const ANCHOS = opt("--anchos", "375,768,1280,1440").split(",").map(Number);
const SOLO_RUTAS = opt("--rutas", null)?.split(",");
const CUENTA = porClave(opt("--cuenta", "admin"));
if (!CUENTA?.correo) throw new Error("barrido: cuenta desconocida o sin correo (ver tema/cuentas.mjs).");
const CAPTURAS = argv.includes("--capturas");
const SELLO = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const DIR_SALIDA = opt("--salida", join(AQUI, ".salida", `barrido-${SELLO}`));
mkdirSync(join(DIR_SALIDA, "capturas"), { recursive: true });
const ARCHIVO_JSONL = join(DIR_SALIDA, "casos.jsonl");

const ALTO_DE = { 320: 568, 375: 812, 390: 844, 768: 1024, 1024: 768, 1280: 800, 1366: 768, 1440: 900, 1920: 1080 };
const conDedo = (w) => w < 1024; // celular y tablet: pantalla táctil (activa `pointer: coarse` y tacto.css)

// ---- rutas: las `page.tsx` de app/(app), sin rutas interceptadas (@modal, (.)) ----
function rutasDeLaApp() {
  const salida = [];
  const caminar = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const p = join(dir, nombre);
      if (statSync(p).isDirectory()) {
        if (nombre.startsWith("@") || nombre.startsWith("(.") || nombre === "node_modules") continue;
        caminar(p);
      } else if (nombre === "page.tsx") {
        const segs = relative(DIR_APP, dirname(p)).split(sep).filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
        salida.push("/" + segs.join("/"));
      }
    }
  };
  caminar(DIR_APP);
  return [...new Set(salida.map((r) => (r === "/" ? "/" : r.replace(/\/$/, ""))))].sort();
}
const esDinamica = (r) => /\[[^\]]+\]/.test(r);
const patronDe = (r) =>
  new RegExp(
    "^" +
      r
        .split("/")
        .map((s) => (/^\[\.\.\.[^\]]+\]$/.test(s) ? ".+" : /^\[[^\]]+\]$/.test(s) ? "[^/?#]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/") +
      "$",
  );

// ---- medición dentro de la página (viaja sola al navegador: no cierra sobre nada) ----
function medirEnPagina({ ancho, dedo }) {
  const html = document.documentElement;
  const cw = html.clientWidth;
  const INTERACTIVO = "button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=checkbox],[role=radio],[role=tab],[role=combobox],[role=option],summary";
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"],[hidden],[inert],[data-state="closed"],[data-fuera-de-pantalla],nextjs-portal')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const describir = (el) => {
    const etq = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder");
    const clases = String(el.className?.baseVal ?? el.className ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(".");
    const texto = (etq || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const guia = el.closest("[data-guia]")?.getAttribute("data-guia");
    return `${el.tagName.toLowerCase()}${clases ? "." + clases : ""}${texto ? ` «${texto}»` : ""}${guia ? ` @${guia}` : ""}`;
  };
  const scrollXEnCamino = (el) => {
    for (let n = el.parentElement; n && n !== html; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  };
  const recortadoPor = (el) => {
    for (let n = el.parentElement; n && n !== html && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === "hidden" || cs.overflowX === "clip") return n;
    }
    return null;
  };
  const tieneContenido = (el) => el.matches(INTERACTIVO) || Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim().length > 1);

  // 1) Desborde y recorte: el elemento MÁS EXTERNO que sale de la ventana.
  const desborde = html.scrollWidth > cw + 1;
  const fuera = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (fuera.length >= 12) break;
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (!(r.right > cw + 1 || r.left < -1)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && (r.right <= 0 || r.left >= cw)) continue; // fuera de pantalla por diseño
    if (scrollXEnCamino(el)) continue;
    const padre = el.parentElement;
    const pr = padre?.getBoundingClientRect();
    const padreFuera = padre && padre !== document.body && visible(padre) && pr && (pr.right > cw + 1 || pr.left < -1);
    if (padreFuera) continue;
    // Solo cuenta si lo que sale lleva texto o se toca (un adorno que sobresale no es una falla).
    const conAlgo = tieneContenido(el) || Array.from(el.querySelectorAll("*")).some((h) => visible(h) && tieneContenido(h) && (h.getBoundingClientRect().right > cw + 1 || h.getBoundingClientRect().left < -1));
    if (!conAlgo) continue;
    const corta = recortadoPor(el);
    fuera.push({
      que: describir(el),
      izq: Math.round(r.left),
      der: Math.round(r.right),
      ancho: Math.round(r.width),
      exceso: Math.round(r.right > cw ? r.right - cw : -r.left),
      cortadoPor: corta ? describir(corta).slice(0, 80) : null,
    });
  }

  // 2) Táctil: el área real (con el `::after` de tacto.css y la caja o etiqueta que envuelve al campo).
  const chicos44 = {};
  const chicos24 = {};
  let totalInteractivos = 0;
  for (const e of document.querySelectorAll(INTERACTIVO)) {
    if (!visible(e)) continue;
    const cs = getComputedStyle(e);
    if (cs.pointerEvents === "none") continue;
    totalInteractivos++;
    const r = e.getBoundingClientRect();
    let w = r.width;
    let h = r.height;
    for (const p of [getComputedStyle(e, "::before"), getComputedStyle(e, "::after")]) {
      if (p.content !== "none" && p.position === "absolute" && p.pointerEvents !== "none") {
        w = Math.max(w, parseFloat(p.width) || 0);
        h = Math.max(h, parseFloat(p.height) || 0);
      }
    }
    const caja = e.closest("label, .caja-campo, .buscador, .paso-cantidad, .segmento-cayla")?.getBoundingClientRect();
    if (caja) {
      w = Math.max(w, caja.width);
      h = Math.max(h, caja.height);
    }
    // Un enlace dentro de una frase se exime en WCAG 2.5.8 (excepción «en línea»).
    if (e.tagName === "A" && getComputedStyle(e).display === "inline") continue;
    const min = Math.min(w, h);
    const clave = describir(e).replace(/ «.*$/, "").slice(0, 90);
    if (min < 23.5) (chicos24[clave] ??= { n: 0, ej: `${Math.round(w)}×${Math.round(h)}`, texto: describir(e).match(/«(.*)»/)?.[1] ?? "" }).n++;
    else if (dedo && min < 43.5) (chicos44[clave] ??= { n: 0, ej: `${Math.round(w)}×${Math.round(h)}`, texto: describir(e).match(/«(.*)»/)?.[1] ?? "" }).n++;
  }

  // 3) Zoom de iOS: un campo de texto con letra de menos de 16 px.
  const camposZoom = [];
  if (ancho < 640) {
    for (const e of document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea,select")) {
      if (!visible(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 16) camposZoom.push(`${describir(e).slice(0, 70)} (${fs}px)`);
    }
  }

  // 4) Letra de lectura muy chica (menos de 12 px, sin versalitas): solo se cuenta.
  let letraChica = 0;
  const ejLetraChica = [];
  for (const el of document.body.querySelectorAll("p,span,li,td,dd,div,small")) {
    if (!Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim().length > 3)) continue;
    const cs = getComputedStyle(el);
    if (cs.textTransform === "uppercase" || parseFloat(cs.fontSize) >= 12) continue;
    if (!visible(el) || el.closest("svg,[data-papel],.papel-fijo")) continue;
    letraChica++;
    if (ejLetraChica.length < 4) ejLetraChica.push(`${describir(el).slice(0, 60)} (${cs.fontSize})`);
  }

  // 5) Enlaces para resolver las rutas con [id].
  const enlaces = Array.from(document.querySelectorAll("a[href^='/']"))
    .map((a) => a.getAttribute("href").split(/[?#]/)[0])
    .filter((h, i, arr) => arr.indexOf(h) === i)
    .slice(0, 400);

  const h1 = (document.querySelector("main h1, h1")?.textContent || "").trim().slice(0, 60);
  return { cw, sw: html.scrollWidth, desborde, fuera, chicos44, chicos24, totalInteractivos, camposZoom: camposZoom.slice(0, 8), letraChica, ejLetraChica, enlaces, h1 };
}

// Lo que queda debajo de una barra fija o pegada SIN poder sacarlo de ahí desplazando: arriba del todo, lo que tapa una
// barra de arriba (no se puede subir más); al fondo, lo que tapa una barra de abajo (no se puede bajar más). Lo que pasa
// por detrás de la cabecera a mitad del scroll es lo normal y no cuenta.
function tapadosEnPagina(lado) {
  const INTERACTIVO = "button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=checkbox]";
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  const out = [];
  // El punto tiene que estar dentro de lo que muestran sus contenedores con recorte (una fila que se desplaza de lado
  // esconde sus chips fuera de vista: eso no es «tapado»).
  const aLaVista = (el, x, y) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n);
      if (o.overflowX === "visible" && o.overflowY === "visible") continue;
      const c = n.getBoundingClientRect();
      if (x < c.left || x > c.right || y < c.top || y > c.bottom) return false;
    }
    return true;
  };
  for (const e of document.querySelectorAll(`main ${INTERACTIVO.split(",").join(", main ")}`)) {
    if (out.length >= 8) break;
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
    if (e.closest('[aria-hidden="true"],[hidden],[inert],[data-state="closed"]')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
    if (!aLaVista(e, x, y)) continue;
    const encima = document.elementFromPoint(x, y);
    if (!encima || e === encima || e.contains(encima) || encima.contains(e)) continue;
    // Solo cuenta si lo que tapa es una pieza fija o pegada (una barra, una cabecera), no un hermano que se cruzó.
    let n = encima;
    let fija = null;
    while (n && n !== document.body) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") { fija = n; break; }
      n = n.parentElement;
    }
    if (!fija || fija.contains(e)) continue;
    const rf = fija.getBoundingClientRect();
    // Una barra que FLOTA a unos px del borde (la isla de abajo a 12 px, el dock de Finanzas a 16) o que se pega bajo la cabecera (la mesa
    // de Finanzas, a 60 px) sigue siendo «de abajo» o «de arriba»: se mide solo en su extremo de la página, donde no se puede desplazar más.
    const esDeArriba = rf.top <= 80 && rf.bottom < vh * 0.6;
    const esDeAbajo = rf.bottom >= vh - 40 && rf.top > vh * 0.4;
    if (lado === "arriba" ? !esDeArriba : lado === "abajo" ? !esDeAbajo : esDeArriba || esDeAbajo) continue;
    const texto = (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const clasesFija = String(fija.className?.baseVal ?? fija.className ?? "").split(/\s+/).slice(0, 4).join(".");
    out.push(`${e.tagName.toLowerCase()} «${texto}» bajo ${fija.tagName.toLowerCase()}.${clasesFija}`);
  }
  return out;
}

// ---- sesión: entra una vez con la cuenta del seed y reutiliza las cookies en cada ancho ----
async function estadoDeSesion(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  // Esperar a que React hidrate (como `tema/motor/sesion.mjs`): si se escribe antes, el formulario se envía vacío.
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await p.waitForTimeout(1500);
  await p.locator('input[type="email"]').first().fill(CUENTA.correo);
  await p.locator('input[type="password"]').first().fill(CLAVE_LOCAL);
  await p.locator('button[type="submit"]').first().click();
  try {
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  } catch {
    const dice = (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`barrido: no entró ${CUENTA.correo}: «${dice}». ¿Existe la cuenta? (pnpm --filter web tema:cuentas)`);
  }
  // Las animaciones arrancan apagadas (ADR-0625); se dejan así para medir el diseño quieto.
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

async function medirRuta(ctx, ruta, ancho) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]|favicon|Failed to load resource: the server responded with a status of 404/.test(t)) return;
    // El Supabase local no levanta Realtime: es del entorno, no de la pantalla.
    if (/realtime\/v1\/websocket/.test(t)) return;
    errores.push(`console: ${t.slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errores.push(`http ${r.status()}: ${r.url().replace(BASE, "").slice(0, 120)}`);
  });
  const caso = { ruta, ancho, final: null, estado: null, errores, error: null };
  try {
    const resp = await page.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    caso.estado = resp?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    // El esqueleto de carga se retira cuando llega la pantalla.
    await page.waitForFunction(() => !document.querySelector("[data-esqueleto-pantalla]"), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(600);
    caso.final = new URL(page.url()).pathname;
    const m = await page.evaluate(medirEnPagina, { ancho, dedo: conDedo(ancho) });
    const corte = await page.evaluate(analizarEnPagina, { selectoresClave: SELECTORES_POR_DEFECTO, selectoresExclusion: [], ambito: null, limite: null, tolerancia: 1 });
    // «Arriba del todo» es eso: una página que abre en un ancla (`#y-si`) ya viene desplazada, y lo que pasa bajo la cabecera ahí es lo normal.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const tapadosArriba = await page.evaluate(tapadosEnPagina, "arriba");
    const tapadosAlLado = await page.evaluate(tapadosEnPagina, "lado");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    const tapadosAbajo = [...(await page.evaluate(tapadosEnPagina, "abajo")), ...tapadosAlLado];
    await page.evaluate(() => window.scrollTo(0, 0));
    Object.assign(caso, m, { clipping: corte.clipping.slice(0, 10), tapados: [...new Set([...tapadosArriba, ...tapadosAbajo])] });
    const conFalla = m.desborde || m.fuera.length || corte.clipping.length || caso.tapados.length || errores.length;
    if (CAPTURAS || conFalla) {
      const nombre = `${(ruta === "/" ? "inicio" : ruta.slice(1)).replace(/[/[\]]/g, "_")}-${ancho}.png`;
      await page.screenshot({ path: join(DIR_SALIDA, "capturas", nombre), fullPage: ancho < 1024 });
      caso.captura = `capturas/${nombre}`;
    }
  } catch (e) {
    caso.error = String(e?.message ?? e).split("\n")[0].slice(0, 240);
  } finally {
    await page.close();
  }
  return caso;
}

// ---- corrida ----
const todas = rutasDeLaApp();
// `/global` escribe la cookie de la vista «CAYLA Global» al entrar (ADR-0275): desde ahí, toda pantalla de sede manda a
// «Elige sede». Por eso las rutas de `/global` se miden al final, cuando ya no queda ninguna de sede por medir.
const alFinal = (r) => r === "/global" || r.startsWith("/global/");
const estaticas = todas
  .filter((r) => !esDinamica(r))
  .filter((r) => !SOLO_RUTAS || SOLO_RUTAS.includes(r))
  .sort((a, b) => Number(alFinal(a)) - Number(alFinal(b)));
const dinamicas = todas.filter(esDinamica).filter((r) => !SOLO_RUTAS || SOLO_RUTAS.some((s) => patronDe(r).test(s) || s === r));
console.log(`barrido: ${estaticas.length} rutas fijas + ${dinamicas.length} con [id], a ${ANCHOS.join(" · ")} px, cuenta «${CUENTA.clave}» → ${DIR_SALIDA}`);

const navegador = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const estado = await estadoDeSesion(navegador);
const contextos = new Map();
for (const w of ANCHOS) {
  contextos.set(
    w,
    await navegador.newContext({ storageState: estado, viewport: { width: w, height: ALTO_DE[w] ?? 900 }, hasTouch: conDedo(w), isMobile: w < 768 }),
  );
}

const casos = [];
const enlacesVistos = new Set();
const correr = async (ruta) => {
  // El primer ancho compila la ruta en `next dev`; los demás la piden ya compilada.
  const [primero, ...resto] = ANCHOS;
  const res = [await medirRuta(contextos.get(primero), ruta, primero)];
  res.push(...(await Promise.all(resto.map((w) => medirRuta(contextos.get(w), ruta, w)))));
  for (const c of res) {
    for (const e of c.enlaces ?? []) enlacesVistos.add(e);
    delete c.enlaces;
    casos.push(c);
    appendFileSync(ARCHIVO_JSONL, JSON.stringify(c) + "\n");
  }
  const marca = res.map((c) => `${c.ancho}:${c.error ? "ERR" : c.desborde || c.fuera?.length ? "DESB" : c.tapados?.length ? "TAP" : c.errores.length ? "CONS" : "ok"}`).join(" ");
  console.log(`  ${ruta.padEnd(42)} ${marca}${res[0].final && res[0].final !== ruta ? `  → ${res[0].final}` : ""}`);
};

// Una ruta concreta pedida a mano (`--rutas /productos/<uuid>/editar`) que calza con una ruta de [id] se mide tal cual.
const concretas = (SOLO_RUTAS ?? []).filter((s) => !todas.includes(s) && dinamicas.some((r) => patronDe(r).test(s)));
for (const ruta of [...estaticas.filter((r) => !alFinal(r)), ...concretas]) await correr(ruta);
for (const ruta of dinamicas) {
  const patron = patronDe(ruta);
  if (concretas.some((s) => patron.test(s))) continue;
  const real = [...enlacesVistos].find((h) => patron.test(h));
  if (!real) {
    console.log(`  ${ruta.padEnd(42)} sin enlace en las pantallas visitadas: no se midió`);
    casos.push({ ruta, ancho: null, error: "sin enlace para resolver el [id]", errores: [] });
    continue;
  }
  await correr(real);
}

for (const ruta of estaticas.filter(alFinal)) await correr(ruta);

for (const ctx of contextos.values()) await ctx.close();
await navegador.close();

// ---- reporte ----
const fila = (c) => {
  const p = [];
  if (c.error) p.push(`ERROR ${c.error}`);
  if (c.desborde) p.push(`desborde ${c.sw - c.cw}px`);
  if (c.fuera?.length) p.push(`${c.fuera.length} fuera de la ventana`);
  if (c.clipping?.length) p.push(`${c.clipping.length} controles cortados`);
  if (c.tapados?.length) p.push(`${c.tapados.length} tapados`);
  const n24 = Object.values(c.chicos24 ?? {}).reduce((s, x) => s + x.n, 0);
  const n44 = Object.values(c.chicos44 ?? {}).reduce((s, x) => s + x.n, 0);
  if (n24) p.push(`${n24} < 24px`);
  if (n44) p.push(`${n44} < 44px`);
  if (c.camposZoom?.length) p.push(`${c.camposZoom.length} campos < 16px`);
  if (c.errores?.length) p.push(`${c.errores.length} errores de consola`);
  return p.join(" · ");
};
const md = [`# Barrido responsive — ${SELLO}`, "", `Base: ${BASE} · cuenta: ${CUENTA.clave} · anchos: ${ANCHOS.join(", ")}`, ""];
const porRuta = new Map();
for (const c of casos) (porRuta.get(c.ruta) ?? porRuta.set(c.ruta, []).get(c.ruta)).push(c);
for (const [ruta, lista] of porRuta) {
  const conAlgo = lista.filter((c) => fila(c));
  if (!conAlgo.length) continue;
  md.push(`## ${ruta}${lista[0].h1 ? ` — ${lista[0].h1}` : ""}${lista[0].final && lista[0].final !== ruta ? ` (→ ${lista[0].final})` : ""}`);
  for (const c of conAlgo) {
    md.push(`- **${c.ancho ?? "—"} px:** ${fila(c)}${c.captura ? ` ([captura](${c.captura}))` : ""}`);
    for (const f of c.fuera ?? []) md.push(`  - fuera: ${f.que} (der ${f.der}, exceso ${f.exceso}px${f.cortadoPor ? `, cortado por ${f.cortadoPor}` : ""})`);
    for (const t of c.tapados ?? []) md.push(`  - tapado: ${t}`);
    for (const [k, v] of Object.entries(c.chicos24 ?? {}).slice(0, 5)) md.push(`  - < 24px ×${v.n}: ${k} ${v.ej} «${v.texto}»`);
    for (const [k, v] of Object.entries(c.chicos44 ?? {}).sort((a, b) => b[1].n - a[1].n).slice(0, 5)) md.push(`  - < 44px ×${v.n}: ${k} ${v.ej} «${v.texto}»`);
    for (const z of c.camposZoom ?? []) md.push(`  - zoom iOS: ${z}`);
    for (const e of (c.errores ?? []).slice(0, 4)) md.push(`  - ${e}`);
  }
  md.push("");
}
writeFileSync(join(DIR_SALIDA, "reporte.md"), md.join("\n"));
writeFileSync(join(DIR_SALIDA, "reporte.json"), JSON.stringify({ base: BASE, anchos: ANCHOS, cuenta: CUENTA.clave, casos }, null, 1));
const fallas = casos.filter((c) => c.error || c.desborde || c.fuera?.length || c.tapados?.length);
console.log(`\nbarrido: ${casos.length} casos, ${fallas.length} con desborde/recorte/tapado/error → ${join(DIR_SALIDA, "reporte.md")}`);
if (!existsSync(join(DIR_SALIDA, "reporte.md"))) process.exit(2);
