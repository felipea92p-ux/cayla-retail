-- ============================================================================
-- 20261021163000_tienda_catalogo_trae_la_familia.sql — CAYLA V2 · Tienda online (ADR-0408, pendiente de su act. 2026-10-15 (f))
-- Cada prenda del catálogo dice la FAMILIA de su categoría (indumentaria, accesorios, bisutería, calzado…), para que una categoría
-- nueva caiga en el menú y el grupo correctos de la tienda sin que nadie toque código.
--
-- EL PROBLEMA PRIMERO. La tienda agrupa las categorías con una tabla por prefijo (`packages/shared/src/categorias-de-la-tienda.ts`). Una
-- categoría que un Líder crea después —tacones, un collar nuevo— no está en la tabla y caía en «Chompas/Abrigos», sea lo que sea.
-- El ADR-0408 ya lo dejó anotado como pendiente: «que la base mande la familia de la categoría (`categorias.familia`)». Felipe
-- (2026-10-21): «sin adicionar pasos y que si se agregan prendas nuevas no se desordene». La familia es un dato que ya se elige
-- obligatoriamente al crear la categoría: no agrega ningún paso.
--
-- ANALOGÍA CAYLA. El grupo fino («Bolsos/Cinturones») es el pasillo que decide la tienda; la familia es el letrero de la sección
-- («Accesorios»). Una prenda que nadie ubicó va al pasillo «otros» de SU sección, no a cualquier lado.
--
-- QUÉ HACE. `tienda_catalogo(sede)` suma `'categoria_familia'` a cada prenda, leída de `categorias.familia`. Es un dato más del mismo
-- objeto: la web de antes lo ignora y la web nueva, si no llega, usa el respaldo de siempre (principio 9: se degrada, no se
-- cae). Solo el catálogo: los looks, las fichas y los favoritos arman sus tarjetas desde él.
-- DECIDÍ: la tabla por prefijo sigue mandando para lo que conoce (el grupo fino es una decisión de diseño y cambia poco); la familia
--   es solo el respaldo de lo que la tabla no conoce.
-- DESCARTÉ: columnas nuevas de grupo en `categorias` (un paso más para quien crea la categoría) y la categoría madre
--   (`categoria_padre_id`: casi sin uso, y obligaría a crear categorías vacías que aparecerían en el combo de Nuevo producto).
--
-- DECIDÍ: una clave hermana de `categoria` y no `categoria.familia`. Cambiar el texto de `'categoria', …` rompería el ancla de
--   20261021001000 (se repega en las pruebas de Postgres y en producción): la clave nueva va ANTES de esa línea y la deja intacta.
--
-- SE ROMPE SI: otra función de la tienda arma la prenda por su cuenta (no traería `categoria_familia`; la web usa el respaldo).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): un reemplazo anclado; no toma tablas en exclusiva ni toca
-- políticas (sin riesgo de 40P01). Cuenta que su ancla aparezca UNA vez: si alguien cambió la función, se detiene sin tocar nada. Sin
-- `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no importa. Requiere 20261021001000.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_catalogo(uuid)',
  $v$'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,$v$,
  $v$'categoria_familia', c.familia,
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,$v$
);

select 'ADR-0408 · tienda: el catálogo trae la familia de cada categoría' as parte,
       case when pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure) like '%''categoria_familia'', c.familia,%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
