-- ============================================================================
-- 20260925223000 — Análisis vuelve a abrirse al rol que tiene el módulo (arregla la regresión de #397)
--
-- QUÉ PASÓ
--   ADR-0161 P5 (migraciones 20260923130000 y 20260923140000): quien tiene el módulo Análisis, sin ser líder, analiza
--   SU sede en Inventario ▸ Análisis y ahí ve el costo de lo vendido (márgenes). El candado de
--   `fn_resumen_comparacion` quedó en `fn_puede_operar_ubicacion(p_ubicacion_id) and retail.fn_puede_analizar()`.
--   Esas dos migraciones lo cambiaron EN VIVO (reemplazo sobre pg_get_functiondef), así que el archivo original
--   (20260919220000) siguió diciendo `fn_es_lider()`.
--
--   El PR #397 (20260924010700 y 20260924030000, ADR-0199/0202) recreó la función entera copiando el cuerpo de ese
--   archivo viejo, y con él volvió `… and fn_es_lider() as ok`. Resultado: desde que se pegó, un rol con Análisis que no
--   es líder recibe CERO filas de su propia sede — la pantalla le sale vacía. Nadie lo decidió: ni ADR-0199 ni
--   ADR-0202 hablan de permisos, y `fn_ledger_timeline` (misma migración) sí usa `fn_puede_analizar()`.
--   Lo detectó `pnpm pruebas:roles` (69/70) en el job piloto de CI, que no bloquea.
--   Verificado en producción el 2026-09-25: el filtro vivo es `fn_es_lider()` y el cuerpo es idéntico al del repo
--   (md5 de pg_get_functiondef = f5f8029bf1da8d56a237a8c8a6147227 en los dos lados).
--
-- QUÉ HACE
--   1. Cambia SOLO el filtro de permiso de `fn_resumen_comparacion`, sobre la definición VIVA de la base (no sobre un
--      cuerpo copiado: copiar el cuerpo de un archivo es justo lo que causó esto). Si el texto no aparece exactamente
--      una vez, falla y no toca nada.
--   2. Corrige el comentario de la función («Solo líderes.» ya no es cierto).
--   3. Verifica: una sola firma, security definer, `authenticated` ejecuta y `anon` no.
--
-- LO QUE NO CAMBIA (P5 intacto)
--   · La sede: `fn_puede_operar_ubicacion(p_ubicacion_id)` sigue delante. Un rol con Análisis NO elige otra tienda.
--   · El costo en Existencias (`fn_resumen_variantes`) sigue siendo solo del líder (20260923140000).
--   · Ni columnas, ni cálculos, ni la firma: la pantalla no cambia.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA PARTE
--   No toca tablas, ni políticas, ni disparadores (ver CLAUDE.md, «Políticas y deadlocks»): solo reemplaza una función
--   y su comentario. Idempotente: pegarla dos veces no hace nada la segunda. Todo va con `retail.` explícito, así que se
--   pega tal cual en el SQL Editor.
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_vivo(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise exception '% no existe en esta base: esta migración se escribió contra producción. Revisa qué cambió.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. El filtro ====================
-- `create or replace` conserva el oid: los permisos (grant a authenticated) y el comentario siguen donde estaban.
do $$
begin
  perform pg_temp.reemplazar_vivo('retail.fn_resumen_comparacion(uuid, date, date, date, date)',
    'fn_puede_operar_ubicacion(p_ubicacion_id) and fn_es_lider() as ok',
    'fn_puede_operar_ubicacion(p_ubicacion_id) and retail.fn_puede_analizar() as ok',
    1);
end $$;

-- ==================== 2. El comentario ====================
-- Se reemplaza solo la frase de permisos: el resto del comentario lo escribió ADR-0202 y sigue siendo cierto.
do $$
declare
  v_firma constant regprocedure := 'retail.fn_resumen_comparacion(uuid, date, date, date, date)'::regprocedure;
  v_actual text := obj_description(v_firma, 'pg_proc');
  v_nuevo constant text := 'El líder, o un rol con el módulo Análisis (fn_puede_analizar, ADR-0161 P5), y solo para una sede que puede operar (fn_puede_operar_ubicacion): ahí ve también el costo de lo vendido.';
begin
  if v_actual is null or position(v_nuevo in v_actual) > 0 then
    return;
  end if;
  if position('Solo líderes.' in v_actual) = 0 then
    raise notice 'El comentario de fn_resumen_comparacion ya no dice «Solo líderes.»: se deja como está.';
    return;
  end if;
  execute format('comment on function retail.fn_resumen_comparacion(uuid, date, date, date, date) is %L',
    replace(v_actual, 'Solo líderes.', v_nuevo));
end $$;

-- ==================== 3. Verificación ====================
do $$
declare
  v_def text := pg_get_functiondef('retail.fn_resumen_comparacion(uuid, date, date, date, date)'::regprocedure);
  v_oid oid := 'retail.fn_resumen_comparacion(uuid, date, date, date, date)'::regprocedure;
begin
  if position('fn_puede_analizar()' in v_def) = 0 or position('and fn_es_lider() as ok' in v_def) > 0 then
    raise exception 'fn_resumen_comparacion no quedó con el candado de Análisis (fn_puede_analizar)';
  end if;
  if position('fn_puede_operar_ubicacion(p_ubicacion_id)' in v_def) = 0 then
    raise exception 'fn_resumen_comparacion perdió el candado de sede: un rol con Análisis solo mira SU sede';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'retail' and p.proname = 'fn_resumen_comparacion') <> 1 then
    raise exception 'Hay más de una fn_resumen_comparacion: la llamada de la pantalla quedaría ambigua';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'fn_resumen_comparacion dejó de ser security definer';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') or has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'fn_resumen_comparacion cambió de permisos: authenticated ejecuta, anon no';
  end if;
end $$;
