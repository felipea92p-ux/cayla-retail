-- Rebobina `retail.anotar_plata_compras` al estado de ANTES de 20261110025000 (la de 5 parámetros, sin `p_fecha`), para las pruebas que pegan
-- migraciones viejas de Compras simple o de «cuenta de otra empresa» en una base que ya trae la nueva.
--
-- POR QUÉ. 20261110025000 cambió la firma (soltó la de 5 parámetros y creó la de 6, con `p_fecha`). Esas pruebas pegan migraciones anteriores
-- que PARCHAN `anotar_plata_compras(text, numeric, text, uuid, uuid)` con un reemplazo anclado (falla con «does not exist» si solo queda la de 6)
-- o la RECREAN (queda al lado de la de 6 y toda llamada con nombres es ambigua). Rebobinada, la prueba corre en el mundo para el que se escribió.
-- Las pruebas del día de llegada (`compras_simple_plata.mjs`) vuelven a pegar 20261110025000 al final.
--
-- Idempotente: sin la de 6 parámetros no hace nada. El texto de la de 5 es el de producción tras 20261110001000 (con el candado de «cuenta de casa»).
do $mig$
begin
  if to_regprocedure('retail.anotar_plata_compras(text,numeric,text,uuid,uuid,date)') is null then
    return;
  end if;
  drop function retail.anotar_plata_compras(text, numeric, text, uuid, uuid, date);
  execute $def$
create or replace function retail.anotar_plata_compras(
  p_medio text,
  p_monto numeric,
  p_foto_ruta text default null::text,
  p_token uuid default null::uuid,
  p_cuenta_indicada_id uuid default null::uuid
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_id uuid;
  v_monto numeric := round(p_monto, 2);
  v_foto text := nullif(trim(coalesce(p_foto_ruta, '')), '');
  v_persona uuid;
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Anotar plata para comprar necesita el módulo Mi plata para compras en tu rol.' using errcode = '42501';
  end if;
  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otra plata o con otro banco se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('anotar_plata_compras', p_token,
    md5(jsonb_build_array(p_medio, p_monto::text, v_foto, p_cuenta_indicada_id)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('fondo_plata_anotada:' || p_token::text, 0));
    v_id := (select a.id from retail.fondo_plata_anotada a where a.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién anota la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_medio is null or p_medio not in ('transferencia', 'yape_plin', 'efectivo', 'ya_tenia') then
    raise exception 'Elige cómo te llegó la plata.' using errcode = 'P0001';
  end if;
  if v_monto is null or v_monto = 'NaN'::numeric or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_monto > 1000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_foto is not null and (v_foto not like 'plata/%' or char_length(v_foto) > 300) then
    raise exception 'La foto del voucher no se subió bien: vuelve a elegirla.' using errcode = 'P0001';
  end if;
  -- El banco solo se dice con una transferencia, y tiene que ser uno de los bancos de la empresa que se siguen usando.
  if p_cuenta_indicada_id is not null then
    if p_medio <> 'transferencia' then
      raise exception 'El banco solo se dice cuando la plata llegó por transferencia.' using errcode = 'P0001', hint = 'banco_solo_transferencia';
    end if;
    if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_indicada_id and c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)) then
      raise exception 'Ese banco no existe o ya no se usa: elige otro.' using errcode = 'P0001', hint = 'banco_invalido';
    end if;
  end if;

  -- Auditoría 2026-10-27 (H11): el mismo candado que abrir y cerrar la ronda, antes que el del fondo.
  perform retail.fn_ronda_compras_candado(v_persona);
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_persona::text, 0));
  -- «Ya tenía» es solo la primera vez: antes de cualquier fondo y de cualquier otra plata anotada.
  if p_medio = 'ya_tenia' and (
       exists (select 1 from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = v_persona)
       or exists (select 1 from retail.fondo_plata_anotada a where a.persona_id = v_persona)) then
    raise exception '«Ya tenía plata» se anota solo la primera vez. Lo que te sobró ya está en tu plata.' using errcode = 'P0001', hint = 'ya_tenia_solo_primera_vez';
  end if;

  insert into retail.fondo_plata_anotada (persona_id, medio, monto, foto_ruta, fecha, anotada_por, token_cliente, cuenta_indicada_id)
  values (v_persona, p_medio, v_monto, v_foto, retail.fn_hoy_lima(), v_persona, p_token, p_cuenta_indicada_id)
  returning id into v_id;

  -- Entra sola a su fondo si ya se sabe de qué cuenta sale (ADR-0574). Si algo falla, queda «por confirmar» para Compras, como siempre.
  begin
    perform retail.fn_plata_confirmar_sola(v_id);
  exception when others then
    raise warning 'plata: no entró sola %: %', v_id, sqlerrm;
  end;

  -- Actividad (ADR-0207), en el módulo donde vive el botón. Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'plata_anotada',
      case p_medio when 'ya_tenia' then 'anotó la plata para compras que ya tenía' else 'anotó plata para compras que le dieron' end,
      v_persona, retail.fn_actividad_terminal_ahora(), null, null, 'fondo_plata_anotada', v_id::text, now(),
      jsonb_build_object('medio', p_medio), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la plata %: %', v_id, sqlerrm;
  end;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.fondo_plata_anotada a where a.token_cliente = p_token) then
    return (select a.id from retail.fondo_plata_anotada a where a.token_cliente = p_token);
  end if;
  if p_medio = 'ya_tenia' then
    raise exception '«Ya tenía plata» se anota solo la primera vez. Lo que te sobró ya está en tu plata.' using errcode = 'P0001', hint = 'ya_tenia_solo_primera_vez';
  end if;
  raise;
end $function$
  $def$;
  revoke all on function retail.anotar_plata_compras(text, numeric, text, uuid, uuid) from public, anon;
  grant execute on function retail.anotar_plata_compras(text, numeric, text, uuid, uuid) to authenticated;
end
$mig$;
