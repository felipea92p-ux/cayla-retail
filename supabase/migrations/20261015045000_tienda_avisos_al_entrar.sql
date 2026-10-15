-- ============================================================================
-- 20261015045000_tienda_avisos_al_entrar.sql — CAYLA V2 · Tienda online (ADR-0408), el aviso al entrar
--
-- EL PROBLEMA PRIMERO. Los avisos del Club (el descuento de cumpleaños, el vale por aniversario) salen por WhatsApp, y «llegó la
-- talla que esperabas» solo se ve en «Mi cuenta». Si el WhatsApp no le llega a la persona (no dio el permiso, cambió de número, el
-- mensaje se perdió), o no entra a «Mi cuenta», su beneficio se le vence sin que lo sepa. Felipe (2026-10-14): «Si no le llegan los
-- avisos por WhatsApp, cuando inicie sesión igual le debe salir algún mensaje». Al entrar se llega al Inicio (el proxy lleva ahí):
-- el Inicio le muestra arriba lo que tiene a su favor, con hasta cuándo, hasta que diga «Entendido».
--
-- QUÉ HACE. `retail.tienda_mis_avisos_del_club(usuario)`: SOLO lo que hoy está a favor de esa persona, para el aviso del Inicio:
--   · cumple: su descuento de cumpleaños DISPONIBLE (es su mes en Lima y no lo usó este año: la misma regla que exige
--     `registrar_venta` y que muestra `tienda_mi_club`), con el % de `fn_club_beneficios` y hasta cuándo (el último día de su mes).
--   · vale: su vale por aniversario DISPONIBLE (`fn_club_aniversario_calculo`, la misma cuenta que lee la caja), con el monto, hasta
--     cuándo y de qué aniversario es.
--   · llegaron: cada espera viva («Avísame cuando llegue») cuya prenda se ve en la web y ya tiene algo libre en su tienda (o en alguna
--     de la web, si le daba igual), con dónde hay. La misma regla que «Te avisamos cuando llegue» de «Mi cuenta»: la regla única de
--     «hay» de la tienda, `fn_tienda_disponible` en las tiendas de la web (`fn_tienda_sedes_web`), leída UNA vez para todas sus prendas.
--     La tienda de la espera, con la regla con que se anota (`fn_tienda_sede_elegida`): una que después se escondió de la web es
--     «cualquier tienda», como en «Mi cuenta» (si no, esa espera nunca «llegaba»).
--   Sin cuenta, null. Con la ficha del Club inactiva, sin cumpleaños ni vale (como «Mi cuenta»); lo que llegó sí sale.
--
-- DECIDÍ: una función aparte y no `tienda_mi_club`. Esa es la lectura de «Mi cuenta» y ANOTA LA VISITA (`cuentas_web_visitas`, para
--   «Novedades desde tu última visita»): llamada en cada entrada al Inicio, escribiría en cada carga y movería la «última visita» de
--   «Mi cuenta» al último Inicio, así que «Novedades para ti» dejaría de decir lo que llegó desde que la persona miró su cuenta. Y calcula
--   lo que el aviso no necesita (las novedades recorren los movimientos de todo lo publicado, los favoritos, cada espera tienda por
--   tienda). Esta es `stable`, no escribe nada y solo mira lo de esa persona.
-- DECIDÍ: las reglas no se copian donde se pueden llamar: el % sale de `fn_club_beneficios`, el vale de `fn_club_aniversario_calculo`,
--   lo libre de `fn_tienda_disponible` (con `fn_tienda_sedes_web`) y si se ve de `fn_tienda_modelo_se_ve`. Lo único escrito aquí otra
--   vez es «es su mes y no hay canje este año» (5 líneas, igual que en `tienda_mi_club`, que no lo tiene en una función); la prueba
--   compara las dos funciones ficha por ficha, así que si una cambia y la otra no, la prueba lo dice.
-- DECIDÍ: qué avisos ya cerró la persona («Entendido») NO se guarda aquí: lo recuerda su navegador (una cookie por aviso, ADR-0408).
--   La base no junta datos de lo que alguien leyó.
-- DESCARTÉ: devolver lo que ya se usó o lo que viene (cumpleaños próximo, vale en camino): eso es de «Mi cuenta»; el aviso es solo lo
--   que hoy se puede usar o separar.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de 20261015024000 y 20261015025000 (usa sus funciones
-- internas). Una sola parte, re-ejecutable: una función nueva, sin tablas, sin políticas, sin `drop trigger` y sin ningún
-- `select … into` dentro de un texto entre comillas. Prueba: `pnpm pruebas:tienda-avisos`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que da por hecho (si falta, no se pega nada).
do $$
begin
  if to_regprocedure('retail.fn_tienda_sede_elegida(uuid, uuid[])') is null or to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null then
    raise exception 'Faltan las reglas de «hay» y de la tienda elegida: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regprocedure('retail.fn_tienda_modelo_se_ve(uuid)') is null or to_regclass('retail.esperas_web') is null then
    raise exception 'Falta el Club en la cuenta: pega antes 20261015024000_tienda_favoritos_y_esperas.sql y 20261015025000_tienda_mi_club.sql.';
  end if;
end
$$;

