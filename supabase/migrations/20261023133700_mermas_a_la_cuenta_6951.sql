-- ============================================================================================================
-- NO PEGAR HASTA EL OK DEL CONTADOR.
-- 20261023133700_mermas_a_la_cuenta_6951.sql — CAYLA V2 · Finanzas · las mermas pasan de la 659 a la 6951
-- (versión PROVISIONAL: se reserva con `pnpm reservar migracion` antes de abrir el PR).
--
-- EL PROBLEMA PRIMERO. Hoy toda pérdida de inventario (faltante de conteo, resta a mano, dañada botada o donada, lo que
-- faltó en un traslado, venta anulada cuya prenda no volvió a la venta) se asienta contra la cuenta 659 «Desmedros y otros
-- (mermas)». Pero el 659 del plan contable peruano es «Otros gastos de gestión», no desvalorización de existencias: lo
-- sembró el manual de CAYLA con otro significado (docs/datos/13-PROMESAS-INCUMPLIDAS.md, «el mismo código con dos
-- significados»). Felipe decidió (2026-10-22) pasarlas, ANTES del primer cierre de mes, a la 6951 «Gastos por
-- desvalorización de inventarios — mercaderías» (PCGE 2019, dentro del costo de ventas). Su contador/a debe confirmar la
-- cuenta antes de pegar esto en producción.
--
-- ANALOGÍA CAYLA. Es cambiar la etiqueta del cajón donde la contadora archiva las prendas perdidas: las mismas prendas, el
-- mismo valor, el mismo mes; solo que el cajón se llama como lo llama la SUNAT. Nada se mueve de lugar en el Estado de
-- resultados: las mermas ya se restaban ANTES del margen bruto (margen = ventas − costo − fletes − mermas).
--
-- QUÉ HACE (un solo archivo, una sola parte):
--   1. La cuenta 6951 entra al plan (`retail.cuentas`: gasto, sección «mermas» del Estado de resultados, igual que la 659).
--   2. `retail.fn_asientos` (el diario derivado) asienta las pérdidas de inventario en la 6951: los TRES sitios donde hoy
--      escribe la '659' (las mermas por movimiento —reglas merma_merma, merma_cuarentena y merma_conteo—, el faltante de
--      traslado —merma_traslado— y la anulación con prenda no vendible —anulacion—). Reemplazo anclado sobre la definición
--      VIVA: los parches ajenos de la función se conservan.
--   3. `retail.fn_estado_resultados`: el DETALLE de mermas deja de leer «la cuenta 659» y lee «las cuentas de la sección
--      mermas» (el total ya salía de la sección). Así el detalle y el total no pueden desacordarse nunca, con la 659, la
--      6951 o la cuenta que el contador decida mañana.
--   4. Nada más cambia. Las diferencias de caja (6599) y el redondeo de efectivo (6598) NO son hijas de la 659 en la base:
--      son cuentas con su propio código que solo se parecen en el prefijo. Esta migración reemplaza SOLO los tres literales
--      '659' de la función, nunca un patrón «659%», y una prueba exige que 6599 y 6598 queden donde estaban.
--
-- DECIDÍ: seguir el patrón de reemplazo anclado de las migraciones recientes (`pg_temp.mermas_reemplazar`, cuenta cuántas
--   veces aparece el texto y aborta si no son las esperadas) y mantener la sección «mermas» para la 6951: así el Estado de
--   resultados no mueve una sola cifra ni una sola línea (solo cambia el código de cuenta que se ve en la columna «Cuenta»).
-- DESCARTÉ: poner la 6951 en la sección «costo_ventas» (donde la ubica el PCGE): el renglón «Mermas» del Estado de
--   resultados desaparecería y el costo de lo vendido subiría con una cifra que hoy se lee aparte; el margen bruto no
--   cambia, pero la lectura de Felipe sí, y eso es otra decisión (de presentación) que nadie pidió.
-- DESCARTÉ: renombrar o desactivar la 659: seguiría siendo «mermas» en la sección, así que cualquier resto histórico se
--   sigue contando en el margen; retirarla es decisión del contador (ver «QUEDA PENDIENTE»).
-- DESCARTÉ: reescribir `fn_asientos` entera desde su archivo original: viven parches de más de veinte migraciones y se perderían.
-- SE ROMPE SI: (a) una migración posterior recrea `fn_asientos` o `fn_estado_resultados` desde un archivo viejo: vuelve la
--   659 y esta migración deja de estar aplicada sin avisar (las pruebas `perdidas.mjs` M/F y `estado_resultados.mjs` N lo
--   detectan); (b) un mes se
--   cierra con la 659 y después se pega esto: su huella dejaría de coincidir (la guarda de abajo lo impide); (c) alguien
--   suma a `fn_asientos` una regla nueva de pérdida con la '659' escrita a mano: la verificación final aborta y las
--   pruebas fallan; (d) el contador pide otro código distinto de 6951: se repite esta migración con ese código.
--
-- EL CANDADO DE MES CERRADO. Un mes cerrado tiene el diario CONGELADO con las mermas en la 659 (`diario_cerrado`) y su
-- huella. Si la función de hoy asentara esas mermas en la 6951, la huella viva dejaría de coincidir con la congelada
-- («algo cambió» en Cierre de mes). Un mes cerrado nunca cambia: si ya existe un período `cerrado` en `retail.periodos`, la
-- migración ABORTA y nombra el mes. Hoy producción no tiene ninguno. Se reabre con motivo, se pega y se vuelve a cerrar.
-- Si la migración ya está aplicada, volver a pegarla NO hace nada (aunque después se hayan cerrado meses con la 6951).
-- Para que nadie cierre un mes entre la guarda y el final, la guarda (y el «deshacer») toman `diario_cerrado`, `periodos` y
-- `periodo_cierres` en SHARE ROW EXCLUSIVE: las tres tablas donde escribe `cerrar_periodo`, que escribe en `diario_cerrado`
-- ANTES que en `periodos` (por eso no bastaba el candado sobre `periodos` solo). Qué garantiza, con exactitud: un cierre que
-- ya escribió en alguna de las tres se ESPERA (si tarda más de 3 s, `lock_timeout` corta limpio sin cambiar nada y se pega de
-- nuevo cuando termine) y, al terminar, la guarda lo ve ya cerrado; un cierre o una reapertura que llegue después queda en
-- espera hasta que termine la migración. No frena las lecturas, y vale mientras todo corra en UNA transacción (el SQL
-- Editor corre todo lo pegado en una).
--
-- QUÉ NO CAMBIA (probado: scripts/pruebas/perdidas.mjs, casos M y MG, y estado_resultados.mjs, casos N):
--   · ningún total del Estado de resultados (ventas, costo, fletes, mermas, margen, planilla, gastos, resultado, IGV), ni
--     su detalle de mermas por regla, ni el Balance, ni la conciliación contable: son los mismos números;
--   · las líneas del diario salvo el código de cuenta de esas mermas (misma fecha, sede, asiento, regla, monto y glosa);
--   · la pestaña Pérdidas de Inventario (lee movimientos, no el plan de cuentas) y el resumen de Inventario;
--   · las diferencias de caja (6599) y el redondeo (6598).
--
-- QUIÉN LEE LA 659 (inventario hecho el 2026-10-22; todo lo de abajo se revisó):
--   · BASE. `fn_asientos` (3 sitios, esta migración); `fn_estado_resultados` (el detalle, esta migración); `fn_diario`,
--     `fn_balance_general`, `fn_conciliacion_contable`, `fn_cierre_mes_estado`, `cerrar_periodo`, `fn_asientos_descuadrados`,
--     `fn_bal_diario`: leen el diario o el plan por tipo/sección, no por el código 659 (no necesitan cambio; el Balance exige
--     que la cuenta exista en `retail.cuentas`, y por eso la 6951 entra primero). `fn_resumen_variantes.mermas_ventana`
--     cuenta movimientos, no cuentas. `diario_cerrado` guarda el código de cada línea congelada (sin meses cerrados: vacío).
--   · WEB. `apps/web/lib/resultados-reglas.ts` (la fila «Mermas» y su detalle: pasa a 6951); `registro-contable.ts` guarda un
--     mapa viejo de subgrupos que no se usa; el resto de la web no escribe el código.
--   · PRUEBAS. `scripts/pruebas/perdidas.mjs` y `estado_resultados.mjs` (F1, F2, K1, K4, E5 pasan a 6951 y se agregan los
--     casos M, MG y N); `scripts/pruebas/balance.mjs` y `redondeo_efectivo.mjs` hablan de 6599 y 6598 y no se tocan.
--   · DOCUMENTOS que dicen «659 = mermas» y se actualizan CUANDO SE PEGUE (no antes, para no adelantarse al contador):
--     docs/MANUAL-CONTABLE-CAYLA.md (reglas 11 y de resultados), docs/finanzas/fases/F5.md, docs/datos/modulos/12-contabilidad.md.
--
-- QUEDA PENDIENTE (de la contadora, no de esta migración): confirmar el código 6951 y su nombre; decidir si la 659 se retira
--   del plan (hoy queda activa, en la sección «mermas», sin movimientos) o se le devuelve su nombre del PCGE; y si la 6951
--   debe presentarse dentro del costo de ventas en vez de en el renglón «Mermas» (cambio de presentación, no de cifras).
--
-- ORDEN DE PEGADO. Es UN solo archivo y UNA sola parte, y no depende del orden respecto de otros parches de `fn_asientos`
--   (reemplazo anclado sobre lo que esté vivo) mientras ninguno recree la función entera. Requiere solo lo ya en
--   producción: 20260925130000 (diario), 20261004220000 (el faltante de traslado). Orden: (1) el OK del contador; (2) las dos
--   huellas md5 de «CÓMO VERIFICAR ANTES DE PEGAR» coinciden con producción; (3) sin meses cerrados (ver arriba); si el SQL
--   Editor responde «canceling statement due to lock timeout», alguien estaba cerrando o reabriendo un mes: nada cambió,
--   espera a que termine y pega de nuevo; (4) pegar esta migración tal cual en el SQL Editor (trae `retail.` y su
--   `search_path`; no toma políticas ni hace `alter table`: ADR-0195 no aplica; sin `select … into` dentro de un texto entre
--   comillas simples, ADR-0288); (5) correr las dos consultas de «CÓMO VERIFICAR DESPUÉS DE PEGAR»; (6) fusionar el PR de
--   la web, que ahora rotula la fila «Mermas» con la 6951 y lee las dos cuentas (la 659 también) para no quedar vacía si web
--   y base se publican en distinto orden; (7) actualizar los documentos de arriba; (8) recién entonces cerrar octubre.
--
-- CÓMO VERIFICAR ANTES DE PEGAR (solo lectura, en producción). Esta migración reemplaza texto dentro de la definición VIVA de
--   dos funciones, así que solo vale si producción sigue como estaba el 2026-10-22, cuando se escribió. Las huellas md5 de
--   esas dos definiciones vivas en producción ese día:
--     fn_asientos(date, date, uuid)           = 49f364de2b5c43a02a0f386cbac28d50
--     fn_estado_resultados(date, date, uuid)  = aac084b0a829d2e8f4dcf7bf365f091c
--   select md5(pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) as fn_asientos,
--          md5(pg_get_functiondef('retail.fn_estado_resultados(date, date, uuid)'::regprocedure)) as fn_estado_resultados;
--       → deben dar esas dos huellas. Si alguna no coincide, producción cambió desde entonces: NO pegues, revisa qué cambió
--         (la guarda de texto de la migración atajaría un cambio que quite el texto a reemplazar, pero no uno que lo deje en pie).
--
-- CÓMO VERIFICAR DESPUÉS DE PEGAR (solo lectura):
--   select codigo, nombre, tipo, seccion_resultados, activo from retail.cuentas where codigo in ('659', '6951', '6598', '6599') order by codigo;
--       → 4 filas; la 6951 es gasto de la sección «mermas»; las otras tres como estaban.
--   select position($q$'659'$q$ in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) as quedan_659,
--          position($q$'6951'$q$ in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) > 0 as ya_es_6951;
--       → 0 y true.
--
-- CÓMO DESHACERLA (el «down»). Sirve para volver a la 659 si el contador pide otra cosa ANTES de cerrar un mes. Copia el
--   bloque de abajo SIN el «-- » del comienzo de cada línea y pégalo en el SQL Editor (también una sola parte, idempotente).
--   Se niega si ya hay un mes cerrado (su foto guarda la 6951 desde que se pegó esto) y toma los mismos tres candados de la
--   guarda. Deja la cuenta 6951 en el plan, sin movimientos (inofensiva; para borrarla del todo: delete from retail.cuentas
--   where codigo = '6951', que fallará mientras algún cierre la guarde, y está bien). La prueba `perdidas.mjs` (M) ejecuta
--   este mismo bloque, así que no se pudre.
-- ----- DESHACER (DOWN) -----
-- set lock_timeout = '3s';
-- set search_path = retail, public, extensions;
-- do $deshacer_6951$
-- begin
--   lock table retail.diario_cerrado, retail.periodos, retail.periodo_cierres in share row exclusive mode;
--   if exists (select 1 from retail.periodos where estado = 'cerrado') then
--     raise exception 'Hay meses ya CERRADOS: su foto guarda las mermas en la cuenta 6951. Deshacer ahora movería su huella. Reabre esos meses con motivo en Cierre de mes, deshaz y vuelve a cerrarlos.'
--       using hint = 'mermas_6951_deshacer_mes_cerrado';
--   end if;
-- end
-- $deshacer_6951$;
-- create or replace function pg_temp.mermas_reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
-- returns void
-- language plpgsql
-- as $f$
-- declare
--   v_def text;
--   v_n integer;
-- begin
--   v_def := pg_get_functiondef(p_firma::regprocedure);
--   if position(p_nuevo in v_def) > 0 then
--     return;
--   end if;
--   v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
--   if v_n <> p_veces then
--     raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
--       p_firma, p_veces, p_viejo, v_n;
--   end if;
--   execute replace(v_def, p_viejo, p_nuevo);
-- end;
-- $f$;
-- select pg_temp.mermas_reemplazar('retail.fn_asientos(date, date, uuid)', $v$'6951', aa.costo_mal$v$, $n$'659', aa.costo_mal$n$, 1);
-- select pg_temp.mermas_reemplazar('retail.fn_asientos(date, date, uuid)', $v$'6951'::text as cuenta, mm.valor as debe$v$, $n$'659'::text as cuenta, mm.valor as debe$n$, 1);
-- select pg_temp.mermas_reemplazar('retail.fn_asientos(date, date, uuid)', $v$'6951', round(tx.unidades * tx.costo_unitario, 2), 0$v$, $n$'659', round(tx.unidades * tx.costo_unitario, 2), 0$n$, 1);
-- select pg_temp.mermas_reemplazar('retail.fn_estado_resultados(date, date, uuid)',
--   $v$from a join retail.cuentas k on k.codigo = a.cuenta where k.seccion_resultados = 'mermas' group by a.ubicacion_id, a.regla$v$,
--   $n$from a where a.cuenta = '659' group by a.ubicacion_id, a.regla$n$, 1);
-- ----- FIN DE DESHACER -----
-- ============================================================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. El candado: ningún mes cerrado puede cambiar por debajo
-- ----------------------------------------------------------------------------
-- Si ya está todo movido (re-pegado), no hay nada que medir y no se pregunta por los meses: repetirla no daña nada.
do $guarda_6951$
declare
  v_pendiente boolean;
  v_meses text;
  r record;
