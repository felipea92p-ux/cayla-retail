-- ADR-0387 · Compras: el módulo es la llave — actividad 1 de la fase 2 de ADR-0362 (Felipe 2026-10-12).
--
-- EL PROBLEMA PRIMERO. Felipe, al aprobar la fase 2: «quitar las validaciones de líder: solo tienes el módulo puede hacer todo en él, seas
-- líder o no», en todo Compras. Hoy, aunque la persona tenga el módulo, hay cosas que solo hace un líder:
--   · Plan de campaña: crear, editar, quitar y restaurar una campaña, y fijar su tope (las cinco pedían el módulo Y ser líder).
--   · Facturas de proveedor: cambiar la tienda que gestiona un comprobante.
--   · Recibir mercadería: confirmar un costo fuera de lo normal (`fn_costo_fuera_de_banda`).
-- Y quien recibe no ve los costos de lo que recibe si no tiene además Facturas, Por pagar o Notas de crédito, aunque Felipe ya había
-- decidido que «todo el que recibe ve los precios» (ADR-0362, decisión 18).
--
-- QUÉ HACE.
--   1. Las cinco funciones del Plan de campaña ya no piden además ser líder; el módulo `plan_compra` se sigue pidiendo.
--   2. `cambiar_tienda_gestora_compra` pide el módulo Facturas de proveedor (`fn_puede_registrar_facturas_compra`: líder o el módulo).
--   3. `fn_ve_costos_al_recibir()` (NUEVA): quien ve la plata de Compras o tiene Recibir. Es la decisión 18 dentro de Recibir, y nada
--      más: la regla general (`fn_puede_ver_dinero_de_compras`) NO cambia, porque también cuida los costos de Catálogo y los tableros de
--      Facturas y Por pagar, que no son de Recibir (abrirla a Recibir habría dejado ver esos tableros a quien solo recibe).
--   4. `recibir_envio` y `recibir_lote`: el costo atípico lo confirma quien ve los costos al recibir, con `"confirma_costo": true` como
--      antes el líder. Quien no los ve (un rol sin Recibir ni plata de Compras) sigue recibiendo `costo_atipico_sin_lider` SIN cifras:
--      no se le filtra ni costo ni precio. El código del error no cambia, para que la web publicada lo siga entendiendo. La nota que
--      queda dice «Costo atípico confirmado (…)», sin «por un líder», que ya no sería cierto.
-- Lo que NO cambia aquí (actividad 2 de la misma fase): qué tiendas ve cada uno, a nombre de quién se paga y recibir en una tienda una
-- línea asignada a otra.
--
-- CÓMO. Reemplazos ANCLADOS sobre la definición viva (el ayudante de 20261012120000): cada pedazo se busca tal cual está en producción
-- (huellas de las nueve funciones comparadas el 2026-10-12: banco = producción), la migración aborta SIN TOCAR NADA si una función
-- cambió y no hace nada si ya está aplicada. `fn_ve_costos_al_recibir` se crea entera, ANTES de los reemplazos que la usan.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: funciones y comentarios, SIN tablas, políticas ni disparadores.
-- Idempotente. ORDEN con la web: da igual (la web de antes sigue funcionando; solo deja de recibir el «solo un líder» de la base).

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012120000): falla si la función viva cambió, y es re-ejecutable.
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

-- 3. Quién ve los costos AL RECIBIR (decisión 18 de ADR-0362, ADR-0387): la plata de Compras, o el módulo Recibir.
create or replace function retail.fn_ve_costos_al_recibir()
 returns boolean
 language sql
 stable
 set search_path to 'retail', 'public', 'extensions'
as $function$ select retail.fn_puede_ver_dinero_de_compras() or retail.fn_capacidad_por_modulos(array['recibir']); $function$;
revoke all on function retail.fn_ve_costos_al_recibir() from public, anon;
grant execute on function retail.fn_ve_costos_al_recibir() to authenticated;
comment on function retail.fn_ve_costos_al_recibir() is
  'ADR-0387 (2026-10-12; decisión 18 de ADR-0362: «todo el que recibe ve los precios»): quien ve la plata de Compras (fn_puede_ver_dinero_de_compras) o tiene el módulo Recibir. Solo para lo que pasa DENTRO de Recibir: confirmar un costo atípico. La regla general del dinero de Compras no cambia.';


