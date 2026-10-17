-- Tienda web ▸ Campañas (ADR-0436, actividad 4): cada campaña con su diseño en la portada, en borrador y publicado.
--
-- EL PROBLEMA. La portada de la tienda online pinta toda campaña con los mismos colores fijos. Felipe pidió que una colaboradora la
-- diseñe desde el ERP (maqueta aprobada «tal cual» el 2026-10-17: docs/maquetas/campanas-diseno-2026-10): elige un estilo y sus
-- colores, la prueba en la vista previa mientras la web sigue mostrando lo publicado, y la publica cuando le gusta. El diseño anterior
-- queda guardado: «Volver al anterior» lo regresa en un toque.
--
-- LO QUE HACE.
-- 1. `retail.campana_disenos`: un diseño por fila, con su estado. Por campaña, a lo más UN borrador (el que se prueba), UN publicado
--    (el que ve el cliente) y UN anterior (el que «Volver al anterior» regresa); lo que sale de ahí queda «archivado», nunca se borra.
--    Cada opción sale de una lista curada (las mismas de `packages/portada/src/diseno.ts` y `paletas.ts`; `campana-diseno.test.ts` las
--    compara), y la base impide los estados imposibles: una paleta propia sin sus colores, colores sueltos en una paleta curada, una
--    frase de más de 60 letras, más de 4 prendas, un publicado sin fecha de publicación.
-- 2. Las funciones de la pantalla (todas piden Campañas): `campana_diseno` (lo que hay), `guardar_diseno_borrador` (se guarda solo
--    mientras se prueba, con su versión: si otra persona lo cambió o lo publicó, no se pisa), `publicar_diseno_campana` (el borrador
--    pasa a publicado, el publicado a anterior, todo o nada) y `volver_al_diseno_anterior` (cambia el publicado por el anterior; sin
--    anterior, la portada vuelve a la de siempre, y otra vez lo regresa).
-- 3. Guardar el borrador se suelta del combo «Responsable» (`campana_diseno_borrador`, como `recorte_foto`): lo hace el ERP solo a cada
--    toque, y así lo aprobó Felipe en la maqueta (el combo está en la hoja «Publicar»). Publicar y volver al anterior SÍ piden quién.
-- 4. `campanas_lista` suma el diseño publicado de cada campaña y tres de sus prendas con foto: la miniatura de la lista es la portada
--    de verdad.
--
-- LO QUE NO HACE LA BASE: medir si la letra se lee (el contraste). Esa regla vive una sola vez, en `packages/portada/src/revision.ts`,
-- y la preguntan los dos lados: el ERP apaga «Publicar» si no se lee, y la tienda no pinta un diseño publicado que no se lea (sale el de
-- siempre). Repetirla aquí en SQL serían dos reglas que un día dirían cosas distintas.
--
-- Sin políticas y sin tocar tablas en uso: se pega de una vez (idempotente). La tabla nueva solo se lee y se escribe por estas
-- funciones `security definer`: RLS encendido y sin políticas (CLAUDE.md, «Políticas y deadlocks»).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Los colores de una paleta propia, revisados por la base ----------------------------------------------------------------------

create or replace function retail.fn_colores_de_portada_validos(c jsonb)
returns boolean
language sql
immutable
set search_path = retail, public, extensions
as $$
  -- {nombre, fondo, fondo2, letra, acento, noche?: {fondo?, fondo2?, letra?, acento?}}: los colores en #rrggbb minúscula.
  select jsonb_typeof(c) = 'object'
    and (select bool_and(k in ('nombre', 'fondo', 'fondo2', 'letra', 'acento', 'noche')) from jsonb_object_keys(c) k)
    and jsonb_typeof(c -> 'nombre') = 'string'
    and char_length(btrim(c ->> 'nombre')) between 1 and 60
    and coalesce(c ->> 'fondo', '') ~ '^#[0-9a-f]{6}$'
    and coalesce(c ->> 'fondo2', '') ~ '^#[0-9a-f]{6}$'
    and coalesce(c ->> 'letra', '') ~ '^#[0-9a-f]{6}$'
    and coalesce(c ->> 'acento', '') ~ '^#[0-9a-f]{6}$'
    and (
      not (c ? 'noche')
      or (
        jsonb_typeof(c -> 'noche') = 'object'
        and (select coalesce(bool_and(k in ('fondo', 'fondo2', 'letra', 'acento') and coalesce(c -> 'noche' ->> k, '') ~ '^#[0-9a-f]{6}$'), true)
             from jsonb_object_keys(c -> 'noche') k)
      )
    );
