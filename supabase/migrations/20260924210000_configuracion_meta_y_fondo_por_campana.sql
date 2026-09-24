-- ============================================================================
-- 20260924210000 — Configuración: meta del día y fondo de caja, unidos a las campañas (ADR-0195, F1)
--
-- QUÉ ES ESTO
--   Felipe (2026-09-24): cada tienda tiene una meta de venta por día y un fondo que debe quedar en el cajón al cerrar, y
--   las dos cosas cambian con las CAMPAÑAS (las etiquetas de estilo «campaña» de Catálogo ▸ Etiquetas, dueñas únicas de
--   las fechas). La caja ve «cuánto te falta para la meta» y, al cerrar, «deja S/ X». Si deja menos, se le pide confirmar
--   pero NO se le bloquea; el cierre queda anotado (ADR-0195 K y L; cambia el punto 3 del ADR-0186).
--
-- LO QUE AGREGA
--   1. El módulo `configuracion` (Gestión, «solo líder por ahora»: sus funciones exigen fn_es_lider()). Nace sin rol.
--   2. `ubicacion_metas_dia`: la meta de cada día de la semana por tienda (con IGV, lo que ve la caja).
--   3. `ubicaciones.fondo_caja`: el fondo normal de cada tienda.
--   4. `campana_efecto_caja`: por campaña y tienda, cuánto sube (o baja) la meta y qué fondo dejar.
--   5. `fn_parametros_caja(sede, fecha)`: la ÚNICA regla de qué rige un día. Si dos campañas se cruzan, gana la mayor
--      (la que más sube la meta y el fondo más alto): la misma regla del descuento de una prenda con varias etiquetas.
--   6. `fn_meta_mes(sede, mes)`: la meta del mes = la suma de las del día (una sola meta, no dos).
--   7. `cajas.fondo_requerido`: al cerrar, un disparador anota el fondo que regía ese día. Así `cerrar_caja` NO cambia
--      (ni su firma ni su cuerpo): la web de hoy sigue funcionando aunque esta migración se pegue antes que la web nueva.
--   8. `configuracion_historial`: cada cambio de configuración, con quién y cuándo (solo se agregan filas).
--   9. Escritura solo por RPC y solo del líder: `guardar_metas_tienda`, `guardar_efecto_campana`. Lectura para la
--      pantalla: `fn_configuracion_tiendas`.
--
-- ESTADOS IMPOSIBLES QUE CIERRA
--   · Una meta ≤ 0, un fondo < 0, un día de la semana fuera de 0–6 — check.
--   · Una meta o un efecto de campaña en algo que no es una tienda (Taller, almacén) — disparador.
--   · Un efecto de caja en una etiqueta que no es campaña o que no tiene fechas — disparador (una campaña sin fechas no
--     puede cambiar la caja: no se sabe cuándo).
--   · Una fila de efecto «vacía» (sin cambio de meta ni de fondo) — check: para volver a lo normal se borra la fila, y el
--     historial guarda que se quitó.
--   · Escribir estas tablas por fuera de las RPC — sin políticas de escritura y con revoke.
--
-- LO QUE NO SE TOCA
--   · `cerrar_caja`, `abrir_caja`, `fn_calcular_esperado_caja`: iguales.
--   · `ubicaciones.meta_venta_diaria` queda como respaldo: si una tienda no tiene metas por día, `fn_parametros_caja` usa
--     esa (en producción está vacía en todas). Se quita cuando ninguna pantalla la lea.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: con `set search_path` (ya está abajo), sin prefijo extra. Es idempotente.
-- SE ROMPE SI: la web nueva se publica antes de pegar esto (Configuración y la barra de meta de Caja llaman funciones
-- que no existirían). La web de hoy no se rompe si esto se pega primero.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. El módulo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('configuracion', 'Gestión', 'Configuración', 'Metas de venta y fondo de caja de cada tienda, y lo que cambia cada campaña en la caja', 240, false, false)
on conflict (clave) do nothing;

