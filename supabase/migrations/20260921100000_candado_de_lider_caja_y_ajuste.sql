-- ============================================================================
-- 20260921100000_candado_de_lider_caja_y_ajuste.sql — CAYLA V2
--
-- «SOLO EL LÍDER DE EQUIPO CIERRA LA CAJA Y AJUSTA STOCK FUERA DE UNA VENTA» — EN LA BASE.
--
-- QUÉ DECIDE D-13. `docs/datos/DECISIONES-2026-09-12.md`, D-13: lo que un líder de equipo
-- puede y un integrante no es «cerrar la caja del día · ver costos y márgenes · ajustar stock
-- sin venta · registrar gastos y depósitos · ver las métricas esenciales de su sede». El dinero
-- de Compras (ADR-0126), los ajustes de caja y el cierre de un conteo ya exigían líder en la
-- base. Faltaban dos: cerrar la caja y ajustar stock suelto.
--
-- QUIÉN Y CUÁNDO. Lo decidió Felipe (dueño del sistema) el 2026-09-21: que el candado esté
-- EN LA BASE, no solo escondiendo el botón en el menú.
--
-- POR QUÉ EN LA BASE Y NO SOLO EN EL MENÚ. Esconder el botón es cortesía, no seguridad: la
-- app habla con la base por una API pública y cualquier colaborador con sesión puede llamar
-- `cerrar_caja` o `registrar_movimiento` desde la consola de su navegador sin pasar por
-- ninguna pantalla. Hoy las dos funciones solo preguntan «¿esta ubicación es la tuya?»
-- (`fn_puede_operar_ubicacion`), así que una colaboradora en SU tienda podía cerrar la caja
-- (fijando ella el monto contado, y con él la diferencia que después nadie audita) o
-- inventarse una entrada/salida/ajuste de stock que cuadra un inventario con un faltante.
-- Un candado en la función lo cumple TODO cliente: la web, un script o una consola.
--
-- QUÉ CAMBIA — UNA sola verificación al principio de cada función, ANTES de cualquier otra
-- cosa (incluso antes de mirar si la caja existe: quien no es líder no averigua nada):
--   · retail.cerrar_caja(uuid, numeric)
--       si no es líder → 42501 «Solo un líder de equipo puede cerrar la caja».
--   · retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)
--       si no es líder → 42501 «Solo un líder de equipo puede ajustar stock fuera de una venta».
--       Aplica a los TRES tipos que la función acepta (entrada, salida y ajuste): las tres son
--       stock que se mueve sin una venta, una recepción o un traslado de por medio. Las ventas,
--       las devoluciones, las recepciones y los traslados NO pasan por esta función.
--
-- QUÉ SE CONSERVA. El candado de ubicación (`fn_puede_operar_ubicacion`) sigue después, tal
-- cual. HOY no rechaza a nadie que el candado de líder haya dejado pasar, porque
-- `fn_puede_operar_ubicacion(u)` es «líder O u = mi ubicación» y un líder siempre lo cumple.
-- Queda puesto para el día que R-48 acote a un líder a su sede (D-14): ahí volverá a decidir
-- sin tocar estas funciones. El resto del cuerpo es IDÉNTICO al de producción.
--
-- QUIÉN DEJA DE PODER HACER QUÉ.
--   · Un colaborador (rol `colaborador`, como Micaela en Tienda Trujillo) ya NO puede cerrar la
--     caja de su propia tienda ni registrar una entrada, salida o ajuste de stock suelto.
--   · Sigue pudiendo abrir la caja (`abrir_caja` no se toca). Si la caja queda abierta al final
--     del turno, la cierra el líder: esa es la regla que Felipe quiere.
--   · Un líder no pierde nada: cierra cualquier caja y ajusta en cualquier sede, igual que hoy.
--   · Sin sesión (auth.uid() nulo) tampoco pasa: `fn_es_lider()` da falso.
--
-- ORIGEN DEL CUERPO. Tomado de PRODUCCIÓN (proyecto cayla-dynamic, schema `retail`) el
-- 2026-09-21 con `pg_get_functiondef`, no de un archivo viejo del repo: la versión de
-- producción de `cerrar_caja` incluye el reembolso y la diferencia de cambio en el arqueo, la
-- anulada fuera del efectivo esperado, y la de `registrar_movimiento` es la de 7 parámetros
-- con piso/almacén. Copiar de un archivo anterior habría revertido eso en silencio.
--
-- IDEMPOTENTE. `create or replace` con la MISMA firma: se puede pegar dos veces sin duplicar
-- nada y sin tocar los permisos de ejecución ya otorgados.
--
-- SE ROMPE SI: alguna pantalla o proceso llama `registrar_movimiento` como colaborador para
-- una entrada o salida sueltas (verificado 2026-09-21: la web solo la llama desde
-- `AjustarInventarioModal.tsx` con tipo 'ajuste', y ninguna otra función SQL de producción
-- la menciona); o si se contrata a alguien con rol de colaborador para cerrar la caja al
-- final del turno sin un líder presente — el cierre quedará pendiente hasta que llegue uno.
--
-- Este archivo ya trae el prefijo `retail.` en los nombres de función y su `search_path`, igual
-- que los demás desde 20260920: se pega entero en el SQL Editor de producción.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. cerrar_caja: solo un líder de equipo ----------
create or replace function retail.cerrar_caja(p_caja_id uuid, p_monto_real numeric)
returns table(monto_sistema numeric, monto_real numeric, diferencia numeric)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype;
  v_ventas_efectivo numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_reembolsos_efectivo numeric;
  v_cambios_efectivo numeric;
  v_sistema numeric;
  v_persona uuid;
