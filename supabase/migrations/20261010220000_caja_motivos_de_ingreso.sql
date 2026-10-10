-- ADR-0375. Nació como `20261010160000` y ADR-0371: los dos números chocaron con otros PR que entraron antes a main
-- («colores_sin_familia_estampado» y «Por revisar»). Ya está en producción (versión `20261010144148`); el comentario que guardó
-- en la base dice ADR-0371 y se deja así para que el repo y producción sigan iguales.
-- Caja ▸ Registrar ingreso (Felipe 2026-10-10): los motivos de una ENTRADA de plata al cajón que no es una venta.
--
-- EL PROBLEMA. `registrar_movimiento_caja` tiene el vocabulario cerrado del modal de Caja (20260922235000), y para una
-- entrada solo aceptaba «Ajuste de caja (sobrante)» (del líder) y «Otro». Todo lo que de verdad entra al cajón a mitad del
-- turno —el sencillo que se saca de la caja fuerte, la plata que trae el líder, lo que presta otra sede, lo que vuelve de
-- un retiro— caía en «Otro», y ni el cierre ni Finanzas podían separarlo. «Depósito o retiro» sale de la cabecera de Caja
-- y en su lugar entra «Registrar ingreso», un mosaico como el del gasto rápido (ADR-0368) con estos conceptos.
--
-- LA DECISIÓN. Cuatro motivos nuevos de ENTRADA, todos tipeables desde el modal (no son de sistema):
--   'Sencillo de la caja fuerte'  plata de la caja fuerte de la misma sede (vuelve lo que se guardó al cerrar).
--   'Entrega del líder'           el líder de equipo trae plata (sencillo o fondo). Pide nota: quién la trajo.
--   'Préstamo de otra sede'       otra tienda presta plata. Pide nota: qué sede.
--   'Devolución de un retiro'     vuelve al cajón plata que se retiró antes en el turno.
-- Lo que NO es un ingreso de caja y la pantalla manda a su lugar: un abono de apartado (Apartados), una venta (Vender) y
-- el reembolso de un proveedor (Finanzas, con su marca de sistema). Registrarlos aquí los contaría dos veces.
-- Finanzas los sigue leyendo como «otros ingresos» (`fn_flujo_lineas`); separarlos por motivo es un paso aparte.
--
-- CÓMO. Parche por ancla sobre la definición VIVA (igual que 20260925150000: no hay archivo con la función entera, ADR-0190
-- le sumó el token por parche). Si alguna ancla no aparece exactamente una vez, se detiene sin tocar nada. Idempotente: si
-- la función ya trae los motivos nuevos, no hace nada. Sin políticas ni `alter`: se pega en una sola parte (ADR-0195).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare v_def text; v_hay integer;
  v_ancla_i constant text := $a$if p_tipo = 'ingreso' and p_motivo not in ('Ajuste de caja (sobrante)', 'Otro')$a$;
  v_nuevo_i constant text := $a$if p_tipo = 'ingreso' and p_motivo not in ('Ajuste de caja (sobrante)', 'Otro',
      'Sencillo de la caja fuerte', 'Entrega del líder', 'Préstamo de otra sede', 'Devolución de un retiro')$a$;
  v_ancla_n constant text := $a$if p_motivo in ('Depósito bancario', 'Otro') and (p_nota is null or trim(p_nota) = '') then$a$;
  v_nuevo_n constant text := $a$if p_motivo in ('Depósito bancario', 'Otro', 'Entrega del líder', 'Préstamo de otra sede')
     and (p_nota is null or trim(p_nota) = '') then$a$;
begin
  v_def := pg_get_functiondef('retail.registrar_movimiento_caja(uuid, text, numeric, text, text, boolean, uuid)'::regprocedure);
  if position('Préstamo de otra sede' in v_def) > 0 then
    return;
  end if;
  v_hay := (length(v_def) - length(replace(v_def, v_ancla_i, ''))) / length(v_ancla_i);
  if v_hay <> 1 then
    raise exception 'registrar_movimiento_caja cambió en la base: revisar antes de pegar (ancla de ingreso: % de 1).', v_hay;
  end if;
  v_hay := (length(v_def) - length(replace(v_def, v_ancla_n, ''))) / length(v_ancla_n);
  if v_hay <> 1 then
    raise exception 'registrar_movimiento_caja cambió en la base: revisar antes de pegar (ancla de la nota: % de 1).', v_hay;
  end if;
  v_def := replace(v_def, v_ancla_i, v_nuevo_i);
  v_def := replace(v_def, v_ancla_n, v_nuevo_n);
  execute v_def;
end $$;

comment on function retail.registrar_movimiento_caja(uuid, text, numeric, text, text, boolean, uuid) is
  'Una entrada o salida de plata del cajón que no es venta. Vocabulario cerrado: salidas (retiro, depósito, ajuste, compra de insumos, otro) y entradas (sobrante, sencillo de la caja fuerte, entrega del líder, préstamo de otra sede, devolución de un retiro, otro). Idempotente por p_token.';

reset lock_timeout;
