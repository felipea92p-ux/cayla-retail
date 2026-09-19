-- VERIFICAR-PRODUCCION-2026-09-18.sql — SOLO LECTURA. No modifica nada.
--
-- PARA QUÉ: la auditoría del 2026-09-17 no pudo consultar producción, así que todo lo que
-- dice sobre "qué migración corrió" es inferencia leída de documentos. Esta consulta lo
-- reemplaza por un hecho: pregunta al catálogo de Postgres (pg_proc, pg_class,
-- information_schema) si cada objeto existe HOY en producción.
--
-- CÓMO SE USA: pegar completa en el SQL Editor del proyecto de Dynamic (donde vive el
-- schema `retail`) y ejecutar. Devuelve una tabla: bloque / objeto / existe / veredicto.
-- Todo lo que diga algo distinto de "OK" es una decisión que tomar. Devolver la tabla
-- completa (copiar y pegar en el chat) para marcar qué migraciones faltan.
--
-- POR QUÉ NO SOLO "EXISTE LA FUNCIÓN": ADR-0004 costó un susto real porque un
-- `create or replace` con un parámetro nuevo NO reemplaza la función vieja: Postgres crea
-- una segunda con otra firma. Por eso donde importa se pregunta por un parámetro concreto
-- (proargnames) o se cuentan las firmas vivas, no solo el nombre.
--
-- SE ROMPE SI: alguien aplicó un cambio directo en el SQL Editor sin dejar migración. Esta
-- consulta lo vería (dice lo que hay, no lo que el repo cree que hay), pero no sabría
-- explicar POR QUÉ difiere. Nunca escribe: solo SELECT sobre el catálogo.

