#!/usr/bin/env node
/**
 * Prueba de `20261114215000_reportes_ventas_por_empresa.sql` (ADR-0665): el filtro «Empresa» (CAYLA / CLAURE) de Ventas ▸ Reportes, donde conviven
 * dos empresas (hoy, Tienda Lima). Las cuatro lecturas (`fn_reporte_ventas_mes`, `_series`, `_cortes` y `_ranking`) ganan `p_empresa`.
 *
 * EL PROBLEMA. Un reporte que se parte por empresa y no suma lo mismo que el total es peor que ninguno: el dueño ve CAYLA S/ 125 + CLAURE S/ 130 y el
 * total dice S/ 260. Y la regla de «de quién es esta línea» ya existe en otro lugar (Caja, Historial, Movimientos: `fn_dueno_de_la_linea`); si el reporte
 * la copia mal, dos pantallas dirían cosas distintas de la misma venta.
 *
 * QUÉ CUBRE (marzo y febrero de 2019, para no mezclarse con lo que haya en la base local; una escena propia: dos prendas, una de cada empresa por su
 * ficha, y una línea de una prenda de CAYLA cuyo dueño real, el del movimiento, es CLAURE)
 *   A. La regla: `fn_empresa_de_la_linea` dice lo mismo que `fn_dueno_de_la_linea` en TODAS las líneas de la base (el movimiento manda sobre la ficha).
 *   B. Ventas del mes, Lima: CAYLA + CLAURE = el vendido, las prendas y el devuelto sin filtro; las ventas (tickets) cuentan una venta mixta en las dos;
 *      el mes anterior se filtra igual; la primera venta es la de esa empresa.
 *   C. La devolución mixta se reparte por valor y la de una sola empresa va entera; la suma de las empresas es el reembolso.
 *   D. Los gráficos: por día y mes a mes suman lo mismo que las cifras; «cómo se pagó» NO se parte (vacío con la empresa, lleno sin ella).
 *   E. Los cortes: por tienda y por categoría suman lo mismo que las cifras.
 *   F. El ranking: las filas, los totales y lo que queda en tiendas (CLAURE = `stock_dueno`; CAYLA = el resto: las dos suman el «queda» sin filtro).
 *   G. Coincide con `fn_vendido_por_empresa` (Caja e Historial) con los mismos filtros.
 *   H. La empresa solo se elige dentro de una tienda donde operan dos (22023 sin tienda, en Trujillo o con una empresa que no existe) y sin el módulo, 42501.
 *   I. Una cuenta de Lima con el módulo en su rol (no líder) lee lo mismo que el líder: las lecturas son INVOKER y la RLS no esconde lo que necesitan.
 *   J. Los permisos, una sola firma de cada lectura, y pegar la migración dos veces no falla.
 *   K. El control: con la regla por ficha (sin el movimiento) CLAURE saldría distinto, así que la prueba SÍ discrimina.
 *
 * CÓMO. Cada caso es UNA transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido): se pega la migración, se arma la escena de
 * Lima (CLAURE opera allí), se siembra con los disparadores apagados (aquí se prueba la lectura, no la venta) y se entra con la sesión simulada
 * (`request.jwt.claim.sub` y `role authenticated`).
 *
 * USO
 *   pnpm pruebas:reportes-por-empresa
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261114215000_reportes_ventas_por_empresa.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'::uuid";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'::uuid";
const CUENTA_LIMA = "55555555-5555-4555-8555-0000000000a1"; // cuenta de Lima con el módulo en su rol (se crea aquí)
const ROL_LIMA = "55555555-5555-4555-8555-0000000000a2";
const PERSONA_LIMA = "55555555-5555-4555-8555-0000000000a3";
const SIN_PERSONA = "55555555-5555-4555-8555-0000000000a9"; // una sesión sin persona: no ve ningún módulo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

// Las sedes se buscan por su nombre («Tienda LIM» en producción, «Tienda Lima» en el seed). La base limpia del CI corre las migraciones ANTES de que el
// seed cree las sedes, así que allí `empresa_sedes` no tiene a CLAURE en Lima: cada transacción arma esa escena (como en producción).
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'::uuid`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");
const ESCENA = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;`;

const LIM = (ts) => `(timestamp '${ts}' at time zone 'America/Lima')`;

// La escena. Prenda A: CAYLA por su ficha. Prenda B: CLAURE por su ficha (categoría distinta). Todo con los disparadores apagados.
//
//  Lima, marzo de 2019 (cada línea: dueño real · cuánto se cobró)
//   V1  mixta        A×2 a 50 = 100 (CAYLA)  +  B×1 a 30 = 30 (CLAURE)           efectivo 130
//   V2  solo CLAURE  B×3 a 20 = 60 (CLAURE)                                       yape 60
//   V3  A×1 a 40 = 40: la ficha dice CAYLA pero su movimiento dice CLAURE → CLAURE   tarjeta 40
//   V4  solo CAYLA   A×1 a 25 = 25 (CAYLA)                                        efectivo 25
//   (no cuentan) una anulada, una de prueba y una de abril
//  Trujillo, marzo de 2019: V5  A×2 a 10 = 20 (CAYLA)
//  Lima, febrero de 2019 (el mes anterior): V7  B×1 a 80 el día 20 (CLAURE) · V8  A×1 a 10 el día 22 (CAYLA)
//
//  Devoluciones aprobadas en marzo (Lima): D1 de V2, 60, todo CLAURE · D2 de V1, 40, mixta (A×1 = 50 y B×1 = 30 de valor): CAYLA 25 y CLAURE 15
//
//  Totales de Lima en marzo:  sin filtro 255 / 4 ventas / 8 prendas / devuelto 100
//                             CLAURE      130 / 3 ventas / 5 prendas / devuelto 75
//                             CAYLA       125 / 2 ventas / 3 prendas / devuelto 25
//  Stock (tiendas): Lima A 10 (3 son de CLAURE) y B 5 (todas de CLAURE); Trujillo A 4.
const SEMBRADO = `
set local session_replication_role = replica;
select va.id as var_a, va.producto_id as prod_a from retail.variantes va join retail.productos p on p.id = va.producto_id
  where retail.fn_categoria_entra_a_motores(p.categoria_id) order by va.id limit 1 \\gset
select va.id as var_b, va.producto_id as prod_b from retail.variantes va join retail.productos p on p.id = va.producto_id
  where retail.fn_categoria_entra_a_motores(p.categoria_id) and va.producto_id <> :'prod_a' order by va.id limit 1 \\gset
select p.categoria_id as cat_a from retail.productos p where p.id = :'prod_a' \\gset
select c.id as cat_b from retail.categorias c where c.id <> :'cat_a' and retail.fn_categoria_entra_a_motores(c.id) order by c.id limit 1 \\gset
update retail.productos set empresa_id = ${CAYLA}, categoria_id = :'cat_a' where id = :'prod_a';
update retail.productos set empresa_id = ${CLAURE}, categoria_id = :'cat_b' where id = :'prod_b';

-- Stock de las dos prendas: solo el que se siembra aquí
delete from retail.stock_dueno where variante_id in (select id from retail.variantes where producto_id in (:'prod_a', :'prod_b'));
delete from retail.stock where variante_id in (select id from retail.variantes where producto_id in (:'prod_a', :'prod_b'));
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'var_a', ${LIMA}, 10), (:'var_b', ${LIMA}, 5), (:'var_a', ${TRUJILLO}, 4);
insert into retail.stock_dueno (variante_id, ubicacion_id, empresa_id, cantidad) values (:'var_a', ${LIMA}, ${CLAURE}, 3), (:'var_b', ${LIMA}, ${CLAURE}, 5);

create function pg_temp.venta(p_id text, p_ub uuid, p_cuando timestamptz, p_estado text, p_prueba boolean)
returns void language plpgsql as $f$
begin
  insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, usuario_id, anulado_en, motivo_anulacion)
    values (md5('re-' || p_id)::uuid, p_ub, p_cuando, p_estado, p_prueba, '${FELIPE}',
            case when p_estado = 'anulada' then p_cuando end, case when p_estado = 'anulada' then 'prueba' end);
end $f$;
create function pg_temp.linea(p_id text, p_venta text, p_var uuid, p_cant int, p_precio numeric)
returns void language plpgsql as $f$
begin
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
    values (md5('re-i-' || p_id)::uuid, md5('re-' || p_venta)::uuid, p_var, p_cant, p_precio, 0, 0);
end $f$;
create function pg_temp.devolucion(p_id text, p_venta text, p_ub uuid, p_monto numeric, p_aprobada timestamptz)
returns void language plpgsql as $f$
begin
  insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
    values (md5('re-d-' || p_id)::uuid, md5('re-' || p_venta)::uuid, p_ub, 'talla', 'aprobada', p_monto, 'efectivo', p_aprobada);
end $f$;
create function pg_temp.devuelve(p_dev text, p_linea text, p_cant int)
returns void language plpgsql as $f$
begin
  insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
    values (md5('re-d-' || p_dev)::uuid, md5('re-i-' || p_linea)::uuid, p_cant, 'vendible');
end $f$;

-- Marzo de 2019, Lima
select pg_temp.venta('V1', ${LIMA}, ${LIM("2019-03-04 12:00")}, 'completada', false);
select pg_temp.linea('V1a', 'V1', :'var_a', 2, 50);
select pg_temp.linea('V1b', 'V1', :'var_b', 1, 30);
select pg_temp.venta('V2', ${LIMA}, ${LIM("2019-03-10 10:00")}, 'completada', false);
select pg_temp.linea('V2a', 'V2', :'var_b', 3, 20);
select pg_temp.venta('V3', ${LIMA}, ${LIM("2019-03-15 11:00")}, 'completada', false);
select pg_temp.linea('V3a', 'V3', :'var_a', 1, 40);
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, empresa_id)
  values (:'var_a', ${LIMA}, 'salida', 1, 'venta', md5('re-i-V3a')::uuid, ${CLAURE});
select pg_temp.venta('V4', ${LIMA}, ${LIM("2019-03-31 23:30")}, 'completada', false);
select pg_temp.linea('V4a', 'V4', :'var_a', 1, 25);
select pg_temp.venta('VX1', ${LIMA}, ${LIM("2019-03-12 10:00")}, 'anulada', false);      -- NO: anulada
select pg_temp.linea('VX1a', 'VX1', :'var_b', 1, 777);
select pg_temp.venta('VX2', ${LIMA}, ${LIM("2019-03-13 10:00")}, 'completada', true);    -- NO: de prueba
select pg_temp.linea('VX2a', 'VX2', :'var_b', 1, 888);
select pg_temp.venta('VX3', ${LIMA}, ${LIM("2019-04-01 00:00")}, 'completada', false);   -- NO: ya es abril
select pg_temp.linea('VX3a', 'VX3', :'var_b', 1, 999);
-- Marzo de 2019, Trujillo
select pg_temp.venta('V5', ${TRUJILLO}, ${LIM("2019-03-06 10:00")}, 'completada', false);
select pg_temp.linea('V5a', 'V5', :'var_a', 2, 10);
-- Febrero de 2019, Lima
select pg_temp.venta('V7', ${LIMA}, ${LIM("2019-02-20 10:00")}, 'completada', false);
select pg_temp.linea('V7a', 'V7', :'var_b', 1, 80);
select pg_temp.venta('V8', ${LIMA}, ${LIM("2019-02-22 10:00")}, 'completada', false);
select pg_temp.linea('V8a', 'V8', :'var_a', 1, 10);
-- Devoluciones aprobadas en marzo
select pg_temp.devolucion('D1', 'V2', ${LIMA}, 60, ${LIM("2019-03-12 10:00")});
select pg_temp.devuelve('D1', 'V2a', 3);
select pg_temp.devolucion('D2', 'V1', ${LIMA}, 40, ${LIM("2019-03-20 10:00")});
select pg_temp.devuelve('D2', 'V1a', 1);
select pg_temp.devuelve('D2', 'V1b', 1);
-- Lo cobrado
insert into retail.venta_pagos (id, venta_id, metodo, monto) values
  (md5('re-p1')::uuid, md5('re-V1')::uuid, 'efectivo', 130),
  (md5('re-p2')::uuid, md5('re-V2')::uuid, 'yape', 60),
  (md5('re-p3')::uuid, md5('re-V3')::uuid, 'tarjeta', 40),
  (md5('re-p4')::uuid, md5('re-V4')::uuid, 'efectivo', 25),
  (md5('re-p5')::uuid, md5('re-VX1')::uuid, 'efectivo', 777);

-- Una cuenta de Lima con el módulo en su rol (no es líder)
insert into auth.users (id, aud, role, email) values ('${CUENTA_LIMA}', 'authenticated', 'authenticated', 'reporte-empresa-lima@prueba.local');
insert into retail.roles (id, nombre, descripcion) values ('${ROL_LIMA}', 'Reportes por empresa (prueba)', 'Rol de prueba');
insert into retail.rol_modulos (rol_id, modulo) values ('${ROL_LIMA}', 'reportes_ventas');
select sede_base_id as sede_base from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id, auth_user_id) values ('${PERSONA_LIMA}', 'Con', 'Módulo', 'activo', :'sede_base', '${CUENTA_LIMA}');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, rol_id) values ('${PERSONA_LIMA}', 'colaborador', ${LIMA}, '${ROL_LIMA}');
set local session_replication_role = origin;
`;

const sesion = (sub) => `set local request.jwt.claim.sub = '${sub}';\nset local request.jwt.claims = '{"sub":"${sub}","role":"authenticated"}';\nset local role authenticated;`;

// `como`: la cuenta con la que se lee (`null` = postgres, para mirar lo que la web no puede ejecutar).
const dentro = (consulta, { como = FELIPE } = {}) =>
  psql(`begin;
\\o /dev/null
${MIGRACION}
${ESCENA}
${SEMBRADO}
create function pg_temp.codigo(p_sql text) returns text language plpgsql as $f$
declare v_cod text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  v_cod := sqlstate;
  return v_cod || ' ' || v_msg;
end $f$;
grant execute on function pg_temp.codigo(text) to authenticated, anon;
\\o
${como ? sesion(como) : ""}
${consulta}
rollback;`);

const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba «${esperado}» y salió «${obtenido}»`);
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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

// ---- Atajos de lectura (todos sobre Lima) ----
const sinEmp = "null";
const MES = (emp, ub = LIMA, mes = "2019-03-15") => `retail.fn_reporte_ventas_mes('${mes}', ${ub}, ${emp})`;
const SERIES = (emp, ub = LIMA, mes = "2019-03-15") => `retail.fn_reporte_ventas_series('${mes}', ${ub}, ${emp})`;
const CORTES = (emp, ub = LIMA) => `retail.fn_reporte_ventas_cortes('2019-03-15', ${ub}, ${emp})`;
const RANKING = (emp, ub = LIMA) => `retail.fn_reporte_ventas_ranking('2019-03-01', '2019-04-01', ${ub}, null, null, null, null, null, 'modelo', 'unidades', 0, 10, ${emp})`;
const n = (jsonbExpr) => `trim_scale((${jsonbExpr})::numeric)::text`;
/** «vendido|ventas|prendas|devuelto» de un tramo. */
const cifras = (r, k = "actual") => `${n(`${r}->'${k}'->>'vendido'`)} || '|' || (${r}->'${k}'->>'tickets') || '|' || (${r}->'${k}'->>'unidades') || '|' || ${n(`${r}->'${k}'->>'devuelto'`)}`;

