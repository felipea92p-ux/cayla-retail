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
