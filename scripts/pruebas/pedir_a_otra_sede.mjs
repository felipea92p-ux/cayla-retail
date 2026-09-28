#!/usr/bin/env node
/**
 * Prueba de ADR-0242 tanda 4 · «Pedir a otra sede» (D-7, migración 20260927210000) contra el Postgres LOCAL.
 *
 * EL PROBLEMA QUE PRUEBA. Una tienda le pide prendas a otra para reponer, sin clienta: tiene que quedar en el sistema
 * (quién pidió, qué, a quién), salir en UN traslado, entrar al stock al llegar sin apartarse, y no mezclarse con los
 * pedidos para apartar de Apartados (ADR-0233), que viven en la misma tabla y tienen que seguir funcionando igual.
 *
 * QUÉ CUBRE
 *   1. Pedir: un grupo con una fila por prenda (las repetidas se suman), sin clienta, firmado; el token no duplica.
 *   2. Lo que no deja: más de lo disponible, la misma sede, algo que no es tienda, cantidades malas, más de 100 líneas,
 *      sin módulo, para una sede que no opera; y los CHECK de la tabla (clienta a medias, reposición «llegó»).
 *   3. Enviar: todo el grupo en UN `iniciar_traslado` con su nota; el reintento devuelve el mismo traslado; con solo
 *      Análisis se pide pero no se envía.
 *   4. Llegar: al confirmar, las filas pasan a «recibido» y NO se aparta nada; llegada parcial; anular devuelve a
 *      «pedido» y se reenvía.
 *   5. Cancelar: «No la tengo» desde el origen, reintento sin error, no se cancela lo que ya salió.
 *   6. Apartados no cambia: `fn_pedidos_para_apartar` no ve la reposición, sus funciones la rechazan y un pedido CON
 *      clienta se sigue apartando al llegar.
 *   7. `fn_pedidos_entre_sedes`: las dos direcciones, las líneas y el disponible; exige operar la sede.
 *   8. Permisos: nada abierto a anon.
 *
 * CÓMO. Mismo patrón que `traslados_recibir_sin_perder_nada.mjs`: cada caso en su transacción con ROLLBACK (no deja nada
 * en el Postgres compartido; jamás `db reset`), sesión simulada con `request.jwt.claim(s)`, las RPC se llaman como la API
 * (`set local role authenticated`) y las verificaciones se leen como postgres.
 *
 * DATOS. Del seed solo lo estable: Tienda Trujillo, Tienda Lima, Taller, Felipe (líder) y Micaela (integrante fija a
 * Trujillo). Las prendas se crean dentro de la transacción, con su stock cargado por el ledger.
 *
 * USO
 *   pnpm pruebas:pedir-a-otra-sede    → con la migración ya aplicada en el Postgres local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

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
declare v_estado text; v_msg text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'msg', v_msg);
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
select id as tru_alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset

-- Dos prendas nuevas (un producto cada una: sin talla ni color, dos variantes de un producto chocarían en su código).
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedir otra sede 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedir otra sede 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-POS-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-POS-2', 100, 40, true) returning id as v2 \\gset

-- Cinco de cada una en el almacén de Trujillo, cargadas por el ledger (como las carga el sistema).
create function pg_temp.cargar(v uuid, u uuid, s uuid, n int) returns void language plpgsql as $f$
declare m uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
    values (v, u, s, 'entrada', n, 'carga_inicial') returning id into m;
  perform retail.fn_aplicar_movimiento(m);
end $f$;
select pg_temp.cargar(:'v1', :'tru', :'tru_alm', 5) as _c1 \\gset
select pg_temp.cargar(:'v2', :'tru', :'tru_alm', 5) as _c2 \\gset

-- Roles de prueba (solo dentro de la transacción): uno que solo vende y uno que solo ve Análisis.
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000a1', 'Solo vender (prueba pedir)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000a1', 'vender');
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000a2', 'Solo Análisis (prueba pedir)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000a2', 'analisis');
select rol_id as rol_micaela from retail.colaboradores where persona_id = :'micaela' \\gset
${sesion(FELIPE)}`;

/** Cambia el rol de Micaela dentro de la transacción. */
const rolMicaela = (rolId) => `${COMO_POSTGRES}update retail.colaboradores set rol_id = ${rolId} where persona_id = :'micaela';\n`;
const SOLO_VENDER = "'44444444-4444-4444-8444-0000000000a1'";
const SOLO_ANALISIS = "'44444444-4444-4444-8444-0000000000a2'";

