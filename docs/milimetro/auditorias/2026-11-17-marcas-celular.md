# Auditoría al milímetro — `/productos/marcas`: la fila de herramientas, el filtro único y la hoja «Resumen» · 2026-11-17 · `claude/marcas-celular`

Medido: 350×750 claro vivo · 350 oscuro · 350 quieto · foco con teclado en la hoja · 1440×900 claro (la fila en una línea). Servidor: `localhost:3010` (base local, sede Lima).

Resumen: **0 graves · 0 medias · 0 leves abiertas** · 1 media propia corregida · 3 heredados / decididos.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Fila a 350 | buscador de 284 px en su renglón; debajo «Resumen» y «Filtros» de 44 × 44 y «+ Nueva marca» de 186 × 44 hasta el margen; la cuenta debajo | 44 px con el dedo (ADR-0611 mejora 5) | pasa |
| Fila a 1440 | una línea: buscador 544 px · cuenta · «Resumen» · «+ Nueva marca»; las cinco píldoras debajo, sin el ícono de filtros | — | pasa |
| Margen de las tarjetas | con un proveedor de 70 letras, la tarjeta termina en 317 (la caja en 334) y el nombre se corta con «…»; antes se salía de la pantalla (captura de producción) | sin desplazamiento lateral | pasa |
| Filtro único a 350 | el ícono abre las cinco píldoras (Todas · Ya las usamos · Sin productos · Sin proveedor · Desactivadas); elegir una las guarda; la cuenta dice «1 de 5 · Ya las usamos» y el ícono lleva su punto | — | pasa |
| Hoja «Resumen» | cuatro cifras que filtran: «Aún sin productos» → «4 de 5 · Sin productos», la hoja se cierra y el foco vuelve a «Resumen» | WCAG 2.4.3 `[Norma]` | pasa |
| Foco en la hoja | 5/5 con anillo, 0 tapados | WCAG 2.4.7 `[Norma]` | pasa |
| Contraste (fila y hoja) | 0 textos ni controles que fallen en claro y en oscuro | WCAG 1.4.3, 1.4.11 `[Norma]` | pasa |
| Espacio y letra | 0 blancos bajo 44 con el dedo, 0 lecturas bajo 14 px en lo que cambió | WCAG 2.5.8 · regla del repo | pasa |
| Quieto | 0 animaciones en bucle | ADR-0625 | pasa |
| Guía interactiva | `guias:recorrer --guia productos.marcas` en verde a 375 (14 pasos) y 1440 (15); a 375 el paso «Filtrar por estado» enciende el ícono; huella aceptada | ADR-0389 | pasa |

## Corregido en esta pasada

1. **(Media, WCAG 1.4.1) En la hoja, la cifra puesta no se veía distinta de las demás.** `:is(.hoja-serena, .cajon-serena) .card-cayla` tiene la misma fuerza que
   `.tarjeta-cifra[data-puesta]` y, cargada después, le quitaba el hundido: solo lo decía `aria-pressed`. Regla gemela de la de `.card-cayla.border-tinta` en
   `app/estilos/vidrio/hoja.css`. Medido: la puesta toma `--hundido-*` y el medidor de estados pasa de 1 a 0. Vale para toda `<TarjetaCifra activa>` dentro de una hoja o un cajón.

## Heredado o decidido (no lo trae este cambio)

1. Las letras del índice «Ir a» sin marcas van apagadas (23, sin motivo a la vista): es `IndiceLetras`, de antes.
2. El pie «Mostrando 1–5 de 5 · de A… a …» se corta con «…»: decisión 3B de Felipe, 2026-11-16.
3. «Mayúsculas a mano»: son nombres de marca (dato), no texto escrito en mayúsculas.

## Sin medir

- Con las 121 marcas de producción (la base local tiene 5) y con una prenda en «Sin proveedor» (el punto ámbar).
- `tema:auditar`.
