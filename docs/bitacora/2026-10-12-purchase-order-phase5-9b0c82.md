## Compras ▸ fase 5a de las órdenes de compra: «Nos debe» (2026-10-12) — rama `claude/purchase-order-phase5-9b0c82`

- **Qué:** cada faltante «No vino» de una recepción queda como una deuda del proveedor («2 chompas · S/ 84.00 · ENV-000061») que se ve
  en su ficha, con su total, y al crear o editar su próxima orden. Se salda con la prenda: en la próxima recepción («Es la reposición de
  lo que faltó», la deuda más antigua primero) o a mano con «Llegó la reposición» (con nota). Saldo a favor y depósito no se construyen:
  mueven plata y esperan a Felipe y al contador (fase 5b).
- **Por qué:** ADR-0362, decisiones 14, 24 y 27; Felipe pidió avanzar de corrido hasta la mañana del 2026-10-13. Contrato:
  `docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md` (con «Cambios al construir»).
- **Cómo:** dos agentes en paralelo sobre el contrato. Migración `20261013015000` (una parte, re-ejecutable): tabla de resoluciones
  que solo agrega filas, candado «nunca más de lo debido» (también con dos sesiones a la vez), la causa `reposicion_faltante` y tres funciones
  nuevas; `recibir_despacho` y `fn_envio_detalle` con reemplazos anclados. `pnpm pruebas:nos-debe` 16/16 y las vecinas en verde; web con
  90 casos puros, tsc, lint y vitest completo; de punta a punta en el banco a 1440, 1024 y 375 px, en claro y oscuro. **Sin pegar en
  producción.**
