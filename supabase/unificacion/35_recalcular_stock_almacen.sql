-- ============================================================================
-- 35 — `recalcular_stock()` vuelve a saber que el almacén existe
-- Aplicado en producción (cayla-DYNAMIC) el 2026-09-10. Ver ADR-0031.
--
-- QUÉ PROMETE
--   `recalcular_stock()` es la "red de seguridad" (ARQUITECTURA.md §4.2):
--   reconstruye `stock`/`stock_almacen` completos desde `movimientos` cuando
--   se sospecha que el snapshot derivado se desincronizó. La versión vigente
--   en producción (la del ADR-0020, "el neto en una sola pasada") arregló el
--   bug que le impedía correr, pero se escribió ANTES de que existiera el
--   almacén interno — no conoce `contenedores`/`stock_almacen` en absoluto.
--   Si alguien la invoca hoy, mezclaría de vuelta a `stock` (piso) cualquier
--   movimiento enrutado al almacén, duplicando mercadería que en realidad
--   sigue guardada ahí. Producción ya tiene 4 contenedores tipo 'almacen'
--   reales (uno por sede) y 9 movimientos ya enrutados a ellos — no es un
--   caso hipotético.
--
--   Esta versión: (1) separa piso de almacén igual que ya lo hace
--   `fn_aplicar_movimiento` en cada venta/recepción real (verificado línea
--   por línea contra su cuerpo en producción, no asumido); (2) no borra una
--   fila de `stock` que solo existe para guardar un `stock_minimo`
--   configurado sin movimientos todavía (borde heredado de ADR-0020,
--   documentado pero nunca cerrado); (3) restaura el candado de "solo un
--   Líder puede correrla" (`retail.es_lider()`), perdido en algún punto
--   entre el ADR-0020 original y hoy — verificado que hoy no lo tenía; (4)
--   quita el `EXECUTE` que tenía de más para `PUBLIC` (y por herencia
--   `anon`), mismo patrón de ADR-0011/ADR-0032.
--
-- QUÉ ASUME
--   Que la regla de "es almacén" es exactamente la que usa
--   `fn_aplicar_movimiento` hoy en producción: un movimiento cuenta como
--   almacén si `contenedor_id` apunta a un contenedor `tipo='almacen'` — CON
--   UNA EXCEPCIÓN: un `tipo='traslado'` NUNCA cuenta como almacén, sin
--   importar su `contenedor_id` (`fn_aplicar_movimiento` fuerza
--   `v_es_almacen := false` incondicionalmente para traslados). Esa
--   excepción existe porque un traslado con contenedor de almacén en la sede
--   destino es la implementación real de "devolver a almacén" — hoy una
--   rama muerta en el frontend (`InventarioAgrupado.tsx` fuerza
--   `contenedoresAlmacen: []`) pero aceptada por el RPC, y por lo tanto por
--   esta función también.
--
-- POR QUÉ SE ELIGIÓ ASÍ
--   DECIDÍ: portar el diseño de piso/almacén ya escrito en
--   `supabase/migrations/0044_almacen_interno.sql` (bloque 7, ya en
--   `origin/main` pero nunca pegado a producción con este alcance) en vez de
--   reescribirlo desde cero — es el mismo razonamiento, ya revisado una vez.
--   DESCARTÉ la primera versión de este script (sin la excepción de
--   traslado): una revisión adversarial encontró que, tal como estaba,
--   restaría la salida de un traslado-a-almacén de la sede origen pero
--   NUNCA sumaría esa cantidad en ningún lado (ni piso ni almacén) — inventario
--   que desaparece, no que se duplica, pero un estado imposible igual. Se
--   corrigió antes de aplicar, no después.
--   DESCARTÉ dejar `stock_minimo` sin resolver "porque ya estaba anotado
--   así" — es un `and s.stock_minimo is null` de una línea, y la función ya
--   se estaba reescribiendo por otro motivo; posponerlo otra vez no bajaba
--   ningún riesgo.
--   SE ROMPE SI: se agrega un tercer tipo de contenedor (hoy solo existe
--   'almacen' como valor especial) sin revisar esta función — el
--   `coalesce(c.tipo, '') <> 'almacen'` asume que "no almacén" es la
--   respuesta correcta para cualquier otro valor, incluido uno nuevo.
--
-- CÓMO SE REVIERTE
--   Recrear la función con el cuerpo de ADR-0020 (sin conciencia de
--   almacén, sin candado de Líder) — no se recomienda: el bug de duplicar
--   almacén-hacia-piso volvería a estar vivo. Si hace falta revertir por
--   algún efecto no previsto, mejor congelar la función (revocar EXECUTE de
--   todos, incluido `authenticated`) hasta decidir con Felipe, en vez de
--   volver a la versión ciega al almacén.
--
-- VERIFICADO ANTES Y DESPUÉS DE APLICAR, sin invocar la función (requiere
-- sesión de un Líder real, no disponible desde este script): se comparó el
-- resultado que esta lógica produciría —corriendo las mismas consultas como
-- `select` de solo lectura— contra el `stock`/`stock_almacen` real de hoy.
-- Coincidencia exacta en almacén (4/4 filas) y en 8 de 10 filas de piso. Las
-- 2 discrepancias (una diferencia de exactamente la cantidad "bajada a
-- piso" de cada una) resultaron ser stock YA desactualizado desde antes de
-- este cambio —arrastrado de cuando `fn_aplicar_movimiento` todavía no
-- separaba almacén de piso— y se corrigieron aparte, a mano, con la
-- confirmación explícita de Felipe (dos `update` puntuales, sin tocar
-- `movimientos`).
-- ============================================================================

create or replace function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_piso integer;
  v_almacen integer;
begin
  if retail.es_lider() is not true then
    raise exception 'Solo un Líder puede recalcular el stock';
  end if;

  -- ===== PISO: todo lo que NO está enrutado a un contenedor 'almacen' =====
  -- Excepción: un traslado SIEMPRE cuenta como piso en ambos lados, aunque
  -- traiga un contenedor_id de almacén (ver "QUÉ ASUME" arriba).
  insert into retail.stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo in ('salida', 'traslado') then m.created_at end as salida_en
    from retail.movimientos m
    left join retail.contenedores c on c.id = m.contenedor_id
    where m.tipo = 'traslado' or coalesce(c.tipo, '') <> 'almacen'
    union all
    select variante_id, sede_destino_id, cantidad, created_at, null
    from retail.movimientos
    where tipo = 'traslado' and sede_destino_id is not null
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;
  get diagnostics v_piso = row_count;

  update retail.stock s set ultima_venta = sub.max_fecha
  from (
    select variante_id, sede_id, max(created_at) as max_fecha
    from retail.movimientos where tipo = 'salida' and motivo = 'venta'
    group by variante_id, sede_id
  ) sub
  where s.variante_id = sub.variante_id and s.sede_id = sub.sede_id;

  -- Borde heredado de ADR-0020, cerrado acá: no borrar una fila que solo
  -- existe para guardar un stock_minimo configurado (fijar_stock_minimo crea
  -- la fila con cantidad 0 antes de que exista ningún movimiento real).
  delete from retail.stock s
  where s.stock_minimo is null
    and not exists (
      select 1 from retail.movimientos m
      left join retail.contenedores c on c.id = m.contenedor_id
      where m.variante_id = s.variante_id
        and (
          (m.sede_id = s.sede_id and (m.tipo = 'traslado' or coalesce(c.tipo, '') <> 'almacen'))
          or (m.tipo = 'traslado' and m.sede_destino_id = s.sede_id)
        )
    );

  -- ===== ALMACÉN: espejo, solo lo enrutado a un contenedor 'almacen' =====
  -- (un traslado nunca llega aquí — ver la excepción de arriba)
  insert into retail.stock_almacen (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo = 'salida' then m.created_at end as salida_en
    from retail.movimientos m
    join retail.contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo in ('entrada', 'salida', 'ajuste')
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;
  get diagnostics v_almacen = row_count;

  delete from retail.stock_almacen sa
  where not exists (
    select 1 from retail.movimientos m
    join retail.contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.variante_id = sa.variante_id and m.sede_id = sa.sede_id
  );

  raise notice 'recalcular_stock: % filas de piso, % filas de almacén recalculadas.', v_piso, v_almacen;
end;
$$;

revoke all on function retail.recalcular_stock() from public;
grant execute on function retail.recalcular_stock() to authenticated, service_role;

do $$
declare
  v_prosrc text;
  v_anon_puede boolean; v_auth_puede boolean;
begin
  select prosrc into v_prosrc from pg_proc where proname='recalcular_stock' and pronamespace='retail'::regnamespace;
  if position('stock_almacen' in v_prosrc) = 0 then
    raise exception 'FALLO: la funcion nueva no menciona stock_almacen -- no se reemplazo bien';
  end if;
  if position('es_lider' in v_prosrc) = 0 then
    raise exception 'FALLO: falta el candado de Lider';
  end if;
  if position('stock_minimo is null' in v_prosrc) = 0 then
    raise exception 'FALLO: falta el guard de stock_minimo en el delete';
  end if;
  select has_function_privilege('anon','retail.recalcular_stock()','EXECUTE') into v_anon_puede;
  select has_function_privilege('authenticated','retail.recalcular_stock()','EXECUTE') into v_auth_puede;
  if v_anon_puede then raise exception 'FALLO: anon quedo con EXECUTE'; end if;
  if not v_auth_puede then raise exception 'FALLO: authenticated sin EXECUTE'; end if;
  raise notice 'OK: recalcular_stock reemplazada con conciencia de almacen, candado de Lider, guard de stock_minimo, sin EXECUTE para PUBLIC/anon.';
end $$;

-- Corrección puntual de datos, aparte de la función (a pedido explícito de
-- Felipe, verificado antes de aplicar): 2 filas de `stock` arrastraban un
-- doble conteo de antes de que `fn_aplicar_movimiento` supiera de almacén.
-- Se deja aquí, no en un archivo de datos aparte, para que quede junto a la
-- función que las habría corregido de todos modos la próxima vez que
-- alguien la invoque -- esto solo adelanta el reloj.
update retail.stock set cantidad = 49, updated_at = now()
  where variante_id = '6e9fe114-59a9-4be9-bbdd-203d7041043c'
    and sede_id = '12c9069d-6d0b-4506-aa95-845af38d4780'
    and cantidad = 99;

update retail.stock set cantidad = 58, updated_at = now()
  where variante_id = '81e6e20e-4cbb-4df7-b479-81ac9d9b1d2a'
    and sede_id = '12c9069d-6d0b-4506-aa95-845af38d4780'
    and cantidad = 98;
