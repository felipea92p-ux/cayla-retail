# 2026-11-07 — Recibir: corregir la marca de lo contado al asociar

- **Hecho:** «¿Esta prenda ya existe?» trae un combo de marca junto al de categoría (envío cerrado, fuera de la guía). Al confirmar, `cambiar_linea_de_pendiente` pasa el modelo a la línea de esa categoría y esa marca; la función de categoría de ayer la llama por dentro (ADR-0393, act. 2026-11-07).
- **Verificado:** `pruebas:envio-sin-aviso` 40/40 (S3h nuevo); tipos, lint y las pruebas de Recibir, guías, guía de foco, unificar y sugerir.
- **Sin probar en el navegador:** Felipe pidió saltar las pruebas que no fueran necesarias.
