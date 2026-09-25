-- ============================================================================
-- 20260925190000 — Presupuesto: topes de gasto por unidad y rubro, contra lo real y proyectado al cierre (ADR-0195,
-- capa «para decidir»; PLAN-FINANZAS §6 bis y §7 ter; spike `vista-reportes.js` y `vista-config.js`, «Presupuesto»)
--
-- EL PROBLEMA PRIMERO
--   Felipe se entera de que el mes se le fue en suministros o en luz recién cuando el mes cierra, y ya no hay nada que
--   hacer. Quiere poner, por tienda, el Taller y la empresa, cuánto piensa gastar en cada rubro, y ver A TIEMPO —con el
--   mes corriendo— en qué se está pasando y si las ventas van camino a la meta. Nadie queda bloqueado por pasarse: el
--   presupuesto avisa, no frena.
--
-- LAS REGLAS
--   1. `presupuestos` guarda UN tope por mes, unidad (tienda, Taller o «de la empresa» = ubicación nula) y LÍNEA del
--      Estado de resultados. La línea es la CUENTA de gasto (635 alquileres, 636 servicios…), la misma con que
--      `fn_estado_resultados` (F5) suma lo real: así el tope y lo real hablan de lo mismo aunque mañana dos categorías de
--      gasto compartan cuenta. Solo llevan tope las cuentas de las categorías de gasto: ni la planilla (la decide
--      Dynamic), ni la depreciación, ni las ventas.
--   2. UNA SOLA META: la meta de ventas del mes NO se escribe aquí. Es `fn_meta_mes` (F1), la suma de las metas de cada
--      día con sus campañas, llevada a sin IGV (el Estado de resultados cuenta las ventas sin IGV). Si hubiera una meta
--      en Presupuesto y otra en Tiendas y caja, un día dirían cosas distintas.
--   3. Una casilla vacía es «sin tope». Nada se borra: vaciar una casilla deja la fila con monto nulo, y cada cambio
--      queda en `configuracion_historial` con el antes y el después, firmado con el responsable
--      (`fn_actor_persona_id(true)`). Solo el líder escribe (`fn_es_lider()`).
--   4. «Copiar del mes anterior» y «Sugerir según los últimos 3 meses» son FUNCIONES QUE PROPONEN
--      (`fn_presupuesto_propuesta`): no guardan nada. Lo propuesto se ve, y recién al confirmar se guarda de una vez
--      (`guardar_presupuesto_lote`, con UNA fila de historial que lista cada casilla que cambió).
--   5. Quién ve el presupuesto contra lo real: lo mismo que el Estado de resultados (`fn_diario_ubicaciones`): el líder,
--      todo, «de la empresa» y CAYLA (la suma exacta de las unidades); con el módulo «Reportes financieros», SU tienda.
--
-- LA PROYECCIÓN AL CIERRE (`fn_presupuesto_vs_real`), la regla en palabras
--   · Mes que ya terminó: al cierre = lo real. Mes que no empezó: no hay proyección.
--   · Mes en curso, día d de n (hoy cuenta como día transcurrido; lo real incluye lo de hoy):
--       - VENTAS de una tienda con meta: se cierra al mismo % de la meta que se lleva hoy.
--           al cierre = vendido a la fecha ÷ meta de los días 1..d × meta del mes
--         (así un fin de semana o una campaña que todavía no llegan pesan lo que pesan en la meta). Sin meta: al ritmo de
--         los días, vendido ÷ d × n.
--       - GASTOS de un rubro: lo FIJO entra entero y lo demás al ritmo de hoy.
--           al cierre = fijos ya registrados + fijos que faltan + (lo demás ÷ d × n)
--         «Fijos» son los de Gastos ▸ Fijos del mes (F2b): los que ya llegaron se cuentan como llegaron (sin IGV, como los
--         asienta el diario) y los que faltan, por su monto esperado sin el IGV de la factura. Si lo demás es negativo (una
--         nota de crédito), no se proyecta: se suma tal cual.
--   · El estado: un tope con proyección > 105 % «se pasa»; entre 100 % y 105 %, «al filo»; si no, «dentro». Una meta con
--     proyección < 95 % va «bajo la meta»; si no, «en camino» (y un mes cerrado, «cumplida» si llegó al 100 %).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN (con `set search_path`, sin prefijo extra)
--   Una tabla NUEVA (vacía, sin uso) y funciones nuevas. No hay `alter` de ninguna tabla que use la tienda ni políticas
--   (la tabla tiene RLS encendido y sin políticas: se lee y se escribe solo por funciones). Las FK a `ubicaciones` y
--   `cuentas` toman un candado compartido compatible con quien lee; `lock_timeout` de 3 s: si falla, se vuelve a pegar
--   entera (es idempotente). Antes: F1 (20260924210000: `fn_meta_mes`, `configuracion_historial`), F2a/F2b
--   (`categorias_gasto`, `gastos_fijos`) y F5 (20260925130000: `fn_estado_resultados`, `fn_diario_ubicaciones`).
--   Después: publicar la web (la de hoy no llama nada de esto: no se rompe si se pega antes).
-- SE ROMPE SI
--   · Se cambia la cuenta de una categoría de gasto: los topes viejos quedan en la cuenta de antes (el rubro sigue
--     visible ese mes, con su nombre de cuenta) y hay que volver a ponerlos en la nueva.
--   · Cambia la tasa de IGV a mitad de mes: la meta sin IGV usa la tasa del día 1 del mes.
--   · F9 cierra un mes: hoy el presupuesto de un mes cerrado todavía se puede cambiar (queda en la historia). F9 decide
--     si lo congela.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La tabla ----------
create table if not exists retail.presupuestos (
  id              uuid primary key default gen_random_uuid(),
  mes             date not null check (mes = date_trunc('month', mes)::date),
  ubicacion_id    uuid references retail.ubicaciones (id),              -- null = «De la empresa» (D-32)
  cuenta          text not null references retail.cuentas (codigo),     -- la línea del Estado de resultados
  monto           numeric(12,2) check (monto is null or monto > 0),     -- el tope, sin IGV; null = sin tope (se vació)
  creado_por      uuid,
  creado_en       timestamptz not null default now(),
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  constraint presupuestos_una_casilla unique nulls not distinct (mes, ubicacion_id, cuenta)
);
comment on table retail.presupuestos is
  'Presupuesto (ADR-0195): el tope de gasto de cada mes, unidad (tienda, Taller o empresa = null) y cuenta de gasto, sin IGV. Null = sin tope. La meta de ventas NO vive aquí: es fn_meta_mes (suma de las metas del día). Solo se escribe por guardar_presupuesto / guardar_presupuesto_lote (líder); nunca se borra.';

