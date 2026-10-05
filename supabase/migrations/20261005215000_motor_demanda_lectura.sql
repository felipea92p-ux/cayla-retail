-- Motor de demanda, etapa 1: una sola cifra de demanda por tienda (ADR-0347; diseño en
-- docs/investigacion/2026-10-05-algoritmo-de-inventario.md, capas 1 y 2).
--
-- EL PROBLEMA PRIMERO. Hoy «cuánto se vende» tiene una definición por pantalla: el motor del piso divide lo vendido entre 14 días
-- (sin mirar si la prenda estuvo colgada), Análisis divide entre los días con stock, Producción suma lo que dice Análisis, Catálogo
-- divide las salidas entre 30. Una prenda agotada 10 de 14 días «vende poco» para el piso y «vende mucho» para Análisis. Y una
-- prenda que no estuvo en el piso no vendió cero: nadie la vio. Si eso se cuenta como cero, el sistema deja de reponer lo que se
-- agota (la profecía que se cumple sola, ADR-0346 «Trampas»).
--
-- QUÉ DEVUELVE. La materia prima de UNA cifra, para una tienda y una ventana de días CERRADOS (hoy no cuenta: todavía no termina):
--   · por prenda (variante): lo que el cliente se llevó (`vendidas`), cuántos días estuvo colgada (`dias_expuesta`) y lo libre hoy en
--     piso y almacén, con su categoría, talla y familia de color;
--   · por grupo (categoría × talla × familia de color): las ventas «sin registrar» que siguen sin prenda (`anotadas`: pendientes o
--     cerradas sin prenda, el contrato de ADR-0334 y de 20261005160000), lo que se pidió y no había con su prenda exacta (`perdidas`,
--     ADR-0348; necesita 20261005212000) y en cuántos días hubo AL MENOS UNA prenda del grupo colgada.
-- La cuenta (ritmo de cada prenda apoyado en su grupo, n/(n+k)) la hace `apps/web/lib/demanda-reglas.ts`, con su prueba.
--
-- LAS DEFINICIONES, Y POR QUÉ.
--   · Vendidas: la MISMA definición que `fn_piso_plan_lectura` (20261004213000, CTE `lineas`): la línea cobrada, menos lo cambiado y lo
--     devuelto con devolución aprobada, más la prenda nueva de cada cambio, en el día de Lima en que se COBRÓ la venta. Venta
--     completada, no de prueba, sin liquidaciones de dañadas, sin la centinela. Se copia (no se llama) porque esa función entrega
--     otra forma y tiene su guarda md5: la prueba `pruebas:motor-demanda-lectura` exige que los totales coincidan.
--   · Días expuesta: jornadas de Lima en las que la prenda estuvo colgada en el piso al menos 10 minutos seguidos, reconstruidas del
--     libro único (`fn_ledger_puntos`, cubeta `piso`, ADR-0202). Los 10 minutos son los de Frescura (ADR-0208): una prenda que se
--     baja del almacén en el momento de venderla («bajada tardía») no estuvo a la vista; contarla inflaría ese día.
--   · Desde el cuadre: si la tienda cuadró su piso, la ventana empieza el día SIGUIENTE al último cuadre. Antes del cuadre, el libro
--     del piso está subcontado (TRU: 138 en el sistema contra 600-750 colgadas) y la historia de exposición es falsa.
--
-- PUERTAS. La de todas las lecturas de retail (`fn_tiene_acceso_retail`) y la de la sede (`fn_puede_operar_ubicacion`; el líder
-- opera todas): lo vendido por prenda es de la sede. Sin cualquiera de las dos, NULL (nunca un jsonb vacío que diga «no vende»).
--
-- VOLUMEN. Una tienda de 2.000 prendas con 28 días: `fn_ledger_puntos` (~200-240 ms medidos en 20260928120010) más un agregado por
-- prenda y día (≤ 56 mil filas). Se llama una vez por tienda al abrir «Nueva orden» de Producción.
--
-- Producción: solo `create or replace function` + `grant` (sin políticas ni `alter table`): se pega en una sola parte, a cualquier
-- hora. Sin `select … into` dentro de textos entre comillas (ADR-0288).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_demanda_sede(p_ubicacion_id uuid, p_dias integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Una exposición más corta que esto no cuenta como «estuvo a la vista» (la bajada tardía de Frescura, ADR-0208).
  c_minimo constant interval := interval '10 minutes';
  v_hoy date;
  v_hasta date;
  v_desde date;
  v_cuadrado_en timestamptz;
  v_desde_ts timestamptz;
  v_hasta_ts timestamptz;
begin
  if p_ubicacion_id is null then
    raise exception 'fn_demanda_sede: falta la sede' using errcode = '22004';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 120 then
    raise exception 'fn_demanda_sede: los días van de 1 a 120' using errcode = '22023';
  end if;
  if not retail.fn_tiene_acceso_retail() or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    return null;
  end if;

  v_hoy := retail.fn_hoy_lima();
  v_hasta := v_hoy - 1;                                   -- el último día CERRADO
  v_cuadrado_en := retail.fn_ultimo_cuadre_piso(p_ubicacion_id);
  v_desde := greatest(v_hoy - p_dias,
                      coalesce(((v_cuadrado_en at time zone 'America/Lima')::date + 1), v_hoy - p_dias));
  v_desde_ts := (v_desde::timestamp at time zone 'America/Lima');
  v_hasta_ts := (v_hoy::timestamp at time zone 'America/Lima');   -- medianoche de hoy: el fin del último día cerrado

  if v_desde > v_hasta then
    -- Recién cuadrada (hoy o ayer): todavía no hay ningún día cerrado y confiable.
    return jsonb_build_object('hoy', v_hoy, 'desde', v_desde, 'hasta', v_hasta, 'dias', 0, 'cuadrado_en', v_cuadrado_en,
                              'variantes', '[]'::jsonb, 'grupos', '[]'::jsonb);
  end if;

  return (
    with existencias as materialized (
      select e.variante_id, e.piso_libre, e.almacen_libre
        from retail.fn_existencias_base(p_ubicacion_id, null) e
    ),
    lineas_cobradas as materialized (
      select vi.id as venta_item_id, vi.variante_id, vi.cantidad, (v.created_at at time zone 'America/Lima')::date as dia
        from retail.ventas v
        join retail.venta_items vi on vi.venta_id = v.id
       where v.ubicacion_id = p_ubicacion_id
         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
         and v.estado = 'completada'
         and not v.es_prueba
         and not exists (select 1 from retail.movimientos m
                          where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
    ),
    lineas as materialized (
      -- Lo que el cliente se llevó (copia de `fn_piso_plan_lectura`, CTE `lineas`; la prueba exige que den lo mismo).
      select x.variante_id, x.cantidad, x.dia
        from (
          select l.variante_id,
                 greatest(l.cantidad
                          - coalesce((select sum(c.cantidad) from retail.cambios c where c.venta_item_id = l.venta_item_id), 0)
                          - coalesce((select sum(di.cantidad)
                                        from retail.devolucion_items di
                                        join retail.devoluciones d on d.id = di.devolucion_id
                                       where di.venta_item_id = l.venta_item_id and d.estado = 'aprobada'), 0),
                          0)::integer as cantidad,
                 l.dia
            from lineas_cobradas l
          union all
          select c.variante_nueva_id, c.cantidad, l.dia
            from lineas_cobradas l
            join retail.cambios c on c.venta_item_id = l.venta_item_id
        ) x
       where x.cantidad > 0 and x.variante_id <> c_centinela
    ),
    vendidas as (
      select l.variante_id, sum(l.cantidad)::integer as vendidas
        from lineas l
       group by l.variante_id
    ),
    puntos as materialized (
      -- OJO con la lista. Sin lista, `fn_ledger_puntos` solo devuelve las prendas que se movieron DESDE `v_desde_ts`: una prenda
      -- colgada todo el mes sin que nadie la tocara no saldría (exposición 0; la prueba K1 lo vigila). Con lista, devuelve SOLO las de
      -- la lista: una prenda agotada ayer, colgada 20 días, quedaría fuera (prueba E2). Por eso la lista es lo que la sede tiene hoy
      -- MÁS lo que se movió en ella (o hacia ella) dentro de la ventana.
      select p.variante_id, p.ts, p.ord, p.oid, p.nivel
        from retail.fn_ledger_puntos(
               p_ubicacion_id, v_desde_ts,
               coalesce((select array_agg(x.variante_id) from (
                           select st.variante_id from retail.stock st
                            where st.ubicacion_id = p_ubicacion_id and st.cantidad > 0
                           union
                           select m.variante_id from retail.movimientos m
                            where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
                              and m.created_at >= v_desde_ts) x
                          where x.variante_id <> c_centinela), '{}'::uuid[])) p
       where p.bucket = 'piso'
    ),
    tramos as (
      -- Cada tramo del libro con piso > 0: desde su punto hasta el siguiente (o hasta el fin de la ventana).
      select t.variante_id, t.desde, least(t.hasta, v_hasta_ts) as hasta
        from (
          select p.variante_id, p.ts as desde, p.nivel,
                 coalesce(lead(p.ts) over (partition by p.variante_id order by p.ts, p.ord, p.oid), v_hasta_ts) as hasta
            from puntos p
        ) t
       where t.nivel > 0 and t.desde < v_hasta_ts
    ),
    dias_tramo as (
      -- Las jornadas de Lima que toca cada tramo, con cuánto tiempo cae dentro de cada una.
      select tr.variante_id, d::date as dia,
             least(tr.hasta, ((d::date + 1)::timestamp at time zone 'America/Lima'))
               - greatest(tr.desde, (d::date::timestamp at time zone 'America/Lima')) as dentro
        from tramos tr,
             generate_series((tr.desde at time zone 'America/Lima')::date,
                             ((tr.hasta - interval '1 microsecond') at time zone 'America/Lima')::date,
                             interval '1 day') d
       where tr.hasta > tr.desde
    ),
    expuesta as materialized (
      -- Una jornada cuenta si la prenda estuvo colgada al menos 10 minutos seguidos dentro de ella.
      select dt.variante_id, dt.dia
        from dias_tramo dt
       where dt.dia between v_desde and v_hasta
       group by dt.variante_id, dt.dia
      having max(dt.dentro) >= c_minimo
    ),
    dias_expuesta as (
      select e.variante_id, count(*)::integer as dias from expuesta e group by e.variante_id
    ),
    prendas as (
      select ids.variante_id, va.producto_id, pr.categoria_id, va.talla_id, ta.valor as talla, va.color_codigo,
             co.familia_color,
             coalesce(vd.vendidas, 0) as vendidas,
             coalesce(de.dias, 0) as dias_expuesta,
             coalesce(ex.piso_libre, 0) as piso_hoy,
             coalesce(ex.almacen_libre, 0) as almacen_hoy
        from (select variante_id from vendidas
              union select variante_id from dias_expuesta
              union select variante_id from existencias where piso_libre > 0 or almacen_libre > 0) ids
        join retail.variantes va on va.id = ids.variante_id
        join retail.productos pr on pr.id = va.producto_id
        left join retail.tallas ta on ta.id = va.talla_id
        left join retail.colores co on co.codigo = va.color_codigo
        left join vendidas vd on vd.variante_id = ids.variante_id
        left join dias_expuesta de on de.variante_id = ids.variante_id
        left join existencias ex on ex.variante_id = ids.variante_id
       where ids.variante_id <> c_centinela and not pr.es_prueba
    ),
    anotadas as (
      -- La venta «sin registrar» que sigue sin prenda cuenta en su grupo (ADR-0334; contrato de 20261005160000).
      select p.categoria_id, p.talla_id, co.familia_color, count(*)::integer as anotadas
        from retail.prendas_por_regularizar p
        join retail.venta_items vi on vi.id = p.venta_item_id
        join retail.ventas v on v.id = vi.venta_id
        left join retail.colores co on co.codigo = p.color_codigo
       where p.ubicacion_id = p_ubicacion_id
         and p.estado in ('pendiente', 'cerrada_sin_prenda')
         and v.estado = 'completada' and not v.es_prueba
         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
       group by p.categoria_id, p.talla_id, co.familia_color
    ),
    perdidas as (
      -- Lo que se pidió y no había (ADR-0348): solo «buscó y no había» con su prenda exacta. Es demanda que no se pudo atender: suma
      -- a su grupo igual que una venta. Lo anotado como texto libre (antes de ADR-0348) no se puede ubicar en un grupo y no cuenta.
      select pr.categoria_id, va.talla_id, co.familia_color, count(*)::integer as perdidas
        from retail.pedidos_no_atendidos pn
        join retail.variantes va on va.id = pn.variante_id
        join retail.productos pr on pr.id = va.producto_id
        left join retail.colores co on co.codigo = va.color_codigo
       where pn.ubicacion_id = p_ubicacion_id
         and pn.motivo = 'no_habia_talla'
         and pn.created_at >= v_desde_ts and pn.created_at < v_hasta_ts
         and not pr.es_prueba
       group by pr.categoria_id, va.talla_id, co.familia_color
    ),
    grupo_dias as (
      -- En cuántas jornadas hubo al menos UNA prenda del grupo colgada.
      select pr.categoria_id, pr.talla_id, pr.familia_color, count(distinct e.dia)::integer as dias_alguna_expuesta
        from expuesta e
        join prendas pr on pr.variante_id = e.variante_id
       group by pr.categoria_id, pr.talla_id, pr.familia_color
    ),
    grupos as (
      -- Todo grupo con ventas anotadas o con alguna prenda colgada. (Postgres no admite `is not distinct from` en un FULL JOIN:
      -- se junta la lista de llaves y se cuelgan las dos cifras con LEFT JOIN.)
      select k.categoria_id, k.talla_id, k.familia_color,
             coalesce(a.anotadas, 0) as anotadas,
             coalesce(pe.perdidas, 0) as perdidas,
             coalesce(g.dias_alguna_expuesta, 0) as dias_alguna_expuesta
        from (select categoria_id, talla_id, familia_color from anotadas
              union
              select categoria_id, talla_id, familia_color from perdidas
              union
              select categoria_id, talla_id, familia_color from grupo_dias) k
        left join perdidas pe
          on pe.categoria_id is not distinct from k.categoria_id
         and pe.talla_id is not distinct from k.talla_id
         and pe.familia_color is not distinct from k.familia_color
        left join anotadas a
          on a.categoria_id is not distinct from k.categoria_id
         and a.talla_id is not distinct from k.talla_id
         and a.familia_color is not distinct from k.familia_color
        left join grupo_dias g
          on g.categoria_id is not distinct from k.categoria_id
         and g.talla_id is not distinct from k.talla_id
         and g.familia_color is not distinct from k.familia_color
    )
    select jsonb_build_object(
      'hoy', v_hoy,
      'desde', v_desde,
      'hasta', v_hasta,
      'dias', (v_hasta - v_desde + 1),
      'cuadrado_en', v_cuadrado_en,
      'variantes', coalesce((select jsonb_agg(jsonb_build_object(
          'variante_id', p.variante_id, 'producto_id', p.producto_id, 'categoria_id', p.categoria_id,
          'talla_id', p.talla_id, 'talla', p.talla, 'color_codigo', p.color_codigo, 'familia_color', p.familia_color,
          'vendidas', p.vendidas, 'dias_expuesta', p.dias_expuesta, 'piso_hoy', p.piso_hoy, 'almacen_hoy', p.almacen_hoy)
          order by p.variante_id) from prendas p), '[]'::jsonb),
      'grupos', coalesce((select jsonb_agg(jsonb_build_object(
          'categoria_id', g.categoria_id, 'talla_id', g.talla_id, 'familia_color', g.familia_color,
          'anotadas', g.anotadas, 'perdidas', g.perdidas, 'dias_alguna_expuesta', g.dias_alguna_expuesta)
          order by g.categoria_id, g.talla_id, g.familia_color) from grupos g), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function retail.fn_demanda_sede(uuid, integer) from public, anon;
grant execute on function retail.fn_demanda_sede(uuid, integer) to authenticated, service_role;

comment on function retail.fn_demanda_sede(uuid, integer) is
  'ADR-0347: materia prima de la cifra única de demanda de una tienda, en días CERRADOS desde el día siguiente al último cuadre del '
  'piso (máx. p_dias): por prenda, lo que el cliente se llevó (misma definición que fn_piso_plan_lectura) y las jornadas en que estuvo '
  'colgada ≥ 10 minutos (fn_ledger_puntos, cubeta piso); por categoría × talla × familia de color, las «sin registrar» sin prenda '
  '(pendientes o cerradas) y las jornadas con alguna prenda colgada. La cuenta vive en lib/demanda-reglas.ts. NULL si no opera la sede.';
