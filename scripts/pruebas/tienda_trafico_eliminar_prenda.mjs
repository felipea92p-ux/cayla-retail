#!/usr/bin/env node
/**
 * Tienda web ▸ Tráfico: eliminar una prenda que la gente miró en la tienda online (ADR-0495, act. 2026-10-27) contra el Postgres local.
 *
 * QUÉ PRUEBA. `20261027211000_trafico_web_eliminar_prenda.sql`:
 *   1. Lo que pregunta la ventana de Catálogo (`fn_producto_como_eliminar`): una prenda que solo tiene visitas se elimina «con su
 *      historia» (nivel `con_historia`, se puede), dice cuántas PERSONAS la miraron (`visitas`) y lo nombra en la razón.
 *   2. Eliminarla con su historia funciona, y sus visitas NO se borran: se quedan con todo lo demás (quién, cuándo, el paso, el camino,
 *      la región) y sin la prenda ni la talla. Las cifras de Tráfico de ese día no cambian.
 *   3. La regla de la tabla sigue en pie: no se edita otra cosa, no se suelta la prenda de una que todavía existe y no se borra.
 *   4. Una prenda con documentos (ventas) sigue sin poder eliminarse; su razón nombra solo lo que la frena (no las visitas).
 *   5. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK y la sesión del líder simulada con `request.jwt.claim.sub`, como
 * `eliminar_producto.mjs`. Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:tienda-trafico-eliminar-prenda    → necesita el stack local con las migraciones aplicadas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION = readFileSync("supabase/migrations/20261027211000_trafico_web_eliminar_prenda.sql", "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${JSON.stringify(detalle).slice(0, 1400)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

const sesion = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text, v_estado = returned_sqlstate;
  return v_estado || '|' || v_msg;
end;
$f$;
`;
// Las visitas de dos personas, sin la prenda ni la talla: lo que tiene que quedar idéntico al eliminarla.
const AYUDAS = `
create function pg_temp.visitas(p_visitantes uuid[]) returns text language sql as $f$
  select md5(string_agg(concat_ws(',', t.id, t.ocurrio_en, t.visitante, t.paso, t.camino, t.region, t.pedido_web_id), ';' order by t.id))
  from retail.trafico_web t where t.visitante = any (p_visitantes);
$f$;
create function pg_temp.recorrido() returns text language sql as $f$
  select string_agg(p.hasta::text, ',' order by p.visitante)
  from retail.fn_trafico_web_personas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) p
  where p.visitante in ('0d0d0d0d-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-000000000002');
$f$;
`;

/**
 * «Mirada A»: una prenda sin ninguna otra historia, con 2 tallas, copiando categoría, marca, proveedor, talla y color de «Blusa Emma» del
 * seed. Dos personas entraron hoy: la 1 la miró, eligió talla y la puso en la bolsa; la 2 solo la miró. «Mirada B» es otra prenda que
 * la 2 también miró: no se toca.
 */
const ESCENA = `
begin;
${INTENTO}
${AYUDAS}
${sesion}
select id as base, categoria_id as cat, marca_id as marca, proveedor_id as prov from retail.productos where referencia = 'Blusa Emma' \\gset
select talla_id as t1, color_codigo as c1 from retail.variantes where producto_id = :'base' order by sku limit 1 \\gset
select talla_id as t2, color_codigo as c2 from retail.variantes where producto_id = :'base' order by sku offset 1 limit 1 \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Mirada A', :'cat', :'marca', :'prov') returning id as pa \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Mirada B', :'cat', :'marca', :'prov') returning id as pb \\gset
insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo) values (:'pa', 'MIRADA-A-1', 50, :'t1', :'c1') returning id as va1 \\gset
insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo) values (:'pa', 'MIRADA-A-2', 50, :'t2', :'c2');
insert into retail.trafico_web (visitante, paso, camino, region) values
  ('0d0d0d0d-0000-4000-8000-000000000001', 0, 'instagram', 'PE-LAL'),
  ('0d0d0d0d-0000-4000-8000-000000000002', 0, 'qr', 'PE-ARE');
insert into retail.trafico_web (visitante, paso, producto_id) values
  ('0d0d0d0d-0000-4000-8000-000000000001', 1, :'pa'),
  ('0d0d0d0d-0000-4000-8000-000000000002', 1, :'pa'),
  ('0d0d0d0d-0000-4000-8000-000000000002', 1, :'pb');
insert into retail.trafico_web (visitante, paso, producto_id, variante_id) values
  ('0d0d0d0d-0000-4000-8000-000000000001', 2, :'pa', :'va1'),
  ('0d0d0d0d-0000-4000-8000-000000000001', 3, :'pa', :'va1');
`;
const DOS = "array['0d0d0d0d-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-000000000002']::uuid[]";

