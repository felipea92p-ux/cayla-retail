-- ============================================================================
-- 20261029164000_produccion_termine_con_falla_y_fecha.sql — CAYLA V2 (ADR-0570, actividad 2 · 2026-10-29)
--
-- EL PROBLEMA PRIMERO.
--   (1) Una sola prenda dañada en un paso del Taller deja la orden trabada. Una fase está hecha cuando «hechas + segundas + faltantes» alcanzan lo que entró (`fn_fases_de_orden`), pero en el
--       Taller las segundas y los faltantes solo existen en la Vuelta de un servicio: «Terminé» anota solo prendas buenas. Con 55 buenas y 2 manchadas de 57, Planchado nunca queda hecho,
--       «Pasar al stock» nunca aparece y la única salida es anotar 57 (mentir).
--   (2) Lo anotado lleva la hora en que se aprieta el botón: OP-1 dice que Corte, Habilitado y Costura pasaron todos a las 20:29 del mismo día.
--
-- QUÉ HACE (Felipe, 2026-10-29, ronda 6: «Elegir en Terminé» y «¿Cuándo lo terminaste?»)
--   · `produccion_fallas` (nueva, de solo agregar, como `produccion_avances`): las prendas de una fase del Taller que no salieron bien, con su destino y su motivo:
--       «segunda» (no entra al stock, ADR-0400) y «perdida» CUENTAN para cerrar la fase y NO pasan a la siguiente;
--       «arreglo» es informativa: la prenda vuelve a quien la arregla y queda pendiente en ESTA fase hasta que se anote buena (no cuenta para nada; dice qué pasó).
--     Un Deshacer es otra fila negativa con `deshace_id` (una sola vez: `unique`).
--   · `produccion_avances.hecho_en`: cuándo pasó de verdad (como `produccion_fase_marcas.hecho_en`); `created_at` sigue siendo cuándo se anotó. Nulo = se anotó el mismo día.
--   · `anotar_termine(fase, líneas, nota, día, fallas)`: «Terminé» con buenas, fallas y su día. Valida lo mismo que `registrar_avance` y además el día (desde la apertura, nunca futuro)
--     y que buenas + fallas + lo ya anotado no pasen de lo que entró, por talla y color.
--   · `registrar_avance` queda con su MISMA firma y ahora llama a `anotar_termine` (una sola regla; la web publicada antes que esta migración sigue funcionando).
--   · `deshacer_falla(falla)`: deshace una falla con una fila contraria.
--   · `fn_fases_de_orden`: las segundas y las perdidas del Taller cuentan para cerrar la fase; las fechas de una fase salen de `hecho_en`.
--   · `fn_orden_produccion`: devuelve las fallas por talla y color y en la línea de tiempo, y la fecha real de cada avance (`cuando` y `registrado_en`, como la marca de Ploteo).
--
-- CONTRATO (Liskov)
--   PROMETE: sin fallas ni día, «Terminé» hace EXACTAMENTE lo de siempre (mismos rechazos y mismos hints). Nunca hay más buenas + segundas + perdidas que lo que entró a la fase, por talla y
--            color. Lo que pasa a la fase siguiente son solo las buenas. Nada se edita ni se borra: un Deshacer es otra fila. Todo o nada: si una línea falla, no se anota ninguna.
--   ASUME:   las funciones vivas con el texto de hoy (anclas verificadas con las migraciones de esta rama hasta 20261029051000). Si una cambió, el reemplazo se detiene sin tocar nada.
--   NO HACE: no toca servicios (su Vuelta ya tiene segundas y faltantes), stock, dinero ni el costo (las segundas no entran al stock y su costo lo cargan las buenas, ADR-0400). No
--            reabre la fase anterior por un arreglo (ver DESCARTÉ). No corrige anotaciones viejas: eso es la actividad 3.
--
-- DECIDÍ: una tabla aparte para las fallas, no un `origen` nuevo en `produccion_avances`: lo que suma `produccion_avances` es lo que pasa a la fase siguiente (la entrada de cada fase y el
--   «Deshacer» la leen así en 9 lugares); mezclar ahí prendas que NO pasan obligaba a filtrar cada lectura. Y una función nueva, no más argumentos en `registrar_avance`: 9 suites recargan
--   las migraciones que la definen con 3 argumentos, y dos versiones con distinto número de argumentos vuelven ambiguas todas las llamadas.
-- DESCARTÉ: que «se arregla» reste de la fase anterior (reabrirla): si la anterior es un servicio, la prenda tendría que volver a salir y se le pagaría otra vez, y una fase ya hecha
--   cambiaría sin que nadie la toque. La prenda queda pendiente en esta fase y la historia dice adónde fue.
-- SE ROMPE SI: un arreglo se paga aparte por prenda (hoy no se anota quién arregla: Felipe dijo que no importa quién hizo cada paso). O si alguien anota un día anterior al de la fase de
--   antes: se acepta (solo se exige desde la apertura y nunca futuro); el orden de la historia lo muestra tal cual.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una columna con nulo (sin reescribir filas), una tabla nueva con RLS encendido y SIN políticas (solo la
-- leen funciones security definer, ADR-0195), funciones nuevas y reemplazos ANCLADOS (ADR-0288). Dentro de los textos de reemplazo no hay ningún `select … into`.
-- Va DESPUÉS de 20261029051000 (ADR-0566). Prueba: `pnpm pruebas:produccion-termine-con-falla`.
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

