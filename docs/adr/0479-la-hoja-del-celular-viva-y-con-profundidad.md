# ADR-0479 — La hoja del celular: viva y con profundidad

- **Fecha:** 2026-10-22 · **Estado:** aceptado (Felipe eligió «B · Hoja viva con profundidad» mirando la maqueta). En construcción por
  actividades en la rama `claude/unificar-animaciones-moviles-51e9d0`: **actividades 1 a 5 hechas** (la hoja viva en `<Modal>`, el
  ticket de Vender, la profundidad, Filtros a media altura y el cajón como hoja alta).
- **Relacionados:** ADR-0136 (regla de movimiento de modales), ADR-0358 (una función, una pieza: `/unificar`), ADR-0185 (la página no
  se encoge bajo el mouse), ADR-0146 (avisos), ADR-0149 (loader único), PL-105 (Vender, Cambios y Devoluciones a 375 px).
- **Maqueta y auditoría:** `docs/maquetas/hojas-movil-2026-10/index.html` (pestaña «Lo que encontré»).

## El problema

En el celular, `<Modal>` dibuja la hoja pegada abajo, pero no se porta como una hoja. Medido el 2026-10-22 en local a 375 × 812 con
pantalla táctil, abriendo las hojas de 98 escenarios del auditor de tema con la cuenta Admin (82 abrieron: 61 hojas y 21 listas):

- **0 de 61 hojas** tenían asa o se movían al arrastrarlas desde arriba.
- **29 de 61** no tenían ✕: la única salida era «Cancelar» al pie, y en 5 ese pie quedaba bajo el pliegue (Pagar a proveedor, Nueva
  proforma, la prenda de una proforma, Campaña de Atributos, Acciones de Existencias).
- **57 de 61** entraban con `cayla-hoja` (suben 24 px con un fundido, 380 ms): aparecen, no llegan desde el borde.
- **1 de 61** tenía `overscroll-behavior: contain`: en las demás, al llegar al final, el gesto seguía hacia la página de atrás.
- **41 de 61** ocupaban del 85 al 100 % del alto, con `max-h: min(90vh, 90%)` (en Safari, `vh` se mide con la barra escondida).

Y fuera de `<Modal>`: el cajón (`<Cajon>`) tapa toda la pantalla y entra de costado; el aviso esconde su ✕ hasta pasarle el mouse;
225 reglas `:hover` del CSS propio se quedan pegadas después de un toque; hay 8 barras de abajo distintas; `viewport-fit=cover` no está
declarado y los 25 `env(safe-area-inset-*)` del ERP valen 0.

## La decisión (Felipe, 2026-10-22)

Felipe probó con el dedo tres formas en la maqueta («Hoy», «A · Hoja viva» y «B · Hoja viva con profundidad») y eligió **B**:

- La hoja **llega desde el borde** (460 ms, `--ease-cayla`) y su contenido sigue entrando en cascada (ADR-0136, sin cambio).
- Tiene **asa** y **sigue al dedo** 1 a 1. Soltada más allá de un tercio de su alto, o de un tirón (más de 0,5 px/ms en los últimos
  100 ms), se cierra; si no, vuelve a su lugar. Sin rebote: tirada más arriba de abierta, resiste y se frena (`goma`).
- **Respeta lo que ya cierra la hoja:** soltarla para cerrar pasa por `antesDeCerrar` igual que Escape, el velo y la ✕. Sin cambios sale
  desde donde quedó; con cambios vuelve a su lugar y pregunta «¿Salir sin guardar?». Mientras guarda (`bloqueado`), oye el dedo pero no se va.
- **Lo de atrás se aleja** (0,92), se redondea y vuelve al ritmo del dedo (actividad 3).
- Las listas de filtros abren a **media altura** y se estiran; el cajón es una **hoja alta** que se desliza entre registros; el aviso se
  aparta con el dedo (actividades 4, 5 y 8).

