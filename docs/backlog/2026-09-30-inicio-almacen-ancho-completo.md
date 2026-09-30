## 🧭 Inicio de almacén: ancho completo (2026-09-30, ADR-0292, Felipe) — solo web; rama `claude/inicio-almacen-ancho-completo`

- [x] El Inicio de almacén ocupa todo el ancho (marcador `data-ancho-completo` + `has-[[data-ancho-completo]]:max-w-none` en `AppShell`) y crece con el ancho (tarjeta 250 → 360 px, título 56 → 104 px, columnas con tope desde 1500 px). Resuelve el pendiente «quitar el tope de ancho solo para esta cuenta o para todas» de `2026-09-30-warehouse-account-mockups-425887.md`: **solo para esta cuenta**.
- [x] Candado: `lib/ancho-completo.test.ts` (que «/» no entre a `SIN_TOPE_DE_ANCHO`, que `AppShell` conserve la regla y que solo el Inicio de almacén escriba el marcador).
- [ ] **Decisión de Felipe (si la quiere):** el Inicio de las demás cuentas sigue en 64 rem. Si también debe ocupar todo el ancho, hay que revisar cada uno (Equipo de hoy, «Te toca» de tienda) a 1920+ px antes de pedir el marcador.
- [ ] **Sin probar:** un zoom real del navegador (se emuló el ancho de ventana), Safari y Firefox, y la terminal real en una pantalla grande con datos de producción.
