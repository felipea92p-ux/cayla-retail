-- ============================================================================
-- 20261012215000_categorias_familia_baja_a_las_hijas.sql — CAYLA V2 (Catálogo · Categorías)
--
-- EL PROBLEMA PRIMERO. Una subcategoría vive siempre en la familia de su padre (20260915224501: «Vestidos largos» no
-- puede quedar en Calzado si «Vestidos» está en Indumentaria). El disparador `categorias_valida_subcategoria` lo hacía
-- cumplir, pero solo cuando se escribía LA HIJA. Al cambiar la familia del PADRE nadie tocaba a las hijas: pasar
-- «Bolsas» a «Empaque» (la familia con el interruptor de motores apagado, ADR-0377) dejaba «Bolsa kraft» y «Bolsa
-- regalo» en Accesorios, con el interruptor encendido. Sus ventas seguían inflando la demanda, el plan del piso y
-- Análisis, y el plan de compra pedía bolsas como si fueran prendas. En la pantalla, cada hija aparecía en otra sección
-- que su padre.
--
-- QUÉ HACE. Un disparador AFTER UPDATE en `categorias` (`categorias_familia_a_las_hijas`): cuando cambia la familia de
-- una categoría, sus hijas pasan a la misma, en la misma transacción. Escribe en la tabla, no en la función de la
-- pantalla, por la misma razón que los candados de 20260927200000: sirve igual para la pantalla, el SQL directo o una
-- migración futura. El `update` de las hijas pasa por los disparadores de siempre: `categorias_valida_subcategoria`
-- vuelve a derivar la familia desde el padre (ya cambiado) y `categorias_vigencia_candados` revisa que una hija activa
-- quede en una familia activa; si no, la operación entera se deshace (todo o nada: el padre no cambia solo).
--
-- SIN RECURSIÓN. Hay un solo nivel de subcategoría (lo hace cumplir el mismo disparador de 20260915224501): una hija no
-- tiene hijas, así que el disparador, al correr por cada hija, no encuentra filas que actualizar.
--
-- Y CORRIGE LO QUE YA ESTÁ. Un `update` de las hijas que hoy tengan otra familia que su padre (el 2026-10-12 la base
-- local tiene cero; la consulta de verificación de abajo dice cuántas hay en producción antes de pegar).
--
-- SE ROMPE SI alguien cambia la familia del padre con los disparadores apagados (`session_replication_role = replica`
-- en el SQL Editor): las hijas se quedan atrás. La consulta de verificación de abajo lo delata.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una función, un `create or replace trigger` (nunca
-- `drop trigger`, que toma los candados de auth/storage, ADR-0195) y un `update` de datos, sin políticas. Idempotente.
--   Antes, para saber cuántas corrige (solo lectura):
--     select h.nombre, h.familia, p.nombre as padre, p.familia as familia_del_padre
--       from retail.categorias h join retail.categorias p on p.id = h.categoria_padre_id
--      where h.familia is distinct from p.familia;
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_categorias_familia_a_las_hijas()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  -- Solo las hijas que todavía no la tienen: si nada cambia, no se escribe nada (y no se dispara nada).
  update retail.categorias
     set familia = new.familia
   where categoria_padre_id = new.id
     and familia is distinct from new.familia;
  return null;
end;
$$;

comment on function retail.fn_categorias_familia_a_las_hijas() is
  'Cuando cambia la familia de una categoría, sus subcategorías pasan a la misma (una hija vive siempre en la familia de su padre). AFTER UPDATE OF familia en retail.categorias.';

revoke all on function retail.fn_categorias_familia_a_las_hijas() from public, anon, authenticated;

create or replace trigger categorias_familia_a_las_hijas
  after update of familia on retail.categorias
  for each row
  when (old.familia is distinct from new.familia)
  execute function retail.fn_categorias_familia_a_las_hijas();

-- Lo que ya está desalineado: la hija toma la familia de su padre. El `before update` de siempre la vuelve a derivar
-- del padre, así que el valor que se escribe aquí es el mismo que quedará.
update retail.categorias h
   set familia = p.familia
  from retail.categorias p
 where p.id = h.categoria_padre_id
   and h.familia is distinct from p.familia;

reset lock_timeout;
