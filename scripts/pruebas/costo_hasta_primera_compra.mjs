#!/usr/bin/env node
/**
 * Prueba de «el costo se corrige a mano solo hasta la primera compra» (Felipe, 2026-09-26) contra el Postgres LOCAL:
 * migración `20260927190000_costo_se_corrige_hasta_la_primera_compra.sql`.
 *
 * QUÉ CUBRE
 *   1. Una prenda SIN compras (costo declarado): un líder corrige su costo por la API, y el historial lo anota como
 *      'costo_declarado' — no como 'costo', que Resumen leería como «alterado».
 *   2. Una prenda CON compras (costo oficial): un líder no puede cambiar su costo por la API (hint `costo_oficial`), ni
 *      con un update directo; guardar el MISMO costo o cambiar solo el precio sigue pasando.
 *   3. El camino oficial sigue abierto: una función SECURITY DEFINER llamada por esa misma sesión recalcula el costo
 *      (así lo hacen recibir_compras, recibir_lote y cerrar_produccion), y el historial lo anota como 'costo'.
 *   4. `fn_variantes_con_costo_oficial` distingue las dos prendas; `anon` no la ejecuta.
 *   5. CONTROL: sin el disparador, el mismo update directo SÍ pisa el costo oficial (el hueco existía).
 *   6. El parche del historial se puede pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK: el Postgres local compartido no cambia. La prenda «oficial» recibe su
 * costo con `fn_recalcular_costo_variante` sobre una entrada de prueba, como una recepción de compra. Sesión simulada
 * con `request.jwt.claim.sub` + `set local role authenticated`. `pg_temp.intento` corre una sentencia y devuelve el
 * resultado o el error (hint, mensaje) como JSON.
 *
 * USO
 *   pnpm pruebas:costo-hasta-primera-compra    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260927190000_costo_se_corrige_hasta_la_primera_compra.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Deja `:decl` (sin compras) y `:ofi` (con costo oficial de 40.00) y la función de intentos. */
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

-- Así llama una recepción de compra a fn_recalcular_costo_variante: desde una función SECURITY DEFINER.
create function pg_temp.recepcion_de_prueba(p_variante uuid, p_mov uuid) returns numeric language sql security definer as $f$
  select retail.fn_recalcular_costo_variante(p_variante, 5, 50.00, 'compra', p_mov);
$f$;
grant execute on function pg_temp.recepcion_de_prueba(uuid, uuid) to authenticated;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
-- La «declarada»: una prenda nueva con stock de carga inicial en Trujillo y SIN compras (en la semilla, toda prenda
-- con stock ya tiene su costo de compras). Con stock, para que aparezca en el Resumen de esa tienda.
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Costo declarado', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p_decl \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p_decl', 'ZZ-CD-1', 100, 32, true) returning id as decl \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'decl', :'tru', :'alm', 'entrada', 3, 'carga_inicial') returning id as mov_decl \\gset
select retail.fn_aplicar_movimiento(:'mov_decl') as _ap_decl \\gset
-- La «oficial» es una prenda nueva, sin stock en ninguna parte: así el promedio ponderado da una cifra exacta
-- (5 a 40.00 y 5 a 50.00 → 45.00). Un producto propio: sin talla ni color, dos variantes recibirían el mismo código.
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Costo hasta la primera compra', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p_ofi \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p_ofi', 'ZZ-CHPC-1', 100, 40, true) returning id as ofi \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'ofi', :'tru', :'alm', 'entrada', 5, 'compra de prueba') returning id as mov \\gset
-- Como una recepción: primero el costo (con el stock previo, 0), después el movimiento.
select retail.fn_recalcular_costo_variante(:'ofi', 5, 40.00, 'compra', :'mov') as _costo \\gset
select retail.fn_aplicar_movimiento(:'mov') as _ap \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'ofi', :'tru', :'alm', 'entrada', 5, 'segunda compra de prueba') returning id as mov2 \\gset
-- Los ids viajan en la configuración de la transacción: psql no sustituye :'var' dentro de un texto entre $…$.
select set_config('prueba.decl', :'decl', true), set_config('prueba.ofi', :'ofi', true), set_config('prueba.mov2', :'mov2', true),
       set_config('prueba.p_ofi', :'p_ofi', true), set_config('prueba.tru', :'tru', true) \\gset
-- La sesión de Felipe (líder), como la arma PostgREST.
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;

const DECL = "current_setting('prueba.decl')::uuid";
const OFI = "current_setting('prueba.ofi')::uuid";
const COMO_LIDER = "set local role authenticated;";
const SIN_CANDADO = "drop trigger if exists variantes_costo_hasta_la_primera_compra on retail.variantes;";

/** Transacción con ROLLBACK: escena → (opcional, como postgres) → sesión de líder → cuerpo. */
const dentro = (cuerpo, { antes = "" } = {}) => psql(`begin;\n${ESCENA}\n${antes}\n${COMO_LIDER}\n${cuerpo}\nrollback;`);
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);`;
/** La última línea de la salida. */
const ultima = (salida) => salida.split("\n").filter(Boolean).at(-1);
const json = (salida) => JSON.parse(ultima(salida));

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

caso("CONTROL: sin el disparador, un líder pisa por la API el costo de una prenda con compras (el hueco existía)", () => {
  const r = json(dentro(intento(`update retail.variantes set costo = 10 where id = ${OFI}`), { antes: SIN_CANDADO }));
  if (!r.ok) return `debía pasar sin el candado: ${JSON.stringify(r)}`;
});

caso("prenda sin compras: el líder corrige su costo por la API", () => {
  const salida = dentro(`${intento(`update retail.variantes set costo = 31.50 where id = ${DECL}`)}
