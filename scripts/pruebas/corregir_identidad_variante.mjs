#!/usr/bin/env node
/**
 * Prueba de «color y talla de una variante se corrigen mientras no tenga historia» (Felipe, 2026-09-28) contra el
 * Postgres LOCAL: migración `20260928235500_corregir_talla_color_de_variante_sin_historia.sql`.
 *
 * QUÉ CUBRE
 *   1. `fn_variantes_con_historia` distingue una variante con un movimiento de una recién creada; `anon` no la ejecuta.
 *   2. Por la ficha (`catalogo_actualizar_producto`), un líder cambia el color de la variante SIN historia: el código se
 *      recalcula, su fila en `codigos_barras` se renombra (el código viejo ya no la lee) y el historial anota color y código.
 *   3. …y su talla, si la talla está habilitada en la categoría; si no, se rechaza.
 *   4. La variante CON historia no cambia de color ni por la ficha ni con un update directo (hint `variante_con_historia`).
 *   5. Un guardado normal (mismo color y talla, solo precio) pasa y no toca código ni SKU.
 *   6. Corregir hacia una combinación que ya existe choca con `variantes_producto_talla_color_unico`.
 *   7. CONTROL: sin el disparador, el update directo SÍ cambia el color de la variante con historia (el hueco 3 existía).
 *   8. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia. Sesión simulada con
 * `request.jwt.claims` + `set local role authenticated`. `pg_temp.intento` corre una sentencia y devuelve el resultado o el
 * error (hint, mensaje) como JSON.
 *
 * USO
 *   pnpm pruebas:corregir-identidad-variante    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260928235500_corregir_talla_color_de_variante_sin_historia.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Una prenda nueva con dos variantes de la misma talla y distinto color: `hist` (con un movimiento) y `virgen`. */
const ESCENA = `
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;

-- Una categoría con al menos dos tallas habilitadas, y dos tallas que NO tiene (para el rechazo).
select ct.categoria_id as cat from retail.categoria_tallas ct group by ct.categoria_id having count(*) >= 2 order by ct.categoria_id limit 1 \\gset
select talla_id as t1 from retail.categoria_tallas where categoria_id = :'cat' order by talla_id limit 1 \\gset
select talla_id as t2 from retail.categoria_tallas where categoria_id = :'cat' order by talla_id offset 1 limit 1 \\gset
select coalesce((select t.id from retail.tallas t where not exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = :'cat' and ct.talla_id = t.id) limit 1), :'t1') as t_fuera \\gset
select codigo as c1 from retail.colores order by codigo limit 1 \\gset
select codigo as c2 from retail.colores order by codigo offset 1 limit 1 \\gset
select codigo as c3 from retail.colores order by codigo offset 2 limit 1 \\gset
insert into retail.productos (referencia, estado, categoria_id, marca_id, proveedor_id)
  select 'ZZ Corregir identidad', 'activo', :'cat', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'p', :'c1', :'t1', 100, 30) returning id as hist \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'p', :'c2', :'t1', 100, 30) returning id as virgen \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'hist', :'tru', :'alm', 'entrada', 2, 'carga_inicial') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov') as _ap \\gset
-- Los ids viajan en la configuración de la transacción: psql no sustituye :'var' dentro de un texto entre $…$.
select set_config('prueba.p', :'p', true), set_config('prueba.hist', :'hist', true), set_config('prueba.virgen', :'virgen', true),
       set_config('prueba.cat', :'cat', true), set_config('prueba.t1', :'t1', true), set_config('prueba.t2', :'t2', true),
       set_config('prueba.t_fuera', :'t_fuera', true), set_config('prueba.c1', :'c1', true), set_config('prueba.c2', :'c2', true),
       set_config('prueba.c3', :'c3', true) \\gset
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;

const cfg = (k) => `current_setting('prueba.${k}')`;
const HIST = `${cfg("hist")}::uuid`;
const VIRGEN = `${cfg("virgen")}::uuid`;
const COMO_LIDER = "set local role authenticated;";
const SIN_CANDADO = "drop trigger if exists variantes_identidad_sin_historia on retail.variantes;";

// Si la base local todavía no tiene la migración (no se aplica sola en un Postgres compartido), cada caso la aplica dentro
// de su propia transacción y se va con el ROLLBACK.
const YA_APLICADA = psql(`select exists (select 1 from pg_proc where proname = 'fn_corregir_identidad_variante')::text;`) === "true";
const PREVIA = YA_APLICADA ? "" : `${MIGRACION}\nreset search_path;`;
const dentro = (cuerpo, { antes = "" } = {}) => psql(`begin;\n${PREVIA}\n${ESCENA}\n${antes}\n${COMO_LIDER}\n${cuerpo}\nrollback;`);
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);`;
const ultima = (salida) => salida.split("\n").filter(Boolean).at(-1);
const json = (salida) => JSON.parse(ultima(salida));

/** Guardar la ficha como lo hace la pantalla: las dos variantes, con el color y la talla que se indiquen. */
const GUARDAR = ({ histColor = cfg("c1"), virgenColor = cfg("c2"), virgenTalla = cfg("t1"), precio = 100 } = {}) =>
  intento(`select retail.catalogo_actualizar_producto(
  p_producto_id => ${cfg("p")}::uuid, p_referencia => 'ZZ Corregir identidad', p_estado => 'activo',
  p_categoria_id => ${cfg("cat")}::uuid,
  p_variantes => jsonb_build_array(
    jsonb_build_object('id', ${HIST}, 'color_codigo', ${histColor}, 'talla_id', ${cfg("t1")}, 'precio', ${precio}, 'costo', 30, 'activo', true),
    jsonb_build_object('id', ${VIRGEN}, 'color_codigo', ${virgenColor}, 'talla_id', ${virgenTalla}, 'precio', ${precio}, 'costo', 30, 'activo', true)))`);

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
    console.log(`✗ ${nombre}\n    ${String(e.message ?? e).split("\n").join("\n    ")}`);
  }
}

