-- ============================================================================
-- ALMACÉN INTERNO EN EL RIEL NUMERADO · cierra la deriva local ↔ producción
--
-- QUÉ ARREGLA
--   Producción tiene `stock_almacen`, el contenedor `tipo='almacen'`,
--   `bajar_a_piso` y `devolver_a_almacen` desde el 2026-09-03
--   (`supabase/unificacion/12_almacen_interno.sql`), pero eso NUNCA se subió al
--   riel de migraciones numeradas. Consecuencia: `npx supabase db reset` deja un
--   Postgres local SIN `stock_almacen`, y `apps/web/lib/catalogo.ts:47` la
--   consulta en cada render. El error se traga en silencio (solo se chequea
--   `errVariantes`, línea 51), así que en local TODO el catálogo se ve con 0 en
--   almacén y las pantallas `/inventario/recibir` y `/inventario/almacen`
--   muestran "Tu sede no tiene un almacén configurado". No se puede construir ni
--   probar nada del inventario en local sin cerrar esto primero.
--
--   Y ADEMÁS arregla una deriva en el sentido contrario: al reescribir
--   `fn_aplicar_movimiento` para el almacén, `unificacion/12` partió de un
--   cuerpo ANTERIOR a `0011_stock_ultima_venta.sql` y perdió por el camino la
--   línea que sella `stock.ultima_venta`. En producción esa columna existe pero
--   NADIE la escribe (verificado: `grep ultima_venta supabase/unificacion/*.sql`
--   solo devuelve la declaración de la columna en `05_operacion.sql:191`).
--   Efecto real hoy: `catalogo.ts:70-72` la lee siempre null, `inteligencia.ts`
--   cae al fallback `creadaEn`, y el indicador "Días sin venta" mide en verdad
--   la edad de la variante desde que se creó — o sea, todo el catálogo aparece
--   estancado para siempre. Es el mismo tipo de cicatriz que documenta
--   ADR-0004 para `recibir_lote`.
--
-- QUÉ PROMETE
--   Después de esta migración, el Postgres local y el `retail` de producción
--   tienen la MISMA maquinaria de inventario, y `fn_aplicar_movimiento` es por
--   primera vez la unión completa de las dos mitades: el ruteo a almacén que
--   solo tenía producción + el `ultima_venta` que solo tenía local.
--
-- POR QUÉ ASÍ
--   DECIDÍ portar `unificacion/12` tal cual (misma semántica, mismos mensajes de
--     error) en vez de rediseñar. Producción ya lleva meses con ese modelo y con
--     plata real adentro; el objetivo de este archivo es que local ALCANCE a
--     producción, no que las dos cambien a la vez (principio 1: el núcleo
--     estable no se toca sin razón de peso).
--   TUVE que tocar `recalcular_stock`, que `0042_recalcular_stock_neto.sql`
--     (ADR-0020) acababa de arreglar el mismo día. No es un capricho: aquella
--     versión es correcta para un mundo de UNA bolsa, y este archivo introduce
--     la segunda (`stock_almacen`). Sin el filtro por contenedor, la red de
--     seguridad plegaría el almacén de vuelta al piso. Se conserva íntegro lo
--     que ADR-0020 decidió (neto en una pasada, sin `truncate`) y solo se le
--     suma el ruteo. El detalle está en el comentario del bloque 7.
--
--   El gemelo de producción (`supabase/unificacion/26_ultima_venta_en_aplicar_movimiento.sql`)
--   lleva SOLO el delta que a producción le falta — el `ultima_venta` — porque
--   todo lo demás ya corrió allá el 2026-09-03.
--
-- SE ROMPE SI: el negocio necesita más de un almacén por sede. Este modelo
--   asume 1 almacén = 1 sede y lo hace cumplir con un índice único parcial.
--
-- CÓMO SE REVIERTE: es una migración local; `npx supabase db reset` sin este
--   archivo devuelve el estado anterior. En producción no se revierte nada
--   porque el gemelo solo reemplaza el cuerpo de una función.
--
-- NOTA sobre las sedes `-ALM`: `0008_almacen.sql:14-16` creó sedes hermanas
--   TRU-ALM / AQP-ALM / LIM-ALM con `tipo='almacen'`. Producción tomó el camino
--   contrario (el almacén es un CONTENEDOR dentro de la misma sede) y nunca las
--   creó. Este archivo NO las borra — no se borran datos — pero ninguna pantalla
--   nueva debe ofrecerlas: son legado. El seed del bloque 2 las excluye
--   explícitamente. Reconciliar el frontend que todavía las arrastra
--   (`MovimientoModal.tsx:9,73-74`) es trabajo propio, con decisiones de negocio
--   sobre los movimientos históricos, y está agendado aparte.
-- ============================================================================

