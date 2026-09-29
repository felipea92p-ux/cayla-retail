#!/usr/bin/env node
/**
 * Prueba de `20260929180000_productos_orden_recientes_y_vendidos.sql` (Felipe, 2026-09-29): el listado de Productos se
 * ordena por «más recientes», «más antiguos», «más vendidos» y «menos vendidos», y los órdenes de siempre (por nombre y por
 * precio) no cambian.
 *
 * La escena: los productos de la siembra local, con fechas de alta puestas a mano y las ventas de los últimos 30 días que ya
 * trae la siembra (más dos ventas ANTIGUAS que no deben contar). Cada caso corre en su transacción con las migraciones
 * aplicadas dentro (la cifra única, su lectura del Catálogo y esta) y TERMINA EN ROLLBACK: no deja nada.
 *
 * El control: sin la migración, `recientes` se rechaza con «Orden de catálogo desconocido» (prueba de que el caso mira lo que
 * tiene que mirar). Y aplicarla dos veces no falla ni cambia nada la segunda.
 *
 * USO: pnpm pruebas:productos-orden   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const CIFRA = leer("20260929010000_fn_existencias_una_sola_cifra.sql");
const LECTURAS = leer("20260929020000_catalogo_y_otras_sedes_leen_la_cifra_unica.sql");
const ORDEN = leer("20260929180000_productos_orden_recientes_y_vendidos.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

// Las fechas de alta de la escena: cuatro productos con fechas conocidas y el resto, viejos y todos iguales (como un lote del
// censo: la misma hora). Y dos ventas de hace 40 días sobre «Casaca Ximena», que NO deben contar como vendidas.
const ESCENA = `
set local request.jwt.claim.sub = '${FELIPE}';
set local session_replication_role = replica;
update retail.productos set created_at = now() - interval '100 days';
update retail.productos set created_at = now()                       where referencia = 'Falda Ariana';
update retail.productos set created_at = now() - interval '1 day'    where referencia = 'Vestido Antonella';
update retail.productos set created_at = now() - interval '2 days'   where referencia = 'Pantalón Mía';
update retail.productos set created_at = now() - interval '3 days'   where referencia = 'Blusa Valentina';
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
select v.id, u.id, 'salida', 7, 'venta', now() - interval '40 days'
from retail.variantes v join retail.productos p on p.id = v.producto_id, retail.ubicaciones u
where p.referencia = 'Casaca Ximena' and u.nombre = 'Tienda Lima' limit 2;
set local session_replication_role = origin;
`;

/** Los productos en el orden en que aparecen (una sola vez cada uno), como una lista separada por «|». */
const ORDEN_DE = (args) => `
select string_agg(referencia, '|' order by primero) from (
  select referencia, min(rn) as primero
  from (select referencia, row_number() over () as rn from retail.fn_productos(${args})) x
  group by referencia
) y;`;

/** Lo mismo, contando las unidades vendidas por su lado (sin pasar por la función) para comparar. */
const VENDIDAS_ESPERADAS = `
select string_agg(referencia, '|' order by u desc, referencia) from (
  select p.referencia, coalesce(sum(m.cantidad), 0) as u
  from retail.productos p join retail.variantes v on v.producto_id = p.id
  left join retail.movimientos m on m.variante_id = v.id and m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days'
  where p.id <> '11111111-1111-4111-8111-111111111111'
  group by p.id, p.referencia
) z;`;
const VENDIDAS_ESPERADAS_ASC = VENDIDAS_ESPERADAS.replace("order by u desc, referencia", "order by u asc, referencia");

const dentro = (cuerpo, { conOrden = true } = {}) =>
  psql(`begin;\n${CIFRA}\n${LECTURAS}\n${conOrden ? ORDEN : ""}\n${ESCENA}\n${cuerpo}\nrollback;`);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
const igual = (real, esperado) => (real === esperado ? null : `esperaba «${esperado}» y salió «${real}»`);

