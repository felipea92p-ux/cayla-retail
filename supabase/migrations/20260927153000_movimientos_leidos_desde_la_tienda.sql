-- ============================================================================
-- 20260927153000_movimientos_leidos_desde_la_tienda.sql — CAYLA V2 · ADR-0234 (Felipe, 2026-09-26: decisiones D1 y D2)
-- Movimientos cuenta lo que ENTRÓ y SALIÓ de la sede que se mira, y cuántas operaciones fueron.
--
-- EL PROBLEMA PRIMERO. En Tienda Trujillo llegaron 80 prendas del Taller (Traslado 2) y la tarjeta «Entradas» decía
-- «Nada entró en el período»; el detalle de esas mismas filas decía «+5 ENTRAN». En Tienda Lima, «Entradas +3» con 192
-- prendas recién llegadas. Dos causas en la base:
--   · `fn_movimientos_resumen` agrupa por un tipo EXCLUSIVO (ADR-0050): un traslado que llega es «transferencia», nunca
--     «entrada», y además solo devuelve el NETO por tipo — con él es imposible decir «llegaron 80 y salieron 20».
--   · Cuenta FILAS: el Traslado 2 (16 líneas) salía como «16 traslados (+80)».
-- Y el filtro «Entradas» de la lista tampoco traía los traslados que llegaron.
--
-- QUÉ HACE.
-- 1. `fn_movimientos`: el filtro «Entradas» (`p_categoria = 'entrada'`) trae también la pierna que LLEGA de un traslado, y
--    «Salidas» la que SALE. «Traslados» sigue trayendo las dos. Los tipos se leen desde la tienda: una prenda que llega
--    es una entrada para la tienda, venga del proveedor o del Taller. Misma firma y mismas columnas: se reemplaza SOLO
--    la condición del filtro dentro de la definición VIVA (`pg_temp.reemplazar_una_vez`), como 20260926000400; la
--    función no se copia, así que ningún parche en vivo se pierde.
-- 2. `fn_movimientos_resumen_procesos` (NUEVA, solo lectura): por GRUPO de la pantalla (Todos, Entradas, Salidas,
--    Traslados, Ajustes, Piso ↔ almacén) y proceso, cuántas OPERACIONES (lo que se guardó de una sola vez), cuántas filas y
--    cuántas unidades ENTRARON a la sede, SALIERON de ella o se MOVIERON entre piso y almacén. Una fila de `movimientos`
--    cuenta en todos los grupos donde la pantalla la muestra (un traslado que llega está en «Entradas» y en «Traslados»),
--    así cada cifra es la de lo que se ve al tocar ese filtro, y dentro de un grupo nada se cuenta dos veces. La vieja
--    `fn_movimientos_resumen` no se toca: la web publicada la sigue usando hasta que salga la nueva; se borra en su propia
--    migración cuando ninguna web la llame.
--
-- QUÉ ES UNA OPERACIÓN (decidido en ADR-0234). Lo que se guardó de una sola vez sobre un mismo documento: misma hora
-- exacta (`created_at`, que es `now()` = la hora de la TRANSACCIÓN), misma persona, mismo proceso y mismo documento
-- (el traslado, la venta, el conteo, la devolución, el cambio o el lote; ninguno si el proceso no tiene). Una recepción de
-- 16 variantes, una venta de dos prendas, una bajada al piso escaneada de una vez y un cambio (entra lo devuelto, sale lo
-- nuevo) son UNA operación cada una. El documento está en la clave para que dos ventas guardadas en una misma
-- transacción (un script, la siembra) no se lean como una sola con la boleta de la primera. No se agrupa SOLO por
-- documento: 116 de los 127 movimientos de TRU no tienen (bajadas, ajustes, stock inicial, apartados).
--
-- CONTRATO de `fn_movimientos_resumen_procesos`. PROMETE: para una sede y los mismos filtros que la lista (período,
-- proceso, búsqueda, persona, sububicación), una fila por (grupo, proceso) con operaciones, filas, `entran` (lo que sumó
-- stock a la sede), `salen` (lo que restó, en positivo) y `movidas` (unidades entre piso y almacén, que no cambian el
-- total). Dentro de un grupo, sumar `operaciones` de sus procesos da las operaciones distintas del grupo (una operación
-- tiene un solo proceso). El grupo `todos` incluye lo apartado y liberado, que la lista también muestra. ASUME: `created_at = now()` en todo INSERT a `movimientos` (hoy ninguna función escribe la hora a
-- mano). Mismo permiso que la lista (`fn_puede_operar_ubicacion`) y sin la variante centinela del cargo especial.
--
-- SE ROMPE SI: una función futura guarda una misma operación en varias transacciones, o escribe `created_at` con
-- `clock_timestamp()`: esa operación se contaría (y se vería en la lista) partida en pedazos. O si un movimiento nuevo
-- cuelga de un documento por una columna que esta clave no mira: dos documentos distintos guardados juntos se leerían
-- como uno. Lo vigila `pnpm pruebas:movimientos-desde-la-tienda`. O si alguien vuelve a pegar 20260919155000 (recrea `fn_movimientos` desde
-- el archivo): «Entradas» volvería a dejar fuera los traslados que llegan.
--
-- CÓMO SE PEGA: tal cual en el SQL Editor de producción (ya trae `retail.`). Solo crea o reemplaza funciones de lectura:
-- no toma candados de tablas en uso ni lleva políticas (ADR-0195 no aplica). Se puede pegar dos veces. Puede ir antes o
-- después de publicar la web: la web de hoy no llama a la función nueva, y la nueva web sin ella muestra la lista sin
-- las tarjetas.
-- ============================================================================

