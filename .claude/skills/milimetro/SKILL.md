---
name: milimetro
description: La entrada del set «Al milímetro». Diseña y audita cada pieza del ERP CAYLA (botón, campo, tabla, gráfico, texto) con base teórica y medida en el navegador. Arma la «ficha al milímetro» llamando a /espacio, /tipografia, /color, /movimiento, /textos y /graficos, y define los estados de toda pieza interactiva. Antes de dibujar mira «Una función, una pieza»: nunca dibuja una pieza nueva a mano. Modos: `diseñar <pieza>`, `auditar <ruta|pieza>` (corre los medidores de las siete skills y ordena los hallazgos por severidad) y `proponer` (junta en un tablero las mejoras al repo que proponen las seis, para que Felipe decida mirando). Úsala cuando Felipe diga «al milímetro», «diseña este componente», «con base teórica», «full animaciones», «audita esta pieza» o «qué estados le faltan».
---

Al milímetro: $ARGUMENTS   (`diseñar <pieza>`, `auditar <ruta|pieza>`, `proponer`; sin argumento = la pieza que estás construyendo)

**Cada pieza del ERP se decide con un número, el token o la pieza del repo que lo cumple, una fuente con su nivel y la forma de medirlo. Lo que no se puede medir, no se afirma.**

Felipe pidió «skills que diseñen al milímetro y con base teórica, además de con full animaciones, cada componente, cada gráfico o cada texto».
Esta skill es la puerta de entrada. No mide letra, color ni movimiento: eso lo hacen sus seis hermanas. Ella decide **qué pieza** usar, **en qué estados**
debe funcionar y **cómo se juntan** las seis respuestas en una sola ficha:

| Skill | Le pregunta | Sección de la ficha |
|---|---|---|
| `/espacio` | alto, padding, gap, radio, área de toque, densidad | Espacio |
| `/tipografia` | familia, tamaño, interlineado, peso, cifras, medida | Tipografía |
| `/color` | tokens por estado, contraste medido, oscuro, daltonismo | Color |
| **`/milimetro`** | los once estados y lo que exige cada uno | Estados |
| `/movimiento` | qué se mueve, duración, curva, coreografía, versión quieta | Movimiento |
| `/textos` | cada texto literal y su regla | Texto |
| `/graficos` | forma, codificación, ejes, etiquetas (si es un gráfico) | Gráfico |

## Candados

1. **El repo manda sobre la skill.** Colores y letras salen solo de los tokens de `apps/web/app/globals.css` (el oscuro está en `apps/web/app/estilos/tema.css`).
   Las piezas salen de la tabla «Una función, una pieza» de `CLAUDE.md` (ADR-0358) y de `docs/unificar/README.md`. El movimiento sale de ADR-0136 / ADR-0625
   y de `--t-resp`, `--t-cambio`, `--t-hoja`, `--t-momento`, `--ease-cayla` y `--ease-salida`. El vidrio sale de `apps/web/app/estilos/vidrio/recetas.css` (ADR-0596).
   **Nunca** introduce un hex, una fuente o una pieza nueva.
2. **Si la investigación dice que una regla del repo se puede mejorar, no la cambia sola.** La escribe como **propuesta**: regla actual con su archivo o ADR →
   qué hacen los mejores, con fuente → propuesta concreta → riesgo → cómo se mide. Felipe decide mirando, como en `/unificar`. Si la regla toca varios módulos,
   hace falta su OK (CLAUDE.md «Reglas de ejecución»).
3. **Tres niveles de confianza, siempre etiquetados:** `[Evidencia]` (estudio revisado o experimento controlado), `[Norma]` (WCAG, especificación web, guía
   oficial de plataforma) y `[Práctica]` (tokens de sistemas de diseño, NN/g, design engineers). Un número de práctica nunca se presenta como hallazgo científico.
   Lo que decidió el repo se marca **«regla del repo (ADR-xxxx)»**, que es otra cosa.
4. **Se mide, no se opina.** Toda regla con número dice cómo verificarla: con `javascript_tool` en el navegador, con un `grep` o con una prueba del repo
   (`lib/tema-tokens.test.ts`, `lib/vidrio-contraste.test.ts`, `lib/unificar.test.ts`, `lib/boton-confirma.test.ts`).
