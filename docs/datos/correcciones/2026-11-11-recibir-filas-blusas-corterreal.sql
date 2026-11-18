-- Corrección de DATOS (no de esquema) — 2026-11-11, envío eeaad8e6 (CORTERREAL, Camisas y Blusas).
--
-- Qué pasó: por un error de la pantalla de Recibir (arreglado en el PR #1780), lo de Blusa Gardenia (5) y Blusa Indu (5)
-- entró al stock a nombre de la fila de la compra «Blusa Envol» (6), y la pantalla decía «16 de 6 · Sobran 10» y
-- «No llegó» en «bl. envolvente» y «Bl. indu».
--
-- Qué cambia: SOLO a qué fila de la compra pertenece cada cosa. El stock, los movimientos y los costos no se tocan
-- (las tres filas cuestan S/ 35 y las tres prendas entraron a S/ 35).
--   · 4 recibidos y 1 tanda de Blusa Gardenia  → fila «bl. envolvente»
--   · 4 recibidos y 1 tanda de Blusa Indu      → fila «Bl. indu»
--   · Lo contado: «Blusa Envol» 16 → 6, «bl. envolvente» 0 → 5, «Bl. indu» 0 → 5
--
-- Es un solo bloque: si un número no es el esperado, no se aplica nada. Se puede pegar dos veces: la segunda falla
-- sin cambiar nada (ya no encuentra las filas en «Blusa Envol»).
do $$
declare
  v_env uuid := 'eeaad8e6-2d2b-495c-8af0-9525ae0cd783';
  v_envol uuid := 'f4a6c553-c6d3-4401-a5a2-3fb9769cf63e';  -- «Blusa Envol» (6) → Blusa Begonia
  v_benv  uuid := 'bfe75703-6811-49bf-a215-c18b4e6d191e';  -- «bl. envolvente» (5) → Blusa Gardenia
  v_indu  uuid := 'b32ad4f7-d917-47a7-830e-e942ee58da7b';  -- «Bl. indu» (5) → Blusa Indu
  s_gard uuid := 'ebb73afb-a653-4dc5-b71d-aa0b1a9de73a';   -- la tanda de Blusa Gardenia
  s_indu uuid := 'b2c9612f-0ec4-4fff-bfbb-6a13ea0d4d25';   -- la tanda de Blusa Indu
  n int;
  v_esperado int;
  v_c record;
begin
  set local lock_timeout = '3s';
  -- Lo recibido es inmutable (fn_recepcion_despacho_fija): se apaga SOLO esa guardia, SOLO en este bloque, y se vuelve a encender abajo.
  execute 'alter table retail.despacho_recibidos disable trigger despacho_recibidos_fija';
  update retail.despacho_recibidos r set despacho_item_id = v_benv
   where r.despacho_id = v_env and r.despacho_item_id = v_envol
     and r.id = any((select s.recibidos from retail.despacho_salidas s where s.id = s_gard)::uuid[]);
  get diagnostics n = row_count; if n <> 4 then raise exception 'Gardenia: esperaba 4 recibidos, encontré %', n; end if;
  update retail.despacho_recibidos r set despacho_item_id = v_indu
   where r.despacho_id = v_env and r.despacho_item_id = v_envol
     and r.id = any((select s.recibidos from retail.despacho_salidas s where s.id = s_indu)::uuid[]);
  get diagnostics n = row_count; if n <> 4 then raise exception 'Indu: esperaba 4 recibidos, encontré %', n; end if;
  execute 'alter table retail.despacho_recibidos enable trigger despacho_recibidos_fija';

  update retail.despacho_salidas set despacho_item_id = v_benv where id = s_gard and despacho_item_id = v_envol;
  get diagnostics n = row_count; if n <> 1 then raise exception 'No encontré la tanda de Gardenia en «Blusa Envol»'; end if;
  update retail.despacho_salidas set despacho_item_id = v_indu where id = s_indu and despacho_item_id = v_envol;
  get diagnostics n = row_count; if n <> 1 then raise exception 'No encontré la tanda de Indu en «Blusa Envol»'; end if;

  -- La versión sube: una pantalla abierta con lo viejo no puede pisarlo (recarga).
  update retail.despacho_conteos set contadas = 6, version = version + 1 where despacho_id = v_env and despacho_item_id = v_envol and contadas = 16;
  get diagnostics n = row_count; if n <> 1 then raise exception 'El conteo de «Blusa Envol» ya no es 16'; end if;
  update retail.despacho_conteos set contadas = 5, version = version + 1 where despacho_id = v_env and despacho_item_id in (v_benv, v_indu) and contadas = 0;
  get diagnostics n = row_count; if n <> 2 then raise exception 'Los conteos de «bl. envolvente» y «Bl. indu» ya no son 0'; end if;

  -- Cada fila tiene que cuadrar: lo contado igual a lo que entró (6, 5 y 5) y nada «sin separar».
  for v_c in select c.despacho_item_id, c.contadas, c.en_stock, c.sin_separar from retail.fn_envio_cuentas(array[v_env]) c
              where c.despacho_item_id in (v_envol, v_benv, v_indu) loop
    -- (Sin `case … end then`: el editor de SQL de Supabase lo cortaba ahí. YA APLICADO en producción el 2026-11-11 por MCP, con el OK de Felipe.)
    v_esperado := 5;
    if v_c.despacho_item_id = v_envol then v_esperado := 6; end if;
    if v_c.sin_separar <> 0 or v_c.contadas <> v_c.en_stock or v_c.en_stock <> v_esperado then
      raise exception 'No cuadra la fila %: contadas %, en stock %, sin separar %', v_c.despacho_item_id, v_c.contadas, v_c.en_stock, v_c.sin_separar;
    end if;
  end loop;
end $$;