-- ---------- 2. Meta por día de la semana ----------
create table if not exists retail.ubicacion_metas_dia (
  ubicacion_id  uuid not null references retail.ubicaciones (id),
  dia_semana    smallint not null check (dia_semana between 0 and 6),   -- 0 = lunes … 6 = domingo
  meta          numeric(12,2) not null check (meta > 0),
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  primary key (ubicacion_id, dia_semana)
);
comment on table retail.ubicacion_metas_dia is
  'Meta de venta de cada día de la semana por tienda, con IGV (lo que ve la caja). 0 = lunes. Solo tiendas. La escribe guardar_metas_tienda; la lee fn_parametros_caja.';

-- ---------- 3. Fondo normal de caja ----------
alter table retail.ubicaciones add column if not exists fondo_caja numeric(12,2);
alter table retail.ubicaciones drop constraint if exists ubicaciones_fondo_caja_no_negativo;
alter table retail.ubicaciones add constraint ubicaciones_fondo_caja_no_negativo check (fondo_caja is null or fondo_caja >= 0);
comment on column retail.ubicaciones.fondo_caja is
  'Lo que debe quedar en el cajón al cerrar, en un día normal. Una campaña puede subirlo (campana_efecto_caja). Null = sin fondo configurado: el cierre no pide nada.';

-- ---------- 4. Lo que cambia cada campaña en la caja ----------
create table if not exists retail.campana_efecto_caja (
  etiqueta_id   uuid not null references retail.etiquetas (id),
  ubicacion_id  uuid not null references retail.ubicaciones (id),
  meta_pct      numeric(5,2) not null default 0 check (meta_pct > -100 and meta_pct <= 300),
  fondo         numeric(12,2) check (fondo is null or fondo >= 0),
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  primary key (etiqueta_id, ubicacion_id),
  constraint campana_efecto_caja_no_vacio check (meta_pct <> 0 or fondo is not null)
);
comment on table retail.campana_efecto_caja is
  'Por campaña (etiqueta de estilo campaña, con fechas) y tienda: cuánto sube o baja la meta del día y qué fondo dejar. Si dos campañas rigen el mismo día, gana la mayor (fn_parametros_caja).';

-- Solo tiendas, y solo campañas con fechas.
create or replace function retail.fn_exigir_tienda_y_campana() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text; v_estilo text; v_desde date; v_hasta date;
begin
  select tipo into v_tipo from ubicaciones where id = new.ubicacion_id;
  if v_tipo is distinct from 'tienda' then
    raise exception 'La meta y el fondo de caja son solo de tiendas.' using errcode = 'P0001';
  end if;
  if tg_table_name = 'campana_efecto_caja' then
    select estilo, vigente_desde, vigente_hasta into v_estilo, v_desde, v_hasta from etiquetas where id = new.etiqueta_id;
    if v_estilo is distinct from 'campana' then
      raise exception 'Solo una campaña puede cambiar la caja.' using errcode = 'P0001';
    end if;
    if v_desde is null or v_hasta is null then
      raise exception 'La campaña no tiene fechas: ponle fechas en Catálogo ▸ Etiquetas antes de cambiar la caja.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_metas_solo_tienda on retail.ubicacion_metas_dia;
create trigger trg_metas_solo_tienda before insert or update on retail.ubicacion_metas_dia
  for each row execute function retail.fn_exigir_tienda_y_campana();
drop trigger if exists trg_efecto_caja_valido on retail.campana_efecto_caja;
create trigger trg_efecto_caja_valido before insert or update on retail.campana_efecto_caja
  for each row execute function retail.fn_exigir_tienda_y_campana();

-- ---------- 8. Historial de configuración (solo se agregan filas) ----------
create table if not exists retail.configuracion_historial (
  id        bigint generated always as identity primary key,
  que       text not null,
  detalle   jsonb not null default '{}'::jsonb,
  hecho_por uuid,
  hecho_en  timestamptz not null default now()
);
comment on table retail.configuracion_historial is 'Cada cambio de Configuración: qué, el antes y el después, quién y cuándo. Solo se agregan filas.';

