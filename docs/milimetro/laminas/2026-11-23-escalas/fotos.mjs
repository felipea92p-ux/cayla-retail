// Lámina de escalas (2026-11-23): fotos de pantallas REALES del ERP local con cada opción puesta encima, y el contraste medido de
// cada una con `.claude/skills/color/referencia/medir.js`. No guarda nada: solo abre pantallas y les agrega una hoja de estilo.
//
// Uso (desde apps/web, con el ERP local en marcha y una base con las cuentas del seed):
//   mkdir -p unificar/.salida/escalas-2026-11 && cp ../../docs/milimetro/laminas/2026-11-23-escalas/* unificar/.salida/escalas-2026-11/
//   B=http://localhost:3010 TEMA_DB_CONTENEDOR=supabase_db_cayla-retail-prod node unificar/.salida/escalas-2026-11/fotos.mjs
// Sale a unificar/.salida/escalas-2026-11/img/ (fuera de git: las fotos llevan datos de la base local) y medidas.json.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const B = process.env.B ?? "http://localhost:3010";
const IMG = join(AQUI, "img");
mkdirSync(IMG, { recursive: true });
const css = (f) => (f ? readFileSync(join(AQUI, f), "utf8") : "");
const MEDIR = readFileSync(join(AQUI, "../../../../../.claude/skills/color/referencia/medir.js"), "utf8");
// Lo que no es de la pantalla: la oferta de la guía y el botón de Next en desarrollo.
const LIMPIAR = ".guia-oferta{display:none!important} nextjs-portal{display:none!important}";

const PANTALLAS = [
  // `vista`: el recorte que va en la tarjeta, donde vive el texto que acompaña (la foto entera se abre con «Ver grande»).
  { id: "compras", ruta: "/compras", nombre: "Historial de compras", vista: { x: 292, y: 555, width: 1108, height: 345 } },
  { id: "movimientos", ruta: "/inventario/movimientos", nombre: "Movimientos", vista: { x: 292, y: 400, width: 810, height: 460 } },
  { id: "ventas", ruta: "/vender/historial", nombre: "Historial de ventas", vista: { x: 292, y: 440, width: 1108, height: 420 } },
];
const TEXTO = [
  { id: "A", archivo: null },
  { id: "B", archivo: "texto-b.css" },
  { id: "C", archivo: "texto-c.css" },
];
const CIFRAS = [
  { id: "A", archivo: null },
  { id: "B", archivo: "cifras-b.css" },
];

async function abrir(p, ruta, hoja) {
  await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1800);
  await p.addStyleTag({ content: LIMPIAR });
  // Las cifras que PIDEN alinear (`tabular-nums`, por clase o heredado) y están en DM Sans: las que toca la opción de Inter. Solo un
  // elemento que es SOLO una cifra (monto, fecha, cantidad: dígitos, «S/», puntos, comas, «%»); un texto con letras («Contado»,
  // «RUC 2049…») queda en DM Sans, porque `tabular-nums` se hereda y marcaría filas enteras. Las de Garamond ya alinean.
  await p.evaluate(() => {
    const SOLO_CIFRA = /^[\sS\/\d.,:%+\-−·]+$/;
    for (const el of document.querySelectorAll("main *")) {
      const t = el.textContent.trim();
      if (!t || t.length > 20 || !/\d/.test(t) || !SOLO_CIFRA.test(t)) continue;
      const s = getComputedStyle(el);
      if (s.fontVariantNumeric.includes("tabular-nums") && !/garamond/i.test(s.fontFamily)) el.dataset.cifraSans = "";
    }
  });
  if (hoja) await p.addStyleTag({ content: hoja });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
}

const medidas = { texto: {}, cifras: {} };
const nav = await chromium.launch();

