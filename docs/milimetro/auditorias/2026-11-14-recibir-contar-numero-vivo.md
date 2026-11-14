# Al milímetro · Recibir ▸ Contar: el número abierto del contador, el pie, los filtros y la hoja de tallas — 2026-11-14

Segunda auditoría del día sobre `claude/analizar-tareas-pendientes-661022` (la primera: `2026-11-14-recibir-contar-tareas-4-5-10.md`). Mide lo que cambió a la
vista después de esa: el número abierto del Dial («El número de siempre, vivo»), su pista, el enlace del pie, la píldora «Faltan tallas» del panel, el foco de la
hoja «Tallas y colores» y la tabla de cantidades de Nuevo producto.

**Cómo se midió:** navegador sin ventana (Playwright del repo, `tema/motor/sesion.mjs`), cuenta `admin` en Tienda Lima, servidor de la rama (puerto 3110; `main`
en el 3070 solo para Nuevo producto). Un envío de prueba creado por la pantalla («Sin aviso», `MILIMETRO-NUMERO-VIVO`, ENV-000374, 5 modelos) y anulado al final por
la pantalla; `retail.movimientos` = 295 al empezar y al terminar. Anchos 1440 × 900 y 1280 × 800; claro y oscuro (`data-tema`); animaciones encendidas y apagadas
(`localStorage["cayla-movimiento"]`). Los seis medidores (`milimetro`, `espacio`, `tipografia`, `color`, `textos`, `movimiento`) se corrieron enteros sobre la placa
con el número abierto y cerrado. Las posiciones del número se midieron en la captura (caja de los píxeles de su color, ± 52 px alrededor del centro del aro, para
no tomar el aro), y los contrastes, contra el color real de la captura (el vidrio ya compuesto), no contra el token.

**Resultado:** 0 graves · 3 medias · 5 leves. 0 textos que fallen 1.4.3 (97 medidos en claro, 95 en oscuro, 90 a 1280).

## Lo medido, regla por regla

### 1. El número abierto del contador (`Dial.tsx`, `recepcion-viva.css:60–88`)

| Regla | Medido | Pieza o token | Nivel | ¿Pasa? |
|---|---|---|---|---|
| Abierto, la cifra mide lo mismo que cerrada | 1 y 2 cifras: 54 px / 600 cerrado y abierto; 3: 46 px; 4: 36 px. Caja de las cifras en la captura: Δ 0 px en x, y, ancho y alto para 7, 42 y 345, en claro, oscuro, vivo y quieto | `.rc-placa .rc-dial-vivo` = `.rc-dial-numero`, `data-cifras` | regla del repo (demo elegida por Felipe, 2026-11-14) | Sí (1–3 cifras) · ver M1 y L1 |
| Al abrir no salta nada | «contadas» −0,1 a −0,2 px (redondeo: 62 px contra 62,1); − y + y la pista: 0 px | `height: round(nearest, 1.15em, 1px)` | regla del repo (ADR-0185, la misma idea) | Sí |
| Al teclear no salta nada | − y +: 0 px; la pista: 0 px; «contadas»: +4,5 px al pasar de 2 a 3 cifras, +6 de 3 a 4, y −10,5 px cuando la primera tecla reemplaza un número de 4 cifras | el tamaño sigue a `data-cifras` (lo tecleado) | regla del repo (comentario de `.rc-dial-vivo`) | No: M1 |
| Contraste del número | tinta 16,3:1 (claro) · 12,77:1 (oscuro) sobre el fondo real del aro | `--color-tinta` | `[Norma]` 1.4.3 | Sí |
| El 0 que espera (sin contar) | taupe 5,53:1 (claro) · 6,49:1 (oscuro), 54 px / 600, centrado (Δx 0 respecto del centro del aro) | `--color-taupe` en `::before` | `[Norma]` 1.4.3 (texto grande pide 3:1) | Sí |
| «por contar / contadas» | 13 px / 600, taupe 5,16:1 (claro) · 5,88:1 (oscuro) | `--color-taupe` | `[Norma]` 1.4.3 | Sí (contraste) · L5 (13 px) |
| La pista | 14 px, taupe 5,43:1 (claro) · 6,4:1 (oscuro); cerrado «Toca el número para escribirlo.» (5 palabras), abierto «Escribe la cantidad y presiona Enter.» (6), mismo renglón (Δy 0) | `.rc-pista-*` | regla del repo («poco texto»: ≤ 8 palabras) | Sí. Resuelve lo anotado en la auditoría de la mañana |
| El foco, sin preferencia | sin anillo (`outline: 0`, `box-shadow: none`); cursor en tinta 16,3:1 / 12,77:1; la cifra ya contada llega seleccionada: selección 1,39:1 (claro) y 1,61:1 (oscuro) contra el fondo, tinta sobre ella 11,7:1 / 7,9:1 | `::selection` taupe 24 % | `[Norma]` 2.4.7 AA (hay indicador) · 2.4.13 AAA (pide 3:1) | Decidido a propósito; ver M2 |
| El foco con `prefers-contrast: more` | 2 px tinta, separación 2 px, radio 12; 5,96:1 contra el fondo de arriba y abajo (claro); los lados caen sobre el borde interior del aro | `--foco-*` (ADR-0351) | `[Norma]` 2.4.7 · 1.4.11 | Sí · L2 |
| El foco con colores forzados | 2 px en el color del sistema, 6,51:1 / 9,56:1 | `forced-colors: active` | `[Norma]` 1.4.11 | Sí |
| Movimiento | 0 animaciones al abrir, al teclear y al cerrar con las animaciones encendidas (`document.getAnimations()`); quieto, las mismas posiciones | se quitó el `cayla-entrada` de la caja | regla del repo (ADR-0136, ADR-0625) | Sí. Tiene menos movimiento que la caja de antes, a propósito: el número no cambia, no hay nada que entre |
| Hover del número cerrado | sombreado taupe 14 % detrás de las cifras, dentro de `@media (hover: hover)` | `recepcion-viva.css:50` | `[Norma]` Media Queries 4 · `lib/hover-con-mouse.test.ts` | Sí |

