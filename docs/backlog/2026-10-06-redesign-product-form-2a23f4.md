## 🧭 Nuevo producto: puntos de avance y la vuelta como flecha (2026-10-06, ADR-0260 act. · ADR-0136 act. · ADR-0220 act.) — solo web, sin migración; rama `claude/redesign-product-form-2a23f4`

- [x] Lienzo de propuestas (https://claude.ai/artifact/WSGQs3a9bH2L5hLtqakSh6): láminas A–D (rediseños completos, no elegidos) y la E
      (el formulario de hoy con los puntos), aprobada por Felipe.
- [x] `PuntosAvance` + `lib/puntos-avance.ts` (8 pruebas) + `app/estilos/puntos-avance.css`; solo el paso abierto en `PasoAlta`;
      «← Atrás» en los pasos 2–4; `FichaPrevia` sin «Avance».
- [x] `Volver forma="flecha"` + ranura `volver` en `EncabezadoPagina`; 12 pantallas migradas (Inventario, Conteo, Traslados, Pedidos no
      atendidos, Nuevo producto). CLAUDE.md al día (excepción del latido y regla de la vuelta).
- [x] Verificado: `tsc`, `eslint`, `vitest` completo (369 archivos, 156.345 pruebas); recorrido en el ERP local con Playwright (cuenta
      `admin`, sin crear el producto) a 1440 y 375 px, claro y oscuro; `tema:auditar` sin hallazgos en oscuro.
- [ ] **Sin probar con una cuenta real** ni crear un producto de punta a punta con los puntos (la base local no tiene patrones: en
      Indumentaria no se pasa del paso 2; se recorrió con Bisutería).
- [ ] **Sin ver en pantalla** (la base local no las carga, les faltan funciones de migraciones posteriores): la flecha en Pedidos no
      atendidos, Ventas sin registrar y las pantallas del Conteo. El cambio ahí es el mismo de una línea que en las demás.
- [ ] Correr `/formidable` sobre Nuevo producto (obligatoria al terminar una pantalla; no se corrió en esta sesión).
