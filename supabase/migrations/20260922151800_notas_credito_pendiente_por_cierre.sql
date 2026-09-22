-- Corrige un doble conteo real en el tablero de Notas de Crédito (hallado 2026-09-22 por la revisión
-- adversarial de la siembra de 90 días, ver docs/adr/0150-datos-de-demostracion-90-dias.md, «Revisor de
-- pantallas de la Fase 3»).
--
-- Qué estaba mal: retail.notas_credito_tablero() y retail.compras_nota_pendiente() marcaban un cierre de
-- línea de compra (compra_item_cierres) como «pendiente de nota» mirando si TODA LA COMPRA ya tenía alguna
-- nota de crédito con motivo = 'faltante'. Pero fn_insertar_nota_credito_compra permite resolver
-- legítimamente un cierre con motivo 'devolucion'/'descuento'/'otro' sin exigir que la compra esté
-- completamente resuelta (esa exigencia solo aplica a 'faltante'). Resultado: un cierre ya resuelto con
-- otro motivo seguía apareciendo como «pendiente, falta la nota» para siempre — el mismo crédito se veía
-- dos veces: una vez como nota ya aplicada, otra como saldo pendiente de reclamar al proveedor.
--
-- El arreglo: comparar por el CIERRE concreto (compra_item_cierres.id = compra_notas_credito.cierre_id),
-- sin filtrar por motivo, en vez de comparar por compra + motivo. Un cierre sin ninguna nota sigue
-- pendiente; un cierre con cualquier nota ya no lo está. Ningún otro cambio de comportamiento.

create or replace function retail.compras_nota_pendiente(p_compra_ids uuid[])
returns table(compra_id uuid, unidades_cerradas integer, monto_esperado numeric, resuelto boolean)
language sql stable security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  select c.id,
         sum(k.cantidad)::integer,
         round(
           sum(k.cantidad * i.costo_unitario)
             * (1 + case when c.subtotal > 0 then c.igv / c.subtotal else 0 end),
           2
         ),
         (c.recibido_cantidad + c.cerrado_cantidad >= c.facturado_cantidad)
  from compras c
  join compra_items i on i.compra_id = c.id
  join compra_item_cierres k on k.compra_item_id = i.id
  where fn_puede_registrar_compras()
    and c.id = any(p_compra_ids)
    and c.estado = 'vigente'
    and not exists (
      select 1 from compra_notas_credito n
      where n.cierre_id = k.id
    )
  group by c.id;
$function$;

create or replace function retail.notas_credito_tablero()
returns table(clase text, id uuid, compra_id uuid, documento text, proveedor_id uuid, proveedor_nombre text,
  serie_numero text, fecha date, monto numeric, aplicado numeric, a_favor numeric, igv numeric, motivo text,
  nota text, cierre_id uuid, compra_total numeric, compra_saldo numeric, compra_fecha_emision date,
  compra_estado text, unidades_cerradas integer, monto_esperado numeric, cerrado_en timestamptz,
  created_at timestamptz, resuelto boolean)
language sql stable security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras. Va primero: si falla, aborta antes de
  -- leer un solo peso.
  select retail.fn_exige_dinero_de_compras('las notas de crédito de proveedores');

  select t.clase, t.id, t.compra_id, t.documento, t.proveedor_id, t.proveedor_nombre,
         t.serie_numero, t.fecha, t.monto, t.aplicado, t.a_favor, t.igv, t.motivo, t.nota,
         t.cierre_id, t.compra_total, t.compra_saldo, t.compra_fecha_emision, t.compra_estado,
         t.unidades_cerradas, t.monto_esperado, t.cerrado_en, t.created_at, t.resuelto
  from (
    -- (a) las notas que ya existen
    select 'nota'::text as clase,
           n.id,
           n.compra_id,
           c.documento,
           c.proveedor_id,
           p.nombre as proveedor_nombre,
           n.serie_numero,
           n.fecha,
           n.monto,
           n.aplicado,
           (n.monto - n.aplicado)::numeric(12, 2) as a_favor,
           n.igv,
           n.motivo,
           n.nota,
           n.cierre_id,
           c.total as compra_total,
           c.saldo as compra_saldo,
           c.fecha_emision as compra_fecha_emision,
           c.estado as compra_estado,
           k.cantidad as unidades_cerradas,
           null::numeric as monto_esperado,
           k.created_at as cerrado_en,
           n.created_at,
           true as resuelto
    from retail.compra_notas_credito n
    join retail.compras c on c.id = n.compra_id
    join retail.proveedores p on p.id = c.proveedor_id
    left join retail.compra_item_cierres k on k.id = n.cierre_id

    union all

    -- (b) los cierres que todavía no tienen NINGUNA nota (antes: solo miraba si la compra entera tenía
    -- una nota con motivo 'faltante' — dejaba «pendiente» un cierre ya resuelto con otro motivo)
    select 'pendiente'::text,
           f.cierre_id,
           f.compra_id,
           f.documento,
           f.proveedor_id,
           f.proveedor_nombre,
           null::text,
           null::date,
           null::numeric,
           null::numeric,
           null::numeric,
           null::numeric,
           'faltante'::text,
           null::text,
           f.cierre_id,
           f.compra_total,
           f.compra_saldo,
           f.compra_fecha_emision,
           f.compra_estado,
           f.unidades_cerradas,
           f.monto_esperado,
           f.cerrado_en,
           f.cerrado_en,
           f.resuelto
    from (
      select c.id as compra_id,
             c.documento,
             c.proveedor_id,
             p.nombre as proveedor_nombre,
             c.total as compra_total,
             c.saldo as compra_saldo,
             c.fecha_emision as compra_fecha_emision,
             c.estado as compra_estado,
             sum(k.cantidad)::integer as unidades_cerradas,
             round(
               sum(k.cantidad * i.costo_unitario)
                 * (1 + case when c.subtotal > 0 then c.igv / c.subtotal else 0 end),
               2
             ) as monto_esperado,
             max(k.created_at) as cerrado_en,
             (array_agg(k.id order by k.created_at desc, k.id desc))[1] as cierre_id,
             (c.recibido_cantidad + c.cerrado_cantidad >= c.facturado_cantidad) as resuelto
      from retail.compras c
      join retail.proveedores p on p.id = c.proveedor_id
      join retail.compra_items i on i.compra_id = c.id
      join retail.compra_item_cierres k on k.compra_item_id = i.id
      where c.estado = 'vigente'
        and not exists (
          select 1 from retail.compra_notas_credito n
          where n.cierre_id = k.id
        )
      group by c.id, p.nombre
    ) f
  ) t
  order by coalesce(t.fecha, t.cerrado_en::date) desc nulls last, t.created_at desc, t.id;
$function$;
