-- Datos de PRUEBA para ver «Cuadrar con el banco» en la base LOCAL (nunca en producción). Todo lleva la marca «(prueba)» o «[PRUEBA-CUADRAR]».
-- Poner:  docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres < este-archivo.sql   (parte «poner», hasta la línea de corte)
-- Quitar: correr la parte «quitar» del final.
-- ==== PONER ====
set search_path = retail, public;
do $$
declare
  v_f uuid := 'f0f15eea-3c45-47ce-8b91-097a0f21419f';
  v_hoy date := retail.fn_hoy_lima();
  v_bcp uuid; v_bbva uuid;
  v_ibk uuid := 'cc632d03-6493-41cc-836a-beb6980ad64e';
  v_izi uuid := 'a173d038-4ddb-4357-ab48-a2f203265aa4';
  v_m uuid;
begin
  if exists (select 1 from cuentas_dinero where nombre = 'BCP Empresa (prueba)') then raise notice 'ya sembrado'; return; end if;
  insert into cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden, creada_por)
    values ('BCP Empresa (prueba)', 'banco', '104', 1000, v_hoy - 40, 10, v_f) returning id into v_bcp;
  insert into cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden, creada_por)
    values ('BBVA Operativa (prueba)', 'banco', '104', 500, v_hoy - 40, 11, v_f) returning id into v_bbva;

  -- BCP: entradas y salidas del mes; unas ya revisadas (con su responsable), una con el monto cambiado desde que se revisó.
  insert into movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por) values
   ('aporte',   v_hoy - 30, null, v_bcp, 2500,   '[PRUEBA-CUADRAR] Aporte inicial', v_f),
   ('retiro',   v_hoy - 24, v_bcp, null, 800,    '[PRUEBA-CUADRAR] Pago a proveedor', v_f),
   ('aporte',   v_hoy - 17, null, v_bcp, 1240.8, '[PRUEBA-CUADRAR] Depósito semana 1', v_f),
   ('retiro',   v_hoy - 12, v_bcp, null, 4600,   '[PRUEBA-CUADRAR] Alquiler tienda', v_f),
   ('aporte',   v_hoy - 9,  null, v_bcp, 3900,   '[PRUEBA-CUADRAR] Depósito semana 2', v_f),
   ('retiro',   v_hoy - 6,  v_bcp, null, 640,    '[PRUEBA-CUADRAR] Luz y agua', v_f),
   ('aporte',   v_hoy - 4,  null, v_bcp, 980.2,  '[PRUEBA-CUADRAR] Depósito del cajón', v_f),
   ('aporte',   v_hoy - 2,  null, v_bcp, 412.5,  '[PRUEBA-CUADRAR] Transferencia Yape', v_f),
   ('retiro',   v_hoy - 1,  v_bcp, null, 18,     '[PRUEBA-CUADRAR] Comisión mantenimiento', v_f),
   ('aporte',   v_hoy,      null, v_bcp, 1850,   '[PRUEBA-CUADRAR] Depósito de hoy', v_f);
  -- BBVA: todo revisado y con saldo anotado que cuadra.
  insert into movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por) values
   ('aporte', v_hoy - 5, null, v_bbva, 1500, '[PRUEBA-CUADRAR] Depósito LIM', v_f),
   ('retiro', v_hoy - 3, v_bbva, null, 300,  '[PRUEBA-CUADRAR] Pago luz', v_f);
  -- Interbank: movimientos sin revisar ni saldo nunca.
  insert into movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por) values
   ('aporte', v_hoy - 8, null, v_ibk, 2000, '[PRUEBA-CUADRAR] Abono QR', v_f),
   ('retiro', v_hoy - 2, v_ibk, null, 350,  '[PRUEBA-CUADRAR] Planilla taller', v_f);

  -- Revisadas del BCP: las 4 primeras tal cual; «Alquiler» con otro monto (cambió desde que se revisó).
  insert into dinero_revisados (cuenta_id, clave, monto, revisado_por)
    select v_bcp, 'mov:' || d.id::text, case when d.referencia like '%Alquiler%' then -4500 else (case when d.cuenta_destino_id = v_bcp then d.monto else -(d.monto + d.comision) end) end, v_f
      from movimientos_dinero d where d.referencia ~ '^\[PRUEBA-CUADRAR\] (Aporte inicial|Pago a proveedor|Depósito semana 1|Alquiler)';
  insert into dinero_revisados (cuenta_id, clave, monto, revisado_por)
    select v_bbva, 'mov:' || d.id::text, case when d.cuenta_destino_id = v_bbva then d.monto else -(d.monto + d.comision) end, v_f
      from movimientos_dinero d where d.referencia ~ '^\[PRUEBA-CUADRAR\] (Depósito LIM|Pago luz)';
  -- Conciliaciones: BBVA cuadra hoy (500 + 1500 − 300 = 1700); BCP tuvo una vieja con diferencia.
  insert into conciliaciones (cuenta_id, fecha, saldo_banco, registrado_por, estado) values (v_bbva, v_hoy, 1700, v_f, 'vigente');
  insert into conciliaciones (cuenta_id, fecha, saldo_banco, registrado_por, estado) values (v_bcp, v_hoy - 20, 3000, v_f, 'vigente');
end $$;
-- ==== QUITAR ====
-- delete from retail.conciliaciones where cuenta_id in (select id from retail.cuentas_dinero where nombre like '%(prueba)');
-- delete from retail.dinero_revisados where cuenta_id in (select id from retail.cuentas_dinero where nombre like '%(prueba)') or clave in (select 'mov:'||id::text from retail.movimientos_dinero where referencia like '[PRUEBA-CUADRAR]%');
-- delete from retail.movimientos_dinero where referencia like '[PRUEBA-CUADRAR]%';
-- delete from retail.cuentas_dinero where nombre like '%(prueba)';
