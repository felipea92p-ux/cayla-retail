#!/usr/bin/env node
/**
 * Pruebas del catálogo de procesos (ADR-0570, actividad 5) — migración `20261029210000_produccion_catalogo_de_procesos.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que los pasos de una orden salgan de un catálogo y no de listas escritas a mano: los doce de siempre con su MISMO lugar en la ruta
 * (la CHECK de `produccion_fases` sigue valiendo), «Pegar cierre» sembrado, Lavandería como «Lavado o teñido», y las dos tablas atadas con llave
 * foránea. Que solo un líder da de alta o cambia un proceso, que el nuevo cae entre sus vecinos sin chocar, que lo de la espina no se apaga y que lo
 * apagado no entra a una orden ni a una tarifa. Y que lo que lleva cada modelo vive en `producto_procesos`, también los ojales de antes.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * QUÉ PRUEBA
 *   K  EL CATÁLOGO: lo sembrado, los números de siempre, la llave foránea, la lista para la web.
 *   A  EL ALTA: solo líder, el lugar entre vecinos, sin lugar, la clave que sale del nombre, nombre repetido o vacío, renombrar, apagar, la espina.
 *   O  LA ORDEN: abrir con «Pegar cierre», agregar un proceso propio, uno apagado no entra, la tarifa de un proceso propio.
 *   M  EL MODELO: `guardar_proceso_modelo`, los ojales de antes pasan por la tabla nueva y se copian.
 *   S  LA FORMA: se vuelve a cargar encima sin error ni duplicados.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos líderes dando de alta a la vez (un candado de todo el catálogo, como el de cada orden), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/produccion_catalogo_de_procesos.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_catalogo_de_procesos.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_catalogo_de_procesos.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261029210000_produccion_catalogo_de_procesos.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)
const SIN_CUENTA = "22222222-2222-4222-8222-0000000000ff"; // una sesión que no es de nadie: no ve ningún módulo

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
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create table pg_temp.clave (c text);
create function pg_temp.alta(p_nombre text, p_despues text default null, p_quien text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_c text;
begin
  v_c := retail.guardar_proceso_produccion(p_nombre, null, p_despues, null, p_quien, null);
  delete from pg_temp.clave; insert into pg_temp.clave values (v_c);
  return 'OK:' || v_c;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '');
end;
$f$;
create function pg_temp.cambia(p_clave text, p_nombre text, p_activo boolean default null) returns text language sql as $f$
  select pg_temp.eh(pg_temp.intento(format('select retail.guardar_proceso_produccion(%L, %L, null, null, null, %L)', p_nombre, p_clave, p_activo))) $f$;
create function pg_temp.agrega(p_oid uuid, p_clave text) returns text language sql as $f$
  select pg_temp.eh(pg_temp.intento(format('select retail.agregar_paso_orden(%L, %L)', p_oid, p_clave))) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
-- Antes de la migración: un modelo que ya dijo que lleva ojales (lo que guardaba producto_taller).
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null)
  order by p.created_at limit 1 \\gset
select p.id as prod2 from retail.productos p where p.es_prueba is not true and p.id <> :'prod' order by p.created_at limit 1 \\gset
select v.id as v1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.id limit 1 \\gset
insert into retail.producto_taller (producto_id, lleva_ojales_botones) values (:'prod2', true)
  on conflict (producto_id) do update set lleva_ojales_botones = true;
${MIGRACION}
insert into retail.proveedores_produccion (nombre, rubro) values ('Maquila Catálogo Prueba', 'maquila') returning id as prov \\gset
${como(FELIPE)}
`;

const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '10')))`;
const T = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const RUTA_NUEVA = (...extra) => `jsonb_build_array(${["ploteo", "corte", "habilitado", "costura", "planchado", ...extra].map(T).join(", ")})`;
const ABRE = (fases = RUTA_NUEVA()) => `select pg_temp.abre(${APERTURA}, ${fases}) as r \\gset
   select id as oid from pg_temp.ultima \\gset`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// K. EL CATÁLOGO -------------------------------------------------------------------------------------------------------------------
caso(
  "K1 los doce de siempre con su MISMO lugar en la ruta (los números de antes), «Pegar cierre» en 32 y Lavandería como «Lavado o teñido»",
  `select concat_ws(',', (select count(*) from retail.procesos_produccion),
     (select string_agg(clave || '=' || retail.fn_fase_secuencia(clave, case when secuencia_pieza is null then null else 'prenda' end), ' ' order by secuencia) from retail.procesos_produccion),
     retail.fn_fase_secuencia('bordado', 'pieza'), retail.fn_fase_secuencia('estampado', 'pieza'), coalesce(retail.fn_fase_secuencia('bordado', null)::text, 'null'),
     retail.fn_fase_nombre('lavanderia'), retail.fn_fase_nombre('no_existe'));`,
  "13,ploteo=5 corte=10 habilitado=15 costura=30 pegar_cierre=32 ojales_botones=35 bordado=40 estampado=45 lavanderia=50 limpieza_revision=55 acabado=60 planchado=65 etiquetado_embolsado=70,20,25,null,Lavado o teñido,no_existe"
);
caso(
  "K2 la llave foránea: una fase o una tarifa con un proceso que no existe no entra (23503); los dos CHECK de antes ya no están",
  `${ABRE()}
   select concat_ws(',',
     pg_temp.eh(pg_temp.intento(format('insert into retail.produccion_fases (produccion_id, clave, secuencia, quien) values (%L, %L, 33, %L)', :'oid', 'inventado', 'taller'))),
     pg_temp.eh(pg_temp.intento(format('insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, vigente_desde) values (%L, %L, 1, current_date)', :'prov', 'inventado'))),
     (select count(*) from pg_constraint where conname in ('produccion_fases_clave_check', 'proveedor_tarifas_fase_clave_check')));`,
  "23503|,23503|,0"
);
caso(
  "K3 la lista para la web: los trece en el orden de la ruta (bordado entra por su lugar sobre pieza), con cuántas fases los usan; sin Producción no se lee",
  `${ABRE()}
   select concat_ws(',', jsonb_array_length(retail.fn_procesos_produccion()),
     (select string_agg(e ->> 'clave', ' ') from jsonb_array_elements(retail.fn_procesos_produccion()) e),
     (select e ->> 'usos' from jsonb_array_elements(retail.fn_procesos_produccion()) e where e ->> 'clave' = 'costura'));
   ${como(SIN_CUENTA)}
   select pg_temp.eh(pg_temp.intento('select retail.fn_procesos_produccion()'));`,
  "42501|produccion_sin_modulo"
);
caso(
  "K4 (la lista, vista por el líder)",
  `${ABRE()}
   select concat_ws(',', jsonb_array_length(retail.fn_procesos_produccion()),
     (select string_agg(e ->> 'clave', ' ') from jsonb_array_elements(retail.fn_procesos_produccion()) e),
     (select e ->> 'usos' from jsonb_array_elements(retail.fn_procesos_produccion()) e where e ->> 'clave' = 'costura'));`,
  "13,ploteo corte habilitado bordado estampado costura pegar_cierre ojales_botones lavanderia limpieza_revision acabado planchado etiquetado_embolsado,1"
);

// A. EL ALTA ---------------------------------------------------------------------------------------------------------------------
caso(
  "A1 el líder da de alta «Teñido en frío» después de Costura: cae en 31 (entre Costura y Pegar cierre), la clave sale del nombre sin tildes, nace activo y en la hoja; otro más ahí ya no tiene lugar",
  `select pg_temp.alta('  Teñido   en frío ', 'costura', 'servicio') as a \\gset
   select concat_ws(',', :'a', (select secuencia || ':' || nombre || ':' || ruta || ':' || activo || ':' || en_la_hoja || ':' || quien_sugerido || ':' || espina || ':' || hito
                                  from retail.procesos_produccion where clave = 'tenido_en_frio'),
     pg_temp.alta('Otro más', 'costura'), pg_temp.alta('Otro más', 'tenido_en_frio'));`,
  "OK:tenido_en_frio,31:Teñido en frío:ambas:true:true:servicio:false:false,P0001|proceso_sin_lugar,P0001|proceso_sin_lugar"
);
caso(
  "A2 después del último (Etiquetar y embolsar, 70) cae en 75; sin decir dónde, después de Costura; una clave que ya existe lleva su número; el mismo nombre con mayúsculas o signos es repetido",
  `select pg_temp.alta('Control final', 'etiquetado_embolsado') as a1 \\gset
   select pg_temp.alta('Remallado') as a2 \\gset
   select pg_temp.alta('Control-final 2', 'planchado') as a3 \\gset
   select pg_temp.alta('CONTROL FINAL!', 'ploteo') as a4 \\gset
   select concat_ws(',', :'a1', (select secuencia from retail.procesos_produccion where clave = 'control_final'),
     :'a2', (select secuencia from retail.procesos_produccion where clave = 'remallado'), :'a3', :'a4');`,
  "OK:control_final,75,OK:remallado,31,OK:control_final_2,P0001|proceso_repetido"
);
caso(
  "A3 los rechazos: quien no es líder (42501), nombre vacío o de más de 40, un «después de» que no existe, quién lo hace inválido",
  `select concat_ws(',', pg_temp.alta(''), pg_temp.alta(repeat('x', 41)), pg_temp.alta('Algo', 'no_existe'), pg_temp.alta('Algo', 'costura', 'vecino'));
   ${como(MICAELA)}
   select pg_temp.alta('Algo', 'costura');`,
  "42501|proceso_solo_lider"
);
caso(
  "A4 (los rechazos del líder)",
  `select concat_ws(',', pg_temp.alta(''), pg_temp.alta(repeat('x', 41)), pg_temp.alta('Algo', 'no_existe'), pg_temp.alta('Algo', 'costura', 'vecino'));`,
  "P0001|proceso_nombre_invalido,P0001|proceso_nombre_invalido,P0001|proceso_sin_lugar,P0001|proceso_quien_invalido"
);
caso(
  "A5 renombrar y apagar: Pegar cierre pasa a «Pegar cremallera» y se apaga (su lugar no cambia); Costura (espina) no se apaga; un nombre que ya existe no; uno que no existe tampoco",
  `select pg_temp.cambia('pegar_cierre', 'Pegar cremallera', false) as c1 \\gset
   select (select nombre || ':' || activo || ':' || secuencia from retail.procesos_produccion where clave = 'pegar_cierre') as e1 \\gset
   select concat_ws(',', pg_temp.cambia('costura', 'Costura', false), pg_temp.cambia('pegar_cierre', 'Planchado'), pg_temp.cambia('no_existe', 'Algo')) as c2 \\gset
   select pg_temp.cambia('pegar_cierre', 'Pegar cremallera', true) as c3 \\gset
   select concat_ws(',', :'c1', :'e1', :'c2', :'c3', (select activo::text from retail.procesos_produccion where clave = 'pegar_cierre'));`,
  "SIN_ERROR|,Pegar cremallera:false:32,P0001|proceso_espina,P0001|proceso_repetido,P0001|proceso_inexistente,SIN_ERROR|,true"
);

// O. LA ORDEN --------------------------------------------------------------------------------------------------------------------
caso(
  "O1 una orden nueva con Pegar cierre: la fase queda en 32, entre Costura y Planchado",
  `${ABRE(RUTA_NUEVA("pegar_cierre"))}
   select concat_ws(',', :'r', (select string_agg(clave || '=' || secuencia, ' ' order by secuencia) from retail.produccion_fases where produccion_id = :'oid'));`,
  "OK,ploteo=5 corte=10 habilitado=15 costura=30 pegar_cierre=32 planchado=65"
);
caso(
  "O2 un proceso propio se agrega a una orden abierta; apagado ya no entra (proceso_apagado), aunque siga en la ruta de las que ya lo llevaban",
  `${ABRE()}
   select pg_temp.alta('Teñido en frío', 'costura') as a \\gset
   select pg_temp.agrega(:'oid', 'tenido_en_frio') as g1 \\gset
   select (select string_agg(clave || '=' || secuencia, ' ' order by secuencia) from retail.produccion_fases where produccion_id = :'oid') as ruta \\gset
   select pg_temp.cambia('pegar_cierre', 'Pegar cierre', false) as c1 \\gset
   select concat_ws(',', pg_temp.agrega(:'oid', 'pegar_cierre'), pg_temp.agrega(:'oid', 'inventado')) as g2 \\gset
   select pg_temp.cambia('tenido_en_frio', 'Teñido en frío', false) as c2 \\gset
   select concat_ws(',', :'g1', :'ruta', :'c1', :'g2', :'c2', (select count(*) from retail.produccion_fases where produccion_id = :'oid' and clave = 'tenido_en_frio'));`,
  "SIN_ERROR|,ploteo=5 corte=10 habilitado=15 costura=30 tenido_en_frio=31 planchado=65,SIN_ERROR|,P0001|proceso_apagado,P0001|proceso_apagado,SIN_ERROR|,1"
);
caso(
  "O3 un proceso propio no cambia la ruta: con solo la ruta anterior y un propio, sigue siendo la anterior (no pide Ploteo)",
  `select pg_temp.alta('Teñido en frío', 'costura') as a \\gset
   ${ABRE(`jsonb_build_array(${["corte", "costura", "tenido_en_frio", "acabado"].map(T).join(", ")})`)}
   select :'r';`,
  "OK"
);
caso(
  "O4 la tarifa de un proceso propio se guarda y sale en la lista en el orden de la ruta; la de uno apagado no (tarifa_fase_invalida)",
  `select pg_temp.alta('Teñido en frío', 'costura') as a \\gset
   select pg_temp.eh(pg_temp.intento(format('select retail.guardar_tarifa_servicio(%L, %L, 2.5)', :'prov', 'tenido_en_frio'))) as t1 \\gset
   select pg_temp.eh(pg_temp.intento(format('select retail.guardar_tarifa_servicio(%L, %L, 1.5)', :'prov', 'corte'))) as t2 \\gset
   select (select string_agg(e ->> 'fase_clave', ' ') from jsonb_array_elements(retail.fn_tarifas_de_servicios()) e where e ->> 'proveedor_id' = :'prov') as lista \\gset
   select pg_temp.cambia('pegar_cierre', 'Pegar cierre', false) as c1 \\gset
   select concat_ws(',', :'t1', :'t2', :'lista', :'c1',
     pg_temp.eh(pg_temp.intento(format('select retail.guardar_tarifa_servicio(%L, %L, 1)', :'prov', 'pegar_cierre'))));`,
  "SIN_ERROR|,SIN_ERROR|,corte tenido_en_frio,SIN_ERROR|,P0001|tarifa_fase_invalida"
);

// M. EL MODELO -------------------------------------------------------------------------------------------------------------------
caso(
  "M1 los ojales de antes se copiaron a producto_procesos; guardar_proceso_modelo anota Pegar cierre (y la segunda vez igual no cambia nada); la de ojales pasa por la tabla nueva",
  `select (select lleva from retail.producto_procesos where producto_id = :'prod2' and proceso_clave = 'ojales_botones')::text as m0 \\gset
   select retail.guardar_proceso_modelo(:'taller', :'prod', 'pegar_cierre', true)::text as m1 \\gset
   select retail.guardar_proceso_modelo(:'taller', :'prod', 'pegar_cierre', true)::text as m2 \\gset
   select retail.guardar_ojales_botones_modelo(:'taller', :'prod', false)::text as m3 \\gset
   select concat_ws(',', :'m0', :'m1', :'m2', :'m3',
     (select string_agg(proceso_clave || '=' || lleva, ' ' order by proceso_clave) from retail.fn_procesos_de_modelos() where producto_id = :'prod'),
     (select string_agg(lleva_ojales_botones::text, ' ' order by lleva_ojales_botones) from retail.fn_ojales_botones_de_modelos() where producto_id in (:'prod', :'prod2')),
     pg_temp.eh(pg_temp.intento(format('select retail.guardar_proceso_modelo(%L, %L, %L, true)', :'taller', :'prod', 'inventado'))),
     pg_temp.eh(pg_temp.intento(format('select retail.guardar_proceso_modelo(%L, %L, %L, null)', :'taller', :'prod', 'pegar_cierre'))));`,
  "true,true,false,true,ojales_botones=false pegar_cierre=true,false true,P0001|proceso_inexistente,P0001|proceso_modelo_sin_respuesta"
);

// S. LA FORMA --------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la migración se vuelve a cargar encima sin error: trece procesos, una sola fila de ojales por modelo y los reemplazos sin duplicar",
  `${MIGRACION}
   select concat_ws(',', (select count(*) from retail.procesos_produccion),
     (select count(*) from retail.producto_procesos where producto_id = :'prod2'),
     (select (length(d) - length(replace(d, 'retail.procesos_produccion', ''))) / length('retail.procesos_produccion')
        from (select pg_get_functiondef('retail.fn_produccion_fases_normalizar(jsonb)'::regprocedure) d) x),
     (select (length(d) - length(replace(d, 'proceso_apagado', ''))) / length('proceso_apagado')
        from (select pg_get_functiondef('retail.agregar_paso_orden(uuid,text,text,uuid,numeric,numeric,integer,date,boolean,text)'::regprocedure) d) x));`,
  "13,1,3,1"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
