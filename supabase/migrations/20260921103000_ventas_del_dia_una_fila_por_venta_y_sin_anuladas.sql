-- ============================================================================
-- 20260921103000_ventas_del_dia_una_fila_por_venta_y_sin_anuladas.sql — CAYLA V2
--
-- QUÉ CAMBIA: `fn_ventas_del_dia` —la lista de lo vendido HOY (hora de Lima) que leen
-- Caja, Vender y Facturación— deja de repetir una venta y de listar las anuladas.
--
-- POR QUÉ. Dos huecos, los dos LATENTES: al 2026-09-21 ninguna venta de producción está
-- anulada ni tiene dos comprobantes, así que con los datos de hoy la salida es idéntica.
--   1. Ventas anuladas. `anular_venta` (20260916172645 / 20260916214500) deja
--      `ventas.estado = 'anulada'`, pero la función no miraba el estado: una venta
--      anulada seguía en la lista con su total y sin etiqueta, y sumaba en «Vendido hoy»
--      de Facturación y en el avance de la meta de Caja. ADR-0110 define «venta» como lo
--      cobrado en el mostrador SIN las anuladas; el comparativo de la semana pasada ya
--      filtraba `completada`, y eso dejaba dos medidas distintas de lo mismo.
--   2. Una fila por venta. `left join comprobantes cmp on cmp.venta_id = v.id` repetía la
--      venta por cada comprobante que tuviera: `comprobantes.venta_id` no es único (solo
--      un índice común), y un comprobante liberado (`no_emitido`, ADR-0093) o dado de baja
--      (`anulado`) y su reemplazo comparten la venta. Salía dos veces, con su total
--      contado dos veces. (Las notas de crédito no cuentan: `emitir_nota` no les pone
--      `venta_id`.)
--
-- LA REGLA DEL COMPROBANTE. De los que tiene la venta se muestra el VIGENTE, no el muerto:
-- primero los que no están `anulado` ni `no_emitido`; entre iguales, el más nuevo. Si solo
-- hay muertos, el más nuevo de ellos: la fila sigue diciendo «Anulado» o «No emitido»,
-- como hasta hoy.
--
-- QUÉ NO CAMBIA. La firma, las columnas y sus tipos (`create or replace` en el lugar: no
-- nace una sobrecarga —el hueco de ADR-0009/0004— y los permisos de EXECUTE quedan como
-- estén, ADR-0078), la ventana «hoy en Lima» (se deja la expresión en línea y no
-- `fn_hoy_lima()`: esa función es de otra migración que producción puede no tener) ni el
-- filtro por rol.
--
-- SE ROMPE SI: alguien vuelve a un `left join comprobantes` plano (la venta reaparece
-- repetida) o quita el filtro de estado (las anuladas vuelven a sumar). Lo cubre
-- `scripts/pruebas/ventas_del_dia.mjs` (`pnpm pruebas:ventas-del-dia`).
--
-- REVERSIBLE. El cuerpo anterior es el de `20260917100800_talla_texto_en_lecturas.sql`
-- (huella md5 del texto sin espacios: 9f564c0f0a7f93cee69e7ff389972de4). La misma huella
-- tiene producción (`cayla-dynamic`, leída de `pg_proc` el 2026-09-21), o sea repo,
-- producción y Postgres local partían del mismo cuerpo.
--
-- PRODUCCIÓN. Se pega tal cual en el SQL Editor: ya trae el `set search_path` de abajo
-- (sin él, el cuerpo no se puede validar al crear). Un solo objeto, una sola firma.
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
  left join public.personas per on per.id = v.usuario_id
  left join clientes cli on cli.id = v.cliente_id
  -- Un comprobante por venta: el vigente y, entre iguales, el más nuevo (ver arriba).
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
  'Lo vendido hoy (hora de Lima): UNA fila por venta completada, con su comprobante vigente (o el más nuevo si solo hay anulados/no emitidos). Un líder ve todas las sedes o la que pida; el resto, la suya. Sin ventas anuladas (ADR-0110).';
