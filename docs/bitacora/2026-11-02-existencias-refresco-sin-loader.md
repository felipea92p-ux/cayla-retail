# 2026-11-02 · existencias-refresco-sin-loader

- **Qué:** Existencias, al actualizarse sola por el WebSocket (ADR-0603), encendía el loader de pantalla completa en cada cambio de stock ajeno.
  `router.refresh()` es una petición de pantalla y `clasificarPeticion` la cuenta como «carga». Ahora `useRefrescoEnVivo` la anuncia antes con
  `navegacionSinEspera` (el mismo mecanismo de `PreciosEnVivo` y `RefrescoTrasCorte`): el refresco corre sin tapar la pantalla.
- **Por qué Vender no lo mostraba:** Vender se actualiza con lecturas directas a la base (GET y `fn_stock_huella`), que el loader ya trata como
  lectura (ADR-0149). No cambia.
- **Dónde:** `apps/web/lib/useRefrescoEnVivo.ts`, comentario en `components/ui/Espera.tsx`, candado `lib/refresco-en-vivo-sin-loader.test.ts`.
- **Verificado:** vitest (candado nuevo + loader + arquitectura) en verde; en el navegador, con el interceptor real: `router.refresh()` sin anuncio
  enciende el loader (1 vez) y con el anuncio no lo enciende (0).