// ======================= A. La regla de la línea =======================
caso("A. fn_empresa_de_la_linea dice lo mismo que fn_dueno_de_la_linea en TODAS las líneas (el movimiento manda sobre la ficha)", () =>
  igual(
    dentro(`select bool_and(retail.fn_empresa_de_la_linea(i.id) = retail.fn_dueno_de_la_linea(i.id))::text || '|' ||
                   (select count(*) from retail.venta_items i2 where i2.id in (md5('re-i-V1b')::uuid, md5('re-i-V2a')::uuid, md5('re-i-V3a')::uuid, md5('re-i-V7a')::uuid)
                       and retail.fn_dueno_de_la_linea(i2.id) = ${CLAURE})::text || '|' ||
                   (select count(*) from retail.venta_items i3 where i3.id in (md5('re-i-V1a')::uuid, md5('re-i-V4a')::uuid)
                       and retail.fn_dueno_de_la_linea(i3.id) = ${CAYLA})::text from retail.venta_items i;`, { como: null }),
    "true|4|2",
  ));

// ======================= B. Ventas del mes =======================
caso("B1. Lima, marzo, sin empresa: 255 / 4 ventas / 8 prendas / devuelto 100 (lo de siempre)", () => igual(dentro(`select ${cifras(MES(sinEmp))};`), "255|4|8|100"));
caso("B2. Lima, marzo, CLAURE: 130 / 3 ventas / 5 prendas / devuelto 75", () => igual(dentro(`select ${cifras(MES(CLAURE))};`), "130|3|5|75"));
caso("B3. Lima, marzo, CAYLA: 125 / 2 ventas / 3 prendas / devuelto 25", () => igual(dentro(`select ${cifras(MES(CAYLA))};`), "125|2|3|25"));
caso("B4. CAYLA + CLAURE = sin filtro en vendido, prendas y devuelto; las ventas suman una más (la mixta cuenta en las dos)", () =>
  igual(
    dentro(`select ${n(`(${MES(CAYLA)}->'actual'->>'vendido')::numeric + (${MES(CLAURE)}->'actual'->>'vendido')::numeric - (${MES(sinEmp)}->'actual'->>'vendido')::numeric`)} || '|' ||
                   ((${MES(CAYLA)}->'actual'->>'unidades')::int + (${MES(CLAURE)}->'actual'->>'unidades')::int - (${MES(sinEmp)}->'actual'->>'unidades')::int) || '|' ||
                   ${n(`(${MES(CAYLA)}->'actual'->>'devuelto')::numeric + (${MES(CLAURE)}->'actual'->>'devuelto')::numeric - (${MES(sinEmp)}->'actual'->>'devuelto')::numeric`)} || '|' ||
                   ((${MES(CAYLA)}->'actual'->>'tickets')::int + (${MES(CLAURE)}->'actual'->>'tickets')::int - (${MES(sinEmp)}->'actual'->>'tickets')::int);`),
    "0|0|0|1",
  ));
