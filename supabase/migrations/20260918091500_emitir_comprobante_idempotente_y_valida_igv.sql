-- ============================================================================
-- 20260918091500_emitir_comprobante_idempotente_y_valida_igv.sql — CAYLA V2
--
-- Cierra los huecos 1 y 2(b) de docs/datos/modulos/08-facturacion-sunat.md
-- (auditoría 2026-09-17, ambos marcados GRAVE).
--
-- Hueco 1: emitir_comprobante no tenía token de idempotencia. El caso caro
-- no es el doble clic (ya lo bloquea `cargando` en el botón) sino la
-- respuesta que se pierde en el camino DESPUÉS de que el servidor ya
-- reservó el correlativo — el reintento del formulario quemaba un segundo
-- número irreversible ante SUNAT. Mismo patrón que `registrar_venta`
-- (0003_funciones.sql, ADR-0032/0033): columna `token_cliente`, se revisa
-- ANTES de reservar el correlativo (para que el reintento no consuma uno
-- nuevo), insert dentro de un bloque que atrapa `unique_violation` para la
-- carrera de dos clics simultáneos.
--
-- Hueco 2(b): ni emitir_comprobante ni crear_proforma validaban ninguna
-- relación entre subtotal, igv y total — cualquiera que llamara la RPC
-- directo (sin pasar por el navegador) podía guardar cifras que no cuadran.
-- Se agrega el candado en la base, igual que el correlativo. El cálculo del
-- 18% sigue en el navegador (ComprobantesPanel.tsx, ProformasPanel.tsx) —
-- moverlo a la base es deuda aparte que esto no resuelve; esto solo impide
-- que una cifra que no cuadra llegue a guardarse.
--
-- p_token se agrega al FINAL con default null: los llamadores existentes
-- (registrar_venta en 0011, convertir_proforma_a_comprobante acá mismo)
-- siguen resolviendo con sus posicionales sin tocarlos — no reciben
-- idempotencia propia con este cambio, siguen exactamente igual que antes.
-- El `drop function` es necesario igual (ADR-0026): un `create or replace`
-- con un parámetro nuevo no reemplaza la firma vieja, la deja sobrecargada
-- al lado.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.comprobantes add column token_cliente uuid unique;

drop function if exists retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb);

create or replace function retail.emitir_comprobante(
  p_ubicacion_id uuid, p_tipo text, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_venta_id uuid default null, p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null, p_cliente_nombre text default null,
  p_items jsonb default null, p_token uuid default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_serie text; v_numero integer; v_id uuid; v_persona uuid; v_items jsonb; v_existente comprobantes%rowtype;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para emitir comprobantes en esa ubicación';
  end if;
  if p_subtotal is null or p_igv is null or round(p_subtotal + p_igv, 2) <> round(p_total, 2) then
    raise exception 'El subtotal (S/%) más el IGV (S/%) no cuadra con el total (S/%)', p_subtotal, p_igv, p_total;
  end if;
  -- Idempotencia (mismo patrón que registrar_venta): se revisa ANTES de
  -- reservar el correlativo, así un reintento con el mismo token no quema
  -- un segundo número.
  if p_token is not null then
    select * into v_existente from comprobantes where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;
  select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(p_ubicacion_id, p_tipo);
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  v_items := coalesce(p_items, jsonb_build_array(jsonb_build_object('descripcion', 'Venta de mercadería', 'cantidad', 1, 'precio_unitario', p_subtotal)));
  begin
    insert into comprobantes (venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
      cliente_nombre, subtotal, igv, total, usuario_id, items, token_cliente)
      values (p_venta_id, p_ubicacion_id, p_tipo, v_serie, v_numero, p_cliente_tipo_doc, p_cliente_num_doc,
        p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona, v_items, p_token)
      returning id into v_id;
  exception when unique_violation then
    -- ponytail: esto atrapa la carrera de dos clics simultáneos (no el
    -- reintento secuencial de arriba, que ya no llega hasta acá). En esa
    -- carrera el perdedor sí alcanza a reservar un correlativo antes de
    -- chocar acá — un hueco en la numeración, legal, mismo tipo que ya
    -- acepta "Liberar sin espera". El candado real contra el doble clic
    -- sigue siendo `cargando` en el botón; esto solo garantiza que nunca se
    -- duplique el comprobante. Si el volumen de dobles clics simultáneos
    -- crece, el upgrade es un advisory lock por token antes de reservar.
    if p_token is null then raise; end if;
    select * into v_existente from comprobantes where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;
  return v_id;
end;
$$;

grant execute on function retail.emitir_comprobante to authenticated;

-- Hueco 2(b) en crear_proforma: misma validación, sin idempotencia propia
-- (crear_proforma no consume correlativo — "barato: dos clics = dos
-- proformas" queda igual, es un hueco distinto). Firma sin cambios: alcanza
-- con create or replace, sin drop, y conserva los grants ya existentes.
create or replace function retail.crear_proforma(
  p_ubicacion_id uuid, p_items jsonb, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_cliente_nombre text default null, p_cliente_num_doc text default null, p_vence_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para crear proformas en esa ubicación';
  end if;
  if p_subtotal is null or p_igv is null or round(p_subtotal + p_igv, 2) <> round(p_total, 2) then
    raise exception 'El subtotal (S/%) más el IGV (S/%) no cuadra con el total (S/%)', p_subtotal, p_igv, p_total;
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  insert into proformas (ubicacion_id, items, subtotal, igv, total, cliente_nombre, cliente_num_doc, usuario_id, vence_at)
    values (p_ubicacion_id, p_items, p_subtotal, p_igv, p_total, p_cliente_nombre, p_cliente_num_doc, v_persona, p_vence_at)
    returning id into v_id;
  return v_id;
end;
$$;
