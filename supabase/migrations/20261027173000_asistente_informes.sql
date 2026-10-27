-- ============================================================================
-- «Pregúntale a CAYLA»: el informe del lunes (ADR-0529, actividad 10; Felipe 2026-10-26, decisión 7)
--
-- QUÉ. Cada lunes, las preguntas de la semana anterior se vuelven 5 mejoras con su evidencia: qué tipo de mejora es (función nueva ·
-- mover a la vista · escribir una regla · dar un acceso · capacitar a alguien), qué hacer, y LAS PREGUNTAS QUE LA SOSTIENEN. Las cifras
-- salen de SQL; la IA (Claude Sonnet 5.5, en el servidor) solo agrupa preguntas parecidas y redacta.
--
-- LA EVIDENCIA NO SE INVENTA. Una mejora cita los ids de sus preguntas, y `guardar_informe_asistente` rechaza el informe entero si una
-- cita no es una pregunta de ESA semana: el servidor ya descarta lo que la IA inventa (`revisarInforme`), y la base lo vuelve a mirar.
-- Cuántas preguntas sostienen una mejora y de qué sedes se calcula al leer, de las preguntas citadas, nunca de lo que diga la IA.
--
-- QUIÉN. Lo arma el trabajo programado de Vercel (los lunes 7:00 de Lima, con la llave de servicio) o, si ese lunes no salió, el líder
-- con el botón de la pantalla (solo si la semana todavía no tiene informe: no se paga dos veces). Lo ve quien tiene «Preguntas del
-- equipo» y mira todas las sedes (el líder o el Admin): el informe junta las preguntas de toda CAYLA.
--
-- EL TOPE. Lo que cuesta cada informe entra al tope de US$30 del mes (`fn_asistente_gasto_del_mes`, que aquí se rehace sumándolo).
--
-- CÓMO SE PEGA. Una sola parte: tabla nueva (RLS encendido SIN políticas) y funciones; no hace `alter` de una tabla en uso ni crea
-- políticas (ADR-0195). Re-ejecutable. Va después de `20261026235000` y `20261027165000`. Nada se borra nunca: un informe no se rehace.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.asistente_preguntas') is null then
    raise exception 'Falta retail.asistente_preguntas: pega antes 20261026235000_asistente_preguntas.sql.';
  end if;
  if not exists (select 1 from retail.modulos where clave = 'preguntas_equipo') then
    raise exception 'Falta el módulo preguntas_equipo: pega antes 20261027165000_asistente_preguntas_equipo.sql.';
  end if;
end $$;

create table if not exists retail.asistente_informes (
  id uuid primary key default gen_random_uuid(),
  -- El lunes con que empieza la semana informada (Lima). Uno por semana.
  semana date not null unique check (extract(isodow from semana) = 1),
  desde timestamptz not null,
  hasta timestamptz not null check (hasta > desde),
  -- Las cifras de la semana, como las contó SQL al armarlo.
  cifras jsonb not null default '{}'::jsonb check (jsonb_typeof(cifras) = 'object'),
  -- Hasta 5: `[{ tipo, titulo, detalle, preguntas: [uuid] }]`.
  mejoras jsonb not null default '[]'::jsonb check (jsonb_typeof(mejoras) = 'array' and jsonb_array_length(mejoras) <= 5),
  modelo text check (char_length(modelo) <= 60),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  -- Techo por informe (cuesta ~US$0,05): quien llamara a la función a mano no infla el tope del mes.
  costo_usd numeric(10, 6) not null default 0 check (costo_usd >= 0 and costo_usd <= 1),
  creado_en timestamptz not null default now(),
  -- Quien lo pidió con el botón; vacío si lo armó el trabajo del lunes.
  pedido_por uuid references public.personas (id)
);
comment on table retail.asistente_informes is
  'ADR-0529 act. 10: el informe semanal de «Pregúntale a CAYLA» (5 mejoras con las preguntas que las sostienen). Uno por semana, sin DELETE. Solo lo tocan sus funciones.';

alter table retail.asistente_informes enable row level security;
revoke all on table retail.asistente_informes from anon, authenticated;

-- ¿Puede armar o leer el informe? El trabajo del lunes (llave de servicio) o quien ve «Preguntas del equipo» y todas las sedes.
create or replace function retail.fn_asistente_ve_informe()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (retail.fn_ve_modulo('preguntas_equipo') and (retail.fn_es_lider() or retail.fn_es_admin()));
$$;
revoke all on function retail.fn_asistente_ve_informe() from public, anon;
grant execute on function retail.fn_asistente_ve_informe() to authenticated, service_role;

