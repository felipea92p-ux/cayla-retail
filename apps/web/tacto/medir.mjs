#!/usr/bin/env node
/**
 * Mide, en local y como un celular de verdad (375 px, pantalla táctil), qué se puede tocar en menos de 44 px (ADR-0611, mejora 5).
 * Cuenta el área real: el `::after` que agranda un ícono y la `<label>` que envuelve a un control. Solo informa; lo que encuentre se arregla en
 * `app/estilos/tacto.css`.
 *
 *   pnpm --filter web tacto:medir -- [--base-url http://localhost:3010] [/vender,/cambios]
 *
 * Entra con la cuenta del seed (datos inventados). Se niega a correr fuera de localhost.
 */
import { chromium } from "playwright";

const args = process.argv.slice(2).filter((a) => a !== "--");
const i = args.indexOf("--base-url");
const BASE = i >= 0 ? args.splice(i, 2)[1] : "http://localhost:3010";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Solo corre contra localhost.");
const RUTAS = args[0] ? args[0].split(",") : ["/vender", "/cambios", "/devoluciones", "/caja", "/inventario", "/finanzas/gastos", "/clientas", "/recibir"];
const MINIMO = 44;

const medir = (page) =>
  page.evaluate((minimo) => {
    const SELECTOR = "button,a[href],input:not([type=hidden]),textarea,[role=button],[role=switch],[role=checkbox],[role=radio],[role=tab],[role=combobox],[role=option],summary";
    const out = {};
    for (const e of document.querySelectorAll(SELECTOR)) {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      if (!r.width || !r.height || c.visibility === "hidden" || c.pointerEvents === "none" || e.closest("[aria-hidden=true],[hidden],nextjs-portal")) continue;
      let w = r.width;
      let h = r.height;
      for (const p of [getComputedStyle(e, "::before"), getComputedStyle(e, "::after")]) {
        if (p.content !== "none" && p.position === "absolute" && p.pointerEvents !== "none") {
          w = Math.max(w, parseFloat(p.width) || 0);
          h = Math.max(h, parseFloat(p.height) || 0);
        }
      }
      // Tocar la caja o la etiqueta de un campo también lo enfoca.
      const caja = e.closest("label, .caja-campo, .buscador, .paso-cantidad, .segmento-cayla")?.getBoundingClientRect();
      if (caja) {
        w = Math.max(w, caja.width);
        h = Math.max(h, caja.height);
      }
      if (Math.min(w, h) >= minimo - 0.5) continue;
      const clases = String(e.className?.baseVal ?? e.className ?? "").split(/\s+/).filter((x) => /^[a-z]+-[a-z-]+$/.test(x) && !/^(text|font|rounded|border|bg|hover|transition|items|justify|place)-/.test(x)).slice(0, 2).join(".");
      const clave = `${e.tagName.toLowerCase()}${e.getAttribute("role") ? `[${e.getAttribute("role")}]` : ""}.${clases}`;
      (out[clave] ??= { n: 0, ej: `${Math.round(w)}×${Math.round(h)}`, texto: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 28) }).n++;
    }
    return out;
  }, MINIMO);

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const page = await contexto.newPage();
await page.goto(`${BASE}/login`);
await page.locator("input[type=email], input[name=email]").first().fill("felipe@cayla.local");
await page.locator("input[type=password]").first().fill("cayla-local");
await page.keyboard.press("Enter");
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

const total = {};
for (const ruta of RUTAS) {
  await page.goto(BASE + ruta);
  await page.waitForTimeout(2200);
  for (const [k, v] of Object.entries(await medir(page))) {
    (total[k] ??= { ...v, n: 0, en: new Set() }).n += v.n;
    total[k].en.add(ruta);
  }
}
await navegador.close();

const filas = Object.entries(total).sort((a, b) => b[1].n - a[1].n);
if (!filas.length) console.log(`Todo se toca en ${MINIMO} px o más en: ${RUTAS.join(", ")}.`);
for (const [k, v] of filas) console.log(String(v.n).padStart(4), v.ej.padEnd(8), k.slice(0, 44).padEnd(46), `«${v.texto}»`, [...v.en].slice(0, 3).join(", "));
