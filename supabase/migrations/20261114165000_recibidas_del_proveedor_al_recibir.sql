-- ============================================================================
-- 20261114165000_recibidas_del_proveedor_al_recibir.sql — CAYLA V2 · tablero de Recibir, tarea 9 (Felipe 2026-11-14, /innovar recibir-galeria#3)
-- Recibir: la galería de «Ya la tenemos» pone primero lo que este proveedor ya mandó.
--
-- EL PROBLEMA PRIMERO. Una reposición es casi siempre una prenda que ese mismo proveedor ya trajo. La galería de la categoría (hasta 200 fotos,
-- `fn_parecidas_para_recibir`) no lo sabía: ordenaba por marca y nombre, y la blusa que llega cada mes quedaba entre otras 39.
--
-- QUÉ AGREGA
--   `fn_recibidas_del_proveedor(p_categoria_id, p_proveedor_ids)`: por cada prenda activa de la categoría que llegó alguna vez de esos proveedores, la última
--   fecha en que llegó. Solo lectura. Lee dos caminos, porque los dos existen en producción:
--     · `despacho_recibidos` (Recibir de hoy: proveedor, variante y `creado_en`);
--     · `movimientos.lote_id` → `lotes.proveedor_id` (los fardos de antes del despacho).
--   La galería la usa para ordenar y para decir el porqué («Llegó el 2 nov»); nunca esconde lo que no vino antes.
--
-- DESCARTÉ
--   · Sumarlo a `fn_parecidas_para_recibir`: cambiaría la respuesta de una función que usan otras pantallas, y cada búsqueda la recalcularía.
--     Esta se pide una vez al abrir la galería.
--   · `productos.proveedor_id` («a quién se le compra habitualmente»): es lo que se espera, no lo que llegó, y queda vacío en muchas prendas.
--
-- PERMISO: el mismo de `fn_parecidas_para_recibir` (Recibir u Órdenes de compra).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente. Solo crea una función.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_recibidas_del_proveedor(p_categoria_id uuid, p_proveedor_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver lo recibido de un proveedor necesita el módulo «Recibir mercadería» u «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_categoria_id is null or p_proveedor_ids is null or cardinality(p_proveedor_ids) = 0 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('producto_id', x.producto_id, 'ultima_vez', x.ultima_vez) order by x.ultima_vez desc)
      from (
        select v.producto_id, max(r.cuando) as ultima_vez
          from (
            select dr.variante_id, dr.creado_en as cuando
              from retail.despacho_recibidos dr
             where dr.proveedor_id = any (p_proveedor_ids)
               and dr.categoria_id = p_categoria_id
               and dr.cantidad > 0
            union all
            select m.variante_id, m.created_at
              from retail.movimientos m
              join retail.lotes l on l.id = m.lote_id
             where l.proveedor_id = any (p_proveedor_ids)
          ) r
          join retail.variantes v on v.id = r.variante_id
          join retail.productos pr on pr.id = v.producto_id
         where pr.categoria_id = p_categoria_id
           and pr.estado = 'activo'
         group by v.producto_id
         order by max(r.cuando) desc
         limit 200
      ) x
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_recibidas_del_proveedor(uuid, uuid[]) is
  'Tarea 9 del tablero de Recibir (2026-11-14): por prenda activa de la categoría, la última vez que llegó de esos proveedores (despacho_recibidos y lotes). La galería de «Ya la tenemos» la usa para poner primero lo que ese proveedor ya mandó.';

revoke all on function retail.fn_recibidas_del_proveedor(uuid, uuid[]) from public, anon;
grant execute on function retail.fn_recibidas_del_proveedor(uuid, uuid[]) to authenticated, service_role;

reset lock_timeout;
