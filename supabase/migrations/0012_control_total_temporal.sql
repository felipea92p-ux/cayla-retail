-- ============================================================================
-- 0012_control_total_temporal.sql — CAYLA V2
--
-- DECISIÓN (Felipe, 2026-09-12): mientras retail está en etapa de pruebas,
-- CUALQUIER persona activa en Dynamic (sin importar su rol real ahí) tiene
-- control total en retail — lo mismo que hoy solo tenía Felipe. Encontrado
-- al probar con la cuenta de Benjamin Cueva (rol 'integrante', sede Oficina
-- TRU): quedaba fuera del login por la misma razón de fondo que ya se
-- arregló para líderes sin sede de tienda/almacén (0006_fallback_ubicacion_
-- lider), pero esta vez porque `fn_es_lider()` le daba false a secas — un
-- integrante nunca entraba al fallback de ubicación.
--
-- CAMBIA: `fn_es_lider()` deja de mirar el rol real de Dynamic
-- ('admin'/'supervisor_sede' vs 'lider_do'/'integrante') y pasa a devolver
-- true para cualquier persona activa. Esto es TODO lo que hace falta
-- cambiar: cada permiso de retail ya compone sobre `fn_es_lider()` o sobre
-- `fn_puede_operar_ubicacion()` (que a su vez usa `fn_es_lider()`), así que
-- una sola función abre catálogo, caja, facturación y todo lo demás para
-- cualquier cuenta de Dynamic — nada más se toca.
--
-- SE ROMPE SI: alguien reactiva el mapeo real de roles sin revisar que ya
-- no hace falta este bypass — revertir es un solo `create or replace`, ver
-- 0009_integracion_dynamic.sql para la versión anterior (mapeo real de rol).
--
-- CONSECUENCIA REAL, no cosmética: cualquier persona activa de Dynamic
-- puede ahora anular comprobantes SUNAT ya aceptados, cerrar conteos,
-- aprobar devoluciones y registrar series de facturación — no solo vender.
-- Es exactamente lo que se pidió ("control total para todo"), documentado
-- acá para que quede claro qué se relajó y por qué, el día que se quiera
-- volver a distinguir roles.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas where auth_user_id = auth.uid() and estado = 'activo'
  );
$$;
