# Maqueta · Cambios y Devoluciones con vidrio (2026-11-02)

Dos páginas de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596) en una sola maqueta, porque comparten piezas: Ventas ▸ Posventa ▸
**Cambios** (`app/(app)/cambios`: `CambiosPanel` y `CambiosFlujo`) y **Devoluciones** (`app/(app)/devoluciones`: `DevolucionesPanel` y
`DevolucionesFlujo`). Los dos usan el paso a paso de `FlujoGuiado.tsx` y «lo que trae y lo que lleva» de `CambioResumen.tsx`.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la pantalla (Cambios o Devoluciones), el
momento (buscar la venta, elegir o confirmar), la cara de lo propio, el tema y el ancho (de 320 a 1920 px). Todo se toca: «Cambiar» o
«Devolver» en una compra abre el paso a paso, las tallas se eligen, las casillas se marcan, «Seguir» avanza y la flecha vuelve.

Está armada **solo con lo ya elegido**:
- La cabecera A con las cifras de la placa, el buscador del mostrador A · Pozo, los filtros A · Gotas, la insignia A, las placas Serena.
- La tarjeta de prenda **B · Foto al aire** del Punto de Venta, la casilla A · Pozo y gota, y las tarjetas de opción con el ícono en duotono.
- La vuelta en gota y, en el celular, la barra de abajo A · Gota ahumada, con el «Cobrar» que se invierte a crema en oscuro.
- El botón rojo del paso final, en la **gota roja** de «Cerrar caja».

## Lo propio (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| El paso a paso (`Pasos`, el hilo de Atelier) | Como ahora | Línea punteada con nudos; lo cosido en tinta; el nudo hecho en tinta sólida. |
| | **A · Hilo de vidrio** (recomendada) | La línea es una ranura; el nudo hecho, la gota ahumada; el de ahora, la gota clara con su halo. Conserva el hilo que se cose. |
| | B · Pozo con gota | Los tres pasos en un pozo, como las pestañas, con la gota que viaja. |
| Lo que trae y lo que lleva (`ComparacionPrendas`) | Como ahora | Dos fichas de papel con el hilo del cambio y la diferencia debajo. |
| | **A · Balanza** (recomendada) | Las dos fotos al aire frente a frente con una lente ⇄; la diferencia, una gota: ahumada si cobras, clara si devuelves. |
| | B · Talón | Una sola placa partida como un talón: arriba lo que trae, abajo lo que lleva, la diferencia al pie. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Celular (PL-105)

Medida a 375 px en los dos temas, en las dos pantallas y los tres momentos, sin que nada se salga. Hay tres capturas en esta carpeta:
`captura-375-cambios-buscar.png`, `captura-375-cambios-confirmar.png` y `captura-375-devoluciones-elegir.png`.

## Lo que no cambia

Qué hace cada paso y su orden, lo que revisa el sistema al costado, la diferencia que se cobra o se devuelve, quién lo registra, el escáner,
los filtros de la actividad reciente, «solo cambios sin diferencia en efectivo» con la caja cerrada y el movimiento del hilo que se cose.

## Reglas que respeta

Solo tokens; los colores de las prendas son dato. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos
inventados.

## Lo que decidió Felipe

Pendiente.
