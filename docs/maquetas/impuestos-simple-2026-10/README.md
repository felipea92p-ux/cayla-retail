# Impuestos · versión «pocas palabras» (2026-10-26)

Maqueta tocable (`index.html`, sin dependencias; `#a` `#b` `#c`, `?tema=oscuro`) de Finanzas ▸ Impuestos con el mínimo de texto.
Tres direcciones sobre las mismas cifras de ejemplo (no hay datos reales, nada se guarda):

- **A · Ruta del mes:** revisar → descargar → pagar → listo; un panel por paso y la respuesta fija a la derecha.
- **B · La cuenta:** cobraste − IGV de tus compras + renta = pagas, y debajo pendientes, límite, meses y «por lugar» (idea, necesita base).
- **C · De un vistazo:** tres tarjetas (pagas, pendientes, límite) y tres acciones en orden.

Cada dirección numera sus piezas y las explica debajo; al final, «Qué cambia frente a hoy» y «Qué falta para concluir el módulo».
No se tocó código de la app, migraciones, SUNAT ni producción. Felipe elige mirando; lo elegido pasa por `/construir` y se anota en un ADR.

## Ajuste 2026-10-26 (b): qué entra en «IGV de tus compras»
Según `lib/impuestos-balanza-reglas.ts`: suma mercadería, gastos con factura, máquinas y muebles e insumos del Taller; resta notas de
crédito de proveedor e IGV que no se descuenta (facturas de S/ 2 000 o más pagadas en efectivo); y, si hay, el saldo a favor que se
traía del mes anterior. La maqueta lo muestra en un desplegable («IGV de tus compras ▸» en A y C, «Ver de dónde» en B) y el estado «A favor»
incluye ese saldo para que la cuenta cierre.
