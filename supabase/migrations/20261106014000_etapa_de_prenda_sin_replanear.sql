-- ============================================================================
-- 20261106014000_etapa_de_prenda_sin_replanear.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividad 14)
-- Preguntar la etapa de una prenda no puede volver lenta a la tienda web
--
-- EL PROBLEMA PRIMERO. `20261106004000` metió `fn_producto_etapa` dentro de `fn_vitrina_por_que_no`, que se pregunta prenda por prenda. Se escribió en
-- SQL con `security definer`, y Postgres vuelve a planear una función así EN CADA LLAMADA (lo que ya corrigió `20261017172000`). Medido en producción
-- al pegarla, el 2026-11-05: las revisiones de las 472 prendas publicadas costaban 3,1 s de los 3,4 s de `tienda_catalogo`, unos 6,5 ms por prenda.
--
-- ANALOGÍA CAYLA. Para saber si una prenda salió del Taller, la encargada releía el manual entero por cada prenda del perchero, aunque casi ninguna
-- haya pasado por el Taller. Ahora mira primero si tiene orden: sin orden, ya sabe la respuesta.
--
-- QUÉ HACE. Las dos funciones pasan a PL/pgSQL, que guarda su plan entre llamadas, con la misma regla. `fn_producto_etapa` responde `null` de un toque si
-- el modelo no tiene una orden viva, que es casi todo el catálogo; solo los modelos con orden hacen la cuenta completa.
--
-- CONTRATO (Liskov)
--   PROMETE: la misma respuesta que antes para todo modelo; la misma firma, los mismos permisos.
--   NO HACE: no toca `fn_vitrina_por_que_no` ni `fn_productos_filtro`: siguen preguntando igual.
--   SE ROMPE SI: alguien las vuelve a escribir en SQL: vuelve la lentitud, no un error. Lo vigila `pruebas:produccion-etapas-de-prenda`.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: dos funciones. Sin políticas, `alter` ni `drop trigger`. Va después de `20261106004000`.
-- VERIFICACIÓN: select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'retail.fn_producto_etapa(uuid)'::regprocedure;  → plpgsql
-- CÓMO SE DESHACE: volver a pegar las dos funciones de `20261106004000`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_productos_por_etapa(p_ids uuid[] default null)
returns table (producto_id uuid, etapa text)
language plpgsql
stable
security definer
set search_path = retail, public
as $$
#variable_conflict use_column
begin
  return query
  with con_orden as (
    -- Una orden anulada no cuenta: nunca hubo prenda.
    select o.producto_id, bool_or(o.estado = 'en_proceso') as abierta
    from retail.producciones o
    where o.estado <> 'anulada'
      and (p_ids is null or o.producto_id = any (p_ids))
    group by o.producto_id
  ),
  leida as (
    select c.producto_id, c.abierta,
           exists (select 1 from retail.variantes v
                     join retail.stock s on s.variante_id = v.id and s.cantidad > 0
                     join retail.ubicaciones u on u.id = s.ubicacion_id and u.tipo = 'taller'
                    where v.producto_id = c.producto_id) as en_taller,
           exists (select 1 from retail.variantes v
                     join retail.stock s on s.variante_id = v.id and s.cantidad > 0
                     join retail.ubicaciones u on u.id = s.ubicacion_id and u.tipo = 'tienda'
                    where v.producto_id = c.producto_id)
           or exists (select 1 from retail.variantes v
                        join retail.movimientos m on m.variante_id = v.id
                        join retail.ubicaciones u on u.id in (m.ubicacion_id, m.ubicacion_destino_id) and u.tipo = 'tienda'
                       where v.producto_id = c.producto_id) as llego_a_tienda
    from con_orden c
  )
  select l.producto_id,
         case when l.llego_a_tienda then 'en_tienda'
              when l.en_taller then 'terminada'
              else 'en_produccion' end
  from leida l
  where l.llego_a_tienda or l.en_taller or l.abierta;
end
$$;

create or replace function retail.fn_producto_etapa(p_producto_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = retail, public
as $$
begin
  -- Primero lo barato: casi ningún modelo pasó por el Taller, y sin una orden viva no hay etapa.
  if not exists (select 1 from retail.producciones o where o.producto_id = p_producto_id and o.estado <> 'anulada') then
    return null;
  end if;
  return (select e.etapa from retail.fn_productos_por_etapa(array[p_producto_id]) e);
end
$$;

reset lock_timeout;
