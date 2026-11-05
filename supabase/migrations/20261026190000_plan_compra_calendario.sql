-- ============================================================================
-- 20261026190000 — Plan de campaña: el CALENDARIO. Con cuáles campañas me quedo el año, cuáles se repiten y cuáles descansan
--   (ADR-0525, Felipe 2026-10-26, spike ① «Calendario», tarea #7)
--
-- EL PROBLEMA PRIMERO. El selector del Plan ofrece «armar plan» para TODA campaña de Catálogo ▸ Insignias (San Valentín, Día de la Madre, Día del Gato, Día del Perro,
--   Black Friday…): lo que sirve para publicar no siempre sirve para comprar, y nadie puede decir «esta no la compro», «esta la dejo descansar hasta marzo» o «esta vuelve cada año».
--   Tampoco hay lugar para una campaña que vive solo en el plan de compra (el Día del Padre) sin crear una insignia en la tienda web.
--
-- LO QUE HACE.
--   1. `plan_compra_calendario`: una fila por campaña sobre la que alguien DECIDIÓ algo (o por campaña propia del plan). Dice si entra a mi plan («activa»), descansa
--      («pausada», hasta una fecha o hasta que la reactive) o no la compro («no»); si se repite cada año o es solo de un año; las fechas del plan si no son las de la
--      insignia (una ventana de compra empieza antes que la venta); y si se quitó del calendario (se archiva, nunca se borra). Una campaña de Insignias SIN fila no tiene
--      decisión: la web la trata como activa si ya tiene un plan y como «no la compro» si no.
--   2. `planes_compra.calendario_id`: el plan de una campaña PROPIA (sin insignia) apunta a su fila del calendario, igual que el plan de una de Insignias apunta a su
--      `etiqueta_id`. Nunca los dos (CHECK); y un plan por campaña propia y año (UNIQUE), como ya pasa con las de Insignias.
--   3. Cuatro funciones de decisión y una de lectura: `fn_plan_compra_calendario`, `guardar_plan_compra_calendario`, `cambiar_uso_plan_compra_calendario`,
--      `quitar_plan_compra_calendario` / `restaurar_plan_compra_calendario`, más `crear_plan_compra_propio` (el plan de una campaña propia). Cada una pide el módulo
--      «Plan de campaña» y firma el responsable del combo (`fn_actor_persona_id(true)`).
--
-- LO QUE NO HACE.
--   · No toca Catálogo ▸ Insignias, la tienda web ni la meta de caja: lo que cambias aquí es de TU plan de compra (la insignia sigue como estaba).
--   · No mide la historia de cada campaña (cuánto sube la venta): eso lo calcula la web con la misma vara que el Historial (`lib/plan-compra-historial.ts`), una sola cuenta.
--   · No crea la insignia de una campaña propia (eso es de Catálogo ▸ Insignias y de un líder): la campaña propia vive solo en el plan.
--   · No borra: quitar una campaña del calendario la archiva (`quitada_en`) y se puede restaurar.
--
-- CONTRATO. PROMETE: una campaña de Insignias tiene A LO SUMO una fila; una propia, nombre y fechas completas; «pausada» puede o no traer fecha de regreso, pero solo
--   «pausada» la trae; «cada año» no trae año y «solo un año» sí; quitar y restaurar dejan quién y cuándo. ASUME: las fechas del calendario son «mes-día» (sin año): la
--   web las lleva a cada año con la misma regla que el Historial (Día de la Madre sigue a su segundo domingo de mayo).
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla):
--   · dos filas del calendario para la misma campaña de Insignias, o dos campañas propias con el mismo nombre (UNIQUE);
--   · una campaña propia sin nombre o sin sus dos fechas (CHECK); una fecha «mes-día» que no existe (el 31 de abril: la función la rechaza con `make_date`);
--   · una campaña «cada año» con un año fijo, o «solo un año» sin él; una fecha de regreso en una campaña que no está pausada (CHECK);
--   · un plan con insignia Y con campaña propia a la vez (CHECK), o dos planes de la misma campaña propia en el mismo año (UNIQUE);
--   · una campaña quitada sin decir quién (CHECK);
--   · nadie escribe ni lee la tabla desde la web (RLS sin políticas y sin permisos de tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una tabla NUEVA con su `alter … enable row level security`, una columna nueva en `planes_compra` (con su
--   llave foránea y su CHECK) y funciones; SIN políticas. `lock_timeout` 3 s. Idempotente: pegarla dos veces deja lo mismo. Va DESPUÉS de 20261026184000.
-- ORDEN CON LA WEB: da igual. La web vieja con la base nueva ignora el calendario; la web nueva con la base vieja recibe «no existe esa función» y esconde la pestaña
--   Calendario (el selector sigue ofreciendo todas las campañas, como hoy).
-- CAÍDA EXTERNA. Nada llama a la red. Si la lectura del calendario falla, el selector ofrece todas las campañas como siempre y el Calendario dice que no pudo leerse.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La tabla ----------------------------------------------------------------------------------------------------------------------

create table if not exists retail.plan_compra_calendario (
  id uuid primary key default gen_random_uuid(),
  -- La campaña de Catálogo ▸ Insignias sobre la que se decidió; null = una campaña PROPIA del plan (sin insignia).
  etiqueta_id uuid references retail.etiquetas (id),
  nombre text check (nombre is null or (btrim(nombre) <> '' and char_length(nombre) <= 80)),
  -- Las fechas del PLAN (mes-día), si no son las de la insignia. null en las dos = las de la insignia. Una campaña propia las trae siempre.
  desde_md text check (desde_md is null or desde_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  hasta_md text check (hasta_md is null or hasta_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  uso text not null default 'no' check (uso in ('activa', 'pausada', 'no')),
  pausa_hasta date,
  repite text not null default 'anual' check (repite in ('anual', 'unica')),
  anio_unico integer check (anio_unico is null or anio_unico between 2000 and 2100),
  quitada_en timestamptz,
  quitada_por uuid references public.personas (id),
  creada_por uuid not null references public.personas (id),
  creada_en timestamptz not null default now(),
  actualizada_por uuid not null references public.personas (id),
  actualizada_en timestamptz not null default now(),
  constraint plan_compra_calendario_propia_completa check (etiqueta_id is not null or (nombre is not null and desde_md is not null and hasta_md is not null)),
  constraint plan_compra_calendario_de_insignia_sin_nombre check (etiqueta_id is null or nombre is null),
  constraint plan_compra_calendario_las_dos_fechas check ((desde_md is null) = (hasta_md is null)),
  constraint plan_compra_calendario_unica_con_anio check ((repite = 'unica') = (anio_unico is not null)),
  constraint plan_compra_calendario_regreso_solo_pausada check (pausa_hasta is null or uso = 'pausada'),
  constraint plan_compra_calendario_quitada_con_autor check ((quitada_en is null) = (quitada_por is null))
);
create unique index if not exists plan_compra_calendario_una_por_insignia on retail.plan_compra_calendario (etiqueta_id) where etiqueta_id is not null;
create unique index if not exists plan_compra_calendario_nombre_propio on retail.plan_compra_calendario (retail.fn_clave_texto(nombre)) where etiqueta_id is null;
comment on table retail.plan_compra_calendario is
  'ADR-0525: lo que se DECIDIÓ de cada campaña del calendario del Plan de compra: entra a mi plan (activa), descansa (pausada, hasta una fecha o hasta que se reactive) o no se compra; si se repite cada año; las fechas del plan si no son las de la insignia; y si se quitó (archivada, no borrada). Una fila por campaña de Insignias a lo sumo, más las campañas PROPIAS del plan (sin insignia). Solo la tocan sus funciones; la web no la lee ni la escribe directo.';

alter table retail.plan_compra_calendario enable row level security;
revoke all on retail.plan_compra_calendario from public, anon, authenticated;

-- 2. El plan de una campaña propia ----------------------------------------------------------------------------------------------------

alter table retail.planes_compra add column if not exists calendario_id uuid references retail.plan_compra_calendario (id);
comment on column retail.planes_compra.calendario_id is
  'ADR-0525: la campaña PROPIA del calendario (sin insignia) de la que es este plan. Un plan trae etiqueta_id (campaña de Insignias) o calendario_id (propia), nunca los dos.';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_insignia_o_propia' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra add constraint planes_compra_insignia_o_propia check (etiqueta_id is null or calendario_id is null);
  end if;
end;
$$;
create unique index if not exists planes_compra_una_por_propia_y_anio on retail.planes_compra (calendario_id, (extract(year from hasta)::integer)) where calendario_id is not null;

-- 3. Internas ----------------------------------------------------------------------------------------------------------------------

-- ¿«mm-dd» existe en el calendario? El 29 de febrero sí (hay años bisiestos); el 31 de abril no.
create or replace function retail.fn_plan_compra_md_valido(p_md text)
returns boolean
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
begin
  if p_md is null or p_md !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
    return false;
  end if;
  perform make_date(2000, split_part(p_md, '-', 1)::integer, split_part(p_md, '-', 2)::integer);
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function retail.fn_plan_compra_md_valido(text) from public, anon, authenticated;

-- Un «mes-día» llevado a un año: el 29 de febrero cae al 28 en un año que no es bisiesto (la misma regla que `mismaFechaEn` en la web).
create or replace function retail.fn_plan_compra_md_en(p_md text, p_anio integer)
returns date
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_mes integer := split_part(p_md, '-', 1)::integer;
  v_dia integer := split_part(p_md, '-', 2)::integer;
  v_ultimo integer := extract(day from (make_date(p_anio, v_mes, 1) + interval '1 month' - interval '1 day'))::integer;
begin
  return make_date(p_anio, v_mes, least(v_dia, v_ultimo));
end;
$$;
revoke all on function retail.fn_plan_compra_md_en(text, integer) from public, anon, authenticated;

-- 4. Leer ---------------------------------------------------------------------------------------------------------------------------

-- Todas las filas del calendario con los planes de cada campaña PROPIA (las de Insignias traen los suyos en `fn_planes_compra`). `hoy` es el de Lima.
create or replace function retail.fn_plan_compra_calendario()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el calendario del plan necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  return jsonb_build_object(
    -- La web nueva solo ofrece la pestaña Calendario si ve esta marca.
    'soportado', true,
    'hoy', retail.fn_hoy_lima(),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'etiqueta_id', c.etiqueta_id, 'nombre', c.nombre, 'desde_md', c.desde_md, 'hasta_md', c.hasta_md,
               'uso', c.uso, 'pausa_hasta', c.pausa_hasta, 'repite', c.repite, 'anio_unico', c.anio_unico,
               'quitada', c.quitada_en is not null,
               'planes', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'anio', extract(year from p.hasta)::integer, 'archivado', p.archivado_en is not null) order by p.hasta)
                   from retail.planes_compra p where p.calendario_id = c.id), '[]'::jsonb),
               'por', retail.fn_actividad_nombre(c.actualizada_por), 'en', c.actualizada_en) order by c.creada_en)
        from retail.plan_compra_calendario c), '[]'::jsonb)
  );