Todo vale **solo bajo 640 px**, donde la hoja va pegada abajo. En escritorio y en tablet nada cambia.

## Las actividades (aprobadas por Felipe el 2026-10-22; la 13, «listas largas como hoja», queda fuera por ahora)

| # | Actividad | Estado |
|---|---|---|
| 1 | La hoja viva en `<Modal>` | **Hecha** |
| 2 | El mostrador: el ticket de Vender con el dedo; Vender, Cambios, Devoluciones y Apartados a 375 px | **Hecha** |
| 3 | La profundidad: lo de atrás se aleja y vuelve con el dedo | **Hecha** |
| 4 | Filtros a media altura | **Hecha** |
| 5 | El cajón como hoja alta | **Hecha** |
| 6 | Registro: familia en `/unificar`, ADR-0136 y `CLAUDE.md`; PR | Por hacer |
| 7 | Que un toque no deje nada pegado (`:hover` solo con mouse) | Por hacer |
| 8 | El aviso en el celular | Por hacer |
| 9 | Los márgenes del iPhone (`viewport-fit=cover`) | Por hacer |
| 10 | Las tres capas hechas a mano pasan a `<Modal>` | Por hacer |
| 11 | El menú lateral se cierra deslizando | Por hacer |
| 12 | Una sola barra de abajo (pasa por `/unificar`: Felipe elige mirando) | Por hacer |

## Actividad 1 — la hoja viva en `<Modal>`

- **Reglas puras:** `apps/web/lib/hoja-gesto.ts` (de quién es el gesto, cuánto se mueve, la velocidad al soltar, a qué punto va y en
  cuánto tiempo), con su prueba `lib/hoja-gesto.test.ts` (20 casos). Ya acepta más de dos puntos para la media altura de la actividad 4.
- **El dedo:** `components/ui/useHojaArrastre.ts` devuelve un ref de callback **estable** para el `Dialog.Content`. Estable a propósito:
  un ref nuevo en cada render quitaría y pondría los listeners, y una hoja que se redibuja ~100 veces por segundo (Registrar gasto)
  cortaría el arrastre a la mitad.
- **Por qué `!important`:** la hoja y el velo se mueven escribiendo el estilo en línea (un dedo dispara un evento por cuadro: nada de
  estado de React). Una animación CSS en curso, como el velo con `both`, le gana a un estilo en línea normal pero no a uno importante.
  Al volver la hoja a su lugar, los estilos se sueltan y quedan sus clases de siempre; por eso Escape, después de un arrastre, sigue
  saliendo con su animación (medido).
- **Cuándo el gesto es de la hoja:** el dedo baja y todo lo que corre bajo él está arriba del todo. De lado o hacia arriba, o con algo
  desplazado, es del contenido. No arrastra desde un campo, una lista abierta (`[data-capa-flotante]`) ni un deslizador; una pieza puede
  pedirlo con `data-sin-arrastre`. Mientras se decide (los primeros 6 px), un dedo que baja con todo arriba no se le entrega al
  navegador: si empieza su propio gesto, ya no lo suelta.
- **El asa** (`.asa-hoja`, `data-asa-hoja`) va al final de la hoja, fuera de la cascada y antes de la capa de las listas (que tiene que
  ser lo último, `combos-fuera-de-la-cascada.test.ts`), y se dibuja arriba con `position: absolute`. No es un control (`aria-hidden`):
  la salida del teclado y del lector sigue siendo Escape, la ✕ o «Cancelar», así que la huella de controles de las guías no cambia.
  Tampoco recibe toques (`pointer-events: none`, corregido en la actividad 2): el dedo lo escucha la hoja entera, y su franja de 24 px
  le tapaba la punta a la ✕ de arriba a la derecha.
