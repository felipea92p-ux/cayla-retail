-- ============================================================================
-- 20261115205000_costo_dudoso_candados.sql — CAYLA V2 · ADR-0668 (A4, PARTE 2 de 2)
-- Los candados del costo dudoso en las puertas de Recibir. ESPERA EL OK DE FELIPE: frena recepciones (stock y costo).
--
-- QUÉ CAMBIA (las reglas son de la PARTE 1, 20261115204000, que tiene que estar pegada antes)
--   · `fn_recepcion_entrar` (la puerta única al stock de un envío: cerrar el conteo, «Hacer ahora» y «Llevar al stock») y
--     `recibir_lote` («Llegó mercadería»): el costo pide confirmar con `fn_motivo_de_costo` en vez de solo la banda de siempre. Siguen
--     los cuatro motivos de antes (sin costo, mayor que el precio, sube, baja; los dos últimos ahora contra el anterior EN PAPEL) y se
--     suman «sin_igv» y «fuera_de_banda». La confirmación pasa por `fn_costo_confirmado`: el monto que la persona confirmó.
--   · `cerrar_conteo_envio`, `resolver_pendiente_envio` y `recibir_despacho` pasan hasta el candado los montos confirmados
--     (`confirma_montos`, dentro de la decisión de cada línea o de `p_separado`). `llevar_al_stock_ahora` confirma el costo que trae
--     la misma llamada: el «sí» y el monto viajan juntos. Ninguna firma cambia (ADR-0298 §4, PGRST203).
--   · Quién confirma no cambia: quien ve los costos al recibir (`fn_ve_costos_al_recibir`, ADR-0387).
--
-- LO QUE NO CAMBIA: `fn_costo_fuera_de_banda` (la usan Compras, Producción y corregir costo), lo que se guarda (A11), el precio contra
-- el que se compara «mayor que el precio» (A5) y «Recibir contra factura» (`recibir_envio`: 0 usos en 90 días, sigue con su banda).
--
-- DECIDÍ: el «sí» suelto sigue valiendo para los cuatro motivos de antes, y los dos nuevos piden el monto.
-- DESCARTÉ: exigir el monto ya para todos: la web publicada y la cola sin conexión de «Llegó mercadería» mandan `confirma_costo: true`;
--   un pedido de la cola quedaría rechazado al subir sin que nadie lo vea. Se quita en una parte posterior, cuando la web nueva lleve
--   unos días publicada (backlog del ADR-0668).
-- SE ROMPE SI: la PARTE 2 se pega antes que la web nueva y alguien recibe un costo «sin_igv» o «fuera_de_banda»: la web vieja manda
--   el «sí» suelto, la base no lo acepta para esos dos y vuelve a pedir confirmar. Por eso el ORDEN de abajo.
--
-- CÓMO. Reemplazos ANCLADOS sobre la definición VIVA (medido el 2026-11-15: las cinco funciones son idénticas en producción y en una base
-- con todas las migraciones del repo, por su md5). Cada reemplazo, si su texto nuevo ya está, no hace nada; si no, exige que el viejo
-- aparezca exactamente N veces, o aborta SIN TOCAR NADA (todo va en una transacción). No cambia los tres textos de 20261026164000 que
-- `costo_por_prenda.mjs` vuelve a buscar, ni la frase del regalo de 20261028182000.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente: solo funciones, sin tablas, políticas ni `drop trigger`.
-- ORDEN: PARTE 1 → la web (fusionar el PR) → esta PARTE 2.
-- VUELTA ATRÁS: los mismos reemplazos al revés (en el PR), que dejan las cinco funciones como estaban.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---- fn_recepcion_entrar: el motivo final y la confirmación por monto. ----
select pg_temp.reemplazar(
  'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
  $v$   cross join lateral (select retail.fn_costo_fuera_de_banda(coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), vr.costo, vr.precio) as motivo) x
   where (v ->> 'cantidad')::integer > 0
     and x.motivo is not null$v$,
  $v$   cross join lateral (select retail.fn_costo_fuera_de_banda(coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), vr.costo, vr.precio) as motivo) x
   -- ADR-0668 (A4): el motivo final; sube y baja contra el anterior en papel, y además sin IGV y fuera de lo que cuesta su categoría.
   cross join lateral (select retail.fn_motivo_de_costo(coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), vr.id,
                                                          (u ->> 'orden_compra_item_id')::uuid, x.motivo) as motivo) y
   where (v ->> 'cantidad')::integer > 0
     and y.motivo is not null$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
  $v$'variante_id', vr.id, 'motivo', x.motivo,$v$,
  $v$'variante_id', vr.id, 'motivo', y.motivo,$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
  $v$'proveedor_id', u -> 'proveedor_id', 'confirmada', (u ->> 'confirma')::boolean$v$,
  $v$'proveedor_id', u -> 'proveedor_id',
           'confirmada', retail.fn_costo_confirmado(coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), y.motivo,
                                                     (u ->> 'confirma')::boolean, u -> 'confirma_montos')$v$,
  1);

