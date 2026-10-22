-- ============================================================================
-- Campañas: una sola llave, abierta a Campañas, Campañas de la tienda web y Sellos (ADR-0476, Felipe 2026-10-22).
--
-- EL PROBLEMA. Una campaña (Día del Gato, Navidad) es una fila de `retail.etiquetas` con estilo `campana`. El 2026-10-17 se pegó en
--   producción una parte del PR #1190 (ADR-0436, que nunca se fusionó): `20261017151000_campanas_una_sola_llave.sql` cambió la llave
--   de configurar una campaña —fechas, descuento, categorías, prendas— del módulo Etiquetas al módulo `campanas` (`fn_puede_campanas`).
--   Desde entonces producción y el repo dicen cosas distintas: el repo cree que basta Etiquetas, y en producción Compras y Terminal de
--   ventas (que tienen Etiquetas y no `campanas`) ya no pueden armar una campaña ni ponérsela a una prenda. Y hay dos módulos de
--   campañas en Tienda web con el mismo orden (`campanas`, de #1190, y `campanas_web`, de ADR-0471).
--
-- LO QUE DECIDIÓ FELIPE (2026-10-22): «quiero que se pueda editar, agregar prendas y demás cosas a las campañas desde ambos módulos».
--   · Quien ve «Campañas» (`campanas`, que se muda a Catálogo en la migración de Catálogo ▸ Campañas, ADR-0473) O «Campañas de la tienda
--     web» (`campanas_web`) edita todo de una campaña: nombre, fechas, descuento, categorías, prendas, activarla o no.
--   · Quien ve «Sellos» (`etiquetas`) también, como antes del 2026-10-17.
--   · Un sello que no es campaña (Estreno, Para liquidar) sigue siendo solo de Sellos.
--
-- LO QUE HACE.
--   1. `fn_puede_campanas()` = líder, o un rol con `campanas`, `campanas_web` o `etiquetas`. Es LA llave de una campaña; todo lo que
--      configura o etiqueta una campaña la pregunta.
--   2. Trae al repo, tal como corren en producción desde el 2026-10-17 (md5 comparados el 2026-10-22), lo que #1190 dejó pegado de esa
--      llave: `fn_puede_tocar_etiqueta` (campaña → `fn_puede_campanas`; otro sello → `fn_puede_editar_etiquetas`), el disparador de alta
--      (una campaña nace aprobada si quien la crea tiene su llave), `etiquetar_variantes`, `actualizar_campana_etiqueta` y las funciones
--      de pantalla `crear_campana`, `guardar_campana`, `activar_campana` y `campana_detalle` (con `fn_campana_nombre_valido`). Lo único
--      que cambia en ellas son los mensajes, que ahora nombran los tres módulos. Así el ERP de las dos pantallas guarda una campaña
--      sin pasar por la política `etiquetas_update` (que sigue pidiendo Sellos para escribir la fila directo).
--   3. Archiva lo que #1190 dejó en producción para su editor de diseño, que reemplazó ADR-0471 (`campana_web_disenos`): a
--      `campana_diseno`, `guardar_diseno_borrador`, `publicar_diseno_campana` y `volver_al_diseno_anterior` se les quita el permiso
--      de ejecutar (no se borran) y `retail.campana_disenos` (vacía el 2026-10-22) queda con un comentario de archivada. Solo si existen:
--      en local y en el CI no existen.
--
-- QUÉ NO HACE. No crea ni mueve el módulo `campanas` (lo hace la migración de Catálogo ▸ Campañas, ADR-0473) ni da un módulo a un rol
--   (ADR-0161: eso lo hace el líder en Roles y accesos). No toca la política `etiquetas_update` ni `fn_puede_editar_etiquetas`.
--   `fn_capacidad_por_modulos` con una clave que todavía no existe (en local, `campanas`) responde falso: no se rompe nada.
--
-- DESCARTÉ: copiar la migración `20261017151000` de #1190 tal cual: su número está reservado por otra rama y reemplaza por ancla desde
--   el texto viejo, que en producción ya no está. Aquí cada función se escribe completa y una guarda, al principio, comprueba que lo
--   que hay es lo del repo, lo de producción o esto mismo; si no, no aplica nada.
-- DESCARTÉ: abrir la política `etiquetas_update` a las campañas: una política toma en exclusiva las tablas de `auth` y `storage`
--   (ADR-0195) y la pantalla ya tiene sus funciones `security definer`.
--
-- CÓMO SE PEGA. Este archivo tal cual en el SQL Editor de producción, de una vez. Idempotente, `lock_timeout` 3 s, sin políticas ni
--   `drop trigger` (el disparador se cambia con `create or replace function`), sin `alter table`.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: cada función es la del repo, la de producción (2026-10-22) o esta misma (lleva «ADR-0476») -----------------------

do $$
declare
  v_f record;
  v_cuerpo text;
begin
  for v_f in
    select * from (values
      ('retail.fn_puede_campanas()', array['464526e0131154200ea6aa80cbeb8615']),
      ('retail.fn_puede_tocar_etiqueta(uuid,numeric)', array['780ff9ef81265d1b9086f7f29670c4c3', 'd27e3f3e3665541adc7af6fa57bac934']),
      ('retail.fn_etiquetas_estado_trigger()', array['533f30d29c83a8f38d0a8261d66ce3d1', '1da9269defafe0513d7a7d98a043f6d5']),
      ('retail.etiquetar_variantes(jsonb)', array['ee7e23e33bfb15d7a9f12e189f06ccc1', 'cc66f3ce4c503c7e55fda3cf711e5162']),
      ('retail.actualizar_campana_etiqueta(uuid,numeric,date,date,uuid[])', array['6c1c1e9f280bec3d28d1cef48d535121', '4b5b48ef3f39a3726b40f66d3c4e8b42']),
      ('retail.fn_campana_nombre_valido(text,uuid)', array['52f207da4cebc56388a88ca63e8b1db9']),
      ('retail.campana_detalle(uuid)', array['2e3e5915d42202a2a945d148f7ec5c82']),
      ('retail.crear_campana(text,date,date)', array['5e00c6c434d8fc6d7b7e9eb01db23155']),
      ('retail.guardar_campana(uuid,text,numeric,date,date,uuid[])', array['05c9da460d10f006980125ec9b202daa']),
      ('retail.activar_campana(uuid,boolean)', array['0f6f8c91996c956b66285d30c313a916'])
    ) as t(firma, md5s)
  loop
    continue when to_regprocedure(v_f.firma) is null;
    v_cuerpo := (select prosrc from pg_proc where oid = to_regprocedure(v_f.firma));
    if position('ADR-0476' in v_cuerpo) = 0 and not (md5(v_cuerpo) = any (v_f.md5s)) then
      raise exception '% cambió desde el 2026-10-22 (md5 %): regenera esta migración desde su definición real. No se aplicó nada.',
        v_f.firma, md5(v_cuerpo);
    end if;
  end loop;
end;
$$;

-- 1. LA llave de una campaña --------------------------------------------------------------------------------------------------

create or replace function retail.fn_puede_campanas()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- ADR-0476 (Felipe 2026-10-22): una campaña la configura quien ve cualquiera de sus dos módulos o Sellos.
  select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['campanas', 'campanas_web', 'etiquetas']);
