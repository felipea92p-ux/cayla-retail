#!/usr/bin/env node
/**
 * Prueba de «registrar una factura pide confirmación si el costo de una línea es atípico» (Felipe, 2026-09-30) contra el
 * Postgres LOCAL: migración `20260930123000_registrar_compra_costo_atipico.sql` (usa la regla de `20260930120000`).
 *
 * La prenda de la prueba es la Blusa Emma de la semilla: dos variantes (M y S) con costo vigente 32.00 y precio 79.90, así que
 * 70 «sube», 15 «baja» y 85 es «mayor que el precio». Un producto propio sin ningún costo (variantes en 0) prueba la línea
 * SIN referencia: solo vale la banda absoluta (el precio, 100).
 *
 * QUÉ CUBRE (cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia)
 *   1. Una factura con costos normales se registra sin preguntar nada (la llamada de siempre, por nombre), sin constancia.
 *   2. Un costo atípico devuelve `costo_atipico` con las líneas raras en `detail.items`, numeradas (`linea`, desde 1), con la
 *      referencia que corresponde: la variante si la línea la nombra, y si solo nombra el producto la mediana de sus variantes.
 *   3. TODO O NADA: tras el rechazo no hay compra, ni líneas, ni token guardado.
 *   4. La confirmación viaja EN CADA LÍNEA (`"confirma_costo": true`): con la marca la factura se registra con los costos tal
 *      cual se tecleó y deja constancia en su nota SIN montos; si solo marca una de dos, vuelve a preguntar solo por la otra;
 *      marcar una línea que no es atípica no hace nada.
 *   5. Registrar NO mueve `variantes.costo` ni el historial (eso pasa al recibir): esta regla no cambia eso.
 *   6. Quien registra confirma: un rol CON el módulo Facturas de compra que no es líder ve el aviso y puede confirmar; sin el
 *      módulo sigue el permiso de siempre. No hay «sin_lider»: quien llega acá ya ve los montos.
 *   7. Sin referencia (producto sin costos) solo vale el precio; un costo de 0 es un obsequio y no se pregunta.
 *   8. El token (ADR-0190): el rechazo no lo consume; el reintento con las marcas es UNA factura, y repetirlo devuelve esa misma.
 *   9. La firma de 15 parámetros no cambió, sigue habiendo una sola función, y la migración se puede pegar dos veces.
 *
 * USO
 *   pnpm pruebas:factura-costo-atipico   → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930123000_registrar_compra_costo_atipico.sql"), "utf8");
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
declare v_msg text; v_det text; v_hint text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'msg', v_msg, 'detail', nullif(v_det, ''));
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select producto_id as prod, id as vm from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as vs from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select costo as cm from retail.variantes where id = :'vm' \\gset
-- Un producto SIN ningún costo (todas sus variantes en 0): no tiene referencia contra qué comparar.
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Factura sin costo', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as pnue \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'pnue', 'ZZ-FSC-1', 100, 0, true);
select count(*) as compras0 from retail.compras \\gset
select count(*) as items0 from retail.compra_items \\gset
select count(*) as hist0 from retail.costo_historial \\gset
select gen_random_uuid() as tok \\gset
`;

/**
 * Corre una escena y devuelve el estado final. `lineas`: [{ p: 'B' (Blusa Emma) | 'N' (producto sin costo), v?: 'M' | 'S', cantidad,
 * costo, confirma }]. `como`: 'lider' | 'integrante' | 'integrante_con_modulo' | 'integrante_sin_modulo'. `confirma: true` pone
 * la marca en TODAS las líneas (cada una puede traer la suya). `intentos`: cuántas veces se llama (mismo token).
 */
