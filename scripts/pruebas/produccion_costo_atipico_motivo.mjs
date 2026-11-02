#!/usr/bin/env node
/**
 * Prueba de «confirmar un costo atípico pide un MOTIVO, y la orden guarda quién lo confirmó y cuándo» (P19 del «Análisis del Taller», Felipe
 * 2026-11-02) contra el Postgres LOCAL: migración `20261102211000_costo_atipico_con_motivo.sql`.
 *
 * LA PRENDA. BLU-EMMA-NEG-M de la semilla: costo vigente 32.00 y precio 79.90. 70 por prenda «sube» (más del doble), 32 es normal.
 *
 * QUÉ CUBRE (cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia; la migración se carga DENTRO de cada caso)
 *   A  CON MOTIVO: el líder confirma con `cerrar_produccion_con_motivo`: cierra, y la nota dice quién (su nombre), cuándo (día y hora de Lima),
 *      qué clase de costo atípico y el motivo; y queda una fila en Actividad con el motivo.
 *   B  SIN MOTIVO NO HAY CONFIRMACIÓN: sin motivo, con menos de 5 letras, con más de 300, o llamando directo a `cerrar_produccion(…, true)`
 *      (la API directa no se salta la regla): rechazo con la pista `costo_atipico_sin_motivo` y la orden queda intacta (todo o nada).
 *   C  LO QUE NO CAMBIA: sin confirmar, el líder recibe `costo_atipico` con su dato; un costo normal cierra sin constancia ni Actividad aunque
 *      se mande un motivo; el integrante sigue sin poder (`costo_atipico_sin_lider`); una muestra no pregunta nada.
 *   D  LA FORMA: una sola `cerrar_produccion` (sin sobrecargas), una sola `cerrar_produccion_con_motivo`, `anon` no ejecuta, `authenticated` sí,
 *      las piezas internas cerradas, el motivo no se queda en la sesión, y la migración se puede pegar dos veces.
 *
 * USO
 *   pnpm pruebas:produccion-costo-atipico-motivo   → contra el stack local (carga la migración dentro de cada caso)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261102211000_costo_atipico_con_motivo.sql"), "utf8")
  .replace(/^set lock_timeout.*$/m, "")
  .replace(/^reset lock_timeout;$/m, "");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (semilla)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora (semilla)
const MOTIVO = "Es una muestra pagada: la tela la puso la clienta";

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
 * Una escena entera; devuelve el estado final.
 *  - `llamada`: 'con_motivo' (la función nueva) | 'directa' (`cerrar_produccion` a pelo, con `confirma`).
 *  - `motivo`: texto del motivo (null = no se manda).  `confirma`: el booleano.  `unitario`: costo por prenda (10 buenas).
 *  - `como`: 'lider' | 'integrante'.  `muestra`: la orden es una muestra.
 */
function escena({ unitario, llamada = "con_motivo", confirma = true, motivo = MOTIVO, como = "lider", muestra = false }) {
  const motivoSql = motivo === null ? "null" : `'${motivo.replace(/'/g, "''")}'`;
  const llamar =
    llamada === "con_motivo"
      ? `select retail.cerrar_produccion_con_motivo(%L, %L::jsonb, null, null, null, ${confirma}, ${motivoSql})`
      : `select retail.cerrar_produccion(%L, %L::jsonb, null, null, null, ${confirma})`;
  const salida = psql(`begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_msg text; v_det text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'msg', v_msg, 'detail', nullif(v_det, ''), 'hint', nullif(v_hint, ''));
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;

select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select id as v1, producto_id as prod, costo as c0 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select count(*) as h0 from retail.costo_historial where variante_id = :'v1' \\gset
select retail.abrir_produccion(:'taller', :'prod', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10)), 0, 0, 0, ${muestra}) as ord \\gset
update retail.producciones set costo_tela = ${unitario} * 10 where id = :'ord';
update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
select set_config('prueba.ord', :'ord', true) as _o \\gset
select set_config('prueba.buenas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10))::text, true) as _b \\gset
${sesion(como === "lider" ? FELIPE : MICAELA)}
select pg_temp.intento(format('${llamar.replace(/'/g, "''")}', current_setting('prueba.ord'), current_setting('prueba.buenas'))) as r \\gset
reset role;
select jsonb_build_object(
  'r', :'r'::jsonb,
  'estado', (select estado from retail.producciones where id = :'ord'),
  'buenas', (select cantidad_buenas from retail.producciones where id = :'ord'),
  'nota', (select nota from retail.producciones where id = :'ord'),
  'movs', (select count(*) from retail.movimientos where produccion_id = :'ord'),
  'historial_nuevo', (select count(*) from retail.costo_historial where variante_id = :'v1') - :h0,
  'costo', (select costo from retail.variantes where id = :'v1'),
  'costo_previo', :c0,
  'quien', (select btrim(concat_ws(' ', nombres, apellidos)) from public.personas where auth_user_id = '${FELIPE}'),
  'hoy_lima', to_char(now() at time zone 'America/Lima', 'DD/MM/YYYY'),
  'actividad', (select coalesce(jsonb_agg(jsonb_build_object('accion', a.accion, 'descripcion', a.descripcion, 'persona', a.persona_id, 'ubicacion', a.ubicacion_id)), '[]'::jsonb)
                  from retail.actividad a where a.accion = 'costo_atipico_confirmado' and a.registro_id = :'ord'),
  'motivo_en_sesion', coalesce(current_setting('retail.motivo_costo_atipico', true), '')
);
rollback;`);
  return JSON.parse(salida.split("\n").filter(Boolean).at(-1));
}

