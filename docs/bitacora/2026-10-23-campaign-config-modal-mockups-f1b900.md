## 2026-10-23 (Configurar campaña: tres maquetas para elegir)
Qué hice: `docs/maquetas/campana-configuracion-2026-10/`, tres direcciones tocables de la hoja «Configuración» de una campaña (I · Tríptico,
II · La etiqueta, III · La frase y el mapa), con movimiento rico de una sola vez, en claro, oscuro, de 1024 a 1920 y a 375 px.
Por qué así: Felipe la pidió «elegante, sofisticada y con full animaciones»; la hoja de hoy no dice que «Aniversario CAYLA» rige con 10 % y no
llega a ninguna prenda, y las tres lo ponen arriba, con una prenda de ejemplo y su precio nuevo.
Qué se rompería sin esto: se elegiría por una descripción, y el 2026-10-06 eso ya salió mal (ADR-0358: Felipe elige mirando).
Cómo se verifica: abrir `index.html`; recorrido en el navegador (elegir categorías, % bajo costo, % mal escrito, Repetir en 2027, rol sin
descuento, guardar y su aviso) en los tres anchos, oscuro y celular. Sin código del ERP ni migración; falta que Felipe elija.

## 2026-10-23 (Configurar campaña: Felipe eligió la II; la etiqueta a la derecha y las categorías en orden)
Qué hice: la II quedó como «Prendas»: el formulario corre a la izquierda y a la derecha va la etiqueta con el pie debajo («Cancelar» a su
medida y «Guardar» con el resto, en una fila); «Dónde rige» pasó de píldoras sueltas a una grilla de casillas por familia, con su total,
la barra a escala de cada categoría, «toda la familia» a medias y un buscador.
Por qué así: Felipe pidió la etiqueta a la derecha, los botones alineados y las categorías menos desparramadas; «Prendas» ya tiene la
etiqueta y sus botones a la derecha, así que las dos hojas de una campaña se ven igual.
Qué se rompería sin esto: «Cancelar» bajaba 12 px (heredaba el margen de las secciones por un nombre de clase repetido) y 31 píldoras de
anchos distintos no se dejaban recorrer con la vista.
Cómo se verifica: abrir `docs/maquetas/campana-configuracion-2026-10/index.html` (abre en la II); medí en el navegador los dos botones
(misma altura y mismo borde de arriba), y recorrí el buscador, el vuelo a la etiqueta y el guardado a 1024, 1440, en oscuro y a 375 px.

## 2026-10-23 (Configurar campaña: el descuento centrado y los botones parejos)
Qué hice: el paso de «Cuánto baja» es ahora una sola caja con − y + adentro y el número al centro (como `PasoCantidad`), con las píldoras en
su fila debajo; el número mide lo que se escribe y comparte su línea base con el %. «Cancelar» y «Guardar» quedaron del mismo ancho.
Por qué así: Felipe vio el número más arriba y aire debajo: las píldoras en dos filas estiraban − y + y la caja quedaba pegada arriba; y
pidió los botones más uniformes. `PasoCantidad` ya es la pieza única para subir y bajar un número (ADR-0358).
Qué se rompería sin esto: el alto de la fila cambiaba con el ancho de la hoja (una o dos filas de píldoras) y el número nunca quedaba al centro.
Cómo se verifica: abrir `index.html` (II); medido en el navegador con 10, 12,5, 20 y vacío (mismo margen a cada lado, − y + a 8 px), los dos
botones de 161 × 40, en claro, oscuro, 1440 y 375 px, y con el rol sin descuento.

## 2026-10-23 (Configurar campaña: «Cuánto baja» sin espacio libre)
Qué hice: los descuentos de siempre pasaron al lado de la caja, en una grilla de dos filas que llena el ancho que queda y mide lo mismo que la
caja (68 px, opciones de 32 px); en el celular bajan enteros, con 44 px por opción.
Por qué así: Felipe vio mucho espacio libre a la derecha de la caja; con la grilla del mismo alto, caja y opciones forman un solo bloque y
ninguna estira a la otra, que era lo que descentraba el número en la v2.
Qué se rompería sin esto: el bloque ocupaba ~230 px de alto con la mitad vacía, y empujaba «Cuándo rige» y las categorías bajo el pliegue.
Cómo se verifica: abrir `index.html` (II); medido en el navegador: caja 68 px y opciones 32 px en una fila a 1024 y 1440 px, − y + a 12 px
arriba y abajo, el número a la misma distancia de cada lado; 44 px por opción a 375 px; en claro y oscuro, sin errores en la consola.

## 2026-10-23 (Configurar campaña: la II construida en el ERP, actividades 1 a 7 de 8 — ADR-0488)
Qué hice: la hoja «Configuración» es la de «Prendas» con el formulario a la izquierda y la etiqueta viva a la derecha (descuento, fechas,
alcance, mosaico de categorías con su vuelo, «En caja» con lo que cobra la caja y el sello al guardar); «Cuánto baja» con `PasoCantidad`
grande, «Cuándo rige» con la temporada pintada en `CampoFecha`, «Categorías» en grilla de casillas; su movimiento con su regla y «Sugerido».
Por qué así: Felipe eligió la II y aprobó la lista; todo con las piezas que el ERP ya tiene (dos opciones nuevas y opcionales en
`PasoCantidad` y `CampoFecha`, y la variante `pie-parejo` del pie), sin migración ni cambio en cómo guarda.
Qué se rompería sin esto: la hoja no decía que una campaña vigente no llegaba a ninguna prenda ni a qué precio quedaba una; la maqueta
prometía 71,91 y la caja cobra 71,90 (una prueba lo detectó).
Cómo se verifica: cada actividad en el navegador local (guardar de verdad y deshacer, 1024/1440/375, oscuro); suite web 594 archivos en verde,
`tsc`, ESLint y Knip. Falta la actividad 8 y correr `guias:recorrer` y `tema:auditar` (esta Mac no tiene Chromium de Playwright).

## 2026-10-23 (Configurar campaña: actividad 8 — /formidable y /chaos, y lo que Felipe aprobó de ellos)
Qué hice: `/chaos` (semilla 488, 17 ataques en la hoja y en la base) y `/formidable` (medición, prueba ciega y escéptico); con el OK de
Felipe: «Toda la familia» marca toda la familia, «Guardar» manda un solo pedido (`unSoloEnvio`), la guía dice una sola cosa, «prendas»
cuenta modelo y color en la hoja, su grilla, la tarjeta de Tienda web y el pase («8 prendas de Vestidos y Faldas»), y las categorías van
sin la bajada a «Prendas», sin nombres cortados y con la fila de la familia tocable.
Por qué así: el escéptico encontró que la casilla de la familia dejaba afuera las categorías sin prendas (Poleras quedaba sin descuento sin
aviso), y el ciego vio tres números distintos para «prendas» (23 tallas, 8 modelos, 114 unidades). Cada arreglo, con su prueba primero.
Qué se rompería sin esto: una temporada «para toda Indumentaria» que no baja Poleras; tres pedidos por un triple clic; un «· opcional» junto
a «Sigue aquí»; y una hoja que dice 23 cuando su pase dice 8.
Cómo se verifica: `vitest` web (594 archivos), `tsc` y ESLint en verde; `guias:recorrer` de productos.sellos pasa en 15 pasos a 1440 y 375;
`tema:auditar` con la hoja vacía y llena: 0 hallazgos; en el navegador, un PATCH por triple clic, 18 de 18 categorías con «Toda la familia
Indumentaria», 0 nombres cortados a 1024, 1440 y 375; base local restaurada e idéntica a su foto (22 invariantes en verde).

