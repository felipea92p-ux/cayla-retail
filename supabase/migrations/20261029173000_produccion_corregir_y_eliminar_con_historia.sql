-- ============================================================================
-- 20261029173000_produccion_corregir_y_eliminar_con_historia.sql — CAYLA V2 (ADR-0570, actividad 3 · 2026-10-29)
--
-- EL PROBLEMA PRIMERO.
--   (1) Una anotación equivocada de una orden casi no se arregla. «Deshacer» solo alcanza a la ÚLTIMA de cada talla y color: si el lunes se anotaron 57 y eran 55, y el martes se anotaron
--       20 más, el 57 queda para siempre. Corregir una fecha no existe. Y lo que se deshace no dice por qué: la historia muestra «Deshizo Costura» y nadie sabe qué pasó.
--   (2) Lo que el equipo quiere contarse de una orden («la tela llegó con una mancha», «Rosa se lleva 10 para terminar en casa») no tiene dónde ir.
--
-- QUÉ HACE (Felipe, 2026-10-29: «editar con facilidad, eliminar con historial de cambio y comentario para entender qué pasó»; rondas 2 y 3: «Corregir» y «Eliminar» en cualquier
-- anotación, motivo obligatorio con atajos, lo eliminado sale de la vista con su rastro y se puede «Restaurar»).
--   · `produccion_cambios` (nueva, de solo agregar): cada corrección, eliminación, restauración y nota de una orden, con quién, cuándo, el motivo y el antes y el después. Se escribe en
--     la MISMA transacción que el cambio: o quedan los dos, o ninguno (la Actividad, en cambio, falla en silencio y no alcanza como historia).
--   · `corregir_anotacion_orden(ids, buenas, fallas, día, motivo)`: un «Terminé» de cualquier día (sus buenas y sus fallas), cantidades y día. Deshace las filas viejas y anota las nuevas.
--   · `eliminar_anotacion_orden(ids, motivo)`: un «Terminé» (buenas o fallas) o la marca de Ploteo.
--   · `restaurar_anotacion_orden(cambio, motivo)`: vuelve a anotar lo eliminado, tal como era y con su día.
--   · `comentar_orden(orden, texto)`: una nota del equipo en la historia.
--   · `fn_produccion_escribir_termine`: la regla de «Terminé» (qué se puede anotar y cuánto) sale a una función que usan `anotar_termine`, corregir y restaurar: una sola regla, no tres.
--   · `fn_produccion_exigir_cadena`: después de un cambio, la fase siguiente no puede haber usado más prendas de las que quedan aquí, por talla y color (la regla de `deshacer_avance`).
--   · `fn_orden_produccion` devuelve los cambios, con lo que quitó, lo que puso y los Deshacer que escribió: la web oculta eso de la historia y cuenta el cambio en su lugar.
--
-- CONTRATO (Liskov)
--   PROMETE: nada se edita ni se borra (corregir = Deshacer lo viejo + anotar lo nuevo, en un solo paso). Una corrección valida EXACTAMENTE lo que valida «Terminé»: nunca más buenas +
--            segundas + perdidas que lo que entró. Ningún cambio deja a la fase siguiente con más prendas de las que le llegaron. Todo cambio lleva motivo y queda en la historia.
--   ASUME:   las funciones vivas con el texto de hoy (anclas verificadas con las migraciones de esta rama hasta 20261029164000). Si una cambió, el reemplazo se detiene sin tocar nada.
--   NO HACE: no corrige salidas ni vueltas de un servicio (esas se anulan con motivo desde que existen, `anular_salida`/`anular_vuelta`, y se anotan otra vez). No toca stock, dinero ni
--            costo: corrige lo anotado en las fases; lo que ya pasó al stock no se toca (la orden ya no está en proceso). No deja borrar una nota (se escribe otra).
--
-- DECIDÍ: una tabla de cambios con las filas que quitó y las que puso (`quita_ids`, `pone_ids`), sin columnas nuevas en las tablas de lo anotado: un Deshacer ya sabe qué deshace
--   (`deshace_id`), así que basta saber qué filas tocó cada cambio. Y la regla de «Terminé» en una función compartida: corregir con su propia copia de las validaciones habría dejado dos
--   reglas que se separan con el primer arreglo.
-- DESCARTÉ: marcar cada fila con un `cambio_id` leído de una variable de la transacción (`set_config`): cualquier inserción del paso quedaría marcada sin que el código lo diga, y una
--   llamada nueva en medio heredaría la marca sin querer. Y un «Restaurar» que solo vuelva a mostrar lo eliminado: las filas viejas ya están deshechas; restaurar es anotar de nuevo,
--   con la misma regla, así que si mientras tanto la fase se llenó, la base lo dice en vez de pasarse.
-- SE ROMPE SI: una misma anotación se corrige desde dos pantallas a la vez: el candado de la orden las pone en fila y la segunda ve sus filas ya deshechas (`cambio_ya_deshecho`), así que
--   no se duplica. Se rompería si algún día otra función escribe en una fase sin tomar el candado de la orden.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una tabla nueva con RLS encendido y SIN políticas (solo la leen funciones security definer,
-- ADR-0195), funciones nuevas, `anotar_termine` entera (es de esta misma obra) y UN reemplazo ANCLADO en `fn_orden_produccion` (ADR-0288). Sin `drop trigger` ni políticas. Dentro
-- del texto de reemplazo no hay ningún `select … into`. Va DESPUÉS de 20261029164000; si alguna vez se vuelve a pegar esa, se vuelve a pegar esta después (si no, «Terminé» queda con
-- su copia de la regla: hace lo mismo, pero ya no es una sola). Prueba: `pnpm pruebas:produccion-correcciones`.
-- ============================================================================
set lock_timeout = '3s';

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

