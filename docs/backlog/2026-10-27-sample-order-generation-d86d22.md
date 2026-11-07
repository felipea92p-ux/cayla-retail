## 2026-10-27 — Molde listo en «Nueva orden» (rama claude/sample-order-generation-d86d22)
Estado: PR abierto, sin migración.
- [x] Regla pura `moldeDelModelo` / `frasesDelMolde` con 17 pruebas nuevas en `lib/orden-modelo-reglas.test.ts`.
- [x] `getHistorialDeMoldes` (consulta liviana, sin el tope de 60 del tablero) y frase junto al tipo de orden.
- [x] Verificado en el navegador con datos inventados: muestra hecha, sin historia, muestra a medias, sin lectura y modelo nuevo.
- [ ] Probar en la pantalla real con una cuenta Líder del Taller.
- [ ] `/formidable` y `/chaos` de la hoja (guarda órdenes).
- [ ] Decidir con Felipe si el tipo debe arrancar distinto cuando no hay historia (hoy sigue siendo lote para un modelo que existe, muestra para uno nuevo).
- [ ] Si los modelos viejos siguen confundiendo, opción B: dato «molde listo» en el modelo (cambio de esquema, necesita OK).
