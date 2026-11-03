#!/usr/bin/env node
/**
 * Prueba de Ventas ▸ Reportes ▸ Ventas del mes: las cifras (`20261103230000_reporte_ventas_mes.sql`), las series de los gráficos
 * (`20261103232000_reporte_ventas_series.sql`) y el módulo (`20261103224000_reportes_ventas_modulo.sql`).
 *
 * EL PROBLEMA. El reporte suma ventas de todo un mes y las compara con el mes anterior. Un reporte de dinero que cuenta una venta anulada,
 * una de prueba, o la de las 00:00 del mes siguiente, no avisa: da una cifra que se lee bien y está mal. Y lo que ve cada cuenta lo decide
 * la base (la tienda propia o todas), no la pantalla.
 *
 * QUÉ CUBRE (mes cerrado, marzo de 2019, para no mezclarse con lo que haya en la base local)
 *   A. Las cinco cifras de marzo, de todas las tiendas, de Trujillo y de Lima, contra la suma hecha a mano: la venta de las 00:00 del 1 y la
 *      de las 23:30 del 31 cuentan; la de las 00:00 del 1 de abril, la anulada y la de prueba no. El «vendido» respeta el descuento.
 *      La devolución aprobada suma en el día en que se aprobó; la pendiente, la de abril y la de una venta de prueba no.
 *   B. El tramo de comparación: marzo (31 días) se compara con febrero ENTERO (28), no con 31 días que se pasan a marzo; el mes en curso
 *      se mide «a la fecha» y se compara con los mismos días del anterior; un mes futuro no trae nada.
 *   C. Quién ve qué: el líder ve todas las tiendas; una cuenta con el módulo en su rol ve solo la suya (aunque pida otra, da ceros);
 *      una sin el módulo recibe 42501; anon no ejecuta; un mes vacío da error 22023.
 *   D. Los atributos: función INVOKER (lee con las reglas de fila de siempre), estable y sin `search_path` propio.
 *   F. Las series de los gráficos (misma regla de qué cuenta): un día por cada día del mes, con ceros; lo cobrado por medio de pago (sin
 *      lo anulado ni lo de prueba); la ventana de meses (solo meses con ventas; los 12 que terminan hoy, o los 12 que empiezan en un mes viejo);
 *      el mes en curso llega hasta hoy; un mes futuro, vacío; quien tiene el módulo ve solo su tienda; sin el módulo, 42501.
 *   E. El control: sin los filtros de estado y de prueba, la cifra saldría distinta (la prueba sí discrimina).
 *
 * CÓMO. Todo en UNA transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido); las dos migraciones se pegan antes, así que
 * en local prueba el cambio aunque no esté aplicado y en el CI prueba además que se puede volver a pegar. Las ventas se siembran con los
 * disparadores apagados (`session_replication_role = replica`): aquí se prueba la lectura, no la venta. La sesión se simula con
 * `request.jwt.claim.sub` y `role authenticated`.
 *
 * USO
 *   pnpm pruebas:reporte-ventas-mes
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACIONES = ["20261103224000_reportes_ventas_modulo.sql", "20261103230000_reporte_ventas_mes.sql", "20261103232000_reporte_ventas_series.sql"].map((m) =>
  readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8"),
);
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CON_MODULO = "55555555-5555-4555-8555-0000000000f1"; // cuenta de Trujillo con el módulo en su rol (se crea aquí)
const SIN_MODULO = "55555555-5555-4555-8555-0000000000f2"; // cuenta de Trujillo sin el módulo (se crea aquí)
const ROL_CON = "55555555-5555-4555-8555-0000000000f3";
const ROL_SIN = "55555555-5555-4555-8555-0000000000f4";
const PERSONA_CON = "55555555-5555-4555-8555-0000000000f5";
const PERSONA_SIN = "55555555-5555-4555-8555-0000000000f6";
const NO_EXISTE = "55555555-5555-4555-8555-0000000000ff"; // una tienda que no existe

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const LIMA = (ts) => `(timestamp '${ts}' at time zone 'America/Lima')`;
const num = (path, esperado) => `(${path})::numeric = ${esperado}`;
const vend = (r, k) => `(${r} -> '${k}' ->> 'vendido')`;
const tic = (r, k) => `(${r} -> '${k}' ->> 'tickets')`;
const uni = (r, k) => `(${r} -> '${k}' ->> 'unidades')`;
const dev = (r, k) => `(${r} -> '${k}' ->> 'devuelto')`;

const SQL = `
begin;
${MIGRACIONES.join("\n")}
reset search_path;

-- Auxiliares (solo viven en esta transacción)
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

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as variante from retail.variantes limit 1 \\gset
select sede_base_id as sede_base from public.personas where auth_user_id = '${FELIPE}' \\gset

-- Cuentas: una de Trujillo CON el módulo en su rol y otra SIN
insert into auth.users (id, aud, role, email) values
  ('${CON_MODULO}', 'authenticated', 'authenticated', 'reporte-con@prueba.local'),
  ('${SIN_MODULO}', 'authenticated', 'authenticated', 'reporte-sin@prueba.local');
insert into retail.roles (id, nombre, descripcion) values
  ('${ROL_CON}', 'Reportes de prueba (con módulo)', 'Rol de prueba'),
  ('${ROL_SIN}', 'Reportes de prueba (sin módulo)', 'Rol de prueba');
insert into retail.rol_modulos (rol_id, modulo) values ('${ROL_CON}', 'reportes_ventas'), ('${ROL_SIN}', 'vender');
insert into public.personas (id, nombres, apellidos, estado, sede_base_id, auth_user_id) values
  ('${PERSONA_CON}', 'Con', 'Módulo', 'activo', :'sede_base', '${CON_MODULO}'),
  ('${PERSONA_SIN}', 'Sin', 'Módulo', 'activo', :'sede_base', '${SIN_MODULO}');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, rol_id) values
  ('${PERSONA_CON}', 'colaborador', :'tru', '${ROL_CON}'),
  ('${PERSONA_SIN}', 'colaborador', :'tru', '${ROL_SIN}');

-- Las ventas de la prueba (con los disparadores apagados: se prueba la lectura)
set local session_replication_role = replica;
create function pg_temp.venta(p_id text, p_ub uuid, p_cuando timestamptz, p_estado text, p_prueba boolean, p_precio numeric, p_desc numeric, p_cant int, p_var uuid)
returns void language plpgsql as $f$
begin
  insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, usuario_id, anulado_en, motivo_anulacion)
    values (md5('rv-' || p_id)::uuid, p_ub, p_cuando, p_estado, p_prueba, '${FELIPE}',
            case when p_estado = 'anulada' then p_cuando end, case when p_estado = 'anulada' then 'prueba' end);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento)
    values (md5('rv-i-' || p_id)::uuid, md5('rv-' || p_id)::uuid, p_var, p_cant, p_precio, p_desc, 0, case when p_desc > 0 then 'cerrar_venta' end);
end $f$;
create function pg_temp.devolucion(p_id text, p_venta text, p_ub uuid, p_estado text, p_monto numeric, p_aprobada timestamptz)
returns void language plpgsql as $f$
begin
  insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
    values (md5('rv-d-' || p_id)::uuid, md5('rv-' || p_venta)::uuid, p_ub, 'talla', p_estado, p_monto, 'efectivo', p_aprobada);
end $f$;

-- Marzo de 2019, Trujillo
select pg_temp.venta('V1', :'tru', ${LIMA("2019-03-03 12:00")}, 'completada', false, 50, 0, 2, :'variante');   -- 100
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (md5('rv-i-V1b')::uuid, md5('rv-V1')::uuid, :'variante', 1, 30, 0, 0);                    -- +30 = 130 (3 prendas)
select pg_temp.venta('V2', :'tru', ${LIMA("2019-03-31 23:30")}, 'completada', false, 70, 10, 1, :'variante');   -- 60: el último día cuenta, con su descuento
select pg_temp.venta('V8', :'tru', ${LIMA("2019-03-01 00:00")}, 'completada', false, 10, 0, 1, :'variante');    -- 10: el primer instante del mes cuenta
select pg_temp.venta('V3', :'tru', ${LIMA("2019-04-01 00:00")}, 'completada', false, 999, 0, 1, :'variante');   -- NO: ya es abril
select pg_temp.venta('V4', :'tru', ${LIMA("2019-03-05 10:00")}, 'anulada', false, 777, 0, 1, :'variante');      -- NO: anulada
select pg_temp.venta('V5', :'tru', ${LIMA("2019-03-06 10:00")}, 'completada', true, 888, 0, 1, :'variante');    -- NO: de prueba
-- Marzo de 2019, Lima
select pg_temp.venta('V6', :'lim', ${LIMA("2019-03-10 10:00")}, 'completada', false, 50, 0, 4, :'variante');    -- 200
-- Febrero de 2019, Trujillo (el mes anterior: 28 días)
select pg_temp.venta('V7', :'tru', ${LIMA("2019-02-20 10:00")}, 'completada', false, 40, 0, 2, :'variante');    -- 80
-- Devoluciones
select pg_temp.devolucion('D1', 'V1', :'tru', 'aprobada', 29.90, ${LIMA("2019-03-08 10:00")});    -- SÍ: 29,90
select pg_temp.devolucion('D2', 'V1', :'tru', 'pendiente', 50, null);                              -- NO: pendiente
select pg_temp.devolucion('D3', 'V1', :'tru', 'aprobada', 15, ${LIMA("2019-04-02 10:00")});       -- NO: se aprobó en abril
select pg_temp.devolucion('D4', 'V5', :'tru', 'aprobada', 99, ${LIMA("2019-03-12 10:00")});       -- NO: de una venta de prueba
select pg_temp.devolucion('D5', 'V7', :'tru', 'aprobada', 20, ${LIMA("2019-02-25 10:00")});       -- febrero: 20
-- Lo cobrado de cada venta (las de abril, la anulada y la de prueba traen pagos que NO deben contar)
insert into retail.venta_pagos (id, venta_id, metodo, monto) values
  (md5('rv-p1')::uuid, md5('rv-V1')::uuid, 'efectivo', 100),
  (md5('rv-p2')::uuid, md5('rv-V1')::uuid, 'yape', 30),
  (md5('rv-p3')::uuid, md5('rv-V2')::uuid, 'tarjeta', 60),
  (md5('rv-p4')::uuid, md5('rv-V8')::uuid, 'efectivo', 10),
  (md5('rv-p5')::uuid, md5('rv-V6')::uuid, 'efectivo', 200),
  (md5('rv-p6')::uuid, md5('rv-V3')::uuid, 'efectivo', 999),
  (md5('rv-p7')::uuid, md5('rv-V4')::uuid, 'efectivo', 777),
  (md5('rv-p8')::uuid, md5('rv-V5')::uuid, 'yape', 888);
set local session_replication_role = origin;

-- Sesión del líder
set local role authenticated;
select set_config('request.jwt.claim.sub', '${FELIPE}', true);
select
  retail.fn_reporte_ventas_mes('2019-03-15', null)    as todas,
  retail.fn_reporte_ventas_mes('2019-03-01', :'tru')  as tru,
  retail.fn_reporte_ventas_mes('2019-03-31', :'lim')  as lima,
  retail.fn_reporte_ventas_mes((date_trunc('month', now() at time zone 'America/Lima') + interval '5 months')::date, null) as futuro,
  retail.fn_reporte_ventas_mes(date_trunc('month', now() at time zone 'America/Lima')::date, '${NO_EXISTE}') as encurso \\gset r_

select 'A1 todas las tiendas: vendido 400 (130 + 60 + 10 + 200)' || '|' || (${num(vend(":'r_todas'::jsonb", "actual"), 400)})::text;
select 'A2 todas las tiendas: 4 ventas y 9 prendas' || '|' || (${num(tic(":'r_todas'::jsonb", "actual"), 4)} and ${num(uni(":'r_todas'::jsonb", "actual"), 9)})::text;
select 'A3 todas las tiendas: devuelto 29,90 (la pendiente, la de abril y la de prueba no)' || '|' || (${num(dev(":'r_todas'::jsonb", "actual"), "29.90")})::text;
select 'A4 el tramo es marzo entero: del 1 de marzo al 1 de abril' || '|' || (:'r_todas'::jsonb -> 'actual' ->> 'desde' = '2019-03-01' and :'r_todas'::jsonb -> 'actual' ->> 'hasta' = '2019-04-01')::text;
select 'A5 Trujillo: vendido 200, 3 ventas, 5 prendas, devuelto 29,90' || '|' || (${num(vend(":'r_tru'::jsonb", "actual"), 200)} and ${num(tic(":'r_tru'::jsonb", "actual"), 3)} and ${num(uni(":'r_tru'::jsonb", "actual"), 5)} and ${num(dev(":'r_tru'::jsonb", "actual"), "29.90")})::text;
select 'A6 Lima: vendido 200, 1 venta, 4 prendas, devuelto 0' || '|' || (${num(vend(":'r_lima'::jsonb", "actual"), 200)} and ${num(tic(":'r_lima'::jsonb", "actual"), 1)} and ${num(uni(":'r_lima'::jsonb", "actual"), 4)} and ${num(dev(":'r_lima'::jsonb", "actual"), 0)})::text;
select 'A7 la primera venta de Trujillo es la del 20 de febrero' || '|' || (:'r_tru'::jsonb ->> 'primera_venta' = '2019-02-20')::text;
select 'B1 marzo (31 días) se compara con febrero ENTERO (28): del 1 de febrero al 1 de marzo' || '|' || (:'r_tru'::jsonb -> 'anterior' ->> 'desde' = '2019-02-01' and :'r_tru'::jsonb -> 'anterior' ->> 'hasta' = '2019-03-01')::text;
select 'B2 febrero de Trujillo: vendido 80, 1 venta, 2 prendas, devuelto 20' || '|' || (${num(vend(":'r_tru'::jsonb", "anterior"), 80)} and ${num(tic(":'r_tru'::jsonb", "anterior"), 1)} and ${num(uni(":'r_tru'::jsonb", "anterior"), 2)} and ${num(dev(":'r_tru'::jsonb", "anterior"), 20)})::text;
select 'B3 mes futuro: tramo vacío, sin ventas y no está en curso' || '|' || (:'r_futuro'::jsonb -> 'actual' ->> 'desde' = :'r_futuro'::jsonb -> 'actual' ->> 'hasta' and ${num(tic(":'r_futuro'::jsonb", "actual"), 0)} and :'r_futuro'::jsonb ->> 'en_curso' = 'false')::text;
select 'B4 mes en curso: está en curso y se mide hasta hoy inclusive' || '|' || (:'r_encurso'::jsonb ->> 'en_curso' = 'true' and (:'r_encurso'::jsonb -> 'actual' ->> 'hasta')::date = (:'r_encurso'::jsonb ->> 'hoy')::date + 1)::text;
select 'B5 mes en curso: el anterior se mide por los MISMOS días (o el mes entero si es más corto)' || '|' ||
  ((:'r_encurso'::jsonb -> 'anterior' ->> 'hasta')::date = least(
     (:'r_encurso'::jsonb -> 'anterior' ->> 'desde')::date + ((:'r_encurso'::jsonb -> 'actual' ->> 'hasta')::date - (:'r_encurso'::jsonb -> 'actual' ->> 'desde')::date),
     (:'r_encurso'::jsonb -> 'actual' ->> 'desde')::date))::text;
select 'B6 una tienda sin ventas da ceros, no un error' || '|' || (${num(vend(":'r_encurso'::jsonb", "actual"), 0)} and ${num(tic(":'r_encurso'::jsonb", "actual"), 0)})::text;

select
  retail.fn_reporte_ventas_series('2019-03-15', null)   as todas,
  retail.fn_reporte_ventas_series('2019-03-01', :'tru') as tru,
  retail.fn_reporte_ventas_series((date_trunc('month', now() at time zone 'America/Lima') + interval '5 months')::date, null) as futuro,
  retail.fn_reporte_ventas_series(date_trunc('month', now() at time zone 'America/Lima')::date, null) as encurso \\gset s_
create function pg_temp.dia(p_json jsonb, p_fecha text) returns numeric language sql as $f$
  select (x ->> 'vendido')::numeric from jsonb_array_elements(p_json -> 'dias') x where x ->> 'fecha' = p_fecha
$f$;
grant execute on function pg_temp.dia(jsonb, text) to authenticated;
select 'F1 marzo: un día por cada uno de los 31 días y la suma es 400' || '|' ||
  (jsonb_array_length(:'s_todas'::jsonb -> 'dias') = 31 and (select sum((x ->> 'vendido')::numeric) from jsonb_array_elements(:'s_todas'::jsonb -> 'dias') x) = 400)::text;
select 'F2 los días: 1 → 10, 3 → 130, 10 → 200, 31 → 60, y el día de la venta anulada vale 0 (no falta)' || '|' ||
  (pg_temp.dia(:'s_todas'::jsonb, '2019-03-01') = 10 and pg_temp.dia(:'s_todas'::jsonb, '2019-03-03') = 130 and pg_temp.dia(:'s_todas'::jsonb, '2019-03-10') = 200
   and pg_temp.dia(:'s_todas'::jsonb, '2019-03-31') = 60 and pg_temp.dia(:'s_todas'::jsonb, '2019-03-05') = 0)::text;
select 'F3 cobrado de marzo, todas las tiendas: efectivo 310, tarjeta 60, yape 30 (sin lo anulado, lo de prueba ni abril)' || '|' ||
  ((:'s_todas'::jsonb -> 'pagos') = '[{"metodo":"efectivo","monto":310},{"metodo":"tarjeta","monto":60},{"metodo":"yape","monto":30}]'::jsonb)::text;
select 'F4 cobrado de marzo en Trujillo: efectivo 110, tarjeta 60, yape 30' || '|' ||
  ((:'s_tru'::jsonb -> 'pagos') = '[{"metodo":"efectivo","monto":110},{"metodo":"tarjeta","monto":60},{"metodo":"yape","monto":30}]'::jsonb)::text;
select 'F5 la ventana de meses desde un mes viejo: marzo 400 (4 ventas) y abril 999 (1), y ningún otro (febrero queda fuera)' || '|' ||
  ((:'s_todas'::jsonb -> 'meses') = '[{"mes":"2019-03-01","vendido":400,"tickets":4,"en_curso":false},{"mes":"2019-04-01","vendido":999,"tickets":1,"en_curso":false}]'::jsonb)::text;
select 'F6 los meses de Trujillo: marzo 200 (3 ventas) y abril 999' || '|' ||
  ((:'s_tru'::jsonb -> 'meses') = '[{"mes":"2019-03-01","vendido":200,"tickets":3,"en_curso":false},{"mes":"2019-04-01","vendido":999,"tickets":1,"en_curso":false}]'::jsonb)::text;
select 'F7 mirando el mes en curso, la ventana son los 12 meses que terminan hoy, y solo el de hoy está en curso' || '|' ||
  (not exists (select 1 from jsonb_array_elements(:'s_encurso'::jsonb -> 'meses') m
     where (m ->> 'mes')::date < (date_trunc('month', now() at time zone 'America/Lima') - interval '11 months')::date
        or (m ->> 'mes')::date > date_trunc('month', now() at time zone 'America/Lima')::date
        or ((m ->> 'en_curso')::boolean) <> ((m ->> 'mes')::date = date_trunc('month', now() at time zone 'America/Lima')::date)))::text;
select 'F8 el mes en curso trae un día por cada día que va, hasta hoy' || '|' ||
  (jsonb_array_length(:'s_encurso'::jsonb -> 'dias') = extract(day from (now() at time zone 'America/Lima')::date)
   and (:'s_encurso'::jsonb -> 'dias' -> -1 ->> 'fecha')::date = (now() at time zone 'America/Lima')::date)::text;
select 'F9 un mes futuro no trae días ni cobros' || '|' ||
  (jsonb_array_length(:'s_futuro'::jsonb -> 'dias') = 0 and jsonb_array_length(:'s_futuro'::jsonb -> 'pagos') = 0)::text;

-- El control: sin los filtros de estado y de prueba, marzo saldría de otro tamaño
reset role;
select 'E1 control: sin filtrar anuladas ni pruebas saldrían 2065, no 400 (la prueba sí discrimina)' || '|' ||
  ((select sum(i.subtotal) from retail.ventas v join retail.venta_items i on i.venta_id = v.id
     where v.created_at >= ${LIMA("2019-03-01 00:00")} and v.created_at < ${LIMA("2019-04-01 00:00")}) = 2065)::text;

-- Cuenta con el módulo: solo ve su tienda
set local role authenticated;
select set_config('request.jwt.claim.sub', '${CON_MODULO}', true);
select
  retail.fn_reporte_ventas_mes('2019-03-01', null)    as sin_filtro,
  retail.fn_reporte_ventas_mes('2019-03-01', :'lim')  as pide_lima \\gset c_
select 'C1 con el módulo ve SOLO su tienda: Trujillo 200 (no los 400 de todas)' || '|' || (${num(vend(":'c_sin_filtro'::jsonb", "actual"), 200)} and ${num(tic(":'c_sin_filtro'::jsonb", "actual"), 3)})::text;
select retail.fn_reporte_ventas_series('2019-03-01', null) as series \\gset c2_
select 'F10 con el módulo, las series también son SOLO de su tienda: marzo suma 200, no 400' || '|' ||
  ((select sum((x ->> 'vendido')::numeric) from jsonb_array_elements(:'c2_series'::jsonb -> 'dias') x) = 200)::text;
select 'C2 con el módulo, pedir otra tienda da ceros (la base no se la muestra)' || '|' || (${num(vend(":'c_pide_lima'::jsonb", "actual"), 0)} and ${num(tic(":'c_pide_lima'::jsonb", "actual"), 0)})::text;

-- Cuenta sin el módulo
select set_config('request.jwt.claim.sub', '${SIN_MODULO}', true);
select 'C3 sin el módulo: 42501' || '|' || (pg_temp.codigo($q$select retail.fn_reporte_ventas_mes('2019-03-01', null)$q$) like '42501 %')::text;

select 'F11 las series sin el módulo: 42501' || '|' ||
  (pg_temp.codigo($q$select retail.fn_reporte_ventas_series('2019-03-01', null)$q$) like '42501 %')::text;

-- Líder: mes vacío
select set_config('request.jwt.claim.sub', '${FELIPE}', true);
select 'F12 las series sin mes: error 22023' || '|' ||
  (pg_temp.codigo($q$select retail.fn_reporte_ventas_series(null, null)$q$) like '22023 %')::text;
select 'C4 sin mes: error 22023' || '|' || (pg_temp.codigo($q$select retail.fn_reporte_ventas_mes(null, null)$q$) like '22023 %')::text;

-- anon no ejecuta
reset role;
set local role anon;
select 'C5 anon no ejecuta (permiso denegado)' || '|' || (pg_temp.codigo($q$select retail.fn_reporte_ventas_mes('2019-03-01', null)$q$) like '42501 permission denied%')::text;
reset role;

-- Atributos
select 'D1 es INVOKER (lee con las reglas de fila), estable y sin search_path propio' || '|' ||
  (select (not p.prosecdef and p.provolatile = 's' and p.proconfig is null) from pg_proc p where p.oid = 'retail.fn_reporte_ventas_mes(date, uuid)'::regprocedure)::text;
select 'F13 la función de series también es INVOKER, estable y sin search_path propio' || '|' ||
  (select (not p.prosecdef and p.provolatile = 's' and p.proconfig is null) from pg_proc p where p.oid = 'retail.fn_reporte_ventas_series(date, uuid)'::regprocedure)::text;
select 'D2 el módulo nace sin rol y delegable' || '|' ||
  (exists (select 1 from retail.modulos where clave = 'reportes_ventas' and not solo_lider and delegable)
   and not exists (select 1 from retail.rol_modulos where modulo = 'reportes_ventas' and rol_id not in ('${ROL_CON}')))::text;
rollback;
`;

let salida;
try {
  salida = psql(SQL);
} catch (e) {
  console.error(`✗ La prueba no pudo correr:\n${e.stderr ?? ""}${e.message ?? ""}`);
  process.exit(1);
}
const casos = salida
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /\|(true|false)$/.test(l))
  .map((l) => ({ nombre: l.slice(0, l.lastIndexOf("|")), ok: l.endsWith("|true") }));
for (const c of casos) console.log(`${c.ok ? "✓" : "✗"} ${c.nombre}`);
const ESPERADOS = 34;
if (casos.length !== ESPERADOS) {
  console.error(`✗ Se esperaban ${ESPERADOS} casos y salieron ${casos.length}: la prueba dejó de mirar algo.`);
  process.exit(1);
}
const mal = casos.filter((c) => !c.ok);
if (mal.length) {
  console.error(`\n✗ ${mal.length} de ${casos.length} casos fallaron.`);
  process.exit(1);
}
console.log(`\n✓ ${casos.length} casos en verde (todo en una transacción que se deshizo).`);
