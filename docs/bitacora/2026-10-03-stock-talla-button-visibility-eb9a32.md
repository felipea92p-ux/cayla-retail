## 2026-10-03 (Editar producto: la talla «Estándar» se lee, los botones de agregar se ven y la matriz cubre todos los casos)
Qué hice: el panel «Stock por talla» mide la columna por la talla más larga (subgrid) y ya no tapa «Estándar»; «Agregar color/talla» son botones con «+» y una línea que dice qué agregan; recorrí la ficha caso por caso y corregí 12 cosas, la mayor: la celda «—» ahora agrega esa combinación (antes era imposible llenar un hueco). Sin migración.
Por qué así: cada arreglo sale de un caso que se reprodujo en el navegador o se confirmó leyendo el código; lo que es decisión de negocio (quitar una talla, avisar un salto grande de stock) quedó en el backlog para Felipe, no en el código.
Felipe se lleva: en una prenda con huecos, pasa el mouse por un «—» de la tabla y tócalo: nace esa talla de ese color; y en el panel, «Estándar» completo con su barra al lado.

## 2026-10-03 (La talla también tiene tacho)
Qué hice: cada talla de la tabla lleva lápiz y tacho en su cabecera; quitarla la desactiva en todos los colores (nunca borra) y se deshace hasta guardar. De paso, en celular la columna Color ya no deja el nombre en una letra.
Por qué así: es el mismo gesto que «Quitar color» (Felipe lo pidió igual), con la misma regla pura (`quitarFilas`), así que se comporta igual en todo: suelta lo tocado, avisa las unidades y lo lista la hoja de guardar.
Felipe se lleva: en una prenda con varias tallas, el tacho junto a «30» la saca de todos los colores; abajo sale «La talla 30 deja de venderse… · Deshacer».

