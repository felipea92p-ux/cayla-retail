# Ficha al milímetro — la hoja de ofertas de una campaña (ADR-0677, actividades 7 y 8)

Se arma por partes, como se construye (`/construir`, 2026-11-18): cada actividad suma su sección. La cara: `docs/maquetas/campanas-simple-2026-11/`
(«Una sola hoja: el ejemplo es la opción»). Lo que guarda NO cambia: el estado de la oferta (`OfertaEnEdicion`), `problemasDeOferta` y
`/api/productos/campana-reglas` siguen siendo los de siempre; solo cambia cómo se ve.

## 7a · «Qué le das»: las cinco formas, y el ejemplo es la opción

| Pieza | Rama | Por qué |
|---|---|---|
| La fila de cinco (`.of-tipos` / `.of-tipo`) | **nueva**, con el vidrio claro y el ahumado denso de lo elegido | ninguna pieza del ERP dice «lo que da» en grande con una línea debajo y se elige; es hermana del cartel de oferta (`panel-de-campana.md`) |
| Los números de la elegida | **decididas, las de siempre:** `<PasoCantidad>`, `<CampoMonto>`, `pildora-cayla` | migrar cambia cómo se ve, nunca qué hace (ADR-0358) |

- **Medidas:** grilla `repeat(auto-fill, minmax(8.5rem, 1fr))` con 8 px de hueco; cada opción 12 × 14 px de relleno, radio 14 px, alto mínimo 76 px; el ejemplo en la serif a
  22 px (`text-wrap: balance`, el «%» pegado a su número con un espacio que no se corta); la línea a 14 px. La elegida en el ahumado denso con la letra crema; las demás en
  el vidrio claro, sin desenfoque (la hoja se desplaza, ADR-0623).
- **Texto (ley 8, «poco texto»):** salen la bajada «Elige lo que más se parezca…», los tres párrafos de ayuda (`.of-ayuda`), las píldoras «· pronto» y «Regalo» y
  «Club» (Felipe 2026-11-17). Lo que explicaban lo dice el ejemplo de cada opción.
- **Estados:** default, hover (solo con `(hover: hover)`, el borde a tinta 25 %), focus-visible (el anillo del sistema), elegida (`aria-pressed`, ahumado + letra crema: no
  depende solo del color, cambian fondo, borde y letra), quieto (sin transición). No hay apagadas: lo que no funciona no se muestra.
- **Pendiente para 7b:** a 375 px la pregunta vive en una columna de 204 px (la hoja de hoy pone la etiqueta al costado) y las opciones van de a una; la hoja de una sola
  columna lo resuelve.

## 7b · Una sola hoja

- **Lo que cambia:** las cuatro preguntas («¿Qué le das?», «¿En qué prendas?», «¿Cuándo y dónde?», «Revisa») van una debajo de la otra en `.of-una`; las tres de abajo
  aparecen en cuanto se elige qué le das. Sale la barra de pasos, «Siguiente», la flecha «paso anterior», el atajo «Listo, guardar con lo demás de fábrica» y las bajadas
  de cada pregunta. El pie es siempre el del final: «Falta: …» (lleva al campo, que ya está a la vista), «Cancelar», «Guardar como borrador» y «Activar».
- **Medidas:** cada bloque, separado del de arriba por 28 px, una línea `sand` y 24 px; su título en la serif a 22 px (20 en el celular), más chico que el de la hoja.
- **Al volver a empezar** (guardó, o se abre otra oferta) la hoja suelta la reserva de `<PaginaEstable>` y sube hasta «Nueva oferta» (ADR-0185): sin eso el pie fijo
  quedaba a media hoja con aire debajo (medido a 1440: pie a 264 px del borde de arriba en una hoja de 802).
- **375 px (arreglado aquí):** la pregunta se encogía a su contenido (204 px: `.of-cols` en columna heredaba `align-items: start`) y la grilla de categorías se salía
  23 px (`.of-panel` sin `minmax(0, 1fr)`, y la fila «Elegir todas · Quitar todas» sin `flex-wrap`). Medido después: 283 px de ancho útil, las opciones de a dos y 0
  elementos fuera de la hoja con cualquiera de las cinco formas.

