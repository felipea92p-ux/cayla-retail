// Firma candidata de una insignia de estado a mano (ronda 16): una píldora redonda con el fondo suave de un tono y su texto del mismo
// tono, en letra chica. Desde apps/web: node ../../docs/unificar/rondas/16/firmas-estado.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const T = "(?:verde|ambar|rojo|pizarra|taupe|sand|tinta)";
const FIRMA = new RegExp(String.raw`className=(?:"|\{\x60)(?=[^"\x60]*\brounded-full\b)(?=[^"\x60]*\bbg-${T}\/(?:\[?0?\.?\d+\]?)(?![\w-]))(?=[^"\x60]*\btext-(?:xs|\[1[012](?:\.5)?px\])(?![\w-]))(?=[^"\x60]*\bpx-(?:1\.5|2|2\.5|3)\b)`);
const WEB = process.cwd();
const rec = (d, s = []) => { for (const n of readdirSync(d)) { const r = join(d, n); if (statSync(r).isDirectory()) rec(r, s); else if (/\.tsx$/.test(n) && !/\.test\.tsx?$/.test(n)) s.push(r); } return s; };
let total = 0;
for (const r of ["components", "app"].flatMap((x) => rec(join(WEB, x)))) {
  const L = readFileSync(r, "utf8").split("\n");
  L.forEach((l, i) => { if (/unificar-fijo:/.test(l)) return; const m = FIRMA.exec(l); if (m) { total++; console.log(`${r.slice(WEB.length + 1)}:${i + 1}  ${l.trim().slice(0, 170)}`); } });
}
console.log("total", total);
