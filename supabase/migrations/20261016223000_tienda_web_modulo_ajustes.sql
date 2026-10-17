-- Tienda web ▸ Ajustes pasa a ser un módulo propio en Roles y accesos (ADR-0430 act., Felipe 2026-10-16).
--
-- EL PROBLEMA. Al juntar la tienda online en un grupo del lateral (20261016174000), «Ajustes» (lo que la web muestra de cada tienda y
-- los plazos de los pedidos) se quedó abierta por el módulo «Configuración», que es mucho más: metas, fondo de caja, gastos fijos,
-- parámetros tributarios, de todas las tiendas. Para dar «Ajustes» había que dar todo eso, y un rol que veía Pedidos, Vitrina y
-- Recomendaciones no podía ver «Ajustes» sin abrirle Configuración entera. Felipe: «debe ser un módulo».
--
-- 1. El módulo `ajustes_web` («Datos y plazos de la tienda web»), en el grupo «Tienda web», después de Recomendaciones. Nace SIN rol
--    (solo el líder) y delegable (CLAUDE.md «Módulos y roles»): esta migración no se lo da a ningún rol. Verificado en producción el
--    2026-10-16: ningún rol activo tiene «Configuración», así que quitarle a Configuración esta pantalla no le quita nada a nadie.
-- 2. La pregunta `fn_puede_ajustes_tienda_web()`: el líder, o quien tenga ese módulo. Es la única llave de las tres funciones propias
--    de la pantalla: `fn_configuracion_tienda_web` (leer), `guardar_sede_tienda_web` y `guardar_parametros_tienda_web` (guardar).
--    Antes pedían `fn_puede_configurar()`; ahora Configuración ya NO abre estas tres.
-- 3. `guardar_whatsapp_tienda` es compartida: la usan Configuración ▸ Tiendas y caja (su módulo) y esta pantalla (el WhatsApp de cada
--    tienda es parte de lo que la web muestra). Acepta cualquiera de las dos llaves; el resto de su cuerpo no cambia.
--
-- Las cuatro funciones se reescriben desde su definición VIVA en producción (2026-10-16): solo cambia la llave y su mensaje.
-- Idempotente y sin políticas ni `alter` de tablas: se pega en el SQL Editor de una vez (CLAUDE.md «Políticas y deadlocks»).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. El módulo -------------------------------------------------------------------------------------------------------------

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('ajustes_web', 'Tienda web', 'Datos y plazos de la tienda web',
   'Cambiar lo que la tienda online le muestra al cliente de cada tienda (nombre, WhatsApp, dirección, horario y si se ve en la web) y los plazos de los pedidos web (cuánto espera un pedido sin confirmar o sin pagar, cuánto sin recoger y desde cuántas unidades se muestra cuánto queda)',
   69, false, true)
on conflict (clave) do nothing;

-- 2. La pregunta -------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_puede_ajustes_tienda_web()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['ajustes_web']); $$;

revoke all on function retail.fn_puede_ajustes_tienda_web() from public, anon;
grant execute on function retail.fn_puede_ajustes_tienda_web() to authenticated, service_role;

-- 3. Las funciones ---------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_configuracion_tienda_web()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Ver los datos de la tienda web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
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

create or replace function retail.guardar_parametros_tienda_web(p_horas_para_confirmar integer, p_horas_aviso_sin_pagar integer, p_dias_aviso_sin_recoger integer, p_quedan_pocas_desde integer)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_antes retail.configuracion_tienda_web;
begin
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Cambiar los plazos de la tienda web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
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

create or replace function retail.guardar_sede_tienda_web(p_ubicacion_id uuid, p_nombre_web text, p_direccion text, p_horario text, p_mostrar boolean)
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
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Cambiar los datos de la tienda web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
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

-- Compartida con Configuración ▸ Tiendas y caja: cualquiera de las dos llaves.
create or replace function retail.guardar_whatsapp_tienda(p_ubicacion_id uuid, p_numero text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_numero text;
  v_tipo text;
  v_antes text;
begin
  -- El líder, quien tenga «Configuración» (Tiendas y caja) o quien tenga «Datos y plazos de la tienda web» (el WhatsApp es parte de
  -- lo que la web muestra de cada tienda).
  if not (retail.fn_puede_configurar() or retail.fn_puede_ajustes_tienda_web()) then
    raise exception 'Cambiar el WhatsApp de la tienda necesita el módulo «Configuración» o «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  -- Vacío = quitarlo (la tienda deja de mostrar el QR).
  if nullif(btrim(coalesce(p_numero, '')), '') is not null then
    v_numero := retail.fn_celular_normalizado(p_numero);
    if v_numero is null or v_numero !~ '^9[0-9]{8}$' then
      raise exception 'El WhatsApp de la tienda es un celular de 9 dígitos que empieza en 9.'
        using errcode = '22023', hint = 'whatsapp_tienda_invalido';
    end if;
  end if;

  -- `for no key update`: dos líderes guardando a la vez no se mezclan, y una venta (que solo pide la llave) no espera.
  select u.tipo, u.whatsapp_numero into v_tipo, v_antes
    from retail.ubicaciones u where u.id = p_ubicacion_id
     for no key update;
  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'P0001';
  end if;
  if v_tipo is distinct from 'tienda' then
    raise exception 'Solo una tienda tiene WhatsApp del club.' using errcode = 'P0001';
  end if;
  if v_antes is not distinct from v_numero then
    return;
  end if;

  update retail.ubicaciones set whatsapp_numero = v_numero where id = p_ubicacion_id;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('whatsapp_tienda', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes, 'despues', v_numero), v_actor);
end;
$$;
