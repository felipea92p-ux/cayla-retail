-- ============================================================================
-- 20261110022000 — La lista para unir lo ya recibido: recepciones «sin aviso» y compras pagadas que se parecen (ADR-0636, paso 3)
--
-- EL PROBLEMA PRIMERO. `unir_recepcion_con_compra` (20261110011000) une UNA pareja que una persona ya decidió, pero nadie sabe cuáles parejas hay.
-- Medido en producción el 2026-11-09: tres parejas calzan al centavo, otras solo en prendas, y compras que llegaron incompletas. Sin una lista,
-- cada pareja se descubre cruzando a mano la pantalla de recepciones con la de compras.
--
-- QUÉ PROMETE. `fn_uniones_posibles(sede)`: una fila por pareja (recepción «sin aviso» de esa sede × compra pagada por completar del MISMO proveedor
--   y de esa sola sede, que aún no se unió a nada), con: la recepción (id, número, si sigue abierta), la compra (id, fecha, prendas), cuántas prendas
--   llegaron libres de otras uniones, la clase y si se puede unir.
--     · clase `exacto`: mismas prendas y mismo valor (±S/ 1) · `probable`: llegaron todas pero el valor difiere o no se conoce ·
--       `parcial`: llegaron menos de lo comprado (no se une: ver la regla de la unión).
--     · `se_puede` y `motivo`: false con `llego_menos` (con `faltan`), `envio_con_conteo` o `envio_ya_recibido` (la compra ya tiene su envío propio
--       contado o recibido: lo resuelve una persona, igual que en la unión).
--   Los montos (`monto_papel`, `valor_llegado`) solo para quien ve el dinero de Compras; para los demás, null. Mismo permiso que unir (módulo
--   Recibir o Fondos por rendir) y mismo alcance de sede (`fn_recepcion_puede_leer_sede`).
-- QUÉ NO HACE. No une nada, no escribe nada, no decide por nadie: una pareja `exacta` también la une una persona. Una misma compra puede salir en
--   varias parejas (varias recepciones del mismo proveedor): al unir una, la lista se recalcula y las demás se acomodan solas.
--
-- PRODUCCIÓN. Una función nueva de solo lectura, re-ejecutable, sin políticas ni `alter table` (ADR-0195). Depende de 20261110011000 (la tabla
-- `compra_papel_llegadas`): pegarla DESPUÉS. Sin ella la web no ofrece la lista (principio 9), nada más.
-- VERIFICACIÓN (solo lectura, con una cuenta que ve Recibir): select retail.fn_uniones_posibles('<id de la sede>');
-- CÓMO SE DESHACE: drop function retail.fn_uniones_posibles(uuid);
-- ============================================================================
set search_path = retail, public, extensions;

