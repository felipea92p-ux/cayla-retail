#!/usr/bin/env node
/**
 * Prueba de `retail.fn_ingresos_por_modelo` (`20261029022000_ingresos_por_modelo.sql`): la pestaña «Ingresos» de Movimientos,
 * «qué prendas entraron» a una sede entre dos fechas, UNA línea por modelo.
 *
 * QUÉ CUBRE
 *   · L — la lectura: suma por modelo el stock inicial y la mercadería recibida de todos sus colores y tallas; ordena por
 *         unidades; NO cuenta traslados anulados, ajustes ni salidas; NO cuenta lo que entró a otra sede; los bordes del
 *         rango son la medianoche DE LIMA (00:05 del primer día cuenta, 23:30 del último cuenta, 23:50 del día anterior y
 *         00:10 del día siguiente no); y el total cuadra con una cuenta directa sobre el libro `movimientos`;
 *   · V — un rango al revés o de más de un año se rechaza con un mensaje que lo dice;
 *   · P — permisos: una integrante ve su sede y no otra; sin el módulo Movimientos, nada; `anon` no ejecuta.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (comentario de la escena), no salen de la función.
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`, en MARZO DE 2031 (un mes sin
 * datos de nadie) y en dos sedes creadas por la escena (como `perdidas.mjs`).
 *
 * USO
 *   pnpm pruebas:ingresos-por-modelo    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
/** Cada verificación de la escena sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-900) });
}
/** Los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// ============================================================================================================================
// La escena. Rango: del 10 al 12 de marzo de 2031 (hora de Lima). Sede T (donde se mide) y sede O (otra sede).
//
//   EN T, CUENTA (rango 10–12 mar):
//     p1 · v1a carga_inicial 10 (10-mar 10:00) · v1b carga_inicial 5 (10-mar 00:05, justo pasada la medianoche)
//          v1a recepcion 7 (11-mar 09:00)     · v1a recepcion 2 (12-mar 23:30, último minuto del rango)
//          → 24 unidades = 15 de stock inicial + 9 recibidas; primer día 10-mar, último 12-mar
//     p2 · v2 recepcion 4 (11-mar 12:00)      → 4 unidades, todas recibidas
//   EN T, NO CUENTA:
//     p1 recepcion 1 (9-mar 23:50) · p1 recepcion 1 (13-mar 00:10) · p2 entrada traslado_anulado 9 ·
//     p2 ajuste +3 reposicion · p1 salida venta 1
//   EN O (otra sede): p1 carga_inicial 100 (11-mar) → no entra a T; O lee 100 de p1.
//   TOTALES en T: 2 modelos · 28 unidades · 15 de stock inicial · 13 recibidas.
// ============================================================================================================================
const AYUDANTES = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;

const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Ingresos T', 'tienda') returning id as t \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Ingresos O', 'tienda') returning id as o \\gset
select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru \\gset
-- Dos modelos reales: p1 con dos variantes (colores o tallas distintas) y p2 con otra.
select p.id as p1, (array_agg(v.id order by v.id))[1] as v1a, (array_agg(v.id order by v.id))[2] as v1b
  from retail.productos p join retail.variantes v on v.producto_id = p.id
 where v.id <> '22222222-2222-4222-8222-222222222222'
 group by p.id having count(*) >= 2 order by p.id limit 1 \\gset
select p.id as p2, (array_agg(v.id order by v.id))[1] as v2
  from retail.productos p join retail.variantes v on v.producto_id = p.id
 where p.id <> :'p1' and v.id <> '22222222-2222-4222-8222-222222222222'
 group by p.id order by p.id limit 1 \\gset

insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values
  (:'v1a', :'t', 'entrada', 10, 'carga_inicial',  '2031-03-10 10:00-05'),
  (:'v1b', :'t', 'entrada',  5, 'carga_inicial',  '2031-03-10 00:05-05'),
  (:'v1a', :'t', 'entrada',  7, 'recepcion',      '2031-03-11 09:00-05'),
  (:'v1a', :'t', 'entrada',  2, 'recepcion',      '2031-03-12 23:30-05'),
  (:'v2',  :'t', 'entrada',  4, 'recepcion',      '2031-03-11 12:00-05'),
  -- Lo que NO cuenta:
  (:'v1a', :'t', 'entrada',  1, 'recepcion',      '2031-03-09 23:50-05'),
  (:'v1a', :'t', 'entrada',  1, 'recepcion',      '2031-03-13 00:10-05'),
  (:'v2',  :'t', 'entrada',  9, 'traslado_anulado','2031-03-11 13:00-05'),
  (:'v2',  :'t', 'ajuste',   3, 'reposicion',     '2031-03-11 14:00-05'),
  (:'v1a', :'t', 'salida',   1, 'venta',          '2031-03-11 15:00-05'),
  (:'v1a', :'o', 'entrada', 100, 'carga_inicial', '2031-03-11 10:00-05');

create temp table r as select retail.fn_ingresos_por_modelo(:'t', '2031-03-10', '2031-03-12') as j;
create temp table ro as select retail.fn_ingresos_por_modelo(:'o', '2031-03-10', '2031-03-12') as j;
create function pg_temp.modelo(p_j jsonb, p_id uuid) returns jsonb language sql as $f$
  select x from jsonb_array_elements(p_j -> 'modelos') x where x ->> 'producto_id' = p_id::text
$f$;
`;

const CASOS_LECTURA = `
select 'L1 un modelo suma todos sus colores y tallas y los dos procesos: p1 = 24 (15 de stock inicial + 9 recibidas)',
  (select (m ->> 'unidades')::int = 24 and (m ->> 'de_stock_inicial')::int = 15 and (m ->> 'de_recepcion')::int = 9
     from (select pg_temp.modelo(j, :'p1'::uuid) as m from r) q);
select 'L1 y dice el primer y el último día en que entró (10 y 12 de marzo)',
  (select m ->> 'primer_dia' = '2031-03-10' and m ->> 'ultimo_dia' = '2031-03-12' from (select pg_temp.modelo(j, :'p1'::uuid) as m from r) q);
select 'L2 p2 = 4, todas recibidas; el traslado anulado, el ajuste y la venta no cuentan',
  (select (m ->> 'unidades')::int = 4 and (m ->> 'de_stock_inicial')::int = 0 and (m ->> 'de_recepcion')::int = 4
     from (select pg_temp.modelo(j, :'p2'::uuid) as m from r) q);
select 'L3 los totales son 2 modelos, 28 unidades, 15 de stock inicial y 13 recibidas',
  (select (j #>> '{totales,modelos}')::int = 2 and (j #>> '{totales,unidades}')::int = 28
      and (j #>> '{totales,de_stock_inicial}')::int = 15 and (j #>> '{totales,de_recepcion}')::int = 13 from r);
select 'L4 el modelo con más prendas va primero',
  (select j -> 'modelos' -> 0 ->> 'producto_id' = :'p1' and j -> 'modelos' -> 1 ->> 'producto_id' = :'p2' from r);
select 'L5 lo que entró a otra sede no entra a esta (O lee sus 100; T no los ve)',
  (select (j #>> '{totales,unidades}')::int = 100 and (j #>> '{totales,modelos}')::int = 1 from ro);
select 'L6 los bordes son la medianoche de Lima: 00:05 del primer día y 23:30 del último cuentan; 23:50 de antes y 00:10 de después no',
  (select (j #>> '{totales,unidades}')::int = 28 from r);
select 'L7 el total cuadra con una cuenta directa sobre el libro de movimientos',
  (select (j #>> '{totales,unidades}')::int = (
            select coalesce(sum(cantidad), 0) from retail.movimientos
             where ubicacion_id = :'t' and tipo = 'entrada' and motivo in ('carga_inicial', 'recepcion')
               and created_at >= '2031-03-10 00:00-05' and created_at < '2031-03-13 00:00-05')
     from r);
select 'L8 un solo día (11 de marzo): p1 = 7 y p2 = 4',
  (select (pg_temp.modelo(j, :'p1'::uuid) ->> 'unidades')::int = 7 and (pg_temp.modelo(j, :'p2'::uuid) ->> 'unidades')::int = 4
     from (select retail.fn_ingresos_por_modelo(:'t', '2031-03-11', '2031-03-11') as j) q);
select 'L9 un rango sin ingresos devuelve la lista vacía y ceros, no un error',
  (select jsonb_array_length(j -> 'modelos') = 0 and (j #>> '{totales,unidades}')::int = 0 and (j #>> '{totales,modelos}')::int = 0
     from (select retail.fn_ingresos_por_modelo(:'t', '2031-04-01', '2031-04-05') as j) q);
`;

const CASOS_RANGO = `
select 'V1 un rango al revés se rechaza',
  (select pg_temp.intento(format('select retail.fn_ingresos_por_modelo(%L, %L, %L)', :'t', '2031-03-12', '2031-03-10')) like '%rango%');
select 'V2 un rango de más de un año se rechaza',
  (select pg_temp.intento(format('select retail.fn_ingresos_por_modelo(%L, %L, %L)', :'t', '2030-01-01', '2031-03-10')) like '%un año%');
select 'V3 sin fechas se rechaza',
  (select pg_temp.intento(format('select retail.fn_ingresos_por_modelo(%L, null, null)', :'t')) like '%rango%');
`;

const CASOS_PERMISOS = `
${cambiaA(MICAELA)}
select 'P1 una integrante no ve los ingresos de otra sede',
  (select pg_temp.intento(format('select retail.fn_ingresos_por_modelo(%L, %L, %L)', :'t', '2031-03-10', '2031-03-12')) like '%permiso%');
select 'P2 en su sede (Trujillo) sí lee',
  (select pg_temp.intento(format('select retail.fn_ingresos_por_modelo(%L, %L, %L)', :'tru', '2031-03-10', '2031-03-12')) = 'SIN_ERROR');
delete from retail.rol_modulos where modulo = 'movimientos' and rol_id = (select id from retail.roles where clave = 'integrante');
select 'P3 sin el módulo Movimientos, nada',
  (select pg_temp.intento(format('select retail.fn_ingresos_por_modelo(%L, %L, %L)', :'tru', '2031-03-10', '2031-03-12')) like '%Movimientos%');
reset role;
select 'P4 anon no ejecuta; authenticated sí',
  not has_function_privilege('anon', 'retail.fn_ingresos_por_modelo(uuid, date, date)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_ingresos_por_modelo(uuid, date, date)', 'execute');
`;

verificar("L · lectura", correr(`${ESCENA}${CASOS_LECTURA}`), casosDe(CASOS_LECTURA));
verificar("V · rango", correr(`${ESCENA}${CASOS_RANGO}`), casosDe(CASOS_RANGO));
verificar("P · permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
