-- ============================================================================
-- 20261015025000_tienda_mi_club.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 12 · PARTE 2 de 3
--
-- EL PROBLEMA PRIMERO. Quien crea su cuenta en la web ya es miembro del Club CAYLA (actividad 2), pero «Mi cuenta» solo le decía
-- «Eres miembro». La maqueta aprobada (`vCuenta`) le muestra lo que el Club le da a ELLA: su descuento de cumpleaños y su vale por
-- aniversario, «Novedades para ti» (propuesta i: lo que llegó desde su última visita, sin mensajes de publicidad), sus favoritos y
-- «Te avisamos cuando llegue». Los beneficios tienen que decir lo mismo que la caja va a cobrar: si la web promete un descuento que
-- la caja no da, la clienta llega a la tienda y se va enojada.
--
-- QUÉ HACE
--   1. `retail.cuentas_web_visitas`: cuándo entró a «Mi cuenta» (la visita en curso y la anterior), para «desde tu última visita».
--      Una visita dura mientras vuelve antes de 30 minutos (recargar no le borra lo nuevo que estaba mirando).
--   2. `retail.fn_tienda_novedades(desde)`: lo de «Lo nuevo» que llegó DESDE `desde`. No tiene regla propia: llama a
--      `fn_tienda_lo_nuevo` (20261015013000, ADR-0408 DECIDÍ 7: el primer ingreso a una tienda por `fn_es_llegada`, sin el Taller
--      ni las devoluciones, en los últimos 30 días, sin lo quitado en la Vitrina ni las familias fuera de los motores) con los
--      modelos que se ven en la web, y se queda con los que llegaron por primera vez después de `desde`. Lo que el Inicio muestra
--      en «Lo nuevo» y lo que «Mi cuenta» llama novedad es, por construcción, lo mismo.
--   3. `retail.tienda_mi_club(usuario)`: todo lo del Club en una lectura (y anota la visita):
--      · club.cumple: su día y mes, el % vigente y en qué está: `disponible` (es su mes y no lo usó este año: lo MISMO que exige
--        `registrar_venta` y muestra `resumen_clienta_caja`), `canjeado` (este año, con la fecha), `proximo`, `sin_fecha` o
--        `sin_club`. Con `hasta`: el último día de su mes.
--      · club.aniversario: de `fn_club_aniversario_calculo` (la MISMA que lee la caja): `vale` (disponible: monto y hasta cuándo),
--        `canjeado`, `en_camino` (su próximo aniversario, lo que lleva este año contra el umbral y el vale que le toca) o `sin_club`.
--      · club.con_publicidad: si aceptó los avisos por WhatsApp (los términos dicen que le avisamos «solo si lo autorizaste»).
--      · novedades: {primera, desde, total, productos (hasta 24, lo último primero)}.
--      · favoritos: sus modelos guardados (lo último primero).
--      · esperas: cada una con su prenda (modelo, color, talla), su tienda (o cualquiera), si se ve en la web, si ya llegó y dónde hay.
--        «Llegó» y «dónde hay» son la regla de «hay» de la ficha (`fn_tienda_disponible` con `fn_tienda_sedes_web()`, 20261015012000),
--        leída una vez para todas sus esperas: si la ficha dice que no hay, aquí tampoco llegó.
--
-- DECIDÍ: los beneficios salen de las funciones del Club que ya cobran (`fn_club_beneficios`, `fn_club_aniversario_calculo`,
--   `club_canjes`), nunca de una regla copiada: si Felipe cambia el % o la escala en «Beneficios del club», la cuenta lo dice sola.
-- DECIDÍ: «socia activa» como la caja: con `club_desde`, ni anonimizada ni archivada (unida a otra = anonimizada). Con la ficha
--   inactiva los beneficios dicen `sin_club` y la tienda explica que se acerque a una tienda (qué pasa con la cuenta en ese caso
--   es una pregunta abierta para Felipe; esto no decide nada que no se pueda cambiar).
-- DECIDÍ: «desde tu última visita» = la visita ANTERIOR, nunca la de hoy; la primera vez, los últimos 7 días («esta semana», como
--   la maqueta); y nunca más atrás de 30 días (lo que dura Lo nuevo).
-- DECIDÍ: la lectura anota la visita (es `volatile`): una sola llamada por página, en vez de leer y después escribir. Si dos
--   pestañas entran a la vez, la fila de la visita las turna.
-- DECIDÍ (integración de la tienda, 2026-10-15): una novedad es EXACTAMENTE lo de «Lo nuevo» que llegó desde la visita anterior.
--   Esta parte nació con su propia regla (la primera llegada solo a las tiendas de la web, sin la carga inicial y solo lo que hoy
--   tiene algo libre): «Mi cuenta» podía callar algo que el Inicio mostraba en «Lo nuevo», o al revés. Ahora es la de
--   `fn_tienda_lo_nuevo`: cuenta la carga inicial con que hoy se da de alta lo nuevo (DECIDÍ 7) y no mira si hoy hay libre (Lo nuevo
--   tampoco: la tarjeta dice cuánto queda). Si Felipe quiere esconder lo agotado, se decide para las dos a la vez, en Lo nuevo.
-- DESCARTÉ: guardar en `cuentas_web` la última visita (es la tabla de la cuenta, de la actividad 2: una tabla aparte no la toca);
--   una novedad = toda llegada (también las reposiciones, como los avisos del Club): para la web «nuevo» es lo que no estaba.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de la PARTE 1 (20261015024000), de Lo nuevo
-- (20261015013000) y de las de la tienda y del Club. Una sola parte, re-ejecutable: una tabla NUEVA sin políticas y funciones; no
-- altera tablas en uso, sin `drop trigger` y sin ningún `select … into` dentro de un texto entre comillas. Borra
-- `fn_tienda_novedades(timestamptz, uuid[])` antes de crear la de un solo dato (cambió su firma: ya no recibe tiendas, porque «Lo
-- nuevo» mira toda tienda; sin el `drop` quedarían dos). Prueba: `pnpm pruebas:tienda-club`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $$
begin
  if not exists (select 1 from pg_proc p
                  where p.oid = to_regprocedure('retail.fn_tienda_lo_nuevo(uuid[])') and 'llego' = any (p.proargnames)) then
    raise exception 'Falta «Lo nuevo» con la fecha de llegada: pega antes 20261015013000_tienda_inicio_lo_nuevo_y_mas_vendidos.sql.';
  end if;
  if to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null or to_regprocedure('retail.fn_tienda_sedes_web()') is null then
    raise exception 'Falta la regla de «hay» de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regprocedure('retail.fn_tienda_modelo_se_ve(uuid)') is null or to_regclass('retail.esperas_web') is null then
    raise exception 'Falta la PARTE 1 (favoritos y esperas): pega antes 20261015024000_tienda_favoritos_y_esperas.sql.';
  end if;
