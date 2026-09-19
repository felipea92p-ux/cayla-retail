-- ============================================================================
-- 20260918230100 — Árbol de creación de producto: curva habitual y exigencias
--
-- Tres piezas que el formulario nuevo necesita y que tienen que vivir en la
-- base, no en la pantalla (principio 2: si la base deja un estado imposible,
-- el diseño está mal):
--
--   1. `categoria_tallas.habitual` — qué tallas vienen MARCADAS al elegir la
--      categoría (la curva normal: Jeans 28-30-32 de las 26-34 posibles). No
--      es un ajuste de pantalla: es la decisión de Felipe de cómo compra y
--      fabrica Cayla, y tiene que ser la misma en Nuevo producto, en el censo
--      y en la orden de producción.
--   2. `familias.exige_tejido_patron` — en Indumentaria tejido y patrón son
--      obligatorios (una blusa sin tejido no se guarda). Columna y no un
--      `if familia = 'indumentaria'` en el código: mañana Calzado puede exigir
--      material sin tocar una línea de TypeScript.
--   3. `crear_producto_con_variantes` — la RPC hace cumplir (1 y 2) y el
--      candado de nombre de 20260918230000, con frase humana y `hint` estable
--      para que la pantalla sepa QUÉ mostrar (bloqueo, o "sí, es otro").
--
-- Y una corrección que no estaba en el pedido y pesa más que las tres:
-- `actualizar_categoria_ejes` BORRA y reinserta todas las tallas de la
-- categoría en cada guardado. Sin tocarla, cada vez que un Líder editara una
-- categoría se perdería la curva habitual en silencio. Ahora conserva la
-- curva si quien llama no manda una nueva.
--
-- DESCARTÉ guardar la curva en una tabla aparte (`categoria_curva`): otra
-- tabla para una sola marca booleana sobre una fila que ya existe; la curva
-- es siempre un SUBCONJUNTO de las tallas de la categoría y una columna lo
-- garantiza sin FK extra.
--
-- SE ROMPE SI un Líder marca como habitual una talla que la categoría ya no
-- ofrece: `actualizar_categoria_ejes` lo rechaza (la habitual debe estar
-- dentro de las tallas enviadas).
-- ============================================================================

alter table retail.categoria_tallas add column if not exists habitual boolean not null default false;
comment on column retail.categoria_tallas.habitual is
  'true = viene marcada de antemano al crear un producto de esta categoría (la curva normal). Siempre un subconjunto de las tallas que la categoría ofrece.';

alter table retail.familias add column if not exists exige_tejido_patron boolean not null default false;
comment on column retail.familias.exige_tejido_patron is
  'true = crear un producto de esta familia exige elegir tejido y patrón (Indumentaria). Lo hace cumplir crear_producto_con_variantes.';

update retail.familias set exige_tejido_patron = true where codigo = 'indumentaria';

-- ---------- actualizar_categoria_ejes: conserva la curva habitual ----------
-- p_talla_habitual_ids = null  -> se conserva lo que ya estaba marcado (quien
--   llama con los 4 argumentos de antes no pierde nada).
-- p_talla_habitual_ids = array -> esa es la curva nueva; debe estar dentro de
--   p_talla_ids.
drop function if exists retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[]);

create or replace function retail.actualizar_categoria_ejes(
  p_categoria_id uuid,
  p_talla_ids uuid[],
  p_tejido_ids uuid[],
  p_patron_ids uuid[],
  p_talla_habitual_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_habituales_previas uuid[];
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar qué tallas/tejidos/patrones ofrece una categoría.';
  end if;

  if not exists (select 1 from retail.categorias where id = p_categoria_id) then
    raise exception 'Esa categoría ya no existe. Recarga la pantalla.';
  end if;

  if p_talla_habitual_ids is not null and exists (
    select 1 from unnest(p_talla_habitual_ids) h
    where h <> all (coalesce(p_talla_ids, '{}'::uuid[]))
  ) then
    raise exception 'Una talla marcada como habitual no está entre las tallas de la categoría.';
  end if;

  select coalesce(array_agg(talla_id), '{}'::uuid[]) into v_habituales_previas
    from retail.categoria_tallas where categoria_id = p_categoria_id and habitual;

  delete from retail.categoria_tallas where categoria_id = p_categoria_id;
  if p_talla_ids is not null and array_length(p_talla_ids, 1) > 0 then
    insert into retail.categoria_tallas (categoria_id, talla_id, habitual)
      select p_categoria_id, t,
             t = any (coalesce(p_talla_habitual_ids, v_habituales_previas))
      from (select distinct unnest(p_talla_ids) as t) x;
  end if;

  delete from retail.categoria_tejidos where categoria_id = p_categoria_id;
  if p_tejido_ids is not null and array_length(p_tejido_ids, 1) > 0 then
    insert into retail.categoria_tejidos (categoria_id, tejido_id)
      select distinct p_categoria_id, t from unnest(p_tejido_ids) as t;
  end if;

  delete from retail.categoria_patrones where categoria_id = p_categoria_id;
  if p_patron_ids is not null and array_length(p_patron_ids, 1) > 0 then
    insert into retail.categoria_patrones (categoria_id, patron_id)
      select distinct p_categoria_id, t from unnest(p_patron_ids) as t;
  end if;
end;
$$;

revoke execute on function retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[], uuid[]) to authenticated;

-- ---------- crear_producto_con_variantes: nombre único + exigencias de familia ----------
-- Se BORRA la firma vieja antes de crear la nueva: dos sobrecargas con
-- parámetros opcionales distintos ya rompieron producción dos veces en este
-- repo (resolver_prenda_danada, aprobar_devolucion — ver SESIONES-ACTIVAS).
--
-- `p_confirmo_distinto`: la salida deliberada del Líder cuando el nombre
-- difiere en UNA letra de otro producto ("Top Lily" / "Top Lili"). El
-- IDÉNTICO nunca se salta. Errores con `hint` estable:
--   nombre_duplicado    — idéntico a uno existente (detail = id del existente)
--   nombre_casi_igual   — una letra de diferencia (detail = id del existente)
--   tejido_obligatorio / patron_obligatorio / categoria_sin_tejidos / categoria_sin_patrones
drop function if exists retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid);

create or replace function retail.crear_producto_con_variantes(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false
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

  return v_producto_id;
end;
$$;

revoke execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean) from public, anon;
grant execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean) to authenticated;
