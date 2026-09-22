#!/usr/bin/env node
/**
 * Pruebas del candado «solo el líder de equipo cierra la caja y ajusta stock fuera de una venta» (D-13,
 * `docs/datos/DECISIONES-2026-09-12.md`; decidido por Felipe el 2026-09-21) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que el candado esté EN LA BASE y no solo en el menú: una colaboradora (Micaela, fija a Tienda
 * Trujillo) que llame las funciones directo —sin pasar por ninguna pantalla— no consigue nada, y el líder
 * (Felipe) sigue haciendo exactamente lo mismo que antes:
 *   · `cerrar_caja`: Micaela NO cierra ni la caja de su propia tienda (42501 «Solo un líder de equipo puede
 *     cerrar la caja»), ni siquiera averigua si una caja existe; sin sesión tampoco; el líder sí, y el arqueo
 *     (monto_sistema, monto_real, diferencia) da lo mismo que antes;
 *   · `registrar_movimiento`: Micaela NO registra ni una entrada, ni una salida, ni un ajuste en su tienda
 *     (42501 «Solo un líder de equipo puede ajustar stock fuera de una venta») aunque los argumentos sean
 *     válidos y aunque haya stock de sobra — el stock no se mueve ni queda un movimiento suelto; el líder sí,
 *     y el stock y los movimientos quedan como antes;
 *   · lo demás de las funciones sigue igual: los rechazos de siempre, la firma única, SECURITY DEFINER, el
 *     `search_path` y el permiso de ejecución del rol `authenticated`;
 *   · el candado de ubicación SE CONSERVA y va DESPUÉS del de líder. Hoy no se puede probar con un rechazo
 *     porque `fn_puede_operar_ubicacion` deja pasar a todo líder (es «líder O mi ubicación»): lo que se
 *     verifica es su presencia y su orden, para el día que R-48 acote al líder a su sede;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `dinero_compras_solo_lider.mjs` (léelo primero si esto no tiene sentido): cada
 * escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el
 * Postgres local que comparten ~20 worktrees. Simula a Felipe (líder) y a Micaela con
 * `set local request.jwt.claim.sub`. Para ver el código de error real (42501) y no solo el texto, un helper
 * temporal `pg_temp.intento(sql)` ejecuta la llamada dentro de un sub-bloque y devuelve «estado|mensaje»; los
 * escenarios con `set local role authenticated` (el rol real de la API) prueban el permiso de ejecución y el
 * mensaje, porque ese rol no ve el schema temporal.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción la migración
 * `20260921120000_candado_de_lider_caja_y_ajuste.sql`, así se prueba SIN haberla aplicado a la base
 * compartida. Sin el flag asume que ya está aplicada.
 *
 * USO
 *   pnpm pruebas:candado-lider            → migración ya aplicada en el local
 *   pnpm pruebas:candado-lider --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

const MSG_CAJA = "Solo un líder de equipo puede cerrar la caja";
const MSG_AJUSTE = "Solo un líder de equipo puede ajustar stock fuera de una venta";

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260921120000_candado_de_lider_caja_y_ajuste.sql"), "utf8");
const PRELUDIO = EN_SECO ? SQL_MIGRACION : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/**
 * Desde los roles por módulo (ADR-0161 B2, decisión B2d de Felipe 2026-09-22) el candado ya no es «solo el líder»: es
 * «el líder O una cuenta cuyo ROL ve Caja / Existencias». Para que esta suite siga probando el CANDADO (que una
 * colaboradora sin ese permiso no consigue nada), cada escenario le da a Micaela, dentro de su transacción, un rol de
 * prueba que solo ve Punto de venta. Los dos casos del final le devuelven el rol Integrante y verifican que AHORA sí
 * puede. En una base sin roles (antes de 20260923030000) este bloque no hace nada y la suite prueba lo de antes.
 */
const ROL_SIN_CAJA_NI_STOCK = `
do $r$
begin
  if to_regclass('retail.rol_modulos') is not null then
    insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-000000000001', 'Solo vender (prueba del candado)', 'temporal');
    insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-000000000001', 'vender');
    update retail.colaboradores set rol_id = '44444444-4444-4444-8444-000000000001'
      where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
  end if;
end $r$;
`;
const MICAELA_INTEGRANTE = `update retail.colaboradores set rol_id = retail.fn_rol_por_clave('integrante')
  where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');\n`;

