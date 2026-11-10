#!/usr/bin/env node
/**
 * Prueba de `20261109140000_costo_de_compras_solo_por_funciones.sql` (ADR-0631, actualización b): el historial del costo de cada compra
 * (`costo_historial`) se lee solo por funciones, como el costo de cada prenda.
 *
 * QUÉ CUBRE
 *   · una integrante de la tienda (sin permiso de dinero) no lo lee directo: 42501;
 *   · un líder tampoco lo lee directo: el camino es la función;
 *   · el líder SÍ ve el costo por las funciones de siempre (`fn_costo_de_las_tallas`, `fn_costo_de_la_prenda`), corriendo como la tienda;
 *   · `service_role` (los scripts del servidor) lo sigue leyendo;
 *   · RLS sigue encendido y la tabla queda sin reglas de lectura (si alguien devuelve el permiso por error, responde vacío).
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK. Crea su propia prenda con una compra escrita directo (como superusuario) y después se
 * pone en el lugar de la cuenta (`set local role authenticated` + `request.jwt.claim.sub`).
 *
 * USO
 *   node scripts/pruebas/costo_de_compras_solo_por_funciones.mjs    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed), sin permiso de dinero

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// Una prenda propia con una compra: 1 talla que llegó a S/ 48 cuando no había ninguna.
const PRENDA = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
with p as (
  insert into retail.productos (categoria_id, referencia, descripcion)
  select id, 'Prueba permiso ' || substr(gen_random_uuid()::text, 1, 8), 'prenda propia de la prueba' from retail.categorias order by nombre limit 1
  returning id)
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, (select codigo from retail.colores where activo order by codigo limit 1),
       (select id from retail.tallas where activo and estado = 'aprobado' order by valor limit 1), 'PRUEBA-PERMISO-' || substr(gen_random_uuid()::text, 1, 8), 89.90, 48
  from p;
select id as v1, producto_id as p1 from retail.variantes where sku like 'PRUEBA-PERMISO-%' order by created_at desc limit 1 \\gset
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 1, 'prueba', '2030-10-05') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 0, 45, 1, 48, 48, 'compra', id, '2030-10-05' from m;
`;

const como = (id) => `set local request.jwt.claim.sub = '${id}';
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
set local role authenticated;
`;

function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRENDA}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 800)}`);
  }
}
const negado = (r) => !r.ok && /permission denied for table costo_historial|permiso denegado a la tabla costo_historial/.test(r.mensaje);

const integrante = correr(`${como(MICAELA)}select count(*) from retail.costo_historial;`);
esperar("una integrante sin permiso de dinero no lee el historial directo (42501)", negado(integrante), integrante);

const lider = correr(`${como(FELIPE)}select count(*) from retail.costo_historial;`);
esperar("un líder tampoco lo lee directo: el camino es la función", negado(lider), lider);

const funciones = correr(`${como(FELIPE)}
select 'tallas|' || coalesce((retail.fn_costo_de_las_tallas(:'p1') -> 'tallas' -> (:'v1')::text ->> 'quedo'), 'null');
select 'prenda|' || coalesce((retail.fn_costo_de_la_prenda(:'p1') -> 'compras' -> 0 ->> 'costo_llegaron'), 'null');`);
const linea = (clave) => (funciones.ok ? funciones.salida.split("\n").find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1) : null);
esperar("el líder sí ve el costo por las funciones de siempre, corriendo como la tienda",
  funciones.ok && Number(linea("tallas")) === 48 && Number(linea("prenda")) === 48, funciones);

const servidor = correr(`set local role service_role;\nselect 'filas|' || count(*) from retail.costo_historial where variante_id = :'v1';`);
esperar("service_role (los scripts del servidor) lo sigue leyendo", servidor.ok && servidor.salida.includes("filas|1"), servidor);

const reglas = correr(`select 'rls|' || relrowsecurity from pg_class where oid = 'retail.costo_historial'::regclass;
select 'politicas|' || count(*) from pg_policies where schemaname = 'retail' and tablename = 'costo_historial';
select 'permiso|' || has_table_privilege('authenticated', 'retail.costo_historial', 'select');`);
esperar("RLS sigue encendido, sin reglas de lectura y sin permiso para la tienda",
  reglas.ok && reglas.salida.includes("rls|t") && reglas.salida.includes("politicas|0") && reglas.salida.includes("permiso|f"), reglas);

console.log(fallos ? `\n${fallos} falló` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
