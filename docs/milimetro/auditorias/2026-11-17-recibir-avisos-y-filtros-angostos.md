# Auditoría al milímetro — `/recibir` con la columna angosta: los avisos de envío a medias y la barra de «Envíos por recibir» · 2026-11-17 · `claude/avisos-layout-mobile-29e4bb`

Medido: 375×812 claro y oscuro (táctil) · 700×812 (menú abierto, columna de 388 px) · 1024×812 (menú abierto, columna de 692 px) · 1280 y 1440 claro y oscuro (que no cambie) · foco con teclado · quieto.
Servidor: `localhost:3010` (base local, sede Lima). Con el navegador del repo (Playwright, la sesión de `tema/.sesion`): el panel de la app no componía capturas.

Resumen: **0 graves · 0 medias · 0 leves abiertas** · 2 medias corregidas (una propia, una que ya venía) · 3 heredados de piezas del sistema · 2 sin medir.

## Qué cambió

Lo decide el ancho de la **columna**, no el de la ventana. Dos cortes:

- **Bajo 768 px** (un celular, una tableta o un laptop de 1024 px con el menú abierto): «Sin aviso» deja el título y va al final de la fila de filtros, sin su
  pregunta, y el buscador ocupa su fila entera.
- **Bajo 640 px** (un celular, o una tableta con el menú abierto), además:
  1. El aviso de un envío a medias («ENV-000017: 12 de 29 ya en stock…») baja «Seguir recibiendo» debajo del texto.
  2. «Estado», «Proveedor» y «Fechas» son solo su ícono mientras no tienen nada puesto; con algo puesto vuelven a decir su valor con su ✕.

Los avisos de envío a medias van juntos, a 8 px (antes 24), en todo ancho. Desde 768 px de columna lo demás se ve como antes (medido a 1280 y 1440).

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Aviso a medias, columna de 343 px | 86 px de alto, texto en 2 renglones (281 px de ancho) y el enlace debajo. Antes: 5 renglones con ~130 px de ancho | — | pasa |
| Aviso a medias, columna de 388 px (700 con menú) | 86 px, 2 renglones (326 px) | — | pasa |
| Aviso a medias, columna de 692 y 1108 px | 46 px, 1 renglón, el enlace a la derecha (como antes) | — | no cambió |
| Título + barra, columna de 343 px | 184 px de alto. Antes 305 px (título 74 + «Sin aviso» 75 + barra 132 + huecos) | — | pasa |
| Barra, columna de 692 px (1024 con menú) | buscador de 692 px con su marcador entero; debajo «Estado», «Proveedor» y «Fechas» con su palabra y «Sin aviso» al final (x = 866–984). 94 px de alto contra 127 (la pregunta y el botón en fila propia + la barra) | marcador que cabe (ADR-0290, punto 4) | pasa |
| Barra con un filtro puesto, columna de 692 px | «Estado: Abierto», «Proveedor», «Fechas» y «Limpiar todo» en una fila; «Sin aviso» baja solo a la siguiente, a la derecha | — | pasa (ver «Decidido a propósito») |
| Título + barra, columna de 948 y 1108 px (1280 y 1440) | «Sin aviso» con su pregunta a la derecha del título; buscador y píldoras en una fila de 44 px | — | no cambió |
| Fila de filtros a 375 | tres círculos de 38 px con área de toque de 44 × 44 (bordes en x = 13–57, 59–103, 105–149: no se pisan) y «Sin aviso» de 118 × 44 | 44 px con el dedo (ADR-0611, mejora 5) | pasa |
| Con un filtro puesto a 375 | «Estado: Abierto ✕» (174 px) + dos íconos; debajo «Limpiar todo» y «Sin aviso»; sin scroll horizontal (`scrollWidth` 375) | — | pasa |
| Ícono de cada píldora contra su gota | claro 3,20 · 4,04 · 3,26 : 1 · oscuro 3,84 · 4,55 · 3,78 : 1 (por píxeles, a 3×) | 3:1, WCAG 1.4.11 `[Norma]` | pasa (justo en claro: ver «Heredado» 1) |
| Nombre accesible de las píldoras-ícono | `aria-label` «Estado», «Proveedor», «Fechas» (con valor: «Estado: Abierto») | WCAG 4.1.2 `[Norma]` | pasa |
| Estados (toda la pantalla, 375 y 1440) | 0 apagados, 0 ocupados que se pulsan, 0 elegidos solo por ARIA, 0 errores sin ligar, 0 bucles | `referencia/estados.md` | pasa |
| Foco con teclado a 375 | 17/17 controles con anillo, 0 flojos, 0 tapados | WCAG 2.4.7, 2.4.11 `[Norma]` | pasa |
| Espacio a 375 | 0 blancos bajo 24 px, 0 bajo 44 con el dedo, 0 grupos con la proximidad rota | WCAG 2.5.8 `[Norma]` | pasa |
| Letra a 375 | 0 lecturas bajo 14 px, 0 interlineados cortos | regla del repo (ADR-0358, ronda 19) | pasa |
| Texto, 375 y 1440 | 0 palabras prohibidas; nada nuevo cortado | CLAUDE.md «Vocabulario» | pasa |
| Movimiento | el cambio no agrega animaciones ni transiciones; 0 bucles | ADR-0136, ADR-0625 | pasa |
| Guía interactiva | `guias:recorrer --guia recibir` en verde a 1440×900, 1024×768 y 375×812 (13 pasos); a 1024 y 375 el paso de filtros enciende la barra con «Sin aviso» adentro | ADR-0389 | pasa |

