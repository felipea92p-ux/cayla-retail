# Fuentes de /color — comentadas

Niveles: **[Evidencia]** estudio revisado por pares o experimento controlado · **[Norma]** WCAG, especificación web, guía oficial ·
**[Práctica]** sistemas de diseño, NN/g, autores de métodos. Un número de práctica no se presenta como hallazgo científico.
Investigación de base: `Fundamentos de diseño de interfaz/color_contraste.md` (nov 2026). Las cifras de CAYLA no salen de ahí (esa
investigación usó la paleta del manual, con el taupe viejo #a47865): salen de `referencia/contrastes.md`, generado desde el repo.

## Normas (W3C)

| Fuente | Nivel | Qué aporta a la skill |
|---|---|---|
| W3C, *Understanding SC 1.4.3 Contrast (Minimum)*, WCAG 2.2 — https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | [Norma] | 4.5:1 texto, 3:1 texto grande (18 pt = 24 px, o 14 pt ≈ 18.66 px en negrita). Excepciones: inactivo, decorativo, logotipo. **No se redondea: 4.499:1 reprueba.** Leída en esta sesión. |
| W3C, *Understanding SC 1.4.6 Contrast (Enhanced)* — https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html | [Norma] | AAA: 7:1 y 4.5:1 grande. En la skill es objetivo de lectura larga, no puerta. Leída en esta sesión. |
| W3C, *Understanding SC 1.4.11 Non-text Contrast* — https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | [Norma] | 3:1 para lo que identifica un control y sus estados, y para las partes de un gráfico necesarias para entenderlo. El borde cuenta contra el color de AFUERA. Exentos: deshabilitado, decorativo, gráfico cuya información también va en texto. El hover no necesita 3:1 pero no puede bajar el contraste. Citada por la investigación. |
| W3C, *Understanding SC 1.4.1 Use of Color* — https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | [Norma] | Nivel A: el color no es el único medio de dar información, indicar una acción o distinguir un elemento. Técnica G183: un enlace en una frase sin subrayado necesita 3:1 contra el texto de al lado. Leída en esta sesión. |
| W3C, *Understanding SC 2.4.11 Focus Not Obscured (Minimum)* — https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html | [Norma] | AA: el control enfocado no queda tapado **entero** por contenido del autor (cabecera o pie pegados). Tapado a medias pasa; `scroll-padding` lo arregla. Una hoja modal pasa porque toma el foco. Leída en esta sesión. |
| W3C, *Understanding SC 2.4.13 Focus Appearance* — https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html | [Norma] | AAA: el indicador tiene al menos el área de un perímetro de 2 px y 3:1 entre enfocado y sin foco. El anillo del repo (ADR-0351) lo cumple. Citada por la investigación. |
| W3C, *WCAG 3.0 Working Draft*, 10 sep 2026 — https://www.w3.org/TR/WCAG30/ | [Norma, borrador] | El contraste dice «@@[contrast measure to be determined]»: no hay algoritmo. Por eso WCAG 2.2 sigue siendo la única puerta. Anota que podría hacer falta un requisito propio para daltonismo rojo-verde. |

## Práctica

| Fuente | Nivel | Qué aporta |
|---|---|---|
| Adrian Roselli, «WCAG3 Contrast as of April 2026» — https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html | [Práctica] | APCA salió del borrador de WCAG 3 en 2023; WCAG 3 no llegaría antes de 2030. Consejo: colores que también pasen WCAG 2, o documentar la decisión. En los comentarios, Andrew Somers (autor de APCA): «APCA is draft guidance». |
| Andrew Somers, *APCA Easy Intro* — https://git.apcacontrast.com/documentation/APCAeasyIntro.html | [Práctica · afirmaciones del autor] | Niveles Lc: 90 preferido para cuerpo, 75 mínimo de columna de texto, 60 texto de contenido, 45 títulos grandes, 30 marcadores y deshabilitado, 15 lo no textual discernible. Signo negativo = texto claro sobre oscuro. Su crítica a WCAG 2 (sobrestima el contraste de los oscuros) es del autor del método, no evidencia independiente. Fórmula 0.0.98G-4g en `contrastes.py`, verificada contra sus valores de referencia (`--verificar`). |
| Red Hat Design System, *Using color* — https://ux.redhat.com/foundations/color/usage | [Práctica] | Marca roja como la de CAYLA: «use it as an accent», «not to fill large areas»; peligro y error en **«red orange»**, un tono distinto; los colores de estado no se usan en otra cosa; «All text links require an underline». Negro puro solo para logos; la UI usa #151515. Leída en esta sesión. |
| Radix Colors, *Understanding the scale* — https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale | [Práctica] | Escala de 12 pasos por rol (fondo, superficie, hover, borde sutil, borde de control, foco, sólido, texto). Garantiza APCA Lc 60 y 90 en sus pasos de texto: APCA usado como objetivo de diseño en un sistema grande. |
| IBM Carbon, *Color tokens* — https://carbondesignsystem.com/elements/color/tokens/ | [Práctica] | Tokens por rol y capa (`$background`, `$layer-01…03`, `$border-subtle`, `$text-secondary`, `$focus`), y los de estado (`$support-error…`) separados de los de marca e interacción. Es el modelo de crema → papel → hueso. |
| Atlassian, *Design tokens* — https://atlassian.design/foundations/tokens/design-tokens | [Práctica] | «Choose tokens based on meaning… not specific values»: no uses un token porque el color calza; se rompe en el otro tema. Es la regla de `--color-sombra` frente a `tinta`. |
| Björn Ottosson, «A perceptual color space for image processing», 2020 — https://bottosson.github.io/posts/oklab/ | [Práctica · publicación técnica] | OKLab/OKLCH: claridad percibida pareja entre tonos. Matrices usadas en `contrastes.py` para la tabla OKLCH. |
| Tailwind CSS v4.0, 22 ene 2025 — https://tailwindcss.com/blog/tailwindcss-v4 | [Práctica] | La paleta en `oklch()` y la opacidad con `color-mix(in oklab, … transparent)`: por eso `text-tinta/50` es tinta con alfa y se compone en sRGB sobre el fondo. |
| Material Color Utilities, *color_spaces.md* — https://github.com/material-foundation/material-color-utilities/blob/main/concepts/color_spaces.md | [Práctica] | HCT (CAM16 + L*): otra forma de escalas perceptuales. Solo contexto. |
| NN/g, *Dark Mode vs. Light Mode* — https://www.nngroup.com/articles/dark-mode/ | [Práctica · resume evidencia] | «In users with normal vision, light mode leads to better performance most of the time»; no poner oscuro por defecto; sí dejar elegirlo y aplicarlo en todas las pantallas. Es lo que ya hace ADR-0336. |

## Evidencia

| Fuente | Nivel | Qué aporta |
|---|---|---|
| Xie J. Z. y otros, «Color Vision Deficiency in Preschool Children», *Ophthalmology* 2014, DOI 10.1016/j.ophtha.2014.01.018 (resumen: https://sciencedaily.com/releases/2014/04/140403084243.htm) | [Evidencia] | n = 4 005 niños de 3–6 años (California). Varones: blancos 5.6 %, asiáticos 3.1 %, **hispanos 2.6 %**, afroamericanos 1.4 %. Niñas: 0 a 0.5 %. Es población de EE. UU.: para el Perú es una aproximación. Leído el resumen, no el artículo. |
| Piepenbrock C., tesis, Heinrich-Heine-Universität Düsseldorf, 2014 — https://docserv.uni-duesseldorf.de/servlets/DerivateServlet/Derivate-31413 ; Piepenbrock, Mayr, Mund y Buchner, *Ergonomics* 56 (2013) 1116–1124 | [Evidencia] | «All studies showed a consistent positive polarity advantage» (texto oscuro sobre fondo claro), y la ventaja **crece cuanto más chica es la letra**: justo el caso de las tablas del ERP. Igual en jóvenes y mayores. |
| Rello L. y Bigham J., «Good Background Colors for Readers», ASSETS 2017 — https://www.changedyslexia.org/publications/pdfs/2017-ASSETS-Good%20Background%20Colors.pdf | [Evidencia] | n = 341 hispanohablantes: los fondos cálidos (durazno, naranja, amarillo) se leyeron más rápido que los fríos. **No probó blanco ni crema**: el crema de CAYLA es una decisión de marca y comodidad, no un resultado probado. |
| Machado G. M., Oliveira M. M. y Fernandes L. A. F., «A Physiologically-based Model for Simulation of Color Vision Deficiency», *IEEE TVCG* 15(6), 2009 | [Evidencia · modelo] | Las matrices de simulación de protanopía, deuteranopía y tritanopía (severidad 1.0) que usa `contrastes.py` para la tabla de daltonismo. Ver «No verificado». |

## El repo (lo que ya está decidido; manda sobre todo lo de arriba)

- `docs/adr/0169-paleta-oficial-cayla-dynamic.md` — paleta oficial, tabla de contraste medida, «máx. 2 rojos» (excepción del login: tres).
- `docs/adr/0336-modo-oscuro-del-erp.md` — oscuro = mismos tokens con tinta y crema intercambiadas; arranca en claro; preferencia del aparato; pisos de texto tenue; `tema:auditar`.
- `docs/adr/0351-un-solo-anillo-de-foco-de-teclado.md` — anillo de tinta de 2 px a 2 px; «tinta con transparencia falla igual que rojo con transparencia».
- `docs/adr/0017-taupe-deja-de-ser-color-de-texto.md`, `docs/adr/0012-piso-de-contraste-y-esquinas-suaves.md` — la historia del taupe y el piso.
- `docs/adr/0516-la-familia-cayla-contrato-con-dynamic-y-prueba-de-paridad.md` — `borde-control` es el mismo valor en CAYLA Dynamic (contrato de familia).
- `docs/adr/0358-unificar-una-funcion-una-pieza.md` — «Lo peligroso»: la acción principal que borra es negra.
- Pruebas: `lib/tema-tokens.test.ts`, `lib/tema-colores.test.ts`, `lib/vidrio-contraste.test.ts`, `lib/foco-comun.test.ts`. Herramienta: `apps/web/tema/` (`pnpm --filter web tema:auditar`).

## No verificado (honesto)

- **El «~8 % de los hombres y ~0.5 % de las mujeres»** (ascendencia del norte de Europa): no se pudo leer en una fuente primaria. La página del
  National Eye Institute (https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness) quedó bloqueada en esta sesión.
  La skill usa solo Xie 2014.
- **No hay un estudio de prevalencia en el Perú ni en Latinoamérica** leído. Un artículo brasileño (Rev Bras Oftalmol) no cargó.
- **Las matrices de Machado 2009** se escribieron desde la publicación conocida, sin abrirla en esta sesión. Comprobación parcial: con ellas,
  el rojo y el verde del repo colapsan bajo protanopía (ΔE 9.9), como se espera. Si alguien las coteja con el artículo y difieren, se corrige `contrastes.py`.
- **El umbral «ΔE < 11 = se confunden como relleno vecino»** viene del comentario de los colores de gráfico de `globals.css` («ΔE ≥ 17 normal,
  ≥ 11 con daltonismo»), una práctica del repo, no de una norma.
- **APCA no tiene validación independiente revisada por pares** que se haya encontrado: sus ventajas las afirma su autor. Por eso es segunda mirada.
- **La regla 60-30-10** es tradición de decoración: no se halló fuente primaria para interfaces. La skill no la usa.
- **La regla HCT de Material («diferencia de tono ≥ 40 ≈ 3:1»)**, Adobe Leonardo, BridgePCA y cómo separan el rojo de marca del error Airbnb,
  Netflix, YouTube, Coca-Cola o Target: no se leyeron. El único caso con fuente es Red Hat.
- **Crema frente a blanco puro:** no hay estudio controlado que compare los dos para lectura en pantalla.
- **El emulador de daltonismo de Chrome DevTools** (Rendering ▸ Emulate vision deficiencies) se nombra como práctica; no se investigó cómo simula.
