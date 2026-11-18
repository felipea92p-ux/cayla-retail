# Fuentes de /movimiento

Revisadas el 2026-11-12 (informe «Principios de motion en UI» y sus cuatro cuadernos de notas). Los valores de los sistemas de diseño se tomaron
del código fuente y de los paquetes publicados, porque varios sitios de documentación solo cargan con JavaScript. Cada fuente lleva su nivel:
`[Evidencia]` (revisado por pares o experimento controlado), `[Norma]` (WCAG, especificación, guía oficial de plataforma) o `[Práctica]`.

## Evidencia

- **Abrams y Christ (2003), «Motion onset captures attention», *Psychological Science*.** [Evidencia] El objeto que *empieza* a moverse capta la
  atención aunque no tenga que ver con la tarea, sin importar cuántos distractores haya; el movimiento sostenido no dio ventaja («motion per se does
  not automatically attract attention»). Funda: el movimiento corto al inicio de un cambio es buena señal y los bucles no retienen la atención
  (reglas 24, propuesta 4). https://pubmed.ncbi.nlm.nih.gov/12930472/
- **Chang y Ungar (1993), «Animation: From Cartoons to the User Interface», UIST'93, pp. 45–55.** [Evidencia, artículo de diseño] La animación pasa a
  la percepción el trabajo de interpretar un cambio; si un objeto salta de un cuadro a otro, «the very identity of the object breaks down»
  (constancia del objeto). Lleva a Disney a la interfaz: slow-in/slow-out, follow-through, arcos para lo no interactivo. Reglas 1 y receta 3.
  https://bibliography.selflanguage.org/_static/animation.pdf
- **Heer y Robertson (2007), «Animated Transitions in Statistical Data Graphics», IEEE InfoVis.** [Evidencia] 24 personas: la animación redujo el error
  frente al cambio estático en los seis tipos de transición; lo escenificado ganó a lo directo en la mayoría y empeoró uno. Animaciones de 1,25 y
  2 s; meta de ~1 s, «as long as needed but no longer». Principios: destino común, pocas oclusiones, traslación antes que rotación, slow-in/slow-out.
  Reglas 10, 18, 19. https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf
- **Tversky, Morrison y Bétrancourt (2002), «Animation: can it facilitate?», *IJHCS*.** [Evidencia, revisión] Muchos estudios favorables comparaban
  contra estáticos con menos información. Principios de congruencia y aprehensión; lo más prometedor es el cambio espacial en tiempo real. Regla 1.
  https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf
- **Miller (1968) y Card, Robertson y Mackinlay (CHI 1991),** vía NN/g, «Response Times: The 3 Important Limits». [Evidencia] 0,1 s se siente
  instantáneo; 1 s mantiene el hilo; 10 s pierde la atención. Regla 6. https://www.nngroup.com/articles/response-times-3-important-limits/
- **Agrawal et al. (2009), *Archives of Internal Medicine* 169:938–44 (NHANES, n = 5 086).** [Evidencia] Disfunción vestibular en el 35,4 % de los
  adultos de EE. UU. de 40 años o más (18,5 % en los 40, 85 % desde los 80). No dice cuántos activan «reducir movimiento». Por qué «reducir» no es un
  caso marginal. https://mdedge.com/content/vestibular-dysfunction-common-after-age-40 · https://pubmed.ncbi.nlm.nih.gov/19468085
- **Harrison et al. (UIST 2007; CHI 2010), barras de progreso.** [Evidencia] Cómo avanza una barra cambia cuánto parece durar la espera. Los tamaños de
  efecto no se verificaron. https://chrisharrison.net/index.php/Research/ProgressBars

## Norma

- **WCAG 2.2, 2.3.3 Animation from Interactions (AAA).** [Norma] El movimiento disparado por una interacción se puede desactivar salvo que sea esencial;
  **los cambios de color u opacidad no cuentan como «motion animation»**. Técnicas C39 (CSS) y SCR40 (JavaScript) y un ajuste propio. Reglas 26, 28.
  https://w3c.github.io/wcag/understanding/animation-from-interactions · https://www.w3.org/WAI/WCAG22/Techniques/css/C39
