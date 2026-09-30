-- ============================================================================
-- 20261001120000_conteo_hallazgo_por_ajuste.sql — CAYLA V2 · Inventario: la prenda que faltó en un conteo y apareció después
-- se registra enlazada a ESE conteo (2026-10-01)
-- UNA sola parte (dos funciones nuevas y dos reescritas; sin tablas, sin políticas ni `drop trigger`; idempotente).
-- Requiere `20260930050100` (`fn_conteo_lineas_json` con `ajustado_total`/`ajustado_antes` y el índice de `movimientos`).
--
-- EL PROBLEMA PRIMERO. Conteo 13: la camisa faltaba, el cierre restó 1. Dos días después la colaboradora la encuentra. Hoy hay
-- dos caminos: «Editar conteo» (corrige el conteo, ya nota lo que el cierre ajustó) o un ajuste suelto en Existencias,
-- que suma 1 SIN relación con el conteo: el conteo sigue diciendo «faltó 1», la merma queda contada como pérdida real y
-- nadie sabe que la prenda apareció. Felipe (2026-09-30): «tiene que saber que fue por ese conteo anterior y arreglar ese
-- conteo también automáticamente, para mantener un equilibrio en todo». Finanzas está en pausa: su lectura de motivos no
-- cuenta para esta decisión.
--
-- DECIDÍ
--   · El libro no se edita ni el conteo se reabre. Un ajuste positivo puede llevar `conteo_item_id` de la línea que faltó:
--     queda como movimiento `tipo = 'ajuste'`, `motivo = 'hallazgo_conteo'`, enlazado a ESA línea. El conteo conserva lo que
--     se contó ese día (`diferencia = −1`, verdad histórica) y su pantalla dice «encontrada +1» leyendo el libro.
--     «Arreglar el conteo» = que lo pendiente del conteo baje, no que su historia cambie.
--   · `fn_faltantes_de_conteo(ubicación, variantes[])` dice, por prenda, qué faltó y no se ha recuperado en conteos CERRADOS
--     de esa tienda: faltaron − ya encontradas. Es lo que el modal de ajuste consulta para preguntar «¿es la que faltó?».
--   · `registrar_hallazgo_de_conteo(...)` es la única puerta que escribe ese motivo, con el mismo candado que un ajuste
--     (módulo «Ajustar stock»). Serializa con `for update` sobre la línea: dos personas que enlazan la misma falta a la vez
--     no pueden recuperar más de lo que faltó. Rechaza (P0001 con hint): `hallazgo_no_existe`, `hallazgo_otra_prenda`,
--     `hallazgo_otra_sede`, `hallazgo_conteo_no_cerrado`, `hallazgo_sin_faltante`, `hallazgo_cantidad_invalida`, `hallazgo_excede`.
--   · `ajustar_inventario` acepta `conteo_item_id` opcional por línea de ajuste (solo cantidades positivas). Sin él,
--     todo igual que antes (misma huella del reintento). Devuelve además `enlazados`.
--   · `fn_conteo_lineas_json` suma `hallazgos` (lo recuperado por línea). NO entra en `ajustado_total`/`ajustado_antes`: esos
--     siguen siendo solo los ajustes del cierre (la nota de «Editar conteo»).
-- DESCARTÉ
--   · Reabrir el conteo y cambiarle la cantidad al ajustar: reescribe la historia del conteo y exige que ese conteo pueda
--     reabrirse (uno abierto por sede; solo modelo nuevo). El libro ya tiene el «faltó 1»; solo le falta el «apareció 1».
--   · Un movimiento inverso del cierre (borrar o compensar la merma): duplicaría el asiento; el hallazgo enlazado lo dice
--     sin tocar nada.
--   · Una columna nueva `recuperadas` en `conteo_items`: un dato derivado más que mantener; el libro ya lo tiene.
--   · Ampliar `registrar_movimiento` con el enlace: se llama desde muchas partes y cambiaría su firma.
-- SE ROMPE SI
--   · alguien registra un ajuste con `motivo = 'hallazgo_conteo'` sin pasar por `registrar_hallazgo_de_conteo` (recuperaría
--     más de lo que faltó);
--   · `cerrar_conteo` deja de escribir `diferencia` negativa en una línea con faltante (la función no la vería);
--   · se reabre un conteo con hallazgos y se vuelve a contar: el «debe haber» de esa línea ya trae lo recuperado y la nota
--     de Conteo lo cuenta como «entró N» (correcto, pero no dice que fue el hallazgo).
--
-- PRODUCCIÓN. Pegar tal cual en el SQL Editor (ya trae `retail.`), DESPUÉS de `20260930050100`. No toma bloqueos de escritura
-- sobre tablas en uso (solo `create or replace function`). PARA VOLVER: volver a pegar `ajustar_inventario` de
-- `20260928130000` y `fn_conteo_lineas_json` de `20260930050100`, y `drop function` de las dos nuevas.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create index if not exists movimientos_conteo_item_idx
  on retail.movimientos (conteo_item_id)
  where conteo_item_id is not null;