begin
  v_pendiente := position($a$'659'$a$ in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) > 0
              or position($a$where a.cuenta = '659'$a$ in pg_get_functiondef('retail.fn_estado_resultados(date, date, uuid)'::regprocedure)) > 0;
  if not v_pendiente then
    return;
  end if;

  -- Nadie cierra un mes entre esta lectura y el final de la migración. `cerrar_periodo` escribe en `diario_cerrado` ANTES que
  -- en `periodos` y en `periodo_cierres` después: se toman las tres, en ese mismo orden (así la migración y un cierre no se
  -- esperan en círculo). Un cierre ya empezado se espera (3 s y falla limpio); las lecturas siguen libres.
  lock table retail.diario_cerrado, retail.periodos, retail.periodo_cierres in share row exclusive mode;

  for r in
    select to_char(p.mes, 'YYYY-MM') || ' ' || coalesce(u.nombre, case p.alcance when 'empresa' then 'de la empresa' else 'CAYLA entera' end) as mes
      from retail.periodos p
      left join retail.ubicaciones u on u.id = p.ubicacion_id
     where p.estado = 'cerrado'
     order by p.mes, 1
  loop
    v_meses := concat_ws(', ', v_meses, r.mes);
  end loop;

  if v_meses is not null then
    raise exception 'Hay meses ya CERRADOS (%): su foto guarda las mermas en la cuenta 659 y esta migración las pasa a la 6951, así que su huella dejaría de coincidir con el diario de hoy. Un mes cerrado nunca cambia: reabre esos meses con motivo en Cierre de mes, pega esta migración y vuelve a cerrarlos.', v_meses
      using hint = 'mermas_6951_mes_cerrado';
  end if;