$$;

comment on function retail.fn_puede_campanas() is
  'LA llave de una campaña (ADR-0476): el líder o un rol con «Campañas» (campanas), «Campañas de la tienda web» (campanas_web) o «Sellos» (etiquetas). La preguntan fn_puede_tocar_etiqueta, el disparador de alta de etiquetas, etiquetar_variantes y las funciones de pantalla de una campaña.';

revoke all on function retail.fn_puede_campanas() from public, anon;
grant execute on function retail.fn_puede_campanas() to authenticated, service_role;

-- 2. La llave de cada etiqueta: una campaña, la de arriba; otro sello, Sellos ---------------------------------------------------

create or replace function retail.fn_puede_tocar_etiqueta(p_etiqueta_id uuid, p_descuento_nuevo numeric default null)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- ADR-0476: una campaña, fn_puede_campanas (Campañas, Campañas de la tienda web o Sellos); otro sello, Sellos (ADR-0293).
  -- El descuento no cambia la llave.
  select case
    when exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estilo = 'campana') then retail.fn_puede_campanas()
    else retail.fn_puede_editar_etiquetas()
  end;
$$;

comment on function retail.fn_puede_tocar_etiqueta(uuid, numeric) is
  'Quién configura una etiqueta (descuento, fechas, categorías, prendas): una campaña, fn_puede_campanas (ADR-0476); cualquier otro sello, fn_puede_editar_etiquetas (ADR-0293). La preguntan actualizar_campana_etiqueta y etiquetar_variantes.';

