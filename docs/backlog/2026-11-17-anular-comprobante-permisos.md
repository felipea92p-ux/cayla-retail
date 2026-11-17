# 2026-11-17 · Permisos de la baja de un comprobante (ADR-0673)

Rama `claude/anular-comprobante-permisos`. Bitácora: `docs/bitacora/2026-11-17-anular-comprobante-permisos.md`.

## Esperan a Felipe

- [ ] **Pegar `20261117021000_baja_de_comprobante_sede_y_servidor.sql` en producción**, antes de publicar la web. Una sola parte, idempotente; se
  aplica antes o después de las partes de ADR-0671 (`20261116212000`…`214000`). Huellas esperadas antes de pegar (copia de producción del
  2026-11-16): `anular_comprobante` `0d850f39…`, `fn_confirmar_baja_sunat` `4bae2f02…`; si cambiaron, el reemplazo anclado se detiene sin aplicar nada.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción y el volcado se refresque.

## Sin decisión

- [ ] La hoja de Facturación sigue pidiendo el responsable para «Consultar la anulación», que ya no firma nada (ADR-0673, punto 5). Quitarlo
  es un cambio de pantalla: pasa por `/milimetro` y `/formidable`.
