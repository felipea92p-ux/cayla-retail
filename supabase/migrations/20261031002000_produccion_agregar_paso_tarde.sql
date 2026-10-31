-- ============================================================================
-- 20261031002000_produccion_agregar_paso_tarde.sql — CAYLA V2 (ADR-0586, actividad 1 · 2026-10-30)
--
-- EL PROBLEMA PRIMERO. La orden del Short Sastre Recover terminó todos sus pasos y nadie anotó «Ojales y botones»: el trabajo SÍ se hizo (lo hizo un servicio de afuera y cobra), pero
-- la ruta salta de Costura a Planchado. «Agregar un paso» (ADR-0566, `agregar_paso_orden`) lo rechaza con `paso_despues_empezado`, a propósito: si el paso entrara vacío, lo que entra a
-- Planchado pasaría a ser lo hecho en Ojales (0) y Planchado quedaría con 16 hechas de 0 que le entraron; se traba y Costura pierde su candado (`fn_produccion_exigir_cadena` mira al paso
-- siguiente). Felipe, el 2026-10-30: el paso olvidado entra en su lugar, con motivo, solo el líder, con las prendas de un toque y la fecha en que volvió (hoy por defecto).
--
-- QUÉ HACE (una función nueva; la historia de la orden acepta una acción más; sin tablas, sin políticas)
--   · `agregar_paso_tarde(orden, clave, motivo, día, quién…)`: SOLO un líder (`fn_es_lider`) suma UN paso olvidado a una orden en proceso cuando un paso POSTERIOR ya tiene algo anotado
--     (aunque esté deshecho, o sean solo prendas con falla), y en la MISMA transacción anota que ese paso se hizo con las prendas que YA PASARON por él, talla por talla: las que el paso
--     siguiente ya usó (sus buenas y sus fallas que no se arreglan, o lo que salió a su servicio; la misma cuenta de `fn_produccion_exigir_cadena`). Lo que todavía no llegó al paso siguiente
--     no se da por hecho: se anota cuando se haga, como en cualquier paso. Si el paso siguiente no usó nada (lo anotado se deshizo), el paso entra vacío.
--       - en el Taller, con la regla de «Terminé» (`fn_produccion_escribir_termine`): las mismas filas que una persona anotaría a mano, con su día real (`hecho_en`);
--       - afuera, como una salida y una vuelta de todas esas prendas, buenas: el costo del servicio se devenga como siempre (buenas × tarifa + fijo), sin una regla aparte;
--       - afuera «pendiente de registrar»: igual, y su costo sigue el de cualquier pendiente (ADR-0551).
--     Así la cadena de la ruta queda cuadrada desde el primer instante: lo que entra a Planchado vuelve a ser lo mismo que antes.
--   · Deja la marca en `produccion_cambios` (acción nueva `paso_tarde`, con el motivo y el antes/después) y en Actividad. La web lee la marca de ahí: el paso dice «Agregado tarde».
--
-- CONTRATO (Liskov)
--   PROMETE: agrega a lo sumo UN paso, solo si la ruta resultante es válida (el MISMO validador de abrir y de agregar) y solo si algún paso posterior tiene algo anotado (si no, ese paso se
--            agrega con `agregar_paso_orden` y se anota cuando se haga: `paso_no_es_tarde`); nunca cambia ni borra lo anotado en las otras fases; nunca da por hecho más de lo que el paso
--            siguiente ya usó (no inventa trabajo ni costo); deja la cadena igual para todo lo que viene después; todo o nada. No toca el modelo (`producto_taller`) ni el stock.
--   ASUME:   `fn_produccion_fases_normalizar`, `fn_produccion_exigir_operar`, `fn_es_lider`, `fn_actor_persona_id(true)`, `fn_produccion_motivo_cambio`, `fn_produccion_fecha_real`,
--            `fn_produccion_entrada_variante`, `fn_produccion_fase_anterior`, `fn_produccion_escribir_termine`, `fn_fase_es_hito`, `fn_fases_de_orden` y el catálogo `procesos_produccion`
--            como los dejan las migraciones hasta 20261030223000. El estado de una fase se DERIVA de lo anotado: lo que se escribe aquí la deja «hecha» sin tocar nada más.
--   NO HACE: no reabre ni corrige pasos (actividades 2 a 5 del ADR-0586); no deja agregar tarde un hito (Ploteo se marca); no pide talla por talla (Felipe eligió «todas, de un toque»).
--
-- DECIDÍ: una función aparte, solo del líder, que agrega Y anota en la misma transacción lo que el paso siguiente ya usó, y no quitar el candado de `agregar_paso_orden`.
-- DESCARTÉ: (a) levantar `paso_despues_empezado` en `agregar_paso_orden` con un motivo: el paso entraría con 0 y la cadena se rompe (Planchado con más de lo que le entró, Costura sin candado);
--   (b) sumarle un `p_motivo` a `agregar_paso_orden`: cambia su firma, deja dos funciones con el mismo nombre y rompe las suites que la llaman por posición (`produccion_ploteo`,
--   `produccion_catalogo_de_procesos`); (c) una columna `agregada_tarde` en `produccion_fases`: sería un `alter` sobre una tabla en uso y otra fuente de verdad de lo que ya dice la historia;
--   (d) pedir las cantidades talla por talla: más lento, y la base igual las acota; (e) dar por hechas TODAS las buenas del paso anterior: con Costura en 50 y Planchado en 2 anotaría 48
--   prendas que no pasaron por el paso (y, afuera, un costo que no se puede anular porque Planchado ya usó parte de esa vuelta). Lo que ya usó el paso siguiente es lo único que se sabe
--   que pasó; en la orden del Short (todo hecho) es el mismo número.
-- SE ROMPE SI: alguien anota en Planchado en el mismo instante en que el líder agrega el paso tarde: el candado por orden (el de avance, salida, vuelta y marcar hecha) los turna y el segundo
--   ve lo que dejó el primero. Y la orden se pasa al stock o se anula en el mismo instante: `cerrar_produccion` y `anular_produccion` bloquean la FILA de la orden (no el candado), así que
--   esta función también la bloquea antes de mirar su estado; si no, el costo del servicio podría quedar fuera del costo de la orden ya cerrada.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: el `alter` de dos CHECK de `produccion_cambios` (tabla sin políticas: no toma las de `auth`/`storage`,
--   ADR-0195) y una función nueva en un cuerpo `$$ … $$` (sin `select … into` dentro de un texto entre comillas, ADR-0288). Va DESPUÉS de 20261029210000.
--   Prueba: `pnpm pruebas:produccion-paso-tarde`.
-- ============================================================================

