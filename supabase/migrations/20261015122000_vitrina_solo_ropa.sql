-- ============================================================================
-- 20261015122000_vitrina_solo_ropa.sql — CAYLA V2 · Tienda online (ADR-0408), Felipe 2026-10-15: «Solo ropa en la web»
--
-- EL PROBLEMA PRIMERO. Las bolsas, las cajas y el empaque se venden (ADR-0377: viven en una familia con el interruptor «Cuenta en
-- Análisis, Frescura y el plan del piso» apagado), así que la Vitrina web las dejaba mostrar como cualquier prenda: la bolsa de
-- papel de S/ 0.50 podía salir en el catálogo de la tienda online, en la ficha, en la bolsa del cliente y hasta en un look. Eso no es
-- lo que CAYLA vende en la web: la bolsa se agrega desde el ticket, en la caja (`BolsaDelTicket`).
--
-- LA REGLA (Felipe, 2026-10-15). La Vitrina no deja mostrar un modelo cuya categoría es de una familia fuera de los motores
-- (`fn_categoria_entra_a_motores` = no), y la tienda online no lo muestra aunque haya quedado publicado antes de este cambio.
--
-- LO QUE HACE
--   1. `fn_vitrina_por_que_no(modelo)` — LA regla de la Vitrina, con su porqué: null si se puede mostrar; si no, en este orden,
--      'no_existe'; 'no_se_vende' (descontinuado, rechazado, de prueba, la «Prenda sin registrar» o sin tallas activas: no se vende en
--      ningún lado); 'empaque' (se vende, pero en la caja: su familia está fuera de los motores); 'sin_precio' (ropa sin ninguna talla
--      activa con precio). El empaque va antes que «sin precio»: la bolsa de obsequio (todas sus tallas en 0) no es «ropa sin precio».
--   2. `fn_vitrina_publicable(modelo)` — pasa a ser «no hay porqué» (`fn_vitrina_por_que_no(...) is null`): una sola regla. Como todo lo
--      de la tienda pregunta por ella (el catálogo, la ficha, Lo nuevo y Más vendidos, la bolsa, «Separar», los favoritos, «Avísame»,
--      «otra persona ya separó la última» y los looks, que leen el catálogo), un modelo de empaque que quedó publicado antes no sale
--      en ninguno: su fila de la Vitrina queda como está (no se borra ni se cambia nada) y vuelve a verse si su familia vuelve a
--      contar en los motores.
--   3. Lo que guarda la Vitrina se niega con su porqué: `vitrina_guardar_modelo` («no es ropa: se vende desde el ticket, en la
--      caja»), `vitrina_mostrar` (el lote nombra aparte lo que es empaque) y `vitrina_guardar_look` (una bolsa no va en un look).
--   4. La pantalla (Catálogo ▸ Vitrina web): `fn_vitrina_modelo_json` trae `por_que_no`, y `fn_vitrina_modelos` lista también lo que es
--      empaque (se vende, en la caja), para que la fila diga por qué no va en la web, con el interruptor apagado.
--
-- DECIDÍ: la regla en una sola función con su porqué (y `publicable` = «no hay porqué»), no una línea más en `fn_vitrina_publicable` y
--   un segundo «por qué» aparte: dos funciones que deciden lo mismo terminan diciendo cosas distintas. El empaque antes que «sin
--   precio», y «no se vende» antes que el empaque (una bolsa de prueba no es «se vende en la caja»).
-- DESCARTÉ: despublicar en la base los modelos de empaque que ya estaban publicados (sería escribir en nombre de nadie; con la regla
--   basta para que no se vean, y su fila vuelve a servir si la familia vuelve a contar); esconder el empaque de la lista de la
--   Vitrina (sin decir por qué, alguien lo buscaría para mostrarlo).
--
-- PRODUCCIÓN. NO está aplicada: va con la tienda online (actividad 13), DESPUÉS de 20261014225000 (la Vitrina) y 20261015031000 (los
-- looks). Una sola parte, re-ejecutable, `lock_timeout = 3s`: una función nueva y reemplazos ANCLADOS (si un trozo no está exactamente
-- una vez, se detiene sin tocar nada); sin tablas, políticas ni disparadores (ADR-0195); ningún texto de ancla lleva la palabra con la
-- que se guarda una consulta en una variable (ADR-0288). Pruebas: `pnpm pruebas:vitrina-web` (sección «Solo ropa en la web», con su
-- mutante), `pruebas:vitrina-looks`, `pruebas:tienda-inicio` y `pruebas:tienda-ficha`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_vitrina_publicable(uuid)') is null or to_regprocedure('retail.vitrina_mostrar(uuid[], boolean)') is null then
    raise exception 'Falta la Vitrina web: pega antes 20261014225000_vitrina_web.sql.';
  end if;
  if to_regprocedure('retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)') is null then
    raise exception 'Faltan los looks de la Vitrina: pega antes 20261015031000_vitrina_looks.sql.';
  end if;
  if to_regprocedure('retail.fn_categoria_entra_a_motores(uuid)') is null then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega antes 20261010231000_familias_entran_a_motores.sql.';
  end if;