create or replace function retail.fn_uniones_posibles(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_dinero boolean;
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_ve_modulo('fondos') is not true then
    raise exception 'Ver qué recepciones se pueden unir a una compra necesita el módulo «Recibir mercadería» o «Fondos por rendir» en tu rol'
      using errcode = '42501', hint = 'union_sin_modulo';
  end if;
  if not retail.fn_recepcion_puede_leer_sede(p_ubicacion_id) then
    return '[]'::jsonb;
  end if;
  v_dinero := coalesce(retail.fn_puede_ver_dinero_de_compras(), false);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'despacho_id', x.despacho_id,
             'envio', x.envio,
             'recepcion_abierta', x.abierta,
             'papel_id', x.papel_id,
             'proveedor_id', x.proveedor_id,
             'proveedor', x.proveedor,
             'fecha', x.fecha,
             'prendas_papel', x.prendas_papel,
             'prendas_llegadas', x.libres,
             'clase', x.clase,
             'se_puede', x.motivo is null,
             'motivo', x.motivo,
             'faltan', case when x.libres < x.prendas_papel then x.prendas_papel - x.libres end,
             'monto_papel', case when v_dinero then x.monto end,
             'valor_llegado', case when v_dinero then x.valor end
           ) order by (x.motivo is not null), x.orden_clase, x.proveedor, x.fecha, x.despacho_id)
      from (
        select y.*,
               case when y.libres < y.prendas_papel then 'parcial'
                    when y.libres = y.prendas_papel and y.valor is not null and abs(y.valor - y.monto) <= 1 then 'exacto'
                    else 'probable' end as clase,
               case when y.libres < y.prendas_papel then 3
                    when y.libres = y.prendas_papel and y.valor is not null and abs(y.valor - y.monto) <= 1 then 1
                    else 2 end as orden_clase,
               case when y.libres < y.prendas_papel then 'llego_menos'
                    when y.propio_recibido then 'envio_ya_recibido'
                    when y.propio_contado then 'envio_con_conteo' end as motivo
          from (
            select l.despacho_id, retail.fn_envio_numero_texto(l.numero) as envio, l.estado = 'abierto' as abierta,
                   p.papel_id, p.proveedor_id, p.proveedor, p.fecha, p.monto, p.prendas_papel,
                   l.llegadas - l.reservadas as libres,
                   -- Con otras compras ya unidas a esa recepción, el valor de lo que queda libre no se conoce: no se compara.
                   case when l.reservadas = 0 then l.valor end as valor,
                   exists (select 1 from retail.despachos d
                            where d.estado in ('en_camino', 'abierto', 'cerrado')
                              and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                            join retail.ordenes_compra o on o.id = i.orden_compra_id
                                           where di.despacho_id = d.id and o.papel_id = p.papel_id)
                              and (d.estado = 'cerrado' or exists (select 1 from retail.despacho_recibidos r where r.despacho_id = d.id))) as propio_recibido,
                   exists (select 1 from retail.despachos d
                            where d.estado in ('en_camino', 'abierto')
                              and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                            join retail.ordenes_compra o on o.id = i.orden_compra_id
                                           where di.despacho_id = d.id and o.papel_id = p.papel_id)
                              and exists (select 1 from retail.despacho_conteos k where k.despacho_id = d.id and k.contadas > 0)) as propio_contado
              from (
                -- Lo que ya está en el stock de cada recepción «sin aviso» de la sede, por proveedor, menos lo que otras uniones reclaman.
                select d.id as despacho_id, d.numero, d.estado, r.proveedor_id,
                       sum(r.cantidad)::integer as llegadas,
                       round(sum(r.cantidad * r.costo_unitario), 2) as valor,
                       coalesce((select sum(u.prendas_papel) from retail.compra_papel_llegadas u
                                  where u.despacho_id = d.id and u.proveedor_id = r.proveedor_id), 0)::integer as reservadas
                  from retail.despachos d
                  join retail.despachos_sin_aviso s on s.despacho_id = d.id
                  join retail.despacho_recibidos r on r.despacho_id = d.id and r.despacho_item_id is null and r.movimiento_id is not null
                 where d.ubicacion_destino_id = p_ubicacion_id and d.estado in ('abierto', 'cerrado') and r.proveedor_id is not null
                 group by d.id, d.numero, d.estado, r.proveedor_id
              ) l
              join (
                -- Las compras pagadas que esperan su papel: de un solo proveedor, de esta sola sede y todavía sin unir.
                select pa.id as papel_id, min(o.proveedor_id::text)::uuid as proveedor_id, min(pr.nombre) as proveedor, pa.fecha, pa.monto,
                       sum((select sum(i.cantidad) from retail.orden_compra_items i where i.orden_compra_id = o.id))::integer as prendas_papel
                  from retail.compra_papeles pa
                  join retail.ordenes_compra o on o.papel_id = pa.id and o.estado <> 'anulada'
                  left join retail.proveedores pr on pr.id = o.proveedor_id
                 where pa.estado = 'por_completar' and pa.pagado > 0
                   and not exists (select 1 from retail.compra_papel_llegadas u where u.papel_id = pa.id)
                 group by pa.id, pa.fecha, pa.monto
                having count(distinct o.proveedor_id) = 1 and count(distinct o.ubicacion_destino_id) = 1
                   and min(o.ubicacion_destino_id::text)::uuid = p_ubicacion_id
              ) p on p.proveedor_id = l.proveedor_id
             where l.llegadas - l.reservadas > 0
          ) y
      ) x
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_uniones_posibles(uuid) is
  'ADR-0636 (paso 3): las parejas posibles entre las recepciones «sin aviso» de una sede y las compras pagadas por completar del mismo proveedor, con su clase (exacto, probable, parcial) y si se pueden unir. Solo lee. Los montos, solo para quien ve el dinero de Compras.';
revoke all on function retail.fn_uniones_posibles(uuid) from public, anon;
grant execute on function retail.fn_uniones_posibles(uuid) to authenticated;
