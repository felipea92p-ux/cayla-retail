# Auditoría de modales en celular (375 × 812)

Fecha: 2026-10-23 · rama `claude/mobile-modals-audit-1e4c5b` · ERP local, modo oscuro, táctil. **Para ver las capturas abre `index.html` de esta carpeta.**

- 206 pantallas y hojas abiertas, 112 hojas/listas/menús revisados a ojo (sin guardar nada).
- **8 fallas altas**, **6 medias**, 79 escenarios que no se pudieron abrir (quedan sin auditar).

## Por dónde empezar

1. Hallazgo 1: una regla global de 16 px en campos (quita el zoom del iPhone).
2. Hallazgo 2: pie de «Registrar pago», botón ilegible.
3. Hallazgos 3 y 4: Filtros y Colgar varias de Existencias.
4. Hallazgo 8: Caja ensancha la página a 459 px (decisión de Felipe: ¿Caja entra al celular obligatorio?).

## 1. Los campos de texto tienen letra de 13 a 15 px: el iPhone hace zoom al tocarlos

**ALTA** · transversal

- **Dónde:** Casi todas las hojas con campos (91 de las 206 pantallas medidas): Registrar gasto, Nueva proforma, Cambios, Devoluciones, Historial, buscadores…
- **Qué se ve:** Safari de iPhone amplía la pantalla sola al enfocar un campo con letra menor a 16 px y no vuelve a su tamaño al salir. La hoja queda cortada de un lado hasta que la persona pellizca para alejar. Es la causa más probable de «el modal no se ve bien» en un teléfono.
- **Causa:** Los campos usan `text-sm` (14 px), 13,5 px y 15 px, y heredan los 14 px de `.caja-campo`. Medido a 375 px en 205 pantallas: 324 de 343 campos miden menos de 16 px (194 a 14, 90 a 13,5, 25 a 15, 15 a 13). El `viewport` NO es parte del problema: Next ya emite `width=device-width, initial-scale=1`.
- **Arreglo:** Una regla sin capa en `app/estilos/campos-y-casillas.css`, bajo 640 px y en pantallas táctiles, que sube a 16 px los campos y deja los grandes a propósito. Evitar `maximum-scale=1`: bloquea el zoom de accesibilidad.
- **Estado:** ARREGLADO en esta rama: `@media (max-width: 639.98px), (pointer: coarse)` (también el teléfono girado) sube a 16 px los campos, sin tocar los grandes a propósito (montos de 36, 24 y 22 px, el conteo de 64 px), y deja el ejemplo (placeholder) en 14 px para que los topes de largo de ADR-0290 sigan valiendo. Medido a 375 px en las 96 pantallas con campos: 334 campos a 16 px, 0 por debajo de 16 (antes 324 de 343); ningún escenario empeora en desborde, textos pisados o botones cortados. En escritorio con mouse no cambia (13 a 15 px). El `viewport` no se declara en esta rama: `main` ya lo trae con `viewportFit: "cover"` (ADR-0479, actividad 9). No poner `maximumScale`: el zoom de la persona es accesibilidad. Sin probar en un iPhone real: el zoom es comportamiento de iOS.

## 2. Compras ▸ Por pagar ▸ «Registrar pago»: los dos botones del pie quedan aplastados

**ALTA** · escenario `porpagar.pagar`

- **Dónde:** Hoja «Pagar a proveedor» (Por pagar, y las que pagan desde una factura).
- **Qué se ve:** «Cancelar» se lee «ancel» y «Registrar pago de S/ 5,133.60» se lee «go de»: el botón que guarda queda ilegible y casi sin superficie para el dedo.
- **Causa:** `components/CompraDetallePanel.tsx:461-470`: la nota «Todo o nada…» (`flex-1 basis-48`) comparte la fila con los dos botones. En celular `app/estilos/pie-acciones.css` (bloque `@media (max-width: 639.98px)`) les da `flex: 1 1 0; min-width: 0`, así que la nota se queda con el ancho y los botones se encogen a 34 y ~60 px.
- **Arreglo:** Que la nota ocupe su propia línea en celular (`max-sm:basis-full`), como ya hacen `.pie-acciones-izq` y `.mr-auto` en ese mismo CSS (`flex-basis: 100%`). Revisar los demás pies de hoja que llevan una nota al lado de los botones.
- **Estado:** ARREGLADO en esta rama: la nota queda en su fila y «Cancelar» y «Registrar pago de S/ …» ocupan cada uno el ancho completo; el pie vuelve a sangrar hasta el borde. Mismo arreglo en «Pagar juntos» (`components/PagoJuntosModal.tsx`, que tenía el mismo pie). Clase nueva `pie-acciones-ancho` en `app/estilos/pie-acciones.css`. Medido a 375 px: los dos botones pasaron de 34 px a 325 px; en escritorio sigue en una fila.
- Captura: [`capturas/119-porpagar-pagar.marcado.jpg`](capturas/119-porpagar-pagar.marcado.jpg)
- Captura después del arreglo: [`capturas/despues-2-porpagar.pagar.abajo.jpg`](capturas/despues-2-porpagar.pagar.abajo.jpg)

