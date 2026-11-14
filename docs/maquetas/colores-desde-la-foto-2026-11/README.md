# Los colores salen de la foto (maqueta, 2026-11-13)

Pedido de Felipe: en **Nuevo producto** y en **Recibir ▸ Nueva prenda** ya no se eligen los colores en la carta. Se sube la foto de
cada color («+ Otra foto», y otra, y otra) y el color sale de la foto.

Abre `index.html` en el navegador. **La lectura es real:** sube tus fotos (o arrástralas, o pégalas) y mira qué color sale. A la
derecha hay cinco prendas dibujadas para probar sin fotos.

## Qué decide la pieza

| La foto tiene | Queda elegido |
|---|---|
| Un tono (con su luz y sus sombras) | Ese color de la carta: «Vino» |
| 2 a 4 tonos en zonas grandes | **Una** mezcla (ADR-0643): «Crudo con cobalto y negro». Si ya existe, se usa esa; si no, se crea al guardar |
| Tonos que cambian a cada rato (rayas, flores) | Pregunta el estampado (ADR-0634): «Rayas azul marino» |
| Más de 4 tonos | Pregunta: «Multicolor» o un estampado |
| El mismo color que otra tarjeta | La foto se suma a esa tarjeta (la espalda): no crea otro color |
| Un tono que la carta no tiene (queda a más de 8 del más parecido) | No lo pone. Pregunta: **«Usar Esmeralda»** (el más parecido) o **«Crear este color»** |

Cada tarjeta trae «Cambiar» (la carta, el que más se ve primero) y «¿Por qué?» (qué vio, qué juntó, qué dejó fuera y qué tan cerca quedó
de la carta). Debajo, la prenda: una fila por color, como `MatrizVariantes`.

## Un color que no está en la carta

El umbral es el «casi igual» del ERP (ΔE2000 ≤ 8, `UMBRAL_PARECIDO` de `lib/color-parecido.ts`). Más lejos, esa parte de la prenda queda en
«¿?» y la tarjeta pregunta; en una mezcla («Crudo con ¿?») solo se pregunta por el tono que falta.

«Crear este color» abre la misma hoja «Nuevo color» de hoy (`NuevoColorAlta`), con el tono de la foto ya puesto y la familia y el código
sugeridos; la persona escribe el nombre. Nadie busca el tono: ya viene de la foto. Si la luz lo cambió, la hoja trae
una **paleta con todos los colores** a la vista (el cuadro de claridad e intensidad y la barra de colores, como un programa de diseño),
que arranca en el tono de la foto: se arrastra, se mueve con las flechas o se escribe el #hex. Hoy la hoja del ERP solo tiene una
muestra que abre el selector del navegador (`SelectorColor`); esta paleta la reemplazaría en la hoja. Si el tono elegido ya está en la
carta, ofrece usar ese en vez de crear un casi repetido, y la familia sugerida sigue al tono. «Volver al tono de la foto» deshace. El aviso de «Existe también» (ADR-0576) sigue: el mismo nombre frena, uno casi igual pregunta.
El color se crea en la carta al tocar «Crear color», como hoy (cualquier cuenta, nace aprobado: ADR-0534), y la siguiente foto de ese
tono ya lo encuentra y se junta. En la maqueta, «Un color que no está» es un verde azulado (#288282) a 15,7 de «Esmeralda», uno de los
huecos más grandes de la carta.

Si con fotos de mala luz se empiezan a crear casi repetidos, la salida es que el color creado desde una foto nazca «pendiente» hasta que
lo apruebe un líder (la base ya tiene ese estado). Decisión de Felipe, si pasa.

## Cómo lee (todo en el navegador, sin IA, menos de 1 s, S/ 0)

1. Solo la prenda: lo opaco del PNG sin fondo; si la foto tiene fondo, se recorre desde el borde y se frena en el contorno.
2. k-medias en Lab (k = 8, arranque determinista: la misma foto da siempre lo mismo).
3. Tonos del mismo color se juntan con ΔE2000 y la luz a la mitad (kL = 2, como la regla CMC 2:1 de los textiles), bajo 10.
4. Cada grupo va al color más parecido de la carta (ΔE2000, el de `lib/color-parecido.ts`).
5. Lo que ocupa menos de 8 % es un detalle (botones, etiqueta) y no cuenta.
6. Dibujo: si más del 4 % de los píxeles vecinos cambian de color, parece estampado.

Los cuatro números se mueven en «Afinar la lectura» para calibrarlos con fotos reales; en el ERP serían fijos.

## Lo que se probó y lo que falla

- Los cinco ejemplos salen bien: Vino (y su espalda se junta), Crudo con cobalto, Crudo con cobalto y negro, Rayas azul marino.
- **La sombra mueve el color un escalón.** Con luz fuerte, el negro salió «Gris antracita» y el vino «Mora». Comparar el tono que más
  se repite en vez del promedio arregló uno y rompió el otro, así que quedó el promedio. Con la foto pareja de catálogo (la de la IA)
  sale bien. Por eso existe «Cambiar».
- **Una prenda crema sobre fondo crema pierde el crema**: ningún método de píxeles separa dos colores casi iguales. La tarjeta lo dice
  («El fondo es casi Crudo…») y la foto sin fondo de «Catálogo con IA» lo resuelve.
- Antes de construir: correr la lectura sobre los productos que ya tienen foto sin fondo y color puesto a mano, y medir cuántos aciertan.

## Decisiones que son de Felipe

- **Fotos en Recibir.** Hoy Recibir dice «las fotos se ponen después en Productos». Con esto, las fotos se suben al recibir.
- **Sin foto.** «No tiene color» (llavero, cuaderno) sigue existiendo. ¿Se puede elegir el color a mano sin foto, o la foto es obligatoria?
- **Preelegido.** El color que sale queda puesto y se puede cambiar; no se pide confirmar cada uno.

Datos: la carta es la de la base local (86 sólidos, 2026-11-13). La mezcla «Crudo con cobalto» que «ya existe» y los patrones son
inventados (el repo es público). La espera de la IA se simula.
