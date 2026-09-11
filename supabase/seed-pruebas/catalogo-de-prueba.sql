-- ============================================================================
-- CATÁLOGO DE PRUEBA — solo local, y solo a pedido. NUNCA en producción.
--
-- POR QUÉ NO ESTÁ EN `seed.sql`
--   `seed.sql` lo dice explícito y la decisión sigue en pie: «un catálogo de
--   juguete en el seed haría que Inteligencia mienta». Un `db reset` deja el
--   local limpio, sin prendas, para que nadie tome por dato real lo que es un
--   invento. Este archivo existe para la otra necesidad, que `seed.sql` no
--   cubre: **verificar en el navegador las pantallas que no se pueden probar
--   sin prendas** — escanear en el conteo, vender por el modal, mover stock.
--   El 10-sep dos verificaciones se cortaron en el mismo punto por esto
--   (ADR-0031 y ADR-0032: «local tiene cero variantes»).
--
-- QUÉ SIEMBRA — 8 modelos, 38 variantes, en el vocabulario de CAYLA
--   Cada prenda pasa por el MISMO camino que una real: el código corto y los
--   códigos de barras los acuña `fn_asignar_codigo_variante` (ADR-0025), no se
--   escriben a mano. Y el stock NO se inserta en `stock`: se insertan
--   `movimientos` de entrada y se deriva con `recalcular_stock()`, porque
--   `stock` es un snapshot y `movimientos` la única fuente de verdad
--   (principio 4). Un seed que viole eso enseña el atajo equivocado.
--
--   El stock está repartido a propósito para que las reglas tengan casos:
--     · AQP (la sede del usuario del seed) tiene la mayoría, con cantidades
--       variadas — incluidas prendas con UNA sola unidad, que es el caso que la
--       venta sin internet tiene que bloquear (ADR-0013 §C, umbral 2).
--     · TRU y LIM tienen algo, para que haya a dónde trasladar y qué comparar.
--     · Siete variantes quedan SIN stock en ninguna sede: existen en el catálogo
--       y no en el piso, que es lo que descubre un conteo.
--
-- CÓMO SE APLICA (con el stack de retail levantado; ver `pnpm local:donde`):
--   cat supabase/seed-pruebas/catalogo-de-prueba.sql \
--     | docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
--   Se puede correr más de una vez: cada modelo se identifica por `sku_padre`
--   y no se duplica. El stock tampoco: los movimientos llevan una nota fija y
--   solo se insertan si aún no existen.
--
-- CÓMO SE QUITA: `npx supabase db reset` (vuelve al local limpio de seed.sql).
-- ============================================================================

set search_path to retail, public, extensions;

do $$
declare
  v_aqp uuid; v_tru uuid; v_lim uuid;
  v_persona uuid;
  r record;
