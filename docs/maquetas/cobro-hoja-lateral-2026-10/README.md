# Spike · Cobro en hoja lateral, pulido (2026-10-01)

> **Estado: en revisión con Felipe.** Sin aplicar. Sale de la propuesta **H** de
> `../cobro-en-grilla-v3-2026-10/` (patrón Shopify POS), que Felipe eligió.

`cobro-hoja-lateral.html`: un solo archivo. La barra negra (no existe en el ERP) cambia entre 1 y 3 prendas, prende o
apaga el cobro de un toque, cuenta los toques y tiene **▶ Ver demo** (Yape + efectivo, boleta con DNI).

## Ronda «¿con cuánto paga? más notorio» (2026-10-02)
Los montos de efectivo pasan a ser billetes: 60 px de alto, cifra en EB Garamond a 28 px, fondo en el tono del efectivo
con filete interior, y el elegido se llena del dorado oscuro del efectivo (como el cuadrado de Efectivo). «Otro» queda
punteado. El rótulo «¿CON CUÁNTO PAGA?» sube a 14 px en negrita. Cabe en el peor caso (la columna mide 291 px junto a
los 306 de los cuadrados).

## Ronda «sin Nº de operación» (2026-10-02)
Felipe: «los números de operación nunca se ingresan, quita eso y optimiza el espacio». Se quitó el campo de Yape, Plin,
QR y transferencia. Con el espacio libre: cuadrados de 148 px con íconos de 80 px, nombres a 14,5 px, montos de efectivo
en dos columnas a 24 px y vuelto a 46 px. Sin efectivo, la columna derecha solo dice una pista corta («Confirma cuando
veas el pago» / «Cobra en el POS y confirma»). Peor caso medido: cabe sin scroll.
**Ojo al llevarlo al ERP:** hoy el Nº de operación existe (ADR-0230) y Ventas ▸ Historial busca por él. Quitarlo de la
caja deja esa búsqueda sin datos nuevos; decidir si se retira también allá.

## Ronda «igual que el ticket» (2026-10-02)
Felipe notó que el botón de la hoja y el «Confirmar cobro» del ticket tenían letras distintas. Ahora toda la hoja sigue la
regla del ticket (y de `.label-cayla` en `globals.css`): **palabras** en DM Sans, mayúscula, peso 600–700, espaciado
0,13em (PAGO, COMPROBANTE, EFECTIVO, BOLETA, ¿CON CUÁNTO PAGA?, VUELTO, VOLVER, CONFIRMAR COBRO) y **cifras** en EB
Garamond (total, montos sugeridos, vuelto, monto del botón). El botón de la hoja es el del ticket en grande: ✓ +
rótulo + monto. Nada se corta (medido) y el peor caso sigue cabiendo.

## Ronda «legible de lejos» (2026-10-02)
Felipe: «que los íconos ocupen todo el espacio posible, sin texto innecesario, textos cortos y claros con la tipografía
CAYLA, grande, que se pueda leer de lejos».
- **Íconos que llenan el cuadrado:** 72 px dentro de cuadrados de 140 px. Sin el fondo de color ni el atajo F1–F6 (el
  teclado sigue funcionando). Elegido: el cuadrado entero se llena con el color del medio y el ícono queda en crema.
- **Tipografía CAYLA (EB Garamond) en grande:** nombres de los medios (23 px), títulos de paso «Pago» y «Comprobante»
  (28 px), comprobantes (25 px), montos sugeridos (22 px), vuelto (36 px), total (50 px) y el botón (26 px).
- **Texto recortado a lo necesario:** fuera «1 prenda · Camisa Lara», «Exacto», «o teclea el monto», «(opcional)», los
  subtítulos de Boleta/Factura/Nota y «Sin documento: Cliente varios». El aviso de qué falta vive **en el propio botón**
  («Elige el pago», «Falta S/29.90», «Elige el comprobante», «Falta el RUC») y, cuando todo está, dice «Confirmar S/59.90».