caso("B5. el mes anterior (febrero) se filtra igual: CLAURE 80 en 1 venta, CAYLA 10 en 1", () =>
  igual(dentro(`select ${cifras(MES(CLAURE), "anterior")} || ' / ' || ${cifras(MES(CAYLA), "anterior")};`), "80|1|1|0 / 10|1|1|0"));
caso("B6. la primera venta es la de esa empresa: CLAURE el 20 de febrero, CAYLA el 22", () =>
  igual(dentro(`select (${MES(CLAURE)}->>'primera_venta') || ' / ' || (${MES(CAYLA)}->>'primera_venta');`), "2019-02-20 / 2019-02-22"));
caso("B7. sin empresa el reporte es el de antes: Trujillo marzo = 20 en 1 venta", () =>
  igual(dentro(`select ${cifras(MES(sinEmp, TRUJILLO))};`), "20|1|2|0"));

// ======================= C. Las devoluciones =======================
caso("C1. la devolución de una sola empresa va entera (D1, 60, todo CLAURE) y la mixta se parte por valor (D2: 40 → CAYLA 25, CLAURE 15)", () =>
  igual(
    dentro(`select ${n(`retail.fn_reembolso_de_la_empresa(md5('re-d-D1')::uuid, ${CLAURE})`)} || '|' || ${n(`retail.fn_reembolso_de_la_empresa(md5('re-d-D1')::uuid, ${CAYLA})`)} || '|' ||
                   ${n(`retail.fn_reembolso_de_la_empresa(md5('re-d-D2')::uuid, ${CAYLA})`)} || '|' || ${n(`retail.fn_reembolso_de_la_empresa(md5('re-d-D2')::uuid, ${CLAURE})`)};`),
    "60|0|25|15",
  ));
