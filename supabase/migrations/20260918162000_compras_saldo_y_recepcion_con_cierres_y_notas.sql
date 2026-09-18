-- ============================================================================
-- Compras (ADR-0106, D2): el saldo y la recepción cuentan cierres y notas de crédito
--
-- LO QUE CAMBIA, en una frase: `saldo` deja de ser `total - pagado` y pasa a ser
-- `total - pagado - notas_credito`; y un comprobante cuyas líneas están 100 %
-- cubiertas por «recibido + cerrado» pasa a `recibida` (ya no se queda `parcial`
-- para siempre por lo que el proveedor no va a mandar).
--
-- SIGUE SIENDO UN CÁLCULO (principio 4). Nadie escribe `saldo` ni `estado_*`: son
-- columnas generadas sobre la foto (`pagado`, `notas_credito`, `recibido_cantidad`,
-- `cerrado_cantidad`), y la foto la mantienen triggers sobre las tablas-verdad
-- (`compra_pagos`, `compra_notas_credito`, `movimientos`, `compra_item_cierres`).
-- `recalcular_compras()` la reconstruye desde esas tablas cuando haga falta.
--
-- POR QUÉ SE BORRAN Y VUELVEN A CREAR LAS COLUMNAS GENERADAS. Postgres no deja
-- cambiar la expresión de una columna generada con `alter column` hasta la
-- versión 17 (`SET EXPRESSION`); para no depender de la versión de producción se
-- hace lo portable: soltar y volver a crear. No se pierde nada — son valores
-- calculados, se recomputan solos al recrearlas — y la tabla es chica. Lo que
-- las columnas arrastran también se recrea idéntico: cuatro índices y la vista
-- `compras_resumen`.
--   · `listar_compras` devuelve `setof compras_resumen`: su tipo de retorno
--     depende de la vista, así que la vista NO se puede soltar. Por eso se
--     reemplaza (`create or replace`) dos veces: primero con `saldo`/`estado_*`
--     calculados en línea (para soltarle la dependencia a las columnas), y al
--     final apuntando otra vez a las columnas recreadas.
--
-- `estado_recepcion`:
--   recibida     → recibido + cerrado >= facturado  (todo resuelto: llegó o se cerró)
--   parcial      → llegó algo (recibido > 0) y aún queda pendiente
--   sin_recibir  → nada llegó y aún queda pendiente (puede haber cierres parciales)
-- OJO: un comprobante con TODAS sus líneas cerradas y nada recibido queda
-- `recibida` con `recibido_cantidad = 0` — «resuelta», no «entregada». Quien mida
-- «entregó completo» debe comparar `recibido_cantidad >= facturado_cantidad`.
--
-- `estado_pago`: `pagada` significa «sin saldo» (pagado + notas >= total). Un
-- comprobante saldado 100 % con una nota de crédito y cero pagos aparece `pagada`.
-- `parcial` significa «hay pagos», no «hay notas»: una nota sola deja `pendiente`
-- con menos saldo.
--
-- «HOY» EN LIMA. `vencida` y `recepcion_atrasada` (la vista) comparaban contra
-- `current_date` (UTC: cambia de día a las 7 pm de Lima). Pasan a `fn_hoy_lima()`
-- (20260918160000).
--
-- CANDADOS DE ESQUEMA (principio 2): dos CHECK que hacen imposible el estado
-- absurdo, no solo lo validan las RPC:
--   · compras_no_sobrepagada  → pagado + notas_credito <= total  (saldo nunca < 0)
--   · compras_no_sobrerecibida → recibido + cerrado <= facturado (pendiente nunca < 0)
--
-- COMPATIBILIDAD: un comprobante existente conserva su saldo y sus estados —
-- notas_credito y cerrado_cantidad valen 0, así que las fórmulas nuevas dan el
-- mismo resultado que las viejas.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. triggers que mantienen la foto ====================
create function retail.fn_compra_cierre_insertado() returns trigger
language plpgsql security definer set search_path = retail, public, extensions
as $$
begin
  update compras c set cerrado_cantidad = c.cerrado_cantidad + new.cantidad
    from compra_items ci where ci.id = new.compra_item_id and c.id = ci.compra_id;
  return new;