## 3. Existencias ▸ Filtros: «Ver como» es más ancho que la hoja y «Por talla» se corta

**ALTA** · escenario `existencias.filtros`

- **Dónde:** Hoja «Filtros» (la de tu captura) y también al abrirla desde «Ver detalle».
- **Qué se ve:** «VER COMO: TARJETAS · TABLA · POR T…»: el tercer botón queda a medias y toda la hoja puede deslizarse de lado. El contenido mide 433 px dentro de una hoja de 375.
- **Causa:** `components/FiltrosExistencias.tsx:278`: el grupo es `flex h-9 shrink-0` sin permitir salto de línea; la etiqueta y los tres botones con texto suman más de los 327 px útiles.
- **Arreglo:** `flex-wrap`, `h-auto min-h-9` y la etiqueta «Ver como:» en su propia línea bajo 640 px (o botones solo con ícono). Nota: en este build la hoja abre a media altura (ADR-0479, por diseño) y lo de abajo —«Ordenar por», «Sonido»— queda bajo el pliegue hasta estirarla; tu captura parece de un build anterior a ese cambio (la hoja se ve completa).
- **Estado:** ARREGLADO en esta rama: el grupo puede partirse en dos líneas, los botones no parten su texto y, a 380 px o menos, quedan solo con texto. Medido de 320 a 430 px: la hoja ya no se desliza de lado (373 de 373 a 375 px; antes 433 de 373). En escritorio y 1024 px queda idéntico (403×36 en una línea).
- Captura: [`capturas/065-existencias-filtros.marcado.jpg`](capturas/065-existencias-filtros.marcado.jpg)
- Captura: [`capturas/066-existencias-detalle.marcado.jpg`](capturas/066-existencias-detalle.marcado.jpg)
- Captura después del arreglo: [`capturas/despues-3-existencias.filtros.jpg`](capturas/despues-3-existencias.filtros.jpg)

## 4. Existencias ▸ «Colgar varias»: la tabla de cantidades y el botón «Continuar →» se salen de la hoja

**ALTA** · escenario `existencias.acciones`

- **Dónde:** Hoja «Colgar varias · 2 colores · todas las tallas», paso «Cuántas de cada una».
- **Qué se ve:** Se ven las tallas S, M, L y el resto queda a la derecha, escondido; «Continuar →» queda cortado en el borde. La hoja entera se desliza de lado (contenido de 434 px en 375).
- **Causa:** Confirmado midiendo la cadena de contenedores: la tabla SÍ tenía su `overflow-auto`, pero la raíz de `components/existencias/FlujoTalla.tsx` (`flex min-h-0 flex-1 flex-col`) es hija de una grilla de una columna `auto` (`PanelTalla.tsx:722`) y no declaraba `min-w-0`: su ancho mínimo pasaba a ser el de la tabla (372 px) y todo el flujo medía 410 px en una hoja de 325. A 320 px, además, el encabezado «Colgar varias · 2 colores · todas las tallas» era otra grilla `auto` que no dejaba cortar su texto.
- **Arreglo:** `min-w-0` en la raíz del flujo y `grid-cols-1` en su encabezado.
- **Estado:** ARREGLADO en esta rama: la hoja ya no se desliza de lado (373 de 373 a 375 px; antes 434 de 373) y «Cancelar» y «Continuar →» se ven completos (141 px cada uno). La tabla scrollea dentro de su tarjeta (372 px de contenido en 287) con «Color» fija a la izquierda y llega hasta «Total». Medido de 320 a 430 px y a 1440 px (igual que antes). Mismo arreglo vale para «Subir varias» y los demás pasos del flujo.
- Captura: [`capturas/069-existencias-acciones.marcado.jpg`](capturas/069-existencias-acciones.marcado.jpg)
- Captura: [`capturas/069-existencias-acciones.abajo.jpg`](capturas/069-existencias-acciones.abajo.jpg)
- Captura después del arreglo: [`capturas/despues-4-colgar-g375-abajo.jpg`](capturas/despues-4-colgar-g375-abajo.jpg)

