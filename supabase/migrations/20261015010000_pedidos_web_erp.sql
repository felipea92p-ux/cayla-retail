-- ============================================================================
-- 20261015010000_pedidos_web_erp.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 8: Ventas ▸ Pedidos web (confirmar)
--
-- EL PROBLEMA PRIMERO. El motor del pedido web (`20261014235000_pedidos_web_modelo.sql`) ya confirma, reserva y anula, pero
-- nadie en una tienda lo podía usar: faltaba el módulo, los plazos estaban escritos a mano (24, 48, 7) en vez de salir de
-- Configuración ▸ Tienda web, el aviso de «confirmado y sin pagar» saltaba también a quien ya dejó su adelanto por una prenda
-- que la tienda está consiguiendo, y una prenda reservada en OTRA tienda quedaba reservada allá para siempre: nadie la traía.
--
-- LO QUE HACE
--   1. El módulo `pedidos_web` (Ventas ▸ Pedidos web), entre Apartados y Caja. Nace SIN rol (ADR-0161): solo lo ve el líder
--      hasta que él lo da. Su guardián en la base es `fn_pedido_web_exigir` (el módulo de la cuenta y la tienda que opera).
--   2. Los plazos salen de `configuracion_tienda_web` (actividad 6): `fn_pedido_web_plazos()`. Las cuatro funciones del ERP
--      del motor (`fn_pedidos_web_sede`, `fn_pedido_web`, `confirmar_pedido_web`, `no_confirmar_pedido_web`) los usan cuando no
--      se les pasa un número (su valor de fábrica pasa de 24/48/7 a «el de Configuración»).
--   3. El aviso de 48 h (decisión de Felipe, ADR-0408 act. c): no salta mientras el pedido espera una prenda (por conseguir o
--      en camino) y ya dejó su adelanto; cuando la prenda llega, las horas corren desde que quedó reservada (el resto se cobra
--      al recoger). En `fn_pedidos_web_estado_hoy`, la única regla de los avisos.
--   4. TRAER la prenda reservada en otra tienda, con el motor de traslados de siempre (el de «pedir a otra sede»):
--        · `enviar_pedido_web_desde` (la tienda que la tiene): suelta la reserva de allá y, en la MISMA transacción, la manda en
--          un traslado (`iniciar_traslado`) hacia la tienda del pedido. Si estaba colgada, primero sube al almacén (de ahí sale
--          todo traslado). La línea queda «por conseguir» con su traslado y la fecha en que llega: nunca hay un instante en que
--          la prenda quede libre para otra caja.
--        · Al recibir el traslado (`confirmar_traslado` o el cierre con diferencia del líder), la prenda queda reservada SOLA
--          para su pedido, donde entró (disparador sobre `transferencia_recepciones`). Si no se puede (se descontinuó, entró a un
--          lugar que no se vende), el traslado se cierra igual y la pantalla lo dice: «llegó, resérvala».
--        · Si el envío se anula, la prenda vuelve a la otra tienda y se vuelve a reservar allá (disparador sobre `transferencias`).
--        · Si el traslado se cierra sin ella (no llegó), la línea sigue «por conseguir»: la sede decide (otra tienda, conseguirla).
--   5. Las lecturas de la pantalla: `fn_pedidos_web_tablero` (la lista de la tienda, sus prendas en miniatura, lo cobrado hoy y
--      lo que otra tienda espera de aquí), `fn_pedido_web_detalle` (el detalle, con cada prenda dibujable y su traslado) y
--      `fn_pedidos_web_por_confirmar` (el número del menú: un pedido sin confirmar se cierra solo, y el menú es lo que se ve siempre).
--
-- CÓMO SE CAMBIA EL MOTOR: REEMPLAZOS ANCLADOS. Las siete funciones del motor que se tocan (no están en producción) se cambian
-- con `pg_temp.anclar`, no reescritas enteras: si otra actividad (la 7 o la 9) cambia esas funciones en su lugar, este reemplazo
-- solo toca su ancla y respeta lo demás; si su ancla ya no aparece exactamente una vez, la migración ABORTA (nunca pisa en silencio).
-- Re-ejecutable: un ancla ya aplicada no hace nada.
--
-- POR QUÉ «POR CONSEGUIR» PARA LO QUE VIAJA. La línea del motor solo tiene una reserva y es inmutable (se libera anulando). Viajar
-- es justo «la prenda todavía no está en la tienda del pedido»: lo mismo que una prenda por conseguir, con su fecha (la de llegada)
-- y el traslado que la trae (`pedido_web_lineas.transferencia_id`). Así no nace un estado nuevo: el motor ya sabe que «por conseguir»
-- no deja recoger, no tiene reserva y pasa a «reservada» cuando llega (`por_conseguir → reservada`, la misma transición del motor).
-- La única transición nueva es `reservada → por_conseguir`, y solo la permite el disparador de la línea con la marca de la
-- transacción que pone `enviar_pedido_web_desde` (`retail.pedido_web_envio`), como `retail.salida_de_pedido_cliente` en Traslados.
--
-- DESCARTÉ: (a) reusar `separacion_pedidos` (el pedido a otra sede de Apartados): exige el nombre y el celular del cliente, que el
--   motor del pedido web no copia a ninguna tabla de operación (Ley 29733, ADR-0288), y sus diez lectores (Traslados, Vender, Inicio)
--   no conocen un pedido web; (b) reescribir `fn_apartar_pedidos_que_llegaron` (de Traslados, en producción) para engancharse a la
--   llegada: un disparador propio sobre `transferencia_recepciones` no toca ninguna función viva; (c) un estado «en camino» nuevo en
--   la línea: obligaba a reescribir los CHECK, el disparador, la verificación y las lecturas del motor para decir lo mismo que
--   «por conseguir con su traslado».
--
-- SE ROMPE SI: alguien vuelve a pegar `20261014235000_pedidos_web_modelo.sql` DESPUÉS de esta (sus `create or replace` borran las
-- anclas: los plazos vuelven a 24/48/7, el aviso de 48 h vuelve a saltar con adelanto y un envío ya no puede soltar la reserva);
-- se arregla volviendo a pegar esta. O si `confirmar_traslado` y `cerrar_traslado_con_diferencia` dejan de anotar el movimiento
-- de entrada en `transferencia_recepciones.movimiento_id` (la llegada no reservaría sola; la línea quedaría «por conseguir» y la
-- pantalla pediría reservarla a mano).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de `20261014235000_pedidos_web_modelo.sql` y de
-- `20261015000000_pedidos_web_cobros.sql`, y de `20261014231000_tienda_web_sedes_y_plazos.sql` (lee `configuracion_tienda_web`).
-- Sin políticas ni `drop trigger`: crea dos disparadores con `create or replace trigger` sobre tablas que Traslados usa
-- (`transferencias`, `transferencia_recepciones`), que toman un candado breve de cada una (`lock_timeout = 3s`: si una tienda
-- las tiene tomadas, falla sin tocar nada y se vuelve a pegar). El `alter table` es de `pedido_web_lineas`, que nadie usa todavía.
-- Ningún `select … into` dentro de un texto entre comillas (las anclas van entre `$v$`/`$n$` y usan asignaciones).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplazo anclado (el de 20261005130100 y 20261014234000): si el texto nuevo ya está, no hace nada; si el viejo no aparece
-- EXACTAMENTE una vez, aborta.
create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ----------------------------------------------------------------------------
-- 1. El módulo (ADR-0161, CLAUDE.md «Módulos y roles»): sin `rol_modulos`, nace solo para el líder.
-- ----------------------------------------------------------------------------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('pedidos_web', 'Ventas', 'Pedidos web',
   'Ver los pedidos que los clientes separan en la tienda online para su tienda, confirmarlos (de dónde sale cada prenda, conseguirla para una fecha o quitarla), no confirmarlos o anularlos con su motivo, y enviar a la tienda del pedido las prendas que se reservaron aquí',
   17, false, true)
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Los plazos, de Configuración ▸ Tienda web (actividad 6). Una sola fila; si faltara, los de fábrica (principio 9).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_pedido_web_plazos()
returns table (horas_para_confirmar integer, horas_aviso_sin_pagar integer, dias_aviso_sin_recoger integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(c.horas_para_confirmar, 24), coalesce(c.horas_aviso_sin_pagar, 48), coalesce(c.dias_aviso_sin_recoger, 7)
    from (select 1) as una
    left join retail.configuracion_tienda_web c on c.id;
$$;

comment on function retail.fn_pedido_web_plazos() is
  'Pedidos web (ADR-0408, act. 8): los plazos de hoy (horas para confirmar, aviso sin pagar, días para recoger), de configuracion_tienda_web. Interna.';

-- confirmar_pedido_web y no_confirmar_pedido_web: sin plazo, el de Configuración.
select pg_temp.anclar('retail.confirmar_pedido_web(uuid, jsonb, integer)',
  $v$p_horas_para_confirmar integer DEFAULT 24)$v$,
  $n$p_horas_para_confirmar integer DEFAULT NULL::integer)$n$);
