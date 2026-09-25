-- ============================================================================
-- 20260922193700_comprobantes_tomar_para_reintento.sql — CAYLA V2
--
-- D-60 paso 2 (`docs/superpowers/specs/2026-09-22-comprobantes-series-y-envio-automatico-design.md`):
-- el reintento de lo que Lucode/SUNAT no aceptó, SIN cron. Cada cobro en Vender y cada apertura de
-- Comprobantes llaman a `/api/lucode/reintentar`, que pide acá qué le toca enviar.
--
-- EL PROBLEMA QUE RESUELVE. Si dos pestañas (o dos tiendas con un líder mirando todo) barren la cola a
-- la vez, las dos leerían el mismo comprobante y lo mandarían dos veces a SUNAT con el mismo número.
-- Leer y reservar tienen que ser UNA operación: `for update skip locked` salta lo que otra pasada ya
-- está tomando, y en la misma transacción se corre `proximo_reintento_at` 5 minutos — una reserva que
-- vence sola si la pasada muere a medias (pestaña cerrada), sin dejar nada trabado para siempre.
--
-- QUÉ TOMA
--   · `pendiente_reintento` con `proximo_reintento_at` vencido (Lucode falló antes; backoff de
--     `fn_marcar_reintento_transmision`).
--   · `pendiente` de más de 2 minutos que nunca se intentó: el envío del cobro no llegó a salir
--     (pestaña cerrada, sin red). Los 2 minutos son para no pisar el envío del propio cobro, que
--     tarda como mucho 15 s (timeout de `lib/lucode.ts`). Y de menos de 3 días: un pendiente más viejo
--     no se revive solo (queda a la vista para decidirlo a mano). Nunca uno de una venta anulada.
--   Máximo `p_limite` por llamada: una pasada no bloquea la pantalla de nadie enviando 200 de golpe.
--
-- QUIÉN. `p_ubicacion_id` null = todas las sedes, solo líder (igual que `fn_comprobantes_cola_reintento`);
-- con sede, quien puede operar esa sede (la terminal de la tienda barre lo suyo).
--
-- SE ROMPE SI alguien transmite un comprobante tomado acá sin pasar por `/api/lucode/emitir` (esa
-- ruta es la que decide qué se puede declarar: `motivoParaNoTransmitir`).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_tomar_comprobantes_para_reintento(
  p_ubicacion_id uuid default null,
  p_limite integer default 5
)
returns setof uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_ubicacion_id is null then
    if not fn_es_lider() then
      raise exception 'Solo un líder puede reintentar los comprobantes de todas las sedes';
    end if;
  elsif not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para operar esa ubicación';
  end if;

  return query
    with tomados as (
      select c.id
        from comprobantes c
        left join ventas v on v.id = c.venta_id
       where (p_ubicacion_id is null or c.ubicacion_id = p_ubicacion_id)
         and (v.id is null or v.estado <> 'anulada')
         and (
           (c.estado = 'pendiente_reintento' and coalesce(c.proximo_reintento_at, now()) <= now())
           or (c.estado = 'pendiente' and c.created_at < now() - interval '2 minutes'
               and c.created_at > now() - interval '3 days'
               and coalesce(c.proximo_reintento_at, now()) <= now())
         )
       order by c.created_at
       limit greatest(1, least(p_limite, 20))
       for update of c skip locked
    )
    update comprobantes c
       set proximo_reintento_at = now() + interval '5 minutes'
      from tomados t
     where c.id = t.id
    returning c.id;
end;
$$;

revoke all on function retail.fn_tomar_comprobantes_para_reintento(uuid, integer) from public;
grant execute on function retail.fn_tomar_comprobantes_para_reintento(uuid, integer) to authenticated;