set search_path = retail, public, extensions;

-- Reemplaza UN trozo de una función viva y aborta si el trozo no aparece exactamente una vez (la función cambió desde que
-- se escribió esto). La marca, que va dentro del texto nuevo, la vuelve re-pegable.
create or replace function pg_temp.reemplazar_una_vez(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto a reemplazar aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. «Entradas» y «Salidas» se leen desde la tienda ----------
select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $viejo$or (p_categoria = 'salida' and m.tipo = 'salida' and coalesce(m.motivo, '') <> 'traslado_salida')$viejo$,
  $nuevo$or (p_categoria = 'salida' and ( -- ADR-0234: salidas_desde_la_tienda (también la pierna que SALE de un traslado)
            m.tipo = 'salida'
            or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_id = p_ubicacion_id)
          ))$nuevo$,
  'ADR-0234: salidas_desde_la_tienda'
);

select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $viejo$or (p_categoria = 'entrada' and m.tipo = 'entrada' and coalesce(m.motivo, '') <> 'traslado_entrada')$viejo$,
  $nuevo$or (p_categoria = 'entrada' and ( -- ADR-0234: entradas_desde_la_tienda (también la pierna que LLEGA de un traslado)
            m.tipo = 'entrada'
            or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_destino_id = p_ubicacion_id)
          ))$nuevo$,
  'ADR-0234: entradas_desde_la_tienda'
);

