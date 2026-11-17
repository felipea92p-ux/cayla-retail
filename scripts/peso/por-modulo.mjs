#!/usr/bin/env node
// Quién pone cada KB (ADR-0674): por archivo de fuente o librería, cuánto JavaScript YA ARMADO llega al teléfono para abrir una ruta.
// `cierres.mjs` cuenta fuente (con comentarios, sin minificar): sirve para ordenar candidatos. Este cuenta lo que de verdad viaja,
// leyendo el mapa de cada archivo del navegador. Es la medida para decidir qué vale la pena diferir.
// Antes: en apps/web, `MEDIR_PESO=1 NODE_OPTIONS=--max-old-space-size=8000 VERCEL=1 npx next build` (deja los mapas; unos minutos).
// Uso: node scripts/peso/por-modulo.mjs apps/web /caja [marco|propio|todo, `marco` de fábrica] [mínimo KB, 2 de fábrica]
//      `marco` = lo que baja en TODA pantalla (los layouts y la raíz); `propio` = lo que suma esa ruta.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const [, , webRel, ruta, parte = "marco", minimo = "2"] = process.argv;
if (!webRel || !ruta) {
  console.error("Uso: node scripts/peso/por-modulo.mjs apps/web /caja [marco|propio|todo] [mínimo KB]");
  process.exit(1);
}
const next = join(resolve(webRel), ".next");
const raizMain = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8")).rootMainFiles ?? [];
const archivoManifiesto = join(next, "server/app/(app)", ruta, "page_client-reference-manifest.js");
if (!existsSync(archivoManifiesto)) {
  console.error(`Sin manifiesto para ${ruta}: ¿la ruta existe y el armado terminó?`);
  process.exit(1);
}
const ctx = { globalThis: {} };
vm.runInNewContext(readFileSync(archivoManifiesto, "utf8"), ctx);
const entradas = Object.values(ctx.globalThis.__RSC_MANIFEST ?? {})[0]?.entryJSFiles ?? {};
const js = (lista) => lista.filter((f) => f.endsWith(".js"));
const marco = new Set([...raizMain, ...Object.entries(entradas).filter(([k]) => /\/layout$/.test(k)).flatMap(([, v]) => js(v))]);
const todos = new Set([...marco, ...Object.values(entradas).flatMap(js)]);
const elegidos = parte === "todo" ? [...todos] : parte === "propio" ? [...todos].filter((f) => !marco.has(f)) : [...marco];

// --- Mapas: VLQ en base 64 (el formato de `mappings`), sin dependencias.
const B64 = new Map([..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map((c, i) => [c, i]));
function segmentos(linea) {
  const salida = [];
  let campo = [];
  let valor = 0;
  let corrimiento = 0;
  for (const c of linea) {
    if (c === ",") {
      salida.push(campo);
      campo = [];
      continue;
    }
    const d = B64.get(c);
    valor += (d & 31) << corrimiento;
    if (d & 32) corrimiento += 5;
    else {
      campo.push(valor & 1 ? -(valor >> 1) : valor >> 1);
      valor = 0;
      corrimiento = 0;
    }
  }
  if (campo.length > 0) salida.push(campo);
  return salida;
}

/** Los puntos `{ linea, columna, fuente }` de un mapa plano, corridos al lugar de su sección. */
function puntosDe(mapa, lineaBase, columnaBase) {
  const puntos = [];
  let fuente = 0;
  const lineas = (mapa.mappings ?? "").split(";");
  for (let i = 0; i < lineas.length; i++) {
    let columna = 0;
    for (const s of segmentos(lineas[i])) {
      columna += s[0];
      if (s.length >= 4) fuente += s[1];
      puntos.push({ linea: lineaBase + i, columna: columna + (i === 0 ? columnaBase : 0), fuente: s.length >= 4 ? (mapa.sources?.[fuente] ?? "(sin nombre)") : null });
    }
  }
  return puntos;
}

function nombre(fuente) {
  if (fuente === null) return "(sin fuente: envoltura del armado)";
  const enPaquete = fuente.lastIndexOf("node_modules/");
  if (enPaquete >= 0) {
    const resto = fuente.slice(enPaquete + "node_modules/".length).split("/");
    const paquete = resto[0].startsWith("@") ? `${resto[0]}/${resto[1]}` : resto[0];
    // `ABRIR=next` (variable de entorno) parte ese paquete por carpeta, para ver qué de él pesa.
    if (process.env.ABRIR === paquete) return `paquete ${resto.slice(0, resto[0].startsWith("@") ? 6 : 5).join("/").replace(/\/[^/]*\.[a-z]+$/, "")}`;
    return `paquete ${paquete}`;
  }
  const m = fuente.match(/(?:apps\/web\/|packages\/)(.*)$/);
  return m ? (fuente.includes("packages/") ? `packages/${m[1]}` : m[1]) : fuente;
}

const pesoDe = new Map();
let total = 0;
let sinMapa = 0;
for (const f of elegidos) {
  const p = join(next, decodeURIComponent(f));
  if (!existsSync(p)) continue;
  const texto = readFileSync(p, "utf8");
  total += texto.length;
  // El mapa no se llama como su archivo: el nombre va en el comentario del final (`//# sourceMappingURL=…`).
  const enlace = texto.slice(-400).match(/sourceMappingURL=(\S+)/)?.[1];
  const archivoMapa = enlace ? join(dirname(p), decodeURIComponent(enlace)) : null;
  if (!archivoMapa || !existsSync(archivoMapa)) {
    sinMapa += texto.length;
    continue;
  }
  const mapa = JSON.parse(readFileSync(archivoMapa, "utf8"));
  const puntos = mapa.sections ? mapa.sections.flatMap((s) => puntosDe(s.map, s.offset.line, s.offset.column)) : puntosDe(mapa, 0, 0);
  puntos.sort((a, b) => a.linea - b.linea || a.columna - b.columna);
  const largos = texto.split("\n").map((l) => l.length + 1);
  let contado = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];
    // Hasta el siguiente punto; si cambia de línea, lo que queda de esta y las líneas de en medio.
    let tramo;
    if (b && b.linea === a.linea) tramo = b.columna - a.columna;
    else {
      tramo = (largos[a.linea] ?? 0) - a.columna;
      const hasta = b ? b.linea : largos.length;
      for (let l = a.linea + 1; l < hasta; l++) tramo += largos[l] ?? 0;
      if (b) tramo += b.columna;
    }
    if (tramo <= 0) continue;
    const n = nombre(a.fuente);
    pesoDe.set(n, (pesoDe.get(n) ?? 0) + tramo);
    contado += tramo;
  }
  const resto = texto.length - contado;
  if (resto > 0) pesoDe.set("(antes del primer punto del mapa)", (pesoDe.get("(antes del primer punto del mapa)") ?? 0) + resto);
}

const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log(`${ruta} · ${parte}: ${elegidos.length} archivos, ${Math.round(total / 1024)} KB armados (sin comprimir)${sinMapa ? ` · ${Math.round(sinMapa / 1024)} KB sin mapa (¿armado sin MEDIR_PESO=1?)` : ""}`);
console.log("     KB | quién");
for (const [n, v] of [...pesoDe].sort((a, b) => b[1] - a[1])) if (v / 1024 >= Number(minimo)) console.log(`${kb(v)} | ${n}`);
