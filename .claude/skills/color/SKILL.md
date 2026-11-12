---
name: color
description: Decide y audita el color de una pieza del ERP al milímetro — qué token va en cada texto, borde, superficie, estado y dato, con su contraste medido (WCAG 2 como puerta, APCA como segunda mirada) en claro y en oscuro, el rojo de marca separado del error, daltonismo y cuántos colores caben en una pantalla. Aporta la sección «Color» de la ficha de /milimetro. Úsala al diseñar o revisar una pantalla, un modal, un chip o un gráfico, y cuando Felipe diga «color», «contraste», «no se lee», «muy rojo», «se pierde en oscuro», «daltónico» o «qué color le pongo». Con una ruta mide la pantalla en el navegador; con `tabla` regenera los contrastes de la paleta.
---

Color al milímetro: $ARGUMENTS   (una pieza, una ruta como `/caja`, un modal, `tabla`, o sin argumento = lo que estás construyendo)

**El color no se elige: se asigna por rol a un token que ya existe, se mide en los dos temas y nunca carga solo un significado.**
Parte del set «Al milímetro» (`/milimetro` orquesta; hermanas: `/tipografia`, `/espacio`, `/movimiento`, `/graficos`, `/textos`).
Las cifras salen de `referencia/contrastes.md`, generado desde los tokens reales; las fuentes, de `referencia/fuentes.md`.

## Candados

1. **El repo manda sobre la skill.** Colores SOLO de los tokens de `apps/web/app/globals.css` (`@theme static`) y su oscuro en
   `apps/web/app/estilos/tema.css`; piezas, de la tabla «Una función, una pieza» de `CLAUDE.md` (ADR-0358); el vidrio, de
   `app/estilos/vidrio/recetas.css` (ADR-0596). **Nunca un hex, un `rgb()`, `bg-white`, una paleta o una pieza nueva** (lo vigila `lib/tema-colores.test.ts`).
2. **Si la investigación dice que una regla del repo se puede mejorar, no la cambias:** la escribes como propuesta (regla actual con archivo/ADR →
   qué hacen los mejores con fuente → propuesta → riesgo → cómo se mide) y se decide con Felipe mirando, como en `/unificar`. Un token nuevo o un
   cambio de tono toca varios módulos y a CAYLA Dynamic (contrato de familia, ADR-0516): siempre su OK.
3. **Tres niveles, siempre etiquetados:** `[Evidencia]` · `[Norma]` · `[Práctica]`. Un número de práctica (APCA, ΔE 11) no es un hallazgo científico.
4. **Se mide, no se opina.** Cada regla dice cómo se verifica: `contrastes.py`, una prueba del repo, `tema:auditar` o `referencia/medir.js`.
5. **No duplica:** el foco y «El hilo» son de `/focus`; dos formas de una misma pieza, de `/unificar`; la pantalla entera, de `/formidable`;
   el pulido de sombras y radios, de `/better-ui` (se consulta, no manda); la elección del gráfico, de `/graficos`.

## Las reglas al milímetro

Valores: claro / oscuro, sobre crema · papel · hueso (WCAG 2; Lc APCA entre paréntesis cuando importa). Todo **[Medido]** en `referencia/contrastes.md`.

### A. Qué token para qué

