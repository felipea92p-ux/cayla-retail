-- ============================================================================
-- 20260924093700_cuarentena_no_se_vende.sql — CAYLA V2 (PL-78)
--
-- DECISIÓN (Felipe, plano maestro PL-78): la venta rechaza cualquier stock que salga de la
-- sububicación Cuarentena.
--
-- EL HUECO (verificado en producción, solo lectura, 2026-09-23). `registrar_venta`,
-- `regularizar_prenda` y `registrar_cambio` sacan del piso de venta
-- (`fn_sububicacion_por_defecto(sede, 'venta')`), así que por ahí nunca salió nada de
-- Cuarentena. Pero `apartar_stock` acepta CUALQUIER sububicación de la sede en
-- `p_sububicacion_id` (la pantalla solo ofrece piso y almacén, la función no lo exige) y
-- `entregar_separacion` vende después desde la sububicación del apartado: una prenda dañada,
-- apartada desde Cuarentena con una llamada directa, terminaba vendida.
--
-- CÓMO. Un disparador BEFORE INSERT en `movimientos` — el único punto por donde pasa TODA
-- salida de stock, hoy y en cualquier función futura — rechaza, si la sububicación es de tipo
-- `cuarentena`: la salida por `venta`, la salida por `cambio` (la prenda nueva que se lleva la
-- clienta) y el `apartado`. Sigue permitido lo que es propio de Cuarentena: entrar (`entrada/
-- cambio`, la prenda devuelta), liquidar (`cuarentena_liquidada`), resolver una prenda dañada
-- (`cuarentena_<destino>`) y moverla al piso o al almacén cuando ya está bien.
--
-- En producción no hay ninguna salida desde Cuarentena en todo el historial (solo 17
-- `entrada/cambio`): el disparador no cambia nada de lo que ya pasó. Se puede pegar dos veces.
-- Prueba: `pnpm pruebas:cuarentena-no-se-vende`.
--
-- CÓMO SE DESHACE: drop trigger movimientos_no_salen_de_cuarentena_a_la_clienta on retail.movimientos;
-- ============================================================================

create or replace function retail.fn_movimiento_no_sale_de_cuarentena_a_la_clienta()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  if ((new.tipo = 'salida' and new.motivo in ('venta', 'cambio')) or new.tipo = 'apartado')
     and exists (select 1 from retail.sububicaciones where id = new.sububicacion_id and tipo = 'cuarentena') then
    raise exception 'Esa prenda está en Cuarentena: no se vende, no se entrega en un cambio ni se aparta. Si ya está bien, muévela primero al piso o al almacén';
  end if;
  return new;
end;
$$;

-- Solo la usa el disparador (que no necesita EXECUTE para dispararse): nadie la llama por la API.
revoke all on function retail.fn_movimiento_no_sale_de_cuarentena_a_la_clienta() from public, anon, authenticated;

comment on function retail.fn_movimiento_no_sale_de_cuarentena_a_la_clienta() is
  'PL-78: ninguna prenda de una sububicación Cuarentena sale hacia una clienta (venta, cambio o apartado). Liquidar y resolver prendas dañadas siguen por sus propios motivos.';

create or replace trigger movimientos_no_salen_de_cuarentena_a_la_clienta
  before insert on retail.movimientos
  for each row execute function retail.fn_movimiento_no_sale_de_cuarentena_a_la_clienta();