$$;

comment on function retail.fn_colores_de_portada_validos(jsonb) is
  'Tienda web ▸ Campañas (ADR-0436): ¿son válidos los colores de una paleta propia? {nombre, fondo, fondo2, letra, acento, noche?} en #rrggbb. La usa el check de campana_disenos.';

-- 2. La tabla ------------------------------------------------------------------------------------------------------------------

create table if not exists retail.campana_disenos (
  id uuid primary key default gen_random_uuid(),
  etiqueta_id uuid not null references retail.etiquetas (id),
  estado text not null,
  paleta text not null,
  colores jsonb,
  fondo text not null,
  patron text not null,
  intensidad text not null,
  acomodo text not null,
  corte smallint,
  tamano text not null,
  frase text not null default '',
  prendas uuid[],
  cuenta boolean not null,
  pct_gigante boolean not null,
  colibri boolean not null,
  sello text not null,
  version integer not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.personas (id),
  publicado_en timestamptz,
  publicado_por uuid references public.personas (id),
  constraint campana_disenos_estado check (estado in ('borrador', 'publicado', 'anterior', 'archivado')),
  -- Las listas curadas: las mismas de packages/portada (campana-diseno.test.ts las compara con el código).
  constraint campana_disenos_paleta check (paleta in ('cayla', 'noche', 'caramelo', 'calabaza', 'bosque', 'medianoche', 'oliva', 'terracota',
    'negro-rojo', 'patria', 'arena', 'rosa', 'lavanda', 'menta', 'propia')),
  constraint campana_disenos_fondo check (fondo in ('degradado', 'liso', 'dibujo')),
  constraint campana_disenos_patron check (patron in ('huellitas', 'rayas', 'puntos', 'cuadros', 'corazones', 'estrellas', 'confeti', 'ondas')),
  constraint campana_disenos_intensidad check (intensidad in ('suave', 'medio', 'fuerte')),
  constraint campana_disenos_acomodo check (acomodo in ('polaroids', 'grande', 'mosaico', 'letras')),
  constraint campana_disenos_tamano check (tamano in ('grande', 'enorme')),
  constraint campana_disenos_sello check (sello in ('ninguno', 'descuento', 'dias', 'nuevo')),
  -- Una paleta propia trae sus colores; una curada, ninguno (los suyos están en el código).
  constraint campana_disenos_colores_de_la_paleta check ((paleta = 'propia') = (colores is not null)),
  constraint campana_disenos_colores_validos check (colores is null or retail.fn_colores_de_portada_validos(colores)),
  constraint campana_disenos_corte check (corte is null or corte >= 0),
  constraint campana_disenos_frase check (char_length(frase) <= 60 and frase = btrim(frase)),
  constraint campana_disenos_prendas check (prendas is null or cardinality(prendas) between 1 and 4),
  constraint campana_disenos_version check (version >= 1),
  -- Solo un borrador no se publicó nunca.
  constraint campana_disenos_publicado_con_fecha check ((estado = 'borrador') = (publicado_en is null))
);

comment on table retail.campana_disenos is
  'Tienda web ▸ Campañas (ADR-0436): el diseño de la portada de cada campaña. Por campaña, a lo más un borrador, un publicado y un anterior (índices únicos parciales); lo demás, archivado. Solo se lee y escribe por funciones security definer.';

create unique index if not exists campana_disenos_un_borrador on retail.campana_disenos (etiqueta_id) where estado = 'borrador';
create unique index if not exists campana_disenos_un_publicado on retail.campana_disenos (etiqueta_id) where estado = 'publicado';
create unique index if not exists campana_disenos_un_anterior on retail.campana_disenos (etiqueta_id) where estado = 'anterior';

