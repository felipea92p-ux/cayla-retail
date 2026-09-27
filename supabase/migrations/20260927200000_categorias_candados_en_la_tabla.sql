-- ============================================================================
-- 20260927200000_categorias_candados_en_la_tabla.sql — pantalla Categorías
-- (docs/pantallas/productos-categorias.md, tareas #2, #4 y #6)
--
-- EL PROBLEMA. Las reglas de una categoría vivían SOLO dentro de las funciones que usa la pantalla:
--   · `desactivar_categoria` no deja desactivar con productos activos;
--   · `actualizar_categoria` no deja cambiar el prefijo si ya hay productos (es la letra del código
--     corto de la prenda, BLU-0042-AZM-M, que ya puede estar impreso en una etiqueta);
--   · `reactivar_categoria` no revisaba NADA: solo `set activo = true`.
-- La tabla no sabía ninguna de las tres. Y la RLS `for all` de `categorias` deja al líder escribir directo,
-- igual que cualquier migración. Así pasó el estado imposible que la auditoría del 2026-09-21 encontró en
-- producción: «Blusas» desactivada con un producto activo colgando (lo desactivó la migración
-- 20260917110000, no la pantalla). Y un clic en REACTIVAR sobre la «Polos» huérfana (sin familia ni
-- prefijo) dejaba una categoría activa que no aparece en ninguna sección, no tiene código y sí se cuenta.
--
-- QUÉ PROMETE.
--   1. Un disparador en la TABLA (`categorias_vigencia_candados`) con las tres reglas, sea quien sea el
--      que escriba (pantalla, SQL directo, migración futura):
--        a. el prefijo no cambia si hay productos con esa categoría, de CUALQUIER estado (misma regla que
--           `actualizar_categoria`: un descontinuado también lleva el código impreso);
--        b. no se desactiva con productos ACTIVOS (misma regla que `desactivar_categoria`);
--        c. una categoría activa tiene familia, prefijo y una familia ACTIVA — se revisa al reactivarla o
--           al cambiarle la familia. Es la contraparte de `fn_familias_desactivar_candado` (una familia no
--           se desactiva con categorías activas): sin esto, reactivar una categoría cuya familia se apagó
--           recreaba desde el otro lado el estado que ese candado impide.
--   2. `fn_productos_por_categoria` devuelve además `n_total` (productos de cualquier estado), para que la
--      pantalla muestre el prefijo bloqueado ANTES de guardar, con el mismo conteo que usa el candado.
--   3. La «Polos» huérfana de V1 deja de llevar una nota interna pegada al nombre: la nota pasa a `notas`.
--
-- QUÉ ASUME.
--   · Las RPC siguen igual y siguen validando primero: sus mensajes ya son los que ve la pantalla. El
--     disparador es la segunda capa, la que no se puede saltar. No se reescribe ninguna función vigente.
--   · Solo mira TRANSICIONES (antes → después), no el estado actual: si hoy existiera en producción una
--     categoría inactiva con productos activos, pegar esto no falla; la consulta de verificación del final
--     la delata para corregirla desde Editar producto.
--   · El nombre del disparador importa: Postgres corre los `before` de una tabla en orden alfabético, y
--     `categorias_vigencia_candados` va DESPUÉS de `categorias_valida_subcategoria`, que re-deriva la
--     familia de una subcategoría desde su padre. Así el punto (c) ve la familia ya definitiva.
--   · `security definer`: el conteo de productos no puede depender de la RLS de quien escribe.
--   · No corre en INSERT, a propósito: `seed.sql` inserta categorías con solo el nombre y
--     `on conflict do nothing`, y un `before insert` que lanza aborta ANTES de que Postgres mire el
--     conflicto. El alta de la pantalla ya exige familia y prefijo (route.ts), y el prefijo tiene su
--     `check` de formato.
--
-- LO QUE SE ROMPE A PROPÓSITO. Una migración futura que fusione categorías (como la de ADR-0096) tiene que
-- mover los productos ANTES de desactivar la categoría origen; si no, este disparador la aborta. Eso es lo
-- correcto (principio 2): el orden inverso es exactamente lo que dejó a Blusas así.
--
-- ORDEN CON LA WEB. Se puede pegar antes o después de desplegar: la pantalla nueva lee `n_total` si está y,
-- si no está, no bloquea el campo (la base sigue rechazando igual al guardar). Pegar ANTES de fusionar.
--
-- CÓMO SE REVIERTE.
--   drop trigger categorias_vigencia_candados on retail.categorias;   -- (toma locks de auth/storage: pegar solo)
--   drop function retail.fn_categorias_vigencia_candados();
--   y volver a crear `fn_productos_por_categoria` con la versión de 20260921170000 (sin `n_total`).
--   El cambio de nombre de la huérfana es cosmético: su nombre anterior queda escrito en `notas`.
--
-- Idempotente: se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. el disparador: las tres reglas, en la tabla ----------
create or replace function retail.fn_categorias_vigencia_candados()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_n bigint;
  v_familia_activa boolean;
begin
  -- (a) El prefijo queda fijo apenas una prenda lo usa, de cualquier estado.
  if new.prefijo is distinct from old.prefijo then
    select count(*) into v_n from retail.productos where categoria_id = old.id;
    if v_n > 0 then
      raise exception 'El prefijo "%" de "%" no se puede cambiar: ya hay % producto(s) creados con esta categoría.',
        old.prefijo, old.nombre, v_n;
    end if;
  end if;

  -- (b) No se desactiva con productos activos.
  if old.activo and not new.activo then
    select count(*) into v_n from retail.productos where categoria_id = old.id and estado = 'activo';
    if v_n > 0 then
      raise exception 'No se puede desactivar "%": tiene % producto(s) activo(s) con esta categoría. Reasígnalos o descontinúalos primero.',
        old.nombre, v_n;
    end if;
  end if;

  -- (c) Una categoría activa está completa y cuelga de una familia activa. Solo se revisa cuando algo de eso
  --     cambia (se reactiva o cambia de familia): editar el nombre de una categoría ya activa no la toca.
  if new.activo and (not old.activo or new.familia is distinct from old.familia) then
    if new.familia is null or new.prefijo is null then
      raise exception 'No se puede reactivar "%": le falta %. Crea una categoría nueva con sus datos completos.',
        new.nombre,
        case
          when new.familia is null and new.prefijo is null then 'la familia y el prefijo'
          when new.familia is null then 'la familia'
          else 'el prefijo'
        end;
    end if;
    select activo into v_familia_activa from retail.familias where codigo = new.familia;
    if v_familia_activa is not true then
      raise exception 'No se puede activar "%": su familia está desactivada. Reactívala primero en Productos · Familias.',
        new.nombre;
    end if;
  end if;

  return new;
end;
$$;

comment on function retail.fn_categorias_vigencia_candados() is
  'Candados de retail.categorias que antes vivían solo en las RPC: (a) prefijo fijo si hay productos de cualquier estado; (b) no desactivar con productos activos; (c) activa = con familia, prefijo y familia activa (al reactivar o cambiar de familia). Solo mira transiciones. Ver 20260927200000.';

-- `create or replace trigger`, nunca `drop` + `create`: el `drop trigger` toma en exclusiva las tablas de
-- auth/storage (CLAUDE.md, «Políticas y deadlocks»).
create or replace trigger categorias_vigencia_candados
  before update on retail.categorias
  for each row execute function retail.fn_categorias_vigencia_candados();

-- ---------- 2. el conteo de la pantalla suma el total ----------
-- Cambia el tipo que devuelve, así que `create or replace` no alcanza. `drop function` no toma los locks de
-- auth/storage. La web vieja sigue funcionando: lee `categoria_id` y `n`, que no cambian de significado.
drop function if exists retail.fn_productos_por_categoria();

create function retail.fn_productos_por_categoria()
returns table (categoria_id uuid, n bigint, n_total bigint)
language sql stable security invoker set search_path = retail, public, extensions as $$
  -- n: productos ACTIVOS (lo que cuenta la tarjeta y lo que bloquea desactivar).
  -- n_total: de cualquier estado (lo que bloquea el prefijo). Una categoría sin activos pero con
  -- descontinuados sale con n = 0: su prefijo igual está fijo.
  select p.categoria_id,
         count(*) filter (where p.estado = 'activo')::bigint,
         count(*)::bigint
  from retail.productos p
  where p.categoria_id is not null
  group by p.categoria_id
$$;

comment on function retail.fn_productos_por_categoria() is
  'Por categoría: n = productos activos (tarjeta, candado de desactivar) y n_total = de cualquier estado (candado del prefijo). security invoker: respeta la RLS de productos. Pantalla /productos/categorias.';

grant execute on function retail.fn_productos_por_categoria() to authenticated;

-- ---------- 3. la «Polos» huérfana: el nombre vuelve a ser un nombre ----------
-- En producción quedó inactiva, sin familia ni prefijo, con una nota interna incrustada en el nombre
-- («Polos (huérfana sin familia — fusionada con Polos/Camisetas el 2026-09-17)»). La nota pasa a `notas`,
-- donde la pantalla la muestra como «Notas internas». El nombre nuevo no choca con «Polos» (activa) en
-- `categorias_nombre_clave_unica`. En local y en CI esta fila no existe: actualiza 0 filas.
update retail.categorias
   set notas = concat_ws(E'\n', nullif(btrim(notas), ''),
                 'Nombre anterior: ' || nombre || '.',
                 'Categoría de la versión 1, sin familia ni prefijo. Sus productos pasaron a «Polos» el 2026-09-17 (migración 20260917110000). No se reactiva: para usarla, crea una categoría nueva.'),
       nombre = 'Polos (V1, retirada)'
 where familia is null
   and not activo
   and nombre like 'Polos (huérfana%';

-- ============================================================================
-- VERIFICACIÓN (solo lectura; pegar después, en el SQL Editor):
--
-- 1. El disparador existe y va después del de subcategorías:
--    select tgname from pg_trigger where tgrelid = 'retail.categorias'::regclass and not tgisinternal order by tgname;
--    → categorias_valida_subcategoria, categorias_vigencia_candados
--
-- 2. Ningún estado imposible quedó de antes (debe devolver 0 filas):
--    select c.nombre, c.activo, count(*) filter (where p.estado = 'activo') as activos
--      from retail.categorias c join retail.productos p on p.categoria_id = c.id
--     where not c.activo group by c.nombre, c.activo having count(*) filter (where p.estado = 'activo') > 0;
--    Si sale una fila: mover esos productos a una categoría activa desde Editar producto.
--
-- 3. Ninguna activa incompleta (0 filas):
--    select nombre from retail.categorias c where activo
--       and (familia is null or prefijo is null
--            or not exists (select 1 from retail.familias f where f.codigo = c.familia and f.activo));
--
-- 4. La huérfana:  select nombre, notas from retail.categorias where nombre like 'Polos (V1%';
-- 5. El conteo:    select * from retail.fn_productos_por_categoria() order by n_total desc limit 5;
-- ============================================================================
