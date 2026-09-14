-- ============================================================================
-- SQL PENDIENTE DE PRODUCCIÓN · 2026-09-14 · generado desde supabase/migrations
--
-- Medido contra el catálogo de producción (proyecto cayla-dynamic, schema retail)
-- el 2026-09-14: estas 7 migraciones están en local y NO en producción.
-- `registrar_venta` allá acepta 9 parámetros y el front de main ya manda 11
-- (p_codigo_descuento, p_nota): NO desplegar main antes de pegar las bloqueantes.
--
-- Cómo pegar: en el SQL Editor de producción, UN bloque por vez, en este orden.
-- Cada bloque va en su propia transacción y se registra solo en
-- supabase_migrations.schema_migrations. Al final, la consulta de comprobación.
--
-- Orden:
--   1. 20260912234726_cargo_especial_pos  [bloqueante]
--   2. 20260914200000_compras_multipago  [necesaria]
--   3. 20260914215059_candado_precio_venta  [bloqueante]
--   4. 20260914215103_codigos_descuento  [bloqueante]
--   5. 20260914220000_stock_por_sede  [necesaria]
--   6. 20260914220804_nota_en_ventas  [bloqueante]
--   7. 20260912235600_activos_fijos  [opcional]
-- ============================================================================

-- ============================================================================
-- 20260912234726_cargo_especial_pos.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ==================== Cargo especial (Monto manual en el POS) — V2 ====================
-- Reescrita al reconciliar Vender con el corte V1→V2 (2026-09-12). La versión V1
-- (numerada 0061, ya no existe) escribía contra `productos.sku_padre`/`estado='activa'`
-- y `variantes.stock_minimo`, columnas que no existen en el esquema V2
-- (0002_esquema.sql). Misma idea, reescrita contra las tablas reales de hoy.
--
-- Por qué existe: `registrar_venta` (0011_venta_con_comprobante.sql) exige un
-- variante_id real por línea — no hay forma de vender "monto manual" sin una
-- variante real detrás. IDs fijos (no gen_random_uuid()) para que el frontend
-- los conozca sin una consulta extra, y para que cualquiera que los vea en un
-- panel de Supabase reconozca a simple vista que es un centinela.
--
-- La cantidad de `stock` se siembra por MOVIMIENTO de entrada (fn_aplicar_movimiento),
-- nunca escribiendo `stock` a mano — esa fue exactamente la causa raíz del bug
-- encontrado el 2026-09-12 en la primera versión de esta migración (recalcular_stock
-- la dejaba en negativo porque no sabía nada de un `insert into stock` directo).
--
-- Aviso conocido y aceptado: al vivir en `productos`/`variantes` como cualquier
-- prenda, esta variante también puede aparecer en selectores de otras pantallas
-- (Traslados, Producción, Inventario) que no filtran por esto — de ahí `activo =
-- false`, que aunque hoy ningún query lo usa como filtro, documenta la intención
-- para quien lo encuentre después. El nombre es deliberadamente inconfundible.

insert into retail.productos (id, referencia, descripcion, estado)
values ('11111111-1111-4111-8111-111111111111', 'Cargo especial (sin código)', 'Variante centinela para Monto manual en el POS — no es una prenda real.', 'activo')
on conflict (id) do nothing;

insert into retail.variantes (id, producto_id, sku, precio, costo, activo)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'CARGO-ESPECIAL-01',
  0,
  0,
  false
)
on conflict (id) do nothing;

do $$
declare
  v_ubicacion record;
  v_movimiento_id uuid;
begin
  for v_ubicacion in select id from retail.ubicaciones loop
    if not exists (
      select 1 from retail.movimientos
      where variante_id = '22222222-2222-4222-8222-222222222222'
        and ubicacion_id = v_ubicacion.id
        and motivo = 'siembra_cargo_especial'
    ) then
      insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo)
        values ('22222222-2222-4222-8222-222222222222', v_ubicacion.id, 'entrada', 999999, 'siembra_cargo_especial')
        returning id into v_movimiento_id;
      perform retail.fn_aplicar_movimiento(v_movimiento_id);
    end if;
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260912234726', 'cargo_especial_pos') on conflict (version) do nothing;
commit;