select pg_temp.anclar('retail.confirmar_pedido_web(uuid, jsonb, integer)',
  $v$  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);$v$,
  $n$  -- ADR-0408 act. 8: sin plazo, el de Configuración ▸ Tienda web (actividad 6), no uno escrito a mano.
  p_horas_para_confirmar := coalesce(p_horas_para_confirmar, (select x.horas_para_confirmar from retail.fn_pedido_web_plazos() x));
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);$n$);

select pg_temp.anclar('retail.no_confirmar_pedido_web(uuid, text, integer)',
  $v$p_horas_para_confirmar integer DEFAULT 24)$v$,
  $n$p_horas_para_confirmar integer DEFAULT NULL::integer)$n$);
select pg_temp.anclar('retail.no_confirmar_pedido_web(uuid, text, integer)',
  $v$  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);$v$,
  $n$  -- ADR-0408 act. 8: sin plazo, el de Configuración ▸ Tienda web (actividad 6), no uno escrito a mano.
  p_horas_para_confirmar := coalesce(p_horas_para_confirmar, (select x.horas_para_confirmar from retail.fn_pedido_web_plazos() x));
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);$n$);

-- fn_pedidos_web_sede y fn_pedido_web (las lecturas del ERP): lo mismo con los tres plazos.
select pg_temp.anclar('retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer)',
  $v$p_horas_para_confirmar integer DEFAULT 24, p_horas_aviso_sin_pagar integer DEFAULT 48, p_dias_aviso_sin_recoger integer DEFAULT 7, p_dias_cerrados integer DEFAULT 30)$v$,
  $n$p_horas_para_confirmar integer DEFAULT NULL::integer, p_horas_aviso_sin_pagar integer DEFAULT NULL::integer, p_dias_aviso_sin_recoger integer DEFAULT NULL::integer, p_dias_cerrados integer DEFAULT 30)$n$);
