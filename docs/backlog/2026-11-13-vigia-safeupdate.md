## 📈 El vigía de rendimiento corre desde el cron (2026-11-13, ADR-0656 act. c) — migración `20261113233000`; rama `claude/vigia-safeupdate`

- [x] `fn_foto_rendimiento()` sin DELETE a secas (`where true`). Probado con `safeupdate` cargado, como el cron (`pnpm pruebas:vigia-rendimiento`, 25/25, con control).
- [x] **Pegada en producción** el 2026-11-13 a las 23:32 UTC, con el sí de Felipe. El SHA-256 del texto pegado coincide con el archivo; el md5 de `fn_foto_rendimiento` es el de la rama (`d56f8509…`).
- [ ] Comprobar que la corrida horaria siguiente (a los 7 minutos) deja una fila nueva en `retail.rendimiento_corridas`.
