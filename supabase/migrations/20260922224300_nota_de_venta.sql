-- ============================================================================
-- 20260922224300_nota_de_venta.sql — CAYLA V2
--
-- QUÉ HACE. Agrega la «nota de venta» como tercera opción del comprobante en el Punto de venta
-- (Boleta | Factura | Nota de venta). Es un documento INTERNO: tiene su propia serie por tienda,
-- no desglosa IGV y NUNCA se envía a SUNAT (Lucode/Nubefact). ADR-0164.
--
-- DECISIONES DE FELIPE (2026-09-22): 1A la clienta paga el mismo precio de la etiqueta, el papel
-- solo no separa el IGV · 2A una serie por tienda (NV01 Trujillo, NV02 Arequipa, NV03 Lima) ·
-- 3A no se convierte en boleta (se anula y se vende de nuevo) · 4A la emite cualquier colaboradora.
--
-- POR QUÉ EN `comprobantes` Y NO EN UNA TABLA APARTE. Reutiliza la numeración con bloqueo
-- (`fn_reservar_numero_serie`), la reimpresión, «Ventas de hoy» y la anulación. El riesgo de
-- vivir junto a boletas y facturas es que hoy lo que decide si algo se transmite es el ESTADO
-- (`pendiente`/`rechazado`), no el tipo. Por eso la nota de venta nace en un estado propio,
-- `interna`, y un candado de la base hace imposible la combinación peligrosa:
--   · una `nota_venta` solo puede estar `interna` o `no_emitido` (anulada con su venta);
--   · ningún otro tipo puede estar `interna`.
-- Nunca puede quedar `pendiente`: ni la pantalla de Facturación la cuenta como «por enviar» ni la
-- ruta de transmisión la acepta (y esa ruta además la rechaza por tipo, `transmision-reglas.ts`).
--
-- QUÉ CAMBIA
--   1. CHECKs de `comprobantes.tipo`, `comprobantes.estado`, `comprobantes_transmitido_tiene_entorno`
--      y `series_comprobantes.tipo`; candado nuevo `comprobantes_nota_venta_es_interna`.
--   2. Series NV01/NV02/NV03 (solo si la tienda no tiene ya una de nota de venta).
--   3. `emitir_comprobante`: la nota de venta nace `interna` y con IGV 0.
--   4. `registrar_venta`: acepta `p_tipo_comprobante = 'nota_venta'` y la reserva con IGV 0.
--   5. `anular_venta`: al anular la venta, la nota `interna` pasa a `no_emitido` como una boleta pendiente.
-- 3-5 NO se copian enteras: se toma la definición VIVA (`pg_get_functiondef`) y se cambia solo el
-- fragmento exacto, abortando si no aparece exactamente las veces esperadas — mismo patrón que
-- 20260922200000_terminales_por_tienda.sql. Así no se pisa ningún ajuste que producción tenga y el
-- repo no vea. Misma firma: no hay sobrecarga nueva y los permisos no cambian.
--
-- SE ROMPE SI alguien vuelve a pegar una versión anterior de `registrar_venta`/`emitir_comprobante`
-- (la nota de venta nacería `pendiente` y el candado la rechazaría: la venta falla, no se transmite).
--
-- PRODUCCIÓN. Ya trae `set search_path`; se pega entera, en una transacción. Re-ejecutable: los
-- reemplazos detectan si ya se aplicaron.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. candados ----------
alter table retail.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table retail.comprobantes add constraint comprobantes_tipo_check
  check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito', 'nota_venta'));

alter table retail.comprobantes drop constraint if exists comprobantes_estado_check;
alter table retail.comprobantes add constraint comprobantes_estado_check
  check (estado in ('pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado', 'no_emitido', 'pendiente_reintento', 'interna'));

-- Igual que antes (y NOT VALID como antes), con `interna`: un documento interno no tiene entorno de envío.
alter table retail.comprobantes drop constraint if exists comprobantes_transmitido_tiene_entorno;
alter table retail.comprobantes add constraint comprobantes_transmitido_tiene_entorno
  check (estado in ('pendiente', 'no_emitido', 'pendiente_reintento', 'interna') or entorno_transmision is not null) not valid;

