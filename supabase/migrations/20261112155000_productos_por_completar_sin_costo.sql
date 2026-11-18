-- ============================================================================
-- 20261112155000 — Catálogo ▸ Productos: «Por completar ▸ Sin costo»
--
-- QUÉ ES ESTO
--   Felipe (2026-11-12): en el filtro «Por completar» de Catálogo, una opción más, «Sin costo», para encontrar las prendas a las
--   que les falta cargar lo que costaron. Sin costo no hay margen ni precio propuesto (20261110203000) que valga.
--
-- QUÉ CUENTA COMO «SIN COSTO»
--   Una VARIANTE visible con `costo` vacío o en 0 (la columna no admite negativos y nace en 0: en local, 1 860 de 1 908 variantes).
--   Es por variante, como todo el listado desde 20261002200000 (ADR-0308): una prenda con tres colores cargados y uno sin costo
--   sale, porque hay algo que completar. Es la misma regla que usa el precio propuesto (`costo > 0` = tiene costo).
--
-- QUIÉN LO VE
--   El costo solo lo ve quien ve el dinero de Compras (`fn_puede_ver_dinero_de_compras`, la misma regla que esconde costo y margen
--   en el listado). Para los demás, «Sin costo» no encuentra nada (la lista sale vacía y el conteo no trae la opción): saber qué
--   prendas no tienen costo ya dice algo del costo. La pantalla, además, no les dibuja la opción.
--
-- QUÉ CAMBIA (reemplazo anclado por TEXTO sobre la definición viva; misma firma, sin drop ni permisos nuevos)
--   · `fn_productos_filtro`: `visibles` suma `v.costo` y `p_falta = 'costo'` filtra las variantes sin costo.
--   · `fn_productos_listado`: acepta 'costo' como falta conocida.
--   · `fn_productos_facetas`: cuenta la opción 'costo' dentro de «falta», con la misma regla (lista y conteo dicen lo mismo).
--   Con `p_falta` vacío o con las cuatro faltas de antes, las tres devuelven EXACTAMENTE lo de antes.
--
-- CÓMO. Cada ancla tiene que aparecer EXACTAMENTE una vez en la definición viva; si no, aborta sin tocar nada (la función cambió:
--   hay que regenerar el reemplazo). Se puede pegar dos veces: si la función ya tiene «Sin costo», no la toca. Sin tablas ni
--   políticas (ADR-0195), sin `drop trigger`, y sin `select … into` dentro de un texto entre comillas (ADR-0288). Una sola ejecución.
--   Huellas en local ANTES (2026-11-12, base al día con main): fn_productos_filtro = 1ca9b8c0c8f5d850d1dac1021aef9464 ·
--   fn_productos_listado = 7d6e368684bb0347ad9d8e8b70bfb0cb · fn_productos_facetas = 6ce72f6c999f1709c695fec59c34115b.
--   Las anclas también están en las versiones de 20261002200000/20261021004000 (las que reconstruyen las pruebas viejas).
--
-- CÓMO SE DESHACE: borrar las tres líneas que llevan «ADR: sin costo» (o volver a pegar las definiciones de antes). La web solo
--   dibuja la opción si el conteo la trae, así que con la base de antes la opción simplemente no aparece.
--
-- ORDEN DE PEGADO: cuando quieras; no depende de otra migración pendiente. Va antes o después de la web: la web nueva no muestra
--   la opción hasta que la base la cuente.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Cada ancla del texto vivo tiene que aparecer EXACTAMENTE una vez; si no, la función cambió desde que se escribió esto y no se toca nada.
create or replace function pg_temp.una_vez(p_def text, p_ancla text)
returns void language plpgsql as $f$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'sin costo: se esperaba UNA aparición de «%» y hay %. La función cambió desde que se escribió esta migración: regenera el reemplazo desde su definición real.', p_ancla, v_n;
  end if;
end;
$f$;

