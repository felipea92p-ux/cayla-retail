#!/usr/bin/env node
/**
 * Prueba de ADR-0239 «Traslados: recibir sin perder nada» (migración 20260927160000) contra el Postgres LOCAL.
 *
 * QUÉ CUBRE
 *   1. D-129: entra lo que coincide. Si todas las líneas cuadran, el traslado se cierra; si una no cuadra, las otras
 *      entran YA, el traslado queda `recibido_con_diferencia` y el líder hace entrar solo la restante, en la MISMA
 *      sububicación. Una línea que ya entró no se vuelve a contar.
 *   2. D-130: contar una casilla no marca «confirmado»; `fn_traslado_lineas` dice qué línea entró y su código.
 *   3. D-131: piso o almacén al confirmar (null = almacén); el Taller, que no tiene piso, usa el de siempre.
 *   4. D-132: anular devuelve cada prenda a su sububicación de origen y deja `anulada`; se rechaza con conteo empezado,
 *      sin motivo o desde una sede que no envió; el mismo token dos veces no duplica nada; el Balance deja de verlo en
 *      tránsito; Movimientos lo muestra como parte de su traslado.
 *   5. Pedido para apartar (ADR-0233): se aparta cuando SU línea entra, aunque otra espere al líder, y donde entró; al
 *      anular vuelve a «pedido» y se puede enviar de nuevo; si no llegó, se cancela al cerrar.
 *   6. Permisos: una sola firma de `confirmar_traslado`, nada abierto a anon, la función interna cerrada a todos.
 *
 * CÓMO. Como `ajuste_no_es_primera_carga.mjs`: cada caso en su transacción con ROLLBACK (no deja nada en el Postgres
 * compartido; jamás `db reset`), sesión simulada con `request.jwt.claim(s)` y `request.headers`, y las RPC se llaman
 * como la API (`set local role authenticated`); las verificaciones se leen como postgres. `pg_temp.intento` corre una
 * llamada y devuelve el resultado o el error (estado, mensaje) como JSON.
 *
 * DATOS. Del seed solo lo estable: Tienda Trujillo, Tienda Lima, Taller, Felipe (líder) y Micaela (integrante fija a
 * Trujillo). Las prendas se crean dentro de la transacción, con su stock cargado por el ledger.
 *
 * USO
 *   pnpm pruebas:traslados-recibir-sin-perder-nada    → con la migración ya aplicada en el Postgres local
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
select id as lim_alm from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset

-- Dos prendas nuevas (un producto cada una: sin talla ni color, dos variantes de un producto chocarían en su código).
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Traslado sin perder 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Traslado sin perder 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-TSP-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-TSP-2', 100, 40, true) returning id as v2 \\gset

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
${sesion(FELIPE)}`;

const K = (clave, expresion) => `select 'K|${clave}|' || coalesce((${expresion})::text, '∅');`;
const ITEMS = (...pares) => `jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})`;
/** Envía un traslado (como la API) y deja su id en :tr (o el nombre que se pida). */
const enviar = (items, { desde = "tru", hacia = "lim", como = "tr" } = {}) =>
  `${COMO_API}select retail.iniciar_traslado(:'${desde}', :'${hacia}', ${items}, now() + interval '1 day') as ${como} \\gset\n${COMO_POSTGRES}`;
const contar = (v, n, tr = "tr") => `${COMO_API}select retail.registrar_recepcion_traslado(:'${tr}', :'${v}', ${n}) as _r \\gset\n${COMO_POSTGRES}`;
/** Una llamada que puede fallar: su JSON queda en la clave pedida. */
const intento = (clave, llamada) =>
  `${COMO_API}select pg_temp.intento(${llamada}) as _i \\gset\n${COMO_POSTGRES}select 'K|${clave}|' || :'_i';\n`;
const stock = (v, ubic, sub) =>
  `coalesce((select sum(cantidad) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${ubic}' and sububicacion_id is not distinct from ${sub}), 0)`;