-- 1. La historia de los cambios de una orden: de solo agregar.
create table if not exists retail.produccion_cambios (
  id uuid primary key default gen_random_uuid(),
  produccion_id uuid not null references retail.producciones(id),
  fase_id uuid references retail.produccion_fases(id),
  accion text not null check (accion in ('corregir', 'eliminar', 'restaurar', 'nota')),
  -- «termine»: lo anotado con «Terminé» (sus buenas y sus fallas); «marca»: la marca de una fase que no cuenta prendas (Ploteo).
  objeto text check (objeto in ('termine', 'marca')),
  quita_ids uuid[] not null default '{}',
  pone_ids uuid[] not null default '{}',
  antes jsonb,
  despues jsonb,
  -- El motivo de un cambio o el texto de una nota: nunca vacío.
  texto text not null check (btrim(texto) <> '' and length(texto) <= 1000),
  restaura_id uuid unique references retail.produccion_cambios(id),
  hecho_por uuid not null references public.personas(id),
  created_at timestamptz not null default now(),
  -- Cada acción con su forma: una nota no toca filas; eliminar solo quita; corregir quita y pone; restaurar solo pone y dice qué eliminación deshace (una sola vez: `unique`).
  constraint produccion_cambios_forma check (case accion
    when 'nota' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
    when 'eliminar' then objeto is not null and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) = 0 and restaura_id is null
    when 'corregir' then objeto = 'termine' and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) > 0 and restaura_id is null
    when 'restaurar' then objeto is not null and fase_id is not null and cardinality(quita_ids) = 0 and cardinality(pone_ids) > 0 and restaura_id is not null
    else false end)
);
create index if not exists produccion_cambios_por_orden on retail.produccion_cambios (produccion_id, created_at);
comment on table retail.produccion_cambios is
  'ADR-0570: cada corrección, eliminación, restauración y nota de una orden de producción, con su motivo y el antes y el después. De solo agregar; se escribe en la misma transacción que el cambio.';
alter table retail.produccion_cambios enable row level security;
revoke all on table retail.produccion_cambios from anon, authenticated;
create or replace trigger produccion_cambios_inmutable
  before update or delete on retail.produccion_cambios
  for each row execute function retail.fn_produccion_anotado_inmutable();

