# Impuestos · versión «pocas palabras» (2026-10-26)

Maqueta tocable (`index.html`, sin dependencias; `#a` `#b` `#c`, `?tema=oscuro`) de Finanzas ▸ Impuestos con el mínimo de texto.
Tres direcciones sobre las mismas cifras de ejemplo (no hay datos reales, nada se guarda):

- **A · Ruta del mes:** revisar → descargar → pagar → listo; un panel por paso y la respuesta fija a la derecha.
- **B · La cuenta:** cobraste − IGV de tus compras + renta = pagas, y debajo pendientes, límite, meses y «por lugar» (idea, necesita base).
- **C · De un vistazo:** tres tarjetas (pagas, pendientes, límite) y tres acciones en orden.

Cada dirección numera sus piezas y las explica debajo; al final, «Qué cambia frente a hoy» y «Qué falta para concluir el módulo».
No se tocó código de la app, migraciones, SUNAT ni producción. Felipe elige mirando; lo elegido pasa por `/construir` y se anota en un ADR.

## Ajuste 2026-10-28: D · B+ (`#d`)
Felipe eligió B y pidió completarla. **D · B+** es B con lo que le faltaba frente a la pantalla real: «Vendiste» (la base de la cuenta, con
comparación contra el mes anterior), «Cobraste» renombrado «IGV de tus ventas», días que faltan para pagar y «Registrar pago», una frase de
«lo que falta hacer», pendientes con los cinco tipos reales de `impuestos-antes-reglas.ts` y su monto, límite con soles, marca de 250 UIT
y proyección a diciembre, meses con barra e importe, y «Lo que viene en el año» (renta anual, ITAN, SIRE) apagado hasta que el contador confirme.
Las cifras de ejemplo son coherentes entre sí (IGV de ventas 21,960 = 18 % de 122,000; renta 1 % = 1,220; UIT 5,500). Funciona en los tres
estados, claro y oscuro, y a 375 px. Sigue sin tocar código de la app, migraciones ni producción.

## Ajuste 2026-10-28 (b): E · B++ (`#e`)
D se juzgó correcta en contenido pero floja en jerarquía (cuatro tarjetas iguales, franjas sueltas, meses muy pesados, lo accionable abajo).
**E · B++** la corrige: una sola respuesta grande («Pagas», con la fecha, la frase de lo que falta y «Registrar pago»), la cuenta en líneas a su
lado (Vendiste → IGV de ventas − IGV de compras + renta = pagas, con «Ver de dónde»), y en una sola fila Pendientes con monto, Límite con
proyección y los meses como barras en arena con el mes que se mira en tinta. Cabe sin bajar en 1440 × 900. «Por lugar» y «Lo que viene en el
año» salen de la pantalla (siguen en «Qué falta»). Probada en los tres estados, claro y oscuro, y a 375 px. Sin tocar código de la app.
Lo que no se podría construir tal cual hoy: la fecha de vencimiento («Vence en 5 días») necesita el último dígito del RUC, y «Pagado» necesita
unir cada pago a SUNAT con su mes (decisiones de Felipe).

## Ajuste 2026-10-26 (b): qué entra en «IGV de tus compras»
Según `lib/impuestos-balanza-reglas.ts`: suma mercadería, gastos con factura, máquinas y muebles e insumos del Taller; resta notas de
crédito de proveedor e IGV que no se descuenta (facturas de S/ 2 000 o más pagadas en efectivo); y, si hay, el saldo a favor que se
traía del mes anterior. La maqueta lo muestra en un desplegable («IGV de tus compras ▸» en A y C, «Ver de dónde» en B) y el estado «A favor»
incluye ese saldo para que la cuenta cierre.
