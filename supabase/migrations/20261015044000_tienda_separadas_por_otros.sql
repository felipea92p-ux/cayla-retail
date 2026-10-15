-- ============================================================================
-- 20261015044000_tienda_separadas_por_otros.sql — CAYLA V2 · Tienda online (ADR-0408), integración de la ficha: la propuesta k
--
-- EL PROBLEMA PRIMERO. Una clienta mira la Blusa Emma negra talla M en Trujillo y la ficha dice «Última». Lo que no sabe es que
-- hace una hora otra persona ya la separó en la web para recogerla en Trujillo: separar no toca el stock (el pedido espera que la
-- tienda lo confirme, 20261014235000), así que la prenda sigue libre hasta que alguien confirme. Si nadie se lo dice, separa
-- confiada y al rato la tienda le escribe que ya no está. La maqueta aprobada (docs/maquetas/tienda-online-2026-10, `vProducto`,
-- propuesta k) se lo avisa antes, sin asustarla ni frenarla: «Otra persona ya separó la última en Trujillo. Igual puedes
-- separarla: la tienda te confirma o te ofrece otra opción.»
--
-- ANALOGÍA CAYLA. El cuaderno de pedidos junto a la caja: la vendedora ve que hay una M negra en el colgador y un papelito
-- «separada por WhatsApp, por confirmar». No le dice a la siguiente clienta quién la pidió ni cuántos papelitos hay: solo «ojo,
-- esta ya la pidieron».
--
-- LO QUE HACE. `retail.tienda_separadas_por_otros(p_usuario_web_id, p_producto, p_sede)`, para la tienda (rol `tienda_web`): por
-- cada talla activa del modelo, un sí o un no. Sí cuando lo que queda LIBRE de esa prenda en esa tienda ya lo cubren las prendas de
-- los pedidos web POR CONFIRMAR de OTROS clientes que la recogen en esa misma tienda (y que todavía no pasaron su plazo). «Lo libre»
-- es la MISMA pieza de la ficha, `fn_tienda_disponible` (20261015012000: piso + almacén, sin Cuarentena ni lo apartado, que ya
-- incluye las reservas de los pedidos confirmados), sin una regla propia. `null` si no hay cuenta, si el modelo no se ve en la web o
-- si la tienda no es una de la web (con «Todas» la ficha no avisa nada, como la maqueta).
--
-- QUÉ SE GARANTIZA Y DÓNDE
--   · Nunca sale una cifra ni quién: solo `{"<talla>": true|false}` (el id de cada talla activa del modelo). Ni cuántos pedidos,
--     ni cuántas prendas, ni de quién.
--   · Lo de la propia cuenta no cuenta: su pedido no le avisa «otra persona».
--   · Un pedido que ya pasó su plazo (las horas de Configuración ▸ Tienda web, `configuracion_tienda_web.horas_para_confirmar`)
--     se lee vencido aunque el cierre programado todavía no haya corrido, como en el ERP (`fn_pedidos_web_estado_hoy`).
--   · Sin nada libre en esa tienda no hay nada que avisar (la ficha ya dice «Otra tienda» o «Avísame»): no.
--
-- DECIDÍ: unidades, no pedidos (la maqueta cuenta pedidos): una línea del pedido web es una prenda, y dos pedidos de una prenda
--   cada uno cubren dos libres. DECIDÍ: el texto (la última / las que quedan) lo arma la ficha con el nivel que ya muestra; aquí
--   solo el sí o el no.
-- DESCARTÉ: sumarlo a `tienda_ficha` (lo leen sin cuenta las pruebas y el ERP no lo necesita, y la ficha tendría que saber quién
--   mira); devolver cuántas quedan sin separar (es la cifra exacta que ADR-0408 DECIDÍ 6 no deja salir).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va después de 20261014231000 (tiendas de la web), 20261014235000
-- (el pedido web) y 20261015012000 (la ficha). Una sola parte, re-ejecutable: solo `create or replace function`, `comment`, `revoke`
-- y `grant`; sin tablas, sin políticas ni disparadores (ADR-0195). Ningún `select … into` dentro de un texto entre comillas
-- (ADR-0288). Prueba: `pnpm pruebas:tienda-separadas` (con `-- --mutantes`, contra versiones rotas a propósito).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $$
begin
  if to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null or to_regprocedure('retail.fn_tienda_sedes_web()') is null then
    raise exception 'Falta la ficha de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regclass('retail.pedidos_web') is null or to_regclass('retail.pedido_web_lineas') is null then
    raise exception 'Falta el pedido web: pega antes 20261014235000_pedidos_web_modelo.sql.';
  end if;
  if to_regclass('retail.cuentas_web') is null or to_regclass('retail.configuracion_tienda_web') is null then
    raise exception 'Faltan las cuentas o la configuración de la tienda web (20261014224000, 20261014231000).';
  end if;
