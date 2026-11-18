-- ============================================================================
-- 20261113195000 — «¿Qué módulos ves?» calcula quién eres una sola vez (ADR-0657, innovar «cambiar de módulo» #9)
--
-- EL PROBLEMA. Cada pantalla del ERP pregunta `fn_mis_modulos()` antes de dibujar el menú (`requirePersonaActualV2`). En producción
-- (pg_stat_statements, 22 h del 2026-11-12/13) tarda 34 ms de media y corre ~6.400 veces al día: es la más cara de las seis preguntas
-- de identidad del marco. La causa no es el tamaño de las tablas (decenas de filas): su cuerpo pregunta `fn_es_lider()` y
-- `fn_mi_rol_id()` DENTRO de la consulta, y esas dos llevan `security definer` y `set search_path`, así que Postgres no puede meterlas
-- en el plan: las ejecuta aparte. Peor, el planificador copia `rm.rol_id = fn_mi_rol_id()` a la tabla de roles y la evalúa fila por
-- fila. Medido en una copia local (EXPLAIN ANALYZE, integrante de Trujillo): 15 módulos × 5 roles = 75 llamadas a `fn_mi_rol_id()`
-- (y cada una llama a `fn_terminal_actual()`), 3,2 ms por pregunta contra 0,4 ms del líder, que no pasa por esa rama.
--
-- ANALOGÍA CAYLA. Para armar el menú de una vendedora, la encargada iba a preguntar «¿esta es líder?, ¿qué rol tiene?» a la oficina
-- de personal una vez por cada módulo de la lista. Ahora pregunta una vez al empezar, lo anota en una ficha y recorre la lista con
-- la ficha en la mano.
--
-- QUÉ HACE (sin cambiar lo que nadie ve):
--   1. `retail.fn_modulos_de(es_lider, es_admin, rol_id)` (nueva): LA regla de qué módulos ve una cuenta, con su identidad ya
--      resuelta. Es el mismo texto de `fn_mis_modulos` con las tres preguntas cambiadas por sus respuestas. Es SQL `stable` SIN
--      `security definer` ni `set search_path` a propósito, con todos los nombres calificados: así Postgres la mete dentro de la
--      consulta que la llama («regla por fila», la capa 2 de ADR-0657). Solo la llaman funciones `security definer` (como su dueño):
--      nadie de afuera la ejecuta (se le quita el permiso a public, anon, authenticated y service_role).
--   2. `retail.fn_mis_modulos()` sigue siendo la PUERTA (`security definer`, misma firma, mismas columnas, mismos permisos): calcula
--      «¿es líder?» una vez, y con eso «¿es admin?» (solo si es líder) y «¿qué rol tiene?» (solo si no lo es), en un CTE
--      materializado, y le pasa las respuestas a la regla. `fn_es_lider`, `fn_es_admin` y `fn_mi_rol_id` NO se tocan: leen
--      `public.personas` (Dynamic, con su propia RLS) y por eso siguen con `security definer`.
--   3. Marca con «[regla por fila]» en su comentario a las tres funciones que el repo ya había dejado sin esos ajustes a mano
--      (`fn_precios_en_sedes`, 20261031161000; `fn_trafico_web_personas` y `fn_trafico_web_prendas`, 20261101004000): desde ahora el
--      vigía del CI (`pnpm pruebas:reglas-por-fila`) falla si una función marcada vuelve a llevar `security definer` o
--      `set search_path` (pasó tres veces que se arregló a mano y nada impedía que volviera).
--
-- POR QUÉ ES LA MISMA RESPUESTA. `fn_es_admin()` exige todo lo que exige `fn_es_lider()` más `personas.rol = 'admin'`: si no es
-- líder, no es admin, y la regla solo mira `es_admin` en la rama del líder. `fn_mi_rol_id()` solo se mira en la rama de quien no es
-- líder. Comparado en la copia local con todas las cuentas de `apps/web/tema/cuentas.mjs` (admin, integrante, las dos terminales, el
-- rol personalizado) y con casos armados (líder sin admin, terminal desactivada, cuenta sin fila, sin sesión, rol archivado, rol
-- limitado): misma salida fila por fila. Lo sigue vigilando `pnpm pruebas:mi-sesion` (la regla de antes, escrita como consulta,
-- contra la función nueva) y `pnpm pruebas:roles`.
--
-- DECIDÍ: una regla aparte que la puerta llama con la identidad resuelta, porque `fn_mi_sesion` (20261113200000) la usa también:
--   la regla de qué módulos ves vive en un solo lugar.
-- DESCARTÉ: quitarle `security definer` a `fn_es_lider`/`fn_mi_rol_id` (leen `public.personas`: sin definer responderían «sin acceso»
--   a toda la tienda por la RLS de Dynamic); reescribir `fn_ve_modulo` en este mismo paso (la llaman casi todas las funciones que
--   guardan; va aparte, con su propia medición).
-- SE ROMPE SI: alguien le pone `security definer` o `set search_path` a `fn_modulos_de` (no da error: vuelve la lentitud; lo frena el
--   vigía), o hace que la regla lea `public.personas` (respondería «sin acceso»; también lo frena el vigía).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (esperar el OK de Felipe). Pegar ESTE archivo tal cual en el SQL Editor, de una vez, ANTES que
-- 20261113200000. Solo `create or replace function`, permisos y comentarios: no toca tablas ni políticas ni `drop trigger`, así que
-- no toma auth/storage (CLAUDE.md «Políticas y deadlocks»). `lock_timeout` 3 s. Idempotente: se puede pegar dos veces. El candado de
-- abajo aborta todo sin tocar nada si el cuerpo vivo de `fn_mis_modulos` no es el de main ni el de este archivo.
-- PARA VOLVER ATRÁS: pegar el `create or replace function retail.fn_mis_modulos()` de 20260929140000 (la regla nueva queda sin uso).
-- CAÍDA EXTERNA. Nada llama a la red; si la base no responde, la web ya manda a /sin-base (ADR-0450).
-- ============================================================================

set search_path = retail, public, extensions;

-- ============================== CANDADO (corre primero) ==============================
-- `fn_mis_modulos` se reescribe ENTERA desde su cuerpo de main (20260929140000). Si en la base el cuerpo vivo es otro, pegar esto
-- pisaría ese cambio: aborta y dice cuál. Acepta el de main y el de este archivo (se puede pegar dos veces). Si salta: reescribirla
-- desde su `pg_get_functiondef` real antes de pegar. Las tres preguntas de identidad que usa tienen que existir.
do $candado$
declare r record; v_md5 text;
begin
  for r in select * from (values
    ('retail.fn_mis_modulos()', '966a675b7bce8134678a9e5a9d4f4bd3', 'f9d928b2d2b946b4edffee654a5b91e6')
  ) as t(firma, md5_main, md5_nuevo) loop
    v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is null then
      raise exception 'Falta %: esta migración no la crea, solo la reescribe.', r.firma;
    end if;
    if v_md5 not in (r.md5_main, r.md5_nuevo) then
      raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main ni el de este archivo. Reescríbela desde su definición real antes de pegar.', r.firma, v_md5;
    end if;
  end loop;
  if to_regprocedure('retail.fn_es_lider()') is null or to_regprocedure('retail.fn_es_admin()') is null
     or to_regprocedure('retail.fn_mi_rol_id()') is null then
    raise exception 'Faltan fn_es_lider, fn_es_admin o fn_mi_rol_id: esta migración las usa y no las crea.';
  end if;
end
$candado$;

set lock_timeout = '3s';

-- ============================== 1. La regla (capa 2: sin ajustes) ==============================
create or replace function retail.fn_modulos_de(p_es_lider boolean, p_es_admin boolean, p_rol_id uuid)
returns table(clave text, completo boolean)
language sql
stable
as $$
  select m.clave, true
    from retail.modulos m
   where p_es_lider
     and (not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = m.clave) or (m.del_admin and p_es_admin))
  union all
  select m.clave, not r.limitado_como_hoy
    from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
   where not p_es_lider and rm.rol_id = p_rol_id;