## 7c · Una oferta se abre desde su cartel

- **Lo que cambia:** la hoja es de UNA oferta. «Nueva oferta» la abre vacía; tocar un cartel del panel de la campaña la abre editando esa oferta
  (`ofertaInicial`, con `key` por oferta: abrir otra empieza de cero). Sale la lista «Ya registradas» (con su desplegable bajo 1200 px), el
  aviso «Editando…» con «Registrar otra en vez de editar» y la franja de la campaña; queda solo el límite de tiendas de una campaña de antes,
  con «Quitar el límite». El título dice lo que hace («Nueva oferta» / «Editar la oferta») y la bajada, la campaña.
- **Guardar, activar o retirar cierran la hoja:** lo que quedó se ve en su cartel, detrás. Sin la lista adentro, volver a «Nueva oferta» tras
  guardar dejaba a la persona sin ver lo que acababa de guardar; por eso sale también el «volver a empezar» de 7b (y su `soltarPaginaEstable`).
- **Retirar** (oferta viva que se edita): `<Boton peso="peligro">` a la izquierda del pie, como todo lo que borra (`accion.eliminar`), con su
  «Sí, retirar · No, dejarla» en el mismo lugar. A 375 px baja a su propia fila, al final y a la izquierda: con los tres en fila, «Guardar
  cambios» caía solo a la tercera fila y quedaba lejos de «Cancelar».
- **El historial** que decía la lista («2 cambios · antes: …») pasa a «Revisa», bajo la frase, en taupe con su flecha (14 px).
- **Medidas:** la hoja baja de 78 a 70 rem (sin la columna de 15,5 rem de la lista); a 1440 la pregunta mide 716 px y las cinco formas de «Qué le
  das» caben en una fila (con 64 rem quedaban 4 + 1). Las preguntas van directo sobre la hoja: la caja crema que las rodeaba era un bloque
  sólido sobre el vidrio y, sin la lista al lado, no separaba nada.

## 8 · «En caja»: una compra de ejemplo, en vivo

- **Lo que es:** la columna de la derecha deja de ser la etiqueta de la campaña y pasa a ser **la caja**: una compra con prendas de verdad (las
  que la oferta alcanza), cobrada con la misma cuenta de Vender, que cambia con cada toque. Responde la única pregunta que la etiqueta no
  respondía: «¿cuánto paga el cliente?». Lo que decía la etiqueta ya está en otro lado: cuántas prendas alcanza (en «En qué prendas») y
  cuándo y dónde (la frase de «Revisa»).
- **La compra:** con un %, las 3 prendas más caras de modelos distintos, cada una con `descuentoDeCampana` (céntimos exactos, como la caja);
  con «llevar varias», las que pide el grupo (un 2 x 1 son 2, un 3 x 2 son 3) por `ejemploDeGrupo`, y cada una con lo que la caja le cobra: el
  ahorro del grupo se reparte entre sus prendas, así que ninguna dice «Gratis» como en la maqueta (sería otro ticket que el de la caja); con un
  monto, las que hacen falta para llegar al primer escalón por `ejemploDeMonto`, a su precio, y una línea «Desde S/ 300 · −S/ 30» (o
  «Falta S/ 40 para S/ 300»). La lógica es pura, en `lib/compra-de-ejemplo.ts`, con su prueba; el componente solo la dibuja.
- **Pieza:** **nueva**, sobre la placa Serena (`--placa-fondo`, `--placa-borde`, `--placa-luz`, radio `--radius-tarjeta`): explica, no se
  toca (ADR-0596: «lo que explica es plano»). Título en versalitas de 11 px (`.of-lbl`). Cada línea: `<MiniaturaPrenda>` de 36 px (la foto, o
  el ícono de su categoría sobre su color, ADR-0333), el nombre a 14 px cortado con «…», y a la derecha el precio tachado (14 px, tinta 68 %)
  sobre lo que paga (14 px, seminegrita). Línea punteada `sand` entre filas (decorativa). Abajo, «Paga» y el total en la
  serif a 32 px con cifras tabulares, y «Ahorra S/ X» en verde a 14 px.
