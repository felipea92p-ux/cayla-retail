-- ============================================================================
-- 20261023231000_trafico_web_lectura.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495), actividad 4: el módulo y la lectura del ERP
--
-- EL PROBLEMA PRIMERO. La tienda ya anota los pasos de cada persona (`retail.trafico_web`, 20261023230000). El ERP tiene que leerlos para
-- la pantalla Tienda web ▸ Tráfico, que solo ve el líder hasta que él la dé (ADR-0161), y contar PERSONAS, no clics: cuánta gente entró,
-- hasta qué paso llegó y si recogió.
--
-- QUÉ HACE
--   1. El módulo `trafico` (Tienda web ▸ Tráfico). Nace SIN rol (ADR-0161): solo lo ve el líder hasta que él lo da; delegable. Va con el
--      orden 63, junto al Resumen (en Roles y accesos), porque entre Recomendaciones (68) y Conf. Tienda (69) no hay lugar; en el menú va
--      donde lo puso Felipe (`lib/menu.ts`).
--   2. `retail.fn_trafico_web_ciudad(region)`: qué ciudad de la pantalla es cada departamento (La Libertad → Trujillo; Lima, Lima
--      Metropolitana y Callao → Lima…). Una sola regla para agrupar y para filtrar.
--   3. `retail.fn_trafico_web_personas(desde, hasta, camino, ciudad)`: una fila por PERSONA que entró en esos días (Lima), con el camino y
--      la ciudad de su PRIMERA entrada del período y el paso más lejano al que llegó (0 entró … 4 separó, 5 recogió). Contar así hace que
--      el recorrido nunca crezca hacia abajo (quien agrega desde la tarjeta del catálogo cuenta como que vio la prenda y eligió talla) y que
--      los caminos sumen exactamente el total. Quien manda más de 200 pasos en un día no es una persona: no se cuenta.
--   4. `retail.fn_trafico_web_prendas(desde, hasta, camino, ciudad)`: por prenda, hasta dónde llegó cada persona con ella, sus tallas,
--      sus colores y sus caminos (actividad 5).
--   5. `retail.resumen_trafico_web(desde, hasta, camino, ciudad)`: lo que dibuja la pantalla. Pide el módulo.
--
-- SE PEGA ENTERA en el SQL Editor de producción: funciones y un `insert` en `modulos`, sin políticas ni `alter` de tablas en uso. Se
-- puede pegar dos veces. Va DESPUÉS de 20261023230000 (lee su tabla).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El módulo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('trafico', 'Tienda web', 'Tráfico de la tienda web',
   'Ver cuánta gente entra a la tienda online, por dónde llega, desde qué ciudad y a qué hora, qué prendas mira y en qué paso del recorrido se va (sin datos de ninguna persona)',
   63, false, true)
on conflict (clave) do nothing;

-- ---------- 2. Qué ciudad es cada departamento ----------
create or replace function retail.fn_trafico_web_ciudad(p_region text)
returns text
language sql
immutable
set search_path = retail, public
as $fn$
  select case
    when p_region is null then 'sin_dato'
    when p_region = 'PE-LAL' then 'trujillo'
    when p_region in ('PE-LIM', 'PE-LMA', 'PE-CAL') then 'lima'
    when p_region = 'PE-ARE' then 'arequipa'
    when p_region = 'PE-LAM' then 'chiclayo'
    when p_region = 'PE-PIU' then 'piura'
    when p_region = 'PE-CUS' then 'cusco'
    when p_region like 'PE%' then 'otras'
    else 'fuera'
  end;
$fn$;
revoke all on function retail.fn_trafico_web_ciudad(text) from public, anon;
grant execute on function retail.fn_trafico_web_ciudad(text) to authenticated;

-- ---------- 3. Las personas de un período ----------
create or replace function retail.fn_trafico_web_personas(p_desde date, p_hasta date, p_camino text default null, p_ciudad text default null)
returns table (visitante uuid, camino text, ciudad text, hasta smallint)
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
    select distinct on (f.visitante) f.visitante, f.camino, retail.fn_trafico_web_ciudad(f.region) as ciudad
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
  select e.visitante, e.camino, e.ciudad, h.hasta
  from entradas e
  join hasta h on h.visitante = e.visitante
  where (p_camino is null or e.camino = p_camino)
    and (p_ciudad is null or e.ciudad = p_ciudad);
