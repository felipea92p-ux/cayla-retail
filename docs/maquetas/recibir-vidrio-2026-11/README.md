# Maqueta · Recibir mercadería «B» con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596). Recibir «B» es **diseño propio** (ADR-0575, Felipe 2026-10-29: Trayecto,
acordeón, Dial, totales que ruedan, Podio, Vitrina y sello de lacre, con mucho movimiento). Felipe pidió pasarla al vidrio (2026-11-02),
como Traslados y Movimientos: **el movimiento no cambia** (copiado de `app/estilos/recepcion-viva.css`); **solo cambia el material**.

Abrir `index.html` (o con la config `maquetas`). Tocable: − y + mueven el Dial en su lugar (el arco se desliza 600 ms) y, al cuadrar (6 de
6), suelta su halo una vez; tocar otra categoría la abre; «Envío cerrado» muestra el lacre, el Podio y la Vitrina; «Repetir el movimiento».

## Lo que hay hoy

Grupos del acordeón, lacre y Vitrina de papel; la prenda del acordeón y las cifras del lacre en hueso; la pista del Dial en hueso; la vía
del Trayecto en arena; el «+» del Dial y las barras del Podio en tinta sólida. El rojo de la etiqueta de precio y del sello de lacre **se
queda**: es la metáfora de la pantalla.

## Las caras

| Pieza | Caras |
|---|---|
| Superficies | **A · Vidrio claro** (tarjetas en vidrio claro sin desenfoque, lo de adentro al pozo, el «+» a la gota ahumada) |
| Avances (Dial, Trayecto, Podio) | A · Tinta sobre vidrio (lo elegido para los gráficos) · **B · Tubo** (lo elegido para la barra de avance en todo el ERP) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`. Los pasos de arriba (`rc-riel`) son los elegidos
en Conteo (A · Ranura con gotas): Recibir los hereda.

## Medido

En Chrome sin ventana: 144 combinaciones (320 a 1920 px, claro y oscuro, contar y cerrado, todas las caras), nada se desborda; sin errores
de JS; − y + mueven el Dial sin repintar la pantalla (antes de corregirlo, cada toque volvía a correr todas las entradas). Dos cosas
corregidas al mirar: los íconos de − y + heredaban el giro del aro del Dial, y el halo del camión del Trayecto se salía 2 px.
