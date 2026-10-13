## Producción ▸ Nueva orden: «el modelo primero» (2026-10-13, rama `claude/optimal-registration-process-67a4ae`) — solo diseño

- [x] Diagnóstico (capturas + código + base en solo lectura) y maqueta navegable `docs/maquetas/produccion-nueva-orden-2026-10/` con claro, oscuro, 1440 y 1024; 0 errores de consola; teclado y Escape probados.
- [x] Felipe decidió (2026-10-13): estructura = «el modelo primero + ficha viva», tipo = se deduce del modelo con interruptor, alcance = A0–A7 en orden con su OK entre actividades; costos = «opción 1, pero que la terminal del Taller lo pueda ver; esa máquina es compartida».
- [x] **A0:** ADR-0396 reservado (`pnpm reservar adr`) y escrito.
- [x] Costos (Felipe, 2026-10-13): «para taller sí necesito que el terminal y líderes vean los costos, todo». Reabre D-G para el Taller: **A4b = web con la regla `líder o ve `produccion` y opera ese Taller` + migración de permiso que pega Felipe**; la curva y el motor de la red siguen del líder.
- [x] **A1 «El modelo primero»** (`components/orden-produccion/ElegirModelo.tsx`, `lib/orden-modelo-reglas.ts` + prueba de 17, guía `produccion.ordenes` y su huella). Verificado en el navegador contra el ERP local, claro y oscuro, y con la demo guiada. **Sin verificar:** el grupo «Se están acabando» con datos reales (el local no tiene ventas: lo cubren las pruebas y la maqueta), el celular, y la pasada ciega.
- [ ] **A2–A7** del README §6 con `/construir`, una por vez y con el OK de Felipe (A2, la tabla que se manda a la base, es el riesgo: prueba de paridad de la carga útil).
- [ ] **Del recorrido de A1, para después:** «Precio a tienda (C/U)» y «Cubrir…» siguen con sus rótulos de hoy (A5); el halo de la guía rodea toda la lista (borde doble: A3); `guias:recorrer` no se pudo correr (Playwright sin Chromium en esta Mac), así que la guía se probó a mano.
- [ ] D5 (README §5) sigue sin decidir: tercerizar una etapa al abrir y los `CHECK` con `NaN`.
- [ ] Pasada con 3 a 5 colaboradoras reales del Taller: la ley 1 de `/formidable` no sube de 8 sin ella, y hoy ninguna ha abierto una orden.
- [ ] Preguntas que no son de esta pantalla (README D5): tercerizar una etapa **al abrir** (y tarifa desde `cotizaciones_maquila`, 0 filas) y los `CHECK` de `variantes` y `producciones` que admiten `NaN` (núcleo).
- [ ] `abrir_produccion` no valida la fecha de entrega (hoy puede ser el pasado): si se quiere, es del núcleo.