-- ============================================================================
-- 20260914200000_compras_multipago.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ============================================================================
-- Multipago en compras: un pago puede repartirse en varios medios
--
-- EL PROBLEMA (lo pidió Felipe, 2026-09-14). Una factura de S/ 8,000 se paga
-- S/ 5,000 por transferencia y S/ 3,000 en efectivo, en el mismo acto. Hoy
-- `registrar_pago_compra` toma UN monto con UN medio: había que registrar
-- dos pagos por separado, y si el segundo fallaba (sesión vencida, saldo
-- mal tipeado) el primero ya estaba escrito — un pago a medias que nadie
-- pidió.
--
-- EL MODELO NO CAMBIA: `compra_pagos` ya es "una fila por medio de pago"
-- (así el Diario de caja y la conciliación bancaria siguen viendo cada
-- medio por separado). Lo que faltaba era escribir varias filas EN UNA
-- SOLA TRANSACCIÓN, validando la suma contra el saldo una sola vez y con la
-- factura bloqueada. Eso es `registrar_pagos_compra`.
--
-- `registrar_pago_compra` (singular) queda como atajo para un solo medio:
-- llama a la nueva. Ninguna pantalla se rompe mientras se despliega.
--
-- `registrar_compra` acepta en `p_pago` lo de siempre (un objeto) o un
-- arreglo de medios. Misma firma → `create or replace`, sin DROP. Al contado
-- la SUMA debe ser el total; al crédito, no superarlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Varios medios contra una factura, todo o nada
-- ---------------------------------------------------------------------------
create function retail.registrar_pagos_compra(
  p_compra_id uuid,
  p_pagos jsonb,                       -- [{monto, metodo, referencia?}]
  p_fecha date default current_date
)
returns uuid[]
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra compras%rowtype; v_pagado numeric(12, 2); v_suma numeric(12, 2) := 0;
  v_persona uuid; v_pago jsonb; v_monto numeric(12, 2); v_id uuid; v_ids uuid[] := '{}';
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'El pago necesita al menos un medio con su monto';
  end if;

  -- validar cada medio antes de escribir nada
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_monto := (v_pago ->> 'monto')::numeric;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada medio de pago necesita un monto mayor a cero';
    end if;
    if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
      raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  -- bloquea la factura: dos pagos simultáneos no pueden pasarse del saldo
  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta pagos', v_compra.serie, v_compra.numero;
  end if;

  select coalesce(sum(monto), 0) into v_pagado from compra_pagos where compra_id = p_compra_id;
  if v_pagado + v_suma > v_compra.total then
    raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', v_suma, v_compra.total - v_pagado;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
      values (p_compra_id, coalesce(p_fecha, current_date), (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona)
      returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Un solo medio = la misma regla, por el mismo camino
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_pago_compra(
  p_compra_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text default null,
  p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  return (registrar_pagos_compra(
    p_compra_id,
    jsonb_build_array(jsonb_build_object('monto', p_monto, 'metodo', p_metodo, 'referencia', p_referencia)),
    p_fecha
  ))[1];
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. registrar_compra: `p_pago` acepta un objeto o un arreglo de medios
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_compra(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_ubicacion_destino_id uuid,
  p_items jsonb,                       -- [{producto_id, variante_id?, descripcion?, cantidad, costo_unitario}]
  p_tipo text default 'factura',
  p_fecha_emision date default current_date,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,           -- {monto, metodo, referencia?, fecha?} o [{monto, metodo, referencia?}] — obligatorio si contado
  p_nota text default null,
  p_total numeric default null         -- el total del papel, cuando los precios traen el IGV incluido
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric(12, 2);
  v_pagos jsonb; v_pago jsonb; v_monto numeric(12, 2); v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar compras';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura necesita al menos una línea';
  end if;
  if p_condicion not in ('contado', 'credito') then
    raise exception 'La condición debe ser contado o credito';
  end if;
  if p_condicion = 'credito' and p_fecha_vencimiento is null then
    raise exception 'Una compra al crédito necesita fecha de vencimiento';
  end if;
  if p_condicion = 'contado' and p_pago is null then
    raise exception 'Una compra al contado se registra con su pago';
  end if;

  -- validar líneas antes de escribir nada
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto := (v_item ->> 'producto_id')::uuid;
    v_variante := (v_item ->> 'variante_id')::uuid;
    if v_producto is null then
      raise exception 'Cada línea necesita producto_id';
    end if;
    if v_variante is not null and not exists (
      select 1 from variantes where id = v_variante and producto_id = v_producto
    ) then
      raise exception 'La variante % no pertenece al producto %', v_variante, v_producto;
    end if;
    if coalesce((v_item ->> 'cantidad')::integer, 0) <= 0 then
      raise exception 'Cada línea necesita cantidad mayor a cero';
    end if;
    v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;
  end loop;

  v_igv := round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2);
  v_total := v_subtotal + v_igv;

  -- El total del papel manda: el IGV absorbe el redondeo de pasar precios
  -- con IGV a base de 2 decimales. Un centavo por línea, más uno, es lo
  -- máximo que ese redondeo puede mover; más que eso es un error de tipeo.
  if p_total is not null then
    if p_total < 0 then
      raise exception 'El total no puede ser negativo';
    end if;
    if coalesce(p_igv_porcentaje, 0) = 0 and p_total <> v_subtotal then
      raise exception 'Sin IGV el total tiene que ser igual a la suma de las líneas (S/ %), llegó S/ %', v_subtotal, p_total;
    end if;
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1);
    if abs(p_total - v_total) > v_tolerancia then
      raise exception 'El total del documento (S/ %) no cuadra con sus líneas (S/ %): revisa los costos', p_total, v_total;
    end if;
    v_total := p_total;
    v_igv := p_total - v_subtotal;
  end if;

  -- El pago: un objeto (un medio, como siempre) o un arreglo de medios. La
  -- fecha, si viene, va en el objeto o en el primer elemento del arreglo.
  if p_pago is not null then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) > 0 then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto';
    end if;
    v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, current_date);
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
        raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
      end if;
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if p_condicion = 'contado' and v_pago_suma <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_suma;
    end if;
    if v_pago_suma > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_suma, v_total;
    end if;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compras (
    proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona
  ) returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)
      values (
        v_compra_id,
        (v_item ->> 'producto_id')::uuid,
        (v_item ->> 'variante_id')::uuid,
        v_item ->> 'descripcion',
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric
      );
  end loop;

  if v_pagos is not null then
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
        values (
          v_compra_id,
          v_pago_fecha,
          (v_pago ->> 'monto')::numeric,
          v_pago ->> 'metodo',
          nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''),
          v_persona
        );
    end loop;
  end if;

  return v_compra_id;
