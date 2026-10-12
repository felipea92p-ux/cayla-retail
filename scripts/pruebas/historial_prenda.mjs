#!/usr/bin/env node
/**
 * Prueba de ADR-0354 (`20261006180000_historial_de_la_prenda.sql`): el historial de una prenda anota lo que antes no.
 *
 * QUÉ CUBRE
 *   · poner y quitar una etiqueta deja UNA fila cada vez, con quién y en qué sede; volver a guardar las MISMAS etiquetas
 *     (lo que hace cada «Confirmar y guardar» de la ficha) no deja ninguna;
 *   · un color o una talla nuevos en una prenda que ya existía: fila `variante_nueva` con su color, talla y precio;
 *   · una foto agregada o quitada: fila `foto` con su URL; `agregar_foto_producto` (Existencias) deja UNA, no dos;
 *   · tejido y patrón dejan su fila;
 *   · lo que nace junto con la prenda (sus variantes, etiquetas y fotos del alta) NO es un cambio;
 *   · `fn_historial_prenda` devuelve los nombres ya resueltos (nunca un uuid), el nacimiento y quién;
 *   · Actividad dice la etiqueta por su nombre.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (como `actividad_productos.mjs`). Dentro de una transacción `now()` no
 * cambia: lo que se crea en el preludio «nace ahora», así que los escenarios usan prendas que ya existían.
 *
 * USO
 *   node scripts/pruebas/historial_prenda.mjs    → con la migración ya aplicada en el local
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
-- Una prenda que ya existía, con variantes.
select id as p1, categoria_id as cat1 from retail.productos
 where estado = 'activo' and exists (select 1 from retail.variantes v where v.producto_id = productos.id) order by referencia limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'p1' order by sku limit 1 \\gset
select id as e1, nombre as e1_nombre from retail.etiquetas where activo and estado = 'aprobado' order by nombre limit 1 \\gset
select coalesce(max(created_at), '-infinity') as hasta from retail.historial_producto_cambios \\gset
`;

// Las filas del ledger que dejó este escenario (todas comparten el `now()` de la transacción).
const FILAS = `select coalesce(string_agg(campo || ':' || coalesce(valor_anterior, '∅') || '→' || coalesce(valor_nuevo, '∅'), ',' order by campo, valor_nuevo), '-')
  from retail.historial_producto_cambios where created_at = now();`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);

// 1. Poner una etiqueta (como la ficha): una fila, con quién y la sede.
{
  const r = correr(`
delete from retail.variante_etiquetas where variante_id = :'v1';
select count(*) as n0 from retail.historial_producto_cambios where created_at = now() \\gset
select retail.actualizar_variantes_etiquetas(jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'etiqueta_ids', jsonb_build_array(:'e1'))));
select count(*) - :n0 || '|' || bool_and(usuario_id = :'felipe') || '|' || bool_and(ubicacion_id = :'tru') || '|' || min(valor_nuevo)
  from retail.historial_producto_cambios where created_at = now() and campo = 'etiqueta' and valor_nuevo is not null;
select :'e1';`);
  const l = lineas(r);
  const [n, conFelipe, enTru, valor] = (l.at(-2) ?? "").split("|");
  esperar("poner una etiqueta deja UNA fila, firmada y con la sede", n === "1" && conFelipe === "true" && enTru === "true" && valor === l.at(-1), r);
}

// 2. Volver a guardar las MISMAS etiquetas no anota nada (antes se borraban y se volvían a poner).
{
  const r = correr(`
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'e1') on conflict do nothing;
select count(*) as n0 from retail.historial_producto_cambios where created_at = now() \\gset
select retail.actualizar_variantes_etiquetas(jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'etiqueta_ids', jsonb_build_array(:'e1'))));
select count(*) - :n0 from retail.historial_producto_cambios where created_at = now();
select count(*) from retail.variante_etiquetas where variante_id = :'v1' and etiqueta_id = :'e1';`);
  const l = lineas(r);
  esperar("guardar las mismas etiquetas no deja filas y la etiqueta sigue puesta", l.at(-2) === "0" && l.at(-1) === "1", r);
}

// 3. Quitar la etiqueta: una fila con el antes.
{
  const r = correr(`
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'e1') on conflict do nothing;
select count(*) as n0 from retail.historial_producto_cambios where created_at = now() and campo = 'etiqueta' and valor_nuevo is null \\gset
select retail.actualizar_variantes_etiquetas(jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'etiqueta_ids', '[]'::jsonb)));
select count(*) - :n0 || '|' || min(valor_anterior) from retail.historial_producto_cambios where created_at = now() and campo = 'etiqueta' and valor_nuevo is null;
select :'e1';`);
  const l = lineas(r);
  const [n, antes] = (l.at(-2) ?? "").split("|");
  esperar("quitar una etiqueta deja UNA fila con lo que había", n === "1" && antes === l.at(-1), r);
}

// 4. Un color nuevo en una prenda que ya existía: `variante_nueva` con color, talla y precio.
{
  const r = correr(`
select t.id as t1, t.valor as t1_valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.id = :'v1' \\gset
select codigo as cn from retail.colores c where activo
   and not exists (select 1 from retail.variantes v where v.producto_id = :'p1' and v.color_codigo = c.codigo) order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio) values (:'p1', :'cn', :'t1', 88);
select valor_nuevo::jsonb ->> 'color' || '|' || (valor_nuevo::jsonb ->> 'talla') || '|' || (valor_nuevo::jsonb ->> 'precio')::numeric || '|' || (usuario_id = :'felipe')
  from retail.historial_producto_cambios where created_at = now() and campo = 'variante_nueva';
select :'cn' || '|' || :'t1_valor';`);
  const l = lineas(r);
  const [color, talla, precio, felipe] = (l.at(-2) ?? "").split("|");
  const [cn, tv] = (l.at(-1) ?? "").split("|");
  esperar("un color nuevo deja `variante_nueva` con su color, talla y precio, firmado", color === cn && talla === tv && Number(precio) === 88 && felipe === "true", r);
}

// 5. Fotos: agregar y quitar dejan su fila con la URL.
{
  const r = correr(`
insert into retail.producto_fotos (producto_id, url, orden, es_principal) values (:'p1', 'https://ejemplo/foto-historial.jpg', 9, false);
delete from retail.producto_fotos where producto_id = :'p1' and url = 'https://ejemplo/foto-historial.jpg';
${FILAS}`);
  esperar(
    "agregar y quitar una foto deja dos filas con su URL",
    (lineas(r).at(-1) ?? "").split(",").sort().join(",") === "foto:https://ejemplo/foto-historial.jpg→∅,foto:∅→https://ejemplo/foto-historial.jpg",
    r,
  );
}

// 6. Una fila 'agregada' que llega después de la del disparador (lo que hace `agregar_foto_producto`, ADR-0283) se descarta.
{
  const r = correr(`
insert into retail.producto_fotos (producto_id, url, orden, es_principal) values (:'p1', 'https://ejemplo/doble.jpg', 9, false);
insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('producto', :'p1', 'foto', null, 'agregada', :'felipe');
select count(*) || '|' || min(valor_nuevo) from retail.historial_producto_cambios where created_at = now() and campo = 'foto';`);
  esperar("la fila 'agregada' que repite una foto ya anotada se descarta: queda UNA, con la URL", lineas(r).at(-1) === "1|https://ejemplo/doble.jpg", r);
}

// 6b. Y si la base trae `agregar_foto_producto` (hoy solo en ramas), subir una foto con ella deja UNA fila.
if (!psql("select to_regprocedure('retail.agregar_foto_producto(uuid,text)') is not null;").includes("t")) {
  console.log("· (sin `agregar_foto_producto` en esta base: se salta 6b)");
} else {
  const r = correr(`
select p.id as psf from retail.productos p where not exists (select 1 from retail.producto_fotos f where f.producto_id = p.id)
   and exists (select 1 from retail.variantes v where v.producto_id = p.id) order by p.referencia limit 1 \\gset
select retail.agregar_foto_producto(:'psf', 'https://ejemplo.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/historial.jpg') is not null as _r \\gset
select count(*) || '|' || min(valor_nuevo) from retail.historial_producto_cambios where created_at = now() and campo = 'foto';`);
  esperar("subir la foto desde Existencias deja UNA fila (la del disparador, con la URL)", lineas(r).at(-1) === "1|https://ejemplo.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/historial.jpg", r);
}

// 7. Tejido y patrón.
{
  const r = correr(`
select id as tj from retail.tejidos where activo order by nombre limit 1 \\gset
update retail.productos set tejido_id = null where id = :'p1';
update retail.productos set tejido_id = :'tj' where id = :'p1';
select count(*) from retail.historial_producto_cambios where created_at = now() and campo = 'tejido_id' and valor_nuevo = :'tj';`);
  esperar("cambiar el tejido deja su fila", lineas(r).at(-1) === "1", r);
}

// 8. Lo que nace con la prenda no es un cambio.
{
  const r = correr(`
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 1
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select retail.crear_producto_con_stock_inicial('Blusa Historial Nace', :'cat',
  jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 20, 'cantidad', 1)),
  null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'tru', false) as nuevo \\gset
select id as vn from retail.variantes where producto_id = (select id from retail.productos where referencia = 'Blusa Historial Nace') limit 1 \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'vn', :'e1');
insert into retail.producto_fotos (producto_id, url, orden, es_principal)
  select id, 'https://ejemplo/nace.jpg', 0, true from retail.productos where referencia = 'Blusa Historial Nace';
select count(*) from retail.historial_producto_cambios h
 where h.created_at = now() and h.campo in ('etiqueta', 'variante_nueva', 'foto');`);
  esperar("las variantes, etiquetas y fotos del alta no se anotan como cambios", lineas(r).at(-1) === "0", r);
}

// 9. La lectura: nombres resueltos, nacimiento y quién.
{
  const r = correr(`
delete from retail.variante_etiquetas where variante_id = :'v1';
select retail.actualizar_variantes_etiquetas(jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'etiqueta_ids', jsonb_build_array(:'e1'))));
select nombre_nuevo || '|' || coalesce(usuario_nombre, '∅') || '|' || coalesce(sede, '∅') || '|' || coalesce(variante_talla, '∅')
  from retail.fn_historial_prenda(:'p1') where campo = 'etiqueta' and created_at = now();
select count(*) || '|' || bool_and(valor_nuevo::jsonb ? 'colores') from retail.fn_historial_prenda(:'p1') where campo = 'alta';
select count(*) from retail.fn_historial_prenda(:'p1')
 where coalesce(nombre_anterior, '') ~ '^[0-9a-f]{8}-' or coalesce(nombre_nuevo, '') ~ '^[0-9a-f]{8}-';
select :'e1_nombre';`);
  const l = lineas(r);
  const [nombre, quien, sede, talla] = (l.at(-4) ?? "").split("|");
  esperar(
    "fn_historial_prenda: la etiqueta por su nombre, con quién, la sede y la talla; una fila de nacimiento; ningún uuid como nombre",
    nombre === l.at(-1) && quien !== "∅" && sede === "Tienda Trujillo" && talla !== "∅" && l.at(-3) === "1|true" && l.at(-2) === "0",
    r,
  );
}

// 10. Actividad dice la etiqueta por su nombre.
{
  const r = correr(`
delete from retail.variante_etiquetas where variante_id = :'v1';
select coalesce(max(id), 0) as antes from retail.actividad \\gset
select retail.actualizar_variantes_etiquetas(jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'etiqueta_ids', jsonb_build_array(:'e1'))));
set constraints all immediate;
select coalesce(string_agg(descripcion, ' // '), '-') from retail.actividad where id > :antes and modulo = 'productos';
select :'e1_nombre';`);
  const l = lineas(r);
  esperar("Actividad: «editó «…»: etiquetas sin ella → «Nombre»»", (l.at(-2) ?? "").includes(`«${l.at(-1)}»`) && (l.at(-2) ?? "").startsWith("editó «"), r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
