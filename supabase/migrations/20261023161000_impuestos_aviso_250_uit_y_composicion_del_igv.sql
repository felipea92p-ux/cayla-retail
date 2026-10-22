-- ============================================================================
-- 20261023161000_impuestos_aviso_250_uit_y_composicion_del_igv.sql — CAYLA V2 (Finanzas ▸ Impuestos; ADR sin número aún, ver docs/adr/SIN-NUMERO-impuestos-alerta-250-uit-y-composicion-del-igv.md)
--
-- EL PROBLEMA PRIMERO. Dos cosas, del primer cierre de mes (octubre 2026):
--
--  1) EL AVISO LLEGA TARDE. CAYLA está en el Régimen MYPE Tributario. Mientras las ventas del AÑO (sin IGV) no pasen de 300 UIT (S/ 1 650 000 con la UIT de 2026,
--     S/ 5 500) el pago a cuenta de renta es 1 % de lo vendido en el mes; pasadas las 300 UIT sube a 1,5 % o al coeficiente (lo define el contador). Hoy Impuestos solo avisa
--     al 60 % de ese límite con un «Vas al 62 %» y al cruzarlo: no hay un aviso que diga «habla con tu contador ANTES de que cambie el pago a cuenta». Felipe decidió avisar al
--     llegar a las 250 UIT (S/ 1 375 000). Como el límite, el aviso es un PARÁMETRO (`aviso_umbral_uit`), no una cifra en el código: la UIT cambia cada año.
--
--  2) EL ERP SOLO CUENTA DESDE SEPTIEMBRE. Las ventas de enero a agosto de 2026 se emitieron antes del sistema y no están en `comprobantes`. El aviso de 250 UIT las ignoraría y se
--     quedaría corto justo este año. No hay de dónde sumarlas sin inventarlas: se agrega `ventas_previas_erp` (por año, sin IGV, en soles; arranca en 0, «sin cargar») que
--     lo da el contador o Felipe de lo emitido antes, y mientras no se confirme el aviso lo dice: «puede quedarse corto».
--
--  Además (a): la fila `igv` 0.18 traía la nota «IGV 16 % + IPM 2 %», falsa desde el 1 de enero de 2026. Ley 32387 (página de SUNAT, «Concepto, tasa y operaciones gravadas»):
--     IGV 15,5 % + IPM 2,5 % en 2026; 15 % + 3 % en 2027; 14,5 % + 3,5 % en 2028; 14 % + 4 % en 2029; el total sigue en 18 %. El total (`igv` = 0.18) NO se toca ni lo que lo lee
--     (`fn_tasa_igv`, los gastos con factura, el diario): solo se agregan las filas de componentes, con vigencia, y se corrige la nota.
--
-- LAS REGLAS
--   · Ventas del año = lo vendido de enero a hoy según los comprobantes (la misma regla de `fn_impuestos_ventas`: base sin IGV, menos notas de crédito, sin anulados ni pruebas)
--     + `ventas_previas_erp` del AÑO en curso. La tarjeta del límite de 300 UIT sigue midiendo 12 meses móviles (no se toca; ver «SE ROMPE SI»).
--   · Aviso = ventas del año ≥ `aviso_umbral_uit` × UIT y todavía < límite (`umbral_uit` × UIT). Si el aviso estuviera mal puesto (por encima del límite) simplemente no se enciende.
--   · `ventas_previas_erp` rige por AÑO EXACTO (la fila del 1 de enero de ese año): NO se hereda al año siguiente, como sí hacen la UIT y el límite, porque lo vendido antes del
--     sistema en 2026 no dice nada de 2027. `aviso_umbral_uit` sí se hereda (rige hasta que se cambie, como el límite).
--   · La tabla sigue siendo solo-agregar: la nota de `igv` se corrige con una fila nueva de la misma vigencia (gana la más reciente); no se edita nada.
--
-- DECIDÍ: el aviso mide el AÑO CALENDARIO (enero a hoy), no los 12 meses móviles de la tarjeta del límite. Es lo que dice la regla de SUNAT del pago a cuenta (acumulado del ejercicio) y lo único
--   que admite un «lo vendido antes del sistema» honesto (un monto por año; en 12 meses móviles iría perdiendo meses y no habría de dónde descontarlos).
-- DESCARTÉ: reutilizar `ventas_12m` tal cual para el aviso. En enero de 2027 el aviso diría «84 %» con el año recién empezado (todavía arrastraría diciembre) y las ventas previas
--   de 2026 no tendrían forma de salir de la ventana mes a mes.
-- DESCARTÉ: pasar también la tarjeta de 300 UIT al año calendario. Cambia una cifra que ya se muestra en Impuestos y en el Resumen: lo decide Felipe (queda como pregunta en el ADR).
-- SE ROMPE SI: (1) alguien carga las ventas de enero a agosto en `comprobantes` Y además deja `ventas_previas_erp` con un monto: se cuentan dos veces (la nota de Configuración lo dice y la
--   cifra de «Ventas del año» abre el desglose); (2) la UIT del año no está cargada: sin UIT no hay soles y el aviso calla, igual que el límite; (3) se pega la web antes que este SQL: la web lee
--   los campos nuevos con valores por defecto y el aviso simplemente no sale (no se cae).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»; aquí no hay políticas, pero la parte 1 reescribe reglas de una tabla en uso)
--   PARTE 1 · `parametros_tributarios`, sola: tres reglas (nombre, vigencia por año, valor coherente) y las filas nuevas. Un `alter table` breve sobre una tabla de ~10 filas, con lock_timeout.
--   PARTE 2 · Funciones: `guardar_parametro_tributario` acepta y valida los dos parámetros nuevos; `fn_impuestos_panel` suma los campos del aviso. No toma en exclusiva ninguna tabla.
--   Cada parte espera 3 s un candado: si dice «lock timeout», se repite ESA parte. Idempotentes (los reemplazos anclados no hacen nada si el texto nuevo ya está; si el texto viejo
--   no aparece exactamente una vez, abortan con el nombre de la función). Los textos que se insertan leen con asignaciones `v := (consulta)`, no con la forma corta que el SQL Editor confunde (ADR-0288). Contra producción (solo lectura) debe confirmarse
--   antes de pegar que `fn_impuestos_panel` y `guardar_parametro_tributario` tengan las anclas (el aborto de la parte 2 lo dice si no).
-- ============================================================================

