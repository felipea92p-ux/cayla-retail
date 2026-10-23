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
--   4. `retail.resumen_trafico_web(desde, hasta, camino, ciudad)`: lo que dibuja la pantalla. Pide el módulo.
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

-- ---------- 4. Lo que dibuja la pantalla ----------
-- `pasos`: cuántas personas llegaron AL MENOS hasta cada paso: [entraron, vieron una prenda, eligieron talla, a la bolsa, separaron,
-- recogieron]. `anterior`: cuántas entraron en los días de antes, del mismo largo. `base`: los mismos `pasos` de los últimos 90 días de
-- toda la tienda (sin filtro): con eso la pantalla decide dónde se atora sin que dos personas muevan el veredicto (ADR-0495).
-- `ahora`: personas con un paso en los últimos 5 minutos. `ultimo_dato`: el último paso que llegó (por su id, que crece con el tiempo:
-- usa la llave primaria y no recorre la tabla).
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
