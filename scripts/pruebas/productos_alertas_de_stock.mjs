#!/usr/bin/env node
/**
 * Prueba de integración de los contadores y filtros de stock de `/productos`
 * (`retail.fn_productos` y `retail.fn_productos_resumen`; migraciones 20260922120000 y 20260922121000)
 * contra el Postgres LOCAL.
 *
 * Lo que verifica, y que ninguna prueba de TypeScript puede:
 *   · una prenda DESCONTINUADA no cuenta como «sin stock», «stock bajo» ni «para pedir» — y por tanto
 *     tampoco sale en «A quién pedirle» (pantalla:productos, tarea #1). Sigue listada: se puede ver,
 *     reactivar y consultar; solo deja de disparar alertas.
 *   · lo que dice cada contador del resumen es lo mismo que devuelve la lista con ese filtro
 *     (el número de arriba y las tarjetas de abajo no pueden contar distinto);
 *   · «N variantes» cuenta variantes, no filas de stock: una variante con stock en dos sedes es UNA
 *     (pantalla:productos, tarea #3; producción mostraba 190 con 163 variantes reales).
 *
 * Mide DIFERENCIAS contra una línea base tomada dentro de la misma transacción, así no depende de
 * cuánto haya sembrado el Postgres local. Mismo mecanismo que `fn_resumen_comparacion.mjs`:
 * `docker exec … psql` y `ROLLBACK` SIEMPRE — no deja nada en el Postgres compartido.
 *
 * USO
 *   pnpm pruebas:productos-alertas-de-stock   → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTENEDOR_LOCAL,
      "psql",
      "-q",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-F",
      "|",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

// Escenario: ocho productos ZZ con todas las combinaciones que importan (estado × stock × ventas).
//   P1 activo,        stock 0                      → «sin stock»
//   P2 descontinuado, stock 0                      → NO es «sin stock»
//   P3 descontinuado, stock 2, sin ventas          → listado, sin alertas
//   P4 activo,        stock 1, vendió 30 en 30 días → «para pedir»
//   P5 descontinuado, stock 1, vendió 30 en 30 días → NO es «para pedir» (liquidación)
//   P6 activo,        UNA variante con stock en DOS sedes → cuenta 1 variante, no 2
//   P7 activo,        mínimo 5, stock 2            → «stock bajo»
//   P8 descontinuado, mínimo 5, stock 2            → NO es «stock bajo»
const ESCENARIO = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru  from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset

-- Línea base: lo que ya había antes de crear nada.
select total_productos as b_prod, total_variantes as b_var, stock_bajo as b_bajo, sin_stock as b_sin, reponer_de_proveedor as b_rep
  from retail.fn_productos_resumen() \\gset

create function pg_temp.prod(ref text, estado text, minimo int default null) returns uuid language sql as $$
  insert into retail.productos (referencia, estado, stock_minimo, marca_id, proveedor_id)
    select 'ZZ ' || ref, estado, minimo, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id
$$;
create function pg_temp.var(p uuid, sku text) returns uuid language sql as $$
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, 40, true) returning id
$$;
create function pg_temp.saldo(v uuid, ubic uuid, cant int) returns void language sql as $$
  insert into retail.stock (variante_id, ubicacion_id, cantidad) values (v, ubic, cant)
$$;
-- 30 unidades vendidas ayer: demanda de 1 por día, la que enciende «para pedir» cuando queda poco.
create function pg_temp.vendio30(v uuid, ubic uuid) returns void language plpgsql as $$
declare vt uuid; li uuid;
begin
  insert into retail.ventas (ubicacion_id, estado) values (ubic, 'completada') returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
    values (vt, v, 30, 100, 0, 40) returning id into li;
  insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
    values (v, ubic, 'salida', 30, 'venta', li, now() - interval '1 day');
end $$;

select pg_temp.prod('P1', 'activo') as p1 \\gset
select pg_temp.var(:'p1', 'ZZ-P1-A') as v1 \\gset
select pg_temp.prod('P2', 'descontinuado') as p2 \\gset
select pg_temp.var(:'p2', 'ZZ-P2-A') as v2 \\gset
select pg_temp.prod('P3', 'descontinuado') as p3 \\gset
select pg_temp.var(:'p3', 'ZZ-P3-A') as v3 \\gset
select pg_temp.saldo(:'v3', :'lima', 2) as _s3 \\gset
select pg_temp.prod('P4', 'activo') as p4 \\gset
select pg_temp.var(:'p4', 'ZZ-P4-A') as v4 \\gset
select pg_temp.saldo(:'v4', :'lima', 1) as _s4 \\gset
select pg_temp.vendio30(:'v4', :'lima') as _m4 \\gset
select pg_temp.prod('P5', 'descontinuado') as p5 \\gset
select pg_temp.var(:'p5', 'ZZ-P5-A') as v5 \\gset
select pg_temp.saldo(:'v5', :'lima', 1) as _s5 \\gset
select pg_temp.vendio30(:'v5', :'lima') as _m5 \\gset
select pg_temp.prod('P6', 'activo') as p6 \\gset
select pg_temp.var(:'p6', 'ZZ-P6-A') as v6 \\gset
select pg_temp.saldo(:'v6', :'lima', 3) as _s6a \\gset
select pg_temp.saldo(:'v6', :'tru', 4) as _s6b \\gset
select pg_temp.prod('P7', 'activo', 5) as p7 \\gset
select pg_temp.var(:'p7', 'ZZ-P7-A') as v7 \\gset
select pg_temp.saldo(:'v7', :'lima', 2) as _s7 \\gset
select pg_temp.prod('P8', 'descontinuado', 5) as p8 \\gset
select pg_temp.var(:'p8', 'ZZ-P8-A') as v8 \\gset
select pg_temp.saldo(:'v8', :'lima', 2) as _s8 \\gset

-- Resumen: diferencias contra la línea base.
select 'D|productos|' || (total_productos - :b_prod) || E'\\nD|variantes|' || (total_variantes - :b_var)
    || E'\\nD|bajo|' || (stock_bajo - :b_bajo) || E'\\nD|sin_stock|' || (sin_stock - :b_sin)
    || E'\\nD|reponer|' || (reponer_de_proveedor - :b_rep)
  from retail.fn_productos_resumen();

-- Coherencia número ↔ lista: cuántos productos distintos devuelve cada filtro, contra el resumen ENTERO.
select 'T|bajo|' || (select count(distinct producto_id) from retail.fn_productos(p_stock => 'bajo', p_por_pagina => 100))
    || E'\\nT|sin_stock|' || (select count(distinct producto_id) from retail.fn_productos(p_stock => 'sin_stock', p_por_pagina => 100))
    || E'\\nT|reponer|' || (select count(distinct producto_id) from retail.fn_productos(p_stock => 'reponer', p_por_pagina => 100))
    || E'\\nR|bajo|' || stock_bajo || E'\\nR|sin_stock|' || sin_stock || E'\\nR|reponer|' || reponer_de_proveedor
  from retail.fn_productos_resumen();

-- Las descontinuadas siguen listadas (se pueden ver y reactivar) y su bandera de reposición es falsa.
select distinct 'L|' || referencia || '|' || estado || '|' || reponer_de_proveedor
  from retail.fn_productos(p_busqueda => 'ZZ P', p_por_pagina => 100)
  order by 1;

-- Combinación sin sentido pero documentada: descontinuadas + alerta de stock = ninguna fila.
select 'X|descontinuadas_sin_stock|' || count(*) from retail.fn_productos(p_estado => 'descontinuado', p_stock => 'sin_stock', p_por_pagina => 100);
rollback;
`;

const salida = psql(ESCENARIO);
const dato = { D: {}, T: {}, R: {}, X: {}, L: {} };
for (const linea of salida.split("\n")) {
  const [tipo, clave, valor, extra] = linea.split("|");
  if (!dato[tipo]) continue;
  if (tipo === "L")
    dato.L[clave] = { estado: valor, reponer: extra === "true" };
  else dato[tipo][clave] = Number(valor);
}

let fallos = 0;
function afirma(nombre, obtenido, esperado) {
  const ok = obtenido === esperado;
  if (!ok) fallos++;
  console.log(
    `${ok ? "✓" : "✗"} ${nombre}${ok ? "" : ` — esperaba ${esperado}, obtuvo ${obtenido}`}`,
  );
}

console.log("Resumen (diferencias contra la línea base)");
afirma("8 productos nuevos cuentan como 8 productos", dato.D.productos, 8);
afirma("«sin stock»: P1 sí; P2 (descontinuado) no", dato.D.sin_stock, 1);
afirma("«stock bajo»: P7 sí; P8 (descontinuado) no", dato.D.bajo, 1);
afirma(
  "«para pedir»: P4 sí; P5 (descontinuado, con ventas) no",
  dato.D.reponer,
  1,
);
afirma(
  "«N variantes»: 8 variantes reales, aunque P6 tenga stock en dos sedes",
  dato.D.variantes,
  8,
);

console.log("El número de arriba es lo que muestra la lista de abajo");
for (const k of ["bajo", "sin_stock", "reponer"])
  afirma(`contador «${k}» = tarjetas con ese filtro`, dato.T[k], dato.R[k]);

console.log("Las descontinuadas siguen a la vista, sin alertas");
// El trigger de nombres (`fn_titulo_referencia`) escribe «ZZ P2» como «Zz P2»: se busca tal como queda guardado.
for (const ref of ["Zz P2", "Zz P3", "Zz P5", "Zz P8"]) {
  afirma(
    `${ref} sigue listada como descontinuada`,
    dato.L[ref]?.estado,
    "descontinuado",
  );
  afirma(`${ref} no pide reposición`, dato.L[ref]?.reponer, false);
}
afirma(
  "Zz P4 (activa, con ventas y poco stock) sí pide reposición",
  dato.L["Zz P4"]?.reponer,
  true,
);
afirma(
  "descontinuadas + «sin stock» = ninguna fila",
  dato.X.descontinuadas_sin_stock,
  0,
);

if (fallos > 0) console.log(`\n--- salida cruda del escenario ---\n${salida}`);
console.log(
  fallos === 0 ? "\nTodo en orden." : `\n${fallos} verificación(es) fallaron.`,
);
process.exit(fallos === 0 ? 0 : 1);
