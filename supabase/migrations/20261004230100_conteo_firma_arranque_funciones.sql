-- ============================================================================
-- 20261004230100_conteo_firma_arranque_funciones.sql — CAYLA V2 · Inventario ▸ Conteo I (ADR-0328, actividad 15)
-- PARTE 2 de 2: las funciones. Requiere 20261004230000_conteo_firma_arranque_columnas.sql (parte 1).
--
-- EL PROBLEMA PRIMERO. Ver la parte 1: desde una terminal, el cierre de un conteo y la recepción de un traslado quedan sin
-- persona; el primer conteo completo de una sede se cuenta como pérdida; y «Aplicar todos completos» infla la exactitud.
--
-- QUÉ HACE
--   1. FIRMA UNA VEZ POR OPERACIÓN. `fn_firma_heredada` decide quién firma un paso que llega SIN nombre desde una terminal (las
--      acciones soltadas del combo, ADR-0280): la última persona que firmó ESA operación, si lo hizo HOY (día de Lima); si fue
--      otro día o nunca hubo nombre, corta con «Elige quién hace esta operación» (hint `responsable_requerido`) y la pantalla
--      pregunta UNA vez. Con el nombre de una persona (sesión propia o combo) firma ella, como siempre.
--        · Conteo: la firma de la operación es quien lo abrió (`abierto_por`, `created_at`): por diseño (ADR-0282 b) quien abre
--          firma también cada cifra contada. `cerrar_conteo` la hereda.
--        · Traslado: `fn_firma_de_recepcion` lee y renueva `transferencias.recepcion_firmada_*` en cada paso de recibir
--          (`registrar_recepcion_traslado`, `confirmar_traslado`, `cerrar_traslado_con_diferencia`).
--      Resultado: ningún conteo cerrado ni traslado recibido desde una terminal queda sin persona. `fn_actor_persona_id` NO
--      cambia y las claves `conteo_cerrar` y `traslado_recibir` siguen en `acciones_sin_responsable`: ahora significan «este
--      paso no pregunta; la base pone el nombre de la operación».
--   2. CONTEO DE ARRANQUE. `fn_conteo_arranque_pendiente` dice si un lugar (piso, almacén o toda la ubicación) nunca tuvo un
--      conteo de TODO el lugar cerrado sin pendientes. `cerrar_conteo` marca `es_arranque` y escribe sus ajustes con el motivo
--      `conteo_arranque` cuando el conteo es de todo el lugar, se cierra sin pendientes y el lugar todavía no tenía uno.
--      `fn_es_merma` NO lo cuenta (su lista de motivos es cerrada: merma, conteo, conteo_fisico; no hace falta tocarla) y
--      Finanzas (`fn_asientos`) no lo asienta como 659. `fn_conteo_lineas_json` lo suma como ajuste del cierre (la nota de
--      «Corregir conteo» sigue cuadrando) y Actividad no lo anota como «ajustó stock» (el cierre ya tiene su línea).
--      `fn_conteo_arranque(sede)` (lectura) le dice a «Abrir un conteo» en qué lugares el próximo conteo completo es el de arranque.
--   3. ATAJO HONESTO. `conteo_aplicar_completos` reemplaza la ráfaga de `conteo_contar` de «Aplicar todos completos»: en UNA
--      transacción anota en las pendientes pedidas lo que CAYLA dice que hay AHORA (stock leído bajo candado, como
--      `conteo_contar`) y las marca `aplicada_sin_contar`. `fn_conteo_lineas_json` devuelve la marca, `fn_conteo_detalle` dice
--      si el conteo es (o puede ser) el de arranque, y `fn_conteos_resumen` suma `sin_contar` y `es_arranque` para que la
--      exactitud de Análisis deje fuera lo aplicado sin mirar y el conteo de arranque.
--
-- ESTADO QUE DEJA DE SER POSIBLE: un conteo cerrado o un traslado recibido desde una terminal sin el nombre de nadie; un primer
-- conteo completo que se asienta como merma; un conteo que dice «todo correcto» por un atajo sin que nadie haya contado.
--
-- DESCARTÉ
--   · Quitar `conteo_cerrar` y `traslado_recibir` de `acciones_sin_responsable` y pedir el combo en cada paso: es justo lo que
--     Felipe no quiere, y desde otro aparato (contar en el celular, cerrar en la computadora) el combo volvería a salir.
--   · Recordar el nombre solo en el navegador (como Contar, ADR-0282 b): no viaja entre aparatos y la base seguiría aceptando
--     un cierre sin persona.
--   · Pedir que quien hereda la firma siga «de turno»: la firma dice quién es responsable de la operación que abrió hoy; si ya
--     marcó su salida, el cierre igual fue suyo. Elegir a otra persona en el combo sí pasa por el candado de asistencia.
--   · Un parámetro nuevo en `conteo_contar` para marcar «sin contar»: cambiar su firma obliga a recrearla entera (lleva marcas
--     de ADR-0189 y parches vivos) y «Aplicar todos completos» seguiría siendo cientos de viajes en fila. Una sola función,
--     un solo viaje, el mismo candado.
--   · Decidir el arranque al ABRIR: «Por prenda» abre un conteo de todo el lugar (ADR-0282) y se cierra parcial; y un conteo de
--     arranque cerrado a medias dejaría la puerta abierta para cerrar siempre a medias y que nada cuente como pérdida. Se decide
--     al CERRAR, y solo vale si se contó TODO.
--   · Reescribir `cerrar_conteo`, `fn_conteo_lineas_json`, `fn_conteo_detalle` y las de traslados desde el archivo: llevan
--     parches vivos en producción. Se cambian por ancla (`pg_temp.reemplazar`), que aborta si el texto vivo es otro.
--
-- SE ROMPE SI
--   · un conteo lo abre una persona y lo cierra otra desde una terminal el MISMO día: firma quien lo abrió (Felipe lo acepta:
--     «quien abrió o contó»). Otro día, se pregunta.
--   · el piso se cuenta solo por categorías y nunca completo: nunca hay arranque en ese lugar (pregunta abierta para Felipe).
--   · un líder reabre el conteo de arranque y lo corrige antes de que se cierre otro conteo completo del lugar: esas
--     correcciones también son de arranque (después de otro conteo completo, ya cuentan como pérdida).
--   · alguien vuelve a pegar 20260930010100 (recrea `cerrar_conteo` y `fn_conteo_lineas_json` sin estos cambios) o
--     20260927160000 (recrea las de traslados): la firma vuelve a quedar vacía. Se repara volviendo a pegar, en orden,
--     20260930050100, 20261001120000 y esta (sin las dos primeras, esta aborta: el ancla de `fn_conteo_lineas_json` no está).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (ya trae `retail.`), DESPUÉS de la parte 1 y de 20261001120000
-- (`fn_conteo_lineas_json` con hallazgos). Solo crea/reemplaza funciones (y elimina y recrea `fn_conteos_resumen`, que cambia
-- sus columnas): sin políticas ni `drop trigger` (ADR-0195). `lock_timeout` de 3 s. Re-pegable: cada ancla lleva su marca y
-- `fn_conteos_resumen` solo se recrea si todavía no tiene `sin_contar`. Sin `select … into` dentro de textos (ADR-0288).
-- Si una ancla no aparece, aborta TODO con el nombre de la función: compararla con la de producción antes de seguir.
-- WEB Y SQL: la web nueva sin este SQL no se cae (los campos nuevos valen lo de antes y «Aplicar todos completos» avisa que no
-- pudo); este SQL sin la web nueva tampoco (la web vieja manda `conteo_contar` como antes y no lee las columnas nuevas). Una
-- terminal con la web vieja que cierra un conteo abierto otro día recibe «Falta elegir al responsable» sin combo: pegar y
-- publicar el mismo día.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'conteo_items' and column_name = 'aplicada_sin_contar') then
    raise exception 'Falta la parte 1: pega antes 20261004230000_conteo_firma_arranque_columnas.sql';
  end if;
