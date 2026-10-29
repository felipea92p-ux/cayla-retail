-- ============================================================================
-- 20261029051000_produccion_agregar_paso_a_la_orden.sql — CAYLA V2 (ADR-0566, actividad 1 · 2026-10-29)
--
-- EL PROBLEMA PRIMERO. «Ojales y botones» es un paso opcional de la orden (ADR-0551): nace prendido si el modelo lleva botones. Pero una orden que se abrió SIN ese paso no tiene cómo
-- sumarlo: la ruta salta de Costura a Planchado y nadie puede anotar el trabajo del ojal y el botón ni lo que cuesta. Felipe lo pidió el 2026-10-29 con la captura de la orden del Chaleco.
-- La actividad 1b del ADR-0551 dejó `quitar_paso_orden` y escribió, a propósito: «NO HAY «AGREGAR PASO»… se pide una función hermana». Esta es esa función.
--
-- QUÉ HACE (una función nueva; sin tablas, sin políticas, sin `alter`)
--   · `agregar_paso_orden(orden, clave, …)` suma UN paso a una orden en proceso: quién lo hace (el Taller o un servicio de afuera con su proveedor, tarifa por prenda, fijo, mínimo y
--     fecha prometida, o «pendiente de registrar»). El lugar en la ruta lo da `fn_fase_secuencia` (Ojales y botones, entre Costura y Planchado): la fila nueva entra sola en su lugar.
--   · La ruta resultante pasa la MISMA validación que al abrir la orden (`fn_produccion_fases_normalizar`): un paso repetido, una clave que no existe, un servicio sin proveedor o sin tarifa
--     y la mezcla de la ruta anterior con la nueva se rechazan igual que al abrir, con los mismos `hint`.
--   · NO se agrega un paso si alguno POSTERIOR ya tiene algo anotado (un avance, una salida, una vuelta o una marca, aunque estén deshechos): el paso nuevo iría ANTES de esas prendas y los
--     conteos quedarían contradictorios (Planchado con 20 hechas y Ojales y botones con 0). Responde `paso_despues_empezado`.
--   · Es lo mismo que ya exige `quitar_paso_orden`: ve Producción, está parado en ese Taller y firma un responsable (ADR-0162); toma el candado por orden (el mismo de registrar avance,
--     salida, vuelta y marcar hecha) y queda en Actividad. Devuelve `fn_fases_de_orden`, como su hermana.
--
-- CONTRATO (Liskov)
--   PROMETE: agrega a lo sumo UN paso por llamada y solo si la ruta resultante es válida; nunca cambia ni borra una fase que ya estaba; no mueve dinero (el costo de un servicio se devenga al
--            registrar su vuelta, como siempre); no toca el modelo (`producto_taller`): quien «lo recuerda» es la web, con `guardar_ojales_botones_modelo`; repetir el mismo paso responde
--            `fase_repetida` y no escribe nada. Si algo falla, la orden queda como estaba (todo o nada).
--   ASUME:   `fn_produccion_fases_normalizar(jsonb)`, `fn_fase_secuencia(text, text)`, `fn_produccion_exigir_operar(uuid)`, `fn_actor_persona_id(boolean)`, `fn_fases_de_orden(uuid)` y
--            `fn_actividad_anotar` como las dejan las migraciones hasta 20261028221000. El estado de una fase se DERIVA (no hay columna): una fila nueva nace «pendiente» sin tocar nada más.
--   NO HACE: no deja agregar un paso a una orden cerrada o anulada, no cambia quién hace un paso ya existente (para eso, `cambiar_quien_fase`) y no decide qué pasos ofrece la pantalla.
--
-- DECIDÍ: una función aparte, hermana de `quitar_paso_orden` y con su misma forma, y NO ampliar `cambiar_quien_fase` ni `abrir_orden_produccion`. Agregar una fila a la ruta y cambiar
--   quién hace una fase existente son dos hechos distintos con dos reglas distintas («ya empezó» mira esa fase; «un paso posterior ya empezó» mira las que vienen después).
--   El paso nuevo viaja por el MISMO validador que al abrir, así que la lista de pasos válidos y sus reglas siguen viviendo en un solo lugar.
-- DESCARTÉ: (a) guardar los pasos opcionales «apagados» y reactivarlos: cada lector de la ruta (cierre, lista, Resumen) tendría que saltarse las filas apagadas, y las órdenes que ya están
--   abiertas no las tienen; (b) anular la orden y abrirla de nuevo: pierde la historia y la tela ya descontada; (c) un SQL puntual para el Chaleco: la próxima orden pide lo mismo;
--   (d) dejar agregar un paso antes de uno ya empezado y «arreglar» los conteos: no hay forma honesta de decir cuántas prendas pasaron por un paso que no existía cuando se hicieron.
-- SE ROMPE SI: alguien anota el primer avance de Planchado en el mismo instante en que otra persona agrega el paso: lo impide el candado por orden (`registrar_avance`, `registrar_salida`,
--   `registrar_vuelta` y `marcar_fase_hecha` toman la misma llave: una de las dos espera a la otra y la segunda ve lo que dejó la primera). O alguien empezó y DESHIZO Planchado: las filas
--   deshechas cuentan como «empezado» (son historia que apunta a la fase) y el paso ya no se puede agregar; se dice cuál es la fase y por qué.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: solo `create or replace` de una función nueva, su comentario y sus permisos; no toca las tablas de
--   `auth` ni de `storage` (ADR-0195) y no hay `select … into` dentro de ningún texto entre comillas (ADR-0288: la función va en un cuerpo `$$ … $$`). Va DESPUÉS de 20261029021000.
--   Prueba: `pnpm pruebas:produccion-agregar-paso`.
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
          or exists (select 1 from retail.produccion_fase_marcas m where m.fase_id = f.id))
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
  '(paso_despues_empezado). Toma el candado por orden y deja el rastro en Actividad. No mueve dinero. Devuelve fn_fases_de_orden.';

revoke all on function retail.agregar_paso_orden(uuid, text, text, uuid, numeric, numeric, integer, date, boolean, text) from public, anon;

reset lock_timeout;
