// Fotos de «Copiar» después de migrar: la barra de Productos y las cuentas de la ficha de un proveedor (con un clic en copiar).
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = "unificar/.salida/elegir-ronda13/despues";
const nav = await chromium.launch();
const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
const p = await ctx.newPage();
await p.goto(B + "/productos", { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(2500);
const b = p.locator(".copiar-boton").first(); await b.scrollIntoViewIfNeeded();
let r = await b.evaluate((n) => { const a = n.parentElement.getBoundingClientRect(); return { x: a.x, y: a.y, width: a.width, height: a.height }; });
await p.screenshot({ path: `${OUT}/copiar-01-Productos.png`, clip: { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: Math.min(900, r.width + 40), height: r.height + 40 } });
await b.click(); await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/copiar-02-Productos-copiado.png`, clip: { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: Math.min(900, r.width + 40), height: r.height + 40 } });
await p.goto(B + "/compras/proveedores", { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(2000);
const hrefs = await p.$$eval('a[href^="/compras/proveedores/"]', (as) => as.map((a) => a.getAttribute("href")).filter((h) => /\/compras\/proveedores\/[0-9a-f-]{36}$/.test(h)));
for (const h of hrefs.slice(0, 8)) {
  await p.goto(B + h, { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(2000);
  const ic = p.locator(".copiar-icono").first();
  if (!(await ic.count())) continue;
  await ic.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const caja = await ic.evaluate((n) => { let a = n; while (a.parentElement && a.getBoundingClientRect().width < 500) a = a.parentElement; while (a.parentElement && !a.className?.toString().includes("rounded-xl")) a = a.parentElement; const q = a.getBoundingClientRect(); return { x: q.x, y: q.y, width: q.width, height: Math.min(q.height, 420) }; });
  await ic.click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/copiar-03-Proveedor-cuentas.png`, clip: { x: Math.max(0, caja.x - 16), y: Math.max(0, caja.y - 16), width: caja.width + 32, height: caja.height + 32 } });
  console.log("ok", h); break;
}
await nav.close();
