-- ============================================================================
-- 20261107193000_recibir_dice_la_marca.sql — CAYLA V2 · Recibir mercadería (Felipe 2026-11-07)
-- La lista «Envíos por recibir en esta sede» dice, bajo el proveedor, la MARCA que trae cada envío y cada orden sin guía.
--
-- EL PROBLEMA PRIMERO. Quien recibe tiene el paquete en la mano y la etiqueta dice la marca, no la razón social: «Textil Anqori SAC» o
-- «Marisol Sonia Bellido Ccaccya» no le dicen qué prenda viene. La marca de lo que se compró vive en cada línea (`despacho_items.marca_id`,
-- `orden_compra_items.marca_id`), y esas tablas no tienen política: solo se leen por estas funciones `security definer`.
--
-- QUÉ CAMBIA (solo lectura, solo agrega un campo)
--   1. `fn_envios_por_recibir`: cada envío trae `marcas` (los nombres distintos de las marcas de SUS líneas, en orden alfabético; `[]` si no
--      tiene líneas, como uno que llegó sin aviso).
--   2. `fn_ordenes_directas_por_recibir`: cada orden sin guía trae `marcas` (las de las líneas de la orden).
--
-- LO QUE NO CAMBIA
--   · Ningún otro campo, el permiso del módulo, la regla de la sede (`fn_recepcion_puede_leer_sede`) ni el orden de las filas.
--   · `lineas` y `unidades`: la marca se une con `left join` por su llave (una línea, una marca), así que no duplica filas.
--   · `fn_envios_por_abrir` (la lectura de la fase 3, de respaldo): sin `marcas`, la web no dibuja la línea de la marca.
--
-- DESCARTÉ
--   · Leer las marcas del proveedor (`marca_proveedores`) desde la web, sin migración: un proveedor con tres marcas las mostraría todas,
--     aunque el envío traiga solo una. Lo que se pidió es la marca QUE TRAEN, y eso es la línea.
--   · Reescribir las dos funciones enteras: ya llevan parches anclados de otras migraciones (20261103172000) y reescribirlas a mano podría
--     perder uno. Se reemplaza solo el trozo, con la misma guardia de 20261103172000.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte: solo funciones, sin tablas, políticas ni disparadores (ADR-0195), con
-- `lock_timeout`. Idempotente: un reemplazo ya hecho se salta. Se detiene sin tocar nada si una función viva no es la esperada. Sin
-- `select … into` dentro de textos (ADR-0288). Orden con la web: da igual (la web lee `marcas` si viene y calla si no). El bloque final
-- comprueba que quedó todo. Vuelta atrás: volver a pegar la definición de cada función que da `pg_get_functiondef` ANTES de pegar esto.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar_dice_la_marca(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 aparición de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Los envíos: la marca de cada línea del envío ----------
select pg_temp.reemplazar_dice_la_marca(
  'retail.fn_envios_por_recibir(uuid)',
  $v$join retail.proveedores pr on pr.id = o.proveedor_id$v$,
  $n$join retail.proveedores pr on pr.id = o.proveedor_id
         left join retail.marcas m on m.id = di.marca_id$n$);
select pg_temp.reemplazar_dice_la_marca(
  'retail.fn_envios_por_recibir(uuid)',
  $v$array_agg(distinct pr.nombre) as proveedores,$v$,
  $n$array_agg(distinct pr.nombre) as proveedores,
              array_agg(distinct m.nombre) filter (where m.nombre is not null) as marcas,$n$);
select pg_temp.reemplazar_dice_la_marca(
  'retail.fn_envios_por_recibir(uuid)',
  $v$'proveedores', to_jsonb(t.proveedores),$v$,
  $n$'proveedores', to_jsonb(t.proveedores),
             'marcas', to_jsonb(coalesce(t.marcas, '{}'::text[])),$n$);

-- ---------- 2. Las órdenes sin guía: la marca de cada línea de la orden ----------
select pg_temp.reemplazar_dice_la_marca(
  'retail.fn_ordenes_directas_por_recibir(uuid)',
  $v$join retail.orden_compra_items i on i.orden_compra_id = o.id$v$,
  $n$join retail.orden_compra_items i on i.orden_compra_id = o.id
          left join retail.marcas m on m.id = i.marca_id$n$);
select pg_temp.reemplazar_dice_la_marca(
  'retail.fn_ordenes_directas_por_recibir(uuid)',
  $v$pr.id as proveedor_id, pr.nombre as proveedor,$v$,
  $n$pr.id as proveedor_id, pr.nombre as proveedor,
               array_agg(distinct m.nombre) filter (where m.nombre is not null) as marcas,$n$);
select pg_temp.reemplazar_dice_la_marca(
  'retail.fn_ordenes_directas_por_recibir(uuid)',
  $v$'proveedor_id', q.proveedor_id,$v$,
  $n$'proveedor_id', q.proveedor_id,
             'marcas', to_jsonb(coalesce(q.marcas, '{}'::text[])),$n$);

-- ---------- Que quedó todo ----------
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array['retail.fn_envios_por_recibir(uuid)', 'retail.fn_ordenes_directas_por_recibir(uuid)'] loop
    if position('''marcas'', to_jsonb(coalesce(' in pg_get_functiondef(v_firma::regprocedure)) = 0
       or position('left join retail.marcas m on m.id = ' in pg_get_functiondef(v_firma::regprocedure)) = 0 then
      raise exception '% no quedó diciendo la marca', v_firma;
    end if;
  end loop;
end;
$$;

reset lock_timeout;
