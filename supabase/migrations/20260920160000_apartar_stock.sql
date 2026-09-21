-- ============================================================================
-- 20260920160000 — Apartar stock: reservar una prenda para una clienta sin restarla
-- del conteo físico (ADR-0141). FASE 1: reserva física, con clienta, contacto y fecha
-- límite. La FASE 2 (adelanto ligado a Caja) reutiliza esta misma tabla.
--
-- EL PROBLEMA
--   Una prenda "apartada" para una clienta (pedida por WhatsApp, o dejada a medias)
--   sigue contando como disponible: cualquier otra caja puede vendérsela. Y una
--   reserva sin dueño ni fecha (la clienta que "dijo que volvía en la tarde") bloquea
--   la prenda para siempre sin que nadie lo note.
--
-- QUÉ HACE
--   1. `stock.cantidad_apartada`: segundo número sobre la MISMA fila de stock.
--      disponible = cantidad - cantidad_apartada. El conteo físico sigue leyendo
--      `cantidad` (la prenda apartada sigue físicamente en la tienda).
--   2. Dos tipos de movimiento: `apartado` y `liberacion_apartado`.
--   3. `fn_aplicar_movimiento`: `salida`, `traslado` y `ajuste` validan contra lo
--      DISPONIBLE, con mensaje de negocio (antes: error crudo de constraint). Sin
--      esto el contador sería decorativo: una venta normal se llevaría lo apartado.
--   4. `recalcular_stock()` reproduce los apartados desde `movimientos` (principio 4), y se cierra a
--      anon/authenticated (en producción ya lo estaba; el repo no lo decía).
--   5. `apartados`: una fila por reserva — clienta, contacto, fecha límite, quién y
--      cuándo. Ligada a los movimientos que la crearon y la cerraron.
--   6. RPC `apartar_stock` y `liberar_apartado`: las ÚNICAS puertas al contador.
--      `listar_apartados`: la lectura para la pantalla, con `puede_liberar` YA calculado en
--      SQL — la regla «solo quien apartó o una líder» vive en un solo lugar, no duplicada en la app.
--   7. `fn_verificar_apartados()`: diagnóstico — filas donde el contador no cuadra.
--
-- POR QUÉ UNA TABLA `apartados` SI LA CANTIDAD YA VIVE EN `stock`
--   `movimientos` sigue siendo la fuente de verdad del efecto en stock; `apartados`
--   es el DOCUMENTO de negocio (como `transferencias` lo es de un traslado) y guarda
--   lo que un contador no puede: para quién, hasta cuándo, quién lo hizo. El
--   invariante "contador de stock = suma de apartados abiertos de esa fila" se
--   sostiene por construcción: solo `fn_aplicar_movimiento` y `recalcular_stock`
--   escriben `stock` (verificado leyendo el cuerpo de todas las funciones), y este
--   archivo NO amplía `registrar_movimiento`: apartar solo es posible por las dos RPC.
--
-- LO QUE ESTA MIGRACIÓN NO HACE (Fase 2, con Caja)
--   - Vender lo apartado en una sola transacción (`registrar_venta` consumiendo la
--     reserva) ni aplicar un adelanto. Hasta entonces, cuando la clienta llega:
--     se libera con motivo «entregada» y se cobra en Vender. Entre un paso y otro hay
--     una ventana de segundos en la que otra caja de la MISMA tienda podría vender esa
--     unidad: con ~10-50 ventas/día en hora pico entre todas las sedes, es un evento
--     que hoy se estima en menos de una vez cada varios años — y si ocurre, la venta
--     de la clienta falla con «Stock insuficiente» (visible), no queda un estado roto.
--   - Vencimiento automático: NO se libera solo (decisión de Felipe: la clienta pudo
--     dejar adelanto). Los vencidos se ven en rojo y decide la encargada.
--   - Las lecturas de otras pantallas (`fn_stock_por_sede`, `fn_productos`,
--     resúmenes) siguen mostrando stock físico; el motor igual rechaza lo que no
--     esté disponible.
--
-- COLUMNAS DE LA FASE 2
--   `adelanto_monto`, `adelanto_medio`, `adelanto_caja_movimiento_id`, `venta_id`
--   nacen nulas y SIN uso: sus FK y candados se definen junto con el diseño de Caja
--   (no se inventan acá). Ninguna RPC de esta migración las escribe.
--
-- DATOS PERSONALES
--   `clienta_nombre` y `clienta_contacto` los ve solo quien opera esa ubicación
--   (`fn_puede_operar_ubicacion`, líderes incluidas). Nadie escribe directo.
--
-- ESCALA (números antes que opiniones)
--   `movimientos` tenía 474 filas en producción al escribir esto (2026-09-20): el
--   `drop`/`add` del CHECK de tipos escanea la tabla en microsegundos. Con millones
--   de filas habría que hacerlo `not valid` + `validate constraint`.
--
-- CÓMO SE APLICA EN PRODUCCIÓN
--   Este archivo ya trae el prefijo `retail.` y su `search_path`: se pega entero en el
--   SQL Editor del proyecto cayla-dynamic. Es re-ejecutable (`if exists`, `or replace`).
--   La firma de `fn_aplicar_movimiento(uuid)` y `recalcular_stock()` no cambia: no crea
--   sobrecargas. Producción y el repo tenían el mismo cuerpo (md5 igual sin
--   comentarios, 2026-09-20) — este archivo parte de ese cuerpo.
--   Es compatible hacia atrás: mientras `cantidad_apartada` sea 0 en todas las filas,
--   `disponible = cantidad` y ninguna venta, traslado ni ajuste cambia de resultado.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. stock: el contador, con las mismas dos redes que ya protegen `cantidad` ----------
alter table retail.stock add column if not exists cantidad_apartada integer not null default 0;

