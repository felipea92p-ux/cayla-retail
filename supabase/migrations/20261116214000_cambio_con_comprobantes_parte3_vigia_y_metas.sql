-- ============================================================================
-- 20261116214000 — Un cambio con diferencia emite sus documentos · PARTE 3 de 3: el vigía y la fuente de las metas (ADR-0671)
--
-- EL PROBLEMA. Las partes 1 y 2 hacen que un cambio con diferencia emita su comprobante nuevo (colgado del cambio, sin venta) y su nota de
--   crédito sobre la original. Quedan dos huecos:
--   · Nadie mira que esos documentos cuadren. INV-06 e INV-07 vigilan por `venta_id`, y estos documentos cuelgan de `cambio_id`: si el
--     comprobante nuevo suma de más, si la nota se queda esperando para siempre o si SUNAT acepta uno y rechaza el otro, el IGV del mes sale
--     de más o de menos en silencio.
--   · Felipe decidió las metas (decisión 7): si la prenda nueva es más cara, la diferencia la suma quien atendió el cambio; si es más
--     barata, se le resta a quien hizo la venta original; la venta original no se toca. Y sin diferencia, nada (decisión 1). No existe
--     ninguna función que lo diga, y repetirlo en cada uno de los ocho lectores de Rendimiento, Metas e Inicio haría ocho reglas que se separan.
--
-- LO QUE HACE (nada de lo que ya existe cambia de cuerpo):
--   1. `fn_diferencias_de_cambio(desde, hasta, sedes)` → (persona_id, ubicacion_id, dia, monto): la ÚNICA fuente de lo que un cambio le
--      suma o le resta a una persona. Solo lee. Interna (sin permiso para nadie): la leerán los lectores de metas, que son security definer.
--      · Desde el corte: cambios con `created_at >= fn_cambios_con_documentos_desde()` (como subconsulta: corre una vez, no una por cambio).
--        Antes del corte (o si la base todavía no emitió ningún documento de un cambio), nada: los meses ya vistos no se reescriben
--        (decisión 8). Sin ventas de prueba. Día de Lima del cambio. Solo cambios con diferencia: sin diferencia, nada (decisión 1).
--      · Diferencia positiva → quien atendió el cambio (`cambios.usuario_id`), en la sede del cambio. Negativa → la asesora de la venta
--        original (`ventas.asesora_id`, la MISMA persona a la que Rendimiento, Metas y «Mis ventas» le contaron esa venta), en la sede de la
--        VENTA: así la resta cae en la misma meta que la sumó. Una venta sin asesora no se le contó a nadie: su resta queda sin persona
--        (`persona_id` null), y cuenta solo para la sede. PROVISIONAL, pendiente de Felipe: el Observatorio sí le cuenta esa venta a quien la
--        registró (`coalesce(asesora_id, usuario_id)`).
--      · El monto nunca pasa de la diferencia ni va en sentido contrario (la venta original no se toca), y lo de CLAURE no suma a CAYLA
--        (ADR-0560, decisión 7). Lo que el cambio movió de la cifra de CAYLA es «lo nuevo que es de CAYLA − lo devuelto si era de CAYLA»
--        (las mismas preguntas de dueño que ya existen: `fn_item_es_de_claure` para la línea devuelta y `movimientos.empresa_id` con
--        `fn_movimiento_es_de_claure` para cada salida). La fuente cuenta esa cifra solo hasta la diferencia y solo en su sentido:
--          positiva: least(diferencia, greatest(0, lo de CAYLA))    negativa: diferencia si lo devuelto era de CAYLA; si no, 0
--        Fuera de una sede de CLAURE (o antes de su arranque) lo de CAYLA ES la diferencia, y el monto también. Cada salida se valora con lo
--        que se cobró por ella en el comprobante nuevo (las unidades del mismo modelo, con su descuento: ADR-0655), no con el precio de
--        lista de `cambio_salidas`. PROVISIONAL, pendiente de Felipe: con dos dueños, devolver una de CAYLA y llevarse una de CLAURE más cara
--        no le suma ni le resta a nadie; la plata sí sigue a la prenda en la deuda y en el Diario (ADR-0560, decisión 4).
--   2. INV-30 en el vigía (`cambio_con_diferencia_tiene_sus_documentos`, gravedad 1): desde el mismo corte, cada cambio con diferencia de
--      una venta que no es de prueba tiene su comprobante nuevo vivo (uno rechazado tiene un día para corregirse); nuevo − lo pagado =
--      diferencia; la nota (emitida o por emitir) es lo pagado; si la original es una boleta o factura viva, la nota existe o está por
--      emitir; el par no queda roto (uno aceptado y el otro rechazado, anulado o liberado); una nota por emitir no lleva más de un día
--      esperando a una original aceptada, ni espera a una que ya no se puede aceptar; y una nota ya emitida no queda sobre una original
--      anulada, liberada o con la baja en trámite (la carrera R3 de /chaos, 2026-11-16).
--      INV-30 nace con su línea base puesta (paso 3): tiene su propio corte, así que no hay un «antes» que heredar, y lo que ya esté roto el
--      día que se pegue (la primera nota 07 que SUNAT rechace, ADR-0671 «SE ROMPE SI») tiene que avisar como NUEVO desde la primera corrida.
--   3. INV-22 (`cambio_por_varias_cuadra`) deja de comparar la diferencia cuando lo que se llevó trae el MISMO modelo que lo devuelto: esas
--      unidades conservan su descuento (ADR-0655) y `cambio_salidas` guarda el precio de lista, así que cada cambio así era un falso positivo
--      de gravedad 1. Las unidades se siguen comparando; con diferencia, lo cuadra INV-30 contra el comprobante nuevo. Su consulta cambia,
--      así que arma su línea base de nuevo en la próxima corrida (como toda siembra que cambia una consulta).
--   Es la siembra completa regenerada desde `scripts/chaos/invariantes.mjs` (las otras 28 quedan igual).
--
-- QUÉ NO HACE. No conecta todavía ningún lector de metas a la fuente (Rendimiento, Metas, Inicio, Observatorio): eso cambia cifras que la
--   gente ya mira y lo decide Felipe (ADR-0671). No toca INV-06 ni INV-07.
-- SE ROMPE SI: la emisión nunca deja su primer documento (la parte 2 sin pegar, o rota): sin corte, la fuente y el vigía callan (lo cubre
--   `pnpm pruebas:cambio-con-comprobantes`). Una siembra vieja pegada después no borra INV-30 (no la nombra), pero le devuelve a INV-22 su
--   consulta de antes, con el falso positivo del mismo modelo.
-- CÓMO SE PEGA. Es un cambio de esquema en producción: con el OK de Felipe, en UNA sola ejecución, DESPUÉS de las partes 1 y 2 y en la misma
--   sesión que la 2 (lo que se rompa entre las dos no tendría vigía). Si la parte 2 no está, se detiene sin aplicar nada: la fuente nombra
--   sus funciones. Sin políticas, sin disparadores y sin `alter` de tablas en uso (ADR-0195). Idempotente. `lock_timeout` 3 s.
-- PRUEBA. `pnpm pruebas:cambio-con-comprobantes-vigia`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. La fuente de las metas ----------