-- 3. Al crear: la aprueba quien tiene la llave de esa etiqueta -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION retail.fn_etiquetas_estado_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_persona uuid;
begin
  v_persona := retail.fn_actor_persona_id(true);

  if tg_op = 'INSERT' then
    new.propuesto_por := v_persona;
    -- Nace aprobada si quien la crea tiene la llave de ESA etiqueta (ADR-0476): una campaña, `fn_puede_campanas` (Campañas, Campañas de
    -- la tienda web o Sellos); otro sello, `fn_puede_editar_etiquetas` (Sellos).
    if (case when new.estilo = 'campana' then retail.fn_puede_campanas() else retail.fn_puede_editar_etiquetas() end) then
      new.estado := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
    return new;
  end if;

  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    if old.estado not in ('pendiente', 'rechazado') then
      raise exception 'Solo se puede aprobar una etiqueta que está pendiente, o reactivar una rechazada.';
    end if;
    if coalesce(trim(new.notas), '') = '' then
      raise exception 'Aprobar una etiqueta exige un comentario breve (para qué sirve, por qué es distinta de las que ya existen).';
    end if;
    new.activo := true;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    if exists (select 1 from variante_etiquetas where etiqueta_id = old.id) then
      raise exception 'Ya hay una variante usando esta etiqueta — apruébala y desactívala si ya no sirve.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$function$;

-- 4. Poner o quitar prendas: entra quien tiene una de las llaves; cada etiqueta se mira con la suya ------------------------------

