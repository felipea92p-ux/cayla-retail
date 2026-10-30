-- ============================================================================
-- pegar-en-produccion-tipo-de-ordenes-2-3-4-2026-10-30.sql — corregir a mano las tres órdenes que se abrieron como «Muestra» siendo lotes (ADR-0581)
-- SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI de migraciones). No depende de `20261030151000`: se puede pegar antes, después o sin ella.
--
-- EL PROBLEMA PRIMERO. El 2026-10-27 se abrieron OP-000002 (Short Cayla Sastre Recover, 16 prendas), OP-000003 (Blusa Hanna, 54) y OP-000004 (Blusa Claudia, 69) con «Crear un modelo nuevo»,
--   donde el formulario arranca en «Muestra». Son lotes de producción. Una muestra, al cerrarse, NO entra al stock (`cerrar_produccion`) y Análisis no cuenta sus prendas como «en camino».
--   OP-000002 ya aparece como «Lista para pasar al stock»: si se cierra así, 16 prendas terminan sin entrar a ningún estante. Hasta que exista el botón «Cambiar tipo» (ADR-0581),
--   ninguna función de la base cambia `es_muestra` después de abrir la orden: por eso este script.
--
-- QUÉ HACE. Todo o nada, en UNA sentencia atómica, sin ningún `drop`, sin tocar prendas, stock, costos ni tela:
--   1. Toma cada orden `for update` (si alguien la está cerrando en ese instante, espera o falla por el `lock_timeout`, nunca cierra a medias).
--   2. Por cada una de las tres: si no existe en esta base, la salta y lo dice; si ya es lote, la salta; si ya NO está en proceso (se cerró como muestra), se DETIENE y no toca ninguna
--      (una muestra cerrada no entró al stock: eso se resuelve con «Revertir el cierre», no con este script); si alguna talla o color no tiene precio a tienda, se DETIENE (un lote sin
--      precio no se puede vender; es la misma regla de la función nueva).
--   3. Antes de cambiar, deja la foto de la fila en `respaldo_purgas.filas` (purga «tipo-de-ordenes-2026-10-30», tabla `producciones`): de ahí sale el camino de vuelta.
--   4. Pone `es_muestra = false` y lo anota en la Actividad («corrigió el tipo de la OP-… de muestra a lote de producción»), sin responsable: lo hace un script, no una persona. En la
--      historia de cada orden NO queda un cambio (esa historia exige quién lo hizo; el botón nuevo sí lo escribe).
--
-- ENSAYO PRIMERO. Por defecto NO aplica: hace todo, cuenta, y termina con un error «ENSAYO_OK …» que deshace todo y dice qué órdenes cambiaría. Cuando sea lo esperado, cambia `false` por
--   `true` en la línea marcada APLICAR y vuelve a pegar. Ensayado el 2026-10-30 en una base privada con las migraciones de `main` (`pnpm pruebas:produccion-cambiar-tipo`, grupo D).
--
-- LO QUE CAMBIA PARA QUIEN USA EL ERP, al aplicar: las tres órdenes pasan de la pestaña «Muestras» a «En curso»; «Hoy en el Taller» no cambia (ya contaba las abiertas, muestras incluidas);
--   Análisis empieza a contar sus 139 prendas como «en camino» (hoy no las ve); y al cerrar cada una, entra al stock del Taller y la base pide lo que pide a todo lote: confirmar el costo si
--   sale fuera de banda (no declararon tela, así que hoy saldría en cero).
--
-- CAMINO DE VUELTA (si hiciera falta; solo vale mientras las tres sigan en proceso). Pega esto, tal cual:
--     update retail.producciones p
--        set es_muestra = (b.fila ->> 'es_muestra')::boolean
--       from respaldo_purgas.filas b
--      where b.purga = 'tipo-de-ordenes-2026-10-30' and b.tabla = 'producciones' and (b.fila ->> 'id')::uuid = p.id and p.estado = 'en_proceso';
--
-- PRODUCCIÓN. Sin políticas, sin `drop trigger`, sin tablas temporales; `lock_timeout = 3s`: si la orden está ocupada falla en vez de esperar (ADR-0195, ADR-0288).
-- VERIFICACIÓN (solo lectura, después):
--     select p.numero, pr.referencia, p.es_muestra, p.estado from retail.producciones p join retail.productos pr on pr.id = p.producto_id order by p.numero;
--   → OP 2, 3 y 4 con `es_muestra = false`; la 1 (Chaleco Cayla) como estaba.
-- ============================================================================

set lock_timeout = '3s';

