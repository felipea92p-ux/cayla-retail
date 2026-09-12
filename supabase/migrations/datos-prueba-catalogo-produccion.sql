-- ============================================================================
-- datos-prueba-catalogo-produccion.sql — NO es parte de la cadena 0001-0010.
--
-- A propósito el nombre no sigue el patrón <timestamp>_nombre.sql: así
-- `supabase db reset` (local) la ignora — local ya tiene su propio catálogo
-- de prueba en seed.sql, distinto de este.
--
-- QUÉ HACE: carga un catálogo chico pero real (5 categorías, 6 colores, 1
-- proveedor, 6 productos, 36 variantes) y stock inicial en las 3
-- ubicaciones, para poder probar Vender/Caja/Facturación en producción
-- mientras retail sigue en etapa de pruebas (confirmado con Felipe,
-- 2026-09-12: no hay problema en cargar data de prueba, todavía no hay
-- operación real más allá de Facturación).
--
-- El stock se carga como movimientos tipo 'entrada' (motivo 'carga_inicial')
-- + fn_aplicar_movimiento(), NUNCA como INSERT directo en `stock` — stock es
-- un snapshot derivado de movimientos, insertarlo a mano sería crear un
-- estado que el propio ledger no puede explicar.
--
-- SE ROMPE SI: se corre dos veces — duplicaría todo el catálogo (no hay
-- "on conflict do nothing", a propósito: mejor que falle ruidoso a que
-- duplique en silencio).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
declare
  v_cat_blusas uuid; v_cat_pantalones uuid; v_cat_vestidos uuid; v_cat_polos uuid;
  v_cat_chompas uuid; v_cat_faldas uuid;
  v_prov uuid;
  v_prod uuid; v_var uuid; v_mov uuid;
  v_producto_ids uuid[] := '{}';
  v_tru uuid := '0cb726d8-758f-4483-9134-796c66e97a78';
  v_aqp uuid := 'ddd3d9eb-79f5-47a0-8eec-58b8f7096681';
  v_alm uuid := '18c5091c-9819-468a-9e11-9c9456011dd5';
