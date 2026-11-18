-- ============================================================================
-- Mis compras ▸ Mis envíos: «faltaron» dice lo que de verdad faltó — SOLO LECTURA.
--
-- EL PROBLEMA (corrida de /flujo-de-negocio `recibir/con-aviso-de-compras`, 2026-11-12, main ef26a8a0). Compras mandó 15 prendas a Trujillo;
-- la tienda contó 16 (faltó 1 pantalón, sobraron 2 chalecos) y dejó «para después» las 9 prendas nuevas que todavía no se crean (ADR-0393,
-- ADR-0608). Compras vio «Recibido · faltaron 10» y el aviso «Faltaron 10: Compras lo revisa con el proveedor». La causa: `contadas` sumaba
-- `despacho_recibidos`, que es solo lo que YA ENTRÓ al stock (aquí, los 5 vestidos). Lo contado que espera a que alguien lo cree, lo de más y
-- lo dañado no estaban en esa cuenta, y la pantalla restaba «salieron − contadas». La función nació el 2026-10-26, antes de que una prenda
-- contada pudiera quedarse fuera del stock al cerrar (ADR-0608, 2026-11-03).
--
-- LA DECISIÓN (Felipe, 2026-11-12: «Sí, corrígelo»). Lo que faltó y lo que sobró ya tienen una fuente de verdad: `despacho_diferencias`
-- (vigentes). El cierre exige una causa para cada una (ADR-0604) y de ahí salen «Nos debe» y el reclamo al proveedor. Esta función las lee de
-- ahí en vez de despejarlas con una resta:
--   · `faltaron`: la suma de los faltantes vigentes (no vino, se perdió, llegó a otra sede, devuelta por dañada).
--   · `sobraron`: la suma de los sobrantes vigentes (regalo, se cobra aparte, próxima compra, reposición, otro).
--   · `contadas`: todo lo que la tienda contó (`despacho_conteos.contadas`, que no cambia al llevar al stock). Un envío recibido antes de que
--     existiera el conteo solo tiene `despacho_recibidos`: por eso el mayor de los dos.
-- Un envío reabierto deja sus diferencias como no vigentes hasta el nuevo cierre (ADR-0393): mientras está abierto, la web no muestra faltantes.
--
-- COMPATIBLE EN LOS DOS ÓRDENES DE PUBLICACIÓN: solo agrega dos claves y corrige una. La web anterior ignora las claves nuevas (y con
-- `contadas` corregida ya deja de inventar faltantes); la web nueva, sin las claves (función vieja), cae a la resta de antes.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA sola parte: solo `create or replace function` y sus permisos; ni `alter table`, ni
-- políticas, ni disparadores (ADR-0195). Idempotente.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_mis_envios()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver tus envíos necesita el módulo Mis compras en tu rol.' using errcode = '42501';
  end if;
  -- Desde una terminal no hay «tus envíos»: no se inventa una persona.
  if v_yo is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x.fila order by x.despachado_en desc, x.numero desc)
      from (
        select d.despachado_en, d.numero,
               jsonb_build_object(
                 'id', d.id,
                 'numero', retail.fn_envio_numero_texto(d.numero),
                 'estado', d.estado,
                 'destino_id', u.id,
                 'destino', u.nombre,
                 'bultos', coalesce(d.bultos, 1),
                 'despachado_en', d.despachado_en,
                 'abierto_en', d.abierto_en,
                 'cerrado_en', d.cerrado_en,
                 'cerrado_por', nullif(btrim(concat_ws(' ', pce.nombres, pce.apellidos)), ''),
                 'anulado_en', d.anulado_en,
                 'motivo_anulacion', d.motivo_anulacion,
                 'unidades', (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di where di.despacho_id = d.id),
                 -- Todo lo contado (también lo que espera «para después», lo de más y lo dañado), no solo lo que ya entró al stock.
                 'contadas', greatest(
                   (select coalesce(sum(dc.contadas), 0)::integer from retail.despacho_conteos dc where dc.despacho_id = d.id),
                   (select coalesce(sum(r.cantidad), 0)::integer from retail.despacho_recibidos r where r.despacho_id = d.id)),
                 -- Lo que faltó y lo que sobró, con su causa ya dicha al cerrar: la misma fila de «Nos debe».
                 'faltaron', (select coalesce(sum(df.cantidad), 0)::integer from retail.despacho_diferencias_vigentes df
                               where df.despacho_id = d.id and df.tipo = 'faltante'),
                 'sobraron', (select coalesce(sum(df.cantidad), 0)::integer from retail.despacho_diferencias_vigentes df
                               where df.despacho_id = d.id and df.tipo = 'sobrante'),
                 'ronda_id', ro.id,
                 'ronda', retail.fn_ronda_compras_texto(ro.id),
                 'ronda_abierta_en', ro.abierta_en,
                 'ronda_cerrada_en', ro.cerrada_en,
                 -- Las compras (papeles) que salieron en este envío: la lista de Mis compras dice «enviada · ENV-…» en cada una.
                 'papel_ids', ro.papeles,
                 'lineas', coalesce((
                   select jsonb_agg(jsonb_build_object('nombre', coalesce(di.descripcion, c.nombre), 'cantidad', di.cantidad) order by i.posicion)
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                     join retail.categorias c on c.id = di.categoria_id
                    where di.despacho_id = d.id), '[]'::jsonb)
               ) as fila
          from retail.despachos d
          join retail.ubicaciones u on u.id = d.ubicacion_destino_id
          left join public.personas pce on pce.id = d.cerrado_por
          -- Solo los que salieron de una compra anotada en Mis compras (un envío que Compras armó de una orden no es de la compradora).
          -- La ronda es la de esa compra; una compra de antes de las rondas no la tiene (`ro.id` nulo).
          join lateral (
            select (array_agg(r.id order by r.abierta_en nulls last))[1] as id,
                   (array_agg(r.abierta_en order by r.abierta_en nulls last))[1] as abierta_en,
                   (array_agg(r.cerrada_en order by r.abierta_en nulls last))[1] as cerrada_en,
                   to_jsonb(array_agg(distinct p.id)) as papeles
              from retail.despacho_items di
              join retail.orden_compra_items i on i.id = di.orden_compra_item_id
              join retail.ordenes_compra o on o.id = i.orden_compra_id
              join retail.compra_papeles p on p.id = o.papel_id
              left join retail.compra_rondas r on r.id = p.ronda_id
             where di.despacho_id = d.id
            having count(*) > 0) ro on true
         where d.despachado_por = v_yo
         order by d.despachado_en desc, d.numero desc
         limit 300) x), '[]'::jsonb);
end $$;
comment on function retail.fn_mis_envios() is
  'Mis compras: los envíos que mandó quien mira (código ENV-…, estado, tienda, fardos, prendas enviadas y contadas, lo que faltó y sobró según las diferencias vigentes del cierre, su ronda y lo que llevaba). Solo lectura.';
revoke all on function retail.fn_mis_envios() from public, anon;
grant execute on function retail.fn_mis_envios() to authenticated;

notify pgrst, 'reload schema';
