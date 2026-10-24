-- Campañas: cierre de #1190 — la portada de la tienda vuelve a la versión de `main` y lo que #1190 dejó en producción se archiva.
--
-- NO PEGADA en producción (2026-10-24). Ensayada en una base desechable idéntica a producción (ver «ENSAYO»).
-- Pegarla es decisión de Felipe, con el PR ya revisado. Versión reservada por la rama `claude/cierre-1190-limpieza` (ADR-0381).
--
-- EL PROBLEMA. #1190 (ADR-0436, «cada campaña con su diseño en la portada») se cerró sin fusionar, pero 4 de sus 8 migraciones
-- (20261017144000, 151000, 160000 y 200000) se pegaron en producción el 2026-10-17. `main` las absorbió casi todas (ADR-0476, el
-- 2026-10-22: la llave única, el módulo en Catálogo, las funciones del editor sin permiso de ejecutar), con UNA excepción que ese
-- ADR dejó a propósito: `retail.tienda_portada()` sigue siendo la de #1190 (20261017200000). Esa lee `retail.campana_disenos` (vacía,
-- archivada) por `fn_campana_en_portada()` y `fn_diseno_json()`, y devuelve `diseno: null` dentro de `campana`. La tienda de `main`
-- lo ignora (su zod no es estricto), así que no se ve; pero:
--   · la copia de la regla «qué campaña sale» que corre en producción NO es la que está en el repo (deriva diaria en rojo desde el
--     2026-10-15: 10 funciones y una tabla que ningún archivo de `main` define);
--   · `scripts/pruebas/tienda_puerta.mjs` falla contra un clon de producción (compara `campana` con 3 claves y llegan 4);
--   · borrar `fn_campana_en_portada`, `fn_diseno_json` o `campana_disenos` mientras `tienda_portada()` siga siendo la de #1190 la
--     rompe, y la tienda se queda sin campaña en la franja, el Inicio y el catálogo sin ninguna pantalla caída (solo un log).
-- Por eso el ORDEN importa y es el de este archivo: primero la portada vuelve a `main`, y solo después se archiva lo que ya nadie lee.
--
-- LO QUE HACE (una sola parte, solo funciones y comentarios; nada se borra):
--   1. Guarda: `tienda_portada()` tiene que ser la de #1190 (md5 39eabc1b…, la de producción hoy) o la de `main` (md5 1c1e45c5…).
--      Si es otra cosa, alguien la cambió después de este ensayo: no se aplica nada y lo dice.
--   2. `tienda_portada()` vuelve EXACTAMENTE a la de `20261014220000` (mismo cuerpo, mismo comentario, mismos permisos: solo
--      `tienda_web`). Lo que ve una cliente no cambia: la campaña elegida es la misma (la regla de ambas copias es idéntica,
--      comprobado día por día del 2026-10-23 al 2026-11-02) y la clave sobrante `diseno` desaparece.
--   3. Las 10 funciones que #1190 dejó (campana_diseno, campanas_lista, campanas_portada_dias, fn_campana_en_portada,
--      fn_campana_para_disenar, fn_colores_de_portada_validos, fn_diseno_json, guardar_diseno_borrador, publicar_diseno_campana,
--      volver_al_diseno_anterior) pierden el permiso de ejecutar para `public`, `anon` y `authenticated` (algunas ya no lo tenían, por ADR-0476 o
--      porque nunca lo tuvieron; el `revoke` no cambia nada donde ya está) y llevan un comentario «ARCHIVADA». `service_role` y el dueño conservan el suyo. Nada las llama: `main` no las
--      menciona y `pg_stat_statements` de producción no registra más llamadas que las de este diagnóstico.
--   4. `retail.campana_disenos` ya estaba comentada como archivada (ADR-0476) pero el comentario decía que `tienda_portada()` la
--      sigue leyendo; ahora es falso, y se corrige.
--
-- LO QUE NO HACE.
--   · No borra la tabla ni las funciones. ADR-0476 decidió archivar y no borrar; borrarlas es otra decisión (otra migración, con
--     `DROP FUNCTION` con su firma completa, DESPUÉS de esta). Tampoco toca `campana_web_disenos` ni `tienda_diseno_campana()` (el
--     diseño que de verdad pinta la tienda).
--   · No toca las 4 migraciones de #1190 que NUNCA se pegaron (204000, 210000, 212000, 231000). Quedan sin hacerse.
--   · No declara nada en la deriva: lo archivado se registra aparte, en `scripts/migraciones/deriva.mjs` (CONOCIDAS), en el mismo PR.
--
-- NO RE-PEGAR NUNCA 20261017144000, 160000, 200000 ni 231000 después de esta: reescriben `tienda_portada()` como la de #1190 y/o
-- devuelven EXECUTE a `authenticated` sobre el editor archivado. Si pasara, se arregla pegando esta otra vez (es idempotente).
--
-- CÓMO SE PEGA. Este archivo tal cual en el SQL Editor de producción, de una vez. Idempotente, `lock_timeout` 3 s, sin políticas ni
-- `alter table` (ADR-0195: no hay nada que tome en exclusiva las tablas de `auth` y `storage`). Pegado dos veces seguidas no cambia nada.
--
-- ENSAYO (base desechable = `main` + las 4 migraciones de #1190 que están en producción; sus huellas de función y sus permisos
-- coinciden con producción, comparadas una por una): ver el cuerpo del PR / la entrada de bitácora del 2026-10-24.
--
-- DESPUÉS DE PEGARLO, comprobar en producción (debe dar `t`, `t`, `t`, `t`):
--   select md5(prosrc) = '1c1e45c5d72db986e85ed8c895614eec' from pg_proc where oid = 'retail.tienda_portada()'::regprocedure;
--   select not has_function_privilege('authenticated', 'retail.campanas_lista()', 'execute');
--   select not has_function_privilege('authenticated', 'retail.campanas_portada_dias(date,date)', 'execute');
--   select has_function_privilege('tienda_web', 'retail.tienda_portada()', 'execute');

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Guarda: la función viva es una de las dos conocidas -----------------------------------------------------------------------

