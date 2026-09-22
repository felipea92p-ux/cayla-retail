# Movimientos — demo de rediseño (2026-09-22)

`demo.html` se abre directo en el navegador (sin build). Publicada también en
https://claude.ai/artifact/KxU9KUPbPdBpguKRXGkdmP

Base: guía de estilo oficial «CAYLA Dynamic» de la Sala de Diseño (paleta v2, DM Sans +
EB Garamond, radios 8/16/20/999, un solo ease) y la maqueta `oficial-movimientos.png`.
Datos de ejemplo deterministas; no toca la base.

**Decidido con Felipe:** un solo selector de sede, el de la cabecera (el del título se va).

**Abierto — la demo las muestra lado a lado con interruptores:**

| Decisión | Opciones | Recomendación |
|---|---|---|
| Filtro por proceso (hoy: select nativo de 19) | A drill-down bajo el tipo · B panel agrupado en «Más filtros» | A |
| Orden de los filtros | 1 como la guía · 2 sububicación a «Más filtros» · 3 tres filas (hoy) | 1 |
| Forma de la lista | A lista de la guía + hora · B tabla de 6 columnas (hoy) | A |

Además, sin decisión pendiente: estado vacío que dice por qué está vacío y ofrece el
siguiente paso con la cifra real («En los últimos 90 días hay 12»), cantidades por tipo en
cada chip y el detalle con el `<Modal>` de ADR-0136.
