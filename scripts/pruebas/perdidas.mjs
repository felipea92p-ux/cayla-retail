#!/usr/bin/env node
/**
 * Prueba de ADR-0328, actividad 14 — UNA sola definición de pérdida (`20261004220000_perdidas_una_sola_definicion.sql`).
 *
 * QUÉ CUBRE
 *   · C — la clasificación de cada tipo y motivo (`fn_perdida_razon`, `fn_perdida_lado`, `fn_es_perdida`), y que
 *         `fn_es_merma` (el nombre que usa Finanzas) diga EXACTAMENTE lo mismo;
 *   · T — totalidad: todo motivo de salida o de ajuste que una función de la base escribe hoy tiene su clase decidida aquí
 *         (si mañana una función escribe un motivo nuevo, esta prueba falla hasta que alguien decida si es pérdida);
 *   · TW — lo mismo para los motivos que la WEB manda a Ajustar (`MOTIVOS_AJUSTE`): una razón de tienda nueva (actividad 13:
 *         «Error al cobrar», «Uso interno», «Se dañó») hace fallar la prueba hasta que se decida su clase;
 *   · PU — la puerta suelta: `registrar_movimiento` rechaza todo motivo que la definición deja fuera (una salida «venta» o un
 *         ajuste «conteo_arranque» escritos a mano ya no esconden una pérdida) y deja pasar los que sí ve;
 *   · R — la pestaña: totales, razones, categoría, talla, «más faltan», lo que apareció aparte, bordes del mes en hora de
 *         Lima, exclusiones (stock inicial, conteo de arranque, movimiento interno, venta, liquidada), traslados (lo que faltó
 *         en la sede que envió; lo que llegó de más en la que recibió), venta anulada con prenda no vendible (costo sellado),
 *         «quedaron» para la resta a mano, filtros por prenda y por zona;
 *   · F — UNA respuesta: el total en soles de la pestaña es el 659 del diario, sede por sede; el diario asienta el faltante de
 *         traslado y el Balance ya no lo lista como causa; una resta «otro» ya no es «otra salida»;
 *   · P — permisos: el líder ve el costo por prenda, la integrante solo totales; sin el módulo Movimientos o en otra sede,
 *         nada; `anon` no ejecuta y las piezas internas no son de nadie;
 *   · G — la guarda: con un mes CERRADO que cambiaría, la migración aborta (se re-aplica su bloque sobre una copia) y nombra
 *         SOLO los meses que cambian; G3 cubre su otra mitad: un mes cerrado donde solo un traslado tuvo faltante.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (comentario de la escena), no salen de las funciones.
 *
 * CÓMO. Igual que `estado_resultados.mjs`: cada escena en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`, en MARZO DE 2031 (un mes sin datos de nadie) y en tres sedes creadas por la escena.
 *
 * USO
 *   pnpm pruebas:perdidas    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
/** Cada verificación de la escena sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-900) });
}
/** Los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// ============================================================================================================================
// C · Clasificación: (tipo, motivo, cantidad) → lado y razón. La tabla es la decisión de Felipe (ADR-0328 «Qué es perder»).
// ============================================================================================================================
const TABLA = [
  // tipo, motivo, cantidad, lado esperado, razón esperada, por qué
  ["ajuste", "merma", -2, "perdida", "a_mano", "merma a mano"],
  ["ajuste", "otro", -1, "perdida", "a_mano", "«otro» que resta (antes no era merma)"],
  ["ajuste", "reposicion", -1, "perdida", "a_mano", "una «reposición» que RESTA"],
  ["ajuste", "motivo_que_no_existe", -1, "perdida", "a_mano", "un motivo nuevo cae del lado que pide mirar"],
  ["ajuste", null, -1, "perdida", "a_mano", "un ajuste sin motivo"],
  ["ajuste", "conteo", -1, "perdida", "conteo", "faltante de un conteo"],
  ["ajuste", "conteo_fisico", -1, "perdida", "conteo", "faltante del «Conteo físico» de Ajustar"],
  ["ajuste", "conteo", 3, "aparecio", "conteo", "sobrante de un conteo: aparte, nunca restado"],
  ["ajuste", "hallazgo_conteo", 1, "aparecio", "conteo", "la que faltó en un conteo y apareció"],
  ["ajuste", "reposicion", 2, "aparecio", "a_mano", "«Encontré prendas»"],
  ["ajuste", "carga_inicial", -5, null, null, "el stock inicial no es pérdida"],
  ["ajuste", "conteo_arranque", -4, null, null, "el primer conteo de una sede no es pérdida (act. 15)"],
  ["ajuste", "conteo_arranque", 4, null, null, "ni aparición"],
  ["salida", "cuarentena_se_boto", 1, "perdida", "danada", "dañada que se botó"],
  ["salida", "cuarentena_donada", 1, "perdida", "danada", "dañada que se donó"],
  ["salida", "cuarentena_liquidada", 1, null, null, "lo liquidado es venta"],
  ["salida", "cuarentena_devuelta_proveedor", 1, null, null, "devolver al proveedor es un reclamo"],
  ["salida", "venta", 1, null, null, "venta"],
  ["salida", "cambio", 1, null, null, "la prenda que se llevó en un cambio"],
  ["salida", "traslado_salida", 1, null, null, "se fue a otra sede (su diferencia se mide en el traslado)"],
  ["salida", "reversion_produccion", 1, null, null, "producción revertida"],
  ["salida", "regalo", 1, "perdida", "a_mano", "una salida suelta que no es venta"],
  ["entrada", "carga_inicial", 5, null, null, "entrada"],
  ["entrada", "recepcion", 5, null, null, "entrada"],
  ["traslado", "movimiento_interno", 3, null, null, "dentro de la sede (por estructura, no por motivo)"],
  ["traslado", null, 3, null, null, "un traslado sin motivo tampoco"],
  ["apartado", "apartado", 1, null, null, "apartar no saca la prenda"],
];
const lit = (v) => (v === null ? "null" : typeof v === "number" ? String(v) : `'${v}'`);
const CLASIFICACION = `
begin;
${TABLA.map(
  ([tipo, motivo, cant, lado, razon, porque]) =>
    `select 'C ${tipo} · ${motivo ?? "sin motivo"} · ${cant} → ${lado ?? "no cuenta"}${razon ? ` (${razon})` : ""}: ${porque}', ` +
    `(select retail.fn_perdida_lado(${lit(tipo)}, ${lit(motivo)}, ${cant}) is not distinct from ${lit(lado)} ` +
    `and retail.fn_perdida_razon(${lit(tipo)}, ${lit(motivo)}, ${cant}) is not distinct from ${lit(razon)} ` +
    `and retail.fn_es_perdida(${lit(tipo)}, ${lit(motivo)}, ${cant}) = ${lado === "perdida"} ` +
    `and retail.fn_es_merma(${lit(tipo)}, ${lit(motivo)}, ${cant}) = ${lado === "perdida"});`
).join("\n")}
`;

// ============================================================================================================================
// T · Totalidad: los motivos que las funciones de la base escriben HOY en una salida o un ajuste. La lista de abajo es la
// decisión tomada para cada uno; un motivo que aparezca y no esté aquí hace fallar la prueba («decide si es pérdida»).
// La salida de cuarentena se arma con `'cuarentena_' || estado`: se arma con los estados que acepta `prendas_danadas`.
// ============================================================================================================================
const DECIDIDOS = {
  salida: ["venta", "cambio", "traslado_salida", "reversion_produccion", "cuarentena_liquidada", "cuarentena_se_boto", "cuarentena_donada", "cuarentena_devuelta_proveedor"],
  ajuste: ["conteo", "hallazgo_conteo", "conteo_arranque", "carga_inicial"],
};
const TOTALIDAD = `
begin;
create temp table escritos as
select distinct x.tipo, x.motivo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       lateral (select (regexp_matches(p.prosrc, '''(salida|ajuste)''\\s*,\\s*[^,]+,\\s*''([a-z_]+)''', 'g')) as m) r,
       lateral (select r.m[1] as tipo, r.m[2] as motivo) x
 where n.nspname = 'retail' and p.prosrc ~* 'insert\\s+into\\s+(retail\\.)?movimientos'
   and x.motivo <> 'cuarentena_';
insert into escritos
select distinct 'salida', 'cuarentena_' || m[1]
  from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') m
 where c.conrelid = 'retail.prendas_danadas'::regclass and pg_get_constraintdef(c.oid) like '%en_cuarentena%liquidada%'
   and m[1] <> 'en_cuarentena';
select 'T los estados de una dañada salen de la base (se botó, donada, liquidada, devuelta al proveedor)', (select count(distinct motivo) = 4 from escritos where motivo in ('cuarentena_se_boto', 'cuarentena_donada', 'cuarentena_liquidada', 'cuarentena_devuelta_proveedor'));
select 'T hay motivos escritos por la base que revisar (la búsqueda funciona)', (select count(*) >= 6 from escritos);
select 'T toda salida que escribe una función tiene su clase decidida', (select coalesce(bool_and(motivo = any (array[${DECIDIDOS.salida.map(lit).join(", ")}])), true) from escritos where tipo = 'salida');
select 'T todo ajuste con motivo fijo que escribe una función tiene su clase decidida', (select coalesce(bool_and(motivo = any (array[${DECIDIDOS.ajuste.map(lit).join(", ")}])), true) from escritos where tipo = 'ajuste');
select 'T de las salidas que escribe la base, solo botada y donada son pérdida', (select bool_and(retail.fn_es_perdida('salida', motivo, 1) = (motivo in ('cuarentena_se_boto', 'cuarentena_donada'))) from escritos where tipo = 'salida');
`;

// ============================================================================================================================
// TW · Totalidad de lo que manda la WEB: los motivos de Ajustar (`MOTIVOS_AJUSTE` de `apps/web/lib/ajuste-reglas.ts`) llegan
// a la base como texto por parámetro, así que T no los ve. Cada uno tiene aquí su clase decidida, y la base tiene que decir la
// misma. La actividad 13 sumará razones de tienda («Error al cobrar», «Uso interno», «Se dañó»): hasta que alguien decida si
// cada una es pérdida (y cuál), esta prueba falla — sin ella caerían solas en «a mano» y en la merma de Finanzas.
// ============================================================================================================================
const AJUSTE_REGLAS = readFileSync(new URL("../../apps/web/lib/ajuste-reglas.ts", import.meta.url), "utf8");
const LISTA_AJUSTAR = AJUSTE_REGLAS.match(/MOTIVOS_AJUSTE\s*=\s*\[([\s\S]*?)\]\s*as const/);
const MOTIVOS_WEB = LISTA_AJUSTAR ? [...LISTA_AJUSTAR[1].matchAll(/valor:\s*"([a-z_]+)"/g)].map((m) => m[1]) : [];
/** La clase de cada motivo de Ajustar al RESTAR (la decisión; la base tiene que coincidir). */
const CLASE_WEB = { merma: "a_mano", otro: "a_mano", reposicion: "a_mano", conteo_fisico: "conteo" };
const MOTIVOS_WEB_SIN_CLASE = MOTIVOS_WEB.filter((m) => !Object.hasOwn(CLASE_WEB, m));
const TOTALIDAD_WEB = `
begin;
${Object.entries(CLASE_WEB)
  .map(([m, clase]) => `select 'TW «${m}» de Ajustar es «${clase}» en la base', (select retail.fn_perdida_razon('ajuste', ${lit(m)}, -1) is not distinct from ${lit(clase)});`)
  .join("\n")}
`;

