## 2026-10-02 (El resumen de «Nuevo producto» muestra la campaña con descuento)
Qué hice: la ficha de resumen ahora anuncia la campaña de mayor % que rige hoy (elegida a mano o aplicada por la categoría) con su precio final, igual que la caja y la etiqueta impresa (`campanaDelAlta`, con prueba).
Por qué así: la etiqueta impresa ya salía con descuento y el resumen solo mostraba el precio de lista; eso confundía. La lógica es pura y reutiliza `descuentoDeCampana`, así no puede divergir de la caja.
Cómo verificas tú: en Nuevo producto, pon un precio y elige una etiqueta con descuento vigente (o una categoría cubierta por campaña): bajo «Precio · margen» aparece la franja con el precio final. Probado a 375 px con datos de ejemplo; falta con cuenta real.
