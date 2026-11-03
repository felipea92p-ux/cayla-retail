-- ============================================================================
-- 20261103172000_recibir_lee_su_sede.sql — CAYLA V2 · ADR-0387, actualización 2026-11-03
-- Quien solo tiene Recibir mira lo que llega a SU sede. Compras y el líder siguen viendo todas.
--
-- EL PROBLEMA PRIMERO. Abrir, contar y cerrar un envío ya exige su sede (`fn_recepcion_exigir`), pero mirarlo solo pedía el módulo. La
-- decisión 41 de ADR-0362 («quien tiene el módulo ve todas las tiendas») se escribió pensando en Compras, que reparte y paga para todas; una
-- tienda que solo recibe no necesita los costos, los proveedores ni los papeles de lo que va a otra. Felipe lo decidió el 2026-11-03.
--
-- QUÉ CAMBIA
--   1. `fn_recepcion_puede_leer_sede(ubicación)` (nueva, interna): el ÚNICO lugar donde se dice quién mira qué sede. Órdenes de compra y
--      quien ve el dinero de Compras, todas (decisiones 37 y 41: ya ven esa plata); los demás, la que operan (`fn_puede_operar_ubicacion`,
--      la misma pregunta de escribir).
--   2. `fn_envio_detalle`, `fn_envio_conteos` y `fn_envio_observaciones`: un envío de otra sede responde como uno que no existe (`null`), y la
--      pantalla ya sabe decirlo: «No encontramos ese envío. Los que llegan a tu sede están en Recibir mercadería».
--   3. `fn_envios_por_recibir`, `fn_envios_por_abrir` y `fn_ordenes_directas_por_recibir`: la lista de otra sede sale vacía.
--   4. `fn_puede_ver_foto_gasto_viaje`: la foto de un papel la ve la tienda a la que va alguno de sus envíos (`fn_recepcion_puede_ver_foto_papel`).
--
-- LO QUE NO CAMBIA
--   · El permiso del módulo va primero, con su mensaje de siempre: sin Recibir ni Órdenes de compra, 42501.
--   · `fn_recepcion_pendientes` (solo cuenta prendas, sin dinero, y también la lee Productos) y `fn_llegada_de_lotes` (solo una fecha).
--   · `deudas_del_proveedor` sigue entre sedes: la deuda es del proveedor, no de la tienda donde faltó («Nos debe», ADR-0362 fase 5).
--   · La web no cambia: todos sus enlaces a un envío salen de la lista de la propia sede o de Órdenes de compra.
--
-- DESCARTÉ
--   · Responder 42501 con otra sede: la pantalla lo pintaría como «No se pudo leer el envío, vuelve a intentarlo», y no hay nada que reintentar.
--   · Filtrar en la web: la función se llama con la sesión de quien mira, desde el navegador. La regla tiene que vivir en la base.
--   · Exigir que la foto ya esté en `compra_papeles`: la foto se sube ANTES de registrarla (`agregar_foto_papel`, y la compra rápida), y subirla
--     no debe depender de poder leerla. Una ruta que todavía no es de ningún papel sigue como estaba.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte: solo funciones, sin tablas, políticas ni disparadores (ADR-0195), con
-- `lock_timeout`. Idempotente: un reemplazo ya hecho se salta. Se detiene sin tocar nada si una función viva no es la esperada. Sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Orden con la web: da igual. El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar_lee_su_sede(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 aparición de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La regla, en un solo lugar ----------
create or replace function retail.fn_recepcion_puede_leer_sede(p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_ve_modulo('ordenes_compra'), false)
      or coalesce(retail.fn_puede_ver_dinero_de_compras(), false)
      or coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id), false);
$$;
comment on function retail.fn_recepcion_puede_leer_sede(uuid) is
  'ADR-0387 (actualización 2026-11-03): ¿esta cuenta mira lo que llega a esa sede? Órdenes de compra y quien ve el dinero de Compras, todas; '
  'los demás, la que operan. Con null responde por «todas». No reemplaza al permiso del módulo, que cada lectura pide antes. Interna.';
revoke all on function retail.fn_recepcion_puede_leer_sede(uuid) from public, anon, authenticated;

