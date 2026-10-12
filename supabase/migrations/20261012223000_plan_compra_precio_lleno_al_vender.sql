-- Plan de campaña ▸ Resultados: «a precio lleno» se mide con el precio AL QUE SE VENDIÓ, no con el de hoy (ADR-0372, act. 2026-10-12 (e)).
--
-- EL PROBLEMA. `fn_unidades_vendidas` comparaba lo cobrado con el precio de lista de HOY (`variantes.precio`). Tres cosas salían mal:
--   · una tienda con su propio precio (TRU a S/ 69.90 contra un precio base de S/ 79.90) contaba como «rebajada» sin ningún descuento;
--   · si un precio sube después, las ventas pasadas a precio lleno se ven «rebajadas»; si baja, se esconden descuentos reales;
--   · «Lo que sobró» (lo cobrado ÷ lo que valía) usaba el mismo número, así que también se deformaba.
-- La venta ya guarda su precio de lista del momento (`venta_items.precio_unitario`, que `registrar_venta` fija igual al precio de la sede, y el
-- descuento aparte en `descuento_unitario`). Se usa ese; el de hoy queda solo de respaldo si la línea no lo trae.
--
-- CÓMO SE PEGA: un reemplazo ANCLADO sobre el texto vivo (si no calza, falla sin tocar nada). Sin tablas, políticas ni `drop trigger`.

set search_path = retail, public, extensions;
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
  'retail.fn_unidades_vendidas(timestamptz, timestamptz)',
  $v$vi.cantidad * coalesce(nullif(va.precio, 0), vi.precio_unitario)$v$,
  $v$vi.cantidad * coalesce(nullif(vi.precio_unitario, 0), va.precio)$v$,
  1);