-- ============================== PARTE 1 · parametros_tributarios (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ── 1. Las reglas de la tabla conocen los nombres nuevos ─────────────────────────────────────────────────────────────────
do $c$
begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_nombre_check') not like '%ventas_previas_erp%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_nombre_check;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_nombre_check
      check (nombre = any (array['igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad', 'saldo_favor_igv',
                                 'igv_general', 'igv_ipm', 'aviso_umbral_uit', 'ventas_previas_erp']));
  end if;
  -- Los componentes del IGV rigen desde cualquier fecha, como el total; el aviso y lo vendido antes del sistema, por año (desde el 1 de enero).
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_anual') not like '%igv_general%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_anual;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_anual
      check (nombre = any (array['igv', 'igv_general', 'igv_ipm', 'tope_planilla_movilidad', 'saldo_favor_igv'])
             or (extract(month from vigente_desde) = 1 and extract(day from vigente_desde) = 1));
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_valor_coherente') not like '%ventas_previas_erp%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_valor_coherente;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_valor_coherente
      check (case nombre
        when 'regimen' then valor is null and texto = any (array['rmt', 'general', 'rer', 'nrus'])
        when 'igv' then texto is null and valor > 0 and valor < 1
        when 'igv_general' then texto is null and valor > 0 and valor < 1
        when 'igv_ipm' then texto is null and valor > 0 and valor < 1
        when 'renta_pago_cuenta' then texto is null and valor >= 0 and valor < 1
        when 'uit' then texto is null and valor >= 1000 and valor <= 100000
        when 'umbral_uit' then texto is null and valor > 0 and valor <= 100000
        when 'aviso_umbral_uit' then texto is null and valor > 0 and valor <= 100000
        when 'tope_planilla_movilidad' then texto is null and valor > 0 and valor <= 1000
        when 'saldo_favor_igv' then texto is null and valor >= 0 and valor <= 10000000
        when 'ventas_previas_erp' then texto is null and valor >= 0 and valor <= 10000000
        else false
      end);
  end if;
end
$c$;

-- ── 2. La composición del IGV, con vigencia (Ley 32387; el total `igv` = 0.18 no cambia) ─────────────────────────────────
-- Cada fila vale desde su fecha hasta la siguiente. 16 % + 2 % rigió desde el 1 de marzo de 2011 (la misma vigencia del total) hasta el 31 de diciembre de 2025.
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto, nota, provisional)
select v.nombre, v.vigente_desde, v.valor, null, v.nota, false
  from (values
    ('igv_general', date '2011-03-01', 0.1600::numeric, 'IGV sin el IPM: 16 % hasta el 31 dic 2025.'),
    ('igv_ipm',     date '2011-03-01', 0.0200,          'IPM (Impuesto de Promoción Municipal): 2 % hasta el 31 dic 2025.'),
    ('igv_general', date '2026-01-01', 0.1550,          'Ley 32387: IGV 15,5 % en 2026. Con el IPM suman el 18 % de siempre.'),
    ('igv_ipm',     date '2026-01-01', 0.0250,          'Ley 32387: IPM 2,5 % en 2026. El IPM sube cada año hasta 4 % y el IGV baja lo mismo.'),
    ('igv_general', date '2027-01-01', 0.1500,          'Ley 32387: IGV 15 % en 2027.'),
    ('igv_ipm',     date '2027-01-01', 0.0300,          'Ley 32387: IPM 3 % en 2027.'),
    ('igv_general', date '2028-01-01', 0.1450,          'Ley 32387: IGV 14,5 % en 2028.'),
    ('igv_ipm',     date '2028-01-01', 0.0350,          'Ley 32387: IPM 3,5 % en 2028.'),
    ('igv_general', date '2029-01-01', 0.1400,          'Ley 32387: IGV 14 % desde 2029.'),
    ('igv_ipm',     date '2029-01-01', 0.0400,          'Ley 32387: IPM 4 % desde 2029.')
  ) as v (nombre, vigente_desde, valor, nota)
 where not exists (select 1 from retail.parametros_tributarios p where p.nombre = v.nombre and p.vigente_desde = v.vigente_desde);