caso("C2. la suma de las empresas es SIEMPRE el reembolso (aunque la devolución no tenga líneas)", () =>
  igual(
    dentro(`set local session_replication_role = replica;
            insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
              select md5('re-d-D3')::uuid, md5('re-V4')::uuid, ${LIMA}, 'talla', 'aprobada', 9.99, 'efectivo', now();
            set local session_replication_role = origin;
            select bool_and(abs(retail.fn_reembolso_de_la_empresa(d.id, ${CAYLA}) + retail.fn_reembolso_de_la_empresa(d.id, ${CLAURE}) - coalesce(d.reembolso_monto, 0)) < 0.0001)::text
              from retail.devoluciones d;`, { como: null }),
    "true",
  ));

// ======================= D. Los gráficos =======================
const sumaDias = (emp, campo) => `(select coalesce(sum((d->>'${campo}')::numeric), 0) from jsonb_array_elements(${SERIES(emp)}->'dias') d)`;
caso("D1. por día: CLAURE suma 130 en 3 ventas, CAYLA 125 en 2, sin filtro 255 en 4 (la venta mixta del día 4 cuenta en las dos)", () =>
  igual(
    dentro(`select ${n(sumaDias(CLAURE, "vendido"))} || '|' || ${n(sumaDias(CLAURE, "tickets"))} || ' / ' || ${n(sumaDias(CAYLA, "vendido"))} || '|' || ${n(sumaDias(CAYLA, "tickets"))} || ' / ' ||
                   ${n(sumaDias(sinEmp, "vendido"))} || '|' || ${n(sumaDias(sinEmp, "tickets"))};`),
    "130|3 / 125|2 / 255|4",
  ));
