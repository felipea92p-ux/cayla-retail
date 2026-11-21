# 2026-11-21 — Análisis, la cara B «Una respuesta por pregunta» (ADR-0357 act. 2026-11-21)

- **QUÉ HICE:** rediseñé Gestión ▸ Análisis con la cara B que Felipe eligió mirando la maqueta (`docs/maquetas/analisis-claro-2026-11/`), en diez actividades de `/construir`, una por commit:
  - la ficha al milímetro;
  - una barra de filtros para toda la pantalla;
  - las cinco pestañas con su respuesta en grande y una sola tarjeta de prenda: Hoy · Se acaba · No se vende (sin «Liquidar») · Sin salir · Qué pedir (por tipo, hasta Navidad);
  - la ficha de la prenda en tres bloques;
  - la guía interactiva recorrida;
  - `/milimetro auditar`, con 3 graves corregidos;
  - `/formidable`, con 7,6 y 3 cambios propuestos.
- **POR QUÉ ASÍ:** cada pestaña hablaba con otro gráfico (cintas, carriles, un riel con tabla) y había que aprender cada uno. Ahora toda pregunta se responde igual: una cifra con su color, una frase y las prendas que la forman. Lo que no se vende solo se muestra: Felipe decidió que la persona elige qué hacer. Ninguna migración: la pantalla lee lo mismo de antes.
- **QUÉ SE ROMPERÍA SIN ESTO:** la pantalla seguiría pidiendo un manual (Felipe: «que cualquier persona que ingrese pueda entenderlo»), y seguiría ofreciendo «Liquidar» a quien solo tenía que ver qué no se vende.

Verificado:
- Cada pestaña en el navegador a 1440 y 375 px, en claro y en oscuro, con datos inventados.
- La guía recorrida con `guias:recorrer` en un banco Supabase propio con el seed (escritorio, 375 en oscuro e ida y vuelta, sin escrituras).
- La suite de la web completa en verde.
- La prueba ciega (Sonnet, sobre capturas) completó la tarea a la primera.

No probado: con una encargada real, ni en producción.
