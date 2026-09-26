-- ============================================================================
-- 20260927173000_movimientos_saldo_por_prenda.sql — CAYLA V2 · ADR-0234, «Actualización 2026-09-26 (saldo)»
-- Movimientos dice, en cada prenda, cuántas quedaron en la tienda justo después de ese movimiento.
--
-- EL PROBLEMA PRIMERO. Una integrante que ve «Venta · −1» o «Ajuste · Conteo · −5» no sabe si la tienda se quedó con
-- 12 o con ninguna: el detalle decía solo el stock de HOY, que después de otros movimientos ya no es el de ese momento.
-- Felipe eligió (2026-09-26, opción A) mostrar lo que queda EN LA TIENDA —piso + almacén, sin la cuarentena—, el mismo
-- número que Existencias llama «total».
--
-- QUÉ HACE. `retail.fn_movimientos_saldos(p_ubicacion_id, p_movimiento_ids)` devuelve, por cada movimiento pedido que
-- tocó esa sede, `quedan` = unidades de esa prenda en la sede al terminar la operación de ese movimiento. NO calcula nada propio: lee el saldo
-- de `fn_ledger_puntos` (bucket `total`), la fuente única del ledger (ADR-0202), que parte del stock real y resta hacia
-- atrás. Así el saldo de Movimientos, la línea de tiempo del producto y Análisis nunca pueden dar dos números distintos.
--   · Un movimiento que no cambia el total (una bajada al piso, un retiro) no tiene punto propio en el ledger: devuelve
--     el saldo vigente en ese momento (el último punto anterior, o el de partida).
--   · Lo que se guardó de una sola vez comparte `created_at` (una operación: la carga al piso escribe la entrada y su
--     bajada en el mismo instante). Dentro de ese instante el ledger ordena por `id`, que es al azar: un saldo
--     «a mitad de la operación» sería un número que nunca existió para nadie. Por eso cada movimiento dice lo que quedó
--     al TERMINAR su operación: todos los de una misma prenda en el mismo instante dicen el mismo saldo.
--
-- CONTRATO. Promete: una fila por movimiento pedido que sea de la sede (origen o destino); los de otra sede o
-- inexistentes no vuelven. Asume: quien pregunta puede operar la sede (`fn_puede_operar_ubicacion`, la misma regla que
-- `fn_movimientos`) y pide una página (tope 1000 ids). Solo lee.
--
-- CUÁNTO CUESTA. Una página trae hasta ~200 filas. `fn_ledger_puntos` recorre solo las prendas de la página desde el
-- movimiento más viejo de ella (índices `movimientos_variante_ubicacion_idx` y `movimientos_ubicacion_fecha_idx`): con
-- 3 tiendas × ~200 movimientos al día, una página de hoy lee cientos de filas; una de hace 90 días, decenas de miles
-- en el peor caso. Sobra para una lectura por página.
--
-- CÓMO SE PEGA: tal cual en el SQL Editor de producción (ya trae `retail.`). Crea una función nueva: sin `alter` de
-- tablas en uso ni políticas. Se puede pegar dos veces. Puede ir antes o después de la web: la web que no la llama no
-- cambia, y la que la llama sin tenerla sigue sin el saldo (principio 9).
--
-- SE ROMPE SI: `fn_ledger_puntos` cambia de firma o deja de devolver el bucket `total` (la prueba
-- `pnpm pruebas:movimientos-saldo` lo detecta), o una fila de Movimientos pasa a mostrar movimientos de otra sede.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_movimientos_saldos(p_ubicacion_id uuid, p_movimiento_ids uuid[])
returns table (movimiento_id uuid, quedan integer)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_desde timestamptz;
  v_variantes uuid[];
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la ubicación cuyos movimientos quieres ver';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los movimientos de esa ubicación' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_movimiento_ids), 0) = 0 then
    return;
  end if;
  if cardinality(p_movimiento_ids) > 1000 then
    raise exception 'Pide el saldo de una página a la vez (máximo 1000 movimientos)';
  end if;

  -- Solo los movimientos de ESTA sede: un id de otra tienda no devuelve nada (ni siquiera que existe).
  select min(m.created_at), array_agg(distinct m.variante_id)
    into v_desde, v_variantes
    from movimientos m
   where m.id = any(p_movimiento_ids)
     and (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id);
  if v_desde is null then
    return;
  end if;

  return query
  with pedidos as (
    select m.id, m.variante_id, m.created_at
      from movimientos m
     where m.id = any(p_movimiento_ids)
       and (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
  ),
  puntos as (
    select lp.variante_id, lp.ts, lp.ord, lp.oid, lp.nivel
      from fn_ledger_puntos(p_ubicacion_id, v_desde, v_variantes) lp
     where lp.bucket = 'total'
  )
  select p.id,
         (select pt.nivel
            from puntos pt
           where pt.variante_id = p.variante_id
             -- El punto de partida (ord 0) siempre vale; de los demás, el último de su instante o de antes (el del mayor
             -- `oid` en ese instante es el acumulado de toda la operación, por el orden del ledger).
             and (pt.ord = 0 or pt.ts <= p.created_at)
           order by pt.ord desc, pt.ts desc, pt.oid desc
           limit 1)::integer
    from pedidos p;
end;
$$;

comment on function retail.fn_movimientos_saldos(uuid, uuid[]) is
  'ADR-0234 (saldo): por cada movimiento de la sede, cuántas unidades de esa prenda quedaron en la sede (piso + almacén, sin cuarentena) al terminar su operación. Lee fn_ledger_puntos (bucket total, ADR-0202); no calcula por su cuenta.';

revoke all on function retail.fn_movimientos_saldos(uuid, uuid[]) from public, anon;
grant execute on function retail.fn_movimientos_saldos(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
