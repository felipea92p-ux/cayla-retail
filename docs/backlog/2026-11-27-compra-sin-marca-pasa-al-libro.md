## 🧾 Compra sin marca pasa al libro (2026-11-27, act. de ADR-0646) — migración `20261127152000`, sin web; rama `claude/compra-sin-marca-pasa-al-libro`

- [x] Candado `compra_items_prenda_o_categoria` (prenda o categoría; marca opcional) en lugar de `compra_items_prenda_o_categoria_marca`.
- [x] Prueba de Postgres con su control: 4/4 en verde con la migración, 0/4 con `--sin-migracion`; pegada dos veces en una transacción, queda igual.
- [ ] **POR PEGAR en producción** (una parte, re-pegable). Hasta entonces, toda compra de «Mis compras» con una línea sin marca se queda en «por completar».
- [ ] **Después de pegar:** destrabar los 5 papeles atascados con `fn_papel_pasa_solo` (receta en el PR) y confirmar que quedan `completado`.
- [ ] **Diccionario:** `pnpm datos:generar:produccion` cuando se refresque el volcado (hoy `docs/datos/generado/` dice el candado viejo).
- [ ] **Sin decidir (no es de este PR):** `completar_papel_compra` toma la categoría que eligió la tienda al contar, pero no la marca; una prenda a
  la que la tienda le puso marca queda sin marca en el comprobante.
