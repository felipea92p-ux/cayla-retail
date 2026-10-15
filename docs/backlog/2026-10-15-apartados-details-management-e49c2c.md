## 🧾 Detalle del apartado: historial, abonar y aplazar (2026-10-15, ADR-0414) — migración `20261015151000` SIN PEGAR; rama `claude/apartados-details-management-e49c2c`

- [x] La fila del Historial abre `DetalleApartadoModal` (`components/apartados/DetalleApartado.tsx`); con teclado, el nombre es su botón.
- [x] Historial con cada pago (día, hora, medio, vuelto, quién cobró), aplazamientos, avisos, entrega, liberación y devolución (`lib/apartado-detalle-reglas.ts`, 15 pruebas).
- [x] Abonar desde la hoja (`AbonarFormulario`, sacado de `AbonarModal` sin cambiar lo que hace) y aplazar (+3, +7 u otra fecha) con guía de foco.
- [x] Base: `aplazar_separacion` (2 veces, tope 30 días, idempotente por fecha), `extender_separacion` = aplazar 7 días, `fn_detalle_separacion`. Suite `separaciones.mjs` 90/90 (7 nuevas).
- [x] Verificado en Chrome sin ventana contra una pila propia: escritorio, 375 px, oscuro; aplazar y abonar guardan y el historial se actualiza; cero errores de consola.
- [ ] **Pegar `20261015151000` en producción ANTES de publicar la web** (con el OK de Felipe; una sola parte, sin políticas).
- [ ] `/chaos` de la hoja de aplazar no corrido (base local compartida atrasada al 30-sep); el doble clic y los topes sí están probados en la suite de la base.
- [ ] `/formidable` no corrido.