-- 2. El motivo de un cambio: obligatorio, hasta 300 letras.
create or replace function retail.fn_produccion_motivo_cambio(p_motivo text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare v text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v is null then
    raise exception 'Cuéntanos por qué: queda en la historia de la orden' using hint = 'cambio_sin_motivo';
  end if;
  if length(v) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'cambio_motivo_largo';
  end if;
  return v;
end;
$$;
revoke all on function retail.fn_produccion_motivo_cambio(text) from public, anon, authenticated;

-- 3. La regla de «Terminé»: valida y escribe las buenas y las fallas de una fase del Taller. No toma el candado ni pide permisos: eso lo hace quien la llama.
create or replace function retail.fn_produccion_escribir_termine(p_fase_id uuid, p_lineas jsonb, p_fallas jsonb, p_nota text, p_hecho timestamptz, p_actor uuid)
returns jsonb
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_l record; v_x jsonb; v_entrada integer; v_hechas integer; v_plan integer; v_primera boolean;
  v_variante uuid; v_n numeric; v_destino text; v_motivo text; v_vistas text[] := '{}';
  v_buenas jsonb := '{}'::jsonb; v_fallas jsonb := '[]'::jsonb; v_pide jsonb := '{}'::jsonb;
  v_total integer := 0; v_con_falla integer := 0; v_id text; v_nuevo uuid; v_avance_ids uuid[] := '{}'; v_falla_ids uuid[] := '{}';
begin
  select f.id, f.produccion_id, f.clave, f.quien, pr.nombre as proveedor_nombre into v_f
    from retail.produccion_fases f left join retail.proveedores_produccion pr on pr.id = f.proveedor_id where f.id = p_fase_id;
  if retail.fn_fase_es_hito(v_f.clave) then
    raise exception 'La fase «%» no cuenta prendas: se marca como hecha, no se anota «Terminé»', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_es_hito';
  end if;
  if v_f.quien <> 'taller' then
    raise exception 'La fase «%» la hace %: lo que vuelve se anota en la Vuelta, no como avance', retail.fn_fase_nombre(v_f.clave), coalesce(v_f.proveedor_nombre, 'un servicio')
      using hint = 'fase_de_servicio';
  end if;
  v_primera := retail.fn_produccion_fase_anterior(p_fase_id) is null;

  -- Las fallas: talla y color, cuántas, qué pasa con ellas y por qué.
  if p_fallas is not null and jsonb_typeof(p_fallas) = 'array' then
    for v_x in select * from jsonb_array_elements(p_fallas) loop
      begin
        v_variante := nullif(v_x ->> 'variante_id', '')::uuid;
      exception when others then
        raise exception 'Una de las prendas con falla no dice bien de qué talla y color es' using hint = 'falla_variante_invalida';
      end;
      if v_variante is null then
        raise exception 'Una de las prendas con falla no dice de qué talla y color es' using hint = 'falla_variante_invalida';
      end if;
      v_destino := v_x ->> 'destino';
      if v_destino is null or v_destino not in ('segunda', 'perdida', 'arreglo') then
        raise exception 'Di qué pasa con las prendas con falla de %: se arreglan, son segunda o se perdieron', retail.fn_produccion_variante_texto(v_variante) using hint = 'falla_destino_invalido';
      end if;
      if (v_variante::text || ':' || v_destino) = any (v_vistas) then
        raise exception 'Las prendas con falla de % van juntas en una sola línea por destino', retail.fn_produccion_variante_texto(v_variante) using hint = 'falla_repetida';
      end if;
      v_vistas := v_vistas || (v_variante::text || ':' || v_destino);
      begin
        v_n := nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric;
      exception when others then
        raise exception 'La cantidad con falla de % no es un número válido', retail.fn_produccion_variante_texto(v_variante) using hint = 'falla_cantidad_invalida';
      end;
      if v_n is null or v_n <= 0 or v_n <> trunc(v_n) or v_n > 1000000 then
        raise exception 'La cantidad con falla de % tiene que ser un entero mayor que cero', retail.fn_produccion_variante_texto(v_variante) using hint = 'falla_cantidad_invalida';
      end if;
      v_motivo := nullif(btrim(coalesce(v_x ->> 'motivo', '')), '');
      if v_motivo is null then
        raise exception 'Cuenta qué pasó con las prendas con falla de %', retail.fn_produccion_variante_texto(v_variante) using hint = 'falla_sin_motivo';
      end if;
      if length(v_motivo) > 200 then
        raise exception 'Lo que cuentas de la falla es muy largo: hasta 200 letras' using hint = 'falla_motivo_largo';
      end if;
      v_fallas := v_fallas || jsonb_build_object('variante_id', v_variante, 'cantidad', v_n::integer, 'destino', v_destino, 'motivo', v_motivo);
      v_id := v_variante::text;
      v_pide := jsonb_set(v_pide, array[v_id], to_jsonb(coalesce((v_pide ->> v_id)::integer, 0) + v_n::integer));
    end loop;
  end if;

  -- Las buenas: las mismas reglas de siempre (`fn_produccion_lineas_cantidad`). Sin buenas ni fallas, el mismo rechazo de siempre.
  if jsonb_array_length(v_fallas) = 0 or (p_lineas is not null and jsonb_typeof(p_lineas) = 'array' and jsonb_array_length(p_lineas) > 0) then
    for v_l in select * from retail.fn_produccion_lineas_cantidad(p_lineas, 'avance') loop
      v_id := v_l.variante_id::text;
      v_buenas := jsonb_set(v_buenas, array[v_id], to_jsonb(v_l.cantidad));
      v_pide := jsonb_set(v_pide, array[v_id], to_jsonb(coalesce((v_pide ->> v_id)::integer, 0) + v_l.cantidad));
    end loop;
  end if;

  -- Por talla y color: lo ya anotado (buenas, segundas y perdidas) más lo que se anota ahora no pasa de lo que entró.
  for v_id in select jsonb_object_keys(v_pide) loop
    v_variante := v_id::uuid;
    v_plan := (select l.cantidad_plan from retail.produccion_lineas l where l.produccion_id = v_f.produccion_id and l.variante_id = v_variante);
    if v_plan is null then
      raise exception 'La talla y color % no es de esta orden', retail.fn_produccion_variante_texto(v_variante) using hint = 'avance_variante_ajena';
    end if;
    v_entrada := retail.fn_produccion_entrada_variante(p_fase_id, v_variante);
    v_hechas := coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id and a.variante_id = v_variante), 0)
              + coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = p_fase_id and fa.variante_id = v_variante and fa.destino <> 'arreglo'), 0);
    if v_hechas + (v_pide ->> v_id)::integer > v_entrada then
      if v_primera then
        raise exception 'En % el plan de % es % (hasta % cortando de más) y ya terminaste %: no puedes terminar % más',
          retail.fn_fase_nombre(v_f.clave), retail.fn_produccion_variante_texto(v_variante), v_plan, v_entrada, v_hechas, (v_pide ->> v_id)::integer
          using hint = 'avance_excede';
      end if;
      raise exception 'En % solo entraron % de % y ya terminaste %: no puedes terminar % más',
        retail.fn_fase_nombre(v_f.clave), v_entrada, retail.fn_produccion_variante_texto(v_variante), v_hechas, (v_pide ->> v_id)::integer
        using hint = 'avance_excede';
    end if;
  end loop;

  for v_id in select jsonb_object_keys(v_buenas) loop
    insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, nota, hecho_por, hecho_en, created_at)
      values (p_fase_id, v_id::uuid, (v_buenas ->> v_id)::integer, 'taller', nullif(btrim(coalesce(p_nota, '')), ''), p_actor, p_hecho, clock_timestamp())
      returning id into v_nuevo;
    v_avance_ids := v_avance_ids || v_nuevo;
    v_total := v_total + (v_buenas ->> v_id)::integer;
  end loop;
  for v_x in select * from jsonb_array_elements(v_fallas) loop
    insert into retail.produccion_fallas (fase_id, variante_id, destino, cantidad, motivo, hecho_por, hecho_en, created_at)
      values (p_fase_id, (v_x ->> 'variante_id')::uuid, v_x ->> 'destino', (v_x ->> 'cantidad')::integer, v_x ->> 'motivo', p_actor, p_hecho, clock_timestamp())
      returning id into v_nuevo;
    v_falla_ids := v_falla_ids || v_nuevo;
    v_con_falla := v_con_falla + (v_x ->> 'cantidad')::integer;
  end loop;
  return jsonb_build_object('avance_ids', to_jsonb(v_avance_ids), 'falla_ids', to_jsonb(v_falla_ids), 'buenas', v_total, 'con_falla', v_con_falla);