## 5. Análisis ▸ «Datos incompletos»: los tres anillos se encima y sus títulos quedan cortados

**ALTA** · escenario `analisis.confianza`

- **Dónde:** Hoja «Datos incompletos» (se abre desde la píldora de Análisis).
- **Qué se ve:** «Vendes con su prenda», «Piso cuadrado» y «Almacén contado» se pisan: el anillo de 100 % tapa su propia etiqueta y los otros dos quedan con medias palabras («Pi… adrado», «Alm… contado»). No es cosa del celular: pasa también en escritorio y en todos los sitios donde Análisis dibuja sus anillos.
- **Causa:** Choque de nombres de clase. La pieza única del anillo del sistema (`app/estilos/avance-anillo-copiar.css`, ADR-0358, ronda 13) define `.anillo > svg { position: absolute; inset: 0 }` para todo el ERP, y el anillo propio de Análisis (`components/analisis/piezas.tsx:117`, estilos en `app/estilos/analisis.css:300`) también se llama `anillo`: su SVG de 96 px pasó a flotar sobre su título y su botón (medido: la caja del anillo mide 79 px aunque su SVG mide 96).
- **Arreglo:** `.anillo svg{position:static;inset:auto;…}` en el CSS de Análisis, y filas centradas bajo 460 px de contenedor.
- **Estado:** ARREGLADO en esta rama: el SVG vuelve al flujo y cada anillo queda con su título, su dato y su botón debajo, sin pisarse, a 320, 375, 430 y 1440 px (en escritorio las posiciones son las mismas de antes de la regresión de diseño: tres en una fila). En el teléfono caben dos por fila, así que las filas se centran. Candado nuevo: `lib/analisis-anillo-colision.test.ts` (falla sin la regla). Los otros dos sitios donde Análisis dibuja sus anillos («El conteo coincidió» y el vacío de «Todavía no») no se pudieron fotografiar con los datos locales; usan el mismo componente y el mismo CSS.
- Captura: [`capturas/110-analisis-confianza.arriba.jpg`](capturas/110-analisis-confianza.arriba.jpg)
- Captura después del arreglo: [`capturas/despues-5-anillos-final-375.jpg`](capturas/despues-5-anillos-final-375.jpg)

## 6. Producción ▸ «Nueva factura de insumos»: la línea de la factura no cabe en una fila

**ALTA** · escenario `produccion.factura-nueva`

- **Dónde:** Hoja «Nueva factura de insumos», sección «Qué se compró · costo unitario sin IGV».
- **Qué se ve:** Cuatro controles en una sola fila: el combo dice «Otro c…», el texto «Qué se com…» está cortado y «Cant.» y «S/ c/u» son cajas minúsculas con la ✕ al lado.
- **Causa:** `components/ComprobanteProduccionForm.tsx:233`: cada línea es una grilla de cuatro columnas (`minmax(0,1fr) 5rem 5rem auto`) en una sola fila; en una hoja de 325 px útiles la descripción se quedaba con ~105 px. Medido a 375 px: la hoja mide 373 y la línea 325, pero el combo y el texto de la descripción quedaban en 105 px.
- **Arreglo:** Bajo 640 px la línea ocupa dos filas: la descripción a todo el ancho y debajo cantidad, costo y ✕, con una raya entre una línea y la siguiente.
- **Estado:** ARREGLADO en esta rama: a 375 px la descripción mide 325 px («Otro concepto (flete, maquila…)» y «Qué se compró» se leen completos), cantidad y costo miden 137 px cada uno y la ✕ queda al lado; sin controles cortados a 375 ni a 320 px. En escritorio la línea sigue en una sola fila, igual que antes (descripción, 88 px, 88 px y ✕).
- Captura: [`capturas/217-produccion-factura-nueva.abajo.jpg`](capturas/217-produccion-factura-nueva.abajo.jpg)
- Captura después del arreglo: [`capturas/despues-6-factura-final-375.jpg`](capturas/despues-6-factura-final-375.jpg)

