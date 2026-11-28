# Auditoría al milímetro — El precio sugerido a la vista en Nuevo producto · 2026-11-28 · `claude/precio-sugerido-a-la-vista`

Medido en local (`:3110`, base local, cuenta del seed) con los medidores de `/milimetro` cargados por `fetch` desde
`apps/web/public/__medir` (borrados después): `/productos/nuevo`, paso 4 («Precio y cantidad»), una blusa de lino con costo S/ 32.00, a
1440 × 900 en claro y en oscuro (asentado) y a 375 × 812. `milimetro/medir.js` con `raiz = [data-guia="alta.precio-sugerido"]`; los demás
miden toda la pantalla y aquí se anota solo lo del cambio. La respuesta de la IA se vio con una respuesta de prueba en el navegador (sin
consulta paga).

Resumen: **1 grave arreglado · 0 medias · 0 leves** · lo heredado, anotado abajo.

## Lo que cambió

- **Precio sugerido** (`NuevoProductoForm.tsx`, tercera columna de «Costo y precio»): con el costo escrito y el precio vacío, la columna dice
  «Precio sugerido», el monto en la misma serif de 28 px que el margen, «Llega a tu objetivo de N %» y `<Boton peso="fantasma">` «Usar S/ …».
  Con el precio escrito vuelve a ser «Margen». Sin precio ni costo: «Con el costo, se calcula»; con costo y sin precio ya no lo dice.
- **La IA como segunda opinión** (`PropuestaDePrecio discreta`): se pide con `<Boton peso="discreto">` chico («Pedir otra opinión a la IA») y
  responde en una `nota-cayla` de una línea («Otra opinión, de la IA: S/ … · ganas N %»), el motivo y las parecidas a 14 px, y dos enlaces.
  Recibir sigue con la cara de siempre.

## Mediciones

| Medidor | Resultado |
|---|---|
| Estados (`milimetro`, raíz del bloque) | hover suelto 0 del bloque (2 globales de antes: `.barra-t`, `.parecidas-punto`); apagados 0; cargando que se pulsa 0; errores 0; etiquetas 0 |
| Color, claro | 87 textos, 2 fallan: los «—» tenues de la ficha de la derecha (`text-tinta/25`, fantasmas a propósito). Del cambio: 0 |
| Color, oscuro | 85 textos, 6 fallan, ninguno del cambio (chips del pie, marco, los «—» de la ficha) |
| Espacio | **Grave, arreglado:** «Usar S/ 89.90» y «Pedir otra» medían 21 px de alto (WCAG 2.5.8 pide 24). Ahora `min-h-6`: 24 px, 0 blancos bajo 24 |
| Tipografía | lectura bajo 14 px: ninguna del cambio (el detalle de la IA va a 14, `text-detalle`); cifras tabulares en los montos |
| Textos | sin fallas medibles |
| 375 px | la columna baja bajo el precio; sin desborde (`scrollWidth` 375) |
| Un clic no mueve la vista | «Usar» cambia el alto de la columna (134 → 114 px) por debajo; `scrollTop` igual antes y después |

## Heredado (no es de este cambio)

El relleno de 18 px de `nota-cayla` y el de 14 px de las secciones del alta (fuera de la escala de 4), los dos `:hover` globales y los textos
del pie y del marco que no llegan a 4.5:1 en oscuro.

## Lo que no se midió

El foco con el medidor (`{ foco: true }`): los dos botones nuevos son `<Boton>` y `btn-enlace`, que traen el anillo del sistema. La IA en
vivo (cuesta por consulta). `/formidable` de la pantalla entera.
