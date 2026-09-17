# ADR-0076 — Cerrar caja avisa si hay ventas offline sin subir (y bloquea solo con red)

**Fecha:** 2026-09-17
**Estado:** Construido. Verificado con `tsc --noEmit`, `eslint` y toda la suite de tests
de `apps/web` en verde (293/293, incluidos los 19 de `ventas-offline.test.ts`, sin
cambios en esa función). Sin verificación en navegador en esta sesión — a propósito,
queda para el cierre de la tarea sobre el conjunto completo (encargo original).
**Afecta:** `apps/web/components/CerrarCajaModalV2.tsx`,
`apps/web/components/PuntoDeVenta.tsx`, `apps/web/components/CajaAbiertaPanel.tsx`. No
toca `lib/ventas-offline.ts` ni la RPC `retail.cerrar_caja` — ninguna tabla ni función de
servidor cambia.

## El problema

`retail.cerrar_caja` calcula el "esperado" del cajón leyendo solo `venta_pagos`/`ventas`
ya persistidas en el servidor — nunca ve la cola de ventas offline del navegador
(`lib/ventas-offline.ts`, ADR-0036/0063). Si una colaboradora vende en efectivo sin red y
cierra caja antes de que esa venta suba (sigue offline, o cierra justo antes del
reintento de 30s), el cajón físico tiene ese billete pero el sistema no lo cuenta — y
marca un "sobrante" que en realidad es plata real, sin que la persona sepa por qué.
`totalEfectivoEncolado()` ya existía en `lib/ventas-offline.ts` desde el ADR-0063 (con
sus propios 3 tests), anotada como deuda en `docs/BACKLOG.md:1192-1193`: "ya existe pero
nadie la usa todavía en `CerrarCajaModalV2`". Esta pieza la conecta.

## Decisión

DECIDÍ: el aviso vive en la pantalla de formulario de `CerrarCajaModalV2`, ANTES del
campo de conteo — nunca dentro del cálculo del "esperado", que sigue siendo 100% del
servidor (conteo ciego intacto, ADR-0042). Aparece apenas `totalEfectivoEncolado(cola) >
0`, con el mismo tono ámbar y el mismo ícono (`CloudOff`) que ya usa el banner de la cola
en `PuntoDeVentaColaOffline.tsx` — quien colabora en tienda ya aprendió qué significa ese
color ahí, no hace falta un lenguaje visual nuevo.

DECIDÍ: bloquear el submit SOLO cuando `navigator.onLine === true` Y hay efectivo
encolado. Con red, el reintento automático de 30s (`PuntoDeVenta.tsx`) va a subir la
venta sola en breve — tiene más sentido esperar unos segundos que cerrar con un sobrante
fantasma. Sin red, esperar no sirve de nada (nada va a subir hasta que vuelva la
conexión) — se deja cerrar igual, con el aviso puesto, y la pantalla de resultado repite
el monto encolado al lado de "el sistema esperaba" para que la diferencia se explique
sola. El bloqueo se autolimpia: en cuanto la venta sube (el mismo latido de 30s que ya
corría antes de esta pieza), `cola` se vacía, `PuntoDeVenta.tsx` re-renderiza con la prop
actualizada, y el botón se habilita solo — no hizo falta un botón de "reintentar" nuevo.

DESCARTÉ un botón de "cerrar de todas formas" para saltar el bloqueo estando online. El
resto del módulo ya tiene un patrón aprendido para "esto no se puede forzar a mano": un
fallo de red se reintenta solo y en silencio hasta que se resuelve o el servidor lo
rechaza de verdad — recién ahí aparece "Descartar" (ADR-0036, addendum). Sumar un atajo
manual solo para este caso habría sido una segunda forma de saltarse el mismo tipo de
espera, inconsistente con la regla que el resto de la cola offline ya sigue.

DESCARTÉ leer `cola` con un `useEffect`/listener propio dentro de `CerrarCajaModalV2`. La
prop ya llega viva desde quien monta el modal: en Vender es el estado `cola` que el trío
de sincronización mantiene actualizado (ADR-0043 — es el único componente con ese
estado). Sumarle un segundo mecanismo de lectura adentro del modal habría sido una
segunda fuente de verdad para el mismo dato, y es justo lo que le da al bloqueo la
propiedad de autolimpiarse solo.

