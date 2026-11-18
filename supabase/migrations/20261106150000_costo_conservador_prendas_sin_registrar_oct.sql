-- ============================================================================
-- 20261106150000_costo_conservador_prendas_sin_registrar_oct.sql — CAYLA V2
--
-- EL PROBLEMA PRIMERO. En octubre se vendieron 1 138 prendas «sin registrar» (sin variante del catálogo): su costo no es real, es un estimado
-- que se selló al vender (promedio de la categoría). Felipe pidió (2026-11-06) un costo CONSERVADOR para el cierre de octubre: el estimado de hoy
-- ya es por categoría y casi igual al promedio real, pero en 434 líneas queda POR DEBAJO del promedio real de su categoría en octubre
-- (la medición: S/ 29 755 estimados contra S/ 31 061 con el mayor de los dos). Un promedio plano (S/ 27,37 para todas) daba el mismo total pero ponía
-- S/ 27,37 a una bolsa de S/ 1,23: se descartó.
--
-- CONTRATO
--   PROMETE: (1) deja en `venta_items_costo_respaldo` el costo anterior y el nuevo de cada línea que cambia (nunca se pierde el valor viejo);
--            (2) sube `venta_items.costo_unitario` de las líneas de octubre con `costo_estimado` a `round(greatest(su costo, promedio real de su
--            categoría en octubre), 2)`: SOLO SUBE, nunca baja; (3) es idempotente: una segunda corrida no cambia nada.
--   ASUME:   que octubre sigue ABIERTO (`fn_candado_venta_items` rechaza el cambio de costo de una venta de un mes cerrado) y que cada prenda
--            sin registrar tiene su categoría en `prendas_por_regularizar`.
--   NO HACE: no toca precios, cantidades, stock ni el IGV; no cambia las líneas con costo real; no regulariza ninguna prenda (cuando se
--            regularice, el costo real la reemplaza: `trg_venta_item_costo_real`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN. Crea una tabla nueva (RLS encendido, sin políticas: solo se lee con funciones security
-- definer o desde el panel) y hace un `update`; no toma tablas en uso con `alter` ni crea políticas. Sin `select … into`.
-- Verificado el 2026-11-06 en producción dentro de una transacción deshecha: 434 líneas, +S/ 1 305,78.
-- SE ROMPE SI: octubre se cierra antes de pegarla (el candado rechaza el `update` y no se aplica nada).
-- DOWN: update retail.venta_items i set costo_unitario = r.costo_anterior from retail.venta_items_costo_respaldo r
--         where r.venta_item_id = i.id and i.costo_unitario = r.costo_nuevo;  -- y después, si se quiere, drop table retail.venta_items_costo_respaldo;
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.venta_items_costo_respaldo (
  venta_item_id uuid primary key references retail.venta_items(id),
  costo_anterior numeric not null,
  costo_nuevo numeric not null,
  motivo text not null,
  cambiado_en timestamptz not null default now()
);
alter table retail.venta_items_costo_respaldo enable row level security;
comment on table retail.venta_items_costo_respaldo is
  'Respaldo de cada costo de venta_items que se cambió a mano en bloque: el valor anterior, el nuevo y por qué. Solo se agregan filas.';

with ventas_oct as (
  select i.id, i.cantidad, i.costo_unitario c, coalesce(i.costo_estimado, false) est, i.variante_id
    from retail.venta_items i join retail.ventas v on v.id = i.venta_id
   where v.estado is distinct from 'anulada' and v.estado is distinct from 'anulado' and coalesce(v.es_prueba, false) = false
     and (v.created_at at time zone 'America/Lima')::date between date '2026-10-01' and date '2026-10-31'
),
real_cat as (
  select p.categoria_id, sum(o.cantidad * o.c) / sum(o.cantidad) prom_real
    from ventas_oct o join retail.variantes va on va.id = o.variante_id join retail.productos p on p.id = va.producto_id
   where not o.est and o.c > 0
   group by 1
),
nuevo as (
  select o.id, o.c anterior, round(greatest(o.c, r.prom_real), 2) nuevo
    from ventas_oct o
    join retail.prendas_por_regularizar pr on pr.venta_item_id = o.id
    join real_cat r on r.categoria_id = pr.categoria_id
   where o.est
)
insert into retail.venta_items_costo_respaldo (venta_item_id, costo_anterior, costo_nuevo, motivo)
select id, anterior, nuevo,
       'Octubre 2026: costo conservador de prendas sin registrar (el mayor entre su estimado y el promedio real de su categoría)'
  from nuevo where nuevo > anterior
on conflict do nothing;

update retail.venta_items i
   set costo_unitario = r.costo_nuevo
  from retail.venta_items_costo_respaldo r
 where r.venta_item_id = i.id and i.costo_unitario = r.costo_anterior;