alter table retail.campana_disenos enable row level security;
revoke all on table retail.campana_disenos from anon, authenticated;

-- 3. El diseño como lo lee el código (los mismos nombres de `DisenoDeCampana`) --------------------------------------------------

create or replace function retail.fn_diseno_json(d retail.campana_disenos)
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'paleta', d.paleta,
    'colores', d.colores,
    'fondo', d.fondo,
    'patron', d.patron,
    'intensidad', d.intensidad,
    'acomodo', d.acomodo,
    'corte', d.corte,
    'tamano', d.tamano,
    'frase', d.frase,
    'prendas', to_jsonb(d.prendas),
    'cuenta', d.cuenta,
    'pctGigante', d.pct_gigante,
    'colibri', d.colibri,
    'sello', d.sello
  );
$$;

revoke all on function retail.fn_diseno_json(retail.campana_disenos) from public, anon, authenticated;

-- La campaña de un diseño: existe, es campaña y no se rechazó. Devuelve su id o lanza el error de la pantalla.
create or replace function retail.fn_campana_para_disenar(p_etiqueta_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estilo = 'campana' and e.estado <> 'rechazado') then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  return p_etiqueta_id;
end;
$$;

revoke all on function retail.fn_campana_para_disenar(uuid) from public, anon, authenticated;

-- 4. Lo que hay: el borrador (si se está probando), el publicado y si hay uno anterior -------------------------------------------