1. **Página** `crema` (#f5f0e8 / #1c1a17) · **superficie** `papel` (tarjeta, tabla, hoja) · **hundido** `hueso` (campo en caja, zebra, `nota-cayla`)
   · **línea** `sand`. Elevado = más claro en oscuro (lo prueba `lib/tema-tokens.test.ts`). → `bg-crema|papel|hueso`, `border-sand`. [Práctica] Carbon (capas).
2. **Texto principal** `tinta`: 15.4 · 16.4 · 13.4 / 15.3 · 13.7 · 11.6 — pasa AAA (7:1) en todo. Es el único color para lectura larga. [Norma] 1.4.6.
3. **Texto secundario** `taupe` (#805c4c): 5.21 · 5.58 · 4.56 / 7.77 · 6.94 · 5.89; o `tinta-60` (6.57 · 7.03 · 5.75). Sobre `sand` el taupe queda en 4.50 justo:
   no lo bajes de ahí. [Norma] 1.4.3. Historia: ADR-0017 (el taupe viejo #a47865 daba 3.39).
4. **Texto tenue** `text-tinta/35…/60`: sube solo al piso de `tema.css` (64 % en claro → 4.98 · 5.11 · 4.69; 60 % en oscuro → 6.20 · 5.82 · 5.24).
   `/25` y `/30` son fantasmas a propósito. **Un `color-mix` de tinta bajo el 64 % escrito en CSS no tiene piso** (al 50 %: 3.24 en crema): lleva su
   `/* contraste: … */` y lo mide `lib/tema-tokens.test.ts`. Nunca `opacity-*` solo en claro. [Norma] 1.4.3 + ADR-0336.
5. **Borde de lo que se toca o se escribe** `borde-control` (#96786a / #8d7a6e): 3.57 · 3.82 · 3.12 / 4.25 · 3.80 · 3.22. **`sand` es solo decorativa**
   (1.16 · 1.24 · 1.01): tarjeta, tabla, píldora con texto. Un control se identifica por su borde **o** por su relleno a 3:1 contra lo de afuera. [Norma] 1.4.11.
6. **Foco de teclado** `--foco-color` = `tinta`, 2 px a 2 px (15.4:1): **nunca rojo** (el rojo es del error y del acento) **ni con transparencia**
   (rojo/60 = 2.5:1). → ADR-0351, `lib/foco-comun.test.ts`. La guía de foco («El hilo») también es tinta: `/focus`. [Norma] 1.4.11, 2.4.7, 2.4.13.
7. **Estados (semáforo)**, siempre con `<Chip>` / `<Aviso>` / `<Globito>`, nunca una píldora a mano: `verde` hecho · `ambar` al filo · `rojo` hay que actuar
   o error · `pizarra` informativo (en camino, en revisión; **no es semáforo**) · `neutro` (taupe sobre sand, 4.50) · `apagado`. El texto del chip va en su tono
   sobre el mismo tono al 15 % (verde 5.27, ámbar 5.47, pizarra 5.17) y el rojo en `rojo-profundo` sobre `rojo/10` (7.03). [Práctica] Carbon `$support-*`.
8. **Datos** (métodos, sedes, personas, reparto, caminos, `grafico-alza|neutro|baja`, `naranja`, `avance-medio`): **relleno, nunca texto**, y siempre
   con su nombre al lado. Por eso `metodo-efectivo` (2.37), `avance-medio` (2.87) o `grafico-neutro` (1.56) no reprueban: la información va en texto
   (excepción de 1.4.11). El texto sobre ellos: `metodo-efectivo-tinta`, o `tinta-fija`/`crema-fija` sobre un color de prenda (`data-color-dato`). [Norma] 1.4.11.
9. **Velo y sombra** `--color-sombra`, nunca `tinta` (en oscuro aclararía). **Papel físico** (boleta, ticket, etiqueta, QR) `.papel-fijo`. → CLAUDE.md «Modo oscuro» 2–3. [Práctica] Atlassian: por significado, no por parecido.

### B. Las puertas de WCAG (lo que reprueba)

10. **1.4.3** texto 4.5:1; grande 3:1 (≥ 24 px, o ≥ 18.66 px en negrita). Sin redondear: 4.499 reprueba. Exento: deshabilitado, decorativo, logo. [Norma]
11. **1.4.6** (AAA) 7:1 / 4.5:1: objetivo para lo que se lee de corrido (tinta lo cumple siempre), no puerta. [Norma]
12. **1.4.11** 3:1 para borde de control, estado de un control (marcado, elegido) y la parte de un gráfico que hace falta para entenderlo. El hover no
    necesita 3:1 pero no puede bajarlo. [Norma]
13. **1.4.1** el color nunca es el único medio: un estado lleva palabra o ícono, un error lleva «!» + frase + `role="alert"`, una serie de gráfico lleva
    etiqueta o forma, un enlace en una frase lleva subrayado (`btn-enlace` lo dibuja) o 3:1 contra el texto de al lado (G183). [Norma]
14. **2.4.11** el control enfocado no queda tapado **entero** por la cabecera de vidrio que flota ni por la Isla de abajo. Se mide con `medir.js` (`tapadoEntero2411`). [Norma]
15. **2.4.13** (AAA) el indicador de foco ≥ perímetro de 2 px y 3:1 entre con y sin foco: el anillo del repo lo cumple. [Norma]

**Pares prohibidos (medidos):** `rojo` como texto sobre `hueso`/`sand` (4.23 / 4.18 en claro; 4.08 sobre sand en oscuro) → usa `rojo-profundo`
(6.62 / 6.54) · `metodo-transferencia` como texto sobre hueso/sand (4.36 / 4.31) · cualquier color de dato como texto · `sand` como borde de control ·
un fondo `rojo` con letra crema como botón (plano da 4.83, sobre vidrio no llega; «Lo peligroso» lo prohíbe: `lib/vidrio-contraste.test.ts`).

### C. APCA: la segunda mirada (informa, no reprueba)

16. WCAG 2 es la única norma vigente; WCAG 3 (borrador del 10 sep 2026) no tiene algoritmo. APCA 0.0.98G-4g se mira después, sobre todo en oscuro y
    en letra fina o chica: **Lc 75** columna de texto · **60** texto de contenido · **45** títulos grandes · **30** marcadores. [Práctica] Somers; Roselli.
17. Lo que APCA ve y WCAG no: el texto tenue del oscuro (piso al 60 %) da 5.8:1 pero **Lc −47**; el rojo en oscuro, 5.70:1 y **Lc −47**. Es texto para
    etiquetas cortas, no para párrafos. Ver propuesta 4. El claro sale bien: tinta-60 Lc 77–82, taupe 71–75, piso 70–73.

### D. Rojo de marca frente a rojo de error

18. **Lo que hacen los mejores con marca roja:** Red Hat usa su rojo «as an accent, not to fill large areas», da al peligro y al error **otro tono**
    («red orange») y reserva los colores de estado solo para estado. Carbon separa `$support-error` de la marca. [Práctica]
19. **Lo que hace hoy el repo** (un solo tono para las dos cosas, separadas por forma y por presupuesto): **(a)** la acción principal es negra
    (`btn-primario` = tinta, pasa a `rojo-profundo` al pasar el mouse), también la que borra o anula, con `<AvisoNoSeDeshace />` (CLAUDE.md «Lo peligroso»);
    lo que abre esa confirmación es `btn-peligro`, letra `rojo-profundo` (8.09); **(b)** **máx. 2 rojos por pantalla** (`--color-rojo` en `globals.css`,
    `MAX_ROJO_POR_PANTALLA` en `packages/shared/src/design-tokens.ts`; el login lleva tres por excepción de Felipe, ADR-0169); `<EnlaceVer>` gasta uno;
    **(c)** el error siempre con forma: `<Aviso tono="error">` (ícono, `role=alert`, destella una vez) y `.pie-error` bajo su campo (`rojo-profundo`, 7.56);
    **(d)** el foco nunca rojo. El rojo pleno (`rojo`) es el acento que se mueve; `rojo-profundo` es el texto fijo de error y peligro.
20. Una pantalla que ya gasta sus dos rojos en acento y luego muestra un error: el error gana, el acento baja (`lib/existencias-para-hoy.ts` pasa los vencidos de
    más a ámbar). Se cuenta con `medir.js` (`rojosEnVista`). Si choca seguido, propuesta 6.

### E. Daltonismo

21. **Prevalencia:** varones 5.6 % (blancos) a 2.6 % (hispanos) y 1.4 %; mujeres 0–0.5 % (Xie 2014, n = 4 005, EE. UU.). Casi todo es rojo-verde. [Evidencia]
22. **Medido con Machado 2009 (dicromacia, ΔE CIE76; < 11 = se confunden como relleno vecino):** `verde`/`rojo` en protanopía 9.9 · `rojo`/`ambar` 8.6 ·
    `sede-tru`/`sede-tal` en deuteranopía **3.7** (oscuro 7.0) · `metodo-yape`/`metodo-transferencia` 9.1 (oscuro **4.5**) · `pizarra`/`verde` en tritanopía 5.5.
    El trío `grafico-*` pasa en todo (≥ 22). [Medido] (fuente del umbral: comentario de `globals.css`, [Práctica]).
23. Regla: **dos colores que se confunden en alguna fila de esa tabla nunca van vecinos sin su nombre, un patrón o una separación de claridad.** Un estado
    se lee sin color (palabra + punto + ícono). Verificación visual: DevTools ▸ Rendering ▸ Emulate vision deficiencies. [Norma] 1.4.1.

### F. Modo oscuro

24. **Claro por defecto, oscuro elegible** (botón de la cabecera, preferencia del aparato, `localStorage["cayla-tema"]`; ADR-0336, punto 5). La evidencia
    lo respalda: el texto oscuro sobre claro se lee mejor y la ventaja crece cuanto más chica es la letra (Piepenbrock 2013–2014) [Evidencia]; NN/g:
    no poner oscuro por defecto, sí dejar elegirlo [Práctica]. El crema frente al blanco es marca, no evidencia (Rello y Bigham no probaron blanco).
25. **Una pieza alcanza el oscuro sin hacer nada si usa solo tokens.** Lo exigido (CLAUDE.md «Modo oscuro» 1–5): sin colores sueltos, velos en `sombra`,
    papel fijo y color de dato quietos, `dark:` solo donde una medida lo pida, un token nuevo en los tres lugares (`@theme`, oscuro y `.papel-fijo`).
26. **En oscuro, sobre `sand`** solo se leen `tinta` y `taupe` (rojo 4.08, tarjeta 4.82, yape 4.64: no van ahí como texto).

### G. Cuántos colores por pantalla

27. Casi todo es neutro (crema, papel, hueso, sand, tinta, taupe). **Una** acción principal en tinta por zona. **Rojo ≤ 2** (§19). Estados solo donde hay
    estado. Colores de dato solo dentro de un gráfico o junto a su nombre. [Práctica] Red Hat («accent») y Radix (lo saturado solo en el paso 9).
    La regla 60-30-10 no tiene fuente para interfaces: no se usa.

## Cómo se usa

**Modo diseñar** (sale la sección «Color» de la ficha):
1. Lista cada cosa con color de la pieza: textos, bordes, superficies, estados, datos, foco. Ponle su rol (§A) y su token; si no hay token para ese rol,
   no lo inventes: escribe «no existe: ver propuesta» y pásalo a Felipe.
2. Busca cada par (texto/fondo, borde/afuera) en `referencia/contrastes.md`, en **claro y oscuro**, y anota el número y su puerta (§B). Si el par no está
   (un alfa nuevo, un tinte), agrégalo a `contrastes.py`, regenera y anótalo: no calcules a ojo.
3. Cuenta los rojos (§19) y revisa §E para todo lo que distinga solo por tono. Revisa APCA (§C) en lo chico o fino.
4. Si la pieza pone texto sobre vidrio (degradado), el número de la tabla no vale: lo mide `lib/vidrio-contraste.test.ts`; dilo en la ficha.

**Modo auditar** (lo que existe):

| Qué | Cómo | Cuándo |
|---|---|---|
| La paleta cambió o falta un par | `python3 .claude/skills/color/referencia/contrastes.py > .claude/skills/color/referencia/contrastes.md` (`--verificar` comprueba las fórmulas) | al tocar un token |
| Tokens, colores sueltos, vidrio, foco | `pnpm --filter web test -- tema-tokens tema-colores vidrio-contraste foco-comun` | siempre, antes de cerrar |
| Muchas rutas × cuentas × **los dos temas**, solo texto, manchas claras, velos | `pnpm --filter web tema:auditar -- --cuenta admin --ruta <ruta> --escenarios` (solo localhost; mira las capturas) | al cerrar una pantalla o un módulo; separa lo que rompió el oscuro de lo heredado |
| **El estado que tienes abierto ahora** (hoja a medio llenar, combo abierto, error a la vista, hover, 375 px): texto + APCA, **bordes de control a 3:1**, foco (1.4.11, 2.4.11, 2.4.13, nunca rojo), **rojos en vista**, enlaces solo por color | pega `referencia/medir.js` entero en `javascript_tool`; repite en el otro tema y tras pulsar Tab hasta cada control | mientras diseñas o cuando `tema:auditar` no llega a ese estado |
| Foco rojo escrito a mano | `grep -rn "outline-rojo\|ring-rojo" apps/web/components apps/web/app` | al tocar un archivo de esa lista |

`tema:auditar` es el barrido en lote (Playwright, cuentas del seed, claro contra oscuro); `medir.js` es el instrumento de mano para una pantalla y
un estado, y mide lo que el barrido no mide (bordes, foco, rojo, enlaces). Ninguno mide degradados: eso es `vidrio-contraste.test.ts`.
Lee `medir.js` así: `texto` reprueba; `apcaSegundaMirada` solo informa; `noConcluyente` está sobre un degradado; `controles.fallan` reprueba 1.4.11;
`rojosEnVista > 2` rompe el presupuesto. Cada hallazgo trae su `[data-guia]` si lo tiene, para ubicarlo.

## Tu sección de la ficha

```
## Color        (de /color)
Tema medido: claro y oscuro (los dos, siempre)
| Elemento | Rol (§A) | Token claro / oscuro | Sobre | WCAG claro / oscuro | Puerta | APCA | Fuente |
|---|---|---|---|---|---|---|---|
| Título de la hoja | texto | tinta | papel | 16.44 / 13.67 | 4.5 | +100 / −96 | [Norma] 1.4.3 |
| Borde del campo | control | borde-control | hueso | 3.12 / 3.22 | 3 | — | [Norma] 1.4.11 |
| Estado «Pendiente» | estado | <Chip tono="ambar"> | ámbar/15 en papel | 5.47 / 6.12 | 4.5 | — | [Norma] 1.4.3 + 1.4.1 (lleva palabra) |
Rojos en pantalla: N de 2 — cuáles
Sin color solo: cómo se lee cada estado sin color (palabra, ícono, forma)
Daltonismo: pares vecinos que se confunden (§22) y cómo se separan
Vidrio: qué texto va sobre degradado y qué prueba lo mide
Cómo se verificó: contrastes.md (fecha) · medir.js en <ruta> claro/oscuro · tema:auditar
Propuestas: si la pieza choca con una regla del repo (número de propuesta)
```

## Propuestas de mejora al repo

Todas **propuesta, espera a Felipe**. Ninguna se aplica desde esta skill.

1. **El foco nunca rojo, también en lo que quedó.** Hoy: `--color-ring: var(--color-rojo)` en el puente shadcn (`globals.css`, bloque `@theme` de los alias;
   el comentario aún dice «`ring` sí es rojo») y `.hoja-cobro-medio:focus-visible { outline: 2px solid var(--color-rojo) }`, contra ADR-0351; y 27 usos de
   `outline-rojo` pleno fuera de `components/ui/` que `lib/foco-comun.test.ts` no cuenta (solo cuenta los con transparencia; deuda `PENDIENTES_HOY = 25`).
   Los mejores: un solo indicador, por rol (Carbon `$focus`). Propuesta: `--color-ring: var(--foco-color)`, el cobro con el anillo común, y que el candado
   cuente también el rojo pleno como deuda que solo baja. Riesgo: bajo (solo foco). Se mide: el `grep` de arriba baja a 0 y `medir.js` → `foco.rojo: false`.
2. **Medir el claro en el CI como ya se mide el oscuro.** Hoy `lib/tema-tokens.test.ts` («modo oscuro: contraste medido») recorre cada texto × superficie solo
   en oscuro; del claro mide los pisos, el naranja y `borde-control`. Por eso nada avisa que `rojo` sobre hueso da 4.23 ni `metodo-transferencia` 4.36.
   Propuesta: el mismo bucle para el claro, con los pares prohibidos de §B escritos como excepción explícita. Riesgo: ninguno en pantalla. Se mide: la prueba.
3. **El espejo de tokens de `packages/shared/src/design-tokens.ts` está viejo.** Dice taupe #a47865, verde #5f7a52, ámbar #b0812f, métodos de pago de otros
   colores, radios 0 y «el sistema no usa sombras»; `COLOR_TOKENS` no lo importa nadie (solo se usa `MAX_ROJO_POR_PANTALLA`). Un agente que lo lea aprende
   la paleta equivocada. Propuesta: dejar solo la constante del rojo (o generar el espejo desde `globals.css` con una prueba). Riesgo: bajo. Se mide: `grep COLOR_TOKENS`.
4. **APCA en el texto tenue del oscuro.** Hoy el piso oscuro es 60 % (5.82:1 sobre papel, Lc −47: APCA lo deja solo para títulos grandes). Al 70 %: 7.42:1 y
   Lc −59. Fuente: APCA Easy Intro, Radix (Lc 60 para su texto tenue). Propuesta: mostrarle a Felipe antes/después al 60 y al 70 % en una pantalla densa.
   Riesgo: la jerarquía tenue se aplana. Se mide: `contrastes.py` y `tema:auditar` en oscuro.
5. **Colores de dato vecinos que se confunden con daltonismo.** `sede-tru`/`sede-tal` (deuteranopía 3.7 en claro) en el telar de Finanzas y
   `metodo-yape`/`metodo-transferencia` (4.5 en oscuro) en la barra de Caja. Propuesta: que `tema-tokens.test.ts` exija ΔE ≥ 11 con daltonismo a cada juego
   categórico que se dibuja junto (como ya hace con el trío `grafico-*`) y ajustar tono o claridad mirando con Felipe en `/unificar`. Riesgo: medio (colores de
   Finanzas y Caja, viajan a Dynamic). Se mide: la tabla de daltonismo.
6. **Un rojo para el error distinto del de marca, solo si los datos lo piden.** Red Hat lo separa por tono; el repo, por forma y presupuesto (§19). Propuesta:
   primero medir con `medir.js` los rojos por pantalla en cada módulo con un error a la vista; si una pantalla de trabajo pasa de 2 seguido, decidir con Felipe
   entre (a) un tono de error propio o (b) quitarle el rojo al acento (`<EnlaceVer>`, el hilo de fila). Riesgo: alto (marca, dos sistemas). Se mide: `rojosEnVista`.
