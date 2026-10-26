# Proveedores v4 · tres formas visuales (2026-10-26)

Cuarta ronda. Felipe, sobre la tercera (ranking en tabla): «No me gusta ninguna, elabora 3 más que sean innovadoras y visuales».

## Se mantiene de las rondas anteriores

- **Funciona con muchos proveedores:** 52 en los datos de ejemplo, sin mosaico.
- **Se ordena por prendas compradas o por dinero gastado**, con un botón grande.
- **Sin espacio muerto:** cabecera corta, el gráfico ocupa el ancho y nunca pasa el alto de la pantalla.
- **El color solo con su significado**, siempre con forma y palabra:
  - ● verde «Repón»: se agota en 6 semanas o menos.
  - ■ pizarra «A su ritmo».
  - ▲ ámbar «Frena»: 16 semanas o más.
  - ○ «Poco para medir».
  - ✕ rojo: solo lo vencido.
- **A la derecha, «Lo que no se ve a simple vista»,** ahora más visual:
  - un anillo con lo vendido;
  - lo vencido y las entregas atrasadas;
  - las barras de las prendas paradas;
  - el anillo de concentración y el del costo por confirmar;
  - quién se agota;
  - la talla que se acaba en toda la tienda (dato nuevo).
- **Al tocar un proveedor**, en cualquiera de las tres, su detalle reemplaza esa columna: puesto, qué hacer, cuatro cifras, sus tallas y sus
  sedes en celdas de color, y la plata.

## Lo nuevo: cambia la forma de mirar

### A · Mapa de decisiones
Cada proveedor es un punto:
- **A la derecha, más le compras** (prendas o dinero).
- **Arriba, más rápido se vende** lo que queda.
- **Más grande el punto**, más prendas siguen en tus tiendas.

Una línea marca a tus 10 proveedores más grandes y dos franjas marcan las 6 y las 16 semanas. Así el mapa queda partido en zonas que dicen
qué hacer:
- «Repón · se venden rápido»
- «Prueba comprarles más»
- «Frena»
- «No insistas»

Al pasar el mouse sale su tarjeta. Al cambiar entre prendas y dinero, los puntos se deslizan a su lugar nuevo.

- **Gana:** responde «¿a quién le vuelvo a comprar?» de un vistazo y para todos a la vez. Lasak (mucho y lento) y Deyner (mucho y rápido) quedan en
  esquinas opuestas.
- **Paga:** un gráfico de dos ejes pide un momento la primera vez. Los proveedores chicos se juntan a la izquierda y solo los 8 más grandes
  llevan su nombre escrito; el resto se lee al pasar el mouse o tocándolo.

### B · Sol de proveedores
**El ranking en círculo:**
- **Un rayo por proveedor**, que gira como el reloj desde arriba: el primero a las 12.
- **El largo** es cuánto le compraste y **lo oscuro**, lo que ya vendiste.
- **La punta** lleva su forma y su color de ritmo.

En el centro, el total; al pasar el mouse, ese proveedor. Al cambiar entre prendas y dinero, los rayos giran a su nuevo puesto.

- **Gana:** es la más vistosa y muestra a los 52 a la vez, del mayor al menor, sin bajar.
- **Paga:** comparar dos rayos parecidos es menos exacto que dos barras, y solo los 14 primeros llevan nombre (en el teléfono, ninguno: se
  toca el rayo).

### C · Mapa de calor
**El ranking con sus tallas y sus sedes.** Cada fila es un proveedor, del que más le compras al que menos, y cada celda dice en cuántas
semanas se vende lo que queda de esa talla o en esa sede:
- **verde:** se agota, repón;
- **arena:** a su ritmo;
- **ámbar:** se queda, frena.

Arriba va una fila con **toda la tienda**. Al cambiar entre prendas y dinero, las filas se deslizan a su puesto nuevo.

- **Gana:** usa de lleno los dos datos nuevos (tallas y sedes). Se ve al toque qué talla pedir y a qué sede mandar, y los 52 caben bajando
  sin «ver más».
- **Paga:** es la más larga. En el teléfono se ven el nombre y las tallas, y las sedes se ven deslizando la tabla.

## Datos y reglas

- **Los datos:** los mismos 52 proveedores de la v3. Los 11 casos reales del ADR-0502 y 41 inventados con semilla fija.
- **Las reglas:** las de `apps/web/lib`, copiadas en `comun.js`.
- **Tallas y sedes:** inventadas y marcadas «Dato nuevo · en construcción».
- **La ficha completa:** se diseña después de elegir.

Revisadas en el navegador a 1440 y 1920 px, en claro y oscuro, y a 375 px sin desborde horizontal de la página. El movimiento va una sola
vez y se apaga con `prefers-reduced-motion`:
- los puntos asoman;
- los rayos crecen desde el centro;
- las celdas entran en ola;
- al cambiar el orden, todo se desliza a su lugar.
