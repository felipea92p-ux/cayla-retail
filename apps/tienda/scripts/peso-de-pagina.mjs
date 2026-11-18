#!/usr/bin/env node
/**
 * Mide cuánto pesa una página de la tienda compilada (`next build` + `next start`): el documento que baja quien llega a ella y el flujo RSC
 * que baja quien navega a ella dentro de la tienda (un filtro, un orden, otra página de la lista), con su tiempo en el servidor. Nació el
 * 2026-10-26 al medir /catalogo con 230 prendas: la causa del peso no era la lista de prendas del buscador sino la copia que
 * `partialPrefetching` mete en cada respuesta (docs/backlog/2026-10-26-exciting-boyd-e87828.md). Solo LEE: GET a una dirección.
 *
 * USO
 *   pnpm --filter tienda peso:pagina -- "http://localhost:3100/catalogo?orden=precio-asc"
 *   pnpm --filter tienda peso:pagina -- <url> --n 30                  # cuántas visitas para el tiempo (20 de fábrica)
 *   pnpm --filter tienda peso:pagina -- <url> --marcador 't-card"'    # qué texto contar en el flujo (una tarjeta, de fábrica)
 *   pnpm --filter tienda peso:pagina -- <url> --remoto                # permite una dirección que no es de esta máquina
 *
 * QUÉ ASUME. Pide las respuestas SIN comprimir y las comprime aquí (gzip 6 y brotli 4): es el piso de lo que cabe en el cable, no lo que
 * manda `next start` (que comprime a pedazos y por eso sale más grande) ni lo que manda Vercel. Para lo que baja el aparato de verdad, el
 * navegador: `performance.getEntriesByType("resource")` → `encodedBodySize` de la petición con `_rsc`. El flujo se pide sin el árbol del
 * cliente, así que trae también el marco de la página: una navegación real baja menos (en /catalogo, 165 kB contra 227 kB).
 */
import { brotliCompressSync, gzipSync } from "node:zlib";

const argumento = (nombre, otro) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : otro;
};
const url = process.argv[2];
const VISITAS = Number(argumento("--n", "20"));
const MARCADOR = argumento("--marcador", 't-card"');
if (!url || url.startsWith("--") || !(VISITAS >= 1 && VISITAS <= 500)) {
  console.error('Uso: pnpm --filter tienda peso:pagina -- "<url>" [--n 20] [--marcador \'t-card"\'] [--remoto]');
  process.exit(2);
}
const { hostname } = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) && !process.argv.includes("--remoto")) {
  console.error(`${hostname} no es de esta máquina: la medida se hace sobre la tienda local. Con --remoto se permite.`);
  process.exit(2);
}

const kB = (n) => `${(n / 1024).toFixed(1)} kB`;
const apariciones = (texto, marca) => texto.split(marca).length - 1;

/** Pide la dirección; `rsc` pide el flujo con que navega la tienda (Next redirige una vez para fijar `_rsc`). */
async function pedir(direccion, rsc) {
  const cabeceras = { "accept-encoding": "identity", ...(rsc ? { rsc: "1" } : {}) };
  const t0 = performance.now();
  const r = await fetch(direccion, { headers: cabeceras, redirect: "follow" });
  const cuerpo = Buffer.from(await r.arrayBuffer());
  return { ms: performance.now() - t0, cuerpo, estado: r.status };
}

async function medir(nombre, rsc) {
  const primera = await pedir(url, rsc);
  const { cuerpo } = primera;
  const texto = cuerpo.toString("utf8");
  const tiempos = [];
  for (let i = 0; i < VISITAS; i++) tiempos.push((await pedir(url, rsc)).ms);
  tiempos.sort((a, b) => a - b);
  const p = (q) => tiempos[Math.min(tiempos.length - 1, Math.floor(q * tiempos.length))].toFixed(1);
  console.log(`\n${nombre}  (estado ${primera.estado})`);
  console.log(`  sin comprimir  ${kB(cuerpo.length)}`);
  console.log(`  gzip 6         ${kB(gzipSync(cuerpo, { level: 6 }).length)}`);
  console.log(`  brotli 4       ${kB(brotliCompressSync(cuerpo, { params: { 1: 4 } }).length)}`);
  console.log(`  servidor       p50 ${p(0.5)} ms · p95 ${p(0.95)} ms  (${VISITAS} visitas una tras otra)`);
  if (rsc) {
    console.log(`  «${MARCADOR}»     ${apariciones(texto, MARCADOR)} veces (una por tarjeta; el doble si el flujo trae una copia)`);
    // `partialPrefetching` mete en la respuesta, tras todo lo demás, una copia de la página en filas binarias (`<id>:o<largo>,`).
    const copia = /\n[0-9a-f]+:o[0-9a-f]+,/.exec(texto);
    console.log(copia ? `  copia embebida ${kB(cuerpo.length - copia.index)} (${Math.round(((cuerpo.length - copia.index) / cuerpo.length) * 100)} % del flujo, desde la primera fila binaria)` : "  copia embebida ninguna");
  }
}

console.log(`Peso de ${url}`);
await medir("Documento (quien llega a la página)", false);
await medir("Flujo RSC (quien navega a ella)", true);
