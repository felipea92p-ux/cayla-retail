## 2026-10-31 — Tienda: ventana flotante de Recomendaciones

- **Qué hice:** un botón «Recomendaciones» abajo a la derecha en toda la tienda abre una hoja con el mismo formulario y las respuestas de la página (maqueta «A · Esquina», `docs/maquetas/tienda-recomendaciones-flotante-2026-10/`).
- **Por qué así:** la ventana pregunta la sesión al abrirse (acción `abrirVentanaRecomendaciones`) y no en el layout, para no volver dinámica la portada guardada en caché; sin sesión manda a «Entrar»; se descarga recién al primer toque.
- **Qué se rompería sin esto:** leer la sesión en el layout raíz habría sacado de la caché todas las páginas públicas de la tienda. Sin globito de «respuesta nueva» por la misma razón.