- Peor caso medido otra vez (3 prendas, 6 medios, efectivo, 4 Nº de operación, RUC en boleta): cabe, sin scroll.

## Lo que pidió Felipe y cómo quedó (ronda anterior)
1. **Hoja más ancha:** de 476 a 760 px. El catálogo sigue a la vista, atenuado, a la izquierda.
2. **Medios cuadrados, grandes y fáciles de distinguir:** seis cuadrados de 128 px en 3×2 (franja de su color arriba,
   ícono en su tono, nombre en negrita, atajo F1–F6). Elegido: fondo de su color, ícono lleno y ✓. A la derecha de los
   cuadrados aparece solo lo que el medio pide: montos sugeridos y vuelto (efectivo) o Nº de operación. Con un solo medio
   el monto no se dibuja dentro del cuadrado (es el total); con dos o más, cada cuadrado lleva su monto bajo el nombre.
   **QR** es un medio nuevo (F3), en tinta como el código impreso, con Nº de operación opcional.
3. **La lógica de hoy:** tocar un segundo medio ya es pago en dos medios (no hay botón «Dividir»), y tocar uno elegido lo
   quita. Mejora: el medio que nadie escribió se queda con **el resto** (marcado «resto»). En «Yape + efectivo» basta
   escribir 30 en efectivo y Yape pasa solo a S/29.90. El segundo medio se lleva el cursor.
4. **Comprobante notorio y sin valor por defecto:** sección propia (paso 2) con Boleta, Factura y Nota de venta como tres
   tarjetas punteadas y **ninguna marcada**. Dice «Elige uno» desde el principio y se ilumina en cuanto el pago está
   cubierto. Sin comprobante no se confirma. Al elegir, aparece el documento en una sola fila, con el cursor puesto:
   DNI opcional (consulta RENIEC), RUC obligatorio en factura (consulta SUNAT). Si en boleta se escribe un RUC, ofrece
   «Emitir factura» en un toque.

## Se conserva de la ronda 3
Montos sugeridos de efectivo (Exacto + billetes + Otro) y vuelto; teclear números con efectivo elegido escribe lo
recibido; guía de foco (lo que sigue se ilumina); cobro de un
toque con «Deshacer»; «Venta registrada» dentro de la hoja.

## Toques
- Yape + Boleta sin documento: **Cobrar → Yape → Boleta = 3 toques**.
- Efectivo: + un monto sugerido = 4.
- Yape + efectivo con DNI: 6 toques + «30» + 8 dígitos (la demo).

Medido en el peor caso (3 prendas, los cinco medios, efectivo con recibido, tres Nº de operación, boleta con RUC y
sugerencia de factura): todo cabe en la hoja, sin scroll.

## Decisiones de negocio que esto toca (para Felipe)
0. **QR como medio de pago** no existe en el sistema: hoy los medios son efectivo, tarjeta, Yape, Plin y transferencia. Llevarlo
   al ERP es un cambio de esquema (el medio en `pagos` de la venta, su color `--color-metodo-qr` en `globals.css`, el cuadre de
   caja y los reportes por medio). ¿Qué QR es? (interoperable de un banco, el de Izipay/Niubiz…) decide cómo se concilia.
1. **Sin comprobante por defecto** cambia lo de hoy: el sistema arranca en Boleta («Opcional: ya está en Boleta»). Pedirlo
   siempre suma un toque por venta y obliga a la colaboradora a decidirlo.
2. **«El resto» automático:** el pago mixto de hoy no reparte solo (se baja un monto a mano). Esto escribe por la
   colaboradora el monto del medio que no tocó.
3. **Cobro de un toque:** al elegir el comprobante con el pago ya cubierto, la venta se registra en 2,2 s salvo que se
   empiece a escribir un documento o se toque «Deshacer». Si se elige el comprobante antes que el pago, el toque del
   medio es el que cierra (1,5 s). Se puede apagar.
