// Fotos de la cabecera de cada pantalla migrada (solo lectura). Uso: node unificar/.salida/cabeceras-censo/fotos.mjs [oscuro] [ancho]
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const tema = process.argv[2] === "oscuro" ? "oscuro" : "claro";
const ancho = Number(process.argv[3] ?? 1440);
const OUT = "unificar/.salida/cabeceras-censo/fotos";
const R = [
  ["inicio", "/", "admin"], ["compras", "/compras", "admin"], ["por-pagar", "/compras/por-pagar", "admin"], ["proveedores", "/compras/proveedores", "admin"],
  ["proveedor", "/compras/proveedores/a4b6d434-dfac-4084-bb27-4b3c0ac39aeb", "admin"], ["factura", "/compras/factura/091b7f99-c95b-424e-b5fc-18d30fe19d6c", "admin"],
  ["nueva", "/compras/nueva", "admin"], ["notas", "/compras/notas-credito", "admin"], ["recibir", "/recibir", "admin"], ["recibir-fac", "/recibir?vista=factura", "admin"],
  ["categorias", "/productos/categorias", "admin"], ["atributos", "/productos/atributos", "admin"], ["familias", "/productos/familias", "admin"],
  ["editar", "/productos/a5d078dd-9f03-4525-98af-e2f98ccf0ead/editar", "admin"], ["etiquetas", "/etiquetas-de-precio?producto=a5d078dd-9f03-4525-98af-e2f98ccf0ead", "admin"],
  ["configuracion", "/configuracion", "admin"], ["rendimiento", "/rendimiento", "admin"], ["actividad", "/actividad", "admin"],
  ["comercial", "/comercial", "admin"], ["calidad", "/comercial/calidad", "admin"], ["buscar", "/buscar?q=blusa", "admin"],
  ["caja", "/caja", "admin"], ["inicio-int", "/", "integrante"],
  ["prod-resumen", "/produccion", "admin-taller"], ["prod-eficiencia", "/produccion/eficiencia", "admin-taller"], ["prod-ordenes", "/produccion/ordenes", "admin-taller"],
  ["prod-insumos", "/produccion/insumos", "admin-taller"], ["prod-facturas", "/produccion/comprobantes", "admin-taller"], ["prod-por-pagar", "/produccion/por-pagar", "admin-taller"],
  ["prod-proveedores", "/produccion/proveedores", "admin-taller"], ["prod-recibir", "/produccion/recibir", "admin-taller"],
].filter(([id]) => !process.env.SOLO || process.env.SOLO.split(",").includes(id));
const nav = await chromium.launch();
const ctxs = {};
const ctx = async (c) => (ctxs[c] ??= await abrirContexto(nav, porClave(c), { baseUrl: B, tema, viewport: { width: ancho, height: 900 }, escala: 1 }));
for (const [id, ruta, cuenta] of R) {
  const p = await (await ctx(cuenta)).newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(1600);
    const info = await p.evaluate(() => {
      const h1 = document.querySelector("main h1");
      const head = h1?.closest('[data-voz="cabecera"]');
      const r = (head ?? document.querySelector("main")).getBoundingClientRect();
      const main = document.querySelector("main").getBoundingClientRect();
      return { y: Math.max(0, r.top - 24 + scrollY), h: Math.min(520, r.height + 120), x: main.x, w: main.width, ep: !!h1?.className.includes("46px"), t: h1?.textContent?.slice(0, 40), sobre: document.documentElement.scrollWidth > innerWidth };
    });
    await p.screenshot({ path: `${OUT}/${id}-${tema}-${ancho}.png`, clip: { x: info.x, y: info.y, width: info.w, height: info.h } });
    console.log(id, info.ep ? "EP" : "OTRA", info.t, info.sobre ? "DESBORDA" : "");
  } catch (e) { console.log("FALLA", id, String(e.message).split("\n")[0]); }
  await p.close();
}
await nav.close();