end $$;

-- Reemplaza un trozo de una función viva exactamente `p_veces` veces y aborta si no aparece esas veces (la función cambió
-- desde que se escribió esto). La marca, que va dentro del texto nuevo, la vuelve re-pegable (20260927160000).
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el texto a reemplazar aparece % veces (se esperaban %). Compárala con producción y regenera el reemplazo.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ===========================================================================
-- 1. FIRMA UNA VEZ POR OPERACIÓN
-- ===========================================================================

-- PROMETE: quién firma un paso de una operación. Con persona en el paso (p_actor), ella. Sin persona desde una TERMINAL, la
--   firma vigente de la operación (p_heredable) si es de HOY en Lima; si no hay, corta con «Elige quién hace esta operación»
--   (42501, hint responsable_requerido): la pantalla muestra el combo una sola vez.
-- ASUME: p_actor sale de fn_actor_persona_id(true) en el MISMO paso (ya validó a la persona elegida y su asistencia); quien
--   llama ya validó permisos sobre la sede de la operación y le pasa la firma vigente de ESA operación. Sin sesión (SQL
--   Editor, scripts con la llave de servicio) devuelve NULL, como siempre.
create or replace function retail.fn_firma_heredada(p_actor uuid, p_heredable uuid, p_heredable_en timestamptz)
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  if p_actor is not null or auth.uid() is null then
    return p_actor;
  end if;
  -- Sesión de persona sin persona encontrada (no pasa con una cuenta activa): lo de antes, sin inventar a nadie.
  if not exists (select 1 from retail.fn_terminal_actual()) then
    return p_actor;
  end if;
  if p_heredable is not null and p_heredable_en is not null
     and (p_heredable_en at time zone 'America/Lima')::date = retail.fn_hoy_lima() then
    return p_heredable;
  end if;
  raise exception '%', case when p_heredable is null then 'Elige quién hace esta operación'
                            else 'Elige quién hace esta operación: se empezó otro día' end
    using errcode = '42501', hint = 'responsable_requerido';
