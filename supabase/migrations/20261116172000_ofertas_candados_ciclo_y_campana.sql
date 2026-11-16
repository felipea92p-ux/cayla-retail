-- ============================================================================
-- 20261116172000 — Campañas y ofertas: tres candados que faltaban (ADR-0655, casuística del 2026-11-16)
--
-- EL PROBLEMA. La revisión de casos del 2026-11-16 (docs/backlog/2026-11-16-ofertas-promociones-casos.md) encontró tres estados que la base
--   dejaba pasar sin decir nada:
--   1. CESIONES EN CICLO. «Que la otra ceda» se resuelve de a pares, y `ceder_ofertas` / `elegir_oferta_que_queda` solo frenaban el ciclo de
--      dos (A cede a B y B a A). Con tres ofertas sobre la misma prenda —A cede a B, B a C, C a A, cada par elegido por separado en el aviso
--      «elige cuál queda»— el candado de choques las daba por resueltas y la caja no cobraba NINGUNA: `fn_campanas_en_sede` y
--      `fn_ofertas_de_grupo` callan a la que cede si la que gana rige ahí, y en un ciclo todas ceden a una que rige.
--   2. LA CAMPAÑA QUE SE ACHICA. Una oferta no puede durar más que su campaña ni regir en una tienda donde su campaña no rige
--      (`guardar_campana_regla` lo exige al guardarla), pero acortar las fechas de la campaña o quitarle una tienda después no miraba a sus
--      ofertas: la oferta seguía diciendo «hasta el 6 dic» o «en Trujillo» y dejaba de cobrar antes, sin aviso.
--   3. DOS ACTIVACIONES A LA VEZ. El candado de choques es diferido: corre al confirmar cada transacción. Si dos personas activan a la vez dos
--      ofertas que chocan, cada revisión puede correr antes de que la otra confirme y las dos pasan.
--
-- LO QUE HACE.
--   1. `fn_cesion_hace_ciclo(cede, gana)`: ¿la que gana ya le cede, directa o indirectamente, a la que cede? Un disparador en
--      `campana_regla_cesiones` (`campana_regla_cesiones_sin_ciclo`) la pregunta en cada cesión nueva, por cualquier camino. El ciclo de dos que
--      ya frenaban las funciones es el caso más corto.
--   2. `fn_exigir_ofertas_dentro_de_campana(campaña)`: toda oferta que todavía no terminó (`hasta >= hoy`) y no está desactivada tiene que caber
--      en las fechas y en las tiendas de su campaña. La preguntan dos disparadores diferidos: al cambiar las fechas de una campaña
--      (`etiquetas_ofertas_dentro_de_campana`) y al quitarle o sumarle tiendas (`campana_sedes_ofertas_dentro_de_campana`). Las ofertas que ya
--      terminaron no cuentan: «Repetir en 2027» mueve las fechas de la misma campaña y sus ofertas del año pasado son historia.
--      DECIDÍ rechazar el cambio de la campaña (con el nombre de la oferta y qué acortar) en vez de recortar las ofertas solas: la base no
--      cambia en silencio lo que alguien configuró. DESCARTÉ recortarlas: una oferta podría quedar sin días y desactivarse sin que nadie lo vea.
--   3. `fn_exigir_sin_choques` toma un candado de transacción (`pg_advisory_xact_lock`) antes de revisar: dos revisiones de choques nunca corren a
--      la vez, y la segunda ve lo que la primera confirmó. Las ofertas se configuran pocas veces al día: la espera no se nota.
--
-- QUÉ NO HACE. No cambia cómo se cobra nada: en producción no hay ninguna oferta todavía (consultado el 2026-11-16), así que ningún dato
--   existente queda bloqueado.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: funciones y disparadores nuevos (`create constraint trigger` / `create trigger`
--   solo si no existen; ni `drop trigger` ni políticas, ADR-0195). Va DESPUÉS de 20261114170000 (el aviso de dos ofertas).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-candados` (scripts/pruebas/ofertas_candados.mjs).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 1. Cesiones sin ciclo
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_cesion_hace_ciclo(p_cede uuid, p_gana uuid)
returns boolean
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  -- Desde la que gana, siguiendo «a quién le cede», ¿se llega a la que cede? Entonces la cesión nueva cerraría un ciclo.
  with recursive camino(id) as (
    select c.gana_regla_id from retail.campana_regla_cesiones c where c.cede_regla_id = p_gana
    union
    select c.gana_regla_id from retail.campana_regla_cesiones c join camino on c.cede_regla_id = camino.id
  )
  select p_cede = p_gana or exists (select 1 from camino where camino.id = p_cede)
$function$;

comment on function retail.fn_cesion_hace_ciclo(uuid, uuid) is
  'ADR-0655 (casuística 2026-11-16). ¿La oferta que gana ya le cede, directa o indirectamente, a la que cede? Una cesión así cerraría un ciclo y la caja no cobraría ninguna de las ofertas del ciclo.';

revoke all on function retail.fn_cesion_hace_ciclo(uuid, uuid) from public, anon, authenticated;

create or replace function retail.fn_cesion_sin_ciclo()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_cede text;
  v_gana text;
begin
  if retail.fn_cesion_hace_ciclo(new.cede_regla_id, new.gana_regla_id) then
    v_cede := (select r.nombre from retail.campana_reglas r where r.id = new.cede_regla_id);
    v_gana := (select r.nombre from retail.campana_reglas r where r.id = new.gana_regla_id);
    raise exception 'Si «%» le cede a «%», las ofertas quedarían cediéndose en círculo y la caja no cobraría ninguna. Elige en otro orden.',
      v_cede, v_gana
      using errcode = 'P0001', hint = 'oferta_ciclo';
  end if;
  return null;
end;
$function$;

comment on function retail.fn_cesion_sin_ciclo() is
  'ADR-0655 (casuística 2026-11-16). La llama el disparador campana_regla_cesiones_sin_ciclo: ninguna cesión cierra un ciclo, por ningún camino.';

revoke all on function retail.fn_cesion_sin_ciclo() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.campana_regla_cesiones'::regclass and tgname = 'campana_regla_cesiones_sin_ciclo') then
    create trigger campana_regla_cesiones_sin_ciclo
      after insert on retail.campana_regla_cesiones
      for each row
      execute function retail.fn_cesion_sin_ciclo();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 2. Las ofertas caben en su campaña (fechas y tiendas), también cuando la campaña cambia
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_exigir_ofertas_dentro_de_campana(p_etiqueta_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_e record;
  v_r record;
  v_hoy date := retail.fn_hoy_lima();
  v_tienda text;
begin
  select e.id, e.nombre, e.estilo, e.vigente_desde, e.vigente_hasta into v_e from retail.etiquetas e where e.id = p_etiqueta_id;
  if not found or v_e.estilo <> 'campana' then
    return;
  end if;
  -- Solo lo que todavía puede regir: no desactivada y sin terminar. Lo que ya pasó es historia (así «Repetir en 2027» mueve las fechas).
  for v_r in
    select r.id, r.nombre, r.desde, r.hasta from retail.campana_reglas r
    where r.etiqueta_id = p_etiqueta_id and r.estado <> 'desactivada' and r.hasta >= v_hoy
    order by r.creada_en, r.id
  loop
    if v_e.vigente_hasta is not null and v_r.hasta > v_e.vigente_hasta then
      raise exception 'La campaña «%» terminaría el %, pero su oferta «%» sigue hasta el %. Acorta primero la oferta, o deja la campaña hasta el %.',
        v_e.nombre, to_char(v_e.vigente_hasta, 'DD/MM/YYYY'), v_r.nombre, to_char(v_r.hasta, 'DD/MM/YYYY'), to_char(v_r.hasta, 'DD/MM/YYYY')
        using errcode = 'P0001', hint = 'oferta_fuera_de_campana';
    end if;
    if v_e.vigente_desde is not null and greatest(v_r.desde, v_hoy) < v_e.vigente_desde then
      raise exception 'La campaña «%» empezaría el %, pero su oferta «%» empieza el %. Mueve primero la oferta, o deja que la campaña empiece antes.',
        v_e.nombre, to_char(v_e.vigente_desde, 'DD/MM/YYYY'), v_r.nombre, to_char(greatest(v_r.desde, v_hoy), 'DD/MM/YYYY')
        using errcode = 'P0001', hint = 'oferta_fuera_de_campana';
    end if;
    -- Una oferta con tiendas propias solo en las tiendas de su campaña (si la campaña elige tiendas; sin tiendas, rige en todas).
    v_tienda := (
      select u.nombre from retail.campana_regla_sedes rs join retail.ubicaciones u on u.id = rs.ubicacion_id
      where rs.regla_id = v_r.id
        and exists (select 1 from retail.campana_sedes cs where cs.etiqueta_id = p_etiqueta_id)
        and not exists (select 1 from retail.campana_sedes cs where cs.etiqueta_id = p_etiqueta_id and cs.ubicacion_id = rs.ubicacion_id)
      order by u.nombre limit 1
    );
    if v_tienda is not null then
      raise exception 'La campaña «%» ya no regiría en %, pero su oferta «%» sí. Quita primero % de la oferta, o deja la campaña en esa tienda.',
        v_e.nombre, v_tienda, v_r.nombre, v_tienda
        using errcode = 'P0001', hint = 'oferta_fuera_de_campana';
    end if;
  end loop;
end;
$function$;

comment on function retail.fn_exigir_ofertas_dentro_de_campana(uuid) is
  'ADR-0655 (casuística 2026-11-16). Toda oferta de la campaña que todavía puede regir (no desactivada, sin terminar) cabe en sus fechas y en sus tiendas. La llaman los disparadores al cambiar las fechas o las tiendas de una campaña.';

revoke all on function retail.fn_exigir_ofertas_dentro_de_campana(uuid) from public, anon, authenticated;

create or replace function retail.fn_campana_cambio_fechas_ofertas()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
begin
  perform retail.fn_exigir_ofertas_dentro_de_campana(new.id);
  return null;
end;
$function$;

create or replace function retail.fn_campana_cambio_sedes_ofertas()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
begin
  perform retail.fn_exigir_ofertas_dentro_de_campana(case when tg_op = 'DELETE' then old.etiqueta_id else new.etiqueta_id end);
  return null;
end;
$function$;

revoke all on function retail.fn_campana_cambio_fechas_ofertas() from public, anon, authenticated;
revoke all on function retail.fn_campana_cambio_sedes_ofertas() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.etiquetas'::regclass and tgname = 'etiquetas_ofertas_dentro_de_campana') then
    create constraint trigger etiquetas_ofertas_dentro_de_campana
      after update of vigente_desde, vigente_hasta on retail.etiquetas
      deferrable initially deferred
      for each row
      when (new.estilo = 'campana'
            and (old.vigente_desde is distinct from new.vigente_desde or old.vigente_hasta is distinct from new.vigente_hasta))
      execute function retail.fn_campana_cambio_fechas_ofertas();
  end if;
  -- Diferido: «guardar las tiendas» borra y vuelve a insertar el conjunto; se mira cómo quedó al confirmar.
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.campana_sedes'::regclass and tgname = 'campana_sedes_ofertas_dentro_de_campana') then
    create constraint trigger campana_sedes_ofertas_dentro_de_campana
      after insert or delete on retail.campana_sedes
      deferrable initially deferred
      for each row
      execute function retail.fn_campana_cambio_sedes_ofertas();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 3. Una revisión de choques a la vez
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- El mismo cuerpo de 20261114060000 (con las insignias), con el candado de transacción al empezar.

create or replace function retail.fn_exigir_sin_choques(p_regla_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'retail', 'public'
as $function$
declare
  v_r record;
  v_c record;
begin
  select * into v_r from retail.campana_reglas where id = p_regla_id;
  if not found or v_r.estado <> 'activa' then
    return;
  end if;
  -- Casuística 2026-11-16: dos activaciones a la vez se revisan de a una (la segunda espera y ve lo que la primera confirmó).
  perform pg_advisory_xact_lock(hashtext('retail.campana_reglas_choques'));
  for v_c in
    select * from retail.fn_choques_de_oferta_con_forma_sin_llave(
      v_r.id, v_r.etiqueta_id, v_r.desde, v_r.hasta, v_r.dias_semana,
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_r.id and rc.modo = 'solo'), '{}'::uuid[]),
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_r.id and rc.modo = 'fuera'), '{}'::uuid[]),
      coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = v_r.id), '{}'::uuid[]),
      coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = v_r.id), '{}'::uuid[]),
      v_r.incluye_claure,
      coalesce((select array_agg(rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = v_r.id), '{}'::uuid[]),
      v_r.tipo, v_r.cuenta, v_r.cede_a_otras)
    where not cedida
    limit 1
  loop
    raise exception 'La oferta «%» choca con «%»% en %: % % tendría% dos ofertas el mismo día. Una prenda tiene una sola oferta por tienda y por día: %.',
      v_r.nombre, v_c.otra_nombre, case when v_c.otra_tipo = 'oferta' and v_c.campana_nombre <> v_c.otra_nombre then ' (de ' || v_c.campana_nombre || ')' else '' end,
      v_c.ubicacion_nombre, v_c.prendas, case when v_c.prendas = 1 then 'prenda' else 'prendas' end, case when v_c.prendas = 1 then '' else 'n' end,
      case when v_r.tipo = 'monto' and v_c.otra_tipo = 'oferta' then 'que esas prendas no cuenten para el monto, que la otra ceda, o cambia las tiendas, las fechas o las prendas'
           when v_r.tipo = 'monto' then 'que esas prendas no cuenten para el monto, o cambia las tiendas, las fechas o las prendas'
           when v_c.otra_tipo = 'oferta' then 'que la otra ceda, o cambia las tiendas, las fechas o las prendas'
           else 'retira ese descuento de siempre, o cambia las tiendas, las fechas o las prendas' end
      using errcode = 'P0001', hint = 'oferta_choca';
  end loop;
end;
$function$;
