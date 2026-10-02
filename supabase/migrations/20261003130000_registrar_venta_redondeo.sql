-- ============================================================================
-- 20261003130000_registrar_venta_redondeo.sql — CAYLA V2 (ADR-0310, actividad 5, PARTE 1 de 2)
--
-- EL CAMBIO. `registrar_venta` acepta una fila `metodo = 'redondeo'` entre los pagos de una venta: lo que NO se cobró por redondear
-- el efectivo al múltiplo de S/ 0.10, hacia abajo (la moneda más chica que circula; Ley 29571 art. 44). La venta de 79.88 se cobra con
-- efectivo 79.80 + redondeo 0.08. La suma de TODAS las filas sigue igualando la suma de los ítems, sin tolerancia, y la boleta
-- sigue por el precio exacto: el redondeo es del cobro, no del precio.
--
-- EL CONTRATO (Liskov). La base VERIFICA el redondeo, no lo reescribe ni se lo cree a la caja. Una venta con redondeo exige:
--   · a lo más UNA fila de redondeo, y exactamente UN pago en efectivo (el redondeo solo existe junto al efectivo);
--   · el efectivo en múltiplos de S/ 0.10 (monedas que existen) y el redondeo entre S/ 0.01 y S/ 0.09;
--   · que el redondeo sea EXACTAMENTE el de la ley, `fn_redondeo_efectivo(efectivo + redondeo)`. Para cada monto hay un solo redondeo de
--     0.00 a 0.09 que deja el efectivo en múltiplo de 0.10, así que un cliente manipulado (o un error de la caja) no tiene un margen
--     donde mandar «otro» redondeo.
-- Una venta SIN fila de redondeo se acepta como siempre, con el efectivo exacto: la cola de ventas sin conexión de una caja con la
-- versión vieja que sube después de este cambio no pierde ninguna venta (Vogels: todo falla, nada se pierde). Cada rechazo lleva
-- el hint `venta_redondeo_invalido` y un mensaje en español.
--
-- LO QUE NO CAMBIA. La firma (18 parámetros: cambiarla obliga a un `drop` y a una ventana sin función), el comprobante (se emite por
-- la suma exacta de los ítems), el IGV, el stock, la caja, y el resto de las validaciones. `venta_pagos` guarda el redondeo con los
-- candados de la actividad 2 (menor de 0.10, un redondeo por venta, sin `recibido` ni referencia). Todo en la MISMA transacción de
-- siempre: la venta, sus pagos y su redondeo entran todo-o-nada (Gray).
--
-- COMO SE PARCHA. `registrar_venta` es la función más parchada del repo y su cuerpo vivo no es el de ningún archivo entero: se corta sobre
-- `pg_get_functiondef`, con dos anclas que deben aparecer EXACTAMENTE una vez (sus variables y justo después de exigir que los pagos
-- sumen el total) y candado de huella (md5 normalizado, sin comentarios ni espacios) antes y después. Con otra huella aborta sin
-- tocar nada. Huella «antes» verificada en producción, solo lectura, el 2026-10-02: `525479a9…` (la de la tanda 1g del club menos el
-- código de descuento, 20261002100000).
--
-- PRODUCCIÓN. Pegar SOLA, DESPUÉS de las tres partes anteriores (`20261003100000` la regla, `20261003110000` el candado de
-- `venta_pagos` y `20261003111000` los lectores, más `20261003120000` el diario) y DESPUÉS de publicar la web: con la web nueva y esta base,
-- nadie manda todavía el redondeo hasta que la bandera `fn_acepta_redondeo_efectivo` (parte 2, `20261003140000`) exista. Sin tablas,
-- políticas ni `drop trigger`. Idempotente: la segunda vez avisa y no toca nada. Aborta si falta alguna de las partes de las que depende.
--
-- VERIFICACIÓN (solo lectura):
--   select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g')),
--          position('venta_redondeo_invalido' in p.prosrc) > 0
--     from pg_proc p where p.oid = 'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)'::regprocedure;
--   → la huella «después» de abajo | t
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