end
$guarda_6951$;

-- ----------------------------------------------------------------------------
-- 2. La cuenta 6951 entra al plan ANTES de que nada se asiente en ella
-- ----------------------------------------------------------------------------
-- El Balance y la conciliación unen el diario con `retail.cuentas`: una línea contra una cuenta que no está en el plan
-- desaparecería del Balance y la ecuación dejaría de cuadrar. Por eso va primero. Orden 47: la siguiente libre (6598 es la 46).
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('6951', 'Gastos por desvalorización de inventarios — mercaderías (mermas y pérdidas)', 'gasto', 'mermas', 47)
on conflict (codigo) do nothing;

-- ----------------------------------------------------------------------------
-- 3. El diario asienta las pérdidas de inventario en la 6951 (reemplazo anclado sobre la definición VIVA)
-- ----------------------------------------------------------------------------
-- Cambia un texto que debe aparecer exactamente `p_veces` veces; si el texto nuevo ya está, no hace nada (re-pegar).
-- Nombre propio (no `reemplazar`/`reemplazar_vivo`): cada pegado es una sola sesión y dos funciones temporales con la misma
-- firma pero distinta aridad dejarían «is not unique» (le pasó a 20261001100200).
create or replace function pg_temp.mermas_reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

-- 3a. La venta anulada cuya prenda no volvió a la venta (regla `anulacion`): su costo pasa a merma.
select pg_temp.mermas_reemplazar('retail.fn_asientos(date, date, uuid)',
  $v$'659', aa.costo_mal$v$,
  $n$'6951', aa.costo_mal$n$, 1);
