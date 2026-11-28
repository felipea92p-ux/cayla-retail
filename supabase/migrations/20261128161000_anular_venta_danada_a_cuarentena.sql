-- ============================================================================
-- 20261128161000_anular_venta_danada_a_cuarentena.sql — CAYLA V2 (auditoría 2026-11-28, hallazgo N.º 1)
-- Anular una venta con la prenda dañada la deja en Dañadas, igual que una devolución (ADR-0071).
--
-- EL PROBLEMA PRIMERO. En /devoluciones ▸ Anular venta cada línea lleva su condición: «Vendible», «Dañada para reparar»,
-- «Dañada para donar» o «Devolver al proveedor». `anular_venta` solo movía stock con «Vendible»: con las otras tres la venta
-- quedaba anulada, la salida por venta seguía contando y no nacía ninguna fila en `prendas_danadas`. La prenda seguía
-- físicamente en la tienda, pero no figuraba ni en el stock ni en la cola de Dañadas: el conteo salía con sobrante y nadie
-- decidía si se reparaba, se donaba o se devolvía. A cambio, Finanzas la daba por perdida el mismo día de la anulación
-- (6951 en `fn_asientos`, «danada» en `fn_perdidas_hechos`), aunque se pudiera reparar. `anular_venta` se quedó con la
-- regla de `aprobar_devolucion` de antes de ADR-0071.
--
-- QUÉ HACE (seis piezas, en una sola parte):
--   1. `fn_anulacion_a_danadas` (nueva, pequeña): para UNA línea dañada de una venta que se anula, hace lo mismo que
--      `aprobar_devolucion` con una devolución dañada: una entrada a la cuarentena de la tienda de la venta (la sububicación
--      `cuarentena`) con motivo `anulacion_venta`, y una fila en `prendas_danadas` que apunta a ese movimiento. Devuelve el
--      movimiento, que `anular_venta` guarda en `venta_anulacion_items.movimiento_id`: así la anulación, el movimiento y la
--      dañada quedan enlazados (movimiento_entrada_id = movimiento_id; el movimiento lleva su venta_item_id).
--      La fila de Dañadas lleva su origen en `motivo_reporte` («Venta anulada para donar: <motivo>»), como ya lo hace la
--      recepción («Llegó dañada en ENV-…»): `prendas_danadas_un_origen` pide exactamente uno de devolución, cambio o motivo,
--      y una anulación no es ninguna de las dos primeras. La pantalla de Dañadas lo reconoce por ese comienzo.
--   2. `anular_venta`: un reemplazo anclado agrega la rama de las tres condiciones dañadas, que llama a la pieza 1. La
--      «Prenda sin registrar» (ADR-0179) sigue sin mover nada: su venta nunca sacó stock.
--   3. `fn_perdidas_hechos`: una anulación dañada CON movimiento ya no es pérdida el día que se anula; la pérdida se anota
--      cuando Dañadas la resuelve (donada, botada…), por su salida de la cuarentena, igual que una devolución. Las de antes
--      (sin movimiento) siguen contando como siempre: el historial no cambia.
--   4. `fn_asientos`: lo mismo en la contabilidad. Con movimiento, el costo vuelve a la mercadería (201), como una
--      devolución, y la merma se asienta al salir de la cuarentena (`merma_cuarentena`). Sin movimiento, 6951 como antes.
--   5. `fn_aliada_ventas`: la misma regla para una prenda de una aliada (CLAURE). `fn_asientos_claure` la saca del Diario de CAYLA
--      con `costo_ok` (201) y `costo_mal` (6951); con la regla vieja, la dañada de CLAURE quedaba en la 201 de CAYLA (+costo) y la
--      6951 con una merma negativa, para siempre: al resolverla en Dañadas su salida es de CLAURE y CAYLA no asienta nada.
--   6. `corregir_prenda_danada` y `devolver_danada_sin_dano`: su rechazo nombra también la venta anulada (solo el texto).
--
-- DECIDÍ: copiar la rama de `aprobar_devolucion` en una función aparte y no dentro del texto del reemplazo: (a) se lee y se
-- prueba sola, (b) el texto que se inserta en `anular_venta` no lleva ninguna consulta, así que no hay riesgo de «select …
-- into» dentro de un texto entre comillas (sql-produccion.md), y (c) la rama de «Vendible» no se toca.
-- DESCARTÉ: (a) una columna nueva `prendas_danadas.venta_anulacion_item_id` con su candado de origen: es un `alter` de una
-- tabla en uso y un cambio de las lecturas de Dañadas para un dato que ya se alcanza por el movimiento; (b) dejar la prenda
-- en el piso como «vendible»: la persona dijo que está dañada.
-- SE ROMPE SI: alguien vuelve a escribir `anular_venta` entera desde una definición vieja (la rama desaparece y vuelve el
-- hueco); o si una tienda no tiene sububicación de cuarentena (la anulación con dañada se rechaza con un mensaje: hoy toda
-- tienda la tiene).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Una parte: una función nueva y reemplazos anclados en seis funciones que se
-- detienen sin tocar nada si el texto vivo cambió. Sin tablas, políticas ni `drop trigger`. Ya lleva `retail.` / search_path.
-- Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La pieza: una línea dañada de una venta anulada entra a Dañadas ----------
create or replace function retail.fn_anulacion_a_danadas(
  p_venta_item_id uuid,
  p_condicion text,
  p_motivo text,
  p_persona uuid
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_salida movimientos%rowtype;
  v_salidas integer;
  v_cuarentena uuid;
  v_mov_id uuid;
begin
  if p_condicion not in ('danada_reparacion', 'danada_donar', 'devolver_proveedor') then
    raise exception 'La condición % no es de una prenda dañada', p_condicion;
  end if;

  -- La misma revisión que la rama de «Vendible»: la línea sacó stock exactamente una vez.
  select count(*) into v_salidas from movimientos
   where venta_item_id = p_venta_item_id and tipo = 'salida' and motivo = 'venta';
  if v_salidas <> 1 then
    raise exception 'La línea % tiene % salidas de stock por venta registradas (se esperaba 1) — esta venta necesita revisarse a mano, no anularse',
      p_venta_item_id, v_salidas;
  end if;
  select * into v_salida from movimientos
   where venta_item_id = p_venta_item_id and tipo = 'salida' and motivo = 'venta';

  -- Vuelve a la tienda de donde salió, a su cuarentena (la misma de `aprobar_devolucion`).
  select id into v_cuarentena from sububicaciones where ubicacion_id = v_salida.ubicacion_id and tipo = 'cuarentena';
  if v_cuarentena is null then
    raise exception 'Esta tienda no tiene su lugar de Dañadas configurado: la prenda dañada no tiene dónde quedar'
      using hint = 'anulacion_sin_cuarentena';
  end if;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
    values (v_salida.variante_id, v_salida.ubicacion_id, v_cuarentena, 'entrada', v_salida.cantidad,
            'anulacion_venta', p_venta_item_id, p_persona)
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  -- La cola de Dañadas decide qué se hace con ella. El origen va en el motivo (ver el encabezado de la migración).
  insert into prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte)
    values (v_salida.variante_id, v_salida.ubicacion_id, v_salida.cantidad, v_mov_id,
            left('Venta anulada ' || case p_condicion
                                       when 'danada_reparacion' then 'para reparar'
                                       when 'danada_donar' then 'para donar'
                                       else 'para devolver al proveedor'
                                     end
                 || coalesce(': ' || nullif(btrim(p_motivo), ''), ''), 200));

  return v_mov_id;
