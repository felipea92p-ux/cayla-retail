-- ============================================================================
-- 20261004200050_cuadre_piso_frescura.sql — CAYLA V2 · ADR-0328 decisión técnica 4 + ADR-0208 «Frescura del piso»
-- PARTE 2 de 4: Frescura no lee el cuadre del piso como bajadas de hoy. Va DESPUÉS de 20261004200000 (las tablas) y ANTES
-- de 20261004200100 (las funciones): así `cuadrar_piso` nunca existe sin esta protección. Si esta parte aborta (un cuerpo
-- vivo distinto), la de funciones tampoco entra: su guarda exige que Frescura ya conozca el cuadre. Antes iba al final
-- (200200) y un aborto aquí dejaba cuadrar con Frescura leyendo cada prenda bajada como una «bajada» de hoy, algo que ya
-- no se arregla después porque el cuadre no se edita (revisión adversarial, 2026-10-04).
--
-- EL PROBLEMA PRIMERO. El cuadre escribe traslados internos de verdad (almacén → piso con `mover_interno`), y Frescura
-- reconoce las bajadas POR ESTRUCTURA: todo traslado almacén→piso de una sede es una «bajada» y todo piso→almacén un
-- «retiro» (`fn_bajadas_del_piso_nucleo`, CTE `internos`). Sin esto, el cuadre de TRU crearía unas 435 «bajadas» en el
-- mismo instante y:
--   · la confianza del registro saltaría a «sólido» con casi 1,0 en el mes del cuadre (cientos de bajadas sin tardías),
--     tapando el hábito real (en septiembre TRU tuvo 25 bajadas y 1 tardía);
--   · lo que se venda en los 10 minutos siguientes saldría «tardía», y una bajada real cercana a una subida del cuadre
--     quedaría «corregida» (la regla del retiro más cercano);
--   · cada prenda que el cuadre cuelga saldría «Nueva» con el reloj en 0 (su bajada llega con la marca 2, no con la 6) y
--     entraría a la vara de su categoría como si llevara 0 días: las DEMÁS parecerían más viejas y crecería «Por decidir».
--     ADR-0248 descartó exactamente eso para la carga inicial.
--
-- QUÉ HACE (tres cambios; los dos primeros hacen falta juntos: uno sin el otro deja la mitad sucia).
--   1. `fn_bajadas_del_piso_nucleo`: el CTE `internos` deja fuera los movimientos que son de un cuadre
--      (`not exists … cuadre_piso_items ci where ci.movimiento_id = m.id`). El cuadre no es ni bajada ni retiro: queda
--      fuera de la confianza, de las tardías, de «corregida» y del «piso de antes», en las tres lecturas que usan el
--      núcleo a la vez (fn_frescura_sede, fn_confianza_registro, fn_bajadas_del_piso). El NIVEL del libro sí lo incluye:
--      es la verdad de cuánto hay colgado.
--   2. `fn_frescura_sede`: la bajada del cuadre lleva la marca 4 («edad desconocida»), igual que la bajada de la carga
--      inicial: `v_cuadre` (los movimiento_id de cuadre_piso_items de la sede en la ventana, armado UNA vez, como
--      `v_carga`) entra al CASE de las marcas. Nunca sale «Nueva», no entra a la vara y se lee «al menos N días». La
--      subida al almacén no lleva la 4 (es una pausa; `delta <= 0` ya da 0).
--   3. `fn_frescura_sede`: TODA fila del cuadre lleva además la marca 8 (bajada: 2 + 4 + 8 = 14; subida: 2 + 8 = 10). La
--      web (`frescura-reglas.ts`, MARCA_CUADRE) saca de ahí los instantes del cuadre de la sede y corta en ellos la ventana
--      de cada «Ya decidí» que lo cruza (`frescura-decisiones-reglas.ts`, cortadaPor «cuadre»): una medida que mezcla el
--      piso de antes del cuadre (subcontado) con el de después saldría «no alcanzó» por el registro, no por la venta
--      (revisión adversarial, 2026-10-04). Quien lee las marcas con `&` no cambia: un bit desconocido no se mira.
-- El vínculo es la llave foránea del ítem (PARTE 1), nunca el motivo ni la nota: una nota no es una marca.
--
-- CÓMO SE HACE: REEMPLAZO ANCLADO, CON GUARDA DE md5. Las dos funciones viven en producción y otras migraciones las
-- vigilan por md5. Reescribirlas desde un archivo borraría un parche en vivo (le pasó a Análisis con el PR 397). Por eso:
--   · Antes de tocar nada, el md5 del cuerpo vivo de cada una tiene que ser el de su migración vigente (el de producción,
--     documentado en 20260929100000: núcleo fcfd2c4b2c4f24dd2184eb2cd7a12678, fn_frescura_sede
--     a22655be615d72555032a7df98258876; medido IGUAL en una base desechable con todas las migraciones de main, 2026-10-04)
--     o el que deja este archivo. Con cualquier otro, aborta sin cambiar nada: alguien la parchó en vivo.
--   · `pg_temp.reemplazar_anclado` cambia un texto que debe aparecer UNA sola vez; si el texto nuevo ya está, no hace nada
--     (re-pegable). Al final se exige el md5 esperado DESPUÉS (abajo): si no da exacto, se deshace todo.
--   · Sin `select … into` dentro de los textos de reemplazo (ADR-0288: el SQL Editor agrega líneas por su cuenta).
--     `v_cuadre` se arma con una asignación `v := (select …)`.
--
-- md5 DESPUÉS de esta migración (medidos en la base desechable; son los que tiene que dar producción):
--   fn_bajadas_del_piso_nucleo  7d9fdf39200eea93254ec1d9100da549
--   fn_frescura_sede            e64a3742e5f06a2e18b9d7749b720b3d
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual, DESPUÉS de 20261004200000 y ANTES de 20261004200100. Solo
-- `create or replace function`
-- (por dentro de `execute`): no toma las tablas de auth/storage (ADR-0195), sin políticas ni `drop trigger`. Idempotente.
-- Pegarla antes de que exista ningún cuadre no cambia ninguna cifra de Frescura (no hay ítems que excluir ni marcar).
-- Verificación (solo lectura):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
--      and proname in ('fn_bajadas_del_piso_nucleo', 'fn_frescura_sede') order by 1;     → los dos md5 «después»
--
-- SE ROMPE SI alguien vuelve a pegar una migración anterior de Frescura (20260928120200 o 20260929100000): su propia
-- guarda aborta porque ya no reconoce el md5, y no deshace nada — es lo que debe pasar. O si alguien reescribe
-- fn_frescura_sede o el núcleo copiando una migración anterior sin estas dos líneas: vuelve a leer el cuadre como bajadas
-- (lo vigila pruebas:cuadrar-piso, «Frescura: el cuadre no es bajada» y «la bajada del cuadre llega con 6»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está (se mira primero: en la declaración, el texto nuevo contiene al viejo).
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

do $$
declare
  -- Los md5 de ANTES (producción y main, 2026-10-04) y de DESPUÉS (este archivo), del cuerpo de cada función.
  c_nucleo_antes constant text := 'fcfd2c4b2c4f24dd2184eb2cd7a12678';
  c_nucleo_despues constant text := '7d9fdf39200eea93254ec1d9100da549';
  c_sede_antes constant text := 'a22655be615d72555032a7df98258876';
  c_sede_despues constant text := 'e64a3742e5f06a2e18b9d7749b720b3d';
  v_nucleo text;
  v_sede text;
begin
  if to_regclass('retail.cuadre_piso_items') is null or to_regclass('retail.cuadres_piso') is null then
    raise exception 'Faltan las tablas del cuadre: pega antes 20261004200000_cuadre_piso_tablas.sql';
  end if;
  v_nucleo := (select md5(p.prosrc) from pg_proc p
                where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'));
  v_sede := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)'));
  if v_nucleo is null or v_nucleo not in (c_nucleo_antes, c_nucleo_despues) then
    raise exception 'fn_bajadas_del_piso_nucleo tiene otro cuerpo (md5 %): no es el de 20260928120200 (%) ni el de este archivo. Alguien la cambió en vivo: reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_nucleo, 'ninguno'), c_nucleo_antes;
  end if;
  if v_sede is null or v_sede not in (c_sede_antes, c_sede_despues) then
    raise exception 'fn_frescura_sede tiene otro cuerpo (md5 %): no es el de 20260929100000 (%) ni el de este archivo. Alguien la cambió en vivo: reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_sede, 'ninguno'), c_sede_antes;
  end if;
end $$;

-- 1. El núcleo: el cuadre no es ni bajada ni retiro.
select pg_temp.reemplazar_anclado(
  'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)',
  $v$       and m.variante_id <> c_centinela
  ),$v$,
  $n$       and m.variante_id <> c_centinela
       -- El cuadre del piso (ADR-0328) no es ni bajada ni retiro: sus filas se reconocen por su ítem, no por la nota.
       and not exists (select 1 from retail.cuadre_piso_items ci where ci.movimiento_id = m.id)
  ),$n$
);