const confirmar = (destino) =>
  `format('select row_to_json(c)::text from retail.confirmar_traslado(%L::uuid${destino === undefined ? "" : ", %L"}) c', :'tr'${destino === undefined ? "" : `, ${destino === null ? "null" : `'${destino}'`}`})`;
/** `anular_traslado` sin token (la web siempre manda uno; sin él se prueba el mensaje de «ya se anuló»). */
const anular = (motivo, tr = "tr") => `format('select retail.anular_traslado(%L::uuid, %L, null)::text', :'${tr}', ${motivo})`;

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
const res = (texto) => j(j(texto)?.res);

// ---------------------------------------------------------------------------
correr(
  "D-129/D-131 · todas coinciden y van al piso: se cierra, el stock sube en el piso de Lima",
  `${enviar(ITEMS(["v1", 2], ["v2", 3]))}
${contar("v1", 2)}${contar("v2", 3)}
${K("confirmado_al_contar", "(select confirmado_por is not null or confirmado_en is not null from retail.transferencias where id = :'tr')")}
${intento("confirmar", confirmar("piso_venta"))}
${K("estado", "(select estado from retail.transferencias where id = :'tr')")}
${K("sub_destino", "(select sububicacion_destino_id = :'lim_piso' from retail.transferencias where id = :'tr')")}
${K("confirmado", "(select confirmado_por = :'felipe' and confirmado_en is not null and cerrado_en is not null from retail.transferencias where id = :'tr')")}
${K("piso", `${stock("v1", "lim", ":'lim_piso'")} || ',' || ${stock("v2", "lim", ":'lim_piso'")}`)}
${K("almacen", `${stock("v1", "lim", ":'lim_alm'")} + ${stock("v2", "lim", ":'lim_alm'")}`)}
${COMO_API}select 'K|lineas|' || string_agg(l.sku || ':' || l.ingresado || ':' || (l.codigo = va.codigo), ',' order by l.sku)
  from retail.fn_traslado_lineas(:'tr') l join retail.variantes va on va.id = l.variante_id;
${COMO_POSTGRES}`,
  (d) => {
    afirmar("contar las casillas NO marca «confirmado» (D-130)", d.confirmado_al_contar === "false", d.confirmado_al_contar);
    const c = res(d.confirmar);
    afirmar(
      "confirmar_traslado devuelve cerrada, 2 líneas, 0 con diferencia, 5 unidades",
      c?.resultado === "cerrada" && c.lineas_ok === 2 && c.lineas_con_diferencia === 0 && c.unidades_ingresadas === 5,
      d.confirmar,
    );
    afirmar("el traslado queda cerrado", d.estado === "cerrada", d.estado);
    afirmar("guarda el piso de Lima como destino de la caja", d.sub_destino === "true", d.sub_destino);
    afirmar("«confirmado» y «cerrado» los marca quien confirmó", d.confirmado === "true", d.confirmado);
    afirmar("el piso de Lima sube 2 y 3", d.piso === "2,3", d.piso);
    afirmar("el almacén de Lima no recibe nada", d.almacen === "0", d.almacen);
    afirmar("fn_traslado_lineas: las dos ingresadas y con el código de su etiqueta", d.lineas === "ZZ-TSP-1:true:true,ZZ-TSP-2:true:true", d.lineas);
  },
);

