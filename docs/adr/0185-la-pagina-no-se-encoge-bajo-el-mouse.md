# ADR-0185 · La página no se encoge bajo el mouse

> Numerado 0182 al subirse (PR #347) y renumerado a 0185 el mismo día: otra sesión ya había tomado el 0182 (el precio de campaña baja al .90), citado por una migración en producción.

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

## Actualización 2026-11-05: entrar, cambiar de paso y salir de un flujo guiado es cambiar de vista

**El problema.** A 375 px, «Registrar devolución» dejaba la pantalla en blanco y la persona no sabía si se había guardado. Medido con clic
real cada 30 ms: a los 97 ms el título «Devolución registrada» estaba a 231 px, a la vista; a los 122 ms la regla de esta decisión reservaba
1205 px de aire y devolvía la vista adonde estaba el botón (`scrollY` 1351, título en −973). Cumplía las tres condiciones de `reservaNecesaria`:
se acortó, la vista subió, quedó pegada al final. La regla no distingue «un bloque que se acortó» de «esta ya es otra vista». Lo mismo al entrar:
«Iniciar devolución» desde abajo de una lista cortaba el viaje hacia arriba (`scrollY` 2198, 1977 px de aire), y con solo dos resultados el
título del paso quedaba fuera, con 367 px de aire debajo. Cambios usa las mismas piezas y fallaba igual al entrar.

**La decisión.** `useVistaDelPaso(paso)` (`components/FlujoGuiado.tsx`) suelta la reserva antes de pintar al entrar, con cada paso y al salir;
lo llaman los dos flujos y `lib/flujo-guiado-vista.test.ts` falla si un flujo con `<EncabezadoFlujo>` no lo declara. Además,
`useFocoAlCambiarDePaso` espera a que se vaya el loader: con la respuesta sobre los 200 ms (lo normal al guardar) la página está `inert`, `focus()`
no hace nada y el foco se perdía en `BODY`, tanto en el éxito como en el aviso de error.

**Lo que se descartó.** Soltar la reserva solo en el paso de éxito, como se pidió: el mismo defecto seguía al entrar. Confiar solo en la red de
abajo: con dos resultados quedaban 445 px de contenido a la vista, no salta, y el título del paso igual se perdía.

**Verificación.** A 375 px y con clic real: entrar desde abajo de la lista (Devoluciones `scrollY` 2314 → 0, Cambios 3316 → 0, sin aire);
registrar con respuesta rápida y con 800 ms de demora dentro de la base, para que saliera el loader (`scrollY` 147, título a 231 px, foco en el título al
irse el loader); un rechazo de la base (foco en el aviso, a la vista); retroceder de paso y salir a la lista en Cambios. A 1440 px, registrar (`scrollY`
0, título a 325 px). Capturas en `docs/capturas/2026-11-05-devoluciones-en-blanco/`. No se probó en un iPhone real.

## Actualización 2026-11-05 (b): la red en la regla

**El problema.** Quince componentes sueltan hoy la reserva a mano (`git grep -l "soltarPaginaEstable()"`), casi siempre después de que alguien viera
una pantalla vacía. La regla decía que una pantalla nueva no tenía que hacer nada, y no era cierto: la que cambiaba de vista y se olvidaba de avisar
dejaba a la persona mirando aire. Felipe pidió cerrarlo en la regla misma.

**La decisión.** `esCambioDeVista` (`lib/pagina-estable-reglas.ts`, pura): si la página se acortó y volver adonde estaba la vista dejaría menos de **un
cuarto de lo visible** con contenido, lo que se veía ya no existe. `<PaginaEstable />` lo trata como un enlace: deja de vigilar, suelta lo reservado y
la vista queda donde la dejó el navegador, en lo último que hay. El aire de una reserva anterior no cuenta como contenido. Vale igual dentro de una hoja.

**Por qué un cuarto.** A 375 px son 203 px, y la cabecera fija (60) y el margen del final (40) se comen 100: bajo eso casi no queda nada que mirar. Sube
la vara poco a propósito: un bloque que se acorta y deja contenido sigue reservando como siempre (276 px menos deja 524 a la vista).

**Lo que no cambia.** `soltarPaginaEstable` sigue siendo lo correcto en un cambio de vista conocido: la red evita la pantalla vacía, no lleva al título, y con
contenido a la vista no salta. No se quitó ninguna de las quince llamadas.

**Lo que se paga.** Si una lista se cambia un instante por algo muy corto y vuelve (un esqueleto), estando abajo la vista ahora sube, y antes se quedaba quieta
sobre aire hasta que volvía. No se buscó si alguna pantalla lo hace.

**Verificación.** A 375 px y con clic real, con `useVistaDelPaso` apagado a propósito para probar la red sola: registrar una devolución deja `scrollY` 147, sin
aire, con el título a 231 px ([captura](../capturas/2026-11-05-devoluciones-en-blanco/red-sola-registrar-375.jpg)). En un banco de prueba temporal sobre el marco real: quitar 276 px al
fondo sigue reservando 276 (vista quieta); cambiar de vista con esa reserva puesta la suelta; lo mismo dentro de una hoja de 500 px (quitar 120 reserva 120; cambiar de
vista suelta). En `/devoluciones`, el filtro «Con devolución» baja la página de 4078 a 1686 px sin mover la vista. No se recorrió el resto del ERP ni un iPhone real.

## Actualización 2026-11-05 (c): en Safari, el título quedaba bajo la cabecera

**El problema.** La primera prueba en Safari de iPhone (simulador, iOS 26.5, 375 × 667) mostró lo que Chrome no podía: ya no había pantalla en blanco, pero al entrar a un flujo el título quedaba a 5 px y al registrar a 0 px, los dos bajo la cabecera fija de 60 px. Quien registraba veía el detalle de la devolución sin el «Devolución registrada». Dos causas: Safari da por visto un título aunque lo tape la cabecera, y el viaje suave hacia arriba se cortaba al acortarse la página.

**La decisión.** `useVistaDelPaso(paso, raiz, titulo)` lleva la vista, antes de pintar y sin animación, al inicio del flujo (`scroll-mt-24`, bajo la cabecera), y el título recibe el foco sin moverla. Los paneles ya no piden `window.scrollTo`.

**Verificación.** En Safari a 375 × 667, con 800 ms de demora dentro de la base: al entrar se ven la flecha, «Paso 2 de 4», la barra, el título y la prenda; al registrar, `scrollY` 197, título a 181 px, sin aire y con el foco en el título al irse el loader. En Chrome a 375 × 812, el título queda a 247 px en todos los pasos y a 235 px al registrar; a 1440 × 900, igual o sin moverse si la página cabe. Capturas en `docs/capturas/2026-11-05-safari-titulo/`. En el simulador los gestos son por software: falta un iPhone en la mano.

**Lo que también se comprobó en Safari.** La red de esta decisión (un bloque de 276 px reserva sus 276; un cambio de vista suelta la reserva) y lo de ADR-0479 y ADR-0596: el asa va de 67 a 91 px y el título empieza en 91, y tirar de ella mueve la hoja aunque su contenido esté corrido 159 px, sin tocar el foco ni el contenido; el botón negro y el aviso se leen en claro y en oscuro.
