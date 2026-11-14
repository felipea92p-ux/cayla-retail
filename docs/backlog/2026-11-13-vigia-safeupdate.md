## 📈 El vigía de rendimiento corre desde el cron (2026-11-13, ADR-0656 act. c) — migración `20261113233000`; rama `claude/vigia-safeupdate`

- [x] `fn_foto_rendimiento()` sin DELETE a secas (`where true`). Probado con `safeupdate` cargado, como el cron (`pnpm pruebas:vigia-rendimiento`, 25/25, con control).
- [x] **Pegada en producción** el 2026-11-13 a las 23:32 UTC, con el sí de Felipe. El SHA-256 del texto pegado coincide con el archivo; el md5 de `fn_foto_rendimiento` es el de la rama (`d56f8509…`).
- [x] El cron funciona: la corrida de las 00:07:34 UTC del 2026-11-14 dejó su foto (311 filas, roles de las apps). Resta contra la manual de las 21:05, así que cubre también las horas que fallaron. Los ids 2 y 3 los gastaron las corridas fallidas (la secuencia no retrocede).
