-- ============================================================================
-- 20261015022000_tienda_mis_pedidos.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 7: «Mis pedidos»
--
-- EL PROBLEMA PRIMERO. Después de «Separar», el cliente necesita ver su pedido: si la tienda ya lo confirmó, cuánto falta
-- pagar, hasta cuándo puede recogerlo y, cuando está listo, el código de 4 cifras que muestra en caja (propuesta m). Y SOLO el
-- suyo: el número de pedido (W-0001) es correlativo y se adivina, así que no puede ser la llave para ver un pedido.
--
-- QUÉ HACE
--   · `tienda_mis_pedidos(usuario_web_id)`: los pedidos de ESA cuenta (la que el servidor de la tienda validó con `getUser()`),
--     envolviendo `fn_pedidos_web_de_clienta` del motor (20261014235000), que ya calcula al leer el estado de hoy (un «por
--     confirmar» pasado su plazo se lee «vencido» aunque el cierre programado no haya corrido) y solo da el código de recojo
--     cuando el pedido está listo para recoger. Los plazos salen de Configuración ▸ Tienda web (`configuracion_tienda_web`,
--     actividad 6): nunca escritos a mano. Le suma lo que la tienda dibuja: cada prenda como la ve el cliente
--     (`fn_bolsa_web_prenda`: nombre, color, talla, foto) y la tienda de recojo con su nombre web y su WhatsApp (aunque esa
--     tienda ya no se muestre en la web: el pedido sigue siendo suyo y se coordina por ahí).
--   · `tienda_pedido(usuario_web_id, codigo)`: uno, por su número, y solo si es de esa cuenta. El de otro cliente y el que no
--     existe responden igual (`pedido: null`): nadie aprende qué números existen.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va después de 20261015021000 (usa `fn_bolsa_web_prenda`).
-- Solo crea funciones; se pega entera y se puede volver a pegar. Prueba: `pnpm pruebas:tienda-bolsa`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.tienda_mis_pedidos(p_usuario_web_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_clienta uuid;
  v_horas integer;
  v_dias integer;
begin
  select w.clienta_id into v_clienta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id;
  if v_clienta is null then
    return null;
  end if;
  select c.horas_para_confirmar, c.dias_aviso_sin_recoger into v_horas, v_dias
    from retail.configuracion_tienda_web c
   where c.id;
  if v_horas is null or v_dias is null then
    raise exception 'Faltan los plazos de la tienda web (Configuración ▸ Tienda web).' using errcode = 'P0001', hint = 'tienda_web_sin_plazos';
  end if;

  return jsonb_build_object(
    'plazos', jsonb_build_object('horas_para_confirmar', v_horas, 'dias_para_recoger', v_dias),
    'pedidos', coalesce((
      select jsonb_agg(
               p.x
               || jsonb_build_object(
                    'tienda_web', (
                      select jsonb_build_object('nombre', coalesce(dw.nombre_web, u.nombre), 'whatsapp', u.whatsapp_numero,
                                                'direccion', dw.direccion, 'horario', dw.horario)
                        from retail.ubicaciones u
                        left join retail.ubicacion_datos_web dw on dw.ubicacion_id = u.id
                       where u.id = (p.x ->> 'ubicacion_id')::uuid),
                    -- Cada prenda: lo del pedido (precio, estado, de dónde viene, cuándo llega) y cómo se ve. «Viene de» con el
                    -- nombre que lee el cliente («Lima»), no el del sistema: la línea n es la de la posición n (el motor las
                    -- numera de 1 en adelante y las devuelve en ese orden).
                    'lineas', coalesce((
                      select jsonb_agg((l.y - 'referencia' - 'color' - 'color_codigo' - 'talla' - 'viene_de')
                                       || jsonb_build_object('viene_de', case when l.y ->> 'viene_de' is not null then (
                                            select coalesce(dw.nombre_web, u.nombre)
                                              from retail.pedido_web_lineas pl
                                              join retail.ubicaciones u on u.id = pl.ubicacion_id
                                              left join retail.ubicacion_datos_web dw on dw.ubicacion_id = pl.ubicacion_id
                                             where pl.pedido_id = (p.x ->> 'pedido_id')::uuid and pl.posicion = l.n) end)
                                       || coalesce(retail.fn_bolsa_web_prenda((l.y ->> 'variante_id')::uuid), '{}'::jsonb)
                                       order by l.n)
                        from jsonb_array_elements(p.x -> 'lineas') with ordinality as l (y, n)), '[]'::jsonb))
               order by p.n)
        from jsonb_array_elements(retail.fn_pedidos_web_de_clienta(v_clienta, v_horas, v_dias)) with ordinality as p (x, n)),
      '[]'::jsonb));
end;
$fn$;

comment on function retail.tienda_mis_pedidos(uuid) is
  'Tienda online (ADR-0408, act. 7): «Mis pedidos» de esa cuenta {plazos, pedidos: [...]} (fn_pedidos_web_de_clienta con los plazos de configuracion_tienda_web, más la tienda web y cada prenda con su foto). El código de recojo, solo listo para recoger. null si no tiene cuenta. Solo la llama tienda_web.';

create or replace function retail.tienda_pedido(p_usuario_web_id uuid, p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case when t.m is null then null
              else jsonb_build_object(
                     'plazos', t.m -> 'plazos',
                     'pedido', (select x.p from jsonb_array_elements(t.m -> 'pedidos') as x (p)
                                 where x.p ->> 'codigo' = upper(btrim(coalesce(p_codigo, '')))
                                 limit 1)) end
    from (select retail.tienda_mis_pedidos(p_usuario_web_id) as m) t;
$$;

comment on function retail.tienda_pedido(uuid, text) is
  'Tienda online (ADR-0408, act. 7): un pedido de esa cuenta por su número (W-0001) {plazos, pedido}; el de otro cliente o uno que no existe dan pedido: null. null si no tiene cuenta. Solo la llama tienda_web.';

revoke all on function retail.tienda_mis_pedidos(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_pedido(uuid, text) from public, anon, authenticated;
grant execute on function retail.tienda_mis_pedidos(uuid) to tienda_web;
grant execute on function retail.tienda_pedido(uuid, text) to tienda_web;

reset lock_timeout;
