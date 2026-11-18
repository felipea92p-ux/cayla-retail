-- ============================================================================
-- 20261026234000 — Movimientos: ver por separado lo de CAYLA y lo de CLAURE (ADR-0532)
--
-- QUÉ ES. Felipe (2026-10-26): «añade un filtro para ver las ventas de CLAURE y las ventas de CAYLA por separado en Movimientos». La
-- lista y sus cifras salen de dos funciones (`fn_movimientos` y `fn_movimientos_resumen_procesos`), paginadas en la base: el filtro
-- tiene que ir en ellas, o la página y las cifras mentirían. Las dos ganan `p_empresa_id` (por defecto null = todo, como antes): un
-- movimiento pasa si su prenda es de esa empresa EN LA SEDE QUE SE MIRA, con la regla única de 20261026232000
-- (`fn_empresa_de_prenda_en_sede`: en Lima, marca CAYLA → CAYLA; cualquier otra → CLAURE).
--
-- CÓMO SE PARCHA (CLAUDE.md, «parches vivos»). Ninguna se reescribe desde un archivo: se corta sobre `pg_get_functiondef`, cada
-- reemplazo ancla en un texto que aparece EXACTAMENTE una vez, y todo va con candado de huella (md5 normalizado, sin comentarios ni
-- espacios) antes y después. Huellas «antes» iguales en producción y en local, leídas el 2026-10-26 (solo lectura). Con otra huella
-- aborta sin tocar nada: alguien la cambió y hay que rehacer el parche sobre ESA versión. Como cambia la firma (un parámetro más), se
-- crea la nueva y se borra la vieja en la misma transacción: con las dos, una llamada sin `p_empresa_id` sería ambigua en PostgREST.
-- Los permisos de la nueva son los de la vieja (postgres y authenticated).
--
-- PRODUCCIÓN. Pegar DESPUÉS de 20261026232000 y antes de publicar la web. Sin tablas tomadas, sin políticas ni `drop trigger`:
-- `create function` + `drop function` (CLAUDE.md «Políticas y deadlocks»: no toman `auth`/`storage`). Con la web vieja no pasa nada
-- (no manda el parámetro nuevo y las dos funciones lo tienen con valor de fábrica). Idempotente: la segunda vez avisa y no toca nada.
--
-- VERIFICACIÓN (solo lectura): las huellas «después» de abajo.
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_movimientos', 'fn_movimientos_resumen_procesos');
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.empresa_md5(p_firma text)
returns text
language sql
as $f$
  select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
    from pg_proc p where p.oid = to_regprocedure(p_firma)
$f$;

-- Reemplaza `p_ancla` por `p_nuevo` si y solo si aparece exactamente una vez.
create or replace function pg_temp.empresa_reemplazar(p_texto text, p_ancla text, p_nuevo text)
returns text
language plpgsql
as $f$
begin
  if (length(p_texto) - length(replace(p_texto, p_ancla, ''))) / length(p_ancla) <> 1 then
    raise exception 'filtro por empresa: la marca «%» no aparece exactamente una vez en la función. No se toca nada.', left(p_ancla, 70);
  end if;
  return replace(p_texto, p_ancla, p_nuevo);
end
$f$;

do $migracion$
declare
  c_lista_vieja constant text := 'retail.fn_movimientos(uuid,date,date,text,text,text,uuid,uuid,timestamp with time zone,uuid,integer,uuid)';
  c_lista_nueva constant text := 'retail.fn_movimientos(uuid,date,date,text,text,text,uuid,uuid,timestamp with time zone,uuid,integer,uuid,uuid)';
  c_lista_antes constant text := '8ca7cbe69eb8dc0f1eb665ba469807fe';
  c_lista_despues constant text := '4aac753eee6f7081649f2182ba32c1e1';
  c_resumen_viejo constant text := 'retail.fn_movimientos_resumen_procesos(uuid,date,date,text,text,uuid,uuid)';
  c_resumen_nuevo constant text := 'retail.fn_movimientos_resumen_procesos(uuid,date,date,text,text,uuid,uuid,uuid)';
  c_resumen_antes constant text := '1a99cd9522567544ef96928be806cf59';
  c_resumen_despues constant text := '99ac6aac24a4ef1a65d10c52a6c1e777';
  v_md5 text;
  v_def text;
