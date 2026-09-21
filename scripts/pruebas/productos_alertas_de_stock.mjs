#!/usr/bin/env node
/**
 * Prueba de integración de los contadores y filtros de stock de `/productos`
 * (`retail.fn_productos` y `retail.fn_productos_resumen`; migración 20260922120000) contra el Postgres LOCAL.
 *
 * Lo que verifica, y que ninguna prueba de TypeScript puede:
 *   · una prenda DESCONTINUADA no cuenta como «sin stock», «stock bajo» ni «para pedir» — y por tanto
 *     tampoco sale en «A quién pedirle» (pantalla:productos, tarea #1). Sigue listada: se puede ver,
 *     reactivar y consultar; solo deja de disparar alertas;
 *   · «stock bajo» y «sin stock» no se solapan: una activa con mínimo y 0 unidades es «sin stock», no las dos;
 *   · lo que dice cada contador del resumen es lo mismo que devuelve la lista con ese filtro, SIN filtros y
 *     también con estado, color y precio (18 combinaciones): el número de arriba y las tarjetas de abajo no
 *     pueden contar distinto. Una revisión adversarial mostró que con la comparación sin filtros solamente,
 *     quitar el filtro de color o de estado del resumen dejaba la prueba en verde;
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
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

// Escenario: nueve productos ZZ con todas las combinaciones que importan (estado × stock × ventas × mínimo).
//   P1 activo,        stock 0                      → «sin stock»
//   P2 descontinuado, stock 0                      → NO es «sin stock»
//   P3 descontinuado, stock 2, sin ventas          → listado, sin alertas
//   P4 activo,        stock 1, vendió 30 en 30 días → «para pedir»
//   P5 descontinuado, stock 1, vendió 30 en 30 días → NO es «para pedir» (liquidación)
//   P6 activo,        UNA variante con stock en DOS sedes → cuenta 1 variante, no 2
//   P7 activo,        mínimo 5, stock 2            → «stock bajo»
//   P8 descontinuado, mínimo 5, stock 2            → NO es «stock bajo»
//   P9 activo,        mínimo 5, stock 0            → «sin stock» y NADA MÁS (no es también «stock bajo»)
const ESCENARIO = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru  from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset

-- Línea base: lo que ya había antes de crear nada.
select total_productos as b_prod, total_variantes as b_var, stock_bajo as b_bajo, sin_stock as b_sin, reponer_de_proveedor as b_rep
  from retail.fn_productos_resumen() \\gset
select total_productos as b_desc from retail.fn_productos_resumen(p_estado => 'descontinuado') \\gset

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
select pg_temp.prod('P9', 'activo', 5) as p9 \\gset
select pg_temp.var(:'p9', 'ZZ-P9-A') as v9 \\gset

-- Resumen: diferencias contra la línea base.
select 'D|productos|' || (total_productos - :b_prod) || E'\\nD|variantes|' || (total_variantes - :b_var)
    || E'\\nD|bajo|' || (stock_bajo - :b_bajo) || E'\\nD|sin_stock|' || (sin_stock - :b_sin)
    || E'\\nD|reponer|' || (reponer_de_proveedor - :b_rep)
  from retail.fn_productos_resumen();

-- Coherencia número ↔ lista sin filtros: cuántos productos distintos devuelve cada filtro, contra el resumen ENTERO.
select 'T|bajo|' || (select count(distinct producto_id) from retail.fn_productos(p_stock => 'bajo', p_por_pagina => 100))
    || E'\\nT|sin_stock|' || (select count(distinct producto_id) from retail.fn_productos(p_stock => 'sin_stock', p_por_pagina => 100))
    || E'\\nT|reponer|' || (select count(distinct producto_id) from retail.fn_productos(p_stock => 'reponer', p_por_pagina => 100))
    || E'\\nR|bajo|' || stock_bajo || E'\\nR|sin_stock|' || sin_stock || E'\\nR|reponer|' || reponer_de_proveedor
  from retail.fn_productos_resumen();

-- Coherencia número ↔ lista CON filtros: 3 estados × 3 rangos de precio × 2 colores = 18 combinaciones. Para cada una, el
-- resumen (productos, variantes y las tres alertas) debe decir lo mismo que la lista con y sin el filtro de stock.
create function pg_temp.desajustes() returns text language plpgsql as $$
declare
  f record; r record; c text; n int := 0; combos int := 0; alertas int := 0; det text := '';
  l_prod bigint; l_var bigint; l_bajo bigint; l_sin bigint; l_rep bigint;
  colores text[] := array[null, (select codigo from retail.colores where activo order by codigo limit 1)];
begin
  for f in
    select e, pm, px from (values (null::text), ('activo'), ('descontinuado')) a(e)
      cross join (values (null::numeric, null::numeric), (0::numeric, 50::numeric), (90::numeric, null::numeric)) d(pm, px)
  loop
    foreach c in array colores loop
      combos := combos + 1;
      select * into r from retail.fn_productos_resumen(p_estado => f.e, p_color_codigo => c, p_precio_min => f.pm, p_precio_max => f.px);
      select count(distinct producto_id), count(distinct variante_id) into l_prod, l_var
        from retail.fn_productos(p_estado => f.e, p_color_codigo => c, p_precio_min => f.pm, p_precio_max => f.px, p_por_pagina => 100);
      select count(distinct producto_id) into l_bajo
        from retail.fn_productos(p_estado => f.e, p_color_codigo => c, p_precio_min => f.pm, p_precio_max => f.px, p_stock => 'bajo', p_por_pagina => 100);
      select count(distinct producto_id) into l_sin
        from retail.fn_productos(p_estado => f.e, p_color_codigo => c, p_precio_min => f.pm, p_precio_max => f.px, p_stock => 'sin_stock', p_por_pagina => 100);
      select count(distinct producto_id) into l_rep
        from retail.fn_productos(p_estado => f.e, p_color_codigo => c, p_precio_min => f.pm, p_precio_max => f.px, p_stock => 'reponer', p_por_pagina => 100);
      alertas := alertas + r.stock_bajo + r.sin_stock + r.reponer_de_proveedor;
      if (r.total_productos, r.total_variantes, r.stock_bajo, r.sin_stock, r.reponer_de_proveedor)
         is distinct from (l_prod, l_var, l_bajo, l_sin, l_rep) then
        n := n + 1;
        det := det || format('[estado=%s color=%s precio=%s..%s resumen=%s/%s/%s/%s/%s lista=%s/%s/%s/%s/%s] ',
          f.e, c, f.pm, f.px, r.total_productos, r.total_variantes, r.stock_bajo, r.sin_stock, r.reponer_de_proveedor, l_prod, l_var, l_bajo, l_sin, l_rep);
      end if;
    end loop;
  end loop;
  return combos || '|' || n || '|' || alertas || '|' || left(det, 300);
end $$;
select 'M|' || pg_temp.desajustes();

-- Las descontinuadas siguen listadas (se pueden ver y reactivar) y su bandera de reposición es falsa.
select distinct 'L|' || referencia || '|' || estado || '|' || reponer_de_proveedor
  from retail.fn_productos(p_busqueda => 'ZZ P', p_por_pagina => 100)
  order by 1;

-- P9 (activa, mínimo 5, en 0) sale en la lista «sin stock» y NO en la de «stock bajo».
select 'P|en_sin_stock|' || (select count(*) from retail.fn_productos(p_busqueda => 'ZZ P9', p_stock => 'sin_stock', p_por_pagina => 100))
    || E'\\nP|en_bajo|' || (select count(*) from retail.fn_productos(p_busqueda => 'ZZ P9', p_stock => 'bajo', p_por_pagina => 100));

-- Pedir el resumen solo de las descontinuadas: cero alertas, pero sí cuenta los cuatro productos.
select 'A|alertas|' || (stock_bajo + sin_stock + reponer_de_proveedor) || E'\\nA|productos|' || (total_productos - :b_desc)
  from retail.fn_productos_resumen(p_estado => 'descontinuado');

-- Combinación sin sentido pero documentada: descontinuadas + alerta de stock = ninguna fila.
select 'X|descontinuadas_sin_stock|' || count(*) from retail.fn_productos(p_estado => 'descontinuado', p_stock => 'sin_stock', p_por_pagina => 100);
rollback;
`;

const salida = psql(ESCENARIO);
const dato = { D: {}, T: {}, R: {}, X: {}, L: {}, P: {}, A: {}, M: {} };
for (const linea of salida.split("\n")) {
  const [tipo, clave, valor, extra, resto] = linea.split("|");
  if (!dato[tipo]) continue;
  if (tipo === "L") dato.L[clave] = { estado: valor, reponer: extra === "true" };
  else if (tipo === "M") dato.M = { combos: Number(clave), desajustes: Number(valor), alertas: Number(extra), detalle: resto ?? "" };
  else dato[tipo][clave] = Number(valor);
}

let fallos = 0;
function afirma(nombre, obtenido, esperado) {
  const ok = obtenido === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}${ok ? "" : ` — esperaba ${esperado}, obtuvo ${obtenido}`}`);
}

console.log("Resumen (diferencias contra la línea base)");
afirma("9 productos nuevos cuentan como 9 productos", dato.D.productos, 9);
afirma("«sin stock»: P1 y P9 sí; P2 (descontinuado) no", dato.D.sin_stock, 2);
afirma("«stock bajo»: P7 sí; P8 (descontinuado) no; P9 (en 0) no", dato.D.bajo, 1);
afirma("«para pedir»: P4 sí; P5 (descontinuado, con ventas) no", dato.D.reponer, 1);
afirma("«N variantes»: 9 variantes reales, aunque P6 tenga stock en dos sedes", dato.D.variantes, 9);

console.log("El número de arriba es lo que muestra la lista de abajo");
for (const k of ["bajo", "sin_stock", "reponer"]) afirma(`contador «${k}» = tarjetas con ese filtro`, dato.T[k], dato.R[k]);
afirma("18 combinaciones de filtros (estado × precio × color) comparadas", dato.M.combos, 18);
afirma(`en ninguna combinación el resumen difiere de la lista${dato.M.detalle ? ` — ${dato.M.detalle}` : ""}`, dato.M.desajustes, 0);
afirma("la comparación no es vacua: hubo alertas que comparar", dato.M.alertas > 0, true);

console.log("«Stock bajo» y «sin stock» no se solapan");
afirma("P9 (activa, mínimo 5, en 0) está en la lista «sin stock»", dato.P.en_sin_stock, 1);
afirma("P9 no está en la lista «stock bajo»", dato.P.en_bajo, 0);

console.log("Las descontinuadas siguen a la vista, sin alertas");
// El trigger de nombres (`fn_titulo_referencia`) escribe «ZZ P2» como «Zz P2»: se busca tal como queda guardado.
for (const ref of ["Zz P2", "Zz P3", "Zz P5", "Zz P8"]) {
  afirma(`${ref} sigue listada como descontinuada`, dato.L[ref]?.estado, "descontinuado");
  afirma(`${ref} no pide reposición`, dato.L[ref]?.reponer, false);
}
afirma("Zz P4 (activa, con ventas y poco stock) sí pide reposición", dato.L["Zz P4"]?.reponer, true);
afirma("el resumen de las descontinuadas: cero alertas", dato.A.alertas, 0);
afirma("el resumen de las descontinuadas cuenta sus 4 productos nuevos", dato.A.productos, 4);
afirma("descontinuadas + «sin stock» = ninguna fila", dato.X.descontinuadas_sin_stock, 0);

if (fallos > 0) console.log(`\n--- salida cruda del escenario ---\n${salida}`);
console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} verificación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
