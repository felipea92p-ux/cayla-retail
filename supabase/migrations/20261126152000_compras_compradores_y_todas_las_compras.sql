-- ============================================================================
-- 20261126152000_compras_compradores_y_todas_las_compras.sql — CAYLA V2 · ADR-0704 (Compras reestructurado)
-- Las dos lecturas de la Compras nueva (maqueta docs/maquetas/compras-reestructura-2026-11/, Felipe 2026-11-26).
--
-- EL PROBLEMA PRIMERO. Felipe: «si quiero ver las compras que están haciendo las personas que tienen dinero no se puede». Medido en
-- producción el 2026-11-26: lo que se compra desde «Mis compras» (`compra_papeles`, 54 compras, S/ 30,777) recién llega al Historial
-- cuando Compras la revisa (`completar_papel_compra` crea su comprobante en `compras`, con `token_cliente` = el id del papel). Ese día
-- había 21 revisadas y 33 que ya habían salido a la tienda en su envío pero no aparecían en ninguna lista de compras: solo en la bandeja
-- «Revisar compras», como trabajo pendiente, sin decir quién gastó cuánto.
--
-- QUÉ HACE (solo lecturas: nada se escribe, nada se borra, ninguna tabla ni política nueva)
--   1. `fn_compradores()` (módulo `fondos`): las rondas abiertas y las cerradas de los últimos 60 días, cada una con quién compra, su
--      cuenta (`fn_ronda_compras_cuenta`: le dieron, pagó de su plata, gastos), cómo cerró y TODAS sus compras —revisadas o no— con su
--      papel, lo pagado, el medio, las prendas, el comprobante si ya se revisó y los envíos en que salieron.
--   2. `fn_todas_las_compras(desde, hasta, persona, busqueda, limite)` (módulo `facturas_compra`): un solo libro. Una compra de «Mis
--      compras» entra desde que sale en un envío a la tienda (decisión de Felipe, 2026-11-26: «luego de hacer el envío, ya que si no la
--      persona de compras lo puede editar»); su comprobante, si ya existe, va en la misma fila (nunca dos veces). Los comprobantes de
--      mercadería que no nacieron de «Mis compras» (órdenes de compra de antes) se suman como filas de la oficina.
--
-- Las dos son SECURITY DEFINER y preguntan el módulo antes de leer, como `fn_revisar_compras`. Se pega tal cual en producción: solo
-- `create or replace function` con firmas nuevas, idempotente.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Los envíos (despachos) en que salieron las prendas de una compra de «Mis compras», sin los anulados.
create or replace function retail.fn_envios_de_papel(p_papel uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'numero', retail.fn_envio_numero_texto(e.numero), 'estado', e.estado, 'destino', e.destino, 'salio_en', e.despachado_en)
         order by e.despachado_en), '[]'::jsonb)
    from (select distinct d.id, d.numero, d.estado, u.nombre as destino, d.despachado_en
            from retail.ordenes_compra o
            join retail.orden_compra_items i on i.orden_compra_id = o.id
            join retail.despacho_items di on di.orden_compra_item_id = i.id
            join retail.despachos d on d.id = di.despacho_id and d.estado <> 'anulado'
            join retail.ubicaciones u on u.id = d.ubicacion_destino_id
           where o.papel_id = p_papel) e;
$function$;
revoke all on function retail.fn_envios_de_papel(uuid) from public, anon, authenticated;

-- Una compra de «Mis compras» como la leen las dos pantallas: lo mismo en las dos, para que nunca digan cosas distintas.
create or replace function retail.fn_compra_de_papel(p_papel uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  select jsonb_build_object(
           'id', cp.id, 'origen', 'compra',
           'persona_id', cp.persona_id, 'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
           'ronda_id', cp.ronda_id, 'ronda', retail.fn_ronda_compras_texto(cp.ronda_id),
           'fecha', cp.fecha, 'creado_en', cp.created_at,
           'proveedor_id', cp.proveedor_id, 'proveedor', pr.nombre, 'proveedor_ruc', pr.ruc,
           'tipo', cp.tipo, 'monto', cp.monto, 'pagado', cp.pagado, 'medio_pago', cp.medio_pago,
           'revisada', cp.estado = 'completado',
           'prendas', (select coalesce(sum(i.cantidad), 0) from retail.ordenes_compra o
                         join retail.orden_compra_items i on i.orden_compra_id = o.id where o.papel_id = cp.id),
           'comprobante', (select jsonb_build_object('id', c.id, 'documento', c.documento, 'saldo', c.saldo, 'estado_pago', c.estado_pago)
                             from retail.compras c where c.token_cliente = cp.id and c.estado <> 'anulada' limit 1),
           'envios', retail.fn_envios_de_papel(cp.id))
    from retail.compra_papeles cp
    join retail.proveedores pr on pr.id = cp.proveedor_id
    left join public.personas pe on pe.id = cp.persona_id
   where cp.id = p_papel;
$function$;
revoke all on function retail.fn_compra_de_papel(uuid) from public, anon, authenticated;

-- 1. Compradores: quién está comprando con plata de CAYLA y en qué la gastó.
create or replace function retail.fn_compradores()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver a los compradores necesita el módulo Compradores en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'texto', retail.fn_ronda_compras_texto(r.id),
             'persona_id', r.persona_id, 'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
             'abierta_en', r.abierta_en, 'cerrada_en', r.cerrada_en,
             'cierre', (select jsonb_build_object('decision', ci.decision, 'monto', ci.monto, 'resuelto', ci.resuelto_en is not null)
                          from retail.compra_cierres ci where ci.id = r.cierre_id),
             'cuenta', retail.fn_ronda_compras_cuenta(r.id),
             'ultima_compra_en', (select max(cp.created_at) from retail.compra_papeles cp where cp.ronda_id = r.id and cp.estado <> 'anulado'),
             'compras', coalesce((select jsonb_agg(retail.fn_compra_de_papel(cp.id) order by cp.fecha desc, cp.created_at desc)
                                    from retail.compra_papeles cp where cp.ronda_id = r.id and cp.estado <> 'anulado'), '[]'::jsonb))
           order by r.cerrada_en is not null, coalesce(r.cerrada_en, r.abierta_en) desc)
      from retail.compra_rondas r
      left join public.personas pe on pe.id = r.persona_id
     where r.cerrada_en is null or r.cerrada_en >= now() - interval '60 days'), '[]'::jsonb);