// ---------------------------------------------------------------------------
correr(
  "D-129 · una línea con diferencia: la otra entra YA; el líder cierra y entra solo la restante, en el mismo lugar",
  `${enviar(ITEMS(["v1", 2], ["v2", 3]))}
${contar("v1", 2)}${contar("v2", 1)}
${intento("confirmar", confirmar("piso_venta"))}
${K("estado", "(select estado from retail.transferencias where id = :'tr')")}
${K("piso_tras_confirmar", `${stock("v1", "lim", ":'lim_piso'")} || ',' || ${stock("v2", "lim", ":'lim_piso'")}`)}
${COMO_API}select 'K|ingresadas|' || string_agg(l.sku || ':' || l.ingresado, ',' order by l.sku) from retail.fn_traslado_lineas(:'tr') l;
${COMO_POSTGRES}
${intento("recontar_ingresada", "format('select retail.registrar_recepcion_traslado(%L::uuid, %L::uuid, 1)::text', :'tr', :'v1')")}
${intento("recontar_pendiente", "format('select retail.registrar_recepcion_traslado(%L::uuid, %L::uuid, 2)::text', :'tr', :'v2')")}
${intento("cerrar", "format('select row_to_json(c)::text from retail.cerrar_traslado_con_diferencia(%L::uuid, %L) c', :'tr', 'faltó una')")}
${K("estado_final", "(select estado from retail.transferencias where id = :'tr')")}
${K("piso_final", `${stock("v1", "lim", ":'lim_piso'")} || ',' || ${stock("v2", "lim", ":'lim_piso'")}`)}
${K("almacen_final", `${stock("v1", "lim", ":'lim_alm'")} + ${stock("v2", "lim", ":'lim_alm'")}`)}
${K("movs_entrada", "(select count(*) from retail.movimientos m join retail.transferencia_recepciones r on r.id = m.transferencia_recepcion_id where r.transferencia_id = :'tr')")}`,
  (d) => {
    const c = res(d.confirmar);
    afirmar(
      "confirmar devuelve recibido_con_diferencia, 1 línea entró (2 u), 1 con diferencia",
      c?.resultado === "recibido_con_diferencia" && c.lineas_ok === 1 && c.lineas_con_diferencia === 1 && c.unidades_ingresadas === 2,
      d.confirmar,
    );
    afirmar("el traslado queda recibido_con_diferencia", d.estado === "recibido_con_diferencia", d.estado);
    afirmar("la línea que cuadra ya está en el piso; la otra, todavía no", d.piso_tras_confirmar === "2,0", d.piso_tras_confirmar);
    afirmar("fn_traslado_lineas dice cuál entró", d.ingresadas === "ZZ-TSP-1:true,ZZ-TSP-2:false", d.ingresadas);
    const r1 = j(d.recontar_ingresada);
    afirmar("recontar una línea que ya entró se rechaza", r1?.ok === false && /ya entró al stock/.test(r1.msg), d.recontar_ingresada);
    afirmar("recontar la que espera sí se puede", j(d.recontar_pendiente)?.ok === true, d.recontar_pendiente);
    const c2 = res(d.cerrar);
    afirmar("el líder cierra: entra 1 línea con 2 unidades (solo la restante)", c2?.lineas_recibidas === 1 && c2.unidades_recibidas === 2, d.cerrar);
    afirmar("queda cerrado", d.estado_final === "cerrada", d.estado_final);
    afirmar("la restante entró en el MISMO piso (no en el almacén)", d.piso_final === "2,2" && d.almacen_final === "0", `${d.piso_final} / ${d.almacen_final}`);
    afirmar("dos movimientos de entrada, uno por línea (nada doble)", d.movs_entrada === "2", d.movs_entrada);
  },
);

// ---------------------------------------------------------------------------
correr(
  "D-131 · sin elegir destino entra al almacén, como siempre; un destino desconocido se rechaza",
  `${enviar(ITEMS(["v1", 1]))}
${contar("v1", 1)}
${intento("destino_raro", confirmar("cuarentena"))}
${intento("confirmar", confirmar(undefined))}
${K("almacen", stock("v1", "lim", ":'lim_alm'"))}
${K("piso", stock("v1", "lim", ":'lim_piso'"))}
${K("sub_destino", "(select sububicacion_destino_id = :'lim_alm' from retail.transferencias where id = :'tr')")}`,
  (d) => {
    const r = j(d.destino_raro);
    afirmar("«cuarentena» no es un destino: se rechaza", r?.ok === false && /piso de venta o al almacén/.test(r.msg), d.destino_raro);
    afirmar("confirmar sin destino (la web vieja, Recibir por envío) cierra", res(d.confirmar)?.resultado === "cerrada", d.confirmar);
    afirmar("entra al almacén de Lima", d.almacen === "1" && d.piso === "0", `${d.almacen} / ${d.piso}`);
    afirmar("el destino guardado es el almacén", d.sub_destino === "true", d.sub_destino);
  },
);