end;
$$;
comment on function retail.fn_produccion_escribir_termine(uuid, jsonb, jsonb, text, timestamptz, uuid) is
  'ADR-0570: la regla de «Terminé» (buenas y fallas, por talla y color, sin pasar de lo que entró). La usan anotar_termine, corregir_anotacion_orden y restaurar_anotacion_orden.';
revoke all on function retail.fn_produccion_escribir_termine(uuid, jsonb, jsonb, text, timestamptz, uuid) from public, anon, authenticated;

-- 4. «Terminé», el mismo de la actividad 2, ahora con la regla compartida.
create or replace function retail.anotar_termine(p_fase_id uuid, p_lineas jsonb, p_nota text default null, p_hecho_en date default null, p_fallas jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_op record; v_hecho timestamptz; v_r jsonb; v_total integer; v_con_falla integer;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no cuenta prendas: se marca como hecha, no se anota «Terminé»', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_es_hito';
  end if;
  if v_op.quien <> 'taller' then
    raise exception 'La fase «%» la hace %: lo que vuelve se anota en la Vuelta, no como avance', retail.fn_fase_nombre(v_op.clave), coalesce(v_op.proveedor_nombre, 'un servicio')
      using hint = 'fase_de_servicio';
  end if;
  -- Un candado por orden (ADR-0190): dos «Terminé» a la vez se forman en fila y el segundo ve el saldo real.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_hecho := retail.fn_produccion_fecha_real(v_op.produccion_id, p_hecho_en);
  v_r := retail.fn_produccion_escribir_termine(p_fase_id, p_lineas, p_fallas, p_nota, v_hecho, v_op.actor);
  v_total := (v_r ->> 'buenas')::integer;
  v_con_falla := (v_r ->> 'con_falla')::integer;

  -- Actividad (ADR-0207): sin montos. Si falla, lo anotado igual queda.
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_avance',
      'terminó ' || retail.fn_actividad_cuantas(v_total, 'prenda', 'prendas') || ' de ' || retail.fn_fase_nombre(v_op.clave)
        || case when v_con_falla > 0 then ' (' || retail.fn_actividad_cuantas(v_con_falla, 'con falla', 'con falla') || ')' else '' end
        || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave, 'cantidad', v_total,
                         'con_falla', v_con_falla, 'hecho_en', v_hecho),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el avance de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;
comment on function retail.anotar_termine(uuid, jsonb, text, date, jsonb) is
  'ADR-0570: «Terminé» en una fase del Taller: las buenas (pasan a la fase siguiente), las fallas (segunda y perdida cierran la fase; arreglo solo se cuenta en la historia) y el día real. Todo o nada, bajo el candado de la orden.';
revoke all on function retail.anotar_termine(uuid, jsonb, text, date, jsonb) from public, anon;
grant execute on function retail.anotar_termine(uuid, jsonb, text, date, jsonb) to authenticated;

-- 5. Después de un cambio en una fase: la fase siguiente no puede haber usado más prendas de las que quedan aquí, por talla y color. Usó lo que terminó (buenas, segundas y perdidas) o
--    lo que mandó afuera, lo que más sea (la misma regla de `deshacer_avance`).
create or replace function retail.fn_produccion_exigir_cadena(p_fase_id uuid)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_siguiente uuid; v_r record;
begin
  v_siguiente := retail.fn_produccion_fase_siguiente(p_fase_id);
  if v_siguiente is null then
    return;
  end if;
  for v_r in
    select l.variante_id,
           coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id and a.variante_id = l.variante_id), 0) as quedan,
           greatest(
             coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_siguiente and a.variante_id = l.variante_id), 0)
               + coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_siguiente and fa.variante_id = l.variante_id and fa.destino <> 'arreglo'), 0),
             coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                        where s.fase_id = v_siguiente and sl.variante_id = l.variante_id), 0)) as usadas
      from retail.produccion_fases f
      join retail.produccion_lineas l on l.produccion_id = f.produccion_id
     where f.id = p_fase_id
  loop
    if v_r.usadas > v_r.quedan then
      raise exception 'En % ya se anotaron % de % y aquí quedarían %: corrige primero lo anotado en %',
        (select retail.fn_fase_nombre(f.clave) from retail.produccion_fases f where f.id = v_siguiente), v_r.usadas,
        retail.fn_produccion_variante_texto(v_r.variante_id), v_r.quedan,
        (select retail.fn_fase_nombre(f.clave) from retail.produccion_fases f where f.id = v_siguiente)
        using hint = 'cambio_ya_avanzo';
    end if;
  end loop;
end;
$$;
revoke all on function retail.fn_produccion_exigir_cadena(uuid) from public, anon, authenticated;

