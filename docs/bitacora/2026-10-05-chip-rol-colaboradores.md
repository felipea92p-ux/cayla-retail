## 2026-10-05 (En Colaboradores ▸ Equipo, el rol con nombre largo ya no tapa «Último ingreso»)
Qué hice: la cuenta `lucia@cayla.local` tiene el rol «Prueba del tema: ventas y stock» y su chip se pintaba encima de «hoy 11:06», la columna
de al lado. La causa: el chip era `inline-flex whitespace-nowrap` dentro de una celda con `justify-self-start`; una celda que se ajusta a su
contenido toma el ancho del texto sin cortar y sobresale de su columna del grid. Ahora `PildoraRol` (`components/colaboradores/EquipoLista.tsx`)
es `inline-block max-w-full truncate` con el nombre completo en el `title`, y la celda de la lista es `flex min-w-0` (ocupa su columna en vez de
ajustarse al texto). El chip corto no cambia. Sin migración.
Por qué así: un texto solo se corta con «…» dentro de un bloque (por eso `inline-block` y no `inline-flex`), y para que `max-w-full` tenga contra
qué medirse la celda debe medir lo que mide su columna. `PildoraRol` la comparten la lista y la cabecera de las fichas de Colaborador y Terminal,
así que el cambio también las alcanza: la cabecera de la ficha era un chip de ancho natural dentro de una columna de texto más angosta.
Felipe se lleva: medido en la pantalla real (`/colaboradores`, base local, `lucia@cayla.local`). A 1440 px el chip de Lucía termina en x=935 (el
borde de su columna) y «hoy 11:06» empieza en 949; antes, en una maqueta con las mismas clases, medía 222 px, terminaba en 838 y tapaba la fecha
(empieza en 806). A 375 px todos los chips quedan dentro de la tarjeta, sin scroll horizontal (antes el largo sobresalía 40 px y ensanchaba la
página). Los chips cortos (Líder de equipo, Integrante, Terminal de ventas) quedan en la misma posición y con el mismo alto de fila. **Un efecto
que se nota en la ficha a 375 px:** el chip de Lucía mide 220 px y la columna de texto 202, así que ahora se lee «Prueba del tema: ventas y s…»
(antes sobresalía 18 px de su columna sin tapar nada, pero un rol más largo se habría salido del cajón); el nombre completo está en el `title`.
Con un cajón de 432 px (ventana de 557 px) el chip se ve entero.
