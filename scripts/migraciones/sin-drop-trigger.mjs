#!/usr/bin/env node
/**
 * Candado de migraciones — ninguna migración nueva usa `drop trigger`.
 *
 * EL PROBLEMA QUE RESUELVE. El SQL Editor de producción corre todo lo pegado en UNA transacción, y en Supabase un
 * `drop trigger` —aunque el disparador no exista, aunque diga `if exists`— toma en exclusiva las 21 tablas de `auth` y
 * `storage` hasta el final (medido el 2026-09-24, ADR-0195). Si la misma pegada ya tiene tomada una tabla que la tienda
 * usa, choca con el Asesor de seguridad del panel: `40P01 deadlock detected`, y no se aplica nada. La regla está en
 * CLAUDE.md («Políticas y deadlocks»), pero una regla escrita no frena a nadie: el 2026-09-27 `20260927190000` (costo,
 * #520) llegó a `main` con un `drop trigger` y hubo que corregirla en otro PR (#538).
 *
 * QUÉ PROMETE. Sale con código 1 y nombra archivo y línea si una migración de `supabase/migrations/` (con número o de
 * las que se pegan a mano, como `pegar-en-produccion-*.sql`) tiene `drop trigger` fuera de un comentario, salvo las 22
 * del LEGADO, que ya se pegaron y no se editan. Cuenta también el que va dentro de un texto (`execute 'drop trigger …'`
 * en un bloque `do`): corre al pegar igual que el suelto.
 *
 * QUÉ NO PUEDE DECIR. No sabe si la migración se pegó en producción ni en qué partes: eso lo dice la casilla «SQL
 * pegado en producción» del formulario de PR. Tampoco revisa la otra mitad de la regla (no mezclar el `alter` de una
 * tabla en uso con `create policy` en la misma pegada), porque las partes de una migración no se distinguen leyendo el
 * archivo.
 *
 * QUÉ HACER SI SALE ROJO. Cambia `drop trigger x on t; create trigger x …` por `create or replace trigger x …`
 * (Postgres 14+; producción es 17). Si lo que querías era apagar el disparador, `alter table t disable trigger x` no
 * toma esos candados. Nunca agregues tu archivo al LEGADO: el legado es solo lo que ya estaba en `main` el 2026-09-28.
 *
 * USO
 *   pnpm migraciones:sin-drop-trigger
 *   node scripts/migraciones/sin-drop-trigger.mjs <carpeta>   → otra carpeta (para probarlo)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Las migraciones que ya tenían `drop trigger` en `main` el 2026-09-28, con cuántos. Ya corrieron en producción y una
 * migración de `main` no se edita. Se guarda la cantidad para que agregarle uno más a un archivo viejo también salga rojo.
 */
export const LEGADO = new Map([
  ["20260914165703_movimientos_inmutables.sql", 1],
  ["20260915224501_categorias_subcategoria.sql", 1],
  ["20260916220000_colores_proponer_aprobar.sql", 1],
  ["20260917100000_tallas_vocabulario_cerrado.sql", 1],
  ["20260918010000_familias_tabla_propia.sql", 2],
  ["20260918020000_censo_alta_al_vuelo.sql", 1],
  ["20260918230000_producto_nombre_una_sola_forma.sql", 1],
  ["20260918231000_marcas_y_proveedor_en_productos.sql", 1],
  ["20260919172000_reparto_compra_por_tienda.sql", 3],
  ["20260921100000_comprobantes_produccion.sql", 2],
  ["20260921140000_recibir_comprobante_produccion.sql", 2],
  ["20260922110000_colaboradores_suspender_y_actividad.sql", 3],
  ["20260922130000_archivar_datos_de_prueba.sql", 1],
  ["20260923010000_terminales_sin_persona.sql", 1],
  ["20260923030000_roles_por_modulo.sql", 6],
  ["20260923161700_prendas_por_regularizar.sql", 3],
  ["20260923180200_compras_tienda_gestora_y_lectura.sql", 2],
  ["20260923180300_compras_pagar_por_tienda.sql", 1],
  ["20260923184300_version_del_catalogo.sql", 1],
  ["20260923240000_quien_en_acciones_pendientes.sql", 1],
  ["20260924160000_edicion_simultanea_con_version.sql", 3],
  ["pegar-en-produccion-taxonomia-parte-segura.sql", 1],
]);

