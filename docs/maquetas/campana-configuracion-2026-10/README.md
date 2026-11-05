# Maqueta · La hoja «Configuración» de una campaña (2026-10-23)

> **Estado: Felipe eligió la II · La etiqueta (2026-10-23), con tres cambios ya hechos en la maqueta (abajo).** Solo maqueta: no hay
> migración, ni código del ERP, ni cambio en producción. Nada se guarda.

## v2 · lo que Felipe pidió al elegir la II (2026-10-23)

1. **La etiqueta, a la derecha.** Como en la hoja «Prendas» (`etiqueta-prendas.css`): el formulario a la izquierda es lo único que
   corre, y a la derecha va una sola superficie hueso con la etiqueta arriba y el pie abajo, siempre a la vista. Las dos hojas de una
   campaña quedan iguales.
2. **«Cancelar» y «Guardar» alineados.** Van en una fila al pie del panel de la etiqueta: «Cancelar» a su medida y «Guardar» con el
   resto, como «Cancelar» y «Aplicar» en «Prendas». En el celular, mitades. (En la v1 «Cancelar» bajaba 12 px: heredaba por error el
   margen de las secciones, que usaban el mismo nombre de clase.)
3. **«Dónde rige», ordenado.** Las píldoras sueltas pasaron a una grilla de casillas: cada familia con su casilla de «toda la familia»
   (a medias si eliges algunas), su raya y su total; cada categoría en una fila con su casilla, su nombre, cuántas prendas trae y una
   barra a escala de la más grande, de la que más vende a la que menos. Tres columnas a lo ancho (dos en 1024 y en el celular); las
   familias chicas (Bisutería, Empaque, Belleza) comparten una fila; un buscador filtra sin tildes y avisa si no encuentra nada. Al
   marcar una, su casilla vuela a la etiqueta.

## v3 · el paso del descuento y los botones (2026-10-23)

1. **«Cuánto baja», centrado.** En la v2, las píldoras ocupaban dos filas, estiraban − y +, y la caja del número (56 px) quedaba
   pegada arriba con aire debajo. Ahora es UNA caja de 60 px con − y + adentro y el número al centro, como la pieza del ERP para
   cantidades (`PasoCantidad`, ADR-0358). El ancho del número sigue a lo escrito («10 %», «12,5 %») para quedar siempre al centro, y
   el número y el % comparten su línea base (medido en el navegador: − y + a 8 px arriba y abajo, el número a la misma distancia de
   cada lado). Con el cursor adentro la caja sube a papel con su hilo; − se apaga en 0 y las dos se apagan para un rol sin descuento.
   Las píldoras de siempre van en su propia fila, debajo.
2. **«Cancelar» y «Guardar», iguales.** Los dos miden lo mismo (mitad y mitad, 40 px de alto), con «Guardar» como el principal.

## v4 · «Cuánto baja» sin espacio libre (2026-10-23)

Con las píldoras en su propia fila, la caja quedaba sola a la izquierda y sobraba todo el ancho de su derecha. Ahora los descuentos de
siempre van **al lado de la caja**, en una grilla de dos filas (Sin descuento · 10 · 15 / 20 · 25 · 30 · 50) que llena el ancho que
queda y mide **lo mismo que la caja: 68 px**, con opciones de 32 px (el objetivo del ERP con mouse). Entra en una fila a 1024 y a
1440 px, y el bloque bajó de ~230 a ~170 px de alto. En el celular la grilla baja entera bajo la caja, con opciones de 44 px para el dedo.

Felipe pidió (2026-10-23): **«mejora el modal de configurar campañas; 3 maquetas nuevas, elegantes, sofisticadas y con full
animaciones»**. Hoy la hoja es `CampanaModal` (`apps/web/components/EtiquetasLista.tsx`): descuento, fechas y categorías, guardados
juntos por `actualizar_campana_etiqueta`. La abren Catálogo ▸ Insignias y Tienda web ▸ Campañas.

Abrir `index.html` con doble clic (no necesita servidor). La barra negra de arriba no es parte del diseño: elige la dirección, el caso
(Configurar · Repetir en 2027 · Rol sin descuento), el tema y el ancho (1024 · 1440 · 1920 · celular). «↻ Ver la entrada otra vez»
repite la coreografía de entrada. Todo se puede tocar: elegir categorías, mover el descuento, cambiar fechas, escribir un % mal,
guardar (con su «Guardando…» y el aviso de después) y cancelar. En el fondo, «Configurar» de la tarjeta vuelve a abrir la hoja.

**Datos:** las categorías y sus conteos son los de producción (la captura de Felipe). Las prendas de ejemplo, sus precios y lo que
cuestan salen de la base local, que es inventada; cuántas prendas quedan bajo el costo es una estimación de la maqueta por familia.

## Lo que la hoja de hoy no dice (y las tres resuelven)

