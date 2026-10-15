// Qué cabecera dibuja cada pantalla (solo lectura). Uso: node unificar/.salida/cabeceras-censo/censo.mjs
import { chromium } from "playwright";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const rutas = [];
const recorrer = (d, pre) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n.startsWith("@") || n.startsWith("[") || n.startsWith("(.)")) continue; const seg = n.startsWith("(") ? "" : "/" + n; recorrer(p, pre + seg); } else if (n === "page.tsx") rutas.push(pre || "/"); } };
recorrer("app/(app)", "");
const nav = await chromium.launch();
const ctxs = {};
const ctx = async (c) => (ctxs[c] ??= await abrirContexto(nav, porClave(c), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 }, escala: 1 }));
for (const r of rutas.sort().filter((x) => !["/global/elige-sede", "/global", "/sin-acceso", "/"].includes(x) && (process.env.SOLO ? process.env.SOLO.split(",").some((s) => x.startsWith(s)) : true) && !x.startsWith("/finanzas"))) {
  const cuenta = r.startsWith("/produccion") || r.startsWith("/ordenes-insumos") ? "admin-taller" : "admin";
  const p = await (await ctx(cuenta)).newPage();
  try {
    await p.goto(B + r, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(800);
    const info = await p.evaluate(() => {
      const main = document.querySelector("main"); if (!main) return { tipo: "sin-main" };
      const h1 = main.querySelector("h1"); if (!h1) return { tipo: "sin-h1" };
      const cls = h1.className || "";
      const header = h1.closest('[data-voz="cabecera"]');
      let tipo = "otra";
      if (cls.includes("sm:text-[46px]")) tipo = "EncabezadoPagina";
      else if (cls.includes("text-[30px]") && h1.previousElementSibling?.classList.contains("eyebrow-cayla")) tipo = "CabeceraPantalla";
      const sobre = h1.previousElementSibling?.textContent?.trim().slice(0, 40) ?? "";
      return { tipo, titulo: h1.textContent.trim().slice(0, 40), cls: cls.slice(0, 70), sobre, dataVoz: !!header, url: location.pathname };
    });
    console.log([r, info.tipo, info.titulo, info.sobre, info.dataVoz ? "voz" : "", info.url !== r ? "→" + info.url : "", info.tipo === "otra" ? info.cls : ""].join(" | "));
  } catch (e) { console.log(r, "FALLA", String(e.message).split("\n")[0]); }
  await p.close();
}
await nav.close();
