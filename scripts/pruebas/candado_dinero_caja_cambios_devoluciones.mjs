#!/usr/bin/env node
/**
 * Pruebas de los tres candados de `20260922235000_candado_dinero_caja_cambios_devoluciones.sql`
 * contra el Postgres local — CAYLA V2 (léase esa migración primero, es la fuente de verdad).
 *
 * QUÉ PRUEBA. Que cada candado esté EN LA BASE y no solo en el modal — una colaboradora o un
 * líder que llamen las funciones directo, sin pasar por ninguna pantalla, no consiguen nada:
 *
 *   1. `registrar_movimiento_caja`: la base decide `es_ajuste` del MOTIVO, no de lo que manda
 *      el navegador (`p_es_ajuste` queda ignorado); el vocabulario de motivos es cerrado; y
 *      "Depósito bancario"/"Otro" exigen una referencia. Los motivos normales de siempre
 *      (Retiro de efectivo, Compra de insumos) siguen funcionando igual para una colaboradora.
 *   2. `registrar_cambio`: el candado de líder para una diferencia NEGATIVA se sumó y se
 *      REVIRTIÓ el mismo día (`20260923110500_cambios_sin_candado_de_lider.sql`, decisión de
 *      Felipe: "0 trabas, agilidad para la clienta"). Esta prueba confirma que hoy una
 *      colaboradora sola completa el cambio igual con diferencia negativa, positiva, o siendo
 *      líder — las tres dan el mismo resultado. El riesgo que eso acepta queda documentado en
 *      esa migración, no aquí: esto solo prueba que la base hace lo que Felipe pidió.
 *   3. `aprobar_devolucion`: quien registró la devolución no puede aprobarla ella misma, y el
 *      reembolso no puede superar lo que la clienta pagó de verdad (con descuento).
 *   4. El `revoke`: sin pasar por ninguna RPC, un `update`/`insert`/`delete` directo sobre
 *      `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios` con el rol real de la API
 *      (`authenticated`) ya no tiene privilegio de tabla — 42501, "permission denied". Incluye
 *      la PRUEBA DE MUTACIÓN que pide el README de este directorio: se vuelve a otorgar el
 *      privilegio a mano (dentro de la misma transacción con ROLLBACK) para confirmar que SIN
 *      el `revoke` el mismo `update` SÍ pasaba — si no se puede reproducir el hueco sin la
 *      migración, la prueba de que se cerró no prueba nada.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs` (léelo primero si esto no tiene
 * sentido): cada escenario corre en su propia transacción con ROLLBACK — nunca se commitea
 * nada, corre seguro contra el Postgres local que comparten ~30 worktrees. Simula a Felipe
 * (líder, Lima/global), Sandra (segunda líder — nueva en `seed.sql` desde esta misma migración:
 * antes solo había una líder y el seed no podía probar "otra líder aprueba", el mismo hueco que
 * el candado #3 cierra) y Micaela (colaboradora, fija a Trujillo) con
 * `set local request.jwt.claim.sub`. Un helper temporal `pg_temp.intento(sql)` ejecuta la
 * llamada dentro de un sub-bloque y devuelve «estado|mensaje» sin abortar la transacción del
 * escenario, así después se puede verificar que la base quedó intacta. Los escenarios del
 * `revoke` usan `set local role authenticated` (el rol real de la API): ese rol no ve
 * `pg_temp`, así que comparan el mensaje de Postgres directo, en inglés, como ya hace
 * `apartar_stock.mjs`.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción la migración
 * `20260922235000_candado_dinero_caja_cambios_devoluciones.sql`, así se prueba SIN haberla
 * aplicado a la base compartida. Sin el flag asume que ya está aplicada.
 *
 * USO
 *   node scripts/pruebas/candado_dinero_caja_cambios_devoluciones.mjs             → migración ya aplicada
 *   node scripts/pruebas/candado_dinero_caja_cambios_devoluciones.mjs --en-seco  → la carga en cada escenario
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const SANDRA = "22222222-2222-4222-8222-000000000005"; // segunda líder (seed.sql, agregada con esta migración)

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260922235000_candado_dinero_caja_cambios_devoluciones.sql"),
  "utf8"
);
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

const comoPersona = (authUserId, sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;

/** Mismo patrón que `apartar_stock.mjs`: prepara con el rol real (postgres, superusuario, sin
 *  RLS ni grants de por medio) y luego baja a `authenticated` — el rol real de la API — para
 *  el intento que se está probando. `pg_temp` no es visible bajo ese rol: los mensajes se
 *  comparan tal cual los devuelve Postgres (en inglés). */
