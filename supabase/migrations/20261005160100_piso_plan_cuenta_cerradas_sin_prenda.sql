-- ============================================================================
-- 20261005160100_piso_plan_cuenta_cerradas_sin_prenda.sql — CAYLA V2 · ADR-0328 act. 7 × ADR-0334 («Contrato para quien escriba el
-- motor del piso»). El motor del piso cuenta las ventas «sin registrar» cerradas sin prenda igual que las pendientes: la anotada
-- cuenta mientras no tenga prenda.
--
-- HISTORIA DE ESTE ARCHIVO. Se pegó en producción el 2026-10-05 como un `create or replace` completo (commit 39add9f8), antes del
-- primer cierre de cola. El 2026-10-12, al traer `main` al PR #806:
--   · RENOMBRADA desde 20261005160000: esa versión la tomó también `20261005160000_movimientos_colgada_y_guardada.sql`, ya en main.
--   · REESCRITA como reemplazos anclados: `20261010232000` (bolsas de despacho) le sumó a esta función el filtro de familias apagadas,
--     y el CI aplica las migraciones de un PR DESPUÉS de las de main (`scripts/migraciones/huellas-del-pr.mjs`). Un `create or replace`
--     completo borraba ese filtro (y su guarda lo frenaba, con lo que el CI no corría). Anclada, el orden deja de importar: cambia
--     solo sus cuatro tramos, en cualquier cuerpo que los tenga, y conserva todo lo demás. El efecto sobre el cuerpo de 2026-10-05
--     es el mismo, letra por letra (misma huella), así que lo que corrió en producción no cambia.
--
-- EL PROBLEMA PRIMERO. `retail.fn_piso_plan_lectura` (20261004213000, PR #787) contaba lo anotado a mano «sin registrar» solo si su
-- fila de `prendas_por_regularizar` estaba `pendiente`. El PR #800 (ADR-0334) agregó otro estado: `cerrada_sin_prenda` —un líder
-- cierra en bloque las anotadas de arranque de una tienda que ya nadie va a identificar—. La venta fue real: se cobró y el cliente
-- se llevó una prenda de esa categoría, talla y color. Pero con el filtro de 20261004213000, al cerrarla desaparecía de la lectura:
-- AQP vende casi todo «sin registrar» (169 de 170 ventas en 14 días), y el día en que cerrara su cola su velocidad caería a la de lo
-- escaneado —casi cero—, la señal para el Taller se apagaría y la lista del día perdería «primero lo vendido ayer». Ninguna pantalla
-- daría error: solo diría, en silencio, que AQP dejó de vender.
--
-- QUÉ CAMBIA. Cuatro tramos del cuerpo, nada más: los dos filtros `p.estado = 'pendiente'` pasan a
-- `p.estado in ('pendiente', 'cerrada_sin_prenda')` —en `por_atributo` (lo vendido por categoría × talla × familia de color: la señal
-- para el Taller y el ritmo de la lista del día) y en `anotadas_recientes` (el reloj rápido de hoy y ayer)— y los comentarios de esos
-- dos CTE lo dicen. Y el `comment on function`. Lo demás lo explica la cabecera de 20261004213000.
--
-- POR QUÉ NO CUENTA DOS VECES. Una venta anotada cae en UNA de dos ramas según a dónde apunta su línea de venta: a la centinela
-- (rama de las anotadas) o a la prenda real (rama de las escaneadas). `cerrar_cola_arranque` cambia el estado de la fila de la cola y
-- nada más: no toca `venta_items` ni escribe en `movimientos`, así que la línea sigue en la centinela y cae solo en la rama de las
-- anotadas. Una `regularizada` ya pasó a la prenda real (`regularizar_prenda` reescribe la línea) y sigue fuera de este filtro. Una
-- cerrada que se reabre (`reabrir_prenda_cerrada`) vuelve a `pendiente`: cuenta igual, una vez; si después se regulariza, pasa a
-- escaneada en el día en que se cobró. Una `anulada` sigue sin contar (y su venta ya no está `completada`).
--
-- CONTRATO (qué promete y qué asume).
--   PROMETE lo mismo que 20261004213000, con un cambio: «la anotada a mano cuenta solo MIENTRAS está pendiente» pasa a «la anotada
--     cuenta mientras no tenga prenda» (pendiente o cerrada sin prenda).
--   ASUME, además de lo de 20261004213000, que `cerrar_cola_arranque` no reescribe la línea de venta ni mueve stock (ADR-0334:
--     «sin prenda, sin movimiento de stock») y que reabrir devuelve la fila a `pendiente`. Las pruebas A8 y A10 lo vigilan.
--
-- ESTADO QUE DEJA DE SER POSIBLE. Una tienda que, en la lectura del motor, deja de vender el día en que su líder cierra la cola de
-- arranque, sin que ninguna venta haya cambiado. Y, por ser anclada: un cambio que otra migración (o una mano) le hizo a esta función
-- en OTRO lugar, borrado en silencio por volver a pegar este archivo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Ya está pegada (2026-10-05) y volver a pegarla no cambia nada: cada reemplazo ve que su texto nuevo ya
-- está y no hace nada. Una sola parte, sin políticas ni `alter` de tablas (ADR-0195), sin `select … into` entre comillas (ADR-0288),
-- con `retail.` en todo. Si un texto ancla no aparece las veces que espera, se detiene SIN TOCAR NADA: la función cambió justo ahí, y
-- hay que mirarla antes. Consulta, solo lectura:
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure;
-- Lo que deja depende del cuerpo sobre el que se aplica (eso es ser anclada):
--   sobre el de 20261004213000 sola (`faff73d2a6db4c0692775c1f6d6e284d`)
--     → `33dfc4b19e7ab14410a14b2cb7bc50c5` (el cuerpo de este archivo sobre 20261004213000; lo que se pegó el 2026-10-05).
--   sobre producción hoy (con el filtro de familias de 20261010232000 encima)
--     → `3b9b7a08568bcc0484b095347bd4bc1a`, sin cambios: ya estaba aplicada (medido en producción el 2026-10-12).
--
-- SE ROMPE SI alguien cambia `cerrar_cola_arranque` para que le ponga una prenda a la línea o escriba una salida en el libro (la venta
-- contaría dos veces: en la rama escaneada y en la anotada; A8 lo vigila); si la cola gana otro estado «vendida y sin prenda» (este
-- `in` no lo vería: hay que sumarlo en una migración nueva y en la prueba); o si una migración posterior reescribe la función entera
-- copiando 20261004213000: volverían el filtro viejo y el comentario viejo (`pnpm pruebas:piso-plan`, A8 y A9, lo dice).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: la función tiene que existir. Si falta, se detiene sin tocar nada.
do $g$
begin
  if to_regprocedure('retail.fn_piso_plan_lectura(uuid)') is null then
    raise exception 'Falta retail.fn_piso_plan_lectura(uuid): pega antes 20261004213000_piso_plan_lectura.sql.';
  end if;
end
$g$;

-- Reemplazo anclado (el mismo ayudante de 20261010100100 y 20261010232000): falla SIN TOCAR NADA si la función cambió justo donde
-- se ancla, y es re-ejecutable (si el texto nuevo ya está, no hace nada).
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Los dos filtros: la anotada cuenta mientras no tenga prenda (en `por_atributo` y en `anotadas_recientes`).
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$        and p.estado = 'pendiente'$v$,
  $v$        and p.estado in ('pendiente', 'cerrada_sin_prenda')$v$,
  2);

