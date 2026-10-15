-- ============================================================================
-- 20261014231000_tienda_web_sedes_y_plazos.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 6
--
-- QUÉ HACE. Configuración ▸ Tienda web: lo que la web le muestra al cliente de cada tienda, y los plazos de los pedidos web.
--   1. `retail.ubicacion_datos_web`: por tienda, el nombre que lee el cliente («Trujillo», nunca «Tienda TRU»), la dirección
--      para recoger, el horario (texto libre) y si se muestra en la web. El WhatsApp NO vive aquí: es
--      `ubicaciones.whatsapp_numero`, el mismo celular del QR del club (ADR-0288), y se sigue guardando con
--      `guardar_whatsapp_tienda` desde las dos pestañas. Una sola fuente de verdad: el cliente le escribe al mismo número
--      desde el cartel del mostrador y desde la web.
--   2. `retail.configuracion_tienda_web` (una sola fila): las horas para que una separación sin confirmar se cierre sola (24),
--      las horas del aviso de confirmado sin pagar (48), los días del aviso de pedido sin recoger (7) y desde cuántas unidades
--      el cliente ve el número en vez de «Hay» (3). Los leen los pedidos web (actividades 4, 7, 9 y 10).
--   3. `retail.fn_sede_web_falta`: LA regla de qué le falta a una tienda para verse en la web —nombre web, WhatsApp y
--      dirección; el horario es opcional—. La usan `guardar_sede_tienda_web` y `tienda_sedes`: una sola regla.
--   4. El ERP: `fn_configuracion_tienda_web()` lee; `guardar_sede_tienda_web(…)` y `guardar_parametros_tienda_web(…)` guardan.
--      Con el permiso del resto de Configuración (`fn_puede_configurar`: el líder o quien tenga el módulo, ADR-0253),
--      firmadas con el responsable del combo (`fn_actor_persona_id(true)`) y con su rastro en `configuracion_historial`.
--   5. La tienda: `retail.tienda_sedes()`, las tiendas que se muestran, por la puerta angosta (rol `tienda_web`).
--
-- POR QUÉ TABLAS PROPIAS. El núcleo no se toca (principio 1): `ubicaciones` la lee cada venta, y lo de la web va aparte, como el
-- precio web va en `vitrina_productos` y no en `productos` (ADR-0408, DECIDÍ 5). De paso, la migración no tiene `alter` de una
-- tabla en uso ni políticas, y se pega entera.
--
-- QUÉ SE GARANTIZA Y DÓNDE.
--   · Una tienda que se muestra tiene nombre web y dirección: CHECK de la fila (`ubicacion_datos_web_mostrar_completa`).
--   · …y WhatsApp, que vive en otra tabla: `guardar_sede_tienda_web` no deja mostrarla sin él, y `tienda_sedes` no devuelve una
--     tienda sin él. Si alguien le quita el número en Tiendas y caja, la tienda sale sola de la web en vez de quedar rota
--     (sin dónde mandar el pedido).
--   · Dos tiendas no se llaman igual en la web: índice único sin mayúsculas.
--   · Los plazos tienen piso y techo (CHECK): nada en cero ni negativo. El umbral va de 1 a 3: la cifra exacta de 4 o más nunca
--     sale de la base hacia la web (ADR-0408, DECIDÍ 6).
--   · Nadie lee ni escribe estas tablas por fuera de las funciones: RLS encendido sin políticas, y revoke.
--
-- PRODUCCIÓN. NO está aplicada. Va después de 20261014220000 (crea el rol `tienda_web`, que esta usa en un grant), en la
-- actividad 13 y con el OK de Felipe. Se pega entera en el SQL Editor: no crea políticas ni `drop trigger`, no altera ninguna
-- tabla en uso (la llave foránea de la tabla nueva toma un instante `ubicaciones` en modo SHARE ROW EXCLUSIVE, compatible con
-- las lecturas y las ventas; `lock_timeout` la corta a los 3 s si algo la retiene) y se puede volver a correr.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Lo que la web muestra de cada tienda ------------------------------------------------------------------------------

