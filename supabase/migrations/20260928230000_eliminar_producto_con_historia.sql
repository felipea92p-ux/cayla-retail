-- ============================================================================
-- 20260928230000_eliminar_producto_con_historia.sql — CAYLA V2 (Productos ▸ Eliminar; ADR-0252, sobre ADR-0218)
--
-- EL PROBLEMA. «Eliminar producto» (ADR-0218) solo borra lo que nunca se movió. Pero un producto de prueba casi siempre se
-- movió: el alta con stock (ADR-0212) ya escribe una entrada. El 2026-09-28 producción tenía 33 productos: 6 sin historia y
-- 22 cuya ÚNICA historia era de stock (carga inicial, ajustes, bajadas al piso, conteos). El único camino para esos era el
-- script de purga (ADR-0224), que corro yo con ensayo y «dale». Felipe (2026-09-28): «dame la opción para yo eliminar
-- directo, que las cuentas de Admin tengan este permiso», y eligió el alcance: **historia de stock sí, ventas no**.
--
-- LA DECISIÓN. La historia de un producto se parte en dos clases, y la línea es: ¿hay otra persona o dinero del otro lado?
--   · STOCK (se puede borrar con respaldo, solo un Admin): movimientos de stock, unidades en stock, líneas de conteo,
--     bajadas al piso, pedidos que no se pudieron atender, apartados ya cerrados sin dinero.
--     Nadie de afuera los vio: son la tienda contándose a sí misma.
--   · DOCUMENTO (no se borra desde la web, ni un Admin): líneas de venta, compras, producción, traslados, separaciones,
--     cambios, prendas dañadas, prendas por regularizar, pedidos a otra sede, apartados abiertos o con adelanto, lo que
--     llegó de un proveedor (un lote o un envío) y los costos registrados (la base solo los acepta con origen «compra» o
--     «producción»: siempre traen un documento detrás). Del otro lado hay una clienta, un proveedor, otra sede o una caja.
--     Para esos sigue el script (ADR-0224) o desactivar.
--
-- LAS PIEZAS.
--   1. `fn_producto_es_pieza_del_sistema` — la pieza «Monto manual» (antes escrita dentro de la función del Líder).
--   2. `fn_producto_historia` — la ÚNICA definición de historia; cada renglón dice si es `borrable` (stock) o no.
--   3. `fn_producto_se_puede_eliminar` — la del Líder (ADR-0218): misma firma, misma salida; lee la de arriba.
--   4. `fn_producto_como_eliminar` — lo que pregunta la ventana: nivel (libre / con_historia / con_documentos / sistema),
--      si ESTA cuenta puede, la razón, cuántas prendas y movimientos se van y quién cargó el producto y cuándo.
--   5. `eliminar_producto_con_historia` — solo Admin (`fn_es_admin()`). Todo o nada: respalda cada fila en
--      `respaldo_purgas.filas` (el mismo respaldo que la purga, y el mismo `restaurar-purga.sql` lo devuelve), apaga los
--      candados de historial SOLO dentro de su transacción, borra de hijos a padres, vuelve a encender cada candado en el
--      modo en que estaba (movimientos en ALWAYS) y deja rastro en `historial_producto_cambios` y en Actividad.
--   6. El esquema `respaldo_purgas` entra a las migraciones: hasta hoy lo creaba el script de purga (existe en producción
--      con 87 filas desde el 26-sep; aquí todo es `if not exists` y no toca esas filas).
--
-- POR QUÉ ASÍ Y NO UNA PUERTA EN EL CANDADO. El candado de `movimientos` (`fn_historial_es_inmutable`) no aprende ninguna
-- excepción: sigue diciendo «nunca». Solo el dueño de la tabla puede apagarlo, dentro de una transacción que o termina
-- entera o vuelve atrás sola (el DDL de Postgres es transaccional). Es el mismo mecanismo de la purga (ADR-0224) y de
-- `deshacer-90-dias.sql`: una sola manera de romper la promesa, y queda escrita en tres lugares.
--
-- CONCURRENCIA. Primero los candados de TABLA (`movimientos`, `movimientos_internos_intentos` y `bajada_piso_items`, en el
-- mismo orden en que «Reponer» o una bajada al piso los toca: el movimiento antes que su marca o su línea), después el
-- producto y sus variantes `for update`.
-- Una venta de OTRO producto que llega en ese instante espera unos milisegundos y sigue; una en curso hace esperar a esta
-- hasta 3 s y, si no termina, esta se rinde con «vuelve a intentar» sin tocar nada. Nunca se esperan en círculo.
--
-- ESTADOS IMPOSIBLES (Lamport). «Un movimiento, un conteo o un apartado de una variante que ya no existe»: las llaves
-- foráneas NO ACTION lo impiden; si una tabla nueva cita al producto y esta función no la conoce, el borrado falla entero y
-- lo dice (bloque `foreign_key_violation`). «El libro de movimientos descuadrado»: se borran JUNTOS todos los movimientos y
-- todas las filas de stock de esas variantes; el resto del libro no se toca. «Un candado que quedó apagado»: la función
-- comprueba antes de terminar que cada uno volvió a su modo; si no, todo se deshace.
--
-- PRODUCCIÓN. Solo funciones y un esquema/tabla de respaldo que nadie de la tienda usa: sin `alter` de tablas en uso ni
-- políticas (ADR-0195). UNA parte. Prefijo `retail.` escrito. Re-ejecutable. Pruebas: `pnpm pruebas:eliminar-producto`
-- (el Líder, sin cambios) y `pnpm pruebas:eliminar-producto-con-historia` (esto).
-- ============================================================================

