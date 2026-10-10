# 2026-10-10 — Análisis: el detalle del modelo en una tabla y «Qué pedir» lado a lado

- **Qué:** el detalle de un modelo pasa a una frase y una sola tabla talla × color con palabras y totales, los colores que más se venden arriba (opción B). «Qué pedir» pone la lista de tipos y el panel del tipo elegido lado a lado, con «↓ N tipos más» y «Lo que más se vende» en Top 5 (o 10, 15, 20) (opción A). ADR-0357, decisión 12 (b). Sin migraciones.
- **Por qué:** el detalle repetía las mismas cifras tres veces con dos ventanas de días y «0» rayados en rojo sin explicar; en «Qué pedir» no se notaba que la lista seguía ni que tocar un tipo filtraba lo de abajo.
- **Cómo verificas:** en `/inventario/resumen?vista=pedir`, toca un tipo: el panel de la derecha cambia en el acto; cambia a «Top 10». Toca un modelo: la tabla dice «2 vendidas · no queda» y el color más vendido va primero.
