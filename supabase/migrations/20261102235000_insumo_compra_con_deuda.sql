-- ============================================================================
-- 20261102235000_insumo_compra_con_deuda.sql — CAYLA V2 · P03 del «Análisis del Taller» (2-nov-2026)
-- «Ingresar insumo ▸ Compra» deja su deuda: la compra nace con su proveedor y su factura, y entra a Por pagar (o queda pagada).
--
-- EL PROBLEMA PRIMERO. «Ingresar insumo» abría un lote con origen «compra» sin preguntar a quién se le compró: en la base local hay 9 lotes así por S/ 15,498,
-- sin proveedor, sin factura y sin deuda. El costo por prenda sale del costo por metro del lote; si el lote se llenó de memoria, el costo de la prenda hereda el error,
-- y lo que realmente se debe al proveedor no aparece en Por pagar. Felipe eligió el 2-nov-2026 el «camino corto»: la hoja de Compra pide proveedor, documento y
-- «¿ya la pagaste o queda por pagar?», con una salida explícita («todavía no tengo el papel») para no frenar al Taller.
--
-- CONTRATO (3 líneas).
--   PROMETE: una compra con proveedor deja, en UNA transacción, su factura (con su deuda a crédito o con su pago al contado), su lote con el costo de la línea (sin IGV),
--            su proveedor y su movimiento de compra, todo ligado (lote → ítem de la factura). O queda todo, o no queda nada.
--   ASUME:   quien llama es un líder (como todo comprobante de Producción), el Taller está activo y el proveedor está en el directorio.
--   NO HACE: no toca `recibir_insumo` (que sigue siendo la puerta de «Saldo inicial» y «Encontré tela») ni los 9 lotes que ya existen sin proveedor (nunca se borran:
--            regularizarlos es una decisión de Felipe).
--
-- DECIDÍ  componer la función con las dos que ya existen —`registrar_comprobante_produccion` (la factura, su deuda y su pago) y `recibir_comprobante_produccion` (el lote)—
--         dentro de una función nueva, en vez de escribir otra vez facturas, pagos y lotes: una sola mente para lo mismo (la pantalla «Facturas de insumos» + «Recibir» ya
--         lo hace en dos pasos). Con token: el mismo envío dos veces es una factura y un lote.
-- DESCARTÉ que la web llame a las dos funciones una detrás de otra: la factura podría quedar sin su lote (o al revés) si se corta la red entre las dos.
--          Tampoco agregar un parámetro a `recibir_insumo`: no puede crear facturas sin duplicar `registrar_comprobante_produccion`.
-- SE ROMPE SI `registrar_comprobante_produccion` o `recibir_comprobante_produccion` cambian de firma (esta función las llama por posición): el bloque final de la
--          migración y la prueba `pruebas:insumo-compra-con-deuda` lo dirían. Y si un proveedor manda DOS facturas con el mismo número: la segunda se rechaza («ya está
--          registrado»), como en Facturas de insumos.
--
-- «SIN PAPEL». Si el proveedor todavía no dio el comprobante, la compra se registra como nota de venta provisional: serie «S/P» y un número que corre por proveedor
--   (000001, 000002…, bajo un candado por proveedor), con una nota que lo dice. Se reconoce a simple vista en Por pagar y se reemplaza cuando llegue el papel real.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, junto con la fusión de la web). UNA parte: solo una función, sin tablas ni políticas, con `lock_timeout`.
-- Idempotente (`create or replace`). Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.recibir_insumo_comprado(
  p_insumo_id uuid,
  p_ubicacion_id uuid,
  p_proveedor_id uuid,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_tipo text default 'factura',
  p_serie text default null,
  p_numero text default null,
  p_sin_papel boolean default false,
  p_condicion text default 'credito',
  p_fecha_emision date default null,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,
  p_codigo_lote text default null,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tipo text;
  v_serie text;
  v_numero text;
  v_nota text;
  v_n integer;
  v_comprobante uuid;
  v_item uuid;
  v_recepcion uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede registrar comprobantes de Producción.' using errcode = '42501';
  end if;
  -- El token sigue al contenido: el mismo token con otra compra se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('recibir_insumo_comprado', p_token, md5(row(p_insumo_id, p_ubicacion_id, p_proveedor_id, p_cantidad, p_costo_unitario, p_tipo, p_serie, p_numero, p_sin_papel,
    p_condicion, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, p_codigo_lote, p_nota)::text));
  -- Reintento honesto: si el primer envío sí llegó, se devuelve lo que ya quedó (sin volver a numerar un «sin papel»).
  if p_token is not null then
    v_comprobante := (select c.id from retail.comprobantes_produccion c where c.token_cliente = p_token);
    if v_comprobante is not null then
      v_recepcion := (select r.id from retail.comprobantes_produccion_recepciones r where r.token_cliente = p_token);
      return jsonb_build_object('comprobante_id', v_comprobante, 'recepcion_id', v_recepcion, 'repetido', true);
    end if;
  end if;

  if p_sin_papel then
    v_tipo := 'nota_venta';
    v_serie := 'S/P';
    -- El número corre por proveedor; el candado evita que dos compras sin papel al mismo tiempo se lleven el mismo.
    perform pg_advisory_xact_lock(hashtextextended('sin_papel:' || coalesce(p_proveedor_id::text, ''), 0));
    v_n := (select count(*) from retail.comprobantes_produccion c where c.proveedor_id = p_proveedor_id and c.serie = 'S/P') + 1;
    v_numero := lpad(v_n::text, 6, '0');
    v_nota := 'Sin el papel del proveedor: se reemplaza cuando llegue.' || coalesce(' ' || nullif(btrim(p_nota), ''), '');
  else
    v_tipo := p_tipo;
    v_serie := p_serie;
    v_numero := p_numero;
    v_nota := p_nota;
  end if;

  v_comprobante := retail.registrar_comprobante_produccion(
    p_proveedor_id, v_serie, v_numero, p_condicion,
    jsonb_build_array(jsonb_build_object('insumo_id', p_insumo_id, 'cantidad', p_cantidad, 'costo_unitario', p_costo_unitario)),
    v_tipo, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, v_nota, null, p_token);
  v_item := (select i.id from retail.comprobantes_produccion_items i where i.comprobante_id = v_comprobante order by i.id limit 1);
  v_recepcion := retail.recibir_comprobante_produccion(
    v_comprobante, p_ubicacion_id,
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'cantidad', p_cantidad, 'codigo_lote', nullif(btrim(coalesce(p_codigo_lote, '')), ''))),
    '[]'::jsonb, p_nota, p_token);

  return jsonb_build_object('comprobante_id', v_comprobante, 'recepcion_id', v_recepcion, 'repetido', false);