set lock_timeout = '3s';

-- 1. La historia de la orden guarda también un paso agregado tarde: con su motivo, la fase que se agregó y lo que se anotó en ella.
alter table retail.produccion_cambios drop constraint if exists produccion_cambios_accion_check;
alter table retail.produccion_cambios add constraint produccion_cambios_accion_check check (accion in ('corregir', 'eliminar', 'restaurar', 'nota', 'sin_tela', 'paso_tarde'));
alter table retail.produccion_cambios drop constraint if exists produccion_cambios_forma;
alter table retail.produccion_cambios add constraint produccion_cambios_forma check (case accion
  when 'nota' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'sin_tela' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'eliminar' then objeto is not null and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'corregir' then objeto = 'termine' and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) > 0 and restaura_id is null
  when 'restaurar' then objeto is not null and fase_id is not null and cardinality(quita_ids) = 0 and cardinality(pone_ids) > 0 and restaura_id is not null
  -- Un paso agregado tarde: dice qué fase nació y qué anotó en ella (nada, si el paso siguiente no había usado prendas); no quita nada.
  when 'paso_tarde' then objeto is null and fase_id is not null and cardinality(quita_ids) = 0 and restaura_id is null
  else false end);

-- 2. Agregar un paso olvidado, ya hecho.
create or replace function retail.agregar_paso_tarde(
  p_produccion_id uuid,
  p_clave text,
  p_motivo text,
  p_hecho_en date default null,
  p_quien text default 'taller',
  p_proveedor_id uuid default null,
  p_tarifa_prenda numeric default null,
  p_fijo_orden numeric default null,
  p_cantidad_minima integer default null,
  p_proveedor_pendiente boolean default false,
  p_posicion text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_o record; v_actor uuid; v_motivo text; v_clave text; v_hecho timestamptz; v_ruta jsonb; v_nuevo jsonb; v_seq smallint; v_tarde text;
  v_fase uuid; v_quien text; v_linea record; v_n integer; v_lineas jsonb := '[]'::jsonb; v_total integer := 0; v_res jsonb;
  v_salida uuid; v_vuelta uuid; v_avance uuid; v_ids uuid[] := '{}'; v_prov_nombre text; v_cambio uuid; v_sig uuid;
begin
  select p.id, p.estado, p.ubicacion_id, p.numero into v_o from retail.producciones p where p.id = p_produccion_id;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  -- Quien llama ve Producción, está parado en ese Taller y es líder: esto corrige la historia de la orden y puede sumarle costo (Felipe, 2026-10-30).
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder agrega un paso que se olvidó: corrige la historia de la orden' using errcode = '42501', hint = 'paso_tarde_solo_lider';
  end if;
  v_motivo := retail.fn_produccion_motivo_cambio(p_motivo);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- El candado por orden: el mismo de registrar avance, salida, vuelta, marcar hecha y agregar un paso. Con él tomado, lo que se mira abajo ya no cambia hasta el final.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || p_produccion_id::text, 0));
  -- Y la fila de la orden, como `cerrar_produccion`, `anular_produccion` y `registrar_proveedor_de_fase`: este paso puede sumar costo y no puede cruzarse con un cierre.
  perform 1 from retail.producciones p where p.id = p_produccion_id for update;
  if (select p.estado from retail.producciones p where p.id = p_produccion_id) <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;

  v_clave := lower(btrim(coalesce(p_clave, '')));
  if not exists (select 1 from retail.procesos_produccion pp where pp.clave = v_clave and pp.activo) then
    raise exception 'Ese proceso no está en el catálogo o está apagado: actívalo en Servicios y tarifas' using hint = 'proceso_apagado';
  end if;
  if retail.fn_fase_es_hito(v_clave) then
    raise exception '«%» se marca como hecho, no cuenta prendas: no se agrega tarde', retail.fn_fase_nombre(v_clave) using hint = 'paso_tarde_hito';
  end if;
  -- El día en que se hizo de verdad: hoy (nulo) o un día entre la apertura de la orden y hoy (los mismos rechazos que «Terminé»).
  v_hecho := retail.fn_produccion_fecha_real(p_produccion_id, p_hecho_en);

  -- La ruta completa pasa la misma validación que al abrir y al agregar un paso (`agregar_paso_orden`).
  v_ruta := retail.fn_produccion_fases_normalizar(
    coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                from retail.produccion_fases o where o.produccion_id = p_produccion_id), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'clave', v_clave, 'posicion', p_posicion, 'quien', coalesce(nullif(btrim(p_quien), ''), 'taller'), 'proveedor_id', p_proveedor_id,
         'tarifa_prenda', p_tarifa_prenda, 'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', null,
         'proveedor_pendiente', coalesce(p_proveedor_pendiente, false))));
  select e into v_nuevo from jsonb_array_elements(v_ruta) e where e ->> 'clave' = v_clave;
  v_seq := (v_nuevo ->> 'secuencia')::smallint;
  v_quien := v_nuevo ->> 'quien';

  -- Es «tarde» solo si un paso POSTERIOR ya tiene algo anotado (lo que frena a `agregar_paso_orden`, más las prendas con falla). Si no, el paso se agrega vacío y se anota cuando se haga.
  select f.clave into v_tarde
    from retail.produccion_fases f
   where f.produccion_id = p_produccion_id and f.secuencia > v_seq
     and (exists (select 1 from retail.produccion_avances a where a.fase_id = f.id)
          or exists (select 1 from retail.produccion_salidas s where s.fase_id = f.id)
          or exists (select 1 from retail.produccion_vueltas vu where vu.fase_id = f.id)
          or exists (select 1 from retail.produccion_fase_marcas m where m.fase_id = f.id)
          or exists (select 1 from retail.produccion_fallas fa where fa.fase_id = f.id))
   order by f.secuencia limit 1;
  if v_tarde is null then
    raise exception 'Ningún paso de después de «%» empezó: agrégalo con «Agregar un paso» y anota su trabajo cuando se haga', retail.fn_fase_nombre(v_clave)
      using hint = 'paso_no_es_tarde';
  end if;

  insert into retail.produccion_fases (produccion_id, clave, secuencia, posicion, quien, proveedor_id, tarifa_prenda, fijo_orden, cantidad_minima, fecha_prometida, nota, creado_por)
  values (p_produccion_id, v_nuevo ->> 'clave', v_seq, nullif(v_nuevo ->> 'posicion', ''), v_quien, nullif(v_nuevo ->> 'proveedor_id', '')::uuid,
          nullif(v_nuevo ->> 'tarifa_prenda', '')::numeric, coalesce(nullif(v_nuevo ->> 'fijo_orden', '')::numeric, 0), nullif(v_nuevo ->> 'cantidad_minima', '')::integer,
          null, nullif(btrim(coalesce(v_nuevo ->> 'nota', '')), ''), v_actor)
  returning id into v_fase;
  if retail.fn_produccion_fase_anterior(v_fase) is null then
    raise exception '«%» sería el primer paso que cuenta prendas: no hay de dónde le lleguen', retail.fn_fase_nombre(v_clave) using hint = 'paso_tarde_primero';
  end if;

  -- Las prendas que YA PASARON por el paso, talla por talla: las que el paso siguiente ya usó (sus buenas y sus fallas que no se arreglan, o lo que salió a su servicio), la misma cuenta
  -- de `fn_produccion_exigir_cadena`. Nunca más de lo que le entra (las buenas del paso de antes): por la cadena no puede pasar, y si pasara no se inventa.
  v_sig := retail.fn_produccion_fase_siguiente(v_fase);
  for v_linea in select l.variante_id from retail.produccion_lineas l where l.produccion_id = p_produccion_id order by l.variante_id loop
    v_n := least(
      retail.fn_produccion_entrada_variante(v_fase, v_linea.variante_id),
      greatest(
        coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_sig and a.variante_id = v_linea.variante_id), 0)
          + coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_sig and fa.variante_id = v_linea.variante_id and fa.destino <> 'arreglo'), 0),
        coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                   where s.fase_id = v_sig and sl.variante_id = v_linea.variante_id), 0)));
    if v_n > 0 then
      v_lineas := v_lineas || jsonb_build_object('variante_id', v_linea.variante_id, 'cantidad', v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- Si el paso siguiente no usó nada (lo anotado se deshizo), el paso entra vacío y se trabaja como cualquier otro.
  if v_total = 0 then
    null;
  elsif v_quien = 'taller' then
    -- La regla de «Terminé», la misma que usa una persona: valida que nada pase de lo que entró y escribe con el día real.
    v_res := retail.fn_produccion_escribir_termine(v_fase, v_lineas, null, 'Paso agregado tarde', v_hecho, v_actor);
    select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(v_res -> 'avance_ids') x;
  else
    -- Afuera: salieron todas y volvieron todas buenas. La vuelta es lo que devenga el servicio, como en `registrar_vuelta`.
    insert into retail.produccion_salidas (fase_id, guia, nota, hecho_por, created_at)
      values (v_fase, null, 'Paso agregado tarde', v_actor, clock_timestamp()) returning id into v_salida;
    insert into retail.produccion_vueltas (fase_id, guia, nota, hecho_por, created_at)
      values (v_fase, null, 'Paso agregado tarde', v_actor, clock_timestamp()) returning id into v_vuelta;
    for v_linea in select (e ->> 'variante_id')::uuid as variante_id, (e ->> 'cantidad')::integer as cantidad from jsonb_array_elements(v_lineas) e loop
      insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (v_salida, v_linea.variante_id, v_linea.cantidad);
      insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas, segundas, faltantes, motivo) values (v_vuelta, v_linea.variante_id, v_linea.cantidad, 0, 0, null);
      insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, vuelta_id, hecho_por, hecho_en, created_at)
        values (v_fase, v_linea.variante_id, v_linea.cantidad, 'vuelta', v_vuelta, v_actor, v_hecho, clock_timestamp())
        returning id into v_avance;
      v_ids := v_ids || v_avance;
    end loop;
  end if;

  select pr.nombre into v_prov_nombre from retail.proveedores_produccion pr where pr.id = nullif(v_nuevo ->> 'proveedor_id', '')::uuid;
  insert into retail.produccion_cambios (produccion_id, fase_id, accion, objeto, quita_ids, pone_ids, antes, despues, texto, hecho_por, created_at)
  values (p_produccion_id, v_fase, 'paso_tarde', null, '{}', v_ids, null,
          jsonb_build_object('clave', v_clave, 'quien', v_quien, 'proveedor_id', nullif(v_nuevo ->> 'proveedor_id', ''), 'proveedor_nombre', v_prov_nombre,
                             'tarifa_prenda', nullif(v_nuevo ->> 'tarifa_prenda', ''), 'fijo_orden', v_nuevo ->> 'fijo_orden', 'prendas', v_total,
                             'hecho', coalesce(v_hecho, clock_timestamp()), 'antes_de', v_tarde, 'salida_id', v_salida, 'vuelta_id', v_vuelta),
          v_motivo, v_actor, clock_timestamp())
  returning id into v_cambio;

  -- Actividad (ADR-0207): con quién, sin montos. Si falla, el paso igual queda agregado.
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_paso_tarde',
      'agregó tarde el paso ' || retail.fn_fase_nombre(v_clave) || ' a la ' || retail.fn_produccion_numero_texto(v_o.numero)
        || case when v_quien = 'servicio' then ' (afuera' || coalesce(' con ' || v_prov_nombre, ', pendiente de registrar') || ')' else ' (en el Taller)' end
        || case when v_total > 0 then ' con ' || retail.fn_actividad_cuantas(v_total, 'prenda hecha', 'prendas hechas') else ', sin prendas hechas' end || ': ' || v_motivo,
      v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'fase', v_clave, 'fase_id', v_fase, 'quien', v_quien, 'cambio_id', v_cambio,
                         'proveedor_id', nullif(v_nuevo ->> 'proveedor_id', ''), 'prendas', v_total),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el paso tarde de la orden % (%)', v_o.numero, sqlerrm;
  end;

  return retail.fn_fases_de_orden(p_produccion_id);
end;
$$;
comment on function retail.agregar_paso_tarde(uuid, text, text, date, text, uuid, numeric, numeric, integer, boolean, text) is
  'ADR-0586: un líder suma un paso olvidado a una orden en proceso cuyo paso posterior ya tiene algo anotado, y en la misma transacción lo da por hecho con las prendas que el paso '
  'siguiente ya usó (Taller: «Terminé»; afuera: salida y vuelta, que devenga su costo). Motivo obligatorio; queda en produccion_cambios (paso_tarde) y en Actividad. Devuelve fn_fases_de_orden.';

revoke all on function retail.agregar_paso_tarde(uuid, text, text, date, text, uuid, numeric, numeric, integer, boolean, text) from public, anon;
grant execute on function retail.agregar_paso_tarde(uuid, text, text, date, text, uuid, numeric, numeric, integer, boolean, text) to authenticated;

reset lock_timeout;
