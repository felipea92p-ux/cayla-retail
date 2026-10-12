## 🚚 Traslados visual: tres maquetas (2026-10-06) — solo maquetas, sin web ni migración; rama `claude/simular-traslados-sedes-999c9c`

- [x] Cinco traslados simulados en la base LOCAL por `iniciar_traslado`, `registrar_recepcion_traslado` y `confirmar_traslado`
      (287 a 291; foto previa `antes-simular-traslados` con `scripts/flujo-de-negocio/estado.mjs`). Verificado en la pantalla
      desde Trujillo y desde Lima; sin stock negativo.
- [x] Tres maquetas en `docs/maquetas/traslados-visual-2026-10/` (A Ruta, B Mapa, C Horizonte) con su `index.html` y `README.md`.
      Probadas en el navegador: escritorio, celular (marco de 375 px), claro y oscuro, sin errores de consola; recorridos tocados:
      contar con escáner → terminé → confirmar con diferencia, anular un envío, cambiar de sede desde el mapa, reloj del mapa, zoom
      del horizonte.
- [x] ~~Decide Felipe entre A, B y C~~ — no convencieron (2026-10-06): «poco interactivas, poco entendibles».
- [x] Segunda ronda: D · Pases, E · La puerta, F · Conversaciones (`d-pases.html`, `e-puerta.html`, `f-conversaciones.html`), con
      `?sinmov` para revisarlas quietas. Probadas en el navegador (escritorio, celular, claro y oscuro, sin errores de consola):
      contar → terminé → confirmar, cerrar con diferencia, anular, responder un pedido, arrastrar la caja (E), girar el pase (D),
      la hoja de conteo dentro del chat (F). Prueba ciega con un agente sin contexto sobre las capturas: F 8/10, D 6/10, E 6/10
      (contar en la E, 8); sus confusiones se corrigieron (README, «Prueba ciega»). No se repitió la prueba después.
- [x] **Decidió Felipe (2026-10-06): la D, «tal cual».** Códigos del nombre (TRU, LIM, AQP; el Taller entero), contar con − / + (y
      pistola o cámara), movimiento rico como excepción a ADR-0136 (ADR-0355).
- [x] Construida en cinco actividades (ADR-0355): billetera y pase; reverso para contar; revisar y anular; pedidos y «Para enviar» como
      pases; «Lo siguiente» en el frente. Se conservó lo que la maqueta no dibujaba (buscar al escanear, prenda de más, firma, token
      contra doble clic, guardado por casilla). Guía de foco `aplicada`; auditor del tema en 0; probado contra la base local.

## Pendiente después de la D

- [ ] **Guía impresa con QR** (ADR-0242 D-3): el pase de salida suma «Guía» y el QR cuando exista (tarea aparte).
- [x] **`/formidable` sobre el pase** (2026-10-06): leyes 7,0 · oficio 6 (`docs/formidable/inventario-traslados.md`).
- [x] Los 3 cambios de Formidable y los 4 detalles, aprobados y hechos (2026-10-06); segunda prueba ciega en el informe.
- [ ] **Pasada con 3 a 5 colaboradoras reales**, con una caja de verdad (decide Felipe cuándo y con quién).
- [ ] **PR #808** («Colgar en el piso», ADR-0339): al fusionar, sus textos ganan sobre «Bajar estas al piso» de «Lo siguiente».
- [ ] `scripts/flujo-de-negocio/estado.mjs restaurar` falla con una fila vieja de `clientas` que no cumple su restricción (tarea aparte):
      la base local quedó con los traslados 292 a 294 y dos pedidos de prueba de esta obra.
