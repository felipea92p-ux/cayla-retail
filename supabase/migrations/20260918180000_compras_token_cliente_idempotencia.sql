-- ============================================================================
-- 20260918180000_compras_token_cliente_idempotencia.sql — CAYLA V2
--
-- RECONCILIACIÓN CON PRODUCCIÓN, NO EL ORIGINAL. En producción existen `compras.token_cliente`,
-- su índice único y `registrar_compra(..., p_token)`. Ninguna migración del repo los crea:
-- se detectó el 2026-09-18 al comparar `retail` por huella md5 (BACKLOG, "Comparación
-- completa `retail`"), y la cabecera de `pegar-en-produccion-compras-atraso-recepcion.sql`
-- ya los llamaba "un fantasma". El registro de migraciones de producción tampoco guarda
-- ninguna sentencia que los cree (las que mencionan tokens son de ventas, cambios y
-- productos), así que esto se reprodujo desde el estado vivo: la definición de `pg_proc`,
-- `information_schema` y `pg_indexes`.
--
-- QUÉ ES. El mismo candado de idempotencia de ventas, cambios y producciones: el navegador
-- genera un token una vez por formulario; si el primer envío llegó pero la respuesta se cortó,
-- el reintento con el MISMO token devuelve la compra que ya existe en vez de duplicarla.
--
-- ESTADO REAL. El front actual (`CompraFormV2.tsx`) NO manda `p_token`, así que hoy este
-- candado está dormido: contra un doble clic, "Nueva compra" se apoya en la llave única
-- (proveedor, serie, número), que devuelve el error "ya está registrada" en vez de un éxito
-- idempotente. Que el front lo mande queda como mejora aparte (BACKLOG). Sin `p_token`, todo
-- funciona igual que antes: varias compras con `token_cliente` nulo caben en el índice único.
--
-- POR QUÉ UNA MIGRACIÓN NUEVA y no editar `20260918130000_compras_atraso_recepcion`: esa ya
-- está aplicada en el local y hay que dejar el historial quieto. Esta va DESPUÉS: `20260918130000`
-- crea `registrar_compra` con 14 parámetros (con `p_fecha_estimada_llegada`, sin token); acá se
-- borra esa firma y queda la de 15, que es la que tiene producción. Producción ya tiene el
-- resultado del archivo de "pegar" de esa migración (la fecha estimada y el token juntos), así
-- que ese archivo queda gastado.
--
-- IDEMPOTENTE: pegarla en producción no cambia nada. `add column if not exists`,
-- `create unique index if not exists`, `drop function if exists` de una firma que allá no
-- existe, `create or replace` con el cuerpo idéntico (mismos permisos) y un `revoke`/`grant`
-- que ya están así.
--
-- SE ROMPE SI: una migración nueva vuelve a definir `registrar_compra` partiendo del cuerpo de
-- `20260918130000` (sin `p_token`): dejaría dos sobrecargas o borraría el candado. Parte
-- siempre del cuerpo vivo (`pg_get_functiondef`).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.compras add column if not exists token_cliente uuid;
create unique index if not exists compras_token_cliente_key on retail.compras (token_cliente);

-- La firma de 14 parámetros de 20260918130000 (con la fecha, sin token).
drop function if exists retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, date);

create or replace function retail.registrar_compra(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_ubicacion_destino_id uuid,
  p_items jsonb,
  p_tipo text default 'factura',
  p_fecha_emision date default current_date,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,
  p_nota text default null,
  p_total numeric default null,
  p_token uuid default null,
  p_fecha_estimada_llegada date default null
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
  v_existente compras%rowtype;
  v_constraint text;
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

  -- Reintento honesto: el primer envío sí llegó, solo se cortó la respuesta.
  -- Se devuelve la compra que ya existe sin volver a escribir nada.
  if p_token is not null then
    select * into v_existente from compras where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

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
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_token, p_fecha_estimada_llegada
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'compras_token_cliente_key' then
      select * into v_existente from compras where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

revoke all on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) from public;
grant execute on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) to authenticated;