-- 1. Cuándo pasó un avance (no cuándo se anotó).
alter table retail.produccion_avances add column if not exists hecho_en timestamptz;
comment on column retail.produccion_avances.hecho_en is
  'ADR-0570: cuándo se terminó de verdad (la persona lo eligió al anotar). Nulo = el mismo día en que se anotó: vale created_at.';

-- 2. Las prendas de una fase del Taller que no salieron bien.
create table if not exists retail.produccion_fallas (
  id uuid primary key default gen_random_uuid(),
  fase_id uuid not null references retail.produccion_fases (id),
  variante_id uuid not null references retail.variantes (id),
  -- segunda: no entra al stock · perdida: no se vende · arreglo: vuelve a quien la arregla y sigue pendiente en esta fase.
  destino text not null check (destino in ('segunda', 'perdida', 'arreglo')),
  -- Positiva = anotada; negativa = un Deshacer (fila nueva, nunca se borra la anterior).
  cantidad integer not null check (cantidad <> 0),
  deshace_id uuid references retail.produccion_fallas (id),
  motivo text not null check (btrim(motivo) <> '' and length(motivo) <= 200),
  hecho_en timestamptz,
  hecho_por uuid not null references public.personas (id),
  created_at timestamptz not null default now(),
  constraint produccion_fallas_signo check ((deshace_id is null) = (cantidad > 0)),
  -- Una falla se deshace una sola vez.
  constraint produccion_fallas_un_deshacer unique (deshace_id)
);
create index if not exists produccion_fallas_por_fase on retail.produccion_fallas (fase_id, variante_id);
alter table retail.produccion_fallas enable row level security;
revoke all on table retail.produccion_fallas from anon, authenticated;
create or replace trigger produccion_fallas_inmutable before delete or update on retail.produccion_fallas
  for each row execute function retail.fn_produccion_anotado_inmutable();
comment on table retail.produccion_fallas is
  'ADR-0570: prendas de una fase del Taller que no salieron bien. segunda y perdida cuentan para cerrar la fase y no pasan a la siguiente; arreglo solo dice qué pasó (la prenda sigue pendiente). De solo agregar: un Deshacer es una fila negativa con deshace_id.';

