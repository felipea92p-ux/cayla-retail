-- ============================================================================
-- Categorías: editar, desactivar/reactivar, y el candado de nombre real
--
-- EL HUECO QUE ESTO CIERRA. `apps/web/app/api/productos/categorias/route.ts`
-- solo tenía POST (alta) desde que se portó de V1 — no había forma de
-- corregir un nombre mal tipeado ni de retirar una categoría sin borrarla
-- (CLAUDE.md prohíbe DELETE en catálogos con historial). Decidido con
-- Felipe 2026-09-15: el prefijo queda FIJO en cuanto exista al menos un
-- producto con esa categoria_id (el código corto de una prenda ya impresa/
-- etiquetada no puede dejar de significar lo que dice), y desactivar SE
-- BLOQUEA si hay productos activos (fuerza a reasignarlos o descontinuarlos
-- primero, en vez de dejar productos activos "huérfanos" de categoría viva).
--
-- EL CANDADO DE NOMBRE QUE FALTABA. `categorias.nombre` (0002_esquema.sql)
-- era un `unique` plano: "Blusas" y "BLUSAS" NO chocaban. 20260912235500
-- cerró ese hueco para `colores` (`colores_clave_unica`) y 20260914150000
-- para `proveedores` (`proveedores_nombre_clave_unica`) — de hecho ese mismo
-- archivo dice en su comentario que categorías ya lo tenía, pero nunca se
-- escribió; esta migración corrige esa deuda con el mismo criterio
-- (`retail.fn_clave_texto`), a propósito, para que las 3 tablas de
-- vocabulario compartan una sola definición de "esto ya existe".
-- ============================================================================

-- ---------- 1. el candado real de nombre ----------
alter table retail.categorias drop constraint if exists categorias_nombre_key;
create unique index categorias_nombre_clave_unica on retail.categorias (retail.fn_clave_texto(nombre));

comment on index retail.categorias_nombre_clave_unica is
  'Impide que "Blusas" y "BLUSAS"/"blusas" convivan como dos categorías. Mismo criterio que colores_clave_unica y proveedores_nombre_clave_unica.';

-- ---------- 2. edición ----------
create or replace function retail.actualizar_categoria(
  p_categoria_id uuid,
  p_nombre text,
  p_familia text,
  p_prefijo text
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
    set nombre = v_nombre, familia = p_familia, prefijo = p_prefijo
    where id = p_categoria_id;
end;
$$;

comment on function retail.actualizar_categoria(uuid, text, text, text) is
  'Edita nombre/familia/prefijo de una categoría. El prefijo se rechaza si ya hay productos con esa categoria_id (fijo hacia adelante, decidido con Felipe 2026-09-15). Formato de familia/prefijo y unicidad de nombre los cierran los checks/índices de la tabla.';

-- ---------- 3. desactivar / reactivar ----------
create or replace function retail.desactivar_categoria(p_categoria_id uuid)
returns void
language plpgsql security definer set search_path = retail, public as $$
declare
  v_activos bigint;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede desactivar una categoría.';
  end if;
  if not exists (select 1 from retail.categorias where id = p_categoria_id) then
    raise exception 'Esa categoría ya no existe. Recarga la pantalla.';
  end if;

  select count(*) into v_activos from retail.productos
   where categoria_id = p_categoria_id and estado = 'activo';
  if v_activos > 0 then
    raise exception 'No se puede desactivar: tiene % producto(s) activo(s) con esta categoría. Reasígnalos o descontinúalos primero.', v_activos;
  end if;

  update retail.categorias set activo = false where id = p_categoria_id;
end;
$$;

create or replace function retail.reactivar_categoria(p_categoria_id uuid)
returns void
language plpgsql security definer set search_path = retail, public as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede reactivar una categoría.';
  end if;
  if not exists (select 1 from retail.categorias where id = p_categoria_id) then
    raise exception 'Esa categoría ya no existe. Recarga la pantalla.';
  end if;
  update retail.categorias set activo = true where id = p_categoria_id;
end;
$$;

-- ---------- 4. permisos ----------
grant execute on function retail.actualizar_categoria(uuid, text, text, text) to authenticated;
grant execute on function retail.desactivar_categoria(uuid) to authenticated;
grant execute on function retail.reactivar_categoria(uuid) to authenticated;