end
$$;

-- El reemplazo anclado (el mismo de 20261012190000): si el texto nuevo ya está, no hace nada; si el ancla no aparece exactamente
-- `p_veces` veces, se detiene sin tocar nada.
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

-- ---------- 1. La regla, con su porqué ----------
create or replace function retail.fn_vitrina_por_que_no(p_producto_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public
as $$
  select case
    when p.id is null then 'no_existe'
    when p.estado <> 'activo' or p.estado_alta = 'rechazado' or p.es_prueba or p.id = '11111111-1111-4111-8111-111111111111'
         or not exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo) then 'no_se_vende'
    -- Solo ropa en la web (Felipe 2026-10-15): lo de una familia fuera de los motores (bolsas, cajas, empaque) se vende desde el
    -- ticket, en la caja (ADR-0377).
    when not retail.fn_categoria_entra_a_motores(p.categoria_id) then 'empaque'
    -- Una talla a S/ 0 no se ofrece en la web (ADR-0384): sin ninguna con precio, no hay qué mostrar.
    when not exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo and v.precio > 0) then 'sin_precio'
  end
  from (select p_producto_id as id) k
  left join retail.productos p on p.id = k.id
$$;

comment on function retail.fn_vitrina_por_que_no(uuid) is
  'Tienda online (ADR-0408): LA regla de la Vitrina web. Por qué un modelo NO se puede mostrar en la web (null: sí se puede): no_existe, no_se_vende (descontinuado, rechazado, de prueba, la Prenda sin registrar o sin tallas activas), empaque (familia fuera de los motores: se vende en la caja, 2026-10-15) o sin_precio. fn_vitrina_publicable es «no hay porqué». Interna.';

revoke all on function retail.fn_vitrina_por_que_no(uuid) from public, anon, authenticated;

-- ---------- 2. «Se puede mostrar» = no hay porqué ----------
select pg_temp.reemplazar('retail.fn_vitrina_publicable(uuid)',
  $v$  select exists (
    select 1
      from retail.productos p
     where p.id = p_producto_id
       and p.estado = 'activo'
       and p.estado_alta <> 'rechazado'
       and not p.es_prueba
       and p.id <> '11111111-1111-4111-8111-111111111111'
       and exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo and v.precio > 0)
  )$v$,
  $v$  -- Se puede mostrar en la web si no hay un porqué (fn_vitrina_por_que_no, 20261015122000): la regla vive en un solo lugar.
  select retail.fn_vitrina_por_que_no(p_producto_id) is null$v$,
  1);

comment on function retail.fn_vitrina_publicable(uuid) is
  'Tienda online (ADR-0408): ¿el modelo se puede mostrar en la web? Sí si no hay porqué (fn_vitrina_por_que_no): activo, no de prueba, con alguna talla activa con precio y ROPA (no de una familia fuera de los motores, 2026-10-15). La preguntan la Vitrina y todo lo que muestra la tienda. Interna.';

-- ---------- 3. Lo que guarda la Vitrina se niega con su porqué ----------

select pg_temp.reemplazar('retail.vitrina_guardar_modelo(uuid, boolean, text, text, integer)',
  $v$  if p_publicado and not retail.fn_vitrina_publicable(p_producto_id) then
    raise exception 'vitrina_no_publicable'
      using hint = format('«%s» no se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas con precio.', v_nombre);
  end if;$v$,
  $v$  if p_publicado and not retail.fn_vitrina_publicable(p_producto_id) then
    -- Solo ropa en la web (20261015122000): las bolsas, las cajas y el empaque se venden desde el ticket, en la caja.
    if retail.fn_vitrina_por_que_no(p_producto_id) = 'empaque' then
      raise exception 'vitrina_no_publicable'
        using hint = format('«%s» no se puede mostrar: no es ropa, es de %s. Se vende desde el ticket, en la caja.', v_nombre,
                            coalesce((select f.nombre from retail.productos pf
                                        join retail.categorias cf on cf.id = pf.categoria_id
                                        join retail.familias f on f.codigo = cf.familia
                                       where pf.id = p_producto_id), 'una familia de empaque'));
    end if;
    raise exception 'vitrina_no_publicable'
      using hint = format('«%s» no se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas con precio.', v_nombre);
  end if;$v$,
  1);

