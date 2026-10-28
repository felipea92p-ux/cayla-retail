-- Producción · el avance de una fase, la Salida a un servicio y su Vuelta, y la orden en una sola lectura (ADR-0400, actividades 3 y 4).
--
-- EL PROBLEMA PRIMERO. La migración 20261014154000 dejó la orden con sus fases y las tablas donde se anota lo que pasa (`produccion_avances`,
-- `produccion_salidas`, `produccion_vueltas`), pero sin ninguna función que escriba en ellas: hoy nadie puede decir «terminé 20 de Negro · M en
-- Corte», «mandé 48 a Confecciones del Norte» ni «volvieron 46 buenas y 2 faltan». Y la página de la orden necesitaría ocho lecturas distintas
-- (la orden, sus líneas, las fases, lo hecho por talla y color, la tela, el libro de insumos, los costos, quién hizo qué) para dibujarse.
--
-- QUÉ CREA (todo `security definer`; exige el módulo `produccion` y estar parado en ese Taller —`fn_produccion_exigir_operar`— y firma con
-- `fn_actor_persona_id(true)`, ADR-0161/0162; las cuatro que escriben toman un candado por orden, ADR-0190, antes de leer un solo saldo).
--   1. `registrar_avance(p_fase_id, p_lineas, p_nota)`: «Terminé N» por talla y color en una fase del Taller. El candado del disponible es POR
--      VARIANTE: en la primera fase, el plan de esa talla y color × 1,10 redondeado hacia arriba (cortar de más se acepta hasta un 10 %,
--      ADR-0400 decisión 7); en las demás, lo terminado en la fase anterior de esa misma talla y color. La fase anterior puede estar a medias:
--      se avanza con lo que ya entró. Una fase de servicio no avanza así: avanza por la Vuelta.
--   2. `deshacer_avance(p_avance_id)`: la fila negativa (`origen = deshacer`), nunca un borrado. Solo el último avance VIVO del Taller de esa
--      talla y color en esa fase, una sola vez, y solo si la fase siguiente no usó ya esas prendas (ni las terminó ni las mandó afuera).
--   3. `registrar_salida(p_fase_id, p_lineas, p_guia, p_nota)`: lo que sale del Taller a un servicio, por talla y color, con la guía como texto
--      (A3). Por variante: lo que puede salir = lo disponible de la fase − lo que ya salió.
--   4. `registrar_vuelta(p_fase_id, p_lineas, p_guia, p_nota)`: lo que vuelve del servicio —buenas, segundas, faltantes con motivo— y, por cada
--      línea con buenas, el avance `origen = vuelta` que hace avanzar la fase. Por variante: no vuelve más de lo que salió.
--   5. `fn_orden_produccion(p_produccion_id)`: TODO lo que la página de la orden necesita en una lectura (orden, líneas, fases con su detalle por
--      variante, tela, costos, línea de tiempo, permisos). Los costos solo los recibe quien ve `produccion` en ese Taller o el líder (la regla
--      de ADR-0400: aquí nace así; `160000` la aplica a las funciones viejas). NULL si la orden no existe o no se puede leer.
--   6. Dos ajustes a `fn_fases_de_orden` (de 154000, mismo cuerpo): `dias_en_fase` nunca es negativo y una fase con segundas o faltantes
--      devueltos también termina (ver 1b).
--
-- LO QUE NO CAMBIA (ADR-0400 «Lo que NO cambia»). Nada de aquí escribe en `movimientos` ni en `movimientos_insumo`: las prendas en una fase o
-- afuera no entran a `stock` (nacen solo en `cerrar_produccion`, principio 4), y la tela que viaja con una Salida se sigue anotando con
-- `registrar_consumo_insumo`. `cerrar_produccion`, `anular_produccion`, `revertir_produccion` y el libro de insumos quedan como están.
--
-- DESCARTÉ
--   · Un candado del disponible por fase entera (Σ de todas las tallas): dejaría terminar 30 de M con 30 de L cortadas. Es por talla y color.
--   · Deshacer cualquier avance, no solo el último de su talla y color: con dos avances de 20 y 10, deshacer el de 20 deja un historial que no
--     dice qué quedó; y «el último de la fase» a secas es ambiguo cuando una sola llamada anota varias tallas con la misma hora. Por eso es
--     «el último vivo de esa talla y color», y la pantalla lo sabe por `avance_id` en la línea de tiempo.
--   · Exigir que la fase anterior esté «hecha» para avanzar: el Taller cose las primeras tallas mientras aún se corta las otras.
--   · Un tipo `cambio_quien` en la línea de tiempo: no hay registro de ese cambio en ninguna tabla; no se inventa.
--   · `created_at = now()` en lo que se anota: dentro de una misma transacción todo tendría la misma hora y «el último» no se podría saber.
--     Se escribe `clock_timestamp()`: el orden de lo anotado es el orden en que se escribió (las pruebas corren todo en una transacción).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: solo `create or replace function` y permisos; sin `alter` de tablas en
-- uso, sin políticas (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Ayudantes internos (nadie los llama desde la API) ----------

-- La fase de secuencia inmediatamente menor (NULL en la primera) y la de secuencia inmediatamente mayor (NULL en la última).
create or replace function retail.fn_produccion_fase_anterior(p_fase_id uuid) returns uuid
language sql stable
set search_path = retail, public, extensions
as $$
  select f2.id
  from retail.produccion_fases f join retail.produccion_fases f2 on f2.produccion_id = f.produccion_id and f2.secuencia < f.secuencia
  where f.id = p_fase_id
  order by f2.secuencia desc limit 1
$$;

create or replace function retail.fn_produccion_fase_siguiente(p_fase_id uuid) returns uuid
language sql stable
set search_path = retail, public, extensions
as $$
  select f2.id
  from retail.produccion_fases f join retail.produccion_fases f2 on f2.produccion_id = f.produccion_id and f2.secuencia > f.secuencia
  where f.id = p_fase_id
  order by f2.secuencia limit 1
$$;

-- Lo que puede entrar a una fase de UNA talla y color: en la primera fase, el plan × 1,10 hacia arriba (cortar de más hasta un 10 %,
-- ADR-0400 decisión 7: la constante vive aquí); en las demás, lo terminado en la fase anterior de esa talla y color (los avances de la fase
-- anterior, con sus Deshacer). 0 si la talla y color no es de la orden.
create or replace function retail.fn_produccion_entrada_variante(p_fase_id uuid, p_variante_id uuid) returns integer
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_produccion uuid; v_anterior uuid; v_plan integer;
begin
  select f.produccion_id into v_produccion from retail.produccion_fases f where f.id = p_fase_id;
  if v_produccion is null then return 0; end if;
  v_anterior := retail.fn_produccion_fase_anterior(p_fase_id);
  if v_anterior is null then
    select l.cantidad_plan into v_plan from retail.produccion_lineas l where l.produccion_id = v_produccion and l.variante_id = p_variante_id;
    return coalesce(ceil(v_plan * 1.10), 0)::integer;
  end if;
  return coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_anterior and a.variante_id = p_variante_id), 0)::integer;