set lock_timeout = '3s';

-- ==================== 0. El respaldo (antes lo creaba el script de purga; ADR-0224) ====================
create schema if not exists respaldo_purgas;
create table if not exists respaldo_purgas.filas (
  id bigserial primary key,
  purga text not null,
  tabla text not null,
  fila jsonb not null,
  respaldado_at timestamptz not null default now()
);
comment on table respaldo_purgas.filas is
  'Respaldo fila por fila de lo que se borró con una purga (scripts/purga, ADR-0224) o con Productos ▸ Eliminar con su historia (ADR-0252). «purga» es el nombre que la devuelve: scripts/purga/restaurar-purga.sql. No es historia del negocio: se borra a mano cuando Felipe confirma que no hace falta volver atrás.';
alter table respaldo_purgas.filas enable row level security;   -- sin políticas: nadie la lee por la API
revoke all on schema respaldo_purgas from public, anon, authenticated;
revoke all on respaldo_purgas.filas from public, anon, authenticated;
revoke all on sequence respaldo_purgas.filas_id_seq from public, anon, authenticated;

-- ==================== 1. La pieza «Monto manual» (una sola definición) ====================
-- El producto `11111111-…` y su variante `22222222-…` son el centinela del cobro «Monto manual» del punto de venta
-- (`registrar_venta` los cita por id fijo, 20260912234726). En producción no tienen historia, así que ninguna regla de
-- «historia» los protege: se protegen por nombre propio (ADR-0218, «el hallazgo que nadie pidió»).
create or replace function retail.fn_producto_es_pieza_del_sistema(p_producto_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select p_producto_id = '11111111-1111-4111-8111-111111111111'::uuid
      or exists (select 1 from retail.variantes
                  where id = '22222222-2222-4222-8222-222222222222'::uuid and producto_id = p_producto_id);
$$;

comment on function retail.fn_producto_es_pieza_del_sistema(uuid) is
  'Productos ▸ Eliminar: ¿es la pieza «Monto manual» del punto de venta? (registrar_venta la cita por id fijo). Nunca se elimina, tenga o no historia. Interna: solo la llaman las funciones de eliminar.';

revoke execute on function retail.fn_producto_es_pieza_del_sistema(uuid) from public, anon, authenticated;

-- ==================== 2. La historia de un producto (la ÚNICA definición) ====================
-- Cada renglón es una manera en que el producto ya se usó; solo se devuelven los que tienen algo (n > 0). No se cuenta lo
-- que nace con la ficha y se borra con ella: variantes, códigos de barras, etiquetas, fotos.
-- `borrable`: es historia de STOCK (la tienda contándose a sí misma) y un Admin puede borrarla con respaldo. Si es false
-- hay otra persona o dinero del otro lado (DOCUMENTO) y no se borra desde la web. Un renglón nuevo obliga a decidir cuál.
create or replace function retail.fn_producto_historia(p_producto_id uuid)
returns table (orden int, concepto text, n bigint, borrable boolean)
language sql
stable
set search_path = retail, public, extensions
as $$
  with vs as (select id from retail.variantes where producto_id = p_producto_id),
  ap as (
    -- Un apartado es DOCUMENTO si una clienta todavía lo espera, si dejó dinero, o si terminó en una venta o una separación.
    select (x.estado = 'abierto' or coalesce(x.adelanto_monto, 0) <> 0 or x.adelanto_caja_movimiento_id is not null
            or x.venta_id is not null or x.separacion_id is not null
            or exists (select 1 from retail.separacion_items s where s.apartado_id = x.id)
            or exists (select 1 from retail.separacion_items_retirados s where s.apartado_id = x.id)
            or exists (select 1 from retail.separacion_pedidos s where s.apartado_id = x.id)) as vivo
      from retail.apartados x where x.variante_id in (select id from vs)
  )
  select h.orden, h.concepto, h.n, h.borrable
    from (
      select 1 as orden, 'líneas de venta' as concepto, count(*) as n, false as borrable
        from retail.venta_items x where x.variante_id in (select id from vs)
      union all select 2, 'movimientos de stock', count(*), true
        from retail.movimientos x where x.variante_id in (select id from vs)
      union all select 3, 'unidades en stock', coalesce(sum(abs(x.cantidad)), 0), true
        from retail.stock x where x.variante_id in (select id from vs) and x.cantidad <> 0
      union all select 4, 'líneas de compra', count(*), false
        from retail.compra_items x where x.producto_id = p_producto_id or x.variante_id in (select id from vs)
      union all select 5, 'órdenes de producción', count(*), false
        from retail.producciones x where x.producto_id = p_producto_id
      union all select 6, 'líneas de traslado', count(*), false
        from retail.transferencia_items x where x.variante_id in (select id from vs)
      union all select 7, 'apartados ya cerrados', count(*) filter (where not ap.vivo), true
        from ap
      union all select 8, 'separaciones', count(*), false
        from retail.separacion_items x where x.variante_id in (select id from vs)
      union all select 9, 'líneas de conteo', count(*), true
        from retail.conteo_items x where x.variante_id in (select id from vs)
      union all select 10, 'cambios de prenda', count(*), false
        from retail.cambios x where x.variante_nueva_id in (select id from vs)
      union all select 11, 'prendas dañadas', count(*), false
        from retail.prendas_danadas x where x.variante_id in (select id from vs)
      union all select 12, 'prendas por regularizar', count(*), false
        from retail.prendas_por_regularizar x where x.variante_id in (select id from vs)
      union all select 13, 'bajadas al piso', count(*), true
        from retail.bajada_piso_items x where x.variante_id in (select id from vs)
      union all select 14, 'costos registrados', count(*), false
        from retail.costo_historial x where x.variante_id in (select id from vs)
      union all select 15, 'pedidos que no se pudieron atender', count(*), true
        from retail.pedidos_no_atendidos x where x.producto_id = p_producto_id
      union all select 16, 'pedidos a otra sede para apartar', count(*), false
        from retail.separacion_pedidos x where x.variante_id in (select id from vs)
      union all select 17, 'apartados abiertos o con adelanto', count(*) filter (where ap.vivo), false
        from ap
      -- Lo que llegó de un proveedor (Recibir: un lote; o un envío con prendas de regalo/sin comprobante): del otro lado
      -- hay un proveedor y, casi siempre, una factura por pagar.
      union all select 18, 'ingresos recibidos de un proveedor', count(*), false
        from retail.movimientos x
       where x.variante_id in (select id from vs)
         and (x.lote_id is not null or exists (select 1 from retail.envio_extras e where e.movimiento_id = x.id))
    ) h
   where h.n > 0;
$$;

comment on function retail.fn_producto_historia(uuid) is
  'Productos ▸ Eliminar: la ÚNICA definición de «historia» de un producto — un renglón (orden, concepto, n, borrable) por cada manera en que ya se usó, solo los que tienen algo. borrable = historia de stock que un Admin puede borrar con respaldo (ADR-0252); false = hay una clienta, un proveedor, otra sede o dinero del otro lado. Interna: no se llama desde la web.';

revoke execute on function retail.fn_producto_historia(uuid) from public, anon, authenticated;

-- ==================== 3. ¿Se puede eliminar? (el Líder, ADR-0218; misma firma y salida) ====================
create or replace function retail.fn_producto_se_puede_eliminar(p_producto_id uuid)
returns table (puede boolean, razon text)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_historia text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';
  end if;

  if retail.fn_producto_es_pieza_del_sistema(p_producto_id) then
    return query select false, 'es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita'::text;
    return;
  end if;

  select string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden)
    into v_historia
    from retail.fn_producto_historia(p_producto_id) h;

  if v_historia is null then
    return query select true, null::text;
  else
    return query select false, 'tiene ' || v_historia;
  end if;
