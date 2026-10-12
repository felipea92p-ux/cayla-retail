-- Plan de campaña (ADR-0349): una hoja, por categoría, para decidir cuánto comprar para diciembre 2026, y compararla en enero.
--
-- EL PROBLEMA PRIMERO. Diciembre triplica un mes promedio y es «la decisión del año» (R-19, docs/datos/15-COMO-OPERA-CAYLA.md). El
-- motor de demanda (ADR-0346/0347) no puede sugerir cuánto comprar hasta tener una temporada completa de datos limpios, y no hay
-- historia de ventas fuera del ERP (Felipe, 2026-10-05). Mientras tanto, la compra de diciembre se decide a ojo y nadie puede
-- revisar después qué se supuso. Felipe decidió (2026-10-05): una hoja por categoría con TRES escenarios (diciembre flojo, normal y
-- bueno), el precio, el costo y a cuánto se vende lo que sobre; el sistema calcula cuánto comprar con el cuantil crítico (cuánto
-- cuesta quedarse corto frente a pasarse; ADR-0349) y propone la curva de tallas desde lo vendido. En enero, la misma hoja muestra
-- lo que se vendió de verdad: ese es el primer dato para calibrar la etapa 4 del motor.
--
-- QUÉ CREA.
--   1. `retail.planes_compra`: una campaña con sus fechas (sembrada: «Diciembre 2026», del 1 al 31 de diciembre).
--   2. `retail.planes_compra_lineas`: una línea por categoría, con sus supuestos. RLS encendido SIN políticas: solo se lee y se
--      escribe por las dos funciones de abajo (ADR-0195: si una tabla nueva solo se lee por funciones security definer, sin
--      políticas). Los candados del esquema hacen imposible un supuesto incoherente: flojo ≤ normal ≤ bueno, costo < precio,
--      recupero entre 0 y 100, y la curva con tallas de la categoría que suman 100 (lo vigila la función: un CHECK no ve otra tabla).
--   3. El módulo `plan_compra` (Compras, orden 195), SIN rol: nace solo para el líder (ADR-0161); delegable, porque sus funciones
--      preguntan por el módulo y no por el líder.
--   4. `fn_plan_compra(p_plan_id)`: la hoja (lectura). `guardar_plan_compra_linea(...)`: guarda una categoría, firmada por el
--      responsable del combo (`fn_actor_persona_id(true)`, ADR-0162).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: tablas NUEVAS (nadie las usa, así que no hay candado que choque),
-- sin políticas ni `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Tablas ----------
create table if not exists retail.planes_compra (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  desde date not null,
  hasta date not null,
  created_at timestamptz not null default now(),
  constraint planes_compra_fechas check (hasta >= desde)
);
comment on table retail.planes_compra is
  'ADR-0349: una campaña de compra (ej. «Diciembre 2026») con las fechas en que se mide lo que se vendió de verdad.';

create table if not exists retail.planes_compra_lineas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references retail.planes_compra (id),
  categoria_id uuid not null references retail.categorias (id),
  -- Unidades que se venderían en la campaña, en tres escenarios.
  flojo integer not null check (flojo >= 0),
  normal integer not null,
  bueno integer not null,
  precio numeric(10, 2) not null check (precio > 0),
  costo numeric(10, 2) not null check (costo >= 0),
  -- A cuánto se vende lo que sobre, como % del precio (en liquidación o en la temporada siguiente).
  recupero_pct integer not null check (recupero_pct between 0 and 100),
  -- La curva de tallas: { "<talla_id>": <porcentaje entero> }, que suma 100; vacía = todavía no se decidió.
  curva jsonb not null default '{}'::jsonb check (jsonb_typeof(curva) = 'object'),
  nota text check (nota is null or btrim(nota) <> ''),
  actualizado_por uuid not null references public.personas (id),
  updated_at timestamptz not null default now(),
  constraint planes_compra_lineas_una_por_categoria unique (plan_id, categoria_id),
  constraint planes_compra_lineas_escenarios check (flojo <= normal and normal <= bueno),
  constraint planes_compra_lineas_margen check (costo < precio)
);
comment on table retail.planes_compra_lineas is
  'ADR-0349: los supuestos de una categoría en un plan de campaña (tres escenarios, precio, costo, recupero y curva de tallas). Solo '
  'se lee y escribe por fn_plan_compra y guardar_plan_compra_linea (RLS sin políticas).';

alter table retail.planes_compra enable row level security;
alter table retail.planes_compra_lineas enable row level security;

insert into retail.planes_compra (nombre, desde, hasta) values ('Diciembre 2026', date '2026-12-01', date '2026-12-31')
on conflict (nombre) do nothing;

-- ---------- 2. El módulo (sin rol: solo el líder hasta que lo dé) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('plan_compra', 'Compras', 'Plan de campaña',
   'Armar por categoría cuánto comprar para una campaña (tres escenarios, precio, costo, curva de tallas) y compararlo después con lo que se vendió',
   195, false, true)
on conflict (clave) do nothing;

-- ---------- 3. La hoja (lectura) ----------
create or replace function retail.fn_plan_compra(p_plan_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  v_plan retail.planes_compra%rowtype;
  v_desde_ts timestamptz;
  v_hasta_ts timestamptz;
  v_curva_desde timestamptz := now() - interval '90 days';
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_plan in
    select * from retail.planes_compra p
     where p_plan_id is null or p.id = p_plan_id
     order by p.desde desc, p.id
     limit 1
  loop
    exit;
  end loop;
  if v_plan.id is null then
    return null;
  end if;
  v_desde_ts := (v_plan.desde::timestamp at time zone 'America/Lima');
  v_hasta_ts := ((v_plan.hasta + 1)::timestamp at time zone 'America/Lima');

  return jsonb_build_object(
    'plan', jsonb_build_object('id', v_plan.id, 'nombre', v_plan.nombre, 'desde', v_plan.desde, 'hasta', v_plan.hasta),
    'hoy', retail.fn_hoy_lima(),
    'planes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.desde desc)
                          from retail.planes_compra p), '[]'::jsonb),
    -- Las categorías activas con sus tallas (la curva solo puede usar estas).
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
               'tallas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'valor', t.valor))
                                     from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id
                                    where ct.categoria_id = c.id), '[]'::jsonb))
             order by c.nombre)
        from retail.categorias c where c.activo), '[]'::jsonb),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'categoria_id', l.categoria_id, 'flojo', l.flojo, 'normal', l.normal, 'bueno', l.bueno,
               'precio', l.precio, 'costo', l.costo, 'recupero_pct', l.recupero_pct, 'curva', l.curva, 'nota', l.nota,
               'actualizado_por', retail.fn_actividad_nombre(l.actualizado_por), 'updated_at', l.updated_at))
        from retail.planes_compra_lineas l where l.plan_id = v_plan.id), '[]'::jsonb),
    -- Lo que ya hay hoy en toda la red (tiendas, almacenes y Taller), libre de apartados y sin Cuarentena, por categoría.
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', x.categoria_id, 'unidades', x.unidades))
        from (select pr.categoria_id, sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0))::integer as unidades
                from retail.stock st
                join retail.ubicaciones u on u.id = st.ubicacion_id and u.activo
                left join retail.sububicaciones sb on sb.id = st.sububicacion_id
                join retail.variantes va on va.id = st.variante_id
                join retail.productos pr on pr.id = va.producto_id
               where st.variante_id <> c_centinela and not pr.es_prueba
                 and sb.tipo is distinct from 'cuarentena'
               group by pr.categoria_id) x
       where x.unidades > 0), '[]'::jsonb),
    -- Lo vendido por categoría × talla en los últimos 90 días: la base de la curva que propone el sistema. Con su prenda o anotado
    -- «sin registrar» (la anotada trae su categoría y su talla).
    'curvas', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', y.categoria_id, 'talla_id', y.talla_id, 'unidades', y.unidades))
        from (select z.categoria_id, z.talla_id, sum(z.unidades)::integer as unidades
                from (select pr.categoria_id, va.talla_id, vi.cantidad as unidades
                        from retail.ventas v
                        join retail.venta_items vi on vi.venta_id = v.id
                        join retail.variantes va on va.id = vi.variante_id
                        join retail.productos pr on pr.id = va.producto_id
                       where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
                         and vi.variante_id <> c_centinela and v.created_at >= v_curva_desde and v.created_at < now()
                      union all
                      select p.categoria_id, p.talla_id, 1
                        from retail.prendas_por_regularizar p
                        join retail.venta_items vi on vi.id = p.venta_item_id
                        join retail.ventas v on v.id = vi.venta_id
                       where p.estado in ('pendiente', 'cerrada_sin_prenda')
                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_curva_desde and v.created_at < now()) z
               where z.categoria_id is not null and z.talla_id is not null
               group by z.categoria_id, z.talla_id) y), '[]'::jsonb),
    -- Lo que se vendió DE VERDAD dentro de las fechas de la campaña (para compararlo en enero; durante la campaña, parcial).
    'vendido', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', w.categoria_id, 'unidades', w.unidades))
        from (select q.categoria_id, sum(q.unidades)::integer as unidades
                from (select pr.categoria_id, vi.cantidad as unidades
                        from retail.ventas v
                        join retail.venta_items vi on vi.venta_id = v.id
                        join retail.variantes va on va.id = vi.variante_id
                        join retail.productos pr on pr.id = va.producto_id
                       where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
                         and vi.variante_id <> c_centinela
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                      union all
                      select p.categoria_id, 1
                        from retail.prendas_por_regularizar p
                        join retail.venta_items vi on vi.id = p.venta_item_id
                        join retail.ventas v on v.id = vi.venta_id
                       where p.estado in ('pendiente', 'cerrada_sin_prenda')
                         and v.estado = 'completada' and not v.es_prueba
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts) q
               where q.categoria_id is not null
               group by q.categoria_id) w), '[]'::jsonb)
  );
end;
$$;

revoke all on function retail.fn_plan_compra(uuid) from public, anon;
grant execute on function retail.fn_plan_compra(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra(uuid) is
  'ADR-0349: la hoja del plan de campaña (el más reciente si p_plan_id es NULL): categorías activas con sus tallas, los supuestos '
  'guardados, el stock libre de la red, lo vendido por categoría × talla en 90 días (para la curva) y lo vendido dentro de la '
  'campaña. Pide el módulo plan_compra (42501 si no).';

-- ---------- 4. Guardar una categoría ----------
create or replace function retail.guardar_plan_compra_linea(
  p_plan_id uuid,
  p_categoria_id uuid,
  p_flojo integer,
  p_normal integer,
  p_bueno integer,
  p_precio numeric,
  p_costo numeric,
  p_recupero_pct integer,
  p_curva jsonb default '{}'::jsonb,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_curva jsonb := coalesce(p_curva, '{}'::jsonb);
  v_suma integer;
  v_ajena boolean;
  v_persona uuid;
  v_id uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Armar el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if not exists (select 1 from retail.categorias where id = p_categoria_id and activo) then
    raise exception 'Esa categoría no existe o está desactivada' using hint = 'plan_compra_categoria';
  end if;
  if p_flojo is null or p_normal is null or p_bueno is null or p_flojo < 0 or p_flojo > p_normal or p_normal > p_bueno then
    raise exception 'Los escenarios van de menor a mayor: flojo, normal y bueno (flojo puede ser 0).' using hint = 'plan_compra_escenarios';
  end if;
  if p_precio is null or p_precio <= 0 or p_costo is null or p_costo < 0 or p_costo >= p_precio then
    raise exception 'El costo tiene que ser menor que el precio de venta.' using hint = 'plan_compra_margen';
  end if;
  if p_recupero_pct is null or p_recupero_pct not between 0 and 100 then
    raise exception 'Lo que sobra se vende entre el 0 %% y el 100 %% del precio.' using hint = 'plan_compra_recupero';
  end if;
  if jsonb_typeof(v_curva) <> 'object' then
    raise exception 'La curva de tallas no se entiende' using hint = 'plan_compra_curva';
  end if;
  if v_curva <> '{}'::jsonb then
    -- Cada talla tiene que ser de la categoría, con un porcentaje entero de 0 a 100, y todas juntas suman 100.
    v_ajena := exists (
      select 1 from jsonb_each(v_curva) e
       where not exists (select 1 from retail.categoria_tallas ct
                          where ct.categoria_id = p_categoria_id and ct.talla_id::text = e.key)
          or jsonb_typeof(e.value) <> 'number'
          or (e.value)::numeric <> trunc((e.value)::numeric)
          or (e.value)::numeric not between 0 and 100);
    if v_ajena then
      raise exception 'La curva tiene una talla que no es de esta categoría o un porcentaje que no es entero entre 0 y 100.'
        using hint = 'plan_compra_curva';
    end if;
    v_suma := (select sum((e.value)::numeric)::integer from jsonb_each(v_curva) e);
    if v_suma <> 100 then
      raise exception 'La curva de tallas suma % %%: tiene que sumar 100 %%.', v_suma using hint = 'plan_compra_curva_suma';
    end if;
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  insert into retail.planes_compra_lineas as l
    (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, curva, nota, actualizado_por, updated_at)
  values
    (p_plan_id, p_categoria_id, p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, v_curva,
     nullif(btrim(coalesce(p_nota, '')), ''), v_persona, now())
  on conflict (plan_id, categoria_id) do update
     set flojo = excluded.flojo, normal = excluded.normal, bueno = excluded.bueno, precio = excluded.precio,
         costo = excluded.costo, recupero_pct = excluded.recupero_pct, curva = excluded.curva, nota = excluded.nota,
         actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at
  returning l.id into v_id;

  return jsonb_build_object('id', v_id, 'plan_id', p_plan_id, 'categoria_id', p_categoria_id);
end;
$$;

revoke all on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text) from public, anon;
grant execute on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text) to authenticated;
comment on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text) is
  'ADR-0349: guarda (o corrige) los supuestos de una categoría en un plan de campaña. Pide el módulo plan_compra; firma el '
  'responsable del combo (fn_actor_persona_id(true)). Rechaza escenarios desordenados, costo ≥ precio, recupero fuera de 0-100 y una '
  'curva con tallas ajenas a la categoría o que no suma 100.';

reset lock_timeout;
notify pgrst, 'reload schema';
