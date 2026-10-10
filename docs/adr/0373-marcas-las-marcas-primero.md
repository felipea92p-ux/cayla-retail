# ADR-0373 — Catálogo ▸ Marcas: las marcas primero (resumen colapsado, predicción en la sombra, 24 por página)

- **Fecha:** 2026-10-10
- **Estado:** construido y verificado en local (`apps/web`; **solo web, sin migración y sin tocar producción**).
- **Número:** el 0372 queda para el PR #925 (caja), que hoy repite el 0371 de `main` y al arreglarse tomará el siguiente.
- **Pedido y decisiones de Felipe (2026-10-10), sobre una maqueta viva que él fue ajustando** (`docs/maquetas/marcas-2026-10/`, con su
  README, el prompt y las capturas de lo medido):
  1. **El resumen nace colapsado.** Probó abierto, colapsado y quitado; eligió colapsado.
  2. **El buscador predice, sin lista desplegable:** «si ya busca dentro de las marcas, la lista es innecesaria».
  3. **24 por página, movimiento normal, número de productos compacto.**
  4. **La hoja «Editar» queda como estaba** (la del sistema); la lista del proveedor flota fuera de ella.
  5. **Un «!» con el texto extenso junto al título,** como el de Productos.
- **Complementa:** ADR-0109 (marca y proveedor), ADR-0254 y ADR-0220 (la cabecera de Productos), ADR-0358 (una función, una pieza),
  ADR-0136 (movimiento), ADR-0185 (la página no se encoge), ADR-0336 (modo oscuro).

## Contexto

Con 89 marcas, la pantalla era una columna de tarjetas iguales, cada una con dos botones rojos («Desactivar» y «Eliminar», hasta 178 en
total; el rojo vale máximo 2 por pantalla), sin paginar, con un buscador que solo filtraba y con las desactivadas al final de la página,
donde nadie llegaba. La mayoría de las marcas dice «Sin productos todavía»: el estado importante (cuáles usamos, cuáles no se pueden
usar) no se veía sin leer cada tarjeta.

## Qué se decidió

DECIDÍ: **el estado se ve sin leer, lo peligroso se va a «Más ▾» con su motivo, la lista se pagina de a 24 y el buscador predice.**
- **Estado.** `estadoDeMarca` (`lib/marcas.ts`) da cuatro estados: `con`, `sin`, `sin-proveedor`, `desactivada`. Cada uno colorea el monograma de
  la tarjeta (verde = la usamos, hueso = nadie la ha usado, ámbar = no se puede usar, punteado = desactivada) y son las mismas cuatro cifras
  del resumen. **Un solo cálculo** (`resumenDeMarcas`) alimenta las píldoras y las tarjetas: nunca dos cuentas distintas.
- **Resumen colapsado.** Las cuatro cifras viven como píldoras con conteo (`pildora-cayla`) dentro de la tarjeta de la lista; «Resumen ▾» abre las
  `TarjetaCifra` que filtran (una función, una pieza). No recuerda si quedó abierto. Medido en la maqueta a 1440 px: de la cabecera a la primera
  marca hay 421 px abierto, 342 colapsado y 315 quitado; quitar ahorra solo 27 px más porque «Sin proveedor» vuelve como aviso.
- **Lo peligroso.** «Desactivar» y «Eliminar» pasan a `MenuAcciones` con `peligro`. Si no se puede, la opción sigue visible y **dice por qué**
  (`motivo`: «Tiene 2 productos activos: primero cámbialos de marca»), con datos que la pantalla ya tiene. Los candados reales no cambian:
  `fn_marcas_desactivar_candado` y `eliminar_marca`.
- **24 por página.** `MARCAS_POR_PAGINA = 24` se reparte exacto en 2, 3 y 4 columnas (una prueba lo exige: 20 no cabe en 3 columnas ni 30 en 4).
  Índice «Ir a» A–Z que lleva a la primera marca de la letra, y después de guardar o renombrar la lista te lleva a donde quedó la marca.
- **Predicción** (`ordenarPorPrediccion` y `prediccionDe`, puras y deterministas). Orden: igual > empieza con lo escrito > una palabra suya empieza
  así > lo contiene > la trae un proveedor con ese nombre; a igual puntaje, la marca con más productos. Si nada coincide, las parecidas a una
  letra (dos con 6 o más letras) con un aviso. La sombra completa solo la marca que EMPIEZA así. Tab o → la aceptan; Enter la acepta y va a esa marca.
- **`<Buscador>` gana la prop opt-in `sombra`.** Las demás pantallas no cambian.

DESCARTÉ: **una lista desplegable bajo el buscador (la primera versión de la maqueta)** porque repetía las tarjetas que ya se filtraban debajo y
tapaba la lista; y **quitar el resumen** porque ahorra 27 px y obliga a sacar «Sin proveedor» como un aviso, es decir, un KPI disfrazado.

SE ROMPE SI: **(a)** nadie abre nunca el resumen (entonces sobra y se quita, con datos); **(b)** una persona escribe un nombre de cuatro letras y la
sombra le completa otra marca que no buscaba: Tab no completa si no hay sombra, y Escape borra, pero un Enter apurado la acepta; **(c)** el
catálogo pasa de ~300 marcas y el índice A–Z ya no basta (haría falta buscar por proveedor o por categoría); **(d)** otra pantalla copia la sombra a mano
en vez de usar la prop de `<Buscador>`.

## Excepciones que conviene tener a la vista

- **«Busca mientras se escribe, nunca esperando un Enter» (ADR-0358):** aquí Enter acepta la sombra. Solo ocurre mientras hay una sombra a la vista.
- **Tab no sigue de largo** mientras hay una sombra. Sin sombra se comporta como siempre.
- **La cabecera de Marcas es la de Catálogo ▸ Productos por suposición.** El resto de Catálogo sigue «sin decidir» en CLAUDE.md; **Felipe no la ha
  confirmado**. Si prefiere otra, cambia solo `MarcasLista.tsx`.

## Lo que se midió

- **Contraste (WCAG, en claro y oscuro, resumen abierto y cerrado):** tres textos propios no llegaban a 4,5:1 en claro («La trae» 3,75, los conteos de
  las píldoras 2,5, «Ir a» 4,45) y se corrigieron. Quedan solo piezas compartidas que no se tocaron (el «/» del buscador 3,6 y los «…» de la paginación).
  **No se corrió `pnpm tema:auditar`**: necesita descargar Chromium de Playwright (~100 MB) y no se instaló sin permiso; se midió en el navegador del panel
  con el mismo criterio.
- **Movimiento:** solo ADR-0136 (sin rebote ni bucle). Se apaga con `prefers-reduced-motion`.
- **Celular (375 px):** sin desbordar; el buscador ocupa toda la fila.

## Lo que NO se hizo (y por qué)

- **`/formidable` y `/chaos` no se corrieron.** `/formidable` propone cambios y espera el OK de Felipe; `/chaos` ataca lo que guarda, y aquí **no se tocó ningún
  guardado** (editar, crear, desactivar y eliminar llaman lo mismo que antes), pero la regla pide correrlo antes de dar por terminada una pantalla que guarda.
- **No se tocó `NuevaMarcaForm` ni `EditarMarcaModal`.** La maqueta mostró «Nueva marca» como hoja solo para ensayar el «¿no será una que ya existe?»; hoy sigue en línea.
