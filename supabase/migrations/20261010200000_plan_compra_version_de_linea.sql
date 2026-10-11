-- Plan de campaña, la versión de cada categoría (ADR-0372, actualización 2026-10-10 · B4; el patrón de ADR-0193).
--
-- EL PROBLEMA PRIMERO. Dos personas abren la hoja de «Abrigos» a la vez (o la misma persona en dos pestañas). La primera guarda 10 · 20 · 30;
-- la segunda, que la abrió antes, guarda 80 · 120 · 180 y pisa lo de la primera sin que nadie se entere: gana la última (chaos 2026-10-10,
-- NAV-05, gravedad 2: un dato malo guardado en silencio). Hoy solo los líderes ven el módulo; el riesgo crece el día que se le dé a quien compra.
--
-- QUÉ HACE (control optimista de versión, como ADR-0193: nadie bloquea a nadie mientras edita; se comprueba al guardar).
--   1. `planes_compra_lineas.version` (integer, empieza en 1) con el disparador de siempre (`fn_subir_version`, ADR-0193): sube en cada escritura.
--   2. `guardar_plan_compra_linea` recibe `p_version_esperada integer default null`: la versión que la hoja leyó al abrirse (0 = no había plan).
--      Si la línea cambió desde entonces Y lo que se manda es distinto de lo guardado, rechaza con PT409 `version_cambiada` y dice quién y a qué
--      hora guardó. Si lo que se manda es IGUAL (un reintento después de que se perdió la respuesta: chaos RS-03), lo acepta: no hay conflicto.
--      Sin la versión se comporta como hasta hoy. Ahora devuelve también `version` (la web vieja ignora la clave).
--   3. `fn_plan_compra` suma `version` a cada línea y `con_version: true` arriba: la web nueva solo manda la versión si la base la entiende.
--
-- LA CARRERA. La línea se relee con `for update`: el segundo guardado espera al primero y, al despertar, ve la versión nueva. Si la hoja abrió
-- sin plan (versión 0) y otra persona crea la línea en el mismo instante, el insert choca con el único (plan, categoría): se inserta con
-- `on conflict do nothing` y, si no insertó, se relee la línea (ya bloqueada) y se compara igual.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica (0 filas en producción el 2026-10-10), un
-- disparador con `create or replace trigger` (nunca `drop trigger`: ADR-0195) y dos funciones; SIN políticas. Como cambia la firma de
-- `guardar_plan_compra_linea`, se borra la vieja y se crea la nueva en la misma transacción (dos sobrecargas confundirían a PostgREST) y se
-- reaplican sus permisos. Idempotente: pegarla dos veces deja lo mismo.
-- ORDEN: da igual. La web vieja con la base nueva guarda como siempre (no manda la versión); la web nueva con la base vieja no la manda (no ve
-- `con_version`).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.planes_compra_lineas add column if not exists version integer not null default 1;

comment on column retail.planes_compra_lineas.version is
  'ADR-0193 aplicada al plan de campaña (ADR-0372, B4): sube en cada escritura (disparador planes_compra_lineas_version_bu). La hoja la lee al abrirse y la manda a guardar_plan_compra_linea como p_version_esperada: si otra persona guardó otra cosa entre medio, se rechaza (PT409) en vez de pisarla.';

create or replace trigger planes_compra_lineas_version_bu
  before update on retail.planes_compra_lineas
  for each row execute function retail.fn_subir_version();

