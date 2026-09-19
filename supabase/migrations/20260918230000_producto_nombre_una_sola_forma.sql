-- ============================================================================
-- 20260918230000 — El nombre de un producto se escribe de UNA sola forma
--
-- EL PROBLEMA (verificado en producción, 2026-09-18)
--   `productos.referencia` no tiene ningún candado: solo `codigo` es único.
--   "Blusa Aurora" puede existir tres veces y la base lo acepta. Y hay TRES
--   caminos que crean productos —`crear_producto_con_variantes` (Nuevo
--   producto), `catalogo_crear_producto` y `censo_crear_variante` (alta al
--   vuelo)— así que una regla que viva solo en un formulario deja los otros
--   dos abiertos. El censo es el peor: crea UN producto por cada escaneo, sin
--   buscar si el nombre ya existe. Escanear "Blusa Aurora" en S y luego en M
--   deja dos productos, con el stock partido y dos tarjetas en la caja.
--
-- DECIDÍ (con Felipe, 2026-09-18)
--   1. Un trigger sobre `productos` normaliza el nombre a "tipo título"
--      (Blusa Camila, Chompa con Rayas — conectores en minúscula). Vive en la
--      tabla y no en el formulario: los tres caminos lo obedecen.
--   2. Un índice único sobre la CLAVE del nombre (sin tildes, mayúsculas,
--      espacios ni puntuación) hace imposible el idéntico. Es la red de
--      seguridad: las RPC avisan antes, con frase humana; esto es lo que
--      queda si alguna se salta el aviso.
--   3. `buscar_productos_parecidos` alimenta el aviso en vivo del formulario:
--      idéntico / una letra de diferencia / parecido.
--   4. `censo_crear_variante` deja de crear un producto por escaneo: si el
--      nombre ya existe en la MISMA categoría, cuelga la variante del
--      producto que ya existe. Sin esto el índice del punto 2 rompería el
--      conteo a mitad de la jornada.
--
-- DESCARTÉ
--   * Cambiar `fn_clave_texto`: la usan colores, tallas y familias como
--     candado único. Alterarla cambiaría en silencio qué se considera "el
--     mismo nombre" en esas tres tablas. Se crea `fn_clave_referencia`, que
--     además ignora la puntuación (pedido: "Top Lily." = "Top Lily").
--   * La extensión `fuzzystrmatch` para medir "una letra de diferencia": un
--     comparador lineal de 20 líneas hace lo mismo sin dependencia nueva en
--     el proyecto compartido con Dynamic.
--   * Reescribir los 44 nombres existentes: el trigger solo actúa cuando
--     `referencia` cambia, nada existente se toca.
--
-- SE ROMPE SI
--   * Dos prendas legítimas se llaman igual salvo una letra (Top Lily / Top
--     Lili): el aviso bloquea, y por eso `crear_producto_con_variantes`
--     (20260918230100) trae la salida deliberada `p_confirmo_distinto`.
--   * Se agrega un cuarto camino de creación que inserte en `productos`
--     sin pasar por el trigger: imposible, el trigger está en la tabla.
--
-- VERIFICADO EN PRODUCCIÓN ANTES DE ESCRIBIR ESTO: los 44 productos actuales
-- no tienen ningún par con la misma clave, así que el índice entra limpio.
-- ============================================================================