const intacta = (s) =>
  s.estado === "en_proceso" && s.buenas === null && s.movs === 0 && s.historial_nuevo === 0 && Number(s.costo) === Number(s.costo_previo)
    ? null
    : `no quedó intacta: ${JSON.stringify({ estado: s.estado, buenas: s.buenas, movs: s.movs, historial_nuevo: s.historial_nuevo, costo: s.costo, costo_previo: s.costo_previo })}`;

// ---------------- A · CON MOTIVO ----------------
caso("A1 el líder confirma con motivo: cierra y el costo entra al promedio", () => {
  const s = escena({ unitario: 70 });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.estado !== "terminada" || s.buenas !== 10 || s.historial_nuevo !== 1) return JSON.stringify(s);
});
caso("A2 la nota dice quién (su nombre), cuándo (día y hora de Lima), de qué clase y el motivo, sin cifras de costo", () => {
  const s = escena({ unitario: 70 });
  const esperado = new RegExp(`^Costo atípico confirmado por ${s.quien} el ${s.hoy_lima.replace(/\//g, "\\/")} \\d{2}:\\d{2} \\(más del doble del costo vigente\\): «${MOTIVO}»$`);
  if (!esperado.test(s.nota ?? "")) return `nota: ${s.nota} (quien ${s.quien}, hoy ${s.hoy_lima})`;
});
caso("A3 queda una fila en Actividad: quién, en qué sede y el motivo", () => {
  const s = escena({ unitario: 70 });
  if (s.actividad.length !== 1) return `filas en Actividad: ${JSON.stringify(s.actividad)}`;
  const f = s.actividad[0];
  if (!f.descripcion.includes(MOTIVO) || !f.descripcion.includes("OP-") || !f.persona || !f.ubicacion) return JSON.stringify(f);
});
caso("A4 el motivo no se queda pegado a la conexión", () => {
  const s = escena({ unitario: 70 });
  if (s.motivo_en_sesion !== "") return `quedó «${s.motivo_en_sesion}»`;
});
caso("A5 la constancia dice la clase de cada costo atípico (sin costo)", () => {
  const s = escena({ unitario: 0 });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (!/\(sin costo\): «/.test(s.nota ?? "")) return `nota: ${s.nota}`;
});

// ---------------- B · SIN MOTIVO NO HAY CONFIRMACIÓN ----------------
for (const [nombre, cfg] of [
  ["sin motivo (null)", { motivo: null }],
  ["con un motivo en blanco", { motivo: "     " }],
  ["con un motivo de 4 letras", { motivo: "abcd" }],
  ["con un motivo de más de 300 letras", { motivo: "x".repeat(301) }],
  ["llamando directo a cerrar_produccion(…, true), que no trae motivo", { llamada: "directa", motivo: null }],
]) {
  caso(`B ${nombre}: se rechaza con costo_atipico_sin_motivo y la orden queda intacta (todo o nada)`, () => {
    const s = escena({ unitario: 70, ...cfg });
    if (s.r.ok || s.r.hint !== "costo_atipico_sin_motivo") return JSON.stringify(s.r);
    if (s.actividad.length !== 0) return `no debía anotar Actividad: ${JSON.stringify(s.actividad)}`;
    return intacta(s);
  });
}

