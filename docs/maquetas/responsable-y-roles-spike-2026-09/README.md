# Spike visual · Responsable por operación + roles a medida (2026-09-22 · ADR-0161)

`responsable-spike.html` es autocontenido: se abre directo en el navegador. Los datos son inventados.
**No es una implementación**: no toca el ERP ni la base.

La barra negra de arriba **no existe en el ERP**. Sirve para cambiar de **pantalla**, de **cuenta** (terminal de
ventas, terminal administrativa, Felipe con su cuenta personal) y de **asistencia de hoy** en TRU.

## Las cuatro pantallas

| # | Pantalla | Qué hay que aprobar |
|---|---|---|
| 1 | **Roles y accesos** | Una tabla con una fila por módulo y columnas **Ver · Crear · Editar · Eliminar**, más «acciones», que despliega lo propio del módulo y explica qué significa cada verbo ahí. «—» indica que ese verbo no existe en ese módulo. Solo el **Líder** es fijo; **Integrante se edita**. El candado indica «solo líder»: administrar roles, y anular o configurar series de SUNAT. |
| 2 | **Punto de venta** | El combo **Responsable** va encima de COBRAR y viene vacío. Solo lista a quienes están presentes; quien está en pausa sale deshabilitado y quien ya salió no aparece. COBRAR se activa recién al elegir. Al cobrar, el aviso dice «atendió María P.» y el combo vuelve a vacío. |
| 3 | **Cierre de caja** | El combo va dentro del modal «Cerrar caja». Cada movimiento muestra la persona («10:42 · María P.») y el resultado dice quién cerró. |
| 4 | **Nadie de turno** | No hay nada que elegir: la operación se bloquea y la pantalla explica qué hacer (marcar la entrada en el kiosco y tocar «Actualizar lista»). Con la cuenta de Felipe dice «tampoco tú». |

## Preguntas que el spike deja a la vista

- **Solo líder:** ¿se quedan así «anular comprobante» y «series de SUNAT» (decisión 4 del ADR-0150), o también las quieres configurables?

- **En pausa:** hoy sale deshabilitado. ¿Así queda?
- **Cuántos clics cuesta:** con el combo en cada operación, una venta pasa de un clic (COBRAR) a tres (abrir el combo,
  elegir, COBRAR). Hay que medir si en el mostrador se siente.

Las decisiones y sus consecuencias están en `docs/adr/0161-responsable-por-operacion-y-retome-de-roles.md`.