create or replace function retail.campana_diseno(p_etiqueta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_borrador retail.campana_disenos;
  v_publicado retail.campana_disenos;
  v_anterior retail.campana_disenos;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver las campañas necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  perform retail.fn_campana_para_disenar(p_etiqueta_id);
  select * into v_borrador from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'borrador';
  select * into v_publicado from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'publicado';
  select * into v_anterior from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'anterior';
  return jsonb_build_object(
    'borrador', case when v_borrador.id is null then null else jsonb_build_object(
      'diseno', retail.fn_diseno_json(v_borrador), 'version', v_borrador.version, 'actualizado_en', v_borrador.actualizado_en) end,
    'publicado', case when v_publicado.id is null then null else jsonb_build_object(
      'diseno', retail.fn_diseno_json(v_publicado), 'publicado_en', v_publicado.publicado_en,
      'publicado_por', (select btrim(p.nombres || ' ' || coalesce(p.apellidos, '')) from public.personas p where p.id = v_publicado.publicado_por)) end,
    'anterior', case when v_anterior.id is null then null else jsonb_build_object(
      'diseno', retail.fn_diseno_json(v_anterior), 'publicado_en', v_anterior.publicado_en) end
  );
end;
$$;

comment on function retail.campana_diseno(uuid) is
  'Tienda web ▸ Campañas (ADR-0436): {borrador: {diseno, version, actualizado_en} | null, publicado: {diseno, publicado_en, publicado_por} | null, anterior: {diseno, publicado_en} | null}. Pide fn_puede_campanas().';

revoke all on function retail.campana_diseno(uuid) from public, anon;
grant execute on function retail.campana_diseno(uuid) to authenticated, service_role;

-- 5. Guardar el borrador (solo, mientras se prueba) -----------------------------------------------------------------------------

-- `p_version`: la versión del borrador sobre la que se trabajó (0 si no había). Si no coincide, alguien más lo cambió o lo publicó
-- mientras tanto: no se pisa su trabajo, la pantalla lo dice y recarga. Devuelve la versión nueva.
create or replace function retail.guardar_diseno_borrador(p_etiqueta_id uuid, p_diseno jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_actual retail.campana_disenos;
  v_prendas uuid[];
  v_corte smallint;
  v_version integer;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Diseñar una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  perform retail.fn_campana_para_disenar(p_etiqueta_id);
  v_actor := retail.fn_actor_persona_id(true);
  if p_diseno is null or jsonb_typeof(p_diseno) <> 'object' then
    raise exception 'El diseño no es válido. Recarga la pantalla.' using errcode = '22023', hint = 'diseno_invalido';
  end if;

  begin
    v_prendas := case when jsonb_typeof(p_diseno -> 'prendas') = 'array' then array(select jsonb_array_elements_text(p_diseno -> 'prendas')::uuid) end;
    v_corte := (p_diseno ->> 'corte')::smallint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'El diseño no es válido. Recarga la pantalla.' using errcode = '22023', hint = 'diseno_invalido';
  end;
  -- Las prendas de la portada salen de la campaña: un modelo que no está en ella no se guarda.
  if v_prendas is not null and exists (
    select 1 from unnest(v_prendas) x(producto_id)
    where not exists (
      select 1 from retail.variante_etiquetas ve join retail.variantes v on v.id = ve.variante_id
      where ve.etiqueta_id = p_etiqueta_id and v.producto_id = x.producto_id
    )
  ) then
    raise exception 'Una de las prendas elegidas ya no está en la campaña. Elígelas de nuevo.' using errcode = 'P0001', hint = 'prenda_fuera';
  end if;

  select * into v_actual from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'borrador' for update;
  if coalesce(v_actual.version, 0) <> coalesce(p_version, 0) then
    raise exception 'Alguien más cambió o publicó este diseño mientras lo probabas. Recarga para ver el último.' using errcode = 'P0001', hint = 'diseno_cambiado';
  end if;

  begin
    if v_actual.id is null then
      insert into retail.campana_disenos (etiqueta_id, estado, paleta, colores, fondo, patron, intensidad, acomodo, corte, tamano, frase, prendas,
                                          cuenta, pct_gigante, colibri, sello, version, actualizado_por)
      values (p_etiqueta_id, 'borrador', p_diseno ->> 'paleta', nullif(p_diseno -> 'colores', 'null'::jsonb), p_diseno ->> 'fondo',
              p_diseno ->> 'patron', p_diseno ->> 'intensidad', p_diseno ->> 'acomodo', v_corte, p_diseno ->> 'tamano',
              coalesce(p_diseno ->> 'frase', ''), v_prendas, (p_diseno ->> 'cuenta')::boolean, (p_diseno ->> 'pctGigante')::boolean,
              (p_diseno ->> 'colibri')::boolean, p_diseno ->> 'sello', 1, v_actor)
      returning version into v_version;
    else
      update retail.campana_disenos set
        paleta = p_diseno ->> 'paleta',
        colores = nullif(p_diseno -> 'colores', 'null'::jsonb),
        fondo = p_diseno ->> 'fondo',
        patron = p_diseno ->> 'patron',
        intensidad = p_diseno ->> 'intensidad',
        acomodo = p_diseno ->> 'acomodo',
        corte = v_corte,
        tamano = p_diseno ->> 'tamano',
        frase = coalesce(p_diseno ->> 'frase', ''),
        prendas = v_prendas,
        cuenta = (p_diseno ->> 'cuenta')::boolean,
        pct_gigante = (p_diseno ->> 'pctGigante')::boolean,
        colibri = (p_diseno ->> 'colibri')::boolean,
        sello = p_diseno ->> 'sello',
        version = v_actual.version + 1,
        actualizado_en = now(),
        actualizado_por = v_actor
      where id = v_actual.id
      returning version into v_version;
    end if;
  exception
    -- Dos primeros guardados a la vez: el segundo choca con el índice de «un borrador por campaña».
    when unique_violation then
      raise exception 'Alguien más cambió o publicó este diseño mientras lo probabas. Recarga para ver el último.' using errcode = 'P0001', hint = 'diseno_cambiado';
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'El diseño no es válido. Recarga la pantalla.' using errcode = '22023', hint = 'diseno_invalido';
  end;
  return v_version;
end;
$$;

comment on function retail.guardar_diseno_borrador(uuid, jsonb, integer) is
  'Tienda web ▸ Campañas (ADR-0436): guarda el borrador del diseño (se llama sola mientras se prueba). p_version = la versión sobre la que se trabajó (0 si no había); si no coincide, hint diseno_cambiado. Devuelve la versión nueva. Pide fn_puede_campanas(); suelta del combo (campana_diseno_borrador).';

revoke all on function retail.guardar_diseno_borrador(uuid, jsonb, integer) from public, anon;
grant execute on function retail.guardar_diseno_borrador(uuid, jsonb, integer) to authenticated, service_role;

-- 6. Publicar: el borrador pasa a publicado, el publicado a anterior y el anterior a archivado. Todo o nada --------------------------

create or replace function retail.publicar_diseno_campana(p_etiqueta_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_borrador retail.campana_disenos;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Publicar el diseño de una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  perform retail.fn_campana_para_disenar(p_etiqueta_id);
  v_actor := retail.fn_actor_persona_id(true);
  -- Se toman todas las filas vivas de la campaña: dos personas que publican a la vez se turnan.
  perform 1 from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado <> 'archivado' order by id for update;
  select * into v_borrador from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'borrador';
  if v_borrador.id is null or v_borrador.version <> p_version then
    raise exception 'Alguien más cambió o publicó este diseño mientras lo probabas. Recarga para ver el último.' using errcode = 'P0001', hint = 'diseno_cambiado';
  end if;
  update retail.campana_disenos set estado = 'archivado' where etiqueta_id = p_etiqueta_id and estado = 'anterior';
  update retail.campana_disenos set estado = 'anterior' where etiqueta_id = p_etiqueta_id and estado = 'publicado';
  update retail.campana_disenos set estado = 'publicado', publicado_en = now(), publicado_por = v_actor where id = v_borrador.id;
end;
$$;

comment on function retail.publicar_diseno_campana(uuid, integer) is
  'Tienda web ▸ Campañas (ADR-0436): publica el borrador (p_version = la que se vio en la hoja «Publicar»): el publicado pasa a anterior y el anterior a archivado. Pide fn_puede_campanas() y responsable.';

revoke all on function retail.publicar_diseno_campana(uuid, integer) from public, anon;
grant execute on function retail.publicar_diseno_campana(uuid, integer) to authenticated, service_role;

-- 7. Volver al anterior: el publicado y el anterior cambian de lugar. Sin anterior, la portada vuelve a la de siempre (y el que estaba
--    publicado queda como anterior, para volver a él); sin publicado, el anterior vuelve a salir. -----------------------------------

create or replace function retail.volver_al_diseno_anterior(p_etiqueta_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_publicado uuid;
  v_anterior uuid;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Cambiar el diseño de una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  perform retail.fn_campana_para_disenar(p_etiqueta_id);
  v_actor := retail.fn_actor_persona_id(true);
  perform 1 from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado <> 'archivado' order by id for update;
  select id into v_publicado from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'publicado';
  select id into v_anterior from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'anterior';
  if v_publicado is null and v_anterior is null then
    raise exception 'Esta campaña no tiene un diseño publicado al que volver.' using errcode = 'P0001', hint = 'sin_anterior';
  end if;
  -- El publicado se aparta un momento (archivado no tiene índice único) para que el anterior pueda ocupar su lugar.
  if v_publicado is not null then
    update retail.campana_disenos set estado = 'archivado' where id = v_publicado;
  end if;
  if v_anterior is not null then
    update retail.campana_disenos set estado = 'publicado', publicado_en = now(), publicado_por = v_actor where id = v_anterior;
  end if;
  if v_publicado is not null then
    update retail.campana_disenos set estado = 'anterior' where id = v_publicado;
  end if;
end;
$$;

comment on function retail.volver_al_diseno_anterior(uuid) is
  'Tienda web ▸ Campañas (ADR-0436): cambia el diseño publicado por el anterior (sin anterior, la portada vuelve a la de siempre; sin publicado, el anterior vuelve). Pide fn_puede_campanas() y responsable.';

revoke all on function retail.volver_al_diseno_anterior(uuid) from public, anon;
grant execute on function retail.volver_al_diseno_anterior(uuid) to authenticated, service_role;

-- 8. Guardar el borrador, suelto del combo «Responsable» (espejo: apps/web/lib/responsable-omitido.ts) ----------------------------

insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('campana_diseno_borrador', 'Guardar el borrador del diseño de una campaña mientras se prueba (lo hace el ERP solo: publicarlo sí pide quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- 9. La lista, con el diseño publicado y tres prendas con foto (la miniatura es la portada de verdad) ------------------------------

create or replace function retail.campanas_lista()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver las campañas necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'activo', e.activo,
        'estado', e.estado,
        'desde', e.vigente_desde,
        'hasta', e.vigente_hasta,
        'pct', e.descuento_pct,
        'modelos', coalesce(p.modelos, 0),
        'variantes', coalesce(p.variantes, 0),
        'categorias', coalesce(c.categorias, 0),
        'diseno', (select retail.fn_diseno_json(d) from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'publicado'),
        'borrador', exists (select 1 from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'borrador'),
        'piezas', coalesce(f.piezas, '[]'::jsonb)
      ) order by e.vigente_desde nulls last, e.nombre)
    from retail.etiquetas e
    left join lateral (
      select count(distinct v.producto_id)::int as modelos, count(*)::int as variantes
      from retail.variante_etiquetas ve
      join retail.variantes v on v.id = ve.variante_id
      where ve.etiqueta_id = e.id
    ) p on true
    left join lateral (
      select count(*)::int as categorias from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id
    ) c on true
    -- Tres modelos de la campaña, primero los que tienen foto (como elige la tienda sus polaroids).
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'foto', x.foto) order by x.foto is null, x.nombre) as piezas
      from (
        select y.*
        from (
          select pr.id, pr.referencia as nombre,
                 (select fo.url from retail.producto_fotos fo where fo.producto_id = pr.id order by fo.es_principal desc, fo.orden, fo.created_at limit 1) as foto
          from retail.productos pr
          where pr.id in (select v.producto_id from retail.variante_etiquetas ve join retail.variantes v on v.id = ve.variante_id where ve.etiqueta_id = e.id)
        ) y
        order by y.foto is null, y.nombre
        limit 3
      ) x
    ) f on true
    where e.estilo = 'campana' and e.estado <> 'rechazado'
  ), '[]'::jsonb);