create table if not exists retail.ubicacion_datos_web (
  ubicacion_id uuid primary key references retail.ubicaciones (id),
  nombre_web text,
  direccion text,
  horario text,
  mostrar boolean not null default false,
  actualizado_en timestamptz not null default now(),
  constraint ubicacion_datos_web_nombre_valido check (nombre_web is null or (nombre_web = btrim(nombre_web) and char_length(nombre_web) between 1 and 40)),
  constraint ubicacion_datos_web_direccion_valida check (direccion is null or (direccion = btrim(direccion) and char_length(direccion) between 1 and 160)),
  constraint ubicacion_datos_web_horario_valido check (horario is null or (horario = btrim(horario) and char_length(horario) between 1 and 120)),
  constraint ubicacion_datos_web_mostrar_completa check (not mostrar or (nombre_web is not null and direccion is not null))
);

create unique index if not exists ubicacion_datos_web_nombre_unico on retail.ubicacion_datos_web (lower(nombre_web)) where nombre_web is not null;

comment on table retail.ubicacion_datos_web is
  'Tienda online (ADR-0408, act. 6): lo que la web muestra de cada tienda. El WhatsApp es ubicaciones.whatsapp_numero (el del QR del club). Solo por guardar_sede_tienda_web; la web lee tienda_sedes().';
comment on column retail.ubicacion_datos_web.nombre_web is 'El nombre que lee el cliente («Trujillo»), no el interno («Tienda TRU»). Único sin mayúsculas.';
comment on column retail.ubicacion_datos_web.direccion is 'Dónde se recoge el pedido web, como lo leería el cliente (calle, número, referencia).';
comment on column retail.ubicacion_datos_web.horario is 'Texto libre («Lunes a sábado, de 10 a. m. a 9 p. m.»). Opcional: sin él la web no lo muestra.';
comment on column retail.ubicacion_datos_web.mostrar is 'Si la tienda sale en la web. Para encenderla necesita nombre web, dirección y WhatsApp (fn_sede_web_falta).';

-- 2. Los plazos y el umbral de la tienda web (una sola fila) -----------------------------------------------------------

create table if not exists retail.configuracion_tienda_web (
  id boolean primary key default true,
  horas_para_confirmar integer not null default 24,
  horas_aviso_sin_pagar integer not null default 48,
  dias_aviso_sin_recoger integer not null default 7,
  quedan_pocas_desde integer not null default 3,
  actualizado_en timestamptz not null default now(),
  constraint configuracion_tienda_web_una_fila check (id),
  constraint configuracion_tienda_web_horas_para_confirmar_rango check (horas_para_confirmar between 1 and 168),
  constraint configuracion_tienda_web_horas_aviso_sin_pagar_rango check (horas_aviso_sin_pagar between 1 and 720),
  constraint configuracion_tienda_web_dias_aviso_sin_recoger_rango check (dias_aviso_sin_recoger between 1 and 60),
  constraint configuracion_tienda_web_quedan_pocas_desde_rango check (quedan_pocas_desde between 1 and 3)
);

insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;

comment on table retail.configuracion_tienda_web is
  'Tienda online (ADR-0408, act. 6): plazos y umbral de los pedidos web, para todas las sedes. Una sola fila. Solo por guardar_parametros_tienda_web.';
comment on column retail.configuracion_tienda_web.horas_para_confirmar is 'Horas corridas para que una separación sin confirmar se cierre sola (decisión de Felipe: 24).';
comment on column retail.configuracion_tienda_web.horas_aviso_sin_pagar is 'Horas desde que se confirma hasta el aviso de «confirmado y sin pagar»; decide la sede (48).';
comment on column retail.configuracion_tienda_web.dias_aviso_sin_recoger is 'Días desde que se paga hasta el aviso de «sin recoger»; se le recuerda y decide la sede (7).';
comment on column retail.configuracion_tienda_web.quedan_pocas_desde is 'Con esta cantidad o menos el cliente ve el número (y «Última» con 1); con más, «Hay». De 1 a 3: la cifra de 4 o más nunca sale a la web.';

