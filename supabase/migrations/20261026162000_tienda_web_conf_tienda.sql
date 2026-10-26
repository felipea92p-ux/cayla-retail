-- ============================================================================
-- 20261026162000_tienda_web_conf_tienda.sql — CAYLA V2 · Tienda web ▸ Conf. Tienda (ADR-0518)
--
-- EL PROBLEMA PRIMERO. La pantalla Conf. Tienda se rediseñó (maqueta docs/maquetas/tienda-web-conf-2026-10/, aprobada por Felipe el
-- 2026-10-26) y pide cosas que la base no guarda: en qué orden salen las tiendas en la web, el enlace del mapa, la foto de la fachada, el
-- horario por días y los cierres por fecha. Hoy el horario es un texto libre («Lun–Sáb 10–9») que la web solo repite: no puede decir
-- «Abierta ahora» ni «Cerrada hoy».
--
-- LO QUE HACE (una sección por actividad de la construcción; cada una se puede pegar sola, en orden)
--   ACTIVIDAD 2 · ORDEN. `ubicacion_datos_web.orden` y `guardar_orden_tiendas_web(uuid[])`: la web lista las tiendas en ese orden.
--   ACTIVIDAD 3 · MAPA. `ubicacion_datos_web.mapa_url` (solo enlaces de Google Maps) y `guardar_mapa_tienda_web(uuid, text)`: con él, el
--      botón «Cómo llegar» de la web abre ese lugar exacto; sin él, la web sigue buscando la dirección escrita, como hasta hoy.
--   ACTIVIDAD 4 · FOTO. El almacén público `retail-tiendas` (1 MB, JPG y WebP; el ERP sube la foto ya reducida a 200 KB o menos),
--      `ubicacion_datos_web.foto_ruta` (solo una ruta `tiendas/<tienda>/<archivo>`) y `guardar_foto_tienda_web(uuid, text)`. La base guarda la
--      RUTA; la web arma la dirección. Solo se SUBE: cada foto nueva lleva un nombre nuevo (nunca se pisa ni se borra desde el ERP).
--
-- LECTURAS. `fn_configuracion_tienda_web()` (el ERP) y `tienda_sedes()` (la web) se reescriben UNA vez, al final, con todo lo nuevo.
--   Solo AGREGAN claves al JSON: ninguna que ya leyera una pantalla o una función cambia de nombre ni de forma.
--
-- QUÉ SE GARANTIZA Y DÓNDE.
--   · Solo el líder o quien tenga «Datos y plazos de la tienda web» ordena (`fn_puede_ajustes_tienda_web()`), firmado por el responsable
--     (`fn_actor_persona_id(true)`), con su rastro en `configuracion_historial`.
--   · Solo tiendas abiertas, sin repetir ninguna (el orden es una lista, no un empate).
--   · El mapa es un enlace de Google Maps y nada más (CHECK de la fila): se dibuja como un botón en la web del cliente, así que no puede
--     ser cualquier dirección ni un `javascript:`. La misma regla vive en `@cayla-retail/shared/tienda-web-sede` para decirlo antes.
--   · Dos personas ordenando a la vez se turnan (`pg_advisory_xact_lock`): gana la última, nunca queda un orden mezclado.
--
-- PRODUCCIÓN. NO está aplicada. Se pega en DOS partes, por separado y en orden (ADR-0195): TODO hasta la línea «PARTE FINAL» primero, y
-- «PARTE FINAL · la política de subida de la foto» sola y al final, fuera del horario de tienda (en Supabase, crear una política toma en
-- exclusiva las tablas de `auth` y `storage` hasta el final de la transacción). `lock_timeout` corta a los 3 s si algo retiene una tabla;
-- las dos se pueden volver a correr. En un Postgres sin Storage (el local) la parte del almacén avisa y sigue.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ============================== ACTIVIDAD 2 · el orden de las tiendas ==============================

alter table retail.ubicacion_datos_web add column if not exists orden integer;

