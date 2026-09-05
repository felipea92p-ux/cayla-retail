-- Fase 1 del reemplazo de Alegra: conecta emitir_comprobante/emitir_nota con
-- ítems reales — Lucode (proveedor PSE elegido, ADR-0005) exige un desglose
-- de línea (descripción, cantidad, precio unitario) para transmitir un
-- documento válido a SUNAT. Sin esto no hay nada que enviar de verdad.
--
-- QUÉ PROMETE: `comprobantes.items` guarda ese detalle. `emitir_comprobante`
-- y `emitir_nota` aceptan `p_items` opcional:
--   - Si se manda, se usa tal cual (lo normal cuando Facturación se conecte a
--     `ventas`/`movimientos` — fuera de esta fase).
--   - Si NO se manda (el flujo manual de "Emitir" en `ComprobantesPanel.tsx`
--     hoy no pide desglose), se construye un solo ítem genérico con el
--     subtotal real. Sigue siendo verdad contable — el monto es exacto —
--     solo no está desglosado por SKU. `ComprobantesPanel.tsx` NO se toca en
--     esta migración a propósito: rediseñar cómo captura ítems es una
--     decisión de UX de Felipe, no algo que se decide en una migración.
--   - `emitir_nota`, sin items explícitos, hereda los del comprobante
--     original antes de caer al genérico — una nota corrige la operación
--     original, tiene más sentido partir de lo que ya se facturó.
--
-- QUÉ ASUME: el formato interno es deliberadamente MÁS SIMPLE que el que
-- pide Lucode (unidad_de_medida/porcentaje_igv/codigo_tipo_afectacion_igv) —
-- esa traducción vive en `apps/web/lib/lucode.ts`, no en la base, para no
-- amarrar el esquema a un proveedor (mismo criterio que `padron.ts` ya usa
-- para RENIEC/SUNAT: cambiar de proveedor no debe tocar una migración).
--
-- CÓMO SE REVIERTE: `alter table comprobantes drop column items;` y volver a
-- pegar `emitir_comprobante`/`emitir_nota` tal como quedaron en `0034`.

alter table comprobantes add column if not exists items jsonb;

-- `create or replace` NO alcanza para agregar un parámetro al final: Postgres
-- identifica una función por nombre + tipos de parámetros de ENTRADA, así que
-- una firma con un argumento más es una función DISTINTA, no un reemplazo —
-- quedarían las dos versiones conviviendo y cualquier llamada con los
-- parámetros viejos se vuelve ambigua ("is not unique"). Encontrado probando
-- esta migración en local antes de entregarla, no leyendo el código.
drop function if exists emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text);
drop function if exists emitir_nota(uuid, text, text, numeric, numeric, numeric);

create or replace function emitir_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_venta_id uuid default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
  v_items jsonb;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para emitir comprobantes de esa sede';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total del comprobante debe ser mayor a 0';
  end if;
  if p_tipo = 'factura' and (p_cliente_tipo_doc <> 'ruc' or p_cliente_num_doc is null) then
    raise exception 'Una factura requiere el RUC del cliente';
  end if;

  v_items := coalesce(
    p_items,
    jsonb_build_array(jsonb_build_object(
      'descripcion', 'Venta de mercadería',
      'cantidad', 1,
      'precio_unitario', p_subtotal
    ))
  );
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El comprobante no tiene ítems';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from fn_reservar_numero_serie(p_sede_id, p_tipo) r;

  insert into comprobantes (
    venta_id, sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
    cliente_nombre, subtotal, igv, total, usuario_id, items
  ) values (
    p_venta_id, p_sede_id, p_tipo, v_serie, v_numero, p_cliente_tipo_doc, p_cliente_num_doc,
    p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona_id, v_items
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function emitir_nota(
  p_comprobante_original_id uuid,
  p_tipo text,
  p_motivo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original comprobantes%rowtype;
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
  v_items jsonb;
begin
  if p_tipo not in ('nota_credito', 'nota_debito') then
    raise exception 'Tipo de nota inválido: %', p_tipo;
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'La nota requiere un motivo';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total de la nota debe ser mayor a 0';
  end if;

  select * into v_original from comprobantes where id = p_comprobante_original_id;
  if not found then
    raise exception 'El comprobante original % no existe', p_comprobante_original_id;
  end if;
  if v_original.estado <> 'aceptado' then
    raise exception 'El comprobante original debe estar aceptado por SUNAT (estado actual: %)', v_original.estado;
  end if;
  if not fn_puede_operar_sede(v_original.sede_id) then
    raise exception 'No tienes permiso para emitir notas de esa sede';
  end if;

  v_items := coalesce(
    p_items,
    v_original.items,
    jsonb_build_array(jsonb_build_object(
      'descripcion', 'Ajuste — ' || p_motivo,
      'cantidad', 1,
      'precio_unitario', p_subtotal
    ))
  );

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from fn_reservar_numero_serie(v_original.sede_id, p_tipo) r;

  insert into comprobantes (
    venta_id, sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
    subtotal, igv, total, usuario_id, comprobante_original_id, motivo, items
  ) values (
    v_original.venta_id, v_original.sede_id, p_tipo, v_serie, v_numero,
    v_original.cliente_tipo_doc, v_original.cliente_num_doc, v_original.cliente_nombre,
    p_subtotal, p_igv, p_total, v_persona_id, p_comprobante_original_id, p_motivo, v_items
  ) returning id into v_id;

  return v_id;
end;
$$;