const comoPersona = (authUserId, sql) => `
begin;
${PRELUDIO}
${ROL_SIN_CAJA_NI_STOCK}
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const SIN_SESION = "set local request.jwt.claim.sub = '';\n";
const COMO_AUTENTICADO = "set local role authenticated;\n";

/**
 * `pg_temp.intento(sql)`: ejecuta la sentencia en un sub-bloque y devuelve «SQLSTATE|mensaje» del error, o
 * «SIN_ERROR» si no falló. Un error dentro del sub-bloque no aborta la transacción del escenario, así que
 * después se puede verificar que la base quedó intacta.
 */
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
`;

/**
 * La escena: la tienda de Micaela (Trujillo), su piso de venta, la variante del seed y su stock de partida
 * en ese piso (`:s0`). Deja `:trujillo`, `:lima`, `:var`, `:sub_piso`, `:persona_felipe`, `:s0`.
 */
const BASE = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'almacen_tienda');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta' \\gset
select id as var from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select coalesce(sum(cantidad), 0) as s0 from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
`;

/**
 * Una caja abierta en Trujillo, abierta por MICAELA (abrir la caja sigue siendo cosa de la colaboradora),
 * con S/ 100 de apertura, un ingreso de S/ 30 y un egreso de S/ 40 que registra el líder. El efectivo que el
 * sistema espera al cierre es 100 + 30 - 40 = S/ 90.00. Deja `:caja`; termina con la sesión en Felipe.
 * Antes cierra —con la RPC real y como líder— cualquier caja que otra sesión haya dejado abierta en Trujillo,
 * porque solo puede haber una abierta por ubicación (todo dentro de la transacción: el ROLLBACK la revive).
 */
const CAJA_ABIERTA_POR_MICAELA = `${BASE}${cambiaA(FELIPE)}select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta'
) x) as _cerro_previa \\gset
${cambiaA(MICAELA)}select retail.abrir_caja(:'trujillo', 100.00) as caja \\gset
${cambiaA(FELIPE)}select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Ingreso vario de prueba') as _i \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 40, 'Deposito bancario', 'Voucher-TEST-001', false) as _e \\gset
`;

/** Stock del piso de Trujillo de la variante de prueba en este momento. */
const STOCK_ACTUAL = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso')`;
/** Cuántos movimientos sueltos (entrada, salida, ajuste) hay de esa variante en Trujillo. */
const MOVIMIENTOS_SUELTOS = `(select count(*) from retail.movimientos where variante_id = :'var' and ubicacion_id = :'trujillo' and tipo in ('entrada', 'salida', 'ajuste'))`;

/** La llamada a `registrar_movimiento` con argumentos VÁLIDOS: pasarían sin el candado. */
const MOVER = (tipo, cantidad, motivo = "prueba del candado", nota = "nota de prueba") =>
  `select retail.registrar_movimiento(:'var', :'trujillo', '${tipo}', ${cantidad}, '${motivo}', '${nota}', :'sub_piso')`;
/** La misma llamada como TEXTO, lista para `pg_temp.intento` (los ids se interpolan con format). */
const MOVER_TEXTO = (tipo, cantidad) =>
  `format('select retail.registrar_movimiento(%L, %L, ''${tipo}'', ${cantidad}, ''prueba del candado'', ''nota de prueba'', %L)', :'var', :'trujillo', :'sub_piso')`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. cerrar_caja — solo el líder
// ===========================================================================

exito(
  "colaboradora: NO puede cerrar la caja de su propia tienda — 42501 «Solo un líder de equipo puede cerrar la caja», y la caja sigue abierta sin cifras",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_ABIERTA_POR_MICAELA}${cambiaA(MICAELA)}select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90)', :'caja')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  (select estado from retail.cajas where id = :'caja'),
  (select monto_cierre_real is null and monto_cierre_sistema is null and cerrada_por is null and cerrada_en is null from retail.cajas where id = :'caja');
rollback;
`
  ),
  ["42501", MSG_CAJA, "abierta", "t"]
);

exito(
  "colaboradora: el candado va ANTES de mirar la caja — una caja inventada también responde 42501, no «no existe» (no averigua nada)",
  comoPersona(
    MICAELA,
    `${INTENTO}select pg_temp.intento('select * from retail.cerrar_caja(gen_random_uuid(), 0)') as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["42501", MSG_CAJA]
);