/**
 * Borra los comentarios (`-- …` y `/* … *\/`, que en Postgres se anidan) y deja todo lo demás, incluidos los textos
 * entre comillas: un `drop trigger` dentro de un `execute '…'` corre igual. Cada carácter borrado se cambia por un
 * espacio y los saltos de línea se conservan, para que el número de línea siga siendo el del archivo.
 */
export function sinComentarios(sql) {
  let out = "";
  let i = 0;
  let enTexto = false;
  let conBarra = false; // E'…': la barra escapa la comilla
  while (i < sql.length) {
    const c = sql[i];
    const d = sql[i + 1];
    if (enTexto) {
      out += c;
      if (conBarra && c === "\\") { out += d ?? ""; i += 2; continue; }
      if (c === "'") {
        if (d === "'") { out += d; i += 2; continue; }
        enTexto = false;
      }
      i++;
      continue;
    }
    if (c === "-" && d === "-") {
      while (i < sql.length && sql[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && d === "*") {
      let nivel = 0;
      while (i < sql.length) {
        if (sql[i] === "/" && sql[i + 1] === "*") { nivel++; out += "  "; i += 2; continue; }
        if (sql[i] === "*" && sql[i + 1] === "/") { nivel--; out += "  "; i += 2; if (nivel === 0) break; continue; }
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    if (c === "'") {
      enTexto = true;
      conBarra = /[eE]/.test(sql[i - 1] ?? "") && !/[\w$]/.test(sql[i - 2] ?? "");
    }
    out += c;
    i++;
  }
  return out;
}

/** Números de línea (desde 1) de cada `drop trigger` fuera de un comentario. */
export function lineasConDropTrigger(sql) {
  const limpio = sinComentarios(sql);
  const lineas = [];
  for (const m of limpio.matchAll(/\bdrop\s+trigger\b/gi)) {
    lineas.push(limpio.slice(0, m.index).split("\n").length);
  }
  return lineas;
}

/**
 * Recibe `[[nombre, contenido], …]` y devuelve `[{ archivo, lineas, legado }]` solo de lo que está mal: un archivo
 * fuera del legado con algún `drop trigger`, o uno del legado con más de los que tenía.
 */
export function migracionesConDropTrigger(archivos, legado = LEGADO) {
  const malas = [];
  for (const [archivo, contenido] of archivos) {
    const lineas = lineasConDropTrigger(contenido);
    if (lineas.length === 0) continue;
    const permitidos = legado.get(archivo) ?? 0;
    if (lineas.length > permitidos) malas.push({ archivo, lineas, legado: permitidos });
  }
  return malas.sort((a, b) => a.archivo.localeCompare(b.archivo));
}

function main() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const carpeta = resolve(process.argv[2] ?? join(raiz, "supabase", "migrations"));
  const nombres = readdirSync(carpeta).filter((n) => n.endsWith(".sql")).sort();
  const malas = migracionesConDropTrigger(nombres.map((n) => [n, readFileSync(join(carpeta, n), "utf8")]));

  if (malas.length === 0) {
    console.log(`✓ ${nombres.length} archivos .sql en ${carpeta}: ninguna migración nueva usa drop trigger (legado: ${LEGADO.size}).`);
    return;
  }

  console.error("✗ Migraciones con `drop trigger` (en Supabase toma en exclusiva auth y storage hasta el final de la pegada, ADR-0195):");
  for (const { archivo, lineas, legado } of malas) {
    const extra = legado > 0 ? ` (el legado permite ${legado}; ahora hay ${lineas.length})` : "";
    console.error(`  - ${archivo}: línea${lineas.length > 1 ? "s" : ""} ${lineas.join(", ")}${extra}`);
  }
  console.error("\nUsa `create or replace trigger …` (o `alter table … disable trigger …` si solo querías apagarlo).");
  console.error("Detalle: encabezado de scripts/migraciones/sin-drop-trigger.mjs y CLAUDE.md, «Políticas y deadlocks».");
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