-- La nota del total decía «IGV 16 % + IPM 2 %»: cierta hasta 2025, falsa desde 2026. Una corrección es una fila nueva de la misma vigencia (gana la más reciente) y copia el valor y el
-- estado «por confirmar» de la que rige hoy: el 18 % no se toca.
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto, nota, provisional, created_at)
select 'igv', p.vigente_desde, p.valor, null,
       'Tasa total del IGV con el IPM (18 %). Cómo se reparte entre IGV e IPM cambia cada año: ver igv_general e igv_ipm.',
       p.provisional, clock_timestamp()
  from (select q.vigente_desde, q.valor, q.provisional
          from retail.parametros_tributarios q
         where q.nombre = 'igv' and q.vigente_desde = date '2011-03-01'
         order by q.created_at desc, q.id desc
         limit 1) p
 where not exists (select 1 from retail.parametros_tributarios n
                    where n.nombre = 'igv' and n.vigente_desde = date '2011-03-01'
                      and n.nota = 'Tasa total del IGV con el IPM (18 %). Cómo se reparte entre IGV e IPM cambia cada año: ver igv_general e igv_ipm.');

-- ── 3. El aviso anticipado y las ventas de antes del sistema ─────────────────────────────────────────────────────────────
-- 250 lo decidió Felipe (no depende del contador: es cuándo quiere hablar con él). Lo vendido antes del sistema arranca en 0 y «por confirmar»: así el aviso sabe que puede estar corto.
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto, nota, provisional)
select v.nombre, v.vigente_desde, v.valor, null, v.nota, v.provisional
  from (values
    ('aviso_umbral_uit',   date '2026-01-01', 250::numeric, 'Aviso anticipado: avisa al llegar a estas UIT de ventas del año, para hablar con el contador antes de que el pago a cuenta pase de 1 % a 1,5 % o coeficiente.', false),
    ('ventas_previas_erp', date '2026-01-01', 0,            'Lo vendido de enero a agosto de 2026, antes del sistema, sin IGV. En 0 hasta que se cargue: el aviso de ventas del año puede quedarse corto.', true)
  ) as v (nombre, vigente_desde, valor, nota, provisional)
 where not exists (select 1 from retail.parametros_tributarios p where p.nombre = v.nombre and p.vigente_desde = v.vigente_desde);

reset lock_timeout;

-- ============================== PARTE 2 · funciones ==============================
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

-- ── 4. Guardar: los dos parámetros nuevos se aceptan y se validan ───────────────────────────────────────────────────────
select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
  $v$not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad', 'saldo_favor_igv')$v$,
  $n$not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad', 'saldo_favor_igv', 'aviso_umbral_uit', 'ventas_previas_erp')$n$);

select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
  $v$-- ADR-0362 (fase 6 · actividad 6, decisión 68): el tope diario de la planilla de movilidad, en soles por persona y por día.$v$,
  $n$-- Aviso anticipado del límite del régimen (Felipe, 2026-10-22): va en UIT y tiene que ir ANTES del límite que rige ese año, o nunca avisaría.
  if p_nombre = 'aviso_umbral_uit' and (v_valor is null or v_valor <= 0 or v_valor > 100000) then
    raise exception 'El aviso va en UIT (250), no en soles.' using errcode = 'P0001';
  end if;
  if p_nombre = 'aviso_umbral_uit' and exists (select 1 from retail.fn_parametro_tributario('umbral_uit', p_vigente_desde) u where v_valor >= u.valor) then
    raise exception 'El aviso tiene que ir antes del límite del régimen: pon menos UIT que las del límite.' using errcode = 'P0001';
  end if;
  -- Lo vendido ANTES del sistema en ese año (sin IGV, en soles): lo da el contador de lo emitido antes. Cero vale (declara que no hubo).
  if p_nombre = 'ventas_previas_erp' and (v_valor is null or v_valor < 0 or v_valor > 10000000) then
    raise exception 'Lo vendido antes del sistema va en soles, sin IGV, de 0 a 10 millones.' using errcode = 'P0001';
  end if;

  -- ADR-0362 (fase 6 · actividad 6, decisión 68): el tope diario de la planilla de movilidad, en soles por persona y por día.$n$);

