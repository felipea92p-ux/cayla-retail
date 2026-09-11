-- ============================================================================
-- 0057 — importar_catalogo y deshacer_importacion, corregidos tras la revisión
--
-- QUÉ ARREGLA
--   La revisión adversarial del 2026-09-11 (141 agentes sobre el importador)
--   encontró cinco formas en que `importar_catalogo` (0056) escribía mal o
--   abortaba con un error crudo, y una en que `deshacer_importacion` deshacía
--   lo que no debía. Ninguna apareció con el archivo de prueba; todas aparecen
--   con archivos reales. Se redefinen las dos funciones enteras — 0056 ya está
--   aplicada en producción, así que sus tablas quedan y solo cambian las
--   funciones — y se agrega UNA columna.
--
-- 1. REINTENTAR NO DUPLICA (token de idempotencia)
--   Importar 900 prendas tarda segundos; si la conexión se corta después de que
--   la base confirmó pero antes de que el navegador reciba la respuesta, la
--   persona ve "no se pudo hablar con el servidor" y vuelve a apretar. La
--   segunda vez el catálogo entero entraba OTRA VEZ, con `sku_padre` sufijado
--   para esquivar el unique. El mismo problema que ADR-0034 resolvió en ventas,
--   la misma solución: la pantalla manda un `token` por intento, y si ya hay
--   una importación con ese token se devuelve la que existe.
--
-- 2. sku_padre: SUFIJO QUE SE PRUEBA, NO UN FRAGMENTO DE UUID
--   El sufijo anterior eran 4 chars del uuid de la importación — IGUAL para
--   todos los productos de la misma importación—, así que dos referencias que
--   slugueaban igual ("Blusa V" / "Blusa-V") chocaban entre sí y abortaban todo.
--
-- 3. EL CÓDIGO DEL CLIENTE NO PISA UN CÓDIGO DE BARRAS AJENO
--   `sku` solo se comprobaba contra `variantes.sku`, pero
--   `fn_asignar_codigo_variante` lo registra también en `codigos_barras`, que
--   es unique. Si el cliente traía un código que ya era el código de barras de
--   OTRA prenda, el insert en codigos_barras hacía `on conflict do nothing` y
--   escanear ese código llevaba a la prenda equivocada. Ahora se comprueba en
--   las dos tablas.
--
-- 4. UNA VARIANTE SIN COLOR TAMBIÉN RECIBE CÓDIGO
--   Solo se llamaba a `fn_asignar_codigo_variante` cuando había color
--   normalizado; una correa o un gorro sin color quedaban sin código y sin
--   etiqueta. La función ya sabe tratar ese caso (0047: BASE-TALLA, sin
--   segmento de color) y devuelve null —sin asignar— cuando el color existe
--   pero no está normalizado. Se llama siempre.
--
-- 5. UN COLOR QUE NO ESTÁ EN EL VOCABULARIO NO SE PIERDE
--   `select codigo, nombre into v_color_codigo, v_color_nombre` deja AMBAS en
--   null si no encuentra fila: el texto del color del archivo desaparecía en
--   silencio. Se conserva el texto; `color_id` queda null y la variante se ve
--   como "color sin normalizar", que es la verdad.
--
-- 6. DESHACER RESPETA UN CONTEO ABIERTO
--   Descontinuar prendas que un conteo abierto ya contó dejaba líneas apuntando
--   a productos descontinuados, y el cierre las ajustaría igual. Se avisa, como
--   ya se hacía con `movimientos`.
-- ============================================================================

-- ---------- 1. token de idempotencia ----------
alter table importaciones add column token uuid;
create unique index importaciones_token_unico on importaciones (token) where token is not null;
comment on column importaciones.token is
  'Lo genera la pantalla por intento. Reintentar con el mismo token devuelve esta importación en vez de repetirla.';

