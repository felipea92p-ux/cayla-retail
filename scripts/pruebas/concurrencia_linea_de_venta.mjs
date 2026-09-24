#!/usr/bin/env node
/**
 * Dos terminales a la vez sobre la misma prenda vendida — ADR-0189 (migración
 * `20260924120000_concurrencia_cambios_devoluciones_conteo.sql`) contra el Postgres local.
 *
 * EL PROBLEMA. Prenda vendida 1; dos terminales hacen el cambio (o la devolución) al mismo tiempo. Antes, las dos
 * sumaban «ya cambiado» sin bloquear la línea: las dos veían 0 y las dos pasaban. Ahora la primera bloquea la línea
 * (`for no key update`) y la segunda ESPERA ahí; cuando la primera termina, la segunda cuenta lo que se guardó.
 *
 * CÓMO SE PRUEBA SIN COMMITEAR NADA. Dos sesiones de psql de verdad sobre una línea de venta YA confirmada en el local
 * (se elige sola: no anulada, con unidades libres). La sesión A hace su cambio/devolución y se queda quieta unos
 * segundos SIN confirmar; la sesión B intenta lo mismo con `lock_timeout` corto. Resultado esperado: B se corta por
 * `lock_timeout` (55P03) MIENTRAS espera la línea de venta (el contexto del error nombra `venta_items`). Las dos
 * sesiones terminan en ROLLBACK: no queda rastro. Antes del arreglo, la devolución B pasaba sin esperar («SIN_ERROR») y
 * el cambio B se trababa recién en el stock, no en la línea.
 *
 * Lo que pasa DESPUÉS de esperar (la segunda ve «quedan 0») no se puede ver sin confirmar A; lo cubren, en una sola
 * sesión, `pruebas:registrar-cambio` y `pruebas:crear-devolucion-motivo`.
 *
 * También verifica que la migración se pega dos veces sin duplicar nada (dentro de una transacción con ROLLBACK).
 *
 * USO
 *   pnpm pruebas:concurrencia-linea-venta    → necesita el stack local y la migración aplicada
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SQL_MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260924120000_concurrencia_cambios_devoluciones_conteo.sql"),
  "utf8"
);

const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function psqlEnParalelo(sql) {
  return new Promise((resolver) => {
    const p = spawn("docker", ARGS);
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolver({ codigo, salida: salida.trim(), error }));
    p.stdin.end(sql);
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// «SQLSTATE|contexto|mensaje» o «SIN_ERROR».
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_ctx text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_ctx = pg_exception_context, v_msg = message_text;
  return v_estado || '|' || replace(coalesce(v_ctx, ''), E'\\n', ' ') || '|' || v_msg;
end;
$f$;
`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 600)}`);
  }
}

/** Una línea ya confirmada, no anulada, con al menos una unidad libre y stock de su prenda en el piso de su sede. */
function elegirLinea() {
  const fila = psql(`
select vi.id, v.id, v.ubicacion_id, vi.variante_id
from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
where v.estado <> 'anulada'
  and not exists (select 1 from retail.venta_anulacion_items a where a.venta_item_id = vi.id)
  and vi.cantidad
      - (select coalesce(sum(c.cantidad), 0) from retail.cambios c where c.venta_item_id = vi.id)
      - (select coalesce(sum(di.cantidad), 0) from retail.devolucion_items di join retail.devoluciones d on d.id = di.devolucion_id
          where di.venta_item_id = vi.id and d.estado <> 'rechazada') >= 1
  and (select coalesce(sum(s.cantidad), 0) from retail.stock s
        where s.variante_id = vi.variante_id
          and s.sububicacion_id = retail.fn_sububicacion_por_defecto(v.ubicacion_id, 'venta')) >= 1
order by v.created_at desc
limit 1;`);
  if (!fila) return null;
  const [item, venta, ubic, variante] = fila.split("|");
  return { item, venta, ubic, variante };
}

async function dosSesiones(nombre, sqlA, sqlB) {
  const a = psqlEnParalelo(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${sqlA}
select pg_sleep(5);
rollback;
`);
  await dormir(2000); // A ya hizo su operación y sostiene el candado
  let b;
  try {
    b = psql(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local lock_timeout = '1500ms';
${INTENTO}
select pg_temp.intento($q$${sqlB}$q$);
rollback;
`);
  } catch (e) {
    b = `ERROR_DE_SCRIPT ${e.stderr ?? e.message}`;
  }
  const resA = await a;
  const [estado, contexto] = b.split("|");
  esperar(
    nombre,
    resA.codigo === 0 && estado === "55P03" && /venta_items/.test(contexto ?? ""),
    `A: código ${resA.codigo} ${resA.error.trim()} · B: ${b}`
  );
}

async function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- La migración se pega dos veces: cada marca queda una sola vez ----
  const marcas = psql(`
begin;
${SQL_MIGRACION}
${SQL_MIGRACION}
select string_agg(n::text, ',' order by orden) from (
  select orden, (length(d) - length(replace(d, marca, ''))) / length(marca) as n
  from (values
    (1, 'registrar_cambio', 'ADR-0189 (cambio)'),
    (2, 'crear_devolucion', 'ADR-0189 (devolucion-orden)'),
    (3, 'crear_devolucion', 'ADR-0189 (devolucion-regla)'),
    (4, 'conteo_contar', 'ADR-0189 (conteo-foto)'),
    (5, 'conteo_contar', 'cantidad_sistema = excluded.cantidad_sistema'),
    (6, 'cerrar_conteo', 'ADR-0189 (conteo-orden)')
  ) m(orden, fn, marca)
  cross join lateral (select pg_get_functiondef(p.oid) as d from pg_proc p
                      where p.proname = m.fn and p.pronamespace = 'retail'::regnamespace) x
) y;
rollback;`);
  esperar("la migración se pega dos veces: cada parche queda una sola vez en su función", marcas.split("\n").pop() === "1,1,1,1,1,1", marcas);

  const linea = elegirLinea();
  if (!linea) {
    console.log("· Sin prueba de dos sesiones: el local no tiene una línea de venta confirmada con unidades libres y stock.");
  } else {
    const items = `jsonb_build_array(jsonb_build_object('venta_item_id', '${linea.item}', 'cantidad', 1, 'condicion', 'vendible'))`;
    const cambio = `select retail.registrar_cambio('${linea.item}', '${linea.ubic}', '${linea.variante}', 1, null, gen_random_uuid(), 'talla_chica', 'vendible')`;
    const devolucion = `select retail.crear_devolucion('${linea.venta}', '${linea.ubic}', ${items}, 'prueba de concurrencia', 'talla')`;

    await dosSesiones("dos cambios a la vez de la misma prenda: el segundo espera a la línea de venta", `${cambio};`, cambio);
    await dosSesiones("dos devoluciones a la vez de la misma prenda: la segunda espera a la línea de venta", `${devolucion};`, devolucion);
    await dosSesiones("cambio y devolución a la vez de la misma prenda: la devolución espera a la línea de venta", `${cambio};`, devolucion);
  }

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
