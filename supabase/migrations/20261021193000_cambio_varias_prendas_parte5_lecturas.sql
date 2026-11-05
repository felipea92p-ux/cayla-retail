-- ============================================================================================================
-- 20261021193000_cambio_varias_prendas_parte5_lecturas.sql — CAYLA V2 · Cambios · una prenda por VARIAS (PARTE 5, ADR-0470)
--
-- EL PROBLEMA PRIMERO. Seis funciones de la base leen `cambios.variante_nueva_id` y `cambios.cantidad` como si fueran TODO lo que se llevó la
-- clienta en un cambio. Con un cambio por varias prendas (partes 1 y 2) eso es solo la PRIMERA prenda, y cada una se equivoca a su manera:
--   · `fn_resumen_comparacion` (Resumen): valúa cada salida de un cambio con «lo que pagó por la devuelta + la diferencia TOTAL». Con dos
--     salidas cuenta la diferencia dos veces: el importe vendido sale inflado.
--   · `fn_asientos` (el Diario): ajusta el costo del cambio contra la primera prenda sola. Con dos prendas, el costo de lo vendido y la
--     mercadería (691 y 201) quedan mal por el costo de las demás.
--   · `fn_analisis_sede`, `fn_demanda_sede` y `fn_piso_plan_lectura` (Análisis, la demanda y el plan del piso): cuentan como «vendida» solo la
--     primera prenda del cambio; las otras no existen para el motor y el plan subestima lo que se mueve.
--   · `fn_actividad_cambio` (el registro de actividad): dice «cambió el body por Top Rib» aunque se llevó dos.
-- La diferencia total, el stock y las cuentas (Izipay, Interbank, el cajón) ya salen bien desde la parte 2: esto es lo que se lee DESPUÉS.
--
-- ANALOGÍA CAYLA. Las ventas, las cuentas y el stock ya cuadran; esto es la contadora y la analista de demanda mirando el ticket nuevo con
-- los renglones nuevos, en vez de leer solo el primero.
--
-- QUÉ HACE (cada una, un reemplazo anclado: si el texto de la función cambió, se detiene sin tocar nada):
--   1. `fn_resumen_comparacion`: la salida de un cambio por varias vale lo de SU renglón de `cambio_salidas` (precio × cantidad); un cambio de
--      una por una (sin renglones) sigue valiendo lo de siempre.
--   2. `fn_asientos`: el ajuste de costo de un cambio por varias es el costo de TODAS las prendas que se llevó menos el de lo que devolvió; si a
--      alguna le falta costo, no se ajusta nada (la misma regla de «solo si todas tienen costo»).
--   3. `fn_analisis_sede`, `fn_demanda_sede`, `fn_piso_plan_lectura`: lo que se llevó por cambio son los renglones de `cambio_salidas`; sin
--      renglones, la prenda nueva de siempre (un `left join` con `coalesce`, así el resto de la consulta no cambia).
--   4. `fn_actividad_cambio`: la actividad nombra todas las prendas («Top Rib · Negro · S + Top Rib · Blanco · M»).
--
-- DECIDÍ: NO tocar `fn_movimientos` (la pantalla de Movimientos muestra la diferencia del cambio al lado de cada movimiento: seguirá diciendo la
-- diferencia total en cada uno; es lo que dice el cambio) ni `tallasQueNoCalzan` (mide pares «vendida / entregada» de un cambio de talla: en
-- un cambio por varias solo cuenta la primera, y un cambio por varias no es una señal de que una talla no calza).
-- DESCARTÉ: guardar en `cambios` un campo «valor de lo que se llevó»: otro dato derivado que podría contradecir a `cambio_salidas`.
--
-- SE ROMPE SI: otra migración reescribe alguna de estas funciones copiándola de una versión anterior (perdería el reemplazo); las suites de
-- Postgres de cada una corren en el CI y esta migración se puede pegar dos veces.
--
-- PRODUCCIÓN. Una parte, idempotente: `create or replace` de seis funciones; no toma tablas en exclusiva ni toca políticas. Requiere las partes
-- 1 y 2. Sin `select … into` dentro de un texto entre comillas simples: el cuerpo de cada reemplazo va entre $v$ … $v$ / $n$ … $n$.
-- ============================================================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.cambio_salidas') is null then
    raise exception 'Falta retail.cambio_salidas: pega antes 20261021185000_cambio_varias_prendas_parte1_tabla.sql.';
  end if;
end $$;

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

-- ----------------------------------------------------------------------------
-- 1. Resumen: lo vendido por un cambio vale lo de cada renglón, no la diferencia total repetida
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_resumen_comparacion(uuid, date, date, date, date)',
$v$left join cambios ca on ca.id = m.cambio_id$v$,
$n$left join cambios ca on ca.id = m.cambio_id
  left join cambio_salidas cs on cs.cambio_id = m.cambio_id and cs.variante_id = m.variante_id and m.tipo = 'salida'$n$,
1);
select pg_temp.reemplazar('retail.fn_resumen_comparacion(uuid, date, date, date, date)',
$v$when m.tipo = 'salida' and m.cambio_id is not null then m.cantidad * (vi_cam.precio_unitario - vi_cam.descuento_unitario) + coalesce(ca.diferencia, 0)$v$,
$n$when m.tipo = 'salida' and m.cambio_id is not null then coalesce(cs.precio_unitario * m.cantidad, m.cantidad * (vi_cam.precio_unitario - vi_cam.descuento_unitario) + coalesce(ca.diferencia, 0))$n$,
1);

