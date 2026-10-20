-- ADR-0400 act. (k) y (l), paquete R1, actividad 1 (2026-10-19): la base ACEPTA las fases nuevas de la orden de producción («expandir»).
--
-- EL PROBLEMA
--   Felipe decidió (16-oct, ronda de 36 preguntas, y 19-oct, Habilitado) que cada orden pase por: Ploteo · Corte · Habilitado · Costura ·
--   Ojales y botones (opcional) · Limpiar hilos y revisar · Planchado · Etiquetar y embolsar, y que cada una la haga el Taller o un servicio.
--   La base solo conoce seis claves (corte, costura, acabado, bordado, estampado, lavandería) y exige «por lo menos Corte, Costura y Acabado».
--   La web desplegada habla con esas seis. Tablas de Producción: 0 filas (verificado 2026-10-16), así que cambiar el esquema no migra datos,
--   pero un cambio de la base que la web aún no usa no puede romper la hoja «Nueva orden» que ya está viva.
--
-- QUÉ HACE (solo funciones y los dos CHECK de la clave; sin tablas nuevas, sin políticas)
--   · Seis claves nuevas: `ploteo`, `habilitado`, `ojales_botones`, `limpieza_revision`, `planchado`, `etiquetado_embolsado`. `acabado` NO se
--     quita: queda para lo que ya se mande con la ruta anterior (contraer es otra actividad, y solo si Felipe la pide).
--   · `fn_fase_secuencia` (la ruta): ploteo 5 · corte 10 · habilitado 15 · [bordado/estampado sobre pieza 20/25] · costura 30 · ojales_botones 35 ·
--     [bordado/estampado sobre prenda 40/45] · [lavandería 50] · limpieza_revision 55 · acabado 60 · planchado 65 · etiquetado_embolsado 70.
--     Habilitado va justo después de Corte porque el habilitado interno (numerar, armar paquetes, sumar avíos, cortar el Tricotex menor) es
--     de otro «quién» que el corte industrial cuando este sale a un tercero (ADR-0400 act. l). `acabado` (60) y las tres del cierre nuevo
--     nunca viajan juntas.
--   · `fn_fase_nombre`: los nombres en lenguaje de tienda de las seis nuevas.
--   · `fn_produccion_fases_normalizar`: acepta DOS rutas, la anterior (corte, costura y acabado) o la nueva (las siete fijas: ploteo, corte,
--     habilitado, costura, limpieza_revision, planchado, etiquetado_embolsado; ojales_botones, bordado, estampado y lavandería son opcionales).
--     Mezclarlas se rechaza con `fases_mezcla`: una orden que lleva `acabado` y alguna fase nueva no tiene un «último» claro.
--   · `cambiar_quien_fase`: validaba con una espina de prueba fija (corte, costura, acabado) que con la ruta nueva ya no cabe; ahora valida
--     contra las fases REALES de la orden. Mismo cuerpo, mismos rechazos.
--   · `fn_tarifas_de_servicios` y `guardar_tarifa_servicio`: la lista de precios acepta las claves nuevas y las ordena por la ruta.
--   · Los CHECK de `produccion_fases.clave` y `proveedor_tarifas.fase_clave` aceptan las claves nuevas.
--
-- DESCARTÉ
--   · Quitar `acabado` ya: la web desplegada abre órdenes con la ruta anterior, y quitarla antes que ella deja «Nueva orden» sin poder abrir
--     (expandir → web → contraer, doc 16 de la investigación). Con 0 filas dejarla sin uso no cuesta nada y deja el retroceso abierto.
--   · Una tabla de catálogo de fases: es una lista que cambia una vez al año (ADR-0400, alternativas descartadas).
--
-- ASUME   `fn_fase_secuencia`, `fn_fase_nombre`, `fn_produccion_fases_normalizar` (20261014154000), `cambiar_quien_fase` (20261015160000),
--         `fn_tarifas_de_servicios` y `guardar_tarifa_servicio` (20261015172000) tal como las dejaron esas migraciones: el candado de md5
--         de abajo lo comprueba y acepta el cuerpo anterior y el nuevo (idempotente).
-- CÓMO SE PEGA EN PRODUCCIÓN (Felipe, 2026-10-19, por adelantado): una sola parte; no hay políticas ni `alter` de tablas con tráfico (las dos
--   tablas no se usan todavía y tienen 0 filas). Idempotente. Después se publica la web, nunca antes.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. El candado: las seis funciones son las que esta migración espera (md5 del cuerpo: el anterior o el nuevo) ----------
-- Si producción tiene otra versión (alguien las parchó aparte), el pegado se detiene en vez de pisarla: se regenera el reemplazo desde su
-- definición real. Acepta el cuerpo nuevo para que pegarla una segunda vez no falle.
do $$
declare
  v_f record; v_md5 text;