-- ---------- 2. el RPC ----------
create or replace function importar_catalogo(p_catalogo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_importacion_id uuid;
  v_token uuid;
  v_previa importaciones%rowtype;
  v_item jsonb;
  v_prod jsonb;
  v_var jsonb;
  v_producto_id uuid;
  v_variante_id uuid;
  v_categoria_id uuid;
  v_color_codigo text;
  v_color_nombre text;
  v_color_canonico text;
  v_sku_padre text;
  v_sku_base text;
  v_sku text;
  v_n integer;
  v_n_prod integer := 0;
  v_n_var integer := 0;
  v_n_col integer := 0;
  v_n_cat integer := 0;
  v_universal text;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede importar un catálogo';
  end if;
  if p_catalogo is null or jsonb_array_length(coalesce(p_catalogo -> 'productos', '[]'::jsonb)) = 0 then
    raise exception 'El catálogo no tiene productos';
  end if;

  -- Reintento del mismo intento: se devuelve lo que ya entró, sin tocar nada.
  v_token := nullif(trim(p_catalogo ->> 'token'), '')::uuid;
  if v_token is not null then
    select * into v_previa from importaciones where token = v_token;
    if found then
      return jsonb_build_object(
        'importacionId', v_previa.id,
        'productos', v_previa.productos_creados, 'variantes', v_previa.variantes_creadas,
        'colores', v_previa.colores_creados, 'categorias', v_previa.categorias_creadas,
        'repetida', true
      );
    end if;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid() limit 1;

  insert into importaciones (persona_id, origen, plan, token)
    values (v_persona_id, coalesce(p_catalogo ->> 'origen', '(sin origen)'), coalesce(p_catalogo -> 'plan', '{}'::jsonb), v_token)
    returning id into v_importacion_id;

  -- --- colores nuevos: con SU nombre, colgando del universal ---
  for v_item in select * from jsonb_array_elements(coalesce(p_catalogo -> 'colores', '[]'::jsonb)) loop
    v_color_nombre := trim(v_item ->> 'nombre');
    if v_color_nombre = '' then continue; end if;
    -- Si ya existe (por clave normalizada, igual que el índice único), no se
    -- duplica: el paso anterior ya lo cruzó, pero dos importaciones seguidas
    -- del mismo cliente traerían el mismo color dos veces.
    if exists (select 1 from colores where fn_clave_texto(nombre) = fn_clave_texto(v_color_nombre)) then
      continue;
    end if;
    v_universal := nullif(trim(v_item ->> 'taxonomiaValorId'), '');
    insert into colores (codigo, nombre, familia_color, orden, taxonomia_valor_id)
      values (
        fn_codigo_tres_letras(v_color_nombre, 'colores'),
        v_color_nombre,
        fn_familia_color_de_universal(v_universal),
        200,  -- después de los 30 de CAYLA, que van del 10 al 100
        v_universal
      );
    v_n_col := v_n_col + 1;
  end loop;

  -- --- categorías nuevas ---
  for v_item in select * from jsonb_array_elements(coalesce(p_catalogo -> 'categorias', '[]'::jsonb)) loop
    if coalesce(trim(v_item ->> 'nombre'), '') = '' then continue; end if;
    if exists (select 1 from categorias where fn_clave_texto(nombre) = fn_clave_texto(v_item ->> 'nombre')) then
      continue;
    end if;
    v_universal := nullif(trim(v_item ->> 'taxonomiaCategoriaId'), '');
    insert into categorias (familia, nombre, prefijo, taxonomia_categoria_id)
      values (
        fn_familia_de_universal(v_universal),
        trim(v_item ->> 'nombre'),
        fn_codigo_tres_letras(v_item ->> 'nombre', 'categorias'),
        v_universal
      );
    v_n_cat := v_n_cat + 1;
  end loop;

  -- --- productos y variantes ---
  for v_prod in select * from jsonb_array_elements(p_catalogo -> 'productos') loop
    if coalesce(trim(v_prod ->> 'referencia'), '') = '' then
      raise exception 'Hay un producto sin referencia';
    end if;
    if jsonb_array_length(coalesce(v_prod -> 'variantes', '[]'::jsonb)) = 0 then
      raise exception 'El producto "%" no tiene ninguna variante', v_prod ->> 'referencia';
    end if;

    -- La categoría por nombre normalizado. Null si no la trae o no existe: el
    -- producto entra igual, sin categoría, y se ve en el catálogo como tal.
    v_categoria_id := null;
    if coalesce(trim(v_prod ->> 'categoria'), '') <> '' then
      select id into v_categoria_id from categorias
        where fn_clave_texto(nombre) = fn_clave_texto(v_prod ->> 'categoria') limit 1;
    end if;

    -- sku_padre es unique: slug de la referencia, y si ya existía, un sufijo
    -- numérico que se prueba hasta encontrar uno libre (cabecera, punto 2).
    -- Es el identificador viejo (0047 explica por qué ya no es la etiqueta); el
    -- código corto y parlante lo asigna fn_asignar_codigo_producto abajo.
    v_sku_base := trim(both '-' from
      regexp_replace(upper(trim(v_prod ->> 'referencia')), '[^A-Z0-9]+', '-', 'g'));
    if v_sku_base = '' then v_sku_base := 'REF'; end if;
    v_sku_padre := v_sku_base;
    v_n := 1;
    while exists (select 1 from productos where sku_padre = v_sku_padre) loop
      v_n := v_n + 1;
      if v_n > 999 then
        raise exception 'No encontré un sku_padre libre para "%"', v_sku_base;
      end if;
      v_sku_padre := v_sku_base || '-' || v_n;
    end loop;

    insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada, descripcion, importacion_id)
      values (
        v_sku_padre,
        trim(v_prod ->> 'referencia'),
        v_categoria_id,
        nullif(trim(v_prod ->> 'genero'), ''),
        nullif(trim(v_prod ->> 'marca'), ''),
        nullif(trim(v_prod ->> 'temporada'), ''),
        nullif(trim(v_prod ->> 'descripcion'), ''),
        v_importacion_id
      )
      returning id into v_producto_id;
    v_n_prod := v_n_prod + 1;

    for v_var in select * from jsonb_array_elements(v_prod -> 'variantes') loop
      -- El color por nombre normalizado → su código. El texto se guarda igual
      -- en `variantes.color` (0046: texto desnormalizado para no romper lo que
      -- lo lee), y `color_id` es la FK de verdad. Si no está en el vocabulario
      -- se conserva el texto del archivo (cabecera, punto 5).
      v_color_codigo := null;
      v_color_canonico := null;
      v_color_nombre := nullif(trim(v_var ->> 'color'), '');
      if v_color_nombre is not null then
        select codigo, nombre into v_color_codigo, v_color_canonico from colores
          where fn_clave_texto(nombre) = fn_clave_texto(v_color_nombre) limit 1;
        if v_color_canonico is not null then v_color_nombre := v_color_canonico; end if;
      end if;

      -- sku: el código del cliente si viene y está libre EN LAS DOS TABLAS que
      -- lo hacen escaneable (cabecera, punto 3); si no, derivado.
      v_sku := nullif(trim(v_var ->> 'codigoCliente'), '');
      if v_sku is null
         or exists (select 1 from variantes where sku = v_sku)
         or exists (select 1 from codigos_barras where codigo = v_sku) then
        v_sku_base := v_sku_padre || '-' || coalesce(nullif(trim(v_var ->> 'talla'), ''), 'U')
                      || '-' || coalesce(v_color_codigo, 'SC');
        v_sku := v_sku_base;
        v_n := 1;
        while exists (select 1 from variantes where sku = v_sku)
           or exists (select 1 from codigos_barras where codigo = v_sku) loop
          v_n := v_n + 1;
          v_sku := v_sku_base || '-' || v_n;
        end loop;
      end if;

      insert into variantes (producto_id, sku, talla, color, color_id, costo, precio)
        values (
          v_producto_id,
          v_sku,
          nullif(trim(v_var ->> 'talla'), ''),
          v_color_nombre,
          v_color_codigo,
          coalesce((v_var ->> 'costo')::numeric, 0),
          coalesce((v_var ->> 'precio')::numeric, 0)
        )
        returning id into v_variante_id;
      v_n_var := v_n_var + 1;

      -- El código corto y parlante (BLU-0042-AZM-M), el que va en la etiqueta.
      -- Siempre se intenta: sin color da BASE-TALLA; con color sin normalizar
      -- devuelve null y no inventa nada (0047, ADR-0025).
      perform fn_asignar_codigo_variante(v_variante_id);
    end loop;
  end loop;

  update importaciones
    set productos_creados = v_n_prod, variantes_creadas = v_n_var,
        colores_creados = v_n_col, categorias_creadas = v_n_cat
    where id = v_importacion_id;

  return jsonb_build_object(
    'importacionId', v_importacion_id,
    'productos', v_n_prod, 'variantes', v_n_var,
    'colores', v_n_col, 'categorias', v_n_cat,
    'repetida', false
  );