- **Vacíos:** sin elegir qué le das, «Elige qué le das»; sin prendas alcanzadas, «Todavía no alcanza ninguna prenda». Los dos con
  `<Vacio tamano="chico">` (ADR-0358, `vacio`).
- **Lugar:** en escritorio, la columna de la derecha (19,5 rem desde 1280 px), pegada arriba mientras la hoja corre (`position: sticky`). En el
  celular, después de las preguntas: arriba empujaba «¿Qué le das?» medio alto de pantalla.
- **Movimiento:** ninguno propio. El total se lee en vivo (`aria-live="polite"` solo en el total, para que el lector no repita la lista).
- **Estados:** no tiene; no es un control.

## Después de Formidable (2026-11-18)

- **El pie con un choque:** «Puedes guardarla como borrador. Para activarla:» (6 palabras) antes de lo que pide, en la misma pieza (`FaltanDelPaso`,
  su `rotulo`). Una oferta activa que se edita sigue diciendo «Para guardar»: ahí sí bloquea.
- **«¿Retirar…?»:** el pie entero cambia (`.of-pie-confirma`): arriba `<AvisoNoSeDeshace>` a todo lo ancho (regla de lo peligroso, ADR-0358), la
  pregunta a 14 px con la oferta en seminegrita y «No, dejarla» (fantasma) · «Sí, retirar» (negro) a la derecha; a 375 px, la pregunta a todo lo
  ancho y los botones mitad y mitad. El foco pasa a «No, dejarla» con `preventScroll`: con `autoFocus` la hoja saltaba hasta abajo para mostrar
  el pie fijo (ADR-0185).


## Por fases y en grande (2026-11-18, Felipe: «las cosas muy pequeñas no funcionan»)

Reemplaza la sección «7b · Una sola hoja» (ADR-0677, actualización 2026-11-18 b). Lo que guarda no cambia.

| Pieza | Medida | De dónde sale |
|---|---|---|
| Barra de fases (`.of-fases` / `.of-fase`) | píldoras de 44 px, letra 15 px/600, el número en un círculo de 28 px; 8 px entre ellas, 24 px bajo la barra | **nueva**; la de ahora, ahumado denso (como la forma elegida); lista, ✓ sobre verde |
| Pregunta de la fase (`.of-q h2`) | serif 30 px (24 en el celular); recibe el foco al llegar, sin anillo | la del sistema, más grande |
| Las cinco formas (`.of-tipo`) | alto mínimo 104 px (88 en el celular), relleno 16 px, ejemplo serif 26 px, línea 15 px | 7a, agrandada |
| Los números («Lleva [3] y paga [2]») | `<PasoCantidad tamano="grande">`: 68 px, número serif 36 px, − y + de 44 px; 168 px de ancho (200 con «%»); las palabras, serif 28 px (24 en el celular) | pieza decidida (`cantidad`), su tamaño «grande» |
| Monto de «N por S/» | caja de 68 px, cifra serif 36 px | `<CampoMonto>` agrandado solo aquí (sin capa: le gana a `text-2xl`) |
| Escalones de un monto | frase serif 22 px, cajas de 56 px con la cifra a 28 px | ídem |
| La línea «qué hace» (`.of-dice`) | 17 px, tinta, 16 px bajo los números | `loQueHace` (lógica pura) |
| Nombre de cada control (`.of-lbl`, `.campo-etiqueta` dentro de la hoja) | 16 px/600, letra normal | antes versalitas de 11 px |
| Opciones (`pildora-cayla` en `.of-opciones`) | 44 px, 15 px, 10 px entre ellas | pieza decidida, agrandada aquí |
| Días (`.of-dia`) | 56 × 44 px, 15 px (44 × 44 y 14 px en el celular), borde `borde-control` | agrandada |
| Segmento «Cómo las eliges» | opciones de 38 px (pozo de 44), 13 px | `SegmentoDeslizante forma="modo"`, agrandado aquí |
| Categorías (`CategoriasDeCampana`) | familia y categoría de 44 px, 15 px; columnas de 240 px mínimo | pieza de la hoja de campaña, agrandada aquí |
| Pie | botones de 44 px a 15 px; flecha «fase anterior» (34 px, su lugar se guarda en la primera fase) | `accion.anterior` (ADR-0358) |
| Alto de la hoja | `.of-cols` mínimo 432 px desde 768: el pie no salta entre fases | — |

