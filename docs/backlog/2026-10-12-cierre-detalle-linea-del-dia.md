## 🧾 Detalle del cierre «La línea del día» (2026-10-12, ADR-0374 act.) — solo web, sin migración; rama `claude/cierre-detalle-linea-del-dia`

- [x] Veredicto con escala, ventas por hora con marcas, dona por medio de pago, cascada del efectivo y movimientos en línea (`escalaDiferencia`, `diaDelTurno`, `cascadaEfectivo`, con pruebas). Probado en local con datos de ejemplo: escritorio, 375 px y modo oscuro; suite completa en verde.
- [ ] **Sin probar con un cierre real de producción:** pagos mixtos, anticipos de separaciones, cambios que mueven efectivo (caen en «Salidas/Entradas del cajón»), turnos que cruzan la medianoche y cierres sin traslados (cierres anteriores a ADR-0186 muestran un texto en «A dónde fue»).
- [ ] **Sin decidir:** «Quién vendió» (ventas por persona) se dejó fuera de la propuesta A; está en la C si Felipe lo quiere sumar.
