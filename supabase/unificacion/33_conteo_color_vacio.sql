-- ============================================================================
-- 33 — `conteo_crear_variante` acepta "sin color" como lo manda un formulario
-- Correr en cayla-DYNAMIC (SQL Editor). Gemelo de `supabase/migrations/0051_conteo_color_vacio.sql`.
-- Pegar DESPUES de `30_conteos.sql`. MISMA firma: no crea sobrecarga.
--
-- QUÉ ARREGLA
--   `p_talla` ya normaliza el vacío (`nullif(trim(p_talla), '')`), pero
--   `p_color_codigo` no: la función pregunta `if p_color_codigo is not null`, y
--   un `<select>` web con la opción "Sin color" manda cadena vacía, no null.
--   Resultado: al crear una correa o una cartera durante el conteo, la RPC
--   respondía «El color  no existe» — con el nombre en blanco, que además no se
--   entiende.
--
--   No es un caso raro: accesorios, bisutería y calzado suelen no tener color, y
--   son tres de las seis familias del catálogo.
--
-- POR QUÉ SE ARREGLA EN LA FUNCIÓN Y NO EN LA PANTALLA
--   La pantalla podría mandar null con un cast, pero el problema volvería con el
--   próximo llamador. Y hay una razón más fuerte para NO tocar la firma: agregarle
--   un `default null` a `p_color_codigo` crearía una SEGUNDA firma conviviendo con
--   la de hoy — exactamente el problema que ADR-0026 acaba de cerrar y que ADR-0004
--   documenta con `recibir_lote`. Un `create or replace` con la MISMA firma no
--   crea sobrecarga: solo cambia el cuerpo.
--
-- QUÉ CAMBIA: dos líneas. `p_color_codigo` pasa por `nullif(trim(…), '')` una vez,
--   al principio, y de ahí en adelante la función trabaja con esa variable. Todo
--   lo demás queda byte por byte como en `30_conteos.sql`.
-- ============================================================================

create or replace function retail.conteo_crear_variante(
  p_conteo_id uuid,
  p_referencia text,
  p_talla text,
  p_color_codigo text,
  p_cantidad integer,
  p_categoria_id uuid default null,
  p_producto_id uuid default null,
  p_precio numeric default 0,
  p_costo numeric default 0,
  p_codigo_barras text default null,
  p_sku text default null,
  p_contenedor_id uuid default null
) returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare
  c conteos%rowtype; v_producto_id uuid; v_variante_id uuid;
  v_base text; v_codigo text; v_sku text; v_color_nombre text; v_color_id text;
begin
  select * into c from conteos where id = p_conteo_id;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not retail.puede_operar_sede(c.sede_id) then
    raise exception 'No tienes permiso para contar en esa sede';
  end if;

  -- ↓↓↓ EL ARREGLO: "sin color" desde un formulario llega como '', no como null.
  v_color_id := nullif(trim(p_color_codigo), '');

  if v_color_id is not null then
    select nombre into v_color_nombre from colores where codigo = v_color_id;
    if v_color_nombre is null then
      raise exception 'El color % no existe. La Líder puede agregarlo en Catálogo → Colores', v_color_id;
    end if;
  end if;

  v_producto_id := p_producto_id;
  if v_producto_id is null then
    if coalesce(trim(p_referencia), '') = '' then
      raise exception 'Falta el nombre de la prenda';
    end if;
    insert into productos (sku_padre, referencia, categoria_id, estado)
      values ('TMP-' || replace(gen_random_uuid()::text, '-', ''), trim(p_referencia), p_categoria_id, 'activa')
      returning id into v_producto_id;
    v_base := retail.fn_asignar_codigo_producto(v_producto_id);
    update productos set sku_padre = v_base where id = v_producto_id;
  else
    v_base := retail.fn_asignar_codigo_producto(v_producto_id);
  end if;

  select id into v_variante_id from variantes
    where producto_id = v_producto_id
      and coalesce(talla, '') = coalesce(nullif(trim(p_talla), ''), '')
      and coalesce(color, '') = coalesce(v_color_nombre, '');

  if v_variante_id is null then
    v_codigo := retail.fn_componer_codigo_variante(v_base, v_color_id, p_talla);
    v_sku := coalesce(nullif(trim(p_sku), ''), nullif(trim(p_codigo_barras), ''), v_codigo);
    insert into variantes (producto_id, sku, codigo, talla, color, color_id, costo, precio)
      values (v_producto_id, v_sku, v_codigo, nullif(trim(p_talla), ''), v_color_nombre,
              v_color_id, coalesce(p_costo, 0), coalesce(p_precio, 0))
      returning id into v_variante_id;

    insert into codigos_barras (codigo, variante_id, origen, nota)
      values (v_codigo, v_variante_id, 'cayla', 'código corto CAYLA')
      on conflict (codigo) do nothing;
  end if;

  if nullif(trim(p_codigo_barras), '') is not null then
    perform retail.registrar_codigo_barras(v_variante_id, trim(p_codigo_barras), 'proveedor',
                                    'adoptado durante el conteo');
  end if;

  return retail.conteo_contar(p_conteo_id, v_variante_id, p_cantidad, 'sumar', p_contenedor_id);
end $$;