-- 3. El día real de una anotación: nulo si es hoy (vale la hora de anotar); si no, ese día a mediodía de Lima. Nunca futuro ni antes de abrir la orden.
create or replace function retail.fn_produccion_fecha_real(p_produccion_id uuid, p_dia date)
returns timestamptz
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare v_apertura date;
begin
  if p_dia is null or p_dia = retail.fn_hoy_lima() then
    return null;
  end if;
  if p_dia > retail.fn_hoy_lima() then
    raise exception 'El día que elegiste (%) todavía no llega: elige hoy o un día anterior', to_char(p_dia, 'DD/MM') using hint = 'avance_fecha_futura';
  end if;
  v_apertura := (select (p.created_at at time zone 'America/Lima')::date from retail.producciones p where p.id = p_produccion_id);
  if p_dia < v_apertura then
    raise exception 'La orden se abrió el %: no se puede anotar algo del %', to_char(v_apertura, 'DD/MM'), to_char(p_dia, 'DD/MM') using hint = 'avance_fecha_antes_de_abrir';
  end if;
  return (p_dia::timestamp + interval '12 hours') at time zone 'America/Lima';
end;
$$;
revoke all on function retail.fn_produccion_fecha_real(uuid, date) from public, anon, authenticated;

-- 4. «Terminé»: buenas, fallas y su día, todo o nada.
create or replace function retail.anotar_termine(p_fase_id uuid, p_lineas jsonb, p_nota text default null, p_hecho_en date default null, p_fallas jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_op record; v_l record; v_x jsonb; v_entrada integer; v_hechas integer; v_plan integer; v_nota text; v_primera boolean; v_hecho timestamptz;
  v_variante uuid; v_n numeric; v_destino text; v_motivo text; v_vistas text[] := '{}';
  v_buenas jsonb := '{}'::jsonb; v_fallas jsonb := '[]'::jsonb; v_pide jsonb := '{}'::jsonb;
  v_total integer := 0; v_con_falla integer := 0; v_id text;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no cuenta prendas: se marca como hecha, no se anota «Terminé»', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_es_hito';
  end if;
  if v_op.quien <> 'taller' then
    raise exception 'La fase «%» la hace %: lo que vuelve se anota en la Vuelta, no como avance', retail.fn_fase_nombre(v_op.clave), coalesce(v_op.proveedor_nombre, 'un servicio')
      using hint = 'fase_de_servicio';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  -- Un candado por orden (ADR-0190): dos «Terminé» a la vez se forman en fila y el segundo ve el saldo real.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_hecho := retail.fn_produccion_fecha_real(v_op.produccion_id, p_hecho_en);
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
    v_plan := (select l.cantidad_plan from retail.produccion_lineas l where l.produccion_id = v_op.produccion_id and l.variante_id = v_variante);
    if v_plan is null then
      raise exception 'La talla y color % no es de esta orden', retail.fn_produccion_variante_texto(v_variante) using hint = 'avance_variante_ajena';
    end if;
    v_entrada := retail.fn_produccion_entrada_variante(p_fase_id, v_variante);
    v_hechas := coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id and a.variante_id = v_variante), 0)
              + coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = p_fase_id and fa.variante_id = v_variante and fa.destino <> 'arreglo'), 0);
    if v_hechas + (v_pide ->> v_id)::integer > v_entrada then
      if v_primera then
        raise exception 'En % el plan de % es % (hasta % cortando de más) y ya terminaste %: no puedes terminar % más',
          retail.fn_fase_nombre(v_op.clave), retail.fn_produccion_variante_texto(v_variante), v_plan, v_entrada, v_hechas, (v_pide ->> v_id)::integer
          using hint = 'avance_excede';
      end if;
      raise exception 'En % solo entraron % de % y ya terminaste %: no puedes terminar % más',
        retail.fn_fase_nombre(v_op.clave), v_entrada, retail.fn_produccion_variante_texto(v_variante), v_hechas, (v_pide ->> v_id)::integer
        using hint = 'avance_excede';
    end if;
  end loop;

  for v_id in select jsonb_object_keys(v_buenas) loop
    insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, nota, hecho_por, hecho_en, created_at)
      values (p_fase_id, v_id::uuid, (v_buenas ->> v_id)::integer, 'taller', v_nota, v_op.actor, v_hecho, clock_timestamp());
    v_total := v_total + (v_buenas ->> v_id)::integer;
  end loop;
  for v_x in select * from jsonb_array_elements(v_fallas) loop
    insert into retail.produccion_fallas (fase_id, variante_id, destino, cantidad, motivo, hecho_por, hecho_en, created_at)
      values (p_fase_id, (v_x ->> 'variante_id')::uuid, v_x ->> 'destino', (v_x ->> 'cantidad')::integer, v_x ->> 'motivo', v_op.actor, v_hecho, clock_timestamp());
    v_con_falla := v_con_falla + (v_x ->> 'cantidad')::integer;
  end loop;

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

