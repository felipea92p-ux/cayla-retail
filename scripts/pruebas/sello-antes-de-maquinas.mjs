// La migración de las máquinas de cobro (20261016173000, ADR-0429) parcha por ancla OCHO funciones vivas: fn_medios_de_cobro_validar,
// guardar_medio_de_cobro, fn_medios_de_cobro, fn_cuenta_sirve, fn_cuenta_sellada (tres veces) y fn_asiento_cuenta_de_medio. Las pruebas
// que vuelven a pegar las migraciones VIEJAS del redondeo (20261003111000, los lectores; 20261003120000, el diario) o que comparan la
// huella exacta de esas funciones con la que esa migración prometió, corren sobre una base que ya tiene estos parches encima: el
// candado de huella de la migración vieja los rechaza, y está bien que lo haga.
//
// Para probar la migración vieja sobre SU punto de partida, este texto devuelve las funciones a como estaban antes (los reemplazos se
// deshacen del más nuevo al más viejo; si la base no los tiene, `replace` no cambia nada). SOLO va dentro de una transacción que se
// deshace, o seguido de `REHACER_MAQUINAS_SELLO` (solo los reemplazos, re-ejecutables), para que la base termine igual que empezó.
// Es la pareja de `registrar-venta-antes-de-precio-sede.mjs`, que hace lo mismo con `registrar_venta`.
//
// Un parche nuevo a estas funciones posterior al redondeo se suma AQUÍ (o en un módulo hermano) y en las pruebas que pegan las partes
// viejas (`pruebas:redondeo-efectivo`, casos 12, 19 y 36): si no, fallan con «cambió desde que se escribió esta migración».
import { readFileSync } from "node:fs";

const MAQUINAS = readFileSync("supabase/migrations/20261016173000_pos_maquinas_interbank_y_por_depositar.sql", "utf8");
/** Cada `select pg_temp.reemplazar('<firma>', $v$ viejo $v$, $n$ nuevo $n$, 1);` del archivo, en el orden en que se aplican. */
const REEMPLAZOS = [...MAQUINAS.matchAll(/select pg_temp\.reemplazar\('(retail\.[a-z_]+\([^)]*\))',\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$,\s*1\);/g)]
  .map((m) => ({ firma: m[1], viejo: m[2], nuevo: m[3] }));
if (REEMPLAZOS.length !== 8) {
  throw new Error(`sello-antes-de-maquinas: esperaba 8 reemplazos anclados en 20261016173000 y encontré ${REEMPLAZOS.length}`);
}

/** Las ocho funciones como estaban antes de las máquinas de cobro: del último reemplazo al primero. */
export const DESHACER_MAQUINAS_SELLO =
  [...REEMPLAZOS]
    .reverse()
    .map((r) => `do $deshacer$ begin execute replace(pg_get_functiondef('${r.firma}'::regprocedure), $q$${r.nuevo}$q$, $q$${r.viejo}$q$); end $deshacer$;`)
    .join("\n") + "\n";
/** Rehace SOLO los ocho reemplazos (con el `pg_temp.reemplazar` del propio archivo), no la migración entera: pegada la 191000, la
 *  173000 ya no se vuelve a pegar completa (`fn_pos_maquinas` cambió de forma —más columnas— y `create or replace` no puede cambiar el
 *  tipo de retorno: «cannot change return type of existing function»). Los reemplazos sí son re-ejecutables: `pg_temp.reemplazar` no
 *  hace nada si el texto nuevo ya está. */
const REEMPLAZAR = MAQUINAS.match(/create or replace function pg_temp\.reemplazar[\s\S]*?\$f\$;/)?.[0];
if (!REEMPLAZAR) throw new Error("sello-antes-de-maquinas: no encontré pg_temp.reemplazar en 20261016173000");
export const REHACER_MAQUINAS_SELLO =
  `${REEMPLAZAR}\n` + REEMPLAZOS.map((r) => `select pg_temp.reemplazar('${r.firma}', $v$${r.viejo}$v$, $n$${r.nuevo}$n$, 1);`).join("\n") + "\n";
