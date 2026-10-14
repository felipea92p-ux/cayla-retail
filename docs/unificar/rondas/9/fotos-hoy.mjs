// Fotos de «Existe hoy» para las seis decisiones abiertas de las rondas 6–8 (ronda 9 de /unificar).
//   B=http://localhost:3110 node unificar/.salida/elegir-ronda9/fotos-hoy.mjs [clave…]   (desde apps/web)
// Cada foto: una ruta, lo que hay que hacer para que la pieza se vea (sin guardar nada) y qué recortar.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto, consultarLocal } from "../../../tema/motor/sesion.mjs";

const B = process.env.B ?? "http://localhost:3110";
const AQUI = "unificar/.salida/elegir-ronda9/img";
mkdirSync(AQUI, { recursive: true });
const esperar = (p, ms) => p.waitForTimeout(ms);
const quieto = async (p) => {
  await p.waitForLoadState("networkidle").catch(() => {});
  await esperar(p, 1200);
};

// Recorta alrededor de un elemento con aire (px CSS) y sin salirse de la página.
async function recorte(p, loc, aire = 16, extra = {}) {
  const c = await loc.boundingBox();
  if (!c) throw new Error("sin caja");
  const x = Math.max(0, c.x - aire), y = Math.max(0, c.y - aire);
  return { x, y, width: c.width + aire * 2 + (extra.ancho ?? 0), height: c.height + aire * 2 + (extra.alto ?? 0) };
}

