#!/usr/bin/env node
/**
 * Pruebas de «revertir el cierre devuelve el costo de la prenda» (ADR-0614, actividad 1) — migración
 * `20261105213000_revertir_cierre_restaura_el_costo.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que revertir deje `variantes.costo` exactamente como estaba antes del cierre; que volver a cerrar calcule igual que la primera vez;
 * que un cierre ya mezclado con otra compra u otro cierre se rechace sin dejar nada escrito, y que en orden inverso sí se pueda; que el par cierre +
 * reversión no aparezca en lo que lee la pestaña «Costo»; que una orden «ya estaba» no escriba nada; y que el balance solo vea el redondeo.
 *
 * USO
 *   node scripts/pruebas/produccion_revertir_costo.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_revertir_costo.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_revertir_costo.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105213000_revertir_cierre_restaura_el_costo.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// El lote se mide contra lo que la base ya tiene registrado del modelo: «ya estaba» necesita ese tope, y aquí el lote es grande para no chocar con nada.
const LOTE = 60;
// Costo de la orden: 10.00 por prenda (la prenda parte en 8.00, dentro de lo normal, y así se nota si se mueve).
const TELA = LOTE * 2 * 8;
const AVIOS = LOTE * 2 * 2;

const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_estado || ':' || v_msg);
end;
$f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
end;
$f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language plpgsql as $f$
begin
  return pg_temp.intento(format('select retail.cerrar_produccion_con_motivo(%L, %L::jsonb, ${TELA}, ${AVIOS}, 0, true, %L)', p_oid, p_buenas, 'motivo de prueba'));
end;
$f$;
create function pg_temp.revierte(p_oid uuid) returns text language plpgsql as $f$
begin
  return pg_temp.intento(format('select retail.revertir_produccion(%L)', p_oid));
end;
$f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
update retail.variantes set costo = 8.00 where id in (:'v1', :'v2');
${como(FELIPE)}
`;

const FASE = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${FASE("corte")}, ${FASE("costura")}, ${FASE("acabado")})`;
const APERTURA = (muestra = false) => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', ${muestra}, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${LOTE}'), jsonb_build_object('variante_id', :'v2', 'cantidad', '${LOTE}')))`;
const BUENAS = `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${LOTE}'), jsonb_build_object('variante_id', :'v2', 'cantidad', '${LOTE}'))`;

/** Una orden con sus tres pasos hechos, lista para pasar al stock; su id queda en la variable psql que se pida. */
const ORDEN_LISTA = (id = "oid", muestra = false) => `select pg_temp.abre(${APERTURA(muestra)}, ${ESPINA}) as r \\gset
   select id as ${id} from pg_temp.ultima \\gset
   select retail.registrar_avance(f.id, ${BUENAS}, null) as _a from retail.produccion_fases f where f.produccion_id = :'${id}' and f.clave = 'corte' \\gset
   select retail.registrar_avance(f.id, ${BUENAS}, null) as _b from retail.produccion_fases f where f.produccion_id = :'${id}' and f.clave = 'costura' \\gset
   select retail.registrar_avance(f.id, ${BUENAS}, null) as _c from retail.produccion_fases f where f.produccion_id = :'${id}' and f.clave = 'acabado' \\gset`;

