// La prueba del redondeo (`redondeo_efectivo.mjs`) vuelve a pegar la migración VIEJA de `entregar_separacion` (20261003135000) y compara
// la huella exacta de la función con la que esa migración prometió. Sobre una base al día eso ya no puede coincidir: después se le
// antepuso el camino «boleta o factura por el total, sin boleta de anticipo» (20261014150000, ADR-0399). El candado de huella de la
// migración vieja lo rechaza, y está bien que lo haga.
//
// Para probar la migración vieja sobre SU punto de partida, este texto devuelve la función a como estaba antes de ese parche. SOLO va
// dentro de una transacción que se deshace, o seguido de `REHACER_ENTREGA_POR_EL_TOTAL`, para que la base termine igual que empezó.
//
// Un parche nuevo a `entregar_separacion` posterior al redondeo se suma AQUÍ (su inverso en DESHACER y su archivo en REHACER): si no,
// `pruebas:redondeo-efectivo` falla con «cambió desde que se escribió esta migración».
import { readFileSync } from "node:fs";

const FIRMA = `(select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'retail' and p.proname = 'entregar_separacion')`;

const ARCHIVO = readFileSync("supabase/migrations/20261014150000_apartados_entregar_boleta_por_el_total.sql", "utf8");
const REEMPLAZOS = [...ARCHIVO.matchAll(/\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g)].map((m) => [m[1], m[2]]);
if (REEMPLAZOS.length !== 1) throw new Error("entregar-antes-de-apartados-sin-anticipo: no encontré el reemplazo de entregar_separacion");

// ADR-0584 (20261030220000): la venta que nace al recoger lleva el motivo del descuento a mano. Es posterior a 20261014150000, así que se
// deshace PRIMERO y se rehace DESPUÉS. De su migración solo se toma el reemplazo de `entregar_separacion` (las demás son de separar_prendas).
const ARCHIVO_DESCUENTO = readFileSync("supabase/migrations/20261030220000_apartar_con_descuento_manual.sql", "utf8");
const DESCUENTO = [
  ...ARCHIVO_DESCUENTO.matchAll(/pg_temp\.firma\('entregar_separacion'\),\s*\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g),
].map((m) => [m[1], m[2]]);
if (DESCUENTO.length !== 1) throw new Error("entregar-antes-de-apartados-sin-anticipo: no encontré el reemplazo de entregar_separacion de ADR-0584");

// ADR-0655 (20261114032000): la prenda de una oferta de grupo se entrega por su propio `insert`, con su parte del ahorro. Es la más nueva:
// se deshace PRIMERO y se rehace al final. De su migración solo se toma el reemplazo de `entregar_separacion` (con su forma `$v$ … $n$`).
const ARCHIVO_GRUPO = readFileSync("supabase/migrations/20261114032000_apartados_con_ofertas_de_grupo.sql", "utf8");
const GRUPO = [
  ...ARCHIVO_GRUPO.matchAll(/proname = 'entregar_separacion'\),\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$,\s*1\);/g),
].map((m) => [m[1], m[2]]);
if (GRUPO.length !== 1) throw new Error("entregar-antes-de-apartados-sin-anticipo: no encontré el reemplazo de entregar_separacion de ADR-0655");

/** Inverso de 20261114032000 (ADR-0655), de 20261030220000 (ADR-0584) y de 20261014150000 (ADR-0399), del más nuevo al más viejo: la
 *  prenda de un grupo deja de tener su camino, la venta vuelve a marcar «campaña» todo descuento, se quita el camino de la boleta por el
 *  total y la puerta del saldo vuelve a ser la de antes. Si la base no tiene un parche, `replace` no cambia nada. */
export const DESHACER_ENTREGA_POR_EL_TOTAL = `do $deshacer$
declare
  v_firma text := ${FIRMA};
begin
  execute replace(pg_get_functiondef(v_firma::regprocedure), $q$${GRUPO[0][1]}$q$, $q$${GRUPO[0][0]}$q$);
  execute replace(pg_get_functiondef(v_firma::regprocedure), $q$${DESCUENTO[0][1]}$q$, $q$${DESCUENTO[0][0]}$q$);
  execute replace(pg_get_functiondef(v_firma::regprocedure), $q$${REEMPLAZOS[0][1]}$q$, $q$${REEMPLAZOS[0][0]}$q$);
end $deshacer$;
`;

/** El de ADR-0655 se rehace solo donde la base tiene sus columnas (una base local que todavía no tiene 20261114032000 queda como estaba:
 *  su migración entera no se puede pegar sin las de antes). */
const REHACER_GRUPO = `do $rehacer_grupo$
declare
  v_firma text := ${FIRMA};
  v_def text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'separacion_items' and column_name = 'descuento_grupo_unitario') then
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position($q$${GRUPO[0][1]}$q$ in v_def) = 0 then
      execute replace(v_def, $q$${GRUPO[0][0]}$q$, $q$${GRUPO[0][1]}$q$);
    end if;
  end if;
end $rehacer_grupo$;
`;

/** Rehacerlo es volver a pegar las migraciones enteras, de la más vieja a la más nueva: son re-ejecutables (`pg_temp.reemplazar` no hace
 *  nada si el texto nuevo ya está). */
export const REHACER_ENTREGA_POR_EL_TOTAL = `${ARCHIVO}\n${ARCHIVO_DESCUENTO}\n${REHACER_GRUPO}`;