create or replace function retail.tienda_mis_avisos_del_club(p_usuario_web_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_cuenta uuid;
  v_clienta uuid;
  v_club_desde timestamptz;
  v_anonimizada boolean;
  v_archivada boolean;
  v_mes smallint;
  v_activa boolean;
  v_pct numeric;
  v_cumple jsonb;
  v_vale jsonb;
  a record;
  v_hay_calculo boolean := false;
  v_sedes uuid[];
  v_llegaron jsonb;
begin
  if p_usuario_web_id is null then
    return null;
  end if;
  for v_cuenta, v_clienta in
    select w.id, w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return null;
  end if;

  for v_club_desde, v_anonimizada, v_archivada, v_mes in
    select c.club_desde, c.anonimizada, c.archivada_en is not null, c.cumple_mes
      from retail.clientas c where c.id = v_clienta
  loop
    exit;
  end loop;
  -- Socia activa, como la caja y como «Mi cuenta»: con club, ni anonimizada ni archivada (unida a otra = anonimizada).
  v_activa := v_club_desde is not null and v_anonimizada is false and v_archivada is false;

  if v_activa then
    -- El cumpleaños DISPONIBLE: es su mes en Lima y no hay un canje vivo de este año (la regla de registrar_venta).
    if v_mes = extract(month from v_hoy)
       and not exists (select 1 from retail.club_canjes k
                        where k.clienta_id = v_clienta and k.tipo = 'cumpleanos'
                          and k.anio = extract(year from v_hoy) and k.anulado_en is null) then
      v_pct := (select b.pct from retail.fn_club_beneficios() b limit 1);
      v_cumple := jsonb_build_object(
        'pct', v_pct,
        'hasta', (date_trunc('month', v_hoy::timestamp) + interval '1 month - 1 day')::date);
    end if;

    -- El vale DISPONIBLE: la misma cuenta que lee la caja.
    for a in select * from retail.fn_club_aniversario_calculo(v_clienta) loop
      v_hay_calculo := true;
      exit;
    end loop;
    if v_hay_calculo and coalesce(a.vale_disponible, false) then
      v_vale := jsonb_build_object('monto', a.vale_monto, 'vence', a.vale_vence, 'aniversario', a.vale_aniversario);
    end if;
  end if;

  -- Lo que esperaba y ya llegó: sus esperas vivas cuya prenda se ve en la web y tiene algo libre en su tienda (o en alguna de la web,
  -- si le daba igual o si su tienda ya no se ve en la web: fn_tienda_sede_elegida, la regla con que se anota). «Libre» es la regla única
  -- de «hay» de la tienda (la ficha, la bolsa, «Mi cuenta»): `fn_tienda_disponible` en las tiendas de la web, leída UNA vez para todas
  -- sus prendas.
  v_sedes := retail.fn_tienda_sedes_web();
  v_llegaron := coalesce((
    with vivas as (
      select e.*, retail.fn_tienda_sede_elegida(e.ubicacion_id, v_sedes) as sede_id
        from retail.esperas_web e where e.cuenta_web_id = v_cuenta and e.quitada_en is null
    ),
    libres as (
      select d.variante_id, d.ubicacion_id
        from retail.fn_tienda_disponible(array(select distinct va.producto_id
                                                 from vivas x join retail.variantes va on va.id = x.variante_id), v_sedes) d
    )
    select jsonb_agg(jsonb_build_object(
             'id', e.id,
             'producto_id', v.producto_id,
             'producto', p.referencia,
             'color', co.nombre,
             'talla', t.valor,
             'sede', case when e.sede_id is null then null else coalesce(dw.nombre_web, u.nombre) end,
             'hay_en', to_jsonb(array(
               select coalesce(dw2.nombre_web, u2.nombre)
                 from libres l
                 join retail.ubicaciones u2 on u2.id = l.ubicacion_id
                 left join retail.ubicacion_datos_web dw2 on dw2.ubicacion_id = l.ubicacion_id
                where l.variante_id = e.variante_id
                order by lower(coalesce(dw2.nombre_web, u2.nombre))))
           ) order by e.creada_en desc, e.id)
      from vivas e
      join retail.variantes v on v.id = e.variante_id
      join retail.productos p on p.id = v.producto_id
      left join retail.colores co on co.codigo = v.color_codigo
      left join retail.tallas t on t.id = v.talla_id
      left join retail.ubicaciones u on u.id = e.sede_id
      left join retail.ubicacion_datos_web dw on dw.ubicacion_id = e.sede_id
     where exists (select 1 from libres l
                    where l.variante_id = e.variante_id and (e.sede_id is null or l.ubicacion_id = e.sede_id))
       and retail.fn_tienda_modelo_se_ve(v.producto_id)),
    '[]'::jsonb);

  return jsonb_build_object('cumple', v_cumple, 'vale', v_vale, 'llegaron', v_llegaron);
end;
$fn$;
comment on function retail.tienda_mis_avisos_del_club(uuid) is
  'Tienda online (ADR-0408): el aviso del Inicio al entrar. Solo lo que hoy está a favor de ese usuario: {cumple: {pct, hasta} | null, vale: {monto, vence, aniversario} | null, llegaron: [{id, producto_id, producto, color, talla, sede, hay_en}]}, con las reglas que cobra la caja y las de «Te avisamos cuando llegue». No escribe nada (no anota la visita de «Mi cuenta»). null sin cuenta. Solo la llama tienda_web.';

revoke all on function retail.tienda_mis_avisos_del_club(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_mis_avisos_del_club(uuid) to tienda_web;

-- ---------- Validación final ----------
do $$
begin
  if has_function_privilege('anon', 'retail.tienda_mis_avisos_del_club(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_mis_avisos_del_club(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_mis_avisos_del_club(uuid)', 'EXECUTE') then
    raise exception 'tienda avisos: tienda_mis_avisos_del_club tiene que ser solo de tienda_web';
  end if;
end;
$$;

reset lock_timeout;
