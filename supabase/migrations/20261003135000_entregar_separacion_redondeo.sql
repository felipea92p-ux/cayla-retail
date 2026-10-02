-- ============================================================================
-- 20261003135000_entregar_separacion_redondeo.sql — CAYLA V2 (ADR-0310, actividad 6)
--
-- EL CAMBIO. `entregar_separacion` acepta una fila `metodo = 'redondeo'` entre los pagos del SALDO: lo que no se cobró por llevar el
-- efectivo de hoy al múltiplo de S/ 0.10, hacia abajo (la moneda más chica que circula; Ley 29571 art. 44). El saldo de 29.88
-- pagado en efectivo se cobra con efectivo 29.80 + redondeo 0.08. La suma de las filas de la venta sigue igualando el total del
-- apartado, sin tolerancia, y la boleta final sigue por el saldo exacto: el redondeo es del cobro, no del precio.
--
-- QUÉ SE REDONDEA Y QUÉ NO (ADR-0310 §7). Solo el saldo que se paga hoy al entregar. El adelanto y los abonos NO: los céntimos de un
-- apartado nacen del PRECIO de las prendas, y el adelanto o el abono es un monto que el cliente elige (nadie «debe» 50.02 de
-- adelanto), así que no hay un total a pagar que redondear ahí; por eso `separar_prendas` y `abonar_separacion` no se tocan.
--
-- EL CONTRATO (Liskov). Igual que `registrar_venta` (20261003130000): la base VERIFICA el redondeo, no lo reescribe ni se lo cree a la
-- caja. Con una fila de redondeo exige: a lo más UNA, exactamente UN pago en efectivo, el efectivo en múltiplos de S/ 0.10, el
-- redondeo entre S/ 0.01 y S/ 0.09 y que sea EXACTAMENTE el de la ley, `fn_redondeo_efectivo(efectivo + redondeo)`. Un saldo pagado
-- sin fila de redondeo (efectivo exacto) se acepta como siempre: nada de lo que ya funcionaba se rompe. Cada rechazo lleva el hint
-- `venta_redondeo_invalido`, el mismo de `registrar_venta`, y un mensaje en español.
--
-- LO QUE NO CAMBIA. La firma, el comprobante (se emite por el saldo exacto, `v_saldo`), el anticipo que deduce, el stock, la
-- caja y el resto de las validaciones. La fila de redondeo entra a `venta_pagos` con los candados de la actividad 2 (menor de 0.10,
-- una por venta, sin `recibido` ni referencia), en la MISMA transacción de siempre: la venta, sus pagos y su redondeo entran
-- todo-o-nada (Gray). Si algo falla —Lucode incluido— no cambia nada de esto: el comprobante se encola como siempre.
--
-- COMO SE PARCHA. `entregar_separacion` se corta sobre `pg_get_functiondef`, con tres anclas que deben aparecer EXACTAMENTE una vez y
-- candado de huella (md5 normalizado, sin comentarios ni espacios) antes y después. Con otra huella aborta sin tocar nada. Huella
-- «antes» verificada en producción, solo lectura, el 2026-10-02: `7d38028b…`.
--
-- PRODUCCIÓN. Pegar SOLA, DESPUÉS de las partes de las actividades 2, 3 y 5 (`20261003100000` … `20261003130000`) y ANTES de la bandera
-- `20261003140000` (que ahora pregunta también por esta función: sin esta parte la bandera dice false y la caja sigue cobrando exacto).
-- Sin tablas, políticas ni `drop trigger`. Idempotente: la segunda vez avisa y no toca nada. Aborta si falta alguna parte de la que depende.
--
-- VERIFICACIÓN (solo lectura):
--   select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g')),
--          position('venta_redondeo_invalido' in p.prosrc) > 0
--     from pg_proc p where p.oid = 'retail.entregar_separacion(uuid,jsonb,uuid)'::regprocedure;
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
  c_firma constant text := 'retail.entregar_separacion(uuid,jsonb,uuid)';
  c_antes constant text := '7d38028b2cdf10ec50984b659cfbe63c';   -- el de producción el 2026-10-02
  c_despues constant text := 'e2f37e6167abff613891c00c1c9a2ebb';                     -- «después» de este archivo
  c_ancla_vars constant text := $a$v_pagado numeric := 0;$a$;
  c_vars_nuevas constant text := $n$v_pagado numeric := 0;
  v_n_redondeo integer;
  v_n_efectivo integer;
  v_monto_redondeo numeric;
  v_monto_efectivo numeric;$n$;
  c_ancla_metodo constant text := $a$if coalesce(v_pago ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then$a$;
  c_metodo_nuevo constant text := $n$if coalesce(v_pago ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'redondeo') then$n$;
  c_ancla_suma constant text := $a$    raise exception 'Los pagos (S/%) no cuadran con el saldo del apartado (S/%)', round(v_pagado, 2), v_saldo;
  end if;$a$;
  c_bloque constant text := $n$    raise exception 'Los pagos (S/%) no cuadran con el saldo del apartado (S/%)', round(v_pagado, 2), v_saldo;
  end if;

  -- ADR-0310: el redondeo del efectivo del saldo. La suma de TODAS las filas ya igualó al saldo; aquí se exige que la fila de
  -- redondeo sea exactamente lo que la ley permite (hacia abajo, al múltiplo de S/ 0.10) y que viaje junto a UN efectivo ya cobrado
  -- en monedas. Un saldo sin fila de redondeo (efectivo exacto) se acepta como siempre.
  v_n_redondeo := (select count(*) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'redondeo');
  if v_n_redondeo > 0 then
    v_n_efectivo := (select count(*) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'efectivo');
    v_monto_redondeo := (select coalesce(sum((e ->> 'monto')::numeric), 0) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'redondeo');
    v_monto_efectivo := (select coalesce(sum((e ->> 'monto')::numeric), 0) from jsonb_array_elements(p_pagos) e where e ->> 'metodo' = 'efectivo');
    if v_n_redondeo > 1 then
      raise exception 'Una entrega lleva a lo más un redondeo de efectivo.'
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
    raise notice 'entregar_separacion ya acepta el redondeo del efectivo: no se toca.';
    return;
  end if;
  if v_md5 <> c_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_firma, v_md5, c_antes, c_despues;
  end if;

  v_def := pg_get_functiondef(c_firma::regprocedure);
  if (length(v_def) - length(replace(v_def, c_ancla_vars, ''))) / length(c_ancla_vars) <> 1
     or (length(v_def) - length(replace(v_def, c_ancla_metodo, ''))) / length(c_ancla_metodo) <> 1
     or (length(v_def) - length(replace(v_def, c_ancla_suma, ''))) / length(c_ancla_suma) <> 1 then
    raise exception 'redondeo: las marcas de entregar_separacion no aparecen exactamente una vez. No se toca nada.';
  end if;
  v_def := replace(v_def, c_ancla_vars, c_vars_nuevas);
  v_def := replace(v_def, c_ancla_metodo, c_metodo_nuevo);
  v_def := replace(v_def, c_ancla_suma, c_bloque);
  execute v_def;

  -- Validación final: si algo no quedó como se espera, se aborta TODO.
  v_md5 := pg_temp.redondeo_md5(c_firma);
  if v_md5 <> c_despues then
    raise exception 'redondeo: entregar_separacion quedó con md5 % y se esperaba %.', v_md5, c_despues;
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'entregar_separacion') <> 1 then
    raise exception 'redondeo: quedaron sobrecargas de entregar_separacion (cambiar la firma deja una ventana sin función).';
  end if;
  v_def := pg_get_functiondef(c_firma::regprocedure);
  if position('venta_redondeo_invalido' in v_def) = 0
     or position('no cuadran con el saldo del apartado' in v_def) = 0
     or position('emitir_comprobante' in v_def) = 0
     or position('comprobante_anticipos' in v_def) = 0 then
    raise exception 'redondeo: entregar_separacion perdió una de sus validaciones o no quedó con la del redondeo.';
  end if;
end
$migracion$;