- **Texto (regla «Poco texto»):** cada fase es una pregunta; cada control, su nombre; la única frase nueva es la línea «qué hace» (una, de 12 palabras
  o menos, vigilada por su prueba). «Falta: …» solo dice lo de la fase actual o de las anteriores.
- **Celular (375 px):** las fases que no son la actual muestran solo su número; cada palabra baja con su número (`.of-par`: «Lleva [3]» / «y paga [2]»);
  0 elementos fuera de la hoja.
- **Movimiento:** la fase que llega sube 6 px una vez (300 ms, `--ease-cayla`); quieto con las animaciones apagadas o `prefers-reduced-motion`.
- **Estados de una fase:** por contestar (número), aquí estás (`aria-current="step"`), lista (✓, solo si se visitó y quedó sin pendientes), apagada
  (`aria-disabled`, hasta elegir qué le das).

### Al centro y con relieve (mismo día, tras probarla Felipe: «muy plano», «todo más centrado»)

| Pieza | Medida | De dónde sale |
|---|---|---|
| La hoja | 62 rem (antes 70) | sin la columna de «En caja» a la derecha |
| La columna (`.of-cols`) | 54 rem, al centro; alto mínimo 432 px desde 768 | — |
| Barra de fases | centrada; un hilo de 24 × 1 px (`borde-control`) entre fase y fase. En el celular, cuatro círculos en una fila (el nombre queda para el lector) | — |
| Las cinco formas | cinco columnas iguales desde 768; el ejemplo y su línea, centrados. En el celular de a dos y la quinta a todo lo ancho | 7a |
| El escenario (`.of-escena`) | placa del **vidrio claro** (borde, fondo y sombra de `--vidrio-claro-*`), radio 22 px (`--radius-tarjeta`), relleno 32 px (20 × 16 en el celular); grupos centrados con 24 px entre ellos y una línea `sand` arriba de cada uno | receta existente; lo hundido adentro (los números, las fechas) es el pozo de siempre |
| La línea «qué hace» (`.of-dice`) | serif 22 px (19 en el celular), centrada, `text-wrap: balance` | — |
| «En caja» (`.of-caja`) | al pie del escenario, tras una línea punteada (`borde-control`); su contenido en 26 rem al centro | actividad 8, reubicada: sale en «Qué le das» y en «Revisar» |
| La frase de «Revisar» (`.of-oracion`) | serif 26 px (22 en el celular), centrada | — |
| Pie en el celular | dos filas: arriba «Guardar como borrador» (o «Guardar cambios») a todo lo ancho; abajo la flecha, «Cancelar» y el principal, que toma lo que sobra | — |

- Las listas (categorías, prendas, avisos, el nombre) siguen alineadas a la izquierda dentro del escenario: centrar una lista la vuelve más difícil de recorrer.

### La hoja no cambia de tamaño (mismo día: el pie flotaba sobre los números al pasar a una forma más baja)

| Pieza | Medida | De dónde sale |
|---|---|---|
| Alto de la hoja (desde 640 px) | `min(54rem, 100dvh − 8vh − 1,5rem)`, fijo: no depende del contenido ni del pie | `<Modal altoFijo>` |
| Lo que se desliza | solo `.of-cols` (toma lo que sobra, mínimo 128 px), de borde a borde de la hoja, con el lugar de la barra reservado a los dos lados (`scrollbar-gutter: stable both-edges`) y `data-sin-reserva` | — |
| Pie | siempre al fondo de la hoja; si pasa a dos renglones, cede el contenido, no crece la hoja | `pie-hoja-fijo` |
| Celular (bajo 640) | la hoja entera se desliza, mide siempre su alto máximo (`min-height: 90dvh − 11rem` en su contenido) y lleva `data-sin-reserva` | — |
| Fases | miran su caja: los cuatro nombres desde 46 rem; solo el de ahora hasta 26 rem; cuatro números debajo. Siempre una fila | `@container of-fases` |
| Las cinco formas | miran su caja: 5 en fila desde 40 rem (el ejemplo, `clamp(20px, 3,6cqi, 26px)`); 3 + 2 hasta 26 rem; 2 + 2 + 1 debajo | `@container of-tipos` |
| Segmento «Cómo las eliges» (bajo 640) | sus tres opciones se reparten el ancho | — |
| Pantalla baja (≤ 800 px de alto) | fases 40 px, pregunta 24 px, formas 80 px, escenario con 20 × 24 de relleno | — |

