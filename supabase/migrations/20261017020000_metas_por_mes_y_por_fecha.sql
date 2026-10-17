-- ============================================================================
-- 20261017020000 — Metas por mes y por fecha (ADR-0435)
--
-- EL PROBLEMA PRIMERO
--   La meta de una tienda hoy es UNA semana tipo (lunes a domingo) igual los 12 meses del año
--   (`ubicacion_metas_dia`, ADR-0195). Pero un día de la semana no vende lo mismo en octubre que en diciembre: en TRU
--   diciembre rinde ~1,9 veces un mes normal, y el 23, 24 y 31 de diciembre rinden ~2,1, 2,1 y 2,5 veces su día.
--   Con una sola semana, o diciembre queda con la meta de octubre (se cumple el día 10 y la tienda deja de empujar) o
--   alguien tiene que reescribir 14 casillas el día 1 de cada mes y, si se olvida, el mes entero queda mal. La
--   estimación que sustenta los números (modelo de nivel + mes + día, validado hacia atrás) está en el ADR-0435.
--
-- LO QUE AGREGA
--   1. `ubicacion_metas_mes`: la semana de UN mes concreto de una tienda (mes × día de la semana). Lo que está vacío en
--      un mes usa la semana tipo de siempre, así que un mes sin cargar sigue funcionando como hoy.
--   2. `ubicacion_metas_fecha`: la meta de UNA fecha (23, 24 y 31 de diciembre, un feriado). Gana sobre el mes y la semana
--      tipo. Meta 0 = esa fecha no tiene meta (la tienda no abre).
--   3. `fn_parametros_caja` pasa a ser un ENVOLTORIO: el cuerpo vigente se renombra `fn_parametros_caja_normal` (no se
--      reescribe una sola línea: así no hay que comparar md5 ni se pierde el parche de seguridad del 2026-10-15) y la
--      función pública decide la base del día: fecha > mes > semana tipo > `meta_venta_diaria`. La campaña (`meta_pct`)
--      sigue subiendo la base de mes y de semana tipo; en una FECHA la meta es final (quien la escribe ya pensó en la
--      campaña: el 24 de dic cae dentro de «Navidad» y duplicar el efecto sería contar dos veces lo mismo).
--   4. `guardar_metas_mes`, `guardar_meta_fecha` (escritura) y `fn_configuracion_metas` (lectura para la pantalla).
--      Mismo permiso que `guardar_metas_tienda`: el líder o quien tenga el módulo «Configuración» (`fn_puede_configurar`).
--      Firman con el responsable (`fn_actor_persona_id(true)`) y cada cambio queda en `configuracion_historial`.
--
-- ESTADOS IMPOSIBLES QUE CIERRA
--   · Una meta ≤ 0, `NaN` o de 10 millones o más — check (en la fecha, 0 sí vale: «sin meta»). `NaN` pasa un `> 0` en
--     Postgres; por eso el tope es `< 10000000`, que lo rechaza.
--   · Un mes que no es día 1, un día de la semana fuera de 0–6 — check.
--   · Una meta en algo que no es una tienda (Taller, almacén) — el mismo disparador de `ubicacion_metas_dia`.
--   · Reescribir la historia: no se guarda un mes anterior al actual ni una fecha pasada, y el horizonte es de 18 meses.
--   · Leer o escribir estas tablas por fuera de las funciones — RLS encendido SIN políticas y revoke.
--
-- LO QUE NO SE TOCA
--   · `ubicacion_metas_dia` y `guardar_metas_tienda`: la semana tipo sigue siendo la base y el respaldo.
--   · Quien lee la meta (Caja, Inicio, Observatorio, Finanzas, el disparador del fondo) llama a `fn_parametros_caja` como
--     siempre: no cambia ni una firma. `fn_meta_mes` (la suma de los días) recoge solo los meses y las fechas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS PARTES, CADA UNA EN SU EJECUCIÓN (ADR-0195, «Políticas y deadlocks»)
--   Ninguna parte crea políticas (RLS encendido sin políticas, todo por funciones `security definer`), así que no toma
--   en exclusiva las tablas de `auth` ni `storage`. Cada parte espera como mucho 3 s un candado y es idempotente.
--     PARTE 1 · las dos tablas, sus candados y sus permisos.
--     PARTE 2 · el envoltorio de `fn_parametros_caja` y las tres funciones. Después de pegarla, la meta de hoy se lee igual
--       que antes (no hay filas de mes ni de fecha hasta que alguien las cargue).
--   Con `set search_path` (ya está en cada parte), sin prefijo extra. Producción ya tiene 20261015222000 (la guardia
--   `sin_acceso_retail` de `fn_parametros_caja`): el envoltorio la repite, así que da igual qué versión haya debajo.
-- SE ROMPE SI: otra migración vuelve a hacer `create or replace function retail.fn_parametros_caja` (pisaría el
--   envoltorio y los meses y fechas dejarían de regir en silencio). La base se parcha en `fn_parametros_caja_normal`.
--   La prueba `pnpm pruebas:metas-mes-y-fecha` lo vigila.
-- ============================================================================

