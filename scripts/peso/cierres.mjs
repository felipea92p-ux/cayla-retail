#!/usr/bin/env node
// Qué arrastra cada import fijo de un componente (ADR-0674, actividad 7): por cada import directo de la raíz, cuánto código fuente
// alcanza (cierre) y cuánto es SOLO suyo (lo que dejaría de cargarse si ese import pasara a `import()`). Es fuente, no lo que llega al
// teléfono: sirve para ORDENAR candidatos; el peso real lo da `por-pantalla.mjs` sobre un armado de producción.
// Los hijos que importan de vuelta a la raíz no cuentan como camino (si no, todo «arrastra todo»).
// Uso: node scripts/peso/cierres.mjs apps/web components/PuntoDeVenta.tsx [mínimo KB, 8 de fábrica]
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [, , webRel, raizRel, minimo = "8"] = process.argv;
const web = resolve(webRel);
const EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", "/index.tsx", "/index.ts"];

function resolver(desde, espec) {
  let base;
  if (espec.startsWith("@/")) base = join(web, espec.slice(2));
  else if (espec.startsWith(".")) base = resolve(dirname(desde), espec);
  else return null; // paquete de node_modules: se cuenta aparte, por nombre
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXT) if (existsSync(base + e)) return base + e;
  return null;
}

const cacheImports = new Map();
function importsDe(archivo) {
  if (cacheImports.has(archivo)) return cacheImports.get(archivo);
  const texto = readFileSync(archivo, "utf8");
  const fijos = [];
  const paquetes = [];
  // import … from "x" | import "x" | export … from "x"  (sin `import type` ni `import()`)
  const re = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const m of texto.matchAll(re)) {
    if (/\.css$/.test(m[1])) continue;
    const r = resolver(archivo, m[1]);
    if (r) fijos.push(r);
    else if (!m[1].startsWith(".") && !m[1].startsWith("@/")) paquetes.push(m[1]);
  }
  const v = { fijos, paquetes };
  cacheImports.set(archivo, v);
  return v;
}

function cierre(inicios, vetado = new Set()) {
  const vistos = new Set();
  const pila = [...inicios];
  while (pila.length) {
    const a = pila.pop();
    if (vistos.has(a) || vetado.has(a)) continue;
    vistos.add(a);
    for (const h of importsDe(a).fijos) pila.push(h);
  }
  return vistos;
}

const kb = (archivos) => [...archivos].reduce((s, a) => s + statSync(a).size, 0) / 1024;
const paquetesDe = (archivos) => new Set([...archivos].flatMap((a) => importsDe(a).paquetes));

const raiz = join(web, raizRel);
const directos = [...new Set(importsDe(raiz).fijos)];
const todo = cierre([raiz]);
const filas = directos.map((d) => {
  const suyo = cierre([d], new Set([raiz]));
  // Lo que se alcanza desde la raíz SIN pasar por este import directo
  const sinEl = cierre(directos.filter((x) => x !== d), new Set([raiz]));
  const solo = new Set([...suyo].filter((a) => !sinEl.has(a)));
  const paqSolo = [...paquetesDe(solo)].filter((p) => !paquetesDe(sinEl).has(p) && !importsDe(raiz).paquetes.includes(p));
  return { d: d.replace(web + "/", ""), cierre: kb(suyo), solo: kb(solo), archivos: solo.size, paqSolo };
});
console.log(`raíz ${raizRel}: ${todo.size} archivos, ${kb(todo).toFixed(0)} KB de fuente; ${directos.length} imports directos`);
console.log("solo suyo KB | cierre KB | archivos | import  [paquetes solo suyos]");
for (const f of filas.sort((a, b) => b.solo - a.solo).filter((f) => f.solo >= Number(minimo)))
  console.log(`${f.solo.toFixed(0).padStart(6)} | ${f.cierre.toFixed(0).padStart(6)} | ${String(f.archivos).padStart(4)} | ${f.d}${f.paqSolo.length ? "  [" + f.paqSolo.join(", ") + "]" : ""}`);
