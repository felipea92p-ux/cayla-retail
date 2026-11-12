---
name: espacio
description: Fija y audita al milímetro el espacio de una pieza del ERP —escala de 4 px, retícula y anchos, densidad (alto de filas y de controles), área de clic y de toque (24 px con mouse, 44 con el dedo), radios y profundidad— con base en WCAG, estudios y los mejores sistemas de diseño, y lo mide en el navegador. Es parte del set «Al milímetro» y aporta la sección «Espacio» de la ficha de /milimetro. Úsala al diseñar o revisar un componente, una tabla, un modal o una pantalla, y cuando Felipe diga «está apretado», «hay mucho aire», «no se alinea», «el botón es muy chico», «no se le atina», «se ve desordenado», «densidad» o «/espacio».
---

Espacio de: $ARGUMENTS   (un componente, una ruta como `/inventario/frescura`, un modal, una tabla; sin argumento = lo que estás construyendo)

**El espacio agrupa, ordena y deja tocar: todo valor sale de la escala de 4 px, lo de adentro nunca tiene más aire que lo de afuera, y nada que se toca mide menos de 24 px con mouse ni de 44 con el dedo.**

## Candados

1. **El repo manda sobre la skill.** Radios, lateral y escala salen de `apps/web/app/globals.css` (`--radius-*`, `--spacing-lateral`, el
   `--spacing` de 4 px de Tailwind v4); la profundidad, de `apps/web/app/estilos/vidrio/recetas.css` (ADR-0596); el tacto, de
   `apps/web/app/estilos/tacto.css` (ADR-0611, mejora 5); las piezas, de la tabla «Una función, una pieza» de `CLAUDE.md` (ADR-0358); el
   movimiento, de ADR-0136 / ADR-0625. **Nunca** introduce un radio, una sombra, un hex, una fuente o una pieza nueva.
2. **Si la investigación dice que una regla del repo se puede mejorar, no la cambia sola:** la escribe como propuesta (regla actual con
   archivo/ADR → qué hacen los mejores con fuente → propuesta → riesgo → cómo se mide) y Felipe decide mirando, como en `/unificar`. Cambiar
   una regla de varios módulos exige su OK (CLAUDE.md «Reglas de ejecución»).
3. **Tres niveles, siempre etiquetados:** `[Evidencia]` · `[Norma]` · `[Práctica]`. Los tokens de Carbon o Primer son práctica, nunca ciencia.
4. **Se mide, no se opina.** Cada número dice cómo se verifica: `referencia/medir.js` en `javascript_tool`, un `grep`, o una prueba del repo.
5. **No duplica.** Lo que ya mide `/formidable` (`.claude/skills/formidable/referencia/medir-oficio.js`: huecos renderizados entre hermanos,
   alturas desiguales en una fila, cuántos radios, cuántas sombras, bordes casi alineados) se corre con ese script; el 44 del dedo de verdad,
   con `pnpm --filter web tacto:medir`; las piezas repetidas, con `/unificar`; el responsive de 1024 a 1920, con `/multi-view-responsive`;
   el pulido fino de sombras y alineación óptica, con `/better-ui` (se consulta, no manda). Esta skill da el fundamento y las medidas exactas.

## Las reglas al milímetro

Fuentes por clave en `referencia/fuentes.md`. «Calculado» = sale del CSS y falta confirmarlo con `medir.js`.

### A · La escala de espacio

1. **Base 4 px.** Los pasos: **0 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80**. Arriba de 24 se salta de 8 en 8 o más. → Tailwind
   v4 del repo (`p-1` = 4, `p-3` = 12, `p-6` = 24; `globals.css` no redefine `--spacing`). `[Práctica]` CARBON, ATLASSIAN, POLARIS, PRIMER,
   FLUENT, RADIX, TAILWIND: todos convergen en esto.
2. **Medios pasos 2 · 6 · 10 solo DENTRO de un control o pieza chica** (≤ 48 px de alto): ícono-texto, insignia, relleno de celda, la
   píldora. Fuera de un control no existen. → `gap-1.5` (6) de `btn-cayla`. `[Práctica]` ATLASSIAN (2, 6), POLARIS (celda 6), FLUENT (6, 10).
