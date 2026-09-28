#!/usr/bin/env node
/**
 * Deriva — ¿producción corre la MISMA versión que `main`? La mitad que `verificar.mjs` no puede decir.
 *
 * EL PROBLEMA QUE RESUELVE. El SQL de producción se pega a mano y Vercel publica `main` al fusionar. Pasa en las dos
 * direcciones y nada lo avisaba:
 *   - SQL de `main` sin pegar: el 2026-09-27 se publicaron 6 cambios sin su SQL (el botón «Pedir» roto, el nº de
 *     operación de Yape perdido en silencio…).
 *   - Arreglos hechos directo en producción que `main` no tiene: se pierden la próxima vez que una migración recrea esa
 *     función desde el repo (le pasó a Análisis con el PR 397).
 * `verificar.mjs` responde «¿existe algo con ese nombre?»; con `create or replace` repetido no sabe CUÁL versión está
 * viva. Esto compara huellas del catálogo: cuerpo de cada función, permisos, políticas, disparadores, columnas,
 * candados, índices y vistas del schema `retail`.
 *
 * CÓMO SE USA
 *   1. Huellas de main: una base con todas las migraciones de main (el CI, o el Postgres desechable) y
 *        psql -At -f scripts/migraciones/deriva.sql > main.tsv
 *   2. Huellas de producción: la MISMA consulta en producción, solo lectura (el SQL Editor o el conector de Supabase), o
 *      `select retail.huellas_catalogo('<llave>')`. Se guarda la celda, o la respuesta JSON del conector, en un archivo.
 *   3. node scripts/migraciones/deriva.mjs main.tsv produccion.tsv [--markdown]
 *      Con `--resumen`, solo las cuentas y sin nombres: es lo que publica la revisión diaria (`deriva-diaria.yml`), porque
 *      el repo es público. Cada mañana GitHub pide las huellas de producción a `retail.huellas_catalogo` con su llave
 *      (20260928210000, ADR-0251).
 *
 * QUÉ PROMETE. Lista, en palabras del negocio, lo que está en main y no en producción, lo que está en producción y no
 * en main, y lo que está en las dos con otra versión. Sale con código 1 si hay algo que no está en CONOCIDAS.
 *
 * QUÉ NO PUEDE DECIR. De lo «distinto» no sabe cuál de las dos versiones es la nueva: eso se mira con
 * `pg_get_functiondef` en producción y `git log -S` en el repo. Tampoco mira datos (filas sembradas por una migración):
 * solo el catálogo. Y no ve Dynamic (`public`) ni las políticas de `storage`, que en este proyecto son de Dynamic.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Diferencias que se sabe que existen y no son SQL sin pegar ni arreglos perdidos. Cada una con su porqué: agregar una
 * aquí es decir «esto está bien así», no «esto molesta».
 */