// ============================================================================================================================
// PU · La puerta suelta. `registrar_movimiento` (RPC de Ajustar) recibe el motivo como texto: sin candado, una salida «venta»
// escrita a mano desaparecía de Pérdidas y de Finanzas. Se prueba con TODOS los motivos que la definición deja fuera (los de
// DECIDIDOS más los nombres viejos del traslado) y con los que sí ve. Como líder, en el almacén de Trujillo, con 10 prendas.
//   Fuera (11): venta, cambio, traslado_salida, reversion_produccion, cuarentena_liquidada, cuarentena_devuelta_proveedor,
//     transferencia, traslado (salidas) · conteo_arranque −1 y +1, carga_inicial −1 (ajustes).
//   Dentro (9, todas restan 1 → 9 prendas perdidas hoy): cuarentena_se_boto, cuarentena_donada, otro, regalo (salidas) ·
//     conteo, hallazgo_conteo, merma, conteo_fisico, otro (ajustes). Sin «reposición»: su propia regla pide nota.
// ============================================================================================================================
const PUERTA = [
  ...DECIDIDOS.salida.map((m) => ["salida", m, 1]),
  ...DECIDIDOS.ajuste.map((m) => ["ajuste", m, -1]),
  ["salida", "transferencia", 1],
  ["salida", "traslado", 1],
  ["ajuste", "conteo_arranque", 1],
  ["salida", "otro", 1],
  ["salida", "regalo", 1],
  ["ajuste", "merma", -1],
  ["ajuste", "conteo_fisico", -1],
  ["ajuste", "otro", -1],
];
// Una función (no una constante): usa AYUDANTES, que se declara más abajo.
const casosPuerta = () => `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru \\gset
select (select id from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' order by id limit 1) as alm \\gset
select (select v.id from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' and v.activo order by v.id limit 1) as v \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
values (:'v', :'tru', :'alm', 'entrada', 10, 'recepcion', now() - interval '2 days') returning id as e \\gset
select retail.fn_aplicar_movimiento(:'e');
select now() as desde \\gset
create temp table antes as select (retail.fn_perdidas_resumen(:'tru', retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'v') #>> '{perdido,unidades}')::int as u;
create temp table pu as
select x.tipo, x.motivo, x.cant, retail.fn_perdida_razon(x.tipo, x.motivo, x.cant) as razon,
       pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, %L, %s, %L, null, %L)', :'v', :'tru', x.tipo, x.cant, x.motivo, :'alm')) as msg
  from (values ${PUERTA.map(([t, m, c]) => `(${lit(t)}, ${lit(m)}, ${c})`).join(", ")}) x (tipo, motivo, cant);
select 'PU1 los 11 motivos que la definición deja fuera se rechazan en la puerta suelta (venta, cambio, traslado, liquidada, devuelta, producción, stock inicial, conteo de arranque)',
  (select count(*) = 11 and bool_and(msg <> 'SIN_ERROR') from pu where razon is null);
select 'PU1 y dicen adónde ir (el stock inicial puede frenarlo antes su propia puerta, 20261004210100)',
  (select bool_and(msg like '%tiene su propia pantalla%') from pu where razon is null and motivo <> 'carga_inicial');
select 'PU2 los 9 que la definición ve sí entran (salidas otro, regalo, botada, donada; ajustes merma, conteo, conteo físico, hallazgo, otro)',
  (select count(*) = 9 and bool_and(msg = 'SIN_ERROR') from pu where razon is not null);
select 'PU3 nada de lo rechazado quedó escrito, y todo lo que entró está en Pérdidas: 9 prendas',
  (select count(*) = 9 and bool_and(retail.fn_perdida_razon(tipo, motivo, cantidad) is not null)
     from retail.movimientos where variante_id = :'v' and ubicacion_id = :'tru' and created_at >= :'desde')
  and (select (retail.fn_perdidas_resumen(:'tru', retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'v') #>> '{perdido,unidades}')::int - antes.u = 9 from antes);
`;

