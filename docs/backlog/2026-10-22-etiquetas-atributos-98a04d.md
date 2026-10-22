## 🗓️ Catálogo ▸ Campañas y Sellos (2026-10-22, ADR-0473) — migración `20261022151000` + web; rama `claude/etiquetas-atributos-98a04d`

- [x] Módulo `campanas_catalogo` («Campañas», nace sin rol); `etiquetas` se llama «Sellos» en Roles y accesos; `fn_puede_editar_etiquetas` acepta los dos. Probado en local con un rol que solo ve Campañas (puede crear; sin módulos, no).
- [x] Pantalla `/productos/campanas` (tramos por fecha, crear, configurar o repetir, prendas, imprimir, enlace al diseño web) con su guía (11 pasos, sin escrituras) y su ícono en el menú; probada a 1440 px y a 375 px en oscuro.
- [x] Atributos ▸ Sellos sin las campañas; «Sellos y campañas» en Nuevo producto, la matriz de la ficha, el historial y la hoja de cambios.
- [x] Enlaces y textos de Tienda web ▸ Campañas, Configuración, Finanzas, Plan de campaña, imprimir etiquetas y guías apuntan a Catálogo ▸ Campañas.
- [x] Ataque corto: triple clic en «Guardar campaña» crea una sola; un nombre repetido (también de un sello) se rechaza con un mensaje que ya habla de sellos y campañas. Base local restaurada a la foto.
- [ ] **No está en producción:** pegar `20261022151000` (con tu OK) antes de fusionar la web; sin ella, Catálogo ▸ Campañas da «Sin acceso» a todos menos al líder y Roles y accesos no la muestra.
- [ ] **Darle Campañas a los roles que hoy configuran campañas** (hoy 3 roles ven «Etiquetas»): es tuyo, en Roles y accesos.
- [ ] **Sin verificar:** el enlace al diseño web de cada campaña (la base local no tiene el módulo `campanas_web` ni campañas con descuento); `guias:recorrer` (Playwright sin su navegador en esta Mac: la guía se recorrió a mano en el navegador del panel).
- [ ] Los dos módulos de campañas de Tienda web (`campanas` y `campanas_web`) se resuelven en otra sesión.
