-- ============================================================================
-- datos-reales-produccion.sql — NO es parte de la cadena 0001-0010.
--
-- A propósito el nombre no sigue el patrón <timestamp>_nombre.sql: así
-- `supabase db reset` (local) la ignora, igual que ya ignora
-- `benja-migracion.sql`. Esta migración toca datos que solo existen una
-- vez, en producción — replayearla en local no tiene sentido y sería
-- peligroso si algún día alguien la copia sin pensar.
--
-- QUÉ HACE:
--   1) Crea las ubicaciones mínimas para que Vender/Caja/Inventario/
--      Facturación tengan dónde operar el primer día: Tienda TRU y
--      Tienda AQP (enlazadas a las sedes reales de Dynamic vía
--      sede_dynamic_id) + Almacén Principal (concepto propio de retail,
--      Dynamic no lo tiene). No se crean ubicaciones para Taller/Central/
--      Oficina — no son puntos de venta ni de stock, no las usa retail.
--   2) Preserva los ÚNICOS datos reales que existían en el retail viejo:
--      la ficha fiscal de CAYLA S.A.C., la dirección fiscal de Tienda
--      Trujillo, la serie B004 con su correlativo real, y los 2
--      comprobantes ya transmitidos a SUNAT (uno aceptado, uno anulado).
--      Verificado por consulta directa a producción el 2026-09-12 — no
--      son datos de prueba, son documentos legales reales (entorno_
--      transmision = 'produccion', hash y URLs de apisunat.pe reales).
--
-- CÓMO EJECUTAR: pegar en el SQL Editor del proyecto de Dynamic
-- (vovjyyiafkxteijimpuy) DESPUÉS de aplicar 0001-0010 con el prefijo
-- `retail.` que exige CLAUDE.md — nunca antes (las FK a retail.ubicaciones
-- y retail.comprobantes todavía no existirían).
--
-- SE ROMPE SI: se corre dos veces — las inserciones no son
-- "on conflict do nothing", a propósito: una segunda corrida silenciosa
-- duplicaría un documento legal, y eso debe fallar ruidosamente, no
-- ignorarse.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
declare
  v_ubicacion_tru uuid;
  v_ubicacion_aqp uuid;
