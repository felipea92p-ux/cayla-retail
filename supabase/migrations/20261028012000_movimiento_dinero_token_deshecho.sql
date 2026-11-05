-- ============================================================================
-- 20261028012000 — Reintentar un movimiento de dinero que se deshizo ya no responde «hecho» en falso
-- (ADR-0548; hermana de ADR-0544, que arregló lo mismo en `registrar_abono_pos`)
--
-- EL PROBLEMA PRIMERO. `registrar_movimiento_dinero` es idempotente por `p_token`: si llega el mismo token dos veces (doble clic, red
-- que reintenta) devuelve el movimiento que ya registró en vez de registrar otro. Pero lo buscaba SIN mirar su estado. Escenario
-- real: la persona registra un depósito (o un retiro, un aporte, un pago de planilla…), toca «Deshacer» (el movimiento queda
-- ANULADO) y, con la hoja todavía abierta, vuelve a tocar «Registrar» con el mismo token: la función encuentra el movimiento
-- anulado, devuelve su id como si fuera el nuevo, la pantalla dice «Registrado» y no hay ningún movimiento vigente. La plata no
-- se movió en el sistema y nadie lo ve. El token no puede reusarse para uno nuevo (`movimientos_dinero.token_cliente` es único sin
-- filtro de estado), así que la única salida honesta es decirlo y no escribir nada.
--
-- CONTRATO (Liskov)
--   PROMETE: con un token que ya tiene un movimiento VIGENTE, devuelve ese mismo movimiento (idempotencia, igual que antes); con un
--            token cuyo movimiento está ANULADO, falla con «Ese depósito ya se deshizo: vuelve a registrarlo desde cero.» (para un
--            depósito o un abono de tarjeta; «Ese movimiento ya se deshizo: …» para los demás tipos) y no escribe nada. Vale en las
--            dos ramas que devolvían el movimiento por su token: la del inicio y la del `unique_violation` de una carrera.
--   ASUME:   quien llama renueva el token en cada intento nuevo (las dos pantallas que la llaman lo hacen al abrir la hoja). El
--            mensaje es la red de seguridad si no lo hace. El mismo token con OTRO contenido ya lo rechaza `fn_intento_con_huella`
--            antes (`token_reusado`, ADR-0412): este chequeo solo actúa cuando el contenido es el mismo.
--   NO HACE: no libera el token al anular, no cambia la firma, el permiso ni nada de lo que la función hace con un token nuevo.
--            `registrar_abono_pos` no cambia: ya hacía este chequeo ella misma antes de llamar a esta función (ADR-0544).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Dos reemplazos ANCLADOS sobre la función viva (el patrón de 20261017143000): cada
-- uno aborta sin tocar nada si su ancla no aparece exactamente una vez, y no hace nada si su texto nuevo ya está. NO se recrea la
-- función entera: la viva lleva los parches de 20261015003000 (huella del token), 20261016002000 (planilla y SUNAT) y
-- 20261017143000 (piso de fecha), y un `create or replace` completo los pisaría. Las anclas son líneas de la migración ORIGINAL
-- (20260925110000) que ninguno de esos parches toca. Solo `create or replace function` de una función en uso: no toma ninguna tabla
-- ni crea políticas. Sin un select con «into» dentro del texto entre comillas (ADR-0288). Verificado el 2026-10-27 que la huella md5 de
-- la función viva es ea93db7bdf64ba3408cccc49ebe38431, igual a la del Postgres local. Idempotente.
-- Verificado: `scripts/pruebas/cuentas_dinero.mjs` (falla sin esta migración; con ella, pasa).
-- SE ROMPE SI: una pantalla guarda el token en un estado que sobrevive a «Deshacer» y reintenta con él: verá el mensaje en vez de un
-- éxito falso (es lo correcto, pero hay que renovar el token).
-- DOWN: volver a la definición de 20261017143000 (los dos textos viejos de este reemplazo).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza `p_viejo` por `p_nuevo` en una función viva; si `p_nuevo` ya está, no hace nada. (La misma pieza de 20261017143000.)
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

-- ---------- 1. La rama del inicio: el token ya tiene un movimiento (la línea siguiente a su búsqueda por token) ----------
select pg_temp.reemplazar(
  'retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
  $v$    if found then return v_id; end if;$v$,
  $v$    if found then
      -- ADR-0548: el movimiento de este token se anuló (`Deshacer`): no se devuelve como si fuera el de ahora.
      if (select d.estado from retail.movimientos_dinero d where d.id = v_id) <> 'vigente' then
        raise exception 'Ese % ya se deshizo: vuelve a registrarlo desde cero.',
          case when p_tipo in ('deposito', 'abono_tarjeta') then 'depósito' else 'movimiento' end using errcode = 'P0001';
      end if;
      return v_id;
    end if;$v$,
  1);

-- ---------- 2. La rama de la carrera: el insert chocó con el token de otro movimiento ----------
select pg_temp.reemplazar(
  'retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
  $v$    return (select id from retail.movimientos_dinero where token_cliente = p_token);$v$,
  $v$    if exists (select 1 from retail.movimientos_dinero where token_cliente = p_token and estado <> 'vigente') then
      raise exception 'Ese % ya se deshizo: vuelve a registrarlo desde cero.',
        case when p_tipo in ('deposito', 'abono_tarjeta') then 'depósito' else 'movimiento' end using errcode = 'P0001';
    end if;
    return (select id from retail.movimientos_dinero where token_cliente = p_token);$v$,
  1);

-- ---------- 3. Que quedó como se prometió ----------
do $$
declare
  v_r text := pg_get_functiondef('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)'::regprocedure);
begin
  if (length(v_r) - length(replace(v_r, 'ya se deshizo', ''))) / length('ya se deshizo') <> 2 then
    raise exception 'ADR-0548 (2026-10-28): registrar_movimiento_dinero no quedó con el aviso del token deshecho en sus dos ramas';
  end if;
  -- Lo que los parches anteriores dejaron sigue ahí.
  if position('fn_intento_con_huella' in v_r) = 0 or position('movimiento_antes_del_inicio' in v_r) = 0 or position('pago_planilla' in v_r) = 0 then
    raise exception 'ADR-0548 (2026-10-28): registrar_movimiento_dinero perdió un parche anterior (huella del token, piso de fecha o planilla)';
  end if;
end $$;

reset lock_timeout;
