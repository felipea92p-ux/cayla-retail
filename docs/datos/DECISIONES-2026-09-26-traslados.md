# DECISIONES — Traslados: cómo se recibe una caja de otra sede (2026-09-26)

**Quién decide:** Felipe, en la sesión de la rama `claude/analisis-modulo-traslados-1111c9`. Aceptó en bloque las cuatro
recomendaciones de `docs/pantallas/traslados.md` §6 («Tomo todas tus recomendaciones»). Continúa la numeración de
[`DECISIONES-2026-09-26-rendimiento.md`](DECISIONES-2026-09-26-rendimiento.md), que reservó hasta el D-128. **Si hay
contradicción, mandan las actas del 2026-09-12 y del 2026-09-21.** Revisado contra las dos: ninguna decide sobre la
recepción de traslados más allá de «todo movimiento escribe en `movimientos`», y eso se mantiene.

**Por qué esta ronda:** el recorrido de usabilidad del 2026-09-26 (PR #498) encontró que el flujo falla justo cuando llega
la caja. Producción tenía 4 traslados, todos vacíos: el módulo nunca se usó de verdad, así que se puede cambiar su regla sin
migrar historia.

| # | Decisión | Ganas | Pagas |
|---|---|---|---|
| **D-129** | **Entra lo que coincide; solo la línea con diferencia espera al líder.** | La tienda vende lo que llegó bien sin esperar a nadie. | Un traslado puede quedar «a medias»: parte en stock y parte esperando. |
| **D-130** | **Se cuenta a ciegas** (sin ver lo enviado hasta «Terminé de contar»), cada casilla se guarda sola y la pistola es el camino rápido. | Control real: lo contado es lo que hay, no lo que dice el papel. Recargar no borra nada. | Recibir toma un poco más de tiempo. |
| **D-131** | **Piso o almacén se pregunta al confirmar, con «Piso de venta» marcado.** | Lo que llega se puede vender apenas se confirma. | Una pregunta más al confirmar. |
| **D-132** | **Anula un envío quien lo envió (su sede) o un líder, mientras nadie haya empezado a contar.** Anular devuelve el stock al origen con su movimiento. | Un error de envío ya no se convierte en una pérdida falsa. | Después de que la otra sede empieza a contar, ya no se puede anular: se resuelve contando. |

El diseño, lo descartado y los escenarios que romperían cada decisión: `docs/adr/0238-traslados-recibir-sin-perder-nada.md`.

## Lo que queda abierto

- **Dos lugares para recibir el mismo traslado** (el detalle de Traslados y Compras › Recibir mercadería, `recibir_envio`).
  Con este cambio, los dos cumplen D-129, porque los dos terminan en `confirmar_traslado`. Pero Recibir por envío no cuenta
  a ciegas, no pregunta piso o almacén (deja en almacén) y no ofrece anular. Falta decidir cuál de los dos lugares queda
  (ADR-0113 se llama «una sola puerta para recibir»).
