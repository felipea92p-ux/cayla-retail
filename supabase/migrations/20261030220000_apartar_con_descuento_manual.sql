-- ============================================================================
-- 20261030220000_apartar_con_descuento_manual.sql — CAYLA V2 (ADR-0584, Felipe 2026-10-30)
--
-- EL PROBLEMA. Al apartar, la base solo aceptaba el descuento de la campaña: «el único descuento permitido es la campaña vigente…
-- sin descuentos manuales» (20260923090000). En la venta, la colaboradora puede dar un 10 % para cerrar la venta, con su motivo;
-- al apartar la MISMA prenda, a la MISMA clienta, no podía. Felipe (2026-10-30): «al momento de separar una prenda, que permita
-- aplicar descuentos también como en la venta». Eligió las mismas reglas de la venta.
--
-- ANALOGÍA CAYLA. La bolsa con el nombre de la clienta detrás del mostrador lleva escrito su precio. Hasta hoy ese precio solo
-- podía ser el de la etiqueta (o el de la campaña); ahora puede ser el que se acordó con ella, con el motivo anotado en la bolsa,
-- como en la boleta de una venta. Al recoger, la boleta sale por ese precio y con ese motivo.
--
-- LAS REGLAS (las de `registrar_venta`, copiadas en UNA función: `fn_exigir_descuento_manual`):
--   · solo si supera a la campaña (un solo descuento por prenda, el mayor) — `venta_descuento_no_supera_campana`;
--   · motivo de la lista (la misma de `venta_items`), y su detalle si es «Otro» — `venta_descuento_requiere_motivo`, `…_otro_sin_detalle`;
--   · nunca bajo el costo — `venta_descuento_bajo_costo` (y nunca la prenda gratis: `separacion_items` exige descuento < precio);
--   · un Líder no pasa del 35 % — `venta_descuento_supera_autorizacion` (como en la venta: la caja no tiene tope, solo argumento);
--   · pasado el 15 %, argumento escrito — `venta_descuento_requiere_argumento`.
--   Los nombres de los errores son los de la venta a propósito: la web ya los traduce (`lib/error-escritura.ts`).
--
-- QUÉ TOCA
--   1. `separacion_items`: tres columnas (motivo, detalle, argumento) y sus candados. El de «descuento ⇔ etiqueta de campaña» pasa
--      a «descuento ⇔ etiqueta O motivo», y nunca las dos.
--   2. `fn_exigir_descuento_manual`: la regla, sola, sin escribir nada.
--   3. `separar_prendas`, cuatro reemplazos ANCLADOS sobre la definición viva (ADR-0288; la función lleva muchos parches y copiar
--      un cuerpo viejo pisaría lo que vino después): lee el motivo de cada prenda; si trae un descuento a mano mayor que la campaña,
--      lo exige con la regla y lo guarda con su motivo; si no, todo sigue como antes (la campaña obligatoria). Lo usa también
--      `separar_pedido_para_apartar`, que le pasa las prendas tal cual.
--   4. `entregar_separacion`: la venta que nace al recoger lleva el motivo, el detalle y el argumento de cada prenda. Antes marcaba
--      «campaña» todo descuento, y con uno a mano eso mentiría (y el candado `venta_items_campana_coherente` lo rechazaría).
--
-- DESCARTÉ: que `registrar_venta` también llame a `fn_exigir_descuento_manual`. Sería una sola regla de verdad, pero su versión viva
--   lleva más de veinte parches anclados y cortar su bloque del descuento es un cambio en lo que cobra la caja: va aparte, con su
--   propio OK. Mientras tanto la regla vive en dos lugares, y `scripts/pruebas/apartar_con_descuento.mjs` les pasa los mismos casos
--   a las dos y exige el mismo error: si una cambia sin la otra, la prueba falla.
-- DESCARTÉ: guardar el descuento a mano en una tabla aparte. Es una propiedad de la línea, como en `venta_items`.
--
-- CÓMO SE PEGA. Una sola parte: `alter` de `separacion_items` y funciones, SIN políticas (ADR-0195). Idempotente, `lock_timeout`
-- 3 s. Dentro de los textos de reemplazo no hay ningún `select … into` (ADR-0288).
-- PRODUCCIÓN: pegar SOLO con OK de Felipe (cambia lo que acepta Apartar y lo que escribe la entrega) y ANTES de publicar la web: con
-- la base nueva y la web vieja nada cambia (la web vieja no manda motivo); con la web nueva y la base vieja, un apartado con
-- descuento a mano se rechaza (`separacion_descuento_no_coincide`) sin guardar nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. La línea del apartado guarda por qué se descontó
-- ----------------------------------------------------------------------------
alter table retail.separacion_items add column if not exists motivo_descuento text;
alter table retail.separacion_items add column if not exists motivo_descuento_detalle text;
alter table retail.separacion_items add column if not exists argumento_descuento text;