- **Entrada y salida:** `cayla-hoja-movil-entra` (desde el 100 %, 460 ms) y `cayla-hoja-movil-sale` (300 ms, `--ease-salida`), solo en
  `.cascada-modal` bajo 640 px y sin «reducir movimiento». El loader (`Espera`) usa las mismas clases y no cambia; la cámara tampoco.
  `MS_SALIDA_CELULAR` (300) en `Modal.tsx` espera esa salida antes de desmontar. Si la hoja se fue con el dedo, `Modal` no le pone la
  salida de siempre encima y desmonta en lo que tarda en llegar abajo.
- **Alto en `dvh`** (`min(90dvh, 90%)`) y `overscroll-behavior: contain` bajo 640 px.
- **Fuera de esta actividad:** el ticket de Vender (variante `ticket`: corre por dentro y su arrastre es la actividad 2) y la cámara.

**Verificado (2026-10-22, local, 375 × 812 táctil emulado):** Registrar cliente, Pagar a proveedor, la vista rápida de un producto, el
detalle de una venta y el buscador siguen al dedo y se cierran; Registrar gasto con un texto escrito no se cierra y pregunta, y
«Salir sin guardar» cierra las dos hojas; con Pagar a proveedor desplazada 260 px, bajar el dedo desplaza el contenido (260 → 50) y la
hoja no se mueve; un arrastre corto y lento vuelve al mismo lugar sin dejar estilos. En escritorio (1440 × 900) no hay asa y la hoja
sigue a 72 px de arriba. `vitest` completo (587 archivos), `tsc`, `eslint`, `knip` y `knip:produccion` en verde. **No verificado en
un iPhone real.**

La medición de la auditoría repetida después (98 escenarios, 81 abrieron): **las 51 hojas de `<Modal>` tienen asa** (antes 0) y **49 se
cierran con el dedo**; las otras 2 estaban desplazadas (la talla en la vista rápida, 202 px; una capa de Existencias, 25 px) y el dedo
desplazó el contenido, que es lo que tiene que pasar. 53 entran con `cayla-hoja-movil-entra`. Sin asa quedan el cajón (actividad 5), la
hoja hecha a mano de Proveedor (actividad 10) y la cámara (fuera a propósito).

## Actividad 2 — el mostrador

- **El ticket de Vender** (`<Modal variante="ticket">`) también lleva asa y se baja con el dedo. Su lista corre por dentro del `<aside>`:
  el gesto mira lo que corre bajo el dedo, así que desde la cabecera o el pie se baja la hoja y desde la lista desplazada se desplaza la
  lista. Bajarlo no toca el ticket, que vive en Vender: al volver a abrirlo sigue con sus prendas.
- **Mientras la venta se envía, el ticket no se cierra:** `PuntoDeVenta.tsx` le pasa `bloqueado={envio.enviando}` (`useIntento`). Vale
  para el dedo, el velo y Escape. Antes, el velo y Escape podían cerrar la hoja a mitad de un cobro; no duplicaba nada (la venta va
  con su token), pero la persona perdía de vista si se cobró.

**Verificado (2026-10-22, local, 375 × 812 táctil emulado, cuenta Admin):** el ticket con una prenda se baja con el dedo desde la
cabecera y, al reabrirlo, la prenda sigue; con «Confirmar cobro» pulsado y `registrar_venta` retenida en el navegador de prueba (nunca
llegó a la base: 0 ventas nuevas en la base local), ni el dedo ni Escape cierran la hoja. Cambios y Devoluciones (paso 2 de cada
uno) a 375 px sin desborde; en Apartados, «Opciones» abre con asa y se cierra con el dedo. Capturas en la sesión. `vitest`
completo, `tsc` y `eslint` en verde.

## Actividad 3 — la profundidad