-- 6. Lo anotado con «Terminé» que se va a corregir o eliminar: sus filas, que tienen que ser de UNA fase, anotadas en el Taller y vivas (sin Deshacer). Devuelve cómo eran.
create or replace function retail.fn_produccion_termine_vivo(p_ids uuid[])
returns jsonb
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare v_fases uuid[]; v_n integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Elige qué anotación quieres cambiar' using hint = 'cambio_sin_anotacion';
  end if;
  v_n := (select count(*) from retail.produccion_avances a where a.id = any (p_ids)) + (select count(*) from retail.produccion_fallas fa where fa.id = any (p_ids));
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Esa anotación no existe' using hint = 'cambio_inexistente';
  end if;
  v_fases := array(select distinct a.fase_id from retail.produccion_avances a where a.id = any (p_ids)
                   union select distinct fa.fase_id from retail.produccion_fallas fa where fa.id = any (p_ids));
  if cardinality(v_fases) <> 1 then
    raise exception 'Una corrección es de una sola fase' using hint = 'cambio_varias_fases';
  end if;
  if exists (select 1 from retail.produccion_avances a where a.id = any (p_ids) and a.origen <> 'taller')
     or exists (select 1 from retail.produccion_fallas fa where fa.id = any (p_ids) and fa.deshace_id is not null) then
    raise exception 'Lo que volvió de un servicio o un Deshacer no se corrige desde aquí' using hint = 'cambio_origen';
  end if;
  if exists (select 1 from retail.produccion_avances d where d.deshace_id = any (p_ids))
     or exists (select 1 from retail.produccion_fallas d where d.deshace_id = any (p_ids)) then
    raise exception 'Esa anotación ya se deshizo o se cambió: mira la historia' using hint = 'cambio_ya_deshecho';
  end if;
  return jsonb_build_object(
    'fase_id', v_fases[1],
    'buenas', coalesce((select jsonb_agg(jsonb_build_object('variante_id', t.variante_id, 'cantidad', t.cantidad) order by t.variante_id)
                          from (select a.variante_id, sum(a.cantidad)::integer as cantidad from retail.produccion_avances a where a.id = any (p_ids) group by a.variante_id) t), '[]'::jsonb),
    'fallas', coalesce((select jsonb_agg(jsonb_build_object('variante_id', t.variante_id, 'destino', t.destino, 'cantidad', t.cantidad, 'motivo', t.motivo) order by t.variante_id, t.destino)
                          from (select fa.variante_id, fa.destino, sum(fa.cantidad)::integer as cantidad, min(fa.motivo) as motivo
                                  from retail.produccion_fallas fa where fa.id = any (p_ids) group by fa.variante_id, fa.destino) t), '[]'::jsonb),
    'hecho', least((select min(coalesce(a.hecho_en, a.created_at)) from retail.produccion_avances a where a.id = any (p_ids)),
                   (select min(coalesce(fa.hecho_en, fa.created_at)) from retail.produccion_fallas fa where fa.id = any (p_ids))),
    'nota', (select a.nota from retail.produccion_avances a where a.id = any (p_ids) and a.nota is not null order by a.created_at limit 1));
end;
$$;
revoke all on function retail.fn_produccion_termine_vivo(uuid[]) from public, anon, authenticated;

-- Deshace las filas de un «Terminé» (todas vivas, ya revisadas): cada una con su fila contraria.
create or replace function retail.fn_produccion_deshacer_termine(p_ids uuid[], p_actor uuid)
returns void
language sql
set search_path = retail, public, extensions
as $$
  insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, deshace_id, hecho_por, created_at)
    select a.fase_id, a.variante_id, -a.cantidad, 'deshacer', a.id, p_actor, clock_timestamp() from retail.produccion_avances a where a.id = any (p_ids);
  insert into retail.produccion_fallas (fase_id, variante_id, destino, cantidad, deshace_id, motivo, hecho_por, created_at)
    select fa.fase_id, fa.variante_id, fa.destino, -fa.cantidad, fa.id, fa.motivo, p_actor, clock_timestamp() from retail.produccion_fallas fa where fa.id = any (p_ids);
$$;
revoke all on function retail.fn_produccion_deshacer_termine(uuid[], uuid) from public, anon, authenticated;

-- La Actividad de un cambio (ADR-0207): si falla, el cambio igual queda (y su historia está en `produccion_cambios`).
create or replace function retail.fn_produccion_actividad_cambio(p_fase_id uuid, p_actor uuid, p_tipo text, p_texto text, p_cambio_id uuid)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_f record;
begin
  select f.produccion_id, f.clave, p.numero, p.ubicacion_id into v_f
    from retail.produccion_fases f join retail.producciones p on p.id = f.produccion_id where f.id = p_fase_id;
  perform retail.fn_actividad_anotar(
    'produccion', p_tipo, p_texto || ' de la ' || retail.fn_produccion_numero_texto(v_f.numero),
    p_actor, retail.fn_actividad_terminal_ahora(), v_f.ubicacion_id, v_f.ubicacion_id,
    'produccion', v_f.produccion_id::text, now(),
    jsonb_build_object('produccion_id', v_f.produccion_id, 'numero', v_f.numero, 'fase_id', p_fase_id, 'fase', v_f.clave, 'cambio_id', p_cambio_id),
    'vivo');
exception when others then
  raise warning 'actividad: no se anotó el cambio de la orden % (%)', v_f.numero, sqlerrm;