// ============================================================================================================================
// R/F/P · LA ESCENA DE MARZO DE 2031 (hora de Lima). Sedes nuevas: T (con piso y almacén), O (otra tienda) y Z (solo para
// fijar costos). Prendas: v1 cuesta 40, v2 cuesta 25 (vendida con costo sellado 30), v3 sin costo (0).
//
//   En T, PÉRDIDAS de marzo:
//     M1  v1 −1 conteo (3-mar, piso)                         1 × 40 =  40   conteo
//     M2  v1 −2 merma con nota (10-mar, piso)                2 × 40 =  80   a_mano · quedaron 2 (10 − 1 − 4 − 1 − 2)
//     M3  v2 −3 otro SIN nota (12-mar, almacén)              3 × 25 =  75   a_mano · quedaron 0 (la dejó en 0)
//     M6  v3 se botó (16-mar, cuarentena)                    1 ×  0 =   0   danada · sin costo
//     TT  traslado T→O cerrado el 20-mar: v2 enviada 2, llegó 1   1 × 25 =  25   traslado (en T, la que envió)
//     AN  venta de v2 anulada el 22-mar, condición «danada_donar»  1 × 30 =  30   danada (costo SELLADO 30, no el de hoy)
//     → 9 prendas, S/ 250, 1 sin costo, 6 hechos
//   En T, APARECIÓ (aparte, nunca restado):
//     M4  v1 +1 reposición (14-mar, almacén)  40 · M5  v1 +2 hallazgo_conteo (15-mar, almacén)  80
//     TO  traslado O→T cerrado el 20-mar: llegó v3 que no venía  0
//     → 4 prendas, S/ 120, 3 hechos
//   NO cuentan: M7 liquidada · M8 v1 −4 conteo_arranque · M9 v1 −1 carga_inicial (ajuste) · M10 v1 3 piso→almacén ·
//     M11 venta · M12 1-abr 00:10 Lima · M13 28-feb 23:50 Lima · venta anulada «vendible» · venta de prueba anulada.
//   En O: TO envió 3 v1 y llegaron 1 → faltaron 2 × 40 = 80 (traslado, en O). Lo que llegó de más de TT: nada.
// ============================================================================================================================
const AYUDANTES = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
`;

const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Pérdidas T', 'tienda') returning id as t \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Pérdidas O', 'tienda') returning id as o \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Pérdidas Z', 'tienda') returning id as z \\gset
select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru \\gset
select (select id from retail.sububicaciones where ubicacion_id = :'tru' order by (tipo = 'piso_venta') desc, id limit 1) as tru_sub \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select :'t', x.nombre, x.tipo from (values ('Piso P', 'piso_venta'), ('Almacén P', 'almacen_tienda'), ('Cuarentena P', 'cuarentena')) x (nombre, tipo)
 where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'t' and s.tipo = x.tipo);
select (select id from retail.sububicaciones where ubicacion_id = :'t' and tipo = 'piso_venta') as piso \\gset
select (select id from retail.sububicaciones where ubicacion_id = :'t' and tipo = 'almacen_tienda') as alm \\gset
select (select id from retail.sububicaciones where ubicacion_id = :'t' and tipo = 'cuarentena') as cua \\gset
-- Tres prendas reales con talla, color y categoría, de combinaciones distintas.
select (array_agg(x.id order by x.id))[1] as v1, (array_agg(x.id order by x.id))[2] as v2, (array_agg(x.id order by x.id))[3] as v3
  from (select distinct on (p.categoria_id, v.talla_id, v.color_codigo) v.id
          from retail.variantes v join retail.productos p on p.id = v.producto_id
         where v.id <> '22222222-2222-4222-8222-222222222222' and v.talla_id is not null and v.color_codigo is not null and p.categoria_id is not null
         order by p.categoria_id, v.talla_id, v.color_codigo, v.id
         limit 3) x \\gset
-- Costos: un cambio de costo el 1-ene-2031 (su entrada vive en Z, para no tocar el libro de T).
create function pg_temp.costo(p_var uuid, p_costo numeric, p_z uuid) returns void language sql as $f$
  with m as (
    insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
    values (p_var, p_z, 'entrada', 1, 'recepcion', '2031-01-01 12:00-05') returning id
  )
  insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
  select p_var, 0, 0, 1, p_costo, p_costo, 'compra', m.id, '2031-01-01 12:00-05' from m
$f$;
select pg_temp.costo(:'v1', 40, :'z'), pg_temp.costo(:'v2', 25, :'z'), pg_temp.costo(:'v3', 0, :'z');

-- El libro de T.
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, nota, created_at) values
  (pg_temp.k('M0'),  :'v1', :'t', :'piso', null, null, 'entrada', 10, 'carga_inicial', null, '2031-02-01 10:00-05'),
  (pg_temp.k('M0b'), :'v2', :'t', :'alm',  null, null, 'entrada',  3, 'carga_inicial', null, '2031-02-01 10:00-05'),
  (pg_temp.k('M13'), :'v1', :'t', :'piso', null, null, 'ajuste',  -1, 'merma', null,            '2031-02-28 23:50-05'),
  (pg_temp.k('M8'),  :'v1', :'t', :'piso', null, null, 'ajuste',  -4, 'conteo_arranque', null,  '2031-03-01 09:00-05'),
  (pg_temp.k('M1'),  :'v1', :'t', :'piso', null, null, 'ajuste',  -1, 'conteo', null,           '2031-03-03 12:00-05'),
  (pg_temp.k('M2'),  :'v1', :'t', :'piso', null, null, 'ajuste',  -2, 'merma', 'se manchó',     '2031-03-10 12:00-05'),
  (pg_temp.k('M3'),  :'v2', :'t', :'alm',  null, null, 'ajuste',  -3, 'otro', '   ',            '2031-03-12 12:00-05'),
  (pg_temp.k('M4'),  :'v1', :'t', :'alm',  null, null, 'ajuste',   1, 'reposicion', null,       '2031-03-14 12:00-05'),
  (pg_temp.k('M5'),  :'v1', :'t', :'alm',  null, null, 'ajuste',   2, 'hallazgo_conteo', null,  '2031-03-15 12:00-05'),
  (pg_temp.k('M6'),  :'v3', :'t', :'cua',  null, null, 'salida',   1, 'cuarentena_se_boto', null, '2031-03-16 12:00-05'),
  (pg_temp.k('M7'),  :'v1', :'t', :'cua',  null, null, 'salida',   1, 'cuarentena_liquidada', null, '2031-03-17 12:00-05'),
  (pg_temp.k('M9'),  :'v1', :'t', :'piso', null, null, 'ajuste',  -1, 'carga_inicial', null,    '2031-03-17 13:00-05'),
  (pg_temp.k('M10'), :'v1', :'t', :'piso', :'t', :'alm',  'traslado', 3, 'movimiento_interno', null, '2031-03-18 12:00-05'),
  (pg_temp.k('M11'), :'v1', :'t', :'piso', null, null, 'salida',   1, 'venta', null,            '2031-03-19 12:00-05'),
  (pg_temp.k('M12'), :'v1', :'t', :'piso', null, null, 'ajuste',  -1, 'merma', null,            '2031-04-01 00:10-05');

-- En Trujillo (la sede de la integrante): una merma de v1 en marzo, para que ella tenga algo que ver.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
values (:'v1', :'tru', :'tru_sub', 'ajuste', -1, 'merma', '2031-03-05 12:00-05');

-- Traslado TT: T → O, enviadas 2 v2, llegó 1. Traslado TO: O → T, enviadas 3 v1, llegó 1 v1 y 1 v3 que no venía.
insert into retail.transferencias (id, ubicacion_origen_id, ubicacion_destino_id, estado, cerrado_en, nota_cierre, created_at) values
  (pg_temp.k('TT'), :'t', :'o', 'cerrada', '2031-03-20 18:00-05', 'faltó una en la caja', '2031-03-19 09:00-05'),
  (pg_temp.k('TO'), :'o', :'t', 'cerrada', '2031-03-20 19:00-05', null,                   '2031-03-19 09:00-05');
insert into retail.transferencia_items (id, transferencia_id, variante_id, cantidad) values
  (pg_temp.k('TTi'), pg_temp.k('TT'), :'v2', 2), (pg_temp.k('TOi'), pg_temp.k('TO'), :'v1', 3);
insert into retail.transferencia_recepciones (id, transferencia_id, variante_id, cantidad_recibida) values
  (pg_temp.k('TTr'), pg_temp.k('TT'), :'v2', 1), (pg_temp.k('TOr1'), pg_temp.k('TO'), :'v1', 1), (pg_temp.k('TOr3'), pg_temp.k('TO'), :'v3', 1);
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, transferencia_item_id, transferencia_recepcion_id, created_at) values
  (:'v2', :'t', 'salida',  2, 'traslado_salida',  pg_temp.k('TTi'), null,              '2031-03-19 09:00-05'),
  (:'v2', :'o', 'entrada', 1, 'traslado_entrada', null,              pg_temp.k('TTr'),  '2031-03-20 18:00-05'),
  (:'v1', :'o', 'salida',  3, 'traslado_salida',  pg_temp.k('TOi'), null,              '2031-03-19 09:00-05'),
  (:'v1', :'t', 'entrada', 1, 'traslado_entrada', null,              pg_temp.k('TOr1'), '2031-03-20 19:00-05'),
  (:'v3', :'t', 'entrada', 1, 'traslado_entrada', null,              pg_temp.k('TOr3'), '2031-03-20 19:00-05');

-- Ventas anuladas: AN (prenda no vendible: pérdida al costo SELLADO 30), AV (vendible: vuelve al stock), AP (de prueba).
insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, es_prueba, created_at) values
  (pg_temp.k('AN'), :'t', 'anulada', '2031-03-22 12:00-05', 'venía rota', false, '2031-03-21 12:00-05'),
  (pg_temp.k('AV'), :'t', 'anulada', '2031-03-22 13:00-05', 'se arrepintió', false, '2031-03-21 13:00-05'),
  (pg_temp.k('AP'), :'t', 'anulada', '2031-03-22 14:00-05', 'prueba', true, '2031-03-21 14:00-05');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (pg_temp.k('ANi'), pg_temp.k('AN'), :'v2', 1, 100, 30),
  (pg_temp.k('AVi'), pg_temp.k('AV'), :'v2', 1, 100, 30),
  (pg_temp.k('APi'), pg_temp.k('AP'), :'v2', 1, 100, 30);
-- Cobradas en efectivo (sin el cobro, el asiento de la venta no cuadraría).
insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k('AN'), 'efectivo', 100), (pg_temp.k('AV'), 'efectivo', 100), (pg_temp.k('AP'), 'efectivo', 100);
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values
  (pg_temp.k('AN'), pg_temp.k('ANi'), 'danada_donar'),
  (pg_temp.k('AV'), pg_temp.k('AVi'), 'vendible'),
  (pg_temp.k('AP'), pg_temp.k('APi'), 'danada_donar');

create temp table r as select retail.fn_perdidas_resumen(:'t', '2031-03-01', '2031-03-31') as j;
create temp table ro as select retail.fn_perdidas_resumen(:'o', '2031-03-01', '2031-03-31') as j;
create temp table h as select x.x from r, jsonb_array_elements(r.j -> 'hechos') x (x);
`;