begin

  -- ---------- categorías ----------
  insert into categorias (nombre) values ('Blusas') returning id into v_cat_blusas;
  insert into categorias (nombre) values ('Pantalones') returning id into v_cat_pantalones;
  insert into categorias (nombre) values ('Vestidos') returning id into v_cat_vestidos;
  insert into categorias (nombre) values ('Polos') returning id into v_cat_polos;
  insert into categorias (nombre) values ('Chompas') returning id into v_cat_chompas;
  insert into categorias (nombre) values ('Faldas') returning id into v_cat_faldas;

  -- ---------- colores ----------
  insert into colores (codigo, nombre, hex) values
    ('NEG', 'Negro', '#1a1a1a'),
    ('BLA', 'Blanco', '#f5f5f0'),
    ('BEI', 'Beige', '#d9c7a8'),
    ('ARE', 'Arena', '#c9a876'),
    ('ROJ', 'Rojo', '#b83227'),
    ('AZM', 'Azul Marino', '#1f2a44');

  -- ---------- proveedor ----------
  insert into proveedores (nombre, ruc, contacto) values
    ('Textiles del Sur SAC', '20487321654', 'Rosa Medina · 944 210 337')
    returning id into v_prov;

  -- ---------- productos + variantes ----------
  -- Cada producto: 2 colores x 3 tallas = 6 variantes.

  insert into productos (categoria_id, referencia, descripcion) values
    (v_cat_blusas, 'BLU-001', 'Blusa Valentina — manga larga, cuello redondo') returning id into v_prod;
  v_producto_ids := array_append(v_producto_ids, v_prod);
  insert into variantes (producto_id, color_codigo, talla, sku, precio, costo) values
    (v_prod, 'BLA', 'S', 'BLU-001-BLA-S', 109, 46), (v_prod, 'BLA', 'M', 'BLU-001-BLA-M', 109, 46), (v_prod, 'BLA', 'L', 'BLU-001-BLA-L', 109, 46),
    (v_prod, 'NEG', 'S', 'BLU-001-NEG-S', 109, 46), (v_prod, 'NEG', 'M', 'BLU-001-NEG-M', 109, 46), (v_prod, 'NEG', 'L', 'BLU-001-NEG-L', 109, 46);

  insert into productos (categoria_id, referencia, descripcion) values
    (v_cat_pantalones, 'PAN-001', 'Pantalón Palazzo — tiro alto, fluido') returning id into v_prod;
  v_producto_ids := array_append(v_producto_ids, v_prod);
  insert into variantes (producto_id, color_codigo, talla, sku, precio, costo) values
    (v_prod, 'NEG', 'S', 'PAN-001-NEG-S', 159, 68), (v_prod, 'NEG', 'M', 'PAN-001-NEG-M', 159, 68), (v_prod, 'NEG', 'L', 'PAN-001-NEG-L', 159, 68),
    (v_prod, 'BEI', 'S', 'PAN-001-BEI-S', 159, 68), (v_prod, 'BEI', 'M', 'PAN-001-BEI-M', 159, 68), (v_prod, 'BEI', 'L', 'PAN-001-BEI-L', 159, 68);

  insert into productos (categoria_id, referencia, descripcion) values
    (v_cat_vestidos, 'VES-001', 'Vestido Camila — midi, corte A') returning id into v_prod;
  v_producto_ids := array_append(v_producto_ids, v_prod);
  insert into variantes (producto_id, color_codigo, talla, sku, precio, costo) values
    (v_prod, 'ARE', 'S', 'VES-001-ARE-S', 189, 82), (v_prod, 'ARE', 'M', 'VES-001-ARE-M', 189, 82), (v_prod, 'ARE', 'L', 'VES-001-ARE-L', 189, 82),
    (v_prod, 'ROJ', 'S', 'VES-001-ROJ-S', 199, 86), (v_prod, 'ROJ', 'M', 'VES-001-ROJ-M', 199, 86), (v_prod, 'ROJ', 'L', 'VES-001-ROJ-L', 199, 86);

  insert into productos (categoria_id, referencia, descripcion) values
    (v_cat_polos, 'POL-001', 'Polo Básico Algodón Pima') returning id into v_prod;
  v_producto_ids := array_append(v_producto_ids, v_prod);
  insert into variantes (producto_id, color_codigo, talla, sku, precio, costo) values
    (v_prod, 'BLA', 'S', 'POL-001-BLA-S', 59, 24), (v_prod, 'BLA', 'M', 'POL-001-BLA-M', 59, 24), (v_prod, 'BLA', 'L', 'POL-001-BLA-L', 59, 24),
    (v_prod, 'AZM', 'S', 'POL-001-AZM-S', 59, 24), (v_prod, 'AZM', 'M', 'POL-001-AZM-M', 59, 24), (v_prod, 'AZM', 'L', 'POL-001-AZM-L', 59, 24);

  insert into productos (categoria_id, referencia, descripcion) values
    (v_cat_chompas, 'CHO-001', 'Chompa Oversize — punto grueso') returning id into v_prod;
  v_producto_ids := array_append(v_producto_ids, v_prod);
  insert into variantes (producto_id, color_codigo, talla, sku, precio, costo) values
    (v_prod, 'BEI', 'S', 'CHO-001-BEI-S', 149, 64), (v_prod, 'BEI', 'M', 'CHO-001-BEI-M', 149, 64), (v_prod, 'BEI', 'L', 'CHO-001-BEI-L', 149, 64),
    (v_prod, 'NEG', 'S', 'CHO-001-NEG-S', 149, 64), (v_prod, 'NEG', 'M', 'CHO-001-NEG-M', 149, 64), (v_prod, 'NEG', 'L', 'CHO-001-NEG-L', 149, 64);

  insert into productos (categoria_id, referencia, descripcion) values
    (v_cat_faldas, 'FAL-001', 'Falda Midi Plisada') returning id into v_prod;
  v_producto_ids := array_append(v_producto_ids, v_prod);
  insert into variantes (producto_id, color_codigo, talla, sku, precio, costo) values
    (v_prod, 'NEG', 'S', 'FAL-001-NEG-S', 119, 50), (v_prod, 'NEG', 'M', 'FAL-001-NEG-M', 119, 50), (v_prod, 'NEG', 'L', 'FAL-001-NEG-L', 119, 50),
    (v_prod, 'ARE', 'S', 'FAL-001-ARE-S', 119, 50), (v_prod, 'ARE', 'M', 'FAL-001-ARE-M', 119, 50), (v_prod, 'ARE', 'L', 'FAL-001-ARE-L', 119, 50);

  -- ---------- stock inicial: un movimiento de entrada por variante y ubicación ----------
  -- Tienda TRU (donde ya hay una caja abierta) y AQP quedan con stock de piso;
  -- Almacén Principal con el grueso, listo para bajar a tienda después.
  -- OJO: filtrado por v_producto_ids (las variantes recién creadas), NUNCA
  -- "select id from variantes" a secas — eso barrería con carga_inicial
  -- CUALQUIER variante que ya existiera, de cualquier catálogo anterior.
  for v_var in select id from variantes where producto_id = any(v_producto_ids) loop
    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, nota)
      values (v_var, v_tru, 'entrada', 12, 'carga_inicial', 'Carga inicial de catálogo de prueba')
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, nota)
      values (v_var, v_aqp, 'entrada', 8, 'carga_inicial', 'Carga inicial de catálogo de prueba')
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, nota)
      values (v_var, v_alm, 'entrada', 25, 'carga_inicial', 'Carga inicial de catálogo de prueba')
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);
  end loop;

  -- ---------- series de factura, para poder probar el flujo completo ----------
  -- Trujillo ya tiene su boleta real (B004, datos-reales-produccion.sql) — acá
  -- solo se agrega la de factura. Arequipa no tenía ninguna todavía. Misma
  -- convención que ya sugiere la propia pantalla de Facturación ("B004
  -- Trujillo, B005 Arequipa, B006 Lima" — Ayuda de "Series de comprobantes").
  insert into series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  values
    (v_tru, 'factura', 'F004', 1),
    (v_aqp, 'boleta', 'B005', 1),
    (v_aqp, 'factura', 'F005', 1);

end $$;
