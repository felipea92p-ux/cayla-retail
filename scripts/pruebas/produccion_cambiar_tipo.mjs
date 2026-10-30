#!/usr/bin/env node
/**
 * Pruebas de «Cambiar el tipo de la orden» (ADR-0581) — migración `20261030151000_produccion_cambiar_tipo_de_la_orden.sql` (sobre `20261029190000`). CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden ABIERTA pase de muestra a lote de producción (o al revés) sin dejar un estado imposible: el cambio y su rastro se escriben juntos, pedir el tipo que ya
 * tiene no hace nada, un lote nunca nace de aquí sin precio de venta, una orden cerrada no se toca, y quien no opera el Taller no puede. Y que el cambio sirva de verdad: una orden
 * abierta como muestra que pasa a lote ENTRA al stock al cerrarse (el daño que esto corrige), y una que sigue siendo muestra no.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * QUÉ PRUEBA
 *   T  EL CAMBIO: de muestra a lote y de lote a muestra, con y sin motivo; el rastro (historia y Actividad); pedir lo mismo que ya es; que la página lo lea.
 *   R  LOS RECHAZOS: orden cerrada, sin precio (también la talla sin código), motivo largo, tipo vacío, orden que no existe, otra sede. Las tallas van como en producción: con
 *      `codigo` y sin `sku`.
 *   E  EL EFECTO: muestra que pasa a lote entra al stock al cerrar; muestra que sigue siendo muestra, no.
 *   S  LA FORMA: el CHECK de la historia, permisos y que se pueda pegar otra vez.
 *   D  EL SCRIPT DE DATOS (`pegar-en-produccion-tipo-de-ordenes-2-3-4-2026-10-30.sql`): ensayo por defecto, aplicar, repetir, parar si una orden ya se cerró o no tiene precio, y el camino de vuelta.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (la función toma la orden `for update`, como `cerrar_produccion`), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/produccion_cambiar_tipo.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_cambiar_tipo.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_cambiar_tipo.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261030151000_produccion_cambiar_tipo_de_la_orden.sql"), "utf8"));

const SCRIPT_DATOS = "pegar-en-produccion-tipo-de-ordenes-2-3-4-2026-10-30.sql";
const TEXTO_SCRIPT = readFileSync(join(RAIZ, "supabase", "migrations", SCRIPT_DATOS), "utf8");
// Solo el bloque `do $f$ … $f$;` (lo que hace el trabajo); el resto son comentarios y la consulta de verificación.
const BLOQUE_SCRIPT = /do \$f\$[\s\S]*?\n\$f\$;/.exec(TEXTO_SCRIPT)?.[0];
if (!BLOQUE_SCRIPT) throw new Error(`No encontré el bloque do $f$ en ${SCRIPT_DATOS}`);
const IDS_REALES = ["223317e9-bd0f-49f0-99a9-b176837d26bc", "622b035d-9514-4e52-9a64-8742a748c8aa", "a95669c3-25c5-4d92-afcc-b1281495b9b5"];
for (const id of IDS_REALES) if (!BLOQUE_SCRIPT.includes(id)) throw new Error(`El bloque del script ya no trae el id ${id}`);

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

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR» u «OK…», o «<sqlstate>|<hint>|<mensaje>».
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
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, null, null, null, true)', p_oid, p_buenas)) $f$;
-- El cambio de tipo, sin abortar el caso: devuelve «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.cambia(p_oid uuid, p_es_muestra boolean, p_motivo text default null) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cambiar_tipo_orden_produccion(%L, %L, %L)', p_oid, p_es_muestra, p_motivo)) $f$;
`;

// Datos propios: el modelo del seed con dos colores (dos variantes), un Taller y a Felipe como quien opera.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
update retail.variantes set precio = 59.90, costo = 4.50 where id in (:'v1', :'v2');
-- Las tallas como en producción: con su \`codigo\` y SIN \`sku\` (el 2026-10-30, 1 de 3162 variantes de producción lo tenía). Con el \`sku\` del seed, esta prueba escondía que el
-- control de precio nombraba las tallas por un campo que allá está vacío, y que por eso no saltaba nunca.
update retail.variantes set sku = null where producto_id = :'prod';
update retail.variantes set codigo = 'PRUEBA-TIPO-' || color_codigo where id in (:'v1', :'v2') and codigo is null;
${como(FELIPE)}
`;

const APERTURA = (muestra) => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', ${muestra}, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const ABRE = (muestra) => `select pg_temp.abre(${APERTURA(muestra)}, ${ESPINA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset`;
const TERMINA_TODO = `select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset`;
const CIERRA = `select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset`;
const ES_MUESTRA = `(select es_muestra from retail.producciones where id = :'oid')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const CAMBIOS = `(select count(*) from retail.produccion_cambios where produccion_id = :'oid' and accion = 'tipo')`;
const ACTIVIDAD = `(select count(*) from retail.actividad where tabla = 'produccion' and registro_id = :'oid'::text and accion = 'orden_produccion_tipo_cambiado')`;

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

// T. EL CAMBIO ----------------------------------------------------------------------------------------------------------------------
caso(
  "T1 una orden abierta como muestra pasa a lote: el campo cambia, queda UN cambio en la historia con su antes y su después, y la Actividad lo anota",
  `${ABRE(true)}
   select pg_temp.cambia(:'oid', false) as r \\gset
   select concat_ws(',', :'r', ${ES_MUESTRA}, ${CAMBIOS}, ${ACTIVIDAD},
     (select texto || '/' || (antes ->> 'es_muestra') || '/' || (despues ->> 'es_muestra') from retail.produccion_cambios where produccion_id = :'oid' and accion = 'tipo'),
     (select hecho_por = :'felipe_p' from retail.produccion_cambios where produccion_id = :'oid' and accion = 'tipo'));`,
  "SIN_ERROR,f,1,1,Pasó de muestra a lote de producción/true/false,t"
);
caso(
  "T2 de lote a muestra, con su motivo: la historia dice qué cambió y por qué",
  `${ABRE(false)}
   select pg_temp.cambia(:'oid', true, '  Es la primera vez que se corta este molde  ') as r \\gset
   select concat_ws(',', :'r', ${ES_MUESTRA}, ${CAMBIOS}, (select texto from retail.produccion_cambios where produccion_id = :'oid' and accion = 'tipo'));`,
  "SIN_ERROR,t,1,Pasó de lote de producción a muestra · Es la primera vez que se corta este molde"
);
caso(
  "T3 pedir el tipo que la orden ya tiene no hace nada ni falla ni escribe: ni historia ni Actividad (un doble clic, o dos personas con la misma idea)",
  `${ABRE(true)}
   select pg_temp.cambia(:'oid', true) as a \\gset
   select pg_temp.cambia(:'oid', false) as b \\gset
   select pg_temp.cambia(:'oid', false) as c_ \\gset
   select concat_ws(',', :'a', :'b', :'c_', ${ES_MUESTRA}, ${CAMBIOS}, ${ACTIVIDAD});`,
  "SIN_ERROR,SIN_ERROR,SIN_ERROR,f,1,1"
);
caso(
  "T4 ir y volver deja dos cambios, en orden, y el campo termina donde empezó",
  `${ABRE(true)}
   select pg_temp.cambia(:'oid', false) as a \\gset
   select pg_temp.cambia(:'oid', true) as b \\gset
   select concat_ws(',', :'a', :'b', ${ES_MUESTRA}, ${CAMBIOS},
     (select string_agg(despues ->> 'es_muestra', '>' order by created_at) from retail.produccion_cambios where produccion_id = :'oid' and accion = 'tipo'));`,
  "SIN_ERROR,SIN_ERROR,t,2,false>true"
);
caso(
  "T5 la página lee el cambio: `fn_orden_produccion` trae el tipo nuevo y la historia con la acción «tipo»",
  `${ABRE(true)}
   select pg_temp.cambia(:'oid', false) as r \\gset
   select concat_ws(',', :'r', (retail.fn_orden_produccion(:'oid') -> 'orden' ->> 'es_muestra'),
     (select count(*) from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'cambios') x where x ->> 'accion' = 'tipo'));`,
  "SIN_ERROR,false,1"
);

// R. LOS RECHAZOS -------------------------------------------------------------------------------------------------------------------
caso(
  "R1 una orden ya cerrada no cambia de tipo (orden_cerrada) y el campo queda como estaba",
  `${ABRE(false)}
   ${TERMINA_TODO}
   ${CIERRA}
   select concat_ws(',', :'c', ${ESTADO}, pg_temp.eh(pg_temp.cambia(:'oid', true)), ${ES_MUESTRA}, ${CAMBIOS});`,
  "SIN_ERROR,terminada,P0001|orden_cerrada,f,0"
);
caso(
  "R2 de muestra a lote sin precio en alguna talla: se rechaza (precio_obligatorio), dice dónde falta y el campo no cambia; de lote a muestra sin precio sí se puede",
  `${ABRE(true)}
   update retail.variantes set precio = 0 where id = :'v2';
   select pg_temp.cambia(:'oid', false) as r \\gset
   select concat_ws(',', pg_temp.eh(:'r'), position((select codigo from retail.variantes where id = :'v2') in :'r') > 0, ${ES_MUESTRA}, ${CAMBIOS});`,
  "P0001|precio_obligatorio,t,t,0"
);
caso(
  "R2b una talla sin precio que tampoco tiene código ni SKU igual frena el paso a lote, y el aviso dice «sin código» (una lista vacía no puede valer como «no falta ninguna»)",
  `${ABRE(true)}
   update retail.variantes set precio = 0, codigo = null where id = :'v2';
   select pg_temp.cambia(:'oid', false) as r \\gset
   select concat_ws(',', pg_temp.eh(:'r'), position('sin código' in :'r') > 0, ${ES_MUESTRA}, ${CAMBIOS});`,
  "P0001|precio_obligatorio,t,t,0"
);
caso(
  "R3 el precio que falta se arregla y entonces sí pasa a lote",
  `${ABRE(true)}
   update retail.variantes set precio = 0 where id = :'v2';
   select pg_temp.eh(pg_temp.cambia(:'oid', false)) as antes \\gset
   update retail.variantes set precio = 45 where id = :'v2';
   select pg_temp.cambia(:'oid', false) as despues \\gset
   select concat_ws(',', :'antes', :'despues', ${ES_MUESTRA});`,
  "P0001|precio_obligatorio,SIN_ERROR,f"
);
caso(
  "R4 un motivo de más de 300 letras se rechaza (cambio_motivo_largo) y no cambia nada",
  `${ABRE(true)}
   select pg_temp.eh(pg_temp.cambia(:'oid', false, repeat('x', 301))) as largo \\gset
   select ${ES_MUESTRA} as sigue_igual \\gset
   select pg_temp.cambia(:'oid', false, repeat('x', 300)) as justo \\gset
   select concat_ws(',', :'largo', :'sigue_igual', :'justo', ${ES_MUESTRA});`,
  "P0001|cambio_motivo_largo,t,SIN_ERROR,f"
);
caso(
  "R5 sin decir el tipo (tipo_invalido) o con una orden que no existe (orden_inexistente), se rechaza",
  `${ABRE(true)}
   select concat_ws(',', pg_temp.eh(pg_temp.intento(format('select retail.cambiar_tipo_orden_produccion(%L, null, null)', :'oid'))),
     pg_temp.eh(pg_temp.cambia(gen_random_uuid(), false)), ${ES_MUESTRA});`,
  "P0001|tipo_invalido,P0001|orden_inexistente,t"
);
caso(
  "R6 quien no opera el Taller (una integrante de tienda, sin el módulo Producción) no puede, y la orden no cambia",
  `${ABRE(true)}
   ${como(MICAELA)}
   select concat_ws(',', split_part(pg_temp.cambia(:'oid', false), '|', 1), ${ES_MUESTRA}, ${CAMBIOS});`,
  "42501,t,0"
);

// E. EL EFECTO ----------------------------------------------------------------------------------------------------------------------
caso(
  "E1 el daño que esto corrige: una orden abierta como muestra que pasa a lote ENTRA al stock al cerrarse (inventariado y con movimientos de stock)",
  `${ABRE(true)}
   select pg_temp.cambia(:'oid', false) as r \\gset
   ${TERMINA_TODO}
   ${CIERRA}
   select concat_ws(',', :'r', :'c', ${ESTADO}, (select inventariado_at is not null from retail.producciones where id = :'oid'),
     (select count(*) > 0 from retail.movimientos m where m.produccion_id = :'oid'));`,
  "SIN_ERROR,SIN_ERROR,terminada,t,t"
);
caso(
  "E2 la contraparte: una orden que sigue siendo muestra, al cerrarse, NO entra al stock",
  `${ABRE(true)}
   ${TERMINA_TODO}
   ${CIERRA}
   select concat_ws(',', :'c', ${ESTADO}, (select inventariado_at is null from retail.producciones where id = :'oid'),
     (select count(*) = 0 from retail.movimientos m where m.produccion_id = :'oid'));`,
  "SIN_ERROR,terminada,t,t"
);

// S. LA FORMA -----------------------------------------------------------------------------------------------------------------------
caso(
  "S1 el CHECK de la historia: un cambio de tipo sin su antes, sin su después o con los dos iguales es imposible; uno completo sí entra",
  `${ABRE(true)}
   select concat_ws(',',
     split_part(pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, texto, hecho_por) values (%L, ''tipo'', ''x'', %L)', :'oid', :'felipe_p')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, antes, despues, texto, hecho_por) values (%L, ''tipo'', ''{"es_muestra": true}'', ''{"es_muestra": true}'', ''x'', %L)', :'oid', :'felipe_p')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, antes, despues, texto, hecho_por) values (%L, ''tipo'', ''{"otra": 1}'', ''{"es_muestra": false}'', ''x'', %L)', :'oid', :'felipe_p')), '|', 1),
     pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, antes, despues, texto, hecho_por) values (%L, ''tipo'', ''{"es_muestra": true}'', ''{"es_muestra": false}'', ''x'', %L)', :'oid', :'felipe_p')));`,
  "23514,23514,23514,SIN_ERROR"
);
caso(
  "S2 las demás acciones de la historia siguen valiendo (nota, sin_tela) y una acción desconocida no",
  `${ABRE(true)}
   select concat_ws(',',
     pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, texto, hecho_por) values (%L, ''nota'', ''x'', %L)', :'oid', :'felipe_p')),
     pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, texto, hecho_por) values (%L, ''sin_tela'', ''x'', %L)', :'oid', :'felipe_p')),
     split_part(pg_temp.intento(format('insert into retail.produccion_cambios (produccion_id, accion, texto, hecho_por) values (%L, ''inventada'', ''x'', %L)', :'oid', :'felipe_p')), '|', 1));`,
  "SIN_ERROR,SIN_ERROR,23514"
);
caso(
  "S3 la forma de la función: security definer con search_path, authenticated sí y anon no",
  `select concat_ws(',', p.prosecdef, array_to_string(p.proconfig, ',') like '%search_path%', has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'cambiar_tipo_orden_produccion';`,
  "t,t,t,f"
);
caso(
  "S4 la migración se vuelve a cargar encima sin error y la función sigue siendo una sola",
  `${MIGRACION}
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'cambiar_tipo_orden_produccion';`,
  "1"
);


// D. EL SCRIPT DE DATOS -------------------------------------------------------------------------------------------------------------
// Tres órdenes locales abiertas como muestra; el bloque del script corre con SUS ids en lugar de los de producción (`replace` en SQL, que sí ve las variables de psql).
const TRES = `select pg_temp.abre(${APERTURA(true)}, ${ESPINA}) as r1 \\gset
   select id as o1 from pg_temp.ultima \\gset
   select pg_temp.abre(${APERTURA(true)}, ${ESPINA}) as r2 \\gset
   select id as o2 from pg_temp.ultima \\gset
   select pg_temp.abre(${APERTURA(true)}, ${ESPINA}) as r3 \\gset
   select id as o3 from pg_temp.ultima \\gset`;
const SCRIPT = (aplicar, ids = ["o1", "o2", "o3"]) => {
  let sql = `$sc$${BLOQUE_SCRIPT}$sc$`;
  ids.forEach((v, i) => {
    sql = `replace(${sql}, '${IDS_REALES[i]}', :'${v}')`;
  });
  if (aplicar) sql = `replace(${sql}, 'v_aplicar boolean := false', 'v_aplicar boolean := true')`;
  return `select pg_temp.intento(${sql}) as script \\gset`;
};
const SON = (valor) => `(select count(*) from retail.producciones where id in (:'o1', :'o2', :'o3') and es_muestra = ${valor})`;
const RESPALDOS = `(select count(*) from respaldo_purgas.filas where purga = 'tipo-de-ordenes-2026-10-30' and tabla = 'producciones' and fila ->> 'id' in (:'o1', :'o2', :'o3'))`;
const ACTIV3 = `(select count(*) from retail.actividad where accion = 'orden_produccion_tipo_cambiado' and registro_id in (:'o1', :'o2', :'o3') and persona_id is null)`;

caso(
  "D0 en una base que no tiene esas órdenes (cualquier otra: local, CI) el script no toca nada y lo dice: «No están en esta base: 3»",
  `${SCRIPT(false, [])}
   select (:'script' like '%ENSAYO_OK: 0 órdenes%') || ',' || (:'script' like '%No están en esta base: 3%');`,
  "true,true"
);
caso(
  "D1 el ensayo (lo que viene por defecto) dice qué órdenes pasarían y NO cambia nada: siguen las tres como muestra, sin foto de respaldo ni Actividad",
  `${TRES}
   ${SCRIPT(false)}
   select concat_ws(',', (:'script' like '%ENSAYO_OK: 3 órdenes pasarían de muestra a lote (150 prendas)%'), ${SON("true")}, ${RESPALDOS}, ${ACTIV3});`,
  "t,3,0,0"
);
caso(
  "D2 aplicado: las tres pasan a lote, cada una deja la foto de cómo estaba (con es_muestra = true) y su aviso en la Actividad, sin responsable",
  `${TRES}
   ${SCRIPT(true)}
   select concat_ws(',', :'script', ${SON("false")}, ${RESPALDOS},
     (select count(*) from respaldo_purgas.filas where purga = 'tipo-de-ordenes-2026-10-30' and fila ->> 'id' in (:'o1', :'o2', :'o3') and fila ->> 'es_muestra' = 'true'), ${ACTIV3});`,
  "SIN_ERROR,3,3,3,3"
);
caso(
  "D3 pegarlo dos veces no repite nada: la segunda dice que ya eran lote y no escribe otra foto ni otro aviso",
  `${TRES}
   ${SCRIPT(true)}
   ${SCRIPT(true).replace("as script", "as segunda")}
   select concat_ws(',', :'script', :'segunda', ${SON("false")}, ${RESPALDOS}, ${ACTIV3});`,
  "SIN_ERROR,SIN_ERROR,3,3,3"
);
caso(
  "D4 si una de las tres ya no está en proceso (se cerró o se anuló) el script se DETIENE y no toca NINGUNA, ni las que sí podía",
  `${TRES}
   update retail.producciones set estado = 'anulada' where id = :'o2';
   ${SCRIPT(true)}
   select concat_ws(',', (:'script' like '%P0001|%ya no está en proceso (anulada)%No se tocó ninguna orden%'), ${SON("true")}, ${RESPALDOS}, ${ACTIV3});`,
  "t,3,0,0"
);
caso(
  "D5 si a una talla le falta el precio a tienda, el script se DETIENE y no toca ninguna (un lote sin precio no se puede vender)",
  `${TRES}
   update retail.variantes set precio = 0 where id = :'v2';
   ${SCRIPT(true)}
   select concat_ws(',', (:'script' like '%no puede pasar a lote: falta el precio a tienda%No se tocó ninguna orden%'), ${SON("true")}, ${RESPALDOS});`,
  "t,3,0"
);
caso(
  "D6 el camino de vuelta escrito en el script, pegado tal cual, deja las tres como estaban (y el script lo trae escrito así)",
  `${TRES}
   ${SCRIPT(true)}
   update retail.producciones p
      set es_muestra = (b.fila ->> 'es_muestra')::boolean
     from respaldo_purgas.filas b
    where b.purga = 'tipo-de-ordenes-2026-10-30' and b.tabla = 'producciones' and (b.fila ->> 'id')::uuid = p.id and p.estado = 'en_proceso';
   select concat_ws(',', :'script', ${SON("true")}, ${TEXTO_SCRIPT.includes("where b.purga = 'tipo-de-ordenes-2026-10-30' and b.tabla = 'producciones' and (b.fila ->> 'id')::uuid = p.id and p.estado = 'en_proceso';")});`,
  "SIN_ERROR,3,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
