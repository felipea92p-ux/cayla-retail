-- ============================================================================
-- 20261014150000_apartados_entregar_boleta_por_el_total.sql — CAYLA V2 (Felipe, 2026-10-14; ADR-0399, parte 1 de 3)
--
-- EL PROBLEMA. Un apartado emitía una boleta o factura de ANTICIPO al recibir el adelanto y otra «por el saldo» al entregar. Si la
-- clienta se arrepentía, esa boleta ya había gastado un correlativo y había que anular con una nota de crédito (otro correlativo).
-- Felipe, 2026-10-14: el adelanto es un pacto interno, no una venta; la boleta o factura sale UNA vez, al entregar, por el TOTAL,
-- sin mencionar el adelanto. Mientras tanto la clienta se lleva una constancia (el código APT-…), sin número de comprobante.
--
-- QUÉ HACE ESTA PARTE. `entregar_separacion` emite la boleta o factura por el total de la venta cuando el apartado NO tiene
-- comprobante de anticipo (todo apartado nuevo). Los datos de la clienta salen de la propia separación (antes los heredaba del
-- comprobante de anticipo). El adelanto sigue siendo un pago `anticipo` de la venta (dato interno: la caja y los medios de pago
-- siguen cuadrando) y NO viaja al comprobante. Un apartado viejo que SÍ tiene su boleta de anticipo conserva el camino de antes
-- (ya tiene un correlativo gastado: se descuenta o se anula, no se reescribe).
--
-- ORDEN DE PEGADO EN PRODUCCIÓN (importa): ESTA parte va ANTES que 20261014151000 (la que deja de emitir el anticipo). Con esta
-- sola, nada cambia para los apartados que ya existen; con la otra sola, entregar fallaría contra su check de anticipo.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Reemplazo ANCLADO sobre la función viva
-- (`pg_get_functiondef`): conserva cualquier parche que producción tenga y el repo no (el 2026-10-14 producción ya traía
-- `fn_intento_con_huella`, de la rama chaos). Falla sin tocar nada si la función viva no es la revisada. Ningún texto de ancla
-- lleva la palabra con que se guarda una consulta en una variable (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
-- Pruebas: `pnpm pruebas:separaciones`, `pnpm pruebas:redondeo-efectivo`, `pnpm pruebas:purgar-producto`.
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

create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

-- ---------- 1. Entregar: la boleta o factura por el TOTAL, sin deducir ni nombrar el adelanto ----------

-- «if v_saldo > 0 then» aparece una sola vez (comprobado en el repo y en producción el 2026-10-14): es la puerta del comprobante
-- «por el saldo» de antes. Se le antepone el camino nuevo y esa puerta pasa a valer solo para un apartado que ya tiene su anticipo.
select pg_temp.reemplazar(pg_temp.firma('entregar_separacion'),
  $v$  if v_saldo > 0 then$v$,
  $v$  -- ADR-0399: sin boleta de anticipo, la boleta o factura sale AHORA y por el TOTAL. No dice nada del adelanto (es un pacto
  -- interno que ya quedó en `venta_pagos` como medio `anticipo`); la clienta y el tipo de documento salen de la propia separación.
  if s.comprobante_anticipo_id is null then
    v_igv := round((s.total - s.total / 1.18) * 100) / 100;
    v_subtotal := round((s.total - v_igv) * 100) / 100;
    v_items_comp := (
      select jsonb_agg(jsonb_build_object(
               'variante_id', si.variante_id, 'descripcion', p.referencia || ' ' || v.sku, 'cantidad', si.cantidad,
               'precio_unitario', si.precio_unitario - si.descuento_unitario) order by v.sku)
        from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
       where si.separacion_id = s.id);
    v_comp := emitir_comprobante(
      s.ubicacion_id, s.comprobante_tipo, v_subtotal, v_igv, s.total, v_venta,
      case when s.comprobante_tipo = 'factura' then 'ruc' when s.clienta_dni is not null then 'dni' else 'sin_documento' end,
      case when s.comprobante_tipo = 'factura' then s.cliente_ruc else s.clienta_dni end,
      case when s.comprobante_tipo = 'factura' then s.cliente_razon_social
           else btrim(s.clienta_nombres || ' ' || s.clienta_apellidos) end,
      v_items_comp
    );
    update comprobantes set separacion_id = s.id where id = v_comp;
  end if;

  -- Camino de antes, solo para un apartado que YA tiene su boleta de anticipo (su correlativo está gastado).
  if v_saldo > 0 and s.comprobante_anticipo_id is not null then$v$,
  1);
