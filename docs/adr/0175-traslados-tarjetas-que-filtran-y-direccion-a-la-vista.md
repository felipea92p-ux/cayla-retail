# ADR-0175 — Traslados: las tarjetas filtran, la dirección a la vista y la tabla en dos acomodos

- **Fecha:** 2026-09-22
- **Estado:** aceptado (Felipe eligió «todas la A» en la demo `docs/maquetas/traslados-cifras-filtros-2026-09/`)
- **Sobre:** ADR-0173 (rediseño de lista y detalle), ADR-0169 (paleta oficial), ADR-0105 (lectura desde quien mira)
- **Sin migraciones ni RPC.**

## Contexto

Mientras se armaba esta demo, otra sesión fusionó ADR-0173 (lista y detalle rediseñados, conteo por
borradores). La opción «Alcance: lista + detalle» de esta demo ya estaba cumplida por ese trabajo, así que el
detalle **no se tocó**. Quedaban tres cosas que ADR-0173 no resolvía:

1. **La misma cifra dicha tres veces:** la franja («2 traslados necesitan tu acción»), las 4 tarjetas y los
   chips «Acción hoy · 2 / En camino · 3 / Con diferencia · 1».
2. **Entrantes/salientes escondido** en «Más filtros», aunque es el filtro más usado después de la búsqueda.
3. **Tres acomodos de tabla** (6 columnas desde 1400 px, dos líneas entre 1280 y 1399, tarjeta debajo).

## Decisión

- **Las tarjetas son el filtro** de por recibir / en camino / con diferencia (ya lo eran; ahora dicen «Toca
  para filtrar» o «Filtrando · toca para quitar»). Los chips pasan a **Abiertos · Cerrados · Todos**
  (`FILTROS_TRASLADO`, filtro nuevo `abiertos` en `lib/traslados-reglas.ts`). «Acción hoy» sigue siendo un
  filtro válido sin chip: la franja lleva directo al más urgente. El filtro puesto desde una tarjeta aparece
  como chip con «×» para quitarlo.
- **Dirección a la vista:** control segmentado junto al buscador (mismo control que la sububicación de
  Movimientos, ADR-0170). En «Más filtros» queda solo la otra sede.
- **Tabla en dos acomodos:** 6 columnas desde 1280 px (con el lateral de 17 rem quedan ~928 px; las columnas
  piden ~920) y tarjeta por debajo. «· N variantes» puede bajar de línea para no encimarse.

## Costo

- A 1280 px las columnas quedan justas: una ruta larga o una insignia larga («Cerrado con diferencia») parte
  en dos líneas en vez de tener aire.
- «Acción hoy» deja de tener chip: quien lo usaba entra por la franja o por la tarjeta «Por recibir hoy».