select pg_temp.anclar('retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer)',
  $v$  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger);$v$,
  $n$  -- ADR-0408 act. 8: sin plazos, los de Configuración ▸ Tienda web (actividad 6), no unos escritos a mano.
  p_horas_para_confirmar := coalesce(p_horas_para_confirmar, (select x.horas_para_confirmar from retail.fn_pedido_web_plazos() x));
  p_horas_aviso_sin_pagar := coalesce(p_horas_aviso_sin_pagar, (select x.horas_aviso_sin_pagar from retail.fn_pedido_web_plazos() x));
  p_dias_aviso_sin_recoger := coalesce(p_dias_aviso_sin_recoger, (select x.dias_aviso_sin_recoger from retail.fn_pedido_web_plazos() x));
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger);$n$);

select pg_temp.anclar('retail.fn_pedido_web(uuid, integer, integer, integer)',
  $v$p_horas_para_confirmar integer DEFAULT 24, p_horas_aviso_sin_pagar integer DEFAULT 48, p_dias_aviso_sin_recoger integer DEFAULT 7)$v$,
  $n$p_horas_para_confirmar integer DEFAULT NULL::integer, p_horas_aviso_sin_pagar integer DEFAULT NULL::integer, p_dias_aviso_sin_recoger integer DEFAULT NULL::integer)$n$);
select pg_temp.anclar('retail.fn_pedido_web(uuid, integer, integer, integer)',
  $v$  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger);$v$,
  $n$  -- ADR-0408 act. 8: sin plazos, los de Configuración ▸ Tienda web (actividad 6), no unos escritos a mano.
  p_horas_para_confirmar := coalesce(p_horas_para_confirmar, (select x.horas_para_confirmar from retail.fn_pedido_web_plazos() x));
  p_horas_aviso_sin_pagar := coalesce(p_horas_aviso_sin_pagar, (select x.horas_aviso_sin_pagar from retail.fn_pedido_web_plazos() x));
  p_dias_aviso_sin_recoger := coalesce(p_dias_aviso_sin_recoger, (select x.dias_aviso_sin_recoger from retail.fn_pedido_web_plazos() x));
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger);$n$);

-- ----------------------------------------------------------------------------
-- 3. La prenda que viaja: su traslado en la línea, y las reglas del disparador y de la verificación.
-- ----------------------------------------------------------------------------
alter table retail.pedido_web_lineas add column if not exists transferencia_id uuid references retail.transferencias(id);
comment on column retail.pedido_web_lineas.transferencia_id is
  'El traslado que trae la prenda a la tienda del pedido (lo anota enviar_pedido_web_desde). Mientras viaja, la línea está por conseguir.';
create index if not exists pedido_web_lineas_transferencia_idx
  on retail.pedido_web_lineas (transferencia_id, variante_id) where transferencia_id is not null;

-- El disparador de la línea: la transición `reservada → por_conseguir` (soltar allá para traerla) solo con la marca del envío, y el
-- traslado se anota solo así.
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$declare
  v_pedido text;
begin$v$,
  $n$declare
  v_pedido text;
  v_tienda_pedido uuid;
  v_enviando boolean := false;
  v_viaja boolean := false;
