#!/usr/bin/env node
/**
 * Pruebas del CUPÓN y los PUNTOS en el PEDIDO WEB (migración `20261019224000_club_puntos_pedido_web.sql`).
 *
 * EL PROBLEMA. En la tienda web el cliente escribe el código de su cupón en la bolsa y separa: el pedido nace con el total rebajado y
 * el cupón queda RESERVADO para ese pedido (nadie más lo usa, ni en caja); se CONSUME cuando el pedido se vende y se LIBERA si el
 * pedido se anula, vence o no se confirma, o si al confirmar se quitan prendas y ya no llega a la compra mínima. Y la compra web
 * gana puntos (y el regalo de cumpleaños). Es dinero y boleta: lo hace cumplir la base.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK):
 *   a. Separar con cupón (como lo hace la tienda, con el rol tienda_web): total = prendas − cupón, el cupón queda reservado para ese
 *      pedido, y lo dicen «Mis pedidos», «Mi Club» y la hoja del pedido del ERP.
 *   b. Otro intenta usarlo: `validar_cupon` (caja), `tienda_validar_cupon` y `registrar_venta` dicen «reservado», y otro «Separar»
 *      con el mismo cupón no deja pedido.
 *   c. Al confirmar se quita una prenda y lo que queda no llega al mínimo: el cupón vuelve a activo, el total vuelve a la suma y el
 *      pedido dice por qué (compra_minima); el pedido sigue cuadrando.
 *   d. Cerrar el pedido lo libera: «No se puede confirmar» (anulado), el cierre de las 24 h (vencido) y, si el cupón ya pasó su fecha,
 *      vence ahí y devuelve sus puntos.
 *   e. Pagar completo: la venta tiene una línea por prenda con la parte del cupón (Σ = descuento), lo que se paga = total = boleta, el
 *      cupón queda usado con esa venta y la ficha del pedido gana puntos (y el regalo de cumpleaños en su mes).
 *   f. Anular el pedido pagado: el cupón vuelve (activo, nunca reservado) y los puntos se restan.
 *   g. Un cupón reservado NO vence con `fn_club_cupones_vencer` aunque pase su fecha; el pedido se vende igual.
 *   h. El mismo «Separar» dos veces (la marca) devuelve el mismo pedido con el mismo cupón; con otro código, se rechaza.
 *   i. `tienda_validar_cupon`: ok (sin decir de quién es, solo `tuyo`), mínimo, cubre todo, y el bloqueo a los 5 códigos que no
 *      existen (que también frena a «Separar»).
 *   j. Sin código, «Separar» es el de siempre (total = suma, sin cupón).
 *   k. Con BASE_DESECHABLE=1 (commitea): dos «Separar» A LA VEZ con el mismo cupón → pasa uno y el otro recibe `cupon_reservado`.
 *
 * USO
 *   pnpm pruebas:club-puntos-pedido-web                   → contra la base `postgres` del stack local (la del CI)
 *   BASE_DESECHABLE=1 pnpm pruebas:club-puntos-pedido-web → además (k), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin: confirma y cobra en cualquier tienda
const RV = "retail.registrar_venta";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
function psqlEnParalelo(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolve({ ok: codigo === 0, salida: salida.trim(), mensaje: error }));
    p.stdin.end(sql);
  });
}

const lugares = (nombre, sufijo) => `
select id as ${sufijo} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda');
select id as ${sufijo}_alm from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda' \\gset
`;

// Una prenda que se puede mostrar en la web, que se vende en las dos tiendas y sin precio propio de tienda.
const elegirPrenda = (alias, excluir = "") => `
select v.id as ${alias}, v.producto_id as prod_${alias}
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
 where v.activo and v.precio > 0 and p.estado = 'activo' and p.estado_alta <> 'rechazado' and not p.es_prueba
   and p.id <> '11111111-1111-4111-8111-111111111111'
   and retail.fn_variante_permitida_en_sede(v.id, :'tru') and retail.fn_variante_permitida_en_sede(v.id, :'lim')
   and not exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = v.producto_id and ps.archivado_en is null)
   ${excluir}
 order by v.id limit 1 \\gset
`;

const AYUDAS = `
-- Corre una llamada y DESHACE todo lo que hizo: 'ok' o 'error|<hint>|<mensaje>'.
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
grant execute on function pg_temp.probar(text) to public;
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba cupón pedido web: colchón') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
create function pg_temp.vaciar(p_v uuid, p_u uuid) returns void language plpgsql as $f$
declare r record; v_mov uuid;
begin
  for r in select st.sububicacion_id, st.cantidad - st.cantidad_apartada as libres
             from retail.stock st left join retail.sububicaciones s on s.id = st.sububicacion_id
            where st.variante_id = p_v and st.ubicacion_id = p_u and st.cantidad - st.cantidad_apartada > 0
              and (s.id is null or s.tipo <> 'cuarentena')
  loop
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba cupón pedido web: piso de partida') returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;
end $f$;
-- Confirmar como la sede: la primera prenda se reserva y la segunda (si p_quitar) se quita.
create function pg_temp.decisiones(p_pedido uuid, p_quitar boolean) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', case when p_quitar and l.posicion > 1 then 'quitar' else 'reservar' end) order by l.posicion)
    from retail.pedido_web_lineas l where l.pedido_id = p_pedido
$f$;
create function pg_temp.linea(p_v uuid) returns jsonb language sql as $f$
  select jsonb_build_object('variante_id', p_v, 'cantidad', 1, 'precio', 50.00)
$f$;
-- Un cupón de la ficha: p_puntos puntos (400 = S/ 20, compra mínima S/ 60).
create function pg_temp.cupon(p_clienta uuid, p_puntos integer) returns text language sql as $f$
  select retail.fn_club_cupon_crear(p_clienta, p_puntos, null, 'web', null) ->> 'codigo'
$f$;
create function pg_temp.pedido(p_codigo text) returns uuid language sql as $f$
  select id from retail.pedidos_web where codigo = p_codigo
$f$;
`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
update retail.configuracion_empresa set exige_responsable = false;
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
${elegirPrenda("v")}
${elegirPrenda("v2", "and v.producto_id <> :'prod_v'")}
-- Las dos a S/ 50 (sin campaña): dos = S/ 100; una sola = S/ 50, por debajo de la compra mínima de un cupón de S/ 20 (S/ 60).
update retail.variantes set precio = 50.00 where id in (:'v', :'v2');
update retail.vitrina_productos set publicado = false where publicado;
insert into retail.vitrina_productos (producto_id, publicado, publicado_en)
values (:'prod_v', true, now()), (:'prod_v2', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now();
${AYUDAS}
select pg_temp.vaciar(:'v', :'tru'), pg_temp.vaciar(:'v', :'lim'), pg_temp.vaciar(:'v2', :'tru'), pg_temp.vaciar(:'v2', :'lim');
select pg_temp.dejar(:'v', :'tru', :'tru_alm', 2), pg_temp.dejar(:'v2', :'tru', :'tru_alm', 2);
update retail.series_comprobantes
   set serie = case tipo when 'boleta' then 'B' else 'F' end || case when ubicacion_id = :'tru' then 'T97' else 'L97' end, siguiente_numero = 1
 where ubicacion_id in (:'tru', :'lim') and tipo in ('boleta', 'factura') and archivada_at is null;
select coalesce((select id from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta'), retail.abrir_caja(:'tru', 0, 'prueba cupón pedido web')) as caja_tru \\gset
select (now() at time zone 'America/Lima')::date as hoy \\gset
-- Dos miembros con cuenta web (A con 1000 puntos; B sin puntos).
select '0' || lpad((floor(random() * 9999999))::integer::text, 7, '0') as dni_a, '0' || lpad((floor(random() * 9999999))::integer::text, 7, '0') as dni_b \\gset
insert into retail.clientas (nombre, telefono_whatsapp, documento_tipo, documento_numero, club_desde, codigo_club)
  values ('ZZ CLIENTE A CUPON WEB', '999888761', 'dni', :'dni_a', now(), retail.fn_club_codigo_nuevo()) returning id as cli_a \\gset
insert into retail.clientas (nombre, telefono_whatsapp, documento_tipo, documento_numero, club_desde, codigo_club)
  values ('ZZ CLIENTE B CUPON WEB', '999888762', 'dni', :'dni_b', now(), retail.fn_club_codigo_nuevo()) returning id as cli_b \\gset
select retail.fn_club_puntos_anotar(:'cli_a', 'compra', 1000, null, null, 'prueba') is not null as _p \\gset
select gen_random_uuid() as usr_a, gen_random_uuid() as usr_b, gen_random_uuid() as tok \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
values (:'usr_a', :'cli_a', 'zz-a-' || :'dni_a' || '@prueba-cupon.test', 'prueba'), (:'usr_b', :'cli_b', 'zz-b-' || :'dni_b' || '@prueba-cupon.test', 'prueba');
select pg_temp.cupon(:'cli_a', 400) as codigo \\gset
`;
const DOS = `jsonb_build_array(pg_temp.linea(:'v'), pg_temp.linea(:'v2'))`;
const UNA = `jsonb_build_array(pg_temp.linea(:'v'))`;
const SEPARAR = (alias, { usr = "usr_a", lineas = DOS, codigo = ":'codigo'", token = "gen_random_uuid()" } = {}) =>
  `select retail.tienda_separar_con_cupon(:'${usr}', :'tru', ${lineas}, ${token}, ${codigo}) as r_${alias} \\gset
select pg_temp.pedido(:'r_${alias}'::jsonb ->> 'codigo') as ${alias} \\gset
`;
const SEPARAR_TEXTO = ({ usr = "usr_a", lineas = DOS, codigo = ":'codigo'", token = "gen_random_uuid()" } = {}) =>
  `format('select retail.tienda_separar_con_cupon(%L, %L, %L, %L, %L)', :'${usr}', :'tru', ${lineas}, ${token}, ${codigo})`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;
const VERIFICAR_YA = `split_part(pg_temp.probar('set constraints all immediate'), '|', 2)`;
const CONFIRMAR = (alias, quitar = false) =>
  `select retail.confirmar_pedido_web(:'${alias}', pg_temp.decisiones(:'${alias}', ${quitar})) is not null as _c_${alias} \\gset\n`;
const PAGAR = (alias) =>
  `select retail.registrar_pago_pedido_web(:'${alias}', (select total - pagado from retail.pedidos_web where id = :'${alias}'), 'efectivo', null, null) is not null as _p_${alias} \\gset\n`;
const VIAJAR = (sql) => `
set constraints all immediate;
alter table retail.pedidos_web disable trigger pedidos_web_reglas;
${sql}
alter table retail.pedidos_web enable trigger pedidos_web_reglas;
set constraints all deferred;
`;
const VENCER_CUPON = (c = "codigo") => `alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'${c}';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
const CUPON = (c = "codigo") => `(select estado || ':' || coalesce(pedido_web_id::text, '-') from retail.club_cupones where codigo = :'${c}')`;

let casos = 0;
let fallas = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${String(esperadoTexto).split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").pop() : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}

// ---------------------------------------------------------------- a. Separar con cupón
caso(
  "(a) separar con cupón (rol tienda_web): total 100 − 20 = 80, cupón reservado para ese pedido, y lo dicen «Mis pedidos», «Mi Club» y la hoja del ERP",
  `${COMO_TIENDA}select retail.tienda_separar_con_cupon(:'usr_a', :'tru', ${DOS}, gen_random_uuid(), :'codigo') as r_a \\gset
select retail.tienda_mis_pedidos(:'usr_a') as mis \\gset
select retail.tienda_mis_puntos(:'usr_a') as club \\gset
reset role;
select pg_temp.pedido(:'r_a'::jsonb ->> 'codigo') as a \\gset
select concat_ws('|',
  (select total || '/' || descuento_cupon || '/' || (cupon_id is not null) from retail.pedidos_web where id = :'a'),
  ${CUPON()} = 'reservado:' || :'a',
  :'r_a'::jsonb -> 'cupon' ->> 'estado', :'r_a'::jsonb ->> 'total',
  (select p -> 'cupon' ->> 'codigo' = :'codigo' and p -> 'cupon' ->> 'descuento' = '20.00' from jsonb_array_elements(:'mis'::jsonb -> 'pedidos') p where p ->> 'pedido_id' = :'a'),
  (select k ->> 'estado' || '/' || (k ->> 'pedido' = (:'r_a'::jsonb ->> 'codigo')) from jsonb_array_elements(:'club'::jsonb -> 'cupones') k where k ->> 'codigo' = :'codigo'),
  retail.fn_pedido_web_detalle(:'a') -> 'cupon' ->> 'estado',
  ${VERIFICAR_YA} = '');`,
  "80.00/20.00/true|t|reservado|80.00|t|reservado/true|reservado|t"
);

// ---------------------------------------------------------------- b. Nadie más lo usa
caso(
  "(b) reservado, nadie más lo usa: validar_cupon (caja) y tienda_validar_cupon dicen «reservado», registrar_venta lo rechaza (cupon_reservado) y otro «Separar» no deja pedido",
  `${SEPARAR("a")}select count(*) as pedidos_antes from retail.pedidos_web \\gset
select concat_ws('|',
  retail.validar_cupon(:'codigo') ->> 'motivo',
  retail.tienda_validar_cupon(:'usr_b', :'codigo', 100) ->> 'motivo',
  ${hint(`format('select ${RV}(p_ubicacion_id => %L, p_items => %L, p_pagos => %L, p_codigo_descuento => %L)', :'tru',
    jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', 50.00, 'descuento_unitario', 6.67, 'descuento_club_unitario', 6.67),
                      jsonb_build_object('variante_id', :'v2', 'cantidad', 1, 'precio_unitario', 50.00, 'descuento_unitario', 13.33, 'descuento_club_unitario', 13.33)),
    jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 80.00)), :'codigo')`)},
  ${hint(SEPARAR_TEXTO({ usr: "usr_b" }))},
  (select count(*) from retail.pedidos_web) - :pedidos_antes,
  ${CUPON()} = 'reservado:' || :'a');`,
  "reservado|reservado|cupon_reservado|cupon_reservado|0|t"
);

// ---------------------------------------------------------------- c. Quitar una prenda al confirmar
caso(
  "(c) al confirmar se quita una prenda y lo que queda (S/ 50) no llega al mínimo (S/ 60): el cupón vuelve a activo, el total vuelve a 50 y el pedido dice «compra_minima»",
  `${SEPARAR("a")}${CONFIRMAR("a", true)}select concat_ws('|',
  (select estado || '/' || total || '/' || descuento_cupon || '/' || cupon_liberado_motivo from retail.pedidos_web where id = :'a'),
  ${CUPON()},
  retail.fn_pedido_web_detalle(:'a') -> 'cupon' ->> 'estado',
  (select k ->> 'volvio_de' = (:'r_a'::jsonb ->> 'codigo') from jsonb_array_elements(retail.tienda_mis_puntos(:'usr_a') -> 'cupones') k where k ->> 'codigo' = :'codigo'),
  ${VERIFICAR_YA} = '');`,
  "confirmado/50.00/0.00/compra_minima|activo:-|liberado|t|t"
);
caso(
  "(c2) confirmar SIN quitar nada deja el cupón reservado y el total en 80",
  `${SEPARAR("a")}${CONFIRMAR("a")}select concat_ws('|', (select estado || '/' || total from retail.pedidos_web where id = :'a'), ${CUPON()} = 'reservado:' || :'a', ${VERIFICAR_YA} = '');`,
  "confirmado/80.00|t|t"
);

// ---------------------------------------------------------------- d. Cerrar el pedido libera el cupón
caso(
  "(d) «No se puede confirmar» (anulado) libera el cupón: activo, y el pedido dice «pedido_anulado»",
  `${SEPARAR("a")}select retail.no_confirmar_pedido_web(:'a', 'sin_stock') is not null as _n \\gset
select concat_ws('|', (select estado || '/' || cupon_liberado_motivo || '/' || descuento_cupon from retail.pedidos_web where id = :'a'), ${CUPON()}, ${VERIFICAR_YA} = '');`,
  "anulado/pedido_anulado/20.00|activo:-|t"
);
caso(
  "(d2) el cierre de las 24 h (vencido) libera el cupón; y si el cupón ya pasó su fecha, vence ahí y DEVUELVE sus 400 puntos",
  `${SEPARAR("a")}select pg_temp.cupon(:'cli_a', 400) as codigo2 \\gset
${SEPARAR("b", { codigo: ":'codigo2'" })}${VENCER_CUPON("codigo2")}select retail.fn_club_puntos_saldo(:'cli_a') as saldo0 \\gset
${VIAJAR(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where id in (:'a', :'b');`)}
select retail.fn_cerrar_pedidos_web_sin_confirmar() is not null as _cerro \\gset
select concat_ws('|', (select string_agg(estado || '/' || cupon_liberado_motivo, ',' order by numero) from retail.pedidos_web where id in (:'a', :'b')),
  ${CUPON()}, ${CUPON("codigo2")}, retail.fn_club_puntos_saldo(:'cli_a') - :saldo0, ${VERIFICAR_YA} = '');`,
  "vencido/pedido_vencido,vencido/pedido_vencido|activo:-|vencido:-|400|t"
);

// ---------------------------------------------------------------- e. Pagar completo
caso(
  "(e) pagar completo: la venta reparte el cupón en sus líneas (Σ 20.00), lo vendido = total = boleta = 80, el cupón queda usado con esa venta y la ficha gana 80 puntos",
  `${SEPARAR("a")}${CONFIRMAR("a")}select retail.fn_club_puntos_saldo(:'cli_a') as saldo0 \\gset
${PAGAR("a")}select venta_id as venta from retail.pedidos_web where id = :'a' \\gset
select concat_ws('|',
  (select estado || '/' || total || '/' || pagado from retail.pedidos_web where id = :'a'),
  (select sum(precio_unitario - descuento_unitario) || '/' || sum(descuento_club_unitario) || '/' || count(*) from retail.venta_items where venta_id = :'venta'),
  (select total from retail.comprobantes where venta_id = :'venta' and tipo = 'boleta'),
  (select round(sum((i ->> 'precio_unitario')::numeric - (i ->> 'descuento_unitario')::numeric), 2) from retail.comprobantes c, jsonb_array_elements(c.items) i where c.venta_id = :'venta' and c.tipo = 'boleta'),
  (select estado || '/' || (venta_id = :'venta') || '/' || (usado_por_clienta_id = :'cli_a') || '/' || (pedido_web_id = :'a') from retail.club_cupones where codigo = :'codigo'),
  retail.fn_club_puntos_saldo(:'cli_a') - :saldo0,
  retail.fn_pedido_web_detalle(:'a') -> 'cupon' ->> 'estado',
  ${VERIFICAR_YA} = '');`,
  "pagado/80.00/80.00|80.00/20.00/2|80.00|80.00|usado/true/true/true|80|usado|t"
);
caso(
  "(e2) en su mes de cumpleaños, la compra web suma además el regalo (100) una vez",
  `update retail.clientas set cumple_mes = extract(month from :'hoy'::date)::smallint, cumple_dia = 1 where id = :'cli_a';
${SEPARAR("a")}${CONFIRMAR("a")}select retail.fn_club_puntos_saldo(:'cli_a') as saldo0 \\gset
${PAGAR("a")}select concat_ws('|', retail.fn_club_puntos_saldo(:'cli_a') - :saldo0,
  (select string_agg(tipo || ':' || puntos, ',' order by tipo) from retail.club_puntos_movimientos m join retail.pedidos_web w on w.venta_id = m.venta_id where w.id = :'a'));`,
  "180|compra:80,cumple:100"
);

// ---------------------------------------------------------------- f. Anular el pedido pagado
caso(
  "(f) anular el pedido pagado: el cupón vuelve a activo (no «reservado», sin pedido) y los puntos de la compra se restan",
  `${SEPARAR("a")}${CONFIRMAR("a")}select retail.fn_club_puntos_saldo(:'cli_a') as saldo0 \\gset
${PAGAR("a")}update retail.comprobantes set created_at = now() - interval '5 minutes'
 where venta_id = (select venta_id from retail.pedidos_web where id = :'a') and tipo = 'boleta';
select retail.anular_pedido_web_pagado(:'a', 'cliente_desistio', null) is not null as _an \\gset
select concat_ws('|', (select estado || '/' || cupon_liberado_motivo from retail.pedidos_web where id = :'a'),
  ${CUPON()}, retail.fn_club_puntos_saldo(:'cli_a') - :saldo0, retail.fn_pedido_web_cupon(:'a') ->> 'estado', ${VERIFICAR_YA} = '');`,
  "anulado/pedido_anulado|activo:-|0|liberado|t"
);

// ---------------------------------------------------------------- g. Un reservado no vence
caso(
  "(g) un cupón reservado NO vence con fn_club_cupones_vencer aunque pase su fecha (el precio quedó fijo): el pedido se vende y el cupón queda usado",
  `${SEPARAR("a")}${VENCER_CUPON()}select retail.fn_club_cupones_vencer(null) as vencidos \\gset
select ${CUPON()} = 'reservado:' || :'a' as sigue \\gset
${CONFIRMAR("a")}${PAGAR("a")}select concat_ws('|', :'sigue', (select estado from retail.club_cupones where codigo = :'codigo'),
  (select estado || '/' || total from retail.pedidos_web where id = :'a'), ${VERIFICAR_YA} = '');`,
  "t|usado|pagado/80.00|t"
);

// ---------------------------------------------------------------- h. La misma marca
caso(
  "(h) el mismo «Separar» dos veces (misma marca) devuelve el MISMO pedido con el mismo cupón; con otro código, se rechaza (pedido_web_token)",
  `select pg_temp.cupon(:'cli_a', 400) as codigo2 \\gset
${SEPARAR("a", { token: ":'tok'" })}${SEPARAR("a2", { token: ":'tok'" })}select concat_ws('|', :'a' = :'a2', :'r_a2'::jsonb ->> 'ya_estaba', ${CUPON()} = 'reservado:' || :'a',
  ${hint(SEPARAR_TEXTO({ token: ":'tok'", codigo: ":'codigo2'" }))}, ${hint(SEPARAR_TEXTO({ token: ":'tok'", codigo: "null" }))},
  ${CUPON("codigo2")});`,
  "t|true|t|pedido_web_token|pedido_web_token|activo:-"
);

// ---------------------------------------------------------------- i. tienda_validar_cupon
caso(
  "(i) tienda_validar_cupon: ok sin decir de quién es (solo «tuyo»), mínimo (cuánto falta), cubre todo; y a los 5 códigos que no existen, bloqueado (también «Separar» con código)",
  `${COMO_TIENDA}select retail.tienda_validar_cupon(:'usr_a', lower(:'codigo'), 100) as ok_a \\gset
select retail.tienda_validar_cupon(:'usr_b', :'codigo', 100) as ok_b \\gset
select concat_ws('|',
  :'ok_a'::jsonb ->> 'ok', :'ok_a'::jsonb ->> 'valor', :'ok_a'::jsonb ->> 'tuyo', :'ok_b'::jsonb ->> 'tuyo', (:'ok_b'::jsonb) ? 'de',
  retail.tienda_validar_cupon(:'usr_b', :'codigo', 50) ->> 'faltan',
  retail.tienda_validar_cupon(:'usr_b', :'codigo', 20) ->> 'motivo',
  retail.tienda_validar_cupon(:'usr_b', 'CAY-AAAA-AAA2') ->> 'motivo', retail.tienda_validar_cupon(:'usr_b', 'CAY-AAAA-AAA3') ->> 'motivo',
  retail.tienda_validar_cupon(:'usr_b', 'CAY-AAAA-AAA4') ->> 'motivo', retail.tienda_validar_cupon(:'usr_b', 'CAY-AAAA-AAA5') ->> 'motivo',
  retail.tienda_validar_cupon(:'usr_b', 'CAY-AAAA-AAA6') ->> 'intentos', retail.tienda_validar_cupon(:'usr_b', :'codigo', 100) ->> 'motivo',
  retail.tienda_validar_cupon(:'usr_a', :'codigo', 100) ->> 'ok') as r \\gset
reset role;
select :'r' || '|' || ${hint(SEPARAR_TEXTO({ usr: "usr_b" }))} || '|' || ${hint(`format('select retail.tienda_validar_cupon(null, %L)', :'codigo')`)};`,
  "true|20.00|true|false|f|10.00|minimo|no_existe|no_existe|no_existe|no_existe|5|bloqueado|true|cupon_bloqueado|sin_cuenta"
);

// ---------------------------------------------------------------- j. Sin código
caso(
  "(j) sin código, «Separar» es el de siempre: total = suma, sin cupón (y un pedido de una sola prenda tampoco pide nada)",
  `${SEPARAR("a", { codigo: "null" })}select ${hint(SEPARAR_TEXTO({ lineas: UNA }))} as minimo \\gset
${SEPARAR("b", { codigo: "''", lineas: UNA })}select concat_ws('|',
  (select string_agg(total || '/' || descuento_cupon || '/' || (cupon_id is null), ',' order by numero) from retail.pedidos_web where id in (:'a', :'b')),
  coalesce(:'r_a'::jsonb ->> 'cupon', 'sin cupón'), ${CUPON()}, :'minimo', ${VERIFICAR_YA} = '');`,
  "100.00/0.00/true,50.00/0.00/true|sin cupón|activo:-|cupon_compra_minima|t"
);

// ---------------------------------------------------------------- k. Dos «Separar» a la vez (commitea)
if (process.env.BASE_DESECHABLE === "1") {
  casos++;
  const prep = correr(`${PRELUDIO}select :'codigo' || '|' || :'usr_a' || '|' || :'usr_b' || '|' || :'v' || '|' || :'v2';\ncommit;`);
  if (!prep.ok) {
    fallas++;
    console.log(`✗ (k) con COMMIT: dos «Separar» a la vez con el mismo cupón\n    preparación falló: ${prep.mensaje}`);
  } else {
    const [codigo, usrA, usrB, v, v2] = prep.salida.split("\n").pop().split("|");
    const tru = correr(`select id from retail.ubicaciones where nombre = 'Tienda Trujillo';`).salida;
    const bolsa = `jsonb_build_array(jsonb_build_object('variante_id', '${v}', 'cantidad', 1, 'precio', 50.00), jsonb_build_object('variante_id', '${v2}', 'cantidad', 1, 'precio', 50.00))`;
    const separarYDormir = (usr, dormir) => `begin;
select retail.tienda_separar_con_cupon('${usr}', '${tru}', ${bolsa}, gen_random_uuid(), '${codigo}') ->> 'codigo';
${dormir ? `select pg_sleep(${dormir});` : ""}
commit;`;
    const a = psqlEnParalelo(separarYDormir(usrA, 3));
    await new Promise((r) => setTimeout(r, 1200));
    const b = await psqlEnParalelo(separarYDormir(usrB, 0));
    const ra = await a;
    const cupon = correr(`select estado || '|' || (select count(*) from retail.pedidos_web w where w.cupon_id = k.id) from retail.club_cupones k where codigo = '${codigo}';`);
    const ok = ra.ok && /W-\d+/.test(ra.salida) && !b.ok && /cupon_reservado|reservado para un pedido web/.test(b.mensaje) && cupon.salida === "reservado|1";
    if (!ok) fallas++;
    console.log(`${ok ? "✓" : "✗"} (k) con COMMIT: dos «Separar» A LA VEZ con el mismo cupón → pasa UNO y el otro recibe «reservado para un pedido web» (sin pedido)`);
    if (!ok) console.log(`    obtenido:\n      A: ${ra.ok ? ra.salida : ra.mensaje}\n      B: ${b.ok ? b.salida : b.mensaje}\n      cupón: ${cupon.salida ?? cupon.mensaje}`);
  }
} else {
  console.log("· (k), la carrera con COMMIT, no corrió: solo corre con BASE_DESECHABLE=1 (deja un pedido y un cupón de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""}`);
process.exit(fallas ? 1 : 0);