alter table retail.stock drop constraint if exists stock_cantidad_apartada_no_negativa;
alter table retail.stock add constraint stock_cantidad_apartada_no_negativa
  check (cantidad_apartada >= 0);

-- Nunca más apartado que lo que físicamente hay. Es la red de seguridad: el motor ya
-- rechaza antes, con mensaje de negocio, cualquier operación que la rompería.
alter table retail.stock drop constraint if exists stock_cantidad_apartada_no_excede_cantidad;
alter table retail.stock add constraint stock_cantidad_apartada_no_excede_cantidad
  check (cantidad_apartada <= cantidad);

-- ---------- 2. movimientos: los dos tipos nuevos ----------
alter table retail.movimientos drop constraint if exists movimientos_tipo_check;
alter table retail.movimientos add constraint movimientos_tipo_check
  check (tipo in ('entrada', 'salida', 'ajuste', 'traslado', 'apartado', 'liberacion_apartado'));

-- ---------- 3. el motor ----------
-- Mismo cuerpo que producción (entrada intacta; traslado con el mismo orden
-- determinístico de bloqueo), más: `salida`/`traslado`/`ajuste` miran lo disponible, y
-- dos ramas nuevas. Los mensajes conservan el prefijo «Stock insuficiente» que ya
-- esperan las pruebas y `FlujoGuiado`.
create or replace function retail.fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
  v_apartada integer;
  v_ubic_a uuid; v_sub_a uuid; v_ubic_b uuid; v_sub_b uuid;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.sububicacion_id, m.cantidad)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'salida' then
    -- `is not distinct from`: con `=`, la primera salida en una ubicación sin
    -- sububicaciones (NULL en ambos lados) fallaría — `NULL = NULL` nunca es verdadero.
    select cantidad, cantidad_apartada into v_actual, v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual is null or v_actual - v_apartada < m.cantidad then
      raise exception '%', format('Stock insuficiente: hay %s y se pide sacar %s', greatest(coalesce(v_actual, 0) - coalesce(v_apartada, 0), 0), m.cantidad)
        || case when coalesce(v_apartada, 0) > 0
             then format(' (%s apartadas para clientas: no están disponibles)', v_apartada) else '' end;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.sububicacion_id, 0)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do nothing;
    select cantidad, cantidad_apartada into v_actual, v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría stock negativo: hay % y el ajuste es %', v_actual, m.cantidad;
    end if;
    -- Un conteo que encuentra menos prendas que las apartadas: no se cierra a ciegas.
    -- Primero hay que resolver la reserva (¿se perdió la prenda? ¿la clienta no vino?).
    if v_actual + m.cantidad < v_apartada then
      raise exception '%', format('El ajuste dejaría %s prendas de %s en stock pero hay %s apartadas para clientas — libera o resuelve esos apartados primero', v_actual + m.cantidad, (select sku from variantes where id = m.variante_id), v_apartada);
    end if;
    update stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'traslado' then
    if m.ubicacion_destino_id is null then
      raise exception 'Traslado requiere ubicacion_destino_id';
    end if;

    -- Bloquea origen y destino siempre en el mismo orden relativo (no "origen primero"
    -- literal): sin un orden determinístico, dos movimientos en sentidos opuestos entre
    -- las mismas dos sububicaciones podrían formar un ciclo de espera real.
    if (m.ubicacion_id, coalesce(m.sububicacion_id, '00000000-0000-0000-0000-000000000000'))
       <= (m.ubicacion_destino_id, coalesce(m.sububicacion_destino_id, '00000000-0000-0000-0000-000000000000'))
    then
      v_ubic_a := m.ubicacion_id; v_sub_a := m.sububicacion_id;
      v_ubic_b := m.ubicacion_destino_id; v_sub_b := m.sububicacion_destino_id;
    else
      v_ubic_a := m.ubicacion_destino_id; v_sub_a := m.sububicacion_destino_id;
      v_ubic_b := m.ubicacion_id; v_sub_b := m.sububicacion_id;
    end if;
    perform 1 from stock where variante_id = m.variante_id and ubicacion_id = v_ubic_a
      and sububicacion_id is not distinct from v_sub_a for update;
    perform 1 from stock where variante_id = m.variante_id and ubicacion_id = v_ubic_b
      and sububicacion_id is not distinct from v_sub_b for update;

    select cantidad, cantidad_apartada into v_actual, v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
    if v_actual is null or v_actual - v_apartada < m.cantidad then
      raise exception '%', format('Stock insuficiente en origen: hay %s y se pide trasladar %s', greatest(coalesce(v_actual, 0) - coalesce(v_apartada, 0), 0), m.cantidad)
        || case when coalesce(v_apartada, 0) > 0
             then format(' (%s apartadas para clientas: no se pueden mover)', v_apartada) else '' end;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_destino_id, m.sububicacion_destino_id, m.cantidad)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'apartado' then
    -- Mismo `for update` sobre la misma fila que las demás ramas: el candado de
    -- concurrencia es el lock de Postgres, no una columna de versión.
    select cantidad, cantidad_apartada into v_actual, v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual is null or v_actual - v_apartada < m.cantidad then
      raise exception '%', format('No hay stock disponible para apartar: hay %s disponibles (%s en total, %s ya apartadas) y se pide apartar %s',
        greatest(coalesce(v_actual, 0) - coalesce(v_apartada, 0), 0), coalesce(v_actual, 0), coalesce(v_apartada, 0), m.cantidad);
    end if;
    update stock set cantidad_apartada = cantidad_apartada + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'liberacion_apartado' then
    select cantidad_apartada into v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_apartada is null or v_apartada < m.cantidad then
      raise exception 'No se puede liberar %: solo hay % apartadas en esta fila', m.cantidad, coalesce(v_apartada, 0);
    end if;
    update stock set cantidad_apartada = cantidad_apartada - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
  end if;