exception
  when unique_violation then
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

grant execute on function retail.registrar_pagos_compra(uuid, jsonb, date) to authenticated;
grant execute on function retail.registrar_pago_compra(uuid, numeric, text, text, date) to authenticated;
grant execute on function retail.registrar_compra to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260914200000', 'compras_multipago') on conflict (version) do nothing;
commit;


-- ============================================================================
-- 20260914215059_candado_precio_venta.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ============================================================================
-- 20260914215059_candado_precio_venta.sql — CAYLA V2
--
-- El precio lo fija el catálogo, no la caja. Desde el 2026-09-14 la pantalla de
-- Vender ya no deja editar `precio_unitario` (ADR-0044), pero `registrar_venta`
-- (0011_venta_con_comprobante.sql, líneas 114-117) seguía insertando el precio
-- tal cual llegaba del navegador: cualquiera con sesión podía mandar S/1.00 por
-- una blusa de S/79.90 desde la consola y la venta entraba. Un candado de
-- pantalla no es un candado (BACKLOG: «el precio lo pone el navegador»).
--
-- Qué hace: ANTES de escribir nada, compara cada `precio_unitario` con
-- `variantes.precio` vigente, a 2 decimales. Si difiere levanta
-- `venta_precio_cambiado` con la prenda en `detail` — el nombre es estable (como
-- el de una restricción) y `apps/web/lib/error-escritura.ts` lo vuelve frase:
-- «El precio de Blusa Emma (BLU-EMMA-BEI-S) cambió: quítala del ticket y vuelve a
-- agregarla». Excepción por diseño: la variante centinela de «Cargo especial»
-- (20260912234726_cargo_especial_pos.sql), cuyo precio lo escribe la caja.
--
-- El descuento (`descuento_unitario`) NO se toca acá: quién puede descontar y
-- hasta cuánto es la migración siguiente (códigos de descuento).
--
-- Drop por firma completa y recreate, no `create or replace`: así la firma queda
-- escrita y el día que cambie un tipo de parámetro no queda una función vieja
-- viva al lado de la nueva. Los grants se vuelven a dar porque el drop los borra.
--
-- ESTADO: aplicada en la base local el 2026-09-14. NO en producción — la pega
-- Felipe (D-11); ya lleva el prefijo `retail.`.
-- SE ROMPE SI: se cambia el precio de una variante mientras esa prenda está en un
-- ticket abierto — la venta falla con el mensaje de arriba y la colaboradora
-- vuelve a agregarla. Es el comportamiento buscado, no un bug.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text);