- **Qué se aleja:** lo marcado con `data-fondo-hoja`: la cabecera del marco (`="borde"`, la que se redondea arriba), el `<main>` y la
  persiana de Caja cerrada, que se monta aparte (`CajaCerrada.tsx`). Se aleja a 0,92, baja 12 px y la cabecera se redondea 18 px
  (`FONDO_ALEJADO` y `fondoSegun` en `lib/hoja-gesto.ts`, con su prueba); entra en los 460 ms de la hoja y vuelve en lo que tarda en
  irse. Mientras el dedo la lleva, vuelve al mismo ritmo (`alMoverse` de `useHojaArrastre`).
- **Una sola tarjeta aunque la página esté bajada:** la cabecera es `fixed` y hermana del contenido, así que no se puede escalar un
  envoltorio común. Cada capa se escala por separado alrededor del MISMO punto de la pantalla (el centro de arriba de lo que se ve:
  `transform-origin` calculado con su `getBoundingClientRect`). Lo que quedaba justo arriba de la pantalla asomaba sobre la cabecera al
  achicarse: se recorta con `clip-path` en el borde de arriba de lo que se veía.
- **Lo fijo de adentro:** un `transform` vuelve a la capa contenedora de lo `fixed` que lleva dentro (la barra de abajo de Caja, el
  aviso de cierre, «sin conexión»), que se correría de lugar. Mientras la hoja está abierta queda escondido (está detrás de ella) y al
  volver aparece con un fundido de 220 ms. Se busca ANTES de poner `will-change: transform`, que ya cambia el contenedor (así se escapó
  en la primera prueba). Para encontrarlo sin leer el estilo de cada nodo: un elemento fijo no tiene `offsetParent`.
- **Una dueña:** la primera hoja que se abre aleja lo de atrás (`fondoDeLaHoja.ts`, `alejarFondo` / `moverFondo` / `devolverFondo`); una
  hoja abierta encima de otra no aleja nada más. Si la hoja se desmonta sin su salida (una navegación), lo de atrás vuelve de una.
- **Solo en el celular y sin «reducir movimiento»:** en escritorio, en tablet y con movimiento reducido no se toca nada (medido: la
  cabecera y el `<main>` sin ningún estilo con la hoja abierta).

**Verificado (2026-10-22, local, 375 × 812 táctil emulado):** Productos con la página bajada a 900 px, Filtros abierta: la cabecera y el
contenido quedan a 15 px de cada borde y de 345 px de ancho los dos, sin nada asomando arriba; a mitad de arrastre los dos vuelven a la par
(0,95); al cerrar no queda ningún estilo y la página sigue en 900 px. En Caja, la barra de abajo se esconde con «Gasto» abierto y vuelve al
cerrarlo. Con el procesador frenado 4 veces, la entrada corre a 17 ms por cuadro, sin cuadros lentos, igual con y sin profundidad (no
mide la tarjeta gráfica de un teléfono barato: eso se ve en el iPhone). Lo de las actividades 1 y 2, repetido con la profundidad puesta,
sigue igual. `vitest` completo, `tsc`, `eslint`, `knip` y `knip:produccion` en verde.

## Actividad 4 — Filtros a media altura

- **`<Modal mediaAltura>`:** en el celular la hoja entra desde el borde y se detiene dejando media pantalla a la vista (`puntoMedio` en
  `lib/hoja-gesto.ts`; si la hoja es baja, menos del 62 % de la pantalla, abre entera). La usan los Filtros de Productos y de
  Existencias, que aplican cada cambio al momento: se ve lo primero, su botón y, detrás, la lista que cambia.
- **A media altura, todo gesto vertical es de la hoja** (`decidirGesto` con `hojaEnTope` falso): hacia arriba se estira hasta abierta del
  todo, hacia abajo se cierra; lo de adentro recién se desplaza con la hoja estirada, como en iOS. Los tres puntos (abierta, media,
  cerrada) los decide `destinoAlSoltar`, igual que antes: un tercio del tramo o un tirón.
- **El pie a la vista:** el `.pie-hoja-fijo` sube lo mismo que baja la hoja (hasta la media altura), así «Ver 21 productos» queda pegado
  abajo de la pantalla en las dos alturas.
