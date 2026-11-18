# Los once estados de una pieza interactiva

Toda pieza que se toca (botón, campo, combo, casilla, píldora, fila que se abre, tramo de un gráfico) se diseña y se audita en estos once estados.
Cada uno trae **qué exige**, **cómo lo cumple hoy el repo**, **el nivel y la fuente**, y **cómo se mide**. Si un estado no aplica, la ficha lo dice
con su motivo, por ejemplo «read-only: no aplica, un botón no guarda un dato».

Niveles: `[Evidencia]` estudio o experimento · `[Norma]` WCAG, especificación o guía oficial · `[Práctica]` sistema de diseño, NN/g, design engineers ·
**regla del repo** lo decidió Felipe (ADR). Las fuentes, comentadas, en `fuentes.md`. `medir.js` es el de esta carpeta.

---

## 1. default (en reposo)

- **Exige:** letra ≥ 4.5:1 sobre su fondo real (≥ 3:1 si es texto grande); borde o contorno de lo que se toca ≥ 3:1 contra lo de alrededor; nombre
  accesible (lo que se oye es lo que se ve).
- **En el repo:** `--color-borde-control` para todo lo que se toca; `sand` es solo línea decorativa (ADR-0169 act.). Sobre el vidrio, cada botón
  se mide en el peor tramo del degradado y en los dos temas (`lib/vidrio-contraste.test.ts`, `BOTONES`).
- **Nivel:** `[Norma]` WCAG 1.4.3, 1.4.11, 4.1.2.
- **Cómo se mide:** `pnpm --filter web test -- tema-tokens vidrio-contraste`; en vivo, `.claude/skills/color/referencia/medir.js`.

## 2. hover (el mouse encima)

- **Exige:** va **solo dentro de `@media (hover: hover)`**, porque en un teléfono el `:hover` se queda pegado después de un toque. Nunca es el único
  camino a una información: lo que asoma con el mouse también asoma con el foco o con un toque (`/formidable`, ley 6). El cambio es leve: Material 3
  usa una capa del 8 % del color del contenido.
- **En el repo:** todos los `btn-*` y `pildora-cayla` lo hacen (`app/globals.css`, `app/estilos/vidrio/campos-y-botones.css`); el `hover:` de
  Tailwind v4 ya va envuelto. Lo vigila `lib/hover-con-mouse.test.ts`; una regla que debe responder al toque lleva antes
  `/* hover-tactil: <motivo> */` (hoy lo tienen `.parecidas-punto` y `.barra-t`, ADR-0479). El botón negro pasa a **rojo profundo**, nunca al rojo de
  marca ni a un gris (ADR-0358).
- **Nivel:** `[Norma]` Media Queries Level 4, característica `hover`; WCAG 1.4.13 (contenido que aparece con el puntero o el foco) · `[Práctica]` M3
  `state-layer-opacity` hover 0.08.
- **Cómo se mide:** `medir.js` → `hover` (cuenta las reglas sueltas en vivo); `pnpm --filter web test -- hover-con-mouse`.

## 3. focus-visible (el foco del teclado)

- **Exige:** el indicador **existe siempre** que el control tiene el foco del teclado (AA). Para el nivel alto: su área es al menos la de un perímetro de
  2 px del control, y entre los píxeles con foco y sin foco hay ≥ 3:1 (AAA). No queda **tapado entero** por algo que flota (AA). Solo con
  `:focus-visible`: el clic con el mouse no lo enciende.
- **En el repo:** un anillo único (ADR-0351), `:focus-visible { outline: var(--foco-ancho) solid var(--foco-color); outline-offset: var(--foco-separacion) }`
  en `app/globals.css` (`@layer base`): tinta, 2 px y 2 px de separación. Tinta sobre crema da 15,4:1 (dato del comentario del archivo). Los campos
  y combos no llevan anillo: llevan borde de tinta plena y un halo (ADR-0351 act. 2026-11-05). No hay un `scroll-padding-top` global para la cabecera
  fija (ver propuesta 5).