-- 3b. Las mermas por movimiento (`merma_merma`, `merma_cuarentena`, `merma_conteo`), al costo de ese día.
select pg_temp.mermas_reemplazar('retail.fn_asientos(date, date, uuid)',
  $v$'659'::text as cuenta, mm.valor as debe$v$,
  $n$'6951'::text as cuenta, mm.valor as debe$n$, 1);
-- 3c. Lo que faltó en un traslado cerrado (`merma_traslado`), en la sede que lo envió.
select pg_temp.mermas_reemplazar('retail.fn_asientos(date, date, uuid)',
  $v$'659', round(tx.unidades * tx.costo_unitario, 2), 0$v$,
  $n$'6951', round(tx.unidades * tx.costo_unitario, 2), 0$n$, 1);

-- ----------------------------------------------------------------------------
-- 4. El detalle de mermas del Estado de resultados sigue a la sección, no a un código
-- ----------------------------------------------------------------------------
-- El total de «Mermas» ya se calculaba por sección (`cuentas.seccion_resultados = 'mermas'`); el detalle por regla leía la
-- cuenta '659' a mano. Los dos salen de la misma regla ahora: el detalle suma siempre el total.
select pg_temp.mermas_reemplazar('retail.fn_estado_resultados(date, date, uuid)',
  $v$from a where a.cuenta = '659' group by a.ubicacion_id, a.regla$v$,
  $n$from a join retail.cuentas k on k.codigo = a.cuenta where k.seccion_resultados = 'mermas' group by a.ubicacion_id, a.regla$n$, 1);