comment on column retail.ubicacion_datos_web.orden is
  'Tienda web ▸ Conf. Tienda (ADR-0518): el lugar de la tienda en la web (1 es la primera). Sin orden va al final, por nombre. Solo por guardar_orden_tiendas_web.';

-- PROMETE: guarda el orden de las tiendas tal como llega (la primera del arreglo es la primera de la web). Solo tiendas abiertas y sin
--   repetir; una tienda que no viene en la lista conserva su lugar relativo al final. Si nada cambió, no escribe ni anota.
create or replace function retail.guardar_orden_tiendas_web(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_antes uuid[];
  v_ids uuid[] := coalesce(p_ids, '{}');
begin
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Ordenar las tiendas de la web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  if cardinality(v_ids) = 0 then
    raise exception 'Falta la lista de tiendas que se va a ordenar.' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) as x) then
    raise exception 'Una tienda no puede estar dos veces en el orden.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_ids) as x
     where not exists (select 1 from retail.ubicaciones u where u.id = x and u.tipo = 'tienda' and u.activo)
  ) then
    raise exception 'Solo una tienda abierta aparece en la web.' using errcode = 'P0001';
  end if;

  -- Dos personas ordenando a la vez se turnan: la segunda compara contra lo que dejó la primera.
  perform pg_advisory_xact_lock(hashtext('tienda_web_orden'));

  -- Si cada tienda de la lista ya tiene justo su lugar, no hay nada que escribir ni anotar.
  if not exists (
    select 1
      from unnest(v_ids) with ordinality as x (id, n)
      left join retail.ubicacion_datos_web w on w.ubicacion_id = x.id
     where w.orden is distinct from x.n::integer
  ) then
    return;
  end if;

  select coalesce(array_agg(u.id order by coalesce(w.orden, 2147483647), u.nombre), '{}') into v_antes
    from retail.ubicaciones u
    left join retail.ubicacion_datos_web w on w.ubicacion_id = u.id
   where u.tipo = 'tienda' and u.activo and u.id = any (v_ids);

  insert into retail.ubicacion_datos_web (ubicacion_id, orden, actualizado_en)
  select x.id, x.n::integer, now() from unnest(v_ids) with ordinality as x (id, n)
  on conflict (ubicacion_id) do update set orden = excluded.orden, actualizado_en = excluded.actualizado_en;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tienda_web_orden', jsonb_build_object('antes', to_jsonb(v_antes), 'despues', to_jsonb(v_ids)), v_actor);
end
$$;

comment on function retail.guardar_orden_tiendas_web(uuid[]) is
  'Tienda web ▸ Conf. Tienda (ADR-0518): el orden en que salen las tiendas en la web. Solo tiendas abiertas, sin repetir. Líder o módulo «Datos y plazos de la tienda web»; firma el responsable; deja rastro.';

revoke all on function retail.guardar_orden_tiendas_web(uuid[]) from public, anon;
grant execute on function retail.guardar_orden_tiendas_web(uuid[]) to authenticated;

-- ============================== ACTIVIDAD 3 · el mapa de cada tienda ==============================

alter table retail.ubicacion_datos_web add column if not exists mapa_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ubicacion_datos_web_mapa_valido' and conrelid = 'retail.ubicacion_datos_web'::regclass) then
    alter table retail.ubicacion_datos_web add constraint ubicacion_datos_web_mapa_valido check (
      mapa_url is null or (
        char_length(mapa_url) between 1 and 400
        and mapa_url = btrim(mapa_url)
        and mapa_url ~* '^https://(www\.google\.com/maps|google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)(/\S*)?(\?\S*)?$'
      )
    );
  end if;
end
$$;

comment on column retail.ubicacion_datos_web.mapa_url is
  'Tienda web ▸ Conf. Tienda (ADR-0518): enlace de Google Maps del local; con él, «Cómo llegar» abre ese lugar exacto. Sin él, la web busca la dirección. Solo por guardar_mapa_tienda_web.';

