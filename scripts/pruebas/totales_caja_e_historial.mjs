#!/usr/bin/env node
/**
 * Prueba de ADR-0191 — totales de Caja y del Historial de ventas calculados en la base
 * (`20260924140000_totales_de_caja_e_historial_en_la_base.sql`).
 *
 * QUÉ CUBRE
 *   · `fn_totales_historial_ventas` da EXACTAMENTE lo mismo que sumar fila por fila lo que la RLS deja ver (como hace
 *     PostgREST para la web), con cada filtro de la pantalla y como líder y como colaboradora de Trujillo; y pasa de
 *     1.000 ventas sin cortarse;
 *   · `fn_resumen_caja` da los mismos montos que las lecturas fila por fila de antes y el mismo esperado que
 *     `fn_calcular_esperado_caja`; sin permiso de cerrar, el esperado sale `null`; la caja de otra sede se rechaza;
 *   · `fn_sello_caja` cambia al anular una venta (antes el conteo no se enteraba);
 *   · `anon` no ejecuta ninguna de las tres.
 *
 * CÓMO. Una semilla de 3.000 ventas sintéticas (60 días, Lima y Trujillo, anuladas, de prueba, pagos partidos,
 * boletas y notas de venta, ~250 ventas en la caja abierta de Trujillo), cada escenario en su transacción con
 * ROLLBACK (nunca se commitea nada en el Postgres local compartido). La referencia corre con `set local role
 * authenticated` —la RLS de verdad, como la web— y la función, como la llamaría PostgREST.
 *
 * USO
 *   pnpm pruebas:totales-caja-historial    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
export const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
export const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

export function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );
}

export const comoCuenta = (id) => `set local role authenticated;\nset local request.jwt.claim.sub = '${id}';\n`;

/** 3.000 ventas sintéticas. Deja `:tru`, `:lima` y `:caja` (la caja abierta de Trujillo, o una nueva). */
export const SEMILLA = `
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as p_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as p_micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select coalesce(
  (select id from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta'),
  (select retail_caja from (select gen_random_uuid() as retail_caja) x)
) as caja \\gset
insert into retail.cajas (id, ubicacion_id, monto_apertura, abierta_por, estado)
  select :'caja', :'tru', 100, :'p_felipe', 'abierta'
  where not exists (select 1 from retail.cajas where id = :'caja');
select array_agg(id order by id)::text as vars from retail.variantes \\gset

create temp table semilla on commit drop as
select gen_random_uuid() as id, g,
       case when g % 3 = 0 then :'lima'::uuid else :'tru'::uuid end as ubic,
       date_trunc('second', now() - make_interval(days => (g % 60), hours => (g * 7) % 24, mins => (g * 13) % 60)) as creado,
       (g % 17 = 0) as anulada, (g % 23 = 0) as prueba,
       case when g % 5 = 0 then null when g % 2 = 0 then :'p_felipe'::uuid else :'p_micaela'::uuid end as asesora,
       case when g % 7 = 0 then :'p_micaela'::uuid else :'p_felipe'::uuid end as usuario
from generate_series(1, 3000) g;

insert into retail.ventas (id, ubicacion_id, usuario_id, asesora_id, created_at, estado, es_prueba, caja_id)
select id, ubic, usuario, asesora, creado, 'completada', prueba,
       case when ubic = :'tru' and g % 4 = 1 then :'caja'::uuid end
from semilla;

insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento)
select s.id, (:'vars'::uuid[])[1 + (s.g * k) % array_length(:'vars'::uuid[], 1)], 1 + (s.g + k) % 2,
       round((19.9 + (s.g * 37 + k * 11) % 180 + ((s.g % 10) / 10.0))::numeric, 2),
       case when s.g % 7 = 0 then 5.55 else 0 end, 10, case when s.g % 7 = 0 then 'liquidacion_temporada' end
from semilla s cross join generate_series(1, 1 + s.g % 3) k;

insert into retail.venta_pagos (venta_id, metodo, monto)
select s.id, m.metodo, m.monto
from semilla s
join (select venta_id, sum(subtotal) as total from retail.venta_items group by venta_id) t on t.venta_id = s.id
cross join lateral (
  select * from (values
    ((array['efectivo','tarjeta','yape','plin','transferencia'])[1 + s.g % 5], case when s.g % 4 = 0 then round(t.total * 0.4, 2) else t.total end),
    ('yape', case when s.g % 4 = 0 then t.total - round(t.total * 0.4, 2) end)
  ) v(metodo, monto) where monto > 0
) m;

insert into retail.comprobantes (venta_id, ubicacion_id, tipo, serie, numero, total, estado, created_at)
select id, ubic, case when g % 13 = 0 then 'nota_venta' else 'boleta' end,
       case when g % 13 = 0 then 'NV99' else 'BP99' end, 900000 + g, 10,
       case when g % 13 = 0 then 'interna' else 'pendiente' end, creado
from semilla where g % 3 <> 1;

update retail.ventas v set estado = 'anulada', anulado_en = s.creado + interval '1 hour', motivo_anulacion = 'prueba'
from semilla s where s.id = v.id and s.anulada;

insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, usuario_id)
values (:'caja', 'ingreso', 30, 'Otro', :'p_felipe'), (:'caja', 'egreso', 12.5, 'Otro', :'p_felipe');
`;

