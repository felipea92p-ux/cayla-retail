-- ============================================================================
-- «Pregúntale a CAYLA»: la pantalla «Preguntas del equipo» (ADR-0536, actividad 9; Felipe 2026-10-27)
--
-- QUÉ. Felipe pidió el asistente para algo más que responder: que las preguntas digan qué falta construir (las que no tienen
-- respuesta), qué está escondido (las que se repiten) y qué accesos pide la gente. Esta migración da de alta la pantalla que las
-- muestra, en Gestión, y la función que la alimenta. Las cifras salen de SQL, sobre TODAS las preguntas del período; la lista trae
-- las 300 más recientes.
--
-- EL MÓDULO. Una entrada nueva del menú es un módulo (ADR-0306), y nace SOLO para el líder: sin `insert into rol_modulos`
-- (ADR-0161); el líder decide después a qué rol se lo da. Es «solo personas», como Rendimiento y Actividad: la pantalla dice QUIÉN
-- preguntó qué (Felipe 2026-10-27: «con el nombre»), y una terminal compartida de mostrador no revisa lo que preguntan las demás.
--
-- QUÉ SEDE VE CADA CUENTA. La que mira: el líder (o el Admin) cualquier sede con el selector, y todas juntas en CAYLA Global (con
-- el módulo «cayla_global»); quien tiene el módulo sin ser líder, solo la suya.
--
-- CÓMO SE PEGA. Una sola parte: el módulo, la lista «solo personas» de `fn_exigir_rol_de_terminal` (reemplazo anclado sobre la
-- definición viva) y la función de lectura. No crea políticas ni hace `alter` de una tabla que la tienda usa (ADR-0195).
-- Re-ejecutable. Necesita `20261027181000_asistente_preguntas.sql` antes.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.asistente_preguntas') is null then
    raise exception 'Falta retail.asistente_preguntas: pega antes 20261027181000_asistente_preguntas.sql.';
  end if;
end $$;

-- ---------- 1. El módulo: nace solo para el líder (sin rol) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('preguntas_equipo', 'Gestión', 'Preguntas del equipo',
   'Ver lo que el equipo le pregunta a «Pregúntale a CAYLA»: quién preguntó qué, en qué sede y pantalla, qué se resolvió, qué no se encontró, qué accesos piden y si les sirvió',
   320, false, true)
on conflict (clave) do nothing;

-- ---------- 2. Solo personas: una terminal nunca lo tiene ----------
-- Reemplazo anclado: se suma «preguntas_equipo» a la lista de la definición viva. Si la lista no es la esperada, se detiene antes de
-- tocar nada (alguien la cambió de otra forma) en vez de pisarla.
do $$
declare
  v_def text := pg_get_functiondef('retail.fn_exigir_rol_de_terminal(uuid, text)'::regprocedure);
  v_antes text := 'array[''colaboradores'', ''roles'', ''actividad'', ''cayla_global'', ''rendimiento'']';
  v_despues text := 'array[''colaboradores'', ''roles'', ''actividad'', ''cayla_global'', ''rendimiento'', ''preguntas_equipo'']';
begin
  if position(v_despues in v_def) > 0 then
    null; -- ya está: se pega igual (idempotente)
  elsif position(v_antes in v_def) > 0 then
    execute replace(v_def, v_antes, v_despues);
  else
    raise exception 'retail.fn_exigir_rol_de_terminal no tiene la lista esperada: alguien la cambió en vivo de otra forma. Reescribe esta sección desde su definición real antes de pegar.';
  end if;
end $$;

comment on function retail.fn_exigir_rol_de_terminal(uuid, text) is
  'ADR-0161 P6: una terminal nunca puede tener un módulo «solo personas» (colaboradores, roles, actividad, cayla_global, rendimiento, preguntas_equipo). Sin p_modulo: valida el rol completo al dárselo a una terminal. Con p_modulo: valida que ningún rol de terminal tenga ese módulo antes de encenderlo. Actualizada 20261027182000: suma «preguntas_equipo» (ADR-0536).';

