#!/usr/bin/env node
/**
 * Prueba de ADR-0328 act. 10 (cierre del hueco de #796): ningún ajuste de stock cae en la Cuarentena — un ajuste ahí
 * dejaría el stock y `prendas_danadas` con cantidades distintas (migración `20261014171000_cuarentena_no_se_ajusta_a_mano.sql`,
 * en producción desde ~2026-10-05 con el nombre `20261005150000`; se trajo a `main` el 2026-10-14).
 *
 * La escena: 5 unidades de BLU-EMMA-NEG-M en la Cuarentena de Tienda Trujillo (como una prenda devuelta en un cambio), 5 en el
 * piso de venta y 5 en el almacén. Cada caso corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro:
 * el Postgres local compartido no cambia.
 *
 * QUÉ CUBRE
 *   · CONTROL: con el disparador deshecho (su «cómo se deshace»), un ajuste SÍ cambia el stock de la cuarentena — el hueco
 *     existía, y la prueba lo demuestra en vez de suponerlo.
 *   · Con el disparador: un ajuste +1 y uno −1 sobre la cuarentena se rechazan, y también el camino real, `ajustar_inventario`.
 *   · Lo que NO debe romper: el mismo ajuste en el piso y en el almacén; `ajustar_inventario` sobre el piso; las salidas
 *     propias de la cuarentena (`cuarentena_donada`) y su traslado al almacén («Se arregló»).
 *   · La garantía vecina: `abrir_conteo` rechaza la cuarentena (por eso `cerrar_conteo`, que escribe `ajuste`, nunca llega allí).
 *   · La migración se puede pegar dos veces y la función del disparador no la ejecuta nadie por la API.
 *
 * USO: pnpm pruebas:cuarentena-no-se-ajusta   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261014171000_cuarentena_no_se_ajusta_a_mano.sql"), "utf8");
const DESHACER = "drop trigger if exists movimientos_no_se_ajusta_la_cuarentena on retail.movimientos;";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Stock de prueba: 5 en la cuarentena, 5 en el piso y 5 en el almacén; deja `:ubic`, `:v`, `:sub_cuar`, `:sub_piso`, `:sub_alm`. */
const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sub_cuar from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sub_alm from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_cuar', 'entrada', 5, 'cambio') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_piso', 'entrada', 5, 'colchón de prueba') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_alm', 'entrada', 5, 'colchón de prueba') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m3') as _a3 \\gset
set local request.jwt.claim.sub = '${FELIPE}';
`;

/** Transacción con ROLLBACK: migración (o su reversa) → escena → cuerpo. */
const dentro = (cuerpo, { conCandado = true } = {}) =>
  psql(`begin;\n${conCandado ? MIGRACION : DESHACER}\n${ESCENA}\n${cuerpo}\nrollback;`);

const STOCK = (sub) => `(select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'${sub}')`;

/** Un ajuste directo (lo que hace `registrar_movimiento`), con su efecto sobre el stock del lugar. */
const AJUSTE = (sub, delta) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'${sub}', 'ajuste', ${delta}, 'otro') returning id as ma \\gset
select retail.fn_aplicar_movimiento(:'ma') as _ap \\gset
select ${STOCK(sub)} = ${5 + delta};`;

/** El camino real: la función que llama la pantalla de Ajustar, firmada por el líder del seed. */
const AJUSTAR_INVENTARIO = (sub) => `
select retail.ajustar_inventario(:'ubic', :'${sub}',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1)), 'otro', '[]'::jsonb, false, null, gen_random_uuid()) is not null;`;

const SALIDA_PROPIA = `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_cuar', 'salida', 1, 'cuarentena_donada') returning id as ms \\gset
select retail.fn_aplicar_movimiento(:'ms') as _ap \\gset
select ${STOCK("sub_cuar")} = 4;`;

const TRASLADO_AL_ALMACEN = `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_cuar', :'ubic', :'sub_alm', 'traslado', 1, 'movimiento_interno') returning id as mt \\gset
select retail.fn_aplicar_movimiento(:'mt') as _ap \\gset
select ${STOCK("sub_cuar")} = 4 and ${STOCK("sub_alm")} = 6;`;

const ABRIR_CONTEO_EN_CUARENTENA = `select retail.abrir_conteo(:'ubic', :'sub_cuar') is not null;`;

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
const pasa = (sql, opciones) => () => {
  const salida = dentro(sql, opciones);
  if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida}`;
};
/** Debe rechazarse con ese texto; cualquier otro error (o que pase) es una falla. */
const rechaza = (sql, texto) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!texto.test(String(e.stderr))) throw e;
  }
};
const LA_CUARENTENA_NO_SE_AJUSTA = /La cuarentena no se ajusta a mano/;

caso("CONTROL: sin el disparador, un ajuste SÍ cambia el stock de la Cuarentena (el hueco existía)", pasa(AJUSTE("sub_cuar", 1), { conCandado: false }));
caso("un ajuste +1 sobre la Cuarentena se rechaza", rechaza(AJUSTE("sub_cuar", 1), LA_CUARENTENA_NO_SE_AJUSTA));
caso("un ajuste −1 sobre la Cuarentena se rechaza", rechaza(AJUSTE("sub_cuar", -1), LA_CUARENTENA_NO_SE_AJUSTA));
caso("el camino real, ajustar_inventario, sobre la Cuarentena se rechaza", rechaza(AJUSTAR_INVENTARIO("sub_cuar"), LA_CUARENTENA_NO_SE_AJUSTA));
caso("un ajuste en el piso sigue funcionando", pasa(AJUSTE("sub_piso", 1)));
caso("un ajuste en el almacén sigue funcionando", pasa(AJUSTE("sub_alm", -1)));
caso("ajustar_inventario sobre el piso sigue funcionando", pasa(AJUSTAR_INVENTARIO("sub_piso")));
caso("una salida propia de la Cuarentena (cuarentena_donada) sigue funcionando", pasa(SALIDA_PROPIA));
caso("el traslado de la Cuarentena al almacén («Se arregló») sigue funcionando", pasa(TRASLADO_AL_ALMACEN));
caso(
  "garantía vecina: abrir_conteo rechaza la Cuarentena (por eso el cierre de un conteo nunca llega allí)",
  rechaza(ABRIR_CONTEO_EN_CUARENTENA, /Solo se puede contar el piso de venta o el almac/)
);
caso("la migración se puede pegar dos veces (un solo disparador)", () => {
  const n = psql(`begin;\n${MIGRACION}\n${MIGRACION}\nselect count(*) from pg_trigger where tgname = 'movimientos_no_se_ajusta_la_cuarentena';\nrollback;`);
  if (n !== "1") return `disparadores: ${n}`;
});
caso("la función del disparador no la ejecuta nadie por la API (ni anon ni authenticated)", () => {
  const salida = psql(`begin;\n${MIGRACION}
select not has_function_privilege('anon', 'retail.fn_movimiento_no_ajusta_cuarentena()', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_movimiento_no_ajusta_cuarentena()', 'execute');
rollback;`);
  if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