create or replace function retail.fn_recepcion_puede_ver_foto_papel(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_recepcion_puede_leer_sede(null)
      -- Se sube antes de registrarla: una ruta que todavía no es de ningún papel no se le niega a quien la está subiendo.
      or not exists (select 1 from retail.compra_papeles cp where cp.foto_ruta = p_ruta)
      or exists (
        select 1
          from retail.compra_papeles cp
          join retail.ordenes_compra xo on xo.papel_id = cp.id
          join retail.orden_compra_items xi on xi.orden_compra_id = xo.id
          join retail.despacho_items x on x.orden_compra_item_id = xi.id
          join retail.despachos d on d.id = x.despacho_id
         where cp.foto_ruta = p_ruta
           and retail.fn_recepcion_puede_leer_sede(d.ubicacion_destino_id));
$$;
comment on function retail.fn_recepcion_puede_ver_foto_papel(text) is
  'ADR-0387 (actualización 2026-11-03): la foto de un papel la ve la tienda a la que va alguno de sus envíos. Interna; la pregunta `fn_puede_ver_foto_gasto_viaje`.';
revoke all on function retail.fn_recepcion_puede_ver_foto_papel(text) from public, anon, authenticated;

-- ---------- 2. Un envío de otra sede responde como uno que no existe ----------
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_envio_detalle(uuid)',
  'where d.id = p_despacho_id;',
  'where d.id = p_despacho_id
     and retail.fn_recepcion_puede_leer_sede(d.ubicacion_destino_id);');
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_envio_conteos(uuid)',
  'where d.id = p_despacho_id;',
  'where d.id = p_despacho_id and retail.fn_recepcion_puede_leer_sede(d.ubicacion_destino_id);');
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_envio_observaciones(uuid)',
  'where d.id = p_despacho_id) then',
  'where d.id = p_despacho_id and retail.fn_recepcion_puede_leer_sede(d.ubicacion_destino_id)) then');

-- ---------- 3. La lista de otra sede sale vacía ----------
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_envios_por_recibir(uuid)',
  $v$hint = 'envios_sin_modulo';
  end if;$v$,
  $n$hint = 'envios_sin_modulo';
  end if;
  if not retail.fn_recepcion_puede_leer_sede(p_ubicacion_id) then
    return '[]'::jsonb;
  end if;$n$);
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_ordenes_directas_por_recibir(uuid)',
  $v$hint = 'envios_sin_modulo';
  end if;$v$,
  $n$hint = 'envios_sin_modulo';
  end if;
  if not retail.fn_recepcion_puede_leer_sede(p_ubicacion_id) then
    return '[]'::jsonb;
  end if;$n$);
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_envios_por_abrir(uuid)',
  $v$hint = 'envios_sin_modulo';
  end if;$v$,
  $n$hint = 'envios_sin_modulo';
  end if;
  if not retail.fn_recepcion_puede_leer_sede(p_ubicacion_id) then
    return;
  end if;$n$);

-- ---------- 4. La foto del papel ----------
select pg_temp.reemplazar_lee_su_sede(
  'retail.fn_puede_ver_foto_gasto_viaje(text)',
  $v$if v_carpeta = 'papeles' and retail.fn_ve_modulo('recibir') then$v$,
  $n$if v_carpeta = 'papeles' and retail.fn_ve_modulo('recibir') and retail.fn_recepcion_puede_ver_foto_papel(p_ruta) then$n$);

-- ---------- Que quedó todo ----------
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'retail.fn_envio_detalle(uuid)', 'retail.fn_envio_conteos(uuid)', 'retail.fn_envio_observaciones(uuid)',
    'retail.fn_envios_por_recibir(uuid)', 'retail.fn_ordenes_directas_por_recibir(uuid)', 'retail.fn_envios_por_abrir(uuid)'
  ] loop
    if position('fn_recepcion_puede_leer_sede' in pg_get_functiondef(v_firma::regprocedure)) = 0 then
      raise exception '% no quedó con la regla de la sede', v_firma;
    end if;
  end loop;
  if position('fn_recepcion_puede_ver_foto_papel' in pg_get_functiondef('retail.fn_puede_ver_foto_gasto_viaje(text)'::regprocedure)) = 0 then
    raise exception 'fn_puede_ver_foto_gasto_viaje no quedó con la regla de la sede';
  end if;
end;
$$;

reset lock_timeout;