-- Candados: solo tiendas y el Taller (o la empresa), solo cuentas de categorías de gasto, y una casilla no se muda.
create or replace function retail.fn_presupuestos_validar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text;
begin
  if tg_op = 'UPDATE' and (new.mes, new.ubicacion_id, new.cuenta) is distinct from (old.mes, old.ubicacion_id, old.cuenta) then
    raise exception 'Una casilla del presupuesto no cambia de mes, de unidad ni de rubro.' using errcode = 'P0001';
  end if;
  if new.ubicacion_id is not null then
    select u.tipo into v_tipo from retail.ubicaciones u where u.id = new.ubicacion_id;
    if v_tipo is distinct from 'tienda' and v_tipo is distinct from 'taller' then
      raise exception 'El presupuesto es de una tienda, del Taller o de la empresa.' using errcode = 'P0001';
    end if;
  end if;
  if not exists (select 1 from retail.categorias_gasto k where k.cuenta_pcge = new.cuenta) then
    raise exception 'Solo los rubros de gasto llevan tope (la cuenta % no es de ninguna categoría de gasto). La meta de ventas no se escribe: es la suma de las metas del día.', new.cuenta
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger trg_presupuestos_validar before insert or update on retail.presupuestos
  for each row execute function retail.fn_presupuestos_validar();