create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  -- Candado de precio
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Cada ítem contra el catálogo, antes de tocar una sola tabla: el precio que
  -- llega tiene que ser el vigente, salvo el Cargo especial (precio libre).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0))
        * (v_item ->> 'cantidad')::integer);
  end loop;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
  end loop;

  -- El comprobante nace acá, en la misma transacción: si emitir_comprobante()
  -- revienta (ej. sin serie registrada), toda la venta se revierte con él.
  if p_tipo_comprobante is not null then
    v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text) to authenticated;

comment on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text) is
  'Registra una venta con sus ítems, pagos y comprobante en una transacción. Desde 2026-09-14 rechaza precios distintos al catálogo (venta_precio_cambiado), salvo el Cargo especial.';

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260914215059', 'candado_precio_venta') on conflict (version) do nothing;
commit;


-- ============================================================================
-- 20260914215103_codigos_descuento.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ============================================================================
-- 20260914215103_codigos_descuento.sql — CAYLA V2
--
-- Quién puede descontar, y hasta cuánto. Desde el 2026-09-14 la caja aplica
-- descuentos por prenda o al ticket entero (ADR-0044) y viajan como
-- `descuento_unitario` — pero la base los aceptaba de cualquiera, sin tope.
-- Decisión de Felipe (2026-09-14, BACKLOG «códigos de descuento», 1-A):
--
--   · Un Líder descuenta sin código.
--   · Una Colaboradora (rol de 0016_roles_colaborador.sql) necesita un código
--     válido para cualquier `descuento_unitario > 0`, y el % del código es el
--     TOPE de cada línea.
--
-- Qué hace: tabla `codigos_descuento` (el código, su %, vigencia, activo, sede
-- o todas, quién lo creó) con RLS — leerla puede cualquiera con sesión;
-- crear/editar solo `fn_es_lider()`; borrar nadie (se apaga con `activo`).
-- `registrar_venta` gana `p_codigo_descuento text default null` y aplica la
-- regla ANTES de escribir nada, con nombres estables que
-- `apps/web/lib/error-escritura.ts` vuelve frase:
--   venta_descuento_requiere_codigo  → «necesitas un código válido…»
--   venta_codigo_descuento_invalido  → «El código X no es válido o ya venció…»
--   venta_descuento_supera_codigo    → «Ese código permite hasta un N %…»
--
-- Sin pantalla de administración por ahora: los códigos se crean en Studio
-- (BACKLOG: paso propio). La venta NO guarda qué código usó — si un día hace
-- falta medir cuánto se regala por código, es una columna en `ventas`, no un
-- cambio de esta regla.
--
-- Drop por firma de 9 parámetros (la de 20260914215059_candado_precio_venta)
-- y recreate con 10; los grants se vuelven a dar.
--
-- ESTADO: aplicada en la base local el 2026-09-14. NO en producción — la pega
-- Felipe (D-11); ya lleva el prefijo `retail.`.
-- SE ROMPE SI: se quita `fn_es_lider()` del `with check` — cualquier
-- colaboradora podría crearse su propio código del 100 %.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- la tabla ----------
create table retail.codigos_descuento (
  codigo text primary key,
  porcentaje numeric(5, 2) not null,
  vigente_desde date,
  vigente_hasta date,
  activo boolean not null default true,
  -- null = vale en todas las sedes
  ubicacion_id uuid references retail.ubicaciones(id),
  creado_por uuid references public.personas(id),
  created_at timestamptz not null default now(),
  constraint codigos_descuento_porcentaje_valido check (porcentaje > 0 and porcentaje <= 100),
  constraint codigos_descuento_codigo_formato check (codigo = upper(btrim(codigo)) and length(codigo) between 3 and 20),
  constraint codigos_descuento_vigencia_coherente check (vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta)
);