$fn$;
-- Solo la usa `resumen_trafico_web` (security definer): nadie la llama directo.
revoke all on function retail.fn_trafico_web_personas(date, date, text, text) from public, anon, authenticated;

-- ---------- 4. Las prendas de un período ----------
-- Por cada prenda, hasta dónde llegó CADA PERSONA con ella: la vio (1), eligió su talla (2), la puso en la bolsa (3), estaba en el pedido
-- que separó (4) o ese pedido se entregó (5). Contado así, el recorrido de una prenda tampoco crece hacia abajo. Las tallas y los colores
-- son los que eligieron (pasos 2 y 3); los caminos, los de la primera entrada de cada persona. Solo de la gente del período (y del filtro).
create or replace function retail.fn_trafico_web_prendas(p_desde date, p_hasta date, p_camino text default null, p_ciudad text default null)
returns table (producto_id uuid, miraron integer, talla integer, bolsa integer, separaron integer, recogieron integer, tallas jsonb, colores jsonb, caminos jsonb)
language sql
stable
security definer
set search_path = retail, public
as $fn$
  with gente as (
    select g.visitante, g.camino from retail.fn_trafico_web_personas(p_desde, p_hasta, p_camino, p_ciudad) g
  ),
  filas as (
    select t.visitante, t.paso, t.producto_id, t.variante_id, t.pedido_web_id
    from retail.trafico_web t
    join gente g on g.visitante = t.visitante
    where t.ocurrio_en >= (p_desde::timestamp at time zone 'America/Lima')
      and t.ocurrio_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
      and t.paso between 1 and 4
  ),
  con_prenda as (
    select f.producto_id, f.visitante, f.paso::int as hasta from filas f where f.paso between 1 and 3
    union all
    -- Separó la prenda si estaba en su pedido; la recogió si el pedido se entregó y esa prenda no se quitó (no había) ni se liberó.
    select x.producto_id, f.visitante, case when w.entregado_en is not null and l.estado not in ('quitada', 'liberada') then 5 else 4 end
    from filas f
    join retail.pedidos_web w on w.id = f.pedido_web_id
    join retail.pedido_web_lineas l on l.pedido_id = w.id
    join retail.variantes x on x.id = l.variante_id
    where f.paso = 4
  ),
  por_persona as (
    select c.producto_id, c.visitante, max(c.hasta) as hasta from con_prenda c group by c.producto_id, c.visitante
  ),
  conteo as (
    select p.producto_id,
      count(*)::int as miraron,
      (count(*) filter (where p.hasta >= 2))::int as talla,
      (count(*) filter (where p.hasta >= 3))::int as bolsa,
      (count(*) filter (where p.hasta >= 4))::int as separaron,
      (count(*) filter (where p.hasta >= 5))::int as recogieron
    from por_persona p
    group by p.producto_id
  ),
  tallas as (
    select x.producto_id, ta.valor, count(distinct f.visitante)::int as n
    from filas f
    join retail.variantes x on x.id = f.variante_id
    join retail.tallas ta on ta.id = x.talla_id
    where f.paso in (2, 3)
    group by x.producto_id, ta.valor
  ),
  colores as (
    select x.producto_id, co.codigo, co.nombre, co.hex, count(distinct f.visitante)::int as n
    from filas f
    join retail.variantes x on x.id = f.variante_id
    join retail.colores co on co.codigo = x.color_codigo
    where f.paso in (2, 3)
    group by x.producto_id, co.codigo, co.nombre, co.hex
  ),
  caminos as (
    select p.producto_id, g.camino, count(*)::int as n
    from por_persona p
    join gente g on g.visitante = p.visitante
    group by p.producto_id, g.camino
  )
  select c.producto_id, c.miraron, c.talla, c.bolsa, c.separaron, c.recogieron,
    coalesce((select jsonb_agg(jsonb_build_object('talla', t.valor, 'n', t.n) order by t.n desc, t.valor) from tallas t where t.producto_id = c.producto_id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('codigo', k.codigo, 'nombre', k.nombre, 'hex', k.hex, 'n', k.n) order by k.n desc, k.nombre) from colores k where k.producto_id = c.producto_id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('camino', m.camino, 'n', m.n) order by m.n desc, m.camino) from caminos m where m.producto_id = c.producto_id), '[]'::jsonb)
  from conteo c;
