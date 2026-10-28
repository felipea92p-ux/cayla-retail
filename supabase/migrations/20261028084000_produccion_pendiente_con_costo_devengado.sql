-- ============================================================================
-- 20261028084000_produccion_pendiente_con_costo_devengado.sql — CAYLA V2 (Producción, ADR-0551 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. «Pendiente de registrar» (20261028072000) deja una fase salir afuera sin saber todavía con quién; pero la dejaba SIN COSTO: sin tarifa, sin fijo, devengado 0. Felipe, el
-- mismo 2026-10-28: «necesito devengar el gasto aunque aún sea un desconocido». El trabajo se hizo y se debe, aunque no se sepa a quién: la orden tiene que mostrar ese costo y el costo por
-- prenda al pasar al stock tiene que incluirlo. La base YA devenga cualquier servicio con tarifa o fijo, tenga proveedor o no (`fn_fases_de_orden`: `buenas × coalesce(tarifa, 0) + fijo`;
-- `fn_orden_produccion` estima `tarifa × plan + fijo`): lo único que lo impedía era que el pendiente se fuerza a tarifa y fijo vacíos en tres lugares.
--
-- QUÉ HACE (sin tablas nuevas, sin políticas)
--   1. El CHECK `produccion_fases_quien`: un servicio es COMPLETO (proveedor y tarifa, o proveedor y fijo en el ploteo) O PENDIENTE (sin proveedor) y un pendiente PUEDE llevar tarifa, fijo
--      y cantidad mínima. Lo que sigue siendo imposible: un servicio con proveedor sin precio, y un ploteo con tarifa por prenda (se cobra por ORDEN).
--   2. `fn_produccion_fases_normalizar` (reemplazo anclado): un pendiente lee y valida la tarifa, el fijo y el mínimo como cualquier servicio (mismos topes), pero NO exige que existan (un
--      pendiente sin monto sigue valiendo y devenga 0, como antes) ni busca la lista de precios (no hay proveedor). El ploteo sigue sin tarifa ni mínimo.
--   3. `dejar_fase_pendiente_de_registrar` pasa de 2 a 6 parámetros (los 4 nuevos con valor por defecto, así que una llamada de dos sigue valiendo): lleva el costo del pendiente, y una fase
--      que YA es pendiente puede ajustarlo en cualquier momento mientras la orden esté en proceso (aunque la fase ya haya empezado: quién la hizo y cuánto cuesta no cambian lo que pasó con
--      las prendas). Pasar a pendiente una fase del Taller o de un proveedor sigue exigiendo que no haya empezado. Una llamada SIN monto sobre un pendiente que ya lo tiene NO lo borra
--      (la pantalla vieja, abierta mientras se pega esto, llamaba así): para borrarlo se pide a propósito con `p_limpiar_costo`.
--   4. `registrar_proveedor_de_fase` se reemplaza entera: al registrar quién CONSERVA el costo que el pendiente ya llevaba si no se manda otro (tarifa, fijo, mínimo), y la lista de precios del
--      proveedor solo manda cuando el pendiente no traía tarifa.
--   5. Las dos funciones bloquean la fila de la ORDEN antes de leer (`for update`), como `cerrar_produccion`: dos personas a la vez se turnan, y un costo no cambia en el mismo instante en que
--      la orden pasa al stock y congela lo devengado. Y las dos dejan su rastro en Actividad (quién, cuándo, de cuánto a cuánto): cambiar el costo de una fase cuyas prendas ya volvieron
--      reescribe lo devengado, y eso no puede pasar sin firma.
--
-- DECIDÍ: el costo del pendiente son los MISMOS campos de un servicio (tarifa por prenda, fijo por orden, mínimo), no un «monto estimado» aparte. Así el devengado, la estimación de la orden,
--   el costo por prenda al cerrar y el «Registrar quién» posterior usan UNA sola cuenta; un concepto nuevo (monto sin proveedor) habría duplicado cada lectura.
-- DESCARTÉ: (1) una columna `costo_estimado`: otra fuente de verdad del costo de la misma fase; (2) que el pendiente EXIJA monto: hay fases cuyo precio tampoco se sabe y el pendiente sin
--   monto es lo que ya se pegó; (3) inventar un proveedor «Desconocido»: deuda y filtros de Por pagar con un proveedor que no existe.
-- SE ROMPE SI: alguien vuelve a pegar `20261028072000` completa DESPUÉS de esta (su bloque en `normalizar` vuelve a forzar el pendiente a cero: el reemplazo anclado de esa
--   migración ya no encuentra su texto y aborta, y como todo va en una transacción del SQL Editor no queda nada a medias); o alguien repega 20261014154000/20261019192000 (candado de md5: se detienen).
--
-- PRODUCCIÓN. Una sola parte, `lock_timeout = 3s`, sin políticas. El CHECK nuevo es MÁS ANCHO que el que hay (todo lo que valía, vale), así que ninguna fila actual lo viola. Dentro de los
--   textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:produccion-proveedor-pendiente`. Va DESPUÉS de 20261028072000 (ya pegada).
-- ============================================================================
set lock_timeout = '3s';

-- 1. El CHECK: completo, o pendiente (con o sin monto). El ploteo se cobra por orden: no lleva tarifa por prenda, ni siquiera pendiente.
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then (proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0)))
      or (proveedor_id is null and (clave <> 'ploteo' or tarifa_prenda is null))
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);
comment on constraint produccion_fases_quien on retail.produccion_fases is
  'Un servicio dice quién y a cuánto, o queda PENDIENTE DE REGISTRAR (proveedor nulo): el pendiente puede llevar tarifa, fijo y mínimo y DEVENGA como cualquier servicio (ADR-0551). El ploteo no lleva tarifa por prenda. El Taller no lleva proveedor, tarifa ni fecha prometida.';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 2. `fn_produccion_fases_normalizar`: el pendiente lee su tarifa, su fijo y su mínimo (opcionales) con los mismos topes de un servicio.
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$      end;
      v_salida := v_salida || jsonb_build_object(
        'clave', v_clave, 'posicion', v_posicion, 'secuencia', retail.fn_fase_secuencia(v_clave, v_posicion), 'quien', v_quien,
        'proveedor_id', null, 'tarifa_prenda', null, 'fijo_orden', 0, 'cantidad_minima', null, 'fecha_prometida', v_fecha, 'nota', v_nota);
      continue;
$v$,
  $v$      end;
      -- ADR-0551 (pendiente con costo): el pendiente PUEDE llevar tarifa, fijo y mínimo, y devenga como un servicio. Ninguno es obligatorio (sin monto devenga 0, como antes).
      begin
        v_tarifa := nullif(btrim(coalesce(v_f ->> 'tarifa_prenda', '')), '')::numeric;
        v_fijo := coalesce(nullif(btrim(coalesce(v_f ->> 'fijo_orden', '')), '')::numeric, 0);
        v_min := nullif(btrim(coalesce(v_f ->> 'cantidad_minima', '')), '')::integer;
      exception when others then
        raise exception 'La tarifa de «%» no es un número válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end;
      if v_clave = 'ploteo' then
        v_tarifa := null; v_min := null;
      end if;
      if (v_tarifa is not null and (v_tarifa <= 0 or v_tarifa > 9999.99)) or v_fijo < 0 or v_fijo > 99999.99 or (v_min is not null and v_min <= 0) then
        raise exception 'La tarifa de «%» está fuera de rango', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end if;
      v_salida := v_salida || jsonb_build_object(
        'clave', v_clave, 'posicion', v_posicion, 'secuencia', retail.fn_fase_secuencia(v_clave, v_posicion), 'quien', v_quien,
        'proveedor_id', null, 'tarifa_prenda', v_tarifa, 'fijo_orden', v_fijo, 'cantidad_minima', v_min, 'fecha_prometida', v_fecha, 'nota', v_nota);
      continue;
$v$
);

-- 3. Dejar una fase como «pendiente de registrar», ahora con su costo. Cambia la lista de parámetros: se suelta la de dos y se crea la de seis (los cuatro nuevos con valor por defecto).
drop function if exists retail.dejar_fase_pendiente_de_registrar(uuid, date);
drop function if exists retail.dejar_fase_pendiente_de_registrar(uuid, date, numeric, numeric, integer);
create or replace function retail.dejar_fase_pendiente_de_registrar(
  p_fase_id uuid, p_fecha_prometida date default null,
  p_tarifa_prenda numeric default null, p_fijo_orden numeric default null, p_cantidad_minima integer default null,
  p_limpiar_costo boolean default false
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_n jsonb; v_actor uuid; v_ya_pendiente boolean;
  v_t numeric := p_tarifa_prenda; v_fj numeric := p_fijo_orden; v_mn integer := p_cantidad_minima;
begin
  -- Se bloquea la ORDEN antes de leer nada (como `cerrar_produccion`): dos personas a la vez se turnan, y el costo no cambia en el instante en que la orden pasa al stock.
  perform 1 from retail.producciones o where o.id = (select f0.produccion_id from retail.produccion_fases f0 where f0.id = p_fase_id) for update;
  select f.*, p.ubicacion_id, p.estado as estado_orden, p.numero as numero_orden into v_f
    from retail.produccion_fases f join retail.producciones p on p.id = f.produccion_id where f.id = p_fase_id;
  if v_f.id is null then
    raise exception 'Esa fase no existe' using hint = 'fase_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_f.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_f.estado_orden <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  v_ya_pendiente := v_f.quien = 'servicio' and v_f.proveedor_id is null;
  -- Una fase del Taller o de un proveedor solo pasa a pendiente si no empezó. Una que YA es pendiente puede ajustar su costo y su fecha en cualquier momento (aunque ya haya empezado).
  if not v_ya_pendiente and (
       coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id), 0) <> 0
       or coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = p_fase_id), 0) <> 0
       or retail.fn_produccion_marca_viva(p_fase_id) is not null) then
    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  -- Una llamada SIN monto sobre un pendiente que ya lo lleva no lo borra (la pantalla vieja llamaba así): para borrarlo se pide a propósito con `p_limpiar_costo`.
  if v_ya_pendiente and not p_limpiar_costo and v_t is null and v_fj is null and v_mn is null then
    v_t := v_f.tarifa_prenda; v_fj := nullif(v_f.fijo_orden, 0); v_mn := v_f.cantidad_minima;
  end if;
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', 'servicio', 'proveedor_pendiente', true,
    'tarifa_prenda', v_t, 'fijo_orden', v_fj, 'cantidad_minima', v_mn,
    'fecha_prometida', coalesce(p_fecha_prometida, v_f.fecha_prometida), 'nota', v_f.nota))
    || coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                   from retail.produccion_fases o where o.produccion_id = v_f.produccion_id and o.id <> p_fase_id), '[]'::jsonb)
  ) -> 0;
  update retail.produccion_fases f set
    quien = 'servicio', proveedor_id = null,
    tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric,
    fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0),
    cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer,
    fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  -- El rastro: quién, cuándo y de cuánto a cuánto (solo si algo cambió).
  if not v_ya_pendiente
     or v_f.tarifa_prenda is distinct from nullif(v_n ->> 'tarifa_prenda', '')::numeric
     or v_f.fijo_orden is distinct from coalesce((v_n ->> 'fijo_orden')::numeric, 0)
     or v_f.cantidad_minima is distinct from nullif(v_n ->> 'cantidad_minima', '')::integer then
    begin
      perform retail.fn_actividad_anotar(
        'produccion', 'produccion_fase_pendiente_costo',
        case when v_ya_pendiente then 'cambió el costo de ' else 'dejó pendiente de registrar ' end || retail.fn_fase_nombre(v_f.clave) || ' de la ' || retail.fn_produccion_numero_texto(v_f.numero_orden)
          || ': tarifa ' || coalesce(v_f.tarifa_prenda::text, '—') || ' → ' || coalesce(nullif(v_n ->> 'tarifa_prenda', ''), '—')
          || ', fijo ' || v_f.fijo_orden::text || ' → ' || coalesce(v_n ->> 'fijo_orden', '0'),
        v_actor, retail.fn_actividad_terminal_ahora(), v_f.ubicacion_id, v_f.ubicacion_id,
        'produccion', v_f.produccion_id::text, now(),
        jsonb_build_object('produccion_id', v_f.produccion_id, 'numero', v_f.numero_orden, 'fase', v_f.clave,
                           'tarifa_antes', v_f.tarifa_prenda, 'tarifa_despues', nullif(v_n ->> 'tarifa_prenda', '')::numeric,
                           'fijo_antes', v_f.fijo_orden, 'fijo_despues', coalesce((v_n ->> 'fijo_orden')::numeric, 0)),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el costo del pendiente de la orden % (%)', v_f.numero_orden, sqlerrm;
    end;
  end if;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;
comment on function retail.dejar_fase_pendiente_de_registrar(uuid, date, numeric, numeric, integer, boolean) is
  'Pone una fase como servicio PENDIENTE DE REGISTRAR: sale afuera sin proveedor, con su costo si se sabe (tarifa por prenda, fijo, mínimo), que devenga como cualquier servicio (ADR-0551). Una que ya es pendiente ajusta su costo en cualquier momento (sin monto no lo borra, salvo p_limpiar_costo); una del Taller o de un proveedor solo si no empezó. Bloquea la orden y deja su rastro en Actividad. Se completa con registrar_proveedor_de_fase.';

revoke all on function retail.dejar_fase_pendiente_de_registrar(uuid, date, numeric, numeric, integer, boolean) from public, anon;
grant execute on function retail.dejar_fase_pendiente_de_registrar(uuid, date, numeric, numeric, integer, boolean) to authenticated, service_role;

-- 4. Registrar quién hizo una fase pendiente: conserva el costo que ya llevaba si no se manda otro, bloquea la orden y deja su rastro. Misma firma que ya tiene producción (no cambia ningún permiso).
create or replace function retail.registrar_proveedor_de_fase(
  p_fase_id uuid, p_proveedor_id uuid, p_tarifa_prenda numeric default null, p_fijo_orden numeric default null,
  p_cantidad_minima integer default null, p_fecha_prometida date default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_n jsonb; v_actor uuid; v_nombre text;
begin
  perform 1 from retail.producciones o where o.id = (select f0.produccion_id from retail.produccion_fases f0 where f0.id = p_fase_id) for update;
  select f.*, p.ubicacion_id, p.estado as estado_orden, p.numero as numero_orden into v_f
    from retail.produccion_fases f join retail.producciones p on p.id = f.produccion_id where f.id = p_fase_id;
  if v_f.id is null then
    raise exception 'Esa fase no existe' using hint = 'fase_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_f.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_f.estado_orden <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  if v_f.quien is distinct from 'servicio' or v_f.proveedor_id is not null then
    raise exception 'La fase «%» no está pendiente de registrar', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_no_pendiente';
  end if;
  -- La misma validación de siempre (proveedor activo y de servicio, tarifa o fijo, tope, fecha) con las demás fases de la orden como están. Lo que el pendiente ya llevaba se conserva si no se manda otro.
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', 'servicio', 'proveedor_id', p_proveedor_id,
    'tarifa_prenda', coalesce(p_tarifa_prenda, v_f.tarifa_prenda),
    'fijo_orden', coalesce(p_fijo_orden, nullif(v_f.fijo_orden, 0)),
    'cantidad_minima', coalesce(p_cantidad_minima, v_f.cantidad_minima),
    'fecha_prometida', coalesce(p_fecha_prometida, v_f.fecha_prometida), 'nota', v_f.nota))
    || coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                   from retail.produccion_fases o where o.produccion_id = v_f.produccion_id and o.id <> p_fase_id), '[]'::jsonb)
  ) -> 0;
  update retail.produccion_fases f set
    proveedor_id = nullif(v_n ->> 'proveedor_id', '')::uuid, tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric,
    fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0), cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer,
    fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  begin
    select pr.nombre into v_nombre from retail.proveedores_produccion pr where pr.id = p_proveedor_id;
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_fase_proveedor_registrado',
      'registró quién hizo ' || retail.fn_fase_nombre(v_f.clave) || ' de la ' || retail.fn_produccion_numero_texto(v_f.numero_orden) || ': ' || coalesce(v_nombre, 'un servicio')
        || ', tarifa ' || coalesce(nullif(v_n ->> 'tarifa_prenda', ''), '—') || ', fijo ' || coalesce(v_n ->> 'fijo_orden', '0'),
      v_actor, retail.fn_actividad_terminal_ahora(), v_f.ubicacion_id, v_f.ubicacion_id,
      'produccion', v_f.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_f.produccion_id, 'numero', v_f.numero_orden, 'fase', v_f.clave, 'proveedor_id', p_proveedor_id,
                         'tarifa_antes', v_f.tarifa_prenda, 'tarifa_despues', nullif(v_n ->> 'tarifa_prenda', '')::numeric,
                         'fijo_antes', v_f.fijo_orden, 'fijo_despues', coalesce((v_n ->> 'fijo_orden')::numeric, 0)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el proveedor registrado de la orden % (%)', v_f.numero_orden, sqlerrm;
  end;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;
comment on function retail.registrar_proveedor_de_fase(uuid, uuid, numeric, numeric, integer, date) is
  'Le pone proveedor a una fase PENDIENTE DE REGISTRAR, aunque ya haya empezado, y CONSERVA el costo que ya llevaba si no se manda otro: quién la hizo no cambia lo que pasó con las prendas (ADR-0551). El devengado se recalcula solo. Bloquea la orden y deja su rastro en Actividad.';

reset lock_timeout;
