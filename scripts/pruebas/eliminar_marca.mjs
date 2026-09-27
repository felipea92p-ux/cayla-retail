#!/usr/bin/env node
/**
 * Prueba de Catálogo ▸ Marcas ▸ Eliminar (`20260926213000_eliminar_marca.sql`).
 *
 * QUÉ CUBRE
 *   · una marca sin ningún producto se elimina, con sus vínculos con proveedores (todos), y el proveedor sigue existiendo;
 *   · una marca con productos NO se elimina — activos ni descontinuados —, dice cuántos, y no se lleva nada consigo
 *     (la marca y su vínculo siguen ahí);
 *   · el caso «Cayla 2»: un producto puesto en una marca por error impide eliminarla; en cuanto se le corrige la marca, se elimina;
 *   · la base misma impide dejar un producto huérfano aunque alguien se salte la función (llave `productos_marca_fk`);
 *   · el nombre queda libre: se puede crear otra marca con el mismo nombre;
 *   · permisos: sin catálogo no se elimina, y `anon` ni siquiera puede llamarla;
 *   · una marca que ya no existe lo dice.
 *
 * CÓMO. Igual que `editar_marca.mjs`: cada escenario en su transacción con ROLLBACK y sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:eliminar-marca    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const NADIE = "99999999-9999-4999-8999-000000000009"; // sesión sin persona en retail

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const sesion = (id) => `set local request.jwt.claim.sub = '${id}';
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;
const AYUDAS = `
create function pg_temp.existe(p_marca uuid) returns text language sql as $f$
  select (select count(*) from retail.marcas where id = p_marca) || '|' || (select count(*) from retail.marca_proveedores where marca_id = p_marca);
$f$;
`;

/** La marca CAYLA (con productos, la trae CAYLA SAC) y una marca de prueba «Lirio» sin productos que trae Textiles Andina. */
const ESCENA = `
begin;
${INTENTO}
${AYUDAS}
${sesion(FELIPE)}
select id as cayla from retail.marcas where nombre = 'CAYLA' \\gset
select id as csac from retail.proveedores where nombre = 'CAYLA SAC' \\gset
select id as andina from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as sur from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select retail.crear_marca('Lirio', :'andina') as lirio \\gset
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Una marca sin productos se elimina, con TODOS sus vínculos; los proveedores no se tocan. Devuelve el nombre.
{
  const r = correr(`${ESCENA}
select retail.editar_marca(:'lirio', 'Lirio', array[:'sur']::uuid[]) as _e \\gset
select pg_temp.existe(:'lirio');
select retail.eliminar_marca(:'lirio');
select pg_temp.existe(:'lirio');
select count(*) from retail.proveedores where id in (:'andina', :'sur');`);
  const [antes, devuelto, despues, proveedoresVivos] = lineas(r);
  esperar("antes de eliminar: la marca y sus dos vínculos existen", r.ok && antes === "1|2", r);
  esperar("eliminar devuelve el nombre de la marca eliminada", r.ok && devuelto === "Lirio", r);
  esperar("después no queda la marca ni ningún vínculo suyo", r.ok && despues === "0|0", r);
  esperar("los proveedores siguen existiendo: solo se borró la marca", r.ok && proveedoresVivos === "2", r);
}

// 2. Una marca con productos activos no se elimina: lo dice con el nombre y cuántos, y no se lleva nada consigo.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.eliminar_marca(%L)', :'cayla'));
select pg_temp.existe(:'cayla');`);
  const [mensaje, sigue] = lineas(r);
  esperar("eliminar una marca con productos se rechaza, con su nombre y cuántos", r.ok && /^No se puede eliminar «CAYLA»: \d+ producto\(s\) la tienen/.test(mensaje), r);
  esperar("y sugiere la salida: cambiarles la marca, o desactivarla", r.ok && /Cámbiales la marca en Productos/.test(mensaje) && /desactívala/.test(mensaje), r);
  esperar("todo o nada: la marca y su vínculo con el proveedor siguen ahí", r.ok && sigue === "1|1", r);
}

// 3. Los productos descontinuados también cuentan: siguen citando la marca en su ficha y en las ventas hechas.
{
  const r = correr(`${ESCENA}
update retail.productos set estado = 'descontinuado' where marca_id = :'cayla';
select pg_temp.intento(format('select retail.eliminar_marca(%L)', :'cayla'));
select pg_temp.existe(:'cayla');`);
  const [mensaje, sigue] = lineas(r);
  esperar("con todos sus productos descontinuados la marca tampoco se elimina", r.ok && mensaje.startsWith("No se puede eliminar «CAYLA»"), r);
  esperar("y sigue existiendo", r.ok && sigue === "1|1", r);
}

