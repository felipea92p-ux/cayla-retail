-- ============================================================================
-- 20260917210000_catalogo_actualizar_producto_recupera_color_codigo_fotos.sql — CAYLA V2
--
-- INCIDENTE (2026-09-17, tarde-noche): Felipe subió 3 fotos nuevas a "Blusa
-- Ximena" (Blanco/Naranja/Negro) desde `/productos/[id]/editar` y ninguna se
-- mostraba en la Grilla — solo seguía apareciendo la de Verde (la única que
-- no había tocado). Confirmado contra producción: las 3 fotos SÍ se subieron
-- bien a Storage y SÍ quedaron en `producto_fotos`, pero con
-- `color_codigo = NULL` — `fn_productos` (`pf.color_codigo IS NOT DISTINCT
-- FROM v.color_codigo`) nunca las emparejaba con ninguna variante (todas
-- tienen color real, ninguna es NULL).
--
-- CAUSA RAÍZ. `20260917190000_producto_fotos_por_color.sql` (esta misma
-- sesión, más temprano hoy) sí dejó `catalogo_actualizar_producto` leyendo
-- `color_codigo` de cada foto, en sus dos ramas (actualizar fila existente /
-- insertar fila nueva) — firma de 9 parámetros. Otra sesión (Taxonomía de
-- variante — tejido/patrón, PR todavía sin mergear a `main`, aplicada
-- directo a producción con su propio ok puntual) recreó esta misma función
-- para agregarle `p_tejido_id`/`p_patron_id` (firma de 11), pero partió de
-- una versión ANTERIOR a `20260917190000` — perdió sin querer el manejo de
-- `color_codigo` en las dos ramas de fotos. No fue una sobrecarga duplicada
-- (ver `20260917200000`, otro incidente de hoy) — acá la firma es una sola,
-- el bug estaba en el CUERPO.
--
-- QUÉ CAMBIA. `CREATE OR REPLACE` sobre la misma firma de 11 parámetros que
-- ya vive en producción (sin `DROP`, no hace falta — la firma no cambia,
-- cero riesgo de sobrecarga). Se restaura `color_codigo = nullif(v_fila.foto
-- ->>'color_codigo', '')` en la rama de `UPDATE` (foto ya existente, id
-- presente) y en el `INSERT` (foto nueva) — exactamente lo que ya tenía
-- `20260917190000`, ahora conviviendo con `tejido_id`/`patron_id`. Nada de
-- variantes/tejido/patrón se tocó.
--
-- Aplicada en producción primero (ok puntual de Felipe: "Sí, hazlo"), este
-- archivo es el registro. Reconectadas también las 3 fotos de Blusa Ximena
-- que habían quedado con color_codigo NULL (UPDATE puntual por nombre de
-- archivo, no parte de esta migración — dato, no esquema).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.catalogo_actualizar_producto(
  p_producto_id uuid,
  p_referencia text,
  p_estado text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  p_fotos jsonb default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null
)
returns void
language plpgsql
set search_path to 'retail', 'public'
as $function$
declare
  v_variante jsonb;
  v_id uuid;
  v_fila record;
  v_foto_id uuid;
  v_ids_mantener uuid[];
  v_ya_principal boolean := false;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false),
        tejido_id = p_tejido_id,
        patron_id = p_patron_id
    where id = p_producto_id;

  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    -- Ya no se exige SKU: las prendas del censo nacen sin él
    -- (crear_producto_con_variantes) y exigirlo acá las dejaba sin poder
    -- editarse nunca más. Ver cabecera de 20260915150001.
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      -- Variante existente: solo precio, costo y activo cambian. Color,
      -- talla, sku y codigo son la identidad de la prenda — ver el
      -- encabezado de 20260915150001_catalogo_alta_edicion.sql.
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      -- Variante nueva: SKU vacío → NULL, nunca '' (índice único de sku:
      -- dos '' chocan, dos NULL no).
      insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        nullif(v_variante->>'talla', ''),
        nullif(trim(v_variante->>'sku'), ''),
        (v_variante->>'precio')::numeric,
        coalesce((v_variante->>'costo')::numeric, 0)
      );
    end if;
  end loop;

  if p_fotos is not null then
    v_ids_mantener := array(
      select (f->>'id')::uuid
      from jsonb_array_elements(p_fotos) f
      where f->>'id' is not null
    );

    delete from producto_fotos
      where producto_id = p_producto_id
        and not (id = any(v_ids_mantener));

    -- Todas a false antes de volver a marcar como mucho una — el índice
    -- único parcial `producto_fotos_principal_unico` no es diferible, y
    -- actualizar fila por fila sin este paso deja un instante con dos `true`
    -- a la vez si la principal nueva no es la misma fila que la vieja.
    update producto_fotos set es_principal = false
      where producto_id = p_producto_id;

    for v_fila in
      select f.value as foto, (f.ordinality - 1)::integer as orden
      from jsonb_array_elements(p_fotos) with ordinality as f(value, ordinality)
    loop
      if coalesce(nullif(trim(v_fila.foto->>'url'), ''), '') = '' then
        raise exception 'Una foto llegó sin URL.';
      end if;
      v_foto_id := nullif(v_fila.foto->>'id', '')::uuid;

      if v_foto_id is not null then
        update producto_fotos
          set orden = v_fila.orden,
              es_principal = (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
              color_codigo = nullif(v_fila.foto->>'color_codigo', '')
          where id = v_foto_id and producto_id = p_producto_id;
      else
        insert into producto_fotos (producto_id, url, orden, es_principal, color_codigo)
        values (
          p_producto_id,
          v_fila.foto->>'url',
          v_fila.orden,
          (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
          nullif(v_fila.foto->>'color_codigo', '')
        );
      end if;

      if coalesce((v_fila.foto->>'es_principal')::boolean, false) then
        v_ya_principal := true;
      end if;
    end loop;

    if not v_ya_principal then
      update producto_fotos set es_principal = true
        where id = (select id from producto_fotos where producto_id = p_producto_id order by orden limit 1);
    end if;
  end if;
end;
$function$;

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) is
  'Edición de producto+variantes+fotos+tejido/patrón para /productos/[id]/editar (V2). Fotos: p_fotos null = no tocar la galería; [] = vaciarla; con elementos = reemplazo completo (id presente = fila existente, ausente = nueva), cada una con color_codigo? opcional (20260917190000, recuperado en 20260917210000 tras perderse al sumar tejido/patrón).';
