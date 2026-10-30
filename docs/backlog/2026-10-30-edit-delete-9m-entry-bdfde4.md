## 🧵 Corregir y eliminar un ingreso de insumo (2026-10-30, ADR-0570 act. 6a) — web + 1 migración SIN pegar; rama `claude/edit-delete-9m-entry-bdfde4`

- [x] El lápiz de cada lote abre «Corregir este ingreso»; «Eliminar el ingreso» en la misma hoja; «Restaurar» bajo el color (`20261030134000`).
- [x] «Retirar color» con saldo dice dónde se arregla; el aviso de eliminar dice que ya se puede retirar.
- [x] Prueba SQL (`pnpm pruebas:insumos-corregir-ingreso`, 46 casos, con mutaciones y dos carreras reales), invariante INV-26 de `/chaos`, prueba de reglas de la web, `tema:auditar` de las dos hojas y `guias:recorrer` de Insumos.
- [ ] **Pegar `20261030134000` en producción** (entera, una vez; después de `20261029190000`; el SQL trae su camino de vuelta). La web funciona antes y después. Después refrescar el volcado del diccionario (`insumo_lotes.anulado_at`, tabla `insumo_lote_cambios`, y asignarla a su pájaro en `aviario.mjs`).
- [ ] **Decisión de Felipe:** hoy solo el líder corrige y elimina un ingreso (mueve el costo). ¿Se abre a quien ve Producción, como en las anotaciones de una orden?
- [ ] Lo que ya se usó solo se «ajusta lo que queda» (regla de Felipe): sin pantalla todavía. Y un lote que llegó con una factura u orden recibida se corrige desde su recepción: tampoco.
- [ ] Sin correr: `/formidable` y `/chaos` formal sobre las dos hojas. El resto de la actividad 6 (Insumos como «Estante en tabla») sigue sin construir.