end;
$$;

comment on function retail.fn_producto_se_puede_eliminar(uuid) is
  'Productos ▸ Eliminar: ¿se puede sin historia? (puede, razon). Solo Líder (un Admin es un Líder). No se puede si el producto ya se usó (fn_producto_historia) o si es la pieza «Monto manual» del punto de venta. La razón viene lista para mostrar. La usa eliminar_producto.';

revoke execute on function retail.fn_producto_se_puede_eliminar(uuid) from public, anon;
grant execute on function retail.fn_producto_se_puede_eliminar(uuid) to authenticated;

-- ==================== 4. Lo que pregunta la ventana ====================
-- nivel: 'libre' (sin historia: Líder o Admin, `eliminar_producto`) · 'con_historia' (solo stock: solo Admin,
-- `eliminar_producto_con_historia`) · 'con_documentos' (nadie desde la web) · 'sistema' (nunca).
-- puedes: si ESTA cuenta puede hacerlo (la pantalla no adivina el permiso). prendas/movimientos: lo que se va.
-- cargado_por/cargado_el: quién hizo el primer movimiento y cuándo — para que el Admin vea si está por borrar el trabajo
-- de otra persona (el 28-sep, 21 de los 26 productos con historia los había cargado el equipo de TRU, no Felipe).
create or replace function retail.fn_producto_como_eliminar(p_producto_id uuid)
returns table (nivel text, puedes boolean, razon text, prendas bigint, movimientos bigint, cargado_por text, cargado_el timestamptz)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_todo text;
  v_docs text;
  v_prendas bigint;
  v_movs bigint;
  v_quien text;
  v_cuando timestamptz;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';
  end if;

  if retail.fn_producto_es_pieza_del_sistema(p_producto_id) then
    return query select 'sistema'::text, false,
      'es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita'::text, 0::bigint, 0::bigint, null::text, null::timestamptz;
    return;
  end if;

  select string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden),
         string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden) filter (where not h.borrable),
         coalesce(max(h.n) filter (where h.orden = 3), 0),
         coalesce(max(h.n) filter (where h.orden = 2), 0)
    into v_todo, v_docs, v_prendas, v_movs
    from retail.fn_producto_historia(p_producto_id) h;

  select nullif(btrim(split_part(pe.nombres, ' ', 1) || ' ' || split_part(coalesce(pe.apellidos, ''), ' ', 1)), ''), m.created_at
    into v_quien, v_cuando
    from retail.movimientos m
    join retail.variantes v on v.id = m.variante_id
    left join public.personas pe on pe.id = m.usuario_id
   where v.producto_id = p_producto_id
   order by m.created_at, m.id
   limit 1;

  if v_todo is null then
    return query select 'libre'::text, true, null::text, 0::bigint, 0::bigint, v_quien, v_cuando;
  elsif v_docs is not null then
    return query select 'con_documentos'::text, false, 'tiene ' || v_docs, v_prendas, v_movs, v_quien, v_cuando;
  else
    return query select 'con_historia'::text, retail.fn_es_admin(), 'tiene ' || v_todo, v_prendas, v_movs, v_quien, v_cuando;
  end if;