-- ============================== PARTE 1 · tablas ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.ubicacion_metas_mes (
  ubicacion_id    uuid not null references retail.ubicaciones (id),
  mes             date not null,
  dia_semana      smallint not null,
  meta            numeric(12,2) not null,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  primary key (ubicacion_id, mes, dia_semana),
  constraint ubicacion_metas_mes_primer_dia check (mes = date_trunc('month', mes)::date),
  constraint ubicacion_metas_mes_dia check (dia_semana between 0 and 6),
  constraint ubicacion_metas_mes_monto check (meta > 0 and meta < 10000000)
);
comment on table retail.ubicacion_metas_mes is
  'La semana de UN mes de una tienda: meta de cada día de la semana (0 = lunes), con IGV. Lo que falta en un mes usa la semana tipo (ubicacion_metas_dia). Solo tiendas. La escribe guardar_metas_mes; la lee fn_parametros_caja.';

create table if not exists retail.ubicacion_metas_fecha (
  ubicacion_id    uuid not null references retail.ubicaciones (id),
  fecha           date not null,
  meta            numeric(12,2) not null,
  nota            text,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  primary key (ubicacion_id, fecha),
  constraint ubicacion_metas_fecha_monto check (meta >= 0 and meta < 10000000),
  constraint ubicacion_metas_fecha_nota check (nota is null or char_length(nota) between 1 and 140)
);
comment on table retail.ubicacion_metas_fecha is
  'La meta de UNA fecha de una tienda (23, 24 y 31 de diciembre, un feriado), con IGV. Gana sobre el mes y la semana tipo y es final: no se le aplica el % de campaña. Meta 0 = esa fecha no tiene meta. Solo tiendas. La escribe guardar_meta_fecha; la lee fn_parametros_caja.';

-- Solo tiendas: el mismo disparador de ubicacion_metas_dia (no mira campañas en estas tablas).
create or replace trigger trg_metas_mes_solo_tienda before insert or update on retail.ubicacion_metas_mes
  for each row execute function retail.fn_exigir_tienda_y_campana();
create or replace trigger trg_metas_fecha_solo_tienda before insert or update on retail.ubicacion_metas_fecha
  for each row execute function retail.fn_exigir_tienda_y_campana();

-- Nadie las lee ni las escribe directo: RLS encendido y SIN políticas (ver la cabecera de 20260924210000).
alter table retail.ubicacion_metas_mes enable row level security;
alter table retail.ubicacion_metas_fecha enable row level security;
revoke all on retail.ubicacion_metas_mes, retail.ubicacion_metas_fecha from public, anon, authenticated;
reset lock_timeout;