// ---------------------------------------------------------------------------
correr(
  "D-131 · el Taller no tiene piso: pedir «piso» entra donde entra siempre",
  `${enviar(ITEMS(["v1", 1]), { hacia: "taller" })}
${contar("v1", 1)}
${intento("confirmar", confirmar("piso_venta"))}
${K("sub_destino", "(select sububicacion_destino_id is not distinct from retail.fn_sububicacion_por_defecto(:'taller', 'traslado_entrada') from retail.transferencias where id = :'tr')")}
${K("stock_taller", stock("v1", "taller", "retail.fn_sububicacion_por_defecto(:'taller', 'traslado_entrada')"))}`,
  (d) => {
    afirmar("se cierra", res(d.confirmar)?.resultado === "cerrada", d.confirmar);
    afirmar("guarda la sububicación de siempre del Taller", d.sub_destino === "true", d.sub_destino);
    afirmar("la prenda está en el Taller, donde entra siempre", d.stock_taller === "1", d.stock_taller);
  },
);

// ---------------------------------------------------------------------------
correr(
  "D-132 · anular: cada prenda vuelve a su sububicación de origen y el traslado queda anulado",
  `${K("transito_antes", "retail.fn_bal_transito(retail.fn_hoy_lima())")}
${enviar(ITEMS(["v1", 2], ["v2", 1]))}
${K("tras_enviar", `${stock("v1", "tru", ":'tru_alm'")} || ',' || ${stock("v2", "tru", ":'tru_alm'")}`)}
${K("transito_enviado", "retail.fn_bal_transito(retail.fn_hoy_lima())")}
${intento("anular", anular("'Se envió a la sede equivocada'"))}
${K("estado", "(select estado || ',' || (anulado_por = :'felipe') || ',' || (anulado_en is not null) || ',' || motivo_anulacion from retail.transferencias where id = :'tr')")}
${K("tras_anular", `${stock("v1", "tru", ":'tru_alm'")} || ',' || ${stock("v2", "tru", ":'tru_alm'")}`)}
${K("movs", `(select count(*) || ',' || bool_and(m.tipo = 'entrada' and m.ubicacion_id = :'tru' and m.sububicacion_id is not distinct from s.sububicacion_id and m.cantidad = s.cantidad)
   from retail.movimientos m join retail.transferencia_items ti on ti.id = m.transferencia_item_id
   join retail.movimientos s on s.id = ti.movimiento_id
   where ti.transferencia_id = :'tr' and m.motivo = 'traslado_anulado')`)}
${K("transito_anulado", "retail.fn_bal_transito(retail.fn_hoy_lima())")}
${COMO_API}select 'K|en_movimientos|' || string_agg(f.categoria || ':' || f.transferencia_numero::text || ':' || f.delta, ',')
  from retail.fn_movimientos(:'tru', p_motivo => 'traslado_anulado') f;
select 'K|filtro_traslados|' || count(*) from retail.fn_movimientos(:'tru', p_categoria => 'transferencia') f where f.motivo = 'traslado_anulado';
select 'K|resumen|' || coalesce(string_agg(r.grupo || ':' || r.entran, ',' order by r.grupo), '')
  from retail.fn_movimientos_resumen_procesos(:'tru') r where r.proceso = 'traslado_anulado';
${COMO_POSTGRES}
${K("numero", "(select numero from retail.transferencias where id = :'tr')")}
${intento("contar_anulado", "format('select retail.registrar_recepcion_traslado(%L::uuid, %L::uuid, 1)::text', :'tr', :'v1')")}
${intento("confirmar_anulado", confirmar("piso_venta"))}`,
  (d) => {
    afirmar("al enviar, sale del almacén de Trujillo (3 y 4)", d.tras_enviar === "3,4", d.tras_enviar);
    afirmar("anular devuelve el id del traslado", j(d.anular)?.ok === true, d.anular);
    afirmar("queda anulada, con quién, cuándo y por qué", d.estado === "anulada,true,true,Se envió a la sede equivocada", d.estado);
    afirmar("el stock vuelve completo al almacén de Trujillo (5 y 5)", d.tras_anular === "5,5", d.tras_anular);
    afirmar("dos entradas traslado_anulado, enlazadas a su línea, en la sububicación y cantidad de su salida", d.movs === "2,true", d.movs);
    afirmar(
      "el Balance lo vio en tránsito al enviarlo y deja de verlo al anular",
      Number(d.transito_enviado) - Number(d.transito_antes) === 120 && Number(d.transito_anulado) === Number(d.transito_antes),
      `${d.transito_antes} → ${d.transito_enviado} → ${d.transito_anulado}`,
    );
    afirmar(
      "Movimientos lo muestra como parte de su traslado (categoría «transferencia», con su número, suma)",
      d.en_movimientos === `transferencia:${d.numero}:2,transferencia:${d.numero}:1` || d.en_movimientos === `transferencia:${d.numero}:1,transferencia:${d.numero}:2`,
      d.en_movimientos,
    );
    afirmar("el filtro «Traslados» lo trae", d.filtro_traslados === "2", d.filtro_traslados);
    afirmar("las tarjetas lo cuentan como entrada y como traslado", d.resumen === "entrada:3,todos:3,transferencia:3", d.resumen);
    const c = j(d.contar_anulado);
    afirmar("no se cuenta un traslado anulado", c?.ok === false && /se anuló/.test(c.msg), d.contar_anulado);
    const f = j(d.confirmar_anulado);
    afirmar("no se confirma un traslado anulado", f?.ok === false && /se anuló/.test(f.msg), d.confirmar_anulado);
  },
);