begin$n$);
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$  if tg_op = 'INSERT' then
    if v_pedido is distinct from 'por_confirmar' or new.estado <> 'pendiente' or new.fecha_compromiso is not null then$v$,
  $n$  -- ADR-0408 act. 8: traer una prenda reservada en otra tienda. Solo `enviar_pedido_web_desde` lo hace, con su marca puesta en la
  -- transacción: la línea deja su reserva de allá y queda «por conseguir» con el traslado que la trae.
  v_enviando := coalesce(current_setting('retail.pedido_web_envio', true), '') = new.pedido_id::text;
  v_tienda_pedido := (select w.ubicacion_id from retail.pedidos_web w where w.id = new.pedido_id);
  if tg_op = 'INSERT' then
    if v_pedido is distinct from 'por_confirmar' or new.estado <> 'pendiente' or new.fecha_compromiso is not null
       or new.transferencia_id is not null then$n$);
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$  if (new.pedido_id, new.posicion, new.variante_id,$v$,
  $n$  v_viaja := v_enviando and old.estado = 'reservada' and new.estado = 'por_conseguir' and v_pedido in ('confirmado', 'pagado')
             and old.ubicacion_id is distinct from v_tienda_pedido;
  if (new.pedido_id, new.posicion, new.variante_id,$n$);
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$  if old.apartado_id is not null
     and (new.apartado_id,$v$,
  $n$  if old.apartado_id is not null and not v_viaja
     and (new.apartado_id,$n$);
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$    or (old.estado = 'reservada' and new.estado = 'liberada' and v_pedido = 'anulado')$v$,
  $n$    or v_viaja
    or (old.estado = 'reservada' and new.estado = 'liberada' and v_pedido = 'anulado')$n$);
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$    raise exception 'La fecha prometida solo existe mientras la prenda está por conseguir.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;$v$,
  $n$    raise exception 'La fecha prometida solo existe mientras la prenda está por conseguir.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  -- ADR-0408 act. 8: el traslado que trae la prenda lo anota solo el envío (con su marca), y anotado no se borra.
  if new.transferencia_id is distinct from old.transferencia_id
     and not (v_enviando and new.estado = 'por_conseguir' and new.transferencia_id is not null) then
    raise exception 'El traslado que trae una prenda de un pedido web lo anota el envío, y no se cambia.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;$n$);

-- La verificación del pedido entero (al confirmar la transacción): la prenda que viaja o viajó tiene su traslado, hacia la tienda
-- del pedido y con esa prenda.
select pg_temp.anclar('retail.fn_pedido_web_verificar(uuid)',
  $v$    raise exception 'En el pedido web %, el efectivo de % pago(s) no cuadra con la caja de su tienda.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$v$,
  $n$    raise exception 'En el pedido web %, el efectivo de % pago(s) no cuadra con la caja de su tienda.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;

  -- ADR-0408 act. 8: la prenda que viaja (o viajó) a la tienda del pedido tiene su traslado, hacia esa tienda y con esa prenda.
  v_mal := (select count(*)
              from retail.pedido_web_lineas l
              left join retail.transferencias t on t.id = l.transferencia_id
             where l.pedido_id = p.id and l.transferencia_id is not null
               and (t.id is null or t.ubicacion_destino_id <> p.ubicacion_id
                    or not exists (select 1 from retail.transferencia_items ti
                                    where ti.transferencia_id = t.id and ti.variante_id = l.variante_id)));
  if v_mal > 0 then
    raise exception 'En el pedido web %, % prenda(s) dicen viajar en un traslado que no las lleva a su tienda.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$n$);

-- ----------------------------------------------------------------------------
-- 4. Los avisos al leer (la única regla, `fn_pedidos_web_estado_hoy`).
--    · «por traer» suma lo que viaja en un traslado hacia la tienda del pedido; «por conseguir», lo que de verdad hay que conseguir
--      (sin traslado en camino, o con uno que se cerró sin ella).
--    · «confirmado y sin pagar» (decisión de Felipe, ADR-0408 act. c): no salta mientras el pedido espera una prenda (por conseguir o
--      en camino) con su adelanto pagado; cuando llega, las horas corren desde que quedó reservada. Sin adelanto, como siempre: desde
--      que se confirmó.
-- (Primero las columnas nuevas de la subconsulta y después la regla que las usa: cada ancla recrea la función y la valida entera.)
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedidos_web_estado_hoy(integer, integer, integer, uuid, uuid, uuid)',
  $v$      select count(*) filter (where l.estado <> 'quitada')::integer as vivas,
             count(*) filter (where l.estado = 'por_conseguir')::integer as por_conseguir,
             count(*) filter (where l.estado = 'reservada' and l.ubicacion_id <> w.ubicacion_id)::integer as por_traer,
             max(l.reservada_en) filter (where l.estado = 'reservada') as ultima_reserva
        from retail.pedido_web_lineas l where l.pedido_id = w.id$v$,
  $n$      select count(*) filter (where l.estado <> 'quitada')::integer as vivas,
             -- ADR-0408 act. 8: lo que viaja en un traslado hacia la tienda del pedido está «por traer», no «por conseguir».
             count(*) filter (where l.estado = 'por_conseguir'
                                and not coalesce(t.estado in ('en_transito', 'recibido_con_diferencia'), false))::integer as por_conseguir,
             count(*) filter (where (l.estado = 'reservada' and l.ubicacion_id <> w.ubicacion_id)
                                 or (l.estado = 'por_conseguir'
                                     and coalesce(t.estado in ('en_transito', 'recibido_con_diferencia'), false)))::integer as por_traer,
             max(l.reservada_en) filter (where l.estado = 'reservada') as ultima_reserva,
             count(*) filter (where l.estado = 'por_conseguir')::integer as espera,
             max(l.reservada_en) filter (where l.estado = 'reservada' and l.fecha_compromiso is not null) as llego_lo_esperado
        from retail.pedido_web_lineas l
        left join retail.transferencias t on t.id = l.transferencia_id
       where l.pedido_id = w.id$n$);
select pg_temp.anclar('retail.fn_pedidos_web_estado_hoy(integer, integer, integer, uuid, uuid, uuid)',
  $v$         w.estado = 'confirmado' and now() > w.confirmado_en + make_interval(hours => p_horas_aviso_sin_pagar),$v$,
  $n$         -- ADR-0408 act. c (actividad 8): lo que espera una prenda (por conseguir o en camino) con su adelanto pagado no avisa;
         -- cuando llega, las horas corren desde que quedó reservada (el resto se cobra al recoger).
         w.estado = 'confirmado' and not (x.espera > 0 and w.pagado > 0)
           and now() > case when w.pagado > 0 then greatest(w.confirmado_en, coalesce(x.llego_lo_esperado, w.confirmado_en))
                            else w.confirmado_en end + make_interval(hours => p_horas_aviso_sin_pagar),$n$);

-- ----------------------------------------------------------------------------
-- 5. Enviar a la tienda del pedido lo que se reservó aquí (la tienda que tiene la prenda).
--    p_ubicacion_origen_id: la tienda que envía (la de quien opera). Manda TODAS las prendas del pedido reservadas ahí, en UN
--    traslado. p_token: un doble clic o un reintento devuelve el MISMO envío (la marca queda en el traslado, ADR-0190).
-- ----------------------------------------------------------------------------
create or replace function retail.enviar_pedido_web_desde(
  p_pedido_id uuid,
  p_ubicacion_origen_id uuid,
  p_fecha_estimada_llegada timestamptz,
  p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_max_dias constant integer := 60;  -- tope de cordura de una fecha de llegada, el mismo de una fecha prometida
  p retail.pedidos_web%rowtype;
  a retail.apartados%rowtype;
  l record;
  v_tr uuid;
  v_persona uuid;
  v_alm uuid;
  v_llega date;
  v_hoy date := retail.fn_hoy_lima();
  v_sede_pedido text;
  v_sede_origen text;
  v_lineas uuid[];
  v_items jsonb;
  v_mov uuid;
begin
  -- Doble clic o red que se cae: la misma marca espera al primero y devuelve el traslado que ya salió.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedido_web_envio:' || p_token::text, 0));
    v_tr := (select t.id from retail.transferencias t where t.token_cliente = p_token);
    if v_tr is not null then
      if not exists (select 1 from retail.pedido_web_lineas x where x.transferencia_id = v_tr and x.pedido_id = p_pedido_id) then
        raise exception 'Esa marca de envío es de otro traslado.' using errcode = '22023', hint = 'pedido_web_token';
      end if;
      return retail.fn_pedido_web_resumen(p_pedido_id)
        || jsonb_build_object('transferencia_id', v_tr, 'traslado_numero', (select t.numero from retail.transferencias t where t.id = v_tr),
                              'repetido', true);
    end if;
  end if;

  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  -- El permiso: el módulo y operar la tienda que ENVÍA (la prenda está allá).
  perform retail.fn_pedido_web_exigir(p_ubicacion_origen_id);
  if p.estado not in ('confirmado', 'pagado') then
    raise exception '%', retail.fn_pedido_web_no_admite(p, 'enviar sus prendas') using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  v_sede_pedido := coalesce((select u.nombre from retail.ubicaciones u where u.id = p.ubicacion_id), 'la tienda del pedido');
  v_sede_origen := coalesce((select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_origen_id), 'esta tienda');
  if p_ubicacion_origen_id = p.ubicacion_id then
    raise exception 'Esas prendas ya están en %, la tienda del pedido: no hay nada que enviar.', v_sede_pedido
      using errcode = 'P0001', hint = 'pedido_web_nada_que_enviar';
  end if;
  v_llega := (p_fecha_estimada_llegada at time zone 'America/Lima')::date;
  if p_fecha_estimada_llegada is null or v_llega < v_hoy or v_llega > v_hoy + c_max_dias then
    raise exception 'Elige cuándo llega: de hoy a % días.', c_max_dias using errcode = '22023', hint = 'pedido_web_fecha';
  end if;
  v_lineas := array(select x.id from retail.pedido_web_lineas x
                     where x.pedido_id = p.id and x.estado = 'reservada' and x.ubicacion_id = p_ubicacion_origen_id
                     order by x.posicion);
  if cardinality(v_lineas) = 0 then
    raise exception 'El pedido web % no tiene prendas reservadas en % para enviar.', p.codigo, v_sede_origen
      using errcode = 'P0001', hint = 'pedido_web_nada_que_enviar';
  end if;
  v_persona := retail.fn_pedido_web_actor();

  -- ADR-0190: el stock de esas prendas en la tienda que envía, bloqueado en orden antes de mover nada.
  perform retail.fn_bloquear_en_orden(p_ubicacion_origen_id,
    array(select distinct x.variante_id from retail.pedido_web_lineas x where x.id = any (v_lineas)));
  v_alm := retail.fn_sububicacion_por_defecto(p_ubicacion_origen_id, 'traslado_salida');

  -- La marca de esta transacción: el disparador de la línea deja soltar la reserva SOLO para este pedido y SOLO mientras dure.
  perform set_config('retail.pedido_web_envio', p.id::text, true);
  for l in select x.* from retail.pedido_web_lineas x where x.id = any (v_lineas) order by x.posicion for update loop
    select * into a from retail.apartados ap where ap.id = l.apartado_id for update;
    if not found or a.estado <> 'abierto' then
      raise exception 'La reserva de una prenda del pedido web % ya no estaba abierta.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    -- (1) La línea deja de estar reservada allá: queda por conseguir, con la fecha en que llega (o la que ya se le prometió).
    update retail.pedido_web_lineas x
       set estado = 'por_conseguir', apartado_id = null, ubicacion_id = null, sububicacion_id = null, reservada_en = null,
           fecha_compromiso = coalesce(x.fecha_compromiso, v_llega)
     where x.id = l.id;
    -- (2) Su reserva de allá se suelta: la «liberacion_apartado» del libro, con el número del pedido (nunca el cliente).
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
      values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'liberacion_apartado', a.cantidad, 'liberacion_apartado', v_persona,
              left('Pedido web ' || p.codigo || ': sale en un traslado hacia ' || v_sede_pedido, 500))
      returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
    update retail.apartados ap
       set estado = 'liberado', cerrado_por = v_persona, cerrado_en = now(), cierre_motivo = 'otro', movimiento_cierre_id = v_mov
     where ap.id = a.id;
    -- (3) Si estaba colgada en el piso, sube al almacén: de ahí sale todo traslado (`iniciar_traslado`).
    if v_alm is not null and a.sububicacion_id is distinct from v_alm then
      perform retail.mover_interno(p_ubicacion_origen_id, a.variante_id, a.cantidad, a.sububicacion_id, v_alm,
                                   left('Pedido web ' || p.codigo || ': se descuelga para enviarla a ' || v_sede_pedido, 500));
    end if;
  end loop;

  -- (4) El traslado de siempre. La marca de Traslados dice que esta caja lleva prendas para un cliente: no descuenta la lista
  --     «Para enviar» de esa tienda (`trg_para_enviar_al_salir`).
  v_items := (select jsonb_agg(jsonb_build_object('variante_id', y.variante_id, 'cantidad', y.n) order by y.variante_id)
                from (select x.variante_id, count(*)::integer as n from retail.pedido_web_lineas x
                       where x.id = any (v_lineas) group by x.variante_id) y);
  perform set_config('retail.salida_de_pedido_cliente', 'si', true);
  v_tr := retail.iniciar_traslado(p_ubicacion_origen_id, p.ubicacion_id, v_items, p_fecha_estimada_llegada,
                                  left('Pedido web ' || p.codigo || ' para ' || v_sede_pedido || ': se reserva sola al llegar', 200),
                                  p_token);
  perform set_config('retail.salida_de_pedido_cliente', '', true);

  -- (5) Cada línea anota el traslado que la trae.
  update retail.pedido_web_lineas x set transferencia_id = v_tr where x.id = any (v_lineas);
  perform set_config('retail.pedido_web_envio', '', true);

  return retail.fn_pedido_web_resumen(p.id)
    || jsonb_build_object('transferencia_id', v_tr, 'traslado_numero', (select t.numero from retail.transferencias t where t.id = v_tr),
                          'repetido', false);
end;
$$;

comment on function retail.enviar_pedido_web_desde(uuid, uuid, timestamptz, uuid) is
  'Pedidos web (ADR-0408, act. 8): la tienda que tiene las prendas reservadas de un pedido de otra tienda las envía en un traslado. Suelta la reserva y arma el traslado en la misma transacción; al llegar se reservan solas.';

-- ----------------------------------------------------------------------------
-- 6. Al llegar: la prenda queda reservada sola para su pedido, donde entró. Se engancha a la anotación del movimiento de entrada
--    (`transferencia_recepciones.movimiento_id`), que hacen `confirmar_traslado` y `cerrar_traslado_con_diferencia`. Nunca frena
--    la recepción: si no puede reservarla, lo deja dicho y la línea sigue «por conseguir» (la pantalla pide reservarla).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_pedido_web_llego_en_traslado()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  m retail.movimientos%rowtype;
  v_resto integer;
  l record;
begin
  if not exists (select 1 from retail.pedido_web_lineas x
                  where x.transferencia_id = new.transferencia_id and x.variante_id = new.variante_id and x.estado = 'por_conseguir') then
    return null;
  end if;
  select * into m from retail.movimientos mv where mv.id = new.movimiento_id;
  if not found or m.tipo <> 'entrada' then
    return null;
  end if;
  v_resto := least(coalesce(new.cantidad_recibida, 0), m.cantidad);
  for l in
    select x.id
      from retail.pedido_web_lineas x
      join retail.pedidos_web w on w.id = x.pedido_id
     where x.transferencia_id = new.transferencia_id and x.variante_id = new.variante_id and x.estado = 'por_conseguir'
       and w.estado in ('confirmado', 'pagado') and w.ubicacion_id = m.ubicacion_id
     order by w.numero, x.posicion
       for update of x
  loop
    exit when v_resto <= 0;
    begin
      perform retail.fn_pedido_web_reservar(l.id, m.ubicacion_id, m.sububicacion_id, m.usuario_id);
      v_resto := v_resto - 1;
    exception when others then
      raise warning 'pedido web: la prenda llegó en el traslado % pero no se pudo reservar sola (%)', new.transferencia_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

create or replace trigger pedido_web_llega_en_traslado
  after update of movimiento_id on retail.transferencia_recepciones
  for each row
  when (old.movimiento_id is null and new.movimiento_id is not null)
  execute function retail.fn_pedido_web_llego_en_traslado();

-- Si el envío se anula, la prenda volvió a la tienda que la mandó (`anular_traslado` la reingresa antes de marcarlo anulado): se
-- vuelve a reservar allá para su pedido (almacén primero). Si no se pudiera, el traslado se anula igual y la línea sigue «por
-- conseguir» con su traslado anulado (la pantalla lo dice).
create or replace function retail.fn_pedido_web_traslado_anulado()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  l record;
begin
  for l in
    select x.id
      from retail.pedido_web_lineas x
      join retail.pedidos_web w on w.id = x.pedido_id
     where x.transferencia_id = new.id and x.estado = 'por_conseguir' and w.estado in ('confirmado', 'pagado')
     order by w.numero, x.posicion
       for update of x
  loop
    begin
      perform retail.fn_pedido_web_reservar(l.id, new.ubicacion_origen_id, null, new.anulado_por);
    exception when others then
      raise warning 'pedido web: el envío % se anuló pero la prenda no se pudo volver a reservar en su tienda (%)', new.numero, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

create or replace trigger pedidos_web_vuelven_si_se_anula
  after update of estado on retail.transferencias
  for each row
  when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function retail.fn_pedido_web_traslado_anulado();

-- ----------------------------------------------------------------------------
-- 7. Las lecturas de la pantalla. Las dos llaman a las del motor (que exigen el módulo y la tienda) y les suman lo que la pantalla
--    dibuja: la prenda (foto, color, categoría), su traslado, lo cobrado hoy y lo que otra tienda espera de aquí.
-- ----------------------------------------------------------------------------

-- Una prenda como la dibuja el ERP: su nombre, talla y color, la foto de ese color (si no, la general; la principal primero, la
-- regla de `fotoDeVariante`) y su categoría (la miniatura sin foto, ADR-0333).
create or replace function retail.fn_pedido_web_prenda(p_variante_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'producto_id', pr.id, 'referencia', pr.referencia, 'sku', va.sku, 'talla', t.valor, 'color', co.nombre,
    'color_codigo', va.color_codigo, 'color_hex', co.hex,
    'categoria', ca.nombre, 'categoria_prefijo', ca.prefijo, 'categoria_familia', ca.familia,
    'foto', (select f.url
               from retail.producto_fotos f
              where f.producto_id = pr.id
                and (f.color_codigo = va.color_codigo
                     or (f.color_codigo is null
                         and not exists (select 1 from retail.producto_fotos f2
                                          where f2.producto_id = pr.id and f2.color_codigo = va.color_codigo)))
              order by f.es_principal desc, f.orden, f.id
              limit 1))
    from retail.variantes va
    join retail.productos pr on pr.id = va.producto_id
    left join retail.tallas t on t.id = va.talla_id
    left join retail.colores co on co.codigo = va.color_codigo
    left join retail.categorias ca on ca.id = pr.categoria_id
   where va.id = p_variante_id;
$$;

-- La lista de una tienda: sus pedidos (los abiertos y los cerrados de los últimos 30 días, `fn_pedidos_web_sede`) con sus prendas
-- en miniatura, lo cobrado hoy en sus pedidos web, los plazos de hoy y lo que OTRA tienda espera de esta («Para enviar»).
create or replace function retail.fn_pedidos_web_tablero(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_horas_confirmar integer;
  v_horas_pagar integer;
  v_dias_recoger integer;
begin
  perform retail.fn_pedido_web_exigir(p_ubicacion_id);
  select x.horas_para_confirmar, x.horas_aviso_sin_pagar, x.dias_aviso_sin_recoger
    into v_horas_confirmar, v_horas_pagar, v_dias_recoger
    from retail.fn_pedido_web_plazos() x;
  return jsonb_build_object(
    'plazos', jsonb_build_object('horas_para_confirmar', v_horas_confirmar, 'horas_aviso_sin_pagar', v_horas_pagar,
                                 'dias_aviso_sin_recoger', v_dias_recoger),
    'pedidos', coalesce((
      select jsonb_agg(to_jsonb(s) || jsonb_build_object(
               'prendas_vista', coalesce((
                 select jsonb_agg(retail.fn_pedido_web_prenda(l.variante_id) || jsonb_build_object('estado', l.estado) order by l.posicion)
                   from retail.pedido_web_lineas l
                  where l.pedido_id = s.pedido_id and l.estado <> 'quitada'), '[]'::jsonb))
             order by s.creado_en, s.numero)
        from retail.fn_pedidos_web_sede(p_ubicacion_id, v_horas_confirmar, v_horas_pagar, v_dias_recoger) s), '[]'::jsonb),
    'cobrado_hoy', (
      select coalesce(sum(g.monto), 0)
        from retail.pedido_web_pagos g
        join retail.pedidos_web w on w.id = g.pedido_id
       where w.ubicacion_id = p_ubicacion_id and g.estado = 'aprobado'
         and (g.registrado_en at time zone 'America/Lima')::date = retail.fn_hoy_lima()),
    -- Lo reservado AQUÍ para un pedido de otra tienda: esta tienda lo envía. Sin el cliente (esta tienda no lo atiende).
    'para_enviar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', w.id, 'codigo', w.codigo, 'estado', w.estado, 'tienda_id', w.ubicacion_id, 'tienda', u.nombre,
               'reservada_en', min_reserva.desde,
               'lineas', (select jsonb_agg(jsonb_build_object(
                                    'linea_id', l.id, 'posicion', l.posicion, 'variante_id', l.variante_id,
                                    'lugar', case s2.tipo when 'almacen_tienda' then 'almacen' when 'piso_venta' then 'piso' end)
                                  || retail.fn_pedido_web_prenda(l.variante_id)
                                order by l.posicion)
                            from retail.pedido_web_lineas l
                            left join retail.sububicaciones s2 on s2.id = l.sububicacion_id
                           where l.pedido_id = w.id and l.estado = 'reservada' and l.ubicacion_id = p_ubicacion_id))
             order by min_reserva.desde, w.numero)
        from retail.pedidos_web w
        join retail.ubicaciones u on u.id = w.ubicacion_id
        cross join lateral (select min(l.reservada_en) as desde from retail.pedido_web_lineas l
                             where l.pedido_id = w.id and l.estado = 'reservada' and l.ubicacion_id = p_ubicacion_id) min_reserva
       where w.ubicacion_id <> p_ubicacion_id and w.estado in ('confirmado', 'pagado') and min_reserva.desde is not null), '[]'::jsonb)
  );