-- ----------------------------------------------------------------------------
-- 5. Verificación: o queda todo movido, o no queda nada (la transacción se deshace)
-- ----------------------------------------------------------------------------
do $verifica_6951$
begin
  if not exists (select 1 from retail.cuentas where codigo = '6951' and tipo = 'gasto' and seccion_resultados = 'mermas' and activo) then
    raise exception 'mermas: la cuenta 6951 no está como gasto activo de la sección «mermas».';
  end if;
  if position($a$'659'$a$ in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) > 0 then
    raise exception 'mermas: fn_asientos todavía asienta algo en la cuenta 659 (una regla nueva con la cuenta escrita a mano). Revisa el diario antes de pegar.';
  end if;
  if position($a$where a.cuenta = '659'$a$ in pg_get_functiondef('retail.fn_estado_resultados(date, date, uuid)'::regprocedure)) > 0 then
    raise exception 'mermas: fn_estado_resultados todavía lee el detalle de mermas de la cuenta 659.';
  end if;
end
$verifica_6951$;

select '20261023133700 · las mermas pasan a la cuenta 6951' as parte,
       case when exists (select 1 from retail.cuentas where codigo = '6951' and tipo = 'gasto' and seccion_resultados = 'mermas' and activo)
             and position($a$'6951'$a$ in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) > 0
             and position($a$'659'$a$ in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0
             and position($a$k.seccion_resultados = 'mermas' group by a.ubicacion_id, a.regla$a$ in pg_get_functiondef('retail.fn_estado_resultados(date, date, uuid)'::regprocedure)) > 0
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