### 2. El pie de la placa: «Falta contar: <modelo>» y «Faltan tallas: <modelo>» (`PlacaDelModelo.tsx:400–414`, `recibir-mesa.css:324`)

| Regla | Medido | Pieza o token | Nivel | ¿Pasa? |
|---|---|---|---|---|
| Contraste | «Falta contar:» y «Faltan tallas:» 5,76:1 (claro) · 6,11:1 (oscuro); el nombre 16,99:1 · 12,04:1 | `--color-taupe`, `btn-enlace` | `[Norma]` 1.4.3 | Sí |
| Espacio entre el texto y el enlace | 3,7 px (el espacio de la frase), igual a 1280 y 1440 | `{" "}` | `[Práctica]` el anillo pide su separación libre | No: M3 |
| El anillo del enlace | 2 px tinta, separación 2 px, 16,98:1 (claro) · 12,04:1 (oscuro); **el lado de abajo queda cortado** (4,3 px fuera del `<p>`, que tiene `overflow: hidden` y 24 px de alto) y **el izquierdo pisa los dos puntos** (−0,3 px «Falta contar:», −0,2 px «Faltan tallas:») | `--foco-*` (ADR-0351) | `[Norma]` 2.4.7 AA (se ve: 3 lados) · 2.4.13 AAA (área) | No: M3 |
| Tamaño del blanco | 74 × 20,3 px («Cartera Mía»), 97,9 × 20,3 («Casaca Ximena») | `btn-cayla btn-enlace` | `[Norma]` 2.5.8 AA | Sí, por la excepción de separación (el medidor lo da «bajo 24 pero separado») · L4 |
| Letra | el nombre en 13,5 px / 500 dentro de una frase de 14 px | `btn-cayla` | regla del repo («la letra de lectura no baja de 14 px») | L3 |

### 3. El panel de filtros con «Faltan tallas» (`FiltrosDelEnvio.tsx:30`)

