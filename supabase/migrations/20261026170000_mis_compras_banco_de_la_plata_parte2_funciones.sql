-- ============================================================================
-- Mis compras · «¿De qué banco salió?» al anotar plata por transferencia — PARTE 2 de 2: las funciones.
-- Se pega DESPUÉS de la parte 1 (`20261026165000`, la columna `cuenta_indicada_id`).
--
-- Qué hace:
--   1. `anotar_plata_compras` recibe un parámetro más, `p_cuenta_indicada_id` (de fábrica null: lo que llama con 4 argumentos sigue igual). Si
--      viene, la plata tiene que ser una transferencia y la cuenta, un banco que se usa. La función con 4 parámetros se retira: dos con el mismo
--      nombre y parámetros opcionales dejan la llamada ambigua.
--   2. `fn_bancos_para_plata_compras()` da los bancos de la empresa a quien tiene «Mis compras» (sin esto, la compradora no puede ver ni los
--      nombres: `cuentas_dinero` no se lee con ese módulo).
--   3. `fn_plata_por_confirmar()` dice el banco que indicó cada compradora, para que «Revisar compras» lo traiga ya elegido.
--   4. El candado de «lo que anotó la compradora no cambia» también protege la columna nueva.
--
-- Solo funciones: sin tablas, sin políticas ni disparadores nuevos (ADR-0195). Idempotente. Las dos modificaciones a funciones que ya existen
-- son reemplazos ANCLADOS sobre su definición real (no hacen nada si ya están hechos, y avisan si la función cambió).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. Anotar la plata, con el banco que dice la compradora ----------
create or replace function retail.anotar_plata_compras(
  p_medio text,
  p_monto numeric,
  p_foto_ruta text default null,
  p_token uuid default null,
  p_cuenta_indicada_id uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
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
    if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_indicada_id and c.tipo = 'banco' and c.archivada_en is null) then
      raise exception 'Ese banco no existe o ya no se usa: elige otro.' using errcode = 'P0001', hint = 'banco_invalido';
    end if;
  end if;

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
end $$;

-- La de 4 parámetros se retira: con las dos, `anotar_plata_compras(medio, monto, null, token)` sería ambigua.
drop function if exists retail.anotar_plata_compras(text, numeric, text, uuid);
revoke all on function retail.anotar_plata_compras(text, numeric, text, uuid, uuid) from public, anon;
grant execute on function retail.anotar_plata_compras(text, numeric, text, uuid, uuid) to authenticated;

-- ---------- 2. Los bancos de la empresa, para quien anota plata ----------
create or replace function retail.fn_bancos_para_plata_compras()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not (retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('fondos')) then
    raise exception 'Ver los bancos necesita el módulo Mis compras o Revisar compras en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.orden, c.nombre)
      from retail.cuentas_dinero c
     where c.tipo = 'banco' and c.archivada_en is null), '[]'::jsonb);
end $$;
revoke all on function retail.fn_bancos_para_plata_compras() from public, anon;
grant execute on function retail.fn_bancos_para_plata_compras() to authenticated;

-- ---------- 3. «Revisar compras» ve el banco que indicó la compradora ----------
-- El ancla es el cierre del objeto que arma cada fila (`'es_mia', …)`): está igual en todas las versiones de la función, con o sin la ronda.
select pg_temp.reemplazar('retail.fn_plata_por_confirmar()',
$v$'es_mia', v_yo is not null and a.persona_id = v_yo)$v$,
$v$'es_mia', v_yo is not null and a.persona_id = v_yo,
                                        'cuenta_indicada_id', a.cuenta_indicada_id,
                                        'cuenta_indicada', (select c.nombre from retail.cuentas_dinero c where c.id = a.cuenta_indicada_id))$v$, 1);

-- ---------- 4. Lo que anotó la compradora no cambia: tampoco el banco que dijo ----------
select pg_temp.reemplazar('retail.fn_fondo_plata_anotada_inmutable()', $v$new.token_cliente, new.created_at)$v$, $v$new.token_cliente, new.created_at, new.cuenta_indicada_id)$v$, 1);
select pg_temp.reemplazar('retail.fn_fondo_plata_anotada_inmutable()', $v$old.token_cliente, old.created_at)$v$, $v$old.token_cliente, old.created_at, old.cuenta_indicada_id)$v$, 1);

notify pgrst, 'reload schema';
