-- ============================================================================
-- 20261015004000_cola_arranque_exige_cuadre.sql — CAYLA V2 (ADR-0334, act. 2026-10-14 A6; Felipe 2026-10-14: estricto)
-- Cerrar la cola de arranque en bloque exige un cuadre del piso de esa sede guardado DESPUÉS de la última venta que se cierra.
--
-- EL PROBLEMA. Cerrar en bloque deja las ventas «sin prenda» y sin mover stock (ADR-0334, decisión 1). Si la prenda vendida SÍ estaba en
-- el sistema, queda con una unidad de más hasta que alguien la cuente, y el conteo la registra como pérdida (ADR-0334, «Lo que queda
-- abierto»; auditoría del ERP 2026-10-13: 647 cerradas sin prenda y `cuadres_piso` = 0 en las tres tiendas). Se enterraba sin contar.
--
-- LA DECISIÓN (Felipe, 2026-10-14, opción estricta): sin cuadre no se cierra en bloque. Un cuadre del piso (`cuadrar_piso`, ADR-0328)
-- guardado después de la última venta que entra al cierre (`p_hasta`, el corte que vio el líder) garantiza que lo que sí estaba en el
-- sistema ya quedó cuadrado antes de dar el resto por perdido. Hasta entonces se regulariza una por una o con sugerencias.
--
-- QUÉ HACE. Una guarda más en `cerrar_cola_arranque`, después del plazo: `exists cuadres_piso (sede, created_at >= p_hasta)`, o
-- `cola_sin_cuadre` con la salida en el hint. Se mide con `created_at` (cuándo se guardó el cuadre), que es lo que la pantalla puede
-- leer (`fn_cuadre_piso_estado.cuadrado_en`): base y pantalla dicen lo mismo. Reemplazo anclado: la función vive en producción
-- (md5 09a2cb78…, idéntico al repo el 2026-10-14) y así no se pisa un parche vivo.
--
-- NO CAMBIA: regularizar una venta, identificar con sugerencias y reabrir una cerrada no piden cuadre. El plazo sigue igual (A0).
--
-- PRODUCCIÓN: solo el reemplazo de una función; sin tablas, políticas ni `drop trigger`. Ya lleva `retail.`. Se puede pegar dos veces.
-- SE ROMPE SI: alguien vuelve a pegar 20261005100100 desde el archivo (recrea la función sin esta guarda): `cola_arranque.mjs` lo cubre.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Reemplazo anclado (el mismo helper de 20261010233000) ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo de abajo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Sin cuadre después de la última venta, no se cierra en bloque ----------
select pg_temp.reemplazar_anclado(
  'retail.cerrar_cola_arranque(uuid, timestamptz, text, text)',
  $v$    raise exception 'cola_plazo_vencido' using hint = 'El plazo para cerrar la cola de esta tienda ya venció';
  end if;
$v$,
  $n$    raise exception 'cola_plazo_vencido' using hint = 'El plazo para cerrar la cola de esta tienda ya venció';
  end if;
  -- ADR-0334 (act. 2026-10-14, A6; Felipe: estricto): cerrar en bloque entierra sin contar. Solo con un cuadre del piso de esta sede
  -- guardado DESPUÉS de la última venta que se cierra (p_hasta): lo que sí estaba en el sistema ya quedó cuadrado antes de darla por perdida.
  if not exists (select 1 from cuadres_piso c where c.ubicacion_id = p_ubicacion_id and c.created_at >= p_hasta) then
    raise exception 'cola_sin_cuadre'
      using hint = 'Primero cuadra el piso de esta tienda (Existencias ▸ Cuadrar el piso) después de la última venta sin registrar: cerrar sin contar entierra las prendas que sí están en el sistema';
  end if;
$n$
);

comment on function retail.cerrar_cola_arranque(uuid, timestamptz, text, text) is
  'ADR-0334: un líder cierra en bloque las ventas sin registrar pendientes de una sede (hasta p_hasta), sin identificar la prenda y sin mover stock. Dentro del plazo de cola_arranque_plazo y solo con un cuadre del piso guardado después de p_hasta (act. 2026-10-14). Devuelve el id del cierre.';

-- ---------- 2. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_def text := pg_get_functiondef('retail.cerrar_cola_arranque(uuid, timestamptz, text, text)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, 'cola_sin_cuadre', ''))) / length('cola_sin_cuadre') <> 1 then
    raise exception 'cola de arranque: la guarda del cuadre tiene que quedar exactamente una vez';
  end if;
  if position('cola_plazo_vencido' in v_def) = 0 then
    raise exception 'cola de arranque: se perdió la guarda del plazo';
  end if;
end
$v$;

reset lock_timeout;
