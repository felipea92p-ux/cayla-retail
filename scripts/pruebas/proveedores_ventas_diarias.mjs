#!/usr/bin/env node
/**
 * Prueba de las ventas por día de cada proveedor (ranking de Proveedores, ADR-0521): `20261026172000_proveedores_ventas_diarias.sql`.
 *
 * QUÉ PROMETE
 *   · Una venta de hoy de una prenda del proveedor suma en el día de hoy de ESE proveedor, y una devolución la resta (lo vendido es neto,
 *     la misma cuenta que «Lo que le compré»).
 *   · La suma de los últimos 90 días nunca pasa lo vendido de siempre del ranking (`fn_proveedores_rendimiento`): las dos cuentas no se
 *     contradicen.
 *   · El Taller (CAYLA SAC) no aparece: va aparte en todo Proveedores.
 *   · Los días pedidos se acotan a 7–90.
 *   · La llave: sin la sesión de quien ve la plata de proveedores se rechaza, y anon no la ejecuta.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada, y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:proveedores-ventas-diarias                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/proveedores_ventas_diarias.mjs --contenedor <otro>   → contra otro contenedor
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
// La función nació en 20261026172000 y el reparto entre proveedores (20261026194000) la reemplazó: se pegan las dos, en orden.
const leer = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8").replace(/^set lock_timeout.*$/gm, "");
const MIGRACION = `${leer("20261026172000_proveedores_ventas_diarias.sql")}\n${leer("20261026194000_proveedor_reparto_entre_proveedores.sql")}`;
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
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}

// Todo sale del seed por su nombre o su código (los ids cambian en cada base). La talla es de UN solo proveedor (con dos, la venta se reparte:
// eso lo prueba proveedor_reparto.mjs). La prueba mueve el stock como la tienda: lo que entra llega por una recepción suya y la venta lo baja; si
// no, la carga estimada le inventaría prendas al proveedor habitual y la talla pasaría a tener dos.
const PREPARAR = `
begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
with aportes as (select distinct r.proveedor_id, r.variante_id from retail.fn_proveedor_reparto() r where r.clase in ('compra', 'carga'))
select a.proveedor_id as prov, a.variante_id as vid
  from aportes a join retail.variantes v on v.id = a.variante_id
  where not retail.fn_proveedor_es_taller(a.proveedor_id)
    and (select count(*) from aportes b where b.variante_id = a.variante_id) = 1
  order by v.sku limit 1 \\gset
select coalesce((select vendidas from retail.fn_proveedores_ventas_diarias(28) where proveedor_id = :'prov' and dia = retail.fn_hoy_lima()), 0) as antes \\gset
`;

// 1. Una venta de hoy suma; una devolución resta.
const r = correr(`${PREPARAR}
insert into retail.lotes (ubicacion_id, proveedor_id) values (:'lima', :'prov') returning id as lote \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota, lote_id) values (:'vid', :'lima', 'entrada', 5, 'recepcion', :'yo', 'llegó para la prueba', :'lote');
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota) values (:'vid', :'lima', 'salida', 3, 'venta', :'yo', 'venta de prueba');
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'vid', :'lima', 2)
  on conflict (variante_id, ubicacion_id, sububicacion_id) do update set cantidad = retail.stock.cantidad + excluded.cantidad;
select 'tras-venta|' || (coalesce((select vendidas from retail.fn_proveedores_ventas_diarias(28) where proveedor_id = :'prov' and dia = retail.fn_hoy_lima()), 0) - :antes);
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota) values (:'vid', :'lima', 'entrada', 1, 'devolucion', :'yo', 'devolución de prueba');
update retail.stock set cantidad = cantidad + 1 where variante_id = :'vid' and ubicacion_id = :'lima' and sububicacion_id is null;
select 'tras-devolucion|' || (coalesce((select vendidas from retail.fn_proveedores_ventas_diarias(28) where proveedor_id = :'prov' and dia = retail.fn_hoy_lima()), 0) - :antes);
`);
esperar("una venta de 3 de hoy suma 3 en el día de hoy de su proveedor", r.ok && r.salida.includes("tras-venta|3"), r.salida || r.error);
esperar("una devolución de 1 la deja en 2 (lo vendido es neto)", r.ok && r.salida.includes("tras-devolucion|2"), r.salida || r.error);

// 2. Nunca pasa lo vendido de siempre del ranking, y el Taller no aparece.
const c = correr(`${PREPARAR}
select 'pasa|' || count(*) from (
  select d.proveedor_id, sum(d.vendidas) as s from retail.fn_proveedores_ventas_diarias(90) d group by d.proveedor_id
) x join retail.fn_proveedores_rendimiento() r on r.proveedor_id = x.proveedor_id where x.s > r.unidades_vendidas;
select 'taller|' || count(*) from retail.fn_proveedores_ventas_diarias(90) d where retail.fn_proveedor_es_taller(d.proveedor_id);
`);
esperar("la suma de 90 días de ningún proveedor pasa lo vendido de siempre del ranking", c.ok && c.salida.includes("pasa|0"), c.salida || c.error);
esperar("el Taller no aparece", c.ok && c.salida.includes("taller|0"), c.salida || c.error);

// 3. Los días se acotan a 7–90.
const d = correr(`${PREPARAR}
select 'corto|' || coalesce(bool_and(dia >= retail.fn_hoy_lima() - 6), true) from retail.fn_proveedores_ventas_diarias(1);
select 'largo|' || coalesce(bool_and(dia >= retail.fn_hoy_lima() - 89), true) from retail.fn_proveedores_ventas_diarias(1000);
`);
esperar("pedir 1 día da los últimos 7 y pedir 1000 da los últimos 90", d.ok && d.salida.includes("corto|true") && d.salida.includes("largo|true"), d.salida || d.error);

// 4. La llave.
const sin = correr(`begin;\n${MIGRACION}\nset local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000000';\nselect count(*) from retail.fn_proveedores_ventas_diarias(28);`);
esperar("sin la llave de la plata de proveedores, se rechaza", !sin.ok && /necesitan Proveedores/.test(sin.error), sin.salida || sin.error);
const anon = correr(`begin;\n${MIGRACION}\nselect has_function_privilege('anon', 'retail.fn_proveedores_ventas_diarias(integer)', 'execute');`);
esperar("anon no la ejecuta", anon.ok && anon.salida.endsWith("f"), anon.salida || anon.error);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
