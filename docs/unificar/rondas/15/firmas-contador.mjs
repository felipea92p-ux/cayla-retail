// Firmas candidatas del globito, de «Ver más», «Deshacer» y «Buscar» (ronda 15). Desde apps/web: node ../../docs/unificar/rondas/15/firmas-contador.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const CAND = {
  contador: { ventana: 1, firmas: [
    String.raw`className=(?:"|\{\x60)(?=[^"\x60]*\brounded-full\b)(?=[^"\x60]*\b(?:min-w-(?:4|5|6|\[1[5-9]px\])|h-\[1[5-8]px\])(?![\w-]))(?=[^"\x60]*\btext-\[(?:9\.5|10|10\.5|11)px\])(?=[^"\x60]*\bbg-(?:rojo|ambar|tinta|crema|papel)(?![\w-]))`,
    String.raw`className=(?:"|\{\x60)(?=[^"\x60]*\brounded-full\b)(?=[^"\x60]*\bbg-ambar\/\[?0?\.1)(?=[^"\x60]*\btabular-nums\b)(?=[^"\x60]*\btext-\[11px\])`,
  ] },
  "accion.siguiente": { ventana: 1, firmas: [String.raw`\bVer menos\b`] },
  "accion.deshacer": { ventana: 3, firmas: [String.raw`>\s*Deshacer\s*</`] },
  "accion.buscar": { ventana: 3, firmas: [String.raw`>\s*Buscar\s*</(?:Boton|button)>`] },
};
const WEB = process.cwd();
const rec = (d, s = []) => { for (const n of readdirSync(d)) { const r = join(d, n); if (statSync(r).isDirectory()) rec(r, s); else if (/\.(tsx|ts|css)$/.test(n) && !/\.test\.tsx?$/.test(n)) s.push(r); } return s; };
for (const [id, c] of Object.entries(CAND)) {
  const fs = c.firmas.map((f) => new RegExp(f));
  const res = [];
  for (const r of ["components", "app"].flatMap((x) => rec(join(WEB, x)))) {
    const L = readFileSync(r, "utf8").split("\n");
    const d = [];
    L.forEach((l, i) => { if (/^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l) || /unificar-fijo:/.test(l)) return; const t = L.slice(i, i + c.ventana).join("\n"); if (fs.some((f) => { const m = f.exec(t); return m && m.index < l.length; })) d.push(i + 1); });
    if (d.length) res.push([r.slice(WEB.length + 1), d]);
  }
  console.log(`\n${id}: ${res.length} archivos`);
  for (const [f, d] of res) console.log(`  ${f}  ${d.join(",")}`);
}