error(
  "colaboradora con el rol real de la API (authenticated): cerrar_caja le responde el mismo mensaje — la caja de SU tienda no le sirve de excusa",
  comoPersona(FELIPE, `${CAJA_ABIERTA_POR_MICAELA}${COMO_AUTENTICADO}${cambiaA(MICAELA)}select * from retail.cerrar_caja(:'caja', 90);\n`),
  MSG_CAJA
);

exito(
  "sin sesión (auth.uid() nulo): cerrar_caja falla con 42501 y la caja sigue abierta",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_ABIERTA_POR_MICAELA}${SIN_SESION}select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90)', :'caja')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2), (select estado from retail.cajas where id = :'caja');
rollback;
`
  ),
  ["42501", MSG_CAJA, "abierta"]
);

exito(
  "líder: cierra la caja que abrió Micaela en Trujillo (no es su sede) y el arqueo da lo mismo que antes — sistema 90.00 (100 + 30 - 40), contado 95.00, diferencia 5.00",
  comoPersona(
    FELIPE,
    `${CAJA_ABIERTA_POR_MICAELA}select monto_sistema::numeric(12,2), monto_real::numeric(12,2), diferencia::numeric(12,2) from retail.cerrar_caja(:'caja', 95);
rollback;
`
  ),
  ["90.00", "95.00", "5.00"]
);

exito(
  "líder: la caja queda guardada como antes — cerrada, con el sistema (90.00), lo contado (95.00), la diferencia (5.00) y QUIÉN la cerró (Felipe)",
  comoPersona(
    FELIPE,
    `${CAJA_ABIERTA_POR_MICAELA}select monto_sistema as _s from retail.cerrar_caja(:'caja', 95) \\gset
select estado, monto_cierre_sistema::numeric(12,2), monto_cierre_real::numeric(12,2), diferencia::numeric(12,2),
  cerrada_por = :'persona_felipe', cerrada_en is not null
from retail.cajas where id = :'caja';
rollback;
`
  ),
  ["cerrada", "90.00", "95.00", "5.00", "t", "t"]
);

exito(
  "líder con el rol real de la API (authenticated): puede ejecutar cerrar_caja — el permiso de ejecución sigue intacto",
  comoPersona(
    FELIPE,
    `${CAJA_ABIERTA_POR_MICAELA}${COMO_AUTENTICADO}${cambiaA(FELIPE)}select monto_sistema::numeric(12,2), diferencia::numeric(12,2) from retail.cerrar_caja(:'caja', 95);
rollback;
`
  ),
  ["90.00", "5.00"]
);

exito(
  "líder: los rechazos de siempre siguen — monto negativo, caja ya cerrada y caja inexistente responden lo mismo que antes (el candado no los tapa)",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_ABIERTA_POR_MICAELA}select pg_temp.intento(format('select * from retail.cerrar_caja(%L, -1)', :'caja')) as neg \\gset
select monto_sistema as _s from retail.cerrar_caja(:'caja', 90) \\gset
select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90)', :'caja')) as doble \\gset
select pg_temp.intento('select * from retail.cerrar_caja(gen_random_uuid(), 0)') as nada \\gset
select split_part(:'neg', '|', 1), split_part(:'neg', '|', 2), split_part(:'doble', '|', 1), split_part(:'doble', '|', 2), split_part(:'nada', '|', 2) like 'La caja % no existe';
rollback;
`
  ),
  ["P0001", "El monto contado no puede ser negativo", "P0001", "Esta caja ya está cerrada", "t"]
);

// ===========================================================================
// 2. registrar_movimiento — solo el líder, en los tres tipos
// ===========================================================================

for (const [tipo, cantidad] of [
  ["ajuste", 3],
  ["entrada", 5],
  ["salida", 2],
]) {
  exito(
    `colaboradora: NO puede registrar un(a) ${tipo} en su tienda — 42501 «Solo un líder de equipo puede ajustar stock fuera de una venta», aunque haya stock y los argumentos sean válidos`,
    comoPersona(
      FELIPE,
      `${INTENTO}${BASE}${MOVER("entrada", 10)} as _prep \\gset
select ${STOCK_ACTUAL} as antes \\gset
select ${MOVIMIENTOS_SUELTOS} as movs_antes \\gset
${cambiaA(MICAELA)}select pg_temp.intento(${MOVER_TEXTO(tipo, cantidad)}) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2), ${STOCK_ACTUAL} = :antes, ${MOVIMIENTOS_SUELTOS} = :movs_antes;
rollback;
`
    ),
    ["42501", MSG_AJUSTE, "t", "t"]
  );
}

