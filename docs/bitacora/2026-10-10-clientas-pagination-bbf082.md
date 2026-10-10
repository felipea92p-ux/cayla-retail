# 2026-10-10 — Clientes ▸ Fichas pagina de 20 en 20

- **Qué:** la lista de Fichas (`/clientas`) trae 20 clientes por página en vez de 50 (`POR_PAGINA` en `lib/clientas-lista-reglas.ts`). El pie conserva «‹ Anterior · Página X de Y · Siguiente ›».
- **Por qué:** una página corta se recorre de un vistazo y la tienda no baja por una lista larga. Pantalla y consulta a la base comparten el mismo número, así que la página 2 empieza siempre en el cliente 21. La función `fn_clientas_lista` acepta de 1 a 200 por página: sin migración.
- **Cómo verificas:** en `/clientas` con más de 20 fichas (filtro «Todos»), la tabla muestra 20 filas y «Página 1 de 2»; «Siguiente ›» muestra el resto. Cambiar de filtro o buscar vuelve a la página 1.
