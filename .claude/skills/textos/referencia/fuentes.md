# Fuentes de /textos y su nivel de confianza

Tres niveles (candado 3 del set «Al milímetro»): **[Evidencia]** estudio revisado por pares o experimento controlado · **[Norma]** WCAG,
especificación web, guía oficial de plataforma, norma lingüística (RAE) o legal · **[Práctica]** sistemas de diseño, NN/g, guías de estilo.
Un número de práctica nunca se presenta como hallazgo científico. Investigación base: `research_notes/Fundamentos de diseño de interfaz/componentes_textos.md`
(nov. 2026); lo marcado «leído el 2026-11-12» se abrió al escribir esta skill.

## Accesibilidad (WCAG 2.2)

| Fuente | Qué aporta | Nivel | Regla |
|---|---|---|---|
| W3C, [Understanding 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) (nivel A). Leído el 2026-11-12 | «the item that is in error is identified and the error is described to the user in text» | [Norma] | A6, patrón 6 |
| W3C, [Understanding 3.3.3 Error Suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) (AA). Leído el 2026-11-12 | Si se conoce la corrección, se da, «unless it would jeopardize the security or purpose of the content». Ejemplo: «12» → «¿Quisiste decir diciembre?» | [Norma] | A6, la excepción del login |
| W3C, [Understanding 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) (AA). Leído el 2026-11-12 | Éxito: `role=status`; error: `role=alert` (solo si el foco no se mueve); progreso: `role=log` o `status` | [Norma] | B8, B9; ya lo cumplen `Avisos.tsx` y `Aviso.tsx` |

## Escritura de interfaz

