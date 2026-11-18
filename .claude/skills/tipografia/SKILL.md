---
name: tipografia
description: Diseña y audita al milímetro la letra del ERP CAYLA — escala con los valores reales del repo, interlineado, medida, pesos, cuándo serif y cuándo sans, versalitas, cifras (tabulares, a la derecha, decimales, «S/» con espacio duro, formato es-PE) y el español —, con base teórica etiquetada y medida en el navegador (`referencia/medir.js`). Aporta la sección «Tipografía» de la ficha de `/milimetro`. Úsala al diseñar o revisar un texto, una tabla de montos o una cifra, y cuando Felipe diga «tipografía», «la letra se ve chica», «los números no cuadran», «las cifras bailan», «muy apretado» o «al milímetro».
---

Tipografía de: $ARGUMENTS   (una pieza, una pantalla o ruta para auditar, `auditar <ruta>`, o sin argumento = lo que estás construyendo)

**En el ERP la letra se elige por lo que la persona hace con ella —leer una frase, escanear una columna, comparar montos— y cada cosa
tiene su tamaño, su interlineado y su letra, medidos en el navegador.**

## Candados

1. **El repo manda sobre la skill.** Las letras son SOLO las de `apps/web/app/layout.tsx` (EB Garamond → `--font-serif`, DM Sans →
   `--font-sans`, en `app/globals.css`) y, para las cifras de Estados financieros, Inter (`lib/letra-estados.ts`, ADR-0611). Los tamaños,
   de `--text-xs` / `--text-sm` (`globals.css`) y de las piezas de la tabla «Una función, una pieza» de `CLAUDE.md` (ADR-0358):
   `EncabezadoPagina`, `TituloSeccion`, `.texto-bajada`, `.texto-detalle`, `.nota-cayla`, `campo-etiqueta`, `label-cayla`, `font-display`,
   `TarjetaCifra`, `<Tabla>` con `celda()`. Colores, de los tokens (`/color`). **La skill nunca introduce un hex, una fuente, un tamaño suelto
   ni una pieza nueva.**
2. **Si la investigación dice que una regla del repo se puede mejorar, no la cambia sola:** la escribe como **propuesta** (regla actual con
   archivo/ADR → qué hacen los mejores con fuente → propuesta → riesgo → cómo se mide) y se decide con Felipe mirando, como `/unificar`.
   Cambiar la letra de las cifras o un token de tamaño toca todos los módulos: espera su OK (CLAUDE.md «Reglas de ejecución»).
3. **Tres niveles, siempre etiquetados:** `[Evidencia]` (estudio revisado o experimento), `[Norma]` (WCAG, especificación, guía oficial),
   `[Práctica]` (tokens de sistemas de diseño, oficio). `[Verificación]` = archivo inspeccionado por la investigación. Un número de práctica
   nunca se presenta como hallazgo científico. Fuentes comentadas: `referencia/fuentes.md`.
4. **Se mide, no se opina.** Cada regla dice cómo verificarla: `referencia/medir.js` en `javascript_tool`, un `grep`, o una prueba del repo
   (`lib/unificar.test.ts` familia `texto`, `lib/montos-sin-corte.test.ts`, `lib/tema-tokens.test.ts`).
5. **No duplica.** `/unificar` decide la pieza y cuenta su deuda (la familia `texto` lleva 62 archivos); `/formidable` mide texto < 12 px y
   «≤ 4 tamaños» en su oficio visual; `/textos` decide QUÉ dice cada texto y el formato de número y fecha como redacción; `/espacio`, el alto
   de filas y la retícula; `/color`, el contraste; `/better-ui`, solo se consulta. Esta skill aporta el porqué y la medida fina de la letra.

## Las reglas al milímetro

La rampa completa, rol por rol, con archivo y razón: `referencia/escala.md`. Aquí, lo que decide.

### A · Tamaño

1. **Lo que se lee no baja de 14 px** → `.texto-detalle` 14, `.nota-cayla` 14, `text-sm` 15, `.texto-bajada` 15, título de fila 15
   (CLAUDE.md fila `texto`). `[Evidencia]` el tamaño que manda es la altura x: 14 px de DM Sans ≈ el tamaño crítico (0,2°) en un 24" 1080p
   a 60 cm; bajo él se lee más lento (Legge y Bigelow 2011). `[Práctica]` 14/20 es el cuerpo de Material, Carbon, Atlassian, Primer y Fluent.