-- ============================== PARTE 2 · funciones ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 3. El envoltorio ----------
-- El cuerpo vigente pasa a `fn_parametros_caja_normal` SIN reescribirlo. Si ya se renombró (se pegó dos veces), no hace nada.
do $$
begin
  if to_regprocedure('retail.fn_parametros_caja_normal(uuid,date)') is null then
    alter function retail.fn_parametros_caja(uuid, date) rename to fn_parametros_caja_normal;
  end if;
end $$;
revoke all on function retail.fn_parametros_caja_normal(uuid, date) from public, anon, authenticated;

-- Cuerpo: (1) la misma guardia que 20261015222000, repetida aquí para no depender de qué versión haya debajo; (2) una FECHA concreta gana y es
-- final (0 = sin meta ese día); (3) la semana de ese MES reemplaza la base y la campaña la sube igual que antes; (4) si no, la semana tipo.
-- Los comentarios van aquí, no dentro del cuerpo: lo pegado en producción el 2026-10-17 no los llevaba y la huella de la función tiene que coincidir.
create or replace function retail.fn_parametros_caja(p_ubicacion_id uuid, p_fecha date)
returns table (meta numeric, meta_base numeric, meta_pct numeric, fondo numeric, fondo_base numeric, campanas jsonb)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare n record; v_fecha numeric; v_mes numeric;
begin
  if auth.uid() is not null and not retail.fn_tiene_acceso_retail() then
    raise exception 'Esta cuenta no es del equipo de retail.' using errcode = '42501', hint = 'sin_acceso_retail';
  end if;

  select * into n from retail.fn_parametros_caja_normal(p_ubicacion_id, p_fecha);

  select f.meta into v_fecha from retail.ubicacion_metas_fecha f where f.ubicacion_id = p_ubicacion_id and f.fecha = p_fecha;
  if found then
    return query select case when v_fecha = 0 then null::numeric else v_fecha end,
                        case when v_fecha = 0 then null::numeric else v_fecha end,
                        0::numeric, n.fondo, n.fondo_base, n.campanas;
    return;
  end if;

  select m.meta into v_mes from retail.ubicacion_metas_mes m
   where m.ubicacion_id = p_ubicacion_id and m.mes = date_trunc('month', p_fecha)::date
     and m.dia_semana = extract(isodow from p_fecha)::int - 1;
  if found then
    return query select round(v_mes * (1 + n.meta_pct / 100)), v_mes, n.meta_pct, n.fondo, n.fondo_base, n.campanas;
    return;
  end if;

  return query select n.meta, n.meta_base, n.meta_pct, n.fondo, n.fondo_base, n.campanas;
end $$;
comment on function retail.fn_parametros_caja(uuid, date) is
  'La meta del día y el fondo de caja que rigen en una tienda una fecha (ADR-0435). Base del día: la fecha concreta (ubicacion_metas_fecha, final) > la semana de ese mes (ubicacion_metas_mes) > la semana tipo (ubicacion_metas_dia) > meta_venta_diaria. El % de campaña sube la base de mes y de semana tipo. Envuelve a fn_parametros_caja_normal: la base se parcha allá.';

revoke all on function retail.fn_parametros_caja(uuid, date) from public, anon;
grant execute on function retail.fn_parametros_caja(uuid, date) to authenticated;