end;
$$;

-- Cambiar el CUERPO no toca los permisos, pero se reafirman por si la función se recrea:
-- solo las funciones `security definer` que la llaman pueden ejecutarla (ADR-0078).
revoke all on function retail.fn_aplicar_movimiento(uuid) from public, anon, authenticated;

-- ---------- 4. reconstrucción completa: `movimientos` sigue siendo la única fuente de
-- verdad — un `recalcular_stock()` no puede borrar en silencio cada reserva activa ----------
create or replace function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  delete from stock;
  insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
  select variante_id, ubicacion_id, sububicacion_id, sum(delta), sum(delta_apartada) from (
    select variante_id, ubicacion_id, sububicacion_id, cantidad as delta, 0 as delta_apartada from movimientos where tipo = 'entrada'
    union all
    select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from movimientos where tipo = 'salida'
    union all
    select variante_id, ubicacion_id, sububicacion_id, cantidad, 0 from movimientos where tipo = 'ajuste'
    union all
    select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_id, sububicacion_id, 0, cantidad from movimientos where tipo = 'apartado'
    union all
    select variante_id, ubicacion_id, sububicacion_id, 0, -cantidad from movimientos where tipo = 'liberacion_apartado'
  ) t
  group by variante_id, ubicacion_id, sububicacion_id
  having sum(delta) <> 0 or sum(delta_apartada) <> 0;