-- 3. Lo que le falta a una tienda para verse en la web (LA regla) -------------------------------------------------------
-- Devuelve las claves en el orden de la pantalla: 'nombre_web', 'whatsapp', 'direccion'. Vacío = lista para mostrarse.
-- El WhatsApp con la misma forma que `ubicaciones_whatsapp_numero_formato` (9 dígitos que empiezan en 9).
create or replace function retail.fn_sede_web_falta(p_nombre_web text, p_direccion text, p_whatsapp text)
returns text[]
language sql
immutable
set search_path = retail, public
as $$
  select array_remove(array[
    case when nullif(btrim(coalesce(p_nombre_web, '')), '') is null then 'nombre_web' end,
    case when coalesce(p_whatsapp, '') !~ '^9[0-9]{8}$' then 'whatsapp' end,
    case when nullif(btrim(coalesce(p_direccion, '')), '') is null then 'direccion' end
  ]::text[], null);
$$;

comment on function retail.fn_sede_web_falta(text, text, text) is
  'Tienda online (ADR-0408, act. 6): lo que le falta a una tienda para verse en la web (nombre_web, whatsapp, direccion). La única regla: la usan guardar_sede_tienda_web y tienda_sedes.';

-- 4. El ERP lee: Configuración ▸ Tienda web ----------------------------------------------------------------------------
create or replace function retail.fn_configuracion_tienda_web()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Ver la configuración necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'sedes', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', u.id,
          'nombre', u.nombre,
          'nombre_web', w.nombre_web,
          'whatsapp', u.whatsapp_numero,
          'direccion', w.direccion,
          'horario', w.horario,
          'mostrar', coalesce(w.mostrar, false))
        order by u.nombre)
      from retail.ubicaciones u
      left join retail.ubicacion_datos_web w on w.ubicacion_id = u.id
      where u.tipo = 'tienda' and u.activo), '[]'::jsonb),
    'parametros', (
      select jsonb_build_object(
        'horas_para_confirmar', c.horas_para_confirmar,
        'horas_aviso_sin_pagar', c.horas_aviso_sin_pagar,
        'dias_aviso_sin_recoger', c.dias_aviso_sin_recoger,
        'quedan_pocas_desde', c.quedan_pocas_desde)
      from retail.configuracion_tienda_web c
      where c.id)
  );
end
$$;

comment on function retail.fn_configuracion_tienda_web() is
  'Configuración ▸ Tienda web (ADR-0408, act. 6): cada tienda abierta con lo que la web muestra (el WhatsApp es el del QR del club) y los plazos. Líder o módulo Configuración.';

