-- ============================================================================
-- 20261105223000_llego_una_compra.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividad 5; ADR-0570, actividad 7)
-- «Llegó una compra»: varias líneas de un mismo papel, en una sola transacción
--
-- EL PROBLEMA PRIMERO. Una factura de tela suele traer varios colores y avíos, pero `recibir_insumo_comprado` registra una sola línea. Con cinco colores había que
-- repetir la hoja cinco veces, y la base rechazaba la misma factura a la segunda («ya está registrada»): el camino corto servía solo para un papel de una línea.
--
-- LA DECISIÓN. `registrar_compra_de_insumos` hace lo mismo con una lista: un comprobante con todas sus líneas y un lote por línea, todo o nada, con las dos funciones de
-- siempre. La pantalla convierte kilos y rollos a metros, porque el factor sale de la ficha de cada tela o de lo que la persona midió, y lo deja en la nota del lote.
-- `recibir_insumo_comprado` pasa a llamar a esta: queda una sola forma de registrar una compra.
-- `p_total` es el total del papel: 100 kg a S/ 18 son S/ 1,800, pero en metros, con el costo a 4 decimales, la cuenta puede dar S/ 1,799.99. La deuda es la del papel.
--
-- CONTRATO (Liskov)
--   PROMETE: `{comprobante_id, recepcion_id, repetido}`. Con el mismo token no se repite nada; con el mismo token y otro contenido, `token_reusado`.
--   ASUME:   líneas `{insumo_id, cantidad, costo_unitario, codigo_lote?, nota?}`, en la unidad del libro y sin IGV. Cuenta de un líder, como todo comprobante del Taller.
--   FALLA:   `compra_sin_lineas`, `compra_insumo_repetido` (un mismo insumo dos veces: la recepción lo rechaza y el costo por línea sería ambiguo), y lo que ya rechacen
--            `registrar_comprobante_produccion` y `recibir_comprobante_produccion`.
--   NO HACE: no toca una orden de insumos: lo pedido se recibe desde Recibir. La pantalla avisa si el proveedor tiene un pedido abierto.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable. Solo funciones: ADR-0195 no aplica. Pegar ANTES de publicar la web; sin ella, la hoja nueva falla con «no existe la función».
--
-- VERIFICACIÓN (solo lectura):
--   select to_regproc('retail.registrar_compra_de_insumos') is not null, position('registrar_compra_de_insumos' in pg_get_functiondef(to_regproc('retail.recibir_insumo_comprado'))) > 0;  → t | t
-- CÓMO SE DESHACE: volver a pegar `20261102235000` (la versión anterior de `recibir_insumo_comprado`), el reemplazo de abajo al revés y `drop function` de la nueva.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.registrar_compra_de_insumos(
  p_ubicacion_id uuid,
  p_proveedor_id uuid,
  p_lineas jsonb,
  p_tipo text default 'factura',
  p_serie text default null,
  p_numero text default null,
  p_sin_papel boolean default false,
  p_condicion text default 'credito',
  p_fecha_emision date default null,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,
  p_nota text default null,
  p_token uuid default null,
  p_total numeric default null
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
  v_recepcion uuid;
  v_recibir jsonb;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede registrar comprobantes de Producción.' using errcode = '42501';
  end if;
  perform retail.fn_intento_con_huella('registrar_compra_de_insumos', p_token, md5(row(p_ubicacion_id, p_proveedor_id, p_lineas, p_tipo, p_serie, p_numero, p_sin_papel,
    p_condicion, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, p_nota, p_total)::text));
  if p_token is not null then
    v_comprobante := (select c.id from retail.comprobantes_produccion c where c.token_cliente = p_token);
    if v_comprobante is not null then
      v_recepcion := (select r.id from retail.comprobantes_produccion_recepciones r where r.token_cliente = p_token);
      return jsonb_build_object('comprobante_id', v_comprobante, 'recepcion_id', v_recepcion, 'repetido', true);
    end if;
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra necesita al menos una línea.' using hint = 'compra_sin_lineas';
  end if;
  if (select count(*) <> count(distinct x ->> 'insumo_id') from jsonb_array_elements(p_lineas) x) then
    raise exception 'Cada insumo va una sola vez en la compra: si llegó a dos precios, regístralo en dos compras.' using hint = 'compra_insumo_repetido';
  end if;

  if p_sin_papel then
    v_tipo := 'nota_venta';
    v_serie := 'S/P';
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
    (select jsonb_agg(jsonb_build_object('insumo_id', x ->> 'insumo_id', 'cantidad', x ->> 'cantidad', 'costo_unitario', x ->> 'costo_unitario')) from jsonb_array_elements(p_lineas) x),
    v_tipo, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, v_nota, p_total, p_token);

  -- Cada línea de la factura se recibe entera: el insumo no se repite, así que él dice cuál es cuál.
  v_recibir := (
    select jsonb_agg(jsonb_build_object('item_id', i.id, 'cantidad', x ->> 'cantidad',
                                        'codigo_lote', nullif(btrim(coalesce(x ->> 'codigo_lote', '')), ''),
                                        'nota', nullif(btrim(coalesce(x ->> 'nota', '')), '')))
      from jsonb_array_elements(p_lineas) x
      join retail.comprobantes_produccion_items i on i.comprobante_id = v_comprobante and i.insumo_id = (x ->> 'insumo_id')::uuid
  );
  v_recepcion := retail.recibir_comprobante_produccion(v_comprobante, p_ubicacion_id, v_recibir, '[]'::jsonb, p_nota, p_token);

  return jsonb_build_object('comprobante_id', v_comprobante, 'recepcion_id', v_recepcion, 'repetido', false);
end;
$$;

revoke all on function retail.registrar_compra_de_insumos(uuid, uuid, jsonb, text, text, text, boolean, text, date, date, numeric, jsonb, text, uuid, numeric) from public, anon;
grant execute on function retail.registrar_compra_de_insumos(uuid, uuid, jsonb, text, text, text, boolean, text, date, date, numeric, jsonb, text, uuid, numeric) to authenticated;

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Cada lote guarda su propia nota («100 kg × 3.47 m/kg»); sin ella, la de la recepción, como siempre.
do $$
declare
  v_firma text := (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'recibir_comprobante_produccion');
begin
  perform pg_temp.reemplazar_anclado(v_firma,
    $v$v_hoy, 'compra', retail.fn_texto_o_null(p_nota), v_item.id, v_recepcion)$v$,
    $n$v_hoy, 'compra', coalesce(retail.fn_texto_o_null(v_l ->> 'nota'), retail.fn_texto_o_null(p_nota)), v_item.id, v_recepcion)$n$);
end;
$$;

-- Una sola forma de registrar una compra.
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
language sql
security definer
set search_path = retail, public, extensions
as $$
  select retail.registrar_compra_de_insumos(
    p_ubicacion_id, p_proveedor_id,
    jsonb_build_array(jsonb_build_object('insumo_id', p_insumo_id, 'cantidad', p_cantidad, 'costo_unitario', p_costo_unitario, 'codigo_lote', p_codigo_lote)),
    p_tipo, p_serie, p_numero, p_sin_papel, p_condicion, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, p_nota, p_token);
$$;

reset lock_timeout;
