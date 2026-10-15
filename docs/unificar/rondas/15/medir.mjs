// Mide rápido, sin fotos, cada ícono y cada globito con número que se ve en el ERP (ronda 15). Solo mira.
//   B=http://localhost:3110 CUENTA=admin node unificar/.salida/r15/medir.mjs  (desde apps/web) → unificar/.salida/r15/medida-<cuenta>.json
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import { inventarioDeRutas } from "../../../tema/motor/rutas.mjs";
import { ESCENARIOS } from "../../../tema/escenarios/registro.mjs";
const B = process.env.B ?? "http://localhost:3110";
const CUENTA = process.env.CUENTA ?? "admin";
const nav = await chromium.launch();
const ctx = await abrirContexto(nav, porClave(CUENTA), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const { estaticas } = inventarioDeRutas();
const visitas = [...estaticas.map((r) => ({ ruta: r })), ...(process.env.ESC ? ESCENARIOS.filter((e) => !e.cuentas || e.cuentas.includes(CUENTA)).map((e) => ({ ruta: e.ruta, esc: e })) : [])];
const salida = [];
function medirEnPagina() {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
  const fuera = (el) => !!el.closest("aside, .papel-fijo, [data-papel], [data-color-dato], nextjs-portal, .recharts-wrapper") || (!!el.closest("header") && !el.closest("main") && !el.closest('[role="dialog"]'));
  const zonaDe = (el) => el.closest("[data-guia]")?.getAttribute("data-guia") ?? null;
  const iconos = [];
  for (const svg of document.querySelectorAll("svg")) {
    if (!vis(svg) || fuera(svg)) continue;
    if (svg.parentElement?.closest("svg")) continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.width > 64) continue;
    const c = [...svg.classList].find((x) => x.startsWith("lucide-"));
    const sw = parseFloat(getComputedStyle(svg).strokeWidth) || 0;
    const ctl = svg.closest("button,a[href],[role='button'],[role='tab'],[role='menuitem']");
    // El texto al lado: el del control, o el del padre más cercano que tenga letras.
    let t = svg.parentElement; while (t && !(t.innerText || "").trim() && t !== document.body) t = t.parentElement;
    const fs = t ? parseFloat(getComputedStyle(t).fontSize) : 0;
    iconos.push({
      nombre: c ? c.slice(7) : "propio", tam: Math.round(r.width * 2) / 2, trazo: Math.round(sw * 100) / 100, trazoPx: Math.round(((sw * r.width) / 24) * 100) / 100,
      en: ctl ? (ctl.classList.contains("btn-cayla") ? "btn-cayla" : ctl.tagName.toLowerCase()) : "texto", letra: Math.round(fs * 2) / 2,
      clases: (svg.getAttribute("class") || "").replace(/lucide(-\S+)?/g, "").trim().slice(0, 80), padre: (svg.parentElement?.getAttribute("class") || "").slice(0, 80), zona: zonaDe(svg),
    });
  }
  const globos = [];
  for (const el of document.querySelectorAll("span,div,b,small,i,em,strong")) {
    if (el.children.length > 2 || !vis(el) || fuera(el)) continue;
    const txt = (el.innerText || "").trim();
    if (!/^(\d{1,3}|99\+|\+\d{1,2})$/.test(txt)) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    const rad = parseFloat(s.borderTopLeftRadius) || 0;
    const fondo = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
    if (r.height < 12 || r.height > 32 || r.width > 56 || rad < r.height / 2 - 1 || (!fondo && s.borderTopWidth === "0px")) continue;
    // El de adentro de otro globito no cuenta dos veces.
    if (el.parentElement && globos.some((g) => g._el === el.parentElement)) continue;
    globos.push({ _el: el, alto: Math.round(r.height), ancho: Math.round(r.width), fondo: s.backgroundColor, color: s.color, borde: s.borderTopWidth !== "0px" ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : "no", letra: parseFloat(s.fontSize), peso: s.fontWeight, posicion: s.position, clases: (el.getAttribute("class") || "").slice(0, 160), zona: zonaDe(el), txt });
  }
  return { iconos, globos: globos.map(({ _el, ...g }) => g) };
}
let i = 0;
for (const v of visitas) {
  i++;
  try {
    for (let intento = 0; ; intento++) {
      try { await p.goto(B + v.ruta.replace(/\[.*?\]/g, "x"), { waitUntil: "domcontentloaded", timeout: 60000 }); break; }
      catch (e) {
        if (!/ERR_CONNECTION_REFUSED/.test(String(e)) || intento > 40) throw e;
        if (intento === 0) console.log("SERVIDOR CAÍDO en", v.ruta);
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200);
    if (v.esc?.preparar) { await v.esc.preparar(p).catch(() => {}); await p.waitForTimeout(1500); }
    const m = await p.evaluate(medirEnPagina);
    salida.push({ ruta: v.ruta, esc: v.esc?.id ?? null, ...m });
    if (i % 10 === 0) { console.log(i, "/", visitas.length, v.ruta); writeFileSync(`unificar/.salida/r15/medida-${CUENTA}${process.env.ESC ? "-esc" : ""}.json`, JSON.stringify(salida)); }
  } catch (e) { console.log("FALLA", v.ruta, String(e.message).split("\n")[0]); }
}
writeFileSync(`unificar/.salida/r15/medida-${CUENTA}${process.env.ESC ? "-esc" : ""}.json`, JSON.stringify(salida));
console.log("listo", salida.length);
await ctx.close(); await nav.close();
