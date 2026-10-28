-- ============================================================================
-- 20260930123000_registrar_compra_costo_atipico.sql
-- Registrar una factura pide confirmación si el costo de una línea es atípico (Felipe, 2026-09-30) — actividad 4 de 5
--
-- EL PROBLEMA PRIMERO. Registrar una factura NO mueve `variantes.costo` (el costo entra al promedio cuando se RECIBE la
-- mercadería, con el costo de esta línea), pero sí fija lo que se le debe al proveedor y el costo con el que va a entrar. Un
-- cero de más tecleado acá infla «Por pagar» y, al recibir, contamina el costo de la prenda en las tres sedes; y quien recibe
-- no ve montos, así que ya no hay quién lo mire. El «total del papel» que manda la pantalla NO protege: lo calcula la propia
-- pantalla sumando las mismas líneas (`totalesCompra`), así que siempre cuadra con lo que se tecleó.
--
-- CÓMO VIAJA LA CONFIRMACIÓN (decisión de Felipe, 2026-09-30: «decide tú»). Donde hay UNA sola cosa que confirmar (una orden del
-- Taller) va un parámetro; donde hay VARIAS líneas, la confirmación viaja en CADA línea: `"confirma_costo": true` dentro del
-- ítem. Así la base acepta exactamente las líneas que se vieron, y NO cambia la firma: esta función la nombran por su firma exacta
-- de 15 tipos ~10 migraciones y 3 pruebas que las reaplican.
--
-- QUIÉN CONFIRMA (decisión de Felipe, 2026-09-30): quien registra, porque para llegar acá hace falta el módulo Facturas de compra
-- en su rol: ve los montos y tiene el papel en la mano, que es el mejor lugar para decir «sí, el papel dice 70». Por eso acá no
-- hay `costo_atipico_sin_lider`: a diferencia de recibir un lote, quien llega hasta este punto ya ve dinero.
--
-- QUÉ PROMETE. Después de todas las validaciones de siempre y ANTES de escribir nada, se compara el costo de cada línea con
-- el costo vigente de su prenda (la variante que nombra o, si solo nombra el producto, la mediana de los costos positivos de
-- sus variantes; y el precio más bajo) con `fn_costo_fuera_de_banda` (20260930120000). Los costos son SIN IGV, como los guarda
-- la función. Las líneas atípicas que NO traen la marca vuelven en `costo_atipico` con `detail` JSON `{"items":[{linea,
-- producto_id, variante_id, sku, motivo, costo_unitario, costo_vigente, precio}, …]}` y no se escribe nada (todo o nada). Con
-- las marcas, la factura se registra y deja constancia en su nota, sin montos. Marcar una línea que no es atípica no hace nada.
-- Sin costo no hay línea (el costo es obligatorio en una factura); un costo de 0 es un obsequio y no se pregunta. El rechazo
-- ocurre antes de insertar la compra, así que no consume el token de idempotencia: el reintento con las marcas es el mismo intento.
--
-- QUÉ NO CAMBIA. La firma de 15 parámetros, los permisos, ni una sola validación ni escritura: lo único nuevo es el bloque marcado
-- «COSTO ATÍPICO» y que la nota de la compra sale de `v_nota` (la nota de siempre + la constancia, si la hay).
--
-- ORDEN PARA PRODUCCIÓN: SQL y web en cualquier orden (la web NO manda la marca en el primer intento, solo en el reintento
-- tras `costo_atipico`, que la base vieja nunca levanta). Requiere antes 20260930120000. PARA PEGAR: trae `set search_path`.
--
-- BASE DEL CUERPO. La definición viva de producción (2026-09-30): su huella normalizada —sin comentarios ni espacios— coincide
-- con la de una base que aplicó todas las migraciones del repo, así que el cuerpo de abajo ya trae TODOS los parches por ancla
-- que recibió (ADR-0135, ADR-0139, ADR-0162, ADR-0184…): `pg_temp.cambiar`/`reemplazar_vivo` de esas migraciones saltan si ya
-- ven su texto nuevo. Nada cambia más que lo marcado con «COSTO ATÍPICO».
--
-- CÓMO SE DESHACE. Volver a crear `retail.registrar_compra` con el cuerpo de 20260918219100 + los parches posteriores (20260919181000,
-- 20260923180200…), misma firma; o, más simple, quitar el bloque «COSTO ATÍPICO» y que la nota vuelva a ser `p_nota`.
-- ============================================================================

set search_path = retail, public, extensions;