DESCARTÉ dejar `cola` opcional (`= []`) para no tocar otros call sites. Encontré que
`CerrarCajaModalV2` tiene DOS puntos de montaje, no uno: además de Vender, la pantalla
`/caja` (`CajaAbiertaPanel.tsx`) es una segunda puerta a "Cerrar caja" para la misma
sede — mismo `ubicacionId`, mismo cajón físico, mismo riesgo. Un default silencioso ahí
habría dejado el bug intacto por esa puerta, exactamente el tipo de estado inconsistente
que el principio 2 de este repo pide evitar en el diseño, no parchar después. En vez de
eso, `cola` es prop **obligatoria** (TypeScript no compila si falta) y
`CajaAbiertaPanel.tsx` la resuelve con una lectura de una sola vez de `localStorage`
(`leer(claveLocal(caja.ubicacionId, "cola"), [])`) — no el trío completo de
sincronización, que por ADR-0043 sigue viviendo solo en `PuntoDeVenta.tsx`.

SE ROMPE SI `navigator.onLine` miente. Esa API solo promete "hay una interfaz de red
arriba", no "el servidor de Supabase responde" — una sede con wifi a un router sin
internet real, o con `cayla-dynamic` caído, leería `true` igual. En ese escenario el
bloqueo podría sentirse indefinido mientras el reintento de 30s sigue fallando sin marcar
la venta como rechazada (`rechazo` solo se llena con un rechazo real del servidor, no con
un fallo de red — ver `esFalloDeRed` en `lib/error-escritura.ts`). Es el mismo trade-off
que el resto del módulo ya acepta para los fallos de red silenciosos; si en la práctica
se vuelve un problema real, la salida es un botón "Reintentar ahora" que llame a la misma
función de sincronización desde el modal — no una forma de saltarse el bloqueo sin
reintentar.

SE ROMPE SI `/caja` está abierto en una pestaña mientras Vender sube una venta en OTRA
pestaña del mismo navegador: la lectura de `cola` en `CajaAbiertaPanel.tsx` es de una
sola vez al montar el modal, así que no ve una actualización que ocurra en la otra
pestaña mientras éste sigue abierto (no hay `storage` event listener). Dos pestañas del
mismo puesto abiertas a la vez es un caso ya poco común en este módulo; no se resolvió
para no sumarle un mecanismo nuevo a una pantalla que hoy no corre ninguno.

## Cómo se hace cumplir

- `CerrarCajaModalV2` gana la prop obligatoria `cola: VentaEncolada[]` y calcula
  `efectivoEncolado = totalEfectivoEncolado(cola)` (función pura ya existente, sin
  cambios) y `bloqueaCierre = efectivoEncolado > 0 && navigator.onLine`.
- El aviso ámbar aparece en la pantalla de formulario cuando `efectivoEncolado > 0`; una
  segunda línea explica el bloqueo cuando `bloqueaCierre` es cierto. El botón de submit
  queda `disabled` con `bloqueaCierre`, y `onSubmit` repite la misma condición como
  defensa (un Enter con foco en el campo puede disparar submit incluso con el botón
  deshabilitado, en algunos navegadores — envío implícito de formulario).
- El monto encolado se congela en `resultado.efectivoEncoladoAlCerrar` en el momento del
  cierre (no se vuelve a leer `cola` después de cerrar), para que la pantalla de
  resultado muestre el número que de verdad explica ESA diferencia puntual, no uno que
  siga cambiando mientras la persona todavía la está leyendo.
- `PuntoDeVenta.tsx` pasa su propio estado `cola` (ya vivo, ya hidratado e
  incrementalmente actualizado por el trío de sincronización existente).
  `CajaAbiertaPanel.tsx` gana un `useEffect` de una sola lectura de `localStorage` al
  montar, mismo patrón que ya usa `PuntoDeVenta.tsx` para hidratar `enEspera`.

## Cómo se verificó

`pnpm --filter web test ventas-offline`: 19/19 en verde (sin cambios en
`ventas-offline.ts` — los tests existentes de `totalEfectivoEncolado` siguen probando lo
mismo). Suite completa de `apps/web` (`pnpm --filter web test`): 293/293 en verde.
`tsc --noEmit` y `eslint` sobre los tres archivos tocados, sin errores ni warnings — en
particular, confirmado que ambos puntos de montaje de `CerrarCajaModalV2`
(`PuntoDeVenta.tsx` y `CajaAbiertaPanel.tsx`) siguen compilando con la prop nueva
obligatoria. Sin verificación visual en navegador en esta sesión.
