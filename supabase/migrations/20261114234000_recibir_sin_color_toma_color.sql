-- ============================================================================
-- 20261114234000_recibir_sin_color_toma_color.sql — CAYLA V2 (2026-11-14)
-- Recibir mercadería: a una prenda «Sin color» le llegan colores, y ya no choca con el candado de mezcla
--
-- EL PROBLEMA PRIMERO. El 2026-11-14 se creó «Pantalón Cayla Lino» (PAN-0041) al recibir, con S, M y L pero sin marcar colores: nació
-- con tres variantes «Sin color». Tres minutos después, en «Sumar tallas o colores», se le marcaron los cinco colores que llegaron. La hoja
-- dijo «Todo listo para sumarlas» y la base rechazó las 15 combinaciones cinco veces seguidas: «Esta prenda quedaría con variantes «Sin
-- color» junto a otras con color». El candado tiene razón (ADR-0263 T5: «Sin color S» y «Gris perla S» serían la misma talla vendida en dos
-- filas), pero `preparar_prenda_al_recibir` solo SUMA: no había forma de pasar de «Sin color» a colores desde Recibir. Quien recibe no
-- edita el catálogo y no tenía salida; las fotos que había subido se perdían al cerrar la hoja. Se destrabó a mano en producción.
--
-- LA DECISIÓN. En `preparar_prenda_al_recibir`, cuando a una prenda que YA existe le llegan colores (y ninguna combinación «Sin color»):
--   1. Si una de sus variantes «Sin color» activas tiene historia (stock, movimientos, ventas, separaciones, apartados, traslados, conteos,
--      lo recibido de un envío, un conteo de envío con su detalle, un cambio, un pedido web o producción), no se adivina de qué color eran
--      esas prendas: se frena ANTES de escribir nada, con la talla y qué hacer (hint `recepcion_sin_color_con_historia`, que la pantalla
--      muestra tal cual).
--   2. Sin historia, cada «Sin color» toma el primer color que llegó EN SU TALLA (en el orden en que llegaron) y que la prenda no tiene:
--      es la misma variante con otro color, como la corrección de la ficha (`fn_corregir_identidad_variante`): código nuevo y el viejo
--      queda en `codigos_barras` apuntando a ella (una etiqueta ya pegada sigue sonando); el historial lo anota con quien firma. Después
--      el bucle de siempre la encuentra activa y la salta, y crea las demás con su precio y su costo como hermana.
--   3. La «Sin color» cuya talla no llegó en ningún color (o cuyos colores ya existían) se desactiva al final: no tiene historia (paso 1)
--      y dejarla activa mezclaría la prenda. Desactivar no borra nada y se reactiva desde la ficha.
--   El candado de mezcla se difiere solo mientras dura esta llamada y vuelve a inmediato antes de responder: si algo quedara mezclado,
--   el error sale aquí, como siempre. Con una combinación «Sin color» entre lo que llegó, nada cambia (el candado sigue frenando).
--
-- CONTRATO (Liskov)
--   PROMETE: la prenda «Sin color» y sin historia recibe los colores que llegaron en una sola llamada, sin perder su precio ni su costo; una
--            prenda nueva, una que ya tiene colores o una que llega «Sin color» se comportan idéntico a antes.
--   ASUME:   `preparar_prenda_al_recibir` tiene hoy el texto de sus anclas (cada reemplazo lo comprueba y frena si no).
--   FALLA:   `recepcion_sin_color_con_historia` si una «Sin color» tiene historia; `recepcion_color` si el color que tomaría ya no está activo.
--   NO HACE: no pinta una «Sin color» con historia; no toca la ficha de producto, el Conteo ni la web (la frase nueva pasa sola por
--            `mensajeDeLaRecepcion`, que muestra tal cual las pistas `recepcion_*`).
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable (cada reemplazo se salta si ya está hecho). Solo reemplaza una función: sin `alter`, sin
-- políticas ni disparadores (ADR-0195 no aplica). Se puede pegar antes o después de publicar la web: la web no cambia.
--
-- VERIFICACIÓN (→ t | t | t):
--   select position('v_sin_color_a_color boolean := false;' in d) > 0,
--          position('recepcion_sin_color_con_historia' in d) > 0,
--          position('set constraints retail.variantes_sin_mezcla_de_color immediate;' in d) > 0
--     from pg_get_functiondef('retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)'::regprocedure) d;
-- CÓMO SE DESHACE: los tres reemplazos al revés (nuevo → viejo). Las variantes ya recoloreadas no vuelven solas a «Sin color»: se
-- corrigen desde la ficha si hiciera falta.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplaza `p_viejo` por `p_nuevo` en la función, exigiendo que el ancla aparezca exactamente `p_veces` veces. Si `p_nuevo` ya está,
-- no hace nada (re-ejecutable).
create or replace function pg_temp.reemplazar_anclado_veces(p_firma text, p_viejo text, p_nuevo text, p_veces integer default 1)
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
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---- 1. La marca de que esta llamada difirió el candado de mezcla. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$  v_candidatos uuid[];
begin$v$,
  $n$  v_candidatos uuid[];
  -- 20261114234000: la prenda «Sin color» que recibe colores difiere el candado de mezcla hasta el final de esta llamada.
  v_sin_color_a_color boolean := false;