const CASOS_RESUMEN = `
select 'R1 T perdió 9 prendas, S/ 250 al costo de cada día, 1 sin costo cargado, en 6 hechos',
  (select (j #>> '{perdido,unidades}')::int = 9 and (j #>> '{perdido,soles}')::numeric = 250 and (j #>> '{perdido,sin_costo}')::int = 1 and (j #>> '{perdido,hechos}')::int = 6 from r);
select 'R1 lo que apareció va aparte y no se resta: 4 prendas, S/ 120, 3 hechos',
  (select (j #>> '{aparecio,unidades}')::int = 4 and (j #>> '{aparecio,soles}')::numeric = 120 and (j #>> '{aparecio,hechos}')::int = 3 from r);
select 'R2 por razón: faltó al contar 1 · a mano 5 · dañada 2 · traslado 1',
  (select count(*) = 4
          and bool_and(case x ->> 'razon' when 'conteo' then (x ->> 'unidades')::int = 1 and (x ->> 'soles')::numeric = 40
                                          when 'a_mano' then (x ->> 'unidades')::int = 5 and (x ->> 'soles')::numeric = 155
                                          when 'danada' then (x ->> 'unidades')::int = 2 and (x ->> 'soles')::numeric = 30
                                          when 'traslado' then (x ->> 'unidades')::int = 1 and (x ->> 'soles')::numeric = 25 end)
     from r, jsonb_array_elements(j -> 'por_razon') x where x ->> 'lado' = 'perdida');
select 'R2 y lo que apareció por su razón: a mano 1 · al contar 2 · traslado 1',
  (select count(*) = 3 and sum((x ->> 'unidades')::int) filter (where x ->> 'razon' = 'conteo') = 2
          and sum((x ->> 'unidades')::int) filter (where x ->> 'razon' = 'a_mano') = 1 and sum((x ->> 'unidades')::int) filter (where x ->> 'razon' = 'traslado') = 1
     from r, jsonb_array_elements(j -> 'por_razon') x where x ->> 'lado' = 'aparecio');
select 'R3 por categoría y por talla suman lo perdido (9 prendas, S/ 250)',
  (select sum((x ->> 'unidades')::int) = 9 and sum((x ->> 'soles')::numeric) = 250 from r, jsonb_array_elements(j -> 'por_categoria') x)
  and (select sum((x ->> 'unidades')::int) = 9 and sum((x ->> 'soles')::numeric) = 250 from r, jsonb_array_elements(j -> 'por_talla') x);
select 'R3 «más faltan»: primero la categoría · talla · color de v2 (5 prendas en 3 días), después la de v1 (3)',
  (select (j -> 'mas_faltan' -> 0 ->> 'unidades')::int = 5 and (j -> 'mas_faltan' -> 0 ->> 'veces')::int = 3
          and (j -> 'mas_faltan' -> 1 ->> 'unidades')::int = 3
          and (j -> 'mas_faltan' -> 0 ->> 'talla') = (select t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.id = :'v2')
     from r);
select 'R4 el borde del mes es la medianoche de Lima: ni el 28-feb 23:50 ni el 1-abr 00:10',
  (select count(*) = 0 from h where (x ->> 'id')::uuid in (pg_temp.k('M12'), pg_temp.k('M13'))) and (select count(*) = 9 from h);
select 'R4 no cuentan: liquidada, conteo de arranque, stock inicial, movimiento interno, venta, anulada vendible, venta de prueba',
  (select count(*) = 0 from h where (x ->> 'id')::uuid in (pg_temp.k('M7'), pg_temp.k('M8'), pg_temp.k('M9'), pg_temp.k('M10'), pg_temp.k('M11'), pg_temp.k('AVi'), pg_temp.k('APi')));
select 'R5 lo que faltó en el traslado T→O es pérdida de T (la que envió), con su nota y su número',
  (select count(*) = 1 and bool_and(x ->> 'razon' = 'traslado' and x ->> 'lado' = 'perdida' and (x ->> 'unidades')::int = 1 and x ->> 'nota' = 'faltó una en la caja'
                                    and x ->> 'documento_tipo' = 'traslado' and (x ->> 'documento_numero') is not null and (x ->> 'con_documento')::boolean)
     from h where x ->> 'fuente' = 'traslado' and x ->> 'lado' = 'perdida');
select 'R5 lo que llegó de más (v3, que no venía) aparece en T, la que recibió',
  (select count(*) = 1 and bool_and((x ->> 'variante_id')::uuid = :'v3') from h where x ->> 'fuente' = 'traslado' and x ->> 'lado' = 'aparecio');
select 'R5 O perdió las 2 v1 que no llegaron a T: S/ 80',
  (select (j #>> '{perdido,unidades}')::int = 2 and (j #>> '{perdido,soles}')::numeric = 80 and (j #>> '{aparecio,unidades}')::int = 0 from ro);
select 'R6 la venta anulada con prenda no vendible es pérdida «dañada» al costo SELLADO (30, no 25)',
  (select count(*) = 1 and bool_and(x ->> 'razon' = 'danada' and (x ->> 'costo_unitario')::numeric = 30 and x ->> 'documento_tipo' = 'venta')
     from h where (x ->> 'id')::uuid = pg_temp.k('ANi'));
select 'R7 «quedaron»: la resta «otro» dejó la talla en 0 y la merma dejó 2 (el libro hasta ese instante, febrero incluido)',
  (select (x ->> 'quedaron')::int = 0 from h where (x ->> 'id')::uuid = pg_temp.k('M3'))
  and (select (x ->> 'quedaron')::int = 2 from h where (x ->> 'id')::uuid = pg_temp.k('M2'));
select 'R7 una nota en blanco es «sin nota»; la escrita se conserva',
  (select x -> 'nota' = 'null'::jsonb from h where (x ->> 'id')::uuid = pg_temp.k('M3'))
  and (select x ->> 'nota' = 'se manchó' from h where (x ->> 'id')::uuid = pg_temp.k('M2'));
select 'R7 «quedaron» solo en las restas a mano sin documento',
  (select bool_and(x -> 'quedaron' = 'null'::jsonb) from h where x ->> 'fuente' <> 'movimiento' or x ->> 'lado' <> 'perdida');
select 'R8 filtro por prenda: solo v1 (2 perdidas, 2 aparecidas)',
  (select (j #>> '{perdido,hechos}')::int = 2 and (j #>> '{aparecio,hechos}')::int = 2
     from (select retail.fn_perdidas_resumen(:'t', '2031-03-01', '2031-03-31', :'v1') as j) q);
select 'R8 filtro por zona: solo el almacén (la resta «otro» y las dos que aparecieron)',
  (select (j #>> '{perdido,hechos}')::int = 1 and (j #>> '{aparecio,hechos}')::int = 2
     from (select retail.fn_perdidas_resumen(:'t', '2031-03-01', '2031-03-31', null, :'alm') as j) q);
select 'R9 la lista viene de la más reciente a la más vieja, con prenda, talla y color',
  (select bool_and(x ->> 'producto' is not null and x ->> 'talla' is not null) from h)
  and (select (j -> 'hechos' -> 0 ->> 'instante')::timestamptz >= (j -> 'hechos' -> 1 ->> 'instante')::timestamptz from r);
select 'R9 un rango al revés o de más de un año se rechaza',
  (select pg_temp.intento(format('select retail.fn_perdidas_resumen(%L, %L, %L)', :'t', '2031-03-31', '2031-03-01')) like '%rango%')
  and (select pg_temp.intento(format('select retail.fn_perdidas_resumen(%L, %L, %L)', :'t', '2029-01-01', '2031-03-01')) like '%un año%');
`;