with
-- Ayudantes: cada fila es (bloque, objeto, existe_hoy, debería_existir, qué_significa_si_difiere)
r(bloque, objeto, existe, esperado, si_difiere) as (

  -- ── a) Traslados y Conteo: las 4 migraciones de Inventario del 15/16-sep ─────────────
  select 'a) Traslados/Conteo', 'fn iniciar_traslado  [20260916150000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='iniciar_traslado'),
         true, 'FALTA: "Mover mercadería" falla en las 3 tiendas'
  union all select 'a) Traslados/Conteo', 'fn confirmar_traslado  [20260916150000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='confirmar_traslado'),
         true, 'FALTA: no se puede confirmar un traslado en camino'
  union all select 'a) Traslados/Conteo', 'fn registrar_recepcion_traslado  [20260916150000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='registrar_recepcion_traslado'),
         true, 'FALTA: la tienda destino no puede recibir'
  union all select 'a) Traslados/Conteo', 'fn cerrar_traslado_con_diferencia  [20260916150000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='cerrar_traslado_con_diferencia'),
         true, 'FALTA: un traslado con faltante no se puede cerrar'
  union all select 'a) Traslados/Conteo', 'tabla transferencia_recepciones  [20260916150000]',
         to_regclass('retail.transferencia_recepciones') is not null,
         true, 'FALTA: no hay dónde guardar lo que la tienda destino recibió'
  union all select 'a) Traslados/Conteo', 'fn_movimientos con p_producto_id  [20260915204457]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='fn_movimientos'
                  and 'p_producto_id' = any(p.proargnames)),
         true, 'FALTA o VIEJA: el historial por producto falla'
  union all select 'a) Traslados/Conteo', 'abrir_conteo con p_alcance  [20260916110000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='abrir_conteo'
                  and 'p_alcance' = any(p.proargnames)),
         true, 'FALTA o VIEJA: Conteo no acepta alcance (todo/categoría)'
  union all select 'a) Traslados/Conteo', 'columna transferencias.numero  [20260916200000]',
         exists(select 1 from information_schema.columns
                where table_schema='retail' and table_name='transferencias' and column_name='numero'),
         true, 'FALTA: la pantalla de Traslados pide "numero" y falla con error crudo'
  union all select 'a) Traslados/Conteo', 'columna conteos.numero  [20260916200000]',
         exists(select 1 from information_schema.columns
                where table_schema='retail' and table_name='conteos' and column_name='numero'),
         true, 'FALTA: la pantalla de Conteo pide "numero" y falla con error crudo'
  union all select 'a) Traslados/Conteo', 'fn fn_conteos_resumen  [20260916200000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='fn_conteos_resumen'),
         true, 'FALTA: la lista de Conteos no carga'
  -- La función VIEJA no debe existir: 20260916150000 y 20260918080000 la dropean.
  union all select 'a) Traslados/Conteo', 'fn transferir (modelo atómico viejo)',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='transferir'),
         false, 'RESUCITADA: existe la función vieja, ejecutable, que salta el modelo en dos fases'
  union all select 'a) Traslados/Conteo', 'fn_movimientos: firmas vivas (debe ser 1)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='retail' and p.proname='fn_movimientos') > 1,
         false, 'SOBRECARGA FANTASMA: hay más de una firma; PostgREST responde "not unique"'

  -- Mismo patrón que ADR-0004: un `create or replace` con parámetros distintos NO reemplaza,
  -- deja las dos. Hallado en el rastreo de ADR-0104 (2 firmas, 10 y 12 parámetros, en local).
  union all select 'a) Traslados/Conteo', 'catalogo_actualizar_producto: firmas vivas (debe ser 1)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='retail' and p.proname='catalogo_actualizar_producto') > 1,
         false, 'SOBRECARGA FANTASMA: editar un producto puede fallar con "not unique"'

  -- ── b) anular_venta ──────────────────────────────────────────────────────────────────
  union all select 'b) anular_venta', 'fn anular_venta  [20260916172645]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='anular_venta'),
         true, 'FALTA: en producción NO existe forma de anular una venta'
  union all select 'b) anular_venta', 'tabla venta_anulacion_items  [20260916172645]',
         to_regclass('retail.venta_anulacion_items') is not null,
         true, 'FALTA: no hay dónde guardar la condición de cada prenda anulada'

  -- ── c) Grants: ¿pueden escribir directo, saltándose las RPC? ─────────────────────────
  -- `esperado = false`: lo sano es que NO puedan. Un "sí" es el hueco de la auditoría.
  union all
  select 'c) Grants de escritura directa',
         format('%s puede %s en %s', rol, priv, tabla),
         case when to_regclass('retail.'||tabla) is null then null
              else has_table_privilege(rol, ('retail.'||tabla)::regclass, priv) end,
         false,
         'ABIERTO: escribe directo, sin pasar por registrar_venta/aprobar_devolucion'
  from (values ('ventas'),('venta_items'),('devoluciones'),('devolucion_items')) t(tabla)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) p(priv)
  cross join (values ('authenticated')) ro(rol)
  union all
  select 'c) Grants de escritura directa',
         format('anon puede INSERT en %s', tabla),
         case when to_regclass('retail.'||tabla) is null then null
              else has_table_privilege('anon', ('retail.'||tabla)::regclass, 'INSERT') end,
         false, 'ABIERTO a visitantes sin sesión: gravísimo'
  from (values ('ventas'),('venta_items'),('devoluciones'),('devolucion_items')) t(tabla)
  union all
  select 'c) RLS encendido', format('RLS en retail.%s', tabla),
         (select c.relrowsecurity from pg_class c where c.oid = to_regclass('retail.'||tabla)),
         true, 'RLS APAGADO: las políticas no se aplican'
  from (values ('ventas'),('venta_items'),('devoluciones'),('devolucion_items')) t(tabla)

  -- ── e) Huella del resto de migraciones marcadas "solo local" ─────────────────────────
  union all select 'e) Otras migraciones', 'tabla codigos_descuento  [20260914215103]',
         to_regclass('retail.codigos_descuento') is not null, true,
         'FALTA: no se pueden crear códigos de descuento'
  union all select 'e) Otras migraciones', 'columna ventas.nota  [20260914220804]',
         exists(select 1 from information_schema.columns
                where table_schema='retail' and table_name='ventas' and column_name='nota'),
         true, 'FALTA: la nota de venta no se guarda'
  union all select 'e) Otras migraciones', 'tabla producciones  [20260915130000]',
         to_regclass('retail.producciones') is not null, true,
         'FALTA: Producción del Taller no existe'
  union all select 'e) Otras migraciones', 'tabla costo_historial  [20260916090000]',
         to_regclass('retail.costo_historial') is not null, true,
         'FALTA: no hay costo promedio ponderado'
  union all select 'e) Otras migraciones', 'índice variantes_identidad_unica  [20260916190000]',
         to_regclass('retail.variantes_identidad_unica') is not null, true,
         'FALTA: pueden convivir dos variantes iguales con talla escrita distinto'
  union all select 'e) Otras migraciones', 'fn registrar_consumo_insumo  [20260917141500]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='registrar_consumo_insumo'),
         true, 'FALTA: no se descuenta tela/avíos al cortar'
  union all select 'e) Otras migraciones', 'fn fn_resumen_variantes  [20260918080000]',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='retail' and p.proname='fn_resumen_variantes'),
         true, 'FALTA: /inventario/resumen no carga'
  union all select 'e) Otras migraciones', 'columna ubicaciones.meta_venta_diaria  [20260918100000]',
         exists(select 1 from information_schema.columns
                where table_schema='retail' and table_name='ubicaciones' and column_name='meta_venta_diaria'),
         true, 'FALTA: la meta diaria de Caja no tiene dónde vivir'
  -- Revocaciones: aquí lo sano es que authenticated NO pueda ejecutar.
  union all select 'e) Otras migraciones', 'authenticated ejecuta fn_aplicar_movimiento  [20260917193651]',
         (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='retail' and p.proname='fn_aplicar_movimiento' limit 1),
         false, 'ABIERTO: cualquiera logueado puede mover stock sin pasar por las reglas'
  union all select 'e) Otras migraciones', 'authenticated ejecuta fn_reservar_numero_serie  [20260917150001]',
         (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='retail' and p.proname='fn_reservar_numero_serie' limit 1),
         false, 'ABIERTO: cualquiera logueado puede quemar correlativos de comprobantes'
)
select bloque,
       objeto,
       case existe when true then 'SÍ' when false then 'NO' else '(la tabla no existe)' end as existe,
       case when existe is null then 'REVISAR: el objeto consultado no existe'
            when existe = esperado then 'OK'
            else si_difiere end as veredicto
from r

-- ── d) registrar_movimiento: una fila por firma viva ─────────────────────────────────────
-- Lo sano es UNA. Dos = el `create or replace` con parámetro nuevo dejó la vieja viva.
union all
select 'd) registrar_movimiento',
       'registrar_movimiento(' || pg_get_function_identity_arguments(p.oid) || ')',
       'SÍ',
       case when count(*) over () = 1 then 'OK: una sola firma'
            else 'SOBRECARGA: hay ' || count(*) over () || ' firmas vivas (' || p.pronargs || ' parámetros esta)' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname = 'registrar_movimiento'
union all
select 'd) registrar_movimiento', 'registrar_movimiento(...)', 'NO', 'FALTA: la función no existe'
where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'retail' and p.proname = 'registrar_movimiento')

order by 1, 2;
