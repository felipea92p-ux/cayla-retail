# 2026-11-17 · Campañas y ofertas, más simple: Felipe elige la maqueta

- Se retomó en esta rama la maqueta de `claude/campanas-simple-maqueta` (2 commits del 2026-11-16, solo documentos), que esperaba la elección de Felipe.
- Felipe la vio en el navegador y eligió la cara A · En la lista. Las campañas que hoy hacen de descuento quedan como campañas, sin migrar nada; el mismo % de la tienda y de todas son dos filas; «Regalo» y «Club» salen de la hoja de ofertas.
- Sigue construir la pantalla sobre `rebaja_cajones` (ya en producción): la lista de actividades se aprueba antes de tocar código.

## 2026-11-18 · Los descuentos, construidos (actividades 1 a 5, ADR-0677)

- Felipe aprobó 9 actividades y decidió que cambiar a un % que ya existe junta las prendas y que desactivar las devuelve a su precio, con Deshacer.
  Hechas las cinco de los descuentos: la lista arriba de las campañas, el panel con sus prendas, agregar con la pistola, el nombre o la cámara, y
  nuevo / cambiar / desactivar. Tres migraciones de solo funciones, sin aplicar en producción.
- Cierre: guías recorridas (29 pasos), `/focus` (el % que llega puesto pasó a «sugerido»), `/chaos` semilla 1118 sin estados imposibles y con dos
  hallazgos abiertos, `/milimetro` sin graves, `/formidable` 8,1 provisional con la ciega en 5 toques. Las actividades 6 a 8 van en el PR siguiente.