2. **Etiquetas (no lectura): piso 11 px**, y solo en versalitas de 1–3 palabras → `campo-etiqueta`, `label-cayla`, sede de la cabecera.
   Encabezado de columna: `text-xs` (13 px, `TABLA.titulo`). Bajo 11: no existe pieza, ver propuesta 2. `[Práctica]` Label S 11/16 (Material).
3. **La serif no baja de 21 px en la interfaz** → `TituloSeccion` 21 es su piso (el título de `<Vacio>`, 22). Excepciones que no son
   lectura: la unidad pegada a la cifra de `TarjetaCifra` (17) y las iniciales de `AvatarPersona` (10,5–29, `enlaces-paginas-caras.css`).
   `[Verificación]` altura x de EB Garamond 0,400 contra 0,526 de DM Sans: a igual `font-size` se ve 24 % más chica.
4. **Un tamaño nuevo usa uno de la rampa** (46 · 28 · 27 · 24 · 22 · 21 · 15 · 14 · 13,5 · 13 · 12,5 · 11). Nunca un `text-[Npx]` de lectura a
   mano: lo vigila la firma de `texto` en `lib/unificar.test.ts`. `[Práctica]` la escala modular se redondea y se documenta (Tim Brown 2011).

### B · Interlineado

5. **Párrafo de 2+ líneas: ≥ 1,4** → `.texto-bajada`/`.texto-detalle` 1,4; `text-sm` 1,55; `text-xs` 1,5; `.nota-cayla` 1,6.
   `[Práctica]` Primer: 1,25 «not recommended for multi-line body text», 1,5 por defecto; el 14/20 del consenso es 1,43.
6. **Una sola línea: 1,2–1,25** (botón 1,25, `TituloSeccion` 1,2, hoja 1,1); **título de una línea: 1** (`EncabezadoPagina`). Bajo `sm`
   el título de 36 px puede partirse: con dos líneas, 1 se aprieta (mídelo).
7. **Nunca un alto fijo en una caja con texto** (`h-10` con letra adentro): `min-height` + `padding`. `[Norma]` WCAG 1.4.12 (AA): forzar
   1,5 / 0,12 em / 0,16 em / 2 em no puede recortar ni pisar nada. Se mide con `medir.js` modo `espaciado`.

### C · Medida (caracteres por línea)

8. **Texto corrido: 45–75 caracteres, nunca más de 80** → `max-w-prose` (65 ch), `.resumen-frase` (`max-width: 68ch`). `[Práctica]`
   Bringhurst 45–75, 66 ideal; `[Evidencia]` la gente juzga más cómoda la línea de ~55 (Dyson y Kipping 1998); `[Norma]` 80 es el tope de
   1.4.8 (AAA). La pantalla va a todo el ancho (ADR-0462): lo que se topa es el párrafo, no la pantalla. Las tablas no se rigen por medida.

### D · Pesos

9. **DM Sans: 400 texto · 500 botones · 600 títulos de fila, encabezados, énfasis y versalitas · 700 solo en versalitas de 11 px**
   (`.eyebrow-cayla`, el rótulo de `TarjetaCifra`). Nunca 300 o menos. **EB Garamond: 400 (`TituloSeccion`) y 600 (`.font-display`)**; no
   tiene pesos finos (400–800). Máximo 4 pesos por familia en una pantalla (`medir.js` → `demasiadosPesos`). `[Práctica]` Apple «avoid light
   font weights»; el patrón 400/500/600 de los sistemas. Hoy el código usa también 650 y 800 en piezas de diseño propio: no se copian.

### E · Serif o sans

10. **Serif (EB Garamond) = la voz de la marca, solo en lo grande:** título de pantalla, de hoja, de cajón, de sección, cifra de tarjeta,
    título de un vacío. **Sans (DM Sans) = todo lo demás:** frases, tablas, campos, botones, etiquetas. `[Práctica]` Material «Brand/Plain»,
    Atlassian. `[Evidencia]` EB Garamond fue la más rápida en promedio en Wallace et al. 2022, pero la mejor letra cambia por persona: no es
    razón para poner párrafos en serif en un ERP, que se escanea.

