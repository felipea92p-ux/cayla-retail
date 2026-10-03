# Reponer un modelo con todos sus colores · maqueta (2026-10-03)

Pedido de Felipe: bajar un modelo de varios colores (Polo azul, blanco, negro) al piso **en una sola operación**, sin buscar
cada color por separado. Esta es la **propuesta A** (matriz colores × tallas), dibujada con los tokens de `globals.css`.

`index.html` se abre con doble clic (no necesita servidor). Datos inventados; no llama a la base.

## Qué se puede probar
- Tarjeta del modelo: dos botones, **«Reponer prenda»** y **«Subir prenda»** (nombres de Felipe, 2026-10-03; iguales con uno o con varios colores).
  **No hay botones «Solo azul»**: la ventana siempre trae todos los colores del modelo (decisión de Felipe, 2026-10-03). Cada botón
  aparece solo si hay algo que mover: Reponer si algún color tiene almacén; Subir si algún color tiene piso libre.
- La misma ventana sirve en los dos sentidos. **Reponer** (almacén → piso): tope = lo que hay en almacén. **Subir** (piso → almacén):
  tope = lo libre en el piso (lo apartado no se sube), con «Por qué las subes» opcional, como el modal que existe hoy.
- Matriz: **la misma tabla de Nuevo/Editar producto** (`MatrizCantidades`, Felipe 2026-10-03): encabezado hueso, franja de 5 px con el color
  de la fila, filas alternadas, caja − N + por celda, columna Total y fila Total fija abajo; en celular se desliza de lado con el color fijo.
  Debajo de cada caja, «hay N» = el tope. Número escrito por celda, celda rayada con «—» donde no hay nada que mover, total por color y general, «Limpiar». **No hay «Poner 1 en cada talla»** (Felipe: todo en 0). **Arranca en cero** (ADR-0231); «Precargar ejemplo» de la etiqueta negra es solo de la maqueta.
- Guía de foco (ADR-0284): «Sigue aquí» pasa de las cantidades al Responsable; «Falta: …» es tocable.
- Confirmar: loader a pantalla completa → aviso → la tarjeta cambia sus cifras. Escape cierra (primero la lista, luego la hoja).
- A 375 px la matriz pasa a un bloque por color con dos tallas por fila, y el pie baja el Responsable a su propia fila.

## Cómo se construiría (no está construido)
Un solo modal por modelo con dos modos. **Reponer**: `lineasDeReponer` / `argumentosDeBajada` y UNA llamada a `bajar_al_piso`
(todo o nada, con marca de reintento; admite hasta `MAX_LINEAS_BAJADA` líneas). **Subir**: lo mismo con `argumentosDeRetiro` y `RPC_RETIRO`
(que `SubirAAlmacenModal` ya llama con varias líneas, token y nota). Sin migración.