// ---------------------------------------------------------------------------
correr(
  "D-132 · anular se rechaza: conteo empezado, sin motivo, sede ajena; y el mismo token dos veces no duplica",
  `${enviar(ITEMS(["v1", 1]), { como: "tr" })}
${contar("v1", 0)}
${intento("con_conteo", anular("'me equivoqué'"))}
${K("estado_con_conteo", "(select estado from retail.transferencias where id = :'tr')")}
${enviar(ITEMS(["v1", 1]), { como: "tr2" })}
${intento("sin_motivo", anular("'   '", "tr2"))}
select pg_temp.cargar(:'v2', :'lim', :'lim_alm', 1) as _cl \\gset
${enviar(ITEMS(["v2", 1]), { desde: "lim", hacia: "tru", como: "tr3" })}
${sesion(MICAELA)}
${intento("ajena", anular("'no es mío'", "tr3"))}
${K("estado_ajena", "(select estado from retail.transferencias where id = :'tr3')")}
${enviar(ITEMS(["v2", 2]), { como: "tr4" })}
${intento("propia", anular("'lo envié yo por error'", "tr4"))}
${sesion(FELIPE)}
select gen_random_uuid() as tok \\gset
${intento("token_1", `format('select retail.anular_traslado(%L::uuid, %L, %L::uuid)::text', :'tr2', 'doble clic', :'tok')`)}
${intento("token_2", `format('select retail.anular_traslado(%L::uuid, %L, %L::uuid)::text', :'tr2', 'doble clic', :'tok')`)}
${intento("sin_token", anular("'otra vez'", "tr2"))}
${K("movs_token", "(select count(*) from retail.movimientos m join retail.transferencia_items ti on ti.id = m.transferencia_item_id where ti.transferencia_id = :'tr2' and m.motivo = 'traslado_anulado')")}
${K("stock_v1", stock("v1", "tru", ":'tru_alm'"))}`,
  (d) => {
    const a = j(d.con_conteo);
    afirmar("con un conteo empezado (aunque sea 0) no se anula", a?.ok === false && /ya empezó a contar/.test(a.msg), d.con_conteo);
    afirmar("…y el traslado sigue en camino", d.estado_con_conteo === "en_transito", d.estado_con_conteo);
    const b = j(d.sin_motivo);
    afirmar("sin motivo no se anula", b?.ok === false && /por qué anulas/.test(b.msg), d.sin_motivo);
    const c = j(d.ajena);
    afirmar("Micaela (Trujillo, sede que RECIBE) no anula un envío de Lima", c?.ok === false && c.estado === "42501", d.ajena);
    afirmar("…y el traslado sigue en camino", d.estado_ajena === "en_transito", d.estado_ajena);
    afirmar("Micaela sí anula lo que ella envió desde Trujillo (no hace falta ser líder)", j(d.propia)?.ok === true, d.propia);
    const t1 = j(d.token_1);
    const t2 = j(d.token_2);
    afirmar("el mismo token dos veces devuelve el MISMO id", t1?.ok === true && t2?.ok === true && t1.res === t2.res, `${d.token_1} / ${d.token_2}`);
    const s = j(d.sin_token);
    afirmar("sin token, un segundo intento dice que ya se anuló", s?.ok === false && /ya se anuló/.test(s.msg), d.sin_token);
    afirmar("una sola devolución por línea (nada doble)", d.movs_token === "1", d.movs_token);
    // 5 − 1 (tr, contado en 0 y no anulado) − 1 (tr2, enviado y devuelto una vez) + 1 = 4.
    afirmar("el stock de Trujillo vuelve una sola vez", d.stock_v1 === "4", d.stock_v1);
  },
);