do $migracion$
declare
  c_filtro  constant text := 'retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean, uuid)';
  c_listado constant text := 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)';
  c_facetas constant text := 'retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)';
  -- Las anclas (texto vivo) y lo que las reemplaza.
  a_visibles   constant text := 'select v.id as variante_id, v.producto_id,';
  a_falta_filt constant text := E'or (p_falta = ''proveedor'' and vi.proveedor_id is null))';
  a_conocidas  constant text := E'p_falta not in (''foto'', ''temporada'', ''marca'', ''proveedor'')';
  a_conteo     constant text := E'(''proveedor'', fi.proveedor_id is null)';
  v_def text;
begin
  if to_regprocedure(c_filtro) is null or to_regprocedure(c_listado) is null or to_regprocedure(c_facetas) is null then
    raise exception 'Faltan las firmas con empresa de Productos: pega antes 20261021004000_productos_filtro_por_empresa.sql';
  end if;

  -- 1. El filtro interno: la variante sin costo (vacío o 0), solo para quien ve el dinero de Compras.
  v_def := pg_get_functiondef(c_filtro::regprocedure);
  if position('ADR: sin costo' in v_def) = 0 then
    perform pg_temp.una_vez(v_def, a_visibles);
    perform pg_temp.una_vez(v_def, a_falta_filt);
    v_def := replace(v_def, a_visibles, a_visibles || E' v.costo, -- ADR: sin costo (20261112155000)\n          ');
    v_def := replace(v_def, a_falta_filt,
      E'or (p_falta = ''proveedor'' and vi.proveedor_id is null)\n'
      -- El comentario va en su propia línea: tras el ancla viene la coma de la columna siguiente.
      || E'           -- ADR: sin costo (20261112155000)\n'
      || E'           or (p_falta = ''costo'' and (select retail.fn_puede_ver_dinero_de_compras()) and coalesce(vi.costo, 0) <= 0))');
    execute v_def;
  end if;

  -- 2. La lista: 'costo' pasa a ser una falta conocida.
  v_def := pg_get_functiondef(c_listado::regprocedure);
  if position('ADR: sin costo' in v_def) = 0 then
    perform pg_temp.una_vez(v_def, a_conocidas);
    v_def := replace(v_def, a_conocidas,
      E'p_falta not in (''foto'', ''temporada'', ''marca'', ''proveedor'', ''costo'') -- ADR: sin costo (20261112155000)\n    ');
    execute v_def;
  end if;

  -- 3. Los conteos: la opción 'costo' de «falta», con la misma regla del filtro. Se pregunta por la variante (el filtro no la
  --    devuelve como columna: sumarla cambiaría su tipo de retorno y obligaría a borrarla y recrearla).
  v_def := pg_get_functiondef(c_facetas::regprocedure);
  if position('ADR: sin costo' in v_def) = 0 then
    perform pg_temp.una_vez(v_def, a_conteo);
    v_def := replace(v_def, a_conteo,
      a_conteo || E',\n      (''costo'', (select retail.fn_puede_ver_dinero_de_compras())'
      || E' and exists (select 1 from retail.variantes vc where vc.id = fi.variante_id and coalesce(vc.costo, 0) <= 0)) -- ADR: sin costo (20261112155000)');
    execute v_def;
  end if;
end
$migracion$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261112155000 · Por completar ▸ Sin costo' as parte,
       case when position('ADR: sin costo' in pg_get_functiondef('retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean, uuid)'::regprocedure)) > 0
             and position('ADR: sin costo' in pg_get_functiondef('retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)'::regprocedure)) > 0
             and position('ADR: sin costo' in pg_get_functiondef('retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)'::regprocedure)) > 0
             and not has_function_privilege('anon', 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)', 'execute')
             and has_function_privilege('authenticated', 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)', 'execute')
            then 'QUEDÓ BIEN' else 'REVISAR: alguna de las tres funciones no quedó con «Sin costo» o cambiaron sus permisos' end as resultado;
