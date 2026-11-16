# Fusionar: auditoría de «Precios por sede»

- [ ] El interruptor del sistema (`Interruptor`) apagado mide 1.11:1 contra el fondo de la hoja (WCAG 1.4.11 pide 3:1). Es de la pieza
  común, no de esta hoja: lo decide Felipe con `/unificar` o `/color`.
- [ ] Comparar en producción, en solo lectura, que el cuerpo de las funciones de la fusión es el del repo (md5 de `prosrc`).
- [ ] `/chaos` sobre la hoja (guarda).
- [ ] **POR PEGAR** `20261116203000` en producción (una parte, idempotente). Hasta entonces la fusión no frena si un precio de tienda
  cambia mientras se mira, y la hoja no avisa el precio bajo el costo.
- [ ] En una sede con conflicto no se puede elegir «el precio general» solo para esa sede (solo los precios propios de las fichas, o
  «un solo precio» para todas). Si hace falta, es una opción más en la fila.