## 7. Catálogo ▸ Productos: la barra flotante de acciones masivas deja el último botón fuera de la pantalla

**ALTA** · escenario `productos.tabla-seleccion`

- **Dónde:** Barra que aparece al marcar productos en la lista (no es una hoja, pero se comporta como una).
- **Qué se ve:** «Descontinuar · Reactivar · Etiquetas · Rótulo» ocupan todo el ancho y «Quitar la marca» (✕) queda cortada en el borde derecho: no se puede soltar la selección.
- **Causa:** `components/ProductosTabla.tsx:849` (`BarraMarcadas`): los cuatro botones traían `px-3` (12 px por lado) y `flex-1`, pero su ancho mínimo es el de su palabra (Descontinuar 71 px de texto). Medido a 375 px: la barra mide 351 px y su contenido 397; la ✕ quedaba en x=365..409, fuera de la pantalla de 375.
- **Arreglo:** `px-1` en los botones bajo `sm` (vuelve a `px-3` desde `sm`), cuenta de marcadas más angosta y `flex-wrap` bajo `sm` para que, en un teléfono de menos de ~340 px, la barra pase a dos filas en vez de salirse; la ✕ se va a la derecha (`ml-auto`).
- **Estado:** ARREGLADO en esta rama: a 360, 375, 390 y 430 px la barra cabe en una fila de 56 px con la ✕ dentro (contenido de 351 en 351 a 375 px; antes 397 en 351). A 320 px pasa a dos filas con la ✕ a la derecha. En escritorio no cambia (una fila de 595×56).
- Captura: [`capturas/041-productos-tabla-seleccion.marcado.jpg`](capturas/041-productos-tabla-seleccion.marcado.jpg)
- Captura después del arreglo: [`capturas/despues-7-barra-e375.jpg`](capturas/despues-7-barra-e375.jpg)

## 8. Caja: la página mide 459 px en un teléfono de 375 y el navegador la achica; sus hojas se ven cortadas

**ALTA** · escenario `caja.m-cerrar`

- **Dónde:** Pantalla Caja y las tres hojas que abre: «Registrar gasto», «Registrar ingreso» y «Cerrar caja».
- **Qué se ve:** Al abrir Caja el navegador reduce toda la página para que quepa (el ancho de la ventana pasa a 459 px). La barra de abajo «Vender · Gasto · Ingreso · Cerrar» queda bajo el borde de la pantalla y las hojas se ven recortadas a la derecha («Internet y ce…», «Continuar» sin su borde). Las capturas muestran lo que ve el navegador al 100 %.
- **Causa:** Cinco grillas de Caja (`components/CajaComparativa.tsx:257,261,265` y `components/CajaAbiertaPanel.tsx:429,441`) eran `grid gap-3 @[900px]:grid-cols-…`: bajo 900 px de contenedor su única columna era `auto`, y su ancho mínimo era el del contenido más ancho (las tarjetas «Dónde ganas y dónde pierdes» y «Movimientos del turno», de 443 px). Medido en `/caja`: `scrollWidth` 459 con la pantalla en 375; `/inventario` y `/vender` miden 375. El navegador achicaba toda la página para que cupiera.
- **Arreglo:** `grid-cols-1` (columna `minmax(0,1fr)`) en las cinco grillas; desde 900 px de contenedor siguen con sus columnas de siempre. Queda abierta la decisión de Felipe: CLAUDE.md dice que Caja sigue siendo de escritorio (¿entra al celular obligatorio, PL-105?).
- **Estado:** ARREGLADO en esta rama: a 320, 375 y 430 px la página mide lo que la pantalla (antes 459 en 375), todas las tarjetas caben, la barra «Vender · Gasto · Ingreso · Cerrar» queda dentro de la pantalla (termina en y=798 de 812) y las hojas «Registrar gasto», «Registrar ingreso» y «Cerrar caja» abren con un clic real y caben sin desborde (antes se abrían solo por el DOM y salían cortadas a la derecha). En escritorio y tablet las grillas conservan sus columnas (548/548, 674/421 y 619/476 a 1440 px).
- Captura: [`capturas/003-caja-m-cerrar.arriba.jpg`](capturas/003-caja-m-cerrar.arriba.jpg)
- Captura: [`capturas/001-caja-m-gasto.arriba.jpg`](capturas/001-caja-m-gasto.arriba.jpg)
- Captura: [`capturas/002-caja-m-ingreso.arriba.jpg`](capturas/002-caja-m-ingreso.arriba.jpg)
- Captura después del arreglo: [`capturas/despues-8-caja-tira-375.jpg`](capturas/despues-8-caja-tira-375.jpg)
- Captura después del arreglo: [`capturas/despues-8-caja-hojas-375.jpg`](capturas/despues-8-caja-hojas-375.jpg)