-- ---------- 5. Lo que rige un día ----------
create or replace function retail.fn_parametros_caja(p_ubicacion_id uuid, p_fecha date)
returns table (meta numeric, meta_base numeric, meta_pct numeric, fondo numeric, fondo_base numeric, campanas jsonb)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v_base numeric; v_fondo_base numeric; v_pct numeric; v_fondo_camp numeric; v_campanas jsonb;
begin
  select m.meta into v_base from ubicacion_metas_dia m
   where m.ubicacion_id = p_ubicacion_id and m.dia_semana = extract(isodow from p_fecha)::int - 1;
  select coalesce(v_base, u.meta_venta_diaria), u.fondo_caja into v_base, v_fondo_base from ubicaciones u where u.id = p_ubicacion_id;

  -- Las campañas que rigen ese día en esa tienda (activas, aprobadas, con fechas, y la tienda dentro de sus sedes).
  select coalesce(max(c.meta_pct), 0), max(c.fondo),
         coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'meta_pct', c.meta_pct, 'fondo', c.fondo,
                                               'desde', e.vigente_desde, 'hasta', e.vigente_hasta) order by c.meta_pct desc, e.nombre), '[]'::jsonb)
    into v_pct, v_fondo_camp, v_campanas
    from campana_efecto_caja c
    join etiquetas e on e.id = c.etiqueta_id
   where c.ubicacion_id = p_ubicacion_id
     and e.estilo = 'campana' and e.activo and e.estado = 'aprobado'
     and p_fecha between e.vigente_desde and e.vigente_hasta
     and (e.sedes_permitidas is null or cardinality(e.sedes_permitidas) = 0 or p_ubicacion_id = any (e.sedes_permitidas));

  return query select
    case when v_base is null then null else round(v_base * (1 + v_pct / 100)) end,
    v_base,
    v_pct,
    case when v_fondo_camp is null then v_fondo_base else greatest(coalesce(v_fondo_base, 0), v_fondo_camp) end,
    v_fondo_base,
    v_campanas;
end $$;
comment on function retail.fn_parametros_caja(uuid, date) is
  'La meta del día y el fondo de caja que rigen en una tienda una fecha. Base: la meta de ese día de la semana (o meta_venta_diaria) y ubicaciones.fondo_caja. Campañas que rigen: gana la mayor (meta_pct más alto, fondo más alto). Única regla: la leen Caja, Inicio, Configuración y Finanzas.';

-- ---------- 6. Meta del mes = suma de las del día ----------
create or replace function retail.fn_meta_mes(p_ubicacion_id uuid, p_mes date)
returns numeric language sql stable security definer set search_path = retail, public, extensions as $$
  select sum(p.meta)
    from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, interval '1 day') d,
         lateral retail.fn_parametros_caja(p_ubicacion_id, d::date) p;
$$;
comment on function retail.fn_meta_mes(uuid, date) is 'Meta de venta del mes (con IGV): la suma de las metas de cada día, con las campañas. Null si la tienda no tiene metas.';

-- ---------- 7. El cierre anota el fondo que regía ----------
alter table retail.cajas add column if not exists fondo_requerido numeric(12,2);
comment on column retail.cajas.fondo_requerido is
  'El fondo que regía el día del cierre (fn_parametros_caja), anotado por un disparador al cerrar. Si monto_fondo < fondo_requerido, se dejó menos de lo pedido: el cierre no se bloqueó (ADR-0195 L) y el líder lo ve en Historial de cierres. Null = sin fondo configurado ese día.';

create or replace function retail.fn_anotar_fondo_requerido() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if new.estado = 'cerrada' and old.estado is distinct from 'cerrada' then
    select p.fondo into new.fondo_requerido
      from retail.fn_parametros_caja(new.ubicacion_id, (coalesce(new.cerrada_en, now()) at time zone 'America/Lima')::date) p;
  end if;
  return new;
