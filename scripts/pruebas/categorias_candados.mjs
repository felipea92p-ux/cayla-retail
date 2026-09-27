#!/usr/bin/env node
/**
 * Prueba de los candados de Categorías en la tabla (`20260927200000_categorias_candados_en_la_tabla.sql`).
 *
 * QUÉ CUBRE
 *   · el prefijo no cambia con productos — ni por la pantalla (RPC) ni por un UPDATE directo, que es la
 *     puerta que dejó a «Blusas» desactivada con un producto activo — y sigue fijo con los productos
 *     descontinuados;
 *   · no se desactiva con productos activos por UPDATE directo; con todos descontinuados, sí;
 *   · reactivar una categoría sin familia o sin prefijo se rechaza (la «Polos» huérfana de V1), y también
 *     una cuya familia está desactivada; una completa se reactiva como siempre;
 *   · renombrar una categoría con productos sigue funcionando (el candado no se come la edición normal);
 *   · `fn_productos_por_categoria` devuelve activos (`n`) y total (`n_total`);
 *   · la migración se puede pegar dos veces, y la segunda vez limpia el nombre de la huérfana.
 *
 * CÓMO. Igual que `editar_marca.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:categorias-candados    → con las migraciones y el seed aplicados (CI: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MIGRACION = readFileSync(new URL("../../supabase/migrations/20260927200000_categorias_candados_en_la_tabla.sql", import.meta.url), "utf8");

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

/** «Camisas y Blusas» tiene las blusas del seed (activas). Las consultas directas corren como `postgres`, igual
 *  que una migración: es justo la puerta que el candado viejo (solo en la RPC) no cubría. */
const ESCENA = `
begin;
${INTENTO}
select id as camisas from retail.categorias where nombre = 'Camisas y Blusas' \\gset
select prefijo as prefijo_camisas from retail.categorias where nombre = 'Camisas y Blusas' \\gset
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

// 0. La escena existe: sin productos activos en «Camisas y Blusas» las demás pruebas no dirían nada.
{
  const r = correr(`${ESCENA}
select count(*) from retail.productos where categoria_id = :'camisas' and estado = 'activo';`);
  esperar("el seed trae productos activos en «Camisas y Blusas»", r.ok && Number(lineas(r)[0]) > 0, r);
}

// 1. Prefijo fijo: por la pantalla, por UPDATE directo, y también con los productos descontinuados.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('update retail.categorias set prefijo = %L where id = %L', 'ZZQ', :'camisas'));
${sesion(FELIPE)}
select pg_temp.intento(format('select retail.actualizar_categoria(%L, %L, %L, %L)', :'camisas', 'Camisas y Blusas', 'indumentaria', 'ZZQ'));
update retail.productos set estado = 'descontinuado' where categoria_id = :'camisas';
select pg_temp.intento(format('update retail.categorias set prefijo = %L where id = %L', 'ZZQ', :'camisas'));
select prefijo from retail.categorias where id = :'camisas';`);
  const [directo, pantalla, descontinuados, queda] = lineas(r);
  esperar("UPDATE directo del prefijo con productos se rechaza, con cuántos", r.ok && /^El prefijo ".+" de "Camisas y Blusas" no se puede cambiar: ya hay \d+ producto\(s\)/.test(directo), r);
  esperar("por la pantalla también (el mensaje de la RPC no cambia)", r.ok && pantalla.includes("no se puede cambiar: ya hay productos creados"), r);
  esperar("con todos descontinuados el prefijo sigue fijo", r.ok && descontinuados.startsWith("El prefijo") && queda !== "ZZQ", r);
}

// 2. Desactivar: con productos activos no, ni por UPDATE directo; con todos descontinuados, sí.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('update retail.categorias set activo = false where id = %L', :'camisas'));
update retail.productos set estado = 'descontinuado' where categoria_id = :'camisas';
select pg_temp.intento(format('update retail.categorias set activo = false where id = %L', :'camisas'));
select activo from retail.categorias where id = :'camisas';`);
  const [conActivos, sinActivos, activo] = lineas(r);
  esperar("UPDATE directo que desactiva con productos activos se rechaza", r.ok && /^No se puede desactivar "Camisas y Blusas": tiene \d+ producto\(s\) activo\(s\)/.test(conActivos), r);
  esperar("con los productos descontinuados sí se desactiva", r.ok && sinActivos === "SIN_ERROR" && activo === "f", r);
}

// 3. Reactivar: sin familia/prefijo no; con la familia apagada no; completa sí.
{
  const r = correr(`${ESCENA}
