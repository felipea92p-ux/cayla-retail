-- ============================================================================
-- 20260928110000_productos_es_prueba_solo_lider.sql — CAYLA V2
--
-- «MARCAR UN PRODUCTO COMO DATO DE PRUEBA SIGUE SIENDO SOLO DEL LÍDER» — EN LA BASE.
--
-- QUÉ ENCONTRÓ. Cerrando `pnpm pruebas:archivar-datos-prueba` (D-54, ADR-0159,
-- 20260922130000_archivar_datos_de_prueba.sql) contra un Postgres desechable con TODAS
-- las migraciones aplicadas: el caso «colaboradora con el rol real de la API
-- (authenticated): tampoco archiva un producto con un UPDATE directo» — que esperaba que
-- RLS lo rechazara — pasa de verdad. Micaela (rol `integrante`, sin ser líder) queda
-- marcando `productos.es_prueba = true` con un simple `update productos set es_prueba =
-- true where id = ...`, sin pasar por `archivar_producto_prueba()` y sin ser líder.
--
-- POR QUÉ. D-54 (20260922130000) decidió A PROPÓSITO no ponerle a `productos` el mismo
-- trigger que le puso a `conteos` (`conteos_es_prueba_solo_lider`), razonando así: "`RLS ya
-- exige líder para CUALQUIER escritura en productos` (`productos_write_lider`)". Esa frase
-- era cierta el 2026-09-22: la política llamaba a `fn_es_lider()` sin más. Al día
-- siguiente, `20260923030000_roles_por_modulo.sql` (ADR-0161, «módulos y roles») REDEFINIÓ
-- `productos_write_lider` para llamar a `fn_puede_editar_catalogo()` —
-- `fn_es_lider() OR fn_capacidad_por_modulos(array['productos','atributos'])` — a propósito,
-- para que un rol con acceso al módulo Productos/Atributos (no solo el líder) pueda
-- mantener el catálogo. Ese cambio es correcto para el catálogo real; el efecto
-- colateral, no buscado por nadie, es que también reabrió la puerta que D-54 creía
-- cerrada para `es_prueba`: cualquier colaboradora con el módulo Productos ve TODAS las
-- columnas de la fila como editables, incluida una que el negocio quiere reservada al
-- líder. Ninguna de las dos migraciones tiene la culpa por separado; la mezcla sí produjo
-- un estado que D-54 explícitamente no quería. Principio 2 de este repo: se corrige el
-- esquema, no se confía en que la política de otro módulo siga siendo tan estricta como
-- era el día que se escribió esta regla.
--
-- QUÉ CAMBIA. El mismo candado que `conteos_es_prueba_solo_lider` (D-54, punto 6), ahora
-- también en `productos`: un trigger que rechaza cualquier INSERT/UPDATE que cambie
-- `es_prueba` y no venga de `fn_es_lider()`. `archivar_producto_prueba()` sigue
-- funcionando igual (ya comprueba `fn_es_lider()` ANTES, así que nunca llega a disparar
-- el trigger en el camino de error).
--
-- SE ROMPE SI: el día que `productos_write_lider` vuelva a estrecharse a "solo líder"
-- este trigger se vuelve redundante (inofensivo, no una migración a deshacer). Si en
-- cambio se AMPLÍA otra vez quién puede escribir `productos` (un tercer camino, no RLS),
-- hay que repetir este análisis para ese camino nuevo — el trigger solo cubre INSERT/UPDATE
-- de fila, no un camino que evite la tabla por completo.
--
-- Re-ejecutable (`create or replace function`, `create or replace trigger` — nunca
-- `drop trigger`: en el SQL Editor de producción toma en exclusiva las tablas de `auth`/
-- `storage` aunque el disparador no exista, CLAUDE.md «Políticas y deadlocks»). Producción:
-- se pega con el prefijo `retail.` (o `set search_path = retail, public, extensions;` al
-- inicio).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function fn_productos_es_prueba_solo_lider() returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if (tg_op = 'INSERT' and new.es_prueba) or (tg_op = 'UPDATE' and new.es_prueba is distinct from old.es_prueba) then
    if not fn_es_lider() then
      raise exception 'Solo un líder de equipo puede marcar un producto como dato de prueba' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function fn_productos_es_prueba_solo_lider() is
  'D-54 (20260922130000) + ADR-0161: productos_write_lider dejó de exigir líder para TODA escritura en productos '
  '(ahora también entra quien ve el módulo Productos/Atributos). Este trigger cierra, en la tabla, el hueco que eso '
  'reabrió para es_prueba — igual que conteos_es_prueba_solo_lider ya hace en conteos.';

create or replace trigger productos_es_prueba_solo_lider
  before insert or update on productos
  for each row execute function fn_productos_es_prueba_solo_lider();
