-- ============================================================================
-- 20261013130000_plan_del_piso_grupos_ignoran_familias_apagadas.sql — CAYLA V2 (Inventario · Plan del piso ▸ Grupos)
--
-- EL PROBLEMA PRIMERO. El 2026-10-10 (ADR-0377) la familia «Empaque» se apagó («Cuenta en Análisis, Frescura y el plan del
-- piso» en OFF) y los cinco motores dejaron de contar las bolsas: el reparto del plan del piso (`fn_piso_plan_lectura`), la
-- demanda, el plan de compra, Análisis y Frescura. Pero la pestaña GRUPOS del Plan del piso lee de otra función,
-- `fn_categorias_grupo_mix`, que lista TODA categoría activa, y nadie le dio el filtro. Resultado el 2026-10-13 en Tienda TRU:
-- «Bolsas · Sin grupo · Elegir grupo», la tarjeta «Sin grupo: 1 categoría nueva por ubicar» en rojo y «Siguiente por revisar:
-- Bolsas». Le pide al líder ubicar en el riel una categoría que, por decisión, no está en el riel. Y si lo hiciera, la base
-- se lo aceptaba: `fijar_grupos_de_categorias` tampoco preguntaba.
--
-- QUÉ HACE. Dos reemplazos anclados sobre las definiciones vivas:
--   1. `fn_categorias_grupo_mix` deja fuera la categoría cuya familia no entra a los motores
--      (`retail.fn_categoria_entra_a_motores`; sin dato responde sí, así que una categoría sin familia sigue saliendo).
--   2. `fijar_grupos_de_categorias` rechaza darle grupo a una de esas categorías (`grupos_mix_categoria_fuera_del_plan`,
--      22023): una pestaña abierta desde antes de pegar esto no la cuela.
-- Es en vivo: si el líder vuelve a encender la familia, la categoría reaparece en Grupos sin más. No se toca ningún dato
-- (en producción «Bolsas» no tiene fila en `categoria_grupo_mix`; si una familia se apaga DESPUÉS de tener grupo, su fila
-- queda y no molesta: el reparto ya no cuenta su stock ni sus ventas, 20261010232000).
--
-- CÓMO. El mismo ayudante `pg_temp.reemplazar` de 20261012190000 y 20261012220000: si el ancla no está exactamente una vez,
-- se detiene sin tocar nada; si ya está aplicado, no hace nada (re-ejecutable). Las anclas se contaron contra las
-- definiciones REALES de producción el 2026-10-13 (solo lectura): 1 y 1. Ninguna lleva un `select … into` entre comillas
-- (ADR-0288).
--
-- SE ROMPE SI una migración posterior redefine `fn_categorias_grupo_mix` copiando 20261010171845 o
-- `fijar_grupos_de_categorias` copiando 20261006100000: pierde el filtro. `pnpm pruebas:motores-familias-apagadas`
-- (casos G1-G3 y R1) lo vigila.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: solo dos funciones (sin tablas, políticas ni
-- disparadores, ADR-0195). Después de 20261010231000 (la pregunta) y 20261010171845 (la versión viva de la lectura).
-- Se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $g$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_categoria_entra_a_motores') then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega primero 20261010231000_familias_entran_a_motores.sql.';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_categorias_grupo_mix') then
    raise exception 'Falta retail.fn_categorias_grupo_mix: pega primero 20261006100000_plan_del_piso_grupos_del_mix.sql y 20261010171845.';
  end if;
end
$g$;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. La lectura de la pestaña Grupos: una categoría de una familia apagada no se lista (no tiene grupo que elegir).
select pg_temp.reemplazar(
  'retail.fn_categorias_grupo_mix()',
  $v$     where c.activo
     order by c.familia nulls last, c.nombre;$v$,
  $v$     where c.activo
       -- ADR-0377 (20261013130000): la categoría de una familia que no entra a los motores (empaque) no va al riel y no se lista.
       and retail.fn_categoria_entra_a_motores(c.id)
     order by c.familia nulls last, c.nombre;$v$,
  1);

-- 2. La escritura: la base tampoco le da grupo (una pestaña vieja o una llamada directa no la cuelan).
select pg_temp.reemplazar(
  'retail.fijar_grupos_de_categorias(jsonb)',
  $v$    if not exists (select 1 from retail.grupos_mix g where g.clave = v_grupo) then$v$,
  $v$    -- ADR-0377 (20261013130000): lo que no cuenta en el plan del piso (empaque) no lleva grupo.
    if not retail.fn_categoria_entra_a_motores(v_cat.id) then
      raise exception 'La categoría "%" es de una familia que no cuenta en el plan del piso: no lleva grupo.', v_cat.nombre
        using errcode = '22023', hint = 'grupos_mix_categoria_fuera_del_plan';
    end if;
    if not exists (select 1 from retail.grupos_mix g where g.clave = v_grupo) then$v$,
  1);

comment on function retail.fn_categorias_grupo_mix() is
  'ADR-0329: una fila por categoría activa con su grupo del mix (grupo_clave nulo = «Sin grupo»), si el líder ya la confirmó y la version que fijar_grupos_de_categorias pide (0 si no tiene grupo). Pide el módulo plan_piso. ADR-0377 (20261013130000): la categoría de una familia que no entra a los motores (empaque) no se lista.';

reset lock_timeout;
