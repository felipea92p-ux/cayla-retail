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
