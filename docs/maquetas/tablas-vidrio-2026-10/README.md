# Maqueta · las tablas con vidrio (2026-10-31)

Tercera pieza de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `<Tabla>` + `<Encabezado>` + `fila()`/`celda()`
(`components/ui/Tabla.tsx`) y el movimiento de `.fila-cayla` (`app/globals.css`).

Abrir `index.html` en el navegador (o con la config `maquetas` del navegador integrado). Va montada sobre el marco y las piezas ya
elegidas (`../vidrio-base-2026-10/`: la cabecera A y las tarjetas de cifra A). La barra negra elige la cara, la pantalla (Órdenes de
compra: filas que llevan a su detalle, se ordenan por Orden, Llega y Total, y se abren al tocarlas; Movimientos: lectura densa con la
miniatura de la prenda), el tema y el ancho. «Guardar una fila nueva» muestra la fila recién guardada que respira en verde.

## Lo que hay hoy

- `<Tabla>` en 75 archivos, 224 encabezados y 126 filas con `fila()`; `.fila-cayla` directo en otros 20. Finanzas, Productos y las
  matrices de tallas tienen la suya y quedan fuera.
- Encabezado en arena al 70 %, rayado en hueso al 50 %, crema al pasar el mouse; la fila que lleva dibuja el hilo rojo de canto y asoma
  la «›»; la abierta, hueso firme; la recién guardada respira en verde; las filas entran en cascada.
- Sobre el vidrio es la superficie maciza más grande de la pantalla, pero también donde se lee en serio: la Aurora detrás no puede
  comerse un monto.

## Las caras

| Cara | Cómo es |
|---|---|
| Como ahora | Papel con filo arena, encabezado arena, rayado hueso. |
| A · Lámina casi papel (era la recomendada) | La lámina de las hojas en Serena (papel al 82 % con desenfoque); encabezado tenue con hilo, rayado apenas un tinte; la fila abierta es la gota del menú con su marca roja. |
| **B · Placa Serena** (elegida) | La placa de las tarjetas de cifra, sin rayado; filas separadas por un hilo que empieza tras la primera columna. |
| C · Plana sobre la Aurora | Sin caja: filas sueltas con hilos; al pasar el mouse la fila se enciende como gota; abierta, la gota con su marca. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

La plantilla de columnas compartida, el orden por columna, el hilo rojo y la «›» de la fila que lleva, la abierta marcada, la recién
guardada en verde, la cascada, el pie, y en el celular el encabezado que se va y la fila que apila sus datos.

## Reglas que respeta

Solo tokens, en claro y oscuro; los colores de las prendas son dato. Movimiento una vez, sin rebote; todo se apaga con
`prefers-reduced-motion`. Medido a 375 px, a 723 px de ventana con el menú abierto (las columnas que sobran se van, como `desdeLg`) y a
1500 px, en las cuatro caras, las dos pantallas y los dos temas: ninguna fila se desborda.

## Lo que decidió Felipe

**B · Placa Serena** (2026-10-31): la placa de las tarjetas de cifra, sin rayado, con un hilo entre filas. Y pidió ir más allá del
diseño: una tabla «con superpoderes», lo más entendible posible, con filtros desde las cabeceras, todo al centro y letra que cualquiera
lea. Esa maqueta está en `../tabla-superpoderes-2026-10/`.