end;
$$;
revoke all on function retail.fn_plan_compra_calendario() from public, anon;
grant execute on function retail.fn_plan_compra_calendario() to authenticated;
comment on function retail.fn_plan_compra_calendario() is
  'ADR-0525: las decisiones del calendario del plan (una fila por campaña decidida o propia) con los planes de las campañas propias. Pide el módulo plan_compra. `soportado` es la marca que la web busca.';

-- 5. Escribir -----------------------------------------------------------------------------------------------------------------------

-- Guarda UNA campaña del calendario: la de una insignia (p_etiqueta_id; se crea su fila si no la tenía), una propia ya existente (p_id) o una propia nueva (ninguno de los dos).
create or replace function retail.guardar_plan_compra_calendario(
  p_id uuid,
  p_etiqueta_id uuid,
  p_nombre text,
  p_desde_md text,
  p_hasta_md text,
  p_uso text,
  p_pausa_hasta date,
  p_repite text,
  p_anio_unico integer
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_fila retail.plan_compra_calendario%rowtype;
  v_id uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_pausa date := p_pausa_hasta;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Configurar el calendario del plan necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if p_uso is null or p_uso not in ('activa', 'pausada', 'no') then
    raise exception 'Elige si la campaña entra a tu plan, descansa o no la compras.' using hint = 'plan_compra_calendario_uso';
  end if;
  if p_repite is null or p_repite not in ('anual', 'unica') then
    raise exception 'Elige si se repite cada año o es solo de un año.' using hint = 'plan_compra_calendario_repite';
  end if;
  if (p_repite = 'unica') <> (p_anio_unico is not null) or (p_anio_unico is not null and p_anio_unico not between 2000 and 2100) then
    raise exception 'Una campaña de un solo año dice cuál año; una que se repite cada año, no.' using hint = 'plan_compra_calendario_anio';
  end if;
  if p_uso <> 'pausada' then
    v_pausa := null;
  elsif v_pausa is not null and v_pausa <= v_hoy then
    raise exception 'La fecha de regreso tiene que ser posterior a hoy (o déjala vacía: descansa hasta que la reactives).' using hint = 'plan_compra_calendario_regreso';
  end if;
  if (p_desde_md is null) <> (p_hasta_md is null) then
    raise exception 'Ponle las dos fechas, el desde y el hasta, o ninguna.' using hint = 'plan_compra_calendario_fechas';
  end if;
  if p_desde_md is not null and not (retail.fn_plan_compra_md_valido(p_desde_md) and retail.fn_plan_compra_md_valido(p_hasta_md)) then
    raise exception 'Una de las fechas no existe en el calendario (por ejemplo, el 31 de abril).' using hint = 'plan_compra_calendario_fechas';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  if p_id is not null then
    for v_fila in select c.* from retail.plan_compra_calendario c where c.id = p_id for update loop
      exit;
    end loop;
    if v_fila.id is null then
      raise exception 'Esa campaña ya no está en el calendario.' using hint = 'plan_compra_calendario_inexistente';
    end if;
  elsif p_etiqueta_id is not null then
    if not exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estilo = 'campana' and e.activo and e.estado = 'aprobado') then
      raise exception 'Esa campaña ya no está en Catálogo ▸ Insignias (o no está aprobada).' using hint = 'plan_compra_calendario_etiqueta';
    end if;
    for v_fila in select c.* from retail.plan_compra_calendario c where c.etiqueta_id = p_etiqueta_id for update loop
      exit;
    end loop;
  end if;

  if v_fila.id is not null and v_fila.quitada_en is not null then
    raise exception 'Esa campaña está quitada del calendario: restáurala primero.' using hint = 'plan_compra_calendario_quitada';
  end if;

  if v_fila.id is null then
    -- Una fila nueva: de una insignia que no tenía decisión, o una campaña propia.
    if p_etiqueta_id is null then
      if v_nombre is null or p_desde_md is null then
        raise exception 'Una campaña nueva lleva su nombre y sus dos fechas.' using hint = 'plan_compra_calendario_propia';
      end if;
      if exists (select 1 from retail.etiquetas e where retail.fn_clave_texto(e.nombre) = retail.fn_clave_texto(v_nombre)) then
        raise exception '«%» ya está en el calendario del sistema (Catálogo ▸ Insignias): elígela ahí.', v_nombre using hint = 'plan_compra_calendario_nombre';
      end if;
      if exists (select 1 from retail.plan_compra_calendario c where c.etiqueta_id is null and retail.fn_clave_texto(c.nombre) = retail.fn_clave_texto(v_nombre)) then
        raise exception 'Ya hay una campaña con ese nombre: ponle otro.' using hint = 'plan_compra_calendario_nombre';
      end if;
    end if;
    begin
      insert into retail.plan_compra_calendario as c
        (etiqueta_id, nombre, desde_md, hasta_md, uso, pausa_hasta, repite, anio_unico, creada_por, actualizada_por)
      values
        (p_etiqueta_id, case when p_etiqueta_id is null then v_nombre end, p_desde_md, p_hasta_md, p_uso, v_pausa, p_repite, p_anio_unico, v_persona, v_persona)
      -- Dos personas deciden la misma campaña de Insignias a la vez: la segunda actualiza lo que la primera creó (salvo que ya la hayan quitado).
      on conflict (etiqueta_id) where etiqueta_id is not null do update
         set desde_md = excluded.desde_md, hasta_md = excluded.hasta_md, uso = excluded.uso, pausa_hasta = excluded.pausa_hasta,
             repite = excluded.repite, anio_unico = excluded.anio_unico, actualizada_por = excluded.actualizada_por, actualizada_en = now()
       where c.quitada_en is null
      returning c.id into v_id;
    exception when unique_violation then
      raise exception 'Ya hay una campaña con ese nombre: ponle otro.' using hint = 'plan_compra_calendario_nombre';
    end;
    if v_id is null then
      raise exception 'Esa campaña está quitada del calendario: restáurala primero.' using hint = 'plan_compra_calendario_quitada';
    end if;
  else
    v_id := v_fila.id;
    if v_fila.etiqueta_id is null then
      -- Una propia: puede cambiar de nombre (sin chocar con otra) y siempre trae sus dos fechas.
      if v_nombre is null or p_desde_md is null then
        raise exception 'Una campaña propia lleva su nombre y sus dos fechas.' using hint = 'plan_compra_calendario_propia';
      end if;
      if retail.fn_clave_texto(v_nombre) <> retail.fn_clave_texto(v_fila.nombre) then
        if exists (select 1 from retail.etiquetas e where retail.fn_clave_texto(e.nombre) = retail.fn_clave_texto(v_nombre)) then
          raise exception '«%» ya está en el calendario del sistema (Catálogo ▸ Insignias): elígela ahí.', v_nombre using hint = 'plan_compra_calendario_nombre';
        end if;
        if exists (select 1 from retail.plan_compra_calendario c where c.id <> v_fila.id and c.etiqueta_id is null and retail.fn_clave_texto(c.nombre) = retail.fn_clave_texto(v_nombre)) then
          raise exception 'Ya hay una campaña con ese nombre: ponle otro.' using hint = 'plan_compra_calendario_nombre';
        end if;
      end if;
    end if;
    update retail.plan_compra_calendario
       set nombre = case when etiqueta_id is null then v_nombre else null end,
           desde_md = p_desde_md, hasta_md = p_hasta_md,
           uso = p_uso, pausa_hasta = v_pausa, repite = p_repite, anio_unico = p_anio_unico,
           actualizada_por = v_persona, actualizada_en = now()
     where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'etiqueta_id', p_etiqueta_id, 'uso', p_uso);
