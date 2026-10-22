# ADR-0479 — La hoja del celular: viva y con profundidad

- **Fecha:** 2026-10-22 · **Estado:** aceptado (Felipe eligió «B · Hoja viva con profundidad» mirando la maqueta). En construcción por
  actividades en la rama `claude/unificar-animaciones-moviles-51e9d0`: **actividad 1 hecha** (la hoja viva en `<Modal>`).
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
| 2 | El mostrador: el ticket de Vender con el dedo; Vender, Cambios, Devoluciones y Apartados a 375 px | Por hacer |
| 3 | La profundidad: lo de atrás se aleja y vuelve con el dedo | Por hacer |
| 4 | Filtros a media altura | Por hacer |
| 5 | El cajón como hoja alta | Por hacer |
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
