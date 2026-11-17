#!/usr/bin/env node
// Si corto este import (o saco esta pieza entera), ¿cuántos KB YA ARMADOS dejan de bajar? (ADR-0674). Junta las dos medidas: el
// camino de imports fijos (como `cierres.mjs`) y lo que cada archivo pesa de verdad en el armado (la salida de `por-modulo.mjs`).
// Un archivo solo «se va» si no queda otro camino hasta él: por eso un corte puede dar 0 aunque el archivo pese.
// Uso:  node scripts/peso/por-modulo.mjs apps/web /sin-acceso marco 0 > /tmp/pesos.txt
//       node scripts/peso/si-corto.mjs apps/web /tmp/pesos.txt "app/layout.tsx,app/(app)/layout.tsx" \
//            components/RecordatorioCierreCaja.tsx "lib/useColaProductos.ts>lib/fotos-pendientes.ts"
//       (una pieza sola = sacarla entera; `a>b` = cortar solo ese import)
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
const [, , webRel, pesos, raicesRel, ...cortes] = process.argv;
if (!webRel || !pesos || !raicesRel || cortes.length === 0) {
  console.error('Uso: node scripts/peso/si-corto.mjs apps/web <pesos de por-modulo> "raíz1,raíz2" <pieza | desde>hasta> …');
  process.exit(1);
}
const web = resolve(webRel);
const EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", "/index.tsx", "/index.ts"];
const kb = new Map(readFileSync(pesos, "utf8").split("\n").slice(2).filter(Boolean).map((l) => { const [k, n] = l.split("|"); return [n.trim(), Number(k)]; }));
function resolver(desde, espec) {
  let base;
  if (espec.startsWith("@/")) base = join(web, espec.slice(2));
  else if (espec.startsWith(".")) base = resolve(dirname(desde), espec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXT) if (existsSync(base + e)) return base + e;
  return null;
}
const cache = new Map();
function importsDe(a) {
  if (cache.has(a)) return cache.get(a);
  const t = readFileSync(a, "utf8");
  const re = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
  const v = /^\s*["']use server["']/.test(t) ? [] : [...t.matchAll(re)].map((m) => resolver(a, m[1])).filter(Boolean);
  cache.set(a, v);
  return v;
}
const raices = raicesRel.split(",").map((r) => join(web, r.trim()));
function alcanza(sinArista, sinNodo) {
  const vistos = new Set(raices);
  const cola = [...raices];
  while (cola.length) {
    const a = cola.pop();
    for (const h of importsDe(a)) {
      if (sinNodo && h === sinNodo) continue;
      if (sinArista && a === sinArista[0] && h === sinArista[1]) continue;
      if (!vistos.has(h)) { vistos.add(h); cola.push(h); }
    }
  }
  return vistos;
}
const todo = alcanza(null, null);
for (const c of cortes) {
  const [a, b] = c.split(">").map((x) => join(web, x));
  const queda = b ? alcanza([a, b], null) : alcanza(null, a);
  const idos = [...todo].filter((f) => !queda.has(f)).map((f) => relative(web, f));
  const con = idos.map((f) => [f, kb.get(f) ?? 0]).filter(([, k]) => k > 0).sort((x, y) => y[1] - x[1]);
  const suma = con.reduce((s, [, k]) => s + k, 0);
  console.log(`${suma.toFixed(1).padStart(6)} KB | ${c}  (${con.length} archivos)  ${con.slice(0, 6).map(([f, k]) => `${f.split("/").pop()} ${k}`).join(", ")}`);
}