5. **No duplica** `/unificar`, `/formidable`, `/focus`, `/sugerir` ni `/better-ui`: las nombra y les pasa la posta (ver «Cuándo pasar la posta»).
   `better-ui` y las skills de diseño de afuera **se consultan, no mandan** (CLAUDE.md, regla del 2026-10-17).
6. **Nunca una pieza nueva a mano.** El árbol de las reglas 1–3 va antes de cualquier dibujo.
7. **Diseñar y auditar solo miran.** La ficha y el informe no tocan el código de ninguna pantalla. Implementar requiere el OK de Felipe, y migrar
   una pieza es trabajo de `/unificar migrar`.
8. **Costo:** sin agentes por defecto. `auditar` de un módulo entero puede usar hasta 2 (un medidor y un escéptico); **avísale a Felipe la escala antes de lanzarlos**.

## Las reglas al milímetro

Las fuentes de cada nivel, comentadas y con lo que quedó sin verificar: `referencia/fuentes.md`.

### A. Antes de dibujar: el árbol (1–4)

1. **¿La pieza está en «Piezas únicas»?** (`grep -n "^## Una función, una pieza" CLAUDE.md` y su tabla, más `docs/unificar/README.md`). Entonces se usa
   **esa pieza con sus props**, y la ficha la documenta tal como es, no la vuelve a dibujar → regla del repo (ADR-0358) → lo respalda `[Práctica]` (consistencia,
   heurística 4 de Nielsen) → se mide con `pnpm --filter web test -- unificar`, que falla si alguien la redibuja.
2. **¿La familia existe pero no está decidida?** Se usa la forma **A**, la más usada en el último censo (`apps/web/unificar/.salida/<fecha>/reporte.md`),
   y no se inventa otra → regla del repo (CLAUDE.md «Una función, una pieza») → se mide con `pnpm unificar:censo -- --base-url <url> --todas --familia <id>`.
3. **¿No existe ninguna?** Se arma la ficha al milímetro y se lleva como propuesta a Felipe con `/unificar` (paso 4: `docs/unificar/propuestas/<familia>.html`;
   paso 5: `node unificar/elegir.mjs`). Hasta que Felipe elija, la pieza no entra a `components/ui/` → regla del repo (ADR-0358).
4. **El vidrio no se inventa.** Una pieza usa una receta de `recetas.css` según lo que hace: **pozo** si espera un dato, **gota** si se toca o marca dónde
   estás, **placa** si explica. Lo que se desplaza va sin `backdrop-filter` (ADR-0623) → regla del repo (ADR-0596) → se mide con `lib/vidrio-que-aguanta.test.ts`.

### B. Los once estados de una pieza interactiva (5–15)

Cada estado dice **qué exige** y **con qué pieza o token lo cumple el repo**. Tabla completa, con «cómo se mide» y ejemplos: `referencia/estados.md`.