-- ── 5. El panel de Impuestos trae las ventas del año y el aviso ─────────────────────────────────────────────────────────
select pg_temp.anclar('retail.fn_impuestos_panel(date)',
  $v$  v_umbral_soles numeric;$v$,
  $n$  v_umbral_soles numeric;
  -- Aviso anticipado: las ventas del AÑO en curso (lo del sistema + lo vendido antes de que el sistema empezara).
  v_anio date;
  v_erp_anio numeric;
  v_previas_valor numeric;
  v_previas_prov boolean;
  v_aviso_uit numeric;
  v_aviso_prov boolean;
  v_aviso_soles numeric;
  v_total_anio numeric;$n$);

select pg_temp.anclar('retail.fn_impuestos_panel(date)',
  $v$  v_umbral_soles := case when v_uit.valor is not null and v_umbral.valor is not null then round(v_uit.valor * v_umbral.valor, 2) end;$v$,
  $n$  v_umbral_soles := case when v_uit.valor is not null and v_umbral.valor is not null then round(v_uit.valor * v_umbral.valor, 2) end;

  -- Aviso anticipado del límite: de enero a hoy según los comprobantes (la misma fuente de `v_ventas`), más lo vendido antes del sistema SI se cargó. Esto último rige por AÑO EXACTO
  -- (la fila del 1 de enero de este año): lo de 2026 no se hereda a 2027. Sin soles (sin UIT) o sin aviso configurado, el aviso calla.
  v_anio := date_trunc('year', v_hoy)::date;
  v_erp_anio := (select coalesce(sum((e ->> 'base')::numeric), 0) from jsonb_array_elements(v_ventas) e where (e ->> 'mes')::date >= v_anio);
  v_previas_valor := (select p.valor from retail.parametros_tributarios p where p.nombre = 'ventas_previas_erp' and p.vigente_desde = v_anio order by p.created_at desc, p.id desc limit 1);
  v_previas_prov := (select p.provisional from retail.parametros_tributarios p where p.nombre = 'ventas_previas_erp' and p.vigente_desde = v_anio order by p.created_at desc, p.id desc limit 1);
  v_aviso_uit := (select a.valor from retail.fn_parametro_tributario('aviso_umbral_uit', v_hoy) a);
  v_aviso_prov := (select a.provisional from retail.fn_parametro_tributario('aviso_umbral_uit', v_hoy) a);
  v_aviso_soles := case when v_uit.valor is not null and v_aviso_uit is not null then round(v_uit.valor * v_aviso_uit, 2) end;
  v_total_anio := v_erp_anio + coalesce(v_previas_valor, 0);$n$);

select pg_temp.anclar('retail.fn_impuestos_panel(date)',
  $v$'provisional', v_renta.provisional) end),$v$,
  $n$'provisional', v_renta.provisional) end,
      'aviso_umbral_uit', case when v_aviso_uit is null then null else jsonb_build_object('valor', v_aviso_uit, 'provisional', v_aviso_prov) end,
      'ventas_previas', case when v_previas_valor is null then null else jsonb_build_object('valor', v_previas_valor, 'provisional', v_previas_prov, 'anio', extract(year from v_anio)::integer) end),$n$);

select pg_temp.anclar('retail.fn_impuestos_panel(date)',
  $v$'ventas_meses', v_ventas),$v$,
  $n$'ventas_meses', v_ventas,
      'anio', extract(year from v_anio)::integer,
      'ventas_anio_erp', v_erp_anio,
      'ventas_previas', coalesce(v_previas_valor, 0),
      'previas_confirmadas', coalesce(v_previas_valor is not null and not v_previas_prov, false),
      'ventas_anio', v_total_anio,
      'aviso_soles', v_aviso_soles,
      'anio_avance', case when v_umbral_soles > 0 then round(v_total_anio / v_umbral_soles, 4) end,
      'aviso_alcanzado', coalesce(v_aviso_soles is not null and v_total_anio >= v_aviso_soles and v_total_anio < v_umbral_soles, false),
      'anio_cruzado', coalesce(v_umbral_soles is not null and v_total_anio >= v_umbral_soles, false)),$n$);

notify pgrst, 'reload schema';

reset lock_timeout;
