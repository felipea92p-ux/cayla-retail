-- Plan de campaña, tope de inversión (ADR-0372, entrega 2 · B2).
--
-- EL PROBLEMA PRIMERO. Diciembre cae junto a la gratificación y la CTS (R-13): el mes que más se vende es también el de mayor salida de caja.
-- El plan suma lo que cuesta cada categoría, pero nadie ve contra QUÉ: se llega a diciembre con una compra de S/ 60 000 sin que nada haya
-- dicho «y esto cabe en lo que decidimos invertir». El tope es esa vara. AVISA, nunca bloquea un plan: un tope que impidiera guardar una
-- categoría sería una regla nueva de dinero y no es lo que se decidió (Felipe, 2026-10-10).
--
-- QUÉ CREA.
--   1. `planes_compra.tope_inversion` (numeric 12,2, NULL = sin tope) con su autor y su hora. CHECK: un tope positivo, y un tope nunca
--      existe sin autor (estado imposible: una cifra de dinero que nadie fijó).
--   2. `guardar_plan_compra_tope(plan, tope)`: pide el módulo `plan_compra` Y ser líder (`fn_es_lider()`: fijar cuánto invertir es una
--      decisión de dinero, no de quien llena categorías); firma con el responsable del combo (`fn_actor_persona_id(true)`, ADR-0162). Un
--      tope NULL lo quita. La tabla sigue con RLS sin políticas: solo se escribe por esta función.
--   3. `fn_plan_compra` trae el tope dentro de `plan` (`plan.tope_inversion`): una clave más, nada de antes cambia (la web publicada
--      antes que esta migración no la conoce y la nueva esconde la barra si no llega).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica y recién nacida (nadie la lee en
-- caliente), dos funciones; SIN políticas ni `drop trigger` (ADR-0195), así que no choca con el Asesor de seguridad. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.planes_compra
  add column if not exists tope_inversion numeric(12, 2) check (tope_inversion is null or tope_inversion > 0),
  add column if not exists tope_actualizado_por uuid references public.personas (id),
  add column if not exists tope_actualizado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_tope_con_autor' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra
      add constraint planes_compra_tope_con_autor check (tope_inversion is null or (tope_actualizado_por is not null and tope_actualizado_en is not null));
  end if;
end $$;

comment on column retail.planes_compra.tope_inversion is
  'ADR-0372: cuánto se decidió invertir (al costo) en esta campaña; NULL = sin tope. Solo avisa en la pantalla: nunca bloquea un plan.';

create or replace function retail.guardar_plan_compra_tope(p_plan_id uuid, p_tope numeric)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_tope numeric(12, 2);
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Fijar el tope necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder fija cuánto invertir en una campaña'
      using errcode = '42501', hint = 'plan_compra_tope_solo_lider';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if p_tope is not null and (p_tope <= 0 or p_tope > 9999999999) then
    raise exception 'El tope tiene que ser mayor que cero (o déjalo vacío para quitarlo).' using hint = 'plan_compra_tope';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  v_tope := round(p_tope, 2);

  -- Quitar el tope deja anotado quién lo quitó y cuándo (el autor sigue siendo el último que lo tocó).
  update retail.planes_compra
     set tope_inversion = v_tope, tope_actualizado_por = v_persona, tope_actualizado_en = now()
   where id = p_plan_id;

  return jsonb_build_object('plan_id', p_plan_id, 'tope_inversion', v_tope);
end;
$$;

revoke all on function retail.guardar_plan_compra_tope(uuid, numeric) from public, anon;
grant execute on function retail.guardar_plan_compra_tope(uuid, numeric) to authenticated;
comment on function retail.guardar_plan_compra_tope(uuid, numeric) is
  'ADR-0372: fija (o quita, con NULL) el tope de inversión de una campaña. Pide el módulo plan_compra y ser líder; firma el responsable del combo (fn_actor_persona_id(true)). El tope solo avisa: no bloquea ningún plan.';

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
  'guardados, el stock libre de la red (y por sede: stock_sedes), lo vendido por categoría × talla en 90 días (para la curva), el precio y '
  'el costo promedio del catálogo (catalogo), lo vendido en 30 días (vendido_30), lo vendido dentro de la campaña y el tope de inversión '
  '(plan.tope_inversion). Pide el módulo plan_compra (42501 si no).';

reset lock_timeout;
notify pgrst, 'reload schema';
