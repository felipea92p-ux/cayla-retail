# Maqueta · Inventario ▸ Conteo con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596), con sus dos pantallas: el inicio de Conteo
(`app/(app)/inventario/conteo` → `ConteoVista`) y contar (`conteo/[id]` → `components/conteo/ContarConteo.tsx`).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la pantalla, la cara de lo propio, el tema y el
ancho (de 320 a 1920 px). En Contar, los − + de cada talla cuentan de verdad: cambia el estado y la talla recién contada respira en verde una
vez, como hoy.

Está armada **solo con lo ya elegido**: cabecera A con las cifras de la placa, el escáner en el pozo del buscador del mostrador, avatar A,
insignia A, el paso de cantidad **A · Celdas vivas**, botones gota y, en el celular, la barra de abajo A · Gota ahumada.

**La planilla conserva su cara de tabla** (ADR-0358: un `<table>` con la cara de `<Tabla>` por rendimiento, que con 800 tallas redibuja cada
fila sola). No se cambia por la tabla con superpoderes: solo cambia el material. Las columnas se angostan como hoy cuando la tarjeta mide
menos de 26rem.

## Lo propio de Conteo (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La planilla de cada prenda | Como ahora | Tarjeta de papel, cabecera de tabla en arena, filas con raya arena. |
| | **A · Placa Serena** (recomendada) | La placa elegida para las tablas; la cabecera, una franja hundida; las filas, una raya de tinta al 8 %. |
| | B · Lámina casi papel | Vidrio casi opaco (la lámina de la lista de prendas de las hojas): los números se leen sobre cualquier fondo. |
| Los pasos Contar · Revisar · Confirmar (`PasosConteo`, el riel que comparte con Recibir) | Como ahora | Puntos de tinta y verde sólidos en una línea arena. |
| | **A · Ranura con gotas** (recomendada) | La línea es una ranura; lo hecho, una gota verde; lo de ahora, la gota ahumada. |
| | B · Pozo con gota | Los tres pasos en un pozo, como las pestañas. |

Los pasos son la misma pieza que el paso a paso de Cambios y Devoluciones: lo que elijas aquí conviene que valga para los dos y para Recibir.
Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

La planilla como tabla (Talla · Debe haber · Contaste · Estado) y su rendimiento, el estado de cada talla con su color, la talla recién contada
que respira en verde, «Completar todo lo que cuadra», el escáner de corrido, quién cuenta y la barra para pasar a Revisar.

## Reglas que respeta

Solo tokens; los colores de las prendas son dato. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos
inventados. Medida de 320 a 1920 px sin que nada se salga. En la maqueta, `marco.css` ya usa `.tc`, `.linea` y `.sub`, así que aquí se llaman
`.cv-tc`, `.cv-linea` y `.cv-sub`.

## Lo que decidió Felipe

Pendiente.
