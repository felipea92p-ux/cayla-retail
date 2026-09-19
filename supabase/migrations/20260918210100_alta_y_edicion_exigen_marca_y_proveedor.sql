-- ============================================================================
-- 20260918210100 — Alta y edición de productos exigen marca y proveedor
--
-- Sigue a 20260918210000 (que dejó marca_id/proveedor_id NOT NULL). Las tres
-- puertas por las que entra o se cambia un producto hablan ahora de marca y
-- proveedor, con UNA sola regla ("el proveedor trae esa marca") en
-- `fn_validar_marca_proveedor` — no tres copias que se desincronicen:
--   · crear_producto_con_variantes  → obligatorios.
--   · censo_crear_variante          → obligatorios SOLO al crear un producto
--                                     nuevo (Felipe: "el censo también los pide");
--                                     si el nombre ya existe, la variante se cuelga
--                                     del que hay y no se toca su marca.
--   · catalogo_actualizar_producto  → sin mandarlos no cambian; mandándolos, la
--                                     pareja tiene que ser válida. Además, la
--                                     edición hereda las reglas de nombre y de
--                                     familia (Felipe: "darle las mismas reglas").
--
-- LO QUE ESTA FUNCIÓN DE EDICIÓN NO VALIDABA NADA de lo construido en
-- 20260918200000-200300: ni el nombre al renombrar, ni tejido/patrón en
-- Indumentaria. Se agrega, con dos matices deliberados:
--   · el nombre solo se compara si cambia de VERDAD (otra clave): pasar de
--     "blusa aurora" a "Blusa Aurora" no es un nombre nuevo;
--   · tejido/patrón solo se exigen a un producto ACTIVO: para descontinuar una
--     prenda vieja no se le pide un dato que nunca tuvo.
--
-- COMPATIBILIDAD: los parámetros nuevos van al final con default, y se borra
-- cada firma vieja antes de crear la nueva (dos sobrecargas ya rompieron
-- producción dos veces en este repo). Una llamada vieja sin marca falla con
-- una frase clara ("Elige la marca del producto"), no con un error de Postgres.
-- ============================================================================

create or replace function retail.fn_validar_marca_proveedor(p_marca_id uuid, p_proveedor_id uuid)
returns void
language plpgsql
stable
set search_path = retail, public
as $$
begin
  if p_marca_id is null then
    raise exception 'Elige la marca del producto.' using hint = 'marca_obligatoria';
  end if;
  if p_proveedor_id is null then
    raise exception 'Elige el proveedor del producto.' using hint = 'proveedor_obligatorio';
  end if;
  if not exists (select 1 from marcas where id = p_marca_id and activo) then
    raise exception 'Esa marca ya no está activa. Recarga la pantalla.' using hint = 'marca_invalida';
  end if;
  if not exists (select 1 from proveedores where id = p_proveedor_id and activo) then
    raise exception 'Ese proveedor ya no está activo. Recarga la pantalla.' using hint = 'proveedor_invalido';
  end if;
  if not exists (select 1 from marca_proveedores where marca_id = p_marca_id and proveedor_id = p_proveedor_id) then
    raise exception 'Ese proveedor no trae esa marca. Agrégalo a la marca en Catálogo → Marcas.' using hint = 'marca_proveedor_invalido';
  end if;
end;
$$;

comment on function retail.fn_validar_marca_proveedor(uuid, uuid) is
  'La regla única de "marca y proveedor": ambos presentes, activos, y una pareja registrada en marca_proveedores. La usan el alta, el censo y la edición. Hints estables: marca_obligatoria, proveedor_obligatorio, marca_invalida, proveedor_invalido, marca_proveedor_invalido.';

drop function if exists retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[]);
create or replace function retail.crear_producto_con_variantes(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false,
  p_etiqueta_ids uuid[] default null,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null
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
  -- Marca y proveedor obligatorios, y una pareja registrada (una sola regla, en fn_validar_marca_proveedor).
  perform fn_validar_marca_proveedor(p_marca_id, p_proveedor_id);
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

  insert into productos (categoria_id, referencia, descripcion, token_cliente, tejido_id, patron_id, marca_id, proveedor_id)
    values (p_categoria_id, v_ref, nullif(trim(p_descripcion), ''), p_token, p_tejido_id, p_patron_id, p_marca_id, p_proveedor_id)
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

grant execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid) to authenticated;

