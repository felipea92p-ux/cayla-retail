# Proveedores v2 · tamaño y color (2026-10-26)

> **Descartada por Felipe el mismo día:** espacio desaprovechado, colores mal usados y el mosaico no sirve con muchos proveedores.
> La tercera ronda (ranking + lo que no se ve, tras investigar) está en `../proveedores-v3-2026-10/`.

Segunda ronda. Felipe vio la primera (`../proveedores-2026-10/`) y dijo: «No puedo identificar a simple vista a quién le compro más o a
quién le compro menos, tengo que leer letras pequeñas para enterarme de cosas importantes. Usa los colores a tu favor para dar a entender a
quién comprarle o el ritmo de venta». Esta ronda parte de dos reglas que valen para las tres direcciones:

1. **El tamaño es cuánto le compras.** Lo más grande es a quien más le compras. Se mide en prendas o en soles (botón «Tamaño según»; los
   soles son aproximados mientras el costo venga de la carga inicial).
2. **El color es cómo se vende, y con eso qué hacer.** Un color significa lo mismo en toda la pantalla: proveedores, tallas, sedes y prendas.
   - **Verde · Repón:** lo que queda se acaba en 6 semanas o menos.
   - **Pizarra · A su ritmo:** de 6 a 16 semanas.
   - **Ámbar · Frena:** 16 semanas o más (o no vendió nada).
   - **Hueso con borde · Aún no se sabe:** le compraste menos de 20 prendas.

Lo importante va en letra grande (nombres de 19 a 24 px, cifras de 28 a 96 px); la letra chica solo explica. Lo que cambia la decisión y
el color no dice (vencido, margen por confirmar o bajo, plata parada, entregas atrasadas) va en una etiqueta legible junto al nombre; lo
vencido, en rojo, porque es lo único que pide actuar hoy.

## Cómo verlas

`index.html` con un servidor (la configuración `maqueta-referentes` de `.claude/launch.json`: `http://localhost:3031/proveedores-v2-2026-10/`).
Arriba: dirección A · B · C, Lista / Ficha, el proveedor de la ficha y el tema. En la lista, los tres cuadros de color de arriba son la
leyenda y también un filtro: al tocar «Frena» se apagan los demás.

## Las tres direcciones (cambia solo la forma del tamaño; la ficha es la misma)

### A · Mosaico
Cada proveedor es un cuadro de su color y su área es lo que le compraste. Deyner ocupa casi un tercio de la pantalla en verde; Lasak,
Anqori, Wayi, Alex William Sevilla y Marisol Bellido forman una mancha ámbar. Cada cuadro grande dice su nombre, cuánto le compraste, las
semanas en grande y cuánto se vendió.
- **Gana:** es la que más rápido responde las dos preguntas a la vez: el tamaño grita a quién le compras más y el color, qué tan mal o bien
  se vende. La mancha ámbar dice «aquí está tu plata parada» sin leer nada.
- **Paga:** los proveedores chicos quedan en cuadros pequeños con solo su nombre y sus semanas (el detalle está en la ficha). Comparar dos
  cuadros de tamaño parecido es menos exacto que comparar dos barras.

### B · Barras
Una fila por proveedor, del que más le compras al que menos. La barra es lo que le compraste: lo lleno es lo vendido y lo claro lo que queda,
en su color. A la derecha, las semanas en grande sobre su color con la palabra «Repón», «A su ritmo» o «Frena».
- **Gana:** la comparación más exacta (406 contra 183 se ve), el orden se lee de arriba abajo y cabe bien en el teléfono.
- **Paga:** es la más parecida a una tabla; con muchos proveedores hay que bajar para ver a los chicos.

### C · Prendas
Cada figura de polo son 10 prendas: llena si se vendió, vacía si sigue en el estante, en el color de su ritmo. Lasak son 18 polos y solo uno
lleno; Deyner, 41 con 19 llenos.
- **Gana:** se entiende sin saber leer un gráfico: se cuentan polos. Se ve a la vez cuánto le compraste y cuánto se vendió.
- **Paga:** con proveedores muy grandes la fila se parte en dos líneas, y los soles por figura (S/ 250) son menos naturales que las prendas.

### La ficha (común)
Abre con una franja del color de su ritmo y la respuesta en letra grande («Vuelve a comprarle», «Frena: no le pidas más») con las semanas
en 96 px. Debajo, cuatro cifras grandes (le compraste, vendiste, quedan, ganas) y una barra gruesa vendido/queda. Las tallas y las sedes
usan el mismo color por su propio ritmo: la talla que se acaba sale verde con «Se acaba» y la que sobra, ámbar con «Sobra». Cada prenda
lleva su barra y sus semanas en su color. La plata, en cifras grandes (le debes, ya venció en rojo, le pagas a, entregas atrasadas, te debe).

## Lo que no cambió

- Las reglas, los umbrales y los datos de ejemplo son los mismos de la primera ronda (`comun.js` y `datos.js`, copiados).
- Tallas y sedes siguen inventadas y marcadas «Dato nuevo · en construcción» (las construye otra sesión).
- Solo tokens de `globals.css` y `tema.css`. Para «Frena» se usa el ámbar de gráficos (`--color-grafico-baja`) con letra oscura fija
  (`--color-tinta-fija`), que contrasta en claro y en oscuro; el ámbar de texto se veía café y no avisaba.
- Movimiento de una sola vez, sin rebote ni bucle; los cuadros y las figuras entran en cascada y las barras crecen. Se apaga con
  `prefers-reduced-motion`.
- Revisadas a 1440 px en claro y oscuro, y a 375 px sin desborde horizontal.
