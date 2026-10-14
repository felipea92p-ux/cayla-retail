-- Fondos por rendir, fase 6 · actividad 1 (ADR-0362): la cuenta de cada persona, la plata que entra y sale de ella, y el módulo.
--
-- EL PROBLEMA PRIMERO. Quien compra para CAYLA (la encargada de una tienda, la general de Lima o quien compra para el Taller) paga al
-- proveedor, el flete, la carretilla y su almuerzo con plata que la empresa le entrega antes. Hoy esa plata no existe en el sistema:
-- sale del banco como si se hubiera gastado, y nadie puede decir cuánto tiene cada persona en la mano ni cuánto le falta rendir. Felipe
-- lo pidió como control contra el fraude (decisiones 26, 29 y 30): «al final tiene que verse cuánto le queda».
--
-- QUÉ CREA (las funciones llegan en 20261013182000; esta parte no tiene ninguna RPC).
--   1. La cuenta contable 1413, «Entregas a rendir cuenta» (decisión 57: el fondo va a la 1413 hasta que el contador diga otra cosa).
--      Producción no la tenía (consultado el 2026-10-13).
--   2. Un tipo de cuenta de dinero nuevo, `fondo`, con su dueña en `cuentas_dinero.persona_id` (una persona de Dynamic). Una sola
--      cuenta de fondo viva por persona; nace la primera vez que alguien le entrega plata (`entregar_fondo`), sin saldo inicial, y su
--      cuenta contable es la 1413. Como la cuenta contable de una cuenta de dinero no cambia nunca (`fn_cuentas_dinero_inmutable`), la
--      1413 entra ahora y no en la actividad 7 (contabilidad): cambiarla después obligaría a tocar cuentas ya usadas.
--   3. Dos movimientos de dinero nuevos: `entrega_fondo` (de un banco, una caja fuerte o lo que tiene el líder AL fondo de una persona)
--      y `devolucion_fondo` (del fondo a una de esas cuentas). No son gasto: la plata cambia de manos y la caja de CAYLA no cambia. El
--      egreso nace después, en cada pago que la persona haga desde su fondo (actividad 2), como pide el brief.
--   4. El módulo `fondos` («Fondos por rendir»), en el grupo Compras, orden 175 (entre Por pagar, 170, y Proveedores, 180; ninguna
--      migración usa el 175). Delegable y SIN rol: nace solo para el líder (ADR-0161, decisión 35). En el menú va directo en Compras,
--      como octava entrada (Felipe 2026-10-13, decisión 65).
--
-- DESCARTÉ
--   · Usar la cuenta `por_rendir` («Efectivo entregado al líder») con una dueña, como proponía el mapa de módulos: esa cuenta es la caja
--     de la empresa que el líder recibe de los cierres (101), no un anticipo a rendir (1413), y seis piezas suponen que hay UNA sola
--     (el índice `cuentas_dinero_por_rendir_uq`, el traslado al líder en `fn_dinero_libro` y `fn_caja_traslados_sellar`, el ingreso a
--     caja «del líder» en `registrar_ingreso_caja`, y tres pruebas). Con un tipo propio ninguna cambia y la contabilidad sale correcta.
--   · Guardar el saldo del fondo: se suma, como el de toda cuenta de dinero (`fn_dinero_libro`). Una cifra guardada se desincroniza.
--   · Crear el fondo desde «Cuentas y dinero» (`crear_cuenta_dinero`): un fondo no se abre vacío; nace con la primera entrega, que dice
--     de dónde salió la plata.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, ANTES de 20261013182000: una cuenta contable, una columna y
-- restricciones nuevas en dos tablas que existen (sin datos de fondo: en producción hay 0 movimientos de dinero al 2026-10-13) y una
-- fila en `modulos`. Sin políticas (ADR-0195), sin `drop trigger` y sin `select … into` dentro de textos entre comillas (ADR-0288).
-- Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La cuenta contable del fondo (decisión 57, provisional hasta el contador) ----------
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('1413', 'Entregas a rendir cuenta (fondos para comprar)', 'activo', null, 3)
on conflict (codigo) do nothing;

-- ---------- 2. El fondo: un tipo de cuenta de dinero con dueña ----------
alter table retail.cuentas_dinero add column if not exists persona_id uuid references public.personas (id);
comment on column retail.cuentas_dinero.persona_id is
  'La dueña de un fondo por rendir (ADR-0362, fase 6). Solo la tiene una cuenta de tipo «fondo», y no cambia.';

alter table retail.cuentas_dinero drop constraint if exists cuentas_dinero_tipo_check;
alter table retail.cuentas_dinero add constraint cuentas_dinero_tipo_check
  check (tipo in ('cajon', 'caja_fuerte', 'por_rendir', 'banco', 'por_abonar', 'tarjeta_credito', 'fondo'));

alter table retail.cuentas_dinero drop constraint if exists cuentas_dinero_contable_del_tipo;
alter table retail.cuentas_dinero add constraint cuentas_dinero_contable_del_tipo check (
  (tipo in ('cajon', 'caja_fuerte', 'por_rendir') and cuenta_contable = '101')
  or (tipo = 'banco' and cuenta_contable = '104')
  or (tipo = 'por_abonar' and cuenta_contable = '105')
  or (tipo = 'tarjeta_credito' and cuenta_contable = '451')
  or (tipo = 'fondo' and cuenta_contable = '1413')
);

-- Un fondo siempre tiene dueña, y solo un fondo la tiene.
alter table retail.cuentas_dinero drop constraint if exists cuentas_dinero_fondo_con_duena;
alter table retail.cuentas_dinero add constraint cuentas_dinero_fondo_con_duena check ((tipo = 'fondo') = (persona_id is not null));

-- Un fondo empieza en cero: lo que tiene sale de sus entregas, nunca de un saldo escrito a mano.
alter table retail.cuentas_dinero drop constraint if exists cuentas_dinero_fondo_sin_saldo;
alter table retail.cuentas_dinero add constraint cuentas_dinero_fondo_sin_saldo
  check (tipo <> 'fondo' or (saldo_inicial = 0 and saldo_desde is null));

-- Una sola cuenta de fondo viva por persona: las entregas se suman en la misma.
create unique index if not exists cuentas_dinero_fondo_uq on retail.cuentas_dinero (persona_id)
  where tipo = 'fondo' and archivada_en is null;

-- ---------- 3. La plata que entra y sale de un fondo ----------
alter table retail.movimientos_dinero drop constraint if exists movimientos_dinero_tipo_check;
alter table retail.movimientos_dinero add constraint movimientos_dinero_tipo_check
  check (tipo = any (array['aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta',
                           'entre_cuentas', 'entrega_fondo', 'devolucion_fondo']));

-- ---------- 4. El módulo (sin rol: solo el líder hasta que lo dé) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('fondos', 'Compras', 'Fondos por rendir',
   'Entregar plata a una persona para que compre, registrar lo que devuelve y ver cuánto tiene cada una en la mano',
   175, false, true)
on conflict (clave) do nothing;

reset lock_timeout;
