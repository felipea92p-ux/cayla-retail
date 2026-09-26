#!/usr/bin/env node
/**
 * Prueba de ADR-0193 — edición simultánea con versión (`20260924160000_edicion_simultanea_con_version.sql`).
 *
 * QUÉ CUBRE
 *   · Productos: dos «sesiones» que abrieron la ficha en la misma versión guardan una detrás de otra: la primera pasa y
 *     devuelve la versión nueva, la segunda recibe PT409 «Otra persona cambió esta prenda…»; sin versión esperada se
 *     guarda como hasta hoy; con la versión que devolvió el guardado anterior, se vuelve a guardar sin recargar.
 *   · La versión sube con CUALQUIER escritura (el «Descontinuar» en bloque de /productos escribe la tabla directo) y no
 *     se puede fijar a mano.
 *   · Roles: guardar sin cambios no sube la versión; cambiar módulos sí (el disparador de rol_modulos); la segunda
 *     sesión con la versión vieja recibe PT409; renombrar también sube la versión; sin versión esperada, como hoy.
 *
 * CÓMO. Mismo patrón que `caja_cierre_traslado.mjs`: todo en una transacción con ROLLBACK (nunca se commitea nada en el
 * Postgres local compartido), sesión simulada con `request.jwt.claim(s)` de Felipe (líder) y rol `authenticated`
 * (la RPC de productos es SECURITY INVOKER: se prueba con la RLS de verdad), y `pg_temp.intento` para leer el error
 * (código y mensaje) sin abortar el escenario.
 *
 * USO
 *   pnpm pruebas:edicion-simultanea    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

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

const COMO_FELIPE =
  `set local request.jwt.claim.sub = '${FELIPE}';\n` +
  `set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';\n` +
  `set local role authenticated;\n`;

// Devuelve 'OK:<resultado>' o '<sqlstate>:<mensaje>'.
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_estado text; v_res text;
begin
  execute p_sql into v_res;
  return 'OK:' || coalesce(v_res, '');
exception when others then
  get stacked diagnostics v_msg = message_text, v_estado = returned_sqlstate;
  return v_estado || ':' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 800)}`);
  }
}

// Llamada «como la ficha»: los mismos datos que ya tiene la prenda, sin variantes ni fotos nuevas.
const guardarProducto = (version) => `select pg_temp.intento(format(
  'select retail.catalogo_actualizar_producto(p_producto_id => %L, p_referencia => %L, p_estado => %L, p_variantes => ''[]''::jsonb,
     p_categoria_id => %L, p_tejido_id => %L, p_patron_id => %L${version === null ? "" : ", p_version_esperada => %s"})::text',
  :'prod', :'ref', :'estado', :'cat', nullif(:'tejido', ''), nullif(:'patron', '')${version === null ? "" : `, ${version}`}));`;

const ESCENA_PRODUCTO = `
begin;
${INTENTO}
select id as prod, referencia as ref, estado, categoria_id as cat, coalesce(tejido_id::text, '') as tejido,
       coalesce(patron_id::text, '') as patron, version as v0
  from retail.productos
 where estado = 'activo' and coalesce(estado_alta, 'aprobado') <> 'rechazado'
   and exists (select 1 from retail.variantes v where v.producto_id = productos.id)
 order by referencia limit 1 \\gset
${COMO_FELIPE}
`;

// 1. Dos sesiones con la misma versión: la primera pasa, la segunda no.
{
  const r = correr(`${ESCENA_PRODUCTO}
${guardarProducto(":'v0'")}
${guardarProducto(":'v0'")}
select version - :'v0' from retail.productos where id = :'prod';`);
  const [primera, segunda, subio] = r.ok ? r.salida.split("\n") : [];
  esperar("productos: la primera sesión guarda y recibe la versión nueva", r.ok && primera?.startsWith("OK:") && subio === "1", r);
  esperar(
    "productos: la segunda sesión (misma versión) recibe PT409 «Otra persona cambió esta prenda…»",
    r.ok && segunda === "PT409:Otra persona cambió esta prenda mientras la editabas. Recarga para ver sus cambios.",
    r
  );
  esperar("productos: el rechazo no escribió nada (la versión subió solo una vez)", r.ok && subio === "1", r);
}

// 2. Sin versión esperada, como hoy; con la versión devuelta, se vuelve a guardar sin recargar.
{
  const r = correr(`${ESCENA_PRODUCTO}
${guardarProducto(":'v0'")}
${guardarProducto(null)}
${guardarProducto(":'v0' + 2")}
select version - :'v0' from retail.productos where id = :'prod';`);
  const [a, b, c, subio] = r.ok ? r.salida.split("\n") : [];
  esperar("productos: sin p_version_esperada guarda aunque la versión haya cambiado (web vieja)", r.ok && a?.startsWith("OK:") && b?.startsWith("OK:"), r);
  esperar("productos: con la versión que devolvió el último guardado, vuelve a guardar", r.ok && c === `OK:${Number(a?.slice(3)) + 2}` && subio === "3", r);
}

// 3. Cualquier escritura sube la versión (Descontinuar en bloque escribe la tabla directo), y no se fija a mano.
{
  const r = correr(`${ESCENA_PRODUCTO}
update retail.productos set estado = 'descontinuado' where id = :'prod';
${guardarProducto(":'v0'")}
update retail.productos set version = 999 where id = :'prod';
select version - :'v0' from retail.productos where id = :'prod';`);
  const [tras, final] = r.ok ? r.salida.split("\n") : [];
  esperar("productos: tras «Descontinuar» en bloque, la ficha abierta antes recibe PT409", r.ok && tras?.startsWith("PT409:"), r);
  esperar("productos: la versión no se puede fijar a mano (999 → versión anterior + 1)", r.ok && final === "2", r);
}

// 4. Roles: un rol a medida con dos módulos.
const ESCENA_ROL = `
begin;
${INTENTO}
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000e5', 'Rol de prueba (versión)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000e5', 'vender'), ('44444444-4444-4444-8444-0000000000e5', 'existencias');
select version as v0 from retail.roles where id = '44444444-4444-4444-8444-0000000000e5' \\gset
${COMO_FELIPE}
`;
const guardarRol = (modulos, version) =>
  `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, %L::text[]${version === null ? "" : ", %s"})::text', ` +
  `'44444444-4444-4444-8444-0000000000e5', '{${modulos.join(",")}}'${version === null ? "" : `, ${version}`}));`;
{
  const r = correr(`${ESCENA_ROL}
select :'v0';
${guardarRol(["existencias", "vender"], ":'v0'")}
${guardarRol(["existencias", "vender", "conteos"], ":'v0'")}
${guardarRol(["vender"], ":'v0'")}
${guardarRol(["vender"], null)}
select string_agg(modulo, ',' order by modulo) from retail.rol_modulos where rol_id = '44444444-4444-4444-8444-0000000000e5';`);
  const [v0, igual, primera, segunda, sinVersion, modulos] = r.ok ? r.salida.split("\n") : [];
  esperar("roles: guardar sin cambios no sube la versión", r.ok && igual === `OK:${v0}`, r);
  esperar("roles: cambiar módulos con la versión vigente guarda y devuelve una versión mayor", r.ok && Number(primera?.slice(3)) > Number(igual?.slice(3)), r);
  esperar(
    "roles: la segunda sesión (versión vieja) recibe PT409 «Otra persona cambió este rol…»",
    r.ok && segunda === "PT409:Otra persona cambió este rol mientras lo editabas. Recarga para ver sus cambios.",
    r
  );
  esperar("roles: sin p_version_esperada guarda como hoy", r.ok && sinVersion?.startsWith("OK:") && modulos === "vender", r);
}

// 5. Roles: renombrar también cuenta como cambio.
{
  const r = correr(`${ESCENA_ROL}
select pg_temp.intento($$select retail.renombrar_rol('44444444-4444-4444-8444-0000000000e5', 'Rol de prueba renombrado', 'temporal')::text$$);
${guardarRol(["vender"], ":'v0'")}`);
  const [renombrar, tras] = r.ok ? r.salida.split("\n") : [];
  esperar("roles: tras renombrar, quien tenía la versión anterior recibe PT409", r.ok && renombrar?.startsWith("OK") && tras?.startsWith("PT409:"), r);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
