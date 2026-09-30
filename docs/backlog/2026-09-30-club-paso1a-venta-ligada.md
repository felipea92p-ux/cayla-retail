## 🌸 Club, tanda 1a · venta ligada y documento con tipo (ADR-0288) — rama `claude/club-paso1a-venta-ligada`; migración `20260930160000` **SIN pegar**

- [ ] **Felipe:** pegar `supabase/migrations/20260930160000_club_paso1a_venta_ligada_y_documento.sql` SOLA en el SQL Editor y
      fusionar el PR enseguida. Después, en solo lectura: una sola firma de `registrar_clienta`, `editar_clienta` y
      `registrar_venta`, y los md5 «después» de su sección 0.
- [ ] Después de pegar: `pnpm datos:generar:produccion` con el volcado fresco (el diccionario todavía dice `dni`).
- [ ] Base local compartida: la fila «Boutique Mía SAC» del seed viejo no cumple el formato. La migración no aborta
      (deja el candado sin validar y avisa); corregirla o archivarla en `/clientas` y validar el candado.
- [ ] **Decidir (Felipe):** una compra con boleta a su DNI, hecha sin elegirla en el ticket, ¿se liga sola a su ficha?
      Hoy solo se liga al registrarla o al corregir su documento.
- [ ] Siguiente: tanda 1b (club: los dos permisos, textos v2, QR, código de socia).
- Cómo verificas: en Vender, «Agregar clienta» → un DNI que no está → «Registrar clienta» → cobrar; su ficha en
  `/clientas` muestra la compra. `pnpm pruebas:club-venta-ligada`.
