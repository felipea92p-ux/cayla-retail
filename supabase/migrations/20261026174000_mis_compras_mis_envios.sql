-- ============================================================================
-- Mis compras · «Mis envíos»: los envíos que mandó cada compradora, con su código y su ronda — SOLO LECTURA.
--
-- Felipe (2026-10-26, maqueta docs/maquetas/mis-compras-envios-2026-10/): al mandar a una tienda la compradora ve el código del envío
-- (ENV-000118) para avisar a la sede, y tiene un historial de los que mandó, de la ronda abierta y de las anteriores, con en qué quedó cada
-- uno. El código ya existe (`despachos.numero`, el mismo que la tienda busca en Recibir) y `mandar_compras_a_tienda` ya lo devuelve; lo que
-- faltaba es leerlos después.
--
-- `fn_mis_envios()`: los envíos DE QUIEN MIRA (`despachado_por`), del más nuevo al más viejo (hasta 300), cada uno con su estado
-- (en_camino · abierto · cerrado · anulado), la tienda, los fardos, cuántas prendas salieron y cuántas contó la tienda, su ronda (la de las
-- compras que lleva: el cierre de la ronda exige que nada quede por mandar, así que un envío sale dentro de su ronda abierta) y lo que
-- llevaba. No escribe nada: sin tablas, sin políticas ni disparadores (ADR-0195). Idempotente. La pide el módulo «Mis compras».
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_mis_envios()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver tus envíos necesita el módulo Mis compras en tu rol.' using errcode = '42501';
  end if;
  -- Desde una terminal no hay «tus envíos»: no se inventa una persona.
  if v_yo is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x.fila order by x.despachado_en desc, x.numero desc)
      from (
        select d.despachado_en, d.numero,
               jsonb_build_object(
                 'id', d.id,
                 'numero', retail.fn_envio_numero_texto(d.numero),
                 'estado', d.estado,
                 'destino_id', u.id,
                 'destino', u.nombre,
                 'bultos', coalesce(d.bultos, 1),
                 'despachado_en', d.despachado_en,
                 'abierto_en', d.abierto_en,
                 'cerrado_en', d.cerrado_en,
                 'cerrado_por', nullif(btrim(concat_ws(' ', pce.nombres, pce.apellidos)), ''),
                 'anulado_en', d.anulado_en,
                 'motivo_anulacion', d.motivo_anulacion,
                 'unidades', (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di where di.despacho_id = d.id),
                 'contadas', (select coalesce(sum(r.cantidad), 0)::integer from retail.despacho_recibidos r where r.despacho_id = d.id),
                 'ronda_id', ro.id,
                 'ronda', retail.fn_ronda_compras_texto(ro.id),
                 'ronda_abierta_en', ro.abierta_en,
                 'ronda_cerrada_en', ro.cerrada_en,
                 -- Las compras (papeles) que salieron en este envío: la lista de Mis compras dice «enviada · ENV-…» en cada una.
                 'papel_ids', ro.papeles,
                 'lineas', coalesce((
                   select jsonb_agg(jsonb_build_object('nombre', coalesce(di.descripcion, c.nombre), 'cantidad', di.cantidad) order by i.posicion)
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                     join retail.categorias c on c.id = di.categoria_id
                    where di.despacho_id = d.id), '[]'::jsonb)
               ) as fila
          from retail.despachos d
          join retail.ubicaciones u on u.id = d.ubicacion_destino_id
          left join public.personas pce on pce.id = d.cerrado_por
          -- Solo los que salieron de una compra anotada en Mis compras (un envío que Compras armó de una orden no es de la compradora).
          -- La ronda es la de esa compra; una compra de antes de las rondas no la tiene (`ro.id` nulo).
          join lateral (
            select (array_agg(r.id order by r.abierta_en nulls last))[1] as id,
                   (array_agg(r.abierta_en order by r.abierta_en nulls last))[1] as abierta_en,
                   (array_agg(r.cerrada_en order by r.abierta_en nulls last))[1] as cerrada_en,
                   to_jsonb(array_agg(distinct p.id)) as papeles
              from retail.despacho_items di
              join retail.orden_compra_items i on i.id = di.orden_compra_item_id
              join retail.ordenes_compra o on o.id = i.orden_compra_id
              join retail.compra_papeles p on p.id = o.papel_id
              left join retail.compra_rondas r on r.id = p.ronda_id
             where di.despacho_id = d.id
            having count(*) > 0) ro on true
         where d.despachado_por = v_yo
         order by d.despachado_en desc, d.numero desc
         limit 300) x), '[]'::jsonb);
end $$;
comment on function retail.fn_mis_envios() is
  'Mis compras: los envíos que mandó quien mira (código ENV-…, estado, tienda, fardos, prendas enviadas y contadas, su ronda y lo que llevaba). Solo lectura.';
revoke all on function retail.fn_mis_envios() from public, anon;
grant execute on function retail.fn_mis_envios() to authenticated;

notify pgrst, 'reload schema';
