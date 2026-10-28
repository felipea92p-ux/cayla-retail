#!/usr/bin/env node
/**
 * Prueba de `20261013195000_anular_venta_misma_sede.sql`: una venta la anula alguien de su tienda o un líder, igual que
 * `corregir_pagos_venta`.
 *
 * La escena es una venta SIN prendas en una caja abierta de la tienda que pide cada caso, insertada como `postgres` y
 * creada hoy: con cero líneas, `anular_venta` recorre sus candados sin depender de stock ni de `registrar_venta` (la
 * misma escena de `anular_venta_mismo_dia.mjs`). La cuenta que anula entra como `authenticated`, con su sesión. Cada caso
 * corre en una transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local no cambia.
 *
 * Una integrante SIN tienda de partida no se prueba porque no puede existir: `colaboradores_colaborador_con_ubicacion`
 * lo impide en la base. El `coalesce(…, false)` de la migración queda igual como resguardo.
 *
 * USO: pnpm pruebas:anular-venta-misma-sede   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261013195000_anular_venta_misma_sede.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed (parte en Tienda Lima)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante del seed, de Tienda Trujillo, con Devoluciones

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Una venta vacía de hoy en una caja abierta de `tienda`; deja `:venta`. */
const escena = (tienda) => `
select id as ubic from retail.ubicaciones where nombre = '${tienda}' \\gset
with existente as (select id from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta' limit 1),
nueva as (insert into retail.cajas (ubicacion_id, monto_apertura)
          select :'ubic', 0 where not exists (select 1 from existente) returning id)
select id as caja from existente union all select id from nueva \\gset
insert into retail.ventas (ubicacion_id, caja_id, created_at) values (:'ubic', :'caja', now()) returning id as venta \\gset
`;

// El «cómo se deshace»: quita el bloque que agrega la migración. Simula la base de antes (en el CI y en producción la
// migración ya está puesta).
const BLOQUE = MIGRACION.match(/\$v\$(  -- La venta la anula[\s\S]*?)  if v_venta\.estado = 'anulada' then\$v\$/)[1];
const DESHACER = `
do $d$ declare v text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
begin execute replace(v, $b$${BLOQUE}$b$, ''); end $d$;
`;

/** Anula como `quien` una venta de `tienda` y devuelve su estado final; si la base rechaza, lanza. */
function anular(quien, tienda, { conCandado = true } = {}) {
  return psql(`
begin;
${conCandado ? MIGRACION : DESHACER}
${escena(tienda)}
set local role authenticated;
set local request.jwt.claim.sub = '${quien}';
set local request.jwt.claims = '{"sub":"${quien}","role":"authenticated"}';
select retail.anular_venta(:'venta', 'prueba misma sede', '[]'::jsonb);
reset role;
select estado from retail.ventas where id = :'venta';
rollback;
`);
}

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

/** El caso pasa si la base rechaza con el candado de sede (42501, hint `venta_de_otra_sede`). */
function rechaza(quien, tienda, opciones) {
  try {
    return `se anuló y debía rechazarse (estado: ${anular(quien, tienda, opciones)})`;
  } catch (e) {
    const err = String(e.stderr);
    if (!/otra tienda/.test(err)) throw e;
  }
}

const anula = (quien, tienda, opciones) => {
  const estado = anular(quien, tienda, opciones).split("\n").filter(Boolean).at(-1);
  if (estado !== "anulada") return `estado: ${estado}`;
};

caso("CONTROL: deshecho el candado, una integrante de Trujillo SÍ anula una venta de Lima (el hueco existía)", () =>
  anula(MICAELA, "Tienda Lima", { conCandado: false }));
caso("con la migración, una integrante de Trujillo no anula una venta de Lima", () => rechaza(MICAELA, "Tienda Lima"));
caso("con la migración, una integrante de Trujillo anula una venta de su tienda", () => anula(MICAELA, "Tienda Trujillo"));
caso("con la migración, un líder anula una venta de otra tienda", () => anula(FELIPE, "Tienda Trujillo"));
caso("la migración se puede pegar dos veces: el candado queda una sola vez", () => {
  const n = psql(`
begin;
${MIGRACION}
${MIGRACION}
select (length(d) - length(replace(d, 'venta_de_otra_sede', ''))) / length('venta_de_otra_sede')
  from pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure) d;
rollback;`);
  if (n !== "1") return `el candado aparece ${n} veces`;
});
caso("migración y deshacer van y vuelven: la función queda idéntica a la de antes", () => {
  const HUELLA = `select md5(pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure));`;
  const [antes, despues] = psql(`
begin;
${DESHACER}
${HUELLA}
${MIGRACION}
${DESHACER}
${HUELLA}
rollback;`).split("\n").filter(Boolean);
  if (!antes || antes !== despues) return `antes ${antes} · después ${despues}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
