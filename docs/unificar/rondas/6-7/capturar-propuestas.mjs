// Fotos chicas de cada propuesta (P1, en claro y en oscuro, lado a lado) para docs/unificar/capturas/. Solo lee las páginas de
// elegir (estáticas): no necesita el ERP ni la base.   B=http://localhost:<puerto de unificar-laminas> node capturar-propuestas.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
const B = process.env.B ?? "http://localhost:51284";
const DOCS = "../../../../docs/unificar/capturas";
const TMP = "tmp-capturas"; mkdirSync(TMP, { recursive: true });
const casos = [
  ["elegir-ronda6", "campo-combo::caja", "P1", "campo-combo.propuesta", async (p, op) => { await op.locator(".pf-caja.monto input").first().focus(); }],
  ["elegir-ronda6", "campo-combo::lista", "P1", "lista.propuesta", async (p, op) => { await op.locator("[data-disparador]").nth(1).click(); await p.waitForTimeout(700); }],
  ["elegir-ronda6", "filtro::filtro", "P1", "filtro.propuesta", async (p, op) => { await op.locator(".pp").nth(1).click(); await p.waitForTimeout(700); }],
  ["elegir-ronda6", "etiqueta-campo::etiqueta", "P1", "etiqueta-campo.propuesta", async (p, op) => { await op.locator("input").nth(1).focus(); }],
  ["elegir-ronda6", "casilla::casilla", "P1", "casilla.propuesta", null],
  ["elegir-ronda7", "tabla::tabla", "P1", "tabla.propuesta", async (p, op) => { await op.locator(".fila").nth(2).hover(); }],
  ["elegir-ronda7", "titulo-seccion::bloque", "P1", "titulo-seccion.propuesta", null],
  ["elegir-ronda7", "titulo-seccion::grupo", "P1", "titulo-seccion.grupo.propuesta", null],
  ["elegir-ronda7", "titulo-seccion::dia", "P1", "titulo-seccion.dia.propuesta", async (p, op) => { await op.locator(".dz-scroll").evaluate((e) => (e.scrollTop = 150)); }],
];
const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
for (const [pagina, grupo, id, nombre, preparar] of casos) {
  const fotos = [];
  for (const tema of ["claro", "oscuro"]) {
    await p.goto(`${B}/${pagina}/elegir.html`, { waitUntil: "networkidle" });
    await p.evaluate((t) => { document.documentElement.dataset.tema = t; document.querySelector(".barra")?.remove(); }, tema);
    const op = p.locator(`fieldset[data-grupo="${grupo}"] .op[data-op="${id}"]`);
    const demo = op.locator(".op-demo-fila");
    await demo.scrollIntoViewIfNeeded();
    await p.waitForTimeout(1300);
    if (preparar) await preparar(p, op);
    await p.waitForTimeout(600);
    const f = `${TMP}/${nombre}-${tema}.png`;
    await demo.screenshot({ path: f });
    fotos.push(f);
  }
  // Las dos lado a lado, en una sola imagen chica
  const c = await nav.newPage({ viewport: { width: 1600, height: 900 } });
  await c.setContent(`<body style="margin:0;background:#e8e0d0;display:flex;gap:16px;padding:16px;align-items:flex-start">${fotos.map((f) => `<img src="data:image/png;base64,${readFileSync(f).toString("base64")}" style="width:776px;height:auto;border-radius:12px">`).join("")}</body>`); // tema-fijo: fondo neutro de la lámina, no una pantalla del ERP
  await c.waitForTimeout(300);
  const alto = await c.evaluate(() => Math.ceil(Math.max(...[...document.images].map((i) => i.getBoundingClientRect().bottom))) + 16);
  await c.setViewportSize({ width: 1600, height: alto });
  await c.screenshot({ path: `${DOCS}/${nombre}.jpg`, type: "jpeg", quality: 72 });
  await c.close();
  console.log("✓", nombre);
}
await nav.close();
