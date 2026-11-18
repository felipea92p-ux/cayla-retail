-- ============================================================================
-- 20261106153000 — Las mermas (faltantes) entran al diario desde la misma fecha de corte que los sobrantes
--
-- EL PROBLEMA PRIMERO. La migración 20261106002000 dejó los sobrantes de antes del 1-nov SIN asiento, y los faltantes de octubre CON asiento (6951, S/ 10 248),
-- anotando que «octubre sigue sesgado unos S/ 10 mil a la baja hasta decidirlo». Se midió el origen de esos S/ 10 248 (2026-11-06, lectura de producción):
--   · son 287 prendas: 240 de conteos físicos (S/ 8 666), 41 de ajustes a mano «otro» (S/ 1 474) y 6 «merma» declaradas (S/ 108);
--   · los mismos conteos de octubre dieron 913 prendas SOBRANTES (S/ 24 056) que no restan: el stock real salió MAYOR que el del sistema;
--   · el 68 % de los faltantes cae del 1 al 13 de octubre, la etapa de arranque, cuando se cargaron 3 028 prendas (`carga_inicial`); en 52 prendas el
--     faltante se compensa con un sobrante de otra talla o color (S/ 4 436) y en casi toda categoría hay MÁS prendas vendidas «sin registrar»
--     (1 138, que no bajaron el stock) que faltantes: lo más probable es que sean las mismas prendas, ya contadas en el costo de ventas.
-- Felipe lo calificó de ruido de la etapa de pruebas (2026-11-06) y pidió que no cuente.
--
-- LA DECISIÓN. Una segunda fecha de corte, `parametros_finanzas.mermas_asientan_desde` (1-nov-2026), gemela de `sobrantes_asientan_desde`:
--   · DESDE EL CORTE, un faltante entra al diario (6951) como siempre. ANTES DEL CORTE NO PEGA AL RESULTADO.
--   · Lo de antes del corte sale a su propia causa, `faltantes_sin_asiento`, que da nota en la comprobación de la 201 (gemela de `sobrantes_sin_asiento`):
--     se sabe qué es y cuánto, no se pierde.
--   · NO se tocan los movimientos (se agregan, nunca se editan), ni `fn_perdida_razon` (LA definición de pérdida: la siguen usando Pérdidas, Frescura y
--     el Balance), ni el estado de existencias. La pantalla Inventario ▸ Pérdidas sigue mostrando esos conteos como lo que fueron.
--
-- QUÉ CAMBIA EN LOS NÚMEROS: el resultado de octubre sube S/ 10 248 (la cuenta 6951 de octubre queda en 0) y las mermas de noviembre en adelante no cambian.
-- OJO: octubre sigue sin reconocer sus sobrantes; ahora tampoco sus faltantes. Es simétrico y es lo que se le dirá al contador.
--
-- CONTRATO
--   PROMETE: (1) `fn_mermas_asientan_desde()` da el corte; (2) `fn_asientos` solo asienta mermas desde el corte; (3) `fn_bal_causas_mercaderia` explica los
--            faltantes anteriores al corte con la causa `faltantes_sin_asiento`, y `fn_conciliacion_contable` la acepta como nota, con el mismo trato que
--            `sobrantes_sin_asiento`; (4) repetir la migración no cambia nada.
--   ASUME:   que ya está pegada 20261106002000 (usa el mismo patrón y la misma tabla) y que ningún otro parche tocó esas tres funciones desde: si un ancla no
--            aparece exactamente las veces esperadas, aborta entero con un mensaje.
--   NO HACE: no mueve el corte de los sobrantes, no reclasifica ningún movimiento y no cierra octubre.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN, DESPUÉS DE 20261106002000. Agrega una columna con valor por defecto a una tabla de configuración y reescribe tres
-- funciones desde su definición viva. No crea políticas ni toma otras tablas. Sin `select … into` dentro de un texto entre comillas (ADR-0288).
-- SE ROMPE SI: octubre se cierra antes de pegarla (su foto ya trae los S/ 10 248 y no se recalcula); o si alguien mueve `mermas_asientan_desde` antes del 1-nov
-- sin avisar al contador (las pérdidas de arranque volverían a pegar).
-- DOWN: update retail.parametros_finanzas set mermas_asientan_desde = '2000-01-01' where id;  -- las mermas vuelven a asentarse desde siempre (la columna y la
--       causa nueva pueden quedarse: sin efecto).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

alter table retail.parametros_finanzas add column if not exists mermas_asientan_desde date not null default '2026-11-01';
comment on column retail.parametros_finanzas.mermas_asientan_desde is
  'Desde este día, un faltante (merma) entra al diario (6951 contra 201). Lo anterior no pega al resultado y sale a la causa faltantes_sin_asiento de la comprobación de la 201. Gemela de sobrantes_asientan_desde.';

create or replace function retail.fn_mermas_asientan_desde()
returns timestamptz
language sql stable security definer
set search_path = retail, public, extensions
as $$ select (p.mermas_asientan_desde::timestamp at time zone 'America/Lima') from retail.parametros_finanzas p where p.id; $$;
comment on function retail.fn_mermas_asientan_desde() is 'Desde qué momento las mermas (faltantes) entran al diario. Interna: la usan fn_asientos y la comprobación de la 201.';
revoke all on function retail.fn_mermas_asientan_desde() from public, anon;
grant execute on function retail.fn_mermas_asientan_desde() to authenticated;

-- El diario: una merma solo se asienta desde el corte.
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)$a$,
$n$and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and m.created_at >= retail.fn_mermas_asientan_desde()$n$, 1);

-- La comprobación de la 201: los faltantes de antes del corte quedan explicados, con su propia causa.
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$mv.created_at < retail.fn_sobrantes_asientan_desde()
    union all$a$,
$n$mv.created_at < retail.fn_sobrantes_asientan_desde()
    union all
    -- Faltantes de antes del corte (etapa de pruebas): no tienen asiento a propósito. Desde el corte los asienta el diario.
    select 'faltantes_sin_asiento', 'Faltantes y mermas de antes del corte: no pegan al resultado hasta ubicarlos',
           -sum(mv.dq * mv.c_mov) from mv
     where retail.fn_perdida_lado(mv.tipo, mv.motivo, mv.cantidad) = 'perdida' and mv.created_at < retail.fn_mermas_asientan_desde()
    union all$n$, 1);

-- La causa nueva es una nota, igual que sobrantes_sin_asiento.
select pg_temp.reemplazar('retail.fn_conciliacion_contable(date)',
$a$('venta_sin_prenda', 'redondeo', 'recepcion_sin_factura', 'sobrantes_sin_asiento')$a$,
$n$('venta_sin_prenda', 'redondeo', 'recepcion_sin_factura', 'sobrantes_sin_asiento', 'faltantes_sin_asiento')$n$, 2);

reset lock_timeout;