- **WCAG 2.2, 2.2.2 Pause, Stop, Hide (A).** [Norma] Lo que se mueve solo, dura más de 5 s y está junto a otro contenido se puede pausar; un indicador
  de carga puede ser esencial. Regla 4, propuesta 4. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- **WCAG 2.2, 2.3.1 Three Flashes or Below Threshold (A).** [Norma] Nunca más de 3 destellos por segundo; el campo de 10° se estima en 341 × 256 px.
  Regla 5. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- **Google, RAIL.** [Norma de plataforma] Respuesta en 100 ms, entrada en 50 ms, cada cuadro en 10 ms (tope 16). Reglas 6, 17. https://web.dev/articles/rail
- **Google, INP.** [Norma de plataforma] Bueno ≤ 200 ms, pobre > 500 ms, percentil 75; la presentación cuenta hasta el siguiente cuadro pintado.
  https://web.dev/articles/inp
- **Apple, Human Interface Guidelines ▸ Motion.** [Norma de plataforma] «Add motion purposefully»; «Make motion optional»; «generally avoid adding motion
  to UI interactions that occur frequently»; «Let people cancel motion». Reglas 2, 21, 23, 26.
  https://developer.apple.com/design/human-interface-guidelines/motion
- **W3C Design Tokens CG, Format Module 2025.10 (28-10-2025).** [Norma comunitaria, no es estándar W3C] Tipos `duration`, `cubicBezier` y el compuesto
  `transition`; no hay tipo para resortes ni `linear()`. Propuestas 5 y 8. https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/
- **Plataforma web a nov. 2026.** [Norma] Baseline: View Transitions de mismo documento (Firefox 144), `@starting-style` + `allow-discrete` (ago. 2024),
  `linear()` (Chrome 113, Firefox 112, Safari 17.2), animaciones ligadas al scroll (Firefox 159, oct. 2026). `interpolate-size` solo en Chromium.
  https://developer.chrome.com/blog/view-transitions-in-2025 · https://web.dev/blog/baseline-entry-animations ·
  https://developer.chrome.com/docs/css-ui/css-linear-easing-function · https://web.dev/blog/web-platform-10-2026 ·
  https://caniuse.com/mdn-css_properties_interpolate-size_allow-keywords

## Práctica — sistemas de diseño (valores de su código)

- **Atlassian (`@atlaskit/tokens` 20.11.0).** [Práctica] Modal 250/200 ms con escala 95→100 %; popup 150/100 con 8/4 px; toast 250/200; panel 250/200;
  botón: solo color de fondo y borde en 150 ms; fila: hover 50 ms. Su resorte en `linear()` está marcado «experimental». Reglas 8, 9; propuesta 10.
  https://www.npmjs.com/package/@atlaskit/tokens
- **GitHub Primer (`primer/primitives`).** [Práctica] «MUST keep UI interactions ≤300ms… NEVER exceed 500ms»; entrada 300 ms con easeOut, salida 200 ms con
  easeIn (0.7, 0.1, 0.75, 0.9), «Shorter than enter to feel snappy»; «MUST respect prefers-reduced-motion». Reglas 7, 9.
  https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/motion/motion.json5
- **IBM Carbon.** [Práctica] Movimiento productivo (botones, tablas) y expresivo (momentos significativos); duraciones 70–700 ms; «If average users notice it
  often, reduce or remove it». Regla 2; propuesta 4. https://carbondesignsystem.com/elements/motion/overview/
- **Microsoft Fluent 2.** [Práctica] Más tiempo a lo más grande y lo que más recorre; navegación de primer nivel con fundido; desfases cortos; 50–500 ms.
  Reglas 8, 20. https://fluent2.microsoft.design/motion · https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/durations.ts
- **Material 3 (Compose y MDC-Android).** [Práctica] «duration should increase as the area/traversal of an animation increases»; resortes: espaciales con
  amortiguamiento 0,9 (estándar) o 0,6–0,8 (Expressive), **los de efecto (color, opacidad) en 1,0 en los dos esquemas**; curvas de 50 a 1000 ms.
  Reglas 8, 12; propuesta 5. https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md ·
  https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StandardMotionTokens.kt
