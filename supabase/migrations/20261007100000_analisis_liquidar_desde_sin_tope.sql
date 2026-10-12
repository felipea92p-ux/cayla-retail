-- ============================================================================
-- 20261007100000 — Análisis: «Liquidar desde» sin tope, de 1 a 999 días (ADR-0357, decisión 5, act. 2026-10-07)
--
-- EL PROBLEMA PRIMERO. «Liquidar desde» iba de 30 a 85 días: era una barra en el carril «Días sin venderse», y la base (el check de
--   `parametros_analisis` y `guardar_liquidar_desde`) rechazaba cualquier otro número. Felipe (2026-10-07): «no debería existir un
--   tope, se debe poder colocar los días que se quiera». La barra pasa a ser una caja con − y +, y el número puede ser cualquiera.
--
-- LAS REGLAS
--   · De 1 a 999 días. 0 sería liquidar todo lo que no se vendió hoy, y un número de más de tres cifras no es un número de trabajo
--     (999 días son casi tres años): es el único freno, y la web lo dice con la misma frase.
--   · Todo lo demás de 20261006216000 sigue igual: una sola fila para toda la red, quién lo cambia (quien ve Análisis), la firma con
--     el responsable y el antes y el después en `configuracion_historial`.
--
-- LO QUE CAMBIA: el check de la tabla (`parametros_analisis_liquidar_desde_rango`), el rango y la frase del rechazo de
--   `guardar_liquidar_desde` (misma firma: se reemplaza, no se crea otra) y los comentarios. `fn_liquidar_desde` no cambia: devuelve el
--   número guardado tal cual, sin recortarlo.
--
-- ESTADO IMPOSIBLE QUE SIGUE CERRADO: un «Liquidar desde» vacío, de 0 o negativo, o de cuatro cifras. El check lo impide en la tabla
--   y la función lo rechaza antes con su frase.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA EJECUCIÓN (con el OK de Felipe): un `alter` de `parametros_analisis` (una fila, que solo leen las
--   dos funciones de Análisis; nadie de la tienda la toma) y el `create or replace` de una función. No crea políticas ni toca
--   disparadores (no toma `auth` ni `storage`), así que no hay partes. Espera como mucho 3 s un candado. Se puede pegar dos veces
--   (idempotente). Lleva su `set search_path`: se pega tal cual.
-- SE ROMPE SI: la web nueva se publica antes de pegar esto. No se cae: con un número fuera de 30–85, «Guardar para todos» responde
--   «“Liquidar desde” va de 30 a 85 días» y no guarda; con uno dentro, guarda igual que hoy. Pegar ANTES de fusionar.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'parametros_analisis_liquidar_desde_rango';
--     → CHECK (((liquidar_desde >= 1) AND (liquidar_desde <= 999)))
--   select prosrc like '%p_dias < 1 or p_dias > 999%' from pg_proc where oid = 'retail.guardar_liquidar_desde(integer)'::regprocedure;
--     → t
--   select liquidar_desde from retail.parametros_analisis;  → el mismo de antes (60 si nadie lo cambió)
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El rango de la tabla: de 1 a 999 ----------
alter table retail.parametros_analisis drop constraint if exists parametros_analisis_liquidar_desde_rango;
alter table retail.parametros_analisis
  add constraint parametros_analisis_liquidar_desde_rango check (liquidar_desde between 1 and 999);
comment on column retail.parametros_analisis.liquidar_desde is
  'Desde cuántos días sin venderse una prenda quieta pasa de «Vigílalas» a «Liquidar» en «No se vende» (1 a 999; 60 de fábrica). El mismo para toda la red: lo cambia quien ve Análisis (Felipe, 2026-10-06; sin tope de 30 a 85 desde el 2026-10-07).';

-- ---------- 2. Guardar: el mismo de 20261006216000, con el rango nuevo ----------
-- PROMETE: con 1 a 999 días, deja ese valor para toda la red, firmado con el responsable, y su antes/después en
--   configuracion_historial; devuelve el valor guardado. Si ya era ese, no escribe nada (ni historial). Dos personas guardando a
--   la vez se ordenan por el candado de la fila: el «antes» de la segunda es lo que guardó la primera.
-- RECHAZA: sin Análisis (42501, analisis_sin_modulo); fuera de 1–999 (P0001, liquidar_desde_fuera_de_rango); sin responsable
--   presente donde se exige (los 42501 de fn_actor_persona_id).
create or replace function retail.guardar_liquidar_desde(p_dias integer)
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_antes smallint;
begin
  if not coalesce(retail.fn_puede_analizar(), false) then
    raise exception 'Para cambiar desde cuándo se liquida necesitas Análisis en tu rol.' using errcode = '42501', hint = 'analisis_sin_modulo';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 999 then
    raise exception '«Liquidar desde» va de 1 a 999 días.' using errcode = 'P0001', hint = 'liquidar_desde_fuera_de_rango';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  -- La fila es una sola y se toma con candado: si faltara, se recrea con el valor de fábrica.
  insert into retail.parametros_analisis (id) values (true) on conflict (id) do nothing;
  select p.liquidar_desde into v_antes from retail.parametros_analisis p where p.id for update;
  if v_antes = p_dias then
    return p_dias;
  end if;

  update retail.parametros_analisis
     set liquidar_desde = p_dias, actualizado_por = v_actor, actualizado_en = now()
   where id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('liquidar_desde', jsonb_build_object('antes', v_antes, 'despues', p_dias), v_actor);
  return p_dias;
end;
$$;
comment on function retail.guardar_liquidar_desde(integer) is
  'Análisis (ADR-0357): cambia «Liquidar desde» (1 a 999 días) para TODAS las tiendas y personas. Quien ve Análisis (fn_puede_analizar); firma con el responsable (fn_actor_persona_id(true)); antes/después en configuracion_historial (que = liquidar_desde). Mismo valor = no escribe. Devuelve el valor guardado. Hints: analisis_sin_modulo, liquidar_desde_fuera_de_rango.';

reset lock_timeout;
notify pgrst, 'reload schema';
