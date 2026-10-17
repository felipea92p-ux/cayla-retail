## 2026-10-16 («Arma el tuyo», ADR-0434, actividad 4: el probador en el celular)
Qué hice: `/looks/arma` en la tienda, escondido (nada lleva ahí todavía): la figura con cada prenda a escala desde los hombros o la cintura, las que siguen asomando a los lados, deslizar con el dedo o las flechas (y ← → con el teclado), los colores de la elegida con cuánto hay y, si no tiene foto propia, qué foto se ve; la tira de opciones con «Sin bolso», «o un vestido», agotadas e insignias; «Tu look» con candados, «Sorpréndeme» que respeta lo fijo y prefiere colores que combinan, el total y el look en la dirección (`?p=`), que se conserva al cambiar de tienda. La base suma `retail.tienda_probador(p_sede)` (migración `20261017025000`, sin pegar en producción).
Por qué así: cada prenda va en UN color, y el catálogo solo trae el precio y el stock del modelo; con el del modelo, una campaña en el negro le pondría su precio a la beige (el error que ya se corrigió en los looks). Lo demás (nombre, colores, qué se ve) sale del catálogo que la tienda ya guarda, así el probador no arma el catálogo entero por dentro.
Felipe se lleva: nada todavía; el probador sigue escondido hasta la actividad 10, y su migración se pega con su OK antes de fusionar el PR 2.

## 2026-10-16 («Arma el tuyo», actividad 5: buscar y ver todas las de una zona)
Qué hice: «Ver todas» (en la tira) y «Buscar otra» abren una hoja a pantalla completa: la caja que busca mientras se escribe (nombre, categoría, zona o color, sin tildes), las zonas, el conteo, las tarjetas con sus colores, cuánto hay y «Probar», que pone la prenda en ese color y avisa «Ver mi look»; sugerencias que salen de lo que hay y un vacío que nombra lo buscado.
Por qué así: busca en lo que la página ya trajo (nada va a la base al escribir), y la hoja vive en la dirección (`?buscar=`) para que «atrás» la cierre como cualquier pantalla del celular. El «Solo en Trujillo» del lienzo ya lo hace la franja «Ver lo que hay en» de la tienda.
Felipe se lleva: nada; sigue escondido.

## 2026-10-16 («Arma el tuyo», actividad 6: tallas y a la bolsa)
Qué hice: «Agregar a mi bolsa» en la barra de abajo del probador: pide las tallas de cada prenda en su color, abre la hoja de tallas de los looks («Una talla por prenda») y lleva lo elegido a la bolsa con la misma acción; al terminar, «Agregaste 3 prendas de tu look a tu bolsa» y el globo de la bolsa salta.
Por qué así: una sola forma de llevar un look a la bolsa (ADR-0434); las tallas salen de la ficha que la tienda ya guarda y no viajan con la página (serían miles de filas por visita), y la bolsa vuelve a preguntarle a la base antes de agregar.
Felipe se lleva: nada; sigue escondido.

## 2026-10-16 («Arma el tuyo», actividad 7: el probador en la computadora)
Qué hice: en pantallas anchas, la figura grande a la izquierda (fija mientras se baja) y, a la derecha, «Tu look», los colores, las opciones en grilla, el total con «Agregar a mi bolsa» y lo que la tienda ya cumple; en 1024 px, una columna de prendas y tres opciones por fila.
Por qué así: es la misma pieza del celular reacomodada con CSS (grilla con áreas), no otra: el teclado sigue el mismo orden y la figura crece entera, a escala. Las promesas van bajo el total, porque la figura fija las tapaba si iban debajo de ella.
Felipe se lleva: el PR 2 (actividades 4 a 7) se abre cuando se fusione el PR 1; su migración (`20261017025000`) se pega con su OK antes de fusionarlo.