exito(
  "colaboradora: los tres intentos seguidos no dejan NADA — el stock no se mueve y no queda un solo movimiento suelto a su nombre",
  comoPersona(
    FELIPE,
    `${INTENTO}${BASE}${MOVER("entrada", 10)} as _prep \\gset
select ${STOCK_ACTUAL} as antes \\gset
select count(*) as movs_de_micaela from retail.movimientos where usuario_id = (select id from public.personas where auth_user_id = '${MICAELA}') \\gset
${cambiaA(MICAELA)}select pg_temp.intento(${MOVER_TEXTO("entrada", 5)}) as r1 \\gset
select pg_temp.intento(${MOVER_TEXTO("salida", 2)}) as r2 \\gset
select pg_temp.intento(${MOVER_TEXTO("ajuste", 3)}) as r3 \\gset
${cambiaA(FELIPE)}select ${STOCK_ACTUAL} = :antes,
  (select count(*) from retail.movimientos where usuario_id = (select id from public.personas where auth_user_id = '${MICAELA}')) = :movs_de_micaela,
  split_part(:'r1', '|', 1) || split_part(:'r2', '|', 1) || split_part(:'r3', '|', 1);
rollback;
`
  ),
  ["t", "t", "42501".repeat(3)]
);

error(
  "colaboradora con el rol real de la API (authenticated): registrar_movimiento le responde el mismo mensaje",
  comoPersona(FELIPE, `${BASE}${COMO_AUTENTICADO}${cambiaA(MICAELA)}${MOVER("ajuste", 1)};\n`),
  MSG_AJUSTE
);

exito(
  "sin sesión (auth.uid() nulo): registrar_movimiento falla con 42501 en los tres tipos y no toca el stock",
  comoPersona(
    FELIPE,
    `${INTENTO}${BASE}select ${STOCK_ACTUAL} as antes \\gset
${SIN_SESION}select pg_temp.intento(${MOVER_TEXTO("entrada", 5)}) as r1 \\gset
select pg_temp.intento(${MOVER_TEXTO("salida", 1)}) as r2 \\gset
select pg_temp.intento(${MOVER_TEXTO("ajuste", 3)}) as r3 \\gset
${cambiaA(FELIPE)}select split_part(:'r1', '|', 1) || split_part(:'r2', '|', 1) || split_part(:'r3', '|', 1), split_part(:'r1', '|', 2), ${STOCK_ACTUAL} = :antes;
rollback;
`
  ),
  ["42501".repeat(3), MSG_AJUSTE, "t"]
);

exito(
  "líder: entrada 10, salida 4 y ajuste +3 en Trujillo (no es su sede) — el stock queda como antes (+9) y quedan sus 3 movimientos, a nombre de Felipe y con su motivo y nota",
  comoPersona(
    FELIPE,
    `${BASE}${MOVER("entrada", 10, "compra sin factura", "entrada uno")} as m1 \\gset
${MOVER("salida", 4, "merma de prueba", "salida uno")} as m2 \\gset
${MOVER("ajuste", 3, "conteo de prueba", "ajuste uno")} as m3 \\gset
select ${STOCK_ACTUAL} - :s0,
  (select count(*) from retail.movimientos where id in (:'m1', :'m2', :'m3')),
  (select string_agg(tipo || ':' || cantidad, ',' order by tipo) from retail.movimientos where id in (:'m1', :'m2', :'m3')),
  (select bool_and(usuario_id = :'persona_felipe') from retail.movimientos where id in (:'m1', :'m2', :'m3')),
  (select nota || '/' || motivo from retail.movimientos where id = :'m3');
rollback;
`
  ),
  ["9", "3", "ajuste:3,entrada:10,salida:4", "t", "ajuste uno/conteo de prueba"]
);

exito(
  "líder con el rol real de la API (authenticated): puede ejecutar registrar_movimiento — el permiso de ejecución sigue intacto",
  comoPersona(
    FELIPE,
    `${BASE}${COMO_AUTENTICADO}${cambiaA(FELIPE)}${MOVER("entrada", 7)} as m \\gset
reset role;
select ${STOCK_ACTUAL} - :s0, (select tipo from retail.movimientos where id = :'m');
rollback;
`
  ),
  ["7", "entrada"]
);

