-- ============================================================================
-- Las compras pagadas que vienen a una tienda, para avisar en la puerta de «Recibir sin aviso» (ADR-0636, paso 1)
--
-- EL PROBLEMA PRIMERO. La compradora paga, anota el papel y a veces tarda en «mandar» el envío; la mercadería llega antes y la tienda la
-- recibe «sin aviso». El stock entra por ahí y la compra queda con su envío propio esperando: si después lo cierran contando, las prendas
-- entran dos veces; si no, el papel nunca pasa al libro. Medido en producción el 2026-11-09: 112 prendas (S/ 3,157) recibidas sin aviso de
-- proveedores que tenían una compra pagada pendiente; tres parejas calzan al centavo.
--
-- QUÉ PROMETE. `fn_compras_pagadas_hacia(sede)`: una fila por compra pagada «por completar» con prendas para esa sede: proveedor, cuántas
--   prendas, la fecha del papel y dónde está (su envío en camino o abierto, con id y número; o «por mandar» si quien compró todavía no la
--   manda). SIN montos: la lee quien recibe. Mismo permiso y mismo alcance de sede que `fn_envios_por_recibir`.
-- QUÉ NO HACE. No une nada ni cambia cómo se recibe: solo informa (el enlace llega en el paso 2). No lista compras cuyo envío ya se cerró.
--
-- PRODUCCIÓN. Una función nueva de solo lectura, re-ejecutable, sin políticas ni `alter table` (ADR-0195). Pegar antes de publicar la web;
-- sin ella la puerta se dibuja igual, sin el aviso (principio 9).
-- VERIFICACIÓN (solo lectura, con una cuenta que ve Recibir): select retail.fn_compras_pagadas_hacia('<id de la sede>');
-- CÓMO SE DESHACE: drop function retail.fn_compras_pagadas_hacia(uuid);
-- ============================================================================
set search_path = retail, public, extensions;

create or replace function retail.fn_compras_pagadas_hacia(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver las compras que vienen necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;
  if not retail.fn_recepcion_puede_leer_sede(p_ubicacion_id) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'papel_id', x.papel_id,
             'proveedor_id', x.proveedor_id,
             'proveedor', x.proveedor,
             'fecha', x.fecha,
             'prendas', x.prendas,
             'por_mandar', x.por_mandar,
             'envios', x.envios
           ) order by x.fecha, x.proveedor, x.papel_id)
      from (
        select p.id as papel_id, o.proveedor_id, pr.nombre as proveedor, p.fecha,
               sum(i.cantidad)::integer as prendas,
               sum(retail.fn_compra_item_por_mandar(i.id))::integer as por_mandar,
               coalesce((select jsonb_agg(distinct jsonb_build_object('id', d.id, 'numero', retail.fn_envio_numero_texto(d.numero), 'estado', d.estado))
                           from retail.orden_compra_items i2
                           join retail.despacho_items di on di.orden_compra_item_id = i2.id
                           join retail.despachos d on d.id = di.despacho_id and d.estado in ('en_camino', 'abierto')
                          where i2.orden_compra_id = o.id), '[]'::jsonb) as envios,
               bool_or(exists (select 1 from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                                where di.orden_compra_item_id = i.id and d.estado in ('en_camino', 'abierto'))) as viaja
          from retail.compra_papeles p
          join retail.ordenes_compra o on o.papel_id = p.id and o.estado <> 'anulada' and o.ubicacion_destino_id = p_ubicacion_id
          join retail.orden_compra_items i on i.orden_compra_id = o.id
          left join retail.proveedores pr on pr.id = o.proveedor_id
         where p.estado = 'por_completar' and p.pagado > 0
         group by p.id, o.id, o.proveedor_id, pr.nombre, p.fecha
      ) x
     -- Solo lo que todavía puede llegar: algo por mandar o algo viajando. Lo ya cerrado no se avisa.
     where x.por_mandar > 0 or x.viaja
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_compras_pagadas_hacia(uuid) is
  'ADR-0636 (paso 1): las compras pagadas por completar que vienen a una sede (proveedor, prendas, fecha del papel, por mandar y sus envíos en camino o abiertos), sin montos. La lee la puerta de «Recibir sin aviso» para avisar antes de recibir por otra puerta.';
revoke all on function retail.fn_compras_pagadas_hacia(uuid) from public, anon;
grant execute on function retail.fn_compras_pagadas_hacia(uuid) to authenticated;
