-- ============================================================================
-- 20260922213700_ventas_del_dia_firma_con_quien_atendio.sql — CAYLA V2
--
-- QUÉ HACE. «Ventas de hoy» (`fn_ventas_del_dia`) firma cada venta con quien atendió a la clienta
-- (`ventas.asesora_id`) y, si la caja no eligió a nadie, con la sesión que cobró (`usuario_id`), como
-- hasta hoy. Misma firma y mismas columnas: Caja, Vender y Facturación no notan el cambio. ADR-0163.
--
-- POR QUÉ. El Punto de venta ya elige quién atendió (fila «Atendió», alimentada por la asistencia de
-- Dynamic vía `fn_asesoras_de_turno`) y lo manda en `p_asesora_id` a `registrar_venta` — ambas cosas
-- ya existen desde 20260922150000 (ADR-0153). Sin este cambio, la venta se guarda bien pero «Ventas de
-- hoy» la sigue mostrando a nombre del equipo de caja.
--
-- REEMPLAZA a la 20260922143700_vendedora_en_la_venta.sql de esta misma rama, que nunca se pegó en
-- producción: creaba una segunda columna (`vendedora_id`) para lo mismo que `asesora_id` y dejaba dos
-- sobrecargas de `registrar_venta` al correr junto a la 150000.
--
-- CUERPO. Idéntico al de 20260922140000_ficha_de_clienta_v1_backend.sql (la versión vigente en
-- producción, que ya lee `clientas`); cambia solo el join de `personas`.
--
-- SE ROMPE SI alguien vuelve a pegar una versión anterior de `fn_ventas_del_dia` (la de `clientes`
-- ya no compila: la tabla se retiró).
--
-- PRODUCCIÓN. `create or replace` con la misma firma: no hay sobrecarga nueva ni cambian los permisos.
-- Ya trae `set search_path`, así que se pega tal cual en el SQL Editor. Re-ejecutable.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_ventas_del_dia(p_ubicacion_id uuid default null::uuid)
 returns table(venta_id uuid, hora text, ubicacion_nombre text, vendedor text, cliente_nombre text, items jsonb, total numeric, metodos_pago text, comprobante_tipo text, comprobante_texto text, comprobante_estado text, nota text)
 language sql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    coalesce(per.nombres || ' ' || per.apellidos, '—'),
    coalesce(cli.nombre, 'Cliente varios'),
    (select jsonb_agg(jsonb_build_object(
        'referencia', pr.referencia, 'talla', ta.valor, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario
      ) order by vi.id)
      from venta_items vi
      join variantes va on va.id = vi.variante_id
      join productos pr on pr.id = va.producto_id
      left join tallas ta on ta.id = va.talla_id
      left join colores co on co.codigo = va.color_codigo
      where vi.venta_id = v.id),
    (select coalesce(sum(vi.subtotal), 0) from venta_items vi where vi.venta_id = v.id),
    (select string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id),
    cmp.tipo,
    case when cmp.id is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') else null end,
    cmp.estado,
    v.nota
  from ventas v
  join ubicaciones u on u.id = v.ubicacion_id
  -- El «vendedor» es quien atendió (ADR-0161); si la caja no eligió a nadie, la sesión que cobró.
  left join public.personas per on per.id = coalesce(v.asesora_id, v.usuario_id)
  left join clientas cli on cli.id = v.cliente_id
  -- Un comprobante por venta: el vigente y, entre iguales, el más nuevo.
  left join lateral (
    select c.id, c.tipo, c.serie, c.numero, c.estado
    from comprobantes c
    where c.venta_id = v.id
    order by (c.estado in ('anulado', 'no_emitido')), c.created_at desc, c.id
    limit 1
  ) cmp on true
  where v.estado = 'completada'
    and (v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
    and (
      (fn_es_lider() and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
      or (not fn_es_lider() and v.ubicacion_id = fn_ubicacion_actual_persona())
    )
  order by v.created_at desc;
$function$;

comment on function retail.fn_ventas_del_dia(uuid) is
  'Lo vendido hoy (hora de Lima): UNA fila por venta completada, con su comprobante vigente (o el más nuevo si solo hay anulados/no emitidos). El vendedor es quien atendió (ventas.asesora_id) y, si no se eligió, la sesión que cobró (ADR-0163). Un líder ve todas las sedes o la que pida; el resto, la suya. Sin ventas anuladas (ADR-0110). El nombre de la clienta sale de `clientas`.';
