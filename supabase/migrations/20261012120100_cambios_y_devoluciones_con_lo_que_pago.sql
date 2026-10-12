-- ============================================================================
-- 20261012120100_cambios_y_devoluciones_con_lo_que_pago.sql — CAYLA V2 (Felipe, 2026-10-12; ADR-0380, sigue a 20261011110000)
--
-- EL PROBLEMA. Una clienta compra una polera de S/ 100 con campaña del 20 % y paga S/ 80 (`venta_items`: precio_unitario 100,
-- descuento_unitario 20). Tres funciones seguían contando con el precio de LISTA, no con lo que pagó:
--   · `aprobar_devolucion`: el tope del reembolso ya usaba lo pagado (S/ 80), pero la NOTA DE CRÉDITO salía por S/ 100 — más que
--     la boleta —: un papel que SUNAT puede rechazar y una devolución que la contabilidad lee como S/ 20 de más.
--   · `registrar_cambio`: la diferencia era (precio nuevo − precio de lista de lo devuelto). Cambiarla por otra de S/ 100 daba
--     «diferencia 0» y la tienda regalaba S/ 20; cambiarla por una de S/ 40 devolvía S/ 60 en efectivo por una compra de S/ 80.
--   · `emitir_nota`: nada impedía que las notas de crédito de un comprobante sumaran más que el comprobante.
-- El arqueo cuadraba igual (el cajón recibe/entrega lo que la pantalla dijo), así que nadie lo veía.
--
-- LO QUE HACE (reemplazo ANCLADO por función: falla sin tocar nada si la función viva no es la revisada; re-ejecutable):
--   · `aprobar_devolucion`: `v_total_devuelto` suma (precio_unitario − descuento_unitario) × cantidad, igual que el tope de
--     reembolso de más arriba en la misma función. La nota (total, IGV y subtotal) sale por lo pagado.
--   · `registrar_cambio`: diferencia = (precio de la prenda nueva − lo que pagó por la devuelta) × cantidad. La prenda nueva se
--     compara a precio de LISTA (el que da `fn_precio_para_cambio`: el de la tienda donde se compró si es la misma prenda, el de
--     esta tienda si es otra) — decisión de Felipe, 2026-10-12: «cambiarla por una de S/ 100 debe mostrar S/ 20 a cobrar».
--   · `emitir_nota`: una nota de crédito no puede llevar a que lo acreditado de un comprobante supere lo cobrado con él. Cuenta las
--     notas de ese comprobante que siguen vivas (no `rechazado` ni `anulado`) y bloquea el comprobante original mientras cuenta,
--     para que dos devoluciones aprobadas a la vez no se pasen juntas. El techo es el total del comprobante MÁS el anticipo que
--     deduce (un apartado entregado documenta el adelanto en otra boleta: devolver toda la prenda acredita su precio completo).
--
-- LO QUE NO TOCA. Nada del pasado: las notas y los cambios ya emitidos no se reescriben (son comprobantes y movimientos de caja
-- reales; corregirlos es una nota nueva, decisión de Felipe). `fn_precio_para_cambio` y el precio por tienda siguen igual.
--
-- PRODUCCIÓN. **Se pega JUNTO con la web nueva** (la pantalla de Cambios calcula la misma diferencia: con la web vieja mostraría
-- S/ 0 y la base cobraría S/ 20, y el cajón y la pantalla dejarían de coincidir). Una sola parte, sin tablas ni políticas, solo
-- `create or replace` de funciones. Ningún texto de ancla lleva `select … into` en una misma línea (CLAUDE.md, «El SQL Editor
-- agrega líneas por su cuenta»). Pruebas: `pnpm pruebas:registrar-cambio`, `pnpm pruebas:aprobar-devolucion-caja`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- La firma completa de la única versión viva de cada función (si hubiera dos, la subconsulta falla: mejor que adivinar).
create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

-- ---------- 1. La nota de crédito de una devolución sale por lo que la clienta pagó ----------

-- El ancla lleva `into v_total_devuelto`: el texto nuevo ya existe más arriba en la función (el tope de reembolso), y sin ese
-- contexto el chequeo de «ya aplicado» lo daría por hecho y no cambiaría nada.
select pg_temp.reemplazar(pg_temp.firma('aprobar_devolucion'),
  $v$sum(vi.precio_unitario * di.cantidad), 0) into v_total_devuelto$v$,
  $v$sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad), 0) into v_total_devuelto$v$,
  1);

-- ---------- 2. La diferencia de un cambio se mide contra lo que pagó ----------

select pg_temp.reemplazar(pg_temp.firma('registrar_cambio'),
  $v$(v_precio_nuevo - v_item.precio_unitario) * p_cantidad$v$,
  $v$(v_precio_nuevo - (v_item.precio_unitario - v_item.descuento_unitario)) * p_cantidad$v$,
  1);

-- ---------- 3. Las notas de crédito de un comprobante no pasan de lo que cobró ----------

-- Bloquea el comprobante original antes de contar (dos notas a la vez se esperan) y rechaza la que lo pasaría.
select pg_temp.reemplazar(pg_temp.firma('emitir_nota'),
  $v$v_items := coalesce(p_items, v_original.items);$v$,
  $v$v_items := coalesce(p_items, v_original.items);
  if p_tipo = 'nota_credito' then
    perform 1 from comprobantes where id = p_comprobante_original_id for update;
    if round(p_total + (select coalesce(sum(n.total), 0) from comprobantes n
                         where n.comprobante_original_id = p_comprobante_original_id
                           and n.tipo = 'nota_credito' and n.estado not in ('rechazado', 'anulado')), 2)
       > round(v_original.total + v_original.anticipo_deducido, 2) then
      raise exception 'Las notas de crédito de este comprobante pasarían de lo que cobró (S/%): ya se acreditó lo que corresponde.',
        round(v_original.total + v_original.anticipo_deducido, 2);
    end if;
  end if;$v$,
  1);
