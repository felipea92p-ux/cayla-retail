## Lote C de la revisión del 11-oct: devoluciones y SUNAT (2026-10-12, ADR-0390)
- [x] 6 · Devolución bloqueada mientras la boleta no esté aceptada (`20261012221000` + Devoluciones). Pruebas en `pruebas:aprobar-devolucion-caja`.
- [x] 7 · Medio del reembolso libre con aviso en Devoluciones (`medioSugeridoReembolso`, `revisarAprobacion`).
- [x] 7 · Plazo de cambio en la base (`20261012222000`, `fn_dias_plazo_cambio`); `lib/cambios-plazo-base.test.ts` ata los dos números.
- [ ] **Pegar en producción, con el OK de Felipe:** `20261012221000` y `20261012222000` (una parte cada una, sin políticas; anclas verificadas
  contra producción el 2026-10-12; en producción no hay devoluciones todavía).
- [ ] Cambios: proponer el medio original y avisar en una diferencia negativa (hoy arranca en «Efectivo»). Toca su cargador y 375 px.
- [ ] Una boleta rechazada para siempre deja su devolución sin aprobar: hoy «rechazado» solo ofrece «Reintentar». Decidir qué se hace con ella.