end;
$fn$;

revoke all on function retail.fn_firma_heredada(uuid, uuid, timestamptz) from public, anon, authenticated;

comment on function retail.fn_firma_heredada(uuid, uuid, timestamptz) is
  'ADR-0328: quién firma un paso sin nombre desde una terminal. El actor si lo hay; si no, la firma vigente de la operación si es '
  'del mismo día (Lima); si no, responsable_requerido (la pantalla pregunta una vez). Sin sesión, NULL. Interna: la llaman '
  'cerrar_conteo y fn_firma_de_recepcion.';

-- PROMETE: quién firma ESTE paso de la recepción de un traslado (registrar lo contado, confirmar, cerrar con diferencia), y
--   deja a esa persona como la firma vigente de la recepción para que los pasos siguientes del mismo día la hereden.
-- ASUME: p_actor es lo que devolvió fn_actor_persona_id(true) en ese mismo paso; quien llama ya bloqueó la fila del traslado
--   (`for update`) y validó permisos sobre la sede destino. Solo escribe la cabecera cuando la firma cambia (otra persona u
--   otro día): un paso heredado no reescribe nada.
create or replace function retail.fn_firma_de_recepcion(p_transferencia_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_por uuid;
  v_en timestamptz;
  v_persona uuid;
begin
  for v_por, v_en in select t.recepcion_firmada_por, t.recepcion_firmada_en from retail.transferencias t where t.id = p_transferencia_id loop
    exit;
  end loop;
  v_persona := retail.fn_firma_heredada(p_actor, v_por, v_en);
  if v_persona is not null
     and (v_persona is distinct from v_por or v_en is null or (v_en at time zone 'America/Lima')::date <> retail.fn_hoy_lima()) then
    update retail.transferencias
       set recepcion_firmada_por = v_persona, recepcion_firmada_en = now()
     where id = p_transferencia_id;
  end if;
  return v_persona;
end;
$fn$;

revoke all on function retail.fn_firma_de_recepcion(uuid, uuid) from public, anon, authenticated;

comment on function retail.fn_firma_de_recepcion(uuid, uuid) is
  'ADR-0328: la firma de un paso de la recepción de un traslado (hereda la del mismo día si el paso llega sin nombre desde una '
  'terminal) y la deja como vigente en transferencias.recepcion_firmada_*. Interna: la llaman las tres funciones de recibir, '
  'con la fila del traslado ya bloqueada.';

-- Las tres funciones de recibir firman con la recepción (en las tres, la fila del traslado ya está `for update` en ese punto).
select pg_temp.reemplazar(
  'retail.registrar_recepcion_traslado(uuid, uuid, integer)',
  $v$v_persona := retail.fn_actor_persona_id(true);$v$,
  $n$v_persona := retail.fn_actor_persona_id(true);
  v_persona := retail.fn_firma_de_recepcion(p_transferencia_id, v_persona); -- ADR-0328 (firma-heredada)$n$,
  1, 'ADR-0328 (firma-heredada)'
);
select pg_temp.reemplazar(
  'retail.confirmar_traslado(uuid, text)',
  $v$v_persona := retail.fn_actor_persona_id(true);$v$,
  $n$v_persona := retail.fn_actor_persona_id(true);
  v_persona := retail.fn_firma_de_recepcion(p_transferencia_id, v_persona); -- ADR-0328 (firma-heredada)$n$,
  1, 'ADR-0328 (firma-heredada)'
);
select pg_temp.reemplazar(
  'retail.cerrar_traslado_con_diferencia(uuid, text)',
  $v$v_persona := retail.fn_actor_persona_id(true);$v$,
  $n$v_persona := retail.fn_actor_persona_id(true);
  v_persona := retail.fn_firma_de_recepcion(p_transferencia_id, v_persona); -- ADR-0328 (firma-heredada)$n$,
  1, 'ADR-0328 (firma-heredada)'
);

-- Las dos claves soltadas del combo siguen en la lista, pero ahora la base pone el nombre de la operación: su descripción lo dice
-- (la web la repite en `lib/responsable-omitido.ts`; `responsable-omitido.test.ts` las compara).
update retail.acciones_sin_responsable set descripcion = 'Cerrar el conteo y aplicar las diferencias (firma quien lo abrió hoy; si fue otro día, se pregunta una vez)' where clave = 'conteo_cerrar';
update retail.acciones_sin_responsable set descripcion = 'Recibir, confirmar o cerrar con diferencia un traslado (firma quien firmó la recepción hoy; si no hay nadie de hoy, se pregunta una vez)' where clave = 'traslado_recibir';

-- La firma vigente de la recepción, para que la pantalla sepa ANTES de contar si tiene que preguntar el nombre (y a nombre de
-- quién va lo demás). Lectura: prefijo `fn_`. NULL si quien pregunta no opera ninguna de las dos sedes del traslado.
create or replace function retail.fn_traslado_firma_recepcion(p_transferencia_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select jsonb_build_object(
           'persona_id', t.recepcion_firmada_por,
           'nombre', nullif(trim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), ''),
           'firmada_en', t.recepcion_firmada_en,
           'de_hoy', coalesce((t.recepcion_firmada_en at time zone 'America/Lima')::date = retail.fn_hoy_lima(), false))
    from retail.transferencias t
    left join public.personas p on p.id = t.recepcion_firmada_por
   where t.id = p_transferencia_id
     and (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) or retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id));
