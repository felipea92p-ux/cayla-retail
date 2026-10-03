#!/usr/bin/env node
/**
 * Prueba de `20261003180000_rendimiento_detalle_por_hora.sql` — «ventas por hora» y «prendas por venta» de Rendimiento.
 *
 * QUÉ CUBRE
 *   · agrupa lo que vendió LA TIENDA por día y hora de Lima: nº de ventas, soles y prendas;
 *   · no cuenta las ventas de prueba, las anuladas, las de otra tienda ni las de otro día (la misma definición de `fn_rendimiento_serie`);
 *   · el día cuadra con `fn_rendimiento_serie` (mismos soles y mismas ventas);
 *   · una cuenta que no ve esa tienda (integrante sin Rendimiento) recibe 42501, y un rango roto 22023;
 *   · la hora es la de LIMA (una venta a las 23:30 de Lima ya es del día siguiente en UTC y sigue siendo de ese día);
 *   · `anon` no puede ejecutarla; `authenticated` sí.
 *
 * CÓMO. Mismo patrón que `mis_ventas_del_dia.mjs`: cada escenario en su transacción con ROLLBACK y la sesión simulada con
 * `request.jwt.claim.sub`. Usa un día de 2020 (lunes 2 de marzo) donde no hay ventas reales, así que el resultado es exacto
 * y no depende de lo que ya haya en el Postgres local compartido.
 *
 * USO
 *   pnpm pruebas:rendimiento-detalle    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve las tiendas de Rendimiento
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante sin el módulo Rendimiento

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);

/** Ventas del lunes 2-mar-2020 (hora de Lima) en Trujillo y una en Lima, más las que NO deben contar. */
const VENTAS = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
create function pg_temp.venta(p_ubic uuid, p_asesora uuid, p_estado text, p_prueba boolean, p_cuando timestamptz, p_cant int, p_precio numeric)
returns void language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, asesora_id, usuario_id, estado, es_prueba, created_at, anulado_en, motivo_anulacion)
  values (p_ubic, p_asesora, p_asesora, p_estado, p_prueba, p_cuando,
          case when p_estado = 'anulada' then p_cuando end, case when p_estado = 'anulada' then 'prueba automatizada' end)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (v, (select id from retail.variantes order by id limit 1), p_cant, p_precio, 0);
end;
$f$;
select pg_temp.venta(:'trujillo', :'micaela', 'completada', false, timestamptz '2020-03-02 10:15-05', 2, 50);   -- 10 h: 100, 2 prendas
select pg_temp.venta(:'trujillo', :'micaela', 'completada', false, timestamptz '2020-03-02 10:50-05', 1, 80);   -- 10 h: 80, 1 prenda (otra venta, misma hora)
select pg_temp.venta(:'trujillo', :'micaela', 'completada', false, timestamptz '2020-03-02 15:05-05', 1, 40);   -- 15 h: 40, 1 prenda
select pg_temp.venta(:'trujillo', :'micaela', 'completada', false, timestamptz '2020-03-02 23:30-05', 3, 10);   -- 23 h de Lima (ya es 3-mar en UTC): 30, 3 prendas
select pg_temp.venta(:'trujillo', :'micaela', 'completada', true,  timestamptz '2020-03-02 10:20-05', 1, 999);  -- de prueba: no cuenta
select pg_temp.venta(:'trujillo', :'micaela', 'anulada',    false, timestamptz '2020-03-02 10:25-05', 1, 555);  -- anulada: no cuenta
select pg_temp.venta(:'lima', :'micaela', 'completada', false, timestamptz '2020-03-02 10:30-05', 1, 333);  -- otra tienda: no cuenta
select pg_temp.venta(:'trujillo', :'micaela', 'completada', false, timestamptz '2020-03-01 10:30-05', 1, 777);  -- de otro día: no cuenta
`;

const DETALLE = `select string_agg(hora || ':' || ventas || ':' || total || ':' || prendas, ' ' order by hora) from retail.fn_rendimiento_detalle(:'trujillo', date '2020-03-02', date '2020-03-02');`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1200)}`);
  }
}

// 1. Agrupa por hora de Lima y suma ventas, soles y prendas; deja afuera lo que no cuenta.
{
  const r = correr(`${VENTAS}${cambiaA(FELIPE)}${DETALLE}`);
  esperar(
    "agrupa por hora de Lima (10 h: 2 ventas, 180 soles, 3 prendas · 15 h · 23 h) y no cuenta prueba, anulada, otra tienda ni otro día",
    ultima(r) === "10:2:180.00:3 15:1:40.00:1 23:1:30.00:3",
    r,
  );
}

// 2. Una venta de las 23:30 de Lima es del 2 de marzo aunque en UTC ya sea el 3.
{
  const r = correr(`${VENTAS}${cambiaA(FELIPE)}
select count(*) from retail.fn_rendimiento_detalle(:'trujillo', date '2020-03-03', date '2020-03-03');`);
  esperar("la hora es la de Lima: la venta de las 23:30 no pasa al día siguiente", ultima(r) === "0", r);
}

// 3. El día cuadra con fn_rendimiento_serie.
{
  const r = correr(`${VENTAS}${cambiaA(FELIPE)}
select (select sum(total)::text || '/' || sum(ventas) from retail.fn_rendimiento_detalle(:'trujillo', date '2020-03-02', date '2020-03-02'))
    || ' = ' || (select total::text || '/' || ventas from retail.fn_rendimiento_serie(:'trujillo', date '2020-03-02', date '2020-03-02'));`);
  const [a, b] = (ultima(r) ?? "").split(" = ");
  esperar("el día cuadra con fn_rendimiento_serie (mismos soles y mismas ventas)", !!a && a === b && a === "250.00/4", r);
}

// 4. Quien no ve esa tienda recibe 42501.
{
  const r = correr(`${VENTAS}${cambiaA(MICAELA)}${DETALLE}`);
  esperar("una integrante sin Rendimiento recibe 42501", !r.ok && /42501|No puedes ver el rendimiento/.test(r.mensaje), r);
}

// 5. Rango roto o demasiado largo: 22023.
{
  const r1 = correr(`${VENTAS}${cambiaA(FELIPE)}select * from retail.fn_rendimiento_detalle(:'trujillo', date '2020-03-05', date '2020-03-02');`);
  const r2 = correr(`${VENTAS}${cambiaA(FELIPE)}select * from retail.fn_rendimiento_detalle(:'trujillo', date '2020-01-01', date '2020-06-01');`);
  const r3 = correr(`${VENTAS}${cambiaA(FELIPE)}select * from retail.fn_rendimiento_detalle(:'trujillo', null, date '2020-03-02');`);
  esperar("un rango invertido, de más de 92 días o sin fecha da 22023", [r1, r2, r3].every((r) => !r.ok && /22023|rango de fechas/.test(r.mensaje)), [r1, r2, r3]);
}

// 6. Permisos.
{
  const r = correr(`select has_function_privilege('anon', 'retail.fn_rendimiento_detalle(uuid, date, date)', 'execute') || '|' || has_function_privilege('authenticated', 'retail.fn_rendimiento_detalle(uuid, date, date)', 'execute');`);
  esperar("anon no puede ejecutarla; authenticated sí", ultima(r) === "false|true", r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
