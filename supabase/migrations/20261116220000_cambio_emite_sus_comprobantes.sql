-- ============================================================================
-- 20261116220000 — Un cambio de prenda emite su nota de crédito y su boleta nueva (ADR-0672, Felipe 2026-11-16)
--
-- EL PROBLEMA. Un cambio no emitía ningún comprobante (ADR-0125, ADR-0177, ADR-0470). La boleta original seguía declarando la prenda
--   que volvió y, si había diferencia, lo cobrado o devuelto no figuraba en ningún papel: el Diario (`fn_asientos`) asentaba la diferencia
--   con su IGV y el registro de ventas para SUNAT (`fn_impuestos_ventas`, que solo lee comprobantes) no. Al 2026-11-16: 25 cambios,
--   S/ 209.70 cobrados y S/ 10.10 devueltos sin papel.
--
-- LO QUE HACE. Un cambio es dos hechos: la clienta DEVUELVE una prenda y COMPRA otra. Cada uno con su papel, en el mismo guardado:
--   · nota de crédito sobre la boleta (o factura) original, por lo que se PAGÓ por la prenda devuelta («06» si devuelve toda la venta, «07»
--     si es parte; los ítems con la forma de una línea de venta, como `aprobar_devolucion`, ADR-0382);
--   · boleta (o factura, si la original lo era) por la prenda que se lleva, a nombre del mismo cliente, en la serie de la tienda del cambio.
--   La boleta vale lo pagado más la diferencia (`cambios.diferencia`, la misma cifra que cobró o devolvió la caja): boleta − nota = diferencia.
--
-- LA CAJA NO SE TOCA. `fn_calcular_esperado_caja` cuenta pagos de ventas, devoluciones y la diferencia del cambio; nunca comprobantes. Por eso
--   los dos papeles van sin venta y sin pago (`comprobantes.cambio_id`, `venta_id` vacío; candado `comprobantes_cambio_sin_venta`): la venta
--   original no se anula y la boleta nueva no es una venta. Ni Ventas, ni las metas, ni el Resumen la cuentan dos veces.
--
-- DECISIONES DE FELIPE (2026-11-16). 1) Si la boleta original todavía no está aceptada por SUNAT, el cambio espera, igual que la devolución
--   (ADR-0390): sin aceptada no sale la nota. 2) Si la venta no tiene boleta ni factura del ERP (nota de venta, emitida afuera, liberada o
--   anulada), no hay papel que corregir: el cambio no emite nada. 3) Se imprime solo la boleta nueva (pantalla, actividad 4).
--
-- PIEZAS.
--   1. `comprobantes.cambio_id` + candado + un solo papel de cada tipo por cambio.
--   2. `fn_emitir_nota_interna`: el cuerpo de `emitir_nota` sin el permiso de sede. `emitir_nota` pasa a ser «permiso + interna» (mismo
--      texto, misma firma, mismos permisos): el cambio puede hacerse en otra tienda (ADR-0370) y la nota va en la serie de la tienda de la
--      boleta original, donde quien hace el cambio no siempre opera. El permiso del cambio ya lo pidió `registrar_cambio`.
--   3. `fn_emitir_comprobantes_del_cambio(cambio)`: arma y reserva los dos papeles. Comprueba que boleta − nota = diferencia o no guarda nada.
--   4. `registrar_cambio` la llama al final (reemplazo anclado). El cambio por varias prendas (`registrar_cambio_varias`) va aparte.
--
-- QUÉ NO HACE. No emite papeles por los cambios ya hechos (decisión del contador). No transmite a SUNAT: los papeles quedan `pendiente` y
--   salen por el mismo camino que una boleta de venta (ADR-0165).
-- SE ROMPE SI: alguien cambia `emitir_nota` o el final de `registrar_cambio` antes de pegar esto: la huella o el ancla no aparecen y se
--   detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s. Un `alter table` y funciones, sin políticas ni disparadores (ADR-0195).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:cambio-comprobantes`.
-- ============================================================================

set lock_timeout = '3s';

-- 1. El vínculo. Un papel de un cambio no es de una venta: la venta original sigue viva y la boleta nueva no cobra nada.
alter table retail.comprobantes add column if not exists cambio_id uuid references retail.cambios(id);

alter table retail.comprobantes drop constraint if exists comprobantes_cambio_sin_venta;
alter table retail.comprobantes add constraint comprobantes_cambio_sin_venta
  check (cambio_id is null or (venta_id is null and tipo in ('boleta', 'factura', 'nota_credito')));

create unique index if not exists comprobantes_un_papel_por_tipo_de_cambio
  on retail.comprobantes (cambio_id, tipo) where cambio_id is not null;

comment on column retail.comprobantes.cambio_id is
  'ADR-0672: el cambio de prenda que emitió este papel (su nota de crédito o su boleta nueva). Sin venta: la caja no lo cuenta.';

-- 2. La nota de crédito sin el permiso de sede. Se comprueba que `emitir_nota` sea la que se leyó (ADR-0382/0380) antes de tocarla.
do $$
declare
  v_md5 text := (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'retail' and p.proname = 'emitir_nota');
begin
  if v_md5 is distinct from '196885b8ad3c5eda8c29a0bf715bcbcb'
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'retail' and p.proname = 'fn_emitir_nota_interna') then
    raise exception 'emitir_nota cambió desde que se escribió esta migración (huella %). No se aplicó nada.', v_md5;
  end if;
end;
$$;

create or replace function retail.fn_emitir_nota_interna(
  p_comprobante_original_id uuid, p_tipo text, p_motivo text, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_items jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare v_original comprobantes%rowtype; v_serie text; v_numero integer; v_id uuid; v_persona uuid; v_items jsonb;
begin
  select * into v_original from comprobantes where id = p_comprobante_original_id;
  if not found then
    raise exception 'El comprobante original % no existe', p_comprobante_original_id;
  end if;
  -- SUNAT: la nota lleva la letra del documento que corrige (B si corrige una boleta, F si una factura).
  select serie, numero into v_serie, v_numero
    from fn_reservar_numero_serie(
      v_original.ubicacion_id, p_tipo,
      case v_original.tipo when 'boleta' then 'B' when 'factura' then 'F' else null end
    );
  v_persona := retail.fn_actor_persona_id(true);
  v_items := coalesce(p_items, v_original.items);
  if p_tipo = 'nota_credito' then
    perform 1 from comprobantes where id = p_comprobante_original_id for update;
    if round(p_total + (select coalesce(sum(n.total), 0) from comprobantes n
                         where n.comprobante_original_id = p_comprobante_original_id
                           and n.tipo = 'nota_credito' and n.estado not in ('rechazado', 'anulado')), 2)
       > round(v_original.total + v_original.anticipo_deducido, 2) then
      raise exception 'Las notas de crédito de este comprobante pasarían de lo que cobró (S/%): ya se acreditó lo que corresponde.',
        round(v_original.total + v_original.anticipo_deducido, 2);
    end if;
  end if;
  insert into comprobantes (ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
    subtotal, igv, total, usuario_id, comprobante_original_id, motivo, items)
    values (v_original.ubicacion_id, p_tipo, v_serie, v_numero, v_original.cliente_tipo_doc, v_original.cliente_num_doc,
      v_original.cliente_nombre, p_subtotal, p_igv, p_total, v_persona, p_comprobante_original_id, p_motivo, v_items)
    returning id into v_id;
  return v_id;
end;
$function$;

comment on function retail.fn_emitir_nota_interna(uuid, text, text, numeric, numeric, numeric, jsonb) is
  'ADR-0672: el cuerpo de emitir_nota sin el permiso de sede. Solo la llaman emitir_nota (que pide el permiso) y '
  'fn_emitir_comprobantes_del_cambio (cuyo permiso ya pidió registrar_cambio). Nadie más.';

revoke all on function retail.fn_emitir_nota_interna(uuid, text, text, numeric, numeric, numeric, jsonb) from public, anon, authenticated;

create or replace function retail.emitir_nota(
  p_comprobante_original_id uuid, p_tipo text, p_motivo text, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_items jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not fn_puede_operar_ubicacion((select c.ubicacion_id from comprobantes c where c.id = p_comprobante_original_id)) then
    if not exists (select 1 from comprobantes c where c.id = p_comprobante_original_id) then
      raise exception 'El comprobante original % no existe', p_comprobante_original_id;
    end if;
    raise exception 'No tienes permiso para emitir notas en esa ubicación';
  end if;
  return retail.fn_emitir_nota_interna(p_comprobante_original_id, p_tipo, p_motivo, p_subtotal, p_igv, p_total, p_items);
end;
$function$;

-- 3. Los dos papeles de un cambio.
create or replace function retail.fn_emitir_comprobantes_del_cambio(p_cambio_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  c cambios%rowtype;
  vi venta_items%rowtype;
  o comprobantes%rowtype;
  r record;
  v_nc_total numeric; v_nc_igv numeric; v_nc_id uuid;
  v_bol_total numeric; v_bol_igv numeric; v_bol_id uuid;
  v_unit numeric; v_lista numeric;
  v_es_total boolean;
begin
  select * into c from cambios where id = p_cambio_id;
  if not found then
    raise exception 'El cambio % no existe', p_cambio_id;
  end if;
  select * into vi from venta_items where id = c.venta_item_id;

  -- Decisión 1 (como la devolución, ADR-0390): con la boleta o factura todavía sin aceptar por SUNAT no hay sobre qué emitir la nota.
  for r in
    select co.tipo, co.serie, co.numero, co.estado
      from comprobantes co
     where co.venta_id = vi.venta_id
       and co.tipo in ('boleta', 'factura')
       and co.estado in ('pendiente', 'pendiente_reintento', 'enviado', 'rechazado')
     order by co.created_at desc
     limit 1
  loop
    raise exception 'La % %-% de esta compra todavía no está aceptada por SUNAT (%). %',
      r.tipo, r.serie, lpad(r.numero::text, 6, '0'),
      case r.estado when 'rechazado' then 'SUNAT la rechazó' when 'enviado' then 'se envió y SUNAT aún no responde' else 'todavía no se envía' end,
      case r.estado
        when 'rechazado' then 'Reintenta su envío en Comprobantes y, cuando SUNAT la acepte, vuelve a hacer el cambio.'
        else 'Espera a que SUNAT la acepte y vuelve a hacer el cambio: así salen su nota de crédito y su boleta nueva.'
      end
      using errcode = 'P0001', hint = 'cambio_boleta_sin_aceptar';
  end loop;

  -- Decisión 2: sin boleta ni factura del ERP aceptada (nota de venta, emitida afuera, liberada, anulada) no hay papel que corregir.
  select * into o
    from comprobantes co
   where co.venta_id = vi.venta_id and co.tipo in ('boleta', 'factura') and co.estado = 'aceptado'
   order by co.created_at desc
   limit 1;
  if not found then
    return;
  end if;

  -- Lo que se pagó por lo devuelto (ADR-0380) y lo que vale lo que se lleva: lo pagado más la diferencia que cobró o devolvió la caja.
  v_nc_total := round((vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2);
  v_bol_total := round(v_nc_total + c.diferencia, 2);
  v_unit := round(v_bol_total / c.cantidad, 2);
  if v_unit * c.cantidad <> v_bol_total then
    raise exception 'La boleta del cambio no reparte S/% entre % unidades sin céntimos sueltos. No se guardó nada.', v_bol_total, c.cantidad;
  end if;

  if v_nc_total > 0 then
    -- «06» si este cambio devuelve toda la venta (una sola línea y todas sus unidades); si no, «07» (por ítem). Igual que la devolución.
    v_es_total := (select count(*) from venta_items x where x.venta_id = vi.venta_id) = 1 and c.cantidad = vi.cantidad;
    v_nc_igv := round(v_nc_total - v_nc_total / 1.18, 2);
    v_nc_id := retail.fn_emitir_nota_interna(
      o.id, 'nota_credito', case when v_es_total then '06' else '07' end,
      round(v_nc_total - v_nc_igv, 2), v_nc_igv, v_nc_total,
      (select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                'variante_id', vi.variante_id, 'cantidad', c.cantidad,
                'precio_unitario', vi.precio_unitario, 'descuento_unitario', vi.descuento_unitario,
                'descripcion_libre', pr.descripcion)))
         from (select 1) uno left join prendas_por_regularizar pr on pr.venta_item_id = vi.id)
    );
    update comprobantes set cambio_id = p_cambio_id where id = v_nc_id;
  end if;

  if v_bol_total > 0 then
    -- La línea dice el precio de lista y, si se cobró menos (el mismo modelo conserva su descuento, ADR-0655), el descuento aparte.
    v_lista := greatest(coalesce(retail.fn_precio_para_cambio(c.venta_item_id, c.variante_nueva_id, c.ubicacion_id), v_unit), v_unit);
    v_bol_igv := round(v_bol_total - v_bol_total / 1.18, 2);
    v_bol_id := retail.emitir_comprobante(
      c.ubicacion_id, o.tipo, round(v_bol_total - v_bol_igv, 2), v_bol_igv, v_bol_total, null,
      o.cliente_tipo_doc, o.cliente_num_doc, o.cliente_nombre,
      jsonb_build_array(jsonb_build_object(
        'variante_id', c.variante_nueva_id, 'cantidad', c.cantidad,
        'precio_unitario', v_lista, 'descuento_unitario', round(v_lista - v_unit, 2))),
      null
    );
    update comprobantes set cambio_id = p_cambio_id where id = v_bol_id;
  end if;

  -- Candado final: lo declarado (boleta − nota) es lo que se movió en la caja. Si no, no se guarda nada.
  if round(coalesce((select sum(case when x.tipo = 'nota_credito' then -x.total else x.total end)
                       from comprobantes x where x.cambio_id = p_cambio_id), 0), 2) <> round(c.diferencia, 2) then
    raise exception 'Los papeles del cambio no suman su diferencia (S/%). No se guardó nada.', c.diferencia;
  end if;
end;
$function$;

comment on function retail.fn_emitir_comprobantes_del_cambio(uuid) is
  'ADR-0672: la nota de crédito sobre la boleta original (lo pagado por lo devuelto) y la boleta nueva (lo pagado + la diferencia) de un '
  'cambio, sin venta ni pago. Espera si la boleta original no está aceptada; no emite nada si la venta no tiene boleta ni factura del ERP.';

revoke all on function retail.fn_emitir_comprobantes_del_cambio(uuid) from public, anon, authenticated;

-- 4. `registrar_cambio` la llama al final, después de mover el stock: si los papeles no se pueden emitir, no se guarda nada.
create or replace function pg_temp.reemplazar_cambio_comprobantes(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_cambio_comprobantes(
  'retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text)',
  $v$  perform fn_aplicar_movimiento(v_mov_salida);

  return v_cambio_id;$v$,
  $n$  perform fn_aplicar_movimiento(v_mov_salida);

  -- ADR-0672: la nota de crédito sobre la boleta original y la boleta nueva, en el mismo guardado.
  perform retail.fn_emitir_comprobantes_del_cambio(v_cambio_id);

  return v_cambio_id;$n$
);