select pg_temp.reemplazar('retail.vitrina_mostrar(uuid[], boolean)',
  $v$  v_no_publicables text[] := '{}';$v$,
  $v$  v_no_publicables text[] := '{}';
  v_empaque text[] := '{}';$v$,
  1);

select pg_temp.reemplazar('retail.vitrina_mostrar(uuid[], boolean)',
  $v$      if not retail.fn_vitrina_publicable(v_id) then
        v_no_publicables := v_no_publicables || v_nombre;
        continue;
      end if;$v$,
  $v$      if not retail.fn_vitrina_publicable(v_id) then
        -- Solo ropa en la web (20261015122000): lo que es empaque se nombra aparte, con su porqué.
        if retail.fn_vitrina_por_que_no(v_id) = 'empaque' then
          v_empaque := v_empaque || v_nombre;
        else
          v_no_publicables := v_no_publicables || v_nombre;
        end if;
        continue;
      end if;$v$,
  1);

select pg_temp.reemplazar('retail.vitrina_mostrar(uuid[], boolean)',
  $v$  if cardinality(v_no_publicables) > 0 then
    raise exception 'vitrina_no_publicable'
      using hint = format('No se pueden mostrar: %s (descontinuados, de prueba o sin tallas activas con precio). Quítalos de la selección.',
                          retail.fn_vitrina_lista_nombres(v_no_publicables));
  end if;$v$,
  $v$  if cardinality(v_no_publicables) > 0 or cardinality(v_empaque) > 0 then
    raise exception 'vitrina_no_publicable'
      using hint = 'No se pueden mostrar: ' || concat_ws('; ',
        case when cardinality(v_empaque) > 0
             then retail.fn_vitrina_lista_nombres(v_empaque) || ' (no son ropa: se venden desde el ticket, en la caja)' end,
        case when cardinality(v_no_publicables) > 0
             then retail.fn_vitrina_lista_nombres(v_no_publicables) || ' (descontinuados, de prueba o sin tallas activas con precio)' end)
        || '. Quítalos de la selección.';
  end if;$v$,
  1);

select pg_temp.reemplazar('retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)',
  $v$      raise exception 'vitrina_look_prenda_invalida'
        using hint = format('«%s» no se puede usar así: está descontinuado, es de prueba o ese color ya no tiene tallas activas.', v_prenda);$v$,
  $v$      raise exception 'vitrina_look_prenda_invalida'
        using hint = case when retail.fn_vitrina_por_que_no(v_productos[v_i]) = 'empaque'
                          -- Solo ropa en la web (20261015122000).
                          then format('«%s» no va en un look: no es ropa, se vende desde el ticket, en la caja.', v_prenda)
                          else format('«%s» no se puede usar así: está descontinuado, es de prueba o ese color ya no tiene tallas activas.', v_prenda)
                     end;$v$,
  1);

-- ---------- 4. La pantalla dice por qué ----------

select pg_temp.reemplazar('retail.fn_vitrina_modelo_json(uuid)',
  $v$    'publicable', retail.fn_vitrina_publicable(p.id),$v$,
  $v$    'publicable', retail.fn_vitrina_publicable(p.id),
    -- Por qué no se puede mostrar (null: sí se puede): empaque, sin_precio, no_se_vende (20261015122000). La pantalla lo dice.
    'por_que_no', retail.fn_vitrina_por_que_no(p.id),$v$,
  1);

select pg_temp.reemplazar('retail.fn_vitrina_modelos()',
  $v$           where retail.fn_vitrina_publicable(p.id)
              or exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p.id)$v$,
  $v$           where retail.fn_vitrina_publicable(p.id)
              -- Lo que es empaque se vende (en la caja): sale en la lista para que la fila diga por qué no va en la web.
              or retail.fn_vitrina_por_que_no(p.id) = 'empaque'
              or exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p.id)$v$,
  1);