end $$;
drop trigger if exists trg_anotar_fondo_requerido on retail.cajas;
create trigger trg_anotar_fondo_requerido before update of estado on retail.cajas
  for each row execute function retail.fn_anotar_fondo_requerido();

-- ---------- 9. Escritura (solo líder, firma con el responsable) ----------
-- p_metas: 7 valores, lunes a domingo; null o 0 = sin meta ese día. p_fondo: null = sin fondo.
create or replace function retail.guardar_metas_tienda(p_ubicacion_id uuid, p_metas numeric[], p_fondo numeric)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true); v_antes jsonb; i int;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder cambia las metas y el fondo de caja.' using errcode = 'P0001';
  end if;
  if p_metas is null or array_length(p_metas, 1) is distinct from 7 then
    raise exception 'Faltan las metas de los 7 días de la semana.' using errcode = 'P0001';
  end if;
  if p_fondo is not null and p_fondo < 0 then
    raise exception 'El fondo de caja no puede ser negativo.' using errcode = 'P0001';
  end if;
  -- Candado de la tienda: dos líderes guardando a la vez no se mezclan.
  perform 1 from ubicaciones where id = p_ubicacion_id for update;
  if not found then raise exception 'Esa tienda no existe.' using errcode = 'P0001'; end if;

  select jsonb_build_object('metas', coalesce((select jsonb_agg(meta order by dia_semana) from ubicacion_metas_dia where ubicacion_id = p_ubicacion_id), '[]'::jsonb),
                            'fondo', (select fondo_caja from ubicaciones where id = p_ubicacion_id)) into v_antes;

  for i in 1..7 loop
    if p_metas[i] is null or p_metas[i] = 0 then
      delete from ubicacion_metas_dia where ubicacion_id = p_ubicacion_id and dia_semana = i - 1;
    elsif p_metas[i] < 0 then
      raise exception 'Una meta no puede ser negativa.' using errcode = 'P0001';
    else
      insert into ubicacion_metas_dia (ubicacion_id, dia_semana, meta, actualizado_por, actualizado_en)
      values (p_ubicacion_id, i - 1, p_metas[i], v_actor, now())
      on conflict (ubicacion_id, dia_semana) do update set meta = excluded.meta, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
    end if;
  end loop;
  update ubicaciones set fondo_caja = p_fondo where id = p_ubicacion_id;

  insert into configuracion_historial (que, detalle, hecho_por)
  values ('metas_tienda', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes, 'despues', jsonb_build_object('metas', to_jsonb(p_metas), 'fondo', p_fondo)), v_actor);
end $$;

-- p_meta_pct: cuánto sube (o baja) la meta; p_fondo: qué fondo dejar (null = el normal). 0 y null = volver a lo normal.
create or replace function retail.guardar_efecto_campana(p_etiqueta_id uuid, p_ubicacion_id uuid, p_meta_pct numeric, p_fondo numeric)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true); v_antes jsonb;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder cambia lo que una campaña hace en la caja.' using errcode = 'P0001';
  end if;
  select to_jsonb(c) - 'actualizado_por' - 'actualizado_en' into v_antes
    from campana_efecto_caja c where etiqueta_id = p_etiqueta_id and ubicacion_id = p_ubicacion_id for update;

  if coalesce(p_meta_pct, 0) = 0 and p_fondo is null then
    delete from campana_efecto_caja where etiqueta_id = p_etiqueta_id and ubicacion_id = p_ubicacion_id;
  else
    insert into campana_efecto_caja (etiqueta_id, ubicacion_id, meta_pct, fondo, actualizado_por, actualizado_en)
    values (p_etiqueta_id, p_ubicacion_id, coalesce(p_meta_pct, 0), p_fondo, v_actor, now())
    on conflict (etiqueta_id, ubicacion_id) do update
      set meta_pct = excluded.meta_pct, fondo = excluded.fondo, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
  end if;

  insert into configuracion_historial (que, detalle, hecho_por)
  values ('efecto_campana', jsonb_build_object('etiqueta_id', p_etiqueta_id, 'ubicacion_id', p_ubicacion_id, 'antes', v_antes,
          'despues', jsonb_build_object('meta_pct', coalesce(p_meta_pct, 0), 'fondo', p_fondo)), v_actor);
