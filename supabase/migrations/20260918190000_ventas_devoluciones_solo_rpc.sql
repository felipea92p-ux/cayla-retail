-- ============================================================================
-- 20260918190000_ventas_devoluciones_solo_rpc.sql — CAYLA V2
--
-- ESTADO: escrita y probada en local con ROLLBACK (scripts/pruebas/
--   candado_ventas_devoluciones.mjs). NO en producción — la pega Felipe en el SQL Editor,
--   solo después de correr `docs/datos/VERIFICAR-ESCRITURA-DIRECTA-2026-09-18.sql` allá.
--   Este archivo ya va calificado con `retail.`: se pega tal cual.
--
-- CONTEXTO. La auditoría del 2026-09-17 marcó que `ventas`, `venta_items`, `devoluciones` y
-- `devolucion_items` aceptan escritura directa desde el navegador (`supabase.from('ventas')
-- .insert(...)`), saltándose `registrar_venta` y `aprobar_devolucion`. Es el mismo hueco que
-- ADR-0055 cerró para `movimientos` el 2026-09-15 y que nunca se extendió aquí.
--
-- POR QUÉ ES POSIBLE. `0005_grants.sql` le dio INSERT/UPDATE/DELETE a `authenticated` sobre
-- TODAS las tablas de `retail` (y sobre las que se creen después, por `alter default
-- privileges`). Para escribir hacen falta DOS puertas abiertas: el permiso de tabla y una
-- política de RLS que lo deje pasar. Aquí las dos estaban abiertas:
--   · ventas / venta_items → `ventas_insert` / `venta_items_insert`: exigen solo
--     `fn_puede_operar_ubicacion` (poder operar en esa sede), no validan precio, stock, caja
--     abierta ni rol.
--   · devoluciones / devolucion_items → política `for all` con la misma condición: permite
--     UPDATE, es decir, ponerle `estado = 'aprobada'` y `reembolso_metodo = 'efectivo'` a mano
--     sin ser líder y sin generar el movimiento de reposición de stock. Eso descuadra en
--     silencio el arqueo de `cerrar_caja`.
--   · venta_anulacion_items → política `for all`: mismo patrón, escribe la condición de cada
--     prenda anulada sin pasar por `anular_venta`.
--
-- CAMBIA. Revoca INSERT, UPDATE y DELETE a `authenticated` y `anon` sobre esas 5 tablas. Deja
-- SELECT. Sin el permiso, Postgres rechaza ("permission denied for table ...") ANTES de mirar
-- ninguna política: la escritura directa deja de depender de que una política esté bien
-- escrita. Las políticas quedan como documentación de lo que aplicaría SI alguna vez se
-- vuelve a dar el permiso — no como protección activa (mismo criterio que ADR-0055).
--
-- POR QUÉ NO ROMPE NADA — verificado, no razonado:
--
-- 1) Quién escribe en esas tablas. Consulta corrida en LOCAL (2026-09-18) y en PRODUCCIÓN
--    (Felipe, mismo día, mismo resultado):
--      select p.proname||'('||p.pronargs||')', p.prosecdef, pg_get_userbyid(p.proowner)
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'retail'
--        and p.prosrc ~* '(insert into|update|delete from)\s+(retail\.)?(ventas|venta_items|
--            devoluciones|devolucion_items|venta_anulacion_items)\y';
--    → 6 funciones: anular_venta, aprobar_devolucion, crear_devolucion,
--      liquidar_prenda_danada, rechazar_devolucion, registrar_venta. TODAS security definer,
--      TODAS dueñas `postgres` (que también es dueña de las tablas). Un `revoke` a
--      `authenticated` no las toca: corren con los permisos de su dueña, no del que llama.
--
-- 2) Triggers sobre estas tablas: ninguno (pg_trigger sin filas en local).
--
-- 3) Qué escribe la app directo: se revisó todo `apps/` y `packages/` (14 escrituras
--    directas en total). Ninguna apunta a estas tablas; son de catálogo (categorias, colores,
--    tallas, tejidos, patrones, etiquetas, codigos_descuento, productos). Las 4 pantallas de
--    esta zona (Punto de Venta, Devoluciones, Cambios, Anular venta) usan `.rpc(...)`.
--
-- CÓMO SE DESHACE (30 segundos, sin pérdida de datos):
--   grant insert, update, delete on retail.ventas, retail.venta_items, retail.devoluciones,
--     retail.devolucion_items, retail.venta_anulacion_items to authenticated;
--
-- SE ROMPE SI: alguien escribe una pantalla o script nuevo que inserte/actualice estas tablas
-- sin pasar por una función security definer → verá `permission denied for table ventas`. La
-- respuesta correcta NO es devolver el permiso: es agregar (o usar) la RPC que corresponde.
-- Un arreglo manual de un incidente se hace desde el SQL Editor como `postgres` (dueña, se
-- salta todo esto). También se rompería si en producción existiera una función que escriba
-- aquí y NO sea security definer — la consulta del punto 1 dice que no.
--
-- LO QUE ESTA MIGRACIÓN NO CIERRA (a propósito, ver ADR-0119): transferencias,
-- transferencia_items, conteos, lotes y clientes tienen el mismo patrón y NO se rastreó quién
-- escribe en ellas. Y `0005_grants.sql` sigue dando escritura por defecto a toda tabla nueva.
-- ============================================================================

revoke insert, update, delete on
  retail.ventas,
  retail.venta_items,
  retail.devoluciones,
  retail.devolucion_items,
  retail.venta_anulacion_items
from authenticated, anon;
