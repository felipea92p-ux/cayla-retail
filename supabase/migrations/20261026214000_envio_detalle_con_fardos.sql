-- ============================================================================
-- 20261026214000_envio_detalle_con_fardos.sql — CAYLA V2 · ADR-0480 (Compras simple), actualización 2026-10-26
-- La tienda ve cuántos fardos vienen en un envío.
--
-- EL PROBLEMA PRIMERO. Al tocar «Mandar a …» la compradora dice cuántos paquetes (fardos) entrega al transporte, y la base lo guarda en
-- `despachos.bultos` (20261023114000: «para que la tienda sepa cuántos paquetes abrir»). Pero del otro lado nadie lo leía: la hoja
-- «Detalle» de Recibir y la pantalla de recibir el envío mostraban las prendas por categoría y ni una palabra de cuántos fardos eran.
-- Una tienda que espera dos fardos y ve llegar uno no tenía cómo darse cuenta hasta contar; y como los fardos se abren por partes (hoy
-- uno, mañana otro), el número es lo único que dice si todavía falta alguno.
--
-- QUÉ CAMBIA (un solo reemplazo ANCLADO sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   · `fn_envio_detalle` suma `bultos` (entero, o null en un envío de antes o armado en el escritorio, donde nadie dijo cuántos eran).
--     No toca permisos ni otras claves: la web que no lo lee sigue igual, y la que lo lee sin esta migración simplemente no lo muestra.
--
-- DESCARTÉ
--   · Leer `despachos.bultos` directo desde el navegador: la tienda lee el envío por `fn_envio_detalle` (módulo Recibir, sede del envío);
--     una segunda puerta a la misma tabla duplicaría esa regla.
--   · Contar los fardos como una tabla (un registro por fardo, abierto sí/no): hoy el conteo es por categoría, no por fardo, y llevar el
--     estado de cada uno sería una pantalla nueva. El número informa; no se controla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Después de 20261023114000 (la columna) y de 20261023121000 (el detalle con papeles):
-- un reemplazo anclado de una función, con `lock_timeout`, sin tablas, políticas ni `drop trigger`. Idempotente (un reemplazo ya hecho se
-- salta). Si falta la columna, se DETIENE antes de tocar nada: la función es plpgsql y un `d.bultos` sin columna haría fallar cada lectura
-- de un envío —Recibir entero— en vez de dar un error al pegar. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $c$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'despachos' and column_name = 'bultos') then
    raise exception 'Falta retail.despachos.bultos: pega primero 20261023114000_compras_simple_gasto_envio_y_cierre.sql';
  end if;
end;
$c$;

create or replace function pg_temp.reemplazar_fardos_del_envio(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

select pg_temp.reemplazar_fardos_del_envio('retail.fn_envio_detalle(uuid)',
$v$           'unidades', (select coalesce(sum(x.cantidad), 0)::integer from retail.despacho_items x where x.despacho_id = d.id),
$v$,
$n$           'unidades', (select coalesce(sum(x.cantidad), 0)::integer from retail.despacho_items x where x.despacho_id = d.id),
           -- ADR-0480 (2026-10-26): cuántos fardos entregó la compradora al transporte; null si nadie lo dijo (envío de antes o del escritorio).
           'bultos', d.bultos,
$n$,
1);
