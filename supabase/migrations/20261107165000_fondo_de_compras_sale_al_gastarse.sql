-- ============================================================================
-- 20261107165000 — Lo gastado del fondo de compras deja de ser plata el día que se gasta (ADR-0621, decisión 1)
--
-- EL PROBLEMA PRIMERO. La compradora recibe un fondo (cuenta `fondo`, 1413) y compra en Gamarra. Lo que paga queda anotado en un papel
-- (`compra_papeles.pagado`) o en un gasto del viaje (`compra_gastos.monto`) «por completar» hasta que Compras lo revisa; recién al completarlo
-- entra al libro (`compra_pagos` o `gastos`, con la fecha del papel y la cuenta del fondo). Mientras tanto, la cuenta del fondo seguía mostrando
-- la plata entera: el Flujo decía que CAYLA tenía plata que ya era mercadería, «Hoy» salía inflado y los días de caja también.
-- Felipe (2026-11-06): «deja de ser plata disponible al gastarse, no al entregarse»; lo entregado y no gastado va aparte, «Por volver de
-- compras», y no cuenta para días de caja ni para el mínimo.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_fondo_por_completar(hasta)` (interna): un renglón por papel y por gasto del viaje que siguen «por completar», con la
--            cuenta del fondo vivo de quien compró, la fecha del papel, el monto en negativo y la MISMA categoría que tendrán al completarse
--            (papel → mercadería; gasto del viaje → gastos). Deja de devolverlo en la misma transacción en que se completa o se anula.
--            (2) `fn_cuentas_dinero_saldos`: el saldo de una cuenta `fondo` ya resta lo gastado por completar hasta el corte. Así Cuentas y
--            dinero, el Resumen y `fn_flujo_disponible` dicen lo mismo: lo que la compradora tiene en la mano.
--            (3) `fn_flujo_lineas`: esos renglones salen como salida ese día (mercadería o gastos), así que el `descuadre` del Flujo sigue en 0.
--            Al completarse, el renglón simulado se va y entra el real con la misma fecha, cuenta y categoría: los totales no cambian (salvo
--            que Compras corrija el monto del papel por debajo de lo pagado, que es una corrección real).
--            (4) `fn_flujo_por_volver(corte)` (interna): lo que queda en los fondos vivos, nunca negativo: «Por volver de compras».
--            (5) `fn_flujo_caja_proyeccion` parte de «lo que hay − lo de Claudia − lo por volver» y lo dice en `por_volver_compras`;
--            `fn_flujo_caja_real` también lo dice en `por_volver_compras` (al final del período). Lo demás de las dos respuestas, igual.
--            (6) `fn_mi_fondo` (el combo «Sale de ▸ Mi fondo») dice lo mismo que la cuenta en Cuentas y dinero.
--   ASUME:   un solo fondo vivo por persona (`cuentas_dinero_fondo_uq`); `completar_papel_compra` y `revisar_gasto_compra` marcan
--            `completado` en la misma transacción en que insertan el pago o el gasto, con la fecha del papel y ese fondo.
--   NO HACE: no toca `fn_dinero_libro` (sostiene `fn_fondo_saldo`, `fn_mi_plata_tiene` y Compras ▸ Revisar compras, que ya restan lo
--            por completar por su cuenta), ni la plata anotada por confirmar ni lo que la compradora decidió devolver (siguen siendo plata
--            en el fondo hasta que se mueven). Un papel de alguien SIN fondo vivo no resta nada hasta completarse (pagó con plata suya).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Dos funciones nuevas y reemplazos anclados sobre cinco funciones vivas: ABORTAN SIN
-- CAMBIAR NADA si el texto no es el esperado y dicen cuál. Sin políticas, sin `alter table`, sin `drop trigger`: no toma las tablas de
-- `auth` ni de `storage`. Idempotente (un reemplazo ya aplicado se salta). SE ROMPE SI: otra migración reescribe esas cuatro funciones y
-- cambia los textos anclados.
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

-- ---------- 1. Lo gastado del fondo que todavía no se completa, renglón por renglón ----------
create or replace function retail.fn_fondo_por_completar(p_hasta date)
returns table(cuenta_id uuid, fecha date, monto numeric, clave text, origen text)
language sql
stable
set search_path = retail, public, extensions
as $$
  -- Un papel paga del fondo SOLO lo pagado al comprar (lo que falta queda en Por pagar al completarse): `completar_papel_compra`.
  select f.id, p.fecha, -p.pagado, 'papel:' || p.id::text, 'papel'::text
    from retail.compra_papeles p
    join retail.cuentas_dinero f on f.tipo = 'fondo' and f.persona_id = p.persona_id and f.archivada_en is null
   where p.estado = 'por_completar' and p.pagado > 0 and p.fecha <= p_hasta
  union all
  -- Un gasto del viaje entra como gasto pagado del fondo (`revisar_gasto_compra` → `registrar_gasto_viaje`): origen 'gasto', como en el libro.
  select f.id, g.fecha, -g.monto, 'cgasto:' || g.id::text, 'gasto'::text
    from retail.compra_gastos g
    join retail.cuentas_dinero f on f.tipo = 'fondo' and f.persona_id = g.persona_id and f.archivada_en is null
   where g.estado = 'por_completar' and g.fecha <= p_hasta;
$$;

comment on function retail.fn_fondo_por_completar(date) is
  'ADR-0621 (interna): lo gastado del fondo de compras que sigue por completar (papeles con lo pagado y gastos del viaje), con la cuenta del fondo vivo, la fecha del papel, el monto en negativo y el origen que tendrá en el libro al completarse (papel → mercadería, gasto → gastos).';
revoke all on function retail.fn_fondo_por_completar(date) from public, anon, authenticated;

-- ---------- 2. El saldo de la cuenta del fondo ya no cuenta lo gastado ----------
select pg_temp.reemplazar('retail.fn_cuentas_dinero_saldos(date,uuid)',
$v$    select l.cuenta_id, l.fecha, l.monto from retail.fn_dinero_libro(v_corte) l where l.cuenta_id is not null$v$,
$n$    select l.cuenta_id, l.fecha, l.monto from retail.fn_dinero_libro(v_corte) l where l.cuenta_id is not null
    union all
    -- ADR-0621: lo gastado del fondo de compras deja de ser plata el día que se gasta, aunque el papel siga por completar.
    select f.cuenta_id, f.fecha, f.monto from retail.fn_fondo_por_completar(v_corte) f$n$,
1);

-- ---------- 3. El Flujo lo cuenta como salida ese día, con la categoría que tendrá ----------
select pg_temp.reemplazar('retail.fn_flujo_lineas(date,date)',
$v$      from retail.fn_dinero_libro(p_hasta) l
      left join retail.cuentas_dinero c on c.id = l.cuenta_id$v$,
$n$      from (select d.cuenta_id, d.fecha, d.monto, d.clave, d.origen from retail.fn_dinero_libro(p_hasta) d
            union all
            -- ADR-0621: lo gastado del fondo por completar, como saldrá al completarse (mismo día, misma cuenta).
            select f.cuenta_id, f.fecha, f.monto, f.clave, f.origen from retail.fn_fondo_por_completar(p_hasta) f) l
      left join retail.cuentas_dinero c on c.id = l.cuenta_id$n$,
1);

select pg_temp.reemplazar('retail.fn_flujo_lineas(date,date)',
$v$             when l.origen = 'reembolso' then 'reembolsos'$v$,
$n$             when l.origen = 'reembolso' then 'reembolsos'
             when l.origen = 'papel' then 'mercaderia'                          -- ADR-0621: un papel del fondo por completar$n$,
1);

-- ---------- 4. «Por volver de compras»: lo que queda en los fondos vivos ----------
create or replace function retail.fn_flujo_por_volver(p_corte date)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $$
  -- Lo mismo que muestra Cuentas y dinero en cada fondo, sin lo que ya se gastó. Si alguien gastó de más (CAYLA le debe), no hay nada
  -- por volver de ella: la deuda ya baja el disponible y no se suma de vuelta.
  select coalesce(sum(greatest(s.saldo, 0)), 0)
    from retail.fn_cuentas_dinero_saldos(p_corte, null) s
   where s.tipo = 'fondo' and not s.archivada and s.saldo is not null;
$$;

comment on function retail.fn_flujo_por_volver(date) is
  'ADR-0621 (interna): lo entregado a las compradoras que todavía no se gastó (saldo de los fondos vivos, nunca negativo). No cuenta para días de caja ni para el mínimo.';
revoke all on function retail.fn_flujo_por_volver(date) from public, anon, authenticated;

-- ---------- 5. La proyección parte sin lo que está por volver ----------
select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$v$  v_claudia numeric := 0;$v$,
$n$  v_claudia numeric := 0;
  v_por_volver numeric := 0;$n$,
1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$v$  v_saldo := retail.fn_flujo_disponible(v_hoy) - v_claudia;$v$,
$n$  -- ADR-0621: lo que las compradoras todavía tienen para comprar no paga cuentas: no entra a días de caja ni al mínimo.
  v_por_volver := retail.fn_flujo_por_volver(v_hoy);
  v_saldo := retail.fn_flujo_disponible(v_hoy) - v_claudia - v_por_volver;$n$,
1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$v$    'saldo_hoy', v_saldo, 'de_claudia', v_claudia, 'minimo_caja', v_minimo,$v$,
$n$    'saldo_hoy', v_saldo, 'de_claudia', v_claudia, 'por_volver_compras', v_por_volver, 'minimo_caja', v_minimo,$n$,
1);

-- ---------- 6. El Flujo real dice cuánto de su saldo final está por volver ----------
select pg_temp.reemplazar('retail.fn_flujo_caja_real(date,date)',
$v$    'saldo_inicial', v_inicial, 'saldo_final', v_final,$v$,
$n$    'saldo_inicial', v_inicial, 'saldo_final', v_final, 'por_volver_compras', retail.fn_flujo_por_volver(v_hasta),$n$,
1);

-- ---------- 7. «Mi fondo» del combo «Sale de» dice lo mismo que Cuentas y dinero ----------
-- Sin esto, la compradora veía «Mi fondo · tienes S/ X» con lo ya gastado adentro, y Cuentas y dinero, otra cifra.
select pg_temp.reemplazar('retail.fn_mi_fondo()',
$v$  select c.id, c.nombre, retail.fn_fondo_saldo(c.id)$v$,
$n$  select c.id, c.nombre, retail.fn_fondo_saldo(c.id)
         -- ADR-0621: lo que ya gastó y Compras todavía no completa no está en su mano.
         + coalesce((select sum(f.monto) from retail.fn_fondo_por_completar(retail.fn_hoy_lima()) f where f.cuenta_id = c.id), 0)$n$,
1);