end;
$$;

comment on function retail.fn_anulacion_a_danadas(uuid, text, text, uuid) is
  'Una línea dañada de una venta que se anula entra a la cuarentena de su tienda y a prendas_danadas (20261128161000). Solo la llama anular_venta.';

-- Solo la llama `anular_venta` (security definer): nadie la ejecuta desde la web.
revoke all on function retail.fn_anulacion_a_danadas(uuid, text, text, uuid) from public;
revoke all on function retail.fn_anulacion_a_danadas(uuid, text, text, uuid) from anon, authenticated;

-- ---------- Herramienta: reemplazo anclado (el mismo helper de 20261014165000) ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece.
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

-- ---------- 2. anular_venta: la rama de las tres condiciones dañadas ----------
select pg_temp.reemplazar_anclado(
  'retail.anular_venta(uuid, text, jsonb)',
  $v$      perform fn_aplicar_movimiento(v_mov_id);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)$v$,
  $n$      perform fn_aplicar_movimiento(v_mov_id);
    elsif v_condicion in ('danada_reparacion', 'danada_donar', 'devolver_proveedor')
          and v_venta_item.variante_id <> '22222222-2222-4222-8222-222222222222' then
      -- 20261128161000 (auditoría 2026-11-28, N.º 1): la prenda dañada vuelve a la tienda y entra a su cuarentena y a
      -- Dañadas, igual que en aprobar_devolucion (ADR-0071). Su movimiento queda en venta_anulacion_items.
      v_mov_id := retail.fn_anulacion_a_danadas(v_venta_item.id, v_condicion, p_motivo, v_persona);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)$n$
);