caso("fn_variantes_con_historia distingue la variante con movimiento de la recién creada", () => {
  const salida = dentro(`select (retail.fn_variantes_con_historia(array[${HIST}, ${VIRGEN}]) = array[${HIST}])::text;`);
  if (ultima(salida) !== "true") return salida;
});
caso("anon no ejecuta fn_variantes_con_historia", () => {
  const salida = psql(`begin;\n${PREVIA}\nselect has_function_privilege('anon', 'retail.fn_variantes_con_historia(uuid[])', 'execute')::text;\nrollback;`);
  if (ultima(salida) !== "false") return salida;
});
caso("por la ficha, la variante sin historia cambia de color: código recalculado, código de barras renombrado, historial", () => {
  const salida = dentro(`${GUARDAR({ virgenColor: cfg("c3") })}
reset role;
select v.codigo like '%-' || ${cfg("c3")} || '-%' from retail.variantes v where v.id = ${VIRGEN};
select count(*) from retail.codigos_barras b where b.variante_id = ${VIRGEN} and b.codigo like '%-' || ${cfg("c2")} || '-%';
select count(*) from retail.codigos_barras b join retail.variantes v on v.id = b.variante_id and v.codigo = b.codigo where v.id = ${VIRGEN};
select string_agg(campo, ',' order by campo) from retail.historial_producto_cambios where entidad_id = ${VIRGEN};`);
  const [ok, color, viejos, nuevos, campos] = salida.split("\n").filter(Boolean);
  if (!JSON.parse(ok).ok) return ok;
  if (color !== "t" || viejos !== "0" || nuevos !== "1" || campos !== "codigo,color_codigo") {
    return `color ${color}, códigos viejos ${viejos}, nuevo ${nuevos}, historial ${campos}`;
  }
});
caso("por la ficha, la variante sin historia cambia a otra talla habilitada", () => {
  const salida = dentro(`${GUARDAR({ virgenTalla: cfg("t2") })}
reset role;
select (talla_id = ${cfg("t2")}::uuid)::text from retail.variantes where id = ${VIRGEN};`);
  const [ok, talla] = salida.split("\n").filter(Boolean);
  if (!JSON.parse(ok).ok || talla !== "true") return salida;
});
caso("…y una talla que la categoría no tiene se rechaza", () => {
  const r = json(dentro(GUARDAR({ virgenTalla: cfg("t_fuera") })));
  if (r.ok || !/no está habilitada/.test(r.msg)) return JSON.stringify(r);
});
caso("por la ficha, la variante CON historia no cambia de color (hint variante_con_historia)", () => {
  const r = json(dentro(GUARDAR({ histColor: cfg("c3") })));
  if (r.ok || r.hint !== "variante_con_historia") return JSON.stringify(r);
});
caso("con un update directo por la API, tampoco (el candado vive en la tabla)", () => {
  const r = json(dentro(intento(`update retail.variantes set color_codigo = ${cfg("c3")} where id = ${HIST}`)));
  if (r.ok || r.hint !== "variante_con_historia") return JSON.stringify(r);
});
caso("un guardado normal (solo precio) pasa y no toca código ni SKU", () => {
  const salida = dentro(`reset role;
select string_agg(coalesce(codigo, '') || '|' || coalesce(sku, ''), ',' order by id) as antes from retail.variantes where producto_id = ${cfg("p")}::uuid \\gset
${COMO_LIDER}
${GUARDAR({ precio: 120 })}
reset role;
select (string_agg(coalesce(codigo, '') || '|' || coalesce(sku, ''), ',' order by id) = :'antes')::text from retail.variantes where producto_id = ${cfg("p")}::uuid;`);
  const [ok, igual] = salida.split("\n").filter(Boolean);
  if (!JSON.parse(ok).ok || igual !== "true") return salida;
});
caso("corregir hacia una combinación que ya existe choca con la identidad única", () => {
  const r = json(dentro(GUARDAR({ virgenColor: cfg("c1") })));
  if (r.ok || !/variantes_producto_talla_color_unico|variantes_codigo_unico/.test(r.msg)) return JSON.stringify(r);
});
caso("CONTROL: sin el disparador, el update directo SÍ cambia el color de la variante con historia", () => {
  const salida = dentro(`${intento(`update retail.variantes set color_codigo = ${cfg("c3")} where id = ${HIST}`)}
reset role;
select (color_codigo = ${cfg("c3")})::text from retail.variantes where id = ${HIST};`, { antes: SIN_CANDADO });
  const [ok, cambio] = salida.split("\n").filter(Boolean);
  if (!JSON.parse(ok).ok || cambio !== "true") return salida;
});
caso("la migración se puede pegar dos veces (un disparador, cada parche una vez)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_trigger where tgname = 'variantes_identidad_sin_historia';
select (length(d) - length(replace(d, 'fn_corregir_identidad_variante', ''))) / length('fn_corregir_identidad_variante')
  from (select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'retail' and p.proname = 'catalogo_actualizar_producto') x;
select (length(d) - length(replace(d, '20260928235500', ''))) / length('20260928235500')
  from (select pg_get_functiondef('retail.fn_registrar_cambio_producto()'::regprocedure) as d) x;
rollback;`);
  const [disparadores, llamadas, parches] = salida.split("\n").filter((l) => /^\d+$/.test(l));
  if (disparadores !== "1" || llamadas !== "1" || parches !== "1") return `disparadores ${disparadores}, llamadas ${llamadas}, parches ${parches}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