do $guarda$
declare
  v_md5 text := (select md5(prosrc) from pg_proc where oid = 'retail.tienda_portada()'::regprocedure);
begin
  if v_md5 not in (
    '39eabc1b7b6d3477c64edecf27379f49',  -- 20261017200000 (#1190): lo que corre en producción desde el 2026-10-17
    '1c1e45c5d72db986e85ed8c895614eec'   -- 20261014220000 (main): lo que queda tras esta migración (y lo que hay en una base nueva)
  ) then
    raise exception 'retail.tienda_portada() no es ni la de main ni la de #1190 (md5 %): alguien la cambió. No se aplica nada; revísala antes de seguir.', v_md5;
  end if;
end;
$guarda$;

-- 2. La portada vuelve a la de main (copia exacta de 20261014220000) ----------------------------------------------------------------

create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object('nombre', e.nombre, 'pct', e.descuento_pct, 'hasta', e.vigente_hasta)
      from retail.etiquetas e
      where e.estilo = 'campana'
        and e.estado = 'aprobado'
        and e.activo
        and e.descuento_pct > 0
        and (e.vigente_desde is null or e.vigente_desde <= retail.fn_hoy_lima())
        and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
        and (
          exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
          or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
        )
      order by e.vigente_hasta nulls last, e.descuento_pct desc, e.nombre
      limit 1
    )
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: {nombre, pct, hasta} | null}. Solo la llama tienda_web.';

revoke all on function retail.tienda_portada() from public, anon, authenticated;
grant execute on function retail.tienda_portada() to tienda_web;

-- 3. Lo que #1190 dejó se archiva (solo existe en producción; en una base nueva no hay nada que archivar) ------------------------------

do $archivo$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'retail.campana_diseno(uuid)',
    'retail.campanas_lista()',
    'retail.campanas_portada_dias(date,date)',
    'retail.fn_campana_en_portada(date)',
    'retail.fn_campana_para_disenar(uuid)',
    'retail.fn_colores_de_portada_validos(jsonb)',
    'retail.fn_diseno_json(retail.campana_disenos)',
    'retail.guardar_diseno_borrador(uuid,jsonb,integer)',
    'retail.publicar_diseno_campana(uuid,integer)',
    'retail.volver_al_diseno_anterior(uuid)'
  ] loop
    continue when to_regprocedure(v_firma) is null;
    execute format('revoke execute on function %s from public, anon, authenticated', to_regprocedure(v_firma));
    execute format(
      'comment on function %s is %L',
      to_regprocedure(v_firma),
      'ARCHIVADA (ADR-0476, cierre de #1190 el 2026-10-24): parte del diseño de portada de #1190 (ADR-0436), que nunca se publicó. Ya nadie la llama: tienda_portada() volvió a la versión de main. No se borra (ADR-0476); borrarla es otra migración.'
    );
  end loop;

  if to_regclass('retail.campana_disenos') is not null then
    execute $c$comment on table retail.campana_disenos is
      'ARCHIVADA (ADR-0476, 2026-10-22; cierre de #1190, 2026-10-24): el diseño de portada de #1190 (ADR-0436), que nunca se publicó en el ERP. El diseño de cada campaña vive en campana_web_disenos (ADR-0471). Vacía al archivarse; ya nada la lee (tienda_portada() volvió a la versión de main) y sus funciones no se pueden llamar. No se borra.'$c$;
  end if;
end;
$archivo$;

-- 4. Comprobación -------------------------------------------------------------------------------------------------------------------

do $comprobar$
begin
  if (select md5(prosrc) from pg_proc where oid = 'retail.tienda_portada()'::regprocedure) <> '1c1e45c5d72db986e85ed8c895614eec' then
    raise exception 'retail.tienda_portada() no quedó como la de main.';
  end if;
  if not has_function_privilege('tienda_web', 'retail.tienda_portada()', 'execute')
     or has_function_privilege('authenticated', 'retail.tienda_portada()', 'execute')
     or has_function_privilege('anon', 'retail.tienda_portada()', 'execute') then
    raise exception 'Los permisos de retail.tienda_portada() no quedaron: solo tienda_web.';
  end if;
  if to_regprocedure('retail.campanas_lista()') is not null
     and (has_function_privilege('authenticated', 'retail.campanas_lista()', 'execute')
          or has_function_privilege('anon', 'retail.campanas_lista()', 'execute')) then
    raise exception 'retail.campanas_lista() sigue abierta.';
  end if;
  if to_regprocedure('retail.campanas_portada_dias(date,date)') is not null
     and (has_function_privilege('authenticated', 'retail.campanas_portada_dias(date,date)', 'execute')
          or has_function_privilege('anon', 'retail.campanas_portada_dias(date,date)', 'execute')) then
    raise exception 'retail.campanas_portada_dias(date,date) sigue abierta.';
  end if;
end;
$comprobar$;
