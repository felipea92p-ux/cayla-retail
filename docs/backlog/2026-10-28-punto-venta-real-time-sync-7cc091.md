## 2026-10-28 · Vender: stock en vivo tras vender · rama `claude/punto-venta-real-time-sync-7cc091`
- [x] El sondeo de stock olvida lo que Vender cambió por su cuenta (vender, bajar al piso, releer), para no callarse con «nada cambió».
- [ ] Probarlo en el navegador con una caja real: vender las últimas unidades de una prenda, bajar del almacén y ver que vuelve en ≤ 10 s (también cambiando de pestaña).
- [ ] Si se quiere que se vea al instante y no a los 10 s, evaluar Supabase Realtime (hoy la publicación está en 0 tablas y activarla toca el proyecto compartido con Dynamic: decisión de Felipe, ADR-0018).
