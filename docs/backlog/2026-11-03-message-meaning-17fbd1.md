## Cierre de envío: conteo oculto en 0 (2026-11-03)
Hecho: `CerrarEnvio` manda todos los conteos a `cerrar_conteo_envio` y avisa en una hoja si alguien guardó otro en medio.
**Falta:**
- Ver el cierre en un envío real que tenga una línea de fuera de la guía en 0 (hoy solo probado con pruebas de reglas, no en el navegador).
- Una prueba que ejercite el componente o el RPC con un conteo en 0 (la actual solo cubre `lineasParaCerrar`).
