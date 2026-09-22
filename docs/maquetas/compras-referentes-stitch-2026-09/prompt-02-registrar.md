# Prompt para regenerar la pantalla 02 en Stitch

Proyecto: `projects/3207863516536512333` («CAYLA · Comprobantes de proveedores»)
Sistema de diseño: `assets/10542183336978512968` (ya aplicado al proyecto — no hace falta volver a crearlo)

Herramienta: `generate_screen_from_text`, `deviceType: DESKTOP`, `designSystem: assets/10542183336978512968`.

```
Pantalla de escritorio "Registrar comprobante" del mismo ERP CAYLA (mismo sistema de diseño y misma barra
lateral fija que la pantalla de listado de Comprobantes, con "Comprobantes" resaltado dentro del grupo Compras).

Arriba: enlace pequeño "← Comprobantes", rótulo "COMPRAS", título serif grande "Registrar comprobante", bajada
"Lo que se compró queda aquí; la recepción y el pago se anotan contra él." Barra de progreso corta "LISTO 2 DE 4"
alineada a la derecha del título.

Dos columnas: izquierda ancha con 3 tarjetas; derecha angosta con panel "Resumen" fijo.

Tarjeta "DOCUMENTO": a la izquierda un recuadro vertical con el facsímil de una factura escaneada (líneas de
texto simuladas, un sello dibujado, etiqueta "foto · adjunto"), visible al lado de los campos. A la derecha los
campos: Proveedor "Textiles Gamarra SAC" con chips "Crédito 30 días" y "Ya le debes S/ 1,200.00"; Tipo de
documento con tres segmentos Factura/Boleta/Nota de venta (Factura activa); Serie "F001" y Número "000456";
Fecha de emisión; Condición de pago con dos segmentos Contado/Crédito (Crédito activo); Vence el; Fecha estimada
de llegada; Mercadería destinada a con "Una tienda"/"Repartir entre tiendas" y selector "Tienda TRU"; IGV % en 18.

Tarjeta "LÍNEAS DEL COMPROBANTE": interruptor "El precio incluye IGV". Encabezados Producto/Talla y
color/Cantidad/Costo unit./Subtotal. Una fila "Blusa Lino Crudo", "M / Crudo", cantidad 24, costo S/ 18.50,
subtotal calculado. Enlace "+ Agregar línea".

Tarjeta "PAGO": chips Transferencia/Yape/Plin/Efectivo/Depósito/Otro (Transferencia activa), Monto y N.° de
operación.

Panel derecho "RESUMEN": Subtotal e IGV 18%; línea divisoria; TOTAL grande serif "S/ 5,343.00"; "Dónde cae" con
Por pagar/Por recibir/Mercadería para; zona de arrastrar "ADJUNTAR EL COMPROBANTE O DOCUMENTOS"; campo Nota;
lista de 4 requisitos con círculos (dos en verde); botón primario negro "Registrar factura · S/ 5,343.00" y
botón de texto "Cancelar".

Mismo sistema de diseño cálido y editorial que la pantalla de listado.
```

Si Stitch vuelve a tardar más que el timeout del cliente MCP: el `updateTime` del proyecto (`get_project`) avanza
igual aunque la llamada devuelva error de timeout — es señal de que sí está generando. Esperar y revisar
`list_screens` / abrir el proyecto directo en Stitch antes de reintentar el pedido.
