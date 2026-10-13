-- ADR-0362 · fase 2, actividades 3 a 8 (Felipe 2026-10-12): registrar el comprobante de una orden de compra.
-- Contrato con la pantalla: docs/compras/ordenes-de-compra-2026-10/contrato-comprobante-de-orden.md.
--
-- EL PROBLEMA PRIMERO. La orden de compra (fase 1) dice qué se pidió, pero el papel del proveedor —la boleta, la nota de venta o la
-- factura— no tenía dónde registrarse: «Facturas de proveedor» pide una prenda en cada línea, y lo de una orden todavía no existe
-- como prenda (se pide por «categoría + marca»; la prenda se crea cuando llega). Sin el papel, la compra no entra a Por pagar, nadie
-- sabe cuánto de lo pedido ya está facturado y nada avisa cuando el proveedor manda de más. Y quien registra ese papel es la
-- compradora, que tiene «Órdenes de compra» y no necesariamente «Facturas de proveedor» ni «Por pagar» (decisión 42).
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `registrar_comprobante_orden(...)`: guarda el comprobante de una orden «generada» que tiene «Llega a», en una transacción:
--      `compras` (proveedor = el de la orden; tienda gestora = «Llega a»; naturaleza `mercaderia`; llegada estimada = la entrega de la
--      orden; `orden_compra_id`, `huella_envio`, `token_cliente`), `compra_items` SIN prenda (categoría y marca; la línea pedida de la
--      que sale, si sale de una), `compra_item_destinos` (todo a la gestora) y, al contado, `compra_pagos` a nombre de la EMPRESA (sin
--      tienda, decisión 41), con su cuenta sellada por `fn_compra_pagos_sellar` y el saldo a favor como medio (igual que
--      `registrar_compra`). Pide SOLO el módulo «Órdenes de compra», también para el contado (decisión 42). No toca stock ni
--      `movimientos`: la mercadería entra por guía (fase 4). Lo que pasa de lo pedido o no estaba en la orden se acepta y se AVISA en la
--      respuesta, sin bloquear (decisión 43). Con el mismo token y la misma huella devuelve lo mismo (doble clic, reintento sin red).
--   2. `fn_comprobante_orden_resultado(...)`: arma esa respuesta (`compra_id`, `documento`, `total`, `saldo`, `avisos`). Interna.
--   3. La clave `orden_compra_comprobante` en `acciones_sin_responsable` (decisión 39): con la cuenta de una persona firma ella, sin
--      combo; desde una terminal se elige quién (y si una terminal no elige, la función lo rechaza: un comprobante siempre tiene quién).
--   4. Sobre funciones que ya existen (REEMPLAZOS ANCLADOS sobre la definición viva, como 20261012204000):
--      · `editar_orden_compra`: no edita una orden que ya tiene algún comprobante, vigente o anulado (sus líneas son el respaldo del papel).
--      · `anular_orden_compra`: no anula una orden con un comprobante vigente.
--      · `anular_compra`: el comprobante que sale de una orden también lo anula quien tiene «Órdenes de compra». Sus guardas no cambian.
--      · `fn_orden_compra_detalle`: por línea, `id`, `facturado` (en comprobantes vigentes) y `pendiente`; y la orden suma `comprobantes`
--        (vigentes y anulados, el más reciente primero) y `papel` (`sin_comprobante` | `en_parte` | `completa`).
-- QUÉ NO HACE. Recibir y las lecturas de las líneas sin prenda (20261012210000). Una orden «Por repartir» todavía no registra
-- comprobante (pasa a la fase 3, Felipe 2026-10-12).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261012205000 (no depende de 20261012210000, pero va después
-- de ella en el orden de versiones). Sin tablas, sin políticas ni `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre
-- comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si una función viva cambió, y no hacen nada si ya están aplicados: se
-- puede pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012120000, 20261012202000 y 20261012204000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Con la cuenta de una persona, sin combo (decisión 39) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_compra_comprobante',
   'Registrar o anular el comprobante de una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 2. La respuesta: lo que se guardó y lo que hay que avisar ----------
-- `p_solo_anteriores`: en un reintento, «facturado antes» cuenta solo los comprobantes registrados hasta este, así la respuesta es la
-- misma que la primera vez aunque después se haya registrado otro papel de la misma orden.
create or replace function retail.fn_comprobante_orden_resultado(p_compra_id uuid, p_solo_anteriores boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'compra_id', c.id,
           'documento', c.documento,
           'total', c.total,
           'saldo', c.saldo,
           'avisos', coalesce((
             select jsonb_agg(a.aviso order by a.grupo, a.posicion, a.descripcion, a.esta_vez)
               from (
                 -- De más (decisión 43): lo facturado de una línea pedida en los OTROS comprobantes vigentes, más esta vez, pasa lo pedido.
                 select 1 as grupo,
                        oi.posicion,
                        null::text as descripcion,
                        ev.cantidad as esta_vez,
                        jsonb_build_object(
                          'tipo', 'de_mas',
                          'orden_compra_item_id', oi.id,
                          'posicion', oi.posicion,
                          'descripcion', concat_ws(' · ', cat.nombre, mar.nombre, oi.descripcion),
                          'pedido', oi.cantidad,
                          'facturado_antes', antes.cantidad,
                          'esta_vez', ev.cantidad) as aviso
                   from (select ci.orden_compra_item_id, sum(ci.cantidad)::integer as cantidad
                           from retail.compra_items ci
                          where ci.compra_id = c.id and ci.orden_compra_item_id is not null
                          group by ci.orden_compra_item_id) ev
                   join retail.orden_compra_items oi on oi.id = ev.orden_compra_item_id
                   join retail.categorias cat on cat.id = oi.categoria_id
                   join retail.marcas mar on mar.id = oi.marca_id
                  cross join lateral (
                    select coalesce(sum(x.cantidad), 0)::integer as cantidad
                      from retail.compra_items x
                      join retail.compras y on y.id = x.compra_id
                     where x.orden_compra_item_id = oi.id
                       and y.estado = 'vigente'
                       and y.id <> c.id
                       and (not p_solo_anteriores or y.created_at <= c.created_at)
                  ) antes
                  where antes.cantidad + ev.cantidad > oi.cantidad
                 union all
                 -- Fuera de la orden (decisión 43): cada línea que no sale de una línea pedida.
                 select 2,
                        null::integer,
                        concat_ws(' · ', cat.nombre, mar.nombre, ci.descripcion),
                        ci.cantidad,
                        jsonb_build_object(
                          'tipo', 'fuera_de_orden',
                          'descripcion', concat_ws(' · ', cat.nombre, mar.nombre, ci.descripcion),
                          'esta_vez', ci.cantidad)
                   from retail.compra_items ci
                   join retail.categorias cat on cat.id = ci.categoria_id
                   join retail.marcas mar on mar.id = ci.marca_id
                  where ci.compra_id = c.id and ci.orden_compra_item_id is null
               ) a
           ), '[]'::jsonb)
         )
    from retail.compras c
   where c.id = p_compra_id;
$$;
comment on function retail.fn_comprobante_orden_resultado(uuid, boolean) is
  'ADR-0362 (fase 2): la respuesta de registrar_comprobante_orden (compra_id, documento, total, saldo y los avisos de «de más» y '
  '«fuera de la orden»). Interna: solo la llama registrar_comprobante_orden, también en un reintento.';
revoke all on function retail.fn_comprobante_orden_resultado(uuid, boolean) from public, anon, authenticated;

-- ---------- 3. Registrar el comprobante de una orden ----------
create or replace function retail.registrar_comprobante_orden(
  p_orden_id uuid,
  p_tipo text,
  p_serie text,
  p_numero text,
  p_lineas jsonb,
  p_fecha_emision date default null,
  p_condicion text default 'credito',
  p_fecha_vencimiento date default null,
  p_suma_igv boolean default true,
  p_total numeric default null,
  p_pago jsonb default null,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_orden retail.ordenes_compra;
  v_item retail.orden_compra_items;
  v_huella text;
  v_existente record;
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_numero text := btrim(coalesce(p_numero, ''));
  v_emision date := coalesce(p_fecha_emision, retail.fn_hoy_lima());
  v_condicion text := coalesce(nullif(lower(btrim(p_condicion)), ''), 'credito');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_sin_pago boolean := p_pago is null or jsonb_typeof(p_pago) = 'null'
                        or (jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) = 0);
  v_linea jsonb;
  v_pos integer := 0;
  v_item_id uuid;
  v_categoria uuid;
  v_marca uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_costo numeric;
  v_sugerido numeric;
  v_lineas jsonb := '[]'::jsonb;
  v_unidades integer := 0;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric;
  v_con_igv boolean;
  v_tolerancia numeric;
  v_pagos jsonb;
  v_pago jsonb;
  v_monto numeric;
  v_cuenta uuid;
  v_pago_fecha date;
  v_pago_suma numeric := 0;
  v_pago_id uuid;
  v_compra_id uuid;
  v_documento text;
  v_restriccion text;
begin
  -- Permiso: SOLO el módulo Órdenes de compra, también para pagar al contado (decisión 42).
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Registrar el comprobante de una orden necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  -- Quién lo registra: con la cuenta de una persona, ella (`orden_compra_comprobante` está soltada del combo); desde una terminal, el
  -- responsable elegido. NULL solo pasa si una terminal manda la clave sin elegir a nadie: un comprobante sin autor no se guarda.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  -- La orden se bloquea: dos registros de la misma orden (o un registro y una edición) se ponen en fila, y el segundo ve lo del primero.
  if p_orden_id is not null then
    select o.* into v_orden from retail.ordenes_compra o where o.id = p_orden_id for update;
  end if;
  if v_orden.id is null then
    raise exception 'Esa orden de compra no existe' using hint = 'orden_compra_no_existe';
  end if;

  -- Doble clic o reintento sin red: el mismo envío ya se guardó y se devuelve lo mismo. El mismo token con OTRO contenido no es un
  -- reintento: es otro guardado que la pantalla no debió mandar con ese token.
  v_huella := md5(jsonb_build_object(
    'orden', p_orden_id, 'tipo', p_tipo, 'serie', p_serie, 'numero', p_numero, 'lineas', p_lineas, 'emision', p_fecha_emision,
    'condicion', p_condicion, 'vencimiento', p_fecha_vencimiento, 'suma_igv', p_suma_igv, 'total', p_total, 'pago', p_pago,
    'nota', p_nota)::text);
  if p_token is not null then
    for v_existente in select c.id, c.huella_envio, c.orden_compra_id from retail.compras c where c.token_cliente = p_token loop
      if v_existente.orden_compra_id = v_orden.id and v_existente.huella_envio = v_huella then
        return retail.fn_comprobante_orden_resultado(v_existente.id, true);
      end if;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'comprobante_orden_otro_envio';
    end loop;
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se le registra comprobante' using hint = 'orden_compra_anulada';
  end if;
  if v_orden.ubicacion_destino_id is null then
    raise exception 'Esta orden es «Por repartir»: su comprobante todavía no se puede registrar' using hint = 'orden_compra_por_repartir';
  end if;

  -- El papel.
  if v_tipo not in ('boleta', 'nota_venta', 'factura') then
    raise exception 'Elige si el comprobante es boleta, nota de venta o factura' using hint = 'comprobante_orden_tipo';
  end if;
  if v_serie = '' then
    raise exception 'Escribe la serie del comprobante' using hint = 'comprobante_orden_serie';
  end if;
  if v_numero = '' then
    raise exception 'Escribe el número del comprobante' using hint = 'comprobante_orden_numero';
  end if;
  if v_emision > v_hoy then
    raise exception 'La fecha de emisión no puede ser futura: hoy es %', to_char(v_hoy, 'DD/MM/YYYY') using hint = 'comprobante_orden_emision';
  end if;
  if v_condicion not in ('credito', 'contado') then
    raise exception 'Elige si el comprobante es al crédito o al contado' using hint = 'comprobante_orden_condicion';
  end if;
  if v_condicion = 'credito' and (p_fecha_vencimiento is null or p_fecha_vencimiento < v_emision) then
    raise exception 'Al crédito, elige cuándo vence: desde la fecha de emisión en adelante' using hint = 'comprobante_orden_vencimiento';
  end if;
  -- Pagar al crédito no es parte de este paso: eso se hace desde Por pagar, con su módulo (la decisión 42 abre solo el contado).
  if v_condicion = 'credito' and not v_sin_pago then
    raise exception 'Al crédito, el comprobante se registra sin pago: se paga después, desde Por pagar' using hint = 'comprobante_orden_pago_credito';
  end if;
  if v_condicion = 'contado' and v_sin_pago then
    raise exception 'Al contado, el comprobante se registra con su pago' using hint = 'comprobante_orden_sin_pago';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'comprobante_orden_nota';
  end if;
  -- El mismo papel (proveedor, serie y número) vigente no se registra dos veces; uno anulado sí se puede volver a registrar.
  if exists (
    select 1 from retail.compras c
     where c.proveedor_id = v_orden.proveedor_id and c.serie = v_serie and c.numero = v_numero and c.estado = 'vigente'
  ) then
    raise exception 'Ese comprobante ya está registrado' using hint = 'comprobante_orden_repetido';
  end if;

  -- Las líneas: se validan TODAS antes de escribir nada.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos una línea al comprobante' using hint = 'comprobante_orden_sin_lineas';
  end if;
  for v_linea in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'comprobante_orden_linea';
    end if;
    begin
      v_item_id := nullif(btrim(v_linea ->> 'orden_compra_item_id'), '')::uuid;
      v_categoria := nullif(btrim(v_linea ->> 'categoria_id'), '')::uuid;
      v_marca := nullif(btrim(v_linea ->> 'marca_id'), '')::uuid;
      v_cantidad := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_costo := nullif(btrim(v_linea ->> 'costo_unitario'), '')::numeric;
      v_sugerido := nullif(btrim(v_linea ->> 'precio_venta_sugerido'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'comprobante_orden_linea';
    end;
    v_descripcion := nullif(btrim(coalesce(v_linea ->> 'descripcion', '')), '');
    if v_item_id is not null then
      -- Sale de una línea pedida: tiene que ser de ESTA orden; la categoría y la marca son las pedidas (lo mandado se ignora), y la
      -- descripción, si no viene, también.
      select i.* into v_item from retail.orden_compra_items i where i.id = v_item_id and i.orden_compra_id = v_orden.id;
      if v_item.id is null then
        raise exception 'La línea % no es de esta orden: recarga la pantalla', v_pos using hint = 'comprobante_orden_linea_ajena';
      end if;
      v_categoria := v_item.categoria_id;
      v_marca := v_item.marca_id;
      v_descripcion := coalesce(v_descripcion, v_item.descripcion);
    else
      -- Algo que no estaba en la orden (decisión 43): se acepta con su categoría y su marca, activas.
      if v_categoria is null or not exists (select 1 from retail.categorias c where c.id = v_categoria and c.activo) then
        raise exception 'La línea % necesita una categoría activa', v_pos using hint = 'comprobante_orden_categoria';
      end if;
      if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
        raise exception 'La línea % necesita una marca activa', v_pos using hint = 'comprobante_orden_marca';
      end if;
    end if;
    if v_descripcion is not null and length(v_descripcion) > 200 then
      raise exception 'La descripción de la línea % es muy larga: hasta 200 letras', v_pos using hint = 'comprobante_orden_descripcion';
    end if;
    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'La cantidad de la línea % va de 1 a 99 999 unidades, sin decimales', v_pos using hint = 'comprobante_orden_cantidad';
    end if;
    if v_costo is null or v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de la línea % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_pos using hint = 'comprobante_orden_costo';
    end if;
    if v_sugerido is not null and (v_sugerido < 0 or v_sugerido > 99999.99 or v_sugerido <> round(v_sugerido, 2)) then
      raise exception 'El precio de venta sugerido de la línea % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_pos
        using hint = 'comprobante_orden_precio_sugerido';
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'orden_compra_item_id', v_item_id, 'categoria_id', v_categoria, 'marca_id', v_marca, 'descripcion', v_descripcion,
      'cantidad', v_cantidad::integer, 'costo_unitario', v_costo, 'precio_venta_sugerido', v_sugerido);
    v_unidades := v_unidades + v_cantidad::integer;
    v_subtotal := v_subtotal + v_cantidad * v_costo;
  end loop;

  -- Totales. En factura con «Sumar IGV», los costos vienen SIN IGV y se suma el 18 %; boleta y nota de venta no llevan IGV (y una
  -- factura sin «Sumar IGV», tampoco): su total es la suma exacta de las líneas.
  v_con_igv := v_tipo = 'factura' and coalesce(p_suma_igv, true);
  v_igv := case when v_con_igv then round(v_subtotal * 0.18, 2) else 0 end;
  v_total := v_subtotal + v_igv;
  if p_total is not null then
    if p_total < 0 then
      raise exception 'El total no puede ser negativo' using hint = 'comprobante_orden_total';
    end if;
    if p_total <> round(p_total, 2) then
      raise exception 'El total admite como máximo 2 decimales' using hint = 'comprobante_orden_total';
    end if;
    if not v_con_igv then
      if p_total <> v_subtotal then
        raise exception 'Sin IGV, el total tiene que ser la suma de las líneas (S/ %); llegó S/ %', v_subtotal, p_total
          using hint = 'comprobante_orden_total';
      end if;
    else
      -- El total impreso manda, dentro de la tolerancia de `registrar_compra` (A1, ADR-0135): 0.01 por línea (+1 por el IGV y el
      -- papel) más 0.006 por unidad, que es lo que mueve el redondeo de un costo a 2 decimales agrandado por el IGV.
      v_tolerancia := 0.01 * (jsonb_array_length(p_lineas) + 1) + 0.006 * v_unidades;
      if abs(p_total - v_total) > v_tolerancia or p_total < v_subtotal then
        raise exception 'El total del comprobante (S/ %) no cuadra con sus líneas (S/ %): revisa los costos', p_total, v_total
          using hint = 'comprobante_orden_total';
      end if;
      v_total := p_total;
      v_igv := p_total - v_subtotal;
    end if;
  end if;

  -- Al contado: el pago suma el total y sale de la EMPRESA (sin tienda, decisión 41), con el formato de `registrar_compra`.
  if not v_sin_pago then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto' using hint = 'comprobante_orden_pago';
    end if;
    begin
      v_pago_fecha := coalesce(nullif(btrim(v_pagos -> 0 ->> 'fecha'), '')::date, v_hoy);
    exception when others then
      raise exception 'La fecha del pago no se entiende' using hint = 'comprobante_orden_pago';
    end;
    for v_pago in select e.value from jsonb_array_elements(v_pagos) e loop
      if jsonb_typeof(v_pago) <> 'object' then
        raise exception 'El pago necesita al menos un medio con su monto' using hint = 'comprobante_orden_pago';
      end if;
      begin
        v_monto := nullif(btrim(v_pago ->> 'monto'), '')::numeric;
        v_cuenta := nullif(btrim(v_pago ->> 'cuenta_id'), '')::uuid;
        perform nullif(btrim(v_pago ->> 'fecha'), '')::date;
      exception when others then
        raise exception 'Un medio de pago trae un monto, una cuenta o una fecha que no se entiende' using hint = 'comprobante_orden_pago';
      end;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero' using hint = 'comprobante_orden_pago';
      end if;
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto using hint = 'comprobante_orden_pago';
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
        raise exception 'Medio de pago no reconocido: %', coalesce(nullif(v_pago ->> 'metodo', ''), '(vacío)') using hint = 'comprobante_orden_pago';
      end if;
      perform retail.fn_validar_fecha_pago_compra(nullif(btrim(v_pago ->> 'fecha'), '')::date, v_emision, v_serie || '-' || v_numero);
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if v_pago_suma <> v_total then
      raise exception 'Al contado, el pago tiene que ser el total del comprobante (S/ %); suma S/ %', v_total, v_pago_suma
        using hint = 'comprobante_orden_pago';
    end if;
  end if;

  -- Todo bien: se escribe. Una carrera con el mismo token o el mismo papel termina en el único y se responde igual que arriba.
  begin
    insert into retail.compras (
      proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
      subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada, ubicacion_gestion_id, naturaleza,
      orden_compra_id, huella_envio
    ) values (
      v_orden.proveedor_id, v_tipo, v_serie, v_numero, v_emision, v_condicion,
      case when v_condicion = 'contado' then null else p_fecha_vencimiento end,
      v_subtotal, v_igv, v_total, v_nota, v_actor, p_token, v_orden.fecha_entrega_estimada, v_orden.ubicacion_destino_id, 'mercaderia',
      v_orden.id, v_huella
    ) returning id, documento into v_compra_id, v_documento;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'compras_token_cliente_key' then
      for v_existente in select c.id, c.huella_envio, c.orden_compra_id from retail.compras c where c.token_cliente = p_token loop
        if v_existente.orden_compra_id = v_orden.id and v_existente.huella_envio = v_huella then
          return retail.fn_comprobante_orden_resultado(v_existente.id, true);
        end if;
      end loop;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'comprobante_orden_otro_envio';
    end if;
    raise exception 'Ese comprobante ya está registrado' using hint = 'comprobante_orden_repetido';
  end;

  -- Las líneas, sin prenda (la prenda se crea cuando llega, fase 4), y todo lo comprado a la tienda gestora («Llega a»).
  with lineas as (
    insert into retail.compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario,
                                     categoria_id, marca_id, orden_compra_item_id, precio_venta_sugerido)
    select v_compra_id, null, null, l.valor ->> 'descripcion', (l.valor ->> 'cantidad')::integer, (l.valor ->> 'costo_unitario')::numeric,
           (l.valor ->> 'categoria_id')::uuid, (l.valor ->> 'marca_id')::uuid, (l.valor ->> 'orden_compra_item_id')::uuid,
           (l.valor ->> 'precio_venta_sugerido')::numeric
      from jsonb_array_elements(v_lineas) with ordinality as l(valor, posicion)
     order by l.posicion
    returning id, cantidad
  )
  insert into retail.compra_item_destinos (compra_item_id, ubicacion_id, cantidad)
  select lineas.id, v_orden.ubicacion_destino_id, lineas.cantidad from lineas;

  -- El pago al contado, a nombre de la empresa: sin tienda; la cuenta la sella `fn_compra_pagos_sellar`.
  if v_pagos is not null then
    for v_pago in select e.value from jsonb_array_elements(v_pagos) e loop
      insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id)
      values (
        v_compra_id,
        v_pago_fecha,
        (v_pago ->> 'monto')::numeric,
        v_pago ->> 'metodo',
        nullif(btrim(coalesce(v_pago ->> 'referencia', '')), ''),
        v_actor,
        null,
        nullif(btrim(v_pago ->> 'cuenta_id'), '')::uuid
      )
      returning id into v_pago_id;
      -- Saldo a favor del proveedor como medio de pago (ADR-0111): descuenta del libro, con candado por proveedor.
      if v_pago ->> 'metodo' = 'saldo_a_favor' then
        perform retail.fn_consumir_saldo_favor(v_orden.proveedor_id, (v_pago ->> 'monto')::numeric, v_compra_id, v_pago_id, v_pago_fecha, v_actor);
      end if;
    end loop;
  end if;

  -- Actividad (ADR-0207), sin montos como el resto de la orden. Si falla, el comprobante igual queda guardado.
  begin
    perform retail.fn_actividad_anotar(
      'ordenes_compra', 'orden_compra_comprobante',
      'registró ' || case v_tipo when 'factura' then 'la factura ' when 'boleta' then 'la boleta ' else 'la nota de venta ' end
        || v_documento || ' de la ' || retail.fn_orden_compra_numero_texto(v_orden.numero) || ' ('
        || (select pr.nombre from retail.proveedores pr where pr.id = v_orden.proveedor_id) || ')',
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor), v_orden.ubicacion_destino_id,
      'ordenes_compra', v_orden.id::text, now(),
      jsonb_build_object('orden_id', v_orden.id, 'numero', v_orden.numero, 'compra_id', v_compra_id, 'documento', v_documento,
                         'tipo', v_tipo, 'condicion', v_condicion),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el comprobante % de la orden de compra % (%)', v_documento, v_orden.numero, sqlerrm;
  end;

  return retail.fn_comprobante_orden_resultado(v_compra_id, false);
end;
$$;
comment on function retail.registrar_comprobante_orden(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid) is
  'ADR-0362 (fase 2): registra la boleta, nota de venta o factura de una orden generada con «Llega a» (gestora = «Llega a»; líneas '
  'sin prenda; al contado, pago de la empresa sin tienda). Solo el módulo Órdenes de compra. Devuelve {compra_id, documento, total, '
  'saldo, avisos}: «de más» y «fuera de la orden» se avisan sin bloquear. p_token + huella: un reintento devuelve lo mismo.';
revoke all on function retail.registrar_comprobante_orden(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid)
  from public, anon;
grant execute on function retail.registrar_comprobante_orden(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid)
  to authenticated, service_role;

-- ---------- 4. Editar una orden: no, si ya tiene comprobante ----------
-- Vigente o anulado: las líneas de la orden son el respaldo del papel (y un comprobante anulado sigue colgando de ellas).
select pg_temp.reemplazar(
  'retail.editar_orden_compra(uuid,integer,uuid,uuid,date,text,jsonb)',
  $v$  v_anterior := retail.fn_orden_compra_detalle(p_id);$v$,
  $v$  -- ADR-0362 (fase 2): una orden con comprobante ya no se edita; el papel equivocado se anula y se registra de nuevo.
  if exists (select 1 from retail.compras cc where cc.orden_compra_id = p_id) then
    raise exception 'Esta orden ya tiene comprobante: no se edita. Si el papel está mal, anúlalo y regístralo de nuevo'
      using hint = 'orden_compra_con_comprobante';
  end if;

  v_anterior := retail.fn_orden_compra_detalle(p_id);$v$,
  1);

-- ---------- 5. Anular una orden: no, si tiene un comprobante vigente ----------
select pg_temp.reemplazar(
  'retail.anular_orden_compra(uuid,integer,text)',
  $v$  update retail.ordenes_compra o
     set estado = 'anulada',$v$,
  $v$  -- ADR-0362 (fase 2): el comprobante vigente se anula primero (Por pagar le debe al proveedor por ese papel).
  if exists (select 1 from retail.compras cc where cc.orden_compra_id = p_id and cc.estado = 'vigente') then
    raise exception 'Esta orden tiene comprobante vigente (%): anula primero el comprobante y después la orden',
      (select string_agg(cc.documento, ', ' order by cc.created_at) from retail.compras cc
        where cc.orden_compra_id = p_id and cc.estado = 'vigente')
      using hint = 'orden_compra_con_comprobante';
  end if;

  update retail.ordenes_compra o
     set estado = 'anulada',$v$,
  1);

-- ---------- 6. Anular un comprobante: también con Órdenes de compra, si sale de una orden (decisión 42) ----------
select pg_temp.reemplazar(
  'retail.anular_compra(uuid,text)',
  $v$  if not retail.fn_puede_registrar_facturas_compra() then$v$,
  $v$  if not retail.fn_puede_registrar_facturas_compra()
     and not (retail.fn_ve_modulo('ordenes_compra') is true
              and exists (select 1 from retail.compras oc where oc.id = p_compra_id and oc.orden_compra_id is not null)) then$v$,
  1);

-- ---------- 7. Ver una orden: cuánto llegó en papel y sus comprobantes ----------
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$join retail.marcas m on m.id = i.marca_id$v$,
  $v$join retail.marcas m on m.id = i.marca_id
               -- ADR-0362 (fase 2): cuánto de esta línea llegó en papel, contando solo los comprobantes vigentes.
               cross join lateral (
                 select coalesce(sum(ci.cantidad), 0)::integer as facturado
                   from retail.compra_items ci
                   join retail.compras cc on cc.id = ci.compra_id
                  where ci.orden_compra_item_id = i.id
                    and cc.estado = 'vigente'
               ) f$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$'subtotal', i.subtotal$v$,
  $v$'subtotal', i.subtotal,
                      'id', i.id,
                      'facturado', f.facturado,
                      'pendiente', greatest(i.cantidad - f.facturado, 0)$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$'total', coalesce((select sum(i.subtotal) from retail.orden_compra_items i where i.orden_compra_id = o.id), 0)$v$,
  $v$'total', coalesce((select sum(i.subtotal) from retail.orden_compra_items i where i.orden_compra_id = o.id), 0),
           -- ADR-0362 (fase 2): los comprobantes de la orden (vigentes y anulados, el más reciente primero) y cuánto llegó en papel.
           'comprobantes', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', cc.id,
                      'documento', cc.documento,
                      'tipo', cc.tipo,
                      'condicion', cc.condicion,
                      'fecha_emision', cc.fecha_emision,
                      'total', cc.total,
                      'saldo', cc.saldo,
                      'estado', cc.estado,
                      'estado_pago', cc.estado_pago
                    ) order by cc.created_at desc, cc.id desc)
               from retail.compras cc
              where cc.orden_compra_id = o.id
           ), '[]'::jsonb),
           'papel', case
             when not exists (select 1 from retail.compras cc where cc.orden_compra_id = o.id and cc.estado = 'vigente')
               then 'sin_comprobante'
             when exists (
               select 1 from retail.orden_compra_items i
                where i.orden_compra_id = o.id
                  and i.cantidad > (select coalesce(sum(ci.cantidad), 0)
                                      from retail.compra_items ci
                                      join retail.compras cc on cc.id = ci.compra_id
                                     where ci.orden_compra_item_id = i.id and cc.estado = 'vigente'))
               then 'en_parte'
             else 'completa'
           end$v$,
  1);

-- ---------- 8. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_firma constant text := 'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)';
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname = 'registrar_comprobante_orden') <> 1 then
    raise exception 'registrar_comprobante_orden: tiene que haber una sola función con ese nombre';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = v_firma::regprocedure) then
    raise exception 'registrar_comprobante_orden tiene que ser security definer';
  end if;
  if has_function_privilege('anon', v_firma, 'execute') or not has_function_privilege('authenticated', v_firma, 'execute') then
    raise exception 'registrar_comprobante_orden: la ejecuta authenticated y no anon';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_comprobante_orden_resultado(uuid,boolean)', 'execute') then
    raise exception 'fn_comprobante_orden_resultado es interna: authenticated no la ejecuta';
  end if;
  if not exists (select 1 from retail.acciones_sin_responsable a where a.clave = 'orden_compra_comprobante') then
    raise exception 'falta la clave orden_compra_comprobante en acciones_sin_responsable';
  end if;
  if position('orden_compra_con_comprobante' in pg_get_functiondef('retail.editar_orden_compra(uuid,integer,uuid,uuid,date,text,jsonb)'::regprocedure)) = 0 then
    raise exception 'editar_orden_compra no quedó con el candado del comprobante';
  end if;
  if position('orden_compra_con_comprobante' in pg_get_functiondef('retail.anular_orden_compra(uuid,integer,text)'::regprocedure)) = 0 then
    raise exception 'anular_orden_compra no quedó con el candado del comprobante vigente';
  end if;
  if position($t$fn_ve_modulo('ordenes_compra')$t$ in pg_get_functiondef('retail.anular_compra(uuid,text)'::regprocedure)) = 0 then
    raise exception 'anular_compra no quedó abierta a Órdenes de compra para el comprobante de una orden';
  end if;
  if position($t$'papel', case$t$ in pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure)) = 0
     or position($t$'facturado', f.facturado$t$ in pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure)) = 0
     or position($t$cross join lateral$t$ in pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_orden_compra_detalle no quedó con lo facturado, los comprobantes y el papel';
  end if;
end;
$$;

reset lock_timeout;
