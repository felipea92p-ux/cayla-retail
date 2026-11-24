-- «Editar orden» del escritorio no pierde lo que cada línea traía de «Compré ropa» (ADR-0700, junto a la actividad 4). Una sola parte.
--
-- EL PROBLEMA PRIMERO. «Editar orden» borra todas las líneas de la orden y las vuelve a escribir con lo que manda la pantalla
-- (`editar_orden_compra` → `fn_orden_compra_escribir_lineas`). La pantalla del escritorio nunca leyó el precio de venta sugerido ni sus
-- motivos, y la base nunca escribió la prenda del catálogo elegida, «a la espera de precio», lo que la prenda tiene ni el precio visto
-- afuera. Una orden de «Compré ropa» sin comprobante ni envío muestra «Editar»: corregirle una cantidad le borraba el precio que puso quien
-- compró, sus casillas y la prenda del catálogo, y al recibirla la prenda nacía sin nada de eso. En producción, el 2026-11-24, ninguna de
-- las 42 órdenes con sugerido estaba en esa ventana: el daño todavía no ocurrió.
--
-- QUÉ HACE (dos reemplazos anclados; la pantalla, en `lib/orden-compra-alta.ts`, guarda lo de cada línea y lo devuelve):
--   1. `fn_orden_compra_detalle`: cada línea trae también `producto_id`, `precio_por_definir`, `rasgos` y `precio_visto_afuera` (el
--      sugerido y sus motivos ya venían). El archivo de versiones, que es una foto del detalle, los guarda también.
--   2. `fn_orden_compra_escribir_lineas`: escribe en cada línea lo que trae, con las mismas reglas de «Compré ropa». La prenda del
--      catálogo vale solo si sigue existiendo y es de la misma categoría y marca que la línea (si alguien le cambió la categoría, ya no es
--      esa prenda). «A la espera de precio» vale solo sin sugerido y sin prenda: quien escribe un precio ya no espera. Las casillas y el
--      precio visto afuera pasan por los mismos lectores que «Compré ropa» (`fn_rasgos_de_linea`, `fn_precio_visto_de_linea`). Una orden
--      nueva del escritorio no trae nada de eso y queda como siempre.
--
-- DECIDÍ: que la pantalla devuelva lo de cada línea (la línea que se edita lleva lo suyo) y que la base lo vuelva a revisar al escribirlo.
-- DESCARTÉ: (a) que la base lo copie de la versión anterior emparejando por posición: si alguien quita la línea 2, la 3 pasa a ser la 2 y
-- se lleva lo de otra prenda; (b) no borrar y actualizar en su lugar: cambia la forma en que se edita una orden (versiones, actividad,
-- huella) para un arreglo de cuatro columnas; (c) sumar estas columnas a la huella de «sin cambios»: el editor no las muestra ni las
-- cambia, así que nunca hacen que una edición cuente como distinta.
-- SE ROMPE SI: alguien edita la orden desde una pantalla vieja que no lee estos campos (una pestaña abierta antes de publicar): esa
-- edición los pierde como hoy. Se cierra sola al recargar.
--
-- POR QUÉ AL INICIO DEL `insert`, y no al final ni en un `update` aparte: 20261022080000 ancla el final de la lista de columnas y el de la
-- de valores de `fn_orden_compra_escribir_lineas` (y su prueba la vuelve a pegar), así que lo nuevo va al principio de las dos. Y un
-- `update` después del `insert` choca con el candado de 20261113211000: una línea que nació «con precio» no vuelve a «a la espera»
-- (`por_definir_no_vuelve`). Escrito en el `insert`, la línea nace como es.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Después de 20261124174000 (usa sus dos lectores y sus columnas). Una parte: dos
-- reemplazos anclados (el segundo, de tres anclas que van juntas) que se detienen si el texto vivo cambió. Las dos funciones tienen el
-- mismo md5 en el local y en producción (`fn_orden_compra_detalle` 377776be35dd…, `fn_orden_compra_escribir_lineas` 2f627fcd46a6…,
-- 2026-11-24). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplazos que van juntos (una función de lenguaje SQL se valida al crearla: columnas sin sus valores la rechazan). Re-pegable: si ya
-- están todos los nuevos, no hace nada; si un ancla no aparece exactamente una vez, se detiene sin tocar nada.
create or replace function pg_temp.reemplazar_editar_orden(p_firma text, p_viejos text[], p_nuevos text[])
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  i integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if (select bool_and(position(n in v_def) > 0) from unnest(p_nuevos) n) then
    return;
  end if;
  for i in 1 .. cardinality(p_viejos) loop
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    if v_n <> 1 then
      raise exception '% cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        p_firma, i, v_n;
    end if;
  end loop;
  for i in 1 .. cardinality(p_viejos) loop
    v_def := replace(v_def, p_viejos[i], p_nuevos[i]);
  end loop;
  execute v_def;