-- 2. fn_frescura_sede: la bajada del cuadre lleva la marca 4, como la de la carga inicial.
select pg_temp.reemplazar_anclado(
  'retail.fn_frescura_sede(uuid, integer)',
  $v$  v_carga jsonb;
$v$,
  $n$  v_carga jsonb;
  v_cuadre jsonb;
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.fn_frescura_sede(uuid, integer)',
  $v$  -- UNA llamada al libro (ADR-0202) con la lista de prendas: sus puntos de PISO, con las marcas.$v$,
  $n$  -- Lo que movió el cuadre del piso (ADR-0328), por su ítem (llave foránea al movimiento), armado una sola vez, como
  -- `v_carga`. Lo que bajó del almacén llega con edad desconocida (4), como la bajada de la carga inicial; toda fila del
  -- cuadre lleva además la 8, y la web corta ahí la medida de «Ya decidí» (antes y después, el piso se cuenta distinto).
  v_cuadre := (select coalesce(jsonb_object_agg(ci.movimiento_id, true), '{}'::jsonb)
                 from retail.cuadre_piso_items ci
                 join retail.cuadres_piso cp on cp.id = ci.cuadre_id
                where cp.ubicacion_id = p_ubicacion_id and cp.created_at >= v_desde);

  -- UNA llamada al libro (ADR-0202) con la lista de prendas: sus puntos de PISO, con las marcas.$n$
);

