// Las pruebas que vuelven a pegar una migración VIEJA de `registrar_venta` (el redondeo, 20261003130000) o que comparan su huella
// exacta con la que esa migración prometió, corren sobre una base donde después se aplicaron parches a la función: el precio por
// sede (20261010100200, ADR-0370), que cambió una línea, y el origen de la línea sugerida (20261010220100, «Combina bien con»), que
// sumó una columna al insert de `venta_items`; entre los dos, las piezas de liquidación (20261010195000, ADR-0379) le hicieron dos
// reemplazos anclados; y al final, el candado del precio 0 (20261012190000, ADR-0384), otro reemplazo anclado. El candado de huella
// de la migración vieja los rechaza, y está bien que lo haga.
//
// Para probar la migración vieja sobre SU punto de partida, este texto devuelve la función a como estaba antes de esos parches
// (se deshacen del más nuevo al más viejo). SOLO va dentro de una transacción que se deshace, o seguido de `REHACER_POSTERIORES`
// (los archivos de esas migraciones, re-ejecutables, en orden), para que la base termine igual que empezó.
//
// Un parche nuevo a `registrar_venta` posterior al redondeo se suma AQUÍ (su inverso en DESHACER y su archivo en REHACER): si no,
// `pruebas:redondeo-efectivo` y `pruebas:club-registro-cartel` fallan con «cambió desde que se escribió esta migración».
import { readFileSync } from "node:fs";

const FIRMA = `(select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'retail' and p.proname = 'registrar_venta')`;

/** Inverso de 20261012190000 (ADR-0384): quita el candado `venta_sin_precio`. El reemplazo se lee del archivo (el de `registrar_venta`,
 *  el único de los cuatro que trae `venta_sin_precio`) para no copiarlo. Si la base no lo tiene, `replace` no cambia nada. */
const PRECIO_CERO = readFileSync("supabase/migrations/20261012190000_precio_cero_solo_empaque.sql", "utf8");
const REEMPLAZO_PRECIO_CERO = [...PRECIO_CERO.matchAll(/\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g)]
  .map((m) => [m[1], m[2]])
  .filter(([, nuevo]) => nuevo.includes("venta_sin_precio"));
if (REEMPLAZO_PRECIO_CERO.length !== 1) throw new Error("registrar-venta-antes-de-precio-sede: no encontré el reemplazo de registrar_venta del precio 0");
export const DESHACER_PRECIO_CERO = `do $deshacer$
declare
  v_firma text := ${FIRMA};
begin
  execute replace(pg_get_functiondef(v_firma::regprocedure), $q$${REEMPLAZO_PRECIO_CERO[0][1]}$q$, $q$${REEMPLAZO_PRECIO_CERO[0][0]}$q$);
end $deshacer$;
`;
/** Rehacerlo es volver a pegar la migración entera: es re-ejecutable y, en las otras tres funciones, no cambia nada. */
export const REHACER_PRECIO_CERO = PRECIO_CERO;

/** Inverso de 20261010220100 (parte 2 del origen de la línea sugerida): quita `origen_sugerencia` del insert de venta_items. */
export const DESHACER_ORIGEN_SUGERENCIA = `do $deshacer$
declare
  v_firma text := ${FIRMA};
begin
  execute replace(replace(pg_get_functiondef(v_firma::regprocedure),
    $q$      descuento_club_unitario, origen_sugerencia
    )
      values ($q$,
    $q$      descuento_club_unitario
    )
      values ($q$),
    $q$        coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0),
        nullif(btrim(coalesce(v_item ->> 'origen_sugerencia', '')), '')
      )
      returning id into v_item_id;$q$,
    $q$        coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)
      )
      returning id into v_item_id;$q$);
end $deshacer$;
`;

/** Los dos reemplazos de liquidación (9a y 9b de 20261010195000), leídos del archivo para no copiarlos: [viejo, nuevo] en el orden en
 *  que se aplican. Se deshacen del último al primero; si la base no los tiene, `replace` no cambia nada. */
const LIQUIDACION = readFileSync("supabase/migrations/20261010195000_piezas_de_liquidacion.sql", "utf8");
const REEMPLAZOS_LIQUIDACION = [...LIQUIDACION.matchAll(/\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g)].map((m) => [m[1], m[2]]);
if (REEMPLAZOS_LIQUIDACION.length !== 2) throw new Error("registrar-venta-antes-de-precio-sede: no encontré los dos reemplazos de liquidación");
export const DESHACER_LIQUIDACION = `do $deshacer$
declare
  v_firma text := ${FIRMA};
begin
${[...REEMPLAZOS_LIQUIDACION]
  .reverse()
  .map(([viejo, nuevo]) => `  execute replace(pg_get_functiondef(v_firma::regprocedure), $q$${nuevo}$q$, $q$${viejo}$q$);`)
  .join("\n")}
end $deshacer$;
`;
/** Rehace SOLO los dos reemplazos (no la migración entera: volvería a crear la `crear_pieza_liquidacion` de tres parámetros junto a la
 *  de cinco). Es re-ejecutable: `pg_temp.reemplazar` no hace nada si el texto nuevo ya está. */
export const REHACER_LIQUIDACION = LIQUIDACION.slice(
  LIQUIDACION.indexOf("create or replace function pg_temp.reemplazar"),
  LIQUIDACION.indexOf("-- ---------- 10."),
);

/** Inverso de 20261010100200 (precio por sede): la venta vuelve a comparar contra `variantes.precio`. */
export const DESHACER_PRECIO_SEDE = `do $deshacer$
declare
  v_firma text := ${FIRMA};
begin
  execute replace(pg_get_functiondef(v_firma::regprocedure),
    'retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, ''sin código'')',
    'v.precio, p.referencia, coalesce(v.codigo, v.sku, ''sin código'')');
end $deshacer$;
`;

export const REHACER_PRECIO_SEDE = readFileSync("supabase/migrations/20261010100200_venta_cobra_precio_de_sede.sql", "utf8");
export const REHACER_ORIGEN_SUGERENCIA = readFileSync("supabase/migrations/20261010220100_venta_items_origen_sugerencia_parte2.sql", "utf8");

/** Todos los parches posteriores al redondeo, deshechos del más nuevo al más viejo. */
export const DESHACER_POSTERIORES = `${DESHACER_PRECIO_CERO}\n${DESHACER_ORIGEN_SUGERENCIA}\n${DESHACER_LIQUIDACION}\n${DESHACER_PRECIO_SEDE}`;
/** Y rehechos en su orden. */
export const REHACER_POSTERIORES = `${REHACER_PRECIO_SEDE}\n${REHACER_LIQUIDACION}\n${REHACER_ORIGEN_SUGERENCIA}\n${REHACER_PRECIO_CERO}`;