drop function if exists retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text);

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
  p_nota text default null,
  p_version_esperada integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_curva jsonb := coalesce(p_curva, '{}'::jsonb);
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_suma integer;
  v_ajena boolean;
  v_persona uuid;
  v_id uuid;
  v_version integer;
  v_actual retail.planes_compra_lineas%rowtype;
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

  -- B4: la versión que leyó la hoja. Sin ella (la web de antes), se guarda como siempre.
  if p_version_esperada is not null then
    for v_actual in
      select l.* from retail.planes_compra_lineas l
       where l.plan_id = p_plan_id and l.categoria_id = p_categoria_id
       for update
    loop
      exit;
    end loop;
    if v_actual.id is null then
      -- No hay línea: se crea, salvo que otra persona la cree en este mismo instante (el único la detiene y se compara abajo).
      insert into retail.planes_compra_lineas
        (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, curva, nota, actualizado_por, updated_at)
      values
        (p_plan_id, p_categoria_id, p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, v_curva, v_nota, v_persona, now())
      on conflict (plan_id, categoria_id) do nothing
      returning id, version into v_id, v_version;
      if v_id is not null then
        return jsonb_build_object('id', v_id, 'plan_id', p_plan_id, 'categoria_id', p_categoria_id, 'version', v_version);
      end if;
      for v_actual in
        select l.* from retail.planes_compra_lineas l
         where l.plan_id = p_plan_id and l.categoria_id = p_categoria_id
         for update
      loop
        exit;
      end loop;
    end if;
    -- Cambió desde que se abrió la hoja Y se manda otra cosa: no se pisa. Si se manda lo mismo (un reintento), no hay nada que defender.
    if v_actual.version <> p_version_esperada
       and (v_actual.flojo, v_actual.normal, v_actual.bueno, v_actual.precio, v_actual.costo, v_actual.recupero_pct, v_actual.curva, v_actual.nota)
           is distinct from (p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, v_curva, v_nota) then
      raise exception '% guardó otro plan de % a las % mientras lo editabas: lo tuyo no se guardó. Vuelve a abrir la categoría para ver lo que guardó.',
          coalesce(retail.fn_actividad_nombre(v_actual.actualizado_por), 'Otra persona'),
          (select c.nombre from retail.categorias c where c.id = p_categoria_id),
          to_char(v_actual.updated_at at time zone 'America/Lima', 'HH24:MI')
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  insert into retail.planes_compra_lineas as l
    (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, curva, nota, actualizado_por, updated_at)
  values
    (p_plan_id, p_categoria_id, p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, v_curva,
     v_nota, v_persona, now())
  on conflict (plan_id, categoria_id) do update
     set flojo = excluded.flojo, normal = excluded.normal, bueno = excluded.bueno, precio = excluded.precio,
         costo = excluded.costo, recupero_pct = excluded.recupero_pct, curva = excluded.curva, nota = excluded.nota,
         actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at
  returning l.id, l.version into v_id, v_version;

  return jsonb_build_object('id', v_id, 'plan_id', p_plan_id, 'categoria_id', p_categoria_id, 'version', v_version);
end;
$$;

