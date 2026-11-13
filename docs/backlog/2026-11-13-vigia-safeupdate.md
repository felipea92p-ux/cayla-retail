## 📈 El vigía de rendimiento corre desde el cron (2026-11-13, ADR-0656 act. c) — migración `20261113233000`; rama `claude/vigia-safeupdate`

- [x] `fn_foto_rendimiento()` sin DELETE a secas (`where true`). Probado con `safeupdate` cargado, como el cron (`pnpm pruebas:vigia-rendimiento`, 25/25, con control).
- [ ] **Pegar en producción** (con el sí de Felipe en la sesión): el archivo entero en una parte; verificar el md5 de `fn_foto_rendimiento`.
- [ ] Comprobar que la corrida horaria siguiente (a los 7 minutos) deja una fila nueva en `retail.rendimiento_corridas`.