end;
$$;

-- ---------- 3. deshacer ----------
create or replace function deshacer_importacion(p_importacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede deshacer una importación';
  end if;
  if not exists (select 1 from importaciones where id = p_importacion_id and estado = 'aplicada') then
    raise exception 'Esa importación no existe o ya fue deshecha';
  end if;
  -- Una prenda importada que ya tuvo movimiento (se vendió, se contó) no se
  -- puede descontinuar a ciegas: alguien la usó. Se avisa en vez de decidir.
  if exists (
    select 1 from movimientos m join variantes v on v.id = m.variante_id
    join productos p on p.id = v.producto_id where p.importacion_id = p_importacion_id
  ) then
    raise exception 'Alguna prenda de esta importación ya tiene movimientos; no se puede deshacer en bloque';
  end if;
  -- Lo mismo con un conteo abierto que ya la contó: el cierre ajustaría stock
  -- de prendas descontinuadas (cabecera, punto 6).
  if exists (
    select 1 from conteo_lineas l
    join conteos c on c.id = l.conteo_id and c.estado = 'abierto'
    join variantes v on v.id = l.variante_id
    join productos p on p.id = v.producto_id
    where p.importacion_id = p_importacion_id
  ) then
    raise exception 'Hay un conteo abierto que ya contó prendas de esta importación; ciérralo o anúlalo primero';
  end if;

  update productos set estado = 'descontinuada', updated_at = now()
    where importacion_id = p_importacion_id and estado = 'activa';
  get diagnostics v_n = row_count;

  update importaciones set estado = 'deshecha', deshecha_en = now() where id = p_importacion_id;

  return jsonb_build_object('descontinuados', v_n);
end;
$$;
