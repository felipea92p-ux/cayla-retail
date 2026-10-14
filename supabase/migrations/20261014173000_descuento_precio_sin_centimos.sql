-- ============================================================================
-- 20261014173000_descuento_precio_sin_centimos.sql — CAYLA V2 (Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Con un descuento en %, la prenda quedaba con un precio que obliga a pagar céntimos sueltos:
-- S/ 89.90 con 20 % se cobraba a S/ 71.92. Felipe: «que no se tenga que pagar céntimos; que sea más fácil de pagar y de
-- entender». El redondeo del efectivo (S/ 0.10, hacia abajo) ya existe, pero solo al cobrar y solo en efectivo: con tarjeta o
-- Yape el precio seguía con céntimos, y el precio del papel no coincidía con lo que se pagaba.
--
-- LA REGLA. Un % sobre un precio deja el precio final BAJADO AL MÚLTIPLO DE S/ 0.10 de abajo, y el descuento es lo que falta
-- para llegar ahí:  descuento = precio − floor(precio × (100 − %) / 100 × 10) / 10.  S/ 89.90 con 20 % → 71.92 exacto → 71.90,
-- descuenta 18.00. Siempre hacia abajo (nunca se cobra más que el % anunciado: Ley 29571 art. 44), de 0 a 0.09 de regalo por
-- unidad. 0 % o vacío no descuenta; 100 % regala la prenda. La caja hace la MISMA cuenta, en enteros, en
-- `descuentoUnitarioPorPorcentaje` (apps/web/lib/vender-reglas.ts). Reemplaza la regla de ADR-0302 (descuento exacto al céntimo).
--
-- QUÉ TOCA (cuatro cosas, todas funciones; ninguna tabla, política ni disparador):
--   1. `fn_descuento_campana(precio, %)` — el cuerpo, con la misma firma. La llaman `registrar_venta`, `separar_prendas` y
--      `editar_separacion` por su nombre: la campaña se cobra y se verifica con el precio sin céntimos. No la usa ningún índice,
--      vista ni check (se verificó en ADR-0302); es `immutable`.
--   2. `registrar_venta`, el tope del Líder (35 %) y el umbral del argumento (15 %): comparaban el descuento contra
--      `round(precio × T, 2) + 0.01`. Con el precio sin céntimos, «15 %» descuenta hasta 9 céntimos más que esa cuenta y la
--      base lo rechazaría («pasa el 15 %, escribe el argumento») aunque la colaboradora tocó el botón «15 %». Ahora comparan
--      contra `fn_descuento_campana(precio, T) + 0.01`: el descuento que da el T % con la misma regla. La holgura de 1 céntimo
--      queda igual que antes.
--   3. `crear_proforma`, el tope de 20 %: el mismo problema y la misma solución.
--
-- QUÉ NO CAMBIA. Un descuento en SOLES (el monto que se escribe) no se redondea: es lo que la colaboradora decidió. El redondeo del
-- efectivo al cobrar (S/ 0.10, ADR-0311) sigue igual y ahora casi nunca tiene nada que redondear. El comprobante sale por la suma
-- exacta de las líneas, como siempre. El descuento del club (cumpleaños, aniversario) y el código de descuento no se tocan.
--
-- CÓMO SE PEGA. Una sola parte (solo funciones: sin `alter` de tablas ni políticas, ADR-0195). Los tres reemplazos son
-- ANCLADOS sobre la definición VIVA (ADR-0288; `registrar_venta` se redefinió muchas veces y copiar un cuerpo viejo pisaría lo
-- que vino después): si un trozo no está exactamente una vez, la migración se detiene sin tocar nada. Es idempotente. Dentro de
-- los textos entre comillas no hay ningún `select … into` (ADR-0288: el SQL Editor lo confunde con un SELECT INTO).
--
-- PRODUCCIÓN: pegar SOLO con OK de Felipe (cambia lo que cobra la caja) y publicar la web en la MISMA ventana, fuera del horario de
-- tienda, y recargar Vender (F5) en cada caja antes de abrir. Con la base nueva y la caja vieja (o al revés) cada venta CON
-- CAMPAÑA se rechaza en el mostrador (`venta_campana_monto_no_coincide`); un descuento a mano en % sigue pasando en los dos
-- órdenes (la base solo mira topes). Primero la base: así la caja vieja solo falla en las campañas, no en el % manual.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. La regla
-- ----------------------------------------------------------------------------
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
    else round(p_precio - floor(p_precio * (100 - p_pct) / 10) / 10, 2)  -- el round solo ordena los ceros: la cuenta ya es exacta
  end
$$;

comment on function retail.fn_descuento_campana(numeric, numeric) is
  'Descuento por unidad de un %: el precio final baja al múltiplo de S/ 0.10 de abajo y el descuento es lo que falta (S/ 89.90 con 20 % → 71.92 exacto → 71.90, descuenta 18.00). 0 % o vacío no descuenta; 100 % regala. Misma cuenta que descuentoUnitarioPorPorcentaje en la caja; la usan la campaña y los topes del 15 y del 35 %.';

revoke all on function retail.fn_descuento_campana(numeric, numeric) from public, anon;
grant execute on function retail.fn_descuento_campana(numeric, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- El reemplazo anclado (el mismo de 20261012190000): si el texto nuevo ya está, no hace nada; si el ancla no aparece exactamente
-- `p_veces` veces, se detiene sin tocar nada.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. La venta: el tope del Líder y el umbral del argumento
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$if fn_es_lider() and v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then$v$,
  $v$if fn_es_lider() and v_descuento > fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, 35) + 0.01 then$v$,
  1);