### F · Versalitas y tracking

11. **En DM Sans las «versalitas» son mayúsculas espaciadas** (no tiene `smcp`): 11 px · 600 · **0,13 em** (`label-cayla`, `campo-etiqueta`,
    voz de cabecera); sobretítulo 0,09 em · 700; sede 0,18 em. **De 1 a 3 palabras, nunca una frase.** `[Evidencia]` en español una oración
    en mayúsculas se lee ~4,6 % más lenta (Perea et al. 2017). Versalitas reales solo existen en EB Garamond (`smcp`) y hoy no se usan.
12. **Tracking: positivo en lo chico, cero en el cuerpo, negativo en lo grande** → 0,13 em a 11 px; 0 a 14–15; −0,005 em (`.font-display`)
    y −0,025 em a 46 px; −0,02 em en las cifras Inter. `[Práctica]` Apple, Radix, Carbon. El 0,13 em exacto no tiene fuente: no se toca.

### G · Cifras

13. **Una cifra que se compara va en una letra con cifras tabulares de verdad.** EB Garamond sí (por defecto) → `TarjetaCifra`. Inter, en
    Estados financieros → `estados.css`. **DM Sans NO tiene `tnum`: `tabular-nums` no hace nada en ella** `[Verificación]`, y el código lo pide en
    1.301 líneas de 430 archivos (~893 líneas en DM Sans). No existe la pieza: **ver propuesta 1** y `referencia/cifras.md`.
14. **A la derecha, encabezado incluido** → `celda("der")` (`sm:text-right whitespace-nowrap tabular-nums`) y `alinear: "der"` en la
    columna de `<Tabla>`. Bajo `sm` la tabla pasa a su forma de celular y alinea a la izquierda a propósito.
15. **Los mismos decimales en toda la columna:** 2 en soles (`soles()` de `lib/compras-reglas.ts`), 0 en unidades. Así coincide al menos el
    final aunque la letra no sea tabular. `medir.js` → `decimalesMezclados`.
16. **«S/» con espacio duro:** `S/ ` en código, `S/&nbsp;` en JSX (ADR-0413, `lib/montos-sin-corte.test.ts`); lo que llega de la base,
    por `montosSinCorte`. `[Verificación]` `Intl` es-PE escribe `S/ 1,234,567.89` con U+00A0: coma de miles, punto decimal; agrupa desde 4
    cifras (`1,234`); negativo `-S/ 50.50`.
17. **El formato sale de `Intl` con `es-PE`, nunca de `toFixed` + concatenación** (pierde los miles). Hay 51 copias locales de `soles`; unificar
    cuál es «la» función es de `/textos`. Fechas: zona de Lima con `lib/fechas-lima.ts`; `12 nov. 2026` (mes en minúscula, con punto) en letra
    proporcional; `12/11/2026` solo donde la cifra es tabular.
18. **Si cada celda lleva «S/», considera ponerlo una vez en el encabezado** («Monto (S/)») y dejar solo el número. `[Práctica]`, inferencia
    de la investigación: decídelo con `/textos`.

### H · Español

19. **El texto crece:** lo corto es lo que más se expande (≤ 10 caracteres: 200–300 % desde el inglés, W3C). Botones, chips y encabezados con
    ancho flexible; se prueba con la cadena más larga real («Cantidad», no «Qty»). Antes de bajar un tamaño, una abreviatura con punto y su
    `title` («Cant.», «P. unit.», «Dscto.»).
20. **Mayúscula solo inicial** en títulos y botones («Nuevo producto», no «Nuevo Producto»). Las mayúsculas sostenidas, solo en versalitas (11).
21. **Guiones:** `hyphens: auto` solo en un bloque de ayuda angosto; exige `lang` (`<html lang="es">`, `app/layout.tsx:40`). Hoy no se usa.
22. **¿ ¡ ñ tildes rayas:** las dos familias los tienen `[Verificación]`. En versalitas, `case` (DM Sans lo tiene) acomoda ¿ ¡ ( ) –: propuesta 5.

