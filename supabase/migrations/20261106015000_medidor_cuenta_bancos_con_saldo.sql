-- ============================================================================
-- 20261106015000 — El medidor cuenta los bancos con saldo, no las filas del Balance (tarea 28 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. La pieza «Con cuánto empezaste» del medidor de confianza dice «Ningún banco tiene saldo de arranque» y hoy 4 lo
-- tienen. Cuenta `fn_saldos_iniciales()` vigentes, que son las filas de `saldos_iniciales` (el arranque del BALANCE: capital, deudas), y
-- compara eso contra los bancos. Son dos cosas distintas: el saldo de un banco vive en `cuentas_dinero.saldo_inicial` / `saldo_desde`
-- (Cuentas y dinero), y el Balance tiene su propio arranque. El medidor acusaba a los bancos de algo que sí estaba hecho.
--
-- LA DECISIÓN. Los hechos de la pieza pasan a ser:
--   · `registrados` = bancos activos con su saldo fechado (`saldo_desde is not null`); `bancos` sigue siendo los bancos activos.
--   · `arranque_balance` = filas vigentes de `saldos_iniciales` (lo que antes se llamaba `registrados`), para que la web diga APARTE que
--     falta el arranque del Balance. La web vieja ignora el campo nuevo.
-- Un banco con saldo en 0 pero fechado cuenta: la persona declaró que empezó en cero.
--
-- NO HACE: no cambia ninguna otra pieza, ni los pesos (viven en la web), ni escribe nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Se reescribe desde la definición viva cambiando UNA ancla; si no
-- aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:finanzas-confianza`.
--
-- SE ROMPE SI: una migración futura recrea `fn_finanzas_confianza` copiando un texto viejo del repo (la prueba lo vigila).
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

select pg_temp.reemplazar('retail.fn_finanzas_confianza(date, uuid)',
$a$'registrados', (select count(*) from retail.fn_saldos_iniciales() s where s.vigente),$a$,
$n$'registrados', (select count(*) from retail.cuentas_dinero c where c.tipo = 'banco' and c.archivada_en is null and c.saldo_desde is not null),
           'arranque_balance', (select count(*) from retail.fn_saldos_iniciales() s where s.vigente),$n$, 1);
