-- ============================================================================
-- 20261029050000_trafico_web_regiones.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495), «Observatorio», actividad 5
--
-- EL PROBLEMA PRIMERO. «De dónde vienen» dibujaba un círculo por ciudad y juntaba en «Otras ciudades» a 19 departamentos. Felipe pidió
-- el contorno real del Perú con cada departamento pintado más oscuro mientras más gente mira desde ahí: para eso hace falta contar por
-- departamento, no por ciudad. Y «por camino» decía cuántos llegan, no cuántos de ellos separan: Instagram puede traer mucha gente que
-- no compra.
--
-- QUÉ HACE.
--   1. `retail.fn_trafico_web_personas` devuelve también `region`, el departamento (ISO 3166-2) de la primera entrada, como última
--      columna. Se borra y se vuelve a crear (cambia lo que devuelve); quien la llama elige sus columnas por nombre.
--   2. `retail.resumen_trafico_web` (la de 7 parámetros) suma `regiones` ({ 'PE-LAL': 412, … }: personas por departamento, con el filtro
--      de camino y sin el de ciudad, como `ciudades`) y `caminos_separan` ({ instagram: 31, … }: cuántos de cada camino separaron, con
--      el filtro de ciudad, como `caminos`). Todo lo demás queda igual, con la misma firma.
--
-- QUÉ NO HACE. No cambia permisos (sigue pidiendo el módulo «trafico»), ni toca tablas, ni cómo se cuenta a una persona.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Después de 20261029015000, 20261029040000 y 20261029042000. Entera, de una vez: `drop function` y `create
-- or replace` de funciones, sin políticas ni tablas en uso. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las personas de un período, con su departamento ----------
-- Devuelve también el departamento de la primera entrada (`region`, ISO 3166-2), al final: quien la llama elige sus columnas por nombre,
-- así que nadie más cambia. Cambiar lo que devuelve pide borrarla antes (`create or replace` no puede); `drop function` no toma las
-- tablas de auth ni de storage.
drop function if exists retail.fn_trafico_web_personas(date, date, text, text);
create or replace function retail.fn_trafico_web_personas(p_desde date, p_hasta date, p_camino text default null, p_ciudad text default null)
returns table (visitante uuid, camino text, ciudad text, hasta smallint, entro_en timestamptz, region text)
language sql
stable
security definer
set search_path = retail, public
as $fn$
  with filas as (
    select t.id, t.visitante, t.ocurrio_en, t.paso, t.camino, t.region, t.pedido_web_id
    from retail.trafico_web t
    where t.ocurrio_en >= (p_desde::timestamp at time zone 'America/Lima')
      and t.ocurrio_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
  ),
  raros as (
    select f.visitante
    from filas f
    group by f.visitante, (f.ocurrio_en at time zone 'America/Lima')::date
    having count(*) > 200
  ),
  entradas as (
    select distinct on (f.visitante) f.visitante, f.camino, retail.fn_trafico_web_ciudad(f.region) as ciudad, f.ocurrio_en as entro_en, f.region
    from filas f
    where f.paso = 0 and not exists (select 1 from raros r where r.visitante = f.visitante)
    order by f.visitante, f.ocurrio_en, f.id
  ),
  hasta as (
    select f.visitante,
      max(case
        when f.paso = 4 and exists (select 1 from retail.pedidos_web w where w.id = f.pedido_web_id and w.entregado_en is not null) then 5
        else f.paso
      end)::smallint as hasta
    from filas f
    join entradas e on e.visitante = f.visitante
    group by f.visitante
  )
  select e.visitante, e.camino, e.ciudad, h.hasta, e.entro_en, e.region
  from entradas e
  join hasta h on h.visitante = e.visitante
  where (p_camino is null or e.camino = p_camino)
    and (p_ciudad is null or e.ciudad = p_ciudad);
$fn$;
-- Solo la usa `resumen_trafico_web` (security definer): nadie la llama directo.
revoke all on function retail.fn_trafico_web_personas(date, date, text, text) from public, anon, authenticated;

-- ---------- 2. El resumen, con los departamentos y cuántos separan por camino ----------
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
    'ahora', (select count(distinct t.visitante) from retail.trafico_web t where t.ocurrio_en > now() - interval '5 minutes'),
    'ultimo_dato', (select t.ocurrio_en from retail.trafico_web t order by t.id desc limit 1)
  );
end;
$fn$;

reset lock_timeout;