end;
$$;

-- «Negro · M»: cómo se nombra una talla y color en un mensaje o en la línea de tiempo.
create or replace function retail.fn_produccion_variante_texto(p_variante_id uuid) returns text
language sql stable
set search_path = retail, public, extensions
as $$
  select coalesce(nullif(concat_ws(' · ', coalesce(co.nombre, v.color_codigo), ta.valor), ''), v.sku, v.codigo, p_variante_id::text)
  from retail.variantes v
  left join retail.colores co on co.codigo = v.color_codigo
  left join retail.tallas ta on ta.id = v.talla_id
  where v.id = p_variante_id
$$;

-- Las líneas «talla y color + cantidad» que manda la pantalla, limpias: [{variante_id, cantidad}] (la cantidad como texto o número, entera y
-- mayor que cero; una talla y color una sola vez). `p_que` nombra la operación en el hint: avance_sin_lineas, salida_cantidad_invalida…
create or replace function retail.fn_produccion_lineas_cantidad(p_lineas jsonb, p_que text)
returns table (variante_id uuid, cantidad integer)
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_l jsonb; v_variante uuid; v_n numeric; v_vistas uuid[] := '{}';
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Di cuántas de cada talla y color' using hint = p_que || '_sin_lineas';
  end if;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    begin
      v_variante := nullif(v_l ->> 'variante_id', '')::uuid;
    exception when others then
      raise exception 'Una de las tallas o colores no es válida' using hint = p_que || '_variante_invalida';
    end;
    if v_variante is null then
      raise exception 'Una de las líneas no dice de qué talla y color es' using hint = p_que || '_variante_invalida';
    end if;
    if v_variante = any (v_vistas) then
      raise exception 'La misma talla y color va una sola vez' using hint = p_que || '_variante_repetida';
    end if;
    v_vistas := v_vistas || v_variante;
    begin
      v_n := nullif(btrim(coalesce(v_l ->> 'cantidad', '')), '')::numeric;
    exception when others then
      raise exception 'La cantidad de % no es un número válido', retail.fn_produccion_variante_texto(v_variante) using hint = p_que || '_cantidad_invalida';
    end;
    if v_n is null or v_n <= 0 or v_n <> trunc(v_n) or v_n > 1000000 then
      raise exception 'La cantidad de % tiene que ser un entero mayor que cero', retail.fn_produccion_variante_texto(v_variante) using hint = p_que || '_cantidad_invalida';
    end if;
    variante_id := v_variante; cantidad := v_n::integer;
    return next;
  end loop;
end;
$$;

-- Lo que toda operación sobre una fase comprueba antes de escribir: que la fase exista, que quien llama vea `produccion` y esté parado en ese
-- Taller, que haya un responsable firmado y que la orden siga en proceso. Devuelve lo que las funciones necesitan de la fase y de la orden.
create or replace function retail.fn_produccion_operar_fase(p_fase_id uuid)
returns table (fase_id uuid, produccion_id uuid, ubicacion_id uuid, clave text, secuencia smallint, quien text, proveedor_id uuid,
               proveedor_nombre text, tarifa_prenda numeric, fijo_orden numeric, numero integer, actor uuid)
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_f record; v_actor uuid;
begin
  select f.id, f.produccion_id, f.clave, f.secuencia, f.quien, f.proveedor_id, f.tarifa_prenda, f.fijo_orden, pr.nombre as proveedor_nombre,
         p.ubicacion_id, p.estado, p.numero
    into v_f
    from retail.produccion_fases f
    join retail.producciones p on p.id = f.produccion_id
    left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
   where f.id = p_fase_id;
  if v_f.id is null then
    raise exception 'Esa fase no existe' using hint = 'fase_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_f.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_f.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  return query select v_f.id, v_f.produccion_id, v_f.ubicacion_id, v_f.clave, v_f.secuencia, v_f.quien, v_f.proveedor_id, v_f.proveedor_nombre,
                      v_f.tarifa_prenda, v_f.fijo_orden, v_f.numero, v_actor;
end;
$$;

-- ¿Se puede deshacer este avance? NULL si sí; si no, el motivo (el hint que la función de escritura lanza y que la pantalla entiende):
--   avance_inexistente · deshacer_origen (lo que volvió de un servicio o un Deshacer no se deshace) · deshacer_ya_hecho ·
--   deshacer_no_es_el_ultimo (solo el último vivo del Taller de esa talla y color en esa fase) · deshacer_ya_avanzo (la fase siguiente ya
--   terminó o mandó afuera esas prendas).
create or replace function retail.fn_produccion_avance_deshacible(p_avance_id uuid) returns text
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_a record; v_ultimo uuid; v_hechas integer; v_siguiente uuid; v_usado integer;
begin
  select a.id, a.fase_id, a.variante_id, a.cantidad, a.origen into v_a from retail.produccion_avances a where a.id = p_avance_id;
  if v_a.id is null then return 'avance_inexistente'; end if;
  if v_a.origen <> 'taller' then return 'deshacer_origen'; end if;
  if exists (select 1 from retail.produccion_avances d where d.deshace_id = p_avance_id) then return 'deshacer_ya_hecho'; end if;
  select a.id into v_ultimo
    from retail.produccion_avances a
   where a.fase_id = v_a.fase_id and a.variante_id = v_a.variante_id and a.origen = 'taller'
     and not exists (select 1 from retail.produccion_avances d where d.deshace_id = a.id)
   order by a.created_at desc, a.id desc limit 1;
  if v_ultimo is distinct from p_avance_id then return 'deshacer_no_es_el_ultimo'; end if;
  v_siguiente := retail.fn_produccion_fase_siguiente(v_a.fase_id);
  if v_siguiente is not null then
    select coalesce(sum(a.cantidad), 0) into v_hechas from retail.produccion_avances a where a.fase_id = v_a.fase_id and a.variante_id = v_a.variante_id;
    -- Lo que la fase siguiente ya usó de esta talla y color: lo que terminó o lo que mandó afuera (lo que más sea).
    select greatest(
        coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_siguiente and a.variante_id = v_a.variante_id), 0),
        coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                   where s.fase_id = v_siguiente and sl.variante_id = v_a.variante_id), 0))
      into v_usado;
    if v_usado > v_hechas - v_a.cantidad then return 'deshacer_ya_avanzo'; end if;
  end if;
  return null;