create or replace function retail.fn_presupuestos_no_se_borran() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Una casilla del presupuesto no se borra: se vacía (sin tope) y el cambio queda en la historia.' using errcode = 'P0001';
end $$;
create or replace trigger trg_presupuestos_no_se_borran before delete on retail.presupuestos
  for each row execute function retail.fn_presupuestos_no_se_borran();

-- ---------- 2. Las líneas que llevan tope ----------
-- Una por CUENTA de las categorías de gasto activas (si dos categorías comparten cuenta, una sola línea con los dos
-- nombres), más las que ese mes ya tienen un tope aunque su categoría se haya desactivado (su historia se sigue viendo).
create or replace function retail.fn_presupuesto_lineas(p_mes date)
returns table (cuenta text, nombre text, ejemplos text, orden integer)
language sql stable security definer set search_path = retail, public, extensions as $$
  select k.cuenta_pcge::text,
         string_agg(k.nombre, ' · ' order by k.orden),
         coalesce(string_agg(nullif(k.ejemplos, ''), ' · ' order by k.orden), ''),
         min(k.orden)::integer
    from retail.categorias_gasto k
   where k.activo
      or exists (select 1 from retail.presupuestos p
                  where p.cuenta = k.cuenta_pcge and p.mes = date_trunc('month', p_mes)::date and p.monto is not null)
   group by k.cuenta_pcge;
$$;

-- ---------- 3. Escribir (solo el líder, firma con el responsable) ----------
-- Una casilla: p_monto nulo o 0 = sin tope. Sin cambio = no hace nada (ni historial).
create or replace function retail.guardar_presupuesto(p_mes date, p_ubicacion_id uuid, p_cuenta text, p_monto numeric)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_mes date := date_trunc('month', p_mes)::date;
  v_monto numeric := nullif(round(p_monto, 2), 0);
  v_antes numeric;
  v_existe boolean;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder pone el presupuesto.' using errcode = '42501';
  end if;
  if p_mes is null or p_cuenta is null then
    raise exception 'Falta el mes o el rubro.' using errcode = 'P0001';
  end if;
  if p_monto < 0 then
    raise exception 'Un tope no puede ser negativo.' using errcode = 'P0001';
  end if;

  select pr.monto, true into v_antes, v_existe
    from retail.presupuestos pr
   where pr.mes = v_mes and pr.ubicacion_id is not distinct from p_ubicacion_id and pr.cuenta = p_cuenta
   for update;
  if (v_existe is null and v_monto is null) or (v_existe and v_antes is not distinct from v_monto) then
    return;   -- nada cambia
  end if;

  insert into retail.presupuestos (mes, ubicacion_id, cuenta, monto, creado_por, actualizado_por)
  values (v_mes, p_ubicacion_id, p_cuenta, v_monto, v_actor, v_actor)
  on conflict (mes, ubicacion_id, cuenta) do update
    set monto = excluded.monto, actualizado_por = excluded.actualizado_por, actualizado_en = now();

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('presupuesto', jsonb_build_object('mes', v_mes, 'ubicacion_id', p_ubicacion_id, 'cuenta', p_cuenta,
                                            'antes', v_antes, 'despues', v_monto), v_actor);
end $$;