-- 5. Guardar lo de una tienda (el WhatsApp sigue en guardar_whatsapp_tienda) ---------------------------------------------
-- PROMETE: guarda nombre web, dirección, horario y si se muestra, todo de una vez (la pantalla manda los cuatro, como
--   guardar_metas_tienda manda las siete metas). Vacío = sin dato. No deja mostrar una tienda a la que le falte algo
--   (`sede_web_incompleta`), ni dos con el mismo nombre en la web (`sede_web_nombre_repetido`). Si nada cambió, no escribe
--   ni anota. Solo tiendas abiertas.
create or replace function retail.guardar_sede_tienda_web(
  p_ubicacion_id uuid,
  p_nombre_web text,
  p_direccion text,
  p_horario text,
  p_mostrar boolean
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_tipo text;
  v_activo boolean;
  v_whatsapp text;
  -- Sin espacios de más («  Av.  Larco 345 » → «Av. Larco 345»); vacío = sin dato.
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre_web, '')), '\s+', ' ', 'g'), '');
  v_direccion text := nullif(regexp_replace(btrim(coalesce(p_direccion, '')), '\s+', ' ', 'g'), '');
  v_horario text := nullif(regexp_replace(btrim(coalesce(p_horario, '')), '\s+', ' ', 'g'), '');
  v_mostrar boolean := coalesce(p_mostrar, false);
  v_antes retail.ubicacion_datos_web;
  v_falta text[];
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Cambiar la tienda web necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  select u.tipo, u.activo, u.whatsapp_numero into v_tipo, v_activo, v_whatsapp
    from retail.ubicaciones u
   where u.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'P0001';
  end if;
  if v_tipo is distinct from 'tienda' or not v_activo then
    raise exception 'Solo una tienda abierta aparece en la web.' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) > 40 then
    raise exception 'El nombre en la web va hasta 40 letras.' using errcode = 'P0001';
  end if;
  if char_length(v_direccion) > 160 then
    raise exception 'La dirección va hasta 160 letras.' using errcode = 'P0001';
  end if;
  if char_length(v_horario) > 120 then
    raise exception 'El horario va hasta 120 letras.' using errcode = 'P0001';
  end if;

  if v_mostrar then
    v_falta := retail.fn_sede_web_falta(v_nombre, v_direccion, v_whatsapp);
    if cardinality(v_falta) > 0 then
      raise exception 'Para que se vea en la web todavía falta: %.',
        array_to_string(array(
          select case f when 'nombre_web' then 'el nombre que ve el cliente' when 'whatsapp' then 'el WhatsApp' else 'la dirección' end
            from unnest(v_falta) with ordinality as x (f, n)
           order by n), ', ')
        using errcode = 'P0001', hint = 'sede_web_incompleta';
    end if;
  end if;

  -- `for update`: dos personas guardando la misma tienda se ordenan; la segunda compara contra lo que dejó la primera.
  select * into v_antes from retail.ubicacion_datos_web w where w.ubicacion_id = p_ubicacion_id for update;
  if found then
    if v_antes.nombre_web is not distinct from v_nombre and v_antes.direccion is not distinct from v_direccion
       and v_antes.horario is not distinct from v_horario and v_antes.mostrar = v_mostrar then
      return;
    end if;
  elsif v_nombre is null and v_direccion is null and v_horario is null and not v_mostrar then
    return;
  end if;

  begin
    insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, horario, mostrar, actualizado_en)
    values (p_ubicacion_id, v_nombre, v_direccion, v_horario, v_mostrar, now())
    on conflict (ubicacion_id) do update
      set nombre_web = excluded.nombre_web,
          direccion = excluded.direccion,
          horario = excluded.horario,
          mostrar = excluded.mostrar,
          actualizado_en = excluded.actualizado_en;
  exception when unique_violation then
    raise exception 'Otra tienda ya se llama «%» en la web: elige un nombre distinto.', v_nombre
      using errcode = 'P0001', hint = 'sede_web_nombre_repetido';
  end;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tienda_web_sede',
          jsonb_build_object(
            'ubicacion_id', p_ubicacion_id,
            'antes', case when v_antes.ubicacion_id is null then null
                          else jsonb_build_object('nombre_web', v_antes.nombre_web, 'direccion', v_antes.direccion,
                                                  'horario', v_antes.horario, 'mostrar', v_antes.mostrar) end,
            'despues', jsonb_build_object('nombre_web', v_nombre, 'direccion', v_direccion, 'horario', v_horario, 'mostrar', v_mostrar)),
          v_actor);
end
$$;

comment on function retail.guardar_sede_tienda_web(uuid, text, text, text, boolean) is
  'Configuración ▸ Tienda web (ADR-0408, act. 6): nombre web, dirección, horario y si se muestra una tienda. No la muestra si le falta algo (sede_web_incompleta) ni repite un nombre (sede_web_nombre_repetido). Líder o módulo Configuración; firma el responsable; deja rastro.';

