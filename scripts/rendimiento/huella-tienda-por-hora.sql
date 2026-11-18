-- ¿Cuántas veces por hora cambia la huella del catálogo web? (cambiar-de-modulo#11, 2026-11-13) — SOLO LECTURA.
--
-- La tienda web rearma su catálogo solo si cambió `retail.tienda_catalogo_version()` (la huella). En horario de tienda, lo que más la mueve
-- son los movimientos: cada transacción que agrega uno (una venta, un cambio, un traslado, una recepción, un apartado) la cambia. Esta
-- consulta cuenta, por hora de Lima de UN día, cuántas veces habría cambiado y en cuántos tramos de 30 s distintos (la tienda pregunta la
-- huella cada 30 s: dos cambios en el mismo tramo son un solo rearmado). Si un día normal pasa de ~60 por hora, la huella no ahorra casi
-- nada en ese horario.
--
-- Se aproxima «una transacción» con su `created_at`: todas las filas que escribe una transacción llevan el mismo `now()`. Dos transacciones
-- en el mismo microsegundo contarían como una (no pasa en la práctica). No cuenta lo que no deja movimiento (un precio, una foto, una campaña):
-- son pocas veces al día. «salen_de_la_ventana» es solo informativo: las ventas que cumplen 30 días en esa hora, que la huella NO sigue
-- (ver «Más vendidos» en la migración 20261113202000).
--
-- USO: en local, `docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres < scripts/rendimiento/huella-tienda-por-hora.sql`; en
-- producción, en el SQL Editor, después de `set transaction read only;`. Mide AYER en Lima; para otro día, cambia `null::date` en la primera
-- línea de la consulta por la fecha (`date '2026-11-07'`). Las cifras de producción NO se copian a ningún archivo del repo (es público, ADR-0552).

with dia as (
  select coalesce(null::date, (now() at time zone 'America/Lima')::date - 1) as d
),
horas as (
  select h, (d + make_interval(hours => h)) at time zone 'America/Lima' as desde,
            (d + make_interval(hours => h + 1)) at time zone 'America/Lima' as hasta
    from dia cross join generate_series(0, 23) h
),
cambios as (
  -- Un cambio de la huella por transacción que escribió movimientos (cualquier sede: el catálogo de cada tienda muestra el stock de todas).
  select distinct m.created_at as en from retail.movimientos m, dia
   where m.created_at >= (dia.d::timestamp at time zone 'America/Lima')
     and m.created_at < ((dia.d + 1)::timestamp at time zone 'America/Lima')
),
salen as (
  select distinct m.created_at + interval '30 days' as en from retail.movimientos m, dia
   where m.tipo = 'salida' and m.motivo = 'venta'
     and m.created_at + interval '30 days' >= (dia.d::timestamp at time zone 'America/Lima')
     and m.created_at + interval '30 days' < ((dia.d + 1)::timestamp at time zone 'America/Lima')
)
select h.h as hora_lima,
       (select count(*) from cambios c where c.en >= h.desde and c.en < h.hasta) as cambios_de_la_huella,
       (select count(distinct floor(extract(epoch from c.en) / 30)) from cambios c where c.en >= h.desde and c.en < h.hasta) as tramos_de_30s_con_cambio,
       (select count(*) from salen s where s.en >= h.desde and s.en < h.hasta) as salen_de_la_ventana
  from horas h
 order by h.h;
