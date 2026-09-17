-- ============================================================================
-- 20260916110000_conteo_alcance_y_cadencia.sql — CAYLA V2
--
-- "Conteo físico", pieza inspirada en NetSuite elegida por Felipe: contar más
-- seguido lo que más rota. Existió un segundo diseño de conteo ("censo",
-- `supabase/unificacion/30_conteos.sql`) con un campo `alcance` para acotar
-- qué se cuenta por familia/categoría/contenedor — se construyó, se desplegó
-- brevemente en producción (9 al 12-sep-2026) y se perdió por accidente en el
-- corte grande a V2, no por decisión de nadie.
--
-- Felipe eligió reactivar ese campo sobre la pantalla que SÍ está viva hoy
-- (`/inventario/conteo`, `abrir_conteo`/`conteo_contar`/`cerrar_conteo`), en
-- vez de resucitar el diseño censo completo (`conteo_lineas`, `sede_id`, alta
-- de prenda al vuelo) — eso sería un segundo modelo de conteo compitiendo con
-- el que ya funciona en producción.
--
-- DECIDÍ: `alcance` solo FILTRA qué se sugiere contar primero
-- (`fn_prioridad_conteo`) — no cambia `conteo_contar` ni `cerrar_conteo`, que
-- siguen intactas. Contar algo fuera del alcance sugerido sigue funcionando
-- (es solo una sugerencia, no un candado): alguien puede seguir buscando
-- cualquier SKU aunque haya elegido "solo Blusas".
-- DESCARTÉ: los 4 valores de alcance del diseño censo (todo/familia/
-- categoria/contenedor) — "familia" y "contenedor" dependían de tablas V1 sin
-- equivalente confirmado en V2 hoy. Se abre con los dos que sí tienen datos
-- reales: todo/categoria. Ampliar a más adelante es una columna, no una
-- migración distinta.
--
-- Cadencia: `fn_prioridad_conteo` ordena primero lo nunca contado, después lo
-- que más vende, después lo que hace más tiempo no se cuenta — mismo dato de
-- ventas que ya usa el punto de reorden (20260916100000), no un cálculo nuevo.
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. alcance en conteos ----------

alter table retail.conteos
  add column alcance text not null default 'todo' check (alcance in ('todo', 'categoria')),
  add column alcance_categoria_id uuid references retail.categorias (id);

alter table retail.conteos
  add constraint conteos_alcance_categoria_coherente check (
    (alcance = 'categoria' and alcance_categoria_id is not null) or
    (alcance = 'todo' and alcance_categoria_id is null)
  );

comment on column retail.conteos.alcance is
  'Qué sugiere contar primero fn_prioridad_conteo — no restringe qué se puede contar de verdad (conteo_contar sigue abierto a cualquier variante).';

-- ---------- 2. abrir_conteo: 2 parámetros nuevos, resto intacto ----------
-- Agregar parámetros (aunque tengan default) no es un CREATE OR REPLACE
-- transparente: Postgres lo trata como otra firma y deja las DOS funciones
-- vivas a la vez, ambiguas para cualquier llamada de 2 argumentos
-- (encontrado al correr el seed: "abrir_conteo(uuid, uuid) is not unique").
-- Hay que soltar la firma vieja primero.
drop function if exists retail.abrir_conteo(uuid, uuid);

create function retail.abrir_conteo(
  p_ubicacion_id uuid,
  p_sububicacion_id uuid default null,
  p_alcance text default 'todo',
  p_alcance_categoria_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  if exists (select 1 from conteos where ubicacion_id = p_ubicacion_id and estado = 'abierto') then
    raise exception 'Ya hay un conteo abierto en esta ubicación — ciérralo antes de abrir otro';
  end if;
  if p_alcance not in ('todo', 'categoria') then
    raise exception 'Alcance de conteo desconocido: %', p_alcance;
  end if;
  if (p_alcance = 'categoria') <> (p_alcance_categoria_id is not null) then
    raise exception 'Elige una categoría cuando el alcance es "categoria", y ninguna cuando es "todo"';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into conteos (ubicacion_id, sububicacion_id, abierto_por, alcance, alcance_categoria_id)
    values (p_ubicacion_id, p_sububicacion_id, v_persona, p_alcance, p_alcance_categoria_id)
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------- 3. fn_prioridad_conteo: sugerencia de qué contar primero ----------

create function retail.fn_prioridad_conteo(p_ubicacion_id uuid, p_alcance_categoria_id uuid default null)
returns table (
  variante_id uuid,
  sku text,
  referencia text,
  talla text,
  color text,
  dias_sin_contar integer,
  ventas_30d integer
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver la prioridad de conteo de esa ubicación';
  end if;

  return query
  select
    va.id,
    va.sku,
    p.referencia,
    va.talla,
    co.nombre,
    (
      select extract(day from now() - max(c.cerrado_en))::integer
      from conteos c
      join conteo_items ci on ci.conteo_id = c.id
      where ci.variante_id = va.id and c.ubicacion_id = p_ubicacion_id and c.estado = 'cerrado'
    ) as dias_sin_contar,
    coalesce((
      select sum(m.cantidad)::integer
      from movimientos m
      where m.variante_id = va.id and m.ubicacion_id = p_ubicacion_id
        and m.tipo = 'salida' and m.motivo = 'venta'
        and m.created_at >= now() - interval '30 days'
    ), 0) as ventas_30d
  from variantes va
  join productos p on p.id = va.producto_id
  left join colores co on co.codigo = va.color_codigo
  where exists (
      select 1 from stock st
      where st.variante_id = va.id and st.ubicacion_id = p_ubicacion_id and st.cantidad > 0
    )
    and (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by (
    select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
    where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
  ) asc nulls first, ventas_30d desc
  limit 20;
end;
$$;

revoke all on function retail.fn_prioridad_conteo(uuid, uuid) from public;
grant execute on function retail.fn_prioridad_conteo(uuid, uuid) to authenticated;

comment on function retail.fn_prioridad_conteo(uuid, uuid) is
  'Las 20 variantes que más conviene contar primero en esta ubicación: nunca contadas primero, después por venta reciente. Solo sugiere — conteo_contar sigue aceptando cualquier variante.';
