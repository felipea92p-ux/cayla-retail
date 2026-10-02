## 🏷️ La caja descuenta sin código (2026-10-01, ADR-0162 act. 2026-10-01) — migración + web; rama `claude/caja-descuento-sin-codigo-816518`

- [x] `registrar_venta` ya no pide código de descuento a nadie (`20261001150000_descuento_sin_codigo.sql`): candado de versión (md5 «antes» = el de producción el 2026-10-01, verificado en solo lectura), recorte entre marcas, validación final; idempotente.
- [x] Vender ▸ Descuento sin el campo «Código»; `pasoDelDescuento` sin el paso `codigo`; `PuntoDeVenta` sin el estado ni la prop `esLider`.
- [x] Pruebas: `registrar_venta.mjs` (casos 17-22 reescritos, 28/28 con la migración), `club_cumpleanos.mjs` y `club_venta_ligada.mjs` (md5 de hoy = el de esta migración; pegar HOY la 1c aborta sin pisar). Las dos del club se corren en el CI (la base local no tiene el club aplicado).
- [ ] **No está en producción.** Pegar `20261001150000_descuento_sin_codigo.sql` en el SQL Editor, sola, ANTES de fusionar la web. Verificación al pie del archivo.
- [ ] Después: `pnpm datos:generar:produccion` con el volcado nuevo.
- [ ] Limpieza que queda: las tres frases del código en `lib/error-escritura.ts` (se pueden borrar cuando la migración esté en producción) y `lib/codigos-descuento.ts` / `lib/facturacion-codigos-reglas.ts`, que ya no tienen pantalla que los use.