| # | Estado | Lo que exige | En el repo | Nivel · fuente |
|---|---|---|---|---|
| 5 | **default** | letra ≥ 4.5:1 sobre su fondo real; borde de lo que se toca ≥ 3:1 | `--color-borde-control`; vidrio medido por `lib/vidrio-contraste.test.ts` | `[Norma]` WCAG 1.4.3, 1.4.11 |
| 6 | **hover** | **solo dentro de `@media (hover: hover)`**; nunca es el único camino a una información | `btn-*`, `pildora-cayla` (`vidrio/campos-y-botones.css`); el `hover:` de Tailwind v4 ya va envuelto; lo vigila `lib/hover-con-mouse.test.ts` (excepción con `/* hover-tactil: … */`) | `[Norma]` Media Queries 4 (`hover`), WCAG 1.4.13 · `[Práctica]` M3 capa 0.08 |
| 7 | **focus-visible** | indicador siempre visible; área ≥ perímetro de 2 px; ≥ 3:1 entre el estado con foco y sin foco | `:focus-visible` en `--foco-color` (tinta) · `--foco-ancho` 2 px · `--foco-separacion` 2 px (ADR-0351); en los campos, el halo | `[Norma]` WCAG 2.4.7 (AA), 2.4.13 (AAA) |
| 8 | **active** | respuesta visible en ≤ 100 ms | `scale: 0.97` en `--t-resp` (100 ms), `--shadow-sm`; la onda (`<OndaBotones>`) | `[Práctica]` M3 capa 0.10; límite de 0,1 s de Nielsen |
| 9 | **selected** | se anuncia (`aria-pressed`, `aria-selected`, `aria-current`) **y** se ve sin depender solo del color | ahumado denso con su ✓ (`pildora-cayla[aria-pressed]`), píldora de `<Pestanas>` | `[Norma]` WCAG 1.4.1, 4.1.2 |
| 10 | **disabled** | **el botón que confirma no se apaga por lo que falta**: al tocarlo, cada campo dice su error y el foco va al primero. Solo se apaga lo que no se arregla llenando algo, con el motivo a la vista | `<Boton confirma={guia}>`; `disabled={enviando}`; `aria-disabled` + motivo (`MenuAcciones`, `PasoCantidad`) | regla del repo (ADR-0611, mejora 4; CLAUDE.md «Guía de foco», punto 6) · `[Práctica]` Axess Lab |
| 11 | **loading** | no cambia de ancho; dice qué hace («Guardando…»); no se puede pulsar dos veces; la señal sigue con las animaciones apagadas; nada optimista en dinero ni stock | `<Boton cargando textoCargando>`: `PalabraEnEspera`, `HiloEnEspera data-senal`, `aria-busy`; loader único (ADR-0149) | regla del repo (ADR-0358 `accion.guardar`, ADR-0625) · `[Norma]` WCAG 2.2.2 (excepción: esencial) |
| 12 | **error** | junto a su origen, con ícono y texto (no solo rojo), ligado al control, **al salir del campo** y no a la primera letra; conserva lo escrito | `<Campo tono="error" pie>` (pone `aria-invalid` y `aria-describedby`), `useValidarAlSalir`, `guia.marcarError`, `<Aviso tono="error">` | `[Evidencia]` Wroblewski 2009 (indicativa) · `[Práctica]` NN/g · `[Norma]` WCAG 1.4.1 |
| 13 | **read-only** | enfocable, con contraste completo, sin cara de apagado: el dato se consulta | **no existe: ver propuesta 4** | `[Práctica]` inferida (Axess Lab) |
| 14 | **vacío** | la etiqueta siempre visible, nunca solo el placeholder; obligatorio **y** opcional marcados; una lista vacía dice qué hacer | `campo-etiqueta` con `*` y «· opcional»; `<Vacio>` | `[Evidencia]` Baymard 2021 · `[Práctica]` NN/g |
| 15 | **quieto** | sin movimiento, la pieza **sigue respondiendo** (color u opacidad en vez de desplazamiento); solo siguen las señales de espera | `html[data-movimiento="quieto"]` (de fábrica, ADR-0625; `app/estilos/movimiento.css`) + `prefers-reduced-motion`; `data-senal` | `[Norma]` WCAG 2.3.3 (color y opacidad no cuentan como movimiento) · `[Práctica]` Val Head |

Si un estado **no aplica**, la ficha lo dice con su motivo, por ejemplo «selected: no aplica, un botón de acción no queda elegido». Nunca se deja vacío.

### C. Cómo se juntan las seis (16–20)

16. **Orden de armado:** árbol (1–3) → `/textos` (qué dice) → `/espacio` → `/tipografia` → `/color` → estados (B) → `/movimiento` → `/graficos` → accesibilidad.
    El texto va primero porque define el ancho («contenido primero», ley 5 de `/formidable`). Si `/textos` cambia una palabra después, se vuelve a `/espacio`.
17. **Cuando dos skills chocan, gana, en este orden:** una `[Norma]` de nivel A o AA → la regla del repo que tiene prueba → `[Evidencia]` → `[Práctica]`.
    Si la regla del repo pierde contra una Norma o una Evidencia, eso no se corrige en la ficha: se escribe como propuesta (candado 2).
18. **Un número sin su forma de medirlo no entra a la ficha.** Si la skill hermana no da cómo medirlo, la ficha dice «sin medir».
19. **El movimiento es parte de la pieza** (Felipe 2026-10-07): la ficha nunca tiene menos movimiento que la pieza que reemplaza, y siempre trae su versión quieta.
20. **La ficha se guarda** en `docs/milimetro/<pieza>.md`, como historial (no se sobrescribe; se agrega una fecha). Plantilla y ejemplo resuelto:
    `referencia/ficha-plantilla.md`.

