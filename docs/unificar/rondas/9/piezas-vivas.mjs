// Copia el HTML REAL de las piezas del ERP (outerHTML ya dibujado) para que las demos de la ronda 9 sean idénticas a la app.
//   B=http://localhost:3110 node unificar/.salida/elegir-ronda9/piezas-vivas.mjs   (desde apps/web) → vivas.json
// No guarda nada: abre pantallas, escribe en buscadores y abre listas.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";

const B = process.env.B ?? "http://localhost:3110";
const esperar = (p, ms) => p.waitForTimeout(ms);
const quieto = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); await esperar(p, 1200); };
// outerHTML sin estilos en línea de posición (las listas flotantes vienen con `position: fixed; top…`)
const html = (loc) => loc.evaluate((el) => {
  const c = el.cloneNode(true);
  for (const n of [c, ...c.querySelectorAll("[style]")]) {
    const s = n.getAttribute?.("style");
    if (s && /position|top|left|width|max-height/.test(s)) n.setAttribute("style", s.replace(/(position|top|left|right|bottom|width|min-width|max-width|max-height)\s*:[^;]+;?/g, "").trim());
  }
  c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  return c.outerHTML;
});

const salida = {};
const nav = await chromium.launch({ channel: process.env.NAVEGADOR_CANAL || undefined });
const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const paso = async (nombre, fn) => { try { await fn(); console.log("ok", nombre); } catch (e) { console.log("FALLA", nombre, String(e.message).split("\n")[0]); } };

await paso("llegada", async () => {
  await p.goto(B + "/recibir", { waitUntil: "domcontentloaded" }); await quieto(p);
  const campo = p.getByPlaceholder(/Escanea o busca/i).first();
  await campo.click(); await campo.fill("Blusa"); await esperar(p, 1500);
  salida.llegadaBuscador = await html(campo.locator("xpath=ancestor::div[contains(@class,'relative')][1]"));
  salida.llegadaLista = await html(p.locator('[role=listbox][aria-label="Prendas que coinciden"]').first());
});
await paso("recepcion", async () => {
  await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" }); await quieto(p);
  await p.locator("main input[type=checkbox], main [role=checkbox]").first().click(); await esperar(p, 1200);
  const campo = p.getByPlaceholder(/Escanea la etiqueta o busca/i).first();
  await campo.click(); await campo.fill("Pantal"); await esperar(p, 1500);
  salida.recepcionCaja = await html(campo.locator("xpath=ancestor::div[contains(@class,'relative')][1]"));
  // una miniatura de prenda real (MiniaturaPrenda) de las líneas del envío
  salida.miniatura = await html(p.locator("main [data-color-dato]").first());
  salida.miniaturas = await p.locator("main [data-color-dato]").evaluateAll((els) => els.slice(0, 6).map((e) => e.outerHTML));
});
await paso("notaCredito", async () => {
  await p.goto(B + "/compras/notas-credito", { waitUntil: "domcontentloaded" }); await quieto(p);
  await p.getByRole("button", { name: /Registrar nota/i }).first().click(); await esperar(p, 1600);
  salida.ncSeccion = await html(p.locator('[data-guia="nc-modal.factura"]').first());
  await p.keyboard.press("Escape"); await esperar(p, 600);
});
await paso("frescura", async () => {
  await p.goto(B + "/gestion/frescura", { waitUntil: "domcontentloaded" }); await quieto(p);
  salida.frescuraBarra = await html(p.locator('[data-guia="frescura.filtros"]').first());
  salida.titulo = await html(p.locator(".titulo-seccion").first());
  await p.getByRole("combobox", { name: /^Estado/i }).first().click(); await esperar(p, 900);
  salida.frescuraListaEstado = await html(p.locator(".lista-flotante").first());
});
await paso("pildora", async () => {
  await p.goto(B + "/actividad", { waitUntil: "domcontentloaded" }); await quieto(p);
  salida.pildora = await html(p.locator(".pildora-filtro").first());
  salida.pildoraPuesta = await p.locator(".pildora-filtro[data-puesta]").first().evaluate((e) => e.outerHTML).catch(() => null);
  await p.locator(".pildora-filtro-boton").first().click(); await esperar(p, 900);
  salida.pildoraLista = await html(p.locator(".lista-flotante").first());
});
await paso("colores", async () => {
  await p.goto(B + "/productos/atributos?tipo=colores", { waitUntil: "domcontentloaded" }); await quieto(p);
  await p.getByRole("button", { name: /^Editar/i }).first().click(); await esperar(p, 1600);
  salida.coloresPie = await html(p.locator('[data-guia="atributos.color-pie"]').first());
  await p.keyboard.press("Escape"); await esperar(p, 600);
});
await paso("categorias", async () => {
  await p.goto(B + "/productos/atributos?tipo=categorias", { waitUntil: "domcontentloaded" }); await quieto(p);
  await p.getByRole("button", { name: /^Editar/i }).first().click(); await esperar(p, 1600);
  salida.categoriasPie = await html(p.locator('[data-guia="categorias.form-pie"]').first());
});
await paso("tabla", async () => {
  await p.goto(B + "/compras/proveedores", { waitUntil: "domcontentloaded" }); await quieto(p);
  salida.tabla = await html(p.locator(".card-cayla:has(.fila-cayla)").first());
});
await paso("atrasadas", async () => {
  await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" }); await quieto(p);
  salida.atrasadas = await html(p.getByRole("button", { name: /^Marcar las/ }).first());
  salida.enlaceVer = await p.locator(".enlace-ver").first().evaluate((e) => e.outerHTML).catch(() => null);
});
await paso("enlaceVer", async () => {
  if (salida.enlaceVer) return;
  await p.goto(B + "/compras", { waitUntil: "domcontentloaded" }); await quieto(p);
  salida.enlaceVer = await p.locator(".enlace-ver").first().evaluate((e) => e.outerHTML);
});
writeFileSync("unificar/.salida/elegir-ronda9/vivas.json", JSON.stringify(salida, null, 1));
console.log(Object.fromEntries(Object.entries(salida).map(([k, v]) => [k, v ? (Array.isArray(v) ? v.length : v.length) : 0])));
await nav.close();