- **Nivel:** `[Norma]` WCAG 2.4.7 (AA), 2.4.13 (AAA), 2.4.11 (AA, ver «No verificado» en `fuentes.md`).
- **Cómo se mide:** `medir.js` con `window.__milimetro = { foco: true }` → `foco.sinAnillo`, `foco.anilloFlojo`, `foco.focoTapado`. El halo de los campos
  se mira a ojo (`foco.haloRevisarAOjo` dice cuántos son). En vivo, recorrido con Tab de punta a punta, en claro y en oscuro.

## 4. active (al presionar)

- **Exige:** una respuesta visible **en unos 100 ms**: la mano tiene que sentir que lo presionó. Sirve tanto con el mouse como con el dedo (no va dentro de
  `(hover: hover)`).
- **En el repo:** `:active` de `.mov-boton` / `btn-cayla`: `scale: 0.97`, `translate: 0 0`, `--shadow-sm`, con `scale` en `--t-resp` (100 ms) y
  `--ease-cayla`; la onda nace donde tocaste (`<OndaBotones>`, en `--t-hoja`). El enlace pasa a `--color-rojo` (`.btn-enlace:active`).
- **Nivel:** `[Práctica]` M3 pressed 0.10; el límite de 0,1 s para que algo se sienta instantáneo (Nielsen, de la práctica).
- **Cómo se mide:** en vivo con `javascript_tool`: `getComputedStyle(el).transitionDuration` debe incluir `0.1s` para `scale`; el resto lo mide
  `.claude/skills/movimiento/referencia/medir.js`.

## 5. selected (elegido, puesto, la página actual)

- **Exige:** se **anuncia** (`aria-pressed`, `aria-selected`, `aria-checked`, `aria-current`) **y se ve**, y no solo por el color: un ✓, un peso, un relleno
  que cambia la forma o un subrayado.
- **En el repo:** la píldora puesta es el ahumado denso con su ✓ (`.pildora-cayla[aria-pressed="true"]`, `vidrio/campos-y-botones.css`); `<Pestanas>`, la
  píldora oscura; la fila marcada de una tabla, `aria-current` con el hilo rojo de canto (`.fila-cayla`); `<Paginas>`, la píldora de tinta.
- **Nivel:** `[Norma]` WCAG 1.4.1 (uso del color), 4.1.2 (nombre, función, valor).
- **Cómo se mide:** `medir.js` → `seleccion` (compara la elegida con una hermana: si no cambia nada visible, falla; si solo cambia el color, revisar).

## 6. disabled (no se puede usar ahora)

- **Exige:** **el botón que confirma no se apaga por lo que falta.** Al tocarlo (o con Enter en un campo), cada campo pendiente dice su error bajo él y el
  cursor va al primero. Un control apagado no dice qué falta, muchas veces no recibe el foco (el lector de pantalla no lo alcanza) y WCAG lo exime del
  contraste, así que con baja visión no se lee. Solo se apaga lo que **no se arregla llenando un campo** (mientras guarda, sin permiso, sin conexión),
  y entonces el motivo se ve al lado o se oye (`aria-disabled` + texto), sin depender de un `title`, que no llega al celular.
- **En el repo:** `<Boton confirma={guia}>` (`components/ui/campos.tsx`; lo vigila `lib/boton-confirma.test.ts`); `disabled={enviando}`; apagado y
  alcanzable con su motivo: `MenuAcciones` (`aria-disabled` + motivo) y `PasoCantidad` («se ve apagado pero se puede tocar»). Cara de apagado:
  `.btn-cayla:disabled { opacity: 0.5; cursor: not-allowed }` (`app/globals.css`); `LapizEditar`, 0,45.
- **Nivel:** regla del repo (ADR-0611 mejora 4; CLAUDE.md «Guía de foco», punto 6) · `[Práctica]` Axess Lab «Disabled buttons suck» · `[Norma]` WCAG
  1.4.3 exime a los componentes inactivos (la exención no garantiza que se lean).
