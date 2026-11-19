-- ============================================================================
-- 20261118235000 — La huella de la tienda web conoce las ofertas por talla y color (ADR-0682; Felipe 2026-11-18)
--
-- EL PROBLEMA. Desde 20261118232000 una oferta puede elegir tallas y colores sueltos (`campana_regla_variantes`), y la regla que la tienda
--   web usa para el precio (`fn_campanas_en_sede`, `fn_regla_alcanza_variante`, `fn_variantes_de_regla`) los lee con tres funciones nuevas.
--   `tienda_catalogo_version()` rearma el catálogo de la tienda cuando cambia una de las tablas o de las funciones de su lista, y ni la
--   tabla ni las tres estaban: marcar o quitar una talla de una oferta cambiaría el precio en la caja al instante y en la web recién al
--   tope de 10 minutos (medido el 2026-11-18: `pruebas:tienda-catalogo-version`, «cobertura», 20 de 22).
--
-- LO QUE HACE. La misma función de 20261116180000, con la tabla en el punto 4 y las tres funciones en el punto 5. Nada más cambia.
--   La tienda cobra con las mismas funciones que la caja (`fn_campanas_en_sede` para un «% menos», `fn_ofertas_de_grupo` para un 3x2):
--   no hay una regla aparte que poner al día.
-- CÓMO SE VIGILA. `pruebas:tienda-catalogo-version`, «cobertura»: lee las listas de la ÚLTIMA migración que define la huella (esta). Y
--   `pruebas:ofertas-por-variante`, «La tienda web»: la huella cambia al quitar una talla, y el precio de la web es el de la caja.
-- CÓMO SE PEGA. Una sola parte, idempotente (`create or replace`). Va DESPUÉS de 20261118232000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.tienda_catalogo_version()') is null or to_regclass('retail.campana_regla_variantes') is null
     or to_regprocedure('retail.fn_variantes_sueltas_de_regla(uuid)') is null then
    raise exception 'Faltan piezas (la huella de 20261116180000 o las ofertas por variante de 20261118232000): pega antes esas migraciones. No se aplicó nada.';
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
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_regla_productos t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_regla_cesiones t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_regla_insignias t)::text,
    (select coalesce(sum(hash_record_extended(t, 0)), 0) from retail.campana_regla_variantes t)::text,
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
          'fn_regla_alcanza_variante', 'fn_oferta_alcanza_variante', 'fn_oferta_alcanza_variante_con_insignias', 'fn_insignia_viva',
          'fn_variantes_de_regla', 'fn_variantes_de_oferta_con_insignias',
          'fn_regla_con_variantes', 'fn_regla_solo_variantes', 'fn_variantes_sueltas_de_regla',
          'fn_existencias_base', 'fn_productos_por_etapa', 'fn_producto_etapa', 'fn_vitrina_publicable', 'fn_vitrina_por_que_no',
          'fn_empresas_de_sede', 'fn_categoria_entra_a_motores', 'fn_categoria_admite_precio_cero', 'fn_es_llegada',
          'fn_sede_web_falta', 'fn_hoy_lima', 'fn_catalogo_version']::name[]))
  ));
$$;

comment on function retail.tienda_catalogo_version() is
  'Tienda online (cambiar-de-modulo#11, 20261113202000): la huella (md5) de lo que muestran tienda_catalogo, tienda_filtros y tienda_probador. Cambia con el día de Lima, el contador del catálogo y los precios (fn_catalogo_version), cada movimiento nuevo (el stock es su snapshot), las tablas chicas que esas lecturas leen y las funciones que las arman. La tienda la pide junto con la lectura cara, en la misma consulta, y no vuelve a pedir esa lectura mientras la huella no cambie. Solo lee. Única excepción, a propósito: la salida de la ventana de 30 días de «Más vendidos» (la tienda rearma igual cada 10 min).';

revoke all on function retail.tienda_catalogo_version() from public, anon, authenticated;
grant execute on function retail.tienda_catalogo_version() to tienda_web;
