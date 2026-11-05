// Ronda 19: censo del TEXTO del ERP. Por cada ruta estática, cada bloque de texto del <main> (no el marco): tamaño de letra,
// palabras, tono y qué pieza lo dibuja. Salida: texto.json. Desde apps/web:  node unificar/.salida/texto-ronda19/medir.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { porClave, inicioDe } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import { inventarioDeRutas } from "../../../tema/motor/rutas.mjs";

const B = process.env.B ?? "http://localhost:3110";
const { estaticas } = inventarioDeRutas();
const rutas = process.env.RUTAS ? process.env.RUTAS.split(",") : estaticas.filter((r) => !/^\/(login|sin-|api|imprimir)|\/imprimir/.test(r));
const CUENTA = process.env.CUENTA ?? "admin";
const nav = await chromium.launch();
const ctx = await abrirContexto(nav, porClave(CUENTA), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } });
const salida = [];
let i = 0;
for (const r of rutas) {
  const ruta = r === "/" ? inicioDe(porClave("admin")) : r;
  const p = await ctx.newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(700);
    const bloques = await p.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return [];
      const vistos = new Set();
      const out = [];
      const esBloque = (el) => !["inline", "inline-block", "contents"].includes(getComputedStyle(el).display) || el.matches("p,li,td,th,label,dd,dt,h1,h2,h3,h4,figcaption,small");
      const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (!/[A-Za-zÁÉÍÓÚáéíóúñ]{2}/.test(n.textContent)) continue;
        let el = n.parentElement;
        if (!el || el.closest("script,style,svg,[aria-hidden=true],[hidden]")) continue;
        while (el && el !== main && !esBloque(el)) el = el.parentElement;
        if (!el || vistos.has(el)) continue;
        vistos.add(el);
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
        const texto = (el.innerText || "").replace(/\s+/g, " ").trim();
        const palabras = texto ? texto.split(" ").length : 0;
        if (!palabras) continue;
        const cerca = (sel) => !!el.closest(sel);
        const cadena = [];
        for (let a = el, k = 0; a && a !== main && k < 4; a = a.parentElement, k++) cadena.push(a.tagName.toLowerCase() + (a.className && typeof a.className === "string" ? "." + a.className.trim().split(/\s+/).slice(0, 6).join(".") : ""));
        out.push({
          tag: el.tagName.toLowerCase(),
          px: parseFloat(cs.fontSize),
          peso: cs.fontWeight,
          mayus: cs.textTransform === "uppercase",
          color: cs.color,
          palabras,
          texto: texto.slice(0, 220),
          y: Math.round(r.top + scrollY),
          cadena,
          en: {
            cabecera: cerca('header[data-voz="cabecera"]'),
            nota: cerca(".nota-cayla"),
            aviso: cerca('[role=alert],[data-aviso],.aviso-cayla'),
            tabla: cerca("table,[role=table],.fila-cayla,.encabezado-tabla-cayla"),
            boton: cerca("button,a,[role=button],[role=tab]"),
            campo: cerca("label,.campo-etiqueta,input,textarea"),
            cifra: cerca("[data-cifra],.tarjeta-cifra"),
            vacio: cerca("[data-vacio]"),
            guia: el.closest("[data-guia]")?.getAttribute("data-guia") ?? null,
          },
        });
      }
      const ayudas = main.querySelectorAll('button[aria-label*="yuda"], [data-ayuda], .ayuda-boton').length;
      return { bloques: out, ayudas };
    });
    salida.push({ ruta, ...bloques });
    console.log(`${++i}/${rutas.length} ${ruta} ${bloques.bloques?.length ?? 0}`);
  } catch (e) {
    console.log(`✗ ${ruta} ${e.message.split("\n")[0]}`);
  } finally {
    await p.close();
  }
}
await nav.close();
writeFileSync(new URL(process.env.SALIDA ?? "./texto.json", import.meta.url), JSON.stringify(salida));
