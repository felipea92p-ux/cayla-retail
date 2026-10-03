-- ============================================================================
-- 20261003100000_redondeo_efectivo_regla.sql — CAYLA V2 (ADR-0311, actividad 1)
--
-- EL CAMBIO. Una función, y nada más: la regla del redondeo del efectivo. Todavía NO la usa ninguna otra función, ninguna
-- tabla ni ninguna pantalla: las actividades siguientes (lectores, diario, papel, Vender) la irán llamando. Sola, no cambia
-- ni un centavo de lo que hoy cobra la caja.
--
-- LA REGLA. La moneda más chica que circula en Perú es S/ 0.10 (el BCRP retiró la de 0.05 el 1-ene-2019, Circular
-- 0033-2018). Lo que se cobra EN EFECTIVO se redondea al múltiplo de S/ 0.10, SIEMPRE hacia abajo: la Ley 29571 art. 44
-- prohíbe redondear en perjuicio del consumidor (INDECOPI: 5.99 → 5.90, 2.69 → 2.60). `fn_redondeo_efectivo(deuda)` es lo que
-- se cobra de MENOS: de 0.00 a 0.09. El efectivo a cobrar es la deuda menos ese redondeo.
--
--     100.02 → redondeo 0.02 (cobra 100.00) · 100.12 → 0.02 (100.10) · 100.19 → 0.09 (100.10) · 100.10 → 0.00 (100.10)
--
-- Se aplica UNA vez, a la parte de la cuenta que se paga en efectivo; nunca a un precio, a un descuento ni al IGV, y nunca
-- a la tarjeta, Yape/Plin o transferencia. La caja tendrá su gemela en TypeScript, en céntimos enteros, cuando Vender la use
-- (ADR-0311, actividad 5: el repo no admite una regla sin pantalla que la use); entonces
-- `scripts/pruebas/redondeo_efectivo.mjs` también las compara en los 99 999 montos de S/ 0.01 a S/ 999.99. Mientras tanto
-- esa prueba verifica la regla en la base en los mismos 99 999 montos.
--
-- UNICIDAD. Para cada monto hay UN SOLO redondeo entre 0.00 y 0.09 que deja el efectivo en múltiplo de 0.10. Por eso
-- `registrar_venta` (actividad 5) podrá exigir «el redondeo exacto de la ley» sin dejar margen a que un cliente manipulado
-- mande otro.
--
-- PRODUCCIÓN. Es una sola parte, no toca tablas ni políticas ni funciones vivas: se pega tal cual, sin ventana ni orden
-- respecto de la web. Es idempotente (create or replace) y no pisa nada: la función no existía.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_redondeo_efectivo(p_monto numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = retail, public
as $$
  -- numeric es exacto: mod(100.19, 0.10) = 0.09 sin los residuos de la coma flotante.
  select case
    when p_monto is null or p_monto <= 0 then 0
    else mod(round(p_monto, 2), 0.10)
  end
$$;

comment on function retail.fn_redondeo_efectivo(numeric) is
  'Redondeo del efectivo (ADR-0311): lo que se cobra de MENOS al pagar en efectivo, de 0.00 a 0.09. S/ 0.10 es la moneda más chica que circula y la ley (Ley 29571 art. 44) solo permite redondear hacia abajo: 100.19 → 0.09 (se cobra 100.10). La caja tendrá la misma cuenta en TypeScript (actividad 5).';

revoke all on function retail.fn_redondeo_efectivo(numeric) from public, anon;
grant execute on function retail.fn_redondeo_efectivo(numeric) to authenticated;

-- ---------- Validación final: si algo no quedó como se espera, se aborta TODO ----------
do $$
begin
  -- Los ejemplos de la ley (INDECOPI) y de Felipe, los bordes y los montos sin nada que redondear (los mismos que
  -- `scripts/pruebas/redondeo_efectivo.mjs`, y más adelante los de la caja).
  if retail.fn_redondeo_efectivo(2.69) <> 0.09        -- INDECOPI: 2.69 → 2.60
     or retail.fn_redondeo_efectivo(5.99) <> 0.09     -- 5.99 → 5.90
     or retail.fn_redondeo_efectivo(8.97) <> 0.07     -- 8.97 → 8.90
     or retail.fn_redondeo_efectivo(100.02) <> 0.02   -- 100.00
     or retail.fn_redondeo_efectivo(100.12) <> 0.02   -- 100.10 (no existe la moneda de 2 céntimos)
     or retail.fn_redondeo_efectivo(100.19) <> 0.09   -- 100.10, NO 100.20: subir es en perjuicio del consumidor
     or retail.fn_redondeo_efectivo(100.10) <> 0
     or retail.fn_redondeo_efectivo(100.00) <> 0
     or retail.fn_redondeo_efectivo(0.09) <> 0.09     -- no llega a una moneda: no se cobra
     or retail.fn_redondeo_efectivo(0.10) <> 0
     or retail.fn_redondeo_efectivo(309.59) <> 0.09
     or retail.fn_redondeo_efectivo(484.54) <> 0.04
     or retail.fn_redondeo_efectivo(0) <> 0
     or retail.fn_redondeo_efectivo(-5) <> 0
     or retail.fn_redondeo_efectivo(null) <> 0 then
    raise exception 'redondeo del efectivo: fn_redondeo_efectivo no cumple los ejemplos';
  end if;

  -- En todos los montos de 0.01 a 999.99 el redondeo es de 0.00 a 0.09 y deja el efectivo en múltiplo de 0.10.
  if exists (
    select 1 from generate_series(1, 99999) g
     where retail.fn_redondeo_efectivo(g / 100.0) not between 0 and 0.09
        or mod(g / 100.0 - retail.fn_redondeo_efectivo(g / 100.0), 0.10) <> 0
  ) then
    raise exception 'redondeo del efectivo: hay montos que no quedan en múltiplo de 0.10';
  end if;
end $$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si al terminar no ves una fila con esta parte y «QUEDÓ BIEN», el texto se
-- pegó cortado (el editor de Supabase no avisa si el corte cae entre dos instrucciones: «Success» no quiere decir que se aplicó todo).
-- Copia el archivo COMPLETO (en la terminal: `pbcopy < supabase/migrations/<archivo>`) y vuelve a pegarlo: es seguro repetirlo.
select '20261003100000 · la regla del redondeo' as parte,
       case when retail.fn_redondeo_efectivo(100.19) = 0.09 and retail.fn_redondeo_efectivo(100.12) = 0.02
            then 'QUEDÓ BIEN' else 'REVISAR: falta alguna parte anterior o el texto se pegó cortado' end as resultado;
