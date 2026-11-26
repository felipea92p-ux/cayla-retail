-- Margen por rasgos (ADR-0700): lo que tienen las prendas de una página de Catálogo ▸ Productos, en una sola consulta. Una sola parte.
--
-- EL PROBLEMA PRIMERO. La lista de Productos medía el margen con la resta con IGV adentro y un ámbar fijo en 45 %, mientras la ficha de
-- la prenda ya mide con la cuenta única (ADR-0668) y contra el objetivo de esa prenda (la base más lo que tiene). La misma prenda decía un %
-- en la lista y otro al abrirla. Para medir cada fila contra su objetivo, la lista necesita lo que tiene cada prenda de la página.
--
-- QUÉ CREA.
--   1. `fn_rasgos_de_productos(uuid[])`: para cada prenda pedida que tenga algo, lo que tiene en efecto (casillas guardadas, la tela por
--      su tejido si nadie la dijo, la marca por la lista del Admin), como `{ "<id>": ["en_tendencia", …] }`. Las que no tienen nada no
--      vienen. Hasta 200 por llamada (la página son 20).
--   2. `fn_rasgos_de_producto(uuid)` (20261124180000) pasa a ser esa misma consulta con una sola prenda: una regla, un lugar.
--
-- DECIDÍ: una consulta aparte por página, como la de las descripciones (`listarProductos`).
-- DESCARTÉ: sumarlo a `fn_productos_listado`: es la función que pagina y filtra el catálogo entero (y su `select` lo anclan otras
-- migraciones) por un dato que solo cambia un color; y una llamada por fila (20 viajes por página).
-- SE ROMPE SI: la consulta falla o la base no la tiene todavía: la lista mide todas las prendas con la base (sin casillas), como si ninguna
-- tuviera nada. Ningún precio cambia: es solo el color con que se avisa.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Después de 20261124180000 (su tabla y su función). Una parte: una función nueva y
-- el reemplazo entero de una función nueva de ADR-0700 que todavía no está en producción. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_rasgos_de_productos(p_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) > 200 then
    raise exception 'Son muchas prendas a la vez: hasta 200.' using hint = 'rasgos_muchas_prendas';
  end if;
  -- El orden de cada lista es el de la hoja (el de `RASGOS` en la web).
  return coalesce((
    select jsonb_object_agg(x.id, to_jsonb(x.rasgos))
      from (
        select p.id,
               array_remove(array[
                 case when coalesce(r.nadie_la_tiene, false) then 'nadie_la_tiene' end,
                 case when coalesce(r.en_tendencia, false) then 'en_tendencia' end,
                 case when coalesce(r.tela_que_se_nota, t.se_nota, false) then 'tela_que_se_nota' end,
                 case when coalesce(m.conocida, false) then 'marca_conocida' end], null) as rasgos
          from retail.productos p
          left join retail.producto_rasgos r on r.producto_id = p.id
          left join retail.tejidos t on t.id = p.tejido_id
          left join retail.marcas m on m.id = p.marca_id
         where p.id = any (p_ids)
      ) x
     where cardinality(x.rasgos) > 0
  ), '{}'::jsonb);
end $$;

comment on function retail.fn_rasgos_de_productos(uuid[]) is
  'ADR-0700: lo que tienen en efecto varias prendas (hasta 200), { id: [rasgos] }; las que no tienen nada no vienen.';
revoke all on function retail.fn_rasgos_de_productos(uuid[]) from public, anon;
grant execute on function retail.fn_rasgos_de_productos(uuid[]) to authenticated;

-- Una prenda: la misma consulta.
create or replace function retail.fn_rasgos_de_producto(p_producto_id uuid)
returns text[]
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v jsonb;
begin
  v := retail.fn_rasgos_de_productos(array[p_producto_id]) -> p_producto_id::text;
  return coalesce(array(select e.r from jsonb_array_elements_text(v) with ordinality e(r, n) order by e.n), '{}'::text[]);
end $$;

revoke all on function retail.fn_rasgos_de_producto(uuid) from public, anon;
grant execute on function retail.fn_rasgos_de_producto(uuid) to authenticated;

reset lock_timeout;
