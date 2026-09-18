-- Escenario LOCAL para verificar /inventario/resumen en Tienda Trujillo (ADR-0097).
-- SOLO PARA EL POSTGRES LOCAL — nunca pegar en producción. Crea historial con fechas
-- pasadas respetando el modelo real (ventas + venta_items + movimientos aplicados con
-- fn_aplicar_movimiento, traslados en tránsito). Resuelve ids por SKU/nombre del seed.
-- Uso: docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres < scripts/pruebas/escenario-resumen-trujillo.sql
-- Produce: riesgo crítico, mejora con en camino, curva incompleta, sobrestock por
-- cobertura y por 30 días sin venta, historial corto. Se borra con `supabase db reset`.
set search_path = retail, public, extensions;

create or replace function pg_temp.entrada(p_var uuid, p_ub uuid, p_sub uuid, p_cant int, p_hace interval, p_motivo text default 'carga_inicial')
returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at, nota)
  values (p_var, p_ub, p_sub, 'entrada', p_cant, p_motivo, now() - p_hace, 'escenario local resumen')
  returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
end $$;

create or replace function pg_temp.venta(p_var uuid, p_ub uuid, p_sub_piso uuid, p_cant int, p_hace interval)
returns void language plpgsql as $$
declare v_venta uuid; v_item uuid; v_mov uuid; v_precio numeric; v_costo numeric;
begin
  select precio, costo into v_precio, v_costo from variantes where id = p_var;
  insert into ventas (ubicacion_id, created_at, nota) values (p_ub, now() - p_hace, 'escenario local resumen') returning id into v_venta;
  insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (v_venta, p_var, p_cant, v_precio, 0, v_costo) returning id into v_item;
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
  values (p_var, p_ub, p_sub_piso, 'salida', p_cant, 'venta', v_item, now() - p_hace) returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);
end $$;

create or replace function pg_temp.traslado_en_transito(p_var uuid, p_origen uuid, p_sub_origen uuid, p_destino uuid, p_cant int, p_hace interval, p_llega interval)
returns void language plpgsql as $$
declare v_tr uuid; v_mov uuid;
begin
  insert into transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, nota)
  values (p_origen, p_destino, 'en_transito', now() + p_llega, now() - p_hace, 'escenario local resumen') returning id into v_tr;
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at, nota)
  values (p_var, p_origen, p_sub_origen, 'salida', p_cant, 'traslado_salida', now() - p_hace, 'escenario local resumen') returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);
  insert into transferencia_items (transferencia_id, variante_id, cantidad, movimiento_id) values (v_tr, p_var, p_cant, v_mov);
end $$;

do $$
declare
  tru    uuid := (select id from ubicaciones where nombre = 'Tienda Trujillo');
  lima   uuid := (select id from ubicaciones where nombre = 'Tienda Lima');
  taller uuid := (select id from ubicaciones where tipo = 'taller' limit 1);
  piso   uuid;
  alm    uuid;
  casaca_m  uuid := (select id from variantes where sku = 'CAS-LUCI-BEI-M');
  casaca_l  uuid := (select id from variantes where sku = 'CAS-LUCI-BEI-L');
  mia_30    uuid := (select id from variantes where sku = 'PAN-MIA-AZM-30');
  anto_m    uuid := (select id from variantes where sku = 'VES-ANTO-ROS-M');
  vale_s_bl uuid := (select id from variantes where sku = 'BLU-VALE-BLA-S');
  vale_l_bl uuid := (select id from variantes where sku = 'BLU-VALE-BLA-L');
  i int;
begin
  select id into piso from sububicaciones where ubicacion_id = tru and tipo = 'piso_venta';
  select id into alm  from sububicaciones where ubicacion_id = tru and tipo = 'almacen_tienda';
  if casaca_m is null or mia_30 is null or anto_m is null or vale_s_bl is null or vale_l_bl is null or casaca_l is null then
    raise exception 'SKU del seed no encontrado — revisar nombres';
  end if;
  -- A) RIESGO CRÍTICO: Casaca Luciana M — 25 al piso hace 25 días, 26 ventas (≈1/día);
  --    queda piso 0 + almacén 3 = 3 → cobertura ≈ 2.9 días. Taller tiene 10 → sugerir traslado.
  perform pg_temp.entrada(casaca_m, tru, piso, 25, interval '25 days');
  for i in 1..26 loop
    perform pg_temp.venta(casaca_m, tru, piso, 1, (interval '1 day') * (24.5 - (i - 1) * 24.0 / 26.0));
  end loop;

  -- B) MEJORA EN CAMINO: Pantalón Mía 30 — 25 al piso hace 25 días, 24 ventas (≈0.96/día);
  --    queda piso 1 + almacén 5 = 6 → ≈ 6.3 días (riesgo). Llegan +10 del Taller mañana → 16.7 días.
  perform pg_temp.entrada(mia_30, tru, piso, 25, interval '25 days');
  for i in 1..24 loop
    perform pg_temp.venta(mia_30, tru, piso, 1, (interval '1 day') * (24.5 - (i - 1) * 24.0 / 24.0));
  end loop;
  perform pg_temp.traslado_en_transito(mia_30, taller, null, tru, 10, interval '1 day', interval '1 day');

  -- C) CURVA INCOMPLETA: Vestido Antonella Rosado — la M (5) se fue a Lima en un traslado en
  --    tránsito; quedan S y L con 5 → hueco en M sin ventas. Taller tiene 10 M → revisar redistribución.
  perform pg_temp.traslado_en_transito(anto_m, tru, alm, lima, 5, interval '2 days', interval '2 days');

  -- D) POSIBLE SOBRESTOCK por cobertura: Blusa Valentina S Blanco — +10 piso y +50 almacén hace 30
  --    días, 2 ventas → 0.07/día, 63 disponibles → ≈ 945 días.
  perform pg_temp.entrada(vale_s_bl, tru, piso, 10, interval '30 days');
  perform pg_temp.entrada(vale_s_bl, tru, alm, 50, interval '30 days');
  perform pg_temp.venta(vale_s_bl, tru, piso, 1, interval '20 days');
  perform pg_temp.venta(vale_s_bl, tru, piso, 1, interval '9 days');

  -- E) POSIBLE SOBRESTOCK por 30 días sin ventas: Blusa Valentina L Blanco — +3 almacén hace 35 días.
  perform pg_temp.entrada(vale_l_bl, tru, alm, 3, interval '35 days');

  -- F) HISTORIAL CORTO con ventas: Casaca Luciana L Beige — +6 piso hace 3 días, 2 ventas.
  perform pg_temp.entrada(casaca_l, tru, piso, 6, interval '3 days');
  perform pg_temp.venta(casaca_l, tru, piso, 1, interval '2 days');
  perform pg_temp.venta(casaca_l, tru, piso, 1, interval '1 day');
end $$;

select 'listo' as escenario;