-- 1. Plan de campaña: crear, editar, quitar, restaurar y el tope, con el módulo y sin el «y ser líder».
select pg_temp.reemplazar(
  'retail.crear_plan_compra(uuid,text,date,date)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder crea una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave en Compras; aquí ya no se pide además ser líder.
$v$,
  1);
select pg_temp.reemplazar(
  'retail.editar_plan_compra(uuid,text,date,date)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder edita una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave en Compras; aquí ya no se pide además ser líder.
$v$,
  1);
select pg_temp.reemplazar(
  'retail.quitar_plan_compra(uuid)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder quita una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave en Compras; aquí ya no se pide además ser líder.
$v$,
  1);
select pg_temp.reemplazar(
  'retail.restaurar_plan_compra(uuid)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder restaura una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave en Compras; aquí ya no se pide además ser líder.
$v$,
  1);
select pg_temp.reemplazar(
  'retail.guardar_plan_compra_tope(uuid,numeric)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder fija cuánto invertir en una campaña'
      using errcode = '42501', hint = 'plan_compra_tope_solo_lider';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave en Compras; aquí ya no se pide además ser líder.
$v$,
  1);

-- El % de lo que sobra (`guardar_plan_compra_recupero`, que trajo main con el PR #977, migración 20261012161000): también solo el módulo.
select pg_temp.reemplazar(
  'retail.guardar_plan_compra_recupero(uuid,integer)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder fija a qué %% se vende lo que sobra' using errcode = '42501', hint = 'plan_compra_solo_lider';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave en Compras; aquí ya no se pide además ser líder.
$v$,
  1);

-- 2. Cambiar la tienda que gestiona un comprobante: el módulo Facturas de proveedor.
select pg_temp.reemplazar(
  'retail.cambiar_tienda_gestora_compra(uuid,uuid)',
  $v$  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede cambiar la tienda que gestiona un comprobante' using errcode = '42501';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el módulo es la llave; antes, solo un líder.
  if not retail.fn_puede_registrar_facturas_compra() then
    raise exception 'Cambiar la tienda que gestiona un comprobante necesita el módulo «Facturas de proveedor» en tu rol' using errcode = '42501';
  end if;
$v$,
  1);

-- 4. Recibir: el costo atípico lo confirma quien ve los costos al recibir, y la nota ya no dice «por un líder».
select pg_temp.reemplazar(
  'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
  $v$    if not v_es_lider then
      raise exception 'costo_atipico_sin_lider';
    end if;
$v$,
  $v$    -- ADR-0387 (2026-10-12): lo confirma quien ve los costos al recibir (antes, solo un líder); quien no los ve recibe el aviso sin cifras.
    if not retail.fn_ve_costos_al_recibir() then
      raise exception 'costo_atipico_sin_lider';
    end if;
$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
  $v$'Costo atípico confirmado por un líder ('$v$,
  $v$'Costo atípico confirmado ('$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
  $v$Quien NO es líder no puede recibir un extra
  -- atípico con ese costo (su salida: recibirlo sin costo, que es opcional, o pedir a un líder que lo confirme); el líder confirma
$v$,
  $v$Quien no ve los costos al recibir no puede recibir un
  -- extra atípico con ese costo (su salida: recibirlo sin costo, que es opcional, o pedir que lo confirme quien los ve; ADR-0387); quien los ve confirma
$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)',
  $v$    if not retail.fn_es_lider() then
      raise exception 'costo_atipico_sin_lider';
    end if;
$v$,
  $v$    -- ADR-0387 (2026-10-12): lo confirma quien ve los costos al recibir (antes, solo un líder); quien no los ve recibe el aviso sin cifras.
    if not retail.fn_ve_costos_al_recibir() then
      raise exception 'costo_atipico_sin_lider';
    end if;
$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)',
  $v$'Costo atípico confirmado por un líder ('$v$,
  $v$'Costo atípico confirmado ('$v$,
  1);

