# 2026-10-03 — Skills de rendimiento: árboles de decisión, velocidad percibida, observabilidad

- **Qué:** tres skills (`skill-analisis-arboles-decision`, `skill-optimizacion-ui-ux-perf`, `skill-evaluacion-observabilidad`) con escáneres sin dependencias nuevas en `scripts/rendimiento/` y 20 pruebas (`node --test scripts/rendimiento/rendimiento.test.mjs`). Investigación en `docs/investigacion/2026-10-03-arboles-ux-observabilidad.md`.
- **Por qué:** con 3 tiendas la velocidad de CPU de las reglas no importa; lo que falta es poder medir. Hallazgo mayor: sin APM, trazas ni `request_id`, y Lucode con fallas que no quedan en logs.
- **Pendiente (no hecho):** instrumentar los 4 puntos de Lucode/padrón con `capturarError`; prueba con dependencias simuladas de `transmitirComprobante`; sumar las pruebas al CI; medir el payload del catálogo en Cambios a 375 px.