$fn$;

revoke all on function retail.fn_traslado_firma_recepcion(uuid) from public, anon;
grant execute on function retail.fn_traslado_firma_recepcion(uuid) to authenticated;

comment on function retail.fn_traslado_firma_recepcion(uuid) is
  'ADR-0328: la firma vigente de la recepción de un traslado {persona_id, nombre, firmada_en, de_hoy}. NULL si no se opera ninguna '
  'de sus sedes. Lectura.';

-- ===========================================================================
-- 2. CONTEO DE ARRANQUE
-- ===========================================================================

-- PROMETE: true si el lugar (ubicación + sububicación; NULL = toda la ubicación) nunca tuvo un conteo de TODO el lugar cerrado
--   sin pendientes y con algo verificado, sin contar `p_excepto` ni los conteos de prueba. Un conteo de toda la ubicación
--   (de antes de separar piso y almacén) cuenta para cada lugar de esa ubicación: ya fijó su punto de partida.
-- ASUME: «pendiente» es la misma regla de cerrar_conteo y fn_conteos_resumen (sin cifra y con algo esperado, o en reconteo).
--   Es la ÚNICA definición de «el lugar ya tuvo su arranque»: la usan cerrar_conteo, fn_conteo_detalle y fn_conteo_arranque.
create or replace function retail.fn_conteo_arranque_pendiente(p_ubicacion_id uuid, p_sububicacion_id uuid, p_excepto uuid default null)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select not exists (
    select 1
      from retail.conteos c
     where c.ubicacion_id = p_ubicacion_id
       and (c.sububicacion_id is null or c.sububicacion_id is not distinct from p_sububicacion_id)
       and c.estado = 'cerrado'
       and c.alcance = 'todo'
       and not c.es_prueba
       and c.id is distinct from p_excepto
       and exists (select 1 from retail.conteo_items i where i.conteo_id = c.id and i.cantidad_contada is not null)
       and not exists (select 1 from retail.conteo_items i
                        where i.conteo_id = c.id and i.cantidad_contada is null
                          and (coalesce(i.cantidad_foto, 0) > 0 or i.contada_anterior is not null))
  );
