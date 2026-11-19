# Auditoría al milímetro — los pies pegados que eran a mano (Apartados y «Prendas parecidas») · 2026-11-18 · `claude/elegant-bose-26f256` (sobre 5619f8f38)

Medido: 1440×900 claro quieto y vivo · 1440×900 oscuro · 375×812 claro con puntero táctil. Servidor: `localhost:3010` contra la base local, cuenta Admin en
Tienda Lima. Piezas, las dos ya con `pie-hoja-fijo`: el pie de «Apartado registrado» (`components/apartados/ModalesApartado.tsx`, abierto con datos
inventados desde una página temporal que no se subió: la hoja solo sale después de guardar) y el de «Prendas parecidas»
(`components/alta-producto/HojaParecidas.tsx`, Nuevo producto ▸ Jeans ▸ CAYLA ▸ «Ver y comparar»). Medidores, con
`window.__milimetro = { raiz: "<hoja> .pie-hoja-fijo" }`: estados (`milimetro`, también con `{ foco: true }` tras un Tab real), `espacio`, `color` y
`movimiento` (`__mov.grabar` alrededor del clic que acorta la hoja).
Alcance: lo que cambió al pasar los dos pies a la clase del sistema (dónde quedan, su fondo, su relleno). Letra y textos no cambiaron: `tipografia`,
`textos` y `graficos` no se corrieron.

Resumen: **0 graves · 0 medias · 1 leve heredada** · los dos pies quedan en el borde de abajo de su hoja con la reserva puesta (antes, 82 y 212 px arriba) y ya no quedan 4 px cortos en la hoja de vidrio.

## Lo que se midió

| Pieza y vista | Pie | Borde de abajo | Encima del contenido | Estados | Espacio | Color | Movimiento |
|---|---|---|---|---|---|---|---|
| Apartado registrado · 1440×900 claro, 78 px reservados | 714,7..874,9 | 875 | 0 px | sin hallazgos; 3 controles con anillo de foco (2 px, 15,97:1), ninguno tapado | 0 blancos bajo 24 px, 0 fuera de escala | 0 textos y 0 controles bajo su mínimo | vivo: 0 animaciones del pie ni del relleno; el fondo del pie en 874,9 los 6 cuadros siguientes al clic |
| Apartado registrado · 1440×900 oscuro | 714,7..874,9 | 875 | 0 px | sin hallazgos | — | 0 en el pie (ver «Heredado») | — |
| Apartado registrado · 375×812 claro, dedo | 646,8..811 | 811 | 0 px | sin hallazgos | 0 blancos bajo 44 px (los tres botones: 44 de alto) | — | — |
| Prendas parecidas · 1440×900 claro, 208 px reservados | 794..875 | 875 | 0 px | sin hallazgos; el botón con su anillo; el último botón de la lista enfocado queda 20 px sobre el pie, sin taparse | 0 blancos bajo 24 px | 0 textos y 0 controles bajo su mínimo | vivo: 0 animaciones del pie; su fondo en 875 los 8 cuadros siguientes al clic |
| Prendas parecidas · 1440×900 oscuro | 794..875 | 875 | 0 px | sin hallazgos | — | 0 | — |
| Prendas parecidas · 375×812 claro, dedo | 699..811 | 811 | — (ahí no reserva) | sin hallazgos | 0 blancos bajo 44 px (el botón: 313×44) | — | — |

## Leves

1. El hueco entre las filas del pie de «Prendas parecidas» es de 10 px (`gap: 10px 16px` en `.parecidas-hoja-pie`, `app/estilos/alta-parecidas.css`), un
   medio paso fuera de un control — medido 10 px — regla: escala de 4 px — `[Práctica]` — ya estaba, no lo trajo este cambio — va a `/espacio`.

## Decidido a propósito

- **El fondo de los dos pies pasa a ser el vidrio del pie del sistema** (`--vidrio-pie-fondo` con su desenfoque; en oscuro, el mismo token). Antes eran
  un bloque sólido (crema en Apartados, papel en parecidas) sobre la hoja de vidrio. Es la pieza decidida (ADR-0596); la línea de arriba se conserva.
- **El pie de «Prendas parecidas» crece 8 px bajo 640 y 12 px desde 640** (relleno de abajo: de 16 px al del sistema, 24 o 28): con el relleno propio
  quedaba 4 px corto del borde de la hoja de vidrio.
- **Las animaciones que el medidor de movimiento lista** son de la pantalla de atrás (los puntos de Nuevo producto, el aviso de cierre de caja), todas
  excepciones de ADR-0136; ninguna es de las hojas.

## Heredado, fuera de la pieza

- En oscuro el medidor de color marca «NOV» (la hoja del calendario de «Apartado registrado», `p.bg-rojo`) a 1,12:1. Es un falso positivo del medidor:
  leído a mano, `rgb(38, 36, 31)` sobre `rgb(232, 128, 106)` da 5,68:1. Va a `/color` (el medidor, no la pieza).
- Tres textos «no concluyentes» de «Apartado registrado» en claro («Tienda Lima · APT-LIM-9999», 3,7 a 4,73:1; «Recoger hasta» y «El aviso para
  escribirle…», 4,45 a 4,92:1), fuera del pie. Van a `/color`.
- En la pantalla de atrás (Nuevo producto): 14 px de relleno en `.hilo-fila-in` y una proximidad rota («Marca y proveedor»). No son de la hoja.
- «revisar» del medidor de estados: los mismos dos `:hover` de siempre (`.barra-t`, `.parecidas-punto`); `lib/hover-con-mouse.test.ts` pasa.

## Sin medir

- Safari y un iPhone real; una tablet de 640 a 1279 px con área segura abajo (el pie de parecidas la suma por dentro, sin probar en un aparato).
- El contraste de los textos de los pies sobre el vidrio con algo oscuro detrás: el medidor no mide el desenfoque; lo vigila `lib/vidrio-contraste.test.ts`.
- «Apartado entregado» pasó por la medida del pegado (1024 y 375, claro y oscuro), no por los cuatro medidores: es el mismo componente `Botones`.
- Con una reserva puesta, pasar la ventana por el corte de 640 px deja el pie 4 px arriba del borde hasta que la reserva se suelta (el relleno
  reservado se calculó con el de 28 px). Es de `<PaginaEstable>`, no de estos pies, y vale para todo `pie-hoja-fijo`.
