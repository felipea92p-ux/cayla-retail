#!/usr/bin/env node
/**
 * Prueba de «Por completar ▸ Sin costo» en Catálogo ▸ Productos (migración `20261112155000_productos_por_completar_sin_costo.sql`).
 *
 * Vigila en la BASE:
 *   · con todas las variantes con costo, «Sin costo» no trae nada; con UNA variante en 0, trae justo esa prenda (es por variante);
 *   · el conteo de la opción (`fn_productos_facetas` ▸ falta ▸ costo) dice lo mismo que la lista;
 *   · quien no ve el dinero de Compras no encuentra nada con «Sin costo» ni ve la opción en el conteo (saber qué no tiene costo
 *     ya dice algo del costo);
 *   · las faltas de antes (foto) siguen iguales; la migración se puede pegar dos veces.
 * Con control: sin la migración, la lista rechaza «costo» como falta desconocida.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * USO: pnpm pruebas:productos-sin-costo   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261112155000_productos_por_completar_sin_costo.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed: ve el dinero
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: no ve el dinero de Compras

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const como = (cuenta) => `set local request.jwt.claim.sub = '${cuenta}';
set local request.jwt.claims = '{"sub":"${cuenta}","role":"authenticated"}';
set local role authenticated;`;

// Todas las variantes con costo y UNA (la primera activa de la primera prenda activa) en 0: deja `:prenda` con su nombre.
const ESCENA = `update retail.variantes set costo = 50;
select p.referencia as prenda, v.id as variante from retail.variantes v join retail.productos p on p.id = v.producto_id
  where v.activo and p.estado = 'activo' and p.id <> '11111111-1111-4111-8111-111111111111' order by p.referencia, v.id limit 1 \\gset
update retail.variantes set costo = 0 where id = :'variante';`;

/** Corre `cuerpo` con la migración (salvo `sinMigracion`) y la escena, y devuelve la última línea. */
const dentro = (cuerpo, { sinMigracion = false, escena = ESCENA, dosVeces = false } = {}) =>
  psql(`begin;\n${sinMigracion ? "" : MIGRACION}\n${dosVeces ? MIGRACION : ""}\n${escena}\n${cuerpo}\nrollback;`)
    .split("\n")
    .filter(Boolean)
    .at(-1);

const LISTA = `(select coalesce(string_agg(distinct referencia, '|'), '') from retail.fn_productos_listado(p_falta => 'costo', p_por_pagina => 100))`;
const CONTEO = `coalesce(retail.fn_productos_facetas()->'facetas'->'falta'->>'costo', '—')`;

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

caso("con todas las variantes con costo, «Sin costo» no trae nada y el conteo no trae la opción", () =>
  igual(dentro(`${como(FELIPE)}\nselect ${LISTA} || '#' || ${CONTEO};`, { escena: "update retail.variantes set costo = 50;" }), "#—"));

caso("una variante en 0: la lista trae esa prenda y el conteo dice 1", () =>
  igual(dentro(`${como(FELIPE)}\nselect (${LISTA} = :'prenda')::text || '#' || ${CONTEO};`), "true#1"));

caso("es por variante: la prenda sale aunque sus otros colores y tallas tengan costo", () =>
  igual(
    // Cuántas variantes de la prenda tienen costo se mira antes de entrar como la cuenta (la tabla no se lee directo desde la API).
    dentro(`select count(*) as con_costo from retail.variantes v join retail.productos p on p.id = v.producto_id
         where p.referencia = :'prenda' and v.activo and v.costo > 0 \\gset
${como(FELIPE)}
select :con_costo > 0 and ${LISTA} = :'prenda';`),
    "t",
  ));

caso("el total con el filtro puesto es lo que dice la opción", () =>
  igual(dentro(`${como(FELIPE)}\nselect (retail.fn_productos_facetas(p_falta => 'costo')->>'total') || '#' || ${CONTEO};`), "1#1"));

caso("costo vacío cuenta igual que 0", () =>
  igual(
    dentro(`${como(FELIPE)}\nselect ${CONTEO};`, {
      // La columna hoy es not null; si un día admite vacío, la regla ya lo cubre. Se prueba quitándole el candado dentro de la transacción.
      escena: `${ESCENA}\nalter table retail.variantes alter column costo drop not null;\nupdate retail.variantes set costo = null where id = :'variante';`,
    }),
    "1",
  ));

caso("quien no ve el dinero de Compras no encuentra nada con «Sin costo» ni ve la opción", () =>
  igual(dentro(`${como(MICAELA)}\nselect retail.fn_puede_ver_dinero_de_compras()::text || '#' || ${LISTA} || '#' || ${CONTEO};`), "false##—"));

caso("las faltas de antes siguen iguales (foto)", () => {
  const consulta = `${como(FELIPE)}\nselect (select count(distinct producto_id) from retail.fn_productos_listado(p_falta => 'foto', p_por_pagina => 100))
    || '#' || coalesce(retail.fn_productos_facetas()->'facetas'->'falta'->>'foto', '—');`;
  return igual(dentro(consulta), dentro(consulta, { sinMigracion: true }));
});

caso("pegarla dos veces deja lo mismo", () =>
  igual(dentro(`${como(FELIPE)}\nselect (${LISTA} = :'prenda')::text || '#' || ${CONTEO};`, { dosVeces: true }), "true#1"));

caso("control: sin la migración, la lista rechaza «costo»", () => {
  try {
    dentro(`${como(FELIPE)}\nselect ${LISTA};`, { sinMigracion: true });
    return "sin la migración la lista aceptó «costo»: el caso no mira lo que cree";
  } catch (e) {
    return /Falta desconocida/.test(String(e.stderr)) ? null : String(e.stderr).split("\n")[0];
  }
});

console.log(`\n${total - fallas}/${total} casos`);
process.exit(fallas ? 1 : 0);
