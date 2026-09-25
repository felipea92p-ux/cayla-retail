#!/usr/bin/env node
/**
 * Prueba del Resumen de Finanzas (ADR-0195 F10; `20260925200000_finanzas_resumen.sql`).
 *
 * QUÉ CUBRE
 *   · CADA NÚMERO ES EL DE SU FASE: mirando CAYLA entera, una tienda, el Taller y la empresa, cada parte de
 *     `fn_resumen_finanzas` es EXACTAMENTE lo que devuelve la función de su fase (F5 `fn_estado_resultados` del mes y del
 *     anterior, Presupuesto `fn_presupuesto_vs_real`, F3 `fn_cuentas_dinero_saldos` y `fn_dinero_sin_cuenta`, F4
 *     `fn_por_pagar_consolidado`, F6 `fn_flujo_caja_proyeccion`, F8 `fn_impuestos_panel`, F5 `fn_campanas_reporte`, F2
 *     `fn_egresos_sin_clasificar` y `fn_gastos_fijos_mes`, F9 `fn_periodos_mes`), filtrada a lo que se mira; ninguna parte
 *     falla ni queda «sin permiso» para el líder; lo que no aplica a lo que se mira lo dice.
 *   · CADA AVISO APARECE CUANDO CORRESPONDE Y NO CUANDO NO: la deuda vencida y la que vence en `aviso_vence_dias` sí, la
 *     de dentro de 25 días no (pero cuenta en el total); el egreso sin clasificar; el fijo que falta; el rubro que se pasa
 *     del tope (y el que no, no, mirando CAYLA entera); la campaña que empieza en 5 días sí y la de 20 no; el mes anterior
 *     sin cerrar, y cerrado para la empresa cuando se cierra.
 *   · EL GASTO FUERA DE LO NORMAL (`fn_gastos_fuera_de_lo_normal`, la regla nueva de F10): por proveedor (o gasto fijo) y
 *     tienda; lo del mes contra el promedio mensual de los 6 meses anteriores contando solo los meses con gasto (y al menos
 *     2); más de `aviso_gasto_pct`; un gasto anulado, uno sin proveedor ni fijo, uno con un solo mes de historia y uno
 *     dentro del margen no avisan; la primera semana del mes también mira el anterior; cambiar el umbral cambia el aviso.
 *   · PERMISOS: sin «Reportes financieros», nada (42501); con él, SU tienda y nada más (otra tienda o la empresa, 42501), y
 *     lo que es de otro módulo o solo del líder vuelve «sin permiso» o «no aplica»; con Cuentas y dinero y Gastos, sus
 *     partes aparecen solo de su tienda; `anon` no llama; las dos lecturas son STABLE y security definer.
 *
 * CÓMO. Igual que `presupuesto.mjs`: cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones),
 * sesión simulada con `request.jwt.claim.sub`. La escena A corre sobre el HOY real (las fases miran hoy) y compara contra
 * las fases con los datos que tenga la base; la B pasa en MARZO DE 2033 con `p_hoy`.
 *
 * USO
 *   pnpm pruebas:resumen-finanzas    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}') on conflict do nothing;\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
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
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-800) });
}
/** Saca los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

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
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Un gasto con su factura de proveedor (naturaleza «gasto»), a crédito: el comprobante y su gasto. Monto CON IGV.
create function pg_temp.gasto_prov(p_n text, p_ubic uuid, p_prov uuid, p_fecha date, p_monto numeric, p_vence date default null,
                                   p_estado text default 'vigente') returns void language plpgsql as $f$
declare v_sub numeric := round(p_monto / 1.18, 2);
begin
  insert into retail.compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (pg_temp.k('C' || p_n), p_prov, 'factura', 'F10', p_n, p_fecha, 'credito', coalesce(p_vence, p_fecha + 30), v_sub, p_monto - v_sub, p_monto, 'gasto', p_ubic);
  if p_estado = 'vigente' then
    insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id)
    values (pg_temp.k('G' || p_n), p_ubic, 'servicios_basicos', 'Servicio ' || p_n, p_fecha, p_monto, p_monto - v_sub, pg_temp.k('C' || p_n));
  else
    insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id, estado, motivo_anulacion, anulado_en)
    values (pg_temp.k('G' || p_n), p_ubic, 'servicios_basicos', 'Servicio ' || p_n, p_fecha, p_monto, p_monto - v_sub, pg_temp.k('C' || p_n),
            'anulado', 'registrado por error', p_fecha::timestamp at time zone 'America/Lima');
  end if;
end $f$;
`;

// ============================================================================================================================
// A. CADA NÚMERO ES EL DE SU FASE, Y CADA AVISO APARECE CUANDO CORRESPONDE (hoy real, como líder)
//   Se agregan: 3 facturas de gasto de TRU a crédito (vencida hace 2 días S/ 118; vence en 3 días S/ 236; vence en 25 días
//   S/ 354), un egreso «Otro» de S/ 12.50 en la caja de TRU, un gasto fijo de TRU del día 1 sin registrar, un gasto de
//   suministros de hoy de S/ 100 contra un tope de S/ 1 (se pasa) y un tope de transporte de S/ 99,999 (no se pasa), y dos
//   campañas de TRU con 15 % de descuento: una empieza en 5 días, la otra en 20.
// ============================================================================================================================
const ESCENA_A = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset
select retail.fn_hoy_lima() as hoy, date_trunc('month', retail.fn_hoy_lima())::date as mes,
       (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date as mes_ant,
       (date_trunc('month', retail.fn_hoy_lima()) - interval '1 day')::date as fin_ant \\gset
insert into retail.proveedores (nombre, activo) values ('Proveedor de prueba F10', true) returning id as prov \\gset

select pg_temp.gasto_prov('VENCIDA', :'tru', :'prov', :'hoy'::date - 40, 118, :'hoy'::date - 2);
select pg_temp.gasto_prov('PRONTO',  :'tru', :'prov', :'hoy'::date - 40, 236, :'hoy'::date + 3);
select pg_temp.gasto_prov('LEJOS',   :'tru', :'prov', :'hoy'::date - 40, 354, :'hoy'::date + 25);

select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as caja \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 12.50, 'Otro', 'prueba F10', false, null::uuid) as egreso \\gset

insert into retail.gastos_fijos (id, ubicacion_id, categoria, descripcion, comprobante_tipo, monto, dia_del_mes, activo)
values (pg_temp.k('FIJO'), :'tru', 'servicios_basicos', 'Luz de prueba F10', 'sin_comprobante', 321, 1, true);

insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago)
values (pg_temp.k('SUMIN'), :'tru', 'suministros', 'Bolsas F10', :'hoy', 100, 0, 'yape');
select retail.guardar_presupuesto(:'mes', :'tru', '656', 1);
select retail.guardar_presupuesto(:'mes', :'tru', '631', 99999);

insert into retail.etiquetas (id, nombre, estilo, vigente_desde, vigente_hasta, descuento_pct, sedes_permitidas, estado, activo) values
  (pg_temp.k('CAMP5'),  'Prueba F10 en 5 días',  'campana', :'hoy'::date + 5,  :'hoy'::date + 9,  15, array[:'tru']::uuid[], 'aprobado', true),
  (pg_temp.k('CAMP20'), 'Prueba F10 en 20 días', 'campana', :'hoy'::date + 20, :'hoy'::date + 24, 15, array[:'tru']::uuid[], 'aprobado', true);

create temp table r as
  select 'todas'::text as v, retail.fn_resumen_finanzas(null, false) as j
  union all select 'tru', retail.fn_resumen_finanzas(:'tru', false)
  union all select 'tal', retail.fn_resumen_finanzas(:'tal', false)
  union all select 'emp', retail.fn_resumen_finanzas(null, true);
create function pg_temp.r(p text) returns jsonb language sql as $f$ select j from r where v = p $f$;
create function pg_temp.filas(p text, parte text) returns jsonb language sql as $f$ select coalesce(j -> parte -> 'filas', 'null') from r where v = p $f$;
`;

const CASOS_A = `
-- Nada falla ni queda sin permiso para el líder.
select 'A · el líder ve todas las partes, en las cuatro vistas (nada «falla» ni «sin permiso»)',
  not exists (select 1 from r, jsonb_each(r.j) e where jsonb_typeof(e.value) = 'object' and (e.value ? 'falla' or e.value ? 'sin_permiso'));
select 'A · qué se mira: CAYLA entera, la tienda, el Taller y la empresa',
  pg_temp.r('todas') -> 'ver' @> '{"todas": true, "tipo": "todas"}'
  and pg_temp.r('tru') -> 'ver' @> jsonb_build_object('ubicacion_id', :'tru', 'tipo', 'tienda', 'nombre', 'Tienda Trujillo')
  and pg_temp.r('tal') -> 'ver' @> '{"tipo": "taller"}' and pg_temp.r('emp') -> 'ver' @> '{"solo_empresa": true, "tipo": "empresa"}';
select 'A · los umbrales son los de Configuración ▸ Caja y avisos', pg_temp.r('todas') -> 'parametros' = retail.fn_parametros_finanzas();
select 'A · el líder recibe sus tiendas y el Taller para «Ver»',
  (select count(*) from jsonb_array_elements(pg_temp.r('todas') -> 'unidades')) = (select count(*) from retail.ubicaciones where activo and tipo in ('tienda', 'taller'));
select 'A · dice cuánto tardó cada parte', (select count(*) from jsonb_object_keys(pg_temp.r('todas') -> 'ms')) = 13;

-- F5 · Estado de resultados.
select 'A · F5: lo del mes (CAYLA entera) es fn_estado_resultados del 1 a hoy',
  pg_temp.filas('todas', 'resultados_mes') = (select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre), '[]') from retail.fn_estado_resultados(:'mes', :'hoy', null) x);
select 'A · F5: el mes anterior (CAYLA entera) es fn_estado_resultados del mes completo',
  pg_temp.filas('todas', 'resultados_anterior') = (select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre), '[]') from retail.fn_estado_resultados(:'mes_ant', :'fin_ant', null) x);
select 'A · F5: una tienda, su fila',
  pg_temp.filas('tru', 'resultados_mes') = (select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre), '[]') from retail.fn_estado_resultados(:'mes', :'hoy', :'tru') x)
  and pg_temp.filas('tal', 'resultados_anterior') = (select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre), '[]') from retail.fn_estado_resultados(:'mes_ant', :'fin_ant', :'tal') x);
select 'A · F5: la empresa, solo su fila',
  pg_temp.filas('emp', 'resultados_anterior') = (select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre), '[]') from retail.fn_estado_resultados(:'mes_ant', :'fin_ant', null) x where x.unidad = 'empresa');

-- Presupuesto.
select 'A · Presupuesto (CAYLA entera): la fila de CAYLA y lo que se pasa, tal cual',
  pg_temp.filas('todas', 'presupuesto') = (select coalesce(jsonb_agg(to_jsonb(p) order by p.orden, p.nombre, p.orden_linea), '[]')
                                             from retail.fn_presupuesto_vs_real(:'mes', null, null) p where p.unidad = 'consolidado' or p.se_pasa);
select 'A · Presupuesto (una tienda): todas sus líneas',
  pg_temp.filas('tru', 'presupuesto') = (select coalesce(jsonb_agg(to_jsonb(p) order by p.orden, p.nombre, p.orden_linea), '[]') from retail.fn_presupuesto_vs_real(:'mes', :'tru', null) p);
select 'A · aviso: el rubro que se pasa del tope aparece mirando CAYLA entera; el que no, no',
  exists (select 1 from jsonb_array_elements(pg_temp.filas('todas', 'presupuesto')) f where f ->> 'ubicacion_id' = :'tru' and f ->> 'linea' = '656' and (f ->> 'se_pasa')::boolean)
  and not exists (select 1 from jsonb_array_elements(pg_temp.filas('todas', 'presupuesto')) f where f ->> 'linea' = '631' and f ->> 'ubicacion_id' = :'tru');
select 'A · mirando la tienda, los dos rubros están (con y sin tope pasado)',
  (select count(*) from jsonb_array_elements(pg_temp.filas('tru', 'presupuesto')) f where f ->> 'linea' in ('656', '631')) = 2;

-- F3 · Saldos y lo sin cuenta.
select 'A · F3: los saldos de CAYLA entera son los de fn_cuentas_dinero_saldos (sin archivadas)',
  pg_temp.filas('todas', 'cuentas') = (select coalesce(jsonb_agg(to_jsonb(c) order by c.orden, c.nombre), '[]') from retail.fn_cuentas_dinero_saldos(:'hoy', null) c where not c.archivada);
select 'A · F3: una tienda, solo su cajón y su caja fuerte',
  (select bool_and(f ->> 'ubicacion_id' = :'tru') and count(*) >= 1 from jsonb_array_elements(pg_temp.filas('tru', 'cuentas')) f);
select 'A · F3: la empresa, solo lo que no es de ninguna tienda',
  (select coalesce(bool_and(f -> 'ubicacion_id' = 'null'::jsonb), true) from jsonb_array_elements(pg_temp.filas('emp', 'cuentas')) f);
select 'A · F3: lo sin cuenta del mes es fn_dinero_sin_cuenta (CAYLA entera y empresa); una tienda, no aplica',
  pg_temp.filas('todas', 'sin_cuenta') = (select coalesce(jsonb_agg(to_jsonb(s) order by s.origen), '[]') from retail.fn_dinero_sin_cuenta(:'mes', :'hoy') s)
  and pg_temp.filas('emp', 'sin_cuenta') = pg_temp.filas('todas', 'sin_cuenta')
  and pg_temp.r('tru') -> 'sin_cuenta' = '{"no_aplica": true}';

-- F4 · Por pagar.
select 'A · F4: el total y la cantidad son los de fn_por_pagar_consolidado',
  (pg_temp.r('todas') -> 'por_pagar' ->> 'total')::numeric = (select coalesce(sum(p.saldo), 0) from retail.fn_por_pagar_consolidado(null, null, false) p)
  and (pg_temp.r('todas') -> 'por_pagar' ->> 'n')::integer = (select count(*) from retail.fn_por_pagar_consolidado(null, null, false) p);
select 'A · F4: las filas son las vencidas y las que vencen en aviso_vence_dias, tal cual',
  pg_temp.filas('todas', 'por_pagar') = (select coalesce(jsonb_agg(to_jsonb(p) order by p.vence, p.proveedor, p.documento), '[]')
                                           from retail.fn_por_pagar_consolidado(null, null, false) p
                                          where p.vence <= :'hoy'::date + (retail.fn_parametros_finanzas() ->> 'aviso_vence_dias')::integer);
select 'A · aviso: la vencida y la que vence en 3 días están; la de 25 días no (pero suma en el total)',
  exists (select 1 from jsonb_array_elements(pg_temp.filas('todas', 'por_pagar')) f where f ->> 'id' = pg_temp.k('CVENCIDA')::text)
  and exists (select 1 from jsonb_array_elements(pg_temp.filas('todas', 'por_pagar')) f where f ->> 'id' = pg_temp.k('CPRONTO')::text)
  and not exists (select 1 from jsonb_array_elements(pg_temp.filas('todas', 'por_pagar')) f where f ->> 'id' = pg_temp.k('CLEJOS')::text)
  and (pg_temp.r('todas') -> 'por_pagar' ->> 'total')::numeric >= 708;
select 'A · F4: una tienda, su parte',
  (pg_temp.r('tru') -> 'por_pagar' ->> 'total')::numeric = (select coalesce(sum(p.saldo), 0) from retail.fn_por_pagar_consolidado(:'tru', null, false) p);
select 'A · F4: la empresa, lo de la empresa',
  (pg_temp.r('emp') -> 'por_pagar' ->> 'n')::integer = (select count(*) from retail.fn_por_pagar_consolidado(null, null, true) p);

-- F6 · Flujo.
select 'A · F6: días de caja, la semana bajo el mínimo y las 6 semanas son fn_flujo_caja_proyeccion(6) (sin los cobros día a día)',
  pg_temp.r('todas') -> 'flujo' = retail.fn_flujo_caja_proyeccion(6) - 'cobros';
select 'A · F6: mirando una tienda, el Taller o la empresa, el flujo no aplica (es de CAYLA entera)',
  pg_temp.r('tru') -> 'flujo' = '{"no_aplica": true}' and pg_temp.r('tal') -> 'flujo' = '{"no_aplica": true}' and pg_temp.r('emp') -> 'flujo' = '{"no_aplica": true}';

-- F8 · IGV.
select 'A · F8: el IGV del mes y el límite son fn_impuestos_panel del mes; en una tienda no aplica',
  pg_temp.r('todas') -> 'igv' = retail.fn_impuestos_panel(:'mes') and pg_temp.r('tru') -> 'igv' = '{"no_aplica": true}';

-- F5 · Campañas.
select 'A · F5: las campañas que empiezan en 14 días son las de fn_campanas_reporte',
  pg_temp.filas('todas', 'campanas') = (select coalesce(jsonb_agg(to_jsonb(c) order by c.desde, c.nombre), '[]') from retail.fn_campanas_reporte(null) c
                                          where c.momento = 'viene' and c.desde > :'hoy'::date and c.desde <= :'hoy'::date + 14);
select 'A · aviso: la campaña de dentro de 5 días está; la de 20, no',
  exists (select 1 from jsonb_array_elements(pg_temp.filas('tru', 'campanas')) c where c ->> 'nombre' = 'Prueba F10 en 5 días')
  and not exists (select 1 from jsonb_array_elements(pg_temp.filas('tru', 'campanas')) c where c ->> 'nombre' = 'Prueba F10 en 20 días');
select 'A · las campañas no aplican al Taller ni a la empresa',
  pg_temp.r('tal') -> 'campanas' = '{"no_aplica": true}' and pg_temp.r('emp') -> 'campanas' = '{"no_aplica": true}';

-- F2 · Egresos y fijos.
select 'A · F2: los egresos sin clasificar son los de fn_egresos_sin_clasificar, con el nuestro',
  (pg_temp.r('todas') -> 'egresos' ->> 'n')::integer = (select count(*) from retail.fn_egresos_sin_clasificar(null, 1000))
  and (pg_temp.r('todas') -> 'egresos' ->> 'monto')::numeric = (select sum(e.monto) from retail.fn_egresos_sin_clasificar(null, 1000) e)
  and (pg_temp.r('tru') -> 'egresos' ->> 'n')::integer = (select count(*) from retail.fn_egresos_sin_clasificar(:'tru', 1000))
  and exists (select 1 from jsonb_array_elements(pg_temp.r('tru') -> 'egresos' -> 'por_ubicacion') u where u ->> 'ubicacion_id' = :'tru' and (u ->> 'n')::integer >= 1);
-- (Cada acción va en su propia sentencia: una lectura STABLE no ve lo que otra función cambió en la MISMA sentencia.)
select pg_temp.intento(format('select retail.marcar_egreso_no_gasto(%L, ''ajuste'', ''prueba F10'')', :'egreso')) as marca \\gset
select 'A · aviso: clasificado el egreso (no es gasto), deja de contarse',
  :'marca' = 'SIN_ERROR'
  and (select (retail.fn_resumen_finanzas(:'tru', false) -> 'egresos' ->> 'n')::integer) = (pg_temp.r('tru') -> 'egresos' ->> 'n')::integer - 1;
select 'A · F2: los fijos que faltan son los de fn_gastos_fijos_mes (estado falta)',
  pg_temp.filas('todas', 'fijos') = (select coalesce(jsonb_agg(to_jsonb(f) order by f.fecha_esperada, f.descripcion), '[]') from retail.fn_gastos_fijos_mes(:'mes', null, false) f where f.estado = 'falta');
select 'A · aviso: el fijo del día 1 que no llegó está (salvo que hoy sea 1)',
  exists (select 1 from jsonb_array_elements(pg_temp.filas('tru', 'fijos')) f where f ->> 'id' = pg_temp.k('FIJO')::text) = (extract(day from :'hoy'::date) > 1);
select 'A · F10: los gastos fuera de lo normal son los de fn_gastos_fuera_de_lo_normal',
  pg_temp.filas('todas', 'raros') = (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from retail.fn_gastos_fuera_de_lo_normal(null, false, null) x);

-- F9 · Cierre del mes anterior.
select 'A · F9: el mes anterior, cada unidad activa y la empresa, sin cerrar',
  pg_temp.r('todas') -> 'cierre' ->> 'mes' = :'mes_ant'
  and (select count(*) from jsonb_array_elements(pg_temp.r('todas') -> 'cierre' -> 'unidades')) = (select count(*) + 1 from retail.ubicaciones where activo)
  and (pg_temp.r('todas') -> 'cierre' ->> 'consolidado')::boolean = exists (select 1 from retail.fn_periodos_mes(:'mes_ant') p where p.alcance = 'consolidado' and p.estado = 'cerrado');
select pg_temp.intento(format('select retail.cerrar_periodo(%L, ''empresa'', null)', :'mes_ant')) as cierre \\gset
select 'A · aviso: al cerrar el mes anterior de la empresa, la empresa sale cerrada y CAYLA entera sigue abierta',
  :'cierre' = 'SIN_ERROR'
  and exists (select 1 from jsonb_array_elements(retail.fn_resumen_finanzas(null, false) -> 'cierre' -> 'unidades') u where u ->> 'alcance' = 'empresa' and (u ->> 'cerrada')::boolean)
  and (retail.fn_resumen_finanzas(null, false) -> 'cierre' ->> 'consolidado')::boolean = false
  and retail.fn_resumen_finanzas(null, true) -> 'cierre' -> 'unidades' = jsonb_build_array(jsonb_build_object('alcance', 'empresa', 'ubicacion_id', null, 'nombre', 'De la empresa', 'cerrada', true));
select 'A · F9: mirando una tienda, solo su mes',
  (select count(*) from jsonb_array_elements(pg_temp.r('tru') -> 'cierre' -> 'unidades')) = 1;
`;

verificar("A", correr(ESCENA_A + CASOS_A), casosDe(CASOS_A));

// ============================================================================================================================
// B. EL GASTO FUERA DE LO NORMAL (marzo de 2033; «hoy» = 10 de marzo). Umbral de la base: aviso_gasto_pct (25 por defecto).
//   P1 TRU: oct 100, dic 110, feb 90 (promedio 100 en 3 meses; noviembre y enero sin gasto NO bajan el promedio);
//      marzo 70 + 70 = 140 → +40 %: AVISA.
//   P2 TRU: dic 100, feb 100; marzo 120 → +20 %: no.
//   P3 TRU: feb 100 (un solo mes de historia); marzo 500: no.
//   P4 LIM: ene 100, feb 100; marzo 200 → +100 %: avisa (solo mirando CAYLA entera o LIM).
//   P5 TRU: ene 100, feb 100; marzo 300 ANULADO: no.
//   P6 TRU: oct 100, dic 100; marzo 120 (+20 % sobre los meses con gasto; +260 % si se contaran los 6 meses): no.
//   FIJO «Luz del depósito» TRU sin comprobante: ene 100, feb 100; marzo 200: avisa (se agrupa por el fijo).
//   Mototaxi TRU sin proveedor ni fijo: ene 50, feb 50; marzo 500: no (no tiene con qué compararse).
//   P7 empresa: ene 100, feb 100; marzo 200: avisa solo para el líder, mirando CAYLA entera o la empresa.
// ============================================================================================================================
const ESCENA_B = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.proveedores (id, nombre, activo) values
  (pg_temp.k('P1'), 'Luz F10 uno', true), (pg_temp.k('P2'), 'Agua F10 dos', true), (pg_temp.k('P3'), 'Nuevo F10 tres', true),
  (pg_temp.k('P4'), 'Lima F10 cuatro', true), (pg_temp.k('P5'), 'Anulado F10 cinco', true), (pg_temp.k('P6'), 'Bimestral F10 seis', true),
  (pg_temp.k('P7'), 'Contador F10 siete', true);
select pg_temp.gasto_prov('1a', :'tru', pg_temp.k('P1'), '2032-10-12', 100);
select pg_temp.gasto_prov('1b', :'tru', pg_temp.k('P1'), '2032-12-12', 110);
select pg_temp.gasto_prov('1c', :'tru', pg_temp.k('P1'), '2033-02-12', 90);
select pg_temp.gasto_prov('1d', :'tru', pg_temp.k('P1'), '2033-03-02', 70);
select pg_temp.gasto_prov('1e', :'tru', pg_temp.k('P1'), '2033-03-08', 70);
select pg_temp.gasto_prov('2a', :'tru', pg_temp.k('P2'), '2032-12-05', 100);
select pg_temp.gasto_prov('2b', :'tru', pg_temp.k('P2'), '2033-02-05', 100);
select pg_temp.gasto_prov('2c', :'tru', pg_temp.k('P2'), '2033-03-05', 120);
select pg_temp.gasto_prov('3a', :'tru', pg_temp.k('P3'), '2033-02-05', 100);
select pg_temp.gasto_prov('3b', :'tru', pg_temp.k('P3'), '2033-03-05', 500);
select pg_temp.gasto_prov('4a', :'lim', pg_temp.k('P4'), '2033-01-05', 100);
select pg_temp.gasto_prov('4b', :'lim', pg_temp.k('P4'), '2033-02-05', 100);
select pg_temp.gasto_prov('4c', :'lim', pg_temp.k('P4'), '2033-03-05', 200);
select pg_temp.gasto_prov('5a', :'tru', pg_temp.k('P5'), '2033-01-05', 100);
select pg_temp.gasto_prov('5b', :'tru', pg_temp.k('P5'), '2033-02-05', 100);
select pg_temp.gasto_prov('5c', :'tru', pg_temp.k('P5'), '2033-03-05', 300, null, 'anulado');
select pg_temp.gasto_prov('6a', :'tru', pg_temp.k('P6'), '2032-10-05', 100);
select pg_temp.gasto_prov('6b', :'tru', pg_temp.k('P6'), '2032-12-05', 100);
select pg_temp.gasto_prov('6c', :'tru', pg_temp.k('P6'), '2033-03-05', 120);
select pg_temp.gasto_prov('7a', null, pg_temp.k('P7'), '2033-01-05', 100);
select pg_temp.gasto_prov('7b', null, pg_temp.k('P7'), '2033-02-05', 100);
select pg_temp.gasto_prov('7c', null, pg_temp.k('P7'), '2033-03-05', 200);
insert into retail.gastos_fijos (id, ubicacion_id, categoria, descripcion, comprobante_tipo, monto, dia_del_mes, activo)
values (pg_temp.k('FX'), :'tru', 'servicios_basicos', 'Luz del depósito', 'sin_comprobante', 100, 5, true);
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, gasto_fijo_id) values
  (pg_temp.k('FXa'), :'tru', 'servicios_basicos', 'Luz del depósito ene', '2033-01-05', 100, 0, 'yape', pg_temp.k('FX')),
  (pg_temp.k('FXb'), :'tru', 'servicios_basicos', 'Luz del depósito feb', '2033-02-05', 100, 0, 'yape', pg_temp.k('FX')),
  (pg_temp.k('FXc'), :'tru', 'servicios_basicos', 'Luz del depósito mar', '2033-03-05', 200, 0, 'yape', pg_temp.k('FX')),
  (pg_temp.k('MTa'), :'tru', 'transporte', 'Mototaxi ene', '2033-01-05', 50, 0, 'yape', null),
  (pg_temp.k('MTb'), :'tru', 'transporte', 'Mototaxi feb', '2033-02-05', 50, 0, 'yape', null),
  (pg_temp.k('MTc'), :'tru', 'transporte', 'Mototaxi mar', '2033-03-05', 500, 0, 'yape', null);

create temp table x as select * from retail.fn_gastos_fuera_de_lo_normal(null, false, '2033-03-10');
create function pg_temp.hay(p_llave text) returns boolean language sql as $f$ select exists (select 1 from x where x.llave = p_llave) $f$;
`;

const CASOS_B = `
select 'B · P1: 140 en marzo (dos gastos) contra un promedio de 100 en 3 meses: avisa con sus números',
  exists (select 1 from x where llave = 'p:' || pg_temp.k('P1') and monto = 140 and gastos = 2 and promedio = 100 and meses_base = 3 and exceso_pct = 40.0
            and mes = '2033-03-01' and ubicacion_id = :'tru' and ubicacion_nombre = 'Tienda Trujillo' and proveedor = 'Luz F10 uno'
            and categoria_nombre = 'Servicios básicos' and ultimo_gasto_id = pg_temp.k('G1e') and ultima_fecha = '2033-03-08');
select 'B · P2: +20 % está dentro del margen: no avisa', not pg_temp.hay('p:' || pg_temp.k('P2'));
select 'B · P3: con un solo mes de historia no hay «lo normal»: no avisa', not pg_temp.hay('p:' || pg_temp.k('P3'));
select 'B · P4: la otra tienda avisa (+100 %)', pg_temp.hay('p:' || pg_temp.k('P4'));
select 'B · P5: un gasto anulado no avisa', not pg_temp.hay('p:' || pg_temp.k('P5'));
select 'B · P6: un mes sin gasto no baja el promedio (recibo bimestral): no avisa', not pg_temp.hay('p:' || pg_temp.k('P6'));
select 'B · un gasto fijo sin comprobante se agrupa por el fijo y avisa', exists (select 1 from x where llave = 'f:' || pg_temp.k('FX') and proveedor = 'Luz del depósito' and monto = 200);
select 'B · un gasto sin proveedor ni fijo no se compara con nada', not exists (select 1 from x where ultimo_gasto_id = pg_temp.k('MTc'));
select 'B · lo de la empresa avisa para el líder', exists (select 1 from x where llave = 'p:' || pg_temp.k('P7') and ubicacion_id is null and ubicacion_nombre = 'De la empresa');
select 'B · lo que más se pasa va primero', (select array_agg(llave) from x) = (select array_agg(llave order by monto - promedio desc, llave) from x);
select 'B · mirando TRU: P1 y el fijo; ni LIM ni la empresa',
  (select array_agg(llave order by llave) from retail.fn_gastos_fuera_de_lo_normal(:'tru', false, '2033-03-10'))
    = (select array_agg(l order by l) from unnest(array['p:' || pg_temp.k('P1'), 'f:' || pg_temp.k('FX')]) l);
select 'B · mirando la empresa: solo lo suyo',
  (select array_agg(llave) from retail.fn_gastos_fuera_de_lo_normal(null, true, '2033-03-10')) = array['p:' || pg_temp.k('P7')];
select 'B · la primera semana del mes también mira el anterior (3 de abril: el de marzo sigue a la vista)',
  exists (select 1 from retail.fn_gastos_fuera_de_lo_normal(null, false, '2033-04-03') y where y.llave = 'p:' || pg_temp.k('P1') and y.mes = '2033-03-01');
select 'B · pasada la primera semana, marzo ya no se mira (10 de abril)',
  not exists (select 1 from retail.fn_gastos_fuera_de_lo_normal(null, false, '2033-04-10') y where y.llave = 'p:' || pg_temp.k('P1'));
select pg_temp.intento('select retail.guardar_parametros_finanzas(p.minimo_caja, 50, p.aviso_vence_dias) from retail.parametros_finanzas p where p.id') as umbral \\gset
select 'B · con el umbral en 50 %, P1 (+40 %) deja de avisar y P4 (+100 %) sigue',
  :'umbral' = 'SIN_ERROR'
  and not exists (select 1 from retail.fn_gastos_fuera_de_lo_normal(null, false, '2033-03-10') y where y.llave = 'p:' || pg_temp.k('P1'))
  and exists (select 1 from retail.fn_gastos_fuera_de_lo_normal(null, false, '2033-03-10') y where y.llave = 'p:' || pg_temp.k('P4'));
`;

verificar("B", correr(ESCENA_B + CASOS_B), casosDe(CASOS_B));

// ============================================================================================================================
// C. PERMISOS. Micaela (Tienda Trujillo), sin el módulo, con «Reportes financieros» y con Cuentas y dinero y Gastos.
// ============================================================================================================================
const ESCENA_C = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
${cambiaA(MICAELA)}
create temp table sin as select pg_temp.intento('select retail.fn_resumen_finanzas(null, false)') as m;
create temp table sin_raros as select pg_temp.intento('select retail.fn_gastos_fuera_de_lo_normal(null, false, null)') as m;
${conModulo("reportes_financieros")}
create temp table rep as select retail.fn_resumen_finanzas(null, false) as j;
create temp table rep_tru as select retail.fn_resumen_finanzas(:'tru', false) as j;
create temp table otra as select pg_temp.intento(format('select retail.fn_resumen_finanzas(%L, false)', :'lim')) as m;
create temp table emp as select pg_temp.intento('select retail.fn_resumen_finanzas(null, true)') as m;
create temp table raros_lim as select pg_temp.intento(format('select retail.fn_gastos_fuera_de_lo_normal(%L, false, null)', :'lim')) as m;
create temp table raros_emp as select pg_temp.intento('select retail.fn_gastos_fuera_de_lo_normal(null, true, null)') as m;
create temp table er_tru as select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre), '[]') as j
  from retail.fn_estado_resultados(date_trunc('month', retail.fn_hoy_lima())::date, retail.fn_hoy_lima(), :'tru') x;
${conModulo("cuentas_dinero")}${conModulo("gastos")}
create temp table todo as select retail.fn_resumen_finanzas(null, false) as j;
create temp table pp_tru as select coalesce(sum(p.saldo), 0) as total from retail.fn_por_pagar_consolidado(:'tru', null, false) p;
`;

const CASOS_C = `
select 'C · sin «Reportes financieros», nada', (select m from sin) like '%Reportes financieros%';
select 'C · sin el módulo, tampoco los gastos fuera de lo normal', (select m from sin_raros) like '%Reportes financieros%';
select 'C · con el módulo, mira SU tienda aunque pida CAYLA entera', (select j -> 'ver' from rep) @> jsonb_build_object('ubicacion_id', :'tru', 'todas', false, 'tipo', 'tienda');
select 'C · pedir su tienda da lo mismo', (select j - 'ms' from rep) = (select j - 'ms' from rep_tru);
select 'C · otra tienda o la empresa: 42501', (select m from otra) like '%solo tu tienda%' and (select m from emp) like '%solo tu tienda%';
select 'C · los gastos fuera de lo normal de otra tienda o de la empresa: no',
  (select m from raros_lim) like '%esa ubicación%' and (select m from raros_emp) like '%líder%';
select 'C · sus números del mes son los de F5 para su tienda', (select j -> 'resultados_mes' -> 'filas' from rep) = (select j from er_tru);
select 'C · el presupuesto, solo su tienda',
  (select coalesce(bool_and(f ->> 'ubicacion_id' = :'tru'), true) from rep, jsonb_array_elements(rep.j -> 'presupuesto' -> 'filas') f);
select 'C · saldos y lo que se debe: «sin permiso» (son de Cuentas y dinero), con el mensaje de F3/F4',
  (select j -> 'cuentas' ? 'sin_permiso' and j -> 'por_pagar' ? 'sin_permiso' from rep);
select 'C · egresos y fijos: «sin permiso» (son de Gastos)', (select j -> 'egresos' ? 'sin_permiso' and j -> 'fijos' ? 'sin_permiso' from rep);
select 'C · flujo, IGV, lo sin cuenta y el cierre no aplican (son de CAYLA entera o del líder)',
  (select j -> 'flujo' = '{"no_aplica": true}' and j -> 'igv' = '{"no_aplica": true}' and j -> 'sin_cuenta' = '{"no_aplica": true}'
          and j -> 'cierre' = '{"no_aplica": true}' from rep);
select 'C · no recibe la lista de unidades para «Ver»', (select j -> 'unidades' = '[]' and not (j ->> 'lider')::boolean from rep);
select 'C · con Cuentas y dinero y Gastos, esas partes aparecen, solo de su tienda',
  (select coalesce(bool_and(f ->> 'ubicacion_id' = :'tru'), true) from todo, jsonb_array_elements(todo.j -> 'cuentas' -> 'filas') f)
  and (select (j -> 'por_pagar' ->> 'total')::numeric from todo) = (select total from pp_tru)
  and (select j -> 'egresos' ? 'n' and j -> 'fijos' ? 'filas' from todo)
  and (select coalesce(bool_and(u ->> 'ubicacion_id' = :'tru'), true) from todo, jsonb_array_elements(todo.j -> 'egresos' -> 'por_ubicacion') u);
select 'C · el flujo sigue sin aplicar con esos módulos', (select j -> 'flujo' = '{"no_aplica": true}' from todo);
`;

verificar("C", correr(ESCENA_C + CASOS_C), casosDe(CASOS_C));

// D. anon no llama; las dos lecturas son STABLE y security definer; una ubicación que no existe se dice.
{
  const r = correr(`begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select 'D · una ubicación que no existe se dice', pg_temp.intento('select retail.fn_resumen_finanzas(''00000000-0000-4000-8000-00000000abcd'', false)') like '%no existe%';
select 'D · las dos lecturas son STABLE y security definer',
  (select bool_and(p.provolatile = 's' and p.prosecdef) from pg_proc p where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('fn_resumen_finanzas', 'fn_gastos_fuera_de_lo_normal')) and
  (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_resumen_finanzas', 'fn_gastos_fuera_de_lo_normal')) = 2;
select 'D · anon no puede llamarlas; authenticated sí',
  not has_function_privilege('anon', 'retail.fn_resumen_finanzas(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'retail.fn_gastos_fuera_de_lo_normal(uuid, boolean, date)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_resumen_finanzas(uuid, boolean)', 'execute');
`);
  verificar("D", r, ["D · una ubicación que no existe se dice", "D · las dos lecturas son STABLE y security definer", "D · anon no puede llamarlas; authenticated sí"]);
}

// E. Cuánto tarda (no es una verificación: se mide y se dice).
{
  const r = correr(`begin;
${cambiaA(FELIPE)}
with a as materialized (select clock_timestamp() as t0, retail.fn_resumen_finanzas(null, false) as j)
select 'tiempo', round(extract(epoch from clock_timestamp() - a.t0) * 1000), (a.j -> 'ms')::text from a;
`);
  if (r.ok) console.log(`  · CAYLA entera en ${r.salida.split("|")[1]} ms · por parte: ${r.salida.split("|")[2]}`);
}

console.log(`\n${casos - fallos}/${casos} verificaciones en verde`);
if (fallos) {
  console.error(`${fallos} fallaron`);
  process.exit(1);
}
