-- ============================================================================
-- 20261113220000 — Lo que se le paga a SUNAT va en soles enteros
--
-- EL PROBLEMA PRIMERO. El 13 de noviembre de 2026 se pagó el primer pago a cuenta de renta registrado en el ERP: octubre, 1 % de S/ 112,307.93 de venta sin IGV.
-- El sistema calculaba S/ 1,123.08; la constancia de SUNAT (NPS) y el banco dicen S/ 1,123, porque SUNAT declara y cobra en soles enteros. Con el pago
-- registrado, `fn_flujo_caja_proyeccion` restaba 1,123.00 de 1,123.08 y dejaba «Pago a cuenta de renta de octubre · S/ 0.08» en lo que viene: una línea que se
-- lee «S/ 0», que desde el día 23 sale ATRASADA, y que ven «¿Me alcanza?», Plata y el Resumen. Iba a pasar todos los meses, y con el IGV el día que se pague.
--
-- LA DECISIÓN. La regla vive en UN lugar de la base y la usan las dos funciones que dicen cuánto se le paga a SUNAT:
--   · `retail.fn_redondeo_sunat(monto)`: soles enteros; se mira el primer decimal y, desde 5, sube (R.S. 025-2000/SUNAT, art. 2).
--   · `retail.fn_renta_a_cuenta(base, tasa)`: el pago a cuenta como lo arma el formulario 621: la base en soles enteros por la tasa, y el resultado en soles
--     enteros. Con la tasa de 1 % da lo mismo redondear antes o después; con 1.5 % no siempre, y por eso se hace como el formulario.
--   · `fn_impuestos_panel` devuelve la renta del mes con esa función (antes, `round(base * tasa, 2)`), y `fn_flujo_caja_proyeccion` calcula con ella la renta
--     del mes anterior y pasa su IGV por el redondeo. Un pago en soles enteros deja la línea en cero y desaparece.
-- La web aplica la misma regla en `redondeoSunat` (`apps/web/lib/impuestos-reglas.ts`) a «Pagas a SUNAT», al estado de cada mes y a lo que falta pagar.
--
-- LO QUE NO CAMBIA. Los libros siguen al céntimo: la norma no aplica al registro contable (Disposición Final Única). El diario, la 4011, la 4017, el saldo a
-- favor y `fn_impuestos_igv_meses` quedan como están. Tampoco cambia el IGV ni la renta del mes EN CURSO de la proyección: son un estimado que nadie compara
-- con un pago; cuando el mes cierra pasa a ser «el anterior» y entra por esta regla.
--
-- SUPUESTOS PARA EL CONTADOR.
--   1. El IGV por pagar se redondea al final: débito − crédito − saldo anterior al céntimo, y recién ahí a soles. El formulario redondea casilla por casilla,
--      así que puede diferir en S/ 1 de lo que SUNAT cobre. Hoy no se paga IGV (hay saldo a favor); antes de que toque, decidir si se imita casilla por casilla.
--   2. Al pagar IGV en soles enteros quedarán céntimos en la 4011, que se cierran con el asiento de redondeo del contador. Este cambio no lo hace.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Crea dos funciones y reescribe `fn_flujo_caja_proyeccion` y `fn_impuestos_panel` desde su
-- definición viva cambiando tres anclas; si un ancla no aparece exactamente una vez, aborta entero y no cambia nada. Pegarla dos veces no hace nada.
-- Medido en producción el 2026-11-13, solo lectura: las dos funciones tienen la misma huella que en `main` (`2e70992d…` y `bd3ab41e…`) y cada ancla aparece
-- una vez. Verificado: `pnpm pruebas:flujo-caja` (caso 10g), `pruebas:impuestos` y `pruebas:pago-planilla-y-sunat`.
--
-- CAMINO DE VUELTA: volver a poner las tres líneas viejas con el mismo `pg_temp.reemplazar`, con «viejo» y «nuevo» cruzados. Las dos funciones nuevas pueden
-- quedarse: sin esas tres líneas nadie las llama.
--
-- SE ROMPE SI: una migración futura recrea `fn_flujo_caja_proyeccion` o `fn_impuestos_panel` copiando un texto viejo del repo y vuelve el `round(…, 2)`
-- (lo vigila el caso 10g de `flujo_caja.mjs`); o si el contador declara otra base que la del sistema: ahí la diferencia ya no es de redondeo y la pantalla
-- hace bien en decir «Te falta».
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

-- La regla, una sola vez. `round(numeric)` de Postgres hace exactamente lo que pide la norma: con el primer decimal desde 5 sube, con menos se queda.
create or replace function retail.fn_redondeo_sunat(p_monto numeric)
returns numeric
language sql immutable
as $$ select round(p_monto) $$;
comment on function retail.fn_redondeo_sunat(numeric) is
  'Lo que se le paga a SUNAT va en soles enteros: se mira el primer decimal y, desde 5, sube (R.S. 025-2000/SUNAT, art. 2). No es para los libros, que siguen al céntimo.';
revoke all on function retail.fn_redondeo_sunat(numeric) from public, anon, authenticated;

-- El pago a cuenta de renta de un mes, como lo arma el formulario 621: ingresos netos en soles enteros por la tasa, y el impuesto en soles enteros.
create or replace function retail.fn_renta_a_cuenta(p_base numeric, p_tasa numeric)
returns numeric
language sql immutable
as $$ select retail.fn_redondeo_sunat(retail.fn_redondeo_sunat(p_base) * p_tasa) $$;
comment on function retail.fn_renta_a_cuenta(numeric, numeric) is
  'El pago a cuenta de renta que cobra SUNAT por un mes: la venta sin IGV en soles enteros por la tasa, en soles enteros. 1 % de S/ 112,307.93 es S/ 1,123, no S/ 1,123.08.';
revoke all on function retail.fn_renta_a_cuenta(numeric, numeric) from public, anon, authenticated;

-- Impuestos: la renta del mes es lo que SUNAT cobra.
select pg_temp.reemplazar('retail.fn_impuestos_panel(date)',
$a$      'monto', case when v_renta.valor is null then null else round(coalesce((v_foco ->> 'base_ventas')::numeric, 0) * v_renta.valor, 2) end),$a$,
$n$      'monto', case when v_renta.valor is null then null else retail.fn_renta_a_cuenta(coalesce((v_foco ->> 'base_ventas')::numeric, 0), v_renta.valor) end),$n$, 1);

-- La proyección: lo del mes anterior, que vence este mes, en soles enteros. Lo pagado se le resta después, como antes.
select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$      v_igv_ant := v_fila.a_pagar;$a$,
$n$      v_igv_ant := retail.fn_redondeo_sunat(v_fila.a_pagar);$n$, 1);
select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$      v_renta_ant := round(v_fila.base * coalesce((select t.valor from retail.fn_parametro_tributario('renta_pago_cuenta', v_mes - 1) t), 0), 2);$a$,
$n$      v_renta_ant := retail.fn_renta_a_cuenta(v_fila.base, coalesce((select t.valor from retail.fn_parametro_tributario('renta_pago_cuenta', v_mes - 1) t), 0));$n$, 1);

reset lock_timeout;
