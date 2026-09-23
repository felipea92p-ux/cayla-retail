-- Depósito bancario sin N.º de operación obligatorio (Felipe, 2026-09-23 — actualización de ADR-0186).
--
-- Al cerrar caja con traslado «Depósito bancario», el número de operación del voucher pasa a ser OPCIONAL: muchas
-- veces el depósito se hace después del cierre y el voucher todavía no existe; exigirlo obligaba a inventar un número
-- o a no registrar el traslado. «Entregado al líder de equipo» sigue exigiendo a quién (sin eso el efectivo no se
-- puede rastrear). «Caja fuerte» sigue sin pedir nada.
--
-- Dos candados, los dos se aflojan igual:
--   1. `caja_traslados_referencia` (check de tabla): ahora solo exige referencia cuando destino = 'lider'.
--   2. `cerrar_caja`: se quita el `raise` de banco. Misma firma que producción (uuid, numeric, numeric, text, text):
--      `create or replace` la reemplaza, no crea sobrecarga. Cuerpo tomado de pg_get_functiondef de producción.
--
-- Al pegar en el SQL Editor de producción: anteponer `set search_path to retail, public;`.

alter table caja_traslados drop constraint caja_traslados_referencia;
alter table caja_traslados add constraint caja_traslados_referencia
  check (destino <> 'lider' or length(btrim(coalesce(referencia, ''))) >= 2);

create or replace function cerrar_caja(
  p_caja_id uuid,
  p_monto_real numeric,
  p_traslado_monto numeric default 0,
  p_traslado_destino text default null,
  p_traslado_referencia text default null
)
returns table(monto_sistema numeric, monto_real numeric, diferencia numeric, monto_trasladado numeric, monto_fondo numeric)
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_caja cajas%rowtype;
  v_sistema numeric;
  v_traslado numeric := coalesce(p_traslado_monto, 0);
  v_fondo numeric;
  v_persona uuid;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo un líder de equipo puede cerrar la caja' using errcode = '42501';
  end if;

  select * into v_caja from cajas where id = p_caja_id for update;
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
  if v_traslado < 0 then
    raise exception 'El monto a trasladar no puede ser negativo';
  end if;
  if v_traslado > p_monto_real then
    raise exception 'No puedes trasladar más de lo que contaste (S/ %)', to_char(p_monto_real, 'FM999999990.00');
  end if;
  if v_traslado > 0 then
    if p_traslado_destino is null or p_traslado_destino not in ('caja_fuerte', 'banco', 'lider') then
      raise exception 'Elige a dónde va el efectivo que trasladas';
    end if;
    -- Banco: el N.º de operación es opcional (se guarda si viene). Solo «líder» exige referencia.
    if p_traslado_destino = 'lider' and length(btrim(coalesce(p_traslado_referencia, ''))) < 2 then
      raise exception 'Escribe a quién le entregaste el efectivo';
    end if;
  end if;

  select e.esperado into v_sistema from fn_calcular_esperado_caja(p_caja_id) e;
  v_persona := retail.fn_actor_persona_id(true);
  v_fondo := p_monto_real - v_traslado;

  if v_traslado > 0 then
    insert into caja_traslados (caja_id, destino, monto, referencia, registrado_por)
    values (p_caja_id, p_traslado_destino, v_traslado, nullif(btrim(p_traslado_referencia), ''), v_persona);
  end if;

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    monto_fondo = v_fondo,
    cerrada_por = v_persona,
    cerrada_en = clock_timestamp()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema, v_traslado, v_fondo;
end;
$function$;