const K = (clave, expresion) => `select 'K|${clave}|' || coalesce((${expresion})::text, '∅');`;
const LINEAS = (...pares) => `jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})`;
/** Lima le pide a Trujillo (como la API); deja el grupo en :g (o el nombre que se pida). */
const pedir = (lineas, { desde = "lim", a = "tru", como = "g", nota = "null", token = "null" } = {}) =>
  `${COMO_API}select retail.pedir_a_otra_sede(:'${desde}', :'${a}', ${lineas}, ${nota}, ${token}) as ${como} \\gset\n${COMO_POSTGRES}`;
/** Trujillo envía el grupo; deja el traslado en :tr (o el nombre que se pida). */
const enviar = (grupo = "g", como = "tr", token = "gen_random_uuid()") =>
  `${COMO_API}select retail.enviar_pedido_a_otra_sede(:'${grupo}', now() + interval '1 day', ${token}) as ${como} \\gset\n${COMO_POSTGRES}`;
const contar = (v, n, tr = "tr") => `${COMO_API}select retail.registrar_recepcion_traslado(:'${tr}', :'${v}', ${n}) as _r \\gset\n${COMO_POSTGRES}`;
const confirmar = (tr = "tr") => `${COMO_API}select retail.confirmar_traslado(:'${tr}', 'piso_venta') as _conf \\gset\n${COMO_POSTGRES}`;
/** Una llamada que puede fallar: su JSON queda en la clave pedida. */
const intento = (clave, llamada) =>
  `${COMO_API}select pg_temp.intento(${llamada}) as _i \\gset\n${COMO_POSTGRES}select 'K|${clave}|' || :'_i';\n`;
