#!/usr/bin/env node
/**
 * Prueba de ADR-0655 «Cambiar la talla de una prenda comprada con descuento no cobra el descuento otra vez»
 * (`supabase/migrations/20261114125000_cambio_mismo_modelo_conserva_descuento.sql`, Felipe 2026-11-14).
 *
 * EL PROBLEMA. `registrar_cambio` medía la prenda nueva a precio de lista contra lo pagado por la devuelta (ADR-0380): cambiar la talla
 * de una blusa comprada con S/ 10 de descuento cobraba esos S/ 10. Con el 3x2 cada prenda del grupo lleva su parte, así que dejaba de
 * ser raro.
 *
 * QUÉ CUBRE (la venta de partida: BLU-EMMA-NEG-M de S/ 79.90 con S/ 10 de descuento en Tienda Lima: pagó S/ 69.90)
 *   1. Por otra talla del MISMO modelo (BLU-EMMA-NEG-S, mismo precio): diferencia S/ 0.
 *   2. Por una talla que cuesta S/ 5 más: S/ 5.
 *   3. Por una talla que cuesta S/ 5 menos: S/ 0 (nunca devuelve).
 *   4. Por OTRO modelo (VES-SOFI-NEG-M): la regla de siempre, su precio menos lo pagado (ADR-0380).
 *   5. Una por varias (`registrar_cambio_varias`): la misma talla S y un vestido: solo se paga el vestido.
 *   6. Una por varias: dos tallas del mismo modelo por una devuelta: la segunda va a lista.
 *   7. MUTANTE: con `fn_precio_mismo_modelo` que nunca reconoce el mismo modelo, el caso 1 vuelve a cobrar S/ 10, y la prueba lo ve.
 *   8. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada), como Felipe (líder) con `request.jwt.claim.sub`. Si el
 * Postgres local no tiene la migración, se aplica dentro de cada transacción (el CI la tiene).
 *
 * USO
 *   pnpm pruebas:cambio-mismo-modelo
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = join(RAIZ, "supabase", "migrations", "20261114125000_cambio_mismo_modelo_conserva_descuento.sql");
const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const SQL_MIGRACION = readFileSync(MIGRACION, "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Si la base no tiene la migración (el Postgres local va atrás), se aplica dentro de la transacción del caso. */
function correr(sql, { conMigracion = true } = {}) {
  const yaEsta = psql("select to_regprocedure('retail.fn_precio_mismo_modelo(uuid, uuid, uuid)') is not null;").trim() === "t";
  const migracion = conMigracion && !yaEsta ? SQL_MIGRACION : "";
  try {
    return { ok: true, lineas: psql(`begin;\n${migracion}\n${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// `pg_temp.intentar(sql)` devuelve «ok» o «mensaje :: detalle» en vez de abortar. Deja una venta de BLU-EMMA-NEG-M con S/ 10 de
// descuento (`:venta_item`) en Tienda Lima, con caja abierta y stock de sobra de las prendas que se llevan.
const PRELUDIO = `
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_det text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
  return v_msg || ' :: ' || coalesce(nullif(v_det, ''), '-');
end $f$;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 500.00, 'prueba automatizada') as caja_id \\gset
select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_s from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select id as v_l from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select id as v_ves from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov_v_old \\gset
select retail.fn_aplicar_movimiento(:'mov_v_old') as _a_v_old \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_s', :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov_v_s \\gset
select retail.fn_aplicar_movimiento(:'mov_v_s') as _a_v_s \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_l', :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov_v_l \\gset
select retail.fn_aplicar_movimiento(:'mov_v_l') as _a_v_l \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_ves', :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov_v_ves \\gset
select retail.fn_aplicar_movimiento(:'mov_v_ves') as _a_v_ves \\gset
select retail.fn_precio_en_sede(:'v_old', :'ubic') as precio_old \\gset
select retail.fn_precio_en_sede(:'v_ves', :'ubic') as precio_ves \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', (:'precio_old')::numeric,
                                       'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_old')::numeric - 10)),
  null, gen_random_uuid()) as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
