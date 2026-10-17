#!/usr/bin/env node
/**
 * Pruebas de la lista de precios de los servicios de afuera (ADR-0400, actividad 8) — migración `20261015172000_produccion_tarifas_de_servicios.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que `guardar_tarifa_servicio` cargue una tarifa NUEVA con vigencia desde hoy (la del mismo día se corrige; la de otro día queda como historia), que la lista
 * (`fn_tarifas_de_servicios`) muestre la vigente de cada fase en el orden de la ruta, que rechace con su hint un proveedor de tela, una fase que no es, un monto de cero…, que
 * solo el líder cargue y lea, que anote la actividad sin el monto, y que lo cargado llegue a «Nueva orden» para sugerirse.
 *
 * USO
 *   node scripts/pruebas/produccion_tarifas.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_tarifas.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_tarifas.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const leer = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION_FASES = leer("20261014154000_produccion_fases_y_tela_de_la_orden.sql");
const MIGRACION_AVANCES = leer("20261014155000_produccion_avance_salida_y_vuelta.sql");
const MIGRACION_ANULAR = leer("20261015160000_produccion_anular_salida_y_vuelta.sql");
const MIGRACION_LISTA = leer("20261015005000_produccion_lista_de_ordenes.sql");
const MIGRACION_TELA = leer("20261015165000_produccion_tela_pendiente_de_la_orden.sql");
const MIGRACION_TARIFAS = leer("20261015172000_produccion_tarifas_de_servicios.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Envolturas que nunca abortan el caso: devuelven «OK» o «<sqlstate>|<hint>|<mensaje>». Un error dentro de una envoltura deshace lo que
// esa llamada escribió (es una subtransacción), igual que lo haría la transacción propia de una RPC.
const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_avance(p_fase, p_lineas, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.deshace(p_avance uuid) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.deshacer_avance(p_avance);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_salida(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_vuelta(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_s(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_salida(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_v(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_vuelta(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.cambiar_quien_fase(p_fase, p_quien, p_prov, p_tarifa, null, null, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: un proveedor de maquila, lino (tela, 5 % de merma) y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_FASES}
set local search_path = retail, public, extensions;
${MIGRACION_AVANCES}
set local search_path = retail, public, extensions;
${MIGRACION_ANULAR}
set local search_path = retail, public, extensions;
${MIGRACION_LISTA}
set local search_path = retail, public, extensions;
${MIGRACION_TELA}
set local search_path = retail, public, extensions;
${MIGRACION_TARIFAS}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Tarifas Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Otro Taller Lista Prueba', 'maquila') returning id as otro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('LI-LINO', 'Lino Lista Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
select v.id as v_ajena from retail.variantes v where v.producto_id <> :'prod' and v.activo order by v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA_AFUERA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.50'`, cantidad_minima: `'50'`,
  fecha_prometida: `(retail.fn_hoy_lima() + 7)::text` });
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA}, ${TALLER("acabado")})`;
const ESPINA_TALLER = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const LINO = `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2'))`;

// La orden abierta y los ids que todos los casos usan: :oid, :f_corte, :f_cost, :f_acab.
const ORDEN = (fases = ESPINA, insumos = "null") => `
select pg_temp.abre(${APERTURA}, ${fases}, ${insumos}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
`;
// [[variante, cantidad], …] → [{variante_id, cantidad}, …]
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
// Una línea de Vuelta.
const VL = (v, buenas, segundas, faltantes, motivo) =>
  `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '${segundas}', 'faltantes', '${faltantes}', 'motivo', ${motivo ? `'${motivo}'` : "null"})`;
// Un campo de una fase de un jsonb de fases (lo que devuelven las funciones de escritura): FASE_DE(:'j'::jsonb, 'corte', ['estado', 'hechas']).
const FASE_DE = (j, clave, campos) =>
  `(select ${campos.map((c) => `coalesce(f ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(${j}) f where f ->> 'clave' = '${clave}')`;
// Un campo de una fase DE LA LECTURA ÚNICA, por variante.
const POR_VARIANTE = (clave, v, campos) =>
  `(select ${campos.map((c) => `coalesce(pv ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f, jsonb_array_elements(f -> 'por_variante') pv
     where f ->> 'clave' = '${clave}' and (pv ->> 'variante_id')::uuid = :'${v}')`;
const ACTIVIDAD = (accion, patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = '${accion}' and a.descripcion like '${patron}')`;
const FILAS_AVANCE = (fase, extra = "") => `(select count(*) from retail.produccion_avances where fase_id = :'${fase}' ${extra})`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// Una llamada a guardar_tarifa_servicio que nunca aborta el caso: «OK» o «<sqlstate>|<hint>».
const ENVOLTURA = `
create function pg_temp.guarda(p_pr uuid, p_fase text, p_tarifa numeric, p_min integer default null, p_fijo numeric default 0, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text;
begin
  perform retail.guardar_tarifa_servicio(p_pr, p_fase, p_tarifa, p_min, p_fijo, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end;
$f$;`;
const FILAS = (id = "maquila") => `(select e from jsonb_array_elements(retail.fn_tarifas_de_servicios()) e where e ->> 'proveedor_id' = :'${id}')`;

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente) y las dos funciones siguen siendo una cada una",
  `${MIGRACION_TARIFAS}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('fn_tarifas_de_servicios','guardar_tarifa_servicio');`,
  "2"
);

// G. GUARDAR --------------------------------------------------------------------------------------------------------------------
caso(
  "G1 una tarifa nueva se guarda con su mínimo, su fijo y su nota, vigente desde hoy, y se ve en la lista; el mismo día la corrige (sigue siendo una versión)",
  `${ENVOLTURA}
   select pg_temp.guarda(:'maquila', 'costura', 4.5, 50, 0, 'precio de lista') as a \\gset
   select concat_ws(',', :'a', ${FILAS()} ->> 'fase_clave', ${FILAS()} ->> 'tarifa_prenda', ${FILAS()} ->> 'cantidad_minima', ${FILAS()} ->> 'fijo_orden', ${FILAS()} ->> 'nota',
     (${FILAS()} ->> 'vigente_desde')::date = retail.fn_hoy_lima(), ${FILAS()} ->> 'versiones') as antes \\gset
   select pg_temp.guarda(:'maquila', 'costura', 4.8, null, 12.5, null) as b \\gset
   select :'antes' || '|' || concat_ws(',', :'b', ${FILAS()} ->> 'tarifa_prenda', coalesce(${FILAS()} ->> 'cantidad_minima', '-'), ${FILAS()} ->> 'fijo_orden', coalesce(${FILAS()} ->> 'nota', '-'), ${FILAS()} ->> 'versiones');`,
  "OK,costura,4.50,50,0.00,precio de lista,t,1|OK,4.80,-,12.50,-,1"
);
caso(
  "G2 una renovación es una fila NUEVA: la de ayer queda como historia (2 versiones) y la lista muestra la de hoy; una con vigencia futura todavía no cuenta",
  `${ENVOLTURA}
   insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, vigente_desde) values (:'maquila', 'costura', 4.0, retail.fn_hoy_lima() - 1);
   insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, vigente_desde) values (:'maquila', 'costura', 9.0, retail.fn_hoy_lima() + 5);
   select concat_ws(',', ${FILAS()} ->> 'tarifa_prenda', ${FILAS()} ->> 'versiones') as antes \\gset
   select pg_temp.guarda(:'maquila', 'costura', 4.6) as a \\gset
   select (select count(*) from retail.proveedor_tarifas where proveedor_id = :'maquila' and fase_clave = 'costura') as filas \\gset
   select concat_ws(',', :'antes', :'a', ${FILAS()} ->> 'tarifa_prenda', ${FILAS()} ->> 'versiones', :filas);`,
  "4.00,1,OK,4.60,2,3"
);
caso(
  "G3 cada fase del mismo servicio tiene su propia tarifa, y la lista las trae en el orden de la ruta (Corte, Bordado, Estampado, Costura, Lavandería, Acabado)",
  `${ENVOLTURA}
   select pg_temp.guarda(:'maquila', 'acabado', 1.2) as a \\gset
   select pg_temp.guarda(:'maquila', 'corte', 0.9) as b \\gset
   select pg_temp.guarda(:'maquila', 'costura', 4.5) as c \\gset
   select string_agg(e ->> 'fase_clave', ',' order by ord) from jsonb_array_elements(retail.fn_tarifas_de_servicios()) with ordinality t(e, ord) where e ->> 'proveedor_id' = :'maquila';`,
  "corte,costura,acabado"
);

// V. LO QUE LA BASE RECHAZA -----------------------------------------------------------------------------------------------------
caso(
  "V1 rechaza, con su hint y sin escribir nada: proveedor que no existe, un proveedor de tela, una fase que no es, una tarifa de cero o negativa, un mínimo de cero y un fijo negativo",
  `${ENVOLTURA}
   insert into retail.proveedores_produccion (nombre, rubro) values ('Textiles Tarifas Prueba', 'tela') returning id as tela_pr \\gset
   select concat_ws(',',
     pg_temp.guarda(gen_random_uuid(), 'costura', 4.5),
     pg_temp.guarda(:'tela_pr', 'costura', 4.5),
     pg_temp.guarda(:'maquila', 'planchado', 4.5),
     pg_temp.guarda(:'maquila', null, 4.5),
     pg_temp.guarda(:'maquila', 'costura', 0),
     pg_temp.guarda(:'maquila', 'costura', -2),
     pg_temp.guarda(:'maquila', 'costura', null),
     pg_temp.guarda(:'maquila', 'costura', 4.5, 0),
     pg_temp.guarda(:'maquila', 'costura', 4.5, null, -1),
     (select count(*) from retail.proveedor_tarifas where proveedor_id = :'maquila'));`,
  "P0001|tarifa_proveedor_inexistente,P0001|tarifa_no_es_servicio,P0001|tarifa_fase_invalida,P0001|tarifa_fase_invalida,P0001|tarifa_monto_invalido,P0001|tarifa_monto_invalido,P0001|tarifa_monto_invalido,P0001|tarifa_minimo_invalido,P0001|tarifa_fijo_invalido,0"
);

// L. SOLO EL LÍDER --------------------------------------------------------------------------------------------------------------
caso(
  "L1 una integrante que no es líder no puede cargar tarifas (42501, tarifa_solo_lider) ni leer la lista (NULL); el líder sí",
  `${ENVOLTURA}
   ${como(MICAELA)}
   select pg_temp.guarda(:'maquila', 'costura', 4.5) as a \\gset
   select coalesce(retail.fn_tarifas_de_servicios()::text, 'NULL') as b \\gset
   ${como(FELIPE)}
   select pg_temp.guarda(:'maquila', 'costura', 4.5) as c \\gset
   select concat_ws(',', :'a', :'b', :'c', jsonb_typeof(retail.fn_tarifas_de_servicios()), (select count(*) from retail.proveedor_tarifas where proveedor_id = :'maquila'));`,
  "42501|tarifa_solo_lider,NULL,OK,array,1"
);

// A. ACTIVIDAD Y SU CONSUMIDOR --------------------------------------------------------------------------------------------------
caso(
  "A1 la actividad anota quién cargó qué tarifa SIN el monto, firmada por el responsable; y la tarifa cargada llega a «Nueva orden» (fn_nueva_orden_opciones) para sugerirse",
  `${ENVOLTURA}
   select pg_temp.guarda(:'maquila', 'costura', 4.75, 50, 0, null) as a \\gset
   select concat_ws(',', :'a',
     (select descripcion from retail.actividad where accion = 'tarifa_servicio_guardada' order by anotado_at desc limit 1),
     (select descripcion ~ '[0-9]' from retail.actividad where accion = 'tarifa_servicio_guardada' order by anotado_at desc limit 1),
     (select persona_id = :'felipe_p' from retail.actividad where accion = 'tarifa_servicio_guardada' order by anotado_at desc limit 1),
     (select t ->> 'tarifa_prenda' from jsonb_array_elements(retail.fn_nueva_orden_opciones(:'taller') -> 'proveedores') p, jsonb_array_elements(p -> 'tarifas') t
       where p ->> 'id' = :'maquila' and t ->> 'fase_clave' = 'costura'));`,
  "OK,cargó la tarifa de Confecciones Tarifas Prueba para Costura,f,t,4.75"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "F1 la forma: las dos son security definer con search_path, authenticated sí y anon no; la de leer es de solo lectura (stable)",
  `reset role;
   select concat_ws(',',
     bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%'),
     bool_and(has_function_privilege('authenticated', p.oid, 'execute')),
     bool_or(has_function_privilege('anon', p.oid, 'execute')),
     (select provolatile = 's' from pg_proc where proname = 'fn_tarifas_de_servicios' and pronamespace = 'retail'::regnamespace))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('fn_tarifas_de_servicios', 'guardar_tarifa_servicio');`,
  "t,t,f,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
