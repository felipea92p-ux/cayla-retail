#!/usr/bin/env node
/**
 * Prueba de ADR-0328 actividad 17 · «Traslados: pedidos que no se pierden» (migraciones 20261005100000/100/200) contra el
 * Postgres LOCAL.
 *
 * EL PROBLEMA QUE PRUEBA. Un pedido entre sedes se perdía de tres maneras: la otra sede vendía la prenda mientras el pedido
 * esperaba (pedir no apartaba nada allá), nadie sabía si al cliente se le avisó que llegó, y lo que se subía al almacén
 * «para mandarlo a otra sede» quedaba olvidado porque el segundo paso no estaba en ninguna lista.
 *
 * QUÉ CUBRE
 *   1. Pedir para un cliente (también desde Vender, sin Apartados): queda pedido Y apartado en la otra sede (almacén
 *      primero, después el piso), firmado; el token no duplica ni aparta dos veces; «Dónde más hay» ya no la ofrece.
 *   2. Lo que no deja: pedir lo que allá ya no está libre (no queda nada a medias), sin Vender ni Apartados, para otra sede.
 *   3. Lo colgado no sale en un paso: enviar se niega; `subir_pedido_al_almacen` sube y re-aparta (idempotente, solo la
 *      sede que la tiene); después sale y la reserva de allá se suelta.
 *   4. Llega y se aparta aquí (como antes); avisar al cliente queda registrado, solo después de llegar y solo aquí.
 *   5. Cancelar («No la tengo») suelta la reserva de allá.
 *   6. Anular el traslado: el pedido vuelve a esperar Y se vuelve a apartar allá.
 *   7. `fn_pedidos_por_atender`: lo que espera, de los dos lados (el número del menú y las 48 h); exige operar la sede.
 *   8. Los CHECK nuevos: reserva de origen solo con cliente; aviso solo con cliente y llegada.
 *   9. «Para enviar»: subir para enviar sube Y anota; el reintento no duplica; sale de la lista cuando sale el traslado a
 *      ESE destino (y no con otro destino); anular el traslado la devuelve; «Ya no la envío» con motivo.
 *  10. Eliminar un producto la conoce (frena el borrado).
 *  11. Permisos: nada abierto a anon; las internas no las llama nadie desde la web.
 *  12. Revisión adversarial: con la reserva liberada a mano, Enviar vuelve a apartar (lo colgado dice «súbela al
 *      almacén», no «Stock insuficiente»); cancelar exige un módulo del pedido; el libro dice qué pasó con la reserva
 *      (nunca «se entrega a la clienta»); Apartados también sube; los candados de sede de las lecturas, del aviso y de
 *      subir; un traslado de OTRA sede al mismo destino no descuenta la lista «Para enviar».
 *
 * CÓMO. Mismo patrón que `pedir_a_otra_sede.mjs`: cada caso en su transacción con ROLLBACK (no deja nada en el Postgres
 * compartido; jamás `db reset`), sesión simulada con `request.jwt.claim(s)`, las RPC se llaman como la API
 * (`set local role authenticated`) y las verificaciones se leen como postgres.
 *
 * DATOS. Del seed solo lo estable: Tienda Trujillo, Tienda Lima, Taller, Felipe (líder) y Micaela (Integrante fija a
 * Trujillo: tiene Vender, Existencias y Traslados, NO Apartados). Las prendas se crean dentro de la transacción.
 *
 * USO
 *   pnpm pruebas:pedidos-que-no-se-pierden    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const sesion = (authUserId) => `reset role;
set local request.jwt.claim.sub = '${authUserId}';
set local request.jwt.claims = '{"sub":"${authUserId}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";

const PRELUDIO = `
begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'msg', v_msg, 'hint', v_hint);
end;
$f$;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
-- Autocuración: este Postgres compartido puede no tener piso y almacén en las dos tiendas.
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as tru_alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as lim_alm from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset

-- Tres prendas nuevas (un producto cada una: sin talla ni color, dos variantes de un producto chocarían en su código).
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedido no se pierde 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedido no se pierde 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p2 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedido no se pierde 3', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p3 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-PNP-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-PNP-2', 100, 40, true) returning id as v2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p3', 'ZZ-PNP-3', 100, 40, true) returning id as v3 \\gset

create function pg_temp.cargar(v uuid, u uuid, s uuid, n int) returns void language plpgsql as $f$
declare m uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
    values (v, u, s, 'entrada', n, 'carga_inicial') returning id into m;
  perform retail.fn_aplicar_movimiento(m);
end $f$;
-- Lima: la 1 en el almacén y en el piso (una de cada); la 2 SOLO colgada. Trujillo: tres de la 3 colgadas.
select pg_temp.cargar(:'v1', :'lim', :'lim_alm', 1) as _c1 \\gset
select pg_temp.cargar(:'v1', :'lim', :'lim_piso', 1) as _c2 \\gset
select pg_temp.cargar(:'v2', :'lim', :'lim_piso', 1) as _c3 \\gset
select pg_temp.cargar(:'v3', :'tru', :'tru_piso', 3) as _c4 \\gset

-- Roles de prueba (solo dentro de la transacción): uno que solo ve Análisis y otro que solo ve Apartados.
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000b2', 'Solo Análisis (prueba pedidos)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000b2', 'analisis');
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000b3', 'Solo Apartados (prueba pedidos)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000b3', 'apartados');
select rol_id as rol_micaela from retail.colaboradores where persona_id = :'micaela' \\gset
${sesion(FELIPE)}`;

const rolMicaela = (rolId) => `${COMO_POSTGRES}update retail.colaboradores set rol_id = ${rolId} where persona_id = :'micaela';\n`;
const SOLO_ANALISIS = "'44444444-4444-4444-8444-0000000000b2'";
const SOLO_APARTADOS = "'44444444-4444-4444-8444-0000000000b3'";

const K = (clave, expresion) => `select 'K|${clave}|' || coalesce((${expresion})::text, '∅');`;
/** Trujillo le pide a Lima (como la API) una prenda para Ana Lozano; deja el pedido en :ped (o el nombre que se pida). */
const pedir = (v, { como = "ped", token = "null", desde = "tru", a = "lim" } = {}) =>
  `${COMO_API}select retail.pedir_prenda_para_apartar(:'${desde}', :'${a}', :'${v}', 1, 'Ana', 'Lozano', '987111222', null, ${token}) as ${como} \\gset\n${COMO_POSTGRES}`;
