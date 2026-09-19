-- ============================================================================
-- Compras (ADR-0111, D2): «esperando nota de crédito» en las LISTAS, no solo en el detalle
--
-- EL PROBLEMA. Cuando en una recepción se cierra un faltante («estas 4 unidades no
-- llegaron»), el proveedor le debe a CAYLA una nota de crédito por lo cerrado (a su
-- costo + IGV) hasta que llegue y se registre. El detalle de un comprobante ya lo decía
-- («Esperando nota de crédito · S/ 236.00», calculado en TypeScript), pero las listas no:
-- en Por pagar el líder veía el saldo completo y podía pagar de más justo lo que el
-- proveedor va a acreditar. Para no pagarlo, alguien tenía que abrir comprobante por
-- comprobante.
--
-- LA DECISIÓN. Una función de LECTURA que dice, para una lista de comprobantes, cuáles
-- están «esperando nota» y por cuánto. La lista de Comprobantes y Por pagar la llaman
-- con los ids de la página que ya tienen en pantalla (≤ 50). Se hizo función aparte y
-- NO se le agregaron columnas a `listar_compras` ni a `compras_resumen`: cambiar el
-- retorno de una función de la que depende producción ya rompió cosas antes (ADR-0009),
-- y una función nueva no puede romper a nadie.
--
-- LA REGLA (la misma que aplica `fn_insertar_nota_credito_compra`, 20260918215000):
--   · La nota por faltante es UNA por comprobante y solo con el comprobante resuelto al
--     100 % (recibido + cerrado ≥ facturado).
--   · «Esperando nota» = el comprobante VIGENTE tiene cierres (`compra_item_cierres`) y
--     todavía NO tiene una nota con motivo `faltante` (`compra_notas_credito`).
--   · Monto esperado = Σ(cierre.cantidad × compra_items.costo_unitario) × (1 + IGV/subtotal
--     del comprobante), a 2 decimales: la misma cuenta que el tope de la base y que
--     `montoDeCierres`/`tasaIgv` en `apps/web/lib/recepciones-reglas.ts`. El costo del
--     ítem es SIN IGV; la tasa no se guarda, se deduce de los montos del comprobante.
--   · `resuelto` = ya se puede registrar la nota (recibido + cerrado ≥ facturado). Si es
--     falso, todavía quedan unidades sin recibir ni cerrar: la pantalla avisa que la nota
--     se registra cuando el comprobante quede al 100 %.
--
-- QUIÉN. Solo quien registra compras (`fn_puede_registrar_compras()`, hoy = líder): es
-- dinero y es quien puede actuar sobre él. Un integrante recibe vacío, igual que las
-- cifras de dinero de Proveedores. Como el líder opera todas las sedes, no hace falta
-- repetir el candado por sede (`fn_puede_operar_ubicacion` es verdadero para él); si un
-- día `fn_puede_registrar_compras` se abre a alguien acotado a una sede, este es el
-- lugar donde agregarlo. `security definer` se salta la RLS, por eso el candado va acá.
--
-- Devuelve solo los comprobantes que cumplen; un id sin cierres, con nota por faltante,
-- anulado o desconocido simplemente no aparece.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.compras_nota_pendiente(p_compra_ids uuid[])
returns table (
  compra_id uuid,
  unidades_cerradas integer,
  monto_esperado numeric,
  resuelto boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
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
      where n.compra_id = c.id and n.motivo = 'faltante'
    )
  group by c.id;
$$;

comment on function retail.compras_nota_pendiente(uuid[]) is
  'Comprobantes vigentes con faltante cerrado y SIN nota de crédito por faltante todavía (ADR-0111): unidades cerradas, monto esperado (cierres a su costo + IGV) y si ya está resuelto al 100 % (ya se puede registrar la nota). Para las listas de Comprobantes y Por pagar; solo líder, un integrante recibe vacío.';

revoke all on function retail.compras_nota_pendiente(uuid[]) from public, anon;
grant execute on function retail.compras_nota_pendiente(uuid[]) to authenticated;
