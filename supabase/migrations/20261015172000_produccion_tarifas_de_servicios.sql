-- ADR-0400, actividad 8 (2026-10-15): la lista de precios de los servicios de afuera («Servicios y tarifas»), por proveedor y por fase.
--
-- EL PROBLEMA
--   `proveedor_tarifas` (154000) guarda lo que cada servicio cobra por prenda en cada fase, con su cantidad mínima y su fijo por orden, y «Nueva orden» y «Cambiar quién» la leen para SUGERIR la tarifa. Pero nada la
--   escribe: la tabla no tiene políticas y no existía una función para cargarla, así que la sugerencia nunca aparecía y cada orden se abría tecleando la tarifa a mano. La lista de precios de un proveedor es del
--   líder (como sus datos bancarios): quien trabaja en el Taller la lee dentro de «Nueva orden», no la edita.
--
-- QUÉ HACE (funciones; sin tablas nuevas, sin políticas, sin `alter table`)
--   · `fn_tarifas_de_servicios()`: la tarifa VIGENTE de cada servicio (proveedores activos o no, con rubro distinto de tela y avíos) en cada fase, con cuántas versiones tiene y desde cuándo rige. Solo el líder; si no, NULL.
--   · `guardar_tarifa_servicio(proveedor, fase, tarifa, cantidad mínima, fijo, nota)`: carga una tarifa NUEVA con vigencia desde hoy (una renovación es una fila nueva: la anterior queda como historia y las órdenes ya abiertas
--     conservan la suya, porque la fase COPIA la tarifa al abrir). Cargar dos veces el mismo día corrige la de hoy. Solo el líder; firma `fn_actor_persona_id(true)`; anota la actividad sin montos.
--
-- DESCARTÉ
--   · Editar la fila vigente de otro día: cambiaría el pasado de las órdenes que la sugirieron. Una renovación es una fila nueva.
--   · Que cualquiera con Producción la cargue: es un precio de referencia con el que se negocia y se mide (D-31, D-82), igual que las cotizaciones de maquila. Quien lo necesite lo ve sugerido al abrir la orden.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000): solo `create or replace function`; ninguna política ni `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_tarifas_de_servicios() returns jsonb
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select case when retail.fn_es_lider() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'proveedor_id', pr.id, 'proveedor_nombre', pr.nombre, 'rubro', pr.rubro, 'activo', pr.activo,
             'fase_clave', v.fase_clave, 'tarifa_prenda', v.tarifa_prenda, 'cantidad_minima', v.cantidad_minima, 'fijo_orden', v.fijo_orden,
             'vigente_desde', v.vigente_desde, 'nota', v.nota, 'versiones', v.versiones)
           order by pr.nombre, array_position(array['corte','bordado','estampado','costura','lavanderia','acabado'], v.fase_clave))
      from retail.proveedores_produccion pr
      join lateral (
        select distinct on (t.fase_clave) t.fase_clave, t.tarifa_prenda, t.cantidad_minima, t.fijo_orden, t.vigente_desde, t.nota,
               count(*) over (partition by t.fase_clave) as versiones
          from retail.proveedor_tarifas t
         where t.proveedor_id = pr.id and t.vigente_desde <= retail.fn_hoy_lima()
         order by t.fase_clave, t.vigente_desde desc
      ) v on true
     where pr.rubro not in ('tela', 'avios')), '[]'::jsonb)
  end
$$;

comment on function retail.fn_tarifas_de_servicios() is
  'ADR-0400 (actividad 8): la tarifa vigente de cada servicio de afuera en cada fase (con sus versiones y desde cuándo rige). Solo el líder; NULL si no.';

create or replace function retail.guardar_tarifa_servicio(
  p_proveedor_id uuid, p_fase_clave text, p_tarifa_prenda numeric, p_cantidad_minima integer default null, p_fijo_orden numeric default 0, p_nota text default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pr record; v_actor uuid; v_id uuid; v_nota text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder carga la lista de precios de los servicios de afuera' using errcode = '42501', hint = 'tarifa_solo_lider';
  end if;
  select pr.id, pr.nombre, pr.rubro into v_pr from retail.proveedores_produccion pr where pr.id = p_proveedor_id;
  if v_pr.id is null then
    raise exception 'Ese proveedor no existe' using hint = 'tarifa_proveedor_inexistente';
  end if;
  if v_pr.rubro in ('tela', 'avios') then
    raise exception '% vende tela o avíos, no un servicio de afuera: su lista de precios no lleva fases', v_pr.nombre using hint = 'tarifa_no_es_servicio';
  end if;
  if p_fase_clave is null or p_fase_clave not in ('corte', 'costura', 'acabado', 'bordado', 'estampado', 'lavanderia') then
    raise exception 'Elige la fase a la que se le pone precio' using hint = 'tarifa_fase_invalida';
  end if;
  if p_tarifa_prenda is null or p_tarifa_prenda <= 0 or p_tarifa_prenda > 99999 then
    raise exception 'La tarifa por prenda es un monto mayor que cero' using hint = 'tarifa_monto_invalido';
  end if;
  if p_cantidad_minima is not null and p_cantidad_minima <= 0 then
    raise exception 'La cantidad mínima es de una prenda en adelante (o se deja vacía si el servicio no pide mínimo)' using hint = 'tarifa_minimo_invalido';
  end if;
  if coalesce(p_fijo_orden, 0) < 0 or coalesce(p_fijo_orden, 0) > 99999 then
    raise exception 'El fijo por orden es cero o más (el ponchado de un bordado, por ejemplo)' using hint = 'tarifa_fijo_invalido';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  v_actor := retail.fn_actor_persona_id(true);

  insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima, fijo_orden, vigente_desde, nota, creado_por)
    values (p_proveedor_id, p_fase_clave, round(p_tarifa_prenda, 2), p_cantidad_minima, round(coalesce(p_fijo_orden, 0), 2), retail.fn_hoy_lima(), v_nota, v_actor)
  on conflict (proveedor_id, fase_clave, vigente_desde) do update
    set tarifa_prenda = excluded.tarifa_prenda, cantidad_minima = excluded.cantidad_minima, fijo_orden = excluded.fijo_orden, nota = excluded.nota, creado_por = excluded.creado_por
  returning id into v_id;

  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'tarifa_servicio_guardada',
      'cargó la tarifa de ' || v_pr.nombre || ' para ' || retail.fn_fase_nombre(p_fase_clave),
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_ubicacion_actual_persona(), retail.fn_ubicacion_actual_persona(),
      'proveedor_tarifas', v_id::text, now(),
      jsonb_build_object('proveedor_id', p_proveedor_id, 'fase', p_fase_clave), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la tarifa de % (%)', v_pr.nombre, sqlerrm;
  end;
  return v_id;
end;
$$;

comment on function retail.guardar_tarifa_servicio(uuid, text, numeric, integer, numeric, text) is
  'ADR-0400 (actividad 8): carga una tarifa NUEVA de un servicio de afuera para una fase, vigente desde hoy (la anterior queda como historia). Solo el líder.';

revoke all on function retail.fn_tarifas_de_servicios() from public, anon;
revoke all on function retail.guardar_tarifa_servicio(uuid, text, numeric, integer, numeric, text) from public, anon;
grant execute on function retail.fn_tarifas_de_servicios() to authenticated, service_role;
grant execute on function retail.guardar_tarifa_servicio(uuid, text, numeric, integer, numeric, text) to authenticated, service_role;

reset lock_timeout;