CREATE OR REPLACE FUNCTION retail.etiquetar_variantes(p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare
  c_max_cambios constant int := 50;
  c_max_variantes constant int := 2000;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_cambio jsonb;
  v_etiqueta_id uuid;
  v_estado text;
  v_activa boolean;
  v_agregar uuid[];
  v_quitar uuid[];
  v_elem text;
  v_filas int;
  v_agregadas int := 0;
  v_quitadas int := 0;
begin
  -- Entra quien tiene Sellos o una de las Campañas (ADR-0436, ADR-0476); abajo, cada etiqueta se mira con su propia llave.
  if not (retail.fn_puede_editar_etiquetas() or retail.fn_puede_campanas()) then
    raise exception 'Poner o quitar prendas necesita el módulo «Sellos», «Campañas» o «Campañas de la tienda web» en tu rol.' using errcode = '42501';
  end if;

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'No hay cambios para aplicar. Recarga la pantalla.';
  end if;
  if jsonb_array_length(p_cambios) > c_max_cambios then
    raise exception 'Son demasiadas etiquetas a la vez (máximo %). Hazlo en tandas.', c_max_cambios;
  end if;

  for v_cambio in select * from jsonb_array_elements(p_cambios) loop
    -- La forma se valida ANTES de castear: un uuid mal formado haría que
    -- Postgres tire su error crudo en vez de una frase que la pantalla pueda leer.
    if jsonb_typeof(v_cambio) <> 'object' or not coalesce(v_cambio ->> 'etiqueta_id', '') ~ c_uuid then
      raise exception 'Una de las etiquetas no es válida. Recarga la pantalla.';
    end if;
    v_etiqueta_id := (v_cambio ->> 'etiqueta_id')::uuid;

    if jsonb_typeof(coalesce(v_cambio -> 'agregar', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_cambio -> 'quitar', '[]'::jsonb)) <> 'array' then
      raise exception 'La lista de prendas de una etiqueta no es válida. Recarga la pantalla.';
    end if;
    if jsonb_array_length(coalesce(v_cambio -> 'agregar', '[]'::jsonb)) > c_max_variantes
       or jsonb_array_length(coalesce(v_cambio -> 'quitar', '[]'::jsonb)) > c_max_variantes then
      raise exception 'Son demasiadas prendas a la vez (máximo % por etiqueta). Hazlo en tandas.', c_max_variantes;
    end if;

    for v_elem in
      select jsonb_array_elements_text(coalesce(v_cambio -> 'agregar', '[]'::jsonb))
      union all select jsonb_array_elements_text(coalesce(v_cambio -> 'quitar', '[]'::jsonb))
    loop
      if not v_elem ~ c_uuid then
        raise exception 'Una de las prendas no es válida. Recarga la pantalla.';
      end if;
    end loop;

    select coalesce(array_agg(distinct x::uuid), '{}') into v_agregar
      from jsonb_array_elements_text(coalesce(v_cambio -> 'agregar', '[]'::jsonb)) x;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_quitar
      from jsonb_array_elements_text(coalesce(v_cambio -> 'quitar', '[]'::jsonb)) x;

    if v_agregar && v_quitar then
      raise exception 'Una misma prenda no puede agregarse y quitarse a la vez. Recarga la pantalla.';
    end if;

    -- Lock de lectura sobre la etiqueta: nadie la desactiva a mitad de lote.
    select estado, activo into v_estado, v_activa from retail.etiquetas where id = v_etiqueta_id for share;
    if not found then
      raise exception 'Esa etiqueta ya no existe. Recarga la pantalla.';
    end if;

    -- ADR-0161 (20260923130000): poner o quitar una etiqueta CON descuento cambia el precio en caja: solo el líder.
    if not retail.fn_puede_tocar_etiqueta(v_etiqueta_id) then
      raise exception 'Las prendas de una campaña se eligen con «Campañas», «Campañas de la tienda web» o «Sellos»; las de otro sello, con «Sellos».' using errcode = '42501';
    end if;

    if coalesce(array_length(v_agregar, 1), 0) > 0 then
      if v_estado <> 'aprobado' or not v_activa then
        raise exception 'Solo se puede etiquetar con una etiqueta aprobada y activa.';
      end if;
      if (select count(*) from retail.variantes where id = any (v_agregar) and activo) <> array_length(v_agregar, 1) then
        raise exception 'Una de las prendas ya no está disponible. Recarga la pantalla.';
      end if;

      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
        select unnest(v_agregar), v_etiqueta_id
        on conflict (variante_id, etiqueta_id) do nothing;
      get diagnostics v_filas = row_count;
      v_agregadas := v_agregadas + v_filas;
    end if;

    if coalesce(array_length(v_quitar, 1), 0) > 0 then
      delete from retail.variante_etiquetas where etiqueta_id = v_etiqueta_id and variante_id = any (v_quitar);
      get diagnostics v_filas = row_count;
      v_quitadas := v_quitadas + v_filas;
    end if;
  end loop;

  return jsonb_build_object('agregadas', v_agregadas, 'quitadas', v_quitadas);
end;
$function$;

-- 5. Configurar la campaña (descuento, fechas, categorías) ------------------------------------------------------------------------

create or replace function retail.actualizar_campana_etiqueta(p_etiqueta_id uuid, p_descuento_pct numeric, p_vigente_desde date, p_vigente_hasta date, p_categoria_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_estado text;
begin
  -- ADR-0476: una campaña, con Campañas, Campañas de la tienda web o Sellos; otro sello, con Sellos.
  if not retail.fn_puede_tocar_etiqueta(p_etiqueta_id, p_descuento_pct) then
    raise exception 'Una campaña se configura con «Campañas», «Campañas de la tienda web» o «Sellos»; otro sello con descuento, con «Sellos».' using errcode = '42501';
  end if;

  select estado into v_estado from retail.etiquetas where id = p_etiqueta_id;
  if not found then
    raise exception 'Esa etiqueta ya no existe. Recarga la pantalla.';
  end if;
  if p_descuento_pct is not null and v_estado <> 'aprobado' then
    raise exception 'Aprueba la etiqueta antes de ponerle un descuento.';
  end if;
  if p_descuento_pct is not null and (p_descuento_pct <= 0 or p_descuento_pct > 100) then
    raise exception 'El descuento tiene que ser mayor que 0 y como máximo 100 %%.';
  end if;
  if p_vigente_desde is not null and p_vigente_hasta is not null and p_vigente_desde > p_vigente_hasta then
    raise exception 'La fecha de inicio no puede ser posterior a la de fin.';
  end if;

  update retail.etiquetas
    set descuento_pct = p_descuento_pct,
        vigente_desde = p_vigente_desde,
        vigente_hasta = p_vigente_hasta
    where id = p_etiqueta_id;

  delete from retail.etiqueta_categorias where etiqueta_id = p_etiqueta_id;
  insert into retail.etiqueta_categorias (etiqueta_id, categoria_id)
    select p_etiqueta_id, c from (select distinct unnest(coalesce(p_categoria_ids, '{}'::uuid[])) as c) x;
end;
$function$;

-- 6. Las funciones de pantalla de una campaña (las dos pantallas de Campañas) ------------------------------------------------------

-- El nombre de una campaña: sin espacios de más, de 1 a 60 letras y sin repetir otra etiqueta (sin importar tildes ni mayúsculas).
create or replace function retail.fn_campana_nombre_valido(p_nombre text, p_sin_contar uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- ADR-0476: la misma regla de #1190 (ADR-0436), traída al repo.
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
begin
  if v_nombre = '' then
    raise exception 'Escribe el nombre de la campaña.' using errcode = 'P0001', hint = 'campana_nombre';
  end if;
  if length(v_nombre) > 60 then
    raise exception 'El nombre es muy largo: hasta 60 letras.' using errcode = 'P0001', hint = 'campana_nombre';
  end if;
  if exists (
    select 1 from retail.etiquetas e
    where retail.fn_clave_texto(e.nombre) = retail.fn_clave_texto(v_nombre) and e.id is distinct from p_sin_contar
  ) then
    raise exception 'Ya hay una campaña o sello «%».', v_nombre using errcode = 'P0001', hint = 'campana_existe';
  end if;
  return v_nombre;
end;
$$;

revoke all on function retail.fn_campana_nombre_valido(text, uuid) from public, anon, authenticated;

create or replace function retail.campana_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v jsonb;
begin
  -- ADR-0476: la lee quien tiene la llave de las campañas.
  if not retail.fn_puede_campanas() then
    raise exception 'Ver una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.' using errcode = '42501';
  end if;
  select jsonb_build_object(
      'id', e.id,
      'nombre', e.nombre,
      'activo', e.activo,
      'estado', e.estado,
      'desde', e.vigente_desde,
      'hasta', e.vigente_hasta,
      'pct', e.descuento_pct,
      'categoria_ids', coalesce((select jsonb_agg(ec.categoria_id order by ec.categoria_id) from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id), '[]'::jsonb),
      'variante_ids', coalesce((select jsonb_agg(ve.variante_id order by ve.variante_id) from retail.variante_etiquetas ve where ve.etiqueta_id = e.id), '[]'::jsonb),
      -- Las prendas que lleva a mano, por modelo: lo que dibuja la pestaña Prendas (la miniatura sale del color y la categoría).
      'prendas', coalesce((
        select jsonb_agg(x.prenda order by x.nombre)
        from (
          select p.referencia as nombre,
                 jsonb_build_object(
                   'producto_id', p.id,
                   'nombre', p.referencia,
                   'codigo', p.codigo,
                   'categoria', c.nombre,
                   'prefijo', c.prefijo,
                   'familia', c.familia,
                   'foto', (select f.url from retail.producto_fotos f where f.producto_id = p.id order by f.es_principal desc, f.orden, f.created_at limit 1),
                   'variantes', count(*),
                   'colores', jsonb_agg(distinct jsonb_build_object('nombre', co.nombre, 'hex', co.hex)) filter (where co.codigo is not null)
                 ) as prenda
          from retail.variante_etiquetas ve
          join retail.variantes v on v.id = ve.variante_id
          join retail.productos p on p.id = v.producto_id
          left join retail.categorias c on c.id = p.categoria_id
          left join retail.colores co on co.codigo = v.color_codigo
          where ve.etiqueta_id = e.id
          group by p.id, p.referencia, p.codigo, c.nombre, c.prefijo, c.familia
        ) x
      ), '[]'::jsonb)
    )
  into v
  from retail.etiquetas e
  where e.id = p_id and e.estilo = 'campana' and e.estado <> 'rechazado';
  if v is null then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  return v;
end;
$$;

comment on function retail.campana_detalle(uuid) is
  'Campañas (ADR-0436, ADR-0476): una campaña por dentro: {id, nombre, activo, estado, desde, hasta, pct, categoria_ids, variante_ids, prendas: [{producto_id, nombre, codigo, categoria, prefijo, familia, foto, variantes, colores}]}. Pide fn_puede_campanas().';

revoke all on function retail.campana_detalle(uuid) from public, anon;
grant execute on function retail.campana_detalle(uuid) to authenticated, service_role;

-- Una campaña nueva: la etiqueta de estilo campaña, aprobada (quien la crea tiene la llave) y, si se dieron, con sus fechas. Sin
-- descuento ni prendas: eso se pone después.
create or replace function retail.crear_campana(p_nombre text, p_desde date default null, p_hasta date default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text;
  v_id uuid;
  v_estado text;
begin
  -- ADR-0476: la crea quien tiene la llave de las campañas.
  if not retail.fn_puede_campanas() then
    raise exception 'Crear una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.' using errcode = '42501';
  end if;
  v_nombre := retail.fn_campana_nombre_valido(p_nombre);
  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'La campaña no puede terminar antes de empezar.' using errcode = 'P0001', hint = 'campana_fechas';
  end if;
  begin
    -- El disparador `etiquetas_estado_biut` firma quién la propuso (el responsable del combo) y la aprueba.
    insert into retail.etiquetas (nombre, estilo) values (v_nombre, 'campana') returning id, estado into v_id, v_estado;
  exception when unique_violation then
    raise exception 'Ya hay una campaña o sello «%».', v_nombre using errcode = 'P0001', hint = 'campana_existe';
  end;
  if v_estado <> 'aprobado' then
    raise exception 'La campaña quedaría por aprobar: créala desde una cuenta con «Campañas», «Campañas de la tienda web» o «Sellos».' using errcode = '42501';
  end if;
  if p_desde is not null or p_hasta is not null then
    perform retail.actualizar_campana_etiqueta(v_id, null, p_desde, p_hasta, '{}'::uuid[]);
  end if;
  return v_id;
end;
$$;

comment on function retail.crear_campana(text, date, date) is
  'Campañas (ADR-0436, ADR-0476): crea una campaña (etiqueta de estilo campaña, aprobada) con su nombre y, si se dan, sus fechas. Devuelve su id. Pide fn_puede_campanas().';

revoke all on function retail.crear_campana(text, date, date) from public, anon;
grant execute on function retail.crear_campana(text, date, date) to authenticated, service_role;

-- Guardar los datos de una campaña, todo o nada: el nombre aquí; descuento, fechas y categorías por el camino de siempre
-- (`actualizar_campana_etiqueta`, con sus reglas: aprobada para tener descuento, de 0 a 100 %, fechas en orden). La fila se toma
-- primero: dos personas guardando la misma campaña a la vez se turnan, nadie pisa a medias lo del otro.
create or replace function retail.guardar_campana(
  p_id uuid,
  p_nombre text,
  p_descuento_pct numeric,
  p_desde date,
  p_hasta date,
  p_categoria_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text;
  v_actual text;
begin
  -- ADR-0476: la guarda quien tiene la llave de las campañas.
  if not retail.fn_puede_campanas() then
    raise exception 'Configurar una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.' using errcode = '42501';
  end if;
  select e.nombre into v_actual from retail.etiquetas e where e.id = p_id and e.estilo = 'campana' and e.estado <> 'rechazado' for update;
  if not found then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  v_nombre := retail.fn_campana_nombre_valido(p_nombre, p_id);
  if v_nombre is distinct from v_actual then
    update retail.etiquetas set nombre = v_nombre where id = p_id;
  end if;
  perform retail.actualizar_campana_etiqueta(p_id, p_descuento_pct, p_desde, p_hasta, coalesce(p_categoria_ids, '{}'::uuid[]));
end;
$$;

comment on function retail.guardar_campana(uuid, text, numeric, date, date, uuid[]) is
  'Campañas (ADR-0436, ADR-0476): guarda el nombre, el descuento, las fechas y las categorías de una campaña, todo o nada (lo demás por actualizar_campana_etiqueta). Pide fn_puede_campanas().';

revoke all on function retail.guardar_campana(uuid, text, numeric, date, date, uuid[]) from public, anon;
grant execute on function retail.guardar_campana(uuid, text, numeric, date, date, uuid[]) to authenticated, service_role;

-- Desactivar o volver a activar. La misma regla que Sellos: no se desactiva mientras alguna prenda la lleve a mano (sus prendas
-- seguirían con una etiqueta que nadie ve); se le quitan primero.
create or replace function retail.activar_campana(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_prendas integer;
begin
  -- ADR-0476: la activa o desactiva quien tiene la llave de las campañas.
  if not retail.fn_puede_campanas() then
    raise exception 'Configurar una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.' using errcode = '42501';
  end if;
  perform 1 from retail.etiquetas e where e.id = p_id and e.estilo = 'campana' and e.estado = 'aprobado' for update;
  if not found then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  if p_activo is null then
    raise exception 'Falta decir si se activa o se desactiva.' using errcode = 'P0001';
  end if;
  if not p_activo then
    select count(*) into v_prendas from retail.variante_etiquetas where etiqueta_id = p_id;
    if v_prendas > 0 then
      raise exception 'No se puede desactivar: % % todavía la %. Quítaselas primero en Prendas.',
        v_prendas, case when v_prendas = 1 then 'prenda' else 'prendas' end, case when v_prendas = 1 then 'lleva' else 'llevan' end
        using errcode = 'P0001', hint = 'campana_con_prendas';
    end if;
  end if;
  update retail.etiquetas set activo = p_activo where id = p_id and activo is distinct from p_activo;
end;
$$;

comment on function retail.activar_campana(uuid, boolean) is
  'Campañas (ADR-0436, ADR-0476): desactiva una campaña (si ninguna prenda la lleva a mano) o la vuelve a activar. Pide fn_puede_campanas().';

revoke all on function retail.activar_campana(uuid, boolean) from public, anon;
grant execute on function retail.activar_campana(uuid, boolean) to authenticated, service_role;

-- 7. Lo que #1190 dejó para su editor de diseño se archiva (solo existe en producción; nada se borra) ---------------------------------

do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'retail.campana_diseno(uuid)',
    'retail.guardar_diseno_borrador(uuid,jsonb,integer)',
    'retail.publicar_diseno_campana(uuid,integer)',
    'retail.volver_al_diseno_anterior(uuid)'
  ] loop
    continue when to_regprocedure(v_firma) is null;
    execute format('revoke execute on function %s from public, anon, authenticated', to_regprocedure(v_firma));
  end loop;
  if to_regclass('retail.campana_disenos') is not null then
    execute $c$comment on table retail.campana_disenos is
      'ARCHIVADA (ADR-0476, 2026-10-22): el diseño de portada de #1190 (ADR-0436), que nunca se publicó en el ERP. El diseño de cada campaña vive en campana_web_disenos (ADR-0471). Vacía al archivarse; sus funciones de escritura ya no se pueden llamar. tienda_portada() la sigue leyendo y devuelve diseno: null.'$c$;
  end if;
end;
$$;

-- 8. Comprobación ---------------------------------------------------------------------------------------------------------------

do $$
begin
  if position('''campanas_web''' in pg_get_functiondef('retail.fn_puede_campanas()'::regprocedure)) = 0
     or position('fn_puede_campanas' in pg_get_functiondef('retail.fn_puede_tocar_etiqueta(uuid,numeric)'::regprocedure)) = 0
     or position('fn_puede_campanas' in pg_get_functiondef('retail.fn_etiquetas_estado_trigger()'::regprocedure)) = 0
     or position('fn_puede_campanas' in pg_get_functiondef('retail.etiquetar_variantes(jsonb)'::regprocedure)) = 0
     or position('ADR-0476' in pg_get_functiondef('retail.actualizar_campana_etiqueta(uuid,numeric,date,date,uuid[])'::regprocedure)) = 0
     or to_regprocedure('retail.guardar_campana(uuid,text,numeric,date,date,uuid[])') is null then
    raise exception 'La llave de las campañas no quedó completa: no se aplica nada.';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