-- ---------- 3. fn_perdidas_hechos: la anulación dañada con movimiento se pierde al resolverse en Dañadas ----------
select pg_temp.reemplazar_anclado(
  'retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)',
  $v$     and ai.condicion <> 'vendible'
$v$,
  $n$     and ai.condicion <> 'vendible'
     -- 20261128161000: con movimiento, la prenda entró a Dañadas; su pérdida es la salida de la cuarentena.
     and ai.movimiento_id is null
$n$
);

-- ---------- 4. fn_asientos: con movimiento, el costo vuelve a la mercadería, como una devolución ----------
select pg_temp.reemplazar_anclado(
  'retail.fn_asientos(date, date, uuid)',
  $v$filter (where coalesce(ai.condicion, 'vendible') = 'vendible'), 0) as costo_ok,$v$,
  $n$filter (where coalesce(ai.condicion, 'vendible') = 'vendible'
                    -- 20261128161000: la dañada con movimiento entró a Dañadas; la merma se asienta al salir de ahí.
                    or ai.movimiento_id is not null), 0) as costo_ok,$n$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_asientos(date, date, uuid)',
  $v$filter (where coalesce(ai.condicion, 'vendible') <> 'vendible'), 0) as costo_mal$v$,
  $n$filter (where coalesce(ai.condicion, 'vendible') <> 'vendible' and ai.movimiento_id is null), 0) as costo_mal$n$
);

-- ---------- 5. fn_aliada_ventas: la misma regla para la prenda de una aliada (CLAURE) ----------
-- `fn_asientos_claure` saca del Diario de CAYLA lo que era de la aliada con estas dos cifras: `costo_ok` le quita a la 201 el costo
-- que la anulación devolvió a la mercadería y `costo_mal` le quita a la 6951 la merma. Si aquí quedara la regla vieja, la dañada con
-- movimiento volvería a la 201 de CAYLA (paso 4) sin salir de ella, y la 6951 quedaría con una merma negativa: el Diario de CAYLA
-- terminaría con mercadería ajena. Al resolverla en Dañadas su salida es de la aliada (`fn_movimiento_es_de_claure`) y CAYLA no la
-- asienta: lo de la aliada sigue fuera de CAYLA de punta a punta.
select pg_temp.reemplazar_anclado(
  'retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[])',
  $v$filter (where coalesce(ai.condicion, 'vendible') = 'vendible'), 0) as costo_ok,$v$,
  $n$filter (where coalesce(ai.condicion, 'vendible') = 'vendible'
                    -- 20261128161000: la dañada con movimiento volvió a la mercadería, como en fn_asientos.
                    or ai.movimiento_id is not null), 0) as costo_ok,$n$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[])',
  $v$filter (where coalesce(ai.condicion, 'vendible') <> 'vendible'), 0) as costo_mal$v$,
  $n$filter (where coalesce(ai.condicion, 'vendible') <> 'vendible' and ai.movimiento_id is null), 0) as costo_mal$n$
);

