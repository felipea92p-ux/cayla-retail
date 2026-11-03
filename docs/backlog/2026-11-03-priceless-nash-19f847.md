## Recibir: quien solo tiene el módulo mira lo que llega a su sede (2026-11-03, ADR-0387 act.) — no está en producción; rama `claude/priceless-nash-19f847`
Hecho: `fn_recepcion_puede_leer_sede` y `fn_recepcion_puede_ver_foto_papel`, y las siete funciones que las preguntan (`20261103172000`). Prueba `pruebas:recibir-lee-su-sede`.

**Falta:**
- Pegar `20261103172000` en producción, con el OK de Felipe: una sola parte, solo funciones. Se detiene sin tocar nada si una función viva no es la esperada.
- Verlo en el navegador con una cuenta de solo Recibir y un envío real de otra sede: debe decir «No encontramos ese envío». Hasta hoy solo se vio esa cara con un id inexistente (la misma respuesta de la base).