$fn$;

revoke all on function retail.fn_conteo_arranque_pendiente(uuid, uuid, uuid) from public, anon, authenticated;

comment on function retail.fn_conteo_arranque_pendiente(uuid, uuid, uuid) is
  'ADR-0328: el lugar nunca tuvo un conteo de todo el lugar cerrado sin pendientes (sin contar p_excepto ni los de prueba): su '
  'próximo conteo completo es el de arranque. Interna.';

-- Lectura para «Abrir un conteo»: cada lugar donde se cuenta en la sede (piso y almacén; o toda la ubicación si no los separa)
-- y si su próximo conteo completo sería el de arranque. Nada si quien pregunta no opera la sede.
create or replace function retail.fn_conteo_arranque(p_ubicacion_id uuid)
returns table(sububicacion_id uuid, arranque_pendiente boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with lugares as (
    select s.id
      from retail.sububicaciones s
     where s.ubicacion_id = p_ubicacion_id and s.tipo in ('piso_venta', 'almacen_tienda')
    union all
    select null::uuid
     where not exists (select 1 from retail.sububicaciones s
                        where s.ubicacion_id = p_ubicacion_id and s.tipo in ('piso_venta', 'almacen_tienda'))
  )
  select l.id, retail.fn_conteo_arranque_pendiente(p_ubicacion_id, l.id, null)
    from lugares l
   where retail.fn_puede_operar_ubicacion(p_ubicacion_id);
$fn$;

revoke all on function retail.fn_conteo_arranque(uuid) from public, anon;
grant execute on function retail.fn_conteo_arranque(uuid) to authenticated;

comment on function retail.fn_conteo_arranque(uuid) is
  'ADR-0328: por cada lugar de conteo de la sede (sububicacion_id; NULL = toda la ubicación), si su próximo conteo completo es '
  'el de arranque. Lectura para «Abrir un conteo».';

-- cerrar_conteo: firma heredada, y el arranque se decide al cerrar (solo si se contó TODO el lugar).
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$v_persona := retail.fn_actor_persona_id(true);$v$,
  $n$v_persona := retail.fn_actor_persona_id(true);
  v_persona := retail.fn_firma_heredada(v_persona, c.abierto_por, c.created_at); -- ADR-0328 (firma-heredada)$n$,
  1, 'ADR-0328 (firma-heredada)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$v_verificadas integer; v_pendientes integer; v_sin_confirmar integer;$v$,
  $n$v_verificadas integer; v_pendientes integer; v_sin_confirmar integer;
  v_motivo text := 'conteo'; -- ADR-0328 (conteo-arranque: motivo)$n$,
  1, 'ADR-0328 (conteo-arranque: motivo)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$  -- ADR-0189 (conteo-orden): el stock de las prendas con diferencia,$v$,
  $n$  -- ADR-0328 (conteo-arranque: decide) el primer conteo de TODO el lugar que se cierra sin pendientes es el de arranque:
  -- corrige el stock, pero sus ajustes llevan el motivo `conteo_arranque` (no son merma ni entran en la exactitud). Un conteo
  -- que ya fue el de arranque lo sigue siendo al corregirlo, mientras no se haya cerrado otro conteo completo del lugar.
  if c.alcance = 'todo' and v_pendientes = 0
     and retail.fn_conteo_arranque_pendiente(c.ubicacion_id, c.sububicacion_id, c.id) then
    v_motivo := 'conteo_arranque';
  end if;

  -- ADR-0189 (conteo-orden): el stock de las prendas con diferencia,$n$,
  1, 'ADR-0328 (conteo-arranque: decide)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$`tipo = 'ajuste'`, `motivo = 'conteo'` y lleva `conteo_item_id`$v$,
  $n$`tipo = 'ajuste'`, `motivo = 'conteo'` (o `conteo_arranque`, ADR-0328 (conteo-arranque: nota)) y lleva `conteo_item_id`$n$,
  1, 'ADR-0328 (conteo-arranque: nota)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$'ajuste', v_dif, 'conteo', r.id, v_persona)$v$,
  $n$'ajuste', v_dif, v_motivo, r.id, v_persona) -- ADR-0328 (conteo-arranque: ajuste)$n$,
  1, 'ADR-0328 (conteo-arranque: ajuste)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona where id = p_conteo_id;$v$,
  $n$-- ADR-0328 (conteo-arranque: marca) un conteo que fue el de arranque lo sigue siendo.
  update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona,
         es_arranque = es_arranque or v_motivo = 'conteo_arranque'
   where id = p_conteo_id;$n$,
  1, 'ADR-0328 (conteo-arranque: marca)'
);

