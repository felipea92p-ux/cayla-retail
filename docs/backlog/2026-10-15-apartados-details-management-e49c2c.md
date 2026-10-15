## 🧾 Detalle del apartado: historial, abonar y aplazar (2026-10-15, ADR-0414) — migración `20261015151000` EN PRODUCCIÓN (versión `20261015161341`); rama `claude/apartados-details-management-e49c2c`

- [x] La fila del Historial abre `DetalleApartadoModal` (`components/apartados/DetalleApartado.tsx`); con teclado, el nombre es su botón.
- [x] Historial con cada pago (día, hora, medio, vuelto, quién cobró), aplazamientos, avisos, entrega, liberación y devolución (`lib/apartado-detalle-reglas.ts`, 15 pruebas).
- [x] Abonar desde la hoja (`AbonarFormulario`, sacado de `AbonarModal` sin cambiar lo que hace) y aplazar (+3, +7 u otra fecha) con guía de foco.
- [x] Base: `aplazar_separacion` (2 veces, tope 30 días, idempotente por fecha), `extender_separacion` = aplazar 7 días, `fn_detalle_separacion`. Suite `separaciones.mjs` 90/90 (7 nuevas).
- [x] Verificado en Chrome sin ventana contra una pila propia: escritorio, 375 px, oscuro; aplazar y abonar guardan y el historial se actualiza; cero errores de consola.
- [x] `20261015151000` pegada en producción el 2026-10-15 con el OK de Felipe (sonda, ensayo revertido, `apply_migration`, huellas md5 verificadas).
- [x] `/chaos` (semilla 1415, pila propia): 22 ataques, 0 violaciones nuevas; los 4 hallazgos de la hoja cerrados con su prueba y repetidos con la misma semilla.
- [x] `/formidable`: ciega ✓ (6 toques, 0 errores evitables); los 3 cambios hechos (destrabar y foco, «2 pagos» y el aviso del abono, releer tras un corte). Leyes 7,6 · oficio 6.
- [ ] **De Felipe:** «2,5» se guarda como 25 en `CampoMonto` (29 campos del ERP, también el cobro de Vender).
- [ ] **De Felipe:** permisos del detalle (ver chat de la sesión; no se versiona).
- [ ] Repetir la prueba ciega sobre la hoja ya arreglada; botones del pie y × a 44 px en el celular (piezas del sistema).
