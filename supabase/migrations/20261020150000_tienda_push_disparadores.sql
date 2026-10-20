-- ============================================================================
-- 20261020150000_tienda_push_disparadores.sql — CAYLA V2 · Tienda online: qué escribe la cola de avisos push (Felipe, 2026-10-20)
--
-- EL CAMBIO. Dos disparadores anotan el aviso en la cola (`tienda_push_envios`, migración anterior) en la MISMA transacción que el cambio:
--   · `tienda_push_talla`: una talla pasa de 0 a disponible en una tienda, y hay una espera («Avísame») de esa prenda en esa tienda o en
--     cualquier tienda. Solo cuenta lo que hay de verdad (`fn_tienda_libre`, la regla única de «hay»).
--   · `tienda_push_pedido`: el pedido web de una clienta con cuenta pasa a pagado, vencido o anulado.
--
-- POR QUÉ DISPARADORES Y NO EDITAR CADA FUNCIÓN. Los pedidos y el stock cambian desde muchas funciones (pagar, anular, vencer, recibir).
-- Un disparador en la tabla captura cualquiera de esos caminos sin tocar ninguno. El precio es que el disparador debe ser barato, por eso
-- filtra con `WHEN` antes de entrar a la función.
--
-- QUÉ SE GARANTIZA
--   · Un fallo al anotar el aviso NO detiene la venta, el pago ni el stock: el disparador lo registra como advertencia y sigue. Un aviso
--     perdido por un fallo es mejor que una venta bloqueada por un aviso.
--   · Un aviso no se duplica: la clave incluye la espera o el pedido y el estado (o el instante del cambio de stock), y la cola la guarda
--     única por cuenta.
--   · El texto es genérico: no lleva el nombre de la prenda, la talla ni el monto. El enlace solo dice a qué pantalla ir.
--
-- ORDEN. Va después de `20261020145000_tienda_push_suscripciones_y_envios.sql` (la tabla de la cola). Los disparadores se crean con
-- `create or replace trigger` (no `drop` + `create`), para que no tomen un bloqueo largo sobre `stock` ni `pedidos_web`.
-- ============================================================================

set search_path = retail, public;

-- Un bloqueo que no llega en 3 s cancela la migración (en vez de frenar la tienda).
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Talla que llegó: el stock de una tienda pasa de 0 a algo, y la prenda tiene una espera que se puede separar ahí.
create or replace function retail.tienda_push_talla()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  begin
    insert into retail.tienda_push_envios (cuenta_web_id, clave, titulo, texto, enlace)
    select e.cuenta_web_id,
           'talla:' || e.id::text || ':' || (extract(epoch from now()) * 1000000)::bigint::text,
           'Llegó una talla que esperabas',
           'Tu tienda ya la tiene. Ábrela para separarla.',
           '/notificaciones'
      from retail.esperas_web e
     where e.variante_id = new.variante_id
       and e.quitada_en is null
       and (e.ubicacion_id is null or e.ubicacion_id = new.ubicacion_id)
       and retail.fn_tienda_libre(new.variante_id, array[new.ubicacion_id]) > 0
    on conflict (cuenta_web_id, clave) do nothing;
  exception when others then
    raise warning 'tienda_push_talla: no se anotó el aviso (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- El stock es una fila por sububicación (piso, almacén): una talla que llega a una tienda puede ser una fila nueva (la primera unidad,
-- un insert) o una que estaba en cero (un update). Los dos caminos cuentan.
create or replace trigger tienda_push_talla
  after update of cantidad on retail.stock
  for each row
  when (old.cantidad = 0 and new.cantidad > 0)
  execute function retail.tienda_push_talla();

create or replace trigger tienda_push_talla_nueva
  after insert on retail.stock
  for each row
  when (new.cantidad > 0)
  execute function retail.tienda_push_talla();

-- ---------------------------------------------------------------------------
-- Pedido: la clienta con cuenta web tiene un cambio importante en su pedido (pagado, vencido o anulado).
create or replace function retail.tienda_push_pedido()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  begin
    insert into retail.tienda_push_envios (cuenta_web_id, clave, titulo, texto, enlace)
    select w.id,
           'pedido:' || new.id::text || ':' || new.estado,
           case new.estado
             when 'pagado' then 'Tu pedido está pagado'
             when 'vencido' then 'Tu pedido venció'
             else 'Tu pedido fue anulado'
           end,
           case new.estado
             when 'pagado' then 'Ábrelo para ver cómo recogerlo.'
             when 'vencido' then 'Ábrelo para ver qué pasó.'
             else 'Ábrelo para ver el detalle.'
           end,
           '/cuenta/pedidos/' || new.numero::text
      from retail.cuentas_web w
     where w.clienta_id = new.clienta_id
    on conflict (cuenta_web_id, clave) do nothing;
  exception when others then
    raise warning 'tienda_push_pedido: no se anotó el aviso (%)', sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger tienda_push_pedido
  after update of estado on retail.pedidos_web
  for each row
  when (old.estado is distinct from new.estado and new.estado in ('pagado', 'vencido', 'anulado'))
  execute function retail.tienda_push_pedido();

revoke all on function retail.tienda_push_talla() from public, anon, authenticated, tienda_web;
revoke all on function retail.tienda_push_pedido() from public, anon, authenticated, tienda_web;