comment on table retail.codigos_descuento is
  'Códigos que autorizan a una Colaboradora a descontar en Vender; el % es el tope por línea. Un Líder no los necesita. Se apagan con activo=false, nunca se borran.';

alter table retail.codigos_descuento enable row level security;

create policy codigos_descuento_select on retail.codigos_descuento
  for select using (auth.role() = 'authenticated');
create policy codigos_descuento_insert on retail.codigos_descuento
  for insert with check (retail.fn_es_lider());
create policy codigos_descuento_update on retail.codigos_descuento
  for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());
-- Sin policy de delete: un código que ya se usó es historia.

grant select on retail.codigos_descuento to authenticated;
grant insert, update on retail.codigos_descuento to authenticated;

-- ---------- registrar_venta: aprende p_codigo_descuento ----------
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text);

create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  -- Candado de precio (20260914215059)
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Códigos de descuento
  v_descuento numeric;
  v_hay_descuento boolean := false;
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Cada ítem contra el catálogo, antes de tocar una sola tabla: el precio que
  -- llega tiene que ser el vigente, salvo el Cargo especial (precio libre).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0);
    if v_descuento > 0 then v_hay_descuento := true; end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento) * (v_item ->> 'cantidad')::integer);
  end loop;

  -- Quién descuenta: un Líder solo; una Colaboradora, con código válido y hasta su %.
  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= current_date)
        and (vigente_hasta is null or vigente_hasta >= current_date)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    -- Un centavo de tolerancia: la caja redondea en coma flotante y acá en decimal.
    for v_item in select * from jsonb_array_elements(p_items) loop
      if coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
         > round((v_item ->> 'precio_unitario')::numeric * v_codigo.porcentaje / 100, 2) + 0.01 then
        raise exception 'venta_descuento_supera_codigo'
          using detail = trim(trailing '.' from trim(trailing '0' from v_codigo.porcentaje::text)),
                hint = format('La línea %s pide S/%s de descuento', v_item ->> 'variante_id', v_item ->> 'descuento_unitario');
      end if;
    end loop;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
  end loop;

  -- El comprobante nace acá, en la misma transacción: si emitir_comprobante()
  -- revienta (ej. sin serie registrada), toda la venta se revierte con él.
  if p_tipo_comprobante is not null then
    v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text) to authenticated;

comment on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text) is
  'Registra una venta con sus ítems, pagos y comprobante en una transacción. Rechaza precios distintos al catálogo (venta_precio_cambiado) y, para una Colaboradora, descuentos sin código válido o por encima de su % (venta_descuento_*).';

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260914215103', 'codigos_descuento') on conflict (version) do nothing;
commit;


