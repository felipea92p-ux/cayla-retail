-- ============================================================================
-- 0055 — Importar un catálogo completo en una sola transacción
--
-- QUÉ ARREGLA
--   Hasta acá el importador lee, mapea y resuelve valores sin tocar la base. Este
--   es el paso que escribe. Y el único camino que existía para dar de alta un
--   producto —`crear_producto_con_variantes` (0033)— es de a uno: para 900
--   productos son 900 round-trips a São Paulo (~322 ms cada uno, ADR-0013),
--   cinco minutos mirando una barra. Y si el 600 falla, quedan 599 a medias.
--
-- LA DECISIÓN: UN SOLO RPC, TODO O NADA
--   `importar_catalogo` recibe el catálogo entero como JSON y lo escribe en UNA
--   transacción. O entra todo, o no entra nada. No hay estado intermedio donde
--   la mitad de las prendas existe y la otra mitad no (principio 2).
--
-- SIEMBRA EL VOCABULARIO, NO SOLO LAS PRENDAS
--   Los colores y categorías nuevos del cliente se crean acá mismo, con SU
--   nombre, colgando del término universal que el paso anterior les asignó
--   (ADR-0030). El código de 3 letras y la familia —que `colores` y `categorias`
--   exigen— se derivan: el código, del nombre; la familia, del universal. Nadie
--   tiene que inventarlos a mano para 40 colores.
--
-- EL STOCK ARRANCA EN CERO, a propósito (decisión de Felipe, 2026-09-10). El
--   catálogo entra; las cantidades las levanta el censo (ADR-0027). Por eso este
--   RPC no escribe en `movimientos`: solo crea catálogo, y eso es lo que hace
--   posible deshacerlo sin reescribir historia.
--
-- DESHACER ES DESCONTINUAR, NUNCA BORRAR
--   `deshacer_importacion` marca `estado = 'descontinuada'` en los productos de
--   esa importación. Como nacieron con stock 0 y sin movimientos, no hay nada que
--   revertir en el inventario — es un regalo directo de que el stock arranque en
--   cero. Los colores y categorías creados se conservan: son vocabulario, y un
--   vocabulario que desaparece deja huérfano lo que otra importación pudo usar.
-- ============================================================================

-- ---------- 1. auditoría: qué se importó, cuándo, quién, con qué plan ----------
create table importaciones (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references personas (id),
  origen text not null,                -- 'inventario.xlsx · hoja "Stock"'
  /** El plan de mapeo aplicado, tal cual. Con él se puede reimportar el mismo
   *  archivo sin volver a pagar una llamada al modelo, y se puede ver DESPUÉS
   *  qué se interpretó como qué si algo salió raro. */
  plan jsonb not null,
  productos_creados integer not null default 0,
  variantes_creadas integer not null default 0,
  colores_creados integer not null default 0,
  categorias_creadas integer not null default 0,
  estado text not null default 'aplicada' check (estado in ('aplicada', 'deshecha')),
  deshecha_en timestamptz,
  created_at timestamptz not null default now()
);

alter table productos add column importacion_id uuid references importaciones (id);
create index productos_importacion_idx on productos (importacion_id) where importacion_id is not null;

-- ---------- 2. atributos ricos por producto ----------
-- Tejido, patrón, cuello, largo de manga… lo que el archivo del cliente traiga
-- y que alimenta las sugerencias de la IA sobre el catálogo (lo pidió Felipe).
-- Tabla aparte y NO catorce columnas en `productos`: la lista de atributos la
-- dicta el estándar universal por categoría, y cambia con cada release.
create table producto_atributos (
  producto_id uuid not null references productos (id) on delete cascade,
  atributo_id text not null references taxonomia_atributos (id),
  /** Uno de los dos: el valor universal si calzó, o el texto libre si no. */
  valor_id text references taxonomia_valores (id),
  valor_texto text,
  primary key (producto_id, atributo_id),
  check (valor_id is not null or valor_texto is not null)
);

alter table importaciones enable row level security;
alter table producto_atributos enable row level security;
create policy importaciones_select on importaciones for select using (auth.role() = 'authenticated');
create policy producto_atributos_select on producto_atributos for select using (auth.role() = 'authenticated');

