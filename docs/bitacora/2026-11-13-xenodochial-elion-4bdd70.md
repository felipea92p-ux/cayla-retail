## 2026-11-13 — Catálogo ▸ Liquidación se retira (ADR-0653, reemplaza a ADR-0379)

- **Qué:** sale la pantalla `/productos/liquidacion`, su menú, su módulo, su guía y sus estilos; Vender ya no lee etiquetas `LQ`. La migración `20261113174000` quita el módulo de `modulos`/`rol_modulos` (se detiene si hay historia) y le quita a la web el permiso de las seis funciones; tablas, funciones y `registrar_venta` quedan quietas.
- **Por qué:** 0 piezas y 0 etiquetas en producción (volcado del 2026-11-12) y el nombre se confundía con la insignia «Para liquidar» (Felipe: «nunca se ha usado y solo causa confusión»).
- **Cómo se verifica:** `pnpm pruebas:liquidacion-retirada` (5/5 con la migración aplicada en transacción, `PRUEBA_CON_MIGRACION=…`), vitest de la web, `tsc`, `knip` y `knip:produccion` en verde. Migración SIN pegar en producción.
