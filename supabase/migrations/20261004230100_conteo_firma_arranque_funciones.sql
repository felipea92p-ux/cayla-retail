-- ============================================================================
-- 20261004230100_conteo_firma_arranque_funciones.sql — CAYLA V2 · Inventario ▸ Conteo I (ADR-0328, actividad 15)
-- PARTE 2 de 2: las funciones. Requiere 20261004230000_conteo_firma_arranque_columnas.sql (parte 1).
--
-- EL PROBLEMA PRIMERO. Ver la parte 1: desde una terminal, el cierre de un conteo y la recepción de un traslado quedan sin
-- persona; el primer conteo completo de una sede se cuenta como pérdida; y «Aplicar todos completos» infla la exactitud.
--
-- QUÉ HACE
--   1. FIRMA UNA VEZ POR OPERACIÓN. `fn_firma_heredada` decide quién firma un paso que llega SIN nombre desde una terminal (las
--      acciones soltadas del combo, ADR-0280): la última persona que firmó ESA operación, si lo hizo HOY (día de Lima) y sigue de
--      turno en la tienda; si fue otro día, ya marcó su salida o nunca hubo nombre, corta con «Elige quién hace esta operación»
--      (hint `responsable_requerido`) y la pantalla pregunta UNA vez. Con el nombre de una persona (sesión propia o combo) firma
--      ella, como siempre: la pantalla manda ese nombre cuando el aparato ya sabe quién cuenta, o cuando la persona elige «otra
--      persona» en vez de la heredada. Las lecturas (`fn_conteo_detalle.abierto_por_presente`,
--      `fn_traslado_firma_recepcion.presente`) le dicen a la pantalla, antes de cerrar, si la base va a heredar o a preguntar.
--        · Conteo: la firma de la operación es quien lo abrió (`abierto_por`, `created_at`): por diseño (ADR-0282 b) quien abre
--          firma también cada cifra contada. `cerrar_conteo` la hereda.
--        · Traslado: `fn_firma_de_recepcion` lee y renueva `transferencias.recepcion_firmada_*` en cada paso de recibir
--          (`registrar_recepcion_traslado`, `confirmar_traslado`, `cerrar_traslado_con_diferencia`).
--      Resultado: ningún conteo cerrado ni traslado recibido desde una terminal queda sin persona. `fn_actor_persona_id` NO
--      cambia y las claves `conteo_cerrar` y `traslado_recibir` siguen en `acciones_sin_responsable`: ahora significan «este
--      paso no pregunta; la base pone el nombre de la operación».
--   2. CONTEO DE ARRANQUE, POR TRAMOS (Felipe, 2026-10-04). El tramo es el lugar entero en el ALMACÉN (o en toda la ubicación) y
--      cada CATEGORÍA en el PISO (`fn_arranque_por_categoria`, parte 1): el piso se cuenta por categorías a lo largo de la semana.
--      Y el CUADRE DEL PISO de la sede (`cuadres_piso.created_at`, PR #792) reinicia todos sus tramos: solo cuenta lo abierto
--      después del último cuadre (`fn_ultimo_cuadre_piso`; sin cuadre, todo).
--      `fn_conteo_puede_ser_arranque`: con foto (del modelo nuevo), no de prueba, abierto después del último cuadre y de un alcance
--      que puede serlo en su lugar (TODO; o una categoría, en el piso). `fn_conteo_vale_como_arranque`: eso, más contado entero y
--      de verdad (sin pendientes y sin nada «aplicado sin contar»). `fn_conteo_arranque_pendiente(lugar, categoría)`: el tramo
--      todavía no tuvo su arranque (ningún conteo que lo cubra marcado `es_arranque` —la marca manda: reabrirlo y cancelarlo no
--      lo devuelve— ni cerrado que valga). `fn_conteo_variantes_de_arranque(conteo)`: las líneas de un conteo cuyo tramo está
--      pendiente. `cerrar_conteo` marca `es_arranque` y escribe con el motivo `conteo_arranque` el ajuste de ESAS líneas, si el
--      conteo vale: en un conteo de todo el piso, las categorías que ya tuvieron su arranque van como `conteo`.
--      `fn_es_merma` NO lo cuenta (su lista de motivos es cerrada: merma, conteo, conteo_fisico; no hace falta tocarla) y
--      Finanzas (`fn_asientos`) no lo asienta como 659. `fn_conteo_lineas_json` lo suma como ajuste del cierre (la nota de
--      «Corregir conteo» sigue cuadrando) y Actividad no lo anota como «ajustó stock» (el cierre ya tiene su línea).
--      `fn_conteo_arranque(sede)` (lectura) le dice a «Abrir un conteo» qué lugares y qué categorías del piso tienen el arranque
--      pendiente.
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
--   · Heredar la firma aunque quien abrió ya marcó su salida (la primera versión de esta migración): el cierre, que es la
--     aprobación del conteo, quedaba a nombre de alguien que ya no estaba, y la firma heredada se saltaba el candado de asistencia
--     que una firma elegida sí pasa (revisión adversarial, escena C). Ahora hereda solo quien sigue de turno.
--   · Un parámetro nuevo en `conteo_contar` para marcar «sin contar»: cambiar su firma obliga a recrearla entera (lleva marcas
--     de ADR-0189 y parches vivos) y «Aplicar todos completos» seguiría siendo cientos de viajes en fila. Una sola función,
--     un solo viaje, el mismo candado.
--   · Decidir el arranque al ABRIR: «Por prenda» abre un conteo de todo el lugar (ADR-0282) y se cierra parcial; y un conteo de
--     arranque cerrado a medias dejaría la puerta abierta para cerrar siempre a medias y que nada cuente como pérdida. Se decide
--     al CERRAR, y solo vale si se contó TODO.
--   · Que un conteo con parte «aplicada sin contar» sea el de arranque (solo para lo contado): «Aplicar todos completos» en
--     una línea bastaría para gastarlo, y los errores de la carga que nadie miró caerían como merma en el conteo siguiente, en un
--     libro que no se corrige. Revisión adversarial del 2026-10-04: se probó (escena A) y así pasaba. La pantalla lo avisa antes
--     de aplicar.
--   · Que gaste el arranque un conteo sin foto (de antes del rediseño): solo guardaba lo contado, así que uno de 3 prendas
--     parecía completo y el conteo grande de TRU habría caído entero a la cuenta 659 (escena B).
--   · Mirar el ESTADO del conteo para saber si el arranque se gastó: reabrir el de arranque y cancelarlo lo devolvía, y el
--     siguiente conteo completo no contaba un faltante real como pérdida (escena G). Lo dice la marca `es_arranque`.
--   · Un arranque SOLO del piso entero (la primera versión): el piso nunca se cuenta de una vez (Felipe), así que no lo tendría
--     nunca y cada error de la carga del piso caería como merma. Tampoco por categoría en el ALMACÉN: ahí sí se cuenta todo junto.
--   · Que un conteo de todo el piso cerrado A MEDIAS dé el arranque a las categorías que sí quedaron enteras: haría falta guardar
--     qué categorías gastó cada conteo (la marca es por conteo), y «Por prenda» o un cierre parcial bastarían para gastar una
--     categoría con dos prendas contadas. Una categoría arranca contándola entera (conteo de esa categoría) o con todo el piso.
--   · Que el cuadre se lea por su orden de pegado: `fn_ultimo_cuadre_piso` mira `to_regclass('retail.cuadres_piso')`, así que esta
--     migración funciona antes o después de la del cuadre (#792); sin la tabla, no hay cuadre y vale la regla sin reinicio.
--   · Reiniciar el arranque por el cierre de la carga inicial (#785) en vez de por el cuadre: el cuadre es el que corrige dónde
--     está cada prenda de la sede de una vez; lo que el conteo encuentre después ya no es de la carga sino del día a día.
--   · Reescribir `cerrar_conteo`, `fn_conteo_lineas_json`, `fn_conteo_detalle` y las de traslados desde el archivo: llevan
--     parches vivos en producción. Se cambian por ancla (`pg_temp.reemplazar`), que aborta si el texto vivo es otro.
--
-- SE ROMPE SI
--   · un conteo lo abre una persona y lo cierra otra desde una terminal el MISMO día, sin elegir su nombre y con la primera
--     todavía de turno: firma quien lo abrió (Felipe lo acepta: «quien abrió o contó»). La pantalla dice a nombre de quién va y
--     deja elegir a otra persona; otro día, o si quien abrió ya marcó su salida, se pregunta.
--   · una tienda no marca asistencia (sin marcas ni jornada de Dynamic): nadie está «de turno» y la terminal pregunta el nombre en
--     cada operación sin firma de hoy, igual que el combo de cualquier otra acción (mismo candado, fn_persona_presente).
--   · el piso se cuenta solo por lotes de «Por prenda» (o con conteos de todo el piso cerrados a medias): ninguna categoría tiene
--     arranque así, y sus diferencias cuentan como pérdida. «Abrir un conteo» lo avisa; para que una categoría arranque, se
--     cuenta entera (conteo de esa categoría) o se cuenta todo el piso.
--   · una prenda cambia de categoría después de su arranque: su línea sigue al tramo de su categoría NUEVA (se lee el producto al
--     cerrar), que puede no haber arrancado todavía.
--   · un conteo de todo el piso es el de arranque de algunas categorías y no de otras: la exactitud de Análisis lo deja fuera
--     entero (la marca es por conteo), aunque las categorías que ya habían arrancado sí ajustaron como pérdida.
--   · un líder reabre el conteo de arranque y lo corrige antes de que se cierre otro conteo que cubra su tramo: esas
--     correcciones también son de arranque (después, ya cuentan como pérdida). Si entre medio hubo un cuadre, ya no: el conteo
--     es de antes del cuadre.
--   · un líder archiva como «de prueba» el conteo de arranque (archivar_conteo_prueba acepta uno cerrado): deja de contar y el
--     lugar vuelve a tener el arranque pendiente, aunque sus ajustes sigan en el libro.
--   · en el primer conteo completo alguien aplica sin contar «para terminar rápido»: no es el de arranque y lo que falte en lo
--     contado cuenta como pérdida. La pantalla lo avisa en ámbar antes de aplicar y al cerrar; el arranque queda para el próximo.
--   · alguien vuelve a pegar 20260930010100 (recrea `cerrar_conteo` y `fn_conteo_lineas_json` sin estos cambios) o
--     20260927160000 (recrea las de traslados): la firma vuelve a quedar vacía. Se repara volviendo a pegar, en orden,
--     20260930050100, 20261001120000 y esta (sin las dos primeras, esta aborta: el ancla de `fn_conteo_lineas_json` no está).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (ya trae `retail.`), DESPUÉS de la parte 1 y de 20261001120000
-- (`fn_conteo_lineas_json` con hallazgos). Puede ir antes o después de las del cuadre del piso (#792): lee `cuadres_piso` solo si
-- existe. Solo crea/reemplaza funciones (y elimina y recrea `fn_conteos_resumen`, que cambia sus columnas, y `fn_conteo_arranque`
-- y la firma de tres argumentos de `fn_conteo_arranque_pendiente`, por si una base tenía la primera versión de esta migración):
-- sin políticas ni `drop trigger` (ADR-0195). `lock_timeout` de 3 s. Re-pegable: cada ancla lleva su marca y
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
--   firma vigente de la operación (p_heredable) si es de HOY en Lima y esa persona SIGUE de turno en la tienda de la terminal
--   (el mismo candado que pasa quien se elige en el combo: activa en retail y presente, fn_actor_persona_id); si no, corta con
--   «Elige quién hace esta operación» (42501, hint responsable_requerido): la pantalla muestra el combo una sola vez.
-- ASUME: p_actor sale de fn_actor_persona_id(true) en el MISMO paso (ya validó a la persona elegida y su asistencia); quien
--   llama ya validó permisos sobre la sede de la operación y le pasa la firma vigente de ESA operación. Sin sesión (SQL
--   Editor, scripts con la llave de servicio) devuelve NULL, como siempre.
-- POR QUÉ «SIGUE DE TURNO» (revisión adversarial del 2026-10-04, escena C): Rosa abre el conteo a la mañana, marca su salida y a
--   la tarde Ana lo cierra desde la terminal. Sin este candado el cierre, que es la aprobación del conteo, quedaba a nombre de
--   alguien que ya no estaba, y una firma heredada se saltaba la asistencia que una firma elegida sí pasa. ADR-0328 (decisión 7)
--   pide volver a preguntar cuando lo cierra otra persona en otro turno: marcar la salida es justo eso.
create or replace function retail.fn_firma_heredada(p_actor uuid, p_heredable uuid, p_heredable_en timestamptz)
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_es_terminal boolean := false;
  v_ubicacion uuid;
begin
  if p_actor is not null or auth.uid() is null then
    return p_actor;
  end if;
  for v_ubicacion in select t.ubicacion_id from retail.fn_terminal_actual() t loop
    v_es_terminal := true;
    exit;
  end loop;
  -- Sesión de persona sin persona encontrada (no pasa con una cuenta activa): lo de antes, sin inventar a nadie.
  if not v_es_terminal then
    return p_actor;
  end if;
  if p_heredable is null or p_heredable_en is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if (p_heredable_en at time zone 'America/Lima')::date <> retail.fn_hoy_lima() then
    raise exception 'Elige quién hace esta operación: se empezó otro día' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if not exists (select 1 from public.personas p join retail.colaboradores co on co.persona_id = p.id
                  where p.id = p_heredable and p.estado = 'activo')
     or not retail.fn_persona_presente(p_heredable, v_ubicacion, now()) then
    raise exception 'Elige quién hace esta operación: quien la empezó ya no está de turno'
      using errcode = '42501', hint = 'responsable_requerido';
  end if;
  return p_heredable;
end;
$fn$;

revoke all on function retail.fn_firma_heredada(uuid, uuid, timestamptz) from public, anon, authenticated;

comment on function retail.fn_firma_heredada(uuid, uuid, timestamptz) is
  'ADR-0328: quién firma un paso sin nombre desde una terminal. El actor si lo hay; si no, la firma vigente de la operación si es '
  'del mismo día (Lima) y esa persona sigue de turno en la tienda de la terminal; si no, responsable_requerido (la pantalla '
  'pregunta una vez). Sin sesión, NULL. Interna: la llaman cerrar_conteo y fn_firma_de_recepcion.';

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
update retail.acciones_sin_responsable set descripcion = 'Cerrar el conteo y aplicar las diferencias (firma quien lo abrió hoy, si sigue de turno; si no, se pregunta una vez)' where clave = 'conteo_cerrar';
update retail.acciones_sin_responsable set descripcion = 'Recibir, confirmar o cerrar con diferencia un traslado (firma quien firmó la recepción hoy, si sigue de turno; si no, se pregunta una vez)' where clave = 'traslado_recibir';

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
           'de_hoy', coalesce((t.recepcion_firmada_en at time zone 'America/Lima')::date = retail.fn_hoy_lima(), false),
           -- Si sigue de turno en la sede que recibe: si ya marcó su salida, la base no hereda su firma (fn_firma_heredada).
           'presente', case when t.recepcion_firmada_por is null then null
                            else retail.fn_persona_presente(t.recepcion_firmada_por, t.ubicacion_destino_id, now()) end)
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

-- PROMETE: la hora del último cuadre del piso de la sede (`cuadres_piso.created_at`, la fecha del cuadre: ADR-0328 decisión
--   técnica 4), o NULL si nunca se cuadró. Es la ÚNICA definición de «desde cuándo cuenta el arranque»: el cuadre corrige de una
--   vez dónde está cada prenda de la sede, así que lo que un conteo encuentre después ya no es de la carga, salvo en su primer
--   conteo de cada tramo, que es el nuevo arranque (Felipe, 2026-10-04).
-- ASUME: nada del orden de pegado. `cuadres_piso` llega con el PR #792; si la tabla no existe todavía, no hubo cuadre (NULL). Es
--   plpgsql a propósito: la consulta a la tabla se prepara solo cuando la tabla existe (una función SQL no se crearía sin ella).
create or replace function retail.fn_ultimo_cuadre_piso(p_ubicacion_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  if to_regclass('retail.cuadres_piso') is null then
    return null;
  end if;
  return (select max(cp.created_at) from retail.cuadres_piso cp where cp.ubicacion_id = p_ubicacion_id);
end;
$fn$;

revoke all on function retail.fn_ultimo_cuadre_piso(uuid) from public, anon, authenticated;

comment on function retail.fn_ultimo_cuadre_piso(uuid) is
  'ADR-0328: cuándo fue el último cuadre del piso de la sede (NULL si nunca, o si cuadres_piso todavía no existe). El arranque '
  'de cada tramo se reinicia ahí. Interna.';

-- PROMETE: true si ESTE conteo es de los que pueden ser de arranque, sin mirar cuánto se contó: tiene foto (`foto_en`), no es de
--   prueba, se abrió DESPUÉS del último cuadre del piso de su sede y su alcance cubre un tramo entero de su lugar (TODO el lugar;
--   o, en el piso, donde el tramo es la categoría, también una categoría: fn_arranque_por_categoria).
-- POR QUÉ CADA CONDICIÓN:
--   · con foto: antes del rediseño (20260930010000) solo se guardaban las líneas contadas, así que un conteo viejo de 3 prendas no
--     tiene pendientes y parecería «completo». Sin foto no se sabe si se contó todo: no gasta el arranque de nadie (es el mismo
--     criterio con el que reabrir_conteo distingue un conteo del modelo nuevo). Revisión adversarial del 2026-10-04, escena B.
--   · después del cuadre: uno abierto antes (y reabierto después) contó un piso y un almacén que el cuadre ya cambió.
--   · una categoría solo en el piso: en el almacén se cuenta todo junto; un conteo de una categoría allí no fija el punto de
--     partida del almacén, y aceptarlo dejaría arrancar el almacén categoría por categoría sin contarlo nunca entero.
create or replace function retail.fn_conteo_puede_ser_arranque(p_conteo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select exists (
    select 1
      from retail.conteos c
     where c.id = p_conteo_id
       and (c.alcance = 'todo' or retail.fn_arranque_por_categoria(c.sububicacion_id))
       and c.foto_en is not null
       and not c.es_prueba
       and c.created_at > coalesce(retail.fn_ultimo_cuadre_piso(c.ubicacion_id), '-infinity'::timestamptz)
  );
$fn$;

revoke all on function retail.fn_conteo_puede_ser_arranque(uuid) from public, anon, authenticated;

comment on function retail.fn_conteo_puede_ser_arranque(uuid) is
  'ADR-0328: el conteo puede ser de arranque por lo que es (con foto, no de prueba, abierto después del último cuadre del piso y '
  'de todo el lugar o, en el piso, de una categoría), sin mirar cuánto se contó. Interna.';

-- PROMETE: true si ESTE conteo, tal como está ahora, vale como conteo de arranque: puede serlo (fn_conteo_puede_ser_arranque),
--   tiene algo contado, no le queda nada pendiente y NINGUNA línea se anotó con «Aplicar todos completos».
--   Es la ÚNICA definición de «se contó entero y de verdad»: la usan cerrar_conteo (para decidir) y fn_conteo_arranque_pendiente
--   (para saber si un conteo cerrado ya fijó el punto de partida de su tramo).
-- ASUME: «pendiente» es la regla de cerrar_conteo y fn_conteos_resumen (sin cifra y con algo esperado, o en reconteo). No mira si
--   el tramo ya tuvo su arranque: eso es fn_conteo_arranque_pendiente.
-- POR QUÉ sin líneas «aplicadas sin contar» (revisión adversarial del 2026-10-04, escena A): un arranque que nadie miró no fija
--   ningún punto de partida. Si lo gastara, los errores de la carga inicial que nadie vio aparecerían en el conteo SIGUIENTE como
--   merma (cuenta 659), en un libro que no se corrige.
create or replace function retail.fn_conteo_vale_como_arranque(p_conteo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select retail.fn_conteo_puede_ser_arranque(p_conteo_id)
     and exists (select 1 from retail.conteo_items i where i.conteo_id = p_conteo_id and i.cantidad_contada is not null)
     and not exists (select 1 from retail.conteo_items i
                      where i.conteo_id = p_conteo_id
                        and (i.aplicada_sin_contar
                             or (i.cantidad_contada is null
                                 and (coalesce(i.cantidad_foto, 0) > 0 or i.contada_anterior is not null))));
$fn$;

revoke all on function retail.fn_conteo_vale_como_arranque(uuid) from public, anon, authenticated;

comment on function retail.fn_conteo_vale_como_arranque(uuid) is
  'ADR-0328: el conteo puede ser de arranque (fn_conteo_puede_ser_arranque) y se contó entero y de verdad: con algo contado, sin '
  'pendientes y sin líneas aplicadas sin contar. Interna.';

-- La primera versión de esta migración tenía la firma de tres argumentos (sin categoría). Si una base la tiene, se quita: con las
-- dos, una llamada de tres argumentos sería ambigua. `drop function` no toma los candados de auth/storage (ADR-0195).
drop function if exists retail.fn_conteo_arranque_pendiente(uuid, uuid, uuid);

-- PROMETE: true si el TRAMO (lugar + categoría) todavía no tuvo su conteo de arranque desde el último cuadre del piso de la sede.
--   Lugar: ubicación + sububicación (NULL = toda la ubicación). Categoría: la del tramo en el piso (fn_arranque_por_categoria); NULL
--   en el almacén o en toda la ubicación (el tramo es el lugar entero), o para una prenda sin categoría en el piso.
--   Un conteo CUBRE el tramo si es de TODO el lugar o de esa misma categoría; lo GASTÓ si lleva la marca `es_arranque` o está
--   cerrado y vale como arranque (fn_conteo_vale_como_arranque: los cerrados antes de esta migración que se contaron enteros
--   también fijaron el punto de partida). Sin contar `p_excepto` ni los de prueba ni los abiertos antes del último cuadre. Un
--   conteo de toda la ubicación (sin piso ni almacén aparte) cuenta para cada lugar de esa ubicación.
-- ASUME: el tramo gastado lo dice la MARCA, no el estado: reabrir el de arranque y cancelarlo (anular_conteo acepta uno
--   reabierto) no lo devuelve; sus ajustes ya están en el libro. Es la ÚNICA definición de «el tramo ya tuvo su arranque»: la
--   usan fn_conteo_variantes_de_arranque (y por ella cerrar_conteo y fn_conteo_detalle) y fn_conteo_arranque.
-- Un conteo de una categoría del ALMACÉN no cubre el tramo NULL (no es de todo) y tampoco puede valer: allí no gasta nada.
create or replace function retail.fn_conteo_arranque_pendiente(
  p_ubicacion_id uuid, p_sububicacion_id uuid, p_categoria_id uuid, p_excepto uuid default null)
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
       and not c.es_prueba
       and c.id is distinct from p_excepto
       and c.created_at > coalesce((select retail.fn_ultimo_cuadre_piso(p_ubicacion_id)), '-infinity'::timestamptz)
       and (c.alcance = 'todo' or c.alcance_categoria_id = p_categoria_id)
       and (c.es_arranque
            or (c.estado = 'cerrado' and retail.fn_conteo_vale_como_arranque(c.id)))
  );
$fn$;

revoke all on function retail.fn_conteo_arranque_pendiente(uuid, uuid, uuid, uuid) from public, anon, authenticated;

comment on function retail.fn_conteo_arranque_pendiente(uuid, uuid, uuid, uuid) is
  'ADR-0328: el tramo (lugar; y en el piso, la categoría) todavía no tuvo su conteo de arranque desde el último cuadre del piso: '
  'ningún conteo que lo cubra (de todo el lugar o de esa categoría) marcado es_arranque ni cerrado que valga como arranque; sin '
  'contar p_excepto ni los de prueba. Interna.';

-- PROMETE: las variantes del conteo cuyo ajuste de cierre sería de arranque: si el conteo puede ser de arranque
--   (fn_conteo_puede_ser_arranque), sus líneas dentro del alcance (todas, o las de su categoría) cuyo tramo sigue pendiente sin
--   contarlo a él mismo. En el almacén (o toda la ubicación) son todas o ninguna; en el piso, por categoría: en un conteo de
--   todo el piso después de arrancar Blusas, las de Blusas no salen y las de las demás categorías sí.
-- ASUME: no mira si se contó entero: cerrar_conteo la llama solo si el conteo vale (fn_conteo_vale_como_arranque), y
--   fn_conteo_detalle la usa para decir si TODAVÍA puede serlo. Las líneas de otra categoría contadas «fuera de alcance» en un
--   conteo de una categoría no son de arranque: esa categoría no se contó entera.
-- POR QUÉ `materialized`: el tramo de cada categoría se averigua UNA vez (a lo sumo decenas), no una por línea (cientos); sin él,
--   Postgres puede copiar la consulta dentro del filtro de cada línea.
create or replace function retail.fn_conteo_variantes_de_arranque(p_conteo_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with c as materialized (
    select c.id, c.ubicacion_id, c.sububicacion_id, c.alcance, c.alcance_categoria_id,
           retail.fn_arranque_por_categoria(c.sububicacion_id) as por_categoria
      from retail.conteos c
     where c.id = p_conteo_id
       and retail.fn_conteo_puede_ser_arranque(c.id)
  ),
  lineas as materialized (
    select ci.variante_id,
           case when c.por_categoria then p.categoria_id end as tramo
      from c
      join retail.conteo_items ci on ci.conteo_id = c.id
      join retail.variantes v on v.id = ci.variante_id
      join retail.productos p on p.id = v.producto_id
     where c.alcance = 'todo' or p.categoria_id = c.alcance_categoria_id
  ),
  pendientes as materialized (
    select t.tramo
      from (select distinct l.tramo from lineas l) t, c
     where retail.fn_conteo_arranque_pendiente(c.ubicacion_id, c.sububicacion_id, t.tramo, c.id)
  )
  select l.variante_id
    from lineas l
   where exists (select 1 from pendientes pe where pe.tramo is not distinct from l.tramo);
$fn$;

revoke all on function retail.fn_conteo_variantes_de_arranque(uuid) from public, anon, authenticated;

comment on function retail.fn_conteo_variantes_de_arranque(uuid) is
  'ADR-0328: las variantes del conteo cuyo ajuste de cierre sería de arranque (puede serlo, dentro del alcance y con su tramo '
  'pendiente: en el piso, por categoría). No mira si se contó entero. Interna: la usan cerrar_conteo y fn_conteo_detalle.';

-- Lectura para «Abrir un conteo»: por cada lugar donde se cuenta en la sede (piso y almacén; o toda la ubicación si no los separa),
-- una fila con categoria_id NULL que dice si un conteo de TODO ese lugar sería de arranque (en el piso: para alguna de las
-- categorías que tiene hoy); y, en el piso, una fila por cada categoría activa que dice si su próximo conteo sería el de arranque.
-- Nada si quien pregunta no opera la sede. Cambió sus columnas desde la primera versión: se elimina y se vuelve a crear.
drop function if exists retail.fn_conteo_arranque(uuid);

create or replace function retail.fn_conteo_arranque(p_ubicacion_id uuid)
returns table(sububicacion_id uuid, categoria_id uuid, arranque_pendiente boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with lugares as materialized (
    select s.id, retail.fn_arranque_por_categoria(s.id) as por_categoria
      from retail.sububicaciones s
     where s.ubicacion_id = p_ubicacion_id and s.tipo in ('piso_venta', 'almacen_tienda')
    union all
    select null::uuid, false
     where not exists (select 1 from retail.sububicaciones s
                        where s.ubicacion_id = p_ubicacion_id and s.tipo in ('piso_venta', 'almacen_tienda'))
  ),
  -- Las categorías que un conteo de TODO el piso traería hoy (la misma foto que abrir_conteo: stock positivo, sin la pieza del
  -- sistema). NULL = prendas sin categoría.
  tramos_hoy as materialized (
    select distinct st.sububicacion_id, p.categoria_id
      from retail.stock st
      join retail.variantes va on va.id = st.variante_id
      join retail.productos p on p.id = va.producto_id
      join lugares l on l.id = st.sububicacion_id and l.por_categoria
     where st.ubicacion_id = p_ubicacion_id
       and st.cantidad > 0
       and not retail.fn_producto_es_pieza_del_sistema(p.id)
  ),
  por_categoria as materialized (
    select l.id as sububicacion_id, cat.id as categoria_id,
           retail.fn_conteo_arranque_pendiente(p_ubicacion_id, l.id, cat.id, null) as pendiente
      from lugares l
      join retail.categorias cat on cat.activo
     where l.por_categoria
  )
  select l.id, null::uuid,
         case when not l.por_categoria then retail.fn_conteo_arranque_pendiente(p_ubicacion_id, l.id, null, null)
              else exists (select 1 from tramos_hoy t
                            where t.sububicacion_id = l.id
                              and coalesce((select pc.pendiente from por_categoria pc
                                             where pc.sububicacion_id = l.id and pc.categoria_id = t.categoria_id),
                                           retail.fn_conteo_arranque_pendiente(p_ubicacion_id, l.id, t.categoria_id, null))) end
    from lugares l
   where retail.fn_puede_operar_ubicacion(p_ubicacion_id)
  union all
  select pc.sububicacion_id, pc.categoria_id, pc.pendiente
    from por_categoria pc
   where retail.fn_puede_operar_ubicacion(p_ubicacion_id);
$fn$;

revoke all on function retail.fn_conteo_arranque(uuid) from public, anon;
grant execute on function retail.fn_conteo_arranque(uuid) to authenticated;

comment on function retail.fn_conteo_arranque(uuid) is
  'ADR-0328: por cada lugar de conteo de la sede (sububicacion_id; NULL = toda la ubicación), categoria_id NULL: si un conteo de '
  'TODO el lugar sería de arranque (en el piso, para alguna de sus categorías de hoy); y en el piso, por cada categoría activa, si '
  'su próximo conteo sería el de arranque. Lectura para «Abrir un conteo».';

-- cerrar_conteo: firma heredada, y el arranque se decide al cerrar (solo si se contó entero su tramo) y LÍNEA POR LÍNEA.
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
  v_de_arranque uuid[] := '{}'; -- ADR-0328 (arranque por tramo: líneas)$n$,
  1, 'ADR-0328 (arranque por tramo: líneas)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$  -- ADR-0189 (conteo-orden): el stock de las prendas con diferencia,$v$,
  $n$  -- ADR-0328 (arranque por tramo: decide) si el conteo se contó entero y de verdad (fn_conteo_vale_como_arranque), sus líneas
  -- cuyo tramo todavía no tuvo arranque desde el último cuadre del piso (el almacén entero; en el piso, cada categoría:
  -- fn_conteo_variantes_de_arranque) corrigen el stock con el motivo `conteo_arranque` (no son merma ni entran en la exactitud).
  -- Las demás, con `conteo`. Un conteo que ya fue el de arranque lo sigue siendo al corregirlo, mientras no se haya cerrado otro
  -- que cubra su tramo.
  if retail.fn_conteo_vale_como_arranque(c.id) then
    v_de_arranque := array(select retail.fn_conteo_variantes_de_arranque(c.id));
  end if;

  -- ADR-0189 (conteo-orden): el stock de las prendas con diferencia,$n$,
  1, 'ADR-0328 (arranque por tramo: decide)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$`tipo = 'ajuste'`, `motivo = 'conteo'` y lleva `conteo_item_id`$v$,
  $n$`tipo = 'ajuste'`, `motivo = 'conteo'` (o `conteo_arranque`, ADR-0328 (arranque por tramo: nota)) y lleva `conteo_item_id`$n$,
  1, 'ADR-0328 (arranque por tramo: nota)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$'ajuste', v_dif, 'conteo', r.id, v_persona)$v$,
  $n$'ajuste', v_dif,
                case when r.variante_id = any(v_de_arranque) then 'conteo_arranque' else 'conteo' end, -- ADR-0328 (arranque por tramo: ajuste)
                r.id, v_persona)$n$,
  1, 'ADR-0328 (arranque por tramo: ajuste)'
);
select pg_temp.reemplazar(
  'retail.cerrar_conteo(uuid, boolean)',
  $v$update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona where id = p_conteo_id;$v$,
  $n$-- ADR-0328 (arranque por tramo: marca) el de arranque de algún tramo; uno que lo fue lo sigue siendo.
  update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona,
         es_arranque = es_arranque or cardinality(v_de_arranque) > 0
   where id = p_conteo_id;$n$,
  1, 'ADR-0328 (arranque por tramo: marca)'
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

-- El detalle: si el conteo fue el de arranque, si TODAVÍA puede serlo (abierto y con alguna línea cuyo tramo sigue pendiente:
-- fn_conteo_variantes_de_arranque), si en su lugar el arranque es por categoría (el piso: la pantalla lo dice así), si se abrió
-- hoy y si quien lo abrió sigue de turno (la pantalla de cerrar sabe sin adivinar si una terminal hereda la firma o tiene que
-- preguntarla: las mismas dos condiciones de fn_firma_heredada).
select pg_temp.reemplazar(
  'retail.fn_conteo_detalle(uuid)',
  $v$'es_prueba', c.es_prueba)$v$,
  $n$'es_prueba', c.es_prueba,
           -- ADR-0328 (conteo-detalle por tramo)
           'es_arranque', c.es_arranque,
           'arranque_posible', (c.estado = 'abierto' and exists (select 1 from retail.fn_conteo_variantes_de_arranque(c.id))),
           'arranque_por_categoria', retail.fn_arranque_por_categoria(c.sububicacion_id),
           'abierto_hoy', (c.created_at at time zone 'America/Lima')::date = retail.fn_hoy_lima(),
           'abierto_por_presente', case when c.abierto_por is null then null
                                        else retail.fn_persona_presente(c.abierto_por, c.ubicacion_id, now()) end)$n$,
  1, 'ADR-0328 (conteo-detalle por tramo)'
);

-- PROMETE: en un conteo abierto, anota de una vez en las variantes pedidas que siguen PENDIENTES (sin cifra, con algo esperado
--   y sin haberse contado antes) lo que CAYLA dice que hay AHORA en el lugar del conteo, y las marca «aplicada sin contar». Todo
--   o nada. Devuelve {aplicadas, lineas}: cuántas anotó y las líneas pedidas tal como quedaron (fn_conteo_lineas_json).
-- NO TOCA las que están «en reconteo» (`contada_anterior` con valor): alguien ya contó ahí y vio una diferencia, y ADR-0282 dice
--   que una diferencia se confirma o se vuelve a contar. Aplicarle lo esperado la borraba sin que nadie la mirara y el stock no
--   se corregía (revisión adversarial del 2026-10-04, escena E). Esas se cuentan a mano.
-- ASUME: la pantalla manda las variantes que ve pendientes; las que ya tienen cifra, las ignoradas, las en reconteo y las que no
--   son del conteo no se tocan, así que repetirla no cambia nada (idempotente por su estado: no necesita marca de reintento; un
--   reintento devuelve aplicadas = 0 con las líneas ya marcadas, y la pantalla lo dice). Mismos permisos, firma y orden de
--   candados que conteo_contar: primero el conteo (`for update`), después el stock (`for share`, en el orden de
--   fn_bloquear_en_orden). Una venta en curso termina antes de que se lea su prenda; la que llega después espera.
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

  -- Las pendientes que nadie contó todavía: sin cifra y con algo esperado. Las «en reconteo» (sin cifra pero con
  -- `contada_anterior`) quedan fuera: ahí alguien ya vio una diferencia. En orden de variante: el mismo de los candados.
  v_ids := array(
    select ci.variante_id
      from retail.conteo_items ci
     where ci.conteo_id = p_conteo_id
       and ci.variante_id = any(coalesce(p_variantes, '{}'::uuid[]))
       and ci.cantidad_contada is null
       and ci.contada_anterior is null
       and coalesce(ci.cantidad_foto, 0) > 0
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
  'ADR-0328: «Aplicar todos completos». Anota en las variantes pedidas que siguen pendientes (no las en reconteo) lo que hay ahora '
  '(stock bajo candado) y las marca aplicada_sin_contar (no suben la exactitud ni valen para el arranque). Todo o nada; '
  'idempotente. Devuelve {aplicadas, lineas}.';

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