end;
$$;
revoke all on function retail.fn_produccion_actividad_cambio(uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- 7. Corregir un «Terminé» de cualquier día: sus buenas, sus fallas y su día. Deshace lo viejo y anota lo nuevo con la regla de «Terminé», en un solo paso.
create or replace function retail.corregir_anotacion_orden(p_ids uuid[], p_lineas jsonb, p_fallas jsonb, p_hecho_en date, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_fase uuid; v_op record; v_motivo text; v_antes jsonb; v_hecho timestamptz; v_dia_antes date; v_r jsonb; v_despues jsonb; v_pone uuid[]; v_id uuid;
  v_total_antes integer; v_total_despues integer;
begin
  v_fase := coalesce((select a.fase_id from retail.produccion_avances a where a.id = any (p_ids) limit 1),
                     (select fa.fase_id from retail.produccion_fallas fa where fa.id = any (p_ids) limit 1));
  if v_fase is null then
    raise exception 'Esa anotación no existe' using hint = 'cambio_inexistente';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_fase);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := retail.fn_produccion_motivo_cambio(p_motivo);
  v_antes := retail.fn_produccion_termine_vivo(p_ids);
  if (p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0)
     and (p_fallas is null or jsonb_typeof(p_fallas) <> 'array' or jsonb_array_length(p_fallas) = 0) then
    raise exception 'Si no quedó nada de esa anotación, usa «Eliminar»' using hint = 'corregir_vacio';
  end if;

  -- El día: si no cambió, se queda el momento de antes (no el de hoy); si cambió, el día nuevo con las mismas reglas que «¿Cuándo lo terminaste?».
  v_dia_antes := ((v_antes ->> 'hecho')::timestamptz at time zone 'America/Lima')::date;
  if p_hecho_en is null or p_hecho_en = v_dia_antes then
    v_hecho := (v_antes ->> 'hecho')::timestamptz;
  else
    v_hecho := retail.fn_produccion_fecha_real(v_op.produccion_id, p_hecho_en);
  end if;

  perform retail.fn_produccion_deshacer_termine(p_ids, v_op.actor);
  v_r := retail.fn_produccion_escribir_termine(v_fase, p_lineas, p_fallas, v_antes ->> 'nota', v_hecho, v_op.actor);
  perform retail.fn_produccion_exigir_cadena(v_fase);

  v_pone := array(select jsonb_array_elements_text(v_r -> 'avance_ids')::uuid union all select jsonb_array_elements_text(v_r -> 'falla_ids')::uuid);
  v_despues := retail.fn_produccion_termine_vivo(v_pone);
  if v_despues -> 'buenas' = v_antes -> 'buenas' and v_despues -> 'fallas' = v_antes -> 'fallas'
     and ((v_despues ->> 'hecho')::timestamptz at time zone 'America/Lima')::date = v_dia_antes then
    raise exception 'No cambiaste nada: si estaba bien, cierra sin guardar' using hint = 'corregir_sin_cambios';
  end if;

  insert into retail.produccion_cambios (produccion_id, fase_id, accion, objeto, quita_ids, pone_ids, antes, despues, texto, hecho_por, created_at)
    values (v_op.produccion_id, v_fase, 'corregir', 'termine', p_ids, v_pone, v_antes, v_despues, v_motivo, v_op.actor, clock_timestamp())
    returning id into v_id;
  v_total_antes := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_antes -> 'buenas') x), 0);
  v_total_despues := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_despues -> 'buenas') x), 0);
  perform retail.fn_produccion_actividad_cambio(v_op.fase_id, v_op.actor, 'produccion_anotacion_corregida',
    'corrigió lo terminado en ' || retail.fn_fase_nombre(v_op.clave) || ' (' || v_total_antes || ' → ' || v_total_despues || '): ' || v_motivo, v_id);
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;
comment on function retail.corregir_anotacion_orden(uuid[], jsonb, jsonb, date, text) is
  'ADR-0570: corrige un «Terminé» de cualquier día (buenas, fallas y día) con motivo. Deshace las filas viejas y anota las nuevas con la regla de «Terminé»; queda en produccion_cambios.';
revoke all on function retail.corregir_anotacion_orden(uuid[], jsonb, jsonb, date, text) from public, anon;
grant execute on function retail.corregir_anotacion_orden(uuid[], jsonb, jsonb, date, text) to authenticated;

