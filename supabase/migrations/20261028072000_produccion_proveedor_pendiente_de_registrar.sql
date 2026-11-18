-- ============================================================================
-- 20261028072000_produccion_proveedor_pendiente_de_registrar.sql — CAYLA V2 (Producción, ADR-0551 act. «pendiente de registrar», 2026-10-27)
--
-- EL PROBLEMA PRIMERO. Felipe registra una orden que el Taller YA hizo y YA mandó a Trujillo, y varias fases las hizo un servicio de afuera que
-- todavía no está cargado como proveedor (`proveedores_produccion` está en 0 filas). Una fase de servicio exigía proveedor Y tarifa mayor que cero
-- (`produccion_fases_quien`, `fase_sin_proveedor`): sin ellos no se podía ni abrir la orden ni avanzar, y Felipe quedó bloqueado.
-- Inventar un proveedor falso con S/ 0.01 de tarifa (la salida que se ofreció) dejaba una deuda y un costo falsos, y una tarifa congelada que no se
-- corrige una vez que la fase empieza.
--
-- LA DECISIÓN (Felipe, 2026-10-27: «construye la opción B: "Pendiente de registrar" en el combo de Afuera»). Una fase de servicio puede quedar
-- PENDIENTE DE REGISTRAR: sale afuera, pero todavía no se sabe con quién ni a cuánto. Se representa SIN columna nueva: servicio con
-- `proveedor_id` nulo (y, por el CHECK, tarifa nula, fijo 0 y mínimo nulo). No cobra nada: su devengado es 0 hasta que se registre quién. Se
-- registra DESPUÉS, en cualquier momento (aunque la fase ya empezó: quién la hizo no cambia lo que pasó con las prendas), con
-- `registrar_proveedor_de_fase`; el devengado se recalcula solo porque se deriva (nunca se guarda).
--
-- ESTADOS IMPOSIBLES (Lamport). `produccion_fases_quien` ahora dice: un servicio es (proveedor y tarifa, o proveedor y fijo en el ploteo) O (nada de
-- eso: pendiente). NO existe «proveedor sin tarifa», «tarifa sin proveedor» ni un pendiente que cobre algo.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_produccion_fases_normalizar` acepta `proveedor_pendiente: true` en una fase de servicio y la deja sin proveedor, tarifa, fijo ni
--            mínimo (conserva la fecha prometida y la nota). `dejar_fase_pendiente_de_registrar` pone una fase que no empezó en ese estado.
--            `registrar_proveedor_de_fase` le pone proveedor y tarifa a una fase pendiente, empezada o no, con la misma validación de siempre.
--            El devengado de una fase pendiente es 0 (`fn_fases_de_orden`). Una fase de servicio SIN `proveedor_pendiente` y sin proveedor sigue
--            rechazada (`fase_sin_proveedor`): un olvido no se vuelve un pendiente.
--   ASUME:   las cuatro funciones vivas a la fecha (anclas verificadas contra los archivos de Producción y contra la definición viva); la tabla
--            `produccion_fases` sin filas que violen el CHECK nuevo (el nuevo es más ancho que el viejo: todo lo que valía, vale).
--   NO HACE: no toca políticas ni datos; no cambia lo que ya se abrió; no impide pasar al stock con una fase pendiente (la pantalla lo AVISA: el
--            costo de las prendas no incluye ese servicio hasta que se registre quién).
--
-- CÓMO SE PEGA. Una sola parte: el `alter table` toma un bloqueo corto sobre `produccion_fases` (sin políticas: no choca con el Asesor de
-- seguridad) y el resto son funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288): cada ancla tiene que aparecer exactamente una vez;
-- si no, se detiene sin tocar nada. Idempotente. Sin `select … into` dentro de un texto entre comillas. Va DESPUÉS de las migraciones de «cinco pasos» y de fecha prometida pasada (PR #1426).
-- ============================================================================
set lock_timeout = '3s';

-- 1. El CHECK: un servicio es completo O pendiente. `create or replace` no existe para un CHECK: se suelta y se vuelve a poner (idempotente).
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then (proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0)))
      or (proveedor_id is null and tarifa_prenda is null and fijo_orden = 0 and cantidad_minima is null)
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);
comment on constraint produccion_fases_quien on retail.produccion_fases is
  'Un servicio dice quién y a cuánto, o queda PENDIENTE DE REGISTRAR (proveedor nulo, sin tarifa ni fijo: no cobra nada hasta que se registre quién, ADR-0551 pendiente de registrar). El Taller no lleva proveedor, tarifa ni fecha prometida.';

-- Cambia `p_ancla` (una sola aparición) por `p_reemplazo` en la función viva. Si el ancla no está y el reemplazo YA está, no hace nada (ya se aplicó).
create or replace function pg_temp.reemplazar_exacto(p_firma text, p_ancla text, p_reemplazo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n = 0 and position(p_reemplazo in v_def) > 0 then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba UNA aparición de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, left(p_ancla, 80), v_n;
  end if;
  execute replace(v_def, p_ancla, p_reemplazo);
end;
$f$;

-- 2. `fn_produccion_fases_normalizar`: una fase de servicio con `proveedor_pendiente: true` no pide proveedor ni tarifa. Va antes de leer el proveedor.
select pg_temp.reemplazar_exacto(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$    v_prov := null; v_tarifa := null; v_fijo := 0; v_min := null; v_fecha := null;
    if v_quien = 'servicio' then
$v$,
  $v$    v_prov := null; v_tarifa := null; v_fijo := 0; v_min := null; v_fecha := null;
    -- ADR-0551 (pendiente de registrar): «pendiente de registrar»: sale afuera, pero todavía no se sabe con quién ni a cuánto. No cobra nada (fijo 0, sin tarifa ni mínimo).
    -- Solo con la marca explícita: un servicio sin proveedor y SIN la marca sigue siendo `fase_sin_proveedor` (un olvido no se vuelve un pendiente).
    if v_quien = 'servicio' and lower(coalesce(v_f ->> 'proveedor_pendiente', 'false')) = 'true' then
      begin
        v_fecha := nullif(v_f ->> 'fecha_prometida', '')::date;
      exception when others then
        raise exception 'La fecha prometida de «%» no es válida', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_invalida';
      end;
      v_salida := v_salida || jsonb_build_object(
        'clave', v_clave, 'posicion', v_posicion, 'secuencia', retail.fn_fase_secuencia(v_clave, v_posicion), 'quien', v_quien,
        'proveedor_id', null, 'tarifa_prenda', null, 'fijo_orden', 0, 'cantidad_minima', null, 'fecha_prometida', v_fecha, 'nota', v_nota);
      continue;
    end if;
    if v_quien = 'servicio' then
$v$);

-- 3. El devengado de una fase pendiente es 0 (sin tarifa, `tarifa × buenas` daba nulo y arrastraba a todo el costo de los servicios).
select pg_temp.reemplazar_exacto(
  'retail.fn_fases_de_orden(uuid)',
  $v$round(v_buenas * v_f.tarifa_prenda + v_f.fijo_orden, 2)$v$,
  $v$round(v_buenas * coalesce(v_f.tarifa_prenda, 0) + v_f.fijo_orden, 2)$v$);

-- 4. La actividad de la orden y su línea de tiempo nombran el servicio aunque todavía no tenga proveedor («un servicio sin registrar»).
select pg_temp.reemplazar_exacto(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$jsonb_array_elements(v_fases) f join retail.proveedores_produccion pr$v$,
  $v$jsonb_array_elements(v_fases) f left join retail.proveedores_produccion pr$v$);
select pg_temp.reemplazar_exacto(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$' con ' || pr.nombre, ', ' order by (f ->> 'secuencia')::int)$v$,
  $v$' con ' || coalesce(pr.nombre, 'un servicio sin registrar'), ', ' order by (f ->> 'secuencia')::int)$v$);
select pg_temp.reemplazar_exacto(
  'retail.fn_orden_produccion(uuid)',
  $v$from retail.produccion_fases f join retail.proveedores_produccion pr on pr.id = f.proveedor_id$v$,
  $v$from retail.produccion_fases f left join retail.proveedores_produccion pr on pr.id = f.proveedor_id$v$);
select pg_temp.reemplazar_exacto(
  'retail.fn_orden_produccion(uuid)',
  $v$' con ' || pr.nombre, ', ' order by f.secuencia)$v$,
  $v$' con ' || coalesce(pr.nombre, 'un servicio sin registrar'), ', ' order by f.secuencia)$v$);

-- 5. Dejar una fase que sale afuera como «pendiente de registrar» (solo si no empezó, igual que `cambiar_quien_fase`).
create or replace function retail.dejar_fase_pendiente_de_registrar(p_fase_id uuid, p_fecha_prometida date default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_n jsonb; v_actor uuid;
begin
  select f.*, p.ubicacion_id, p.estado as estado_orden into v_f
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
  -- Ya pendiente: no hay nada que cambiar (y se puede repetir sin error, aunque la fase ya haya empezado).
  if v_f.quien = 'servicio' and v_f.proveedor_id is null then
    return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
  end if;
  if coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id), 0) <> 0
     or coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = p_fase_id), 0) <> 0
     or retail.fn_produccion_marca_viva(p_fase_id) is not null then
    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', 'servicio', 'proveedor_pendiente', true,
    'fecha_prometida', coalesce(p_fecha_prometida, v_f.fecha_prometida), 'nota', v_f.nota))
    || coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                   from retail.produccion_fases o where o.produccion_id = v_f.produccion_id and o.id <> p_fase_id), '[]'::jsonb)
  ) -> 0;
  update retail.produccion_fases f set
    quien = 'servicio', proveedor_id = null, tarifa_prenda = null, fijo_orden = 0, cantidad_minima = null,
    fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;
comment on function retail.dejar_fase_pendiente_de_registrar(uuid, date) is
  'Pone una fase que no empezó como servicio PENDIENTE DE REGISTRAR: sale afuera sin proveedor ni tarifa y no cobra nada (ADR-0551 pendiente de registrar). Se completa con registrar_proveedor_de_fase.';

-- 6. Registrar quién hizo una fase pendiente: en cualquier momento (aunque ya empezó), mientras la orden siga en proceso.
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
  v_f record; v_n jsonb; v_actor uuid;
begin
  select f.*, p.ubicacion_id, p.estado as estado_orden into v_f
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
  -- La misma validación de siempre (proveedor activo y de servicio, tarifa o fijo, tope, fecha) con las demás fases de la orden como están.
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', 'servicio', 'proveedor_id', p_proveedor_id, 'tarifa_prenda', p_tarifa_prenda,
    'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', coalesce(p_fecha_prometida, v_f.fecha_prometida), 'nota', v_f.nota))
    || coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                   from retail.produccion_fases o where o.produccion_id = v_f.produccion_id and o.id <> p_fase_id), '[]'::jsonb)
  ) -> 0;
  update retail.produccion_fases f set
    proveedor_id = nullif(v_n ->> 'proveedor_id', '')::uuid, tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric,
    fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0), cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer,
    fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;
comment on function retail.registrar_proveedor_de_fase(uuid, uuid, numeric, numeric, integer, date) is
  'Le pone proveedor y tarifa a una fase PENDIENTE DE REGISTRAR, aunque ya haya empezado: quién la hizo no cambia lo que pasó con las prendas (ADR-0551 pendiente de registrar). El devengado se recalcula solo.';

revoke all on function retail.dejar_fase_pendiente_de_registrar(uuid, date) from public, anon;
revoke all on function retail.registrar_proveedor_de_fase(uuid, uuid, numeric, numeric, integer, date) from public, anon;
grant execute on function retail.dejar_fase_pendiente_de_registrar(uuid, date) to authenticated, service_role;
grant execute on function retail.registrar_proveedor_de_fase(uuid, uuid, numeric, numeric, integer, date) to authenticated, service_role;