const delMes = (emp, mes) => `(select ${n("m->>'vendido'")} from jsonb_array_elements(${SERIES(emp, LIMA, "2019-02-15")}->'meses') m where m->>'mes' = '${mes}')`;
caso("D2. mes a mes (la ventana que empieza en febrero): CLAURE febrero 80 y marzo 130; CAYLA febrero 10 y marzo 125", () =>
  igual(dentro(`select ${delMes(CLAURE, "2019-02-01")} || '/' || ${delMes(CLAURE, "2019-03-01")} || ' ' || ${delMes(CAYLA, "2019-02-01")} || '/' || ${delMes(CAYLA, "2019-03-01")};`), "80/130 10/125"));
caso("D3. cómo se pagó NO se parte: con la empresa sale vacío; sin ella, lo cobrado de Lima (255)", () =>
  igual(
    dentro(`select jsonb_array_length(${SERIES(CLAURE)}->'pagos')::text || '|' || jsonb_array_length(${SERIES(CAYLA)}->'pagos')::text || '|' ||
                   ${n(`(select sum((p->>'monto')::numeric) from jsonb_array_elements(${SERIES(sinEmp)}->'pagos') p)`)};`),
    "0|0|255",
  ));

// ======================= E. Los cortes =======================
const tiendaLima = (emp) => `(select t from jsonb_array_elements(${CORTES(emp)}->'tiendas') t where t->>'id' = ${LIMA}::text)`;
const catVendido = (emp, cat, k = "actual") => `coalesce((select ${n(`c->'${k}'->>'vendido'`)} from jsonb_array_elements(${CORTES(emp)}->'categorias') c where c->>'id' = :'${cat}'), '0')`;
caso("E1. por tienda: Lima marca 130 con CLAURE, 125 con CAYLA y 255 sin filtro, con su devuelto", () =>
  igual(
    dentro(`select ${n(`${tiendaLima(CLAURE)}->'actual'->>'vendido'`)} || '|' || ${n(`${tiendaLima(CLAURE)}->'actual'->>'devuelto'`)} || ' / ' ||
                   ${n(`${tiendaLima(CAYLA)}->'actual'->>'vendido'`)} || '|' || ${n(`${tiendaLima(CAYLA)}->'actual'->>'devuelto'`)} || ' / ' ||
                   ${n(`${tiendaLima(sinEmp)}->'actual'->>'vendido'`)} || '|' || ${n(`${tiendaLima(sinEmp)}->'actual'->>'devuelto'`)};`),
    "130|75 / 125|25 / 255|100",
  ));
