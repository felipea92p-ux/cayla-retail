-- ============================================================================
-- 20261001130100_descuento_por_etiqueta_con_el_modulo_politica.sql — CAYLA V2 · ADR-0293 (PARTE 2 de 2: la política)
--
-- Va DESPUÉS de 20261001130000 y se pega SOLA (ADR-0195: cada `create policy`, y hasta un `drop policy if exists`, toma en
-- exclusiva las tablas de `auth` y `storage` hasta el final de la transacción; mezclada con un `alter` de una tabla en uso
-- choca con el Asesor de seguridad del panel: `40P01 deadlock detected` y no se aplica nada).
--
-- QUÉ HACE. `etiquetas_insert_autenticado` dejaba a cualquiera con sesión proponer una etiqueta SIN descuento y exigía
-- `fn_es_lider()` para insertar una YA con descuento. Ahora la segunda mitad usa la capacidad de la PARTE 1
-- (`fn_puede_dar_descuento_por_etiqueta()` = líder o rol con Etiquetas): crear una etiqueta con descuento es configuración,
-- y la configuración es de quien tiene el módulo (Felipe, 2026-09-30). La web no ofrece hoy crear una etiqueta ya con
-- descuento (el descuento se pone en «Configurar campaña», que va por RPC); esto cierra la puerta directa por la API con la
-- misma regla, para que no haya dos respuestas distintas a «quién puede poner un descuento».
--
-- Mismo nombre, mismos roles, mismo `for insert`: solo cambia `fn_es_lider()` por la capacidad. Re-ejecutable.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

drop policy if exists etiquetas_insert_autenticado on retail.etiquetas;
create policy etiquetas_insert_autenticado on retail.etiquetas for insert
  with check (auth.role() = 'authenticated' and (descuento_pct is null or retail.fn_puede_dar_descuento_por_etiqueta()));

comment on policy etiquetas_insert_autenticado on retail.etiquetas is
  'Cualquiera con sesión propone una etiqueta SIN descuento; con descuento, líder o un rol con Etiquetas (ADR-0293, 20261001130100; antes solo el líder).';
