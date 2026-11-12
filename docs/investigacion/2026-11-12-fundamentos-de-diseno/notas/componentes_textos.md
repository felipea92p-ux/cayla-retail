# Anatomía de componentes, estados de interacción y UX writing (microcopy) para un ERP interno en español (Perú) con shadcn/ui (Radix) + Tailwind — notas a nov. 2026

Leyenda de tipo de evidencia: **[ESTÁNDAR]** = norma o especificación (W3C/WCAG, tokens oficiales, ley); **[EVIDENCIA]** = estudio con usuarios o datos de benchmark; **[PRÁCTICA]** = guía de un sistema de diseño u opinión de experto. Todo lo que no pude leer directamente está en «Gaps», no en los hallazgos.

Nota de método: se leyeron 13 páginas primarias (W3C, Flutter/Material tokens, A List Apart, Baymard, NN/g x2, Axess Lab, Carbon, Radix, Mercado Pago, Wikipedia-es, i18nguy) y se verificó CLDR/ICU localmente con Node 22.23.4 (ICU 78.3, CLDR 48). m3.material.io no se dejó leer (requiere JavaScript), rae.es devolvió error, el PDF de la guía de estilo de Microsoft para español de México no se pudo descargar (proxy 403) y polaris (Shopify) quedó bloqueado por permisos. Atlassian, Primer, GOV.UK, Mailchimp, Microsoft Writing Style Guide, Yifrah y Podmajersky no llegaron a leerse dentro del presupuesto de llamadas: ver Gaps.

---

## 1. Estados de interacción: el modelo completo de estados, capas de estado de Material 3, anillo de foco y el debate sobre botones deshabilitados

### Takeaway
Las opacidades actuales de las capas de estado de Material 3 son hover 8 %, focus 10 %, pressed 10 % y dragged 16 % (versión de tokens 4_0_0). Versiones anteriores usaban 12 % para focus y pressed, así que el «8/10/16» del encargo está confirmado para la versión actual. Para el foco, WCAG 2.4.7 (AA) exige que el indicador exista. WCAG 2.4.13 (AAA) fija su piso: un área de al menos un perímetro de 2 px CSS y 3:1 de cambio de contraste entre estado enfocado y no enfocado. La evidencia práctica va en contra de deshabilitar botones de envío: es mejor dejarlos activos y explicar el error al pulsar.