-- ---------- 4a. Escribir la semana de un mes ----------
-- p_metas: 7 valores, lunes a domingo; null o 0 = ese día usa la semana tipo. p_mes: cualquier día del mes (se toma el mes).
-- Dentro del cuerpo, el candado de la tienda (`for update`) evita que dos personas guardando a la vez se mezclen. Sin comentarios adentro:
-- así quedó pegada en producción el 2026-10-17 y la huella tiene que coincidir.
create or replace function retail.guardar_metas_mes(p_ubicacion_id uuid, p_mes date, p_metas numeric[])
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true); v_mes date; v_hoy date := (now() at time zone 'America/Lima')::date;
        v_antes jsonb; i int;
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Cambiar las metas necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  if p_mes is null then raise exception 'Falta el mes.' using errcode = 'P0001'; end if;
  v_mes := date_trunc('month', p_mes)::date;
  if v_mes < date_trunc('month', v_hoy)::date then
    raise exception 'No se cambia la meta de un mes que ya pasó.' using errcode = 'P0001', hint = 'meta_mes_pasado';
  end if;
  if v_mes > (date_trunc('month', v_hoy) + interval '18 months')::date then
    raise exception 'La meta puede ponerse hasta 18 meses adelante.' using errcode = 'P0001', hint = 'meta_mes_lejano';
  end if;
  if p_metas is null or array_length(p_metas, 1) is distinct from 7 then
    raise exception 'Faltan las metas de los 7 días de la semana.' using errcode = 'P0001';
  end if;
  for i in 1..7 loop
    if p_metas[i] is not null and (p_metas[i] = 'NaN'::numeric or p_metas[i] < 0 or p_metas[i] >= 10000000) then
      raise exception 'Una meta tiene que ser un monto positivo y menor a 10 millones.' using errcode = 'P0001', hint = 'meta_invalida';
    end if;
  end loop;

  perform 1 from retail.ubicaciones where id = p_ubicacion_id for update;
  if not found then raise exception 'Esa tienda no existe.' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(meta order by dia_semana), '[]'::jsonb) into v_antes
    from retail.ubicacion_metas_mes where ubicacion_id = p_ubicacion_id and mes = v_mes;

  for i in 1..7 loop
    if p_metas[i] is null or p_metas[i] = 0 then
      delete from retail.ubicacion_metas_mes where ubicacion_id = p_ubicacion_id and mes = v_mes and dia_semana = i - 1;
    else
      insert into retail.ubicacion_metas_mes (ubicacion_id, mes, dia_semana, meta, actualizado_por, actualizado_en)
      values (p_ubicacion_id, v_mes, i - 1, p_metas[i], v_actor, now())
      on conflict (ubicacion_id, mes, dia_semana) do update
        set meta = excluded.meta, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
    end if;
  end loop;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('metas_mes', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'mes', v_mes, 'antes', v_antes, 'despues', to_jsonb(p_metas)), v_actor);
end $$;

-- ---------- 4b. Escribir la meta de una fecha ----------
-- p_meta: null = quitar la fecha (vuelve a regir el mes); 0 = esa fecha no tiene meta; > 0 = la meta final de ese día.
create or replace function retail.guardar_meta_fecha(p_ubicacion_id uuid, p_fecha date, p_meta numeric, p_nota text default null)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true); v_hoy date := (now() at time zone 'America/Lima')::date;
        v_antes jsonb; v_nota text := nullif(btrim(p_nota), '');
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Cambiar las metas necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  if p_fecha is null then raise exception 'Falta la fecha.' using errcode = 'P0001'; end if;
  if p_fecha < v_hoy then
    raise exception 'No se cambia la meta de una fecha que ya pasó.' using errcode = 'P0001', hint = 'meta_fecha_pasada';
  end if;
  if p_fecha > (v_hoy + interval '18 months')::date then
    raise exception 'La meta puede ponerse hasta 18 meses adelante.' using errcode = 'P0001', hint = 'meta_fecha_lejana';
  end if;
  if p_meta is not null and (p_meta = 'NaN'::numeric or p_meta < 0 or p_meta >= 10000000) then
    raise exception 'La meta tiene que ser un monto positivo y menor a 10 millones (0 = sin meta ese día).' using errcode = 'P0001', hint = 'meta_invalida';
  end if;
  if v_nota is not null and char_length(v_nota) > 140 then
    raise exception 'La nota puede tener hasta 140 letras.' using errcode = 'P0001', hint = 'nota_larga';
  end if;

  perform 1 from retail.ubicaciones where id = p_ubicacion_id for update;
  if not found then raise exception 'Esa tienda no existe.' using errcode = 'P0001'; end if;

  select jsonb_build_object('meta', f.meta, 'nota', f.nota) into v_antes
    from retail.ubicacion_metas_fecha f where f.ubicacion_id = p_ubicacion_id and f.fecha = p_fecha;

  if p_meta is null then
    delete from retail.ubicacion_metas_fecha where ubicacion_id = p_ubicacion_id and fecha = p_fecha;
  else
    insert into retail.ubicacion_metas_fecha (ubicacion_id, fecha, meta, nota, actualizado_por, actualizado_en)
    values (p_ubicacion_id, p_fecha, p_meta, v_nota, v_actor, now())
    on conflict (ubicacion_id, fecha) do update
      set meta = excluded.meta, nota = excluded.nota, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
  end if;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('meta_fecha', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'fecha', p_fecha, 'antes', v_antes,
          'despues', case when p_meta is null then null else jsonb_build_object('meta', p_meta, 'nota', v_nota) end), v_actor);