const FOTOS = {
  // 1 · los tres combos con fotos o pistola
  async llegada(p) {
    await p.goto(B + "/recibir", { waitUntil: "domcontentloaded" });
    await quieto(p);
    const campo = p.getByPlaceholder(/Escanea o busca/i).first();
    await campo.click();
    await campo.fill("Blusa");
    await esperar(p, 1500);
    const lista = p.locator('[role=listbox][aria-label="Prendas que coinciden"]').first();
    await lista.waitFor({ timeout: 8000 });
    const bloque = p.locator("#llegada-prendas, [data-guia='recibir.prendas']").first();
    const a = await bloque.boundingBox(), b = await lista.boundingBox();
    const x = Math.min(a.x, b.x) - 16, y = a.y - 16;
    return { clip: { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x + 16, height: b.y + b.height - y + 16 } };
  },
  async recepcion(p) {
    await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" });
    await quieto(p);
    await p.locator("main input[type=checkbox], main [role=checkbox]").first().click();
    await esperar(p, 1200);
    const campo = p.getByPlaceholder(/Escanea la etiqueta o busca/i).first();
    await campo.click();
    await campo.fill("Pantal");
    await esperar(p, 1500);
    const lista = p.locator('[role=listbox][aria-label="Prendas que coinciden"]').first();
    await lista.waitFor({ timeout: 8000 });
    const a = await campo.boundingBox(), b = await lista.boundingBox();
    const x = Math.min(a.x, b.x) - 120, y = a.y - 70;
    return { clip: { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x + 24, height: b.y + b.height - y + 24 } };
  },
  async notaCredito(p) {
    await p.goto(B + "/compras/notas-credito", { waitUntil: "domcontentloaded" });
    await quieto(p);
    await p.getByRole("button", { name: /Registrar nota/i }).first().click();
    await esperar(p, 1600);
    const sec = p.locator('[data-guia="nc-modal.factura"]').first();
    await sec.waitFor({ timeout: 8000 });
    return { clip: await recorte(p, sec, 16) };
  },
  // 2 · la tabla de Contar
  async conteo(p) {
    const id = consultarLocal("select id from retail.conteos where estado in ('abierto','en_curso','contando') order by created_at desc limit 1") || consultarLocal("select id from retail.conteos order by created_at desc limit 1");
    await p.goto(`${B}/inventario/conteo/${id}`, { waitUntil: "domcontentloaded" });
    await quieto(p);
    const tarjeta = p.locator("article.card-cayla:has(table)").first();
    await tarjeta.waitFor({ timeout: 8000 });
    return { clip: await recorte(p, tarjeta, 12) };
  },
  // 3 · los filtros de Frescura
  async frescura(p) {
    await p.goto(B + "/gestion/frescura", { waitUntil: "domcontentloaded" });
    await quieto(p);
    await p.getByRole("combobox", { name: /^Estado/i }).first().click();
    await esperar(p, 900);
    const barra = p.locator('[data-guia="frescura.filtros"]').first();
    const lista = p.locator("[role=listbox]").first();
    const a = await barra.boundingBox(), b = await lista.boundingBox();
    const x = a.x - 8, y = a.y - 8;
    return { clip: { x, y, width: a.width + 16, height: Math.max(a.y + a.height, b.y + b.height) - y + 16 } };
  },
  async filtroSistema(p) {
    await p.goto(B + "/actividad", { waitUntil: "domcontentloaded" });
    await quieto(p);
    const pild = p.locator(".pildora-filtro-boton").first();
    await pild.click();
    await esperar(p, 900);
    const lista = p.locator("[role=listbox]").first();
    const a = await pild.boundingBox(), b = await lista.boundingBox();
    const x = Math.min(a.x, b.x) - 16, y = a.y - 16;
    return { clip: { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x + 260, height: b.y + b.height - y + 16 } };
  },
  // 4 · «Desactivar color»
  async colores(p) {
    await p.goto(B + "/productos/atributos?tipo=colores", { waitUntil: "domcontentloaded" });
    await quieto(p);
    await p.getByRole("button", { name: /^Editar/i }).first().click();
    await esperar(p, 1600);
    const pie = p.locator('[data-guia="atributos.color-pie"]').first();
    await pie.waitFor({ timeout: 8000 });
    await pie.scrollIntoViewIfNeeded();
    await esperar(p, 500);
    return { clip: await recorte(p, pie, 16) };
  },
  async atrasadas(p) {
    await p.goto(B + "/recibir?vista=factura", { waitUntil: "domcontentloaded" });
    await quieto(p);
    const b = p.getByRole("button", { name: /^Marcar las/ }).first();
    const c = await b.boundingBox();
    return { clip: { x: c.x - 40, y: c.y - 70, width: 480, height: c.height + 110 } };
  },
  async ncCambiar(p) {
    await p.goto(B + "/compras/notas-credito", { waitUntil: "domcontentloaded" });
    await quieto(p);
    await p.getByRole("button", { name: /Registrar nota/i }).first().click();
    await esperar(p, 1600);
    await p.locator("#nc-fb-lista [role=option]").first().click();
    await esperar(p, 1200);
    const sec = p.locator('[data-guia="nc-modal.factura"]').first();
    return { clip: await recorte(p, sec, 16) };
  },
  // 5 · los conteos de los títulos
  async pedidos(p) {
    await p.goto(B + "/pedidos-no-atendidos", { waitUntil: "domcontentloaded" });
    await quieto(p);
    const t = p.locator(".titulo-seccion").first();
    await t.waitFor({ timeout: 8000 });
    const c = await t.boundingBox();
    return { clip: { x: c.x - 16, y: c.y - 16, width: c.width + 32, height: 160 } };
  },
  async apartados(p) {
    await p.goto(B + "/vender/apartados", { waitUntil: "domcontentloaded" });
    await quieto(p);
    return {};
  },
  // 6 · las acciones chicas
  async repartir(p) {
    await p.goto(B + "/compras/nueva", { waitUntil: "domcontentloaded" });
    await quieto(p);
    await p.getByRole("radio", { name: /Repartir entre tiendas/i }).first().click().catch(() => {});
    await esperar(p, 900);
    return {};
  },
};

const pedidas = process.argv.slice(2);
const nav = await chromium.launch({ channel: process.env.NAVEGADOR_CANAL || undefined });
for (const tema of ["claro"]) {
  const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema, viewport: { width: 1440, height: 900 }, escala: 2 });
  for (const [clave, hacer] of Object.entries(FOTOS)) {
    if (pedidas.length && !pedidas.includes(clave)) continue;
    const p = await ctx.newPage();
    try {
      const r = (await hacer(p)) ?? {};
      await p.screenshot({ path: `${AQUI}/${clave}.png`, ...(r.clip ? { clip: r.clip } : { fullPage: false }) });
      console.log("ok", clave);
    } catch (e) {
      await p.screenshot({ path: `${AQUI}/${clave}.error.png` }).catch(() => {});
      console.log("FALLA", clave, String(e.message).split("\n")[0]);
    }
    await p.close();
  }
  await ctx.close();
}
await nav.close();