-- Actividad: un ajuste de cierre de arranque es del cierre del conteo (que ya tiene su línea), no un «ajustó stock» suelto.
select pg_temp.reemplazar(
  'retail.fn_actividad_clase_inventario(text, text)',
  $v$when p_tipo = 'ajuste' and p_motivo is distinct from 'conteo' then 'stock_ajustado'$v$,
  $n$when p_tipo = 'ajuste' and p_motivo is distinct from 'conteo' and p_motivo is distinct from 'conteo_arranque' then 'stock_ajustado'$n$,
  1, $m$'conteo_arranque'$m$
);

-- ===========================================================================
-- 3. ATAJO HONESTO
-- ===========================================================================

-- Las líneas: el ajuste de un cierre de arranque también es «lo que el cierre de este conteo ajustó» (si no, la nota de
-- «Corregir conteo» diría que la prenda salió sola), y cada línea dice si se aplicó sin contar.
select pg_temp.reemplazar(
  'retail.fn_conteo_lineas_json(uuid, uuid, boolean)',
  $v$m.motivo = 'conteo'$v$,
  $n$m.motivo in ('conteo', 'conteo_arranque')$n$,
  2, $m$m.motivo in ('conteo', 'conteo_arranque')$m$
);
select pg_temp.reemplazar(
  'retail.fn_conteo_lineas_json(uuid, uuid, boolean)',
  $v$m.motivo in ('conteo', 'hallazgo_conteo')$v$,
  $n$m.motivo in ('conteo', 'conteo_arranque', 'hallazgo_conteo')$n$,
  1, $m$'conteo_arranque', 'hallazgo_conteo'$m$
);
select pg_temp.reemplazar(
  'retail.fn_conteo_lineas_json(uuid, uuid, boolean)',
  $v$'hallazgos', coalesce(aj.hallazgos, 0),$v$,
  $n$'hallazgos', coalesce(aj.hallazgos, 0),
               'aplicada_sin_contar', ci.aplicada_sin_contar, -- ADR-0328 (sin-contar)$n$,
  1, 'ADR-0328 (sin-contar)'
);

-- El detalle: si el conteo fue el de arranque, si TODAVÍA puede serlo (abierto, de todo el lugar, y el lugar sin arranque) y si
-- se abrió hoy (la pantalla de cerrar sabe sin adivinar si una terminal hereda la firma o tiene que preguntarla).
select pg_temp.reemplazar(
  'retail.fn_conteo_detalle(uuid)',
  $v$'es_prueba', c.es_prueba)$v$,
  $n$'es_prueba', c.es_prueba,
           -- ADR-0328 (conteo-detalle)
           'es_arranque', c.es_arranque,
           'arranque_posible', (c.estado = 'abierto' and c.alcance = 'todo'
                                and retail.fn_conteo_arranque_pendiente(c.ubicacion_id, c.sububicacion_id, c.id)),
           'abierto_hoy', (c.created_at at time zone 'America/Lima')::date = retail.fn_hoy_lima())$n$,
  1, 'ADR-0328 (conteo-detalle)'
);

