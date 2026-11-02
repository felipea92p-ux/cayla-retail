-- ADR-0603 — Tiempo real por WebSocket (Supabase Realtime) en `retail.stock` y `retail.ventas`.
--
-- Hasta hoy la publicación `supabase_realtime` tenía 0 tablas (ADR-0018) y Vender, Existencias y Caja se
-- enteraban por sondeo. Felipe autorizó el 2026-11-02 publicar SOLO estas dos tablas:
--   · retail.stock  → Vender/Apartados/Cambios releen al instante; Existencias se vuelve a leer sola.
--   · retail.ventas → el tablero de Caja adelanta su sondeo cuando entra una venta.
--
-- Qué NO cambia: el socket no trae datos que se pinten, solo avisa «algo cambió en tu sede» (la web filtra por
-- `ubicacion_id`); la lectura sigue por las RPC y consultas de siempre. Realtime evalúa la RLS de cada tabla
-- (`stock_select`, `ventas_select`: fn_puede_operar_ubicacion) antes de emitir una fila, así que una cuenta solo
-- recibe avisos de las sedes que ya puede ver. Los sondeos quedan de respaldo (principio 9).
--
-- Producción es el proyecto COMPARTIDO con Dynamic: esto toca solo la publicación, no las tablas de nadie más.
-- Idempotente. Para deshacer:
--   alter publication supabase_realtime drop table retail.stock, retail.ventas;
-- (quita el aviso; las pantallas vuelven solas al sondeo de antes).
--
-- Una sola parte, sin políticas (ADR-0195). Hace un `alter table … replica identity full` en `stock` (metadato, sin
-- reescribir la tabla) con `lock_timeout` de 3 s: si la tienda la está usando justo entonces falla rápido y se repite.
-- OJO: la primera versión de esta migración NO lo hacía y quedó aplicada en producción el 2026-11-02 con `stock`
-- publicada; rompió las ventas unos minutos y se sacó `stock` de la publicación a mano (ADR-0603, «El incidente»).
-- Esta versión es idempotente y sirve tanto para una base limpia como para producción tal como quedó.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_tabla text;
begin
  -- Un Postgres sin Supabase (CI, pruebas) no tiene la publicación: no hay nada que activar.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime no existe en esta base: se omite (ADR-0603).';
    return;
  end if;

  foreach v_tabla in array array['stock', 'ventas'] loop
    -- Una tabla publicada rechaza todo UPDATE/DELETE si no tiene identidad de réplica. `stock` no tiene llave primaria
    -- (su fila es única por variante + ubicación + sububicación, y la sububicación puede ser nula): sin esto, publicarla
    -- rompía `registrar_venta` (2026-11-02, lo cazó el CI: «cannot update table "stock" because it does not have a replica
    -- identity»). FULL manda la fila completa en cada cambio; `stock` es chica (~2.300 filas por tienda).
    if not exists (
      select 1 from pg_index i where i.indrelid = format('retail.%I', v_tabla)::regclass and i.indisprimary
    ) then
      execute format('alter table retail.%I replica identity full', v_tabla);
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'retail' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table retail.%I', v_tabla);
    end if;
  end loop;
end
$$;