## 9. Análisis ▸ Ficha de una prenda: la tabla color × talla se corta a la derecha

**MEDIA** · escenario `analisis.ficha`

- **Dónde:** Hoja «Casaca Ximena» (ficha de Análisis).
- **Qué se ve:** La columna L aparece a medias («sin ver…», «queda…») y las demás tallas no se ven sin deslizar; nada avisa que hay más.
- **Causa:** `components/analisis/FichaPrenda.tsx:124` y `app/estilos/analisis.css`: la tabla (color + una columna por talla + «Vendiste») mide 423 px en una caja de 325 y se desliza dentro de `.m-tabla`, con celdas de 82 px mínimas y sin ninguna pista visual.
- **Arreglo:** Bajo 460 px de contenedor: celdas de 72 px, la columna del color fija a la izquierda y una sombra en el borde que se apaga al llegar al final (`background-attachment: local`, sin JavaScript).
- **Estado:** ARREGLADO en esta rama: a 375 px caben S, M y L completas («sin ventas / quedan 6» en dos líneas, como antes) y la columna «Vendiste» asoma con la sombra del borde. A 320 y 430 px se desliza con el color fijo; a 1440 px no cambia (sin scroll, columnas de 103 px).
- Captura: [`capturas/112-analisis-ficha.arriba.jpg`](capturas/112-analisis-ficha.arriba.jpg)
- Captura después del arreglo: [`capturas/despues-9-analisis.ficha-despues2.jpg`](capturas/despues-9-analisis.ficha-despues2.jpg)

## 10. Punto de Venta ▸ Ticket: el nombre de la prenda se parte en dos líneas por palabra

**MEDIA** · escenario `vender.m-ticket`

- **Dónde:** Hoja «Ticket actual» (Vender en celular).
- **Qué se ve:** «Blusa / Emma» y «Beige · Talla / M» ocupan dos líneas cada uno porque el stepper, el «%», el precio y la papelera se quedan con casi todo el ancho de la fila.
- **Causa:** El nombre comparte la fila con el stepper, el «%», el precio y la papelera, y queda en una columna de ~100 px (medido en la captura).
- **Arreglo:** Bajo `sm` la fila ocupa dos: arriba el nombre (a todo el ancho menos la papelera) y abajo la cantidad y el importe.
- **Estado:** ARREGLADO en esta rama: `components/punto-de-venta/LineaDelTicket.tsx`. «Blusa Emma» queda en una línea con su detalle («Beige · Talla M ● Stock: 20»), la papelera arriba a la derecha y cantidad e importe en la fila de abajo; sin desbordes a 320 y 430 px. Desde `sm` la fila no cambia. Se actualizó `components/PuntoDeVentaTicket.responsive.test.ts`, que exigía la clase exacta del bloque del nombre.
- Captura: [`capturas/009-vender-m-ticket.arriba.jpg`](capturas/009-vender-m-ticket.arriba.jpg)
- Captura después del arreglo: [`capturas/despues-10-vender.m-ticket-despues.jpg`](capturas/despues-10-vender.m-ticket-despues.jpg)

## 11. Bajar prendas al piso: en la lista de sugerencias se corta justo lo que distingue una prenda de otra

**MEDIA** · escenario `bajar.buscar`

- **Dónde:** Lista «Toca la prenda que tienes en la mano».
- **Qué se ve:** «Vestido Sofía · L · Azul…» y «Vestido Sofía · L · Neg…»: la talla y el color son lo único que cambia entre filas y es lo que se trunca.
- **Causa:** `components/BajarAlPisoForm.tsx:922`: el título de cada sugerencia era `nombreDePrenda(p)` («modelo · talla · color») en UNA línea `truncate`, con «Almacén 6» a la derecha.
- **Arreglo:** El modelo en la primera línea y «talla · color» en la segunda, con el código al final de esa línea (lo primero que se corta).
- **Estado:** ARREGLADO en esta rama: cada fila dice «Vestido Sofía» y debajo «L · Azul marino», completos, con el código recortado al final cuando no cabe. Se aceptó la huella de la guía «inventario.bajar» tras revisarla (la lista ya estaba explicada; solo cambió cómo el escáner identifica el botón).
- Captura: [`capturas/095-bajar-buscar.marcado.jpg`](capturas/095-bajar-buscar.marcado.jpg)
- Captura después del arreglo: [`capturas/despues-11-bajar.buscar-despues.jpg`](capturas/despues-11-bajar.buscar-despues.jpg)

