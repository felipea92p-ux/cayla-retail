## 🧨 /chaos de Finanzas (2026-10-14) — rama `claude/chaos-finanzas-5c56e1`, ADR-0412

- [x] ~~**Pegar en producción**~~ — hecho el 2026-10-15 con el OK de Felipe (16 candados validados, 7 disparadores). Era, en este orden: `20261015002000` (solo `alter table`, mejor fuera de horario) y después
  `20261015003000` (funciones y disparadores). Antes, volver a mirar que ninguna caja fuerte esté bajo cero, que ninguna fila viole los
  candados y que las cuatro anclas sigan apareciendo una vez (`registrar_gasto`, `registrar_movimiento_dinero`, `registrar_activo`,
  `cargar_activo_inicial`; verificadas idénticas a producción el 2026-10-14).
- [ ] Refrescar el volcado de `docs/datos/generado/` (candados y disparadores nuevos) junto con los de ADR-0404, 0405 y 0409.
- [ ] «Revisar si se guardó» en Registrar movimiento y en el activo de Registrar gasto: `fn_resolver_intento` con esas operaciones y
  `useIntento` en sus pantallas (hoy ya no mienten, pero tras un corte hay que cerrar y buscar en la lista).
- [ ] **Decisión de Felipe cuando termine Compras:** ¿una factura de proveedor anterior al inicio de Finanzas se acepta? (su gasto queda
  fuera de los reportes, ADR-0332).
- [ ] La pantalla no avisa antes de guardar un gasto anterior al inicio de Finanzas: lo dice la base (`gasto_antes_del_inicio`). Pasarle
  `inicioFinanzas` a Registrar gasto para frenarlo en el campo de fecha.