// 4. El caso «Cayla 2»: un producto puesto en una marca por error. Mientras lo tenga, no se elimina; corregido, sí.
{
  const r = correr(`${ESCENA}
select retail.crear_marca('Cayla 2', :'csac') as error_ \\gset
select id as producto from retail.productos where marca_id = :'cayla' order by created_at limit 1 \\gset
update retail.productos set marca_id = :'error_' where id = :'producto';
select pg_temp.intento(format('select retail.eliminar_marca(%L)', :'error_'));
update retail.productos set marca_id = :'cayla' where id = :'producto';
select retail.eliminar_marca(:'error_');
select pg_temp.existe(:'error_');
select marca_id = :'cayla' from retail.productos where id = :'producto';`);
  const [conProducto, eliminada, intacto, productoEnCayla] = lineas(r);
  esperar("mientras un producto tiene la marca por error, no se elimina", r.ok && /^No se puede eliminar «Cayla 2»: 1 producto\(s\)/.test(conProducto), r);
  esperar("corregida la marca del producto, se elimina", r.ok && eliminada === "Cayla 2", r);
  esperar("y no queda ni la marca ni su vínculo", r.ok && intacto === "0|0", r);
  esperar("el producto quedó en la marca correcta", r.ok && productoEnCayla === "t", r);
}

// 5. La base misma lo impide: aunque alguien se salte la función, no queda un producto huérfano (la llave lo frena).
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('delete from retail.marca_proveedores where marca_id = %L', :'cayla'));
select pg_temp.intento(format('delete from retail.marcas where id = %L', :'cayla'));
select pg_temp.existe(:'cayla');`);
  const [vinculo, marca, sigue] = lineas(r);
  esperar("un DELETE directo del vínculo de una marca con productos lo frena la llave", r.ok && /violates foreign key constraint/.test(vinculo), r);
  esperar("un DELETE directo de la marca con productos también", r.ok && /violates foreign key constraint/.test(marca), r);
  esperar("y la marca sigue con su vínculo", r.ok && sigue === "1|1", r);
}

// 6. El nombre queda libre: eliminada la marca, se puede crear otra con el mismo nombre.
{
  const r = correr(`${ESCENA}
select retail.eliminar_marca(:'lirio') as _e \\gset
select pg_temp.intento(format('select retail.crear_marca(%L, %L)', 'Lirio', :'sur'));
select count(*) from retail.marcas where nombre = 'Lirio';`);
  const [creada, cuantas] = lineas(r);
  esperar("crear otra marca con el mismo nombre ya no dice «existe pero está desactivada»", r.ok && creada === "SIN_ERROR" && cuantas === "1", r);
}

// 7. Permisos.
{
  const r = correr(`${ESCENA}
${sesion(NADIE)}
select pg_temp.intento(format('select retail.eliminar_marca(%L)', :'lirio'));
${sesion(FELIPE)}
select pg_temp.existe(:'lirio');
set local role anon;
select pg_temp.intento(format('select retail.eliminar_marca(%L)', :'lirio'));`);
  const [sinPersona, sigue, anon] = lineas(r);
  esperar("una sesión sin catálogo no elimina marcas", r.ok && sinPersona === "No tienes permiso para eliminar marcas." && sigue === "1|1", r);
  esperar("anon ni siquiera puede llamar la función", r.ok && anon.startsWith("permission denied for function eliminar_marca"), r);
}

// 8. Una marca que ya no existe (otra persona la eliminó mientras esta pantalla seguía abierta).
{
  const r = correr(`${ESCENA}
select retail.eliminar_marca(:'lirio') as _e \\gset
select pg_temp.intento(format('select retail.eliminar_marca(%L)', :'lirio'));
select pg_temp.intento(format('select retail.eliminar_marca(%L)', gen_random_uuid()));`);
  const [otraVez, fantasma] = lineas(r);
  esperar("eliminar dos veces la misma marca: la segunda lo dice", r.ok && otraVez === "Esa marca ya no existe. Recarga la pantalla.", r);
  esperar("eliminar una marca que nunca existió, igual", r.ok && fantasma === "Esa marca ya no existe. Recarga la pantalla.", r);
}

console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
