-- ============================================================================
-- 20260918230300 — Crear producto con etiquetas, todo o nada
--
-- El formulario nuevo (ADR-0109) tiene un bloque opcional de etiquetas de
-- catálogo al final. Hoy las etiquetas se aplican por variante en una llamada
-- aparte (`actualizar_variantes_etiquetas`): si el alta sale bien y esa
-- segunda llamada falla, queda un producto creado SIN sus etiquetas y quien lo
-- creó no se entera hasta que busca "Nueva colección" y no aparece.
--
-- DECIDÍ: `crear_producto_con_variantes` recibe `p_etiqueta_ids` y las aplica
-- a todas las variantes en la misma transacción. Las etiquetas por variante
-- distinta siguen siendo cosa de `actualizar_variantes_etiquetas` desde el
-- detalle del producto.
-- DESCARTÉ: dos llamadas desde el navegador (alta + etiquetas): no hay
-- forma de hacerlas atómicas desde el cliente.
-- SE ROMPE SI alguien manda una etiqueta que fue desactivada o rechazada entre
-- que abrió el formulario y lo guardó: falla con frase clara y no crea nada.
--
-- Mismo patrón que 20260918230100: se borra la firma de 8 argumentos antes de
-- crear la de 9 (dos sobrecargas ya rompieron producción dos veces). Las
-- llamadas de 7 u 8 argumentos siguen resolviendo contra la nueva.
-- ============================================================================

drop function if exists retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean);

