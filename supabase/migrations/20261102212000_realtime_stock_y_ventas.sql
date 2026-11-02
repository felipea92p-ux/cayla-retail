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
-- Una sola parte: no crea políticas ni hace `alter table` (ADR-0195), solo agrega a la publicación.

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
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'retail' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table retail.%I', v_tabla);
    end if;
  end loop;
end
$$;