/** Referencia fila por fila, bajo la RLS: la misma cuenta que hacía la web con lo que PostgREST le devolvía. */
function referenciaHistorial({ desde, hasta, sede, vendedor, estado = "todas", pago, comp = "todos", prueba = false }) {
  const lit = (v) => (v == null ? "null" : `'${v}'`);
  return `
with filtradas as (
  select v.id, v.estado = 'anulada' as anulada, to_char(v.created_at at time zone 'America/Lima', 'YYYY-MM-DD') as dia,
         (select round(sum(i.subtotal), 2) from retail.venta_items i where i.venta_id = v.id) as total,
         (select sum(i.cantidad) from retail.venta_items i where i.venta_id = v.id) as unidades
  from retail.ventas v
  where (${lit(desde)}::timestamptz is null or v.created_at >= ${lit(desde)}::timestamptz)
    and (${lit(hasta)}::timestamptz is null or v.created_at < ${lit(hasta)}::timestamptz)
    and (${lit(sede)}::uuid is null or v.ubicacion_id = ${lit(sede)}::uuid)
    and (${lit(vendedor)}::uuid is null or v.asesora_id = ${lit(vendedor)}::uuid or (v.asesora_id is null and v.usuario_id = ${lit(vendedor)}::uuid))
    and ('${estado}' = 'todas' or v.estado = '${estado}')
    and (${prueba} or not v.es_prueba)
    and (${lit(pago)}::text is null or v.id in (select venta_id from retail.venta_pagos where metodo = ${lit(pago)}))
    and ('${comp}' = 'todos' or (v.id in (select venta_id from retail.comprobantes where tipo in ('boleta','factura','nota_venta') and venta_id is not null)) = ('${comp}' = 'con'))
)
select jsonb_build_object(
  'ventas', (select count(*) from filtradas where not anulada),
  'anuladas', (select count(*) from filtradas where anulada),
  'unidades', (select coalesce(sum(unidades), 0) from filtradas where not anulada),
  'total', (select coalesce(sum(total), 0) from filtradas where not anulada),
  'por_dia', (select coalesce(jsonb_agg(d order by d->>'fecha'), '[]') from (select jsonb_build_object('fecha', dia, 'ventas', count(*), 'total', sum(total)) d from filtradas where not anulada group by dia) x),
  'por_metodo', (select coalesce(jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto) order by monto desc, metodo), '[]') from (select vp.metodo, sum(vp.monto) monto from retail.venta_pagos vp join filtradas f on f.id = vp.venta_id where not f.anulada group by vp.metodo) m)
) = retail.fn_totales_historial_ventas(${lit(desde)}, ${lit(hasta)}, ${lit(sede)}, ${lit(vendedor)}, '${estado}', ${lit(pago)}, '${comp}', ${prueba}),
(select (retail.fn_totales_historial_ventas(${lit(desde)}, ${lit(hasta)}, ${lit(sede)}, ${lit(vendedor)}, '${estado}', ${lit(pago)}, '${comp}', ${prueba})->>'ventas')::int
       + (retail.fn_totales_historial_ventas(${lit(desde)}, ${lit(hasta)}, ${lit(sede)}, ${lit(vendedor)}, '${estado}', ${lit(pago)}, '${comp}', ${prueba})->>'anuladas')::int);
`;
}

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 800)}`);
  }
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function main() {
  // 1. Historial: la función = la suma fila por fila bajo la RLS, con cada filtro y con dos cuentas.
  const hace = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
  const casos = [
    ["todo", {}],
    ["últimos 30 días", { desde: hace(30) }],
    ["un rango cerrado", { desde: hace(45), hasta: hace(10) }],
    ["solo anuladas", { estado: "anulada" }],
    ["solo completadas con prueba incluida", { estado: "completada", prueba: true }],
    ["pagadas con Yape", { pago: "yape" }],
    ["con comprobante", { comp: "con" }],
    ["sin comprobante", { comp: "sin" }],
    ["vendedora Micaela (asesora o, sin asesora, quien cobró)", { vendedor: "MICAELA_PERSONA" }],
  ];
  for (const [cuenta, id] of [["líder", FELIPE], ["colaboradora TRU", MICAELA]]) {
    const consultas = casos.map(([, f]) => referenciaHistorial(f)).join("\n");
    const r = correr(`${SEMILLA}
