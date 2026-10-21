-- Finanzas ▸ Gastos dice el IGV que se perdió por pagar sin banco (ADR-0362, fase 6, decisión 76; lo que la actividad 8 dejó como tarea
-- aparte).
--
-- EL PROBLEMA PRIMERO. Desde la actividad 8 (20261014153000), `fn_igv_perdido` sabe qué IGV se pierde cuando una factura de S/ 2 000 o
-- más se paga en efectivo o desde un fondo (la bancarización, regla única `fn_pago_no_bancarizado`), e Impuestos lo resta en el mes del
-- PAGO. Finanzas ▸ Gastos no lo sabía: el hotel de S/ 2 360 con factura F001-4321, pagado en efectivo de la caja fuerte de Lima, decía
-- «IGV descontable S/ 360.00» y la tarjeta «IGV que puedes descontar» lo sumaba, mientras Impuestos ya lo daba por perdido. Igual una
-- factura de proveedor de Finanzas pagada en efectivo (pierde la parte del IGV de lo pagado así). Se vio en el banco de pruebas el
-- 2026-10-14.
--
-- QUÉ DECIDIÓ FELIPE (2026-10-14, decisión 76): la tarjeta resta lo perdido EN EL MES DEL PAGO, como Impuestos (decisión 72), y lo dice
-- debajo; la fila dice «IGV perdido» y el detalle dice por qué y en qué mes lo resta Impuestos.
--
-- QUÉ CREA
--   1. `fn_igv_perdido_de_gastos(desde, hasta)` (interna): lo que responde `fn_igv_perdido` para esas fechas de PAGO, unido al gasto que
--      lo perdió y con cómo se pagó (`efectivo` o `fondo`). Un comprobante de proveedor de Finanzas tiene un solo gasto vigente
--      (`gastos_compra_vigente_uq`); un gasto del viaje es su propio pago. El Taller no es un gasto: no llega. No calcula nada: si la
--      regla cambia, cambia en `fn_igv_perdido` y aquí llega sola.
--   2. `fn_gastos_igv_perdido(desde, hasta, ubicación, solo empresa)`: para la lista, cada pago sin banco de los gastos del mes (los del
--      gasto, se hayan pagado cuando se hayan pagado), con la misma visibilidad que `fn_gastos_lista`. La pantalla dice con esto «IGV
--      perdido» en la fila y en el detalle.
--   3. `fn_gastos_panel` suma la clave `igv_perdido` = {n, igv, de_otros_meses}: lo perdido por los pagos de ESAS fechas (el mes del
--      pago), de los gastos que la cuenta ve, aunque el gasto sea de otro mes (`de_otros_meses` dice cuánto). La tarjeta lo resta de `igv`
--      y lo dice debajo; `igv` no cambia: sigue siendo el IGV de las facturas de los gastos del mes.
--
-- DESCARTÉ
--   · Restarlo en el mes del gasto: un mes ya declarado bajaría solo y dejaría de calzar con Impuestos (Felipe eligió el mes del pago).
--   · Calcular el IGV perdido aquí o en la web: la regla vive en `fn_igv_perdido`; Impuestos, el Diario y Gastos le preguntan a ella.
--   · Columnas nuevas en `fn_gastos_lista`: volver a pegar la migración que la creó fallaría. Va en una función aparte.
--   · Cambiar qué significa `igv` en el panel: un reemplazo anclado de esta migración solo SUMA texto (así las migraciones anteriores se
--     pueden volver a pegar); la resta la hace la pantalla con las dos claves.
--   · Acotar a las fechas del mes los pagos que lee la lista: el pago que pierde el IGV puede ser de otro mes que el gasto (una factura de
--     septiembre pagada en efectivo en octubre). `fn_gastos_igv_perdido` lee todos los pagos sin banco y se queda con los de los gastos del
--     rango: son pocos a la escala de CAYLA (tres tiendas y un taller, principio 5). Si un día pesa, el filtro va en `fn_igv_perdido`.
--
-- SE ROMPE SI
--   · Otra pantalla vuelve a decir «IGV descontable» de un gasto sin preguntar a `fn_gastos_igv_perdido`.
--   · `fn_igv_perdido` gana un origen nuevo (hoy: compra, taller y gasto_viaje): no llega a ningún gasto hasta que se le diga aquí cómo
--     se une. `pruebas:gastos-igv-perdido` falla y dice cuál.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; al escribirla NO está pegada). Una sola parte, después de 20261014153000 (crea
-- `fn_igv_perdido`) y 20261014164000 (la ficha del viaje en el panel). Crea dos funciones y suma una clave a `fn_gastos_panel` con un
-- reemplazo anclado que solo suma texto: sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin `select … into` dentro de
-- textos entre comillas (ADR-0288). El reemplazo aborta sin cambiar nada si la función viva cambió. Idempotente. El ancla de
-- `fn_gastos_panel` aparece una vez en el banco de pruebas `cayla-oc`, donde la función tenía la huella c8b2c412… (la misma que la sesión de
-- la fase 6 midió en producción al pegar la 20261014164000); aplicada ahí el 2026-10-14, queda bd3bbc5f…. Contra producción la cuenta quien
-- la pegue, justo antes: la sesión que la escribió no pudo leer producción.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El IGV perdido, gasto por gasto ----------
-- Interna: la leen `fn_gastos_igv_perdido` y `fn_gastos_panel`, que ya miraron quién pregunta.
create or replace function retail.fn_igv_perdido_de_gastos(p_desde date, p_hasta date)
returns table (gasto_id uuid, pago_id uuid, fecha date, igv numeric, monto numeric, como text)
language sql stable set search_path = retail, public, extensions as $$
  with x as (select * from retail.fn_igv_perdido(p_desde, p_hasta))
  -- Un comprobante de proveedor de Finanzas: su gasto vigente y el pago que perdió el IGV (`x.id` es el pago).
  select g.id, x.id, x.fecha, x.igv, cp.monto, case when cu.tipo = 'fondo' then 'fondo' else 'efectivo' end
    from x
    join retail.gastos g on g.compra_id = x.comprobante_id and g.estado = 'vigente'
    join retail.compra_pagos cp on cp.id = x.id
    left join retail.cuentas_dinero cu on cu.id = cp.cuenta_dinero_id
   where x.origen = 'compra'
  union all
  -- Un gasto del viaje es su propio pago (`x.id` es el gasto).
  select g.id, x.id, x.fecha, x.igv, g.monto_total, case when cu.tipo = 'fondo' then 'fondo' else 'efectivo' end
    from x
    join retail.gastos g on g.id = x.id and g.estado = 'vigente'
    left join retail.cuentas_dinero cu on cu.id = g.cuenta_dinero_id
   where x.origen = 'gasto_viaje';
