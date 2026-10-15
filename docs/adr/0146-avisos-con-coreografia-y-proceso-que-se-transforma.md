# ADR-0146 — Avisos (toasts) con coreografía: el aviso dice qué pasó, y el proceso se transforma

- **Fecha:** 2026-09-21
- **Estado:** Aceptado (Felipe, 2026-09-21: aprobó el spike —«Bien me gusta»—, pidió efectos —«en el check de éxito que se
  dibuje en el momento»— y luego «hagamos esos cambios»). Felipe no eligió piel ni intensidad de forma explícita: se
  tomó la recomendación (Ficha + Expresivo) y se dejó fuera lo que chocaba con una regla vigente (ver abajo). Implementado en `components/ui/Avisos.tsx` + `app/estilos/avisos.css`.
- **Decide:** Felipe. Arquitectura: este documento.
- **Diseño de referencia:** `docs/maquetas/avisos-spike-2026-09/avisos-spike.html` (Hoy vs. dos pieles) y
  `avisos-spike-v2-efectos.html` (coreografía; incluye el modo «Lento ×3» para juzgar cada efecto).
- **Toca** la regla de movimiento (ADR-0136 la fija para modales; este ADR aplica la misma regla a los avisos).
  No la cambia. **No toca el modelo de datos ni ninguna migración.**

## Contexto — el problema

El aviso de `Avisos.tsx` (decisión del 2026-09-14: una sola voz, arriba a la derecha) funcionaba pero se leía mal:

1. El tono lo llevaba **una barra de 3 px**: verde y rojo solos no le sirven a quien no los distingue.
2. El texto era una sola línea: «Confecciones del Sur EIRL actualizado» mezcla el nombre con lo que pasó.
3. Había **dos relojes** (barra izquierda + barra inferior que se encoge), sin que ninguno explicara qué era.
4. Un proceso que terminaba **desaparecía y aparecía otro aviso**: parpadeo.
5. Sin tope: cuatro errores seguidos tapaban la pantalla.

## Decisión

**Piel A · «Ficha»**, en la misma esquina (superior derecha), con **efectos expresivos**:

- **Icono con forma propia por tono** (✓ · ! · ⚠) dentro de un disco tintado: el tono ya no depende solo del color.
- **El anillo alrededor del icono es el único reloj** (se vacía; el mouse o el foco lo pausan). Se acabaron las barras.
- **Título = qué pasó; `detalle` = sobre qué.** `avisar.exito("Proveedor actualizado", { detalle: nombre })`.
  El campo `detalle` ya existía: los 344 llamados actuales siguen funcionando sin cambios.
- **Coreografía del éxito** (ms desde que entra): tarjeta entra 0 → disco se llena 60 → anillo se dibuja 60 (460) →
  título se revela 200 → detalle 255 (cascada de 55 ms, la del ADR-0136) → check se traza 260 (360) → una onda 520 →
  arranca la cuenta atrás 520. El reloj espera a que el efecto termine para no competir con él.
- **El proceso se transforma.** `avisar.proceso()` devuelve una función que se sigue llamando para cerrar (compatible
  con todo el código actual) y ahora también trae `.progreso(0..1)`, `.exito()` y `.error()`. El anillo se llena con
  el **avance real**; si llegó al 100 % la misma tarjeta pasa a éxito **sin redibujar el anillo** (`data-continua`).
  Sin cifra, el anillo gira: es la única animación en bucle, y es la señal «estoy trabajando».
- **Tope de 4 avisos** y «Cerrar todos» desde 3. El descarte quita el más viejo que no sea un **error** (un error sin
  leer no se descarta solo) ni un **proceso** en marcha.
- **Salida en dos tiempos**: se desvanece y luego colapsa su altura, así los de abajo suben sin salto.

Reglas heredadas del ADR-0136: `--ease-cayla`, sin rebote, nada decorativo (cada efecto responde a algo que pasó),
todo se apaga con `prefers-reduced-motion` — con una excepción deliberada: **la cuenta atrás se conserva**, porque
es función (cuándo se va el aviso), no adorno.