-- ----------------------------------------------------------------------------
-- 2. Diario: el ajuste de costo de un cambio por varias es contra TODAS las prendas que se llevó
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$case when vi.costo_unitario > 0 and retail.fn_costo_variante_al(c.variante_nueva_id, c.created_at) > 0$v$,
$n$case when vi.costo_unitario > 0 and exists (select 1 from retail.cambio_salidas s where s.cambio_id = c.id)
                -- Un cambio por VARIAS prendas (ADR-0470): el costo de todo lo que se llevó menos el de lo que devolvió; si a alguna le falta costo, nada.
                then case when exists (select 1 from retail.cambio_salidas s where s.cambio_id = c.id
                                          and coalesce(retail.fn_costo_variante_al(s.variante_id, c.created_at), 0) <= 0)
                          then 0
                          else (select sum(retail.fn_costo_variante_al(s.variante_id, c.created_at) * s.cantidad)
                                  from retail.cambio_salidas s where s.cambio_id = c.id) - vi.costo_unitario * c.cantidad end
                when vi.costo_unitario > 0 and retail.fn_costo_variante_al(c.variante_nueva_id, c.created_at) > 0$n$,
1);

-- ----------------------------------------------------------------------------
-- 3. Análisis, demanda y plan del piso: lo que se llevó por cambio son todos sus renglones
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_analisis_sede(uuid)',
$v$select l.venta_item_id, c.variante_nueva_id, c.cantidad, l.cobrada_en, l.dia, l.con_rebaja$v$,
$n$select l.venta_item_id, coalesce(cs.variante_id, c.variante_nueva_id), coalesce(cs.cantidad, c.cantidad), l.cobrada_en, l.dia, l.con_rebaja$n$,
1);
select pg_temp.reemplazar('retail.fn_analisis_sede(uuid)',
$v$join retail.cambios c on c.venta_item_id = l.venta_item_id$v$,
$n$join retail.cambios c on c.venta_item_id = l.venta_item_id
        left join retail.cambio_salidas cs on cs.cambio_id = c.id$n$,
1);

select pg_temp.reemplazar('retail.fn_piso_plan_lectura(uuid)',
$v$select l.venta_item_id, c.variante_nueva_id, c.cantidad, l.dia$v$,
$n$select l.venta_item_id, coalesce(cs.variante_id, c.variante_nueva_id), coalesce(cs.cantidad, c.cantidad), l.dia$n$,
1);
select pg_temp.reemplazar('retail.fn_piso_plan_lectura(uuid)',
$v$join retail.cambios c on c.venta_item_id = l.venta_item_id$v$,
$n$join retail.cambios c on c.venta_item_id = l.venta_item_id
        left join retail.cambio_salidas cs on cs.cambio_id = c.id$n$,
1);

select pg_temp.reemplazar('retail.fn_demanda_sede(uuid, integer)',
$v$select c.variante_nueva_id, c.cantidad, l.dia$v$,
$n$select coalesce(cs.variante_id, c.variante_nueva_id), coalesce(cs.cantidad, c.cantidad), l.dia$n$,
1);
select pg_temp.reemplazar('retail.fn_demanda_sede(uuid, integer)',
$v$join retail.cambios c on c.venta_item_id = l.venta_item_id$v$,
$n$join retail.cambios c on c.venta_item_id = l.venta_item_id
            left join retail.cambio_salidas cs on cs.cambio_id = c.id$n$,
1);

-- ----------------------------------------------------------------------------
-- 4. Actividad: «cambió el body por Top Rib + Top Rib»
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_actividad_cambio(uuid, text)',
$v$v_despues := retail.fn_actividad_prenda(k.variante_nueva_id);$v$,
$n$v_despues := coalesce(
    (select string_agg(retail.fn_actividad_prenda(s.variante_id) || case when s.cantidad > 1 then ' (×' || s.cantidad || ')' else '' end,
                       ' + ' order by s.precio_unitario desc, s.variante_id)
       from retail.cambio_salidas s where s.cambio_id = k.id),
    retail.fn_actividad_prenda(k.variante_nueva_id));$n$,
1);

select 'Cambio por varias · parte 5 (lecturas)' as parte,
       case when pg_get_functiondef('retail.fn_resumen_comparacion(uuid, date, date, date, date)'::regprocedure) like '%left join cambio_salidas cs%'
             and pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure) like '%retail.cambio_salidas s where s.cambio_id = c.id%'
             and pg_get_functiondef('retail.fn_analisis_sede(uuid)'::regprocedure) like '%left join retail.cambio_salidas cs%'
             and pg_get_functiondef('retail.fn_piso_plan_lectura(uuid)'::regprocedure) like '%left join retail.cambio_salidas cs%'
             and pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure) like '%left join retail.cambio_salidas cs%'
             and pg_get_functiondef('retail.fn_actividad_cambio(uuid, text)'::regprocedure) like '%retail.cambio_salidas s where s.cambio_id = k.id%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
