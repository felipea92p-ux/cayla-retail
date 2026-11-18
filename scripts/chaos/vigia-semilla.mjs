#!/usr/bin/env node
/**
 * La siembra del vigía diario de producción (ADR-0632), sacada de las invariantes de `/chaos`.
 *
 * EL PROBLEMA QUE RESUELVE. `invariantes.mjs` sabe qué estados son imposibles (stock que no cuadra con `movimientos`, una venta cuyos
 * pagos no suman…), pero solo los mira en la base LOCAL, durante un ataque. Producción nunca se miraba. El vigía guarda esas mismas
 * consultas como datos (`retail.invariantes`) y las corre cada madrugada. Para que no existan DOS definiciones que se separen con el
 * tiempo, la siembra no se escribe a mano: sale de aquí, y `vigia-semilla.test.mjs` falla si la última migración que siembra no es
 * igual a lo que este archivo genera hoy.
 *
 * QUÉ DECIDE AQUÍ (y no en la base):
 *   · `activa`: una SOSPECHA (heurística, puede ser legítima) nace apagada. Un aviso que grita por algo que a veces está bien se
 *     aprende a ignorar en una semana y arrastra a los demás. Sigue viva en `/chaos`, donde una persona la mira.
 *   · `requiere_sesion`: la que `/chaos` corre «como líder» (`comoLider`) necesita una sesión con permisos que el trabajo programado no
 *     tiene. El vigía la marca «omitida» con su motivo; nunca «limpia».
 *
 * USO
 *   node scripts/chaos/vigia-semilla.mjs        → imprime el bloque de siembra (va entre los marcadores de la migración)
 */
import { pathToFileURL } from "node:url";
import { INVARIANTES } from "./invariantes.mjs";

export const MARCA_INICIO = "-- >>> siembra generada por scripts/chaos/vigia-semilla.mjs: no se edita a mano";
export const MARCA_FIN = "-- <<< fin de la siembra generada";

const COMILLA_SQL = "$inv$";
const COMILLA_TEXTO = "$txt$";

/** Lo que el vigía guarda de cada invariante: la misma consulta del detector, más su clave y si nace encendida. */
export function filasDelVigia(invariantes = INVARIANTES) {
  return invariantes.map((i) => ({
    id: i.id,
    nombre: i.nombre,
    gravedad: i.gravedad,
    nivel: i.nivel,
    dice: i.dice,
    sql: i.sql.trim().replace(/;\s*$/, ""),
    clave: i.clave,
    requiereSesion: Boolean(i.comoLider),
    activa: i.nivel !== "sospecha",
  }));
}

function entre(comilla, texto) {
  if (texto.includes(comilla)) throw new Error(`El texto trae ${comilla}: cambia la comilla de la siembra antes de generarla.`);
  return `${comilla}${texto}${comilla}`;
}

const lista = (cols) => `array[${cols.map((c) => `'${c}'`).join(", ")}]::text[]`;

/**
 * El bloque SQL que siembra o actualiza `retail.invariantes`. Idempotente. Al actualizar NO toca `activa` (si alguien apagó una en
 * producción, una siembra nueva no la vuelve a encender). Si cambian la consulta o la clave, deja `linea_base_en` en null: las huellas
 * de antes ya no se pueden comparar, y la próxima corrida arma la línea base de nuevo.
 */
export function semillaSql(filas = filasDelVigia()) {
  const valores = filas
    .map(
      (f) =>
        `  ('${f.id}', '${f.nombre}', ${f.gravedad}, '${f.nivel}', ${lista(f.clave)}, ${f.requiereSesion}, ${f.activa},\n` +
        `   ${entre(COMILLA_TEXTO, f.dice)},\n` +
        `   ${entre(COMILLA_SQL, f.sql)})`,
    )
    .join(",\n");
  return [
    MARCA_INICIO,
    "insert into retail.invariantes (id, nombre, gravedad, nivel, clave, requiere_sesion, activa, dice, sql) values",
    valores,
    "on conflict (id) do update set",
    "  nombre = excluded.nombre, gravedad = excluded.gravedad, nivel = excluded.nivel, dice = excluded.dice,",
    "  requiere_sesion = excluded.requiere_sesion, sql = excluded.sql, clave = excluded.clave,",
    "  linea_base_en = case when retail.invariantes.sql is distinct from excluded.sql",
    "                         or retail.invariantes.clave is distinct from excluded.clave",
    "                       then null else retail.invariantes.linea_base_en end;",
    MARCA_FIN,
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(semillaSql());
}