-- ---- recibir_lote («Llegó mercadería»): lo mismo, sin línea de orden. ----
select pg_temp.reemplazar(
  'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)',
  $v$     select retail.fn_costo_fuera_de_banda((e.item ->> 'costo_unitario')::numeric, vr.costo, vr.precio) as motivo
   ) x
   where$v$,
  $v$     select retail.fn_costo_fuera_de_banda((e.item ->> 'costo_unitario')::numeric, vr.costo, vr.precio) as motivo
   ) x
   -- ADR-0668 (A4): el motivo final; sube y baja contra el anterior en papel, y además fuera de lo que cuesta su categoría.
   cross join lateral (select retail.fn_motivo_de_costo((e.item ->> 'costo_unitario')::numeric, vr.id, null::uuid, x.motivo) as motivo) y
   where$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)',
  $v$     and x.motivo is not null;$v$,
  $v$     and y.motivo is not null;$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)',
  $v$'linea', e.pos, 'variante_id', vr.id, 'sku', vr.sku, 'motivo', x.motivo,$v$,
  $v$'linea', e.pos, 'variante_id', vr.id, 'sku', vr.sku, 'motivo', y.motivo,$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)',
  $v$'confirmada', coalesce((e.item -> 'confirma_costo') = 'true'::jsonb, false)$v$,
  $v$'confirmada', retail.fn_costo_confirmado((e.item ->> 'costo_unitario')::numeric, y.motivo,
                                                     coalesce((e.item -> 'confirma_costo') = 'true'::jsonb, false), e.item -> 'confirma_montos')$v$,
  1);

-- ---- Los montos confirmados viajan hasta el candado. ----
select pg_temp.reemplazar(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$      'confirma', coalesce(lower(v_d ->> 'confirma_costo') = 'true', false),
$v$,
  $v$      'confirma', coalesce(lower(v_d ->> 'confirma_costo') = 'true', false), 'confirma_montos', v_d -> 'confirma_montos',
$v$,
  1);
-- (Junto al costo, no junto a 'confirma': esa línea la vuelve a buscar 20261026164000, que `costo_por_prenda.mjs` aplica de nuevo.)
select pg_temp.reemplazar(
  'retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
  $v$'enviado', 0, 'costo', coalesce(v_k.costo_unitario, v_k.precio_unitario),$v$,
  $v$'enviado', 0, 'costo', coalesce(v_k.costo_unitario, v_k.precio_unitario), 'confirma_montos', p_separado -> 'confirma_montos',$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
$v$,
  $v$      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false), 'confirma_montos', v_e -> 'confirma_montos',
$v$,
  2);
-- «Llevar al stock»: el costo y el «sí» vienen en la misma llamada, así que el sí confirma ESE costo: el escrito, el que la prenda ya
-- tenía guardado en el conteo o, si no, el de la línea.
select pg_temp.reemplazar(
  'retail.llevar_al_stock_ahora(uuid,uuid,integer,integer,uuid,jsonb,numeric,boolean,uuid)',
  $v$'costo', v_costo, 'confirma', coalesce(p_confirma, false),$v$,
  $v$'costo', v_costo, 'confirma', coalesce(p_confirma, false),
      'confirma_montos', case when coalesce(p_confirma, false)
                              then jsonb_build_array(coalesce(p_costo, (v_cp ->> lower(p_producto_id::text))::numeric, v_costo)) end,$v$,
  1);

reset search_path;
reset lock_timeout;
