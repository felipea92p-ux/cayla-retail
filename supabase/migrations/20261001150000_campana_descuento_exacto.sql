-- ============================================================================
-- 20261001150000_campana_descuento_exacto.sql — CAYLA V2 (ADR-0300, Felipe 2026-10-01)
--
-- EL CAMBIO. El descuento de una campaña es EXACTO: el % de la campaña sobre el precio, al céntimo. S/ 39.00 con
-- 20 % descuenta S/ 7.80 y se cobra S/ 31.20. Reemplaza la regla de ADR-0182 (20260923174100), que bajaba el precio
-- rebajado al .90 de abajo: con S/ 39.00 se cobraba S/ 30.90, es decir 20.8 % aunque el papel dijera «−20 %». Hasta
-- casi un sol de más por prenda, que pagaba CAYLA, y una etiqueta que no decía la verdad (Felipe: «tiene que ser
-- exacto; si descuentas más me perjudica y la etiqueta miente»).
--
-- LA REGLA. `fn_descuento_campana(precio, pct)` = round(precio × pct / 100, 2): el céntimo más cercano a la cuenta
-- exacta; el empate de medio céntimo, hacia arriba (lo que hace `round` de Postgres con un numeric positivo). 0 % o
-- vacío no descuenta; 100 % regala la prenda. La caja hace la misma cuenta, en enteros, en `descuentoDeCampana`
-- (apps/web/lib/vender-reglas.ts), que es la misma del descuento manual en %.
--
-- QUÉ TOCA. Solo el cuerpo de esa función (misma firma, mismo resultado `numeric`). Las tres funciones vivas que la usan
-- —`registrar_venta`, `separar_prendas` y `editar_separacion` (verificado en producción, solo lectura, 2026-10-01)— la
-- llaman por su nombre: cambian solas, sin parchear sus cuerpos. Nada más la usa: ni un índice, ni una vista, ni un
-- check (un índice sobre una función `immutable` que cambia de resultado quedaría corrupto; por eso se verificó).
--
-- PRODUCCIÓN: pegar SOLO con OK de Felipe (cambia lo que cobra la caja). Va de la mano de la web: con la base nueva y
-- la caja vieja (o al revés) cada venta CON CAMPAÑA se rechaza en el mostrador (`venta_campana_monto_no_coincide` /
-- `venta_campana_omitida`). El 2026-10-01 rigen 2 campañas sobre 13 variantes y no hay ninguna venta ni separación con
-- campaña: pegar y publicar la web en la misma ventana, FUERA del horario de tienda, y recargar Vender (F5) en cada
-- caja antes de abrir. Es una sola parte (no toca tablas ni políticas): se pega tal cual.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_descuento_campana(p_precio numeric, p_pct numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = retail, public
as $$
  select case
    when p_precio is null or p_pct is null or p_pct <= 0 then 0
    when p_pct >= 100 then p_precio
    else round(p_precio * p_pct / 100, 2)
  end
$$;

comment on function retail.fn_descuento_campana(numeric, numeric) is
  'Descuento por unidad de una campaña: EXACTO, round(precio × % / 100, 2) (S/ 39.00 con 20 % → 7.80, se cobra 31.20). 0 % o vacío no descuenta; 100 % regala. Misma cuenta que descuentoDeCampana en la caja (ADR-0300; reemplaza el .90 de ADR-0182).';

revoke all on function retail.fn_descuento_campana(numeric, numeric) from public, anon;
grant execute on function retail.fn_descuento_campana(numeric, numeric) to authenticated;

-- ---------- Validación final: si algo no quedó como se espera, se aborta TODO ----------
do $$
declare
  v_f text;
begin
  -- Las tres que cobran o guardan con campaña la siguen llamando por su nombre (si una la hubiera copiado adentro,
  -- seguiría con la regla vieja y la caja chocaría con ella).
  foreach v_f in array array['registrar_venta', 'separar_prendas', 'editar_separacion'] loop
    if not exists (
      select 1 from pg_proc p
       where p.pronamespace = 'retail'::regnamespace and p.proname = v_f
         and p.prosrc like '%fn_descuento_campana(%'
    ) then
      raise exception 'descuento exacto: retail.% ya no llama a fn_descuento_campana', v_f;
    end if;
  end loop;

  -- Los ejemplos que se le mostraron a Felipe, los empates de medio céntimo y los bordes. Los mismos que
  -- `vender-reglas.test.ts`: la caja y la base tienen que dar lo mismo.
  if retail.fn_descuento_campana(39.00, 20) <> 7.80        -- la etiqueta de Luna: se cobra 31.20, no 30.90
     or retail.fn_descuento_campana(89.90, 20) <> 17.98    -- 71.92 (antes 71.90)
     or retail.fn_descuento_campana(95.80, 25) <> 23.95    -- 71.85 (antes 70.90)
     or retail.fn_descuento_campana(100.00, 20) <> 20.00   -- 80.00 (antes 79.90)
     or retail.fn_descuento_campana(22.00, 10) <> 2.20
     or retail.fn_descuento_campana(89.90, 12.5) <> 11.24  -- 11.2375
     or retail.fn_descuento_campana(89.90, 33.33) <> 29.96 -- 29.96367
     or retail.fn_descuento_campana(69.90, 15) <> 10.49    -- 10.485: medio céntimo, hacia arriba
     or retail.fn_descuento_campana(19.90, 25) <> 4.98     -- 4.975: medio céntimo, hacia arriba
     or retail.fn_descuento_campana(89.90, 100) <> 89.90
     or retail.fn_descuento_campana(1.00, 50) <> 0.50
     or retail.fn_descuento_campana(89.90, 0) <> 0
     or retail.fn_descuento_campana(89.90, null) <> 0 then
    raise exception 'descuento exacto: fn_descuento_campana no cumple los ejemplos';
  end if;
end $$;