-- Varias casillas de una vez (lo que se vio en una propuesta y se confirmó): p_filas = [{ubicacion_id, cuenta, monto}].
-- Todo o nada, y UNA fila de historial con cada casilla que cambió. Devuelve cuántas cambiaron.
create or replace function retail.guardar_presupuesto_lote(p_mes date, p_filas jsonb, p_origen text)
returns integer language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_mes date := date_trunc('month', p_mes)::date;
  v_cambios jsonb := '[]'::jsonb;
  x jsonb;
  v_u uuid;
  v_c text;
  v_m numeric;
  v_antes numeric;
  v_existe boolean;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder pone el presupuesto.' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'Falta el mes.' using errcode = 'P0001';
  end if;
  if p_origen is null or p_origen not in ('mes_anterior', 'promedio_3_meses') then
    raise exception 'No se sabe de dónde sale esta propuesta.' using errcode = 'P0001';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay nada que aplicar.' using errcode = 'P0001';
  end if;

  for x in select * from jsonb_array_elements(p_filas) loop
    v_u := nullif(x ->> 'ubicacion_id', '')::uuid;
    v_c := x ->> 'cuenta';
    v_m := (x ->> 'monto')::numeric;
    if v_c is null then
      raise exception 'Falta el rubro de una casilla.' using errcode = 'P0001';
    end if;
    if v_m < 0 then
      raise exception 'Un tope no puede ser negativo.' using errcode = 'P0001';
    end if;
    v_m := nullif(round(v_m, 2), 0);
    v_antes := null;
    v_existe := null;
    select pr.monto, true into v_antes, v_existe
      from retail.presupuestos pr
     where pr.mes = v_mes and pr.ubicacion_id is not distinct from v_u and pr.cuenta = v_c
     for update;
    continue when (v_existe is null and v_m is null) or (v_existe and v_antes is not distinct from v_m);

    insert into retail.presupuestos (mes, ubicacion_id, cuenta, monto, creado_por, actualizado_por)
    values (v_mes, v_u, v_c, v_m, v_actor, v_actor)
    on conflict (mes, ubicacion_id, cuenta) do update
      set monto = excluded.monto, actualizado_por = excluded.actualizado_por, actualizado_en = now();
    v_cambios := v_cambios || jsonb_build_array(jsonb_build_object('ubicacion_id', v_u, 'cuenta', v_c, 'antes', v_antes, 'despues', v_m));
  end loop;

  if jsonb_array_length(v_cambios) > 0 then
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('presupuesto_propuesta', jsonb_build_object('mes', v_mes, 'origen', p_origen, 'cambios', v_cambios), v_actor);
  end if;
  return jsonb_array_length(v_cambios);
end $$;

-- ---------- 4. Proponer (NO guarda nada) ----------
-- 'mes_anterior': los topes del mes anterior, tal cual. 'promedio_3_meses': lo gastado (sin IGV, del Estado de resultados)
-- en los 3 últimos meses COMPLETOS antes del mes elegido —nunca el que está en curso—, dividido entre 3 y redondeado hacia
-- arriba a la decena. Cada fila trae lo que hay hoy en esa casilla (`actual`) para que la pantalla muestre qué cambia.
-- Solo rubros de gasto activos y unidades activas; lo que la propuesta no trae, se queda como está. `p_hoy` (por defecto,
-- hoy en Lima) solo existe para probar: dice cuál es el mes en curso.
create or replace function retail.fn_presupuesto_propuesta(p_mes date, p_origen text, p_hoy date default null)
returns table (ubicacion_id uuid, cuenta text, actual numeric, propuesto numeric, desde date, hasta date)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_hasta date;
  v_desde date;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder pone el presupuesto.' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'Falta el mes.' using errcode = 'P0001';
  end if;

  if p_origen = 'mes_anterior' then
    v_desde := (v_mes - interval '1 month')::date;
    v_hasta := (v_mes - 1);
    return query
    select a.ubicacion_id, a.cuenta, h.monto, a.monto, v_desde, v_hasta
      from retail.presupuestos a
      left join retail.presupuestos h on h.mes = v_mes and h.ubicacion_id is not distinct from a.ubicacion_id and h.cuenta = a.cuenta
      left join retail.ubicaciones u on u.id = a.ubicacion_id
     where a.mes = v_desde and a.monto is not null
       and exists (select 1 from retail.categorias_gasto k where k.activo and k.cuenta_pcge = a.cuenta)
       and (a.ubicacion_id is null or u.activo)
     order by u.nombre nulls last, a.cuenta;
  elsif p_origen = 'promedio_3_meses' then
    v_hasta := (least(v_mes, date_trunc('month', coalesce(p_hoy, retail.fn_hoy_lima()))::date) - 1);
    v_desde := (date_trunc('month', v_hasta) - interval '2 months')::date;
    return query
    with er as (
      select * from retail.fn_estado_resultados(v_desde, v_hasta) e where e.unidad <> 'consolidado'
    ),
    g as (
      select e.ubicacion_id as u, x ->> 'cuenta' as cta, sum((x ->> 'monto')::numeric) as total
        from er e, jsonb_array_elements(e.detalle_gastos) x
       group by 1, 2
    )
    select g.u, g.cta, h.monto, (ceil(g.total / 3 / 10) * 10)::numeric, v_desde, v_hasta
      from g
      left join retail.presupuestos h on h.mes = v_mes and h.ubicacion_id is not distinct from g.u and h.cuenta = g.cta
      left join retail.ubicaciones u on u.id = g.u
     where g.total > 0
       and exists (select 1 from retail.categorias_gasto k where k.activo and k.cuenta_pcge = g.cta)
       and (g.u is null or (u.activo and u.tipo in ('tienda', 'taller')))
     order by u.nombre nulls last, g.cta;
  else
    raise exception 'Se puede proponer desde el mes anterior o desde el promedio de 3 meses.' using errcode = 'P0001';
  end if;