const comoAutenticado = (authUserId, prep, sqlComoAutenticado) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
${prep}
set local role authenticated;
${sqlComoAutenticado}
`;

/**
 * `pg_temp.intento(sql)`: ejecuta la sentencia en un sub-bloque y devuelve «SQLSTATE|mensaje»
 * del error, o «SIN_ERROR» si no falló. Un error dentro del sub-bloque no aborta la
 * transacción del escenario, así después se puede verificar que la base quedó intacta.
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

// ===========================================================================
// Fixtures compartidos
// ===========================================================================

/** Una caja abierta en Trujillo, abierta por MICAELA — sirve para los escenarios de
 *  `registrar_movimiento_caja` de más abajo. Deja `:trujillo` y `:caja`; termina la sesión en
 *  Micaela (el llamador decide si necesita cambiar a otra persona después). */
const CAJA_TRUJILLO_MICAELA = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
${cambiaA(FELIPE)}select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta'
) x) as _cerro_previa \\gset
${cambiaA(MICAELA)}select retail.abrir_caja(:'trujillo', 100.00, 'prueba automatizada') as caja \\gset
`;

/**
 * Venta + cambio listos en Tienda Trujillo, entre BLU-EMMA-NEG-M (vieja) y VES-SOFI-NEG-M
 * (nueva) — mismo par de variantes y misma idea que `registrar_cambio.mjs`, pero en Trujillo
 * (la sede de Micaela) en vez de Lima, para poder probar el candado con una colaboradora
 * real vendiendo y cambiando en su propia tienda. `persona` es quien abre la caja y registra
 * la venta — la sesión queda en esa persona al terminar. El precio de la línea vieja se arma
 * a partir del precio REAL de la variante nueva, así la diferencia que produce
 * `registrar_cambio` es EXACTAMENTE `diferenciaUnitaria`, sin importar el catálogo de hoy.
 */
function fixtureCambio({ persona, diferenciaUnitaria }) {
  return `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Cuarentena', 'cuarentena'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena');

${cambiaA(FELIPE)}select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
${cambiaA(persona)}select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset

select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_new, precio as v_new_precio from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_new', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_new \\gset
select retail.fn_aplicar_movimiento(:'mov_new') as _d2 \\gset

select ((:'v_new_precio')::numeric - (${diferenciaUnitaria})::numeric) as precio_viejo \\gset
update retail.variantes set precio = :'precio_viejo' where id = :'v_old';

${cambiaA(persona)}select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_viejo', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_viejo')::numeric)),
  null, gen_random_uuid()) as venta_id \\gset

select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
`;
}

/**
 * Venta CON descuento (S/ ${descuento}) de BLU-EMMA-NEG-M en Tienda Lima, registrada por
 * FELIPE, con una devolución PENDIENTE ya creada por él sobre esa línea (motivo 'otro') — deja
 * `:devolucion_id` y `:valor_pagado` (precio - descuento, lo que la clienta pagó de verdad).
 * Pagada con tarjeta (nunca efectivo) para no necesitar una caja abierta.
 */
function fixtureDevolucion({ descuento }) {
  return `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');

${cambiaA(FELIPE)}select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select precio as precio_viejo from retail.variantes where id = :'v_old' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset

select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_viejo', 'descuento_unitario', ${descuento}.00, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_viejo')::numeric - ${descuento}.00)),
  null, gen_random_uuid()) as venta_id \\gset

select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset

select retail.crear_devolucion(:'venta_id', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada', 'otro') as devolucion_id \\gset

select ((:'precio_viejo')::numeric - ${descuento}.00) as valor_pagado \\gset
`;
}

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. registrar_movimiento_caja — el motivo decide, no el navegador
// ===========================================================================