function escena({ lineas, como = "lider", confirma = false, intentos = 1, nota = null }) {
  const items = JSON.stringify(lineas.map((l) => ({ p: l.p ?? "B", v: l.v ?? null, cantidad: l.cantidad ?? 5, costo: l.costo, confirma: l.confirma ?? confirma })));
  const llamada = `select pg_temp.intento(format(
  'select retail.registrar_compra(p_proveedor_id => %L, p_serie => %L, p_numero => %L, p_condicion => %L, p_ubicacion_destino_id => %L, p_items => %L::jsonb, p_fecha_vencimiento => current_date + 30, p_nota => %L, p_token => %L)',
  :'prov', 'F001', 'CA-1', 'credito', :'tru', current_setting('prueba.items'), ${nota === null ? "null::text" : `'${nota}'`}, :'tok'))`;
  const conModulo = como === "integrante_con_modulo";
  const salida = psql(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
${ESCENA}
${conModulo ? `insert into retail.rol_modulos (rol_id, modulo)
  select c.rol_id, 'facturas_compra' from retail.colaboradores c join public.personas p on p.id = c.persona_id
  where p.auth_user_id = '${MICAELA}' on conflict do nothing;` : ""}
select set_config('prueba.items', (
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'producto_id', case l ->> 'p' when 'B' then :'prod'::text else :'pnue'::text end,
    'variante_id', case l ->> 'v' when 'M' then :'vm'::text when 'S' then :'vs'::text end,
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
  'compras_nuevas', (select count(*) from retail.compras) - :compras0,
  'items_nuevos', (select count(*) from retail.compra_items) - :items0,
  'compras_con_token', (select count(*) from retail.compras where token_cliente = :'tok'),
  'nota', (select nota from retail.compras where token_cliente = :'tok'),
  'costos_guardados', (select string_agg(ci.costo_unitario::text, ',' order by ci.costo_unitario) from retail.compra_items ci join retail.compras c on c.id = ci.compra_id where c.token_cliente = :'tok'),
  'hist_nuevo', (select count(*) from retail.costo_historial) - :hist0,
  'costo_m', (select costo from retail.variantes where id = :'vm'),
  'costo_previo', :cm
);
rollback;`);
  return JSON.parse(salida.split("\n").filter(Boolean).at(-1));
}

/** Nada escrito: como si nunca se hubiera intentado registrar. */
const intacta = (s) =>
  s.compras_nuevas === 0 && s.items_nuevos === 0 && s.compras_con_token === 0
    ? null
    : `no quedó intacta: ${JSON.stringify({ compras: s.compras_nuevas, items: s.items_nuevos, token: s.compras_con_token })}`;

const B = (costo, extra = {}) => ({ p: "B", costo, ...extra });

caso("una factura con costo normal (32) se registra sin preguntar, sin constancia", () => {
  const s = escena({ lineas: [B(32)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.compras_nuevas !== 1 || s.items_nuevos !== 1 || s.nota) return JSON.stringify(s);
});

caso("costo atípico solo con el producto (70): costo_atipico, con la MEDIANA de sus variantes como referencia", () => {
  const s = escena({ lineas: [B(70)] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const [i, ...resto] = JSON.parse(s.r.detail).items;
  if (resto.length || i.linea !== 1 || i.motivo !== "sube" || Number(i.costo_unitario) !== 70 || Number(i.costo_vigente) !== 32 || Number(i.precio) !== 79.9) return s.r.detail;
  if (i.variante_id !== null || i.sku !== "Blusa Emma" || !i.producto_id) return s.r.detail;
});
caso("…y no quedó nada escrito (todo o nada)", () => intacta(escena({ lineas: [B(70)] })));

caso("costo atípico con la variante nombrada (M): la referencia es esa variante, y la línea trae su código", () => {
  const s = escena({ lineas: [B(70, { v: "M" })] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const i = JSON.parse(s.r.detail).items[0];
  if (i.sku !== "BLU-EMMA-NEG-M" || !i.variante_id || Number(i.costo_vigente) !== 32) return s.r.detail;
});

for (const [nombre, costo, motivo] of [["baja (15)", 15, "baja"], ["mayor que el precio (85)", 85, "mayor_que_precio"]]) {
  caso(`costo que ${nombre}: motivo ${motivo}`, () => {
    const s = escena({ lineas: [B(costo)] });
    if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
    if (JSON.parse(s.r.detail).items[0].motivo !== motivo) return s.r.detail;
  });
}

caso("tres líneas, dos atípicas: vuelven las DOS, numeradas 1 y 3, sin la normal (la 2)", () => {
  const s = escena({ lineas: [B(70), B(32, { v: "S" }), B(15, { v: "M" })] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.map((i) => `${i.linea}:${i.motivo}`).join(",") !== "1:sube,3:baja") return s.r.detail;
  return intacta(s);
});

caso("confirmación PARCIAL: marca solo la línea 1 de dos atípicas → vuelve a preguntar solo por la 2, y no se escribe nada", () => {
  const s = escena({ lineas: [B(70, { confirma: true }), B(15, { v: "M" })] });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  const items = JSON.parse(s.r.detail).items;
  if (items.length !== 1 || items[0].linea !== 2) return s.r.detail;
  return intacta(s);
});

caso("con la marca en cada línea se registra, con los costos tal cual se tecleó, y deja constancia SIN montos", () => {
  const s = escena({ lineas: [B(70), B(15, { v: "M" })], confirma: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.compras_nuevas !== 1 || s.items_nuevos !== 2 || s.costos_guardados !== "15.00,70.00") return JSON.stringify(s);
  if (s.nota !== "Costo atípico confirmado al registrar (2 líneas)") return `nota: ${s.nota}`;
});

caso("…conservando la nota que traía la factura", () => {
  const s = escena({ lineas: [B(70)], confirma: true, nota: "pedido de temporada" });
  if (s.nota !== "pedido de temporada · Costo atípico confirmado al registrar (1 línea)") return `nota: ${s.nota}`;
});

caso("registrar NO mueve variantes.costo ni el historial: eso pasa al recibir la mercadería", () => {
  const s = escena({ lineas: [B(70)], confirma: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.hist_nuevo !== 0 || Number(s.costo_m) !== Number(s.costo_previo)) return JSON.stringify(s);
});

caso("una marca en una línea que NO es atípica no hace nada: sin constancia, se registra como siempre", () => {
  const s = escena({ lineas: [B(32, { confirma: true })] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.nota || s.compras_nuevas !== 1) return JSON.stringify(s);
});

caso("quien registra confirma: un rol CON el módulo Facturas de compra que NO es líder ve el aviso (con las cifras)", () => {
  const s = escena({ lineas: [B(70)], como: "integrante_con_modulo" });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  if (Number(JSON.parse(s.r.detail).items[0].costo_vigente) !== 32) return s.r.detail;
  return intacta(s);
});
caso("…y puede confirmar: la factura se registra con su constancia", () => {
  const s = escena({ lineas: [B(70)], como: "integrante_con_modulo", confirma: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.compras_nuevas !== 1 || s.nota !== "Costo atípico confirmado al registrar (1 línea)") return JSON.stringify(s);
});
caso("sin el módulo sigue el permiso de siempre (ni llega a la regla del costo)", () => {
  const s = escena({ lineas: [B(70)], como: "integrante_sin_modulo" });
  if (s.r.ok || !/módulo Facturas de compra/.test(s.r.msg)) return JSON.stringify(s.r);
  return intacta(s);
});

caso("producto SIN referencia (variantes en 0): solo vale el precio — 120 contra un precio de 100 pregunta, 50 pasa", () => {
  const caro = escena({ lineas: [{ p: "N", costo: 120 }] });
  if (caro.r.ok || caro.r.msg !== "costo_atipico") return JSON.stringify(caro.r);
  const i = JSON.parse(caro.r.detail).items[0];
  if (i.motivo !== "mayor_que_precio" || i.costo_vigente !== null) return caro.r.detail;
  const normal = escena({ lineas: [{ p: "N", costo: 50 }] });
  if (!normal.r.ok) return JSON.stringify(normal.r);
});

caso("un costo de 0 es un obsequio (decisión explícita): se registra sin preguntar", () => {
  const s = escena({ lineas: [B(0)] });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.compras_nuevas !== 1 || s.nota) return JSON.stringify(s);
});

caso("el rechazo no consume el token: nada queda guardado con él", () => {
  const s = escena({ lineas: [B(70)] });
  if (s.r.ok || s.compras_con_token !== 0) return JSON.stringify(s);
});
caso("…con las marcas entra UNA factura con ese token; repetir el intento devuelve la misma, no otra", () => {
  const s = escena({ lineas: [B(70)], confirma: true, intentos: 2 });
  if (!s.r.ok || !s.r_ultimo.ok) return JSON.stringify([s.r, s.r_ultimo]);
  if (s.r.res !== s.r_ultimo.res) return `dos facturas distintas: ${s.r.res} y ${s.r_ultimo.res}`;
  if (s.compras_nuevas !== 1 || s.compras_con_token !== 1 || s.items_nuevos !== 1) return JSON.stringify(s);
});

caso("la firma de 15 parámetros no cambió y sigue habiendo una sola función; authenticated la ejecuta", () => {
  const salida = psql(`select count(*)::text || ',' || bool_and(pg_get_function_identity_arguments(p.oid) like '%p_token uuid, p_fecha_estimada_llegada date')::text
    || ',' || bool_and(has_function_privilege('authenticated', p.oid, 'execute'))::text
  from pg_proc p where p.proname = 'registrar_compra' and p.pronamespace = 'retail'::regnamespace;`);
  if (salida !== "1,true,true") return salida;
});

caso("la migración se puede pegar dos veces (una sola función, con la lógica nueva)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_proc where proname = 'registrar_compra' and pronamespace = 'retail'::regnamespace;
select (prosrc like '%costo_atipico%' and prosrc like '%confirma_costo%')::text from pg_proc where proname = 'registrar_compra' and pronamespace = 'retail'::regnamespace;
rollback;`);
  const [n, tiene] = salida.split("\n").filter(Boolean);
  if (n !== "1" || tiene !== "true") return `funciones ${n}, lógica nueva ${tiene}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
