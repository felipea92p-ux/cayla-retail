-- ============================================================================
-- 20261027174000_cola_arranque_exige_cuadre_en_main.sql — CAYLA V2 (ADR-0534, act. 2026-10-27 · ADR-0334 act. 2026-10-14, A6)
--
-- EL PROBLEMA PRIMERO. Producción tiene desde el 2026-10-14 un candado en `cerrar_cola_arranque` que main no tiene: cerrar en bloque las
-- ventas sin registrar de una tienda exige un cuadre del piso guardado DESPUÉS de la última venta que se cierra (`cola_sin_cuadre`). Se
-- pegó con el OK de Felipe desde el PR #1094 (`20261015004000_cola_arranque_exige_cuadre.sql`, registrada allá como `20261015000109`), y
-- ese PR nunca se fusionó. Una base nueva (el CI, un local) quedaba sin el candado, y el check «SQL pegado» de cualquier PR que toque esta
-- función veía a producción «con otra versión».
--
-- LA DECISIÓN (Felipe, 2026-10-27: «trae a este PR el candado que ya vive en producción»). Esta migración deja `cerrar_cola_arranque`
-- en main IGUAL a la de producción: el mismo bloque, con el mismo texto. Solo el candado; lo demás de #1094 (anular la venta con la baja
-- pedida, el plazo de la cola que sigue a la carga inicial) sigue en ese PR.
--
-- CONTRATO
--   PROMETE: después de pegarla, `cerrar_cola_arranque` rechaza con `cola_sin_cuadre` si la sede no tiene un cuadre con
--            `created_at >= p_hasta`. Idempotente: si el candado ya está (producción), no toca nada.
--   ASUME:   la función con el ancla de `cola_plazo_vencido` una sola vez (main y producción la tienen).
--   NO HACE: no cambia regularizar ni reabrir (no piden cuadre); no cambia la tabla de cuadres.
--
-- DESCARTÉ
--   · Declarar la diferencia «conocida» en `scripts/migraciones/deriva.mjs`: diría «está bien así» de un candado que main no tiene.
--   · Fusionar #1094 antes: está sin tocar desde el 15-oct y trae otros cambios que no son de esta obra.
--
-- CÓMO SE PEGA. No hace falta pegarla: producción ya tiene el candado (si se pega, no cambia nada). Una parte, sin políticas ni `alter`.
-- ============================================================================
set lock_timeout = '3s';

do $do$
declare
  v_def text := pg_get_functiondef('retail.cerrar_cola_arranque(uuid, timestamptz, text, text)'::regprocedure);
  v_ancla constant text := $v$    raise exception 'cola_plazo_vencido' using hint = 'El plazo para cerrar la cola de esta tienda ya venció';
  end if;
$v$;
  v_nuevo constant text := $n$    raise exception 'cola_plazo_vencido' using hint = 'El plazo para cerrar la cola de esta tienda ya venció';
  end if;
  -- ADR-0334 (act. 2026-10-14, A6; Felipe: estricto): cerrar en bloque entierra sin contar. Solo con un cuadre del piso de esta sede
  -- guardado DESPUÉS de la última venta que se cierra (p_hasta): lo que sí estaba en el sistema ya quedó cuadrado antes de darla por perdida.
  if not exists (select 1 from cuadres_piso c where c.ubicacion_id = p_ubicacion_id and c.created_at >= p_hasta) then
    raise exception 'cola_sin_cuadre'
      using hint = 'Primero cuadra el piso de esta tienda (Existencias ▸ Cuadrar el piso) después de la última venta sin registrar: cerrar sin contar entierra las prendas que sí están en el sistema';
  end if;
$n$;
  v_n integer;
begin
  -- Ya está (producción desde el 2026-10-14): nada que hacer.
  if position('cola_sin_cuadre' in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_n <> 1 then
    raise exception 'cerrar_cola_arranque cambió: el ancla de cola_plazo_vencido aparece % veces (se esperaba 1)', v_n;
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end;
$do$;
