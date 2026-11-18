-- ============================================================================
-- 20261028065000 — El Taller tiene su cuenta de pago por defecto: la de sus TRANSFERENCIAS (ADR-0553)
--
-- EL PROBLEMA PRIMERO
--   Cuando el Taller le paga a un proveedor por transferencia, el campo «Sale de» no propone ningún banco y el sello del pago deja
--   la cuenta en blanco, porque el Taller no puede guardar «a qué cuenta entra cada cobro»: `guardar_medio_de_cobro` solo acepta
--   tiendas y `fn_produccion_pagos_sellar` le pregunta a `fn_cuenta_sellada` por una sede NULA («el Taller no cobra, así que sin
--   elegida no hay propuesta»). El resultado es que cada pago del Taller exige que alguien elija el banco a mano, o queda «sin
--   cuenta» y el saldo del banco no baja.
--
-- LO QUE PROMETE (contrato)
--   1. El Taller puede guardar UNA cuenta por defecto, SOLO para sus transferencias (no para Yape, Plin, tarjeta ni QR: el Taller
--      no cobra, y esos medios los cobra una tienda). La elige el líder en Configuración ▸ Cuentas y cobros; el código no fija
--      ningún banco.
--   2. `fn_medios_de_cobro()` lista al Taller con UNA sola fila (la transferencia); las tiendas siguen con sus cinco medios.
--   3. El pago de un comprobante del Taller (`comprobantes_produccion_pagos`) por transferencia (o depósito u «otro», igual que
--      lo lee el libro de saldos) SIN cuenta elegida se sella en esa cuenta, con la vigencia de la fecha del pago.
--   4. La PRIMERA vez que se configura al Taller, la cuenta rige desde HOY (`vigente_desde = fn_hoy_lima()`), no desde 1900-01-01
--      como en las tiendas: así los gastos y pagos viejos del Taller que hoy están «sin cuenta» no se mueven solos a ese banco
--      (y el cierre de octubre no cambia de cifra). Para las tiendas todo sigue igual.
--   5. La regla «el Taller solo guarda transferencias» vive también en la TABLA (el disparador de `medios_de_cobro`), no solo en la
--      función que guarda: nada escrito por otro camino puede dejar un Yape, un Plin, una tarjeta o un QR del Taller.
--
-- OTROS USOS DE ESA MISMA CUENTA (el mismo patrón que ya tienen las tiendas; `fn_cuenta_de_cobro` no mira el tipo de sede)
--   · Los gastos y activos del Taller pagados por transferencia, que el libro de saldos deduce con `fn_cuenta_de_cobro(sede, 'transferencia')`.
--   · Los pagos de Compras destinados al Taller, y un cierre de caja del Taller con destino «banco» y sin cuenta elegida.
--   · «Lo de hoy sí cuenta»: el libro lo deriva de la configuración y no del sello, así que un gasto del Taller con fecha de HOY o
--     posterior que estaba «sin cuenta» baja ese banco en el instante de configurar. Lo de ANTES de hoy no se mueve (punto 4).
--     Quien no quiera ese efecto regulariza a mano los gastos de hoy del Taller antes de configurar.
--
-- LO QUE ASUME
--   · Hay un solo Taller activo (`ubicaciones.tipo = 'taller'`); el sello toma el más antiguo si hubiera dos.
--   · Una elegida explícita siempre gana: este cambio solo llena el hueco cuando nadie eligió.
--
-- LO QUE NO HACE (a propósito)
--   · No toca `fn_cuenta_sellada`: sus huellas están fijadas en las pruebas del redondeo (20261003111000) y ya lleva tres parches
--     de 20261016173000. Todo el cambio entra por quién LA LLAMA (el sello del Taller ahora le pasa la sede del Taller).
--   · No mueve nada de lo ya sellado. El archivar de una cuenta que es el destino del Taller ya se bloquea solo (no filtra por
--     tipo de sede); aquí solo se arregla el texto de «Editar cuenta» (`fn_cuenta_dinero_detalle`), que no decía «Taller».
--
-- CÓMO. Reemplazos anclados sobre las funciones VIVAS (`pg_temp.reemplazar`, el patrón de 20261016173000): cada uno aborta sin
-- cambiar nada si su ancla no aparece exactamente las veces esperadas, y no hace nada si el texto nuevo ya está (idempotente).
-- Las anclas no se cruzan con las de 20261016173000 (la línea del medio, el `cross join` y el bloque tarjeta/QR).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, con el prefijo `retail.` escrito. Solo cambia funciones: ninguna tabla, ninguna
-- política, ningún `drop trigger`. `lock_timeout = 3s`.
-- SE ROMPE SI: (1) la web que muestra la fila del Taller se publica antes que esto: la pantalla no encuentra la fila y no ofrece
-- nada (no se cae); (2) alguien crea un segundo Taller activo: el sello toma el más antiguo y el otro seguiría sin propuesta;
-- (3) alguien repega 20261015034000 sobre esta base: su reemplazo anclado ya no encuentra su texto viejo ni el nuevo y ABORTA con
-- «cambió desde que se escribió esta migración» (falla en voz alta, no revierte nada; las pruebas de comprobantes de insumos llevan
-- un módulo, `sello-taller-antes-de-cuenta.mjs`, que deshace este parche antes); (4) un pago del Taller por transferencia con fecha ANTERIOR a hoy: no recibe
-- propuesta (la vigencia empieza hoy), y se elige a mano como hasta ahora; (5) ORDEN: primero la web y después el SQL. Con la web
-- vieja y la base nueva, la fila del Taller saldría en Configuración con cinco casillas y la base rechazaría las cuatro que no son
-- transferencia con «El Taller solo guarda…» (un error claro; ningún dinero queda mal sellado).
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

