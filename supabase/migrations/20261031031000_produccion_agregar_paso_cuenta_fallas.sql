-- ============================================================================
-- 20261031031000_produccion_agregar_paso_cuenta_fallas.sql — CAYLA V2 (ADR-0566 · arreglo, 2026-10-31)
--
-- EL PROBLEMA PRIMERO. `agregar_paso_orden` (20261029051000) no deja sumar un paso si uno POSTERIOR ya tiene algo anotado: un avance, una salida, una vuelta o una marca. Pero no miraba
-- `produccion_fallas`. Una fase puede tener SOLO prendas con falla: en Planchado se anotan 3 perdidas («Se quemó») y ninguna buena. Para esta función, Planchado «no había empezado»: el
-- paso nuevo (Ojales y botones) entraba antes, vacío, y Planchado quedaba con 3 perdidas de 0 que le llegaron. La orden no cuadra y no hay forma honesta de arreglarla después.
-- La pantalla ya lo evitaba (lee la fase como empezada y manda al líder a «agregar tarde», ADR-0586); el hueco era una llamada directa a la función. La base es la que manda (principio 2).
-- `agregar_paso_tarde` (20261031002000) ya cuenta las fallas: con esto las dos funciones hermanas dicen lo mismo de cuándo un paso «ya empezó».
--
-- QUÉ HACE: `create or replace` de la MISMA función, con UNA condición más en «un paso posterior ya tiene algo anotado». Firma, permisos, candado, Actividad y respuesta, iguales.
--
-- DECIDÍ: contar cualquier fila de `produccion_fallas` de la fase, sin mirar su destino (perdida, segunda, faltó, arreglo): como avances y salidas, es historia que apunta a la fase.
-- DESCARTÉ: contar solo las fallas que no van a arreglo (como hace «usadas» en `fn_produccion_exigir_cadena`): una falla que vuelve a arreglo igual dice que esas prendas ya pasaron por
--   Planchado; agregar un paso antes y dejarlas sin pasar por él es la misma contradicción. Y descarté arreglarlo solo en la web: la pantalla no es la única que puede llamar a la base.
-- SE ROMPE SI: aparece otra tabla que anote prendas contra una fase (una nueva clase de evento) y nadie la suma aquí ni en `agregar_paso_tarde`; la prueba R5b solo cubre las fallas.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: solo `create or replace` de una función que ya existe, su comentario y sus permisos; no toca las tablas
--   de `auth` ni de `storage` (ADR-0195) y no hay `select … into` dentro de un texto entre comillas (ADR-0288). Va DESPUÉS de 20261029051000.
--   Prueba: `pnpm pruebas:produccion-agregar-paso` (caso R5b).
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.agregar_paso_orden(
  p_produccion_id uuid,
  p_clave text,
  p_quien text default 'taller',
  p_proveedor_id uuid default null,
  p_tarifa_prenda numeric default null,
  p_fijo_orden numeric default null,
  p_cantidad_minima integer default null,
  p_fecha_prometida date default null,
  p_proveedor_pendiente boolean default false,
  p_posicion text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_o record; v_actor uuid; v_clave text; v_ruta jsonb; v_nuevo jsonb; v_seq smallint; v_tarde text; v_prov_nombre text;
begin
  select p.id, p.estado, p.ubicacion_id, p.numero into v_o from retail.producciones p where p.id = p_produccion_id;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  -- Quien llama ve Producción y está parado en ese Taller; hay un responsable que firma (ADR-0161/0162).
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- El candado por orden: el mismo de registrar avance, salida, vuelta y marcar hecha. Con él tomado, lo que se mira abajo ya no cambia hasta el final.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || p_produccion_id::text, 0));
  if (select p.estado from retail.producciones p where p.id = p_produccion_id) <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;

  v_clave := lower(btrim(coalesce(p_clave, '')));
  -- La ruta completa pasa la misma validación que al abrir la orden: las fases que ya están viajan como están (lo que se valida es la FORMA de la ruta, no quién hace cada paso,
  -- igual que en `quitar_paso_orden` y `cambiar_quien_fase`) y el paso nuevo viaja con lo que se le dijo.
  v_ruta := retail.fn_produccion_fases_normalizar(
    coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                from retail.produccion_fases o where o.produccion_id = p_produccion_id), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'clave', v_clave, 'posicion', p_posicion, 'quien', coalesce(nullif(btrim(p_quien), ''), 'taller'), 'proveedor_id', p_proveedor_id,
         'tarifa_prenda', p_tarifa_prenda, 'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', p_fecha_prometida,
         'proveedor_pendiente', coalesce(p_proveedor_pendiente, false))));
  select e into v_nuevo from jsonb_array_elements(v_ruta) e where e ->> 'clave' = v_clave;
  v_seq := (v_nuevo ->> 'secuencia')::smallint;

  -- Ningún paso POSTERIOR puede haber empezado: el nuevo iría antes de sus prendas. Cuenta lo que tenga CUALQUIER fila (aunque esté deshecha): son historia que apunta a la fase.
  select f.clave into v_tarde
    from retail.produccion_fases f
   where f.produccion_id = p_produccion_id and f.secuencia > v_seq
     and (exists (select 1 from retail.produccion_avances a where a.fase_id = f.id)
          or exists (select 1 from retail.produccion_salidas s where s.fase_id = f.id)
          or exists (select 1 from retail.produccion_vueltas vu where vu.fase_id = f.id)
          or exists (select 1 from retail.produccion_fase_marcas m where m.fase_id = f.id)
          -- 20261031031000: una prenda con falla (perdida, segunda, faltó) también es algo anotado en esa fase, aunque no tenga ningún avance.
          or exists (select 1 from retail.produccion_fallas fa where fa.fase_id = f.id))
   order by f.secuencia limit 1;
  if v_tarde is not null then
    raise exception 'La fase «%» ya tiene algo anotado: «%» iría antes de ella y no se puede agregar', retail.fn_fase_nombre(v_tarde), retail.fn_fase_nombre(v_clave)
      using hint = 'paso_despues_empezado';
  end if;

  insert into retail.produccion_fases (produccion_id, clave, secuencia, posicion, quien, proveedor_id, tarifa_prenda, fijo_orden, cantidad_minima, fecha_prometida, nota, creado_por)
  values (p_produccion_id, v_nuevo ->> 'clave', v_seq, nullif(v_nuevo ->> 'posicion', ''), v_nuevo ->> 'quien', nullif(v_nuevo ->> 'proveedor_id', '')::uuid,
          nullif(v_nuevo ->> 'tarifa_prenda', '')::numeric, coalesce(nullif(v_nuevo ->> 'fijo_orden', '')::numeric, 0), nullif(v_nuevo ->> 'cantidad_minima', '')::integer,
          nullif(v_nuevo ->> 'fecha_prometida', '')::date, nullif(btrim(coalesce(v_nuevo ->> 'nota', '')), ''), v_actor);

  -- Actividad (ADR-0207): con quién, sin montos. Si falla, el paso igual queda agregado.
  begin
    select pr.nombre into v_prov_nombre from retail.proveedores_produccion pr where pr.id = nullif(v_nuevo ->> 'proveedor_id', '')::uuid;
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_paso_agregado',
      'agregó el paso ' || retail.fn_fase_nombre(v_clave) || ' a la ' || retail.fn_produccion_numero_texto(v_o.numero)
        || case when v_nuevo ->> 'quien' = 'servicio' then ' (afuera' || coalesce(' con ' || v_prov_nombre, ', pendiente de registrar') || ')' else ' (en el Taller)' end,
      v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'fase', v_clave, 'quien', v_nuevo ->> 'quien',
                         'proveedor_id', nullif(v_nuevo ->> 'proveedor_id', ''), 'tarifa_prenda', nullif(v_nuevo ->> 'tarifa_prenda', ''), 'fijo_orden', v_nuevo ->> 'fijo_orden'),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el paso agregado a la orden % (%)', v_o.numero, sqlerrm;
  end;

  return retail.fn_fases_de_orden(p_produccion_id);
end;
$$;
comment on function retail.agregar_paso_orden(uuid, text, text, uuid, numeric, numeric, integer, date, boolean, text) is
  'ADR-0566: suma UN paso a una orden en proceso (hermana de quitar_paso_orden). La ruta resultante pasa la misma validación que al abrir; no se agrega si un paso posterior ya tiene algo anotado '
  '(paso_despues_empezado; cuentan avances, salidas, vueltas, marcas y prendas con falla). Toma el candado por orden y deja el rastro en Actividad. No mueve dinero. Devuelve fn_fases_de_orden.';

revoke all on function retail.agregar_paso_orden(uuid, text, text, uuid, numeric, numeric, integer, date, boolean, text) from public, anon;

reset lock_timeout;
