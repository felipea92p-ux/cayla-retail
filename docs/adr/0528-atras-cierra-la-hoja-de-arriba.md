# ADR-0528 — En el teléfono, «atrás» cierra la hoja de arriba

- **Fecha:** 2026-10-26 · **Estado:** construido y probado en local a 375 px (sin migraciones).
- **Relacionados:** ADR-0136 (movimiento de modales), ADR-0479 (la hoja viva del celular), ADR-0358 (una función, una pieza: `hoja-movil`),
  ADR-0185 (la página no se encoge), y `useSalidaSinGuardar` (2026-09-28, la guardia de «¿Salir sin guardar?»).
- **Antecedente:** el mismo día, solo en la hoja de la prenda de Existencias (`<Modal atrasCierra>`, opt-in). Felipe pidió llevarlo a
  todas las hojas, unificado.

## El problema

En el teléfono, el botón «atrás» y el gesto desde el borde son la forma natural de quitarse una hoja de encima. En el ERP no cerraban la
hoja: llevaban a la pantalla anterior, con la hoja abierta encima o perdiendo lo que se estaba haciendo. Una colaboradora en Vender, con el
ticket abierto, hacía el gesto para cerrarlo y salía de Vender.

## Lo que se decidió

1. **Es lo de fábrica de toda hoja en el teléfono (bajo 640 px), sin que ninguna pantalla lo pida.** `<Modal>` (todas sus variantes:
   hoja, `ticket` y `camara`) y `<Cajon>` entran solos a la pila; desde 640 px nada cambia. Se decide al abrir la hoja: girar el teléfono
   con una hoja abierta no lo cambia.
2. **Una pila para todo el ERP** (`components/ui/useAtrasCierraLaHoja.ts`): cada hoja abierta deja en el historial una entrada con la MISMA
   URL y su marca (`__hojaAbierta`). **Solo la de arriba responde: un «atrás» = una hoja** (la foto sobre la prenda, el «¿Salir sin
   guardar?» sobre el formulario, la hoja de pago sobre el cajón de Por pagar).
3. **«Atrás» cierra por la puerta de la ✕** (`antesDeCerrar`): con cambios pregunta; si la persona sigue editando, su entrada vuelve sola.
   Mientras la hoja guarda (`bloqueado`) no se cierra.
4. **Una hoja sale de la pila apenas empieza a cerrarse** (la ✕, Escape, el dedo, guardar), y su entrada se retira con un «atrás» propio
   mientras anima la salida. Si cerraron varias juntas («Salir sin guardar» cierra la pregunta y la hoja), se retiran de un solo paso
   (`history.go(-n)`). Todo se reconcilia en una función (`sincronizar`), una vez por tarea, así abrir una hoja y cerrar otra en el mismo
   instante no se pisan.
5. **`<ModalRuta>` se queda afuera** (`atrasCierra={false}`, el único que lo apaga, y lo vigila la prueba): ya vive en la URL y su «atrás»
   es la navegación misma. Una segunda entrada pediría dos «atrás».
6. **La guardia de «¿Salir sin guardar?» cede ante las hojas.** Mientras haya una hoja con «atrás» o una entrada suya, la guardia no se pone
   ni se retira y su `popstate` no pregunta. Así un formulario que vive en una hoja **no pone guardia en el teléfono** (su «atrás» cierra la
   hoja y pregunta por `antesDeCerrar`), y la de una pantalla entera (Nuevo producto) espera a que se cierre la hoja de encima. No hace falta
   un contexto ni una opción por pantalla: `sinAtras` desapareció. Y su salida con «atrás» espera a que la pregunta (que también es una hoja)
   retire su entrada (`cuandoSinHojas`): sin eso, su `go(-2)` contaba esa entrada y la persona se quedaba en la pantalla (visto a 375 px
   en Nuevo producto).
7. **Navegar desde una hoja** (un enlace dentro de ella, como «Historial» en la hoja de la prenda) deja su entrada enterrada bajo la pantalla
   nueva. **Volver a ella desde esa pantalla la salta** (`decidirAlVolver` → «saltar»): un solo «atrás» lleva a la pantalla de antes. Para
   saber desde qué página se volvió, el módulo anota la última URL al envolver `pushState`/`replaceState`.
