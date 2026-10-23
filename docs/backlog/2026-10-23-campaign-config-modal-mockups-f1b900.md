## 🏷️ Configurar campaña: la etiqueta viva (2026-10-23, ADR-0488) — solo web, sin migración; rama `claude/campaign-config-modal-mockups-f1b900`

- [x] Maquetas (`docs/maquetas/campana-configuracion-2026-10/`): Felipe eligió la II y la ajustó en cuatro vueltas.
- [x] Actividades 1 a 7: la hoja como «Prendas» (etiqueta y pie a la derecha, `pie-parejo`), «Cuánto baja» (`PasoCantidad` grande con «%»),
      «Cuándo rige» (`CampoFecha` con `rango`, barra de temporada y duración), «Categorías» (grilla de `Casilla` por familia con buscador),
      la etiqueta viva (mosaico, vuelo, «En caja», sello al guardar), su movimiento (`lib/campana-hoja-movimiento.test.ts`) y «Sugerido».
- [ ] **Actividad 8:** `/formidable` y `/chaos` de la hoja (doble clic en Guardar, Escape con el calendario abierto, red caída al guardar,
      375 px), y el PR con `/abrir-pr`.
- [ ] **Correr `guias:recorrer` (productos.sellos, 1440 y 375) y `tema:auditar` (`sellos.campana`, `sellos.campana.llena`)**: esta Mac no
      tiene Chromium de Playwright (`pnpm exec playwright install`). La guía se recorrió a mano con `?demo=1`.
- [ ] **Sin probar en Tienda web ▸ Campañas en local:** la base local no tiene el módulo `campanas_web` (sus migraciones no están aplicadas).
      Es el mismo componente con los mismos datos que en Insignias.
- [ ] **De paso (fuera de esta rama):** la barra de temporada se dibuja igual en el pase de Insignias y en la hoja; si gana un tercer uso,
      vale una pieza (`LineaDeTemporada`). Y en la base local las prendas no tienen SKU: `PrendaConCosto.nombre` sale «Blusa Ivana (null)».
