# Acta del benchmark contra los mejores ERPs — 8 decisiones

> **Fecha:** 2026-09-23 · **Quién decide:** Felipe Alvarez · **De dónde salen:** las 8 preguntas reales que
> el benchmark contra Shopify/Square/Lightspeed/Katana/Odoo/NetSuite (`07-BENCHMARK-ERPS.md`) identificó como
> decisiones que solo Felipe puede tomar — no arqueología de lo ya construido (eso fueron las 143 preguntas
> anteriores), sino diseño hacia adelante, con evidencia de industria real.

| # | Decisión |
|---|---|
| **Eficiencia del Taller** | Pendiente, se revisa después — Felipe recuerda que hubo una buena versión inicial de esta métrica que vale la pena mirar con calma antes de decidir si el panel actual (costo por prenda) reemplaza la definición original (tela aprovechada, PL-39) o si conviven las dos. |
| **BOM del Taller** | Sí, vale la pena invertir el tiempo — se construye una receta de materiales real (metros de tela y avíos por unidad) para que el sistema avise «con lo que tienes no alcanza» antes de abrir una corrida. |
| **Escalamiento de liquidación** | El arquitecto propone un escalón razonable de descuento por antigüedad (30/60/90/180 días) como punto de partida; Felipe lo ajusta y sigue analizándolo con el tiempo — no es una cifra cerrada para siempre. |
| **Segundo desempate en decisiones caras de revertir** | No se nombra una sola persona de respaldo. Cualquier integrante enfrenta la decisión usando la skill `/decide` (o el mismo patrón de esta conversación: opciones con Ganas/Pagas, verificación contra el código real, ejemplos concretos, advertencias explícitas) — el trabajo no depende de una sola persona. La decisión queda documentada con nombre y fecha, y Felipe la revisa cuando vuelve. Se rompe si alguien usa el protocolo para algo que de verdad necesita criterio de negocio (plata, contratos, gente), no técnico. |
| **Fecha del ensayo de restore** | Pendiente — Felipe la fija cuando tenga más claro el calendario de esta semana. Sigue siendo su pendiente, con el riesgo nombrado de que se postergue como ya pasó antes con D-29. |
| **Tap de asesora vacío por diseño** | Se mide en la primera semana de TRU cuánto tiempo real agrega en hora punta. Si el costo resulta alto, existe una alternativa lista (default a quien más atendió en los últimos 10 minutos en esa sede). |
| **Efectivo consolidado (uno de los 3 números de Felipe)** | Separado por sede por defecto — un problema en una tienda nunca se esconde detrás de un total sano. Además se construye la opción de vista global/integrada, para cuando Felipe quiera el vistazo rápido de conjunto. |
| **Meta del mes en vivo** | Sí, con barra de progreso visible en «Mi día» mientras la asesora trabaja — ya existe el patrón visual exacto (ADR-0136) para esto. |

**Pendientes que nacen de esta acta:**
- BOM del Taller, escalamiento de liquidación, medición del tap de asesora, efectivo consolidado (con vista dual), meta en vivo: cinco piezas de construcción real.
- Eficiencia del Taller y fecha de restore: dos decisiones que Felipe retoma después, con dueño y sin fecha aún — quedan anotadas, no perdidas.
