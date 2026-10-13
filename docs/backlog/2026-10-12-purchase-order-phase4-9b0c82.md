## Recibir mercadería ▸ Órdenes de compra, fase 4: recibir un envío en la sede (2026-10-12) — rama `claude/purchase-order-phase4-9b0c82`

ADR-0362 (decisiones 13–15, 17, 18, 21, 23, 27, 48 y 49). Va encima de la fase 3 (PR #1014), que va encima de la fase 2 (PR #1006).

- [x] Base: `20261013001000` (esquema, alta al recibir) y `20261013002000` (abrir, recibir, sin guía, la prenda, lecturas).
- [x] Pantalla: la tarjeta en `/recibir` y `/recibir/envio/[id]` (cuatro estados), guía de foco en la página y sus dos hojas.
- [x] Pruebas: `pruebas:recepcion-de-envio` 28/28; puras 83; eliminar producto cuenta la tabla nueva como historia.
- [x] Guía interactiva de `/recibir/envio/[id]` (por estado del envío) y huella de `/recibir` («Lo que viene de una orden de compra»).
- [x] Caos en la base: dos personas reciben el mismo envío a la vez → entra una sola vez (stock 4, un movimiento); la otra lee «Este envío ya se recibió».
- [ ] Pegar en producción, EN ORDEN y ANTES de desplegar la web, después de las tres de la fase 3: `20261013001000` → `20261013002000`.
- [ ] `/chaos` con sesiones reales (doble clic, corte de señal, dos personas recibiendo el mismo envío) y una terminal; firmar como
  integrante con su entrada marcada (el banco no tiene asistencia: hoy se probó con Sandra).
- [ ] `/formidable` de la recepción con una colaboradora real.

**Por decidir (Felipe), con lo provisional ya construido:** las causas del faltante (No vino · Se perdió en el camino · Llegó a otra
sede); todo lo contado entra al costo de la línea, también un regalo; la pareja marca–proveedor se registra sola al crear la prenda;
una prenda nueva de quien no edita el catálogo nace «pendiente»; un costo 0 pide confirmar; sin cola sin conexión en esta pantalla;
«¿Tiene arreglo?» una vez por línea. **Para la fase 5:** la causa «Es la reposición de lo que faltó» (contrato `contrato-nos-debe.md`).