## Lo que se decidió NO hacer

- **Sin «gesto» de error** (sacudida lateral de 3 px del spike): el ADR-0136 dice «sin rebote» y no se quiso abrir la
  excepción. Si Felipe lo pide, es un keyframe de 5 líneas.
- **Sin piel «Tinta»** (abajo al centro, fondo oscuro): cambia la decisión de la esquina superior derecha y añadía
  tres colores fuera de `globals.css`.
- **Sin «cifra que cuenta»** en los avisos de dinero: necesita decidir por llamada qué cifra cuenta y con qué formato.
  Queda como extensión natural (`detalle` con un componente), no se inventó una API a ciegas.
- **Sin morfar «Deshacer»**: hoy, al pulsarlo, el aviso se cierra y la acción inversa publica su propio éxito
  («X reactivado»). Ya es correcto; el spike lo transformaba en un estado «Deshecho» que no tenía dónde vivir.

## Cómo se verifica

`docs/maquetas/avisos-spike-2026-09/` para ver cada efecto; en la app, cualquier «Guardar» de un proveedor
(«Proveedor actualizado» + nombre) o dejar un campo vacío (error).

**Pendiente (a propósito):** ninguna pantalla usa todavía `fin.exito()` / `fin.progreso()`. Los 7 sitios que abren un
`avisar.proceso` (adjuntos, pago juntos, recibir envío, producto, SUNAT ×2, compra) siguen cerrando el proceso y
publicando un aviso aparte; migrarlos es un cambio por pantalla (cada uno tiene su propio `finally`) y se hace uno a
uno, empezando por `AdjuntosCompra` (el único con un avance natural: N archivos).

## Lección técnica (por qué este ADR menciona un círculo)

En Chrome el trazo discontinuo **no se escala con `pathLength` en un `<circle>`** (sí en un `<path>`): con
`stroke-dasharray: 1` el anillo salía punteado y parecía lleno. El anillo usa la circunferencia real
(2π·17 = 106.81, `--aviso-anillo`); los trazos del glifo, que son `<path>`, usan `pathLength="1"`.

## Actualización 2026-10-14 — un clic en un aviso no cierra la hoja; lo que ya se vio no vuelve; 7 s con botón

**Problema (lo confirmó y reprodujo el agente escéptico de una pasada Formidable sobre Producción, 2026-10-14).**
1. **Con un cajón o una hoja de Radix abierta, cualquier clic en un aviso cerraba la hoja y el «Deshacer» no llegaba.** Un
   `Dialog.Root` modal pone `body { pointer-events: none }` y escucha `pointerdown` en el documento: todo lo que no está dentro
   de su capa es «clic afuera». La pila de avisos vive en `app/layout.tsx`, fuera de cualquier hoja, así que el `pointerdown`
   sobre «Deshacer» cerraba el cajón de la orden (`OrdenPanel`) y el Deshacer no corría. Pasaba con TODO «Deshacer» lanzado desde
   un cajón o una hoja, no solo en Producción.
2. **Un aviso viejo resucitaba con reloj nuevo en cada guardado.** Con una petición en curso, `Avisos.tsx` desmontaba las tarjetas y
   al liberarse la pantalla las montaba de nuevo con el reloj desde cero (el costo asumido de la actualización 2026-09-21 del
   ADR-0149). Tras «Traer de vuelta» + «Enviar a maquila» había DOS «Deshacer» a la vista y el primero volvía a aplicar una etapa
   vieja. Y el Deshacer de Producción duraba los 4 s de un éxito cualquiera: `avisar.exito` decía desde septiembre que «un Deshacer
   de 4 s es una trampa», pero cada pantalla tenía que acordarse de pasar `duracion` (seis lo hacían; Producción no).

