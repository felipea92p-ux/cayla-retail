/**
 * `comision_estimada.mjs` vuelve a pegar 20261106012000 (la tarea 14) dentro de su transacción. Dos cosas de 20261107214000 (ADR-0629)
 * no lo dejan:
 *   · el reemplazo anclado del diario (`fn_asientos_dinero_y_caja`) cae DENTRO del texto nuevo de la tarea 14, así que su pegado ya
 *     no lo encuentra, vuelve a insertar sus CTE y aborta por nombres repetidos;
 *   · `fn_cuadrar_depositos_vista` devuelve una columna más (`residuo`) y `create or replace` no puede cambiar lo que devuelve.
 * `DESHACER_0629` devuelve las dos a como estaban antes de ADR-0629 (dentro de la transacción de la prueba, que se deshace): el diario
 * con el texto inverso del reemplazo (leído de la propia migración, así no se desfasan) y la vista borrada, que el pegado viejo crea.
 * En una rama sin ADR-0629 no hace nada.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACION_0629 = join(AQUI, "..", "..", "supabase", "migrations", "20261107214000_puente_por_residuo_y_qr_gratis.sql");

let texto = "";
try {
  texto = readFileSync(MIGRACION_0629, "utf8");
} catch {
  // Una rama sin ADR-0629: no hay nada que deshacer.
}

function deshacer() {
  if (!texto) return "";
  const m = texto.match(/select pg_temp\.reemplazar\('retail\.fn_asientos_dinero_y_caja\(date,date,boolean,uuid\[\]\)',\n\$a\$([\s\S]*?)\$a\$,\n\$n\$([\s\S]*?)\$n\$, 1\);/);
  if (!m) throw new Error("_deshacer_0629: no encontré el reemplazo del diario en 20261107214000; actualiza este archivo.");
  const [, viejo, nuevo] = m;
  return `
do $deshacer0629$
declare v text := pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure);
begin
  if position($n0629$${nuevo}$n0629$ in v) > 0 then
    execute replace(v, $n0629$${nuevo}$n0629$, $a0629$${viejo}$a0629$);
  end if;
end
$deshacer0629$;
drop function if exists retail.fn_cuadrar_depositos_vista();
`;
}

export const DESHACER_0629 = deshacer();
