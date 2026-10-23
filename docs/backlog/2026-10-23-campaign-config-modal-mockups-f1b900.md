## 🏷️ Configurar campaña: la etiqueta viva (2026-10-23, ADR-0488) — solo web, sin migración; rama `claude/campaign-config-modal-mockups-f1b900`

- [x] Maquetas (`docs/maquetas/campana-configuracion-2026-10/`): Felipe eligió la II y la ajustó en cuatro vueltas.
- [x] Actividades 1 a 7: la hoja como «Prendas» (etiqueta y pie a la derecha, `pie-parejo`), «Cuánto baja» (`PasoCantidad` grande con «%»),
      «Cuándo rige» (`CampoFecha` con `rango`, barra de temporada y duración), «Categorías» (grilla de `Casilla` por familia con buscador),
      la etiqueta viva (mosaico, vuelo, «En caja», sello al guardar), su movimiento (`lib/campana-hoja-movimiento.test.ts`) y «Sugerido».
- [x] Actividad 8: `/chaos` (semilla 488: 0 estados imposibles) y `/formidable` (7,3 → 8,2 provisional); con el OK de Felipe, «Toda la
      familia», el candado de «Guardar» y los 3 cambios. `guias:recorrer` (1440 y 375) y `tema:auditar` (5 vistas) en verde.
- [ ] **Repetir la prueba ciega** con los cambios (las notas de formidable quedan provisionales hasta entonces), y una colaboradora real.
- [ ] **De Felipe (chaos):** con la hoja abierta en dos equipos, el segundo que guarda pisa al primero sin aviso (g2: la función
      `actualizar_campana_etiqueta` no tiene versión; arreglarlo pide una columna en `etiquetas` y que la ruta la mande). Y si una campaña
      puede ser del 100 % (hoy la hoja y la base lo dejan: regala la prenda).
- [ ] **«En caja»** muestra el precio de la prenda aunque una tienda cobre más, y no mira las tiendas de la campaña ni otra campaña mayor
      (escéptico, H8). **El aviso de reimprimir no recibe las tiendas** (ADR-0486, de antes): lo lleva la sesión «Reimprimir etiquetas al
      cambiar las tiendas de una campaña».
- [ ] **Piezas del sistema bajo el objetivo:** el botón de calendario de `CampoFecha` mide 20 px; con el dedo, `CampoFecha`, `Buscador` y
      los botones del pie quedan bajo 44 px. Para `/unificar`.
- [ ] **Sin probar en Tienda web ▸ Campañas en local:** la base local no tiene el módulo `campanas_web` (sus migraciones no están aplicadas).
      Es el mismo componente con los mismos datos que en Insignias.
- [ ] **De paso (fuera de esta rama):** la barra de temporada se dibuja igual en el pase de Insignias y en la hoja; si gana un tercer uso,
      vale una pieza (`LineaDeTemporada`). Y en la base local las prendas no tienen SKU: `PrendaConCosto.nombre` sale «Blusa Ivana (null)».