## Cómo se usa

### `diseñar <pieza>`: sale una ficha completa

0. **Terreno.** `git fetch origin`; `docs/SESIONES-ACTIVAS.md` (si otra sesión rediseña esa pieza, avísalo); `docs/unificar/<familia>.md` si existe.
1. **Árbol** (reglas 1–3). Escribe en la ficha qué rama tomó y por qué, por ejemplo «Pieza del repo: `<Boton peso="primario">`, decidida 2026-10-07».
2. **Mide la pieza real** si ya existe: abre una pantalla donde viva (el `reporte.md` del censo dice dónde) y corre el fragmento de
   `referencia/ficha-plantilla.md` («Comprobar en el navegador») con `javascript_tool`. Lee su componente y su CSS con `grep -n`. Anota cada valor con su `archivo:línea`.
3. **Llama a las seis en el orden de la regla 16** (`/textos diseñar <pieza>`, `/espacio diseñar <pieza>`…). Cada una devuelve su sección; tú no la reescribes.
4. **Escribe la sección Estados** (abajo) y la de **Accesibilidad**: criterios WCAG que toca, cada uno con cómo se verifica.
5. **Resuelve choques** con la regla 17 y junta en «Propuestas» lo que choca con el repo.
6. **Entrega:** la ficha en el chat y en `docs/milimetro/<pieza>.md`. Si la pieza es nueva, la ficha es el insumo de `/unificar` (paso 4); no la construyes tú.

### `auditar <ruta|pieza>`: hallazgos medidos, con severidad

0. **Servidor de esta worktree:** `preview_start` con `cayla-retail-dev-libre`, con la base local y el seed (como `/unificar`). Si es una pieza, busca una
   pantalla donde viva y pon antes `window.__milimetro = { raiz: "<selector>" }` para medir solo esa pieza.
1. **Corre los medidores.** Lee cada archivo con `Read` y pégalo **entero** en `javascript_tool`:

   | Medidor | 1440 × 900 claro | 375 × 812 claro | 1440 oscuro | quieto |
   |---|:-:|:-:|:-:|:-:|
   | `.claude/skills/milimetro/referencia/medir.js` (estados; con `{ foco: true }` una segunda vez) | ✓ | ✓ | ✓ | ✓ |
   | `.claude/skills/espacio/referencia/medir.js` | ✓ | ✓ | | |
   | `.claude/skills/tipografia/referencia/medir.js` | ✓ | ✓ | | |
   | `.claude/skills/color/referencia/medir.js` | ✓ | | ✓ | |
   | `.claude/skills/movimiento/referencia/medir.js` | ✓ | | | ✓ |
   | `.claude/skills/textos/referencia/medir.js` | ✓ | | | |
   | `.claude/skills/graficos/referencia/medir.js` (si hay gráficos) | ✓ | | ✓ | |

   Oscuro: `document.documentElement.dataset.tema = "oscuro"`. Quieto o vivo: `document.documentElement.dataset.movimiento = "quieto"` o `"vivo"`.
   Devuelve los dos valores como estaban al terminar. **Si un medidor no existe todavía**, el informe dice «sin medir: falta `<ruta>`»; nunca lo reemplazas a ojo.
2. **Junta y depura.** Un hallazgo que aparece en dos medidores va una sola vez, en la skill que lo dueña. Lo que el medidor marca «revisar» lo confirmas
   con `grep` en el código antes de darlo por bueno. Lo que existe por un ADR (la lista de `/unificar`, candado 3) va como «decidido a propósito».
3. **Severidad** (detalle y plantilla del informe: `referencia/auditoria.md`):
   - **Grave:** rompe una `[Norma]` A o AA (contraste, foco invisible o tapado, blanco < 24 px, error solo en rojo), una regla del repo con prueba
     (pieza decidida dibujada a mano, hex suelto, botón que confirma apagado por lo que falta) o deja un estado imposible (guarda dos veces).
   - **Media:** se aparta de una regla del repo sin prueba o de una `[Evidencia]` (un hover fuera de `(hover: hover)` sin su `hover-tactil`, lo elegido que solo dice ARIA,
     una duración escrita a mano, una validación a la primera letra).
   - **Leve:** pulido de `[Práctica]` (1–2 px, una opacidad).