begin
  for v_f in
    select * from (values
      ('retail.fn_fase_secuencia(text,text)', '1951c9a928f8b98ebb800f71f2d14e29', 'cd6aa0d52cf947d25adecd0c564f87ce'),
      ('retail.fn_fase_nombre(text)', 'bb4537fe7c8f399d25e42522c8ab46b9', '60880ef482a46d2318e0c1325fa4a9d9'),
      ('retail.fn_produccion_fases_normalizar(jsonb)', '8be4d813a8556f063de3589b162afd98', '6c3d1c3ef7caa1f4ad492fbe0726c28e'),
      ('retail.cambiar_quien_fase(uuid,text,uuid,numeric,numeric,integer,date)', '48b6cc9cd03ef03f27d851d535fdb8be', '58bb4ab9f0b1f28ddd615eb8b43499ca'),
      ('retail.fn_tarifas_de_servicios()', '13333fba406add4aadb92656c05c5d1b', '17494bd9196c2a6e5e2e8de3e6f6cad0'),
      ('retail.guardar_tarifa_servicio(uuid,text,numeric,integer,numeric,text)', '321e11916679ef6e1683e328b1d95cec', 'bc50d9ba61ef4dd6b8013c40451b7df2')
    ) as t (firma, viejo, nuevo)
  loop
    v_md5 := md5((select p.prosrc from pg_proc p where p.oid = v_f.firma::regprocedure));
    if v_md5 not in (v_f.viejo, v_f.nuevo) then
      raise exception '% cambió desde que se escribió esta migración (md5 %): regenera el reemplazo desde su definición real.', v_f.firma, v_md5;
    end if;
  end loop;
end;
$$;

-- ---------- 1. La ruta y los nombres ----------
create or replace function retail.fn_fase_secuencia(p_clave text, p_posicion text) returns smallint
language sql immutable
set search_path = retail, public, extensions
as $$
  select case
    when p_clave = 'ploteo' then 5
    when p_clave = 'corte' then 10
    when p_clave = 'habilitado' then 15
    when p_clave = 'bordado' and p_posicion = 'pieza' then 20
    when p_clave = 'estampado' and p_posicion = 'pieza' then 25
    when p_clave = 'costura' then 30
    when p_clave = 'ojales_botones' then 35
    when p_clave = 'bordado' and p_posicion = 'prenda' then 40
    when p_clave = 'estampado' and p_posicion = 'prenda' then 45
    when p_clave = 'lavanderia' then 50
    when p_clave = 'limpieza_revision' then 55
    when p_clave = 'acabado' then 60
    when p_clave = 'planchado' then 65
    when p_clave = 'etiquetado_embolsado' then 70
  end::smallint
$$;

