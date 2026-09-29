## 2026-09-29 (La etiqueta de precio lleva el ícono de las etiquetas de la prenda)

Qué hice: el papel de la etiqueta de precio ahora dice a qué etiquetas comerciales pertenece la prenda: hasta 2 íconos
(Nuevo, Para liquidar, Black Friday…) al lado del nombre y sobre el precio, en negro puro para la Brother. Salen las que rigen
(con o sin descuento) y las que todavía no empiezan; las terminadas no. Si la prenda tiene dos etiquetas con descuento salen los dos
íconos, pero el «−20 %», el motivo y el precio son solo del mayor. La regla es `iconosDelPapel` (`lib/etiqueta-precio-reglas.ts`),
los dibujos `components/IconoEtiquetaPapel.tsx` y la lectura `lib/etiquetas-precio.ts`. Sin migración.

Por qué así: preguntadas una por una a Felipe antes de programar (qué íconos, qué pasa con dos descuentos, dónde, para quién).
Los íconos de pantalla no sirven en la térmica (transparencias y trazos finos), así que hay un juego aparte. Comparé la cabecera
contra «al lado del nombre» con el CSS real: las dos entran. Al lado del nombre (lo que pidió Felipe) no mueve nada pero le quita
ancho: con 2 íconos y campaña, un nombre de más de ~13 letras sale cortado con «…». En la cabecera el nombre queda entero, a costa
de 0,63 mm de alto de cabecera. El detalle está en el ADR-0180.

Felipe se lleva: crear un producto con 2 etiquetas, imprimir en la Brother y mirar el ícono de 4,8 mm. Si el nombre cortado con
campaña molesta, se pasan los íconos a la cabecera.

## 2026-09-29 (b) (Las etiquetas del papel se dibujan todas igual: ícono + palabra en una fila, y una debajo de otra si no caben)

Qué hice: Felipe vio que Para liquidar y Black Friday se dibujaban distinto de las demás y que un ícono solo no dice qué es. Ahora TODAS
las etiquetas de la prenda van en una misma fila bajo el color, «ícono + palabra» (NUEVO, LIQUIDAR, BLACK FRIDAY…), sin cajas, con o sin
descuento. La palabra sale de `rotuloDeEtiqueta`. Si dos no caben en una línea, la segunda baja debajo de la primera, también en las
etiquetas con campaña: para eso la fecha de validez pasó a la derecha del precio tachado («Válido hasta el 30.10») y el bloque de precio dejó
de repetir el nombre de la campaña.

Por qué así: dos chips con palabra casi nunca caben juntos en 34 mm (~1,4 mm por letra), así que hacía falta apilarlos, y con campaña el
alto solo alcanzaba quitando la franja de validez. Un caso extremo (nombre en 2 líneas + dos etiquetas largas) recortaba la 2.ª línea a media
altura; se arregló bajando el ícono a 3,4 mm y acercando el precio a la fila.

Felipe se lleva: tres hojas con 36 combinaciones de la etiqueta real, todas con sus dos etiquetas visibles; imprimir en la Brother para ver el
ícono de 3,4 mm y la campaña con dos líneas de chips (queda ~1 mm de aire); y decidir si la frase de validez más corta le sirve.