end;
$$;

-- `recalcular_stock()` borra y reconstruye TODO `stock`: solo el SQL Editor / service_role. En producción ya estaba
-- cerrada (verificado 2026-09-20: `proacl = {postgres=X/postgres}`), pero ninguna migración del repo lo decía, así que
-- un Postgres construido desde el repo la dejaba ejecutable por anon/authenticated (`create or replace` conserva el ACL
-- que ya tenía). Mismo patrón que ADR-0078. Nada de la app la llama; la prueba corre como postgres.
revoke all on function retail.recalcular_stock() from public, anon, authenticated;

-- ---------- 5. apartados: el documento de negocio ----------
create table if not exists retail.apartados (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  sububicacion_id uuid,
  cantidad integer not null check (cantidad > 0),
  clienta_nombre text not null check (length(btrim(clienta_nombre)) > 0),
  clienta_contacto text not null check (length(btrim(clienta_contacto)) > 0),
  nota text,
  vence_el date not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'liberado')),
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  cerrado_por uuid references public.personas (id),
  cerrado_en timestamptz,
  cierre_motivo text check (cierre_motivo in ('clienta_no_vino', 'entregada', 'error_de_carga', 'otro')),
  movimiento_id uuid not null references retail.movimientos (id),
  movimiento_cierre_id uuid references retail.movimientos (id),
  -- FASE 2 (adelanto ligado a Caja): nacen nulas y sin uso. Sus FK y candados se definen
  -- con el diseño de Caja; ninguna RPC de este archivo las escribe.
  adelanto_monto numeric(12, 2) check (adelanto_monto is null or adelanto_monto > 0),
  adelanto_medio text,
  adelanto_caja_movimiento_id uuid,
  venta_id uuid,
  constraint apartados_sububicacion_pertenece_fk
    foreign key (sububicacion_id, ubicacion_id) references retail.sububicaciones (id, ubicacion_id),
  -- Estado imposible: un apartado cerrado sin cuándo/por qué, o uno abierto con cierre.
  constraint apartados_cierre_coherente check (
    (estado = 'abierto' and cerrado_en is null and cierre_motivo is null and movimiento_cierre_id is null)
    or (estado = 'liberado' and cerrado_en is not null and cierre_motivo is not null and movimiento_cierre_id is not null)
  )
);

create index if not exists apartados_abiertos_ubicacion_idx
  on retail.apartados (ubicacion_id, vence_el) where estado = 'abierto';
create index if not exists apartados_fila_stock_idx
  on retail.apartados (variante_id, ubicacion_id, sububicacion_id) where estado = 'abierto';

alter table retail.apartados enable row level security;
drop policy if exists apartados_select on retail.apartados;
create policy apartados_select on retail.apartados for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
-- Escritura: solo las RPC (`security definer`) de abajo.
revoke insert, update, delete, truncate on retail.apartados from authenticated, anon;
grant select on retail.apartados to authenticated;

