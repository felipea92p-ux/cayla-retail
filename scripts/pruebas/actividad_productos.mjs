#!/usr/bin/env node
/**
 * Prueba de ADR-0207, «Actualización 2026-10-02», etapa Productos (`20261002234500_actividad_productos.sql`).
 *
 * QUÉ CUBRE
 *   · Crear un producto con su stock: UNA línea en Productos («creó «…» con 2 variantes … · 3 prendas de stock
 *     inicial»), en la sede de la operación, y ninguna en Existencias;
 *   · un guardado de una prenda que cambia precio y categoría: UNA línea con los dos cambios y su antes → después;
 *   · el costo se anota SIN montos (solo lo ve quien ve el dinero, 20260923193700);
 *   · un cambio en bloque: «asignó la temporada … a 2 productos»; descontinuar: «descontinuó «…»»;
 *   · el nombre también deja rastro (antes el historial no lo guardaba);
 *   · si anotar falla, el guardado sigue (principio 9); la web no puede anotar a mano.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK; `set constraints all immediate` dispara lo que en producción
 * corre al confirmar. Dentro de una transacción `now()` no cambia: cada escenario hace UN guardado.
 *
 * USO
 *   pnpm pruebas:actividad-productos    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', json_build_object('x-ubicacion', :'tru')::text, true) as _h \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda'
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'almacen_tienda');
-- Dos prendas del catálogo con variantes, y otra categoría para moverlas.
select id as p1, referencia as ref1, categoria_id as cat1 from retail.productos
 where estado = 'activo' and exists (select 1 from retail.variantes v where v.producto_id = productos.id) order by referencia limit 1 \\gset
select id as p2, referencia as ref2 from retail.productos
 where estado = 'activo' and id <> :'p1' and exists (select 1 from retail.variantes v where v.producto_id = productos.id) order by referencia limit 1 \\gset
select id as cat2, nombre as cat2_nombre from retail.categorias where activo and id <> :'cat1' order by nombre limit 1 \\gset
select id as v1, precio as v1_precio from retail.variantes where producto_id = :'p1' order by sku limit 1 \\gset
select coalesce(max(id), 0) as antes from retail.actividad \\gset
`;

const NUEVAS = `select coalesce(string_agg(modulo || ':' || accion, ',' order by id), '-') from retail.actividad where id > :antes;`;
const DESC = `select coalesce(string_agg(descripcion, ' // ' order by id), '-') from retail.actividad where id > :antes and modulo = 'productos';`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);

// 1. Crear con stock: una línea en Productos, en la sede de la operación, y nada en Existencias.
{
  const r = correr(`
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select t.id as t2 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id offset 1 limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select retail.crear_producto_con_stock_inicial('Blusa Actividad Alta', :'cat',
  jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 20, 'cantidad', 2),
                    jsonb_build_object('talla_id', :'t2', 'color_codigo', :'c1', 'precio', 59, 'costo', 20, 'cantidad', 1)),
  null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'tru', false) as nuevo \\gset
set constraints all immediate;
${NUEVAS}
select descripcion || '|' || (ubicacion_id = :'tru') || '|' || (persona_id = :'felipe') from retail.actividad where id > :antes and modulo = 'productos';`);
  const l = lineas(r);
  const [desc, enTru, esFelipe] = (l.at(-1) ?? "").split("|");
  esperar(
    "crear con stock deja UNA línea en Productos (variantes, precio, stock), en la sede de la operación, y ninguna en Existencias",
    l.at(-2) === "productos:producto_creado" && /^creó «Blusa Actividad Alta» \(.+\) con 2 variantes \(tallas .+ · color .+\) a S\/.59\.00 · 3 prendas de stock inicial$/.test(desc ?? "") &&
      enTru === "true" && esFelipe === "true",
    r,
  );
}

// 2. Un guardado de una prenda: precio y categoría en UNA línea, con antes → después.
{
  const r = correr(`
update retail.variantes set precio = 79 where id = :'v1';
update retail.productos set categoria_id = :'cat2' where id = :'p1';
set constraints all immediate;
${NUEVAS}
${DESC}
select :'cat2_nombre';`);
  const l = lineas(r);
  const desc = l.at(-2) ?? "";
  esperar(
    "precio y categoría de una prenda en un guardado: UNA línea «editó «…»: precio S/ … → S/ 79.00 y categoría … → …»",
    l.at(-3) === "productos:producto_editado" && desc.startsWith("editó «") && /precio S\/.\S+ → S\/.79\.00/.test(desc) && desc.includes(`→ ${l.at(-1)}`),
    r,
  );
}

// 3. El costo se anota sin montos.
{
  const r = correr(`
update retail.variantes set costo = coalesce(costo, 0) + 7.77 where id = :'v1';
set constraints all immediate;
${DESC}
select coalesce((select detalle::text from retail.actividad where id > :antes and modulo = 'productos' limit 1), '-');`);
  const l = lineas(r);
  esperar(
    "el costo se anota sin montos (ni en el texto ni en el detalle)",
    /^editó «.+»: el costo de 1 variante$/.test(l.at(-2) ?? "") && !(l.at(-1) ?? "").includes("7.77") && !(l.at(-2) ?? "").includes("S/"),
    r,
  );
}

// 4. En bloque: la misma temporada a dos prendas.
{
  const r = correr(`
update retail.productos set temporada = case when temporada = 'verano' then 'invierno' else 'verano' end where id = :'p1';
select temporada as t_nueva from retail.productos where id = :'p1' \\gset
update retail.productos set temporada = :'t_nueva' where id = :'p2';
set constraints all immediate;
${DESC}
select nombre from retail.temporadas where clave = :'t_nueva';`);
  const l = lineas(r);
  esperar("la misma temporada a dos prendas: «asignó la temporada … a 2 productos»", (l.at(-2) ?? "") === `asignó la temporada ${l.at(-1)} a 2 productos`, r);
}

// 5. Descontinuar una prenda.
{
  const r = correr(`
update retail.productos set estado = 'descontinuado' where id = :'p1';
set constraints all immediate;
${NUEVAS}
${DESC}
select :'ref1';`);
  const l = lineas(r);
  esperar("descontinuar: «descontinuó «…»»", l.at(-3) === "productos:producto_descontinuado" && l.at(-2) === `descontinuó «${l.at(-1)}»`, r);
}

// 6. El nombre deja rastro en el historial y en Actividad.
{
  const r = correr(`
update retail.productos set referencia = 'Blusa Nombre Nuevo' where id = :'p1';
set constraints all immediate;
select count(*) from retail.historial_producto_cambios where entidad_id = :'p1' and campo = 'referencia' and valor_nuevo = 'Blusa Nombre Nuevo';
${DESC}
select :'ref1';`);
  const l = lineas(r);
  esperar(
    "cambiar el nombre: queda en el historial y «editó «Blusa Nombre Nuevo»: nombre «…» → «Blusa Nombre Nuevo»»",
    l.at(-3) === "1" && l.at(-2) === `editó «Blusa Nombre Nuevo»: nombre «${l.at(-1)}» → «Blusa Nombre Nuevo»`,
    r,
  );
}

// 7. Si anotar falla, el guardado sigue.
{
  const r = correr(`
alter table retail.actividad add constraint prueba_siempre_falla check (false) not valid;
update retail.variantes set precio = 81 where id = :'v1';
set constraints all immediate;
select (select precio from retail.variantes where id = :'v1') || '|' || (select count(*) from retail.actividad where id > :antes);`);
  esperar("si el historial falla, el precio se guarda igual (y no queda línea)", lineas(r).at(-1) === "81.00|0", r);
}

// 8. La web no puede anotar a mano.
{
  const r = correr(`select has_function_privilege('authenticated', 'retail.fn_actividad_producto_cambios(uuid, text)', 'execute') || '|' ||
       has_function_privilege('authenticated', 'retail.fn_actividad_producto_creado(uuid, text)', 'execute');`);
  esperar("la web no puede anotar a mano", lineas(r).at(-1) === "false|false", r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
