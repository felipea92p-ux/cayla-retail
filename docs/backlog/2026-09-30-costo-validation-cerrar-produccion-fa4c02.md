## 🛡️ Tope de costo atípico en las cuatro puertas del costo (2026-09-30, ADR-0296) — migraciones EN producción desde el 2026-10-01; rama `claude/costo-validation-cerrar-produccion-fa4c02`

Cierra el ítem 6 de `docs/backlog/2026-09-29-top-30-pendientes-erp.md` (EI-7 del cimiento 9) y lo extiende a Compras.

- [x] **La regla:** `fn_costo_fuera_de_banda` (pura, interna): sin costo, igual o mayor que el precio, más de 2× o menos de 2/3 del vigente. 28 pruebas y 6 mutantes muertos.
- [x] **Producción:** `cerrar_produccion` (parámetro `p_confirma_costo_atipico`; solo un líder confirma) + `OrdenCierre.tsx`. 20 pruebas, 7 mutantes.
- [x] **Lote sin factura:** `recibir_lote` (marca `confirma_costo` por línea; firma intacta) + `RecepcionFormV2.tsx`. 23 pruebas, 7 mutantes. El cero es un obsequio: no se pregunta.
- [x] **Factura:** `registrar_compra` (marca por línea; firma de 15 parámetros intacta; confirma quien registra) + `CompraFormV2.tsx`. 21 pruebas, 8 mutantes.
- [x] **Fuera de comprobante de un envío:** `recibir_envio` (marca por extra; firma de 9 intacta) + `RecepcionEnvio.tsx`/`ResumenPrevioEnvio.tsx`. 20 pruebas, 8 mutantes.
- [x] Verificado en el navegador con los componentes reales contra PostgREST y una base privada (líder e integrante, en las cuatro pantallas). Toda la batería web (≈153 mil pruebas) y 22 suites SQL en verde.
- [x] **Pegadas en producción el 2026-10-01** (las cinco, en orden, por el conector; huellas de las funciones vivas = las de los archivos; ADR-0296 §8).
- [ ] Refrescar `docs/datos/generado/` (`pnpm datos:generar:produccion`) con las funciones nuevas.
- [ ] **Decisión de Felipe — lote:** ¿un integrante puede teclear costo al recibir un lote sin factura? Hoy la pantalla se lo deja y choca con ADR-0126; con esta regla además le da un canal lateral para acotar el costo. Opciones en ADR-0296 §7.
- [ ] **Decisión de Felipe — Producción:** al encender el módulo para el rol Integrante, toda orden con costo total 0 solo la cierra un líder: definir quién teclea el costo al abrirla.
- [ ] **Revisar a los ~10 cierres reales:** medir la variación verdadera de costo (consulta en ADR-0296 §3) y ajustar la banda si hace falta; el 0,25 es un supuesto.
- [ ] **Corregir un costo ya contaminado** sigue sin existir: `revertir_produccion` no lo deshace y el candado de `20260927190000` impide la corrección manual. Tarea aparte («Que revertir_produccion también deshaga el costo»).
- [ ] **Ramas ajenas:** toda rama cuyas pruebas registren facturas, lotes u órdenes con precios arbitrarios necesita `confirma_costo` (ver las nueve pruebas ajustadas aquí).
- [ ] **Sin probar:** las pantallas a 375 px (son de escritorio); la ruta completa de cada pantalla con sesión real (se montó el componente real en una página de prueba).
- [ ] **El cargador masivo del censo de TRU** (backlog #5, 826 ítems) escribirá costos: debe llamar a `fn_costo_fuera_de_banda` directamente, porque no pasa por ninguna pantalla de tecleo.
