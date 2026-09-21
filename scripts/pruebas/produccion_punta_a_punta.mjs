/**
 * Recorrido de punta a punta de PRODUCCIÓN a través del ERP — ADR-0133.
 * Una sola transacción (ROLLBACK al final: no deja rastro en el Postgres local compartido) que hace lo que hace la empresa, en orden, y comprueba en cada paso
 * qué otro módulo se enteró:
 *
 *   1  Proveedores y catálogo de insumos            (Producción propia)
 *   2  Comprobante a crédito de tela y avíos        → Por pagar de Producción, Deuda consolidada (Compras + Producción) e IGV del mes (Finanzas/SUNAT)
 *   3  Un colaborador del Taller recibe la tela      → lotes con el costo de la línea, saldo de Insumos; NO ve montos (candado D-G)
 *   4  Pago parcial con dos medios                   → el saldo baja; no se puede pasar del saldo
 *   5  Orden de producción: descuenta insumos        → costo REAL de tela y avíos de la orden (consumo − devolución)
 *   6  Cierre de la orden                            → Inventario: `movimientos` (motivo produccion, produccion_id) y `stock` del Taller; Catálogo: `variantes.costo` (D-45)
 *   7  «Llevarlas a las tiendas»                     → Traslados: `iniciar_traslado` saca del Taller; Movimientos lo registra
 *   8  Lo que ven los demás módulos                  → `fn_resumen_variantes` (Inventario/Resumen) ve el stock; el líder lee los costos solo por `fn_costos_*`
 *   9  Las protecciones                              → no se anula un comprobante con pagos ni con mercadería recibida
 *
 * Cada `\\echo` es una línea del informe; cada `do $$ … assert` corta el recorrido si algo no es lo que debe. Sale con código ≠ 0 si algo falla.
 *
 * USO
 *   pnpm pruebas:produccion-punta-a-punta   → necesita el stack local (`npx supabase start`) con las migraciones aplicadas
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — la pasamos al Taller solo dentro de la transacción

const GUION = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
-- psql no interpola variables dentro de $$…$$: las comprobaciones son funciones temporales que reciben los valores como argumentos.
create function pg_temp.exigir(c boolean, m text) returns void language plpgsql as $f$ begin if c is not true then raise exception 'FALLO: %', m; end if; end $f$;
create function pg_temp.costo_de_lotes_denegado() returns void language plpgsql as $f$ begin
  begin perform costo_unitario from retail.insumo_lotes limit 1; raise exception 'FALLO: el colaborador pudo leer el costo de un lote';
  exception when insufficient_privilege then null; end;
end $f$;
create function pg_temp.protecciones(p_cid uuid) returns void language plpgsql as $f$ declare v_msg text; begin
  begin perform retail.anular_comprobante_produccion(p_cid, 'intento'); raise exception 'FALLO: se pudo anular un comprobante con pagos';
  exception when others then get stacked diagnostics v_msg = message_text; if v_msg like 'FALLO%' then raise; end if; raise notice '   anular con pagos → rechazado: %', v_msg; end;
  begin perform retail.registrar_pago_comprobante_produccion(p_cid, '[{"metodo":"efectivo","monto":99999}]'::jsonb); raise exception 'FALLO: se pagó más que el saldo';
  exception when others then get stacked diagnostics v_msg = message_text; if v_msg like 'FALLO%' then raise; end if; raise notice '   pagar más del saldo → rechazado: %', v_msg; end;
end $f$;

-- ---- Escenario: un modelo del catálogo con varias variantes, el Taller y una tienda ----
select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select producto_id as prod from retail.variantes group by producto_id having count(*) >= 2 order by count(*) desc limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'prod' order by sku limit 1 \\gset
select id as v2 from retail.variantes where producto_id = :'prod' order by sku offset 1 limit 1 \\gset
select referencia as modelo from retail.productos where id = :'prod' \\gset
\\echo '== Modelo del catálogo:' :modelo

-- 1 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '1. PROVEEDORES E INSUMOS (Producción tiene su propio directorio, aparte del de Compras)'
select retail.guardar_proveedor_produccion(null, 'Textiles Andinos SAC', 'tela', '20555666777', p_plazo_credito_dias => 30) as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, stock_minimo) values ('E2E-LINO', 'Lino lavado E2E', 'tela', 'metro', 50) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('E2E-BOTON', 'Botón E2E', 'avio', 'unidad') returning id as boton \\gset
\\echo '   proveedor de Producción creado, con 30 días de crédito; insumos: lino (m) y botón (unid.)'

-- 2 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '2. COMPROBANTE A CRÉDITO → Por pagar, Deuda consolidada e IGV'
select igv_neto as igv_antes from retail.fn_igv_credito_fiscal() \\gset
select coalesce(sum(saldo), 0) as deuda_antes from retail.fn_deuda_consolidada() \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '9001', 'credito',
  jsonb_build_array(
    jsonb_build_object('insumo_id', :'lino', 'cantidad', 200, 'costo_unitario', 20),
    jsonb_build_object('insumo_id', :'boton', 'cantidad', 300, 'costo_unitario', 0.5),
    jsonb_build_object('descripcion', 'Flete', 'cantidad', 1, 'costo_unitario', 100)),
  p_fecha_vencimiento => current_date + 30) as cid \\gset
select subtotal, igv, total, saldo, estado_pago from retail.fn_comprobantes_produccion() where id = :'cid' \\gset
\\echo '   subtotal' :subtotal '· IGV' :igv '· total' :total '· saldo por pagar' :saldo '(' :estado_pago ')'
select (sum(saldo) - :deuda_antes) as delta_deuda from retail.fn_deuda_consolidada() \\gset
select (igv_neto - :igv_antes) as delta_igv from retail.fn_igv_credito_fiscal() \\gset
\\echo '   → la Deuda consolidada de CAYLA subió' :delta_deuda 'y el IGV a favor del mes subió' :delta_igv
select pg_temp.exigir(:delta_deuda = :total, 'la deuda consolidada debe subir en el total del comprobante') as _ok \\gset
select pg_temp.exigir(:delta_igv = :igv, 'el IGV del mes debe subir en el IGV del comprobante') as _ok \\gset

-- 3 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '3. UN COLABORADOR DEL TALLER RECIBE LA TELA (sin ver montos)'
update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
select id as it_lino from retail.comprobantes_produccion_items where comprobante_id = :'cid' and insumo_id = :'lino' \\gset
select id as it_boton from retail.comprobantes_produccion_items where comprobante_id = :'cid' and insumo_id = :'boton' \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select retail.recibir_comprobante_produccion(:'cid', :'taller', jsonb_build_array(
  jsonb_build_object('item_id', :'it_lino', 'cantidad', 150), jsonb_build_object('item_id', :'it_boton', 'cantidad', 300))) as rec \\gset
select pendiente as lino_pendiente from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid') where item_id = :'it_lino' \\gset
\\echo '   recibió 150 m de lino y 300 botones; del lino aún faltan' :lino_pendiente 'm por llegar'
set local request.jwt.claim.sub = '${FELIPE}';
select l.cantidad_ingresada as lote_m, c.costo_unitario as lote_costo from retail.fn_costos_insumos_taller(:'taller') c join retail.insumo_lotes l on l.id = c.lote_id where l.insumo_id = :'lino' \\gset
\\echo '   → se abrió un lote de lino de' :lote_m 'm al costo de la línea: S/' :lote_costo 'por metro (sin IGV)'
select pg_temp.exigir(:lote_m = 150 and :lote_costo = 20, 'el lote debe traer la cantidad recibida y el costo de la línea') as _ok \\gset
-- El colaborador NO puede leer el costo por ninguna vía directa.
set local request.jwt.claim.sub = '${MICAELA}';
set local role authenticated;
select pg_temp.costo_de_lotes_denegado() as _ok \\gset
\\echo '   → el colaborador del Taller NO puede leer el costo de los lotes (permission denied): el candado está en la base'
reset role;
set local request.jwt.claim.sub = '${FELIPE}';

-- 4 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '4. PAGO PARCIAL CON DOS MEDIOS'
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":2000,"referencia":"OP-7788"},{"metodo":"yape","monto":500}]'::jsonb) as _pago \\gset
select saldo as saldo_tras_pago, estado_pago as estado_tras_pago from retail.fn_comprobantes_produccion() where id = :'cid' \\gset
\\echo '   pagó 2500 (transferencia + Yape) → saldo' :saldo_tras_pago '(' :estado_tras_pago ')'
select pg_temp.exigir(:saldo_tras_pago = :total - 2500, 'el saldo debe bajar lo pagado') as _ok \\gset

-- 5 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '5. ORDEN DE PRODUCCIÓN: DESCUENTA INSUMOS Y FIJA SU COSTO REAL'
select retail.abrir_produccion(:'taller', :'prod', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 6), jsonb_build_object('variante_id', :'v2', 'cantidad', 4)), p_costo_maquila => 100) as ord \\gset
select retail.registrar_consumo_insumo(:'ord', :'lino', 25) as _c1 \\gset
select retail.registrar_consumo_insumo(:'ord', :'boton', 60) as _c2 \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'lino', 5) as _d1 \\gset
select costo_tela as ct, costo_avios as ca, costo_unitario as cu from retail.fn_costos_producciones(:'taller') where produccion_id = :'ord' \\gset
\\echo '   descontó 25 m de lino (devolvió 5) y 60 botones → tela S/' :ct '· avíos S/' :ca '· costo por prenda S/' :cu '(10 prendas planeadas)'
select pg_temp.exigir(:ct = 400 and :ca = 30, 'costo real = lo consumido menos lo devuelto, a costo de lote') as _ok \\gset

-- 6 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '6. CIERRE → INVENTARIO Y CATÁLOGO'
select coalesce(sum(cantidad), 0) as stock_taller_antes from retail.stock where ubicacion_id = :'taller' and variante_id in (:'v1', :'v2') \\gset
select costo as costo_previo, (select coalesce(sum(cantidad),0) from retail.stock where variante_id = :'v1') as stock_v1_previo from retail.variantes where id = :'v1' \\gset
select retail.cerrar_produccion(:'ord', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 6), jsonb_build_object('variante_id', :'v2', 'cantidad', 3)), null, null, null) as _cierre \\gset
select coalesce(sum(cantidad), 0) as stock_taller_despues from retail.stock where ubicacion_id = :'taller' and variante_id in (:'v1', :'v2') \\gset
select count(*) as movs, coalesce(sum(cantidad), 0) as unidades from retail.movimientos where produccion_id = :'ord' and motivo = 'produccion' and tipo = 'entrada' \\gset
select costo as costo_variante from retail.variantes where id = :'v1' \\gset
select costo_unitario as cu_final from retail.fn_costos_producciones(:'taller') where produccion_id = :'ord' \\gset
\\echo '   9 prendas buenas de 10 → el stock del Taller pasó de' :stock_taller_antes 'a' :stock_taller_despues
\\echo '   → Inventario: ' :movs 'movimientos de entrada (motivo produccion, ligados a la orden) por' :unidades 'unidades'
\\echo '   → Catálogo: la corrida costó S/' :cu_final 'por prenda; el costo de la variante pasó de S/' :costo_previo 'a S/' :costo_variante '(promedio ponderado con lo que ya había en stock: D-31/D-45)'
select pg_temp.exigir(:stock_taller_despues - :stock_taller_antes = 9, 'el stock del Taller sube en las prendas buenas') as _ok \\gset
select pg_temp.exigir(:unidades = 9 and :movs = 2, 'un movimiento por variante, ligado a la orden') as _ok \\gset
select pg_temp.exigir(:costo_variante <> :costo_previo and :costo_variante between least(:costo_previo, :cu_final) and greatest(:costo_previo, :cu_final), 'el costo de la variante es el promedio ponderado entre lo que había y la corrida') as _ok \\gset

-- 7 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '7. «LLEVARLAS A LAS TIENDAS» → TRASLADOS'
select retail.iniciar_traslado(:'taller', :'tienda', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 6), jsonb_build_object('variante_id', :'v2', 'cantidad', 3)), now() + interval '2 days', 'E2E: primera tanda del Taller') as tras \\gset
select coalesce(sum(cantidad), 0) as stock_taller_final from retail.stock where ubicacion_id = :'taller' and variante_id in (:'v1', :'v2') \\gset
select count(*) as movs_traslado from retail.movimientos where transferencia_item_id in (select id from retail.transferencia_items where transferencia_id = :'tras') \\gset
\\echo '   traslado iniciado: el stock del Taller quedó en' :stock_taller_final '(salió lo trasladado) y Movimientos registró' :movs_traslado 'líneas del traslado'
select pg_temp.exigir(:stock_taller_final = :stock_taller_despues - 9, 'el traslado saca del Taller lo enviado') as _ok \\gset

-- 8 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '8. LO QUE VEN LOS DEMÁS MÓDULOS'
select count(*) as filas_resumen from retail.fn_resumen_variantes(:'taller') where variante_id in (:'v1', :'v2') \\gset
\\echo '   Análisis de Inventario (fn_resumen_variantes) devuelve' :filas_resumen 'filas de este modelo en el Taller: es la misma función que usa la sugerencia de «Nueva orden»'
select count(*) as lotes_costos from retail.fn_costos_insumos_taller(:'taller') \\gset
\\echo '   el líder lee costos por fn_costos_* (' :lotes_costos 'lotes con costo); nadie más los lee'

-- 9 ────────────────────────────────────────────────────────────────────────────
\\echo ''
\\echo '9. PROTECCIONES'
select pg_temp.protecciones(:'cid') as _ok \\gset

\\echo ''
\\echo 'RECORRIDO COMPLETO: todos los pasos cumplieron lo esperado.'
rollback;
`;

try {
  const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: GUION, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  console.log(salida);
} catch (e) {
  console.log(`${e.stdout ?? ""}`);
  console.error(`✗ El recorrido se cortó:\n${e.stderr ?? e.message}`);
  process.exit(1);
}