3. **Fuera de la escala, siempre: impares, fracciones, 14, 18, 22, 26…** → hoy los hay: ver propuesta 1. `[Práctica]` ningún sistema leído
   tiene 14 ni 18.
4. **Adentro ≤ entre (proximidad).** El aire dentro de un grupo es **menor** que el que lo separa de sus vecinos; si no, el grupo se lee
   como dos. Pasos típicos: etiqueta-valor 4 · dentro de un campo o una fila 8–12 · entre campos 16 · entre bloques 24–32 · entre secciones
   40–48. Una caja (borde, fondo, vidrio) agrupa por sí misma (región común) y relaja la regla. → `<Tabla>`: hueco de fila `gap-y-1` (4) <
   relleno `py-3` (12). `[Práctica]` ATLASSIAN, PRIMER («el hueco va con el tamaño del control»); Gestalt sin fuente leída.
5. **El espacio jerarquiza.** Más aire = otro nivel; el mismo aire = lo mismo. Dos bloques hermanos llevan el mismo hueco. `[Práctica]` ATLASSIAN.

### B · Retícula y anchos

6. **Cortes de ventana: los de Tailwind sin tocar** — `sm` 640 (manda: aparece el lateral, cambian los márgenes; 1 327 usos), `lg` 1024
   (265), `xl` 1280 (134), `md` 768 (91), `2xl` 1536 (14). `[Práctica]` TAILWIND; cerca de CARBON (672/1056/1312) y ANDROID (600/840/1200).
7. **Lo que vive en un contenedor mira su contenedor, no la ventana.** La tabla corta por su ancho en escalones de **80 px entre 400 y 1200**
   (`corteDePlantilla`, `lib/tabla-corte-reglas.ts`, `app/estilos/tabla-corte.css`). Una pieza nueva que cambia de forma usa `@container`.
   `[Norma]` CSS Container Queries; el repo ya lo decidió (CLAUDE.md «Tablas»).
8. **La pantalla ocupa todo el ancho** (ADR-0462): el `<main>` ya lo da, con márgenes de **16** en el celular y **20 / 40** (izq./der.) desde
   640, arriba 80 y 96 (`components/AppShell.tsx`). Se llena con sentido: cifras en fila, tabla a lo ancho, una columna al costado. Solo un
   párrafo o un formulario corto se topan (`max-w-prose`, `max-w-2xl`). → `lib/ancho-completo.test.ts`. La medida de lectura es de `/tipografia`.
9. **El lateral es un token:** 272 px abierto, 84 plegado (`--spacing-lateral`, `w-lateral`/`ml-lateral`). Nunca un `ml-56` suelto.
10. **Anchos con nombre para lo que flota:** hoja 448 · 576 · 768 (`<Modal tamano>`), cajón 456 · 544 (`<Cajon>`). `[Práctica]` PRIMER
    (192/320/480/640/960) usa la misma idea.
11. **Columnas:** escritorio 12 cortes lógicos con huecos de 16–24; el celular, una. Carbon usa 4 / 8 / 16 columnas con margen 16 (24 a 1584).
    El repo no tiene una retícula de columnas como token: arma con `grid` y huecos de la escala. `[Práctica]` CARBON.

### C · Densidad: alto de filas y de controles

12. **Una densidad por pantalla.** Los controles de una fila miden lo mismo; no se mezcla compacto y cómodo en la misma hoja. `[Práctica]` SAP.
13. **Lo que usa el repo hoy** (escritorio, cómodo):

| Pieza | Alto | Dónde |
|---|---|---|
| Campo / combo (`caja-campo`) | **40** · alta 48 · baja 36 | `estilos/campos-y-casillas.css` |
| Botón (`btn-cayla`, píldora de vidrio) | **40** mín. | `estilos/vidrio/campos-y-botones.css` |
| Buscador · fila del menú lateral | 44 · 44 | `vidrio/campos-y-botones.css` · `AppShell.tsx` (`h-11`) |
| Pestaña de vidrio | 36 | `estilos/pestanas-y-segmentos.css` |
| Paginación, ⋯, lápiz, copiar (ícono solo) | 32 | CLAUDE.md «Una función, una pieza» |
| Fila de `<Tabla>` | ≈ 44 (12 + línea + 12, calculado) | `components/ui/Tabla.tsx` (`py-3`) |
| Encabezado de `<Tabla>` | ≈ 32 (8 + línea + 8, calculado) | `Tabla.tsx` (`py-2`) |