### Cited Findings
- **[ESTÁNDAR]** Tokens de Material 3 en la versión «4_0_0»: `md.sys.state.hover.state-layer-opacity: 0.08`, `md.sys.state.focus.state-layer-opacity: 0.1`, `md.sys.state.pressed.state-layer-opacity: 0.1`, `md.sys.state.dragged.state-layer-opacity: 0.16` — [Flutter gen_defaults state.json (rev 1fbcbb73)](https://flutter.googlesource.com/mirrors/flutter.git/+/1fbcbb73a0d9c2f31653dbfc74d55de9cfa8f2dd/dev/tools/gen_defaults/data/state.json)
- **[ESTÁNDAR]** La versión anterior de los tokens (`v0_132`) tenía focus 0.12 y pressed 0.12, con hover 0.08 y dragged 0.16 iguales. M3 bajó focus y pressed de 12 % a 10 %, y las fuentes de terceros que citan 12 % están desactualizadas — [Flutter gen_defaults state.json (rev ab928834, v0_132)](https://flutter.googlesource.com/mirrors/flutter/+/ab928834af66c8fc64c5295d2bc622f7a331e0d7/dev/tools/gen_defaults/data/state.json)
- **[ESTÁNDAR]** Según la meta-descripción de la página oficial (lo único legible sin JS), los estados de M3 son «indicadores visuales que comunican el estado de un componente o elemento interactivo» — [m3.material.io — State layers](https://m3.material.io/foundations/interaction/states/state-layers)
- **[ESTÁNDAR]** WCAG 2.4.13 Focus Appearance (AAA) pide que el indicador «sea al menos tan grande como el área de un perímetro de 2 px CSS de grosor del componente no enfocado» y que «tenga una razón de contraste de al menos 3:1 entre los mismos píxeles en estado enfocado y no enfocado» — [W3C Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
  - No tiene que ser un contorno de 2 px, solo igualar esa área. La forma más simple de cumplir es un contorno sólido de 2 px o más. Ejemplo de W3C: un botón de 90×30 px necesita un área mínima de 480 px². El 3:1 mide el **cambio** entre el estado enfocado y el no enfocado de los mismos píxeles, no el contraste contra lo adyacente que mide 1.4.11. Solo la parte del indicador que alcanza 3:1 cuenta para el área — [W3C Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
  - Excepciones: el indicador lo pone el navegador y el autor no puede ajustarlo, o el autor no modifica el indicador ni su fondo. Cambiar el fondo detrás del indicador por defecto anula la excepción — [W3C Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
  - 2.4.7 Focus Visible (AA) «exige que exista un indicador visible mientras el componente tiene el foco de teclado». 2.4.13 añade cuán visible debe ser — [W3C Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- **[PRÁCTICA]** «Disabled buttons suck» (Hampus Sethfors, Axess Lab, 7 jul. 2017) da tres argumentos:
  - WCAG exime a los componentes inactivos del contraste 4.5:1, así que suelen ser ilegibles para personas con baja visión.
  - A menudo no reciben foco, por lo que lectores de pantalla y switch access no los alcanzan.
  - No explican por qué no están disponibles.
  - Alternativa que propone: dejar el botón activo; al pulsarlo, mostrar un error que diga qué corregir y mover el foco a ese error. Si se quiere una pista visual, darle aspecto inactivo con contraste suficiente, pero sin el atributo `disabled` en el código.
  - Fuente: [Axess Lab — Disabled buttons suck](https://axesslab.com/disabled-buttons-suck/)
- **[PRÁCTICA]** Hallado pero no leído: piezas que sostienen la misma línea, como «Don't Disable Form Controls» (Adrian Roselli, feb. 2024), «Usability Pitfalls of Disabled Buttons» (Smashing) y «How to avoid disabled buttons» (tempertemper), y un resumen de un video de NN/g sobre por qué los botones deshabilitados dañan la UX — [Adrian Roselli](https://adrianroselli.com/2024/02/dont-disable-form-controls.html); [tempertemper](https://tempertemper.net/blog/how-to-avoid-disabled-buttons); [Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/disabled-buttons)

### Inferences
- Modelo de estados para el ERP: default, hover, focus-visible, active/pressed, selected, disabled, loading, error, read-only.
  - En Tailwind/shadcn se pueden mapear las capas de M3 como superposición de `currentColor`: hover 8 %, focus-visible 10 %, pressed 10 %.
  - Para el foco conviene usar `:focus-visible` con un `ring` sólido de 2 px o más y offset, y comprobar 3:1 entre el ring y el fondo sin foco. Eso cumple 2.4.13 (AAA), que es más que el mínimo AA de 2.4.7.
- Botones de enviar o guardar en formularios: preferir «activo + validar al pulsar + llevar el foco al primer error» antes que `disabled`.
  - Si un estado debe impedir la acción, por ejemplo por permisos, el texto de ayuda adyacente debe explicar el motivo.
  - Se puede usar `aria-disabled="true"` en vez de `disabled`, para que el botón siga siendo enfocable (inferencia a partir del argumento de foco de Axess Lab).
- Read-only frente a disabled: read-only debe seguir siendo enfocable y legible, con contraste completo, porque el dato se consulta. Esto se infiere del argumento de contraste y foco; no lo verifiqué en Carbon ni en Primer.

### Gaps
- **Opacidades de deshabilitado en M3** (contenedor 12 %, contenido 38 %, el valor de la industria): no se verificaron en una fuente primaria porque m3.material.io no se leyó. Habría que confirmarlas en los tokens `md.comp.*.disabled.*` de material-web o Flutter.
- No se leyeron las definiciones de estados de Carbon (carbondesignsystem.com/guidelines/…), Atlassian (atlassian.design) ni Primer (primer.style), ni el modelo `data-state`/`data-disabled`/`data-highlighted` de Radix.
- WCAG 2.4.11 Focus Not Obscured (Minimum, AA): el foco no puede quedar totalmente oculto por contenido del autor, como headers fijos o toasts. No se leyó su página Understanding: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- No se leyó el artículo de NN/g sobre botones deshabilitados, solo un resumen de terceros que apareció en la búsqueda.

---

## 2. Guía de componentes base: botones, formularios, tablas de datos, diálogos/drawers, toasts, command palette, estados vacíos/carga/error y destructivas frente a deshacer

### Takeaway
Para formularios hay evidencia sólida:
- La validación en línea al salir del campo (on blur) mejoró el éxito un 22 % y redujo el tiempo un 42 % en el estudio de Wroblewski (n=22, indicativo).
- Validar al recibir el foco o mientras se escribe fue peor.
- Baymard recomienda marcar explícitamente tanto los campos obligatorios como los opcionales.
- NN/g desaconseja usar el placeholder como etiqueta.

En toasts, Carbon recomienda dos líneas como máximo, cierre manual siempre disponible, autodescarte opcional a 5 s, y que los toasts con acción no se cierren solos.

### Cited Findings
**Formularios — validación en línea [EVIDENCIA]**
- Estudio de Luke Wroblewski (A List Apart, 2009): 22 usuarios de 21 a 49 años, seis variantes de un formulario de registro, con un control que validaba solo al enviar. La mejor variante en línea frente al control:
  - +22 % de éxito
  - −22 % de errores
  - +31 % de satisfacción
  - −42 % de tiempo de completado
  - −47 % de fijaciones oculares
  - Fuente: [A List Apart — Inline Validation in Web Forms](https://alistapart.com/article/inline-validation-in-web-forms/)
- Momento de la validación:
  - **«After» (on blur)** fue la más rápida: 7 a 10 s menos que las variantes «while» y «before and while».
  - **«While» (al teclear)** hacía que los usuarios añadieran un carácter, esperaran el mensaje y repitieran.
  - **«Before and while»** (mensajes al recibir el foco) tuvo la tasa de errores más alta y la peor satisfacción.
  - Recomendación del estudio: validar las respuestas abiertas al terminar. Usar «while» solo donde ayude de verdad (contraseñas, nombre de usuario), con un retardo.
  - Fuente: [A List Apart](https://alistapart.com/article/inline-validation-in-web-forms/)
- La validación en línea ayuda sobre todo en campos de respuesta no obvia, como la disponibilidad de un nombre de usuario o una contraseña con reglas. En campos simples (nombre, email, país) solo el 30–50 % vio los mensajes, y el check verde confundió («¿válido significa correcto?»). Los mensajes persistentes funcionaron mejor que los que se desvanecían — [A List Apart](https://alistapart.com/article/inline-validation-in-web-forms/)
- Advertencia: en los comentarios del artículo se cuestionó el diseño del estudio (cada participante vio varias variantes, posible aprendizaje, muestra pequeña). El equipo del autor aceptó que las métricas son indicativas, no definitivas — [A List Apart](https://alistapart.com/article/inline-validation-in-web-forms/)

**Formularios — obligatorio frente a opcional [EVIDENCIA]**
- Benchmark de Baymard 2021:
  - Solo el 14 % de los sitios marca tanto los campos obligatorios como los opcionales (9 % en 2012, 14 % en 2016). En móvil, el 6 %.
  - El 37 % marca solo los opcionales y el 42 % solo los obligatorios.
  - Fuente: [Baymard — Required/optional fields](https://baymard.com/blog/required-optional-form-fields)
- Recomendación de Baymard:
  - Marcar ambos. Se puede usar asterisco para los obligatorios si los opcionales llevan «Optional» junto a la etiqueta.
  - «Todos los campos son obligatorios» no basta, porque se pasa por alto.
  - Conviene colapsar los opcionales raros, como «Address line 2».
  - Fuente: [Baymard](https://baymard.com/blog/required-optional-form-fields)
- Datos de error de Baymard:
  - Cuando solo se marcaban los opcionales, el 32 % de los usuarios tuvo un error por saltarse un campo obligatorio.
  - En Amazon, el 44 % dudó en la sección de envío.
  - En móvil, el 75 % tuvo problemas graves en sitios que no marcaban ambos tipos.
  - Fuente: [Baymard](https://baymard.com/blog/required-optional-form-fields)

**Formularios — placeholder no es etiqueta [EVIDENCIA/PRÁCTICA]**
- NN/g (Katie Sherwin, 2014, revisado en 2018): los placeholders «a menudo perjudican la usabilidad más de lo que ayudan». Motivos:
  - Cargan la memoria y desaparecen al escribir.
  - Impiden revisar lo escrito y dificultan corregir errores.
  - Se confunden con valores ya llenados.
  - Tienen bajo contraste y algunos lectores de pantalla no los anuncian.
  - Recomendación: etiquetas visibles fuera del campo y ayudas persistentes también fuera. La etiqueta flotante es mejor que solo placeholder, pero la etiqueta externa sigue siendo lo mejor.
  - Fuente: [NN/g — Placeholders in Form Fields Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/)

**Errores [PRÁCTICA, basada en investigación de NN/g]**
- NN/g (Neusesser y Sunwall, 14 may. 2023) agrupa sus pautas en tres ejes:
  - **Visibilidad:** mostrar el error junto a su origen, con indicadores redundantes (no solo color), con intensidad proporcional al impacto (modal solo para lo grave) y «sin mostrar errores prematuramente».
  - **Comunicación:** lenguaje humano (códigos solo para diagnóstico), descripción concisa y precisa (nada de «Ocurrió un error»), consejo constructivo, tono positivo, sin culpar y evitando «inválido/incorrecto».
  - **Eficiencia:** prevenir los errores probables, **conservar lo que la persona escribió**, ofrecer correcciones de un clic y enlazar a explicaciones cuando haga falta.
  - Fuente: [NN/g — Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)

**Toasts / notificaciones [PRÁCTICA — Carbon]**
- Carbon tiene cuatro variantes: inline, toast, actionable y callout.
  - El toast es no modal, temporal y para mensajes cortos, normalmente feedback de una tarea terminada.
  - Por defecto persiste. Puede programarse para cerrarse a los **5 s**, y siempre debe tener botón de cierre.
  - Fuente: [Carbon — Notification usage](https://carbondesignsystem.com/components/notification/usage/)
- Si el toast lleva acción, «debe permanecer en pantalla hasta que el usuario lo cierre», y la acción debe ser accesible por otra vía. Máximo dos líneas; si necesita más, usar una notificación con «View more». Aparece arriba a la derecha y apila los nuevos arriba — [Carbon](https://carbondesignsystem.com/components/notification/usage/)
- Las notificaciones con acción reciben el foco al aparecer, lo que puede interrumpir a quien usa lector o teclado. El foco va primero a la acción y luego al cierre, y se cierran con Enter, Space o Esc. La página de uso no especifica `role="status"`/`alert` — [Carbon](https://carbondesignsystem.com/components/notification/usage/)

**Diálogos (Radix) [ESTÁNDAR de implementación]**
- Radix Dialog «se adhiere al patrón WAI-ARIA Dialog»:
  - Atrapa el foco en el modal.
  - Esc cierra y devuelve el foco a `Dialog.Trigger`.
  - Space o Enter abren y cierran desde el trigger; Tab y Shift+Tab navegan.
  - `Dialog.Title` se anuncia al abrir y puede ocultarse visualmente con `VisuallyHidden`.
  - `Dialog.Description` es opcional; si se quita, hay que pasar `aria-describedby={undefined}`.
  - Fuente: [Radix — Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)

### Inferences
- Validación en el ERP:
  - Validar en blur, nunca al recibir el foco.
  - Revalidar mientras se escribe solo después de que el campo ya mostró un error, para que el error desaparezca en cuanto se corrige. Esto extiende la recomendación de «while con retardo».
  - Los mensajes persisten y van debajo del campo.
  - En campos triviales, nada de check verde.
- Marcado de campos: el ERP debe marcar obligatorios **y** opcionales, por ejemplo «(opcional)» en la etiqueta y asterisco o «obligatorio». Ninguna etiqueta debe vivir solo en el placeholder; si hay ejemplos, que digan «Ej. …» y sean complementarios.
- Toasts:
  - Solo para confirmaciones no críticas.
  - Si llevan acción (por ejemplo «Deshacer»), no se cierran solos o duran mucho más, y la acción debe existir también en otra parte.
  - Los errores que bloquean no van en toast, sino inline o en un diálogo según su impacto (NN/g).
  - Esto también conecta con WCAG 2.2.1 Timing Adjustable (ver Gaps).
- `AlertDialog` de Radix/shadcn para confirmaciones destructivas: título con la pregunta concreta y botón con el verbo de la acción. Lo de usar AlertDialog para destructivas es inferencia del patrón APG; la página leída no cubre AlertDialog.

### Gaps
- **Botones:** no se leyeron fuentes primarias sobre jerarquía primario/secundario/terciario, «un primario por vista» ni tamaños (Carbon Button, Atlassian Button, Primer Button, M3 Buttons).
- **Tablas de datos:** no se leyeron fuentes sobre ordenamiento, filtros, paginación frente a scroll infinito, acciones masivas ni estados vacíos (Carbon Data table, Atlassian Dynamic table, NN/g «Infinite scrolling» y «Data tables»).
- **Diálogo frente a drawer frente a inline:** sin fuente leída (NN/g «Modal & Nonmodal Dialogs», Primer Dialog).
- **Toasts y accesibilidad normativa:** WCAG 2.2.1 Timing Adjustable y 4.1.3 Status Messages (`role="status"` con `aria-live="polite"` para éxito, `role="alert"` para errores) no se leyeron. URLs para verificar: https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html y https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- **Command palette (⌘K), skeletons y loading:** sin fuentes leídas.
- **Confirmar frente a deshacer:** el argumento clásico de que es mejor deshacer que confirmar porque la confirmación se vuelve hábito (NN/g «Confirmation dialogs», A List Apart «Never use a warning when you mean undo» de Aza Raskin) no se leyó.
- **Patrones APG:** no se leyeron Combobox, Listbox, Menu, Tabs ni Grid del APG (https://www.w3.org/WAI/ARIA/apg/patterns/), ni las páginas Radix de Select, DropdownMenu, Tabs y Toast.

---

## 3. Accesibilidad de componentes: patrones WAI-ARIA APG, garantías de las primitivas Radix y soporte de teclado

### Takeaway
Radix declara que Dialog sigue el patrón APG: foco atrapado, Esc cierra y el foco vuelve al trigger, con título accesible. Esto cubre buena parte del trabajo, pero el autor sigue siendo responsable de dar título y descripción con sentido y de no romper el indicador de foco (ver la excepción de 2.4.13).

### Cited Findings
- **[ESTÁNDAR de implementación]** Radix Dialog sigue el patrón WAI-ARIA Dialog, con la tabla de teclado de la sección 2 — [Radix — Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)
- **[ESTÁNDAR]** Si el autor cambia el fondo detrás del indicador de foco por defecto del navegador, pierde la exención y debe cumplir 2.4.13 por su cuenta — [W3C Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- **[PRÁCTICA]** Los componentes deshabilitados nativos suelen quedar fuera del orden de tabulación y no los alcanzan lectores de pantalla ni switch access — [Axess Lab](https://axesslab.com/disabled-buttons-suck/)
- **[PRÁCTICA]** Las notificaciones con foco automático interrumpen a usuarios de lector y teclado; Carbon solo mueve el foco en las que llevan acción — [Carbon](https://carbondesignsystem.com/components/notification/usage/)

### Inferences
- shadcn/ui hereda el comportamiento de Radix, pero sus estilos por defecto (`focus-visible:ring-*`) deben auditarse contra 2.4.13: grosor de 2 px o más y 3:1 de cambio, también en modo oscuro.
- Todo `Dialog` necesita `DialogTitle`, aunque sea visualmente oculto.

### Gaps
- No se leyó la página general de accesibilidad de Radix ni la lista de patrones APG con sus tablas de teclado: Combobox (autocompletado de productos o clientas), Grid (tablas editables), Menu button, Tabs, Listbox.
- No se verificaron los anuncios de Radix Toast ni de Sonner, el toast que usa shadcn: qué `role`/`aria-live` emiten.

---

## 4. UX writing: principios de Material, Atlassian, Polaris, Mailchimp, GOV.UK y Microsoft; NN/g sobre microcopy y errores; botones como verbos, sentence case, front-loading, lenguaje claro

### Takeaway
De las fuentes leídas, la pauta de errores de NN/g es la más accionable: qué pasó, cómo arreglarlo, sin culpar, sin «inválido», con lo escrito conservado y el error junto a su origen. Las guías de Atlassian, Polaris, Mailchimp, GOV.UK, Microsoft, Yifrah y Podmajersky no se pudieron leer en esta sesión.

### Cited Findings
- **[PRÁCTICA basada en investigación]** Pautas de errores de NN/g (ver detalle en la sección 2):
  - Describir el problema de forma concisa y precisa; no usar «An error occurred».
  - Dar un consejo constructivo.
  - Usar un tono positivo, sin culpar y evitando «invalid»/«incorrect»; formular en términos de lo que el sistema necesita.
  - Mostrar códigos solo para diagnóstico.
  - Fuente: [NN/g — Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)
- **[PRÁCTICA]** Las ayudas e instrucciones esenciales deben ser persistentes y estar fuera del campo, no en el placeholder — [NN/g — Placeholders](https://www.nngroup.com/articles/form-design-placeholders/)
- **[PRÁCTICA]** Los toasts deben caber en dos líneas, y el significado no debe depender del estilo del texto, porque los lectores de pantalla leen el título como una sola oración — [Carbon](https://carbondesignsystem.com/components/notification/usage/)
- **[PRÁCTICA]** Existen guías relevantes aparecidas en búsqueda pero no leídas: la guía de UI text de Chrome DevTools, la de elementos de UI de Google developer documentation (también en español), el codelab de comunicación de Material, la sección Writing de las Apple HIG y la de grammar and mechanics de Adobe Spectrum — [Chromium DevTools writing.md](https://chromium.googlesource.com/devtools/devtools-frontend/+show/main/docs/styleguide/ux/writing.md); [Google — UI elements](https://developers.google.com/style/ui-elements); [Material communication codelab](https://codelabs.developers.google.com/codelabs/material-communication-guidance?hl=en); [Apple HIG — Writing](https://developer.apple.com/design/human-interface-guidelines/writing.md); [Spectrum](https://spectrum.adobe.com/page/grammar-and-mechanics)

### Inferences
- Plantilla de mensaje de error para el ERP: **[qué pasó, sin culpa] + [cómo resolverlo]**, junto al campo, con ícono y texto (no solo rojo), y con el valor ingresado conservado.
  - Ejemplo de estilo: «Falta el número de documento. Escríbelo para emitir la boleta.» en vez de «Campo inválido».
  - Esto aplica NN/g; la redacción concreta es propia.
- Evitar «inválido/incorrecto/error» en los mensajes dirigidos a la persona. Reservar los códigos técnicos para un detalle desplegable o para el log.

### Gaps
- No se leyeron, y por tanto no se citan:
  - La guía de escritura de Material (m3.material.io/foundations/content-design/style-guide…).
  - La voz y tono de Atlassian (atlassian.design/content/voice-and-tone).
  - Las guías de contenido de Polaris, que quedaron bloqueadas: https://polaris-react.shopify.com/content/actionable-language
  - La guía de Mailchimp (styleguide.mailchimp.com).
  - La de GOV.UK (gov.uk/guidance/style-guide).
  - El Microsoft Writing Style Guide (learn.microsoft.com/style-guide).
- Sin fuente leída quedan: sentence case, botones como verbo + sustantivo, front-loading, investigación sobre nivel de lectura y lenguaje claro (por ejemplo, el estudio de NN/g sobre lenguaje claro y lectores expertos), y los libros de Kinneret Yifrah («Microcopy: The Complete Guide») y Torrey Podmajersky («Strategic Writing for UX»).

---

## 5. UX writing en español (Latinoamérica/Perú): tú frente a usted, RAE/Fundéu (mayúsculas, abreviaturas, fechas, números), «S/», separador decimal en Perú y lenguaje inclusivo

### Takeaway
- **Trato:** Mercado Pago/Mercado Libre, la referencia regional más cercana, usa «tú» explícitamente y no «usted» ni «vos».
- **Números:** hay un conflicto real. La norma legal peruana (Ley 23560, SI) fija la **coma** decimal, pero los datos de configuración regional que usan los navegadores (CLDR 48 / ICU 78.3) formatean `es-PE` con **punto decimal y coma de miles**: `S/ 1,234,567.89`. Es el mismo patrón que es-MX y es-419, y el opuesto a es-ES y es-AR.
- **Implementación:** para un ERP que muestra precios y comprobantes, usar `Intl.NumberFormat('es-PE')` da el formato de uso común y deja constancia de la divergencia con la norma metrológica.

### Cited Findings
- **[PRÁCTICA]** La guía de voz y tono de Mercado Pago dice: «No utilizamos los pronombres "vos" o "usted"», es decir, usa «tú». Su rasgo «Simple» se describe como «transformamos la burocracia en algo fácil, directo y entendible» — [Mercado Pago Developers — Voz y tono](https://www.mercadopago.com.mx/developers/es/docs/style-guide/voice-and-tone)
- **[ESTÁNDAR legal]** Según Wikipedia en español, Perú usa oficialmente la **coma** como separador decimal (Ley N.º 23560 y Manual de Uso del SI en el Perú), y el punto decimal se considera incorrecto. Es una fuente secundaria: falta leer el texto de la ley o el manual de INACAL — [Wikipedia-es — Separador decimal](https://bestref.net/wikipedia/es/Separador_decimal)
- **[ESTÁNDAR legal / precedente]** México: la NOM-008-SCFI-2002 fijaba la coma, pero se modificó para volver a permitir el punto porque la coma «no se utiliza en la práctica» — [Wikipedia-es — Separador decimal](https://bestref.net/wikipedia/es/Separador_decimal)
- **[ESTÁNDAR de facto — CLDR]** Verificación local con Node 22.23.4 (ICU 78.3, CLDR 48) usando `Intl`:

  | Locale | Número `1234567.891` | Moneda PEN | Fecha corta 12 nov. 2026 | Fecha media | `1234.5` |
  |---|---|---|---|---|---|
  | es-PE | `1,234,567.891` | `S/ 1,234,567.89` | `12/11/26` | `12 nov. 2026` | `1,234.5` |
  | es-419 | `1,234,567.891` | `PEN 1,234,567.89` | `12/11/26` | `12 nov 2026` | `1,234.5` |
  | es-MX | `1,234,567.891` | `PEN 1,234,567.89` | `12/11/26` | `12 nov 2026` | `1,234.5` |
  | es-ES | `1.234.567,891` | `1.234.567,89 PEN` | `12/11/26` | `12 nov 2026` | `1234,5` |
  | es-AR | `1.234.567,891` | `PEN 1.234.567,89` | `12/11/26` | `12 nov 2026` | `1.234,5` |

  Lectura de la tabla:
  - Solo `es-PE` muestra el símbolo «S/» con espacio; es-419 muestra «PEN».
  - CLDR usa orden día/mes/año y abreviatura de mes con punto en es-PE («nov.»).
  - Fuente: ejecución local de `Intl.NumberFormat` / `Intl.DateTimeFormat` (datos [Unicode CLDR](https://cldr.unicode.org/)).
- **[PRÁCTICA, histórico]** El enfoque de Microsoft para un español «neutro» o universal buscaba texto «aceptable (no identificable como escrito para otro mercado regional) en todo el mundo hispanohablante». Las diferencias regionales son sobre todo léxicas: «computadora»/«ordenador», «reporte»/«informe». La página, editada en 2010, no trata tú/usted — [i18nguy — Microsoft's approach to neutral Spanish](https://dcmpx.remotevs.com/com/i18nguy/www/PL/l10n/MS_LA_Spanish.html)
- **[ESTÁNDAR]** Existen guías de estilo de localización de Microsoft para español de México, EE. UU., España y neutro (PDF), pero no se pudieron descargar en esta sesión — [Microsoft spa-mex StyleGuide](https://download.microsoft.com/download/9/0/1/9016efc5-6455-4a9d-ae78-ed3df93b2851/spa-mex-StyleGuide.pdf); [spa-neu](https://download.microsoft.com/download/4/3/1/431d9836-40dc-4f2b-aafc-def5c7b5d0f3/spa-neu-StyleGuide.pdf)

### Inferences
- **Trato:** usar «tú» en el ERP. Es lo que hace el mayor producto digital de la región (Mercado Libre/Mercado Pago) y encaja con un uso interno entre integrantes. Mantenerlo de forma consistente, sin mezclar con «usted».
- **Números y moneda:** formatear siempre con `Intl` y locale `es-PE`, sin concatenar cadenas a mano.
  - Resultado: «S/ 1,234.50», con espacio entre «S/» y la cifra, punto decimal y coma de miles.
  - Coincide con el uso comercial peruano habitual en precios. Pero difiere de la Ley 23560 (coma decimal): si algún documento con valor metrológico o legal exige el SI, habría que tratarlo como excepción explícita.
- **Fechas:** día/mes/año. En tablas puede servir «12/11/2026» (año de 4 dígitos para evitar ambigüedad, decisión propia, no CLDR) y en textos «12 nov. 2026».
- **Léxico:** preferir términos panamericanos o peruanos («computadora», «celular», «reporte», «boleta»). Evitar «ordenador», «móvil» y el voseo.

### Gaps
- **RAE/Fundéu sin leer** (rae.es dio error de cliente; Fundéu no apareció):
  - Mayúsculas: solo la inicial en títulos, botones y menús.
  - Las mayúsculas se tildan; este titular de FundéuRAE apareció en la búsqueda pero no se leyó: https://www.hoy.com.py/rae/fundeurae-las-mayusculas-si-se-tildan
  - Separador decimal: la Ortografía de 2010 admite punto o coma y recomienda el espacio duro para los miles, no el punto, sin separar números de 4 cifras.
  - Abreviaturas con punto y símbolos sin punto.
  - Páginas a verificar: https://www.rae.es/ortografía/los-números-decimales-y-el-separador-decimal y https://www.rae.es/dpd/mayúsculas
- **Norma peruana sin texto primario:** no se leyó la Ley 23560, la NTP de INACAL ni el Manual del SI; lo que hay viene de Wikipedia. Tampoco hay fuente primaria del uso de punto decimal en comprobantes SUNAT.
- **Tú/usted en otros productos:** no se verificó BBVA Perú, Google es-419 ni Apple es-419. Apple y Google suelen tutear en es-419 según conocimiento previo, sin verificar.
- **Lenguaje inclusivo:** no se leyeron guías. La RAE y Fundéu desaconsejan «x», «@» y «-e», y recomiendan genéricos y colectivos («el equipo», «el personal», «quien compra»). Útil para un equipo mayoritariamente femenino, pero queda sin cita en estas notas.
