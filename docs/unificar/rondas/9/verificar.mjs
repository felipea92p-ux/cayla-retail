// Verifica la migración de la ronda 9 en el ERP local: fotos de cada pieza migrada, en claro (y en oscuro con `oscuro`).
//   B=http://localhost:3110 node unificar/.salida/elegir-ronda9/verificar.mjs [oscuro] [clave…]   (desde apps/web)
// No guarda nada: abre pantallas, escribe en buscadores, abre listas y hojas, y las cierra.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";

const B = process.env.B ?? "http://localhost:3110";
const args = process.argv.slice(2);
const tema = args.includes("oscuro") ? "oscuro" : "claro";
const pedidas = args.filter((a) => a !== "oscuro");
const AQUI = "unificar/.salida/elegir-ronda9/despues";
mkdirSync(AQUI, { recursive: true });
const esperar = (p, ms) => p.waitForTimeout(ms);
const quieto = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); await esperar(p, 1400); };
const caja = async (loc, aire = 16) => { const c = await loc.boundingBox(); return { x: Math.max(0, c.x - aire), y: Math.max(0, c.y - aire), width: c.width + aire * 2, height: c.height + aire * 2 }; };
const union = (a, b, aire = 16) => { const x = Math.min(a.x, b.x) - aire, y = Math.min(a.y, b.y) - aire; return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x + aire, height: Math.max(a.y + a.height, b.y + b.height) - y + aire }; };

const FOTOS = {
  async llegada(p) {
    await p.goto(B + "/recibir", { waitUntil: "domcontentloaded" }); await quieto(p);
    const campo = p.getByPlaceholder(/Escanea o busca/i).first();
    await campo.click(); await campo.fill("Blusa"); await esperar(p, 1500);
    const lista = p.locator("#llegada-sugerencias");
    return { clip: union(await campo.boundingBox(), await lista.boundingBox()) };
  },
  async recepcion(p) {
    await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" }); await quieto(p);
    await p.locator("main input[type=checkbox], main [role=checkbox]").first().click(); await esperar(p, 1200);
    const campo = p.getByPlaceholder(/Escanea la etiqueta o busca/i).first();
    await campo.click(); await campo.fill("Pantal"); await esperar(p, 1500);
    const lista = p.locator("#recepcion-sugerencias");
    return { clip: union(await campo.boundingBox(), await lista.boundingBox()) };
  },
  async recepcionLineas(p) {
    await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" }); await quieto(p);
    const marcar = p.getByRole("button", { name: /^Marcar las/ }).first();
    const antes = await caja(marcar.locator("xpath=ancestor::div[1]"), 24);
    await p.locator("main input[type=checkbox], main [role=checkbox]").first().click(); await esperar(p, 1500);
    await p.screenshot({ path: `${AQUI}/recepcion-marcar-${tema}.png`, clip: antes });
    const fila = p.locator('[id^="recibir-linea-"]').first();
    return { clip: await caja(fila, 8) };
  },
  async notaCredito(p) {
    await p.goto(B + "/compras/notas-credito", { waitUntil: "domcontentloaded" }); await quieto(p);
    await p.getByRole("button", { name: /Registrar nota/i }).first().click(); await esperar(p, 1600);
    const campo = p.locator('[data-guia="nc-modal.buscador"] input, input[placeholder="Serie-número, proveedor o monto"]').first();
    await campo.click(); await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); await esperar(p, 400);
    return { clip: await caja(p.locator('[data-guia="nc-modal.factura"]').first()) };
  },
  async conteo(p) {
    await p.goto(B + "/ensayo-r9", { waitUntil: "domcontentloaded" }); await quieto(p);
    const art = p.locator("article").first();
    await p.screenshot({ path: `${AQUI}/conteo-abierto-${tema}.png`, clip: await caja(art, 12) });
    const input = art.locator("tbody tr").first().locator("input");
    await input.fill("4"); await input.press("Enter"); await esperar(p, 260);
    return { clip: await caja(art, 12) };
  },
  async frescura(p) {
    await p.goto(B + "/gestion/frescura", { waitUntil: "domcontentloaded" }); await quieto(p);
    const barra = p.locator('[data-guia="frescura.filtros"]').first();
    await p.getByRole("button", { name: /^Estado/ }).first().click(); await esperar(p, 900);
    const lista = p.locator(".lista-flotante").first();
    await p.screenshot({ path: `${AQUI}/frescura-estado-abierto-${tema}.png`, clip: union(await barra.boundingBox(), await lista.boundingBox()) });
    await p.getByRole("option", { name: /^Vigente/ }).first().click(); await esperar(p, 900);
    const titulo = p.locator(".titulo-seccion").first();
    return { clip: union(await barra.boundingBox(), await titulo.boundingBox()) };
  },
  async colores(p) {
    await p.goto(B + "/productos/atributos?tipo=colores", { waitUntil: "domcontentloaded" }); await quieto(p);
    await p.screenshot({ path: `${AQUI}/colores-grupos-${tema}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
    await p.getByRole("button", { name: /^Editar/i }).first().click(); await esperar(p, 1600);
    const pie = p.locator('[data-guia="atributos.color-pie"]').first();
    await pie.scrollIntoViewIfNeeded(); await esperar(p, 400);
    return { clip: await caja(pie) };
  },
  async proveedor(p) {
    await p.goto(B + "/compras/proveedores/a4b6d434-dfac-4084-bb27-4b3c0ac39aeb", { waitUntil: "domcontentloaded" }); await quieto(p);
    await p.getByRole("button", { name: /^Editar/ }).first().click(); await esperar(p, 1600);
    const pie = p.locator('[data-guia="proveedor-modal.pie"]').first();
    return { clip: await caja(pie, 8) };
  },
  async recepcionMarcar(p) {
    await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" }); await quieto(p);
    const marcar = p.getByRole("button", { name: /^Marcar las/ }).first();
    return { clip: await caja(marcar, 60) };
  },
  async pedidos(p) {
    await p.goto(B + "/pedidos-no-atendidos", { waitUntil: "domcontentloaded" }); await quieto(p);
    const t = p.locator(".titulo-seccion").first();
    const c = await t.boundingBox();
    return { clip: { x: c.x - 16, y: c.y - 16, width: c.width + 32, height: c.height + 60 } };
  },
};

const nav = await chromium.launch({ channel: process.env.NAVEGADOR_CANAL || undefined });
const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema, viewport: { width: 1440, height: 900 }, escala: 2 });
for (const [clave, hacer] of Object.entries(FOTOS)) {
  if (pedidas.length && !pedidas.includes(clave)) continue;
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e.message).split("\n")[0]));
  try {
    const r = (await hacer(p)) ?? {};
    await p.screenshot({ path: `${AQUI}/${clave}-${tema}.png`, ...(r.clip ? { clip: r.clip } : {}) });
    console.log("ok", clave, errores.length ? `· errores: ${errores.join(" | ")}` : "");
  } catch (e) {
    await p.screenshot({ path: `${AQUI}/${clave}-${tema}.error.png` }).catch(() => {});
    console.log("FALLA", clave, String(e.message).split("\n")[0], errores.join(" | "));
  }
  await p.close();
}
await nav.close();