14. **Lo que hacen los mejores** `[Práctica]`: filas de tabla Carbon 24 · 32 · 40 · **48** · 64; controles Primer 24 · 28 · **32** · 40 · 48;
    SAP compacto **32** con mouse y cómodo **44** con dedo (impuesto en teléfono y tablet); Material baja de a **−4 px** por paso. El repo
    está en «cómodo» también con mouse: correcto para colaboradoras sin formación técnica (principio 10); una vista compacta para quien
    trabaja listas largas es la propuesta 4.
15. **La densidad sube de a 4 px**, nunca a otro número (36 → 40 → 44 → 48). `[Práctica]` MDC.

### D · Área de clic y de toque

16. **Piso: 24 × 24 CSS px** para todo lo que se apunta, o un blanco chico con su círculo de 24 px libre de otros blancos. Exentos: el enlace
    dentro de una frase y el control del navegador sin tocar. `[Norma]` W-258 (AA).
17. **Objetivo con mouse: 32 px de alto** (CLAUDE.md «Formidable»). `[Práctica]` PRIMER medium, SAP compacto.
18. **Con el dedo: 44 × 44.** El repo lo da solo con `pointer: coarse` en `tacto.css`: lo que tiene sitio **crece** (`min-height: 44px`); lo
    que no, **agranda su área** con un `::after` invisible (`area-dedo`). Una pieza nueva del sistema se suma a esa lista. `[Norma]` W-255;
    `[Evidencia]` PARHI: 9,2 mm para tocar una cosa, 9,6 mm en serie (≈ 44–48 px); `[Práctica]` SAP, PRIMER (`minTarget.coarse` 44).
19. **Un botón dentro de una fila clicable no se salva por separación:** su círculo cae sobre la fila. Mide 24 por sí mismo o sale de la fila.
20. **Fitts:** lo que se usa seguido va grande y cerca de donde ya está el mouse o el pulgar; la acción principal, junto al último campo
    (`pie-acciones`), no al otro lado de la hoja. Los bordes de la ventana son blancos «infinitos». `[Evidencia]` Fitts 1954 / MacKenzie 1992
    — fuente no leída en esta ronda (ver «No verificado»).

### E · Radios

21. **Escala progresiva: más grande la pieza, más grande el radio.** Control 14 (`--radius-campo`) → tarjeta 22 (`--radius-tarjeta`) →
    cajón 28 (`--radius-cajon`) → hoja 32 (`--radius-hoja`); botón píldora 999 (`--radius-boton`); lo que aún no es vidrio, 4 · 8 · 12 · 16 ·
    20 (`--radius-sm…2xl`). Por qué (ADR-0012, comentario de `globals.css`): «un control chico con el mismo radio que una tarjeta grande se ve
    deformado, no suave». `[Práctica]` CARBON, POLARIS, FLUENT, RADIX, TAILWIND: todos tienen escala, no un radio único.
22. **Concéntricos:** una pieza pegada al borde de otra lleva radio ≈ radio de afuera − separación, y **nunca más redondo que su
    contenedor**. → `medir.js` lo marca como «radio invertido». `[Práctica]` sin fuente leída.
23. **≤ 3 radios distintos por pantalla** (sin contar la píldora). → `medir-oficio.js` de `/formidable` los cuenta. `[Práctica]`.

### F · Profundidad

24. **Lo pegado al fondo no lleva sombra propia; la profundidad la da el vidrio:** **el pozo** (hundido: espera tu dato — campos, combos,
    buscador), **la gota** (sobresale: lo que haces o donde estás — botones, opción activa), **la placa** (plana: lo que explica — notas,
    filas). Las sombras `--shadow-*` son solo de lo que flota (modal, desplegable, popover; ADR-0012). → `recetas.css`, CLAUDE.md «El vidrio
    «Serena»» y «Paleta y orden de pantalla» (única excepción: la tarjeta Vitrina, ADR-0589). Ojo: el vidrio claro de tablas y cifras sí
    trae una sombra difusa (`--vidrio-claro-sombra`): ver propuesta 3. `[Práctica]` CARBON (capas de fondo, no sombras).
