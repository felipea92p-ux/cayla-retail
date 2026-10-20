#!/usr/bin/env node
/**
 * Pruebas de las fases nuevas de la orden de producción, «expandir» (ADR-0400 act. k y l, paquete R1, actividad 1) — migración
 * `20261019191000_produccion_fases_nuevas_expandir.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la base ACEPTE la ruta nueva (Ploteo · Corte · Habilitado · Costura · Ojales y botones (opcional) · Limpiar hilos y revisar ·
 * Planchado · Etiquetar y embolsar) SIN dejar de aceptar la anterior (Corte · Costura · Acabado), porque la web desplegada todavía abre órdenes con
 * la anterior; que mezclarlas se rechace; que la secuencia de la ruta y los nombres sean los decididos; que «Cambiar quién» valide contra las fases
 * REALES de la orden (antes armaba una espina fija de tres y, con la ruta nueva, rechazaba cualquier cambio); que la lista de precios de los
 * servicios acepte las claves nuevas y las ordene por la ruta; y que la migración se pueda pegar otra vez y también sobre las funciones de antes.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   E  EL ESQUEMA: los dos CHECK de la clave aceptan las claves nuevas y hay uno solo por tabla; la migración dos veces; desde las funciones de
 *      antes (154000, 20261015160000 y 20261015172000 cargadas encima) hasta las nuevas, con su candado de md5.
 *   S  LA RUTA: la secuencia de cada clave (y de bordado y estampado sobre pieza y sobre prenda) y el nombre de cada una.
 *   A  ABRIR: la ruta anterior abre como siempre; la nueva abre con sus fases en su secuencia (con y sin Ojales y botones); una ruta nueva
 *      incompleta, mezclada con Acabado o con una clave desconocida se rechaza con su motivo y sin abrir; un servicio en una fase nueva copia la
 *      tarifa de la lista de precios.
 *   C  CAMBIAR QUIÉN: en la ruta nueva y en la anterior, antes de empezar sí; con un avance anotado, no.
 *   T  LA LISTA DE PRECIOS: guardar una tarifa en una fase nueva, rechazar una fase que no existe, y la lista ordenada por la ruta.
 *   F  LA FORMA: lo que era interno sigue cerrado a la API y lo que era de la web sigue abierto.
 *
 * USO
 *   node scripts/pruebas/produccion_fases_nuevas.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_fases_nuevas.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_fases_nuevas.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = leer("20261019191000_produccion_fases_nuevas_expandir.sql");
// Las migraciones que dejaron las seis funciones (y las de avance y lectura que las rodean) como estaban ANTES (en el orden en que se pegaron).
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

// Primero las funciones como estaban ANTES de esta migración (una migración posterior las pudo cambiar: la base de CI las trae todas aplicadas y el candado de md5
// de esta migración solo acepta el cuerpo anterior o el suyo), y encima la migración. Datos propios: un proveedor de maquila, uno de tela, y el modelo del seed.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ANTERIORES}
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Textiles Fases Nuevas', 'tela') returning id as prov_tela \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Fases Nuevas', 'maquila') returning id as maquila \\gset
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

const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const AFUERA = (clave, extra = {}) =>
  FASE({ clave: `'${clave}'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.50'`, cantidad_minima: `'50'`,
    fecha_prometida: `(retail.fn_hoy_lima() + 7)::text`, ...extra });
const ARREGLO = (...fases) => `jsonb_build_array(${fases.join(", ")})`;
// La ruta anterior y la nueva (con la costura y el planchado afuera). Ojales y botones se suma aparte.
const RUTA_ANTERIOR = ARREGLO(TALLER("corte"), AFUERA("costura"), TALLER("acabado"));
const FIJAS_NUEVAS = (extra = []) =>
  ARREGLO(TALLER("ploteo"), TALLER("corte"), TALLER("habilitado"), AFUERA("costura"), ...extra, TALLER("limpieza_revision"), AFUERA("planchado"), TALLER("etiquetado_embolsado"));
const RUTA_NUEVA = FIJAS_NUEVAS();
const RUTA_NUEVA_CON_OJALES = FIJAS_NUEVAS([TALLER("ojales_botones")]);

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

const LAS_FASES = (clave) => `select string_agg(clave || ':' || secuencia || ':' || quien, ' ' order by secuencia) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima)${clave ?? ""}`;
const CLAVES_NUEVAS = ["ploteo", "habilitado", "ojales_botones", "limpieza_revision", "planchado", "etiquetado_embolsado"];

// E. EL ESQUEMA ----------------------------------------------------------------------------------------------------------------
const CHECK_CLAVE = (tabla, nombre) => `(select count(*) from pg_constraint where conrelid = 'retail.${tabla}'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%lavanderia%'),
     (select bool_and(${CLAVES_NUEVAS.map((c) => `pg_get_constraintdef(oid) like '%${c}%'`).join(" and ")} and pg_get_constraintdef(oid) like '%acabado%')
        from pg_constraint where conrelid = 'retail.${tabla}'::regclass and conname = '${nombre}')`;
caso(
  "E1 los dos CHECK de la clave (fases de la orden y lista de precios) aceptan las seis claves nuevas y siguen aceptando acabado; hay uno solo por tabla",
  `reset role;
   select concat_ws(',', ${CHECK_CLAVE("produccion_fases", "produccion_fases_clave_check")}, ${CHECK_CLAVE("proveedor_tarifas", "proveedor_tarifas_fase_clave_check")});`,
  "1,t,1,t"
);
caso(
  "E2 la migración se vuelve a cargar sin error (idempotente): un solo CHECK por tabla y la ruta nueva sigue valiendo",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   reset role;
   select concat_ws(',',
     (select count(*) from pg_constraint where conrelid = 'retail.produccion_fases'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%lavanderia%'),
     (select count(*) from pg_constraint where conrelid = 'retail.proveedor_tarifas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%lavanderia%'),
     retail.fn_fase_secuencia('ploteo', null));`,
  "1,1,5"
);
caso(
  "E3 desde las funciones de antes (154000, 155000, 20261015160000 y 20261015172000 cargadas encima) la migración llega a las nuevas con su candado de md5, y la ruta nueva vuelve a abrir",
  `${ANTERIORES}
   set local search_path = retail, public, extensions;
   select coalesce(retail.fn_fase_secuencia('ploteo', null)::text, 'NULL') as antes \\gset
   ${MIGRACION}
   set local search_path = retail, public, extensions;
   ${como(FELIPE)}
   select pg_temp.abre(${APERTURA}, ${RUTA_NUEVA}) as r \\gset
   select concat_ws(',', :'antes', retail.fn_fase_secuencia('ploteo', null), :'r' ~ '^OK:');`,
  "NULL,5,t"
);
caso(
  "E4 el candado de md5 detiene el pegado si una de las seis funciones tiene otro cuerpo (alguien la parchó aparte): nada se pisa",
  `create or replace function retail.fn_fase_nombre(p_clave text) returns text language sql immutable set search_path = retail, public, extensions
     as $$ select 'parchada por otra sesión' $$;
   select pg_temp.intento($mig$${MIGRACION.replace(/\$\$/g, "$m$")}$mig$) as x \\gset
   select (:'x' like '%cambió desde que se escribió esta migración%')::text;`,
  "true"
);

// S. LA RUTA --------------------------------------------------------------------------------------------------------------------
const SECUENCIAS = [
  ["ploteo", null, 5], ["corte", null, 10], ["habilitado", null, 15], ["bordado", "pieza", 20], ["estampado", "pieza", 25], ["costura", null, 30],
  ["ojales_botones", null, 35], ["bordado", "prenda", 40], ["estampado", "prenda", 45], ["lavanderia", null, 50], ["limpieza_revision", null, 55],
  ["acabado", null, 60], ["planchado", null, 65], ["etiquetado_embolsado", null, 70], ["bordado", null, "null"], ["foo", null, "null"],
];
caso(
  "S1 la secuencia de cada fase es la de la ruta decidida (ploteo 5 · corte 10 · habilitado 15 · costura 30 · ojales 35 · lavandería 50 · limpiar 55 · planchado 65 · etiquetar 70), y una clave sin lugar da NULL",
  `select string_agg(c || '/' || coalesce(p, '-') || '=' || coalesce(retail.fn_fase_secuencia(c, p)::text, 'null'), ' ' order by o)
     from (values ${SECUENCIAS.map(([c, p], i) => `(${i}, '${c}', ${p ? `'${p}'` : "null::text"})`).join(", ")}) t (o, c, p);`,
  SECUENCIAS.map(([c, p, s]) => `${c}/${p ?? "-"}=${s}`).join(" ")
);
caso(
  "S2 cada clave tiene su nombre en lenguaje de tienda y una desconocida se devuelve tal cual",
  `select string_agg(retail.fn_fase_nombre(c), ' · ' order by o) from (values (1, 'ploteo'), (2, 'corte'), (3, 'habilitado'), (4, 'costura'), (5, 'ojales_botones'),
     (6, 'limpieza_revision'), (7, 'planchado'), (8, 'etiquetado_embolsado'), (9, 'acabado'), (10, 'bordado'), (11, 'estampado'), (12, 'lavanderia'), (13, 'foo')) t (o, c);`,
  "Ploteo · Corte · Habilitado · Costura · Ojales y botones · Limpiar hilos y revisar · Planchado · Etiquetar y embolsar · Acabado · Bordado · Estampado · Lavandería · foo"
);

// A. ABRIR ----------------------------------------------------------------------------------------------------------------------
caso(
  "A1 la ruta ANTERIOR abre como siempre (Corte, Costura afuera, Acabado): la web desplegada no se rompe",
  `select pg_temp.abre(${APERTURA}, ${RUTA_ANTERIOR}) as r \\gset
   select :'r' || ',' || (${LAS_FASES()});`,
  (o) => /^OK:\d+,corte:10:taller costura:30:servicio acabado:60:taller$/.test(o)
);
caso(
  "A2 la ruta NUEVA abre con sus siete fases en su secuencia (costura y planchado afuera con su tarifa congelada)",
  `select pg_temp.abre(${APERTURA}, ${RUTA_NUEVA}) as r \\gset
   select :'r' || ',' || (${LAS_FASES()}) || ',' ||
     (select count(*) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and quien = 'servicio' and tarifa_prenda = 4.50 and proveedor_id = :'maquila');`,
  (o) =>
    /^OK:\d+,ploteo:5:taller corte:10:taller habilitado:15:taller costura:30:servicio limpieza_revision:55:taller planchado:65:servicio etiquetado_embolsado:70:taller,2$/.test(o)
);
caso(
  "A3 con Ojales y botones encendidos son ocho fases y el ojal queda justo después de Costura; con bordado sobre prenda va después del ojal",
  `select pg_temp.abre(${APERTURA}, ${RUTA_NUEVA_CON_OJALES}) as r1 \\gset
   select (${LAS_FASES()}) as f1 \\gset
   select pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("ploteo"), TALLER("corte"), TALLER("habilitado"), TALLER("costura"), TALLER("ojales_botones"),
     FASE({ clave: `'bordado'`, quien: `'taller'`, posicion: `'prenda'` }), TALLER("limpieza_revision"), TALLER("planchado"), TALLER("etiquetado_embolsado"))}) as r2 \\gset
   select (${LAS_FASES()}) as f2 \\gset
   select :'f1' || ',' || :'f2';`,
  (o) =>
    o ===
    "ploteo:5:taller corte:10:taller habilitado:15:taller costura:30:servicio ojales_botones:35:taller limpieza_revision:55:taller planchado:65:servicio etiquetado_embolsado:70:taller," +
      "ploteo:5:taller corte:10:taller habilitado:15:taller costura:30:taller ojales_botones:35:taller bordado:40:taller limpieza_revision:55:taller planchado:65:taller etiquetado_embolsado:70:taller"
);
caso(
  "A4 una ruta nueva incompleta (sin Habilitado, sin Ploteo, sin Etiquetar) se rechaza con fases_espina y sin abrir ni gastar número",
  `select last_value as antes from retail.producciones_numero_seq \\gset
   select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("ploteo"), TALLER("corte"), TALLER("costura"), TALLER("limpieza_revision"), TALLER("planchado"), TALLER("etiquetado_embolsado"))})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("corte"), TALLER("habilitado"), TALLER("costura"), TALLER("limpieza_revision"), TALLER("planchado"), TALLER("etiquetado_embolsado"))})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("ploteo"), TALLER("corte"), TALLER("habilitado"), TALLER("costura"), TALLER("limpieza_revision"), TALLER("planchado"))})),
     (select count(*) from retail.producciones where producto_id = :'prod' and created_at > now() - interval '5 seconds'),
     (select last_value = :'antes' from retail.producciones_numero_seq));`,
  "P0001|fases_espina,P0001|fases_espina,P0001|fases_espina,0,t"
);
caso(
  "A5 mezclar las dos rutas se rechaza con fases_mezcla: Acabado con las siete nuevas, y Habilitado con Corte · Costura · Acabado",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${FIJAS_NUEVAS([TALLER("acabado")])})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("corte"), TALLER("habilitado"), TALLER("costura"), TALLER("acabado"))})));`,
  "P0001|fases_mezcla,P0001|fases_mezcla"
);
caso(
  "A6 lo de siempre sigue igual: una clave desconocida, una fase repetida, la ruta anterior sin Costura y un servicio sin proveedor en una fase nueva",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("corte"), TALLER("costura"), TALLER("acabado"), TALLER("foo"))})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("corte"), TALLER("corte"), TALLER("costura"), TALLER("acabado"))})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("corte"), TALLER("acabado"))})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${FIJAS_NUEVAS().replace(TALLER("limpieza_revision"), FASE({ clave: `'limpieza_revision'`, quien: `'servicio'`, tarifa_prenda: `'1'` }))})));`,
  "P0001|fase_desconocida,P0001|fase_repetida,P0001|fases_espina,P0001|fase_sin_proveedor"
);
caso(
  "A7 sin tarifa escrita, un servicio en una fase nueva copia la de la lista de precios (la vigente más reciente, con su mínimo y su fijo)",
  `insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima, fijo_orden, vigente_desde)
     values (:'maquila', 'planchado', 1.10, 100, 0, retail.fn_hoy_lima() - 30), (:'maquila', 'planchado', 1.40, 150, 25, retail.fn_hoy_lima() - 1),
            (:'maquila', 'ploteo', 30.00, null, 30, retail.fn_hoy_lima() - 1);
   select pg_temp.abre(${APERTURA}, ${ARREGLO(TALLER("ploteo"), TALLER("corte"), TALLER("habilitado"), TALLER("costura"), TALLER("limpieza_revision"),
     FASE({ clave: `'planchado'`, quien: `'servicio'`, proveedor_id: `:'maquila'` }), TALLER("etiquetado_embolsado"))}) as r \\gset
   select :'r' || ',' || (select tarifa_prenda || ':' || cantidad_minima || ':' || fijo_orden from retail.produccion_fases
     where produccion_id = (select id from pg_temp.ultima) and clave = 'planchado');`,
  (o) => /^OK:\d+,1\.40:150:25\.00$/.test(o)
);

// C. CAMBIAR QUIÉN --------------------------------------------------------------------------------------------------------------
caso(
  "C1 en la ruta NUEVA, antes de empezar, el planchado pasa al Taller y vuelve a un servicio con su tarifa (antes de esta migración cualquier cambio se rechazaba)",
  `select pg_temp.abre(${APERTURA}, ${RUTA_NUEVA}) as r \\gset
   select id as f_planch from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'planchado' \\gset
   select id as f_habil from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'habilitado' \\gset
   select pg_temp.cambia(:'f_planch', 'taller', null, null, null, null, null) as c1 \\gset
   select pg_temp.cambia(:'f_planch', 'servicio', :'maquila', 1.20, 10, 60, null) as c2 \\gset
   select pg_temp.cambia(:'f_habil', 'servicio', :'maquila', 2.00, null, null, null) as c3 \\gset
   select concat_ws(',', :'c1', :'c2', :'c3', (${LAS_FASES()}), pg_temp.eh(pg_temp.cambia(:'f_planch', 'servicio', :'maquila', null, null, null, null)));`,
  "OK:taller:-,OK:servicio:1.20,OK:servicio:2.00,ploteo:5:taller corte:10:taller habilitado:15:servicio costura:30:servicio limpieza_revision:55:taller planchado:65:servicio etiquetado_embolsado:70:taller,P0001|fase_sin_tarifa"
);
caso(
  "C2 en la ruta ANTERIOR cambia igual que siempre; con un avance anotado ya no se cambia (fase_empezada) en ninguna de las dos rutas",
  `select pg_temp.abre(${APERTURA}, ${RUTA_ANTERIOR}) as r1 \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura' \\gset
   select pg_temp.cambia(:'f_cost', 'taller', null, null, null, null, null) as c1 \\gset
   select pg_temp.abre(${APERTURA}, ${RUTA_NUEVA}) as r2 \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'corte' \\gset
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 5, 'taller', :'felipe_p');
   select concat_ws(',', :'c1', pg_temp.eh(pg_temp.cambia(:'f_corte', 'servicio', :'maquila', 1, null, null, null)));`,
  "OK:taller:-,P0001|fase_empezada"
);

// T. LA LISTA DE PRECIOS --------------------------------------------------------------------------------------------------------
caso(
  "T1 la lista de precios guarda tarifas en las fases nuevas, rechaza una fase que no existe, y la devuelve ordenada por la ruta (no por el alfabeto)",
  `select concat_ws(',',
     pg_temp.intento('select retail.guardar_tarifa_servicio(''' || :'maquila' || ''', ''planchado'', 1.20, 100, 0, null)'),
     pg_temp.intento('select retail.guardar_tarifa_servicio(''' || :'maquila' || ''', ''ploteo'', 30, null, 30, null)'),
     pg_temp.intento('select retail.guardar_tarifa_servicio(''' || :'maquila' || ''', ''habilitado'', 0.80, 100, 0, null)'),
     pg_temp.eh(pg_temp.intento('select retail.guardar_tarifa_servicio(''' || :'maquila' || ''', ''foo'', 1, null, 0, null)')),
     pg_temp.eh(pg_temp.intento('select retail.guardar_tarifa_servicio(''' || :'prov_tela' || ''', ''planchado'', 1, null, 0, null)')));
   select string_agg(t ->> 'fase_clave', '>' order by ord) from jsonb_array_elements(retail.fn_tarifas_de_servicios()) with ordinality as x (t, ord) where t ->> 'proveedor_id' = :'maquila';`,
  "ploteo>habilitado>planchado"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
const DE = (nombres) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in (${nombres})`;
caso(
  "F1 las funciones de la web siguen siendo security definer con search_path y abiertas a authenticated; las internas, cerradas a la API",
  `reset role;
   select concat_ws(',',
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%' and has_function_privilege('authenticated', p.oid, 'execute')
                      and not has_function_privilege('anon', p.oid, 'execute')) ${DE("'cambiar_quien_fase','fn_tarifas_de_servicios','guardar_tarifa_servicio'")}),
     (select count(*) ${DE("'cambiar_quien_fase','fn_tarifas_de_servicios','guardar_tarifa_servicio'")}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
        ${DE("'fn_fase_secuencia','fn_fase_nombre','fn_produccion_fases_normalizar'")}),
     (select bool_and(array_to_string(p.proconfig, ',') like '%search_path%') ${DE("'fn_fase_secuencia','fn_fase_nombre','fn_produccion_fases_normalizar'")}));`,
  "t,3,f,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