## 12. Historial ▸ Detalle de la venta: letra muy chica y «Imprimir boleta A4» pegado al borde

**MEDIA** · escenario `historial.venta`

- **Dónde:** Hoja «Detalle de la venta».
- **Qué se ve:** El botón «Imprimir boleta A4» no cabe en media fila y su texto sale cortado (9 px de más). Corrección del informe: en esta hoja no hay texto por debajo de 11 px; la letra de 11 a 12 px es la densidad normal del sistema y no se tocó.
- **Causa:** `components/DetalleVentaModal.tsx:309`: «Imprimir ticket» e «Imprimir boleta A4» comparten fila con `flex-1` y `flex-wrap`, pero sin ancho mínimo: en 325 px cada uno recibe ~158 y el segundo necesita ~167.
- **Arreglo:** `min-w-[11rem]` en los dos botones: si no caben juntos se apilan, cada uno a todo el ancho.
- **Estado:** ARREGLADO en esta rama: a 375 y 320 px los dos botones se apilan (325 y 270 px de ancho) y el texto cabe; a 430 px van lado a lado con 185 px cada uno; en escritorio, en una fila. Sigue pendiente, y no es de esta hoja, que la × de cerrar de `<Modal>` mide 28 px (por debajo de 44 para el dedo): es de la hoja del celular de ADR-0479, de otra sesión.
- Captura: [`capturas/024-historial-venta.arriba.jpg`](capturas/024-historial-venta.arriba.jpg)
- Captura después del arreglo: [`capturas/despues-12-historial.venta-d375.jpg`](capturas/despues-12-historial.venta-d375.jpg)

## 13. Compras ▸ Orden de compra: los botones de acciones se reparten en cuatro filas desparejas

**MEDIA** · escenario `ordenes.ventana`

- **Dónde:** Hoja «OC-001298».
- **Qué se ve:** «Anular orden», «Imprimir la orden», «Gasto del viaje + Editar» y «Enviar a una sede» caen en filas de largos distintos y «Editar» queda suelto: se ve desordenado y cuesta saber cuál es el principal.
- **Causa:** `components/ordenes-compra/AccionesOrden.tsx` (`lugar=«pie»`): seis acciones de largos distintos en un `flex-wrap` dentro de otro `flex-wrap`.
- **Arreglo:** Bajo `sm`, una columna a todo el ancho: imprimir, gasto del viaje, editar, enviar y registrar (la principal, al final), y «Anular orden» aparte, debajo. La cabecera de la página completa (`lugar=«cabecera»`) no cambia.
- **Estado:** ARREGLADO en esta rama: a 320, 375 y 430 px las seis acciones quedan en columna a todo el ancho (325 px a 375); en escritorio y en la cabecera de la página, igual que antes.
- Captura: [`capturas/132-ordenes-ventana.arriba.jpg`](capturas/132-ordenes-ventana.arriba.jpg)
- Captura después del arreglo: [`capturas/despues-13-ordenes.ventana-d375b.jpg`](capturas/despues-13-ordenes.ventana-d375b.jpg)

## 14. Pestañas y filas de píldoras que se deslizan: el borde las corta sin avisar que hay más

**MEDIA** · transversal