25. **Sin sombras no es sin señales.** Con significantes débiles la gente tarda **22 % más** y hace **25 % más fijaciones**, y el costo crece
    con la densidad: justo lo que es un ERP. Por eso lo que se toca lleva **borde de control 3:1** (`borde-control`, ADR-0516), forma de
    botón constante, hover y foco visibles (anillo de 2 px, `--foco-ancho`). `[Evidencia]` NNG-PLANO.
26. **Orden de pantalla = orden de profundidad:** cabecera (`<EncabezadoPagina>`) → cifras (`TarjetaCifra`) → filtros y tabla en UNA tarjeta
    → nota en hueso (`nota-cayla`). Entre esos cuatro, el hueco más grande de la pantalla (24–32). → CLAUDE.md «Paleta y orden de pantalla».

### G · Tablas

27. **Sin cebra por defecto; un hilo entre filas.** La cebra **no mejora la precisión** (Enders, 244 personas) pero tampoco daña y el 46 % la
    prefiere: es preferencia, no regla. El vidrio ya la quitó (`.tabla-cayla .fila-cayla:nth-child(even…)` transparente, hilo `--hilo-fila`
    en `vidrio/pantalla.css`); la cebra de `globals.css` sigue para lo que no es vidrio (propuesta 5). `[Evidencia]` ENDERS.
28. **Alineación:** texto a la izquierda; número y dinero a la **derecha** con cifras tabulares (`celda("der")` ya pone `text-right
    tabular-nums whitespace-nowrap`); el identificador y el estado en las primeras columnas. `[Práctica]` MDC; `[Evidencia]` NNG-F.
29. **Relleno de celda:** 20 a los costados y 12 arriba y abajo (`px-5 py-3`), hueco entre columnas 16 (`gap-x-4`). `[Práctica]` POLARIS usa 6
    en celda (más denso); CARBON da el alto y no el relleno.
30. **Una tabla nunca corre de lado:** bajo lo que piden sus columnas pasa a su forma de celular (regla 7). Nunca un `<table>` de registros a mano.

## Cómo se usa

**Modo diseñar** (te piden una pieza nueva o `/milimetro` te llama): ① busca si la pieza existe en la tabla de CLAUDE.md «Una función, una
pieza»: si existe, sus medidas ya están dadas y solo las anotas · ② elige la densidad de la pantalla (regla 12) · ③ fija alto, relleno y
hueco con la escala (1–5) · ④ área con mouse y con dedo (16–19): si la pieza es nueva en el sistema, anótala para `tacto.css` · ⑤ radio
por tamaño (21–22) y materia del vidrio (24) · ⑥ llena «Tu sección de la ficha». Ningún número fuera de la escala sin su propuesta escrita.

**Modo auditar** (una pantalla o un componente que ya existe), en local, a **1440 × 900** primero, luego 1024 × 768 y 375 × 812:

1. Pega `referencia/medir.js` entero en `javascript_tool` (panel visible). Lee `resumen` y luego `detalle`. Lo de `[marco]` va aparte.
2. Corre también `.claude/skills/formidable/referencia/medir-oficio.js` (huecos renderizados, filas desiguales, radios, sombras): no lo repitas.
3. Para el dedo de verdad: `pnpm --filter web tacto:medir -- /tu-ruta` (375 px, pantalla táctil, cuenta el `::after` y la `<label>`).
4. En el código, lo que el navegador no dice:
   ```bash
   cd apps/web
   grep -rnoE "\b(p|px|py|pt|pb|pl|pr|m|mt|mb|ml|mr|gap|gap-x|gap-y)-\[[0-9.]+px\]" <archivos>   # px a medida
   grep -rnoE "\b(p|px|py|m|mt|mb|gap|space-y)-3\.5\b" <archivos>                                # 14 px
   grep -rnoE "\b(min|max)-\[[0-9.]+(px|rem)\]:" <archivos>                                      # cortes a medida
   grep -rnoE "rounded-\[[^]]+\]" <archivos>                                                     # radios a medida
   ```
