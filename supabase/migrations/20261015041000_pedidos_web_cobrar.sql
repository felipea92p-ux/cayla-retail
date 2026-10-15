-- ============================================================================
-- 20261015041000_pedidos_web_cobrar.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 9: cobrar dentro del pedido
--
-- EL PROBLEMA PRIMERO. El motor ya cobra (`registrar_pago_pedido_web` y `anular_pago_pedido_web`, 20261015000000): digital con
-- su n.º de operación que no se repite, efectivo a la caja abierta, nunca más de lo que falta. Pero la hoja del pedido no tenía
-- con qué decir tres cosas que una tienda necesita ver ANTES de tocar el dinero:
--   · si la tienda tiene la caja abierta: sin caja, el efectivo no se cobra ni se devuelve, y la hoja lo ofrecía igual hasta que
--     la base lo rechazaba;
--   · quién anuló un pago: se veía quién lo registró, no quién lo anuló (y es dinero);
--   · y un pedido anulado con plata por devolver salía de la lista a los 30 días (`fn_pedidos_web_sede` muestra lo cerrado de
--     los últimos 30): el dinero del cliente se olvidaba sin que nadie lo viera.
--
-- LO QUE HACE (reemplazos anclados sobre funciones del motor, que no están en producción):
--   1. `fn_pedido_web_detalle` (20261015010000): `caja_abierta`, si la tienda del pedido tiene una caja abierta AHORA. Es solo
--      para mostrar: la que manda es la base al cobrar o al devolver (`pedido_web_sin_caja`).
--   2. `fn_pedido_web` (20261014235000): cada pago dice quién lo anuló (`anulado_por`, su nombre), como ya decía quién lo registró.
--   3. `fn_pedidos_web_sede` (20261014235000 + 20261015010000): un pedido anulado con plata por devolver (`pagado > 0`) sigue en
--      la lista hasta que se devuelve todo, aunque tenga más de 30 días.
--
-- DECIDÍ leer la caja dentro de la lectura del pedido (security definer, con el candado del módulo y la tienda) y no desde la
-- página con la tabla `cajas`: así lo ve igual quien opera la tienda aunque su sede de la ficha sea otra (la RLS de `cajas` mira
-- la sede de la persona, no la que eligió en la cabecera).
-- DESCARTÉ una columna «por devolver» en `pedidos_web`: es `pagado` de un pedido anulado, y una segunda fuente se desalinearía.
--
-- QUÉ NO HACE. No cambia cómo se cobra ni cómo se anula un pago (eso es el motor). El token que sigue al contenido de
-- `registrar_pago_pedido_web` (como Ventas y Caja) va aparte, en `20261015042000_pedidos_web_cobrar_token.sql`, porque necesita
-- `fn_intento_con_huella` y `fn_resolver_intento` (20261013200000), que una base local atrasada puede no tener.
--
-- SE ROMPE SI alguien vuelve a pegar `20261014235000_pedidos_web_modelo.sql` o `20261015010000_pedidos_web_erp.sql` después de
-- esta: sus `create or replace` borran estas anclas (la hoja no sabría de la caja y la lista olvidaría lo por devolver). Se
-- arregla volviendo a pegar esta. `pnpm pruebas:pedidos-web-cobrar` lo marca.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de `20261015010000_pedidos_web_erp.sql`. Una sola
-- parte: solo funciones (sin tablas, sin políticas, sin disparadores). Re-ejecutable: un ancla ya aplicada no hace nada; si un
-- ancla no aparece exactamente una vez, aborta sin tocar nada. Ningún `select … into` dentro de un texto entre comillas.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplazo anclado (el de 20261015010000): si el texto nuevo ya está, no hace nada; si el viejo no aparece EXACTAMENTE una vez,
-- aborta.
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
-- 1. ¿La tienda del pedido tiene la caja abierta? (para ofrecer o no «Efectivo» al cobrar y al devolver)
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedido_web_detalle(uuid)',
  $v$    'tienda_web', (select jsonb_build_object('nombre', coalesce(dw.nombre_web, u.nombre), 'direccion', dw.direccion, 'horario', dw.horario)$v$,
  $n$    -- ADR-0408 act. 9: ¿la tienda del pedido tiene su caja abierta ahora? Sin caja, el efectivo no se cobra ni se devuelve
    -- (lo decide la base al guardar: esto es para no ofrecerlo).
    'caja_abierta', exists (select 1 from retail.cajas cj where cj.ubicacion_id = v_tienda and cj.estado = 'abierta'),
    'tienda_web', (select jsonb_build_object('nombre', coalesce(dw.nombre_web, u.nombre), 'direccion', dw.direccion, 'horario', dw.horario)$n$);

-- ----------------------------------------------------------------------------
-- 2. Quién anuló cada pago (como ya se ve quién lo registró)
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedido_web(uuid, integer, integer, integer)',
  $v$               'anulado_en', g.anulado_en, 'anulado_motivo', g.anulado_motivo)$v$,
  $n$               'anulado_en', g.anulado_en, 'anulado_motivo', g.anulado_motivo,
               -- ADR-0408 act. 9: quién lo anuló (dinero: se ve quién lo registró y quién lo anuló).
               'anulado_por', pa.nombres)$n$);
select pg_temp.anclar('retail.fn_pedido_web(uuid, integer, integer, integer)',
  $v$        left join public.personas pe on pe.id = g.registrado_por$v$,
  $n$        left join public.personas pe on pe.id = g.registrado_por
        left join public.personas pa on pa.id = g.anulado_por$n$);

-- ----------------------------------------------------------------------------
-- 3. Un pedido anulado con plata por devolver no sale de la lista hasta que se devuelve
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer)',
  $v$     and (w.estado in ('por_confirmar', 'confirmado', 'pagado')$v$,
  $n$     and (w.estado in ('por_confirmar', 'confirmado', 'pagado')
          -- ADR-0408 act. 9: lo anulado con plata del cliente todavía en la tienda se ve hasta que se le devuelve.
          or (w.estado = 'anulado' and w.pagado > 0)$n$);

-- ----------------------------------------------------------------------------
-- 4. Comprobación: si algo no quedó, la migración no se da por aplicada.
-- ----------------------------------------------------------------------------
do $$
begin
  if position('''caja_abierta''' in pg_get_functiondef('retail.fn_pedido_web_detalle(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_detalle no quedó diciendo si la tienda tiene la caja abierta';
  end if;
  if position('''anulado_por''' in pg_get_functiondef('retail.fn_pedido_web(uuid, integer, integer, integer)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web no quedó diciendo quién anuló cada pago';
  end if;
  if position('w.estado = ''anulado'' and w.pagado > 0'
              in pg_get_functiondef('retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer)'::regprocedure)) = 0 then
    raise exception 'fn_pedidos_web_sede no quedó mostrando lo anulado con plata por devolver';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
