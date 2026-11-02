# Maqueta · Compras ▸ Mis compras con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Compras ▸ Mis compras (`app/(app)/compras/mi-plata` →
`components/mi-plata/MesaDeLaRonda.tsx`, ADR-0559).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px).

Está armada **solo con lo ya elegido**: cabecera A, placas Serena, gráficos B · Tinta sobre vidrio y barra de avance A · Tubo (los dos ya en
la billetera), insignia A, «Ver» en gota, íconos A (los de 20 px en duotono) y botones gota. El camino de la ronda queda como hoy: en línea en
escritorio y cuatro barras con su nombre debajo bajo 1024 px.

## Lo propio de Mis compras (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La billetera «Tienes para comprar» (`Billetera`) | Como ahora | Bloque de tinta sólida. |
| | **A · Ahumada** (recomendada) | Vidrio ahumado de tinta, con su luz y su filo: la misma decisión que el titular de Caja. |
| | B · Placa clara | Una placa Serena más, la cifra en tinta. |
| «¿Qué hiciste?» (`AccionDelDia`) | Como ahora | «Apunte de compras» grande en tinta sólida; las otras dos, en papel. |
| | **A · Gota grande** (recomendada) | «Apunte de compras» es la gota ahumada del botón primario (pasa a rojo profundo al pasar el mouse); las otras dos, gotas claras. |
| | B · Tarjetas de opción | Las tres iguales, de vidrio; la grande se distingue por su tamaño y su flecha. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

El camino de la ronda, lo que dice la billetera y su barra de lo usado, el orden de las acciones, la lista del día con sus marcas, «Para
mandar» primero en el celular y «Cerrar la ronda» al final. El vuelo de la prenda a «Tu compra» vive en el Apunte, no aquí.

## Reglas que respeta

Solo tokens. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin
que nada se salga.

## Lo que decidió Felipe

**La billetera A · Ahumada y «¿Qué hiciste?» A · Gota grande** (2026-11-02), las recomendadas.
