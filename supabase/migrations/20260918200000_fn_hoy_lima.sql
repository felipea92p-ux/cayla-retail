-- ============================================================================
-- fn_hoy_lima(): "hoy" según el reloj de Lima, no el de la base
--
-- EL PROBLEMA. Postgres corre en UTC: `current_date` cambia de día a las 19:00
-- de Lima. Entre las 7 pm y la medianoche, una factura que vence HOY ya cuenta
-- como vencida (`resumen_compras`, `compras_resumen.vencida`), justo cuando la
-- tienda todavía está abierta. Los indicadores de Compras sirven para decidir a
-- quién se le paga: un día corrido en la tarde-noche los vuelve poco confiables.
--
-- LA DECISIÓN. Una sola función que responde "¿qué día es en Lima?", usada por
-- todo lo nuevo de Compras (ADR-0111) y por lo que ya existía y comparaba contra
-- `current_date`. Mismo criterio que `hoyLima` en apps/web/lib/traslados-reglas.ts
-- (una sola fuente de verdad para "hoy", ahora también en la base).
--
-- STABLE, no IMMUTABLE: depende del reloj.
-- ============================================================================
set search_path = retail, public, extensions;

create or replace function retail.fn_hoy_lima()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Lima')::date
$$;

comment on function retail.fn_hoy_lima() is
  'Fecha de hoy en America/Lima. Usar en lugar de current_date en todo cálculo de "vence/venció/atrasada" (ADR-0111).';

-- Mismo candado que el resto (ADR-0078): nada de EXECUTE público.
revoke all on function retail.fn_hoy_lima() from public, anon;
grant execute on function retail.fn_hoy_lima() to authenticated;