const CASOS_FINANZAS = `
create temp table dia as select * from retail.fn_asientos('2031-03-01', '2031-03-31');
select 'F1 UNA respuesta: el 659 del diario de T es el total de la pestaña (S/ 250)',
  (select coalesce(sum(debe), 0) from dia where ubicacion_id = :'t' and cuenta = '659') = (select (j #>> '{perdido,soles}')::numeric from r);
select 'F1 y en O también (S/ 80, el faltante del traslado que envió)',
  (select coalesce(sum(debe), 0) from dia where ubicacion_id = :'o' and cuenta = '659') = (select (j #>> '{perdido,soles}')::numeric from ro)
  and (select (j #>> '{perdido,soles}')::numeric = 80 from ro);
select 'F2 el diario asienta lo que faltó en el traslado: 659 contra 201, en la sede que lo envió',
  (select sum(debe) filter (where cuenta = '659') = 25 and sum(haber) filter (where cuenta = '201') = 25 and bool_and(ubicacion_id = :'t')
     from dia where regla = 'merma_traslado' and origen_id = pg_temp.k('TTi'));
select 'F2 la resta «otro» es merma a mano (merma_merma), ya no «conteo»',
  (select bool_and(regla = 'merma_merma') and sum(debe) = 75 from dia where origen_id = pg_temp.k('M3') and cuenta = '659');
select 'F2 cada asiento cuadra', (select count(*) = 0 from retail.fn_asientos_descuadrados('2031-03-01', '2031-03-31'));
select 'F3 el Balance ya no lista el faltante de traslado como causa (lo explica el diario)',
  (select count(*) = 0 from retail.fn_bal_causas_mercaderia('2031-03-01', '2031-03-31') where clave = 'faltante_traslado');
-- «Otras salidas» de marzo: la liquidada (40), el stock inicial corregido (40) y el conteo de arranque (4 × 40 = 160) —no son
-- pérdida y siguen siendo una causa del Balance—. La resta «otro» (75) ya no está: es merma. Antes eran 315.
select 'F3 ni la resta «otro» como «otra salida» (quedan la liquidada, el stock inicial y el conteo de arranque: 240)',
  (select monto = 240 from retail.fn_bal_causas_mercaderia('2031-03-01', '2031-03-31') where clave = 'otras_salidas');
select 'F4 el Estado de resultados de T dice mermas S/ 250, con su detalle «faltó en traslado»',
  (select mermas = 250 and exists (select 1 from jsonb_array_elements(detalle_mermas) x where x ->> 'regla' = 'merma_traslado' and (x ->> 'monto')::numeric = 25)
     from retail.fn_estado_resultados('2031-03-01', '2031-03-31', :'t'));
`;