-- ============================================================================
-- 20260914220000_stock_por_sede.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ============================================================================
-- 20260914220000_stock_por_sede.sql — CAYLA V2
--
-- «No hay tu talla aquí, pero sí en Trujillo» es la venta que se pierde en el
-- mostrador. Vender ya muestra dónde más hay stock (vender/page.tsx +
-- lib/stock-por-sede.ts), pero lo lee de `stock` directo, y `stock_select`
-- deja ver SOLO las sedes que la persona puede operar
-- (fn_puede_operar_ubicacion): una Líder ve todas; una colaboradora con sede
-- fija (0016) ve solo la suya — justo la encargada de sede que necesita el
-- dato lo recibe vacío. Medido el 2026-09-14 con el JWT de Micaela como
-- colaboradora de Trujillo: Taller 0 filas, Lima 0, Trujillo 16.
--
-- Esta función expone CANTIDADES por sede a cualquier persona con acceso a
-- retail, sin ampliar `stock_select` — esa policy también guarda quién puede
-- OPERAR una sede (vender, mover, contar) y no debe abrirse por esto.
-- Solo lectura, sin argumentos: el catálogo entero son unos cientos de filas.
--
-- ESTADO: NO APLICADA (ni local ni producción) al escribirse. Aplicar esquema
-- en la base local compartida no era de la sesión que la escribió; la aplica
-- Felipe. Hasta entonces `vender/page.tsx` sigue leyendo `stock` directo (para
-- Líderes ya funciona) — cambiarlo a `supabase.rpc("fn_stock_por_sede")` es
-- un commit chico DESPUÉS de aplicarla, nunca antes (datos:comparar avisaría).
--
-- SE ROMPE SI: se quita el `exists` sobre `colaboradores` — cualquier sesión
-- de Dynamic sin acceso a retail podría leer el stock de todas las tiendas.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_stock_por_sede()
returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select s.variante_id, s.ubicacion_id, s.cantidad
  from stock s
  join ubicaciones u on u.id = s.ubicacion_id and u.activo
  where exists (
    select 1
    from colaboradores c
    join public.personas p on p.id = c.persona_id
    where p.auth_user_id = auth.uid() and p.estado = 'activo'
  );
$$;

revoke all on function retail.fn_stock_por_sede() from public;
grant execute on function retail.fn_stock_por_sede() to authenticated;

comment on function retail.fn_stock_por_sede() is
  'Cantidades de stock por sede (solo ubicaciones activas) para cualquier persona con acceso a retail. Solo lectura; no amplía stock_select.';

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260914220000', 'stock_por_sede') on conflict (version) do nothing;
commit;


-- ============================================================================
-- 20260914220804_nota_en_ventas.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ============================================================================
-- 20260914220804_nota_en_ventas.sql — CAYLA V2
--
-- «Lo recoge el sábado», «va con arreglo de bastilla»: la venta tenía dónde
-- guardar cuánto, cómo se pagó y a nombre de quién, pero no una línea de texto
-- de la colaboradora. Pedido de Felipe (2026-09-14).
--
-- Qué hace: `ventas.nota` (hasta 200 caracteres), `registrar_venta` gana `p_nota`
-- (drop por firma de 10 —la de 20260914215103— y recreate con 11; vacía se guarda
-- como null) y `fn_ventas_del_dia` devuelve `nota` al final — drop + create
-- porque cambia el `returns table` y `create or replace` no puede. Aditivo para
-- sus dos consumidores (vender/page.tsx y Facturación).
--
-- La nota NO va al comprobante: SUNAT no la lleva y no es dato fiscal. Y es
-- parte del ticket, no del cobro: el «ticket en espera» (paso siguiente) la
-- guarda y la recupera junto con las líneas.
--
-- ESTADO: aplicada en la base local el 2026-09-14. NO en producción — la pega
-- Felipe (D-11), junto con las dos anteriores; ya lleva el prefijo `retail.`.
-- SE ROMPE SI: alguien recrea `fn_ventas_del_dia` sin `nota` — «Ventas de hoy»
-- dejaría de mostrarla sin que nada avise (no hay test sobre la función).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.ventas
  add column nota text,
  add constraint ventas_nota_corta check (char_length(nota) <= 200);

