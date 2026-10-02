-- ============================================================================
-- 20261003111000_redondeo_lectores.sql — CAYLA V2 (ADR-0310, actividad 2, PARTE 2 de 2)
--
-- EL CAMBIO. Tres funciones que leen `venta_pagos` aprenden que el medio 'redondeo' (lo que no se cobró por redondear el
-- efectivo al múltiplo de S/ 0.10, hacia abajo) NO es dinero que entró ni una forma de pago. Se parchan ANTES de que exista la
-- primera fila de redondeo, para que el primer día ya lo encuentre todo listo. Sin filas de redondeo no cambia ni un número.
--
--   1. `fn_cuenta_sellada`: el redondeo no mueve plata, igual que 'anticipo' y 'saldo_a_favor': no lleva cuenta. Sin esto el
--      trigger de sellado le estampa la cuenta de transferencia (un banco) a una fila que no es plata.
--   2. `fn_resumen_caja` (Caja): el redondeo sale de `por_metodo`, de `otros` y de `ventas_otros` (no es «cobrado» ni «Otro»)
--      y viaja aparte en la clave `redondeo`. «Efectivo en el cajón» no cambia: la fila de efectivo ya trae lo físico.
--   3. `fn_ventas_del_dia`: la lista de medios de una venta no dice «efectivo + redondeo» (la caja lo mostraba como «Otro»).
--
-- LO QUE NO SE TOCA, y por qué. `fn_calcular_esperado_caja`, `fn_flujo_lineas` y el vuelto leen el monto de la fila de efectivo,
-- que ya es lo físico (múltiplo de 0.10). `fn_totales_historial_ventas` (Historial) deja el redondeo como una fila más de
-- «cómo se pagó» a propósito: así esa lista sigue sumando el total vendido. `fn_asientos` lo trata la actividad 3.
--
-- CÓMO SE PARCHA (CLAUDE.md, «parches vivos»). Ninguna se reescribe desde un archivo: se corta sobre `pg_get_functiondef`, cada
-- reemplazo ancla en un texto que debe aparecer EXACTAMENTE una vez, y todo va con candado de huella (md5 normalizado, sin
-- comentarios ni espacios) antes y después. Con una huella que no sea la conocida aborta sin tocar nada: alguien la cambió y hay
-- que rehacer el parche sobre ESA versión. Huellas «antes» verificadas en producción, solo lectura, el 2026-10-02.
--
-- PRODUCCIÓN. Pegar SOLA, DESPUÉS de la parte 1 (`20261003110000`) y antes de publicar la web. No toma ninguna tabla ni toca
-- políticas ni `drop trigger`: son tres `create or replace`. Con la web vieja no pasa nada (no hay filas de redondeo todavía).
-- Idempotente: la segunda vez avisa y no toca nada.
--
-- VERIFICACIÓN (solo lectura): las tres huellas «después» de abajo.
--   select p.proname, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_cuenta_sellada', 'fn_resumen_caja', 'fn_ventas_del_dia');
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.redondeo_md5(p_firma text)
returns text
language sql
as $f$
  select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
    from pg_proc p where p.oid = to_regprocedure(p_firma)
$f$;

-- Reemplaza `p_ancla` por `p_nuevo` si y solo si aparece exactamente una vez.
create or replace function pg_temp.redondeo_reemplazar(p_texto text, p_ancla text, p_nuevo text)
returns text
language plpgsql
as $f$
begin
  if (length(p_texto) - length(replace(p_texto, p_ancla, ''))) / length(p_ancla) <> 1 then
    raise exception 'redondeo: la marca «%» no aparece exactamente una vez en la función. No se toca nada.', left(p_ancla, 70);
  end if;
  return replace(p_texto, p_ancla, p_nuevo);
end
$f$;

do $migracion$
declare
  c_sellada constant text := 'retail.fn_cuenta_sellada(text,text,uuid,date,uuid)';
  c_sellada_antes constant text := 'cbaaccb42a59272a88b854aa79bd9746';
  c_sellada_despues constant text := 'ebe23eeff86c0814d4faf0e78521bc00';
  c_resumen constant text := 'retail.fn_resumen_caja(uuid)';
  c_resumen_antes constant text := '72dab7b74ac3da0d541d6a575680b0ca';
  c_resumen_despues constant text := 'ab7495db3cc96abda90b61eb977e106b';
  c_dia constant text := 'retail.fn_ventas_del_dia(uuid)';
  c_dia_antes constant text := '3ab77169d3cc381e46db6b5b0e3e6f4e';
  c_dia_despues constant text := 'cde71227a0b7b41aae8ab1a8b67b49db';
  v_md5 text;
  v_def text;
