-- ADR-0605 · Cancelar la recepción de un envío que llegó SIN AVISO y se abrió (Felipe 2026-11-03: «se debe poder cancelar alguna recepción de mercadería»).
--
-- EL PROBLEMA PRIMERO. Alguien abre «Sin aviso» en la sede (ENV-000004), o lo abre por error, o llegó a otra sede, y no hay cómo deshacerlo: un envío
-- abierto solo se puede seguir, cerrar y, cerrado, reabrir. `anular_envio` existe, pero solo para uno EN CAMINO y desde Órdenes de compra. El resultado:
-- un envío fantasma en la lista de la sede para siempre, y lo que se contó en él, dando vueltas.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despachos_apertura`: un envío ANULADO puede conservar quién y cuándo lo abrió (hoy exige que no los tenga, porque solo se anulaba en camino). Sigue
--      siendo «los dos o ninguno»; abierto y cerrado siguen exigiéndolos y en camino sigue sin tenerlos.
--   2. `fn_despachos_camino` (REEMPLAZO ANCLADO): deja pasar abierto → anulado SOLO desde `cancelar_recepcion_envio` (lo avisa con `retail.cancelando`).
--   3. `cancelar_recepcion_envio(p_despacho_id, p_version, p_motivo)`: abierto → anulado, con quién, cuándo y por qué (hasta 300 letras).
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Un envío anulado sin quién, cuándo y por qué → `despachos_anulacion` (ya existía).
--   · Cancelar uno que ya metió prendas al stock (se cerró alguna vez, o tiene lo recibido) → la función se niega; para corregirlo se reabre y se cuadra.
--   · Cancelar uno que vino de Compras → la función se niega (hint envio_con_aviso_no_se_cancela): ese volvería a «en camino», y eso toca más candados
--     (quién y cuándo lo abrió); queda para la siguiente decisión, no se adivina aquí.
--   · Pasar de abierto a anulado por otro camino que no sea esta función → `fn_despachos_camino`.
--
-- CONTRATO de cancelar_recepcion_envio
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (decisión 17), un envío SIN AVISO ABIERTO que nunca se cerró queda ANULADO con su motivo;
--            lo que se contó en él queda como historia (no se borra) y lo pendiente de decir qué es se anula. Todo o nada. Repetirlo igual responde sin
--            cambiar nada.
--   ASUME:   la pantalla dice la versión que vio.
--   NO HACE: no toca stock (un envío que nunca se cerró no metió nada), no crea ni borra prendas, no cancela uno de Compras ni uno cerrado.
--
-- DESCARTÉ:
--   · Un estado nuevo «cancelado»: el estado `anulado` ya significa «ya no llega» en todas las lecturas (lista, filtros, «Nos debe»); uno más las rompería.
--   · Borrar las filas de lo contado: nunca se borra historia (CLAUDE.md); quedan atadas a un envío anulado, que ninguna lectura de la sede muestra.
--   · Dejar volver a «en camino» a un envío con aviso en esta misma migración: exige borrar quién y cuándo lo abrió y revisar cada candado de recepción.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261014205000: cambia un candado de `despachos` (tabla chica; `drop/add
-- constraint`, sin políticas: ADR-0195), reemplaza una función con ancla (aborta sin tocar nada si cambió y no hace nada si ya está) y crea una función.
-- Sin `drop trigger`, sin `select … into` dentro de textos entre comillas (ADR-0288). Se puede pegar dos veces. El bloque final comprueba todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. Un envío anulado puede recordar quién y cuándo lo abrió ----------
alter table retail.despachos drop constraint if exists despachos_apertura;
alter table retail.despachos add constraint despachos_apertura check (
  case when estado in ('abierto', 'cerrado') then abierto_por is not null and abierto_en is not null
       when estado = 'anulado' then (abierto_por is null) = (abierto_en is null)
       else abierto_por is null and abierto_en is null end);

-- ---------- 2. Abierto → anulado, solo desde la función ----------
-- OJO con el NULL: sin la marca puesta, `current_setting(…, true)` es NULL y `… = 'si'` también; dentro de un AND con lo demás verdadero daría NULL y todo el
-- `not (… or NULL)` dejaría pasar el cambio. Por eso el `coalesce` (la prueba F2 lo vigila con un UPDATE a mano).
-- OJO con el lugar: la cláusula va como un `and not (…)` APARTE, ANTES de la lista de caminos permitidos, y no al final de esa lista: `reabrir_envio` (20261013180000)
-- ancla su reemplazo en el texto `… = 'si')) then` y varias pruebas viejas la recargan; si la mía quedara pegada a ese final, el ancla de «reabrir» ya no calzaría.
select pg_temp.reemplazar(
  'retail.fn_despachos_camino()',
  $v$and not ((old.estado = 'en_camino' and new.estado in ('abierto', 'anulado'))$v$,
  $v$and not (old.estado = 'abierto' and new.estado = 'anulado' and coalesce(current_setting('retail.cancelando', true), '') = 'si')
     -- ADR-0605: cancelar la recepción de un envío sin aviso, solo desde cancelar_recepcion_envio (lo avisa con retail.cancelando).
     and not ((old.estado = 'en_camino' and new.estado in ('abierto', 'anulado'))$v$,
  1);
-- La primera versión de esta migración (ya pegada en producción el 2026-11-03) ponía la cláusula al final de la lista; si está, se quita. En una base nueva no está.
do $d$
declare
  v_def text := pg_get_functiondef('retail.fn_despachos_camino()'::regprocedure);
  v_viejo text := $v$
              -- ADR-0605: cancelar la recepción de un envío sin aviso, solo desde cancelar_recepcion_envio (lo avisa con retail.cancelando).
              or (old.estado = 'abierto' and new.estado = 'anulado' and coalesce(current_setting('retail.cancelando', true), '') = 'si')$v$;
begin
  if position(v_viejo in v_def) > 0 then
    execute replace(v_def, v_viejo, '');
  end if;
end;
$d$;

-- ---------- 3. Cancelar ----------
create or replace function retail.cancelar_recepcion_envio(p_despacho_id uuid, p_version integer, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_sin_aviso boolean;
  v_pendientes integer;
  v_version integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Cancelar una recepción necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- El envío en exclusiva: cancelar y contar o cerrar a la vez se ponen en fila, y el segundo ve lo que dejó el primero.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_sin_aviso := exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id);

  if v_despacho.estado = 'anulado' then
    -- Doble clic o reintento sin red: la misma cancelación responde sin repetirse.
    if v_sin_aviso and v_despacho.motivo_anulacion is not distinct from v_motivo and v_despacho.anulado_por = v_actor then
      return jsonb_build_object('despacho_id', p_despacho_id, 'numero', v_envio, 'estado', v_despacho.estado,
                                'version', v_despacho.version, 'repetido', true);
    end if;
    raise exception 'Este envío ya estaba anulado' using hint = 'envio_ya_anulado';
  end if;
  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió: no se cancela; si algo no cuadra, reábrelo para corregirlo' using hint = 'envio_cerrado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió en la sede: se anula desde Compras' using hint = 'envio_sin_abrir';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if not v_sin_aviso then
    raise exception 'Este envío vino de Compras: no se cancela desde la sede' using hint = 'envio_con_aviso_no_se_cancela';
  end if;
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío mientras lo mirabas: recarga la pantalla' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Escribe por qué se cancela (por ejemplo, «se abrió por error»)' using hint = 'cancelar_motivo';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'cancelar_motivo';
  end if;
  -- Lo que ya entró al stock no se deshace: un envío que se cerró alguna vez (y se reabrió) o que ya tiene lo recibido se cuadra, no se cancela.
  if exists (select 1 from retail.despacho_cierres c where c.despacho_id = p_despacho_id)
     or exists (select 1 from retail.despacho_recibidos r where r.despacho_id = p_despacho_id) then
    raise exception 'Este envío ya metió prendas al stock: no se cancela; cuádralo y ciérralo' using hint = 'envio_ya_tuvo_stock';
  end if;

  perform set_config('retail.cancelando', 'si', true);
  begin
    update retail.despachos d
       set estado = 'anulado', anulado_por = v_actor, anulado_en = now(), motivo_anulacion = v_motivo
     where d.id = p_despacho_id;
  exception when others then
    perform set_config('retail.cancelando', '', true);
    raise;
  end;
  perform set_config('retail.cancelando', '', true);

  -- Lo que faltaba decir qué era ya no hace falta decirlo.
  update retail.despacho_pendientes x
     set estado = 'anulado', resuelto_por = v_actor, resuelto_en = now()
   where x.despacho_id = p_despacho_id and x.estado = 'pendiente';
  get diagnostics v_pendientes = row_count;
  v_version := (select d.version from retail.despachos d where d.id = p_despacho_id);

  -- Actividad (ADR-0207): «canceló la recepción de ENV-000004: se abrió por error». Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_cancelado', 'canceló la recepción de ' || v_envio || ': ' || v_motivo,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'motivo', v_motivo, 'pendientes_anulados', v_pendientes),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la cancelación del envío % (%)', v_envio, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'numero', v_envio, 'estado', 'anulado', 'version', v_version,
                            'pendientes_anulados', v_pendientes, 'repetido', false);
end;
$$;
comment on function retail.cancelar_recepcion_envio(uuid, integer, text) is
  'ADR-0605: abierto → anulado para un envío que llegó SIN AVISO y nunca se cerró, con motivo (3 a 300 letras), quién y cuándo. Lo contado queda como '
  'historia; lo pendiente se anula; el stock no se toca. Módulo Recibir, su sede y la decisión 17; firma el responsable. Los de Compras (hint '
  'envio_con_aviso_no_se_cancela), los cerrados y los que ya metieron stock (envio_ya_tuvo_stock) se niegan. Versión vieja: PT409. '
  'Devuelve {despacho_id, numero, estado, version, pendientes_anulados, repetido}.';
revoke all on function retail.cancelar_recepcion_envio(uuid, integer, text) from public, anon;
grant execute on function retail.cancelar_recepcion_envio(uuid, integer, text) to authenticated, service_role;

-- ---------- 4. Comprobación ----------
do $$
begin
  if not (select p.prosecdef from pg_proc p where p.oid = 'retail.cancelar_recepcion_envio(uuid,integer,text)'::regprocedure)
     or has_function_privilege('anon', 'retail.cancelar_recepcion_envio(uuid,integer,text)', 'execute')
     or not has_function_privilege('authenticated', 'retail.cancelar_recepcion_envio(uuid,integer,text)', 'execute') then
    raise exception 'cancelar_recepcion_envio: security definer, la ejecuta authenticated y no anon';
  end if;
  if position($t$coalesce(current_setting('retail.cancelando', true), '') = 'si'$t$ in pg_get_functiondef('retail.fn_despachos_camino()'::regprocedure)) = 0 then
    raise exception 'falta el reemplazo: cancelar la recepción en el camino del envío';
  end if;
  -- Una sola vez, y sin pegarle al final de la lista de «reabrir».
  if (length(pg_get_functiondef('retail.fn_despachos_camino()'::regprocedure))
      - length(replace(pg_get_functiondef('retail.fn_despachos_camino()'::regprocedure), 'retail.cancelando', ''))) / length('retail.cancelando') <> 2
     or position($t$or (old.estado = 'abierto' and new.estado = 'cerrado')
              -- ADR-0393: reabrir un envío ya recibido, solo desde reabrir_envio (lo avisa con retail.reabriendo).
              or (old.estado = 'cerrado' and new.estado = 'abierto' and current_setting('retail.reabriendo', true) = 'si')) then$t$
          in pg_get_functiondef('retail.fn_despachos_camino()'::regprocedure)) = 0 then
    raise exception 'fn_despachos_camino: la cláusula de cancelar debe estar una vez y el bloque de reabrir intacto';
  end if;
end;
$$;

reset lock_timeout;
