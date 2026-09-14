-- ============================================================================
-- Resumen de compras: cuánto vence esta semana, contado en Postgres
--
-- EL PROBLEMA. "Por pagar" mostraba una tarjeta "Vence en 7 días" sumada
-- desde las filas de la página en pantalla — con 50 filas por página, la
-- cifra podía decir "Ninguna en esta página" habiendo facturas por vencer
-- en la siguiente. Las otras dos tarjetas (deuda, vencido) ya salían de
-- `resumen_compras`; esta era la única que mentía por diseño.
--
-- Se agregan dos columnas a `resumen_compras`: `por_vencer` (cuántas) y
-- `por_vencer_monto` (cuánto) con vencimiento de hoy a 7 días inclusive.
-- Cambia el tipo de retorno, así que hay que DROP + CREATE: `create or
-- replace` no puede cambiar las columnas de un `returns table`.
--
-- La pantalla lee las columnas nuevas con `?? 0`: si producción aún no tiene
-- esta migración, la tarjeta muestra 0 en vez de romper la página.
-- ============================================================================

drop function retail.resumen_compras();

create function retail.resumen_compras()
returns table (
  registradas bigint, vigentes bigint, por_recibir bigint,
  deuda numeric, con_saldo bigint, vencido numeric, vencidas bigint,
  por_vencer bigint, por_vencer_monto numeric
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    (select count(*) from compras),
    (select count(*) from compras where estado = 'vigente'),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial')),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0),
    (select count(*) from compras where estado = 'vigente' and saldo > 0),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between current_date and current_date + 7),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between current_date and current_date + 7)
  where auth.uid() is not null;
$$;

grant execute on function retail.resumen_compras to authenticated;