const CASOS_PERMISOS = `
select 'P1 el líder ve el costo por prenda', (select bool_and((r.j ->> 've_costo')::boolean and x -> 'costo_unitario' <> 'null'::jsonb) from r, jsonb_array_elements(r.j -> 'hechos') x);
select 'P1 y filtrada a una prenda sigue viendo sus soles (v1 en T: 3 prendas, S/ 120)',
  (select (j #>> '{perdido,unidades}')::int = 3 and (j #>> '{perdido,soles}')::numeric = 120
     from (select retail.fn_perdidas_resumen(:'t', '2031-03-01', '2031-03-31', :'v1') as j) q);
${cambiaA(MICAELA)}
select 'P2 una integrante no ve las pérdidas de otra sede',
  (select pg_temp.intento(format('select retail.fn_perdidas_resumen(%L, %L, %L)', :'t', '2031-03-01', '2031-03-31')) like '%permiso%');
create temp table rm as select retail.fn_perdidas_resumen(:'tru', '2031-03-01', '2031-03-31') as j;
select 'P3 en su sede ve unidades y totales en soles (1 prenda, S/ 40), nunca el costo por prenda',
  (select not (j ->> 've_costo')::boolean and (j #>> '{perdido,unidades}')::int = 1 and (j #>> '{perdido,soles}')::numeric = 40 from rm)
  and (select count(*) = 1 and bool_and(x -> 'costo_unitario' = 'null'::jsonb) from rm, jsonb_array_elements(rm.j -> 'hechos') x);
-- Filtrada a UNA prenda, «S/ total ÷ prendas» sería su costo: la base no le manda ningún soles (revisión adversarial).
create temp table rmp as select retail.fn_perdidas_resumen(:'tru', '2031-03-01', '2031-03-31', :'v1') as j;
select 'P3 filtrada a una prenda, la integrante ve solo unidades: ningún soles (su total sería el costo de la prenda)',
  (select (j #>> '{perdido,unidades}')::int = 1 and j #> '{perdido,soles}' = 'null'::jsonb and j #> '{aparecio,soles}' = 'null'::jsonb from rmp)
  and (select count(*) >= 3 and bool_and(x -> 'soles' = 'null'::jsonb)
         from rmp, jsonb_array_elements((rmp.j -> 'por_razon') || (rmp.j -> 'por_categoria') || (rmp.j -> 'por_talla')) x);
select 'P3 y filtrada a una zona vuelve a ver los totales en soles (una zona junta prendas distintas)',
  (select (j #>> '{perdido,soles}')::numeric = 40
     from (select retail.fn_perdidas_resumen(:'tru', '2031-03-01', '2031-03-31', null, :'tru_sub') as j) q);
delete from retail.rol_modulos where modulo = 'movimientos' and rol_id = (select id from retail.roles where clave = 'integrante');
select 'P4 sin el módulo Movimientos, nada',
  (select pg_temp.intento(format('select retail.fn_perdidas_resumen(%L, %L, %L)', :'tru', '2031-03-01', '2031-03-31')) like '%Movimientos%');
reset role;
select 'P5 anon no ejecuta la lectura; las piezas internas no son de nadie',
  not has_function_privilege('anon', 'retail.fn_perdidas_resumen(uuid, date, date, uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_perdidas_resumen(uuid, date, date, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_perdidas_hechos(uuid, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_perdidas_de_traslados(uuid, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_perdida_razon(text, text, integer)', 'execute');
`;