select id as micaela_persona from public.personas where auth_user_id = '${MICAELA}' \\gset
${comoCuenta(id)}
${consultas.replaceAll("'MICAELA_PERSONA'", ":'micaela_persona'")}`);
    const lineas = r.ok ? r.salida.split("\n") : [];
    casos.forEach(([nombre], i) => {
      const [igual, n] = (lineas[i] ?? "").split("|");
      esperar(`historial (${cuenta}) · ${nombre}: igual a la suma fila por fila (${n ?? "?"} ventas)`, r.ok && igual === "t", r.ok ? lineas[i] : r);
    });
  }

  // 2. Sin tope de 1.000 y la colaboradora solo ve su tienda.
  {
    const r = correr(`${SEMILLA}
${comoCuenta(FELIPE)}
select (x->>'ventas')::int + (x->>'anuladas')::int from (select retail.fn_totales_historial_ventas(p_incluir_prueba => true) x) y;
${comoCuenta(MICAELA)}
select (x->>'ventas')::int + (x->>'anuladas')::int from (select retail.fn_totales_historial_ventas(p_incluir_prueba => true, p_sede_id => :'lima') x) y;`);
    const [lider, lima] = r.ok ? r.salida.split("\n").map(Number) : [];
    esperar("el líder suma las 3.000 ventas sembradas (y las de antes), sin cortarse en 1.000", r.ok && lider >= 3000, r.ok ? lider : r);
    esperar("la colaboradora de Trujillo que pide Lima no ve ninguna venta", r.ok && lima === 0, r.ok ? lima : r);
  }

  // 3. Caja: mismos montos que antes, el esperado de fn_calcular_esperado_caja, y el candado del esperado.
  {
    const antes = `
with v as (select id, created_at from retail.ventas where caja_id = :'caja' and estado <> 'anulada'),
p as (select vp.metodo, vp.monto, extract(hour from v.created_at at time zone 'America/Lima')::int hora from retail.venta_pagos vp join v on v.id = vp.venta_id)
select jsonb_build_object(
  'ventas_efectivo', (select coalesce(sum(monto), 0) from p where metodo = 'efectivo'),
  'ventas_otros', (select coalesce(sum(monto), 0) from p where metodo <> 'efectivo'),
  'ingresos', (select coalesce(sum(monto), 0) from retail.caja_movimientos where caja_id = :'caja' and tipo = 'ingreso'),
  'egresos', (select coalesce(sum(monto), 0) from retail.caja_movimientos where caja_id = :'caja' and tipo = 'egreso'),
  'reembolsos_efectivo', (select coalesce(sum(reembolso_monto), 0) from retail.devoluciones where caja_id = :'caja' and estado = 'aprobada' and reembolso_metodo = 'efectivo'),
  'cambios_efectivo', (select coalesce(sum(diferencia), 0) from retail.cambios where caja_id = :'caja' and metodo_pago_diferencia = 'efectivo'),
  'por_metodo', (select coalesce(jsonb_object_agg(metodo, s), '{}') from (select metodo, sum(monto) s from p group by metodo) m),
  'por_hora', (select coalesce(jsonb_agg(jsonb_build_object('hora', hora, 'efectivo', e, 'otros', o) order by hora), '[]') from (select hora, coalesce(sum(monto) filter (where metodo = 'efectivo'), 0) e, coalesce(sum(monto) filter (where metodo <> 'efectivo'), 0) o from p group by hora) h)
)`;
    const r = correr(`${SEMILLA}
