# Guías: al volver con ←, la guía reabre lo que el paso necesita — 2026-11-18

Rama `claude/guias-volver-sin-saltos`. Sigue a `2026-11-18-sleepy-bohr-437da6.md` (los pliegues con `para`).

- [x] El motor reabre, al volver, lo que el paso necesita y ya no está: repite el `preparar` del paso que lo abrió (`fuenteAlVolver`) y,
      si eso tampoco está, sigue hacia atrás hasta 4 niveles. Solo al volver y solo si falta algo.
- [x] Pestañas y vistas: «Buscar y filtrar» y «El detalle de un gasto» (Gastos), «En mi plan» (Calendario), «Cambiar varias de una vez»
      (Editar producto) y «Busca una prenda» (Existencias) eligen lo suyo.
- [x] Los 26 pasos con `prepararSoloAlAvanzar` dejaron de necesitarlo y la bandera salió del motor. La casilla de Vitrina usa
      `para: "marcar"`; la × de «Vista: Tabla», `siEsta`.
- [ ] **Las demás guías no se recorrieron de ida y vuelta.** El cambio del motor les llega a todas (unas 80), pero se probó en las 15 que
      tocan los últimos tres PR. El script de ida y vuelta vive fuera de git (`apps/web/guias/.salida/ida-vuelta.mjs`); sumarlo al
      recorredor (`guias:recorrer --ida-y-vuelta`) lo dejaría para todas.
