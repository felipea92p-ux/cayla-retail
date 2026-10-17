#!/usr/bin/env node
/**
 * Pruebas de anular una Salida o una Vuelta (ADR-0400, actividad 4b; decisión de Felipe, 2026-10-15) — migración
 * `20261015160000_produccion_anular_salida_y_vuelta.sql`, sobre `154000` y `155000`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una Salida o una Vuelta mal anotada se pueda ANULAR con su motivo —y solo eso: nada se edita ni se borra, la anulación es una
 * fila contraria—, mientras nada haya avanzado después (de esa salida no volvió nada; las buenas de esa vuelta no las usó la fase siguiente); que
 * todas las sumas cuadren SIN saberlo (lo que salió, lo que está afuera, lo hecho, el devengado); que una fase con todo anulado vuelva a «no empezó»
 * y se pueda cambiar quién la hace (el caso de «mandé al taller equivocado»); que una anulación no se anule ni se anule dos veces; que lo rechazado
 * no deje nada escrito; y que la línea de tiempo cuente la anulación sin duplicar la salida o la vuelta.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las tres migraciones se cargan dentro de cada caso).
 *   M  LA MIGRACIÓN: se vuelve a cargar sin error.
 *   AS ANULAR UNA SALIDA: la fila contraria, sin motivo, dos veces / la anulación / inexistente, con prendas ya vueltas, «taller equivocado»
 *      (cambiar quién), el tope cuenta lo neto.
 *   AV ANULAR UNA VUELTA: hechas/afuera/faltantes/devengado vuelven; si la fase siguiente ya las usó no se anula; los mismos rechazos; se puede
 *      anotar otra.
 *   AD UN DESHACER TOTAL también devuelve la fase a «no empezó».
 *   LT LA LÍNEA DE TIEMPO: la anulación cuenta una vez, con `anulada` y `anulable`.
 *   SG EL SIGNO: lo negativo solo cabe en una anulación; el motivo es solo de las anulaciones.
 *   T  ORDEN CERRADA · P PUERTAS (módulo y sede) · F LA FORMA (secdef, search_path, permisos, ni movimientos ni stock).
 *
 * USO
 *   node scripts/pruebas/produccion_anulaciones.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_anulaciones.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_anulaciones.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = leer("20261015160000_produccion_anular_salida_y_vuelta.sql");

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
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Anular Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Otro Taller Anular Prueba', 'maquila') returning id as otro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('AN-LINO', 'Lino Anular Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
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

// El corte hecho (30 de v1 y 20 de v2) y, si se pide, una Salida de lo indicado (deja :sal, la salida original) o una Vuelta (deja :vue).
const CORTE_HECHO = `select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset`;
const SALIDA = (...pares) => `
   select pg_temp.sale(:'f_cost', ${L(...pares)}, '001-1') as s0 \\gset
   select id as sal from retail.produccion_salidas where fase_id = :'f_cost' and anula_id is null order by created_at, id limit 1 \\gset`;
const VUELTA = (lineas) => `
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${lineas.join(", ")}), '001-2') as w0 \\gset
   select id as vue from retail.produccion_vueltas where fase_id = :'f_cost' and anula_id is null order by created_at, id limit 1 \\gset`;
const FILAS_SALIDA = `(select count(*) from retail.produccion_salidas where fase_id = :'f_cost')`;
const FILAS_VUELTA = `(select count(*) from retail.produccion_vueltas where fase_id = :'f_cost')`;
const NETO_SALIDAS = `(select coalesce(sum(sl.cantidad), 0) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = :'f_cost')`;

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente): las dos de anular y los dos ayudantes siguen siendo una cada una",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('anular_salida','anular_vuelta','fn_produccion_salida_anulable','fn_produccion_vuelta_anulable');`,
  "4"
);

// AS. ANULAR UNA SALIDA ---------------------------------------------------------------------------------------------------------
caso(
  "AS1 anular la salida con todo afuera: una fila contraria (la original NO se borra), nada afuera, nada salió, y la fase vuelve a «pendiente» y «no empezó»",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20], ["v2", 10])}
   select retail.anular_salida(:'sal', 'me equivoqué de taller') as j \\gset
   select concat_ws(',',
     ${FASE_DE(`:'j'::jsonb`, "costura", ["estado", "salieron", "afuera", "empezada"])},
     ${FILAS_SALIDA}, ${NETO_SALIDAS},
     (select s.motivo || ':' || (s.anula_id = :'sal') from retail.produccion_salidas s where s.fase_id = :'f_cost' and s.anula_id is not null),
     (select count(*) from retail.produccion_salidas where id = :'sal'),
     ${ACTIVIDAD("produccion_salida_anulada", "anuló la salida de 30 prendas de Costura a Confecciones Anular Prueba de la OP-%")});`,
  "pendiente:0:0:false,2,0,me equivoqué de taller:true,1,1"
);
caso(
  "AS2 sin motivo (o con espacios) no se anula (anular_sin_motivo) y no queda nada escrito",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   select concat_ws(',', pg_temp.eh(pg_temp.anula_s(:'sal', null)), pg_temp.eh(pg_temp.anula_s(:'sal', '   ')), ${FILAS_SALIDA}, ${NETO_SALIDAS});`,
  "P0001|anular_sin_motivo,P0001|anular_sin_motivo,1,20"
);
caso(
  "AS3 anular dos veces la misma salida (anular_ya_anulada), anular la anulación (anular_es_anulacion) y una que no existe (anular_inexistente)",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   select pg_temp.anula_s(:'sal', 'error') as u1 \\gset
   select pg_temp.anula_s(:'sal', 'otra vez') as u2 \\gset
   select id as neg from retail.produccion_salidas where fase_id = :'f_cost' and anula_id is not null \\gset
   select concat_ws(',', :'u1', pg_temp.eh(:'u2'), pg_temp.eh(pg_temp.anula_s(:'neg', 'x')), pg_temp.eh(pg_temp.anula_s(gen_random_uuid(), 'x')), ${FILAS_SALIDA});`,
  "OK,P0001|anular_ya_anulada,P0001|anular_es_anulacion,P0001|anular_inexistente,2"
);
caso(
  "AS4 con prendas que ya volvieron no se anula la salida (anular_ya_volvio, con el nombre del servicio); anulando primero la vuelta, sí",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 10, 0, 0, null)])}
   select pg_temp.anula_s(:'sal', 'x') as r1 \\gset
   select pg_temp.anula_v(:'vue', 'la vuelta era de otra orden') as r2 \\gset
   select pg_temp.anula_s(:'sal', 'x') as r3 \\gset
   select concat_ws(',', pg_temp.eh(:'r1'), :'r1' like '%de Confecciones Anular Prueba: anula primero la vuelta', :'r2', :'r3', ${NETO_SALIDAS});`,
  "P0001|anular_ya_volvio,t,OK,OK,0"
);
caso(
  "AS5 «mandé al taller equivocado»: anulada la salida la fase puede cambiar de quién la hace (cambiar_quien_fase), y una salida nueva sale al otro",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   select pg_temp.cambia(:'f_cost', 'servicio', :'otro', 3.80) as antes \\gset
   select pg_temp.anula_s(:'sal', 'taller equivocado') as a \\gset
   select pg_temp.cambia(:'f_cost', 'servicio', :'otro', 3.80) as despues \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 20])}, '002-1') as s2 \\gset
   select concat_ws(',', pg_temp.eh(:'antes'), :'a', :'despues', :'s2',
     (select pr.nombre from retail.produccion_fases f join retail.proveedores_produccion pr on pr.id = f.proveedor_id where f.id = :'f_cost'), ${NETO_SALIDAS});`,
  "P0001|fase_empezada,OK,OK,OK,Otro Taller Anular Prueba,20"
);
caso(
  "AS6 después de anular, lo que salió vuelve a poder salir: el tope cuenta lo NETO (30 de v1, anular, 30 otra vez)",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 30])}
   select pg_temp.sale(:'f_cost', ${L(["v1", 1])}) as lleno \\gset
   select pg_temp.anula_s(:'sal', 'x') as a \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30])}) as de_nuevo \\gset
   select concat_ws(',', pg_temp.eh(:'lleno'), :'a', :'de_nuevo', ${NETO_SALIDAS});`,
  "P0001|salida_excede,OK,OK,30"
);

// AV. ANULAR UNA VUELTA ---------------------------------------------------------------------------------------------------------
caso(
  "AV1 anular una vuelta de 18 buenas y 2 faltantes: la fase vuelve a deber esas prendas (hechas 0, 20 afuera, sin faltantes ni devengado) y Acabado deja de recibirlas",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 18, 0, 2, "se perdieron")])}
   select retail.anular_vuelta(:'vue', 'la guía era de otra orden') as j \\gset
   select concat_ws(',',
     ${FASE_DE(`:'j'::jsonb`, "costura", ["hechas", "afuera", "salieron", "faltantes", "segundas", "devengado", "estado"])},
     ${FASE_DE(`:'j'::jsonb`, "acabado", ["entrada"])},
     ${FILAS_VUELTA},
     ${FILAS_AVANCE("f_cost")},
     (select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'f_cost'),
     ${ACTIVIDAD("produccion_vuelta_anulada", "anuló la vuelta de 18 prendas buenas de Costura (Confecciones Anular Prueba) de la OP-%")});`,
  "0:20:20:0:0:0:en_curso,0,2,2,0,1"
);
caso(
  "AV2 si Acabado ya usó las buenas de esa vuelta, no se anula (anular_ya_avanzo, con el nombre de la fase) y no queda nada escrito",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 20, 0, 0, null)])}
   select pg_temp.avanza(:'f_acab', ${L(["v1", 5])}) as acabo \\gset
   select pg_temp.anula_v(:'vue', 'x') as r \\gset
   select concat_ws(',', :'acabo', pg_temp.eh(:'r'), :'r' like '%ya pasaron a Acabado%', ${FILAS_VUELTA}, (select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'f_cost'));`,
  "OK,P0001|anular_ya_avanzo,t,1,20"
);
caso(
  "AV3 sin motivo (anular_sin_motivo), dos veces (anular_ya_anulada) y la anulación (anular_es_anulacion)",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 20, 0, 0, null)])}
   select pg_temp.eh(pg_temp.anula_v(:'vue', '')) as r1 \\gset
   select pg_temp.anula_v(:'vue', 'x') as r2 \\gset
   select pg_temp.anula_v(:'vue', 'y') as r3 \\gset
   select id as neg from retail.produccion_vueltas where fase_id = :'f_cost' and anula_id is not null \\gset
   select concat_ws(',', :'r1', :'r2', pg_temp.eh(:'r3'), pg_temp.eh(pg_temp.anula_v(:'neg', 'z')), ${FILAS_VUELTA});`,
  "P0001|anular_sin_motivo,OK,P0001|anular_ya_anulada,P0001|anular_es_anulacion,2"
);
caso(
  "AV4 anulada la vuelta, se puede anotar otra: lo que faltó vuelve a poder volver (el tope cuenta lo NETO) y el devengado sale de la nueva",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 20, 0, 0, null)])}
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 1, 0, 0, null)})) as lleno \\gset
   select pg_temp.anula_v(:'vue', 'x') as a \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 15, 5, 0, "salieron con mancha")})) as nueva \\gset
   select retail.fn_fases_de_orden(:'oid') as j \\gset
   select concat_ws(',', pg_temp.eh(:'lleno'), :'a', :'nueva', ${FASE_DE(`:'j'::jsonb`, "costura", ["hechas", "segundas", "afuera", "devengado"])});`,
  "P0001|vuelta_excede,OK,OK,15:5:0:67.50"
);

// AD. FASE «NO EMPEZÓ» ----------------------------------------------------------------------------------------------------------
caso(
  "AD1 un Deshacer total también devuelve la fase a «no empezó»: se puede cambiar quién la hace (antes quedaba bloqueada)",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 20])}) as a \\gset
   select pg_temp.cambia(:'f_corte', 'servicio', :'otro', 2.5) as con_avance \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_corte' and origen = 'taller' \\gset
   select pg_temp.deshace(:'av') as d \\gset
   select pg_temp.cambia(:'f_corte', 'servicio', :'otro', 2.5) as sin_avance \\gset
   select concat_ws(',', pg_temp.eh(:'con_avance'), :'d', :'sin_avance', ${FASE_DE("retail.fn_fases_de_orden(:'oid')", "corte", ["estado", "empezada", "quien"])});`,
  "P0001|fase_empezada,OK,OK,pendiente:false:servicio"
);

// LT. LA LÍNEA DE TIEMPO --------------------------------------------------------------------------------------------------------
caso(
  "LT1 la línea de tiempo cuenta cada anulación UNA vez («Anuló la vuelta de 20 buenas: motivo»), no repite la salida ni la vuelta, no muestra los avances compensatorios como «Deshacer», y marca anulada y anulable",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 20, 0, 0, null)])}
   select pg_temp.anula_v(:'vue', 'la vuelta era de otra orden') as a \\gset
   select retail.fn_orden_produccion(:'oid') -> 'linea_de_tiempo' as t \\gset
   select concat_ws(',',
     (select count(*) from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'salida'),
     (select count(*) from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'vuelta'),
     (select count(*) from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'anulacion'),
     (select count(*) from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'deshacer'),
     (select e ->> 'detalle' from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'anulacion'),
     (select (e ->> 'anula') || ':' || (e ->> 'motivo') from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'anulacion'),
     (select (e ->> 'anulada') || ':' || (e ->> 'anulable') from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'vuelta'),
     (select (e ->> 'anulada') || ':' || (e ->> 'anulable') from jsonb_array_elements(:'t'::jsonb) e where e ->> 'tipo' = 'salida'));`,
  "1,1,1,0,Anuló la vuelta de 20 buenas: la vuelta era de otra orden,vuelta:la vuelta era de otra orden,true:false,false:true"
);

// SG. EL SIGNO DE LAS LÍNEAS ----------------------------------------------------------------------------------------------------
caso(
  "SG1 las cantidades negativas solo caben en una fila de anulación (23514); en una salida o vuelta normal no, y en una anulación no caben positivas",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 10, 0, 0, null)])}
   select pg_temp.anula_v(:'vue', 'x') as a1 \\gset
   select pg_temp.anula_s(:'sal', 'x') as a2 \\gset
   select id as an_s from retail.produccion_salidas where fase_id = :'f_cost' and anula_id is not null \\gset
   select id as an_v from retail.produccion_vueltas where fase_id = :'f_cost' and anula_id is not null \\gset
   select concat_ws(',',
     split_part(pg_temp.intento('insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (''' || :'sal' || ''', ''' || :'v2' || ''', -3)'), '|', 1),
     split_part(pg_temp.intento('insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (''' || :'an_s' || ''', ''' || :'v2' || ''', 3)'), '|', 1),
     split_part(pg_temp.intento('insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas) values (''' || :'vue' || ''', ''' || :'v2' || ''', -3)'), '|', 1),
     split_part(pg_temp.intento('insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas) values (''' || :'an_v' || ''', ''' || :'v2' || ''', 3)'), '|', 1));`,
  "23514,23514,23514,23514"
);
caso(
  "SG2 una anulación sin motivo no cabe en la tabla (23514) y una fila normal con motivo tampoco (el motivo es solo de las anulaciones)",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   select concat_ws(',',
     split_part(pg_temp.intento('insert into retail.produccion_salidas (fase_id, anula_id, hecho_por) values (''' || :'f_cost' || ''', ''' || :'sal' || ''', ''' || :'felipe_p' || ''')'), '|', 1),
     split_part(pg_temp.intento('insert into retail.produccion_salidas (fase_id, motivo, hecho_por) values (''' || :'f_cost' || ''', ''x'', ''' || :'felipe_p' || ''')'), '|', 1));`,
  "23514,23514"
);

// T. ORDEN CERRADA Y PUERTAS ----------------------------------------------------------------------------------------------------
caso(
  "T1 sobre una orden anulada ninguna de las dos opera (orden_cerrada) y no queda nada escrito",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 10, 0, 0, null)])}
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select concat_ws(',', pg_temp.eh(pg_temp.anula_s(:'sal', 'x')), pg_temp.eh(pg_temp.anula_v(:'vue', 'x')), ${FILAS_SALIDA}, ${FILAS_VUELTA});`,
  "P0001|orden_cerrada,P0001|orden_cerrada,1,1"
);
caso(
  "P1 sin el módulo «produccion» en el rol (42501) y con el módulo pero parada en Trujillo (42501), ninguna de las dos anula; Felipe sí",
  `${ORDEN()}
   ${CORTE_HECHO}
   ${SALIDA(["v1", 20])}
   ${VUELTA([VL("v1", 10, 0, 0, null)])}
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select concat_ws('/', pg_temp.eh(pg_temp.anula_s(:'sal', 'x')), pg_temp.eh(pg_temp.anula_v(:'vue', 'x'))) as sin_modulo \\gset
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select concat_ws('/', pg_temp.eh(pg_temp.anula_s(:'sal', 'x')), pg_temp.eh(pg_temp.anula_v(:'vue', 'x'))) as en_trujillo \\gset
   ${como(FELIPE)}
   select pg_temp.anula_v(:'vue', 'x') as felipe \\gset
   select :'sin_modulo' || ',' || :'en_trujillo' || ',' || :'felipe' || ',' || ${FILAS_VUELTA};`,
  "42501|produccion_sin_modulo/42501|produccion_sin_modulo,42501|produccion_sin_taller/42501|produccion_sin_taller,OK,2"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
const DE = (nombres) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in (${nombres})`;
const PUBLICAS = `'anular_salida','anular_vuelta'`;
const INTERNAS = `'fn_produccion_salida_anulable','fn_produccion_vuelta_anulable','fn_produccion_salida_linea_signo','fn_produccion_vuelta_linea_signo'`;
caso(
  "F1 la forma: las 2 públicas son security definer con search_path, authenticated sí y anon no; las 4 internas, cerradas a la API; ninguna toca movimientos ni stock",
  `reset role;
   select concat_ws(',',
     (select count(*) ${DE(PUBLICAS)}),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') ${DE(PUBLICAS)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select count(*) ${DE(INTERNAS)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE(INTERNAS)}),
     (select bool_and(array_to_string(p.proconfig, ',') like '%search_path%') ${DE(INTERNAS)}),
     (select count(*) ${DE(PUBLICAS)} and p.prosrc ~* 'insert into retail\\.(movimientos|stock)'));`,
  "2,t,t,f,4,f,t,0"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
