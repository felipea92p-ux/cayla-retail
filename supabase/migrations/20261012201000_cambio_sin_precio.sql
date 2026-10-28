-- ============================================================================
-- 20261012201000_cambio_sin_precio.sql — CAYLA V2 (ADR-0385, Felipe 2026-10-12)
--
-- EL PROBLEMA PRIMERO. `registrar_cambio` calcula la diferencia con el precio de la prenda NUEVA (`fn_precio_para_cambio`) y no
-- miraba si era 0. Cambiar una blusa de S/ 79.90 por una prenda en S/ 0 daba una diferencia de −79.90 que se le devolvía al
-- cliente: se llevaba la prenda nueva gratis Y su dinero de vuelta, sin pasar por Devoluciones (ni su plazo, ni su aprobación,
-- ni su nota de crédito). Una prenda en S/ 0 existe a propósito: el conteo la propone así («déjalo en 0 y lo completa el
-- Líder») y queda pendiente hasta que alguien le pone precio; el ADR-0384 ya impidió venderla, aprobarla, crearla o dejarla así.
--
-- LA DECISIÓN. Un cambio por una prenda cuyo precio de cambio es 0 (o menos) se rechaza con `cambio_sin_precio`, sin
-- excepción de Empaque: cambiar una prenda por la bolsa de obsequio sería una devolución completa por la puerta de atrás. A
-- diferencia de la venta (donde la bolsa de obsequio va junto a una compra), un cambio es una prenda por otra.
--
-- Se mira el precio de CAMBIO (`v_precio_nuevo`, el que da `fn_precio_para_cambio`): la misma prenda vale lo de la tienda donde
-- se compró; otra prenda, el precio de esta tienda. Una prenda con precio base 0 y precio propio en la tienda se cambia al de la
-- tienda.
--
-- CONTRATO (Liskov)
--   PROMETE: ningún cambio entrega una prenda de precio 0 ni devuelve por ella lo pagado por la otra; el rechazo no escribe nada
--            (va antes del primer insert) y nombra la prenda en `detail` («referencia (código)»).
--   ASUME:   `fn_precio_para_cambio` (20261011100200). El ancla —el «no existe» de la variante nueva— está en `main` y en
--            producción, y no la toca el cambio de la diferencia del ADR-0380 (PR #968): esta migración calza antes o después.
--   NO HACE: no cambia cómo se calcula la diferencia, ni toca Apartados (`separacion_items` ya tiene `precio_unitario > 0`: la
--            web traduce ese candado), ni tablas, políticas o disparadores.
--
-- CÓMO SE PEGA. Una sola parte: solo una función (ADR-0195). Reemplazo ANCLADO sobre la definición viva (ADR-0288): si el trozo no
-- está exactamente una vez, se detiene sin tocar nada; pegarla dos veces no duplica nada. Dentro de los textos entre comillas no
-- hay ningún `select … into`.
-- ============================================================================
set lock_timeout = '3s';

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
  'retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text)',
  $v$  if v_precio_nuevo is null then
    raise exception 'La variante % no existe', p_variante_nueva_id;
  end if;$v$,
  $v$  if v_precio_nuevo is null then
    raise exception 'La variante % no existe', p_variante_nueva_id;
  end if;
  -- ADR-0385: no se cambia por una prenda sin precio (ni la bolsa de obsequio): la diferencia devolvería al cliente lo que pagó
  -- y se llevaría la prenda gratis. Va antes de escribir nada.
  if v_precio_nuevo <= 0 then
    raise exception 'cambio_sin_precio'
      using detail = (select pn.referencia || ' (' || coalesce(vn.codigo, vn.sku, 'sin código') || ')'
                        from retail.variantes vn join retail.productos pn on pn.id = vn.producto_id
                       where vn.id = p_variante_nueva_id),
            hint = 'La prenda que se lleva no tiene precio en el catálogo: elige otra o ponle precio en su ficha.';
  end if;$v$,
  1);

do $$
begin
  if position('cambio_sin_precio' in pg_get_functiondef('retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text)'::regprocedure)) = 0 then
    raise exception 'ADR-0385: registrar_cambio no quedó con su candado del precio 0';
  end if;
end;
$$;
