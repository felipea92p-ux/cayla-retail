# Traslados — demo del rediseño (2026-09-22)

`demo.html` se abre directo en el navegador (sin build). Publicada también en
https://claude.ai/artifact/S7pMSV2j1zN2Nr1iZ93jcG

Base: la guía de estilo oficial «CAYLA Dynamic» de la Sala de Diseño y la maqueta
`oficial-traslados.png`. Datos de ejemplo con prendas reales del catálogo de producción
(nombres y colores); las cantidades son inventadas. No toca la base.

**Decidido con Felipe (2026-09-22), antes de armarla:**

| Pregunta | Elección |
|---|---|
| Alcance | Lista + detalle + filtros |
| Los 4 traslados vacíos de producción | Ocultarlos en pantalla (no se borran) |
| Tokens | La paleta oficial completa (ya estaba en `main` por ADR-0169) |
| Entrega | Demo primero, código tras su visto bueno — aprobada el mismo día |

Lo construido está en ADR-0172. La demo trae además un modo oscuro y una barra de escenario
(con pendientes / todo al día / sin traslados) y de rol (líder / integrante) que son solo de la
demo: el ERP no tiene modo oscuro (ADR-0169 lo dejó para después).
