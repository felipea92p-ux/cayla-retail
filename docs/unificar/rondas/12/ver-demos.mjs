// Fotos de cada tarjeta de la página de elegir de la ronda 12 (cada grupo de cada familia).
//   U=http://localhost:<puerto>/elegir-ronda12/elegir.html node unificar/.salida/elegir-ronda12/ver-demos.mjs [oscuro]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const U = process.env.U; const tema = process.argv[2] === "oscuro" ? "oscuro" : "claro";
const OUT = "unificar/.salida/elegir-ronda12/demos"; mkdirSync(OUT, { recursive: true });
const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.goto(U, { waitUntil: "networkidle" });
if (tema === "oscuro") await p.evaluate(() => document.documentElement.setAttribute("data-tema", "oscuro"));
await p.waitForTimeout(1200);
const n = await p.locator(".op").count();
for (let i = 0; i < n; i++) {
  const op = p.locator(".op").nth(i);
  const nombre = await op.evaluate((o) => `${o.closest("section.familia")?.id.replace("f-", "")}-${o.closest(".grupo, [data-grupo]")?.id ?? ""}-${o.dataset.op}`);
  await op.scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
  await op.screenshot({ path: `${OUT}/${String(i).padStart(2, "0")}-${nombre}-${tema}.png` });
  console.log(i, nombre);
}
await nav.close();