caso("E2. por categoría: la prenda de CLAURE (cat. B) 90 y la de CAYLA movida a CLAURE (cat. A) 40; CAYLA solo cat. A 125", () =>
  igual(
    dentro(`select ${catVendido(CLAURE, "cat_a")} || '|' || ${catVendido(CLAURE, "cat_b")} || ' / ' || ${catVendido(CAYLA, "cat_a")} || '|' || ${catVendido(CAYLA, "cat_b")} || ' / ' ||
                   ${catVendido(sinEmp, "cat_a")} || '|' || ${catVendido(sinEmp, "cat_b")};`),
    "40|90 / 125|0 / 165|90",
  ));

// ======================= F. El ranking =======================
const fila = (r, prod) => `(select f from jsonb_array_elements(${r}->'filas') f where f->>'producto_id' = :'${prod}')`;
/** Lo que queda en tiendas de una fila del ranking (entre paréntesis: `||` y `->>` pesan igual y sin ellos se leería al revés). */
const queda = (r, prod) => `(${fila(r, prod)}->>'stock')`;
caso("F1. totales del ranking: CLAURE 5 prendas / 130, CAYLA 3 / 125, sin filtro 8 / 255", () =>
  igual(
    dentro(`select ${n(`${RANKING(CLAURE)}->'total'->>'unidades'`)} || '|' || ${n(`${RANKING(CLAURE)}->'total'->>'vendido'`)} || ' / ' ||
                   ${n(`${RANKING(CAYLA)}->'total'->>'unidades'`)} || '|' || ${n(`${RANKING(CAYLA)}->'total'->>'vendido'`)} || ' / ' ||
                   ${n(`${RANKING(sinEmp)}->'total'->>'unidades'`)} || '|' || ${n(`${RANKING(sinEmp)}->'total'->>'vendido'`)};`),
    "5|130 / 3|125 / 8|255",
  ));