const COSTO = `(select costo from retail.variantes where id = :'v1')`;
const STOCK = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1')`;
const REVERSIONES = `(select count(*) from retail.costo_historial where variante_id = :'v1' and origen = 'reversion')`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (bien) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "M1 la migración se vuelve a cargar sin error (idempotente) y la función auxiliar no la llama la cuenta",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'revertir_produccion'),
     has_function_privilege('authenticated', 'retail.fn_revertir_costo_del_cierre(uuid,integer,uuid,uuid)', 'execute'),
     has_function_privilege('authenticated', 'retail.revertir_produccion(uuid)', 'execute'));`,
  "1,f,t"
);

caso(
  "C1 revertir deja el costo exacto de antes del cierre y devuelve el stock; queda una fila de reversión con la cadena entera",
  `select ${STOCK} as s0 \\gset
   ${ORDEN_LISTA()}
   select pg_temp.cierra(:'oid', ${BUENAS}) as c \\gset
   select ${COSTO} as tras_cerrar \\gset
   select (${COSTO} <> 8.00) as se_movio \\gset
   select pg_temp.revierte(:'oid') as r \\gset
   select concat_ws(',', :'c', :'se_movio', :'r', ${COSTO}, (${STOCK} = :'s0'::numeric), ${REVERSIONES},
     (select (h.costo_anterior = :'tras_cerrar'::numeric and h.costo_resultante = 8.00 and h.cantidad_nueva = ${LOTE})
        from retail.costo_historial h where h.variante_id = :'v1' and h.origen = 'reversion'));`,
  "OK,t,OK,8.00,t,1,t"
);

caso(
  "C2 cerrar → revertir → cerrar otra vez da el mismo costo de la primera vez, y revertir de nuevo también vuelve a 8.00",
  `${ORDEN_LISTA()}
   select pg_temp.cierra(:'oid', ${BUENAS}) as c1 \\gset
   select ${COSTO} as primera \\gset
   select pg_temp.revierte(:'oid') as r1 \\gset
   select pg_temp.cierra(:'oid', ${BUENAS}) as c2 \\gset
   select (${COSTO} = :'primera'::numeric) as igual \\gset
   select pg_temp.revierte(:'oid') as r2 \\gset
   select concat_ws(',', :'c1', :'r1', :'c2', :'igual', :'r2', ${COSTO}, ${REVERSIONES});`,
  "OK,OK,OK,t,OK,8.00,2"
);

caso(
  "X1 con otra orden cerrada encima, revertir la de abajo se rechaza y no deja nada escrito",
  `${ORDEN_LISTA("oa")}
   select pg_temp.cierra(:'oa', ${BUENAS}) as c1 \\gset
   ${ORDEN_LISTA("ob")}
   select pg_temp.cierra(:'ob', ${BUENAS}) as c2 \\gset
   select ${COSTO} as tope \\gset
   select pg_temp.revierte(:'oa') as r \\gset
   select concat_ws(',', :'r', (${COSTO} = :'tope'::numeric), ${REVERSIONES}, (select estado from retail.producciones where id = :'oa'),
     (select count(*) from retail.movimientos where produccion_id = :'oa' and motivo = 'reversion_produccion'));`,
  "revertir_costo_mezclado,t,0,terminada,0"
);

caso(
  "X2 en orden inverso sí se puede: primero la de arriba, después la de abajo, y el costo vuelve a 8.00",
  `${ORDEN_LISTA("oa")}
   select pg_temp.cierra(:'oa', ${BUENAS}) as c1 \\gset
   select ${COSTO} as tras_a \\gset
   ${ORDEN_LISTA("ob")}
   select pg_temp.cierra(:'ob', ${BUENAS}) as c2 \\gset
   select pg_temp.revierte(:'ob') as r1 \\gset
   select (${COSTO} = :'tras_a'::numeric) as volvio_a_a \\gset
   select pg_temp.revierte(:'oa') as r2 \\gset
   select concat_ws(',', :'r1', :'volvio_a_a', :'r2', ${COSTO}, ${REVERSIONES});`,
  "OK,t,OK,8.00,2"
);

caso(
  "X3 una compra que entró después del cierre también lo deja mezclado",
  `${ORDEN_LISTA()}
   select pg_temp.cierra(:'oid', ${BUENAS}) as c \\gset
   select id as sub from retail.sububicaciones where ubicacion_id = :'taller' limit 1 \\gset
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'v1', :'taller', :'sub', 'entrada', 5, 'compra') returning id as m \\gset
   select retail.fn_recalcular_costo_variante(:'v1', 5, 12.00, 'compra', :'m') as _costo \\gset
   select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
   select pg_temp.revierte(:'oid');`,
  "revertir_costo_mezclado"
);

caso(
  "X4 si algo movió el costo por fuera, se detiene en vez de pisarlo",
  `${ORDEN_LISTA()}
   select pg_temp.cierra(:'oid', ${BUENAS}) as c \\gset
   update retail.variantes set costo = 99.00 where id = :'v1';
   select pg_temp.revierte(:'oid') as r \\gset
   select concat_ws(',', :'r', ${COSTO}, ${REVERSIONES});`,
  "revertir_costo_desalineado,99.00,0"
);

caso(
  "L1 el par cierre + reversión no sale en lo que lee la pestaña «Costo»",
  `select count(*) as antes from retail.fn_costo_historial_efectivo(:'prod') \\gset
   ${ORDEN_LISTA()}
   select pg_temp.cierra(:'oid', ${BUENAS}) as c \\gset
   select count(*) as cerrada from retail.fn_costo_historial_efectivo(:'prod') \\gset
   select pg_temp.revierte(:'oid') as r \\gset
   select concat_ws(',', (:'cerrada'::int - :'antes'::int), (select count(*) from retail.fn_costo_historial_efectivo(:'prod')) = :'antes'::int,
     (select count(*) from retail.fn_costo_historial_efectivo(:'prod') e where e.origen = 'reversion'));`,
  "2,t,0"
);

caso(
  "B1 para el balance, el par cierre + reversión solo deja el redondeo del promedio (menos de un sol por prenda)",
  `${ORDEN_LISTA()}
   select pg_temp.cierra(:'oid', ${BUENAS}) as c \\gset
   select pg_temp.revierte(:'oid') as r \\gset
   select (abs(sum(case when h.origen = 'reversion'
                then (h.stock_previo - h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior + h.cantidad_nueva * h.costo_unitario_nuevo
                else (h.stock_previo + h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior - h.cantidad_nueva * h.costo_unitario_nuevo end)) < ${LOTE})
     from retail.costo_historial h where h.variante_id = :'v1' and h.orden >= (select min(x.orden) from retail.costo_historial x join retail.movimientos m on m.id = x.movimiento_id where m.produccion_id = :'oid');`,
  "t"
);

caso(
  "S1 una muestra no movió el costo: revertirla no escribe ninguna fila",
  `${ORDEN_LISTA("oid", true)}
   select pg_temp.intento(format('select retail.cerrar_produccion_con_motivo(%L, %L::jsonb, null, null, null, false, %L)', :'oid'::uuid, (select jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'cantidad', l.cantidad_plan)) from retail.produccion_lineas l where l.produccion_id = :'oid'), 'motivo de prueba')) as c \\gset
   select pg_temp.revierte(:'oid') as r \\gset
   select concat_ws(',', :'c', :'r', ${COSTO}, ${REVERSIONES});`,
  "OK,OK,8.00,0"
);

caso(
  "S2 revertir una orden que ya está en proceso se sigue rechazando, sin escribir nada",
  `${ORDEN_LISTA()}
   select pg_temp.revierte(:'oid') as r \\gset
   select concat_ws(',', (:'r' like '%Solo se revierte%'), ${REVERSIONES});`,
  "t,0"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