end;
$$;

-- ---------- 1b. Dos ajustes a `fn_fases_de_orden` (de 154000; mismo cuerpo y mismas columnas) ----------
-- (a) Los días en la fase nunca son negativos. Lo anotado aquí se fecha con `clock_timestamp()` (la hora real de escritura: bajo el candado por
--     orden, «el último» tiene que ser el que se escribió último, aunque su transacción haya empezado antes), y `now()` es la hora en que
--     EMPEZÓ la transacción. Dentro de la misma transacción que acaba de anotar (la respuesta de `registrar_avance`, y las pruebas) el avance
--     queda unos milisegundos «en el futuro» y `floor(-0.00001)` daba -1 día: `greatest(…, 0)`.
-- (b) Una fase está HECHA cuando todo lo que entró ya está resuelto: las buenas, más las segundas y los faltantes que el servicio devolvió con su
--     motivo. Antes solo contaban las buenas: con 48 buenas y 2 faltantes de 50, Costura se quedaba «en curso» para siempre y Acabado nunca
--     podía cerrarse (principio 2: ningún estado imposible). En una fase del Taller no hay segundas ni faltantes: no cambia nada.
create or replace function retail.fn_fases_de_orden(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid; v_plan integer; v_abierta timestamptz; v_f record; v_salida jsonb := '[]'::jsonb;
  v_entrada integer; v_hechas integer; v_salieron integer; v_volvieron integer; v_buenas integer; v_segundas integer; v_faltantes integer;
  v_prev_hecha boolean := true; v_prev_hechas integer; v_prev_fin timestamptz; v_estado text; v_actual boolean; v_hay_actual boolean := false;
  v_empezada boolean; v_desde timestamptz; v_desde_a timestamptz; v_desde_s timestamptz; v_fin timestamptz; v_devengado numeric;
begin
  select p.ubicacion_id, p.cantidad_plan, p.created_at into v_ubicacion, v_plan, v_abierta
    from retail.producciones p where p.id = p_produccion_id;
  if v_ubicacion is null or not retail.fn_produccion_puede_leer(v_ubicacion) then return null; end if;
  v_prev_hechas := v_plan; v_prev_fin := v_abierta;
  for v_f in
    select f.*, pr.nombre as proveedor_nombre
    from retail.produccion_fases f left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
    where f.produccion_id = p_produccion_id order by f.secuencia
  loop
    select coalesce(sum(a.cantidad), 0), min(a.created_at), max(a.created_at) into v_hechas, v_desde_a, v_fin
      from retail.produccion_avances a where a.fase_id = v_f.id;
    select coalesce(sum(l.cantidad), 0), min(s.created_at) into v_salieron, v_desde_s
      from retail.produccion_salidas s join retail.produccion_salida_lineas l on l.salida_id = s.id where s.fase_id = v_f.id;
    -- La fase empezó con lo primero que se anotó: un avance o una salida (least ignora los nulos).
    v_desde := least(v_desde_a, v_desde_s);
    select coalesce(sum(l.buenas), 0), coalesce(sum(l.segundas), 0), coalesce(sum(l.faltantes), 0)
      into v_buenas, v_segundas, v_faltantes
      from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas l on l.vuelta_id = vu.id where vu.fase_id = v_f.id;
    v_volvieron := v_buenas + v_segundas + v_faltantes;
    v_entrada := v_prev_hechas;
    v_empezada := v_desde is not null;
    if v_prev_hecha and v_entrada > 0 and v_hechas + v_segundas + v_faltantes >= v_entrada then v_estado := 'hecha';
    elsif v_empezada then v_estado := 'en_curso';
    else v_estado := 'pendiente'; end if;
    v_actual := (v_estado <> 'hecha') and not v_hay_actual;
    if v_actual then v_hay_actual := true; end if;
    v_devengado := case when v_f.quien = 'servicio' and v_volvieron > 0 then round(v_buenas * v_f.tarifa_prenda + v_f.fijo_orden, 2)
                        when v_f.quien = 'servicio' then 0 else null end;
    v_salida := v_salida || jsonb_build_object(
      'id', v_f.id, 'clave', v_f.clave, 'nombre', retail.fn_fase_nombre(v_f.clave), 'secuencia', v_f.secuencia, 'posicion', v_f.posicion,
      'quien', v_f.quien, 'proveedor_id', v_f.proveedor_id, 'proveedor_nombre', v_f.proveedor_nombre,
      'tarifa_prenda', v_f.tarifa_prenda, 'fijo_orden', v_f.fijo_orden, 'cantidad_minima', v_f.cantidad_minima,
      'fecha_prometida', v_f.fecha_prometida, 'nota', v_f.nota,
      'entrada', v_entrada, 'hechas', v_hechas, 'afuera', greatest(v_salieron - v_volvieron, 0), 'salieron', v_salieron,
      'segundas', v_segundas, 'faltantes', v_faltantes,
      'estado', v_estado, 'actual', v_actual, 'empezada', v_empezada,
      'desde', coalesce(v_desde, case when v_actual then v_prev_fin end),
      'dias_en_fase', case when v_estado = 'hecha' then null
                           else greatest(floor(extract(epoch from (now() - coalesce(v_desde, case when v_actual then v_prev_fin end))) / 86400), 0)::int end,
      'devengado', v_devengado);
    v_prev_hecha := (v_estado = 'hecha');
    v_prev_hechas := v_hechas;
    v_prev_fin := coalesce(v_fin, v_prev_fin);
  end loop;
  return v_salida;
end;
$$;

-- ---------- 2. «Terminé N» en una fase del Taller ----------
-- `p_lineas` = [{variante_id, cantidad}]. Devuelve `fn_fases_de_orden` de la orden, ya con el avance.
create or replace function retail.registrar_avance(p_fase_id uuid, p_lineas jsonb, p_nota text default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_op record; v_l record; v_entrada integer; v_hechas integer; v_plan integer; v_total integer := 0; v_nota text; v_primera boolean;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if v_op.quien <> 'taller' then
    raise exception 'La fase «%» la hace %: lo que vuelve se anota en la Vuelta, no como avance', retail.fn_fase_nombre(v_op.clave), coalesce(v_op.proveedor_nombre, 'un servicio')
      using hint = 'fase_de_servicio';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  -- Un candado por orden (ADR-0190): dos «Terminé» a la vez se forman en fila y el segundo ve el saldo real.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_primera := retail.fn_produccion_fase_anterior(p_fase_id) is null;
  for v_l in select * from retail.fn_produccion_lineas_cantidad(p_lineas, 'avance') loop
    select l.cantidad_plan into v_plan from retail.produccion_lineas l where l.produccion_id = v_op.produccion_id and l.variante_id = v_l.variante_id;
    if v_plan is null then
      raise exception 'La talla y color % no es de esta orden', retail.fn_produccion_variante_texto(v_l.variante_id) using hint = 'avance_variante_ajena';
    end if;
    v_entrada := retail.fn_produccion_entrada_variante(p_fase_id, v_l.variante_id);
    select coalesce(sum(a.cantidad), 0) into v_hechas from retail.produccion_avances a where a.fase_id = p_fase_id and a.variante_id = v_l.variante_id;
    if v_hechas + v_l.cantidad > v_entrada then
      if v_primera then
        raise exception 'En % el plan de % es % (hasta % cortando de más) y ya terminaste %: no puedes terminar % más',
          retail.fn_fase_nombre(v_op.clave), retail.fn_produccion_variante_texto(v_l.variante_id), v_plan, v_entrada, v_hechas, v_l.cantidad
          using hint = 'avance_excede';
      end if;
      raise exception 'En % solo entraron % de % y ya terminaste %: no puedes terminar % más',
        retail.fn_fase_nombre(v_op.clave), v_entrada, retail.fn_produccion_variante_texto(v_l.variante_id), v_hechas, v_l.cantidad
        using hint = 'avance_excede';
    end if;
    insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, nota, hecho_por, created_at)
      values (p_fase_id, v_l.variante_id, v_l.cantidad, 'taller', v_nota, v_op.actor, clock_timestamp());
    v_total := v_total + v_l.cantidad;
  end loop;
  -- Actividad (ADR-0207): sin montos. Si falla, el avance igual queda anotado.
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_avance',
      'terminó ' || retail.fn_actividad_cuantas(v_total, 'prenda', 'prendas') || ' de ' || retail.fn_fase_nombre(v_op.clave)
        || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave, 'cantidad', v_total),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el avance de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

