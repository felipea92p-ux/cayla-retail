#!/usr/bin/env node
/**
 * Cobrar dentro del pedido web (ADR-0408, actividad 9) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015041000_pedidos_web_cobrar.sql` y `20261015042000_pedidos_web_cobrar_token.sql`, sobre el motor que cobra
 * (`registrar_pago_pedido_web` y `anular_pago_pedido_web`, 20261015000000, que prueba `pedidos_web_motor.mjs` en su parte F):
 *   A. Lo que la hoja lee para cobrar: si la tienda tiene la caja abierta, quién registró y quién anuló cada pago, y que un pedido
 *      anulado con plata por devolver no sale de la lista (ni a los 30 días) hasta que se devuelve.
 *   B. La historia de la demo, en la base: un adelanto para lo que se consigue y el resto (queda pagado completo); el n.º de
 *      operación repetido rechazado con el número del otro pedido; el efectivo en el cuadre de la caja abierta; el efectivo anulado
 *      sale de la caja abierta del día en que se devuelve (decisión de Felipe, ADR-0408 act. c), no se devuelve si esa caja no lo
 *      tiene ni si no hay caja; un pago digital se anula sin tocar la caja.
 *   C. El token sigue al contenido: el mismo envío dos veces es el mismo pago, el mismo token con otro monto se rechaza, la hoja
 *      puede preguntar por un pago en duda (hecho o no llegó, y lo que no llegó ya no entra) y solo lo revisa quien opera la tienda.
 *   D. Dos a la vez (dos sesiones de verdad): el mismo n.º de operación en dos pedidos al mismo tiempo se ordena en el índice (la
 *      segunda espera a la primera) y, con un tope de espera, la segunda se rinde sin anotar nada.
 *   E. Las dos migraciones se pueden pegar dos veces.
 *   Y donde se reservan prendas, el stock cuadra con `movimientos` (INV-01).
 *
 * CÓMO. Como `pedidos_web_erp.mjs`: cada escenario en su transacción y ROLLBACK (el Postgres local lo comparten los worktrees),
 * con prendas NUEVAS y un cliente «ZZ». Los errores esperados se reconocen por su HINT (`pg_temp.probar` deshace lo que hizo). Los
 * candados de la caja son DIFERIDOS (corren al confirmar): un escenario que los necesita termina con `set constraints all
 * immediate` dentro de la llamada que prueba. La carrera (D) termina en ROLLBACK: con dos conexiones que no se commitean no se ve
 * «la segunda pierde» (límite de MVCC); se ve que la segunda ESPERA y que con un tope se rinde. «Pierde» lo prueba B en serie.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<cobrar.sql>,<token.sql>` mete las migraciones dentro de cada transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI). La parte C y el candado de la caja de B
 * necesitan `20261013200000` y `20261013202000` (el token que sigue al contenido y el efectivo que no queda bajo cero): están en
 * el CI y en producción; una base local atrasada las marca en rojo.
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, a Felipe como líder y a Micaela como integrante de
 * Trujillo (el seed), y el motor del pedido web con Configuración ▸ Tienda web aplicados.
 *
 * USO
 *   pnpm pruebas:pedidos-web-cobrar
 *   pnpm pruebas:pedidos-web-cobrar -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261015041000_pedidos_web_cobrar.sql",
  "supabase/migrations/20261015042000_pedidos_web_cobrar_token.sql",
];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todos los módulos y opera todas las tiendas
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo «Pedidos web»

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
// La ÚLTIMA línea de la salida es el veredicto del escenario.
function esperarValor(nombre, r, esperado) {
  const ultima = r.ok ? r.salida.split("\n").pop() : null;
  esperar(nombre, r.ok && ultima === esperado, r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje);
}

// ---- El piso de partida de cada escenario ----------------------------------------------------------------------------------

const lugares = (nombre, sufijo) => `
select id as ${sufijo} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda');
select id as ${sufijo}_piso from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta' \\gset
select id as ${sufijo}_alm from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda' \\gset
`;

// Prendas NUEVAS (un producto cada una, sin historia ni stock): lo que cada escenario necesita lo deja él.
const prendaNueva = (n) => `
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedido web cobrar ${n}', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p${n} \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p${n}', 'ZZ-PWC-${n}', 100, 40, true) returning id as v${n} \\gset
`;

const AYUDAS = `
-- Corre una llamada y DESHACE todo lo que hizo (éxito o error): 'ok' o 'error|<hint>|<mensaje>'. Acepta varias sentencias
-- (la última puede ser «set constraints all immediate», para que corran los candados diferidos de la caja).
create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  begin
    execute p_sql;
    raise exception 'PROBAR_OK';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    if v_msg = 'PROBAR_OK' then return 'ok'; end if;
    return 'error|' || coalesce(v_hint, '') || '|' || v_msg;
  end;
end $f$;
-- Deja n unidades más en una fila (una «entrada» del libro).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba cobrar pedidos web: colchón') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
-- INV-01 de /chaos, solo para una prenda: las filas de stock que NO cuadran con el libro (vacío = cuadra).
create function pg_temp.descuadre(p_v uuid) returns text language sql as $f$
  with rec as (
    select ubicacion_id, sububicacion_id, sum(c) as c, sum(a) as a from (
      select ubicacion_id, sububicacion_id, cantidad as c, 0 as a from retail.movimientos where variante_id = p_v and tipo in ('entrada', 'ajuste')
      union all select ubicacion_id, sububicacion_id, -cantidad, 0 from retail.movimientos where variante_id = p_v and tipo in ('salida', 'traslado')
      union all select ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from retail.movimientos where variante_id = p_v and tipo = 'traslado'
      union all select ubicacion_id, sububicacion_id, 0, cantidad from retail.movimientos where variante_id = p_v and tipo = 'apartado'
      union all select ubicacion_id, sububicacion_id, 0, -cantidad from retail.movimientos where variante_id = p_v and tipo = 'liberacion_apartado'
    ) t group by 1, 2
  ), s as (select * from retail.stock where variante_id = p_v)
  select coalesce(string_agg(format('%s/%s:%s-%s/%s-%s', coalesce(r.ubicacion_id, s.ubicacion_id), coalesce(r.sububicacion_id, s.sububicacion_id),
                                    coalesce(s.cantidad, 0), coalesce(r.c, 0), coalesce(s.cantidad_apartada, 0), coalesce(r.a, 0)), ';'), '')
    from rec r full join s on s.ubicacion_id = r.ubicacion_id and s.sububicacion_id is not distinct from r.sububicacion_id
   where coalesce(s.cantidad, 0) <> coalesce(r.c, 0) or coalesce(s.cantidad_apartada, 0) <> coalesce(r.a, 0)
$f$;
create function pg_temp.linea(p_pedido uuid, p_pos integer) returns uuid language sql as $f$
  select id from retail.pedido_web_lineas where pedido_id = p_pedido and posicion = p_pos
$f$;
-- Todas las prendas de un pedido con la misma decisión (y, si se reserva, en esa tienda).
create function pg_temp.todas(p_pedido uuid, p_decision text, p_ubicacion uuid default null) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', p_decision, 'ubicacion_id', p_ubicacion,
                                      'fecha', case when p_decision = 'por_conseguir' then retail.fn_hoy_lima() + 7 end) order by l.posicion)
    from retail.pedido_web_lineas l where l.pedido_id = p_pedido
$f$;
-- La caja de la tienda, de cero: cierra la que esté abierta (con lo que espera) y abre una con este fondo.
create function pg_temp.caja_nueva(p_u uuid, p_fondo numeric) returns uuid language plpgsql as $f$
declare v uuid;
begin
  for v in select id from retail.cajas where ubicacion_id = p_u and estado = 'abierta' loop
    perform retail.cerrar_caja(v, (select e.esperado from retail.fn_calcular_esperado_caja(v) e));
  end loop;
  return retail.abrir_caja(p_u, p_fondo, 'prueba cobrar pedidos web');
end $f$;
create function pg_temp.cerrar(p_caja uuid) returns void language plpgsql as $f$
begin
  perform retail.cerrar_caja(p_caja, (select e.esperado from retail.fn_calcular_esperado_caja(p_caja) e));
end $f$;
create function pg_temp.esperado(p_caja uuid) returns numeric language sql as $f$
  select e.esperado from retail.fn_calcular_esperado_caja(p_caja) e
$f$;
`;

const preparar = (aplicar) => `
begin;
${aplicar}
set local request.jwt.claim.sub = '${FELIPE}';
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
${prendaNueva(1)}
${prendaNueva(2)}
${AYUDAS}
-- ADR-0408 act. 10: el pago que completa un pedido hace nacer su venta con su boleta, que va en la caja del día de su tienda. Cada
-- escenario parte con una caja abierta en Trujillo y una serie de boleta propia de la prueba (en el seed local Lima y Trujillo comparten
-- B001; en producción cada tienda tiene la suya). Solo dentro de esta transacción.
update retail.series_comprobantes
   set serie = case tipo when 'boleta' then 'B' else 'F' end || case when ubicacion_id = :'tru' then 'T98' else 'L98' end, siguiente_numero = 1
 where ubicacion_id in (:'tru', :'lim') and tipo in ('boleta', 'factura') and archivada_at is null;
select coalesce((select id from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta'),
                retail.abrir_caja(:'tru', 0, 'prueba cobrar pedidos web: la caja del día')) is not null as _caja \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente cobrar pedidos web', '999888772') returning id as cli \\gset
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
`;
const PREPARAR = preparar(APLICAR_ANTES);
const CUADRA = `pg_temp.descuadre(:'v1') = '' and pg_temp.descuadre(:'v2') = ''`;

// Un pedido con las prendas dadas (una unidad por elemento, a S/ 100 cada una), en Trujillo salvo que se diga otra cosa.
const separar = (alias, prendas = ["v1"], ubic = "tru") => `
select (retail.crear_pedido_web(:'cli', :'${ubic}', jsonb_build_array(${prendas
  .map((p) => `jsonb_build_object('variante_id', :'${p}', 'precio_lista', 100)`)
  .join(", ")})) ->> 'pedido_id') as ${alias} \\gset
`;
const confirmar = (alias, decision = "reservar", ubic = "null") =>
  `select retail.confirmar_pedido_web(:'${alias}', pg_temp.todas(:'${alias}', '${decision}', ${ubic === "null" ? "null" : `:'${ubic}'`})) is not null as _c \\gset\n`;
// Un pedido confirmado sin tocar el stock (sus prendas, por conseguir): lo justo para cobrar.
const confirmadoPorConseguir = (alias, prendas = ["v1"], ubic = "tru") => `${separar(alias, prendas, ubic)}${confirmar(alias, "por_conseguir")}`;
const pagar = (alias, monto, medio, op = null, token = null) =>
  `retail.registrar_pago_pedido_web(:'${alias}', ${monto}, '${medio}'${op === null ? (token ? ", null" : "") : `, '${op}'`}${token ? `, ${token}` : ""})`;
const pagarSql = (alias, monto, medio, op = null, token = null) =>
  `format('select retail.registrar_pago_pedido_web(%L, %s, %L, %L, %L)', :'${alias}', ${monto}, '${medio}', ${op === null ? "null" : `'${op}'`}, ${token ?? "null"})`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;
// El paso del tiempo, solo en esta transacción (como en pedidos_web_motor.mjs).
const VIAJAR_EN_EL_TIEMPO = (sql) => `
set constraints all immediate;
alter table retail.pedidos_web disable trigger pedidos_web_reglas;
${sql}
alter table retail.pedidos_web enable trigger pedidos_web_reglas;
set constraints all deferred;
`;
// Un rol de prueba con «Pedidos web» para Micaela (solo dentro de la transacción).
const MICAELA_CON_EL_MODULO = `
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000c9', 'Pedidos web (prueba cobrar)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000c9', 'pedidos_web');
update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000c9'
 where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
`;

function escenario(nombre, cuerpo, esperado) {
  esperarValor(nombre, correr(`${PREPARAR}${cuerpo}\nrollback;\n`), esperado);
}

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr(
      "select (position('caja_abierta' in pg_get_functiondef('retail.fn_pedido_web_detalle(uuid)'::regprocedure)) > 0)::text;",
    );
    if (hay.salida !== "true") {
      console.error(`Falta la actividad 9 en esta base: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=${MIGRACIONES.join(",")}`);
      process.exit(2);
    }
  }
  const prep = correr(`${PREPARAR}select :'v1' || '|' || :'v2' || '|' || :'cli';\nrollback;\n`);
  if (!prep.ok) {
    console.error(`No se pudo armar el piso de partida:\n${prep.mensaje}`);
    process.exit(2);
  }

  // ===================================================================================================================
  console.log("— A. Lo que la hoja lee para cobrar —");
  escenario(
    "la hoja sabe si la tienda del pedido tiene la caja abierta: sin caja, no; al abrirla, sí",
    `${confirmadoPorConseguir("a")}
select (select count(*) from (select pg_temp.cerrar(id) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _c \\gset
select (retail.fn_pedido_web_detalle(:'a') ->> 'caja_abierta') as sin_caja \\gset
select retail.abrir_caja(:'tru', 50, 'prueba cobrar pedidos web') as caja \\gset
select :'sin_caja' || '|' || (retail.fn_pedido_web_detalle(:'a') ->> 'caja_abierta');`,
    "false|true",
  );
  escenario(
    "cada pago dice quién lo registró y, si se anuló, quién lo anuló, cuándo y por qué",
    `${confirmadoPorConseguir("a")}
select (${pagar("a", 10, "yape", "41000001")} ->> 'pago_id') as pago \\gset
select retail.anular_pago_pedido_web(:'pago', 'error_al_anotar') is not null as _x \\gset
select (select nombres from public.personas where auth_user_id = '${FELIPE}') as yo \\gset
select g ->> 'registrado_por' = :'yo' and g ->> 'anulado_por' = :'yo' and g ->> 'anulado_motivo' = 'error_al_anotar'
       and g ->> 'estado' = 'anulado' and g ->> 'anulado_en' is not null
  from jsonb_array_elements(retail.fn_pedido_web_detalle(:'a') -> 'pagos') g;`,
    "t",
  );
  escenario(
    "un pedido anulado con plata por devolver sigue en la lista aunque pasen 30 días; ya devuelto, se va",
    `${confirmadoPorConseguir("a")}
select (${pagar("a", 10, "yape", "41000002")} ->> 'pago_id') as pago \\gset
select retail.anular_pedido_web(:'a', 'cliente_desistio') is not null as _x \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web
   set creado_en = now() - interval '45 days', confirmado_en = now() - interval '45 days', cerrado_en = now() - interval '40 days'
 where id = :'a';`)}
select (select estado || '/' || pagado from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') as antes \\gset
select retail.anular_pago_pedido_web(:'pago', 'devuelto_al_cliente') is not null as _y \\gset
select :'antes' || '|' || (select count(*) from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a');`,
    "anulado/10.00|0",
  );

  // ===================================================================================================================
  console.log("— B. Cobrar: la historia de la demo, en la base —");
  escenario(
    "un adelanto para la prenda que se consigue y el resto: el aviso de 48 h no salta con el adelanto, y con el resto queda pagado completo",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1);
${separar("a", ["v1", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar'),
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'por_conseguir', 'fecha', retail.fn_hoy_lima() + 7))) is not null as _c \\gset
select (${pagar("a", 50, "yape", "41000101")} ->> 'estado_pedido') as e1 \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set confirmado_en = now() - interval '72 hours' where id = :'a';`)}
select (retail.fn_pedido_web_detalle(:'a') ->> 'sin_pagar') as aviso \\gset
select (${pagar("a", "150.00", "plin", "41000102")} ->> 'estado_pedido') as e2 \\gset
select :'e1' || '|' || :'aviso' || '|' || :'e2' || '|' || (select pagado || '/' || total || '/' || (pagado_en is not null) from retail.pedidos_web where id = :'a')
       || '|' || (select estado from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') || '|' || (${CUADRA});`,
    "confirmado|false|pagado|200.00/200.00/true|pagado|true",
  );
  escenario(
    "el n.º de operación no se repite en ningún pedido (lo dice con el número del otro), ni con espacios; anulado, se puede volver a anotar",
    `${confirmadoPorConseguir("a")}
${confirmadoPorConseguir("b", ["v2"])}
select (${pagar("a", 10, "yape", "41000201")} ->> 'pago_id') as pago \\gset
select (select codigo from retail.pedidos_web where id = :'a') as cod_a \\gset
select pg_temp.probar(${pagarSql("b", 10, "transferencia", "4100 0201")}) as dup \\gset
select retail.anular_pago_pedido_web(:'pago', 'error_al_anotar') is not null as _x \\gset
select split_part(:'dup', '|', 2) || '|' || (position(:'cod_a' in :'dup') > 0)::text || '|' || pg_temp.probar(${pagarSql("b", 10, "yape", "41000201")});`,
    "pedido_web_operacion_repetida|true|ok",
  );
  escenario(
    "el efectivo entra a la caja abierta de la tienda (sube su cuadre, con el número del pedido); sin caja abierta no se cobra",
    `${confirmadoPorConseguir("a")}
select pg_temp.caja_nueva(:'tru', 100) as caja \\gset
select (${pagar("a", 30, "efectivo")} ->> 'pago_id') as pago \\gset
select (select cm.caja_id = :'caja'::uuid and cm.tipo = 'ingreso' and cm.monto = 30 and cm.motivo like 'Pago del pedido web W-%'
          from retail.pedido_web_pagos g join retail.caja_movimientos cm on cm.id = g.caja_movimiento_id where g.id = :'pago') as en_caja \\gset
select pg_temp.esperado(:'caja') as esp \\gset
select pg_temp.cerrar(:'caja') as _cc \\gset
select :'en_caja' || '|' || :'esp' || '|' || ${hint(pagarSql("a", 10, "efectivo"))};`,
    "t|130.00|pedido_web_sin_caja",
  );
  escenario(
    "el efectivo anulado sale de la caja abierta del día en que se devuelve, no de la que lo recibió (decisión de Felipe, ADR-0408 act. c)",
    `${confirmadoPorConseguir("a")}
select pg_temp.caja_nueva(:'tru', 0) as caja1 \\gset
select (${pagar("a", 30, "efectivo")} ->> 'pago_id') as pago \\gset
select pg_temp.esperado(:'caja1') as esp1 \\gset
select pg_temp.cerrar(:'caja1') as _c1 \\gset
select retail.abrir_caja(:'tru', 100, 'prueba cobrar pedidos web: el día siguiente') as caja2 \\gset
select pg_temp.probar(format('select retail.anular_pago_pedido_web(%L, %L); set constraints all immediate', :'pago', 'devuelto_al_cliente')) as prueba \\gset
select retail.anular_pago_pedido_web(:'pago', 'devuelto_al_cliente') is not null as _x \\gset
set constraints all immediate;
select :'esp1' || '|' || :'prueba' || '|' || (select cm.caja_id = :'caja2'::uuid and cm.tipo = 'egreso' and cm.monto = 30
          from retail.pedido_web_pagos g join retail.caja_movimientos cm on cm.id = g.anulado_caja_movimiento_id where g.id = :'pago')::text
       || '|' || pg_temp.esperado(:'caja2') || '|' || (select count(*) from retail.caja_movimientos where caja_id = :'caja1');`,
    "30.00|ok|true|70.00|1",
  );
  escenario(
    "si la caja abierta de hoy no tiene ese efectivo, no se devuelve (el candado de la caja) y nada cambia",
    `${confirmadoPorConseguir("a")}
select pg_temp.caja_nueva(:'tru', 0) as caja1 \\gset
select (${pagar("a", 30, "efectivo")} ->> 'pago_id') as pago \\gset
select pg_temp.cerrar(:'caja1') as _c1 \\gset
select retail.abrir_caja(:'tru', 10, 'prueba cobrar pedidos web: poca plata') as caja2 \\gset
select ${hint(`format('select retail.anular_pago_pedido_web(%L, %L); set constraints all immediate', :'pago', 'devuelto_al_cliente')`)}
       || '|' || (select estado from retail.pedido_web_pagos where id = :'pago') || '|' || pg_temp.esperado(:'caja2')
       || '|' || (select pagado from retail.pedidos_web where id = :'a');`,
    "efectivo_insuficiente|aprobado|10.00|30.00",
  );
  escenario(
    "sin caja abierta no se devuelve el efectivo; un pago digital se anula sin tocar ninguna caja",
    `${confirmadoPorConseguir("a")}
select pg_temp.caja_nueva(:'tru', 0) as caja1 \\gset
select (${pagar("a", 30, "efectivo")} ->> 'pago_id') as pago_e \\gset
select (${pagar("a", 20, "plin", "41000301")} ->> 'pago_id') as pago_d \\gset
select pg_temp.cerrar(:'caja1') as _c1 \\gset
select (select count(*) from retail.caja_movimientos) as movs \\gset
select ${hint(`format('select retail.anular_pago_pedido_web(%L, %L)', :'pago_e', 'devuelto_al_cliente')`)} as sin_caja \\gset
select retail.anular_pago_pedido_web(:'pago_d', 'devuelto_al_cliente') is not null as _d \\gset
select :'sin_caja' || '|' || (select estado || '/' || (anulado_caja_movimiento_id is null) from retail.pedido_web_pagos where id = :'pago_d')
       || '|' || ((select count(*) from retail.caja_movimientos) = :'movs'::bigint) || '|' || (select pagado from retail.pedidos_web where id = :'a');`,
    "pedido_web_sin_caja|anulado/true|true|30.00",
  );

  // ===================================================================================================================
  console.log("— C. El token sigue al contenido —");
  escenario(
    "el mismo envío dos veces es el MISMO pago (suma una vez); el mismo token con otro monto se rechaza",
    `${confirmadoPorConseguir("a")}
select gen_random_uuid() as tok \\gset
select (${pagar("a", 7, "yape", "41000401", ":'tok'")} ->> 'pago_id') as p1 \\gset
select (${pagar("a", 7, "yape", "41000401", ":'tok'")} ->> 'pago_id') as p2 \\gset
select (:'p1' = :'p2')::text || '|' || (select pagado from retail.pedidos_web where id = :'a') || '|'
       || ${hint(pagarSql("a", 8, "yape", "41000401", ":'tok'"))} || '|' || ${hint(pagarSql("a", 7, "plin", "41000401", ":'tok'"))};`,
    "true|7.00|token_reusado|token_reusado",
  );
  escenario(
    "la hoja pregunta por un pago en duda: «hecho» con lo que guardó, o «no llegó»; y el que no llegó ya no entra",
    `${confirmadoPorConseguir("a")}
-- «tok» es un envío que nunca llegó a la base (la red se cayó antes); «tok2», uno que sí guardó y cuya respuesta se perdió.
select gen_random_uuid() as tok \\gset
select gen_random_uuid() as tok2 \\gset
select retail.fn_resolver_intento('registrar_pago_pedido_web', :'tok') as r_no \\gset
select (${pagar("a", 12, "yape", "41000501", ":'tok2'")} ->> 'pago_id') as p \\gset
select retail.fn_resolver_intento('registrar_pago_pedido_web', :'tok2') as r_si \\gset
select (:'r_no'::jsonb ->> 'estado') || '|' || (:'r_si'::jsonb ->> 'estado') || '|' || ((:'r_si'::jsonb ->> 'pago_id') = :'p')::text
       || '|' || (:'r_si'::jsonb ->> 'monto') || '|' || ${hint(pagarSql("a", 12, "yape", "41000502", ":'tok'"))};`,
    "no_llego|hecho|true|12.00|intento_descartado",
  );
  escenario(
    "solo revisa un pago en duda quien opera la tienda del pedido (Micaela, en Trujillo, no el de un pedido de Lima)",
    `${confirmadoPorConseguir("a", ["v1"], "lim")}
select gen_random_uuid() as tok \\gset
select (${pagar("a", 15, "yape", "41000601", ":'tok'")} ->> 'pago_id') as p \\gset
${MICAELA_CON_EL_MODULO}
select ${hint(`format('select retail.fn_resolver_intento(%L, %L)', 'registrar_pago_pedido_web', :'tok')`)};`,
    "intento_de_otra_sede",
  );
  escenario(
    // D8 (Felipe 2026-10-15, 20261016001000): hasta que una pasarela confirme el pago sola, Yape, Plin y transferencia los anota el líder.
    "Yape, Plin o transferencia de un pedido web solo los anota el líder: Micaela (con el módulo) no, en efectivo sí; Felipe sí",
    `${confirmadoPorConseguir("a")}
${MICAELA_CON_EL_MODULO}
select ${hint(pagarSql("a", 5, "yape", "41000701"))} as yape \\gset
select ${hint(pagarSql("a", 5, "transferencia", "41000702"))} as transf \\gset
select (${pagar("a", 5, "efectivo")} ->> 'pago_id') is not null as efectivo \\gset
set local request.jwt.claim.sub = '${FELIPE}';
select (${pagar("a", 5, "plin", "41000703")} ->> 'pago_id') is not null as lider \\gset
select :'yape' || '|' || :'transf' || '|' || :'efectivo' || '|' || :'lider' || '|' || (select pagado from retail.pedidos_web where id = :'a');`,
    "pedido_web_pago_digital_solo_lider|pedido_web_pago_digital_solo_lider|t|t|10.00",
  );

  // ===================================================================================================================
  console.log("— E. Pegar las migraciones dos veces —");
  {
    const sql = MIGRACIONES.map((f) => readFileSync(f, "utf8")).join("\n");
    const dos = correr(`${preparar(`${sql}\n${sql}`)}${confirmadoPorConseguir("a")}
select pg_temp.caja_nueva(:'tru', 0) as caja \\gset
select (${pagar("a", 100, "efectivo", null, "gen_random_uuid()")} ->> 'estado_pedido')
       || '|' || (retail.fn_pedido_web_detalle(:'a') ->> 'caja_abierta');\nrollback;\n`);
    esperarValor("las dos migraciones pegadas dos veces: se cobra en efectivo y el pedido queda pagado", dos, "pagado|true");
  }
}

// ===================================================================================================================
// D. Dos a la vez: dos sesiones REALES anotan el mismo n.º de operación en dos pedidos distintos. Con ROLLBACK la segunda no
// puede «perder» (la primera no se commitea; eso lo prueba B en serie): aquí se ve lo que solo se ve con dos conexiones, que el
// índice las ORDENA (la segunda espera a la primera, sin bloqueo mutuo) y que con un tope de espera la segunda se rinde sin anotar.
async function carrera() {
  console.log("— D. El mismo n.º de operación en dos pedidos a la vez —");
  if (APLICAR_ANTES) {
    console.log("  (con APLICAR_ANTES no corre: dos sesiones que crean las mismas funciones se esperan en el catálogo, no en el índice)");
    return;
  }
  // Dos prendas que se venden en Trujillo, una por sesión (no se tocan: cada pedido se confirma «por conseguir», sin reservar, y
  // así lo único que comparten las dos sesiones es el n.º de operación).
  const r = correr(`
select string_agg(id::text, ',' order by id) from (
  select v.id from retail.variantes v
   where v.activo and v.precio > 0 and v.id <> '22222222-2222-4222-8222-222222222222'
     and retail.fn_variante_permitida_en_sede(v.id, (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'))
   order by v.id limit 2) x;`);
  const variantes = r.ok ? r.salida.split(",").filter(Boolean) : [];
  if (variantes.length < 2) {
    esperar("la carrera necesita dos prendas que se vendan en Trujillo", false, r.mensaje ?? "no hay dos");
    return;
  }
  const OP = "41009999";
  const sesion = (nombre, extra = "", espera = "") => {
    const variante = nombre === "A" ? variantes[0] : variantes[1];
    return `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${extra}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select precio::text as precio from retail.variantes where id = '${variante}' \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Carrera cobrar ${nombre}', '${nombre === "A" ? "999666554" : "999666553"}') returning id as cli \\gset
select (retail.crear_pedido_web(:'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', '${variante}', 'precio_lista', :'precio'::numeric)))
        ->> 'pedido_id') as ped \\gset
select retail.confirmar_pedido_web(:'ped', (select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', 'por_conseguir', 'fecha', retail.fn_hoy_lima() + 7))
                                            from retail.pedido_web_lineas l where l.pedido_id = :'ped')) is not null as _c \\gset
select 'PAGO:' || (retail.registrar_pago_pedido_web(:'ped', 1, 'yape', '${OP}') ->> 'estado_pago');
${espera}
rollback;
`;
  };
  {
    const pA = psqlAsync(sesion("A", "", "select pg_sleep(2.5);"));
    await dormir(600);
    const pB = psqlAsync(sesion("B"));
    const [a, b] = await Promise.all([pA, pB]);
    const todo = `${a.stdout}${a.stderr}${b.stdout}${b.stderr}`.toLowerCase();
    const sinDeadlock = !todo.includes("deadlock");
    const ambas = a.code === 0 && b.code === 0 && a.stdout.includes("PAGO:aprobado") && b.stdout.includes("PAGO:aprobado");
    const espero = b.ms > 1800;
    esperar(
      "dos personas anotan el mismo n.º de operación a la vez: la segunda espera a que la primera termine (el índice las ordena), sin bloqueo mutuo",
      sinDeadlock && ambas && espero,
      `sin_bloqueo=${sinDeadlock} ambas=${ambas} esperó=${espero} (B: ${b.ms} ms)\nA: ${a.stderr.trim()}\nB: ${b.stderr.trim()}`,
    );
  }
  {
    const pA = psqlAsync(sesion("A", "", "select pg_sleep(2.0);"));
    await dormir(600);
    const pB = psqlAsync(sesion("B", "set local lock_timeout = '500ms';"));
    const [a, b] = await Promise.all([pA, pB]);
    const ok = a.code === 0 && a.stdout.includes("PAGO:aprobado") && b.code !== 0 && /lock timeout/i.test(b.stderr) && !b.stdout.includes("PAGO:");
    esperar(
      "mientras la primera tiene ese n.º sin terminar, la segunda no lo anota: con un tope de espera, se rinde sin guardar nada",
      ok,
      `A: code=${a.code} ${a.stderr.trim()}\nB: code=${b.code} ${b.stderr.trim()} ${b.stdout.trim()}`,
    );
  }
}

main();
await carrera();
console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);