do $migracion$
declare
  c_firma constant text := 'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)';
  c_antes constant text := '525479a95e59063b5f9e86f63119e27e';   -- «después» de 20261002100000 (el de producción el 2026-10-02)
  c_despues constant text := '6783f3971aff6967ca2ab54c07a4202a';                          -- «después» de este archivo
  c_ancla_vars constant text := $a$v_total_pagos numeric := 0;$a$;
  c_vars_nuevas constant text := $n$v_total_pagos numeric := 0;
  v_n_redondeo integer;
  v_n_efectivo integer;
  v_monto_redondeo numeric;
  v_monto_efectivo numeric;$n$;
  c_ancla_suma constant text := $a$    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;$a$;
  c_bloque constant text := $n$    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  -- ADR-0310: el redondeo del efectivo. La suma de TODAS las filas ya igualó a los ítems; aquí se exige que la fila de redondeo sea
  -- exactamente lo que la ley permite (hacia abajo, al múltiplo de S/ 0.10) y que viaje junto a UN efectivo ya cobrado en monedas.
  -- Una venta sin fila de redondeo (efectivo exacto) se acepta como siempre: la cola sin conexión de una caja vieja no pierde ventas.
  v_n_redondeo := (select count(*) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'redondeo');
  if v_n_redondeo > 0 then
    v_n_efectivo := (select count(*) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'efectivo');
    v_monto_redondeo := (select coalesce(sum((e ->> 'monto')::numeric), 0) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'redondeo');
    v_monto_efectivo := (select coalesce(sum((e ->> 'monto')::numeric), 0) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'efectivo');
    if v_n_redondeo > 1 then
      raise exception 'Una venta lleva a lo más un redondeo de efectivo.'
        using hint = 'venta_redondeo_invalido';
    end if;
    if v_n_efectivo <> 1 then
      raise exception 'El redondeo del efectivo solo existe junto a UN pago en efectivo.'
        using hint = 'venta_redondeo_invalido';
    end if;
    if v_monto_efectivo <= 0 or mod(round(v_monto_efectivo, 2), 0.10) <> 0 then
      raise exception 'Con redondeo, el efectivo se cobra en monedas que existen: múltiplos de S/ 0.10 (se mandó S/%).', v_monto_efectivo
        using hint = 'venta_redondeo_invalido';
    end if;
    if v_monto_redondeo <= 0 or v_monto_redondeo >= 0.10
       or retail.fn_redondeo_efectivo(v_monto_efectivo + v_monto_redondeo) <> round(v_monto_redondeo, 2) then
      raise exception 'El redondeo de S/% no es el de la ley para un efectivo de S/%: se redondea hacia abajo, hasta S/ 0.09.',
        v_monto_redondeo, v_monto_efectivo + v_monto_redondeo
        using hint = 'venta_redondeo_invalido';
    end if;
  end if;$n$;
  v_md5 text;
  v_def text;
begin
  -- De lo que depende (las partes anteriores): si falta alguna, no se toca nada.
  if to_regprocedure('retail.fn_redondeo_efectivo(numeric)') is null then
    raise exception 'redondeo: falta retail.fn_redondeo_efectivo. Pega antes 20261003100000_redondeo_efectivo_regla.sql.';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check'
                    and pg_get_constraintdef(c.oid) like '%''redondeo''%') then
    raise exception 'redondeo: venta_pagos todavía no acepta el medio redondeo. Pega antes 20261003110000_venta_pagos_candado_redondeo.sql.';
  end if;

  v_md5 := pg_temp.redondeo_md5(c_firma);
  if v_md5 is null then
    raise exception '% no existe en esta base.', c_firma;
  end if;
  if v_md5 = c_despues then
    raise notice 'registrar_venta ya acepta el redondeo del efectivo: no se toca.';
    return;
  end if;
  if v_md5 <> c_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_firma, v_md5, c_antes, c_despues;
  end if;

  v_def := pg_get_functiondef(c_firma::regprocedure);
  if (length(v_def) - length(replace(v_def, c_ancla_vars, ''))) / length(c_ancla_vars) <> 1
     or (length(v_def) - length(replace(v_def, c_ancla_suma, ''))) / length(c_ancla_suma) <> 1 then
    raise exception 'redondeo: las marcas de registrar_venta no aparecen exactamente una vez. No se toca nada.';
  end if;
  v_def := replace(v_def, c_ancla_vars, c_vars_nuevas);
  v_def := replace(v_def, c_ancla_suma, c_bloque);
  execute v_def;

  -- Validación final: si algo no quedó como se espera, se aborta TODO.
  v_md5 := pg_temp.redondeo_md5(c_firma);
  if v_md5 <> c_despues then
    raise exception 'redondeo: registrar_venta quedó con md5 % y se esperaba %.', v_md5, c_despues;
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta') <> 1 then
    raise exception 'redondeo: quedaron sobrecargas de registrar_venta (cambiar la firma deja una ventana sin función).';
  end if;
  v_def := pg_get_functiondef(c_firma::regprocedure);
  if position('venta_redondeo_invalido' in v_def) = 0
     or position('Los pagos (S/%) no cuadran con el total de la venta' in v_def) = 0
     or position('venta_descuento_bajo_costo' in v_def) = 0 then
    raise exception 'redondeo: registrar_venta perdió una de sus validaciones o no quedó con la del redondeo.';
  end if;
end
$migracion$;