-- ----------------------------------------------------------------------------
-- 1. fn_faltantes_de_conteo — lo que faltó en conteos cerrados y todavía no se recupera, por prenda.
--    Lectura (prefijo `fn_`): el loader global no la bloquea. Sin permiso sobre la tienda, devuelve vacío.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_faltantes_de_conteo(p_ubicacion_id uuid, p_variante_ids uuid[])
returns table(
  variante_id uuid,
  conteo_item_id uuid,
  conteo_id uuid,
  conteo_numero integer,
  cerrado_en timestamptz,
  faltaron integer,
  encontradas integer,
  pendientes integer
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  select ci.variante_id,
         ci.id,
         c.id,
         c.numero,
         c.cerrado_en,
         (-ci.diferencia)::integer,
         coalesce(h.n, 0)::integer,
         (-ci.diferencia - coalesce(h.n, 0))::integer
    from conteo_items ci
    join conteos c on c.id = ci.conteo_id
    left join lateral (
      select sum(m.cantidad) as n
        from movimientos m
       where m.conteo_item_id = ci.id and m.motivo = 'hallazgo_conteo'
    ) h on true
   where fn_puede_operar_ubicacion(p_ubicacion_id)
     and c.ubicacion_id = p_ubicacion_id
     and c.estado = 'cerrado'
     and ci.variante_id = any (p_variante_ids)
     and ci.diferencia < 0
     and (-ci.diferencia - coalesce(h.n, 0)) > 0
   order by c.cerrado_en desc, ci.id;
$function$;

revoke all on function retail.fn_faltantes_de_conteo(uuid, uuid[]) from public, anon;
grant execute on function retail.fn_faltantes_de_conteo(uuid, uuid[]) to authenticated;

comment on function retail.fn_faltantes_de_conteo(uuid, uuid[]) is
  'Por prenda: lo que faltó en conteos CERRADOS de la tienda (diferencia negativa) y aún no se recupera (faltaron − encontradas, del libro: motivo hallazgo_conteo). El modal de ajuste la usa para preguntar «¿es la que faltó en el Conteo N?». Vacío sin permiso sobre la tienda. Más reciente primero.';

-- ----------------------------------------------------------------------------
-- 2. registrar_hallazgo_de_conteo — la ÚNICA puerta del motivo `hallazgo_conteo`.
-- ----------------------------------------------------------------------------
create or replace function retail.registrar_hallazgo_de_conteo(
  p_conteo_item_id uuid,
  p_variante_id uuid,
  p_ubicacion_id uuid,
  p_cantidad integer,
  p_sububicacion_id uuid default null,
  p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  ci conteo_items%rowtype;
  c conteos%rowtype;
  v_ya integer;
  v_pendientes integer;
  v_id uuid;
  v_persona uuid;
begin
  if not fn_puede_ajustar_stock() then
    raise exception 'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste'
      using errcode = '42501', hint = 'ajuste_sin_modulo';
  end if;

  -- La línea, bloqueada: dos personas que enlazan la misma falta a la vez se turnan y la segunda ve lo que ya recuperó la primera.
  select * into ci from conteo_items where id = p_conteo_item_id for update;
  if not found then
    raise exception 'Esa línea de conteo ya no existe' using errcode = 'P0001', hint = 'hallazgo_no_existe';
  end if;
  if ci.variante_id is distinct from p_variante_id then
    raise exception 'Esa línea de conteo es de otra prenda' using errcode = 'P0001', hint = 'hallazgo_otra_prenda';
  end if;
  -- `for share`: un `reabrir_conteo` en curso (que toma la fila `for update`) se turna con esta escritura.
  select * into c from conteos where id = ci.conteo_id for share;
  if c.ubicacion_id is distinct from p_ubicacion_id then
    raise exception 'Ese conteo es de otra tienda' using errcode = 'P0001', hint = 'hallazgo_otra_sede';
  end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if c.estado <> 'cerrado' then
    raise exception 'Ese conteo no está cerrado: si sigue abierto, corrige la cantidad dentro del conteo'
      using errcode = 'P0001', hint = 'hallazgo_conteo_no_cerrado';
  end if;
  if coalesce(ci.diferencia, 0) >= 0 then
    raise exception 'Esa prenda no faltó en ese conteo' using errcode = 'P0001', hint = 'hallazgo_sin_faltante';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad encontrada tiene que ser al menos 1' using errcode = 'P0001', hint = 'hallazgo_cantidad_invalida';
  end if;
  if p_sububicacion_id is null and exists (
    select 1 from sububicaciones where ubicacion_id = c.ubicacion_id and tipo in ('piso_venta', 'almacen_tienda')
  ) then
    raise exception 'Esta ubicación separa piso y almacén — indica a cuál corresponde el ajuste';
  end if;

  select coalesce(sum(cantidad), 0)::integer into v_ya
    from movimientos where conteo_item_id = ci.id and motivo = 'hallazgo_conteo';
  v_pendientes := -ci.diferencia - v_ya;
  if p_cantidad > v_pendientes then
    raise exception 'En el Conteo % faltaron % y ya se recuperaron %: solo se pueden enlazar % más', c.numero, -ci.diferencia, v_ya, v_pendientes
      using errcode = 'P0001', hint = 'hallazgo_excede';
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, conteo_item_id, usuario_id, nota)
    values (ci.variante_id, c.ubicacion_id, p_sububicacion_id, 'ajuste', p_cantidad, 'hallazgo_conteo', ci.id, v_persona, nullif(btrim(p_nota), ''))
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$function$;

revoke all on function retail.registrar_hallazgo_de_conteo(uuid, uuid, uuid, integer, uuid, text) from public, anon, authenticated;

comment on function retail.registrar_hallazgo_de_conteo(uuid, uuid, uuid, integer, uuid, text) is
  'Registra que una prenda que faltó en un conteo cerrado apareció: ajuste positivo (motivo hallazgo_conteo) enlazado a la línea del conteo. Solo la llama ajustar_inventario (sin EXECUTE para authenticated). Candado: módulo «Ajustar stock» + permiso sobre la tienda. No permite recuperar más de lo que faltó (hallazgo_excede).';

-- ----------------------------------------------------------------------------
-- 3. ajustar_inventario — MISMA firma y cuerpo vigente (20260928130000); cambia solo el manejo de `conteo_item_id`.
-- ----------------------------------------------------------------------------
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
  v_enlazados integer := 0;
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
  -- ADR-0250: el módulo se pide ANTES de bloquear nada. Las cargas (prenda nueva) no lo necesitan; registrar_movimiento
  -- lo vuelve a exigir más abajo — este `if` solo evita tomar locks y llamar a cargar_stock_inicial en vano.
  if jsonb_array_length(v_ajustes) > 0 and not fn_puede_ajustar_stock() then
    raise exception 'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste' using errcode = '42501', hint = 'ajuste_sin_modulo';
  end if;
  -- Forma: un ajuste es un entero con signo distinto de 0; una carga, un entero positivo; ninguna prenda dos veces.
  if exists (
    select 1 from jsonb_array_elements(v_ajustes) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^-?[1-9][0-9]{0,5}$'
        -- Hallazgo (20261001120000): `conteo_item_id` es opcional; si viene, es un uuid y la línea SUMA (una prenda que faltó
        -- y apareció no se resta).
        or (nullif(e ->> 'conteo_item_id', '') is not null
            and (e ->> 'conteo_item_id' !~* c_uuid or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,5}$'))
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
    (select string_agg(lower(e ->> 'variante_id') || ':' || (e ->> 'cantidad')
                       || case when nullif(e ->> 'conteo_item_id', '') is not null then ':' || lower(e ->> 'conteo_item_id') else '' end,
                       ',' order by lower(e ->> 'variante_id'))
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
    select (e ->> 'variante_id')::uuid as v, (e ->> 'cantidad')::integer as c, nullif(e ->> 'conteo_item_id', '')::uuid as enlace
      from jsonb_array_elements(v_ajustes) e
     order by 1
  loop
    if r.enlace is null then
      perform registrar_movimiento(r.v, p_ubicacion_id, 'ajuste', r.c, p_motivo, v_nota, p_sububicacion_id);
    else
      -- La prenda que faltó en un conteo y apareció: el ajuste queda enlazado a ESA línea (motivo «hallazgo_conteo»).
      perform registrar_hallazgo_de_conteo(r.enlace, r.v, p_ubicacion_id, r.c, p_sububicacion_id, v_nota);
      v_enlazados := v_enlazados + 1;
    end if;
  end loop;

  v_resultado := jsonb_build_object(
    'ajustes', jsonb_array_length(v_ajustes),
    'cargas', jsonb_array_length(v_cargas),
    'unidades_cargadas', coalesce(v_unidades, 0),
    'enlazados', v_enlazados);
  insert into ajustes_inventario_intentos (token_cliente, ubicacion_id, huella, resultado)
    values (p_token, p_ubicacion_id, v_huella, v_resultado);

  return v_resultado || jsonb_build_object('ya_registrado', false, 'registrado_en', now());
end;
$fn$;

revoke all on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) from public, anon;
grant execute on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) to authenticated;

comment on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) is
  'ADR-0240/0247/0291: «Ajustar inventario» de una vez y todo o nada. p_ajustes = [{variante_id, cantidad, conteo_item_id?}] (con historia en la tienda, cantidad con signo) por registrar_movimiento, pide el módulo «Ajustar stock»; con conteo_item_id (solo cantidad positiva) la línea es un hallazgo: enlazada a la línea de un conteo cerrado donde faltó (registrar_hallazgo_de_conteo). p_cargas = [{variante_id, cantidad}] (sin historia, > 0) por cargar_stock_inicial. p_token obligatorio: el mismo token con los mismos datos devuelve lo ya guardado (ya_registrado). Devuelve además enlazados.';

-- ----------------------------------------------------------------------------
-- 4. fn_conteo_lineas_json — la de 20260930050100 más `hallazgos` (lo recuperado por línea, del libro).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_conteo_lineas_json(
  p_conteo_id uuid,
  p_variante_id uuid default null,
  p_con_item boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  select coalesce(jsonb_agg(l.j order by l.variante_id), '[]'::jsonb)
    from (
      select ci.variante_id,
             jsonb_build_object(
               'variante_id', ci.variante_id,
               'debe_haber', ci.cantidad_sistema,
               'foto', coalesce(ci.cantidad_foto, ci.cantidad_sistema),
               'contada', ci.cantidad_contada,
               'anterior', ci.contada_anterior,
               'verificado_en', ci.verificado_en,
               'confirmada_en', ci.confirmada_en,
               'actual', case when c.estado = 'abierto' then coalesce(st.cantidad, 0) end,
               'diferencia', ci.cantidad_contada - ci.cantidad_sistema,
               'ajuste_movimiento_id', ci.movimiento_id,
               'ajustado_total', coalesce(aj.total, 0),
               'ajustado_antes', coalesce(aj.antes, 0),
               'hallazgos', coalesce(aj.hallazgos, 0),
               'estado', case
                 when ci.cantidad_contada is null and ci.contada_anterior is null then 'pendiente'
                 when ci.cantidad_contada is null then 'en_reconteo'
                 when ci.cantidad_contada = ci.cantidad_sistema then 'correcta'
                 when ci.confirmada_en is null then 'con_diferencia'
                 else 'diferencia_confirmada'
               end
             ) || case when p_con_item then jsonb_build_object('item_id', ci.id) else '{}'::jsonb end as j
        from conteo_items ci
        join conteos c on c.id = ci.conteo_id
        left join lateral (
          select sum(s.cantidad)::integer as cantidad
            from stock s
           where c.estado = 'abierto'
             and s.variante_id = ci.variante_id
             and s.ubicacion_id = c.ubicacion_id
             and (c.sububicacion_id is null or s.sububicacion_id = c.sububicacion_id)
        ) st on true
        left join lateral (
          select (sum(m.cantidad) filter (where m.motivo = 'conteo'))::integer as total,
                 (sum(m.cantidad) filter (where m.motivo = 'conteo' and (ci.diferencia is null or m.id is distinct from ci.movimiento_id)))::integer as antes,
                 (sum(m.cantidad) filter (where m.motivo = 'hallazgo_conteo'))::integer as hallazgos
            from movimientos m
           where m.conteo_item_id = ci.id
             and m.tipo = 'ajuste'
             and m.motivo in ('conteo', 'hallazgo_conteo')
        ) aj on true
       where ci.conteo_id = p_conteo_id
         and (p_variante_id is null or ci.variante_id = p_variante_id)
         and not (ci.cantidad_contada is null and coalesce(ci.cantidad_foto, 0) = 0 and ci.contada_anterior is null)
    ) l;
$function$;

revoke all on function retail.fn_conteo_lineas_json(uuid, uuid, boolean) from public, anon, authenticated;

comment on function retail.fn_conteo_lineas_json(uuid, uuid, boolean) is
  'Las líneas de un conteo con su estado derivado. Trae ajustado_total/ajustado_antes (ajustes del cierre) y hallazgos (lo recuperado después por un ajuste enlazado, motivo hallazgo_conteo). Sin permisos propios: solo la llaman funciones security definer que ya los validaron; no se expone a la web.';

notify pgrst, 'reload schema';