select pg_temp.reemplazar_anclado(
  'retail.fn_frescura_sede(uuid, integer)',
  $v$case when v_carga ? pt.oid::text then 4 else 0 end$v$,
  $n$case when v_carga ? pt.oid::text or v_cuadre ? pt.oid::text then 4 else 0 end$n$
);

-- 3. fn_frescura_sede: toda fila del cuadre (baje o suba) lleva la marca 8. La 4 de arriba solo llega a lo que SUBE al
--    piso (con `delta <= 0` ya da 0): lo que el cuadre sube al almacén queda en 2 + 8.
select pg_temp.reemplazar_anclado(
  'retail.fn_frescura_sede(uuid, integer)',
  $v$               + (case when pt.es_interno then 2 else 0 end)
$v$,
  $n$               + (case when pt.es_interno then 2 else 0 end)
               + (case when v_cuadre ? pt.oid::text then 8 else 0 end)  -- una fila del cuadre del piso (ADR-0328)
$n$
);

-- Lo que quedó tiene que ser EXACTAMENTE lo medido: si no, se deshace todo (el SQL Editor corre el archivo en una
-- transacción).
do $$
declare
  v_nucleo text := (select md5(p.prosrc) from pg_proc p
                     where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'));
  v_sede text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)'));
begin
  if v_nucleo <> '7d9fdf39200eea93254ec1d9100da549' or v_sede <> 'e64a3742e5f06a2e18b9d7749b720b3d' then
    raise exception 'El reemplazo no dejó los cuerpos esperados (núcleo %, fn_frescura_sede %). No se aplicó nada.', v_nucleo, v_sede;
  end if;
end $$;

notify pgrst, 'reload schema';

reset lock_timeout;
