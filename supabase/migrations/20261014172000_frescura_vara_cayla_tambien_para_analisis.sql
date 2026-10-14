-- ============================================================================
-- 20261014172000_frescura_vara_cayla_tambien_para_analisis.sql — CAYLA V2 · ADR-0208 (vara de CAYLA, act. 2026-10-07)
--
-- YA ESTÁ EN PRODUCCIÓN — NO SE VUELVE A PEGAR. Esta migración no escribe nada nuevo: copia a `main` la versión de
-- `retail.fn_frescura_vara_cayla()` que corre en producción desde el 2026-10-13. Alguien la pegó en el SQL Editor sin
-- dejar archivo: ni en `main`, ni en ninguna rama local o de `origin`, ni en un stash ni en los worktrees de este Mac
-- (buscado el 2026-10-14). La revisión de deriva del 2026-10-14 la encontró como «otra versión» que la de `main`. El cuerpo
-- de abajo es el de `pg_proc.prosrc` de producción, carácter por carácter (md5 exacto 46a4fdf53ad9ed7231fcb6eb9e96c51a,
-- md5 del cuerpo normalizado como en `scripts/migraciones/deriva.sql` 180fed24c703c0c9262cb982f9d11b2c, leídos el
-- 2026-10-14 con una consulta de solo lectura). Su comentario en el código («2026-10-13») es el que trae producción.
--
-- EL PROBLEMA PRIMERO. La vara de CAYLA (`20261008120000_frescura_vara_cayla.sql`) es la rotación anónima de las tres
-- tiendas por categoría; Frescura del piso la usa de respaldo cuando una categoría tiene pocas ventas en la tienda. En
-- `main` solo la lee el líder o quien tiene el módulo «Frescura del piso». Producción además deja leerla a quien tiene
-- el módulo «Análisis». Mientras `main` no lo diga, el CI y las bases locales prueban un candado más cerrado que el que
-- rige en las tiendas, y una migración que recree la función desde `main` le quitaría el acceso a Análisis sin que nadie
-- lo decida.
--
-- QUÉ CAMBIA FRENTE A `main`: solo el candado y su mensaje. `fn_es_lider() or fn_ve_modulo('frescura')` pasa a
-- `… or fn_ve_modulo('analisis')`, y el error dice «hace falta el módulo «Frescura del piso» o «Análisis» en tu rol» (la
-- pista sigue siendo `frescura_sin_permiso`). La firma, lo que devuelve, `security definer`, `stable`, el `search_path` y
-- los permisos (solo `authenticated` la ejecuta) no cambian. Tampoco el `comment on function`: producción conserva el de
-- `20261008120000` («para quien ve Frescura del piso»), y esta migración no lo toca para no apartarse de lo que corre allá.
--
-- QUÉ NO ABRE. La vara no tiene sede ni nombres: son conteos anónimos de CAYLA entera. Quien ve Análisis ya ve más que eso
-- (las prendas de cada tienda con su precio y su costo: ADR-0328 «Enmienda 2026-10-06», ADR-0357). Nadie sin Frescura ni
-- Análisis la lee, y la
-- tabla `frescura_vara_cayla` sigue sin políticas (no se lee directo, ni el líder).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: no se pega, ya está. Si alguien la pega igual, es un `create or replace` de una función que
-- ya tiene este mismo cuerpo, más un `revoke`/`grant` que ya están: deja todo igual. Sin políticas ni `drop trigger`.
-- Cómo se verifica (solo lectura; debe dar 46a4fdf53ad9ed7231fcb6eb9e96c51a):
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_frescura_vara_cayla()'::regprocedure;
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar `20261008120000_frescura_vara_cayla.sql` entero (por ejemplo, para reparar `fn_frescura_sede`):
--     su `create or replace` devuelve la vara al candado de solo Frescura, y Análisis deja de leerla en silencio. Lo vigila
--     `pnpm pruebas:frescura-vara-cayla` (el caso de «Análisis» sale rojo contra una base así);
--   · se renombra la clave del módulo `analisis` en `retail.modulos`: `fn_ve_modulo('analisis')` daría falso para todos.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_frescura_vara_cayla()
returns table (
  categoria_id uuid,
  calculada_en timestamptz,
  tiendas integer,
  ventana_dias integer,
  vendidas numeric,
  unidades numeric,
  nivel text,
  observaciones jsonb
)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- El mismo candado de la familia (20260929100000), más el módulo «Análisis» (2026-10-13): la vara de rotación es una
  -- medición de CAYLA y la necesita todo el que decide sobre inventario, no solo la pantalla que la construyó. Sin sede:
  -- la vara es de CAYLA entera y es anónima. Un error y no cero filas: «no tienes acceso» no puede parecer «sin respaldo».
  if not (fn_es_lider() or fn_ve_modulo('frescura') or fn_ve_modulo('analisis')) then
    raise exception 'Para ver la vara de CAYLA hace falta el módulo «Frescura del piso» o «Análisis» en tu rol.' using hint = 'frescura_sin_permiso';
  end if;
  return query
    select f.categoria_id, f.calculada_en, f.tiendas, f.ventana_dias, f.vendidas, f.unidades, f.nivel, f.observaciones
      from retail.frescura_vara_cayla f
     order by f.categoria_id;
end $fn$;

revoke all on function retail.fn_frescura_vara_cayla() from public, anon;
grant execute on function retail.fn_frescura_vara_cayla() to authenticated;
