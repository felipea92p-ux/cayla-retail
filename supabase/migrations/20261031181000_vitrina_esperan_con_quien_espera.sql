-- ============================================================================
-- 20261031181000_vitrina_esperan_con_quien_espera.sql — «Avísame»: quién espera, y escribirle SOLO si ella lo pidió
--
-- EL PROBLEMA PRIMERO. «Esperan una talla» decía «3 personas esperan la M negra» y ahí se cortaba: para decidir si vale la pena traer la
-- talla de otra sede, el equipo tenía que adivinar quiénes eran. Felipe (2026-10-31) pidió ver quién espera. Pero la clienta lee hoy
-- «Te avisaremos EN TU CUENTA» y la política dice «sin publicidad por WhatsApp, te escribimos solo por tus pedidos»: mostrar el celular de
-- todas contradecía esa promesa (maqueta docs/maquetas/tienda-avisame-2026-10, opción B elegida por Felipe).
--
-- DECIDÍ: el permiso de escribirle por WhatsApp se pide EN EL MOMENTO de pedir el aviso, con una casilla apagada de fábrica, y se
--   guarda con su fecha en `esperas_web.whatsapp_pedido_en` (vacío = no lo pidió). Quitar el aviso lo retira: una espera quitada no
--   sale. Es un dato de ESA espera, no de la ficha: el permiso de publicidad del Club (`whatsapp_consentimiento_en`) es otra cosa y no
--   cubre este uso (Ley 29733).
-- DECIDÍ: `fn_vitrina_esperan()` devuelve por cada prenda y tienda `quienes`: nombre y desde cuándo, de todas; el celular SOLO de quien
--   lo pidió (y si su ficha no se anonimizó ni su cuenta se cerró). Nunca el correo. El módulo sigue siendo `vitrina_web`.
-- DESCARTÉ: mostrar el celular de todas con una marca «sin permiso» (opción C): la marca avisa pero no impide escribirle.
-- SE ROMPE SI: la casilla se pre-marca o se esconde en la tienda (el permiso deja de valer) o alguien lee `esperas_web` por fuera de estas
--   dos funciones. La tabla sigue sin políticas ni grants: solo estas funciones la tocan.
-- `tienda_avisame` gana un parámetro (`p_whatsapp boolean default false`): se cambia el 3-argumentos por el de 4, sin dejar los dos.
--
-- PRODUCCIÓN. NO está aplicada: espera el OK de Felipe. Va después de 20261015024000 y 20261015030000. Re-ejecutable.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_vitrina_esperan()') is null then
    raise exception 'Falta fn_vitrina_esperan: pega antes 20261015030000_vitrina_esperan_una_talla.sql.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'cuentas_web' and column_name = 'cerrada_en')
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'clientas' and column_name = 'anonimizada') then
    raise exception 'Faltan cuentas_web.cerrada_en o clientas.anonimizada: pega antes las migraciones de recomendaciones (20261015134000).';
  end if;
end
$$;

alter table retail.esperas_web add column if not exists whatsapp_pedido_en timestamptz;
comment on column retail.esperas_web.whatsapp_pedido_en is
  'Cuándo la persona marcó «escríbeme por WhatsApp cuando llegue» al pedir el aviso. Vacío: no lo pidió, y el ERP no ve su celular. Se retira quitando el aviso.';

do $$
begin
  if to_regprocedure('retail.tienda_avisame(uuid, uuid, uuid)') is null
     and to_regprocedure('retail.tienda_avisame(uuid, uuid, uuid, boolean)') is null then
    raise exception 'Falta tienda_avisame: pega antes 20261015024000_tienda_favoritos_y_esperas.sql.';
  end if;
end
$$;

drop function if exists retail.tienda_avisame(uuid, uuid, uuid);

