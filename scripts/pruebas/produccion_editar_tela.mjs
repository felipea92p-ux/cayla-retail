#!/usr/bin/env node
/**
 * Pruebas de «editar la tela y los avíos de una orden abierta» (ADR-0510, actividad 1) — migración
 * `20261026035000_produccion_editar_tela_y_avios_de_la_orden.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden que se abrió sin tela (o con un consumo mal calculado) se pueda corregir sin anularla: la lista que llega REEMPLAZA a la
 * declarada, se valida con la misma regla que al abrir, el plan se recalcula con la merma de la tela, lo que no cambió no se mueve, y una tela o avío con
 * consumo anotado nunca se quita. Todo o nada: una lista con una fila mala no deja a medias a las buenas. Enviar la misma lista dos veces no cambia
 * nada ni anota otra actividad. Solo quien ve el módulo `produccion` parado en ese Taller la usa.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga dentro de cada caso: así se prueba que se puede pegar otra vez).
 *   G  GUARDAR: agregar tela y avío (el avío de toda la orden y el de un color), corregir el consumo, volver a enviar lo mismo (no pasa nada), lo que no
 *      cambió no se mueve aunque la merma del catálogo cambie, vaciar la lista, una lista rota que no vacía el plan, orden inexistente o cerrada.
 *   C  CONSUMO: con tela ya descontada no se quita (insumo_con_consumo), sí se corrige; con dos colores de la misma tela se puede quitar uno si queda otro.
 *   V  VALIDAR: color que la orden no fabrica, tela archivada, consumo 0, repetida, tela que no existe — con su motivo y sin tocar nada; una fila buena
 *      junto a una mala no queda guardada.
 *   P  PUERTAS: una integrante de Trujillo, 42501.
 *   S  LA FORMA: security definer con search_path, authenticated sí y anon no, bloquea la fila de la orden como `registrar_consumo_insumo`.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (una anota consumo mientras otra quita la tela). Es una sola transacción por caso; el bloqueo se comprueba
 * por su forma (S2). Con dos sesiones habría que hacer COMMIT, y eso queda fuera del job (ver `ci-paridad.test.ts`).
 *
 * USO
 *   node scripts/pruebas/produccion_editar_tela.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_editar_tela.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_editar_tela.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(
  readFileSync(join(RAIZ, "supabase", "migrations", "20261026035000_produccion_editar_tela_y_avios_de_la_orden.sql"), "utf8"),
);

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

// Envolturas que nunca abortan el caso: devuelven «OK:…» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
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
-- Guarda la lista sobre la última orden abierta: «OK:agregadas,corregidas,quitadas» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.guarda(p_insumos jsonb, p_orden uuid default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.guardar_insumos_orden(coalesce(p_orden, (select id from pg_temp.ultima)), p_insumos);
  return 'OK:' || (v_r ->> 'agregadas') || ',' || (v_r ->> 'corregidas') || ',' || (v_r ->> 'quitadas');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: dos telas (lino con 5 % de merma, algodón sin merma), botones (sin merma), una tela archivada y el modelo del seed con sus dos colores.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('ET-LINO', 'Lino Edición Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-ALGODON', 'Algodón Edición Prueba', 'tela', 'metro') returning id as algodon \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-BOTON', 'Botón Edición Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, archivado_at) values ('ET-VIEJO', 'Tela Vieja Edición Prueba', 'tela', 'metro', now()) returning id as viejo \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color y 20 del segundo, sin tela (la orden que hay que arreglar).
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${FASE("corte")}, ${FASE("costura")}, ${FASE("acabado")})`;

// Una fila de la lista: [insumo, color, consumo]. El color es 'c1', 'c2' o null (toda la orden).
const FILA = (insumo, color, consumo) =>
  `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${color === null ? "null::text" : `:'${color}'`}, 'consumo_por_prenda', '${consumo}')`;
const LISTA = (...filas) => `jsonb_build_array(${filas.map((f) => FILA(...f)).join(", ")})`;
// Lo que quedó en la orden, legible: «ET-BOTON:-:4.000:200.000 ET-LINO:c1:1.200:37.800».
const PLAN = `(select coalesce(string_agg(i.codigo || ':' || case when pi.color_codigo = :'c1' then 'c1' when pi.color_codigo = :'c2' then 'c2' else '-' end || ':' || pi.consumo_por_prenda || ':' || pi.cantidad_plan, ' ' order by i.codigo, pi.color_codigo), 'vacío')
   from retail.produccion_insumos pi join retail.insumos i on i.id = pi.insumo_id where pi.produccion_id = (select id from pg_temp.ultima))`;
// Una orden abierta CON tela (lino 1.2 en el primer color), la que hay que corregir.
const ABRE_CON_LINO = `select pg_temp.abre(${APERTURA}, ${ESPINA}, ${LISTA(["lino", "c1", "1.2"])}) as r \\gset`;
const ABRE_SIN_TELA = `select pg_temp.abre(${APERTURA}, ${ESPINA}) as r \\gset`;
// Lo que hace falta para descontar tela de la orden: un lote en el Taller y un consumo (como lo hace «Anotar lo que usaste»).
const CONSUME = (insumo, metros) => `insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario) values (:'${insumo}', :'taller', 500, 6);
   select retail.registrar_consumo_insumo((select id from pg_temp.ultima), :'${insumo}', ${metros}) as consumo_id \\gset`;

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

// G. GUARDAR -------------------------------------------------------------------------------------------------------------------
caso(
  "G1 una orden abierta sin tela declara lino 1.2 m del primer color y botones 4 por prenda para toda la orden: lino 1.2 × 30 × 1.05 = 37.8 y botones 4 × 50 = 200; el modelo queda con 1.200 declarado",
  `${ABRE_SIN_TELA}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["boton", null, "4"])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN}, (select tela_por_prenda || ':' || fuente from retail.producto_consumos where producto_id = :'prod'));`,
  "OK:2,0,0|ET-BOTON:-:4.000:200.000 ET-LINO:c1:1.200:37.800|1.200:declarado"
);
caso(
  "G2 un avío de UN color (botones del segundo color, 4 por prenda) cuenta solo las prendas de ese color: 4 × 20 = 80; y la misma tela puede ir en los dos colores",
  `${ABRE_SIN_TELA}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["lino", "c2", "1.1"], ["boton", "c2", "4"])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN});`,
  "OK:3,0,0|ET-BOTON:c2:4.000:80.000 ET-LINO:c1:1.200:37.800 ET-LINO:c2:1.100:23.100"
);
caso(
  "G3 corregir el consumo del lino de 1.2 a 1.5 recalcula el plan (1.5 × 30 × 1.05 = 47.25) y NO pisa lo que el modelo ya dice (sigue 1.200)",
  `${ABRE_CON_LINO}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.5"])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN}, (select tela_por_prenda::text from retail.producto_consumos where producto_id = :'prod'));`,
  "OK:0,1,0|ET-LINO:c1:1.500:47.250|1.200"
);
caso(
  "G4 enviar dos veces la misma lista cambia una sola vez: el segundo envío no agrega, ni corrige, ni quita, y la línea de tiempo anota UNA edición",
  `${ABRE_CON_LINO}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.5"], ["boton", null, "4"])}) as g1 \\gset
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.5"], ["boton", null, "4"])}) as g2 \\gset
   select concat_ws('|', :'g1', :'g2', ${PLAN},
     (select count(*) from retail.actividad where accion = 'orden_produccion_tela_editada' and registro_id = (select id::text from pg_temp.ultima)));`,
  "OK:1,1,0|OK:0,0,0|ET-BOTON:-:4.000:200.000 ET-LINO:c1:1.500:47.250|1"
);
caso(
  "G5 lo que no cambió no se mueve: si la merma del lino sube a 10 % en el catálogo, reenviar el mismo consumo deja el plan en 37.8; corregirlo sí usa la merma de hoy (1.3 × 30 × 1.10 = 42.9)",
  `${ABRE_CON_LINO}
   reset role;
   update retail.insumos set merma_pct = 0.10 where id = :'lino';
   ${como(FELIPE)}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"])}) as g1 \\gset
   select ${PLAN} as p1 \\gset
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.3"])}) as g2 \\gset
   select concat_ws('|', :'g1', :'p1', :'g2', ${PLAN});`,
  "OK:0,0,0|ET-LINO:c1:1.200:37.800|OK:0,1,0|ET-LINO:c1:1.300:42.900"
);
caso(
  "G6 una lista vacía quita la tela que no se usó (la lista vacía se pide con [], no con un parámetro faltante)",
  `${ABRE_CON_LINO}
   select pg_temp.guarda('[]'::jsonb) as g \\gset
   select concat_ws('|', :'g', ${PLAN});`,
  "OK:0,0,1|vacío"
);
caso(
  "G7 un parámetro faltante, un objeto o un texto NO vacían el plan: insumos_invalidos y el lino sigue ahí",
  `${ABRE_CON_LINO}
   select concat_ws('|',
     pg_temp.eh(pg_temp.guarda(null)),
     pg_temp.eh(pg_temp.guarda('{"insumo_id":"x"}'::jsonb)),
     pg_temp.eh(pg_temp.guarda('"nada"'::jsonb)),
     ${PLAN});`,
  "P0001|insumos_invalidos|P0001|insumos_invalidos|P0001|insumos_invalidos|ET-LINO:c1:1.200:37.800"
);
caso(
  "G8 una orden que no existe: orden_inexistente; una orden anulada ya no se edita: orden_cerrada y su tela queda igual",
  `${ABRE_CON_LINO}
   select concat_ws('|',
     pg_temp.eh(pg_temp.guarda(${LISTA(["lino", "c1", "1.5"])}, gen_random_uuid())),
     (select 'x')) as r0 \\gset
   reset role;
   update retail.producciones set estado = 'anulada' where id = (select id from pg_temp.ultima);
   ${como(FELIPE)}
   select concat_ws('|', :'r0', pg_temp.eh(pg_temp.guarda(${LISTA(["lino", "c1", "1.5"])})), ${PLAN});`,
  "P0001|orden_inexistente|x|P0001|orden_cerrada|ET-LINO:c1:1.200:37.800"
);

// C. CONSUMO -------------------------------------------------------------------------------------------------------------------
caso(
  "C1 con 10 m de lino ya descontados de la orden: quitarlo se rechaza (insumo_con_consumo) y nada cambia; corregir cuánto lleva cada prenda sí se puede",
  `${ABRE_CON_LINO}
   ${CONSUME("lino", 10)}
   select pg_temp.eh(pg_temp.guarda('[]'::jsonb)) as q \\gset
   select ${PLAN} as p1 \\gset
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.5"])}) as g \\gset
   select concat_ws('|', :'q', :'p1', :'g', ${PLAN});`,
  "P0001|insumo_con_consumo|ET-LINO:c1:1.200:37.800|OK:0,1,0|ET-LINO:c1:1.500:47.250"
);
caso(
  "C2 con lino en los dos colores y consumo anotado: se puede quitar un color si queda el otro, y no se puede dejar al lino sin ninguna fila",
  `select pg_temp.abre(${APERTURA}, ${ESPINA}, ${LISTA(["lino", "c1", "1.2"], ["lino", "c2", "1.1"])}) as r \\gset
   ${CONSUME("lino", 10)}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"])}) as g1 \\gset
   select pg_temp.eh(pg_temp.guarda('[]'::jsonb)) as q \\gset
   select concat_ws('|', :'g1', :'q', ${PLAN});`,
  "OK:0,0,1|P0001|insumo_con_consumo|ET-LINO:c1:1.200:37.800"
);
caso(
  "C3 lo que se descontó y se devolvió entero ya no cuenta como usado: la tela se puede quitar (consumo 10 − devolución 10 = 0)",
  `${ABRE_CON_LINO}
   ${CONSUME("lino", 10)}
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id)
     select insumo_id, insumo_lote_id, ubicacion_id, 'devolucion', cantidad, costo_unitario, produccion_id from retail.movimientos_insumo where id = :'consumo_id';
   select pg_temp.guarda('[]'::jsonb) as g \\gset
   select concat_ws('|', :'g', ${PLAN});`,
  "OK:0,0,1|vacío"
);

// V. VALIDAR -------------------------------------------------------------------------------------------------------------------
caso(
  "V1 lo que ya rechazaba abrir se rechaza igual al editar, con su motivo: color que la orden no fabrica, tela archivada, consumo 0, la misma tela repetida y una tela que no existe",
  `${ABRE_SIN_TELA}
   select concat_ws(',',
     pg_temp.eh(pg_temp.guarda(jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', 'zz_no_existe', 'consumo_por_prenda', '1.2')))),
     pg_temp.eh(pg_temp.guarda(${LISTA(["viejo", "c1", "1.2"])})),
     pg_temp.eh(pg_temp.guarda(${LISTA(["lino", "c1", "0"])})),
     pg_temp.eh(pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["lino", "c1", "1.3"])})),
     pg_temp.eh(pg_temp.guarda(jsonb_build_array(jsonb_build_object('insumo_id', gen_random_uuid(), 'consumo_por_prenda', '1')))),
     ${PLAN});`,
  "P0001|insumo_color_ajeno,P0001|insumo_archivado,P0001|insumo_consumo_invalido,P0001|insumo_repetido,P0001|insumo_invalido,vacío"
);
caso(
  "V2 todo o nada: una lista con una fila buena (botones) y una mala (consumo 0) no deja guardada a la buena",
  `${ABRE_SIN_TELA}
   select concat_ws('|', pg_temp.eh(pg_temp.guarda(${LISTA(["boton", null, "4"], ["lino", "c1", "0"])})), ${PLAN});`,
  "P0001|insumo_consumo_invalido|vacío"
);
caso(
  "V3 una tela que se archivó después de abrir la orden se rechaza al guardar (insumo_archivado) y la orden queda como estaba",
  `${ABRE_CON_LINO}
   reset role;
   update retail.insumos set archivado_at = now() where id = :'lino';
   ${como(FELIPE)}
   select concat_ws('|', pg_temp.eh(pg_temp.guarda(${LISTA(["lino", "c1", "1.5"])})), ${PLAN});`,
  "P0001|insumo_archivado|ET-LINO:c1:1.200:37.800"
);

// P. PUERTAS -------------------------------------------------------------------------------------------------------------------
caso(
  "P1 una integrante de Trujillo no edita la tela de una orden del Taller (42501) y la tela queda igual",
  `${ABRE_CON_LINO}
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.guarda(${LISTA(["lino", "c1", "1.5"])})) as r \\gset
   ${como(FELIPE)}
   select concat_ws('|', :'r', ${PLAN});`,
  (o) => /^42501\|[a-z_]*\|ET-LINO:c1:1\.200:37\.800$/.test(o)
);

// S. LA FORMA ------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la forma: una sola función con ese nombre, security definer con search_path, authenticated sí y anon no",
  `reset role;
   select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_insumos_orden'),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_insumos_orden'),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_insumos_orden'),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_insumos_orden'));`,
  "1,t,t,f"
);
caso(
  "S2 el bloqueo: antes de decidir lee la orden con `for update` —la misma fila que `registrar_consumo_insumo`— y valida con `fn_produccion_insumos_normalizar`, la misma que usa abrir",
  `reset role;
   select concat_ws(',',
     pg_get_functiondef('retail.guardar_insumos_orden(uuid,jsonb)'::regprocedure) ~* 'from retail\\.producciones p where p\\.id = p_produccion_id for update',
     pg_get_functiondef('retail.guardar_insumos_orden(uuid,jsonb)'::regprocedure) ~* 'fn_produccion_insumos_normalizar',
     pg_get_functiondef('retail.registrar_consumo_insumo(uuid,uuid,numeric,text)'::regprocedure) ~* 'from producciones where id = p_produccion_id for update');`,
  "t,t,t"
);
caso(
  "S3 la migración se vuelve a cargar sin error (idempotente) y sigue habiendo una sola función",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_insumos_orden';`,
  "1"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
