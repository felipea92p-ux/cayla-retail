## 🧮 Nota «el cierre de este conteo restó N» al editar un conteo (2026-09-30, ADR-0282 actualización) — migración `20260930050000` sin aplicar en producción; rama `claude/inventory-count-logic-6d804c`

- [x] `fn_conteo_lineas_json` trae `ajustado_total` y `ajustado_antes`; la nota de Contar y Revisar reparte lo de otros y lo del cierre (`notaDeLinea`). 3 casos SQL en local con ROLLBACK (cierre simple, con venta de por medio, tercera edición) y pruebas de `conteo-reglas`, `control-conteo` y `conteo-revision`. Suite web completa y `tsc` en verde.
- [ ] **POR PEGAR (2026-09-30):** pegar `supabase/migrations/20260930050000_conteo_ajuste_previo_en_la_nota.sql` (una sola parte; incluye un índice parcial sobre `movimientos`, candado corto: fuera de la hora de venta) después de `20260930010100` y `20260930020100`.
- [ ] **Sin verlo en pantalla:** la base local no tiene aplicado el rediseño del conteo, así que no se recorrió en el navegador. Al aplicarla, repetir Conteo 13: cerrar con 0 → «Editar conteo» → contar 1 y mirar la nota en Contar y en Revisar.
- [ ] **Sin decidir (Felipe):** en Confirmar y en Resultado la línea sigue diciendo `0 → 1` sin el «antes» del cierre (1 → 0 → 1); y la fila reabierta sin tocar muestra «Falta 1 · Confirmado» con el «debe haber» de entonces, aunque el stock ya es 0. No se tocó: no era lo pedido.

## 🧑 Responsable solo al abrir el conteo (2026-09-30, ADR-0282 actualización b) — solo web, sin migración

- [x] Contar, Revisar, Cancelar y alta al vuelo reutilizan el responsable elegido al abrir; «Editar conteo» va directo a las variantes ajustadas. Suite web completa y `tsc` en verde.
- [ ] **Sin probar en producción** (se publica al fusionar): repetir los 3 casos con la cuenta de Almacén Trujillo y capturas.
- [ ] **Conteo 17 abierto en producción** (Almacén de tienda, solo Camisas y Blusas, vacío, abrió Angie): cancelarlo tras probar.
- [ ] **Sin decidir (Felipe):** el historial dice «Cerró —» en los conteos cerrados con la cuenta de tienda (15 y 16) porque «Cerrar» va sin responsable (ADR-0280): el cierre, que es lo que ajusta el stock, no queda a nombre de nadie.
