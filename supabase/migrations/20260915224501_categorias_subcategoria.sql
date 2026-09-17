-- ============================================================================
-- Categorías: subcategoría opcional (un solo nivel) + notas internas
--
-- QUÉ RESUELVE. Hasta hoy `categorias` es un solo nivel plano dentro de cada
-- familia (Vestidos, Pantalones, Blusas...). Para catálogos grandes hace
-- falta un nivel más fino sin abrir la puerta a un árbol infinito: "Vestidos
-- largos" adentro de "Vestidos", nada más profundo que eso.
--
-- EL CANDADO REAL, NO CONFIANZA EN EL CLIENTE (principio 2). Una categoría
-- que ya tiene padre no puede a su vez ser padre de otra, y una categoría
-- que ya es padre no puede convertirse en hija — ambos casos los rechaza
-- `retail.fn_valida_categoria_subcategoria`, no el formulario. Sin este
-- candado en la base, un segundo camino de escritura (Studio, otra pantalla
-- futura) podría armar un árbol de 3 niveles sin que nadie se diera cuenta.
--
-- FAMILIA SIEMPRE HEREDADA DEL PADRE. Una hija no puede vivir en una familia
-- distinta a la de su padre — si se permitiera, "Vestidos largos" podría
-- aparecer en la sección "Calzado" mientras "Vestidos" vive en
-- "Indumentaria", separados en la pantalla que agrupa por familia
-- (CategoriasLista.tsx). El mismo trigger la re-deriva sola en cada
-- insert/update, así que ninguna pantalla necesita acertarle a mano.
--
-- OPT-IN DE VERDAD. `categoria_padre_id` nullable, default null: una
-- categoría sin hijas (la inmensa mayoría hoy) no cambia en nada — mismas
-- columnas que ya leía, mismo comportamiento.
-- ============================================================================

alter table retail.categorias
  add column if not exists categoria_padre_id uuid references retail.categorias (id),
  add column if not exists notas text;

create index if not exists categorias_padre_idx on retail.categorias (categoria_padre_id);

comment on column retail.categorias.categoria_padre_id is
  'Subcategoría opcional (ej. "Vestidos largos" bajo "Vestidos"). NULL = categoría de primer nivel, comportamiento idéntico a antes de esta columna. Un solo nivel: retail.fn_valida_categoria_subcategoria lo hace cumplir, y la familia se hereda siempre del padre.';
comment on column retail.categorias.notas is
  'Notas internas de la categoría (nunca se muestran a la clienta). Nullable.';

-- ---------- el candado de un solo nivel + familia heredada ----------
create or replace function retail.fn_valida_categoria_subcategoria()
returns trigger
language plpgsql as $$
declare
  v_padre_tiene_padre boolean;
  v_padre_familia text;
  v_tiene_hijas boolean;
begin
  if new.categoria_padre_id is null then
    return new;
  end if;

  if new.categoria_padre_id = new.id then
    raise exception 'Una categoría no puede ser su propia categoría padre.';
  end if;

  select categoria_padre_id is not null, familia
    into v_padre_tiene_padre, v_padre_familia
    from retail.categorias where id = new.categoria_padre_id;

  if v_padre_tiene_padre is null then
    raise exception 'La categoría padre elegida ya no existe. Recarga la pantalla.';
  end if;
  if v_padre_tiene_padre then
    raise exception 'Esa categoría ya es una subcategoría: solo se admite un nivel, no puede a su vez tener hijas.';
  end if;

  select exists(
    select 1 from retail.categorias
     where categoria_padre_id = new.id and id is distinct from new.id
  ) into v_tiene_hijas;
  if v_tiene_hijas then
    raise exception 'Esta categoría ya tiene subcategorías propias: no puede convertirse en subcategoría de otra (un solo nivel).';
  end if;

  -- La familia de una hija siempre es la del padre — se re-deriva acá en
  -- vez de confiar en lo que mande el formulario.
  new.familia := v_padre_familia;

  return new;
end;
$$;

comment on function retail.fn_valida_categoria_subcategoria() is
  'Un solo nivel de subcategoría (el padre no puede a su vez tener padre; quien ya tiene hijas no puede convertirse en hija) y familia siempre heredada del padre. Corre en cada insert/update de retail.categorias — no confía en que el cliente nunca mande un valor inválido (CLAUDE.md).';

drop trigger if exists categorias_valida_subcategoria on retail.categorias;
create trigger categorias_valida_subcategoria
  before insert or update on retail.categorias
  for each row execute function retail.fn_valida_categoria_subcategoria();

-- ---------- edición: agrega notas internas ----------
-- `create or replace` no puede sumar un parámetro por el medio; se dropea y
-- recrea para evitar cualquier ambigüedad de sobrecarga entre la firma vieja
-- (4 args) y la nueva (5), aunque el nuevo venga con default.
drop function if exists retail.actualizar_categoria(uuid, text, text, text);

create function retail.actualizar_categoria(
  p_categoria_id uuid,
  p_nombre text,
  p_familia text,
  p_prefijo text,
  p_notas text default null
) returns void
language plpgsql security definer set search_path = retail, public as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_prefijo_actual text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar una categoría.';
  end if;
  if v_nombre is null then
    raise exception 'La categoría necesita un nombre.';
  end if;

  select prefijo into v_prefijo_actual from retail.categorias where id = p_categoria_id;
  if not found then
    raise exception 'Esa categoría ya no existe. Recarga la pantalla.';
  end if;

  -- El prefijo queda fijo apenas una prenda lo usa: es la letra del código
  -- corto (BLU-0042-AZM-M) y ese código ya puede estar impreso o etiquetado.
  if v_prefijo_actual is distinct from p_prefijo
     and exists (select 1 from retail.productos where categoria_id = p_categoria_id) then
    raise exception 'El prefijo "%" no se puede cambiar: ya hay productos creados con esta categoría.', v_prefijo_actual;
  end if;

  update retail.categorias
    set nombre = v_nombre,
        familia = p_familia,
        prefijo = p_prefijo,
        notas = nullif(btrim(coalesce(p_notas, '')), '')
    where id = p_categoria_id;
  -- Si esta fila es una hija, el trigger de arriba vuelve a pisar `familia`
  -- con la del padre, así que un valor de familia inconsistente enviado acá
  -- nunca llega a guardarse.
end;
$$;

comment on function retail.actualizar_categoria(uuid, text, text, text, text) is
  'Edita nombre/familia/prefijo/notas de una categoría. El prefijo se rechaza si ya hay productos con esa categoria_id (fijo hacia adelante, decidido con Felipe 2026-09-15). Formato de familia/prefijo, unicidad de nombre y el candado de un solo nivel los cierran los checks/índices/trigger de la tabla.';

grant execute on function retail.actualizar_categoria(uuid, text, text, text, text) to authenticated;
