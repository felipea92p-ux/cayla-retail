## 🎨 Colores combinados: «Hueso con azul» (2026-11-10, ADR-0643) — migración + web; rama `claude/variantes-multiples-colores-bc0ef0`

- [x] Migración `20261110222000_colores_combinados.sql`: `colores.componentes`, candado `colores_valida_componentes`, índice único de la
      mezcla y `retail.color_combinado`. Probada con `pnpm pruebas:colores-combinados` (19/19) y por la API en local.
- [x] La carta (Nuevo producto, Recibir) lee los componentes: fila «Combinados» y punto partido.
- [x] «+ acompañante» (`ArmarMezcla`) en Nuevo producto y Recibir; guías al día y huellas aceptadas.
- [x] Atributos ▸ Colores: fila «Combinados», muestra partida, base y acompañantes en la tarjeta, sin tono ni familia al editar.
- [x] **Migración en producción** (2026-11-10, con el OK de Felipe; versión registrada `20261110224736`). Probada allá sin guardar nada.
- [ ] Publicar la web (PR con `/abrir-pr`).
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción.
- [ ] **Sin decidir con Felipe:** si «+ acompañante» también va en «Agregar colores» de la ficha de un producto, y si Vender, Existencias,
      etiquetas y la tienda web deben dibujar el punto partido (hoy dibujan el de la base, con el nombre completo).
- [ ] **Sin probar:** guardar de punta a punta una recepción con una mezcla (se probó hasta la hoja, cancelando) y la hoja a 375 px.
