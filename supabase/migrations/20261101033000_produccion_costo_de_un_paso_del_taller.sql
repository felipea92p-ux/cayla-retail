-- ============================================================================
-- 20261101033000_produccion_costo_de_un_paso_del_taller.sql — CAYLA V2 (Producción, ADR-0597 · 2026-11-01)
--
-- EL PROBLEMA PRIMERO. El costo de un paso de la orden vivía SOLO en los pasos que salen afuera: tarifa por prenda y fijo por orden de un servicio (ADR-0551, decisión 4). Habilitado se
-- hace en el Taller, así que en la orden OP-000004 (Blusa Claudia, 69 prendas) el cuadro «Costo» decía Ploteo 25.50 y Corte 69.00 y de Habilitado no decía nada: lo que costó preparar las 69 prendas
-- para coser no entraba al costo de la prenda. Y no había cómo corregirlo: la base no deja cambiar QUIÉN hace un paso que ya empezó (`fase_empezada`), así que «mandarlo afuera» obligaba a
-- deshacer 69 prendas ya anotadas.
--
-- QUÉ HACE (sin tablas nuevas, sin políticas, sin `drop trigger`)
--   1. El CHECK `produccion_fases_quien`: un paso del Taller PUEDE llevar tarifa por prenda y fijo por orden (los mismos campos de un servicio). Sigue sin proveedor, sin fecha prometida y sin
--      mínimo: eso solo tiene sentido afuera.
--   2. `fn_fases_de_orden` (reemplazo anclado): el paso del Taller con costo DEVENGA como un servicio —terminadas buenas × tarifa + fijo— desde que empezó; sin costo sigue en null.
--   3. `fn_orden_produccion` (reemplazo anclado): el estimado (tarifa × plan + fijo) y lo devengado de esos pasos suman al cuadro «Costo», igual que los de un servicio.
--   4. `fn_costo_servicios_orden`: suma el devengado de TODO paso con costo, no solo los de afuera: es lo que `cerrar_produccion` reparte entre las prendas buenas (`costo_maquila`).
--   5. `poner_costo_a_fase(fase, tarifa, fijo)`: pone, cambia o quita el costo de un paso del Taller, en cualquier momento mientras la orden esté en proceso (aunque el paso ya haya empezado o
--      terminado: lo que cuesta no cambia lo que pasó con las prendas). Bloquea la orden, deja su rastro en Actividad (quién, cuándo, de cuánto a cuánto) y la ve/usa quien ve los costos del Taller.
--
-- CONTRATO (Liskov)
--   PROMETE: un paso del Taller con costo suma `buenas × tarifa + fijo` al devengado de la orden y `plan × tarifa + fijo` al estimado; sin costo no suma nada y devenga null, como hasta hoy.
--            El costo del paso queda dentro del costo de cada prenda al pasar la orden al stock. Cambiar el costo después de cerrar la orden es imposible (`orden_cerrada`).
--   ASUME:   `fn_fases_de_orden` y `fn_orden_produccion` con el texto de hoy (el reemplazo anclado se DETIENE sin tocar nada si el ancla no aparece exactamente una vez, ADR-0288).
--   NO HACE: no genera una cuenta por pagar ni un gasto (el Taller no le debe a un proveedor); no toca el pago de los servicios; no cambia quién hace el paso.
--
-- DECIDÍ: el costo de un paso del Taller son los MISMOS campos de un servicio (`tarifa_prenda`, `fijo_orden`), no una tabla de «otros costos». Así el devengado, el estimado, el costo por prenda
--   al cerrar y la pantalla usan UNA sola cuenta (principio 4), y Habilitado, Costura o Planchado quedan costeables sin construir una pieza por paso.
-- DESCARTÉ: (1) mandar Habilitado afuera «pendiente de registrar»: sirve para órdenes nuevas pero obliga a deshacer lo ya anotado en las abiertas, y mentiría sobre QUIÉN lo hizo (lo hizo el
--   Taller); (2) una tabla `produccion_otros_costos`: otra fuente de verdad del costo de la misma fase y una lectura más en cada función; (3) un monto tecleado en la orden: el devengado dejaría
--   de seguir a las prendas terminadas y un costo «a mano» no se cruza con nada.
-- SE ROMPE SI: (a) el costo de Habilitado es de una persona que YA está en la planilla del Taller: ese sueldo ya se carga a la prenda por el costo del Taller (ADR-0400, d.5) y poner además
--   una tarifa aquí lo cuenta dos veces; la pantalla lo avisa, pero decidir qué pasa y qué no es de Felipe; (b) alguien vuelve a pegar 20261019192000 o 20261015160000 (recrean
--   `fn_fases_de_orden` / `fn_orden_produccion` enteras) y el costo del Taller deja de sumar: se vuelve a pegar ESTA después; (c) un paso con costo se cambia a «Afuera»: la hoja de «¿Quién la
--   hace?» pide la tarifa del servicio y reemplaza la del Taller, no se suman.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, `lock_timeout = 3s`, sin políticas ni `drop trigger`. El CHECK nuevo es MÁS ANCHO que el que hay (todo lo que valía, vale), así que ninguna fila
-- actual lo viola. Los textos de reemplazo no llevan ninguna lectura con asignación a una variable (el SQL Editor las reescribe: «aprendido 2026-09-30, ADR-0288»). Va DESPUÉS de
-- 20261031194000. Prueba: `pnpm pruebas:produccion-costo-del-paso`.
--
-- CAMINO DE VUELTA (probado en una base local): es el mismo ayudante con los textos al revés, `drop function retail.poner_costo_a_fase(uuid, numeric, numeric)`, el CHECK anterior y
-- `fn_costo_servicios_orden` con su `where f ->> 'quien' = 'servicio'`. Está en `scripts/pruebas/produccion_costo_del_paso.mjs` (caso V), que lo corre y comprueba que las huellas vuelven.
-- Antes de volver, los pasos del Taller que ya tienen costo se limpian (`update … set tarifa_prenda = null, fijo_orden = 0 where quien = 'taller'`), o el CHECK anterior no se puede poner.
-- ============================================================================
set lock_timeout = '3s';