const pedirSql = (v, desde = "tru", a = "lim") =>
  `format('select retail.pedir_prenda_para_apartar(%L::uuid, %L::uuid, %L::uuid, 1, %L, %L, %L)::text', :'${desde}', :'${a}', :'${v}', 'Ana', 'Lozano', '987111222')`;
/** Lima envía el pedido; deja el traslado en :tr. */
const enviar = (ped = "ped", como = "tr") =>
  `${COMO_API}select retail.enviar_pedido_para_apartar(:'${ped}', now() + interval '1 day', gen_random_uuid()) as ${como} \\gset\n${COMO_POSTGRES}`;
const enviarSql = (ped = "ped") => `format('select retail.enviar_pedido_para_apartar(%L::uuid, now() + interval ''1 day'')::text', :'${ped}')`;
const contar = (v, n, tr = "tr") => `${COMO_API}select retail.registrar_recepcion_traslado(:'${tr}', :'${v}', ${n}) as _r \\gset\n${COMO_POSTGRES}`;
const confirmar = (tr = "tr") => `${COMO_API}select retail.confirmar_traslado(:'${tr}', 'piso_venta') as _conf \\gset\n${COMO_POSTGRES}`;
const intento = (clave, llamada) =>
  `${COMO_API}select pg_temp.intento(${llamada}) as _i \\gset\n${COMO_POSTGRES}select 'K|${clave}|' || :'_i';\n`;
/** «cantidad/apartada» del stock de una prenda en una sububicación. */
const stockEn = (v, u, s) => `(select coalesce(sum(cantidad), 0) || '/' || coalesce(sum(cantidad_apartada), 0) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${u}' and sububicacion_id = :'${s}')`;
/** La reserva del pedido en el origen: «estado:lugar» (lugar = alm | piso). */
const reserva = (ped = "ped") =>
  `(select a.estado || ':' || case a.sububicacion_id when :'lim_alm' then 'alm' when :'lim_piso' then 'piso' else 'otro' end from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_origen_id where pe.id = :'${ped}')`;

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}
function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida));
}
const j = (texto) => JSON.parse(texto ?? "null");
const falloCon = (texto, re) => {
  const r = j(texto);
  return r?.ok === false && re.test(r.msg ?? "");
};

