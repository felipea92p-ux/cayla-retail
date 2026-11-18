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

