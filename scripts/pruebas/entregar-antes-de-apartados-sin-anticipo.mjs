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

/** Inverso de 20261014150000 (ADR-0399): quita el camino de la boleta por el total y la puerta del saldo vuelve a ser la de antes. */
export const DESHACER_ENTREGA_POR_EL_TOTAL = `do $deshacer$
declare
  v_firma text := ${FIRMA};
begin
  execute replace(pg_get_functiondef(v_firma::regprocedure), $q$${REEMPLAZOS[0][1]}$q$, $q$${REEMPLAZOS[0][0]}$q$);
end $deshacer$;
`;

/** Rehacerlo es volver a pegar la migración entera: es re-ejecutable (`pg_temp.reemplazar` no hace nada si el texto nuevo ya está). */
export const REHACER_ENTREGA_POR_EL_TOTAL = ARCHIVO;