begin
  -- ---------- 1. fn_cuenta_sellada: el redondeo no mueve plata ----------
  v_md5 := pg_temp.redondeo_md5(c_sellada);
  if v_md5 is null then
    raise exception '% no existe en esta base.', c_sellada;
  end if;
  if v_md5 = c_sellada_despues then
    raise notice 'fn_cuenta_sellada ya conoce el redondeo: no se toca.';
  elsif v_md5 <> c_sellada_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_sellada, v_md5, c_sellada_antes, c_sellada_despues;
  else
    v_def := pg_get_functiondef(c_sellada::regprocedure);
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$if p_medio is null or p_medio in ('anticipo', 'saldo_a_favor') then$a$,
      $n$-- ADR-0310: el redondeo del efectivo (lo que no se cobró por llegar a la moneda de S/ 0.10) tampoco mueve plata.
  if p_medio is null or p_medio in ('anticipo', 'saldo_a_favor', 'redondeo') then$n$);
    execute v_def;
    v_md5 := pg_temp.redondeo_md5(c_sellada);
    if v_md5 <> c_sellada_despues then
      raise exception 'redondeo: fn_cuenta_sellada quedó con md5 % y se esperaba %.', v_md5, c_sellada_despues;
    end if;
  end if;

  -- ---------- 2. fn_resumen_caja: el redondeo no es cobrado ni «Otro», y viaja aparte ----------
  v_md5 := pg_temp.redondeo_md5(c_resumen);
  if v_md5 is null then
    raise exception '% no existe en esta base.', c_resumen;
  end if;
  if v_md5 = c_resumen_despues then
    raise notice 'fn_resumen_caja ya conoce el redondeo: no se toca.';
  elsif v_md5 <> c_resumen_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_resumen, v_md5, c_resumen_antes, c_resumen_despues;
  else
    v_def := pg_get_functiondef(c_resumen::regprocedure);
    -- la variable
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$  v_otros numeric;
begin$a$,
      $n$  v_otros numeric;
  v_redondeo numeric;
begin$n$);
    -- «cómo se cobró»: sin el redondeo
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$sum(monto) as monto from pagos group by metodo$a$,
      $n$sum(monto) as monto from pagos where metodo <> 'redondeo' group by metodo$n$);
    -- la serie por hora: el redondeo no es «otros»
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$filter (where metodo <> 'efectivo'), 0) as otros$a$,
      $n$filter (where metodo not in ('efectivo', 'redondeo')), 0) as otros$n$);
    -- «ventas_otros» sin el redondeo, y el redondeo aparte
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$(select coalesce(sum(monto), 0) from pagos where metodo <> 'efectivo')$a$,
      $n$(select coalesce(sum(monto), 0) from pagos where metodo not in ('efectivo', 'redondeo')),
    (select coalesce(sum(monto), 0) from pagos where metodo = 'redondeo')$n$);
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$v_por_hora, v_otros;$a$,
      $n$v_por_hora, v_otros, v_redondeo;$n$);
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$'ventas_otros', v_otros,$a$,
      $n$'ventas_otros', v_otros,
    -- ADR-0310: lo que no se cobró por redondear el efectivo al múltiplo de S/ 0.10, hacia abajo. No es una forma de pago:
    -- no entra en `por_metodo`, ni en `otros`, ni en lo cobrado del turno.
    'redondeo', v_redondeo,$n$);
    execute v_def;
    v_md5 := pg_temp.redondeo_md5(c_resumen);
    if v_md5 <> c_resumen_despues then
      raise exception 'redondeo: fn_resumen_caja quedó con md5 % y se esperaba %.', v_md5, c_resumen_despues;
    end if;
  end if;

  -- ---------- 3. fn_ventas_del_dia: «efectivo + redondeo» no es una forma de pago ----------
  v_md5 := pg_temp.redondeo_md5(c_dia);
  if v_md5 is null then
    raise exception '% no existe en esta base.', c_dia;
  end if;
  if v_md5 = c_dia_despues then
    raise notice 'fn_ventas_del_dia ya conoce el redondeo: no se toca.';
  elsif v_md5 <> c_dia_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_dia, v_md5, c_dia_antes, c_dia_despues;
  else
    v_def := pg_get_functiondef(c_dia::regprocedure);
    v_def := pg_temp.redondeo_reemplazar(v_def,
      $a$string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id$a$,
      $n$string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id and vp.metodo <> 'redondeo'$n$);
    execute v_def;
    v_md5 := pg_temp.redondeo_md5(c_dia);
    if v_md5 <> c_dia_despues then
      raise exception 'redondeo: fn_ventas_del_dia quedó con md5 % y se esperaba %.', v_md5, c_dia_despues;
    end if;
  end if;

  -- ---------- Validación final: si algo no quedó como se espera, se aborta TODO ----------
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_cuenta_sellada', 'fn_resumen_caja', 'fn_ventas_del_dia')) <> 3 then
    raise exception 'redondeo: quedaron sobrecargas de las funciones parchadas.';
  end if;
  if position($v$'redondeo'$v$ in pg_get_functiondef(c_sellada::regprocedure)) = 0
     or position($v$'redondeo'$v$ in pg_get_functiondef(c_resumen::regprocedure)) = 0
     or position($v$'redondeo'$v$ in pg_get_functiondef(c_dia::regprocedure)) = 0 then
    raise exception 'redondeo: alguna de las tres funciones no nombra el redondeo.';
  end if;
end
$migracion$;