-- 8. Eliminar un «Terminé» (sus buenas o sus fallas) o la marca de una fase que no cuenta prendas. Sale de la vista; su rastro y su «Restaurar» quedan en la historia.
create or replace function retail.eliminar_anotacion_orden(p_ids uuid[], p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_marca record; v_fase uuid; v_op record; v_motivo text; v_antes jsonb; v_id uuid; v_total integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Elige qué anotación quieres eliminar' using hint = 'cambio_sin_anotacion';
  end if;
  select m.id, m.fase_id, m.deshace_id, m.nota, m.created_at into v_marca from retail.produccion_fase_marcas m where m.id = p_ids[1];
  v_fase := coalesce(v_marca.fase_id,
                     (select a.fase_id from retail.produccion_avances a where a.id = any (p_ids) limit 1),
                     (select fa.fase_id from retail.produccion_fallas fa where fa.id = any (p_ids) limit 1));
  if v_fase is null then
    raise exception 'Esa anotación no existe' using hint = 'cambio_inexistente';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_fase);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := retail.fn_produccion_motivo_cambio(p_motivo);

  if v_marca.id is not null then
    -- La marca de Ploteo: la viva, una sola.
    if cardinality(p_ids) <> 1 or v_marca.deshace_id is not null then
      raise exception 'Un Deshacer no se elimina: se corrige con otra anotación' using hint = 'cambio_origen';
    end if;
    if retail.fn_produccion_marca_viva(v_fase) is distinct from v_marca.id then
      raise exception 'Esa marca ya se deshizo o se cambió: mira la historia' using hint = 'cambio_ya_deshecho';
    end if;
    insert into retail.produccion_fase_marcas (fase_id, deshace_id, hecho_por, created_at) values (v_fase, v_marca.id, v_op.actor, clock_timestamp());
    insert into retail.produccion_cambios (produccion_id, fase_id, accion, objeto, quita_ids, antes, texto, hecho_por, created_at)
      values (v_op.produccion_id, v_fase, 'eliminar', 'marca', p_ids, jsonb_build_object('fase_id', v_fase, 'hecho', v_marca.created_at, 'nota', v_marca.nota),
              v_motivo, v_op.actor, clock_timestamp())
      returning id into v_id;
    perform retail.fn_produccion_actividad_cambio(v_op.fase_id, v_op.actor, 'produccion_anotacion_eliminada', 'quitó la marca de ' || retail.fn_fase_nombre(v_op.clave) || ': ' || v_motivo, v_id);
    return retail.fn_fases_de_orden(v_op.produccion_id);
  end if;

  v_antes := retail.fn_produccion_termine_vivo(p_ids);
  perform retail.fn_produccion_deshacer_termine(p_ids, v_op.actor);
  perform retail.fn_produccion_exigir_cadena(v_fase);
  insert into retail.produccion_cambios (produccion_id, fase_id, accion, objeto, quita_ids, antes, texto, hecho_por, created_at)
    values (v_op.produccion_id, v_fase, 'eliminar', 'termine', p_ids, v_antes, v_motivo, v_op.actor, clock_timestamp())
    returning id into v_id;
  v_total := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_antes -> 'buenas') x), 0)
           + coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_antes -> 'fallas') x), 0);
  perform retail.fn_produccion_actividad_cambio(v_op.fase_id, v_op.actor, 'produccion_anotacion_eliminada',
    'eliminó ' || retail.fn_actividad_cuantas(v_total, 'prenda anotada', 'prendas anotadas') || ' de ' || retail.fn_fase_nombre(v_op.clave) || ': ' || v_motivo, v_id);
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;
comment on function retail.eliminar_anotacion_orden(uuid[], text) is
  'ADR-0570: elimina un «Terminé» (buenas o fallas, de cualquier día) o la marca de Ploteo, con motivo. Nada se borra: van sus filas contrarias y queda en produccion_cambios.';
revoke all on function retail.eliminar_anotacion_orden(uuid[], text) from public, anon;
grant execute on function retail.eliminar_anotacion_orden(uuid[], text) to authenticated;

-- 9. Restaurar lo eliminado: se anota otra vez, tal como era y con su día, con la regla de siempre (si la fase ya se llenó, la base lo dice).
create or replace function retail.restaurar_anotacion_orden(p_cambio_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_c record; v_op record; v_motivo text; v_r jsonb; v_pone uuid[]; v_id uuid; v_marca uuid;
begin
  select c.id, c.fase_id, c.accion, c.objeto, c.antes into v_c from retail.produccion_cambios c where c.id = p_cambio_id;
  if v_c.id is null then
    raise exception 'Ese cambio no existe' using hint = 'cambio_inexistente';
  end if;
  if v_c.accion <> 'eliminar' then
    raise exception 'Solo se restaura lo eliminado' using hint = 'restaurar_no_es_eliminar';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_c.fase_id);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := retail.fn_produccion_motivo_cambio(p_motivo);
  if exists (select 1 from retail.produccion_cambios r where r.restaura_id = p_cambio_id) then
    raise exception 'Eso ya se restauró' using hint = 'restaurar_ya_hecho';
  end if;

  if v_c.objeto = 'marca' then
    if retail.fn_produccion_marca_viva(v_c.fase_id) is not null then
      raise exception '«%» ya está marcada como hecha', retail.fn_fase_nombre(v_op.clave) using hint = 'marca_ya_hecha';
    end if;
    insert into retail.produccion_fase_marcas (fase_id, nota, hecho_por, created_at)
      values (v_c.fase_id, v_c.antes ->> 'nota', v_op.actor, clock_timestamp()) returning id into v_marca;
    v_pone := array[v_marca];
  else
    v_r := retail.fn_produccion_escribir_termine(v_c.fase_id, v_c.antes -> 'buenas',
             case when jsonb_array_length(v_c.antes -> 'fallas') > 0 then v_c.antes -> 'fallas' end,
             v_c.antes ->> 'nota', (v_c.antes ->> 'hecho')::timestamptz, v_op.actor);
    v_pone := array(select jsonb_array_elements_text(v_r -> 'avance_ids')::uuid union all select jsonb_array_elements_text(v_r -> 'falla_ids')::uuid);
  end if;

  insert into retail.produccion_cambios (produccion_id, fase_id, accion, objeto, pone_ids, despues, texto, restaura_id, hecho_por, created_at)
    values (v_op.produccion_id, v_c.fase_id, 'restaurar', v_c.objeto, v_pone, v_c.antes, v_motivo, p_cambio_id, v_op.actor, clock_timestamp())
    returning id into v_id;
  perform retail.fn_produccion_actividad_cambio(v_op.fase_id, v_op.actor, 'produccion_anotacion_restaurada',
    'restauró lo eliminado de ' || retail.fn_fase_nombre(v_op.clave) || ': ' || v_motivo, v_id);
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;
comment on function retail.restaurar_anotacion_orden(uuid, text) is
  'ADR-0570: vuelve a anotar lo que una eliminación quitó, tal como era y con su día, con la regla de «Terminé». Una sola vez por eliminación.';