end
$$;

-- ---------- 1. La visita a «Mi cuenta» ----------
create table if not exists retail.cuentas_web_visitas (
  cuenta_web_id      uuid primary key references retail.cuentas_web (id),
  visita_en          timestamptz not null,
  visita_anterior_en timestamptz,
  constraint cuentas_web_visitas_orden check (visita_anterior_en is null or visita_anterior_en <= visita_en)
);

comment on table retail.cuentas_web_visitas is
  'Tienda online (ADR-0408, act. 12): cuándo entró a «Mi cuenta» (la visita en curso, que dura mientras vuelve antes de 30 min, y la anterior), para «Novedades para ti: lo que llegó desde tu última visita». Solo por tienda_mi_club; RLS sin políticas.';

alter table retail.cuentas_web_visitas enable row level security;
revoke all on retail.cuentas_web_visitas from public, anon, authenticated;

-- ---------- 2. Lo que llegó a la web desde una fecha: lo de «Lo nuevo», nada más ----------
-- Llama a la regla de «Lo nuevo» (`fn_tienda_lo_nuevo`) con los modelos que se ven en la web (los mismos que lee el catálogo) y se
-- queda con lo que llegó por primera vez después de `p_desde`. Un fijado en Lo nuevo que llegó antes no es novedad: no llegó desde
-- la visita anterior. La firma de antes (con las tiendas) se borra: Lo nuevo mira toda tienda.
drop function if exists retail.fn_tienda_novedades(timestamptz, uuid[]);
create or replace function retail.fn_tienda_novedades(p_desde timestamptz)
returns table (producto_id uuid, llego timestamptz)
language sql
stable
set search_path = retail, public
as $$
  select n.producto_id, n.llego
    from retail.fn_tienda_lo_nuevo(array(select vp.producto_id from retail.vitrina_productos vp
                                          where retail.fn_tienda_modelo_se_ve(vp.producto_id))) n
   where n.llego > p_desde
   order by n.llego desc, n.producto_id;
$$;
comment on function retail.fn_tienda_novedades(timestamptz) is
  'Tienda online (ADR-0408, act. 12): «Novedades para ti» = lo de «Lo nuevo» (fn_tienda_lo_nuevo, la regla única: primer ingreso a una tienda por fn_es_llegada, 30 días, sin lo quitado) de los modelos que se ven en la web, que llegó por primera vez después de p_desde; lo último primero. Interna: la usa tienda_mi_club.';
revoke all on function retail.fn_tienda_novedades(timestamptz) from public, anon, authenticated;

