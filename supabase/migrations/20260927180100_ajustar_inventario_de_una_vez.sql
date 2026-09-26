-- ============================================================================
-- 20260927180100_ajustar_inventario_de_una_vez.sql — CAYLA V2 · ADR-0240
-- «Ajustar inventario» guarda todas sus líneas de una vez, con marca de reintento: todo o nada.
--
-- EL PROBLEMA PRIMERO. El modal «Ajustar inventario» guardaba línea por línea: primero la carga inicial de las prendas
-- nuevas en la tienda (`cargar_stock_inicial`) y después UNA llamada a `registrar_movimiento` por cada ajuste, sin
-- marca. Si la red se cortaba a mitad de un ajuste de 6 líneas, quedaban 3 aplicadas y 3 no. El modal quitaba de la
-- lista las ya aplicadas solo si la BASE respondía que la siguiente falló; con un corte de red no sabe cuáles llegaron,
-- y al reintentar las volvía a mandar: el ajuste se duplicaba (análisis `/pantalla` de Existencias, tarea #1).
--
-- QUÉ HACE. `retail.ajustar_inventario`: UNA transacción con todo lo que la persona confirmó en el modal.
--   · Las prendas nuevas en la tienda van por `cargar_stock_inicial` (ADR-0235: entrada «carga_inicial», con su bajada
--     si van al piso y la cuenta tiene el módulo; la pantalla decide `p_al_piso`, ADR-0212).
--   · Cada ajuste va por `registrar_movimiento` (la misma función de siempre, con todos sus candados: quién puede
--     ajustar, «Reposición» no toca el piso, un ajuste no es la primera carga, stock que no queda negativo).
--   · Se llaman, no se copian. Si UNA línea falla, se deshace todo y el mensaje es el de esa línea.
--   · La marca (`p_token`, obligatoria): el mismo intento enviado otra vez con los mismos datos devuelve lo ya guardado
--     (`ya_registrado: true`) sin ajustar de nuevo; con otros datos no repite nada y lo dice (`ajuste_token_reusado`).
--     Se guarda en `ajustes_inventario_intentos`, que nadie edita ni borra.
--   · Orden de candados (ADR-0190): (1) la marca, (2) el stock de TODAS las prendas del ajuste en orden de prenda
--     (`fn_bloquear_en_orden`), recién entonces se escribe.
--
-- CONTRATO. PROMETE: todo o nada; devuelve {ajustes, cargas, unidades_cargadas, ya_registrado, registrado_en}. ASUME:
-- `p_ajustes` = prendas CON historia en la tienda (cantidad con signo, distinta de 0), `p_cargas` = prendas SIN
-- historia (cantidad > 0), `p_sububicacion_id` = dónde se ajusta (null si la tienda no separa piso y almacén). Si la web
-- se equivoca de lista, la base igual la frena (`ajuste_sin_historia`, `carga_con_historia`) y no guarda nada.
--
-- SE ROMPE SI dos personas ajustan la misma prenda a la vez con cifras pensadas sobre el mismo stock: las dos pasan
-- (una detrás de la otra, por el candado) y el resultado suma las dos correcciones. Es lo mismo que ya pasaba línea por
-- línea; lo que este cambio evita es el ajuste a medias y el duplicado por reintento, no el choque de dos criterios.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual, en una vez (trae `retail.`). Crea una tabla NUEVA (nadie la usa todavía) con
-- RLS encendido y SIN políticas (solo la lee y escribe esta función, `security definer`: regla «Políticas y deadlocks»
-- de CLAUDE.md), dos disparadores sobre esa tabla nueva con `create or replace trigger`, y una función. No toca tablas
-- en uso. Idempotente. Va ANTES de publicar la web (la web la llama).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La marca de cada ajuste confirmado
-- ---------------------------------------------------------------------------
create table if not exists retail.ajustes_inventario_intentos (
  token_cliente uuid primary key,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  huella text not null check (length(huella) = 32),
  resultado jsonb not null,
  created_at timestamptz not null default now()
);

comment on table retail.ajustes_inventario_intentos is
  'ADR-0240: la marca de cada «Ajustar inventario» confirmado. El reintento con la misma marca y los mismos datos devuelve lo ya guardado sin ajustar de nuevo. Solo la escribe ajustar_inventario; no se edita ni se borra.';
comment on column retail.ajustes_inventario_intentos.token_cliente is 'La marca que generó el modal para ese intento.';
comment on column retail.ajustes_inventario_intentos.huella is 'md5 de tienda, dónde, motivo, nota, «al piso» y las dos listas ordenadas: con otros datos, la marca no se reutiliza.';
comment on column retail.ajustes_inventario_intentos.resultado is 'Lo que devolvió el primer envío (cuántos ajustes, cuántas cargas, unidades cargadas).';

create or replace function retail.fn_intento_ajuste_es_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'La marca de un ajuste de inventario no se edita ni se borra.';
end;
$fn$;

create or replace trigger ajustes_inventario_intentos_inmutables
  before update or delete on retail.ajustes_inventario_intentos
  for each row execute function retail.fn_intento_ajuste_es_inmutable();

create or replace trigger ajustes_inventario_intentos_sin_truncate
  before truncate on retail.ajustes_inventario_intentos
  for each statement execute function retail.fn_historial_sin_truncate();

alter table retail.ajustes_inventario_intentos enable row level security;
revoke all on table retail.ajustes_inventario_intentos from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El ajuste completo, de una vez
-- ---------------------------------------------------------------------------
create or replace function retail.ajustar_inventario(
  p_ubicacion_id uuid,
  p_sububicacion_id uuid,
  p_ajustes jsonb,
  p_motivo text,
  p_cargas jsonb,
  p_al_piso boolean,
  p_nota text,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ajustes jsonb := coalesce(p_ajustes, '[]'::jsonb);
  v_cargas jsonb := coalesce(p_cargas, '[]'::jsonb);
  v_nota text := nullif(btrim(p_nota), '');
  v_huella text;
  v_prev retail.ajustes_inventario_intentos%rowtype;
  v_unidades integer := 0;
  v_resultado jsonb;
  r record;
begin
  if p_token is null then
    raise exception 'Falta la marca de este ajuste. Cierra la ventana y vuelve a abrirla.' using hint = 'ajuste_sin_token';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ajustar el inventario de esa tienda.' using errcode = '42501', hint = 'ajuste_sin_tienda';
  end if;
  if jsonb_typeof(v_ajustes) <> 'array' or jsonb_typeof(v_cargas) <> 'array' then
    raise exception 'Las líneas del ajuste llegaron mal armadas.' using hint = 'ajuste_linea_invalida';
  end if;
  if jsonb_array_length(v_ajustes) + jsonb_array_length(v_cargas) = 0 then
    raise exception 'Ingresa al menos un ajuste distinto de cero.' using hint = 'ajuste_vacio';
  end if;
  -- Forma: un ajuste es un entero con signo distinto de 0; una carga, un entero positivo; ninguna prenda dos veces.
  if exists (
    select 1 from jsonb_array_elements(v_ajustes) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^-?[1-9][0-9]{0,5}$'
  ) or exists (
    select 1 from jsonb_array_elements(v_cargas) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,5}$'
  ) or exists (
    select 1 from (
      select e ->> 'variante_id' as v from jsonb_array_elements(v_ajustes) e
      union all
      select e ->> 'variante_id' from jsonb_array_elements(v_cargas) e
    ) t group by lower(t.v) having count(*) > 1
  ) then
    raise exception 'Cada prenda del ajuste necesita un código válido, una cantidad entera distinta de cero y aparecer una sola vez.'
      using hint = 'ajuste_linea_invalida';
  end if;
  if jsonb_array_length(v_ajustes) > 0 and nullif(btrim(p_motivo), '') is null then
    raise exception 'Elige un motivo para el ajuste.' using hint = 'ajuste_sin_motivo';
  end if;

  v_huella := md5(concat_ws('|',
    p_ubicacion_id, p_sububicacion_id, coalesce(p_motivo, ''), coalesce(v_nota, ''), coalesce(p_al_piso, false),
    (select string_agg(lower(e ->> 'variante_id') || ':' || (e ->> 'cantidad'), ',' order by lower(e ->> 'variante_id'))
       from jsonb_array_elements(v_ajustes) e),
    (select string_agg(lower(e ->> 'variante_id') || ':' || (e ->> 'cantidad'), ',' order by lower(e ->> 'variante_id'))
       from jsonb_array_elements(v_cargas) e)));

  -- Candado 1: la marca. Un segundo envío del mismo intento espera aquí y, al soltarse, encuentra lo ya guardado. Se
  -- mira ANTES de pedir responsable: comprobar un ajuste ya guardado no escribe nada.
  perform pg_advisory_xact_lock(hashtextextended('ajustar_inventario:' || p_token::text, 0));
  select * into v_prev from ajustes_inventario_intentos where token_cliente = p_token;
  if found then
    if v_prev.ubicacion_id is distinct from p_ubicacion_id or v_prev.huella <> v_huella then
      raise exception 'Ese ajuste ya se guardó a las % con otros datos: no se repitió. Cierra la ventana y revisa Existencias antes de volver a ajustar.',
        to_char(v_prev.created_at at time zone 'America/Lima', 'HH24:MI')
        using hint = 'ajuste_token_reusado';
    end if;
    return v_prev.resultado || jsonb_build_object('ya_registrado', true, 'registrado_en', v_prev.created_at);
  end if;

  -- Candado 2: el stock de todas las prendas del ajuste en esta tienda, en orden de prenda (ADR-0190).
  perform fn_bloquear_en_orden(
    p_ubicacion_id,
    array(select (e ->> 'variante_id')::uuid from jsonb_array_elements(v_ajustes || v_cargas) e));

  -- Las prendas nuevas en la tienda: stock inicial (con su bajada si van al piso), con sus propios candados.
  if jsonb_array_length(v_cargas) > 0 then
    v_unidades := cargar_stock_inicial(p_ubicacion_id, v_cargas, v_nota, coalesce(p_al_piso, false), p_token);
  end if;

  -- Cada ajuste, en orden de prenda, por la función de siempre. Si una falla, la excepción deshace TODO lo anterior.
  for r in
    select (e ->> 'variante_id')::uuid as v, (e ->> 'cantidad')::integer as c
      from jsonb_array_elements(v_ajustes) e
     order by 1
  loop
    perform registrar_movimiento(r.v, p_ubicacion_id, 'ajuste', r.c, p_motivo, v_nota, p_sububicacion_id);
  end loop;

  v_resultado := jsonb_build_object(
    'ajustes', jsonb_array_length(v_ajustes),
    'cargas', jsonb_array_length(v_cargas),
    'unidades_cargadas', coalesce(v_unidades, 0));
  insert into ajustes_inventario_intentos (token_cliente, ubicacion_id, huella, resultado)
    values (p_token, p_ubicacion_id, v_huella, v_resultado);

  return v_resultado || jsonb_build_object('ya_registrado', false, 'registrado_en', now());
end;
$fn$;

comment on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) is
  'ADR-0240: «Ajustar inventario» de una vez y todo o nada. p_ajustes = [{variante_id, cantidad}] (con historia en la tienda, cantidad con signo) por registrar_movimiento; p_cargas = [{variante_id, cantidad}] (sin historia, > 0) por cargar_stock_inicial (p_al_piso: con su bajada). p_token obligatorio: el mismo token con los mismos datos devuelve lo ya guardado (ya_registrado); con otros datos no repite nada (ajuste_token_reusado).';

revoke all on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) from public, anon;
grant execute on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) to authenticated;

notify pgrst, 'reload schema';