**Decisión.**
- **La pila de avisos es una rama de toda capa de Radix** (`DismissableLayer.Branch`, importada de `radix-ui/internal`, que es la
  misma copia que usa `@radix-ui/react-dialog`): para Radix, un clic ahí está DENTRO de la hoja abierta, hoy y en toda hoja que se
  construya, sin tocar ninguna de las nueve (Producción incluida: su rediseño, ADR-0400, corre en otra rama). Lo vigila
  `lib/hojas-avisos.test.ts`: que `Avisos.tsx` envuelva la pila en la rama y que `radix-ui/internal` y `@radix-ui/react-dialog`
  resuelvan al MISMO archivo de `react-dismissable-layer` (dos copias serían dos contextos y la rama de una no la vería la otra).
  **Considerado y descartado:** (a) `onInteractOutside` en cada `<Dialog.Content>`, como `useEscapeLibre`: son nueve archivos, uno
  de Producción, y cada hoja nueva tendría que acordarse; `useEscapeLibre` sí tiene que ser por hoja porque el Escape es una captura
  del documento sin noción de rama. (b) `stopPropagation()` del `pointerdown` en la pila: esconde el evento a todos, también a los
  combos y menús que cierran su lista al tocar afuera.
- **Lo que ya se vio no vuelve** (`lib/avisos-reglas.ts`, `retirarLoVisto`): en el instante en que la pantalla se ocupa (otra carga o
  guardado, ADR-0149), los avisos cuyo reloj ya empezó a correr a la vista se retiran; los que no, siguen esperando; un proceso nunca
  se retira. «Visto» = el `animationstart` del anillo, 520 ms después de la entrada, pasado el efecto: una sola fuente de tiempo para
  el cierre y para esto. Medido en el navegador: tras un guardado, el aviso se monta 1 ms, el `router.refresh()` que sigue lo esconde y
  vuelve 0,84 s después; como no llegó a los 520 ms, no cuenta como visto y vuelve entero (si «visto» fuera «montado», ese aviso se
  perdería). Se hace en el oyente de `suscribirEspera`, no en un efecto: un efecto corre después del render que ya mostraría la
  tarjeta vieja un instante.
- **Un aviso con botón dura 7 s como mínimo** (`DURACION_CON_ACCION`, `duracionDe`), contados desde que se ve (el reloj arranca al
  montarse a la vista, no al pedirse). Quien pasa `duracion` decide, más larga o más corta; un error con acción conserva sus 8 s.

**Lo que queda, a propósito.** La ventana de menos de 520 ms entre que un aviso aparece y la persona dispara otro guardado: ese aviso
no cuenta como visto y vuelve con su Deshacer, que para entonces podría ser viejo. Con el loader de por medio (`inert`) es físicamente
improbable, y se prefirió no sumarle a `espera-estado` un contador de guardados para cerrarla; si alguna vez se ve, es ese contador.

**Cómo se verifica.** `pnpm --filter web test` (`lib/avisos-reglas.test.ts`: duración por tono, mínimo con acción, la pila al ocuparse y
la regresión «Traer de vuelta + Enviar a maquila»; `lib/hojas-avisos.test.ts`: la rama y la copia única). En el navegador (2026-10-14,
cajón de «Zz Prueba Blusa Marina» en el Taller local, con un observador sobre la pila): (A) «Enviar a maquila» → aviso con Deshacer; clic
en el centro geométrico del botón → `pointerdown` y `click` cayeron en `button.aviso-acc`, el cajón siguió abierto y Corte volvió a
pendiente. (B) «Enviar a maquila», 2,5 s, «Traer de vuelta» → el primer aviso se retiró al ocuparse la pantalla (1,5 s visible) y no
volvió; un solo «Deshacer» a la vista. (C) El aviso con Deshacer vivió 7,8 s desde que se vio (520 ms de coreografía + 7 s + 260 ms de
salida); antes, 4,5 s. La orden de prueba quedó como estaba (su historial de etapas termina en `pendiente`).