-- ---------- 2. El resumen por proceso: operaciones, lo que entró, lo que salió ----------
create or replace function retail.fn_movimientos_resumen_procesos(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_motivo text default null,
  p_busqueda text default null,
  p_usuario_id uuid default null,
  p_sububicacion_id uuid default null
)
returns table (grupo text, proceso text, operaciones bigint, filas bigint, entran bigint, salen bigint, movidas bigint)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_movs uuid[];
  v_desde timestamptz := (p_desde::timestamp) at time zone 'America/Lima';
  v_hasta timestamptz := ((p_hasta + 1)::timestamp) at time zone 'America/Lima';
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la ubicación cuyos movimientos quieres ver';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los movimientos de esa ubicación';
  end if;

  -- La misma búsqueda que la lista (una sola gramática: `fn_movimientos_busqueda`).
  if v_busqueda is not null then
    select b.variante_ids, b.movimiento_ids into v_variantes, v_movs from fn_movimientos_busqueda(v_busqueda) b;
    if coalesce(array_length(v_variantes, 1), 0) = 0 and coalesce(array_length(v_movs, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    g.grupo,
    x.proceso,
    -- Una operación = lo guardado en una sola transacción sobre un mismo documento (misma hora exacta, persona, proceso
    -- y documento). `count(distinct)` de la fila entera: una carga de sistema (persona nula) cuenta igual. La misma clave
    -- que arma la pantalla (`claveOperacion` en lib/movimientos-reglas.ts): si se cambia una, se cambia la otra.
    count(distinct (x.created_at, x.usuario_id, x.motivo, x.documento))::bigint,
    count(*)::bigint,
    coalesce(sum(x.delta) filter (where x.delta > 0), 0)::bigint,
    coalesce(sum(-x.delta) filter (where x.delta < 0), 0)::bigint,
    coalesce(sum(x.cantidad) filter (where x.interno), 0)::bigint
  from (
    select
      m.created_at,
      m.usuario_id,
      m.motivo,
      m.cantidad,
      -- El documento de la operación, en el mismo orden que `documentoDeOperacion` (TS): traslado, conteo, devolución,
      -- cambio, lote, venta. Nulo si el proceso no tiene documento (una bajada, un ajuste suelto, una carga inicial).
      coalesce(ti.transferencia_id, trc.transferencia_id, cti.conteo_id, di.devolucion_id, m.cambio_id, m.lote_id, vi.venta_id) as documento,
      m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id as interno,
      -- Los grupos donde la pantalla muestra esta fila: los mismos que `fn_movimientos` usa para `p_categoria`, leídos
      -- desde la tienda. `todos` los recibe a todos (sumado al pie).
      array_remove(array[
        case when m.tipo = 'entrada'
               or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_destino_id = p_ubicacion_id)
             then 'entrada' end,
        case when m.tipo = 'salida'
               or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_id = p_ubicacion_id)
             then 'salida' end,
        case when (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id) or m.motivo in ('traslado_salida', 'traslado_entrada')
             then 'transferencia' end,
        case when m.tipo = 'ajuste' then 'ajuste' end,
        case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno' end,
        'todos'
      ], null) as grupos,
      -- El proceso: el motivo, salvo en un traslado de una sola fila (modelo anterior a 20260916150000), donde la
      -- pierna la dice hacia dónde va el stock de ESTA sede.
      case
        when m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id then
          case when m.ubicacion_destino_id = p_ubicacion_id then 'traslado_entrada' else 'traslado_salida' end
        else coalesce(m.motivo, m.tipo)
      end as proceso,
      -- El efecto sobre el stock de la sede que se mira (mismo cálculo que `fn_movimientos`). Apartar no cambia el stock:
      -- queda nulo y no suma ni a `entran` ni a `salen`.
      case m.tipo
        when 'entrada' then m.cantidad
        when 'salida' then -m.cantidad
        when 'ajuste' then m.cantidad
        when 'traslado' then
          case
            when m.ubicacion_id = m.ubicacion_destino_id then 0
            when m.ubicacion_destino_id = p_ubicacion_id then m.cantidad
            else -m.cantidad
          end
      end as delta
    from movimientos m
    left join transferencia_items ti on ti.id = m.transferencia_item_id
    left join transferencia_recepciones trc on trc.id = m.transferencia_recepcion_id
    left join conteo_items cti on cti.id = m.conteo_item_id
    left join devolucion_items di on di.id = m.devolucion_item_id
    left join venta_items vi on vi.id = m.venta_item_id
    where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
      and m.variante_id <> c_cargo_especial
      and (p_desde is null or m.created_at >= v_desde)
      and (p_hasta is null or m.created_at < v_hasta)
      and (p_motivo is null or m.motivo = p_motivo)
      and (p_usuario_id is null or m.usuario_id = p_usuario_id)
      and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
      and (
        v_busqueda is null
        or (v_variantes is not null and m.variante_id = any(v_variantes))
        or (v_movs is not null and m.id = any(v_movs))
      )
  ) x
  cross join lateral unnest(x.grupos) as g(grupo)
  group by g.grupo, x.proceso;
end;
$function$;

comment on function retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid) is
  'ADR-0234: las tarjetas y las cifras de Movimientos leídas desde la tienda. Por (grupo de la pantalla: todos, entrada, salida, transferencia, ajuste, interno; proceso): operaciones (lo guardado en una sola transacción: misma hora exacta, persona y proceso), filas, unidades que entraron a la sede, que salieron y que se movieron entre piso y almacén. Una fila cuenta en cada grupo donde la pantalla la muestra. Mismos filtros y permiso que fn_movimientos.';

revoke all on function retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid) from public, anon;
grant execute on function retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
