# Backlog — Puntos del Club (2026-10-19)

- [ ] **Felipe decide:** el retorno nominal es 5 % (100 puntos = S/ 5 con 1 punto por S/ 1) y el Club tenía un tope de 2 %. Fijar cuánto margen se le dedica en total.
- [ ] **Felipe decide:** los puntos no vencen, pero la ficha se anonimiza a los 3 años sin compras (G-15) y se llevaría sus puntos. Decirlo en los términos o cambiar el plazo.
- [ ] **Contador y abogado:** cómo registrar los puntos pendientes como deuda, y los términos del programa.
- [ ] **Construir (con `/construir`, después del OK):** movimientos de puntos que solo se agregan, saldo derivado, cupón de un solo uso (índice único + clave por toque + bloqueo de fila), reversa en devolución o anulación, regalo de cumpleaños una vez al año, y retirar el vale de aniversario y el 10 % de cumpleaños de `registrar_venta` / `club_canjes`.
- [ ] **Una función de la base ya pesada:** `registrar_venta` es el punto de choque (ADR-0288, `p_canjear_aniversario`); reservar número de migración con `pnpm reservar migracion` al empezar.
- Cómo verificas: abre `docs/maquetas/puntos-2026-10/index.html` y recorre los 6 pasos; el README lista las decisiones y lo abierto.