caso("F2. las filas: la prenda B solo la vende CLAURE (4); la A, 1 con CLAURE y 3 con CAYLA", () =>
  igual(
    dentro(`select coalesce(${fila(RANKING(CLAURE), "prod_b")}->>'unidades', '-') || '|' || coalesce(${fila(RANKING(CLAURE), "prod_a")}->>'unidades', '-') || ' / ' ||
                   coalesce(${fila(RANKING(CAYLA), "prod_b")}->>'unidades', '-') || '|' || coalesce(${fila(RANKING(CAYLA), "prod_a")}->>'unidades', '-');`),
    "4|1 / -|3",
  ));
caso("F3. lo que queda en tiendas: CLAURE A 3 y B 5; CAYLA A 7; y CAYLA + CLAURE = el «queda» sin filtro (A 10, B 5)", () =>
  igual(
    dentro(`select ${queda(RANKING(CLAURE), "prod_a")} || '|' || ${queda(RANKING(CLAURE), "prod_b")} || ' / ' || ${queda(RANKING(CAYLA), "prod_a")} || ' / ' ||
                   ${queda(RANKING(sinEmp), "prod_a")} || '|' || ${queda(RANKING(sinEmp), "prod_b")};`),
    "3|5 / 7 / 10|5",
  ));
caso("F4. sin tienda elegida y sin empresa, «queda» suma todas las tiendas como siempre: la prenda A, 14 (10 en Lima + 4 en Trujillo)", () =>
  igual(dentro(`select ${queda(`retail.fn_reporte_ventas_ranking('2019-03-01', '2019-04-01', null, null, null, null, null, null, 'modelo', 'unidades', 0, 10, null)`, "prod_a")};`), "14"));

// ======================= G. Coincide con Caja e Historial =======================
caso("G. el CLAURE y el CAYLA del reporte son los de fn_vendido_por_empresa (Caja e Historial), con los mismos filtros", () =>
  igual(
    dentro(`select ${n(`${MES(CLAURE)}->'actual'->>'vendido'`)} || '/' || ${n(`${MES(CAYLA)}->'actual'->>'vendido'`)} || '/' ||
                   (select trim_scale(coalesce(sum(total) filter (where clave = 'claure'), 0))::text || '/' || trim_scale(coalesce(sum(total) filter (where clave = 'cayla'), 0))::text
                      from retail.fn_vendido_por_empresa(${LIM("2019-03-01")}, ${LIM("2019-04-01")}, ${LIMA}, null, 'completada', null, 'todos', false));`),
    "130/125/130/125",
  ));

// ======================= H. Dónde se puede elegir =======================
caso("H1. sin tienda, en Trujillo o con una empresa que no existe, las cuatro lecturas dicen 22023", () => {
  const malos = [
    ["sin tienda", (f) => f(CLAURE, "null")],
    ["en Trujillo", (f) => f(CLAURE, TRUJILLO)],
    ["empresa inexistente", (f) => f("'99999999-9999-4999-8999-999999999999'::uuid", LIMA)],
  ];
  const lecturas = [
    (e, u) => `retail.fn_reporte_ventas_mes('2019-03-15', ${u}, ${e})`,
    (e, u) => `retail.fn_reporte_ventas_series('2019-03-15', ${u}, ${e})`,
    (e, u) => `retail.fn_reporte_ventas_cortes('2019-03-15', ${u}, ${e})`,
    (e, u) => `retail.fn_reporte_ventas_ranking('2019-03-01', '2019-04-01', ${u}, null, null, null, null, null, 'modelo', 'unidades', 0, 10, ${e})`,
  ];
  for (const [que, aplicar] of malos) {
    for (const [i, lectura] of lecturas.entries()) {
      const consulta = aplicar((e, u) => lectura(e, u));
      const r = dentro(`select pg_temp.codigo($q$select ${consulta}$q$);`).split(" ")[0];
      if (r !== "22023") return `${que}, lectura ${i + 1}: se esperaba 22023 y salió «${r}»`;
    }
  }
  return null;
});
caso("H2. sin el módulo, con empresa, la lectura dice 42501 (antes de mirar la empresa)", () =>
  igual(dentro(`select pg_temp.codigo($q$select ${MES(CLAURE)}$q$);`, { como: SIN_PERSONA }).split(" ")[0], "42501"));