- **Shopify Polaris, Uber Base Web, Salesforce SLDS.** [Práctica] Escalas primitivas; lineal solo para spinners (Polaris). Los valores de Polaris pueden ser
  legado (su sitio redirige a shopify.dev). Regla 11. https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/motion.ts
- **Radix Themes 3.3.0.** [Práctica] Curva principal `cubic-bezier(0.16, 1, 0.3, 1)`. Comparación con `--ease-cayla`. https://www.npmjs.com/package/@radix-ui/themes
- **Vercel, Web Interface Guidelines.** [Práctica] Animar solo si «clarifies cause and effect or adds deliberate delight»; `transform`/`opacity`;
  interrumpible; `transform-origin` correcto; «Never `transition: all`»; pausa para lo que pase de 5 s. Reglas 1, 14, 23; propuesta 7.
  https://vercel.com/design/guidelines

## Práctica — oficio y design engineers

- **NN/g, «Executing UX Animations: Duration and Motion Characteristics» (2020).** [Práctica, sin estudios citados] 100–500 ms; ~100 ms para casillas;
  200–300 para un modal; ~400 solo para lo grande; desde 500 «a real drag»; entrada algo más larga que la salida; ease-out por defecto. Reglas 7, 9.
  https://www.nngroup.com/articles/animation-duration/
- **NN/g, «Skeleton Screens 101» (2023).** [Práctica] Sin indicador bajo 1 s; esqueleto estático antes que con brillo. https://nngroup.com/articles/skeleton-screens/
- **Emil Kowalski, «You don't need animations» y «good vs great animations».** [Práctica] Fuera del marketing, < 300 ms; un menú de uso diario va mejor sin
  animación; no animar lo que dispara el teclado; `transform-origin` en el disparador; «a banking graph, may be better with no animation». Reglas 2, 3, 22;
  propuestas 6, 9. https://emilkowal.ski/ui/you-dont-need-animations · https://emilkowal.ski/ui/good-vs-great-animations
- **Rauno Freiberg, «Invisible Details of Interaction Design» (jul. 2023).** [Práctica] «animation should depend on frequency»; sale de su origen;
  interrumpible. Reglas 2, 22, 23. https://rauno.me/craft/interaction-design
- **Apple WWDC18 «Designing Fluid Interfaces» (803) y WWDC23 «Animate with springs» (10158).** [Práctica] Interrumpible y redirigible; la velocidad del gesto
  pasa al resorte; 100 % de amortiguamiento en toques y ~80 % con inercia; rebote 0 «the most versatile», ~0,15 apenas, > 0,4 exagerado. Reglas 12, 13;
  propuesta 5. https://developer.apple.com/videos/play/wwdc2018/803/ · https://developer.apple.com/videos/play/wwdc2023/10158/ ·
  complemento: https://medium.com/@nathangitter/building-fluid-interfaces-ios-swift-9732bb934bf5
- **Val Head, artículo sobre diseño para la sensibilidad al movimiento, Smashing Magazine (8-9-2020).** [Práctica] Reducir = sustituir (transform → opacity, misma
  duración y curva); `no-preference` es «desconocido», no consentimiento; interruptor en la interfaz que tome por defecto la preferencia del sistema; un
  banco espera menos movimiento que un sitio narrativo. Regla 28; propuestas 1 y 2.
  https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities
- **web.dev, «How to create high-performance CSS animations».** [Práctica] `transform`/`opacity`; con `top/left` se perdió ~50 % de los cuadros contra ~1 %;
  `will-change` con medida. Reglas 14, 16. https://web.dev/articles/animations-guide
- **FLIP (Paul Lewis), explicado por David Khourshid.** [Práctica] Medir, invertir, animar con `transform`. Regla 15.
  https://www.creativebloq.com/features/create-animations-with-the-flip-technique
- **Issara Willenskomer, «The UX in Motion Manifesto» (republicado en UX Magazine, 2022).** [Práctica, sin validación] 12 principios (offset y delay,
  transformación, cambio de valor…); el paralaje choca con WCAG. Propuesta 9.
  https://uxmag.com/articles/creating-usability-with-motion-the-ux-in-motion-manifesto
