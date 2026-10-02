## 2026-09-30 (Cada «Ver» del Inicio de almacén caía en un 404)

Qué hice: Felipe, con la pantalla ya desplegada, tocó cualquier producto de «Lo último registrado» y le salió un 404. Causa mía: los enlaces iban a `/productos/{id}` y esa ruta **no existe**; la ficha es
`/productos/{id}/editar` (no hay `productos/[id]/page.tsx`). Cambié los tres enlaces (las filas de la cabina, «Ver ficha» y «Tomar foto» de las tarjetas) por dos funciones de las reglas,
`hrefFichaProducto` y `hrefFotosProducto` (esta última con `#fotos`, la sección que ya usa «Agregar fotos»). Nuevo `lib/inicio-almacen-enlaces.test.ts` (19 pruebas): recorre las rutas de
`app/(app)` y falla si un enlace literal del Inicio de almacén no cae en una pantalla que exista.

Por qué así: el error era un enlace que nadie siguió. Verifiqué filtros, tecla N, estados y tamaños, pero no adónde llevaba cada «Ver», y justo eso es lo que la persona toca primero. La prueba existe
para que esa clase de error no dependa de acordarse de hacer clic: reintroduje el enlace roto y falla, con la ruta inexistente en el mensaje.

Felipe se lleva: tras fusionar, cada producto del Inicio abre su ficha y «Tomar foto» la abre en la sección de fotos. En el navegador local hice clic de verdad en una fila de la cabina (abrió «Blusa Lino Aurora», sin 404)
y en un «Tomar foto» (abrió la ficha con `#fotos` a la vista). Queda un detalle menor: desde el Inicio, «← Productos» de la ficha vuelve a `/productos` y no al Inicio, porque `?desde=` solo admite rutas de Productos.
Lo dejé anotado; si lo quieres, hay que ampliar esa lista con cuidado (es una lista de seguridad). No probé Safari ni Firefox.
