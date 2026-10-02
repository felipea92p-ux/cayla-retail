-- ============================================================================
-- 20261001150000_descuento_sin_codigo.sql — CAYLA V2 (Felipe 2026-10-01)
--
-- EL PROBLEMA. Desde el 2026-09-25 (20260925230000) todo descuento a mano que pase el 15 % pide un argumento escrito, lo
-- aplique quien lo aplique. Pero `registrar_venta` seguía exigiendo, a toda cuenta que no es Líder (colaboradoras y las
-- terminales de caja), un CÓDIGO de descuento creado por un Líder (`codigos_descuento`, ADR-0048 y ADR-0162): la caja no
-- podía dar ni un 5 % sin ir a buscar a un Líder. Felipe (2026-10-01): «con el argumento bastaba»; el código se quita del
-- todo.
--
-- QUÉ HACE. Corta de `registrar_venta` el bloque del código (`venta_descuento_requiere_codigo`,
-- `venta_codigo_descuento_invalido`, `venta_descuento_supera_codigo`) y sus dos variables. Todo lo demás del descuento a
-- mano queda igual, para todos: motivo de la lista (y su detalle si es «Otro»), argumento escrito pasado el 15 %, nunca
-- bajo el costo, y no menos que la campaña. El 35 % sigue siendo solo del Líder.
--
-- DECIDÍ: Felipe (2026-10-01): la caja queda SIN tope de % — solo argumento. El freno que queda es el costo de la prenda
--   (`venta_descuento_bajo_costo`). Se le ofreció extender el 35 % del Líder a todos y eligió no hacerlo.
-- DECIDÍ: `p_codigo_descuento` se queda en la firma, sin leerse. Sacarlo cambiaría la firma (drop + create y una ventana sin
--   función), y una venta encolada sin conexión antes de este cambio todavía puede traerlo (`lib/ventas-offline.ts`).
-- DECIDÍ: `codigos_descuento` no se toca: es historial y nada se borra (CLAUDE.md). Ya nadie la lee al vender.
-- DESCARTÉ: reescribir `registrar_venta` desde un archivo (su versión viva no es la de ningún archivo entero); se recorta
--   sobre `pg_get_functiondef`, anclado entre dos marcas, con candado de versión antes y validación después.
-- DESCARTÉ: escribir el bloque viejo literal como texto a reemplazar: trae un `select * into`, y el SQL Editor lo tomaría
--   por un SELECT INTO que crea una tabla (ADR-0288). Se ubica por sus marcas de inicio y fin.
--
-- CANDADO DE VERSIÓN. Compara el md5 NORMALIZADO (sin comentarios ni espacios) del cuerpo vivo de `registrar_venta` (la de
-- 17 parámetros) con el «después» de la tanda 1c del club (20260930230200, el que está en producción el 2026-10-01) o con
-- el de después de este archivo. Con cualquier otro, aborta sin tocar nada.
--
-- PRODUCCIÓN: pegar en el SQL Editor, SOLO, ANTES de publicar la web (la web nueva ya no manda código: con la base vieja,
-- una colaboradora o una terminal que descuente sería rechazada por falta de código). Con la base nueva y la web vieja no
-- pasa nada: el código que mande se ignora. Sin políticas ni `drop trigger`; no toma ninguna tabla en uso. Se puede pegar
-- dos veces (la segunda no hace nada).
--
-- VERIFICACIÓN (solo lectura):
--   select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g')),
--          position('requiere_codigo' in p.prosrc) = 0
--     from pg_proc p where p.oid = 'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)'::regprocedure;
--   → el md5 «después» de la sección 0 | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $migracion$
declare
  c_firma constant text := 'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)';
  c_antes constant text := '2b55a94a754e7708f5b133008f30469f';   -- «después» de 20260930230200 (club, tanda 1c)
  c_despues constant text := '9f4c5e24d4d315d5f244e24d351a190f'; -- «después» de este archivo
  -- Las marcas: dónde empieza el bloque del código y lo primero que sigue a él (la suma de los pagos).
  c_inicio constant text := $m$  -- El código de una colaboradora autoriza solo los descuentos MANUALES: una$m$;
  c_fin constant text := $m$  for v_pago in select * from jsonb_array_elements(p_pagos) loop$m$;
  c_nuevo constant text := $n$  -- Felipe 2026-10-01: el descuento a mano ya no pide código de descuento, a nadie. Lo que lo frena es lo de
  -- cada línea, arriba: motivo, argumento pasado el 15 %, costo, campaña y el 35 % del Líder.