-- ---------- clave de comparación: solo letras y números, sin tildes ----------
create or replace function retail.fn_clave_referencia(p text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      lower(translate(lower(coalesce(p, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
      '[^a-z0-9]+', '', 'g'),
    '');
$$;

comment on function retail.fn_clave_referencia(text) is
  'Clave para decidir si dos nombres de producto son el mismo: minúsculas, sin tildes, sin espacios ni puntuación. NO usar para mostrar. Distinta de fn_clave_texto a propósito (esa conserva los espacios y la usan colores/tallas/familias).';

-- ---------- forma de escritura: tipo título, conectores en minúscula ----------
create or replace function retail.fn_titulo_referencia(p text)
returns text
language plpgsql
immutable
as $$
declare
  v_palabras text[];
  v_salida text[] := '{}';
  v_w text;
  v_i integer := 0;
  v_conectores constant text[] :=
    array['de', 'del', 'la', 'las', 'el', 'los', 'con', 'y', 'e', 'o', 'en', 'al', 'para', 'por', 'sin'];
begin
  -- [[:space:]] y no trim(): trim() solo quita el espacio, y un tab o un NBSP en el borde
  -- dejaría una «palabra» vacía al partir (y la TS `.trim()` sí los recorta: espejo roto).
  v_palabras := regexp_split_to_array(regexp_replace(coalesce(p, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[[:space:]]+');
  foreach v_w in array v_palabras loop
    v_i := v_i + 1;
    -- translate() primero: en una base con locale C, lower/upper no tocan las tildes.
    v_w := lower(translate(v_w, 'ÁÉÍÓÚÜÑ', 'áéíóúüñ'));
    if v_i > 1 and v_w = any (v_conectores) then
      v_salida := v_salida || v_w;
    else
      v_salida := v_salida || (upper(translate(left(v_w, 1), 'áéíóúüñ', 'ÁÉÍÓÚÜÑ')) || substr(v_w, 2));
    end if;
  end loop;
  return nullif(array_to_string(v_salida, ' '), '');
end;
$$;

comment on function retail.fn_titulo_referencia(text) is
  'Forma única de escribir el nombre de un producto: "blusa  camila" -> "Blusa Camila". Conectores (de, con, y...) en minúscula salvo al inicio.';

-- ---------- ¿difieren en a lo sumo UNA edición (sobra, falta o cambia una letra)? ----------
-- Recibe las CLAVES (fn_clave_referencia), no los nombres. Recorrido lineal,
-- sin matriz: los nombres miden menos de 60 caracteres y se compara contra
-- todo el catálogo en cada aviso. Un intercambio de dos letras (Camial /
-- Camila) cuenta como 2 ediciones: cae en "parecido", que solo avisa.
create or replace function retail.fn_dentro_de_una_edicion(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  la integer := coalesce(length(a), 0);
  lb integer := coalesce(length(b), 0);
  i integer := 1;
  j integer := 1;
  dif integer := 0;
begin
  if abs(la - lb) > 1 then
    return false;
  end if;
  while i <= la and j <= lb loop
    if substr(a, i, 1) = substr(b, j, 1) then
      i := i + 1;
      j := j + 1;
    else
      dif := dif + 1;
      if dif > 1 then
        return false;
      end if;
      if la = lb then
        i := i + 1;
        j := j + 1;
      elsif la > lb then
        i := i + 1;
      else
        j := j + 1;
      end if;
    end if;
  end loop;
  return dif + (la - i + 1) + (lb - j + 1) <= 1;
end;
$$;

comment on function retail.fn_dentro_de_una_edicion(text, text) is
  'true si dos claves difieren en 0 o 1 edición. Idénticas también devuelven true: quien llama distingue con igualdad.';

-- ---------- el trigger: la forma única vive en la tabla, no en el formulario ----------
create or replace function retail.fn_productos_referencia_trigger()
returns trigger
language plpgsql
as $$
begin
  new.referencia := retail.fn_titulo_referencia(new.referencia);
  if retail.fn_clave_referencia(new.referencia) is null then
    raise exception 'El nombre del producto necesita al menos una letra o un número.';
  end if;
  return new;
end;
$$;

drop trigger if exists productos_referencia_biu on retail.productos;
create trigger productos_referencia_biu
  before insert or update of referencia on retail.productos
  for each row execute function retail.fn_productos_referencia_trigger();

-- ---------- la red de seguridad: un nombre, un producto ----------
-- Parcial: una prenda RECHAZADA por el Líder en el censo (era un error de
-- tipeo o un duplicado) no debe bloquear volver a crearla bien escrita.
create unique index if not exists productos_referencia_clave_unica
  on retail.productos (retail.fn_clave_referencia(referencia))
  where estado_alta <> 'rechazado';

-- ---------- «rechazado» es terminal: una prenda rechazada NO puede volver a estar activa ----------
-- El índice de arriba (y buscar_productos_parecidos) dejan de mirar los productos
-- con estado_alta = 'rechazado', para que una alta al vuelo mal escrita no bloquee
-- volver a crearla bien. Eso solo es seguro si un rechazado NUNCA se vende: hoy
-- `productos_estado_alta_biut` lo apaga (estado = 'descontinuado') al rechazarlo,
-- pero nada impedía después reactivarlo por Editar → Estado → Activo, y quedaban dos
-- productos activos con el mismo nombre, uno invisible para el candado (revisión
-- adversarial del PR, hallazgo confirmado). Se cierra desde el esquema, no con una
-- validación de pantalla. Si un Líder rechazó por error, lo correcto es volver a crear
-- la prenda (Nuevo producto pasa por el candado de nombre).
alter table retail.productos drop constraint if exists productos_rechazado_descontinuado_check;
alter table retail.productos
  add constraint productos_rechazado_descontinuado_check
  check (estado_alta <> 'rechazado' or estado = 'descontinuado');

-- ---------- el aviso en vivo: qué se parece a lo que estoy escribiendo ----------
-- security INVOKER a propósito: solo ve lo que su RLS le deja ver de `productos`.
-- `nivel` decide qué hace la pantalla: 'identico' bloquea del todo,
-- 'una_letra' bloquea salvo confirmación del Líder, 'parecido' solo avisa.
create or replace function retail.buscar_productos_parecidos(p_referencia text, p_excluir_id uuid default null)
returns table (id uuid, referencia text, categoria_id uuid, categoria text, nivel text, similitud real)
language sql
stable
set search_path = retail, public, extensions
as $$
  with q as (
    select retail.fn_clave_referencia(p_referencia) as k, retail.fn_clave_texto(p_referencia) as t
  ),
  cand as (
    select
      p.id,
      p.referencia,
      p.categoria_id,
      c.nombre as categoria,
      case
        when retail.fn_clave_referencia(p.referencia) = q.k then 'identico'
        when retail.fn_dentro_de_una_edicion(retail.fn_clave_referencia(p.referencia), q.k) then 'una_letra'
        else 'parecido'
      end as nivel,
      similarity(retail.fn_clave_texto(p.referencia), q.t) as similitud
    from retail.productos p
      join retail.categorias c on c.id = p.categoria_id
      cross join q
    where q.k is not null
      and p.estado_alta <> 'rechazado'
      and (p_excluir_id is null or p.id <> p_excluir_id)
  )
  select id, referencia, categoria_id, categoria, nivel, similitud
  from cand
  where nivel <> 'parecido' or similitud >= 0.5
  order by case nivel when 'identico' then 0 when 'una_letra' then 1 else 2 end, similitud desc, referencia
  limit 5;
$$;

comment on function retail.buscar_productos_parecidos(text, uuid) is
  'Hasta 5 productos cuyo nombre se parece al que se está escribiendo. nivel: identico (bloquea) | una_letra (bloquea salvo confirmación) | parecido (solo avisa, trigram >= 0.5).';

revoke execute on function retail.buscar_productos_parecidos(text, uuid) from public, anon;
grant execute on function retail.buscar_productos_parecidos(text, uuid) to authenticated;

-- ---------- censo: si el nombre ya existe en la misma categoría, se suma la variante ----------
-- Misma firma y mismo retorno que 20260918020000: ConteoPanel no cambia.
-- Antes: cada escaneo creaba un producto nuevo. Ahora: nombre existente en la
-- misma categoría = la variante se cuelga de ese producto; en OTRA categoría =
-- error (un nombre, un producto en todo el catálogo).
create or replace function retail.censo_crear_variante(
  p_referencia text,
  p_categoria_id uuid,
  p_codigo_barras text,
  p_talla_id uuid default null,
  p_color_codigo text default null,
  p_costo numeric default 0,
  p_precio numeric default 0
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
    -- `is distinct from` y no `<>`: el producto «Cargo especial» no tiene categoría (null) y `null <> x` da null,
    -- lo que dejaba colgarle variantes reales al producto técnico de la caja.
    if v_producto_cat is distinct from p_categoria_id then
      raise exception 'Ya existe "%" en otra categoría — un nombre identifica a un solo producto. Búscalo en el catálogo o cambia el nombre.', v_ref;
    end if;
    -- ¿La variante ya existe (misma talla y color)? Es otro código de barras
    -- para lo mismo: lo frena el índice variantes_producto_talla_color_unico,
    -- y error-escritura.ts lo traduce a frase humana (mismo commit).
  else
    begin
      insert into productos (categoria_id, referencia)
        values (p_categoria_id, trim(p_referencia))
        returning id, productos.referencia into v_producto_id, v_ref;
    exception when unique_violation then
      -- Dos escaneos del mismo nombre nuevo casi a la vez: el segundo pierde la carrera contra el índice
      -- único. No es un error de la persona: se cuelga del producto que el primero acaba de crear.
      select pr.id, pr.categoria_id, pr.referencia into v_producto_id, v_producto_cat, v_ref
        from productos pr
        where retail.fn_clave_referencia(pr.referencia) = retail.fn_clave_referencia(p_referencia)
          and pr.estado_alta <> 'rechazado';
      if not found or v_producto_cat is distinct from p_categoria_id then
        raise;
      end if;
    end;
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

-- Mismo candado que la migración original: cualquier colaborador con sesión,
-- nunca anónimo.
revoke execute on function retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric) from public;
grant execute on function retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric) to authenticated;
