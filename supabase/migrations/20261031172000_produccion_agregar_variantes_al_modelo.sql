-- ============================================================================
-- 20261031172000_produccion_agregar_variantes_al_modelo.sql — CAYLA V2 (Producción ▸ Nueva orden, 2026-10-31)
--
-- EL PROBLEMA PRIMERO. «Nueva orden» arma la matriz «Cuántas por talla y color» con las variantes que el modelo YA tiene. Si falta una talla o un
--   color, la persona tenía que salir a Catálogo ▸ Editar producto, agregarlo con todo su ritual (SKU, precios, stock de partida), guardar y volver a
--   abrir la orden. Felipe (2026-10-31): «debería poder agregar una talla y color desde aquí nada más, ir a Catálogo es un paso largo innecesario».
--
-- QUÉ PROMETE. `agregar_variantes_a_modelo(taller, modelo, talla, color)`: agrega UNA talla nueva (con cada color que el modelo ya vende) o UN color nuevo
--   (en cada talla que el modelo ya vende) y devuelve cuántas variantes creó. Exactamente una de las dos (`p_talla_id` o `p_color_codigo`).
--     · Quien la llama opera ese Taller (`fn_produccion_exigir_operar`) Y edita el catálogo (`fn_puede_editar_catalogo`: las variantes son del catálogo y su
--       RLS ya es esa). El responsable queda firmado (`fn_actor_persona_id(true)`).
--     · La talla tiene que estar habilitada para la categoría del modelo (`categoria_tallas`); el color, activo en el vocabulario.
--     · Las variantes nacen ACTIVAS, con el precio y el costo de su variante hermana (la del mismo color —o la de la misma talla— y, a igualdad, la de mayor
--       precio: la misma regla que `censo_crear_variante`) y SIN stock: no se escribe ningún movimiento, el stock de una variante nueva es cero.
--     · El código lo asigna el trigger de siempre (`variantes_asignar_codigo`). La función sube la versión del producto (ADR-0193: un update vacío, que
--       `productos_version_bu` convierte en versión + 1), así que quien tenga el producto abierto en Editar producto recibe el aviso «Otra persona
--       cambió esta prenda» en vez de guardar sin ver las variantes nuevas.
--   PROMETE: todo o nada (una variante nueva que choque aborta las demás); lo que ya existe no se duplica ni se toca; una prenda «Sin color» o «Única» no
--   se mezcla con una de color o de talla (la base lo frena con su mensaje de siempre, y acá se anticipa con uno claro).
--
-- QUÉ NO HACE. No reactiva una variante desactivada (avisa cuál es y manda a Editar producto: reactivar es una decisión de catálogo), no cambia precios ni
--   costos de las existentes, no escribe stock ni movimientos, y no tiene nada de dinero propio: copia lo que la prenda ya tiene.
--
-- ORDEN PARA PRODUCCIÓN: sola, sin partes (no toca políticas ni altera tablas en uso). `create or replace`, re-pegable. Trae `set search_path`.
-- CÓMO SE DESHACE. drop function retail.agregar_variantes_a_modelo(uuid, uuid, uuid, text);  (las variantes que ya creó se desactivan desde Editar producto).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.agregar_variantes_a_modelo(
  p_ubicacion_id uuid,
  p_producto_id uuid,
  p_talla_id uuid default null,
  p_color_codigo text default null
)
returns integer
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_color text := nullif(btrim(coalesce(p_color_codigo, '')), '');
  v_ref text;
  v_categoria uuid;
  v_actor uuid;
  v_hay_activas boolean;
  v_sin_color boolean;
  v_sin_talla boolean;
  v_nuevas integer := 0;
  v_desactivada text;
  v_eje record;
  v_hermana record;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  if not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller') then
    raise exception 'Las tallas y colores del modelo se agregan desde el Taller' using hint = 'agregar_variante_no_es_taller';
  end if;
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'Agregar una talla o un color es de quien edita el catálogo' using errcode = '42501', hint = 'agregar_variante_sin_permiso';
  end if;
  if (p_talla_id is null) = (v_color is null) then
    raise exception 'Agrega una talla o un color, no las dos cosas a la vez' using hint = 'agregar_variante_un_eje';
  end if;

  select p.referencia, p.categoria_id into v_ref, v_categoria
    from retail.productos p where p.id = p_producto_id and p.estado_alta <> 'rechazado';
  if v_ref is null then
    raise exception 'Ese modelo no existe' using hint = 'agregar_variante_modelo_inexistente';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  -- Un candado por modelo (ADR-0190): dos personas agregando la misma talla a la vez no chocan con el índice único, la segunda espera y la ve ya hecha.
  perform pg_advisory_xact_lock(hashtextextended('variantes_modelo:' || p_producto_id::text, 0));

  select count(*) > 0,
         coalesce(bool_or(v.color_codigo is null), false),
         coalesce(bool_or(v.talla_id is null), false)
    into v_hay_activas, v_sin_color, v_sin_talla
    from retail.variantes v where v.producto_id = p_producto_id and v.activo;
  if not v_hay_activas then
    raise exception 'Este modelo no tiene ninguna variante activa: actívala o agrégala desde Editar producto' using hint = 'agregar_variante_sin_variantes';
  end if;

  if p_talla_id is not null then
    if v_sin_talla then
      raise exception 'Este modelo se vende en talla única: no se le agrega una talla aquí' using hint = 'agregar_variante_modelo_sin_talla';
    end if;
    if not exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = v_categoria and ct.talla_id = p_talla_id) then
      raise exception 'Esa talla no está habilitada para la categoría del modelo' using hint = 'agregar_variante_talla_no_habilitada';
    end if;
  else
    if v_sin_color then
      raise exception 'Este modelo no tiene color: no se le agrega uno aquí' using hint = 'agregar_variante_modelo_sin_color';
    end if;
    if not exists (select 1 from retail.colores c where c.codigo = v_color and c.activo) then
      raise exception 'Ese color no existe o ya no está activo' using hint = 'agregar_variante_color_inactivo';
    end if;
  end if;

  -- Los pares que nacen: cada color que el modelo vende hoy × la talla nueva, o cada talla que vende hoy × el color nuevo.
  for v_eje in
    select distinct
           case when p_talla_id is not null then v.color_codigo else v_color end as color_codigo,
           case when p_talla_id is not null then p_talla_id else v.talla_id end as talla_id
      from retail.variantes v
     where v.producto_id = p_producto_id and v.activo
  loop
    -- Ya existe (activa: no se duplica; desactivada: el índice único la reclamaría, y reactivarla es de Editar producto).
    select case when x.activo then 'activa' else 'desactivada' end into v_desactivada
      from retail.variantes x
     where x.producto_id = p_producto_id
       and x.talla_id is not distinct from v_eje.talla_id
       and x.color_codigo is not distinct from v_eje.color_codigo;
    if v_desactivada = 'desactivada' then
      raise exception 'Esa combinación ya existe pero está desactivada: reactívala desde Editar producto' using hint = 'agregar_variante_desactivada';
    end if;
    if v_desactivada = 'activa' then
      v_desactivada := null;
      continue;
    end if;

    -- La hermana: la del mismo color (al agregar una talla) o la de la misma talla (al agregar un color); a igualdad, la de mayor precio.
    select v.precio, v.costo into v_hermana
      from retail.variantes v
     where v.producto_id = p_producto_id and v.activo
     order by case when p_talla_id is not null then (v.color_codigo is not distinct from v_eje.color_codigo)
                   else (v.talla_id is not distinct from v_eje.talla_id) end desc,
              v.precio desc
     limit 1;

    insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo)
      values (p_producto_id, v_eje.color_codigo, v_eje.talla_id, v_hermana.precio, v_hermana.costo);
    v_nuevas := v_nuevas + 1;
  end loop;

  if v_nuevas = 0 then
    raise exception 'Esa talla o ese color ya está en el modelo' using hint = 'agregar_variante_ya_existe';
  end if;

  -- La mezcla «Sin color» con color la revisa el trigger diferido; se anticipa acá para que el error salga en esta llamada.
  set constraints retail.variantes_sin_mezcla_de_color immediate;

  -- ADR-0193: la ficha de Editar producto compara esta versión al guardar. Un update vacío basta: `productos_version_bu` siempre pone la de antes + 1.
  update retail.productos set version = version where id = p_producto_id;

  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'variantes_modelo',
      'agregó ' || case when p_talla_id is not null then 'una talla' else 'un color' end || ' a ' || v_ref || ' (' || v_nuevas || case when v_nuevas = 1 then ' variante)' else ' variantes)' end,
      v_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id,
      'productos', p_producto_id::text, now(),
      jsonb_build_object('producto_id', p_producto_id, 'talla_id', p_talla_id, 'color_codigo', v_color, 'variantes_nuevas', v_nuevas), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la talla o el color agregado al modelo % (%)', p_producto_id, sqlerrm;
  end;

  return v_nuevas;
end;
$$;

comment on function retail.agregar_variantes_a_modelo(uuid, uuid, uuid, text) is
  'Producción ▸ Nueva orden: agrega UNA talla (con cada color del modelo) o UN color (en cada talla del modelo), con el precio y el costo de su hermana y sin stock. Quien opera el Taller y edita el catálogo. Devuelve cuántas variantes creó.';

revoke all on function retail.agregar_variantes_a_modelo(uuid, uuid, uuid, text) from public, anon;
grant execute on function retail.agregar_variantes_a_modelo(uuid, uuid, uuid, text) to authenticated;