### I · Accesibilidad

23. **WCAG 1.4.4 (AA):** al 200 % no se pierde texto ni función → `resize_window` a 720 × 450 desde una pantalla de 1440 (mismo ancho CSS que
    el zoom al 200 %) y `medir.js` + captura. `[Norma]`
24. **WCAG 1.4.12 (AA):** `medir.js` modo `espaciado`. Una elipsis solo vale si hay `title`, globito o forma de abrir el texto. `[Norma]`
25. **La letra del navegador:** el zoom agranda px y rem; la preferencia de tamaño de letra del navegador solo agranda rem/em. `medir.js`
    modo `letra-del-navegador` cuenta lo que no la sigue. `[Práctica]` Primer, Carbon, Atlassian y Tailwind publican rem. Ver propuesta 4.

## Cómo se usa

### Modo diseñar (sale la sección «Tipografía» de la ficha)

1. Di qué hace la persona con cada texto de la pieza: **lee** (frase), **escanea** (etiqueta, nombre en una fila) o **compara** (cifra).
2. Para cada uno, toma de `referencia/escala.md` el rol que ya existe y su pieza. Si ninguno calza, usa el más cercano y anótalo como
   «nueva: justificar» para `/unificar`; nunca un valor nuevo.
3. Cifras: ¿se comparan en columna? Entonces derecha, decimales fijos, `celda("der")`, y anota el estado de la propuesta 1.
4. Escribe la sección con la plantilla de abajo, cada decisión con su etiqueta y su forma de medirla.

### Modo auditar

1. **Repo** (desde `apps/web`; las cifras envejecen, cuéntalas de nuevo):
   ```bash
   grep -rn "tabular-nums" app components lib --include=*.tsx --include=*.ts --include=*.css | wc -l     # cifras que piden tabulares
   grep -rnE "text-\[(9|10|10\.5)px\]" app components --include=*.tsx | wc -l                            # bajo el piso de 11
   grep -rnE "S/ [0-9$]" app components lib --include=*.tsx --include=*.ts | grep -v test | head            # «S/» partible (lo vigila montos-sin-corte)
   grep -rnE "font-weight: ?(100|200|300)|font-(thin|extralight|light)\b" app components | head            # pesos finos
   pnpm --filter web test -- unificar montos-sin-corte tema-tokens
   ```
2. **Navegador** (local; el panel visible): pega ENTERO `referencia/medir.js` en `javascript_tool` a **1440 × 900**, luego **1024 × 768**.
   Cambia `MODO` en su primera línea para `espaciado` y `letra-del-navegador`. Si `letrasCargadas` no es `loaded`, espera y repite.
   Abre también cada hoja y cada cajón de la pantalla y mide con ellos abiertos.
3. **Lee el resultado:** `lecturaChica` (< 14 px), `interlineadoCorto` (< 1,4 en párrafos), `lineasLargas` (> 80 caracteres),
   `etiquetaBajoPiso` (< 11 px), `cifras.familias` (la letra de cada cifra y si `tieneTabulares`), `columnasSinAlinear` (bordes derechos que
   varían > 1,5 px), `decimalesMezclados`, `montoPartible`, `demasiadosPesos`.
4. **Informa con etiqueta Medido** y separa: lo que es deuda ya contada por `/unificar` (pásale la posta), lo que es una regla de esta skill
   rota en código nuevo (arréglalo con la pieza que existe) y lo que solo se resuelve con una propuesta (no la implementes sin Felipe).

## Tu sección de la ficha

```
## Tipografía   (de /tipografia)
| Texto | Qué hace la persona | Pieza / clase | Letra · tamaño/interlineado · peso · tracking | Nivel y fuente |
|---|---|---|---|---|
| <título>  | escanea | <EncabezadoPagina> | EB Garamond · 46/1 · 600 · −0,025 em | decidido ADR-0220 · [Práctica] Material Brand |
| <frase>   | lee     | .texto-bajada      | DM Sans · 15/1,4 · 400 · 0            | [Evidencia] Legge y Bigelow 2011 |
| <monto>   | compara | celda("der")       | <letra de cifras: hoy DM Sans, sin tnum → propuesta 1> · 15 · 500 | [Verificación] |
Medida: <ch máximos del párrafo más largo> (≤ 75; nunca > 80)
Cifras: alineación <der>, decimales <2>, «S/» <espacio duro | en el encabezado>, formato <Intl es-PE / soles()>
Español: <cadena más larga probada>, <abreviaturas con title>
Accesibilidad: 1.4.12 <medido: N recortes> · 200 % <medido> · letra del navegador <N que no siguen>
Medido con: medir.js @1440 y @1024 · <fecha> · <resumen en una línea>
```