// ---------------- C · LO QUE NO CAMBIA ----------------
caso("C1 sin confirmar, el líder recibe costo_atipico con el dato (la pregunta de siempre)", () => {
  const s = escena({ unitario: 70, confirma: false, motivo: null });
  if (s.r.ok || s.r.msg !== "costo_atipico") return JSON.stringify(s.r);
  if (JSON.parse(s.r.detail).motivo !== "sube") return `detail: ${s.r.detail}`;
  return intacta(s);
});
caso("C2 un costo normal cierra sin constancia ni Actividad, aunque se mande un motivo", () => {
  const s = escena({ unitario: 32 });
  if (!s.r.ok) return JSON.stringify(s.r);
  if (s.nota || s.actividad.length !== 0) return `nota ${s.nota}, actividad ${JSON.stringify(s.actividad)}`;
});
caso("C3 el integrante con costo atípico sigue sin poder (costo_atipico_sin_lider), aunque mande motivo", () => {
  const s = escena({ unitario: 70, como: "integrante" });
  if (s.r.ok || s.r.msg !== "costo_atipico_sin_lider") return JSON.stringify(s.r);
  return intacta(s);
});
caso("C4 una muestra no pregunta nada y no deja constancia", () => {
  const s = escena({ unitario: 5000, muestra: true, confirma: false, motivo: null });
  if (!s.r.ok || s.nota) return JSON.stringify(s);
});

// ---------------- D · LA FORMA ----------------
caso("D1 una sola cerrar_produccion y una sola cerrar_produccion_con_motivo (sin sobrecargas que confundan a PostgREST)", () => {
  const s = psql(`select (select count(*) from pg_proc where proname = 'cerrar_produccion' and pronamespace = 'retail'::regnamespace)
    || ',' || (select count(*) from pg_proc where proname = 'cerrar_produccion_con_motivo' and pronamespace = 'retail'::regnamespace);`);
  // Contra la base SIN la migración la segunda es 0: la prueba D1 mira la base viva solo en lo que no cambia; la forma nueva se mira cargándola.
  const conMigracion = psql(`begin;\n${MIGRACION}\nselect (select count(*) from pg_proc where proname = 'cerrar_produccion' and pronamespace = 'retail'::regnamespace)
    || ',' || (select count(*) from pg_proc where proname = 'cerrar_produccion_con_motivo' and pronamespace = 'retail'::regnamespace);\nrollback;`)
    .split("\n").filter(Boolean).at(-1);
  if (conMigracion !== "1,1") return `con la migración: ${conMigracion} (base viva: ${s})`;
});
caso("D2 anon no ejecuta la nueva; authenticated sí; las piezas internas, ninguno", () => {
  const salida = psql(`begin;\n${MIGRACION}
select has_function_privilege('anon', 'retail.cerrar_produccion_con_motivo(uuid, jsonb, numeric, numeric, numeric, boolean, text)', 'execute')::text
  || ',' || has_function_privilege('authenticated', 'retail.cerrar_produccion_con_motivo(uuid, jsonb, numeric, numeric, numeric, boolean, text)', 'execute')::text
  || ',' || has_function_privilege('authenticated', 'retail.fn_costo_atipico_prefijo()', 'execute')::text
  || ',' || has_function_privilege('authenticated', 'retail.fn_costo_atipico_motivo()', 'execute')::text;
rollback;`).split("\n").filter(Boolean).at(-1);
  if (salida !== "false,true,false,false") return salida;
});
caso("D3 la migración se puede pegar dos veces (una sola lógica nueva en cerrar_produccion)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select (length(d) - length(replace(d, 'fn_costo_atipico_prefijo()', ''))) / length('fn_costo_atipico_prefijo()')
  from (select pg_get_functiondef('retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)'::regprocedure) d) x;
rollback;`).split("\n").filter(Boolean).at(-1);
  if (salida !== "1") return `apariciones de la lógica nueva: ${salida}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
