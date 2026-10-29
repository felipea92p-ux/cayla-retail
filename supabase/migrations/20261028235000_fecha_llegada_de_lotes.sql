-- «Llegó el …» en Recibir mercadería ▸ Terminados.
--
-- EL PROBLEMA PRIMERO. La lista de lo recibido muestra la fecha del lote (`lotes.fecha_recepcion`), que es el instante en que las
-- prendas entraron al stock, o sea el cierre del conteo. Quien mira quiere saber también cuándo llegó el paquete a la sede, y la
-- base ya lo guarda: `despachos.abierto_en` es cuando la sede abrió el envío para recibirlo. Pero la web no puede leer `despachos`
-- (sin permiso de lectura directo, por diseño: se accede por funciones) y ninguna función existente devuelve esa fecha para envíos
-- ya cerrados (`fn_envios_por_recibir` solo trae los abiertos y en camino).
--
-- QUÉ HACE. `retail.fn_llegada_de_lotes(p_lote_ids)`: para cada lote que viene de un envío y cuyo envío tiene `abierto_en`, devuelve
-- {lote_id, abierto_en}. Solo lectura. Un lote sin envío (ingreso sin guía, recepción de factura) simplemente no sale.
--
-- PERMISO: el mismo de quien ve la lista de lo recibido: el módulo «Recibir mercadería» o «Órdenes de compra» (como
-- `fn_envios_por_recibir`) o «Facturas de compra» (la lista también sale en Compras).
--
-- DESCARTÉ: dar SELECT directo sobre `despachos` (abre toda la tabla y sus columnas a quien tenga el rol) y repetir la fecha en
-- `lotes` (dos verdades de cuándo se abrió un envío).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): UNA parte, solo una función (sin tablas ni políticas, ADR-0195), re-pegable.

set lock_timeout = '3s';

create or replace function retail.fn_llegada_de_lotes(p_lote_ids uuid[])
returns table (lote_id uuid, abierto_en timestamptz)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('recibir') is not true
     and retail.fn_ve_modulo('ordenes_compra') is not true
     and retail.fn_ve_modulo('facturas_compra') is not true then
    raise exception 'Ver cuándo llegó cada envío necesita el módulo «Recibir mercadería», «Órdenes de compra» o «Facturas de compra» en tu rol'
      using errcode = '42501', hint = 'llegada_sin_modulo';
  end if;
  return query
    select l.id, d.abierto_en
      from retail.lotes l
      join retail.despachos d on d.id = l.despacho_id
     where l.id = any (coalesce(p_lote_ids, '{}'::uuid[]))
       and d.abierto_en is not null;
end;
$$;

comment on function retail.fn_llegada_de_lotes(uuid[]) is
  'Cuándo la sede abrió el envío de cada lote (despachos.abierto_en), para «Llegó el …» en lo recibido. Solo lectura; lotes sin envío no salen.';

revoke all on function retail.fn_llegada_de_lotes(uuid[]) from public, anon;
grant execute on function retail.fn_llegada_de_lotes(uuid[]) to authenticated, service_role;
