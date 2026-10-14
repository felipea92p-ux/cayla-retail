# ADR-0411 · Tras un guardado sin respuesta, la pantalla se vuelve a leer sola

- **Fecha:** 2026-10-14 · **Estado:** propuesto, esperando el OK de Felipe. Verificado en local en la rama `claude/magical-herschel-3d3003`.
  Solo web: sin migración, sin RPC, sin reglas de negocio.
- **Pedido:** lo que dejó abierto ADR-0410 («La lista de atrás no se refresca tras el corte… va como trabajo aparte»).
- **Extiende:** ADR-0410 (la frase honesta), ADR-0149 (el loader y su interceptor de `fetch`). **Sigue el patrón de** `<PreciosEnVivo />`
  (2026-10-08: `router.refresh()` silencioso que conserva lo de la pantalla).

## El problema

Desde ADR-0410, cuando la conexión se corta mientras se guarda, la pantalla dice: «no podemos confirmar si llegó a guardarse. Antes de
volver a intentarlo, revisa si ya aparece registrado». Pero lo que se revisa es la foto de cuando se abrió la pantalla: nadie la vuelve a
leer. El 2026-10-14, en Producción ▸ Insumos ▸ Ingresar insumo, el lote ya estaba en la base y la lista seguía en «0 lotes». La
colaboradora «revisa», no lo ve, cierra la hoja, la abre otra vez (con una marca nueva: ADR-0409 solo protege el reintento desde la
misma hoja) y el lote entra dos veces.

Arreglarlo pantalla por pantalla no alcanza: hay ~250 llamadas a `traducirError` y ~44 escrituras que deciden el corte antes del
traductor (ADR-0410, «Inventario»). La pantalla 251 lo olvidaría.

## La decisión

**Se resuelve una vez, donde pasa todo: en la petición.**

1. **El interceptor de `fetch` del loader anota el guardado sin respuesta** (`components/ui/Espera.tsx`). Ya sabe qué petición es un
   guardado (`clasificarPeticion` → `'guardado'`: una RPC que no es de lectura, un `insert`/`update`/`delete`, Storage, un POST a `/api/*`,
   una server action). Si esa petición termina sin respuesta (la promesa de `fetch` falla: `Failed to fetch`, `NetworkError`, `aborted`),
   anota la ruta en `lib/refresco-tras-corte.ts`. Es una línea, y cubre a la vez las escrituras que pasan por `traducirError` y las que no.
2. **`<RefrescoTrasCorte />` rehace la pantalla** (montado una vez en `app/(app)/layout.tsx`, junto a `<PreciosEnVivo />`): un
   `router.refresh()` anunciado con `navegacionSinEspera`, así que no abre el loader ni deja la pantalla `inert`. Los Server Components
   vuelven a leer; la hoja abierta, lo escrito y su marca (`useRef`) se conservan. Una pantalla nueva no tiene que hacer nada.
3. **La regla de cuándo refrescar es pura y tiene su prueba** (`decidirRefresco`, `lib/refresco-tras-corte.test.ts`):
   - **Nunca sin red.** Si la lectura de Next falla, Next no se rinde: pide la página entera (`fetch-server-response.js`, «Falling back to
     browser navigation»), y sin red eso es la página «Sin conexión» del service worker: la hoja y lo escrito se pierden. Antes de refrescar
     se le pregunta a la base (`sondearLaBase`, `/auth/v1/health`, la misma sonda del aviso «Sin conexión», que se mudó a
     `lib/sondear-la-base.ts`). Si no responde, se espera al evento `online` y se vuelve a preguntar a los 5, 10, 20 y 40 s y después cada
     minuto (`msHastaOtroSondeo`). **Un refresco por anotación, nunca en bucle**; con la pestaña oculta no se pregunta nada.
   - **Nunca bajo quien teclea.** Si hubo una tecla hace menos de 1,5 s (`MS_TECLEO`), se espera a la pausa. No se espera a que salga del
     campo, como `<PreciosEnVivo />`: aquí el refresco es lo que le deja ver si ya se guardó, y quien envió con Enter sigue con el foco en el
     campo (y una hoja que se cierra no siempre dispara `focusout`).
   - **Nunca en una pantalla con cola propia.** Vender, Recibir y Nuevo producto (`PANTALLAS_SIN_CONEXION`, ADR-0210) guardan sin conexión y
     reintentan con la misma marca: lo que pasa con su escritura lo cuenta su cola, y pueden estar mostrando la copia del service worker. Se
     usa la misma lista que el service worker, no una nueva. Las demás pantallas de Ventas (Apartados, Historial, Comprobantes) **sí** se
     refrescan: el abono de un apartado es dinero y no tiene cola.
   - **Si la persona se fue a otra pantalla, se olvida:** la nueva se leyó al llegar.

### Lo que se descartó

