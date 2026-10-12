## 📊 «Resumen disponible» sin cobertura, con ventas del mes (2026-10-01, ADR-0303) — solo web; rama `claude/resumen-disponible-simple`

- [x] `components/ResumenStockOverlay.tsx` reemplaza a `ResumenComercialOverlay.tsx`; las cuentas son `lib/existencias-resumen.ts` (20 pruebas); las ventas del mes se leen al abrir (`lib/useVentasDelMes.ts` → `GET /api/existencias/ventas-del-mes`, `getVentasDelMesDeSede`). Se borran `lib/existencias-comercial.ts` y su prueba.
- [ ] **Sin probar:** la ventana en el Taller (sin piso/almacén) y con ventas reales del mes (hoy es día 1: lo vendido salió en 0; se vio con ventas simuladas en el navegador).
- [x] `recortarFilaSemana` (`lib/existencias-categorias.ts`) quedó sin quien lo llame; `getFilasSemanaDeSede` sigue vivo para el cambio de 7 días del Taller. Borrar el recorte cuando se decida si ese cambio también se simplifica. **Borrado el 2026-10-06:** el cambio de 7 días (`deltaDisponibleSede`) se calcula en el servidor y no necesitaba el recorte; `getFilasSemanaDeSede` sigue igual.
- [x] `DisponibleTotalOverlay.tsx` sigue en el repo sin usar (ya lo estaba). **Borrado el 2026-10-06** (rama `claude/determined-thompson-f7b8d8`).
- [ ] Por decidir: el «valor a precio de venta» (lo veían solo los líderes) se quitó; si se quiere de vuelta, va como cifra aparte de líder.