-- PROMETE: en un conteo abierto, anota de una vez en las variantes pedidas que SIGUEN sin cifra (pendientes o en reconteo) lo
--   que CAYLA dice que hay AHORA en el lugar del conteo, y las marca «aplicada sin contar». Todo o nada. Devuelve
--   {aplicadas, lineas}: cuántas anotó y las líneas pedidas tal como quedaron, con su estado (fn_conteo_lineas_json).
-- ASUME: la pantalla manda las variantes que ve pendientes; las que ya tienen cifra, las ignoradas y las que no son del conteo
--   no se tocan, así que repetirla no cambia nada (idempotente por su estado: no necesita marca de reintento). Mismos permisos,
--   firma y orden de candados que conteo_contar: primero el conteo (`for update`), después el stock (`for share`, en el orden
--   de fn_bloquear_en_orden). Una venta en curso termina antes de que se lea su prenda; la que llega después espera.
create or replace function retail.conteo_aplicar_completos(p_conteo_id uuid, p_variantes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c retail.conteos%rowtype;
  v_ids uuid[];
  v_aplicadas integer := 0;
begin
  select * into c from retail.conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not retail.fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  perform retail.fn_actor_persona_id(true);

  -- Las que siguen sin cifra y cuentan: la misma regla de «pendiente» de cerrar_conteo (sin cifra y con algo esperado, o en
  -- reconteo). En orden de variante: el mismo de los candados.
  v_ids := array(
    select ci.variante_id
      from retail.conteo_items ci
     where ci.conteo_id = p_conteo_id
       and ci.variante_id = any(coalesce(p_variantes, '{}'::uuid[]))
       and ci.cantidad_contada is null
       and (coalesce(ci.cantidad_foto, 0) > 0 or ci.contada_anterior is not null)
     order by ci.variante_id);

  if cardinality(v_ids) > 0 then
    perform 1 from retail.stock
      where ubicacion_id = c.ubicacion_id and variante_id = any(v_ids)
      order by variante_id, sububicacion_id nulls first
      for share;

    -- Lo que hay AHORA en el lugar del conteo (la misma suma que conteo_contar): el «debe haber» y la cifra son el mismo
    -- número, así que una línea aplicada nunca trae una diferencia (lo exige conteo_items_sin_contar_es_lo_esperado).
    update retail.conteo_items ci
       set cantidad_sistema = st.cantidad,
           cantidad_contada = st.cantidad,
           verificado_en = clock_timestamp(),
           confirmada_en = null,
           aplicada_sin_contar = true
      from (select v.id as variante_id,
                   coalesce((select sum(s.cantidad)
                               from retail.stock s
                              where s.variante_id = v.id
                                and s.ubicacion_id = c.ubicacion_id
                                and (c.sububicacion_id is null or s.sububicacion_id = c.sububicacion_id)), 0)::integer as cantidad
              from unnest(v_ids) as v(id)) st
     where ci.conteo_id = p_conteo_id
       and ci.variante_id = st.variante_id;
    get diagnostics v_aplicadas = row_count;
  end if;

  return jsonb_build_object(
    'aplicadas', v_aplicadas,
    'lineas', (select coalesce(jsonb_agg(l.j), '[]'::jsonb)
                 from jsonb_array_elements(retail.fn_conteo_lineas_json(p_conteo_id, null, true)) as l(j)
                where (l.j ->> 'variante_id')::uuid = any(coalesce(p_variantes, '{}'::uuid[]))));
end;
$fn$;

revoke all on function retail.conteo_aplicar_completos(uuid, uuid[]) from public, anon;
grant execute on function retail.conteo_aplicar_completos(uuid, uuid[]) to authenticated;

comment on function retail.conteo_aplicar_completos(uuid, uuid[]) is
  'ADR-0328: «Aplicar todos completos». Anota en las variantes pedidas que siguen sin cifra lo que hay ahora (stock bajo candado) '
  'y las marca aplicada_sin_contar (no suben la exactitud). Todo o nada; idempotente. Devuelve {aplicadas, lineas}.';

-- fn_conteos_resumen: dos columnas al final para la exactitud (cuántas líneas se aplicaron sin contar y si fue el de
-- arranque). Cambiar las columnas obliga a eliminarla y recrearla: antes se comprueba que la viva sea la del repo
-- (20260930010100), para no borrar un parche que solo exista en producción.
do $$
declare
  v_md5 text;
begin
  if pg_get_function_result('retail.fn_conteos_resumen(uuid,integer)'::regprocedure) like '%sin_contar%' then
    return; -- ya se aplicó: el `create or replace` de abajo la deja igual
  end if;
  v_md5 := (select md5(regexp_replace(p.prosrc, '\s+', '', 'g')) from pg_proc p
             where p.oid = 'retail.fn_conteos_resumen(uuid,integer)'::regprocedure);
  if v_md5 is distinct from '83e99fba4499cd7ca28e98ddfd58ecd8' then
    raise exception 'retail.fn_conteos_resumen en vivo no es la de 20260930010100 (huella %): compárala con el repo antes de pegar esta migración.', v_md5;
  end if;
  drop function retail.fn_conteos_resumen(uuid, integer);
end $$;

-- Igual a la de 20260930010100 (MISMAS columnas, orden y reglas: `lineas` y las sumas cuentan solo variantes verificadas),
-- más `sin_contar` (de las verificadas, cuántas se aplicaron sin contar) y `es_arranque` al final.
create or replace function retail.fn_conteos_resumen(p_ubicacion_id uuid, p_limite integer default 20)
returns table(
  id uuid,
  numero integer,
  estado text,
  created_at timestamptz,
  cerrado_en timestamptz,
  sububicacion_id uuid,
  sububicacion_nombre text,
  sububicacion_tipo text,
  alcance text,
  alcance_categoria_nombre text,
  abierto_por uuid,
  cerrado_por uuid,
  lineas integer,
  lineas_con_diferencia integer,
  sistema integer,
  contado integer,
  diferencia integer,
  pendientes integer,
  parcial boolean,
  sin_contar integer,
  es_arranque boolean
)
language sql
stable
security invoker
set search_path = retail, public, extensions
as $function$
  select c.id,
         c.numero,
         c.estado,
         c.created_at,
         c.cerrado_en,
         c.sububicacion_id,
         s.nombre,
         s.tipo,
         c.alcance,
         cat.nombre,
         c.abierto_por,
         c.cerrado_por,
         coalesce(agg.lineas, 0),
         coalesce(agg.lineas_con_diferencia, 0),
         coalesce(agg.sistema, 0),
         coalesce(agg.contado, 0),
         coalesce(agg.diferencia, 0),
         coalesce(agg.pendientes, 0),
         (c.estado = 'cerrado' and coalesce(agg.pendientes, 0) > 0),
         coalesce(agg.sin_contar, 0),
         c.es_arranque
    from conteos c
    left join sububicaciones s on s.id = c.sububicacion_id
    left join categorias cat on cat.id = c.alcance_categoria_id
    left join lateral (
      select count(*) filter (where ci.cantidad_contada is not null)::integer as lineas,
             count(*) filter (where ci.cantidad_contada is not null and ci.cantidad_contada <> ci.cantidad_sistema)::integer as lineas_con_diferencia,
             (sum(ci.cantidad_sistema) filter (where ci.cantidad_contada is not null))::integer as sistema,
             sum(ci.cantidad_contada)::integer as contado,
             sum(ci.cantidad_contada - ci.cantidad_sistema)::integer as diferencia,
             count(*) filter (where ci.cantidad_contada is null and (coalesce(ci.cantidad_foto, 0) > 0 or ci.contada_anterior is not null))::integer as pendientes,
             count(*) filter (where ci.aplicada_sin_contar)::integer as sin_contar
        from conteo_items ci
       where ci.conteo_id = c.id
    ) agg on true
   where c.ubicacion_id = p_ubicacion_id
   order by (c.estado = 'abierto') desc, c.created_at desc
   limit greatest(p_limite, 1);
$function$;

revoke all on function retail.fn_conteos_resumen(uuid, integer) from public, anon;
grant execute on function retail.fn_conteos_resumen(uuid, integer) to authenticated;

comment on function retail.fn_conteos_resumen(uuid, integer) is
  'Historial de conteos de una ubicación (el abierto primero, luego los más recientes). lineas, lineas_con_diferencia, sistema, '
  'contado y diferencia cuentan SOLO variantes verificadas; pendientes cuenta las que faltan por contar; parcial = cerrado con '
  'pendientes; sin_contar = verificadas por «Aplicar todos completos» (ADR-0328: no suben la exactitud); es_arranque = fue el '
  'conteo de arranque del lugar (no entra en la exactitud). Security invoker: la seguridad por filas decide qué conteos ve cada persona.';

notify pgrst, 'reload schema';