create or replace function retail.fn_fase_nombre(p_clave text) returns text
language sql immutable
set search_path = retail, public, extensions
as $$
  select case p_clave
    when 'ploteo' then 'Ploteo' when 'corte' then 'Corte' when 'habilitado' then 'Habilitado' when 'costura' then 'Costura'
    when 'ojales_botones' then 'Ojales y botones' when 'limpieza_revision' then 'Limpiar hilos y revisar'
    when 'planchado' then 'Planchado' when 'etiquetado_embolsado' then 'Etiquetar y embolsar' when 'acabado' then 'Acabado'
    when 'bordado' then 'Bordado' when 'estampado' then 'Estampado' when 'lavanderia' then 'Lavandería'
    else p_clave end
$$;

-- ---------- 2. Validar y normalizar las fases que manda la pantalla: la ruta anterior o la nueva ----------
create or replace function retail.fn_produccion_fases_normalizar(p_fases jsonb) returns jsonb
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_f jsonb; v_clave text; v_quien text; v_posicion text; v_prov uuid; v_tarifa numeric; v_fijo numeric; v_min integer;
  v_fecha date; v_nota text; v_rubro text; v_activo boolean; v_salida jsonb := '[]'::jsonb; v_claves text[] := '{}';
  v_solo_nuevas constant text[] := array['ploteo', 'habilitado', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado'];
begin
  if p_fases is null or jsonb_typeof(p_fases) <> 'array' or jsonb_array_length(p_fases) = 0 then
    raise exception 'La orden necesita sus fases: por lo menos Corte, Costura y Acabado' using hint = 'fases_espina';
  end if;
  for v_f in select * from jsonb_array_elements(p_fases) loop
    v_clave := lower(btrim(coalesce(v_f ->> 'clave', '')));
    if v_clave not in ('ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado',
                       'acabado', 'bordado', 'estampado', 'lavanderia') then
      raise exception 'Una de las fases no existe: «%»', v_clave using hint = 'fase_desconocida';
    end if;
    if v_clave = any (v_claves) then
      raise exception 'La fase «%» va una sola vez en la orden', retail.fn_fase_nombre(v_clave) using hint = 'fase_repetida';
    end if;
    v_claves := v_claves || v_clave;
    v_posicion := nullif(lower(btrim(coalesce(v_f ->> 'posicion', ''))), '');
    if v_clave in ('bordado', 'estampado') then
      if v_posicion is null or v_posicion not in ('pieza', 'prenda') then
        raise exception 'El % dice si va sobre la pieza cortada o sobre la prenda armada', retail.fn_fase_nombre(v_clave) using hint = 'fase_sin_posicion';
      end if;
    elsif v_posicion is not null then
      raise exception 'Solo bordado y estampado eligen si van sobre pieza o sobre prenda' using hint = 'fase_con_posicion';
    end if;
    v_quien := lower(btrim(coalesce(v_f ->> 'quien', 'taller')));
    if v_quien not in ('taller', 'servicio') then
      raise exception 'Cada fase la hace el Taller o un servicio de afuera' using hint = 'fase_quien';
    end if;
    v_nota := nullif(btrim(coalesce(v_f ->> 'nota', '')), '');
    v_prov := null; v_tarifa := null; v_fijo := 0; v_min := null; v_fecha := null;
    if v_quien = 'servicio' then
      begin
        v_prov := nullif(v_f ->> 'proveedor_id', '')::uuid;
      exception when others then
        raise exception 'El proveedor de «%» no es válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_proveedor';
      end;
      if v_prov is null then
        raise exception 'Si «%» sale a un servicio, dice a quién', retail.fn_fase_nombre(v_clave) using hint = 'fase_sin_proveedor';
      end if;
      select pr.rubro, pr.activo into v_rubro, v_activo from retail.proveedores_produccion pr where pr.id = v_prov;
      if v_rubro is null or v_activo is not true then
        raise exception 'Ese proveedor no está activo en el directorio del Taller' using hint = 'fase_proveedor_inactivo';
      end if;
      if v_rubro in ('tela', 'avios') then
        raise exception 'Ese proveedor vende tela o avíos; un servicio de «%» es de maquila u otro rubro', retail.fn_fase_nombre(v_clave)
          using hint = 'fase_proveedor_rubro';
      end if;
      begin
        v_tarifa := nullif(btrim(coalesce(v_f ->> 'tarifa_prenda', '')), '')::numeric;
        v_fijo := coalesce(nullif(btrim(coalesce(v_f ->> 'fijo_orden', '')), '')::numeric, 0);
        v_min := nullif(btrim(coalesce(v_f ->> 'cantidad_minima', '')), '')::integer;
      exception when others then
        raise exception 'La tarifa de «%» no es un número válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end;
      -- Sin tarifa escrita: la lista de precios del proveedor para esa fase (la vigente más reciente).
      if v_tarifa is null then
        for v_tarifa, v_min, v_fijo in
          select t.tarifa_prenda, coalesce(v_min, t.cantidad_minima), case when v_fijo > 0 then v_fijo else t.fijo_orden end
          from retail.proveedor_tarifas t
          where t.proveedor_id = v_prov and t.fase_clave = v_clave and t.vigente_desde <= retail.fn_hoy_lima()
          order by t.vigente_desde desc limit 1
        loop exit; end loop;
      end if;
      if v_tarifa is null or v_tarifa <= 0 then
        raise exception 'Falta la tarifa por prenda de «%»: escríbela o guárdala en la lista de precios del proveedor', retail.fn_fase_nombre(v_clave)
          using hint = 'fase_sin_tarifa';
      end if;
      if v_tarifa > 9999.99 or v_fijo < 0 or v_fijo > 99999.99 or (v_min is not null and v_min <= 0) then
        raise exception 'La tarifa de «%» está fuera de rango', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end if;
      begin
        v_fecha := nullif(v_f ->> 'fecha_prometida', '')::date;
      exception when others then
        raise exception 'La fecha prometida de «%» no es válida', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_invalida';
      end;
      if v_fecha is not null and v_fecha < retail.fn_hoy_lima() then
        raise exception 'La fecha prometida de «%» ya pasó', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_pasada';
      end if;
    end if;
    v_salida := v_salida || jsonb_build_object(
      'clave', v_clave, 'posicion', v_posicion, 'secuencia', retail.fn_fase_secuencia(v_clave, v_posicion), 'quien', v_quien,
      'proveedor_id', v_prov, 'tarifa_prenda', v_tarifa, 'fijo_orden', v_fijo, 'cantidad_minima', v_min, 'fecha_prometida', v_fecha, 'nota', v_nota);
  end loop;
  -- La ruta: la nueva si lleva alguna fase que solo ella tiene; si no, la anterior. Las dos a la vez no.
  if v_claves && v_solo_nuevas then
    if 'acabado' = any (v_claves) then
      raise exception 'Acabado es de la ruta anterior: con las fases nuevas se usan Limpiar hilos y revisar, Planchado y Etiquetar y embolsar'
        using hint = 'fases_mezcla';
    end if;
    if not (v_claves @> array['ploteo', 'corte', 'habilitado', 'costura', 'limpieza_revision', 'planchado', 'etiquetado_embolsado']) then
      raise exception 'La orden necesita sus fases: Ploteo, Corte, Habilitado, Costura, Limpiar hilos y revisar, Planchado y Etiquetar y embolsar'
        using hint = 'fases_espina';
    end if;
  elsif not (v_claves @> array['corte', 'costura', 'acabado']) then
    raise exception 'La orden necesita sus fases: por lo menos Corte, Costura y Acabado' using hint = 'fases_espina';
  end if;
  return v_salida;
end;
$$;

-- ---------- 3. Cambiar quién hace una fase: se valida contra las fases REALES de la orden ----------
create or replace function retail.cambiar_quien_fase(
  p_fase_id uuid, p_quien text, p_proveedor_id uuid default null, p_tarifa_prenda numeric default null,
  p_fijo_orden numeric default null, p_cantidad_minima integer default null, p_fecha_prometida date default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_ubicacion uuid; v_estado text; v_n jsonb; v_actor uuid;
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
  -- Empezó lo que tiene algo anotado y vivo (lo neto: un Deshacer total o una anulación devuelven la fase a «no empezó»; ADR-0400, anular).
  if coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id), 0) <> 0
     or coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = p_fase_id), 0) <> 0 then
    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  -- Las demás fases de la orden viajan como están (en el Taller) para que la ruta completa pase la misma validación que al abrir.
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', p_quien, 'proveedor_id', p_proveedor_id, 'tarifa_prenda', p_tarifa_prenda,
    'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', p_fecha_prometida, 'nota', v_f.nota))
    || coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                   from retail.produccion_fases o where o.produccion_id = v_f.produccion_id and o.id <> p_fase_id), '[]'::jsonb)
  ) -> 0;
  update retail.produccion_fases f set
    quien = v_n ->> 'quien', proveedor_id = nullif(v_n ->> 'proveedor_id', '')::uuid,
    tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric, fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0),
    cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer, fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;

