-- ============================================================================
-- 20261028053000_producto_taller_ojales_y_botones.sql — CAYLA V2 (ADR-0551, actividad 1 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. «Ojales y botones» es un paso de la orden con su proveedor y su costo, y solo corresponde a un modelo que lleva botones. Felipe (2026-10-27) decidió que la
-- orden lo prenda sola cuando el modelo los lleva. Pero la base NO tiene cómo saberlo: en Insumos un botón es solo un «avío» (`insumos.tipo` es `tela` o `avio`, sin forma de
-- distinguirlo por el nombre sin adivinar), y `producto_consumos` exige tela declarada (`tela_por_prenda not null`), así que un modelo sin tela declarada no tiene fila ahí.
--
-- QUÉ HACE (una tabla chica, dos funciones; sin tocar `productos` ni `abrir_orden_produccion`)
--   · `producto_taller`: lo que el Taller sabe de un MODELO y no cambia de una orden a otra. Hoy una sola columna: `lleva_ojales_botones`. Una fila por modelo; NO hay fila = «nadie
--     lo ha preguntado todavía» (distinto de «no lleva»): la primera orden lo pregunta y el modelo se acuerda, como la tela y los avíos (ADR-0513).
--   · `guardar_ojales_botones_modelo(taller, modelo, lleva)`: quien opera ese Taller dice si el modelo los lleva. Idempotente: decir lo mismo no escribe ni anota nada.
--   · `fn_ojales_botones_de_modelos()`: lectura para Nueva orden, una fila por modelo que ya contestó (prefijo `fn_`: la web la trata como lectura y no abre el loader).
--
-- CONTRATO (Liskov)
--   PROMETE: a lo sumo una fila por modelo; `lleva_ojales_botones` nunca es nulo; guardar lo mismo que ya hay no cambia nada; borrar el modelo borra su fila (es configuración del modelo, no
--            historia: la orden ya guardó sus propias fases).
--   ASUME:   `fn_produccion_exigir_operar` (módulo `produccion` y parado en ese Taller), `fn_actor_persona_id(true)` y `fn_actividad_anotar`, como las deja 20261019192000.
--   NO HACE: no cambia ninguna orden abierta ni cerrada, y no decide por sí sola qué fases lleva una orden: solo guarda la respuesta; la hoja de Nueva orden es la que prende el paso.
--
-- DECIDÍ (núcleo mínimo, Tevanian): una tabla propia y NO una columna en `productos`. `productos` es el núcleo del catálogo (lo leen Vender, Existencias, la tienda web) y este dato solo
--   lo usa Producción: puede vivir afuera, así que vive afuera. La respuesta de «no se ha preguntado» es la AUSENCIA de fila, no un `null` en una columna: un `boolean` que admite tres
--   valores obliga a cada lector a recordar cuál de los dos nulos es cuál.
-- DESCARTÉ: (1) una columna en `productos` (toca el núcleo y sus lectores por un dato de un solo módulo); (2) `producto_consumos` (exige tela declarada: el modelo que lleva botones pero
--   cuya tela nadie declaró no podría guardar la respuesta); (3) parchar `abrir_orden_produccion` para que lo guarde al abrir (esa función ya tiene cinco capas de reemplazos anclados:
--   cada una es un riesgo de ancla; y es un hecho del MODELO, no de la orden: si abrir falla, la respuesta sigue siendo verdad); (4) adivinar por el nombre del avío («botón», «botones»,
--   «botoncito»): un avío mal escrito apagaría el paso en silencio.
-- SE ROMPE SI: dos personas contestan lo contrario a la vez desde dos órdenes del mismo modelo: gana la última (la otra queda en Actividad con su nombre, no se pierde); un líder borra el
--   modelo (la fila se va con él por la cascada: es lo esperado); o alguien lee «sin fila» como «no lleva»: la hoja los distingue (pregunta cuando no hay fila).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una tabla nueva con RLS encendido y SIN políticas (solo las funciones la leen; no se tocan las
--   tablas de `auth` ni de `storage`) y dos funciones nuevas. Va DESPUÉS de 20261028052000. Sin `select … into` dentro de un texto entre comillas (ADR-0288).
--   Prueba: `pnpm pruebas:producto-taller`.
-- ============================================================================

set lock_timeout = '3s';

create table if not exists retail.producto_taller (
  producto_id uuid primary key references retail.productos (id) on delete cascade,
  lleva_ojales_botones boolean not null,
  declarado_por uuid references public.personas (id),
  updated_at timestamptz not null default now()
);
comment on table retail.producto_taller is
  'ADR-0551: lo que el Taller sabe de un MODELO y no cambia de una orden a otra. Sin fila = nadie lo ha preguntado todavía. Hoy: si lleva ojales y botones. RLS encendido y sin políticas: solo las funciones lo leen.';
alter table retail.producto_taller enable row level security;
revoke all on table retail.producto_taller from public, anon, authenticated;

create or replace function retail.guardar_ojales_botones_modelo(p_ubicacion_id uuid, p_producto_id uuid, p_lleva boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_ref text;
  v_cambio boolean;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  if not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller') then
    raise exception 'Los ojales y botones del modelo se anotan desde el Taller' using hint = 'ojales_botones_no_es_taller';
  end if;
  if p_lleva is null then
    raise exception 'Di si el modelo lleva ojales y botones' using hint = 'ojales_botones_sin_respuesta';
  end if;
  select p.referencia into v_ref from retail.productos p where p.id = p_producto_id and p.estado_alta <> 'rechazado';
  if v_ref is null then
    raise exception 'Ese modelo no existe' using hint = 'ojales_botones_modelo_inexistente';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  -- Un candado por modelo (ADR-0190): dos respuestas a la vez se forman en fila y la segunda ve lo que dejó la primera.
  perform pg_advisory_xact_lock(hashtextextended('producto_taller:' || p_producto_id::text, 0));
  v_cambio := not exists (select 1 from retail.producto_taller t where t.producto_id = p_producto_id and t.lleva_ojales_botones = p_lleva);
  if not v_cambio then
    return false;
  end if;
  insert into retail.producto_taller (producto_id, lleva_ojales_botones, declarado_por, updated_at)
    values (p_producto_id, p_lleva, v_actor, now())
  on conflict (producto_id) do update
    set lleva_ojales_botones = excluded.lleva_ojales_botones, declarado_por = excluded.declarado_por, updated_at = excluded.updated_at;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'producto_taller_ojales_botones',
      case when p_lleva then 'anotó que ' || v_ref || ' lleva ojales y botones' else 'anotó que ' || v_ref || ' no lleva ojales ni botones' end,
      v_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id,
      'productos', p_producto_id::text, now(),
      jsonb_build_object('producto_id', p_producto_id, 'lleva_ojales_botones', p_lleva),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotaron los ojales y botones del modelo % (%)', p_producto_id, sqlerrm;
  end;
  return true;
end;
$$;
comment on function retail.guardar_ojales_botones_modelo(uuid, uuid, boolean) is
  'ADR-0551: quien opera ese Taller dice si el modelo lleva ojales y botones. Idempotente: devuelve true solo si cambió algo.';
revoke all on function retail.guardar_ojales_botones_modelo(uuid, uuid, boolean) from public, anon;
grant execute on function retail.guardar_ojales_botones_modelo(uuid, uuid, boolean) to authenticated;

create or replace function retail.fn_ojales_botones_de_modelos()
returns table (producto_id uuid, lleva_ojales_botones boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Esta lectura necesita el módulo «Producción» en tu rol' using errcode = '42501', hint = 'produccion_sin_modulo';
  end if;
  return query select t.producto_id, t.lleva_ojales_botones from retail.producto_taller t order by t.producto_id;
end;
$$;
comment on function retail.fn_ojales_botones_de_modelos() is
  'ADR-0551: los modelos que ya dijeron si llevan ojales y botones (Nueva orden prende ese paso sola). Quien ve el módulo Producción.';
revoke all on function retail.fn_ojales_botones_de_modelos() from public, anon;
grant execute on function retail.fn_ojales_botones_de_modelos() to authenticated;

reset lock_timeout;
