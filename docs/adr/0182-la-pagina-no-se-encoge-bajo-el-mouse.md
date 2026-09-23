# ADR-0182 · La página no se encoge bajo el mouse

**Fecha:** 2026-09-23 · **Estado:** aceptado (Felipe eligió las tres recomendaciones) · **Alcance:** todo el ERP

## Problema

Felipe vio que en Registrar comprobante, al tocar un medio de pago, «a veces la página se sube sola como si
hubiera hecho scroll». Medido: no era un scroll. Era la página que se **acortaba** bajo el mouse. Cada medio
dibuja debajo algo de distinto alto (la cajita del banco, un aviso o nada) y, como el pago es lo último del
formulario, estando abajo del todo el navegador no puede dejar la vista más abajo que el nuevo final: la recorta
y la vista sube. «A veces» significaba «solo cuando estás al fondo».

Un barrido de todo el ERP (tres revisiones en paralelo, 2026-09-23) encontró ~40 lugares con la misma
mecánica, que caen en cuatro causas:

1. **Bloques que cambian de alto con cada opción** (los datos de cada medio de pago en `LineasPago` y `PagoPiezas`).
2. **El combo «Responsable»** (~55 pantallas) abría su lista *dentro* del contenido, empujando 150–250 px; al
   elegir, se cerraba de golpe. Casi siempre es lo penúltimo de un formulario o de una ventana.
3. **Las ventanas (`<Modal>`) iban centradas**: todo cambio de alto del contenido movía también su borde de
   arriba, y la ventana «bailaba» al elegir un motivo, un medio o un responsable.
4. **Un clic que cambia un bloque grande del final por otro corto**: Contado → Crédito, «Registrar un pago
   ahora», pestañas de Recibir, Cobrar en el ticket, «Volver sin cerrar» una orden, marcar/desmarcar en Por pagar.

## Decisión

| Causa | Arreglo | Dónde |
|---|---|---|
| 1 | El hueco de los datos del medio mide siempre lo del medio más alto: los de los otros medios se apilan invisibles (`invisible` + `inert` + `aria-hidden`) en la misma celda de grid. | `LineasPago.tsx`, `PagoPiezas.tsx` (`DatosDelMedioEstable`) |
| 2 | La lista **flota** (`fixed`, medida con `usePosicionLista`, como `ComboBuscable`): abre hacia abajo o, si no cabe, hacia arriba. Se quitó la prop `hacia`. | `ComboResponsable.tsx` |
| 3 | En escritorio la hoja va **anclada arriba** (8vh); en celular sigue pegada abajo. | `ui/Modal.tsx`, `ProveedorModal.tsx` |
| 4 | **Regla global** `<PaginaEstable />`, montada una vez en `app/layout.tsx`: tras un clic (o `change`), si el contenedor que se desplaza —la página o una ventana— se acortó y el navegador tuvo que recortar el scroll, reserva ese alto como aire al fondo y devuelve la vista adonde estaba. Corre en el `ResizeObserver` (después del diseño, antes de pintar): no se llega a ver el salto. La reserva se suelta sola cuando queda fuera de la vista. | `ui/PaginaEstable.tsx`, `lib/pagina-estable-reglas.ts` (puro, con pruebas) |

Además: `SegmentoDeslizante` ya no usa `scrollIntoView` (movía la página en vertical); solo desplaza su propia
tira en horizontal. La paginación de Resumen (Comparación y Comportamiento) lleva la vista al inicio de la tabla,
como Inventario: es un cambio de URL, y la regla global deja pasar las navegaciones a propósito.

## Qué distingue un recorte de un scroll pedido

`reservaNecesaria` solo actúa si se cumplen las tres: el contenido **se acortó**, la vista **subió**, y quedó
**pegada al nuevo final**. Un scroll que pidió el código (llevar a un campo con error, volver arriba) no deja la
vista pegada al final y se respeta. Un clic que cambia la URL (enlace, filtro por URL, paginación) se descarta.

## Alternativas descartadas

- **Arreglar pantalla por pantalla** (~10 arreglos sueltos): la pantalla siguiente repetiría el problema.
- **`overflow-anchor`**: el anclaje de scroll del navegador no sirve aquí; el problema no es que el contenido se
  mueva, es que el documento ya no alcanza.
- **Dejar la lista del combo en línea y solo animar el cierre**: se desliza en vez de saltar, pero igual se mueve.
- **Ventanas centradas con alto fijo**: dejaría mucho aire en ventanas cortas.

## Lo que se paga

- A veces queda aire vacío al fondo hasta que la persona mueve la rueda (la reserva).
- La lista del Responsable tapa por un momento lo que tiene debajo.
- Las ventanas ya no quedan al medio de la pantalla en escritorio.

## Verificación (2026-09-23)

En Chrome sin ventana, manejado por CDP (el panel del navegador de la app suele estar oculto y ahí no corre el
`ResizeObserver`), sobre una página de prueba con las piezas reales: casilla que quita 276 px al fondo de la
página → 0 px de salto; lo mismo dentro de una ventana con scroll → 0 px, y el borde de arriba no se movió (57 px
antes y después); abrir y elegir en el Responsable → 0 px, lista `fixed` dentro de la vista; un `scrollTo(0)`
pedido tras un clic → se respeta; al subir, la reserva se suelta. Cambio de medio en `LineasPago` a 768/390/320 px
→ 0 px en los 36 casos. Reglas puras: 7 pruebas en `pagina-estable-reglas.test.ts`.