end;
$$;

comment on function retail.fn_producto_como_eliminar(uuid) is
  'Productos ▸ Eliminar (ventana): (nivel, puedes, razon, prendas, movimientos, cargado_por, cargado_el). nivel libre = sin historia (Líder o Admin); con_historia = solo historia de stock (solo Admin, eliminar_producto_con_historia); con_documentos = ventas, compras, traslados, separaciones… (nadie desde la web); sistema = pieza «Monto manual». Solo Líder. ADR-0252.';

revoke execute on function retail.fn_producto_como_eliminar(uuid) from public, anon;
grant execute on function retail.fn_producto_como_eliminar(uuid) to authenticated;

-- ==================== 5. Eliminar con su historia de stock (solo Admin; todo o nada) ====================
create or replace function retail.eliminar_producto_con_historia(p_producto_id uuid)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  -- Los candados de historial que hay que apagar para borrar (tabla, disparador), en el orden en que se toman las tablas.
  c_candados constant text[] := array['movimientos', 'movimientos_inmutables',
                                      'movimientos_internos_intentos', 'movimientos_internos_intentos_inmutables',
                                      'bajada_piso_items', 'bajada_piso_items_inmutables'];
  v_modos "char"[] := '{}';
  v_modo "char";
  v_producto retail.productos;
  v_actor uuid;
  v_vs uuid[];
  v_movs uuid[];
  v_docs text;
  v_prendas bigint;
  v_respaldo text;
  i int;
