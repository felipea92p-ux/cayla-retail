## 🗺️ Observatorio: el Inicio del Admin (2026-10-03, ADR-0322) — rama `claude/admin-dashboard-mockups-039625`

- [x] Maquetas v1 (descartada), v2 (Felipe eligió A) y v3 (claro, oscuro listo, zoom por tienda, mapa que llena su lado).
- [x] `fn_observatorio`, `fn_observatorio_tienda`, `fn_observatorio_turno` (solo Admin, sin ventas de prueba); `pnpm pruebas:observatorio` 14/14, cableada en el CI.
- [x] Contornos del INEI derivados y simplificados (14 KB, MPL-2.0 con atribución); geometría y zoom puros con prueba (10).
- [x] Cuentas puras (`lib/observatorio-reglas.ts`, 16 pruebas): hoy contra la semana pasada a esta hora, 7 y 30 días cortados a la misma altura, ranking, panel de tienda, avisos.
- [x] Pantalla completa: cabecera, mapa con zoom y transformación del contorno, panel global y de tienda (Ritmo, Productos, Equipo, Stock), Taller, «Por revisar» con detalle, «Repetir el día», lectura cada 30 s con onda y ticker, teclado (Escape, ← →).
- [x] Inicio en CAYLA Global (ADR-0275 act.): `vista-global.ts`, `proxy.ts`, selector de sede que se queda en el Inicio.
- [x] Verificado en el navegador con ventas de demostración (base local devuelta idéntica a la foto): 1440, 1920, 375 px; sin las funciones, el Inicio de siempre.
- [x] **Producción:** aplicada el 2026-10-03 por MCP (versión registrada `20261003220357`; archivo `20261004020000_observatorio_inicio_del_admin.sql`). md5 de los tres cuerpos iguales al archivo; corrida como Admin: 63 ms, tres tiendas, turno leído.
- [ ] Refrescar el volcado (`pnpm datos:refrescar` por MCP, ver memoria «refrescar el volcado») y después `pnpm datos:generar:produccion` y `pnpm datos:comparar`, para que el diccionario tenga las tres funciones; regenerar los tipos para quitar los `as never` de `lib/observatorio.ts`.
- [ ] **Felipe: cargar la meta de cada tienda en Configuración.** En producción ninguna tiene (corrida del 2026-10-03): sin meta, el Observatorio dice «Sin meta configurada» y el ranking va por lo vendido. Las tres tiendas (Tienda AQP, LIM, TRU) se ubican en el mapa por su sigla.
- [ ] **No visto en vivo:** el movimiento a velocidad real (el panel del navegador estaba oculto y se verificó con los cuadros simulados); la onda de una venta que llega durante la lectura de 30 s; la transición de vista del detalle de un aviso.
- [ ] Decisión de Felipe, si la quiere: qué hace el mapa con una tienda nueva de otra ciudad (hoy sale en el ranking y en el panel, sin punto).
- [ ] Bajo: en una pantalla de 1440 px con el menú abierto, los controles bajan a una segunda línea (en la maqueta, con el menú angosto, iban a la derecha); a 1920 px van a la derecha.