Medido en 375×812, 700×900, 824×990, 1024×768 y 1280×600: mismo alto de hoja en todos los estados de cada tamaño, pie al fondo, 0 elementos fuera.

### Fase 2 · «¿En qué prendas?»: primero leer la prenda (mismo día)

| Pieza | Medida | De dónde sale |
|---|---|---|
| Buscador «Agrega una prenda» | `<Buscador tamano="mostrador" icono="barras">`, hasta 42 rem; a su lado «Con la cámara», `<Boton peso="primario">` de 52 px con el ícono de 20 px. En el celular, uno sobre otro a todo lo ancho | piezas decididas (`buscador`, `boton`) |
| Sugerencias | `<ListaSugerencias enLinea>`: miniatura de la prenda, nombre, categoría · colores, precio o «Ya está» | pieza decidida |
| Qué pasó con la última lectura (`.of-leida`) | un renglón de 24 px siempre reservado, 15 px/600; verde con ✓ o ámbar | — |
| Mosaico de prendas (`.of-mosaico` / `.of-ficha`) | grilla `auto-fill, minmax(216px, 1fr)` con 8 px de hueco (tres por fila en la columna de 54 rem; una por fila bajo 640); cada ficha de 56 px (48 en el celular) sobre el vidrio claro con borde de control y radio 14 px; miniatura chica, nombre a 15 px/600 y dato a 14 px en taupe. La recién agregada, filo verde de 3 px; la marcada, borde de tinta y ✓ sobre su foto. Seis a la vista; con «Ver las N», alto máximo 244 px y se desliza por dentro | **nueva** (reemplaza a la lista de una por fila: «si son varias se hará enorme») |
| ✕ de una ficha (`.of-ficha-quitar`) | 44 × 44 px; al pasar el mouse, rojo profundo sobre un fondo al 10 % | **nueva** |
| «Quitar N marcadas» / «Quitar todas» | `btn-cayla btn-secundario` de 44 px en la cabecera del mosaico; «Desmarcar», `btn-enlace` | piezas decididas |
| «Deshacer» recién agregada | `<BotonDeshacer>` junto al aviso verde | pieza decidida |
| Categorías · Insignias (`.of-grupo`) | dos tarjetas lado a lado (`auto-fit, minmax(240px, 1fr)`), de 72 px, que se tocan enteras: vidrio claro con su sombra y borde de control, radio 16 px; ícono de 20 px en un cuadro de 44 px sobre el ahumado denso; nombre a 17 px/600 y resumen en una línea a 14 px; a la derecha «Elegir» / «Cambiar» / «Listo» en una píldora con borde. Abierta: borde de tinta | **nueva** |
| Total (`.of-alcance`) | una línea a 16 px/600 al pie de la fase | — |
| Categorías | tarjeta por familia (la placa, radio 16 px) con su nombre a 16 px/600; cada categoría, píldora de 44 px con casilla, nombre a 15 px y cuenta en taupe; marcada: borde de tinta y fondo hueso. Sin la barrita | `CategoriasDeCampana`, solo su aspecto y solo en esta hoja |
| «Elegir todas», «Quitar todas», «Otro escalón» | `btn-cayla btn-secundario` de 44 px con su ícono | pieza decidida; antes `btn-sutil` |

- **Orden:** agregar → lo que lleva → más formas (panel debajo, uno a la vez) → «¿Se pueden mezclar?» → Claurè.
- **Texto:** el buscador dice «Escanea o escribe el nombre» (cabe a 375 px). Sale la nota larga de «Prenda por prenda».
