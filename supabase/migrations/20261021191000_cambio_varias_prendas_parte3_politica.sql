-- ============================================================================================================
-- 20261021191000_cambio_varias_prendas_parte3_politica.sql — CAYLA V2 · Cambios · una prenda por VARIAS (PARTE 3 de 3, ADR-0470)
--
-- La política de lectura de `cambio_salidas`, SOLA y al final (regla «Políticas y deadlocks», ADR-0195: cada `create policy` toma en
-- exclusiva las tablas de `auth` y `storage` hasta el final de la transacción; mezclada con un `alter` de una tabla en uso, choca con el
-- Asesor de seguridad del panel con `40P01`). La tabla está en 20261021185000 y la función en 20261021190000.
--
-- Quién lee: el mismo que lee `cambios` (`cambios_select`): un líder, o quien está en la sede del cambio. El ticket y el historial de
-- Cambios leen las prendas de un cambio con `cambios(…, cambio_salidas(…))`; sin esta política, la tabla (con RLS encendido) no devolvería nada.
-- Nadie escribe por aquí: no hay política de insert, update ni delete (las escribe la función `security definer`, y el disparador de la
-- tabla impide editarlas o borrarlas).
--
-- PRODUCCIÓN. Una parte, idempotente: `drop policy if exists` + `create policy`. Pegarla SOLA, después de las partes 1 y 2.
-- ============================================================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

drop policy if exists cambio_salidas_select on retail.cambio_salidas;
create policy cambio_salidas_select on retail.cambio_salidas
  for select to authenticated
  using (exists (select 1 from retail.cambios c where c.id = cambio_salidas.cambio_id));

select 'Cambio por varias · parte 3 (política)' as parte,
       case when exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'cambio_salidas' and policyname = 'cambio_salidas_select')
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