end $$;

-- ---------- 5. Leer para Configuración ▸ Presupuesto (solo el líder) ----------
create or replace function retail.fn_presupuesto_configuracion(p_mes date)
returns jsonb language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_mes date := date_trunc('month', coalesce(p_mes, retail.fn_hoy_lima()))::date;
  v_tasa numeric := retail.fn_tasa_igv(date_trunc('month', coalesce(p_mes, retail.fn_hoy_lima()))::date);
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder ve la configuración.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mes', v_mes,
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'unidad', z.unidad, 'meta_ventas', z.meta) order by z.ord, z.nombre)
        from (
          select u.id, u.nombre, case u.tipo when 'taller' then 'taller' else 'tienda' end as unidad,
                 case u.tipo when 'taller' then 2 else 1 end as ord,
                 case when u.tipo = 'tienda' then round(retail.fn_meta_mes(u.id, v_mes) / (1 + v_tasa), 2) end as meta
            from retail.ubicaciones u
           where u.tipo in ('tienda', 'taller')
             and (u.activo or exists (select 1 from retail.presupuestos p where p.mes = v_mes and p.ubicacion_id = u.id and p.monto is not null))
          union all
          select null::uuid, 'De la empresa', 'empresa', 3, null::numeric
        ) z), '[]'::jsonb),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('cuenta', l.cuenta, 'nombre', l.nombre, 'ejemplos', l.ejemplos) order by l.orden, l.cuenta)
        from retail.fn_presupuesto_lineas(v_mes) l), '[]'::jsonb),
    'montos', coalesce((
      select jsonb_agg(jsonb_build_object('ubicacion_id', p.ubicacion_id, 'cuenta', p.cuenta, 'monto', p.monto))
        from retail.presupuestos p where p.mes = v_mes and p.monto is not null), '[]'::jsonb),
    'anterior', (select count(*) from retail.presupuestos p where p.mes = (v_mes - interval '1 month')::date and p.monto is not null)
  );
end $$;