-- 6. Guardar los plazos y el umbral -------------------------------------------------------------------------------------
create or replace function retail.guardar_parametros_tienda_web(
  p_horas_para_confirmar integer,
  p_horas_aviso_sin_pagar integer,
  p_dias_aviso_sin_recoger integer,
  p_quedan_pocas_desde integer
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_antes retail.configuracion_tienda_web;
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Cambiar la tienda web necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  if p_horas_para_confirmar is null or p_horas_para_confirmar not between 1 and 168 then
    raise exception 'Las horas para confirmar van de 1 a 168 (una semana).' using errcode = 'P0001';
  end if;
  if p_horas_aviso_sin_pagar is null or p_horas_aviso_sin_pagar not between 1 and 720 then
    raise exception 'El aviso si no paga va de 1 a 720 horas (30 días).' using errcode = 'P0001';
  end if;
  if p_dias_aviso_sin_recoger is null or p_dias_aviso_sin_recoger not between 1 and 60 then
    raise exception 'El aviso si no recoge va de 1 a 60 días.' using errcode = 'P0001';
  end if;
  if p_quedan_pocas_desde is null or p_quedan_pocas_desde not between 1 and 3 then
    raise exception 'El número se muestra desde 1, 2 o 3 unidades: la cifra de 4 o más nunca sale a la web.' using errcode = 'P0001';
  end if;

  insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;
  select * into v_antes from retail.configuracion_tienda_web c where c.id for update;
  if v_antes.horas_para_confirmar = p_horas_para_confirmar and v_antes.horas_aviso_sin_pagar = p_horas_aviso_sin_pagar
     and v_antes.dias_aviso_sin_recoger = p_dias_aviso_sin_recoger and v_antes.quedan_pocas_desde = p_quedan_pocas_desde then
    return;
  end if;

  update retail.configuracion_tienda_web
     set horas_para_confirmar = p_horas_para_confirmar,
         horas_aviso_sin_pagar = p_horas_aviso_sin_pagar,
         dias_aviso_sin_recoger = p_dias_aviso_sin_recoger,
         quedan_pocas_desde = p_quedan_pocas_desde,
         actualizado_en = now()
   where id;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tienda_web_general',
          jsonb_build_object(
            'antes', jsonb_build_object('horas_para_confirmar', v_antes.horas_para_confirmar, 'horas_aviso_sin_pagar', v_antes.horas_aviso_sin_pagar,
                                        'dias_aviso_sin_recoger', v_antes.dias_aviso_sin_recoger, 'quedan_pocas_desde', v_antes.quedan_pocas_desde),
            'despues', jsonb_build_object('horas_para_confirmar', p_horas_para_confirmar, 'horas_aviso_sin_pagar', p_horas_aviso_sin_pagar,
                                          'dias_aviso_sin_recoger', p_dias_aviso_sin_recoger, 'quedan_pocas_desde', p_quedan_pocas_desde)),
          v_actor);
end
$$;

comment on function retail.guardar_parametros_tienda_web(integer, integer, integer, integer) is
  'Configuración ▸ Tienda web (ADR-0408, act. 6): horas para confirmar (1–168), aviso sin pagar en horas (1–720), aviso sin recoger en días (1–60) y desde cuántas unidades se ve el número (1–3). Líder o módulo Configuración; firma el responsable; deja rastro.';

-- 7. La tienda lee: las tiendas que se muestran -------------------------------------------------------------------------
-- Solo las encendidas, abiertas y completas (la misma regla de arriba), por nombre web. El WhatsApp va como está guardado
-- (9 dígitos): la tienda arma el enlace y el «+51 987 654 321».
create or replace function retail.tienda_sedes()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object('sedes', coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nombre', w.nombre_web,
      'direccion', w.direccion,
      'horario', w.horario,
      'whatsapp', u.whatsapp_numero)
    order by lower(w.nombre_web), u.id), '[]'::jsonb))
  from retail.ubicacion_datos_web w
  join retail.ubicaciones u on u.id = w.ubicacion_id
  where w.mostrar
    and u.tipo = 'tienda'
    and u.activo
    and cardinality(retail.fn_sede_web_falta(w.nombre_web, w.direccion, u.whatsapp_numero)) = 0;
$$;

comment on function retail.tienda_sedes() is
  'Tienda online (ADR-0408, act. 6): las tiendas que se muestran en la web. {sedes: [{id, nombre, direccion, horario, whatsapp}]}. Solo la llama tienda_web.';

-- 8. Permisos -----------------------------------------------------------------------------------------------------------
alter table retail.ubicacion_datos_web enable row level security;
alter table retail.configuracion_tienda_web enable row level security;
revoke all on retail.ubicacion_datos_web, retail.configuracion_tienda_web from public, anon, authenticated;

revoke all on function retail.fn_sede_web_falta(text, text, text) from public, anon, authenticated;
revoke all on function retail.fn_configuracion_tienda_web() from public, anon;
revoke all on function retail.guardar_sede_tienda_web(uuid, text, text, text, boolean) from public, anon;
revoke all on function retail.guardar_parametros_tienda_web(integer, integer, integer, integer) from public, anon;
grant execute on function retail.fn_configuracion_tienda_web() to authenticated;
grant execute on function retail.guardar_sede_tienda_web(uuid, text, text, text, boolean) to authenticated;
grant execute on function retail.guardar_parametros_tienda_web(integer, integer, integer, integer) to authenticated;

revoke all on function retail.tienda_sedes() from public, anon, authenticated;
grant execute on function retail.tienda_sedes() to tienda_web;

reset lock_timeout;
notify pgrst, 'reload schema';