4. **Entrega:** en el chat, primero los números («Botones: 2 graves, 1 media»), luego cada hallazgo como *qué · dónde · medido · regla · nivel · a quién va*,
   y al final lo que no se midió. Archivo: `docs/milimetro/auditorias/<fecha>-<slug>.md`.

### `proponer`: el tablero de mejoras al repo, para que Felipe decida mirando

1. Lee la sección `## Propuestas de mejora al repo` de las siete `SKILL.md` del set (`grep -n "^## Propuestas de mejora al repo" -A60 .claude/skills/<skill>/SKILL.md`).
2. **Junta y ordena:** saca las repetidas, marca las que chocan entre sí (dos skills que piden cosas distintas del mismo token) y ordena por
   **confianza × alcance**: primero `[Norma]` A/AA y `[Evidencia]`, después lo que más pantallas toca.
3. **Tablero** (plantilla en `referencia/auditoria.md`): una fila por propuesta, con la regla de hoy (archivo o ADR), la propuesta, el nivel, el riesgo, cómo se mide y los módulos que toca.
4. **Felipe elige mirando, no leyendo:** por cada propuesta que cambia algo que se ve o se mueve, arma la página de `/unificar` (`node unificar/elegir.mjs <spec.json>`,
   desde `apps/web`) con dos opciones: **«Existe hoy»** (la regla actual) y **«Propuesta dibujada»**. Usa el campo `demo` para que pueda pasar el mouse y
   presionar con el CSS real, en claro y en oscuro. Sírvela con `preview_start` `unificar-laminas`. Las que no se ven (una prueba nueva, un umbral) van en una pregunta corta.
5. Lo elegido entra por su camino normal: si es una pieza, `/unificar` (paso 6); si es una regla, un ADR y su sección de `CLAUDE.md`, con el OK de Felipe.
   El tablero queda en `docs/milimetro/propuestas.md`, con la fecha y lo que decidió.

### Cuándo pasar la posta

| Si la pregunta es… | Pásala a | Por qué no la haces tú |
|---|---|---|
| ¿se entiende la **pantalla** en 5 s?, ¿está cargada?, ¿qué sobra? | `/formidable` | Califica las 9 leyes de la pantalla entera; tú trabajas pieza por pieza. Tus mediciones le sirven de insumo |
| hay dos formas de la misma función, o hace falta una pieza que no existe | `/unificar` | Censo, lámina, elección de Felipe y migración son suyos (reglas 1–3) |
| la pantalla o el modal tiene campos o pasos: qué falta, qué sigue, «el hilo» | `/focus` | Tu `focus-visible` es el anillo del teclado; la guía de foco es otra cosa (ADR-0284) |
| un placeholder, un «Ej. …» o un chip sugerido no calza con lo que se eligió | `/sugerir` | `/textos` escribe el texto; que siga lo elegido lo vigila `/sugerir` (ADR-0290) |
| la pieza guarda: doble clic, red caída, dos cuentas a la vez | `/chaos` | Tu estado `loading` dice cómo se ve; `/chaos` prueba que de verdad no guarda dos veces |
| la pieza cambia los controles de una pantalla (su «huella») | `/guia` | La guía interactiva se pone al día con `guias:recorrer` (ADR-0389) |
| hay que revisar 1024–1920 px en todo un módulo | `/multi-view-responsive` | Mide siete anchos; tú mides tres |
| una idea de sombra, ícono o radio «de afuera» | `/better-ui` (solo se consulta) | Si sirve, entra por `/unificar` |

## Tu sección de la ficha

