# Maqueta · las acciones chicas y el selector de mes, con vidrio (2026-11-01)

Dos filas de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): «Menú «Más», copiar, descargar, imprimir, editar»
(`ui/MenuAcciones`, `BotonCopiar`, `BotonDescargar`, `BotonImprimir`, `BotonEditar`) y «Selector de mes» (`ui/SelectorMes.tsx`).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco y las piezas ya elegidas
(`../vidrio-base-2026-10/`), en Ventas ▸ Comprobantes ▸ Emitidos, con la insignia y los botones ya elegidos. La barra negra elige la cara
de cada pieza, el tema y el ancho (de 320 a 1920 px). En «Ver abierto» se abre el menú de una fila o los doce meses. Todo se toca: el
«⋯» y el «Más» abren su menú (↑ ↓ y Escape), copiar dice «✓ Copiado», las flechas del mes avanzan y al tocar el nombre se eligen los meses.

## Lo que ya está resuelto

«Copiar enlace», «Descargar el mes», «Imprimir ticket», «Editar datos» y «Ver en Caja» llevan su palabra: son el botón secundario, que **ya
es la gota elegida** (botones A · Gota). Se ven en su lugar y no llevan caras.

## Lo que hay hoy (lo que falta decidir)

- **Los íconos solos de una fila** (el lápiz de `LapizEditar` en 13 archivos, el copiar de `BotonCopiar forma="icono"`, el «⋯» de
  `MenuAcciones` y `BotonPuntos`): 32 px, transparentes, con un **cuadrado de hueso macizo** al pasar el mouse.
- **El menú «Más»**: lista de 208 px en `card-cayla`, **papel macizo** con sombra; lo peligroso en rojo profundo, lo que no se puede,
  apagado con su motivo.
- **El selector de mes** (4 archivos): «‹ Octubre 2026 ›» en una **píldora de papel** con borde de arena; los doce meses en otra tarjeta de
  papel, el elegido en **tinta sólida**.

## Las caras

| Pieza | Cara | Cómo es |
|---|---|---|
| Íconos de fila | Como ahora | Cuadrado de hueso al pasar el mouse. |
| | **A · Gota al pasar** (elegida) | En reposo, solo el ícono; al pasar el mouse, con el foco o con su menú abierto, la gota redonda de los botones. |
| | B · Gota siempre | Cada ícono en su gota chica con el filo que se toca. |
| Menú «Más» | Como ahora | Papel macizo. |
| | **A · La lista del combo** (elegida) | La lista de vidrio de los combos, con la gota que viaja a lo que apuntas; sobre «Anular», teñida de rojo. |
| | B · Placa con hundido | La misma placa; lo que apuntas se hunde. |
| Selector de mes | Como ahora | Píldora de papel; el elegido, tinta sólida. |
| | A · Gota en su pozo | Como la paginación elegida: la fila es un pozo, el mes en que estás es la gota clara; los doce meses en la lista de vidrio, el elegido, la gota clara. |
| | **B · Gota entera** (elegida) | Todo el selector es una gota (botón secundario); el elegido de la grilla, ahumado. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Qué hace cada uno y su texto para lector, el «✓ Copiado» que no cambia de ancho, la flecha del «Más» que da media vuelta, lo que no se puede
apagado con su motivo, el Escape y las flechas dentro del menú; el mes de hoy con su punto rojo, los que no llegan con candado y la flecha de
la derecha apagada en el mes de hoy.

## Reglas que respeta

Solo tokens, en claro y oscuro. Movimiento una vez por toque y sin rebote (la gota del menú viaja en 320 ms, como la del combo); todo se
apaga con `prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

**2026-11-01: íconos de fila A · Gota al pasar, menú «Más» A · La lista del combo y selector de mes B · Gota entera.** Primero dijo
«B, A y B» y después mandó su selección de la barra con los íconos en A: vale la última. En el mes no tomó la recomendada. Al implementar:
el lápiz, el copiar y el «⋯» de una fila quedan como el ícono solo en reposo y muestran la gota redonda de 32 px al pasar el mouse, con el
foco (`:focus-visible`) o con su menú abierto (`aria-expanded`); el menú «Más» usa la misma lista y la misma gota viajera de `Desplegable`,
nunca otra; el selector de mes es la gota del botón secundario y el mes elegido de la grilla, la gota ahumada del filtro puesto.