5. Clasifica cada hallazgo **Medido / Observado / Opinión** y con su regla. Si choca con un token, no cambies el token: va a propuestas.

Qué es falla en `medir.js`: `blancosBajo24QueFallanAA` > 0 (bloquea si lleva a algo irreversible) · `blancosBajo44ConDedo` > 0 en Vender,
Cambios o Devoluciones (PL-105) · `valoresFueraDeEscala` · `mediosPasosFueraDeUnControl` · `proximidadRota` · `radiosInvertidos`. Anotar, no
fallar: `blancosBajo24PeroSeparados` (pasan por la excepción) y `blancosDePantallaBajo32DeAlto` (objetivo, no piso).

## Tu sección de la ficha

```
## Espacio      (de /espacio)
Densidad: cómoda (escritorio, mouse) | táctil (pointer: coarse) — una sola en la pantalla
Alto: <n> px (token o pieza: caja-campo 40 / btn-cayla 40 / fila de Tabla ≈44 …)
Relleno: <arriba> <lados> px (Tailwind: py-3 px-5) · Hueco adentro: <n> px · Hueco con sus vecinos: <n> px  (adentro ≤ entre ✓/✗)
Área de clic: <ancho>×<alto> px (≥ 24 AA ✓/✗, separación ✓/✗) · Con dedo: 44 por tacto.css (crece | ::after area-dedo | falta sumarla)
Radio: <token> (<n> px), concéntrico con <contenedor> (<n> px − <separación>)
Materia: pozo | gota | placa | vidrio claro | flota (sombra --shadow-*) — receta de recetas.css
Ancho: todo el ancho (ADR-0462) | tope <max-w-…> porque <párrafo/formulario corto> · corte por contenedor: <escalón>
Fuera de escala: ninguno | <valor> → propuesta <n>
Verificado con: medir.js @1440/1024/375 · medir-oficio.js · tacto:medir   (Medido | sin medir)
Fuentes: [Norma] W-258 · [Evidencia] PARHI/NNG-PLANO/ENDERS · [Práctica] CARBON/PRIMER/SAP…
```

## Propuestas de mejora al repo

Todas **propuesta, espera a Felipe**. Ninguna se aplica sin que la vea (candado 2); las que tocan varios módulos, con su OK.

1. **Una sola regla de escala, escrita igual en los dos lugares.** *Hoy:* CLAUDE.md «Formidable» dice «espaciado en múltiplos de 4», pero
   `formidable/referencia/oficio-visual.md` (fila 8) acepta múltiplos de 2 (incluido 14), y el código usa 14 px (`*-3.5`: 313 usos en TSX),
   px a medida (`px-[18px]`, `mt-[5px]`, `gap-[7px]`…), `padding: 0.3125rem` (5 px) en `btn-chico` y `pildora-cayla`, `padding: 0 15px` en
   `.pestana-cayla`, `padding-inline: 1.125rem` (18) en el botón de vidrio, `py-[11px]` en el encabezado grande de `<Tabla>`. *Los mejores:*
   escala cerrada con medios pasos solo debajo de 12 (ATLASSIAN, POLARIS, FLUENT). *Propuesta:* la escala de la regla 1–3 en los dos
   textos, y migrar pieza por pieza (14 → 12 o 16; 18 → 16 o 20; 5 → 4 o 6). *Riesgo:* mover 1–2 px cambia altos de botones en todo el ERP
   y la paridad con Dynamic. *Se mide:* `valoresFueraDeEscala` de `medir.js` antes/después y un conteo con grep que solo baje (como las deudas de `/unificar`).