drop function if exists retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric);

create or replace function retail.censo_crear_variante(
  p_referencia text,
  p_categoria_id uuid,
  p_codigo_barras text,
  p_talla_id uuid default null,
  p_color_codigo text default null,
  p_costo numeric default 0,
  p_precio numeric default 0,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null
)
returns table (variante_id uuid, sku text, referencia text, talla text, color text, costo numeric, codigo_barras text)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto_id uuid;
  v_producto_cat uuid;
  v_ref text;
  v_variante_id uuid;
  v_codigo_barras text := trim(p_codigo_barras);
begin
  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta el nombre de la prenda';
  end if;
  if not exists (select 1 from categorias where id = p_categoria_id and activo) then
    raise exception 'Elige una categoría activa del catálogo';
  end if;
  if coalesce(v_codigo_barras, '') = '' then
    raise exception 'Falta el código de barras escaneado';
  end if;
  if exists (select 1 from codigos_barras where codigo = v_codigo_barras) then
    raise exception 'Ese código de barras ya está registrado — vuelve a buscarlo, puede que ya exista en el catálogo.';
  end if;
  if p_precio < 0 then
    raise exception 'El precio de venta no puede ser negativo';
  end if;
  if p_costo < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if p_talla_id is not null then
    if not exists (select 1 from tallas where id = p_talla_id and activo) then
      raise exception 'Esa talla ya no está activa en el vocabulario';
    end if;
    if not exists (select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = p_talla_id) then
      raise exception 'Esa talla no está habilitada para esta categoría — pídele a un Líder que la habilite en Catálogo → Categorías';
    end if;
  end if;
  if p_color_codigo is not null and not exists (select 1 from colores where codigo = p_color_codigo and activo) then
    raise exception 'Ese color ya no está activo en el vocabulario';
  end if;

  select pr.id, pr.categoria_id, pr.referencia
    into v_producto_id, v_producto_cat, v_ref
    from productos pr
    where retail.fn_clave_referencia(pr.referencia) = retail.fn_clave_referencia(p_referencia)
      and pr.estado_alta <> 'rechazado';

  if found then
    if v_producto_cat <> p_categoria_id then
      raise exception 'Ya existe "%" en otra categoría — un nombre identifica a un solo producto. Búscalo en el catálogo o cambia el nombre.', v_ref;
    end if;
    -- ¿La variante ya existe (misma talla y color)? Es otro código de barras
    -- para lo mismo: lo frena el índice variantes_producto_talla_color_unico,
    -- y error-escritura.ts lo traduce a frase humana (mismo commit).
  else
    -- Solo cuando se CREA el producto: si el nombre ya existe, la variante se cuelga del que hay y su marca no se toca.
    perform fn_validar_marca_proveedor(p_marca_id, p_proveedor_id);
    insert into productos (categoria_id, referencia, marca_id, proveedor_id)
      values (p_categoria_id, trim(p_referencia), p_marca_id, p_proveedor_id)
      returning id, productos.referencia into v_producto_id, v_ref;
  end if;

  insert into variantes (producto_id, talla_id, color_codigo, precio, costo)
    values (v_producto_id, p_talla_id, p_color_codigo, p_precio, p_costo)
    returning id into v_variante_id;

  perform fn_asignar_codigo_variante(v_variante_id);

  insert into codigos_barras (codigo, variante_id, origen)
    values (v_codigo_barras, v_variante_id, 'fabrica');

  return query
    select v.id, v.sku, v_ref, t.valor, c.nombre, v.costo, v_codigo_barras
    from variantes v
      left join tallas t on t.id = v.talla_id
      left join colores c on c.codigo = v.color_codigo
    where v.id = v_variante_id;
end;
$$;

revoke execute on function retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric, uuid, uuid) from public;
grant execute on function retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric, uuid, uuid) to authenticated;

drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid);

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
  p_patron_id uuid default null,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null,
  p_confirmo_distinto boolean default false
)
returns void
language plpgsql
set search_path = retail, public
as $$
declare
  v_variante jsonb;
  v_id uuid;
  v_fila record;
  v_foto_id uuid;
  v_ids_mantener uuid[];
  v_ya_principal boolean := false;
  v_talla_id uuid;
  v_ref_actual text;
  v_ref_nueva text;
  v_marca_actual uuid;
  v_proveedor_actual uuid;
  v_par_id uuid;
  v_par_ref text;
  v_par_nivel text;
  v_exige boolean;
  v_familia_nombre text;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;

  select referencia, marca_id, proveedor_id into v_ref_actual, v_marca_actual, v_proveedor_actual
    from productos where id = p_producto_id;
  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  -- Renombrar: la misma regla de nombre que al crear. Solo si el nombre CAMBIA de verdad
  -- (una clave distinta): pasar de "blusa aurora" a "Blusa Aurora" no es un nombre nuevo.
  v_ref_nueva := fn_titulo_referencia(p_referencia);
  if fn_clave_referencia(v_ref_nueva) is null then
    raise exception 'El nombre del producto necesita al menos una letra o un número.';
  end if;
  if fn_clave_referencia(v_ref_nueva) is distinct from fn_clave_referencia(v_ref_actual) then
    select b.id, b.referencia, b.nivel into v_par_id, v_par_ref, v_par_nivel
      from buscar_productos_parecidos(v_ref_nueva, p_producto_id) b
      where b.nivel in ('identico', 'una_letra')
      order by (b.nivel = 'identico') desc
      limit 1;
    if v_par_nivel = 'identico' then
      raise exception 'Ya existe un producto llamado "%". Búscalo en Productos en vez de renombrar este.', v_par_ref
        using hint = 'nombre_duplicado', detail = v_par_id::text;
    end if;
    if v_par_nivel = 'una_letra' and not coalesce(p_confirmo_distinto, false) then
      raise exception 'Ya existe "%", que se escribe casi igual. Si es el mismo producto, ábrelo; si es otro de verdad, confírmalo.', v_par_ref
        using hint = 'nombre_casi_igual', detail = v_par_id::text;
    end if;
  end if;

  -- Marca y proveedor: sin mandar ninguno, no cambian. Mandando cualquiera, la pareja resultante
  -- tiene que ser válida (una sola regla, la misma que al crear).
  if p_marca_id is not null or p_proveedor_id is not null then
    perform fn_validar_marca_proveedor(coalesce(p_marca_id, v_marca_actual), coalesce(p_proveedor_id, v_proveedor_actual));
  end if;

  -- Exigencias de la familia (Indumentaria: tejido y patrón). Solo para un producto ACTIVO: para
  -- descontinuar una prenda vieja no se le debe pedir un dato que nunca tuvo.
  if p_estado = 'activo' then
    select f.exige_tejido_patron, f.nombre into v_exige, v_familia_nombre
      from categorias c left join familias f on f.codigo = c.familia
      where c.id = p_categoria_id;
    if coalesce(v_exige, false) then
      if p_tejido_id is null then
        raise exception 'En % el tejido es obligatorio.', v_familia_nombre using hint = 'tejido_obligatorio';
      end if;
      if p_patron_id is null then
        raise exception 'En % el patrón es obligatorio (si es sin diseño, elige Liso).', v_familia_nombre using hint = 'patron_obligatorio';
      end if;
    end if;
  end if;

  if p_tejido_id is not null and not exists (
    select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id
  ) then
    raise exception 'Ese tejido no está habilitado para la categoría elegida.';
  end if;
  if p_patron_id is not null and not exists (
    select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id
  ) then
    raise exception 'Ese patrón no está habilitado para la categoría elegida.';
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = v_ref_nueva,
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false),
        tejido_id = p_tejido_id,
        patron_id = p_patron_id,
        marca_id = coalesce(p_marca_id, marca_id),
        proveedor_id = coalesce(p_proveedor_id, proveedor_id)
    where id = p_producto_id;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      v_talla_id := nullif(v_variante->>'talla_id', '')::uuid;
      if v_talla_id is not null and not exists (
        select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id
      ) then
        raise exception 'Esa talla no está habilitada para la categoría elegida.';
      end if;

      insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        v_talla_id,
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
$$;

grant execute on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid, uuid, uuid, boolean) to authenticated;
