#!/usr/bin/env node
/**
 * Los CINCO pasos fijos de una orden (ADR-0551, actividad 1; migración 20261028052000). CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden se abra con Ploteo · Corte · Habilitado · Costura · Planchado y nada más (Limpiar hilos y revisar y Etiquetar y embolsar son opcionales), que cada
 * uno de los cinco falte con su frase y su hint (`fases_espina`), que una orden de siete pasos (la de hoy) y la ruta anterior (Corte · Costura · Acabado) sigan abriéndose, que
 * `acabado` siga sin mezclarse con la ruta nueva, y que una orden de cinco pase al stock de punta a punta con Planchado como ÚLTIMA fase (el candado de las buenas mira ahí).
 * También que la migración se pueda volver a pegar sin cambiar nada.
 *
 * Cada caso corre en su propia transacción con ROLLBACK. Contra la base tal como queda con TODAS las migraciones aplicadas (la misma de CI).
 *
 * USO
 *   node scripts/pruebas/produccion_cinco_pasos.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_cinco_pasos.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_cinco_pasos.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261028052000_produccion_cinco_pasos_fijos.sql", import.meta.url)), "utf8");

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
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', p_fase, p_lineas)) $f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, 1400, 200, 0, false)', p_oid, p_buenas)) $f$;
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cambiar_quien_fase(%L, %L, %L, %L, null, null, null)', p_fase, p_quien, p_prov, p_tarifa)) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Plancha Cinco Pasos Prueba', 'maquila') returning id as plancha \\gset
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
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const RUTA = (...claves) => `jsonb_build_array(${claves.map(TALLER).join(", ")})`;
const CINCO = ["ploteo", "corte", "habilitado", "costura", "planchado"];
const ABRE = (...claves) => `select pg_temp.abre(${APERTURA}, ${RUTA(...claves)}) as r \\gset`;
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
const ESTADOS = `(select string_agg((f ->> 'clave') || ':' || (f ->> 'estado'), ' ' order by (f ->> 'secuencia')::int) from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f)`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const MOV_ENTRADA = `(select coalesce(sum(cantidad), 0) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion')`;

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

// A. LA ORDEN DE CINCO PASOS ---------------------------------------------------------------------------------------------------------
caso(
  "A1 una orden con SOLO los cinco pasos fijos se abre, con las cinco fases en su lugar de la ruta (ploteo 5 · corte 10 · habilitado 15 · costura 30 · planchado 65)",
  `${ABRE(...CINCO)}
   ${IDS}
   select concat_ws(',', :'r', ${SECUENCIAS});`,
  "OK,ploteo:5 corte:10 habilitado:15 costura:30 planchado:65"
);
caso(
  "A2 de punta a punta: ploteo marcado, corte, habilitado, costura y planchado de 50 y pasar al stock entran las 50 al Taller; todas las fases quedan hechas y la orden, terminada",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a4 \\gset
   select ${ESTADOS} as estados \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'m', :'estados', :'c', ${ESTADO}, (select cantidad_buenas from retail.producciones where id = :'oid'), ${MOV_ENTRADA});`,
  "SIN_ERROR,ploteo:hecha corte:hecha habilitado:hecha costura:hecha planchado:hecha,SIN_ERROR,terminada,50,50"
);
caso(
  "A3 la ÚLTIMA fase es Planchado: pasar de más al stock se rechaza con su frase («en Planchado se terminaron 30») y no deja nada escrito",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a4 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 31], ["v2", 20])}) as c \\gset
   select concat_ws(',', pg_temp.eh(:'c'), :'c' like '%en Planchado se terminaron 30%', ${ESTADO}, ${MOV_ENTRADA});`,
  "P0001|cierre_buenas_exceden,t,en_proceso,0"
);
caso(
  "A4 sin Habilitado no hay cinco pasos: se rechaza con `fases_espina` y la frase nueva («Ploteo, Corte, Habilitado, Costura y Planchado»)",
  `select pg_temp.abre(${APERTURA}, ${RUTA("ploteo", "corte", "costura", "planchado")}) as r \\gset
   select concat_ws(',', pg_temp.eh(:'r'), :'r' like '%Ploteo, Corte, Habilitado, Costura y Planchado%');`,
  "P0001|fases_espina,t"
);
caso(
  "A5 cada uno de los cinco hace falta: sin Ploteo, sin Corte, sin Costura o sin Planchado también se rechaza (`fases_espina`)",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA("corte", "habilitado", "costura", "planchado")})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA("ploteo", "habilitado", "costura", "planchado")})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA("ploteo", "corte", "habilitado", "planchado")})),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA("ploteo", "corte", "habilitado", "costura")})));`,
  "P0001|fases_espina,P0001|fases_espina,P0001|fases_espina,P0001|fases_espina"
);

// B. LOS OPCIONALES --------------------------------------------------------------------------------------------------------------------
caso(
  "B1 los opcionales se suman en su lugar de la ruta, en cualquier combinación: Ojales y botones (35), Limpiar hilos y revisar (55) y Etiquetar y embolsar (70)",
  `${ABRE(...CINCO, "ojales_botones", "limpieza_revision", "etiquetado_embolsado")}
   ${IDS}
   select concat_ws(',', :'r', ${SECUENCIAS});`,
  "OK,ploteo:5 corte:10 habilitado:15 costura:30 ojales_botones:35 limpieza_revision:55 planchado:65 etiquetado_embolsado:70"
);
caso(
  "B2 con solo Etiquetar y embolsar (sin Limpiar) se abre, y entonces la última fase es Etiquetar y embolsar: el candado de las buenas mira ahí y el cierre completo funciona",
  `${ABRE(...CINCO, "etiquetado_embolsado")}
   ${IDS}
   select id as f_etiq from retail.produccion_fases where produccion_id = :'oid' and clave = 'etiquetado_embolsado' \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a4 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c_antes \\gset
   select pg_temp.avanza(:'f_etiq', ${L(["v1", 30], ["v2", 20])}) as a5 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'r', :'c_antes' like '%en Etiquetar y embolsar se terminaron 0%', :'c', ${ESTADO}, ${MOV_ENTRADA});`,
  "OK,t,SIN_ERROR,terminada,50"
);

// C. LO QUE NO CAMBIA ------------------------------------------------------------------------------------------------------------------
caso(
  "C1 una orden de SIETE pasos (la de hoy: las cinco más Limpiar y Etiquetar) sigue abriéndose",
  `${ABRE(...CINCO, "limpieza_revision", "etiquetado_embolsado")}
   ${IDS}
   select concat_ws(',', :'r', (select count(*) from retail.produccion_fases where produccion_id = :'oid'));`,
  "OK,7"
);
caso(
  "C2 la ruta anterior (Corte · Costura · Acabado) sigue abriéndose, y `acabado` no se mezcla con la ruta nueva (`fases_mezcla`)",
  `${ABRE("corte", "costura", "acabado")}
   select :'r' as vieja \\gset
   select concat_ws(',', :'vieja', pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA(...CINCO, "acabado")})));`,
  "OK,P0001|fases_mezcla"
);
caso(
  "C3 una fase que no existe se rechaza con su hint (`fase_desconocida`) antes de mirar los cinco pasos",
  `select pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA(...CINCO, "pegado_de_botones")}));`,
  "P0001|fase_desconocida"
);
caso(
  "C4 cambiar quién hace un paso (Planchado → servicio, con proveedor y tarifa) sigue funcionando en una orden de cinco mientras ese paso no empiece",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.cambia(:'f_planch', 'servicio', :'plancha', 1.20) as c1 \\gset
   select (select quien from retail.produccion_fases where id = :'f_planch') as quien \\gset
   select concat_ws(',', :'c1', :'quien');`,
  "SIN_ERROR,servicio"
);

// E. LA FECHA PROMETIDA PASADA VALE (ADR-0537 llevado a main, migración 20261028064000) --------------------------------------------------------
const PLANCHADO_AFUERA = (fecha) =>
  `jsonb_build_object('clave', 'planchado', 'quien', 'servicio', 'proveedor_id', :'plancha', 'tarifa_prenda', '1.20', 'fecha_prometida', ${fecha})`;
const RUTA_CON_PLANCHADO = (fecha) => `jsonb_build_array(${["ploteo", "corte", "habilitado", "costura"].map(TALLER).join(", ")}, ${PLANCHADO_AFUERA(fecha)})`;
caso(
  "E1 una fecha prometida PASADA vale (se registra una orden que ya se hizo); una que no existe se rechaza (`fase_fecha_invalida`); y la fecha de ENTREGA de la orden sigue sin poder ser pasada (`entrega_pasada`)",
  `select concat_ws(',',
     pg_temp.abre(${APERTURA}, ${RUTA_CON_PLANCHADO("(retail.fn_hoy_lima() - 30)::text")}),
     pg_temp.eh(pg_temp.abre(${APERTURA}, ${RUTA_CON_PLANCHADO("'2026-02-30'")})),
     pg_temp.eh(pg_temp.abre(${APERTURA} || jsonb_build_object('fecha_entrega', (retail.fn_hoy_lima() - 1)::text), ${RUTA(...CINCO)})));`,
  "OK,P0001|fase_fecha_invalida,P0001|entrega_pasada"
);

// D. LA MIGRACIÓN SE PUEDE VOLVER A PEGAR ----------------------------------------------------------------------------------------------
caso(
  "D1 volver a pegar la migración no cambia nada: la función queda idéntica (misma huella) y sigue aceptando los cinco pasos",
  `select md5(pg_get_functiondef('retail.fn_produccion_fases_normalizar(jsonb)'::regprocedure)) as antes \\gset
   ${MIGRACION.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "")}
   select concat_ws(',', md5(pg_get_functiondef('retail.fn_produccion_fases_normalizar(jsonb)'::regprocedure)) = :'antes',
     pg_temp.abre(${APERTURA}, ${RUTA(...CINCO)}));`,
  "t,OK"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