begin
  -- Primero el permiso, antes de mirar si la fila existe (mismo orden que eliminar_producto).
  if not retail.fn_es_admin() then
    raise exception 'Solo una cuenta Admin puede eliminar un producto con su historia.' using errcode = '42501';
  end if;
  -- El responsable del combo (ADR-0161/0162): un Admin firma a su nombre.
  v_actor := retail.fn_actor_persona_id(true);

  -- Si la tienda está registrando algo justo ahora, se espera como máximo 3 s y se avisa: no se hace fila detrás de ella.
  perform set_config('lock_timeout', '3s', true);

  begin
    -- Candados de TABLA primero (ver CONCURRENCIA en el encabezado), después las filas del producto.
    lock table retail.movimientos, retail.movimientos_internos_intentos, retail.bajada_piso_items in share row exclusive mode;

    select * into v_producto from retail.productos where id = p_producto_id for update;
    if v_producto.id is null then
      raise exception 'Ese producto ya no existe. Recarga la pantalla.' using hint = 'producto_invalido';
    end if;
    if retail.fn_producto_es_pieza_del_sistema(p_producto_id) then
      raise exception 'No se puede eliminar «%»: es una pieza del sistema (el cobro de «Monto manual» del punto de venta la necesita).',
        v_producto.referencia using hint = 'producto_con_documentos';
    end if;
    select coalesce(array_agg(x.id), '{}') into v_vs
      from (select id from retail.variantes where producto_id = p_producto_id order by id for update) x;

    -- La historia se cuenta DESPUÉS de bloquear: lo que llegó antes ya se ve; lo que llegue después espera o falla.
    select string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden) filter (where not h.borrable),
           coalesce(max(h.n) filter (where h.orden = 3), 0)
      into v_docs, v_prendas
      from retail.fn_producto_historia(p_producto_id) h;
    if v_docs is not null then
      raise exception 'No se puede eliminar «%»: tiene %. Del otro lado hay una clienta, un proveedor, otra sede o dinero, y eso no se borra desde aquí. Desactívalo: queda como descontinuado y su historia se conserva.',
        v_producto.referencia, v_docs using hint = 'producto_con_documentos';
    end if;

    select coalesce(array_agg(id), '{}') into v_movs from retail.movimientos where variante_id = any (v_vs);

    -- ---- Respaldo: cada fila, tal cual, antes de tocarla (scripts/purga/restaurar-purga.sql la devuelve) ----
    v_respaldo := 'eliminado ' || coalesce(v_producto.codigo, v_producto.id::text) || ' '
               || to_char(clock_timestamp() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI:SS');
    insert into respaldo_purgas.filas (purga, tabla, fila)
      select v_respaldo, 'productos', to_jsonb(t) from retail.productos t where t.id = p_producto_id
      union all select v_respaldo, 'variantes', to_jsonb(t) from retail.variantes t where t.id = any (v_vs)
      union all select v_respaldo, 'codigos_barras', to_jsonb(t) from retail.codigos_barras t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'variante_etiquetas', to_jsonb(t) from retail.variante_etiquetas t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'producto_fotos', to_jsonb(t) from retail.producto_fotos t where t.producto_id = p_producto_id
      union all select v_respaldo, 'producto_color_temporadas', to_jsonb(t) from retail.producto_color_temporadas t where t.producto_id = p_producto_id
      union all select v_respaldo, 'stock', to_jsonb(t) from retail.stock t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'movimientos', to_jsonb(t) from retail.movimientos t where t.id = any (v_movs)
      union all select v_respaldo, 'conteo_items', to_jsonb(t) from retail.conteo_items t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'bajada_piso_items', to_jsonb(t) from retail.bajada_piso_items t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'apartados', to_jsonb(t) from retail.apartados t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'pedidos_no_atendidos', to_jsonb(t) from retail.pedidos_no_atendidos t where t.producto_id = p_producto_id
      union all select v_respaldo, 'movimientos_internos_intentos', to_jsonb(t) from retail.movimientos_internos_intentos t where t.movimiento_id = any (v_movs);

    begin
      -- ---- Candados de historial: se apagan SOLO dentro de esta transacción (si algo falla, vuelven solos) ----
      for i in 1 .. array_length(c_candados, 1) / 2 loop
        select t.tgenabled into v_modo from pg_trigger t
         where t.tgrelid = ('retail.' || c_candados[2 * i - 1])::regclass and t.tgname = c_candados[2 * i];
        if v_modo is null then
          raise exception 'Falta el candado de historial % en retail.%: no se borra nada hasta revisar la base.', c_candados[2 * i], c_candados[2 * i - 1];
        end if;
        v_modos := v_modos || v_modo;
        execute format('alter table retail.%I disable trigger %I', c_candados[2 * i - 1], c_candados[2 * i]);
      end loop;

      -- ---- De hijos a padres ----
      delete from retail.bajada_piso_items where variante_id = any (v_vs);
      delete from retail.apartados where variante_id = any (v_vs);
      delete from retail.movimientos_internos_intentos where movimiento_id = any (v_movs);
      -- Una línea de conteo y su ajuste se citan entre sí (conteo_items.movimiento_id ↔ movimientos.conteo_item_id): van en
      -- UNA sentencia, y las llaves se revisan al final de ella, cuando ya no queda ninguna de las dos.
      with lineas as (delete from retail.conteo_items where variante_id = any (v_vs) returning 1)
      delete from retail.movimientos where id = any (v_movs);
      delete from retail.pedidos_no_atendidos where producto_id = p_producto_id;
      delete from retail.stock where variante_id = any (v_vs);
      delete from retail.codigos_barras where variante_id = any (v_vs);
      delete from retail.producto_fotos where producto_id = p_producto_id;
      delete from retail.variantes where producto_id = p_producto_id;   -- arrastra variante_etiquetas (on delete cascade)
      delete from retail.productos where id = p_producto_id;            -- arrastra producto_color_temporadas (cascade)

      -- ---- Cada candado vuelve al modo en que estaba (movimientos: ALWAYS, D-22) ----
      for i in 1 .. array_length(c_candados, 1) / 2 loop
        execute format('alter table retail.%I enable %s trigger %I', c_candados[2 * i - 1],
                       case v_modos[i] when 'A' then 'always' when 'R' then 'replica' else '' end, c_candados[2 * i]);
        if v_modos[i] = 'D' then
          execute format('alter table retail.%I disable trigger %I', c_candados[2 * i - 1], c_candados[2 * i]);
        end if;
      end loop;
      for i in 1 .. array_length(c_candados, 1) / 2 loop
        if (select t.tgenabled from pg_trigger t
             where t.tgrelid = ('retail.' || c_candados[2 * i - 1])::regclass and t.tgname = c_candados[2 * i]) is distinct from v_modos[i] then
          raise exception 'El candado % no volvió a su modo: no se guarda nada.', c_candados[2 * i];
        end if;
      end loop;
    exception when foreign_key_violation then
      -- Red de seguridad: otra tabla cita al producto, sus variantes o sus movimientos y fn_producto_historia no la conoce.
      raise exception 'No se puede eliminar «%»: otra parte del sistema todavía lo usa. Desactívalo en vez de eliminarlo.',
        v_producto.referencia using hint = 'producto_con_documentos';
    end;
  exception when lock_not_available then
    raise exception 'En este momento alguien está registrando un movimiento o editando este producto. Vuelve a intentar en unos segundos.'
      using hint = 'reintentar';
  end;

  -- ---- El rastro: quién, cómo se llamaba y dónde quedó el respaldo (append-only) ----
  insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('producto', p_producto_id, 'eliminado', v_producto.referencia || coalesce(' · ' || v_producto.codigo, ''),
          'con su historia · respaldo «' || v_respaldo || '»', v_actor);

  perform retail.fn_actividad_anotar(
    'productos', 'producto_eliminado',
    format('eliminó «%s»%s con su historia: %s prenda%s en stock y %s movimiento%s',
           v_producto.referencia, coalesce(' (' || v_producto.codigo || ')', ''),
           v_prendas, case when v_prendas = 1 then '' else 's' end,
           cardinality(v_movs), case when cardinality(v_movs) = 1 then '' else 's' end),
    v_actor, null, null, null, 'productos', p_producto_id::text, now(),
    jsonb_build_object('respaldo', v_respaldo, 'codigo', v_producto.codigo, 'prendas', v_prendas, 'movimientos', cardinality(v_movs)),
    'vivo');

  return v_producto.referencia;
end;
$$;

comment on function retail.eliminar_producto_con_historia(uuid) is
  'Productos ▸ Eliminar con su historia (ADR-0252): solo Admin. Borra, todo o nada, un producto cuya historia es solo de stock (movimientos, conteos, bajadas al piso, pedidos no atendidos, apartados cerrados sin dinero) junto con su ficha. Con ventas, compras, producción, costos, traslados, separaciones o lo recibido de un proveedor se rechaza. Respalda cada fila en respaldo_purgas.filas (scripts/purga/restaurar-purga.sql la devuelve), deja rastro en historial_producto_cambios y en Actividad, y deja los candados de historial como estaban. Devuelve la referencia.';

revoke execute on function retail.eliminar_producto_con_historia(uuid) from public, anon;
grant execute on function retail.eliminar_producto_con_historia(uuid) to authenticated;