- **Dónde:** Configuración (6 pestañas), Análisis, Finanzas ▸ Gastos y Reportes, Devoluciones, Marcas, Insignias, Historial, Movimientos y Vista rápida de producto.
- **Qué se ve:** La primera o la última pestaña queda a medias en el borde («…operaciones», «Sin ella 21», «C…»). Quien no sabe que se desliza no se entera de que existen más.
- **Causa:** Patrón común (`<Pestanas>`, `pildoras-desliza`, `pestanas-cayla`): scroll horizontal sin degradado de borde ni desplazamiento al activo.
- **Arreglo:** Es una pieza única del sistema (`/unificar`, ADR-0358): se arregla en un solo lugar para todas.
- **Estado:** ARREGLADO en esta rama, con la opción A que elegiste mirando la maqueta: la fila se desvanece 28 px del lado donde falta por ver y se apaga sola al llegar al final. `components/ui/FilasQueSeDeslizan.tsx` (montado una vez en `app/layout.tsx`) mide cada fila `.pestanas-cayla` o `.pildoras-desliza` y le pone `data-mas-izq` / `data-mas-der`; `app/estilos/pestanas-y-segmentos.css` dibuja la máscara; la regla pura es `lib/fila-desliza-reglas.ts` (con su prueba). Verificado en la app real a 320, 375, 430, 1024 y 1440 px, en claro y en oscuro: en escritorio no aparece nada, y las filas que caben enteras tampoco. Pendiente: probarlo en Safari de iPhone (el vidrio de las pestañas usa `backdrop-filter`; si Safari no lo combinara con la máscara, lo peor sería perder el desenfoque del vidrio, no las pestañas).
- Captura después del arreglo: [`capturas/despues-14-filas-aviso.jpg`](capturas/despues-14-filas-aviso.jpg)

## No se pudieron abrir

- **12** — Escenario de escritorio; en celular Vender tiene otro flujo (`vender.m-*`, que sí se auditó).
  `vender.ver-opciones-porque`, `vender.ver-opciones-en-ticket`, `vender.m-cobro-tarjeta-maquina`, `vender.ticket`, `vender.cobrar`, `vender.cobro-efectivo`, `vender.cobro-tarjeta`, `vender.cobro-yape`, `vender.cobro-dos-medios`, `vender.cobro-factura`, `vender.ver-opciones`, `vender.cobro-tarjeta-maquina`
- **56** — La base local no tiene el dato que el escenario necesita (no hay órdenes en el Taller, fondos, traslados por recibir, insumos o tarifas…) o el botón es de escritorio.
  `comprobantes.reintentar`, `existencias.ordenar`, `traslados.contar`, `traslados.pedido`, `traslados.guia`, `traslados.guia-a4`, `recibir.proveedor`, `recibir.prenda`, `regularizar.vendio`, `regularizar.hoja`, `ordenes.anular`, `fondos.devolver`, `fondos.pagar-deuda`, `fondos.anular`, `ordenes.rendir`, `proveedores.reposicion`, `ordenes.nos-debe`, `cierre.pendientes`, `clientas.ficha-historial`, `avisos.beneficios`, `avisos.cumpleanos`, `colaboradores.terminal`, `actividad.modulo`, `actividad.persona`, `etiquetas.previa`, `produccion.resumen-porque`, `produccion.insumo-ingresar`, `produccion.insumo-ficha`, `produccion.tarifa-nueva`, `produccion.tarifa-cambiar`, `produccion.eficiencia-mes`, `produccion.orden-pagina`, `produccion.orden-terminar`, `produccion.orden-salida`, `produccion.orden-vuelta`, `produccion.orden-anular`, `produccion.orden-tela-usada`, `produccion.orden-stock`, `produccion.orden-anular-orden`, `produccion.orden-marcar`, `produccion.orden-desmarcar`, `produccion.orden-cambiar-quien`, `oi.ventana`, `oi.anular`, `oi.recibir`, `traslados.qr-del-pase`, `inicio.obs-toda-cayla`, `rendimiento.mes`, `productos.filtro-categoria`, `productos.tabla-variantes`, `existencias.decidir`, `movimientos.calendario`, `traslados.reverso`, `regularizar.puente`, `porpagar.vencidas`, `inicio.ajustar`
- **5** — Nuevo producto es una pantalla por pasos, no una hoja.
  `nuevo.familia`, `nuevo.como-es`, `nuevo.tallas`, `nuevo.tallas-color`, `nuevo.precio`
- **2** — Es el lateral de escritorio; en celular es el menú de hamburguesa (`estructura.menu-celular`, auditado).
  `estructura.lateral-plegado`, `estructura.grupo`
- **4** — Caja ensancha la página: la barra «Gasto · Ingreso · Cerrar» queda fuera de pantalla (hallazgo 8). Las tres hojas se abrieron aparte.
  `caja.gasto`, `caja.deposito`, `caja.cerrar`, `caja.venta`

## Límites

- Chrome con emulación de teléfono, no Safari real.
- Las hojas de «Filtros» abren a media altura por diseño (ADR-0479).
- Las hojas de Caja se vieron con la página ensanchada; en un celular real se verían más chicas.
- Solo cuenta Admin (y Taller para Producción).