## Corregido en esta pasada

1. **(Media) El corte miraba la ventana y no la columna.** La primera versión usaba `sm:` (640 px de ventana). A 700 px con el menú abierto la columna mide
   388 px y la pantalla seguía como en la captura de Felipe: aviso en 3 renglones, «Sin aviso» en dos filas, píldoras partidas. Ahora el grupo de avisos
   (`@container/rc-avisos`) y el título con su barra (`@container/barra-filtros`) miran su propio ancho, como ya hacen la tabla (`tabla-corte.css`) y las cifras de
   «Recibidas». Medido a 700: mismo acomodo que a 375. Regla del repo (CLAUDE.md «La tabla mira su ancho, no el de la ventana»).

2. **(Media, ya venía) A 1024 px con el menú abierto el bloque se desordenaba.** Con la columna en 692 px, «¿Llegó algo sin aviso?» y su botón caían a una fila
   propia, desalineados, y el marcador del buscador se cortaba en «…marca u order». Felipe pidió llevar ahí el mismo acomodo (2026-11-17): el corte del título y del
   buscador subió a 768 px de columna, donde el título y la acción ya no caben en una fila. Las píldoras conservan su palabra hasta los 640 px.

## Heredado (piezas del sistema; no lo trae este cambio)

1. **El ícono de la píldora solo-ícono pasa 3:1 por poco en claro** (3,20:1 «Estado», 3,26:1 «Fechas»): `.pildora-filtro-icono` va al 60 % sobre una letra al 82 %
   (`campos-y-casillas.css`). Cuando el ícono es lo único que nombra al control, conviene más aire. Propuesta, para `/unificar` (familia `filtro`): en la cara solo-ícono,
   el ícono al 80 %, que ya es su valor al pasar el mouse. Toca también «Ordenar» de Productos y de Existencias en el celular. `[Norma]` WCAG 1.4.11 (hoy se cumple).
2. **La lista de una píldora solo-ícono no dice su nombre al abrirse.** Tocar ◎ muestra «Abierto · Por abrir · No puedo abrir yo» sin el título «Estado» («Fechas» sí
   lo trae: su hoja se llama «Fecha de envío»). Propuesta para `/unificar`: el nombre del filtro en versalitas sobre la lista cuando la píldora es solo ícono.
   `[Práctica]` (lo que explica aparece donde se usa, CLAUDE.md «Poco texto a la vista»).
3. **`<Aviso>` con acción se aprieta en todo celular.** Es el tercer arreglo local de lo mismo (Plan del piso, la hoja de un gasto y este). Propuesta: que la pieza baje
   su acción sola cuando no le queda ancho. Va al backlog de la rama.

## Decidido a propósito

- Bajo 768 px de columna ya no se lee «¿Llegó algo sin aviso? Ábrelo aquí.»: el botón dice «Sin aviso» y la hoja que abre lo explica (CLAUDE.md «Poco texto a la vista»).
- Con un filtro puesto y la columna entre 640 y 768 px, «Limpiar todo» ocupa el lugar de «Sin aviso» y este baja solo a la fila siguiente. Es un estado de paso
  (dura lo que dura el filtro) y cada cosa sigue en su lado: lo que filtra a la izquierda, la acción a la derecha.

## Sin medir

- Los dos avisos de envío a medias con datos de la base: la base local no tiene ningún envío a medias. Se midieron con el mismo marcado que dibuja
  `<Aviso chico className="rc-aviso-a-medias">` y los textos de la captura de Felipe, puestos en la página por el guion de medición.
- Los medidores de estados, espacio, letra y texto no se repitieron a 1024 después de subir el corte: ahí solo cambian de lugar piezas que ya se midieron a 375 y 1440
  (se midió su geometría y se miró la captura, en claro y en oscuro).
- El medidor de color a 375 no pudo leer el texto en el navegador sin cabeza (lo dio todo por tapado); el contraste de texto a 375 lo cubre `tema:auditar`
  (0 hallazgos en claro y en oscuro) y el de los íconos se midió por píxeles.