$fn$;
-- Solo la usa `resumen_trafico_web` (security definer): nadie la llama directo.
revoke all on function retail.fn_trafico_web_prendas(date, date, text, text) from public, anon, authenticated;

-- ---------- 5. Lo que dibuja la pantalla ----------
-- `pasos`: cuántas personas llegaron AL MENOS hasta cada paso: [entraron, vieron una prenda, eligieron talla, a la bolsa, separaron,
-- recogieron]. `anterior`: cuántas entraron en los días de antes, del mismo largo. `base`: los mismos `pasos` de los últimos 90 días de
-- toda la tienda (sin filtro): con eso la pantalla decide dónde se atora sin que dos personas muevan el veredicto (ADR-0495).
-- `ahora`: personas con un paso en los últimos 5 minutos. `ultimo_dato`: el último paso que llegó (por su id, que crece con el tiempo:
-- usa la llave primaria y no recorre la tabla). `prendas`: las que alguien miró, de la más mirada a la menos, con su recorrido, sus tallas,
-- sus colores (los elegidos y los del catálogo, para dibujarla aunque nadie haya elegido color), sus caminos, su foto principal y cuántas
-- personas la miraron en los días de antes (calculado UNA vez para todas, no una vez por prenda).
create or replace function retail.resumen_trafico_web(p_desde date, p_hasta date, p_camino text default null, p_ciudad text default null)
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
begin
  if not retail.fn_ve_modulo('trafico') then
    raise exception 'Tu rol no ve «Tráfico de la tienda web».' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El período no es válido.' using errcode = '22023';
  end if;
  v_dias := p_hasta - p_desde + 1;
  v_ant_hasta := p_desde - 1;
  v_ant_desde := p_desde - v_dias;
  v_antes := (
    select coalesce(jsonb_object_agg(a.producto_id, a.miraron), '{}'::jsonb)
    from retail.fn_trafico_web_prendas(v_ant_desde, v_ant_hasta, p_camino, p_ciudad) a
  );

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'anterior_desde', v_ant_desde,
    'anterior_hasta', v_ant_hasta,
    'pasos', (
      select jsonb_build_array(
        count(*),
        count(*) filter (where p.hasta >= 1),
        count(*) filter (where p.hasta >= 2),
        count(*) filter (where p.hasta >= 3),
        count(*) filter (where p.hasta >= 4),
        count(*) filter (where p.hasta >= 5))
      from retail.fn_trafico_web_personas(p_desde, p_hasta, p_camino, p_ciudad) p
    ),
    'anterior', (select count(*) from retail.fn_trafico_web_personas(v_ant_desde, v_ant_hasta, p_camino, p_ciudad)),
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
    'ahora', (select count(distinct t.visitante) from retail.trafico_web t where t.ocurrio_en > now() - interval '5 minutes'),
    'ultimo_dato', (select t.ocurrio_en from retail.trafico_web t order by t.id desc limit 1)
  );
end;
$fn$;

comment on function retail.resumen_trafico_web(date, date, text, text) is
  'Tienda web ▸ Tráfico (ADR-0495): personas que entraron a la tienda online en esos días (Lima) y hasta qué paso llegaron, contra los días de antes; con filtro de camino y de ciudad. Pide el módulo trafico.';

revoke all on function retail.resumen_trafico_web(date, date, text, text) from public, anon;
grant execute on function retail.resumen_trafico_web(date, date, text, text) to authenticated;

reset lock_timeout;
