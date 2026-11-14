## 2026-11-13 — El vigía de rendimiento corre desde el cron (ADR-0656, actualización c)

- **Qué hice:** la migración `20261113233000` deja `fn_foto_rendimiento()` con `delete … where true`. El cron la llamaba por PostgREST, que carga `safeupdate`, y cada hora fallaba con «DELETE requires a WHERE clause». Desde el SQL Editor funcionaba, porque ahí no se carga.
- **Por qué así:** es la única línea que `safeupdate` rechaza; lo demás de la función es idéntico. La prueba ahora llama la función como el cron (con `safeupdate` cargado), para que algo así no vuelva a pasar callado.
- **Cómo se verifica:** `pnpm pruebas:vigia-rendimiento` 25/25. El caso nuevo hace dos fotos con `safeupdate` y la llave de servicio, y el control con la versión anterior falla con el mismo error de producción. Después de pegar: la corrida horaria siguiente deja una fila nueva en `retail.rendimiento_corridas`.
