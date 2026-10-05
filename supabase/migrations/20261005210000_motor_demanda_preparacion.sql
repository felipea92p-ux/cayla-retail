-- Motor de demanda, etapa 0: «¿el motor puede hablar en esta sede?» (ADR-0344; diseño en
-- docs/investigacion/2026-10-05-algoritmo-de-inventario.md).
--
-- POR QUÉ. Antes de recomendar cuánto colgar, trasladar, producir o comprar, el motor necesita datos que digan la verdad. El
-- 2026-10-05 el 82 % de las unidades vendidas en el ERP eran «venta sin registrar» (la línea apunta a la prenda centinela y no
-- se sabe qué prenda fue): con eso cualquier sugerencia por prenda o por talla sería ruido. Esta lectura entrega la materia
-- prima de las tres condiciones que deciden si una sede ya puede recibir recomendaciones:
--   1. Venta identificada: por día de Lima, unidades vendidas y cuántas de ellas apuntan a una prenda real. La regla (≥ 90 %
--      sostenido 14 días seguidos, Felipe 2026-10-05) vive en `apps/web/lib/motor-demanda-reglas.ts`, con su prueba; aquí solo
--      se cuentan las unidades. Una venta regularizada después (`regularizar_prenda` reescribe `venta_items.variante_id`)
--      cuenta como identificada EN EL DÍA EN QUE SE COBRÓ, así que el porcentaje de un día pasado puede subir: la racha se
--      recalcula en cada lectura, no se congela.
--   2. Piso cuadrado: la fecha del último cuadre (`fn_ultimo_cuadre_piso`, la única definición de ADR-0328).
--   3. Almacén contado: el almacén ya tuvo su conteo de arranque desde el último cuadre (`fn_conteo_arranque_pendiente` del
--      almacén entero, la misma pregunta que «Abrir un conteo»). Si la sede no separa piso y almacén, la ubicación entera.
--
-- QUÉ NO HACE. No escribe nada, no cambia ninguna función existente y no decide: devuelve conteos y fechas.
--
-- PUERTAS. Con `p_ubicacion_id` NULL lee todas las tiendas activas y exige el módulo `cayla_global` (la misma puerta que
-- `fn_global_cobertura`, que se muestra en la misma pantalla). Con una sede, también la deja leer a quien opera esa sede (la
-- puerta de `fn_piso_plan_lectura`): lo vendido por día es de la sede y comparar sedes es del líder (2026-09-26).
--
-- VOLUMEN. 45 días × ~40 ventas/día × 3 tiendas ≈ 5 mil líneas: un agregado con el índice de `ventas(ubicacion_id)`.
--
-- Producción: solo `create or replace function` + `grant` (sin políticas ni `alter table`): se pega en una sola parte.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_motor_demanda_preparacion(p_ubicacion_id uuid default null)
returns table(
  ubicacion_id uuid,
  nombre text,
  hoy date,
  primera_venta date,
  cuadrado_en timestamptz,
  almacen_contado boolean,
  dias jsonb
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  -- La prenda centinela de las ventas «sin registrar» (ADR-0179): la misma constante que `fn_piso_plan_lectura`.
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_dias constant integer := 45;
  v_hoy date := retail.fn_hoy_lima();
  v_desde_ts timestamptz := ((retail.fn_hoy_lima() - (c_dias - 1))::timestamp at time zone 'America/Lima');
begin
  if p_ubicacion_id is null then
    if retail.fn_ve_modulo('cayla_global') is not true then
      raise exception 'Ver el estado del motor de todas las sedes necesita el módulo «CAYLA Global» en tu rol'
        using errcode = '42501', hint = 'motor_demanda_sin_modulo';
    end if;
  elsif not (retail.fn_ve_modulo('cayla_global') is true
             or (retail.fn_tiene_acceso_retail() and retail.fn_puede_operar_ubicacion(p_ubicacion_id))) then
    raise exception 'Para ver el estado del motor de esta sede hace falta operarla'
      using errcode = '42501', hint = 'motor_demanda_sin_sede';
  end if;

  return query
  with sedes as materialized (
    select u.id, u.nombre
      from retail.ubicaciones u
     where u.activo and u.tipo = 'tienda'
       and (p_ubicacion_id is null or u.id = p_ubicacion_id)
  ),
  lineas as materialized (
    -- Cada línea cobrada en la ventana, en su día de Lima. Mismos filtros que el motor del piso: venta completada y no de
    -- prueba, y sin la liquidación de una prenda dañada (no es demanda: salió de Cuarentena, no la eligió un cliente).
    select v.ubicacion_id,
           (v.created_at at time zone 'America/Lima')::date as dia,
           vi.cantidad,
           (vi.variante_id <> c_centinela) as identificada
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      join sedes s on s.id = v.ubicacion_id
     where v.created_at >= v_desde_ts
       and v.estado = 'completada'
       and not v.es_prueba
       and not exists (select 1 from retail.movimientos m
                        where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
  ),
  por_dia as (
    select l.ubicacion_id,
           jsonb_agg(jsonb_build_object(
                       'dia', l.dia,
                       'unidades', l.unidades,
                       'identificadas', l.identificadas)
                     order by l.dia) as dias
      from (select x.ubicacion_id, x.dia,
                   sum(x.cantidad)::integer as unidades,
                   coalesce(sum(x.cantidad) filter (where x.identificada), 0)::integer as identificadas
              from lineas x
             group by x.ubicacion_id, x.dia) l
     group by l.ubicacion_id
  ),
  almacenes as (
    -- El lugar que se cuenta como almacén: el almacén de la tienda, o la ubicación entera (NULL) si no separa piso y almacén.
    select s.id as ubicacion_id,
           (select sb.id from retail.sububicaciones sb
             where sb.ubicacion_id = s.id and sb.tipo = 'almacen_tienda'
             order by sb.id limit 1) as sububicacion_id
      from sedes s
  )
  select s.id,
         s.nombre,
         v_hoy,
         (select (min(v.created_at) at time zone 'America/Lima')::date
            from retail.ventas v
           where v.ubicacion_id = s.id and v.estado = 'completada' and not v.es_prueba),
         retail.fn_ultimo_cuadre_piso(s.id),
         not retail.fn_conteo_arranque_pendiente(s.id, a.sububicacion_id, null, null),
         coalesce(d.dias, '[]'::jsonb)
    from sedes s
    join almacenes a on a.ubicacion_id = s.id
    left join por_dia d on d.ubicacion_id = s.id
   order by s.nombre;
end;
$$;

revoke all on function retail.fn_motor_demanda_preparacion(uuid) from public, anon;
grant execute on function retail.fn_motor_demanda_preparacion(uuid) to authenticated, service_role;

comment on function retail.fn_motor_demanda_preparacion(uuid) is
  'ADR-0344: materia prima de «¿el motor de demanda puede hablar en esta sede?» — por tienda activa: unidades vendidas e '
  'identificadas (no centinela) por día de Lima en los últimos 45 días, primera venta, último cuadre del piso y si el almacén ya '
  'tuvo su conteo de arranque. La regla (90 % sostenido 14 días) vive en lib/motor-demanda-reglas.ts. Sin sede: todas, con el '
  'módulo cayla_global; con sede: también quien la opera.';
