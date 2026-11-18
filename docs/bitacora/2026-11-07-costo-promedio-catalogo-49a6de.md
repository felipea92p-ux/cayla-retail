## 2026-11-07 (Catálogo ▸ Costos explica el costo de cada talla — ADR-0631)
Qué hice: revisé en producción el Short Sohanna. La compra del 7-nov, a S/ 48, dejó 48 / 46.50 / 48, y la cuenta estaba bien: en Azul
marino 30 quedaba 1 sin vender a S/ 45. Con eso, la pestaña Costos de la ficha ahora:
- dice cuánto cuesta hoy cada prenda (S/ 47.25, la misma cifra del Historial), con un enlace que abre el Historial en «Costo»;
- lleva en cada talla gris un «?» con su cuenta;
- ofrece poner el costo de la última compra a las tallas que aún no llegan por compra;
- ya no corta la columna «Costo».

La cuenta de cada talla la da una función nueva de solo lectura (`fn_costo_de_las_tallas`, `20261107232000`).
Por qué así: el costo se lleva por talla (cada una tiene su promedio), y eso está bien para valorizar el inventario. Lo que confundía era que
la pantalla no decía de dónde salía cada número. Las tallas que no llegaron no se igualan solas: una compra de la talla 28 no prueba lo que
cuesta la 32. Por eso es un botón que la persona decide usar.
Felipe se lleva: un SQL de solo lectura por pegar (sin él la ficha funciona igual, solo que el «?» explica en palabras). También una pregunta
de negocio: ¿los S/ 45 de la carga inicial eran el costo real o un estimado?

## 2026-11-09 (Igualar el costo de las tallas sin stock en todas las prendas)
Qué hice: un script de una sola vez. A cada talla sin compra y sin stock le pone el costo de la última compra de su prenda, en todo el
catálogo. Trae ensayo, respaldo de cada fila, versión de la prenda subida, freno contra el segundo pegado y camino de vuelta. Lo ensayé en
una base privada con los casos que no deben cambiar: con stock, en traslado y desactivada.
Por qué así: Felipe eligió «Solo sin stock». A una talla sin stock, cambiarle el costo no mueve el valor del inventario. A una con stock, sí
reescribiría lo que cuestan prendas que no llegaron en esa compra.
Felipe se lleva: pegarlo primero como ensayo, mirar la lista y recién después aplicarlo cambiando una línea.

## 2026-11-09 (El historial del costo se lee solo por funciones)
Qué hice: una migración que deja `costo_historial` con un solo camino de lectura, el de las funciones que preguntan el permiso de dinero, como
ya era el costo de cada prenda. Antes medí que no rompe nada: ninguna pantalla lo leía directo y las 20 pruebas que lo tocan dan lo mismo.
Por qué así: Felipe eligió un solo camino al dato. Con dos (la tabla y las funciones) cada uno tendría su propia regla de quién ve qué.
Felipe se lleva: dos partes cortas por pegar, cada una sola, en orden.

## 2026-11-09 (Revisión con ultra-criterio antes de fusionar: una sola regla para igualar)
Qué hice: revisé el PR con /ultra-criterio, /rigor y un /chaos dirigido. Encontré que el botón de la ficha también le cambiaba el costo a
tallas con prendas, que es justo lo que Felipe había descartado para el script. Ahora los dos preguntan a una sola función de la base.
Por qué así: si la regla está escrita en dos lugares, termina diciendo dos cosas distintas. Además, la ficha no sabe qué va en un traslado.
Felipe se lleva: el mismo orden para pegar, con el script al final.
