# Fuentes de /milimetro (estados y componentes)

Niveles del set: **[Evidencia]** estudio revisado o experimento controlado · **[Norma]** WCAG, especificación web, guía oficial de plataforma ·
**[Práctica]** tokens de sistemas de diseño, NN/g, design engineers. El marco de tres niveles viene del informe «Principios de motion en UI»
(`/home/claude/reports/`, sección «Tres niveles de confianza»): **los números de duración, opacidad y tamaño son casi todos de práctica**, razonables
porque muchos equipos coinciden en ellos, pero ningún estudio los da como óptimos. Las notas de investigación son
`research_notes/Fundamentos de diseño de interfaz/componentes_textos.md` (leídas el 2026-11-12).

## Estados de interacción

| Fuente | Autor · año | Nivel | Qué aporta | Dónde se usa |
|---|---|---|---|---|
| [Flutter gen_defaults `state.json`, rev 1fbcbb73](https://flutter.googlesource.com/mirrors/flutter.git/+/1fbcbb73a0d9c2f31653dbfc74d55de9cfa8f2dd/dev/tools/gen_defaults/data/state.json) | Google, tokens M3 v4_0_0 | [Práctica] (tokens de un sistema de diseño) | `md.sys.state.*.state-layer-opacity`: hover **0.08**, focus **0.10**, pressed **0.10**, dragged **0.16** | estados 2, 3, 4 |
| [Flutter `state.json`, rev ab928834 (v0_132)](https://flutter.googlesource.com/mirrors/flutter/+/ab928834af66c8fc64c5295d2bc622f7a331e0d7/dev/tools/gen_defaults/data/state.json) | Google | [Práctica] | La versión vieja tenía focus y pressed en **0.12**: las fuentes que citan 12 % están desactualizadas | nota de vigencia |
| [W3C, Understanding 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) | W3C · WCAG 2.2 | [Norma] AAA | Área ≥ perímetro de 2 px del control; ≥ 3:1 entre los mismos píxeles con y sin foco; solo cuenta la parte que llega a 3:1. Ejemplo: botón de 90 × 30 → 480 px². Cambiar el fondo detrás del indicador del navegador anula la excepción. 2.4.7 (AA) exige que el indicador exista | estado 3 |
| [Axess Lab, «Disabled buttons suck»](https://axesslab.com/disabled-buttons-suck/) | Hampus Sethfors · 2017 | [Práctica] | El apagado: exento de contraste (ilegible con baja visión), suele no recibir el foco, no dice por qué. Alternativa: activo y explicar al pulsar, llevando el foco al error; o aspecto apagado con contraste y `aria-disabled` | estado 6, propuesta 3 |
| Media Queries Level 4, característica `hover` (W3C) | W3C | [Norma] | Que `(hover: hover)` distinga el puntero que puede pasar encima del dedo. **Conocida, no releída en esta investigación** | estado 2 |

## Formularios, errores y vacíos

| Fuente | Autor · año | Nivel | Qué aporta | Dónde se usa |
|---|---|---|---|---|
| [A List Apart, «Inline Validation in Web Forms»](https://alistapart.com/article/inline-validation-in-web-forms/) | Luke Wroblewski · 2009 | [Evidencia] **indicativa** | 22 personas, seis variantes. La mejor en línea frente a validar al enviar: +22 % de éxito, −22 % de errores, +31 % de satisfacción, −42 % de tiempo. Validar al salir del campo fue lo más rápido; al escribir hacía tipear y esperar; al recibir el foco, lo peor. En los comentarios se cuestionó el diseño (cada persona vio varias variantes): el autor aceptó que las cifras son indicativas | estado 8 |
| [Baymard, «Required/optional form fields»](https://baymard.com/blog/required-optional-form-fields) | Baymard Institute · 2021 | [Evidencia] (benchmark de usabilidad, no revisado por pares) | Solo el 14 % de los sitios marca obligatorios y opcionales. Con solo los opcionales marcados, el 32 % se saltó un obligatorio. Recomienda marcar los dos («Todos los campos son obligatorios» no basta) | estado 10 |
| [NN/g, «Placeholders in Form Fields Are Harmful»](https://www.nngroup.com/articles/form-design-placeholders/) | Katie Sherwin · 2014, rev. 2018 | [Práctica] (con base en pruebas de NN/g) | El placeholder no es etiqueta: se va al escribir, se confunde con un valor, poco contraste, algunos lectores no lo leen | estado 10 |
| [NN/g, «Error-Message Guidelines»](https://www.nngroup.com/articles/error-message-guidelines/) | Neusesser y Sunwall · 2023 | [Práctica] | Junto a su origen, sin depender solo del color, sin mostrar antes de tiempo, lenguaje humano, sin culpar, conservar lo escrito | estado 8, propuesta 2 |

## Componentes

| Fuente | Autor · año | Nivel | Qué aporta | Dónde se usa |
|---|---|---|---|---|
| [Carbon, Notification usage](https://carbondesignsystem.com/components/notification/usage/) | IBM | [Práctica] | Toast: no modal, temporal, para lo no crítico; persiste por defecto y puede irse a los 5 s; siempre con cierre; **con acción, queda hasta que la persona lo cierra** y la acción existe por otra vía; máximo dos líneas. Con acción reciben el foco (interrumpe) | componentes, propuestas 1 y 2 |
| [Radix, Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) | WorkOS / Radix | [Norma] de implementación (sigue el patrón WAI-ARIA Dialog) | Foco atrapado; Esc cierra y devuelve el foco a quien abrió; título anunciado (puede ir oculto); sin descripción, `aria-describedby={undefined}` | componentes (hoja) |

## Movimiento (solo el marco)

| Fuente | Nivel | Qué aporta | Dónde se usa |
|---|---|---|---|
| Informe «Principios de motion en UI» (2026), secciones «Tres niveles de confianza» y «Fuente de verdad y ficha de motion por componente» | síntesis | Los tres niveles; la ficha de motion por componente (disparador, propiedades, token, reemplazo quieto, si es esencial, qué pasa si se vuelve a hacer clic a mitad), que el informe **propone** sin fuente dedicada | candado 3, sección Movimiento de la ficha (la llena `/movimiento`) |
| W3C, 2.3.3 Animation from Interactions; técnica C39 (citados en ese informe) | [Norma] AAA | El movimiento que dispara una interacción se puede apagar; **color y opacidad no cuentan como movimiento** | estado 11 |
| Val Head, «Designing with reduced motion…», Smashing Magazine 2020 (citado en ese informe) | [Práctica] | Reducir es sustituir (de `transform` a `opacity`, con la misma duración), no apagar | estado 11 |
| W3C, 2.2.2 Pause, Stop, Hide (citado en ese informe) | [Norma] A | Lo que se mueve solo más de 5 s se puede pausar; un indicador de carga puede ser esencial | estado 7 |
| NN/g, «Skeleton screens» (citado en ese informe) | [Práctica] | Nada bajo 1 s; esqueleto o indicador de 1 a 10 s; barra con estimación sobre 10 s | estado 7 |

## Lo que decidió el repo (no es una fuente externa)

ADR-0136 (movimiento sin rebote), ADR-0146 (avisos), ADR-0149 (loader único), ADR-0169 (paleta), ADR-0284 (guía de foco), ADR-0336 (oscuro),
ADR-0350 (formidable), ADR-0351 (anillo único), ADR-0358 (una función, una pieza), ADR-0479 (hoja del celular, hover con mouse), ADR-0528 (atrás cierra la hoja),
ADR-0596 (vidrio), ADR-0611 mejora 4 (confirma) y mejora 5 (44 px con el dedo), ADR-0623 (lo que se desplaza no se desenfoca), ADR-0625 (arranca quieto).
Todos en `docs/adr/`.

## No verificado (dicho con honestidad)

- **WCAG 2.4.11 Focus Not Obscured (Minimum, AA):** el criterio existe en WCAG 2.2, pero su página Understanding no se leyó en esta investigación. La propuesta 5
  empieza por medir, no por afirmar.
- **WCAG 3.3.1 Error Identification, 2.2.1 Timing Adjustable, 4.1.3 Status Messages:** se nombran por su número; sus páginas no se leyeron. Que el éxito vaya en
  `role="status"` y el error en `role="alert"` es lo que hace el repo (`Avisos.tsx`), no algo verificado contra la norma aquí.
- **Opacidades de apagado de Material 3** (contenedor 12 %, contenido 38 %): son el valor que se repite en la industria, pero no se confirmaron en una fuente primaria
  (m3.material.io no cargó). Por eso esta skill no propone un número para el apagado.
- **Estados de Carbon, Atlassian y Primer**, el modelo `data-state` de Radix y las tablas de teclado del APG (Combobox, Listbox, Menu, Tabs, Grid): no se leyeron.
  Read-only (estado 9) queda como inferencia.
- **Botones (jerarquía, «un primario por vista», tamaños)** y **tablas** (orden, filtros, paginación, acciones masivas): sin fuente primaria leída. Lo que dice la
  ficha de un botón sale del repo, no de una guía de afuera.
- **Confirmar frente a deshacer** (NN/g, Aza Raskin): no se leyó; el repo ya lo decide con la ley 7 de `/formidable`.
- **El límite de 0,1 s** para sentir algo instantáneo viene de la práctica (Nielsen, RAIL), no de un experimento citado aquí.
- **`medir.js` no se probó en un navegador al escribirse** (el entorno no tenía servidor ni Playwright): solo se revisó su sintaxis. La primera auditoría tiene que
  mirar si sus «revisar» son falsos positivos, como le pasó a `/formidable` con los colores `oklab()`.
- **La `@keyframes cayla-onda` repetida** (`app/globals.css`, líneas 1678 y 2618) se leyó en el código; que la segunda sea la que corre en el botón se confirma con
  el fragmento de `ficha-plantilla.md` en el navegador.