- **Cómo se mide:** `medir.js` → `apagados` (botones `disabled` de un pie o un formulario sin motivo a la vista); `pnpm --filter web test -- boton-confirma`.

## 7. loading (está trabajando)

- **Exige:** dice **qué hace** («Guardando…», «Anulando…»), **no cambia de ancho** (nada se corre), **no se puede pulsar dos veces**, se anuncia
  (`aria-busy`) y su señal **sigue moviéndose con las animaciones apagadas** (si no, parece colgado). Un indicador a la vista de una espera corta es
  un destello molesto: lo que busca solo muestra «Buscando…» si la espera pasa de 350 ms. Nada optimista en dinero, stock ni comprobantes.
- **En el repo:** `<Boton cargando textoCargando>`: `PalabraEnEspera` (las dos palabras en la misma celda del grid), `HiloEnEspera` con `data-senal`
  (2 px, `cayla-hilo-barrido` 1,1 s lineal), `disabled` y `aria-busy`. El loader único (`<EsperaGlobal />`, ADR-0149) se suma solo. `<Buscador buscando>`
  con su umbral de 350 ms.
- **Nivel:** regla del repo (ADR-0358 `accion.guardar`, ADR-0149, ADR-0625) · `[Norma]` WCAG 2.2.2 (lo que se mueve solo más de 5 s se puede pausar,
  salvo que sea esencial: un indicador de carga lo es) · `[Práctica]` NN/g (nada bajo 1 s; esqueleto o indicador de 1 a 10 s).
- **Cómo se mide:** `medir.js` → `cargando` (ocupado que se puede pulsar; «…ndo…» escrito a mano sin `aria-busy`). El doble clic de verdad lo prueba `/chaos`.

## 8. error (algo está mal)

- **Exige:** junto a **su origen** (bajo el campo; el de toda la hoja, sobre los botones), con **ícono y texto** (nunca solo rojo), **ligado al control**
  (`aria-invalid` + `aria-describedby`), **al salir del campo** y no a la primera letra (mientras se escribe, solo para borrar un error que ya salió),
  y **conservando lo escrito**. El texto dice qué pasó y cómo se arregla, sin culpar (lo escribe `/textos`). Un error que bloquea no va en un aviso que
  se va solo.
- **En el repo:** `<Campo tono="error" pie>` (pone `aria-invalid` y `aria-describedby`, `components/ui/campos.tsx`), `useValidarAlSalir`
  (`components/ui/useValidarAlSalir.ts`), `guia.marcarError(campo, mensaje)` para el error que devuelve el guardado, `<Aviso tono="error">` (`role=alert`)
  para el de toda la hoja. Los avisos de esquina con `tono: "error"` duran 8 s (`lib/avisos-reglas.ts`; ver propuesta 2).
- **Nivel:** `[Evidencia]` Wroblewski 2009 (validar al salir del campo: +22 % de éxito, −42 % de tiempo; n = 22, indicativa) · `[Práctica]` NN/g,
  pautas de mensajes de error · `[Norma]` WCAG 1.4.1, 3.3.1 (ver «No verificado»).
- **Cómo se mide:** `medir.js` → `errores` (con `aria-invalid` y sin mensaje visible ligado). Para el momento, en vivo: escribe una letra mala y mira que
  no salga nada hasta pulsar Tab.

## 9. read-only (se ve, no se cambia)

- **Exige:** se alcanza con Tab, se lee con **contraste completo** y **no tiene cara de apagado**: el dato está para consultarlo o copiarlo.
- **En el repo:** **no hay una cara común**: 12 usos de `readOnly` en `components/` (`grep -rn "readOnly" apps/web/components --include=*.tsx`), cada uno
  con la caja del campo de siempre. Ver propuesta 4.
- **Nivel:** `[Práctica]` (inferido de los argumentos de contraste y foco de Axess Lab; Carbon y Primer no se leyeron).
- **Cómo se mide:** `medir.js` → `soloLectura`.

