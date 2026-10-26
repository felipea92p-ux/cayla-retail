-- ============================================================================
-- 20261026153000_produccion_ficha_de_consumo.sql — CAYLA V2 (ficha de consumo del modelo, ADR-0513, actividad 4 · 2026-10-26)
--
-- EL PROBLEMA PRIMERO. La ficha del modelo (cuánta tela lleva cada talla y qué avíos lleva) solo se podía escribir de rebote: con la primera orden, o con el
-- interruptor «Dejar como el del modelo» de Nueva orden, y corregirla exigía el permiso de CATÁLOGO (ADR-0400, act. 7b). El Taller, que es quien sabe cuánta tela
-- gasta una prenda, tenía que pedírselo a otro módulo (el mismo error que ADR-0306: una función en un módulo donde nadie la usa).
--
-- LA DECISIÓN (Felipe, 2026-10-26: «Producción edita la ficha, Catálogo la ve»).
--   · `guardar_ficha_consumo(taller, modelo, tela, avíos)`: escribe la ficha DEL MODELO sin abrir ninguna orden. Quien tiene Producción parado en ese Taller la usa
--     (como `guardar_insumos_orden`), firma con el responsable y queda en la línea de tiempo (sin cifras). `tela` = {por_prenda} o {por_talla: {S, M…}} (una cifra por
--     CADA talla del modelo, ni una de más); `avíos` = la lista completa con la forma de una orden, validada por la MISMA función que abrir. Un parámetro nulo no toca esa
--     parte. Guardar lo mismo no cambia nada: ni reinicia la cuenta de lo medido ni archiva avíos otra vez.
--   · `fn_ficha_consumo(taller, modelo)`: la ficha en una sola lectura para la hoja (lo declarado, los avíos, lo medido y las órdenes que lo respaldan, y si quien lee puede
--     editar). La lee quien lee Producción en ese Taller y quien ve Catálogo (Productos): Catálogo la VE, no la cambia.
--   · `abrir_orden_produccion` deja de pedir el permiso de catálogo para «Dejar como el del modelo» (consumo y avíos): quien puede abrir la orden en el Taller es quien
--     edita la ficha. Una sola regla en las tres puertas (Brooks).
--
-- CONTRATO (Liskov)
--   PROMETE: guardar es todo o nada en una transacción; una ficha rechazada no deja NADA a medias (ni la tela sin los avíos); repetir el mismo envío no cambia nada;
--            declarar una tela distinta reinicia la cuenta de lo medido (`fn_consumo_efectivo`, 20261026150000) y declarar los mismos números no la reinicia.
--   ASUME:   `abrir_orden_produccion(jsonb, jsonb, jsonb)` con los reemplazos de 20261026150000 a 20261026152000 (anclas verificadas en local el 2026-10-26).
--   NO HACE: no toca órdenes abiertas ni cerradas (su plan sigue congelado); no mueve stock ni costos; no cambia lo medido (solo se lee).
--
-- DESCARTÉ
--   · Dos funciones (una para la tela y otra para los avíos): dos puntos donde la ficha queda a medias y un doble clic repite la mitad. Una lista completa que reemplaza
--     es declarativa, como `guardar_insumos_orden`.
--   · Dejar el permiso de catálogo y sumar el de Producción: dos reglas para lo mismo, y la hoja no sabría decirle a la persona por qué no puede.
--   · Que la hoja escriba sobre las filas de la orden abierta: la ficha es del MODELO; lo que lleva ESTA orden se edita en la orden (ADR-0510).
--
-- SE ROMPE SI
--   · Dos personas guardan la ficha del mismo modelo a la vez: se forman en fila (candado por modelo) y gana la última; lo de la primera queda archivado, no perdido.
--   · Un avío de la ficha se archiva en Insumos después: Nueva orden no lo propone y guardar la ficha de nuevo lo rechaza (`insumo_archivado`) hasta que se quite.
--   · Una talla se renombra en el catálogo: la cifra por talla guardada ya no calza con las tallas del modelo (la hoja la muestra vacía; guardar pide reescribirla).
--
-- CÓMO SE PEGA. Una sola parte: dos funciones nuevas y dos reemplazos ANCLADOS (ADR-0288). Va DESPUÉS de 20261026152000. Idempotente. Sin `select … into` dentro de
-- un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

