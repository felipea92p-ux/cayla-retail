## 🧾 Vender: «Hoy» de la sede que se mira, no de la anterior (2026-10-11) — solo web, sin migración; rama `claude/agitated-dhawan-6e1207`

- [x] **Causa raíz.** `UbicacionSwitcher` cambia de sede con `router.refresh()`: `PuntoDeVenta` (con `key="caja"` en las dos sedes)
  no se monta de nuevo y `useVentasDeHoy` arrancaba con `useState(inicial)`, así que ignoraba las ventas que el servidor ya mandaba
  para la sede nueva; con `version === 0` (sin vender desde que se montó) tampoco releía. El valor del servidor era correcto: para un
  líder (el único que ve el selector) `fn_ventas_del_dia` filtra por `p_ubicacion_id`.
- [x] **Reproducido en local** (cuenta del seed, ventas locales movidas a hoy y devueltas después): Trujillo «Hoy S/149.90» → selector a
  Lima → cabecera «Tienda Lima» con «Hoy S/149.90». Ir a Caja o Apartados y volver por el menú lateral sí mostraba bien la sede (monta
  de nuevo), en los dos sentidos.
- [x] **Prueba primero:** `lib/useVentasDeHoy.test.ts` corre el hook real con un mini-render de hooks y un doble de la base; contra el
  código de antes fallaban 6 de 9 (cambio de sede, ida y vuelta, cambio tras vender, relectura tardía de la otra sede, lectura nueva del
  servidor en la misma sede y el fallo que se arrastraba). La regla pura, en `lib/vender-conectado.test.ts`.
- [x] **Arreglo:** el hook vive en `lib/useVentasDeHoy.ts` (sale de `components/VentasDeHoy.tsx`, que queda con la lista) y usa
  `lecturaDelServidor` / `alDiaConElServidor` / `conRelectura` de `lib/vender-hoy-reglas.ts`: manda la lectura más nueva del servidor
  apenas llega, y una relectura del navegador solo cuenta si es de la sede que se mira.
- [x] **Verificado en el navegador local** con clics reales y sin recargar (marca en `window` que sobrevive): Trujillo S/149.90 → Lima
  S/489.60 → Trujillo S/149.90; la lista dice «Tienda Lima · 3 ventas · S/489.60». En escritorio (1280) y a **375 px** (PL-105), sin
  desborde horizontal; consola y servidor sin errores. `vitest` completo (412 archivos), `tsc` y `eslint` limpios.
- [ ] **Sin probar en producción.** Cómo verificas tú: en Vender, con la sede A, mira «Hoy»; cambia a la sede B con el selector de la
  cabecera, sin recargar: «Hoy» tiene que decir lo mismo que «Ventas de hoy» de B (ábrela: el encabezado dice la sede y el total).
- [ ] **Aparte, por decidir:** el resto del ticket (prendas, cliente, pagos, descuento) también sobrevive al cambio de sede por la misma
  razón. No se tocó aquí: es una decisión de negocio (¿se vacía el ticket al cambiar de sede?).