end
$$;

-- ---------- 1. ¿Otros ya separaron lo que queda? ----------
create or replace function retail.tienda_separadas_por_otros(p_usuario_web_id uuid, p_producto uuid, p_sede uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_clienta uuid;
  v_horas integer;
begin
  -- La cuenta: el servidor de la tienda ya preguntó al proyecto de clientes quién es (getUser) y manda su id.
  v_clienta := (select w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_clienta is null
     or p_producto is null
     or p_sede is null or not (p_sede = any (retail.fn_tienda_sedes_web()))
     or not exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p_producto and vp.publicado)
     or not retail.fn_vitrina_publicable(p_producto) then
    return null;
  end if;
  -- El plazo de hoy para confirmar (Configuración ▸ Tienda web); sin la fila, el de fábrica.
  v_horas := coalesce((select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id), 24);

  return (
    with libre as (
      -- Lo libre de cada talla en esa tienda: la misma pieza con que la ficha dice el nivel.
      select d.variante_id, d.disponible as n
        from retail.fn_tienda_disponible(array[p_producto], array[p_sede]) d
    ),
    separadas as (
      -- Las prendas que OTROS separaron para recoger aquí y que la tienda todavía no confirma (una línea = una prenda).
      select l.variante_id, count(*)::integer as n
        from retail.pedido_web_lineas l
        join retail.pedidos_web w on w.id = l.pedido_id
       where l.estado = 'pendiente'
         and l.variante_id in (select v.id from retail.variantes v where v.producto_id = p_producto)
         and w.estado = 'por_confirmar'
         and w.ubicacion_id = p_sede
         and w.clienta_id <> v_clienta
         and now() < w.creado_en + make_interval(hours => v_horas)
       group by l.variante_id
    )
    select coalesce(jsonb_object_agg(v.id::text, coalesce(li.n, 0) > 0 and coalesce(s.n, 0) >= li.n), '{}'::jsonb)
      from retail.variantes v
      left join libre li on li.variante_id = v.id
      left join separadas s on s.variante_id = v.id
     where v.producto_id = p_producto
       and v.activo
  );
end;
$fn$;

comment on function retail.tienda_separadas_por_otros(uuid, uuid, uuid) is
  'Tienda online (ADR-0408, propuesta k): por cada talla activa del modelo, si lo que queda libre en esa tienda (fn_tienda_disponible, la pieza de la ficha) ya lo cubren los pedidos web por confirmar de OTROS clientes que la recogen ahí y no pasaron su plazo. {"<variante_id>": true|false}: nunca una cifra ni quién. null sin cuenta, con un modelo que no se ve en la web o con una tienda que no es de la web. Solo la llama tienda_web.';

revoke all on function retail.tienda_separadas_por_otros(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_separadas_por_otros(uuid, uuid, uuid) to tienda_web;

-- ---------- 2. Validación final: si algo no quedó, se deshace todo ----------
do $$
declare
  f constant text := 'retail.tienda_separadas_por_otros(uuid, uuid, uuid)';
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
     or not has_function_privilege('tienda_web', f, 'EXECUTE') then
    raise exception 'tienda separadas: % tiene que ser solo de tienda_web', f;
  end if;
  if not exists (select 1 from pg_proc p where p.oid = f::regprocedure and p.prosecdef
                   and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search\_path=%')) then
    raise exception 'tienda separadas: % tiene que ser security definer con su search_path', f;
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
