## Compras y Recibir ▸ las propuestas de /formidable de las órdenes de compra, hechas (2026-10-13) — rama `claude/formidable-compras-oc-9b0c82`

- **Qué:** la compra de una orden ya no adivina el papel, la condición ni el medio del pago (arrancan vacíos y se eligen); el botón y el título
  dicen «Registrar la compra» / «Compra de OC-…»; buscar una orden de otra sede dice dónde está. En Recibir, la fila del envío se toca entera y
  su botón lo nombra, el formulario a mano espera a que lo toquen mientras haya envíos, y «Es nueva» arranca sin tallas marcadas.
- **Por qué:** Felipe aprobó las 6 propuestas de la prueba ciega del 2026-10-12 («Sí, así»), con una cambiada: lo contado no se guarda en el
  navegador (ADR-0129); el aviso al salir ya existía.
- **Cómo:** lógica pura con sus pruebas (`comprobante-orden-reglas`, `ordenes-compra-reglas`, `recepcion-envio-reglas`), guías y huellas al día,
  y verificado en el banco a 1440 px con capturas antes/después; al mirarlo salieron tres textos del arranque vacío que se corrigieron.
