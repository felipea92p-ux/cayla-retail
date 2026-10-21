## 2026-10-17 (La tienda se siente más rápida: el catálogo en tandas, el buscador aparte, fotos con fundido y polaroids antes)
Qué hice: armé un banco de pruebas (base desechable con las 60 primeras prendas de producción y sus fotos, una cuenta de prueba, y un proxy
que retrasa 1,2 s cada respuesta, como un 4G lento) y medí cómo se siente cada toque. Los esqueletos ya cumplían (tocar una prenda muestra
el esqueleto de la ficha a los 52 ms). Lo que pesaba: «Toda la tienda» dibujaba todas las prendas de una vez (484 KB de HTML con 60; con
las 298 de producción, ~2,4 MB) y cada página con cuenta llevaba el índice entero del buscador (~530 bytes por prenda). Ahora el catálogo
entra con 24 y la siguiente tanda se pide sola antes de llegar al final, con cuatro tarjetas que brillan (`lib/tandas.ts`,
`MasPrendas.tsx`); el buscador pide su lista al rozar la lupa (`GET /api/buscador`, 30 s en el aparato) y muestra «Buscando…» con filas
que brillan; la foto que baja aparece con un fundido; y las polaroids del héroe caen desde el primer cuadro (la tercera quieta a los 0,88 s,
antes 1,54 s). Con 60 prendas: catálogo 484 → 261 KB, Inicio 134 → 109 KB y ficha 148 → 96 KB por navegación.
Por qué así: cada cambio salió de una medida en el banco y se probó con la red lenta, a 1280 y 375 px. La lista del buscador es una ruta y
no una acción del servidor porque Next ejecuta las acciones en fila: la búsqueda esperaba detrás de la que anota la entrada del día.
Descarté «Agregar a la bolsa» antes de que la base confirme (ya responde en el toque con «Agregando…», y decir «agregada» antes podría
mentir si se acabó la talla) y sacar zod de la ficha (13 KB en la primera visita, en archivos que está cambiando «Arma el tuyo»).
Felipe se lleva: una tienda que pesa menos en cada página y no se traba al bajar por el catálogo; las polaroids caen más rápido (si
prefiere la caída de antes, es una línea de `collage.css`).