end;
$$;
revoke all on function retail.guardar_plan_compra_calendario(uuid, uuid, text, text, text, text, date, text, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_calendario(uuid, uuid, text, text, text, text, date, text, integer) to authenticated;
comment on function retail.guardar_plan_compra_calendario(uuid, uuid, text, text, text, text, date, text, integer) is
  'ADR-0525: guarda la decisión sobre UNA campaña del calendario del plan: p_etiqueta_id (una de Insignias; crea su fila si no la tenía), p_id (una propia ya existente) o ninguno (una propia nueva: nombre y las dos fechas). Uso activa/pausada/no, si se repite, las fechas del plan (mes-día) y, si descansa, hasta cuándo. No toca la insignia. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {id, etiqueta_id, uso}.';

-- El interruptor de la lista: entra a mi plan o no. Crea la fila de una insignia sin decisión; no toca las fechas ni si se repite.
create or replace function retail.cambiar_uso_plan_compra_calendario(p_id uuid, p_etiqueta_id uuid, p_uso text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_fila retail.plan_compra_calendario%rowtype;
  v_id uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Configurar el calendario del plan necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if p_uso is null or p_uso not in ('activa', 'no') then
    raise exception 'El interruptor entra a tu plan o no: «pausada» se elige en la hoja de la campaña.' using hint = 'plan_compra_calendario_uso';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  if p_id is not null then
    for v_fila in select c.* from retail.plan_compra_calendario c where c.id = p_id for update loop
      exit;
    end loop;
  elsif p_etiqueta_id is not null then
    if not exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estilo = 'campana' and e.activo and e.estado = 'aprobado') then
      raise exception 'Esa campaña ya no está en Catálogo ▸ Insignias (o no está aprobada).' using hint = 'plan_compra_calendario_etiqueta';
    end if;
    for v_fila in select c.* from retail.plan_compra_calendario c where c.etiqueta_id = p_etiqueta_id for update loop
      exit;
    end loop;
  else
    raise exception 'Falta decir de cuál campaña se habla.' using hint = 'plan_compra_calendario_inexistente';
  end if;
  if v_fila.id is null and p_id is not null then
    raise exception 'Esa campaña ya no está en el calendario.' using hint = 'plan_compra_calendario_inexistente';
  end if;
  if v_fila.id is not null and v_fila.quitada_en is not null then
    raise exception 'Esa campaña está quitada del calendario: restáurala primero.' using hint = 'plan_compra_calendario_quitada';
  end if;
  if v_fila.id is null then
    insert into retail.plan_compra_calendario as c (etiqueta_id, uso, creada_por, actualizada_por)
    values (p_etiqueta_id, p_uso, v_persona, v_persona)
    -- Dos personas prenden la misma campaña a la vez: la segunda actualiza lo que la primera creó (salvo que ya la hayan quitado).
    on conflict (etiqueta_id) where etiqueta_id is not null do update
       set uso = excluded.uso, pausa_hasta = null, actualizada_por = excluded.actualizada_por, actualizada_en = now()
     where c.quitada_en is null
    returning c.id into v_id;
    if v_id is null then
      raise exception 'Esa campaña está quitada del calendario: restáurala primero.' using hint = 'plan_compra_calendario_quitada';
    end if;
  else
    v_id := v_fila.id;
    -- Prender una pausada la reactiva (sin fecha de regreso); apagar una pausada la deja en «no».
    update retail.plan_compra_calendario set uso = p_uso, pausa_hasta = null, actualizada_por = v_persona, actualizada_en = now() where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'uso', p_uso);
