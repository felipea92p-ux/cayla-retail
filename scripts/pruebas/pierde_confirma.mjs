#!/usr/bin/env node
/**
 * Pruebas de «Pierdes» pide confirmar (ADR-0668, A5a) — migración `20261116040000_pierdes_pide_confirmar.sql`.
 *
 * LO QUE VIGILA. Que un precio que deja pérdida (lo que queda, precio ÷ 1.18 − costo, redondeado al céntimo, es negativo) pida confirmar
 * en vez de prohibirse, y que la confirmación viaje en el encabezado `x-confirma-perdida`: sin él, la regla de siempre (nunca bajo el
 * costo, para la web publicada); con «no», frena si pierde; con «si», pasa. Que la regla de la base y la de la web digan lo mismo.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso: se puede pegar dos veces).
 *   R  LA REGLA: los casos de `scripts/pruebas/pierde-casos.json` (los mismos que corre la web) contra `fn_pierde_con`.
 *   E  EL ENCABEZADO: `fn_precio_frena` en los tres modos.
 *   T  EL PRECIO DE UNA TIENDA (`poner_precio_sede`, `poner_precio_sede_variantes`), de punta a punta, en los tres modos.
 *   S  LA FORMA: las cinco puertas usan la regla nueva; los permisos.
 *
 * USO
 *   node scripts/pruebas/pierde_confirma.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/pierde_confirma.mjs --contenedor supabase_db_x   → contra otro stack
 *   node scripts/pruebas/pierde_confirma.mjs --sin-migracion              → sin cargar la migración: contra una base sin el cambio,
 *                                                                           la prueba tiene que FALLAR
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
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261116040000_pierdes_pide_confirmar.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");
const CASOS = JSON.parse(readFileSync(join(RAIZ, "scripts", "pruebas", "pierde-casos.json"), "utf8")).casos;

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (semilla)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text; v_det text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_det = pg_exception_detail;
  return coalesce(v_hint, '') || '|' || v_msg || '|' || coalesce(v_det, '');
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Una prenda de ROPA con al menos dos tallas activas al mismo precio general (como precio_sede.mjs), y su costo fijado en S/ 36.
select v.producto_id as p1 from retail.variantes v join retail.productos pr on pr.id = v.producto_id
 where v.activo and retail.fn_categoria_entra_a_motores(pr.categoria_id)
 group by v.producto_id having count(*) >= 2 and min(v.precio) = max(v.precio) and min(v.precio) > 10
 order by v.producto_id limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'p1' and activo order by id limit 1 \\gset
update retail.variantes set costo = 36 where producto_id = :'p1';
`;

// La sesión de Felipe en Trujillo, con el encabezado de la confirmación (o sin él: `null`).
const sesion = (confirma) => `
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', (json_build_object('x-ubicacion', :'tru', 'x-dueno', 'ca71a000-0000-4000-8000-000000000001')::jsonb
  ${confirma === null ? "" : `|| jsonb_build_object('x-confirma-perdida', '${confirma}')`})::text, true) \\g /dev/null
set local role authenticated;
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// R. LA REGLA: la misma tabla que la web -----------------------------------------------------------------------------------------
caso(
  `R1 los ${CASOS.length} casos compartidos con la web dan lo mismo en la base`,
  `select string_agg((retail.fn_pierde_con(t.p, t.c))::text, ',' order by t.n) from (values ${CASOS.map((c, i) => `(${i}, ${c.precio}::numeric, ${c.costo}::numeric)`).join(", ")}) t(n, p, c);`,
  CASOS.map((c) => String(c.pierde)).join(","),
);

// E. EL ENCABEZADO ---------------------------------------------------------------------------------------------------------------
const frena = (confirma) => `${sesion(confirma)}select concat_ws(',', retail.fn_precio_frena(40, 36), retail.fn_precio_frena(30, 36), retail.fn_precio_frena(50, 36));`;
caso("E1 sin encabezado (la web de antes): la regla de siempre, solo bajo el costo frena", frena(null), "f,t,f");
caso("E2 con «no»: frena lo que pierde (40 con costo 36 pierde el impuesto)", frena("no"), "t,t,f");
caso("E3 con «si» (la persona dijo «Sí, dejarlo»): nada frena", frena("si"), "f,f,f");
caso("E4 «sí» con tilde vale como «si»", frena("sí"), "f,f,f");
caso("E5 un valor raro cuenta como «no»: la base pregunta en vez de volver en silencio a la regla de antes", frena("quizas"), "t,t,f");

// T. EL PRECIO DE UNA TIENDA, de punta a punta -----------------------------------------------------------------------------------
const tienda = (confirma, precio) => `${sesion(confirma)}select pg_temp.intento(format('select retail.poner_precio_sede(%L, %L, ${precio}, %L)', :'p1', :'tru', 'Prueba A5'));`;
caso("T1 sin encabezado, 40 con costo 36: se guarda en silencio como hasta hoy (la web publicada no cambia)", tienda(null, 40), "OK");
caso("T2 sin encabezado, 30 con costo 36: el rechazo de siempre, con su texto y su hint", tienda(null, 30), (o) => o.startsWith("precio_sede_bajo_costo|Ese precio queda por debajo"));
caso(
  "T3 con «no», 40 con costo 36: pide confirmar, dice cuánto se pierde (S/ 2.10) y lo manda en el detalle",
  tienda("no", 40),
  "precio_pierde|Con S/ 40.00 pierdes S/ 2.10 por prenda.|{\"precio\": 40.00, \"pierdes\": 2.10}",
);
caso("T4 con «si», 40 con costo 36: se deja, a propósito", tienda("si", 40), "OK");
caso("T5 con «si», 30 bajo el costo: también (un remate a propósito)", tienda("si", 30), "OK");
caso("T6 con «no», 50 con costo 36: no pierde, se guarda sin preguntar", tienda("no", 50), "OK");
caso(
  "T7 por talla (`poner_precio_sede_variantes`), con «no»: la misma pregunta",
  `${sesion("no")}select split_part(pg_temp.intento(format('select retail.poner_precio_sede_variantes(%L, %L, %L::jsonb, %L)', :'p1', :'tru', jsonb_build_object(:'v1', 40), 'Prueba A5')), '|', 1);`,
  "precio_pierde",
);
caso(
  "T8 por talla, con «si»: se deja",
  `${sesion("si")}select pg_temp.intento(format('select retail.poner_precio_sede_variantes(%L, %L, %L::jsonb, %L)', :'p1', :'tru', jsonb_build_object(:'v1', 40), 'Prueba A5'));`,
  "OK",
);

// S. LA FORMA --------------------------------------------------------------------------------------------------------------------
caso(
  "S1 las cinco puertas usan la regla nueva y ninguna conserva el «precio < costo» suelto",
  `reset role;
   select string_agg(p.proname || ':' || (pg_get_functiondef(p.oid) ~ 'fn_exigir_precio_sin_perdida|fn_precio_frena')::text || ':'
                     || (pg_get_functiondef(p.oid) ~ 'v_precio < v_costo_max|v_precio < v_var_costo|x\\.precio < w\\.costo')::text, ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in
      ('poner_precio_sede', 'poner_precio_sede_variantes', 'cambiar_precio_en_recepcion', 'cambiar_precios_en_recepcion', 'fn_fusion_precios_sede_costo');`,
  "cambiar_precio_en_recepcion:true:false,cambiar_precios_en_recepcion:true:false,fn_fusion_precios_sede_costo:true:false,poner_precio_sede:true:false,poner_precio_sede_variantes:true:false",
);
caso(
  "S2 la regla y el encabezado se pueden preguntar con sesión; el rechazo es de la base; anon nada",
  `reset role;
   select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute'), ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_pierde_con', 'fn_confirma_perdida', 'fn_precio_frena', 'fn_exigir_precio_sin_perdida');`,
  "fn_confirma_perdida:true:false,fn_exigir_precio_sin_perdida:false:false,fn_pierde_con:true:false,fn_precio_frena:true:false",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
