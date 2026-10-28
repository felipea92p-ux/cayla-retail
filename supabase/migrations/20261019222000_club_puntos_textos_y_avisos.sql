-- ============================================================================
-- 20261019222000_club_puntos_textos_y_avisos.sql — CAYLA V2 · Club · puntos, actividad 10 de 12: lo que el club DICE pasa a los puntos
-- Sigue a `20261019221000_club_puntos_retira_cumple_vale_y_ligado.sql`.
--
-- EL PROBLEMA. Con el 10 % de cumpleaños y el vale de aniversario retirados, todo lo que el club le dice a la gente tiene que hablar de
-- puntos: el cartel del mostrador, la página que abre su QR y la tienda online. Esas piezas son públicas (el cartel y su página las ve
-- cualquiera, sin sesión), y hasta hoy solo podían leer los beneficios viejos (`fn_club_pagina`, `fn_club_textos_legales`).
--
-- QUÉ HACE
--   1. `fn_club_puntos_vigentes()`: la configuración vigente de los puntos (lo que se gana, lo que valen, el canje, el cupón y el regalo
--      de cumpleaños), sin datos de nadie, para anon y authenticated: la usan el cartel y la página del QR.
--   2. Clientes ▸ Avisos: el aviso de cumpleaños regala PUNTOS (texto `aviso_cumpleanos` v3, con `{regalo}`), el de aniversario deja de
--      salir, y nace el aviso de PUNTOS POR ELIMINARSE (`aviso_puntos` v1, tipo `puntos`): a quien autorizó WhatsApp y tiene puntos, 30
--      días antes de su fecha de conservación (la misma de «Mi Club» y del cron), uno por fecha. Como el cumpleaños, es un aviso del club
--      (no es promoción): no cuenta para el tope de 2 al mes ni excluye al grupo testigo.
--   3. `registrar_aviso_enviado` acepta el tipo `puntos` (y deja de aceptar `aniversario`, que ya no sale).
--
-- DECIDÍ: los textos de los AVISOS (plantillas de WhatsApp que manda la tienda) sí se publican aquí: no son Términos ni consentimiento.
-- DECIDÍ: `fn_club_avisos_pendientes` se reemplaza ENTERA desde su definición del repo (20261001210700, la que vive en producción: md5 de su
--   cuerpo 1ed418fa…, comprobado el 2026-10-19). Si la viva no es esa ni la nueva, aborta sin tocar nada.
-- DECIDÍ: los Términos que guarda `club_textos` NO cambian aquí: el texto nuevo espera la revisión del abogado
--   (docs/club/texto-legal-puntos-v1-borrador.md). Lo que esta migración publica son cifras de la configuración, no texto legal.
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019221000`. Idempotente. `lock_timeout` 3 s.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La configuración vigente, para el cartel y la página del QR ----------
create or replace function retail.fn_club_puntos_vigentes()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_cfg retail.club_puntos_config;
begin
  v_cfg := retail.fn_club_puntos_config((now() at time zone 'America/Lima')::date);
  return jsonb_build_object(
    'puntos_por_sol', v_cfg.puntos_por_sol, 'soles_por_100', v_cfg.soles_por_100, 'canje_minimo', v_cfg.canje_minimo_puntos,
    'compra_minima_x', v_cfg.compra_minima_x, 'vigencia_dias', v_cfg.vigencia_cupon_dias, 'regalo_cumple', v_cfg.regalo_cumple_puntos);
end;
$$;
comment on function retail.fn_club_puntos_vigentes() is
  'La configuración vigente de los puntos del Club (lo que se gana, lo que valen, el canje, el cupón y el regalo de cumpleaños), sin datos de nadie. Pública: la leen el cartel del mostrador y la página que abre su QR.';
revoke all on function retail.fn_club_puntos_vigentes() from public;
grant execute on function retail.fn_club_puntos_vigentes() to anon, authenticated;

-- ---------- 2. Los tipos nuevos de aviso y sus textos ----------
alter table retail.club_textos drop constraint if exists club_textos_tipo_valido;
alter table retail.club_textos add constraint club_textos_tipo_valido check (tipo = any (array[
  'club', 'mensaje_personal', 'mensaje_generico', 'pagina_publicidad', 'terminos', 'privacidad', 'casilla_publicidad', 'saludo',
  'aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja', 'aviso_puntos']));
alter table retail.club_textos drop constraint if exists club_textos_aviso_con_baja;
alter table retail.club_textos add constraint club_textos_aviso_con_baja check (
  tipo <> all (array['aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja', 'aviso_puntos'])
  or (position('{nombre}' in texto) > 0 and right(texto, 50) = 'Si no quieres recibir más mensajes, responde BAJA.'));
alter table retail.club_avisos_enviados drop constraint if exists club_avisos_enviados_tipo_valido;
-- `aniversario` se queda para los avisos que YA se mandaron (historia); no salen nuevos.
alter table retail.club_avisos_enviados add constraint club_avisos_enviados_tipo_valido
  check (tipo = any (array['cumpleanos', 'aniversario', 'novedades', 'rebaja', 'puntos']));

insert into retail.club_textos (tipo, version, texto)
select 'aviso_cumpleanos', coalesce(max(version), 0) + 1,
       '¡Feliz mes de cumpleaños, {nombre}! Como miembro del Club CAYLA, con tu primera compra de este mes te regalamos {regalo} puntos, en cualquier tienda CAYLA o en la tienda web. Te esperamos en {tienda}. Si no quieres recibir más mensajes, responde BAJA.'
  from retail.club_textos where tipo = 'aviso_cumpleanos'
having not bool_or(position('{regalo}' in texto) > 0) or count(*) = 0;
insert into retail.club_textos (tipo, version, texto)
select 'aviso_puntos', 1,
       'Hola {nombre}, tienes {puntos} puntos en el Club CAYLA (valen S/ {valor}). Si no compras hasta el {fecha}, se eliminan junto con tus datos, como dicen los términos del club. Te esperamos en {tienda}. Si no quieres recibir más mensajes, responde BAJA.'
 where not exists (select 1 from retail.club_textos where tipo = 'aviso_puntos');

-- ---------- 3. registrar_aviso_enviado: el tipo nuevo ----------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.registrar_aviso_enviado(uuid, text, text, text, uuid)',
  $v$p_tipo not in ('cumpleanos', 'aniversario', 'novedades', 'rebaja')$v$,
  $v$p_tipo not in ('cumpleanos', 'puntos', 'novedades', 'rebaja')$v$,
  1);

-- ---------- 4. La lista de avisos por mandar (entera, con candado de versión) ----------
do $candado$
declare
  v_md5 text := (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_club_avisos_pendientes(uuid)'::regprocedure);
begin
  if v_md5 <> '1ed418fa498330469ed0880061849992' and position('aviso_puntos' in (select p.prosrc from pg_proc p where p.oid = 'retail.fn_club_avisos_pendientes(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_club_avisos_pendientes cambió desde que se escribió esta migración (md5 %): regenera su reemplazo desde la definición viva.', v_md5;
  end if;
end;
$candado$;

create or replace function retail.fn_club_avisos_pendientes(p_ubicacion_id uuid)
returns table (clienta_id uuid, nombre text, telefono text, tipo text, referencia text, texto text, detalle text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
  v_anio integer := extract(year from retail.fn_hoy_lima())::integer;
  v_mes_desde timestamptz := date_trunc('month', retail.fn_hoy_lima()::timestamp) at time zone 'America/Lima';
  v_semana text := to_char(retail.fn_hoy_lima(), 'IYYY-"S"IW');
  v_tienda text;
  v_regalo integer;
  v_t_cumple text;
  v_t_puntos text;
  v_t_novedades text;
  v_t_rebaja text;
  v_llegadas text;
begin
  perform retail.fn_exigir_modulo('avisos_club');
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes ver los avisos de esa tienda.' using errcode = '42501';
  end if;
  v_tienda := (select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda');
  if v_tienda is null then
    return;
  end if;
  -- Programa de puntos (2026-10-19): el cumpleaños regala puntos (la configuración vigente) y el aniversario ya no existe.
  v_regalo := (retail.fn_club_puntos_config(v_hoy)).regalo_cumple_puntos;
  v_t_cumple := (select t.texto from retail.club_textos t where t.tipo = 'aviso_cumpleanos' order by t.version desc limit 1);
  v_t_puntos := (select t.texto from retail.club_textos t where t.tipo = 'aviso_puntos' order by t.version desc limit 1);
  v_t_novedades := (select t.texto from retail.club_textos t where t.tipo = 'aviso_novedades' order by t.version desc limit 1);
  v_t_rebaja := (select t.texto from retail.club_textos t where t.tipo = 'aviso_rebaja' order by t.version desc limit 1);

  -- Lo que llegó a esta tienda en 14 días y sigue con stock libre aquí (igual para todas): hasta tres, lo último primero.
  v_llegadas := (
    select string_agg(x.referencia, ', ' order by x.llego desc)
      from (select p.referencia, max(m.created_at) as llego
              from retail.movimientos m
              join retail.variantes v on v.id = m.variante_id
              join retail.productos p on p.id = v.producto_id
             where m.ubicacion_id = p_ubicacion_id
               and m.created_at >= now() - interval '14 days'
               and retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
               and m.motivo is distinct from 'carga_inicial'
               and not p.es_prueba
               and exists (select 1 from retail.stock s
                            where s.ubicacion_id = p_ubicacion_id and s.variante_id in (select w.id from retail.variantes w where w.producto_id = p.id)
                              and s.cantidad - s.cantidad_apartada > 0)
             group by p.id, p.referencia
             order by max(m.created_at) desc
             limit 3) x);

  return query
  with socias as (
    select c.id, c.nombre as nombre_completo, c.telefono_whatsapp as tel, c.cumple_mes,
           retail.fn_club_nombre_de_pila(c.nombre) as pila, retail.fn_club_es_testigo(c.id) as testigo
      from retail.clientas c
     where c.club_desde is not null and c.publicidad_desde is not null
       and not c.anonimizada and c.archivada_en is null and c.fusionada_en_id is null
       and c.telefono_whatsapp is not null
       and coalesce(c.club_ubicacion_id, (select rc.su_sede_id from retail.fn_club_resumen_compras(c.id) rc)) = p_ubicacion_id
  ),
  vivos as (
    select e.clienta_id as cid, e.tipo as etipo, e.referencia as eref, e.creado_en
      from retail.club_avisos_enviados e
     where e.deshecho_en is null and e.clienta_id in (select s.id from socias s)
  ),
  -- El regalo de cumpleaños (programa de puntos): su mes y sin un regalo vivo este año (uno ya revertido no cuenta), como la caja.
  cumple as (
    select s.id, 'cumpleanos'::text as atipo, v_anio::text as aref,
           replace(replace(replace(v_t_cumple, '{nombre}', s.pila), '{regalo}', v_regalo::text), '{tienda}', v_tienda) as atexto,
           'Regalo de cumpleaños: +' || v_regalo || ' puntos con su primera compra del mes' as adetalle,
           1 as orden, s.nombre_completo, s.tel
      from socias s
     where v_t_cumple is not null and v_regalo > 0
       and s.cumple_mes = extract(month from v_hoy)
       and not exists (select 1 from retail.club_puntos_movimientos m
                        where m.clienta_id = s.id and m.tipo = 'cumple' and m.anio = v_anio
                          and not exists (select 1 from retail.club_puntos_movimientos r where r.tipo = 'revierte' and r.de_movimiento_id = m.id))
       and not exists (select 1 from vivos w where w.cid = s.id and w.etipo = 'cumpleanos' and w.eref = v_anio::text)
  ),
  -- Sus puntos se eliminan pronto (Términos 5.7: «te avisamos 30 días antes por WhatsApp si lo autorizaste»): un aviso por fecha.
  puntos as (
    select s.id, 'puntos'::text as atipo, h.hasta::text as aref,
           replace(replace(replace(replace(replace(v_t_puntos, '{nombre}', s.pila), '{puntos}', sal.saldo::text),
                                   '{valor}', retail.fn_club_soles_texto(retail.fn_club_puntos_valor(sal.saldo, v_hoy))),
                           '{fecha}', retail.fn_club_fecha_texto(h.hasta)), '{tienda}', v_tienda) as atexto,
           sal.saldo || ' puntos se eliminan si no compra hasta el ' || retail.fn_club_fecha_texto(h.hasta) as adetalle,
           2 as orden, s.nombre_completo, s.tel
      from socias s
      join retail.club_puntos_saldos sal on sal.clienta_id = s.id and sal.saldo > 0
      cross join lateral (select retail.fn_club_conservacion_hasta(s.id) as hasta) h
     where v_t_puntos is not null and h.hasta between v_hoy and v_hoy + 30
       and not exists (select 1 from vivos w where w.cid = s.id and w.etipo = 'puntos' and w.eref = h.hasta::text)
       -- Las mismas excepciones de `fn_club_anonimizar_inactivas` (20261019220000): con un apartado abierto o un pedido web que no
       -- terminó, la ficha no se elimina, así que no se le avisa que se va a eliminar.
       and not exists (select 1 from retail.separaciones sp where sp.clienta_id = s.id and sp.estado = 'abierta')
       and not exists (select 1 from retail.pedidos_web pw
                        where pw.clienta_id = s.id and pw.estado not in ('entregado', 'vencido', 'anulado'))
  ),
  -- Su talla deducida por categoría: la de su compra completada más reciente de esa categoría (deducirTallas, sobre las
  -- mismas filas que fn_clienta_compras). Solo de quienes pueden recibir una rebaja.
  tallas as (
    select distinct on (x.cid, x.categoria_id) x.cid, x.categoria_id, x.talla_id
      from (select v.cliente_id as cid, pr.categoria_id, va.talla_id, v.created_at, vi.id as item_id
              from retail.ventas v
              join retail.venta_items vi on vi.venta_id = v.id
              join retail.variantes va on va.id = vi.variante_id
              join retail.productos pr on pr.id = va.producto_id
             where v.estado = 'completada'
               and v.cliente_id in (select s.id from socias s where not s.testigo)
               and pr.categoria_id is not null and va.talla_id is not null) x
     order by x.cid, x.categoria_id, x.created_at desc, x.item_id
  ),
  -- Lo que está en campaña hoy (la que cobra la caja) con stock libre en esta tienda.
  ofertas as (
    select cv.etiqueta_id, cv.descuento_pct, e.vigente_desde, pr.categoria_id, va.talla_id, pr.referencia as prenda,
           ta.valor as talla
      from retail.campanas_vigentes() cv
      join retail.etiquetas e on e.id = cv.etiqueta_id
      join retail.variantes va on va.id = cv.variante_id
      join retail.productos pr on pr.id = va.producto_id
      join retail.tallas ta on ta.id = va.talla_id
     where not pr.es_prueba
       and exists (select 1 from retail.stock st
                    where st.variante_id = va.id and st.ubicacion_id = p_ubicacion_id and st.cantidad - st.cantidad_apartada > 0)
  ),
  rebaja as (
    select distinct on (s.id) s.id, 'rebaja'::text as atipo,
           o.etiqueta_id::text || ':' || coalesce(o.vigente_desde::text, '-') as aref,
           replace(replace(replace(replace(v_t_rebaja, '{nombre}', s.pila), '{prenda}', o.prenda),
                           '{pct}', trim_scale(o.descuento_pct)::text), '{tienda}', v_tienda) as atexto,
           o.prenda || ' talla ' || o.talla || ': ' || trim_scale(o.descuento_pct)::text || ' % menos' as adetalle,
           3 as orden, s.nombre_completo, s.tel
      from socias s
      join tallas t on t.cid = s.id
      join ofertas o on o.categoria_id = t.categoria_id and o.talla_id = t.talla_id
     where v_t_rebaja is not null and not s.testigo
       and not exists (select 1 from vivos w
                        where w.cid = s.id and w.etipo = 'rebaja'
                          and w.eref = o.etiqueta_id::text || ':' || coalesce(o.vigente_desde::text, '-'))
     order by s.id, o.descuento_pct desc, o.prenda, o.etiqueta_id
  ),
  novedades as (
    select s.id, 'novedades'::text as atipo, v_semana as aref,
           replace(replace(v_t_novedades, '{nombre}', s.pila), '{tienda}', v_tienda) as atexto,
           'Llegó: ' || v_llegadas as adetalle,
           4 as orden, s.nombre_completo, s.tel
      from socias s
     where v_t_novedades is not null and v_llegadas is not null and not s.testigo
       and not exists (select 1 from vivos w where w.cid = s.id and w.etipo = 'novedades' and w.creado_en > now() - interval '7 days')
  ),
  -- CL-21: a lo más 2 promocionales en el mes calendario de Lima (los no deshechos ya enviados cuentan).
  promos_del_mes as (
    select w.cid, count(*)::integer as enviadas
      from vivos w where w.etipo in ('rebaja', 'novedades') and w.creado_en >= v_mes_desde
     group by w.cid
  ),
  promos as (
    select p.*, row_number() over (partition by p.id order by p.orden) as puesto
      from (select * from rebaja union all select * from novedades) p
  ),
  todo as (
    select * from cumple
    union all
    select * from puntos
    union all
    select p.id, p.atipo, p.aref, p.atexto, p.adetalle, p.orden, p.nombre_completo, p.tel
      from promos p
      left join promos_del_mes m on m.cid = p.id
     where p.puesto <= 2 - coalesce(m.enviadas, 0)
  )
  select t.id, t.nombre_completo, t.tel, t.atipo, t.aref, t.atexto, t.adetalle
    from todo t
   order by t.orden, t.nombre_completo, t.id;
end;
$$;

update retail.modulos
   set incluye = 'Ver los mensajes del club por mandar a los miembros con WhatsApp de su tienda (regalo de cumpleaños, puntos por vencer, novedades y rebajas en su talla), enviarlos por WhatsApp Web, deshacer un envío y anotar la BAJA'
 where clave = 'avisos_club';

comment on function retail.fn_club_avisos_pendientes(uuid) is
  'Clientas ▸ Avisos (ADR-0288 G-8; programa de puntos 2026-10-19): los mensajes del club por mandar hoy a los miembros con publicidad de esa tienda (club_ubicacion_id; sin ella, su sede): cumpleanos (su mes y su regalo de puntos sin recibir este año), puntos (sus puntos se eliminan en 30 días o menos por la conservación de 3 años, uno por fecha), rebaja (campaña vigente con stock libre aquí en su talla deducida, una por campaña) y novedades (llegadas de 14 días con stock libre, una cada 7 días). Rebaja y novedades: sin el grupo testigo (CL-20) y con el tope de 2 al mes (CL-21). Con el texto de la plantilla aviso_* completo. Lectura (prefijo fn_). Módulo «Avisos del club».';

reset lock_timeout;
notify pgrst, 'reload schema';
