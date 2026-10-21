# Anterior y siguiente de un paso a paso — una sola pieza (ADR-0358, ronda 17)

**Decidido:** 2026-10-17, Felipe, **mirando** (página de elegir con fotos en vivo y demos; fuentes en [rondas/17](rondas/17/README.md)).
**Elegida:** P1. **Pieza:** `<Volver onClick a>` (`components/ui/Volver.tsx`) para volver al paso anterior y `btn-cayla btn-primario` con su
`ArrowRight` para «Siguiente».

## Qué se comparó

La guía de impresión (Etiquetas de precio y Rótulos) pasaba de paso con «← Anterior» y «Siguiente →» escritos a mano, mientras Nuevo
producto, Cambios, Devoluciones y Existencias ya avanzaban con la flecha redonda y «Seguir». Se escapó de la ronda 3 porque la firma de
`accion.volver` dejaba pasar «← Anterior» (la paginación lo usaba).

| Opción | Cómo se ve |
|---|---|
| **P1 · como todo paso a paso** | la flecha redonda a la izquierda (no se dibuja en el primer paso), «Paso 2 de 7» al medio, «Siguiente» negro con su flecha a la derecha |
| P2 · dos botones con palabra | «Anterior» secundario con su flecha y «Siguiente» negro: simétricos, la única excepción a «volver es una flecha» |
| A · hoy | «← Anterior» y «Siguiente →» escritos |

## Lo que eligió

**P1.** Volver a un paso es la flecha redonda (Felipe 2026-10-07: «volver solo es una flecha»); «Siguiente» lleva el ícono de lucide, como
«Seguir» de Nuevo producto. En el primer paso la flecha no se dibuja y su lugar se guarda, para que «Paso 1 de 7» no salte de sitio.

## El movimiento

El de las piezas: la flecha de volver retrocede 2 px al pasar el mouse; «Siguiente» tiene el de todo botón (sube 2 px, la luz cruza, la
flecha avanza 4 px).

## Migración (2026-10-17)

**Deuda 0.** La guía de impresión (`GuiaImpresion.tsx`). La firma (`«← Anterior»`, `«‹ Anterior»` o `«Siguiente →»` escritos) encontró
además la paginación a mano de Clientes (`ClientasPanel.tsx`: «‹ Anterior · Página 2 de 5 · Siguiente ›» en versalitas), que pasó a
`<Paginas hrefDe>` (familia `paginacion`). La guía interactiva (la demo con velo) tiene su diseño (ADR-0389) y queda aparte.