-- ---------- 6. Presupuesto contra lo real, y la proyección al cierre ----------
-- CONTRATO. Una fila por unidad y línea: la de ventas (tipo 'meta') de cada tienda —y de cualquier unidad que haya
-- vendido— y la de cada rubro de gasto que tenga tope, gasto o un fijo por llegar (tipo 'tope'). Para el líder sin
-- filtro, además CAYLA (unidad 'consolidado'), la suma exacta de las unidades. `p_hoy` (por defecto, hoy en Lima) solo
-- existe para probar: fija el día de corte. Lo real sale de `fn_estado_resultados` (F5), del día 1 al de corte.
create or replace function retail.fn_presupuesto_vs_real(p_mes date, p_ubicacion_id uuid default null, p_hoy date default null)
returns table (
  ubicacion_id uuid, unidad text, nombre text, orden integer,
  linea text, linea_nombre text, tipo text, orden_linea integer,
  presupuesto numeric, a_la_fecha numeric, proyeccion numeric, fijo numeric,
  avance numeric, se_pasa boolean, estado text,
  momento text, dia integer, dias integer
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_hoy date := coalesce(p_hoy, retail.fn_hoy_lima());
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_ini date;
  v_fin date;
  v_dias integer;
  v_dia integer;
  v_momento text;
  v_corte date;
  v_tasa numeric;
begin
  if p_mes is null then
    raise exception 'Falta el mes.' using errcode = 'P0001';
  end if;
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el presupuesto necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  v_ini := date_trunc('month', p_mes)::date;
  v_fin := (v_ini + interval '1 month - 1 day')::date;
  v_dias := extract(day from v_fin)::integer;
  v_tasa := retail.fn_tasa_igv(v_ini);
  if v_hoy < v_ini then
    v_momento := 'por_venir'; v_dia := 0;
  elsif v_hoy > v_fin then
    v_momento := 'cerrado'; v_dia := v_dias;
  else
    v_momento := 'en_curso'; v_dia := extract(day from v_hoy)::integer;
  end if;
  v_corte := greatest(v_ini, least(v_hoy, v_fin));

  return query
  with
  -- Lo real: el Estado de resultados del día 1 al de corte (un mes por venir no tiene nada todavía).
  er as materialized (
    select e.* from retail.fn_estado_resultados(v_ini, v_corte, p_ubicacion_id) e
     where v_momento <> 'por_venir' and e.unidad <> 'consolidado'
  ),
  -- Las unidades: las del Estado de resultados, más las tiendas y el Taller activos (o con tope ese mes), más la empresa.
  unid as (
    select e.ubicacion_id as u, e.unidad as un, e.nombre as nom, e.orden as ord from er e
    union
    select ub.id, case ub.tipo when 'taller' then 'taller' else 'tienda' end, ub.nombre, case ub.tipo when 'taller' then 2 else 1 end
      from retail.ubicaciones ub
     where ub.tipo in ('tienda', 'taller')
       and ((v_todo and (ub.activo or exists (select 1 from retail.presupuestos p where p.mes = v_ini and p.ubicacion_id = ub.id and p.monto is not null)))
            or (not v_todo and ub.id = any (v_ubics)))
    union
    select null::uuid, 'empresa'::text, 'De la empresa'::text, 3 where v_todo
  ),
  lin as (select l.cuenta as cta, l.nombre as lnom, l.orden as lord from retail.fn_presupuesto_lineas(v_ini) l),
  topes as (select p.ubicacion_id as u, p.cuenta as cta, p.monto from retail.presupuestos p where p.mes = v_ini and p.monto is not null),
  gasto_real as (
    select e.ubicacion_id as u, x ->> 'cuenta' as cta, sum((x ->> 'monto')::numeric) as monto
      from er e, jsonb_array_elements(e.detalle_gastos) x
     group by 1, 2
  ),
  -- Lo fijo que ya llegó (sin IGV, como lo asienta el diario).
  fijo_real as (
    select g.ubicacion_id as u, k.cuenta_pcge as cta, sum(g.monto_total - g.igv) as monto
      from retail.gastos g join retail.categorias_gasto k on k.codigo = g.categoria
     where v_momento = 'en_curso' and g.estado = 'vigente' and g.gasto_fijo_id is not null
       and g.fecha between v_ini and v_corte
     group by 1, 2
  ),
  -- Lo fijo que falta: cada fijo activo sin gasto este mes, por su monto esperado sin el IGV de su factura (o el gasto ya
  -- registrado con fecha posterior al corte, por lo que se registró).
  fijo_pend as (
    select f.ubicacion_id as u, k.cuenta_pcge as cta,
           sum(case when g.id is not null then g.monto_total - g.igv
                    when f.comprobante_tipo = 'factura' then f.monto - round(f.monto - f.monto / (1 + v_tasa), 2)
                    else f.monto end) as monto
      from retail.gastos_fijos f
      join retail.categorias_gasto k on k.codigo = f.categoria
      left join lateral (
        select x.id, x.fecha, x.monto_total, x.igv from retail.gastos x
         where x.gasto_fijo_id = f.id and x.estado = 'vigente' and x.fecha between v_ini and v_fin
         order by x.fecha limit 1
      ) g on true
     where v_momento = 'en_curso' and f.activo and (g.id is null or g.fecha > v_corte)
     group by 1, 2
  ),
  g_lineas as (
    select un.u, un.un, un.nom, un.ord, l.cta, l.lnom, l.lord,
           t.monto as pres, coalesce(gr.monto, 0) as re, coalesce(fr.monto, 0) as fre, coalesce(fp.monto, 0) as fpe
      from unid un
      cross join lin l
      left join topes t on t.u is not distinct from un.u and t.cta = l.cta
      left join gasto_real gr on gr.u is not distinct from un.u and gr.cta = l.cta
      left join fijo_real fr on fr.u is not distinct from un.u and fr.cta = l.cta
      left join fijo_pend fp on fp.u is not distinct from un.u and fp.cta = l.cta
     where t.monto is not null or coalesce(gr.monto, 0) <> 0 or coalesce(fp.monto, 0) <> 0
  ),
  -- La meta del mes es la de F1 (una sola meta), sin IGV; la de los días 1..corte, con la misma regla día por día.
  metas as (
    select un.u,
           round(retail.fn_meta_mes(un.u, v_ini) / (1 + v_tasa), 2) as meta_mes,
           case when v_momento = 'en_curso' then
             round((select sum(pc.meta) from generate_series(v_ini, v_corte, interval '1 day') d,
                            lateral retail.fn_parametros_caja(un.u, d::date) pc) / (1 + v_tasa), 2)
           end as meta_fecha
      from unid un where un.un = 'tienda' and un.u is not null
  ),
  v_lineas as (
    select un.u, un.un, un.nom, un.ord, m.meta_mes, m.meta_fecha, coalesce(e.ventas_netas, 0) as re
      from unid un
      left join er e on e.ubicacion_id is not distinct from un.u and e.unidad = un.un
      left join metas m on m.u is not distinct from un.u
     where un.un = 'tienda' or m.meta_mes is not null or coalesce(e.ventas_netas, 0) <> 0
  ),
  todas as (
    select v.u, v.un, v.nom, v.ord, 'ventas'::text as lin, 'Ventas'::text as lnom, 'meta'::text as tp, 0 as lord,
           v.meta_mes as pres, v.re,
           case v_momento
             when 'por_venir' then null
             when 'cerrado' then v.re
             else round(case when v.meta_fecha > 0 and v.meta_mes > 0 then v.re * v.meta_mes / v.meta_fecha
                             when v_dia > 0 then v.re * v_dias / v_dia
                             else v.re end, 2)
           end as proy,
           null::numeric as fij
      from v_lineas v
    union all
    select g.u, g.un, g.nom, g.ord, g.cta, g.lnom, 'tope', g.lord, g.pres, g.re,
           case v_momento
             when 'por_venir' then null
             when 'cerrado' then g.re
             else round(g.fre + g.fpe + case when g.re - g.fre > 0 and v_dia > 0 then (g.re - g.fre) * v_dias / v_dia
                                             else g.re - g.fre end, 2)
           end,
           case when v_momento = 'en_curso' then g.fre + g.fpe end
      from g_lineas g
  ),
  -- CAYLA: la suma exacta de las unidades (solo el líder sin filtro).
  cons as (
    select null::uuid as u, 'consolidado'::text as un, 'CAYLA'::text as nom, 4 as ord, t.lin, t.lnom, t.tp, t.lord,
           sum(t.pres) as pres, sum(t.re) as re, sum(t.proy) as proy, sum(t.fij) as fij
      from todas t
     where v_todo
     group by t.lin, t.lnom, t.tp, t.lord
  ),
  z as (
    select t.*, case when t.pres > 0 and t.proy is not null then round(t.proy / t.pres, 4) end as av from todas t
    union all
    select c.*, case when c.pres > 0 and c.proy is not null then round(c.proy / c.pres, 4) end from cons c
  )
  select z.u, z.un, z.nom, z.ord, z.lin, z.lnom, z.tp, z.lord,
         z.pres, round(z.re, 2), z.proy, z.fij, z.av,
         (z.tp = 'tope' and z.av > 1.05),
         case
           when z.tp = 'tope' and z.pres is null then 'sin_tope'
           when z.tp = 'meta' and z.pres is null then 'sin_meta'
           when v_momento = 'por_venir' then 'por_empezar'
           when z.tp = 'tope' and z.av > 1.05 then 'se_pasa'
           when z.tp = 'tope' and z.av > 1 then 'al_filo'
           when z.tp = 'tope' then 'dentro'
           when v_momento = 'cerrado' and z.av >= 1 then 'cumplida'
           when z.av < 0.95 or (v_momento = 'cerrado' and z.av < 1) then 'bajo_meta'
           else 'en_camino'
         end,
         v_momento, v_dia, v_dias
    from z
   order by z.ord, z.nom, z.lord, z.lnom;
end $$;
comment on function retail.fn_presupuesto_vs_real(date, uuid, date) is
  'Presupuesto contra lo real (ADR-0195): por unidad y línea, el tope (o la meta de ventas de F1, sin IGV), lo real a la fecha (fn_estado_resultados) y la proyección al cierre (ventas: al % de la meta que se lleva; gastos: lo fijo entero y lo demás al ritmo de hoy). Marca lo que se pasa. El líder ve todo y CAYLA; con Reportes financieros, su tienda.';

-- ---------- 7. Permisos ----------
-- RLS encendido y SIN políticas (CLAUDE.md «Políticas y deadlocks»): nadie lee ni escribe la tabla directo; todo pasa
-- por las funciones de arriba, que ya piden lo que corresponde.
alter table retail.presupuestos enable row level security;
revoke all on retail.presupuestos from public, anon, authenticated;

revoke all on function retail.fn_presupuestos_validar() from public, anon, authenticated;
revoke all on function retail.fn_presupuestos_no_se_borran() from public, anon, authenticated;
revoke all on function retail.fn_presupuesto_lineas(date) from public, anon, authenticated;
revoke all on function retail.guardar_presupuesto(date, uuid, text, numeric) from public, anon;
revoke all on function retail.guardar_presupuesto_lote(date, jsonb, text) from public, anon;
revoke all on function retail.fn_presupuesto_propuesta(date, text, date) from public, anon;
revoke all on function retail.fn_presupuesto_configuracion(date) from public, anon;
revoke all on function retail.fn_presupuesto_vs_real(date, uuid, date) from public, anon;
grant execute on function retail.guardar_presupuesto(date, uuid, text, numeric) to authenticated;
grant execute on function retail.guardar_presupuesto_lote(date, jsonb, text) to authenticated;
grant execute on function retail.fn_presupuesto_propuesta(date, text, date) to authenticated;
grant execute on function retail.fn_presupuesto_configuracion(date) to authenticated;
grant execute on function retail.fn_presupuesto_vs_real(date, uuid, date) to authenticated;

reset lock_timeout;
