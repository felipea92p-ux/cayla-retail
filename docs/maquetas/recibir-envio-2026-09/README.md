# Maqueta: Recibir mercadería por envío (2026-09-18)

Referencia visual de `/recibir` (ADR-0113): un **envío** con comprobantes de varios proveedores, una sola guía,
bloques por comprobante, escaneo y barra de totales. Es una maqueta HTML con los tokens reales de
`apps/web/app/globals.css` (crema, tinta, rojo, EB Garamond y DM Sans), adaptada del diseño que eligió Felipe
—que tenía otra marca y rollos de tela— a prendas con talla y color de CAYLA. Los datos son de ejemplo, salvo la
primera fila de la lista (la de su pantalla).

- `envio-multiproveedor.html` — fuente autocontenida (ábrela en un navegador; usa `cayla-isotipo.png`).
- `envio-multiproveedor.png` — captura de referencia (3344×2660, 2x).

**Lo que la pantalla construida cambia respecto a la maqueta** (manda la pantalla, verificada en el navegador):
- Los cuatro indicadores (por recibir, unidades pendientes, atrasadas, la más atrasada) van **debajo de
  «¿Qué llegó?»** mientras no hay nada marcado, y desaparecen al marcar un comprobante.
- La persona de la maqueta es una líder; quien no es líder ve lo mismo **sin dinero** y sin decidir qué pasa con
  lo que faltó («Sigue pendiente»).
- «Fuera de comprobante» lleva el origen de cada prenda (proveedor + «Es un regalo») y un bloque de **envío
  interno** (traslados en tránsito de otra sede) que se cuentan y confirman dentro del envío.
- Sin construir todavía: «Guardar borrador» / «Borrador guardado», miniaturas de prenda, «Imprimir».