8. **Un `router.refresh()` no le borra la marca a la entrada.** Next 16 reescribe el estado de la entrada en cada refresco sin copiar lo ajeno
   (`preserveCustomHistoryState: false`); el módulo envuelve `replaceState` y la conserva si la página es la misma (`conservaMarca`). Sin
   eso, guardar dentro de una hoja dejaba su entrada vacía y pedía un «atrás» de más.

Los `popstate` de la persona sobre una hoja y los de cada retiro propio se cortan en la captura de `window` (`stopImmediatePropagation`):
la URL no cambió, y el router de Next, si restaurara el árbol de la entrada de abajo, podría volver a montar la pantalla (lo que pasó el
2026-10-08 con la guardia, ver `useSalidaSinGuardar`). Las decisiones sin navegador viven en `lib/hojas-atras.ts`, con su prueba.

## Lo que se descartó

- **Opt-in por pantalla** (como empezó): cada hoja nueva nacería sin «atrás», y la regla de ADR-0479 es que la hoja del celular la da el
  sistema. Se vigila con `lib/hojas-atras.test.ts`.
- **Un contexto de `<Modal>` para que el formulario sepa que vive en una hoja:** el formulario llama a `useSalidaSinGuardar` en el
  componente que DIBUJA el `<Modal>`, fuera de él; el contexto no le llega. Preguntarle a la pila («¿hay hojas?») sirve para los dos casos
  (formulario en una hoja y pantalla con una hoja encima).
- **Interceptar los enlaces de una hoja para retirar su entrada antes de navegar:** rompe el caso de una página interceptada que se abre
  encima de un cajón (el cajón debe seguir debajo de ella). Saltar la entrada al volver es más simple y no toca la navegación de Next.
- **Saltar también la entrada huérfana en la misma pantalla** (se llega con «adelante», o tras recargar): no se sabe hacia dónde; se deja,
  y cuesta a lo más un «atrás» sin efecto.

## Lo que queda abierto

- El menú lateral del teléfono (`AppShell`) no es un `<Modal>` ni un `<Cajon>`: «atrás» con el menú abierto sigue navegando.
- En una hoja con páginas propias (la vista rápida de Productos ▸ Historial), «atrás» cierra la hoja entera, no vuelve a su primera página.

## Cómo se verifica

`pnpm --filter web test` (`lib/hojas-atras.test.ts`: las decisiones de la pila y el candado de que toda hoja la usa). En el navegador, a
375 px (`resize_window` preset mobile), con «atrás» simulado por `history.back()` y mirando `history.state.__hojaAbierta` y
`navigation.currentEntry.index`, el 2026-10-26 en local:
- Existencias: la hoja de la prenda cierra y se queda; con un cambio en «Ajustar stock» pregunta, un segundo «atrás» cierra solo la pregunta
  (la hoja sigue con «12, era 11»), y «Salir sin guardar» cierra las dos y vuelve a la entrada de la pantalla. «Historial» desde la hoja
  navega a otra página y un solo «atrás» vuelve a Existencias (saltó la entrada enterrada). Sin hoja, «atrás» navega como siempre.
- Vender: el ticket y la cámara cierran y Vender queda con su ticket.
- Caja: el gasto rápido con «Luz» elegida pregunta; «Seguir editando» y «Salir sin guardar» hacen lo suyo.
- Productos: la vista rápida (un `<Modal>`) cierra; el Historial como `<ModalRuta>` cierra sin entrada extra; la factura de Compras igual.
- Compras ▸ Por pagar: el cajón con la hoja de pago encima: dos «atrás», una hoja cada uno; la ✕ retira la entrada.
- Nuevo producto (guardia de pantalla entera): la guardia se pone, «atrás» pregunta, «atrás» otra vez cierra solo la pregunta, y «Salir sin
  guardar» sale a la pantalla anterior.
- A 1024 px: el cajón y la hoja de pago no ponen entradas.