end;
$$;

comment on function retail.fn_pedidos_web_tablero(uuid) is
  'Ventas ▸ Pedidos web (ADR-0408, act. 8): la lista de una tienda con sus prendas en miniatura, lo cobrado hoy, los plazos de Configuración y lo que otra tienda espera de aquí. Exige el módulo y la tienda.';

-- El detalle de un pedido (`fn_pedido_web`, que exige el módulo y la tienda) con cada prenda dibujable, el traslado que la trae, si
-- quien mira opera la tienda donde está reservada (para ofrecer «Enviar»), los datos de la tienda para el mensaje y los plazos.
create or replace function retail.fn_pedido_web_detalle(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v jsonb;
  v_horas_confirmar integer;
  v_horas_pagar integer;
  v_dias_recoger integer;
  v_tienda uuid;
begin
  select x.horas_para_confirmar, x.horas_aviso_sin_pagar, x.dias_aviso_sin_recoger
    into v_horas_confirmar, v_horas_pagar, v_dias_recoger
    from retail.fn_pedido_web_plazos() x;
  v := retail.fn_pedido_web(p_pedido_id, v_horas_confirmar, v_horas_pagar, v_dias_recoger);
  v_tienda := (v ->> 'ubicacion_id')::uuid;
  return v || jsonb_build_object(
    'plazos', jsonb_build_object('horas_para_confirmar', v_horas_confirmar, 'horas_aviso_sin_pagar', v_horas_pagar,
                                 'dias_aviso_sin_recoger', v_dias_recoger),
    'tienda_web', (select jsonb_build_object('nombre', coalesce(dw.nombre_web, u.nombre), 'direccion', dw.direccion, 'horario', dw.horario)
                     from retail.ubicaciones u left join retail.ubicacion_datos_web dw on dw.ubicacion_id = u.id
                    where u.id = v_tienda),
    -- El almacén y el piso de la tienda del pedido: para elegir de dónde sale cada prenda al confirmar.
    'lugares', coalesce((select jsonb_object_agg(s.tipo, s.id) from retail.sububicaciones s
                          where s.ubicacion_id = v_tienda and s.tipo in ('almacen_tienda', 'piso_venta')), '{}'::jsonb),
    'lineas', coalesce((
      select jsonb_agg(e.value
                       || retail.fn_pedido_web_prenda((e.value ->> 'variante_id')::uuid)
                       || jsonb_build_object(
                            'puedo_operar_alli', case when e.value ->> 'ubicacion_id' is not null
                                                      then coalesce(retail.fn_puede_operar_ubicacion((e.value ->> 'ubicacion_id')::uuid), false)
                                                      else false end,
                            'traslado', (select jsonb_build_object('transferencia_id', t.id, 'numero', t.numero, 'estado', t.estado,
                                                                   'desde', uo.nombre, 'desde_id', t.ubicacion_origen_id,
                                                                   'llega_el', t.fecha_estimada_llegada)
                                           from retail.pedido_web_lineas x
                                           join retail.transferencias t on t.id = x.transferencia_id
                                           join retail.ubicaciones uo on uo.id = t.ubicacion_origen_id
                                          where x.id = (e.value ->> 'linea_id')::uuid))
                       order by (e.value ->> 'posicion')::integer)
        from jsonb_array_elements(v -> 'lineas') e), '[]'::jsonb)
  );
end;
$$;

comment on function retail.fn_pedido_web_detalle(uuid) is
  'Ventas ▸ Pedidos web (ADR-0408, act. 8): el detalle de fn_pedido_web con cada prenda dibujable, su traslado y los plazos de Configuración. Exige el módulo y la tienda.';

-- El número del menú («Pedidos web 2»): los que esperan confirmación en esa tienda y todavía están a tiempo. Una sonda liviana que
-- nunca falla (la lee el lateral en cada pantalla): sin el módulo o sin la tienda, nada, y el menú no lleva número.
create or replace function retail.fn_pedidos_web_por_confirmar(p_ubicacion_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case when coalesce(retail.fn_ve_modulo('pedidos_web'), false) and coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id), false)
              then (select count(*)::integer
                      from retail.pedidos_web w
                     where w.ubicacion_id = p_ubicacion_id and w.estado = 'por_confirmar'
                       and now() < w.creado_en + make_interval(hours => (select x.horas_para_confirmar from retail.fn_pedido_web_plazos() x)))
         end;
