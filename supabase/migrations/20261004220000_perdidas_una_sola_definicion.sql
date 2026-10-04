-- ============================================================================
-- 20261004220000_perdidas_una_sola_definicion.sql — CAYLA V2 · ADR-0328, actividad 14 (Felipe, 2026-10-04)
-- Una sola definición de pérdida, la lectura de la pestaña «Pérdidas» y Finanzas leyendo lo mismo.
--
-- EL PROBLEMA PRIMERO. «¿Cuánto perdimos este mes?» tenía tres respuestas que no coincidían:
--   · Finanzas (`fn_es_merma`): ajustes que restan SOLO con motivo merma / conteo / conteo físico, más las dañadas botadas
--     o donadas. Un ajuste «otro» que restaba 3 prendas no era merma: quedaba como «otra salida» sin explicar en el Balance.
--     El faltante de un traslado tampoco: era una «causa» del Balance, nunca un gasto del mes.
--   · El resumen de Inventario (`fn_resumen_variantes.mermas`): solo «merma» y dañadas; ni los conteos.
--   · Movimientos: «faltaron / aparecieron» en bruto (ADR-0327), sin decir cuánto se perdió.
--   Tres cuentas para la misma pregunta: cada pantalla «tenía razón» y ninguna se podía comparar con otra.
--
-- LA DEFINICIÓN (Felipe, 2026-10-04, ADR-0328 «Qué es perder»): perder es TODO LO QUE SALIÓ SIN VENDERSE —faltantes (ajustes
-- y conteos que restan), dañadas que se botaron o donaron y lo que faltó en un traslado—; lo que APARECIÓ va aparte, «por
-- explicar», nunca restado de lo perdido; lo liquidado es venta. Nunca son pérdida: el stock inicial (`carga_inicial`), el
-- primer conteo de una sede (`conteo_arranque`, actividad 15) ni un movimiento dentro de la sede (por ESTRUCTURA: un
-- `traslado` nunca entra en la cuenta; el cuadre del piso de la actividad 3 es un traslado interno y queda fuera solo).
--
-- QUÉ HACE (contratos en el comentario de cada función):
--   1. `fn_perdida_razon(tipo, motivo, cantidad)` — LA definición para un movimiento: su razón ('conteo', 'a_mano', 'danada')
--      o null si no es pérdida ni aparición. `fn_perdida_lado` y `fn_es_perdida` salen de ella; ninguna repite la lista.
--   2. `fn_perdidas_de_traslados(sede, desde, hasta)` — lo que faltó (o llegó de más) en cada línea de un traslado cerrado:
--      enviado − recibido, la MISMA cuenta que usaba la causa «faltante_traslado» del Balance.
--   3. `fn_perdidas_hechos(sede, desde, hasta)` — los tres orígenes en una lista: movimientos (1), traslados (2) y ventas
--      anuladas cuya prenda no volvió a la venta (la misma regla con la que el diario ya las pasa a merma).
--   4. `fn_perdidas_resumen(sede, desde, hasta, prenda?, zona?)` — la lectura de la pestaña y del aviso del Inicio.
--   5. Finanzas lee lo mismo (reemplazos por ancla, ver abajo): `fn_es_merma` pasa a ser el nombre viejo de
--      `fn_es_perdida`; el diario rotula cada merma por su razón y asienta el faltante de un traslado; el Balance deja de
--      listarlo como causa (ya no es una diferencia sin asiento); el resumen de Inventario usa la misma regla.
--   6. La puerta suelta (`registrar_movimiento`, la RPC de Ajustar que el navegador llama con el motivo como texto) ya no
--      escribe una salida o un ajuste que la definición deja fuera («venta», «conteo_arranque»…): esos motivos tienen su
--      propia puerta, con su documento (hint `motivo_con_su_puerta`). Sin esto, la definición se esquivaba eligiendo el texto.
--
-- QUÉ CAMBIA EN FINANZAS (y qué no):
--   · Los MESES CERRADOS no cambian: su diario está congelado (`diario_cerrado`). Si un mes cerrado tiene un movimiento que
--     cambia de clase o un traslado con faltante, la migración ABORTA (guarda de abajo): el Balance de ese mes quedaría con
--     una diferencia sin causa. Se reabre ese mes, se pega y se vuelve a cerrar.
--   · En los meses abiertos pasan a «Mermas» del Estado de resultados (antes eran «otras salidas» del Balance): los ajustes
--     que restan con motivo «otro», «reposición» o cualquier motivo nuevo, y las salidas sueltas que no son venta, cambio,
--     traslado, producción ni devolución al proveedor. El faltante de un traslado cerrado pasa de causa del Balance a merma
--     («merma_traslado»), cargado a la sede que lo envió (provisional: «a quién se carga la pérdida en el camino» sigue
--     abierto en ADR-0328, tramo 2). Al pegar, la guarda imprime (NOTICE) cuántos movimientos cambian, por tipo y motivo.
--   · No cambia: merma / conteo / conteo físico / dañada botada o donada (mismo valor, misma regla del diario); los
--     sobrantes (siguen sin reconocerse en Finanzas); la venta anulada con prenda no vendible (el diario ya la pasaba a
--     merma al costo sellado en la venta); la dañada devuelta al proveedor (reclamo, no merma); la liquidada (es venta).
--
-- ESTADO QUE DEJA DE SER POSIBLE: que Finanzas y la pestaña Pérdidas digan cifras distintas para el mismo mes y la misma
-- sede: las dos leen los mismos tres orígenes (movimientos por `fn_perdida_razon`, traslados por `fn_perdidas_de_traslados`
-- y la venta anulada no vendible), y una prueba (`scripts/pruebas/perdidas.mjs`) exige que el total de la pestaña sea el 659
-- del diario, sede por sede. El resumen de Inventario (`fn_resumen_variantes.mermas`, por prenda; hoy ninguna pantalla lo
-- muestra) usa la misma regla para los MOVIMIENTOS, pero no suma traslados ni anulaciones: para una prenda con faltante en un
-- traslado, su cifra es menor que la de la pestaña filtrada. Y tampoco es posible ya esconder una pérdida escribiendo a mano
-- un motivo que la definición deja fuera (punto 6).
--
-- POR QUÉ SE REEMPLAZA POR ANCLA. `fn_asientos`, `fn_bal_causas_mercaderia` y `fn_resumen_variantes` viven en producción y
-- pueden tener parches en vivo; reescribirlas desde un archivo los borraría. `pg_temp.reemplazar_unico` cambia un texto que
-- debe aparecer UNA sola vez (si no, aborta con su nombre) y deja una marca «perdidas-act14»: re-pegar no duplica nada.
-- Sin `select … into` dentro de un texto entre comillas (ADR-0288).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`). Sin políticas,
-- sin `alter table`, sin `drop trigger`: ADR-0195 no aplica. Idempotente. ANTES de pegar, correr la sonda de solo lectura
-- `scripts/perdidas/sonda-antes-de-pegar.sql` (qué pasa a merma, qué meses cerrados cambiarían, los traslados con faltante,
-- quién llama a `registrar_movimiento` y las pérdidas que hoy se esconden) y mostrarle a Felipe el resultado: el SQL Editor
-- puede no mostrar los NOTICE de la guarda. Si aborta por un mes cerrado, el mensaje dice cuál (solo los que cambian).
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar 20260925130000 / 20260925170000 / 20261003120000 (recrean `fn_es_merma`, `fn_asientos` o el
--     Balance desde su archivo y vuelven las tres cuentas). La prueba `perdidas.mjs` lo detecta.
--   · una función nueva escribe un ajuste que resta y NO es pérdida (como el conteo de arranque) con un motivo que no está en
--     la lista de exclusiones: se contaría como pérdida «a mano» hasta que se agregue aquí (el lado que pide mirar, ADR-0327).
--   · el cuadre del piso (actividad 3) se hace con un PAR de ajustes (−almacén, +piso) en vez de un traslado interno: se
--     leería como una pérdida y una aparición.
--   · una función viva (o una nueva) llama a `registrar_movimiento` con un motivo que la definición deja fuera: ahora se
--     rechaza. La sonda de antes de pegar (`scripts/perdidas/sonda-antes-de-pegar.sql`) lista quién la llama en producción.
--   · la actividad 13 suma una razón de tienda («Error al cobrar», «Uso interno», «Se dañó») sin decidir su clase: caería en
--     «a mano» y en la merma de Finanzas. `perdidas.mjs` (TW) lee los motivos de Ajustar de la web y falla hasta que se decida.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. LA definición para un movimiento
-- ---------------------------------------------------------------------------
-- PROMETE: para un movimiento (tipo, motivo, cantidad con signo de ajuste) devuelve POR QUÉ es una pérdida o una aparición:
--   'conteo'  — faltó o apareció al contar (conteo formal, «Conteo físico» de Ajustar, prenda encontrada tras un conteo);
--   'a_mano'  — quitada o sumada a mano sin contar (merma, otro, reposición, un motivo que todavía no existe), o una salida
--               suelta que no es venta;
--   'danada'  — dañada que salió de la cuarentena botada o donada.
--   null      — no es ni pérdida ni aparición (venta, traslado, entrada, apartado, stock inicial, conteo de arranque…).
-- ASUME: el signo de un ajuste es su cantidad; las demás cantidades son positivas (CHECK `movimientos_cantidad_valida`).
-- Un motivo de ajuste desconocido cae en 'a_mano' a propósito: se cuenta y se mira, no se esconde (ADR-0327).
create or replace function retail.fn_perdida_razon(p_tipo text, p_motivo text, p_cantidad integer)
returns text
language sql
immutable
as $$
  select case
    when p_tipo = 'ajuste' and coalesce(p_cantidad, 0) <> 0 then
      case
        -- Nunca pérdida ni aparición: lo que ya estaba al pasar la tienda al sistema y el primer conteo de cada sede.
        when p_motivo in ('carga_inicial', 'conteo_arranque') then null
        when p_motivo in ('conteo', 'conteo_fisico', 'hallazgo_conteo') then 'conteo'
        else 'a_mano'
      end
    when p_tipo = 'salida' then
      case
        when p_motivo in ('cuarentena_se_boto', 'cuarentena_donada') then 'danada'
        -- Salió y NO es pérdida: se vendió (venta, cambio, liquidada), se fue a otra sede (su diferencia se mide en el
        -- traslado), volvió al Taller (producción revertida) o volvió al proveedor (reclamo, no merma).
        when p_motivo in ('venta', 'cambio', 'cuarentena_liquidada', 'traslado_salida', 'transferencia', 'traslado',
                          'reversion_produccion', 'cuarentena_devuelta_proveedor') then null
        else 'a_mano'
      end
    else null
  end
$$;

comment on function retail.fn_perdida_razon(text, text, integer) is
  'ADR-0328 act. 14: LA definición de pérdida para un movimiento. Devuelve la razón (conteo, a_mano, danada) si el movimiento es una pérdida o una aparición, null si no es ninguna. Finanzas (fn_es_merma), el resumen de Inventario y la pestaña Pérdidas leen esta función.';

-- PROMETE: 'perdida' si el movimiento resta sin venderse, 'aparecio' si suma sin documento de entrada, null si no es ninguna.
-- ASUME: `fn_perdida_razon` ya decidió si cuenta; aquí solo se lee el sentido.
create or replace function retail.fn_perdida_lado(p_tipo text, p_motivo text, p_cantidad integer)
returns text
language sql
immutable
as $$
  select case
    when retail.fn_perdida_razon(p_tipo, p_motivo, p_cantidad) is null then null
    when p_tipo = 'salida' or p_cantidad < 0 then 'perdida'
    else 'aparecio'
  end
$$;

-- PROMETE: verdadero si el movimiento es una pérdida (nunca null). Es lo que Finanzas llamaba `fn_es_merma`.
create or replace function retail.fn_es_perdida(p_tipo text, p_motivo text, p_cantidad integer)
returns boolean
language sql
immutable
as $$
  select coalesce(retail.fn_perdida_lado(p_tipo, p_motivo, p_cantidad) = 'perdida', false)
$$;

-- ---------------------------------------------------------------------------
-- 2. Lo que faltó (o llegó de más) en un traslado cerrado
-- ---------------------------------------------------------------------------
-- PROMETE: una fila por prenda y traslado CERRADO en [p_desde, p_hasta) cuyo enviado (salidas enlazadas a sus líneas) no es
--   igual a lo recibido (entradas enlazadas a sus recepciones). Faltó → 'perdida' en la sede que ENVIÓ; llegó de más →
--   'aparecio' en la sede que RECIBIÓ. Valor al costo del día del cierre. Es la cuenta exacta que el Balance usaba para
--   su causa «faltante_traslado» (que esta migración retira: ahora la asienta el diario).
-- ASUME: un traslado anulado o todavía en camino no tiene diferencia que medir (estado <> 'cerrada').
-- La sede del faltante es PROVISIONAL (ADR-0328, tramo 2: «a quién se carga la pérdida en el camino» sigue abierto).
create or replace function retail.fn_perdidas_de_traslados(p_ubicacion_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  linea_id uuid, transferencia_id uuid, transferencia_numero integer, ubicacion_id uuid, variante_id uuid,
  instante timestamptz, lado text, unidades integer, costo_unitario numeric, nota text
)
language sql
stable
set search_path = retail, public, extensions
as $$
  with t as (
    select t.id, t.numero, t.cerrado_en, t.ubicacion_origen_id, t.ubicacion_destino_id, t.nota_cierre
      from retail.transferencias t
     where t.estado = 'cerrada' and t.cerrado_en >= p_desde and t.cerrado_en < p_hasta
       and (p_ubicacion_id is null or p_ubicacion_id in (t.ubicacion_origen_id, t.ubicacion_destino_id))
  ),
  lineas as (
    select t.id as tid, t.numero, t.cerrado_en, t.ubicacion_origen_id, t.ubicacion_destino_id, t.nota_cierre, x.variante_id,
           (select ti.id from retail.transferencia_items ti where ti.transferencia_id = t.id and ti.variante_id = x.variante_id) as ti_id,
           (select tr.id from retail.transferencia_recepciones tr where tr.transferencia_id = t.id and tr.variante_id = x.variante_id) as tr_id,
           coalesce((select sum(m.cantidad) from retail.movimientos m join retail.transferencia_items ti on ti.id = m.transferencia_item_id
                      where ti.transferencia_id = t.id and ti.variante_id = x.variante_id and m.tipo = 'salida'), 0)::integer as enviado,
           coalesce((select sum(m.cantidad) from retail.movimientos m join retail.transferencia_recepciones tr on tr.id = m.transferencia_recepcion_id
                      where tr.transferencia_id = t.id and m.variante_id = x.variante_id and m.tipo = 'entrada'), 0)::integer as recibido
      from t
      cross join lateral (
        select ti.variante_id from retail.transferencia_items ti where ti.transferencia_id = t.id
        union
        select tr.variante_id from retail.transferencia_recepciones tr where tr.transferencia_id = t.id
      ) x
  )
  select coalesce(l.ti_id, l.tr_id), l.tid, l.numero,
         case when l.enviado > l.recibido then l.ubicacion_origen_id else l.ubicacion_destino_id end,
         l.variante_id, l.cerrado_en,
         case when l.enviado > l.recibido then 'perdida' else 'aparecio' end,
         abs(l.enviado - l.recibido),
         retail.fn_costo_variante_al(l.variante_id, l.cerrado_en),
         nullif(btrim(l.nota_cierre), '')
    from lineas l
   where l.enviado <> l.recibido
     and (p_ubicacion_id is null
          or p_ubicacion_id = case when l.enviado > l.recibido then l.ubicacion_origen_id else l.ubicacion_destino_id end);
$$;

-- ---------------------------------------------------------------------------
-- 3. Los hechos: los tres orígenes en una sola lista
-- ---------------------------------------------------------------------------
-- PROMETE: cada pérdida o aparición de [p_desde, p_hasta) en la sede (null = todas), con su razón, sus unidades (siempre
--   positivas) y su costo unitario de ESE momento:
--     'movimiento' — `fn_perdida_razon` (costo `fn_costo_variante_al` del instante, como el diario);
--     'traslado'   — `fn_perdidas_de_traslados` (razón 'traslado');
--     'anulacion'  — venta anulada cuya prenda no volvió a la venta (condición distinta de 'vendible'): razón 'danada', al
--                    costo sellado en la venta, que es como el diario ya la pasaba a merma.
--   `con_documento`: hay un papel detrás (conteo, traslado, venta). `documento_tipo/_id/_numero` lo nombran.
-- ASUME: la prenda «sin registrar» (variante centinela 2222…) no es una prenda: nunca entra. Una venta de prueba tampoco.
create or replace function retail.fn_perdidas_hechos(p_ubicacion_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  fuente text, fuente_id uuid, ubicacion_id uuid, sububicacion_id uuid, variante_id uuid, instante timestamptz,
  lado text, razon text, unidades integer, costo_unitario numeric, con_documento boolean,
  documento_tipo text, documento_id uuid, documento_numero integer, nota text
)
language sql
stable
set search_path = retail, public, extensions
as $$
  select 'movimiento'::text, m.id, m.ubicacion_id, m.sububicacion_id, m.variante_id, m.created_at,
         retail.fn_perdida_lado(m.tipo, m.motivo, m.cantidad), retail.fn_perdida_razon(m.tipo, m.motivo, m.cantidad),
         abs(m.cantidad), retail.fn_costo_variante_al(m.variante_id, m.created_at),
         m.conteo_item_id is not null,
         case when ci.conteo_id is not null then 'conteo' end, ci.conteo_id, co.numero,
         nullif(btrim(m.nota), '')
    from retail.movimientos m
    left join retail.conteo_items ci on ci.id = m.conteo_item_id
    left join retail.conteos co on co.id = ci.conteo_id
   where m.created_at >= p_desde and m.created_at < p_hasta
     and m.tipo in ('ajuste', 'salida')
     and m.variante_id <> '22222222-2222-4222-8222-222222222222'
     and (p_ubicacion_id is null or m.ubicacion_id = p_ubicacion_id)
     and retail.fn_perdida_razon(m.tipo, m.motivo, m.cantidad) is not null
  union all
  select 'traslado', x.linea_id, x.ubicacion_id, null::uuid, x.variante_id, x.instante,
         x.lado, 'traslado', x.unidades, x.costo_unitario, true,
         'traslado', x.transferencia_id, x.transferencia_numero, x.nota
    from retail.fn_perdidas_de_traslados(p_ubicacion_id, p_desde, p_hasta) x
  union all
  select 'anulacion', vi.id, v.ubicacion_id, null::uuid, vi.variante_id, v.anulado_en,
         'perdida', 'danada', vi.cantidad, coalesce(vi.costo_unitario, 0), true,
         'venta', v.id, null::integer, nullif(btrim(v.motivo_anulacion), '')
    from retail.venta_anulacion_items ai
    join retail.venta_items vi on vi.id = ai.venta_item_id
    join retail.ventas v on v.id = ai.venta_id
   where v.estado = 'anulada' and v.anulado_en >= p_desde and v.anulado_en < p_hasta
     and not coalesce(v.es_prueba, false)
     and ai.condicion <> 'vendible'
     and vi.variante_id <> '22222222-2222-4222-8222-222222222222'
     and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id);
$$;

-- ---------------------------------------------------------------------------
-- 4. La lectura de la pestaña «Pérdidas» (y del aviso del Inicio del líder)
-- ---------------------------------------------------------------------------
-- PROMETE: para una sede y un rango de días de Lima [p_desde, p_hasta] (opcionalmente solo una prenda o una zona), un
--   jsonb con: lo perdido y lo aparecido (unidades y soles, NUNCA restados entre sí), el desglose por razón, por categoría
--   y por talla (de lo perdido), «más faltan» (categoría · talla · color, las 5 con más prendas) y la lista de hechos (hasta
--   1000, la más reciente primero; `hechos_total` dice cuántos hay). Unidades y totales en soles para todos; el costo POR
--   PRENDA (`costo_unitario` de cada hecho) solo si quien mira es líder (Felipe, 2026-10-04): para los demás viene null.
--   Filtrada a UNA prenda, sus soles ÷ sus prendas SON su costo: para quien no es líder, todo `soles` viene null (solo
--   unidades). El candado vive aquí, no en la pantalla (revisión adversarial del PR de la actividad 14).
--   `quedaron` (cuántas quedaron de esa talla en la sede después de restar) solo en las restas a mano sin documento: es lo
--   que el aviso «resta grande sin nota» necesita para «la dejó en 0».
-- ASUME: quien mira ve el módulo Movimientos y opera esa sede (o es líder). Solo lee: no bloquea ni escribe nada.
create or replace function retail.fn_perdidas_resumen(
  p_ubicacion_id uuid,
  p_desde date,
  p_hasta date,
  p_variante_id uuid default null,
  p_sububicacion_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_ve_costo boolean := coalesce(retail.fn_es_lider(), false);
  -- Una sola prenda: los soles delatarían su costo. Con toda la sede o una zona, los totales mezclan prendas.
  v_ve_soles boolean := v_ve_costo or p_variante_id is null;
  v_resultado jsonb;
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la sede cuyas pérdidas quieres ver' using errcode = 'P0001';
  end if;
  if not coalesce(retail.fn_ve_modulo('movimientos'), false) then
    raise exception 'Ver las pérdidas necesita el módulo Movimientos en tu rol' using errcode = '42501';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver las pérdidas de esa sede' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido' using errcode = 'P0001';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'Elige un período de hasta un año' using errcode = 'P0001';
  end if;
  -- La frontera es la medianoche DE LIMA, como el diario.
  v_ini := (p_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');

  with h as (
    select x.*, (x.instante at time zone 'America/Lima')::date as dia
      from retail.fn_perdidas_hechos(p_ubicacion_id, v_ini, v_fin) x
     where (p_variante_id is null or x.variante_id = p_variante_id)
       and (p_sububicacion_id is null or x.sububicacion_id = p_sububicacion_id)
  ),
  d as (
    select h.*, pr.id as producto_id, pr.referencia as producto, coalesce(va.codigo, va.sku) as codigo,
           ca.nombre as categoria, ta.valor as talla, co.nombre as color, co.hex as color_hex,
           su.nombre as zona, su.tipo as zona_tipo,
           round(h.unidades * h.costo_unitario, 2) as soles
      from h
      join retail.variantes va on va.id = h.variante_id
      join retail.productos pr on pr.id = va.producto_id
      left join retail.categorias ca on ca.id = pr.categoria_id
      left join retail.tallas ta on ta.id = va.talla_id
      left join retail.colores co on co.codigo = va.color_codigo
      left join retail.sububicaciones su on su.id = h.sububicacion_id
  ),
  perd as (select * from d where d.lado = 'perdida'),
  lista as (
    select d.*,
           -- Cuántas quedaron de esa talla en la sede después de la resta (el libro entero hasta ese instante: el stock
           -- es un derivado del libro, principio 4). Solo para las restas a mano sin documento.
           case when d.fuente = 'movimiento' and d.lado = 'perdida' and not d.con_documento then
             (select coalesce(sum(case
                        when m2.tipo in ('entrada', 'ajuste') and m2.ubicacion_id = d.ubicacion_id then m2.cantidad
                        when m2.tipo = 'salida' and m2.ubicacion_id = d.ubicacion_id then -m2.cantidad
                        when m2.tipo = 'traslado' and m2.ubicacion_id = d.ubicacion_id and m2.ubicacion_destino_id <> d.ubicacion_id then -m2.cantidad
                        when m2.tipo = 'traslado' and m2.ubicacion_destino_id = d.ubicacion_id and m2.ubicacion_id <> d.ubicacion_id then m2.cantidad
                        else 0 end), 0)::integer
                from retail.movimientos m2
               where m2.variante_id = d.variante_id
                 and (m2.ubicacion_id = d.ubicacion_id or m2.ubicacion_destino_id = d.ubicacion_id)
                 and m2.created_at <= d.instante)
           end as quedaron
      from d
     order by d.instante desc, d.fuente_id
     limit 1000
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    've_costo', v_ve_costo,
    'perdido', (select jsonb_build_object(
                  'unidades', coalesce(sum(p.unidades), 0),
                  'soles', case when v_ve_soles then coalesce(sum(p.soles), 0) end,
                  'sin_costo', coalesce(sum(p.unidades) filter (where p.costo_unitario = 0), 0),
                  'hechos', count(*))
                  from perd p),
    'aparecio', (select jsonb_build_object(
                   'unidades', coalesce(sum(a.unidades), 0),
                   'soles', case when v_ve_soles then coalesce(sum(a.soles), 0) end,
                   'hechos', count(*))
                   from d a where a.lado = 'aparecio'),
    'por_razon', coalesce((select jsonb_agg(jsonb_build_object('lado', r.lado, 'razon', r.razon, 'unidades', r.u, 'soles', case when v_ve_soles then r.s end)
                                            order by r.lado desc, r.u desc, r.razon)
                             from (select d.lado, d.razon, sum(d.unidades) as u, sum(d.soles) as s from d group by d.lado, d.razon) r), '[]'::jsonb),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', c.categoria, 'unidades', c.u, 'soles', case when v_ve_soles then c.s end)
                                                order by c.u desc, c.categoria)
                                 from (select coalesce(p.categoria, 'Sin categoría') as categoria, sum(p.unidades) as u, sum(p.soles) as s
                                         from perd p group by 1) c), '[]'::jsonb),
    'por_talla', coalesce((select jsonb_agg(jsonb_build_object('talla', t.talla, 'unidades', t.u, 'soles', case when v_ve_soles then t.s end) order by t.u desc, t.talla)
                             from (select coalesce(p.talla, 'Única') as talla, sum(p.unidades) as u, sum(p.soles) as s
                                     from perd p group by 1) t), '[]'::jsonb),
    'mas_faltan', coalesce((select jsonb_agg(jsonb_build_object('categoria', f.categoria, 'talla', f.talla, 'color', f.color,
                                                                'color_hex', f.hex, 'unidades', f.u, 'veces', f.n)
                                             order by f.u desc, f.n desc, f.categoria, f.talla, f.color)
                              from (select coalesce(p.categoria, 'Sin categoría') as categoria, coalesce(p.talla, 'Única') as talla,
                                           coalesce(p.color, 'Sin color') as color, max(p.color_hex) as hex,
                                           sum(p.unidades) as u, count(distinct p.dia) as n
                                      from perd p group by 1, 2, 3
                                     order by sum(p.unidades) desc, count(distinct p.dia) desc, 1, 2, 3
                                     limit 5) f), '[]'::jsonb),
    'hechos_total', (select count(*) from d),
    'hechos', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', l.fuente_id, 'fuente', l.fuente, 'lado', l.lado, 'razon', l.razon,
                          'instante', l.instante, 'dia', l.dia,
                          'variante_id', l.variante_id, 'producto_id', l.producto_id, 'producto', l.producto, 'codigo', l.codigo,
                          'categoria', l.categoria, 'talla', l.talla, 'color', l.color, 'color_hex', l.color_hex,
                          'sububicacion_id', l.sububicacion_id, 'zona', l.zona, 'zona_tipo', l.zona_tipo,
                          'unidades', l.unidades,
                          'costo_unitario', case when v_ve_costo then l.costo_unitario end,
                          'con_documento', l.con_documento, 'documento_tipo', l.documento_tipo,
                          'documento_id', l.documento_id, 'documento_numero', l.documento_numero,
                          'nota', l.nota, 'quedaron', l.quedaron)
                          order by l.instante desc, l.fuente_id)
                         from lista l), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function retail.fn_perdidas_resumen(uuid, date, date, uuid, uuid) is
  'ADR-0328 act. 14: la pestaña «Pérdidas» de Movimientos y el aviso «se repite» del Inicio del líder. Lo perdido y lo que apareció (nunca restados), por razón, categoría y talla, «más faltan» y la lista de hechos. El costo por prenda solo para el líder.';

-- ---------------------------------------------------------------------------
-- 5. Permisos: las piezas son internas (como `fn_es_merma`); la lectura, de quien entra a la app
-- ---------------------------------------------------------------------------
revoke all on function retail.fn_perdida_razon(text, text, integer) from public, anon, authenticated;
revoke all on function retail.fn_perdida_lado(text, text, integer) from public, anon, authenticated;
revoke all on function retail.fn_es_perdida(text, text, integer) from public, anon, authenticated;
revoke all on function retail.fn_perdidas_de_traslados(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_perdidas_hechos(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_perdidas_resumen(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function retail.fn_perdidas_resumen(uuid, date, date, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. La guarda: ningún mes CERRADO puede cambiar por debajo
-- ---------------------------------------------------------------------------
-- Un mes cerrado tiene su diario congelado, pero el Balance de sus causas se calcula en vivo. Si un movimiento de ese mes
-- cambia de clase (deja de ser «otra salida» y pasa a ser merma) o tiene un traslado con faltante, el diario congelado no
-- lo tiene y la causa desaparece: quedaría una diferencia sin explicar. Eso se hace imposible aquí: se aborta y se dice
-- qué mes reabrir. En un re-pegado (`fn_es_merma` ya delega) no hay nada que medir.
-- Se nombran SOLO los meses (y sedes) que cambiarían: reabrir uno que no cambia es trabajo y una huella nueva sin motivo.
do $guarda$
declare
  v_movs bigint := 0;
  v_tras bigint := 0;
  v_meses text;
  r record;
begin
  if position('fn_es_perdida' in pg_get_functiondef('retail.fn_es_merma(text,text,integer)'::regprocedure)) > 0 then
    return;
  end if;

  for r in
    select to_char(c.mes, 'YYYY-MM') || ' ' || u.nombre as mes,
           count(*) filter (where c.que = 'movimiento') as movs,
           count(*) filter (where c.que = 'traslado') as tras
      from (
        -- Un movimiento de un mes cerrado que cambia de clase (la regla vieja de fn_es_merma contra la nueva).
        select p.mes, p.ubicacion_id, 'movimiento' as que
          from retail.movimientos m
          join retail.periodos p on p.alcance = 'ubicacion' and p.ubicacion_id = m.ubicacion_id and p.estado = 'cerrado'
                                and p.mes = date_trunc('month', m.created_at at time zone 'America/Lima')::date
         where m.variante_id <> '22222222-2222-4222-8222-222222222222'
           and coalesce((m.tipo = 'ajuste' and m.cantidad < 0 and m.motivo in ('merma', 'conteo', 'conteo_fisico'))
                     or (m.tipo = 'salida' and m.motivo in ('cuarentena_se_boto', 'cuarentena_donada')), false)
               is distinct from retail.fn_es_perdida(m.tipo, m.motivo, m.cantidad)
        union all
        -- Una línea de traslado con faltante cerrada en un mes cerrado de la sede que lo envió.
        select p.mes, p.ubicacion_id, 'traslado'
          from retail.fn_perdidas_de_traslados(null, '-infinity'::timestamptz, 'infinity'::timestamptz) x
          join retail.periodos p on p.alcance = 'ubicacion' and p.ubicacion_id = x.ubicacion_id and p.estado = 'cerrado'
                                and p.mes = date_trunc('month', x.instante at time zone 'America/Lima')::date
         where x.lado = 'perdida'
      ) c
      join retail.ubicaciones u on u.id = c.ubicacion_id
     group by c.mes, u.nombre
     order by c.mes, u.nombre
  loop
    v_movs := v_movs + r.movs;
    v_tras := v_tras + r.tras;
    v_meses := concat_ws(', ', v_meses, r.mes);
  end loop;
  if v_movs + v_tras > 0 then
    raise exception 'Hay % movimientos y % líneas de traslado en meses ya CERRADOS que cambiarían de clase en Finanzas (meses a reabrir: %). Reabre esos meses con motivo, pega esta migración y vuelve a cerrarlos.',
      v_movs, v_tras, v_meses
      using hint = 'perdidas_mes_cerrado';
  end if;

  -- Para quien pega: qué pasa a contar como merma en los meses abiertos (lo que antes era «otra salida» del Balance).
  for r in
    select m.tipo, coalesce(m.motivo, '(sin motivo)') as motivo, count(*) as n, sum(abs(m.cantidad)) as u
      from retail.movimientos m
     where m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and coalesce((m.tipo = 'ajuste' and m.cantidad < 0 and m.motivo in ('merma', 'conteo', 'conteo_fisico'))
                 or (m.tipo = 'salida' and m.motivo in ('cuarentena_se_boto', 'cuarentena_donada')), false)
           is distinct from retail.fn_es_perdida(m.tipo, m.motivo, m.cantidad)
     group by 1, 2
     order by 1, 2
  loop
    raise notice 'Pasa a merma en Finanzas: % · % → % movimientos, % prendas', r.tipo, r.motivo, r.n, r.u;
  end loop;
end
$guarda$;

-- ---------------------------------------------------------------------------
-- 7. Finanzas y el resumen leen la misma definición (reemplazos por ancla)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.reemplazar_unico(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-pegar: la marca ya está, no se vuelve a aplicar (el texto nuevo puede contener al viejo).
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
  if position(p_marca in pg_get_functiondef(p_firma::regprocedure)) = 0 then
    raise exception '%: el reemplazo no dejó su marca «%»', p_firma, p_marca;
  end if;
end;
$f$;

-- 7a. `fn_es_merma` deja de decidir: es el nombre que Finanzas ya usaba para `fn_es_perdida`.
select pg_temp.reemplazar_unico(
  'retail.fn_es_merma(text, text, integer)',
  $v$  select (p_tipo = 'ajuste' and p_cantidad < 0 and p_motivo in ('merma', 'conteo', 'conteo_fisico'))
      or (p_tipo = 'salida' and p_motivo in ('cuarentena_se_boto', 'cuarentena_donada'));$v$,
  $n$  -- perdidas-act14: la definición vive en fn_perdida_razon (ADR-0328); este nombre queda para Finanzas.
  select retail.fn_es_perdida(p_tipo, p_motivo, p_cantidad);$n$,
  'perdidas-act14'
);
comment on function retail.fn_es_merma(text, text, integer) is
  'Nombre viejo de fn_es_perdida (ADR-0328 act. 14): Finanzas lo sigue llamando, pero la definición vive en fn_perdida_razon.';

-- 7b. El diario rotula cada merma por su razón (una resta «otro» es «a mano», no «conteo»). Las reglas conservan su
-- nombre (`merma_merma` = a mano, `merma_cuarentena` = dañada, `merma_conteo` = conteo): lo ya asentado se lee igual.
select pg_temp.reemplazar_unico(
  'retail.fn_asientos(date, date, uuid)',
  $v$           case when m.tipo = 'ajuste' and m.motivo = 'merma' then 'merma'
                when m.tipo = 'salida' then 'cuarentena'
                else 'conteo' end as origen,$v$,
  $n$           -- perdidas-act14-razon: el rótulo sale de LA definición (fn_perdida_razon).
           case retail.fn_perdida_razon(m.tipo, m.motivo, m.cantidad)
                when 'a_mano' then 'merma' when 'danada' then 'cuarentena' else 'conteo' end as origen,$n$,
  'perdidas-act14-razon'
);

-- 7c. El diario asienta lo que faltó en un traslado cerrado: 659 contra 201, en la sede que lo envió, al costo del día del
-- cierre (la cuenta que antes era una causa del Balance).
select pg_temp.reemplazar_unico(
  'retail.fn_asientos(date, date, uuid)',
  $v$    select mm.f, mm.ubicacion_id, 'merma:' || mm.id, 'merma_' || mm.origen, '201', 0, mm.valor, 'movimientos', mm.id, 'Sale la mercadería'
      from mm where mm.valor > 0
  ),$v$,
  $n$    select mm.f, mm.ubicacion_id, 'merma:' || mm.id, 'merma_' || mm.origen, '201', 0, mm.valor, 'movimientos', mm.id, 'Sale la mercadería'
      from mm where mm.valor > 0
    -- perdidas-act14-traslado: lo que faltó en un traslado cerrado (fn_perdidas_de_traslados, la misma cuenta que la
    -- pestaña Pérdidas), en la sede que lo envió y al costo del día del cierre.
    union all
    select (tx.instante at time zone 'America/Lima')::date, tx.ubicacion_id, 'merma_traslado:' || tx.linea_id, 'merma_traslado',
           '659', round(tx.unidades * tx.costo_unitario, 2), 0, 'transferencia_items', tx.linea_id, 'Faltó en un traslado: merma al costo del día del cierre'
      from retail.fn_perdidas_de_traslados(null, v_ini, v_fin) tx
     where tx.lado = 'perdida' and round(tx.unidades * tx.costo_unitario, 2) > 0 and (v_todo or tx.ubicacion_id = any (v_ubics))
    union all
    select (tx.instante at time zone 'America/Lima')::date, tx.ubicacion_id, 'merma_traslado:' || tx.linea_id, 'merma_traslado',
           '201', 0, round(tx.unidades * tx.costo_unitario, 2), 'transferencia_items', tx.linea_id, 'Sale la mercadería que no llegó'
      from retail.fn_perdidas_de_traslados(null, v_ini, v_fin) tx
     where tx.lado = 'perdida' and round(tx.unidades * tx.costo_unitario, 2) > 0 and (v_todo or tx.ubicacion_id = any (v_ubics))
  ),$n$,
  'perdidas-act14-traslado'
);

-- 7d. El Balance deja de listar el faltante de traslado como causa: desde 7c lo explica el diario.
select pg_temp.reemplazar_unico(
  'retail.fn_bal_causas_mercaderia(date, date)',
  $v$    union all
    select 'faltante_traslado', 'Prendas que no llegaron en un traslado entre tiendas ya cerrado',
           sum(p.q * retail.fn_costo_variante_al(p.variante_id, p.cerrado_en))
      from (
        select t.id, t.cerrado_en, ti.variante_id,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'salida' and m.transferencia_item_id = ti.id), 0)
             - coalesce((select sum(m2.cantidad) from retail.movimientos m2 join retail.transferencia_recepciones tr on tr.id = m2.transferencia_recepcion_id
                          where tr.transferencia_id = t.id and m2.variante_id = ti.variante_id and m2.tipo = 'entrada'), 0) as q
          from retail.transferencias t
          join retail.transferencia_items ti on ti.transferencia_id = t.id
          left join retail.movimientos m on m.transferencia_item_id = ti.id
          cross join lim
         where t.cerrado_en >= lim.ini and t.cerrado_en < lim.fin
         group by t.id, t.cerrado_en, ti.id, ti.variante_id
      ) p where p.q > 0
$v$,
  $n$    -- perdidas-act14-balance: el faltante de un traslado cerrado ya no es una causa: el diario lo asienta como merma
    -- (regla merma_traslado, fn_perdidas_de_traslados).
$n$,
  'perdidas-act14-balance'
);

-- 7e. El resumen de Inventario (`mermas` por prenda y sede) usa la misma definición.
select pg_temp.reemplazar_unico(
  'retail.fn_resumen_variantes(uuid, integer, date, date, date, date)',
  $v$      where (m.tipo = 'ajuste' and m.cantidad < 0 and m.motivo = 'merma')
         or (m.tipo = 'salida' and m.motivo in ('cuarentena_se_boto', 'cuarentena_donada'))$v$,
  $n$      where retail.fn_es_perdida(m.tipo, m.motivo, m.cantidad) -- perdidas-act14: la misma definición que Finanzas$n$,
  'perdidas-act14'
);

-- ---------------------------------------------------------------------------
-- 8. La puerta suelta no esconde una pérdida
-- ---------------------------------------------------------------------------
-- EL PROBLEMA: `registrar_movimiento` recibe el motivo como TEXTO y se puede llamar desde el navegador. Una salida «venta» o
-- un ajuste «conteo_arranque» escritos por ahí —sin venta ni conteo detrás— la definición los deja fuera por su motivo:
-- salían 6 prendas y Pérdidas y Finanzas veían 1 (revisión adversarial del PR de la actividad 14).
-- PROMETE: un movimiento suelto que resta o suma (salida o ajuste) solo se escribe si la definición lo VE
--   (`fn_perdida_razon` no es null). Los motivos que la definición deja fuera —venta, cambio, traslado, liquidada, devuelta
--   al proveedor, producción revertida, stock inicial, conteo de arranque— tienen su propia puerta y su documento: aquí se
--   rechazan (hint `motivo_con_su_puerta`). La regla ES `fn_perdida_razon`: no hay otra lista que se pueda desincronizar.
-- ASUME: ninguna función llama a `registrar_movimiento` con esos motivos (en el repo, solo `ajustar_inventario`, con merma,
--   conteo físico, otro y reposición; la sonda de antes de pegar lo comprueba en producción). Las entradas sueltas no
--   cambian: no restan, y la definición nunca las cuenta.
-- Ancla en la línea del responsable: no toca las anclas que usa la rama de la carga inicial (20261004210100/210200).
select pg_temp.reemplazar_unico(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  $v$  v_persona := retail.fn_actor_persona_id(true);$v$,
  $n$  -- perdidas-act14-puerta: lo que la definición de pérdida no ve no entra por la puerta suelta (ADR-0328, act. 14).
  if p_tipo in ('salida', 'ajuste') and coalesce(p_cantidad, 0) <> 0
     and retail.fn_perdida_razon(p_tipo, p_motivo, p_cantidad) is null then
    raise exception 'El motivo «%» tiene su propia pantalla: las ventas y los cambios van por Vender, los traslados por Traslados, el stock inicial por Nuevo producto y el primer conteo por Conteos. Para quitar prendas a mano elige Merma, Conteo físico u Otro.', p_motivo
      using errcode = 'P0001', hint = 'motivo_con_su_puerta';
  end if;
  v_persona := retail.fn_actor_persona_id(true);$n$,
  'perdidas-act14-puerta'
);

notify pgrst, 'reload schema';
