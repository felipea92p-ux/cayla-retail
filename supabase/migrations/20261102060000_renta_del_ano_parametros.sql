-- ============================================================================
-- 20261102060000_renta_del_ano_parametros.sql — CAYLA V2 (Finanzas ▸ Impuestos; ADR-0598, actividad 3)
--
-- EL PROBLEMA PRIMERO. Para estimar la renta de marzo (la del año entero) faltan dos cosas que el ERP no tiene:
--  1) LA ESCALA. El Régimen MYPE Tributario cobra 10 % hasta 15 UIT de utilidad y 29,5 % sobre el resto (D. Leg. 1269, art. 5), y una boleta de un
--     proveedor del Nuevo RUS solo resta hasta el 6 % de lo sustentado con comprobantes y 200 UIT al año (Ley del Impuesto a la Renta, art. 37 inc. z).
--     Son cifras de una ley: como la UIT y el IGV, viven en `parametros_tributarios` con su vigencia y nunca en el código.
--  2) LO DE ANTES DEL SISTEMA. Finanzas cuenta desde octubre de 2026 (`fn_finanzas_desde`); enero a septiembre los lleva el contador. Para el año
--     completo hacen falta su utilidad, su costo de lo vendido, lo que se compró sin factura y la renta ya pagada a cuenta (Felipe, 2026-11-02: «puedo
--     darte los reportes de los meses anteriores»).
--
-- QUÉ HACE.
--   PARTE 1 · `parametros_tributarios`: las reglas de la tabla conocen nueve nombres nuevos y se siembra la escala vigente desde 2017.
--     · `renta_tramo_uit` (15), `renta_tasa_tramo` (0.10), `renta_tasa_resto` (0.295), `boletas_tope_pct` (0.06), `boletas_tope_uit` (200): la ley. Rigen
--       por año y se heredan (como la UIT). Como `igv_general`, se leen y NO se editan desde la pantalla: si la ley cambia, se cambian con una migración.
--     · `renta_utilidad_previa` (puede ser negativa: una pérdida), `renta_costo_previo`, `renta_sin_papel_previo`, `renta_pagada_previa`: en soles, por AÑO
--       EXACTO (como `ventas_previas_erp`: no se heredan) y NO se siembran: sin fila, la pantalla proyecta el año con lo que el sistema tiene y lo dice.
--   PARTE 2 · `guardar_parametro_tributario` acepta y valida los cuatro de «lo de antes» (los de la ley, no).
--
-- DECIDÍ: reutilizar `parametros_tributarios` (vigencia, solo-agregar, historia de Configuración, firma del responsable) en vez de una tabla nueva para
--   cuatro montos por año: el saldo a favor de IGV y el ajuste de ventas ya resolvieron el mismo problema así.
-- DESCARTÉ: escribir 10 %, 29,5 %, 15 UIT, 6 % y 200 UIT en `renta-anual-reglas.ts`: la prueba de Impuestos exige que ninguna cifra tributaria esté en el
--   código, y la UIT ya mostró que cambian.
-- DESCARTÉ: pedir «lo de antes» por mes: el contador lo entrega acumulado, y la renta anual se calcula sobre el acumulado.
-- SE ROMPE SI: (1) alguien carga como «lo de antes» meses que el sistema ya tiene: se cuentan dos veces (la pantalla dice qué meses cubre cada lado);
--   (2) la ley cambia la escala y nadie agrega la fila del año: se sigue usando la anterior (se hereda).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»; no hay políticas, pero la parte 1 reescribe
-- reglas de una tabla en uso). Cada parte espera 3 s un candado: si dice «lock timeout», se repite ESA parte. Las dos se pueden pegar dos veces.
--   ANCLA VIVA: antes de la parte 2, en producción (solo lectura):
--     select md5(pg_get_functiondef('retail.guardar_parametro_tributario(text, date, numeric, text)'::regprocedure));
--   y compararla con la de la base local de `main`; si el texto ancla no aparece exactamente una vez, la parte 2 aborta sin tocar nada.
-- ============================================================================

-- ============================== PARTE 1 · parametros_tributarios (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $c$
begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_nombre_check') not like '%renta_tramo_uit%' then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_nombre_check;
    alter table retail.parametros_tributarios add constraint parametros_tributarios_nombre_check
      check (nombre = any (array['igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad', 'saldo_favor_igv',
                                 'igv_general', 'igv_ipm', 'aviso_umbral_uit', 'ventas_previas_erp',
                                 'renta_tramo_uit', 'renta_tasa_tramo', 'renta_tasa_resto', 'boletas_tope_pct', 'boletas_tope_uit',
                                 'renta_utilidad_previa', 'renta_costo_previo', 'renta_sin_papel_previo', 'renta_pagada_previa']));
  end if;
  -- `parametros_tributarios_anual` no cambia: los nueve nuevos rigen desde el 1 de enero, que es lo que exige a todo nombre fuera de su lista.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'retail.parametros_tributarios'::regclass and c.conname = 'parametros_tributarios_valor_coherente') not like '%renta_tramo_uit%' then
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
        when 'renta_tramo_uit' then texto is null and valor > 0 and valor <= 100000
        when 'renta_tasa_tramo' then texto is null and valor >= 0 and valor < 1
        when 'renta_tasa_resto' then texto is null and valor >= 0 and valor < 1
        when 'boletas_tope_pct' then texto is null and valor >= 0 and valor < 1
        when 'boletas_tope_uit' then texto is null and valor >= 0 and valor <= 100000
        when 'renta_utilidad_previa' then texto is null and valor >= -100000000 and valor <= 100000000
        when 'renta_costo_previo' then texto is null and valor >= 0 and valor <= 100000000
        when 'renta_sin_papel_previo' then texto is null and valor >= 0 and valor <= 100000000
        when 'renta_pagada_previa' then texto is null and valor >= 0 and valor <= 100000000
        else false
      end);
  end if;
