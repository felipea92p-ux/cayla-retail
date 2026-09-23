-- =====================================================================================================================
-- Paso 1 de 3 (código, ADITIVO, no toca las 25 filas reales) del rename de valor `colaboradores.rol`:
-- 'colaborador' → 'integrante'. Decidido con Felipe 2026-09-23: código primero (tolera ambos valores), migración de
-- datos después por separado (Paso 2, solo Felipe + Dany, checklist PL-87: ensayo + sonda + registro), y al final
-- Paso 3 cierra el constraint a solo ('lider','integrante') y retira el soporte del valor viejo.
--
-- POR QUÉ EN TRES PASOS Y NO UNO SOLO. El código (Vercel) y el SQL (pegado a mano en el editor de Supabase) no se
-- despliegan de forma atómica — no hay una sola transacción que cubra ambos. Empaquetarlos en "un solo PR" no da
-- atomicidad real: solo obliga a elegir un orden, y en cualquiera de los dos hay una ventana con código y datos en
-- desacuerdo mientras 25 cuentas reales operan tiendas y el taller en vivo. Este paso elimina esa ventana: ensancha
-- lo que la base acepta SIN dejar de aceptar lo que ya hay, y el código nuevo escribe 'integrante' pero sigue leyendo
-- 'colaborador' sin romperse. Puede pegarse y desplegarse en cualquier orden, con la app funcionando de principio a fin.
--
-- QUÉ TOCA. De 19 funciones que mencionan 'lider' o 'colaborador' en producción, solo 4 dependen de verdad del valor
-- 'colaborador' (las demás comparan contra 'lider', que no cambia, o son falsos positivos: `cerrar_caja` usa 'lider'
-- como destino de un traslado de efectivo, nada que ver con roles). Las 4: `agregar_colaborador` y `asignar_rol`
-- (escriben el valor — pasan a escribir 'integrante'), `fn_mi_perfil` y `reactivar_colaborador` (lo comparan — pasan
-- a `<> 'lider'`, eliminando el caso especial: así no importa cuál de los dos valores tenga la fila, ni ahora ni
-- después del Paso 2). Los 2 constraints de cada tabla (`colaboradores`, `colaboradores_suspendidos`) se ensanchan
-- para aceptar 'integrante' además de 'colaborador' — ninguna fila existente se toca.
--
-- PRODUCCIÓN: se pega con `set search_path to retail, public;` al principio (las funciones ya van calificadas).
-- Re-ejecutable: cada reemplazo de función se salta solo si ya está aplicado (mismo patrón que 20260923230000).
-- =====================================================================================================================

create or replace function pg_temp.reemplazar_una(p_firma text, p_viejo text, p_nuevo text)
returns void language plpgsql as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise notice '% no existe en esta base; se omite (al pegar su migración, volver a pegar esta).', p_firma;
    return;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. Constraints: aceptar también 'integrante' (aditivo, cero filas tocadas) ====================
alter table retail.colaboradores drop constraint if exists colaboradores_rol_check;
alter table retail.colaboradores add constraint colaboradores_rol_check
  check (rol = any (array['lider', 'colaborador', 'integrante']));

alter table retail.colaboradores drop constraint if exists colaboradores_terminal_valida;
alter table retail.colaboradores add constraint colaboradores_terminal_valida
  check (terminal is null or (terminal = any (array['ventas', 'administrativa']) and rol = any (array['colaborador', 'integrante'])));

alter table retail.colaboradores_suspendidos drop constraint if exists colaboradores_suspendidos_rol_check;
alter table retail.colaboradores_suspendidos add constraint colaboradores_suspendidos_rol_check
  check (rol = any (array['lider', 'colaborador', 'integrante']));

alter table retail.colaboradores_suspendidos drop constraint if exists colaboradores_suspendidos_terminal_valida;
alter table retail.colaboradores_suspendidos add constraint colaboradores_suspendidos_terminal_valida
  check (terminal is null or (terminal = any (array['ventas', 'administrativa']) and rol = any (array['colaborador', 'integrante'])));

-- ==================== 2. agregar_colaborador: la alta nueva escribe 'integrante' ====================
select pg_temp.reemplazar_una(
  'retail.agregar_colaborador(uuid, uuid)',
  $v$values (p_persona_id, v_quien, 'colaborador', p_ubicacion_id, 'pendiente_aprobacion')$v$,
  $n$values (p_persona_id, v_quien, 'integrante', p_ubicacion_id, 'pendiente_aprobacion')$n$);

select pg_temp.reemplazar_una(
  'retail.agregar_colaborador(uuid, uuid)',
  $v$perform retail.fn_historial_colaborador(p_persona_id, 'alta', 'colaborador', null, p_ubicacion_id, null);$v$,
  $n$perform retail.fn_historial_colaborador(p_persona_id, 'alta', 'integrante', null, p_ubicacion_id, null);$n$);

-- ==================== 3. asignar_rol: bajar de líder (o asignar un rol no-líder) escribe 'integrante' ====================
select pg_temp.reemplazar_una(
  'retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$retail.colaboradores
         set rol = 'colaborador'$v$,
  $n$retail.colaboradores
         set rol = 'integrante'$n$);

select pg_temp.reemplazar_una(
  'retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$retail.colaboradores_suspendidos
         set rol = 'colaborador'$v$,
  $n$retail.colaboradores_suspendidos
         set rol = 'integrante'$n$);

-- ==================== 4. fn_mi_perfil: la ubicación se lee igual sea 'colaborador' o 'integrante' ====================
select pg_temp.reemplazar_una(
  'retail.fn_mi_perfil()',
  $v$or (c.rol = 'colaborador' and ubi.id = c.ubicacion_asignada_id)$v$,
  $n$or (c.rol <> 'lider' and ubi.id = c.ubicacion_asignada_id)$n$);

-- ==================== 5. reactivar_colaborador: la validación de ubicación aplica a cualquier no-líder ====================
select pg_temp.reemplazar_una(
  'retail.reactivar_colaborador(uuid)',
  $v$if v_fila.rol = 'colaborador'$v$,
  $n$if v_fila.rol <> 'lider'$n$);
