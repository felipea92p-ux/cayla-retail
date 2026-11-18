-- Tienda web: la huella de lo que muestra el catálogo, para no rearmarlo si nada cambió (cambiar-de-modulo#11, Felipe 2026-11-13).
--
-- EL PROBLEMA PRIMERO. La tienda guarda `tienda_catalogo` 30 s por sede y, al vencer, la vuelve a pedir aunque nada haya cambiado. Medido
-- en producción el 2026-11-13 (pg_stat_statements): es lo que más tiempo total le cuesta a la base que comparten el ERP y la tienda
-- (~470 ms por llamada; `tienda_probador` ~728 ms y `tienda_filtros` ~317 ms), y el plan de cómputo es CPU compartida: cada rearmado
-- innecesario le quita CPU a la caja, justo en horario de tienda. De noche, con las tiendas cerradas y el stock quieto, la tienda sigue
-- rearmando lo mismo cada medio minuto.
--
-- ANALOGÍA CAYLA. Es como reimprimir todas las etiquetas de la vitrina cada media hora por si acaso. Lo sensato es mirar primero el
-- cuaderno de movimientos y la lista de precios: si nadie anotó nada, las etiquetas siguen valiendo.
--
-- LA SALIDA. `retail.tienda_catalogo_version()` devuelve un texto corto (md5) que cambia cuando cambia algo que `tienda_catalogo`,
-- `tienda_filtros` o `tienda_probador` muestran. La tienda la pregunta (~1-2 ms en local) y solo vuelve a pedir la lectura cara si cambió
-- (apps/tienda/lib/compartido-servidor.ts, `lecturaPorHuella`). Junta:
--   1. El día de Lima (`fn_hoy_lima`): las campañas, las ofertas, las insignias y «Lo nuevo» empiezan y terminan por FECHA, no a una hora;
--      una campaña que empieza mañana no escribe nada, y el cambio de día cambia la huella.
--   2. `fn_catalogo_version()` (20260923184300 y 20261010100500): el contador que ya sube, con un disparador por sentencia, con todo cambio
--      de productos, variantes, fotos, tallas, colores, categorías, marcas, temporadas y precios por sede.
--   3. Cuántos movimientos hay desde ayer (Lima). El stock es un snapshot de `movimientos` (principio 4; lo vigila INV-01): toda venta,
--      cambio, devolución, traslado, recepción, ajuste y apartado agrega uno, y `movimientos` no se edita ni se borra
--      (`movimientos_inmutables`). Contar los de desde ayer basta: un movimiento nuevo siempre lleva el `now()` de su transacción.
--   4. Una suma de hashes de cada tabla chica que esas funciones leen y el contador no cubre (la Vitrina, los recortes del probador, las
--      familias, las empresas y sus sedes, las campañas con sus reglas y sus sedes, las insignias, las órdenes del Taller, las
--      sububicaciones, las sedes y sus datos web, la configuración de la tienda). Fila entera (si mañana se lee otra columna, ya está),
--      salvo `producciones`, de la que solo cuentan `producto_id` y `estado`: el Taller la actualiza con cada avance.
--   5. La firma de las funciones que arman esas lecturas (`pg_proc.xmin`): una migración que cambia la regla del precio rearma todo.
--
-- CÓMO SE USA SIN QUEDARSE CON ALGO VIEJO (apps/tienda). La lectura cara se pide JUNTO con su huella, en la MISMA consulta
-- (`select tienda_catalogo_version(), tienda_catalogo($1)`): las dos funciones son STABLE, así que ven la misma foto de la base. La copia
-- se guarda bajo esa huella, y se sirve solo mientras la huella de ahora sea la misma. Si algo cambia entre que se pregunta la huella y se
-- arma la lectura, la copia no se guarda con la huella vieja. Con una suma de hashes una huella puede volver a un valor anterior (se vende
-- y se devuelve la misma prenda), pero entonces lo que la base muestra también volvió: la copia guardada con esa huella sigue siendo exacta.
--
-- MEDIDO (2026-11-13, scripts/rendimiento/huella-tienda-por-hora.sql sobre el volumen sintético de ADR-0194 con un día al azar de 3
-- tiendas a ~60 ventas cada una): la huella cambia como mucho 33 veces en la hora punta de un día normal (32 tramos de 30 s distintos),
-- 55 un sábado al doble, y 0 entre las 21:00 y las 9:00. Hoy el catálogo se rearma hasta 120 veces por hora y sede, haya cambios o no.
--
-- DECIDÍ: una huella que se compara, no una copia que se guarda: respeta el DESCARTÉ de 20261031161000 (nada de guardar el catálogo armado
--   en una tabla). Sin tablas nuevas ni disparadores: la huella solo LEE, así que una venta del ERP no paga nada por ella.
-- DESCARTÉ: (a) un contador con disparador en `stock`: cada venta actualizaría la misma fila; las cajas se esperarían entre ellas y dos ventas
--   podrían bloquearse mutuamente (el contador de una contra la talla de la otra). (b) `max(stock.updated_at)`: nadie la mantiene en cada
--   UPDATE, y aunque lo hiciera, una transacción que empezó antes y confirma después no movería el máximo. (c) La suma de hashes de `stock`:
--   exacta, pero recorre todas sus filas en cada pregunta; los movimientos de desde ayer son unos cientos. (d) Seguir la salida de la ventana
--   de 30 días de «Más vendidos» (cada venta que cumple 30 días): duplica los cambios en horario de tienda, que es justo cuando ya hay otros.
--   Su puesto puede quedar hasta 10 min atrás (el tope de la tienda, `SEGUNDOS_SIN_CAMBIOS`) solo en la hora en que no se mueve nada más.
-- SE ROMPE SI: alguien cambia `stock` sin escribir su movimiento (lo marca INV-01; la tienda lo vería a los 10 min, el tope); o una de esas
--   funciones empieza a leer una tabla que la huella no mira: la prueba `pnpm pruebas:tienda-catalogo-version` recorre las funciones y falla.
--
-- QUÉ NO CAMBIA. `tienda_catalogo`, `tienda_filtros` y `tienda_probador` no se tocan: la tienda muestra lo mismo. «Separar» sigue mirando
-- precio y stock en la base al momento.
--
-- CÓMO SE PEGA (producción: Felipe, ninguna sesión). UNA sola parte, re-ejecutable: create or replace function, comment, revoke y grant. Sin
-- alter ni políticas (no toma las tablas de auth/storage). Va en cualquier orden respecto de la tienda: la tienda nueva, sin la función,
-- rearma cada 30 s como hoy.
-- VERIFICACIÓN: `select retail.tienda_catalogo_version();` devuelve 32 letras, dos veces seguidas la misma, y `explain analyze` < 20 ms.
-- CAMINO DE VUELTA: `drop function retail.tienda_catalogo_version();` (la tienda vuelve sola a rearmar cada 30 s).

set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_catalogo_version()') is null
     or to_regprocedure('retail.fn_hoy_lima()') is null
     or to_regprocedure('retail.tienda_catalogo(uuid)') is null
     or to_regprocedure('retail.tienda_filtros(uuid)') is null
     or to_regprocedure('retail.tienda_probador(uuid)') is null then
    raise exception 'Faltan piezas (fn_catalogo_version, fn_hoy_lima o las lecturas de la tienda): pega antes las migraciones de la tienda de main.';
  end if;
end
$$;

create or replace function retail.tienda_catalogo_version()
returns text
language sql
stable
security definer
set search_path = retail, public
as $$
  select md5(concat_ws('|',
    'v1',
    -- 1. El día de Lima: campañas, ofertas, insignias y «Lo nuevo» cambian por fecha, sin escribir nada.
    retail.fn_hoy_lima()::text,
    -- 2. Catálogo y precios por sede (el contador de 20260923184300, con su disparador por sentencia).
    retail.fn_catalogo_version()::text,
    -- 3. El stock: todo cambio de stock agrega un movimiento (principio 4, INV-01), y un movimiento nuevo lleva el now() de su
    --    transacción. Los de desde ayer (Lima) bastan, y son pocos.
    (select count(*) from retail.movimientos m
      where m.created_at >= ((retail.fn_hoy_lima() - 1)::timestamp at time zone 'America/Lima'))::text,
    -- 4. Las tablas chicas que la tienda lee y el contador no cubre: suma de un hash de 64 bits por fila (exacta en numeric).
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.vitrina_productos t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.vitrina_largos_tipicos t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.foto_recortes t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.familias t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.empresas t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.empresa_sedes t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.etiquetas t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.variante_etiquetas t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.etiqueta_categorias t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_reglas t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_regla_categorias t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_regla_sedes t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_sedes t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.sububicaciones t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.ubicaciones t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.ubicacion_datos_web t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.configuracion_tienda_web t)::text,
    --    De las órdenes del Taller solo cuentan la prenda y el estado (fn_productos_por_etapa): el resto cambia con cada avance.
    (select coalesce(sum(hash_record_extended(row(t.id, t.producto_id, t.estado), 0)), 0) from retail.producciones t)::text,
    -- 5. Las funciones que arman las lecturas: una migración que cambia una regla (el precio, «hay») rearma todo. La lista es la de
    --    las funciones que esas lecturas llaman; la prueba la recorre y falla si falta una.
    (select coalesce(sum(p.xmin::text::bigint), 0) || ':' || count(*)
       from pg_catalog.pg_proc p
      where p.pronamespace = 'retail'::regnamespace
        and p.proname = any (array[
          'tienda_catalogo', 'tienda_filtros', 'tienda_probador', 'tienda_sedes', 'tienda_catalogo_version',
          'fn_tienda_sedes_web', 'fn_tienda_umbral', 'fn_tienda_sede_elegida', 'fn_tienda_nivel', 'fn_tienda_disponible',
          'fn_tienda_precios', 'fn_tienda_precio_talla', 'fn_tienda_lo_nuevo', 'fn_tienda_mas_vendidos', 'fn_tienda_insignias_de',
          'fn_precios_en_sedes', 'fn_campanas_en_sede', 'fn_campana_rige_en_sede', 'fn_regla_rige_en', 'fn_descuento_campana',
          'fn_existencias_base', 'fn_productos_por_etapa', 'fn_producto_etapa', 'fn_vitrina_publicable', 'fn_vitrina_por_que_no',
          'fn_empresas_de_sede', 'fn_categoria_entra_a_motores', 'fn_categoria_admite_precio_cero', 'fn_es_llegada',
          'fn_sede_web_falta', 'fn_hoy_lima', 'fn_catalogo_version']::name[]))
  ));
$$;

comment on function retail.tienda_catalogo_version() is
  'Tienda online (cambiar-de-modulo#11, 20261113202000): la huella (md5) de lo que muestran tienda_catalogo, tienda_filtros y tienda_probador. Cambia con el día de Lima, el contador del catálogo y los precios (fn_catalogo_version), cada movimiento nuevo (el stock es su snapshot), las tablas chicas que esas lecturas leen y las funciones que las arman. La tienda la pide junto con la lectura cara, en la misma consulta, y no vuelve a pedir esa lectura mientras la huella no cambie. Solo lee. Única excepción, a propósito: la salida de la ventana de 30 días de «Más vendidos» (la tienda rearma igual cada 10 min).';

revoke all on function retail.tienda_catalogo_version() from public, anon, authenticated;
grant execute on function retail.tienda_catalogo_version() to tienda_web;
