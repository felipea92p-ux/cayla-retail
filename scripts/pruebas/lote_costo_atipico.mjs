#!/usr/bin/env node
/**
 * Prueba de «recibir un lote sin factura pide confirmación si el costo de una línea es atípico» (Felipe, 2026-09-30) contra el
 * Postgres LOCAL: migración `20260930122000_recibir_lote_costo_atipico.sql` (usa la regla de `20260930120000`).
 *
 * Las prendas son BLU-EMMA-NEG-M y BLU-EMMA-NEG-S de la semilla: costo vigente 32.00 y precio 79.90 las dos. 70 «sube» (más del
 * doble de 32 y bajo el precio), 15 «baja» (menos de 2/3 de 32), 85 es «mayor que el precio» y 0 es «sin costo».
 *
 * QUÉ CUBRE (cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia)
 *   1. Un lote con costos normales, sin costo, o con un costo de 0 (un OBSEQUIO: decisión explícita en Compras), entra sin preguntar
 *      nada, con los SEIS parámetros de siempre (por nombre, como los manda la web).
 *   2. Un líder que recibe con costos atípicos recibe `costo_atipico` con TODAS las líneas atípicas en `detail`
 *      (`{"items":[…]}`, en el orden del lote) y ninguna de las normales; con un motivo por línea.
 *   3. TODO O NADA: tras el rechazo no hay lote, ni movimientos (tampoco de las líneas normales), ni filas de historial de
 *      costo, ni stock nuevo, y el costo de las prendas queda intacto.
 *   4. El token (ADR-0190): el rechazo no lo consume; el reintento con el MISMO token y las marcas es el mismo intento
 *      (un solo lote), y repetirlo devuelve ese lote, no uno nuevo.
 *   5. La confirmación viaja EN CADA LÍNEA (`"confirma_costo": true`): con la marca el líder recibe, los costos entran al
 *      promedio ponderado exacto y el lote deja constancia en su nota SIN montos (conservando la nota que ya traía). Si solo
 *      marca una de dos atípicas, vuelve a preguntar solo por la otra y no se escribe nada; marcar una línea normal no hace nada.
 *   6. Un integrante (no ve montos) con un costo atípico NO puede recibir esa línea: `costo_atipico_sin_lider`, sin cifras,
 *      y mandar la confirmación por la API directa no cambia nada. Sin costo, o con uno normal, sí recibe.
 *   7. Una sola función `recibir_lote` (la firma de seis parámetros no cambió), `authenticated` la sigue ejecutando, y la
 *      migración se puede pegar dos veces.
 *
 * USO
 *   pnpm pruebas:lote-costo-atipico   → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930122000_recibir_lote_costo_atipico.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (semilla)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante (semilla), fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 8).join("\n    ")}`);
  }
}

const sesion = (uid) => `set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;

const ESCENA = `
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_msg text; v_det text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
  return jsonb_build_object('ok', false, 'msg', v_msg, 'detail', nullif(v_det, ''));
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select id as vm, costo as cm from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as vs from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select coalesce(sum(cantidad), 0) as stm from retail.stock where variante_id = :'vm' \\gset
select coalesce(sum(cantidad), 0) as sts from retail.stock where variante_id = :'vs' \\gset
select count(*) as hm0 from retail.costo_historial where variante_id = :'vm' \\gset
select count(*) as hs0 from retail.costo_historial where variante_id = :'vs' \\gset
select count(*) as lotes0 from retail.lotes \\gset
select gen_random_uuid() as tok \\gset
`;

/**
 * Corre una escena y devuelve el estado final. `lineas`: [{ prenda: 'M'|'S', cantidad, costo }] (costo null = sin costo).
 * `como`: 'lider' | 'integrante'. `confirma: true` pone la marca `confirma_costo` en TODAS las líneas (cada línea puede traer
 * la suya: `{ …, confirma: true }`). `intentos`: cuántas veces se llama (mismo token). `nota`: la nota que trae el lote.
 */