-- ---------- 3. Deshacer el último avance ----------
create or replace function retail.deshacer_avance(p_avance_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare v_a record; v_op record; v_motivo text; v_siguiente uuid;
begin
  select a.id, a.fase_id, a.variante_id, a.cantidad, a.origen into v_a from retail.produccion_avances a where a.id = p_avance_id;
  if v_a.id is null then
    raise exception 'Ese avance no existe' using hint = 'avance_inexistente';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_a.fase_id);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := retail.fn_produccion_avance_deshacible(p_avance_id);
  if v_motivo = 'deshacer_origen' then
    raise exception 'Lo que volvió de un servicio o un Deshacer no se deshace: se corrige con otra anotación' using hint = v_motivo;
  elsif v_motivo = 'deshacer_ya_hecho' then
    raise exception 'Ese avance ya se deshizo' using hint = v_motivo;
  elsif v_motivo = 'deshacer_no_es_el_ultimo' then
    raise exception 'Solo se deshace el último avance de % en %: deshaz primero el más reciente',
      retail.fn_produccion_variante_texto(v_a.variante_id), retail.fn_fase_nombre(v_op.clave) using hint = v_motivo;
  elsif v_motivo = 'deshacer_ya_avanzo' then
    v_siguiente := retail.fn_produccion_fase_siguiente(v_a.fase_id);
    raise exception 'Las prendas de ese avance ya pasaron a %: no se puede deshacer',
      (select retail.fn_fase_nombre(f.clave) from retail.produccion_fases f where f.id = v_siguiente) using hint = v_motivo;
  elsif v_motivo is not null then
    raise exception 'Ese avance no se puede deshacer' using hint = v_motivo;
  end if;
  insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, deshace_id, hecho_por, created_at)
    values (v_a.fase_id, v_a.variante_id, -v_a.cantidad, 'deshacer', p_avance_id, v_op.actor, clock_timestamp());
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_avance_deshecho',
      'deshizo ' || retail.fn_actividad_cuantas(v_a.cantidad, 'prenda terminada', 'prendas terminadas') || ' de '
        || retail.fn_fase_nombre(v_op.clave) || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', v_a.fase_id, 'fase', v_op.clave,
                         'avance_id', p_avance_id, 'cantidad', v_a.cantidad),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el deshacer de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