insert into retail.categorias (nombre, activo) values ('Categoría incompleta de prueba', false) returning id as incompleta \\gset
update retail.categorias set activo = false where familia = 'papeleria';
update retail.familias set activo = false where codigo = 'papeleria';
select id as lapiceros from retail.categorias where nombre = 'Lapiceros' \\gset
select id as trajes from retail.categorias where nombre = 'Trajes de baño' \\gset
${sesion(FELIPE)}
select pg_temp.intento(format('select retail.reactivar_categoria(%L)', :'incompleta'));
select pg_temp.intento(format('select retail.reactivar_categoria(%L)', :'lapiceros'));
select pg_temp.intento(format('select retail.reactivar_categoria(%L)', :'trajes'));
select activo from retail.categorias where id = :'trajes';`);
  const [incompleta, familiaApagada, completa, activo] = lineas(r);
  esperar("reactivar una categoría sin familia ni prefijo se rechaza y dice qué le falta", r.ok && incompleta === 'No se puede reactivar "Categoría incompleta de prueba": le falta la familia y el prefijo. Crea una categoría nueva con sus datos completos.', r);
  esperar("reactivar una categoría de una familia desactivada se rechaza", r.ok && familiaApagada.startsWith('No se puede activar "Lapiceros": su familia está desactivada'), r);
  esperar("una categoría completa se reactiva como siempre", r.ok && completa === "SIN_ERROR" && activo === "t", r);
}

// 4. Lo normal sigue funcionando: renombrar una categoría con productos, mismo prefijo.
{
  const r = correr(`${ESCENA}
${sesion(FELIPE)}
select pg_temp.intento(format('select retail.actualizar_categoria(%L, %L, %L, %L)', :'camisas', 'Camisas, Blusas y Tops', 'indumentaria', :'prefijo_camisas'));
select nombre from retail.categorias where id = :'camisas';`);
  const [renombrar, nombre] = lineas(r);
  esperar("renombrar una categoría con productos (mismo prefijo) funciona", r.ok && renombrar === "SIN_ERROR" && nombre === "Camisas, Blusas y Tops", r);
}

// 5. El conteo: activos y total.
{
  const r = correr(`${ESCENA}
${sesion(FELIPE)}
select n || '|' || n_total from retail.fn_productos_por_categoria() where categoria_id = :'camisas';
update retail.productos set estado = 'descontinuado' where categoria_id = :'camisas';
select n || '|' || n_total from retail.fn_productos_por_categoria() where categoria_id = :'camisas';`);
  const [antes, despues] = lineas(r);
  const [nAntes, totalAntes] = (antes ?? "").split("|").map(Number);
  esperar("n y n_total coinciden con todo activo", r.ok && nAntes > 0 && nAntes === totalAntes, r);
  esperar("con todo descontinuado: n = 0 y n_total sigue contando (el prefijo sigue fijo)", r.ok && despues === `0|${totalAntes}`, r);
}

// 6. La migración se pega dos veces sin error, y limpia el nombre de la huérfana de producción.
{
  const r = correr(`${ESCENA}
insert into retail.categorias (nombre, activo) values ('Polos (huérfana sin familia — fusionada con Polos/Camisetas el 2026-09-17)', false);
${MIGRACION}
select nombre from retail.categorias where notas like 'Nombre anterior: Polos (huérfana%';
select count(*) from retail.categorias where nombre like 'Polos (huérfana%';`);
  const [nombre, quedan] = lineas(r);
  esperar("repegar la migración no falla y renombra la huérfana (la nota pasa a `notas`)", r.ok && nombre === "Polos (V1, retirada)" && quedan === "0", r);
}

console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
