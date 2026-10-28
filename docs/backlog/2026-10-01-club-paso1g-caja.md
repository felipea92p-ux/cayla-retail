## 🌸 Club, tanda 1g: caja y ficha (2026-10-01, ADR-0288 act. g) — rama `claude/club-paso1g-caja`

- [ ] **Alinear el reparto del vale con la base:** `registrar_venta` (`p_canjear_aniversario`) tiene que repartir el vale en
      `descuento_club_unitario` con la regla de la cabecera de `lib/club-aniversario-canje-reglas.ts` (céntimos, base ⌊E·n/T⌋ y
      el resto por fracción, una unidad por vuelta). Si la base reparte distinto, los pagos no suman el total y la venta se
      rechaza. Caso a decidir: una sola prenda de 3 unidades con un vale de S/ 20 descuenta S/ 19.98 (por unidad no cabe 6.666…).
- [ ] **Tipos:** cambiar los `TODO tipos` de `lib/club-acciones.ts` (`aniversario_*` de `resumen_clienta_caja`) y
      `lib/ventas-offline.ts` (`p_canjear_aniversario`) cuando `packages/database` traiga la 1g.
- [ ] **Orden de despliegue:** primero la migración de la 1g, después esta web (sin la migración la caja no ofrece el vale y
      la tarjeta pide el cartel; registrar con solo el documento ya funciona hoy).
- [ ] La guía de foco de `/vender`, `PuntoDeVenta.tsx` y `PuntoDeVentaTicket.tsx` sigue pendiente (deuda de antes de la regla).
- Cómo verificas: en Cobrar a 1280 y a 375 px, una clienta nueva se registra con solo el DNI; una que no es socia muestra la
  fila del cartel y pasa a «Socia» sola cuando se une desde el cartel (en otro celular, con el mismo DNI); una socia con vale
  lo usa (una línea en el pie, el total baja, «Venta registrada» y el papel lo dicen) y con el cumpleaños puesto el vale se
  apaga y dice por qué; sin conexión, «Sin conexión». En Clientas: «Más» sin «Llegó un mensaje»; la ficha sin «Mostrar su QR»
  ni «Unirse al club», con «Registrar su BAJA» solo si tiene publicidad.
