// Las mismas pantallas reales con los íconos de HOY y con cada propuesta aplicada EN VIVO (solo cambia el dibujo en la página; no guarda nada).
//   B=http://localhost:<puerto> node unificar/.salida/elegir-ronda15/fotos.mjs   (desde apps/web) → img/<pregunta>-<opcion>-NN-<pantalla>.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import { ESCENARIOS } from "../../../tema/escenarios/registro.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = "unificar/.salida/elegir-ronda15/img";
mkdirSync(OUT, { recursive: true });
// [cuenta, ruta, pie, selector del recorte, alto máximo]
// [cuenta, ruta, pie, selector de lo que se fotografía, ancho mínimo del recorte, alto máximo]
const PANTALLAS = [
  ["admin", "/inventario", "Existencias", 'text=Guardadas en el almacén', 1040, 300],
  ["admin", "/caja", "Caja, la cabecera", '[data-guia="caja.gasto"]', 1040, 200],
  ["admin", "esc:comprobantes.opciones", "Las opciones de un comprobante", '[role="dialog"]', 300, 640],
  ["admin", "/caja", "Caja, el cajón", '[data-guia="caja.cajon"]', 520, 300],
  ["admin", "/vender/comprobantes/proformas", "Proformas", ".kpi-tramos, [data-guia^='proformas']", 1000, 200],
  ["admin", "/inventario/conteo", "Conteos", '[data-guia="conteo.recientes"], [data-guia="conteo.en-curso"]', 700, 320],
  ["terminal-ventas", "/vender", "Vender", "main", 1000, 420],
];
// Lo que se aplica en vivo. Las marcas de una casilla o de un filtro son de su pieza (ronda 6) y no se tocan.
const FUERA = ':is([class*="casilla"], [class*="pildora-filtro"], .vacio-cayla, [class*="aviso-cayla"], aside:not(main aside), header:not(main header), .papel-fijo, [data-papel])';
const TRAZO = (n, fijo = false) => `svg.lucide:not(${FUERA} svg) { stroke-width: ${n}${fijo ? "px" : ""} !important; } ${fijo ? `svg.lucide:not(${FUERA} svg) * { vector-effect: non-scaling-stroke; }` : ""}`;
const OPCIONES = [
  ["trazo", "A", null, null],
  ["trazo", "P1", TRAZO(2), null],
  ["trazo", "P2", TRAZO(1.75), null],
  ["trazo", "P3", TRAZO(1.5, true), null],
  ["tam", "P1", TRAZO(2), "escala"],
];
// La escala de la P1 de tamaño: 12 en una insignia o una etiqueta chica, 14 junto a un texto, 16 en un botón o un campo, 20 junto a un título.
function aplicarEscala(fuera) {
  for (const s of document.querySelectorAll("main svg.lucide, [role=dialog] svg.lucide")) {
    if (s.closest(fuera)) continue;
    const r = s.getBoundingClientRect();
    if (!r.width || r.width > 40) continue;
    const ctl = s.closest("button, a.btn-cayla, [role=button], [role=tab], .caja-cayla, .caja-campo, input + *");
    let t = s.parentElement; while (t && !(t.innerText || "").trim() && t !== document.body) t = t.parentElement;
    const letra = t ? parseFloat(getComputedStyle(t).fontSize) : 14;
    let n;
    if (r.width >= 19) n = 20;
    else if (letra <= 12 && !ctl) n = 12;
    else if (ctl) n = r.width <= 12.5 ? 12 : 16;
    else n = letra >= 18 ? 20 : 14;
    s.setAttribute("width", n); s.setAttribute("height", n); s.style.width = n + "px"; s.style.height = n + "px";
  }
}
const nav = await chromium.launch();
const ctxs = new Map();
const ctxDe = async (c) => { if (!ctxs.has(c)) ctxs.set(c, await abrirContexto(nav, porClave(c), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 }, escala: 2 })); return ctxs.get(c); };
let i = 0;
for (const [cuenta, ruta, pie, sel, minimo, alto] of PANTALLAS) {
  i++;
  const p = await (await ctxDe(cuenta)).newPage();
  try {
    const esc = ruta.startsWith("esc:") ? ESCENARIOS.find((e) => e.id === ruta.slice(4)) : null;
    await p.goto(B + (esc ? esc.ruta.replace(/\[.*?\]/g, "x") : ruta), { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3500);
    if (esc?.preparar) { await esc.preparar(p); await p.waitForTimeout(1500); }
    const el = p.locator(sel).first();
    await el.waitFor({ state: "visible", timeout: 10000 });
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(1500);
    const r = await el.evaluate((nodo, min) => {
      let a = nodo;
      while (a.parentElement && a.getBoundingClientRect().width < min) a = a.parentElement;
      const b = a.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }, minimo);
    const clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(r.width + 24, 1440 - Math.max(0, r.x - 12)), height: Math.min(r.height + 24, alto, 900 - Math.max(0, r.y - 12)) };
    for (const [preg, op, css, js] of OPCIONES) {
      await p.evaluate(() => document.getElementById("r15-css")?.remove());
      if (css) await p.addStyleTag({ content: css }).then((h) => h.evaluate((e) => (e.id = "r15-css")));
      if (js === "escala") await p.evaluate(aplicarEscala, FUERA);
      await p.waitForTimeout(300);
      const nombre = `${preg}-${op}-${String(i).padStart(2, "0")}-${pie.replace(/\s+/g, "_")}.png`;
      await p.screenshot({ path: `${OUT}/${nombre}`, clip });
      console.log("ok", nombre);
    }
  } catch (e) { console.log("FALLA", ruta, String(e.message).split("\n")[0]); }
  await p.close();
}
for (const c of ctxs.values()) await c.close();
await nav.close();
