-- 20261119002000_trafico_web_un_dia_sin_medir.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495)
--
-- QUÉ ARREGLA. El 2026-11-18, desde las 6:53 p. m., Tráfico ▸ «Hoy» mostraba «No se pudo leer el tráfico de la tienda web»: la base cortaba
-- `resumen_trafico_web` a los 8 s que Supabase le deja a quien tiene sesión (57014, 11 cortes en el registro de Postgres). Los demás
-- períodos abrían. No faltaba ningún dato: ese día iban 372 pasos de 340 personas.
--
-- POR QUÉ TARDABA. Postgres elige cómo ejecutar una consulta según una medición de la tabla (`analyze`) que rehace sola cuando las filas
-- nuevas pasan de 50 + 10 % de la tabla. La última era de las 10:55 p. m. del 17 y la primera visita del 18 entró a las 12:06 a. m.: para
-- la base, el día de hoy no existía. Calculaba 1 fila (eran 372), y `fn_trafico_web_personas`, que une la lista de pasos del período
-- consigo misma tres veces (los raros, las entradas y hasta dónde llegó cada una), lo hacía con bucles anidados, que crecen al cubo con la
-- gente del día. Medido en producción, la misma función con casi la misma gente: el 17 (medido), 7 ms; el 18 (sin medir), 3.114 ms, y el
-- resumen la llama 4 veces para el día. Con solo medir la tabla (`analyze retail.trafico_web`), el 18 bajó a 7 ms. El umbral hacía falta
-- 456 filas nuevas e iban 387; como es el 10 % de la tabla, crece con ella: iba a fallar cada tarde un poco más temprano.
--
-- Es la misma fragilidad que arregló 20261101004000 por otro lado (ahí la función no se abría dentro de la consulta y se planificaba a
-- ciegas): un cruce de la tabla consigo misma cuyo costo depende de que Postgres adivine bien cuántas filas hay.
--
-- QUÉ HACE.
--   1. `fn_trafico_web_personas` cuenta en UNA pasada, sin cruzar la lista consigo misma: cada paso lleva cuántos mandó esa persona ese día
--      y hasta dónde llegó (funciones de ventana), y de ahí sale la primera entrada de cada una. Ya no hay ningún cruce que elegir, así
--      que tarda lo mismo calcule Postgres 1 fila o 10.000. Devuelve exactamente lo mismo que antes: las mismas columnas, las mismas
--      personas, el mismo camino y la misma ciudad (los 86 casos de `pruebas:tienda-trafico-resumen` no cambian).
--   2. `retail.trafico_web` se vuelve a medir sola cada 50 pasos nuevos, no cada 10 % de la tabla: el día de hoy nunca queda con más de
--      unas decenas de pasos sin medir. Protege también a `fn_trafico_web_prendas` y a las tallas, que cruzan esta tabla con otras. Medir
--      esta tabla tarda milisegundos y no bloquea a quien anota ni a quien lee.
--
-- QUÉ NO HACE. No toca datos ni políticas, y no cambia quién puede ver qué: `create or replace` conserva el `revoke` de 20261029050000 y
-- la función sigue sin `security definer` ni `set search_path` (20261101004000). `alter table … set (…)` solo cambia cuándo se mide la
-- tabla (no bloquea lecturas ni escrituras). Se puede pegar entera, de una vez, y dos veces.
-- Para volver atrás: la función de 20261029050000 (sin `security definer` ni `set search_path`) y
-- `alter table retail.trafico_web reset (autovacuum_analyze_scale_factor, autovacuum_analyze_threshold);`.
--
-- LO VIGILA `pruebas:tienda-trafico-resumen` (caso 19): mide la tabla, DESPUÉS mete un día con 600 personas y pide el resumen de ese día
-- con el tope de 8 s. Con la función anterior se corta con el mismo 57014 de producción.
--
-- EN PRODUCCIÓN desde el 2026-11-18, aplicada con el conector de Supabase con el OK de Felipe: `schema_migrations` la registra con la
-- hora de aplicación (20261119001719), no con la versión de este archivo. Antes de aplicarla se comparó allá, con los datos reales, la
-- función nueva contra la anterior: 17 períodos por 8 filtros, 33.712 filas, ninguna diferencia. Después, `resumen_trafico_web` de «Hoy»
-- como líder y con el tope de 8 s respondió en 231 ms.

set lock_timeout = '3s';

-- ---------- 1. Las personas del período, en una pasada ----------
create or replace function retail.fn_trafico_web_personas(p_desde date, p_hasta date, p_camino text default null, p_ciudad text default null)
returns table (visitante uuid, camino text, ciudad text, hasta smallint, entro_en timestamptz, region text)
language sql
stable
as $fn$
  with filas as (
    select t.id, t.visitante, t.ocurrio_en, t.paso, t.camino, t.region,
      -- Hasta dónde llega este paso: separar cuenta como recoger (5) si su pedido ya se entregó.
      case
        when t.paso = 4 and exists (select 1 from retail.pedidos_web w where w.id = t.pedido_web_id and w.entregado_en is not null) then 5
        else t.paso
      end as llego,
      -- Cuántos pasos mandó esta persona ese día (Lima).
      count(*) over (partition by t.visitante, (t.ocurrio_en at time zone 'America/Lima')::date) as pasos_del_dia
    from retail.trafico_web t
    where t.ocurrio_en >= (p_desde::timestamp at time zone 'America/Lima')
      and t.ocurrio_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
  ),
  por_persona as (
    select f.id, f.visitante, f.ocurrio_en, f.paso, f.camino, f.region,
      max(f.llego) over (partition by f.visitante) as hasta,
      max(f.pasos_del_dia) over (partition by f.visitante) as peor_dia
    from filas f
  ),
  -- La primera entrada del período de cada persona. Quien mandó más de 200 pasos en un día no es una persona.
  entradas as (
    select distinct on (p.visitante) p.visitante, p.camino, retail.fn_trafico_web_ciudad(p.region) as ciudad, p.hasta::smallint as hasta,
      p.ocurrio_en as entro_en, p.region
    from por_persona p
    where p.paso = 0 and p.peor_dia <= 200
    order by p.visitante, p.ocurrio_en, p.id
  )
  select e.visitante, e.camino, e.ciudad, e.hasta, e.entro_en, e.region
  from entradas e
  where (p_camino is null or e.camino = p_camino)
    and (p_ciudad is null or e.ciudad = p_ciudad);
$fn$;

-- ---------- 2. La tabla se mide sola cada 50 pasos nuevos ----------
alter table retail.trafico_web set (autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 50);

reset lock_timeout;
