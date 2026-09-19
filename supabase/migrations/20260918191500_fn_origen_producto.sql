-- ============================================================================
-- 20260918191500_fn_origen_producto.sql — CAYLA V2 · a quién se atribuye una prenda (ADR-0113 y ADR-0118)
--
-- ESTADO: escrita y probada contra un Postgres desechable (scripts/pruebas/panel_calidad_aislado.sql y
--   panel_rentabilidad_aislado.sql). NO en producción — la pega Felipe. Ya va calificada con `retail.`. Solo LECTURA.
--   Va ANTES de las migraciones de Calidad (192000) y de Rentabilidad (194000), que la llaman.
--
-- PARA QUÉ. Dos pantallas necesitan responder "¿de quién es esta prenda?": Calidad (a quién se le atribuye una devolución)
-- y Rentabilidad (a quién se le atribuye un margen). Si cada una tuviera su propia copia de la regla, tarde o temprano una se
-- corregiría y la otra no, y dos pantallas darían números distintos de la misma prenda. Por eso la regla vive UNA vez, aquí.
--
-- LA REGLA (decisión de Felipe, 2026-09-18: "comprar lo mismo a dos proveedores en la misma fecha casi no ocurre"):
-- el origen de un producto en un día es el más reciente ANTERIOR O IGUAL a ese día, entre
--   · las compras vigentes de ese producto (`compras.estado = 'vigente'`, por `fecha_emision`), y
--   · las producciones del Taller terminadas e inventariadas (no muestra, no anulada).
-- Una compra POSTERIOR a la venta no puede explicar una prenda que ya se vendió, por eso se mira hacia atrás desde el día de la
-- venta. Empate de fecha: orden fijo (tipo, luego origen) para que el resultado sea siempre el mismo. Sin ningún origen: no
-- devuelve fila (quien la llama lo muestra como "Sin origen registrado", visible, nunca escondido).
--
-- SEGURIDAD. NO se concede a nadie: solo la ejecutan las funciones `security definer` que la llaman (dueñas de la base).
-- Explícito `revoke ... from authenticated`, porque `0005_grants.sql` concede EXECUTE por defecto a toda función nueva
-- (ADR-0119): sin el revoke, cualquier colaboradora podría preguntar de quién es cada prenda.
--
-- SE ROMPE SI: dos proveedores surten el mismo producto en fechas cercanas (se atribuye al último, sin avisar); o una prenda
-- entra sin compra ni producción (carga manual, censo). Depende de `compras.estado`, `compra_items.producto_id` y
-- `producciones.es_muestra` / `inventariado_at`.
-- SE DESHACE con: drop function retail.fn_origen_producto(uuid, date);  (antes hay que deshacer Calidad y Rentabilidad).
-- ============================================================================

create or replace function retail.fn_origen_producto(p_producto_id uuid, p_dia date)
returns table (tipo text, origen_id uuid)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select x.tipo, x.origen_id
  from (
    select 'proveedor'::text as tipo, c.proveedor_id as origen_id, c.fecha_emision as fecha
    from compra_items ci
    join compras c on c.id = ci.compra_id
    where ci.producto_id = p_producto_id
      and c.estado = 'vigente'
      and c.fecha_emision <= p_dia
    union all
    select 'taller'::text, null::uuid, (pr.inventariado_at at time zone 'America/Lima')::date
    from producciones pr
    where pr.producto_id = p_producto_id
      and pr.estado = 'terminada'
      and not pr.es_muestra
      and pr.inventariado_at is not null
      and (pr.inventariado_at at time zone 'America/Lima')::date <= p_dia
  ) x
  order by x.fecha desc, x.tipo, x.origen_id
  limit 1
$$;

revoke all on function retail.fn_origen_producto(uuid, date) from public, anon, authenticated;
