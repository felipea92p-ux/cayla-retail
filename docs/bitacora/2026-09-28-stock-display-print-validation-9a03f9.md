## 2026-09-28 (Productos ▸ Tabla: la ficha muestra el stock de cada talla y no abre Etiquetas sin prendas)
Qué hice: en la ficha de variantes de `ProductosTabla.tsx` cada tarjeta muestra, grande, cuántas unidades hay de esa talla y color EN LA SEDE de quien mira (`components/useStockEnSede.ts`, `lib/stock-en-sede-reglas.ts` + prueba); el costo y el margen salen de la tarjeta y solo vuelven cuando no son iguales en todas las tallas. Imprimir (la variante, el modelo, la fila o lo marcado) cuenta el stock en el momento: con 0 no navega, sale el aviso arriba a la derecha y el botón queda en rojo.
Por qué así: la etiqueta de precio sale una por prenda EN LA TIENDA (`etiquetas-precio.ts`), así que el número de la tarjeta es el mismo con el que se decide imprimir; si mostrara el total de la red, diría «12» y el botón se negaría. Se relee al imprimir porque un «0» viejo no debe impedir etiquetar lo que acaba de llegar; si la base no responde, se abre Etiquetas como antes.
Felipe se lleva: el stock de la fila (58) es de todas las sedes y el de las tarjetas, de tu sede — por eso la ficha dice «Stock en Tienda Lima: 33».

## 2026-09-28 (Productos ▸ Grilla: la vista rápida también muestra el stock por talla y no abre Etiquetas vacía)
Qué hice: la vista rápida de la Grilla suma la columna «Stock» (de la sede) y su botón «Etiquetas» pasa por el mismo `components/EnlaceEtiquetas.tsx`, que salió de `ProductosTabla.tsx` para que las dos vistas usen una sola pieza; el rojo de «sin stock» quedó igual en los cinco botones (relleno rojo, letra crema).
Por qué así: la Tabla y la Grilla dicen lo mismo de la misma prenda (lo pide el comentario de `ProductosTabla`); dos copias del «preguntar antes de imprimir» terminarían comportándose distinto.
Felipe se lleva: da igual la vista que uses — el número por talla es el de tu sede y es el mismo que imprime Etiquetas.

## 2026-09-28 (Productos ▸ Grilla: imprimir la etiqueta de una sola talla desde la vista rápida)
Qué hice: cada talla de la vista rápida tiene su impresora, siempre visible (con la misma regla de `EnlaceEtiquetas`: sin stock en la sede, aviso y botón rojo). En el celular la columna «Código» se esconde para que la impresora quepa, y la fila de botones se parte en dos líneas (antes «Eliminar» se salía de la hoja a 375 px).
Por qué así: en la Tabla la impresora de la talla aparece al pasar el mouse; la vista rápida también se abre en el celular, donde no hay mouse, así que aquí se ve siempre.
Felipe se lleva: desde cualquier vista se puede reimprimir la etiqueta de una sola prenda sin sacar las del modelo entero.

## 2026-09-28 (Productos ▸ Grilla: cada tarjeta dice «En tu sede: N» debajo del stock total)
Qué hice: bajo «Stock total» de cada tarjeta de la Grilla, «En tu sede: N». La Grilla lee el stock de la sede de TODA la página en una sola consulta (`useStockEnSede`, ahora uno solo para la grilla, compartido con la vista rápida) y lo relee cuando la página cambia o se refresca.
Por qué así: una consulta por tarjeta serían 24 cada vez que se abre la página; una sola trae lo mismo. La vista rápida usa ese mismo dato y relee su modelo al abrirse, así la tarjeta y la hoja no pueden decir números distintos.
Felipe se lleva: en la Grilla se ven los dos números a la vez: cuánto hay en toda la red y cuánto hay aquí.

## 2026-09-28 (Productos ▸ Grilla: «Sin stock en tu sede» cuando la red tiene y la tienda no)
Qué hice: con unidades en otras sedes y 0 en la tuya, la línea «En tu sede» de la tarjeta pasa a ser la insignia neutra «Sin stock en tu sede» (`sinStockEnSede` en `lib/productos-stock.ts`, junto a `alertaDeStock`, con prueba). Con 0 en toda la red sigue diciendo solo «Sin stock» arriba; una descontinuada no avisa.
Por qué así: el «Stock total 117» de una prenda que aquí no está se lee como «sí hay» y la colaboradora se la promete a la clienta. Neutro y no rojo (ADR-0151, máximo dos rojos por pantalla), igual que el «Sin stock» de la red. Decisión de operación de Felipe (2026-09-28): el aviso de la Grilla es por sede.
Felipe se lleva: la Grilla avisa por tu tienda; el filtro «Sin stock» de la barra y la Tabla siguen mirando la red (pendiente en `docs/backlog/2026-09-28-stock-display-print-validation-9a03f9.md`).