## 10. vacío (sin valor todavía, o lista sin filas)

- **Exige:** en un campo, **la etiqueta siempre a la vista** (el placeholder se va al escribir, se confunde con un valor ya puesto y tiene poco contraste);
  **obligatorio y opcional marcados los dos**; el ejemplo dice «Ej. …» y sigue lo elegido (`/sugerir`). En una lista o tabla sin filas, qué falta y qué
  hacer, con el botón que lo hace.
- **En el repo:** `campo-etiqueta` con `*` si es obligatorio y «· opcional» tenue (familia `etiqueta-campo`); `<Vacio icono titulo acciones>`
  (familia `vacio`), `tamano="chico"` dentro de una tabla o una hoja.
- **Nivel:** `[Evidencia]` Baymard 2021 (benchmark: marcar ambos) · `[Práctica]` NN/g (el placeholder no es etiqueta).
- **Cómo se mide:** `medir.js` → `etiquetas` (campos sin etiqueta, con su placeholder); el ejemplo, `pnpm sugerir`.

## 11. quieto (sin movimiento)

- **Exige:** con las animaciones apagadas la pieza **sigue respondiendo**: el desplazamiento se cambia por color u opacidad, con la misma duración (no se
  apaga la respuesta, se sustituye). Solo siguen moviéndose las señales de espera. Una pantalla nueva se revisa también quieta.
- **En el repo:** el ERP **arranca quieto**: `html[data-movimiento="quieto"]` sin nada guardado (ADR-0625, `app/estilos/movimiento.css` deja todo en 0,01 ms);
  el sistema que pide menos movimiento gana siempre (`prefers-reduced-motion`). Las señales llevan `data-senal` o están en la lista de `movimiento.css`.
  Lo que anima desde JavaScript pregunta `prefiereQuieto()` / `useQuieto()` (`lib/movimiento-cliente.ts`; lo vigila `lib/movimiento-reglas.test.ts`).
  En los botones, con movimiento reducido se quitan `translate`, `scale`, la luz y la onda, y queda el cambio de color (`app/globals.css`, bloque de
  `prefers-reduced-motion`).
- **Nivel:** `[Norma]` WCAG 2.3.3 (AAA: el movimiento que dispara una interacción se puede apagar; un cambio de color u opacidad no cuenta como
  movimiento) · `[Práctica]` Val Head (reducir es sustituir, no apagar).
- **Cómo se mide:** `medir.js` con `data-movimiento="quieto"` → `quieto.bucleSinSenal`; el detalle, `.claude/skills/movimiento/referencia/medir.js`.

---

## Componentes con estado propio (lo que agregan sobre los once)

| Pieza | Lo que agrega | En el repo | Nivel · fuente |
|---|---|---|---|
| Hoja (diálogo) | atrapa el foco; Esc cierra y el foco vuelve a quien la abrió; título que se anuncia (aunque esté oculto); Space o Enter desde quien la abre | `<Modal>` sobre Radix Dialog; Esc libre con `useEscapeLibre`; «atrás» cierra la de arriba (ADR-0528) | `[Norma]` patrón WAI-ARIA Dialog, que Radix declara seguir |
| Aviso de esquina (toast) | dos líneas como máximo; siempre se puede cerrar; el que tiene una acción no se va solo y esa acción existe en otro lugar; el error que bloquea no va aquí | `avisar.*` (`components/ui/Avisos.tsx`, `lib/avisos-reglas.ts`): éxito 4 s, aviso 6 s, error 8 s, con acción ≥ 7 s; `role="status"` o `alert`, `aria-live="polite"` | `[Práctica]` Carbon (ver propuestas 1 y 2) |
| Campo | validar al salir; obligatorio y opcional; la etiqueta afuera | `<Campo>`, `useValidarAlSalir`, la guía de foco | `[Evidencia]` Wroblewski, Baymard · `[Práctica]` NN/g |