## Propuestas de mejora al repo

Todas **propuesta, espera a Felipe**. Ordenadas por impacto.

| # | Regla actual | Qué hacen los mejores | Propuesta | Riesgo | Cómo se mide |
|---|---|---|---|---|---|
| 1 | Todo en DM Sans; `tabular-nums` pedido en 1.301 líneas, que en DM Sans no hace nada (`celda("der")`, `Tabla.tsx`); solo Estados alinea, con Inter (ADR-0611) | Fluent: `fontFamilyNumeric`, una familia solo para cifras; Atlassian: tokens `metric` [Práctica]; la tienda ya cambió por esto (ADR-0446) | **A · Inter para toda cifra tabular**: cargar `letraEstados` en `app/layout.tsx`, token `--font-cifras` y una regla única sobre `.tabular-nums` (salvo serif). Alternativas B (solo dígitos con `unicode-range`), C (serif) y D (nada), con Ganas/Pagas: `referencia/cifras.md` | Una descarga más por pantalla; dos sans en una fila | `medir.js`: `tieneTabulares` y `columnasSinAlinear` antes y después, en un piloto (Compras); peso del `.woff2`; Felipe mira las capturas |
| 2 | La vigilancia de `texto` (`lib/unificar.test.ts`) solo mira `<p>`: deja pasar lectura a 13 px en `<span>`/`<div>`, como el globo de `<Ayuda>` (`components/Ayuda.tsx:126`, `text-xs`) y la frase de `<Cajon>` (`Cajon.tsx:317`, `text-[13px]`). Y hay etiquetas bajo 11 (`Tabla.tsx:140` 10 px; `.titulo-cuenta` 10,5) | El piso de etiqueta de los sistemas es 11–12 px [Práctica] | Ampliar la firma a `span`/`div` con texto de lectura, y llevar el globo de `<Ayuda>` y la frase del cajón a 14; subtítulo de columna a 11 | Que la firma marque falsos positivos (chips, cifras) | `medir.js` → `lecturaChica`, `etiquetaBajoPiso`; la deuda de `texto` sube y luego baja |
| 3 | `text-sm` 15 × 1,55 = 23,25 px y `text-xs` 13 × 1,5 = 19,5 px: interlineados fraccionarios | Interlineado absoluto en múltiplos de 4 (Polaris 12/16/20/24…; Carbon, Material) [Práctica] | `--text-sm--line-height: 1.5rem` (24) y `--text-xs--line-height: 1.25rem` (20), en rem | Mueve el alto de cientos de filas a la vez (+0,75 y +0,5 px por línea) | Captura antes/después al mismo ancho; `/espacio` mide filas |
| 4 | Las piezas de lectura están en px (`.texto-bajada` 15px, `.texto-detalle` 14px, `.nota-cayla` 14px; ~900 `text-[Npx]`) | Primer, Carbon, Atlassian, Tailwind: tamaños en rem [Práctica]; WCAG C28: cajas en em | Pasar esas tres piezas a rem (0.9375rem, 0.875rem): a 16 px de raíz se ven idénticas | Ninguno visible con la letra por defecto | `medir.js` modo `letra-del-navegador`: lo que no sigue baja |
| 5 | Las versalitas de DM Sans (`label-cayla`, `campo-etiqueta`, voz de cabecera) no activan `case` | DM Sans trae `case`, que sube ¿ ¡ ( ) – a la altura de las mayúsculas [Verificación de la función; efecto no probado] | `font-feature-settings: "case"` en esas tres piezas | Bajo: si no se nota, no hace nada | Se mira: una etiqueta «(OPCIONAL)» o «¿PAGÓ?» antes y después |
