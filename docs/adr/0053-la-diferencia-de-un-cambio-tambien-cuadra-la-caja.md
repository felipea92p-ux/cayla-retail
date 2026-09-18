# ADR-0053 — La diferencia de un cambio también cuadra la caja

**Fecha:** 2026-09-15
**Estado:** Aplicado en local (`20260915200000_diferencia_de_cambio_en_el_arqueo.sql`).
**No aplicado en producción** — la pega Felipe (D-11); ya lleva `retail.` cuando toque.
**Afecta:** `retail.cambios` (columna nueva), `retail.registrar_cambio`,
`retail.cerrar_caja` (mismas firmas — sin `drop`), `apps/web/lib/caja.ts`,
`apps/web/components/CajaAbiertaPanel.tsx`.

## Contexto

Al cerrar ADR-0052 (el reembolso de una devolución cuadra la caja) quedó anotada en el
BACKLOG la misma fuga, en la pantalla vecina: `registrar_cambio` calcula y guarda
`cambios.diferencia` + `metodo_pago_diferencia` cuando una clienta paga o recibe la
diferencia de precio de un cambio de prenda, pero nunca la liga a una caja ni
`cerrar_caja` la mira. Un cambio con diferencia en efectivo mueve plata real del
cajón —para arriba si la clienta paga más, para abajo si se le devuelve— y ese
movimiento era invisible para el arqueo, igual que el reembolso lo era antes de
ADR-0052.

## Decisión

**Mismo mecanismo que ADR-0052, reutilizado tal cual — con una diferencia real: un
cambio puede mover el cajón en los dos sentidos, una devolución solo en uno.**

`cambios` gana `caja_id`: la caja que estaba abierta en la ubicación al **registrar**
el cambio (no la de la venta original). `registrar_cambio` la fija sola. `cerrar_caja`
sube `cambios.diferencia` con signo — positiva (la clienta pagó de más) suma al
esperado, negativa (se le devolvió) resta — filtrado a `metodo_pago_diferencia =
'efectivo'`: un solo `sum()` cubre los dos sentidos, sin dos ramas como hubiera hecho
falta si el signo no viniera ya en el dato. Un reembolso de devolución, en cambio,
siempre resta (nunca hay "reembolso negativo") — por eso ADR-0052 no necesitó esto.

**Hallazgo real durante la implementación:** `cerrar_caja` retorna
`table (monto_sistema, monto_real, diferencia)` — su propia columna de salida se llama
`diferencia`, igual que `cambios.diferencia`. Sin calificar (`cambios.diferencia`),
Postgres no puede decidir a cuál se refiere `sum(diferencia)` dentro del cuerpo de la
función y falla con "column reference is ambiguous". Encontrado por la prueba en
psql antes de tocar producción, no en producción.

`CajaAbiertaPanel` gana una tarjeta "Cambios en efectivo", con signo (`+S/100.00` o
`−S/105.00`) — visible solo cuando hay algún cambio con diferencia en efectivo en esa
caja. Mismo criterio de conteo ciego que Ingresos/Egresos/Reembolsos: un desglose, no
el total esperado.

## Se descartó

- **Resolverlo dentro del mismo commit que ADR-0052**: la razón que ADR-0052 ya dio
  para no hacerlo sigue vigente — mezclar dos módulos en un commit porque comparten
  causa raíz es más difícil de revisar que dos cambios chicos y claros, cada uno con
  su propia verificación.

## Consecuencias

- Registrar un cambio con la caja de esa ubicación **cerrada** deja `caja_id` en null:
  esa diferencia no se resta ni suma en ningún cierre futuro. Mismo hueco conocido y
  no resuelto que ADR-0052 dejó para las devoluciones — mismo argumento: el dinero
  físico tampoco se mueve con un cajón cerrado.
- `packages/database/src/types.ts` recibió a mano solo `cambios.caja_id`.

## Verificación

- psql, 3 escenarios en transacciones con `rollback` (impersonando al Líder):
  diferencia +S/100 en efectivo → `cerrar_caja` da la apertura +100 exacto; diferencia
  −S/105 en efectivo → la apertura −105 exacto (incluido un caso con esperado
  negativo, válido: una diferencia grande contra una apertura chica); diferencia +S/100
  pero por Yape → sin ningún cambio en `monto_sistema`.
- Navegador real, de punta a punta, como Líder (Tienda Lima): cambio real de Blusa
  Emma (S/79.90) por Casaca Ximena (S/179.90), diferencia +S/100 cobrada en efectivo →
  tarjeta "Cambios en efectivo: +S/100.00" en `/caja`; `cerrar_caja` con S/195.00
  contra un esperado real de S/194.99 (100 apertura + 0 ventas + 0 ingresos − 5.01
  egresos + 100 cambios) respondió "No cuadró · +S/0.01" — la aritmética exacta.