-- ---------- 1. Guardar «a qué cuenta entra»: el Taller entra, pero solo con la transferencia ----------
-- 1a. La puerta: una tienda activa (como siempre) o el Taller activo con el medio «transferencia».
select pg_temp.reemplazar('retail.guardar_medio_de_cobro(uuid, text, uuid)',
$v$and activo and tipo = 'tienda') then$v$,
$n$and activo and (tipo = 'tienda' or (tipo = 'taller' and p_medio = 'transferencia'))) then$n$, 1);

-- 1b. El mensaje: si es el Taller con otro medio, lo dice; si no, el de siempre.
select pg_temp.reemplazar('retail.guardar_medio_de_cobro(uuid, text, uuid)',
$v$raise exception 'Esa tienda no existe o no está activa.' using errcode = 'P0001';$v$,
$n$raise exception '%', case
      when exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and activo and tipo = 'taller')
        then 'El Taller solo guarda la cuenta de sus transferencias: Yape, Plin, tarjeta y QR se cobran en una tienda.'
      else 'Esa tienda no existe o no está activa.'
    end using errcode = 'P0001';$n$, 1);

-- 1c. La vigencia: a una tienda se le configura desde siempre la primera vez (lo pasado se completa); al Taller, desde hoy.
select pg_temp.reemplazar('retail.guardar_medio_de_cobro(uuid, text, uuid)',
$v$case when v_hay then v_hoy else '1900-01-01'::date end$v$,
$n$case when v_hay then v_hoy
              when exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and tipo = 'taller') then v_hoy
              else '1900-01-01'::date end$n$, 1);

-- ---------- 2. La lista de Configuración: el Taller con una sola fila, la transferencia ----------
select pg_temp.reemplazar('retail.fn_medios_de_cobro()',
$v$where u.activo and u.tipo = 'tienda'$v$,
$n$where u.activo and (u.tipo = 'tienda' or (u.tipo = 'taller' and m.medio = 'transferencia'))$n$, 1);

-- ---------- 3. El candado de la tabla: nada del Taller que no sea transferencia, venga por donde venga ----------
select pg_temp.reemplazar('retail.fn_medios_de_cobro_validar()',
$v$  if new.cuenta_id is not null then$v$,
$n$  -- ADR-0553: el Taller no cobra; solo guarda de qué banco sale lo que paga por transferencia.
  if new.medio <> 'transferencia' and exists (select 1 from retail.ubicaciones u where u.id = new.ubicacion_id and u.tipo = 'taller') then
    raise exception 'El Taller solo guarda la cuenta de sus transferencias: Yape, Plin, tarjeta y QR se cobran en una tienda.' using errcode = 'P0001';
  end if;
  if new.cuenta_id is not null then$n$, 1);

-- ---------- 4. El sello de un pago del Taller: le pregunta por SU sede, no por una nula ----------
-- Con una elegida explícita no cambia nada; sin elegida, `fn_cuenta_sellada` propone la cuenta de las transferencias del Taller
-- (o nada, si el medio es efectivo, Yape o Plin: esos no tienen fila del Taller). Es el mismo patrón con el que
-- 20260925120000 busca al Taller.
select pg_temp.reemplazar('retail.fn_produccion_pagos_sellar()',
$v$new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, null, new.fecha, new.cuenta_dinero_id);$v$,
$n$new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo,
    (select u.id from retail.ubicaciones u where u.tipo = 'taller' and u.activo order by u.created_at limit 1),
    new.fecha, new.cuenta_dinero_id);$n$, 1);

-- ---------- 5. «Editar cuenta» cuenta también lo que entra desde el Taller ----------
-- Cosmético: la cuenta que es el destino de las transferencias del Taller ya no se puede archivar (eso se bloqueaba solo), pero la
-- ventana no lo decía. Ahora lista «Taller · transferencia» junto a las tiendas.
select pg_temp.reemplazar('retail.fn_cuenta_dinero_detalle(uuid)',
$v$where u.activo and u.tipo = 'tienda' and retail.fn_cuenta_de_cobro(u.id, m.medio, v_hoy) = p_cuenta_id;$v$,
$n$where u.activo and (u.tipo = 'tienda' or (u.tipo = 'taller' and m.medio = 'transferencia'))
     and retail.fn_cuenta_de_cobro(u.id, m.medio, v_hoy) = p_cuenta_id;$n$, 1);