comment on column retail.ventas.nota is
  'Nota libre de la colaboradora sobre esta venta (recojo, arreglo, aviso). Hasta 200 caracteres. No va al comprobante.';

-- ---------- registrar_venta: aprende p_nota ----------
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text);

create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  -- Candado de precio (20260914215059)
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Códigos de descuento
  v_descuento numeric;
  v_hay_descuento boolean := false;
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Cada ítem contra el catálogo, antes de tocar una sola tabla: el precio que
  -- llega tiene que ser el vigente, salvo el Cargo especial (precio libre).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0);
    if v_descuento > 0 then v_hay_descuento := true; end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento) * (v_item ->> 'cantidad')::integer);
  end loop;

  -- Quién descuenta: un Líder solo; una Colaboradora, con código válido y hasta su %.
  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= current_date)
        and (vigente_hasta is null or vigente_hasta >= current_date)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    -- Un centavo de tolerancia: la caja redondea en coma flotante y acá en decimal.
    for v_item in select * from jsonb_array_elements(p_items) loop
      if coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
         > round((v_item ->> 'precio_unitario')::numeric * v_codigo.porcentaje / 100, 2) + 0.01 then
        raise exception 'venta_descuento_supera_codigo'
          using detail = trim(trailing '.' from trim(trailing '0' from v_codigo.porcentaje::text)),
                hint = format('La línea %s pide S/%s de descuento', v_item ->> 'variante_id', v_item ->> 'descuento_unitario');
      end if;
    end loop;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    -- La nota del ticket («lo recoge el sábado»): vacía se guarda como null, nunca ''.
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''))
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
  end loop;

  -- El comprobante nace acá, en la misma transacción: si emitir_comprobante()
  -- revienta (ej. sin serie registrada), toda la venta se revierte con él.
  if p_tipo_comprobante is not null then
    v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text) to authenticated;

comment on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text) is
  'Registra una venta con sus ítems, pagos, nota y comprobante en una transacción. Rechaza precios distintos al catálogo (venta_precio_cambiado) y, para una Colaboradora, descuentos sin código válido o por encima de su % (venta_descuento_*).';

-- ---------- fn_ventas_del_dia: devuelve la nota ----------
-- Misma consulta de 0011 (una fila por venta del día, hora Lima, líder ve todas o
-- filtra una, integrante solo la suya) + `nota` como última columna.
drop function if exists retail.fn_ventas_del_dia(uuid);