| Regla | Medido | Pieza | Nivel | ¿Pasa? |
|---|---|---|---|---|
| Misma altura, letra y relleno | las cuatro: 33 px de alto, 14 px / 600, 14 px a cada lado, sin cortes (`scrollWidth` = `clientWidth`), igual en claro y oscuro | `pildora-cayla` | regla del repo (ADR-0358) | Sí |
| Misma separación | 6 px entre píldoras y 6 px entre filas (39 px de paso) | el `gap` del grupo | `[Práctica]` | Sí (6 px no es múltiplo de 4: es del grupo de antes) |
| Cómo se acomodan | 1280 (panel de 334 px): tres filas, «Por contar · Faltan tallas» / «Tallas para después» / «Por llevar al stock». 1440 (414 px): dos filas de dos. «Faltan tallas» queda en la fila de «Por contar», no junto a «Tallas para después» | flex con salto | `[Práctica]` | Sí · L4b |
| Contraste y estados | 0 textos que fallen en claro y oscuro; ninguna puesta | `pildora-cayla[aria-pressed]` | `[Norma]` 1.4.3, 1.4.1 | Sí |

### 4. La hoja «Tallas y colores» (`TallasDeLaPlaca.tsx`, `HojaRepartir.tsx`)

| Regla | Medido | Pieza | Nivel | ¿Pasa? |
|---|---|---|---|---|
| El cursor en la primera casilla al abrir | sí, en claro y oscuro («Cuántas llegaron de Beige en M», «… Negro en S») | `PasoCantidad` celda | regla del repo (ADR-0284) | Sí |
| Cómo se ve ese foco | la caja que se enciende: borde de tinta de 1 px y halo, sin anillo; el borde con foco contra sin foco 16,29:1 (claro) · 12,83:1 (oscuro) | `campo` (ADR-0351 act. 2026-11-05) | `[Norma]` 2.4.7 · 2.4.13 AAA (1 px no llega al área) | Sí (AA); el 1 px es de la pieza decidida |
| El foco en el botón del pie cuando cuadra | «Llevar al stock ahora · 7» y «· 345»: 2 px tinta, separación 2 px, 16,29:1 (claro) · 11,89:1 (oscuro), sin recorte | `<Boton peso="primario">` | `[Norma]` 2.4.7, 2.4.13 | Sí. El botón no se pulsó |

### 5. Nuevo producto ▸ cantidades por talla y color (`MatrizCantidades.tsx`)

Medido en `main` (3070) y en la rama (3110) con el mismo alta (Camisas y Blusas, S · M · L, Blanco · Negro · Rojo), sin guardar: 0 envíos de formulario y 0 escrituras.

| Regla | Medido | ¿Igual que `main`? |
|---|---|---|
| La casilla con el foco | borde 1 px `borde-control` con su hilo; borde contra lo de fuera 3,82:1 (claro) · 13,67:1 (oscuro); `:focus-visible` | Sí, idéntico |
| Nada se mueve al pasar con Enter | 9 casillas, 5 Enter: solo la casilla que gana o pierde el foco se corre 1 px en vertical | Sí: en `main` la casilla con el foco ya está 1 px más arriba que sus vecinas (658,7 contra 659,7). Enter solo lo hace ver más seguido (L1b) |

## Hallazgos

**Graves: 0.**

**Medias**

- **M1 · «contadas» salta mientras se teclea un número de 3 o 4 cifras.** Medido a 1440 claro y oscuro: al pasar a la tercera cifra la letra baja de 54 a 46 px y
  «contadas» sube 4,5 px; a la cuarta, de 46 a 36 y sube 6 px más; al reemplazar un número de 4 cifras, la primera tecla lo devuelve a 54 px y «contadas» baja 10,5 px.
  − y + no se mueven. Al abrir no salta (lo que el cambio prometía), pero el alto de la línea sigue al tamaño de la letra. Dónde: `recepcion-viva.css:61` (`height: 1.15em`)
  con `:139–140` (el tamaño por cifras), que ahora también alcanzan al número abierto. Arreglo probable: un alto fijo para la línea del número en la placa (el de 54 px, 62 px)
  y la cifra centrada adentro. Nivel: regla del repo (el comentario de `.rc-dial-vivo` y ADR-0185, sin prueba). A quién va: `/espacio` · `/movimiento`.
- **M2 · El número abierto no lleva anillo de foco para quien no pidió más contraste.** Su foco es el cursor (16,3:1) y, si la cifra ya estaba contada, la selección
  (1,39:1 en claro y 1,61:1 en oscuro: medido y coincide con el comentario de `recepcion-viva.css:84`). Con la cifra seleccionada Chrome no dibuja el cursor: lo único que
  marca el foco es ese sombreado. El medidor de color lo marca como control sin borde (1.4.11) y sin anillo (2.4.13 AAA no pasa). Existe un indicador, así que no rompe 2.4.7 AA.
  **Decidido a propósito** (Felipe eligió la demo mirando el 2026-11-14; lo vigila `lib/recepcion-dial-foco.test.ts`). Va como propuesta, no como arreglo: `propuestas.md`.