-- 2. El comentario de `por_atributo`.
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$      -- caja, solo mientras sigue pendiente. Una línea de la centinela regularizada no existe: `regularizar_prenda` la movió a
      -- la prenda real y cae en la primera rama.$v$,
  $v$      -- caja, mientras no tenga prenda: pendiente, o cerrada sin prenda por el cierre de arranque (ADR-0334), que no le pone
      -- prenda ni la saca del libro, así que su línea sigue en la centinela. Una línea de la centinela regularizada no existe:
      -- `regularizar_prenda` la movió a la prenda real y cae en la primera rama.$v$,
  1);

-- 3. El comentario del reloj rápido (`anotadas_recientes`).
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$      -- El reloj rápido para lo anotado a mano: lo vendido «sin registrar» HOY y AYER que sigue pendiente, por categoría × talla ×$v$,
  $v$      -- El reloj rápido para lo anotado a mano: lo vendido «sin registrar» HOY y AYER que sigue sin prenda (pendiente o cerrada sin
      -- prenda: cerrar la cola no cambia lo que se vendió ayer), por categoría × talla ×$v$,
  1);

-- Validación: quedan los dos filtros nuevos y ninguno viejo. Si no, se detiene (y el SQL Editor no aplica nada: una transacción).
do $c$
declare
  v_src text := (select p.prosrc from pg_proc p where p.oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure);
begin
  if (length(v_src) - length(replace(v_src, $t$p.estado in ('pendiente', 'cerrada_sin_prenda')$t$, ''))) / length($t$p.estado in ('pendiente', 'cerrada_sin_prenda')$t$) <> 2
     or position($t$p.estado = 'pendiente'$t$ in v_src) > 0 then
    raise exception 'retail.fn_piso_plan_lectura no quedó con los dos filtros de «la anotada cuenta mientras no tenga prenda».';
  end if;
end
$c$;

comment on function retail.fn_piso_plan_lectura(uuid) is
  'ADR-0328 act. 7: las entradas crudas del motor del piso de UNA sede, en un jsonb: tallas (lo libre en piso y almacén de '
  'fn_existencias_base, con categoría, talla, color, familia y lo vendido escaneado hoy/ayer/14 días), ventas de 14 días por '
  'categoría × talla × familia de color (escaneadas + anotadas sin registrar: la anotada cuenta mientras no tenga prenda, '
  'pendiente o cerrada sin prenda por ADR-0334; cada venta cuenta una vez, en el día en que se cobró) y las tallas de cada '
  'categoría. No decide nada (lo decide apps/web/lib/piso-plan.ts). Solo lectura; unidades, sin soles. Puerta: '
  'fn_tiene_acceso_retail(); sin ella devuelve NULL.';

revoke all on function retail.fn_piso_plan_lectura(uuid) from public, anon;
grant execute on function retail.fn_piso_plan_lectura(uuid) to authenticated, service_role;
