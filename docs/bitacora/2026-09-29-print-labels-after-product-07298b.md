## 2026-09-29 (Al terminar de crear un producto con stock, se pueden imprimir sus etiquetas ahí mismo)

Qué hice: la pantalla que aparece después de crear un producto ahora tiene una tarjeta «Imprimir etiquetas» cuando el
producto entró con unidades (la carga de hoy). Dice cuántas etiquetas saldrán —una por prenda— y abre la pantalla de
etiquetas de ese producto en otra pestaña. Si el producto se creó sin stock, o se guardó sin conexión, la tarjeta no
aparece: no habría prenda que etiquetar todavía.

Por qué así: la regla anterior («las etiquetas salen al ingresar mercadería, no al crear el producto») se escribió cuando
crear un producto no traía prendas. Desde que Nuevo producto carga también el stock (ADR-0212) ese momento existe, y es
el mejor: la prenda está en la mano. Se abre en otra pestaña porque «Crear otro parecido» vive solo en esa pantalla:
volver de una pestaña que la reemplaza dejaba el formulario en blanco, justo cuando se cargan varias prendas de una
colección.

Felipe se lleva: solo web, sin migración. Probado con datos de ejemplo (con y sin stock). Falta la prueba de verdad: crear
un producto con stock en la tienda, tocar el botón e imprimir una etiqueta.