-- ---------- 1. contenedores: 'almacen' como tercer tipo válido ----------
alter table contenedores drop constraint if exists contenedores_tipo_check;
alter table contenedores add constraint contenedores_tipo_check
  check (tipo in ('estante', 'caja', 'almacen'));

-- Un solo contenedor tipo 'almacen' por sede (lo hace cumplir la base, no el código).
create unique index if not exists contenedores_un_almacen_por_sede
  on contenedores (sede_id) where tipo = 'almacen';

-- ---------- 2. seed: el contenedor 'almacen' de cada sede operativa ----------
-- Producción lee `retail.sede_meta` (que en local no existe, porque local no
-- pasó por la unificación con Dynamic); acá se lee `sedes` directo. El filtro
-- por tipo excluye a la vez el corporativo (no lo necesita) y las sedes `-ALM`
-- de 0008, que son el modelo viejo (ver NOTA de la cabecera).
insert into contenedores (sede_id, codigo, tipo)
select id, 'ALMACEN', 'almacen'
from sedes where tipo in ('tienda', 'fabrica')
on conflict (sede_id, codigo) do nothing;

-- ---------- 3. stock_almacen: la bolsa de "recibido pero aún no bajado" ----------
create table if not exists stock_almacen (
  variante_id uuid not null references variantes (id) on delete cascade,
  sede_id uuid not null references sedes (id),
  cantidad integer not null default 0,
  ultima_entrada timestamptz,
  ultima_salida timestamptz,
  updated_at timestamptz not null default now(),
  primary key (variante_id, sede_id)
);
create index if not exists stock_almacen_sede_id_idx on stock_almacen (sede_id);

alter table stock_almacen enable row level security;
drop policy if exists stock_almacen_select on stock_almacen;
create policy stock_almacen_select on stock_almacen
  for select using (fn_puede_operar_sede(sede_id));
-- Sin política de insert/update a propósito: se escribe SOLO vía RPC
-- security definer (fn_aplicar_movimiento), igual que `stock`.

