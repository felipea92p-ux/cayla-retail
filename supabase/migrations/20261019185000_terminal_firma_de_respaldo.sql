-- ============================================================================
-- 20261019185000_terminal_firma_de_respaldo.sql — CAYLA V2 (ADR-0454; pedido de Felipe, 2026-10-19)
--
-- EL PROBLEMA. Las terminales de Lima (Caja Lima y Almacén Lima) no pueden operar porque el combo «Responsable»
-- (ADR-0161/0162) solo ofrece a quien tiene la entrada marcada en la tienda, y la asistencia de Lima todavía no llega
-- desde Dynamic: el combo dice «Nadie de turno en Lima» y TODO lo que guarda queda bloqueado, en todos los módulos.
-- Felipe pidió que, MOMENTÁNEAMENTE y hasta integrar Lima con Dynamic, esas dos terminales no pidan responsable en
-- ningún módulo.
--
-- LA REGLA NUEVA. `retail.terminales.firma_respaldo_id` (una persona o nada). Una terminal que la tiene:
--   · no pide responsable: `fn_actor_persona_id` devuelve SIEMPRE esa persona, sin mirar el encabezado `x-responsable`
--     ni la asistencia (la web ya no pinta el combo: `fn_terminal_firma_respaldo` le avisa);
--   · NO obtiene sus poderes. Los permisos son de la CUENTA (`fn_es_lider()` mira `auth.uid()`, ADR-0162): la terminal
--     sigue sin ser líder aunque firme a nombre de uno. El aparato queda sellado en `terminal_id`, como siempre.
--   · firma con `p_de_tienda = true` únicamente. Con `false` (comparar «tú contra tú» en permisos) sigue pidiendo
--     responsable como antes.
--
-- POR QUÉ UNA PERSONA DE RESPALDO Y NO «NADIE». ~12 tablas guardan quién lo hizo en una columna NOT NULL (despachos,
-- bajadas al piso, cuadres del piso, separaciones, decisiones de Frescura, conteos de despacho…): una firma vacía haría
-- fallar traslados, bajar al piso y apartar en Lima. Con la persona de respaldo funcionan. El precio: en esas filas el
-- historial dice el nombre del respaldo aunque la acción la hizo el aparato; el aparato queda en `terminal_id`.
--
-- ES UN DATO, NO CÓDIGO. Esta migración solo agrega la columna y la lógica; ninguna terminal cambia hasta que se le
-- pone una persona (`20261019190000_terminales_de_lima_sin_responsable.sql`). Con `firma_respaldo_id` vacío todo sigue
-- exactamente como estaba.
--
-- PARA VOLVER (cuando Lima se integre con Dynamic). Una sola línea, sin tocar la web:
--   update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;
-- Las pantallas vuelven a pedir el combo en la siguiente carga. Las filas ya guardadas conservan su firma.
--
-- Igual a `fn_actor_persona_id` de 20260929230000 (la de producción) más la rama de respaldo. Re-ejecutable.
-- Va en UNA sola parte: agrega una columna a `terminales` (lock_timeout corto) y reemplaza funciones; no crea políticas
-- (ADR-0195). Prueba: `pnpm pruebas:terminal-sin-responsable`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta retail.fn_actor_persona_id: pega antes 20260929230000_acciones_sin_responsable.sql';
  end if;
end $$;

alter table retail.terminales add column if not exists firma_respaldo_id uuid references public.personas (id);

comment on column retail.terminales.firma_respaldo_id is
  'ADR-0454 (temporal): si tiene valor, esta terminal NO pide responsable y todo lo que guarda lo firma esa persona (fn_actor_persona_id). Vaciarla devuelve el combo «Responsable». No da poderes: los permisos son de la cuenta.';

-- ==================== Quién firma ====================
create or replace function retail.fn_actor_persona_id(p_de_tienda boolean default true)
returns uuid
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_headers json;
  v_texto text;
  v_responsable uuid;
  v_momento timestamptz := now();
  v_ubicacion uuid;
  v_terminal record;
  v_yo uuid;
  v_omitida boolean := false;
  v_respaldo uuid;