-- 5. `registrar_avance`, la de siempre (misma firma, mismos rechazos): ahora es «Terminé» sin fallas y con el día de hoy.
create or replace function retail.registrar_avance(p_fase_id uuid, p_lineas jsonb, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- ADR-0570: una sola regla para anotar lo terminado. La web publicada antes que esta migración sigue llamando aquí.
  -- El mismo candado por orden que las demás escrituras (ADR-0190): `anotar_termine` lo vuelve a tomar, y en la misma transacción eso no espera a nadie.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || coalesce((select f.produccion_id from retail.produccion_fases f where f.id = p_fase_id)::text, ''), 0));
  return retail.anotar_termine(p_fase_id, p_lineas, p_nota, null, null);
end;
$$;

-- 6. Deshacer una falla: una fila contraria, una sola vez.
create or replace function retail.deshacer_falla(p_falla_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_fa record; v_op record;
begin
  select fa.id, fa.fase_id, fa.variante_id, fa.destino, fa.cantidad, fa.motivo into v_fa from retail.produccion_fallas fa where fa.id = p_falla_id;
  if v_fa.id is null then
    raise exception 'Esa prenda con falla no existe' using hint = 'falla_inexistente';
  end if;
  if v_fa.cantidad < 0 then
    raise exception 'Un Deshacer no se deshace: se corrige con otra anotación' using hint = 'deshacer_origen';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_fa.fase_id);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  if exists (select 1 from retail.produccion_fallas d where d.deshace_id = p_falla_id) then
    raise exception 'Esa anotación ya se deshizo' using hint = 'deshacer_ya_hecho';
  end if;
  insert into retail.produccion_fallas (fase_id, variante_id, destino, cantidad, deshace_id, motivo, hecho_por, created_at)
    values (v_fa.fase_id, v_fa.variante_id, v_fa.destino, -v_fa.cantidad, p_falla_id, v_fa.motivo, v_op.actor, clock_timestamp());
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_falla_deshecha',
      'deshizo ' || retail.fn_actividad_cuantas(v_fa.cantidad, 'prenda con falla', 'prendas con falla') || ' de '
        || retail.fn_fase_nombre(v_op.clave) || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', v_fa.fase_id, 'fase', v_op.clave,
                         'falla_id', p_falla_id, 'destino', v_fa.destino, 'cantidad', v_fa.cantidad),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el deshacer de la falla de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;
comment on function retail.deshacer_falla(uuid) is
  'ADR-0570: deshace una prenda con falla de «Terminé» con una fila contraria (deshace_id), una sola vez. La prenda vuelve a quedar por terminar en su fase.';
revoke all on function retail.deshacer_falla(uuid) from public, anon;
grant execute on function retail.deshacer_falla(uuid) to authenticated;

