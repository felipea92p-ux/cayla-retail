-- ============================================================================
-- 20260915202040_caja_deposito_y_ajuste.sql — CAYLA V2
--
-- Depósito bancario y ajuste de efectivo entran a `caja_movimientos` como un
-- ingreso/egreso más — mismo argumento que 0008 ya usó para "retiro de
-- efectivo" (línea 49-51: un tipo, no una tabla). La alternativa (resucitar
-- depositos_bancarios/ajustes_efectivo al estilo V1) es el antipatrón que
-- docs/datos/modulos/11-finanzas-operativas.md documentaba con evidencia:
-- ajustes_efectivo se escribía con insert directo, sin RPC, sin usuario_id,
-- con policy FOR ALL editable/borrable por API.
--
-- cerrar_caja y getResumenCaja NO cambian: ambos suman caja_movimientos por
-- `tipo` (ingreso/egreso), nunca por `motivo` — un depósito o un ajuste ya se
-- cuadran correctamente en cuanto existen como fila.
--
-- DECISIÓN (Felipe, 2026-09-15): un ajuste de efectivo mueve plata sin una
-- venta ni un gasto real detrás, así que requiere líder de equipo — a
-- diferencia de un depósito bancario (verificable después contra el estado
-- de cuenta) o un egreso común, abiertos a cualquier colaborador de la sede
-- igual que hoy. Por eso es_ajuste es una columna propia y no solo un
-- motivo de texto: un texto libre no puede sostener un candado de permiso.
--
-- Verificado 2026-09-15 contra origin/main (post-fusión) que caja_movimientos,
-- registrar_movimiento_caja y cerrar_caja no fueron tocados por la ola de
-- cambios de Vender/Inventario del 14 y 15-sep (piso/almacén, descuentos,
-- pago mixto): solo 0008_caja_y_pagos.sql los define. Terreno firme.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.caja_movimientos add column nota text;
comment on column retail.caja_movimientos.nota is
  'Detalle estructurado que el motivo no sostiene bien: N° de operación/voucher de un depósito, detalle de un ajuste. Sin check — mismo texto libre que proveedores.banco/cuenta_bancaria; no existe (ni hace falta) una tabla de cuentas bancarias.';

alter table retail.caja_movimientos add column es_ajuste boolean not null default false;
comment on column retail.caja_movimientos.es_ajuste is
  'Marca un movimiento como corrección de conteo (hace aparecer/desaparecer plata sin transacción real). Exige líder de equipo — ver registrar_movimiento_caja.';

-- ADR-0026: agregar parámetros a una función existente es una bifurcación, no
-- un reemplazo, si no se borra la firma vieja primero.
drop function retail.registrar_movimiento_caja(uuid, text, numeric, text);

create function retail.registrar_movimiento_caja(
  p_caja_id uuid, p_tipo text, p_monto numeric, p_motivo text,
  p_nota text default null, p_es_ajuste boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_caja cajas%rowtype; v_persona uuid; v_id uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para operar esa caja';
  end if;
  if p_es_ajuste and not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede registrar un ajuste de efectivo';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada — no se pueden registrar más movimientos ahí';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento de caja inválido: %', p_tipo;
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Todo movimiento de caja necesita un motivo';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into caja_movimientos (caja_id, tipo, monto, motivo, nota, es_ajuste, usuario_id)
    values (p_caja_id, p_tipo, p_monto, p_motivo, p_nota, p_es_ajuste, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;

grant execute on function retail.registrar_movimiento_caja to authenticated;