-- ---------- 4. fn_aplicar_movimiento: ruteo a almacén + ultima_venta ----------
-- Cuerpo = `unificacion/12_almacen_interno.sql:155-249` (ruteo por contenedor y
-- validación contenedor↔sede) MÁS la línea de `0011_stock_ultima_venta.sql:65`
-- que producción perdió. Es la primera versión que tiene las dos mitades.
create or replace function fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
  v_es_almacen boolean := false;
  v_contenedor_sede_id uuid;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then raise exception 'Movimiento % no existe', p_movimiento_id; end if;

  -- Si el movimiento trae contenedor, primero se valida que sea de la sede
  -- correcta (la destino si es traslado; la propia si no) — convierte un estado
  -- imposible silencioso en un error ruidoso (principio 2).
  if m.contenedor_id is not null then
    select c.sede_id, (c.tipo = 'almacen') into v_contenedor_sede_id, v_es_almacen
      from contenedores c where c.id = m.contenedor_id;
    if v_contenedor_sede_id is null then
      raise exception 'El contenedor % no existe', m.contenedor_id;
    end if;
    if m.tipo = 'traslado' then
      if v_contenedor_sede_id <> coalesce(m.sede_destino_id, m.sede_id) then
        raise exception 'El contenedor % no pertenece a la sede destino del traslado', m.contenedor_id;
      end if;
      v_es_almacen := false; -- traslado nunca enruta a stock_almacen: es cruce entre sedes.
    elsif v_contenedor_sede_id <> m.sede_id then
      raise exception 'El contenedor % no pertenece a la sede %', m.contenedor_id, m.sede_id;
    end if;
  end if;

  if v_es_almacen and m.tipo in ('entrada', 'salida', 'ajuste') then
    -- ===== rama ALMACÉN: misma sede, bolsa aparte (stock_almacen) =====
    if m.tipo = 'salida' then
      select coalesce(cantidad, 0) into v_actual from stock_almacen
        where variante_id = m.variante_id and sede_id = m.sede_id for update;
      if coalesce(v_actual, 0) < m.cantidad then
        raise exception 'Stock insuficiente en el almacén de la sede % (hay %, se pidió %)',
          m.sede_id, coalesce(v_actual, 0), m.cantidad;
      end if;
    end if;

    if m.tipo = 'entrada' then
      insert into stock_almacen (variante_id, sede_id, cantidad, ultima_entrada)
        values (m.variante_id, m.sede_id, m.cantidad, m.created_at)
        on conflict (variante_id, sede_id) do update
          set cantidad = stock_almacen.cantidad + excluded.cantidad,
              ultima_entrada = excluded.ultima_entrada, updated_at = now();
    elsif m.tipo = 'salida' then
      update stock_almacen set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
        where variante_id = m.variante_id and sede_id = m.sede_id;
    elsif m.tipo = 'ajuste' then
      insert into stock_almacen (variante_id, sede_id, cantidad)
        values (m.variante_id, m.sede_id, m.cantidad)
        on conflict (variante_id, sede_id) do update
          set cantidad = stock_almacen.cantidad + excluded.cantidad, updated_at = now();
    end if;
    return;
  end if;

  -- ===== rama PISO / cruce entre sedes: `stock` =====
  if m.tipo = 'salida' or m.tipo = 'traslado' then
    select coalesce(cantidad, 0) into v_actual from stock
      where variante_id = m.variante_id and sede_id = m.sede_id for update;
    if coalesce(v_actual, 0) < m.cantidad then
      raise exception 'Stock insuficiente en sede % (hay %, se pidió %)', m.sede_id, coalesce(v_actual, 0), m.cantidad;
    end if;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id), updated_at = now();

  elsif m.tipo = 'salida' then
    -- `ultima_venta` SOLO se sella con ventas reales: bajar del almacén al piso
    -- también es una salida, y sin este `case` reiniciaría el contador de
    -- "días sin venta" sin que nadie haya comprado (razón de 0011).
    update stock set
      cantidad = cantidad - m.cantidad,
      ultima_salida = m.created_at,
      ultima_venta = case when m.motivo = 'venta' then m.created_at else ultima_venta end,
      updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, sede_id, cantidad)
      values (m.variante_id, m.sede_id, m.cantidad)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'traslado' then
    if m.sede_destino_id is null then raise exception 'Traslado requiere sede_destino_id'; end if;
    update stock set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_destino_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id), updated_at = now();
  end if;
end;
$$;

-- ---------- 5. bajar_a_piso: almacén → piso, misma sede, atómico ----------
create or replace function bajar_a_piso(
  p_sede_id uuid, p_variante_id uuid, p_cantidad integer, p_nota text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_persona_id uuid; v_contenedor_id uuid; v_mov_salida_id uuid; v_mov_entrada_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para bajar mercadería a piso en esa sede';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a bajar debe ser mayor a 0';
  end if;

  select id into v_contenedor_id from contenedores where sede_id = p_sede_id and tipo = 'almacen';
  if v_contenedor_id is null then
    raise exception 'Esta sede no tiene un almacén configurado';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- Sale del almacén — si no alcanza, fn_aplicar_movimiento lanza excepción acá
  -- y la función entera aborta: la entrada de abajo nunca corre.
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, contenedor_id, nota)
    values (p_variante_id, p_sede_id, 'salida', p_cantidad, 'bajada a piso', v_persona_id, v_contenedor_id, p_nota)
    returning id into v_mov_salida_id;
  perform fn_aplicar_movimiento(v_mov_salida_id);

  -- Entra al piso (sin contenedor = piso de venta).
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_sede_id, 'entrada', p_cantidad, 'bajada de almacén', v_persona_id, p_nota)
    returning id into v_mov_entrada_id;
  perform fn_aplicar_movimiento(v_mov_entrada_id);

  return v_mov_entrada_id;