-- ---------- 4. La Salida: lo que se va a un servicio ----------
-- `p_lineas` = [{variante_id, cantidad}]; `p_guia` es el número de la guía de remisión como texto (el Taller no emite comprobantes, A3).
create or replace function retail.registrar_salida(p_fase_id uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare v_op record; v_l record; v_entrada integer; v_salieron integer; v_total integer := 0; v_guia text; v_nota text; v_salida uuid;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if v_op.quien <> 'servicio' then
    raise exception 'La fase «%» la hace el Taller: nada sale a un servicio; lo terminado se anota como avance', retail.fn_fase_nombre(v_op.clave)
      using hint = 'salida_fase_del_taller';
  end if;
  v_guia := nullif(btrim(coalesce(p_guia, '')), '');
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  insert into retail.produccion_salidas (fase_id, guia, nota, hecho_por, created_at)
    values (p_fase_id, v_guia, v_nota, v_op.actor, clock_timestamp()) returning id into v_salida;
  for v_l in select * from retail.fn_produccion_lineas_cantidad(p_lineas, 'salida') loop
    if not exists (select 1 from retail.produccion_lineas l where l.produccion_id = v_op.produccion_id and l.variante_id = v_l.variante_id) then
      raise exception 'La talla y color % no es de esta orden', retail.fn_produccion_variante_texto(v_l.variante_id) using hint = 'salida_variante_ajena';
    end if;
    v_entrada := retail.fn_produccion_entrada_variante(p_fase_id, v_l.variante_id);
    select coalesce(sum(sl.cantidad), 0) into v_salieron
      from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
     where s.fase_id = p_fase_id and sl.variante_id = v_l.variante_id;
    if v_salieron + v_l.cantidad > v_entrada then
      raise exception 'De % solo pueden salir a % % y ya salieron %: no pueden salir % más',
        retail.fn_produccion_variante_texto(v_l.variante_id), retail.fn_fase_nombre(v_op.clave), v_entrada, v_salieron, v_l.cantidad
        using hint = 'salida_excede';
    end if;
    insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (v_salida, v_l.variante_id, v_l.cantidad);
    v_total := v_total + v_l.cantidad;
  end loop;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_salida',
      'mandó ' || retail.fn_actividad_cuantas(v_total, 'prenda', 'prendas') || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero)
        || ' a ' || retail.fn_fase_nombre(v_op.clave) || ' con ' || coalesce(v_op.proveedor_nombre, 'un servicio')
        || coalesce(' (guía ' || v_guia || ')', ''),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave,
                         'salida_id', v_salida, 'proveedor_id', v_op.proveedor_id, 'cantidad', v_total, 'guia', v_guia),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la salida de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

-- ---------- 5. La Vuelta: lo que regresa del servicio ----------
-- `p_lineas` = [{variante_id, buenas, segundas, faltantes, motivo}] (enteros ≥ 0, alguno > 0; el motivo es obligatorio si algo no volvió bueno).
-- Cada línea con buenas inserta su avance `origen = vuelta`: eso es lo que hace avanzar la fase y lo que devenga el servicio.
create or replace function retail.registrar_vuelta(p_fase_id uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_op record; v_l jsonb; v_variante uuid; v_buenas numeric; v_segundas numeric; v_faltantes numeric; v_motivo text; v_vistas uuid[] := '{}';
  v_salieron integer; v_volvieron integer; v_guia text; v_nota text; v_vuelta uuid; v_tot_buenas integer := 0; v_tot_segundas integer := 0;
  v_tot_faltantes integer := 0;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if v_op.quien <> 'servicio' then
    raise exception 'La fase «%» la hace el Taller: nada vuelve de un servicio; lo terminado se anota como avance', retail.fn_fase_nombre(v_op.clave)
      using hint = 'vuelta_fase_del_taller';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Di cuántas volvieron de cada talla y color' using hint = 'vuelta_sin_lineas';
  end if;
  v_guia := nullif(btrim(coalesce(p_guia, '')), '');
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  insert into retail.produccion_vueltas (fase_id, guia, nota, hecho_por, created_at)
    values (p_fase_id, v_guia, v_nota, v_op.actor, clock_timestamp()) returning id into v_vuelta;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    begin
      v_variante := nullif(v_l ->> 'variante_id', '')::uuid;
    exception when others then
      raise exception 'Una de las tallas o colores no es válida' using hint = 'vuelta_variante_invalida';
    end;
    if v_variante is null then
      raise exception 'Una de las líneas no dice de qué talla y color es' using hint = 'vuelta_variante_invalida';
    end if;
    if v_variante = any (v_vistas) then
      raise exception 'La misma talla y color va una sola vez' using hint = 'vuelta_variante_repetida';
    end if;
    v_vistas := v_vistas || v_variante;
    if not exists (select 1 from retail.produccion_lineas l where l.produccion_id = v_op.produccion_id and l.variante_id = v_variante) then
      raise exception 'La talla y color % no es de esta orden', retail.fn_produccion_variante_texto(v_variante) using hint = 'vuelta_variante_ajena';
    end if;
    begin
      v_buenas := coalesce(nullif(btrim(coalesce(v_l ->> 'buenas', '')), '')::numeric, 0);
      v_segundas := coalesce(nullif(btrim(coalesce(v_l ->> 'segundas', '')), '')::numeric, 0);
      v_faltantes := coalesce(nullif(btrim(coalesce(v_l ->> 'faltantes', '')), '')::numeric, 0);
    exception when others then
      raise exception 'Las cantidades de % no son números válidos', retail.fn_produccion_variante_texto(v_variante) using hint = 'vuelta_cantidad_invalida';
    end;
    if v_buenas < 0 or v_segundas < 0 or v_faltantes < 0 or v_buenas <> trunc(v_buenas) or v_segundas <> trunc(v_segundas)
       or v_faltantes <> trunc(v_faltantes) or v_buenas + v_segundas + v_faltantes > 1000000 then
      raise exception 'Las cantidades de % tienen que ser enteros de cero en adelante', retail.fn_produccion_variante_texto(v_variante) using hint = 'vuelta_cantidad_invalida';
    end if;
    if v_buenas + v_segundas + v_faltantes = 0 then
      raise exception 'De % no volvió nada: quita esa línea o di cuántas volvieron', retail.fn_produccion_variante_texto(v_variante) using hint = 'vuelta_sin_cantidad';
    end if;
    v_motivo := nullif(btrim(coalesce(v_l ->> 'motivo', '')), '');
    if v_segundas + v_faltantes > 0 and v_motivo is null then
      raise exception 'Lo que no volvió bueno de % dice por qué', retail.fn_produccion_variante_texto(v_variante) using hint = 'vuelta_sin_motivo';
    end if;
    select coalesce(sum(sl.cantidad), 0) into v_salieron
      from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
     where s.fase_id = p_fase_id and sl.variante_id = v_variante;
    select coalesce(sum(vl.buenas + vl.segundas + vl.faltantes), 0) into v_volvieron
      from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
     where vu.fase_id = p_fase_id and vl.variante_id = v_variante and vu.id <> v_vuelta;
    if v_volvieron + v_buenas + v_segundas + v_faltantes > v_salieron then
      raise exception 'Salieron % de % y ya volvieron %: no pueden volver % más',
        v_salieron, retail.fn_produccion_variante_texto(v_variante), v_volvieron, (v_buenas + v_segundas + v_faltantes)::integer
        using hint = 'vuelta_excede';
    end if;
    insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas, segundas, faltantes, motivo)
      values (v_vuelta, v_variante, v_buenas::integer, v_segundas::integer, v_faltantes::integer, v_motivo);
    if v_buenas > 0 then
      insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, vuelta_id, hecho_por, created_at)
        values (p_fase_id, v_variante, v_buenas::integer, 'vuelta', v_vuelta, v_op.actor, clock_timestamp());
    end if;
    v_tot_buenas := v_tot_buenas + v_buenas::integer;
    v_tot_segundas := v_tot_segundas + v_segundas::integer;
    v_tot_faltantes := v_tot_faltantes + v_faltantes::integer;
  end loop;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_vuelta',
      'recibió ' || retail.fn_actividad_cuantas(v_tot_buenas, 'prenda buena', 'prendas buenas') || ' de ' || retail.fn_fase_nombre(v_op.clave)
        || ' (' || coalesce(v_op.proveedor_nombre, 'un servicio') || ') de la ' || retail.fn_produccion_numero_texto(v_op.numero)
        || case when v_tot_segundas > 0 then ' · ' || retail.fn_actividad_cuantas(v_tot_segundas, 'segunda', 'segundas') else '' end
        || case when v_tot_faltantes > 0 then ' · ' || retail.fn_actividad_cuantas(v_tot_faltantes, 'faltante', 'faltantes') else '' end,
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave,
                         'vuelta_id', v_vuelta, 'proveedor_id', v_op.proveedor_id, 'buenas', v_tot_buenas, 'segundas', v_tot_segundas,
                         'faltantes', v_tot_faltantes, 'guia', v_guia),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la vuelta de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

