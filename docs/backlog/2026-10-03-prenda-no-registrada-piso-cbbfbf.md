# Backlog — Vender registra la bajada que se olvidó (2026-10-03, ADR-0320)

- **Pegar en producción `20261003233000_bajar_al_piso_desde_vender.sql`** (una parte, idempotente) ANTES de publicar la web; después,
  `pnpm datos:generar:produccion` y `pnpm datos:comparar` (hasta entonces `datos:comparar` avisa que Vender llama a una función que
  producción no tiene). **No está en producción.**
- **Probar con una Terminal de ventas real:** escanear una prenda «en el almacén» sin responsable elegido → la hoja «Registrar la bajada al
  piso» → elegir → la prenda entra y la venta sale a nombre de esa persona. En local solo se vio con la cuenta Admin (la hoja forzada).
- **Probar con la cámara del teléfono:** escanear una prenda «No entró · en almacén», cerrar la cámara y tocar «Agregar y registrar la bajada».
- **ADR-0208 bloque 3b sigue pendiente:** los dos botones «Ya estaba colgada» / «La traje del almacén» (hoy un solo botón; Frescura cuenta las
  dos como «bajada tardía»).
- **Guía de foco de Vender:** `/vender` y el modal de `PuntoDeVenta.tsx` siguen «pendiente» en `lib/guia-de-foco-pantallas.ts` (deuda de antes
  de la regla, no de este cambio).