create or replace function retail.tienda_avisame(p_usuario_web_id uuid, p_variante_id uuid, p_ubicacion_id uuid, p_whatsapp boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
  v_activa boolean;
  v_celular text;
  v_producto uuid;
  v_sedes uuid[];
  v_sede uuid;
  v_id uuid;
  v_pidio timestamptz;
begin
  if p_usuario_web_id is null or p_variante_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  for v_cuenta, v_activa, v_celular in
    select w.id, c.archivada_en is null, nullif(btrim(c.telefono_whatsapp), '')
      from retail.cuentas_web w
      join retail.clientas c on c.id = w.clienta_id
     where w.usuario_web_id = p_usuario_web_id
       for update of w
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if not v_activa then
    return jsonb_build_object('estado', 'cuenta_inactiva');
  end if;

  v_sedes := retail.fn_tienda_sedes_web();
  v_sede := retail.fn_tienda_sede_elegida(p_ubicacion_id, v_sedes);

  v_producto := (select t.producto_id from retail.fn_tienda_precio_talla(array[p_variante_id], v_sede) t where t.se_ofrece);
  if v_producto is null or not retail.fn_tienda_modelo_se_ve(v_producto) then
    return jsonb_build_object('estado', 'no_disponible');
  end if;

  if retail.fn_tienda_libre(p_variante_id, case when v_sede is null then v_sedes else array[v_sede] end) > 0 then
    return jsonb_build_object('estado', 'hay', 'sede', v_sede);
  end if;

  for v_id, v_pidio in
    select e.id, e.whatsapp_pedido_en from retail.esperas_web e
     where e.cuenta_web_id = v_cuenta and e.variante_id = p_variante_id
       and e.ubicacion_id is not distinct from v_sede and e.quitada_en is null
  loop
    exit;
  end loop;
  if v_id is not null then
    return jsonb_build_object('estado', 'anotada', 'id', v_id, 'sede', v_sede, 'nueva', false, 'whatsapp', v_pidio is not null);
  end if;
  if (select count(*) from retail.esperas_web e where e.cuenta_web_id = v_cuenta and e.quitada_en is null) >= 30 then
    return jsonb_build_object('estado', 'tope', 'tope', 30);
  end if;

  -- El permiso vale solo si hay un celular a donde escribir: sin él, se anota el aviso y NO se registra el permiso.
  insert into retail.esperas_web (cuenta_web_id, variante_id, ubicacion_id, whatsapp_pedido_en)
  values (v_cuenta, p_variante_id, v_sede, case when coalesce(p_whatsapp, false) and v_celular is not null then now() end)
  returning id, whatsapp_pedido_en into v_id, v_pidio;
  return jsonb_build_object('estado', 'anotada', 'id', v_id, 'sede', v_sede, 'nueva', true, 'whatsapp', v_pidio is not null);
end;
$fn$;

comment on function retail.tienda_avisame(uuid, uuid, uuid, boolean) is
  'Tienda online (ADR-0408 act. 12; permiso de WhatsApp, 2026-10-31): «Avísame cuando llegue» de esa prenda en esa tienda (vacía o no web: cualquier tienda de la web). Solo si NO hay libre en ese alcance. p_whatsapp: la persona marcó «escríbeme por WhatsApp»; se guarda con su fecha solo si su ficha tiene celular. {estado: anotada (id, sede, nueva, whatsapp) | hay (sede) | tope | no_disponible | cuenta_inactiva | sin_cuenta | invalido}. Solo la llama tienda_web.';

revoke all on function retail.tienda_avisame(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function retail.tienda_avisame(uuid, uuid, uuid, boolean) to tienda_web;


create or replace function retail.fn_vitrina_esperan()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sedes uuid[];
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_sedes := retail.fn_tienda_sedes_web();
  return jsonb_build_object(
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
        from retail.ubicaciones u where u.id = any (v_sedes)), '[]'::jsonb),
    'personas', (select count(distinct e.cuenta_web_id) from retail.esperas_web e where e.quitada_en is null),
    'filas', coalesce((
      -- Por prenda y tienda; la tienda, con la regla con que se anota (una escondida es «cualquier tienda»).
      with base as (
        select e.variante_id, retail.fn_tienda_sede_elegida(e.ubicacion_id, v_sedes) as ubicacion_id, e.cuenta_web_id, e.creada_en, e.whatsapp_pedido_en
          from retail.esperas_web e
         where e.quitada_en is null
      ),
      vivas as (
        select b.variante_id, b.ubicacion_id,
               count(distinct b.cuenta_web_id)::integer as personas,
               min(b.creada_en) as desde,
               max(b.creada_en) as ultima
          from base b
         group by 1, 2
      ),
      -- Quién espera cada prenda y tienda: una fila por persona (la misma cuenta anotada dos veces en el mismo alcance cuenta una).
      quienes as (
        select q.variante_id, q.ubicacion_id,
               jsonb_agg(jsonb_build_object(
                 'ficha_id', case when c.anonimizada or w.cerrada_en is not null then null else c.id end,
                 'nombre', case when c.anonimizada or w.cerrada_en is not null then null else c.nombre end,
                 'pidio_whatsapp', (q.pidio and not c.anonimizada and w.cerrada_en is null),
                 'celular', case when q.pidio and not c.anonimizada and w.cerrada_en is null
                                 then nullif(btrim(c.telefono_whatsapp), '') end,
                 'desde', q.desde
               ) order by q.desde, c.id) as gente
          from (select b.variante_id, b.ubicacion_id, b.cuenta_web_id, min(b.creada_en) as desde,
                       bool_or(b.whatsapp_pedido_en is not null) as pidio
                  from base b group by 1, 2, 3) q
          join retail.cuentas_web w on w.id = q.cuenta_web_id
          join retail.clientas c on c.id = w.clienta_id
         group by 1, 2
      ),
      -- Lo libre de esas prendas en cada tienda de la web: la regla de «hay» de la ficha, leída una sola vez.
      libres as (
        select d.variante_id, d.ubicacion_id, d.disponible
          from retail.fn_tienda_disponible(array(select distinct va.producto_id
                                                   from vivas x join retail.variantes va on va.id = x.variante_id), v_sedes) d
      )
      select jsonb_agg(jsonb_build_object(
               'variante_id', x.variante_id,
               'producto', jsonb_build_object(
                 'id', p.id, 'nombre', p.referencia, 'codigo', p.codigo,
                 'categoria', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
                 'foto', (select pf.url from retail.producto_fotos pf
                           where pf.producto_id = p.id
                           order by (pf.color_codigo is not distinct from v.color_codigo) desc, pf.es_principal desc,
                                    pf.orden, pf.created_at, pf.id
                           limit 1)),
               'color', case when co.codigo is null then null
                             else jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex) end,
               'talla', t.valor,
               'sede', case when x.ubicacion_id is null then null
                            else jsonb_build_object('id', u.id, 'nombre', u.nombre) end,
               'personas', x.personas,
               'desde', x.desde,
               'ultima', x.ultima,
               'libre', coalesce((select sum(l.disponible) from libres l
                                   where l.variante_id = x.variante_id and (x.ubicacion_id is null or l.ubicacion_id = x.ubicacion_id)), 0),
               'hay_en', coalesce((
                 select jsonb_agg(jsonb_build_object('id', u2.id, 'nombre', u2.nombre, 'libre', l.disponible) order by u2.nombre)
                   from libres l
                   join retail.ubicaciones u2 on u2.id = l.ubicacion_id
                  where l.variante_id = x.variante_id), '[]'::jsonb),
               'se_ve', retail.fn_tienda_modelo_se_ve(p.id),
               'quienes', coalesce((select qq.gente from quienes qq
                                     where qq.variante_id = x.variante_id and qq.ubicacion_id is not distinct from x.ubicacion_id), '[]'::jsonb)
             ) order by x.personas desc, x.desde, p.referencia, x.variante_id, u.nombre nulls first)
        from vivas x
        join retail.variantes v on v.id = x.variante_id
        join retail.productos p on p.id = v.producto_id
        left join retail.categorias c on c.id = p.categoria_id
        left join retail.colores co on co.codigo = v.color_codigo
        left join retail.tallas t on t.id = v.talla_id
        left join retail.ubicaciones u on u.id = x.ubicacion_id), '[]'::jsonb)
  );