select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.15, 2) + 0.01 and v_argumento = '' then$v$,
  $v$if v_descuento > fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, 15) + 0.01 and v_argumento = '' then$v$,
  1);

-- ----------------------------------------------------------------------------
-- 3. La proforma: el tope de 20 %
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.crear_proforma(uuid, jsonb, text, text, timestamp with time zone, text)',
  $v$if v_descuento < 0 or v_descuento > round(v_precio * 0.20, 2) + 0.01 then$v$,
  $v$if v_descuento < 0 or v_descuento > fn_descuento_campana(v_precio, 20) + 0.01 then$v$,
  1);

-- ---------- Validación final: si algo no quedó como se espera, se aborta TODO ----------
do $$
declare
  v_f text;
begin
  -- Las que cobran o guardan con campaña la siguen llamando por su nombre (si una la hubiera copiado adentro, seguiría con la
  -- regla vieja y la caja chocaría con ella). `registrar_venta` ahora la llama también para los topes.
  foreach v_f in array array['registrar_venta', 'separar_prendas', 'editar_separacion', 'crear_proforma'] loop
    if not exists (
      select 1 from pg_proc p
       where p.pronamespace = 'retail'::regnamespace and p.proname = v_f
         and p.prosrc like '%fn_descuento_campana(%'
    ) then
      raise exception 'descuento sin céntimos: retail.% no llama a fn_descuento_campana', v_f;
    end if;
  end loop;

  -- Los ejemplos de `vender-reglas.test.ts`: la caja y la base tienen que dar lo mismo.
  if retail.fn_descuento_campana(39.00, 20) <> 7.80          -- 31.20 ya es múltiplo de 0.10
     or retail.fn_descuento_campana(89.90, 20) <> 18.00      -- 71.92 → 71.90
     or retail.fn_descuento_campana(79.90, 30) <> 24.00      -- 55.93 → 55.90
     or retail.fn_descuento_campana(95.80, 25) <> 24.00      -- 71.85 → 71.80
     or retail.fn_descuento_campana(100.00, 20) <> 20.00
     or retail.fn_descuento_campana(22.00, 10) <> 2.20
     or retail.fn_descuento_campana(89.90, 12.5) <> 11.30    -- 78.66125 → 78.60
     or retail.fn_descuento_campana(89.90, 33.33) <> 30.00   -- 59.93633 → 59.90
     or retail.fn_descuento_campana(69.90, 15) <> 10.50      -- 59.415 → 59.40: el medio céntimo baja
     or retail.fn_descuento_campana(19.90, 25) <> 5.00       -- 14.925 → 14.90
     or retail.fn_descuento_campana(1.50, 50) <> 0.80        -- 0.75 → 0.70
     or retail.fn_descuento_campana(89.90, 100) <> 89.90
     or retail.fn_descuento_campana(89.90, 0) <> 0
     or retail.fn_descuento_campana(89.90, null) <> 0 then
    raise exception 'descuento sin céntimos: fn_descuento_campana no cumple los ejemplos';
  end if;

  -- Un % menor nunca descuenta más que uno mayor (si no, «15 %» podría pasar el umbral de «15,01 %» al revés), el descuento
  -- nunca pasa del precio y lo que paga la clienta es siempre un múltiplo de S/ 0.10. En miles de precios, con la propia función.
  if exists (
    select 1 from generate_series(1, 60000, 7) c
     where retail.fn_descuento_campana(c / 100.0, 14.99) > retail.fn_descuento_campana(c / 100.0, 15)
        or retail.fn_descuento_campana(c / 100.0, 35) > c / 100.0
        or (c / 100.0 - retail.fn_descuento_campana(c / 100.0, 20)) * 10 <> trunc((c / 100.0 - retail.fn_descuento_campana(c / 100.0, 20)) * 10)
  ) then
    raise exception 'descuento sin céntimos: la función no es monótona, pasa del precio o no deja un múltiplo de 0.10';
  end if;
end $$;
