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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)
const SIN_CANDADO = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const leer = (archivo) => SIN_CANDADO(readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${archivo}`, import.meta.url)), "utf8"));
const CINCO_PASOS = leer("20261028052000_produccion_cinco_pasos_fijos.sql");
const MIGRACION = leer("20261028071000_produccion_quitar_paso_de_la_orden.sql");

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
create function pg_temp.quita(p_fase uuid, p_motivo text) returns text language sql as $f$
  select pg_temp.intento(format('select retail.quitar_paso_orden(%L, %L)', p_fase, p_motivo)) $f$;
create function pg_temp.deshace(p_avance uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.deshacer_avance(%L)', p_avance)) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${CINCO_PASOS}
${MIGRACION}
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

// Lo de siempre de la prueba hermana, más los dos opcionales de la ruta de siete.
const SIETE = ["ploteo", "corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado"];
const IDS7 = `${IDS}
select id as f_limp from retail.produccion_fases where produccion_id = :'oid' and clave = 'limpieza_revision' \\gset
select id as f_etiq from retail.produccion_fases where produccion_id = :'oid' and clave = 'etiquetado_embolsado' \\gset
`;
const ACTIVIDAD = (patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_paso_quitado' and a.descripcion like '${patron}')`;
const FILAS_FASES = `(select count(*) from retail.produccion_fases where produccion_id = :'oid')`;
const TODO_HECHO_HASTA_PLANCHADO = `
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset`;

// Q. QUITAR UN PASO QUE NO EMPEZÓ ------------------------------------------------------------------------------------------------------
caso(
  "Q1 a una orden de SIETE pasos sin empezar se le quitan Limpiar hilos y revisar y Etiquetar y embolsar: quedan los cinco fijos en su lugar de la ruta",
  `${ABRE(...SIETE)}
   ${IDS7}
   select pg_temp.quita(:'f_limp', 'los hace la tienda') as q1 \\gset
   select pg_temp.quita(:'f_etiq', 'los hace la tienda') as q2 \\gset
   select concat_ws(',', :'r', :'q1', :'q2', ${SECUENCIAS});`,
  "OK,SIN_ERROR,SIN_ERROR,ploteo:5 corte:10 habilitado:15 costura:30 planchado:65"
);
caso(
  "Q2 sin esos dos pasos la orden CIERRA: ploteo marcado, corte, habilitado y costura de 50, Planchado de 50 y pasar al stock entran las 50 al Taller (la última fase ya es Planchado)",
  `${ABRE(...SIETE)}
   ${IDS7}
   select pg_temp.quita(:'f_limp', null) as q1 \\gset
   select pg_temp.quita(:'f_etiq', null) as q2 \\gset
   ${TODO_HECHO_HASTA_PLANCHADO}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a4 \\gset
   select ${ESTADOS} as estados \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'estados', :'c', ${ESTADO}, ${MOV_ENTRADA});`,
  "ploteo:hecha corte:hecha habilitado:hecha costura:hecha planchado:hecha,SIN_ERROR,terminada,50"
);
caso(
  "Q3 SIN quitarlos la misma orden NO cierra con Planchado hecho (es el problema que esto resuelve): «Etiquetar y embolsar» sigue pendiente y manda el cierre",
  `${ABRE(...SIETE)}
   ${IDS7}
   ${TODO_HECHO_HASTA_PLANCHADO}
   select ${ESTADOS} as estados \\gset
   select concat_ws(',', :'estados' like '%etiquetado_embolsado:pendiente', ${ESTADO});`,
  "t,en_proceso"
);
caso(
  "Q4 queda en Actividad con el número de la orden y el motivo, una fila por paso quitado",
  `${ABRE(...SIETE)}
   ${IDS7}
   select pg_temp.quita(:'f_limp', 'los hace la tienda') as q1 \\gset
   select pg_temp.quita(:'f_etiq', null) as q2 \\gset
   select concat_ws(',', ${ACTIVIDAD("quitó el paso Limpiar hilos y revisar de la OP-%: los hace la tienda")}, ${ACTIVIDAD("quitó el paso Etiquetar y embolsar de la OP-%")},
     (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_paso_quitado'));`,
  "1,1,2"
);

// F. UN PASO FIJO NO SE QUITA ----------------------------------------------------------------------------------------------------------
caso(
  "F1 los cinco fijos no se quitan: Ploteo, Corte, Habilitado, Costura y Planchado responden `paso_fijo` y la orden conserva sus siete pasos",
  `${ABRE(...SIETE)}
   ${IDS7}
   select concat_ws(',', pg_temp.eh(pg_temp.quita(:'f_plot', null)), pg_temp.eh(pg_temp.quita(:'f_corte', null)), pg_temp.eh(pg_temp.quita(:'f_hab', null)),
     pg_temp.eh(pg_temp.quita(:'f_cost', null)), pg_temp.eh(pg_temp.quita(:'f_planch', null)), ${FILAS_FASES});`,
  "P0001|paso_fijo,P0001|paso_fijo,P0001|paso_fijo,P0001|paso_fijo,P0001|paso_fijo,7"
);
caso(
  "F2 la frase del paso fijo dice cuál es («Corte» es un paso fijo de la ruta)",
  `${ABRE(...SIETE)}
   ${IDS7}
   select pg_temp.quita(:'f_corte', null) as q \\gset
   select (:'q' like '%«Corte» es un paso fijo de la ruta%')::text;`,
  "true"
);

// E. UN PASO CON ALGO ANOTADO NO SE QUITA ----------------------------------------------------------------------------------------------
caso(
  "E1 un paso con un avance no se quita (`fase_empezada`) y el paso que no empezó de la misma orden sí",
  `${ABRE(...SIETE)}
   ${IDS7}
   ${TODO_HECHO_HASTA_PLANCHADO}
   select pg_temp.avanza(:'f_limp', ${L(["v1", 10])}) as a \\gset
   select pg_temp.eh(pg_temp.quita(:'f_limp', null)) as q_limp \\gset
   select pg_temp.quita(:'f_etiq', null) as q_etiq \\gset
   select concat_ws(',', :'q_limp', :'q_etiq', ${FILAS_FASES});`,
  "P0001|fase_empezada,SIN_ERROR,6"
);
caso(
  "E2 aunque el avance se haya DESHECHO sigue sin quitarse: el Deshacer deja filas que apuntan a la fase (es historia)",
  `${ABRE(...SIETE)}
   ${IDS7}
   ${TODO_HECHO_HASTA_PLANCHADO}
   select pg_temp.avanza(:'f_limp', ${L(["v1", 10])}) as a \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_limp' order by created_at limit 1 \\gset
   select pg_temp.deshace(:'av') as d \\gset
   select concat_ws(',', :'d', pg_temp.eh(pg_temp.quita(:'f_limp', null)), ${FILAS_FASES});`,
  "SIN_ERROR,P0001|fase_empezada,7"
);
caso(
  "E3 una fase de Ploteo marcada «hecha» tampoco se quita, y dice que ya empezó (no que es fija)",
  `${ABRE(...SIETE)}
   ${IDS7}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.eh(pg_temp.quita(:'f_plot', null));`,
  "P0001|fase_empezada"
);

// R. REINTENTO, ORDEN CERRADA, PERMISOS -------------------------------------------------------------------------------------------------
caso(
  "R1 quitar dos veces el mismo paso (un reintento tras perder la red) responde `fase_inexistente` sin tocar nada más; un id inventado, lo mismo",
  `${ABRE(...SIETE)}
   ${IDS7}
   select pg_temp.quita(:'f_limp', null) as q1 \\gset
   select concat_ws(',', :'q1', pg_temp.eh(pg_temp.quita(:'f_limp', null)), pg_temp.eh(pg_temp.quita(gen_random_uuid(), null)), ${FILAS_FASES},
     ${ACTIVIDAD("quitó el paso Limpiar hilos y revisar%")});`,
  "SIN_ERROR,P0001|fase_inexistente,P0001|fase_inexistente,6,1"
);
caso(
  "R2 en una orden que ya pasó al stock no se quita nada (`orden_cerrada`)",
  `${ABRE(...CINCO)}
   ${IDS}
   ${TODO_HECHO_HASTA_PLANCHADO}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a4 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'c', pg_temp.eh(pg_temp.quita(:'f_planch', null)), ${FILAS_FASES});`,
  "SIN_ERROR,P0001|orden_cerrada,5"
);
caso(
  "R3 sin el módulo «produccion» en el rol (42501) y con el módulo pero parada en Trujillo (42501), no quita; Felipe sí",
  `${ABRE(...SIETE)}
   ${IDS7}
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.quita(:'f_limp', null)) as sin_modulo \\gset
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.quita(:'f_limp', null)) as en_trujillo \\gset
   ${como(FELIPE)}
   select pg_temp.quita(:'f_limp', null) as felipe \\gset
   select concat_ws(',', :'sin_modulo', :'en_trujillo', :'felipe', ${FILAS_FASES});`,
  "42501|produccion_sin_modulo,42501|produccion_sin_taller,SIN_ERROR,6"
);

// D. LA MIGRACIÓN SE PUEDE VOLVER A PEGAR -----------------------------------------------------------------------------------------------
caso(
  "D1 volver a pegar la migración no cambia nada: la función queda idéntica (misma huella) y sigue quitando",
  `select md5(pg_get_functiondef('retail.quitar_paso_orden(uuid,text)'::regprocedure)) as antes \\gset
   ${MIGRACION}
   ${ABRE(...SIETE)}
   ${IDS7}
   select concat_ws(',', md5(pg_get_functiondef('retail.quitar_paso_orden(uuid,text)'::regprocedure)) = :'antes', pg_temp.quita(:'f_etiq', null));`,
  "t,SIN_ERROR"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