create or replace function retail.fn_diferencias_de_cambio(p_desde date, p_hasta date, p_ubics uuid[])
returns table(persona_id uuid, ubicacion_id uuid, dia date, monto numeric)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  with cb as (
    -- Cada cambio con diferencia desde el corte, sin ventas de prueba: lo pagado por lo devuelto (a), la diferencia (d) y si lo devuelto era
    -- de CLAURE, con la MISMA pregunta con la que las metas sacaron esa línea de la cifra de su asesora.
    select c.id as cambio_id, c.created_at, c.diferencia as d,
           (c.created_at at time zone 'America/Lima')::date as dia_lima,
           c.usuario_id as atendio, c.ubicacion_id as sede_cambio,
           v.asesora_id as vendio, v.ubicacion_id as sede_venta,
           round((vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2) as a,
           retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at) as vieja_es_claure
      from retail.cambios c
      join retail.venta_items vi on vi.id = c.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
     where c.created_at >= (select retail.fn_cambios_con_documentos_desde())
       and c.diferencia <> 0
       and (c.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
       and not v.es_prueba
  ),
  nueva as (
    -- Qué parte de lo que se llevó es de CLAURE (solo importa si se cobró de más): el dueño de cada salida, valorada con lo que se cobró
    -- por ella en el comprobante nuevo (en un cambio por varias, las unidades del mismo modelo van con su descuento, ADR-0655). Sin
    -- comprobante (un cambio roto, que INV-30 muestra), su precio en `cambio_salidas`; en uno por uno todas las unidades son la misma
    -- prenda, así que la parte se cuenta por unidades. Fuera de una sede de CLAURE, nada.
    select b.cambio_id,
           sum(m.cantidad * coalesce(cv.unidad, s.precio_unitario, 1))
             filter (where retail.fn_movimiento_es_de_claure(m.empresa_id, b.sede_cambio, b.created_at))
             / nullif(sum(m.cantidad * coalesce(cv.unidad, s.precio_unitario, 1)), 0) as parte_claure
      from cb b
      join retail.movimientos m on m.cambio_id = b.cambio_id and m.tipo = 'salida'
      left join lateral (
        select sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::numeric)
               / nullif(sum((e ->> 'cantidad')::numeric), 0) as unidad
          from retail.comprobantes x
         cross join lateral jsonb_array_elements(case when jsonb_typeof(x.items) = 'array' then x.items else '[]'::jsonb end) e
         where x.cambio_id = b.cambio_id and x.tipo <> 'nota_credito'
           and e ->> 'variante_id' = m.variante_id::text
      ) cv on true
      left join lateral (select x.precio_unitario from retail.cambio_salidas x
                          where x.cambio_id = b.cambio_id and x.variante_id = m.variante_id limit 1) s on true
     where b.d > 0
     group by b.cambio_id
  ),
  parte as (
    -- Lo que el cambio le suma o le resta a una persona: la diferencia, contada solo en lo que movió de la cifra de CAYLA (sin CLAURE, la
    -- diferencia tal cual). Positiva → quien atendió, en la sede del cambio. Negativa → la asesora de la venta, en la sede de la venta.
    select case when b.d > 0 then b.atendio else b.vendio end as a_quien,
           case when b.d > 0 then b.sede_cambio else b.sede_venta end as en_sede,
           b.dia_lima,
           case when b.d > 0
                then least(b.d, greatest(0, round((b.a + b.d) * (1 - coalesce(n.parte_claure, 0))
                                                  - case when b.vieja_es_claure then 0 else b.a end, 2)))
                else case when b.vieja_es_claure then 0 else b.d end
           end as m
      from cb b
      left join nueva n on n.cambio_id = b.cambio_id
  )
  select p.a_quien, p.en_sede, p.dia_lima, sum(p.m)
    from parte p
   where p.m <> 0
     and (p_ubics is null or p.en_sede = any (p_ubics))
   group by p.a_quien, p.en_sede, p.dia_lima
  having sum(p.m) <> 0;