begin
  -- CANDADO DE LÍDER (D-13, 2026-09-21): va primero, antes de mirar si la caja existe.
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede cerrar la caja' using errcode = '42501';
  end if;

  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  -- Una venta anulada devolvió su dinero a la clienta (anular_venta exige esta misma
  -- caja abierta): su efectivo ya no está en el cajón y no se espera.
  select coalesce(sum(vp.monto), 0) into v_ventas_efectivo
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo' and v.estado <> 'anulada';

  select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_id = p_caja_id;

  select coalesce(sum(reembolso_monto), 0) into v_reembolsos_efectivo
    from devoluciones
    where caja_id = p_caja_id and estado = 'aprobada' and reembolso_metodo = 'efectivo';

  -- `cambios.diferencia` ya trae el signo: positiva (la clienta pagó de más)
  -- suma, negativa (se le devolvió) resta — un solo sum cubre los dos
  -- sentidos. Calificado con `cambios.` porque esta función también RETORNA
  -- una columna `diferencia` (la del cuadre) — sin calificar, Postgres no
  -- sabe si es la columna de la tabla o el parámetro de salida.
  select coalesce(sum(cambios.diferencia), 0) into v_cambios_efectivo
    from cambios
    where caja_id = p_caja_id and metodo_pago_diferencia = 'efectivo';

  v_sistema := v_caja.monto_apertura + v_ventas_efectivo + v_ingresos - v_egresos
               - v_reembolsos_efectivo + v_cambios_efectivo;
  select id into v_persona from personas where auth_user_id = auth.uid();

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    cerrada_por = v_persona,
    cerrada_en = now()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema;
end;
$$;

-- ---------- 2. registrar_movimiento: solo un líder de equipo (entrada, salida y ajuste) ----------
create or replace function retail.registrar_movimiento(
  p_variante_id uuid,
  p_ubicacion_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text default null,
  p_nota text default null,
  p_sububicacion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid; v_sub uuid;
begin
  -- CANDADO DE LÍDER (D-13, 2026-09-21): va primero y cubre los tres tipos que esta función
  -- acepta. Stock que se mueve sin una venta, una recepción o un traslado es un ajuste.
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ajustar stock fuera de una venta' using errcode = '42501';
  end if;

  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'registrar_movimiento es para entrada/salida/ajuste sueltos. Traslados van por transferir()/mover_interno(), ventas por registrar_venta(), etc.';
  end if;
  if p_tipo = 'ajuste' and p_sububicacion_id is null and exists (
    select 1 from sububicaciones where ubicacion_id = p_ubicacion_id and tipo in ('piso_venta', 'almacen_tienda')
  ) then
    raise exception 'Esta ubicación separa piso y almacén — indica a cuál corresponde el ajuste';
  end if;
  v_sub := coalesce(p_sububicacion_id,
    case p_tipo
      when 'entrada' then fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada')
      when 'salida' then fn_sububicacion_por_defecto(p_ubicacion_id, 'venta')
    end);
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, v_sub, p_tipo, p_cantidad, p_motivo, v_persona, p_nota)
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;
