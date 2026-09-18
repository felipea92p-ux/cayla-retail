#!/usr/bin/env node
/**
 * Pruebas de abrir_caja/cerrar_caja contra Postgres real — el núcleo del dinero.
 *
 * EL PROBLEMA QUE RESUELVE. `abrir_caja`, `registrar_movimiento_caja` y `cerrar_caja`
 * (0008_caja_y_pagos.sql) nunca tuvieron una prueba automatizada. Cada sesión que tocó
 * Caja (ADR-0052/0053/0056) las verificó a mano con psql en una transacción con
 * rollback — y esa verificación se perdía apenas se cerraba la sesión, sin quedar
 * escrita para volver a correrla. `scripts/caja/verificar.sql` es esa prueba, por fin
 * guardada; este archivo la corre y traduce el resultado a un reporte legible.
 *
 * QUÉ HACE. Corre el `.sql` contra el contenedor local (mismo patrón que
 * `migraciones:verificar`: `docker exec` + psql, sin exponer un puerto ni credenciales
 * nuevas). El `.sql` mismo va en una única transacción que termina en `rollback` — nada
 * de lo que hace esta prueba queda escrito, ni siquiera si algo sale mal a mitad de
 * camino. Cada escenario se reporta con `raise notice 'RESULTADO|...'` (no con una
 * tabla: se probó primero con una tabla temporal y el propio `rollback to savepoint` de
 * cada grupo borraba también los resultados, no solo los efectos de la RPC bajo
 * prueba — un NOTICE es un mensaje al cliente, sobrevive al rollback).
 *
 * A DIFERENCIA DE `migraciones:verificar` (que solo informa, nunca fallar es su
 * diseño): esto SÍ es una prueba — sale con código 1 si algún escenario no dio lo
 * esperado, para que se pueda enganchar a CI el día que exista.
 *
 * USO
 *   pnpm caja:verificar
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const SQL = join(fileURLToPath(new URL(".", import.meta.url)), "verificar.sql");

function main() {
  const script = readFileSync(SQL, "utf8");
  const proceso = spawnSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-f", "-"],
    { input: script, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );

  if (proceso.error) {
    console.error(`No se pudo ejecutar \`docker exec\` (¿está Docker corriendo?): ${proceso.error.message}`);
    process.exit(1);
  }

  // psql manda `raise notice` a stderr, no a stdout — mismo canal que usaría un
  // cliente real (PostgREST) para logs, así que no hace falta tocar client_min_messages.
  const lineas = proceso.stderr.split("\n").filter((l) => l.includes("NOTICE:  RESULTADO|"));

  if (lineas.length === 0) {
    console.error("No se encontró ningún resultado — algo abortó la transacción antes de terminar.");
    console.error("\n--- stderr completo de psql ---");
    console.error(proceso.stderr);
    process.exit(1);
  }

  const resultados = lineas.map((linea) => {
    const desde = linea.indexOf("RESULTADO|");
    const [, escenario, ok, ...resto] = linea.slice(desde).split("|");
    return { escenario, ok: ok === "t", detalle: resto.join("|").trim() };
  });

  const linea = "─".repeat(78);
  console.log(`\n${linea}\n  caja:verificar — abrir_caja / registrar_movimiento_caja / cerrar_caja\n${linea}\n`);

  let fallidos = 0;
  for (const r of resultados) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.escenario}`);
    if (!r.ok) {
      console.log(`      ${r.detalle}`);
      fallidos++;
    }
  }

  console.log(`\n${linea}`);
  console.log(`  ${resultados.length - fallidos}/${resultados.length} escenarios en verde.`);
  console.log(`${linea}\n`);

  if (fallidos > 0) {
    console.error(`${fallidos} escenario(s) no dieron lo esperado — ver detalle arriba.`);
    process.exit(1);
  }
}

main();