end;
$$;

-- ---------- 6. devolver_a_almacen: piso → almacén, misma sede, atómico ----------
create or replace function devolver_a_almacen(
  p_sede_id uuid, p_variante_id uuid, p_cantidad integer, p_nota text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_persona_id uuid; v_contenedor_id uuid; v_mov_salida_id uuid; v_mov_entrada_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para devolver mercadería al almacén de esa sede';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a devolver debe ser mayor a 0';
  end if;

  select id into v_contenedor_id from contenedores where sede_id = p_sede_id and tipo = 'almacen';
  if v_contenedor_id is null then
    raise exception 'Esta sede no tiene un almacén configurado';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_sede_id, 'salida', p_cantidad, 'devolución a almacén', v_persona_id, p_nota)
    returning id into v_mov_salida_id;
  perform fn_aplicar_movimiento(v_mov_salida_id);

  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, contenedor_id, nota)
    values (p_variante_id, p_sede_id, 'entrada', p_cantidad, 'devolución a almacén', v_persona_id, v_contenedor_id, p_nota)
    returning id into v_mov_entrada_id;
  perform fn_aplicar_movimiento(v_mov_entrada_id);

  return v_mov_entrada_id;
end;
$$;

-- ---------- 7. recalcular_stock: el neto de ADR-0020, ahora consciente del almacén ----------
-- ⚠ ESTE BLOQUE MODIFICA UNA FUNCIÓN QUE `0042_recalcular_stock_neto.sql` ACABA
-- DE ARREGLAR. Se hace a propósito y es obligatorio: aquella versión (correcta
-- para un mundo de una sola bolsa) suma TODOS los movimientos de una sede en
-- `stock`. Desde esta migración existe una segunda bolsa (`stock_almacen`) y
-- hay movimientos enrutados a ella por `contenedor_id`; sin el filtro de abajo,
-- correr la red de seguridad plegaría el almacén de vuelta al piso de venta y
-- duplicaría mercadería que nunca bajó. Es la misma trampa que advierte
-- `supabase/unificacion/12_almacen_interno.sql:332-336`.
--
-- SE CONSERVA TODO LO DE ADR-0020, que era lo correcto y no se toca:
--   · se calcula el NETO por (variante, sede) en una sola pasada, así nunca se
--     propone una fila negativa que `stock_cantidad_no_negativa` rechace antes
--     del `on conflict` (ése era el bug que impedía que la función corriera);
--   · NO hay `truncate`, así que `stock_minimo` y `contenedor_id` —que no se
--     derivan de `movimientos`— sobreviven.
-- LO ÚNICO QUE SE AGREGA: el filtro por contenedor y la bolsa espejo del
-- almacén. Más `ultima_venta`, que sí es derivable y se reconstruye al final.
--
-- ⚠ BORDE HEREDADO, NO RESUELTO ACÁ (para Felipe, no para esta migración):
-- `fijar_stock_minimo` crea una fila de `stock` con cantidad 0 solo para guardar
-- el mínimo. Si esa variante todavía no tiene ningún movimiento en esa sede, el
-- `delete` de abajo —tal como lo dejó ADR-0020— la borra y el mínimo se pierde.
-- Se preserva la semántica de ADR-0020 tal cual en vez de cambiarla por mi
-- cuenta; queda anotado para decidirlo aparte.
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
  where not exists (
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

  delete from stock_almacen sa
  where not exists (
    select 1 from movimientos m
    join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.variante_id = sa.variante_id and m.sede_id = sa.sede_id
  );
end;
$$;

comment on function recalcular_stock() is
  'Reconstruye `stock` y `stock_almacen` desde `movimientos` (la fuente de verdad). Neto por (variante, sede) antes de escribir (ADR-0020) y ruteo por contenedor tipo almacen. Conserva stock_minimo y contenedor_id, que no se derivan de movimientos.';
