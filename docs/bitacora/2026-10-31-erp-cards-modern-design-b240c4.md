## 2026-10-31 (Existencias: la tarjeta Vitrina, ADR-0589)
Qué hice: las tarjetas de Existencias pasan de «un recuadro plano» a una vitrina. La foto es grande (104 px por el alto de la tarjeta) y
lleva los colores en una chapa de vidrio encima: hasta 5 se ven todos; con más, 3 y «+N», que abre el modal de la prenda. A la derecha
van nombre, precio y color, con la tira de tallas en un pozo hundido, y el pie va a todo el ancho debajo. La tarjeta tiene sombra en
reposo, sube al pasar el mouse y lleva un filo rojo o ámbar si pide algo. Felipe eligió la opción B de la maqueta
`docs/maquetas/existencias-tarjetas-profundidad-2026-10/`. Piezas nuevas: `app/estilos/existencias-vitrina.css`, y `coloresDeChapa` y
`filoDeTarjeta` en `lib/existencias-tarjeta-compacta.ts`; `lineaGuardadas` acorta desde 3 tallas. La guía de Existencias suma el paso
«Los demás colores».
Qué se verificó: `tsc`, `knip`, `knip:produccion` y las 761 pruebas de la web en verde; la huella de «inventario» se aceptó tras
revisar la guía. En el navegador, contra la base local (sin guardar nada), a 1920, 1440, 1024 y 375 px no queda texto cortado ni nada
fuera de la tarjeta ni de la chapa. Cambiar de color, el menú «Más» (abre hacia arriba) y tocar la tarjeta (abre el modal con todos los
colores, se cierra con Escape) funcionan. El auditor del tema da 0 hallazgos en oscuro, a 1440 y a 375 px.
Qué queda: probar «+N» con un modelo real de más de 5 colores (la base local no tiene uno) y ver si en oscuro la chapa necesita un
filo más claro sobre las prendas negras.

## 2026-10-31 (b) (Existencias: Formidable de la tarjeta Vitrina y sus cambios 1 y 2)
Qué hice: corrí `/formidable` sobre la tarjeta (una prueba ciega y un escéptico, Sonnet; medido a 1440, 1024 y 375 px) y `guias:recorrer` de
Existencias (36/36 pasos a 1440 px en claro y oscuro, 35/35 a 375, sin escrituras). Con el OK de Felipe hice los cambios 1 y 2. El 1: el nombre
de la talla y la línea del almacén a 12 px exactos (el rediseño los había bajado a 10,5 y 10), y la palabra «en almacén» solo con 1 talla. El 2:
la línea del color dice solo el color que se ve; «Beige · 2 colores» hacía dudar de qué color era el número.
Qué se verificó: `tsc`, `eslint` y 808 pruebas de las que vigilan la pantalla. Barrido con Playwright en 26 anchos sin un texto cortado, ningún
texto de la tarjeta bajo 12 px, y la celda de 2 tallas medida a 320 px (83 px contra ~90 de «+10 en almacén»).
Qué queda: el cambio 3 (que la celda en ámbar y el filo usen la misma regla que el botón «Colgar · N tallas») espera la decisión de Felipe, y
falta repetir la prueba ciega sobre la tarjeta corregida.

## 2026-10-31 (c) (Existencias: una sola regla de «falta colgar» en la tarjeta, opción A)
Qué hice: Felipe eligió «manda lo físico». `faltaColgar` (`lib/existencias-tarjeta-compacta.ts`) es la única regla. Una talla falta colgar si
el motor la manda colgar, o si tiene 0 colgadas y algo en almacén y el motor no dice «mantener». La leen la celda en ámbar, el filo, el botón y
la talla con la que abre el modal. La talla «mantener» vacía lleva un visto verde, también en la leyenda del pie. La guía de Existencias lo nombra.
Qué se verificó: `tsc`, `eslint`, `knip` y las 761 pruebas de la web; 5 pruebas nuevas recorren el caso real (Pantalón Carla con el piso en pausa
y cuadrado). En local, las 15 tarjetas dicen en el botón tantas tallas como celdas en ámbar. `tema:auditar` encontró el nombre de la talla en taupe
sobre el ámbar a 3,8:1; se corrigió y la tarjeta queda sin hallazgos en claro y oscuro, a 1440 y a 375 px.
Qué queda: los filtros «Hoy» y «Por colgar» y el consejo del modal siguen al motor (con el piso en pausa dicen «en pausa»), y falta repetir la
prueba ciega sobre la tarjeta corregida.
