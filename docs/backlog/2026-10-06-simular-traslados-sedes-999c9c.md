## 🚚 Traslados visual: tres maquetas (2026-10-06) — solo maquetas, sin web ni migración; rama `claude/simular-traslados-sedes-999c9c`

- [x] Cinco traslados simulados en la base LOCAL por `iniciar_traslado`, `registrar_recepcion_traslado` y `confirmar_traslado`
      (287 a 291; foto previa `antes-simular-traslados` con `scripts/flujo-de-negocio/estado.mjs`). Verificado en la pantalla
      desde Trujillo y desde Lima; sin stock negativo.
- [x] Tres maquetas en `docs/maquetas/traslados-visual-2026-10/` (A Ruta, B Mapa, C Horizonte) con su `index.html` y `README.md`.
      Probadas en el navegador: escritorio, celular (marco de 375 px), claro y oscuro, sin errores de consola; recorridos tocados:
      contar con escáner → terminé → confirmar con diferencia, anular un envío, cambiar de sede desde el mapa, reloj del mapa, zoom
      del horizonte.
- [ ] **Decide Felipe:** cuál de las tres (o una mezcla), el movimiento rico en Traslados (actualización de ADR-0136), los colores
      de cada situación y la columna de estados de la A frente a ADR-0242 D-1. Con eso: ADR y construcción con `/construir`.
- [ ] Al construir: conservar lo que la maqueta no dibuja (buscar al escanear, prenda que no venía, firma «Responsable», token
      contra doble clic), declarar la guía de foco del cajón y pasar `/formidable`.