// 1 · El tono del texto: tres opciones × tres pantallas × claro y oscuro, a 1440 × 900.
for (const tema of ["claro", "oscuro"]) {
  const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema, viewport: { width: 1440, height: 900 }, escala: 1 });
  const p = await ctx.newPage();
  for (const pan of PANTALLAS) {
    for (const op of TEXTO) {
      try {
        await abrir(p, pan.ruta, css(op.archivo));
        const archivo = `texto-${op.id}-${pan.id}-${tema}.png`;
        await p.screenshot({ path: join(IMG, archivo) });
        await p.screenshot({ path: join(IMG, archivo.replace(".png", "-vista.png")), clip: pan.vista });
        const m = await p.evaluate(MEDIR);
        (medidas.texto[op.id] ??= []).push({ pantalla: pan.id, tema, archivo, ...m.resumen, peores: (m.texto ?? []).slice(0, 4).map((t) => `${t.ratio}:1 ${t.donde}`) });
        console.log("texto", op.id, pan.id, tema, `medidos ${m.resumen?.textosMedidos} · fallan ${m.resumen?.textoFalla} · APCA débil ${m.resumen?.apcaDebil}`);
      } catch (e) { console.log("✗ texto", op.id, pan.id, tema, e.message.split("\n")[0]); }
    }
  }
  await ctx.close();
}

// 2 · Las cifras: las dos pantallas con más cifras en DM Sans a la vista (medido el 2026-11-23: Proveedores 21, Existencias 18),
// de cerca (escala 2), en claro. La foto entera y un recorte de la parte de abajo, donde están las cifras.
const PANTALLAS_CIFRAS = [
  { id: "proveedores", ruta: "/compras/proveedores", nombre: "Proveedores" },
  { id: "existencias", ruta: "/inventario", nombre: "Existencias" },
];
const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 }, escala: 2 });
const p = await ctx.newPage();
for (const pan of PANTALLAS_CIFRAS) {
  for (const op of CIFRAS) {
    try {
      await abrir(p, pan.ruta, css(op.archivo));
      const archivo = `cifras-${op.id}-${pan.id}.png`;
      await p.screenshot({ path: join(IMG, archivo) });
      // El recorte: la caja que encierra las cifras marcadas que están a la vista, con 24 px de aire.
      const caja = await p.evaluate(() => {
        const rs = [...document.querySelectorAll("main [data-cifra-sans]")].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.top < innerHeight && r.bottom > 0);
        if (!rs.length) return null;
        const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - 240), y = Math.max(0, Math.min(...rs.map((r) => r.top)) - 24);
        return { x, y, width: Math.min(innerWidth - x, Math.max(...rs.map((r) => r.right)) - x + 24), height: Math.min(innerHeight - y, Math.max(...rs.map((r) => r.bottom)) - y + 24) };
      });
      if (caja) await p.screenshot({ path: join(IMG, archivo.replace(".png", "-vista.png")), clip: caja });
      // ¿Alinean de verdad? Cuántas cifras se marcaron y, entre las que tienen el mismo largo, cuántos anchos distintos hay
      // (con cifras tabulares, un solo ancho por largo; con proporcionales, varios).
      const alinea = await p.evaluate(() => {
        const g = {};
        const marcadas = document.querySelectorAll("main [data-cifra-sans]");
        for (const el of marcadas) {
          const t = el.textContent.trim();
          (g[t.length] ??= new Set()).add(Math.round(el.getBoundingClientRect().width * 10) / 10);
        }
        return { marcadas: marcadas.length, anchosPorLargo: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v]])) };
      });
      (medidas.cifras[op.id] ??= []).push({ pantalla: pan.id, archivo, ...alinea, familia: await p.evaluate(() => { const e = document.querySelector("main [data-cifra-sans]"); return e ? getComputedStyle(e).fontFamily.slice(0, 40) : null; }) });
      console.log("cifras", op.id, pan.id, JSON.stringify(alinea).slice(0, 160));
    } catch (e) { console.log("✗ cifras", op.id, pan.id, e.message.split("\n")[0]); }
  }
}
await ctx.close();
await nav.close();
writeFileSync(join(AQUI, "medidas.json"), JSON.stringify(medidas, null, 1));
console.log("listo:", IMG);
