#!/usr/bin/env node
/**
 * Prueba de «recibir lo fuera de comprobante de un envío pide confirmación si su costo es atípico» (Felipe, 2026-09-30) contra el
 * Postgres LOCAL: migración `20260930124000_recibir_envio_costo_atipico.sql` (usa la regla de `20260930120000`).
 *
 * La prenda de la prueba es BLU-EMMA-NEG-M de la semilla (costo vigente 32.00, precio 79.90): 70 «sube», 15 «baja», 85 es «mayor
 * que el precio». Cada escenario crea un comprobante con la RPC real `registrar_compra` (un envío necesita al menos una línea de
 * comprobante) y recibe 5 unidades de él, más los extras que cada caso indique.
 *
 * QUÉ CUBRE (cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia)
 *   1. Extras con costo normal, sin costo, regalo o con un costo de 0 (obsequio) entran sin preguntar nada.
 *   2. Un extra atípico devuelve `costo_atipico` con los extras raros que faltan por confirmar en `detail.items`, numerados por su
 *      posición en `p_extras` (`linea`, desde 1); los normales no vienen.
 *   3. TODO O NADA: tras el rechazo no hay envío, ni movimientos (tampoco de la línea de comprobante), ni historial de costo, ni
 *      stock nuevo, ni token guardado, y el costo de la prenda queda intacto.
 *   4. La confirmación viaja EN CADA EXTRA (`"confirma_costo": true`): con la marca se recibe todo, el costo entra al promedio y la
 *      nota del envío deja constancia SIN montos; si solo marca uno de dos, vuelve a preguntar solo por el otro; marcar un extra
 *      normal no hace nada.
 *   5. Quien NO es líder no puede recibir un extra atípico: `costo_atipico_sin_lider`, sin cifras, y mandar la marca por la API
 *      directa no cambia nada; sin costo, o con uno normal, sí recibe.
 *   6. El token (ADR-0190): el rechazo no lo consume; el reintento con la marca es UN envío, y repetirlo devuelve ese (`ya_registrado`).
 *   7. Las líneas DE comprobante no se vuelven a preguntar: su costo ya se miró al registrar la factura.
 *   8. La firma de 9 parámetros no cambió, sigue habiendo una sola función, y la migración se puede pegar dos veces.
 *
 * USO
 *   pnpm pruebas:envio-costo-atipico   → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930124000_recibir_envio_costo_atipico.sql"), "utf8");
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
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as var, v.producto_id as prod, v.costo as cm from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
-- El comprobante de la escena, con la RPC real (costo 32: dentro de la banda, sin confirmar nada).
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'trujillo',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', \${COSTO_DE_LA_FACTURA}\${MARCA_DE_LA_FACTURA})),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as compra \\gset
select id as linea from retail.compra_items where compra_id = :'compra' \\gset
select coalesce(sum(cantidad), 0) as stm from retail.stock where variante_id = :'var' \\gset
select count(*) as hm0 from retail.costo_historial where variante_id = :'var' \\gset
select count(*) as env0 from retail.envios \\gset
select count(*) as ext0 from retail.envio_extras \\gset
select gen_random_uuid() as tok \\gset
`;

/**
 * Corre una escena y devuelve el estado final. `extras`: [{ costo, regalo, confirma }] de la prenda M (costo undefined = sin costo).
 * `como`: 'lider' | 'integrante'. `confirma: true` pone la marca en TODOS los extras (cada uno puede traer la suya). `intentos`: cuántas
 * veces se llama (mismo token). `facturaA`: el costo con que se registra el comprobante (`facturaConfirmada` para uno atípico).
 */
function escena({ extras, como = "lider", confirma = false, intentos = 1, facturaA = 32, facturaConfirmada = false }) {
  const lista = JSON.stringify(extras.map((x) => ({ costo: x.costo ?? null, regalo: x.regalo ?? false, confirma: x.confirma ?? confirma })));
  const llamada = `select pg_temp.intento(format(
  'select (retail.recibir_envio(p_ubicacion_id => %L, p_items => %L::jsonb, p_extras => %L::jsonb, p_token => %L)) ->> ''envio_id''',
  :'trujillo', current_setting('prueba.items'), current_setting('prueba.extras'), :'tok'))`;
  const esc = ESCENA.replace("${COSTO_DE_LA_FACTURA}", String(facturaA)).replace("${MARCA_DE_LA_FACTURA}", facturaConfirmada ? ", 'confirma_costo', true" : "");
  const salida = psql(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
${esc}
select set_config('prueba.items', jsonb_build_array(jsonb_build_object('compra_item_id', :'linea', 'variante_id', :'var', 'cantidad', 5))::text, true) as _i \\gset
select set_config('prueba.extras', coalesce((
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'proveedor_id', :'prov1'::text, 'variante_id', :'var'::text, 'cantidad', 2,
    'es_regalo', (x ->> 'regalo')::boolean,
    'costo_unitario', x -> 'costo',
    'confirma_costo', case when (x ->> 'confirma')::boolean then to_jsonb(true) end)))
  from jsonb_array_elements('${lista}'::jsonb) x), '[]'::jsonb)::text, true) as _e \\gset