alter table retail.comprobantes drop constraint if exists comprobantes_nota_venta_es_interna;
alter table retail.comprobantes add constraint comprobantes_nota_venta_es_interna
  check ((tipo = 'nota_venta') = (estado = 'interna') or (tipo = 'nota_venta' and estado = 'no_emitido'));
comment on constraint comprobantes_nota_venta_es_interna on retail.comprobantes is
  'ADR-0164: una nota de venta solo está interna o no_emitido (anulada), y solo una nota de venta está interna. Hace imposible que una nota de venta quede pendiente de enviar a SUNAT.';

alter table retail.series_comprobantes drop constraint if exists series_comprobantes_tipo_check;
alter table retail.series_comprobantes add constraint series_comprobantes_tipo_check
  check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito', 'nota_venta'));

-- ---------- 2. series por tienda (2A) ----------
-- Por nombre, porque producción ('Tienda TRU') y local ('Tienda Trujillo') los escriben distinto.
-- Una tienda que ya tenga serie de nota de venta la conserva (unique (ubicacion_id, tipo)).
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
select u.id, 'nota_venta', s.serie
from retail.ubicaciones u
join (values ('NV01', array['tienda tru', 'tienda trujillo']),
             ('NV02', array['tienda aqp', 'tienda arequipa']),
             ('NV03', array['tienda lim', 'tienda lima'])) as s(serie, nombres)
  on lower(u.nombre) = any (s.nombres)
where u.tipo = 'tienda'
on conflict (ubicacion_id, tipo) do nothing;

-- ---------- 3-5. cambios quirúrgicos sobre la definición viva ----------
-- Reemplaza `p_viejo` por `p_nuevo` en la función. Si ya está aplicado (aparece `p_nuevo`), no hace
-- nada; si `p_viejo` no aparece exactamente `p_veces` veces, aborta todo.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'nota de venta: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 3. emitir_comprobante: la nota de venta nace `interna` (nunca `pendiente`) y sin IGV.
select pg_temp.reemplazar(
  'retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)',
  'cliente_nombre, subtotal, igv, total, usuario_id, items, token_cliente)',
  'cliente_nombre, subtotal, igv, total, usuario_id, items, token_cliente, estado)',
  1);
select pg_temp.reemplazar(
  'retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)',
  'p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona, v_items, p_token)',
  'p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona, v_items, p_token, case when p_tipo = ''nota_venta'' then ''interna'' else ''pendiente'' end)',
  1);
select pg_temp.reemplazar(
  'retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)',
  '  select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(p_ubicacion_id, p_tipo);',
  '  if p_tipo = ''nota_venta'' and p_igv <> 0 then
    raise exception ''Una nota de venta no desglosa IGV (se pidió S/%)'', p_igv;
  end if;
  select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(p_ubicacion_id, p_tipo);',
  1);

-- 4. registrar_venta: acepta la nota de venta y la reserva con IGV 0 (1A: el total no cambia).
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  'p_tipo_comprobante not in (''boleta'', ''factura'') then',
  'p_tipo_comprobante not in (''boleta'', ''factura'', ''nota_venta'') then',
  1);
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  'v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;',
  'v_igv := case when p_tipo_comprobante = ''nota_venta'' then 0 else round((v_total_items - v_total_items / 1.18) * 100) / 100 end;',
  1);

-- 5. anular_venta: la nota de venta de una venta anulada queda `no_emitido`, como una boleta pendiente.
select pg_temp.reemplazar(
  'retail.anular_venta(uuid, text, jsonb)',
  'where venta_id = p_venta_id and estado in (''pendiente'', ''pendiente_reintento'');',
  'where venta_id = p_venta_id and estado in (''pendiente'', ''pendiente_reintento'', ''interna'');',
  1);

-- ---------- validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'retail' and p.proname in ('registrar_venta', 'emitir_comprobante', 'anular_venta')) <> 3 then
    raise exception 'nota de venta: quedaron sobrecargas de registrar_venta/emitir_comprobante/anular_venta';
  end if;
  if pg_get_functiondef('retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)'::regprocedure) not like '%then ''interna'' else ''pendiente''%' then
    raise exception 'nota de venta: emitir_comprobante no quedó';
  end if;
end $v$;