-- 1. El CHECK: un paso del Taller puede llevar su costo (tarifa y fijo); proveedor, fecha prometida y mínimo siguen siendo solo de un servicio.
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then (proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0)))
      or (proveedor_id is null and (clave <> 'ploteo' or tarifa_prenda is null))
    else proveedor_id is null and fecha_prometida is null and cantidad_minima is null
  end
);
comment on constraint produccion_fases_quien on retail.produccion_fases is
  'Un servicio dice quién y a cuánto, o queda PENDIENTE DE REGISTRAR (proveedor nulo): el pendiente puede llevar tarifa, fijo y mínimo y DEVENGA como cualquier servicio (ADR-0551). El ploteo no lleva tarifa por prenda. Un paso del Taller no lleva proveedor, fecha prometida ni mínimo, pero SÍ puede llevar tarifa y fijo: su costo propio (ADR-0597).';

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

-- 2. `fn_fases_de_orden`: el paso del Taller con costo devenga terminadas buenas × tarifa + fijo desde que empezó (antes de empezar, 0); sin costo, null como siempre.
select pg_temp.reemplazar_anclado(
  'retail.fn_fases_de_orden(uuid)',
  $v$when v_f.quien = 'servicio' then 0 else null end;$v$,
  $v$when v_f.quien = 'servicio' then 0
                        when v_f.tarifa_prenda is not null or v_f.fijo_orden > 0
                          then (case when v_empezada then round(v_hechas * coalesce(v_f.tarifa_prenda, 0) + v_f.fijo_orden, 2) else 0 end)
                        else null end;$v$
);

-- 3. `fn_orden_produccion`: el estimado y lo devengado de un paso con costo suman al cuadro «Costo», sea de afuera o del Taller.
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$if v_f ->> 'quien' = 'servicio' then$v$,
  $v$if v_f ->> 'quien' = 'servicio' or (v_f ->> 'tarifa_prenda') is not null or coalesce((v_f ->> 'fijo_orden')::numeric, 0) > 0 then$v$
);

-- 4. Lo devengado por los pasos con costo de la orden (el nombre viene de cuando solo eran servicios): lo que `cerrar_produccion` reparte entre las prendas buenas.
create or replace function retail.fn_costo_servicios_orden(p_produccion_id uuid) returns numeric
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(sum((f ->> 'devengado')::numeric), 0)
    from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb)) f
   where f ->> 'devengado' is not null;
$$;
comment on function retail.fn_costo_servicios_orden(uuid) is
  'ADR-0400 (actividad 6) y ADR-0597: lo devengado por los pasos con costo de la orden —los servicios de afuera Y los pasos del Taller que llevan tarifa o fijo— (buenas × tarifa + fijo, de fn_fases_de_orden). Interna: la usa cerrar_produccion.';

