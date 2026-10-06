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
- [ ] **Decide Felipe:** D, E, F o una mezcla; los códigos de tienda (TRU, LIM, AQP; el Taller entero); contar tocando prendas o con − / +; el
      movimiento rico (actualización de ADR-0136). Con eso: ADR y construcción con `/construir`.
- [ ] Al construir: conservar lo que la maqueta no dibuja (buscar al escanear, prenda que no venía, firma «Responsable», token
      contra doble clic), declarar la guía de foco del cajón y pasar `/formidable`.