reset role;
select costo from retail.variantes where id = ${DECL};`);
  if (ultima(salida) !== "31.50") return `costo final: ${salida}`;
});

caso("…y el historial lo anota como 'costo_declarado', no como 'costo' (Resumen no la marca «alterada»)", () => {
  const salida = dentro(`${intento(`update retail.variantes set costo = 31.50 where id = ${DECL}`)}
reset role;
select string_agg(campo, ',' order by created_at) from retail.historial_producto_cambios
 where entidad = 'variante' and entidad_id = ${DECL} and campo like 'costo%';`);
  if (ultima(salida) !== "costo_declarado") return `campos: ${salida}`;
});

caso("prenda con compras: el líder NO puede cambiar su costo por la API (hint costo_oficial)", () => {
  const r = json(dentro(intento(`update retail.variantes set costo = 10 where id = ${OFI}`)));
  if (r.ok || r.hint !== "costo_oficial") return JSON.stringify(r);
});

caso("…tampoco dejándolo en 0 (lo que hacía la ficha con el campo vacío)", () => {
  const r = json(dentro(intento(`update retail.variantes set costo = 0 where id = ${OFI}`)));
  if (r.ok || r.hint !== "costo_oficial") return JSON.stringify(r);
});

// El costo va literal, como lo manda la ficha: la API no puede LEER `variantes.costo` (20260923193700).
caso("…pero guardar el MISMO costo y cambiar el precio sigue pasando (lo que manda la ficha nueva)", () => {
  const r = json(dentro(intento(`update retail.variantes set costo = 40.00, precio = 99.90 where id = ${OFI}`)));
  if (!r.ok) return JSON.stringify(r);
});

caso("el camino oficial sigue abierto: una recepción (SECURITY DEFINER) recalcula el costo desde esa misma sesión", () => {
  const salida = dentro(`select pg_temp.recepcion_de_prueba(${OFI}, current_setting('prueba.mov2')::uuid);
reset role;
select costo from retail.variantes where id = ${OFI};`);
  if (ultima(salida) !== "45.00") return `costo final (esperado 45.00 = promedio de 5×40 y 5×50): ${salida}`;
});

caso("…y ese recálculo se anota como 'costo'", () => {
  const salida = dentro(`select pg_temp.recepcion_de_prueba(${OFI}, current_setting('prueba.mov2')::uuid);
reset role;
select h.campo from retail.historial_producto_cambios h
 where h.entidad = 'variante' and h.entidad_id = ${OFI} and h.valor_nuevo = '45.00';`);
  if (ultima(salida) !== "costo") return `campo: ${salida}`;
});

/** Guardar la ficha de la prenda «oficial» como lo hace la pantalla, con el costo indicado. */
const GUARDAR_FICHA = (costo) => intento(`select retail.catalogo_actualizar_producto(
  p_producto_id => current_setting('prueba.p_ofi')::uuid, p_referencia => 'ZZ Costo hasta la primera compra', p_estado => 'activo',
  p_variantes => jsonb_build_array(jsonb_build_object('id', ${OFI}, 'sku', 'ZZ-CHPC-1', 'precio', 99.90, 'costo', ${costo}, 'activo', true)))`);

caso("por la ficha (catalogo_actualizar_producto): cambiar el precio mandando el mismo costo pasa", () => {
  const r = json(dentro(GUARDAR_FICHA("40.00")));
  if (!r.ok) return JSON.stringify(r);
});

caso("por la ficha: cambiar el costo de una prenda con compras se rechaza (hint costo_oficial)", () => {
  const r = json(dentro(GUARDAR_FICHA("10")));
  if (r.ok || r.hint !== "costo_oficial") return JSON.stringify(r);
});

const ESTADO_EN_RESUMEN = `reset role;
set local role authenticated;
select estado_costo from retail.fn_resumen_variantes(current_setting('prueba.tru')::uuid) where variante_id = ${DECL};`;

caso("CONTROL: una corrección anotada como 'costo' (lo de antes) deja la prenda «alterada» en Resumen", () => {
  const salida = dentro(`reset role;
insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo)
  values ('variante', ${DECL}, 'costo', '32.00', '31.50');
update retail.variantes set costo = 31.50 where id = ${DECL};
${ESTADO_EN_RESUMEN}`);
  if (ultima(salida) !== "alterado") return `estado: ${salida}`;
});

caso("corregir por la API el costo de una prenda sin compras la deja «declarado» en Resumen", () => {
  const salida = dentro(`${intento(`update retail.variantes set costo = 31.50 where id = ${DECL}`)}
${ESTADO_EN_RESUMEN}`);
  if (ultima(salida) !== "declarado") return `estado: ${salida}`;
});

caso("fn_variantes_con_costo_oficial distingue las dos prendas", () => {
  const salida = dentro(`select (retail.fn_variantes_con_costo_oficial(array[${DECL}, ${OFI}]) = array[${OFI}])::text;`);
  if (ultima(salida) !== "true") return salida;
});

caso("anon no ejecuta fn_variantes_con_costo_oficial", () => {
  const salida = psql(`select has_function_privilege('anon', 'retail.fn_variantes_con_costo_oficial(uuid[])', 'execute')::text;`);
  if (salida !== "false") return salida;
});

caso("la migración se puede pegar dos veces (un solo disparador, el historial parchado una vez)", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_trigger where tgname = 'variantes_costo_hasta_la_primera_compra';
select (length(d) - length(replace(d, 'costo_declarado', ''))) / length('costo_declarado')
  from (select pg_get_functiondef('retail.fn_registrar_cambio_producto()'::regprocedure) as d) x;
rollback;`);
  const [disparadores, parches] = salida.split("\n").filter((l) => /^\d+$/.test(l));
  if (disparadores !== "1" || parches !== "1") return `disparadores ${disparadores}, parches ${parches}: ${salida}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