end;
$$;
comment on function retail.recibir_insumo_comprado(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean, text, date, date, numeric, jsonb, text, text, uuid) is
  'P03 (2-nov-2026): una compra de un insumo con su proveedor, su factura (con su deuda a crédito o su pago al contado) y su lote, en UNA transacción. Compone '
  'registrar_comprobante_produccion y recibir_comprobante_produccion. Con p_sin_papel registra una nota de venta provisional S/P que se reemplaza cuando llegue el papel. '
  'Solo líder. «Saldo inicial» y «Encontré tela» siguen por recibir_insumo.';
revoke all on function retail.recibir_insumo_comprado(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean, text, date, date, numeric, jsonb, text, text, uuid) from public, anon;
grant execute on function retail.recibir_insumo_comprado(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean, text, date, date, numeric, jsonb, text, text, uuid) to authenticated;

-- Comprobación final: las dos funciones que esta compone siguen con la firma que ella espera.
do $$
begin
  if to_regprocedure('retail.registrar_comprobante_produccion(uuid,text,text,text,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid)') is null then
    raise exception 'registrar_comprobante_produccion cambió de firma: revisa recibir_insumo_comprado';
  end if;
  if to_regprocedure('retail.recibir_comprobante_produccion(uuid,uuid,jsonb,jsonb,text,uuid)') is null then
    raise exception 'recibir_comprobante_produccion cambió de firma: revisa recibir_insumo_comprado';
  end if;
  if to_regprocedure('retail.recibir_insumo_comprado(uuid,uuid,uuid,numeric,numeric,text,text,text,boolean,text,date,date,numeric,jsonb,text,text,uuid)') is null then
    raise exception 'falta recibir_insumo_comprado';
  end if;
end;
$$;

reset lock_timeout;
