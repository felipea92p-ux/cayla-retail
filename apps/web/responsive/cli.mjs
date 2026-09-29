#!/usr/bin/env node
// CLI del Responsive Quality Gate — ver `responsive/README.md` para la guía completa.
//
// Uso:
//   pnpm --filter web responsive:check existencias
//   pnpm --filter web responsive:check existencias movimientos traslados
//   pnpm --filter web responsive:check --module inventario
//   pnpm --filter web responsive:check all
//
// Flags:
//   --module <id>        corre todas las pantallas de ese módulo (en vez de pantallas sueltas)
//   --base-url <url>     apunta a un servidor ya corriendo (por defecto http://localhost:3010)
//   --capturas-todas     además de las FAIL, guarda una captura de cada caso que pasa (auditoría visual)
//   --headed             abre una ventana de Chrome visible en vez de correr en headless
//   --tolerancia <px>    tolerancia subpíxel para el clipping (por defecto 1)
//   --salida <carpeta>   dónde escribir capturas/reporte (por defecto responsive/.salida/<fecha>)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolverSeleccion, TODAS_LAS_PANTALLAS, MODULOS } from "./pantallas/registro.mjs";
import { ejecutarQualityGate } from "./motor/ejecutor.mjs";
import { imprimirReporte, guardarReporte } from "./motor/reporte.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

function parsearArgv(argv) {
  const opts = { ids: [], modulo: null, todas: false, baseURL: process.env.RESPONSIVE_BASE_URL || "http://localhost:3010", capturasTodas: false, headed: false, tolerancia: 1, salida: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--module" || a === "--modulo") opts.modulo = argv[++i];
    else if (a === "--base-url") opts.baseURL = argv[++i];
    else if (a === "--capturas-todas") opts.capturasTodas = true;
    else if (a === "--headed") opts.headed = true;
    else if (a === "--tolerancia") opts.tolerancia = Number(argv[++i]);
    else if (a === "--salida") opts.salida = argv[++i];
    else if (a === "all" || a === "todas") opts.todas = true;
    else if (a === "--help" || a === "-h") { imprimirAyuda(); process.exit(0); }
    else opts.ids.push(a);
  }
  return opts;
}

function imprimirAyuda() {
  console.log(`Responsive Quality Gate — pantallas: ${[...TODAS_LAS_PANTALLAS].map((p) => p.id).join(", ")}`);
  console.log(`Módulos: ${[...MODULOS.keys()].join(", ")}`);
  console.log("\nUso: pnpm --filter web responsive:check <pantalla...|--module <modulo>|all> [--base-url URL] [--capturas-todas] [--headed]");
}

async function main() {
  const opts = parsearArgv(process.argv.slice(2));
  if (!opts.ids.length && !opts.modulo && !opts.todas) {
    imprimirAyuda();
    process.exit(1);
  }

  const pantallas = resolverSeleccion({ ids: opts.ids, modulo: opts.modulo, todas: opts.todas });
  const seleccion = opts.todas ? "all" : opts.modulo ? `--module ${opts.modulo}` : opts.ids.join(" ");

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dirSalida = opts.salida ? opts.salida : join(AQUI, ".salida", runId);

  console.log(`Responsive Quality Gate — corriendo ${pantallas.length} pantalla(s) contra ${opts.baseURL}`);
  console.log(`Selección: ${seleccion}`);
  console.log(`Salida: ${dirSalida}\n`);

  const { resultados, duracionMs } = await ejecutarQualityGate(pantallas, {
    baseURL: opts.baseURL,
    dirSalida,
    capturasTodas: opts.capturasTodas,
    headed: opts.headed,
    tolerancia: opts.tolerancia,
  });

  const { exitoso } = imprimirReporte(resultados, { dirSalida });
  guardarReporte(resultados, { dirSalida, duracionMs, seleccion });

  console.log(`\nTiempo: ${(duracionMs / 1000).toFixed(1)}s · Reporte: ${join(dirSalida, "reporte.md")}`);
  process.exit(exitoso ? 0 : 1);
}

main().catch((e) => {
  console.error("responsive: error fatal —", e.message);
  process.exit(2);
});