function escena({ lineas, como = "lider", confirma = false, intentos = 1, nota = null }) {
  const items = JSON.stringify(
    lineas.map((l) => ({ prenda: l.prenda, cantidad: l.cantidad, costo: l.costo, confirma: l.confirma ?? confirma })),
  );
  const llamada = `select pg_temp.intento(format(
  'select retail.recibir_lote(p_ubicacion_id => %L, p_proveedor_id => %L, p_items => %L::jsonb, p_numero_guia => %L, p_nota => %L, p_token => %L)',
  :'tru', :'prov', current_setting('prueba.items'), 'GZ-CA-1', ${nota === null ? "null::text" : `'${nota}'`}, :'tok'))`;
  const salida = psql(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
${ESCENA}
-- Los items se arman con los ids de la escena: cada prenda 'M'/'S' es su variante.
select set_config('prueba.items', (
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'variante_id', case l ->> 'prenda' when 'M' then :'vm'::text else :'vs'::text end,
    'cantidad', (l ->> 'cantidad')::int,
    'costo_unitario', l -> 'costo',
    'confirma_costo', case when (l ->> 'confirma')::boolean then to_jsonb(true) end)))
  from jsonb_array_elements('${items}'::jsonb) l)::text, true) as _i \\gset
${sesion(como === "lider" ? FELIPE : MICAELA)}
${Array.from({ length: intentos }, (_, n) => `${llamada} as r${n} \\gset`).join("\n")}
reset role;
select jsonb_build_object(
  'r', :'r0'::jsonb,
  'r_ultimo', :'r${intentos - 1}'::jsonb,
  'lotes_nuevos', (select count(*) from retail.lotes) - :lotes0,
  'lotes_con_token', (select count(*) from retail.lotes where token_cliente = :'tok'),
  'nota', (select nota from retail.lotes where numero_guia = 'GZ-CA-1' order by fecha_recepcion desc limit 1),
  'movs', (select count(*) from retail.movimientos where lote_id in (select id from retail.lotes where numero_guia = 'GZ-CA-1')),
  'stock_m', (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'vm') - :stm,
  'stock_s', (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'vs') - :sts,
  'hist_m', (select count(*) from retail.costo_historial where variante_id = :'vm') - :hm0,
  'hist_s', (select count(*) from retail.costo_historial where variante_id = :'vs') - :hs0,
  'costo_m', (select costo from retail.variantes where id = :'vm'),
  'costo_s', (select costo from retail.variantes where id = :'vs'),
  'costo_previo', :cm,
  'esperado_m', round((:stm * :cm + 5 * 70) / (:stm + 5), 2),
  'esperado_s', round((:sts * :cm + 3 * 15) / (:sts + 3), 2)
);
rollback;`);
  return JSON.parse(salida.split("\n").filter(Boolean).at(-1));
}

/** Nada escrito: como si nunca se hubiera intentado recibir. */
const intacto = (s) =>
  s.lotes_nuevos === 0 && s.movs === 0 && s.stock_m === 0 && s.stock_s === 0 && s.hist_m === 0 && s.hist_s === 0 &&
  Number(s.costo_m) === Number(s.costo_previo) && Number(s.costo_s) === Number(s.costo_previo)
    ? null
    : `no quedó intacto: ${JSON.stringify({ lotes: s.lotes_nuevos, movs: s.movs, stock_m: s.stock_m, stock_s: s.stock_s, hist_m: s.hist_m, hist_s: s.hist_s, costo_m: s.costo_m, costo_s: s.costo_s })}`;

const M = (cantidad, costo, confirma) => ({ prenda: "M", cantidad, costo, confirma });
const S = (cantidad, costo, confirma) => ({ prenda: "S", cantidad, costo, confirma });

caso("un lote con costo normal (32) entra sin preguntar, con los seis parámetros de siempre", () => {
  const s = escena({ lineas: [M(5, 32)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.lotes_nuevos !== 1 || s.movs !== 1 || s.stock_m !== 5 || s.hist_m !== 1) return JSON.stringify(s);
  if (s.nota) return `no debía dejar constancia: ${s.nota}`;
});

caso("un lote SIN costo entra al stock sin tocar el costo (aunque el costo vigente exista)", () => {
  const s = escena({ lineas: [M(5, null), S(3, null)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.stock_m !== 5 || s.stock_s !== 3 || s.hist_m !== 0 || s.hist_s !== 0 || Number(s.costo_m) !== Number(s.costo_previo)) return JSON.stringify(s);
});

caso("líder, una línea atípica (70): costo_atipico con el dato en detail.items", () => {
  const s = escena({ lineas: [M(5, 70)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const d = JSON.parse(s.r.detail);
  if (d.items.length !== 1) return `items: ${s.r.detail}`;
  const [i] = d.items;
  if (i.motivo !== "sube" || Number(i.costo_unitario) !== 70 || Number(i.costo_vigente) !== 32 || Number(i.precio) !== 79.9 || i.sku !== "BLU-EMMA-NEG-M" || !i.variante_id) return s.r.detail;
});
caso("…y no quedó nada escrito (todo o nada)", () => intacto(escena({ lineas: [M(5, 70)] })));

caso("líder, dos líneas atípicas: las DOS vienen juntas, en el orden del lote, con su motivo", () => {
  const s = escena({ lineas: [M(5, 70), S(3, 15)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.map((i) => `${i.sku}:${i.motivo}`).join(",") !== "BLU-EMMA-NEG-M:sube,BLU-EMMA-NEG-S:baja") return s.r.detail;
});

caso("líder, una línea normal y una atípica: solo la atípica viene en detail, y NO se escribe ninguna (ni la normal)", () => {
  const s = escena({ lineas: [M(5, 32), S(3, 70)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1 || items[0].sku !== "BLU-EMMA-NEG-S") return s.r.detail;
  return intacto(s);
});

for (const [nombre, costo, motivo] of [["mayor que el precio (85)", 85, "mayor_que_precio"], ["baja (15)", 15, "baja"]]) {
  caso(`líder, línea con costo ${nombre}: motivo ${motivo}`, () => {
    const s = escena({ lineas: [M(5, costo)] });
    if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
    if (JSON.parse(s.r.detail).items[0].motivo !== motivo) return s.r.detail;
  });
}

caso("un costo de 0 es un OBSEQUIO (decisión explícita en Compras): entra sin preguntar, y el 0 entra al promedio", () => {
  const s = escena({ lineas: [M(5, 0)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.lotes_nuevos !== 1 || s.stock_m !== 5 || s.hist_m !== 1 || s.nota) return JSON.stringify(s);
  if (Number(s.costo_m) >= Number(s.costo_previo)) return `el 0 debía bajar el promedio: ${s.costo_m}`;
});

caso("el rechazo no consume el token: el reintento con el MISMO token y la confirmación es un solo lote", () => {
  const s = escena({ lineas: [M(5, 70)] });
  if (s.r.ok || s.lotes_con_token !== 0) return `tras el rechazo: ${JSON.stringify({ r: s.r, tok: s.lotes_con_token })}`;
});
caso("…con la marca entra UN lote con ese token; repetir el intento devuelve el mismo lote, no otro", () => {
  const s = escena({ lineas: [M(5, 70)], confirma: true, intentos: 2 });
  if (!s.r.ok || !s.r_ultimo.ok) return JSON.stringify([s.r, s.r_ultimo]);
  if (s.r.res !== s.r_ultimo.res) return `dos lotes distintos: ${s.r.res} y ${s.r_ultimo.res}`;
  if (s.lotes_nuevos !== 1 || s.lotes_con_token !== 1 || s.movs !== 1) return JSON.stringify(s);
});

caso("confirmación PARCIAL: marca solo una de dos atípicas → vuelve a preguntar solo por la otra, y no se escribe nada", () => {
  const s = escena({ lineas: [M(5, 70, true), S(3, 15)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1 || items[0].sku !== "BLU-EMMA-NEG-S" || items[0].linea !== 2) return s.r.detail;
  return intacto(s);
});

caso("una marca en una línea que NO es atípica no hace nada: sin constancia, entra como siempre", () => {
  const s = escena({ lineas: [M(5, 32, true)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.nota || s.hist_m !== 1 || s.stock_m !== 5) return JSON.stringify(s);
});

caso("el detalle numera las líneas (linea, desde 1, en el orden del lote)", () => {
  const s = escena({ lineas: [M(5, 32), S(3, 70)] });
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1 || items[0].linea !== 2) return s.r.detail;
});

caso("líder con la marca en cada línea: recibe y los costos entran al promedio ponderado exacto", () => {
  const s = escena({ lineas: [M(5, 70), S(3, 15)], confirma: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.lotes_nuevos !== 1 || s.movs !== 2 || s.hist_m !== 1 || s.hist_s !== 1) return JSON.stringify(s);
  if (Number(s.costo_m) !== Number(s.esperado_m)) return `costo M ${s.costo_m}, esperado ${s.esperado_m}`;
  if (Number(s.costo_s) !== Number(s.esperado_s)) return `costo S ${s.costo_s}, esperado ${s.esperado_s}`;
});

caso("…y el lote deja constancia en su nota, sin montos, conservando la nota que traía", () => {
  const s = escena({ lineas: [M(5, 70), S(3, 15)], confirma: true, nota: "llegó por Olva" });
  if (s.nota !== "llegó por Olva · Costo atípico confirmado por un líder (2 líneas)") return `nota: ${s.nota}`;
  const una = escena({ lineas: [M(5, 70)], confirma: true });
  if (una.nota !== "Costo atípico confirmado por un líder (1 línea)") return `nota: ${una.nota}`;
});

caso("un integrante con un costo atípico NO puede recibir: costo_atipico_sin_lider, sin cifras (sin detail)", () => {
  const s = escena({ lineas: [M(5, 70)], como: "integrante" });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  if (s.r.detail) return `no debía llevar cifras: ${s.r.detail}`;
});
caso("…y no quedó nada escrito", () => intacto(escena({ lineas: [M(5, 70)], como: "integrante" })));

caso("un integrante que manda las marcas por la API directa recibe lo mismo (lo exige el servidor, no la marca)", () => {
  const s = escena({ lineas: [M(5, 70)], como: "integrante", confirma: true });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  return intacto(s);
});

caso("un integrante sin costo, o con un costo normal, sí recibe (la regla no frena el trabajo de siempre)", () => {
  const a = escena({ lineas: [M(5, null)], como: "integrante" });
  const b = escena({ lineas: [M(5, 32)], como: "integrante" });
  if (!a.r.ok || !b.r.ok) return JSON.stringify([a.r, b.r]);
  if (a.stock_m !== 5 || b.stock_m !== 5 || b.hist_m !== 1) return JSON.stringify([a, b]);
});

caso("una sola función recibir_lote (sin sobrecargas que confundan a PostgREST)", () => {
  const salida = psql(`select count(*) from pg_proc where proname = 'recibir_lote' and pronamespace = 'retail'::regnamespace;`);
  if (salida !== "1") return `funciones: ${salida}`;
});

caso("la firma de seis parámetros no cambió (p_token al final) y authenticated la sigue ejecutando", () => {
  const f = "retail.recibir_lote(uuid, uuid, jsonb, text, text, uuid)";
  const salida = psql(`select has_function_privilege('authenticated', '${f}', 'execute')::text;
select (p.proargnames[array_upper(p.proargnames, 1)] = 'p_token')::text from pg_proc p where p.oid = '${f}'::regprocedure;`);
  if (salida !== "true\ntrue") return salida;
});

caso("la migración se puede pegar dos veces (una sola función, con la lógica nueva)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_proc where proname = 'recibir_lote' and pronamespace = 'retail'::regnamespace;
select (pg_get_functiondef('retail.recibir_lote(uuid, uuid, jsonb, text, text, uuid)'::regprocedure) like '%costo_atipico_sin_lider%')::text;
rollback;`);
  const [n, tiene] = salida.split("\n").filter(Boolean);
  if (n !== "1" || tiene !== "true") return `funciones ${n}, lógica nueva ${tiene}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