begin
  -- Sin sesión (SQL Editor, scripts con la llave de servicio): igual que antes, nadie.
  if auth.uid() is null then
    return null;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_texto := nullif(trim(v_headers ->> 'x-responsable'), '');
  if v_texto is not null then
    begin
      v_responsable := v_texto::uuid;
    exception when invalid_text_representation then
      raise exception 'El responsable enviado no es válido' using errcode = '22P02';
    end;
  end if;
  -- Acción soltada del combo (20260929230000): solo cuenta si NO se eligió a nadie y la clave está en la lista.
  v_texto := nullif(trim(v_headers ->> 'x-responsable-omitido'), '');
  if v_texto is not null and v_responsable is null then
    v_omitida := exists (select 1 from retail.acciones_sin_responsable a where a.clave = v_texto);
  end if;
  -- Venta sin conexión: vale la hora de la venta (Felipe, 2026-09-22), acotada a 7 días atrás.
  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  if v_texto is not null then
    begin
      v_momento := v_texto::timestamptz;
    exception when others then
      raise exception 'La hora de la operación no es válida' using errcode = '22007';
    end;
    if v_momento > now() + interval '5 minutes' or v_momento < now() - interval '7 days' then
      raise exception 'La hora de la operación está fuera de rango' using errcode = '22007';
    end if;
  end if;

  select * into v_terminal from retail.fn_terminal_actual() limit 1;

  -- Sesión de TERMINAL: siempre firma una persona presente en SU tienda… salvo una acción soltada del combo (queda sin
  -- persona) y salvo una terminal con firma de respaldo (ADR-0454), que firma siempre como esa persona.
  if v_terminal.id is not null then
    if p_de_tienda then
      v_respaldo := retail.fn_terminal_firma_respaldo_id(v_terminal.id);
      if v_respaldo is not null then
        return v_respaldo;
      end if;
    end if;
    if v_responsable is null then
      if v_omitida then
        return null;
      end if;
      raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                   where p.id = v_responsable and p.estado = 'activo') then
      raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
    end if;
    if not retail.fn_persona_presente(v_responsable, v_terminal.ubicacion_id, v_momento) then
      raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
    end if;
    return v_responsable;
  end if;

  -- Sesión de PERSONA.
  select p.id into v_yo from public.personas p where p.auth_user_id = auth.uid();
  if not p_de_tienda or (v_responsable is null and (v_omitida or not retail.fn_exige_responsable())) then
    return v_yo; -- idéntico a la búsqueda que reemplaza
  end if;
  -- ADMIN (20260924171300): firma a su nombre sin marcar asistencia. Sin responsable o eligiéndose a sí mismo; si
  -- elige a otra persona, esa pasa por el candado de abajo como con cualquier cuenta.
  if coalesce(v_responsable, v_yo) = v_yo and retail.fn_es_admin() then
    return v_yo;
  end if;
  if v_responsable is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  begin
    v_ubicacion := nullif(trim(v_headers ->> 'x-ubicacion'), '')::uuid;
  exception when invalid_text_representation then
    v_ubicacion := null;
  end;
  if v_ubicacion is null or not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'Falta la tienda de la operación' using errcode = '42501', hint = 'ubicacion_requerida';
  end if;
  if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                 where p.id = v_responsable and p.estado = 'activo') then
    raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
  end if;
  if not retail.fn_persona_presente(v_responsable, v_ubicacion, v_momento) then
    raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
  end if;
  return v_responsable;
end;
$fn$;

comment on function retail.fn_actor_persona_id(boolean) is
  'ADR-0162: quién FIRMA la operación. Desde 20260923230000 toda función que guarda llama con true: firma el responsable del combo (x-responsable presente en la sede x-ubicacion). Desde 20260924171300 el Admin (fn_es_admin) firma a su nombre sin marcar asistencia. Desde 20260929230000, una acción de retail.acciones_sin_responsable (encabezado x-responsable-omitido) firma la persona de la sesión sin asistencia, o nadie (NULL) si es una terminal. Desde 20261019185000 (ADR-0454, temporal), una terminal con terminales.firma_respaldo_id firma SIEMPRE como esa persona, sin responsable ni asistencia. false queda solo para PERMISOS que se comparan con la cuenta (fn_alcanzo_a, «no te quites/suspendas/cambies el rol a ti mismo»). NO decide permisos: eso es de la cuenta (fn_es_lider, fn_puede_*).';

-- ==================== La persona de respaldo de una terminal ====================
-- Solo si sigue siendo alguien con acceso a retail: si la persona se suspendió o salió, la terminal vuelve a pedir
-- responsable (falla CERRADO: el candado se reactiva, nunca se firma a nombre de quien ya no está).
create or replace function retail.fn_terminal_firma_respaldo_id(p_terminal_id uuid)
returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id
  from retail.terminales t
  join public.personas p on p.id = t.firma_respaldo_id and p.estado = 'activo'
  join retail.colaboradores c on c.persona_id = p.id
  where t.id = p_terminal_id and t.activo;
$$;

comment on function retail.fn_terminal_firma_respaldo_id(uuid) is
  'ADR-0454: la persona a cuyo nombre firma una terminal (terminales.firma_respaldo_id) si sigue activa y con acceso a retail; si no, vacío. La llama fn_actor_persona_id; no es para la API.';

-- Lo que la web necesita: ¿esta sesión es una terminal con firma de respaldo? y a nombre de quién (para dibujar «Atendió» /
-- «Cerró» sin pedir nada). Una persona o una terminal sin respaldo reciben cero filas.
create or replace function retail.fn_terminal_firma_respaldo()
returns table (persona_id uuid, nombre text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || left(p.apellidos, 1) || '.'
  from retail.fn_terminal_actual() t
  join public.personas p on p.id = retail.fn_terminal_firma_respaldo_id(t.id);
$$;

comment on function retail.fn_terminal_firma_respaldo() is
  'ADR-0454: la persona de respaldo de la terminal de esta sesión (persona_id y nombre corto), o ninguna fila. La web la lee para no pedir el combo «Responsable».';

do $$
declare
  v_firma text;
begin
  -- Solo la llama fn_actor_persona_id (security definer): nadie la necesita por la API.
  revoke all on function retail.fn_terminal_firma_respaldo_id(uuid) from public, anon, authenticated;
  foreach v_firma in array array['retail.fn_terminal_firma_respaldo()', 'retail.fn_actor_persona_id(boolean)'] loop
    execute format('revoke all on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end $$;
