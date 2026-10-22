## 🗓️ Catálogo ▸ Campañas y Sellos (2026-10-22, ADR-0473) — migración `20261022151000` + web; rama `claude/etiquetas-atributos-98a04d`

- [x] El módulo `campanas` (de PR #1190, ya en producción en Tienda web) se muda a Catálogo; `etiquetas` se llama «Sellos» en Roles y accesos. Felipe eligió reusar `campanas` en vez de un `campanas_catalogo` nuevo (2026-10-22).
- [x] Tienda web ▸ Campañas ▸ una campaña: pestaña «Datos y prendas» con la misma tarjeta y hojas de Catálogo (`TarjetaDeCampana`).
- [x] Pantalla `/productos/campanas` (tramos por fecha, crear, configurar o repetir, prendas, imprimir, enlace al diseño web) con su guía (11 pasos, sin escrituras) y su ícono en el menú; probada a 1440 px y a 375 px en oscuro.
- [x] Atributos ▸ Sellos sin las campañas; «Sellos y campañas» en Nuevo producto, la matriz de la ficha, el historial y la hoja de cambios.
- [x] Enlaces y textos de Tienda web ▸ Campañas, Configuración, Finanzas, Plan de campaña, imprimir etiquetas y guías apuntan a Catálogo ▸ Campañas.
- [x] Ataque corto: triple clic en «Guardar campaña» crea una sola; un nombre repetido (también de un sello) se rechaza con un mensaje que ya habla de sellos y campañas. Base local restaurada a la foto.
- [ ] **No está en producción:** pegar `20261022151000` (con tu OK) antes de fusionar la web; sin ella, `campanas` sigue en el grupo Tienda web en Roles y accesos.
- [ ] **Depende de la otra sesión:** `fn_puede_campanas` = líder, `campanas`, `campanas_web` o `etiquetas` (su migración). Sin ella, en producción solo el líder y Terminal Almacén guardan una campaña.
- [ ] **Sin verificar:** la pestaña «Datos y prendas» y el enlace al diseño web en Tienda web (la base local no tiene las migraciones de Tienda web ▸ Campañas); `guias:recorrer` (Playwright sin su navegador en esta Mac: la guía se recorrió a mano en el navegador del panel).
- [ ] La llave única (`fn_puede_campanas`) y traer al repo lo que producción ya tiene de #1190: otra sesión (`claude/lucid-germain-95e281`).
