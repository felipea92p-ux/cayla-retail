# 2026-11-17 · Permisos de la baja de un comprobante (ADR-0673)

Rama `claude/anular-comprobante-permisos`. Bitácora: `docs/bitacora/2026-11-17-anular-comprobante-permisos.md`.

## Esperan a Felipe

- [x] **Pegar `20261117021000_baja_de_comprobante_sede_y_servidor.sql` en producción** (2026-11-17, con OK de Felipe, por `apply_migration`:
  registrada como `20261117140654`). Huellas antes `0d850f39…` / `4bae2f02…`, después `da261895…` / `89e0b922…`, iguales a la base local;
  `authenticated` y `anon` ya no ejecutan `fn_confirmar_baja_sunat`. Las partes de ADR-0671 se aplican encima sin tocar estas anclas.
- [ ] **Publicar la web** (este PR): mientras tanto, una baja que SUNAT confirma al instante queda en trámite hasta la pasada del cron.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción y el volcado se refresque.

## Sin decisión

- [ ] La hoja de Facturación sigue pidiendo el responsable para «Consultar la anulación», que ya no firma nada (ADR-0673, punto 5). Quitarlo
  es un cambio de pantalla: pasa por `/milimetro` y `/formidable`.