$$;
comment on function retail.fn_igv_perdido_de_gastos(date, date) is
  'ADR-0362 fase 6 (decisión 76): lo que responde fn_igv_perdido para esas fechas de pago, unido al gasto que lo perdió (comprobante de Finanzas o gasto del viaje) y con cómo se pagó (efectivo o fondo). Interna: la leen fn_gastos_igv_perdido y fn_gastos_panel.';

-- ---------- 2. Para la lista: los pagos sin banco de los gastos del mes ----------
-- Los del GASTO del mes, se hayan pagado cuando se hayan pagado (una factura de septiembre pagada en efectivo en octubre dice en
-- septiembre que su IGV se perdió, y en qué mes lo resta Impuestos). Misma visibilidad y mismo mensaje que `fn_gastos_lista`.
create or replace function retail.fn_gastos_igv_perdido(p_desde date, p_hasta date, p_ubicacion_id uuid default null,
                                                        p_solo_empresa boolean default false)
returns table (gasto_id uuid, pago_id uuid, fecha date, igv numeric, monto numeric, como text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_ve_finanzas_de_todo();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select x.gasto_id, x.pago_id, x.fecha, x.igv, x.monto, x.como
    from retail.fn_igv_perdido_de_gastos('-infinity'::date, 'infinity'::date) x
    join retail.gastos g on g.id = x.gasto_id
   where g.fecha between p_desde and p_hasta
     and ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
     and (not p_solo_empresa or g.ubicacion_id is null)
   order by x.gasto_id, x.fecha, x.pago_id;
end $$;
comment on function retail.fn_gastos_igv_perdido(date, date, uuid, boolean) is
  'ADR-0362 fase 6 (decisión 76): para Finanzas ▸ Gastos, cada pago en efectivo o desde un fondo de una factura de S/ 2 000 o más (fn_igv_perdido) de los gastos del rango, con la visibilidad de fn_gastos_lista. La pantalla dice «IGV perdido» en la fila y en el detalle.';

-- ---------- 3. La tarjeta: lo perdido en el mes del pago ----------
select pg_temp.reemplazar('retail.fn_gastos_panel(date, date, uuid, boolean)',
$v$'igv', (select coalesce(sum(igv), 0) from comp),$v$,
$n$'igv', (select coalesce(sum(igv), 0) from comp),
      -- ADR-0362 fase 6 (decisión 76): el IGV perdido por pagar sin banco EN EL MES DEL PAGO, como Impuestos, de los gastos que la
      -- cuenta ve aunque el gasto sea de otro mes (`de_otros_meses`). La tarjeta lo resta de `igv` y lo dice debajo.
      'igv_perdido', (
        select jsonb_build_object('n', count(*), 'igv', coalesce(sum(x.igv), 0),
                                  'de_otros_meses', coalesce(sum(x.igv) filter (where g.fecha not between p_desde and p_hasta), 0))
          from retail.fn_igv_perdido_de_gastos(p_desde, p_hasta) x
          join retail.gastos g on g.id = x.gasto_id
         where ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
           and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
           and (not p_solo_empresa or g.ubicacion_id is null)),$n$,
1);

-- ---------- 4. Permisos ----------
revoke all on function retail.fn_igv_perdido_de_gastos(date, date) from public, anon, authenticated;
revoke all on function retail.fn_gastos_igv_perdido(date, date, uuid, boolean) from public, anon;
grant execute on function retail.fn_gastos_igv_perdido(date, date, uuid, boolean) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
