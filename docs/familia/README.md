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

## Lo que hoy es igual (verificado)

Comparado el 2026-10-25 contra los artifacts «CAYLA Retail» y «CAYLA Dynamic», valor por valor:

- **Los colores de los DOS temas.** Claro (13 colores), al hex: `crema #f5f0e8`, `papel #fbf8f2`, `hueso #eae1d2`, `sand #e8e0d0`, `tinta #1a1a18`, `taupe #805c4c`,
  `rojo #b8412d`, `rojo-profundo #8b2a1f`, `verde #48603f`, `ámbar #74501a`, `pizarra #4c5d6e`, y los dos fijos (`tinta-fija`, `crema-fija`).
  **Oscuro (decidido el 2026-10-26, P1 opción C: «gris cálido»):** `crema #1c1a17`, `papel #26241f`, `hueso #33302a`, `sand #403b34`, y el texto, el rojo y el
  semáforo de Retail (`tinta #f5f0e8`, `taupe #c4a898`, `rojo #e8806a`, `rojo-profundo #f29a86`, `verde #9ccb8d`, `ámbar #e4b968`, `pizarra #a2b8cd`). Retail ya lo aplica; **Dynamic
  todavía no** (ver abajo).
- **Las letras:** DM Sans (el sistema) y EB Garamond (el alma), las dos de Google Fonts.
- **Los radios:** 8 px (control), 16 px (superficie), 20 px (flotante) y píldora.
- **El tema:** el atributo `data-tema` con los valores `claro` y `oscuro`.
- **El gobierno:** «una sola forma por pieza» — aquí es `/unificar` con `lib/unificar.test.ts`; en Dynamic, el ADR 0004 con un freno en el push.

## Lo que hoy NO es igual y falta decidir

Ocho pendientes (P1, el oscuro, se decidió el 2026-10-26), cada uno con lo que dice cada aplicación y cómo decidirlo (están en `contrato.json`, `pendientes`):

| | Tema | Retail | Dynamic |
|---|---|---|---|
| **P2** | Borde de un control | `sand` (1.2:1) | `taupe` (5.6:1), por WCAG 1.4.11 |
| **P3** | Anillo de foco | tinta | rojo |
| **P4** | Vocabulario | «cliente», «encargado de sede» | «clienta», nunca «encargada» |
| **P5** | Número de una cifra | se puede pintar | siempre tinta; el significado va en un punto y la etiqueta |
| **P6** | Peso de la serif | 600 | 500 y 400 |
| **P7** | Estado vacío | ícono de lo que falta | colibrí quieto |
| **P8** | «¡» y mayúsculas | «¡» en el recibo y las guías | sin exclamación, mayúscula solo al inicio |
| **P9** | Tokens de capas (z-index) | z-50 y z-[60] sueltos | `z-sticky` 10, `z-overlay` 40, `z-toast` 60 |

P2 ya tiene su lámina para elegir mirando: `docs/maquetas/familia-borde-control-2026-10/index.html` (tres bordes, controles tocables, claro y oscuro, con las medidas).

Mientras uno de estos siga abierto, cada aplicación conserva su valor y nadie lo cambia sin decidirlo; al decidirlo, el pendiente pasa a `decidido`, el valor
sube a la capa «marca» (como pasó con el oscuro) y lo que falte aplicar en la otra aplicación queda anotado en `aplicacion_pendiente`.

## Qué prueba qué

| Qué | Dónde | Cuándo corre |
|---|---|---|
| Que el código de Retail diga lo que el contrato dice (los colores de los dos temas, los radios, las letras, el atributo del tema) | `apps/web/lib/familia.test.ts` | En cada PR, con `pnpm test` |
| Que el propio detector no esté ciego | la misma prueba, con `scripts/familia/comparar.mjs --autoprueba` | En cada PR |
| Que los dos repositorios guarden **el mismo contrato** | `pnpm familia:comparar contrato <ruta al contrato de Dynamic>` | A mano, cuando se toca la marca (ningún CI de un solo repo ve el otro) |
| Que el `tokens.json` de un artifact «Design System» cumpla el contrato | `pnpm familia:comparar tokens <tokens.json> --como retail\|dynamic` | A mano, tras publicar o sincronizar un artifact |

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

## Cómo se cambia la marca (el orden importa)

1. Se decide **mirando** (la regla de `/unificar`: Felipe elige viendo, no por una descripción).
2. Se cambia el valor en `docs/familia/contrato.json` y se sube su `version`.
3. Se cambia en el código de Retail (`apps/web/app/globals.css` o `estilos/tema.css`); `pnpm --filter web test` debe quedar en verde.
4. **El mismo día** se copia el contrato a Dynamic y se cambia su código; allí corre su propia prueba, que es esta misma con su ruta de `globals.css`.
5. `pnpm familia:comparar contrato <el contrato de Dynamic>` debe decir «los dos repositorios guardan el mismo contrato».
6. Se republican los dos artifacts de «Design System» y se corre `pnpm familia:comparar tokens … --como retail` y `… --como dynamic`.

Si un paso queda a medias, el siguiente `pnpm familia:comparar contrato` lo dice. Eso es todo el mecanismo, a propósito: dos copias de un
archivo y una prueba en cada repositorio. Un paquete compartido de marca (opción B, descartada por ahora) pasaría a valer la pena si
aparece una tercera aplicación estable, o si el paso 4 se olvida más de una vez.

## Lo que esto NO cubre

- No mide el aspecto: dos colores iguales con tipografías distintas se verían distintos. Por eso la capa «sistema» existe y se lee.
- No compara componentes, solo tokens. Que un botón se vea igual en las dos aplicaciones se vigila con el censo de `/unificar` en Retail
  y con su propio freno en Dynamic.
- El espejo `packages/shared/src/design-tokens.ts` está desfasado (taupe `#a47865`, radios en 0, «sin sombras»); sus colores, radios y
  letras no los importa nadie. `contrato.json` lo reemplaza como fuente de lo que es la marca; limpiarlo va en el backlog.
