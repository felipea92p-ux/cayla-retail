#!/usr/bin/env node
/**
 * Prueba de ADR-0371 (`20261010170000_revisar_productos_pendientes.sql`): la cola de prendas por revisar y el rechazo que no
 * deja nada colgado.
 *
 * QUÉ CUBRE
 *   · La cola (`fn_productos_por_revisar`): una prenda que propone alguien que NO edita el catálogo aparece con quién la propuso,
 *     desde qué sede nació, sus variantes, tallas, colores, precio, stock y órdenes en proceso; los aprobados, los rechazados y los
 *     de prueba no entran; la más vieja va primero; `total` cuenta todas aunque se pida una página; el costo no se devuelve;
 *   · aprobar: queda aprobada, firmada por quien la aprobó y activa, sale de la cola y deja su línea en Actividad;
 *   · rechazar una prenda sin nada colgado: queda rechazada Y descontinuada (no se borra), con su línea en Actividad;
 *   · rechazar con una orden de producción en proceso se niega (`con_ordenes_abiertas`) y la prenda sigue pendiente; anulada la
 *     orden, se puede; APROBAR con la orden abierta sí se puede;
 *   · rechazar con stock se niega (`con_stock`); aprobar con stock sí; con el stock en 0 se puede;
 *   · idempotencia: aprobar dos veces o rechazar dos veces no falla; revisar en el sentido contrario una ya revisada dice
 *     `ya_revisada`; una prenda que no existe dice `no_existe`;
 *   · permisos: quien no edita el catálogo recibe `sin_permiso` en la lectura y en la revisión, y `anon` no puede ejecutar ninguna;
 *   · la migración se puede volver a pegar;
 *   · LA CARRERA: una orden que se está abriendo (sin confirmar) en otra sesión hace esperar al rechazo hasta que termine.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (el de la carrera usa dos sesiones, también sin confirmar nada). La base
 * local del repo trae «Integrante» con todos los módulos (el seed los reparte para ver todo): aquí se le quitan Productos y
 * Atributos DENTRO de la transacción, para tener a alguien que propone y no aprueba.
 *
 * USO
 *   pnpm pruebas:revisar-productos    → con la migración ya aplicada en el local
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)
const MIGRACION = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations", "20261010170000_revisar_productos_pendientes.sql");

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const COMO = (sub) => `
set local request.jwt.claim.sub = '${sub}';
set local request.jwt.claims = '{"sub":"${sub}","role":"authenticated"}';`;

// Tres piezas pequeñas dentro de la transacción:
//  · `pg_temp.intentar(sql)` devuelve «ok» o «hint :: mensaje» en vez de abortar, para mirar el estado DESPUÉS del error;
//  · Micaela (sin Productos ni Atributos) propone dos prendas por la misma puerta del conteo (`censo_crear_variante`);
//  · desde ahí la sesión sigue como Felipe, el líder, que es quien revisa.
const PRELUDIO = `
create or replace function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(v_hint, '-') || ' :: ' || v_msg;
end $f$;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select c.id as cat, ct.talla_id as talla from retail.categorias c
  join retail.categoria_tallas ct on ct.categoria_id = c.id
  join retail.tallas t on t.id = ct.talla_id and t.activo
 where c.activo order by c.nombre, t.valor limit 1 \\gset
select valor as talla_valor from retail.tallas where id = :'talla' \\gset
select btrim(nombres || ' ' || apellidos) as nombre_mica from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as felipe_persona from public.personas where auth_user_id = '${FELIPE}' \\gset
${COMO(MICAELA)}
select retail.fn_mi_rol_id() as rol_mica \\gset
delete from retail.rol_modulos where rol_id = :'rol_mica' and modulo in ('productos', 'atributos');
select set_config('request.headers', json_build_object('x-ubicacion', :'tru')::text, true) as _h \\gset
select variante_id as va from retail.censo_crear_variante('Blusa Prueba Revisar A', :'cat', 'TESTREV-A-1', :'talla', null, 0, 59.90) \\gset
select variante_id as vb from retail.censo_crear_variante('Blusa Prueba Revisar B', :'cat', 'TESTREV-B-1', :'talla', null, 0, 79.90) \\gset
select producto_id as pa from retail.variantes where id = :'va' \\gset
select producto_id as pb from retail.variantes where id = :'vb' \\gset
${COMO(FELIPE)}
`;

// Dentro de una transacción `now()` no cambia: Actividad no anota una aprobación «en el mismo instante» del alta (a propósito: una
// prenda que nace aprobada no dice dos veces lo mismo). Cada escenario que mira Actividad envejece la prenda una hora antes.
const VIEJA_PA = "update retail.productos set created_at = created_at - interval '1 hour' where id = :'pa';";
const VIEJA_PB = "update retail.productos set created_at = created_at - interval '1 hour' where id = :'pb';";

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// ============================================================================
// 1. La cola
// ============================================================================
{
  const r = correr(`
    select
      (select count(*) from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select propuesto_por_nombre = :'nombre_mica' from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select sede from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select variantes from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select tallas[1] = :'talla_valor' and cardinality(tallas) = 1 from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select precio_min || '/' || precio_max from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select stock || '/' || ordenes_abiertas from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A'),
      (select (total = (select count(*) from retail.productos where estado_alta = 'pendiente' and not es_prueba)) from retail.fn_productos_por_revisar() limit 1);
  `);
  const f = (lineas(r)[0] ?? "").split("|");
  esperar("la cola trae la prenda propuesta, con quién, desde dónde, variantes, talla, precio, stock y órdenes", r.ok && f[0] === "1" && f[1] === "t" && f[2] === "Tienda Trujillo" && f[3] === "1" && f[4] === "t" && f[5] === "59.90/59.90" && f[6] === "0/0", r.ok ? f : r.mensaje);
  esperar("`total` cuenta todas las pendientes de verdad", r.ok && f[7] === "t", f);
}
{
  // Orden: la más vieja primero. Aprobadas, rechazadas y de prueba no entran. Una página no recorta `total`.
  const r = correr(`
    update retail.productos set created_at = created_at - interval '2 days' where id = :'pb';
    select string_agg(referencia, ',' order by n) from (select referencia, row_number() over () as n from retail.fn_productos_por_revisar()) x where referencia like 'Blusa Prueba Revisar%';
    update retail.productos set es_prueba = true where id = :'pa';
    select count(*) from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A';
    update retail.productos set es_prueba = false where id = :'pa';
    select retail.revisar_producto_censo(:'pa', true);
    select count(*) from retail.fn_productos_por_revisar() where referencia = 'Blusa Prueba Revisar A';
    select count(*) from retail.fn_productos_por_revisar(1, 0);
    select count(*) from retail.fn_productos_por_revisar(1, 1);
    select (select total from retail.fn_productos_por_revisar(1, 0)) = (select count(*) from retail.productos where estado_alta = 'pendiente' and not es_prueba);
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("la más vieja va primero (B, creada hace dos días, antes que A)", r.ok && l[0] === "Blusa Prueba Revisar B,Blusa Prueba Revisar A", l);
  esperar("una prenda de prueba no entra a la cola", r.ok && l[1] === "0", l);
  esperar("una prenda aprobada sale de la cola", r.ok && l[2] === "0", l);
  esperar("el tamaño de página se respeta (1 y 1) y `total` sigue siendo el de todas", r.ok && l[3] === "1" && l[4] === "1" && l[5] === "t", l);
}
{
  // Sin costos: la lectura no tiene una columna de costo.
  const r = correr(`select count(*) from information_schema.columns where false; select string_agg(a, ',') from unnest((select proargnames from pg_proc where proname = 'fn_productos_por_revisar' and pronamespace = 'retail'::regnamespace)) a;`);
  const l = lineas(r).filter((x) => x !== "");
  esperar("la cola no devuelve costo", r.ok && !/costo/i.test(l[1] ?? ""), l);
}

// ============================================================================
// 2. Aprobar y rechazar
// ============================================================================
{
  const r = correr(`
    ${VIEJA_PA}
    select retail.revisar_producto_censo(:'pa', true);
    select estado_alta, estado, aprobado_por = :'felipe_persona', aprobado_en is not null from retail.productos where id = :'pa';
    select count(*) from retail.actividad where accion = 'producto_aprobado' and registro_id = :'pa'::text;
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("aprobar: queda aprobada, activa y firmada por quien la aprobó", r.ok && l[0] === "aprobado|activo|t|t", l);
  esperar("aprobar deja su línea en Actividad", r.ok && l[1] === "1", l);
}
{
  const r = correr(`
    ${VIEJA_PB}
    select retail.revisar_producto_censo(:'pb', false);
    select estado_alta, estado, aprobado_por = :'felipe_persona', aprobado_en is not null from retail.productos where id = :'pb';
    select count(*) from retail.productos where id = :'pb';
    select count(*) from retail.variantes where producto_id = :'pb';
    select count(*) from retail.actividad where accion = 'producto_rechazado' and registro_id = :'pb'::text;
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("rechazar una prenda sin nada colgado: rechazada Y descontinuada, firmada", r.ok && l[0] === "rechazado|descontinuado|t|t", l);
  esperar("rechazar no borra nada: la prenda y su variante siguen", r.ok && l[1] === "1" && l[2] === "1", l);
  esperar("rechazar deja su línea en Actividad", r.ok && l[3] === "1", l);
}

// ---- órdenes de producción en proceso ----
{
  const r = correr(`
    insert into retail.producciones (ubicacion_id, producto_id, cantidad_plan) values (:'taller', :'pa', 5) returning id \\gset
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    select estado_alta, estado from retail.productos where id = :'pa';
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, true)', :'pa'));
    select estado_alta from retail.productos where id = :'pa';
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("rechazar con una orden en proceso se niega (con_ordenes_abiertas) y dice qué hacer", r.ok && /^con_ordenes_abiertas :: .*una orden de producción en proceso.*Anula esa orden/.test(l[0] ?? ""), l);
  esperar("…y la prenda sigue pendiente y activa", r.ok && l.includes("pendiente|activo"), l);
  esperar("APROBAR con la orden abierta sí se puede", r.ok && l.at(-2) === "ok" && l.at(-1) === "aprobado", l);
}
{
  const r = correr(`
    insert into retail.producciones (ubicacion_id, producto_id, cantidad_plan) values (:'taller', :'pa', 5), (:'taller', :'pa', 7);
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    update retail.producciones set estado = 'anulada' where producto_id = :'pa';
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    select estado_alta, estado from retail.productos where id = :'pa';
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("con dos órdenes lo dice en plural", r.ok && /2 órdenes de producción en proceso/.test(l[0] ?? ""), l);
  esperar("anulada la orden, el rechazo pasa", r.ok && l[1] === "ok" && l[2] === "rechazado|descontinuado", l);
}

// ---- stock ----
{
  const r = correr(`
    insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'va', :'tru', 3);
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    select estado_alta, estado from retail.productos where id = :'pa';
    update retail.stock set cantidad = 1 where variante_id = :'va';
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    update retail.stock set cantidad = 0 where variante_id = :'va';
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    select estado_alta, estado from retail.productos where id = :'pa';
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("rechazar con 3 prendas en stock se niega (con_stock) y dice qué hacer", r.ok && /^con_stock :: .*3 prendas en stock.*Ajusta su stock a 0/.test(l[0] ?? ""), l);
  esperar("…y la prenda sigue pendiente", r.ok && l[1] === "pendiente|activo", l);
  esperar("con 1 prenda lo dice en singular", r.ok && /una prenda en stock/.test(l[2] ?? ""), l);
  esperar("con el stock en 0 el rechazo pasa", r.ok && l[3] === "ok" && l[4] === "rechazado|descontinuado", l);
}
{
  const r = correr(`
    insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'va', :'tru', 3);
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, true)', :'pa'));
    select estado_alta from retail.productos where id = :'pa';
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("APROBAR con stock sí se puede", r.ok && l[0] === "ok" && l[1] === "aprobado", l);
}

// ---- idempotencia, ya revisada, inexistente ----
{
  const r = correr(`
    ${VIEJA_PA}
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, true)', :'pa'));
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, true)', :'pa'));
    select count(*) from retail.actividad where accion = 'producto_aprobado' and registro_id = :'pa'::text;
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    select estado_alta, estado from retail.productos where id = :'pa';
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pb'));
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pb'));
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, true)', :'pb'));
    select pg_temp.intentar('select retail.revisar_producto_censo(gen_random_uuid(), true)');
    select pg_temp.intentar('select retail.revisar_producto_censo(null, true)');
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("aprobar dos veces no falla ni duplica la línea de Actividad", r.ok && l[0] === "ok" && l[1] === "ok" && l[2] === "1", l);
  esperar("rechazar una ya aprobada dice ya_revisada (y sigue aprobada)", r.ok && /^ya_revisada :: «Blusa Prueba Revisar A» ya se revisó: quedó aprobada/.test(l[3] ?? "") && l[4] === "aprobado|activo", l);
  esperar("rechazar dos veces no falla", r.ok && l[5] === "ok" && l[6] === "ok", l);
  esperar("aprobar una ya rechazada dice ya_revisada, y no se reactiva", r.ok && /^ya_revisada :: .*quedó rechazada/.test(l[7] ?? ""), l);
  esperar("una prenda que no existe dice no_existe", r.ok && /^no_existe/.test(l[8] ?? ""), l);
  esperar("sin prenda o sin decisión dice datos_incompletos", r.ok && /^datos_incompletos/.test(l[9] ?? ""), l);
}

// ============================================================================
// 3. Permisos
// ============================================================================
{
  const r = correr(`
    ${COMO(MICAELA)}
    select retail.fn_puede_editar_catalogo();
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, true)', :'pa'));
    select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', :'pa'));
    select pg_temp.intentar('select * from retail.fn_productos_por_revisar()');
    select estado_alta from retail.productos where id = :'pa';
  `);
  const l = lineas(r).filter((x) => x !== "");
  esperar("quien no edita el catálogo (Micaela sin Productos) no puede aprobar", r.ok && l[0] === "f" && /^sin_permiso :: Solo quien edita el catálogo/.test(l[1] ?? ""), l);
  esperar("…ni rechazar, ni ver la cola", r.ok && /^sin_permiso/.test(l[2] ?? "") && /^sin_permiso/.test(l[3] ?? ""), l);
  esperar("…y la prenda sigue pendiente", r.ok && l[4] === "pendiente", l);
}
{
  const r = correr(`
    select has_function_privilege('anon', 'retail.revisar_producto_censo(uuid, boolean)', 'execute'),
           has_function_privilege('anon', 'retail.fn_productos_por_revisar(integer, integer)', 'execute'),
           has_function_privilege('authenticated', 'retail.revisar_producto_censo(uuid, boolean)', 'execute'),
           has_function_privilege('authenticated', 'retail.fn_productos_por_revisar(integer, integer)', 'execute');
  `);
  esperar("anon no ejecuta ninguna; authenticated ejecuta las dos", r.ok && lineas(r)[0] === "f|f|t|t", r.ok ? r.salida : r.mensaje);
}

// ============================================================================
// 4. La migración se puede volver a pegar
// ============================================================================
{
  const sql = readFileSync(MIGRACION, "utf8");
  let ok = true;
  let mensaje = "";
  try {
    psql(`begin;\n${sql}\n${sql}\nrollback;\n`);
  } catch (e) {
    ok = false;
    mensaje = `${e.stderr ?? ""}`;
  }
  esperar("la migración se puede pegar dos veces", ok, mensaje);
}

// ============================================================================
// 5. La carrera: una orden que se está abriendo hace esperar al rechazo
// ============================================================================
async function carrera() {
  const probe = correr(`select p.id from retail.productos p where p.estado_alta = 'pendiente' and not p.es_prueba and exists (select 1 from retail.variantes v where v.producto_id = p.id) order by p.referencia limit 1;`);
  const pid = probe.ok ? lineas(probe)[0] : "";
  if (!pid) {
    console.log("• la carrera: no hay una prenda pendiente con variantes en la base local; se omite");
    return;
  }
  const antes = Number(lineas(correr(`select count(*) from retail.producciones;`))[0]);
  const A = `
begin;
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as v from retail.variantes where producto_id = '${pid}' limit 1 \\gset
insert into retail.producciones (ubicacion_id, producto_id, cantidad_plan) values (:'taller', '${pid}', 4) returning id as orden \\gset
insert into retail.produccion_lineas (produccion_id, variante_id, cantidad_plan) values (:'orden', :'v', 4);
select pg_sleep(3);
rollback;
`;
  const B = `
begin;
create or replace function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin execute p_sql; return 'ok';
exception when others then get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text; return coalesce(v_hint, '-') || ' :: ' || v_msg; end $f$;
${COMO(FELIPE)}
select pg_temp.intentar(format('select retail.revisar_producto_censo(%L, false)', '${pid}'));
rollback;
`;
  const correrAsync = (sql) =>
    new Promise((resolver) => {
      const t0 = Date.now();
      const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
      let salida = "";
      let error = "";
      p.stdout.on("data", (d) => (salida += d));
      p.stderr.on("data", (d) => (error += d));
      p.on("close", (codigo) => resolver({ codigo, salida: salida.trim(), error, ms: Date.now() - t0 }));
      p.stdin.end(sql);
    });
  const pa = correrAsync(A);
  await new Promise((r) => setTimeout(r, 1000)); // A ya insertó y duerme con su orden sin confirmar
  const pb = correrAsync(B);
  const [ra, rb] = await Promise.all([pa, pb]);
  const despues = Number(lineas(correr(`select count(*) from retail.producciones;`))[0]);
  esperar("la carrera: la sesión A abrió su orden sin confirmar y terminó bien", ra.codigo === 0, ra.error);
  esperar("la carrera: el rechazo ESPERÓ a que la orden en vuelo terminara (≥ 1,5 s)", rb.codigo === 0 && rb.ms >= 1500, { ms: rb.ms, salida: rb.salida, error: rb.error });
  esperar("la carrera: ninguna sesión dejó nada escrito", antes === despues, { antes, despues });
}
await carrera();

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
