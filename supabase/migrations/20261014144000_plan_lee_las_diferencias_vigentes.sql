-- ADR-0393 × ADR-0372: el Plan de campaña lee solo lo que faltó y todavía vale.
--
-- EL PROBLEMA PRIMERO. «Lo que falta llegar» del Plan de campaña (`fn_plan_compra_pedido`, 20261013213000) suma lo que el proveedor debe
-- reponer leyendo los faltantes «No vino» de `despacho_diferencias`. Desde ADR-0393 (20261013180000) un envío se puede reabrir: el faltante
-- del primer cierre queda como historia (`vigente = false`) y el cierre siguiente anota el suyo. Leyendo la tabla entera, el Plan contaría
-- los dos: diría que vienen en camino prendas que nadie va a mandar, y le restaría de más a «Comprar».
--
-- QUÉ HACE. El mismo cambio mecánico que 20261013180000 les hizo a «Nos debe» y al detalle del envío: `from retail.despacho_diferencias x`
-- → `from retail.despacho_diferencias_vigentes x`, por REEMPLAZO ANCLADO (falla sin tocar nada si la función viva cambió; no hace nada si
-- ya está). El bloque final comprueba que ninguna función de retail lea la tabla sin filtrar.
--
-- POR QUÉ UNA MIGRACIÓN APARTE. En una base nueva el Plan se crea después que 20261013180000 (su versión es posterior), así que aquella no lo
-- alcanza. En producción el Plan ya está cuando se pega 20261013180000, y aquella misma le hace el cambio: esta, entonces, no hace nada.
--
-- DECIDÍ: el mismo reemplazo anclado de las otras lecturas, en una migración posterior al Plan.
-- DESCARTÉ: reescribir `fn_plan_compra_pedido` entera, porque pisaría el trabajo del Plan (ADR-0372) y cualquier parche futuro suyo; y
-- un filtro `and x.vigente` en su consulta, porque sería la única lectura distinta de las otras diez (todas leen la vista).
-- SE ROMPE SI: el Plan reescribe su consulta y vuelve a leer `retail.despacho_diferencias x`: el bloque final de esta migración y la prueba
-- F1 de `pruebas:reabrir-envio` (ninguna función lee la tabla sin filtrar) lo frenan.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013183000. Solo una función: sin tablas, sin políticas ni
-- `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261013180000): falla si la función viva cambió, y es re-ejecutable.
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

select pg_temp.reemplazar('retail.fn_plan_compra_pedido(uuid)', 'from retail.despacho_diferencias x', 'from retail.despacho_diferencias_vigentes x', 1);

-- ---------- Comprobación: si algo no quedó, el pegado aborta sin escribir nada ----------
do $do$
begin
  if to_regclass('retail.despacho_diferencias_vigentes') is null then
    raise exception 'falta la vista despacho_diferencias_vigentes: pega antes 20261013180000';
  end if;
  if position('from retail.despacho_diferencias_vigentes x' in pg_get_functiondef('retail.fn_plan_compra_pedido(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_plan_compra_pedido no quedó leyendo las diferencias vigentes';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.prokind = 'f'
                and position('from retail.despacho_diferencias x' in pg_get_functiondef(p.oid)) > 0) then
    raise exception 'quedó una función que lee despacho_diferencias sin filtrar las vigentes: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'retail' and p.prokind = 'f' and position('from retail.despacho_diferencias x' in pg_get_functiondef(p.oid)) > 0);
  end if;
end;
$do$;