- **M3 · El anillo del enlace del pie queda cortado abajo y pegado a los dos puntos.** «Cartera Mía» y «Casaca Ximena» con el foco: el anillo (2 px, separación 2 px)
  pisa «contar:» / «tallas:» (−0,3 y −0,2 px) y pierde el lado de abajo entero, porque `.rc-pie-sigue` mide 24 px con `overflow: hidden` (`recibir-mesa.css:324`) y el
  anillo baja 4,3 px más. Igual en claro, oscuro, 1280 y 1440. Es el lugar donde Enter deja el cursor tras el último modelo, así que se ve justo cuando más se usa el teclado.
  Arreglo probable: `overflow: clip` con `overflow-clip-margin` de 4 px (la elipsis sigue) o relleno vertical en la línea, y 6 px a la izquierda del enlace
  (`PlacaDelModelo.tsx:403` y `:410`). Nivel: `[Norma]` 2.4.13 (AAA) y la regla del anillo (ADR-0351). A quién va: `/color` · `/espacio`.

**Leves**

- **L1 · Al abrir un número de 4 cifras se va la coma.** Cerrado dice «1,234» (Odómetro, `toLocaleString`); abierto, «1234»: las cifras se corren 5 px y el número
  queda 10 px más angosto y 4 px más bajo. Con 1 a 3 cifras no pasa. `Dial.tsx:106` (`String(contadas)`).
- **L1b · La casilla con el foco de Nuevo producto sube 1 px.** Es de antes (en `main` igual); con Enter se nota a cada paso. Pieza `PasoCantidad` («fila»).
- **L2 · Con «más contraste», los lados del anillo del número caen sobre el aro.** El anillo (120 × 57 px) llega al borde interior del aro: 4 px por fuera de su lado izquierdo
  ya está el aro, y en oscuro ese lado se confunde con él (1,4:1 contra lo que tiene al lado); arriba y abajo se ve entero. `recepcion-viva.css:87`: una separación negativa o un ancho a la medida de las cifras.
- **L3 · El nombre del enlace del pie va en 13,5 px dentro de una frase de 14 px.** Es el tamaño de `btn-cayla`; en una frase debería heredar el de la frase.
- **L4 · El enlace del pie mide 20,3 px de alto.** Pasa 2.5.8 por la separación, pero la línea tiene 24 px: podría medir 24 como los enlaces de arriba de la placa
  (`.rc-placa-acciones .btn-cayla { min-height: 24px }`).
- **L4b · A 1280 las cuatro píldoras quedan 2-1-1.** Dos filas con una sola píldora cada una; a 1440, 2-2. No rompe nada; «Faltan tallas» queda al lado de «Por contar».
- **L5 · «por contar / contadas» en 13 px.** Es de antes (`recepcion-viva.css:134`, no lo tocó esta rama): queda anotado, no se cuenta como de este cambio.

## Revisar descartado

- `textos` · `tituloDeTitulo` en «Quitar Pantalón Mía» y los demás: son nombres propios (lo mismo que en `main`).
- `tipografia` · «Admin · queda a tu nombre» en 13 px y las teclas «Ctrl K» en 10 px: del chip del responsable y del marco, no de este cambio.
- `movimiento` · 15 animaciones al entrar a la pantalla (el trayecto, el aro que se llena): de antes y en la lista de ADR-0136; ninguna al abrir el número.
- `espacio` · «adentro 19,1 px > afuera 13 px» en la cabecera de la placa: de antes.

## Sin medir

- 375 × 812: Recibir es de escritorio y el número no se abre solo con el dedo, a propósito.
- La pista para el dedo («Escribe la cantidad y toca fuera.»): sale con `pointer: coarse`, que el navegador sin ventana no emula en escritorio.
- Lector de pantalla: no se escuchó; se leyó el `aria-label` («Cuántas <modelo> llegaron») y el `aria-live` de «contadas».