-- ---------- 6. La orden entera en una lectura ----------
-- {orden, lineas, fases (fn_fases_de_orden + por_variante), insumos, costos (solo quien ve los costos; si no, null), linea_de_tiempo
--  (del más reciente al más viejo), permisos}. NULL si la orden no existe o no se puede leer.
create or replace function retail.fn_orden_produccion(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_o record; v_ve_costos boolean; v_producto jsonb; v_lineas jsonb; v_fases jsonb; v_f jsonb; v_fases_salida jsonb := '[]'::jsonb;
  v_por_variante jsonb; v_insumos jsonb; v_costos jsonb; v_tiempo jsonb; v_fase_id uuid;
  v_tela_est numeric := 0; v_avios_est numeric := 0; v_tela_real numeric := 0; v_avios_real numeric := 0;
  v_serv_est numeric := 0; v_serv_dev numeric := 0;
begin
  select p.id, p.numero, p.estado, p.es_muestra, p.fecha_entrega, p.nota, p.created_at, p.inventariado_at, p.cantidad_plan, p.cantidad_buenas,
         p.ubicacion_id, p.producto_id, p.creado_por, u.nombre as ubicacion_nombre, nullif(concat_ws(' ', pe.nombres, pe.apellidos), '') as creado_por_nombre
    into v_o
    from retail.producciones p
    join retail.ubicaciones u on u.id = p.ubicacion_id
    left join public.personas pe on pe.id = p.creado_por
   where p.id = p_produccion_id;
  if v_o.id is null or not retail.fn_produccion_puede_leer(v_o.ubicacion_id) then return null; end if;
  -- Los costos del Taller los ve quien ve `produccion` parado en ese Taller, o el líder (ADR-0400, supuestos).
  v_ve_costos := retail.fn_es_lider() or (retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(v_o.ubicacion_id));

  -- El modelo: referencia, categoría (para dibujar la prenda sin foto, ADR-0333), tejido y el precio más alto de sus variantes.
  select jsonb_build_object(
      'id', pr.id, 'referencia', pr.referencia, 'codigo', pr.codigo, 'estado', pr.estado,
      'categoria', case when c.id is null then null else jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia) end,
      'tejido_id', pr.tejido_id, 'tejido_nombre', t.nombre,
      'precio', (select max(v.precio) from retail.variantes v where v.producto_id = pr.id and v.activo))
    into v_producto
    from retail.productos pr
    left join retail.categorias c on c.id = pr.categoria_id
    left join retail.tejidos t on t.id = pr.tejido_id
   where pr.id = v_o.producto_id;

  -- Las líneas: por color y talla (XS … XL antes que los números; lo demás al final).
  select coalesce(jsonb_agg(jsonb_build_object(
      'variante_id', l.variante_id, 'sku', v.sku, 'codigo', v.codigo, 'talla', ta.valor, 'color_codigo', v.color_codigo,
      'color_nombre', co.nombre, 'color_hex', co.hex, 'cantidad_plan', l.cantidad_plan, 'cantidad_buenas', l.cantidad_buenas)
      order by co.nombre, v.color_codigo, retail.fn_actividad_peso_talla(coalesce(ta.valor, '')), ta.valor, l.created_at), '[]'::jsonb)
    into v_lineas
    from retail.produccion_lineas l
    join retail.variantes v on v.id = l.variante_id
    left join retail.tallas ta on ta.id = v.talla_id
    left join retail.colores co on co.codigo = v.color_codigo
   where l.produccion_id = p_produccion_id;

  -- Las fases, cada una con su detalle por talla y color (los mismos candados que las funciones de escritura: la pantalla precarga «lo que falta»).
  v_fases := coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb);
  for v_f in select * from jsonb_array_elements(v_fases) loop
    v_fase_id := (v_f ->> 'id')::uuid;
    select coalesce(jsonb_agg(x.fila order by x.color_nombre, x.color_codigo, x.peso, x.talla, x.creada), '[]'::jsonb)
      into v_por_variante
      from (
        select co.nombre as color_nombre, v.color_codigo, retail.fn_actividad_peso_talla(coalesce(ta.valor, '')) as peso, ta.valor as talla, l.created_at as creada,
               jsonb_build_object(
                 'variante_id', l.variante_id, 'plan', l.cantidad_plan,
                 'entrada', retail.fn_produccion_entrada_variante(v_fase_id, l.variante_id),
                 'hechas', coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_fase_id and a.variante_id = l.variante_id), 0),
                 'salieron', coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                                       where s.fase_id = v_fase_id and sl.variante_id = l.variante_id), 0),
                 'volvieron_buenas', coalesce((select sum(vl.buenas) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                                               where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0),
                 'segundas', coalesce((select sum(vl.segundas) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                                       where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0),
                 'faltantes', coalesce((select sum(vl.faltantes) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                                        where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0),
                 'afuera', greatest(
                   coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                             where s.fase_id = v_fase_id and sl.variante_id = l.variante_id), 0)
                   - coalesce((select sum(vl.buenas + vl.segundas + vl.faltantes) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                               where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0), 0)) as fila
          from retail.produccion_lineas l
          join retail.variantes v on v.id = l.variante_id
          left join retail.tallas ta on ta.id = v.talla_id
          left join retail.colores co on co.codigo = v.color_codigo
         where l.produccion_id = p_produccion_id
      ) x;
    v_fases_salida := v_fases_salida || (v_f || jsonb_build_object('por_variante', v_por_variante));
    if v_f ->> 'quien' = 'servicio' then
      v_serv_est := v_serv_est + coalesce((v_f ->> 'tarifa_prenda')::numeric, 0) * v_o.cantidad_plan + coalesce((v_f ->> 'fijo_orden')::numeric, 0);
      v_serv_dev := v_serv_dev + coalesce((v_f ->> 'devengado')::numeric, 0);
    end if;
  end loop;

  -- La tela y los avíos de la orden: el plan, lo usado (consumo − devolución del libro, por insumo: el libro no sabe de colores, así que una
  -- misma tela en dos colores muestra el mismo usado en las dos filas) y el saldo del insumo en ese Taller (el `case` de `v_insumo_saldos`).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pi.id, 'insumo_id', pi.insumo_id, 'codigo', i.codigo, 'nombre', i.nombre, 'tipo', i.tipo, 'unidad', i.unidad_medida,
      'color_codigo', pi.color_codigo, 'color_nombre', co.nombre, 'consumo_por_prenda', pi.consumo_por_prenda, 'cantidad_plan', pi.cantidad_plan,
      'usado', coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) from retail.movimientos_insumo mi
                         where mi.produccion_id = p_produccion_id and mi.insumo_id = pi.insumo_id and mi.tipo in ('consumo', 'devolucion')), 0),
      'saldo', coalesce((select sum(case when mi.tipo in ('compra', 'devolucion') then mi.cantidad
                                         when mi.tipo in ('consumo', 'merma') then -mi.cantidad else mi.cantidad end)
                         from retail.movimientos_insumo mi where mi.insumo_id = pi.insumo_id and mi.ubicacion_id = v_o.ubicacion_id), 0),
      'nota', pi.nota) order by i.tipo desc, i.nombre, pi.color_codigo), '[]'::jsonb)
    into v_insumos
    from retail.produccion_insumos pi
    join retail.insumos i on i.id = pi.insumo_id
    left join retail.colores co on co.codigo = pi.color_codigo
   where pi.produccion_id = p_produccion_id;

  if v_ve_costos then
    -- Estimado: el plan de cada tela o avío × el costo del lote más antiguo con saldo en ese Taller (PEPS, como `registrar_consumo_insumo`);
    -- sin lote con saldo, 0 (la pantalla dice «sin tela recibida», no inventa un precio).
    select coalesce(sum(case when i.tipo = 'tela' then pi.cantidad_plan * coalesce(peps.costo, 0) end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then pi.cantidad_plan * coalesce(peps.costo, 0) end), 0)
      into v_tela_est, v_avios_est
      from retail.produccion_insumos pi
      join retail.insumos i on i.id = pi.insumo_id
      left join lateral (
        select l.costo_unitario as costo
          from retail.insumo_lotes l
         where l.insumo_id = pi.insumo_id and l.ubicacion_id = v_o.ubicacion_id
           and l.cantidad_ingresada
               - coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo in ('consumo', 'merma')), 0)
               + coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo = 'devolucion'), 0) > 0
         order by l.fecha_ingreso, l.created_at limit 1
      ) peps on true
     where pi.produccion_id = p_produccion_id;
    -- Real hasta hoy: lo consumido menos lo devuelto, al costo del lote de cada movimiento (la misma cuenta de `fn_recalcular_costo_insumos_produccion`).
    select coalesce(sum(case when i.tipo = 'tela' then (case when mi.tipo = 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then (case when mi.tipo = 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario end), 0)
      into v_tela_real, v_avios_real
      from retail.movimientos_insumo mi
      join retail.insumos i on i.id = mi.insumo_id
     where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion');
    v_costos := jsonb_build_object(
      'tela_estimado', round(v_tela_est, 2), 'avios_estimado', round(v_avios_est, 2),
      'tela_real', round(v_tela_real, 2), 'avios_real', round(v_avios_real, 2),
      'servicios_estimado', round(v_serv_est, 2), 'servicios_devengado', round(v_serv_dev, 2),
      'total_estimado', round(v_tela_est + v_avios_est + v_serv_est, 2),
      'total_real_hasta_hoy', round(v_tela_real + v_avios_real + v_serv_dev, 2));
  end if;

  -- La línea de tiempo: la apertura, cada avance del Taller y cada Deshacer, cada Salida y cada Vuelta; del más reciente al más viejo.
  -- `avance_id` viaja solo en un avance que todavía se puede deshacer (la misma regla que `deshacer_avance`).
  select coalesce(jsonb_agg(x.fila order by x.cuando desc, x.prioridad desc), '[]'::jsonb)
    into v_tiempo
    from (
      select p.created_at as cuando, 0 as prioridad, jsonb_build_object(
          'cuando', p.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'apertura',
          'fase_clave', null, 'fase_nombre', null, 'cantidad', p.cantidad_plan,
          'detalle', retail.fn_actividad_cuantas(p.cantidad_plan, 'prenda', 'prendas') || case when p.es_muestra then ' (muestra)' else '' end
            || coalesce(' · afuera: ' || (
                 select string_agg(retail.fn_fase_nombre(f.clave) || ' con ' || pr.nombre, ', ' order by f.secuencia)
                   from retail.produccion_fases f join retail.proveedores_produccion pr on pr.id = f.proveedor_id
                  where f.produccion_id = p.id and f.quien = 'servicio'), ' · todo en el Taller'),
          'avance_id', null, 'id', p.id) as fila
        from retail.producciones p left join public.personas pe on pe.id = p.creado_por
       where p.id = p_produccion_id
      union all
      select a.created_at, 1, jsonb_build_object(
          'cuando', a.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''),
          'tipo', case when a.origen = 'deshacer' then 'deshacer' else 'avance' end,
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', abs(a.cantidad),
          'detalle', abs(a.cantidad) || ' de ' || retail.fn_produccion_variante_texto(a.variante_id) || coalesce(' · ' || a.nota, ''),
          'variante_id', a.variante_id,
          'avance_id', case when a.origen = 'taller' and retail.fn_produccion_avance_deshacible(a.id) is null then a.id end, 'id', a.id)
        from retail.produccion_avances a
        join retail.produccion_fases f on f.id = a.fase_id
        left join public.personas pe on pe.id = a.hecho_por
       where f.produccion_id = p_produccion_id and a.origen in ('taller', 'deshacer')
      union all
      select s.created_at, 2, jsonb_build_object(
          'cuando', s.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'salida',
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', t.cantidad,
          'detalle', retail.fn_actividad_cuantas(t.cantidad, 'prenda', 'prendas') || ' a ' || coalesce(pr.nombre, 'un servicio')
            || coalesce(' · guía ' || s.guia, '') || coalesce(' · ' || s.nota, ''),
          'guia', s.guia, 'lineas', t.lineas, 'avance_id', null, 'id', s.id)
        from retail.produccion_salidas s
        join retail.produccion_fases f on f.id = s.fase_id
        left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
        left join public.personas pe on pe.id = s.hecho_por
        cross join lateral (
          select coalesce(sum(sl.cantidad), 0)::integer as cantidad,
                 coalesce(jsonb_agg(jsonb_build_object('variante_id', sl.variante_id, 'cantidad', sl.cantidad)), '[]'::jsonb) as lineas
            from retail.produccion_salida_lineas sl where sl.salida_id = s.id) t
       where f.produccion_id = p_produccion_id
      union all
      select vu.created_at, 3, jsonb_build_object(
          'cuando', vu.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'vuelta',
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', t.buenas,
          'detalle', t.buenas || ' buenas'
            || case when t.segundas > 0 then ' · ' || t.segundas || ' segundas' else '' end
            || case when t.faltantes > 0 then ' · ' || t.faltantes || ' faltantes' else '' end
            || coalesce(': ' || t.motivos, '') || coalesce(' · guía ' || vu.guia, '') || coalesce(' · ' || vu.nota, ''),
          'buenas', t.buenas, 'segundas', t.segundas, 'faltantes', t.faltantes, 'guia', vu.guia, 'lineas', t.lineas, 'avance_id', null, 'id', vu.id)
        from retail.produccion_vueltas vu
        join retail.produccion_fases f on f.id = vu.fase_id
        left join public.personas pe on pe.id = vu.hecho_por
        cross join lateral (
          select coalesce(sum(vl.buenas), 0)::integer as buenas, coalesce(sum(vl.segundas), 0)::integer as segundas,
                 coalesce(sum(vl.faltantes), 0)::integer as faltantes, string_agg(distinct vl.motivo, '; ') as motivos,
                 coalesce(jsonb_agg(jsonb_build_object('variante_id', vl.variante_id, 'buenas', vl.buenas, 'segundas', vl.segundas,
                                                       'faltantes', vl.faltantes, 'motivo', vl.motivo)), '[]'::jsonb) as lineas
            from retail.produccion_vuelta_lineas vl where vl.vuelta_id = vu.id) t
       where f.produccion_id = p_produccion_id
    ) x;

  return jsonb_build_object(
    'orden', jsonb_build_object(
      'id', v_o.id, 'numero', v_o.numero, 'numero_texto', retail.fn_produccion_numero_texto(v_o.numero), 'estado', v_o.estado,
      'es_muestra', v_o.es_muestra, 'fecha_entrega', v_o.fecha_entrega, 'nota', v_o.nota, 'created_at', v_o.created_at,
      'creado_por', v_o.creado_por, 'creado_por_nombre', v_o.creado_por_nombre, 'inventariado_at', v_o.inventariado_at,
      'cantidad_plan', v_o.cantidad_plan, 'cantidad_buenas', v_o.cantidad_buenas,
      'ubicacion_id', v_o.ubicacion_id, 'ubicacion_nombre', v_o.ubicacion_nombre, 'producto', v_producto),
    'lineas', v_lineas,
    'fases', v_fases_salida,
    'insumos', v_insumos,
    'costos', v_costos,
    'linea_de_tiempo', v_tiempo,
    'permisos', jsonb_build_object(
      'puede_operar', retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(v_o.ubicacion_id),
      've_costos', v_ve_costos));
end;
$$;

-- ---------- 7. Permisos ----------
revoke all on function retail.registrar_avance(uuid, jsonb, text) from public, anon;
revoke all on function retail.deshacer_avance(uuid) from public, anon;
revoke all on function retail.registrar_salida(uuid, jsonb, text, text) from public, anon;
revoke all on function retail.registrar_vuelta(uuid, jsonb, text, text) from public, anon;
revoke all on function retail.fn_orden_produccion(uuid) from public, anon;
grant execute on function retail.registrar_avance(uuid, jsonb, text) to authenticated, service_role;
grant execute on function retail.deshacer_avance(uuid) to authenticated, service_role;
grant execute on function retail.registrar_salida(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function retail.registrar_vuelta(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function retail.fn_orden_produccion(uuid) to authenticated, service_role;
-- Internas: nadie las llama desde la API.
revoke all on function retail.fn_produccion_fase_anterior(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_fase_siguiente(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_entrada_variante(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_variante_texto(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_lineas_cantidad(jsonb, text) from public, anon, authenticated;
revoke all on function retail.fn_produccion_operar_fase(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_avance_deshacible(uuid) from public, anon, authenticated;

reset lock_timeout;