end $$;

-- ---------- 4c. Lectura para Configuración ▸ Tiendas y caja ----------
-- Desde el mes de p_desde, p_meses meses (1 a 18): por tienda, la semana tipo, la semana de cada mes (null = usa la tipo) y la
-- meta del mes (la suma de los días, con fechas y campañas); y todas las fechas con meta de hoy en adelante.
create or replace function retail.fn_configuracion_metas(p_desde date default (now() at time zone 'America/Lima')::date, p_meses int default 6)
returns jsonb language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v_desde date := date_trunc('month', coalesce(p_desde, (now() at time zone 'America/Lima')::date))::date;
        v_meses int := least(greatest(coalesce(p_meses, 6), 1), 18);
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Ver la configuración necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'meses', (select jsonb_agg((v_desde + (g || ' months')::interval)::date order by g) from generate_series(0, v_meses - 1) g),
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'nombre', u.nombre,
        'tipica', (select jsonb_agg((select m.meta from retail.ubicacion_metas_dia m where m.ubicacion_id = u.id and m.dia_semana = d) order by d)
                     from generate_series(0, 6) d),
        'meses', (select jsonb_object_agg(to_char(x.primero, 'YYYY-MM-DD'), jsonb_build_object(
                    'metas', (select jsonb_agg((select mm.meta from retail.ubicacion_metas_mes mm where mm.ubicacion_id = u.id and mm.mes = x.primero and mm.dia_semana = d) order by d)
                                from generate_series(0, 6) d),
                    'total', retail.fn_meta_mes(u.id, x.primero)))
                  from (select (v_desde + (g || ' months')::interval)::date as primero from generate_series(0, v_meses - 1) g) x)
      ) order by u.nombre)
      from retail.ubicaciones u where u.tipo = 'tienda' and u.activo), '[]'::jsonb),
    'fechas', coalesce((
      select jsonb_agg(jsonb_build_object('ubicacion_id', f.ubicacion_id, 'fecha', f.fecha, 'meta', f.meta, 'nota', f.nota) order by f.fecha, f.ubicacion_id)
        from retail.ubicacion_metas_fecha f where f.fecha >= (now() at time zone 'America/Lima')::date), '[]'::jsonb),
    'hoy', (now() at time zone 'America/Lima')::date
  );
end $$;

revoke all on function retail.guardar_metas_mes(uuid, date, numeric[]) from public, anon;
revoke all on function retail.guardar_meta_fecha(uuid, date, numeric, text) from public, anon;
revoke all on function retail.fn_configuracion_metas(date, int) from public, anon;
grant execute on function retail.guardar_metas_mes(uuid, date, numeric[]) to authenticated;
grant execute on function retail.guardar_meta_fecha(uuid, date, numeric, text) to authenticated;
grant execute on function retail.fn_configuracion_metas(date, int) to authenticated;
reset lock_timeout;
