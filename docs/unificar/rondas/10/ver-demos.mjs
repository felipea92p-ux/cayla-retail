// Fotos de cada tarjeta de la página de elegir (para revisarlas y para docs/unificar/capturas).
//   U=http://localhost:<puerto>/elegir-ronda9/elegir.html node unificar/.salida/elegir-ronda9/ver-demos.mjs [oscuro]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const U = process.env.U; const tema = process.argv[2] === "oscuro" ? "oscuro" : "claro";
const OUT = "unificar/.salida/elegir-ronda10/demos"; mkdirSync(OUT, { recursive: true });
const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.goto(U, { waitUntil: "networkidle" });
if (tema === "oscuro") await p.evaluate(() => document.documentElement.setAttribute("data-tema", "oscuro"));
await p.waitForTimeout(1200);
const ops = await p.locator("section.familia").evaluateAll((ss) => ss.map((s) => [s.id, [...s.querySelectorAll(".op")].map((o) => o.dataset.op)]));
for (const [fam, ids] of ops) for (const id of ids) {
  const op = p.locator(`[id="${fam}"] .op[data-op="${id}"]`).first();
  await op.scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
  await op.screenshot({ path: `${OUT}/${fam.replace("f-", "")}-${id}-${tema}.png` });
  console.log(fam, id);
}
await nav.close();