${comoCuenta(FELIPE)}
select (${antes}) = retail.fn_resumen_caja(:'caja') - 'esperado';
select (retail.fn_resumen_caja(:'caja')->>'esperado')::numeric = (select esperado from retail.fn_esperado_caja(:'caja'));
select (select count(*) from retail.ventas where caja_id = :'caja');`);
    const [iguales, esperado, n] = r.ok ? r.salida.split("\n") : [];
    esperar(`caja: fn_resumen_caja = lecturas fila por fila de antes (${n ?? "?"} ventas en la caja)`, r.ok && iguales === "t", r);
    esperar("caja: el esperado es el de fn_esperado_caja", r.ok && esperado === "t", r);
  }
  {
    const r = correr(`${SEMILLA}
${comoCuenta(MICAELA)}
select coalesce(retail.fn_puede_gestionar_caja(), false) = ((retail.fn_resumen_caja(:'caja')->'esperado') <> 'null'::jsonb);
select (retail.fn_resumen_caja(:'caja')->>'ventas_efectivo')::numeric > 0;`);
    const [candado, ve] = r.ok ? r.salida.split("\n") : [];
    esperar("caja: el esperado sale solo con permiso de cerrar (fn_puede_gestionar_caja)", r.ok && candado === "t", r);
    esperar("caja: la colaboradora de la sede ve los montos del tablero", r.ok && ve === "t", r);
  }
  {
    const r = correr(`${SEMILLA}
select coalesce((select id from retail.cajas where ubicacion_id = :'lima' and estado = 'abierta' limit 1), gen_random_uuid()) as caja_lima \\gset
insert into retail.cajas (id, ubicacion_id, monto_apertura, abierta_por, estado)
  select :'caja_lima', :'lima', 50, :'p_felipe', 'abierta' where not exists (select 1 from retail.cajas where id = :'caja_lima');
${comoCuenta(MICAELA)}
select retail.fn_resumen_caja(:'caja_lima');`);
    esperar("caja: la colaboradora de Trujillo no lee la caja de Lima", !r.ok && r.mensaje.includes("No tienes permiso sobre esa caja"), r.ok ? r.salida : null);
  }

  // 4. El sello cambia al anular una venta (el conteo de antes no cambiaba).
  {
    const r = correr(`${SEMILLA}
${comoCuenta(FELIPE)}
select retail.fn_sello_caja(:'caja') as antes \\gset
reset role;
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba sello'
  where id = (select id from retail.ventas where caja_id = :'caja' and estado = 'completada' limit 1);
${comoCuenta(FELIPE)}
select :'antes' <> retail.fn_sello_caja(:'caja'), split_part(:'antes', ':', 1) = split_part(retail.fn_sello_caja(:'caja'), ':', 1);`);
    const [cambio, mismoConteo] = r.ok ? r.salida.split("|") : [];
    esperar("sello: al anular una venta el sello cambia aunque el número de ventas sea el mismo", r.ok && cambio === "t" && mismoConteo === "t", r);
  }

  // 5. anon no ejecuta ninguna.
  {
    const r = correr(`begin;
select has_function_privilege('anon', 'retail.fn_totales_historial_ventas(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean, uuid[])', 'execute'),
       has_function_privilege('anon', 'retail.fn_resumen_caja(uuid)', 'execute'),
       has_function_privilege('anon', 'retail.fn_sello_caja(uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_resumen_caja(uuid)', 'execute');`);
    esperar("anon no ejecuta ninguna; authenticated sí", r.ok && r.salida === "f|f|f|t", r);
  }

  console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} fallo(s).`);
  process.exit(fallos === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