// ---- 1. Lo que pregunta la ventana ----
{
  const r = correr(`${ESCENA}
select nivel || '|' || puedes || '|' || visitas || '|' || movimientos || '|' || prendas from retail.fn_producto_como_eliminar(:'pa');
select razon from retail.fn_producto_como_eliminar(:'pa');
select visitas from retail.fn_producto_como_eliminar(:'pb');`);
  const [como, razon, otra] = lineas(r);
  esperar("una prenda que solo tiene visitas se elimina con su historia: se puede, 2 personas, 0 movimientos, 0 prendas", r.ok && como === "con_historia|true|2|0|0", r);
  esperar("la razón nombra a las personas que la miraron en la tienda online", r.ok && razon === "tiene personas que la miraron en la tienda online (2)", r);
  esperar("otra prenda cuenta solo las suyas", r.ok && otra === "1", r);
}

// ---- 2. Eliminarla: las visitas se quedan, sin la prenda ----
{
  const r = correr(`${ESCENA}
select pg_temp.visitas(${DOS}) as antes \\gset
select pg_temp.recorrido() as recorrido_antes \\gset
select retail.eliminar_producto_con_historia(:'pa');
select count(*) from retail.productos where id = :'pa';
select pg_temp.visitas(${DOS}) = :'antes';
select count(*) || '|' || count(*) filter (where producto_id is null and paso between 1 and 3) || '|' || count(*) filter (where variante_id is not null)
  from retail.trafico_web where visitante = any (${DOS});
select count(*) from retail.trafico_web where producto_id = :'pb';
select pg_temp.recorrido() = :'recorrido_antes';`);
  const [devuelto, queda, iguales, cuentas, otra, recorrido] = lineas(r);
  esperar("eliminarla con su historia funciona y devuelve su nombre", r.ok && devuelto === "Mirada A" && queda === "0", r);
  esperar("ninguna visita se borró y todas siguen iguales (quién, cuándo, paso, camino, región)", r.ok && iguales === "t", r);
  esperar("las 4 visitas de la prenda quedan sin ella y sin su talla; las 3 demás no cambian", r.ok && cuentas === "7|4|0", r);
  esperar("la visita a la otra prenda sigue con ella", r.ok && otra === "1", r);
  esperar("las cifras de Tráfico de ese día no cambian (hasta qué paso llegó cada persona)", r.ok && recorrido === "t", r);
}

// ---- 3. La regla de la tabla sigue en pie ----
{
  const r = correr(`${ESCENA}
reset role;
select pg_temp.intento($$update retail.trafico_web set camino = 'otros' where visitante = '0d0d0d0d-0000-4000-8000-000000000001' and paso = 0$$);
select pg_temp.intento(format($$update retail.trafico_web set producto_id = null, variante_id = null where producto_id = %L$$, :'pb'));
select pg_temp.intento($$delete from retail.trafico_web where visitante = '0d0d0d0d-0000-4000-8000-000000000002'$$);
select pg_temp.intento(format($$update retail.trafico_web set producto_id = %L where producto_id = %L$$, :'pb', :'pa'));`);
  const no = (s) => typeof s === "string" && s.includes("no se editan ni se borran");
  const [camino, soltarViva, borrar, cambiar] = lineas(r);
  esperar("no se edita otra cosa de una visita", r.ok && no(camino), r);
  esperar("no se suelta la prenda de una visita mientras la prenda existe", r.ok && no(soltarViva), r);
  esperar("una visita no se borra", r.ok && no(borrar), r);
  esperar("no se cambia una visita a otra prenda", r.ok && no(cambiar), r);
}

// ---- 4. Una prenda con ventas sigue sin poder eliminarse; la razón nombra solo lo que la frena ----
{
  const r = correr(`${ESCENA}
insert into retail.trafico_web (visitante, paso, producto_id) values ('0d0d0d0d-0000-4000-8000-000000000001', 1, :'base');
select nivel || '|' || puedes || '|' || visitas from retail.fn_producto_como_eliminar(:'base');
select razon not like '%tienda online%' from retail.fn_producto_como_eliminar(:'base');`);
  const [como, nombra] = lineas(r);
  esperar("una prenda con ventas sigue sin poder eliminarse, aunque la hayan mirado", r.ok && /^con_documentos\|false\|[1-9]\d*$/.test(como), r);
  esperar("…y su razón nombra solo lo que la frena, no las visitas", r.ok && nombra === "t", r);
}

// ---- 5. Se puede pegar dos veces ----
{
  const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}`);
  esperar("la migración se puede pegar dos veces", r.ok, r.ok ? undefined : r.mensaje);
}

console.log(`\n${total - fallos} de ${total} bien.`);
if (fallos) process.exit(1);
