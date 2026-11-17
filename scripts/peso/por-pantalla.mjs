#!/usr/bin/env node
// JavaScript por pantalla en un armado de producción (ADR-0674): lo que el teléfono baja y lee para abrir cada ruta, crudo y comprimido.
// Antes: en apps/web, `NODE_OPTIONS=--max-old-space-size=8000 VERCEL=1 npx next build` (sin revisar tipos; unos minutos).
// Uso: node scripts/peso/por-pantalla.mjs apps/web /vender /caja /vender/apartados …
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const [, , webRel, ...rutas] = process.argv;
const web = resolve(webRel);
const next = join(web, ".next");
const raizMain = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8")).rootMainFiles ?? [];

function manifiesto(ruta) {
  const archivo = join(next, "server/app/(app)", ruta, "page_client-reference-manifest.js");
  if (!existsSync(archivo)) return null;
  const ctx = { globalThis: {} };
  vm.runInNewContext(readFileSync(archivo, "utf8"), ctx);
  const m = ctx.globalThis.__RSC_MANIFEST ?? {};
  return Object.values(m)[0];
}

const peso = (archivos) => {
  let crudo = 0;
  let gz = 0;
  for (const a of archivos) {
    const p = join(next, decodeURIComponent(a));
    if (!existsSync(p)) continue;
    const b = readFileSync(p);
    crudo += b.length;
    gz += gzipSync(b).length;
  }
  return { crudo: Math.round(crudo / 1024), gz: Math.round(gz / 1024) };
};

console.log("ruta | total KB (gz) | marco KB | propio KB (gz) | archivos propios");
for (const ruta of rutas) {
  const m = manifiesto(ruta);
  if (!m) {
    console.log(`${ruta} | (sin manifiesto)`);
    continue;
  }
  const entradas = m.entryJSFiles ?? {};
  const js = (lista) => lista.filter((f) => f.endsWith(".js"));
  const marco = new Set([...raizMain, ...Object.entries(entradas).filter(([k]) => /\/layout$/.test(k)).flatMap(([, v]) => js(v))]);
  const todos = new Set([...marco, ...Object.values(entradas).flatMap(js)]);
  const propios = [...todos].filter((f) => !marco.has(f));
  const t = peso(todos);
  const mk = peso(marco);
  const pr = peso(propios);
  console.log(`${ruta} | ${t.crudo} (${t.gz}) | ${mk.crudo} | ${pr.crudo} (${pr.gz}) | ${propios.length}`);
}
