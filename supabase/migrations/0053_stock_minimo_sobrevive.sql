-- ============================================================================
-- 0053 — El mínimo de una prenda sobrevive a `recalcular_stock`
--
-- QUÉ ARREGLA
--   `fijar_stock_minimo` (0016) crea una fila de `stock` con `cantidad = 0` solo
--   para guardar el mínimo de esa prenda en esa sede — no hay otro sitio donde
--   ponerlo. Y el `delete` final de `recalcular_stock` borra toda fila de `stock`
--   sin movimientos detrás. Una prenda a la que la Líder le fijó un mínimo pero
--   que todavía no se movió en esa sede cumple las dos cosas: existe solo por su
--   mínimo, y no tiene movimientos. Se borra, y el mínimo se pierde en silencio.
--
--   La forma en que duele es la peor posible: `recalcular_stock` es la RED DE
--   SEGURIDAD. Se corre justo cuando alguien sospecha que el inventario está mal.
--   O sea que la herramienta para arreglar destruye configuración, exactamente
--   cuando alguien la está usando para arreglar. Y no avisa: la alerta de
--   reposición simplemente deja de saltar, y nadie relaciona una cosa con la otra.
--
--   El borde estaba documentado y sin resolver desde `0044` (bloque 7), y la
--   cabecera de la propia función ya prometía lo contrario de lo que hacía:
--   «Conserva stock_minimo y contenedor_id, que no se derivan de movimientos».
--   Era verdad para las filas que sobrevivían y mentira para las que borraba.
--
-- LA DECISIÓN
--   `and s.stock_minimo is null` en el `delete` del piso. Se borran las filas
--   huérfanas de verdad —las que no tienen movimientos NI mínimo—, y se respeta
--   la que existe porque alguien la configuró a mano.
--
--   El criterio: `recalcular_stock` reconstruye CANTIDADES desde `movimientos`.
--   `stock_minimo` no se deriva de movimientos —lo dice la propia función— así
--   que no es suyo para borrarlo. Una función que limpia lo que no le toca no es
--   una red de seguridad, es una segunda fuente de pérdida de datos.
--
--   `stock_almacen` no lleva `stock_minimo` (verificado: la columna solo existe
--   en `stock`, desde `0015`), así que su `delete` queda igual.
--
-- REVERSIBLE: sí. Es un `create or replace` de una sola función, misma firma
-- (cero argumentos, así que no hay riesgo de sobrecarga — ADR-0009/0026). Para
-- volver atrás se re-pega el cuerpo de `0044`.
-- ============================================================================

create or replace function recalcular_stock()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ===== PISO: todo lo que NO está enrutado a un contenedor 'almacen' =====
  insert into stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo in ('salida', 'traslado') then m.created_at end as salida_en
    from movimientos m
    left join contenedores c on c.id = m.contenedor_id
    where coalesce(c.tipo, '') <> 'almacen'
    union all
    -- La otra pata del traslado: la sede que RECIBE. Un traslado nunca se
    -- enruta al almacén (fn_aplicar_movimiento lo fuerza), así que no se filtra.
    select variante_id, sede_destino_id, cantidad, created_at, null
    from movimientos
    where tipo = 'traslado' and sede_destino_id is not null
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;

  -- `ultima_venta` sí se deriva de movimientos (a diferencia de stock_minimo y
  -- contenedor_id), así que la red de seguridad también la reconstruye.
  update stock s set ultima_venta = sub.max_fecha
  from (
    select variante_id, sede_id, max(created_at) as max_fecha
    from movimientos where tipo = 'salida' and motivo = 'venta'
    group by variante_id, sede_id
  ) sub
  where s.variante_id = sub.variante_id and s.sede_id = sub.sede_id;

  delete from stock s
  where s.stock_minimo is null   -- ← 0053: una fila que existe solo por su mínimo no es huérfana
    and not exists (
      select 1 from movimientos m
      left join contenedores c on c.id = m.contenedor_id
      where m.variante_id = s.variante_id
        and (
          (m.sede_id = s.sede_id and coalesce(c.tipo, '') <> 'almacen')
          or (m.tipo = 'traslado' and m.sede_destino_id = s.sede_id)
        )
    );

  -- ===== ALMACÉN: espejo, solo lo enrutado a un contenedor 'almacen' =====
  insert into stock_almacen (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo = 'salida' then m.created_at end as salida_en
    from movimientos m
    join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo in ('entrada', 'salida', 'ajuste')
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;

  -- `stock_almacen` no tiene `stock_minimo` — la columna vive solo en `stock`
  -- (0015) — así que acá no hay nada que preservar.
  delete from stock_almacen sa
  where not exists (
    select 1 from movimientos m
    join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.variante_id = sa.variante_id and m.sede_id = sa.sede_id
  );
end;
$$;

comment on function recalcular_stock() is
  'Reconstruye `stock` y `stock_almacen` desde `movimientos` (la fuente de verdad). Neto por (variante, sede) antes de escribir (ADR-0020) y ruteo por contenedor tipo almacen. Conserva `stock_minimo` y `contenedor_id`, que no se derivan de movimientos — incluida la fila que existe SOLO para guardar un mínimo, que 0053 dejó de borrar.';