end;
$$;
revoke all on function retail.cambiar_uso_plan_compra_calendario(uuid, uuid, text) from public, anon;
grant execute on function retail.cambiar_uso_plan_compra_calendario(uuid, uuid, text) to authenticated;
comment on function retail.cambiar_uso_plan_compra_calendario(uuid, uuid, text) is
  'ADR-0525: el interruptor del calendario: la campaña (p_id o p_etiqueta_id) entra a tu plan (activa) o no (no). Crea la fila de una insignia sin decisión; reactiva una pausada. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {id, uso}.';

-- Quitar del calendario (se archiva) y restaurar. Nada se borra: una campaña quitada deja de salir en todas partes y vuelve con lo que tenía.
create or replace function retail.quitar_plan_compra_calendario(p_id uuid, p_etiqueta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_fila retail.plan_compra_calendario%rowtype;
  v_id uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Quitar una campaña del calendario necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  if p_id is not null then
    for v_fila in select c.* from retail.plan_compra_calendario c where c.id = p_id for update loop
      exit;
    end loop;
    if v_fila.id is null then
      raise exception 'Esa campaña ya no está en el calendario.' using hint = 'plan_compra_calendario_inexistente';
    end if;
  elsif p_etiqueta_id is not null then
    if not exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estilo = 'campana' and e.activo and e.estado = 'aprobado') then
      raise exception 'Esa campaña ya no está en Catálogo ▸ Insignias (o no está aprobada).' using hint = 'plan_compra_calendario_etiqueta';
    end if;
    for v_fila in select c.* from retail.plan_compra_calendario c where c.etiqueta_id = p_etiqueta_id for update loop
      exit;
    end loop;
  else
    raise exception 'Falta decir de cuál campaña se habla.' using hint = 'plan_compra_calendario_inexistente';
  end if;
  if v_fila.id is null then
    insert into retail.plan_compra_calendario as c (etiqueta_id, uso, quitada_en, quitada_por, creada_por, actualizada_por)
    values (p_etiqueta_id, 'no', now(), v_persona, v_persona, v_persona)
    on conflict (etiqueta_id) where etiqueta_id is not null do update
       set quitada_en = coalesce(c.quitada_en, excluded.quitada_en), quitada_por = coalesce(c.quitada_por, excluded.quitada_por),
           actualizada_por = excluded.actualizada_por, actualizada_en = now()
    returning c.id into v_id;
  else
    v_id := v_fila.id;
    update retail.plan_compra_calendario
       set quitada_en = coalesce(quitada_en, now()), quitada_por = coalesce(quitada_por, v_persona), actualizada_por = v_persona, actualizada_en = now()
     where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'accion', 'quitada');
