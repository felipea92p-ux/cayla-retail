-- Motor de demanda, etapa 0 (ADR-0346, actualización): sin sede, cada cuenta recibe las tiendas que OPERA, sin error.
--
-- EL PROBLEMA PRIMERO. `fn_motor_demanda_preparacion()` sin sede (20261005210000, ya en producción) exigía el módulo «CAYLA Global»
-- y si no lo tenía LANZABA 42501. El barrido de `pruebas:terminales-lecturas` («lo que lee el líder lo lee la terminal», PR #823)
-- llama sin argumentos a toda lectura que usa la puerta de retail (`fn_tiene_acceso_retail`): el líder (Admin) recibía las tiendas y
-- la terminal, un error que tumbaba la prueba. Y una lectura que se cae por no ser Admin es peor que una que devuelve lo suyo.
--
-- QUÉ CAMBIA. Solo la puerta y qué tiendas entran, como `fn_confianza_registro` (20260929100000): quien ve CAYLA Global recibe todas
-- las tiendas activas; los demás, las que operan (`fn_tiene_acceso_retail` y `fn_puede_operar_ubicacion`; el líder las opera todas);
-- quien no opera ninguna, cero filas. Con sede, igual que antes: si no la opera (ni ve CAYLA Global), 42501. El cálculo es, byte a byte,
-- el de 20261005210000.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Un `create or replace` de la misma firma, su `comment` y sus permisos: sin
-- políticas ni `alter table`. Se puede pegar dos veces. La web no cambia: CAYLA Global (Admin) recibe lo mismo de siempre.

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
  -- Quien ve CAYLA Global recibe todas las tiendas; los demás, solo las que operan.
  v_global boolean := retail.fn_ve_modulo('cayla_global') is true;
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
  'cayla_global, las que opera para los demás (cero filas si ninguna). Con sede: 42501 si no la opera ni ve cayla_global.';

reset lock_timeout;
