# 2026-10-09 — La lista de productos mostraba la foto vieja de la Blusa Alba Rayas

- **Qué pasó:** CMS-0013 tenía tres fotos VIN (la vieja en orden 0; la nueva dos veces, una marcada principal). No era caché: `fn_productos_listado` y `fn_productos` ordenaban `(color_codigo is null), orden` sin mirar `es_principal`, y Ventas, Devoluciones e Historial tomaban la primera foto del color con un `.find` sin orden.
- **Qué se hizo:** migración `20261009230000_listado_productos_respeta_foto_principal.sql` (reemplazo anclado: `…, pf.es_principal desc, pf.orden`), aplicada en local; las tres lecturas de la web pasan por `fotoDeVariante` (principal antes que orden), con prueba de regresión en `ventas-historial-reglas.test.ts`.
- **En producción** el mismo día (MCP `apply_migration`, versión 20261009230000; huellas después `de6ac046…` / `63ca8449…`, iguales a local). La Alba Rayas ya resuelve a la foto nueva.
- **Pendiente:** quitar a mano la foto vieja y la copia repetida de la Alba Rayas (Editar producto).
