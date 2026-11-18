# Guías: al volver con ←, la guía reabre lo que el paso necesita — 2026-11-18

Rama `claude/guias-volver-sin-saltos`. Sigue a `2026-11-18-sleepy-bohr-437da6.md` (los pliegues con `para`).

- [x] El motor reabre, al volver, lo que el paso necesita y ya no está: repite el `preparar` del paso que lo abrió (`fuenteAlVolver`) y,
      si eso tampoco está, sigue hacia atrás hasta 4 niveles. Solo al volver y solo si falta algo.
- [x] Pestañas y vistas: «Buscar y filtrar» y «El detalle de un gasto» (Gastos), «Cambiar varias de una vez» (Editar producto) y «Busca
      una prenda» (Existencias) eligen lo suyo.
- [ ] **Las demás guías no se recorrieron de ida y vuelta.** El cambio del motor les llega a todas, pero solo se probó en estas 9. El
      script de ida y vuelta vive fuera de git (`apps/web/guias/.salida/ida-vuelta.mjs`); sumarlo al recorredor (`guias:recorrer
      --ida-y-vuelta`) lo dejaría para todas.
- [ ] **Los 26 pasos con `prepararSoloAlAvanzar`** siguen igual (Mi plata, Calendario del plan, Vitrina, Looks, Probador, Tráfico): al
      volver, el motor no repite su `preparar`, así que un paso de su hoja puede saltarse todavía.