-- ---------- 3. «Mi cuenta»: el Club, las novedades, los favoritos y las esperas ----------
create or replace function retail.tienda_mi_club(p_usuario_web_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_ahora timestamptz := now();
  v_hoy date := retail.fn_hoy_lima();
  v_cuenta uuid;
  v_clienta uuid;
  v_club_desde timestamptz;
  v_anonimizada boolean;
  v_archivada boolean;
  v_publicidad boolean;
  v_dia smallint;
  v_mes smallint;
  v_activa boolean;
  v_pct numeric;
  v_compras_meta integer;
  v_monto_meta numeric;
  v_dias integer;
  v_canje date;
  v_estado_cumple text;
  a record;
  v_siguiente numeric;
  v_visita_en timestamptz;
  v_anterior_en timestamptz;
  v_hay_visita boolean := false;
  v_ref timestamptz;
  v_desde timestamptz;
  v_sedes uuid[];
  v_novedades jsonb;
  v_favoritos jsonb;
  v_esperas jsonb;
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

  for v_club_desde, v_anonimizada, v_archivada, v_publicidad, v_dia, v_mes in
    select c.club_desde, c.anonimizada, c.archivada_en is not null, c.publicidad_desde is not null, c.cumple_dia, c.cumple_mes
      from retail.clientas c where c.id = v_clienta
  loop
    exit;
  end loop;
  -- Socia activa, como la caja (resumen_clienta_caja): con club, ni anonimizada ni archivada (unida a otra = anonimizada).
  v_activa := v_club_desde is not null and v_anonimizada is false and v_archivada is false;
  for v_pct, v_compras_meta, v_monto_meta, v_dias in
    select b.pct, b.compras, b.monto, b.dias from retail.fn_club_beneficios() b
  loop
    exit;
  end loop;

  -- El cumpleaños: lo mismo que exige registrar_venta (ADR-0288 D-5): su mes en Lima y sin un canje vivo este año.
  v_canje := (select (k.created_at at time zone 'America/Lima')::date
                from retail.club_canjes k
               where k.clienta_id = v_clienta and k.tipo = 'cumpleanos'
                 and k.anio = extract(year from v_hoy) and k.anulado_en is null
               limit 1);
  v_estado_cumple := case
    when not v_activa then 'sin_club'
    when v_canje is not null then 'canjeado'
    when v_mes is null then 'sin_fecha'
    when v_mes = extract(month from v_hoy) then 'disponible'
    else 'proximo'
  end;

  -- El aniversario: la MISMA cuenta que lee la caja (ADR-0288 G-9, G-13).
  for a in select * from retail.fn_club_aniversario_calculo(v_clienta) loop
    exit;
  end loop;
  v_siguiente := (select s.monto from retail.club_aniversario_escala s
                   where s.anio <= least(coalesce(a.anios_que_cuentan, 0) + 1, 5)
                   order by s.anio desc limit 1);

  -- La visita: dura mientras vuelva antes de 30 minutos; «desde tu última visita» es la ANTERIOR.
  for v_visita_en, v_anterior_en in
    select x.visita_en, x.visita_anterior_en from retail.cuentas_web_visitas x where x.cuenta_web_id = v_cuenta for update
  loop
    v_hay_visita := true;
    exit;
  end loop;
  if not v_hay_visita then
    insert into retail.cuentas_web_visitas (cuenta_web_id, visita_en) values (v_cuenta, v_ahora)
    on conflict (cuenta_web_id) do nothing;
    v_ref := null;
  elsif v_ahora - v_visita_en > interval '30 minutes' then
    update retail.cuentas_web_visitas set visita_anterior_en = visita_en, visita_en = v_ahora where cuenta_web_id = v_cuenta;
    v_ref := v_visita_en;
  else
    update retail.cuentas_web_visitas set visita_en = greatest(visita_en, v_ahora) where cuenta_web_id = v_cuenta;
    v_ref := v_anterior_en;
  end if;
  v_desde := case when v_ref is null then v_ahora - interval '7 days' else greatest(v_ref, v_ahora - interval '30 days') end;

  v_sedes := retail.fn_tienda_sedes_web();
  v_novedades := (
    select jsonb_build_object(
             'primera', v_ref is null,
             'desde', v_desde,
             'total', count(*),
             'productos', coalesce(jsonb_agg(n.producto_id order by n.llego desc, n.producto_id) filter (where n.orden <= 24), '[]'::jsonb))
      from (select x.producto_id, x.llego, row_number() over (order by x.llego desc, x.producto_id) as orden
              from retail.fn_tienda_novedades(v_desde) x) n);

  v_favoritos := coalesce((
    select jsonb_agg(f.producto_id order by f.guardado_en desc, f.producto_id)
      from retail.favoritos_web f
     where f.cuenta_web_id = v_cuenta and f.quitado_en is null), '[]'::jsonb);

  -- Sus esperas vivas, con «llegó» y «dónde hay» según la regla de «hay» de la ficha (fn_tienda_disponible en las tiendas de la
  -- web), leída UNA vez para todas sus prendas: lo que la ficha dice agotado aquí no «llegó».
  v_esperas := coalesce((
    with vivas as (
      select e.* from retail.esperas_web e where e.cuenta_web_id = v_cuenta and e.quitada_en is null
    ),
    libres as (
      select d.variante_id, d.ubicacion_id
        from retail.fn_tienda_disponible(array(select distinct va.producto_id
                                                 from vivas x join retail.variantes va on va.id = x.variante_id), v_sedes) d
    )
    select jsonb_agg(jsonb_build_object(
             'id', e.id,
             'variante_id', e.variante_id,
             'producto_id', v.producto_id,
             'producto', p.referencia,
             'color', case when co.codigo is null then null
                           else jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex) end,
             'talla', t.valor,
             'sede', case when e.ubicacion_id is null then null
                          else jsonb_build_object('id', e.ubicacion_id, 'nombre', coalesce(dw.nombre_web, u.nombre)) end,
             'creada_en', e.creada_en,
             'se_ve', retail.fn_tienda_modelo_se_ve(v.producto_id),
             'llego', exists (select 1 from libres l
                               where l.variante_id = e.variante_id and (e.ubicacion_id is null or l.ubicacion_id = e.ubicacion_id)),
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
      left join retail.ubicaciones u on u.id = e.ubicacion_id
      left join retail.ubicacion_datos_web dw on dw.ubicacion_id = e.ubicacion_id), '[]'::jsonb);

  return jsonb_build_object(
    'club', jsonb_build_object(
      'activa', v_activa,
      'con_publicidad', v_activa and v_publicidad,
      'cumple', jsonb_build_object(
        'estado', v_estado_cumple,
        'dia', v_dia,
        'mes', v_mes,
        'pct', v_pct,
        'hasta', case when v_estado_cumple = 'disponible'
                      then (date_trunc('month', v_hoy::timestamp) + interval '1 month - 1 day')::date end,
        'canjeado_el', v_canje),
      'aniversario', jsonb_build_object(
        'estado', case when not v_activa then 'sin_club'
                       when coalesce(a.vale_disponible, false) then 'vale'
                       when a.vale_canjeado_el is not null then 'canjeado'
                       else 'en_camino' end,
        'vale_monto', case when coalesce(a.vale_disponible, false) or a.vale_canjeado_el is not null then a.vale_monto end,
        'vale_vence', case when coalesce(a.vale_disponible, false) then a.vale_vence end,
        'vale_canjeado_el', a.vale_canjeado_el,
        'proximo', a.proximo_aniversario,
        'anio_cuenta', coalesce(a.anio_en_curso_cuenta, false),
        'compras', coalesce(a.compras_anio, 0),
        'monto', coalesce(a.monto_anio, 0),
        'compras_meta', v_compras_meta,
        'monto_meta', v_monto_meta,
        'siguiente_monto', v_siguiente,
        'dias', v_dias)),
    'novedades', v_novedades,
    'favoritos', v_favoritos,
    'esperas', v_esperas);
end;
$fn$;
comment on function retail.tienda_mi_club(uuid) is
  'Tienda online (ADR-0408, act. 12): «Mi cuenta» del Club de ese usuario: {club: {activa, con_publicidad, cumple, aniversario}, novedades: {primera, desde, total, productos}, favoritos, esperas}, con las reglas que cobra la caja (fn_club_beneficios, fn_club_aniversario_calculo, club_canjes). Anota la visita (para «desde tu última visita»). null sin cuenta. Solo la llama tienda_web.';

revoke all on function retail.tienda_mi_club(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_mi_club(uuid) to tienda_web;

-- ---------- 4. Validación final ----------
do $$
begin
  if has_function_privilege('anon', 'retail.tienda_mi_club(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_mi_club(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_mi_club(uuid)', 'EXECUTE') then
    raise exception 'tienda club: tienda_mi_club tiene que ser solo de tienda_web';
  end if;
  if has_function_privilege('tienda_web', 'retail.fn_tienda_novedades(timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_tienda_novedades(timestamptz)', 'EXECUTE') then
    raise exception 'tienda club: fn_tienda_novedades es interna';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_tienda_novedades') <> 1 then
    raise exception 'tienda club: quedó más de una fn_tienda_novedades (la de antes, con las tiendas, se borra)';
  end if;
  if has_table_privilege('tienda_web', 'retail.cuentas_web_visitas', 'SELECT')
     or has_table_privilege('authenticated', 'retail.cuentas_web_visitas', 'SELECT') then
    raise exception 'tienda club: cuentas_web_visitas se lee solo por su función';
  end if;
end;
$$;

reset lock_timeout;
