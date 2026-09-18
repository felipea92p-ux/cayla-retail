-- ============================================================================
-- El total del papel manda: `registrar_compra` acepta `p_total`
--
-- EL PROBLEMA (lo vio Felipe, 2026-09-14). Con el interruptor "El precio
-- incluye IGV", una línea de 1 × S/ 10.00 con IGV se guardaba así: base
-- 10 / 1.18 = 8.4746 → 8.47 (2 decimales), IGV = round(8.47 × 18 %) = 1.52,
-- total 9.99. El papel dice S/ 10.00 y "Por pagar" decía 9.99: un centavo
-- que no existe y que nunca cuadra con el pago.
--
-- LA CAUSA no es la pantalla: la RPC derivaba el total DESDE la base
-- (`v_total := v_subtotal + round(v_subtotal × pct)`). Cuando los precios
-- vienen con IGV incluido, la lectura correcta es la inversa — y es la que
-- usa SUNAT en sus propios comprobantes: el total es el dato, la base es
-- total / 1.18 y el IGV es lo que falta (total − base). El centavo de
-- redondeo lo absorbe el IGV, nunca el total.
--
-- LA REGLA: si la pantalla manda `p_total` (solo lo hace cuando el precio
-- incluye IGV), la RPC lo toma como el total del papel, exige que cuadre
-- con las líneas dentro de la tolerancia de redondeo (un centavo por línea
-- más uno), y guarda `igv = p_total − subtotal`. Sin `p_total` se comporta
-- exactamente como hasta hoy. En boleta y nota de venta (IGV 0) `p_total`
-- tiene que ser igual al subtotal: no hay IGV que absorba nada.
--
-- POR QUÉ NO SUBIR `costo_unitario` A 4 DECIMALES: guardaría 8.4746 y el
-- total saldría bien "por casualidad" en una línea, pero con 3 líneas de
-- 10 el subtotal es 25.4238 → 25.42, IGV 4.58, total 30.00… y con otras
-- cifras vuelve a fallar por un centavo. El redondeo hay que resolverlo
-- donde nace (el total del papel), no empujarlo un decimal más lejos.
--
-- DE PASO, EL INVARIANTE: `total = subtotal + igv` siempre fue cierto por
-- construcción pero no había candado. Ahora es un check. Antes de pegar en
-- producción, confirmar que ninguna fila lo viola (no debería):
--   select count(*) from retail.compras where total <> subtotal + igv;
--
-- AL APLICAR EN PRODUCCIÓN: lleva un DROP FUNCTION porque cambiar la lista
-- de parámetros de una función en Postgres crea una función NUEVA al lado
-- de la vieja (sobrecarga), y PostgREST no sabría a cuál llamar. El SQL
-- Editor avisa "destructive operations" por ese DROP: es la función, no
-- datos, y se vuelve a crear en la línea siguiente.
-- ============================================================================

alter table retail.compras
  add constraint compras_total_cuadra check (total = subtotal + igv);

comment on constraint compras_total_cuadra on retail.compras is
  'El total es siempre subtotal + igv. Cuando el papel trae precios con IGV, el igv absorbe el redondeo; el total nunca.';

drop function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text);

create function retail.registrar_compra(
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
  p_pago jsonb default null,           -- {monto, metodo, referencia?, fecha?} — obligatorio si contado
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
  v_producto uuid; v_variante uuid; v_pago_monto numeric(12, 2);
  v_tolerancia numeric(12, 2);
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

  if p_pago is not null then
    v_pago_monto := (p_pago ->> 'monto')::numeric;
    if v_pago_monto is null or v_pago_monto <= 0 then
      raise exception 'El pago necesita un monto mayor a cero';
    end if;
    if p_condicion = 'contado' and v_pago_monto <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_monto;
    end if;
    if v_pago_monto > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_monto, v_total;
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

  if p_pago is not null then
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
      values (
        v_compra_id,
        coalesce((p_pago ->> 'fecha')::date, current_date),
        v_pago_monto,
        p_pago ->> 'metodo',
        p_pago ->> 'referencia',
        v_persona
      );
  end if;

  return v_compra_id;
exception
  when unique_violation then
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

grant execute on function retail.registrar_compra to authenticated;
