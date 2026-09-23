-- ============================================================================
-- 20260923174100_campana_redondea_a_90.sql — CAYLA V2 (ADR-0182, Felipe 2026-09-23)
--
-- EL CAMBIO. El precio de una prenda en campaña se redondea HACIA ABAJO a .90: S/ 89.90 con 20 % da S/ 71.92 y se
-- cobra S/ 71.90. Lo decidió Felipe al diseñar la etiqueta de precio con descuento (ADR-0180): el papel dice un precio
-- «de tienda», y la caja tiene que cobrar exactamente ese. Siempre el .90 más cercano POR DEBAJO: si la cuenta da
-- 71.85, se cobra 70.90.
--
-- LA REGLA, EN UN SOLO LUGAR. `fn_descuento_campana(precio, pct)` devuelve el descuento por unidad:
--   precio − (el X.90 más alto que no pasa de precio × (100 − pct) / 100).
-- Un rebajado menor que S/ 0.90 no se redondea (no hay un .90 por debajo); 100 % regala la prenda. El % se toma con 2
-- decimales, igual que en la caja. La caja hace la misma cuenta al céntimo (`descuentoDeCampana`,
-- apps/web/lib/vender-reglas.ts) y la base la VERIFICA (ADR-0108: la caja calcula, la base verifica, no reescribe).
--
-- QUÉ TOCA. Las dos únicas funciones vivas que calculan un descuento de campaña (verificado en producción, solo
-- lectura, 2026-09-23): `registrar_venta` (2 fórmulas: que la caja no omita la campaña, y el monto de una línea
-- «campaña») y `separar_prendas` (las mismas 2, para una separación). Nada más usa el % de una campaña.
--
-- POR QUÉ SE PARCHAN Y NO SE REESCRIBEN. Igual que 20260922224300 y 20260923161700: su versión viva no es la de ningún
-- archivo. Se reemplaza SOLO la fórmula con `pg_temp.reemplazar`: cada ancla tiene que aparecer exactamente las veces
-- esperadas o se aborta todo. Re-ejecutable: lo ya aplicado no se vuelve a tocar. Compone con los parches de «prendas
-- sin registrar» (ADR-0179), que tocan otras líneas.
--
-- PRODUCCIÓN: pegar SOLO con OK de Felipe (cambia lo que cobra la caja). Ya lleva `retail.` en todo. Va de la mano de
-- la web: con la base nueva y la caja vieja (o al revés) cada venta CON CAMPAÑA se rechaza en el mostrador. El
-- 2026-09-23 no había ninguna campaña vigente, así que el cambio no afecta a nadie; si al pegar hay una, pegar y
-- publicar la web fuera del horario de tienda.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. La regla ----------
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
    when p_precio * (100 - round(p_pct, 2)) / 100 >= 0.90
      then p_precio - (floor(p_precio * (100 - round(p_pct, 2)) / 100 + 0.10) - 0.10)
    else p_precio - round(p_precio * (100 - round(p_pct, 2)) / 100, 2)
  end
$$;

comment on function retail.fn_descuento_campana(numeric, numeric) is
  'Descuento por unidad de una campaña: el precio rebajado se redondea HACIA ABAJO a .90 (S/ 89.90 con 20 % → se cobra S/ 71.90, descuento 18.00). Menos de S/ 0.90 no se redondea; 100 % regala. Misma regla que descuentoDeCampana en la caja (ADR-0182).';

revoke all on function retail.fn_descuento_campana(numeric, numeric) from public, anon;
grant execute on function retail.fn_descuento_campana(numeric, numeric) to authenticated;

-- ---------- 2. Parches sobre la definición viva ----------
-- Reemplaza `p_viejo` por `p_nuevo` en la función. Si ya está aplicado (aparece `p_nuevo`), no hace nada; si `p_viejo`
-- no aparece exactamente `p_veces` veces, aborta todo. (El mismo de 20260922224300.)
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'campaña a .90: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 2a. registrar_venta: el descuento que la campaña da hoy (la caja no puede omitirlo, y un manual tiene que superarlo).
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  $v$round((v_item ->> 'precio_unitario')::numeric * v_c_pct / 100, 2)$v$,
  $n$retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_c_pct)$n$,
  1);

-- 2b. registrar_venta: el monto de una línea que la caja manda como «campaña».
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  $v$round((v_item ->> 'precio_unitario')::numeric * v_etq_pct / 100, 2)$v$,
  $n$retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_etq_pct)$n$,
  1);

-- 2c. separar_prendas: las mismas dos cuentas para una separación (las dos con el mismo texto).
select pg_temp.reemplazar(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  'round(v_precio * v_c_pct / 100, 2)',
  'retail.fn_descuento_campana(v_precio, v_c_pct)',
  2);

-- ---------- 3. Validación final: si algo no quedó como se espera, se aborta TODO ----------
do $$
declare
  v_rv text := pg_get_functiondef('retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)'::regprocedure);
  v_sp text := pg_get_functiondef('retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)'::regprocedure);
  c_usa constant text := 'retail.fn_descuento_campana(';
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('registrar_venta', 'separar_prendas')) <> 2 then
    raise exception 'campaña a .90: quedaron sobrecargas de registrar_venta/separar_prendas';
  end if;
  if (length(v_rv) - length(replace(v_rv, c_usa, ''))) / length(c_usa) <> 2
     or (length(v_sp) - length(replace(v_sp, c_usa, ''))) / length(c_usa) <> 2 then
    raise exception 'campaña a .90: registrar_venta y separar_prendas deben usar la regla 2 veces cada una';
  end if;
  if v_rv ~ 'v_c_pct / 100|v_etq_pct / 100' or v_sp ~ 'v_c_pct / 100' then
    raise exception 'campaña a .90: quedó una fórmula vieja sin redondear';
  end if;
  -- Los ejemplos que se le mostraron a Felipe, y los bordes.
  if retail.fn_descuento_campana(89.90, 20) <> 18.00      -- 71.92 → 71.90
     or retail.fn_descuento_campana(95.80, 25) <> 24.90   -- 71.85 → 70.90 (siempre hacia abajo)
     or retail.fn_descuento_campana(159.80, 50) <> 79.90  -- 79.90 exacto no baja
     or retail.fn_descuento_campana(100.00, 20) <> 20.10  -- 80.00 → 79.90
     or retail.fn_descuento_campana(89.90, 33.33) <> 30.00
     or retail.fn_descuento_campana(89.90, 100) <> 89.90
     or retail.fn_descuento_campana(1.00, 50) <> 0.50     -- menos de S/ 0.90: sin redondeo
     or retail.fn_descuento_campana(89.90, 0) <> 0
     or retail.fn_descuento_campana(89.90, null) <> 0 then
    raise exception 'campaña a .90: fn_descuento_campana no cumple los ejemplos';
  end if;
end $$;
