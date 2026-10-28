-- ============================================================================
-- 20261022201000_observatorio_tienda_prenda_sin_registrar_en_su_categoria.sql — CAYLA V2 · ADR-0322 (Observatorio), act. 2026-10-22
--
-- YA ESTÁ EN PRODUCCIÓN — NO SE VUELVE A PEGAR. Esta migración no escribe nada nuevo: copia a `main` la versión de
-- `retail.fn_observatorio_tienda(uuid)` que corre en producción. Alguien la cambió en producción sin dejar archivo: no está en
-- `main`, ni en ninguna rama de `origin` (buscado el 2026-10-22 con `git log --all -S` y `git grep` sobre todas las ramas
-- remotas), ni en un stash ni en otro worktree de este Mac, y ninguna entrada de `supabase_migrations.schema_migrations` de
-- producción posterior a `observatorio_inicio_del_admin` (20261003220357) la nombra. La revisión de deriva del 2026-10-22 la
-- encontró como «otra versión» que la de `main`; no sé quién la pegó ni cuándo. El cuerpo de abajo es el de `pg_proc.prosrc` de producción,
-- carácter por carácter (4606 caracteres; md5 exacto 61330e38a76b1dcf6a6b2c8050524d55; md5 del cuerpo normalizado como en
-- `scripts/migraciones/deriva.sql` 7fdc1bb21942eda1b93a3b014b31e6e7; leídos el 2026-10-22 con una consulta de solo lectura).
--
-- EL PROBLEMA PRIMERO. El panel de una tienda del Observatorio reparte lo vendido por categoría. Una prenda vendida en caja
-- antes de estar en el sistema («Prenda sin registrar», ADR-0179) no tiene categoría en el catálogo: su fila de
-- `retail.prendas_por_regularizar` guarda la que se declaró en caja al venderla. En `main` esa venta cae en «Sin categoría»; en
-- producción cae en la categoría que se declaró en caja. Mientras las tiendas sigan cargando su inventario (hay cientos de
-- prendas sin registrar todavía por regularizar), «Sin categoría» sería uno de los renglones más grandes del gráfico. Mientras
-- `main` no lo diga, el CI y las bases locales prueban un panel distinto del que ve el Admin, y una migración que recree la
-- función desde `main` le devolvería esas ventas a «Sin categoría» sin que nadie lo decida.
--
-- QUÉ CAMBIA FRENTE A `main`: solo la categoría de cada línea de venta (`cat`). `coalesce(ca.nombre, 'Sin categoría')` pasa a
-- `coalesce(ca.nombre, cr.nombre, 'Sin categoría')`, con dos `left join` más: `prendas_por_regularizar pp` por
-- `venta_item_id` y `categorias cr` por `pp.categoria_id`. La categoría del catálogo sigue mandando: la declarada en caja
-- solo entra cuando la prenda no tiene una. La firma, lo que devuelve, `security definer`, `stable`, el `search_path`, el
-- candado de solo Admin y los permisos (solo `authenticated` la ejecuta) no cambian. Tampoco el `comment on function`:
-- producción no tiene ninguno, y esta migración no agrega uno para no apartarse de lo que corre allá.
--
-- POR QUÉ EL `left join` NO DUPLICA VENTAS. `prendas_por_regularizar.venta_item_id` es `unique` (20260923161700): a lo más una
-- fila por línea de venta, así que la unión no multiplica nada y las categorías siguen sumando lo vendido.
--
-- QUÉ NO ARREGLA. No toca `fn_observatorio` (el resumen de todas las tiendas, que no reparte por categoría) ni lo que Análisis
-- o Ventas muestran por categoría: cada una lee por su cuenta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: no se pega, ya está. Si alguien la pega igual, es un `create or replace` de una función que ya
-- tiene este mismo cuerpo, más un `revoke`/`grant` que ya están: deja todo igual. Sin políticas ni `drop trigger`.
-- Cómo se verifica (solo lectura; debe dar 4606 y 61330e38a76b1dcf6a6b2c8050524d55):
--   select length(prosrc), md5(prosrc) from pg_proc where oid = 'retail.fn_observatorio_tienda(uuid)'::regprocedure;
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar `20261004020000_observatorio_inicio_del_admin.sql` entero (por ejemplo, para reparar
--     `fn_observatorio`): su `create or replace` devuelve esas ventas a «Sin categoría», en silencio. Lo vigila
--     `pnpm pruebas:arreglos-en-vivo-roles-observatorio` (el caso de la prenda sin registrar sale rojo contra una base así);
--   · `prendas_por_regularizar.venta_item_id` deja de ser único: la unión duplicaría ventas y el panel mostraría más de lo
--     vendido. El caso «las categorías suman lo vendido» de `pnpm pruebas:observatorio` lo atrapa.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_observatorio_tienda(p_ubicacion_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_ini timestamptz := (((now() at time zone 'America/Lima')::date) - 29)::timestamp at time zone 'America/Lima';
  v_res jsonb;
begin
  if not retail.fn_es_admin() then
    raise exception 'El Observatorio es solo de las cuentas Admin.' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and tipo = 'tienda') then
    raise exception 'La ubicación no es una tienda.' using errcode = '22023';
  end if;

  with li as materialized (
    select ve.id as venta,
           (ve.created_at at time zone 'America/Lima')::date as f,
           extract(isodow from ve.created_at at time zone 'America/Lima')::int as dow,
           extract(hour from ve.created_at at time zone 'America/Lima')::int as h,
           coalesce(ve.asesora_id, ve.usuario_id) as quien,
           vi.subtotal as s,
           vi.cantidad as u,
           va.id as variante,
           va.producto_id,
           pr.referencia,
           coalesce(ca.nombre, cr.nombre, 'Sin categoría') as cat,
           co.nombre as color,
           co.hex
    from retail.ventas ve
    join retail.venta_items vi on vi.venta_id = ve.id
    join retail.variantes va on va.id = vi.variante_id
    join retail.productos pr on pr.id = va.producto_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    left join retail.prendas_por_regularizar pp on pp.venta_item_id = vi.id
    left join retail.categorias cr on cr.id = pp.categoria_id
    left join retail.colores co on co.codigo = va.color_codigo
    where ve.ubicacion_id = p_ubicacion_id
      and ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
  ),
  ventanas (clave, desde) as (
    values ('hoy', v_hoy), ('d7', v_hoy - 6), ('d30', v_hoy - 29)
  ),
  quietas as (
    -- Prendas con stock en la tienda que no se vendieron en 30 días (y que existen hace más de 30: lo recién llegado no
    -- cuenta como «quieto»).
    select st.variante_id, sum(st.cantidad) as unidades
    from retail.stock st
    join retail.variantes va on va.id = st.variante_id
    where st.ubicacion_id = p_ubicacion_id
      and va.created_at < now() - interval '30 days'
    group by st.variante_id
    having sum(st.cantidad) > 0
  )
  select jsonb_build_object(
    'hoy', v_hoy,
    'categorias', (
      select jsonb_object_agg(w.clave, coalesce((
               select jsonb_agg(jsonb_build_object('cat', x.cat, 's', x.s, 'u', x.u) order by x.s desc)
               from (select cat, sum(s) as s, sum(u) as u from li where li.f >= w.desde group by cat) x), '[]'::jsonb))
      from ventanas w),
    'productos', (
      select jsonb_object_agg(w.clave, coalesce((
               select jsonb_agg(jsonb_build_object('id', x.producto_id, 'n', x.referencia, 'c', x.color, 'hex', x.hex,
                                                   'cat', x.cat, 'u', x.u, 's', x.s) order by x.s desc)
               from (select producto_id, referencia, color, hex, cat, sum(u) as u, sum(s) as s
                     from li where li.f >= w.desde
                     group by producto_id, referencia, color, hex, cat
                     order by sum(s) desc
                     limit 12) x), '[]'::jsonb))
      from ventanas w),
    'equipo', (
      select jsonb_object_agg(w.clave, coalesce((
               select jsonb_agg(jsonb_build_object('id', x.quien, 'n', x.n, 's', x.s, 't', x.t) order by x.s desc)
               from (select li.quien,
                            coalesce(nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), ''), '—') as n,
                            sum(li.s) as s,
                            count(distinct li.venta) as t
                     from li
                     left join public.personas pe on pe.id = li.quien
                     where li.f >= w.desde
                     group by li.quien, 2) x), '[]'::jsonb))
      from ventanas w),
    -- Promedio por día de la semana (1 = lunes) y hora, de las 4 semanas anteriores a hoy.
    'pico', coalesce((
      select jsonb_agg(jsonb_build_object('d', x.dow, 'h', x.h, 's', round(x.s / 4.0, 2)) order by x.dow, x.h)
      from (select dow, h, sum(s) as s from li where li.f >= v_hoy - 28 and li.f < v_hoy group by dow, h) x), '[]'::jsonb),
    'quietas', (
      select jsonb_build_object('variantes', count(*), 'unidades', coalesce(sum(q.unidades), 0))
      from quietas q
      where not exists (select 1 from li where li.variante = q.variante_id))
  )
  into v_res;

  return v_res;
end;
$$;

revoke all on function retail.fn_observatorio_tienda(uuid) from public, anon;
grant execute on function retail.fn_observatorio_tienda(uuid) to authenticated;
