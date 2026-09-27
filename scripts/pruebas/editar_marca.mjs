#!/usr/bin/env node
/**
 * Prueba de Catálogo ▸ Marcas ▸ Editar (`20260926150000_editar_marca.sql`).
 *
 * QUÉ CUBRE
 *   · renombrar (con los espacios limpios) y el choque con otra marca que solo difiere en tildes o mayúsculas;
 *   · cambiar el proveedor de una marca sin productos (sumar uno, quitar el otro) en un solo guardado;
 *   · un proveedor con productos no se quita — tampoco si sus productos están descontinuados —, y el nombre que venía en
 *     el mismo guardado NO se cambia (todo o nada);
 *   · una marca activa nunca queda sin proveedor;
 *   · un proveedor nuevo se registra en el mismo paso; si el guardado falla, el proveedor tampoco queda (no hay
 *     proveedor huérfano) — y registrarlo sigue pidiendo el módulo Proveedores;
 *   · un proveedor desactivado no se suma;
 *   · dos ediciones de la misma marca con la pantalla vieja no se pisan: cada una aplica solo lo que pidió;
 *   · permisos: sin catálogo no se edita, y `anon` ni siquiera puede llamarla.
 *
 * CÓMO. Igual que `cuenta_sellada.mjs`: cada escenario en su transacción con ROLLBACK y sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:editar-marca    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // edita catálogo, pero sin el módulo Proveedores
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
// Los proveedores de una marca, en orden, para leer las salidas.
const AYUDAS = `
create function pg_temp.provs(p_marca uuid) returns text language sql as $f$
  select coalesce(string_agg(p.nombre, ',' order by p.nombre), '-')
    from retail.marca_proveedores mp join retail.proveedores p on p.id = mp.proveedor_id where mp.marca_id = p_marca;
$f$;
create function pg_temp.nombre(p_marca uuid) returns text language sql as $f$
  select nombre from retail.marcas where id = p_marca;
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

// 1. Renombrar: los espacios se limpian y devuelve el nombre como quedó; otra marca con el mismo nombre (sin tildes ni
//    mayúsculas) choca, y cambiar solo mayúsculas de la propia no choca consigo misma.
{
  const r = correr(`${ESCENA}
select retail.editar_marca(:'lirio', '  Lirio   Blanco ') ->> 'nombre';
select pg_temp.nombre(:'lirio');
select pg_temp.intento(format('select retail.editar_marca(%L, %L)', :'lirio', 'cáyla'));
select retail.editar_marca(:'lirio', 'LIRIO BLANCO') ->> 'nombre';`);
  const [devuelto, guardado, choque, mayus] = lineas(r);
  esperar("renombrar limpia los espacios y devuelve el nombre como quedó", r.ok && devuelto === "Lirio Blanco" && guardado === "Lirio Blanco", r);
  esperar("renombrar a «cáyla» choca con CAYLA y dice con cuál", r.ok && choque.startsWith("Ya existe la marca «CAYLA»"), r);
  esperar("cambiar solo las mayúsculas de la propia marca no choca consigo misma", r.ok && mayus === "LIRIO BLANCO", r);
}

// 2. Corregir el proveedor de una marca sin productos: sumar el bueno y quitar el malo, en un solo guardado.
{
  const r = correr(`${ESCENA}
select retail.editar_marca(:'lirio', 'Lirio', array[:'sur']::uuid[], array[:'andina']::uuid[]) as _e \\gset
select pg_temp.provs(:'lirio');
select retail.editar_marca(:'lirio', 'Lirio', array[:'andina']::uuid[]) as _e2 \\gset
select pg_temp.provs(:'lirio');`);
  const [cambiado, dos] = lineas(r);
  esperar("cambiar el proveedor de una marca sin productos: queda solo el nuevo", r.ok && cambiado === "Confecciones del Sur EIRL", r);
  esperar("sumar un segundo proveedor deja los dos", r.ok && dos === "Confecciones del Sur EIRL,Textiles Andina SAC", r);
}

// 3. Un proveedor con productos no se quita (ni con los productos descontinuados), y el nombre del mismo guardado no cambia.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[], %L::uuid[])', :'cayla', 'CAYLA Nueva', array[:'andina'], array[:'csac']));
select pg_temp.nombre(:'cayla') || '|' || pg_temp.provs(:'cayla');
update retail.productos set estado = 'descontinuado' where marca_id = :'cayla';
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[], %L::uuid[])', :'cayla', 'CAYLA', array[:'andina'], array[:'csac']));`);
  const [enUso, sinCambio, descontinuados] = lineas(r);
  esperar("quitar un proveedor con productos se rechaza, con su nombre y cuántos", r.ok && /^«CAYLA SAC» no se puede quitar de CAYLA Nueva: \d+ producto\(s\)/.test(enUso), r);
  esperar("todo o nada: ni el nombre ni el proveedor sumado quedaron", r.ok && sinCambio === "CAYLA|CAYLA SAC", r);
  esperar("tampoco se quita si sus productos están descontinuados (la llave los sigue citando)", r.ok && descontinuados.startsWith("«CAYLA SAC» no se puede quitar"), r);
}

// 4. Una marca activa nunca queda sin proveedor.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[], %L::uuid[])', :'lirio', 'Lirio', '{}', array[:'andina']));
select pg_temp.provs(:'lirio');`);
  const [sinNadie, sigue] = lineas(r);
  esperar("quitar el único proveedor sin sumar otro se rechaza", r.ok && sinNadie.startsWith("La marca necesita al menos un proveedor"), r);
  esperar("y la marca sigue con su proveedor", r.ok && sigue === "Textiles Andina SAC", r);
}

// 5. Proveedor nuevo en el mismo paso: se registra y queda como el único; si el guardado falla, el proveedor no queda.
{
  const r = correr(`${ESCENA}
select retail.editar_marca(:'lirio', 'Lirio', '{}', array[:'andina']::uuid[], '[{"nombre": "Tejidos Norte SAC", "ruc": "20123456789"}]') as e \\gset
select pg_temp.provs(:'lirio');
select (:'e'::jsonb -> 'proveedores' -> 0 ->> 'id')::uuid = (select id from retail.proveedores where nombre = 'Tejidos Norte SAC') and jsonb_array_length(:'e'::jsonb -> 'proveedores') = 1;
select ruc from retail.proveedores where nombre = 'Tejidos Norte SAC';
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[], %L::uuid[], %L::jsonb)', :'cayla', 'CAYLA', '{}', array[:'csac'], '[{"nombre": "Hilos Sur SAC"}]'));
select count(*) from retail.proveedores where nombre = 'Hilos Sur SAC';
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[], %L::uuid[], %L::jsonb)', :'lirio', 'Lirio', '{}', '{}', '[{"nombre": "Otro SAC", "ruc": "123"}]'));`);
  const [conNuevo, devuelveId, ruc, falla, huerfano, rucMalo] = lineas(r);
  esperar("un proveedor nuevo se registra y queda en la marca, en el mismo guardado", r.ok && conNuevo === "Tejidos Norte SAC" && ruc === "20123456789", r);
  esperar("devuelve la lista final con el id del proveedor recién registrado (la pantalla pinta eso)", r.ok && devuelveId === "t", r);
  esperar("si el guardado falla (pareja en uso), el proveedor nuevo tampoco queda: no hay huérfanos", r.ok && falla.startsWith("«CAYLA SAC» no se puede quitar") && huerfano === "0", r);
  esperar("el RUC del proveedor nuevo pasa por las mismas reglas de Compras", r.ok && rucMalo.startsWith("El RUC tiene que ser de 11 dígitos"), r);
}

// 6. Registrar un proveedor sigue pidiendo el módulo Proveedores (Micaela edita catálogo, pero no registra proveedores).
{
  const r = correr(`${ESCENA}
${sesion(MICAELA)}
select retail.editar_marca(:'lirio', 'Lirio Rosa', array[:'sur']::uuid[]) ->> 'nombre';
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[], %L::uuid[], %L::jsonb)', :'lirio', 'Lirio Azul', '{}', '{}', '[{"nombre": "Nuevo SAC"}]'));
select pg_temp.nombre(:'lirio');`);
  const [renombra, sinModulo, nombre] = lineas(r);
  esperar("quien edita catálogo renombra y suma un proveedor de la lista", r.ok && renombra === "Lirio Rosa", r);
  esperar("pero registrar uno nuevo le pide el módulo Proveedores, y el nombre no cambia", r.ok && sinModulo.startsWith("Dar de alta proveedores necesita el módulo Proveedores") && nombre === "Lirio Rosa", r);
}

// 7. Un proveedor desactivado no se suma; uno que ya estaba y hoy está desactivado se queda.
{
  const r = correr(`${ESCENA}
update retail.proveedores set activo = false where id = :'sur';
select pg_temp.intento(format('select retail.editar_marca(%L, %L, %L::uuid[])', :'lirio', 'Lirio', array[:'sur']));
update retail.proveedores set activo = false where id = :'andina';
select retail.editar_marca(:'lirio', 'Lirio Gris') ->> 'nombre';
select pg_temp.provs(:'lirio');`);
  const [desactivado, renombra, sigue] = lineas(r);
  esperar("sumar un proveedor desactivado se rechaza", r.ok && desactivado.startsWith("Uno de los proveedores elegidos no existe o está desactivado"), r);
  esperar("una pareja con el proveedor hoy desactivado no impide renombrar, y se queda", r.ok && renombra === "Lirio Gris" && sigue === "Textiles Andina SAC", r);
}

// 8. Dos ediciones con la pantalla vieja: una suma Confecciones del Sur, la otra (que no la veía) solo renombra y suma
//    CAYLA SAC. Con «sumar/quitar» ninguna borra lo de la otra.
{
  const r = correr(`${ESCENA}
select retail.editar_marca(:'lirio', 'Lirio', array[:'sur']::uuid[]) as _a \\gset
select retail.editar_marca(:'lirio', 'Lirio Verde', array[:'csac']::uuid[]) as b \\gset
select pg_temp.nombre(:'lirio') || '|' || pg_temp.provs(:'lirio');
select string_agg(x ->> 'nombre', ',') from jsonb_array_elements(:'b'::jsonb -> 'proveedores') x;`);
  const [final, devuelto] = lineas(r);
  esperar("dos ediciones seguidas de la misma marca no se pisan", r.ok && final === "Lirio Verde|CAYLA SAC,Confecciones del Sur EIRL,Textiles Andina SAC", r);
  esperar("y la segunda devuelve también lo que sumó la primera (su pantalla no lo tenía)", r.ok && devuelto === "CAYLA SAC,Confecciones del Sur EIRL,Textiles Andina SAC", r);
}

// 9. Permisos.
{
  const r = correr(`${ESCENA}
${sesion(NADIE)}
select pg_temp.intento(format('select retail.editar_marca(%L, %L)', :'lirio', 'Robada'));
${sesion(FELIPE)}
select pg_temp.nombre(:'lirio');
set local role anon;
select pg_temp.intento(format('select retail.editar_marca(%L, %L)', :'lirio', 'Robada'));`);
  const [sinPersona, nombre, anon] = lineas(r);
  esperar("una sesión sin catálogo no edita marcas", r.ok && sinPersona === "No tienes permiso para editar marcas." && nombre === "Lirio", r);
  esperar("anon ni siquiera puede llamar la función", r.ok && anon.startsWith("permission denied for function editar_marca"), r);
}

// 10. Una marca que ya no existe.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.editar_marca(%L, %L)', gen_random_uuid(), 'Fantasma'));`);
  esperar("editar una marca que no existe lo dice", r.ok && lineas(r)[0] === "Esa marca ya no existe. Recarga la pantalla.", r);
}

console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
