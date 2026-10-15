#!/usr/bin/env node
/**
 * Ventas ▸ Pedidos web en el ERP (ADR-0408, actividad 8) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015010000_pedidos_web_erp.sql` y `20261015011000_pedidos_web_en_catalogo_y_existencias.sql`, sobre el motor
 * del pedido web (`20261014235000` y `20261015000000`, que prueba `pedidos_web_motor.mjs`):
 *   A. El módulo `pedidos_web`: nace en Ventas, delegable y SIN rol (solo el líder); sin él no se lee ni se envía; con él, solo
 *      la tienda que se opera.
 *   B. Los plazos salen de Configuración ▸ Tienda web (`configuracion_tienda_web`): confirmar, la lista y el detalle los usan
 *      cuando no se les pasa un número.
 *   C. El aviso de «confirmado y sin pagar» (decisión de Felipe, ADR-0408 act. c): no salta mientras el pedido espera una prenda
 *      (por conseguir o en camino) con su adelanto pagado; al llegar, corre desde que quedó reservada; sin adelanto, como siempre.
 *   D. Traer la prenda reservada en otra tienda: enviar suelta la reserva y arma el traslado en la misma transacción (también si
 *      estaba colgada), al recibir queda reservada sola, si el envío se anula vuelve a reservarse allá, si el traslado se cierra
 *      sin ella sigue por conseguir; doble clic, errores y lo que la base no deja hacer a mano.
 *   E. Las lecturas de la pantalla (lista, detalle, «Para enviar» sin el cliente) y los apartados de Existencias.
 *   F. Catálogo: una prenda con un pedido web no se ofrece para eliminar y lo dice con su nombre («tiene pedidos web»).
 *   G. Las dos migraciones se pueden pegar dos veces.
 *   Y después de cada escenario que mueve prendas, el stock de las prendas de la prueba cuadra con `movimientos` (INV-01).
 *
 * CÓMO. Como `pedidos_web_motor.mjs`: cada escenario en su transacción y ROLLBACK (el Postgres local lo comparten los worktrees).
 * Cada uno arma su piso de partida con prendas NUEVAS (sin historia ni stock: lo que necesita lo deja con una «entrada» del libro)
 * y un cliente «ZZ». Los errores esperados se prueban con `pg_temp.probar` (deshace lo que hizo) y se reconocen por su HINT. Para
 * el paso del tiempo, el escenario apaga SOLO en su transacción los disparadores que protegen las fechas y las corre hacia atrás.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<erp.sql>,<catalogo.sql>` mete las migraciones dentro de cada transacción. Sin la
 * variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, a Felipe como líder y a Micaela como integrante de
 * Trujillo (el seed), y el motor del pedido web y Configuración ▸ Tienda web aplicados.
 *
 * USO
 *   pnpm pruebas:pedidos-web-erp
 *   pnpm pruebas:pedidos-web-erp -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261015010000_pedidos_web_erp.sql",
  "supabase/migrations/20261015011000_pedidos_web_en_catalogo_y_existencias.sql",
];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todos los módulos y opera todas las tiendas
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo «Pedidos web»

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

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
  select 'ZZ Pedido web ERP ${n}', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p${n} \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p${n}', 'ZZ-PWE-${n}', 100, 40, true) returning id as v${n} \\gset
`;

const AYUDAS = `
-- Corre una llamada y DESHACE todo lo que hizo (éxito o error): 'ok' o 'error|<hint>|<mensaje>'.
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
-- Lo mismo, pero lo hecho se QUEDA si sale bien.
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return 'error|' || coalesce(v_hint, '') || '|' || v_msg;
end $f$;
-- Deja n unidades más en una fila (una «entrada» del libro).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba pedidos web ERP: colchón') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
create function pg_temp.libres(p_v uuid, p_u uuid, p_sub uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad - cantidad_apartada), 0)::integer from retail.stock
   where variante_id = p_v and ubicacion_id = p_u and sububicacion_id is not distinct from p_sub
$f$;
create function pg_temp.apartada(p_v uuid, p_u uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad_apartada), 0)::integer from retail.stock where variante_id = p_v and ubicacion_id = p_u
$f$;
create function pg_temp.fisico_en(p_v uuid, p_u uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad), 0)::integer from retail.stock where variante_id = p_v and ubicacion_id = p_u
$f$;
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
create function pg_temp.caja(p_u uuid) returns uuid language plpgsql as $f$
declare v uuid;
begin
  select id into v from retail.cajas where ubicacion_id = p_u and estado = 'abierta';
  if v is null then v := retail.abrir_caja(p_u, 0, 'prueba pedidos web ERP'); end if;
  return v;
end $f$;
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
-- escenario parte con una caja abierta en las dos tiendas y una serie de boleta propia de la prueba (en el seed local Lima y Trujillo
-- comparten B001; en producción cada tienda tiene la suya). Solo dentro de esta transacción.
update retail.series_comprobantes
   set serie = case tipo when 'boleta' then 'B' else 'F' end || case when ubicacion_id = :'tru' then 'T98' else 'L98' end, siguiente_numero = 1
 where ubicacion_id in (:'tru', :'lim') and tipo in ('boleta', 'factura') and archivada_at is null;
select pg_temp.caja(:'tru') is not null and pg_temp.caja(:'lim') is not null as _cajas \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente pedidos web ERP', '999888771') returning id as cli \\gset
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
`;
const PREPARAR = preparar(APLICAR_ANTES);
const CUADRA = `pg_temp.descuadre(:'v1') = '' and pg_temp.descuadre(:'v2') = ''`;

// Un pedido con las prendas dadas (una unidad por elemento), en Trujillo salvo que se diga otra cosa.
const separar = (alias, prendas = ["v1"], ubic = "tru") => `
select (retail.crear_pedido_web(:'cli', :'${ubic}', jsonb_build_array(${prendas
  .map((p) => `jsonb_build_object('variante_id', :'${p}', 'precio_lista', 100)`)
  .join(", ")})) ->> 'pedido_id') as ${alias} \\gset
`;
const confirmar = (alias, decision = "reservar", ubic = "null") =>
  `select retail.confirmar_pedido_web(:'${alias}', pg_temp.todas(:'${alias}', '${decision}', ${ubic === "null" ? "null" : `:'${ubic}'`})) is not null as _c \\gset\n`;
// Lima envía a Trujillo lo reservado allá (llega mañana); deja el traslado en :tr (o el nombre que se pida).
const enviar = (alias, como = "tr", desde = "lim") =>
  `select (retail.enviar_pedido_web_desde(:'${alias}', :'${desde}', now() + interval '1 day') ->> 'transferencia_id') as ${como} \\gset\n`;
const enviarSql = (alias, desde = "lim", cuando = "now() + interval ''1 day''") =>
  `format('select retail.enviar_pedido_web_desde(%L, %L, ${cuando})', :'${alias}', :'${desde}')`;
// Trujillo cuenta lo que llegó y confirma la recepción (al almacén).
const recibir = (tr, v, n) =>
  `select retail.registrar_recepcion_traslado(:'${tr}', :'${v}', ${n}) is not null as _r \\gset
select (select resultado from retail.confirmar_traslado(:'${tr}', 'almacen_tienda')) as _conf \\gset\n`;
const vender = (prenda = "v1") =>
  `format('select retail.registrar_venta(%L, jsonb_build_array(jsonb_build_object(''variante_id'', %L, ''cantidad'', 1, ''precio_unitario'', 100)), jsonb_build_array(jsonb_build_object(''metodo'', ''efectivo'', ''monto'', 100)))', :'tru', :'${prenda}')`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;
// El paso del tiempo, solo en esta transacción (como en pedidos_web_motor.mjs).
const VIAJAR_EN_EL_TIEMPO = (sql) => `
set constraints all immediate;
alter table retail.pedidos_web disable trigger pedidos_web_reglas;
alter table retail.pedido_web_lineas disable trigger pedido_web_lineas_reglas;
${sql}
alter table retail.pedidos_web enable trigger pedidos_web_reglas;
alter table retail.pedido_web_lineas enable trigger pedido_web_lineas_reglas;
set constraints all deferred;
`;
// Un rol de prueba con «Pedidos web» para Micaela (solo dentro de la transacción).
const MICAELA_CON_EL_MODULO = `
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000c8', 'Pedidos web (prueba ERP)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000c8', 'pedidos_web');
update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000c8'
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
    const hay = correr("select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('enviar_pedido_web_desde', 'fn_apartados_de_pedidos_web');");
    if (hay.salida !== "2") {
      console.error(`Faltan las funciones de Pedidos web en el ERP: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=${MIGRACIONES.join(",")}`);
      process.exit(2);
    }
  }
  const prep = correr(`${PREPARAR}select :'v1' || '|' || :'v2' || '|' || :'cli';\nrollback;\n`);
  if (!prep.ok) {
    console.error(`No se pudo armar el piso de partida:\n${prep.mensaje}`);
    process.exit(2);
  }

  // ===================================================================================================================
  console.log("— A. El módulo —");
  escenario(
    "«Pedidos web» nace en Ventas (entre Apartados y Caja), delegable y SIN ningún rol: solo el líder lo ve",
    `select (select grupo || '|' || orden || '|' || delegable || '|' || solo_lider from retail.modulos where clave = 'pedidos_web')
  || '|' || (select count(*) from retail.rol_modulos where modulo = 'pedidos_web')
  || '|' || retail.fn_ve_modulo('pedidos_web')::text;`,
    "Ventas|17|true|false|0|true",
  );
  escenario(
    "las funciones nuevas: las de la pantalla, solo `authenticated` (con el candado adentro); las internas, nadie de afuera; ninguna, `anon`, `public` ni `tienda_web`",
    `select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text, ',' order by p.proname)
         || '|' || count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE')
                                     or has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
  from pg_proc p
 where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('enviar_pedido_web_desde', 'fn_apartados_de_pedidos_web', 'fn_pedido_web_detalle', 'fn_pedidos_web_tablero',
                     'fn_pedidos_web_por_confirmar', 'fn_pedido_web_plazos', 'fn_pedido_web_prenda', 'fn_pedido_web_llego_en_traslado',
                     'fn_pedido_web_traslado_anulado');`,
    "enviar_pedido_web_desde:true,fn_apartados_de_pedidos_web:true,fn_pedido_web_detalle:true,fn_pedido_web_llego_en_traslado:false,fn_pedido_web_plazos:false,fn_pedido_web_prenda:false,fn_pedido_web_traslado_anulado:false,fn_pedidos_web_por_confirmar:true,fn_pedidos_web_tablero:true|0",
  );
  escenario(
    "el número del menú cuenta lo que espera confirmación a tiempo en la tienda; sin el módulo es nulo (nunca falla)",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1);
${separar("a")}
${separar("b", ["v2"])}
${separar("c", ["v2"])}
${confirmar("a")}
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where id = :'c';`)}
select retail.fn_pedidos_web_por_confirmar(:'tru') as con_lider \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select :'con_lider' || '|' || coalesce(retail.fn_pedidos_web_por_confirmar(:'tru')::text, 'nulo');`,
    "1|nulo",
  );
  escenario(
    "sin el módulo (Micaela, integrante) no lee la lista ni el detalle, ni envía",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
set local request.jwt.claim.sub = '${MICAELA}';
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('select retail.fn_pedidos_web_tablero(%L)', :'tru')),
  (2, format('select retail.fn_pedido_web_detalle(%L)', :'a')),
  (3, ${enviarSql("a")})
) x(n, llamada);`,
    "pedido_web_sin_modulo,pedido_web_sin_modulo,pedido_web_sin_modulo",
  );
  escenario(
    "con el módulo pero parada en Trujillo: lee su lista, no la de Lima, y no envía lo reservado en Lima",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
${MICAELA_CON_EL_MODULO}
select pg_temp.probar(format('select retail.fn_pedidos_web_tablero(%L)', :'tru')) || ',' ||
       ${hint("format('select retail.fn_pedidos_web_tablero(%L)', :'lim')")} || ',' ||
       ${hint(enviarSql("a"))} || ',' ||
       ((retail.fn_pedido_web_detalle(:'a') -> 'lineas' -> 0 ->> 'puedo_operar_alli'))::text;`,
    "ok,pedido_web_otra_tienda,pedido_web_otra_tienda,false",
  );

  // ===================================================================================================================
  console.log("— B. Los plazos, de Configuración ▸ Tienda web —");
  escenario(
    "sin pasarle plazos, confirmar y la lista usan las horas de Configuración (30 h: a las 25 se confirma; 24 h: ya venció)",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1);
${separar("a")}
${separar("b", ["v2"])}
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where id in (:'a', :'b');`)}
update retail.configuracion_tienda_web set horas_para_confirmar = 30 where id;
select (select estado from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') as leido_a,
       (select (vence_en = creado_en + interval '30 hours')::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') as vence_30,
       (retail.fn_pedidos_web_tablero(:'tru') -> 'plazos' ->> 'horas_para_confirmar') as tablero_30 \\gset
${confirmar("a")}
update retail.configuracion_tienda_web set horas_para_confirmar = 24 where id;
select :'leido_a' || '|' || :'vence_30' || '|' || :'tablero_30' || '|' || (select estado from retail.pedidos_web where id = :'a')
       || '|' || (select estado from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'b')
       || '|' || ${hint("format('select retail.confirmar_pedido_web(%L, %L)', :'b', pg_temp.todas(:'b', 'por_conseguir'))")}
       || '|' || ${hint("format('select retail.no_confirmar_pedido_web(%L, %L)', :'b', 'cliente_desistio')")};`,
    "por_confirmar|true|30|confirmado|vencido|pedido_web_vencido|pedido_web_vencido",
  );
  escenario(
    "el aviso de «sin pagar» y el de «sin recoger» usan las horas y los días de Configuración (72 h: a las 49 no avisa; 48 h: sí)",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmar("a")}
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = creado_en - interval '3 days', confirmado_en = confirmado_en - interval '49 hours' where id = :'a';`)}
update retail.configuracion_tienda_web set horas_aviso_sin_pagar = 72 where id;
select (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') || '|' || (retail.fn_pedido_web_detalle(:'a') ->> 'sin_pagar') as con_72 \\gset
update retail.configuracion_tienda_web set horas_aviso_sin_pagar = 48 where id;
select :'con_72' || '|' || (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') || '|' || (retail.fn_pedido_web_detalle(:'a') ->> 'sin_pagar');`,
    "false|false|true|true",
  );

  // ===================================================================================================================
  console.log("— C. El aviso de 48 h sin pagar (ADR-0408 act. c) —");
  escenario(
    "una prenda por conseguir con su adelanto pagado no avisa a las 49 h; sin adelanto, sí",
    `${separar("a")}
${separar("b", ["v2"])}
${confirmar("a", "por_conseguir")}
${confirmar("b", "por_conseguir")}
select retail.registrar_pago_pedido_web(:'a', 10, 'yape', '41000001') is not null as _p \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = creado_en - interval '3 days', confirmado_en = confirmado_en - interval '49 hours' where id in (:'a', :'b');`)}
select (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') || '|' ||
       (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'b');`,
    "false|true",
  );
  escenario(
    "cuando la prenda por conseguir llega (queda reservada), las horas corren desde que llegó: a las 10 h no avisa, a las 49 h sí",
    `${separar("a")}
${confirmar("a", "por_conseguir")}
select retail.registrar_pago_pedido_web(:'a', 10, 'plin', '41000002') is not null as _p \\gset
select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1);
select retail.reservar_linea_pedido_web(pg_temp.linea(:'a', 1)) is not null as _r \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = creado_en - interval '6 days', confirmado_en = confirmado_en - interval '5 days' where id = :'a';
update retail.pedido_web_lineas set reservada_en = reservada_en - interval '10 hours' where pedido_id = :'a';`)}
select (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') as a_las_10 \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedido_web_lineas set reservada_en = reservada_en - interval '39 hours' where pedido_id = :'a';`)}
select :'a_las_10' || '|' || (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a');`,
    "false|true",
  );
  escenario(
    "una prenda en camino desde otra tienda con adelanto pagado no avisa; sin adelanto, sí",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
${separar("a")}
${separar("b", ["v2"])}
${confirmar("a", "reservar", "lim")}
${confirmar("b", "reservar", "lim")}
${enviar("a", "tra")}
${enviar("b", "trb")}
select retail.registrar_pago_pedido_web(:'a', 10, 'transferencia', '41000003') is not null as _p \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = creado_en - interval '3 days', confirmado_en = confirmado_en - interval '49 hours' where id in (:'a', :'b');`)}
select (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') || '|' ||
       (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'b');`,
    "false|true",
  );
  escenario(
    "con todo reservado en su tienda, el adelanto no cambia nada: a las 49 h avisa (no espera ninguna prenda)",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmar("a")}
select retail.registrar_pago_pedido_web(:'a', 10, 'yape', '41000004') is not null as _p \\gset
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = creado_en - interval '3 days', confirmado_en = confirmado_en - interval '49 hours' where id = :'a';`)}
select (select sin_pagar::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a');`,
    "true",
  );

  // ===================================================================================================================
  console.log("— D. Traer la prenda reservada en otra tienda —");
  escenario(
    "enviar suelta la reserva de Lima y arma el traslado hacia Trujillo en la MISMA transacción: la línea queda por conseguir con su traslado y su fecha, y el libro cuadra",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 2);
${separar("a")}
${confirmar("a", "reservar", "lim")}
select apartado_id as ap_lim from retail.pedido_web_lineas where pedido_id = :'a' \\gset
select (retail.fn_pedidos_web_tablero(:'lim') -> 'para_enviar' -> 0 ->> 'pedido_id') = :'a' as en_la_lista,
       pg_temp.apartada(:'v1', :'lim') as apa, pg_temp.fisico_en(:'v1', :'lim') as fis \\gset
${enviar("a")}
select :'en_la_lista'::boolean
   and (select estado = 'por_conseguir' and transferencia_id = :'tr'::uuid and apartado_id is null and ubicacion_id is null
               and fecha_compromiso = ((now() + interval '1 day') at time zone 'America/Lima')::date
          from retail.pedido_web_lineas where pedido_id = :'a')
   and (select estado = 'liberado' and cierre_motivo = 'otro' from retail.apartados where id = :'ap_lim')
   and (select t.ubicacion_origen_id = :'lim'::uuid and t.ubicacion_destino_id = :'tru'::uuid and t.estado = 'en_transito'
               and t.nota like 'Pedido web W-%' and t.nota !~ 'ZZ Cliente'
          from retail.transferencias t where t.id = :'tr')
   and (select string_agg(ti.variante_id || ':' || ti.cantidad, ',') from retail.transferencia_items ti where ti.transferencia_id = :'tr') = :'v1' || ':1'
   and pg_temp.apartada(:'v1', :'lim') = :'apa'::integer - 1 and pg_temp.fisico_en(:'v1', :'lim') = :'fis'::integer - 1
   and jsonb_array_length(retail.fn_pedidos_web_tablero(:'lim') -> 'para_enviar') = 0
   and (select por_traer || '/' || por_conseguir from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') = '1/0'
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "al recibirla en Trujillo queda reservada SOLA para su pedido (en el almacén), Vender ya no puede venderla, y pagada queda lista para recoger",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
select pg_temp.caja(:'tru') as caja \\gset
${separar("a")}
${confirmar("a", "reservar", "lim")}
${enviar("a")}
${recibir("tr", "v1", 1)}
select retail.registrar_pago_pedido_web(:'a', 100, 'yape', '41000005') is not null as _p \\gset
select (select l.estado || '|' || (l.ubicacion_id = :'tru'::uuid)::text || '|' || (l.sububicacion_id = :'tru_alm'::uuid)::text || '|' || a.estado || '|' || a.clienta_nombre
          from retail.pedido_web_lineas l join retail.apartados a on a.id = l.apartado_id where l.pedido_id = :'a')
       || '|' || :'_conf' || '|' || pg_temp.libres(:'v1', :'tru', :'tru_alm')
       || '|' || (pg_temp.probar(${vender()}) like 'error|%Stock insuficiente%')::text
       || '|' || (select listo_para_recoger::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a')
       || '|' || (${CUADRA})::text
       = 'reservada|true|true|abierto|Pedido web ' || (select codigo from retail.pedidos_web where id = :'a') || '|cerrada|0|true|true|true';`,
    "t",
  );
  escenario(
    "colgada en el piso de Lima: enviar la descuelga al almacén y la manda, en un solo paso",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
select (retail.fn_pedido_web(:'a') -> 'lineas' -> 0 ->> 'lugar') as lugar \\gset
${enviar("a")}
select :'lugar' = 'piso'
   and exists (select 1 from retail.movimientos m where m.variante_id = :'v1' and m.tipo = 'traslado' and m.motivo = 'movimiento_interno'
                and m.sububicacion_id = :'lim_piso'::uuid and m.sububicacion_destino_id = :'lim_alm'::uuid)
   and (select estado from retail.transferencias where id = :'tr') = 'en_transito'
   and pg_temp.fisico_en(:'v1', :'lim') = 0
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "si el envío se anula, la prenda vuelve a Lima y se vuelve a reservar allá para su pedido (otra vez «para enviar»)",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
${enviar("a")}
select retail.anular_traslado(:'tr', 'se armó mal la caja', null) is not null as _an \\gset
select (select l.estado = 'reservada' and l.ubicacion_id = :'lim'::uuid and l.transferencia_id = :'tr'::uuid and a.estado = 'abierto'
          from retail.pedido_web_lineas l join retail.apartados a on a.id = l.apartado_id where l.pedido_id = :'a')
   and (retail.fn_pedidos_web_tablero(:'lim') -> 'para_enviar' -> 0 ->> 'pedido_id') = :'a'
   and (select por_traer from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') = 1
   and pg_temp.libres(:'v1', :'lim', :'lim_alm') = 0
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "si el traslado se cierra sin la prenda, la línea sigue por conseguir (ya no «en camino») y se puede reservar en otra tienda",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
${enviar("a")}
${recibir("tr", "v1", 0)}
select retail.cerrar_traslado_con_diferencia(:'tr', 'no vino') is not null as _x \\gset
select (select estado from retail.transferencias where id = :'tr') || '|' || :'_conf' || '|'
       || (select estado from retail.pedido_web_lineas where pedido_id = :'a') || '|'
       || (select por_conseguir || '/' || por_traer from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') as tras \\gset
select pg_temp.dejar(:'v1', :'tru', :'tru_piso', 1);
select retail.reservar_linea_pedido_web(pg_temp.linea(:'a', 1)) is not null as _r \\gset
select :'tras' || '|' || (select estado from retail.pedido_web_lineas where pedido_id = :'a') || '|' || (${CUADRA})::text;`,
    "cerrada|recibido_con_diferencia|por_conseguir|1/0|reservada|true",
  );
  escenario(
    "no se envía desde la tienda del pedido, ni sin nada reservado allá, ni con una fecha pasada o muy lejana, ni un pedido por confirmar o anulado",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a")}
${separar("b", ["v2"])}
${confirmar("b", "reservar", "lim")}
${separar("c", ["v2"])}
${separar("d", ["v2"])}
select retail.no_confirmar_pedido_web(:'d', 'cliente_desistio') is not null as _n \\gset
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, ${enviarSql("a", "tru")}),
  (2, ${enviarSql("a", "lim")}),
  (3, ${enviarSql("b", "lim", "now() - interval ''2 days''")}),
  (4, ${enviarSql("b", "lim", "now() + interval ''61 days''")}),
  (5, ${enviarSql("c", "lim")}),
  (6, ${enviarSql("d", "lim")})
) x(n, llamada);`,
    "pedido_web_nada_que_enviar,pedido_web_nada_que_enviar,pedido_web_fecha,pedido_web_fecha,pedido_web_estado,pedido_web_estado",
  );
  escenario(
    "doble clic: la misma marca devuelve el MISMO traslado; sin marca, el segundo envío ya no encuentra nada que mandar",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
select gen_random_uuid() as tok \\gset
select retail.enviar_pedido_web_desde(:'a', :'lim', now() + interval '1 day', :'tok') as r1 \\gset
select retail.enviar_pedido_web_desde(:'a', :'lim', now() + interval '1 day', :'tok') as r2 \\gset
select ((:'r1'::jsonb ->> 'transferencia_id') = (:'r2'::jsonb ->> 'transferencia_id'))::text || '|' || (:'r2'::jsonb ->> 'repetido')
       || '|' || (select count(*) from retail.transferencias t where t.nota like 'Pedido web ' || (select codigo from retail.pedidos_web where id = :'a') || ' %')
       || '|' || ${hint(enviarSql("a"))};`,
    "true|true|1|pedido_web_nada_que_enviar",
  );
  escenario(
    "a mano no se suelta una reserva ni se anota un traslado en la línea (sin la marca del envío)",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
${separar("b", ["v2"])}
${confirmar("b", "reservar", "lim")}
${enviar("b", "trb")}
set constraints all immediate;
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('update retail.pedido_web_lineas set estado = %L, apartado_id = null, ubicacion_id = null, sububicacion_id = null, reservada_en = null, fecha_compromiso = retail.fn_hoy_lima() + 1 where pedido_id = %L', 'por_conseguir', :'a')),
  (2, format('update retail.pedido_web_lineas set transferencia_id = null where pedido_id = %L', :'b')),
  (3, format('insert into retail.pedido_web_lineas (pedido_id, posicion, variante_id, precio_lista, transferencia_id) values (%L, 5, %L, 10, %L)', (select id from retail.pedidos_web where id = :'a'), :'v1', :'trb'))
) x(n, llamada);`,
    "pedido_web_inmutable,pedido_web_inmutable,pedido_web_transicion",
  );
  escenario(
    "dos prendas iguales reservadas en Lima viajan juntas en un traslado de 2, y al llegar se reservan las dos",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 2);
${separar("a", ["v1", "v1"])}
${confirmar("a", "reservar", "lim")}
${enviar("a")}
select (select cantidad from retail.transferencia_items where transferencia_id = :'tr') as cant \\gset
${recibir("tr", "v1", 2)}
select :'cant' || '|' || (select string_agg(estado || '@' || (ubicacion_id = :'tru'::uuid)::text, ',' order by posicion) from retail.pedido_web_lineas where pedido_id = :'a')
       || '|' || (${CUADRA})::text;`,
    "2|reservada@true,reservada@true|true",
  );
  escenario(
    "si el pedido se anula mientras la prenda viaja, al llegar no se reserva: entra libre a Trujillo",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
${enviar("a")}
select retail.anular_pedido_web(:'a', 'cliente_desistio') is not null as _x \\gset
${recibir("tr", "v1", 1)}
select (select estado from retail.pedido_web_lineas where pedido_id = :'a') || '|' || pg_temp.libres(:'v1', :'tru', :'tru_alm') || '|' || (${CUADRA})::text;`,
    "por_conseguir|1|true",
  );
  escenario(
    "si al llegar no se puede reservar (la prenda quedó descontinuada), el traslado se cierra igual y la línea sigue por conseguir",
    // La pantalla no deja descontinuar una talla con prendas en camino (\`variantes_talla_con_prendas_no_se_retira\`): aquí se apaga
    // ese candado SOLO en la transacción, para llegar al caso que la llegada tiene que aguantar sin frenar la recepción.
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
${enviar("a")}
set constraints all immediate;
alter table retail.variantes disable trigger variantes_talla_con_prendas_no_se_retira;
update retail.variantes set activo = false where id = :'v1';
alter table retail.variantes enable trigger variantes_talla_con_prendas_no_se_retira;
set constraints all deferred;
${recibir("tr", "v1", 1)}
select :'_conf' || '|' || (select estado from retail.pedido_web_lineas where pedido_id = :'a') || '|' || pg_temp.libres(:'v1', :'tru', :'tru_alm') || '|' || (${CUADRA})::text;`,
    "cerrada|por_conseguir|1|true",
  );

  // ===================================================================================================================
  console.log("— E. Las lecturas de la pantalla —");
  escenario(
    "la lista trae cada pedido con sus prendas dibujables (sin las quitadas) y lo cobrado hoy; «Para enviar» no trae al cliente",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
${separar("a", ["v1", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar'),
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'quitar'))) is not null as _c \\gset
${separar("b", ["v2"])}
${confirmar("b", "reservar", "lim")}
select retail.registrar_pago_pedido_web(:'a', 30, 'yape', '41000006') is not null as _p \\gset
select retail.fn_pedidos_web_tablero(:'tru') as t, retail.fn_pedidos_web_tablero(:'lim') as l \\gset
select jsonb_array_length((select x from jsonb_array_elements(:'t'::jsonb -> 'pedidos') x where x ->> 'pedido_id' = :'a') -> 'prendas_vista')
       || '|' || (((select x from jsonb_array_elements(:'t'::jsonb -> 'pedidos') x where x ->> 'pedido_id' = :'a') -> 'prendas_vista' -> 0 ->> 'referencia')
                  = (select referencia from retail.productos where id = :'p1'))::text
       || '|' || (:'t'::jsonb ->> 'cobrado_hoy')
       || '|' || (:'l'::jsonb -> 'para_enviar' -> 0 ->> 'tienda')
       || '|' || (:'l'::jsonb -> 'para_enviar' -> 0 -> 'lineas' -> 0 ->> 'lugar')
       || '|' || (:'l'::jsonb::text ~ '(ZZ Cliente|999888771)')::text;`,
    "1|true|30.00|Tienda Trujillo|almacen|false",
  );
  escenario(
    "el detalle suma a cada prenda lo que dibuja la pantalla, el traslado que la trae y si quien mira opera la tienda de la reserva",
    `select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a", "reservar", "lim")}
select (retail.fn_pedido_web_detalle(:'a') -> 'lineas' -> 0) as antes \\gset
${enviar("a")}
select (retail.fn_pedido_web_detalle(:'a') -> 'lineas' -> 0) as despues \\gset
select ((:'antes'::jsonb ->> 'referencia') = (select referencia from retail.productos where id = :'p1'))::text || '|' || (:'antes'::jsonb ->> 'puedo_operar_alli') || '|' || coalesce(:'antes'::jsonb ->> 'traslado', 'sin traslado')
       || '|' || (:'despues'::jsonb -> 'traslado' ->> 'desde') || '|' || (:'despues'::jsonb -> 'traslado' ->> 'estado')
       || '|' || ((:'despues'::jsonb -> 'traslado' ->> 'numero')::integer = (select numero from retail.transferencias where id = :'tr'))::text
       || '|' || (retail.fn_pedido_web_detalle(:'a') -> 'plazos' ->> 'horas_aviso_sin_pagar');`,
    "true|true|sin traslado|Tienda Lima|en_transito|true|48",
  );
  escenario(
    "Existencias sabe qué apartados son la reserva de un pedido web (con su número), y liberarlos desde ahí sigue bloqueado",
    `select pg_temp.dejar(:'v1', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
${separar("a")}
${confirmar("a")}
${separar("b", ["v2"])}
${confirmar("b", "reservar", "lim")}
select apartado_id as ap from retail.pedido_web_lineas where pedido_id = :'a' \\gset
select (select pedido_codigo || '|' || tienda_pedido || '|' || para_otra_tienda from retail.fn_apartados_de_pedidos_web(:'tru') where apartado_id = :'ap')
       = (select codigo from retail.pedidos_web where id = :'a') || '|Tienda Trujillo|false'
   and (select para_otra_tienda and tienda_pedido = 'Tienda Trujillo' from retail.fn_apartados_de_pedidos_web(:'lim')
         where pedido_codigo = (select codigo from retail.pedidos_web where id = :'b'))
   and ${hint("format('select retail.liberar_apartado(%L, %L)', :'ap', 'otro')")} = 'apartado_de_pedido_web';`,
    "t",
  );

  // ===================================================================================================================
  console.log("— F. Catálogo —");
  escenario(
    "una prenda nueva que un cliente separó por la web (sin mover stock) no se ofrece para eliminar, y lo dice con su nombre",
    `select (select puede::text || '|' || coalesce(razon, '') from retail.fn_producto_se_puede_eliminar(:'p1')) as antes \\gset
${separar("a")}
select :'antes' || '|' || (select puede::text || '|' || razon from retail.fn_producto_se_puede_eliminar(:'p1'));`,
    "true||false|tiene pedidos web (1)",
  );
}

// ===================================================================================================================
// G. Las migraciones se pueden volver a pegar (dos veces cada una) y el envío sigue funcionando.
function migraciones() {
  console.log("— G. Las migraciones —");
  const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
  const dos = correr(`begin;\n${sql}\n${sql}\nselect count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('enviar_pedido_web_desde', 'fn_pedidos_web_tablero', 'fn_pedido_web_detalle', 'fn_apartados_de_pedidos_web');\nrollback;\n`);
  esperarValor("se pueden volver a correr (dos veces seguidas, como un segundo pegado)", dos, "4");
  const despues = correr(`${preparar(`${sql}\n${sql}`)}select pg_temp.dejar(:'v1', :'lim', :'lim_alm', 1);\n${separar("a")}\n${confirmar("a", "reservar", "lim")}\n${enviar("a")}\n${recibir("tr", "v1", 1)}\nselect (select estado from retail.pedido_web_lineas where pedido_id = :'a');\nrollback;\n`);
  esperarValor("y después de pegarlas dos veces, enviar y recibir siguen reservando la prenda para su pedido", despues, "reservada");
}

main();
migraciones();
console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);
