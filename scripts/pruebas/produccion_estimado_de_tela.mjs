#!/usr/bin/env node
/**
 * Pruebas del estimado de la tela y los avíos de una orden (ADR-0400, actualización 2026-10-31) — migración
 * `20261031194000_produccion_estimado_de_tela_consumida.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que el «Estimado» del cuadro Costo de una orden no baje a 0 porque la tela ya se consumió. Antes se medía siempre contra el lote con saldo: al gastarse el último
 * lote de una tela, su estimado desaparecía (en la orden real, Estimado 355.20 contra Real 761.92 con casi toda la tela usada). Ahora, si la orden ya consumió de ese insumo, el
 * estimado usa lo que le costó; si no, el lote con saldo; sin ninguno, 0.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * QUÉ PRUEBA
 *   A  ANTES DE CONSUMIR: el estimado es el plan × el lote con saldo, como siempre; sin lote, 0.
 *   B  EL LOTE SE AGOTÓ (el caso de la captura): el estimado no cae a 0, es el plan × lo que costó; la tela y los avíos por separado.
 *   C  LO QUE CAMBIA Y LO QUE NO: una devolución, la misma tela en dos colores, el costo real intacto, el promedio de dos lotes.
 *   S  LA FORMA: la función no cambia de firma, quien no ve costos sigue sin verlos, se puede pegar dos veces, el ancla perdida se detiene, el camino de vuelta funciona.
 *
 * LO QUE ESTA PRUEBA NO HACE: la pantalla (eso lo vigila `lib/orden-pagina-reglas.test.ts`, que solo acomoda los montos de la base).
 *
 * USO
 *   node scripts/pruebas/produccion_estimado_de_tela.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_estimado_de_tela.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_estimado_de_tela.mjs --base otra                 → contra otra base del mismo contenedor
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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed): no ve costos del Taller
const SIN_CANDADO = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const MIGRACION = SIN_CANDADO(readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261031194000_produccion_estimado_de_tela_consumida.sql", import.meta.url)), "utf8"));

// Los cuatro textos entre $v$ de la migración, en orden: ancla 1, reemplazo 1, ancla 2, reemplazo 2. El camino de vuelta es lo mismo con cada par al revés: así la prueba no copia los textos.
const BLOQUES = [...MIGRACION.matchAll(/\$v\$([\s\S]*?)\$v\$/g)].map((m) => m[1]);
if (BLOQUES.length !== 4) throw new Error(`La migración debía traer 4 textos entre $v$ y trae ${BLOQUES.length}`);
const VUELTA = `select pg_temp.reemplazar_anclado('retail.fn_orden_produccion(uuid)', $w$${BLOQUES[1]}$w$, $w$${BLOQUES[0]}$w$) as v1 \\gset
select pg_temp.reemplazar_anclado('retail.fn_orden_produccion(uuid)', $w$${BLOQUES[3]}$w$, $w$${BLOQUES[2]}$w$) as v2 \\gset`;

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
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
end;
$f$;
create function pg_temp.usa(p_oid uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.anotar_insumos_de_la_orden(%L, %L::jsonb, null)', p_oid, p_lineas)) $f$;
create function pg_temp.devuelve(p_oid uuid, p_insumo uuid, p_cantidad numeric) returns text language sql as $f$ select pg_temp.intento(format('select retail.devolver_insumo_de_produccion(%L, %L, %L, null)', p_oid, p_insumo, p_cantidad)) $f$;
`;

// Datos propios, con el modelo del seed y sus dos colores. Lo que pasa en la orden de la captura, a escala: 50 prendas; el forro (48 m a S/ 6.50) se acaba antes de cubrir el plan (50 m) y la
// tela (30 m a S/ 11.39, plan 30 m) se gasta justa; los botones (100 a S/ 0.12) cubren el plan (60).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-FORRO', 'Forro Estimado Prueba', 'tela', 'metro') returning id as forro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-MILANO', 'Milano Estimado Prueba', 'tela', 'metro') returning id as milano \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-BOTON', 'Botón Estimado Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-SINLOTE', 'Tela sin lote Estimado Prueba', 'tela', 'metro') returning id as sinlote \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'forro', :'taller', 48, 6.50, 'compra') returning id as forro_1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'milano', :'taller', 60, 11.39, 'compra') returning id as milano_1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'boton', :'taller', 100, 0.12, 'compra') returning id as boton_1 \\gset
insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
  select l.insumo_id, l.id, l.ubicacion_id, 'compra', l.cantidad_ingresada, l.costo_unitario, :'felipe_p' from retail.insumo_lotes l where l.id in (:'forro_1', :'milano_1', :'boton_1');
${como(FELIPE)}
`;

const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const ESPINA = `jsonb_build_array(${["corte", "costura", "acabado"].map((c) => `jsonb_build_object('clave', '${c}', 'quien', 'taller')`).join(", ")})`;
const FILA = (insumo, color, porPrenda, complemento = false) =>
  `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${color ? `:'${color}'` : "null"}, 'consumo_por_prenda', '${porPrenda}', 'complemento', ${complemento})`;
// Sin color = para todas las prendas: forro 1 m por prenda (plan 50), milano 0.6 (plan 30), botones 1.2 por prenda (plan 60).
const LISTA = `jsonb_build_array(${FILA("forro", null, "1")}, ${FILA("milano", null, "0.6")}, ${FILA("boton", null, "1.2")})`;
const ABRE = (lista = LISTA) => `select pg_temp.abre(${APERTURA}, ${ESPINA}, ${lista}) as r \\gset
   select id as oid from pg_temp.ultima \\gset`;
const USADO = (...pares) => `jsonb_build_array(${pares.map(([i, n]) => `jsonb_build_object('insumo_id', :'${i}', 'usado', '${n}')`).join(", ")})`;
const COSTOS = (clave) => `(retail.fn_orden_produccion(:'oid') -> 'costos' ->> '${clave}')`;
const SALDO_LOTE = (lote) => `(select (l.cantidad_ingresada - coalesce((select sum(case when mi.tipo = 'devolucion' then -mi.cantidad else mi.cantidad end) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo in ('consumo', 'devolucion', 'merma')), 0))::numeric(12,3) from retail.insumo_lotes l where l.id = :'${lote}')`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  casos++;
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// A. ANTES DE CONSUMIR ------------------------------------------------------------------------------------------------------------
caso(
  "A1 sin consumir nada, el estimado es el plan × el lote con saldo (tela 50 m × 6.50 + 30 m × 11.39 = 666.70; avíos 60 × 0.12 = 7.20), como siempre",
  `${ABRE()}
   select ${COSTOS("tela_estimado")} || '|' || ${COSTOS("avios_estimado")} || '|' || ${COSTOS("tela_real")};`,
  "666.70|7.20|0.00"
);
caso(
  "A2 un insumo del plan sin lote ni consumo vale 0 (la pantalla dice «sin lote recibido»), y no tumba a los demás",
  `${ABRE(`jsonb_build_array(${FILA("sinlote", null, "1")}, ${FILA("milano", null, "0.6")})`)}
   select ${COSTOS("tela_estimado")};`,
  "341.70"
);

// B. EL LOTE SE AGOTÓ -------------------------------------------------------------------------------------------------------------
caso(
  "B1 EL CASO DE LA CAPTURA: el forro consume sus 48 m (el lote queda en 0) y el plan era de 50: el estimado de la tela no cae a 0, es 50 × 6.50 + 30 × 11.39 = 666.70 (antes: 341.70)",
  `${ABRE()}
   select pg_temp.usa(:'oid', ${USADO(["forro", 48], ["milano", 30])}) as u \\gset
   select ${SALDO_LOTE("forro_1")} || '|' || ${COSTOS("tela_estimado")} || '|' || ${COSTOS("tela_real")};`,
  "0.000|666.70|653.70"
);
caso(
  "B2 el estimado y el real quedan a la par cuando se usó todo el plan: milano 30 m de 30 → los dos son 341.70",
  `${ABRE(`jsonb_build_array(${FILA("milano", null, "0.6")})`)}
   select pg_temp.usa(:'oid', ${USADO(["milano", 30])}) as u \\gset
   select ${COSTOS("tela_estimado")} || '|' || ${COSTOS("tela_real")};`,
  "341.70|341.70"
);
caso(
  "B3 los avíos se estiman igual: se gastan los 100 botones (más que el plan de 60; el lote queda en 0), el estimado sigue en 60 × 0.12 = 7.20, el real es 12.00 y la tela no se mezcla con ellos",
  `${ABRE()}
   select pg_temp.usa(:'oid', ${USADO(["boton", 100])}) as u \\gset
   select ${COSTOS("avios_estimado")} || '|' || ${COSTOS("avios_real")} || '|' || ${COSTOS("tela_estimado")};`,
  "7.20|12.00|666.70"
);
caso(
  "B4 aunque el lote se agote y llegue otro a otro precio, lo ya consumido sigue costando lo que costó (forro a 6.50), no el precio del lote nuevo",
  `${ABRE(`jsonb_build_array(${FILA("forro", null, "1")})`)}
   select pg_temp.usa(:'oid', ${USADO(["forro", 48])}) as u \\gset
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'forro', :'taller', 100, 9.00, 'compra');
   select ${COSTOS("tela_estimado")};`,
  "325.00"
);

// C. LO QUE CAMBIA Y LO QUE NO ----------------------------------------------------------------------------------------------------
caso(
  "C1 una devolución no cambia el costo de cada metro: se consumen 48 y se devuelven 8, el promedio sigue en 6.50 y el estimado en 50 × 6.50 = 325.00 (el real baja a 260.00)",
  `${ABRE(`jsonb_build_array(${FILA("forro", null, "1")})`)}
   select pg_temp.usa(:'oid', ${USADO(["forro", 48])}) as u \\gset
   select pg_temp.devuelve(:'oid', :'forro', 8) as d \\gset
   select ${COSTOS("tela_estimado")} || '|' || ${COSTOS("tela_real")};`,
  "325.00|260.00"
);
caso(
  "C2 la misma tela en dos colores (el libro no sabe de colores): el estimado suma los dos planes × un solo costo medio, y el real se cuenta una vez (no se duplica)",
  `${ABRE(`jsonb_build_array(${FILA("forro", "c1", "1")}, ${FILA("forro", "c2", "1")})`)}
   select pg_temp.usa(:'oid', ${USADO(["forro", 48])}) as u \\gset
   select ${COSTOS("tela_estimado")} || '|' || ${COSTOS("tela_real")};`,
  "325.00|312.00"
);
caso(
  "C3 con dos lotes a precios distintos el costo de cada metro es el promedio de lo consumido: lote 1 de 20 m a S/ 10 y lote 2 de 30 m a S/ 12; se consumen 30 m (20 + 10) → (200 + 120)/30 = 10.6667 → plan de 30 × 10.6667 = 320.00, igual al real",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ET-DOS', 'Dos lotes Estimado Prueba', 'tela', 'metro') returning id as dos \\gset
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen, fecha_ingreso) values (:'dos', :'taller', 20, 10, 'compra', current_date - 2) returning id as dos_1 \\gset
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'dos', :'taller', 30, 12, 'compra') returning id as dos_2 \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
     select l.insumo_id, l.id, l.ubicacion_id, 'compra', l.cantidad_ingresada, l.costo_unitario, :'felipe_p' from retail.insumo_lotes l where l.id in (:'dos_1', :'dos_2');
   ${ABRE(`jsonb_build_array(${FILA("dos", null, "0.6")})`)}
   select pg_temp.usa(:'oid', ${USADO(["dos", 30])}) as u \\gset
   select ${COSTOS("tela_estimado")} || '|' || ${COSTOS("tela_real")};`,
  "320.00|320.00"
);
caso(
  "C4 el costo real no cambió: lo consumido al costo de su lote (forro 48 × 6.50 = 312.00 + milano 30 × 11.39 = 341.70 → 653.70) y el total real lo suma con los servicios",
  `${ABRE()}
   select pg_temp.usa(:'oid', ${USADO(["forro", 48], ["milano", 30])}) as u \\gset
   select ${COSTOS("tela_real")} || '|' || ${COSTOS("total_real_hasta_hoy")};`,
  "653.70|653.70"
);

// S. LA FORMA ---------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la función conserva su firma y sus permisos (quien está autenticado la ejecuta; anon no)",
  `select has_function_privilege('authenticated', 'retail.fn_orden_produccion(uuid)', 'execute')::text || '|' || has_function_privilege('anon', 'retail.fn_orden_produccion(uuid)', 'execute')::text;`,
  "true|false"
);
caso(
  "S2 quien no ve los costos del Taller sigue sin verlos: la orden no trae «costos»",
  `${ABRE()}
   ${como(MICAELA)}
   select coalesce((retail.fn_orden_produccion(:'oid') -> 'costos')::text, 'sin_costos');`,
  "sin_costos"
);
caso(
  "S3 pegar la migración otra vez no cambia nada (la huella de la función es la misma)",
  `select md5(pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure)) as antes \\gset
   ${MIGRACION}
   select (md5(pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure)) = :'antes')::text;`,
  "true"
);
caso(
  "S4 si el ancla ya no está (alguien cambió la función), la migración se DETIENE con un mensaje claro y no toca nada",
  `create function pg_temp.sin_ancla() returns text language plpgsql as $f$
   begin
     perform pg_temp.reemplazar_anclado('retail.fn_orden_produccion(uuid)', '-- ESTE TEXTO NO EXISTE EN LA FUNCION --', '-- ni este, el reemplazo --');
     return 'SIN_ERROR';
   exception when others then
     return case when sqlerrm like '%el ancla aparece 0 veces%' then 'se_detiene' else sqlerrm end;
   end;
   $f$;
   select pg_temp.sin_ancla();`,
  "se_detiene"
);
caso(
  "S5 el camino de vuelta funciona: con los textos al revés la función vuelve a medir solo contra el lote con saldo (el forro agotado vuelve a valer 0) y al volver a pegar la migración, a 325.00",
  `${ABRE(`jsonb_build_array(${FILA("forro", null, "1")})`)}
   select pg_temp.usa(:'oid', ${USADO(["forro", 48])}) as u \\gset
   ${VUELTA}
   select ${COSTOS("tela_estimado")} as vuelta \\gset
   ${MIGRACION}
   select :'vuelta' || '|' || ${COSTOS("tela_estimado")};`,
  "0.00|325.00"
);

console.log(`\n${casos - fallas}/${casos} casos`);
process.exit(fallas === 0 ? 0 : 1);
