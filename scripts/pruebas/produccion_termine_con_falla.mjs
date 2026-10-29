#!/usr/bin/env node
/**
 * Pruebas de «Terminé» con falla y con fecha (ADR-0570, actividad 2) — migración `20261029164000_produccion_termine_con_falla_y_fecha.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una prenda dañada en un paso del Taller ya no trabe la orden: las segundas y las perdidas cuentan para cerrar la fase y NO pasan a la siguiente; un arreglo no
 * cuenta (la prenda sigue pendiente ahí) hasta que se anota buena. Que nunca haya más buenas + segundas + perdidas que lo que entró, por talla y color, ni por «Terminé» ni por el
 * `registrar_avance` de siempre. Que el día real se guarde aparte de cuándo se anotó, nunca futuro ni antes de abrir la orden. Que una falla se deshaga una sola vez y que nada se edite.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez). Contra la base tal como queda con
 * TODAS las migraciones aplicadas (la misma de CI).
 *
 * QUÉ PRUEBA
 *   B  BÁSICO: sin fallas todo sigue igual; segunda y perdida cierran la fase y la orden pasa al stock; un arreglo no cierra hasta volver bueno; solo fallas; a la fase siguiente pasan solo las buenas.
 *   R  REGLAS: no pasarse de lo que entró (con fallas nuevas y ya anotadas), motivo, destino, cantidad, repetida, talla ajena, sin nada, una fase que se marca.
 *   D  EL DÍA: hoy no guarda día aparte; futuro y antes de abrir se rechazan; un día anterior queda a mediodía de Lima y la línea de tiempo guarda cuándo se anotó.
 *   U  DESHACER: una falla se deshace una vez, la fase se reabre; un Deshacer no se deshace; nada se edita.
 *   L  LECTURA: las fallas por talla y color y en la línea de tiempo; la Actividad las nombra; una integrante de otra sede no anota.
 *   S  LA FORMA: security definer con search_path, authenticated sí y anon no, la tabla cerrada a la pantalla, el mismo candado por orden.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (el candado se comprueba por su forma, S2), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/produccion_termine_con_falla.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_termine_con_falla.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_termine_con_falla.mjs --base otra                 → contra otra base del mismo contenedor
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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)
const SIN_CANDADO = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const MIGRACION = SIN_CANDADO(readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261029164000_produccion_termine_con_falla_y_fecha.sql", import.meta.url)), "utf8"));

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

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
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
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', p_fase, p_lineas)) $f$;
create function pg_temp.termina(p_fase uuid, p_lineas jsonb, p_dia date default null, p_fallas jsonb default null) returns text language sql as $f$
  select pg_temp.intento(format('select retail.anotar_termine(%L, %L::jsonb, null, %L::date, %L::jsonb)', p_fase, p_lineas, p_dia, p_fallas)) $f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.deshace_falla(p_falla uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.deshacer_falla(%L)', p_falla)) $f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, 1400, 200, null, true)', p_oid, p_buenas)) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La orden de siempre: 30 del primer color (v1) y 20 del segundo (v2), con los cinco pasos en el Taller.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const CINCO = `jsonb_build_array(${["ploteo", "corte", "habilitado", "costura", "planchado"].map((c) => `jsonb_build_object('clave', '${c}', 'quien', 'taller')`).join(", ")})`;
const ABRE = `select pg_temp.abre(${APERTURA}, ${CINCO}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_planch from retail.produccion_fases where produccion_id = :'oid' and clave = 'planchado' \\gset`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const F = (...fallas) =>
  `jsonb_build_array(${fallas.map(([v, n, destino, motivo = "Mancha"]) => `jsonb_build_object('variante_id', ${v.startsWith("(") ? v : `:'${v}'`}, 'cantidad', '${n}', 'destino', '${destino}', 'motivo', '${motivo}')`).join(", ")})`;
const ESTADO_DE = (fase) => `(select f ->> 'estado' from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = '${fase}')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const MOV_ENTRADA = `(select coalesce(sum(cantidad), 0) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion')`;
const FALLAS_DE = (fase) => `(select count(*) from retail.produccion_fallas where fase_id = :'${fase}')`;
// La orden hasta Habilitado (Ploteo marcado, Corte y Habilitado de las 50) y hasta Costura.
const HASTA_HABILITADO = `
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset`;
const HASTA_COSTURA = `${HASTA_HABILITADO}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset`;

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

// B. BÁSICO ---------------------------------------------------------------------------------------------------------------------
caso(
  "B1 sin fallas ni día, «Terminé» hace lo de siempre: por registrar_avance y por anotar_termine, y Planchado queda hecha",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 10])}) as t1 \\gset
   select pg_temp.termina(:'f_planch', ${L(["v1", 20], ["v2", 20])}) as t2 \\gset
   select concat_ws(',', :'t1', :'t2', ${ESTADO_DE("planchado")}, ${FALLAS_DE("f_planch")});`,
  "SIN_ERROR,SIN_ERROR,hecha,0"
);
caso(
  "B2 la orden del Chaleco: 28 buenas y 2 segundas de un color, 20 del otro: Planchado queda HECHA y la orden pasa al stock con las 48 buenas",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select ${ESTADO_DE("planchado")} as e \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 28], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'t', :'e', :'c', ${ESTADO}, ${MOV_ENTRADA});`,
  "SIN_ERROR,hecha,SIN_ERROR,terminada,48"
);
caso(
  "B3 una prenda perdida también cierra la fase",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 29], ["v2", 20])}, null, ${F(["v1", 1, "perdida", "Quemadura de plancha"])}) as t \\gset
   select concat_ws(',', :'t', ${ESTADO_DE("planchado")});`,
  "SIN_ERROR,hecha"
);
caso(
  "B4 un arreglo NO cierra: la prenda sigue pendiente en Planchado; cuando vuelve buena se anota y recién ahí cierra",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "arreglo", "Costura abierta"])}) as t1 \\gset
   select ${ESTADO_DE("planchado")} as e1 \\gset
   select pg_temp.termina(:'f_planch', ${L(["v1", 2])}) as t2 \\gset
   select concat_ws(',', :'t1', :'e1', :'t2', ${ESTADO_DE("planchado")});`,
  "SIN_ERROR,en_curso,SIN_ERROR,hecha"
);
caso(
  "B5 solo fallas, sin ninguna buena: se anota (todo lo que quedaba se perdió o es segunda) y la fase cierra",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', '[]'::jsonb, null, ${F(["v1", 30, "perdida"], ["v2", 20, "segunda"])}) as t \\gset
   select concat_ws(',', :'t', ${ESTADO_DE("planchado")}, (select count(*) from retail.produccion_avances where fase_id = :'f_planch'));`,
  "SIN_ERROR,hecha,0"
);
caso(
  "B6 a la fase siguiente pasan SOLO las buenas: Costura con 28 buenas y 2 perdidas cierra, y a Planchado le entran 28 de ese color",
  `${ABRE}
   ${HASTA_HABILITADO}
   select pg_temp.termina(:'f_cost', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "perdida"])}) as t \\gset
   select concat_ws(',', :'t', ${ESTADO_DE("costura")}, retail.fn_produccion_entrada_variante(:'f_planch', :'v1'), retail.fn_produccion_entrada_variante(:'f_planch', :'v2'));`,
  "SIN_ERROR,hecha,28,20"
);

// R. REGLAS ---------------------------------------------------------------------------------------------------------------------
caso(
  "R1 buenas + fallas no pasan de lo que entró (29 + 2 de 30): avance_excede y no se escribe NADA (ni las buenas ni la falla)",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 29], ["v2", 20])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select concat_ws(',', pg_temp.eh(:'t'), ${FALLAS_DE("f_planch")}, (select count(*) from retail.produccion_avances where fase_id = :'f_planch'));`,
  "P0001|avance_excede,0,0"
);
caso(
  "R2 las fallas ya anotadas cuentan también para el «Terminé» de siempre: tras 1 buena y 2 segundas, 28 más no caben (1 + 2 + 28 > 30)",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 1])}, null, ${F(["v1", 2, "segunda"])}) as t1 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 28])}) as t2 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 27])}) as t3 \\gset
   select concat_ws(',', :'t1', pg_temp.eh(:'t2'), :'t3');`,
  "SIN_ERROR,P0001|avance_excede,SIN_ERROR"
);
caso(
  "R3 cada falla dice qué pasó, qué pasa con ella y cuántas: sin motivo, destino inventado, cantidad 0, repetida, talla ajena",
  `${ABRE}
   ${HASTA_COSTURA}
   select concat_ws(',',
     pg_temp.eh(pg_temp.termina(:'f_planch', '[]'::jsonb, null, ${F(["v1", 1, "segunda", " "])})),
     pg_temp.eh(pg_temp.termina(:'f_planch', '[]'::jsonb, null, ${F(["v1", 1, "roto"])})),
     pg_temp.eh(pg_temp.termina(:'f_planch', '[]'::jsonb, null, ${F(["v1", 0, "segunda"])})),
     pg_temp.eh(pg_temp.termina(:'f_planch', '[]'::jsonb, null, ${F(["v1", 1, "segunda"], ["v1", 1, "segunda"])})),
     pg_temp.eh(pg_temp.termina(:'f_planch', '[]'::jsonb, null, ${F(["(gen_random_uuid())", 1, "segunda"])})),
     ${FALLAS_DE("f_planch")});`,
  "P0001|falla_sin_motivo,P0001|falla_destino_invalido,P0001|falla_cantidad_invalida,P0001|falla_repetida,P0001|avance_variante_ajena,0"
);
caso(
  "R4 sin buenas ni fallas, el mismo rechazo de siempre (avance_sin_lineas); y una fase que se marca no lleva «Terminé» (fase_es_hito)",
  `${ABRE}
   select concat_ws(',', pg_temp.eh(pg_temp.termina(:'f_corte', '[]'::jsonb)), pg_temp.eh(pg_temp.termina(:'f_plot', ${L(["v1", 1])})));`,
  "P0001|avance_sin_lineas,P0001|fase_es_hito"
);
caso(
  "R5 la misma talla y color puede tener segundas Y perdidas en la misma anotación (destinos distintos, no es repetida)",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 27], ["v2", 20])}, null, ${F(["v1", 2, "segunda"], ["v1", 1, "perdida"])}) as t \\gset
   select concat_ws(',', :'t', ${ESTADO_DE("planchado")});`,
  "SIN_ERROR,hecha"
);

// D. EL DÍA ---------------------------------------------------------------------------------------------------------------------
caso(
  "D1 hoy no guarda un día aparte (vale la hora de anotar); mañana se rechaza (avance_fecha_futura); antes de abrir la orden, también (avance_fecha_antes_de_abrir)",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 1])}, retail.fn_hoy_lima()) as t1 \\gset
   select concat_ws(',', :'t1', (select bool_and(hecho_en is null) from retail.produccion_avances where fase_id = :'f_corte'),
     pg_temp.eh(pg_temp.termina(:'f_corte', ${L(["v1", 1])}, retail.fn_hoy_lima() + 1)),
     pg_temp.eh(pg_temp.termina(:'f_corte', ${L(["v1", 1])}, retail.fn_hoy_lima() - 1)));`,
  "SIN_ERROR,t,P0001|avance_fecha_futura,P0001|avance_fecha_antes_de_abrir"
);
caso(
  "D2 la orden se abrió hace 3 días y el corte se terminó anteayer: el avance lleva ese día a mediodía de Lima, la fase dice que empezó ese día y la línea de tiempo guarda aparte cuándo se anotó",
  `alter table retail.producciones disable trigger user;
   ${ABRE}
   update retail.producciones set created_at = now() - interval '3 days' where id = :'oid';
   alter table retail.producciones enable trigger user;
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}, retail.fn_hoy_lima() - 2) as t \\gset
   select concat_ws(',', :'t',
     (select bool_and((hecho_en at time zone 'America/Lima') = (retail.fn_hoy_lima() - 2)::timestamp + interval '12 hours') from retail.produccion_avances where fase_id = :'f_corte'),
     (select ((f ->> 'desde')::timestamptz at time zone 'America/Lima')::date = retail.fn_hoy_lima() - 2 from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = 'corte'),
     (select count(*) from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'linea_de_tiempo') e
       where e ->> 'tipo' = 'avance' and e ->> 'registrado_en' is not null and (e ->> 'cuando')::timestamptz < (e ->> 'registrado_en')::timestamptz));`,
  "SIN_ERROR,t,t,1"
);

// U. DESHACER -------------------------------------------------------------------------------------------------------------------
caso(
  "U1 una falla se deshace con una fila contraria y la fase se reabre; otra vez no (deshacer_ya_hecho); el Deshacer no se deshace (deshacer_origen); una que no existe tampoco",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select ${ESTADO_DE("planchado")} as e1 \\gset
   select id as falla from retail.produccion_fallas where fase_id = :'f_planch' and cantidad > 0 \\gset
   select pg_temp.deshace_falla(:'falla') as d1 \\gset
   select ${ESTADO_DE("planchado")} as e2 \\gset
   select id as contraria from retail.produccion_fallas where deshace_id = :'falla' \\gset
   select concat_ws(',', :'t', :'e1', :'d1', :'e2', pg_temp.eh(pg_temp.deshace_falla(:'falla')), pg_temp.eh(pg_temp.deshace_falla(:'contraria')),
     pg_temp.eh(pg_temp.deshace_falla(gen_random_uuid())));`,
  "SIN_ERROR,hecha,SIN_ERROR,en_curso,P0001|deshacer_ya_hecho,P0001|deshacer_origen,P0001|falla_inexistente"
);
caso(
  "U2 lo anotado no se edita ni se borra: un UPDATE o un DELETE sobre una falla se rechaza (42501)",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select concat_ws(',', :'t',
     pg_temp.eh(pg_temp.intento(format('update retail.produccion_fallas set motivo = %L where fase_id = %L', 'otra cosa', :'f_planch'))),
     pg_temp.eh(pg_temp.intento(format('delete from retail.produccion_fallas where fase_id = %L', :'f_planch'))));`,
  "SIN_ERROR,42501|,42501|"
);

// L. LECTURA --------------------------------------------------------------------------------------------------------------------
caso(
  "L1 la orden en una lectura trae las fallas por talla y color (2 segundas del primer color) y una entrada «falla» en la línea de tiempo, con su destino, su motivo y su id para deshacerla",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select concat_ws(',', :'t',
     (select v ->> 'fallas_segundas' from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f, jsonb_array_elements(f -> 'por_variante') v
       where f ->> 'clave' = 'planchado' and v ->> 'variante_id' = :'v1'),
     (select count(*) from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'linea_de_tiempo') e
       where e ->> 'tipo' = 'falla' and e ->> 'destino' = 'segunda' and e ->> 'motivo' = 'Mancha' and e ->> 'falla_id' is not null));`,
  "SIN_ERROR,2,1"
);
caso(
  "L2 la Actividad dice cuántas salieron con falla",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select concat_ws(',', :'t', (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_avance' and a.descripcion like '%(2 con falla)%'));`,
  "SIN_ERROR,1"
);
caso(
  "L3 una integrante de otra sede no anota en el Taller (42501), ni con fallas",
  `${ABRE}
   ${HASTA_COSTURA}
   ${como(MICAELA)}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select split_part(:'t', '|', 1);`,
  "42501"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la forma: una función de cada una, security definer con search_path, authenticated sí y anon no; registrar_avance sigue siendo una sola; la tabla, cerrada a la pantalla",
  `select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('anotar_termine', 'deshacer_falla', 'registrar_avance')),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('anotar_termine', 'deshacer_falla')),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('anotar_termine', 'deshacer_falla')),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('anotar_termine', 'deshacer_falla')),
     (select relrowsecurity from pg_class where oid = 'retail.produccion_fallas'::regclass),
     has_table_privilege('authenticated', 'retail.produccion_fallas', 'select'));`,
  "3,t,t,f,t,f"
);
caso(
  "S2 el candado: las tres toman la MISMA llave por orden que las demás escrituras de la orden",
  `select count(*) filter (where pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock(hashtextextended(''produccion:'' || %')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('anotar_termine', 'deshacer_falla', 'registrar_avance');`,
  "3"
);
caso(
  "S3 la migración se vuelve a cargar encima sin error (idempotente) y no duplica nada",
  `${MIGRACION}
   select concat_ws(',', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('anotar_termine', 'deshacer_falla', 'registrar_avance', 'fn_produccion_fecha_real')),
     (select count(*) from pg_trigger where tgrelid = 'retail.produccion_fallas'::regclass and not tgisinternal));`,
  "4,1"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
