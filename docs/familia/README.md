# La familia CAYLA — qué es igual en todas las aplicaciones y cómo lo cuidamos

CAYLA tiene más de una aplicación que ve la gente: **CAYLA Retail** (este ERP: tiendas, taller, caja, inventario) y **CAYLA Dynamic**
(asistencia y planilla de las personas). Son la misma empresa. Quien usa las dos en la misma jornada tiene que reconocer que es CAYLA en
las dos, sin que ninguna copie a la otra pieza por pieza.

La tienda online (`apps/tienda`, «A · Muro») tiene identidad propia por decisión de Felipe (CLAUDE.md, «Skills de diseño de afuera»,
punto 3) y **no entra en esta familia**; solo el logo se comparte.

## Las tres capas

| Capa | Qué es | Cómo se cuida |
|---|---|---|
| **Marca** | Lo que una persona mira para reconocer que es CAYLA: los colores del tema claro, las dos letras, los radios, el nombre del atributo del tema y el colibrí. | **Una prueba la vigila.** Si cambia en una aplicación y no en la otra, falla. |
| **Sistema** | Reglas de oficio: el vocabulario de los cinco estados, que el color nunca va solo, el contraste mínimo, que solo flota con sombra lo que flota, una sola forma por pieza. | Se vigila leyendo, con la lista `sistema` del contrato. Una diferencia se aprueba con su motivo por escrito. |
| **Producto** | Lo que puede diferir porque el uso es otro: celular primero o escritorio primero, la escala de títulos, el movimiento, con qué tema arranca, los colores de dato propios. | Cada aplicación decide; cada diferencia lleva su motivo (`producto` del contrato). |

El contrato completo, legible por una máquina, es [`contrato.json`](contrato.json). **Es el mismo archivo en los dos repositorios.**

**Desde la versión 4 (Felipe, 2026-11-05), Retail manda en diseño:** lo que cambie de aspecto en Retail llega a Dynamic, y Dynamic no propone valores de marca por su cuenta. No cubre lo que no es
diseño: qué hace cada pantalla, ni el vocabulario (P4). El vidrio viaja: Dynamic trae [`recetas.css`](../../apps/web/app/estilos/vidrio/recetas.css) de este repositorio con un vigilante (`scripts/familia/vigilante.mjs`
allá), que hoy solo avisa. Por eso este repositorio tiene que seguir público, y ni `recetas.css` ni `contrato.json` se mueven de lugar.

## Lo que hoy es igual (verificado)

Comparado el 2026-10-25 contra los artifacts «CAYLA Retail» y «CAYLA Dynamic», valor por valor, salvo lo que la versión 4 agregó (`vidrio`, `sombra` y los radios por pieza), que Retail ya tiene y Dynamic aplica con su Etapa 1:

- **Los colores de los DOS temas.** Claro, al hex: `crema #f5f0e8`, `papel #fbf8f2`, `hueso #eae1d2`, `sand #e8e0d0`, `tinta #1a1a18`, `taupe #805c4c`,
  `rojo #b8412d`, `rojo-profundo #8b2a1f`, `verde #48603f`, `ámbar #74501a`, `pizarra #4c5d6e`, y los dos fijos (`tinta-fija`, `crema-fija`).
  **Dos colores de la versión 4, que solo existen como luz y sombra (S1):** `vidrio` (`#ffffff` en claro, `#33302a` en oscuro) y `sombra` (`#1a1a18` en claro, `#000000` en oscuro). Las recetas los consumen; casi siempre van mezclados con transparente, nunca como un hex suelto.
  **Oscuro (decidido el 2026-10-26, P1 opción C: «gris cálido»):** `crema #1c1a17`, `papel #26241f`, `hueso #33302a`, `sand #403b34`, y el texto, el rojo y el
  semáforo de Retail (`tinta #f5f0e8`, `taupe #c4a898`, `rojo #e8806a`, `rojo-profundo #f29a86`, `verde #9ccb8d`, `ámbar #e4b968`, `pizarra #a2b8cd`). Retail ya lo aplica; **Dynamic
  todavía no** (ver abajo).
- **Las letras:** DM Sans (el sistema) y EB Garamond (el alma), las dos de Google Fonts.
- **Los radios, uno por pieza:** botón `radius-boton` 999 px, campo `radius-campo` 14 px, tarjeta `radius-tarjeta` 22 px, cajón `radius-cajon` 28 px y hoja `radius-hoja` 32 px (en el celular, cajón y hoja van a 26 px). Son los tokens de `globals.css`. Los de la versión 3 (8, 16 y 20 px) quedan en `radios_anteriores`: Retail los conserva para lo que aún no es vidrio y Dynamic los pinta hasta su Etapa 1.
- **El tema:** el atributo `data-tema` con los valores `claro` y `oscuro`.
- **El gobierno:** «una sola forma por pieza» — aquí es `/unificar` con `lib/unificar.test.ts`; en Dynamic, el ADR 0004 con un freno en el push.