caso("control: sin la migración, «recientes» se rechaza", () => {
  try {
    dentro(`select count(*) from retail.fn_productos(p_orden => 'recientes');`, { conOrden: false });
    return "no se rechazó: la prueba no está mirando lo que debe";
  } catch (e) {
    return /Orden de catálogo desconocido/.test(String(e.stderr)) ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("recientes: primero lo último que se cargó; el lote viejo, por nombre", () => {
  const r = dentro(ORDEN_DE(`p_orden => 'recientes', p_por_pagina => 100`));
  const cuatro = r.split("|").slice(0, 4).join("|");
  return igual(cuatro, "Falda Ariana|Vestido Antonella|Pantalón Mía|Blusa Valentina");
});

caso("recientes: el resto (todos con la misma hora) sale por nombre, siempre igual", () => {
  const r = dentro(ORDEN_DE(`p_orden => 'recientes', p_por_pagina => 100`)).split("|").slice(4);
  return igual(r.join("|"), [...r].sort((a, b) => a.localeCompare(b, "es")).join("|"));
});

caso("antiguos: lo más viejo primero y lo último al final", () => {
  const r = dentro(ORDEN_DE(`p_orden => 'antiguos', p_por_pagina => 100`)).split("|");
  return igual(r.slice(-4).join("|"), "Blusa Valentina|Pantalón Mía|Vestido Antonella|Falda Ariana");
});

caso("paginado con orden: la página 2 sigue a la 1, sin repetir ni saltar", () => {
  const p1 = dentro(ORDEN_DE(`p_orden => 'recientes', p_pagina => 1, p_por_pagina => 3`));
  const p2 = dentro(ORDEN_DE(`p_orden => 'recientes', p_pagina => 2, p_por_pagina => 3`));
  const todo = dentro(ORDEN_DE(`p_orden => 'recientes', p_por_pagina => 100`)).split("|");
  return igual(`${p1}|${p2}`, todo.slice(0, 6).join("|"));
});

caso("vendidos_desc: cuadra con la suma de movimientos de venta de 30 días (las de hace 40 no cuentan)", () => {
  const real = dentro(ORDEN_DE(`p_orden => 'vendidos_desc', p_por_pagina => 100`));
  const esperado = dentro(VENDIDAS_ESPERADAS);
  return igual(real, esperado);
});

caso("vendidos_desc: «Casaca Ximena» (solo ventas viejas) no queda entre los vendidos", () => {
  const r = dentro(ORDEN_DE(`p_orden => 'vendidos_desc', p_por_pagina => 100`)).split("|");
  const conVentas = dentro(`select count(distinct p.referencia) from retail.productos p join retail.variantes v on v.producto_id = p.id
    join retail.movimientos m on m.variante_id = v.id and m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days';`);
  return r.indexOf("Casaca Ximena") >= Number(conVentas) ? null : `«Casaca Ximena» salió entre los ${conVentas} con ventas de los últimos 30 días`;
});

caso("vendidos_asc: cuadra con el orden contrario (los sin ventas primero, por nombre)", () => {
  const real = dentro(ORDEN_DE(`p_orden => 'vendidos_asc', p_por_pagina => 100`));
  const esperado = dentro(VENDIDAS_ESPERADAS_ASC);
  return igual(real, esperado);
});

caso("con filtro de stock + orden nuevo: el mismo conjunto que sin orden, ordenado", () => {
  const conjunto = (a) => dentro(`select string_agg(referencia, '|' order by referencia) from (select distinct referencia from retail.fn_productos(${a})) x;`);
  const a = conjunto(`p_stock => 'sin_stock', p_por_pagina => 100`);
  const b = conjunto(`p_stock => 'sin_stock', p_orden => 'recientes', p_por_pagina => 100`);
  return igual(b, a);
});

caso("sin regresión: nombre, precio ↑ y precio ↓ salen igual que sin la migración", () => {
  const variantes = ["", "p_orden => 'precio_asc',", "p_orden => 'precio_desc',"];
  for (const v of variantes) {
    const consulta = `select string_agg(producto_id::text || ':' || coalesce(variante_id::text, ''), ',') from retail.fn_productos(${v} p_por_pagina => 100);`;
    const antes = dentro(consulta, { conOrden: false });
    const despues = dentro(consulta, { conOrden: true });
    if (antes !== despues) return `cambió el resultado con «${v || "nombre"}»`;
  }
  return null;
});

caso("un orden desconocido se sigue rechazando", () => {
  try {
    dentro(`select count(*) from retail.fn_productos(p_orden => 'vendidos');`);
    return "«vendidos» a secas se aceptó";
  } catch (e) {
    return /Orden de catálogo desconocido/.test(String(e.stderr)) ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("aplicarla dos veces no falla ni cambia la función la segunda vez", () => {
  const r = psql(`begin;\n${CIFRA}\n${LECTURAS}\n${ORDEN}\nselect md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_productos' \\gset uno_\n${ORDEN}\nselect md5(prosrc) = :'uno_md5' from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_productos';\nrollback;`);
  return igual(r.split("\n").pop(), "t");
});

caso("la función conserva su forma: security definer, search_path fijo y el permiso de quien la llama", () => {
  const r = dentro(`select prosecdef::text || '|' || coalesce((select bool_or(c like 'search_path=%') from unnest(proconfig) c), false)::text || '|' || has_function_privilege('authenticated', p.oid, 'execute')::text
    from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_productos';`);
  return igual(r, "true|true|true");
});

console.log(`\n${total - fallas}/${total} casos.`);
process.exit(fallas ? 1 : 0);
