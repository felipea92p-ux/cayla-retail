-- ============================================================================
-- 20261104032000 — Los motores del piso solo cuentan lo vendido en la tienda (ADR-0607, «Ventas online», actividad 8)
--
-- EL PROBLEMA PRIMERO. Una venta de TikTok sale de la sede donde está quien vende (Trujillo, por ejemplo) y descuenta el stock de esa sede,
-- pero no pasó por el piso: nadie la eligió de un colgador. Si el motor del piso la cuenta como rotación, «colgar otra igual» le pide al
-- Taller y a la encargada que repongan el piso por una demanda que el piso no tuvo. Es la misma lógica de las bolsas (ADR-0377) y de CLAURE
-- (ADR-0560): venta real para la caja, pero no demanda del piso.
--
-- LO QUE HACE. Tres lecturas del piso empiezan a mirar solo las ventas de la tienda física (`ventas.canal = 'tienda'`, que desde
-- 20261104004000 hereda el canal del apartado):
--   · `fn_piso_plan_lectura`          — el motor del piso (Hoy, Inicio de Almacén, la señal para el Taller): lo vendido por prenda.
--   · `fn_demanda_sede`               — la cifra única de demanda: lo vendido con prenda y lo vendido «sin registrar».
--   · `fn_motor_demanda_preparacion`  — «¿ya puede recomendar?»: las unidades de venta y el primer día con ventas de la sede.
--
-- LO QUE NO HACE (a propósito; está en el ADR-0607):
--   · No toca Análisis ni el plan de compra (`fn_analisis_sede`, `fn_plan_compra`, `fn_unidades_vendidas`, …): lo vendido online es demanda real de
--     CAYLA y debe verse y comprarse. La marca `ventas.canal` queda para separarlo por canal cuando Felipe lo pida.
--   · No toca Frescura (`fn_frescura_sede`): mide el stock que salió del piso por el libro de movimientos; una prenda del piso vendida online
--     salió igual, y dejarla fuera la marcaría como «no se mueve» siendo que se vendió.
--   · No toca caja, comprobantes, Ventas, Finanzas ni Resumen: son ventas reales.
--
-- CONTRATO
--   PROMETE: con un canal físico `tienda` (todo lo que existe hoy), los resultados son EXACTAMENTE los de antes. Una venta de otro canal no mueve
--            ninguna cifra de las tres funciones.
--   ASUME:   `ventas.canal` existe (20261104004000) y las tres funciones son las de producción del 2026-11-03 (huellas md5 abajo).
--   FALLA:   si falta la columna, o si una función cambió, ABORTA sin tocar nada y dice cuál.
--
-- PARA PRODUCCIÓN: una sola parte, DESPUÉS de 20261104004000 (partes 1 a 5). Solo reemplazos anclados: sin tablas, políticas ni `drop trigger`
-- (ADR-0195). Idempotente. Huellas md5 de producción (2026-11-03): fn_piso_plan_lectura 1cec249e…, fn_demanda_sede 16a7a1a0…,
-- fn_motor_demanda_preparacion 40dbb275….
-- SE ROMPE SI: una migración posterior reescribe una de las tres funciones copiando un archivo anterior: pierde el filtro y la venta de TikTok
-- vuelve a pedir reposición del piso. `pnpm pruebas:ventas-online-motores` lo vigila.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'ventas' and column_name = 'canal') then
    raise exception 'Falta retail.ventas.canal: pega primero 20261104004000_ventas_online_canal.sql (partes 1 a 5).';
  end if;
end
$g$;

-- Reemplazo anclado (el mismo de 20261010232000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. fn_piso_plan_lectura: lo vendido por prenda ----------
select pg_temp.reemplazar('retail.fn_piso_plan_lectura(uuid)',
$v$        and not v.es_prueba
        -- Una liquidación de prenda dañada$v$,
$n$        and not v.es_prueba
        and v.canal = 'tienda' -- ADR-0607: una venta online no pasó por el piso
        -- Una liquidación de prenda dañada$n$,
1);

-- ---------- 2. fn_demanda_sede: lo vendido con prenda y lo «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_demanda_sede(uuid, integer)',
$v$         and v.estado = 'completada'
         and not v.es_prueba
         and not exists (select 1 from retail.movimientos m$v$,
$n$         and v.estado = 'completada'
         and not v.es_prueba
         and v.canal = 'tienda' -- ADR-0607: una venta online no pasó por el piso
         and not exists (select 1 from retail.movimientos m$n$,
1);
select pg_temp.reemplazar('retail.fn_demanda_sede(uuid, integer)',
$v$         and v.estado = 'completada' and not v.es_prueba
         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
         and retail.fn_categoria_entra_a_motores(p.categoria_id)$v$,
$n$         and v.estado = 'completada' and not v.es_prueba and v.canal = 'tienda'
         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
         and retail.fn_categoria_entra_a_motores(p.categoria_id)$n$,
1);

-- ---------- 3. fn_motor_demanda_preparacion: «¿ya puede recomendar?» ----------
select pg_temp.reemplazar('retail.fn_motor_demanda_preparacion(uuid)',
$v$       and v.estado = 'completada'
       and not v.es_prueba
       and not exists (select 1 from retail.movimientos m$v$,
$n$       and v.estado = 'completada'
       and not v.es_prueba
       and v.canal = 'tienda' -- ADR-0607: una venta online no pasó por el piso
       and not exists (select 1 from retail.movimientos m$n$,
1);
select pg_temp.reemplazar('retail.fn_motor_demanda_preparacion(uuid)',
$v$where v.ubicacion_id = s.id and v.estado = 'completada' and not v.es_prueba),$v$,
$n$where v.ubicacion_id = s.id and v.estado = 'completada' and not v.es_prueba and v.canal = 'tienda'),$n$,
1);

-- ---------- 4. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('retail.fn_piso_plan_lectura(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'v.canal = ''tienda''', ''))) / length('v.canal = ''tienda''') <> 1 then
    raise exception 'fn_piso_plan_lectura debe filtrar por canal en 1 lugar';
  end if;
  v_def := pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'v.canal = ''tienda''', ''))) / length('v.canal = ''tienda''') <> 2 then
    raise exception 'fn_demanda_sede debe filtrar por canal en 2 lugares';
  end if;
  v_def := pg_get_functiondef('retail.fn_motor_demanda_preparacion(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'v.canal = ''tienda''', ''))) / length('v.canal = ''tienda''') <> 2 then
    raise exception 'fn_motor_demanda_preparacion debe filtrar por canal en 2 lugares';
  end if;
end
$v$;

reset lock_timeout;
notify pgrst, 'reload schema';
