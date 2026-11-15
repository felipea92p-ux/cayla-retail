# Al milímetro · auditoría — «Cómo se pagó» con la empresa elegida (Ventas ▸ Reportes)

- **Fecha:** 2026-11-15 · **Ruta:** `/vender/reportes?tienda=<Lima>&emp=claure` (base local con una escena inventada de Lima, borrada al terminar)
- **Pieza auditada:** `section[aria-label="Cómo se pagó"]` (`components/reportes-ventas/GraficosReporteMes.tsx`). Qué cambió: con una empresa elegida dibuja la
  misma `BarraApilada` y la misma lista con lo de esa empresa (antes, un vacío), y si hubo reparto, una línea «Incluye S/ 100 repartidos de 2 ventas mixtas» con
  su `<Ayuda>`. Si la lectura no llega, un `<Aviso tono="atencion" chico>`. Ninguna pieza nueva: `BarraApilada`, `Ayuda`, `Aviso` (ADR-0358).
- **Medidores corridos** (Playwright, mismos archivos de `.claude/skills/*/referencia/medir.js`): estados, espacio, tipografía, color, movimiento, textos y
  gráficos a 1440 claro; estados, espacio y tipografía a 375 claro; estados, color y gráficos a 1440 oscuro.

## Resultado: 0 graves · 0 medias · 0 leves nuevas

| Qué | Dónde | Medido | Regla | Nivel | Nota |
|---|---|---|---|---|---|
| El tramo «Efectivo» contra la pista | `BarraApilada` de «Cómo se pagó», claro | 2.07:1 (`--color-metodo-efectivo` sobre la pista) | WCAG 1.4.11 | heredado | Ya era así sin empresa; la cifra y el % de cada medio van escritos al lado (la marca no es la única forma de leer el dato). En oscuro pasa (5.06:1). |
| Texto tenue de la bajada, los % y la línea del reparto | «Cómo se pagó», oscuro | 5.84:1 (pasa WCAG), APCA Lc −47 | APCA, segunda mirada | — | Es el `text-tinta/60` de toda la pantalla; no falla la norma. |
| La línea del reparto | 375 px | baja a dos renglones con el «?» al final, sin cortar el monto | «Poco texto a la vista» | — | 8 palabras; lo que explica va detrás del «?» (`AYUDA_DEL_REPARTO`). |

Fuera de la sección (lo midieron los medidores de página entera; no son de este cambio): el ✕ de 22×22 de las píldoras de filtro (ya anotado el 2026-11-14) y
la línea de 13 px «Promedio diario…» de «Ventas por día».

**Sin medir:** el foco con teclado del «?» (segunda pasada con `{ foco: true }`): es la pieza `AyudaCabecera` de siempre.
