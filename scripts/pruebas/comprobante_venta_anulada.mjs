#!/usr/bin/env node
/**
 * Prueba de que un comprobante no puede nacer sobre una venta ANULADA — CAYLA V2
 * (`20260921161500_comprobante_no_nace_sobre_venta_anulada.sql`).
 *
 * EL HUECO. `emitir_comprobante` aceptaba cualquier `p_venta_id`, también el de una venta anulada, y
 * `convertir_proforma_a_comprobante` se lo pasaba sin mirar. El resultado era un comprobante `pendiente`
 * sobre una venta que ya se le devolvió a la clienta: el mismo estado imposible que `20260921121500` cerró
 * del otro lado (anular libera el pendiente), sin nada que impidiera crearlo después. Ahora hay un
 * candado en la TABLA `comprobantes` (trigger `before insert`), como el que ya tienen `cambios` y
 * `devolucion_items` para una venta anulada.
 *
 * QUÉ PRUEBA.
 *   1. Lo que debe seguir andando: la venta con boleta (la ruta normal, `registrar_venta`), un
 *      comprobante manual sin venta, y la emisión tardía para una venta VIVA que quedó sin comprobante.
 *   2. `emitir_comprobante` sobre una venta anulada se niega, no deja ninguna fila y no quema el correlativo.
 *   3. Un `insert` directo en `comprobantes` sobre una venta anulada también se niega: el candado está en
 *      la tabla, no en una función.
 *   4. `convertir_proforma_a_comprobante` sobre una venta anulada se niega y la proforma sigue vigente.
 *
 * CÓMO. Mismo mecanismo que `anular_venta_comprobante.mjs` y `ventas_del_dia.mjs` (léelos primero):
 * `docker exec ... psql`, `set local request.jwt.claim.sub` para ser Felipe (líder) y una sola transacción
 * que termina SIEMPRE en ROLLBACK — no deja rastro en el Postgres compartido. Todo se arma con las RPC
 * reales (`registrar_venta`, `anular_venta`, `emitir_comprobante`, `crear_proforma`,
 * `convertir_proforma_a_comprobante`). Los errores esperados se atrapan con un bloque `do` (que se revierte
 * solo, con lo que hizo antes de fallar) para poder mirar el estado DESPUÉS del fallo.
 *
 * NO PRUEBA la carrera con `anular_venta` (una espera a la otra por el `for share` / `for update` sobre la
 * venta): haría falta una segunda conexión con datos ya confirmados, y esta prueba no deja rastro. Esa
 * parte descansa en el mismo mecanismo que `fn_linea_de_venta_no_anulada`.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace CI).
 *
 * USO
 *   pnpm pruebas:comprobante-venta-anulada    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y registrar_venta.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que falla no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Una venta de una unidad en Tienda Lima, pagada en efectivo, con boleta reservada junto a la venta.
const VENTA_CON_BOLETA = `retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio')),
  null, gen_random_uuid(), 'boleta')`;
// La misma venta SIN comprobante: la que se anula o a la que se le emite después.
const VENTA_SIN_COMPROBANTE = VENTA_CON_BOLETA.replace(", 'boleta')", ")");

// La condición de la única línea de una venta, como la manda la pantalla.
const ITEMS_ANULACION = (ventaVar) => `jsonb_build_array(jsonb_build_object('venta_item_id', :'${ventaVar}_item', 'condicion', 'vendible'))`;
const ITEM_DE = (ventaVar) => `select id as ${ventaVar}_item from retail.venta_items where venta_id = :'${ventaVar}' \\gset`;

// Tienda Lima lista para vender: piso/almacén (autocuración), caja limpia y propia (cierra cualquiera
// abierta con la RPC real, nunca un UPDATE) y stock de sobra de la variante.
const FIXTURE = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v1, precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;

let fallos = 0;
let total = 0;

// `resultado` se imprime solo si falla: distingue «la regla no se cumple» de «el fixture se rompió».
function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 700)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- Escenario 1: lo que debe seguir andando (una sola transacción, se revierte) ----
  const r1 = correr(`${FIXTURE}
-- A: la ruta normal, la boleta nace con la venta
select ${VENTA_CON_BOLETA} as a \\gset
-- B: un comprobante manual, sin venta
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as b_cmp \\gset
-- C: una venta VIVA que quedó sin comprobante, y se le emite después
select ${VENTA_SIN_COMPROBANTE} as c \\gset
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00, :'c') as c_cmp \\gset

select 'a_comprobante|' || estado from retail.comprobantes where venta_id = :'a';
select 'b_manual|' || estado || '|' || (venta_id is null)::text from retail.comprobantes where id = :'b_cmp';
select 'c_tardio|' || estado || '|' || (venta_id = :'c')::text from retail.comprobantes where id = :'c_cmp';
rollback;
`);

  if (!r1.ok) {
    console.log("✗ el escenario de lo que debe seguir andando falló antes de poder probar nada");
    console.log(`    ${r1.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l1 = r1.salida.split("\n");
  const dato1 = (clave) => l1.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar("la venta con boleta sigue emitiendo su comprobante junto a la venta", dato1("a_comprobante") === "pendiente", r1.salida);
  esperar("un comprobante manual, sin venta, se emite igual", dato1("b_manual") === "pendiente|true", r1.salida);
  esperar("a una venta VIVA sin comprobante se le puede emitir uno después", dato1("c_tardio") === "pendiente|true", r1.salida);

  // ---- Escenario 2: lo que NO debe pasar. Los errores se atrapan con un bloque `do` para mirar el estado después. ----
  const r2 = correr(`${FIXTURE}
create temp table _r (clave text, valor text);

-- D: una venta anulada (sin comprobante), y una proforma vigente para convertir
select ${VENTA_SIN_COMPROBANTE} as d \\gset
${ITEM_DE("d")}
select retail.anular_venta(:'d', 'prueba automatizada', ${ITEMS_ANULACION("d")}) as _anul_d \\gset
select retail.crear_proforma(:'ubic', '[{"descripcion":"prueba","cantidad":1,"precio_unitario":84.75}]'::jsonb, 84.75, 15.25, 100.00) as prof \\gset
select siguiente_numero as sig_antes from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'boleta' \\gset
select set_config('t.d', :'d', true) as _g1 \\gset
select set_config('t.ubic', :'ubic', true) as _g2 \\gset
select set_config('t.prof', :'prof', true) as _g3 \\gset

-- 1) por la RPC de siempre
do $$ begin
  begin
    perform retail.emitir_comprobante(current_setting('t.ubic')::uuid, 'boleta', 84.75, 15.25, 100.00, current_setting('t.d')::uuid);
    insert into _r values ('rpc_error', '(no falló)');
  exception when others then
    insert into _r values ('rpc_error', sqlerrm);
  end;
end $$;

-- 2) por un insert directo en la tabla (cualquier camino, no solo la RPC)
do $$ begin
  begin
    insert into retail.comprobantes (venta_id, ubicacion_id, tipo, serie, numero, subtotal, igv, total)
      values (current_setting('t.d')::uuid, current_setting('t.ubic')::uuid, 'boleta', 'ZZ99', 1, 84.75, 15.25, 100.00);
    insert into _r values ('directo_error', '(no falló)');
  exception when others then
    insert into _r values ('directo_error', sqlerrm);
  end;
end $$;

-- 3) convirtiendo una proforma sobre esa venta
do $$ begin
  begin
    perform retail.convertir_proforma_a_comprobante(current_setting('t.prof')::uuid, 'boleta', current_setting('t.d')::uuid);
    insert into _r values ('proforma_error', '(no falló)');
  exception when others then
    insert into _r values ('proforma_error', sqlerrm);
  end;
end $$;

select 'rpc_error|' || valor from _r where clave = 'rpc_error';
select 'directo_error|' || valor from _r where clave = 'directo_error';
select 'proforma_error|' || valor from _r where clave = 'proforma_error';
select 'comprobantes_de_la_anulada|' || count(*) from retail.comprobantes where venta_id = :'d';
select 'correlativo_intacto|' || (siguiente_numero = :'sig_antes')::text from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'boleta';
select 'proforma|' || estado from retail.proformas where id = :'prof';
rollback;
`);

  if (!r2.ok) {
    console.log("✗ el escenario de los rechazos falló antes de poder probar nada");
    console.log(`    ${r2.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l2 = r2.salida.split("\n");
  const dato2 = (clave) => l2.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar(
    "emitir un comprobante sobre una venta ANULADA se niega, y lo dice",
    (dato2("rpc_error") ?? "").includes("está anulada"),
    r2.salida
  );
  esperar(
    "un insert directo en comprobantes sobre una venta anulada también se niega: el candado está en la tabla",
    (dato2("directo_error") ?? "").includes("está anulada"),
    r2.salida
  );
  esperar(
    "convertir una proforma sobre una venta anulada se niega, y la proforma sigue vigente",
    (dato2("proforma_error") ?? "").includes("está anulada") && dato2("proforma") === "vigente",
    r2.salida
  );
  esperar("ninguno de los tres intentos deja un comprobante sobre la venta anulada", dato2("comprobantes_de_la_anulada") === "0", r2.salida);
  esperar("y ninguno quema un número del correlativo", dato2("correlativo_intacto") === "true", r2.salida);

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