end;
$f$;

-- 1. El detalle: cada línea trae lo que la pantalla tiene que devolver al guardar.
select pg_temp.reemplazar_editar_orden(
  'retail.fn_orden_compra_detalle(uuid)',
  array[$v$                      'id', i.id,$v$],
  array[$n$                      'id', i.id,
                      -- 20261124181000: lo que la línea trae de «Compré ropa», para que «Editar orden» lo devuelva al guardar.
                      'producto_id', i.producto_id,
                      'precio_por_definir', i.precio_por_definir,
                      'rasgos', to_jsonb(i.rasgos),
                      'precio_visto_afuera', i.precio_visto_afuera,$n$]);

-- 2. Escribir las líneas: cada una nace con lo que trae, revisado (las columnas nuevas al principio de las dos listas; la prenda, de un
--    `lateral` al final).
select pg_temp.reemplazar_editar_orden(
  'retail.fn_orden_compra_escribir_lineas(uuid,jsonb)',
  array[
    $v$  insert into retail.orden_compra_items (orden_compra_id, posicion,$v$,
    $v$  select p_orden_id,$v$,
    $v$    from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion);$v$],
  array[
    $n$  -- 20261124181000 (ADR-0700): lo que la línea trae de «Compré ropa» va al principio de las dos listas.
  insert into retail.orden_compra_items (producto_id, precio_por_definir, rasgos, precio_visto_afuera,
                                       orden_compra_id, posicion,$n$,
    $n$  select x.producto_id,
         -- «A la espera de precio», solo sin sugerido ni prenda: quien escribe un precio ya no espera.
         x.producto_id is null and nullif(btrim(l.valor ->> 'precio_venta_sugerido'), '') is null
           and coalesce(l.valor ->> 'precio_por_definir', '') = 'true',
         retail.fn_rasgos_de_linea(l.valor -> 'rasgos'),
         retail.fn_precio_visto_de_linea(l.valor -> 'precio_visto_afuera'),
         p_orden_id,$n$,
    $n$    from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion)
    -- La prenda del catálogo, solo si sigue ahí y es de la misma categoría y marca que la línea (si le cambiaron la categoría, ya no es
    -- esa prenda). Un id que no se entiende no se guarda, sin frenar la orden.
    cross join lateral (
      select (select p.id
                from retail.productos p
               where p.id = case when l.valor ->> 'producto_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                 then (l.valor ->> 'producto_id')::uuid end
                 and p.estado_alta <> 'rechazado'
                 and p.categoria_id = nullif(l.valor ->> 'categoria_id', '')::uuid
                 and p.marca_id is not distinct from nullif(l.valor ->> 'marca_id', '')::uuid) as producto_id
    ) x;$n$]);

-- Comprobación final: los dos parches están, y los de antes siguen en su lugar (20261022080000 los vuelve a buscar al pegarse otra vez).
do $$
declare
  v_detalle text := pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure);
  v_escribir text := pg_get_functiondef('retail.fn_orden_compra_escribir_lineas(uuid,jsonb)'::regprocedure);
begin
  if position('''precio_visto_afuera'', i.precio_visto_afuera' in v_detalle) = 0 or position('sugerido_motivos' in v_detalle) = 0 then
    raise exception 'fn_orden_compra_detalle no trae lo de la línea';
  end if;
  if position('retail.fn_rasgos_de_linea(l.valor' in v_escribir) = 0
     or position('precio_venta_sugerido, sugerido_motivos)' in v_escribir) = 0 then
    raise exception 'fn_orden_compra_escribir_lineas no devuelve lo de la línea';
  end if;
end;
$$;

reset lock_timeout;