exito(
  "colaboradora: manda p_es_ajuste=false con un motivo de AJUSTE — igual se rechaza (antes de esta migración SÍ pasaba, ese es el hueco)",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_TRUJILLO_MICAELA}select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''egreso'', 10, ''Ajuste de caja (faltante)'', null, false)', :'caja')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["P0001", "Solo un líder de equipo puede registrar un ajuste de efectivo"]
);

exito(
  "colaboradora: manda p_es_ajuste=true con un motivo que NO es de ajuste — la base lo ignora, no exige líder (la deducción es del motivo, no del parámetro)",
  comoPersona(
    FELIPE,
    `${CAJA_TRUJILLO_MICAELA}select retail.registrar_movimiento_caja(:'caja', 'egreso', 10, 'Retiro de efectivo', 'nota', true) as mov_id \\gset
select es_ajuste from retail.caja_movimientos where id = :'mov_id';
rollback;
`
  ),
  ["f"]
);

exito(
  "colaboradora: un motivo de egreso fuera del vocabulario cerrado se rechaza (texto libre, lo que antes se podía mandar)",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_TRUJILLO_MICAELA}select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''egreso'', 10, ''Voy a robar'')', :'caja')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["P0001", "Motivo de egreso desconocido: Voy a robar"]
);

exito(
  "colaboradora: un motivo de ingreso fuera del vocabulario cerrado también se rechaza",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_TRUJILLO_MICAELA}select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''ingreso'', 10, ''Propina de la clienta'')', :'caja')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["P0001", "Motivo de ingreso desconocido: Propina de la clienta"]
);

exito(
  "líder: «Depósito bancario» sin nota/referencia se rechaza",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_TRUJILLO_MICAELA}${cambiaA(FELIPE)}select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''egreso'', 50, ''Depósito bancario'')', :'caja')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["P0001", 'El motivo "Depósito bancario" necesita una referencia (N.° de operación o un detalle breve)']
);

exito(
  "líder: «Otro» sin nota/referencia se rechaza igual",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_TRUJILLO_MICAELA}${cambiaA(FELIPE)}select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''egreso'', 50, ''Otro'')', :'caja')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["P0001", 'El motivo "Otro" necesita una referencia (N.° de operación o un detalle breve)']
);

exito(
  "colaboradora: los motivos normales de siempre siguen funcionando igual — Retiro de efectivo (con nota) y Compra de insumos (sin nota, no la exige)",
  comoPersona(
    FELIPE,
    `${CAJA_TRUJILLO_MICAELA}select retail.registrar_movimiento_caja(:'caja', 'egreso', 20, 'Retiro de efectivo', 'para vuelto') as m1 \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 15, 'Compra de insumos') as m2 \\gset
select
  (select motivo || '/' || nota || '/' || es_ajuste from retail.caja_movimientos where id = :'m1'),
  (select motivo || '/' || coalesce(nota, '') || '/' || es_ajuste from retail.caja_movimientos where id = :'m2');
rollback;
`
  ),
  ["Retiro de efectivo/para vuelto/false", "Compra de insumos//false"]
);

exito(
  "líder: sigue pudiendo hacer un ajuste con motivo correcto — egreso (faltante) e ingreso (sobrante), y queda marcado es_ajuste=true",
  comoPersona(
    FELIPE,
    `${CAJA_TRUJILLO_MICAELA}${cambiaA(FELIPE)}select retail.registrar_movimiento_caja(:'caja', 'egreso', 5, 'Ajuste de caja (faltante)') as m1 \\gset
select retail.registrar_movimiento_caja(:'caja', 'ingreso', 3, 'Ajuste de caja (sobrante)') as m2 \\gset
select
  (select es_ajuste from retail.caja_movimientos where id = :'m1'),
  (select es_ajuste from retail.caja_movimientos where id = :'m2');
rollback;
`
  ),
  ["t", "t"]
);

