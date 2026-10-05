## 2026-10-05 (En Colaboradores ▸ Equipo, el rol con nombre largo ya no tapa «Último ingreso»)
Qué hice: la cuenta `lucia@cayla.local` tiene el rol «Prueba del tema: ventas y stock» y su chip se pintaba encima de «hoy 11:06», la columna
de al lado. La causa: el chip era `inline-flex whitespace-nowrap` dentro de una celda con `justify-self-start`; una celda que se ajusta a su
contenido toma el ancho del texto sin cortar y sobresale de su columna del grid. Ahora `PildoraRol` (`components/colaboradores/EquipoLista.tsx`)
es `inline-block max-w-full truncate` con el nombre completo en el `title`, y la celda de la lista es `flex min-w-0` (ocupa su columna en vez de
ajustarse al texto). El chip corto no cambia. Sin migración.
Por qué así: un texto solo se corta con «…» dentro de un bloque (por eso `inline-block` y no `inline-flex`), y para que `max-w-full` tenga contra
qué medirse la celda debe medir lo que mide su columna. `PildoraRol` la comparten la lista y la cabecera de las fichas de Colaborador y Terminal;
se midió también ahí (a 343 y 480 px de ancho de cajón): idéntica antes y después. A 375 px el chip largo además salía de la tarjeta y ensanchaba
la página; ya no.
Felipe se lleva: medido a 1440 px (chip de 222 px que terminaba en x=838 sobre una fecha que empieza en 806; ahora 176 px, termina en 792 y se lee
«Prueba del tema: vent…») y a 375 px (sobresalía 40 px de la tarjeta; ahora queda dentro). **La verificación fue en una maqueta aislada con el
Tailwind y los tokens del repo, y las mismas clases de la fila**, no en `/colaboradores` viva: este worktree no tenía `.env.local`, y mirar el de
otro worktree no se autorizó. Falta mirar la pantalla real con `lucia@cayla.local` (la prueba es la misma: que el chip no pase de su columna).
