-- ============================================================================
-- 20261015020000_orden_insumo_comprobante_funciones.sql — CAYLA V2 · ADR-0362, fase 7 parte 2, actividad 1 (el comprobante de la orden de
-- insumos del Taller, al crédito). Va después de 20261015015000_orden_insumo_comprobante_esquema.sql. Contrato:
-- docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 2).
--
-- EL PROBLEMA PRIMERO. Quien compra para el Taller con «Órdenes de insumos» (decisión 47) no tenía cómo dejar el papel del proveedor ligado
-- a su orden: el comprobante del Taller lo registraba solo el líder, suelto. Y una orden con su papel podía seguir editándose: editar borra
-- y vuelve a crear las líneas, así que el papel quedaba apuntando a líneas que ya no existen.
--
-- QUÉ HACE.
--   1. `registrar_comprobante_orden_insumo` (la web): el papel de UNA orden de insumos, como el de la orden de tienda (fase 2) con las
--      medidas del Taller. Pide SOLO el módulo «Órdenes de insumos» (decisión 47; ve el precio de esa orden y nada más de la plata del
--      Taller). Los cuatro tipos (decisión 50): boleta, nota de venta, factura (con su IGV de 0 % a 18 %, como el Taller) y sin comprobante
--      (número interno SC- de la secuencia de la empresa). La cantidad con hasta 3 decimales en la unidad del insumo y el costo con hasta 4,
--      como los lotes. Lo que pasa lo pedido o no estaba en la orden se acepta y se avisa (decisión 43), sin bloquear. Esta actividad
--      registra AL CRÉDITO; el contado llega en la actividad 2. Idempotente por token: el mismo envío devuelve lo mismo y el mismo token con
--      otro contenido se rechaza (`fn_intento_con_huella`). Firma: con la cuenta de una persona, ella (`orden_insumo_comprobante` entra a
--      `acciones_sin_responsable`, decisión 39); desde una terminal, el combo.
--   2. `fn_comprobante_orden_insumo_resultado` (interna): lo que responde, con los avisos «de más» y «fuera de la orden».
--   3. Candado (REEMPLAZOS ANCLADOS, `orden_insumo_con_comprobante`): `editar_orden_insumo` no toca una orden que tuvo papel, aunque se
--      haya anulado (editar borra sus líneas, y las de un comprobante del Taller no se tocan: si hay que pedir otra cosa, otra orden);
--      `anular_orden_insumo`, una con su papel vigente (primero se anula el papel).
--   4. La recepción de siempre no recibe el papel de una orden (REEMPLAZOS ANCLADOS): `recibir_comprobante_produccion` lo rechaza
--      (`comprobante_de_orden_insumo`) y `fn_lineas_comprobantes_produccion` no lo lista. Lo de una orden se recibe desde la orden
--      (actividad 3): así nada se recibe dos veces.
--   5. El detalle de la orden (`fn_orden_insumo`, REEMPLAZO ANCLADO) suma `facturacion` (lo facturado de cada línea, con su id),
--      `comprobantes` (sus papeles, vigentes y anulados) y `plazo_credito_dias` (el plazo del proveedor, para sugerir el vencimiento).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261015015000. Sin tablas, sin políticas, sin `drop trigger`
-- (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si la función viva
-- cambió, y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012235000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. La firma: una persona firma ella sola (decisión 39) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_insumo_comprobante',
   'Registrar el comprobante de una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do nothing;

-- ---------- 2. Lo que responde (interna) ----------
create or replace function retail.fn_comprobante_orden_insumo_resultado(p_comprobante_id uuid, p_repetido boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'comprobante_id', c.id,
           'documento', c.serie || '-' || c.numero,
           'tipo', c.tipo,
           'condicion', c.condicion,
           'total', c.total,
           'repetido', p_repetido,
           'avisos', coalesce((
             select jsonb_agg(a.aviso order by a.grupo, a.posicion, a.nombre)
               from (
                 -- De más (decisión 43): con este papel, lo facturado de una línea pedida (en todos los papeles vigentes) pasa lo pedido.
                 select 1 as grupo,
                        oi.posicion,
                        null::text as nombre,
                        jsonb_build_object(
                          'tipo', 'de_mas',
                          'orden_insumo_item_id', oi.id,
                          'posicion', oi.posicion,
                          'insumo', n.nombre,
                          'unidad', oi.unidad_medida,
                          'pedido', oi.cantidad,
                          'facturado', tot.cantidad) as aviso
                   from (select ci.orden_insumo_item_id
                           from retail.comprobantes_produccion_items ci
                          where ci.comprobante_id = c.id and ci.orden_insumo_item_id is not null
                          group by ci.orden_insumo_item_id) ev
                   join retail.orden_insumo_items oi on oi.id = ev.orden_insumo_item_id
                   join retail.insumos n on n.id = oi.insumo_id
                  cross join lateral (
                    select coalesce(sum(x.cantidad), 0) as cantidad
                      from retail.comprobantes_produccion_items x
                      join retail.comprobantes_produccion y on y.id = x.comprobante_id
                     where x.orden_insumo_item_id = oi.id and y.estado = 'vigente'
                  ) tot
                  where tot.cantidad > oi.cantidad
                 union all
                 -- Fuera de la orden (decisión 43): cada línea de este papel que no sale de una línea pedida.
                 select 2,
                        null::integer,
                        n.nombre,
                        jsonb_build_object(
                          'tipo', 'fuera_de_orden',
                          'insumo', n.nombre,
                          'unidad', n.unidad_medida,
                          'cantidad', ci.cantidad)
                   from retail.comprobantes_produccion_items ci
                   join retail.insumos n on n.id = ci.insumo_id
                  where ci.comprobante_id = c.id and ci.orden_insumo_item_id is null
               ) a
           ), '[]'::jsonb)
         )
    from retail.comprobantes_produccion c
   where c.id = p_comprobante_id;
$$;

-- ---------- 3. Registrar el comprobante de una orden de insumos (la web) ----------
create or replace function retail.registrar_comprobante_orden_insumo(
  p_orden_id uuid,
  p_tipo text,
  p_serie text,
  p_numero text,
  p_lineas jsonb,
  p_fecha_emision date default null,
  p_condicion text default 'credito',
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_total numeric default null,
  p_pago jsonb default null,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_orden retail.ordenes_insumo;
  v_item retail.orden_insumo_items;
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
  v_insumo uuid;
  v_cantidad numeric;
  v_costo numeric;
  v_lineas jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric;
  v_tolerancia numeric;
  v_id uuid;
  v_restriccion text;
begin
  -- Permiso: SOLO el módulo «Órdenes de insumos» (decisión 47): quien lo tiene ve el precio de esa orden, no el resto de la plata del Taller.
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Registrar el comprobante de una orden de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  -- Quién lo registra: con la cuenta de una persona, ella (`orden_insumo_comprobante` está soltada del combo); desde una terminal, el
  -- responsable elegido. Un comprobante sin autor no se guarda.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  -- La orden se bloquea: dos registros de la misma orden (o un registro y una edición) se ponen en fila, y el segundo ve lo del primero.
  if p_orden_id is not null then
    select o.* into v_orden from retail.ordenes_insumo o where o.id = p_orden_id for update;
  end if;
  if v_orden.id is null then
    raise exception 'Esa orden de insumos no existe' using hint = 'orden_insumo_no_existe';
  end if;

  -- El token sigue al contenido: el mismo token con otro papel se rechaza (`token_reusado`); el mismo envío (doble clic, reintento sin
  -- red) devuelve lo que ya se guardó.
  perform retail.fn_intento_con_huella('registrar_comprobante_orden_insumo', p_token, md5(jsonb_build_object(
    'orden', p_orden_id, 'tipo', p_tipo, 'serie', p_serie, 'numero', p_numero, 'lineas', p_lineas, 'emision', p_fecha_emision,
    'condicion', p_condicion, 'vencimiento', p_fecha_vencimiento, 'igv', p_igv_porcentaje, 'total', p_total, 'pago', p_pago,
    'nota', p_nota)::text));
  if p_token is not null then
    for v_existente in select c.id, c.orden_insumo_id from retail.comprobantes_produccion c where c.token_cliente = p_token loop
      if v_existente.orden_insumo_id = v_orden.id then
        return retail.fn_comprobante_orden_insumo_resultado(v_existente.id, true);
      end if;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'comprobante_orden_insumo_otro_envio';
    end loop;
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se le registra comprobante' using hint = 'orden_insumo_anulada';
  end if;

  -- El papel.
  if v_tipo not in ('boleta', 'nota_venta', 'factura', 'sin_comprobante') then
    raise exception 'Elige el tipo: boleta, nota de venta, factura o sin comprobante' using hint = 'comprobante_orden_insumo_tipo';
  end if;
  -- Sin comprobante (decisión 50): el proveedor no dio papel. No se pide serie ni número: la base le pone su número interno (SC-…).
  if v_tipo = 'sin_comprobante' then
    v_serie := 'SC';
    v_numero := '';
  else
    if v_serie = '' then
      raise exception 'Escribe la serie del comprobante' using hint = 'comprobante_orden_insumo_serie';
    end if;
    if v_numero = '' then
      raise exception 'Escribe el número del comprobante' using hint = 'comprobante_orden_insumo_numero';
    end if;
    if length(v_serie) > 20 or length(v_numero) > 30 then
      raise exception 'La serie va hasta 20 letras y el número hasta 30' using hint = 'comprobante_orden_insumo_numero';
    end if;
  end if;
  if v_emision > v_hoy then
    raise exception 'La fecha de emisión no puede ser futura: hoy es %', to_char(v_hoy, 'DD/MM/YYYY') using hint = 'comprobante_orden_insumo_emision';
  end if;
  if v_condicion not in ('credito', 'contado') then
    raise exception 'Elige si el comprobante es al crédito o al contado' using hint = 'comprobante_orden_insumo_condicion';
  end if;
  -- Esta actividad registra al crédito; el pago al contado de una orden de insumos llega en la actividad 2 (ADR-0362, fase 7 parte 2).
  if v_condicion = 'contado' then
    raise exception 'Por ahora el comprobante de una orden de insumos se registra al crédito' using hint = 'comprobante_orden_insumo_contado';
  end if;
  if p_fecha_vencimiento is null or p_fecha_vencimiento < v_emision then
    raise exception 'Al crédito, elige cuándo vence: desde la fecha de emisión en adelante' using hint = 'comprobante_orden_insumo_vencimiento';
  end if;
  if not v_sin_pago then
    raise exception 'Al crédito, el comprobante se registra sin pago' using hint = 'comprobante_orden_insumo_pago_credito';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'comprobante_orden_insumo_nota';
  end if;
  -- El mismo papel (proveedor, serie y número) vigente no se registra dos veces; uno anulado sí se puede volver a registrar.
  if v_tipo <> 'sin_comprobante' and exists (
    select 1 from retail.comprobantes_produccion c
     where c.proveedor_id = v_orden.proveedor_id and c.serie = v_serie and c.numero = v_numero and c.estado = 'vigente'
  ) then
    raise exception 'Ese comprobante ya está registrado' using hint = 'comprobante_orden_insumo_repetido';
  end if;

  -- Las líneas: se validan TODAS antes de escribir nada.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos una línea al comprobante' using hint = 'comprobante_orden_insumo_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    raise exception 'Un comprobante lleva hasta 200 líneas' using hint = 'comprobante_orden_insumo_sin_lineas';
  end if;
  for v_linea in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'comprobante_orden_insumo_linea';
    end if;
    begin
      v_item_id := nullif(btrim(v_linea ->> 'orden_insumo_item_id'), '')::uuid;
      v_insumo := nullif(btrim(v_linea ->> 'insumo_id'), '')::uuid;
      v_cantidad := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_costo := nullif(btrim(v_linea ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'comprobante_orden_insumo_linea';
    end;
    if v_item_id is not null then
      -- Sale de una línea pedida: tiene que ser de ESTA orden, y el insumo es el pedido (lo mandado se ignora).
      v_item := null;
      select i.* into v_item from retail.orden_insumo_items i where i.id = v_item_id and i.orden_insumo_id = v_orden.id;
      if v_item.id is null then
        raise exception 'La línea % no es de esta orden: recarga la pantalla', v_pos using hint = 'comprobante_orden_insumo_linea_ajena';
      end if;
      v_insumo := v_item.insumo_id;
    else
      -- Algo que no estaba en la orden (decisión 43): se acepta, pero es un insumo del catálogo sin archivar (la orden de insumos solo
      -- lleva insumos, decisión 63).
      if v_insumo is null or not exists (select 1 from retail.insumos n where n.id = v_insumo and n.archivado_at is null) then
        raise exception 'La línea % necesita un insumo del catálogo, sin archivar', v_pos using hint = 'comprobante_orden_insumo_insumo';
      end if;
    end if;
    -- `NaN` no cumple ninguna de las comparaciones de abajo: también se rechaza.
    if v_cantidad is null or not (v_cantidad > 0 and v_cantidad <= 99999.999) or v_cantidad <> round(v_cantidad, 3) then
      raise exception 'La cantidad de la línea % va de 0.001 a 99 999.999, con hasta tres decimales', v_pos
        using hint = 'comprobante_orden_insumo_cantidad';
    end if;
    if v_costo is null or not (v_costo >= 0 and v_costo <= 99999.9999) or v_costo <> round(v_costo, 4) then
      raise exception 'El costo de la línea % va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales', v_pos
        using hint = 'comprobante_orden_insumo_costo';
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'orden_insumo_item_id', v_item_id, 'insumo_id', v_insumo, 'cantidad', v_cantidad, 'costo_unitario', v_costo);
    v_subtotal := v_subtotal + round(v_cantidad * v_costo, 2);
  end loop;

  -- Totales, como el comprobante del Taller: el IGV de una factura va de 0 % a 18 %; boleta, nota de venta y sin comprobante no llevan.
  if v_tipo = 'factura' then
    if p_igv_porcentaje is null or not (p_igv_porcentaje >= 0 and p_igv_porcentaje <= 18) then
      raise exception 'El IGV de la factura va de 0 %% a 18 %%' using hint = 'igv_fuera_de_rango';
    end if;
    v_igv := round(v_subtotal * p_igv_porcentaje / 100, 2);
  end if;
  v_total := v_subtotal + v_igv;
  if p_total is not null then
    if not (p_total >= 0 and p_total <= 99999999.99) or p_total <> round(p_total, 2) then
      raise exception 'El total va de S/ 0 en adelante, con hasta dos decimales' using hint = 'comprobante_orden_insumo_total';
    end if;
    if v_tipo <> 'factura' then
      if p_total <> v_subtotal then
        raise exception 'Sin IGV, el total tiene que ser la suma de las líneas (S/ %); llegó S/ %', v_subtotal, p_total
          using hint = 'comprobante_orden_insumo_total';
      end if;
    else
      -- El total impreso manda, dentro de la tolerancia de redondeo del Taller (el proveedor redondea por línea).
      v_tolerancia := 0.01 * (jsonb_array_length(p_lineas) + 1);
      if abs(p_total - v_total) > v_tolerancia or p_total < v_subtotal then
        raise exception 'El total del comprobante (S/ %) no cuadra con sus líneas (S/ %): revisa cantidades y costos', p_total, v_total
          using hint = 'comprobante_orden_insumo_total';
      end if;
      v_total := p_total;
      v_igv := p_total - v_subtotal;
    end if;
  end if;

  -- Todo bien: se escribe. Una carrera con el mismo token o el mismo papel termina en el único y se responde igual que arriba.
  if v_tipo = 'sin_comprobante' then
    v_numero := lpad(nextval('retail.compras_sin_comprobante_seq')::text, 6, '0');
  end if;
  begin
    insert into retail.comprobantes_produccion (
      proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, nota, usuario_id,
      token_cliente, orden_insumo_id
    ) values (
      v_orden.proveedor_id, v_tipo, v_serie, v_numero, v_emision, v_condicion, p_fecha_vencimiento, v_subtotal, v_igv, v_total, v_nota,
      v_actor, p_token, v_orden.id
    ) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'comprobantes_produccion_token_cliente_key' then
      for v_existente in select c.id, c.orden_insumo_id from retail.comprobantes_produccion c where c.token_cliente = p_token loop
        if v_existente.orden_insumo_id = v_orden.id then
          return retail.fn_comprobante_orden_insumo_resultado(v_existente.id, true);
        end if;
      end loop;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'comprobante_orden_insumo_otro_envio';
    end if;
    raise exception 'Ese comprobante ya está registrado' using hint = 'comprobante_orden_insumo_repetido';
  end;

  insert into retail.comprobantes_produccion_items (comprobante_id, insumo_id, cantidad, costo_unitario, orden_insumo_item_id)
  select v_id, (l.valor ->> 'insumo_id')::uuid, (l.valor ->> 'cantidad')::numeric, (l.valor ->> 'costo_unitario')::numeric,
         (l.valor ->> 'orden_insumo_item_id')::uuid
    from jsonb_array_elements(v_lineas) with ordinality as l(valor, posicion)
   order by l.posicion;

  -- Actividad (ADR-0207), sin montos como el resto de la orden. Si falla, el comprobante igual queda guardado.
  begin
    perform retail.fn_actividad_anotar(
      'ordenes_insumos', 'orden_insumo_comprobante',
      'registró ' || case v_tipo when 'factura' then 'la factura ' when 'boleta' then 'la boleta '
                         when 'nota_venta' then 'la nota de venta ' else 'la compra sin comprobante ' end
        || v_serie || '-' || v_numero || ' de la ' || retail.fn_orden_insumo_numero_texto(v_orden.numero) || ' ('
        || (select pr.nombre from retail.proveedores_produccion pr where pr.id = v_orden.proveedor_id) || ')',
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_insumo_sede_actividad(v_actor), v_orden.ubicacion_destino_id,
      'ordenes_insumo', v_orden.id::text, now(),
      jsonb_build_object('orden_id', v_orden.id, 'numero', v_orden.numero, 'comprobante_id', v_id,
                         'documento', v_serie || '-' || v_numero, 'tipo', v_tipo, 'condicion', v_condicion),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el comprobante %-% de la orden de insumos % (%)', v_serie, v_numero, v_orden.numero, sqlerrm;
  end;

  return retail.fn_comprobante_orden_insumo_resultado(v_id, false);
end;
$$;

-- ---------- 4. La orden con su papel ya no se edita ni se anula ----------
select pg_temp.reemplazar(
  'retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb)',
  $v$  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se puede editar' using hint = 'orden_insumo_anulada';
  end if;
$v$,
  $n$  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se puede editar' using hint = 'orden_insumo_anulada';
  end if;
  -- Una orden que tuvo papel, aunque se haya anulado, ya no cambia (ADR-0362, fase 7 parte 2): editar borra y vuelve a crear sus líneas,
  -- y las líneas de un comprobante del Taller apuntan a ellas y no se tocan nunca.
  if exists (select 1 from retail.comprobantes_produccion c where c.orden_insumo_id = p_id) then
    raise exception 'Esta orden ya tiene un comprobante registrado: ya no se edita. Si hay que pedir otra cosa, crea otra orden'
      using hint = 'orden_insumo_con_comprobante';
  end if;
$n$,
  1);

select pg_temp.reemplazar(
  'retail.anular_orden_insumo(uuid, integer, text)',
  $v$  if v_orden.version <> p_version_esperada then
    raise exception 'Otra persona cambió esta orden mientras la mirabas. Recarga para ver sus cambios antes de anularla.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
$v$,
  $n$  if v_orden.version <> p_version_esperada then
    raise exception 'Otra persona cambió esta orden mientras la mirabas. Recarga para ver sus cambios antes de anularla.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  -- Con su comprobante vigente la orden no se anula (ADR-0362, fase 7 parte 2): primero se anula el papel.
  if exists (select 1 from retail.comprobantes_produccion c where c.orden_insumo_id = p_id and c.estado = 'vigente') then
    raise exception 'Esta orden ya tiene su comprobante registrado: para anularla, primero hay que anular el comprobante'
      using hint = 'orden_insumo_con_comprobante';
  end if;
$n$,
  1);

-- ---------- 5. Lo de una orden no se recibe contra el papel ----------
select pg_temp.reemplazar(
  'retail.recibir_comprobante_produccion(uuid, uuid, jsonb, jsonb, text, uuid)',
  $v$  if v_c.estado <> 'vigente' then
    raise exception 'Ese comprobante está anulado: no se recibe mercadería contra él.';
  end if;
$v$,
  $n$  if v_c.estado <> 'vigente' then
    raise exception 'Ese comprobante está anulado: no se recibe mercadería contra él.';
  end if;
  -- El papel de una orden de insumos se recibe desde la orden (ADR-0362, fase 7 parte 2): así nada se recibe dos veces.
  if v_c.orden_insumo_id is not null then
    raise exception 'Ese comprobante es de una orden de insumos: lo que llegó se recibe desde la orden.'
      using hint = 'comprobante_de_orden_insumo';
  end if;
$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_lineas_comprobantes_produccion(uuid, uuid)',
  $v$    and c.estado = 'vigente'
    and (p_comprobante_id is null or c.id = p_comprobante_id)$v$,
  $n$    and c.estado = 'vigente'
    and c.orden_insumo_id is null -- el papel de una orden de insumos se recibe desde la orden (ADR-0362, fase 7 parte 2)
    and (p_comprobante_id is null or c.id = p_comprobante_id)$n$,
  1);

-- ---------- 6. El detalle de la orden: lo facturado y sus papeles ----------
select pg_temp.reemplazar(
  'retail.fn_orden_insumo(uuid)',
  $v$  return v_foto || jsonb_build_object('versiones', coalesce(($v$,
  $n$  return v_foto || jsonb_build_object(
    -- Lo facturado de cada línea (ADR-0362, fase 7 parte 2): lo que dicen los papeles vigentes de la orden, en la unidad de la línea.
    'facturacion', coalesce((
      select jsonb_agg(jsonb_build_object('posicion', i.posicion, 'item_id', i.id, 'facturado', f.cantidad) order by i.posicion)
        from retail.orden_insumo_items i
        cross join lateral (
          select coalesce(sum(x.cantidad), 0) as cantidad
            from retail.comprobantes_produccion_items x
            join retail.comprobantes_produccion y on y.id = x.comprobante_id and y.estado = 'vigente'
           where x.orden_insumo_item_id = i.id
        ) f
       where i.orden_insumo_id = p_orden_id
    ), '[]'::jsonb),
    -- Sus papeles, vigentes y anulados, del más nuevo al más viejo.
    'comprobantes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'tipo', c.tipo, 'documento', c.serie || '-' || c.numero, 'fecha_emision', c.fecha_emision,
               'condicion', c.condicion, 'fecha_vencimiento', c.fecha_vencimiento, 'total', c.total, 'estado', c.estado
             ) order by c.created_at desc)
        from retail.comprobantes_produccion c
       where c.orden_insumo_id = p_orden_id
    ), '[]'::jsonb),
    -- El plazo de crédito del proveedor, para sugerir el vencimiento del papel como lo hace el comprobante del Taller: es un plazo, no
    -- plata, y quien tiene solo este módulo no lee `proveedores_produccion`.
    'plazo_credito_dias', (select pr.plazo_credito_dias
                             from retail.ordenes_insumo o
                             join retail.proveedores_produccion pr on pr.id = o.proveedor_id
                            where o.id = p_orden_id)
  ) || jsonb_build_object('versiones', coalesce(($n$,
  1);

-- ---------- 7. Permisos ----------
revoke all on function retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)
  from public, anon;
grant execute on function retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)
  to authenticated, service_role;
revoke all on function retail.fn_comprobante_orden_insumo_resultado(uuid, boolean) from public, anon, authenticated;
grant execute on function retail.fn_comprobante_orden_insumo_resultado(uuid, boolean) to service_role;

reset lock_timeout;

-- ---------- Comprobación: si algo no quedó, el pegado falla y no se aplica nada ----------
do $$
begin
  if not exists (select 1 from retail.acciones_sin_responsable a where a.clave = 'orden_insumo_comprobante') then
    raise exception 'falta la clave orden_insumo_comprobante en acciones_sin_responsable';
  end if;
  if position('orden_insumo_con_comprobante' in pg_get_functiondef('retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb)'::regprocedure)) = 0
     or position('orden_insumo_con_comprobante' in pg_get_functiondef('retail.anular_orden_insumo(uuid, integer, text)'::regprocedure)) = 0 then
    raise exception 'falta el candado de la orden con comprobante';
  end if;
  if position('comprobante_de_orden_insumo' in pg_get_functiondef('retail.recibir_comprobante_produccion(uuid, uuid, jsonb, jsonb, text, uuid)'::regprocedure)) = 0
     or position('c.orden_insumo_id is null' in pg_get_functiondef('retail.fn_lineas_comprobantes_produccion(uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'falta separar la recepción del papel de una orden';
  end if;
  if position('''facturacion''' in pg_get_functiondef('retail.fn_orden_insumo(uuid)'::regprocedure)) = 0
     or position('''plazo_credito_dias''' in pg_get_functiondef('retail.fn_orden_insumo(uuid)'::regprocedure)) = 0 then
    raise exception 'falta lo facturado en el detalle de la orden';
  end if;
end;
$$;