-- Guarda la ficha del modelo. Devuelve {tela: ¿cambió?, avios: ¿cambió?, avios_vigentes: n}.
create or replace function retail.guardar_ficha_consumo(p_ubicacion_id uuid, p_producto_id uuid, p_tela jsonb, p_avios jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid; v_referencia text; v_lineas jsonb; v_tallas text[]; v_clave text; v_valor numeric; v_suma numeric := 0; v_n integer := 0;
  v_por_talla jsonb; v_norm jsonb; v_prenda numeric; v_existe boolean := false; v_tela_cambio boolean := false;
  v_avios jsonb; v_avios_cambio boolean := false; v_vigentes integer; v_partes text[] := '{}'; v_fila record; v_insumo text;
begin
  if p_producto_id is null then
    raise exception 'Falta el modelo' using hint = 'modelo_inexistente';
  end if;
  v_referencia := (select p.referencia from retail.productos p where p.id = p_producto_id);
  if v_referencia is null then
    raise exception 'Ese modelo no existe' using hint = 'modelo_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- Una sola persona a la vez por modelo: la segunda ve lo que dejó la primera.
  perform pg_advisory_xact_lock(hashtextextended('ficha_consumo:' || p_producto_id::text, 0));

  -- Las prendas del modelo (una de cada variante activa): con ellas se valida el color de un avío y se sabe qué tallas lleva.
  v_lineas := (select coalesce(jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 1)), '[]'::jsonb) from retail.variantes v where v.producto_id = p_producto_id and v.activo);
  v_tallas := array(select distinct t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = p_producto_id and v.activo order by t.valor);

  -- La tela: una cifra, o una por talla.
  if p_tela is not null then
    if jsonb_typeof(p_tela) <> 'object' then
      raise exception 'La tela de la ficha no es válida' using hint = 'ficha_invalida';
    end if;
    v_por_talla := nullif(p_tela -> 'por_talla', 'null'::jsonb);
    if v_por_talla is not null then
      if jsonb_typeof(v_por_talla) <> 'object' then
        raise exception 'El consumo por talla no es válido' using hint = 'ficha_invalida';
      end if;
      for v_clave in select k from jsonb_object_keys(v_por_talla) k loop
        if not (v_clave = any (v_tallas)) then
          raise exception 'El modelo no tiene la talla «%»: su consumo no tiene a qué aplicarse', v_clave using hint = 'talla_ajena';
        end if;
      end loop;
      v_norm := '{}'::jsonb;
      foreach v_clave in array v_tallas loop
        begin
          v_valor := nullif(btrim(coalesce(v_por_talla ->> v_clave, '')), '')::numeric;
        exception when others then
          raise exception 'El consumo de la talla % no es un número válido', v_clave using hint = 'consumo_invalido';
        end;
        if v_valor is null or v_valor <= 0 or v_valor > 9999 then
          raise exception 'Escribe cuánto lleva cada prenda de la talla %, mayor que cero', v_clave using hint = 'consumo_invalido';
        end if;
        v_norm := v_norm || jsonb_build_object(v_clave, round(v_valor, 3));
        v_suma := v_suma + v_valor;
        v_n := v_n + 1;
      end loop;
      if v_n = 0 then
        raise exception 'El modelo no tiene tallas con las que escribir un consumo por talla' using hint = 'consumo_invalido';
      end if;
      -- El consumo por prenda que se guarda es el promedio de las tallas (a lo que lo medido se compara y por lo que se escala).
      v_prenda := round(v_suma / v_n, 3);
    else
      v_norm := null;
      begin
        v_prenda := nullif(btrim(coalesce(p_tela ->> 'por_prenda', '')), '')::numeric;
      exception when others then
        raise exception 'El consumo por prenda no es un número válido' using hint = 'consumo_invalido';
      end;
      if v_prenda is null or v_prenda <= 0 or v_prenda > 9999 then
        raise exception 'Escribe cuánto lleva cada prenda, mayor que cero' using hint = 'consumo_invalido';
      end if;
      v_prenda := round(v_prenda, 3);
    end if;
    for v_fila in select c.tela_por_prenda, c.por_talla from retail.producto_consumos c where c.producto_id = p_producto_id loop
      v_existe := true;
      v_tela_cambio := v_fila.tela_por_prenda is distinct from v_prenda or v_fila.por_talla is distinct from v_norm;
    end loop;
    if not v_existe then
      v_tela_cambio := true;
    end if;
    if v_tela_cambio then
      insert into retail.producto_consumos (producto_id, tela_por_prenda, por_talla, fuente, actualizado_por)
      values (p_producto_id, v_prenda, v_norm, 'declarado', v_actor)
      on conflict (producto_id) do update
        set tela_por_prenda = excluded.tela_por_prenda, por_talla = excluded.por_talla, fuente = 'declarado', actualizado_por = excluded.actualizado_por, updated_at = now();
      v_partes := array_append(v_partes, 'la tela');
    end if;
  end if;

  -- Los avíos: la lista completa, validada como al abrir una orden.
  if p_avios is not null then
    if jsonb_typeof(p_avios) <> 'array' then
      raise exception 'Los avíos de la ficha no son una lista' using hint = 'ficha_invalida';
    end if;
    v_avios := retail.fn_produccion_insumos_normalizar(p_avios, v_lineas, p_producto_id);
    for v_insumo in select x.nombre from jsonb_array_elements(v_avios) e join retail.insumos x on x.id = (e ->> 'insumo_id')::uuid where x.tipo <> 'avio' loop
      raise exception 'La ficha de avíos solo lleva avíos: «%» es una tela', v_insumo using hint = 'no_es_avio';
    end loop;
    v_avios_cambio :=
      (select count(*) from retail.producto_avios a where a.producto_id = p_producto_id and a.archivado_at is null) <> jsonb_array_length(v_avios)
      or exists (
        select 1 from jsonb_array_elements(v_avios) e
        where not exists (
          select 1 from retail.producto_avios a
          where a.producto_id = p_producto_id and a.archivado_at is null and a.insumo_id = (e ->> 'insumo_id')::uuid
            and a.color_codigo is not distinct from nullif(e ->> 'color_codigo', '') and a.cantidad_por_prenda = (e ->> 'consumo_por_prenda')::numeric));
    if v_avios_cambio then
      perform retail.fn_producto_avios_reemplazar(p_producto_id, v_avios, v_actor);
      v_partes := array_append(v_partes, 'los avíos');
    end if;
  end if;

  v_vigentes := (select count(*) from retail.producto_avios a where a.producto_id = p_producto_id and a.archivado_at is null);

  -- Actividad (ADR-0207): sin cifras, y solo si algo cambió. Si falla, la ficha igual queda guardada.
  if v_tela_cambio or v_avios_cambio then
    begin
      perform retail.fn_actividad_anotar(
        'produccion', 'ficha_consumo_guardada',
        'guardó la ficha de consumo de ' || v_referencia || ': ' || array_to_string(v_partes, ' y '),
        v_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id,
        'productos', p_producto_id::text, now(),
        jsonb_build_object('producto_id', p_producto_id, 'tela', v_tela_cambio, 'avios', v_avios_cambio, 'avios_vigentes', v_vigentes),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó la ficha de consumo de % (%)', v_referencia, sqlerrm;
    end;
  end if;

  return jsonb_build_object('tela', v_tela_cambio, 'avios', v_avios_cambio, 'avios_vigentes', v_vigentes);
end;
$$;
comment on function retail.guardar_ficha_consumo(uuid, uuid, jsonb, jsonb) is
  'ADR-0513: guarda la ficha de consumo del modelo (tela por talla o una cifra, y los avíos) sin abrir una orden. Producción edita; guardar lo mismo no cambia nada.';
revoke all on function retail.guardar_ficha_consumo(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function retail.guardar_ficha_consumo(uuid, uuid, jsonb, jsonb) to authenticated, service_role;

-- La ficha del modelo en una sola lectura. NULL si quien llama no la puede leer.
create or replace function retail.fn_ficha_consumo(p_ubicacion_id uuid, p_producto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_referencia text; v_puede_editar boolean; v_declarado timestamptz; v_salida jsonb;
begin
  if not (retail.fn_produccion_puede_leer(p_ubicacion_id) or retail.fn_ve_modulo('productos') is true or retail.fn_puede_editar_catalogo() is true) then
    return null;
  end if;
  v_referencia := (select p.referencia from retail.productos p where p.id = p_producto_id);
  if v_referencia is null then
    return null;
  end if;
  v_puede_editar := retail.fn_ve_modulo('produccion') is true and retail.fn_puede_operar_ubicacion(p_ubicacion_id);
  v_declarado := (select c.updated_at from retail.producto_consumos c where c.producto_id = p_producto_id);
  v_salida := jsonb_build_object(
    'producto_id', p_producto_id,
    'referencia', v_referencia,
    'puede_editar', v_puede_editar,
    'tallas', coalesce((select jsonb_agg(x.valor order by x.valor) from (
        select distinct t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = p_producto_id and v.activo) x), '[]'::jsonb),
    'colores', coalesce((select jsonb_agg(jsonb_build_object('codigo', x.codigo, 'nombre', x.nombre) order by x.nombre) from (
        select distinct co.codigo, co.nombre from retail.variantes v join retail.colores co on co.codigo = v.color_codigo where v.producto_id = p_producto_id and v.activo) x), '[]'::jsonb),
    'tela', (select jsonb_build_object('por_prenda', c.tela_por_prenda, 'por_talla', c.por_talla, 'declarada_en', c.updated_at) from retail.producto_consumos c where c.producto_id = p_producto_id),
    'avios', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', a.insumo_id, 'nombre', i.nombre, 'unidad', i.unidad_medida, 'color_codigo', a.color_codigo,
        'cantidad_por_prenda', a.cantidad_por_prenda) order by a.created_at, a.id)
      from retail.producto_avios a join retail.insumos i on i.id = a.insumo_id where a.producto_id = p_producto_id and a.archivado_at is null), '[]'::jsonb),
    'medido', (select jsonb_build_object('manda', e.manda, 'por_prenda', e.medido_por_prenda, 'ordenes', e.ordenes_medidas) from retail.fn_consumo_efectivo(p_producto_id) e),
    'ordenes_cerradas', coalesce((select jsonb_agg(jsonb_build_object('numero', p.numero, 'cerrada_en', m.cerrada_en, 'buenas', m.buenas, 'metros', m.metros,
        'cuenta', v_declarado is not null and m.cerrada_en > v_declarado) order by m.cerrada_en desc)
      from retail.producto_consumo_medido m join retail.producciones p on p.id = m.produccion_id where m.producto_id = p_producto_id and p.estado = 'terminada'), '[]'::jsonb));
  return v_salida;
