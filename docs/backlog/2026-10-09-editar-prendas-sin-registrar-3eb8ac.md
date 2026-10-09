## 🧾 Corregir lo anotado de una venta sin registrar (2026-10-09, ADR-0369) — migración `20261010150000`; rama `claude/editar-prendas-sin-registrar-3eb8ac`

- [x] Base: tabla `prendas_por_regularizar_correcciones` (solo se agrega), `corregir_prenda_sin_registrar`, `fn_correcciones_prenda_sin_registrar`. Aplicada en local; 12 pruebas en el CI.
- [x] Web: «Corregir lo anotado» en el puente y en el resumen de una cerrada; `PrendaSinRegistrarModal` en modo `corregir`; listas compartidas con Vender (`lib/prenda-sin-registrar-listas.ts`). Verificado en escritorio y a 375 px.
- [ ] **No está en producción:** pegar `20261010150000_corregir_prenda_sin_registrar.sql` con el OK de Felipe ANTES de publicar la web (sin ella, el botón responde «todavía no está disponible»; la lista sale igual). Después, refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Sin probar:** el camino de una venta `cerrada_sin_prenda` en el navegador (no hay cerradas en la base local; lo cubre la prueba de base). `/formidable` y `/chaos` sobre la hoja en modo corregir.
