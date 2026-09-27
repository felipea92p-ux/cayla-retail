-- ============================================================================
-- 20260928150000_pedidos_no_atendidos_clienta_fk.sql — CAYLA V2 · Clientas, paso 2 del acta (parte 2/5)
--
-- La FK que `20260922190000_pedidos_no_atendidos.sql` dejó escrita y sin aplicar, esperando a que
-- `retail.clientas` existiera («cuando `clientas` aterrice en `origin/main`, agregar en una
-- migración nueva» — comentario de esa migración). `retail.clientas` aterrizó el 2026-09-22
-- (20260922140000); esta es esa migración nueva.
--
-- `not valid` + `validate constraint` en dos sentencias (en vez de un `add constraint` a secas):
-- así Postgres no bloquea la tabla completa mientras revisa las filas existentes — mismo criterio
-- de bajo bloqueo que ya pedía el comentario original. Con 0 filas en producción hoy (verificado
-- 2026-09-26, `docs/datos/DECISIONES-2026-09-26-clientas.md`) el costo real es cero, pero la forma
-- correcta no depende de cuántas filas haya hoy.
--
-- Estado imposible que esto cierra: un `pedidos_no_atendidos.clienta_id` que apunte a una clienta
-- que nunca existió — hasta esta migración, la columna era un uuid suelto sin ninguna garantía.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'retail.pedidos_no_atendidos'::regclass
      and conname = 'pedidos_no_atendidos_clienta_id_fkey'
  ) then
    alter table retail.pedidos_no_atendidos
      add constraint pedidos_no_atendidos_clienta_id_fkey
      foreign key (clienta_id) references retail.clientas (id) not valid;
  end if;
end $$;

alter table retail.pedidos_no_atendidos validate constraint pedidos_no_atendidos_clienta_id_fkey;
