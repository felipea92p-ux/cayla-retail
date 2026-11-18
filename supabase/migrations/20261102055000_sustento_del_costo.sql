-- ============================================================================
-- 20261102055000_sustento_del_costo.sql — CAYLA V2 (Finanzas ▸ Impuestos; ADR-0598, actividad 1)
--
-- EL PROBLEMA PRIMERO. Desde octubre de 2026 CAYLA declara todo lo que vende, pero muchos de sus proveedores no dan factura (Gamarra: nota
-- de venta o nada). Para la renta del año (la declaración anual de marzo de 2027) un costo sin comprobante NO se resta (art. 20 y 37 de la
-- Ley del Impuesto a la Renta): para SUNAT esa prenda costó cero y su venta es toda utilidad, al 29,5 % sobre lo que pase de 15 UIT en el
-- Régimen MYPE. Ese golpe llega de una vez en marzo, y nada en el ERP lo medía: el IGV de Impuestos solo mira las facturas que dan crédito.
-- El ERP ya sabe el papel de cada costo (`compras.tipo`, `comprobantes_produccion.tipo`, `gastos.compra_id`, `gastos_viaje.papel`, las
-- recepciones sin comprobante): faltaba sumarlo por proveedor y por papel.
--
-- QUÉ HACE. `fn_sustento_costos(desde, hasta)`: lo que CAYLA gastó en el rango, SIN IGV, en una fila por (origen, proveedor, papel), con
-- cuántos documentos. Solo lee; solo el líder (es el dinero de compras, como `fn_impuestos_panel`). Las cinco fuentes, cada sol una vez:
--   · compras vigentes de mercadería y de gastos (`compras.naturaleza`; los activos NO: se deprecian, y su depreciación ya vive en el
--     Estado de resultados), por `subtotal`, con su `tipo` como papel;
--   · notas de crédito del proveedor sobre esas compras, en negativo, con el papel de su compra;
--   · comprobantes del Taller vigentes (`comprobantes_produccion`: tela, avíos, maquila), origen «taller»;
--   · gastos vigentes SIN compra: con el papel de su viaje si lo tiene (`gastos_viaje.papel`), si no «sin_comprobante»; sin proveedor;
--   · recepciones de mercadería sin comprobante (el lote que ningún movimiento ata a una línea de compra, la misma regla de
--     `resumen_sin_comprobante`), valoradas al costo con que entraron (`costo_historial.costo_unitario_nuevo`). Se salta el lote de un
--     envío (`lotes.despacho_id`): llega por una orden de compra y su plata vive en las compras de esa orden (`registrar_comprobante_orden`,
--     también la «sin comprobante» SC-…); contarlo además sería contarlo dos veces. Lo que entró sin costo no suma.
-- La clasificación (qué papel resta, cuál resta con tope, cuál no) NO vive aquí: es de `apps/web/lib/sustento-reglas.ts`, con su prueba.
--
-- DECIDÍ: una lectura nueva sobre lo que ya existe, sin columnas ni tablas. Los papeles se devuelven tal cual (factura, boleta, ticket,
--   recibo_por_honorarios, planilla_movilidad, nota_venta, sin_comprobante) para que la regla de renta quede en un solo lugar.
-- DESCARTÉ: seguir cada prenda vendida hasta su compra (exacto, pero la carga inicial y lo del Taller sin papel quedan «sin dato», y es mucho
--   más caro). Felipe eligió la proporción (2026-11-02): el % sin papel de lo comprado se aplica al costo de lo vendido.
-- DESCARTÉ: reutilizar `fn_impuestos_compras`: deja fuera a propósito las notas de venta, lo sin comprobante y las recepciones sin papel,
--   que son justo lo que aquí importa; cambiarla movería el IGV.
-- SE ROMPE SI: (1) llega mercadería con «Llegó mercadería» (`recibir_lote`, sin envío) y después se registra su factura SIN atarla a lo
--   recibido: el lote cuenta como sin papel además de la compra; y al revés, una orden cuyo comprobante nunca se registró no suma nada;
--   (2) alguien agrega un tipo de comprobante nuevo: llega como papel desconocido y la web lo trata como «sin comprobante» (lo conservador)
--   hasta que se clasifique; (3) un lote entra sin costo: no suma (se ve aparte en Recibir).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola parte: crea UNA función nueva y sus permisos. No toca tablas, políticas ni funciones vivas. Idempotente.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_sustento_costos(p_desde date, p_hasta date)
returns table (origen text, proveedor_id uuid, proveedor text, papel text, documentos integer, monto numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder ve el sustento de los costos (es el dinero de compras).' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = '22023';
  end if;

  return query
  with fuentes as (
    -- Compras de mercadería y de gastos, por su base sin IGV.
    select case k.naturaleza when 'mercaderia' then 'mercaderia' else 'gasto' end as origen,
           k.proveedor_id, pr.nombre::text as proveedor, k.tipo as papel, k.id as doc, k.subtotal as monto
      from retail.compras k
      join retail.proveedores pr on pr.id = k.proveedor_id
     where k.estado = 'vigente' and k.naturaleza in ('mercaderia', 'gasto')
       and k.fecha_emision between p_desde and p_hasta
    union all
    -- Notas de crédito del proveedor: restan, con el papel de su compra.
    select case k.naturaleza when 'mercaderia' then 'mercaderia' else 'gasto' end,
           k.proveedor_id, pr.nombre::text, k.tipo, null::uuid, -n.subtotal
      from retail.compra_notas_credito n
      join retail.compras k on k.id = n.compra_id
      join retail.proveedores pr on pr.id = k.proveedor_id
     where k.estado = 'vigente' and k.naturaleza in ('mercaderia', 'gasto')
       and n.fecha between p_desde and p_hasta
    union all
    -- El Taller: tela, avíos, maquila.
    select 'taller', p.proveedor_id, pp.nombre::text, p.tipo, p.id, p.subtotal
      from retail.comprobantes_produccion p
      join retail.proveedores_produccion pp on pp.id = p.proveedor_id
     where p.estado = 'vigente' and p.fecha_emision between p_desde and p_hasta
    union all
    -- Gastos sin compra: el papel de su viaje, o ninguno.
    select 'gasto', null::uuid, null::text, coalesce(gv.papel, 'sin_comprobante'), g.id, g.monto_total - g.igv
      from retail.gastos g
      left join retail.gastos_viaje gv on gv.gasto_id = g.id
     where g.estado = 'vigente' and g.compra_id is null
       and g.fecha between p_desde and p_hasta
    union all
    -- Mercadería que entró sin comprobante, al costo con que entró (un lote = un documento).
    select 'mercaderia', l.proveedor_id, pr.nombre::text, 'sin_comprobante', l.id, sum(m.cantidad * ch.costo_unitario_nuevo)
      from retail.lotes l
      join retail.proveedores pr on pr.id = l.proveedor_id
      join retail.movimientos m on m.lote_id = l.id and m.tipo = 'entrada'
      join retail.costo_historial ch on ch.movimiento_id = m.id
     where (l.fecha_recepcion at time zone 'America/Lima')::date between p_desde and p_hasta
       and not exists (select 1 from retail.movimientos x where x.lote_id = l.id and x.compra_item_id is not null)
       and l.despacho_id is null
     group by l.id, l.proveedor_id, pr.nombre
  )
  select f.origen, f.proveedor_id, f.proveedor, f.papel, (count(distinct f.doc))::integer, round(sum(f.monto), 2)
    from fuentes f
   group by f.origen, f.proveedor_id, f.proveedor, f.papel
  having round(sum(f.monto), 2) <> 0
   order by 6 desc, 1, 3, 4;
end $$;

comment on function retail.fn_sustento_costos(date, date) is
  'ADR-0598: lo gastado en el rango, sin IGV, por (origen, proveedor, papel): compras de mercadería y gastos (sin activos), sus notas de crédito en negativo, comprobantes del Taller, gastos sin compra y recepciones de mercadería sin comprobante al costo de entrada. Solo lee; solo el líder. La regla de qué papel resta para la renta vive en apps/web/lib/sustento-reglas.ts.';

revoke all on function retail.fn_sustento_costos(date, date) from public, anon;
grant execute on function retail.fn_sustento_costos(date, date) to authenticated;