$function$;

comment on function retail.fn_diferencias_de_cambio(date, date, uuid[]) is
  'ADR-0671 (decisiones 1 y 7): lo que cada cambio con diferencia desde el corte le suma a quien lo atendió (en la sede del cambio) o le resta a la asesora de la venta original (en la sede de la venta; sin asesora, a nadie), por persona, sede y día de Lima. Nunca más que la diferencia ni en sentido contrario, y sin lo de CLAURE (ADR-0560). p_ubics null = todas las sedes. Interna: la leen los lectores de metas (security definer). Provisional en lo de CLAURE y en la venta sin asesora: lo decide Felipe al conectar los lectores.';

revoke all on function retail.fn_diferencias_de_cambio(date, date, uuid[]) from public, anon, authenticated, service_role;

-- ---------- 2. El vigía: INV-30 e INV-22 (la siembra completa, generada) ----------

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
   $txt$Un cambio de una prenda por VARIAS cuadra en las tres cosas que lo definen (ADR-0470): su diferencia es el valor de todo lo que se llevó menos lo que la clienta pagó por lo que devolvió; las unidades que salieron del piso son las que dice su lista de prendas; y las que volvieron son las que se devolvieron. Si no, la caja o la cuenta de Izipay cobraron una cifra y el stock movió otra. `registrar_cambio_varias` lo guarda todo junto; esto vigila lo que se cuele por otra puerta o un arreglo a mano. Nació del cambio del body por dos Top Rib (B005-000670, 2026-10-21), que se había registrado como un cambio uno por uno y una venta aparte. La diferencia solo se compara cuando nada de lo que se llevó es del MISMO modelo que lo devuelto: esas unidades conservan su descuento (ADR-0655) y la lista guarda su precio de lista, así que la cuenta no se puede rehacer desde aquí (un cambio así con diferencia lo cuadra INV-30 contra su comprobante nuevo).$txt$,
   $inv$select c.id as cambio_id, c.diferencia,
       round(sum(s.precio_unitario * s.cantidad) - (vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2) as diferencia_esperada,
       bool_or(vs.producto_id = vo.producto_id) as con_mismo_modelo,
       sum(s.cantidad) as unidades_anotadas,
       (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'salida') as unidades_que_salieron,
       c.cantidad as unidades_devueltas,
       (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'entrada') as unidades_que_volvieron
  from retail.cambios c
  join retail.venta_items vi on vi.id = c.venta_item_id
  join retail.variantes vo on vo.id = vi.variante_id
  join retail.cambio_salidas s on s.cambio_id = c.id
  join retail.variantes vs on vs.id = s.variante_id
 group by c.id, c.diferencia, c.cantidad, vi.precio_unitario, vi.descuento_unitario
having (c.diferencia <> round(sum(s.precio_unitario * s.cantidad) - (vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2)
        and not bool_or(vs.producto_id = vo.producto_id))
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
  ('INV-30', 'cambio_con_diferencia_tiene_sus_documentos', 1, 'cruzada', array['cambio_id', 'problema']::text[], false, true,
   $txt$Un cambio con diferencia de precio deja ante SUNAT lo que de verdad pasó (ADR-0671): su comprobante nuevo vivo (uno rechazado tiene un día para corregirse), que menos lo que el cliente pagó por lo devuelto da la diferencia que cobró o devolvió la caja, y su nota de crédito por exactamente lo pagado (emitida, o «por emitir» mientras la original no está aceptada). Y el par no queda roto: uno aceptado y el otro rechazado, anulado o liberado, o una nota que lleva más de un día esperando a una original ya aceptada, o a una que ya no se puede aceptar, o una nota ya emitida sobre una original que quedó anulada, liberada o con la baja en trámite (iría a SUNAT sobre una boleta dada de baja). Si no, el IGV del mes sale de más o de menos sin que nadie lo vea: INV-06 e INV-07 miran por venta, y estos documentos cuelgan del cambio. Solo desde el corte (`fn_cambios_con_documentos_desde`): los cambios de antes no se regularizan. Un mismo cambio puede salir con dos problemas (un comprobante nuevo anulado con su nota aceptada es los dos).$txt$,
   $inv$with cb as (
  select c.id as cambio_id, c.diferencia,
         round((vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2) as pagado,
         o.tipo as original_tipo, o.estado as original_estado
    from retail.cambios c
    join retail.venta_items vi on vi.id = c.venta_item_id
    join retail.ventas v on v.id = vi.venta_id
    left join lateral retail.fn_original_del_cambio(vi.venta_id) o on true
   where c.created_at >= (select retail.fn_cambios_con_documentos_desde())
     and c.diferencia <> 0 and not v.es_prueba
),
d as (
  select cb.*, n.total as nuevo_total, n.estado as nuevo_estado, n.created_at as nuevo_emitido,
         nc.total as nota_total, nc.estado as nota_estado,
         cn.total as debe_total, greatest(cn.created_at, coalesce(po.enviado_at, cn.created_at)) as espera_desde,
         po.estado as espera_original_estado,
         ncorig.estado as nota_original_estado, ncorig.anulacion_solicitada_at is not null as nota_original_en_baja
    from cb
    left join retail.comprobantes n on n.cambio_id = cb.cambio_id and n.tipo <> 'nota_credito'
    left join retail.comprobantes nc on nc.cambio_id = cb.cambio_id and nc.tipo = 'nota_credito'
    left join retail.cambio_notas cn on cn.cambio_id = cb.cambio_id
    left join retail.comprobantes po on po.id = cn.comprobante_original_id
    left join retail.comprobantes ncorig on ncorig.id = nc.comprobante_original_id
)
select cambio_id, 'sin_comprobante_nuevo' as problema, diferencia, nuevo_estado as estado from d
 where nuevo_estado is null or nuevo_estado in ('anulado', 'no_emitido')
    or (nuevo_estado = 'rechazado' and nuevo_emitido < now() - interval '1 day')
union all
select cambio_id, 'nuevo_no_da_la_diferencia', diferencia, nuevo_estado from d
 where nuevo_total is not null and round(nuevo_total - pagado, 2) <> round(diferencia, 2)
union all
select cambio_id, 'nota_no_es_lo_pagado', diferencia, nota_estado from d
 where round(coalesce(nota_total, debe_total), 2) <> pagado
union all
select cambio_id, 'falta_la_nota', diferencia, original_estado from d
 where nota_estado is null and debe_total is null and pagado > 0
   and original_tipo in ('boleta', 'factura') and original_estado not in ('anulado', 'no_emitido')
union all
select cambio_id, 'par_roto', diferencia, nuevo_estado || '/' || nota_estado from d
 where (nuevo_estado = 'aceptado' and nota_estado in ('rechazado', 'anulado', 'no_emitido'))
    or (nota_estado = 'aceptado' and nuevo_estado in ('rechazado', 'anulado', 'no_emitido'))
union all
select cambio_id, 'nota_sobre_original_muerta', diferencia, nota_estado || '/' || nota_original_estado from d
 where nota_estado is not null and nota_estado not in ('rechazado', 'anulado')
   and (nota_original_estado in ('anulado', 'no_emitido') or nota_original_en_baja)
union all
select cambio_id, 'nota_se_quedo_por_emitir', diferencia, espera_original_estado from d
 where debe_total is not null and nota_estado is null
   and (espera_original_estado in ('anulado', 'no_emitido')
        or (espera_original_estado = 'aceptado' and espera_desde < now() - interval '1 day'))$inv$)
on conflict (id) do update set
  nombre = excluded.nombre, gravedad = excluded.gravedad, nivel = excluded.nivel, dice = excluded.dice,
  requiere_sesion = excluded.requiere_sesion, sql = excluded.sql, clave = excluded.clave,
  linea_base_en = case when retail.invariantes.sql is distinct from excluded.sql
                         or retail.invariantes.clave is distinct from excluded.clave
                       then null else retail.invariantes.linea_base_en end;
-- <<< fin de la siembra generada

-- ---------- 3. INV-30 nace con su línea base puesta ----------
-- La siembra deja `linea_base_en` en null al nacer (y al cambiar su consulta), y la próxima corrida guardaría como «heredado» todo lo que
-- ya esté roto, sin avisar. INV-30 tiene su propio corte (`fn_cambios_con_documentos_desde`): no hay un «antes» que heredar, y lo que se
-- rompa desde que se pegó la parte 2 tiene que salir como NUEVO. Fuera de los marcadores: no es parte de la siembra generada. Idempotente:
-- si INV-30 ya tiene su línea base, no se toca.
update retail.invariantes set linea_base_en = now() where id = 'INV-30' and linea_base_en is null;

select '20261116214000 · QUEDÓ BIEN: la fuente de las diferencias de cambio para las metas y el vigía de sus documentos (INV-30, INV-22)' as resultado;
