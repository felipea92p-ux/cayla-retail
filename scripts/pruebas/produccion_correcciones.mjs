#!/usr/bin/env node
/**
 * Pruebas de corregir, eliminar y restaurar cualquier anotación de una orden, con su historia (ADR-0570, actividad 3) — migración
 * `20261029173000_produccion_corregir_y_eliminar_con_historia.sql` (sobre `20261029164000`). CAYLA V2.
 *
 * LO QUE VIGILA. Que una anotación de cualquier día se pueda corregir (cantidades, fallas y día) o eliminar con motivo, y restaurar, sin borrar nada: cada cambio deja filas contrarias y
 * su fila en `produccion_cambios`, en la misma transacción. Que una corrección valide EXACTAMENTE lo mismo que «Terminé» (nunca más de lo que entró), que ningún cambio deje a la fase
 * siguiente con más prendas de las que le llegaron, y que las notas del equipo queden en la historia. Y que «Terminé», que ahora usa la misma regla, siga igual (eso lo vigila
 * `produccion_termine_con_falla.mjs`, que carga también esta migración).
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y las dos migraciones se cargan dentro de cada caso (así se prueba que se pueden pegar otra vez).
 *
 * QUÉ PRUEBA
 *   C  CORREGIR: uno que no es el último, el día, sin cambios, pasarse, lo que la fase siguiente ya usó, vacío y motivo, buenas que eran segundas, el momento exacto, lo ya cambiado.
 *   E  ELIMINAR: uno que no es el último, lo ya usado, una falla, la marca de Ploteo, sin motivo.
 *   R  RESTAURAR: con su día, una sola vez, si la fase se llenó, la marca, una falla.
 *   N  NOTAS: se escriben, vacías y largas no; otra sede no; en una orden en el stock solo la nota.
 *   L  LECTURA: los cambios en la orden y qué deshace cada Deshacer; la Actividad.
 *   S  LA FORMA: la tabla cerrada y de solo agregar, cada acción con su forma, permisos, el mismo candado por orden, idempotente.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (el candado se comprueba por su forma, S3), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/produccion_correcciones.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_correcciones.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_correcciones.mjs --base otra                 → contra otra base del mismo contenedor
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
const leer = (nombre) => SIN_CANDADO(readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${nombre}`, import.meta.url)), "utf8"));
// La de la actividad 2 (las fallas y el día) y la de esta (los cambios), en el orden en que se pegan.
const MIGRACION = `${leer("20261029164000_produccion_termine_con_falla_y_fecha.sql")}\n${leer("20261029173000_produccion_corregir_y_eliminar_con_historia.sql")}`;

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
create function pg_temp.corrige(p_ids text, p_lineas jsonb, p_fallas jsonb default null, p_dia date default null, p_motivo text default 'Cantidad equivocada') returns text language sql as $f$
  select pg_temp.intento(format('select retail.corregir_anotacion_orden(%L::uuid[], %L::jsonb, %L::jsonb, %L::date, %L)', p_ids, p_lineas, p_fallas, p_dia, p_motivo)) $f$;
create function pg_temp.elimina(p_ids text, p_motivo text default 'Se anotó dos veces') returns text language sql as $f$
  select pg_temp.intento(format('select retail.eliminar_anotacion_orden(%L::uuid[], %L)', p_ids, p_motivo)) $f$;
create function pg_temp.restaura(p_cambio uuid, p_motivo text default 'Se eliminó por error') returns text language sql as $f$
  select pg_temp.intento(format('select retail.restaurar_anotacion_orden(%L, %L)', p_cambio, p_motivo)) $f$;
create function pg_temp.comenta(p_oid uuid, p_texto text) returns text language sql as $f$ select pg_temp.intento(format('select retail.comentar_orden(%L, %L)', p_oid, p_texto)) $f$;
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

const IDS = (fase, extra = "") => `(select array_agg(id order by created_at)::text from retail.produccion_avances where fase_id = :'${fase}' and origen = 'taller' ${extra})`;
const HECHAS = (fase, v) => `(select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'${fase}' and variante_id = :'${v}')`;
const CAMBIOS = (accion) => `(select count(*) from retail.produccion_cambios where produccion_id = :'oid' and accion = '${accion}')`;
const CAMBIO = (accion) => `(select id from retail.produccion_cambios where produccion_id = :'oid' and accion = '${accion}' order by created_at desc limit 1)`;
// Una orden abierta hace 3 días: así se puede anotar «anteayer».
const ABRE_HACE_3 = `alter table retail.producciones disable trigger user;
   ${ABRE}
   update retail.producciones set created_at = now() - interval '3 days' where id = :'oid';
   alter table retail.producciones enable trigger user;`;

// C. CORREGIR -------------------------------------------------------------------------------------------------------------------
caso(
  "C1 se corrige un «Terminé» que NO es el último (25 → 23 del lunes, con 5 del martes encima): quedan 28, la fila vieja tiene su Deshacer y el cambio guarda el antes y el después",
  `${ABRE}
   ${HASTA_HABILITADO}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 25])}) as a \\gset
   select ${IDS("f_cost")} as ids1 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 5])}) as b \\gset
   select pg_temp.corrige(:'ids1', ${L(["v1", 23])}) as c \\gset
   select concat_ws(',', :'c', ${HECHAS("f_cost", "v1")}, ${CAMBIOS("corregir")},
     (select (antes -> 'buenas' -> 0 ->> 'cantidad') || '>' || (despues -> 'buenas' -> 0 ->> 'cantidad') from retail.produccion_cambios where produccion_id = :'oid'),
     (select count(*) from retail.produccion_avances where deshace_id = any (:'ids1'::uuid[])));`,
  "SIN_ERROR,28,1,25>23,1"
);
caso(
  "C2 se corrige el día: lo anotado para anteayer pasa a ayer, a mediodía de Lima",
  `${ABRE_HACE_3}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}, retail.fn_hoy_lima() - 2) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select pg_temp.corrige(:'ids', ${L(["v1", 5])}, null, retail.fn_hoy_lima() - 1, 'Fecha equivocada') as c \\gset
   select concat_ws(',', :'c',
     (select bool_and((hecho_en at time zone 'America/Lima') = (retail.fn_hoy_lima() - 1)::timestamp + interval '12 hours')
        from retail.produccion_avances where fase_id = :'f_corte' and origen = 'taller' and not exists (select 1 from retail.produccion_avances d where d.deshace_id = produccion_avances.id)));`,
  "SIN_ERROR,t"
);
caso(
  "C3 si no cambió nada, no se escribe nada (corregir_sin_cambios)",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.corrige(:'ids', ${L(["v1", 5])}, null, retail.fn_hoy_lima())), ${CAMBIOS("corregir")},
     (select count(*) from retail.produccion_avances where fase_id = :'f_corte' and origen = 'deshacer'));`,
  "P0001|corregir_sin_cambios,0,0"
);
caso(
  "C4 una corrección valida lo mismo que «Terminé»: no se pasa de lo que entró (avance_excede) y no queda nada a medias",
  `${ABRE}
   ${HASTA_HABILITADO}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30])}) as a \\gset
   select ${IDS("f_cost")} as ids \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.corrige(:'ids', ${L(["v1", 31])})), ${HECHAS("f_cost", "v1")}, ${CAMBIOS("corregir")});`,
  "P0001|avance_excede,30,0"
);
caso(
  "C5 no se baja lo que la fase siguiente ya usó: Habilitado 30 → 28 con Costura en 30 se rechaza (cambio_ya_avanzo)",
  `${ABRE}
   ${HASTA_COSTURA}
   select ${IDS("f_hab")} as ids \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.corrige(:'ids', ${L(["v1", 28], ["v2", 20])})), ${HECHAS("f_hab", "v1")});`,
  "P0001|cambio_ya_avanzo,30"
);
caso(
  "C6 sin nada se usa «Eliminar» (corregir_vacio); el motivo es obligatorio (cambio_sin_motivo) y de hasta 300 letras (cambio_motivo_largo)",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select concat_ws(',',
     pg_temp.eh(pg_temp.corrige(:'ids', '[]'::jsonb)),
     pg_temp.eh(pg_temp.corrige(:'ids', ${L(["v1", 4])}, null, null, '  ')),
     pg_temp.eh(pg_temp.corrige(:'ids', ${L(["v1", 4])}, null, null, repeat('x', 301))));`,
  "P0001|corregir_vacio,P0001|cambio_sin_motivo,P0001|cambio_motivo_largo"
);
caso(
  "C7 buenas que en realidad eran segundas: 30 → 28 buenas + 2 segundas, y Planchado sigue hecha",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30])}) as a \\gset
   select ${IDS("f_planch")} as ids \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v2", 20])}) as b \\gset
   select pg_temp.corrige(:'ids', ${L(["v1", 28])}, ${F(["v1", 2, "segunda"])}) as c \\gset
   select concat_ws(',', :'c', ${ESTADO_DE("planchado")}, ${FALLAS_DE("f_planch")}, ${HECHAS("f_planch", "v1")});`,
  "SIN_ERROR,hecha,1,28"
);
caso(
  "C8 con el mismo día, lo corregido conserva el momento exacto de antes (no pasa a hoy)",
  `${ABRE_HACE_3}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}, retail.fn_hoy_lima() - 2) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select hecho_en as h1 from retail.produccion_avances where id = (:'ids'::uuid[])[1] \\gset
   select pg_temp.corrige(:'ids', ${L(["v1", 4])}, null, retail.fn_hoy_lima() - 2) as c \\gset
   select concat_ws(',', :'c', (select hecho_en = :'h1'::timestamptz from retail.produccion_avances where fase_id = :'f_corte' and origen = 'taller' and cantidad = 4));`,
  "SIN_ERROR,t"
);
caso(
  "C9 lo ya corregido no se corrige otra vez (cambio_ya_deshecho); un Deshacer no se corrige (cambio_origen); una corrección es de una sola fase; una que no existe tampoco",
  `${ABRE}
   ${HASTA_HABILITADO}
   select ${IDS("f_corte")} as corte \\gset
   select ${IDS("f_hab")} as hab \\gset
   select pg_temp.corrige(:'corte', ${L(["v1", 32], ["v2", 20])}) as c1 \\gset
   select id as desh from retail.produccion_avances where deshace_id = (:'corte'::uuid[])[1] \\gset
   select concat_ws(',', :'c1',
     pg_temp.eh(pg_temp.corrige(:'corte', ${L(["v1", 31], ["v2", 20])})),
     pg_temp.eh(pg_temp.corrige(array[:'desh']::text, ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.corrige(array[(:'hab'::uuid[])[1], (${IDS("f_corte", "and not exists (select 1 from retail.produccion_avances d where d.deshace_id = produccion_avances.id)")}::uuid[])[1]]::text, ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.corrige(array[gen_random_uuid()]::text, ${L(["v1", 1])})));`,
  "SIN_ERROR,P0001|cambio_ya_deshecho,P0001|cambio_origen,P0001|cambio_varias_fases,P0001|cambio_inexistente"
);

// E. ELIMINAR -------------------------------------------------------------------------------------------------------------------
caso(
  "E1 se elimina un «Terminé» que NO es el último: quedan las 15 del segundo y el cambio dice qué quitó",
  `${ABRE}
   ${HASTA_HABILITADO}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 10])}) as a \\gset
   select ${IDS("f_cost")} as ids1 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 15])}) as b \\gset
   select pg_temp.elimina(:'ids1') as e \\gset
   select concat_ws(',', :'e', ${HECHAS("f_cost", "v1")}, ${CAMBIOS("eliminar")}, (select quita_ids::text = :'ids1' from retail.produccion_cambios where produccion_id = :'oid'));`,
  "SIN_ERROR,15,1,t"
);
caso(
  "E2 no se elimina lo que la fase siguiente ya usó (cambio_ya_avanzo) y no queda nada a medias",
  `${ABRE}
   ${HASTA_COSTURA}
   select ${IDS("f_hab")} as ids \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.elimina(:'ids')), (select count(*) from retail.produccion_avances where fase_id = :'f_hab' and origen = 'deshacer'), ${CAMBIOS("eliminar")});`,
  "P0001|cambio_ya_avanzo,0,0"
);
caso(
  "E3 eliminar una prenda con falla reabre la fase",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "segunda"])}) as t \\gset
   select ${ESTADO_DE("planchado")} as e1 \\gset
   select id as falla from retail.produccion_fallas where fase_id = :'f_planch' and cantidad > 0 \\gset
   select pg_temp.elimina(array[:'falla']::text) as e \\gset
   select concat_ws(',', :'e1', :'e', ${ESTADO_DE("planchado")});`,
  "hecha,SIN_ERROR,en_curso"
);
caso(
  "E4 la marca de Ploteo se elimina con motivo; otra vez no (cambio_ya_deshecho); su Deshacer no se elimina (cambio_origen)",
  `${ABRE}
   select pg_temp.marca(:'f_plot') as m \\gset
   select id as marca from retail.produccion_fase_marcas where fase_id = :'f_plot' \\gset
   select pg_temp.elimina(array[:'marca']::text, 'Todavía no se ploteó') as e \\gset
   select id as desmarca from retail.produccion_fase_marcas where deshace_id = :'marca' \\gset
   select concat_ws(',', :'e', retail.fn_produccion_marca_viva(:'f_plot') is null, (select objeto from retail.produccion_cambios where produccion_id = :'oid'),
     pg_temp.eh(pg_temp.elimina(array[:'marca']::text)), pg_temp.eh(pg_temp.elimina(array[:'desmarca']::text)));`,
  "SIN_ERROR,t,marca,P0001|cambio_ya_deshecho,P0001|cambio_origen"
);
caso(
  "E5 sin motivo (cambio_sin_motivo), sin nada que eliminar (cambio_sin_anotacion) o con algo que no existe (cambio_inexistente)",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.elimina(:'ids', '')), pg_temp.eh(pg_temp.elimina('{}')), pg_temp.eh(pg_temp.elimina(array[gen_random_uuid()]::text)));`,
  "P0001|cambio_sin_motivo,P0001|cambio_sin_anotacion,P0001|cambio_inexistente"
);

// R. RESTAURAR ------------------------------------------------------------------------------------------------------------------
caso(
  "R1 lo eliminado se restaura tal como era y con su día; la orden dice que ya se restauró",
  `${ABRE_HACE_3}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5], ["v2", 3])}, retail.fn_hoy_lima() - 2) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select hecho_en as h1 from retail.produccion_avances where id = (:'ids'::uuid[])[1] \\gset
   select pg_temp.elimina(:'ids') as e \\gset
   select ${HECHAS("f_corte", "v1")} as tras_eliminar \\gset
   select ${CAMBIO("eliminar")} as c \\gset
   select pg_temp.restaura(:'c') as r \\gset
   select concat_ws(',', :'e', :'tras_eliminar', :'r', ${HECHAS("f_corte", "v1")}, ${HECHAS("f_corte", "v2")},
     (select bool_and(hecho_en = :'h1'::timestamptz) from retail.produccion_avances a where a.fase_id = :'f_corte' and a.origen = 'taller' and not exists (select 1 from retail.produccion_avances d where d.deshace_id = a.id)),
     (select (x ->> 'restaurado')::boolean from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'cambios') x where x ->> 'accion' = 'eliminar'));`,
  "SIN_ERROR,0,SIN_ERROR,5,3,t,t"
);
caso(
  "R2 se restaura una sola vez (restaurar_ya_hecho); una corrección no se restaura (restaurar_no_es_eliminar); un cambio que no existe tampoco",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select pg_temp.corrige(:'ids', ${L(["v1", 4])}) as c1 \\gset
   select ${IDS("f_corte", "and not exists (select 1 from retail.produccion_avances d where d.deshace_id = produccion_avances.id)")} as vivos \\gset
   select pg_temp.elimina(:'vivos') as e \\gset
   select pg_temp.restaura(${CAMBIO("eliminar")}) as r1 \\gset
   select concat_ws(',', :'r1', pg_temp.eh(pg_temp.restaura(${CAMBIO("eliminar")})), pg_temp.eh(pg_temp.restaura(${CAMBIO("corregir")})), pg_temp.eh(pg_temp.restaura(gen_random_uuid())));`,
  "SIN_ERROR,P0001|restaurar_ya_hecho,P0001|restaurar_no_es_eliminar,P0001|cambio_inexistente"
);
caso(
  "R3 si mientras tanto la fase se llenó, restaurar no se pasa: avance_excede",
  `${ABRE}
   ${HASTA_HABILITADO}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30])}) as a \\gset
   select ${IDS("f_cost")} as ids \\gset
   select pg_temp.elimina(:'ids') as e \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30])}) as b \\gset
   select concat_ws(',', :'b', pg_temp.eh(pg_temp.restaura(${CAMBIO("eliminar")})), ${HECHAS("f_cost", "v1")});`,
  "SIN_ERROR,P0001|avance_excede,30"
);
caso(
  "R4 la marca se restaura; si alguien ya la volvió a marcar, no (marca_ya_hecha)",
  `${ABRE}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.elimina(array[(select id from retail.produccion_fase_marcas where fase_id = :'f_plot')]::text) as e1 \\gset
   select pg_temp.restaura(${CAMBIO("eliminar")}) as r1 \\gset
   select retail.fn_produccion_marca_viva(:'f_plot') is not null as viva \\gset
   select pg_temp.elimina(array[retail.fn_produccion_marca_viva(:'f_plot')]::text) as e2 \\gset
   select pg_temp.marca(:'f_plot') as m2 \\gset
   select concat_ws(',', :'r1', :'viva', :'e2', :'m2', pg_temp.eh(pg_temp.restaura(${CAMBIO("eliminar")})));`,
  "SIN_ERROR,t,SIN_ERROR,SIN_ERROR,P0001|marca_ya_hecha"
);
caso(
  "R5 una prenda con falla eliminada se restaura y la fase vuelve a cerrar",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.termina(:'f_planch', ${L(["v1", 28], ["v2", 20])}, null, ${F(["v1", 2, "perdida"])}) as t \\gset
   select pg_temp.elimina(array[(select id from retail.produccion_fallas where fase_id = :'f_planch')]::text) as e \\gset
   select ${ESTADO_DE("planchado")} as e1 \\gset
   select pg_temp.restaura(${CAMBIO("eliminar")}) as r \\gset
   select concat_ws(',', :'e', :'e1', :'r', ${ESTADO_DE("planchado")});`,
  "SIN_ERROR,en_curso,SIN_ERROR,hecha"
);

// N. NOTAS ----------------------------------------------------------------------------------------------------------------------
caso(
  "N1 una nota del equipo queda en la historia de la orden; vacía o de más de 500 letras, no",
  `${ABRE}
   select pg_temp.comenta(:'oid', 'La tela llegó con una mancha') as n \\gset
   select concat_ws(',', :'n', pg_temp.eh(pg_temp.comenta(:'oid', '   ')), pg_temp.eh(pg_temp.comenta(:'oid', repeat('x', 501))), ${CAMBIOS("nota")},
     (select x ->> 'texto' from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'cambios') x where x ->> 'accion' = 'nota'));`,
  "SIN_ERROR,P0001|nota_vacia,P0001|nota_larga,1,La tela llegó con una mancha"
);
caso(
  "N2 una integrante de otra sede no corrige, no elimina ni escribe notas en el Taller (42501)",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5])}) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   ${como(MICAELA)}
   select concat_ws(',', split_part(pg_temp.corrige(:'ids', ${L(["v1", 4])}), '|', 1), split_part(pg_temp.elimina(:'ids'), '|', 1), split_part(pg_temp.comenta(:'oid', 'hola'), '|', 1));`,
  "42501,42501,42501"
);
caso(
  "N3 con la orden ya en el stock no se corrige (orden_cerrada), pero una nota sí se escribe",
  `${ABRE}
   ${HASTA_COSTURA}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select ${IDS("f_planch")} as ids \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', :'c', ${ESTADO}, pg_temp.eh(pg_temp.corrige(:'ids', ${L(["v1", 29], ["v2", 20])})), pg_temp.comenta(:'oid', 'Se vendieron en la feria'));`,
  "SIN_ERROR,terminada,P0001|orden_cerrada,SIN_ERROR"
);

// L. LECTURA --------------------------------------------------------------------------------------------------------------------
caso(
  "L1 la orden en una lectura trae el cambio (lo que quitó, lo que puso y los Deshacer que escribió) y lo ya deshecho",
  `${ABRE}
   select pg_temp.termina(:'f_corte', ${L(["v1", 5], ["v2", 3])}) as t \\gset
   select ${IDS("f_corte")} as ids \\gset
   select pg_temp.corrige(:'ids', ${L(["v1", 4], ["v2", 3])}) as c \\gset
   select retail.fn_orden_produccion(:'oid') as o \\gset
   select concat_ws(',', :'c',
     (select jsonb_array_length(x -> 'quita_ids') || '/' || jsonb_array_length(x -> 'pone_ids') from jsonb_array_elements(:'o'::jsonb -> 'cambios') x where x ->> 'accion' = 'corregir'),
     (select count(*) from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') e, jsonb_array_elements(:'o'::jsonb -> 'cambios') x
       where e ->> 'tipo' = 'deshacer' and x ->> 'accion' = 'corregir' and (x -> 'deshace_ids') ? (e ->> 'id')),
     (select x ->> 'fase_nombre' from jsonb_array_elements(:'o'::jsonb -> 'cambios') x where x ->> 'accion' = 'corregir'),
     (select count(*) from jsonb_array_elements_text(:'o'::jsonb -> 'deshechos') d where d::uuid = any (:'ids'::uuid[])));`,
  "SIN_ERROR,2/2,2,Corte,2"
);
caso(
  "L2 la Actividad dice qué se corrigió, de cuánto a cuánto y por qué",
  `${ABRE}
   ${HASTA_HABILITADO}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 25])}) as a \\gset
   select pg_temp.corrige(${IDS("f_cost")}, ${L(["v1", 23])}) as c \\gset
   select concat_ws(',', :'c', (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_anotacion_corregida' and a.descripcion like '%(25 → 23): Cantidad equivocada%'));`,
  "SIN_ERROR,1"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la tabla de cambios: cerrada a la pantalla, no se edita ni se borra (42501) y cada acción con su forma (una nota no toca filas: 23514)",
  `${ABRE}
   select pg_temp.comenta(:'oid', 'Una nota') as n \\gset
   select concat_ws(',', :'n',
     (select relrowsecurity from pg_class where oid = 'retail.produccion_cambios'::regclass),
     has_table_privilege('authenticated', 'retail.produccion_cambios', 'select'),
     pg_temp.eh(pg_temp.intento(format('update retail.produccion_cambios set texto = %L where produccion_id = %L', 'otra', :'oid'))),
     pg_temp.eh(pg_temp.intento(format('delete from retail.produccion_cambios where produccion_id = %L', :'oid'))),
     split_part(pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, texto, quita_ids, hecho_por) values (%L, %L, %L, array[gen_random_uuid()], %L)', :'oid', 'nota', 'x', '${FELIPE}')), '|', 1));`,
  "SIN_ERROR,t,f,42501|,42501|,23514"
);
caso(
  "S2 la forma: las cuatro funciones de la pantalla, security definer con search_path, authenticated sí y anon no; las piezas de adentro, ni authenticated",
  `select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('corregir_anotacion_orden', 'eliminar_anotacion_orden', 'restaurar_anotacion_orden', 'comentar_orden')
        and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%' and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('fn_produccion_escribir_termine', 'fn_produccion_exigir_cadena', 'fn_produccion_termine_vivo', 'fn_produccion_deshacer_termine',
                          'fn_produccion_actividad_cambio', 'fn_produccion_cambios_de_orden', 'fn_produccion_deshechos_de_orden', 'fn_produccion_motivo_cambio')));`,
  "4,f"
);
caso(
  "S3 el candado: corregir, eliminar, restaurar y «Terminé» toman la MISMA llave por orden que las demás escrituras de la orden",
  `select count(*) filter (where pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock(hashtextextended(''produccion:'' || %')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
      and p.proname in ('corregir_anotacion_orden', 'eliminar_anotacion_orden', 'restaurar_anotacion_orden', 'anotar_termine');`,
  "4"
);
caso(
  "S4 la migración se vuelve a cargar encima sin error (idempotente) y no duplica nada",
  `${MIGRACION}
   select concat_ws(',', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('corregir_anotacion_orden', 'eliminar_anotacion_orden', 'restaurar_anotacion_orden', 'comentar_orden', 'anotar_termine', 'fn_produccion_escribir_termine')),
     (select count(*) from pg_trigger where tgrelid = 'retail.produccion_cambios'::regclass and not tgisinternal),
     (select count(*) from regexp_matches(pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure), '''cambios''', 'g')));`,
  "6,1,1"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
