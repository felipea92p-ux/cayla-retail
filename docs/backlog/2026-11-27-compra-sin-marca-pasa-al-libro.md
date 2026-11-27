## 🧾 Compra sin marca pasa al libro (2026-11-27, act. de ADR-0646) — migración `20261127152000` **PEGADA en producción** (2026-11-27), sin web; rama `claude/compra-sin-marca-pasa-al-libro`

- [x] Candado `compra_items_prenda_o_categoria` (prenda o categoría; marca opcional) en lugar de `compra_items_prenda_o_categoria_marca`.
- [x] Prueba de Postgres con su control: 4/4 en verde con la migración, 0/4 con `--sin-migracion`; pegada dos veces en una transacción, queda igual.
- [x] **Pegada en producción (2026-11-27, Felipe).** Leída después: `compra_items_prenda_o_categoria | CHECK (((producto_id IS NOT NULL) OR (categoria_id IS NOT NULL)))`, y el candado viejo ya no está.
- [ ] **Falta (paso 2 del PR):** destrabar los 5 papeles atascados con `fn_papel_pasa_solo` (receta en el PR #2047) y confirmar que quedan `completado`. Al 2026-11-27, después de pegar la migración, seguían los 5.
- [ ] **Diccionario:** `pnpm datos:generar:produccion` cuando se refresque el volcado (hoy `docs/datos/generado/` dice el candado viejo).
- [ ] **Sin decidir (no es de este PR):** `completar_papel_compra` toma la categoría que eligió la tienda al contar, pero no la marca; una prenda a
  la que la tienda le puso marca queda sin marca en el comprobante.
