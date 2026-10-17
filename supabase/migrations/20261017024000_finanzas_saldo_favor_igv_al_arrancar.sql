-- ============================================================================
-- 20261017024000_finanzas_saldo_favor_igv_al_arrancar.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, actividad 4b; ADR-0433)
--
-- EL PROBLEMA PRIMERO. «¿Me alcanza?» proyecta el IGV del mes en curso (hoy S/ 9 322, a pagar el 15 de noviembre) como si CAYLA no tuviera ningún crédito
-- fiscal. Pero CAYLA arrancó con un buen saldo a favor de IGV por compras acumuladas (Felipe, 2026-10-16: «al día de hoy CAYLA tiene buen escudo fiscal por compras
-- acumuladas»): ese crédito viene de ANTES del sistema (de declaraciones anteriores) y el sistema, que arrastra el saldo mes a mes desde que tiene datos, parte de
-- cero. Resultado: Impuestos y la proyección de caja dicen que se paga IGV cuando, con el saldo que CAYLA ya traía, quizá no se paga nada.
--
-- CÓMO. Un parámetro tributario nuevo, `saldo_favor_igv` (lo declara el contador, de la última declaración: «saldo a favor del periodo anterior»), con su vigencia
-- (el día 1 del mes en que ese saldo entra: «al empezar octubre traíamos S/ X») y su corrección como fila nueva, como el resto de los parámetros (Configuración ▸
-- Impuestos; queda en la historia). `fn_impuestos_igv_meses` parte de él:
--   · en el mes de la vigencia, lo declarado REEMPLAZA lo que venía arrastrando (lo oficial manda sobre lo calculado con datos incompletos);
--   · si la vigencia es anterior a los primeros datos, la cadena empieza ahí y lo arrastra hasta el mes pedido;
--   · el resto (débito, crédito, a pagar, saldo a favor) se calcula igual que siempre. Como Impuestos y la proyección de caja leen esa función, los dos lo descuentan solos.
-- La proyección dice si hay un saldo declarado (`saldo_favor_igv_declarado`) para listarlo en «lo que falta» mientras no se cargue.
-- Hasta que Felipe cargue el número del contador, nada cambia: sin fila declarada, la cadena es exactamente la de hoy.
--
-- Partes (un solo pegado, sin políticas): 1) las tres reglas de la tabla (un `alter table` breve sobre una tabla de 5 filas, con lock_timeout); 2) `guardar_parametro_tributario`
-- acepta el nombre nuevo y lo valida; 3) `fn_impuestos_igv_meses` parte del saldo; 4) la proyección dice si hay saldo declarado. Reemplazos anclados sobre las funciones VIVAS
-- (el ancla aparece una vez o la migración aborta; si el texto nuevo ya está, no hace nada); las reglas de la tabla se rehacen solo si todavía no nombran el parámetro.
-- Contra producción (solo lectura, 2026-10-16): `fn_impuestos_igv_meses` tiene el mismo md5 que local (42c72e94…) y sus tres anclas aparecen una vez; `guardar_parametro_tributario`
-- también (99ffdb89…).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ── 1. Las reglas de la tabla conocen el parámetro nuevo ─────────────────────────────────────────────────────────────────
do $c$
begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_nombre_check') not like '%saldo_favor_igv%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_nombre_check;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_nombre_check
      check (nombre = any (array['igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad', 'saldo_favor_igv']));
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_anual') not like '%saldo_favor_igv%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_anual;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_anual
      check (nombre = any (array['igv', 'tope_planilla_movilidad', 'saldo_favor_igv'])
             or (extract(month from vigente_desde) = 1 and extract(day from vigente_desde) = 1));
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_valor_coherente') not like '%saldo_favor_igv%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_valor_coherente;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_valor_coherente
      check (case nombre
        when 'regimen' then valor is null and texto = any (array['rmt', 'general', 'rer', 'nrus'])
        when 'igv' then texto is null and valor > 0 and valor < 1
        when 'renta_pago_cuenta' then texto is null and valor >= 0 and valor < 1
        when 'uit' then texto is null and valor >= 1000 and valor <= 100000
        when 'umbral_uit' then texto is null and valor > 0 and valor <= 100000
        when 'tope_planilla_movilidad' then texto is null and valor > 0 and valor <= 1000
        when 'saldo_favor_igv' then texto is null and valor >= 0 and valor <= 10000000
        else false
      end);
  end if;