revoke all on function retail.restaurar_anotacion_orden(uuid, text) from public, anon;
grant execute on function retail.restaurar_anotacion_orden(uuid, text) to authenticated;

-- 10. Una nota del equipo en la historia de la orden. Vale en cualquier estado (también en una orden que ya pasó al stock).
create or replace function retail.comentar_orden(p_produccion_id uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_o record; v_actor uuid; v_texto text; v_id uuid;
begin
  select p.id, p.ubicacion_id, p.numero into v_o from retail.producciones p where p.id = p_produccion_id;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién escribe la nota' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_texto := nullif(btrim(coalesce(p_texto, '')), '');
  if v_texto is null then
    raise exception 'Escribe la nota' using hint = 'nota_vacia';
  end if;
  if length(v_texto) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'nota_larga';
  end if;
  insert into retail.produccion_cambios (produccion_id, accion, texto, hecho_por, created_at)
    values (p_produccion_id, 'nota', v_texto, v_actor, clock_timestamp()) returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;
comment on function retail.comentar_orden(uuid, text) is 'ADR-0570: una nota del equipo en la historia de una orden de producción (queda en produccion_cambios; no se borra).';
revoke all on function retail.comentar_orden(uuid, text) from public, anon;
grant execute on function retail.comentar_orden(uuid, text) to authenticated;

-- 11. Los cambios de una orden, para su página (la lee `fn_orden_produccion`, que ya revisó el permiso).
create or replace function retail.fn_produccion_cambios_de_orden(p_produccion_id uuid)
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'accion', c.accion, 'objeto', c.objeto, 'fase_id', c.fase_id,
      'fase_clave', f.clave, 'fase_nombre', case when f.clave is not null then retail.fn_fase_nombre(f.clave) end,
      'quita_ids', to_jsonb(c.quita_ids), 'pone_ids', to_jsonb(c.pone_ids),
      -- Los Deshacer que escribió el cambio (una fila deshecha no se deshace dos veces): la página los oculta junto con lo que quitó, y en su lugar cuenta el cambio.
      'deshace_ids', to_jsonb(array(select a.id from retail.produccion_avances a where a.deshace_id = any (c.quita_ids)
                                    union all select fa.id from retail.produccion_fallas fa where fa.deshace_id = any (c.quita_ids)
                                    union all select m.id from retail.produccion_fase_marcas m where m.deshace_id = any (c.quita_ids))),
      'antes', c.antes, 'despues', c.despues, 'texto', c.texto,
      'restaura_id', c.restaura_id, 'restaurado', exists (select 1 from retail.produccion_cambios r where r.restaura_id = c.id),
      'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'cuando', c.created_at) order by c.created_at desc), '[]'::jsonb)
    from retail.produccion_cambios c
    left join retail.produccion_fases f on f.id = c.fase_id
    left join public.personas pe on pe.id = c.hecho_por
   where c.produccion_id = p_produccion_id
$$;
revoke all on function retail.fn_produccion_cambios_de_orden(uuid) from public, anon, authenticated;

-- Lo anotado de una orden que ya tiene su Deshacer (por un cambio o por «Deshacer»): la página no ofrece corregir lo que ya no está vivo.
create or replace function retail.fn_produccion_deshechos_de_orden(p_produccion_id uuid)
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(x.id), '[]'::jsonb)
    from (select a.deshace_id as id from retail.produccion_avances a join retail.produccion_fases f on f.id = a.fase_id
           where f.produccion_id = p_produccion_id and a.deshace_id is not null
          union all
          select fa.deshace_id from retail.produccion_fallas fa join retail.produccion_fases f on f.id = fa.fase_id
           where f.produccion_id = p_produccion_id and fa.deshace_id is not null
          union all
          select m.deshace_id from retail.produccion_fase_marcas m join retail.produccion_fases f on f.id = m.fase_id
           where f.produccion_id = p_produccion_id and m.deshace_id is not null) x
$$;
revoke all on function retail.fn_produccion_deshechos_de_orden(uuid) from public, anon, authenticated;

-- 12. La orden en una lectura: sus cambios y lo ya deshecho. Solo se agregan dos claves al final: las filas de la línea de tiempo no se tocan (otras migraciones las reemplazan por su texto, y
--     cambiarlas aquí haría que volver a pegar una de esas las duplique).
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$'linea_de_tiempo', v_tiempo,$v$,
  $v$'linea_de_tiempo', v_tiempo,
    'cambios', retail.fn_produccion_cambios_de_orden(p_produccion_id),
    'deshechos', retail.fn_produccion_deshechos_de_orden(p_produccion_id),$v$
);

reset lock_timeout;