comment on column retail.separacion_items.motivo_descuento is
  'ADR-0584. Por qué se descontó A MANO esta prenda al apartarla (la lista de venta_items, sin «campana»). NULL = sin descuento o descuento de campaña (ese lo dice descuento_etiqueta_id).';
comment on column retail.separacion_items.motivo_descuento_detalle is 'ADR-0584. El detalle de un motivo «otro».';
comment on column retail.separacion_items.argumento_descuento is 'ADR-0584. El argumento escrito de un descuento a mano que pasa el 15 %.';

alter table retail.separacion_items drop constraint if exists separacion_items_descuento_con_etiqueta;
alter table retail.separacion_items drop constraint if exists separacion_items_descuento_con_origen;
alter table retail.separacion_items add constraint separacion_items_descuento_con_origen check (
  -- Un descuento viene de una campaña (su etiqueta) o de la colaboradora (su motivo), nunca de las dos ni de ninguna.
  (descuento_unitario > 0) = (descuento_etiqueta_id is not null or motivo_descuento is not null)
  and not (descuento_etiqueta_id is not null and motivo_descuento is not null)
);
alter table retail.separacion_items drop constraint if exists separacion_items_motivo_descuento_valido;
alter table retail.separacion_items add constraint separacion_items_motivo_descuento_valido check (
  motivo_descuento is null
  or (motivo_descuento in ('cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro')
      and (motivo_descuento <> 'otro' or btrim(coalesce(motivo_descuento_detalle, '')) <> ''))
);

-- ----------------------------------------------------------------------------
-- 2. La regla del descuento a mano (la de `registrar_venta`)
-- ----------------------------------------------------------------------------
create or replace function retail.fn_exigir_descuento_manual(
  p_variante_id uuid,
  p_precio numeric,       -- el precio de la prenda en la sede, por unidad
  p_descuento numeric,    -- el descuento a mano, por unidad
  p_campana numeric,      -- lo que da HOY la campaña de esa prenda en esa sede (0 sin campaña)
  p_motivo text,
  p_detalle text,
  p_argumento text,
  p_prenda text           -- «referencia (código)», para el mensaje
)
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_costo numeric;
begin
  if p_campana > 0 and p_descuento <= p_campana + 0.01 then
    raise exception 'venta_descuento_no_supera_campana' using detail = p_prenda;
  end if;
  if coalesce(btrim(p_motivo), '') not in ('cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro') then
    raise exception 'venta_descuento_requiere_motivo' using detail = p_prenda;
  end if;
  if btrim(p_motivo) = 'otro' and coalesce(btrim(p_detalle), '') = '' then
    raise exception 'venta_descuento_otro_sin_detalle' using detail = p_prenda;
  end if;
  v_costo := (select v.costo from retail.variantes v where v.id = p_variante_id);
  if p_descuento >= p_precio or p_precio - p_descuento < coalesce(v_costo, 0) then
    raise exception 'venta_descuento_bajo_costo' using detail = p_prenda;
  end if;
  if retail.fn_es_lider() and p_descuento > retail.fn_descuento_campana(p_precio, 35) + 0.01 then
    raise exception 'venta_descuento_supera_autorizacion' using detail = p_prenda;
  end if;
  if p_descuento > retail.fn_descuento_campana(p_precio, 15) + 0.01 and coalesce(btrim(p_argumento), '') = '' then
    raise exception 'venta_descuento_requiere_argumento' using detail = p_prenda;
  end if;
end;
$$;

comment on function retail.fn_exigir_descuento_manual(uuid, numeric, numeric, numeric, text, text, text, text) is
  'ADR-0584. La regla del descuento A MANO de una prenda (la misma de registrar_venta): supera a la campaña, motivo de la lista (y detalle si es «otro»), nunca bajo el costo ni gratis, un Líder no pasa del 35 %, argumento pasado el 15 %. Solo valida: no escribe nada. La llaman separar_prendas y editar_separacion.';

revoke all on function retail.fn_exigir_descuento_manual(uuid, numeric, numeric, numeric, text, text, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. `separar_prendas` acepta el descuento a mano (reemplazos anclados)
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

create or replace function pg_temp.firma(p_nombre text) returns text language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre
$f$;

-- 3a. Una variable para recordar, entre la validación y el guardado, el descuento a mano de cada prenda.
select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
$v$  v_desc numeric;
$v$,
$v$  v_desc numeric;
  v_manuales jsonb := '{}'::jsonb;  -- ADR-0584: {variante_id: {d, m, o, a}}, el descuento a mano ya exigido
$v$, 1);

-- 3b. Cada prenda trae su motivo, su detalle y su argumento (vacíos si no hay descuento a mano).
select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
$v$           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario
      from jsonb_array_elements(p_items) e
     group by 1
  loop$v$,
$v$           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario,
           max(btrim(coalesce(e ->> 'motivo_descuento', ''))) as motivo_descuento,
           max(btrim(coalesce(e ->> 'motivo_descuento_detalle', ''))) as motivo_descuento_detalle,
           max(btrim(coalesce(e ->> 'argumento_descuento', ''))) as argumento_descuento
      from jsonb_array_elements(p_items) e
     group by 1
  loop$v$, 1);