-- ---------- 6. RPC: las únicas puertas al contador ----------
create or replace function retail.apartar_stock(
  p_variante_id uuid,
  p_ubicacion_id uuid,
  p_cantidad integer,
  p_clienta_nombre text,
  p_clienta_contacto text,
  p_vence_el date,
  p_nota text default null,
  p_sububicacion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_max_dias constant integer := 60;  -- tope de cordura: un typo de año no puede dejar una reserva de años
  v_hoy date := fn_hoy_lima();
  v_nombre text := btrim(coalesce(p_clienta_nombre, ''));
  v_contacto text := btrim(coalesce(p_clienta_contacto, ''));
  v_persona uuid;
  v_sub uuid;
  v_mov uuid;
  v_id uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para apartar prendas en esa ubicación';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad a apartar debe ser al menos 1';
  end if;
  if v_nombre = '' then
    raise exception 'Anota el nombre de la clienta';
  end if;
  if v_contacto = '' then
    raise exception 'Anota un teléfono o WhatsApp de la clienta';
  end if;
  if p_vence_el is null or p_vence_el < v_hoy or p_vence_el > v_hoy + c_max_dias then
    raise exception 'La fecha límite debe estar entre hoy y los próximos % días', c_max_dias;
  end if;
  if not exists (select 1 from variantes where id = p_variante_id and activo) then
    raise exception 'Esa prenda no existe o está descontinuada';
  end if;
  if p_sububicacion_id is not null and not exists (
    select 1 from sububicaciones where id = p_sububicacion_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'Esa sububicación no pertenece a la ubicación elegida';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- Sin sububicación explícita: el piso de venta (lo que se ve y se vende). En una
  -- ubicación que no separa piso/almacén (Taller) queda NULL, como en `stock`.
  v_sub := coalesce(p_sububicacion_id, fn_sububicacion_por_defecto(p_ubicacion_id, 'venta'));

  -- Una sola transacción: el movimiento, su efecto en stock (que rechaza si no hay
  -- disponible) y la fila de `apartados` — o todo, o nada.
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, v_sub, 'apartado', p_cantidad, 'apartado', v_persona,
            'Apartado para ' || v_nombre || ' hasta el ' || to_char(p_vence_el, 'DD/MM/YYYY'))
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);

  insert into apartados (variante_id, ubicacion_id, sububicacion_id, cantidad, clienta_nombre, clienta_contacto,
                         nota, vence_el, creado_por, movimiento_id)
    values (p_variante_id, p_ubicacion_id, v_sub, p_cantidad, v_nombre, v_contacto,
            nullif(btrim(coalesce(p_nota, '')), ''), p_vence_el, v_persona, v_mov)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function retail.liberar_apartado(p_apartado_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  a apartados%rowtype;
  v_persona uuid;
  v_mov uuid;
begin
  -- `for update`: dos personas liberando el mismo apartado a la vez — la segunda espera
  -- y luego lo ve cerrado, en vez de devolver el stock dos veces.
  select * into a from apartados where id = p_apartado_id for update;
  if not found then
    raise exception 'Ese apartado no existe';
  end if;
  if not fn_puede_operar_ubicacion(a.ubicacion_id) then
    raise exception 'No tienes permiso para liberar apartados de esa ubicación';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  -- Decisión de Felipe: cualquiera aparta, pero el apartado de otra persona solo lo libera una líder.
  if not (fn_es_lider() or a.creado_por = v_persona) then
    raise exception 'Solo quien apartó la prenda o una líder puede liberarla';
  end if;
  if a.estado <> 'abierto' then
    raise exception 'Ese apartado ya estaba cerrado';
  end if;
  if p_motivo is null or p_motivo not in ('clienta_no_vino', 'entregada', 'error_de_carga', 'otro') then
    raise exception 'Elige por qué se libera el apartado';
  end if;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'liberacion_apartado', a.cantidad, 'liberacion_apartado', v_persona,
            'Apartado de ' || a.clienta_nombre || ' liberado: '
              || case p_motivo when 'clienta_no_vino' then 'la clienta no vino'
                               when 'entregada' then 'se entrega a la clienta'
                               when 'error_de_carga' then 'error al apartar'
                               else 'otro motivo' end)
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);

  update apartados
     set estado = 'liberado', cerrado_por = v_persona, cerrado_en = now(),
         cierre_motivo = p_motivo, movimiento_cierre_id = v_mov
   where id = a.id;