end $$;

-- ---------- Lectura para la pantalla de Configuración ▸ Tiendas y caja ----------
create or replace function retail.fn_configuracion_tiendas(p_mes date default (now() at time zone 'America/Lima')::date)
returns jsonb language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder ve la configuración.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'nombre', u.nombre, 'fondo', u.fondo_caja, 'meta_respaldo', u.meta_venta_diaria,
        'metas', (select jsonb_agg((select m.meta from ubicacion_metas_dia m where m.ubicacion_id = u.id and m.dia_semana = d) order by d) from generate_series(0, 6) d),
        'meta_mes', retail.fn_meta_mes(u.id, p_mes)) order by u.nombre)
      from ubicaciones u where u.tipo = 'tienda' and u.activo), '[]'::jsonb),
    'campanas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.nombre, 'desde', e.vigente_desde, 'hasta', e.vigente_hasta, 'descuento_pct', e.descuento_pct,
        'sedes', e.sedes_permitidas,
        'efectos', coalesce((select jsonb_object_agg(c.ubicacion_id, jsonb_build_object('meta_pct', c.meta_pct, 'fondo', c.fondo))
                               from campana_efecto_caja c where c.etiqueta_id = e.id), '{}'::jsonb))
        order by e.vigente_desde nulls last, e.nombre)
      from etiquetas e where e.estilo = 'campana' and e.activo and e.estado = 'aprobado'), '[]'::jsonb),
    'hoy', (now() at time zone 'America/Lima')::date
  );
end $$;

-- ---------- Permisos: nada se escribe por fuera de las RPC ----------
alter table retail.ubicacion_metas_dia enable row level security;
alter table retail.campana_efecto_caja enable row level security;
alter table retail.configuracion_historial enable row level security;
drop policy if exists ubicacion_metas_dia_select on retail.ubicacion_metas_dia;
create policy ubicacion_metas_dia_select on retail.ubicacion_metas_dia for select to authenticated using ((select retail.fn_es_lider()));
drop policy if exists campana_efecto_caja_select on retail.campana_efecto_caja;
create policy campana_efecto_caja_select on retail.campana_efecto_caja for select to authenticated using ((select retail.fn_es_lider()));
drop policy if exists configuracion_historial_select on retail.configuracion_historial;
create policy configuracion_historial_select on retail.configuracion_historial for select to authenticated using ((select retail.fn_es_lider()));
revoke insert, update, delete, truncate on retail.ubicacion_metas_dia, retail.campana_efecto_caja, retail.configuracion_historial from public, anon, authenticated;
grant select on retail.ubicacion_metas_dia, retail.campana_efecto_caja, retail.configuracion_historial to authenticated;

revoke all on function retail.fn_parametros_caja(uuid, date) from public, anon;
revoke all on function retail.fn_meta_mes(uuid, date) from public, anon;
revoke all on function retail.guardar_metas_tienda(uuid, numeric[], numeric) from public, anon;
revoke all on function retail.guardar_efecto_campana(uuid, uuid, numeric, numeric) from public, anon;
revoke all on function retail.fn_configuracion_tiendas(date) from public, anon;
revoke all on function retail.fn_exigir_tienda_y_campana() from public, anon, authenticated;
revoke all on function retail.fn_anotar_fondo_requerido() from public, anon, authenticated;
grant execute on function retail.fn_parametros_caja(uuid, date) to authenticated;
grant execute on function retail.fn_meta_mes(uuid, date) to authenticated;
grant execute on function retail.guardar_metas_tienda(uuid, numeric[], numeric) to authenticated;
grant execute on function retail.guardar_efecto_campana(uuid, uuid, numeric, numeric) to authenticated;
grant execute on function retail.fn_configuracion_tiendas(date) to authenticated;
