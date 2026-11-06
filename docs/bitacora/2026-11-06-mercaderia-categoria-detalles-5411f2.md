# 2026-11-06 — Recibir: corregir la categoría de lo contado y ver la ficha de las sugerencias

- **Hecho:** en «¿Esta prenda ya existe?», un combo de categoría (envío cerrado, fuera de la guía) que busca en la categoría elegida y, al confirmar, pasa el modelo con `cambiar_categoria_de_pendiente`. Tocar una sugerencia abre su ficha con la foto en grande, marca, material, patrón, tallas, colores y descripción (ADR-0393, act. 2026-11-06 b).
- **Verificado:** `pruebas:envio-sin-aviso` S3f y S3g; navegador en local (asociar, entrar al stock, crear como nueva, 375 px y oscuro); la migración corre sobre la copia local del esquema de producción, con ROLLBACK.
- **Falta:** el OK de Felipe para pegar `20261106230000` en producción, y correr `/chaos` y `/formidable` sobre esta hoja. No se pudo leer el envío real: el MCP de Supabase de esta sesión no tiene permiso sobre producción.
