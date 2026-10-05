# Oficio visual — el eje que se mide, no se opina

«Estética impecable, visual y alineada» (Felipe, 2026-10-05) deja de ser gusto cuando se convierte en cosas que el navegador puede medir.
Este eje tiene **su propia nota 0–10**, separada de las 9 leyes: una pantalla puede ser clara y estar mal alineada, o preciosa e incomprensible.

**Cómo se mide:** pega `medir-oficio.js` en `javascript_tool` con la pantalla ya cargada y el panel visible (panel oculto = medidas en 0). Hazlo a
**1440 × 900 primero** (escritorio manda), luego 1024 × 768 y 375 × 812. Cada hallazgo lleva su etiqueta de evidencia.

| # | Comprobación | Umbral | Evidencia |
|---|---|---|---|
| 1 | **Blancos con puntero fino** (mouse): botones, enlaces, celdas clicables, casillas. **Excepción: un enlace o botón EN LÍNEA dentro de una frase no cuenta** (el piloto lo midió mal: dos «blancos de 16 px» eran enlaces dentro de un párrafo) | ≥ 24 × 24 px mínimo; objetivo **32 px** de alto en filas | 24 px y la excepción: Verificado, [WCAG 2.2 · 2.5.8 (AA)](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/). 32 px: Opinión (calma de escritorio) |
| 2 | **Blancos con puntero grueso** (`(pointer: coarse)`, tablet/celular) | ≥ **44 × 44 px** | Verificado: guías de Apple para iOS |
| 3 | **Contraste del texto** contra su fondo real | ≥ 4,5 : 1 (texto grande ≥ 3 : 1) | Verificado (WCAG 1.4.3) |
| 4 | **Contraste de controles y del indicador de foco** | ≥ 3 : 1 contra lo que tocan | Verificado (WCAG 1.4.11, contraste de componentes) |
| 5 | **Foco visible** con Tab, en TODO control (también los que traen `outline-none`: combos, buscador, pastilla de sede, filas clicables) | visible siempre (WCAG 2.4.7, AA); de ≥ 2 px es el objetivo (WCAG 2.4.13, que es **AAA**, no obligatorio) | 2.4.7: Verificado. 2 px: Verificado como AAA, aquí Opinión |
| 6 | **Texto mínimo** | nada que importe bajo 12 px; el cuerpo en 14 px o más | Opinión (lectura a distancia en Mac mini) |
| 7 | **Alineación**: bordes izquierdos de bloques y controles que casi coinciden | un desvío de 1–3 px entre dos bordes que deberían ser uno **falla** | Medido |
| 8 | **Espaciado** entre bloques hermanos | **múltiplos de 2 px**: la escala de Tailwind v4 del repo va de 4 en 4 px con medios pasos de 2, 6, 10 y 14 px; **impares o fraccionarios (5, 7, 9, 13, 6,3…) fallan** | Medido |
| 9 | **Jerarquía tipográfica** | ≤ 4 tamaños distintos de texto visibles; el título es el más grande | Opinión (criterio) |
| 10 | **Radios y alturas** | los controles de una misma fila tienen la misma altura; ≤ 3 radios distintos en la pantalla | Medido |
| 11 | **Color** | solo tokens de `globals.css` (ADR-0169): ningún hex suelto; **rojo ≤ 2 por pantalla** (regla del token) | Medido (cuenta) + lectura del código |
| 12 | **Teclado** | Tab recorre todo lo que se puede usar, en orden visual; Enter confirma, Esc cierra (ADR-0136) | Observado |
| 13 | **Sin sombras** en superficies pegadas al fondo; sin bordes dobles | ADR-0169 | Medido / lectura |
| 14 | **Orden de pantalla** | cabecera del módulo → cifras → filtros y tabla en UNA tarjeta → nota en hueso | Lectura (ADR-0169/0220) |

## Cómo se califica

- Cada fila se marca **pasa / falla / no aplica**; la nota de oficio = `10 × pasa / (pasa + falla)`, redondeada, **con la lista de qué falló**.
- Un **blocker** (texto bajo 3 : 1, un blanco < 24 px que lleva a una acción irreversible, foco invisible) baja la nota a un máximo de 5 aunque lo demás pase.
- **El chrome global del ERP** (lateral, buscador, selector de sede, «Salir», insignia de Next en desarrollo) **se reporta aparte** y no baja la nota de la
  pantalla: es de otra pieza y se arregla una vez para todas. El piloto de Frescura lo mezcló y casi culpa a la pantalla de tres defectos que eran del buscador.
- 375 px se mide siempre, pero **pesa menos** salvo en Vender, Cambios y Devoluciones, donde el celular es obligatorio (PL-105).

## Lo que este eje NO decide
Los tokens y las piezas no se negocian aquí (ADR-0169, ADR-0136, ADR-0149). Si una comprobación choca con un token (p. ej. el contraste de un
color oficial), **no se cambia el token**: se reporta y Felipe decide con un ADR.