end;
$$;

comment on function retail.campanas_lista() is
  'Tienda web ▸ Campañas (ADR-0436): [{id, nombre, activo, estado, desde, hasta, pct, modelos, variantes, categorias, diseno (el publicado | null), borrador (bool), piezas: [{id, nombre, foto}] (3, con foto primero)}]. Pide fn_puede_campanas().';

revoke all on function retail.campanas_lista() from public, anon;
grant execute on function retail.campanas_lista() to authenticated, service_role;

-- 10. Comprobación -------------------------------------------------------------------------------------------------------------

do $$
begin
  if to_regclass('retail.campana_disenos') is null then
    raise exception 'campanas_diseno: falta la tabla campana_disenos';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'retail' and tablename = 'campana_disenos'
        and indexname in ('campana_disenos_un_borrador', 'campana_disenos_un_publicado', 'campana_disenos_un_anterior')) <> 3 then
    raise exception 'campanas_diseno: faltan los índices de uno por estado';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'retail.campana_disenos'::regclass) then
    raise exception 'campanas_diseno: la tabla tiene que tener RLS encendido';
  end if;
  if not exists (select 1 from retail.acciones_sin_responsable where clave = 'campana_diseno_borrador') then
    raise exception 'campanas_diseno: falta la clave campana_diseno_borrador en acciones_sin_responsable';
  end if;
  if to_regprocedure('retail.publicar_diseno_campana(uuid, integer)') is null or to_regprocedure('retail.volver_al_diseno_anterior(uuid)') is null
     or to_regprocedure('retail.guardar_diseno_borrador(uuid, jsonb, integer)') is null or to_regprocedure('retail.campana_diseno(uuid)') is null then
    raise exception 'campanas_diseno: faltan funciones';
  end if;
end $$;

reset lock_timeout;