// ============================================================================================================================
// I · El resumen de Inventario (`fn_resumen_variantes.mermas_ventana`) usa la misma definición. Su ventana termina HOY, así
// que se prueba con fechas relativas a ahora: una resta «otro» (antes no contaba) sí; un conteo de arranque, no.
// ============================================================================================================================
const RESUMEN_INVENTARIO = `
begin;
${cambiaA(FELIPE)}
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Pérdidas I', 'tienda') returning id as ti \\gset
select (select v.id from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1) as vi \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values
  (:'vi', :'ti', 'entrada', 5, 'carga_inicial', now() - interval '5 days'),
  (:'vi', :'ti', 'ajuste', -2, 'otro', now() - interval '1 day'),
  (:'vi', :'ti', 'ajuste', -1, 'conteo_arranque', now() - interval '1 day'),
  (:'vi', :'ti', 'salida', 1, 'cuarentena_donada', now() - interval '1 day');
select 'I1 el resumen de Inventario cuenta la resta «otro» y la donada (3), no el conteo de arranque',
  (select mermas_ventana = 3 from retail.fn_resumen_variantes(:'ti', 30) where variante_id = :'vi');
`;

// ============================================================================================================================
// G · La guarda de la migración. Sobre una copia de la escena: se devuelve `fn_es_merma` a su versión vieja (para que la
// guarda mida), se CIERRA marzo de T y se corre el bloque `do $guarda$` de la migración: tiene que abortar y decir el mes.
// ============================================================================================================================
const MIGRACION = readFileSync(new URL("../../supabase/migrations/20261004220000_perdidas_una_sola_definicion.sql", import.meta.url), "utf8");
const GUARDA = MIGRACION.slice(MIGRACION.indexOf("do $guarda$"), MIGRACION.indexOf("$guarda$;") + "$guarda$".length);
const CASOS_GUARDA = `
create or replace function retail.fn_es_merma(p_tipo text, p_motivo text, p_cantidad integer) returns boolean language sql immutable as $f$
  select (p_tipo = 'ajuste' and p_cantidad < 0 and p_motivo in ('merma', 'conteo', 'conteo_fisico'))
      or (p_tipo = 'salida' and p_motivo in ('cuarentena_se_boto', 'cuarentena_donada'));
$f$;
create temp table guarda_libre as select pg_temp.intento(${dolar(GUARDA)}) as msg;
select 'G1 con marzo abierto, la guarda deja pegar', (select msg = 'SIN_ERROR' from guarda_libre);
insert into retail.periodos (id, mes, alcance, ubicacion_id, estado, cierre_id) values (pg_temp.k('PER'), '2031-03-01', 'ubicacion', :'t', 'cerrado', pg_temp.k('PC'));
insert into retail.periodo_cierres (id, periodo_id, mes, alcance, ubicacion_id, version, cerrado_por, huella, lineas, total_debe, total_haber)
select pg_temp.k('PC'), pg_temp.k('PER'), '2031-03-01', 'ubicacion', :'t', 1, (select id from public.personas where auth_user_id = '${FELIPE}'), repeat('0', 64), 0, 0, 0;
-- Febrero de T también cerrado, pero nada de febrero cambia (su merma ya era merma): no se pide reabrirlo.
insert into retail.periodos (id, mes, alcance, ubicacion_id, estado, cierre_id) values (pg_temp.k('PERF'), '2031-02-01', 'ubicacion', :'t', 'cerrado', pg_temp.k('PCF'));
insert into retail.periodo_cierres (id, periodo_id, mes, alcance, ubicacion_id, version, cerrado_por, huella, lineas, total_debe, total_haber)
select pg_temp.k('PCF'), pg_temp.k('PERF'), '2031-02-01', 'ubicacion', :'t', 1, (select id from public.personas where auth_user_id = '${FELIPE}'), repeat('0', 64), 0, 0, 0;
create temp table guarda_cerrada as select pg_temp.intento(${dolar(GUARDA)}) as msg;
select 'G2 con marzo de T CERRADO y movimientos que cambian de clase, la migración aborta y nombra el mes',
  (select msg like '%meses ya CERRADOS%' and msg like '%2031-03 Tienda Pérdidas T%' from guarda_cerrada);
select 'G2 y nombra SOLO los meses que cambian: febrero de T, cerrado y sin cambios, no se pide reabrir',
  (select msg not like '%2031-02%' from guarda_cerrada);
`;

