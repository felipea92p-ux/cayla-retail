// Prueba las interacciones de las demos y fotografía el resultado.
import { chromium } from "playwright";
const U = process.env.U; const OUT = "unificar/.salida/elegir-ronda9/demos";
const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(U, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
// Frescura P1: abrir Estado y elegir Vigente
const fz = p.locator('[id="f-filtro"] .op[data-op="P1"]');
await fz.scrollIntoViewIfNeeded();
await fz.locator('[data-fz][data-nombre="Estado"] [data-fz-abre]').click(); await p.waitForTimeout(700);
await fz.screenshot({ path: `${OUT}/prueba-filtro-abierto.png` });
await fz.locator('[data-fz-op][data-valor="vigente"]').click(); await p.waitForTimeout(500);
await fz.screenshot({ path: `${OUT}/prueba-filtro-puesto.png` });
// Frescura A: abrir la caja de Estado
const fa = p.locator('[id="f-filtro"] .op[data-op="A"]');
await fa.scrollIntoViewIfNeeded();
await fa.locator('[data-fz-hoy]').click(); await p.waitForTimeout(700);
await fa.screenshot({ path: `${OUT}/prueba-filtro-hoy.png` });
// Conteo P1: escribir 4 en S
const cf = p.locator('[id="f-tabla"] .op[data-op="P1"]');
await cf.scrollIntoViewIfNeeded();
await cf.locator("tbody tr").first().locator("input").fill("4"); await cf.locator("tbody tr").first().locator("input").press("Enter"); await p.waitForTimeout(250);
await cf.screenshot({ path: `${OUT}/prueba-conteo.png` });
// Acciones P2: repartir
const ac = p.locator('[id="f-enlace"] .op[data-op="P2"]');
await ac.scrollIntoViewIfNeeded();
await ac.locator('[data-ac="repartir"]').click(); await p.waitForTimeout(500);
await ac.screenshot({ path: `${OUT}/prueba-acciones.png` });
// Desactivar P1: un toque
const dc = p.locator('[id="f-accion.eliminar"] .op[data-op="P1"]');
await dc.scrollIntoViewIfNeeded();
await dc.locator("[data-dc-desactivar]").click(); await p.waitForTimeout(300);
await dc.screenshot({ path: `${OUT}/prueba-desactivar.png` });
console.log("elegidas:", await p.evaluate(() => document.querySelectorAll("input[type=radio]:checked").length));
await nav.close();