CREATE OR REPLACE FUNCTION retail.registrar_compra(p_proveedor_id uuid, p_serie text, p_numero text, p_condicion text, p_ubicacion_destino_id uuid, p_items jsonb, p_tipo text DEFAULT 'factura'::text, p_fecha_emision date DEFAULT CURRENT_DATE, p_fecha_vencimiento date DEFAULT NULL::date, p_igv_porcentaje numeric DEFAULT 18, p_pago jsonb DEFAULT NULL::jsonb, p_nota text DEFAULT NULL::text, p_total numeric DEFAULT NULL::numeric, p_token uuid DEFAULT NULL::uuid, p_fecha_estimada_llegada date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric;
  v_unidades numeric := 0;
  v_pago_id uuid;
  v_pagos jsonb; v_pago jsonb; v_monto numeric; v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
  v_existente compras%rowtype;
  v_constraint text;
  -- reparto por tienda (ADR-0139)
  v_n integer := 0; v_n2 integer := 0; v_item_id uuid;
  v_destinos jsonb; v_dest jsonb; v_suma_dest integer; v_vistos uuid[];
  v_repartos jsonb[] := '{}';
  -- COSTO ATÍPICO
  v_atipicos jsonb; v_sin_marca jsonb; v_nota text;
begin
  -- ADR-0184: la tienda que gestiona el comprobante (donde queda el papel) es `p_ubicacion_destino_id`.
  if p_ubicacion_destino_id is null then
    raise exception 'Elige la tienda que gestiona el comprobante';
  end if;
  if retail.fn_puede_registrar_facturas_compra() and not retail.fn_puede_comprar_en(p_ubicacion_destino_id) then
    raise exception 'La tienda que gestiona el comprobante tiene que ser una de las tuyas' using errcode = '42501';
  end if;
  if not retail.fn_puede_registrar_facturas_compra() then
    raise exception 'Registrar un comprobante de compra necesita el módulo Facturas de compra en tu rol' using errcode = '42501';
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
    -- Reparto por tienda (ADR-0139): sin `destinos`, la línea va entera a `p_ubicacion_destino_id`.
    v_n := v_n + 1;
    v_destinos := case
      when jsonb_typeof(v_item -> 'destinos') = 'array' and jsonb_array_length(v_item -> 'destinos') > 0
        then v_item -> 'destinos'
      when p_ubicacion_destino_id is not null
        then jsonb_build_array(jsonb_build_object('ubicacion_id', p_ubicacion_destino_id, 'cantidad', (v_item ->> 'cantidad')::integer))
      else null end;
    if v_destinos is null then
      raise exception 'La línea % necesita saber a qué tienda va: elige el destino del comprobante o reparte la línea entre tiendas', v_n;
    end if;
    v_suma_dest := 0;
    v_vistos := '{}';
    for v_dest in select * from jsonb_array_elements(v_destinos) loop
      if (v_dest ->> 'ubicacion_id') is null
         or not exists (select 1 from ubicaciones where id = (v_dest ->> 'ubicacion_id')::uuid and activo) then
        raise exception 'La línea %: una de las tiendas del reparto no existe o está inactiva', v_n;
      end if;
      if coalesce((v_dest ->> 'cantidad')::integer, 0) <= 0 then
        raise exception 'La línea %: cada tienda del reparto necesita una cantidad mayor a cero', v_n;
      end if;
      if (v_dest ->> 'ubicacion_id')::uuid = any (v_vistos) then
        raise exception 'La línea %: una tienda aparece dos veces en el reparto', v_n;
      end if;
      v_vistos := v_vistos || (v_dest ->> 'ubicacion_id')::uuid;
      v_suma_dest := v_suma_dest + (v_dest ->> 'cantidad')::integer;
    end loop;
    if v_suma_dest <> (v_item ->> 'cantidad')::integer then
      raise exception 'La línea % trae % unidades pero el reparto entre tiendas suma %: tiene que sumar lo facturado', v_n, (v_item ->> 'cantidad')::integer, v_suma_dest;
    end if;
    v_repartos := array_append(v_repartos, v_destinos);
    v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;
    v_unidades := v_unidades + (v_item ->> 'cantidad')::integer;
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
    -- A1 (ADR-0135): el costo unitario llega redondeado a 2 decimales (numeric(12,2)) y ese medio centavo, agrandado
    -- por el IGV (x 1.18 = 0.006), se multiplica por la cantidad. La tolerancia sigue al redondeo: 0.01 por línea (+1
    -- por el IGV y el papel) más 0.006 por unidad. Un descuadre real (S/ 5, o S/ 0.50 en una unidad) sigue fuera.
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1) + 0.006 * v_unidades;
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
    v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, fn_hoy_lima());
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      -- M3 (ADR-0135): se mira el valor CRUDO; con la variable en numeric(12,2) el cast redondeaba en silencio (10.005 -> 10.01)
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto;
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
        raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
      end if;
      -- M2 (ADR-0135): cada fecha que llegue no puede ser futura ni anterior a la emisión del comprobante
      perform fn_validar_fecha_pago_compra(
        nullif(v_pago ->> 'fecha', '')::date,
        coalesce(p_fecha_emision, fn_hoy_lima()),
        upper(trim(p_serie)) || '-' || trim(p_numero)
      );
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if p_condicion = 'contado' and v_pago_suma <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_suma;
    end if;
    if v_pago_suma > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_suma, v_total;
    end if;
  end if;

  if not exists (
    select 1 from unnest(v_repartos) r cross join lateral jsonb_array_elements(r) d
    where (d ->> 'ubicacion_id')::uuid = p_ubicacion_destino_id
  ) then
    raise exception 'La tienda que gestiona el comprobante tiene que recibir parte de la mercadería';
  end if;
  if p_pago is not null and not retail.fn_puede_pagar_compras() then
    raise exception 'Pagar al registrar necesita el módulo Por pagar en tu rol: regístralo al crédito y págalo desde Por pagar' using errcode = '42501';
  end if;

  -- COSTO ATÍPICO. El costo de cada línea se compara con el costo vigente de su prenda: el de la variante que nombra o, si solo
  -- nombra el producto, la mediana de los costos positivos de sus variantes (y el precio más bajo). Se juzgan solo las líneas con
  -- costo POSITIVO (un 0 es un obsequio). Quien llega hasta aquí ya tiene el módulo Facturas de compra —ve los montos y tiene el
  -- papel en la mano—, así que puede confirmar: la confirmación viaja en CADA línea (`"confirma_costo": true`) y solo vale para
  -- las que de verdad salen atípicas. Registrar la factura NO mueve `variantes.costo` (eso pasa al recibirla), pero fija lo que
  -- se le debe al proveedor y el costo con el que entrará a la prenda: acá es donde alguien mira el papel.
  select jsonb_agg(jsonb_build_object(
           'linea', e.pos, 'producto_id', e.item ->> 'producto_id', 'variante_id', nullif(e.item ->> 'variante_id', ''),
           'sku', coalesce(ref.sku, ref.referencia), 'motivo', x.motivo,
           'costo_unitario', (e.item ->> 'costo_unitario')::numeric, 'costo_vigente', ref.vigente, 'precio', ref.precio,
           'confirmada', coalesce((e.item -> 'confirma_costo') = 'true'::jsonb, false)
         ) order by e.pos)
    into v_atipicos
    from jsonb_array_elements(p_items) with ordinality as e(item, pos)
   cross join lateral (
      select pr.referencia,
             case when count(*) = 1 then min(vr.sku) end as sku,
             (percentile_cont(0.5) within group (order by vr.costo) filter (where vr.costo > 0))::numeric as vigente,
             min(vr.precio) filter (where vr.precio > 0) as precio
        from productos pr
        join variantes vr on vr.producto_id = pr.id
       where pr.id = (e.item ->> 'producto_id')::uuid
         and (nullif(e.item ->> 'variante_id', '') is null or vr.id = (e.item ->> 'variante_id')::uuid)
       group by pr.referencia
    ) ref
   cross join lateral (
     select retail.fn_costo_fuera_de_banda((e.item ->> 'costo_unitario')::numeric, ref.vigente, ref.precio) as motivo
   ) x
   where (e.item ->> 'costo_unitario') is not null
     and (e.item ->> 'costo_unitario')::numeric > 0
     and x.motivo is not null;

  if v_atipicos is not null then
    select jsonb_agg(a - 'confirmada') into v_sin_marca
      from jsonb_array_elements(v_atipicos) a
     where not (a ->> 'confirmada')::boolean;
    if v_sin_marca is not null then
      raise exception 'costo_atipico' using detail = jsonb_build_object('items', v_sin_marca)::text;
    end if;
  end if;
  v_nota := concat_ws(' · ', p_nota, case when v_atipicos is not null
    then 'Costo atípico confirmado al registrar (' || jsonb_array_length(v_atipicos)
         || case when jsonb_array_length(v_atipicos) = 1 then ' línea)' else ' líneas)' end end);

  v_persona := retail.fn_actor_persona_id(true);

  insert into compras (
    proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
    subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada, ubicacion_gestion_id
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    v_subtotal, v_igv, v_total, v_nota, v_persona, p_token, p_fecha_estimada_llegada, p_ubicacion_destino_id
  ) returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_n2 := v_n2 + 1;
    insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)
      values (
        v_compra_id,
        (v_item ->> 'producto_id')::uuid,
        (v_item ->> 'variante_id')::uuid,
        v_item ->> 'descripcion',
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric
      )
      returning id into v_item_id;

    for v_dest in select * from jsonb_array_elements(v_repartos[v_n2]) loop
      insert into compra_item_destinos (compra_item_id, ubicacion_id, cantidad)
        values (v_item_id, (v_dest ->> 'ubicacion_id')::uuid, (v_dest ->> 'cantidad')::integer);
    end loop;
  end loop;

  if v_pagos is not null then
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id)
        values (
          v_compra_id,
          v_pago_fecha,
          (v_pago ->> 'monto')::numeric,
          v_pago ->> 'metodo',
          nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''),
          v_persona,
          case when retail.fn_es_lider() then null else p_ubicacion_destino_id end, nullif(v_pago ->> 'cuenta_id', '')::uuid -- ADR-0184: la gestora
        )
        returning id into v_pago_id;
      -- Saldo a favor del proveedor como medio de pago (ADR-0111): descuenta del libro, con candado por proveedor.
      if v_pago ->> 'metodo' = 'saldo_a_favor' then
        perform fn_consumir_saldo_favor(p_proveedor_id, (v_pago ->> 'monto')::numeric, v_compra_id, v_pago_id, v_pago_fecha, v_persona);
      end if;
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
$function$;
