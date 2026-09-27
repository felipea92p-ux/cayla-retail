-- ============================================================================
-- 20260926200100_mover_interno_con_marca.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · marca de mover_interno
-- PARTE 2 de 2 (la función). Va DESPUÉS de 20260926200000 (la tabla).
--
-- EL PROBLEMA PRIMERO. Ver la PARTE 1: sin marca, un reintento después de un corte de red mueve la prenda dos veces.
--
-- QUÉ HACE. `mover_interno` suma un séptimo parámetro opcional, `p_token uuid default null`:
--   · Con marca: toma un candado de transacción sobre ella y la busca. Si ya se usó con los mismos datos (misma huella)
--     devuelve el MISMO movimiento sin mover nada; con otros datos, rechaza (hint `mover_interno_token_reusado`). Si es
--     nueva, mueve y la anota en `movimientos_internos_intentos`, todo en la misma transacción.
--   · Sin marca: igual que antes. `bajar_al_piso` la llama así, porque ya tiene su propia marca por bajada.
--   · La marca se mira ANTES de pedir responsable (lección del bloque 1): comprobar algo ya guardado no escribe nada,
--     así que responde aunque la responsable haya marcado su salida en el medio.
-- Todo lo demás del cuerpo es el de hoy, letra por letra: los mismos rechazos y la misma fila en `movimientos`.
--
-- POR QUÉ `drop` + `create` Y NO `create or replace`: cambiar la lista de parámetros con `create or replace` crea una
-- SEGUNDA función (sobrecarga) y deja viva la vieja; el CI exige una sola firma por función (`pruebas:una-sola-firma`).
-- `drop function` no toma las tablas de auth/storage (ADR-0195). Las llamadas con seis argumentos (la pantalla hasta
-- ahora, `bajar_al_piso`, el seed y las pruebas) siguen funcionando: el séptimo tiene valor por defecto.
--
-- GUARDA. La definición VIVA de `mover_interno` es la de 20260914230000 más el reemplazo en vivo de 20260923100000
-- (firma con el responsable); su cuerpo mide md5 `ab13725880e28cabc97d3261d4db8396` (medido en producción el
-- 2026-09-25 y en local). Si el cuerpo vivo de la firma de seis parámetros es OTRO, alguien lo parchó en vivo y
-- reescribirlo borraría ese parche en silencio: se aborta sin tocar nada.
--
-- ORDEN AL PEGAR: 20260926200000 → esta → recién entonces fusionar/publicar la web que manda `p_token` (ver PARTE 1).
-- Re-ejecutable: pegada dos veces deja lo mismo (la segunda vez ya no hay firma de seis parámetros que revisar).
--
-- SE ROMPE SI alguien vuelve a pegar 20260914230000 (recrearía la versión de seis parámetros al lado de esta: dos
-- firmas, y el CI lo detecta), o si la pantalla cambia los datos de un intento sin estrenar marca (la base lo rechaza
-- con `mover_interno_token_reusado`, sin mover nada).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
declare
  v_md5 text;
begin
  if to_regclass('retail.movimientos_internos_intentos') is null then
    raise exception 'Falta la tabla de marcas: pega antes 20260926200000_mover_interno_intentos_tabla.sql';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta fn_actor_persona_id: pega antes 20260923100000_actor_firma_las_operaciones.sql';
  end if;
  select md5(p.prosrc) into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text)');
  if v_md5 is not null and v_md5 <> 'ab13725880e28cabc97d3261d4db8396' then
    raise exception 'mover_interno cambió desde que se escribió esta migración (md5 del cuerpo: %, se esperaba ab13725880e28cabc97d3261d4db8396). Alguien la parchó en vivo: reescribe el cuerpo nuevo desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

drop function if exists retail.mover_interno(uuid, uuid, integer, uuid, uuid, text);

create or replace function retail.mover_interno(
  p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer,
  p_sububicacion_origen_id uuid, p_sububicacion_destino_id uuid,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_mov_id uuid; v_persona uuid; v_huella text; v_prev retail.movimientos_internos_intentos%rowtype;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa ubicación';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad a mover debe ser mayor a cero';
  end if;
  if p_sububicacion_origen_id is not distinct from p_sububicacion_destino_id then
    raise exception 'Origen y destino no pueden ser la misma sububicación';
  end if;
  if p_sububicacion_origen_id is not null and not exists (
    select 1 from sububicaciones where id = p_sububicacion_origen_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'La sububicación de origen no pertenece a esta ubicación';
  end if;
  if p_sububicacion_destino_id is not null and not exists (
    select 1 from sububicaciones where id = p_sububicacion_destino_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'La sububicación de destino no pertenece a esta ubicación';
  end if;

  -- La marca, antes de pedir responsable: un reintento de algo ya guardado no escribe nada y no lo necesita.
  if p_token is not null then
    v_huella := md5(concat_ws('|', p_ubicacion_id, p_variante_id, p_cantidad, p_sububicacion_origen_id,
                              p_sububicacion_destino_id, coalesce(p_nota, '')));
    perform pg_advisory_xact_lock(hashtextextended('mover_interno:' || p_token::text, 0));
    select * into v_prev from movimientos_internos_intentos where token_cliente = p_token;
    if found then
      if v_prev.huella <> v_huella then
        raise exception 'Ese intento ya se guardó con otros datos: no se repitió. Cierra y revisa Existencias antes de volver a intentarlo.'
          using hint = 'mover_interno_token_reusado';
      end if;
      return v_prev.movimiento_id;
    end if;
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  insert into movimientos (
    variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
    tipo, cantidad, motivo, usuario_id, nota
  )
    values (
      p_variante_id, p_ubicacion_id, p_sububicacion_origen_id,
      p_ubicacion_id, p_sububicacion_destino_id,
      'traslado', p_cantidad, 'movimiento_interno', v_persona, p_nota
    )
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  if p_token is not null then
    insert into movimientos_internos_intentos (token_cliente, movimiento_id, huella) values (p_token, v_mov_id, v_huella);
  end if;

  return v_mov_id;
end;
$$;

comment on function retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid) is
  'Mueve una prenda entre dos sububicaciones de la MISMA ubicación («Reponer», «Retirar del piso», y cada línea de bajar_al_piso). Con p_token, el reintento con los mismos datos devuelve el mismo movimiento sin mover nada (ADR-0208).';

revoke all on function retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