const pedirSql = (lineas, desde = "lim", a = "tru") => `format('select retail.pedir_a_otra_sede(%L::uuid, %L::uuid, %L::jsonb)::text', :'${desde}', :'${a}', ${lineas})`;
const filasGrupo = (g = "g") =>
  `(select string_agg(va.sku || ':' || pe.cantidad || ':' || pe.estado, ',' order by va.sku) from retail.separacion_pedidos pe join retail.variantes va on va.id = pe.variante_id where pe.grupo_id = :'${g}')`;

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
  "Pedir · un grupo, una fila por prenda (las repetidas se suman), sin clienta y firmado; el token no duplica",
  `select gen_random_uuid() as tok \\gset
${pedir(LINEAS(["v1", 2], ["v2", 1], ["v1", 1]), { nota: "'Se acabó la M'", token: ":'tok'" })}
${K("filas", filasGrupo())}
${K("sin_clienta", "(select bool_and(clienta_nombres is null and clienta_apellidos is null and clienta_celular is null) from retail.separacion_pedidos where grupo_id = :'g')")}
${K("firma", "(select bool_and(creado_por = :'felipe' and ubicacion_id = :'lim' and ubicacion_origen_id = :'tru' and nota = 'Se acabó la M') from retail.separacion_pedidos where grupo_id = :'g')")}
${K("tokens", "(select count(*) filter (where token_cliente = :'tok') || ',' || count(*) filter (where token_cliente is null) from retail.separacion_pedidos where grupo_id = :'g')")}
${pedir(LINEAS(["v1", 2], ["v2", 1], ["v1", 1]), { nota: "'Se acabó la M'", token: ":'tok'", como: "g2" })}
${K("mismo_grupo", "(:'g' = :'g2')")}
${K("total_filas", "(select count(*) from retail.separacion_pedidos where ubicacion_id = :'lim' and ubicacion_origen_id = :'tru' and clienta_nombres is null)")}
${K("stock_origen", "(select sum(cantidad) || ',' || sum(cantidad_apartada) from retail.stock where ubicacion_id = :'tru' and variante_id in (:'v1', :'v2'))")}`,
  (d) => {
    afirmar("dos filas: ZZ-POS-1 ×3 (2+1 sumadas) y ZZ-POS-2 ×1, en «pedido»", d.filas === "ZZ-POS-1:3:pedido,ZZ-POS-2:1:pedido", d.filas);
    afirmar("sin clienta (las tres columnas vacías)", d.sin_clienta === "true", d.sin_clienta);
    afirmar("firmado por quien pide, de Lima a Trujillo, con su nota", d.firma === "true", d.firma);
    afirmar("el token va solo en la primera fila", d.tokens === "1,1", d.tokens);
    afirmar("el mismo token devuelve el MISMO grupo", d.mismo_grupo === "true", d.mismo_grupo);
    afirmar("…y no crea filas nuevas", d.total_filas === "2", d.total_filas);
    afirmar("pedir no reserva nada en el origen (10 en stock, 0 apartadas)", d.stock_origen === "10,0", d.stock_origen);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Pedir · lo que no deja",
  `${intento("mas_de_lo_disponible", pedirSql(LINEAS(["v1", 6])))}
${intento("misma_sede", pedirSql(LINEAS(["v1", 1]), "tru", "tru"))}
${intento("taller", pedirSql(LINEAS(["v1", 1]), "lim", "taller"))}
${intento("vacio", pedirSql("'[]'::jsonb"))}
${intento("cantidad_cero", pedirSql(LINEAS(["v1", 0])))}
${intento("sin_variante", pedirSql(`jsonb_build_array(jsonb_build_object('cantidad', 1))`))}
${intento("mas_de_100", pedirSql(`(select jsonb_agg(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)) from generate_series(1, 101))`))}
-- Talla retirada CON prendas: desde 20260929030000 (ADR-0261) eso ya no se puede producir, pero existe en datos
-- viejos y esta prueba cubre justo ese caso: se arma sin disparadores, solo dentro de esta transacción.
set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'v2';
set local session_replication_role = origin;
${intento("descontinuada", pedirSql(LINEAS(["v2", 1])))}
update retail.variantes set activo = true where id = :'v2';
${sesion(MICAELA)}
${intento("micaela_para_lima", pedirSql(LINEAS(["v1", 1]), "lim", "tru"))}
${rolMicaela(SOLO_VENDER)}
${intento("sin_modulo", pedirSql(LINEAS(["v1", 1]), "tru", "lim"))}
${K("filas", "(select count(*) from retail.separacion_pedidos where variante_id in (:'v1', :'v2'))")}
${COMO_POSTGRES}
select pg_temp.intento(format($q$insert into retail.separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad, clienta_nombres) values (%L, %L, %L, 1, 'Ana') returning id::text$q$, :'lim', :'tru', :'v1')) as _i \\gset
select 'K|clienta_a_medias|' || :'_i';
select pg_temp.intento(format($q$insert into retail.separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad, estado, grupo_id) values (%L, %L, %L, 1, 'llego', gen_random_uuid()) returning id::text$q$, :'lim', :'tru', :'v1')) as _i \\gset
select 'K|reposicion_llego|' || :'_i';
select pg_temp.intento(format($q$insert into retail.separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad) values (%L, %L, %L, 1) returning id::text$q$, :'lim', :'tru', :'v1')) as _i \\gset
select 'K|reposicion_sin_grupo|' || :'_i';
select pg_temp.intento(format($q$insert into retail.separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad, clienta_nombres, clienta_apellidos, clienta_celular, estado) values (%L, %L, %L, 1, 'Ana', 'Lozano', '987111222', 'recibido') returning id::text$q$, :'lim', :'tru', :'v1')) as _i \\gset
select 'K|clienta_recibido|' || :'_i';`,
  (d) => {
    afirmar("más de lo disponible: dice cuántas quedan", falloCon(d.mas_de_lo_disponible, /ya no tiene 6 de «zz pedir otra sede 1» \(quedan 5\)/i), d.mas_de_lo_disponible);
    afirmar("a la misma sede no", falloCon(d.misma_sede, /OTRA sede/), d.misma_sede);
    afirmar("al Taller no (solo entre tiendas)", falloCon(d.taller, /entre tiendas/), d.taller);
    afirmar("sin prendas no", falloCon(d.vacio, /al menos una prenda/), d.vacio);
    afirmar("cantidad 0 no", falloCon(d.cantidad_cero, /cantidad mayor a cero/), d.cantidad_cero);
    afirmar("una línea sin prenda no", falloCon(d.sin_variante, /cantidad mayor a cero/), d.sin_variante);
    afirmar("más de 100 prendas distintas no", falloCon(d.mas_de_100, /hasta 100/), d.mas_de_100);
    afirmar("una prenda descontinuada no", falloCon(d.descontinuada, /descontinuada/), d.descontinuada);
    afirmar("Micaela (Trujillo) no pide para Lima", j(d.micaela_para_lima)?.estado === "42501", d.micaela_para_lima);
    afirmar("sin Traslados ni Análisis no se pide", j(d.sin_modulo)?.estado === "42501" && /Traslados ni Análisis/.test(j(d.sin_modulo)?.msg), d.sin_modulo);
    afirmar("ningún intento fallido dejó filas", d.filas === "0", d.filas);
    afirmar("CHECK: la clienta va entera o no va", j(d.clienta_a_medias)?.estado === "23514", d.clienta_a_medias);
    afirmar("CHECK: una reposición no queda «llegó»", j(d.reposicion_llego)?.estado === "23514", d.reposicion_llego);
    afirmar("CHECK: una reposición siempre tiene grupo", j(d.reposicion_sin_grupo)?.estado === "23514", d.reposicion_sin_grupo);
    afirmar("CHECK: un pedido con clienta no termina «recibido»", j(d.clienta_recibido)?.estado === "23514", d.clienta_recibido);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Enviar · todo el grupo en UN traslado; el reintento devuelve el mismo; solo con Traslados",
  `${pedir(LINEAS(["v1", 2], ["v2", 3]))}
select pg_temp.cargar(:'v1', :'lim', :'lim_piso', 1) as _cl \\gset
${sesion(MICAELA)}${rolMicaela(SOLO_ANALISIS)}
${pedir(LINEAS(["v1", 1]), { desde: "tru", a: "lim", como: "g_analisis" })}
${intento("enviar_con_analisis", "format('select retail.enviar_pedido_a_otra_sede(%L::uuid, now() + interval ''1 day'')::text', :'g')")}
${rolMicaela(":'rol_micaela'")}
${sesion(FELIPE)}
${enviar()}
${K("items", "(select string_agg(va.sku || ':' || ti.cantidad, ',' order by va.sku) from retail.transferencia_items ti join retail.variantes va on va.id = ti.variante_id where ti.transferencia_id = :'tr')")}
${K("traslado", "(select ubicacion_origen_id = :'tru' and ubicacion_destino_id = :'lim' and estado = 'en_transito' from retail.transferencias where id = :'tr')")}
${K("nota", "(select nota from retail.transferencias where id = :'tr')")}
${K("filas", filasGrupo())}
${K("enlazadas", "(select bool_and(transferencia_id = :'tr' and enviado_por = :'felipe') from retail.separacion_pedidos where grupo_id = :'g')")}
${enviar("g", "tr_otra_vez")}
${K("mismo", "(:'tr' = :'tr_otra_vez')")}
${K("traslados_del_pedido", "(select count(*) from retail.transferencias where ubicacion_origen_id = :'tru' and ubicacion_destino_id = :'lim' and nota like 'Reposición pedida por%')")}
${K("stock_tru", "(select sum(cantidad) from retail.stock where ubicacion_id = :'tru' and variante_id in (:'v1', :'v2'))")}
${K("g_analisis", "(select count(*) || ':' || min(estado) from retail.separacion_pedidos where grupo_id = :'g_analisis')")}
${intento("cancelar_ya_salio", "format('select retail.cancelar_pedido_a_otra_sede(%L::uuid, %L)::text', :'g', 'ya no')")}`,
  (d) => {
    afirmar("con solo Análisis SÍ se pide (Micaela pide para Trujillo)", d.g_analisis === "1:pedido", d.g_analisis);
    afirmar("con solo Análisis NO se envía", j(d.enviar_con_analisis)?.estado === "42501", d.enviar_con_analisis);
    afirmar("un solo traslado con las dos líneas (2 y 3)", d.items === "ZZ-POS-1:2,ZZ-POS-2:3", d.items);
    afirmar("de Trujillo a Lima, en tránsito", d.traslado === "true", d.traslado);
    afirmar("con la nota «Reposición pedida por Tienda Lima»", d.nota === "Reposición pedida por Tienda Lima", d.nota);
    afirmar("las dos filas quedan «en camino»", d.filas === "ZZ-POS-1:2:en_camino,ZZ-POS-2:3:en_camino", d.filas);
    afirmar("enlazadas al traslado y firmadas por quien envió", d.enlazadas === "true", d.enlazadas);
    afirmar("el reintento (otro token) devuelve el MISMO traslado", d.mismo === "true", d.mismo);
    afirmar("…y no arma otro", d.traslados_del_pedido === "1", d.traslados_del_pedido);
    afirmar("salen 5 prendas de Trujillo (10 → 5)", d.stock_tru === "5", d.stock_tru);
    afirmar("lo que ya salió no se cancela: se anula el traslado", falloCon(d.cancelar_ya_salio, /anula el traslado/), d.cancelar_ya_salio);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Llegar · al confirmar quedan «recibido», entran al stock y NO se aparta nada",
  `${pedir(LINEAS(["v1", 2], ["v2", 3]))}${enviar()}
${contar("v1", 2)}${contar("v2", 3)}${confirmar()}
${K("traslado", "(select estado from retail.transferencias where id = :'tr')")}
${K("filas", filasGrupo())}
${K("llego_en", "(select bool_and(llego_en is not null and apartado_id is null) from retail.separacion_pedidos where grupo_id = :'g')")}
${K("piso_lima", "(select string_agg(cantidad || '/' || cantidad_apartada, ',' order by variante_id = :'v2') from retail.stock where ubicacion_id = :'lim' and sububicacion_id = :'lim_piso' and variante_id in (:'v1', :'v2'))")}
${K("apartados", "(select count(*) from retail.apartados where variante_id in (:'v1', :'v2'))")}
${COMO_API}
select 'K|lectura_lima|' || string_agg(direccion || ':' || estado || ':' || otra_sede || ':' || traslado_numero::text, ',') from retail.fn_pedidos_entre_sedes(:'lim') where grupo_id = :'g';
${COMO_POSTGRES}
${K("numero", "(select numero from retail.transferencias where id = :'tr')")}`,
  (d) => {
    afirmar("el traslado se cierra", d.traslado === "cerrada", d.traslado);
    afirmar("las dos filas pasan a «recibido»", d.filas === "ZZ-POS-1:2:recibido,ZZ-POS-2:3:recibido", d.filas);
    afirmar("con la hora de llegada y sin apartado", d.llego_en === "true", d.llego_en);
    afirmar("entran al piso de Lima, libres (2/0 y 3/0)", d.piso_lima === "2/0,3/0", d.piso_lima);
    afirmar("no se creó ningún apartado", d.apartados === "0", d.apartados);
    afirmar("Lima lo ve como «pedí · recibido» con el número del traslado", d.lectura_lima === `pedi:recibido:Tienda Trujillo:${d.numero}`, d.lectura_lima);
  },
);

correr(
  "Llegar · parcial: lo que llegó queda «recibido» y lo que no, cancelado al cerrar",
  `${pedir(LINEAS(["v1", 2], ["v2", 3]))}${enviar()}
${contar("v1", 2)}${contar("v2", 0)}${confirmar()}
${K("tras_confirmar", filasGrupo())}
${COMO_API}select retail.cerrar_traslado_con_diferencia(:'tr', 'no vino la 2') as _c \\gset
${COMO_POSTGRES}
${K("tras_cerrar", filasGrupo())}
${K("motivo", "(select cancelado_motivo from retail.separacion_pedidos pe where grupo_id = :'g' and variante_id = :'v2')")}
${COMO_API}
select 'K|estado_grupo|' || estado || ':' || coalesce(cancelado_motivo, '∅') from retail.fn_pedidos_entre_sedes(:'lim') where grupo_id = :'g';
${COMO_POSTGRES}`,
  (d) => {
    afirmar("la línea que cuadra ya está «recibido»; la otra sigue «en camino»", d.tras_confirmar === "ZZ-POS-1:2:recibido,ZZ-POS-2:3:en_camino", d.tras_confirmar);
    afirmar("al cerrar, la que no llegó se cancela", d.tras_cerrar === "ZZ-POS-1:2:recibido,ZZ-POS-2:3:cancelado", d.tras_cerrar);
    afirmar("con el motivo «no llegó»", d.motivo === "La prenda no llegó en el traslado", d.motivo);
    afirmar("el grupo se lee «recibido» (algo llegó) con el motivo de la que faltó", d.estado_grupo === "recibido:La prenda no llegó en el traslado", d.estado_grupo);
  },
);

correr(
  "Llegar · anular el envío devuelve el grupo a «pedido» y se puede enviar de nuevo",
  `${pedir(LINEAS(["v1", 1], ["v2", 1]))}${enviar()}
${COMO_API}select retail.anular_traslado(:'tr', 'se equivocó de caja', null) as _a \\gset
${COMO_POSTGRES}
${K("tras_anular", `${filasGrupo()} || '|' || (select bool_and(transferencia_id is null) from retail.separacion_pedidos where grupo_id = :'g')`)}
${enviar("g", "tr2")}
${K("reenviado", `(:'tr2' <> :'tr') || ',' || ${filasGrupo()}`)}`,
  (d) => {
    afirmar("vuelven a «pedido», sin traslado", d.tras_anular === "ZZ-POS-1:1:pedido,ZZ-POS-2:1:pedido|true", d.tras_anular);
    afirmar("se reenvían en otro traslado", d.reenviado === "true,ZZ-POS-1:1:en_camino,ZZ-POS-2:1:en_camino", d.reenviado);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Cancelar · «No la tengo» desde Trujillo (Micaela); el reintento no falla; sin módulo no",
  `${pedir(LINEAS(["v1", 1], ["v2", 2]))}
${pedir(LINEAS(["v1", 1]), { como: "g_otro" })}
${sesion(MICAELA)}${rolMicaela(SOLO_VENDER)}
${intento("sin_modulo", "format('select retail.cancelar_pedido_a_otra_sede(%L::uuid, %L)::text', :'g_otro', 'x')")}
${rolMicaela(":'rol_micaela'")}
${intento("cancelar", "format('select retail.cancelar_pedido_a_otra_sede(%L::uuid, %L)::text', :'g', 'No la tengo')")}
${intento("otra_vez", "format('select retail.cancelar_pedido_a_otra_sede(%L::uuid, %L)::text', :'g', 'No la tengo')")}
${K("filas", filasGrupo())}
${K("quien", "(select bool_and(cancelado_por = :'micaela' and cancelado_motivo = 'No la tengo') from retail.separacion_pedidos where grupo_id = :'g')")}
${sesion(FELIPE)}
${intento("enviar_cancelado", "format('select retail.enviar_pedido_a_otra_sede(%L::uuid, now() + interval ''1 day'')::text', :'g')")}
${intento("grupo_inexistente", "format('select retail.cancelar_pedido_a_otra_sede(%L::uuid)::text', gen_random_uuid())")}`,
  (d) => {
    afirmar("sin Traslados ni Análisis no se cancela", j(d.sin_modulo)?.estado === "42501", d.sin_modulo);
    afirmar("Micaela (la sede a la que le piden) cancela", j(d.cancelar)?.ok === true, d.cancelar);
    afirmar("el reintento no falla", j(d.otra_vez)?.ok === true, d.otra_vez);
    afirmar("todo el grupo queda cancelado", d.filas === "ZZ-POS-1:1:cancelado,ZZ-POS-2:2:cancelado", d.filas);
    afirmar("con quién y por qué", d.quien === "true", d.quien);
    afirmar("un pedido cancelado no se envía", falloCon(d.enviar_cancelado, /se canceló/), d.enviar_cancelado);
    afirmar("un grupo que no existe se rechaza", falloCon(d.grupo_inexistente, /no existe/), d.grupo_inexistente);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Apartados no cambia · no ve la reposición y sus funciones la rechazan",
  `${pedir(LINEAS(["v2", 1]))}
${COMO_API}select retail.pedir_prenda_para_apartar(:'lim', :'tru', :'v1', 1, 'Ana', 'Lozano', '987111222') as ped \\gset
select 'K|apartados_lima|' || count(*) || ':' || string_agg(clienta_nombres, ',') from retail.fn_pedidos_para_apartar(:'lim');
select 'K|apartados_tru|' || count(*) from retail.fn_pedidos_para_apartar(:'tru');
select 'K|traslados_lima|' || count(*) from retail.fn_pedidos_entre_sedes(:'lim');
${COMO_POSTGRES}
select id as fila_repo from retail.separacion_pedidos where grupo_id = :'g' \\gset
${intento("enviar_repo_como_apartado", "format('select retail.enviar_pedido_para_apartar(%L::uuid, now() + interval ''1 day'')::text', :'fila_repo')")}
${intento("cancelar_repo_como_apartado", "format('select retail.cancelar_pedido_para_apartar(%L::uuid)::text', :'ped')")}
${intento("enviar_apartado_como_repo", "format('select retail.enviar_pedido_a_otra_sede(%L::uuid, now() + interval ''1 day'')::text', gen_random_uuid())")}
${intento("cancelar_repo_fila", "format('select retail.cancelar_pedido_para_apartar(%L::uuid)::text', :'fila_repo')")}
`,
  (d) => {
    afirmar("Apartados de Lima ve solo el pedido con clienta", d.apartados_lima === "1:Ana", d.apartados_lima);
    afirmar("Apartados de Trujillo ve solo el pedido con clienta", d.apartados_tru === "1", d.apartados_tru);
    afirmar("Traslados de Lima ve solo la reposición", d.traslados_lima === "1", d.traslados_lima);
    afirmar("enviar_pedido_para_apartar rechaza una fila de reposición", falloCon(d.enviar_repo_como_apartado, /reposición/), d.enviar_repo_como_apartado);
    afirmar("cancelar_pedido_para_apartar rechaza una fila de reposición", falloCon(d.cancelar_repo_fila, /reposición/), d.cancelar_repo_fila);
    afirmar("cancelar_pedido_para_apartar sigue cancelando uno con clienta", j(d.cancelar_repo_como_apartado)?.ok === true, d.cancelar_repo_como_apartado);
    afirmar("enviar_pedido_a_otra_sede con un grupo que no existe se rechaza", falloCon(d.enviar_apartado_como_repo, /no existe/), d.enviar_apartado_como_repo);
  },
);

correr(
  "Apartados no cambia · un pedido CON clienta se sigue apartando al llegar",
  `${COMO_API}select retail.pedir_prenda_para_apartar(:'lim', :'tru', :'v1', 1, 'Ana', 'Lozano', '987111222') as ped \\gset
select retail.enviar_pedido_para_apartar(:'ped', now() + interval '1 day', gen_random_uuid()) as tr \\gset
${COMO_POSTGRES}
${contar("v1", 1)}${confirmar()}
${K("pedido_clienta", "(select p.estado || ',' || (p.apartado_id is not null) || ',' || a.cantidad from retail.separacion_pedidos p join retail.apartados a on a.id = p.apartado_id where p.id = :'ped')")}
${K("apartada_en_piso", "(select cantidad_apartada from retail.stock where variante_id = :'v1' and ubicacion_id = :'lim' and sububicacion_id = :'lim_piso')")}`,
  (d) => {
    afirmar("el pedido con clienta «llegó» y quedó apartado 1", d.pedido_clienta === "llego,true,1", d.pedido_clienta);
    afirmar("el piso de Lima lo tiene apartado", d.apartada_en_piso === "1", d.apartada_en_piso);
  },
);

// ---------------------------------------------------------------------------
correr(
  "fn_pedidos_entre_sedes · las dos direcciones, las líneas y el disponible; exige operar la sede",
  `${pedir(LINEAS(["v1", 2], ["v2", 1]), { nota: "'Para el fin de semana'" })}
${COMO_API}
select 'K|lima|' || direccion || ':' || estado || ':' || otra_sede || ':' || (otra_sede_id = :'tru') || ':' || creado_por_nombre || ':' || nota || ':' || (traslado_id is null) from retail.fn_pedidos_entre_sedes(:'lim') where grupo_id = :'g';
select 'K|tru|' || direccion || ':' || otra_sede || ':' || (otra_sede_id = :'lim') from retail.fn_pedidos_entre_sedes(:'tru') where grupo_id = :'g';
select 'K|lineas|' || string_agg(lower(l ->> 'producto') || ':' || (l ->> 'cantidad') || ':' || (l ->> 'disponible_en_origen') || ':' || (l ->> 'estado'), ',')
  from retail.fn_pedidos_entre_sedes(:'lim') f, jsonb_array_elements(f.lineas) l where f.grupo_id = :'g';
${COMO_POSTGRES}
${K("codigos", "(select bool_and(l ->> 'sku' = coalesce(va.codigo, va.sku)) from retail.fn_pedidos_entre_sedes(:'lim') f, jsonb_array_elements(f.lineas) l join retail.variantes va on va.id = (l ->> 'variante_id')::uuid where f.grupo_id = :'g')")}
${COMO_API}
${sesion(MICAELA)}${COMO_API}
select 'K|micaela_lima|' || count(*) from retail.fn_pedidos_entre_sedes(:'lim');
select 'K|micaela_tru|' || count(*) from retail.fn_pedidos_entre_sedes(:'tru');
${COMO_POSTGRES}`,
  (d) => {
    afirmar("Lima: «pedí», pedido, a Tienda Trujillo, quién y la nota, sin traslado", d.lima === "pedi:pedido:Tienda Trujillo:true:Felipe Alvarez:Para el fin de semana:true" || /^pedi:pedido:Tienda Trujillo:true:Felipe[^:]*:Para el fin de semana:true$/.test(d.lima ?? ""), d.lima);
    afirmar("Trujillo: «me piden», de Tienda Lima", d.tru === "me_piden:Tienda Lima:true", d.tru);
    afirmar("las líneas con producto, cantidad, disponible en Trujillo (5) y estado", d.lineas === "zz pedir otra sede 1:2:5:pedido,zz pedir otra sede 2:1:5:pedido", d.lineas);
    afirmar("cada línea trae el código de su etiqueta", d.codigos === "true", d.codigos);
    afirmar("Micaela (Trujillo) no lee lo de Lima", d.micaela_lima === "0", d.micaela_lima);
    afirmar("Micaela lee lo que le piden a Trujillo", d.micaela_tru === "1", d.micaela_tru);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Permisos · nada abierto a anon; authenticated ejecuta las de la pantalla",
  `${K("anon", "has_function_privilege('anon', 'retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid)', 'execute') or has_function_privilege('anon', 'retail.enviar_pedido_a_otra_sede(uuid, timestamptz, uuid)', 'execute') or has_function_privilege('anon', 'retail.cancelar_pedido_a_otra_sede(uuid, text)', 'execute') or has_function_privilege('anon', 'retail.fn_pedidos_entre_sedes(uuid)', 'execute')")}
${K("authenticated", "has_function_privilege('authenticated', 'retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid)', 'execute') and has_function_privilege('authenticated', 'retail.enviar_pedido_a_otra_sede(uuid, timestamptz, uuid)', 'execute') and has_function_privilege('authenticated', 'retail.cancelar_pedido_a_otra_sede(uuid, text)', 'execute') and has_function_privilege('authenticated', 'retail.fn_pedidos_entre_sedes(uuid)', 'execute')")}
${K("interna", "has_function_privilege('authenticated', 'retail.fn_apartar_pedidos_que_llegaron(uuid, uuid, uuid, integer)', 'execute')")}
${K("tabla", "has_table_privilege('authenticated', 'retail.separacion_pedidos', 'select')")}`,
  (d) => {
    afirmar("anon no ejecuta ninguna", d.anon === "false", d.anon);
    afirmar("authenticated sí", d.authenticated === "true", d.authenticated);
    afirmar("nadie llama directo a fn_apartar_pedidos_que_llegaron", d.interna === "false", d.interna);
    afirmar("la tabla no se lee directo (solo por funciones)", d.tabla === "false", d.tabla);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones`);
process.exit(fallos === 0 ? 0 : 1);