-- ---------- 4. La lista de precios de los servicios acepta las claves nuevas y las ordena por la ruta ----------
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
           order by pr.nombre, array_position(array['ploteo','corte','habilitado','bordado','estampado','costura','ojales_botones','lavanderia',
                                                    'limpieza_revision','acabado','planchado','etiquetado_embolsado'], v.fase_clave))
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
  if p_fase_clave is null or p_fase_clave not in ('ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado',
                                                  'etiquetado_embolsado', 'acabado', 'bordado', 'estampado', 'lavanderia') then
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

-- ---------- 5. Los dos CHECK de la clave aceptan las claves nuevas ----------
-- Se buscan por su contenido (la lista vieja con «lavanderia» y sin «ploteo»), no por su nombre: así corre igual aunque la base los haya
-- nombrado distinto, y una segunda vez no hace nada.
do $$
declare
  v_c record;
begin
  for v_c in
    select c.conname from pg_constraint c
     where c.conrelid = 'retail.produccion_fases'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%lavanderia%' and pg_get_constraintdef(c.oid) not like '%ploteo%'
  loop
    execute format('alter table retail.produccion_fases drop constraint %I', v_c.conname);
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'retail.produccion_fases'::regclass and c.conname = 'produccion_fases_clave_check') then
    alter table retail.produccion_fases add constraint produccion_fases_clave_check check (clave in (
      'ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado',
      'acabado', 'bordado', 'estampado', 'lavanderia'));
  end if;

  for v_c in
    select c.conname from pg_constraint c
     where c.conrelid = 'retail.proveedor_tarifas'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%lavanderia%' and pg_get_constraintdef(c.oid) not like '%ploteo%'
  loop
    execute format('alter table retail.proveedor_tarifas drop constraint %I', v_c.conname);
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'retail.proveedor_tarifas'::regclass and c.conname = 'proveedor_tarifas_fase_clave_check') then
    alter table retail.proveedor_tarifas add constraint proveedor_tarifas_fase_clave_check check (fase_clave in (
      'ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado',
      'acabado', 'bordado', 'estampado', 'lavanderia'));
  end if;
end;
$$;

comment on table retail.produccion_fases is
  'ADR-0400: una fila por fase de la orden, con quién la hace y, si es un servicio, el proveedor y la tarifa congelados al abrir. La ruta nueva '
  '(R1, ADR-0400 act. k y l) es Ploteo · Corte · Habilitado · Costura · Ojales y botones (opcional) · Limpiar hilos y revisar · Planchado · '
  'Etiquetar y embolsar; bordado, estampado y lavandería siguen disponibles; acabado es de la ruta anterior. El estado se deriva (fn_fases_de_orden). '
  'Solo se lee y escribe por funciones security definer (RLS sin políticas).';

reset lock_timeout;