// ---------------------------------------------------------------------------
correr(
  "ADR-0233 · pedido para apartar: se aparta cuando SU línea entra (aunque otra espere) y donde entró",
  `${COMO_API}select retail.pedir_prenda_para_apartar(:'lim', :'tru', :'v1', 1, 'Ana', 'Lozano', '987111222') as ped \\gset
${COMO_POSTGRES}${enviar(ITEMS(["v1", 1], ["v2", 2]))}
-- El pedido viaja en un traslado de dos líneas (hoy \`enviar_pedido_para_apartar\` arma uno de una; la regla es por línea).
update retail.separacion_pedidos set estado = 'en_camino', transferencia_id = :'tr', enviado_por = :'felipe' where id = :'ped';
${contar("v1", 1)}${contar("v2", 1)}
${intento("confirmar", confirmar("piso_venta"))}
${K("pedido", "(select p.estado || ',' || (p.apartado_id is not null) || ',' || (a.sububicacion_id = :'lim_piso') || ',' || a.cantidad from retail.separacion_pedidos p left join retail.apartados a on a.id = p.apartado_id where p.id = :'ped')")}
${K("apartada_en_piso", "(select cantidad_apartada from retail.stock where variante_id = :'v1' and ubicacion_id = :'lim' and sububicacion_id = :'lim_piso')")}
${K("estado", "(select estado from retail.transferencias where id = :'tr')")}
${intento("cerrar", "format('select row_to_json(c)::text from retail.cerrar_traslado_con_diferencia(%L::uuid, null) c', :'tr')")}
${K("pedido_tras_cerrar", "(select estado from retail.separacion_pedidos where id = :'ped')")}`,
  (d) => {
    afirmar("confirmar deja recibido_con_diferencia (v2 no cuadra)", res(d.confirmar)?.resultado === "recibido_con_diferencia" && d.estado === "recibido_con_diferencia", d.confirmar);
    afirmar("el pedido ya «llegó» y quedó apartado 1 en el PISO de Lima (donde entró)", d.pedido === "llego,true,true,1", d.pedido);
    afirmar("el stock del piso lo tiene apartado", d.apartada_en_piso === "1", d.apartada_en_piso);
    afirmar("el cierre del líder no lo toca", j(d.cerrar)?.ok === true && d.pedido_tras_cerrar === "llego", `${d.cerrar} / ${d.pedido_tras_cerrar}`);
  },
);