do $f$
declare
  v_aplicar boolean := false; -- APLICAR: cambia false por true para aplicar de verdad
  -- Las tres órdenes, por su id (leídos de producción el 2026-10-30; el id no se repite en otra base).
  v_ids uuid[] := array['223317e9-bd0f-49f0-99a9-b176837d26bc', '622b035d-9514-4e52-9a64-8742a748c8aa', 'a95669c3-25c5-4d92-afcc-b1281495b9b5']::uuid[];
  v_id uuid;
  v_o record;
  v_sin_precio text;
  v_cambiadas integer := 0;
  v_ya_eran integer := 0;
  v_no_estan integer := 0;
  v_prendas integer := 0;
  v_lista text := '';
begin
  if to_regclass('respaldo_purgas.filas') is null then
    raise exception 'Falta el respaldo (respaldo_purgas.filas): no se toca nada sin la foto de antes';
  end if;
  foreach v_id in array v_ids loop
    select p.id, p.numero, p.estado, p.es_muestra, p.cantidad_plan, p.ubicacion_id, pr.referencia into v_o
      from retail.producciones p join retail.productos pr on pr.id = p.producto_id
     where p.id = v_id
       for update of p;
    if v_o.id is null then
      v_no_estan := v_no_estan + 1;
      continue;
    end if;
    if v_o.estado <> 'en_proceso' then
      raise exception 'La % de % ya no está en proceso (%): no se cambia su tipo con este script. Si se cerró como muestra, primero hay que revertir el cierre. No se tocó ninguna orden.',
        retail.fn_produccion_numero_texto(v_o.numero), v_o.referencia, v_o.estado;
    end if;
    if not v_o.es_muestra then
      v_ya_eran := v_ya_eran + 1;
      continue;
    end if;
    -- Un lote necesita el precio a tienda de cada talla y color (salvo el empaque): la misma regla de `cambiar_tipo_orden_produccion`.
    select string_agg(x.sku, ', ' order by x.sku) into v_sin_precio
      from (select v.sku
              from retail.produccion_lineas l
              join retail.variantes v on v.id = l.variante_id
              join retail.productos pr on pr.id = v.producto_id
             where l.produccion_id = v_id
               and coalesce(v.precio, 0) < 0.01
               and not retail.fn_categoria_admite_precio_cero(pr.categoria_id)
             order by v.sku
             limit 6) x;
    if v_sin_precio is not null then
      raise exception 'La % de % no puede pasar a lote: falta el precio a tienda en %. No se tocó ninguna orden.', retail.fn_produccion_numero_texto(v_o.numero), v_o.referencia, v_sin_precio;
    end if;
    insert into respaldo_purgas.filas (purga, tabla, fila)
      select 'tipo-de-ordenes-2026-10-30', 'producciones', to_jsonb(p) from retail.producciones p where p.id = v_id;
    update retail.producciones set es_muestra = false where id = v_id;
    perform retail.fn_actividad_anotar(
      'produccion', 'orden_produccion_tipo_cambiado',
      'corrigió el tipo de la ' || retail.fn_produccion_numero_texto(v_o.numero) || ' de ' || v_o.referencia || ': de muestra a lote de producción (se había abierto como muestra sin querer)',
      null, null, v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', v_id::text, now(),
      jsonb_build_object('produccion_id', v_id, 'numero', v_o.numero, 'es_muestra', false, 'script', 'tipo-de-ordenes-2026-10-30'),
      'vivo');
    v_cambiadas := v_cambiadas + 1;
    v_prendas := v_prendas + v_o.cantidad_plan;
    v_lista := v_lista || case when v_lista = '' then '' else ', ' end || retail.fn_produccion_numero_texto(v_o.numero) || ' ' || v_o.referencia || ' (' || v_o.cantidad_plan || ')';
  end loop;

  if not v_aplicar then
    raise exception 'ENSAYO_OK: % órdenes pasarían de muestra a lote (% prendas): %. Ya eran lote: %. No están en esta base: %. Nada cambió. Para aplicar: cambia false por true en la línea APLICAR.',
      v_cambiadas, v_prendas, coalesce(nullif(v_lista, ''), '(ninguna)'), v_ya_eran, v_no_estan;
  end if;
  raise notice 'Hecho: % órdenes pasaron de muestra a lote (% prendas): %. Ya eran lote: %. No están en esta base: %.', v_cambiadas, v_prendas, v_lista, v_ya_eran, v_no_estan;
end
$f$;

select p.numero, pr.referencia, p.es_muestra, p.estado
  from retail.producciones p join retail.productos pr on pr.id = p.producto_id
 where p.id in ('223317e9-bd0f-49f0-99a9-b176837d26bc', '622b035d-9514-4e52-9a64-8742a748c8aa', 'a95669c3-25c5-4d92-afcc-b1281495b9b5')
 order by p.numero;

reset lock_timeout;
