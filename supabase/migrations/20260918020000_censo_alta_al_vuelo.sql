-- ============================================================================
-- Alta al vuelo durante el conteo/censo (Felipe, 2026-09-18)
--
-- EL PROBLEMA. `crear_producto_con_variantes` exige `fn_es_lider()` — "Solo
-- un líder puede dar de alta un producto nuevo". El censo real (300-900
-- prendas) lo cuentan las Encargadas, no un Líder parado al lado de cada
-- una. Con ese candado, cada prenda que el catálogo no reconoce detiene el
-- conteo hasta que alguien más la cree aparte en /productos/nuevo.
--
-- LA DECISIÓN (con Felipe, vía AskUserQuestion): mismo patrón proponer/
-- aprobar que ya usan colores/tallas/tejidos/patrones/etiquetas, no un
-- mecanismo nuevo (integridad conceptual — un problema, una solución en
-- todo el sistema). La Encargada crea, se cuenta YA (el conteo no espera),
-- un Líder revisa después.
--
-- `productos.estado` ('activo'/'descontinuado') es el ciclo de vida
-- comercial — no se toca. `estado_alta` es una dimensión nueva e
-- independiente: mientras está 'pendiente' el producto sigue con
-- estado='activo' por defecto (se cuenta y se puede vender, igual que un
-- color propuesto sigue siendo usable mientras se revisa) — si un Líder lo
-- "rechaza" (era un error de tipeo, un duplicado, etc.) recién ahí
-- estado pasa a 'descontinuado'.
-- ============================================================================

alter table retail.productos add column if not exists estado_alta text not null default 'aprobado'
  check (estado_alta in ('pendiente', 'aprobado', 'rechazado'));
alter table retail.productos add column if not exists propuesto_por uuid references public.personas (id);
alter table retail.productos add column if not exists aprobado_por uuid references public.personas (id);
alter table retail.productos add column if not exists aprobado_en timestamptz;

-- ---------------------------------------------------------------------------
-- Trigger de estado_alta — mismo mecanismo que fn_colores_estado_trigger /
-- fn_tejidos_estado_trigger (20260917100000/100100/120000). Corre en TODA
-- alta de producto (también las de Líder vía crear_producto_con_variantes):
-- si quien inserta es Líder, queda 'aprobado' de una — cero cambio de
-- comportamiento para el flujo que ya existe.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_productos_estado_alta_trigger()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  if tg_op = 'INSERT' then
    new.propuesto_por := v_persona;
    if retail.fn_es_lider() then
      new.estado_alta := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado_alta := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
    return new;
  end if;

  if new.estado_alta = 'aprobado' and old.estado_alta is distinct from 'aprobado' then
    if not retail.fn_es_lider() then
      raise exception 'Solo un líder puede aprobar una prenda dada de alta al vuelo.';
    end if;
    if old.estado_alta <> 'pendiente' then
      raise exception 'Solo se puede aprobar una prenda que está pendiente de revisión.';
    end if;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado_alta = 'rechazado' and old.estado_alta is distinct from 'rechazado' then
    if not retail.fn_es_lider() then
      raise exception 'Solo un líder puede rechazar una prenda dada de alta al vuelo.';
    end if;
    if old.estado_alta <> 'pendiente' then
      raise exception 'Solo se puede rechazar una prenda que está pendiente de revisión.';
    end if;
    -- A diferencia de un color/talla rechazado (que solo apaga `activo`),
    -- acá hay que apagar la venta/conteo real de la prenda: `estado` es lo
    -- que de verdad filtra /vender y /productos.
    new.estado := 'descontinuado';
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists productos_estado_alta_biut on retail.productos;
create trigger productos_estado_alta_biut
  before insert or update on retail.productos
  for each row execute function retail.fn_productos_estado_alta_trigger();

-- ---------------------------------------------------------------------------
-- censo_crear_variante — SIN el candado de líder de crear_producto_con_
-- variantes, a propósito: la puede llamar cualquier colaborador con sesión
-- que esté contando. Crea un producto de UNA sola variante (no matriz — en
-- pleno conteo no tiene sentido armar una grilla talla×color), la liga al
-- código de barras que se acaba de escanear (origen 'fabrica', igual que
-- cualquier código de fábrica real) y devuelve la forma exacta que espera
-- ConteoPanel para seguir contando sin recargar la página.
-- ---------------------------------------------------------------------------
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

  insert into productos (categoria_id, referencia)
    values (p_categoria_id, trim(p_referencia))
    returning id into v_producto_id;

  insert into variantes (producto_id, talla_id, color_codigo, precio, costo)
    values (v_producto_id, p_talla_id, p_color_codigo, p_precio, p_costo)
    returning id into v_variante_id;

  -- Código corto (BLU-0042-AZM-M) y su propio codigos_barras 'propio' —
  -- mismo trigger que usa cualquier alta desde /productos/nuevo.
  perform fn_asignar_codigo_variante(v_variante_id);

  insert into codigos_barras (codigo, variante_id, origen)
    values (v_codigo_barras, v_variante_id, 'fabrica');

  return query
    select v.id, v.sku, trim(p_referencia), t.valor, c.nombre, v.costo, v_codigo_barras
    from variantes v
      left join tallas t on t.id = v.talla_id
      left join colores c on c.codigo = v.color_codigo
    where v.id = v_variante_id;
end;
$$;

revoke execute on function retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric) from public;

-- ---------------------------------------------------------------------------
-- revisar_producto_censo — la puerta de aprobar/rechazar del Líder. La UPDATE
-- pasa por productos_estado_alta_biut de arriba, que ya exige fn_es_lider()
-- y valida la transición — este RPC solo evita que el frontend arme el
-- UPDATE a mano.
-- ---------------------------------------------------------------------------
create or replace function retail.revisar_producto_censo(p_producto_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update productos
    set estado_alta = case when p_aprobar then 'aprobado' else 'rechazado' end
    where id = p_producto_id;
  if not found then
    raise exception 'Esa prenda no existe';
  end if;
end;
$$;

revoke execute on function retail.revisar_producto_censo(uuid, boolean) from public;