begin

  -- ---------- 1) ubicaciones base ----------
  insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id)
  values ('Tienda TRU', 'tienda', 'a13d3a80-4559-4f89-ad3e-f353bce72289')
  returning id into v_ubicacion_tru;

  insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id)
  values ('Tienda AQP', 'tienda', '12c9069d-6d0b-4506-aa95-845af38d4780')
  returning id into v_ubicacion_aqp;

  insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id)
  values ('Almacén Principal', 'almacen', null);

  -- ---------- 2) identidad fiscal real de CAYLA S.A.C. ----------
  insert into retail.configuracion_empresa
    (id, ruc, razon_social, nombre_comercial, email, web, telefono, resolucion_autorizacion, updated_at)
  values
    (true, '20605964550', 'CAYLA S.A.C.', 'CAYLA', 'caylaperu@gmail.com', 'www.cayla.pe',
     '+51953585537', '034-005-0004781', '2026-09-05T22:37:38.129697+00:00');

  insert into retail.ubicacion_datos_fiscales
    (ubicacion_id, direccion, ubigeo, departamento, provincia, distrito, telefono, updated_at)
  values
    (v_ubicacion_tru, 'LT. 26 MZ. Q URB. SAN ANDRES V ETAPA', '130111', 'La Libertad',
     'Trujillo', 'Victor Larco Herrera', '+51953585537', '2026-09-05T22:37:38.129697+00:00');

  -- ---------- 3) serie con su correlativo real (siguiente = 4) ----------
  insert into retail.series_comprobantes (id, ubicacion_id, tipo, serie, siguiente_numero)
  values ('7d49c40e-e155-4e71-8e97-d65c0c6abe0d', v_ubicacion_tru, 'boleta', 'B004', 4);

  -- ---------- 4) los 2 comprobantes reales, tal cual SUNAT los aceptó ----------
  -- B004-00000002 — boleta aceptada.
  insert into retail.comprobantes (
    id, venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
    cliente_nombre, moneda, subtotal, igv, total, estado, motivo_rechazo, respuesta_sunat,
    usuario_id, created_at, enviado_at, comprobante_original_id, motivo, items,
    entorno_transmision, motivo_anulacion, anulacion_solicitada_at, anulado_at,
    respuesta_anulacion, anulado_por
  ) values (
    '346a70f7-897d-4ad1-b2e4-4381e0b50545', null, v_ubicacion_tru, 'boleta', 'B004', 2,
    'dni', '71232045', 'RUIZ FERNANDEZ DANIEL JOSUE', 'PEN', 8.47, 1.53, 10, 'aceptado', null,
    '{"ok": true, "hash": "IelFhtGSBN9y/SeGR0TnGFshulGG4WOM/Cr6K3QLcbs=", "cdrUrl": "https://app.apisunat.pe/xml/585927/Vo5a95bRDI/R-20605964550-03-B004-2", "estado": "ACEPTADO", "pdfUrl": "https://app.apisunat.pe/pdf/a4/585927/Vo5a95bRDI/20605964550-03-B004-2", "xmlUrl": "https://app.apisunat.pe/xml/585927/Vo5a95bRDI/20605964550-03-B004-2", "mensaje": "El documento fue enviado correctamente y aceptado por SUNAT."}'::jsonb,
    '13ef8ea3-7bd4-4522-bae0-264c087ece5f', '2026-09-08T22:35:19.568069+00:00',
    '2026-09-08T22:35:56.346648+00:00', null, null,
    '[{"cantidad": 1, "descripcion": "Venta de mercadería", "precio_unitario": 8.47}]'::jsonb,
    'produccion', null, null, null, null, null
  );

  -- B004-00000003 — boleta emitida por error y anulada.
  insert into retail.comprobantes (
    id, venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
    cliente_nombre, moneda, subtotal, igv, total, estado, motivo_rechazo, respuesta_sunat,
    usuario_id, created_at, enviado_at, comprobante_original_id, motivo, items,
    entorno_transmision, motivo_anulacion, anulacion_solicitada_at, anulado_at,
    respuesta_anulacion, anulado_por
  ) values (
    '132dc403-4c7f-43cb-8185-ce62705273b4', null, v_ubicacion_tru, 'boleta', 'B004', 3,
    'dni', '71232045', 'RUIZ FERNANDEZ DANIEL JOSUE', 'PEN', 0.85, 0.15, 1, 'anulado', null,
    '{"ok": true, "hash": "oZmWvloA3D7SN1BP0R4DqclKCkBcOlYb4ECridt7/cc=", "cdrUrl": "https://app.apisunat.pe/xml/588053/uNxxokwRs8/R-20605964550-03-B004-3", "estado": "ACEPTADO", "pdfUrl": "https://app.apisunat.pe/pdf/a4/588053/uNxxokwRs8/20605964550-03-B004-3", "xmlUrl": "https://app.apisunat.pe/xml/588053/uNxxokwRs8/20605964550-03-B004-3", "entorno": "produccion", "mensaje": "El documento fue enviado correctamente y aceptado por SUNAT."}'::jsonb,
    '13ef8ea3-7bd4-4522-bae0-264c087ece5f', '2026-09-09T16:57:11.295187+00:00',
    '2026-09-09T16:58:00.79839+00:00', null, null,
    '[{"cantidad": 1, "descripcion": "Venta de mercadería", "precio_unitario": 0.85}]'::jsonb,
    'produccion', 'Se emitió por error', '2026-09-09T16:58:49.842501+00:00',
    '2026-09-10T14:18:15.416611+00:00',
    '{"estado": "ANULADO", "mensaje": "El documento se encuentra anulado.", "consultado_at": "2026-09-10T14:18:15.389Z"}'::jsonb,
    '13ef8ea3-7bd4-4522-bae0-264c087ece5f'
  );

end $$;