// ===========================================================================
// 2. registrar_cambio — SIN candado de líder (revertido a propósito, ver
//    20260923110500_cambios_sin_candado_de_lider.sql: decisión de Felipe,
//    2026-09-23, "0 trabas, agilidad para la clienta"). Se prueba que una
//    colaboradora sola SÍ puede completar un cambio con diferencia negativa,
//    igual que con diferencia positiva y que un líder — las tres dan lo mismo.
// ===========================================================================

exito(
  "colaboradora (Micaela, en su propia tienda): un cambio con diferencia NEGATIVA se completa sola, sin líder (decisión de Felipe, 2026-09-23: agilidad para la clienta)",
  comoPersona(
    FELIPE,
    `${fixtureCambio({ persona: MICAELA, diferenciaUnitaria: -20 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select c.diferencia, c.metodo_pago_diferencia from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ["-20.00", "efectivo"]
);

exito(
  "colaboradora (Micaela): con diferencia POSITIVA (la clienta paga más) sigue funcionando igual que antes, sin líder",
  comoPersona(
    FELIPE,
    `${fixtureCambio({ persona: MICAELA, diferenciaUnitaria: 20 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select c.diferencia, c.metodo_pago_diferencia from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ["20.00", "efectivo"]
);

exito(
  "líder (Felipe, en una tienda que no es la suya): sigue pudiendo hacer el cambio con diferencia negativa (nunca dejó de poder)",
  comoPersona(
    FELIPE,
    `${fixtureCambio({ persona: FELIPE, diferenciaUnitaria: -20 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select c.diferencia, c.metodo_pago_diferencia from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ["-20.00", "efectivo"]
);

// ===========================================================================
// 3. aprobar_devolucion — sin auto-aprobación, y con tope real de reembolso
// ===========================================================================

error(
  "la misma líder que registró la devolución (Felipe) no puede aprobarla ella misma, aunque sea líder",
  comoPersona(
    FELIPE,
    `${fixtureDevolucion({ descuento: 15 })}
select retail.aprobar_devolucion(:'devolucion_id', :'valor_pagado', 'yape');
`
  ),
  "Quien registró esta devolución no puede aprobarla"
);

exito(
  "otra líder (Sandra) SÍ puede aprobar la devolución que registró Felipe",
  comoPersona(
    FELIPE,
    `${fixtureDevolucion({ descuento: 15 })}${cambiaA(SANDRA)}select nota_credito_id is null from retail.aprobar_devolucion(:'devolucion_id', :'valor_pagado', 'yape');
select estado, aprobado_por = (select id from public.personas where auth_user_id = '${SANDRA}') from retail.devoluciones where id = :'devolucion_id';
rollback;
`
  ),
  ["aprobada", "t"]
);

error(
  "el reembolso no puede superar lo que la clienta pagó de verdad (con descuento, no precio de lista)",
  comoPersona(
    FELIPE,
    `${fixtureDevolucion({ descuento: 15 })}${cambiaA(SANDRA)}select retail.aprobar_devolucion(:'devolucion_id', (:'valor_pagado')::numeric + 0.01, 'yape');
`
  ),
  "no puede superar lo que la clienta pagó por esas prendas"
);

exito(
  "un reembolso EXACTAMENTE igual a lo pagado con descuento (el límite) sigue funcionando",
  comoPersona(
    FELIPE,
    `${fixtureDevolucion({ descuento: 15 })}${cambiaA(SANDRA)}select retail.aprobar_devolucion(:'devolucion_id', :'valor_pagado', 'yape') as _ok \\gset
select estado, reembolso_monto = (:'valor_pagado')::numeric from retail.devoluciones where id = :'devolucion_id';
rollback;
`
  ),
  ["aprobada", "t"]
);

// ===========================================================================
// 4. El revoke — sin RPC, la puerta lateral de UPDATE/INSERT/DELETE directo
// ===========================================================================

exito(
  "el revoke es preciso: INSERT/UPDATE/DELETE de `authenticated`/`anon` quedan en false en las 4 tablas, pero SELECT sigue en true (no se rompió la lectura)",
  comoPersona(
    FELIPE,
    `select
  has_table_privilege('authenticated', 'retail.devoluciones', 'INSERT'),
  has_table_privilege('authenticated', 'retail.devoluciones', 'UPDATE'),
  has_table_privilege('authenticated', 'retail.devoluciones', 'DELETE'),
  has_table_privilege('authenticated', 'retail.devoluciones', 'SELECT'),
  has_table_privilege('anon', 'retail.devoluciones', 'INSERT'),
  has_table_privilege('authenticated', 'retail.devolucion_items', 'UPDATE'),
  has_table_privilege('authenticated', 'retail.prendas_danadas', 'UPDATE'),
  has_table_privilege('authenticated', 'retail.cambios', 'UPDATE');
rollback;
`
  ),
  ["f", "f", "f", "t", "f", "f", "f", "f"]
);

error(
  "con el candado: un UPDATE directo a `devoluciones` (sin pasar por ninguna RPC), con el rol real de la API, ya no tiene permiso — este es el escenario que hoy en producción SÍ pasa",
  comoAutenticado(FELIPE, fixtureDevolucion({ descuento: 15 }), `update retail.devoluciones set estado = 'aprobada' where id = :'devolucion_id';\n`),
  "permission denied for table devoluciones"
);

error(
  "con el candado: lo mismo para `cambios` — un UPDATE directo con el rol real de la API no tiene permiso",
  comoAutenticado(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset`,
    `insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia) values (gen_random_uuid(), :'ubic', gen_random_uuid(), 1, 0);\n`
  ),
  "permission denied for table cambios"
);

exito(
  "PRUEBA DE MUTACIÓN: sin el `revoke` (privilegio otorgado a mano, dentro de la misma transacción con ROLLBACK) el MISMO UPDATE directo SÍ pasa y cambia la fila — confirma que el hueco era real y esta migración es la que lo cierra, no otra cosa",
  comoAutenticado(
    FELIPE,
    `${fixtureDevolucion({ descuento: 15 })}
grant insert, update, delete, truncate on retail.devoluciones to authenticated;
`,
    `update retail.devoluciones set estado = 'aprobada', aprobado_en = now() where id = :'devolucion_id';
select estado from retail.devoluciones where id = :'devolucion_id';
rollback;
`
  ),
  ["aprobada"]
);

// ===========================================================================
// 5. Lo que NO cambia: una sola firma por función, SECURITY DEFINER, y la migración se puede pegar dos veces
// ===========================================================================

exito(
  "las tres funciones tienen UNA sola firma (create or replace, no drop+create: no debió quedar una segunda sobrecarga), siguen SECURITY DEFINER con su search_path, y authenticated las ejecuta",
  comoPersona(
    FELIPE,
    `select count(*), bool_and(p.prosecdef), bool_and(p.proconfig::text = '{"search_path=retail, public, extensions"}'),
  bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
from pg_proc p where p.pronamespace = 'retail'::regnamespace
  and p.proname in ('registrar_movimiento_caja', 'registrar_cambio', 'aprobar_devolucion');
rollback;
`
  ),
  ["3", "t", "t", "t"]
);

exito(
  "la migración se puede pegar DOS veces (el SQL Editor no avisa si ya estaba): la segunda no rompe nada y los candados siguen funcionando",
  comoPersona(
    FELIPE,
    `${INTENTO}${SQL_MIGRACION}
${SQL_MIGRACION}
${CAJA_TRUJILLO_MICAELA}select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''egreso'', 5, ''Ajuste de caja (faltante)'')', :'caja')) as r \\gset
select split_part(:'r', '|', 1),
  (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('registrar_movimiento_caja', 'registrar_cambio', 'aprobar_devolucion'));
rollback;
`
  ),
  ["P0001", "3"]
);

// ===========================================================================
// Corredor — mismo que candado_lider_caja_y_ajuste.mjs
// ===========================================================================

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
