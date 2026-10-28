#!/usr/bin/env node
/**
 * Prueba de «cerrar una orden pide confirmación si el costo por prenda es atípico» (Felipe, 2026-09-30) contra el
 * Postgres LOCAL: migración `20260930121000_cerrar_produccion_costo_atipico.sql` (usa la regla de `20260930120000`).
 *
 * La prenda de la prueba es BLU-EMMA-NEG-M de la semilla: costo vigente 32.00 y precio 79.90. Por eso: 70 por prenda
 * «sube» (más del doble de 32 y todavía bajo el precio), 15 «baja» (menos de 2/3 de 32) y 85 es «mayor que el precio».
 *
 * QUÉ CUBRE (cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia)
 *   1. Un costo normal cierra sin preguntar nada, con los CINCO parámetros de siempre (el sexto tiene valor por defecto).
 *   2. Un líder que cierra con un costo atípico recibe `costo_atipico` con el dato en `detail` (motivo, costo por prenda,
 *      costo vigente, precio, sku), para cada motivo: sube, baja, sin costo, mayor que el precio.
 *   3. TODO O NADA: tras ese rechazo la orden sigue abierta, sin buenas, sin movimientos, sin fila nueva en el historial
 *      de costos y con el costo de la prenda intacto.
 *   4. Con `p_confirma_costo_atipico` el líder cierra: entra el costo confirmado al promedio ponderado (exacto), y la
 *      orden deja constancia SIN montos.
 *   5. Un integrante (no ve montos) con costo atípico NO puede cerrar: `costo_atipico_sin_lider`, sin `detail` (sin cifras),
 *      y mandar `true` por la API directa no cambia nada (lo exige el servidor, no la pantalla). Con costo normal, sí cierra.
 *   6. Una talla con cero buenas no cuenta para la regla; una muestra no toca costos y no pregunta nada.
 *   7. Una sola función `cerrar_produccion` (sin sobrecargas que confundan a PostgREST), sin `execute` para `anon`, y la
 *      migración se puede pegar dos veces.
 *
 * USO
 *   pnpm pruebas:produccion-costo-atipico   → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930121000_cerrar_produccion_costo_atipico.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (semilla)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora (semilla), fija a Tienda Trujillo

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

/**
 * Corre una escena entera y devuelve el estado final como objeto.
 *  - `unitario`: costo por prenda al que queda la orden (10 buenas; se pone como costo de tela, como postgres).
 *  - `como`: 'lider' | 'integrante'.  `confirma`: lo que manda como sexto parámetro (null = no lo manda: llamada de cinco).
 *  - `muestra`: la orden es una muestra.  `lineas`: si es 'dos_tallas', una talla con cero buenas cuyo costo vigente es
 *    muy distinto (no debe contar).
 */
