-- ============================================================================
-- 20261031150000_cotizacion_maquila_vigente_dia_de_lima.sql — CAYLA V2 (2026-10-31)
--
-- EL PROBLEMA PRIMERO. `fn_cotizacion_maquila_vigente` (20260922160000) da por vigente una cotización con
-- `vigente_hasta >= current_date`. Supabase corre en UTC: de 19:00 a 24:00 en Lima, `current_date` ya es el día
-- siguiente, y el último día de una cotización la función la da por vencida cinco horas antes. La pantalla
-- (`lib/cotizaciones-maquila-reglas.ts`, `estadoDeCotizacion`) mide con el día de Lima y dice «Por vencer»: las dos
-- tienen que decir lo mismo, y esa misma regla lo pide. Hoy nadie llama a la función (la usará D-80), así que no hay
-- una pantalla rota; es la misma falla que tuvo `registrar_compra` (20261031013000).
--
-- LA DECISIÓN. `vigente_hasta >= retail.fn_hoy_lima()`, el «hoy» de todo el ERP. Nada más cambia: la firma, el tipo
-- de retorno, `security definer`, el `search_path` y el orden. `create or replace` conserva los permisos; el
-- `revoke`/`grant` de abajo los vuelve a dejar como en 20260922160000 (solo `authenticated`) por si acaso.
--
-- CONTRATO (Liskov)
--   PROMETE: una cotización vale hasta el final de su `vigente_hasta` en hora de Lima, a cualquier hora del servidor.
--   NO HACE: no toca la tabla, sus políticas ni otra función.
--
-- CÓMO SE PEGA. Una sola parte, solo la función, sin políticas ni `drop` (ADR-0195). Idempotente. Prueba:
-- `pnpm pruebas:cotizaciones-maquila`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.fn_cotizacion_maquila_vigente(p_categoria_id uuid)
returns retail.cotizaciones_maquila
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select *
  from retail.cotizaciones_maquila
  where categoria_id = p_categoria_id
    and vigente_hasta >= retail.fn_hoy_lima()
  order by fecha_cotizacion desc, created_at desc
  limit 1
$$;

revoke execute on function retail.fn_cotizacion_maquila_vigente(uuid) from public;
grant execute on function retail.fn_cotizacion_maquila_vigente(uuid) to authenticated;