exito(
  "líder: los rechazos de siempre siguen — tipo traslado, ajuste sin piso/almacén en una tienda que los separa, y ajuste que dejaría stock negativo",
  comoPersona(
    FELIPE,
    `${INTENTO}${BASE}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''traslado'', 1)', :'var', :'trujillo')) as tipo_malo \\gset
select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1)', :'var', :'trujillo')) as sin_sub \\gset
select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', -999999, ''x'', ''y'', %L)', :'var', :'trujillo', :'sub_piso')) as negativo \\gset
select split_part(:'tipo_malo', '|', 2) like 'registrar_movimiento es para entrada/salida/ajuste sueltos%',
  split_part(:'sin_sub', '|', 2) like 'Esta ubicación separa piso y almacén%',
  split_part(:'negativo', '|', 2) like 'El ajuste dejaría stock negativo%';
rollback;
`
  ),
  ["t", "t", "t"]
);

// ===========================================================================
// 3. Lo que NO cambia: ubicación, firma única, permisos, y la migración
// ===========================================================================

exito(
  "el candado de líder va PRIMERO y el de ubicación se CONSERVA después (fn_puede_operar_ubicacion sigue en las dos funciones) — listo para cuando R-48 acote al líder a su sede",
  comoPersona(
    FELIPE,
    // La puerta de líder es `fn_es_lider()` o, desde ADR-0160 (terminales), su capacidad —«líder o terminal»—:
    // `fn_puede_gestionar_caja()` en cerrar_caja y `fn_puede_ajustar_inventario()` en registrar_movimiento. Lo que se
    // prueba es la POSICIÓN de la puerta, no su nombre.
    `select
  g1 > 0 and g1 < strpos(d1, 'select * into v_caja') and g1 < strpos(d1, 'fn_puede_operar_ubicacion'),
  g2 > 0 and g2 < strpos(d2, 'fn_puede_operar_ubicacion') and strpos(d2, 'fn_puede_operar_ubicacion') > 0
from (select d1, d2,
  coalesce(nullif(strpos(d1, 'fn_es_lider()'), 0), strpos(d1, 'fn_puede_gestionar_caja()')) as g1,
  coalesce(nullif(strpos(d2, 'fn_es_lider()'), 0), strpos(d2, 'fn_puede_ajustar_inventario()')) as g2
from (select
  (select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'cerrar_caja') as d1,
  (select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_movimiento') as d2) y) x;
rollback;
`
  ),
  ["t", "t"]
);

exito(
  "cada función tiene UNA sola firma (un `create or replace` con otros tipos habría dejado dos y la llamada saldría «is not unique»), sigue SECURITY DEFINER con su search_path, y authenticated la ejecuta",
  comoPersona(
    FELIPE,
    `select count(*), bool_and(p.prosecdef), bool_and(p.proconfig::text = '{"search_path=retail, public, extensions"}'),
  bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('cerrar_caja', 'registrar_movimiento');
rollback;
`
  ),
  ["2", "t", "t", "t"]
);

exito(
  "la migración se puede pegar DOS veces (el SQL Editor no avisa si ya estaba): la segunda no rompe nada y el candado sigue funcionando",
  comoPersona(
    FELIPE,
    `${INTENTO}${SQL_MIGRACION}
${SQL_MIGRACION}
${cambiaA(MICAELA)}select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 0)', gen_random_uuid())) as rm \\gset
select split_part(:'rm', '|', 1), (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('cerrar_caja', 'registrar_movimiento'));
rollback;
`
  ),
  ["42501", "2"]
);

// ===========================================================================
// Corredor — mismo que dinero_compras_solo_lider.mjs
// ===========================================================================

// ---- Decisión B2d (Felipe, 2026-09-22): con el rol Integrante (ve Caja y Existencias) la colaboradora SÍ puede ----
exito(
  "colaboradora con rol Integrante (ve Caja): AHORA cierra la caja de su tienda (B2d)",
  comoPersona(
    FELIPE,
    `${CAJA_ABIERTA_POR_MICAELA}${MICAELA_INTEGRANTE}${cambiaA(MICAELA)}select (monto_real is not null) as cerrada from retail.cerrar_caja(:'caja', 100);\n`
  ),
  ["t"]
);
exito(
  "colaboradora con rol Integrante (ve Existencias): AHORA registra un ajuste en su tienda (B2d)",
  comoPersona(FELIPE, `${BASE}${MICAELA_INTEGRANTE}${cambiaA(MICAELA)}${MOVER("ajuste", 1)} is not null as ok;\n`),
  ["t"]
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: la migración se carga dentro de cada escenario (no se aplica a la base).\n");

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      // La última línea de salida es la fila de verificación.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