-- ---------- 6. Los dos rechazos de Dañadas nombran también la venta anulada ----------
-- «Me equivoqué de prenda» y «No estaba dañada» solo valen para lo reportado en la tienda; la dañada de una anulación tampoco se
-- corrige ahí, igual que la de una devolución. Cambia solo el texto: el hint (`danada_no_se_corrige`) sigue igual.
select pg_temp.reemplazar_anclado(
  'retail.corregir_prenda_danada(uuid, uuid, text, uuid)',
  $v$(llegó de una devolución, un cambio o una recepción)$v$,
  $n$(llegó de una devolución, un cambio, una venta anulada o una recepción)$n$
);
select pg_temp.reemplazar_anclado(
  'retail.devolver_danada_sin_dano(uuid, text, uuid)',
  $v$(llegó de una devolución, un cambio o una recepción)$v$,
  $n$(llegó de una devolución, un cambio, una venta anulada o una recepción)$n$
);

-- ---------- 7. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_anular text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
  v_perdidas text := pg_get_functiondef('retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)'::regprocedure);
  v_asientos text := pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure);
  v_aliada text := pg_get_functiondef('retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[])'::regprocedure);
  v_marca constant text := 'retail.fn_anulacion_a_danadas(v_venta_item.id, v_condicion, p_motivo, v_persona)';
begin
  if (length(v_anular) - length(replace(v_anular, v_marca, ''))) / length(v_marca) <> 1 then
    raise exception 'anular_venta: la rama de las dañadas tiene que quedar exactamente una vez';
  end if;
  -- Lo de antes sigue en su lugar: la rama de «Vendible» y la prenda sin registrar.
  if position($p$'anulacion_venta', v_venta_item.id, v_persona)$p$ in v_anular) = 0
     or position($p$v_condicion = 'vendible' and v_venta_item.variante_id = '22222222-2222-4222-8222-222222222222'$p$ in v_anular) = 0 then
    raise exception 'anular_venta: se perdió la rama de «Vendible» o la de la prenda sin registrar';
  end if;
  if position('and ai.movimiento_id is null' in v_perdidas) = 0 then
    raise exception 'fn_perdidas_hechos: falta la excepción de la anulación con movimiento';
  end if;
  if position('or ai.movimiento_id is not null), 0) as costo_ok' in v_asientos) = 0
     or position($p$<> 'vendible' and ai.movimiento_id is null), 0) as costo_mal$p$ in v_asientos) = 0 then
    raise exception 'fn_asientos: falta el costo de la anulación dañada con movimiento';
  end if;
  if position('or ai.movimiento_id is not null), 0) as costo_ok' in v_aliada) = 0
     or position($p$<> 'vendible' and ai.movimiento_id is null), 0) as costo_mal$p$ in v_aliada) = 0 then
    raise exception 'fn_aliada_ventas: falta el costo de la anulación dañada con movimiento (la prenda de una aliada volvería a la 201 de CAYLA)';
  end if;
  if position('una venta anulada o una recepción' in pg_get_functiondef('retail.corregir_prenda_danada(uuid, uuid, text, uuid)'::regprocedure)) = 0
     or position('una venta anulada o una recepción' in pg_get_functiondef('retail.devolver_danada_sin_dano(uuid, text, uuid)'::regprocedure)) = 0 then
    raise exception 'corregir_prenda_danada / devolver_danada_sin_dano: falta nombrar la venta anulada en su rechazo';
  end if;
end
$v$;