end;
$fn$;

comment on function retail.fn_vitrina_esperan() is
  'Tienda web ▸ Vitrina ▸ «Esperan una talla» (ADR-0408 act. 12; con quién espera, 2026-10-31): {tiendas, personas, filas: [{variante_id, producto, color, talla, sede, personas, desde, ultima, libre, hay_en, se_ve, quienes: [{ficha_id, nombre, pidio_whatsapp, celular, desde}]}]}. El celular sale solo de quien marcó «escríbeme por WhatsApp» al pedir el aviso (esperas_web.whatsapp_pedido_en); nunca el correo. quienes sale sin datos si la ficha se anonimizó o la cuenta se cerró. Pide el módulo vitrina_web.';

revoke all on function retail.fn_vitrina_esperan() from public, anon;
grant execute on function retail.fn_vitrina_esperan() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'retail.fn_vitrina_esperan()', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_vitrina_esperan()', 'EXECUTE') then
    raise exception 'vitrina esperan: fn_vitrina_esperan es del ERP (authenticated, con el módulo), nunca de anon ni de la tienda';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'retail.tienda_avisame(uuid, uuid, uuid, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_avisame(uuid, uuid, uuid, boolean)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_avisame(uuid, uuid, uuid, boolean)', 'EXECUTE')
     or to_regprocedure('retail.tienda_avisame(uuid, uuid, uuid)') is not null then
    raise exception 'tienda_avisame: una sola firma, y solo de tienda_web';
  end if;
end;
$$;

reset lock_timeout;
