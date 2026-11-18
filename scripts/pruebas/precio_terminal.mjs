#!/usr/bin/env node
/**
 * Prueba de «una terminal no cambia el precio de la prenda» (`20261026224000_terminal_no_cambia_precio_de_la_prenda.sql`,
 * Felipe 2026-10-26).
 *
 * QUÉ CUBRE
 *   · una terminal NO cambia `variantes.precio` (vale en todas las tiendas): se rechaza con el hint `terminal_precio_de_la_prenda`
 *     y no queda nada escrito;
 *   · guardar la ficha sin tocar el precio (el mismo valor) sigue pasando, y la terminal sí le cambia otra columna a la variante;
 *   · una terminal SÍ crea una talla nueva con su precio (crear o sumar no es cambiar);
 *   · el líder y una integrante siguen cambiando el precio de la prenda;
 *   · sin sesión (scripts, el SQL Editor) no frena;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (como `precio_sede.mjs`): la base compartida queda igual. La terminal se crea
 * dentro de la transacción (como `gastos_viaje.mjs`).
 *
 * USO
 *   node scripts/pruebas/precio_terminal.mjs               → con las migraciones ya aplicadas en la base `postgres` del local
 *   node scripts/pruebas/precio_terminal.mjs --base otra   → contra otra base del mismo contenedor
 *   node scripts/pruebas/precio_terminal.mjs --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const iBase = process.argv.indexOf("--base");
const BASE = iBase > 0 ? process.argv[iBase + 1] : "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo, ve Productos (seed)
const TERMINAL = "7e5a1a00-0000-4000-8000-0000000000f1"; // la cuenta de la terminal de prueba (nace y muere en cada transacción)
const MIGRACION = new URL("../../supabase/migrations/20261026224000_terminal_no_cambia_precio_de_la_prenda.sql", import.meta.url);

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const sesion = (uid) => `
set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', json_build_object('x-ubicacion', :'tru')::text, true) as _h \\gset
`;

// Una prenda de ropa con una variante activa y precio, y una terminal en Trujillo (creada como postgres, antes de tomar la sesión).
const PRELUDIO = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as v1, v.producto_id as p1, v.precio as precio from retail.variantes v join retail.productos pr on pr.id = v.producto_id
 where v.activo and v.precio > 10 and retail.fn_categoria_entra_a_motores(pr.categoria_id)
 order by v.id limit 1 \\gset
insert into auth.users (id, aud, role, email) values ('${TERMINAL}', 'authenticated', 'authenticated', 'terminal-precio@prueba.local');
-- Con firma de respaldo (ADR-0454): lo que firma la variante (su historial) no pide el combo «Responsable» ni asistencia.
select id as respaldo from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id, firma_respaldo_id)
  values (:'tru', 'ZZ Terminal precio de la prenda', retail.fn_rol_por_clave('terminal_administrativa'), '${TERMINAL}', :'respaldo');
`;

function correr(uid, sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${uid ? sesion(uid) : ""}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");

// 0. La sesión de prueba ES una terminal (si no, todo lo demás pasaría por la razón equivocada).
{
  const r = correr(TERMINAL, `select retail.fn_es_terminal()::text;`);
  esperar("la sesión de prueba es una terminal", ultima(r) === "true", r);
}

// 1. La terminal no cambia el precio de la prenda, y no queda nada escrito.
{
  // psql no interpola dentro de $$: la variante se pasa por un set_config antes del bloque.
  const r2 = correr(TERMINAL, `
select set_config('prueba.v1', :'v1', true) as _v \\gset
do $$
declare v_hint text;
begin
  begin
    update retail.variantes set precio = precio + 5 where id = current_setting('prueba.v1')::uuid;
    v_hint := 'no frenó';
  exception when insufficient_privilege then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform set_config('prueba.hint', v_hint, true);
end $$;
select concat_ws('|', current_setting('prueba.hint'),
  ((select precio from retail.variantes where id = :'v1') = :precio)::text);`);
  esperar("una terminal NO cambia el precio de la prenda (hint terminal_precio_de_la_prenda, nada escrito)", ultima(r2) === "terminal_precio_de_la_prenda|true", r2);
}

// 2. El mismo precio (guardar la ficha sin tocarlo) y otra columna sí pasan.
{
  const r = correr(TERMINAL, `
update retail.variantes set precio = :precio where id = :'v1';
update retail.variantes set sku = coalesce(sku, '') || '-prueba' where id = :'v1';
select 'ok';`);
  esperar("una terminal guarda la variante sin cambiar el precio (mismo valor, otra columna)", ultima(r) === "ok", r);
}

// 3. Crear una talla nueva con su precio no es cambiar el precio.
{
  const r = correr(TERMINAL, `
select t.id as talla_nueva from retail.tallas t
 where t.activo and not exists (select 1 from retail.variantes v where v.producto_id = :'p1' and v.talla_id = t.id)
 order by t.id limit 1 \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio)
  select :'p1', v.color_codigo, :'talla_nueva', :precio + 7 from retail.variantes v where v.id = :'v1';
select 'ok';`);
  esperar("una terminal crea una talla nueva con su precio", ultima(r) === "ok", r);
}

// 4. El líder y una integrante siguen cambiando el precio de la prenda; sin sesión tampoco frena.
for (const [quien, uid] of [["el líder", FELIPE], ["una integrante", MICAELA], ["sin sesión", null]]) {
  const r = correr(uid, `
update retail.variantes set precio = precio + 5 where id = :'v1';
select ((select precio from retail.variantes where id = :'v1') = :precio + 5)::text;`);
  esperar(`${quien} cambia el precio de la prenda`, ultima(r) === "true", r);
}

// 5. La migración se puede pegar dos veces.
{
  const sql = readFileSync(MIGRACION, "utf8");
  try {
    psql(`begin;\n${sql}\n${sql}\nrollback;\n`);
    esperar("la migración se pega dos veces", true, null);
  } catch (e) {
    esperar("la migración se pega dos veces", false, `${e.stderr ?? e.message}`);
  }
}

if (fallos > 0) {
  console.log(`\n${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodo en orden: una terminal no cambia el precio de la prenda.");