begin$n$);

-- ---- 2. Antes de crear lo que llegó: las «Sin color» sin historia toman el color que llegó en su talla. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$  -- Las tallas y colores que llegaron y la prenda no tenía: se crean (o se reactivan, si estaban desactivados). Mismas reglas que el$v$,
  $n$  -- 20261114234000 (ADR-0393, act. 2026-11-14): a una prenda que ya existe y tiene variantes «Sin color» le llegan colores (y ninguna
  -- combinación «Sin color»). La base no deja mezclar (variantes_sin_mezcla_de_color, ADR-0263 T5) y esta hoja solo sumaba: la prenda
  -- creada sin color no podía recibir los colores que llegaron (PAN-0041, 2026-11-14). Con historia, no se adivina de qué color eran
  -- esas prendas: se frena antes de escribir nada. Sin historia, cada «Sin color» toma el primer color que llegó en su talla (la misma
  -- variante, como la corrección de la ficha: su código viejo sigue sonando) y las que no toman ninguno se desactivan al final.
  if p_producto_id is not null
     and exists (select 1 from jsonb_array_elements(v_pedidas) e where e.value ->> 'color_codigo' is not null)
     and not exists (select 1 from jsonb_array_elements(v_pedidas) e where e.value ->> 'color_codigo' is null)
     and exists (select 1 from retail.variantes v
                  where v.producto_id = v_producto_id and v.activo and v.color_codigo is null) then
    declare
      v_sc record;
      v_historia text;
      v_color_sc text;
      v_codigo_sc text;
    begin
      v_historia := (
        select string_agg(coalesce(t.valor, 'sin talla'), ', ' order by t.valor)
          from retail.variantes v
          left join retail.tallas t on t.id = v.talla_id
         where v.producto_id = v_producto_id and v.activo and v.color_codigo is null
           and (exists (select 1 from retail.stock s where s.variante_id = v.id and s.cantidad <> 0)
                or exists (select 1 from retail.movimientos m where m.variante_id = v.id)
                or exists (select 1 from retail.venta_items vi where vi.variante_id = v.id)
                or exists (select 1 from retail.separacion_items si where si.variante_id = v.id)
                or exists (select 1 from retail.apartados a where a.variante_id = v.id)
                or exists (select 1 from retail.transferencia_items ti where ti.variante_id = v.id)
                or exists (select 1 from retail.despacho_recibidos dr where dr.variante_id = v.id)
                or exists (select 1 from retail.conteo_items ci where ci.variante_id = v.id)
                or exists (select 1 from retail.cambios c where c.variante_nueva_id = v.id)
                or exists (select 1 from retail.pedido_web_lineas pw where pw.variante_id = v.id)
                or exists (select 1 from retail.produccion_lineas pl where pl.variante_id = v.id)
                or exists (select 1
                             from retail.despacho_conteos dc
                            cross join lateral jsonb_array_elements(
                              case when jsonb_typeof(dc.separado -> 'prendas') = 'array' then dc.separado -> 'prendas' else '[]'::jsonb end) p(x)
                            cross join lateral jsonb_array_elements(
                              case when jsonb_typeof(p.x -> 'variantes') = 'array' then p.x -> 'variantes' else '[]'::jsonb end) w(y)
                            where w.y ->> 'variante_id' = v.id::text)));
      if v_historia is not null then
        raise exception '«%» ya tiene prendas «Sin color» (talla %) y no se sabe de qué color son. Ponles color en Catálogo ▸ Productos ▸ Editar y vuelve a sumar.',
          v_producto.referencia, v_historia
          using hint = 'recepcion_sin_color_con_historia';
      end if;

      set constraints retail.variantes_sin_mezcla_de_color deferred;
      v_sin_color_a_color := true;

      for v_sc in
        select v.id, v.talla_id, v.codigo, t.valor as talla
          from retail.variantes v
          left join retail.tallas t on t.id = v.talla_id
         where v.producto_id = v_producto_id and v.activo and v.color_codigo is null
         order by v.codigo, v.id
           for update of v
      loop
        -- El primer color que llegó en su talla y que la prenda no tiene (activo o no): ese, no otro, para no chocar con una que existe.
        v_color_sc := (
          select e.value ->> 'color_codigo'
            from jsonb_array_elements(v_pedidas) with ordinality e(value, ord)
           where e.value ->> 'color_codigo' is not null
             and nullif(e.value ->> 'talla_id', '')::uuid is not distinct from v_sc.talla_id
             and not exists (select 1 from retail.variantes o
                              where o.producto_id = v_producto_id
                                and o.talla_id is not distinct from v_sc.talla_id
                                and o.color_codigo = e.value ->> 'color_codigo')
           order by e.ord
           limit 1);
        if v_color_sc is null then
          continue;  -- su talla no llegó en un color nuevo: se desactiva al final
        end if;
        if not exists (select 1 from retail.colores c where c.codigo = v_color_sc and c.activo) then
          raise exception 'Uno de los colores elegidos ya no está activo en el vocabulario' using hint = 'recepcion_color';
        end if;
        -- El código, con la misma fórmula que fn_corregir_identidad_variante; el viejo se queda sonando para esta variante.
        v_codigo_sc := retail.fn_codigo_variante_libre(
          coalesce(v_producto.codigo, retail.fn_asignar_codigo_producto(v_producto_id))
            || '-' || v_color_sc || '-' || retail.fn_token_talla(v_sc.talla),
          v_sc.id);
        if v_sc.codigo is not null and v_codigo_sc is distinct from v_sc.codigo then
          insert into retail.codigos_barras (codigo, variante_id, origen)
            values (v_sc.codigo, v_sc.id, 'propio')
            on conflict (codigo) do nothing;
        end if;
        update retail.variantes set color_codigo = v_color_sc, codigo = v_codigo_sc where id = v_sc.id;
        insert into retail.codigos_barras (codigo, variante_id, origen)
          values (v_codigo_sc, v_sc.id, 'propio')
          on conflict (codigo) do nothing;
      end loop;

      -- ADR-0193: la prenda cambió; una ficha abierta antes recibe PT409 al guardar, en vez de devolver el «Sin color».
      update retail.productos set version = version where id = v_producto_id;
    end;
  end if;

  -- Las tallas y colores que llegaron y la prenda no tenía: se crean (o se reactivan, si estaban desactivados). Mismas reglas que el$n$);

-- ---- 3. Al final: las «Sin color» que no tomaron color se desactivan y el candado de mezcla vuelve a inmediato. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$  end loop;

  return jsonb_build_object($v$,
  $n$  end loop;

  -- 20261114234000: las «Sin color» que no tomaron color se desactivan (no tienen historia: se miró arriba) y el candado de mezcla vuelve
  -- a inmediato, así un error sale aquí, dentro de esta llamada, y no al confirmar.
  if v_sin_color_a_color then
    update retail.variantes v set activo = false
     where v.producto_id = v_producto_id and v.activo and v.color_codigo is null;
    set constraints retail.variantes_sin_mezcla_de_color immediate;
  end if;

  return jsonb_build_object($n$);

reset lock_timeout;
