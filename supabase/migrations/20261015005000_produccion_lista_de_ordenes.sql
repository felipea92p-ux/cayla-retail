-- ADR-0400, actividad 5 (2026-10-15): la lista de Órdenes del Taller, en UNA lectura.
--
-- EL PROBLEMA
--   La lista de Órdenes de hoy lee las tablas de `producciones` con una consulta de la web y no sabe nada de las fases: no puede decir «En costura con
--   Confecciones del Norte, 48 afuera», ni «la tela no alcanza», ni «4 días sin moverse». Esos datos ya los resuelve `fn_orden_produccion` para la
--   página de UNA orden; repetir su lógica en TypeScript para N órdenes sería la segunda copia que se desfasa.
--
-- CÓMO (esta migración, solo lectura)
--   `fn_ordenes_produccion_lista(p_ubicacion_id, p_historicas)` recorre las órdenes de ese Taller —todas las que están en proceso y las
--   `p_historicas` terminadas o anuladas más recientes— y devuelve, de cada una, lo mismo que `fn_orden_produccion` salvo lo que la lista no pinta:
--   sin `costos` (null) y con solo el último movimiento de la línea de tiempo (basta para «días sin moverse»). Así la lista y la página no pueden
--   contradecirse (mismas fases, misma tela, mismo veredicto), y los costos del Taller no viajan a una pantalla que no los muestra.
--   Además cuenta, exacto y sin depender del límite, lo que pasó al stock este mes (lotes, no muestras): la cifra «Al stock este mes».
--
-- DESCARTÉ
--   · Una tabla o vista materializada de la lista: son cientos de órdenes como mucho, y una copia derivada es una fuente de verdad más (principio 4).
--   · Volver a escribir en SQL el veredicto de la tela y las tres causas rojas: dos fórmulas para lo mismo. La web las sigue calculando con las
--     reglas puras de la página (`rojoDeLaOrden`), que ya tienen su prueba.
--   · Paginar en la base: con 60 órdenes la lista cabe en una lectura; si algún día no cabe, se pagina entonces.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 155000, que define `fn_orden_produccion`; el orden respecto de 160000 da igual: se
-- resuelve al llamar): solo `create or replace function` sobre una función nueva,
-- sin políticas ni `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_ordenes_produccion_lista(p_ubicacion_id uuid, p_historicas integer default 40) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid; v_o jsonb; v_filas jsonb := '[]'::jsonb; v_desde timestamptz; v_lotes integer; v_prendas integer;
begin
  -- Quien ve `produccion` parado en ese Taller, o el líder (la misma puerta que `fn_orden_produccion`). Si no: NULL, la pantalla dice «no se pudo leer».
  if p_ubicacion_id is null or not retail.fn_produccion_puede_leer(p_ubicacion_id) then return null; end if;

  for v_id in
    select x.id
      from (
        select p.id, p.estado, p.created_at,
               row_number() over (partition by (p.estado = 'en_proceso') order by p.created_at desc, p.id) as posicion
          from retail.producciones p
         where p.ubicacion_id = p_ubicacion_id
      ) x
     where x.estado = 'en_proceso' or x.posicion <= greatest(coalesce(p_historicas, 0), 0)
     order by x.created_at desc, x.id
  loop
    v_o := retail.fn_orden_produccion(v_id);
    if v_o is null then continue; end if;
    v_filas := v_filas || jsonb_build_array(
      (v_o - 'costos' - 'linea_de_tiempo')
      || jsonb_build_object(
           'costos', null,
           'linea_de_tiempo', case when jsonb_array_length(coalesce(v_o -> 'linea_de_tiempo', '[]'::jsonb)) > 0 then jsonb_build_array(v_o -> 'linea_de_tiempo' -> 0) else '[]'::jsonb end));
  end loop;

  -- Lo que pasó al stock este mes (de Lima), sin contar muestras: exacto, no depende de cuántas terminadas trae la lista.
  v_desde := date_trunc('month', retail.fn_hoy_lima()::timestamp) at time zone 'America/Lima';
  select count(*)::integer, coalesce(sum(p.cantidad_buenas), 0)::integer
    into v_lotes, v_prendas
    from retail.producciones p
   where p.ubicacion_id = p_ubicacion_id and p.estado = 'terminada' and not p.es_muestra and p.inventariado_at >= v_desde;

  return jsonb_build_object('ordenes', v_filas, 'al_stock_mes', jsonb_build_object('lotes', v_lotes, 'prendas', v_prendas));
end;
$$;

comment on function retail.fn_ordenes_produccion_lista(uuid, integer) is
  'ADR-0400 (actividad 5): la lista de Órdenes del Taller en una lectura — lo mismo que fn_orden_produccion de cada orden, sin costos y con solo el último movimiento — y lo que pasó al stock este mes. NULL si no se puede leer.';

revoke all on function retail.fn_ordenes_produccion_lista(uuid, integer) from public, anon;
grant execute on function retail.fn_ordenes_produccion_lista(uuid, integer) to authenticated, service_role;

reset lock_timeout;