end;
$$;

-- Los apartados ABIERTOS de una ubicación, ya con lo que la pantalla necesita: prenda (nombre, talla,
-- color), quién apartó y si QUIEN MIRA puede liberarlo. Sin filas si no puede operar esa ubicación — el
-- mismo criterio que la policy de `apartados`. `security definer` solo para poder leer el nombre de quien
-- apartó (`public.personas`); el permiso se comprueba en el `where`, no se salta.
create or replace function retail.listar_apartados(p_ubicacion_id uuid)
returns table (
  id uuid, variante_id uuid, sku text, referencia text, talla text, color text,
  sububicacion_id uuid, cantidad integer, clienta_nombre text, clienta_contacto text, nota text,
  vence_el date, created_at timestamptz, creado_por uuid, creado_por_nombre text, puede_liberar boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select a.id, a.variante_id, v.sku, p.referencia, t.valor, c.nombre,
         a.sububicacion_id, a.cantidad, a.clienta_nombre, a.clienta_contacto, a.nota,
         a.vence_el, a.created_at, a.creado_por, per.nombres,
         (fn_es_lider() or a.creado_por is not distinct from (select pe.id from personas pe where pe.auth_user_id = auth.uid()))
  from apartados a
  join variantes v on v.id = a.variante_id
  join productos p on p.id = v.producto_id
  left join tallas t on t.id = v.talla_id
  left join colores c on c.codigo = v.color_codigo
  left join personas per on per.id = a.creado_por
  where a.ubicacion_id = p_ubicacion_id
    and a.estado = 'abierto'
    and fn_puede_operar_ubicacion(p_ubicacion_id)
  order by a.vence_el, a.created_at;
$$;

revoke all on function retail.apartar_stock(uuid, uuid, integer, text, text, date, text, uuid) from public, anon;
grant execute on function retail.apartar_stock(uuid, uuid, integer, text, text, date, text, uuid) to authenticated;
revoke all on function retail.liberar_apartado(uuid, text) from public, anon;
grant execute on function retail.liberar_apartado(uuid, text) to authenticated;
revoke all on function retail.listar_apartados(uuid) from public, anon;
grant execute on function retail.listar_apartados(uuid) to authenticated;

-- ---------- 7. diagnóstico: ¿el contador de cada fila cuadra con sus apartados abiertos? ----------
-- Devuelve SOLO las filas que no cuadran (idealmente ninguna). Solo para el SQL Editor / service_role.
create or replace function retail.fn_verificar_apartados()
returns table (variante_id uuid, ubicacion_id uuid, sububicacion_id uuid, en_stock integer, en_apartados bigint)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(s.variante_id, a.variante_id), coalesce(s.ubicacion_id, a.ubicacion_id),
         coalesce(s.sububicacion_id, a.sububicacion_id), coalesce(s.cantidad_apartada, 0), coalesce(a.n, 0)
  from stock s
  full join (
    select variante_id, ubicacion_id, sububicacion_id, sum(cantidad) as n
    from apartados where estado = 'abierto' group by 1, 2, 3
  ) a on a.variante_id = s.variante_id and a.ubicacion_id = s.ubicacion_id
     and a.sububicacion_id is not distinct from s.sububicacion_id
  where coalesce(s.cantidad_apartada, 0) <> coalesce(a.n, 0);
$$;
revoke all on function retail.fn_verificar_apartados() from public, anon, authenticated;