create or replace function retail.crear_producto_con_variantes(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false,
  p_etiqueta_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto_id uuid;
  v_item jsonb;
  v_talla_id uuid;
  v_color text;
  v_precio numeric;
  v_costo numeric;
  v_clave text;
  v_claves text[] := '{}';
  v_ref text;
  v_familia_nombre text;
  v_exige boolean;
  v_par_id uuid;
  v_par_ref text;
  v_par_nivel text;
  v_etiquetas uuid[];
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede dar de alta un producto nuevo';
  end if;

  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta la referencia del producto';
  end if;
  v_ref := fn_titulo_referencia(p_referencia);
  if fn_clave_referencia(v_ref) is null then
    raise exception 'El nombre del producto necesita al menos una letra o un número.';
  end if;
  if not exists (select 1 from categorias where id = p_categoria_id and activo) then
    raise exception 'Elige una categoría activa del catálogo';
  end if;
  if p_variantes is null or jsonb_array_length(p_variantes) = 0 then
    raise exception 'El producto necesita al menos una variante (talla y/o color)';
  end if;

  -- Reintento con el mismo token: devuelve el producto ya creado. Va ANTES
  -- del chequeo de nombre: si no, el reintento se toparía con su propio
  -- producto y fallaría como "duplicado".
  if p_token is not null then
    select id into v_producto_id from productos where token_cliente = p_token;
    if found then return v_producto_id; end if;
  end if;

  -- Un nombre, un producto: idéntico bloquea siempre; una letra de diferencia
  -- bloquea salvo confirmación explícita; el resto lo avisa la pantalla.
  select b.id, b.referencia, b.nivel into v_par_id, v_par_ref, v_par_nivel
    from buscar_productos_parecidos(v_ref) b
    where b.nivel in ('identico', 'una_letra')
    order by (b.nivel = 'identico') desc
    limit 1;
  if v_par_nivel = 'identico' then
    raise exception 'Ya existe un producto llamado "%". Búscalo en Productos en vez de crearlo otra vez.', v_par_ref
      using hint = 'nombre_duplicado', detail = v_par_id::text;
  end if;
  if v_par_nivel = 'una_letra' and not coalesce(p_confirmo_distinto, false) then
    raise exception 'Ya existe "%", que se escribe casi igual. Si es el mismo producto, ábrelo; si es otro de verdad, confírmalo.', v_par_ref
      using hint = 'nombre_casi_igual', detail = v_par_id::text;
  end if;

  -- Exigencias de la familia (Indumentaria: tejido y patrón obligatorios).
  select f.exige_tejido_patron, f.nombre into v_exige, v_familia_nombre
    from categorias c left join familias f on f.codigo = c.familia
    where c.id = p_categoria_id;
  if coalesce(v_exige, false) then
    if not exists (select 1 from categoria_tejidos where categoria_id = p_categoria_id) then
      raise exception 'Esta categoría no tiene tejidos habilitados y % exige tejido. Habilítalos en Catálogo → Categorías.', v_familia_nombre
        using hint = 'categoria_sin_tejidos';
    end if;
    if not exists (select 1 from categoria_patrones where categoria_id = p_categoria_id) then
      raise exception 'Esta categoría no tiene patrones habilitados y % exige patrón. Habilítalos en Catálogo → Categorías.', v_familia_nombre
        using hint = 'categoria_sin_patrones';
    end if;
    if p_tejido_id is null then
      raise exception 'En % el tejido es obligatorio.', v_familia_nombre using hint = 'tejido_obligatorio';
    end if;
    if p_patron_id is null then
      raise exception 'En % el patrón es obligatorio (si es sin diseño, elige Liso).', v_familia_nombre using hint = 'patron_obligatorio';
    end if;
  end if;

  if p_tejido_id is not null then
    if not exists (select 1 from tejidos where id = p_tejido_id and activo) then
      raise exception 'Uno de los tejidos elegidos ya no está activo en el vocabulario';
    end if;
    if not exists (select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id) then
      raise exception 'Ese tejido no está habilitado para la categoría elegida';
    end if;
  end if;
  if p_patron_id is not null then
    if not exists (select 1 from patrones where id = p_patron_id and activo) then
      raise exception 'Uno de los patrones elegidos ya no está activo en el vocabulario';
    end if;
    if not exists (select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id) then
      raise exception 'Ese patrón no está habilitado para la categoría elegida';
    end if;
  end if;

  -- Etiquetas de catálogo (opcionales): se aplican a TODAS las variantes del
  -- producto nuevo, dentro de esta misma transacción. Sin esto, aplicarlas en
  -- una segunda llamada dejaría, si esa falla, un producto sin sus etiquetas
  -- y sin aviso. Solo etiquetas aprobadas y activas: una propuesta pendiente
  -- todavía no es vocabulario.
  select coalesce(array_agg(distinct e), '{}'::uuid[]) into v_etiquetas from unnest(coalesce(p_etiqueta_ids, '{}'::uuid[])) e;
  if exists (
    select 1 from unnest(v_etiquetas) e
    where not exists (select 1 from etiquetas x where x.id = e and x.activo and x.estado = 'aprobado')
  ) then
    raise exception 'Una de las etiquetas elegidas ya no está disponible en el catálogo. Recarga la pantalla.';
  end if;

  for v_item in select * from jsonb_array_elements(p_variantes) loop
    v_talla_id := nullif(v_item ->> 'talla_id', '')::uuid;
    v_color := nullif(trim(v_item ->> 'color_codigo'), '');
    v_precio := (v_item ->> 'precio')::numeric;
    v_costo := coalesce((v_item ->> 'costo')::numeric, 0);

    if v_precio is null or v_precio < 0 then
      raise exception 'Cada variante necesita un precio de venta (0 o más)';
    end if;
    if v_costo < 0 then
      raise exception 'El costo no puede ser negativo';
    end if;
    if v_color is not null and not exists (
      select 1 from colores where codigo = v_color and activo
    ) then
      raise exception 'Uno de los colores elegidos ya no está activo en el vocabulario';
    end if;
    if v_talla_id is not null then
      if not exists (select 1 from tallas where id = v_talla_id and activo) then
        raise exception 'Una de las tallas elegidas ya no está activa en el vocabulario';
      end if;
      if not exists (select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id) then
        raise exception 'Una de las tallas elegidas no está habilitada para esta categoría';
      end if;
    end if;

    v_clave := coalesce(v_talla_id::text, '') || '|' || coalesce(v_color, '');
    if v_clave = any(v_claves) then
      raise exception 'Repetiste la misma combinación de talla y color — cada celda de la matriz va una sola vez';
    end if;
    v_claves := array_append(v_claves, v_clave);
  end loop;

  insert into productos (categoria_id, referencia, descripcion, token_cliente, tejido_id, patron_id)
    values (p_categoria_id, v_ref, nullif(trim(p_descripcion), ''), p_token, p_tejido_id, p_patron_id)
    returning id into v_producto_id;

  insert into variantes (producto_id, talla_id, color_codigo, precio, costo)
  select
    v_producto_id,
    nullif(item ->> 'talla_id', '')::uuid,
    nullif(trim(item ->> 'color_codigo'), ''),
    (item ->> 'precio')::numeric,
    coalesce((item ->> 'costo')::numeric, 0)
  from jsonb_array_elements(p_variantes) as item;

  if array_length(v_etiquetas, 1) > 0 then
    insert into variante_etiquetas (variante_id, etiqueta_id)
      select v.id, e from variantes v cross join unnest(v_etiquetas) e where v.producto_id = v_producto_id;
  end if;

  return v_producto_id;
end;
$$;

revoke execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[]) from public, anon;
grant execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[]) to authenticated;
