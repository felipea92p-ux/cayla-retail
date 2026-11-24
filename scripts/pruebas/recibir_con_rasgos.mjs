#!/usr/bin/env node
/**
 * Prueba de Recibir con lo que la prenda tiene (`20261124180000_prenda_con_rasgos_al_recibir.sql`, ADR-0700, actividad 4 de 6).
 *
 * QUÉ CUBRE
 *   · el envío trae, por cada línea, las casillas que marcó quien compró y el precio que vio afuera (y nada en una línea sin ellas);
 *   · al recibir una prenda NUEVA de una línea con casillas, la prenda se queda con ellas; la tela que nadie marcó queda «por su tejido»,
 *     y la marca sale siempre de la lista (no se guarda);
 *   · una línea sin casillas no deja fila;
 *   · una prenda que YA tiene lo suyo (Catálogo) no se pisa al recibirla otra vez;
 *   · lo que la prenda tiene en efecto (`fn_rasgos_de_producto`): lo guardado, la tela por el tejido y la marca por la lista;
 *   · nadie lee ni escribe la tabla directo.
 *
 * CÓMO. Como `costo_por_prenda.mjs`: órdenes propias, Felipe (líder y Admin) envía, Micaela (con un rol que solo ve Recibir, de turno en
 * Trujillo) abre y prepara. Cada escenario en su transacción con ROLLBACK: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:recibir-con-rasgos    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
const como = (auth) =>
  `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;
const EN_TIENDA = `select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
const SIN_ENCABEZADOS = `select set_config('request.headers', '', true) \\g /dev/null\n`;
const atrapa = (nombre, firma, llamada) => `
create function pg_temp.${nombre}(${firma}) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return (${llamada})::jsonb;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('error', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
grant execute on function pg_temp.${nombre}(${firma.replace(/p_\w+ /g, "")}) to authenticated;`;
const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const MATRIZ = (...pares) => A(...pares.map(([t, c]) => J({ talla_id: `:'${t}'`, color_codigo: `:'${c}'` })));

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
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
grant execute on function pg_temp.intento(text) to authenticated;
create function pg_temp.e(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then (p ->> 'error') || '|' || coalesce(p ->> 'hint', '') || '|' || (p ->> 'msg') else 'OK' end;
$f$;
grant execute on function pg_temp.e(jsonb) to authenticated;
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa(
  "prepara",
  "p_d uuid, p_item uuid, p_cat uuid, p_marca uuid, p_prod uuid, p_ref text, p_vars jsonb, p_precio numeric, p_desc text, p_tej uuid, p_pat uuid, p_conf boolean, p_token uuid, p_prov uuid",
  "retail.preparar_prenda_al_recibir(p_d, p_item, p_cat, p_marca, p_prod, p_ref, p_vars, p_precio, p_desc, p_tej, p_pat, p_conf, p_token, p_prov)",
)}

select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Rasgos Recibir') returning id as prov \\gset
insert into retail.marcas (nombre, conocida) values ('Marca Rasgos Recibir', true) returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Blusas Rasgos Recibir', 'accesorios') returning id as cat \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s'), (:'cat', :'t_m');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select id as tejido from retail.tejidos where activo and estado = 'aprobado' order by nombre limit 1 \\gset
update retail.tejidos set se_nota = true where id = :'tejido';
insert into retail.categoria_tejidos (categoria_id, tejido_id) values (:'cat', :'tejido') on conflict do nothing;
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
-- Una prenda del catálogo que ya tiene lo suyo (Catálogo le dijo que no a todo).
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Blusa Catálogo Rasgos', :'marca', :'prov') returning id as prod_p \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod_p', :'t_s', :'c1', 79.90, 25);
insert into retail.producto_rasgos (producto_id, nadie_la_tiene, en_tendencia, tela_que_se_nota) values (:'prod_p', false, false, false);
-- La orden: l1 con casillas y precio visto, l2 sin nada, l3 con casillas para la prenda del catálogo.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario, rasgos, precio_visto_afuera)
  values (:'o1', 1, :'cat', :'marca', 'Blusa en tendencia', 3, 30, '{nadie_la_tiene,en_tendencia}', 79.90) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 2, :'cat', :'marca', 'Blusa lisa', 2, 20) returning id as l2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario, rasgos)
  values (:'o1', 3, :'cat', :'marca', 'Blusa del catálogo', 2, 25, '{en_tendencia}') returning id as l3 \\gset
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null

-- Felipe envía, Micaela (solo Recibir) abre.
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.crear_envio(:'tru', ${A(J({ orden_compra_item_id: ":'l1'", cantidad: 3 }), J({ orden_compra_item_id: ":'l2'", cantidad: 2 }), J({ orden_compra_item_id: ":'l3'", cantidad: 2 }))}, 'T001-77', null, null) ->> 'despacho_id') as envio \\gset
reset role;
select version as v_envio from retail.despachos where id = :'envio' \\gset
select id as di_l1 from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l1' \\gset
select id as di_l2 from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l2' \\gset
select id as di_l3 from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l3' \\gset
insert into retail.roles (nombre) values ('ZZ Prueba rasgos ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'recibir');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela_p';
${como(MICAELA)}${EN_TIENDA}
select pg_temp.e(pg_temp.abre(:'envio', :v_envio)) as abierto \\gset
`;

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter((l) => l !== "") : []);

let casos = 0;
let fallos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 800)}`);
  }
}

// 1. El envío trae las casillas y el precio visto de cada línea.
{
  const r = correr(`select :'abierto';
select coalesce((x -> 'rasgos')::text, '-') || '|' || coalesce(x ->> 'precio_visto_afuera', '-')
  from jsonb_array_elements(retail.fn_envio_detalle(:'envio') -> 'lineas') x
 order by x ->> 'descripcion';`);
  const [abierto, catalogo, enTendencia, lisa] = lineas(r);
  esperar("(preparación) Micaela abre el envío", r.ok && abierto === "OK", r);
  esperar("la línea con casillas las trae, con el precio visto", r.ok && enTendencia === '["nadie_la_tiene", "en_tendencia"]|79.90', r);
  esperar("la línea sin nada trae nulo", r.ok && lisa === "null|-", r);
  esperar("la de la prenda del catálogo trae las suyas", r.ok && catalogo === '["en_tendencia"]|-', r);
}

// 2. Recibir una prenda nueva: se queda con las casillas de su línea; la tela, por su tejido; la marca, por la lista.
{
  const r = correr(`select pg_temp.prepara(:'envio', :'di_l1', null, null, null, 'Blusa Tendencia Rasgos', ${MATRIZ(["t_s", "c1"])}, 64.90, null, :'tejido', null, false, gen_random_uuid(), null) as prep \\gset
select pg_temp.e(:'prep'::jsonb);
reset role;
select (:'prep'::jsonb ->> 'producto_id') as nueva \\gset
select nadie_la_tiene || '|' || en_tendencia || '|' || coalesce(tela_que_se_nota::text, 'por el tejido') from retail.producto_rasgos where producto_id = :'nueva';
${como(MICAELA)}
select array_to_string(retail.fn_rasgos_de_producto(:'nueva'), ',');`);
  const [prep, fila, efecto] = lineas(r);
  esperar("la prenda nueva se crea", r.ok && prep === "OK", r);
  esperar("y guarda lo que marcó quien compró, con la tela por su tejido", r.ok && fila === "true|true|por el tejido", r);
  esperar("en efecto: las dos casillas, la tela por el tejido y la marca por la lista", r.ok && efecto === "nadie_la_tiene,en_tendencia,tela_que_se_nota,marca_conocida", r);
}

// 3. Una línea sin casillas no deja fila; la prenda solo tiene lo que dan las listas.
{
  const r = correr(`select pg_temp.prepara(:'envio', :'di_l2', null, null, null, 'Blusa Lisa Rasgos', ${MATRIZ(["t_s", "c1"])}, 39.90, null, null, null, false, gen_random_uuid(), null) as prep \\gset
select pg_temp.e(:'prep'::jsonb);
reset role;
select (:'prep'::jsonb ->> 'producto_id') as nueva \\gset
select count(*) from retail.producto_rasgos where producto_id = :'nueva';
${como(MICAELA)}
select array_to_string(retail.fn_rasgos_de_producto(:'nueva'), ',');`);
  const [prep, filas, efecto] = lineas(r);
  esperar("la prenda sin casillas se crea", r.ok && prep === "OK", r);
  esperar("y no deja fila", r.ok && filas === "0", r);
  esperar("en efecto: solo la marca, por la lista", r.ok && efecto === "marca_conocida", r);
}

// 4. Una prenda que ya tiene lo suyo no se pisa al recibirla de una línea con casillas.
{
  const r = correr(`select pg_temp.e(pg_temp.prepara(:'envio', :'di_l3', null, null, :'prod_p', null, ${MATRIZ(["t_m", "c1"])}, null, null, null, null, false, gen_random_uuid(), null));
reset role;
select nadie_la_tiene || '|' || en_tendencia || '|' || coalesce(tela_que_se_nota::text, 'por el tejido') from retail.producto_rasgos where producto_id = :'prod_p';`);
  const [prep, fila] = lineas(r);
  esperar("la prenda del catálogo suma su talla", r.ok && prep === "OK", r);
  esperar("y conserva lo que le dijo Catálogo", r.ok && fila === "false|false|false", r);
}

// 5. Nadie toca la tabla directo; anon no pregunta lo que tiene una prenda.
{
  const r = correr(`select pg_temp.intento($q$select count(*) from retail.producto_rasgos$q$);
reset role;
set local role anon;
select pg_temp.intento(format('select retail.fn_rasgos_de_producto(%L)', :'prod_p'));`);
  const [lee, anon] = lineas(r);
  esperar("una cuenta no lee la tabla directo", r.ok && lee?.startsWith("42501|"), r);
  esperar("anon no pregunta", r.ok && anon?.startsWith("42501|"), r);
}

console.log(`\n${casos - fallos} de ${casos} casos bien.`);
if (fallos > 0) process.exit(1);