end;
$function$;
revoke all on function retail.fn_compradores() from public, anon;
grant execute on function retail.fn_compradores() to authenticated;

-- 2. Todas las compras: un solo libro, lo más nuevo primero. `p_persona` deja solo las de esa persona (y deja fuera las de la oficina).
create or replace function retail.fn_todas_las_compras(
  p_desde date default null,
  p_hasta date default null,
  p_persona uuid default null,
  p_busqueda text default null,
  p_limite integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_q text := nullif(btrim(p_busqueda), '');
  v_limite integer := greatest(1, least(coalesce(p_limite, 300), 1000));
begin
  if not retail.fn_ve_modulo('facturas_compra') then
    raise exception 'Ver todas las compras necesita el módulo Todas las compras en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.fila order by x.fecha desc, x.creado_en desc)
      from (
        -- Lo de «Mis compras», desde que salió en un envío.
        (select cp.fecha, cp.created_at as creado_en, retail.fn_compra_de_papel(cp.id) as fila
           from retail.compra_papeles cp
           join retail.proveedores pr on pr.id = cp.proveedor_id
           left join public.personas pe on pe.id = cp.persona_id
          where cp.estado <> 'anulado'
            and exists (select 1 from retail.ordenes_compra o
                          join retail.orden_compra_items i on i.orden_compra_id = o.id
                          join retail.despacho_items di on di.orden_compra_item_id = i.id
                          join retail.despachos d on d.id = di.despacho_id and d.estado <> 'anulado'
                         where o.papel_id = cp.id)
            and (p_desde is null or cp.fecha >= p_desde)
            and (p_hasta is null or cp.fecha <= p_hasta)
            and (p_persona is null or cp.persona_id = p_persona)
            and (v_q is null or pr.nombre ilike '%' || v_q || '%' or coalesce(pr.ruc, '') ilike '%' || v_q || '%'
                 or concat_ws(' ', pe.nombres, pe.apellidos) ilike '%' || v_q || '%'
                 or concat_ws('-', cp.serie, cp.numero) ilike '%' || v_q || '%')
          order by cp.fecha desc, cp.created_at desc
          limit v_limite)
        union all
        -- Los comprobantes de mercadería que no nacieron de «Mis compras»: los registró la oficina.
        (select c.fecha_emision, c.created_at,
                jsonb_build_object(
                  'id', c.id, 'origen', 'comprobante', 'persona_id', null, 'persona', null, 'ronda_id', null, 'ronda', null,
                  'fecha', c.fecha_emision, 'creado_en', c.created_at,
                  'proveedor_id', c.proveedor_id, 'proveedor', pr.nombre, 'proveedor_ruc', pr.ruc,
                  'tipo', c.tipo, 'monto', c.total, 'pagado', c.total - c.saldo, 'medio_pago', null, 'revisada', true,
                  'prendas', c.facturado_cantidad,
                  'comprobante', jsonb_build_object('id', c.id, 'documento', c.documento, 'saldo', c.saldo, 'estado_pago', c.estado_pago),
                  'envios', '[]'::jsonb)
           from retail.compras c
           join retail.proveedores pr on pr.id = c.proveedor_id
          where p_persona is null
            and c.estado <> 'anulada' and c.naturaleza = 'mercaderia'
            and not exists (select 1 from retail.compra_papeles cp where cp.id = c.token_cliente)
            and (p_desde is null or c.fecha_emision >= p_desde)
            and (p_hasta is null or c.fecha_emision <= p_hasta)
            and (v_q is null or pr.nombre ilike '%' || v_q || '%' or coalesce(pr.ruc, '') ilike '%' || v_q || '%' or c.documento ilike '%' || v_q || '%')
          order by c.fecha_emision desc, c.created_at desc
          limit v_limite)
      ) x), '[]'::jsonb);
end;
$function$;
revoke all on function retail.fn_todas_las_compras(date, date, uuid, text, integer) from public, anon;
grant execute on function retail.fn_todas_las_compras(date, date, uuid, text, integer) to authenticated;