-- Lo que lee el servidor para armar el informe: las cifras de la semana y sus preguntas (las 400 más recientes). Sin nombres de personas:
-- a la IA no le hace falta saber quién preguntó.
create or replace function retail.fn_asistente_datos_informe(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v jsonb;
begin
  if not retail.fn_asistente_ve_informe() then
    raise exception 'El informe de las preguntas es del líder con «Preguntas del equipo».' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta - p_desde > interval '8 days' then
    raise exception 'El informe es de una semana.' using errcode = '22023';
  end if;
  with p as (
    select q.* from retail.asistente_preguntas q where q.creada_en >= p_desde and q.creada_en < p_hasta
  )
  select jsonb_build_object(
    'cifras', (select jsonb_build_object(
                 'total', count(*),
                 'personas', count(distinct coalesce(p.persona_id::text, p.cuenta_id::text)),
                 'resueltas', count(*) filter (where p.tipo in ('guia', 'regla', 'error')),
                 'sin_respuesta', count(*) filter (where p.tipo = 'no_existe'),
                 'sin_acceso', count(*) filter (where p.tipo = 'sin_acceso'),
                 'sin_ia', count(*) filter (where p.tipo = 'basico'),
                 'sirvio_no', count(*) filter (where p.sirvio is false))
                 from p),
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', r.id, 'sede', r.sede, 'pregunta', r.pregunta, 'tipo', r.tipo, 'tema', r.tema, 'guia_id', r.guia_id,
                             'modulo', r.modulo, 'sirvio', r.sirvio, 'comentario', r.comentario) order by r.creada_en desc)
                             from (select p.*, u.nombre as sede from p left join retail.ubicaciones u on u.id = p.ubicacion_id
                                    order by p.creada_en desc limit 400) r), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function retail.fn_asistente_datos_informe(timestamptz, timestamptz) from public, anon;
grant execute on function retail.fn_asistente_datos_informe(timestamptz, timestamptz) to authenticated, service_role;

-- Guarda el informe de una semana y devuelve su id. Si la semana ya tiene uno, no hace nada y devuelve ese (el trabajo del lunes y el
-- botón pueden cruzarse: gana el primero, y nadie paga dos veces). Rechaza una mejora que cite una pregunta que no es de esa semana.
create or replace function retail.guardar_informe_asistente(
  p_semana date,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_cifras jsonb,
  p_mejoras jsonb,
  p_modelo text default null,
  p_tokens_entrada integer default 0,
  p_tokens_salida integer default 0,
  p_costo_usd numeric default 0
)
returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_persona uuid;
  v_mejora jsonb;
  v_cita text;
begin
  if not retail.fn_asistente_ve_informe() then
    raise exception 'El informe de las preguntas es del líder con «Preguntas del equipo».' using errcode = '42501';
  end if;
  if p_semana is null or p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta - p_desde > interval '8 days' then
    raise exception 'El informe es de una semana.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_mejoras, 'null'::jsonb)) <> 'array' then
    raise exception 'Las mejoras van en una lista.' using errcode = '22023';
  end if;

  for v_mejora in select e from jsonb_array_elements(p_mejoras) e loop
    if v_mejora ->> 'tipo' is null or v_mejora ->> 'tipo' not in ('funcion_nueva', 'mover_a_la_vista', 'escribir_regla', 'dar_acceso', 'capacitar') then
      raise exception 'Una mejora no dice de qué tipo es.' using errcode = '22023';
    end if;
    if char_length(coalesce(v_mejora ->> 'titulo', '')) not between 3 and 120 or char_length(coalesce(v_mejora ->> 'detalle', '')) > 400 then
      raise exception 'Una mejora tiene el título o el detalle fuera de medida.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_mejora -> 'preguntas') <> 'array' or jsonb_array_length(v_mejora -> 'preguntas') = 0 then
      raise exception 'Una mejora sin preguntas que la sostengan no se guarda.' using errcode = '22023';
    end if;
    for v_cita in select jsonb_array_elements_text(v_mejora -> 'preguntas') loop
      if v_cita !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from retail.asistente_preguntas q where q.id = v_cita::uuid and q.creada_en >= p_desde and q.creada_en < p_hasta) then
        raise exception 'Una mejora cita una pregunta que no es de esa semana.' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if coalesce(auth.role(), '') <> 'service_role' then
    begin
      v_persona := retail.fn_actor_persona_id(true);
    exception when others then
      v_persona := null;
    end;
  end if;

  insert into retail.asistente_informes (semana, desde, hasta, cifras, mejoras, modelo, tokens_entrada, tokens_salida, costo_usd, pedido_por)
  values (p_semana, p_desde, p_hasta, coalesce(p_cifras, '{}'::jsonb), p_mejoras, p_modelo, coalesce(p_tokens_entrada, 0),
          coalesce(p_tokens_salida, 0), coalesce(p_costo_usd, 0), v_persona)
  on conflict (semana) do nothing
  returning id into v_id;

  if v_id is null then
    v_id := (select i.id from retail.asistente_informes i where i.semana = p_semana);
  end if;
  return v_id;
