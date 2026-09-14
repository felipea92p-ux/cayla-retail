-- ============================================================================
-- 20260914220000_stock_por_sede.sql — CAYLA V2
--
-- «No hay tu talla aquí, pero sí en Trujillo» es la venta que se pierde en el
-- mostrador. Vender ya muestra dónde más hay stock (vender/page.tsx +
-- lib/stock-por-sede.ts), pero lo lee de `stock` directo, y `stock_select`
-- deja ver SOLO las sedes que la persona puede operar
-- (fn_puede_operar_ubicacion): una Líder ve todas; una colaboradora con sede
-- fija (0016) ve solo la suya — justo la encargada de sede que necesita el
-- dato lo recibe vacío. Medido el 2026-09-14 con el JWT de Micaela como
-- colaboradora de Trujillo: Taller 0 filas, Lima 0, Trujillo 16.
--
-- Esta función expone CANTIDADES por sede a cualquier persona con acceso a
-- retail, sin ampliar `stock_select` — esa policy también guarda quién puede
-- OPERAR una sede (vender, mover, contar) y no debe abrirse por esto.
-- Solo lectura, sin argumentos: el catálogo entero son unos cientos de filas.
--
-- ESTADO: NO APLICADA (ni local ni producción) al escribirse. Aplicar esquema
-- en la base local compartida no era de la sesión que la escribió; la aplica
-- Felipe. Hasta entonces `vender/page.tsx` sigue leyendo `stock` directo (para
-- Líderes ya funciona) — cambiarlo a `supabase.rpc("fn_stock_por_sede")` es
-- un commit chico DESPUÉS de aplicarla, nunca antes (datos:comparar avisaría).
--
-- SE ROMPE SI: se quita el `exists` sobre `colaboradores` — cualquier sesión
-- de Dynamic sin acceso a retail podría leer el stock de todas las tiendas.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_stock_por_sede()
returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select s.variante_id, s.ubicacion_id, s.cantidad
  from stock s
  join ubicaciones u on u.id = s.ubicacion_id and u.activo
  where exists (
    select 1
    from colaboradores c
    join public.personas p on p.id = c.persona_id
    where p.auth_user_id = auth.uid() and p.estado = 'activo'
  );
$$;

revoke all on function retail.fn_stock_por_sede() from public;
grant execute on function retail.fn_stock_por_sede() to authenticated;

comment on function retail.fn_stock_por_sede() is
  'Cantidades de stock por sede (solo ubicaciones activas) para cualquier persona con acceso a retail. Solo lectura; no amplía stock_select.';
