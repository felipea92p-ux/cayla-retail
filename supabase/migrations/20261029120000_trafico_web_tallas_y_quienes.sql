-- ============================================================================
-- 20261029120000_trafico_web_tallas_y_quienes.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495), «Observatorio», actividad 7
--
-- EL PROBLEMA PRIMERO. La gente elige una talla en la tienda online y se va porque no hay: eso no se ve en ningún lado. Y no se sabe si
-- quienes entran son gente nueva o clientes que vuelven, que separan muy distinto.
--
-- QUÉ HACE. `retail.resumen_trafico_web` (la de 7 parámetros) suma:
--   · `tallas`: { desde, hasta, filas: [{ categoria, prefijo, familia, modelos, tallas: [[talla, piden, quedan, sin]] }] }. Por categoría
--     y talla de las prendas publicadas en la tienda online: cuántas personas eligieron esa talla en 4 semanas (o el período, si es más
--     largo), cuántas unidades libres quedan en las tiendas y cuántos modelos que la ofrecen ya no la tienen.
--   · `quienes`: { nuevos, nuevos_separan, vuelven, vuelven_separan }: la gente del período que entra por primera vez contra la que ya
--     había entrado en los 180 días de antes.
-- Todo lo demás queda igual, con la misma firma.
--
-- QUÉ NO HACE. No cambia permisos (sigue pidiendo el módulo «trafico»), ni toca tablas, ni cómo se cuenta a una persona.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Después de 20261029015000, 040000, 042000 y 050000. Entera, de una vez: es un `create or replace` de la
-- misma firma, sin políticas ni tablas en uso. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.resumen_trafico_web(
  p_desde date,
  p_hasta date,
  p_camino text default null,
  p_ciudad text default null,
  p_ant_desde date default null,
  p_ant_hasta date default null,
  p_ant_corte timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_dias integer;
  v_ant_desde date;
  v_ant_hasta date;
  v_hoy date := retail.fn_hoy_lima();
  v_antes jsonb;
  v_estos_dias jsonb;
  v_cal_desde date;
begin
  if not retail.fn_ve_modulo('trafico') then
    raise exception 'Tu rol no ve «Tráfico de la tienda web».' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El período no es válido.' using errcode = '22023';
  end if;
  -- Contra qué se compara. De fábrica, los días de atrás del mismo largo. La pantalla puede pedir otros: «ayer a esta hora» para Hoy
  -- (`p_ant_corte`), el mismo día de la semana pasada para Ayer, los mismos días del mes anterior para Este mes.
  if (p_ant_desde is null) <> (p_ant_hasta is null)
     or p_ant_hasta < p_ant_desde
     or p_ant_hasta >= p_desde
     or p_ant_hasta - p_ant_desde > 400
     or (p_ant_corte is not null and p_ant_hasta is null) then
    raise exception 'Los días con los que se compara no son válidos.' using errcode = '22023';
  end if;
  v_dias := p_hasta - p_desde + 1;
  v_ant_hasta := coalesce(p_ant_hasta, p_desde - 1);
  v_ant_desde := coalesce(p_ant_desde, p_desde - v_dias);
  -- El mapa de calor mira el período, pero nunca menos de 4 semanas (actividad 4): con un día no se ve ningún patrón.
  v_cal_desde := least(p_desde, p_hasta - 27);
  v_antes := (
    select coalesce(jsonb_object_agg(a.producto_id, a.miraron), '{}'::jsonb)
    from retail.fn_trafico_web_prendas(v_ant_desde, v_ant_hasta, p_camino, p_ciudad) a
  );
  -- La gente del período se lee UNA vez, sin filtro, y de ahí sale todo lo de estos días (actividad 6). Cada lista de filtros se cuenta
  -- sin su propio filtro (con Instagram puesto, los caminos siguen mostrando cuántos llegaron por cada uno: tocar otro cambia de camino),
  -- pero con el otro (con Trujillo puesto, los caminos son los de Trujillo). Las horas son las de la entrada, en Lima.
  with gente as (
    select g.camino, g.ciudad, g.hasta, g.entro_en, g.region from retail.fn_trafico_web_personas(p_desde, p_hasta) g
  ),
  elegida as (
    select g.* from gente g where (p_camino is null or g.camino = p_camino) and (p_ciudad is null or g.ciudad = p_ciudad)
  )
  select jsonb_build_object(
    'pasos', (
      select jsonb_build_array(
        count(*),
        count(*) filter (where e.hasta >= 1),
        count(*) filter (where e.hasta >= 2),
        count(*) filter (where e.hasta >= 3),
        count(*) filter (where e.hasta >= 4),
        count(*) filter (where e.hasta >= 5))
      from elegida e
    ),
    'caminos', (
      select coalesce(jsonb_object_agg(x.camino, x.n), '{}'::jsonb)
      from (select g.camino, count(*)::int as n from gente g where p_ciudad is null or g.ciudad = p_ciudad group by g.camino) x
    ),
    -- Cuántos de cada camino SEPARARON (actividad 5: «de cada 100 que llegan por Instagram, 4 separan»), con el filtro de ciudad.
    'caminos_separan', (
      select coalesce(jsonb_object_agg(x.camino, x.n), '{}'::jsonb)
      from (
        select g.camino, (count(*) filter (where g.hasta >= 4))::int as n
        from gente g where p_ciudad is null or g.ciudad = p_ciudad group by g.camino
      ) x
    ),
    -- Cuántas personas miraron desde cada departamento (el mapa pintado, actividad 5), como las ciudades: sin el filtro de ciudad, con el
    -- de camino. Sin departamento no entra (va en «Sin dato» de las ciudades).
    'regiones', (
      select coalesce(jsonb_object_agg(x.region, x.n), '{}'::jsonb)
      from (
        select g.region, count(*)::int as n from gente g
        where g.region is not null and (p_camino is null or g.camino = p_camino) group by g.region
      ) x
    ),
    'ciudades', (
      select coalesce(jsonb_object_agg(x.ciudad, x.n), '{}'::jsonb)
      from (select g.ciudad, count(*)::int as n from gente g where p_camino is null or g.camino = p_camino group by g.ciudad) x
    ),
    'horas', (
      select jsonb_agg(coalesce(h.n, 0) order by s.hora)
      from generate_series(0, 23) as s(hora)
      left join (
        select extract(hour from e.entro_en at time zone 'America/Lima')::int as hora, count(*)::int as n from elegida e group by 1
      ) h on h.hora = s.hora
    )
  )
  into v_estos_dias;

  return v_estos_dias || jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'anterior_desde', v_ant_desde,
    'anterior_hasta', v_ant_hasta,
    -- Con `p_ant_corte`, solo cuenta a quien entró hasta esa hora (la misma hora de ayer): hoy a las 3 p. m. se compara con ayer a las 3 p. m.
    'anterior', (
      select count(*) from retail.fn_trafico_web_personas(v_ant_desde, v_ant_hasta, p_camino, p_ciudad) a
      where p_ant_corte is null or a.entro_en <= p_ant_corte
    ),
    'anterior_corte', p_ant_corte,
    'base', (
      select jsonb_build_array(
        count(*),
        count(*) filter (where p.hasta >= 1),
        count(*) filter (where p.hasta >= 2),
        count(*) filter (where p.hasta >= 3),
        count(*) filter (where p.hasta >= 4),
        count(*) filter (where p.hasta >= 5))
      from retail.fn_trafico_web_personas(v_hoy - 89, v_hoy) p
    ),
    'prendas', (
      select coalesce(jsonb_agg(x.prenda order by x.miraron desc, x.nombre), '[]'::jsonb)
      from (
        select q.miraron, p.referencia as nombre, jsonb_build_object(
          'id', p.id,
          'nombre', p.referencia,
          'codigo', p.codigo,
          'categoria', c.nombre,
          'prefijo', c.prefijo,
          'familia', c.familia,
          'precio', (select min(v.precio) from retail.variantes v where v.producto_id = p.id and v.activo),
          'foto', (select f.url from retail.producto_fotos f where f.producto_id = p.id order by f.es_principal desc, f.orden, f.id limit 1),
          'colores_catalogo', (
            select coalesce(jsonb_agg(distinct jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex)), '[]'::jsonb)
            from retail.variantes v join retail.colores co on co.codigo = v.color_codigo
            where v.producto_id = p.id and v.activo
          ),
          'miraron', q.miraron,
          'talla', q.talla,
          'bolsa', q.bolsa,
          'separaron', q.separaron,
          'recogieron', q.recogieron,
          'anterior', coalesce((v_antes ->> p.id::text)::int, 0),
          'tallas', q.tallas,
          'colores', q.colores,
          'caminos', q.caminos
        ) as prenda
        from retail.fn_trafico_web_prendas(p_desde, p_hasta, p_camino, p_ciudad) q
        join retail.productos p on p.id = q.producto_id
        left join retail.categorias c on c.id = p.categoria_id
      ) x
    ),
    -- La serie del gráfico principal (Observatorio, actividad 2): por HORA si el período es un día, por DÍA si son varios, para estos días
    -- y para los de antes (completos, sin el corte de hora: el gráfico de Hoy muestra el ayer entero como referencia). Cada fila es
    -- [momento, entraron, vieron una prenda, separaron, recogieron], contada por la hora o el día de la primera entrada de cada persona;
    -- los momentos sin nadie no vienen (la pantalla pone el cero).
    'serie', jsonb_build_object(
      'por', case when p_hasta = p_desde then 'hora' else 'dia' end,
      'actual', (
        select coalesce(jsonb_agg(jsonb_build_array(b.k, b.e, b.v, b.s, b.r) order by b.k), '[]'::jsonb)
        from (
          select case when p_hasta = p_desde then extract(hour from x.entro_en at time zone 'America/Lima')::int
                      else ((x.entro_en at time zone 'America/Lima')::date - p_desde) end as k,
                 count(*)::int as e,
                 (count(*) filter (where x.hasta >= 1))::int as v,
                 (count(*) filter (where x.hasta >= 4))::int as s,
                 (count(*) filter (where x.hasta >= 5))::int as r
          from retail.fn_trafico_web_personas(p_desde, p_hasta, p_camino, p_ciudad) x
          group by 1
        ) b
      ),
      'antes', (
        select coalesce(jsonb_agg(jsonb_build_array(b.k, b.e, b.v, b.s, b.r) order by b.k), '[]'::jsonb)
        from (
          select case when p_hasta = p_desde then extract(hour from x.entro_en at time zone 'America/Lima')::int
                      else ((x.entro_en at time zone 'America/Lima')::date - v_ant_desde) end as k,
                 count(*)::int as e,
                 (count(*) filter (where x.hasta >= 1))::int as v,
                 (count(*) filter (where x.hasta >= 4))::int as s,
                 (count(*) filter (where x.hasta >= 5))::int as r
          from retail.fn_trafico_web_personas(v_ant_desde, v_ant_hasta, p_camino, p_ciudad) x
          group by 1
        ) b
      )
    ),
    -- El mapa de calor (actividad 4): cuántas personas entraron por primera vez en cada día de la semana y hora, en la ventana de 4
    -- semanas o más, y cuántas veces cae cada día de la semana en ella (la pantalla divide: «personas por hora, en promedio»).
    'calor', jsonb_build_object(
      'desde', v_cal_desde,
      'hasta', p_hasta,
      'dias', (
        select jsonb_agg(coalesce(d.n, 0) order by s.dia)
        from generate_series(0, 6) as s(dia)
        left join (
          select (extract(isodow from f)::int - 1) as dia, count(*)::int as n
          from generate_series(v_cal_desde, p_hasta, interval '1 day') as f
          group by 1
        ) d on d.dia = s.dia
      ),
      'celdas', (
        select coalesce(jsonb_agg(jsonb_build_array(c.dia, c.hora, c.n) order by c.dia, c.hora), '[]'::jsonb)
        from (
          select (extract(isodow from x.entro_en at time zone 'America/Lima')::int - 1) as dia,
                 extract(hour from x.entro_en at time zone 'America/Lima')::int as hora,
                 count(*)::int as n
          from retail.fn_trafico_web_personas(v_cal_desde, p_hasta, p_camino, p_ciudad) x
          group by 1, 2
        ) c
      )
    ),
    -- Tallas que piden y no hay (actividad 7): por categoría y talla de las prendas PUBLICADAS en la tienda online, cuántas personas
    -- eligieron esa talla (pasos 2 y 3) en la ventana del mapa de calor (4 semanas o más), cuántas unidades libres quedan en las tiendas
    -- (cantidad menos lo apartado, como la vitrina web) y cuántos de sus modelos ofrecen esa talla y ya no la tienen. Respeta los filtros.
    'tallas', jsonb_build_object(
      'desde', v_cal_desde,
      'hasta', p_hasta,
      'filas', (
        with publicadas as (
          select p.id as producto_id, p.categoria_id
          from retail.productos p
          join retail.vitrina_productos vp on vp.producto_id = p.id and vp.publicado
          where p.categoria_id is not null
        ),
        ofrecidas as (
          -- Cada talla que ofrece cada prenda publicada, con lo que le queda libre en las tiendas.
          select pu.categoria_id, pu.producto_id, ta.valor as talla,
                 coalesce(sum(greatest(st.cantidad - st.cantidad_apartada, 0)), 0)::int as libre
          from publicadas pu
          join retail.variantes v on v.producto_id = pu.producto_id and v.activo
          join retail.tallas ta on ta.id = v.talla_id
          left join retail.stock st on st.variante_id = v.id
            and st.ubicacion_id in (select u.id from retail.ubicaciones u where u.tipo = 'tienda' and u.activo)
          group by 1, 2, 3
        ),
        pidieron as (
          select pu.categoria_id, ta.valor as talla, count(distinct t.visitante)::int as n
          from retail.trafico_web t
          join retail.fn_trafico_web_personas(v_cal_desde, p_hasta, p_camino, p_ciudad) g on g.visitante = t.visitante
          join retail.variantes v on v.id = t.variante_id
          join retail.tallas ta on ta.id = v.talla_id
          join publicadas pu on pu.producto_id = v.producto_id
          where t.paso in (2, 3)
            and t.ocurrio_en >= (v_cal_desde::timestamp at time zone 'America/Lima')
            and t.ocurrio_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
          group by 1, 2
        ),
        por_talla as (
          select o.categoria_id, o.talla, sum(o.libre)::int as quedan, count(*)::int as modelos_con_talla,
                 (count(*) filter (where o.libre = 0))::int as sin
          from ofrecidas o
          group by 1, 2
        )
        select coalesce(jsonb_agg(jsonb_build_object(
                 'categoria', c.nombre,
                 'prefijo', c.prefijo,
                 'familia', c.familia,
                 'modelos', (select count(*) from publicadas pu where pu.categoria_id = c.id),
                 'tallas', (
                   select jsonb_agg(jsonb_build_array(pt.talla, coalesce(pd.n, 0), pt.quedan, pt.sin) order by pt.talla)
                   from por_talla pt
                   left join pidieron pd on pd.categoria_id = pt.categoria_id and pd.talla = pt.talla
                   where pt.categoria_id = c.id
                 )
               ) order by c.nombre), '[]'::jsonb)
        from retail.categorias c
        where exists (select 1 from por_talla pt where pt.categoria_id = c.id)
      )
    ),
    -- Quién entra (actividad 7): de la gente del período, cuántos entran por primera vez y cuántos ya habían entrado en los 180 días
    -- de antes (la cookie del aparato; quien borra sus cookies vuelve a ser «nuevo»), y cuántos de cada grupo separaron.
    'quienes', (
      select jsonb_build_object(
        'nuevos', count(*) filter (where not x.volvio),
        'nuevos_separan', count(*) filter (where not x.volvio and x.hasta >= 4),
        'vuelven', count(*) filter (where x.volvio),
        'vuelven_separan', count(*) filter (where x.volvio and x.hasta >= 4))
      from (
        select g.hasta, g.visitante in (
                 select t.visitante from retail.trafico_web t
                 where t.paso = 0
                   and t.ocurrio_en >= ((p_desde - 180)::timestamp at time zone 'America/Lima')
                   and t.ocurrio_en < (p_desde::timestamp at time zone 'America/Lima')
               ) as volvio
        from retail.fn_trafico_web_personas(p_desde, p_hasta, p_camino, p_ciudad) g
      ) x
    ),
    'ahora', (select count(distinct t.visitante) from retail.trafico_web t where t.ocurrio_en > now() - interval '5 minutes'),
    'ultimo_dato', (select t.ocurrio_en from retail.trafico_web t order by t.id desc limit 1)
  );
end;
$fn$;

reset lock_timeout;