${sesion(como === "lider" ? FELIPE : MICAELA)}
${Array.from({ length: intentos }, (_, n) => `${llamada} as r${n} \\gset`).join("\n")}
reset role;
select jsonb_build_object(
  'r', :'r0'::jsonb,
  'r_ultimo', :'r${intentos - 1}'::jsonb,
  'envios_nuevos', (select count(*) from retail.envios) - :env0,
  'extras_nuevos', (select count(*) from retail.envio_extras) - :ext0,
  'con_token', (select count(*) from retail.envios where token_cliente = :'tok'),
  'nota', (select nota from retail.envios where token_cliente = :'tok'),
  'movs', (select count(*) from retail.movimientos m join retail.lotes l on l.id = m.lote_id join retail.envios e on e.id = l.envio_id where e.token_cliente = :'tok'),
  'stock', (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'var') - :stm,
  'hist', (select count(*) from retail.costo_historial where variante_id = :'var') - :hm0,
  'hist_70', (select count(*) from retail.costo_historial where variante_id = :'var' and costo_unitario_nuevo = 70),
  'costo', (select costo from retail.variantes where id = :'var'),
  'costo_previo', :cm
);
rollback;`);
  return JSON.parse(salida.split("\n").filter(Boolean).at(-1));
}

/** Nada escrito: como si nunca se hubiera intentado recibir el envío. */
const intacto = (s) =>
  s.envios_nuevos === 0 && s.extras_nuevos === 0 && s.con_token === 0 && s.movs === 0 && s.stock === 0 && s.hist === 0 && Number(s.costo) === Number(s.costo_previo)
    ? null
    : `no quedó intacto: ${JSON.stringify({ envios: s.envios_nuevos, extras: s.extras_nuevos, token: s.con_token, movs: s.movs, stock: s.stock, hist: s.hist, costo: s.costo })}`;

const X = (costo, extra = {}) => ({ costo, ...extra });

caso("extras con costo normal (32) entran sin preguntar, junto con la línea de comprobante, sin constancia", () => {
  const s = escena({ extras: [X(32)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.envios_nuevos !== 1 || s.extras_nuevos !== 1 || s.stock !== 7 || s.nota) return JSON.stringify(s);
});

caso("sin costo, regalo y costo 0 (obsequio) no se juzgan", () => {
  const s = escena({ extras: [X(undefined), X(undefined, { regalo: true }), X(0)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.extras_nuevos !== 3 || s.nota) return JSON.stringify(s);
});

caso("un regalo con costo sigue recibiendo el mensaje de siempre (no se le pregunta por el costo: primero se corrige el regalo)", () => {
  const s = escena({ extras: [X(70, { regalo: true })] });
  if (s.r.ok || !/Un regalo no lleva costo/.test(s.r.msg)) return JSON.stringify(s.r);
});

caso("líder, un extra atípico (70): costo_atipico con el dato en detail.items, numerado", () => {
  const s = escena({ extras: [X(70)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1) return s.r.detail;
  const [i] = items;
  if (i.linea !== 1 || i.motivo !== "sube" || Number(i.costo_unitario) !== 70 || Number(i.costo_vigente) !== 32 || Number(i.precio) !== 79.9 || i.sku !== "BLU-EMMA-NEG-M" || !i.variante_id) return s.r.detail;
});
caso("…y no quedó nada escrito (todo o nada: ni el envío, ni la línea de comprobante, ni el token)", () => intacto(escena({ extras: [X(70)] })));

for (const [nombre, costo, motivo] of [["baja (15)", 15, "baja"], ["mayor que el precio (85)", 85, "mayor_que_precio"]]) {
  caso(`extra con costo que ${nombre}: motivo ${motivo}`, () => {
    const s = escena({ extras: [X(costo)] });
    if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
    if (JSON.parse(s.r.detail).items[0].motivo !== motivo) return s.r.detail;
  });
}

caso("dos extras, uno normal y uno atípico: solo el atípico viene, numerado 2, y no se escribe ninguno", () => {
  const s = escena({ extras: [X(32), X(70)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1 || items[0].linea !== 2) return s.r.detail;
  return intacto(s);
});

caso("confirmación PARCIAL: marca solo el extra 1 de dos atípicos → vuelve a preguntar solo por el 2, y no se escribe nada", () => {
  const s = escena({ extras: [X(70, { confirma: true }), X(15)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1 || items[0].linea !== 2) return s.r.detail;
  return intacto(s);
});

caso("líder con la marca en cada extra: recibe todo, el costo entra al promedio, y la nota del envío deja constancia SIN montos", () => {
  const s = escena({ extras: [X(70), X(15)], confirma: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.envios_nuevos !== 1 || s.extras_nuevos !== 2 || s.stock !== 9 || s.hist_70 !== 1) return JSON.stringify(s);
  if (s.nota !== "Costo atípico confirmado por un líder (2 ítems fuera de comprobante)") return `nota: ${s.nota}`;
});

caso("una marca en un extra que NO es atípico no hace nada: sin constancia, entra como siempre", () => {
  const s = escena({ extras: [X(32, { confirma: true })] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.nota || s.extras_nuevos !== 1) return JSON.stringify(s);
});

caso("un integrante con un extra atípico NO puede recibir: costo_atipico_sin_lider, sin cifras (sin detail)", () => {
  const s = escena({ extras: [X(70)], como: "integrante" });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  if (s.r.detail) return `no debía llevar cifras: ${s.r.detail}`;
});
caso("…y no quedó nada escrito", () => intacto(escena({ extras: [X(70)], como: "integrante" })));

caso("un integrante que manda la marca por la API directa recibe lo mismo (lo exige el servidor, no la marca)", () => {
  const s = escena({ extras: [X(70)], como: "integrante", confirma: true });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  return intacto(s);
});

caso("un integrante sin costo, o con un costo normal, sí recibe (la regla no frena el trabajo de siempre)", () => {
  const a = escena({ extras: [X(undefined)], como: "integrante" });
  const b = escena({ extras: [X(32)], como: "integrante" });
  if (!a.r.ok || !b.r.ok) return JSON.stringify([a.r, b.r]);
  if (a.extras_nuevos !== 1 || b.extras_nuevos !== 1) return JSON.stringify([a, b]);
});

caso("el rechazo no consume el token: nada queda guardado con él", () => {
  const s = escena({ extras: [X(70)] });
  if (s.r.ok || s.con_token !== 0) return JSON.stringify(s);
});
caso("…con la marca entra UN envío con ese token; repetir el intento devuelve el mismo, no otro", () => {
  const s = escena({ extras: [X(70)], confirma: true, intentos: 2 });
  if (!s.r.ok || !s.r_ultimo.ok) return JSON.stringify([s.r, s.r_ultimo]);
  if (s.r.res !== s.r_ultimo.res) return `dos envíos distintos: ${s.r.res} y ${s.r_ultimo.res}`;
  if (s.envios_nuevos !== 1 || s.con_token !== 1 || s.extras_nuevos !== 1) return JSON.stringify(s);
});

caso("las líneas DE comprobante no se vuelven a preguntar: un comprobante registrado con un costo atípico confirmado se recibe sin pregunta", () => {
  const s = escena({ extras: [], facturaA: 70, facturaConfirmada: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.envios_nuevos !== 1 || s.nota || s.hist_70 !== 1) return JSON.stringify(s);
});

caso("la firma de 9 parámetros no cambió (p_token al final), una sola función, y authenticated la ejecuta", () => {
  const salida = psql(`select count(*)::text || ',' || bool_and(p.proargnames[array_upper(p.proargnames, 1)] = 'p_token')::text
    || ',' || bool_and(array_length(p.proargnames, 1) = 9)::text || ',' || bool_and(has_function_privilege('authenticated', p.oid, 'execute'))::text
  from pg_proc p where p.proname = 'recibir_envio' and p.pronamespace = 'retail'::regnamespace;`);
  if (salida !== "1,true,true,true") return salida;
});

caso("la migración se puede pegar dos veces (una sola función, con la lógica nueva)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_proc where proname = 'recibir_envio' and pronamespace = 'retail'::regnamespace;
select (prosrc like '%costo_atipico_sin_lider%' and prosrc like '%confirma_costo%')::text from pg_proc where proname = 'recibir_envio' and pronamespace = 'retail'::regnamespace;
rollback;`);
  const [n, tiene] = salida.split("\n").filter(Boolean);
  if (n !== "1" || tiene !== "true") return `funciones ${n}, lógica nueva ${tiene}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