begin
  -- ---------- 1. fn_movimientos: la lista ----------
  if to_regprocedure(c_lista_nueva) is not null then
    if pg_temp.empresa_md5(c_lista_nueva) <> c_lista_despues then
      raise exception '% ya tiene p_empresa_id pero con otra huella (%): no se toca a ciegas.', c_lista_nueva, pg_temp.empresa_md5(c_lista_nueva);
    end if;
    raise notice 'fn_movimientos ya filtra por empresa: no se toca.';
  else
    v_md5 := pg_temp.empresa_md5(c_lista_vieja);
    if v_md5 is null then
      raise exception '% no existe en esta base.', c_lista_vieja;
    elsif v_md5 <> c_lista_antes then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba %). Lee su definición viva y rehace este parche sobre ESA versión.',
        c_lista_vieja, v_md5, c_lista_antes;
    end if;
    v_def := pg_get_functiondef(c_lista_vieja::regprocedure);
    v_def := pg_temp.empresa_reemplazar(v_def,
      $a$p_limite integer DEFAULT 50, p_producto_id uuid DEFAULT NULL::uuid)$a$,
      $n$p_limite integer DEFAULT 50, p_producto_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid)$n$);
    v_def := pg_temp.empresa_reemplazar(v_def,
      $a$    and (v_variantes_producto is null or m.variante_id = any(v_variantes_producto))$a$,
      $n$    and (v_variantes_producto is null or m.variante_id = any(v_variantes_producto))
    and (p_empresa_id is null or fn_empresa_de_prenda_en_sede(va.producto_id, p_ubicacion_id) = p_empresa_id) /* ADR-0532: filtro_empresa */$n$);
    execute v_def;
    execute 'drop function ' || c_lista_vieja;
    execute 'revoke all on function ' || c_lista_nueva || ' from public, anon';
    execute 'grant execute on function ' || c_lista_nueva || ' to authenticated';
    v_md5 := pg_temp.empresa_md5(c_lista_nueva);
    if v_md5 <> c_lista_despues then
      raise exception 'filtro por empresa: fn_movimientos quedó con md5 % y se esperaba %.', v_md5, c_lista_despues;
    end if;
  end if;

  -- ---------- 2. fn_movimientos_resumen_procesos: las cifras ----------
  if to_regprocedure(c_resumen_nuevo) is not null then
    if pg_temp.empresa_md5(c_resumen_nuevo) <> c_resumen_despues then
      raise exception '% ya tiene p_empresa_id pero con otra huella (%): no se toca a ciegas.', c_resumen_nuevo, pg_temp.empresa_md5(c_resumen_nuevo);
    end if;
    raise notice 'fn_movimientos_resumen_procesos ya filtra por empresa: no se toca.';
  else
    v_md5 := pg_temp.empresa_md5(c_resumen_viejo);
    if v_md5 is null then
      raise exception '% no existe en esta base.', c_resumen_viejo;
    elsif v_md5 <> c_resumen_antes then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba %). Lee su definición viva y rehace este parche sobre ESA versión.',
        c_resumen_viejo, v_md5, c_resumen_antes;
    end if;
    v_def := pg_get_functiondef(c_resumen_viejo::regprocedure);
    v_def := pg_temp.empresa_reemplazar(v_def,
      $a$p_usuario_id uuid DEFAULT NULL::uuid, p_sububicacion_id uuid DEFAULT NULL::uuid)$a$,
      $n$p_usuario_id uuid DEFAULT NULL::uuid, p_sububicacion_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid)$n$);
    v_def := pg_temp.empresa_reemplazar(v_def,
      $a$      and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)$a$,
      $n$      and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
      and (p_empresa_id is null or fn_empresa_de_prenda_en_sede((select va.producto_id from variantes va where va.id = m.variante_id), p_ubicacion_id) = p_empresa_id) /* ADR-0532: filtro_empresa */$n$);
    execute v_def;
    execute 'drop function ' || c_resumen_viejo;
    execute 'revoke all on function ' || c_resumen_nuevo || ' from public, anon';
    execute 'grant execute on function ' || c_resumen_nuevo || ' to authenticated';
    v_md5 := pg_temp.empresa_md5(c_resumen_nuevo);
    if v_md5 <> c_resumen_despues then
      raise exception 'filtro por empresa: fn_movimientos_resumen_procesos quedó con md5 % y se esperaba %.', v_md5, c_resumen_despues;
    end if;
  end if;
end
$migracion$;