begin
  select id into v_aqp from sedes where codigo = 'AQP';
  select id into v_tru from sedes where codigo = 'TRU';
  select id into v_lim from sedes where codigo = 'LIM';
  select id into v_persona from personas where auth_user_id = '22222222-2222-4222-8222-000000000001';

  -- ── 1. Modelos ─────────────────────────────────────────────────────────────
  insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
  select t.sku_padre, t.referencia, c.id, 'mujer', 'CAYLA', 'Otoño 2026'
  from (values
    ('PRB-BLU-LIMA',   'Blusa Lima',            'Blusas'),
    ('PRB-PAN-PALAZO', 'Pantalón Palazzo',      'Pantalones'),
    ('PRB-VES-CAMIS',  'Vestido Camisero',      'Vestidos'),
    ('PRB-ABR-ALPACA', 'Abrigo Alpaca',         'Abrigos'),
    ('PRB-BUF-BABY',   'Chalina Baby Alpaca',   'Bufandas/Chalinas'),
    ('PRB-BLZ-SASTRE', 'Blazer Sastre',         'Blazers/Sacos'),
    ('PRB-BOD-CANALE', 'Body Canalé',           'Bodys'),
    ('PRB-FAL-MIDI',   'Falda Midi Plisada',    'Faldas')
  ) as t(sku_padre, referencia, categoria)
  join categorias c on c.nombre = t.categoria
  on conflict (sku_padre) do nothing;

  -- ── 2. Variantes: talla × color, con el color YA normalizado (color_id) ─────
  -- Sin `color_id`, `fn_asignar_codigo_variante` devuelve NULL a propósito y la
  -- prenda queda sin código corto (0047). Acá todas lo traen para que todas
  -- sean escaneables por su código CAYLA.
  insert into variantes (producto_id, sku, talla, color, color_id, costo, precio, precio_taller, stock_minimo)
  select p.id,
         p.sku_padre || '-' || col.codigo || coalesce('-' || t.talla, ''),
         t.talla, col.nombre, col.codigo,
         t.costo, t.precio, t.costo, t.minimo
  from (values
    -- sku_padre,        color, talla, costo, precio, minimo
    ('PRB-BLU-LIMA',   'BLA', 'S',  32,  89, 1),
    ('PRB-BLU-LIMA',   'BLA', 'M',  32,  89, 2),
    ('PRB-BLU-LIMA',   'BLA', 'L',  32,  89, 1),
    ('PRB-BLU-LIMA',   'NEG', 'S',  32,  89, 1),
    ('PRB-BLU-LIMA',   'NEG', 'M',  32,  89, 2),
    ('PRB-BLU-LIMA',   'NEG', 'L',  32,  89, 1),
    ('PRB-PAN-PALAZO', 'NEG', 'S',  48, 129, 1),
    ('PRB-PAN-PALAZO', 'NEG', 'M',  48, 129, 1),
    ('PRB-PAN-PALAZO', 'NEG', 'L',  48, 129, 1),
    ('PRB-PAN-PALAZO', 'BEI', 'S',  48, 129, 0),
    ('PRB-PAN-PALAZO', 'BEI', 'M',  48, 129, 0),
    ('PRB-PAN-PALAZO', 'BEI', 'L',  48, 129, 0),
    ('PRB-VES-CAMIS',  'AZM', 'S',  61, 159, 1),
    ('PRB-VES-CAMIS',  'AZM', 'M',  61, 159, 1),
    ('PRB-VES-CAMIS',  'AZM', 'L',  61, 159, 1),
    ('PRB-VES-CAMIS',  'VIN', 'S',  61, 159, 0),
    ('PRB-VES-CAMIS',  'VIN', 'M',  61, 159, 0),
    ('PRB-VES-CAMIS',  'VIN', 'L',  61, 159, 0),
    ('PRB-ABR-ALPACA', 'BEI', 'M', 140, 349, 1),
    ('PRB-ABR-ALPACA', 'BEI', 'L', 140, 349, 0),
    ('PRB-ABR-ALPACA', 'GRI', 'M', 140, 349, 1),
    ('PRB-ABR-ALPACA', 'GRI', 'L', 140, 349, 0),
    ('PRB-BUF-BABY',   'ROJ', null, 28,  79, 2),
    ('PRB-BUF-BABY',   'CRU', null, 28,  79, 2),
    ('PRB-BUF-BABY',   'GRI', null, 28,  79, 0),
    ('PRB-BLZ-SASTRE', 'NEG', 'S',  85, 219, 1),
    ('PRB-BLZ-SASTRE', 'NEG', 'M',  85, 219, 1),
    ('PRB-BLZ-SASTRE', 'NEG', 'L',  85, 219, 0),
    ('PRB-BOD-CANALE', 'BLA', 'S',  22,  69, 2),
    ('PRB-BOD-CANALE', 'BLA', 'M',  22,  69, 2),
    ('PRB-BOD-CANALE', 'BLA', 'L',  22,  69, 1),
    ('PRB-BOD-CANALE', 'NEG', 'S',  22,  69, 2),
    ('PRB-BOD-CANALE', 'NEG', 'M',  22,  69, 2),
    ('PRB-BOD-CANALE', 'NEG', 'L',  22,  69, 1),
    ('PRB-FAL-MIDI',   'NEG', 'S',  45, 119, 1),
    ('PRB-FAL-MIDI',   'NEG', 'M',  45, 119, 1),
    ('PRB-FAL-MIDI',   'CEL', 'S',  45, 119, 0),
    ('PRB-FAL-MIDI',   'CEL', 'M',  45, 119, 0)
  ) as t(sku_padre, color, talla, costo, precio, minimo)
  join productos p on p.sku_padre = t.sku_padre
  join colores col on col.codigo = t.color
  on conflict (sku) do nothing;

  -- ── 3. Códigos: el corto de CAYLA y el de barras, por el camino real ────────
  for r in
    select v.id from variantes v join productos p on p.id = v.producto_id
    where p.sku_padre like 'PRB-%' and v.codigo is null
  loop
    perform fn_asignar_codigo_variante(r.id);
  end loop;

  -- ── 4. Stock: movimientos de entrada, nunca un insert en `stock` ────────────
  -- La nota fija es lo que vuelve esto re-ejecutable sin duplicar unidades.
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, usuario_id, nota)
  select v.id, s.id, 'entrada', t.cantidad, 'recepcion', 'tienda', v_persona, 'seed de prueba'
  from (values
    -- sku,                    sede, cantidad
    ('PRB-BLU-LIMA-BLA-S',   'AQP', 3),
    ('PRB-BLU-LIMA-BLA-M',   'AQP', 5),
    ('PRB-BLU-LIMA-BLA-L',   'AQP', 2),
    ('PRB-BLU-LIMA-NEG-S',   'AQP', 1),   -- ← UNA sola: la venta sin internet debe bloquearla
    ('PRB-BLU-LIMA-NEG-M',   'AQP', 4),
    ('PRB-BLU-LIMA-NEG-L',   'AQP', 2),
    ('PRB-BLU-LIMA-BLA-M',   'TRU', 2),
    ('PRB-BLU-LIMA-NEG-M',   'LIM', 3),
    ('PRB-PAN-PALAZO-NEG-S', 'AQP', 2),
    ('PRB-PAN-PALAZO-NEG-M', 'AQP', 3),
    ('PRB-PAN-PALAZO-NEG-L', 'AQP', 1),   -- ← una sola
    ('PRB-PAN-PALAZO-BEI-M', 'AQP', 2),
    ('PRB-PAN-PALAZO-BEI-S', 'TRU', 1),
    ('PRB-VES-CAMIS-AZM-S',  'AQP', 2),
    ('PRB-VES-CAMIS-AZM-M',  'AQP', 2),
    ('PRB-VES-CAMIS-AZM-L',  'AQP', 1),   -- ← una sola
    ('PRB-VES-CAMIS-VIN-M',  'AQP', 1),   -- ← una sola
    ('PRB-VES-CAMIS-VIN-S',  'LIM', 2),
    ('PRB-ABR-ALPACA-BEI-M', 'AQP', 2),
    ('PRB-ABR-ALPACA-GRI-M', 'AQP', 1),   -- ← una sola
    ('PRB-ABR-ALPACA-BEI-L', 'TRU', 1),
    ('PRB-BUF-BABY-ROJ',     'AQP', 6),
    ('PRB-BUF-BABY-CRU',     'AQP', 4),
    ('PRB-BLZ-SASTRE-NEG-S', 'AQP', 2),
    ('PRB-BLZ-SASTRE-NEG-M', 'AQP', 2),
    ('PRB-BOD-CANALE-BLA-S', 'AQP', 5),
    ('PRB-BOD-CANALE-BLA-M', 'AQP', 5),
    ('PRB-BOD-CANALE-NEG-S', 'AQP', 4),
    ('PRB-BOD-CANALE-NEG-M', 'AQP', 6),
    ('PRB-BOD-CANALE-NEG-L', 'AQP', 2),
    ('PRB-FAL-MIDI-NEG-S',   'AQP', 2),
    ('PRB-FAL-MIDI-NEG-M',   'AQP', 3),
    ('PRB-FAL-MIDI-CEL-M',   'LIM', 2)
    -- Sin stock en ninguna sede, a propósito: PRB-ABR-ALPACA-GRI-L, PRB-BUF-BABY-GRI,
    -- PRB-BLZ-SASTRE-NEG-L, PRB-BOD-CANALE-BLA-L, PRB-FAL-MIDI-CEL-S, PRB-PAN-PALAZO-BEI-L,
    -- PRB-VES-CAMIS-VIN-L. Existen en el catálogo y no en el piso.
  ) as t(sku, sede, cantidad)
  join variantes v on v.sku = t.sku
  join sedes s on s.codigo = t.sede
  where not exists (
    select 1 from movimientos m
    where m.variante_id = v.id and m.sede_id = s.id and m.nota = 'seed de prueba'
  );

  perform recalcular_stock();
end $$;

-- El resumen que SÍ se ve. Debe decir 8 modelos, 38 variantes, 38 con código,
-- 33 filas de stock y 86 unidades.
select
  (select count(*) from productos where sku_padre like 'PRB-%')                                        as modelos,
  (select count(*) from variantes v join productos p on p.id = v.producto_id where p.sku_padre like 'PRB-%') as variantes,
  (select count(*) from variantes v join productos p on p.id = v.producto_id where p.sku_padre like 'PRB-%' and v.codigo is not null) as con_codigo,
  (select count(*) from codigos_barras cb join variantes v on v.id = cb.variante_id join productos p on p.id = v.producto_id where p.sku_padre like 'PRB-%') as codigos_barras,
  (select count(*) from stock s join variantes v on v.id = s.variante_id join productos p on p.id = v.producto_id where p.sku_padre like 'PRB-%' and s.cantidad > 0) as filas_stock,
  (select coalesce(sum(s.cantidad), 0) from stock s join variantes v on v.id = s.variante_id join productos p on p.id = v.producto_id where p.sku_padre like 'PRB-%') as unidades;
