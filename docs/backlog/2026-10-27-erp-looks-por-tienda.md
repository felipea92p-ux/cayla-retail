# Backlog · Vitrina web ▸ Looks por tienda (ADR-0539)

Hecho: funciones, chips, filtro, aviso, contador, guía, pruebas. Pendiente:
- ~~Pegar `20261027204000` en producción~~ hecho (2026-10-27). Falta refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) y fusionar el PR #1402.
- Revisar las 8 pruebas de `pnpm pruebas:vitrina-looks` que ya fallaban en `main` con la base local (precio, láminas y «hay» de las tallas): puede ser desfase de la base compartida.
- Decidir si el aviso debe bloquear el guardado de un look que no sale en ninguna tienda (hoy no).
- Para Felipe en inventario: «Look del día» necesita la prenda blanca en TRU; «Una idea para hoy» necesita ofrecer la talla correcta de la cartera en AQP.
- Idea sin hacer: usar la misma lectura en la recepción de mercadería, para saber qué mover a qué tienda y completar un look.
