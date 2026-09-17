-- ============================================================================
-- 20260917141500_registrar_consumo_insumo.sql — CAYLA V2
--
-- D-47 (docs/datos/DECISIONES-2026-09-12.md:242-244): "la tela entra, se
-- descuenta al cortar, y avisa cuando falta". La entrada y el ajuste por
-- conteo YA EXISTEN en producción, huérfanos, sin usar (`retail.recibir_insumo`/
-- `retail.ajustar_insumo_por_conteo`, espejadas en local por
-- `20260917140000_insumos_taller_reconstruido.sql`). Lo único que de verdad
-- faltaba construir es ESTO: el consumo real al cortar. Decisiones completas
-- (por qué se adoptó el esquema huérfano en vez del construido más temprano
-- hoy, por qué el candado de concurrencia es por LOTE) en ADR-0090.
--
-- Qué hace: `retail.registrar_consumo_insumo(p_produccion_id, p_insumo_id,
-- p_cantidad, p_nota)` — UN consumo de UN insumo en UNA producción por
-- llamada (sin lote a elegir a mano: la función elige el lote más antiguo con
-- saldo). Sin bridge table: `movimientos_insumo.produccion_id` ya liga
-- consumo↔corrida, así que no hace falta una `produccion_insumos` aparte
-- (esa tabla existía en el diseño de hoy que se descartó — ver ADR-0090).
--
-- El candado de concurrencia es un `for update` sobre la FILA DE
-- `insumo_lotes` elegida (no hay una tabla de "stock" materializada que
-- bloquear en este esquema, a diferencia del núcleo de `stock`/
-- `fn_aplicar_movimiento`) — recalcula el saldo remanente de ESE lote
-- DESPUÉS de tomar el lock, nunca antes, exactamente para que dos cortes
-- concurrentes del mismo lote no lean el mismo "quedan 6,5 m" y los dos
-- completen. Además bloquea la fila de `producciones` desde el inicio (mismo
-- orden que ya usa `cerrar_produccion`: `producciones` primero, después el
-- detalle) — no por lo que pide el candado del lote, sino porque
-- `costo_tela`/`costo_avios` se recalculan con un SUM sobre todo el
-- historial de esa producción: sin ese lock, dos consumos concurrentes del
-- MISMO tipo (dos telas distintas, misma corrida) podrían pisarse el costo
-- uno al otro (cada UPDATE vería solo su propia fila todavía no comprometida
-- del otro). Ver ADR-0090 para el detalle completo de esta decisión, que el
-- encargo original no pedía explícitamente pero principio 2 (cero estados
-- inconsistentes) sí.
--
-- NO parte automáticamente el consumo entre varios lotes (alcance chico a
-- propósito, principio 5: un Taller de una sola ubicación) — si el lote más
-- antiguo con saldo no alcanza, rechaza con un mensaje que dice cuánto hay y
-- sugiere una segunda llamada. Si no hay NINGÚN lote con saldo > 0, mensaje
-- distinto ("no hay stock").
--
-- Exige `producciones.estado = 'en_proceso'` — se registra ANTES de cerrar,
-- nunca después. `cerrar_produccion` (20260915130000, sin tocar acá) sigue
-- aceptando el costo tecleado; si el Taller ya registró consumo real antes de
-- cerrar, el valor recién calculado en `costo_tela`/`costo_avios` es el que
-- `cerrar_produccion` va a usar (no hace falta que esa función sepa nada de
-- insumos).
--
-- Recalcula `producciones.costo_tela`/`costo_avios` (según `insumos.tipo` —
-- solo 'tela'/'avio' en el esquema huérfano, sin 'empaque') sumando TODO el
-- historial de `movimientos_insumo` tipo 'consumo' de esa producción para
-- ese tipo — pero solo pisa el campo cuyo tipo tuvo al menos una fila (mismo
-- criterio que ya documentó ADR-0090 hoy: no borra en silencio un costo
-- tecleado a mano de un tipo que esta producción todavía no consumió por
-- insumo).
--
-- SE ROMPE SI: `fn_puede_operar_ubicacion(uuid)` (0003/0006) o
-- `producciones.estado`/estructura (20260915130000) cambian de forma — esta
-- función lee `producciones` directo, igual que `cerrar_produccion`. Si
-- algún día se permite consumo DESPUÉS de cerrar, hay que decidir ahí mismo
-- cómo se corrige `variantes.costo` retroactivamente (hoy no se permite, a
-- propósito — mismo candado que ya tiene el resto del módulo).
--
-- ESTADO: SOLO LOCAL. Producción tiene `insumos`/`insumo_lotes`/
-- `movimientos_insumo`/`v_insumo_saldos`/`recibir_insumo`/
-- `ajustar_insumo_por_conteo` desde julio (huérfanos) pero NO esta función —
-- esta migración sí hay que pegarla en producción cuando Felipe decida
-- (con el prefijo `retail.` en el SQL Editor, D-11). Entra al diccionario
-- (`docs/datos/generado/`) cuando se aplique allá.
-- ============================================================================