// ---------------------------------------------------------------------------
correr(
  "Pedir para un cliente desde Vender · queda pedido Y apartado allá (almacén primero); el token no duplica",
  `select gen_random_uuid() as tok \\gset
${K("red_antes", "(select sum(cantidad) from retail.fn_stock_por_sede() where variante_id = :'v1' and ubicacion_id = :'lim')")}
${sesion(MICAELA)}
${pedir("v1", { token: ":'tok'" })}
${K("pedido", "(select estado || ':' || (ubicacion_id = :'tru') || ':' || (ubicacion_origen_id = :'lim') || ':' || (creado_por = :'micaela') from retail.separacion_pedidos where id = :'ped')")}
${K("reserva", reserva())}
${K("apartado", "(select a.cantidad || ':' || a.clienta_nombre || ':' || a.clienta_contacto || ':' || (a.vence_el = retail.fn_hoy_lima() + 7) || ':' || (a.creado_por = :'micaela') from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_origen_id where pe.id = :'ped')")}
${K("lim_alm", stockEn("v1", "lim", "lim_alm"))}
${K("lim_piso", stockEn("v1", "lim", "lim_piso"))}
${K("mov", "(select count(*) || ':' || bool_and(nota like 'Apartado para Ana Lozano: pedido de Tienda Trujillo%') from retail.movimientos where variante_id = :'v1' and ubicacion_id = :'lim' and tipo = 'apartado')")}
${pedir("v1", { token: ":'tok'", como: "ped2" })}
${K("mismo", "(:'ped' = :'ped2')")}
${K("apartados", "(select count(*) from retail.apartados where variante_id = :'v1')")}
${K("pedidos", "(select count(*) from retail.separacion_pedidos where variante_id = :'v1')")}
${COMO_POSTGRES}
${K("red_despues", "(select sum(cantidad) from retail.fn_stock_por_sede() where variante_id = :'v1' and ubicacion_id = :'lim')")}`,
  (d) => {
    afirmar("Micaela (Vender, sin Apartados) pide: Trujillo ← Lima, firmado por ella", d.pedido === "pedido:true:true:true", d.pedido);
    afirmar("queda APARTADO en Lima, en el ALMACÉN (de ahí sale un traslado)", d.reserva === "abierto:alm", d.reserva);
    afirmar("la reserva: 1, para Ana Lozano, su celular, vence en 7 días, firmada", d.apartado === "1:Ana Lozano:987111222:true:true", d.apartado);
    afirmar("el almacén de Lima tiene 1 y está apartada (1/1)", d.lim_alm === "1/1", d.lim_alm);
    afirmar("el piso de Lima no se toca (1/0)", d.lim_piso === "1/0", d.lim_piso);
    afirmar("un movimiento «apartado» en Lima que dice para quién y de qué pedido", d.mov === "1:true", d.mov);
    afirmar("el mismo token devuelve el MISMO pedido", d.mismo === "true", d.mismo);
    afirmar("…sin apartar otra vez ni crear otro pedido", d.apartados === "1" && d.pedidos === "1", `${d.apartados} ${d.pedidos}`);
    afirmar("«Dónde más hay» de Lima baja de 2 a 1 (la apartada ya no se ofrece)", d.red_antes === "2" && d.red_despues === "1", `${d.red_antes} → ${d.red_despues}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Pedir · el segundo toma el piso; el tercero ya no alcanza y no queda nada a medias; sin módulo no",
  `${pedir("v1")}
${pedir("v1", { como: "ped_b" })}
${K("primero", reserva("ped"))}
${K("segundo", reserva("ped_b"))}
${intento("tercero", pedirSql("v1"))}
${intento("nada_alla", pedirSql("v3"))}
${K("pedidos", "(select count(*) from retail.separacion_pedidos where variante_id = :'v1')")}
${K("apartados", "(select count(*) from retail.apartados where variante_id = :'v1')")}
${K("lim", `${stockEn("v1", "lim", "lim_alm")} || ',' || ${stockEn("v1", "lim", "lim_piso")}`)}
${sesion(MICAELA)}${rolMicaela(SOLO_ANALISIS)}
${intento("sin_modulo", pedirSql("v2"))}
${rolMicaela(":'rol_micaela'")}
${intento("para_lima", pedirSql("v3", "lim", "tru"))}`,
  (d) => {
    afirmar("el primero se aparta en el almacén", d.primero === "abierto:alm", d.primero);
    afirmar("el segundo, en el piso (lo único libre que queda)", d.segundo === "abierto:piso", d.segundo);
    afirmar("el tercero se rechaza: ya no queda libre", falloCon(d.tercero, /ya no tiene disponible/), d.tercero);
    afirmar("lo que allá no tiene no se pide", falloCon(d.nada_alla, /ya no tiene disponible/), d.nada_alla);
    afirmar("quedan 2 pedidos y 2 reservas: el que falló no dejó nada", d.pedidos === "2" && d.apartados === "2", `${d.pedidos} ${d.apartados}`);
    afirmar("Lima: todo apartado (1/1 en almacén y 1/1 en piso)", d.lim === "1/1,1/1", d.lim);
    afirmar("sin Vender ni Apartados no se pide", j(d.sin_modulo)?.estado === "42501" && /Vender ni Apartados/.test(j(d.sin_modulo)?.msg), d.sin_modulo);
    afirmar("Micaela (Trujillo) no pide para Lima", j(d.para_lima)?.estado === "42501", d.para_lima);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Enviar · lo colgado no sale en un paso: primero se sube al almacén, después sale y la reserva se suelta",
  `${pedir("v2")}
${K("reserva_inicial", reserva())}
${COMO_API}select 'K|leida_piso|' || reserva_en from retail.fn_pedidos_con_cliente(:'lim') where id = :'ped';
${COMO_POSTGRES}
${intento("enviar_colgada", enviarSql())}
${K("sigue", "(select estado from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}
${sesion(MICAELA)}
${intento("micaela_sube", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped')")}
${sesion(FELIPE)}
${intento("subir", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped')")}
${K("reserva_subida", reserva())}
${K("liberadas", "(select count(*) from retail.apartados where variante_id = :'v2' and estado = 'liberado')")}
${K("lim", `${stockEn("v2", "lim", "lim_piso")} || ',' || ${stockEn("v2", "lim", "lim_alm")}`)}
${K("interno", "(select count(*) from retail.movimientos where variante_id = :'v2' and motivo = 'movimiento_interno' and sububicacion_id = :'lim_piso' and sububicacion_destino_id = :'lim_alm')")}
${intento("subir_otra_vez", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped')")}
${K("interno_2", "(select count(*) from retail.movimientos where variante_id = :'v2' and motivo = 'movimiento_interno')")}
${COMO_API}select 'K|leida_alm|' || reserva_en from retail.fn_pedidos_con_cliente(:'lim') where id = :'ped';
${COMO_POSTGRES}
${enviar()}
${K("enviado", "(select estado || ':' || (transferencia_id = :'tr') from retail.separacion_pedidos where id = :'ped')")}
${K("reserva_tras_enviar", reserva())}
${K("lim_tras", stockEn("v2", "lim", "lim_alm"))}
${K("item", "(select string_agg(va.sku || ':' || ti.cantidad, ',') from retail.transferencia_items ti join retail.variantes va on va.id = ti.variante_id where ti.transferencia_id = :'tr')")}
${COMO_API}select 'K|leida_enviada|' || coalesce(reserva_en, 'null') from retail.fn_pedidos_con_cliente(:'lim') where id = :'ped';
${COMO_POSTGRES}`,
  (d) => {
    afirmar("la única libre estaba colgada: se aparta en el piso", d.reserva_inicial === "abierto:piso", d.reserva_inicial);
    afirmar("la lectura dice «piso»", d.leida_piso === "piso", d.leida_piso);
    afirmar("enviar se niega: «primero súbela al almacén» (hint pedido_en_piso)", falloCon(d.enviar_colgada, /súbela al almacén/) && j(d.enviar_colgada)?.hint === "pedido_en_piso", d.enviar_colgada);
    afirmar("…y no toca nada: sigue «pedido» y apartada en el piso", d.sigue === "pedido:abierto:piso", d.sigue);
    afirmar("Micaela (Trujillo) no sube lo de Lima", j(d.micaela_sube)?.estado === "42501", d.micaela_sube);
    afirmar("Felipe sube: ya_estaba = false", j(d.subir)?.ok === true && JSON.parse(j(d.subir).res).ya_estaba === false, d.subir);
    afirmar("la reserva ahora está en el almacén", d.reserva_subida === "abierto:alm", d.reserva_subida);
    afirmar("la del piso quedó liberada (1)", d.liberadas === "1", d.liberadas);
    afirmar("Lima: piso 0/0, almacén 1/1 (nunca quedó libre en medio)", d.lim === "0/0,1/1", d.lim);
    afirmar("un movimiento interno piso → almacén", d.interno === "1", d.interno);
    afirmar("subir otra vez no sube dos veces (ya_estaba = true)", j(d.subir_otra_vez)?.ok === true && JSON.parse(j(d.subir_otra_vez).res).ya_estaba === true && d.interno_2 === "1", `${d.subir_otra_vez} ${d.interno_2}`);
    afirmar("la lectura dice «almacen»", d.leida_alm === "almacen", d.leida_alm);
    afirmar("ahora sale: «en camino» con su traslado", d.enviado === "en_camino:true", d.enviado);
    afirmar("la reserva de allá se soltó al salir", d.reserva_tras_enviar === "liberado:alm", d.reserva_tras_enviar);
    afirmar("y la prenda salió del almacén de Lima (0/0)", d.lim_tras === "0/0", d.lim_tras);
    afirmar("el traslado lleva esa prenda", d.item === "ZZ-PNP-2:1", d.item);
    afirmar("en camino, la lectura ya no habla de reserva", d.leida_enviada === "null", d.leida_enviada);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Llega · se aparta en la sede que pidió; avisar al cliente queda registrado (solo después de llegar y solo aquí)",
  `${pedir("v1")}
${pedir("v1", { como: "ped_espera" })}
${sesion(MICAELA)}
${intento("avisar_antes", "format('select retail.marcar_pedido_avisado(%L::uuid)::text', :'ped')")}
${sesion(FELIPE)}
${enviar()}
${contar("v1", 1)}${confirmar()}
${K("llego", "(select estado || ':' || (llego_en is not null) || ':' || (apartado_id is not null) from retail.separacion_pedidos where id = :'ped')")}
${sesion(MICAELA)}
${COMO_API}select 'K|leida_tru|' || direccion || ':' || estado || ':' || (avisado_en is null) || ':' || (guardada_hasta is not null) || ':' || otra_sede from retail.fn_pedidos_con_cliente(:'tru') where id = :'ped';
${COMO_POSTGRES}
${intento("avisar", "format('select retail.marcar_pedido_avisado(%L::uuid)::text', :'ped')")}
${K("avisado", "(select (avisado_en is not null) || ':' || (avisado_por = :'micaela') from retail.separacion_pedidos where id = :'ped')")}
${COMO_API}select 'K|leida_avisado|' || (avisado_en is not null) from retail.fn_pedidos_con_cliente(:'tru') where id = :'ped';
${COMO_POSTGRES}
${rolMicaela(SOLO_ANALISIS)}
${intento("avisar_sin_modulo", "format('select retail.marcar_pedido_avisado(%L::uuid)::text', :'ped')")}
${rolMicaela(":'rol_micaela'")}
${COMO_POSTGRES}
select pg_temp.intento(format($q$update retail.separacion_pedidos set avisado_en = now() where id = %L returning id::text$q$, :'ped_espera')) as _i \\gset
select 'K|check_aviso|' || :'_i';
select pg_temp.intento(format($q$insert into retail.separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad, grupo_id, apartado_origen_id) select %L, %L, %L, 1, gen_random_uuid(), apartado_origen_id from retail.separacion_pedidos where id = %L returning id::text$q$, :'tru', :'lim', :'v1', :'ped_espera')) as _i \\gset
select 'K|check_reserva|' || :'_i';`,
  (d) => {
    afirmar("avisar antes de que llegue se rechaza", falloCon(d.avisar_antes, /todavía no llegó/), d.avisar_antes);
    afirmar("llegó a Trujillo y quedó guardada para el cliente (como antes)", d.llego === "llego:true:true", d.llego);
    afirmar("Trujillo lo lee: «pedí», llegó, sin avisar, guardada hasta, de Tienda Lima", d.leida_tru === "pedi:llego:true:true:Tienda Lima", d.leida_tru);
    afirmar("Micaela avisa (Vender basta)", j(d.avisar)?.ok === true, d.avisar);
    afirmar("queda cuándo y quién", d.avisado === "true:true", d.avisado);
    afirmar("la lectura ya dice avisado", d.leida_avisado === "true", d.leida_avisado);
    afirmar("sin Vender ni Apartados no se marca", j(d.avisar_sin_modulo)?.estado === "42501", d.avisar_sin_modulo);
    afirmar("CHECK: no hay aviso de llegada para lo que no llegó", j(d.check_aviso)?.estado === "23514", d.check_aviso);
    afirmar("CHECK: una reposición no lleva reserva en el origen", j(d.check_reserva)?.estado === "23514", d.check_reserva);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Cancelar · «No la tengo» suelta la reserva de allá; lo que ya salió no se cancela",
  `${pedir("v1")}
${COMO_API}select retail.cancelar_pedido_para_apartar(:'ped', 'No la tengo') as _c \\gset
${COMO_POSTGRES}
${K("cancelado", "(select estado || ':' || cancelado_motivo from retail.separacion_pedidos where id = :'ped')")}
${K("reserva", reserva())}
${K("lim_alm", stockEn("v1", "lim", "lim_alm"))}
${pedir("v1", { como: "ped_b" })}${enviar("ped_b")}
${intento("cancelar_en_camino", "format('select retail.cancelar_pedido_para_apartar(%L::uuid)::text', :'ped_b')")}`,
  (d) => {
    afirmar("el pedido queda cancelado con su motivo", d.cancelado === "cancelado:No la tengo", d.cancelado);
    afirmar("la reserva de Lima se liberó", d.reserva === "liberado:alm", d.reserva);
    afirmar("la prenda vuelve a estar libre allá (1/0)", d.lim_alm === "1/0", d.lim_alm);
    afirmar("lo que ya salió no se cancela", falloCon(d.cancelar_en_camino, /ya no se puede cancelar/), d.cancelar_en_camino);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Anular el traslado · el pedido vuelve a esperar Y se vuelve a apartar allá; se puede volver a enviar",
  `${pedir("v1")}${enviar()}
${K("en_camino", "(select estado from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}
${COMO_API}select retail.anular_traslado(:'tr', 'se armó mal la caja', null) as _a \\gset
${COMO_POSTGRES}
${K("vuelve", "(select estado || ':' || (transferencia_id is null) from retail.separacion_pedidos where id = :'ped')")}
${K("reserva", reserva())}
${K("lim_alm", stockEn("v1", "lim", "lim_alm"))}
${K("reservas", "(select count(*) filter (where estado = 'abierto') || '/' || count(*) from retail.apartados where variante_id = :'v1' and ubicacion_id = :'lim')")}
${enviar("ped", "tr2")}
${K("reenviado", "(select estado || ':' || (transferencia_id = :'tr2') from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}`,
  (d) => {
    afirmar("al salir, la reserva se soltó", d.en_camino === "en_camino:liberado:alm", d.en_camino);
    afirmar("al anular vuelve a «pedido», sin traslado", d.vuelve === "pedido:true", d.vuelve);
    afirmar("y se vuelve a apartar en el almacén de Lima", d.reserva === "abierto:alm", d.reserva);
    afirmar("la prenda volvió y está apartada (1/1)", d.lim_alm === "1/1", d.lim_alm);
    afirmar("una reserva abierta de dos (la primera liberada)", d.reservas === "1/2", d.reservas);
    afirmar("se vuelve a enviar y la nueva reserva se suelta", d.reenviado === "en_camino:true:liberado:alm", d.reenviado);
  },
);

// ---------------------------------------------------------------------------
correr(
  "fn_pedidos_por_atender · lo que espera, de los dos lados (menú y 48 h); exige operar la sede",
  `${pedir("v1")}
${COMO_API}select retail.pedir_a_otra_sede(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v2', 'cantidad', 1))) as g \\gset
select retail.pedir_a_otra_sede(:'lim', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 2))) as g_lim \\gset
select 'K|lim|' || string_agg(direccion || ':' || con_cliente || ':' || prendas || ':' || otra_sede, ',' order by direccion, con_cliente) from retail.fn_pedidos_por_atender(:'lim');
select 'K|tru|' || string_agg(direccion || ':' || con_cliente || ':' || prendas, ',' order by direccion, con_cliente) from retail.fn_pedidos_por_atender(:'tru');
select 'K|ids|' || bool_and(id in (:'ped', :'g', :'g_lim') and created_at is not null) from retail.fn_pedidos_por_atender(:'lim');
${COMO_POSTGRES}${enviar()}
${COMO_API}select 'K|lim_tras_enviar|' || count(*) filter (where direccion = 'me_piden') from retail.fn_pedidos_por_atender(:'lim');
${sesion(MICAELA)}${COMO_API}
select 'K|micaela_lim|' || count(*) from retail.fn_pedidos_por_atender(:'lim');
select 'K|micaela_tru|' || count(*) from retail.fn_pedidos_por_atender(:'tru');
${COMO_POSTGRES}`,
  (d) => {
    afirmar("Lima: le piden 2 (uno para un cliente, una reposición) y pidió 1 (2 prendas)", d.lim === "me_piden:false:1:Tienda Trujillo,me_piden:true:1:Tienda Trujillo,pedi:false:2:Tienda Trujillo", d.lim);
    afirmar("Trujillo: le piden 1 y pidió 2", d.tru === "me_piden:false:2,pedi:false:1,pedi:true:1", d.tru);
    afirmar("cada fila es el pedido (o su grupo), con su hora", d.ids === "true", d.ids);
    afirmar("lo que ya salió no espera: a Lima le queda 1", d.lim_tras_enviar === "1", d.lim_tras_enviar);
    afirmar("Micaela (Trujillo) no lee lo de Lima", d.micaela_lim === "0", d.micaela_lim);
    afirmar("Micaela lee lo de Trujillo (lo que salió ya no cuenta)", d.micaela_tru === "2", d.micaela_tru);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Para enviar · subir para enviar sube Y anota; el reintento no duplica; sale de la lista cuando sale a ESE destino",
  `select gen_random_uuid() as tok \\gset
${sesion(MICAELA)}
${COMO_API}select retail.subir_para_enviar(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 2)), 'Se vende más en Lima', :'tok') as r1 \\gset
${COMO_POSTGRES}
select 'K|r1|' || (:'r1'::jsonb ->> 'ya_registrada') || ':' || (:'r1'::jsonb ->> 'para_enviar') || ':' || (:'r1'::jsonb ->> 'destino');
${K("tru", `${stockEn("v3", "tru", "tru_piso")} || ',' || ${stockEn("v3", "tru", "tru_alm")}`)}
${K("nota_mov", "(select nota from retail.movimientos where variante_id = :'v3' and motivo = 'movimiento_interno' order by created_at desc limit 1)")}
${K("fila", "(select cantidad || ':' || (creado_por = :'micaela') || ':' || nota from retail.prendas_para_enviar where variante_id = :'v3')")}
${COMO_API}select 'K|lista|' || string_agg(destino || ':' || falta || ':' || en_almacen || ':' || lower(producto), ',') from retail.fn_para_enviar(:'tru');
select retail.subir_para_enviar(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 2)), 'Se vende más en Lima', :'tok') as r2 \\gset
${COMO_POSTGRES}
select 'K|r2|' || (:'r2'::jsonb ->> 'ya_registrada') || ':' || (:'r2'::jsonb ->> 'para_enviar');
${K("filas", "(select count(*) from retail.prendas_para_enviar where variante_id = :'v3')")}
${K("tru_2", `${stockEn("v3", "tru", "tru_piso")} || ',' || ${stockEn("v3", "tru", "tru_alm")}`)}
${intento("misma_sede", "format('select retail.subir_para_enviar(%L::uuid, %L::uuid, %L::jsonb, null, gen_random_uuid())::text', :'tru', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)))")}
${intento("sin_destino", "format('select retail.subir_para_enviar(%L::uuid, null, %L::jsonb, null, gen_random_uuid())::text', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)))")}
${intento("sin_marca", "format('select retail.subir_para_enviar(%L::uuid, %L::uuid, %L::jsonb)::text', :'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)))")}
${rolMicaela(SOLO_ANALISIS)}
${intento("sin_existencias", "format('select retail.subir_para_enviar(%L::uuid, %L::uuid, %L::jsonb, null, gen_random_uuid())::text', :'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)))")}
${rolMicaela(":'rol_micaela'")}
${sesion(FELIPE)}
${COMO_API}select retail.iniciar_traslado(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr_lim \\gset
select 'K|tras_lima|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
select retail.iniciar_traslado(:'tru', :'taller', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr_taller \\gset
select 'K|tras_taller|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
select retail.anular_traslado(:'tr_lim', 'se armó mal', null) as _an \\gset
select 'K|tras_anular|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
select retail.iniciar_traslado(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr_lim2 \\gset
select 'K|tras_otro|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
${COMO_POSTGRES}
${K("salidas", "(select count(*) || ':' || sum(cantidad) from retail.prendas_para_enviar_salidas)")}`,
  (d) => {
    afirmar("sube y anota: no era reintento, 1 prenda en la lista, a Tienda Lima", d.r1 === "false:1:Tienda Lima", d.r1);
    afirmar("Trujillo: piso 1, almacén 2", d.tru === "1/0,2/0", d.tru);
    afirmar("el libro dice para dónde va", d.nota_mov === "Para enviar a Tienda Lima · Se vende más en Lima", d.nota_mov);
    afirmar("la fila: 2, firmada por Micaela, con su nota", d.fila === "2:true:Se vende más en Lima", d.fila);
    afirmar("la lista: a Tienda Lima faltan 2, hay 2 en el almacén", d.lista === "Tienda Lima:2:2:zz pedido no se pierde 3", d.lista);
    afirmar("el reintento: ya_registrada y no anota otra", d.r2 === "true:0" && d.filas === "1", `${d.r2} ${d.filas}`);
    afirmar("…y no sube dos veces", d.tru_2 === "1/0,2/0", d.tru_2);
    afirmar("a la misma sede no", falloCon(d.misma_sede, /otra sede/), d.misma_sede);
    afirmar("sin destino no", falloCon(d.sin_destino, /otra sede/), d.sin_destino);
    afirmar("sin marca no", falloCon(d.sin_marca, /marca/), d.sin_marca);
    afirmar("sin Existencias no se sube", falloCon(d.sin_existencias, /Existencias|Bajada al piso|módulo/i), d.sin_existencias);
    afirmar("sale 1 a Lima: falta 1 (queda 1 en el almacén)", d.tras_lima === "1:1", d.tras_lima);
    afirmar("salir al Taller no cuenta: sigue faltando 1 (y el almacén ya no tiene)", d.tras_taller === "1:0", d.tras_taller);
    afirmar("anular el traslado a Lima la devuelve: faltan 2 (1 volvió al almacén)", d.tras_anular === "2:1", d.tras_anular);
    afirmar("el siguiente traslado a Lima descuenta de nuevo: falta 1", d.tras_otro === "1:0", d.tras_otro);
    afirmar("dos salidas registradas, una por traslado a Lima (la anulada no se borra, deja de contar)", d.salidas === "2:2", d.salidas);
  },
);

correr(
  "Para enviar · el envío de un pedido para un cliente no la descuenta (lleva la apartada); el siguiente traslado sí",
  `${COMO_API}select retail.subir_para_enviar(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 2)), null, gen_random_uuid()) as r1 \\gset
select retail.pedir_prenda_para_apartar(:'lim', :'tru', :'v3', 1, 'Ana', 'Lozano', '987111222') as ped \\gset
select 'K|antes|' || string_agg(falta || ':' || en_almacen, ',') from retail.fn_para_enviar(:'tru');
select retail.enviar_pedido_para_apartar(:'ped', now() + interval '1 day', gen_random_uuid()) as tr \\gset
select 'K|tras_pedido|' || string_agg(falta || ':' || en_almacen, ',') from retail.fn_para_enviar(:'tru');
select retail.iniciar_traslado(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr2 \\gset
select 'K|tras_otro|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
${COMO_POSTGRES}
${K("marca", "coalesce(current_setting('retail.salida_de_pedido_cliente', true), '')")}`,
  (d) => {
    afirmar("subidas 2 para Lima; el pedido aparta 1 de ellas: faltan 2, libre 1", d.antes === "2:1", d.antes);
    afirmar("el pedido sale y la lista NO se descuenta: siguen faltando 2 (y avisa que en el almacén hay 1)", d.tras_pedido === "2:1", d.tras_pedido);
    afirmar("un traslado normal a Lima sí descuenta: falta 1", d.tras_otro === "1:0", d.tras_otro);
    afirmar("la marca se borra apenas sale el traslado del pedido", d.marca === "", d.marca);
  },
);

correr(
  "Para enviar · «Ya no la envío» con motivo; lo que ya salió no; Eliminar un producto la conoce",
  `select gen_random_uuid() as tok \\gset
${COMO_API}select retail.subir_para_enviar(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), null, :'tok') as r1 \\gset
${COMO_POSTGRES}
select id as pe_id from retail.prendas_para_enviar where variante_id = :'v3' \\gset
${K("historia", "(select string_agg(concepto || ':' || n || ':' || borrable, ',') from retail.fn_producto_historia(:'p3') where concepto like 'prendas para enviar%')")}
${intento("sin_motivo", "format('select retail.cancelar_para_enviar(%L::uuid, null)::text', :'pe_id')")}
${sesion(MICAELA)}
${intento("cancelar", "format('select retail.cancelar_para_enviar(%L::uuid, %L)::text', :'pe_id', 'Se vendió aquí')")}
${intento("otra_vez", "format('select retail.cancelar_para_enviar(%L::uuid, %L)::text', :'pe_id', 'Se vendió aquí')")}
${K("fila", "(select (cancelado_en is not null) || ':' || (cancelado_por = :'micaela') || ':' || cancelado_motivo from retail.prendas_para_enviar where id = :'pe_id')")}
${COMO_API}select 'K|lista|' || count(*) from retail.fn_para_enviar(:'tru');
${COMO_POSTGRES}
${sesion(FELIPE)}
${COMO_API}select retail.subir_para_enviar(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), null, gen_random_uuid()) as r2 \\gset
select retail.iniciar_traslado(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr \\gset
${COMO_POSTGRES}
select id as pe_salio from retail.prendas_para_enviar where variante_id = :'v3' and cancelado_en is null \\gset
${intento("ya_salio", "format('select retail.cancelar_para_enviar(%L::uuid, %L)::text', :'pe_salio', 'x')")}
${COMO_POSTGRES}
select pg_temp.intento(format($q$insert into retail.prendas_para_enviar (ubicacion_id, ubicacion_destino_id, variante_id, cantidad) values (%L, %L, %L, 1) returning id::text$q$, :'tru', :'tru', :'v3')) as _i \\gset
select 'K|check_misma|' || :'_i';
select pg_temp.intento(format($q$insert into retail.prendas_para_enviar (ubicacion_id, ubicacion_destino_id, variante_id, cantidad, cancelado_en) values (%L, %L, %L, 1, now()) returning id::text$q$, :'tru', :'lim', :'v3')) as _i \\gset
select 'K|check_sin_motivo|' || :'_i';`,
  (d) => {
    afirmar("Eliminar un producto la ve y frena (no borrable)", d.historia === "prendas para enviar a otra sede:1:false", d.historia);
    afirmar("sin motivo no se quita", falloCon(d.sin_motivo, /por qué/), d.sin_motivo);
    afirmar("Micaela (su sede) la quita", j(d.cancelar)?.ok === true, d.cancelar);
    afirmar("el reintento no falla", j(d.otra_vez)?.ok === true, d.otra_vez);
    afirmar("queda cuándo, quién y por qué", d.fila === "true:true:Se vendió aquí", d.fila);
    afirmar("ya no está en la lista", d.lista === "0", d.lista);
    afirmar("lo que ya salió no se quita", falloCon(d.ya_salio, /ya salió/), d.ya_salio);
    afirmar("CHECK: no se manda a la misma sede", j(d.check_misma)?.estado === "23514", d.check_misma);
    afirmar("CHECK: cancelada sin motivo no", j(d.check_sin_motivo)?.estado === "23514", d.check_sin_motivo);
  },
);

// ---------------------------------------------------------------------------
// Revisión adversarial (ADR-0328 act. 17): lo que la prueba original no veía.
// ---------------------------------------------------------------------------
/** La nota del libro y el motivo con que se cerró la reserva del pedido en el origen. */
const cierreReserva = (ped = "ped") =>
  `(select m.nota || '#' || a.cierre_motivo from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_origen_id join retail.movimientos m on m.id = a.movimiento_cierre_id where pe.id = :'${ped}')`;

correr(
  "Enviar con la reserva liberada a mano · lo colgado dice «súbela al almacén» (no «Stock insuficiente»); lo del almacén se vuelve a apartar y sale",
  `${pedir("v2")}
select a.id as ap2 from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_origen_id where pe.id = :'ped' \\gset
${COMO_API}select retail.liberar_apartado(:'ap2', 'otro') as _l \\gset
select 'K|leida|' || reserva_en from retail.fn_pedidos_con_cliente(:'lim') where id = :'ped';
${COMO_POSTGRES}
${intento("enviar_colgada_libre", enviarSql())}
${K("sigue", "(select estado from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}
${K("lim_piso", stockEn("v2", "lim", "lim_piso"))}
${intento("subir", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped')")}
${K("reserva_subida", reserva())}
${enviar()}
${K("enviado", "(select estado from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}
${pedir("v1", { como: "ped_b" })}
select a.id as ap1 from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_origen_id where pe.id = :'ped_b' \\gset
${COMO_API}select retail.liberar_apartado(:'ap1', 'otro') as _l2 \\gset
${COMO_POSTGRES}
${enviar("ped_b", "tr_b")}
${K("enviado_b", "(select estado || ':' || (transferencia_id = :'tr_b') from retail.separacion_pedidos where id = :'ped_b') || ':' || " + reserva("ped_b"))}
${K("lim_b", `${stockEn("v1", "lim", "lim_alm")} || ',' || ${stockEn("v1", "lim", "lim_piso")}`)}`,
  (d) => {
    afirmar("liberada a mano, la lectura dice «sin_reserva»", d.leida === "sin_reserva", d.leida);
    afirmar("Enviar la vuelve a apartar, la encuentra colgada y dice «súbela al almacén» (hint pedido_en_piso)", falloCon(d.enviar_colgada_libre, /súbela al almacén/) && j(d.enviar_colgada_libre)?.hint === "pedido_en_piso", d.enviar_colgada_libre);
    afirmar("…sin dejar nada a medias: sigue «pedido», la reserva liberada a mano, el piso libre (1/0)", d.sigue === "pedido:liberado:piso" && d.lim_piso === "1/0", `${d.sigue} ${d.lim_piso}`);
    afirmar("«Subir al almacén» la vuelve a apartar y la sube", j(d.subir)?.ok === true && d.reserva_subida === "abierto:alm", `${d.subir} ${d.reserva_subida}`);
    afirmar("después sale", d.enviado === "en_camino:liberado:alm", d.enviado);
    afirmar("si estaba libre en el almacén, Enviar la vuelve a apartar y sale en un paso", d.enviado_b === "en_camino:true:liberado:alm", d.enviado_b);
    afirmar("…y se lleva la del almacén, no la del piso (0/0 y 1/0)", d.lim_b === "0/0,1/0", d.lim_b);
  },
);

correr(
  "Cancelar exige un módulo del pedido · el libro dice qué pasó con la reserva (nunca «se entrega a la clienta»)",
  `${sesion(MICAELA)}
${pedir("v1")}
${rolMicaela(SOLO_ANALISIS)}
${intento("cancelar_sin_modulo", "format('select retail.cancelar_pedido_para_apartar(%L::uuid, %L)::text', :'ped', 'x')")}
${K("tras_sin_modulo", "(select estado from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}
${rolMicaela(":'rol_micaela'")}
${intento("cancelar_con_vender", "format('select retail.cancelar_pedido_para_apartar(%L::uuid, %L)::text', :'ped', 'El cliente ya no la quiere')")}
${K("tras_cancelar", "(select estado from retail.separacion_pedidos where id = :'ped') || ':' || " + reserva())}
${K("nota_cancelar", cierreReserva())}
${sesion(FELIPE)}
${pedir("v2", { como: "ped_c" })}
${intento("subir_c", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped_c')")}
${enviar("ped_c", "tr_c")}
${K("nota_enviar", cierreReserva("ped_c"))}
${K("notas_v2", "(select string_agg(nota, ' / ' order by nota) from retail.movimientos where variante_id = :'v2' and tipo = 'liberacion_apartado')")}
${K("entrega", "(select count(*) from retail.movimientos where variante_id in (:'v1', :'v2') and nota like '%se entrega a la clienta%')")}`,
  (d) => {
    afirmar("con solo Análisis no se cancela (aunque opere la sede que pidió)", j(d.cancelar_sin_modulo)?.estado === "42501" && /Traslados, Apartados ni Vender/.test(j(d.cancelar_sin_modulo)?.msg), d.cancelar_sin_modulo);
    afirmar("…y la reserva de Lima sigue en pie", d.tras_sin_modulo === "pedido:abierto:alm", d.tras_sin_modulo);
    afirmar("con su rol (Vender) sí cancela y la reserva se suelta", j(d.cancelar_con_vender)?.ok === true && d.tras_cancelar === "cancelado:liberado:alm", `${d.cancelar_con_vender} ${d.tras_cancelar}`);
    afirmar("el libro: «se canceló el pedido de Tienda Trujillo», motivo «otro»", d.nota_cancelar === "Apartado de Ana Lozano: se canceló el pedido de Tienda Trujillo#otro", d.nota_cancelar);
    afirmar("al enviar: «sale en traslado hacia Tienda Trujillo para el cliente», motivo «otro»", d.nota_enviar === "Apartado de Ana Lozano: sale en traslado hacia Tienda Trujillo para el cliente#otro", d.nota_enviar);
    afirmar("al subir: «se sube al almacén para enviarla a Tienda Trujillo»", d.notas_v2 === "Apartado de Ana Lozano: sale en traslado hacia Tienda Trujillo para el cliente / Apartado de Ana Lozano: se sube al almacén para enviarla a Tienda Trujillo", d.notas_v2);
    afirmar("ninguna nota dice «se entrega a la clienta»", d.entrega === "0", d.entrega);
  },
);

correr(
  "Candados de sede y módulo · subir (Apartados sí, Análisis no), avisar solo la sede que pidió",
  `${pedir("v3", { como: "ped_t", desde: "lim", a: "tru" })}
${K("reserva_t", "(select a.estado || ':' || case a.sububicacion_id when :'tru_piso' then 'piso' when :'tru_alm' then 'alm' else 'otro' end from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_origen_id where pe.id = :'ped_t')")}
${sesion(MICAELA)}${rolMicaela(SOLO_ANALISIS)}
${intento("subir_sin_modulo", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped_t')")}
${rolMicaela(SOLO_APARTADOS)}
${intento("subir_con_apartados", "format('select retail.subir_pedido_al_almacen(%L::uuid)::text', :'ped_t')")}
${rolMicaela(":'rol_micaela'")}
${sesion(FELIPE)}
${enviar("ped_t", "tr_t")}
${contar("v3", 1, "tr_t")}${confirmar("tr_t")}
${K("llego_t", "(select estado from retail.separacion_pedidos where id = :'ped_t')")}
${sesion(MICAELA)}
${intento("avisar_desde_origen", "format('select retail.marcar_pedido_avisado(%L::uuid)::text', :'ped_t')")}
${K("sin_aviso", "(select avisado_en is null from retail.separacion_pedidos where id = :'ped_t')")}`,
  (d) => {
    afirmar("Lima pide la 3 a Trujillo: se aparta colgada en el piso de Trujillo", d.reserva_t === "abierto:piso", d.reserva_t);
    afirmar("quien opera Trujillo sin Traslados, Apartados ni Existencias no la sube", j(d.subir_sin_modulo)?.estado === "42501" && /Traslados, Apartados ni Existencias/.test(j(d.subir_sin_modulo)?.msg), d.subir_sin_modulo);
    afirmar("con solo Apartados sí la sube (el botón vive ahí, ADR-0306)", j(d.subir_con_apartados)?.ok === true && JSON.parse(j(d.subir_con_apartados).res).ya_estaba === false, d.subir_con_apartados);
    afirmar("sale y llega a Lima", d.llego_t === "llego", d.llego_t);
    afirmar("Micaela (opera solo Trujillo, el origen) no marca el aviso: le avisa la sede que pidió", j(d.avisar_desde_origen)?.estado === "42501" && /sede que pidió/.test(j(d.avisar_desde_origen)?.msg) && d.sin_aviso === "true", `${d.avisar_desde_origen} ${d.sin_aviso}`);
  },
);

correr(
  "Candados de las lecturas · Micaela (Trujillo) no lee los pedidos ni la lista «Para enviar» de Lima",
  `${pedir("v1")}
${COMO_API}select retail.subir_para_enviar(:'lim', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1)), null, gen_random_uuid()) as r_lim \\gset
select 'K|felipe_lim|' || (select count(*) from retail.fn_pedidos_con_cliente(:'lim')) || ':' || (select count(*) from retail.fn_para_enviar(:'lim'));
${COMO_POSTGRES}
${sesion(MICAELA)}${COMO_API}
select 'K|micaela_lim|' || (select count(*) from retail.fn_pedidos_con_cliente(:'lim')) || ':' || (select count(*) from retail.fn_para_enviar(:'lim'));
select 'K|micaela_tru|' || (select count(*) from retail.fn_pedidos_con_cliente(:'tru'));
${COMO_POSTGRES}`,
  (d) => {
    afirmar("Felipe ve en Lima 1 pedido para un cliente y 1 prenda para enviar", d.felipe_lim === "1:1", d.felipe_lim);
    afirmar("Micaela no ve ni los clientes ni la lista de Lima (0 y 0)", d.micaela_lim === "0:0", d.micaela_lim);
    afirmar("Micaela sí ve el pedido de su sede", d.micaela_tru === "1", d.micaela_tru);
  },
);

correr(
  "Para enviar · un traslado de OTRA sede al mismo destino no descuenta lo que Trujillo subió para Lima",
  `${COMO_API}select retail.subir_para_enviar(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), null, gen_random_uuid()) as r1 \\gset
${COMO_POSTGRES}
select pg_temp.cargar(:'v3', :'taller', null, 1) as _ct \\gset
${COMO_API}select retail.iniciar_traslado(:'taller', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr_taller \\gset
select 'K|tras_taller|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
${COMO_POSTGRES}
${K("salidas", "(select count(*) from retail.prendas_para_enviar_salidas s join retail.prendas_para_enviar pp on pp.id = s.prenda_para_enviar_id where pp.variante_id = :'v3')")}
${COMO_API}select retail.iniciar_traslado(:'tru', :'lim', jsonb_build_array(jsonb_build_object('variante_id', :'v3', 'cantidad', 1)), now() + interval '1 day', null, gen_random_uuid()) as tr_tru \\gset
select 'K|tras_tru|' || coalesce(string_agg(falta || ':' || en_almacen, ','), 'vacía') from retail.fn_para_enviar(:'tru');
${COMO_POSTGRES}`,
  (d) => {
    afirmar("Taller → Lima con la misma prenda: a Trujillo le sigue faltando 1 (y la tiene en el almacén)", d.tras_taller === "1:1", d.tras_taller);
    afirmar("…sin ninguna salida registrada", d.salidas === "0", d.salidas);
    afirmar("el traslado de Trujillo a Lima sí la saca de la lista", d.tras_tru === "vacía", d.tras_tru);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Permisos · nada abierto a anon; las internas no las llama nadie desde la web; las tablas solo por funciones",
  `${K("anon", ["subir_pedido_al_almacen(uuid)", "marcar_pedido_avisado(uuid)", "fn_pedidos_por_atender(uuid)", "fn_pedidos_con_cliente(uuid)", "subir_para_enviar(uuid, uuid, jsonb, text, uuid)", "cancelar_para_enviar(uuid, text)", "fn_para_enviar(uuid)"].map((f) => `has_function_privilege('anon', 'retail.${f}', 'execute')`).join(" or "))}
${K("authenticated", ["subir_pedido_al_almacen(uuid)", "marcar_pedido_avisado(uuid)", "fn_pedidos_por_atender(uuid)", "fn_pedidos_con_cliente(uuid)", "subir_para_enviar(uuid, uuid, jsonb, text, uuid)", "cancelar_para_enviar(uuid, text)", "fn_para_enviar(uuid)"].map((f) => `has_function_privilege('authenticated', 'retail.${f}', 'execute')`).join(" and "))}
${K("internas", ["fn_reservar_pedido_en_origen(uuid, uuid)", "fn_cerrar_reserva_de_pedido(uuid, text, uuid)", "fn_soltar_reserva_de_origen(uuid, boolean)", "fn_pedidos_vuelven_a_esperar(uuid)", "fn_para_enviar_pendiente(uuid)", "trg_para_enviar_al_salir()"].map((f) => `has_function_privilege('authenticated', 'retail.${f}', 'execute')`).join(" or "))}
${K("tablas", "has_table_privilege('authenticated', 'retail.prendas_para_enviar', 'select') or has_table_privilege('authenticated', 'retail.prendas_para_enviar_salidas', 'select')")}
${K("rls", "(select bool_and(relrowsecurity) from pg_class where oid in ('retail.prendas_para_enviar'::regclass, 'retail.prendas_para_enviar_salidas'::regclass))")}`,
  (d) => {
    afirmar("anon no ejecuta ninguna", d.anon === "false", d.anon);
    afirmar("authenticated ejecuta las de la pantalla", d.authenticated === "true", d.authenticated);
    afirmar("nadie llama directo a las internas", d.internas === "false", d.internas);
    afirmar("las tablas nuevas no se leen directo", d.tablas === "false", d.tablas);
    afirmar("con RLS encendida (sin políticas)", d.rls === "true", d.rls);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones`);
process.exit(fallos === 0 ? 0 : 1);
