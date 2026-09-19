-- ============================================================================
-- 20260918210200 — `catalogo_crear_producto` deja de ser un camino de alta
--
-- Era el cuarto camino que creaba productos (junto con crear_producto_con_
-- variantes, censo_crear_variante y la vieja pantalla de alta). Felipe
-- (2026-09-18): "retirarlo del uso y dejarlo sin ejecución". Verificado antes
-- de escribir esto: ninguna pantalla lo llama —la rama de alta de
-- ProductoForm.tsx era código muerto, esa pantalla solo se usa para EDITAR— y
-- no acepta marca ni proveedor, que ahora son obligatorios: ejecutarlo
-- fallaría siempre en la base (NOT NULL), así que dejarlo abierto solo
-- guardaba un camino roto.
--
-- SE QUITA EL PERMISO, NO LA FUNCIÓN: queda por si hay que auditar cómo nació
-- un producto viejo (nunca se borra nada con historial). Volver atrás es un
-- `grant execute`.
-- ============================================================================

revoke execute on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) from public, anon, authenticated;

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) is
  'RETIRADA (20260918210200): ya no se ejecuta. Un producto nuevo entra solo por crear_producto_con_variantes o censo_crear_variante, ambas con marca y proveedor obligatorios.';
