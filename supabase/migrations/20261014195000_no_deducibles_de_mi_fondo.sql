-- ============================================================================
-- 20261014195000_no_deducibles_de_mi_fondo.sql — ADR-0362 fase 6 (Felipe 2026-10-14)
--
-- QUÉ CAMBIA. `fn_no_deducibles` responde, por cada fila que se le pregunta (`gasto:<id>`, `pago:<id>`, …), si es «no deducible» y
-- por cuánto. Quien tiene un módulo de Compras o de Finanzas pregunta por cualquier fila, como hasta hoy. Quien no tiene ninguno y
-- entra solo porque tiene un fondo (la compradora en «Mi fondo» y en «Rendir») pregunta por lo de SU fondo: los gastos y los pagos
-- que salieron de él. Lo demás se responde como si no fuera no deducible (sin fila), igual que una clave que no existe.
--
-- CONTRATO (Liskov)
--   PROMETE: con un módulo de Compras o de Finanzas, la misma respuesta que antes. Con solo un fondo, la respuesta de antes recortada
--            a las filas de su fondo. Sin módulo ni fondo, el mismo 42501.
--   ASUME:   `fn_no_deducibles_de` y `fn_mi_fondo_cuenta` (fase 6).
--   NO HACE: no cambia la regla de qué es no deducible (`fn_no_deducibles_de`), ni tablas, ni políticas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: reescribe la función entera (es corta; su huella era la misma en el
-- banco y en producción el 2026-10-14). Idempotente.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_no_deducibles(p_claves text[])
returns table (clave text, motivo text, monto numeric, total numeric, tope numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_con_modulo boolean;
  v_fondo uuid := retail.fn_mi_fondo_cuenta();
  v_claves text[] := coalesce(p_claves, '{}'::text[]);
begin
  -- Producción no está: ninguna pantalla del Taller muestra todavía la marca, y pedir aquí su módulo lo haría pasar por protegido
  -- en `pruebas:roles-cobertura` sin que lo estén sus funciones de abrir y cerrar producción.
  v_con_modulo := retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('fondos') or retail.fn_ve_modulo('facturas_compra')
                  or retail.fn_ve_modulo('por_pagar') or retail.fn_ve_modulo('gastos') or retail.fn_ve_modulo('cuentas_dinero')
                  or retail.fn_ve_modulo('impuestos');
  if not (v_con_modulo or v_fondo is not null) then
    raise exception 'Ver lo no deducible necesita un módulo de Compras o de Finanzas en tu rol, o tener un fondo.' using errcode = '42501';
  end if;
  if cardinality(v_claves) > 1000 then
    raise exception 'Se preguntan 1,000 filas como máximo.' using errcode = 'P0001';
  end if;
  -- Con solo su fondo, la persona pregunta por lo de su fondo: los gastos y los pagos que salieron de él.
  if not v_con_modulo then
    v_claves := array(
      select c from unnest(v_claves) c
       where (c like 'gasto:%' and exists (select 1 from retail.gastos g
                                           where g.id::text = split_part(c, ':', 2) and g.cuenta_dinero_id = v_fondo))
          or (c like 'pago:%' and exists (select 1 from retail.compra_pagos cp
                                          where cp.id::text = split_part(c, ':', 2) and cp.cuenta_dinero_id = v_fondo)));
  end if;
  return query select d.clave, d.motivo, d.monto, d.total, d.tope from retail.fn_no_deducibles_de(v_claves) d;
end $function$;

revoke all on function retail.fn_no_deducibles(text[]) from public, anon;
grant execute on function retail.fn_no_deducibles(text[]) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