create function retail.fn_ventas_del_dia(p_ubicacion_id uuid default null)
returns table (
  venta_id uuid,
  hora text,
  ubicacion_nombre text,
  vendedor text,
  cliente_nombre text,
  items jsonb,
  total numeric,
  metodos_pago text,
  comprobante_tipo text,
  comprobante_texto text,
  comprobante_estado text,
  nota text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    coalesce(per.nombres || ' ' || per.apellidos, '—'),
    coalesce(cli.nombre, 'Cliente varios'),
    (select jsonb_agg(jsonb_build_object(
        'referencia', pr.referencia, 'talla', va.talla, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario
      ) order by vi.id)
      from venta_items vi
      join variantes va on va.id = vi.variante_id
      join productos pr on pr.id = va.producto_id
      left join colores co on co.codigo = va.color_codigo
      where vi.venta_id = v.id),
    (select coalesce(sum(vi.subtotal), 0) from venta_items vi where vi.venta_id = v.id),
    (select string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id),
    cmp.tipo,
    case when cmp.id is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') else null end,
    cmp.estado,
    v.nota
  from ventas v
  join ubicaciones u on u.id = v.ubicacion_id
  left join public.personas per on per.id = v.usuario_id
  left join clientes cli on cli.id = v.cliente_id
  left join comprobantes cmp on cmp.venta_id = v.id
  where (v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
    and (
      (fn_es_lider() and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
      or (not fn_es_lider() and v.ubicacion_id = fn_ubicacion_actual_persona())
    )
  order by v.created_at desc;
$$;

grant execute on function retail.fn_ventas_del_dia(uuid) to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260914220804', 'nota_en_ventas') on conflict (version) do nothing;
commit;


-- ============================================================================
-- 20260912235600_activos_fijos.sql  (contenido literal del repo)
-- ============================================================================
begin;
set local search_path = retail, public, extensions;

-- ============================================================================
-- 0015 — Activos fijos: la única tabla con datos reales que V2 no rescató
--
-- QUÉ ARREGLA
--   El corte V1→V2 (commit 0af2f1b) dejó fuera Producción, Finanzas,
--   Comercial y Taxonomía universal porque su data en retail era de prueba —
--   confirmado contra el volcado real de producción del 2026-09-12
--   (`docs/datos/generado/retail_filas.json`, rama trix/catalogo-vocabulario):
--   `gastos`, `patrimonio_items`, `asientos`, `cuentas_contables` están en
--   CERO filas. Pero `activos_fijos` tiene **39 filas reales** — el registro
--   físico de equipos/mobiliario/máquinas del Taller, cargado una sola vez.
--   Sin esta migración, esa tabla se queda sin pantalla que la lea o la
--   edite el día que se pegue este núcleo en producción.
--
-- QUÉ SE SIMPLIFICA A PROPÓSITO
--   La versión V1 (`0022_activos_fijos.sql`) liga cada activo a
--   `cuentas_contables.codigo` — pero Contabilidad (`asientos`,
--   `cuentas_contables`) es justo una de las piezas con cero data real, y no
--   se está reconstruyendo hoy. Exigir esa FK aquí bloquearía traer los 39
--   activos reales hasta que Contabilidad exista en V2. Se deja
--   `cuenta_codigo` como texto libre (el código NIIF/SUNAT, ej. "336"),
--   documentado pero sin candado — cuando Contabilidad se reconstruya sobre
--   V2, esa migración agrega la FK real y valida lo que ya haya.
-- ============================================================================

create table retail.activos_fijos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  nombre text not null,
  serie text,
  descripcion text,
  cuenta_codigo text, -- código NIIF/SUNAT (333/335/336); sin FK hasta que Contabilidad exista en V2
  costo numeric(14, 2) not null,
  valor_residual numeric(14, 2) not null default 0,
  vida_util_meses integer not null,
  tasa_anual numeric(5, 4) not null, -- 0.1000 = 10%
  fecha_adquisicion date not null,
  depreciacion_apertura numeric(14, 2) not null default 0,
  estado text not null default 'activo' check (estado in ('activo', 'baja', 'vendido')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activos_fijos_ubicacion_idx on retail.activos_fijos (ubicacion_id);

create or replace function retail.fn_activos_fijos_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger activos_fijos_set_updated_at before update on retail.activos_fijos
  for each row execute function retail.fn_activos_fijos_set_updated_at();

alter table retail.activos_fijos enable row level security;
create policy activos_fijos_select on retail.activos_fijos
  for select using (auth.role() = 'authenticated');
create policy activos_fijos_write_lider on retail.activos_fijos
  for all using (retail.fn_es_lider()) with check (retail.fn_es_lider());

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260912235600', 'activos_fijos') on conflict (version) do nothing;
commit;


-- Comprobar en producción, después de pegar (un booleano por migración; todos deben dar true)
select
  exists (select 1 from retail.variantes where id='22222222-2222-4222-8222-222222222222') as cargo_especial_pos,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='retail' and p.proname='registrar_pagos_compra') as compras_multipago,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='retail' and p.proname='registrar_venta' and pg_get_functiondef(p.oid) like '%c_cargo_especial%') as candado_precio_venta,
  to_regclass('retail.codigos_descuento') is not null as codigos_descuento,
  to_regprocedure('retail.fn_stock_por_sede()') is not null as stock_por_sede,
  exists (select 1 from information_schema.columns where table_schema='retail' and table_name='ventas' and column_name='nota') as nota_en_ventas,
  to_regclass('retail.activos_fijos') is not null as activos_fijos,
  (select string_agg(p.pronargs::text, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='retail' and p.proname='registrar_venta') as registrar_venta_parametros_debe_ser_11;