-- 5. Poner, cambiar o quitar el costo de un paso del Taller.
create or replace function retail.poner_costo_a_fase(
  p_fase_id uuid, p_tarifa_prenda numeric default null, p_fijo_orden numeric default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_actor uuid;
  v_t numeric; v_fj numeric;
begin
  -- Se bloquea la ORDEN antes de leer nada (como `cerrar_produccion`): dos personas a la vez se turnan, y el costo no cambia en el instante en que la orden pasa al stock y congela lo devengado.
  perform 1 from retail.producciones o where o.id = (select f0.produccion_id from retail.produccion_fases f0 where f0.id = p_fase_id) for update;
  select f.*, p.ubicacion_id, p.estado as estado_orden, p.numero as numero_orden into v_f
    from retail.produccion_fases f join retail.producciones p on p.id = f.produccion_id where f.id = p_fase_id;
  if v_f.id is null then
    raise exception 'Esa fase no existe' using hint = 'fase_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_f.ubicacion_id);
  if not retail.fn_ve_costos_del_taller(v_f.ubicacion_id) then
    raise exception 'No tienes acceso a los costos de este Taller' using errcode = '42501', hint = 'sin_costos';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_f.estado_orden <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  if v_f.quien <> 'taller' then
    raise exception 'La fase «%» sale afuera: su costo es el del servicio (cámbialo en «¿Quién la hace?»)', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_no_es_del_taller';
  end if;
  if retail.fn_fase_es_hito(v_f.clave) then
    raise exception 'La fase «%» se marca con un toque y no cuenta prendas: no lleva costo por prenda', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_es_hito';
  end if;
  v_t := round(p_tarifa_prenda, 2);
  v_fj := round(coalesce(p_fijo_orden, 0), 2);
  if (v_t is not null and (v_t <= 0 or v_t > 9999.99)) or v_fj < 0 or v_fj > 99999.99 then
    raise exception 'El costo de «%» está fuera de rango', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_tarifa_invalida';
  end if;
  update retail.produccion_fases f set tarifa_prenda = v_t, fijo_orden = v_fj where f.id = p_fase_id;
  -- El rastro: quién, cuándo y de cuánto a cuánto (solo si algo cambió). Cambiar el costo de un paso ya terminado reescribe lo devengado, y eso no puede pasar sin firma.
  if v_f.tarifa_prenda is distinct from v_t or v_f.fijo_orden is distinct from v_fj then
    begin
      perform retail.fn_actividad_anotar(
        'produccion', 'produccion_fase_costo_taller',
        case when v_f.tarifa_prenda is null and v_f.fijo_orden = 0 then 'le puso costo a ' when v_t is null and v_fj = 0 then 'le quitó el costo a ' else 'cambió el costo de ' end
          || retail.fn_fase_nombre(v_f.clave) || ' de la ' || retail.fn_produccion_numero_texto(v_f.numero_orden)
          || ': tarifa ' || coalesce(v_f.tarifa_prenda::text, '—') || ' → ' || coalesce(v_t::text, '—')
          || ', fijo ' || v_f.fijo_orden::text || ' → ' || v_fj::text,
        v_actor, retail.fn_actividad_terminal_ahora(), v_f.ubicacion_id, v_f.ubicacion_id,
        'produccion', v_f.produccion_id::text, now(),
        jsonb_build_object('produccion_id', v_f.produccion_id, 'numero', v_f.numero_orden, 'fase', v_f.clave,
                           'tarifa_antes', v_f.tarifa_prenda, 'tarifa_despues', v_t,
                           'fijo_antes', v_f.fijo_orden, 'fijo_despues', v_fj),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el costo del paso de la orden % (%)', v_f.numero_orden, sqlerrm;
    end;
  end if;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;
comment on function retail.poner_costo_a_fase(uuid, numeric, numeric) is
  'Pone, cambia o quita el costo de un paso que hace el Taller (tarifa por prenda y fijo por orden): devenga terminadas × tarifa + fijo y entra al costo de cada prenda al pasar al stock (ADR-0597). Vale aunque el paso ya haya empezado o terminado, mientras la orden esté en proceso. Bloquea la orden, firma con el responsable y deja su rastro en Actividad. Lo usa quien ve los costos del Taller.';

revoke all on function retail.poner_costo_a_fase(uuid, numeric, numeric) from public, anon;
grant execute on function retail.poner_costo_a_fase(uuid, numeric, numeric) to authenticated, service_role;

reset lock_timeout;