// ======================= I. Una cuenta de Lima que no es líder =======================
caso("I. una cuenta de Lima con el módulo lee lo mismo que el líder: cifras, ranking y lo que queda (las lecturas son INVOKER)", () => {
  const consulta = `select ${cifras(MES(CLAURE))} || ' / ' || ${n(`${RANKING(CLAURE)}->'total'->>'vendido'`)} || ' / ' || ${queda(RANKING(CLAURE), "prod_a")} || ' / ' ||
                           ${n(`(select sum((d->>'vendido')::numeric) from jsonb_array_elements(${SERIES(CLAURE)}->'dias') d)`)};`;
  const lider = dentro(consulta);
  const cuenta = dentro(consulta, { como: CUENTA_LIMA });
  if (lider !== "130|3|5|75 / 130 / 3 / 130") return `el líder leyó «${lider}»`;
  return igual(cuenta, lider);
});

// ======================= J. Permisos y firmas =======================
caso("J1. anon no ejecuta nada; authenticated ejecuta las lecturas y los ayudantes; fn_dueno_de_la_linea sigue cerrada para la API", () =>
  igual(
    dentro(
      `select string_agg(p.proname || '=' || has_function_privilege('anon', p.oid, 'execute')::text || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname)
         from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_empresa_de_la_linea', 'fn_reembolso_de_la_empresa', 'fn_exigir_empresa_del_reporte',
           'fn_reporte_ventas_mes', 'fn_reporte_ventas_series', 'fn_reporte_ventas_cortes', 'fn_reporte_ventas_ranking', 'fn_dueno_de_la_linea');`,
      { como: null },
    ),
    "fn_dueno_de_la_linea=false/false,fn_empresa_de_la_linea=false/true,fn_exigir_empresa_del_reporte=false/true,fn_reembolso_de_la_empresa=false/true,fn_reporte_ventas_cortes=false/true,fn_reporte_ventas_mes=false/true,fn_reporte_ventas_ranking=false/true,fn_reporte_ventas_series=false/true",
  ));
caso("J2. una sola firma de cada lectura (con dos, la llamada sin la empresa sería ambigua) y las cuatro siguen INVOKER y estables", () =>
  igual(
    dentro(
      `select count(*)::text || '|' || bool_and(not prosecdef)::text || '|' || bool_and(provolatile = 's')::text from pg_proc
        where pronamespace = 'retail'::regnamespace and proname in ('fn_reporte_ventas_mes', 'fn_reporte_ventas_series', 'fn_reporte_ventas_cortes', 'fn_reporte_ventas_ranking');`,
      { como: null },
    ),
    "4|true|true",
  ));
caso("J3. pegar la migración dos veces no falla", () => {
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${MIGRACION}\n\\o\nrollback;`);
  return null;
});

// ======================= K. El control =======================
caso("K. el control: con la regla por ficha (sin el movimiento) CLAURE saldría 90 y no 130; el movimiento SÍ cuenta", () =>
  igual(
    dentro(`select ${n(`${MES(CLAURE)}->'actual'->>'vendido'`)} || '|' ||
                   (select trim_scale(sum(i.subtotal))::text from retail.venta_items i join retail.ventas v on v.id = i.venta_id
                      join retail.variantes va on va.id = i.variante_id join retail.productos p on p.id = va.producto_id
                     where v.estado = 'completada' and not v.es_prueba and v.ubicacion_id = ${LIMA} and p.empresa_id = ${CLAURE}
                       and v.created_at >= ${LIM("2019-03-01")} and v.created_at < ${LIM("2019-04-01")});`),
    "130|90",
  ));

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);
