-- Análisis v4 (ADR-0357): «¿Ya puedo recomendar?» de las 3 tiendas para quien tiene Análisis.
--
-- EL PROBLEMA PRIMERO. El nuevo Análisis muestra, cuando los datos todavía no alcanzan, el estado «Todavía no» de cada tienda (la
-- misma regla de ADR-0346 que CAYLA Global). Felipe decidió (2026-10-06) que en Análisis la encargada y el líder vean LO MISMO: las
-- tres tiendas. Hoy `fn_motor_demanda_preparacion` solo da todas las tiendas a quien ve CAYLA Global; a una encargada le daba solo
-- la suya, y con otra sede le respondía 42501.
--
-- QUÉ CAMBIA. Una sola condición: quien puede analizar (`fn_puede_analizar`: líder o rol con el módulo Análisis) recibe las tiendas
-- activas igual que quien ve CAYLA Global. Son unidades vendidas por día, sin dinero ni prendas. El cálculo es, byte a byte, el de
-- 20261005223000.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Un `create or replace` de la misma firma, su `comment` y sus permisos: sin
-- políticas ni `alter table`. Se puede pegar dos veces.

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
  -- Quien ve CAYLA Global o puede analizar recibe todas las tiendas (Análisis v4: encargada y líder ven lo mismo); los demás, solo
  -- las que operan.
  v_global boolean := (retail.fn_ve_modulo('cayla_global') is true) or (retail.fn_puede_analizar() is true);
  v_acceso boolean := retail.fn_tiene_acceso_retail();
begin
  if p_ubicacion_id is not null
     and not (v_global or (v_acceso and retail.fn_puede_operar_ubicacion(p_ubicacion_id))) then
    raise exception 'Para ver el estado del motor de esta sede hace falta operarla'
      using errcode = '42501', hint = 'motor_demanda_sin_sede';
  end if;

  return query
  with sedes as materialized (
    select u.id, u.nombre
      from retail.ubicaciones u
     where u.activo and u.tipo = 'tienda'
       and (p_ubicacion_id is null or u.id = p_ubicacion_id)
       and (v_global or (v_acceso and retail.fn_puede_operar_ubicacion(u.id)))
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
  'ADR-0346: materia prima de «¿el motor de demanda puede hablar en esta sede?» — por tienda: unidades vendidas e identificadas (no '
  'centinela) por día de Lima en los últimos 45 días, primera venta, último cuadre del piso y si el almacén ya tuvo su conteo de '
  'arranque. La regla (90 % sostenido 14 días) vive en lib/motor-demanda-reglas.ts. Sin sede: todas las tiendas para quien ve '
  'cayla_global o puede analizar (ADR-0357), las que opera para los demás (cero filas si ninguna). Con sede: 42501 si no la opera, '
  'ni ve cayla_global, ni puede analizar.';

reset lock_timeout;
