#!/usr/bin/env node
/**
 * Prueba del reparto entre proveedores (ADR-0521 act. c): `20261026194000_proveedor_reparto_entre_proveedores.sql`.
 *
 * QUÉ PROMETE
 *   · LA SUMA CUADRA, en toda la base: por cada variante, lo vendido de todos los proveedores suma lo vendido real (en total, por día y por sede),
 *     y su stock suma el stock real de cada sede. Antes, una prenda de dos proveedores les contaba sus ventas enteras a los dos.
 *   · NADIE HEREDA VENTAS DE ANTES DE LLEGAR: con la carga de A (40), 36 vendidas, después lo de B (40) por Compras y 4 vendidas más, A suma 38 y
 *     B 2; a A le quedan 2 y a B 38. Lo dicen las tres funciones: «Lo que le compré», las ventas por día y las tallas y sedes.
 *   · Las prendas de un solo proveedor no cambian.
 *   · `fn_proveedor_reparto()` no la ejecuta nadie desde afuera (ni anon ni authenticated).
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada, una prenda nueva con su historia (las fechas se escriben a mano: en una
 * transacción `now()` es una sola) y ROLLBACK siempre. Insertar un movimiento no mueve `stock` (lo hacen las funciones): el stock se escribe aparte.
 *
 * USO
 *   pnpm pruebas:proveedor-reparto                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/proveedor_reparto.mjs --contenedor <otro>   → contra otro contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261026194000_proveedor_reparto_entre_proveedores.sql"), "utf8").replace(/^set lock_timeout.*$/gm, "");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const ARGS = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

let fallas = 0;
function esperar(nombre, ok, detalle) {
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 8).join("\n    ")}`);
  }
}

// 1. En toda la base, la suma entre proveedores es lo real: lo vendido por variante, por día y por sede, y el stock por sede.
const toda = correr(`begin;
${MIGRACION}
with r as (select * from retail.fn_proveedor_reparto()),
real_mov as (
  select m.variante_id as vid, m.ubicacion_id as uid, (timezone('America/Lima', m.created_at))::date as dia,
         sum(case when m.tipo = 'salida' then m.cantidad else -m.cantidad end) as uds
  from retail.movimientos m
  where ((m.tipo = 'salida' and m.motivo in ('venta', 'cambio')) or (m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta')))
    and m.variante_id in (select variante_id from r where clase in ('compra', 'carga'))
  group by 1, 2, 3
),
rep_mov as (
  select variante_id as vid, ubicacion_id as uid, (timezone('America/Lima', cuando))::date as dia, sum(uds) as uds
  from r where clase = 'venta' group by 1, 2, 3
),
real_st as (
  select s.variante_id as vid, s.ubicacion_id as uid, sum(s.cantidad) as uds from retail.stock s
  where s.variante_id in (select variante_id from r where clase in ('compra', 'carga')) group by 1, 2 having sum(s.cantidad) <> 0
),
rep_st as (select variante_id as vid, ubicacion_id as uid, sum(uds) as uds from r where clase = 'stock' group by 1, 2)
select 'ventas-descuadradas|' || count(*) from real_mov rm full join rep_mov rp using (vid, uid, dia) where coalesce(rm.uds, 0) <> coalesce(rp.uds, 0);
with r as (select * from retail.fn_proveedor_reparto()),
real_st as (
  select s.variante_id as vid, s.ubicacion_id as uid, sum(s.cantidad) as uds from retail.stock s
  where s.variante_id in (select variante_id from r where clase in ('compra', 'carga')) group by 1, 2 having sum(s.cantidad) <> 0
),
rep_st as (select variante_id as vid, ubicacion_id as uid, sum(uds) as uds from r where clase = 'stock' group by 1, 2)
select 'stock-descuadrado|' || count(*) from real_st rs full join rep_st rp using (vid, uid) where coalesce(rs.uds, 0) <> coalesce(rp.uds, 0);
`);
esperar("en toda la base, lo vendido de todos los proveedores suma lo vendido real, por variante, día y sede", toda.ok && toda.salida.includes("ventas-descuadradas|0"), toda.salida || toda.error);
esperar("en toda la base, el stock de todos los proveedores suma el stock real de cada sede", toda.ok && toda.salida.includes("stock-descuadrado|0"), toda.salida || toda.error);

// 2. Una prenda de dos proveedores, con su historia.
const PRENDA = `begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as pa from retail.proveedores where activo and not retail.fn_proveedor_es_taller(id) order by nombre, id limit 1 \\gset
select id as pb from retail.proveedores where activo and not retail.fn_proveedor_es_taller(id) and id <> :'pa' order by nombre, id limit 1 \\gset
-- Lo que B ya vendió esta semana con otras prendas (la base del CI puede tenerlo): la prueba mira solo lo que suma esta prenda.
select coalesce(sum(d.vendidas), 0) as diarias_antes from retail.fn_proveedores_ventas_diarias(28) d
  where d.proveedor_id = :'pb' and d.dia >= retail.fn_hoy_lima() - 6 \\gset
insert into retail.productos (referencia, estado, proveedor_id) values ('ZZ Reparto dos proveedores', 'activo', :'pa') returning id as p \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p', 'ZZ-REPARTO-M', 100, 40, true) returning id as v \\gset
-- A (el habitual) trajo 40 por la carga inicial; se vendieron 36 en Lima.
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota, created_at)
  values (:'v', :'lima', 'entrada', 40, 'carga_inicial', :'yo', 'carga de A', now() - interval '60 days');
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota, created_at)
  values (:'v', :'lima', 'salida', 36, 'venta', :'yo', 'antes de B', now() - interval '30 days');
-- B trajo 40 por Compras (un envío con su lote); después se vendieron 3 en Lima y 1 en Trujillo.
insert into retail.lotes (ubicacion_id, proveedor_id) values (:'lima', :'pb') returning id as lote \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota, lote_id, created_at)
  values (:'v', :'lima', 'entrada', 40, 'recepcion', :'yo', 'llegó lo de B', :'lote', now() - interval '10 days');
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota, created_at)
  values (:'v', :'lima', 'salida', 3, 'venta', :'yo', 'después de B', now() - interval '5 days');
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota, created_at)
  values (:'v', :'tru', 'salida', 1, 'venta', :'yo', 'después de B', now() - interval '2 days');
-- Quedan 40: 30 en Lima y 10 en Trujillo.
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'v', :'lima', 30), (:'v', :'tru', 10);
`;
const p = correr(`${PRENDA}
select 'base|' || (b.proveedor_id = :'pa') || '|' || b.unidades_compradas || '|' || b.unidades_vendidas || '|' || b.stock_actual
from retail.fn_proveedor_prendas_base(null) b where b.producto_id = :'p' order by 1;
select 'antes-de-B|' || coalesce(sum(uds), 0) from retail.fn_proveedor_reparto() where variante_id = :'v' and proveedor_id = :'pb' and clase = 'venta' and cuando < now() - interval '10 days';
select 'diarias-B|' || (coalesce(sum(d.vendidas), 0) - :diarias_antes) from retail.fn_proveedores_ventas_diarias(28) d where d.proveedor_id = :'pb' and d.dia >= retail.fn_hoy_lima() - 6;
select 'tallas-B|' || sum(t.vendidas) || '|' || sum(t.stock) || '|' || (min(t.primera_llegada) >= (now() - interval '11 days')::date) from retail.fn_proveedor_tallas_sedes(:'pb') t where t.producto_id = :'p';
select 'tallas-A|' || sum(t.vendidas) || '|' || sum(t.stock) from retail.fn_proveedor_tallas_sedes(:'pa') t where t.producto_id = :'p';
select 'sede|' || u.nombre || '|' || sum(r.uds) from retail.fn_proveedor_reparto() r join retail.ubicaciones u on u.id = r.ubicacion_id
where r.variante_id = :'v' and r.clase = 'stock' group by u.nombre order by u.nombre;
`);
const lineas = p.ok ? p.salida.split("\n") : [];
esperar("A (el habitual): le llegaron 40, se le vendieron 38 y le quedan 2", lineas.includes("base|true|40|38|2"), p.salida || p.error);
esperar("B: le llegaron 40, se le vendieron 2 y le quedan 38 (antes contaba las 40 ventas y las 40 en tienda)", lineas.includes("base|false|40|2|38"), p.salida || p.error);
esperar("las 36 vendidas antes de que llegara lo de B son todas de A", lineas.includes("antes-de-B|0"), p.salida || p.error);
esperar("las ventas por día de B en su última semana suman lo suyo (2), no las 4 de la variante", lineas.includes("diarias-B|2"), p.salida || p.error);
esperar("tallas y sedes de B: 2 vendidas y 38 en tienda, y su llegada cuenta desde que trajo lo suyo", lineas.includes("tallas-B|2|38|true"), p.salida || p.error);
esperar("tallas y sedes de A: 38 vendidas y 2 en tienda", lineas.includes("tallas-A|38|2"), p.salida || p.error);
esperar("el stock de cada sede suma lo que hay de verdad (Lima 30, Trujillo 10)", lineas.includes("sede|Tienda Lima|30") && lineas.includes("sede|Tienda Trujillo|10"), p.salida || p.error);

// 3. La llave: nadie la ejecuta desde afuera.
const llave = correr(`begin;\n${MIGRACION}\nselect 'anon|' || has_function_privilege('anon', 'retail.fn_proveedor_reparto()', 'execute');\nselect 'auth|' || has_function_privilege('authenticated', 'retail.fn_proveedor_reparto()', 'execute');`);
esperar("fn_proveedor_reparto no la ejecuta anon ni authenticated", llave.ok && llave.salida.includes("anon|f") && llave.salida.includes("auth|f"), llave.salida || llave.error);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