end;
$$;
create trigger compra_item_cierres_foto after insert on compra_item_cierres
  for each row execute function retail.fn_compra_cierre_insertado();

create function retail.fn_compra_nota_credito_insertada() returns trigger
language plpgsql security definer set search_path = retail, public, extensions
as $$
begin
  update compras set notas_credito = notas_credito + new.monto where id = new.compra_id;
  return new;
end;
$$;
create trigger compra_notas_credito_foto after insert on compra_notas_credito
  for each row execute function retail.fn_compra_nota_credito_insertada();

-- ==================== 2. candados de esquema ====================
alter table compras
  add constraint compras_no_sobrepagada check (pagado + notas_credito <= total),
  add constraint compras_no_sobrerecibida check (recibido_cantidad + cerrado_cantidad <= facturado_cantidad);

-- ==================== 3. soltar la dependencia de la vista ====================
-- Mismas 29 columnas, mismos tipos; `saldo` y los dos `estado_*` salen calculados
-- en línea con las fórmulas NUEVAS (ya sin depender de las columnas generadas).
create or replace view retail.compras_resumen with (security_invoker = true) as
select
  c.id, c.proveedor_id, p.nombre as proveedor_nombre, p.ruc as proveedor_ruc,
  c.tipo, c.serie, c.numero, c.documento,
  c.fecha_emision, c.condicion, c.fecha_vencimiento, c.ubicacion_destino_id,
  c.subtotal, c.igv, c.total, c.estado, c.nota, c.created_at,
  c.pagado,
  (c.total - c.pagado - c.notas_credito)::numeric(12, 2) as saldo,
  (case
     when c.estado = 'anulada' then 'anulada'
     when c.pagado + c.notas_credito >= c.total then 'pagada'
     when c.pagado > 0 then 'parcial'
     else 'pendiente'
   end)::text as estado_pago,
  c.facturado_cantidad, c.recibido_cantidad,
  (case
     when c.estado = 'anulada' then 'anulada'
     when c.recibido_cantidad + c.cerrado_cantidad >= c.facturado_cantidad then 'recibida'
     when c.recibido_cantidad > 0 then 'parcial'
     else 'sin_recibir'
   end)::text as estado_recepcion,
  (c.estado = 'vigente' and c.total - c.pagado - c.notas_credito > 0 and c.fecha_vencimiento is not null and c.fecha_vencimiento < retail.fn_hoy_lima()) as vencida,
  c.fecha_estimada_llegada,
  (c.estado = 'vigente'
    and c.recibido_cantidad + c.cerrado_cantidad < c.facturado_cantidad
    and retail.fn_hoy_lima() > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)) as recepcion_atrasada,
  p.telefono as proveedor_telefono, p.banco as proveedor_banco, p.cuenta_bancaria as proveedor_cuenta_bancaria
from compras c
join proveedores p on p.id = c.proveedor_id;

-- ==================== 4. las columnas generadas, con la fórmula nueva ====================
-- Los índices que cuelgan de ellas se sueltan y se recrean idénticos al final.
drop index compras_por_pagar_idx;
drop index compras_estado_pago_idx;
drop index compras_estado_recepcion_idx;
drop index compras_por_recibir_idx;

alter table compras
  drop column saldo,
  drop column estado_pago,
  drop column estado_recepcion;

alter table compras
  add column saldo numeric(12, 2) generated always as (total - pagado - notas_credito) stored,
  add column estado_pago text generated always as (
    case
      when estado = 'anulada' then 'anulada'
      when pagado + notas_credito >= total then 'pagada'
      when pagado > 0 then 'parcial'
      else 'pendiente'
    end
  ) stored,
  add column estado_recepcion text generated always as (
    case
      when estado = 'anulada' then 'anulada'
      when recibido_cantidad + cerrado_cantidad >= facturado_cantidad then 'recibida'
      when recibido_cantidad > 0 then 'parcial'
      else 'sin_recibir'
    end
  ) stored;