comment on function retail.cambiar_tienda_gestora_compra(uuid, uuid) is
  'ADR-0184; ADR-0387 (2026-10-12): pide el módulo Facturas de proveedor (fn_puede_registrar_facturas_compra), ya no solo el líder. Pasa la gestión de un comprobante a otra tienda que tenga parte en su reparto.';
comment on function retail.recibir_lote(uuid, uuid, jsonb, text, text, uuid) is
  'Recibe un lote sin factura: entrada al stock y, si la línea trae costo, promedio ponderado. Si el costo de alguna línea es atípico (fn_costo_fuera_de_banda) quien ve los costos al recibir (fn_ve_costos_al_recibir: la plata de Compras o el módulo Recibir) debe confirmarlo con "confirma_costo": true en esa línea; quien no los ve no puede recibirla con ese costo (ADR-0387, 2026-10-12: antes, solo un líder).';
comment on function retail.guardar_plan_compra_tope(uuid, numeric) is
  'ADR-0372: fija (o quita, con NULL) el tope de inversión de una campaña. Pide el módulo plan_compra (ADR-0387, 2026-10-12: ya no además ser líder); firma el responsable del combo (fn_actor_persona_id(true)). El tope solo avisa: no bloquea ningún plan.';
comment on function retail.crear_plan_compra(uuid, text, date, date) is
  'ADR-0372: crea el plan de una campaña de Etiquetas (aprobada, activa, con fechas): una sola por etiqueta. Arranca con las fechas de la etiqueta, que se pueden ajustar. Pide el módulo plan_compra (ADR-0387, 2026-10-12: ya no además ser líder); firma el responsable (fn_actor_persona_id(true)).';
comment on function retail.editar_plan_compra(uuid, text, date, date) is
  'ADR-0372 (B5): cambia el nombre y las fechas de una campaña del plan (la etiqueta no cambia). Pide el módulo plan_compra (ADR-0387, 2026-10-12: ya no además ser líder); firma el responsable del combo (fn_actor_persona_id(true)).';
comment on function retail.quitar_plan_compra(uuid) is
  'ADR-0372 (B5): quita una campaña del plan. Vacía (sin categorías armadas ni tope): la borra. Con algo: la archiva (sale del selector, conserva todo). Pide el módulo plan_compra (ADR-0387, 2026-10-12: ya no además ser líder). Devuelve {id, accion: borrado|archivado, nombre}.';
comment on function retail.restaurar_plan_compra(uuid) is
  'ADR-0372 (B5): devuelve al selector una campaña archivada. Pide el módulo plan_compra (ADR-0387, 2026-10-12: ya no además ser líder); firma el responsable del combo (queda como su última edición).';

-- Validación: no quedó ningún «solo un líder» en lo que esta migración toca.
do $g$
declare
  v_firma text;
begin
  foreach v_firma in array array['retail.crear_plan_compra(uuid,text,date,date)', 'retail.editar_plan_compra(uuid,text,date,date)',
    'retail.quitar_plan_compra(uuid)', 'retail.restaurar_plan_compra(uuid)', 'retail.guardar_plan_compra_tope(uuid,numeric)',
    'retail.guardar_plan_compra_recupero(uuid,integer)', 'retail.cambiar_tienda_gestora_compra(uuid,uuid)'] loop
    if position('fn_es_lider' in pg_get_functiondef(v_firma::regprocedure)) > 0 then
      raise exception '% todavía pregunta si es líder', v_firma;
    end if;
  end loop;
  foreach v_firma in array array['retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)', 'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)'] loop
    if position('fn_ve_costos_al_recibir() then' in pg_get_functiondef(v_firma::regprocedure)) = 0
       or position('confirmado por un líder' in pg_get_functiondef(v_firma::regprocedure)) > 0 then
      raise exception '% todavía reserva el costo atípico al líder', v_firma;
    end if;
  end loop;
  if position('fn_puede_registrar_facturas_compra' in pg_get_functiondef('retail.cambiar_tienda_gestora_compra(uuid,uuid)'::regprocedure)) = 0
     or position('notas_credito''])' in pg_get_functiondef('retail.fn_puede_ver_dinero_de_compras()'::regprocedure)) = 0 then
    raise exception 'ADR-0387: la tienda gestora no quedó por módulo, o la regla general de la plata de Compras cambió';
  end if;
end;
$g$;

reset lock_timeout;