- **Lo de atrás en proporción:** a media altura se aleja solo lo que corresponde (0,95, no 0,92); `<Modal>` lo ajusta con
  `progresoActual()` del gancho apenas aleja lo de atrás. Si no, saltaba al primer toque.
- **Salir desde la media altura con Escape, el velo o la ✕:** la hoja está movida con un estilo importante, así que sale con su
  transición (`salirDesdeDondeEsta`). La clase de salida no se le pone (`data-movida` en la hoja y el velo, regla en globals.css): su
  animación sobre `transform` cancelaba la transición y la hoja saltaba abajo de golpe (medido: a los 16 ms ya estaba abajo). La primera
  versión lo decidía en `pedirCierre` leyendo una ref, y el linter de React lo rechazó con razón (`pedirCierre` se pasa a los hijos
  durante el render); con el atributo, `pedirCierre` quedó como era.

**Verificado (2026-10-22, local, 375 × 812 táctil emulado):** Filtros de Productos abre con el borde en 406 px (la mitad) y «Ver 21
productos» entre 752 y 811 px; un gesto hacia arriba desde el contenido la estira (borde en 193 px) sin desplazar lo de adentro; bajarla
lento un poco más de un tercio la devuelve a 406; un tirón desde ahí la cierra y no deja estilos; Escape desde la mitad la baja en 300
ms (406 → 574 → 718 → … → 812). Filtros de Existencias (`/inventario`) también abre a la mitad. Lo de las actividades 1 a 3 sigue igual
(hoja con texto, contenido desplazado, arrastre corto, escritorio, ticket cobrando, barra de Caja). `vitest` completo, `tsc`, `eslint`,
`knip` y `knip:produccion` en verde.

## Actividad 5 — el cajón como hoja alta

- **En el celular `<Cajon>` es la misma hoja que `<Modal>`:** sube desde abajo hasta el 92 % (clase `cajon-hoja` y `max-sm:` en
  `Cajon.tsx`; entrada y salida en globals.css), con su asa, se baja con el dedo (`useHojaArrastre`) y aleja lo de atrás
  (`fondoDeLaHoja.ts`). Los 10 cajones del ERP lo heredan sin tocarlos. En escritorio no cambia nada.
- **Siempre con velo en el celular:** Movimientos, Equipo, la ficha de una terminal y Recomendaciones abren su cajón sin velo para que
  la lista de atrás siga viva; en el teléfono la hoja la tapa y tocarla no sirve, así que ahí va con velo y es modal (`useEnCelular`).
- **Deslizar a los lados para pasar de registro** (donde hay `navegacion`: Por pagar, Notas de crédito, Proveedores): el registro sigue
  al dedo, resiste en las puntas de la lista y, al soltar, `pasoDeLado` decide (una cuarta parte del ancho o un tirón). El dedo a la
  izquierda es el siguiente; el registro nuevo entra desde ese lado (`cayla-entra-de-lado`, 300 ms, en vez del «se reacomoda» de
  escritorio). Las flechas del pie son ‹ › en el celular y ↑ ↓ en escritorio; el teclado sigue con ↑ ↓. El asa queda fuera del registro,
  así no se desliza con él. No desliza desde un campo, una lista abierta, un deslizador ni algo que corre de lado (una tabla ancha).

**Verificado (2026-10-22, local, 375 × 812 táctil emulado):** el detalle de un movimiento y la ficha de un proveedor abren como hoja
alta (borde en 65 px, 375 de ancho), con asa y velo, alejan lo de atrás (0,92) y se cierran con el dedo sin dejar estilos; en Por pagar,
deslizar a la izquierda pasa de «1 de 3» a «2 de 3» y a la derecha vuelve. En escritorio (1440 × 900) el cajón de Movimientos sigue a
la derecha (456 px), sin asa y sin velo. `vitest` completo, `tsc`, `eslint`, `knip` y `knip:produccion` en verde.
