## 2026-10-22 (La ficha de un gasto fijo deja de hablar de «recibo» y «servicio» cuando es un alquiler)
Qué hice: Felipe preguntó qué sentido tenía la parte «Para reconocerlo y no perderlo» en un alquiler. Cambié la ficha para que sus títulos, sus ayudas y qué cajas pide dependan de la categoría: el alquiler
pide «Propietario», «N.º de contrato», «Vence el contrato» (primero) y «Cómo te avisa que toca pagar», y no ofrece «Se paga el recibo»; seguros pide «Vence la póliza»; transporte, suministros y comisiones
del banco ya no piden fecha de vencimiento. Una categoría nueva o desconocida ve lo de siempre.
Por qué así: antes solo el ejemplo en gris seguía a la categoría, así que el título decía «recibo» y el gris decía «cómo te avisa que toca pagar». Una sola tabla por categoría (la que ya existía) evita
escribir un `if` por cada caso, y lo ya cargado nunca se esconde. De paso: «Comisiones y gastos bancarios» pedía el número de cuenta en una caja que ve cualquiera; ahora dice que no se escriba ahí.
Felipe se lleva: nada que pegar en producción (solo web, sin migración). Revisó el alquiler y el transporte en la pantalla real con la base local, sin guardar nada. Queda a su decisión si quiere un campo de
«cada cuánto se reajusta el alquiler» (pediría columna y migración) y qué debe contar como «falta» en la ficha.
