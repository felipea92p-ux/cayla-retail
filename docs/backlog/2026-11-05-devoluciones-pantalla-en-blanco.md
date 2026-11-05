# 2026-11-05 — Cambios y Devoluciones: la pantalla en blanco

- **Decisión de Felipe: la red en `reservaNecesaria`.** No reservar cuando volver adonde estaba dejaría la pantalla casi sin contenido (ADR-0185, actualización 2026-11-05). Cubriría cualquier pantalla nueva con una vista corta de éxito; no se midió cuántas de las actuales lo sufren. Cambia una pieza de todo el ERP.
- **Probar en un iPhone real** el recorrido de Devoluciones: se midió en Chrome emulando 375 px.
- Salir de un flujo deja la vista donde cae en la lista, no arriba (Cambios: `scrollY` 53; con la lista corta, al final de ella). Ya no hay aire, pero al entrar sí se sube. No se tocó.
- Aviso de hidratación en `/devoluciones` (en desarrollo): `data-mas-der` en la fila de filtros (`pildoras-desliza`), distinto entre servidor y navegador. No viene de este cambio.