-- ---------- 3. código de 3 letras que no choque ----------
-- `colores.codigo` y `categorias.prefijo` exigen exactamente 3 mayúsculas
-- únicas. Los 30 colores y 37 categorías de CAYLA los escribió Felipe a mano en
-- 0046 y 0047; para los 40 colores de un cliente nuevo eso no escala. Se
-- derivan del nombre: primero las consonantes (TRRACOTA → TRR), y si choca se
-- prueban variantes hasta encontrar uno libre. Un código derivado es tan
-- arbitrario como uno inventado — lo único que importa es que sea único y no
-- cambie después, y las dos cosas las garantiza la base.
create or replace function fn_codigo_tres_letras(p_nombre text, p_tabla text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_letras text;
  v_cons text;
  v_candidato text;
  v_existe boolean;
  i integer;
begin
  -- Solo letras, sin acentos, en mayúsculas.
  v_letras := upper(translate(regexp_replace(coalesce(p_nombre, ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]', '', 'g'),
                              'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN'));
  if length(v_letras) < 2 then
    v_letras := rpad(v_letras, 3, 'X');
  end if;

  -- Candidato 1: primera letra + dos consonantes siguientes (VERDE JADE → VRD).
  v_cons := substr(v_letras, 1, 1) || regexp_replace(substr(v_letras, 2), '[AEIOU]', '', 'g');
  v_candidato := rpad(substr(v_cons, 1, 3), 3, 'X');

  for i in 0..30 loop
    if p_tabla = 'colores' then
      select exists(select 1 from colores where codigo = v_candidato) into v_existe;
    else
      select exists(select 1 from categorias where prefijo = v_candidato) into v_existe;
    end if;
    if not v_existe then return v_candidato; end if;

    -- Choca: se van probando ventanas del nombre y, al final, un sufijo numérico.
    if i < length(v_letras) - 2 then
      v_candidato := substr(v_letras, i + 2, 3);
    else
      v_candidato := substr(v_cons, 1, 2) || chr(65 + (i % 26));
    end if;
    v_candidato := rpad(upper(v_candidato), 3, 'X');
  end loop;

  raise exception 'No encontré un código de 3 letras libre para "%"', p_nombre;
end;
$$;

-- ---------- 4. la familia se deriva del universal ----------
-- `colores.familia_color` y `categorias.familia` son NOT NULL con CHECK. Se
-- derivan del término universal al que el valor quedó anclado: si "Terracota"
-- cuelga de "Marrón", es familia tierra. Sin universal (el modelo no clasificó),
-- cae en el cajón neutro / accesorios — visible, no inventado.
create or replace function fn_familia_color_de_universal(p_valor_id text)
returns text
language sql
stable
set search_path = public
as $$
  select case v.handle
    when 'color__blue' then 'azul'  when 'color__navy' then 'azul'
    when 'color__red' then 'rojo'   when 'color__pink' then 'rojo'
    when 'color__orange' then 'amarillo' when 'color__yellow' then 'amarillo'
    when 'color__green' then 'verde'
    when 'color__purple' then 'morado'
    when 'color__brown' then 'tierra'
    when 'color__bronze' then 'metalico' when 'color__gold' then 'metalico'
    when 'color__silver' then 'metalico' when 'color__rose-gold' then 'metalico'
    when 'color__multicolor' then 'estampado'
    else 'neutro'
  end
  from taxonomia_valores v where v.id = p_valor_id
  union all select 'neutro' limit 1;
$$;

create or replace function fn_familia_de_universal(p_categoria_id text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_categoria_id like 'aa-1-%' or p_categoria_id like 'aa-3-%' then 'indumentaria'
    when p_categoria_id like 'aa-6-%' then 'bisuteria'
    when p_categoria_id like 'aa-7-%' or p_categoria_id like 'aa-8-%' then 'calzado'
    when p_categoria_id like 'hb-%' then 'belleza'
    when p_categoria_id like 'os-%' then 'papeleria'
    else 'accesorios'
  end;
$$;

-- ---------- 5. el RPC ----------
-- p_catalogo:
-- {
--   "origen": "inventario.xlsx · hoja Stock",
--   "plan": { ...el plan de mapeo... },
--   "colores":    [{ "nombre": "Terracota", "taxonomiaValorId": "10" }],
--   "categorias": [{ "nombre": "Kimonos", "taxonomiaCategoriaId": "aa-1-23-1" }],
--   "productos":  [{
--     "referencia": "Kimono estampado", "categoria": "Kimonos",
--     "marca": "", "genero": "", "temporada": "", "descripcion": "",
--     "variantes": [{ "codigoCliente": "0012", "talla": "U", "color": "Verde jade",
--                     "costo": 0, "precio": 159 }]
--   }]
-- }
create or replace function importar_catalogo(p_catalogo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_importacion_id uuid;
  v_item jsonb;
  v_prod jsonb;
  v_var jsonb;
  v_producto_id uuid;
  v_variante_id uuid;
  v_categoria_id uuid;
  v_color_codigo text;
  v_color_nombre text;
  v_sku_padre text;
  v_sku text;
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

  select id into v_persona_id from personas where auth_user_id = auth.uid() limit 1;

  insert into importaciones (persona_id, origen, plan)
    values (v_persona_id, coalesce(p_catalogo ->> 'origen', '(sin origen)'), coalesce(p_catalogo -> 'plan', '{}'::jsonb))
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

    -- sku_padre es unique: slug de la referencia, y un sufijo si ya existía.
    -- Es el identificador viejo (0047 explica por qué ya no es la etiqueta); el
    -- código corto y parlante lo asigna fn_asignar_codigo_producto abajo.
    v_sku_padre := regexp_replace(upper(trim(v_prod ->> 'referencia')), '[^A-Z0-9]+', '-', 'g');
    v_sku_padre := trim(both '-' from v_sku_padre);
    if exists (select 1 from productos where sku_padre = v_sku_padre) then
      v_sku_padre := v_sku_padre || '-' || substr(v_importacion_id::text, 1, 4);
    end if;

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
      -- lo lee), y `color_id` es la FK de verdad.
      v_color_codigo := null;
      v_color_nombre := nullif(trim(v_var ->> 'color'), '');
      if v_color_nombre is not null then
        select codigo, nombre into v_color_codigo, v_color_nombre from colores
          where fn_clave_texto(nombre) = fn_clave_texto(v_color_nombre) limit 1;
      end if;

      -- sku: el código del cliente si viene y está libre; si no, derivado.
      v_sku := nullif(trim(v_var ->> 'codigoCliente'), '');
      if v_sku is null or exists (select 1 from variantes where sku = v_sku) then
        v_sku := v_sku_padre || '-' || coalesce(nullif(trim(v_var ->> 'talla'), ''), 'U')
                 || '-' || coalesce(v_color_codigo, 'SC');
        if exists (select 1 from variantes where sku = v_sku) then
          v_sku := v_sku || '-' || substr(gen_random_uuid()::text, 1, 4);
        end if;
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
      -- Solo si hay color normalizado: ADR-0025, el código no se inventa.
      if v_color_codigo is not null then
        perform fn_asignar_codigo_variante(v_variante_id);
      end if;
    end loop;
  end loop;

  update importaciones
    set productos_creados = v_n_prod, variantes_creadas = v_n_var,
        colores_creados = v_n_col, categorias_creadas = v_n_cat
    where id = v_importacion_id;

  return jsonb_build_object(
    'importacionId', v_importacion_id,
    'productos', v_n_prod, 'variantes', v_n_var,
    'colores', v_n_col, 'categorias', v_n_cat
  );
end;
$$;

-- ---------- 6. deshacer ----------
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

  update productos set estado = 'descontinuada', updated_at = now()
    where importacion_id = p_importacion_id and estado = 'activa';
  get diagnostics v_n = row_count;

  update importaciones set estado = 'deshecha', deshecha_en = now() where id = p_importacion_id;

  return jsonb_build_object('descontinuados', v_n);
end;
$$;