$n$;
  v_md5 text;
  v_def text;
  v_desde integer;
  v_largo integer;
begin
  v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
              from pg_proc p where p.oid = to_regprocedure(c_firma));
  if v_md5 is null then
    raise exception '% no existe en esta base: pega antes la tanda 1c del club (20260930230000, 230100 y 230200).', c_firma;
  end if;
  if v_md5 = c_despues then
    raise notice 'registrar_venta ya está sin código de descuento: no se toca.';
    return;
  end if;
  if v_md5 <> c_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
      c_firma, v_md5, c_antes, c_despues;
  end if;

  v_def := pg_get_functiondef(c_firma::regprocedure);

  -- 1. El bloque del código: desde su comentario hasta la suma de los pagos (la primera que le sigue).
  if (length(v_def) - length(replace(v_def, c_inicio, ''))) / length(c_inicio) <> 1 then
    raise exception 'descuento sin código: la marca de inicio no aparece exactamente una vez en registrar_venta.';
  end if;
  v_desde := position(c_inicio in v_def);
  v_largo := position(c_fin in substr(v_def, v_desde)) - 1;
  if v_largo <= 0
     or position('venta_descuento_requiere_codigo' in substr(v_def, v_desde, v_largo)) = 0
     or position('venta_descuento_supera_codigo' in substr(v_def, v_desde, v_largo)) = 0 then
    raise exception 'descuento sin código: el tramo entre las marcas no es el bloque del código. No se toca nada.';
  end if;
  v_def := overlay(v_def placing c_nuevo from v_desde for v_largo);

  -- 2. Sus dos variables, que ya no usa nadie.
  if position($v$  v_codigo codigos_descuento%rowtype;
$v$ in v_def) = 0
     or position($v$  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
$v$ in v_def) = 0 then
    raise exception 'descuento sin código: no se encontraron las variables del código en registrar_venta.';
  end if;
  v_def := replace(v_def, $v$  v_codigo codigos_descuento%rowtype;
$v$, '');
  v_def := replace(v_def, $v$  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
$v$, '');
  v_def := replace(v_def, $v$-- descuento MANUAL (el que pide código a una colaboradora)$v$, $v$-- hay descuento MANUAL en la venta$v$);

  execute v_def;

  -- 3. Validación: si algo no quedó como se espera, se aborta TODO.
  v_def := pg_get_functiondef(c_firma::regprocedure);
  if position('codigo_descuento_invalido' in v_def) > 0 or position('requiere_codigo' in v_def) > 0
     or position('supera_codigo' in v_def) > 0 or position('codigos_descuento' in v_def) > 0 then
    raise exception 'descuento sin código: registrar_venta todavía nombra el código.';
  end if;
  if position('venta_descuento_requiere_argumento' in v_def) = 0 or position('venta_descuento_bajo_costo' in v_def) = 0 then
    raise exception 'descuento sin código: registrar_venta perdió el argumento o el candado de costo.';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta') <> 1 then
    raise exception 'descuento sin código: quedaron sobrecargas de registrar_venta.';
  end if;
  v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
              from pg_proc p where p.oid = to_regprocedure(c_firma));
  if v_md5 <> c_despues then
    raise exception 'descuento sin código: registrar_venta quedó con md5 % y se esperaba %.', v_md5, c_despues;
  end if;
end
$migracion$;

comment on table retail.codigos_descuento is
  'Legado (ADR-0048): códigos que autorizaban el descuento a mano de una colaboradora o una terminal. Desde 20261001150000_descuento_sin_codigo.sql (Felipe, 2026-10-01) registrar_venta ya no los pide ni los lee; la tabla queda como historial.';
