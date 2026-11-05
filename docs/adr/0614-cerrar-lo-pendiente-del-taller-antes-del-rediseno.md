# ADR-0614 · Cerrar lo pendiente del Taller antes de rediseñarlo

- **Fecha:** 2026-11-05 · **Estado:** en construcción, por actividades (`/construir`).
- **Decide:** Felipe, 2026-11-05: «cerremos todo lo pendiente, porque luego haré un rediseño general de todo ese módulo». Aprobó la lista de 16 actividades ese mismo día.
- **Toca:** ADR-0400, ADR-0551, ADR-0570, ADR-0587, ADR-0600 y las respuestas de `docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/13-respuestas-de-felipe.md`.

## El problema

El módulo tiene casi todas sus pantallas, pero en producción ninguna orden había llegado al stock al 2026-11-05, y varias decisiones ya tomadas seguían sin construir. Rediseñar encima de eso obligaría a tomar a la vez decisiones de pantalla y de negocio.

## Las cuatro decisiones de Felipe (2026-11-05)

1. **Lo puramente visual espera al rediseño:** nombres de botones y del menú, orden de la pantalla, guía de foco, cifras de Insumos. Lo que se construye ahora va con hojas funcionales y piezas del sistema.
2. **«Llegó una compra» se construye ahora, con hoja sencilla.** El rediseño la viste.
3. **El Taller como mayorista (ADR-0547) va después,** con órdenes cerradas y cotizaciones reales.
4. **La orden «de antes» (ADR-0551, actividad 2) se descarta.** El Chaleco se resuelve con «ya estaban registradas».

El freno de la orden sin tela sigue solo en pantalla, como Felipe eligió en ADR-0600.

## Actividad 1: revertir un cierre devuelve el costo de la prenda (migración `20261105213000`)

**El problema.** `cerrar_produccion` mete el costo de la orden en el promedio de la prenda (`variantes.costo`), y `revertir_produccion` sacaba las prendas del stock sin tocar ese promedio. Una orden mal cerrada dejaba mal el costo para siempre.

DECIDÍ: devolver el `costo_anterior` exacto del cierre, solo si ese cierre es lo último que movió el costo. Si después entró otra compra u otro cierre, se rechaza con `revertir_costo_mezclado`; en orden inverso sí se puede. Queda una fila `origen = 'reversion'` que apunta al cierre (`revierte_movimiento_id`), y el par sale de `fn_costo_historial_efectivo`. `orden` dice qué fila va después, porque `created_at` lo comparten las líneas de una misma compra.
DESCARTÉ: (1) deshacer el promedio con una fórmula cuando ya está mezclado: con ventas de por medio da costos inventados, incluso negativos, y ADR-0515 ya decidió que lo mezclado no se reescribe; (2) cambiar el costo sin dejar fila: rompería la cadena que vigila `cadena_rota`; (3) tabla aparte para la reversión: `fn_costo_variante_al` y el balance tendrían que leer dos lugares.
SE ROMPE SI: alguien lee `costo_historial` sin saber de las filas `reversion` y las suma como entradas; hoy lo hace solo `fn_bal_causas_mercaderia`, que ya las separa.

**Límite conocido:** una prenda con un cierre revertido sigue con su costo bloqueado a mano (`fn_variantes_con_costo_oficial` solo mira si tiene historial).

Prueba: `pnpm pruebas:produccion-revertir-costo`.