create or replace function retail.registrar_consumo_insumo(
  p_produccion_id uuid,
  p_insumo_id uuid,
  p_cantidad numeric,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
  v_lote record;
  v_saldo_lote numeric;
  v_lote_id uuid;
  v_costo_unitario numeric;
  v_persona_id uuid;
  v_movimiento_id uuid;
  v_tipo_insumo text;
  v_suma numeric;
  v_n integer;
begin
  -- `for update` desde el inicio: ver cabecera, es el candado que protege el
  -- recálculo de costo_tela/costo_avios de un pisado entre dos consumos
  -- concurrentes de la misma producción, no el del stock del lote (ese es
  -- aparte, más abajo).
  select ubicacion_id, estado into v_ubicacion_id, v_estado
    from producciones where id = p_produccion_id for update;
  if not found then
    raise exception 'La producción no existe';
  end if;

  if not fn_puede_operar_ubicacion(v_ubicacion_id) then
    raise exception 'No tienes permiso para registrar consumo de insumos en esa producción';
  end if;

  if v_estado <> 'en_proceso' then
    raise exception 'El consumo de insumos se registra antes de cerrar la orden — esta ya está %', v_estado;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad consumida debe ser mayor a cero';
  end if;

  if not exists (select 1 from insumos where id = p_insumo_id) then
    raise exception 'El insumo % no existe', p_insumo_id;
  end if;

  -- Elige el lote más antiguo con saldo > 0. El cursor `for update` bloquea
  -- cada candidato en el orden de la consulta (el más antiguo primero) según
  -- lo va recorriendo — nunca bloquea de más: el loop corta apenas encuentra
  -- uno con saldo real > 0, así que un lote más nuevo que ni se llegó a mirar
  -- queda libre. El saldo se recalcula DESPUÉS del lock de cada fila (nunca
  -- antes) para no confiar en un número que una transacción concurrente ya
  -- dejó viejo.
  v_lote_id := null;
  for v_lote in
    select id, costo_unitario
    from insumo_lotes
    where insumo_id = p_insumo_id and ubicacion_id = v_ubicacion_id
    order by fecha_ingreso, created_at
    for update
  loop
    select l.cantidad_ingresada
        - coalesce((select sum(mi.cantidad) from movimientos_insumo mi
                     where mi.insumo_lote_id = v_lote.id and mi.tipo in ('consumo', 'merma')), 0)
        + coalesce((select sum(mi.cantidad) from movimientos_insumo mi
                     where mi.insumo_lote_id = v_lote.id and mi.tipo = 'devolucion'), 0)
      into v_saldo_lote
      from insumo_lotes l where l.id = v_lote.id;

    if v_saldo_lote > 0 then
      v_lote_id := v_lote.id;
      v_costo_unitario := v_lote.costo_unitario;
      exit;
    end if;
  end loop;

  if v_lote_id is null then
    raise exception 'No hay stock de este insumo en esta ubicación — recíbelo con recibir_insumo antes de registrar consumo';
  end if;

  if v_saldo_lote < p_cantidad then
    raise exception 'El lote más antiguo con saldo tiene % y pediste % — si de verdad necesitas cruzar de lote, registra el consumo en dos llamadas', v_saldo_lote, p_cantidad;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos_insumo (
    insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, nota
  ) values (
    p_insumo_id, v_lote_id, v_ubicacion_id, 'consumo', p_cantidad, v_costo_unitario, p_produccion_id, v_persona_id, p_nota
  ) returning id into v_movimiento_id;

  -- D-47: costo_tela/costo_avios dejan de ser tecleados y pasan a ser la suma
  -- real de lo consumido — pero solo se pisa el campo cuyo tipo tuvo al
  -- menos una fila para ESTA producción (evita borrar en silencio un costo
  -- tecleado a mano del tipo que todavía no se registra por insumo).
  select i.tipo into v_tipo_insumo from insumos i where i.id = p_insumo_id;

  if v_tipo_insumo = 'tela' then
    select coalesce(sum(mi.cantidad * mi.costo_unitario), 0), count(*) into v_suma, v_n
      from movimientos_insumo mi join insumos i on i.id = mi.insumo_id
      where mi.produccion_id = p_produccion_id and mi.tipo = 'consumo' and i.tipo = 'tela';
    if v_n > 0 then
      update producciones set costo_tela = round(v_suma, 2) where id = p_produccion_id;
    end if;
  elsif v_tipo_insumo = 'avio' then
    select coalesce(sum(mi.cantidad * mi.costo_unitario), 0), count(*) into v_suma, v_n
      from movimientos_insumo mi join insumos i on i.id = mi.insumo_id
      where mi.produccion_id = p_produccion_id and mi.tipo = 'consumo' and i.tipo = 'avio';
    if v_n > 0 then
      update producciones set costo_avios = round(v_suma, 2) where id = p_produccion_id;
    end if;
  end if;

  return v_movimiento_id;
end;
$$;

comment on function retail.registrar_consumo_insumo(uuid, uuid, numeric, text) is
  'La pieza que D-47 tenía pendiente: consumo real de insumos al cortar. Elige el lote más antiguo con saldo (sin partir entre lotes), recalcula costo_tela/costo_avios de la producción solo para el tipo consumido. Ver ADR-0090.';

-- Mismo hallazgo que ya documentó ADR-0090 hoy para fn_aplicar_movimiento_insumo
-- (y que se reconfirmó igual para recibir_insumo/ajustar_insumo_por_conteo al
-- construir el espejo local): este Postgres otorga EXECUTE a PUBLIC por
-- default al crear una función, y 0005_grants.sql además otorga EXECUTE a
-- `authenticated` por default a toda función nueva del schema retail (no hace
-- falta grant explícito para authenticated, pero se deja igual, por
-- claridad, como ya hace el resto del módulo).
revoke execute on function retail.registrar_consumo_insumo(uuid, uuid, numeric, text) from public;
grant execute on function retail.registrar_consumo_insumo(uuid, uuid, numeric, text) to authenticated;
