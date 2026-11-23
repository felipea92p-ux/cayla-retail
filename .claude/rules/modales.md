---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/lib/movimiento*"
---

## Movimiento y modales (regla — ADR-0136)

**Todo modal nuevo se hace con `<Modal>` (`apps/web/components/ui/Modal.tsx`; por URL, `<ModalRuta>`) y hereda solo el
efecto del sistema: velo con desenfoque → hoja que sube 18 px y crece → contenido en cascada (título, bajada y campos,
18 ms de desfase, en los cuatro tiempos con nombre de `globals.css`: `--t-resp`, `--t-cambio`, `--t-hoja`, `--t-momento`, ritmo «Rápido», ADR-0611) → salida corta. En el celular la hoja llega desde el borde, con asa, se baja con el dedo y aleja lo de atrás
(«B · Hoja viva con profundidad», ADR-0479): `<Modal>` y `<Cajon>` ya lo hacen.** Y un `:hover` de nuestro CSS va siempre dentro de
`@media (hover: hover)` (en el teléfono se queda pegado tras un toque; el `hover:` de Tailwind ya lo hace solo): lo vigila `lib/hover-con-mouse.test.ts`. No definas otra animación de entrada de modal ni reimplementes el overlay
(`fixed inset-0`): si una pieza no debe entrar en cascada, `data-sin-cascada`. Lo único que un modal agrega por su cuenta
son respuestas a una acción dentro del contenido (barra que se llena, cifra que cuenta, «visto» que se dibuja) con
`--ease-cayla`, 200–500 ms, **sin rebote, nunca decorativo, nunca en bucle**: las únicas excepciones, todas señales y no adorno, son las de
`movimiento-excepciones.md`; y todo se apaga con `prefers-reduced-motion`. Los números exactos y el porqué: `docs/adr/0136-regla-de-movimiento-de-modales.md` y la sección
«REGLA DE MODALES» de `apps/web/app/globals.css`. Referencia visual: `docs/maquetas/comprobantes-animaciones-2026-09/`.

**Las animaciones arrancan apagadas (ADR-0625, Felipe 2026-11-07):** todo lo de arriba se ve solo si este aparato las encendió en
**«Apariencia»** (la fila al pie del menú, junto al modo oscuro y el modo liviano, ADR-0674 act. 2026-11-17) (`localStorage["cayla-movimiento"]`; el script del `<head>` pone `data-movimiento`
en `<html>`). Quieto, `app/estilos/movimiento.css` deja cada animación y transición en 0,01 ms. Las únicas que siguen moviéndose son las
**señales de espera**: el hilo de «Guardando…», el loader y su anillo, el campo que consulta y el buscador que busca. Una señal nueva hecha en JSX lleva
`data-senal`; una hecha en CSS se suma a la lista de `movimiento.css`. **Lo que anima desde JavaScript pregunta `prefiereQuieto()`
(`lib/movimiento-cliente.ts`) o `useQuieto()`, nunca `matchMedia("(prefers-reduced-motion: reduce)")`**: no vería el interruptor. Lo vigila
`lib/movimiento-reglas.test.ts`. Si el aparato pide menos movimiento, eso gana siempre. Una pantalla nueva se diseña y se revisa también quieta.

**Escape dentro de una hoja (ADR-0136, «Actualización 2026-09-26»):** la hoja se cierra solo con un Escape que ningún
control de adentro usó (`components/ui/useEscapeLibre.ts`): con la lista de un combo abierta, el primer Escape cierra la
lista y el segundo, la hoja. **Un control que usa el Escape (cierra su lista, borra su búsqueda) llama a
`e.stopPropagation()`; uno que no, lo deja pasar.** Radix escucha Escape en la captura del `document`, antes que el
control, así que su `onEscapeKeyDown` no alcanza para saber si el Escape era del combo. Un cajón que arme su propio
`Dialog.Content` pasa su `onEscapeKeyDown` por `useEscapeLibre` (lo vigila `lib/hojas-escape.test.ts`).

**«Atrás» en el teléfono cierra la hoja de arriba (ADR-0528, Felipe 2026-10-26):** bajo 640 px, el botón «atrás» y el gesto desde el borde
cierran la hoja de más arriba (todo `<Modal>`, también `ticket` y `camara`, y todo `<Cajon>`), nunca llevan a la pantalla anterior; un «atrás» =
una hoja, y con cambios pregunta por `antesDeCerrar`. Lo da la pila de `components/ui/useAtrasCierraLaHoja.ts`: **una pantalla nueva no hace
nada**, y nadie pone su propia entrada de historial para una hoja. Solo `<ModalRuta>` lo apaga (`atrasCierra={false}`: ya cierra navegando), y
`lib/hojas-atras.test.ts` falla si otra hoja lo apaga o nace sin él. La guardia de `useSalidaSinGuardar` cede sola mientras haya hojas: un
formulario dentro de una hoja no necesita opción alguna.

**Teclas y clics que suben desde un modal (ADR-0128, «Actualización 2026-09-26»):** React hace subir los eventos de un
portal por sus ancestros de React: un `<Modal>` abierto desde un cajón o una fila le entrega sus teclas y sus clics al
`onKeyDown`/`onClick` de ese cajón o esa fila, aunque en la página viva fuera. Un cajón que pasa de registro con ↑ ↓ lo
hace con `useFlechasDelCajon` (ignora la flecha que no nació en su DOM, que otro control ya usó o que viene de un campo;
lo vigila `lib/vista-rapida-reglas.test.ts`), nunca con un `e.key === "ArrowDown"` propio; y un contenedor clicable que
puede tener un modal adentro ignora el clic cuyo destino no está en su DOM (`!e.currentTarget.contains(e.target as Node)`,
como la fila de Por pagar).

**Botones a la vista en una hoja larga (2026-09-30, `/multi-view-responsive`):** la hoja de `<Modal>` es la que scrollea, y en un
laptop de 768 px de alto el botón principal de un formulario largo quedaba bajo el pliegue. La fila de acciones de una hoja con
formulario lleva la clase **`pie-hoja-fijo`** (`app/globals.css`): se pega al borde de abajo mientras el contenido pasa por detrás, y
si todo cabe no se nota. Va como hija directa del `<form>`; si la fila lleva una línea arriba (`border-t`), esa línea va en una caja
de adentro, o se correría hasta el borde de la hoja. Hoy la usan Ajustar inventario y Registrar nota de crédito; las demás hojas
largas la piden cuando se toquen.