## Lo que hoy NO es igual y falta decidir

Quedan tres pendientes abiertos, cada uno con lo que dice cada aplicación y cómo decidirlo (en `contrato.json`, `pendientes`):

| | Tema | Retail | Dynamic |
|---|---|---|---|
| **P4** | Vocabulario | «cliente», «encargado de sede» | «clienta», nunca «encargada» |
| **P8** | «¡» y mayúsculas | «¡» en el recibo y las guías | sin exclamación, mayúscula solo al inicio |
| **P9** | Tokens de capas (z-index) | z-50 y z-[60] sueltos | `z-sticky` 10, `z-overlay` 40, `z-toast` 60 |

Mientras uno de estos siga abierto, cada aplicación conserva su valor y nadie lo cambia sin decidirlo; al decidirlo, el pendiente pasa a `decidido`, el valor
sube a la capa «marca» (como pasó con el oscuro) y lo que falte aplicar en la otra aplicación queda anotado en `aplicacion_pendiente`.

**Lo que se cerró el 2026-11-05, al decidir Felipe que Dynamic sea como Retail:** el anillo de foco en tinta (P3), el número de una cifra puede llevar color (P5), la serif en 600 (P6), el estado vacío con el ícono de lo que
falta (P7), y **una sola esquina de tarjeta, 22 px, en los dos sistemas (P10)**: Retail tenía tres (20, 22 y 24 px), sin que nadie las hubiera elegido como jerarquía. También quedó decidido que las diferencias D2, D3 y D4 (títulos, movimiento y con qué tema arranca) se cierran hacia Retail.

## Qué prueba qué

| Qué | Dónde | Cuándo corre |
|---|---|---|
| Que el código de Retail diga lo que el contrato dice (los colores de los dos temas, los radios, las letras, el atributo del tema) | `apps/web/lib/familia.test.ts` | En cada PR, con `pnpm test` |
| Que el propio detector no esté ciego | la misma prueba, con `scripts/familia/comparar.mjs --autoprueba` | En cada PR |
| Que `recetas.css` pueda viajar: solo variables, en sus tres formas, sin `--color-*` ni `--radius-*` propios | `apps/web/lib/familia.test.ts` | En cada PR |
| Que los dos repositorios guarden **el mismo contrato** | `pnpm familia:comparar contrato <ruta al contrato de Dynamic>` | A mano, cuando se toca la marca (ningún CI de un solo repo ve el otro) |
| Que el `tokens.json` de un artifact «Design System» cumpla el contrato | `pnpm familia:comparar tokens <tokens.json> --como retail\|dynamic` | A mano, tras publicar o sincronizar un artifact. Lo que `aplicacion_pendiente` declara se avisa, no falla |

## Lo que `recetas.css` puede tener

Solo variables, en estas tres formas, porque es lo que Dynamic sabe colgar de su interruptor:

- `:root { … }`
- `@media screen { :root[data-tema="oscuro"] { … } }`
- `@media (prefers-reduced-transparency: reduce) { :root, :root[data-tema="oscuro"] { … } }`

Una regla de clase apunta al HTML de Retail, y un `@keyframes` o un `@layer` pisaría los de Dynamic: van en otro archivo de `vidrio/`. Así vive `vidrio/aguanta.css`, la versión maciza para quien pidió más contraste. Un `--color-*` nuevo que una receta consuma entra antes al contrato; renombrar o quitar una variable de una receta abre una tarea en Dynamic. `--vidrio-hoja-radio` vive en las recetas y no lee `--radius-hoja`, porque Dynamic todavía no tiene ese token: una prueba exige que valga lo mismo.

## Lo que falta aplicar en Dynamic (P1 = C)

El oscuro quedó decidido el 2026-10-26 y Retail ya lo usa. Dynamic debe cambiar su tema `oscuro` a estos valores (el contrato, versión 2, los guarda en
`marca.colores_oscuro`; los de hoy de Dynamic están en `oscuro_anterior.dynamic`):

| Token | Dynamic hoy | Oscuro de la familia |
|---|---|---|
| `crema` (la página) | `#1c1a16` | `#1c1a17` |
| `papel` (tarjeta, tabla, hoja) | `#26221d` | `#26241f` |
| `hueso` (campo) | `#15110d` — más NEGRO que la página | `#33302a` — más CLARO que la página |
| `sand` (la línea) | `#332e27` | `#403b34` |
| `tinta` | `#ede7db` | `#f5f0e8` |
| `taupe` | `#ab9080` | `#c4a898` |
| `rojo` | `#d4634a` | `#e8806a` |
| `rojo-profundo` | `#e8836b` | `#f29a86` |
| `verde` | `#8fae80` | `#9ccb8d` |
| `ámbar` | `#c99a4a` | `#e4b968` |
| `pizarra` | `#9db0c2` | `#a2b8cd` |

