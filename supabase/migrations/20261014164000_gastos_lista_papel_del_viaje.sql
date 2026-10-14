-- Finanzas ▸ Gastos dice el papel real de un gasto del viaje (ADR-0362, fase 6; lo que la actividad 8 dejó como tarea aparte).
--
-- EL PROBLEMA PRIMERO. Un gasto del viaje guarda su papel (factura, boleta, ticket o planilla de movilidad), su serie y el RUC de quien
-- lo dio en su ficha (`gastos_viaje`, actividad 3), no en un comprobante de compra (`compras`): así se decidió para no pedirle a quien
-- compra en Gamarra que dé de alta al proveedor. Pero Finanzas ▸ Gastos solo mira `compras`. El hotel de S/ 2 360 con factura F001-4321
-- salía «Sin comprobante · Sin proveedor · IGV S/ 360.00», y la fila se contradecía: desde la actividad 8 una factura con RUC sí separa su
-- IGV. Se vio en el banco de pruebas el 2026-10-14.
--
-- QUÉ CAMBIA. Son reemplazos anclados que solo suman la ficha del viaje; abortan sin cambiar nada si la función viva cambió.
--   1. `fn_gastos_lista`: con `left join retail.gastos_viaje gv`, el tipo es `coalesce(c.tipo, gv.papel)`, sin traducir (la base manda el
--      hecho; la pantalla lo dice con las palabras de la hoja del viaje), el número es `coalesce(c.documento, gv.serie_numero)` y quien lo
--      dio es el proveedor con ese RUC (el mismo cruce que el registro de compras de la actividad 8). Si ningún proveedor tiene ese RUC,
--      sale «RUC 20…»: se sabe quién lo dio aunque no su razón social. Las columnas de la función no cambian.
--   2. `fn_gastos_panel`: la misma ficha. Así «N boletas sin IGV descontable» cuenta también la boleta de un gasto del viaje, y
--      `sin_comprobante` (la web lo lee, todavía no lo muestra) cuenta solo lo que no trae papel: ni comprobante de compra ni papel del
--      viaje, o la planilla de movilidad, que es el «sin comprobante» de la hoja (decisión 55).
--
-- DESCARTÉ
--   · Traducir el papel en la base (planilla → 'sin_comprobante'): la lista perdería que la planilla sí sustenta el taxi y el cargador
--     (actividad 6: deducible hasta el tope). La pantalla dice «Sin comprobante» y, debajo, «Planilla de movilidad».
--   · Una columna nueva con el RUC: volver a pegar la migración que creó la función fallaría (las columnas de una función ya pegada no
--     se cambian). El RUC va en el nombre de quien lo dio, solo cuando no hay otro.
--   · Crear un comprobante de compra para el papel del viaje: ya lo descartó la actividad 3.
--
-- SE ROMPE SI
--   · Otra lectura de gastos decide «con o sin comprobante» mirando solo `compras`: un gasto del viaje con factura volvería a decir «Sin
--     comprobante». Su papel está en `gastos_viaje`.
--   · `compras.tipo` o `gastos_viaje.papel` aceptan un valor nuevo: la pantalla no sabría decirlo. `pruebas:gastos-lista-viaje` falla y
--     dice cuál falta en `TEXTO_PAPEL_DE_GASTO` (apps/web/lib/gastos-reglas.ts).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; al escribirla NO está pegada). Una sola parte, después de 20261013221000 (crea
-- `gastos_viaje`). Solo reemplaza dos funciones: sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin `select … into` dentro de
-- textos entre comillas (ADR-0288). Las cuatro anclas se comprobaron contra producción en solo lectura el 2026-10-14: una aparición cada
-- una (huellas `fn_gastos_lista` 9014c681…, `fn_gastos_panel` 76397f49…). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. La lista de gastos ----------
-- Primero la ficha (el `join`) y después las columnas que la leen.
select pg_temp.reemplazar('retail.fn_gastos_lista(date, date, uuid, boolean, integer)',
$v$    left join retail.proveedores p on p.id = c.proveedor_id$v$,
$n$    left join retail.proveedores p on p.id = c.proveedor_id
    -- ADR-0362 fase 6: la ficha de un gasto del viaje, donde vive su papel (no tiene comprobante de compra).
    left join retail.gastos_viaje gv on gv.gasto_id = g.id$n$,
1);

select pg_temp.reemplazar('retail.fn_gastos_lista(date, date, uuid, boolean, integer)',
$v$g.caja_movimiento_id, g.compra_id, c.tipo, c.documento, p.nombre, c.condicion,$v$,
$n$g.caja_movimiento_id, g.compra_id,
         -- ADR-0362 fase 6: en un gasto del viaje, su papel (sin traducir), su serie y número, y quien lo dio: el proveedor con ese
         -- RUC o, si ninguno lo tiene, el RUC.
         coalesce(c.tipo, gv.papel), coalesce(c.documento, gv.serie_numero),
         coalesce(p.nombre,
                  (select pr.nombre from retail.proveedores pr where pr.ruc = gv.ruc_emisor order by pr.created_at limit 1),
                  'RUC ' || gv.ruc_emisor),
         c.condicion,$n$,
1);

-- ---------- 2. Las cifras de la pantalla ----------
select pg_temp.reemplazar('retail.fn_gastos_panel(date, date, uuid, boolean)',
$v$select v.*, c.tipo as comprobante_tipo from vis v left join retail.compras c on c.id = v.compra_id$v$,
$n$select v.*, coalesce(c.tipo, gv.papel) as comprobante_tipo from vis v left join retail.compras c on c.id = v.compra_id
        -- ADR-0362 fase 6: el papel de un gasto del viaje vive en su ficha; su boleta cuenta como boleta.
        left join retail.gastos_viaje gv on gv.gasto_id = v.id$n$,
1);

select pg_temp.reemplazar('retail.fn_gastos_panel(date, date, uuid, boolean)',
$v$'sin_comprobante', (select count(*) from comp where compra_id is null),$v$,
$n$-- ADR-0362 fase 6: sin papel, o con la planilla de movilidad (el «sin comprobante» de la hoja del viaje, decisión 55).
      'sin_comprobante', (select count(*) from comp
                           where compra_id is null and coalesce(comprobante_tipo, 'planilla_movilidad') = 'planilla_movilidad'),$n$,
1);

reset lock_timeout;
notify pgrst, 'reload schema';
