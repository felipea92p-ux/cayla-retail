## 🌿 Frescura del piso · paso 4b «Ya decidí» y la señal de disciplina de registro (2026-09-29, ADR-0208) — migraciones `20261001100000`, `…100`, `…200` **SIN PEGAR**; rama `claude/frescura-registro-discipline-signal-0cd4b5`

- [x] **Tabla `retail.frescura_decisiones`** (de solo agregar, con el esquema haciendo imposibles los estados malos: una
      cabeza por prenda y sede, una respuesta por fila, FK compuesta a la misma prenda, CHECK de anulación que cierra el
      hueco del NULL, disparadores contra update/delete/truncate). Probada con mutantes.
- [x] **Funciones** `anotar_decision_frescura`, `anular_decision_frescura`, `fn_frescura_decisiones` y los candados
      `fn_puede_frescura` / `fn_puede_decidir_frescura` (la rebaja, solo el líder). Idempotentes por `token`; la carrera
      la resuelve el índice único (`PT409 version_cambiada`). `pnpm pruebas:frescura-decisiones`: 156 verificaciones, con
      dos conexiones reales para las carreras.
- [x] **`eliminar_producto_con_historia`** y los scripts de purga/restauración conocen la tabla nueva (parche con ancla).
      Regresión en verde: `eliminar_producto` 35, `purgar_producto_de_prueba` 88.
- [x] **Web:** «Ya decidí» (hoja con la guía de foco), bloque «Lo que se decidió» con historial, píldora «Decididas» en la
      URL (`?decididas=1`), «Por decidir» = quieta y sin decisión vigente (un solo lugar: `aplicarDecisiones`). 374 pruebas
      en `lib/frescura*`; `tsc` limpio. Verificado en un servidor real a 1280 y 375 px, incluida la ruta donde la lectura
      de decisiones falla (la pantalla se pinta igual y lo dice).
- [ ] **PEGAR en producción** (Felipe): los tres archivos, cada uno por separado, en ese orden; luego
      `pnpm datos:generar:produccion` y `pnpm datos:comparar`. Los tipos de `packages/database/src/types.ts` para las tres
      funciones están escritos a mano: regenerar tras pegar.
- [ ] **Sin probar con datos reales:** hoy Trujillo tiene 3 bajadas en toda su historia; el veredicto «¿sirvió?» se probó con
      datos sintéticos, no con un mes de piso real. La primera lectura honesta será cuando haya semanas de historia.
- [ ] **La señal de disciplina de registro NO está construida — espera decisión de Felipe.** Análisis con `/rigor`,
      simulación de ruido (`ruido.py`) y los estados, incluidos los días malos, en
      `docs/maquetas/senal-de-registro-2026-09/`. Resumen: (a) nada de porcentaje semanal (10–24 % de las semanas mostrarían
      «< 80 %» sin que nadie cambie); (b) tarjeta de 28 días, en silencio si todo es normal, contra el propio mes anterior
      y solo si la diferencia supera el azar (con ~120 bajadas al mes, unos 18 puntos); (c) un día con casi todas las
      tardías → pregunta «¿hubo un problema?» y no sale como costumbre; (d) el sistema **no guarda la hora real de una
      operación sin conexión**, así que una caída de internet parece «tardía» toda la jornada; (e) depende de 3b (los
      botones «Ya estaba colgada» / «La traje del almacén») para que decir la verdad nunca sume a la lista. Difiere de la
      decisión 8 de ADR-0208, que además de «su sede contra su propio mes anterior» deja un enlace discreto «Ver ranking y
      promedio de CAYLA»; el encargo pide sin ranking. Felipe decide si el enlace se queda.