1. **Que la campaña no llega a ninguna prenda.** «Aniversario CAYLA» rige hoy con 10 % y ninguna categoría: en caja no baja nada.
   Hoy eso es una línea gris; en las tres es el veredicto de arriba («Baja 10 % del 1 al 25 de octubre, **pero hoy no llega a ninguna
   prenda**») y una cifra grande que cuenta.
2. **A qué precio queda una prenda.** Las tres muestran una prenda real de lo elegido, con el precio viejo tachado y el nuevo.
3. **Cuánto dura y dónde está hoy.** Un calendario o una línea de la temporada con el día de hoy marcado y «termina en 2 días».

## Las tres direcciones

| | La idea | Cuánto baja | Cuándo rige | Dónde rige | Lo que se mueve |
|---|---|---|---|---|---|
| **I · Tríptico** | Un folleto de tres paneles | El número enorme que rueda, una regla que se arrastra (0–60 %), las píldoras de siempre y «o escribe otro» | Dos tarjetas Desde → Hasta y un calendario de rango: el primer toque elige el inicio y el segundo el fin | Píldoras por familia, con «toda la familia» de un toque y un buscador; abajo, cuántas prendas y de qué familia (barra apilada) | Los paneles se despliegan de izquierda a derecha, los filetes se dibujan, la franja del calendario se pinta día por día, el visto de cada píldora se dibuja. «Cuánto» y «Cuándo» acompañan el scroll mientras recorres las categorías |
| **II · La etiqueta** | La misma etiqueta colgada de la hoja «Prendas» (`EtiquetaColgada`), viva | Un paso − / + de 5 en 5, con su caja y las píldoras | Dos campos que abren un calendario flotante, y debajo la línea de la temporada con «hoy» | Píldoras por familia con «Todas» | El hilo se dibuja, la etiqueta baja y se asienta, el −10 % rueda al cambiar; **cada categoría que eliges vuela a su mosaico** y la etiqueta se asienta; al guardar, un sello «✓ Guardada» se estampa en ella |
| **III · La frase y el mapa** | La campaña dicha en una frase | «Baja **10 %** …»: se toca el 10 % y se abre la regla debajo | «… **del 1 al 25 de octubre** …»: se toca y se abren dos meses | «… en **Camisas y Blusas y Vestidos**.»: un mapa de categorías del tamaño de lo que venden (crece con la raíz de las prendas, para que las chicas se puedan tocar); al elegir, la tinta se derrama desde donde tocaste | Las palabras de la frase suben en cascada, la temporada se dibuja de lado a lado, los rectángulos del mapa entran del más grande al más chico; al pasar por una familia se apagan las demás |

**Lo que comparten:** el veredicto en una línea, la guía de foco (✓ hecho · «Sigue aquí» · opcional, con su círculo que gira · «Corrige»),
el aviso ámbar si el descuento deja prendas bajo su costo (se puede guardar igual, como hoy), «Repetir en 2027» con «Correr al jueves»,
el rol sin descuento (el % se ve pero no se toca: «solo líder»), «Guardando…» con su hilo, y el aviso de después con «Imprimir sus
etiquetas» cuando el precio de hoy cambió (ADR-0180). En el celular la hoja llega desde abajo con su asa; en II la etiqueta se vuelve
una franja fija arriba y en III el mapa se vuelve una lista con barras.

**Movimiento:** una sola vez, sin rebote (ninguna curva se pasa de 1). Los únicos bucles son dos que ya son señal aprobada: el círculo
punteado de un campo opcional y el hilo de «Guardando…». Con `prefers-reduced-motion` todo queda quieto.

## Lo que queda por decidir (Felipe)

1. ~~**Qué dirección**~~ **Decidido (2026-10-23): la II**, con la etiqueta a la derecha (ver «v2»). La tabla de arriba describe la v1.
2. **El movimiento rico en esta hoja** necesita su actualización de ADR-0136, como la tuvieron la vista rápida, Insignias y Tienda web:
   «Configurar campaña: ricas, una vez, sin bucle».
3. **El ancho:** la II mide 1100 px (las tres miden 1060–1120 px), más que la hoja «ancha» (768). Sería un `ancho` a medida con su `unificar-fijo`
   (ADR-0358 lo permite para una hoja de diseño propio).
4. **«Sugerido» en Dónde rige** cuando hay descuento y la campaña no llega a ninguna prenda. La guía no bloquea nada (las categorías
   siguen siendo opcionales), pero qué cuenta como «sugerido» es una decisión de negocio tuya (ADR-0284).

## Lo que decido yo al construirla

- Se rehace solo `CampanaModal` y lo que dibuja; guarda por la misma ruta (`PATCH /api/productos/etiquetas`), con las mismas reglas
  (`parsearDescuento`, `campanaValida`, `prendasBajoCosto`, `alcanceCampana`, `prendasQueCambianDePrecioHoy`): sin migración.
- La prenda de ejemplo sale de `prendasConCosto`, que la hoja ya recibe (sin ir a la base).
- Guía de foco, guía interactiva (`atributos.campana-form`), huella de controles, `/sugerir`, modo oscuro y 375 px se ponen al día en
  el mismo PR.
