## 🧾 Gasto fijo: cuándo vence y cuántos días antes se paga (2026-10-23, ADR-0487) — rama `claude/missing-expiration-date-0cee47`

- [x] Paso 1 · «Cuándo vence» en vez de «Cuándo llega» (modal, lista, «Faltan», bandeja, Resumen, guías). Sin migración.
- [x] Paso 2 · `dias_antes` + `fecha_pago` + `toca_pagar`, `guardar_gasto_fijo` (12 argumentos), Flujo proyecta en la fecha de pago. Web: campo, «Toca pagar», columna.
- [x] Migración `20261023173000_gasto_fijo_pagar_dias_antes.sql` **pegada en producción el 2026-10-23** y comprobada por sus efectos (solo lectura); el check «SQL pegado» del PR #1282 en verde.
- [ ] Refrescar el diccionario de datos (`docs/datos/generado/`, foto del 09-23): `gastos_fijos` ganó `dias_antes` y `fn_gastos_fijos_mes`, tres columnas (`generado/COMO-REFRESCAR.md`).
- [ ] **Cargar el día real de vencimiento de los 14 recibos** que hoy dicen «la quincena» (Configuración ▸ Gastos fijos; salen del «vence» impreso en cada recibo). Sin eso la pantalla es precisa sobre datos inventados.
- [ ] Confirmar si «Celular Tienda TRU» (S/ 19.90, TRU) y «Telefonía Bitel 901728230» son el mismo fijo; si lo son, no crear el segundo (suma dos veces en el Flujo y deja dos «falta»).
- [ ] `/chaos` y `/formidable` sobre el modal de gasto fijo, y su guía de foco (`GastoFijoModal` sigue `PENDIENTE`); requieren la pila local con sesión.
- [ ] Idea: que el fijo aprenda el vencimiento del último recibo registrado (hoy la plantilla guarda un día típico y el real se anota al registrar).
- [ ] Idea: «Toca pagar» también en el Inicio / la bandeja «Falta revisar».
- [ ] Idea: «Llega con» → «Comprobante» (hoy convive con «Vence» y puede leerse como una fecha).
