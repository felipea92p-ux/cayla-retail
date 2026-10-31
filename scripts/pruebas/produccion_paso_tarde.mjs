#!/usr/bin/env node
/**
 * Pruebas de «agregar un paso que se olvidó» (ADR-0586, actividad 1) — migración `20261031002000_produccion_agregar_paso_tarde.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que un líder pueda sumar a una orden en proceso un paso que se olvidó anotar (Ojales y botones, la orden del Short Sastre Recover) aunque los pasos de después ya
 * avanzaron, y que entre YA HECHO con todas las prendas que le llegaron: en el Taller como un «Terminé», afuera como una salida y una vuelta que devenga su costo. Que la cadena de la
 * ruta quede cuadrada (lo que entra a Planchado no cambia, Planchado se sigue trabajando y la orden cierra), que quede en la historia con su motivo y en Actividad, y que nadie más que el
 * líder lo haga; que sin motivo, sin un paso posterior empezado o con una ruta inválida no se escriba nada.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez). Contra la base tal como queda con
 * TODAS las migraciones aplicadas (la misma de CI).
 *
 * QUÉ PRUEBA
 *   A  AGREGAR TARDE: en el Taller, afuera con la tarifa del proveedor (devenga), «pendiente de registrar», con su día real, y con la mitad de la orden todavía en Costura.
 *   F  DE PUNTA A PUNTA: después del paso tarde, Planchado termina lo que le faltaba y la orden pasa al stock.
 *   R  REGLAS: quien no es líder, sin motivo, sin paso posterior empezado, paso repetido, servicio sin proveedor, día futuro o de antes de abrir, orden cerrada.
 *   D  DATOS: la historia (acción, motivo, filas que puso), Actividad, la forma de la historia, todo o nada, volver a pegar.
 *   S  LA FORMA: security definer con search_path, authenticated sí y anon no, y el mismo candado por orden que las demás.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (es una transacción por caso; el candado se comprueba por su forma, S2).
 *
 * USO
 *   node scripts/pruebas/produccion_paso_tarde.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_paso_tarde.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_paso_tarde.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante (seed): aquí se la pasa al Taller con el módulo, para que solo la frene no ser líder
const SIN_CANDADO = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const MIGRACION = SIN_CANDADO(readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261031002000_produccion_agregar_paso_tarde.sql", import.meta.url)), "utf8"));
const FIRMA = "retail.agregar_paso_tarde(uuid,text,text,date,text,uuid,numeric,numeric,integer,boolean,text)";

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

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR»/«OK» o «<sqlstate>|<hint>|<mensaje>».
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
-- Agrega tarde un paso a la última orden: «OK» o «<sqlstate>|<hint>» (sin el mensaje, para comparar corto).
create function pg_temp.tarde(p_clave text, p_motivo text default 'Se olvidó anotar', p_dia date default null, p_quien text default 'taller', p_prov uuid default null,
  p_tarifa numeric default null, p_fijo numeric default null, p_min integer default null, p_pend boolean default false, p_pos text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text;
begin
  perform retail.agregar_paso_tarde((select id from pg_temp.ultima), p_clave, p_motivo, p_dia, p_quien, p_prov, p_tarifa, p_fijo, p_min, p_pend, p_pos);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', p_fase, p_lineas)) $f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, 1400, 200, null, true)', p_oid, p_buenas)) $f$;
create function pg_temp.anula(p_oid uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.anular_produccion(%L, ''prueba'')', p_oid)) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
insert into retail.proveedores_produccion (nombre, rubro) values ('Ojales y Botones Prueba SAC', 'maquila') returning id as ojalero \\gset
insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima, fijo_orden, vigente_desde) values (:'ojalero', 'ojales_botones', 1.80, 20, 0, retail.fn_hoy_lima() - 1);
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días. La ruta de cinco pasos SIN Ojales y botones (el olvido).
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const CINCO = `jsonb_build_array(${["ploteo", "corte", "habilitado", "costura", "planchado"].map(TALLER).join(", ")})`;
const ABRE = `select pg_temp.abre(${APERTURA}, ${CINCO}) as r \\gset`;
const IDS = `
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_planch from retail.produccion_fases where produccion_id = :'oid' and clave = 'planchado' \\gset
`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const SECUENCIAS = `(select string_agg(clave || ':' || secuencia, ' ' order by secuencia) from retail.produccion_fases where produccion_id = :'oid')`;
// Clave:estado:entrada:hechas de cada fase que cuenta prendas (sin Ploteo), en el orden de la ruta.
const CADENA = `(select string_agg((f ->> 'clave') || ':' || (f ->> 'estado') || ':' || (f ->> 'entrada') || ':' || (f ->> 'hechas'), ' ' order by (f ->> 'secuencia')::int)
                   from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' <> 'ploteo')`;
const FASE_OJALES = (campo) => `(select f ->> '${campo}' from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = 'ojales_botones')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const FILAS_FASES = `(select count(*) from retail.produccion_fases where produccion_id = :'oid')`;
const CAMBIOS_TARDE = `(select count(*) from retail.produccion_cambios where produccion_id = :'oid' and accion = 'paso_tarde')`;
const MOV_ENTRADA = `(select coalesce(sum(cantidad), 0) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion')`;
// La orden del Short: Ploteo marcado, todo hecho hasta Costura y Planchado ya terminado (las 50).
const TODO_HECHO = `
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a4 \\gset`;
// Lo mismo, pero Planchado va por 10 del primer color.
const PLANCHADO_EMPEZADO = `
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 10])}) as a4 \\gset`;

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

// A. AGREGAR TARDE --------------------------------------------------------------------------------------------------------------
caso(
  "A1 la orden del Short (todo hecho, Planchado con las 50): Ojales y botones entra en el Taller entre Costura y Planchado, YA hecho con las 50, y Planchado sigue hecho",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones') as t \\gset
   select concat_ws(',', :'t', ${SECUENCIAS}, ${CADENA});`,
  "OK,ploteo:5 corte:10 habilitado:15 costura:30 ojales_botones:35 planchado:65,corte:hecha:50:50 habilitado:hecha:50:50 costura:hecha:50:50 ojales_botones:hecha:50:50 planchado:hecha:50:50"
);
caso(
  "A2 afuera con el proveedor y SIN escribir la tarifa: toma la de su lista (1.80), salieron y volvieron las 50 y devenga 90.00 al instante",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones', 'Lo hizo el ojalero y no se anotó', null, 'servicio', :'ojalero') as t \\gset
   select concat_ws(',', :'t', ${FASE_OJALES("quien")}, ${FASE_OJALES("tarifa_prenda")}, ${FASE_OJALES("salieron")}, ${FASE_OJALES("hechas")},
     (${FASE_OJALES("devengado")})::numeric, ${FASE_OJALES("estado")},
     (select count(*) from retail.produccion_salidas s join retail.produccion_fases f on f.id = s.fase_id where f.produccion_id = :'oid' and f.clave = 'ojales_botones'),
     (select count(*) from retail.produccion_vueltas vu join retail.produccion_fases f on f.id = vu.fase_id where f.produccion_id = :'oid' and f.clave = 'ojales_botones'));`,
  "OK,servicio,1.80,50,50,90.00,hecha,1,1"
);
caso(
  "A3 afuera «pendiente de registrar» con su tarifa (2.00): entra hecho con las 50 y devenga como cualquier pendiente (100.00); sin tarifa, 0",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones', 'Afuera, falta registrar con quién', null, 'servicio', null, 2.00, null, null, true) as t \\gset
   select concat_ws(',', :'t', coalesce(${FASE_OJALES("proveedor_id")}, 'sin_proveedor'), ${FASE_OJALES("hechas")}, (${FASE_OJALES("devengado")})::numeric, ${FASE_OJALES("estado")});`,
  "OK,sin_proveedor,50,100.00,hecha"
);
caso(
  "A4 con su día real: la orden se abrió hace 5 días y volvió hace 2; las filas guardan ese día (mediodía en Lima), y la historia también",
  `${ABRE}
   ${IDS}
   update retail.producciones set created_at = now() - interval '5 days' where id = :'oid';
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones', 'Volvió el martes', retail.fn_hoy_lima() - 2, 'servicio', :'ojalero') as t \\gset
   select concat_ws(',', :'t',
     (select bool_and((a.hecho_en at time zone 'America/Lima')::date = retail.fn_hoy_lima() - 2) from retail.produccion_avances a join retail.produccion_fases f on f.id = a.fase_id
       where f.produccion_id = :'oid' and f.clave = 'ojales_botones'),
     (select ((c.despues ->> 'hecho')::timestamptz at time zone 'America/Lima')::date = retail.fn_hoy_lima() - 2 from retail.produccion_cambios c where c.produccion_id = :'oid' and c.accion = 'paso_tarde'));`,
  "OK,t,t"
);
caso(
  "A5 con la mitad en Costura (30 del primer color hechas y Planchado por 10): Ojales entra con las 30 que llegaron; cuando Costura termina, Ojales espera las 20 que faltan",
  `${ABRE}
   ${IDS}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30])}) as a3 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 10])}) as a4 \\gset
   select pg_temp.tarde('ojales_botones') as t \\gset
   select ${CADENA} as antes \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v2", 20])}) as a5 \\gset
   select concat_ws(',', :'t', :'antes', ${CADENA});`,
  "OK,corte:hecha:50:50 habilitado:hecha:50:50 costura:en_curso:50:30 ojales_botones:en_curso:30:30 planchado:en_curso:30:10,corte:hecha:50:50 habilitado:hecha:50:50 costura:hecha:50:50 ojales_botones:en_curso:50:30 planchado:en_curso:30:10"
);

// F. DE PUNTA A PUNTA -----------------------------------------------------------------------------------------------------------
caso(
  "F1 Planchado iba por 10: después del paso tarde termina las 40 que le faltan (le siguen entrando las 50) y la orden pasa al stock con las 50",
  `${ABRE}
   ${IDS}
   ${PLANCHADO_EMPEZADO}
   select pg_temp.tarde('ojales_botones', 'Se olvidó', null, 'servicio', :'ojalero') as t \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 20], ["v2", 20])}) as a5 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'t', :'a5', :'c', ${ESTADO}, ${MOV_ENTRADA});`,
  (s) => s.startsWith("OK,SIN_ERROR,SIN_ERROR,") && s.endsWith(",50")
);
caso(
  "F2 Costura sigue con su candado: con Ojales agregado (que usó las 50), Costura ya no se puede bajar con un Deshacer",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones') as t \\gset
   select pg_temp.eh(pg_temp.intento(format('select retail.deshacer_avance(%L)', (select a.id from retail.produccion_avances a where a.fase_id = :'f_cost' order by a.created_at limit 1)))) as d \\gset
   select concat_ws(',', :'t', split_part(:'d', '|', 1) <> 'SIN_ERROR');`,
  "OK,t"
);

// R. REGLAS ---------------------------------------------------------------------------------------------------------------------
caso(
  "R1 una integrante del Taller con el módulo, pero que no es líder: 42501 paso_tarde_solo_lider y no se escribe nada",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = :'micaela_p';
   ${como(MICAELA)}
   select pg_temp.tarde('ojales_botones') as t \\gset
   ${como(FELIPE)}
   select concat_ws(',', :'t', ${FILAS_FASES}, ${CAMBIOS_TARDE});`,
  "42501|paso_tarde_solo_lider,5,0"
);
caso(
  "R2 sin motivo (vacío o solo espacios) no se agrega: cambio_sin_motivo; con más de 300 letras, cambio_motivo_largo",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select concat_ws(',', pg_temp.tarde('ojales_botones', '   '), pg_temp.tarde('ojales_botones', null), pg_temp.tarde('ojales_botones', repeat('x', 301)), ${FILAS_FASES});`,
  "P0001|cambio_sin_motivo,P0001|cambio_sin_motivo,P0001|cambio_motivo_largo,5"
);
caso(
  "R3 si ningún paso de después empezó (Costura hecha, Planchado en 0) no es «tarde»: paso_no_es_tarde (se agrega con «Agregar un paso»)",
  `${ABRE}
   ${IDS}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset
   select concat_ws(',', pg_temp.tarde('ojales_botones'), ${FILAS_FASES});`,
  "P0001|paso_no_es_tarde,5"
);
caso(
  "R4 la misma validación de abrir: un paso que ya está (fase_repetida), un servicio sin proveedor ni «pendiente» (fase_sin_proveedor), un hito (paso_tarde_hito) o uno apagado",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select concat_ws(',', pg_temp.tarde('planchado'), pg_temp.tarde('ojales_botones', 'x', null, 'servicio'), pg_temp.tarde('ploteo'), pg_temp.tarde('no_existe'), ${FILAS_FASES});`,
  "P0001|fase_repetida,P0001|fase_sin_proveedor,P0001|paso_tarde_hito,P0001|proceso_apagado,5"
);
caso(
  "R5 el día: uno que todavía no llega (avance_fecha_futura) o de antes de abrir la orden (avance_fecha_antes_de_abrir) no se acepta",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select concat_ws(',', pg_temp.tarde('ojales_botones', 'x', retail.fn_hoy_lima() + 1), pg_temp.tarde('ojales_botones', 'x', retail.fn_hoy_lima() - 3), ${FILAS_FASES});`,
  "P0001|avance_fecha_futura,P0001|avance_fecha_antes_de_abrir,5"
);
caso(
  "R6 a una orden anulada no se le agrega nada: orden_cerrada",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.anula(:'oid') as a \\gset
   select concat_ws(',', pg_temp.tarde('ojales_botones'), ${FILAS_FASES});`,
  "P0001|orden_cerrada,5"
);

// D. DATOS ----------------------------------------------------------------------------------------------------------------------
caso(
  "D1 la historia: una fila «paso_tarde» con el motivo, la fase nueva, las 2 filas que puso (una por color) y lo que pasó (afuera, 50 prendas, antes de Planchado)",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones', 'Lo hizo el ojalero', null, 'servicio', :'ojalero') as t \\gset
   select concat_ws(',', :'t', c.texto, (c.fase_id = (select id from retail.produccion_fases where produccion_id = :'oid' and clave = 'ojales_botones')),
     cardinality(c.pone_ids), cardinality(c.quita_ids), c.despues ->> 'quien', c.despues ->> 'prendas', c.despues ->> 'antes_de', c.despues ->> 'proveedor_nombre')
     from retail.produccion_cambios c where c.produccion_id = :'oid' and c.accion = 'paso_tarde';`,
  "OK,Lo hizo el ojalero,t,2,0,servicio,50,planchado,Ojales y Botones Prueba SAC"
);
caso(
  "D2 Actividad: «agregó tarde el paso Ojales y botones … (afuera con …) con 50 prendas hechas: <motivo>»",
  `${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select pg_temp.tarde('ojales_botones', 'Lo hizo el ojalero', null, 'servicio', :'ojalero') as t \\gset
   select concat_ws(',', :'t', (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_paso_tarde'
     and a.descripcion like 'agregó tarde el paso Ojales y botones a la % (afuera con Ojales y Botones Prueba SAC) con 50 prendas hechas: Lo hizo el ojalero'));`,
  "OK,1"
);
caso(
  "D3 la forma de la historia: un «paso_tarde» sin fase o sin filas puestas no entra (produccion_cambios_forma)",
  `${ABRE}
   ${IDS}
   select pg_temp.eh(pg_temp.intento(format($q$insert into retail.produccion_cambios (produccion_id, accion, pone_ids, texto, hecho_por)
     values (%L, 'paso_tarde', array[gen_random_uuid()], 'x', (select id from public.personas limit 1))$q$, :'oid'))) as sin_fase \\gset
   select pg_temp.eh(pg_temp.intento(format($q$insert into retail.produccion_cambios (produccion_id, fase_id, accion, texto, hecho_por)
     values (%L, %L, 'paso_tarde', 'x', (select id from public.personas limit 1))$q$, :'oid', :'f_cost'))) as sin_filas \\gset
   select concat_ws(',', :'sin_fase', :'sin_filas');`,
  "23514|,23514|"
);
caso(
  "D4 volver a pegar la migración no cambia nada: la función queda idéntica, hay una sola con ese nombre y sigue agregando",
  `select md5(pg_get_functiondef('${FIRMA}'::regprocedure)) as antes \\gset
   ${MIGRACION}
   ${ABRE}
   ${IDS}
   ${TODO_HECHO}
   select concat_ws(',', md5(pg_get_functiondef('${FIRMA}'::regprocedure)) = :'antes',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_paso_tarde'),
     pg_temp.tarde('ojales_botones'));`,
  "t,1,OK"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "S1 security definer con search_path fijo; authenticated la puede llamar y anon no",
  `select concat_ws(',', p.prosecdef, array_to_string(p.proconfig, ';'), has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p where p.oid = '${FIRMA}'::regprocedure;`,
  "t,search_path=retail, public, extensions,t,f"
);
caso(
  "S2 toma el mismo candado por orden que avance, salida, vuelta y agregar un paso",
  `select (pg_get_functiondef('${FIRMA}'::regprocedure) like '%pg_advisory_xact_lock(hashtextextended(''produccion:'' || p_produccion_id::text, 0))%')::text;`,
  "true"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
