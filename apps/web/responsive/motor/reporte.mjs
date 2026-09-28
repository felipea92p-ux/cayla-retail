// Reporte del Responsive Quality Gate — formatea `resultados` (de `ejecutor.mjs`) para consola,
// y los vuelca a `reporte.md` / `reporte.json` en la carpeta de salida de la corrida.

import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Agrupa por pantalla → escenario, preservando el orden en que se corrieron. */
function agrupar(resultados) {
  const grupos = [];
  const indice = new Map();
  for (const r of resultados) {
    const clave = `${r.pantalla.id}::${r.escenario.id}`;
    let g = indice.get(clave);
    if (!g) {
      g = { pantalla: r.pantalla, escenario: r.escenario, items: [] };
      indice.set(clave, g);
      grupos.push(g);
    }
    g.items.push(r);
  }
  return grupos;
}

function lineaCaso(r) {
  const estado = r.error ? "ERROR" : r.ok ? "PASS" : "FAIL";
  return `${r.viewport.id.padEnd(10)} ${estado}`;
}

function bloqueFalla(r, dirSalida) {
  const lineas = [];
  if (r.error) {
    lineas.push(`FAIL (error al ejecutar el escenario):`);
    lineas.push(`  ${r.error}`);
    return lineas.join("\n");
  }
  for (const c of r.clipping) {
    lineas.push(`FAIL [${r.viewport.id}]:`);
    lineas.push(`  Elemento: ${c.selector}${c.texto ? ` — "${c.texto}"` : ""} (${c.tipo})`);
    lineas.push(`  ${c.lado === "izquierda" ? "left" : c.lado === "derecha" ? "right" : "left/right"}: ${c.lado !== "izquierda" ? c.rect.right : c.rect.left}px`);
    lineas.push(`  límite (${c.contra}): ${c.lado === "izquierda" ? c.limite.left : c.limite.right}px`);
    lineas.push(`  clipping: ${c.exceso}px`);
    if (r.screenshot) lineas.push(`  Screenshot: ${relative(dirSalida, r.screenshot)}`);
  }
  if (r.advertencia) lineas.push(`  Advertencia: ${r.advertencia}`);
  return lineas.join("\n");
}

/**
 * Imprime el reporte en consola (formato pedido: encabezado → líneas PASS/FAIL por viewport →
 * detalle de cada FAIL → resumen final) y devuelve `{ pasan, fallan, exitoso }`.
 */
export function imprimirReporte(resultados, { dirSalida }) {
  console.log("RESPONSIVE QUALITY GATE\n");
  const grupos = agrupar(resultados);

  for (const g of grupos) {
    console.log(`${g.pantalla.modulo} / ${g.pantalla.nombre} / ${g.escenario.nombre}`);
    for (const r of g.items) console.log("  " + lineaCaso(r));
    const fallas = g.items.filter((r) => !r.ok);
    if (fallas.length) {
      console.log("");
      for (const r of fallas) console.log(bloqueFalla(r, dirSalida).replace(/^/gm, "  "));
    }
    console.log("");
  }

  const pasan = resultados.filter((r) => r.ok).length;
  const fallan = resultados.length - pasan;
  console.log("RESULTADO");
  console.log(`${pasan} PASS`);
  console.log(`${fallan} FAIL`);
  console.log(`QUALITY GATE: ${fallan === 0 ? "PASSED" : "FAILED"}`);

  return { pasan, fallan, exitoso: fallan === 0 };
}

/** Escribe `reporte.json` (para que Claude Code lo lea sin parsear texto) y `reporte.md`. */
export function guardarReporte(resultados, { dirSalida, duracionMs, seleccion }) {
  const grupos = agrupar(resultados).map((g) => ({
    pantalla: g.pantalla.id,
    modulo: g.pantalla.modulo,
    nombre: g.pantalla.nombre,
    escenario: g.escenario.id,
    casos: g.items.map((r) => ({
      viewport: r.viewport.id,
      ok: r.ok,
      overflowGlobal: r.overflowGlobal,
      clipping: r.clipping,
      advertencia: r.advertencia,
      screenshot: r.screenshot ? relative(dirSalida, r.screenshot) : null,
      error: r.error,
    })),
  }));

  const pasan = resultados.filter((r) => r.ok).length;
  const fallan = resultados.length - pasan;

  const json = {
    generadoEn: new Date().toISOString(),
    seleccion,
    duracionMs,
    totales: { pasan, fallan, total: resultados.length, exitoso: fallan === 0 },
    grupos,
  };
  writeFileSync(join(dirSalida, "reporte.json"), JSON.stringify(json, null, 2));

  const md = [
    "# Responsive Quality Gate",
    "",
    `Generado: ${json.generadoEn} · Selección: \`${seleccion}\` · Duración: ${(duracionMs / 1000).toFixed(1)}s`,
    "",
    `**${fallan === 0 ? "✅ PASSED" : "❌ FAILED"}** — ${pasan} PASS / ${fallan} FAIL de ${resultados.length} casos`,
    "",
    ...grupos.flatMap((g) => [
      `## ${g.modulo} / ${g.nombre} / ${g.escenario}`,
      "",
      "| Viewport | Resultado |",
      "|---|---|",
      ...g.casos.map((c) => `| ${c.viewport} | ${c.error ? "ERROR" : c.ok ? "PASS" : "FAIL"} |`),
      "",
      ...g.casos
        .filter((c) => !c.ok)
        .flatMap((c) => [
          `**FAIL ${c.viewport}**${c.error ? ` — error: ${c.error}` : ""}`,
          ...c.clipping.map((cl) => `- \`${cl.selector}\` se sale ${cl.exceso}px por la ${cl.lado} (contra ${cl.contra})${c.screenshot ? ` — ![](./capturas/${c.screenshot.split("/").pop()})` : ""}`),
          "",
        ]),
    ]),
  ].join("\n");
  writeFileSync(join(dirSalida, "reporte.md"), md);
}