end;
$$;
revoke all on function retail.quitar_plan_compra_calendario(uuid, uuid) from public, anon;
grant execute on function retail.quitar_plan_compra_calendario(uuid, uuid) to authenticated;
comment on function retail.quitar_plan_compra_calendario(uuid, uuid) is
  'ADR-0525: quita una campaña del calendario (la archiva, nunca la borra): deja de salir en la lista, el selector y los avisos. Se restaura con restaurar_plan_compra_calendario. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {id, accion}.';

create or replace function retail.restaurar_plan_compra_calendario(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_fila retail.plan_compra_calendario%rowtype;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Restaurar una campaña del calendario necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  for v_fila in select c.* from retail.plan_compra_calendario c where c.id = p_id for update loop
    exit;
  end loop;
  if v_fila.id is null then
    raise exception 'Esa campaña ya no está en el calendario.' using hint = 'plan_compra_calendario_inexistente';
  end if;
  update retail.plan_compra_calendario set quitada_en = null, quitada_por = null, actualizada_por = v_persona, actualizada_en = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'accion', 'restaurada');
end;
$$;
revoke all on function retail.restaurar_plan_compra_calendario(uuid) from public, anon;
grant execute on function retail.restaurar_plan_compra_calendario(uuid) to authenticated;
comment on function retail.restaurar_plan_compra_calendario(uuid) is
  'ADR-0525: devuelve al calendario una campaña quitada, con lo que tenía. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {id, accion}.';