```
## Estados      (de /milimetro)
Pieza: <componente>  ·  rama del árbol: decidida | forma A del censo <fecha> | nueva → /unificar
| Estado        | Qué se ve (token / clase)              | Qué se anuncia (ARIA)        | Cómo se mide                         | Nivel · fuente |
| default       |                                         | nombre accesible             | medir.js · contraste                 |                |
| hover         | solo @media (hover: hover):             | —                            | medir.js · hoverSueltos              |                |
| focus-visible | --foco-* (2 px, sep. 2 px) o halo       | —                            | medir.js { foco: true }              |                |
| active        |                                         | —                            | a ojo en vivo + /movimiento          |                |
| selected      | o «no aplica: …»                        | aria-pressed / -selected / -current | medir.js · seleccion          |                |
| disabled      | ¿confirma? ¿qué lo apaga? ¿motivo?      | disabled | aria-disabled     | medir.js · apagados                  |                |
| loading       | texto en espera, ancho fijo, señal      | aria-busy                    | medir.js · cargando                  |                |
| error         | dónde, ícono + texto, cuándo aparece    | aria-invalid + describedby   | medir.js · errores                   |                |
| read-only     | o «no aplica: …»                        | readonly / aria-readonly     | medir.js · soloLectura               |                |
| vacío         | etiqueta, placeholder, obligatorio/opc. | —                            | medir.js · etiquetas                 |                |
| quieto        | qué queda (color/opacidad) y qué señal  | —                            | medir.js con data-movimiento=quieto  |                |
Accesibilidad: criterios WCAG que toca → cómo se verifica cada uno
```

## Propuestas de mejora al repo

Todas son **propuesta, espera a Felipe**. Detalle (regla de hoy → qué hacen los mejores → propuesta → riesgo → cómo se mide): `referencia/auditoria.md`, «Propuestas de /milimetro».

1. **Un aviso con acción no se va solo.** Hoy un aviso con «Deshacer» dura `DURACION_CON_ACCION = 7000` ms (`lib/avisos-reglas.ts`, ADR-0146). Carbon pide que un toast
   con acción quede hasta que la persona lo cierre `[Práctica]`. Propuesta: sin reloj mientras la acción siga valiendo. Se mide con `avisos-reglas.test.ts`.
2. **Un error no se va solo.** Hoy `error: 8000` ms en la misma tabla. NN/g pone el error junto a su origen y Carbon dice que los avisos que se van solos son para lo que no es crítico
   `[Práctica]`. Propuesta: el aviso de error sin reloj (se cierra con su ×). Riesgo: avisos que se apilan.
3. **Apagado, pero que se pueda leer y alcanzar.** Hoy `.btn-cayla:disabled { opacity: 0.5 }` (`globals.css`) con `disabled` nativo: no recibe el foco y WCAG
   exime su contraste. Propuesta: lo que se apaga por permiso o por estado usa `aria-disabled` con su motivo a la vista, como ya hacen `MenuAcciones` y `PasoCantidad`.
   `cargando` sigue con `disabled`, por el doble clic. `[Práctica]` Axess Lab · `[Norma]` 1.4.3 (la exención no garantiza que se lea).
4. **Una cara para «solo lectura».** Hay 12 usos de `readOnly` en `components/` sin una cara común (`grep -rn "readOnly" apps/web/components --include=*.tsx`).
   Propuesta, por `/unificar` (familia `campo`): el dato que se consulta va en la **placa** (lo que explica es plano), enfocable y con contraste completo.
5. **El foco no se esconde bajo lo que flota.** No hay un `scroll-padding-top` global para la cabecera de vidrio fija (`grep -rn "scroll-padding" apps/web/app`).
   WCAG 2.4.11 (AA) pide que el foco no quede tapado del todo `[Norma]`. Propuesta: medirlo con `medir.js { foco: true }` (`focoTapado`) en 3 pantallas largas y,
   si aparece, `html { scroll-padding-top: <alto medido de la cabecera> }`.
6. **Los estados quedan escritos con la pieza.** Hoy el registro de una familia decidida (`docs/unificar/<familia>.md`) guarda su movimiento
   (CLAUDE.md, Felipe 2026-10-07), pero no la tabla de sus once estados. Propuesta: al registrar una decisión, `/unificar` pega la sección «Estados» de la ficha;
   la pieza que no la tenga se completa cuando se toque. Riesgo: bajo (solo documentación). Se mide con `grep -L "## Estados" docs/unificar/*.md`.

## Antes de decir «listo»

Con evidencia: cada número de la ficha trae su `archivo:línea` o su medición (con ancho, tema y movimiento), cada estado tiene valor o «no aplica: <por qué>»,
y lo que no se midió se dice. Si la pieza guarda, di qué pasa con un doble clic y con la base caída, o que `/chaos` todavía no lo probó.
