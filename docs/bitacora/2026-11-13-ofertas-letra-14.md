## 2026-11-13 — La hoja de la oferta se lee a 14 px (ADR-0496, ADR-0655)

- **Qué:** en `app/estilos/ofertas.css`, toda la letra de lectura de la hoja de la oferta pasa a 14 px (0,875 rem, interlineado 1,4 donde puede partirse) y las versalitas de la etiqueta (`.of-n`) de 10 a 11 px; la columna de esos nombres se ensancha a 4,375 rem y la ayuda del paso 1 se topa a 65 ch. Solo CSS: ni lógica, ni base, ni otra pantalla.
- **Por qué:** `/milimetro auditar` (2026-11-13) la midió bajo el piso de CLAUDE.md «La letra de lectura» desde antes de la obra de Campañas (ADR-0496).
- **Cómo se verifica:** con datos inventados, los cuatro pasos a 1440 y 375 px con `medir.js` de `/tipografia` (0 textos de la hoja bajo 14 px, 0 versalitas bajo 11) y de `/espacio` (0 blancos bajo 24 px); vitest de `unificar`, `tema-tokens`, `tema-colores`, `familia` y `hover-con-mouse` en verde (306).