- **Motion (antes Framer Motion), accesibilidad.** [Práctica] `reducedMotion="user"` apaga transform y layout y conserva opacidad y color. Propuesta 2.
  https://motion.dev/docs/react-accessibility
- **Libros:** Val Head, *Designing Interface Animation* (Rosenfeld, 2016); Dan Saffer, *Microinteractions* (O'Reilly); Thomas y Johnston, *The Illusion of
  Life* (referencia, no primera lectura). Cursos activos: animations.dev (Kowalski) y Whimsical Animations (Comeau).

## Del propio repo (mandan sobre todo lo anterior)

- `docs/adr/0136-regla-de-movimiento-de-modales.md` — la regla, su lista de excepciones y la actualización 2026-11-05 de los cuatro tiempos.
- `docs/adr/0625-animaciones-arrancan-apagadas.md` — quieto por defecto, `data-senal`, `prefiereQuieto()`, el sistema gana siempre.
- `docs/adr/0611-estados-financieros-en-vidrio.md` (mejora 6, ritmo «Rápido»), `docs/adr/0422-aviso-hay-una-version-nueva-de-cayla.md` (el único
  rebote), `docs/adr/0479-la-hoja-del-celular-viva-y-con-profundidad.md`, `docs/adr/0623-fluidez-lo-que-se-desplaza-no-se-desenfoca.md`,
  `docs/adr/0128-proveedores-vista-rapida-y-gestos-de-movimiento.md` (la llegada escalonada), `docs/adr/0358-unificar-una-funcion-una-pieza.md` (`.mov-boton`).
- `apps/web/app/globals.css` (tiempos, curvas, «REGLA DE MODALES», `.mov-boton`), `apps/web/app/estilos/movimiento.css`, `apps/web/lib/movimiento-cliente.ts`,
  `apps/web/lib/useQuieto.ts`, `apps/web/lib/motion-gsap.ts`, `apps/web/components/ui/Modal.tsx` (`MS_SALIDA`, `MS_SALIDA_CELULAR`, `MS_ENTRADA_CELULAR`).
- Pruebas: `lib/movimiento-tiempos.test.ts`, `lib/movimiento-reglas.test.ts`, `lib/hover-con-mouse.test.ts` y las de cada excepción
  (`lib/vitrinas-movimiento.test.ts` es el modelo).

## No verificado

- **El umbral de Doherty (< 400 ms)** solo se leyó en Laws of UX; el texto original de IBM (1982) no se pudo abrir y no hay réplica moderna. La skill no lo usa.
- **Ninguna duración concreta (100, 160, 260, 480 ms) sale de un experimento.** Son convención de los sistemas; la única cifra de laboratorio es la de
  transiciones de datos (Heer y Robertson). El tope de 1,2 s por pieza de las excepciones y el presupuesto de 1,2 s por coreografía son **convenciones del
  repo y de esta skill**, no de una fuente externa. Lo mismo la receta «un bucle de señal ≥ 1,6 s por vuelta» y el «70–85 %» de la salida (sale de los
  pares de Atlassian, Primer y NN/g, no de un estudio).
- **No hay estudio** que compare resortes con Bézier, que mida la carga cognitiva de animar lo frecuente, ni que fije la duración por tamaño o distancia.
  La regla de la frecuencia es criterio de práctica que coincide entre Apple, Carbon, Kowalski y Freiberg.
- **Los valores por defecto de los resortes de SwiftUI** (`.smooth`, `.snappy`, `.bouncy`, 0,5 s) no se confirmaron en una página de Apple.
- **«You don't need animations» de Kowalski:** los cuadernos citan su contenido, pero la bibliografía no pudo confirmar el título exacto.
- **Los tamaños de efecto de Harrison** y los datos de Mejtoft et al. (2018) sobre esqueletos no se leyeron.
- **Que las View Transitions no respeten solas «reducir movimiento»** es una inferencia del informe, no algo leído en una fuente oficial.
- **Qué parte de la gente activa «reducir movimiento»:** no se encontró ningún dato.
- **Linear, Stripe, Framer y shadcn/ui:** no se investigaron; no se afirma nada de ellos.
- **`referencia/medir.js` no se corrió en un navegador** al escribir la skill (solo `node --check`): la primera vez, compáralo con el panel Animations de DevTools.