revoke all on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer) to authenticated;
comment on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer) is
  'ADR-0349 + ADR-0372 (B4): guarda los supuestos de UNA categoría del plan (los tres escenarios, precio, costo, lo que sobra, la curva y una nota). Pide el módulo plan_compra; firma el responsable del combo (fn_actor_persona_id(true)). p_version_esperada (ADR-0193): la versión que la hoja leyó (0 = no había plan); si otra persona guardó otra cosa entre medio, PT409 version_cambiada con quién y a qué hora. Devuelve {id, plan_id, categoria_id, version}.';

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
  v_30_desde timestamptz := now() - interval '30 days';
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
    'plan', jsonb_build_object('id', v_plan.id, 'nombre', v_plan.nombre, 'desde', v_plan.desde, 'hasta', v_plan.hasta,
                                 'tope_inversion', v_plan.tope_inversion),
    'hoy', retail.fn_hoy_lima(),
    -- B4: la base compara versiones al guardar una categoría. La web nueva solo manda la versión si ve esta marca.
    'con_version', true,
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
               'actualizado_por', retail.fn_actividad_nombre(l.actualizado_por), 'updated_at', l.updated_at,
               -- B4 (ADR-0193 aplicada al plan): la versión que la hoja manda al guardar.
               'version', l.version))
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
               group by q.categoria_id) w), '[]'::jsonb),
    -- ADR-0372 (B1). El precio y el costo PROMEDIO de lo que hoy hay en el catálogo de cada categoría: la hoja los pone como punto de
    -- partida («Del catálogo · revísalo») en vez de pedirlos en blanco. Solo variantes y productos activos, sin pruebas ni la prenda
    -- centinela; un precio o un costo en 0 no cuenta (es «sin dato», no «gratis»).
    'catalogo', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', k.categoria_id, 'precio', k.precio, 'costo', k.costo))
        from (select pr.categoria_id,
                     round(avg(va.precio) filter (where va.precio > 0), 2) as precio,
                     round(avg(va.costo) filter (where va.costo > 0), 2) as costo
                from retail.variantes va
                join retail.productos pr on pr.id = va.producto_id
               where va.activo and pr.estado = 'activo' and not pr.es_prueba
                 and va.id <> c_centinela and pr.categoria_id is not null
               group by pr.categoria_id) k
       where k.precio is not null and k.costo is not null), '[]'::jsonb),
    -- ADR-0372 (B1). El mismo stock libre de la red de arriba, pero por sede (cada tienda y el Taller): para decir DÓNDE está lo que hay.
    'stock_sedes', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', s.categoria_id, 'ubicacion', s.nombre, 'unidades', s.unidades) order by s.nombre)
        from (select pr.categoria_id, u.nombre,
                     sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0))::integer as unidades
                from retail.stock st
                join retail.ubicaciones u on u.id = st.ubicacion_id and u.activo
                left join retail.sububicaciones sb on sb.id = st.sububicacion_id
                join retail.variantes va on va.id = st.variante_id
                join retail.productos pr on pr.id = va.producto_id
               where st.variante_id <> c_centinela and not pr.es_prueba
                 and sb.tipo is distinct from 'cuarentena'
               group by pr.categoria_id, u.id, u.nombre
              having sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0)) > 0) s), '[]'::jsonb),
    -- ADR-0372 (B1). Lo vendido en los últimos 30 días por categoría, con su prenda o anotado «sin registrar»: la referencia más fresca
    -- para escribir los escenarios (la de 90 días sale de `curvas`).
    'vendido_30', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', m.categoria_id, 'unidades', m.unidades))
        from (select t.categoria_id, sum(t.unidades)::integer as unidades
                from (select pr.categoria_id, vi.cantidad as unidades
                        from retail.ventas v
                        join retail.venta_items vi on vi.venta_id = v.id
                        join retail.variantes va on va.id = vi.variante_id
                        join retail.productos pr on pr.id = va.producto_id
                       where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
                         and vi.variante_id <> c_centinela and v.created_at >= v_30_desde and v.created_at < now()
                      union all
                      select p.categoria_id, 1
                        from retail.prendas_por_regularizar p
                        join retail.venta_items vi on vi.id = p.venta_item_id
                        join retail.ventas v on v.id = vi.venta_id
                       where p.estado in ('pendiente', 'cerrada_sin_prenda')
                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_30_desde and v.created_at < now()) t
               where t.categoria_id is not null
               group by t.categoria_id) m), '[]'::jsonb)
  );
end;
$$;

revoke all on function retail.fn_plan_compra(uuid) from public, anon;
grant execute on function retail.fn_plan_compra(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra(uuid) is
  'ADR-0349 + ADR-0372: la hoja del plan de campaña (el más reciente si p_plan_id es NULL): categorías activas con sus tallas, los supuestos '
  'guardados (con su versión, B4), el stock libre de la red (y por sede: stock_sedes), lo vendido por categoría × talla en 90 días (para la curva), el precio y '
  'el costo promedio del catálogo (catalogo), lo vendido en 30 días (vendido_30), lo vendido dentro de la campaña, el tope de inversión '
  '(plan.tope_inversion) y con_version (la base compara versiones al guardar). Pide el módulo plan_compra (42501 si no).';

reset lock_timeout;
notify pgrst, 'reload schema';