end;
$$;
comment on function retail.fn_ficha_consumo(uuid, uuid) is
  'ADR-0513: la ficha de consumo del modelo para la hoja (tela, avíos, lo medido y sus órdenes, y si quien lee puede editar). La lee Producción en ese Taller, quien ve Catálogo y quien edita el catálogo.';
revoke all on function retail.fn_ficha_consumo(uuid, uuid) from public, anon;
grant execute on function retail.fn_ficha_consumo(uuid, uuid) to authenticated, service_role;

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

-- «Dejar como el del modelo» ya no pide el permiso de catálogo: quien abre la orden en el Taller edita la ficha (`fn_produccion_exigir_operar` ya se comprobó arriba).
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$  -- «Dejar este consumo como el del modelo» (Felipe, 2026-10-15): corregir lo que el modelo YA dice es de quien edita el catálogo. Se comprueba ANTES de abrir: una orden rechazada no gasta número.
  -- Donde el modelo todavía no dice nada (o es un modelo nuevo) no hace falta permiso: la primera orden lo deja declarado, como siempre.
  if v_fijar and not coalesce((p_apertura ->> 'modelo_nuevo')::boolean, false) and not retail.fn_puede_editar_catalogo()
     and exists (select 1 from retail.producto_consumos c where c.producto_id = nullif(p_apertura ->> 'producto_id', '')::uuid) then
    raise exception 'Corregir el consumo que dice el modelo es de quien edita el catálogo' using errcode = '42501', hint = 'consumo_modelo_sin_permiso';
  end if;
$v$,
  $v$  -- «Dejar como el del modelo» (consumo y avíos): quien abre la orden en el Taller edita la ficha del modelo (ADR-0513: Producción edita, Catálogo la ve).
$v$
);
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$  if coalesce((p_apertura ->> 'fijar_avios_modelo')::boolean, false) and not coalesce((p_apertura ->> 'modelo_nuevo')::boolean, false) and not retail.fn_puede_editar_catalogo()
     and exists (select 1 from retail.producto_avios a where a.producto_id = nullif(p_apertura ->> 'producto_id', '')::uuid and a.archivado_at is null) then
    raise exception 'Corregir los avíos que dice el modelo es de quien edita el catálogo' using errcode = '42501', hint = 'avios_modelo_sin_permiso';
  end if;
$v$,
  $v$  -- Los avíos del modelo siguen la misma regla que el consumo: ya no piden el permiso de catálogo (ADR-0513).
$v$
);

reset lock_timeout;