Lo que cambia para quien usa Dynamic: el campo deja de ser «hundido» y pasa a ser «elevado» (más claro que la página, como en el ERP), y el rojo sobre la tarjeta
sube de 4.28:1 a 5.70:1 (hoy no pasa el 4.5 de los textos). Lo que pide revisar en su código: todo lo que dependa de que `hueso` sea más oscuro que `papel`
(los campos, la casilla de una cifra activa) y los tintes de las insignias, que se miden otra vez. Después: copiar `contrato.json` a su repositorio, poner allí la misma
prueba, quitar su `aplicacion_pendiente` del contrato en los dos repositorios, y correr `pnpm familia:comparar tokens <su tokens.json> --como dynamic` (debe quedar sin avisos).

## Lo que falta aplicar en Dynamic (P2 = C)

El borde de un control quedó decidido el 2026-10-26 y Retail ya lo usa. Es **un color de marca nuevo**, `borde-control` (el contrato, versión 3, lo guarda en `marca.colores_claro` y `marca.colores_oscuro`):

| | Claro | Oscuro | Contraste sobre la tarjeta (papel) |
|---|---|---|---|
| Dynamic hoy (alias de `taupe`) | `#805c4c` | `#ab9080` (su taupe oscuro de hoy; `#c4a898` al aplicar P1) | 5.6:1 / 5.3:1 hoy (6.9:1 con P1) |
| **El de la familia** | **`#96786a`** | **`#8d7a6e`** | **3.8:1 / 3.8:1** |

Dynamic cambia su alias `borde-control = {taupe}` por estos dos valores. Lo usan allí Campo, CampoSelect, AreaTexto y Botón secundario (y el terminal); sus campos y botones se suavizan un poco, con margen sobre los 3:1 de WCAG 1.4.11. Siguen en `sand` lo
decorativo y lo que lleva un texto que lo identifica (Filtro, BotónÍcono, Botón sutil, las pastillas), como ya hace hoy. En Retail también lo llevan la casilla (antes tinta al 35 %, 2.2:1) y el interruptor apagado (antes solo su relleno, 1.6:1), y el borde sube un escalón
(una mezcla de tinta, 65 %) al pasar el mouse o al encender el campo. Después: copiar `contrato.json` a su repositorio, quitar su `aplicacion_pendiente` del contrato en los dos repositorios y correr `pnpm familia:comparar tokens <su tokens.json> --como dynamic` (debe quedar sin avisos).

## Cómo se cambia la marca (el orden importa)

1. Se decide **mirando** (la regla de `/unificar`: Felipe elige viendo, no por una descripción).
2. Se cambia el valor en `docs/familia/contrato.json` y se sube su `version`.
3. Se cambia en el código de Retail (`apps/web/app/globals.css` o `estilos/tema.css`); `pnpm --filter web test` debe quedar en verde.
4. El vigilante de Dynamic lo ve y abre su tarea: ya no se copia a mano. Dynamic aplica su parte con su propia prueba; lo que falte queda en `aplicacion_pendiente`.
5. `pnpm familia:comparar contrato <el contrato de Dynamic>` debe decir «los dos repositorios guardan el mismo contrato».
6. Se republican los dos artifacts de «Design System» y se corre `pnpm familia:comparar tokens … --como retail` y `… --como dynamic`.

Si un paso queda a medias, el siguiente `pnpm familia:comparar contrato` lo dice. Eso es todo el mecanismo, a propósito: dos copias de un
archivo, un vigilante y una prueba en cada repositorio. Un paquete compartido de marca (opción B, descartada por ahora) pasaría a valer la pena si
aparece una tercera aplicación estable.

## Lo que esto NO cubre

- No mide el aspecto: dos colores iguales con tipografías distintas se verían distintos. Por eso la capa «sistema» existe y se lee.
- No compara componentes, solo tokens. Que un botón se vea igual en las dos aplicaciones se vigila con el censo de `/unificar` en Retail
  y con su propio freno en Dynamic.
- El espejo `packages/shared/src/design-tokens.ts` está desfasado (taupe `#a47865`, radios en 0, «sin sombras»); sus colores, radios y
  letras no los importa nadie. `contrato.json` lo reemplaza como fuente de lo que es la marca; limpiarlo va en el backlog.