-- ---------- 3. Lo que muestra la pantalla ----------
-- `p_ubicacion_id` null = todas las sedes (CAYLA Global). Devuelve:
--   cifras:    total, personas, sirvio_si, sirvio_no, gasto_usd
--   clases:    [{ tipo, tema, n, no }]  — cuántas de cada respuesta (la web las junta en «resueltas», «sin respuesta»…)
--   pantallas: [{ guia_id, n, no }]     — las 8 pantallas que más responden (o que más se piden sin acceso)
--   accesos:   [{ modulo, n }]          — los módulos que más se piden
--   preguntas: las 300 más recientes, con quién, la sede, la pantalla, lo que se respondió y si le sirvió
create or replace function retail.fn_asistente_preguntas_equipo(p_desde timestamptz, p_hasta timestamptz, p_ubicacion_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_resultado jsonb;
begin
  if not retail.fn_ve_modulo('preguntas_equipo') then
    raise exception 'Ver las preguntas del equipo necesita el módulo «Preguntas del equipo» en tu rol.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta - p_desde > interval '93 days' then
    raise exception 'El período va de 1 día a 3 meses.' using errcode = '22023';
  end if;
  if p_ubicacion_id is null then
    if not retail.fn_ve_modulo('cayla_global') then
      raise exception 'Ver todas las sedes juntas necesita CAYLA Global.' using errcode = '42501';
    end if;
  elsif not (retail.fn_es_lider() or retail.fn_es_admin() or p_ubicacion_id = retail.fn_ubicacion_actual_persona()) then
    raise exception 'Solo ves las preguntas de tu sede.' using errcode = '42501';
  end if;

  with p as (
    select q.*
      from retail.asistente_preguntas q
     where q.creada_en >= p_desde and q.creada_en < p_hasta
       and (p_ubicacion_id is null or q.ubicacion_id = p_ubicacion_id)
  )
  select jsonb_build_object(
    'cifras', (select jsonb_build_object(
                 'total', count(*),
                 'personas', count(distinct coalesce(p.persona_id::text, p.cuenta_id::text)),
                 'sirvio_si', count(*) filter (where p.sirvio),
                 'sirvio_no', count(*) filter (where p.sirvio is false),
                 'gasto_usd', coalesce(sum(p.costo_usd), 0))
                 from p),
    'clases', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'tema', c.tema, 'n', c.n, 'no', c.no) order by c.n desc)
                          from (select p.tipo, p.tema, count(*) as n, count(*) filter (where p.sirvio is false) as no
                                  from p group by p.tipo, p.tema) c), '[]'::jsonb),
    'pantallas', coalesce((select jsonb_agg(jsonb_build_object('guia_id', g.guia_id, 'n', g.n, 'no', g.no) order by g.n desc, g.guia_id)
                             from (select p.guia_id, count(*) as n, count(*) filter (where p.sirvio is false) as no
                                     from p where p.guia_id is not null group by p.guia_id order by count(*) desc, p.guia_id limit 8) g), '[]'::jsonb),
    'accesos', coalesce((select jsonb_agg(jsonb_build_object('modulo', a.modulo, 'n', a.n) order by a.n desc, a.modulo)
                           from (select p.modulo, count(*) as n
                                   from p where p.tipo = 'sin_acceso' and p.modulo is not null group by p.modulo order by count(*) desc, p.modulo limit 8) a), '[]'::jsonb),
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', r.id,
                             'creada_en', r.creada_en,
                             'persona', r.persona,
                             'persona_id', r.persona_id,
                             'sede', r.sede,
                             'ruta', r.ruta,
                             'pregunta', r.pregunta,
                             'tipo', r.tipo,
                             'tema', r.tema,
                             'motivo', r.motivo,
                             'guia_id', r.guia_id,
                             'modulo', r.modulo,
                             'referencia', r.referencia,
                             'sirvio', r.sirvio,
                             'comentario', r.comentario) order by r.creada_en desc)
                             from (select p.*, nullif(trim(concat_ws(' ', pe.nombres, pe.apellidos)), '') as persona, u.nombre as sede
                                     from p
                                     left join public.personas pe on pe.id = p.persona_id
                                     left join retail.ubicaciones u on u.id = p.ubicacion_id
                                    order by p.creada_en desc
                                    limit 300) r), '[]'::jsonb)
  )
  into v_resultado;
  return v_resultado;
end;
$$;

comment on function retail.fn_asistente_preguntas_equipo(timestamptz, timestamptz, uuid) is
  'ADR-0536 act. 9: lo que el equipo le pregunta a «Pregúntale a CAYLA» en un período (máx. 3 meses) y una sede (null = todas, con CAYLA Global): cifras, clases de respuesta, pantallas, accesos pedidos y las 300 preguntas más recientes con quién preguntó. Exige el módulo preguntas_equipo; sin ser líder, solo la propia sede.';
revoke all on function retail.fn_asistente_preguntas_equipo(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function retail.fn_asistente_preguntas_equipo(timestamptz, timestamptz, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