-- Mismos índices que 20260912234815 / 20260914220000 (orden con created_at).
create index compras_estado_pago_idx on compras (estado_pago, fecha_emision desc, created_at desc, id desc);
create index compras_estado_recepcion_idx on compras (estado_recepcion, fecha_emision desc, created_at desc, id desc);
create index compras_por_pagar_idx on compras (fecha_vencimiento, id) where estado = 'vigente' and saldo > 0;
create index compras_por_recibir_idx on compras (fecha_emision, id) where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial');

-- ==================== 5. la vista, apuntando otra vez a las columnas ====================
-- Solo se AGREGAN columnas al final (`create or replace view` no deja mover ni
-- renombrar): `notas_credito` y `cerrado_cantidad`.
create or replace view retail.compras_resumen with (security_invoker = true) as
select
  c.id, c.proveedor_id, p.nombre as proveedor_nombre, p.ruc as proveedor_ruc,
  c.tipo, c.serie, c.numero, c.documento,
  c.fecha_emision, c.condicion, c.fecha_vencimiento, c.ubicacion_destino_id,
  c.subtotal, c.igv, c.total, c.estado, c.nota, c.created_at,
  c.pagado, c.saldo, c.estado_pago,
  c.facturado_cantidad, c.recibido_cantidad, c.estado_recepcion,
  (c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento is not null and c.fecha_vencimiento < retail.fn_hoy_lima()) as vencida,
  c.fecha_estimada_llegada,
  (c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
    and retail.fn_hoy_lima() > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)) as recepcion_atrasada,
  p.telefono as proveedor_telefono, p.banco as proveedor_banco, p.cuenta_bancaria as proveedor_cuenta_bancaria,
  c.notas_credito, c.cerrado_cantidad
from compras c
join proveedores p on p.id = c.proveedor_id;

-- ==================== 6. las líneas: `cerrado` y un `pendiente` que lo descuenta ====================
-- `cerrado` va al final (regla de `create or replace view`). Mismos tipos: bigint.
create or replace view retail.compra_items_resumen with (security_invoker = true) as
select
  ci.id, ci.compra_id, ci.producto_id, ci.variante_id, ci.descripcion,
  ci.cantidad, ci.costo_unitario, ci.subtotal,
  coalesce((select sum(m.cantidad) from movimientos m where m.compra_item_id = ci.id), 0) as recibido,
  ci.cantidad
    - coalesce((select sum(m.cantidad) from movimientos m where m.compra_item_id = ci.id), 0)
    - coalesce((select sum(k.cantidad) from compra_item_cierres k where k.compra_item_id = ci.id), 0) as pendiente,
  coalesce((select sum(k.cantidad) from compra_item_cierres k where k.compra_item_id = ci.id), 0) as cerrado
from compra_items ci;

-- ==================== 7. reconstruir la foto desde la verdad ====================
create or replace function retail.recalcular_compras()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update compras c set
    pagado = coalesce((select sum(monto) from compra_pagos p where p.compra_id = c.id), 0),
    notas_credito = coalesce((select sum(n.monto) from compra_notas_credito n where n.compra_id = c.id), 0),
    facturado_cantidad = coalesce((select sum(cantidad) from compra_items i where i.compra_id = c.id), 0),
    recibido_cantidad = coalesce((
      select sum(m.cantidad) from movimientos m join compra_items i on i.id = m.compra_item_id
      where i.compra_id = c.id
    ), 0),
    cerrado_cantidad = coalesce((
      select sum(k.cantidad) from compra_item_cierres k join compra_items i on i.id = k.compra_item_id
      where i.compra_id = c.id
    ), 0);
end;
$$;
