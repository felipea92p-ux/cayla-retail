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
--   4. `registrar_cambio` la llama al final (reemplazo anclado).
--   5. `registrar_cambio_varias` (ADR-0470) arma las líneas de la boleta en el mismo ciclo que calcula la diferencia (las unidades del mismo
--      modelo que conservaron su descuento van aparte, ADR-0655) y la llama al final con ellas.
--   6. La siembra del vigía de producción con INV-30 (los papeles de cada cambio suman su diferencia y no tienen venta), generada por
--      `scripts/chaos/vigia-semilla.mjs`.
--
-- QUÉ NO HACE. No emite papeles por los cambios ya hechos (decisión del contador). No transmite a SUNAT: los papeles quedan `pendiente` y
--   salen por el mismo camino que una boleta de venta (ADR-0165).
-- SE ROMPE SI: alguien cambia `emitir_nota`, el final de `registrar_cambio` o el ciclo de `registrar_cambio_varias` antes de pegar esto:
--   la huella o el ancla no aparecen y se detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s. Un `alter table`, funciones y la siembra del vigía, sin políticas ni
--   disparadores (ADR-0195).
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

-- 3. Los dos papeles de un cambio. `p_items_boleta`: las líneas de la boleta ya armadas por quien sabe qué unidad conservó su descuento
--    (`registrar_cambio_varias`, ADR-0655); sin ellas (una prenda por una), se arman aquí.
drop function if exists retail.fn_emitir_comprobantes_del_cambio(uuid);
create or replace function retail.fn_emitir_comprobantes_del_cambio(p_cambio_id uuid, p_items_boleta jsonb default null)
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
  if p_items_boleta is not null then
    -- Una prenda por varias: las líneas llegan armadas; tienen que valer exactamente lo pagado más la diferencia.
    if round(coalesce((select sum(((it ->> 'precio_unitario')::numeric - coalesce((it ->> 'descuento_unitario')::numeric, 0)) * (it ->> 'cantidad')::integer)
                         from jsonb_array_elements(p_items_boleta) it), 0), 2) <> v_bol_total then
      raise exception 'Las prendas que se lleva no suman lo que vale la boleta del cambio (S/%). No se guardó nada.', v_bol_total;
    end if;
  else
    v_unit := round(v_bol_total / c.cantidad, 2);
    if v_unit * c.cantidad <> v_bol_total then
      raise exception 'La boleta del cambio no reparte S/% entre % unidades sin céntimos sueltos. No se guardó nada.', v_bol_total, c.cantidad;
    end if;
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
    if p_items_boleta is null then
      v_lista := greatest(coalesce(retail.fn_precio_para_cambio(c.venta_item_id, c.variante_nueva_id, c.ubicacion_id), v_unit), v_unit);
    end if;
    v_bol_igv := round(v_bol_total - v_bol_total / 1.18, 2);
    v_bol_id := retail.emitir_comprobante(
      c.ubicacion_id, o.tipo, round(v_bol_total - v_bol_igv, 2), v_bol_igv, v_bol_total, null,
      o.cliente_tipo_doc, o.cliente_num_doc, o.cliente_nombre,
      coalesce(p_items_boleta, jsonb_build_array(jsonb_build_object(
        'variante_id', c.variante_nueva_id, 'cantidad', c.cantidad,
        'precio_unitario', v_lista, 'descuento_unitario', round(v_lista - v_unit, 2)))),
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

comment on function retail.fn_emitir_comprobantes_del_cambio(uuid, jsonb) is
  'ADR-0672: la nota de crédito sobre la boleta original (lo pagado por lo devuelto) y la boleta nueva (lo pagado + la diferencia) de un '
  'cambio, sin venta ni pago. Espera si la boleta original no está aceptada; no emite nada si la venta no tiene boleta ni factura del ERP. '
  'p_items_boleta: las líneas ya armadas por registrar_cambio_varias.';

revoke all on function retail.fn_emitir_comprobantes_del_cambio(uuid, jsonb) from public, anon, authenticated;

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

-- 5. Una prenda por varias (ADR-0470): la boleta lleva una línea por prenda; las unidades del mismo modelo que conservaron su descuento
--    (ADR-0655) van en su propia línea, con el precio de lista y el descuento aparte. Se arman en el mismo ciclo que calcula la diferencia.
-- La variable va tras la línea de `v_precio` y no junto a la de ADR-0655 (`i integer;` + `v_mismo …` + `begin`): esa es el ancla de
-- `20261114125000`, y meter una línea en medio haría que esa migración, pegada otra vez, ya no se encuentre a sí misma.
select pg_temp.reemplazar_cambio_comprobantes(
  'retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text)',
  $v$  v_e jsonb; v_var uuid; v_cant integer; v_precio numeric;$v$,
  $n$  v_e jsonb; v_var uuid; v_cant integer; v_precio numeric;
  v_items_bol jsonb := '[]';  -- ADR-0672: las líneas de la boleta nueva$n$
);

select pg_temp.reemplazar_cambio_comprobantes(
  'retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text)',
  $v$    v_total_nuevo := v_total_nuevo + coalesce(v_pm, 0) * v_k + v_precio * (v_cants[i] - v_k);$v$,
  $n$    v_total_nuevo := v_total_nuevo + coalesce(v_pm, 0) * v_k + v_precio * (v_cants[i] - v_k);
    -- ADR-0672: la misma cuenta, en líneas de la boleta nueva.
    if v_k > 0 then
      v_items_bol := v_items_bol || jsonb_build_array(jsonb_build_object('variante_id', v_vars[i], 'cantidad', v_k,
        'precio_unitario', greatest(v_precio, v_pm), 'descuento_unitario', greatest(v_precio, v_pm) - v_pm));
    end if;
    if v_cants[i] - v_k > 0 then
      v_items_bol := v_items_bol || jsonb_build_array(jsonb_build_object('variante_id', v_vars[i], 'cantidad', v_cants[i] - v_k,
        'precio_unitario', v_precio, 'descuento_unitario', 0));
    end if;$n$
);

select pg_temp.reemplazar_cambio_comprobantes(
  'retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text)',
  $v$    perform fn_aplicar_movimiento(v_mov_salida);
  end loop;

  return v_cambio_id;$v$,
  $n$    perform fn_aplicar_movimiento(v_mov_salida);
  end loop;

  -- ADR-0672: la nota de crédito sobre la boleta original y la boleta nueva con todas las prendas, en el mismo guardado.
  perform retail.fn_emitir_comprobantes_del_cambio(v_cambio_id, v_items_bol);

  return v_cambio_id;$n$
);

-- 6. La siembra del vigía de producción (ADR-0632), regenerada desde `scripts/chaos/invariantes.mjs` con INV-30 (las otras 29 quedan
--    igual): cada madrugada mira que los papeles de cada cambio sumen su diferencia y no tengan venta.
-- >>> siembra generada por scripts/chaos/vigia-semilla.mjs: no se edita a mano
insert into retail.invariantes (id, nombre, gravedad, nivel, clave, requiere_sesion, activa, dice, sql) values
  ('INV-01', 'stock_igual_a_movimientos', 1, 'cruzada', array['variante_id', 'ubicacion_id', 'sububicacion_id']::text[], false, true,
   $txt$`stock` es un snapshot derivado: debe ser exactamente lo que sale de sumar `movimientos` (la misma cuenta de `retail.recalcular_stock()`), por prenda, sede y sububicación, en cantidad y en apartado (principio 4).$txt$,
   $inv$with rec as (
  select variante_id, ubicacion_id, sububicacion_id, sum(c) as c, sum(a) as a from (
    select variante_id, ubicacion_id, sububicacion_id, cantidad as c, 0 as a from retail.movimientos where tipo in ('entrada','ajuste')
    union all select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from retail.movimientos where tipo in ('salida','traslado')
    union all select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from retail.movimientos where tipo = 'traslado'
    union all select variante_id, ubicacion_id, sububicacion_id, 0, cantidad from retail.movimientos where tipo = 'apartado'
    union all select variante_id, ubicacion_id, sububicacion_id, 0, -cantidad from retail.movimientos where tipo = 'liberacion_apartado'
  ) t group by 1, 2, 3
)
select coalesce(r.variante_id, s.variante_id) as variante_id,
       coalesce(r.ubicacion_id, s.ubicacion_id) as ubicacion_id,
       coalesce(r.sububicacion_id, s.sububicacion_id) as sububicacion_id,
       coalesce(s.cantidad, 0) as stock, coalesce(r.c, 0) as segun_movimientos,
       coalesce(s.cantidad_apartada, 0) as apartado_stock, coalesce(r.a, 0) as apartado_movimientos
  from rec r
  full join retail.stock s on s.variante_id = r.variante_id and s.ubicacion_id = r.ubicacion_id
                          and s.sububicacion_id is not distinct from r.sububicacion_id
 where coalesce(s.cantidad, 0) <> coalesce(r.c, 0) or coalesce(s.cantidad_apartada, 0) <> coalesce(r.a, 0)$inv$),
  ('INV-02', 'venta_cuadra_con_sus_pagos', 1, 'cruzada', array['venta_id']::text[], false, true,
   $txt$Una venta completada cobra exactamente lo que suman sus líneas: Σ `venta_items.subtotal` = Σ `venta_pagos.monto` (el redondeo es un pago más).$txt$,
   $inv$select v.id as venta_id, v.ubicacion_id, round(coalesce(i.t, 0), 2) as lineas, round(coalesce(p.t, 0), 2) as pagos
  from retail.ventas v
  left join (select venta_id, sum(subtotal) as t from retail.venta_items group by 1) i on i.venta_id = v.id
  left join (select venta_id, sum(monto) as t from retail.venta_pagos group by 1) p on p.venta_id = v.id
 where v.estado = 'completada' and abs(coalesce(i.t, 0) - coalesce(p.t, 0)) > 0.011$inv$),
  ('INV-03', 'venta_descuenta_lo_que_vendio', 1, 'cruzada', array['venta_item_id']::text[], false, true,
   $txt$Cada línea de una venta completada tiene salidas de stock por exactamente su cantidad: lo vendido y lo descontado no se separan (ni dobles ni faltantes).$txt$,
   $inv$select i.id as venta_item_id, i.venta_id, i.variante_id, i.cantidad as vendido, coalesce(m.t, 0) as salido
  from retail.venta_items i
  join retail.ventas v on v.id = i.venta_id and v.estado = 'completada'
  left join (select venta_item_id, sum(cantidad) as t from retail.movimientos
              where tipo = 'salida' and venta_item_id is not null group by 1) m on m.venta_item_id = i.id
 where coalesce(m.t, 0) <> i.cantidad
   -- ADR-0379: una pieza de liquidación nunca estuvo en el stock, así que su línea no descuenta nada a propósito. Lo que la
   -- cuida es INV-13 (la pieza vendida cuadra con su línea), no esta.
   and not exists (select 1 from retail.piezas_liquidacion pl where pl.venta_item_id = i.id)
   -- ADR-0408 act. 10: la prenda de un pedido web se vende al quedar pagado y sale del stock recién al entregarla. Mientras su
   -- línea del pedido no se entrega, su línea de venta no tiene salida a propósito (con una, sí es violación). La cuida INV-18.
   and not (coalesce(m.t, 0) = 0
            and exists (select 1 from retail.pedido_web_lineas pwl where pwl.venta_item_id = i.id and pwl.estado <> 'entregada'))
   -- ADR-0179 y ADR-0334: la «Prenda sin registrar» se vende sin stock y espera en su cola; al regularizarla, la línea pasa a la
   -- prenda real con su salida. Mientras espera (pendiente) o si se cerró sin prenda al cerrar la cola de arranque de su sede, no tiene salida a
   -- propósito. Una línea sin salida que NO está en esa cola sí es violación. (Visto el 2026-11-09 por el vigía de producción,
   -- ADR-0632: eran 1.280 falsos positivos, 1.233 cerradas sin prenda y 47 pendientes; la base local no tiene ninguna.)
   and not (coalesce(m.t, 0) = 0
            and exists (select 1 from retail.prendas_por_regularizar pr
                         where pr.venta_item_id = i.id and pr.estado in ('pendiente', 'cerrada_sin_prenda')))$inv$),
  ('INV-04', 'venta_en_su_caja_y_su_hora', 1, 'cruzada', array['venta_id']::text[], false, true,
   $txt$Toda venta cae en una caja de SU sede y dentro del tiempo en que esa caja estuvo abierta: nunca en la de otra sede ni en el día de ayer, ya contado y depositado.$txt$,
   $inv$select v.id as venta_id, v.caja_id, v.ubicacion_id as sede_venta, c.ubicacion_id as sede_caja, v.created_at, c.abierta_en, c.cerrada_en
  from retail.ventas v
  left join retail.cajas c on c.id = v.caja_id
 where not coalesce(v.es_prueba, false)
   and (v.caja_id is null
        or c.ubicacion_id <> v.ubicacion_id
        or v.created_at < c.abierta_en - interval '2 seconds'
        or (c.cerrada_en is not null and v.created_at > c.cerrada_en + interval '2 seconds'))$inv$),
  ('INV-05', 'caja_cerrada_cuadra_su_diferencia', 1, 'cruzada', array['caja_id']::text[], false, true,
   $txt$Una caja cerrada tiene fecha de cierre y monto contado, una abierta no tiene ninguno, y la diferencia es exactamente lo contado menos lo que el sistema esperaba.$txt$,
   $inv$select id as caja_id, ubicacion_id, estado, cerrada_en, monto_cierre_sistema, monto_cierre_real, diferencia
  from retail.cajas
 where (estado = 'cerrada' and (cerrada_en is null or monto_cierre_real is null))
    or (estado = 'abierta' and (cerrada_en is not null or monto_cierre_real is not null))
    or (estado = 'cerrada' and monto_cierre_real is not null and monto_cierre_sistema is not null
        and abs(coalesce(diferencia, 0) - (monto_cierre_real - monto_cierre_sistema)) > 0.011)$inv$),
  ('INV-06', 'un_comprobante_por_venta', 1, 'cruzada', array['venta_id']::text[], false, true,
   $txt$Una venta tiene a lo sumo un comprobante vivo (boleta o factura): dos significa que se cobró y se facturó dos veces. Los anulados y rechazados no cuentan; los anticipos de un apartado tampoco.$txt$,
   $inv$select venta_id, count(*) as comprobantes, array_agg(serie || '-' || numero order by numero) as numeros
  from retail.comprobantes
 where venta_id is not null and tipo in ('boleta', 'factura')
   and estado not in ('anulado', 'rechazado') and not coalesce(es_anticipo, false)
 group by venta_id having count(*) > 1$inv$),
  ('INV-07', 'comprobante_suma_lo_que_la_venta', 1, 'cruzada', array['comprobante_id']::text[], false, true,
   $txt$El total de la boleta o factura es el de la venta que la originó: lo que SUNAT recibe es lo que la clienta pagó.$txt$,
   $inv$select c.id as comprobante_id, c.venta_id, c.serie || '-' || c.numero as numero, c.total as comprobante, round(i.t, 2) as venta
  from retail.comprobantes c
  join (select venta_id, sum(subtotal) as t from retail.venta_items group by 1) i on i.venta_id = c.venta_id
 where c.tipo in ('boleta', 'factura') and c.estado not in ('anulado', 'rechazado')
   and not coalesce(c.es_anticipo, false) and coalesce(c.anticipo_deducido, 0) = 0
   and abs(c.total - i.t) > 0.011$inv$),
  ('INV-08', 'lo_que_entra_por_un_traslado_salio_de_alguna_sede', 1, 'cruzada', array['transferencia_id', 'variante_id']::text[], false, true,
   $txt$Por un traslado no puede entrar a una sede más de una prenda que la que salió por él: sería stock que apareció sin salir de ninguna parte.$txt$,
   $inv$with entro as (
  select tr.transferencia_id, m.variante_id, sum(m.cantidad) as q
    from retail.movimientos m join retail.transferencia_recepciones tr on tr.id = m.transferencia_recepcion_id
   where m.tipo = 'entrada'
   group by 1, 2
), salio as (
  select coalesce(ti.transferencia_id, trs.transferencia_id) as transferencia_id, m.variante_id, sum(m.cantidad) as q
    from retail.movimientos m
    left join retail.transferencia_items ti on ti.id = m.transferencia_item_id
    left join retail.transferencia_recepciones trs on trs.id = m.transferencia_recepcion_id
   where m.tipo = 'salida' and coalesce(ti.transferencia_id, trs.transferencia_id) is not null
   group by 1, 2
)
select e.transferencia_id, e.variante_id, coalesce(s.q, 0) as salio, e.q as entro
  from entro e left join salio s on s.transferencia_id = e.transferencia_id and s.variante_id = e.variante_id
 where e.q > coalesce(s.q, 0)$inv$),
  ('INV-09', 'asientos_cuadran', 1, 'cruzada', array['asiento']::text[], true, true,
   $txt$El libro cuadra: ningún asiento tiene Σdebe distinto de Σhaber (usa `retail.fn_asientos_descuadrados`, la misma función que Finanzas).$txt$,
   $inv$select asiento, regla, fecha, debe, haber, diferencia from retail.fn_asientos_descuadrados(date '2000-01-01', date '2100-01-01')$inv$),
  ('INV-10', 'movimiento_con_responsable', 2, 'cruzada', array['movimiento_id']::text[], false, true,
   $txt$Todo movimiento de stock lo firma una persona (`usuario_id`): un movimiento sin autor no se puede explicar en el conteo del mes.$txt$,
   $inv$select id as movimiento_id, tipo, variante_id, ubicacion_id, cantidad, created_at
  from retail.movimientos where usuario_id is null$inv$),
  ('INV-11', 'sospecha_de_doble_cobro', 2, 'sospecha', array['venta_a', 'venta_b']::text[], false, false,
   $txt$SOSPECHA (se confirma mirando): dos ventas de la misma sede y persona, con las mismas prendas, a menos de 10 segundos y con tokens distintos: el patrón de un doble clic que se coló.$txt$,
   $inv$with firma as (
  select v.id, v.ubicacion_id, v.usuario_id, v.created_at,
         (select string_agg(i.variante_id::text || ':' || i.cantidad, ',' order by i.variante_id, i.cantidad)
            from retail.venta_items i where i.venta_id = v.id) as prendas
    from retail.ventas v where v.estado = 'completada'
)
select a.id as venta_a, b.id as venta_b, a.ubicacion_id, round(extract(epoch from b.created_at - a.created_at)::numeric, 1) as segundos
  from firma a
  join firma b on b.ubicacion_id = a.ubicacion_id and b.usuario_id is not distinct from a.usuario_id
              and b.id <> a.id and b.created_at >= a.created_at and b.created_at - a.created_at < interval '10 seconds'
              and b.prendas = a.prendas and (b.created_at > a.created_at or b.id > a.id)$inv$),
  ('INV-12', 'sospecha_de_movimiento_repetido', 2, 'sospecha', array['movimiento_a', 'movimiento_b']::text[], false, false,
   $txt$SOSPECHA (se confirma mirando): dos movimientos idénticos (misma prenda, sede, tipo, cantidad y persona) a menos de 2 segundos y sin venta: el patrón de un «Guardar» pulsado dos veces en Ajustar, Recibir o Traslado.$txt$,
   $inv$select a.id as movimiento_a, b.id as movimiento_b, a.tipo, a.variante_id, a.cantidad, a.ubicacion_id,
       round(extract(epoch from b.created_at - a.created_at)::numeric, 2) as segundos
  from retail.movimientos a
  join retail.movimientos b on b.id <> a.id and b.variante_id = a.variante_id and b.ubicacion_id = a.ubicacion_id
                           and b.sububicacion_id is not distinct from a.sububicacion_id and b.tipo = a.tipo
                           and b.cantidad = a.cantidad and b.usuario_id is not distinct from a.usuario_id
                           and b.created_at >= a.created_at and b.created_at - a.created_at < interval '2 seconds'
                           and (b.created_at > a.created_at or b.id > a.id)
 where a.venta_item_id is null and b.venta_item_id is null
   and a.transferencia_item_id is null and a.compra_item_id is null and a.produccion_id is null$inv$),
  ('INV-13', 'pieza_de_liquidacion_cuadra', 1, 'cruzada', array['pieza_id']::text[], false, true,
   $txt$Una pieza de liquidación (ADR-0379) a la venta tiene UNA etiqueta que la caja acepta, y una vendida apunta a una línea de una venta completada, de una sola unidad, cobrada al precio de su etiqueta: nunca vendida dos veces, ni vendida en una venta anulada, ni a otro precio.$txt$,
   $inv$select p.id as pieza_id, p.estado, p.precio, vi.precio_unitario, vi.cantidad, v.estado as venta_estado,
       (select count(*) from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente) as vigentes
  from retail.piezas_liquidacion p
  left join retail.venta_items vi on vi.id = p.venta_item_id
  left join retail.ventas v on v.id = vi.venta_id
 where (p.estado = 'disponible' and (select count(*) from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente) <> 1)
    or (p.estado = 'vendida' and (v.estado is distinct from 'completada' or vi.cantidad <> 1 or vi.precio_unitario <> p.precio
                                  or vi.descuento_unitario <> 0))
    or (p.estado <> 'disponible' and exists (select 1 from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente and p.estado = 'retirada'))$inv$),
  ('INV-14', 'compra_anulada_sin_mercaderia', 1, 'cruzada', array['compra_id']::text[], false, true,
   $txt$Una factura de proveedor anulada no tiene mercadería ingresada: `anular_compra` lo prohíbe («dejaría stock o dinero sin respaldo»). Si la tiene, hay prendas en el stock que ya no le deben nada a nadie. Nació de /chaos 2026-10-13 (recibir y anular a la vez: las dos pasaban).$txt$,
   $inv$select c.id as compra_id, c.serie || '-' || c.numero as factura, sum(m.cantidad) as unidades_ingresadas
  from retail.compras c
  join retail.compra_items ci on ci.compra_id = c.id
  join retail.movimientos m on m.compra_item_id = ci.id
 where c.estado = 'anulada'
 group by c.id, c.serie, c.numero$inv$),
  ('INV-15', 'caja_abierta_con_efectivo', 1, 'cruzada', array['caja_id']::text[], false, true,
   $txt$Una caja abierta nunca espera menos de cero en el cajón: no se puede sacar plata que no está (egresos, reembolsos, vueltos de un cambio, ventas anuladas). Se calcula con `fn_calcular_esperado_caja`, la misma cuenta que usa `cerrar_caja`. Nació de /chaos 2026-10-13.$txt$,
   $inv$select c.id as caja_id, c.ubicacion_id, e.esperado
  from retail.cajas c
  cross join lateral retail.fn_calcular_esperado_caja(c.id) e
 where c.estado = 'abierta' and e.esperado < 0$inv$),
  ('INV-16', 'montos_de_ventas_finitos', 1, 'cruzada', array['tabla', 'fila_id']::text[], false, true,
   $txt$Ningún monto de Ventas o de Caja es `NaN` ni infinito. En Postgres `'NaN'::numeric` es mayor que cualquier número y `'Infinity'` también existe: los dos pasan los CHECK `>= 0` y, una vez dentro, cualquier suma que los toque (el esperado de la caja, el total del día) se rompe. Nació de /chaos 2026-10-13.$txt$,
   $inv$select 'cajas' as tabla, id::text as fila_id, 'monto_apertura,monto_cierre_sistema,monto_cierre_real,diferencia,monto_fondo,monto_apertura_esperado,fondo_requerido' as columnas from retail.cajas where abs(monto_apertura) >= 'Infinity' or abs(monto_cierre_sistema) >= 'Infinity' or abs(monto_cierre_real) >= 'Infinity' or abs(diferencia) >= 'Infinity' or abs(monto_fondo) >= 'Infinity' or abs(monto_apertura_esperado) >= 'Infinity' or abs(fondo_requerido) >= 'Infinity'
union all
select 'caja_movimientos' as tabla, id::text as fila_id, 'monto' as columnas from retail.caja_movimientos where abs(monto) >= 'Infinity'
union all
select 'caja_traslados' as tabla, id::text as fila_id, 'monto' as columnas from retail.caja_traslados where abs(monto) >= 'Infinity'
union all
select 'venta_pagos' as tabla, id::text as fila_id, 'monto,recibido' as columnas from retail.venta_pagos where abs(monto) >= 'Infinity' or abs(recibido) >= 'Infinity'
union all
select 'venta_items' as tabla, id::text as fila_id, 'precio_unitario,descuento_unitario,costo_unitario,descuento_club_unitario' as columnas from retail.venta_items where abs(precio_unitario) >= 'Infinity' or abs(descuento_unitario) >= 'Infinity' or abs(costo_unitario) >= 'Infinity' or abs(descuento_club_unitario) >= 'Infinity'
union all
select 'ventas' as tabla, id::text as fila_id, 'descuento_pct' as columnas from retail.ventas where abs(descuento_pct) >= 'Infinity'
union all
select 'cambios' as tabla, id::text as fila_id, 'diferencia' as columnas from retail.cambios where abs(diferencia) >= 'Infinity'
union all
select 'devoluciones' as tabla, id::text as fila_id, 'reembolso_monto' as columnas from retail.devoluciones where abs(reembolso_monto) >= 'Infinity'
union all
select 'separaciones' as tabla, id::text as fila_id, 'total,adelanto' as columnas from retail.separaciones where abs(total) >= 'Infinity' or abs(adelanto) >= 'Infinity'
union all
select 'separacion_items' as tabla, id::text as fila_id, 'precio_unitario,descuento_unitario' as columnas from retail.separacion_items where abs(precio_unitario) >= 'Infinity' or abs(descuento_unitario) >= 'Infinity'
union all
select 'separacion_pagos' as tabla, id::text as fila_id, 'monto,recibido' as columnas from retail.separacion_pagos where abs(monto) >= 'Infinity' or abs(recibido) >= 'Infinity'
union all
select 'separacion_abonos' as tabla, id::text as fila_id, 'monto' as columnas from retail.separacion_abonos where abs(monto) >= 'Infinity'
union all
select 'separacion_ediciones' as tabla, id::text as fila_id, 'total_antes,total_despues' as columnas from retail.separacion_ediciones where abs(total_antes) >= 'Infinity' or abs(total_despues) >= 'Infinity'
union all
select 'comprobantes' as tabla, id::text as fila_id, 'subtotal,igv,total,anticipo_deducido' as columnas from retail.comprobantes where abs(subtotal) >= 'Infinity' or abs(igv) >= 'Infinity' or abs(total) >= 'Infinity' or abs(anticipo_deducido) >= 'Infinity'
union all
select 'proformas' as tabla, id::text as fila_id, 'subtotal,igv,total' as columnas from retail.proformas where abs(subtotal) >= 'Infinity' or abs(igv) >= 'Infinity' or abs(total) >= 'Infinity'$inv$),
  ('INV-17', 'montos_de_plata_finitos', 1, 'cruzada', array['tabla', 'fila_id']::text[], false, true,
   $txt$Ningún monto de la plata de Finanzas o de un fondo (movimientos de dinero, gastos, pagos a proveedores, el reparto de un gasto del viaje, las rendiciones) es `NaN` ni infinito. Un NaN pasa el CHECK `> 0` y, una vez dentro, deja en NaN el saldo del fondo, la caja de origen y el Diario. Nació de /chaos 2026-10-14 (fase 6).$txt$,
   $inv$select 'movimientos_dinero' as tabla, id::text as fila_id, 'monto,comision' as columnas from retail.movimientos_dinero where abs(monto) >= 'Infinity' or abs(comision) >= 'Infinity'
union all
select 'gastos' as tabla, id::text as fila_id, 'monto_total,igv' as columnas from retail.gastos where abs(monto_total) >= 'Infinity' or abs(igv) >= 'Infinity'
union all
select 'compra_pagos' as tabla, id::text as fila_id, 'monto' as columnas from retail.compra_pagos where abs(monto) >= 'Infinity'
union all
select 'gastos_viaje_ordenes' as tabla, gasto_id::text as fila_id, 'monto' as columnas from retail.gastos_viaje_ordenes where abs(monto) >= 'Infinity'
union all
select 'rendiciones_fondo' as tabla, id::text as fila_id, 'arrastre,entregado,devuelto,pagado,gastos,otros,saldo,efectivo,faltante' as columnas from retail.rendiciones_fondo where abs(arrastre) >= 'Infinity' or abs(entregado) >= 'Infinity' or abs(devuelto) >= 'Infinity' or abs(pagado) >= 'Infinity' or abs(gastos) >= 'Infinity' or abs(otros) >= 'Infinity' or abs(saldo) >= 'Infinity' or abs(efectivo) >= 'Infinity' or abs(faltante) >= 'Infinity'
union all
select 'rendicion_fondo_items' as tabla, rendicion_id || ':' || clave::text as fila_id, 'monto' as columnas from retail.rendicion_fondo_items where abs(monto) >= 'Infinity'$inv$),
  ('INV-18', 'pedido_web_cuadra_con_su_venta', 1, 'cruzada', array['pedido_id', 'problema']::text[], false, true,
   $txt$Un pedido web pagado o entregado tiene UNA venta (ADR-0408 act. 10): una línea de venta por prenda no quitada, cobrada con un solo «anticipo» por el total, con su boleta; y cada prenda sale del stock al entregarse, nunca antes (una salida por prenda entregada, ninguna por la que todavía espera). Un pedido sin pagar no tiene venta. Uno anulado DESPUÉS de pagarse (20261015114000) conserva su venta, ANULADA entera, se le devolvió todo y su boleta no quedó viva ante SUNAT sin su nota de crédito.$txt$,
   $inv$select w.id as pedido_id, w.codigo, w.estado, 'venta' as problema
  from retail.pedidos_web w
 where (w.estado in ('pagado', 'entregado') or (w.estado = 'anulado' and w.pagado_en is not null)) <> (w.venta_id is not null)
union all
select w.id, w.codigo, w.estado, 'lineas'
  from retail.pedidos_web w
 where w.venta_id is not null
   and (exists (select 1 from retail.pedido_web_lineas l
                 where l.pedido_id = w.id and l.estado <> 'quitada'
                   and not exists (select 1 from retail.venta_items vi
                                    where vi.id = l.venta_item_id and vi.venta_id = w.venta_id and vi.variante_id = l.variante_id
                                      and vi.cantidad = 1 and vi.precio_unitario = l.precio_lista and vi.descuento_unitario = l.descuento))
        or exists (select 1 from retail.venta_items vi where vi.venta_id = w.venta_id
                    and not exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = w.id and l.venta_item_id = vi.id)))
union all
select w.id, w.codigo, w.estado, 'cobro'
  from retail.pedidos_web w
 where w.venta_id is not null
   and coalesce((select string_agg(vp.metodo || ':' || vp.monto, ',') from retail.venta_pagos vp where vp.venta_id = w.venta_id), '')
       <> 'anticipo:' || w.total
union all
select w.id, w.codigo, w.estado, 'boleta'
  from retail.pedidos_web w
 where w.venta_id is not null
   and not exists (select 1 from retail.comprobantes c where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura'))
union all
select w.id, w.codigo, w.estado, 'salida'
  from retail.pedidos_web w
  join retail.pedido_web_lineas l on l.pedido_id = w.id and l.venta_item_id is not null
 where coalesce((select sum(m.cantidad) from retail.movimientos m where m.venta_item_id = l.venta_item_id and m.tipo = 'salida'), 0)
       <> case when l.estado = 'entregada' then 1 else 0 end
union all
select w.id, w.codigo, w.estado, 'entrega'
  from retail.pedidos_web w
 where w.estado = 'entregado'
   and exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = w.id and l.estado not in ('quitada', 'entregada'))
union all
-- Anulado después de pagarse: su venta anulada entera (cada línea con su anulación), nada sin devolver y la boleta sin quedar viva.
select w.id, w.codigo, w.estado, 'anulacion'
  from retail.pedidos_web w
  join retail.ventas v on v.id = w.venta_id
 where w.estado = 'anulado' and w.pagado_en is not null
   and (v.estado <> 'anulada' or w.pagado <> 0
        or exists (select 1 from retail.venta_items vi where vi.venta_id = v.id
                    and not exists (select 1 from retail.venta_anulacion_items ai where ai.venta_item_id = vi.id))
        or exists (select 1 from retail.comprobantes c where c.venta_id = v.id and c.tipo in ('boleta', 'factura')
                    and (c.estado in ('pendiente', 'pendiente_reintento', 'enviado')
                         or (c.estado = 'aceptado' and not exists (select 1 from retail.comprobantes n
                                                                   where n.comprobante_original_id = c.id and n.tipo = 'nota_credito')))))$inv$),
  ('INV-19', 'la_plata_de_nos_debe_cuadra', 1, 'cruzada', array['fila_id', 'problema']::text[], false, true,
   $txt$La plata de «Nos debe» (ADR-0362, fase 5b) cuadra entre tablas: el documento interno por lo que no llegó cierra sus prendas en el comprobante y el de lo devuelto por llegar dañado no cierra nada (sí llegaron), cada uno de la deuda que le corresponde; un «Depositó» devuelve exactamente lo que su documento dejó a favor (ni más ni menos: lo demás sería saldo a favor fantasma o un reembolso de más); y la nota de crédito del proveedor (07) dice lo mismo que los documentos internos que respalda, todos de su comprobante. Nació de /chaos 2026-10-15 (fase 5b).$txt$,
   $inv$select n.id::text as fila_id, n.serie_numero, 'documento_y_cierre' as problema
  from retail.compra_notas_credito n
 where n.interna
   and ((n.motivo = 'devolucion') <> (n.cierre_id is null)
        or exists (select 1 from retail.proveedor_deuda_resoluciones r join retail.despacho_diferencias x on x.id = r.diferencia_id
                    where r.nota_credito_id = n.id and (x.causa = 'devuelta') <> (n.motivo = 'devolucion')))
union all
select r.id::text, n.serie_numero, 'deposito'
  from retail.proveedor_deuda_resoluciones r
  join retail.compra_notas_credito n on n.id = r.nota_credito_id
 where r.forma = 'deposito'
   and coalesce((select sum(k.monto) from retail.proveedor_creditos k where k.nota_credito_id = n.id and k.tipo = 'reembolso'), 0)
       <> coalesce((select sum(k.monto) from retail.proveedor_creditos k where k.nota_credito_id = n.id and k.tipo = 'nota_credito'), 0)
union all
select p.id::text, p.serie_numero, 'nota_proveedor'
  from retail.compra_notas_proveedor p
  left join lateral (select sum(n.monto) as monto, sum(n.igv) as igv
                       from retail.compra_notas_proveedor_documentos d
                       join retail.compra_notas_credito n on n.id = d.nota_credito_id
                      where d.nota_proveedor_id = p.id) s on true
 where p.monto is distinct from s.monto or p.igv is distinct from s.igv
    or exists (select 1 from retail.compra_notas_proveedor_documentos d join retail.compra_notas_credito n on n.id = d.nota_credito_id
                where d.nota_proveedor_id = p.id and (not n.interna or n.compra_id <> p.compra_id))$inv$),
  ('INV-20', 'lo_devuelto_cuadra_con_su_prenda', 1, 'cruzada', array['diferencia_id', 'problema']::text[], false, true,
   $txt$Cada deuda «devuelta» (lo que se le devolvió al proveedor por llegar dañado, ADR-0362 fase 5b, actividad 6a) tiene su prenda de la cuarentena marcada «devuelta al proveedor» a ESE proveedor y por la misma cantidad, con su salida de la cuarentena sin `compra_item_id` (si lo llevara, el comprobante la contaría como recibida otra vez). Si no, la deuda cobra prendas que siguen en la cuarentena, o a otro proveedor. Nació de /chaos 2026-10-15 (fase 5b).$txt$,
   $inv$select x.id::text as diferencia_id, coalesce(pd.estado, 'sin prenda') as estado, 'prenda' as problema
  from retail.despacho_diferencias x
  left join retail.prendas_danadas pd on pd.id = x.prenda_danada_id
 where x.causa = 'devuelta'
   and (pd.id is null or pd.estado <> 'devuelta_proveedor' or pd.proveedor_id is distinct from x.proveedor_id or pd.cantidad <> x.cantidad
        or not exists (select 1 from retail.movimientos m
                        where m.id = pd.movimiento_salida_id and m.tipo = 'salida' and m.motivo = 'cuarentena_devuelta_proveedor'
                          and m.compra_item_id is null and m.cantidad = pd.cantidad))$inv$),
  ('INV-21', 'caja_cerrada_cuadra_su_fondo', 1, 'cruzada', array['caja_id']::text[], false, true,
   $txt$Una caja cerrada real cumple contado = fondo que deja + trasladado (ADR-0186: el fondo se calcula, nunca se escribe). Si no, el cajón de esa noche sale inflado o desinflado, la apertura del día siguiente «falta» o «sobra» contra un esperado que nunca existió, y el Diario lo asienta como pérdida. Nació de la auditoría de Finanzas 2026-10-16 (G01): un traslado regularizado a mano sin tocar el fondo dejó S/ 700 de falso faltante en Trujillo. Desde `20261016211000` un candado diferido lo impide; esta invariante vigila lo que ya estaba o lo que se cuele por una puerta nueva.$txt$,
   $inv$select c.id as caja_id, c.ubicacion_id, c.monto_cierre_real, c.monto_fondo,
       coalesce((select sum(t.monto) from retail.caja_traslados t where t.caja_id = c.id), 0) as trasladado
  from retail.cajas c
 where c.estado = 'cerrada' and not c.es_prueba and c.monto_fondo is not null and c.monto_cierre_real is not null
   and abs(c.monto_fondo + coalesce((select sum(t.monto) from retail.caja_traslados t where t.caja_id = c.id), 0) - c.monto_cierre_real) >= 0.005$inv$),
  ('INV-22', 'cambio_por_varias_cuadra', 1, 'cruzada', array['cambio_id']::text[], false, true,
   $txt$Un cambio de una prenda por VARIAS cuadra en las tres cosas que lo definen (ADR-0470): su diferencia es el valor de todo lo que se llevó menos lo que la clienta pagó por lo que devolvió; las unidades que salieron del piso son las que dice su lista de prendas; y las que volvieron son las que se devolvieron. Si no, la caja o la cuenta de Izipay cobraron una cifra y el stock movió otra. `registrar_cambio_varias` lo guarda todo junto; esto vigila lo que se cuele por otra puerta o un arreglo a mano. Nació del cambio del body por dos Top Rib (B005-000670, 2026-10-21), que se había registrado como un cambio uno por uno y una venta aparte.$txt$,
   $inv$select c.id as cambio_id, c.diferencia,
       round(sum(s.precio_unitario * s.cantidad) - (vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2) as diferencia_esperada,
       sum(s.cantidad) as unidades_anotadas,
       (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'salida') as unidades_que_salieron,
       c.cantidad as unidades_devueltas,
       (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'entrada') as unidades_que_volvieron
  from retail.cambios c
  join retail.venta_items vi on vi.id = c.venta_item_id
  join retail.cambio_salidas s on s.cambio_id = c.id
 group by c.id, c.diferencia, c.cantidad, vi.precio_unitario, vi.descuento_unitario
having c.diferencia <> round(sum(s.precio_unitario * s.cantidad) - (vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2)
    or sum(s.cantidad) <> (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'salida')
    or c.cantidad <> (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'entrada')$inv$),
  ('INV-23', 'stock_por_dueno_cuadra', 1, 'cruzada', array['variante_id', 'ubicacion_id', 'sububicacion_id', 'motivo']::text[], false, true,
   $txt$En una sede donde operan dos empresas (Lima), lo de CLAURE (`stock_dueno`) nunca pasa del stock de su fila, ni lo apartado de lo apartado, y no hay reparto por dueño donde operan una sola empresa (ADR-0542: CAYLA es el resto, así que este es el único descuadre posible).$txt$,
   $inv$select variante_id, ubicacion_id, sububicacion_id, motivo from retail.fn_stock_dueno_descuadres()$inv$),
  ('INV-24', 'copias_del_color_iguales_a_su_tela', 2, 'cruzada', array['insumo_id']::text[], false, true,
   $txt$Cada color de una tela (un insumo con `material_id`, ADR-0554) es el reflejo de su tela: mismo tipo y unidad (una tela siempre en metros), mismo tejido, misma merma, el código «código de la tela-código del color» y un nombre que empieza por el de la ficha MÁS SU MEDIDA si la tiene (ADR-0580: el disparador compone «Botón nácar 18 L · Negro», y sin contar la medida esta invariante gritaba en cada avío y se volvía ciega para un descuadre de verdad). Si no, la orden pide una merma que la tela ya no tiene, el plan sugiere el tejido equivocado o dos colores de una misma tela se llaman distinto. Un disparador las copia en cada guardado; esto vigila lo que se cuele por un camino que lo salte (un arreglo a mano con los disparadores apagados, o una migración). El nombre se compara solo hasta el de la tela: el color puede haberse renombrado en Catálogo y el insumo no se entera hasta que se guarda su tela (se corrige guardándola desde «Editar tela»).$txt$,
   $inv$select i.id as insumo_id, i.codigo, i.nombre, m.codigo as tela_codigo, m.nombre as tela,
       i.tipo as tipo_del_color, m.tipo as tipo_de_la_tela, i.unidad_medida as unidad_del_color, m.unidad_medida as unidad_de_la_tela,
       i.tejido_id as tejido_del_color, m.tejido_id as tejido_de_la_tela, i.merma_pct as merma_del_color, m.merma_pct as merma_de_la_tela
  from retail.insumos i
  join retail.materiales m on m.id = i.material_id
 where i.tipo is distinct from m.tipo
    or i.unidad_medida is distinct from m.unidad_medida
    or i.tejido_id is distinct from m.tejido_id
    or i.merma_pct is distinct from m.merma_pct
    or i.codigo is distinct from m.codigo || coalesce('-' || i.color_codigo, '')
    or not (i.nombre = m.nombre
         or i.nombre = m.nombre || coalesce(' ' || retail.fn_medida_texto(m.medida_valor, m.medida_unidad), '')
         or starts_with(i.nombre, m.nombre || coalesce(' ' || retail.fn_medida_texto(m.medida_valor, m.medida_unidad), '') || ' · '))$inv$),
  ('INV-25', 'color_retirado_sin_tela_guardada', 1, 'cruzada', array['insumo_id', 'ubicacion_id', 'motivo']::text[], false, true,
   $txt$Un color de tela retirado (`archivado_at`, «Retirar color», ADR-0554) no guarda tela: ni saldo distinto de cero en ninguna sede, ni un lote que haya entrado DESPUÉS de retirarlo. Si lo tuviera, serían metros que el libro de movimientos sigue contando (y suman al capital en insumos) pero que ninguna lista muestra: stock fantasma. `retirar_color_de_material` se niega con saldo y un disparador en `insumo_lotes` rechaza el ingreso a un retirado; esto vigila lo que se cuele por un camino que los salte (un arreglo a mano, una migración, una función nueva que escriba el libro sin pasar por el lote).$txt$,
   $inv$select i.id as insumo_id, i.codigo, i.archivado_at, s.ubicacion_id, s.fisico as cantidad, 'saldo' as motivo
  from retail.insumos i
  join retail.v_insumo_saldos s on s.insumo_id = i.id
 where i.material_id is not null and i.archivado_at is not null and s.fisico <> 0
union all
select i.id, i.codigo, i.archivado_at, l.ubicacion_id, l.cantidad_ingresada, 'lote_posterior'
  from retail.insumos i
  join retail.insumo_lotes l on l.insumo_id = i.id
 where i.material_id is not null and i.archivado_at is not null and l.created_at > i.archivado_at$inv$),
  ('INV-26', 'lote_de_insumo_cuadra_con_su_libro', 1, 'cruzada', array['lote_id']::text[], false, true,
   $txt$La cantidad de cada lote de insumo es lo que su `compra` y sus `ajuste` suman en el libro de movimientos (ADR-0570: corregir o eliminar un ingreso cambia el lote Y deja el par «deshago + anoto» en el libro). Si no coinciden, el saldo del color que muestra la orden (la suma del libro) y el que descuenta el PEPS (la cantidad del lote) dicen cosas distintas: tela que se ve y no se puede cortar, o tela que se corta y no se ve.$txt$,
   $inv$select l.id as lote_id, l.insumo_id, l.ubicacion_id, l.cantidad_ingresada as cantidad_del_lote, coalesce(m.suma, 0) as suma_del_libro
  from retail.insumo_lotes l
  left join lateral (
    select sum(x.cantidad) as suma from retail.movimientos_insumo x where x.insumo_lote_id = l.id and x.tipo in ('compra', 'ajuste')
  ) m on true
 where l.cantidad_ingresada <> coalesce(m.suma, 0)$inv$),
  ('INV-27', 'compra_anulada_sin_pagos', 1, 'cruzada', array['compra_id']::text[], false, true,
   $txt$Una factura de proveedor anulada no tiene pagos: `anular_compra` lo prohíbe, porque la plata saldría del banco sin una deuda que la respalde (tarea 36 de «Las 36»).$txt$,
   $inv$select c.id as compra_id, c.serie || '-' || c.numero as factura, sum(p.monto) as pagado
  from retail.compras c
  join retail.compra_pagos p on p.compra_id = c.id
 where c.estado = 'anulada'
 group by c.id, c.serie, c.numero$inv$),
  ('INV-28', 'compra_pagado_igual_a_sus_pagos', 1, 'cruzada', array['compra_id']::text[], false, true,
   $txt$Lo que una factura vigente dice que tiene pagado es la suma de sus pagos. Si no, Por pagar y el banco cuentan dos historias de la misma deuda (tarea 36 de «Las 36»).$txt$,
   $inv$select c.id as compra_id, c.serie || '-' || c.numero as factura, c.pagado, coalesce(sum(p.monto), 0) as suma_pagos
  from retail.compras c
  left join retail.compra_pagos p on p.compra_id = c.id
 where c.estado = 'vigente'
 group by c.id, c.serie, c.numero, c.pagado
having c.pagado <> coalesce(sum(p.monto), 0)$inv$),
  ('INV-29', 'foto_del_diario_igual_al_vivo', 2, 'cruzada', array['mes']::text[], false, true,
   $txt$La foto de un mes que el diario da por vigente es el diario de ese mes armado en vivo (ADR-0633). Si no, alguna tabla que alimenta el diario cambió sin vencer la foto (hay que sumarla a la vigilancia) o alguien tocó una línea de la foto.$txt$,
   $inv$select mes, guardada, viva from retail.fn_fotos_del_diario_distintas()$inv$),
  ('INV-30', 'papeles_del_cambio_cuadran', 1, 'cruzada', array['cambio_id']::text[], false, true,
   $txt$Los papeles de un cambio de prenda (ADR-0672) declaran lo que se movió en la caja: la boleta nueva menos la nota de crédito es la diferencia del cambio, y ninguno tiene venta (si la tuviera, la caja o Ventas la contarían otra vez). Si no, SUNAT recibe una cifra y el cajón otra. `fn_emitir_comprobantes_del_cambio` lo exige al guardar; esto vigila un arreglo a mano o una puerta nueva. Lee `cambio_id` con `to_jsonb` para no fallar en una base que todavía no tiene la columna.$txt$,
   $inv$select c.id as cambio_id, c.diferencia,
       round(sum(case when p.tipo = 'nota_credito' then -p.total else p.total end), 2) as boleta_menos_nota,
       count(*) filter (where p.venta_id is not null) as papeles_con_venta
  from retail.comprobantes p
  join retail.cambios c on c.id = (to_jsonb(p) ->> 'cambio_id')::uuid
 where p.estado not in ('rechazado', 'anulado', 'no_emitido')
 group by c.id, c.diferencia
having round(sum(case when p.tipo = 'nota_credito' then -p.total else p.total end), 2) <> round(c.diferencia, 2)
    or count(*) filter (where p.venta_id is not null) > 0$inv$)
on conflict (id) do update set
  nombre = excluded.nombre, gravedad = excluded.gravedad, nivel = excluded.nivel, dice = excluded.dice,
  requiere_sesion = excluded.requiere_sesion, sql = excluded.sql, clave = excluded.clave,
  linea_base_en = case when retail.invariantes.sql is distinct from excluded.sql
                         or retail.invariantes.clave is distinct from excluded.clave
                       then null else retail.invariantes.linea_base_en end;
-- <<< fin de la siembra generada
