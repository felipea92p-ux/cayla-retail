## 2026-09-28 (Etiquetas de precio: el encabezado ya no dice «Existencias · marcaste» a quien imprimió una talla desde Productos)
Qué hice: `encabezadoDeEtiquetas` recibe si se llegó desde Productos (el mismo `?desde=` que usa «Volver») y cuántas tallas trae la URL. Una sola talla desde Productos dice «Productos · Una talla» y «hay N prendas de esta talla y color»; varias marcadas en la Tabla dicen «Productos · Prendas marcadas»; lo que viene de Existencias no cambia.
Por qué así: el origen se decide con la misma regla que el botón «Volver» (`desdeSeguro`): si el encabezado y la vuelta leyeran el origen de dos formas distintas, podrían contradecirse en la misma pantalla.
Felipe se lleva: la pantalla de Etiquetas ya no le dice a la persona que «marcó» algo que nunca marcó.
