# 2026-10-09 — La lista de productos mostraba la foto vieja de la Blusa Alba Rayas

- **Qué pasó:** CMS-0013 tenía tres fotos VIN (la vieja en orden 0; la nueva dos veces, una marcada principal). No era caché: `fn_productos_listado` y `fn_productos` ordenaban `(color_codigo is null), orden` sin mirar `es_principal`, y Ventas, Devoluciones e Historial tomaban la primera foto del color con un `.find` sin orden.
- **Qué se hizo:** migración `20261009230000_listado_productos_respeta_foto_principal.sql` (reemplazo anclado: `…, pf.es_principal desc, pf.orden`), aplicada en local; las tres lecturas de la web pasan por `fotoDeVariante` (principal antes que orden), con prueba de regresión en `ventas-historial-reglas.test.ts`.
- **Pendiente:** aplicar la migración en producción (huellas antes: `fn_productos` 080a75e5…, `fn_productos_listado` 5674e697…) y quitar a mano la foto vieja y la copia repetida de la Alba Rayas.