// G3 · La otra mitad de la guarda: un mes cerrado donde NINGÚN movimiento cambia de clase, pero un traslado cerrado ahí tuvo
// faltante. Marzo de O: TO (O → T) envió 3 v1 y llegaron 1. Los movimientos de O en marzo (la salida y la entrada de los
// traslados) no cambian de clase; la línea de TO, sí (antes era causa del Balance, ahora merma del diario).
const CASOS_GUARDA_TRASLADO = `
create or replace function retail.fn_es_merma(p_tipo text, p_motivo text, p_cantidad integer) returns boolean language sql immutable as $f$
  select (p_tipo = 'ajuste' and p_cantidad < 0 and p_motivo in ('merma', 'conteo', 'conteo_fisico'))
      or (p_tipo = 'salida' and p_motivo in ('cuarentena_se_boto', 'cuarentena_donada'));
$f$;
insert into retail.periodos (id, mes, alcance, ubicacion_id, estado, cierre_id) values (pg_temp.k('PERO'), '2031-03-01', 'ubicacion', :'o', 'cerrado', pg_temp.k('PCO'));
insert into retail.periodo_cierres (id, periodo_id, mes, alcance, ubicacion_id, version, cerrado_por, huella, lineas, total_debe, total_haber)
select pg_temp.k('PCO'), pg_temp.k('PERO'), '2031-03-01', 'ubicacion', :'o', 1, (select id from public.personas where auth_user_id = '${FELIPE}'), repeat('0', 64), 0, 0, 0;
create temp table guarda_traslado as select pg_temp.intento(${dolar(GUARDA)}) as msg;
select 'G3 con marzo de O cerrado y SOLO un traslado con faltante (ningún movimiento cambia), la migración aborta y nombra ese mes',
  (select msg like 'Hay 0 movimientos y 1 líneas de traslado%' and msg like '%2031-03 Tienda Pérdidas O%' and msg not like '%Tienda Pérdidas T%' from guarda_traslado);
`;
function dolar(sql) {
  return `$GUARDA$${sql}$GUARDA$`;
}

// ---------------------------------------------------------------------------------------------------------------------------
verificar("Clasificación", correr(CLASIFICACION), casosDe(CLASIFICACION));
verificar("Totalidad", correr(TOTALIDAD), casosDe(TOTALIDAD));
esperar("TW se encontraron los motivos de Ajustar en la web (MOTIVOS_AJUSTE de apps/web/lib/ajuste-reglas.ts)", MOTIVOS_WEB.length >= 4, { MOTIVOS_WEB });
esperar(
  "TW cada motivo que Ajustar puede mandar tiene su clase decidida (una razón de tienda nueva la pide: súmala a CLASE_WEB y a fn_perdida_razon)",
  MOTIVOS_WEB_SIN_CLASE.length === 0,
  { sin_clase: MOTIVOS_WEB_SIN_CLASE }
);
verificar("Totalidad de la web", correr(TOTALIDAD_WEB), casosDe(TOTALIDAD_WEB));
const CASOS_PUERTA = casosPuerta();
verificar("Puerta suelta", correr(CASOS_PUERTA), casosDe(CASOS_PUERTA));
verificar("Pestaña Pérdidas", correr(`${ESCENA}${CASOS_RESUMEN}`), casosDe(CASOS_RESUMEN));
verificar("Finanzas", correr(`${ESCENA}${CASOS_FINANZAS}`), casosDe(CASOS_FINANZAS));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));
verificar("Resumen de Inventario", correr(RESUMEN_INVENTARIO), casosDe(RESUMEN_INVENTARIO));
verificar("Guarda", correr(`${ESCENA}${CASOS_GUARDA}`), casosDe(CASOS_GUARDA));
verificar("Guarda (solo un traslado)", correr(`${ESCENA}${CASOS_GUARDA_TRASLADO}`), casosDe(CASOS_GUARDA_TRASLADO));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
