#!/usr/bin/env node
/**
 * Pruebas de Ploteo, la fase de un toque (ADR-0400 act. k y l, paquete R1, actividad 2) — migración
 * `20261019192000_produccion_ploteo_la_fase_de_un_toque.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que Ploteo (la marcada a escala real) se MARQUE «hecha» con un toque, y se pueda deshacer, sin contar prendas; que no entre a la
 * cadena de cantidades (Corte sigue siendo la primera fase que cuenta, con su margen de cortar de más, aunque Ploteo esté antes); que avance, salida
 * y vuelta rechacen una fase que se marca; que un servicio de ploteo cobre por ORDEN (el fijo) y devengue solo cuando se marca; que lo marcado solo se
 * agregue; que aparezca en la línea de tiempo; y que las puertas (módulo + Taller) sean las de siempre.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   E  EL ESQUEMA: la tabla (RLS sin políticas, sin permisos, inmutable), la migración dos veces y desde las funciones de antes, con su candado de md5.
 *   M  MARCAR Y DESHACER: el estado derivado (pendiente → hecha → pendiente), quién es la fase «actual», los rechazos, volver a marcar.
 *   C  LA CADENA: Corte conserva su tope (plan × 1,10) con Ploteo pendiente o marcado, y la fase siguiente recibe lo cortado; avance, salida y vuelta
 *      sobre Ploteo se rechazan con `fase_es_hito`.
 *   S  EL SERVICIO DE PLOTEO: se cobra el fijo por orden, sin tarifa por prenda; la lista de precios; lo devengado solo con la marca; los CHECK.
 *   Q  CAMBIAR QUIÉN: antes de marcar sí; con la marca viva no.
 *   T  LA LÍNEA DE TIEMPO y la actividad: «marcó» y «deshizo la marca».
 *   I  INMUTABLE, P  PUERTAS y F  FORMA.
 *
 * USO
 *   node scripts/pruebas/produccion_ploteo.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_ploteo.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_ploteo.mjs --base otra                 → contra otra base del mismo contenedor
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
const leer = (archivo) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8"));
const MIGRACION = leer("20261019192000_produccion_ploteo_la_fase_de_un_toque.sql");
const MIGRACION_FASES = leer("20261019191000_produccion_fases_nuevas_expandir.sql");
// `fn_produccion_fases_normalizar` tal como la dejó ESTA migración (su sección 8). Una migración posterior que la parche (ADR-0550 acepta «por_definir») cambia su md5, y el candado del
// principio de la migración la rechazaría con «cambió desde que se escribió»: la prueba la repone a su cuerpo de entonces antes de cargarla (ROLLBACK: nada queda).
const NORMALIZAR_DE_ENTONCES = (() => {
  const desde = MIGRACION.indexOf("create or replace function retail.fn_produccion_fases_normalizar(p_fases jsonb)");
  const hasta = MIGRACION.indexOf("\n$$;", desde);
  if (desde < 0 || hasta < 0) throw new Error("no encontré fn_produccion_fases_normalizar en la migración de ploteo");
  return MIGRACION.slice(desde, hasta + 4);
})();
// Las migraciones que dejaron las funciones de fases, avance, cadena, lectura y lista de precios como estaban ANTES (en el orden en que se pegaron).
const ANTERIORES = [
  "20261014154000_produccion_fases_y_tela_de_la_orden.sql",
  "20261014155000_produccion_avance_salida_y_vuelta.sql",
  "20261015160000_produccion_anular_salida_y_vuelta.sql",
  "20261015172000_produccion_tarifas_de_servicios.sql",
]
  .map((a) => `set local search_path = retail, public, extensions;\n${leer(a)}`)
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)

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

// Envolturas que nunca abortan el caso: devuelven «OK:…» o «<sqlstate>|<hint>|<mensaje>».
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
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric, p_fijo numeric, p_min integer, p_fecha date) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.cambiar_quien_fase(p_fase, p_quien, p_prov, p_tarifa, p_fijo, p_min, p_fecha);
  return 'OK:' || (v_r ->> 'quien') || ':' || coalesce(v_r ->> 'tarifa_prenda', '-');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

// Más envolturas: avance, salida y vuelta, y marcar y deshacer la marca.
const ENVOLTURAS_FASE = `
create function pg_temp.llama(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.llama(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.desmarca(p_fase uuid) returns text language sql as $f$ select pg_temp.llama(format('select retail.deshacer_marca_fase(%L)', p_fase)) $f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.llama(format('select retail.registrar_avance(%L, %L::jsonb)', p_fase, p_lineas)) $f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.llama(format('select retail.registrar_salida(%L, %L::jsonb)', p_fase, p_lineas)) $f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.llama(format('select retail.registrar_vuelta(%L, %L::jsonb)', p_fase, p_lineas)) $f$;
`;

// Datos propios: un proveedor de maquila y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${NORMALIZAR_DE_ENTONCES}
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${ENVOLTURAS_FASE}
insert into retail.proveedores_produccion (nombre, rubro) values ('Plotter Ploteo Prueba', 'maquila') returning id as maquila \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const ARREGLO = (...fases) => `jsonb_build_array(${fases.join(", ")})`;
const RESTO = [TALLER("corte"), TALLER("habilitado"), TALLER("costura"), TALLER("limpieza_revision"), TALLER("planchado"), TALLER("etiquetado_embolsado")];
const NUEVA_TALLER = ARREGLO(TALLER("ploteo"), ...RESTO);
const PLOTEO_AFUERA = (extra = {}) => FASE({ clave: `'ploteo'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, fijo_orden: `'40'`, ...extra });
const NUEVA_PLOTEO_AFUERA = ARREGLO(PLOTEO_AFUERA(), ...RESTO);

// La orden abierta y los ids que los casos usan: :oid, :f_plot, :f_corte, :f_hab, :f_cost.
const ORDEN = (fases = NUEVA_TALLER) => `
select pg_temp.abre(${APERTURA}, ${fases}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
`;
// [[variante, cantidad], …] → [{variante_id, cantidad}, …]
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const VL = (v, buenas, segundas, faltantes) =>
  `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '${segundas}', 'faltantes', '${faltantes}')`;
// «clave:estado:actual» de las fases pedidas, en el orden de la ruta.
const ESTADO = (claves) =>
  `(select string_agg((f ->> 'clave') || ':' || (f ->> 'estado') || ':' || (f ->> 'actual'), ' ' order by (f ->> 'secuencia')::int)
      from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' in (${claves.map((c) => `'${c}'`).join(", ")}))`;
const DEVENGADO = (clave) => `(select f ->> 'devengado' from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = '${clave}')`;
// Un campo de una fase DE LA LECTURA ÚNICA, por variante.
const POR_VARIANTE = (clave, v, campos) =>
  `(select ${campos.map((c) => `coalesce(pv ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f, jsonb_array_elements(f -> 'por_variante') pv
     where f ->> 'clave' = '${clave}' and (pv ->> 'variante_id')::uuid = :'${v}')`;
const ACTIVIDAD = (accion, patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = '${accion}' and a.descripcion like '${patron}')`;
const CODIGO = (expr) => `split_part(${expr}, '|', 1)`;

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

const OCURRENCIAS = (firma, texto) =>
  `((length(pg_get_functiondef('${firma}'::regprocedure)) - length(replace(pg_get_functiondef('${firma}'::regprocedure), $q$${texto}$q$, ''))) / length($q$${texto}$q$))`;

// E. EL ESQUEMA ----------------------------------------------------------------------------------------------------------------
caso(
  "E1 la tabla de marcas existe con RLS encendido, sin políticas ni permisos para la API, con su disparador de solo-agregar y su unicidad de «deshace»",
  `reset role;
   select concat_ws(',',
     (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'retail' and c.relname = 'produccion_fase_marcas'),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'produccion_fase_marcas'),
     (has_table_privilege('authenticated', 'retail.produccion_fase_marcas', 'select') or has_table_privilege('anon', 'retail.produccion_fase_marcas', 'select')),
     (select count(*) from pg_trigger where tgname = 'produccion_fase_marcas_inmutable'),
     (select count(*) from pg_constraint where conname = 'produccion_fase_marcas_una_vez'));`,
  "t,0,f,1,1"
);
caso(
  "E2 la migración se vuelve a cargar sin error (idempotente): el disparador sigue siendo uno y cada reemplazo anclado entró una sola vez",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',',
     (select count(*) from pg_trigger where tgname = 'produccion_fase_marcas_inmutable'),
     ${OCURRENCIAS("retail.registrar_avance(uuid,jsonb,text)", "using hint = 'fase_es_hito'")},
     ${OCURRENCIAS("retail.registrar_salida(uuid,jsonb,text,text)", "using hint = 'fase_es_hito'")},
     ${OCURRENCIAS("retail.registrar_vuelta(uuid,jsonb,text,text)", "using hint = 'fase_es_hito'")},
     ${OCURRENCIAS("retail.fn_orden_produccion(uuid)", "from retail.produccion_fase_marcas m")});`,
  "1,1,1,1,1"
);
caso(
  "E3 desde las funciones de antes (154000, 155000, 20261015160000 y 20261015172000 cargadas encima, y después 20261019191000) la migración llega a las nuevas con su candado de md5, y Ploteo se marca",
  `${ANTERIORES}
   set local search_path = retail, public, extensions;
   ${MIGRACION_FASES}
   set local search_path = retail, public, extensions;
   select retail.fn_fase_es_hito('ploteo') as antes_existe \\gset
   ${MIGRACION}
   set local search_path = retail, public, extensions;
   ${como(FELIPE)}
   ${ORDEN()}
   select pg_temp.marca(:'f_plot') as m \\gset
   select concat_ws(',', retail.fn_fase_es_hito('ploteo'), :'r' ~ '^OK:', :'m');`,
  "t,t,OK"
);
caso(
  "E4 el candado de md5 detiene el pegado si una de las funciones que reemplaza tiene otro cuerpo (alguien la parchó aparte): nada se pisa",
  `create or replace function retail.fn_produccion_fase_anterior(p_fase_id uuid) returns uuid language sql stable set search_path = retail, public, extensions
     as $$ select null::uuid $$;
   select pg_temp.llama($mig$${MIGRACION.replace(/\$\$/g, "$m$")}$mig$) as x \\gset
   select (:'x' like '%cambió desde que se escribió esta migración%')::text;`,
  "true"
);

// M. MARCAR Y DESHACER ---------------------------------------------------------------------------------------------------------
caso(
  "M1 Ploteo nace pendiente y «actual»; al marcarlo queda hecha y la «actual» pasa a Corte; al deshacerlo vuelve a pendiente",
  `${ORDEN()}
   select ${ESTADO(["ploteo", "corte"])} as s1 \\gset
   select pg_temp.marca(:'f_plot') as m \\gset
   select ${ESTADO(["ploteo", "corte"])} as s2 \\gset
   select pg_temp.desmarca(:'f_plot') as d \\gset
   select ${ESTADO(["ploteo", "corte"])} as s3 \\gset
   select concat_ws('|', :'s1', :'m', :'s2', :'d', :'s3');`,
  "ploteo:pendiente:true corte:pendiente:false|OK|ploteo:hecha:false corte:pendiente:true|OK|ploteo:pendiente:true corte:pendiente:false"
);
caso(
  "M2 los rechazos: marcar o deshacer una fase que cuenta prendas (fase_no_es_hito), deshacer sin marca (marca_inexistente), marcar dos veces (marca_ya_hecha) y una orden cerrada (orden_cerrada)",
  `${ORDEN()}
   select pg_temp.marca(:'f_corte') as a \\gset
   select pg_temp.desmarca(:'f_corte') as a2 \\gset
   select pg_temp.desmarca(:'f_plot') as b \\gset
   select pg_temp.marca(:'f_plot') as c \\gset
   select pg_temp.marca(:'f_plot') as d \\gset
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select pg_temp.desmarca(:'f_plot') as e \\gset
   select concat_ws(',', pg_temp.eh(:'a'), pg_temp.eh(:'a2'), pg_temp.eh(:'b'), :'c', pg_temp.eh(:'d'), pg_temp.eh(:'e'));`,
  "P0001|fase_no_es_hito,P0001|fase_no_es_hito,P0001|marca_inexistente,OK,P0001|marca_ya_hecha,P0001|orden_cerrada"
);
caso(
  "M3 se puede volver a marcar tras deshacer: tres filas (marca, deshacer, marca), la marca viva es la última y la fase queda hecha",
  `${ORDEN()}
   select pg_temp.marca(:'f_plot') as a \\gset
   select pg_temp.desmarca(:'f_plot') as b \\gset
   select pg_temp.marca(:'f_plot') as c \\gset
   select concat_ws(',', :'a', :'b', :'c',
     (select count(*) from retail.produccion_fase_marcas where fase_id = :'f_plot'),
     retail.fn_produccion_marca_viva(:'f_plot') = (select m.id from retail.produccion_fase_marcas m where m.fase_id = :'f_plot' order by m.created_at desc limit 1),
     ${ESTADO(["ploteo"])});`,
  "OK,OK,OK,3,t,ploteo:hecha:false"
);
caso(
  "M4 una orden donde ya se empezó a cortar sin marcar el ploteo no se queda esperándolo: la «actual» es Corte",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 5])}) as a \\gset
   select concat_ws(',', :'a', ${ESTADO(["ploteo", "corte"])});`,
  "OK,ploteo:pendiente:false corte:en_curso:true"
);

// C. LA CADENA -----------------------------------------------------------------------------------------------------------------
caso(
  "C1 con Ploteo pendiente Corte sigue siendo la primera fase que cuenta: entran hasta plan × 1,10 (33 de 30), el 34 se rechaza, Habilitado recibe lo cortado y Ploteo no recibe nada",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 33])}) as a \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 1])}) as b \\gset
   select concat_ws(',', :'a', pg_temp.eh(:'b'), ${POR_VARIANTE("corte", "v1", ["entrada", "hechas"])}, ${POR_VARIANTE("habilitado", "v1", ["entrada"])},
     ${POR_VARIANTE("ploteo", "v1", ["entrada", "hechas"])});`,
  "OK,P0001|avance_excede,33:33,33,0:0"
);
caso(
  "C2 con Ploteo ya marcado el tope de Corte es el mismo (33 de 30): marcarlo no cambia lo que entra a la cadena",
  `${ORDEN()}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 33])}) as a \\gset
   select concat_ws(',', :'m', :'a', ${POR_VARIANTE("corte", "v1", ["entrada", "hechas"])}, ${POR_VARIANTE("habilitado", "v1", ["entrada"])});`,
  "OK,OK,33:33,33"
);
caso(
  "C3 avance, salida y vuelta sobre Ploteo se rechazan con fase_es_hito, lo haga el Taller o un servicio, y no dejan nada escrito",
  `${ORDEN()}
   select pg_temp.avanza(:'f_plot', ${L(["v1", 5])}) as a1 \\gset
   select pg_temp.sale(:'f_plot', ${L(["v1", 5])}) as a2 \\gset
   select pg_temp.vuelve(:'f_plot', jsonb_build_array(${VL("v1", 5, 0, 0)})) as a3 \\gset
   ${ORDEN(NUEVA_PLOTEO_AFUERA)}
   select pg_temp.avanza(:'f_plot', ${L(["v1", 5])}) as b1 \\gset
   select pg_temp.sale(:'f_plot', ${L(["v1", 5])}) as b2 \\gset
   select pg_temp.vuelve(:'f_plot', jsonb_build_array(${VL("v1", 5, 0, 0)})) as b3 \\gset
   select concat_ws(',', pg_temp.eh(:'a1'), pg_temp.eh(:'a2'), pg_temp.eh(:'a3'), pg_temp.eh(:'b1'), pg_temp.eh(:'b2'), pg_temp.eh(:'b3'),
     (select count(*) from retail.produccion_avances), (select count(*) from retail.produccion_salidas where fase_id = :'f_plot'));`,
  (o) => /^(P0001\|fase_es_hito,){6}\d+,0$/.test(o)
);

// S. EL SERVICIO DE PLOTEO ------------------------------------------------------------------------------------------------------
caso(
  "S1 un servicio de ploteo cobra el fijo por orden y no tarifa por prenda: abre con tarifa NULL y fijo 40; devenga 0 hasta que se marca y 40.00 después (estimado y devengado de la orden también)",
  `${ORDEN(NUEVA_PLOTEO_AFUERA)}
   select (select tarifa_prenda is null and fijo_orden = 40 and quien = 'servicio' and proveedor_id = :'maquila' and cantidad_minima is null
             from retail.produccion_fases where id = :'f_plot') as fila \\gset
   select ${DEVENGADO("ploteo")} as d0 \\gset
   select pg_temp.marca(:'f_plot') as m \\gset
   select ${DEVENGADO("ploteo")} as d1 \\gset
   select concat_ws(',', :'fila', :'d0', :'m', :'d1', (retail.fn_orden_produccion(:'oid') -> 'costos' ->> 'servicios_devengado'),
     (retail.fn_orden_produccion(:'oid') -> 'costos' ->> 'servicios_estimado'));`,
  "t,0,OK,40.00,40.00,40.00"
);
caso(
  "S2 un servicio de ploteo sin fijo no abre (fase_sin_fijo); con una tarifa por prenda escrita se queda sin ella (solo vale el fijo); y copia el fijo de la lista de precios si no se escribe",
  `select pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(FASE({ clave: "'ploteo'", quien: "'servicio'", proveedor_id: ":'maquila'" }), ...RESTO)})) as sin_fijo \\gset
   ${ORDEN(ARREGLO(PLOTEO_AFUERA({ tarifa_prenda: "'5'" }), ...RESTO))}
   select (select tarifa_prenda is null and fijo_orden = 40 from retail.produccion_fases where id = :'f_plot') as sin_tarifa \\gset
   select pg_temp.llama(format('select retail.guardar_tarifa_servicio(%L, ''ploteo'', null, null, 35, null)', :'maquila')) as g \\gset
   select pg_temp.abre(${APERTURA}, ${ARREGLO(FASE({ clave: "'ploteo'", quien: "'servicio'", proveedor_id: ":'maquila'" }), ...RESTO)}) as r2 \\gset
   select (select tarifa_prenda is null and fijo_orden = 35 and cantidad_minima is null from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'ploteo') as de_lista \\gset
   select concat_ws(',', :'sin_fijo', :'sin_tarifa', :'g', :'de_lista');`,
  "P0001|fase_sin_fijo,t,OK,t"
);
caso(
  "S3 la lista de precios del ploteo: solo el fijo por orden (con tarifa por prenda, con cantidad mínima o sin fijo se rechaza con su motivo); las demás fases siguen pidiendo tarifa por prenda",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.llama(format('select retail.guardar_tarifa_servicio(%L, ''ploteo'', 2, null, 35, null)', :'maquila'))),
     pg_temp.eh(pg_temp.llama(format('select retail.guardar_tarifa_servicio(%L, ''ploteo'', null, 100, 35, null)', :'maquila'))),
     pg_temp.eh(pg_temp.llama(format('select retail.guardar_tarifa_servicio(%L, ''ploteo'', null, null, 0, null)', :'maquila'))),
     pg_temp.llama(format('select retail.guardar_tarifa_servicio(%L, ''ploteo'', null, null, 35, null)', :'maquila')),
     pg_temp.eh(pg_temp.llama(format('select retail.guardar_tarifa_servicio(%L, ''planchado'', null, null, 0, null)', :'maquila')))) as r \\gset
   select :'r' || ',' || (select count(*) from retail.proveedor_tarifas where proveedor_id = :'maquila' and fase_clave = 'ploteo' and tarifa_prenda is null and fijo_orden = 35);`,
  "P0001|tarifa_ploteo_es_fijo,P0001|tarifa_ploteo_es_fijo,P0001|tarifa_ploteo_sin_fijo,OK,P0001|tarifa_monto_invalido,1"
);
caso(
  "S4 los CHECK de la base: un servicio de ploteo sin fijo ni tarifa, o una fase que no es ploteo sin tarifa por prenda, se rechazan (23514); con fijo se acepta; igual en la lista de precios",
  `${ORDEN()}
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set quien = ''servicio'', proveedor_id = %L, tarifa_prenda = null, fijo_orden = 0 where id = %L', :'maquila', :'f_plot'))`)} as c1 \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set quien = ''servicio'', proveedor_id = %L, tarifa_prenda = null, fijo_orden = 10 where id = %L', :'maquila', :'f_corte'))`)} as c2 \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set quien = ''servicio'', proveedor_id = %L, tarifa_prenda = null, fijo_orden = 10 where id = %L', :'maquila', :'f_plot'))`)} as c3 \\gset
   select ${CODIGO(`pg_temp.llama(format('insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, fijo_orden) values (%L, ''ploteo'', null, 0)', :'maquila'))`)} as t1 \\gset
   select ${CODIGO(`pg_temp.llama(format('insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, fijo_orden) values (%L, ''ploteo'', null, 5)', :'maquila'))`)} as t2 \\gset
   select ${CODIGO(`pg_temp.llama(format('insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, fijo_orden) values (%L, ''corte'', null, 5)', :'maquila'))`)} as t3 \\gset
   select concat_ws(',', :'c1', :'c2', :'c3', :'t1', :'t2', :'t3');`,
  "23514,23514,OK,23514,OK,23514"
);

// Q. CAMBIAR QUIÉN -------------------------------------------------------------------------------------------------------------
caso(
  "Q1 el ploteo pasa a un servicio con su fijo antes de marcarse; marcado ya empezó (fase_empezada); deshecho vuelve a poder cambiar",
  `${ORDEN()}
   select pg_temp.cambia(:'f_plot', 'servicio', :'maquila', null, 30, null, null) as c1 \\gset
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.cambia(:'f_plot', 'taller', null, null, null, null, null) as c2 \\gset
   select pg_temp.desmarca(:'f_plot') as d \\gset
   select pg_temp.cambia(:'f_plot', 'taller', null, null, null, null, null) as c3 \\gset
   select concat_ws(',', :'c1', :'m', pg_temp.eh(:'c2'), :'d', :'c3');`,
  "OK:servicio:-,OK,P0001|fase_empezada,OK,OK:taller:-"
);

// T. LA LÍNEA DE TIEMPO Y LA ACTIVIDAD ------------------------------------------------------------------------------------------
caso(
  "T1 la línea de tiempo de la orden suma «marca» y «desmarca» (la más reciente primero), la fase sale con hito y marcada, y la actividad anota lo marcado y lo deshecho sin montos",
  `${ORDEN()}
   select pg_temp.marca(:'f_plot') as a \\gset
   select pg_temp.desmarca(:'f_plot') as b \\gset
   select pg_temp.marca(:'f_plot') as c \\gset
   select concat_ws(',',
     (select count(*) from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'linea_de_tiempo') e where e ->> 'tipo' = 'marca'),
     (select count(*) from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'linea_de_tiempo') e where e ->> 'tipo' = 'desmarca'),
     (retail.fn_orden_produccion(:'oid') -> 'linea_de_tiempo' -> 0 ->> 'tipo'),
     (select (f ->> 'hito') || ':' || (f ->> 'marcada') from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f where f ->> 'clave' = 'ploteo'),
     (select (f ->> 'hito') || ':' || (f ->> 'marcada') from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f where f ->> 'clave' = 'corte'),
     ${ACTIVIDAD("produccion_fase_marcada", "marcó Ploteo como hecho%")},
     ${ACTIVIDAD("produccion_fase_desmarcada", "deshizo la marca de Ploteo%")});`,
  "2,1,marca,true:true,false:false,2,1"
);

// I. INMUTABLE -----------------------------------------------------------------------------------------------------------------
caso(
  "I1 una marca no se edita ni se borra (42501); una marca solo se deshace una vez (23505 si se intenta una segunda fila que la deshaga)",
  `${ORDEN()}
   select pg_temp.marca(:'f_plot') as m \\gset
   select id as marca_id from retail.produccion_fase_marcas where fase_id = :'f_plot' \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fase_marcas set nota = ''x'' where id = %L', :'marca_id'))`)} as u \\gset
   select ${CODIGO(`pg_temp.llama(format('delete from retail.produccion_fase_marcas where id = %L', :'marca_id'))`)} as d \\gset
   select pg_temp.llama(format('insert into retail.produccion_fase_marcas (fase_id, deshace_id, hecho_por) values (%L, %L, %L)', :'f_plot', :'marca_id', :'felipe_p')) as i1 \\gset
   select ${CODIGO(`pg_temp.llama(format('insert into retail.produccion_fase_marcas (fase_id, deshace_id, hecho_por) values (%L, %L, %L)', :'f_plot', :'marca_id', :'felipe_p'))`)} as i2 \\gset
   select concat_ws(',', :'u', :'d', :'i1', :'i2');`,
  "42501,42501,OK,23505"
);

// P. PUERTAS -------------------------------------------------------------------------------------------------------------------
caso(
  "P1 una integrante de Trujillo (sin el módulo, o parada en otra sede) no marca ni deshace (42501) y no deja nada escrito",
  `${ORDEN()}
   ${como(MICAELA)}
   select ${CODIGO("pg_temp.marca(:'f_plot')")} as a \\gset
   select ${CODIGO("pg_temp.desmarca(:'f_plot')")} as b \\gset
   select concat_ws(',', :'a', :'b', (select count(*) from retail.produccion_fase_marcas));`,
  "42501,42501,0"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
const DE = (nombres) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in (${nombres})`;
caso(
  "F1 marcar y deshacer son security definer con search_path y abiertas a authenticated (anon no); las dos internas (fn_fase_es_hito y la marca viva) están cerradas a la API",
  `reset role;
   select concat_ws(',',
     (select count(*) ${DE("'marcar_fase_hecha','deshacer_marca_fase'")}),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%' and has_function_privilege('authenticated', p.oid, 'execute')
                      and not has_function_privilege('anon', p.oid, 'execute')) ${DE("'marcar_fase_hecha','deshacer_marca_fase'")}),
     (select count(*) ${DE("'fn_fase_es_hito','fn_produccion_marca_viva'")}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE("'fn_fase_es_hito','fn_produccion_marca_viva'")}));`,
  "2,t,2,f"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
