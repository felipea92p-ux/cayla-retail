// Prueba firmas candidatas de la ronda 15 contra el código (sin tocar familias.mjs). Desde apps/web:
//   node ../../docs/unificar/rondas/15/firmas.mjs [familia]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const CAND = {
  "icono.trazo": { ventana: 8, firmas: [
    String.raw`<[A-Z]\w*\b(?:[^>]|=>)*?\bstrokeWidth=(?:\{|")(?!2(?:\}|"))[\d.]+`,
    String.raw`svg[^{,]*\{[^}]*?stroke-width:\s*(?!2\s*;)[\d.]+`,
  ] },
  "icono.tam": { ventana: 8, firmas: [
    String.raw`<[A-Z]\w*\b(?:[^>]|=>)*?\bsize=\{(?:10|11|13|15|17|18|19|22)\}`,
    String.raw`<[A-Z]\w*\b(?:[^>]|=>)*?className=(?:"|\{\x60|\{")[^"\x60]*\b(?:size|h|w)-(?:2\.5|4\.5|\[(?:10|11|13|15|17|18|19|22)px\])`,
    String.raw`svg[^{,]*\{[^}]*?\bwidth:\s*(?:10|11|13|15|17|18|19|22)px`,
  ] },
};
const WEB = process.cwd();
const rec = (d, s = []) => { for (const n of readdirSync(d)) { const r = join(d, n); if (statSync(r).isDirectory()) rec(r, s); else if (/\.(tsx|ts|css)$/.test(n) && !/\.test\.tsx?$/.test(n)) s.push(r); } return s; };
const pedida = process.argv[2];
for (const [id, c] of Object.entries(CAND)) {
  if (pedida && id !== pedida) continue;
  const fs = c.firmas.map((f) => new RegExp(f));
  const res = [];
  for (const r of ["components", "app"].flatMap((x) => rec(join(WEB, x)))) {
    const L = readFileSync(r, "utf8").split("\n");
    const d = [];
    L.forEach((l, i) => { if (/^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l) || /unificar-fijo:/.test(l)) return; const t = L.slice(i, i + c.ventana).join("\n"); if (fs.some((f) => { const m = f.exec(t); return m && m.index < l.length; })) d.push(i + 1); });
    if (d.length) res.push([r.slice(WEB.length + 1), d]);
  }
  console.log(`\n${id}: ${res.length} archivos, ${res.reduce((a, [, d]) => a + d.length, 0)} líneas`);
  for (const [f, d] of res) console.log(`  ${f}  ${d.join(",")}`);
}