$$;

comment on function retail.fn_modulos_de(boolean, boolean, uuid) is
  '[regla por fila] Qué módulos ve una cuenta, con su identidad ya resuelta (ADR-0161/0178): el líder, todos salvo los que se le quitaron al Líder de equipo (los del Admin, si es Admin); quien no es líder, los de su rol (no archivado, no fijo), delegables y no «solo del líder». La llaman fn_mis_modulos y fn_mi_sesion. Sin security definer ni search_path a propósito, con nombres calificados, para que Postgres la meta en la consulta (ADR-0657). No lee public.personas. Solo la llaman funciones security definer.';

revoke all on function retail.fn_modulos_de(boolean, boolean, uuid) from public, anon, authenticated, service_role;

-- ============================== 2. La puerta (capa 1: security definer) ==============================
create or replace function retail.fn_mis_modulos()
returns table(clave text, completo boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with lider as materialized (
    select retail.fn_es_lider() as es_lider
  ), yo as materialized (
    select l.es_lider,
           case when l.es_lider then retail.fn_es_admin() else false end as es_admin,
           case when l.es_lider then null::uuid else retail.fn_mi_rol_id() end as rol_id
      from lider l
  )
  select m.clave, m.completo
    from yo
    cross join lateral retail.fn_modulos_de(yo.es_lider, yo.es_admin, yo.rol_id) m;
$$;

comment on function retail.fn_mis_modulos() is
  'Los módulos que ve la cuenta de la sesión (el menú, los permisos y exigirModulo de la web). Puerta security definer: calcula una vez si es líder, si es Admin y su rol, y le pregunta a fn_modulos_de (ADR-0657).';

-- ============================== 3. Las reglas que ya existían, marcadas ==============================
-- Se antepone «[regla por fila] » a su comentario (o se le escribe uno), sin borrar lo que ya decía. Si una no existe en esta base,
-- se avisa y se sigue: el vigía del CI exige que estén.
do $marcar$
declare r record; v_oid regprocedure; v_comentario text;
begin
  for r in select * from (values
    ('retail.fn_precios_en_sedes(uuid[],uuid[])', ''),
    ('retail.fn_trafico_web_personas(date,date,text,text)', 'Tráfico de la tienda web: las personas (visitantes) del rango, con el camino por el que llegaron. La llama solo resumen_trafico_web (20261101004000).'),
    ('retail.fn_trafico_web_prendas(date,date,text,text)', 'Tráfico de la tienda web: hasta dónde llegó la gente con cada prenda. La llama solo resumen_trafico_web (20261101004000).')
  ) as t(firma, si_no_tiene) loop
    v_oid := to_regprocedure(r.firma);
    if v_oid is null then
      raise notice 'No está %: no se marca.', r.firma;
      continue;
    end if;
    v_comentario := obj_description(v_oid, 'pg_proc');
    if v_comentario is null or v_comentario not like '[regla por fila]%' then
      execute format('comment on function %s is %L', v_oid, '[regla por fila] ' || coalesce(v_comentario, r.si_no_tiene));
    end if;
  end loop;
end
$marcar$;

reset lock_timeout;
