## 📦 Cierre «ya estaban registradas» (2026-10-31, ADR-0551 actividad 3) — rama `claude/regularizar-stock-trujillo-369714`, SIN commit ni PR

- [x] Migración `20261031171000_produccion_cierre_ya_estaba_en_stock.sql` + `pruebas:produccion-ya-estaba` (19 casos) + casilla en `PasarAlStockModal` + guía interactiva + huella.
- [ ] **POR PEGAR en producción** (una sola parte; solo toca `producciones` y 3 funciones; anclas verificadas el 2026-10-31). Ensayo con excepción antes de pegarla, y aviso a quien esté en Producción.
- [ ] Después de pegar y fusionar: cerrar OP-000001 (Chaleco Cayla) con la casilla marcada. **Antes de eso NO usar «Pasar al stock» normal ni «Llevarlas a las tiendas»**: duplican las 57 prendas que ya están en Tienda TRU.
- [ ] Decisión de Felipe (dinero): ¿el costo real del Chaleco entra al promedio de `variantes.costo` (hoy 30.00 en producción) o se queda solo en la orden? Hoy: solo en la orden.
- [ ] Diccionario de datos: `producciones.ingreso_al_stock` entra cuando se aplique en producción y se refresque el volcado (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] Ronda de modo oscuro del estado nuevo de la hoja (`tema:auditar`, escenario de «Pasar al stock» con la casilla marcada): no corrida.
