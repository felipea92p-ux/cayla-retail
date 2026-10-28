-- ============================================================================
-- 20261020003000_tienda_bandeja_vaciar.sql — CAYLA V2 · Tienda online: «vaciar bandeja» de las notificaciones (Felipe, 2026-10-19)
--
-- EL CAMBIO. El panel de la campanita tenía «Eliminar todas», que borraba. Felipe quiere otra cosa: «vaciar bandeja» quita las notificaciones
-- DEL PANEL, pero no las borra: siguen en «Todas las notificaciones». Lo que llegue después vuelve a salir en el panel.
--
-- CÓMO. Una fecha por cuenta: cuándo vació la bandeja (`retail.avisos_bandeja`). El panel muestra solo las notificaciones que llegaron
-- DESPUÉS de esa fecha; «Todas las notificaciones» muestra todas las no borradas, como antes. No se toca ninguna notificación: vaciar es
-- barato y se deshace solo cuando llega algo nuevo.
--
-- QUÉ CAMBIA EN LAS FUNCIONES
--   · `tienda_avisos_listar` gana `p_solo_bandeja`: con `true`, solo las de la bandeja (y las claves también); con `false`, todas.
--   · `tienda_avisos_vaciar_bandeja`: pone la fecha de vaciado en ahora.
--
-- NO SE PEGA EN PRODUCCIÓN desde aquí: es una migración local para probar. Felipe lo decide antes de pegarla.
-- ============================================================================

set search_path = retail, public;

create table if not exists retail.avisos_bandeja (
  cuenta_web_id uuid primary key references retail.cuentas_web (id) on delete cascade,
  vaciada_en timestamptz not null default now()
);

alter table retail.avisos_bandeja enable row level security;
revoke all on retail.avisos_bandeja from public, anon, authenticated, tienda_web;

comment on table retail.avisos_bandeja is
  'Tienda online (Felipe, 2026-10-19): cuándo vació la cuenta la bandeja de notificaciones (el panel muestra lo posterior). Interna: solo sus funciones tienda_avisos_*.';

-- La versión anterior (sin bandeja) se reemplaza: el mismo nombre con un parámetro más.
drop function if exists retail.tienda_avisos_listar(uuid, text, integer, integer);

create or replace function retail.tienda_avisos_listar(p_usuario_web_id uuid, p_busqueda text, p_pagina integer, p_tamano integer, p_solo_bandeja boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_tamano integer := least(greatest(coalesce(p_tamano, 10), 1), 50);
  v_busca text := '%' || replace(replace(replace(lower(btrim(coalesce(p_busqueda, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_desde timestamptz := '-infinity'::timestamptz;
  v_total integer;
  v_items jsonb;
  v_claves jsonb;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  -- Solo la bandeja: lo que llegó después de la última vez que la cuenta la vació.
  if coalesce(p_solo_bandeja, false) then
    select b.vaciada_en into v_desde from retail.avisos_bandeja b where b.cuenta_web_id = v_cuenta;
    v_desde := coalesce(v_desde, '-infinity'::timestamptz);
  end if;

  select count(*) into v_total from retail.avisos_tienda a
   where a.cuenta_web_id = v_cuenta and a.borrado_en is null and a.recibido_en > v_desde
     and lower(a.titulo || ' ' || a.texto) like v_busca;

  select coalesce(jsonb_agg(f.j order by f.recibido_en desc, f.clave desc), '[]'::jsonb) into v_items
    from (
      select a.recibido_en, a.clave,
             jsonb_build_object('clave', a.clave, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'href', a.href,
                                'recibido_en', a.recibido_en, 'vigente', a.vigente) as j
        from retail.avisos_tienda a
       where a.cuenta_web_id = v_cuenta and a.borrado_en is null and a.recibido_en > v_desde
         and lower(a.titulo || ' ' || a.texto) like v_busca
       order by a.recibido_en desc, a.clave desc
       limit v_tamano offset (v_pagina - 1) * v_tamano
    ) f;

  select coalesce(jsonb_agg(a.clave), '[]'::jsonb) into v_claves
    from retail.avisos_tienda a
   where a.cuenta_web_id = v_cuenta and a.borrado_en is null and a.recibido_en > v_desde;

  return jsonb_build_object('estado', 'ok', 'total', v_total, 'pagina', v_pagina, 'tamano', v_tamano,
                            'items', v_items, 'claves', v_claves);
end;
$$;

create or replace function retail.tienda_avisos_vaciar_bandeja(p_usuario_web_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  insert into retail.avisos_bandeja (cuenta_web_id, vaciada_en) values (v_cuenta, now())
  on conflict (cuenta_web_id) do update set vaciada_en = excluded.vaciada_en;
  return jsonb_build_object('estado', 'ok');
end;
$$;

revoke all on function retail.tienda_avisos_listar(uuid, text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function retail.tienda_avisos_vaciar_bandeja(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_avisos_listar(uuid, text, integer, integer, boolean) to tienda_web;
grant execute on function retail.tienda_avisos_vaciar_bandeja(uuid) to tienda_web;