export const CONOCIDAS = [
  {
    patron: /^(columna|candado|indice|permiso|rls|politica)\tgastos_legado_2026_09(\.|_|$)/,
    motivo: "La tabla vieja de gastos que Finanzas renombró (20260924235100) solo si tenía datos: existe en producción y no en una base nueva.",
  },
  {
    patron: /^fn\tregistrar_gasto_legado_2026_09\(/,
    motivo: "La función vieja de gastos, renombrada junto con su tabla por 20260924235100 solo en una base con datos.",
  },
  {
    patron: /^candado\tgastos\.gastos_(igv_check|ubicacion_id_fkey)1?$/,
    motivo: "Mismo candado de `gastos`; en producción conserva el sufijo 1 de cuando la tabla vieja tomó el nombre original (20260924235100).",
  },
  {
    patron: /^(columna|permiso|rls|vista)\tplanilla_por_sede\b/,
    motivo: "20260921160000 crea la vista solo si Dynamic tiene sus tablas de planilla; la base de main usa el stub de Dynamic, que no las tiene.",
  },
];

/** Lee una celda de huellas: la salida de psql, o la respuesta JSON del MCP de Supabase guardada tal cual. */
export function leerHuellas(texto) {
  let celda = texto.trim();
  if (celda.startsWith("{") || celda.startsWith("[")) {
    const buscar = (valor) => {
      if (typeof valor === "string") {
        const m = valor.match(/\[\{[\s\S]*\}\]/);
        return m ? buscar(JSON.parse(m[0])) : null;
      }
      if (Array.isArray(valor)) return valor.length ? buscar(valor[0]) : null;
      if (valor && typeof valor === "object") {
        if (typeof valor.huellas === "string") return valor.huellas;
        for (const v of Object.values(valor)) {
          const r = buscar(v);
          if (r) return r;
        }
      }
      return null;
    };
    celda = buscar(JSON.parse(celda)) ?? "";
  }
  const huellas = new Map();
  for (const linea of celda.split("\n")) {
    if (!linea.trim()) continue;
    const [g, k, h] = linea.split("\t");
    if (!g || !k || !h) throw new Error(`Línea de huellas mal formada: ${linea.slice(0, 120)}`);
    huellas.set(`${g}\t${k}`, h);
  }
  return huellas;
}

/** Compara las huellas. Devuelve `{ soloMain, soloProduccion, distintas, conocidas }`, cada una con `{ g, k, motivo? }`. */
export function compararHuellas(main, produccion, conocidas = CONOCIDAS) {
  const r = { soloMain: [], soloProduccion: [], distintas: [], conocidas: [] };
  const claves = [...new Set([...main.keys(), ...produccion.keys()])].sort();
  for (const clave of claves) {
    const enMain = main.get(clave);
    const enProd = produccion.get(clave);
    if (enMain === enProd) continue;
    const [g, k] = clave.split("\t");
    const conocida = conocidas.find((c) => c.patron.test(clave));
    if (conocida) {
      r.conocidas.push({ g, k, motivo: conocida.motivo });
      continue;
    }
    if (enProd === undefined) r.soloMain.push({ g, k });
    else if (enMain === undefined) r.soloProduccion.push({ g, k });
    else r.distintas.push({ g, k });
  }
  return r;
}

const GRUPO = {
  fn: "función",
  politica: "política",
  disparador: "disparador",
  permiso: "permiso de tabla",
  rls: "RLS",
  permiso_columna: "permiso de columna",
  schema: "permiso del schema",
  columna: "columna",
  candado: "candado",
  indice: "índice",
  vista: "vista",
};

/** El informe en palabras del negocio (texto para la terminal, o Markdown para un issue). */
export function informe(r, { markdown = false } = {}) {
  const t = (s) => (markdown ? `### ${s}` : `\n${s}`);
  const item = ({ g, k }) => (markdown ? `- ${GRUPO[g] ?? g} \`${k}\`` : `  - ${GRUPO[g] ?? g} ${k}`);
  const partes = [];
  const total = r.soloMain.length + r.soloProduccion.length + r.distintas.length;
  partes.push(
    total === 0
      ? "✓ Producción corre lo mismo que main (fuera de las diferencias conocidas)."
      : `✗ ${total} diferencia${total === 1 ? "" : "s"} entre producción y main.`,
  );
  if (r.soloMain.length) {
    partes.push(t(`Está en main y NO en producción: SQL sin pegar (${r.soloMain.length})`));
    partes.push(...r.soloMain.map(item));
  }
  if (r.soloProduccion.length) {
    partes.push(t(`Está en producción y NO en main: arreglo en vivo que main perdería (${r.soloProduccion.length})`));
    partes.push(...r.soloProduccion.map(item));
  }
  if (r.distintas.length) {
    partes.push(t(`Está en los dos con otra versión: una de las dos está vieja (${r.distintas.length})`));
    partes.push(...r.distintas.map(item));
  }
  if (r.conocidas.length) {
    partes.push(t(`Diferencias conocidas, que están bien así (${r.conocidas.length})`));
    const porMotivo = new Map();
    for (const c of r.conocidas) porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
    for (const [motivo, n] of porMotivo) partes.push(markdown ? `- ${n} × ${motivo}` : `  - ${n} × ${motivo}`);
  }
  return partes.join("\n");
}

/**
 * Solo las cuentas, sin nombres: para lo que se publica (el registro de GitHub Actions y los avisos de un repo PÚBLICO).
 * Con nombres, un aviso de «este revoke de main todavía no está en producción» le diría a cualquiera qué puerta sigue
 * abierta. Los nombres se miran en privado: la consulta en el SQL Editor (o el conector de Supabase) y `deriva.mjs` sin
 * `--resumen`.
 */
export function resumen(r) {
  const total = r.soloMain.length + r.soloProduccion.length + r.distintas.length;
  if (total === 0) return "✓ Producción corre lo mismo que main (fuera de las diferencias conocidas).";
  const partes = [
    r.soloMain.length && `${r.soloMain.length} de main sin pegar en producción`,
    r.soloProduccion.length && `${r.soloProduccion.length} solo en producción`,
    r.distintas.length && `${r.distintas.length} con otra versión`,
  ].filter(Boolean);
  return `✗ ${total} diferencia${total === 1 ? "" : "s"} entre producción y main: ${partes.join(", ")}.`;
}

function main() {
  const [rutaMain, rutaProd, ...opciones] = process.argv.slice(2);
  if (!rutaMain || !rutaProd) {
    console.error("Uso: node scripts/migraciones/deriva.mjs <huellas-main> <huellas-produccion> [--markdown | --resumen]");
    process.exit(2);
  }
  const r = compararHuellas(leerHuellas(readFileSync(rutaMain, "utf8")), leerHuellas(readFileSync(rutaProd, "utf8")));
  console.log(opciones.includes("--resumen") ? resumen(r) : informe(r, { markdown: opciones.includes("--markdown") }));
  if (r.soloMain.length + r.soloProduccion.length + r.distintas.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