`;

const CAMBIAR = (variante) =>
  `select pg_temp.intentar(format('select retail.registrar_cambio(%L, %L, %L, 1, %L, gen_random_uuid())', :'venta_item', :'ubic', :'${variante}', 'tarjeta'));`;
const CAMBIAR_VARIAS = (salidas) =>
  `select pg_temp.intentar(format('select retail.registrar_cambio_varias(%L, %L, %L::jsonb, 1, %L, gen_random_uuid())', :'venta_item', :'ubic',
     jsonb_build_array(${salidas.map((v) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1)`).join(", ")})::text, 'tarjeta'));`;
const DIFERENCIA = `select coalesce((select diferencia from retail.cambios where venta_item_id = :'venta_item'), -999);`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const num = (x) => Number(x);

{
  const r = correr(`${CAMBIAR("v_s")}\n${DIFERENCIA}`);
  esperar("1 · por otra talla del mismo modelo (mismo precio) no se cobra nada", r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === 0, r.ok ? r.lineas : r.mensaje);
}
{
  const r = correr(`update retail.variantes set precio = precio + 5 where id = :'v_s';\n${CAMBIAR("v_s")}\n${DIFERENCIA}`);
  esperar("2 · por una talla que cuesta S/ 5 más, se cobran S/ 5", r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === 5, r.ok ? r.lineas : r.mensaje);
}
{
  const r = correr(`update retail.variantes set precio = precio - 5 where id = :'v_s';\n${CAMBIAR("v_s")}\n${DIFERENCIA}`);
  esperar("3 · por una talla que cuesta S/ 5 menos, no se devuelve nada", r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === 0, r.ok ? r.lineas : r.mensaje);
}
{
  const r = correr(`${CAMBIAR("v_ves")}\n${DIFERENCIA}\nselect (:'precio_ves')::numeric - ((:'precio_old')::numeric - 10);`);
  esperar(
    "4 · por otro modelo, la regla de siempre: su precio menos lo pagado (ADR-0380)",
    r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === num(r.lineas[2]) && num(r.lineas[1]) > 0,
    r.ok ? r.lineas : r.mensaje,
  );
}
{
  const r = correr(`${CAMBIAR_VARIAS(["v_s", "v_ves"])}\n${DIFERENCIA}\nselect (:'precio_ves')::numeric;`);
  esperar(
    "5 · una por varias: la misma blusa en S y un vestido, solo se paga el vestido",
    r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === num(r.lineas[2]),
    r.ok ? r.lineas : r.mensaje,
  );
}
{
  const r = correr(`${CAMBIAR_VARIAS(["v_s", "v_l"])}\n${DIFERENCIA}\nselect (:'precio_old')::numeric;`);
  esperar(
    "6 · una por varias: dos tallas del mismo modelo por una devuelta, la segunda va a su precio",
    r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === num(r.lineas[2]),
    r.ok ? r.lineas : r.mensaje,
  );
}
{
  const r = correr(`create or replace function retail.fn_precio_mismo_modelo(p_venta_item_id uuid, p_variante_nueva_id uuid, p_ubicacion_id uuid) returns numeric language sql as $m$ select null::numeric $m$;
${CAMBIAR("v_s")}\n${DIFERENCIA}`);
  esperar(
    "7 · MUTANTE: si nunca reconoce el mismo modelo, cambiar la talla vuelve a cobrar los S/ 10, y la prueba lo ve",
    r.ok && r.lineas[0] === "ok" && num(r.lineas[1]) === 10,
    r.ok ? r.lineas : r.mensaje,
  );
}
{
  const r = correr(`${SQL_MIGRACION}\n${SQL_MIGRACION}\n${CAMBIAR("v_s")}\n${DIFERENCIA}`);
  esperar("8 · la migración se puede pegar dos veces", r.ok && r.lineas.at(-2) === "ok" && num(r.lineas.at(-1)) === 0, r.ok ? r.lineas : r.mensaje);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