2. **El `btn-chico` no mide lo que dice.** *Hoy:* `globals.css` le da `min-height: 2.75rem` (44) dentro de `@layer components`, pero
   `.btn-cayla:not(.btn-enlace) { min-height: 2.5rem }` de `vidrio/campos-y-botones.css` va sin capa y le gana: con mouse quedaría en 40
   (calculado, sin medir). *Los mejores:* un botón chico es 28–32 con mouse (PRIMER, CARBON sm) y 44 con dedo. *Propuesta:* medirlo; si da 40,
   decidir entre «chico = 32 con mouse + 44 por `tacto.css`» o corregir el comentario. *Riesgo:* su comentario dice 23 pantallas; hoy aparece en 103 archivos TSX.
   *Se mide:* `altosDeControles` en una pantalla con `btn-chico`, a 1440 y con `pointer: coarse`.
3. **La regla de sombras dice una cosa y el vidrio hace otra.** *Hoy:* CLAUDE.md «Paleta y orden de pantalla» dice «sin sombras en superficies
   pegadas al fondo», pero `.tabla-cayla`, `.tarjeta-cifra` y `.resumen-sede` usan `--vidrio-claro-sombra` (`0 12px 28px -18px`, sombra
   difusa) y `medir-oficio.js` cuenta toda `box-shadow`. *Los mejores:* profundidad por capas de fondo y borde, no por sombra (CARBON).
   *Propuesta:* reescribir la regla como «lo pegado al fondo lleva solo la luz de su receta (filo `inset` y la difusa del vidrio claro);
   nunca una `shadow-*` propia», y que `medir-oficio.js` no cuente las sombras de receta. *Riesgo:* ninguno visual (solo texto y medición).
   *Se mide:* el conteo de sombras de `medir-oficio.js` deja de dar falsos.
4. **Una vista compacta para quien trabaja listas largas.** *Hoy:* una sola densidad cómoda (filas ≈ 44, controles 40) también con mouse.
   *Los mejores:* SAP compacto 32 con mouse y cómodo 44 con dedo, fijado a nivel de app; Radix con un multiplicador. *Propuesta:* solo con
   `pointer: fine` y por decisión de pantalla (Contar, Movimientos, Comprobantes), filas de 36 y controles de 32; nunca mezclada en la misma
   hoja. *Riesgo:* dos densidades = dos cosas que mantener; la evidencia es solo de práctica (no hay estudio que la pruebe). *Se mide:* filas
   visibles sin scroll a 1440 × 900 y una prueba ciega de `/formidable` en las dos.
5. **Una sola cara para la tabla: sin cebra.** *Hoy:* `.fila-cayla:nth-child(even of .fila-cayla)` raya en hueso (`globals.css`) y la tabla de
   vidrio la anula y usa un hilo. *Evidencia:* la cebra no mejora la precisión (ENDERS). *Propuesta:* quitar la cebra de la base y dejar el hilo
   en todas; si alguna tabla muy ancha la necesita, que sea su decisión con `unificar-fijo`. *Riesgo:* tablas fuera de vidrio (planilla de
   Contar) pierden la guía de fila. Pasa por `/unificar` (familia `tabla`). *Se mide:* el censo de `/unificar` deja una sola variante.
6. **Cortes de ventana con nombre.** *Hoy:* 52 cortes a medida distintos (`min-[56rem]:`, `min-[880px]:`…) en 460 usos, más 9 `@media
   (max-width: 860px)` y otros sueltos. *Los mejores:* un juego cerrado de cortes y, para lo que vive en un contenedor, `@container`
   (TAILWIND, CARBON, PRIMER). *Propuesta:* en la ventana, solo `sm`/`lg`/`xl`; lo demás pasa a consulta de contenedor como `tabla-corte.css`,
   con una prueba de conteo que solo baje. *Riesgo:* cada corte a medida resolvía un caso real; migrar exige mirarlo a 1024–1920
   (`/multi-view-responsive`). *Se mide:* el grep del paso 4 y el informe de `/multi-view-responsive`.
7. **Radios a medida.** *Hoy:* 126 `rounded-[…]` en TSX y dos escalas conviviendo (4–20 y la de vidrio 14–32). *Propuesta:* mapear cada
   `rounded-[…]` a su token y escribir en `globals.css` qué escala va con qué tamaño de pieza (regla 21) y la regla concéntrica (22). *Riesgo:*
   bajo. *Se mide:* `radiosInvertidos` de `medir.js` y el conteo con grep.
