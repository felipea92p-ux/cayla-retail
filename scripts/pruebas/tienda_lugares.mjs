#!/usr/bin/env node
/**
 * Una tienda solo tiene piso, almacén y Cuarentena (ADR-0408, integración; Felipe 2026-10-15) contra el Postgres local — CAYLA V2.
 *
 * POR QUÉ. La tienda online dice «hay» con `fn_tienda_disponible` (todo lugar de la tienda menos la Cuarentena) y el motor del
 * pedido web reserva solo del piso, del almacén o de lo sin lugar. Las dos reglas cuentan lo mismo mientras una tienda no tenga
 * otro tipo de lugar: `20261015060000_tienda_solo_piso_almacen_y_cuarentena.sql` lo hace cumplir con un disparador.
 *
 * QUÉ PRUEBA.
 *   1. Hoy ningún lugar de una tienda es de otro tipo (ni sin tipo).
 *   2. En una tienda no se crea un «rack», ni un lugar sin tipo, ni se cambia un lugar a «rack», ni se lleva a la tienda un rack
 *      del Taller: la base se niega con el hint `sububicacion_de_tienda`.
 *   3. El Taller sigue pudiendo tener racks, y en una tienda se sigue pudiendo cambiar el nombre de un lugar.
 *   4. Control: sin el disparador, el rack en la tienda PASA (la prueba no está ciega).
 *   5. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK: nada queda en el Postgres local que comparten los worktrees.
 * `APLICAR_ANTES=1` mete la migración dentro de cada transacción (para probarla antes de aplicarla).
 *
 * DA POR SENTADO: al menos una ubicación de tipo «tienda» con sus lugares (el seed). Si no hay Taller, el escenario del Taller
 * se informa y no cuenta.
 *
 * USO
 *   pnpm pruebas:tienda-lugares
 *   pnpm pruebas:tienda-lugares -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261015060000_tienda_solo_piso_almacen_y_cuarentena.sql";
const SQL_MIGRACION = readFileSync(MIGRACION, "utf8");
const APLICAR_ANTES = process.env.APLICAR_ANTES ? SQL_MIGRACION : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}

// Cada escenario: su transacción, la migración si se pide, y ROLLBACK al final. `:tienda` y `:taller` son la primera de cada una.
const envolver = (cuerpo) => `
begin;
${APLICAR_ANTES}
set local search_path = retail, public, extensions;
create temp table _t on commit drop as
  select (select id from retail.ubicaciones where tipo = 'tienda' order by nombre limit 1) as tienda,
         (select id from retail.ubicaciones where tipo = 'taller' order by nombre limit 1) as taller;
${cuerpo}
rollback;
`;

// Lo que respondió la base: el hint si se negó por un CHECK (23514), o «pasó». psql manda los NOTICE a stderr: por eso el
// resultado se guarda en una tabla temporal y se consulta al final.
const intentar = (sentencia) => `
create temp table _r (r text) on commit drop;
do $$
declare v_hint text;
begin
  begin
    ${sentencia};
    insert into _r values ('pasó');
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _r values (coalesce(v_hint, '(sin hint)'));
  end;
end;
$$;
select r from _r;`;

// 1. Hoy ningún lugar de tienda es de otro tipo.
{
  const r = correr(envolver(`
select count(*) from retail.sububicaciones s join retail.ubicaciones u on u.id = s.ubicacion_id
where u.tipo = 'tienda' and coalesce(s.tipo, '') not in ('piso_venta', 'almacen_tienda', 'cuarentena');`));
  esperar("hoy ninguna tienda tiene un lugar que no sea piso, almacén ni Cuarentena", r.ok && r.salida === "0", r.ok ? `hay ${r.salida}` : r.mensaje);
}

// 2. Lo que se niega en una tienda.
const NEGADOS = [
  ["crear un «rack» en una tienda", "insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select tienda, 'ZZ rack', 'rack' from _t"],
  ["crear un lugar sin tipo en una tienda", "insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select tienda, 'ZZ sin tipo', null from _t"],
  [
    "cambiar a «rack» el almacén de una tienda",
    "update retail.sububicaciones set tipo = 'rack' where ubicacion_id = (select tienda from _t) and tipo = 'almacen_tienda'",
  ],
];
for (const [nombre, sentencia] of NEGADOS) {
  const r = correr(envolver(intentar(sentencia)));
  esperar(`se niega: ${nombre}`, r.ok && r.salida === "sububicacion_de_tienda", r.ok ? `dio «${r.salida}»` : r.mensaje);
}

// Llevar a la tienda un rack del Taller (si hay Taller con racks).
{
  const hay = correr(envolver(`select count(*) from retail.sububicaciones where ubicacion_id = (select taller from _t) and tipo = 'rack';`));
  if (hay.ok && Number(hay.salida) > 0) {
    const r = correr(
      envolver(
        intentar(
          "update retail.sububicaciones set ubicacion_id = (select tienda from _t) where id = (select id from retail.sububicaciones where ubicacion_id = (select taller from _t) and tipo = 'rack' order by nombre limit 1)",
        ),
      ),
    );
    esperar("se niega: llevar a una tienda un rack del Taller", r.ok && r.salida === "sububicacion_de_tienda", r.ok ? `dio «${r.salida}»` : r.mensaje);
  } else {
    console.log("· (sin un Taller con racks en esta base: no se prueba llevar un rack a la tienda)");
  }
}

// 3. Lo que sigue funcionando.
{
  const conTaller = correr(envolver(`select count(*) from _t where taller is not null;`));
  if (conTaller.ok && conTaller.salida === "1") {
    const r = correr(envolver(intentar("insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select taller, 'ZZ rack nuevo', 'rack' from _t")));
    esperar("el Taller sigue pudiendo tener racks", r.ok && r.salida === "pasó", r.ok ? `dio «${r.salida}»` : r.mensaje);
  } else {
    console.log("· (sin Taller en esta base: no se prueba que el Taller siga teniendo racks)");
  }
  const r = correr(
    envolver(
      intentar(
        "update retail.sububicaciones set nombre = nombre || ' ZZ' where id = (select id from retail.sububicaciones where ubicacion_id = (select tienda from _t) and tipo = 'piso_venta' limit 1)",
      ),
    ),
  );
  esperar("en una tienda se sigue pudiendo cambiar el nombre de un lugar", r.ok && r.salida === "pasó", r.ok ? `dio «${r.salida}»` : r.mensaje);
}

// 4. Control: sin el disparador, el rack en la tienda pasa (si no, la prueba no vería que falta).
{
  const r = correr(
    envolver(`
drop trigger if exists sububicacion_de_tienda_valida on retail.sububicaciones;
${intentar("insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select tienda, 'ZZ rack', 'rack' from _t")}`),
  );
  esperar("control: sin el disparador, el rack en la tienda pasa", r.ok && r.salida === "pasó", r.ok ? `dio «${r.salida}»` : r.mensaje);
}

// 5. Se puede pegar dos veces.
{
  const r = correr(`
begin;
${SQL_MIGRACION}
${SQL_MIGRACION}
select count(*) from pg_trigger where tgname = 'sububicacion_de_tienda_valida' and not tgisinternal;
rollback;`);
  esperar("la migración se puede pegar dos veces (y deja un solo disparador)", r.ok && r.salida.split("\n").pop() === "1", r.ok ? `dio «${r.salida}»` : r.mensaje);
}

console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);