end
$c$;

-- La escala del Régimen MYPE Tributario y el tope de las boletas, desde que existe el régimen (1 de enero de 2017). Son ley: no quedan «por confirmar».
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto, nota, provisional)
select v.nombre, date '2017-01-01', v.valor, null, v.nota, false
  from (values
    ('renta_tramo_uit',  15::numeric, 'Régimen MYPE Tributario (D. Leg. 1269, art. 5): la utilidad hasta estas UIT paga la tasa del primer tramo.'),
    ('renta_tasa_tramo', 0.10,        'Régimen MYPE Tributario: 10 % sobre la utilidad hasta 15 UIT.'),
    ('renta_tasa_resto', 0.295,       'Régimen MYPE Tributario: 29,5 % sobre la utilidad que pasa de 15 UIT.'),
    ('boletas_tope_pct', 0.06,        'Ley del Impuesto a la Renta, art. 37 inc. z: las boletas del Nuevo RUS restan hasta el 6 % de lo sustentado con comprobantes.'),
    ('boletas_tope_uit', 200,         'Ley del Impuesto a la Renta, art. 37 inc. z: y nunca más de 200 UIT en el año.')
  ) as v (nombre, valor, nota)
 where not exists (select 1 from retail.parametros_tributarios p where p.nombre = v.nombre and p.vigente_desde = date '2017-01-01');

reset lock_timeout;

-- ============================== PARTE 2 · guardar_parametro_tributario ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece una vez; si el texto nuevo ya está, no hace nada.
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

-- Acepta los cuatro de «lo de antes del sistema» (los de la ley no se cambian desde la pantalla). La lista de siempre NO se toca: las migraciones
-- anteriores se reconocen ya pegadas buscando su texto completo («not in ('igv', … 'ventas_previas_erp')»), y reescribirla haría abortar a
-- 20261023013000 si alguien la vuelve a pegar. Se le antepone otra condición: `a or b and c` es `a or (b and c)`.
select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
$v$if p_nombre is null or p_nombre not in ($v$,
$n$if p_nombre is null or p_nombre not in ('renta_utilidad_previa', 'renta_costo_previo', 'renta_sin_papel_previo', 'renta_pagada_previa') and p_nombre not in ($n$);

-- Y los valida: soles; la utilidad puede ser una pérdida. Va justo después de `v_actor := …`, que es donde TERMINA el texto que dejó
-- 20261014002000: insertarlo entre los otros chequeos partiría el texto con que 20261023013000 se reconoce ya pegada.
select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
$v$  v_actor := retail.fn_actor_persona_id(true);$v$,
$n$  v_actor := retail.fn_actor_persona_id(true);
  -- ADR-0598: lo del año ANTES de que Finanzas tuviera datos, según el contador, para estimar la renta del año. En soles; la utilidad puede ser negativa.
  if p_nombre = 'renta_utilidad_previa' and (v_valor is null or v_valor < -100000000 or v_valor > 100000000) then
    raise exception 'La utilidad de antes del sistema va en soles (con signo menos si fue pérdida), hasta 100 millones.' using errcode = 'P0001';
  end if;
  if p_nombre in ('renta_costo_previo', 'renta_sin_papel_previo', 'renta_pagada_previa') and (v_valor is null or v_valor < 0 or v_valor > 100000000) then
    raise exception 'Ese monto de antes del sistema va en soles, de 0 a 100 millones.' using errcode = 'P0001';
  end if;$n$);

-- Comprobación: si algo no quedó, se dice aquí y no en la pantalla.
do $k$
begin
  if position('renta_sin_papel_previo' in pg_get_functiondef('retail.guardar_parametro_tributario(text, date, numeric, text)'::regprocedure)) = 0 then
    raise exception 'guardar_parametro_tributario no quedó con los parámetros de la renta del año';
  end if;
  if (select count(*) from retail.parametros_tributarios where nombre in ('renta_tramo_uit', 'renta_tasa_tramo', 'renta_tasa_resto', 'boletas_tope_pct', 'boletas_tope_uit')) < 5 then
    raise exception 'Falta la escala de la renta: pega primero la parte 1';
  end if;
end
$k$;

reset lock_timeout;