function escena({ unitario, como = "lider", confirma = null, muestra = false, lineas = "una" }) {
  const salida = psql(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_msg text; v_det text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
  return jsonb_build_object('ok', false, 'msg', v_msg, 'detail', nullif(v_det, ''));
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;

select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select id as v1, producto_id as prod, costo as c0 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2 from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select coalesce(sum(cantidad), 0) as st0 from retail.stock where variante_id = :'v1' \\gset
select count(*) as h0 from retail.costo_historial where variante_id = :'v1' \\gset
select retail.abrir_produccion(:'taller', :'prod',
  ${lineas === "dos_tallas"
    ? `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10), jsonb_build_object('variante_id', :'v2', 'cantidad', 5))`
    : `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10))`},
  0, 0, 0, ${muestra}) as ord \\gset
${lineas === "dos_tallas" ? `update retail.variantes set costo = 400 where id = :'v2';` : ""}
update retail.producciones set costo_tela = ${unitario} * 10 where id = :'ord';
update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
select set_config('prueba.ord', :'ord', true) as _o \\gset
select set_config('prueba.buenas', jsonb_build_array(${lineas === "dos_tallas"
    ? `jsonb_build_object('variante_id', :'v1', 'cantidad', 10), jsonb_build_object('variante_id', :'v2', 'cantidad', 0)`
    : `jsonb_build_object('variante_id', :'v1', 'cantidad', 10)`})::text, true) as _b \\gset
${sesion(como === "lider" ? FELIPE : MICAELA)}
${confirma === null
    ? `select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, null, null, null)', current_setting('prueba.ord'), current_setting('prueba.buenas'))) as r \\gset`
    : `select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, null, null, null, ${confirma})', current_setting('prueba.ord'), current_setting('prueba.buenas'))) as r \\gset`}
reset role;
select jsonb_build_object(
  'r', :'r'::jsonb,
  'estado', (select estado from retail.producciones where id = :'ord'),
  'buenas', (select cantidad_buenas from retail.producciones where id = :'ord'),
  'nota', (select nota from retail.producciones where id = :'ord'),
  'movs', (select count(*) from retail.movimientos where produccion_id = :'ord'),
  'historial_nuevo', (select count(*) from retail.costo_historial where variante_id = :'v1') - :h0,
  'historial_costo', (select costo_unitario_nuevo from retail.costo_historial where variante_id = :'v1' order by created_at desc, id limit 1),
  'costo', (select costo from retail.variantes where id = :'v1'),
  'costo_previo', :c0,
  'costo_esperado', round((:st0 * :c0 + 10 * ${unitario}) / (:st0 + 10), 2)
);
rollback;`);
  return JSON.parse(salida.split("\n").filter(Boolean).at(-1));
}

/** Comprueba que la orden quedó como si nunca se hubiera intentado cerrar. */
const intacta = (s) =>
  s.estado === "en_proceso" && s.buenas === null && s.movs === 0 && s.historial_nuevo === 0 && Number(s.costo) === Number(s.costo_previo)
    ? null
    : `no quedó intacta: ${JSON.stringify({ estado: s.estado, buenas: s.buenas, movs: s.movs, historial_nuevo: s.historial_nuevo, costo: s.costo, costo_previo: s.costo_previo })}`;

caso("un costo normal (igual al vigente) cierra sin preguntar, con los cinco parámetros de siempre", () => {
  const s = escena({ unitario: 32 });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.estado !== "terminada" || s.buenas !== 10) return `estado ${s.estado}, buenas ${s.buenas}`;
  if (s.nota) return `no debía dejar constancia: ${s.nota}`;
  if (s.historial_nuevo !== 1 || Number(s.historial_costo) !== 32) return `historial: ${JSON.stringify(s)}`;
});

const MOTIVOS = [
  ["sube", 70, "sube"],
  ["baja", 15, "baja"],
  ["sin costo", 0, "sin_costo"],
  ["mayor que el precio (gana sobre «sube»)", 85, "mayor_que_precio"],
];
for (const [nombre, unitario, motivo] of MOTIVOS) {
  caso(`líder sin confirmar, costo que ${nombre}: costo_atipico con el dato en detail`, () => {
    const s = escena({ unitario });
    if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
    const d = JSON.parse(s.r.detail);
    if (d.motivo !== motivo || Number(d.costo_unitario) !== unitario || Number(d.costo_vigente) !== 32 || Number(d.precio) !== 79.9 || d.sku !== "BLU-EMMA-NEG-M")
      return `detail: ${s.r.detail}`;
  });
  caso(`…y la orden queda intacta (todo o nada) — ${nombre}`, () => intacta(escena({ unitario })));
}

caso("líder con confirmación: cierra, y el costo confirmado entra al promedio ponderado exacto", () => {
  const s = escena({ unitario: 70, confirma: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.estado !== "terminada" || s.buenas !== 10) return `estado ${s.estado}, buenas ${s.buenas}`;
  if (Number(s.historial_costo) !== 70 || s.historial_nuevo !== 1) return `historial: ${JSON.stringify(s)}`;
  if (Number(s.costo) !== Number(s.costo_esperado)) return `costo ${s.costo}, esperado ${s.costo_esperado}`;
});

caso("…y deja constancia en la nota de la orden, sin montos", () => {
  const s = escena({ unitario: 70, confirma: true });
  if (s.nota !== "Costo atípico confirmado por un líder (más del doble del costo vigente)") return `nota: ${s.nota}`;
  if (/[0-9]/.test(s.nota)) return `la nota trae cifras: ${s.nota}`;
});

caso("un integrante con costo atípico NO puede cerrar: costo_atipico_sin_lider, sin cifras (sin detail)", () => {
  const s = escena({ unitario: 70, como: "integrante" });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  if (s.r.detail) return `no debía llevar cifras: ${s.r.detail}`;
});
caso("…y la orden queda intacta", () => intacta(escena({ unitario: 70, como: "integrante" })));

caso("un integrante que manda la confirmación por la API directa recibe lo mismo (lo exige el servidor)", () => {
  const s = escena({ unitario: 70, como: "integrante", confirma: true });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  return intacta(s);
});

caso("un integrante con costo normal sí cierra (la regla no frena el trabajo de siempre)", () => {
  const s = escena({ unitario: 32, como: "integrante" });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.estado !== "terminada") return `estado ${s.estado}`;
});

caso("una talla con cero buenas no cuenta: su costo vigente distinto (400) no dispara la regla", () => {
  const s = escena({ unitario: 32, lineas: "dos_tallas" });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.estado !== "terminada") return `estado ${s.estado}`;
});

caso("una muestra con un costo absurdo cierra sin preguntar y no toca el costo de la prenda", () => {
  const s = escena({ unitario: 5000, muestra: true });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.estado !== "terminada" || s.historial_nuevo !== 0 || Number(s.costo) !== Number(s.costo_previo)) return JSON.stringify(s);
});

caso("una sola función cerrar_produccion (sin sobrecargas que confundan a PostgREST)", () => {
  const salida = psql(`select count(*) from pg_proc where proname = 'cerrar_produccion' and pronamespace = 'retail'::regnamespace;`);
  if (salida !== "1") return `funciones: ${salida}`;
});

caso("anon no la ejecuta; authenticated sí", () => {
  const f = "retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)";
  const salida = psql(`select has_function_privilege('anon', '${f}', 'execute')::text || ',' || has_function_privilege('authenticated', '${f}', 'execute')::text;`);
  if (salida !== "false,true") return salida;
});

caso("la migración se puede pegar dos veces (una sola función, con la lógica nueva)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_proc where proname = 'cerrar_produccion' and pronamespace = 'retail'::regnamespace;
select (pg_get_functiondef('retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)'::regprocedure) like '%costo_atipico_sin_lider%')::text;
rollback;`);
  const [n, tiene] = salida.split("\n").filter(Boolean);
  if (n !== "1" || tiene !== "true") return `funciones ${n}, lógica nueva ${tiene}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