end
$c$;

-- ── 2. Guardar el parámetro: se acepta, rige desde el día 1 de un mes y va en soles ──────────────────────────────────────
select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
  $v$not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad')$v$,
  $n$not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad', 'saldo_favor_igv')$n$);

select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
  $v$if p_nombre not in ('igv', 'tope_planilla_movilidad') and (extract(month from p_vigente_desde)$v$,
  $n$if p_nombre not in ('igv', 'tope_planilla_movilidad', 'saldo_favor_igv') and (extract(month from p_vigente_desde)$n$);

select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
  $v$-- ADR-0362 (fase 6 · actividad 6, decisión 68): el tope diario de la planilla de movilidad, en soles por persona y por día.$v$,
  $n$-- ADR-0433, actividad 4b: el saldo a favor de IGV con que CAYLA arrancó (lo da el contador, de la última declaración): rige desde el día 1 de un mes y va en soles.
  if p_nombre = 'saldo_favor_igv' and extract(day from p_vigente_desde) <> 1 then
    raise exception 'El saldo a favor de IGV rige desde el día 1 de un mes.' using errcode = 'P0001';
  end if;
  if p_nombre = 'saldo_favor_igv' and (v_valor is null or v_valor < 0 or v_valor > 10000000) then
    raise exception 'El saldo a favor de IGV va en soles, de 0 a 10 millones.' using errcode = 'P0001';
  end if;

  -- ADR-0362 (fase 6 · actividad 6, decisión 68): el tope diario de la planilla de movilidad, en soles por persona y por día.$n$);

-- ── 3. El IGV de cada mes parte del saldo que el contador declaró ────────────────────────────────────────────────────────
select pg_temp.anclar('retail.fn_impuestos_igv_meses(date, date)',
  $v$  v_saldo numeric := 0;$v$,
  $n$  v_saldo numeric := 0;
  v_apertura numeric;$n$);

select pg_temp.anclar('retail.fn_impuestos_igv_meses(date, date)',
  $v$  for r in$v$,
  $n$  -- ADR-0433, actividad 4b: si el contador declaró un saldo a favor de arranque ANTERIOR a los primeros datos, la cadena empieza en ese mes.
  v_ini := least(v_ini, coalesce((select date_trunc('month', min(p.vigente_desde))::date from retail.parametros_tributarios p where p.nombre = 'saldo_favor_igv'), v_ini));

  for r in$n$);

select pg_temp.anclar('retail.fn_impuestos_igv_meses(date, date)',
  $v$saldo_anterior := v_saldo;$v$,
  $n$-- ADR-0433, actividad 4b: lo que el contador declaró como saldo a favor al empezar este mes REEMPLAZA lo que venía arrastrando (lo oficial manda sobre lo
    -- calculado con datos incompletos); la corrección más reciente de ese mes es la que vale.
    v_apertura := (select round(p.valor, 2) from retail.parametros_tributarios p
                    where p.nombre = 'saldo_favor_igv' and date_trunc('month', p.vigente_desde)::date = r.m
                    order by p.vigente_desde desc, p.created_at desc, p.id desc limit 1);
    if v_apertura is not null then
      v_saldo := v_apertura;
    end if;
    saldo_anterior := v_saldo;$n$);

-- ── 4. La proyección de caja dice si el saldo está declarado (la web lo lista en «lo que falta» mientras no) ───────────────
select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$'incluye_impuestos', v_incluye_impuestos,$v$,
  $n$'incluye_impuestos', v_incluye_impuestos,
    'saldo_favor_igv_declarado', exists (select 1 from retail.parametros_tributarios p where p.nombre = 'saldo_favor_igv'),$n$);

notify pgrst, 'reload schema';
