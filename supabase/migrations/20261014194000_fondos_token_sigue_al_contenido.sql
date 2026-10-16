-- ============================================================================
-- 20261014194000_fondos_token_sigue_al_contenido.sql — ADR-0362 fase 6 (/chaos 2026-10-14, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Cada hoja del fondo manda un `p_token` para que un doble clic o un reintento tras una red caída no guarde dos
-- veces: la función busca el token y, si ya existe, devuelve lo que guardó el primero. Pero solo miraba el TOKEN, no lo que venía con
-- él. /chaos (2026-10-14, semilla 1014) lo vio en el navegador: la respuesta de «Entregar plata» se pierde (la base guardó S/ 40), la
-- hoja dice «vuelve a tocar el botón», la persona corrige a S/ 90 y vuelve a tocar; el mismo token devolvió la entrega de S/ 40 y la
-- hoja anunció «Le entregaste S/ 90.00». Igual al rendir (guardó «tengo S/ 380» y ella había corregido a S/ 350) y, en la base, al
-- devolver, al pagar una deuda y en el gasto del viaje. Es el defecto que Ventas y Caja cerraron el 2026-10-13 (20261013200000 y
-- 20261013201000); las cinco funciones del fondo nacieron después y no lo usaban.
--
-- LA DECISIÓN (Felipe 2026-10-14). La misma pieza que Ventas y Caja: el token sigue al contenido.
--   1. `entregar_fondo`, `devolver_fondo`, `pagar_deuda_fondo`, `registrar_gasto_viaje` y `rendir_fondo` llaman a
--      `fn_intento_con_huella` ANTES de buscar su token: el mismo token con otro contenido se rechaza (`token_reusado`), con la
--      misma huella sigue como siempre (devuelve lo que ya guardó). La huella lleva los montos como texto: `jsonb` no admite NaN, y un
--      NaN tiene que llegar a su mensaje («El monto tiene que ser mayor que cero»), no romper aquí.
--   2. `fn_resolver_intento` sabe revisar esas cinco operaciones: la pantalla le pregunta qué pasó con el envío que quedó en duda
--      (`hecho`, con lo que guardó, o `no_llego`). La plata de un fondo no es de una tienda: la revisa quien tiene el módulo de esa
--      pantalla (Fondos por rendir; Órdenes de compra para el gasto del viaje) o la persona del fondo.
--
-- CONTRATO (Liskov)
--   PROMETE: con el mismo token y la misma huella, cada función devuelve lo mismo que antes; con otra huella, `token_reusado`; con un
--            token que la pantalla dio por no llegado, `intento_descartado`. `fn_resolver_intento` responde por las cinco operaciones
--            nuevas sin cambiar lo que respondía por las demás.
--   ASUME:   `intentos_con_token`, `fn_intento_con_huella` y `fn_resolver_intento` (20261013200000) y la parte 2 de montos válidos.
--   NO HACE: no toca tablas ni políticas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, solo funciones, después de 20261014193000. Reemplazos ANCLADOS:
-- las cinco funciones del fondo tienen la misma huella en el banco `cayla-oc` y en producción (2026-10-14); `fn_resolver_intento` NO
-- (producción ya conoce las operaciones de Inventario, 20261014162000, pegada como 20261014171040), así que sus anclas son líneas que
-- están en las dos versiones,
-- cada una una sola vez. Si algo cambió, aborta sin cambiar nada. Idempotente. Sin `select … into` dentro de textos entre comillas.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. Las cinco funciones anotan la huella de su token ----------
select pg_temp.reemplazar('retail.entregar_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  if p_token is not null then$v$,
$n$  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otra entrega se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('entregar_fondo', p_token, md5(jsonb_build_array(
    p_persona_id, p_cuenta_origen_id, p_monto::text, p_motivo, p_fecha)::text));
  if p_token is not null then$n$,
1);
select pg_temp.reemplazar('retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  if p_token is not null then$v$,
$n$  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otra devolución se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('devolver_fondo', p_token, md5(jsonb_build_array(
    p_persona_id, p_cuenta_destino_id, p_monto::text, p_nota, p_fecha)::text));
  if p_token is not null then$n$,
1);
select pg_temp.reemplazar('retail.pagar_deuda_fondo(uuid, numeric, uuid, text, date, uuid)',
$v$  if p_token is not null then$v$,
$n$  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otro pago se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('pagar_deuda_fondo', p_token, md5(jsonb_build_array(
    p_persona_id, p_monto::text, p_cuenta_destino_id, p_nota, p_fecha)::text));
  if p_token is not null then$n$,
1);
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$  if p_token is not null then$v$,
$n$  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otro gasto se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_gasto_viaje', p_token, md5(jsonb_build_array(
    p_tipo, p_concepto, p_monto::text, p_fecha, p_papel, p_medio_pago, p_cuenta_id, p_ordenes, p_serie_numero, p_ruc, p_nota)::text));
  if p_token is not null then$n$,