correr(
  "ADR-0233 · pedido para apartar: si no llegó se cancela al cerrar; al anular vuelve a «pedido» y se envía de nuevo",
  `${COMO_API}select retail.pedir_prenda_para_apartar(:'lim', :'tru', :'v1', 1, 'Ana', 'Lozano', '987111222') as ped \\gset
select retail.enviar_pedido_para_apartar(:'ped', now() + interval '1 day', gen_random_uuid()) as tr \\gset
${COMO_POSTGRES}
${intento("anular", anular("'la clienta cambió de talla'"))}
${K("pedido", "(select estado || ',' || (transferencia_id is null) || ',' || (enviado_por is null) from retail.separacion_pedidos where id = :'ped')")}
${COMO_API}select retail.enviar_pedido_para_apartar(:'ped', now() + interval '1 day', gen_random_uuid()) as tr_nuevo \\gset
${COMO_POSTGRES}
${K("reenviado", "(select (transferencia_id = :'tr_nuevo') || ',' || (:'tr_nuevo' <> :'tr') || ',' || estado from retail.separacion_pedidos where id = :'ped')")}
select :'tr_nuevo' as tr \\gset
${contar("v1", 0)}
${intento("confirmar", confirmar("piso_venta"))}
${intento("cerrar", "format('select row_to_json(c)::text from retail.cerrar_traslado_con_diferencia(%L::uuid, null) c', :'tr')")}
${K("no_llego", "(select estado || ',' || cancelado_motivo from retail.separacion_pedidos where id = :'ped')")}`,
  (d) => {
    afirmar("anular el envío del pedido funciona", j(d.anular)?.ok === true, d.anular);
    afirmar("el pedido vuelve a «pedido», sin traslado ni quién lo envió", d.pedido === "pedido,true,true", d.pedido);
    afirmar("se puede enviar de nuevo, en otro traslado", d.reenviado === "true,true,en_camino", d.reenviado);
    afirmar("contado en 0: el líder cierra y el pedido se cancela («no llegó»)", d.no_llego === "cancelado,La prenda no llegó en el traslado", d.no_llego);
  },
);

// ---------------------------------------------------------------------------
correr(
  "Permisos: una sola firma, nada abierto a anon, la función interna cerrada a todos",
  `${K("firmas_confirmar", "(select string_agg(p.oid::regprocedure::text, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'confirmar_traslado')")}
${K("anon", "has_function_privilege('anon', 'retail.anular_traslado(uuid, text, uuid)', 'execute') or has_function_privilege('anon', 'retail.confirmar_traslado(uuid, text)', 'execute') or has_function_privilege('anon', 'retail.fn_traslado_lineas(uuid)', 'execute')")}
${K("authenticated", "has_function_privilege('authenticated', 'retail.anular_traslado(uuid, text, uuid)', 'execute') and has_function_privilege('authenticated', 'retail.confirmar_traslado(uuid, text)', 'execute')")}
${K("interna", "has_function_privilege('authenticated', 'retail.fn_apartar_pedidos_que_llegaron(uuid, uuid, uuid, integer)', 'execute')")}`,
  (d) => {
    afirmar("confirmar_traslado tiene una sola firma (la vieja se borró)", d.firmas_confirmar === "retail.confirmar_traslado(uuid,text)", d.firmas_confirmar);
    afirmar("anon no ejecuta ninguna", d.anon === "false", d.anon);
    afirmar("authenticated sí", d.authenticated === "true", d.authenticated);
    afirmar("nadie llama directo a fn_apartar_pedidos_que_llegaron", d.interna === "false", d.interna);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones`);
process.exit(fallos === 0 ? 0 : 1);
