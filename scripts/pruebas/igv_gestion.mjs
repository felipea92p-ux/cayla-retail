#!/usr/bin/env node
/**
 * Prueba de `20261107034000_igv_de_gestion.sql` (ADR-0620): el IGV que el líder dice que va a pagar cada mes, como capa de lectura
 * sobre el Estado de resultados.
 *
 * QUÉ PROMETE
 *   · Ventas con IGV = ventas netas + 4011 de venta, anulación, devolución y cambio, también con adelanto: el adelanto ya está fuera
 *     de las netas y su IGV no se cuenta dos veces.
 *   · Las partes de un mes completo suman exacto lo dicho, con el resto de céntimos en la unidad mayor. 0 dicho es distinto de sin dato.
 *   · Mes parcial: monto × IGV del tramo ÷ IGV del mes. IGV del mes en 0 o menos: el monto va a «De la empresa».
 *   · Decir el monto no agrega líneas al diario y el Balance y el Estado de resultados quedan iguales.
 *   · Rechaza con la empresa cerrada o con CUALQUIER tienda cerrada, también al repetir el monto y al insertar directo.
 *   · Solo el líder dice; lo lee quien ve toda CAYLA; una terminal con el módulo no recibe el monto.
 *   · Una regla nueva de `fn_asientos*` que mueva la 4011 o la 7011 hace fallar esta suite: la lista de `fn_igv_de_gestion` hay que revisarla.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (comentarios de la escena), no salen de las funciones.
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones) y sesión simulada con
 * `request.jwt.claim.sub`. Los meses son de 2025, que ninguna otra escena toca, con Finanzas contando desde siempre.
 *
 * USO
 *   pnpm pruebas:igv-gestion
 *   RETAIL_CONTENEDOR_PG=<contenedor> pnpm pruebas:igv-gestion   → contra otra pila local
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const TERMINAL = "22222222-2222-4222-8222-0000000000f8";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
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
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
/** Cada verificación sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
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
      })
  );
  for (const caso of esperados) {
    esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
  }
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

const AYUDANTES = `
-- «SQLSTATE|mensaje|hint» de lo que falla ('SIN_ERROR' si no falla).
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || v_msg || '|' || coalesce(v_hint, '');
end;
$f$;
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Una venta de UNA línea con sus cobros (jsonb [{m, v}]); si viene anulada, la prenda vuelve vendible.
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_cant int, p_precio numeric, p_pagos jsonb,
                               p_anulada timestamptz default null) returns void language plpgsql as $f$
declare x jsonb;
begin
  insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, created_at)
  values (pg_temp.k(p_n), p_ubic, case when p_anulada is null then 'completada' else 'anulada' end, p_anulada,
          case when p_anulada is null then null else 'prueba IGV' end, p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, p_cant, p_precio, 0, 40);
  for x in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), x ->> 'm', (x ->> 'v')::numeric);
  end loop;
  if p_anulada is not null then
    insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (pg_temp.k(p_n), pg_temp.k(p_n || 'i'), 'vendible');
  end if;
end $f$;
-- Un mes desde la lectura: cuánto suman las partes y el IGV incluido, por rango.
create function pg_temp.partes(p_desde date, p_hasta date) returns numeric language sql as $f$
  select sum(igv_parte) from retail.fn_igv_de_gestion(p_desde, p_hasta)
$f$;
create function pg_temp.parte(p_mes date, p_ubic uuid) returns numeric language sql as $f$
  select igv_parte from retail.fn_igv_de_gestion(p_mes, (p_mes + interval '1 month' - interval '1 day')::date)
   where ubicacion_id is not distinct from p_ubic
$f$;
`;

const BASE = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
update retail.parametros_finanzas set inicio_finanzas = null where id;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select (select id from retail.cajas order by abierta_en desc nulls last limit 1) as caja \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset
select v.id as vn from retail.variantes v where v.id not in ('22222222-2222-4222-8222-222222222222', :'va') order by v.id limit 1 \\gset
`;

// ============================================================================================================================
// AGOSTO DE 2025, precios CON IGV al 18 % (236 → 36 + 200 · 118 → 18 + 100 · 590 → 90 + 500 · 59 → 9 + 50).
//   TRU: V1 236 (día 3) · V2 118 (día 20) · V3 236 con adelanto de 118 (día 18; el adelanto se pagó el 2).
//        Netas 500, IGV 90: el debe de 18 del adelanto NO resta, y la boleta de anticipo NO suma.
//   LIM: V4 118 (día 5) · V5 118 vendida el 6 y anulada el 7 (0) · V6 2 × 118 (día 8) con una devolución de 118 el 12 (+36 −18)
//        · V7 236 (día 9) con un cambio de +59 el 13 (+36 +9).  Netas 100 + 0 + 200 − 100 + 200 + 50 = 450, IGV 81.
//   Taller: V8 590 (día 25). Netas 500, IGV 90.
//   Mes: IGV 261. Tramo del 1 al 10: TRU 36 · LIM 18 + 0 + 36 + 36 = 90 · Taller 0 → 126.
// ============================================================================================================================
const AGOSTO = `
select pg_temp.vender('V1', :'tru', '2025-08-03 12:00-05', :'va', 1, 236, '[{"m":"efectivo","v":236}]');
select pg_temp.vender('V2', :'tru', '2025-08-20 12:00-05', :'va', 1, 118, '[{"m":"yape","v":118}]');
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo,
       creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, estado, created_at)
values (pg_temp.k('SEP'), 'IG-' || left(pg_temp.k('SEP')::text, 8), :'tru', :'caja', 'Ana', 'Prueba', '999888777', 'boleta',
        :'felipe', 236, 118, '2025-08-20', 'yape', '999888777', 'abierta', '2025-08-02 10:00-05');
insert into retail.separacion_pagos (separacion_id, metodo, monto, created_at) values (pg_temp.k('SEP'), 'yape', 118, '2025-08-02 10:00-05');
select pg_temp.vender('V3', :'tru', '2025-08-18 12:00-05', :'va', 1, 236, '[{"m":"anticipo","v":118},{"m":"efectivo","v":118}]');
update retail.separaciones set estado = 'entregada', venta_id = pg_temp.k('V3'), entregada_en = '2025-08-18 12:00-05' where id = pg_temp.k('SEP');
select pg_temp.vender('V4', :'lim', '2025-08-05 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
select pg_temp.vender('V5', :'lim', '2025-08-06 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]', '2025-08-07 12:00-05');
select pg_temp.vender('V6', :'lim', '2025-08-08 12:00-05', :'va', 2, 118, '[{"m":"efectivo","v":236}]');
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
values (pg_temp.k('D1'), pg_temp.k('V6'), :'lim', 'talla', 'aprobada', null, 'efectivo', '2025-08-12 10:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (pg_temp.k('D1'), pg_temp.k('V6i'), 1, 'vendible');
select pg_temp.vender('V7', :'lim', '2025-08-09 12:00-05', :'va', 1, 236, '[{"m":"efectivo","v":236}]');
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, motivo, condicion, created_at)
values (pg_temp.k('C1'), pg_temp.k('V7i'), :'lim', :'vn', 1, 59, 'efectivo', 'talla_chica', 'vendible', '2025-08-13 12:00-05');
select pg_temp.vender('V8', :'tal', '2025-08-25 12:00-05', :'va', 1, 590, '[{"m":"efectivo","v":590}]');
`;

const VENTAS_CON_IGV = `
create temp table g as select * from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31');
create temp table er as select * from retail.fn_estado_resultados('2025-08-01', '2025-08-31');
select 'A1 Trujillo, con adelanto: netas 500 + IGV 90 = 590', (select ventas_netas from er where ubicacion_id = :'tru') = 500 and (select igv_tramo from g where ubicacion_id = :'tru') = 90;
select 'A2 Lima, con anulación, devolución y cambio: netas 450 + IGV 81 = 531', (select ventas_netas from er where ubicacion_id = :'lim') = 450 and (select igv_tramo from g where ubicacion_id = :'lim') = 81;
select 'A3 el adelanto sí está en la 4011: si se sumara, Trujillo daría otra cifra', (select sum(haber - debe) from retail.fn_diario('2025-08-01', '2025-08-31', :'tru') where cuenta = '4011') = 90 and (select sum(haber) from retail.fn_diario('2025-08-01', '2025-08-31', :'tru') where cuenta = '4011') = 108;
select 'A4 sin monto dicho: monto y parte nulos, y el IGV del mes es la suma', (select bool_and(monto_dicho is null and igv_parte is null and igv_mes = 261) from g) and (select count(*) from g) = 3;
select 'A5 un rango que no toca el mes no devuelve filas', not exists (select 1 from retail.fn_igv_de_gestion('2025-01-01', '2025-01-31'));
`;

// Un mes por caso: decir en un mes y leerlo en la misma transacción. Las cifras son de la escena de agosto: 90 · 81 · 90 de 261.
const DECIR = `
select retail.decir_igv_del_mes('2025-08-15', 100, '  con saldo a favor  ') as d1 \\gset
select 'B1 un día del mes vale por el mes y la nota va sin espacios', (select count(*) = 1 and bool_and(mes = '2025-08-01' and monto = 100 and nota = 'con saldo a favor' and creado_por = :'felipe') from retail.igv_del_mes where mes = '2025-08-01');
select 'B2 dice qué guardó', (:'d1'::jsonb ->> 'nuevo') = 'true' and (:'d1'::jsonb ->> 'mes') = '2025-08-01';
select 'B3 las partes de 100 suman 100 y siguen al IGV (34.48 · 31.03 · 34.49)', pg_temp.partes('2025-08-01', '2025-08-31') = 100 and pg_temp.parte('2025-08-01', :'lim') = 31.03;
select 'B4 el monto llega en cada fila', (select bool_and(monto_dicho = 100 and igv_mes = 261) from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31'));
select retail.decir_igv_del_mes('2025-08-01', 1.01) as d2 \\gset
select 'B5 lo más reciente gana y la fila vieja se queda', pg_temp.partes('2025-08-01', '2025-08-31') = 1.01 and (select count(*) from retail.igv_del_mes where mes = '2025-08-01') = 2;
select 'B6 el resto de céntimos va a una unidad mayor (0.35 · 0.31 · 0.35)', pg_temp.parte('2025-08-01', :'lim') = 0.31 and pg_temp.parte('2025-08-01', :'tru') + pg_temp.parte('2025-08-01', :'tal') = 0.70;
select retail.decir_igv_del_mes('2025-08-01', 1.01) as d3 \\gset
select 'B7 repetir el monto no agrega fila', (:'d3'::jsonb ->> 'nuevo') = 'false' and (select count(*) from retail.igv_del_mes where mes = '2025-08-01') = 2;
select retail.decir_igv_del_mes('2025-08-01', 261);
select 'B8 tramo del 1 al 10 con 261 dichos: el IGV del tramo tal cual (36 · 90 · 0)', pg_temp.partes('2025-08-01', '2025-08-10') = 126 and (select igv_parte from retail.fn_igv_de_gestion('2025-08-01', '2025-08-10') where ubicacion_id = :'lim') = 90 and (select igv_parte from retail.fn_igv_de_gestion('2025-08-01', '2025-08-10') where ubicacion_id = :'tal') = 0;
select 'B9 el tramo conserva el IGV del mes para prorratear', (select bool_and(igv_mes = 261) from retail.fn_igv_de_gestion('2025-08-01', '2025-08-10'));
select retail.decir_igv_del_mes('2025-08-01', 0);
select 'B10 0 dicho es 0, no sin dato', (select bool_and(monto_dicho = 0 and igv_parte = 0) from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31')) and pg_temp.partes('2025-08-01', '2025-08-10') = 0;

-- Julio sin IGV, septiembre sin decir: un rango de tres meses dice cada uno por su lado.
select pg_temp.vender('V9', :'tru', '2025-09-02 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
select retail.decir_igv_del_mes('2025-07-01', 50);
create temp table tres as select * from retail.fn_igv_de_gestion('2025-07-01', '2025-09-30');
select 'C1 un mes dicho sin ventas: el monto va a «De la empresa»', (select count(*) = 1 and bool_and(ubicacion_id is null and igv_tramo = 0 and igv_mes = 0 and monto_dicho = 50 and igv_parte = 50) from tres where mes = '2025-07-01');
select 'C2 varios meses: agosto dicho en 0', (select count(*) = 3 and bool_and(monto_dicho = 0) from tres where mes = '2025-08-01');
select 'C3 varios meses: septiembre sin dato sale con su IGV y sin monto', (select count(*) = 1 and bool_and(ubicacion_id = :'tru' and igv_tramo = 18 and monto_dicho is null and igv_parte is null) from tres where mes = '2025-09-01');

-- Junio: una venta de mayo anulada en junio deja el IGV en −36; 20 dichos van a la empresa y Lima no carga nada.
select pg_temp.vender('V10', :'lim', '2025-05-20 12:00-05', :'va', 1, 236, '[{"m":"efectivo","v":236}]', '2025-06-03 12:00-05');
select retail.decir_igv_del_mes('2025-06-01', 20);
select 'C4 IGV del mes negativo: el monto va a la empresa', pg_temp.parte('2025-06-01', null) = 20 and pg_temp.parte('2025-06-01', :'lim') = 0 and pg_temp.partes('2025-06-01', '2025-06-30') = 20;
select 'C5 IGV del mes negativo: la fila de Lima dice −36', (select igv_mes from retail.fn_igv_de_gestion('2025-06-01', '2025-06-30') limit 1) = -36;

-- Octubre: Trujillo +18 y Lima −9 (venta de septiembre anulada en octubre). 9 dichos: 18 y −9, misma proporción para todos.
select pg_temp.vender('V11', :'tru', '2025-10-05 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
select pg_temp.vender('V12', :'lim', '2025-09-28 12:00-05', :'va', 1, 59, '[{"m":"efectivo","v":59}]', '2025-10-02 12:00-05');
select retail.decir_igv_del_mes('2025-10-01', 9);
select 'C6 una sede con IGV negativo reparte igual y suma lo dicho', pg_temp.parte('2025-10-01', :'tru') = 18 and pg_temp.parte('2025-10-01', :'lim') = -9 and pg_temp.partes('2025-10-01', '2025-10-31') = 9;

select retail.decir_igv_del_mes(retail.fn_hoy_lima(), 10) as d4 \\gset
select 'C7 el mes en curso se puede decir', (:'d4'::jsonb ->> 'mes') = to_char(date_trunc('month', retail.fn_hoy_lima()), 'YYYY-MM-DD');
`;

const LIBRO = `
-- Sin arranque el Balance sale vacío y compararlo no prueba nada: se registra uno con la propuesta del sistema.
create temp table prop as select * from retail.fn_saldos_iniciales_propuesta('2025-01-01') where origen = 'sistema';
select (select jsonb_agg(jsonb_build_object('cuenta', cuenta, 'monto', monto, 'origen', 'sistema')) from prop)
    || jsonb_build_array(jsonb_build_object('cuenta', '50', 'monto',
         (select sum(case when tipo = 'activo' and cuenta not like '39%' then monto when cuenta like '39%' then -monto
                          when tipo = 'pasivo' then -monto else 0 end) from prop))) as lineas \\gset
select retail.registrar_saldo_inicial('2025-01-01', :'lineas'::jsonb) as filas \\gset
create temp table antes as
  select (select count(*) from retail.fn_diario('2025-01-01', '2025-12-31')) as lineas,
         (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_diario('2025-01-01', '2025-12-31') t) as diario,
         (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_estado_resultados('2025-08-01', '2025-08-31') t) as er,
         (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_balance_general(retail.fn_hoy_lima()) t) as balance;
select retail.decir_igv_del_mes('2025-08-01', 0);
select retail.decir_igv_del_mes('2025-08-01', 500);
select 'L1 decir el monto no agrega líneas al diario', (select lineas from antes) = (select count(*) from retail.fn_diario('2025-01-01', '2025-12-31'));
select 'L2 el diario queda idéntico', (select diario from antes) = (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_diario('2025-01-01', '2025-12-31') t);
select 'L3 el Estado de resultados queda idéntico', (select er from antes) = (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_estado_resultados('2025-08-01', '2025-08-31') t);
select 'L4 el Balance tiene con qué compararse', (select balance is not null from antes);
select 'L5 el Balance queda idéntico', (select balance from antes) = (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_balance_general(retail.fn_hoy_lima()) t);
`;

const REGLAS_DE_MONTO = `
select 'M1 un mes futuro se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes((date_trunc('month', retail.fn_hoy_lima()) + interval '1 month')::date, 10)$q$) like 'P0001|Ese mes todavía no llega%';
select 'M2 un monto negativo se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', -1)$q$) like 'P0001|El monto tiene que ser%';
select 'M3 NaN se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 'NaN')$q$) like 'P0001|El monto tiene que ser%';
select 'M4 Infinity se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 'Infinity')$q$) like 'P0001|El monto tiene que ser%';
select 'M5 un monto sin dato se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', null)$q$) like 'P0001|El monto tiene que ser%';
select 'M6 tres decimales se rechazan', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10.123)$q$) like 'P0001|El monto tiene que ser%';
select 'M7 un monto que no cabe se rechaza con su mensaje', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10000000000)$q$) like 'P0001|El monto tiene que ser%';
select 'M8 sin mes se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes(null, 10)$q$) like 'P0001|Elige el mes%';
select 'M9 una nota de más de 500 letras se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10, repeat('a', 501))$q$) like 'P0001|La nota no puede%';
select 'M10 un rango al revés se rechaza', pg_temp.intento($q$select * from retail.fn_igv_de_gestion('2025-08-31', '2025-08-01')$q$) like 'P0001|El rango de fechas%';
select pg_temp.vender('V9', :'tru', '2025-09-02 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
update retail.parametros_finanzas set inicio_finanzas = '2025-09-01' where id;
select 'M11 un mes anterior al inicio de Finanzas se rechaza', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10)$q$) like 'P0001|Finanzas cuenta desde%';
select 'M12 el mes del inicio se acepta', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-09-01', 10)$q$) = 'SIN_ERROR';
select 'M13 la lectura arranca con Finanzas: agosto no entra y septiembre sí', (select count(*) = 1 and bool_and(mes = '2025-09-01' and igv_tramo = 18 and igv_parte = 10) from retail.fn_igv_de_gestion('2025-08-01', '2025-09-30'));
select 'M14 un rango que termina antes del inicio no devuelve nada', not exists (select 1 from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31'));
`;

const CANDADO = `
create function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select coalesce(current_setting('prueba.planilla', true), 'no') = 'si' $f$;
create view retail.planilla_por_sede as
select * from (values ('TRU'::text, 'tienda'::text, 'f5f5f5f5-0000-4000-8000-0000000000c3'::uuid, '2030-08-29'::date, '2030-09-28'::date, 13::bigint, 12642.37, 1914.47, 14556.84))
v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
select retail.decir_igv_del_mes('2025-08-01', 30);
select set_config('prueba.planilla', 'si', true);
select retail.cerrar_periodo('2025-08-01', 'ubicacion', :'tru') as r1 \\gset
select 'K1 con UNA tienda cerrada y la empresa abierta no se puede decir', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10)$q$) like 'P0001|%Trujillo está cerrado: reábrelo con motivo para decir su IGV.|periodo_cerrado';
select 'K2 tampoco repetir el monto que ya estaba', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 30)$q$) like 'P0001|%Trujillo está cerrado%';
select 'K3 tampoco insertando directo', pg_temp.intento($q$insert into retail.igv_del_mes (mes, monto, creado_por) values ('2025-08-01', 10, gen_random_uuid())$q$) like 'P0001|%Trujillo está cerrado%';
select 'K4 otro mes de la misma tienda sigue abierto', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-07-01', 10)$q$) = 'SIN_ERROR';
select 'K5 lo dicho antes del cierre se sigue leyendo', pg_temp.partes('2025-08-01', '2025-08-31') = 30;
select retail.reabrir_periodo('2025-08-01', 'ubicacion', :'tru', 'prueba del IGV de gestión');
select 'K6 reabierta la tienda, se puede decir', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10)$q$) = 'SIN_ERROR';
select retail.cerrar_periodo('2025-08-01', 'empresa') as r2 \\gset
select 'K7 con la empresa cerrada no se puede decir', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 20)$q$) like 'P0001|%está cerrado: reábrelo con motivo para decir su IGV.|periodo_cerrado';
select 'K8 una fila no se edita', pg_temp.intento($q$update retail.igv_del_mes set monto = 1$q$) like 'P0001|Lo dicho del IGV de un mes no se edita%';
select 'K9 una fila no se borra', pg_temp.intento($q$delete from retail.igv_del_mes$q$) like 'P0001|Lo dicho del IGV de un mes no se edita%';
`;

const PERMISOS_COLABORADORA = `
select retail.decir_igv_del_mes('2025-08-01', 100);
${cambiaA(MICAELA)}
select 'P1 sin el módulo no lee', pg_temp.intento($q$select * from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31')$q$) like '42501|Ver el IGV de gestión%';
select 'P2 sin el módulo no dice', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10)$q$) like '42501|El IGV del mes lo dice el líder%';
${conModulo("reportes_financieros")}
select 'P3 con «Reportes financieros» lee lo mismo que el líder', (select bool_and(monto_dicho = 100) from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31')) and pg_temp.partes('2025-08-01', '2025-08-31') = 100;
select 'P4 con «Reportes financieros» no dice', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10)$q$) like '42501|%';
${conModulo("configuracion")}
select 'P5 con Configuración tampoco dice: solo el líder', pg_temp.intento($q$select retail.decir_igv_del_mes('2025-08-01', 10)$q$) like '42501|%';
`;

const PERMISOS_TERMINAL = `
select retail.decir_igv_del_mes('2025-08-01', 100);
insert into auth.users (id, email) values ('${TERMINAL}', 'terminal-igv@cayla.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id, rol_id)
  values (:'tru', 'Caja IGV', 'ventas', '${TERMINAL}', retail.fn_rol_por_clave('integrante'));
${conModulo("reportes_financieros")}
${cambiaA(TERMINAL)}
select 'T1 la terminal con el módulo ve solo su tienda', (select count(*) = 1 and bool_and(ubicacion_id = :'tru' and igv_tramo = 90) from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31'));
select 'T2 la terminal no recibe el monto ni su parte', (select bool_and(monto_dicho is null and igv_parte is null) from retail.fn_igv_de_gestion('2025-08-01', '2025-08-31'));
`;

const ACCESO_DIRECTO = `
select 'H1 la tabla tiene RLS encendido', (select relrowsecurity from pg_class where oid = 'retail.igv_del_mes'::regclass);
select 'H2 la tabla no tiene políticas', not exists (select 1 from pg_policy where polrelid = 'retail.igv_del_mes'::regclass);
select 'H3 una sesión no toca la tabla', not has_table_privilege('authenticated', 'retail.igv_del_mes', 'select,insert,update,delete');
select 'H4 anon no llama a ninguna función', not has_function_privilege('anon', 'retail.decir_igv_del_mes(date,numeric,text)', 'execute') and not has_function_privilege('anon', 'retail.fn_igv_de_gestion(date,date)', 'execute');
select 'H5 los ayudantes internos no se llaman desde la API', not has_function_privilege('authenticated', 'retail.fn_exigir_igv_mes_abierto(date)', 'execute') and not has_function_privilege('authenticated', 'retail.fn_igv_del_mes_candado()', 'execute');
`;

// La lista de reglas de `fn_igv_de_gestion` depende de quién escribe la 4011 y la 7011. Si este conteo cambia, alguien agregó una regla:
// mírala, decide si entra a la lista y recién ahí sube el número aquí.
const ESCRIBEN_LA_4011_Y_LA_7011 = {
  fn_asientos: { igv: 13, ventas: 5 },
  fn_asientos_claure: { igv: 0, ventas: 5 },
  fn_asientos_dinero_y_caja: { igv: 1, ventas: 0 },
  fn_asientos_igv_perdido: { igv: 1, ventas: 0 },
  fn_asientos_nota_proveedor: { igv: 1, ventas: 0 },
};
const REGLAS_DE_LA_VENTA = ["venta", "anulacion", "devolucion", "cambio"];
const REGLAS_FUERA = ["anticipo", "anticipo_devuelto", "gasto", "compra", "activo", "nota_credito_prov"];

function vigilarLasReglas() {
  const r = correr(`begin;
select p.proname || '|' || (length(p.prosrc) - length(replace(p.prosrc, '''4011''', ''))) / 6 || '|' || (length(p.prosrc) - length(replace(p.prosrc, '''7011''', ''))) / 6 || '|' || (position('''7012''' in p.prosrc) > 0)::text
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname like 'fn_asientos%' order by 1;`);
  if (!r.ok) {
    esperar("R0 se puede leer quién escribe la 4011", false, r);
    return;
  }
  const hallado = {};
  let la7012 = false;
  for (const linea of r.salida.split("\n")) {
    const [fn, igv, ventas, s7012] = linea.split("|");
    if (s7012 === "true") la7012 = true;
    if (Number(igv) > 0 || Number(ventas) > 0) hallado[fn] = { igv: Number(igv), ventas: Number(ventas) };
  }
  esperar(
    "R1 ninguna regla nueva escribe la 4011 ni la 7011 (si falla: revisa la lista de fn_igv_de_gestion)",
    JSON.stringify(hallado, Object.keys(hallado).sort()) === JSON.stringify(ESCRIBEN_LA_4011_Y_LA_7011, Object.keys(ESCRIBEN_LA_4011_Y_LA_7011).sort()) &&
      Object.keys(hallado).sort().join() === Object.keys(ESCRIBEN_LA_4011_Y_LA_7011).sort().join(),
    hallado
  );
  esperar("R2 nadie escribe la 7012: sus ventas no traerían IGV a la lista", !la7012);

  const d = correr(`begin;
select pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure);`);
  const reglas = new Set(d.ok ? [...d.salida.matchAll(/'([a-z_]+)'(?:::text as regla)?,\s*(?:case when [^\n]*? else )?'4011'/g)].map((m) => m[1]) : []);
  const esperadas = [...REGLAS_DE_LA_VENTA, ...REGLAS_FUERA];
  esperar(
    "R3 las reglas de fn_asientos que escriben la 4011 son las conocidas",
    [...reglas].sort().join() === esperadas.sort().join(),
    { halladas: [...reglas].sort() }
  );
}

const ESCENA = `${BASE}${AGOSTO}`;
verificar("Ventas con IGV", correr(`${ESCENA}${VENTAS_CON_IGV}`), casosDe(VENTAS_CON_IGV));
verificar("Decir y repartir", correr(`${ESCENA}${DECIR}`), casosDe(DECIR));
verificar("El libro no cambia", correr(`${ESCENA}${LIBRO}`), casosDe(LIBRO));
verificar("Reglas del monto", correr(`${ESCENA}${REGLAS_DE_MONTO}`), casosDe(REGLAS_DE_MONTO));
verificar("Mes cerrado", correr(`${BASE}${AGOSTO}${CANDADO}`), casosDe(CANDADO));
verificar("Permisos de una colaboradora", correr(`${ESCENA}${PERMISOS_COLABORADORA}`), casosDe(PERMISOS_COLABORADORA));
verificar("Permisos de una terminal", correr(`${ESCENA}${PERMISOS_TERMINAL}`), casosDe(PERMISOS_TERMINAL));
verificar("Acceso directo", correr(`begin;\n${ACCESO_DIRECTO}`), casosDe(ACCESO_DIRECTO));
vigilarLasReglas();

console.log(`\n${casos - fallos} de ${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