end;
$$;
revoke all on function retail.guardar_informe_asistente(date, timestamptz, timestamptz, jsonb, jsonb, text, integer, integer, numeric) from public, anon;
grant execute on function retail.guardar_informe_asistente(date, timestamptz, timestamptz, jsonb, jsonb, text, integer, integer, numeric) to authenticated, service_role;

-- Los últimos informes, el más nuevo primero, con cada mejora ya armada: sus preguntas (texto, sede, quién, si le sirvió), cuántas son y
-- de qué sedes. La pantalla muestra el último.
create or replace function retail.fn_asistente_informes(p_limite integer default 4)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_asistente_ve_informe() then
    raise exception 'El informe de las preguntas es del líder con «Preguntas del equipo».' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'semana', i.semana, 'desde', i.desde, 'hasta', i.hasta, 'cifras', i.cifras, 'modelo', i.modelo,
             'costo_usd', i.costo_usd, 'creado_en', i.creado_en, 'automatico', i.pedido_por is null,
             'mejoras', coalesce((
               select jsonb_agg(m.mejora || jsonb_build_object(
                        'preguntas', coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'id', q.id, 'pregunta', q.pregunta, 'sede', u.nombre,
                                   'persona', nullif(trim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
                                   'sirvio', q.sirvio, 'comentario', q.comentario) order by q.creada_en desc)
                            from jsonb_array_elements_text(m.mejora -> 'preguntas') c(id)
                            join retail.asistente_preguntas q on q.id = c.id::uuid
                            left join retail.ubicaciones u on u.id = q.ubicacion_id
                            left join public.personas pe on pe.id = q.persona_id), '[]'::jsonb),
                        'sedes', coalesce((
                          select jsonb_agg(distinct u.nombre)
                            from jsonb_array_elements_text(m.mejora -> 'preguntas') c(id)
                            join retail.asistente_preguntas q on q.id = c.id::uuid
                            join retail.ubicaciones u on u.id = q.ubicacion_id), '[]'::jsonb)) order by m.orden)
                 from jsonb_array_elements(i.mejoras) with ordinality m(mejora, orden)), '[]'::jsonb)
           ) order by i.semana desc)
      from (select * from retail.asistente_informes order by semana desc limit greatest(1, least(coalesce(p_limite, 4), 12))) i
  ), '[]'::jsonb);
end;
$$;
revoke all on function retail.fn_asistente_informes(integer) from public, anon;
grant execute on function retail.fn_asistente_informes(integer) to authenticated, service_role;

-- El tope del mes ahora suma también lo que costaron los informes (rehace la de 20261026235000; misma firma y mismo permiso).
create or replace function retail.fn_asistente_gasto_del_mes()
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde timestamptz := date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
  if coalesce(auth.role(), '') <> 'service_role' and (auth.uid() is null or not retail.fn_tiene_acceso_retail()) then
    raise exception 'Sin acceso a retail' using errcode = '42501';
  end if;
  return coalesce((select sum(costo_usd) from retail.asistente_preguntas where creada_en >= v_desde), 0)
       + coalesce((select sum(costo_usd) from retail.asistente_informes where creado_en >= v_desde), 0);
end;
$$;

comment on function retail.fn_asistente_gasto_del_mes() is
  'ADR-0529: lo que costaron en el mes de Lima las preguntas a «Pregúntale a CAYLA» y sus informes semanales (US$), para el tope mensual.';
revoke all on function retail.fn_asistente_gasto_del_mes() from public, anon;
grant execute on function retail.fn_asistente_gasto_del_mes() to authenticated, service_role;

notify pgrst, 'reload schema';
