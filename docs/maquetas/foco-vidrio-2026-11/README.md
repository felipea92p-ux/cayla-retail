# La luz del campo que sigue, en vidrio (2026-11-02)

Felipe: «el focus actual brinda un fondo sólido, pero estamos usando glass: ¿podemos cambiarlo para que se adapte mejor? Dame alternativas para elegir».
Es la guía de foco (ADR-0284): el campo que sigue se enciende con «Sigue aquí».

Abrir `index.html` en el navegador (no necesita servidor). Barra negra: tema claro/oscuro, «Atenuar lo que no toca» y «Reiniciar». Todo se toca: escribe 8 o
más caracteres en Documento y sal con Tab, o elige la sede; la luz se mueve al siguiente. Nada se guarda. Datos inventados.

## Dos piezas, las dos sólidas (corregido el 2026-11-02 tras la captura de Felipe)

La primera versión solo mostraba el campo de un formulario. Felipe señaló que lo que él ve es otra pieza: el **paso del descuento** (`.hoja-cobro-paso.sigue-aqui`,
`globals.css:2935`; lo usan el descuento y el cobro): `papel` + 4 % de rojo, borde rojo al 28 %, «Sigue aquí» en chip rojo. La barra de la maqueta tiene
«Pieza» (paso / campo) y «Acento» (rojo como hoy / pizarra, que es lo que pide la guía de foco, ADR-0284).

## Por qué el campo de un formulario se ve sólido (leído en el código, no medido en pantalla)

- `app/estilos/alta-guia.css` pinta el control que sigue con `background-color: var(--color-papel)` y, detrás del bloque, un `hueso` al 55 % (`.hilo-luz::before`) con un aro de tinta.
- `app/estilos/vidrio/campos-y-botones.css` ya diseñó su propio «sigue aquí» (`--pozo-sigue-fondo` + `--pozo-sigue-anillo`), pero con menos especificidad y como `background:`: su degradado se dibuja encima del papel.

## Las caras

| | Cara | Qué hace | Cuesta |
|---|---|---|---|
| X | Como ahora | papel sólido + hueso + aro de tinta | — |
| A | Anillo de vidrio | el pozo a medias con el anillo pizarra que la receta ya traía | borrar dos reglas de `alta-guia.css` |
| B | Gota que sube | el campo se vuelve la gota y se despega 2 px | poco; se parece a un botón |
| C | Resplandor líquido | luz pizarra desenfocada detrás; el campo sigue hundido | un pseudo-elemento; tenue en claro |
| D | Filo de luz | borde de luz de 1,5 px con una pasada al llegar | un borde con máscara |
| E | Placa que se enciende | el bloque se vuelve una placa Serena chica | una placa por campo; compite con las notas |

Ninguna cambia qué campo se enciende, cuándo se mueve la luz ni lo que dice «Falta:». Solo tokens, sin rojo, una sola vez y sin rebote (ADR-0136).

## Falta antes de llevar la elegida al código

Medir contraste con `pnpm --filter web tema:auditar` en claro y oscuro; probar chips, interruptor y grupo de tres cajas (la maqueta solo trae caja y combo);
y pasar `lib/guia-de-foco.test.ts`. Sin cambios de código hasta que Felipe elija.