1);
select pg_temp.reemplazar('retail.rendir_fondo(numeric, text, uuid)',
$v$  if p_token is not null then$v$,
$n$  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otro efectivo o explicación se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('rendir_fondo', p_token, md5(jsonb_build_array(p_efectivo::text, p_explicacion)::text));
  if p_token is not null then$n$,
1);

-- ---------- 2. fn_resolver_intento revisa las cinco ----------
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$'registrar_cambio', 'separar_pedido_para_apartar'$v$,
$n$'registrar_cambio', 'separar_pedido_para_apartar',
                         'entregar_fondo', 'devolver_fondo', 'pagar_deuda_fondo', 'registrar_gasto_viaje', 'rendir_fondo'$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$  v_vuelta integer;$v$,
$n$  v_vuelta integer;
  -- La persona del fondo (o quien registró el gasto del viaje): ella puede revisar su envío.
  v_duena uuid;
  v_yo uuid;$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$    v_datos := null;$v$,
$n$    v_datos := null;
    v_duena := null;$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$    else -- registrar_cambio$v$,
$n$    elsif p_operacion in ('entregar_fondo', 'devolver_fondo', 'pagar_deuda_fondo') then
      -- ADR-0362 fase 6 (/chaos 2026-10-14): la plata de un fondo. Su persona es la del fondo (o la de la rendición, en un pago de deuda).
      for v_id, v_duena, v_datos in
        select d.id,
               coalesce((select f.persona_id from retail.cuentas_dinero f
                          where f.id in (d.cuenta_origen_id, d.cuenta_destino_id) and f.tipo = 'fondo' limit 1),
                        (select r.persona_id from retail.rendiciones_fondo r where r.id = d.rendicion_id)),
               jsonb_build_object('id', d.id, 'tipo', d.tipo, 'monto', d.monto, 'creado_en', d.created_at, 'anulado', d.estado = 'anulado')
          from retail.movimientos_dinero d where d.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'registrar_gasto_viaje' then
      for v_id, v_duena, v_datos in
        select g.id, g.registrado_por,
               jsonb_build_object('id', g.id, 'monto', g.monto_total, 'descripcion', g.descripcion, 'creado_en', g.created_at)
          from retail.gastos g where g.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'rendir_fondo' then
      for v_id, v_duena, v_datos in
        select r.id, r.persona_id,
               jsonb_build_object('id', r.id, 'estado_rendicion', r.estado, 'efectivo', r.efectivo, 'faltante', r.faltante, 'creado_en', r.rendida_en)
          from retail.rendiciones_fondo r where r.token_cliente = p_token
      loop
        exit;
      end loop;
    else -- registrar_cambio$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$    if v_id is not null then$v$,
$n$    -- La plata de un fondo no es de una tienda: la revisa quien tiene el módulo de su pantalla, o la persona del fondo.
    if v_id is not null and p_operacion in ('entregar_fondo', 'devolver_fondo', 'pagar_deuda_fondo', 'registrar_gasto_viaje', 'rendir_fondo') then
      v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());
      if not ((v_yo is not null and v_duena = v_yo)
              or (p_operacion = 'registrar_gasto_viaje' and retail.fn_ve_modulo('ordenes_compra'))
              or (p_operacion <> 'registrar_gasto_viaje' and retail.fn_ve_modulo('fondos'))) then
        raise exception 'Ese envío no es tuyo.' using errcode = '42501', hint = 'intento_ajeno';
      end if;
      return jsonb_build_object('estado', 'hecho') || v_datos;
    end if;
    if v_id is not null then$n$,
1);

reset lock_timeout;
notify pgrst, 'reload schema';