$$;

comment on function retail.fn_pedidos_web_por_confirmar(uuid) is
  'Ventas ▸ Pedidos web (ADR-0408, act. 8): cuántos pedidos esperan confirmación en una tienda (el número del menú). Sin el módulo o la tienda, null; nunca falla.';

-- ----------------------------------------------------------------------------
-- 8. Quién ejecuta qué. Las internas, nadie de afuera; las de la pantalla, `authenticated` (con el permiso adentro).
-- ----------------------------------------------------------------------------
revoke all on function retail.fn_pedido_web_plazos() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_prenda(uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_llego_en_traslado() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_traslado_anulado() from public, anon, authenticated;
revoke all on function retail.enviar_pedido_web_desde(uuid, uuid, timestamptz, uuid) from public, anon;
revoke all on function retail.fn_pedidos_web_tablero(uuid) from public, anon;
revoke all on function retail.fn_pedido_web_detalle(uuid) from public, anon;
revoke all on function retail.fn_pedidos_web_por_confirmar(uuid) from public, anon;
grant execute on function retail.enviar_pedido_web_desde(uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function retail.fn_pedidos_web_tablero(uuid) to authenticated;
grant execute on function retail.fn_pedido_web_detalle(uuid) to authenticated;
grant execute on function retail.fn_pedidos_web_por_confirmar(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Comprobación: si algo no quedó, la migración no se da por aplicada.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from retail.modulos where clave = 'pedidos_web' and grupo = 'Ventas' and delegable and not solo_lider) then
    raise exception 'El módulo pedidos_web no quedó dado de alta como delegable en Ventas';
  end if;
  if position('fn_pedido_web_plazos()' in pg_get_functiondef('retail.confirmar_pedido_web(uuid, jsonb, integer)'::regprocedure)) = 0
     or position('fn_pedido_web_plazos()' in pg_get_functiondef('retail.no_confirmar_pedido_web(uuid, text, integer)'::regprocedure)) = 0
     or position('fn_pedido_web_plazos()' in pg_get_functiondef('retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer)'::regprocedure)) = 0
     or position('fn_pedido_web_plazos()' in pg_get_functiondef('retail.fn_pedido_web(uuid, integer, integer, integer)'::regprocedure)) = 0 then
    raise exception 'Alguna lectura o escritura del ERP no quedó leyendo los plazos de Configuración';
  end if;
  if pg_get_function_arguments('retail.confirmar_pedido_web(uuid, jsonb, integer)'::regprocedure) !~ 'DEFAULT NULL' then
    raise exception 'confirmar_pedido_web todavía trae un plazo escrito a mano';
  end if;
  if position('llego_lo_esperado' in pg_get_functiondef('retail.fn_pedidos_web_estado_hoy(integer, integer, integer, uuid, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_pedidos_web_estado_hoy no quedó con la regla del aviso de 48 h';
  end if;
  if position('retail.pedido_web_envio' in pg_get_functiondef('retail.fn_pedido_web_linea_reglas()'::regprocedure)) = 0
     or position('transferencia_items' in pg_get_functiondef('retail.fn_pedido_web_verificar(uuid)'::regprocedure)) = 0 then
    raise exception 'El disparador o la verificación de la línea no quedaron con el envío entre tiendas';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
