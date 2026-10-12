-- Órdenes de compra, fase 1 · actividad 3 (ADR-0362): ver una orden y la lista con cifras y filtros.
--
-- EL PROBLEMA PRIMERO. La lista dice qué órdenes hay, pero no qué se pidió en cada una: para saber cuántos polos de qué marca y a
-- cuánto había que abrir… nada, no había dónde. Y una encargada que compra para su tienda no tiene por qué recorrer las órdenes de las
-- otras para encontrar las suyas: la lista arranca en su sede (decisión 37) y necesita saber cuántas hay en cada destino para ofrecer
-- el filtro con su número.
--
-- QUÉ CREA (solo lecturas, nada que guarde).
--   1. `fn_orden_compra_detalle(p_id)`: una orden con su cabecera, quién la creó (y la cambió o anuló, cuando las fases siguientes lo
--      permitan), sus líneas con el nombre de la categoría y de la marca, y el total. NULL si no existe: la pantalla dice «no encontrada».
--   2. `fn_ordenes_compra_resumen()`: por destino (cada tienda y «por repartir»), cuántas órdenes generadas hay y por cuánto, y cuántas
--      anuladas. De aquí salen las cifras de arriba y el número de cada píldora de la lista.
--   Las dos exigen el módulo `ordenes_compra`; quien lo tiene ve todas las sedes (decisiones 34 y 37).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, después de 20261010223500: solo funciones nuevas, sin tablas, sin
-- políticas ni `drop trigger`, sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Una orden ----------
create or replace function retail.fn_orden_compra_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_resultado jsonb;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver una orden de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;

  select jsonb_build_object(
           'id', o.id,
           'numero', o.numero,
           'estado', o.estado,
           'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'ruc', pr.ruc),
           'destino', case when u.id is null then null else jsonb_build_object('id', u.id, 'nombre', u.nombre) end,
           'fecha_emision', o.fecha_emision,
           'fecha_entrega_estimada', o.fecha_entrega_estimada,
           'nota', o.nota,
           'creada_por', nullif(btrim(concat_ws(' ', pc.nombres, pc.apellidos)), ''),
           'creada_en', o.creada_en,
           'actualizada_por', nullif(btrim(concat_ws(' ', pa.nombres, pa.apellidos)), ''),
           'actualizada_en', o.actualizada_en,
           'version', o.version,
           'anulada_por', nullif(btrim(concat_ws(' ', pn.nombres, pn.apellidos)), ''),
           'anulada_en', o.anulada_en,
           'motivo_anulacion', o.motivo_anulacion,
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'posicion', i.posicion,
                      'categoria_id', i.categoria_id,
                      'categoria', c.nombre,
                      'marca_id', i.marca_id,
                      'marca', m.nombre,
                      'descripcion', i.descripcion,
                      'cantidad', i.cantidad,
                      'precio_unitario', i.precio_unitario,
                      'descuento', i.descuento,
                      'descuento_pct', i.descuento_pct,
                      'subtotal', i.subtotal
                    ) order by i.posicion)
               from retail.orden_compra_items i
               join retail.categorias c on c.id = i.categoria_id
               join retail.marcas m on m.id = i.marca_id
              where i.orden_compra_id = o.id
           ), '[]'::jsonb),
           'unidades', coalesce((select sum(i.cantidad) from retail.orden_compra_items i where i.orden_compra_id = o.id), 0),
           'total', coalesce((select sum(i.subtotal) from retail.orden_compra_items i where i.orden_compra_id = o.id), 0)
         )
    into v_resultado
    from retail.ordenes_compra o
    join retail.proveedores pr on pr.id = o.proveedor_id
    left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
    left join public.personas pc on pc.id = o.creada_por
    left join public.personas pa on pa.id = o.actualizada_por
    left join public.personas pn on pn.id = o.anulada_por
   where o.id = p_id;

  return v_resultado;
end;
$$;
comment on function retail.fn_orden_compra_detalle(uuid) is
  'ADR-0362: una orden de compra con sus líneas (nombres de categoría y marca), quién la creó y su total. NULL si no existe. Exige el módulo.';
revoke all on function retail.fn_orden_compra_detalle(uuid) from public, anon;
grant execute on function retail.fn_orden_compra_detalle(uuid) to authenticated, service_role;

-- ---------- 2. Cuántas hay en cada destino ----------
create or replace function retail.fn_ordenes_compra_resumen()
returns table (
  ubicacion_destino_id uuid,
  destino_nombre text,
  generadas integer,
  monto_generadas numeric,
  anuladas integer
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver las órdenes de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;

  return query
  select o.ubicacion_destino_id,
         u.nombre,
         (count(*) filter (where o.estado = 'generada'))::integer,
         coalesce(sum(t.total) filter (where o.estado = 'generada'), 0)::numeric,
         (count(*) filter (where o.estado = 'anulada'))::integer
    from retail.ordenes_compra o
    left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
    left join lateral (
      select sum(i.subtotal) as total from retail.orden_compra_items i where i.orden_compra_id = o.id
    ) t on true
   group by o.ubicacion_destino_id, u.nombre
   order by u.nombre nulls last;
end;
$$;
comment on function retail.fn_ordenes_compra_resumen() is
  'ADR-0362: por destino (tienda o NULL = por repartir), cuántas órdenes generadas hay y por cuánto, y cuántas anuladas. Exige el módulo.';
revoke all on function retail.fn_ordenes_compra_resumen() from public, anon;
grant execute on function retail.fn_ordenes_compra_resumen() to authenticated, service_role;

reset lock_timeout;
