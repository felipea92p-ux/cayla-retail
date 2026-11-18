#!/usr/bin/env node
// El camino más corto de imports fijos entre dos archivos (ADR-0674, actividad 7): por dónde una pantalla termina cargando a otra.
// Así salió que Caja traía toda la pantalla de Vender por `money`. `import type` e `import()` no cuentan.
// Uso: node scripts/peso/camino.mjs apps/web components/CajaAbiertaPanel.tsx components/PuntoDeVenta.tsx
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const [, , webRel, desdeRel, hastaRel] = process.argv;
const web = resolve(webRel);
const EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", "/index.tsx", "/index.ts"];
function resolver(desde, espec) {
  let base;
  if (espec.startsWith("@/")) base = join(web, espec.slice(2));
  else if (espec.startsWith(".")) base = resolve(dirname(desde), espec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXT) if (existsSync(base + e)) return base + e;
  return null;
}
function importsDe(archivo) {
  const texto = readFileSync(archivo, "utf8");
  // Un archivo de acciones del servidor (`"use server"`) no viaja al teléfono: el camino termina ahí.
  if (/^\s*["']use server["']/.test(texto)) return [];
  const re = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
  return [...texto.matchAll(re)].map((m) => resolver(archivo, m[1])).filter(Boolean);
}
const desde = join(web, desdeRel), hasta = join(web, hastaRel);
const previo = new Map([[desde, null]]);
const cola = [desde];
while (cola.length) {
  const a = cola.shift();
  if (a === hasta) break;
  for (const h of importsDe(a)) if (!previo.has(h)) { previo.set(h, a); cola.push(h); }
}
if (!previo.has(hasta)) console.log("sin camino");
else { const c = []; for (let x = hasta; x; x = previo.get(x)) c.unshift(x.replace(web + "/", "")); console.log(c.join("\n  → ")); }
