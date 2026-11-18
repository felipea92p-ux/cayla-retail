/**
 * `finanzas_arranque.mjs` y `fondo_sale_al_gastarse.mjs` vuelven a pegar migraciones viejas (20261004190000 y 20261107165000) que parchan
 * `fn_flujo_caja_real` con reemplazos ANCLADOS: buscan un texto de su cuerpo y, si ya ven su texto nuevo, no hacen nada. 20261114010000
 * («Movimientos» en una sola lectura, ADR-0661 act. 2026-11-14) dejó ese cuerpo en `fn_flujo_caja_real_de` y a `fn_flujo_caja_real` como su
 * envoltorio, así que el ancla ya no está ahí y el pegado viejo aborta.
 *
 * Igual que `_deshacer_0622.mjs`, dentro de la transacción de la prueba (que se deshace):
 *   · `DESHACER_20261114010000` devuelve `fn_flujo_caja_real` a su cuerpo de main de antes (el de `fn_flujo_caja_real_de`, leído de la propia
 *     migración, sin sus tres cambios: así no se desfasan); ahí el pegado viejo no hace nada;
 *   · `REHACER_20261114010000` vuelve a pegar 20261114010000 (su candado acepta el cuerpo de main), así la prueba mide la versión de hoy.
 * `PEGAR_DE_NUEVO_FLUJO(migracion)` envuelve un pegado viejo con las dos. En una rama sin 20261114010000 no hace nada.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACION = join(AQUI, "..", "..", "supabase", "migrations", "20261114010000_movimientos_en_una_lectura.sql");

let texto = "";
try {
  texto = readFileSync(MIGRACION, "utf8");
} catch {
  // Una rama sin 20261114010000: no hay nada que deshacer ni rehacer.
}

/** Los tres cambios de la migración sobre el cuerpo de siempre, al revés (nuevo → viejo). */
const CAMBIOS = [
  [
    `  -- 20261114010000: si quien llama ya tiene los saldos de esos días (Movimientos pide varios días de una vez), los usa; si no, los pide.
  v_inicial := coalesce(p_inicial, retail.fn_flujo_disponible(p_desde - 1));
  v_final := coalesce(p_final, retail.fn_flujo_disponible(v_hasta));`,
    `  v_inicial := retail.fn_flujo_disponible(p_desde - 1);
  v_final := retail.fn_flujo_disponible(v_hasta);`,
  ],
  [`'por_volver_compras', coalesce(p_por_volver, retail.fn_flujo_por_volver(v_hasta)),`, `'por_volver_compras', retail.fn_flujo_por_volver(v_hasta),`],
];

function cuerpoDeAntes() {
  const m = /create or replace function retail\.fn_flujo_caja_real_de\([\s\S]*?\nas \$\$([\s\S]*?)\$\$;/.exec(texto);
  if (!m) throw new Error("_deshacer_20261114010000: no encuentro el cuerpo de fn_flujo_caja_real_de en la migración; actualiza este archivo.");
  let cuerpo = m[1];
  for (const [nuevo, viejo] of CAMBIOS) {
    if (cuerpo.split(nuevo).length !== 2) throw new Error("_deshacer_20261114010000: un cambio de la migración ya no está tal cual; actualiza este archivo.");
    cuerpo = cuerpo.replace(nuevo, viejo);
  }
  return cuerpo;
}

export const DESHACER_20261114010000 = texto
  ? `reset role;
create or replace function retail.fn_flujo_caja_real(p_desde date, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $deshacer1114$${cuerpoDeAntes()}$deshacer1114$;
do $comprobar1114$
begin
  if (select md5(prosrc) from pg_proc where oid = 'retail.fn_flujo_caja_real(date,date)'::regprocedure) <> '32d499d056c3c1dffa682db43e79ad72' then
    raise exception '_deshacer_20261114010000: fn_flujo_caja_real no volvió al cuerpo de main (32d499d0…).';
  end if;
end
$comprobar1114$;
`
  : "";
// Sin su «QUEDÓ BIEN» final: las pruebas leen sus salidas por posición y esa fila de más las correría.
export const REHACER_20261114010000 = texto ? `reset role;\n${texto.replace(/^select '20261114010000 · QUEDÓ BIEN[^\n]*\n?/m, "")}\nreset lock_timeout;\n` : "";
export const PEGAR_DE_NUEVO_FLUJO = (migracion) => `${DESHACER_20261114010000}${migracion}\n${REHACER_20261114010000}`;