-- 3c. Un descuento MAYOR que la campaña es a mano: se exige con la regla de la venta. Lo demás, como siempre (la campaña).
select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
$v$    if abs(v_item.descuento_unitario - v_c_unit) > 0.011 then
      raise exception 'separacion_descuento_no_coincide'
        using detail = v_ref || ' (' || v_sku || ')',
              hint = format('Hoy corresponde S/%s de descuento (campaña) y la caja mandó S/%s', v_c_unit, v_item.descuento_unitario);
    end if;
    v_total := v_total + (v_precio - v_c_unit) * v_item.cantidad;$v$,
$v$    if v_item.motivo_descuento <> 'campana' and v_item.descuento_unitario > v_c_unit + 0.011 then
      -- ADR-0584: descuento a mano, con las reglas de la venta.
      perform retail.fn_exigir_descuento_manual(v_item.variante_id, v_precio, round(v_item.descuento_unitario, 2), v_c_unit,
        v_item.motivo_descuento, v_item.motivo_descuento_detalle, v_item.argumento_descuento, v_ref || ' (' || v_sku || ')');
      v_manuales := v_manuales || jsonb_build_object(v_item.variante_id::text, jsonb_build_object(
        'd', round(v_item.descuento_unitario, 2),
        'm', v_item.motivo_descuento,
        'o', case when v_item.motivo_descuento = 'otro' then nullif(v_item.motivo_descuento_detalle, '') end,
        'a', nullif(v_item.argumento_descuento, '')));
      v_total := v_total + (v_precio - round(v_item.descuento_unitario, 2)) * v_item.cantidad;
    else
    if abs(v_item.descuento_unitario - v_c_unit) > 0.011 then
      raise exception 'separacion_descuento_no_coincide'
        using detail = v_ref || ' (' || v_sku || ')',
              hint = format('Hoy corresponde S/%s de descuento (campaña) y la caja mandó S/%s', v_c_unit, v_item.descuento_unitario);
    end if;
    v_total := v_total + (v_precio - v_c_unit) * v_item.cantidad;
    end if;$v$, 1);

-- 3d. La línea se guarda con el descuento a mano y su motivo, o con la campaña como siempre.
select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
$v$    insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id)
      values (v_id, v_item.variante_id, v_item.cantidad, v_precio, v_desc, case when v_desc > 0 then v_c_etq end, v_apartado);$v$,
$v$    if v_manuales ? v_item.variante_id::text then
      -- ADR-0584: el descuento a mano ya exigido arriba, con su motivo.
      insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id,
                                    motivo_descuento, motivo_descuento_detalle, argumento_descuento)
        values (v_id, v_item.variante_id, v_item.cantidad, v_precio, (v_manuales -> v_item.variante_id::text ->> 'd')::numeric, null, v_apartado,
                v_manuales -> v_item.variante_id::text ->> 'm', v_manuales -> v_item.variante_id::text ->> 'o',
                v_manuales -> v_item.variante_id::text ->> 'a');
    else
    insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id)
      values (v_id, v_item.variante_id, v_item.cantidad, v_precio, v_desc, case when v_desc > 0 then v_c_etq end, v_apartado);
    end if;$v$, 1);

-- ----------------------------------------------------------------------------
-- 4. Al recoger, la venta lleva el motivo de cada prenda
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(pg_temp.firma('entregar_separacion'),
$v$    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                             motivo_descuento, descuento_etiqueta_id)
      values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
              case when v_it.descuento_unitario > 0 then 'campana' end, v_it.descuento_etiqueta_id)$v$,
$v$    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                             motivo_descuento, descuento_etiqueta_id, motivo_descuento_detalle, argumento_descuento)
      values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
              -- ADR-0584: el motivo de un descuento a mano viaja tal cual; el de campaña, como siempre.
              case when v_it.motivo_descuento is not null then v_it.motivo_descuento
                   when v_it.descuento_unitario > 0 then 'campana' end,
              v_it.descuento_etiqueta_id, v_it.motivo_descuento_detalle, v_it.argumento_descuento)$v$, 1);

-- ----------------------------------------------------------------------------
-- 5. Comprobación: quedó todo, o no se aplica nada
-- ----------------------------------------------------------------------------
do $$
declare
  v_sep text := pg_get_functiondef(pg_temp.firma('separar_prendas')::regprocedure);
  v_ent text := pg_get_functiondef(pg_temp.firma('entregar_separacion')::regprocedure);
begin
  if position('fn_exigir_descuento_manual' in v_sep) = 0 or position('v_manuales ? v_item.variante_id::text' in v_sep) = 0 then
    raise exception 'ADR-0584: separar_prendas no quedó con el descuento a mano';
  end if;
  if position('v_it.motivo_descuento_detalle, v_it.argumento_descuento' in v_ent) = 0 then
    raise exception 'ADR-0584: entregar_separacion no lleva el motivo a la venta';
  end if;
end;
$$;