-- 7. Las fases: en el Taller, las segundas y las perdidas de «Terminé» cuentan para cerrar la fase (no pasan a la siguiente), y las fechas salen del día real.
select pg_temp.reemplazar_anclado(
  'retail.fn_fases_de_orden(uuid)',
  $v$v_volvieron := v_buenas + v_segundas + v_faltantes;$v$,
  $v$v_volvieron := v_buenas + v_segundas + v_faltantes;
    -- ADR-0570: en el Taller, las prendas con falla de «Terminé» (segunda y perdida) cuentan para cerrar la fase; el arreglo no (la prenda sigue pendiente aquí).
    v_segundas := v_segundas + coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_f.id and fa.destino = 'segunda'), 0);
    v_faltantes := v_faltantes + coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_f.id and fa.destino = 'perdida'), 0);$v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_fases_de_orden(uuid)',
  $v$v_empezada := v_hechas <> 0 or v_salieron <> 0 or v_volvieron <> 0;$v$,
  $v$v_empezada := v_hechas <> 0 or v_salieron <> 0 or v_volvieron <> 0;
    -- ADR-0570: una fase con prendas con falla vivas ya empezó, aunque ninguna haya salido buena.
    v_empezada := v_empezada or coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_f.id), 0) <> 0;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_fases_de_orden(uuid)',
  $v$-- La fase empezó con lo primero que se anotó: un avance o una salida (least ignora los nulos).$v$,
  $v$-- ADR-0570: cuándo empezó y cuándo terminó la fase, por el día real de cada avance (`hecho_en`; nulo = cuando se anotó).
    v_desde_a := (select min(coalesce(a.hecho_en, a.created_at)) from retail.produccion_avances a where a.fase_id = v_f.id);
    v_fin := (select max(coalesce(a.hecho_en, a.created_at)) from retail.produccion_avances a where a.fase_id = v_f.id);
    -- La fase empezó con lo primero que se anotó: un avance o una salida (least ignora los nulos).$v$
);

-- 8. La orden en una lectura: las fallas por talla y color, el día real de cada avance y las fallas en la línea de tiempo.
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$'variante_id', l.variante_id, 'plan', l.cantidad_plan,$v$,
  $v$'variante_id', l.variante_id, 'plan', l.cantidad_plan,
                 'fallas_segundas', coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_fase_id and fa.variante_id = l.variante_id and fa.destino = 'segunda'), 0),
                 'fallas_perdidas', coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_fase_id and fa.variante_id = l.variante_id and fa.destino = 'perdida'), 0),$v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$select a.created_at, 1, jsonb_build_object($v$,
  $v$select coalesce(a.hecho_en, a.created_at), 1, jsonb_build_object($v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$'cuando', a.created_at, 'quien_nombre'$v$,
  $v$'cuando', coalesce(a.hecho_en, a.created_at), 'registrado_en', case when a.hecho_en is not null then a.created_at end, 'quien_nombre'$v$
);
-- Las fallas van antes de las anulaciones (el ancla es su comentario, que no cambia aunque otra migración toque la fila de las marcas).
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$-- Las anulaciones (filas compensatorias): «Anuló la salida de 48 a X: el motivo». La salida o la vuelta original sigue en su lugar, con `anulada`.$v$,
  $v$-- ADR-0570: las prendas con falla de «Terminé» (y su Deshacer), con su destino y su motivo; `falla_id` solo si todavía se puede deshacer.
      select coalesce(fa.hecho_en, fa.created_at), 1, jsonb_build_object(
          'cuando', coalesce(fa.hecho_en, fa.created_at), 'registrado_en', case when fa.hecho_en is not null then fa.created_at end,
          'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''),
          'tipo', case when fa.deshace_id is null then 'falla' else 'falla_deshecha' end,
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', abs(fa.cantidad),
          'detalle', abs(fa.cantidad) || ' de ' || retail.fn_produccion_variante_texto(fa.variante_id),
          'destino', fa.destino, 'motivo', fa.motivo, 'variante_id', fa.variante_id,
          'falla_id', case when fa.deshace_id is null and not exists (select 1 from retail.produccion_fallas d where d.deshace_id = fa.id) then fa.id end,
          'avance_id', null, 'id', fa.id)
        from retail.produccion_fallas fa
        join retail.produccion_fases f on f.id = fa.fase_id
        left join public.personas pe on pe.id = fa.hecho_por
       where f.produccion_id = p_produccion_id
      union all
      -- Las anulaciones (filas compensatorias): «Anuló la salida de 48 a X: el motivo». La salida o la vuelta original sigue en su lugar, con `anulada`.$v$
);

reset lock_timeout;