-- El plan de una campaña PROPIA (sin insignia): nace con su nombre «<campaña> <año>», sus fechas del calendario llevadas a ese año y su vínculo (`calendario_id`).
-- Armar su plan es participar: la campaña pasa a «activa». Las de Insignias siguen con `crear_plan_compra`.
create or replace function retail.crear_plan_compra_propio(p_calendario_id uuid, p_anio integer, p_nombre text default null, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_fila retail.plan_compra_calendario%rowtype;
  v_desde date;
  v_hasta date;
  v_nombre text;
  v_id uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Crear una campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if p_anio is null or p_anio not between 2000 and 2100 then
    raise exception 'Elige el año de la campaña.' using hint = 'plan_compra_fechas';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  for v_fila in select c.* from retail.plan_compra_calendario c where c.id = p_calendario_id for update loop
    exit;
  end loop;
  if v_fila.id is null or v_fila.etiqueta_id is not null or v_fila.quitada_en is not null then
    raise exception 'Elige una campaña propia de tu calendario (las de Insignias se arman desde el selector).' using hint = 'plan_compra_calendario_propia';
  end if;
  -- Sus fechas del calendario (mes-día) llevadas al año en que TERMINA la campaña (como `proyectarCampana` de la web y como el nombre del plan): si empiezan
  -- «después» de lo que terminan (20 dic a 6 ene), el principio cae en el año anterior.
  v_hasta := coalesce(p_hasta, retail.fn_plan_compra_md_en(v_fila.hasta_md, p_anio));
  v_desde := coalesce(
    p_desde,
    retail.fn_plan_compra_md_en(v_fila.desde_md, extract(year from v_hasta)::integer - case when v_fila.desde_md > v_fila.hasta_md then 1 else 0 end)
  );
  if v_hasta < v_desde then
    raise exception 'La campaña no puede terminar antes de empezar.' using hint = 'plan_compra_fechas';
  end if;
  v_nombre := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), v_fila.nombre || ' ' || extract(year from v_hasta)::integer);
  if exists (select 1 from retail.planes_compra p where p.calendario_id = p_calendario_id and extract(year from p.hasta)::integer = extract(year from v_hasta)::integer) then
    raise exception 'Esa campaña ya tiene su plan de ese año: ábrelo desde el selector.' using hint = 'plan_compra_ya_existe';
  end if;
  if exists (select 1 from retail.planes_compra p where lower(p.nombre) = lower(v_nombre)) then
    raise exception 'Ya hay un plan con ese nombre: ponle otro.' using hint = 'plan_compra_nombre';
  end if;
  insert into retail.planes_compra (nombre, desde, hasta, calendario_id, creado_por)
  values (v_nombre, v_desde, v_hasta, p_calendario_id, v_persona)
  returning id into v_id;
  -- Armar su plan es participar.
  update retail.plan_compra_calendario
     set uso = 'activa', pausa_hasta = null, actualizada_por = v_persona, actualizada_en = now()
   where id = p_calendario_id and uso <> 'activa';
  return jsonb_build_object('id', v_id, 'nombre', v_nombre);
end;
$$;
revoke all on function retail.crear_plan_compra_propio(uuid, integer, text, date, date) from public, anon;
grant execute on function retail.crear_plan_compra_propio(uuid, integer, text, date, date) to authenticated;
comment on function retail.crear_plan_compra_propio(uuid, integer, text, date, date) is
  'ADR-0525: crea el plan de una campaña PROPIA del calendario (sin insignia): su nombre «<campaña> <año>», sus fechas del calendario llevadas al año (o las que se manden) y su vínculo calendario_id; un plan por campaña y año. La campaña pasa a «activa». Pide el módulo plan_compra; firma el responsable del combo. Devuelve {id, nombre}.';

reset lock_timeout;
notify pgrst, 'reload schema';
