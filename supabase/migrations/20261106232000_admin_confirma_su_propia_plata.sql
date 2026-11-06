-- El Admin confirma su propia plata para compras (Felipe 2026-11-06).
--
-- Hasta hoy `confirmar_plata_compras` exigía SIEMPRE otra persona (`fn_fondo_exigir_otra_persona`): ni el Admin podía
-- confirmar la plata que él mismo anotó, y el gerente general dependía de que un líder le revisara su ronda para que el
-- banco bajara en Cuentas y dinero. Felipe eligió «Admin solo en plata»: el Admin (`fn_es_admin()`, que se lee de Dynamic)
-- se salta el candado SOLO al confirmar plata anotada; los gastos, los cierres de ronda y las devoluciones siguen pidiendo
-- otra persona. Lo que se pierde es el segundo par de ojos sobre la plata del Admin; para que no pase en silencio, la
-- Actividad dice «se la confirmó él mismo (Admin)».
--
-- Dos piezas, las dos `create or replace` (no toman los candados de `auth`/`storage`: ADR-0195):
--   1. `fn_plata_por_confirmar`: `es_mia` es falso para el Admin, así la hoja de Revisar compras le muestra el formulario
--      en vez de «Es tuya» (la web no cambia).
--   2. `confirmar_plata_compras`: el mismo cuerpo vivo de producción (20261029192000), con el candado salteado para el Admin.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_plata_por_confirmar()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
  -- El Admin confirma también la suya (20261106232000): para él ninguna fila es «Es tuya».
  v_admin boolean := coalesce(retail.fn_es_admin(), false);
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver la plata por confirmar necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'persona_id', a.persona_id, 'ronda', retail.fn_ronda_compras_texto(a.ronda_id),
                                        'persona', trim(concat_ws(' ', p.nombres, p.apellidos)), 'medio', a.medio, 'monto', a.monto,
                                        'fecha', a.fecha, 'creado_en', a.created_at, 'foto_ruta', a.foto_ruta,
                                        'es_mia', v_yo is not null and a.persona_id = v_yo and not v_admin,
                                        'cuenta_indicada_id', a.cuenta_indicada_id,
                                        'cuenta_indicada', (select c.nombre from retail.cuentas_dinero c where c.id = a.cuenta_indicada_id))
                     order by a.created_at)
      from retail.fondo_plata_anotada a join public.personas p on p.id = a.persona_id
     where a.estado = 'por_confirmar'), '[]'::jsonb);
end $function$;

create or replace function retail.confirmar_plata_compras(p_id uuid, p_monto numeric default null::numeric, p_cuenta_origen_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_a retail.fondo_plata_anotada%rowtype;
  v_monto numeric;
  v_actor uuid;
  v_fondo uuid;
  v_mov uuid;
  v_inicial numeric;
  v_propia boolean;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Confirmar la plata necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  for v_a in select * from retail.fondo_plata_anotada a where a.id = p_id for update loop
    exit;
  end loop;
  if v_a.id is null then
    raise exception 'Esa plata anotada no existe.' using errcode = 'P0001';
  end if;
  v_monto := round(coalesce(p_monto, v_a.monto), 2);

  if v_a.estado = 'confirmada' then
    if v_a.monto_confirmado = v_monto and v_a.cuenta_origen_id is not distinct from (case when v_a.medio = 'ya_tenia' then null else p_cuenta_origen_id end) then
      return jsonb_build_object('id', v_a.id, 'monto', v_a.monto_confirmado, 'movimiento_id', v_a.movimiento_id);
    end if;
    raise exception 'Esa plata ya se confirmó con otros datos: recarga la pantalla.' using errcode = 'P0001', hint = 'plata_ya_confirmada';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién confirma la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_propia := v_a.persona_id = v_actor
              or v_a.persona_id = retail.fn_persona_de_la_cuenta();
  -- 20261106232000 (Felipe): el Admin confirma también la suya; para todos los demás sigue haciendo falta otra persona.
  if not (v_propia and coalesce(retail.fn_es_admin(), false)) then
    perform retail.fn_fondo_exigir_otra_persona(v_a.persona_id, v_actor, 'Nadie confirma su propia plata');
  end if;
  if v_monto is null or v_monto = 'NaN'::numeric or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_monto > 1000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;

  if v_a.medio = 'ya_tenia' then
    -- Auditoría 2026-10-27 (H2): no sale de ningún banco, solo fija con cuánto empieza el fondo; lo confirma un líder (se pregunta a la cuenta).
    if not coalesce(retail.fn_es_lider(), false) then
      raise exception 'La plata que ya tenía antes de usar el sistema la confirma un líder: no sale de ningún banco, solo fija con cuánto empieza su fondo. Pídele a un líder que la confirme.'
        using errcode = '42501', hint = 'plata_ya_tenia_solo_lider';
    end if;
    -- El saldo inicial de su fondo, con la fecha en que lo anotó (es su primera plata: nada en su fondo es de antes).
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_a.persona_id::text, 0));
    v_fondo := retail.fn_fondo_de(v_a.persona_id, true);
    v_inicial := (select c.saldo_inicial from retail.cuentas_dinero c where c.id = v_fondo);
    if coalesce(v_inicial, 0) <> 0 then
      raise exception 'Su fondo ya tiene la plata que tenía antes: no se anota dos veces.' using errcode = 'P0001';
    end if;
    perform set_config('retail.editando_cuenta', 'si', true);
    update retail.cuentas_dinero
       set saldo_inicial = v_monto,
           saldo_desde = least(v_a.fecha, coalesce((select min(d.fecha) from retail.movimientos_dinero d
                                                     where v_fondo in (d.cuenta_origen_id, d.cuenta_destino_id)), v_a.fecha))
     where id = v_fondo;
    perform set_config('retail.editando_cuenta', '', true);
  else
    if p_cuenta_origen_id is null then
      raise exception 'Elige de qué cuenta salió la plata.' using errcode = 'P0001';
    end if;
    -- La entrega es la de siempre: valida la cuenta (banco, caja fuerte o lo del líder), la fecha y que no sea su propio fondo.
    v_mov := retail.entregar_fondo(v_a.persona_id, p_cuenta_origen_id, v_monto,
      left('Plata para compras que anotó (' ||
           case v_a.medio when 'transferencia' then 'transferencia' when 'yape_plin' then 'Yape o Plin' else 'efectivo' end || ')', 200),
      v_a.fecha, null);
  end if;

  update retail.fondo_plata_anotada
     set estado = 'confirmada', monto_confirmado = v_monto,
         cuenta_origen_id = case when v_a.medio = 'ya_tenia' then null else p_cuenta_origen_id end,
         movimiento_id = v_mov, confirmada_por = v_actor, confirmada_en = now()
   where id = v_a.id;

  begin
    perform retail.fn_actividad_anotar('fondos', 'plata_confirmada',
      case when v_propia then 'se confirmó él mismo (Admin) su plata para compras'
           else 'confirmó la plata para compras de ' || coalesce((select trim(concat_ws(' ', p.nombres, p.apellidos)) from public.personas p where p.id = v_a.persona_id), 'una compradora') end
        || case when v_monto <> v_a.monto then ' (con otro monto)' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'fondo_plata_anotada', v_a.id::text, now(),
      jsonb_build_object('medio', v_a.medio, 'cambio_monto', v_monto <> v_a.monto, 'propia', v_propia), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la confirmación %: %', v_a.id, sqlerrm;
  end;
  return jsonb_build_object('id', v_a.id, 'monto', v_monto, 'movimiento_id', v_mov);
end $function$;
