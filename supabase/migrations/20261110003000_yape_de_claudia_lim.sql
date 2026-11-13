-- ============================================================================
-- 20261110003000 — La cuenta «Yape de Claudia · LIM»: el interruptor (ADR-0638, actividad 2 de Lima, parte 3 de 3)
--
-- EL PROBLEMA PRIMERO. Lo de CLAURE que se paga por Yape o Plin en Tienda LIM va al número de Claudia y no a un banco de CAYLA. Para anotar eso hace falta una cuenta que sea de CLAURE: sin ella,
-- esos cobros se sellan en BCP Empresa e inflan un banco que nunca recibió esa plata.
--
-- QUÉ PROMETE. Nace UNA cuenta `banco`, 104, empresa CLAURE, saldo 0, sin `saldo_desde` y sin número (el repo es público). Va al final y es el interruptor: las partes 1 y 2 ya
-- la esperan, así que aparece fuera de los saldos, de los combos y del libro desde su primer segundo. Vacía, ninguna cifra cambia. La sede no se guarda: `empresa_sedes` la dice (`banco` obliga `ubicacion_id` nulo).
--
-- QUÉ NO PROMETE. No mueve ningún cobro a ella: eso lo hace la actividad siguiente, una por una, con `corregir_pagos_venta` y cuenta explícita; y los nuevos, el sello por dueño (actividad 3).
--
-- DECIDÍ `saldo_desde` nulo: con fecha, `fn_flujo_antes_del_arranque` y `fn_bal_causas_dinero` la verían, y el candado de la parte 1 exige que no lleve.
-- DESCARTÉ crearla con `crear_cuenta_dinero`: esa función no recibe empresa, y la cuenta nacería de CAYLA.
-- SE ROMPE SI se pega antes que las partes 1 y 2: entraría a los saldos y a los combos, y un cobro saldría del libro sin salir de la 104.
--
-- CÓMO VERIFICAR.
--   select nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, numero, archivada_en from retail.cuentas_dinero where empresa_id <> retail.fn_empresa_casa_id();
--     → una fila: «Yape de Claudia · LIM», banco, 104, 0, nulo, nulo, nulo.
-- Las cinco huellas de 20261110001000 salen iguales (en `bal_dinero` la cuenta no entra porque se filtra por saldo <> 0).
-- CÓMO SE PEGA. Sola y al final. Se puede pegar dos veces. Vence la foto del Diario (`cuentas_dinero` lleva `diario_vence` con 'todo'): es lo esperado.
-- VOLVER ATRÁS. `eliminar_cuenta_dinero` o archivarla, mientras no tenga cobros.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable, empresa_id, saldo_inicial, saldo_desde, orden)
select 'c1a07e00-0000-4000-8000-000000000101', 'Yape de Claudia · LIM', 'banco', '104', e.id, 0, null, 900
  from retail.empresas e
 where e.clave = 'claure'
   and not exists (select 1 from retail.cuentas_dinero c where c.empresa_id = e.id and c.tipo = 'banco' and c.archivada_en is null);

do $comprobar$
begin
  if not exists (select 1 from retail.cuentas_dinero c join retail.empresas e on e.id = c.empresa_id where e.clave = 'claure' and c.tipo = 'banco' and c.saldo_inicial = 0 and c.saldo_desde is null) then
    raise exception 'La cuenta de CLAURE no quedó creada.';
  end if;
end
$comprobar$;
select 'QUEDÓ BIEN' as resultado;
