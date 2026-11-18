/**
 * `comision_estimada.mjs` vuelve a pegar 20261106012000 (la tarea 14), cuyo reemplazo anclado inserta `lotes_est` y `rev_est` antes de
 * `l_md`. 20261109162000 cambió `lotes_est`, agregó `comision_abonos` y cambió la línea de `rev_est` (la comisión en una sola pasada), así
 * que ese pegado ya no encuentra su texto nuevo, vuelve a insertar sus CTE y aborta por nombres repetidos. `DESHACER_20261109162000` deja
 * la función como estaba (con el texto inverso de cada reemplazo, leído de la propia migración, así no se desfasan), dentro de la
 * transacción de la prueba, que se deshace. Va ANTES de `DESHACER_0629`: se deshace primero lo más nuevo. En una rama sin 20261109162000
 * no hace nada.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACION = join(AQUI, "..", "..", "supabase", "migrations", "20261109162000_comision_de_lotes_en_una_pasada.sql");

let texto = "";
try {
  texto = readFileSync(MIGRACION, "utf8");
} catch {
  // Una rama sin 20261109162000: no hay nada que deshacer.
}

const REEMPLAZO = /select pg_temp\.reemplazar\('retail\.fn_asientos_dinero_y_caja\(date,date,boolean,uuid\[\]\)',\n\$a\$([\s\S]*?)\$a\$,\n\$n\$([\s\S]*?)\$n\$, 1\);/g;

function deshacer() {
  if (!texto) return "";
  // Los tres reemplazos de la migración (lotes_est, la CTE comision_abonos y la línea de rev_est), deshechos del último al primero.
  const reemplazos = [...texto.matchAll(REEMPLAZO)];
  if (reemplazos.length !== 3) {
    throw new Error(`_deshacer_20261109162000: esperaba 3 reemplazos del diario en 20261109162000 y hay ${reemplazos.length}; actualiza este archivo.`);
  }
  return reemplazos
    .reverse()
    .map(
      ([, viejo, nuevo], i) => `
do $deshacer162000_${i}$
declare v text := pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure);
begin
  if position($n162000$${nuevo}$n162000$ in v) > 0 then
    execute replace(v, $n162000$${nuevo}$n162000$, $a162000$${viejo}$a162000$);
  end if;
end
$deshacer162000_${i}$;
`,
    )
    .join("");
}

export const DESHACER_20261109162000 = deshacer();