- **Un ayudante junto a `traducirError`.** Es pantalla por pantalla otra vez (cada `catch` tendría que llamarlo), y no ve las ~44 escrituras
  que deciden el corte antes del traductor. `traducirError` es pura y se queda pura.
- **Envolver el `fetch` del cliente de Supabase** (`global.fetch` en `lib/supabase/client.ts`). No ve los POST a `/api/*` ni las server
  actions. Solo vería algo más que el interceptor si alguna capa por encima rechazara por su cuenta (un tope con `Promise.race`); hoy no hay
  ninguna sobre una escritura (las dos capas sobre `fetch` son la del loader y la de «hay red», y ninguna inventa rechazos).
- **Contar un 502/503/504 como «sin respuesta».** Es una respuesta: hay red, pero la base o el camino están mal. Refrescar en ese momento
  arriesga que los Server Components fallen y `error.tsx` reemplace la pantalla con la hoja adentro. El que manda al traductor un error sin
  código sigue diciendo lo de ADR-0410.
- **Las escrituras con `x-espera: no`** (las filas del Conteo, el panel de Existencias, «ya te ofrecí la guía»): no cuentan como guardado para
  el loader y tampoco aquí. Son gestos de una fila con su propio estado, o escrituras de fondo que nadie está mirando.
- **Mirar `navigator.onLine`.** Miente (caja de TRU, 2026-10-10): la respuesta de la base es la evidencia, como en `useEnLinea`.

## Lo que no promete (riesgo que queda)

- **Entre la pregunta y el refresco pasan milisegundos.** Si la red se cae justo ahí, Next pide la página entera. No hay forma de pedirle a
  `router.refresh()` que no lo haga; la ventana es de ~10 ms (medido abajo).
- **La sonda mira la autenticación de Supabase, no la base.** Si Postgres no responde pero GoTrue sí, el refresco puede encontrarse con un
  Server Component que falla. Es raro (los dos viven en el mismo proyecto) y las lecturas del repo ya se degradan sin lanzar (`resultado.ts`).
- **Un componente que copia sus props a su estado en un efecto** perdería lo escrito con cualquier refresco (también con el de precios). El
  lint del repo ya lo marca (`react-hooks/set-state-in-effect`).

## Hallazgo de paso: Chrome repite el POST cuando la conexión se cae sin respuesta

En la verificación, cada clic llegó **tres veces** a la base: Chrome reintenta por su cuenta una petición, aunque sea POST, cuando la conexión
reutilizada se cierra sin haber recibido nada (`ERR_EMPTY_RESPONSE`). Ingresar insumo lleva marca (`p_token`) y la base devolvió el mismo lote
las tres veces: hubo un lote por hoja. **Una escritura sin marca, en ese mismo corte, podría guardarse tres veces con un solo clic.** Se observó
en local, con HTTP/1.1 detrás de un proxy; no está medido con el HTTP/2 de Supabase en producción. No se toca aquí: va al backlog.

## Cómo se verificó

- `pnpm --filter web test` (493 archivos, 159.521 pruebas), `tsc --noEmit`, `eslint` de lo tocado, `pnpm knip` y `pnpm knip:produccion`
  (`pantallaSinConexion` sale de la deuda: ahora la usa una pieza que llega a la tienda), en verde.
- **Navegador local, con un corte de verdad.** El parche de `window.fetch` desde la consola, que usó ADR-0410, queda POR ENCIMA del
  interceptor del loader y este nunca lo vería; un corte real nace abajo, en la red. Se puso un proxy TCP entre el navegador y la base local
  (`NEXT_PUBLIC_SUPABASE_URL` apuntando a él): deja pasar la petición a `recibir_insumo`, espera la respuesta de la base y corta la conexión.
  La pantalla recibe el mismo `TypeError: Failed to fetch`. Producción ▸ Insumos ▸ Ingresar insumo, sede Taller:
  1. **Corte con la red bien:** la base guardó el lote; 38 ms después del fallo, la sonda; 11 ms después, el refresco (sin loader, sin `inert`).
     La hoja siguió abierta con 10 m, S/ 5,50, «L-CORTE-1» y la nota; detrás, «1 lote · 10 m» y el combo pasó de «hay 0 m» a «hay 10 m».
  2. **Corte con la base sin responder:** sondas a los 0, 5 y 15 s, ningún refresco, la misma página y lo escrito intacto. Al volver la red
     (`online`), sonda y refresco en 12 ms: «hay 14 m».
  3. **Corte mientras se teclea:** fallo a los 674 ms, teclas hasta los 3602 ms, refresco a los 5118 ms (1516 ms después de la última tecla);
     el foco se quedó en el campo.
- La base local se fotografió antes (`scripts/flujo-de-negocio/estado.mjs`) y se restauró después: idéntica a la foto. Solo habían cambiado
  las cuatro tablas de la prueba.