| Fuente | Qué aporta | Nivel | Regla |
|---|---|---|---|
| Apple, [Human Interface Guidelines — Writing](https://developer.apple.com/design/human-interface-guidelines/writing) (cambio del 16 dic. 2025). Leído el 2026-11-12 en su versión `.md` | Botones con verbo («almost always best to use a verb»); nada de «Click here»; lo importante primero; errores junto al problema, sin culpa y con cómo arreglarlo; sin «oops»; nada de «Invalid name»; evitar «we» en errores; no decir «click» en una pantalla táctil; vacíos con el siguiente paso; lenguaje sin género | [Norma] (guía oficial de plataforma, escrita para inglés: llevarla al español es inferencia) | A1–A7, B1, B6, B11, E3 |
| Microsoft, [Writing Style Guide — Capitalization](https://learn.microsoft.com/en-us/style-guide/capitalization). Leído el 2026-11-12 | Mayúscula de oración por defecto en títulos, encabezados y nombres de botones; la Mayúscula De Título solo en raros casos | [Norma] (guía oficial; inglés) | A4 |
| GOV.UK, [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/). Leído el 2026-11-12 | «There's usually no need to say ‘please’»; no usar «click» («not all users click»); «Always use sentence case»; sin mayúsculas en bloque | [Práctica] | A4, A8, R09, R13 |
| Neusesser y Sunwall, NN/g, [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) (14 may. 2023) | Error junto a su origen, con más que color; lenguaje humano, conciso y preciso (nada de «Ocurrió un error»); consejo constructivo; sin culpa y sin «inválido/incorrecto»; **conservar lo escrito**; códigos solo para diagnóstico | [Práctica] (basada en investigación de NN/g) | A5–A7, patrones 6–7 |
| Jakob Nielsen, NN/g, [Confirmation Dialogs Can Prevent User Errors — If Not Overused](https://www.nngroup.com/articles/confirmation-dialog/) (18 feb. 2018, revisado el 7 ago. 2026). Leído el 2026-11-12 | Confirmar solo lo grave; el exceso vuelve automático el «Sí»; botones que resumen lo que pasa («Delete file / Keep file»); sin respuesta por defecto en lo peligroso; ofrecer deshacer | [Práctica] | B9, B10 |
| Katie Sherwin, NN/g, [Placeholders in Form Fields Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/) (2014, rev. 2018) | El placeholder no es etiqueta; ayudas persistentes fuera del campo | [Práctica] | B4, B5 |
| Luke Wroblewski, A List Apart, [Inline Validation in Web Forms](https://alistapart.com/article/inline-validation-in-web-forms/) (2009) | Validar al salir del campo: +22 % de éxito, −42 % de tiempo; validar al recibir el foco fue lo peor. n = 22, varias variantes por persona: **indicativo** | [Evidencia] (experimento controlado pequeño, no revisado por pares) | patrón 6, «cuándo» |
| Baymard Institute, [Required and optional form fields](https://baymard.com/blog/required-optional-form-fields) (2021) | Marcar obligatorios **y** opcionales; «todos son obligatorios» se pasa por alto | [Práctica] (benchmark con pruebas de usuarios) | B4 |
| IBM Carbon, [Notification — usage](https://carbondesignsystem.com/components/notification/usage/) | Toast de dos renglones como máximo; con acción no se va solo (o dura más); siempre con cierre | [Práctica] | B8, B9, D3 |
| Mercado Pago Developers, [Voz y tono](https://www.mercadopago.com.mx/developers/es/docs/style-guide/voice-and-tone) | «No utilizamos los pronombres "vos" o "usted"»: tutea; «transformamos la burocracia en algo fácil, directo y entendible» | [Práctica] (la referencia regional más cercana) | E1 |
| Microsoft, español neutro ([i18nguy, 2010](https://dcmpx.remotevs.com/com/i18nguy/www/PL/l10n/MS_LA_Spanish.html)) | Texto «no identificable como escrito para otro mercado»; las diferencias son léxicas (computadora/ordenador) | [Práctica], histórico | E2 |

## Español: RAE y lenguaje

| Fuente | Qué aporta | Nivel | Regla |
|---|---|---|---|
| RAE, [Español al día — Tilde en las mayúsculas](https://www.rae.es/espanol-al-dia/tilde-en-las-mayusculas). Leído el 2026-11-12 | Las mayúsculas se tildan: «La pregunta no debería ser si hay que escribir con tilde las mayúsculas, sino qué razones podría haber para no hacerlo» | [Norma] | A4 |
| FundéuRAE vía EFE/Swissinfo, [Miles y millones, claves de escritura](https://www.swissinfo.ch/spa/fund%C3%A9urae-miles-y-millones-claves-de-escritura/48566582) (5 jun. 2023). Leído el 2026-11-12 | «Los miles se separan con espacio, no con punto ni coma»; en cuatro cifras se puede omitir; en años, nunca | [Norma] (RAE, contada por su fundación) | F1, propuesta 2 |
| Universidad de Piura, [Castellano Actual — «Un espacio que marca la diferencia»](https://www.udep.edu.pe/castellanoactual/?p=2729). Leído el 2026-11-12 | La misma norma, desde Perú; un lector apunta que bancos y aparatos siguen con coma de miles y punto decimal | [Práctica] (y testimonio del uso real peruano) | F1 |
| OMPI/WIPO, [Guía de lenguaje inclusivo en español](https://wipo.int/documents/d/gender/guidelines-inclusive-language-es.pdf) (2022). Leído el 2026-11-12 | Colectivos y comunes («el personal», «persona interesada»); evitar el desdoblamiento sistemático; el masculino genérico es normativo pero puede leerse como excluyente; no obligatoria | [Práctica] | E4 |

## Formatos: datos de configuración regional y ley

| Fuente | Qué aporta | Nivel | Regla |
|---|---|---|---|
| Unicode CLDR 48 / ICU 78.3, verificado con `Intl` en Node 22.23.4 (en las notas y otra vez el 2026-11-12) | es-PE: `1,234.5` · `S/ 1,234.50` (con U+00A0 tras «S/») · `-S/ 25.00` (guion) · `12 nov. 2026` · `12/11/26` · `3:05 p. m.` (espacios normales) · `noviembre de 2026` · `12.5%` (pegado) · `2.5 kg` · «ayer» · «Nombre, DNI y celular» | [Norma] (estándar de facto: lo que escribe el navegador) | F1–F7 |
| Ley N.º 23560 y Manual del SI en el Perú, vía [Wikipedia-es — Separador decimal](https://bestref.net/wikipedia/es/Separador_decimal) | La norma metrológica peruana fija la **coma** decimal; México cambió su NOM porque la coma «no se utiliza en la práctica» | [Norma] legal, **por fuente secundaria** | F1, propuesta 2 |

## Del propio repo (manda sobre todo lo de arriba)

`CLAUDE.md` («Vocabulario obligatorio», «Idioma», «Formidable», «Sugerencias coherentes», «Guía de foco», «Carga y espera», la tabla «Una
función, una pieza»); ADR-0022 (errores de escritura, `traducirError`), ADR-0146/0149 (avisos y loader), ADR-0284 (guía de foco), ADR-0288
act. k (cliente y miembro, sin género), ADR-0290 (`/sugerir`), ADR-0350 (Formidable), ADR-0358 (una pieza), ADR-0389 (guías), ADR-0400
(vocabulario de Producción), ADR-0411 (corte de red), ADR-0413 (el monto no se parte), ADR-0419 (la coma decimal en `CampoMonto`),
ADR-0611 mejora 4 (el botón que confirma no se apaga). Pruebas que ya vigilan texto: `lib/montos-sin-corte.test.ts`, `lib/guias.test.ts`
(vocabulario de las demos), `lib/produccion-vocabulario.test.ts`, `lib/sugerir.test.ts`, `lib/unificar.test.ts`, `lib/error-escritura.test.ts`.

## No verificado (no se presenta como hallazgo)

- **RAE, Ortografía 2010, separador decimal** (si admite punto y coma y cuál prefiere): la página de rae.es dio error de cliente dos veces.
  Lo que dice FundéuRAE de los miles sí se leyó; lo del decimal, no.
- **RAE, abreviaturas de los meses** («nov.» con punto) y **DPD «abreviatura»** (abreviaturas con punto, símbolos sin él): rae.es dio error.
  Que «nov.» lleve punto se apoya hoy solo en CLDR.
- **El porcentaje con espacio («12 %»)** que se atribuye a la RAE: no leído. CLDR es-PE lo escribe pegado.
- **«S/» como símbolo del sol desde 2015** (antes «S/.» del nuevo sol): conocimiento previo, sin fuente primaria del BCRP leída.
- **Texto primario de la Ley 23560, la NTP de INACAL y el uso del punto decimal en comprobantes SUNAT.**
- **GOV.UK Design System, «Error message»**: la lectura quedó sin permiso en esta sesión. Tampoco se leyeron Polaris, Atlassian, Mailchimp,
  Material (escritura), Yifrah (*Microcopy*) ni Podmajersky (*Strategic Writing for UX*).
- **WCAG 2.2.1 (Timing Adjustable) y 3.3.2 (Labels or Instructions)**: se nombran por su número; sus páginas Understanding no se leyeron.
- **Cuánto se alarga un texto del inglés al español** (el «20–30 %» que circula): sin fuente leída. El ERP no se traduce; el largo se mide a 375 px.
- **Tú o usted en BBVA Perú, Google es-419 y Apple es-419**: sin verificar.
- **RAE y Fundéu sobre «x», «@» y «-e»**: sin leer; la regla de no usarlos aquí sale del repo (ADR-0288 act. k: genéricos y frases sin género).