-- PROMETE: guarda el enlace de mapa de una tienda abierta; vacío lo quita (la web vuelve a buscar la dirección). Solo enlaces de Google
--   Maps, sin espacios, hasta 400 letras. Si nada cambió, no escribe ni anota.
create or replace function retail.guardar_mapa_tienda_web(p_ubicacion_id uuid, p_mapa_url text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_tipo text;
  v_activo boolean;
  v_mapa text := nullif(btrim(coalesce(p_mapa_url, '')), '');
  v_antes retail.ubicacion_datos_web;
begin
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Cambiar el mapa de la tienda web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  select u.tipo, u.activo into v_tipo, v_activo from retail.ubicaciones u where u.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'P0001';
  end if;
  if v_tipo is distinct from 'tienda' or not v_activo then
    raise exception 'Solo una tienda abierta aparece en la web.' using errcode = 'P0001';
  end if;
  if v_mapa is not null and (
       char_length(v_mapa) > 400
       or v_mapa !~* '^https://(www\.google\.com/maps|google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)(/\S*)?(\?\S*)?$') then
    raise exception 'El mapa tiene que ser un enlace de Google Maps (el de «Compartir» sirve).' using errcode = 'P0001', hint = 'mapa_invalido';
  end if;

  select * into v_antes from retail.ubicacion_datos_web w where w.ubicacion_id = p_ubicacion_id for update;
  if found then
    if v_antes.mapa_url is not distinct from v_mapa then
      return;
    end if;
  elsif v_mapa is null then
    return;
  end if;

  insert into retail.ubicacion_datos_web (ubicacion_id, mapa_url, actualizado_en)
  values (p_ubicacion_id, v_mapa, now())
  on conflict (ubicacion_id) do update set mapa_url = excluded.mapa_url, actualizado_en = excluded.actualizado_en;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tienda_web_mapa', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes.mapa_url, 'despues', v_mapa), v_actor);
end
$$;

comment on function retail.guardar_mapa_tienda_web(uuid, text) is
  'Tienda web ▸ Conf. Tienda (ADR-0518): el enlace de Google Maps de una tienda abierta (vacío lo quita). Líder o módulo «Datos y plazos de la tienda web»; firma el responsable; deja rastro.';

revoke all on function retail.guardar_mapa_tienda_web(uuid, text) from public, anon;
grant execute on function retail.guardar_mapa_tienda_web(uuid, text) to authenticated;

-- ============================== ACTIVIDAD 4 · la foto de la fachada ==============================

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'tienda_web_conf: sin schema storage en este Postgres (Storage local apagado); el almacén retail-tiendas se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-tiendas', 'retail-tiendas', true, 1024 * 1024, array['image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end
$$;

alter table retail.ubicacion_datos_web add column if not exists foto_ruta text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ubicacion_datos_web_foto_valida' and conrelid = 'retail.ubicacion_datos_web'::regclass) then
    alter table retail.ubicacion_datos_web add constraint ubicacion_datos_web_foto_valida check (
      foto_ruta is null or foto_ruta ~ ('^tiendas/' || ubicacion_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$')
    );
  end if;
end
$$;

comment on column retail.ubicacion_datos_web.foto_ruta is
  'Tienda web ▸ Conf. Tienda (ADR-0518): la ruta de la foto de la fachada dentro del almacén retail-tiendas («tiendas/<tienda>/<archivo>.webp»). Solo por guardar_foto_tienda_web.';

-- PROMETE: guarda la foto de una tienda abierta (la ruta que subió el ERP a SU carpeta del almacén); vacío la quita (vuelve el dibujo de la
--   fachada). Una ruta de otra tienda, de otro almacén o con `..` no pasa. Si nada cambió, no escribe ni anota. La foto anterior queda en el
--   almacén (solo se sube), así que volver a una es guardar su ruta.
create or replace function retail.guardar_foto_tienda_web(p_ubicacion_id uuid, p_foto_ruta text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_tipo text;
  v_activo boolean;
  v_foto text := nullif(btrim(coalesce(p_foto_ruta, '')), '');
  v_antes retail.ubicacion_datos_web;
begin
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Cambiar la foto de la tienda web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  select u.tipo, u.activo into v_tipo, v_activo from retail.ubicaciones u where u.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'P0001';
  end if;
  if v_tipo is distinct from 'tienda' or not v_activo then
    raise exception 'Solo una tienda abierta aparece en la web.' using errcode = 'P0001';
  end if;
  if v_foto is not null and v_foto !~ ('^tiendas/' || p_ubicacion_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$') then
    raise exception 'Esa foto no es de esta tienda: súbela de nuevo desde aquí.' using errcode = 'P0001', hint = 'foto_invalida';
  end if;

  select * into v_antes from retail.ubicacion_datos_web w where w.ubicacion_id = p_ubicacion_id for update;
  if found then
    if v_antes.foto_ruta is not distinct from v_foto then
      return;
    end if;
  elsif v_foto is null then
    return;
  end if;

  insert into retail.ubicacion_datos_web (ubicacion_id, foto_ruta, actualizado_en)
  values (p_ubicacion_id, v_foto, now())
  on conflict (ubicacion_id) do update set foto_ruta = excluded.foto_ruta, actualizado_en = excluded.actualizado_en;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tienda_web_foto', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes.foto_ruta, 'despues', v_foto), v_actor);
end
$$;

comment on function retail.guardar_foto_tienda_web(uuid, text) is
  'Tienda web ▸ Conf. Tienda (ADR-0518): la ruta de la foto de fachada de una tienda abierta (vacío la quita). Líder o módulo «Datos y plazos de la tienda web»; firma el responsable; deja rastro.';

revoke all on function retail.guardar_foto_tienda_web(uuid, text) from public, anon;
grant execute on function retail.guardar_foto_tienda_web(uuid, text) to authenticated;

-- ============================== LAS LECTURAS (se reescriben una vez, con todo lo nuevo) ==============================

-- El ERP lee: cada tienda abierta, en el orden de la web, con lo que la pantalla muestra. Mismo permiso que antes.
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
          'mostrar', coalesce(w.mostrar, false),
          'orden', w.orden,
          'mapa_url', w.mapa_url,
          'foto_ruta', w.foto_ruta)
        order by coalesce(w.orden, 2147483647), u.nombre, u.id)
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

-- La web lee: las tiendas que se muestran, en el orden de la web (sin orden, por nombre como hasta hoy).
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
      'whatsapp', u.whatsapp_numero,
      'mapa', w.mapa_url,
      'foto', w.foto_ruta)
    order by coalesce(w.orden, 2147483647), lower(w.nombre_web), u.id), '[]'::jsonb))
  from retail.ubicacion_datos_web w
  join retail.ubicaciones u on u.id = w.ubicacion_id
  where w.mostrar
    and u.tipo = 'tienda'
    and u.activo
    and cardinality(retail.fn_sede_web_falta(w.nombre_web, w.direccion, u.whatsapp_numero)) = 0;
$$;

reset lock_timeout;

-- ============================== PARTE FINAL · la política de subida de la foto (SOLA, al final) ==============================
-- Quien sube a `retail-tiendas` es quien tiene «Datos y plazos de la tienda web» (o el líder): la misma llave de las funciones de arriba. Leer no
-- pide política: el almacén es público. Sin política de borrar ni de actualizar.

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'tienda_web_conf: sin schema storage en este Postgres; la política de subida se crea solo en producción.';
    return;
  end if;

  if not exists (
    select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'retail_tiendas_insert'
  ) then
    create policy retail_tiendas_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'retail-tiendas' and (select retail.fn_puede_ajustes_tienda_web()));
  end if;
end
$$;

reset lock_timeout;
