## 🧾 Cuadrar las puentes de las máquinas (2026-11-07, ADR-0629) — Fase A con migración `20261107214000`, PEGADA en producción el 2026-11-07; rama `claude/sales-reconciliation-issues-ac6809`

- [x] Lo pendiente de un día es el residuo (cobrado − depósitos vigentes), con `ya_depositado`; un residuo negativo no es pendiente.
- [x] El diario revierte la comisión estimada de un día una sola vez (reemplazo anclado en `fn_asientos_dinero_y_caja`).
- [x] «Cuadrar depósitos» propone el residuo con su comisión proporcional y lo dice; el formulario del depósito marca «después del depósito».
- [x] `pos_tarifas.gratis_hasta_dia` y la fila del QR de Izipay (gratis hasta el día 10 desde el 1-nov-2026).
- [x] Pruebas: `pnpm pruebas:puente-residuo` 32/32 (con mutación), `comision-estimada` 35/35, `pos-maquinas` 84/84 en una pila propia con todas las migraciones de main.
- [x] Anulado con motivo el depósito de máquina sin días del 06-nov (el candado lo exigía) y pegada la migración (2026-11-07, con el OK de Felipe). Verificado con SELECT: lo pendiente de cada puente es igual a su saldo al céntimo.
- [ ] **Con el OK de Felipe:** corregir los depósitos de máquina anotados a otro banco que Interbank Empresas; reemplazar por lo real la comisión del depósito de los primeros días de noviembre; decidir el abono sin días de octubre (un ajuste de un cambio, anterior al arranque de la puente).
- [ ] **Antes del 10-nov:** confirmar con el extracto de Izipay si el día 10 es gratis (en octubre se cobró desde el 10).
- [ ] **Decisión de Felipe:** el QR que no llegó al banco (reclamo a Izipay, venta mal cobrada o pérdida).
- [ ] Refrescar `docs/datos/generado/` cuando la migración esté en producción.
- [ ] **Fase B (pantalla):** la puente sale de «Cuadrar con el banco»; el QR de Izipay pago por pago con «pega los montos del banco» y emparejamiento por monto y hora; Vendemás por lote neto del día. Con guía de foco, guía interactiva, `/chaos` y `/formidable`.
- [ ] Configuración ▸ Dinero no deja cargar `gratis_hasta_dia` al cambiar una tarifa (hoy solo la siembra la migración).
