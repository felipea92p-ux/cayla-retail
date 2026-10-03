## 🗺️ Observatorio: el Inicio del Admin (2026-10-03, ADR-0322) — rama `claude/admin-dashboard-mockups-039625`

- [x] Maquetas v1 (descartada), v2 (Felipe eligió A) y v3 (claro, oscuro listo, zoom por tienda, mapa que llena su lado).
- [x] `fn_observatorio`, `fn_observatorio_tienda`, `fn_observatorio_turno` (solo Admin, sin ventas de prueba); `pnpm pruebas:observatorio` 14/14, cableada en el CI.
- [x] Contornos del INEI derivados y simplificados (14 KB, MPL-2.0 con atribución); geometría y zoom puros con prueba (10).
- [x] Cuentas puras (`lib/observatorio-reglas.ts`, 16 pruebas): hoy contra la semana pasada a esta hora, 7 y 30 días cortados a la misma altura, ranking, panel de tienda, avisos.
- [x] Pantalla completa: cabecera, mapa con zoom y transformación del contorno, panel global y de tienda (Ritmo, Productos, Equipo, Stock), Taller, «Por revisar» con detalle, «Repetir el día», lectura cada 30 s con onda y ticker, teclado (Escape, ← →).
- [x] Inicio en CAYLA Global (ADR-0275 act.): `vista-global.ts`, `proxy.ts`, selector de sede que se queda en el Inicio.
- [x] Verificado en el navegador con ventas de demostración (base local devuelta idéntica a la foto): 1440, 1920, 375 px; sin las funciones, el Inicio de siempre.
- [ ] **Producción (Felipe): pegar `supabase/migrations/20261004010000_observatorio_inicio_del_admin.sql`** en el SQL Editor (una sola parte: solo `create or replace function`, sin `alter` ni políticas) o `db push`. Hasta entonces el Admin ve el Inicio de siempre.
- [ ] Después de pegarla: `pnpm datos:generar:produccion` y `pnpm datos:comparar` (hoy `datos:comparar` marca las tres funciones como «no aceptadas por producción», es lo esperado); regenerar los tipos para quitar los `as never` de `lib/observatorio.ts`.
- [ ] Verlo en producción con las cifras reales: metas de cada tienda (`ubicacion_metas_dia` / `meta_venta_diaria`), la tienda de Arequipa en el mapa (se ubica por la sigla AQP de su nombre), y el turno que viene de Dynamic.
- [ ] **No visto en vivo:** el movimiento a velocidad real (el panel del navegador estaba oculto y se verificó con los cuadros simulados); la onda de una venta que llega durante la lectura de 30 s; la transición de vista del detalle de un aviso.
- [ ] Decisión de Felipe, si la quiere: qué hace el mapa con una tienda nueva de otra ciudad (hoy sale en el ranking y en el panel, sin punto).
- [ ] Bajo: en una pantalla de 1440 px con el menú abierto, los controles bajan a una segunda línea (en la maqueta, con el menú angosto, iban a la derecha); a 1920 px van a la derecha.
