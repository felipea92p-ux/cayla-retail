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

## Actualización 2026-11-18: la reserva con las animaciones apagadas, y el pie pegado de una hoja

**El problema.** En la hoja de ofertas Felipe vio el pie flotando a media hoja, encima del contenido, al pasar de una forma alta a una más baja. Reproducido
en «Registrar proveedor» y en «Registrar gasto» a 1024 × 768, eran dos defectos, y el primero no era solo de las hojas:

1. **Con las animaciones apagadas la reserva no servía, ni en una hoja ni en una página.** Quieto es el estado de fábrica desde el 2026-11-07 (ADR-0625), y
   en ese estado todo elemento lleva una transición de 0,01 ms (`movimiento.css`). El relleno que escribe `<PaginaEstable>` entraba con esa transición: en el
   mismo tick todavía no existía para el navegador (`padding-bottom` leído al instante: 28 px, no 117), `llevarA` no podía devolver la vista, y al cuadro
   siguiente la regla veía la reserva sin usar, la soltaba y volvía a reservar. Medido: el relleno alternó entre 28 y 117 px cuadro por cuadro durante los
   1200 ms de la vigilancia y la vista se quedó 89 px arriba; en una página, quitar un bloque de 400 px al fondo subió la vista 400 px (`scrollY` 722 → 322).
   Si la vigilancia terminaba con la reserva puesta, quedaba ahí hasta el siguiente scroll.
2. **El pie pegado se mide desde el relleno de la hoja, y la reserva es relleno.** `.pie-hoja-fijo` es `sticky` con un `bottom` negativo igual al relleno
   normal. Con 89 px reservados quedaba 89 px arriba del borde (569..654 con el borde en 743) y, al subir la vista, hasta 86 px encima del contenido.

Los dos juntos son lo que vio Felipe: la reserva puesta, la vista sin volver y el pie 89 px arriba, 81 px encima del último campo.

**La decisión.**
- `pintarReserva` (`components/ui/PaginaEstable.tsx`) es el único lugar que escribe el relleno, al reservar y al soltar. Apaga la transición de ese elemento
  solo durante la escritura y pide una medida (`offsetHeight`) antes de devolverla: el relleno existe en el mismo tick.
- En una ventana publica además la reserva vigente en `--reserva-abajo` y la quita al soltar (`reservaPublicada`, pura, en `lib/pagina-estable-reglas.ts`).
  **En la página no:** una variable CSS se hereda, y puesta en el `body` bajaría el pie de toda hoja abierta encima. El pie de una página no la necesita:
  su pegado se mide desde la pantalla.
- `.pie-hoja-fijo` (`app/globals.css`) baja lo reservado con `translate: 0 var(--reserva-abajo, 0px)` y no hace transición (`transition-property: none`):
  con la de 0,01 ms el pie pasaba un cuadro entero sin bajar. Queda en el borde de abajo de la hoja, y el aire queda entre el contenido y los botones.

**Lo que se descartó.** Restar la reserva del `bottom` del pie, que era lo propuesto: el pie deja de tapar el contenido, pero se queda donde acaba el
contenido, con el aire debajo (medido: 89 px de hueco bajo los botones). La hoja se ve igual de rota, con los botones a media altura. Por eso tampoco hizo
falta tocar la regla de 640 px de `vidrio/hoja.css`. Meter el aire dentro del pie (un borde transparente arriba): el desenfoque del pie cubriría también el
aire. Un elemento de relleno agregado al final de la hoja: es DOM ajeno dentro de un árbol de React.

**Verificación.** Clic sobre un control de la propia hoja; «pie» y «borde» son píxeles desde arriba de la pantalla.

| Caso | Antes | Después |
|---|---|---|
| «Registrar proveedor», 1024 × 768, al fondo, plazo «Otro» → «Sin definir» (89 px menos) | vista 715 → 626; relleno alternando 28/117; pie 569..654, 81 encima del contenido | vista 715; relleno 117; pie 658..743 (borde 743), 0 encima, 0 de hueco |
| lo mismo, subiendo 45 px con la reserva puesta | pie 569..654, 37 encima del contenido | pie 658..743, 0 encima |
| «Registrar gasto», 1024 × 768, corrida 300, «Factura» → «Sin comprobante» (231 px menos) | vista 300 → 75, sin reserva | vista 300; pie 628..743 (borde 743); subiendo 100, 0 encima |
| «Registrar gasto», 375 × 812 (149 px menos) | — | vista 620; pie 644..811 (borde 811), 0 encima, 0 de hueco |
| «Registrar proveedor», 375 × 812, al fondo (93 px menos) | — | vista 1083; pie 726..811 (borde 811), 0 encima |
| una página, quitar 400 px al fondo | `scrollY` 722 → 322 | `scrollY` 938 → 938; relleno del `body` 400 px, sin variable; al subir se suelta |

Las filas de 1024 se repitieron en oscuro con las mismas cifras, las de 375 también, y «Registrar proveedor» con las animaciones encendidas. En todas, al
subir hasta que la reserva sale de la vista se suelta (relleno de vuelta a 28 o 24 px, sin variable) y los botones del pie reciben el clic. Con solo la
variable restada del `bottom`: pie 569..654 y 89 px de hueco. Capturas en `docs/capturas/2026-11-18-pie-pegado-y-reserva/`. Pruebas:
`lib/pagina-estable-pie.test.ts` (10; sin el arreglo fallan la del `translate` y la de la escritura sin transición). Nada se guardó en la base.

**Lo que vuelve a verse.** Desde el 2026-11-07 la reserva no servía con las animaciones apagadas, así que casi nadie veía el aire de esta decisión. Ahora
vuelve en todo el ERP, como se decidió: la vista se queda quieta y queda aire al fondo. En una hoja donde lo que queda ya cabe entero, ese aire no puede
salir de la vista y se queda hasta cerrar la hoja o hasta que el contenido vuelva a crecer (medido: 440 px entre el contenido y los botones en «Registrar
gasto» a 1440 × 900). Si molesta, la salida es la de siempre: el bloque que cambia de alto reserva su lugar, o la hoja lleva `data-sin-reserva`.

**Lo que no cubre.**
- **Un pie pegado hecho a mano.** ~~`ModalesApartado` (`sticky -bottom-6`), `.parecidas-hoja-pie` (`alta-parecidas.css`) y el de `FichaOrden` no usan
  la clase: siguen quedando arriba con la reserva puesta.~~ **Resuelto el mismo día** (ver «Los tres pies hechos a mano», abajo): los dos que viven en
  una hoja ya son `pie-hoja-fijo`; el de `FichaOrden` vive en la página y la reserva no lo mueve. Un pie nuevo no se dibuja con un `sticky` propio:
  lleva la clase (`lib/pagina-estable-pie.test.ts` vigila que estos dos no vuelvan atrás).
- **Si lo que hay antes del pie, dentro de su caja, mide menos que la reserva** (un `<form>` muy corto bajo un encabezado alto), al subir casi toda la
  reserva el pie puede bajar del borde por la diferencia, hasta que la reserva se suelta. Sale de la cuenta de `sticky`; no se logró reproducir en una hoja real.
- **La barra de íconos de la vista rápida** (`.vr-iconos`, celular) declara su propia transición de `translate`: con las animaciones encendidas bajaría en
  `--t-cambio` y no de golpe. No se probó.
- **No se probó en Safari ni en un iPhone real.** La cuenta del pegado desde el relleno es la misma en WebKit, pero no se midió.
- **El mismo tropiezo puede estar en otro lado:** con las animaciones apagadas, cualquier código que escriba un estilo y mida en el mismo tick lee el valor
  viejo. Solo se revisó `<PaginaEstable>`.

**CAYLA Dynamic.** `components/ui/PaginaEstable.tsx` es de las piezas que Dynamic mira: el vigilante abrirá una tarea allá. `globals.css` no viaja y
`recetas.css` no cambió, así que nada llega solo. A mano, si Dynamic tiene estas piezas: (1) en su `PaginaEstable`, `pintarReserva` (el relleno sin
transición y la variable); (2) en sus reglas puras, `VARIABLE_RESERVA` y `reservaPublicada`; (3) en su `.pie-hoja-fijo`, las dos líneas (`translate` y
`transition-property: none`); (4) la prueba `pagina-estable-pie.test.ts`. El punto 1 importa aunque Dynamic no tenga pie pegado: sin él, con las
animaciones apagadas la vista se sube sola.

### Los tres pies hechos a mano (2026-11-18, mismo día; rama `claude/elegant-bose-26f256`)

Se midió cada uno antes de tocarlo. «Pie» y «borde» son píxeles desde arriba de la pantalla; «encima» es cuánto tapa el pie al contenido al subir la vista
con la reserva puesta (40 px en Apartados, 60 en parecidas).

| Pie | Dónde vive | Antes | Después |
|---|---|---|---|
| «Apartado registrado» (`ModalesApartado`), 1024 × 768, 78 px reservados | hoja de `<Modal>` | relleno 106; pie 504,7..661 (borde 743): 82 de hueco, 24,4 encima | pie 582,7..743: 0 de hueco, 0 encima |
| lo mismo, 375 × 812 | hoja | pie 568,8..733 (borde 811): 78 de hueco, 24,2 encima | pie 646,8..811: 0 y 0 |
| «Apartado entregado», 375 × 812, 48 px reservados | hoja | pie 598,8..763 (borde 811) | pie 646,8..811 |
| «Prendas parecidas» (`.parecidas-hoja-pie`), 1280 × 720, «No, es otro diseño» en la última tarjeta (208 px menos) | hoja de `<Modal>` | relleno 236; pie 413,8..482,8 (borde 695): 212 de hueco, 59,8 encima | pie 613,8..694,8: 0 y 0 |
| lo mismo, 1024 × 768 y 375 × 812 | pantalla completa, `position: fixed` | sin reserva (ver abajo); pie 694..763 de 767 y 707..811 de 811 | pie 686..767 y 699..811 |
| la ficha de «Nueva orden» (`FichaOrden`), 1024 × 768 | **la página** | 339 px reservados en el `body`, sin variable; ficha 514..768 de 768 | no se tocó |

- **Apartados y parecidas pasan a `pie-hoja-fijo`.** Conservan lo suyo (la línea de arriba, el aire entre sus filas, `margin-top: auto` en la pantalla
  completa de parecidas y, entre 640 y 1279 px, el área segura de abajo sumada por dentro); el pegado, los márgenes, el fondo y lo que baja con la
  reserva son los del sistema. Tres cosas cambian a la vista, además de la reserva: el fondo es el vidrio del pie (antes crema y papel sólidos), el pie
  llega al borde de la hoja de vidrio (hacía sus cuentas con 24 px de relleno y la hoja tiene 28 desde 640: quedaba 4 px corto abajo y a los lados, y
  lo de atrás asomaba), y el de parecidas crece 8 a 12 px (su relleno de abajo era de 16).
- **En Apartados el defecto no se podía provocar con los controles de la hoja:** marcar sus tres casillas no cambia su alto (medido: 0, 0 y 0 px). Las
  cifras de arriba salen de un clic que quita a propósito la tarjeta del vuelto. Se migró igual: vive en una hoja que se desliza y reserva, y lo de los
  4 px sí se veía. En parecidas el defecto era real: «No, es otro diseño» pliega la tarjeta.
- **`FichaOrden` no es un pie de hoja.** Bajo 880 px de su tarjeta es una barra pegada al fondo de la **página** (lo que se desliza es la página: ADR-0509);
  la reserva va al `body`, no publica variable y el pegado se mide desde la pantalla. Además no pueden darse a la vez: si la barra está pegada, la tarjeta
  sigue por debajo de la pantalla y la página no se recorta. Desde 880 px es una columna pegada arriba. Llevar `pie-hoja-fijo` sería un error (bajaría
  con la reserva de una hoja abierta encima).
- **Las dos hojas de Apartados se abrieron con datos inventados** desde una página temporal que no se subió (solo salen después de guardar): nada se
  escribió en la base. Oscuro: las mismas cifras en las cuatro filas de hoja. Capturas: `docs/capturas/2026-11-18-pies-pegados-a-mano/`. Auditoría:
  `docs/milimetro/auditorias/2026-11-18-pies-pegados-a-mano.md` (0 graves, 0 medias).

**Lo que apareció midiendo y sigue abierto.**
- ~~**Bajo 1280 px la hoja de «Prendas parecidas» es `position: fixed` y `<PaginaEstable>` la salta** (`contenedorDe` ignora lo `fixed`, pensado para la
  lista de un combo): no reserva y la vista se sube sola al plegar una tarjeta (medido: 208 px a 1024 × 768 y 287 px a 375 × 812, antes y después de
  este cambio). Es justo lo que este ADR quiere evitar, en la pantalla completa de esa hoja.~~ **Resuelto el 2026-11-19** (ver la actualización de
  ese día, abajo): la hoja de un `<Modal>` ya no se salta aunque sea `fixed`.
- ~~**El buscador pegado arriba de esa hoja** (`.parecidas-busqueda`) sigue hecho a mano con las cuentas de 24 px y fondo papel sólido: 4 px corto en la
  hoja de vidrio. No lo afecta la reserva (se pega arriba).~~ **Resuelto el 2026-11-19:** hace sus cuentas con el relleno de la hoja y pinta el
  vidrio del pie pegado.
- **Pasar por el corte de 640 px con una reserva puesta** (girar un teléfono) deja el pie 4 px arriba del borde hasta que la reserva se suelta: el
  relleno reservado se escribió con el relleno de 28 px y bajo 640 es de 24. Vale para todo `pie-hoja-fijo`.

**CAYLA Dynamic.** Nada viaja y nada queda como tarea allá por este cambio: no toca `vidrio/recetas.css`, el contrato, el resto de `estilos/vidrio/` ni
`components/ui/`. Solo si Dynamic tuviera un pie pegado propio dibujado con `sticky` a mano, la lección es la misma: que use su `.pie-hoja-fijo`.

## Actualización 2026-11-19: lo `fixed` no siempre flota (la hoja a pantalla completa), y el buscador pegado de «Prendas parecidas»

**El problema.** Para encontrar el contenedor que se desliza bajo el clic, `contenedorDe` (`components/ui/PaginaEstable.tsx`) se saltaba todo lo
`position: fixed`. La excepción se pensó para la lista de un combo: tiene scroll propio, pero elegir en ella acorta lo de detrás. La hoja de «Prendas
parecidas» de Nuevo producto pasa a pantalla completa bajo 1280 px con `position: fixed; inset: 0`, y ella es lo que se desliza: saltarla dejaba
vigilando la página de atrás, que no se mueve. Al marcar «No, es otro diseño» la tarjeta se pliega y la vista subía sola, sin reserva. Desde 1280 px
la misma hoja no es `fixed` y sí reservaba.

**La decisión.** La diferencia entre una lista y una hoja no se lee del estilo (las dos son `fixed` y se deslizan) sino de su papel: **la hoja de un
`<Modal>` es quien hospeda la capa de las listas flotantes** (`[data-capa-flotante]`, hija directa de la hoja, donde `useDestinoFlotante` cuelga la
lista de todo combo). Quien hospeda lo que flota no flota.
- `flotaSobreOtraSuperficie(fija, hospedaLoQueFlota)` (`lib/pagina-estable-reglas.ts`, pura): se salta lo `fixed` que no hospeda esa capa.
- `contenedorDe` le pregunta con `:scope > [data-capa-flotante]`, la misma seña que usa `useAnclaje.ts`, y solo en los ancestros `fixed` (casi ninguno).
- Nada más cambia: la hoja `fixed` reserva como cualquier ventana (relleno al fondo, `--reserva-abajo` para su pie pegado, se suelta al subir).

**Lo que se descartó.**
- **`role="dialog"` como seña.** El calendario de `CampoFecha`, el selector de mes, el rango de Rendimiento y otros globos flotantes también lo llevan y
  son `fixed`: pasarían a ser el contenedor, y al cerrarse con la elección se perdería la vigilancia de lo de detrás.
- **La geometría** (lo `fixed` que cubre toda la pantalla). Alcanzaría a cosas que no son hojas y que no se midieron, y lee medidas en cada clic.
- **Dejar de saltar todo lo `fixed`.** La lista de un combo que se desliza por sí misma se volvería el contenedor, y lo de detrás quedaría sin vigilar.
- **Quitarle el `position: fixed` a la hoja de parecidas.** Arregla esa hoja y no la regla: la siguiente hoja a pantalla completa repetiría el defecto.

**Verificación.** Clic real sobre «No, es otro diseño» en la última tarjeta, con la hoja al fondo, 24 prendas. «Vista» es el `scrollTop` de la hoja;
«pie» y «borde», píxeles desde arriba de la pantalla (1 px de diferencia es el borde de la hoja de vidrio).

| Caso | Antes | Después |
|---|---|---|
| 1024 × 768, claro (la tarjeta plegada deja 208 px menos) | vista 5980 → 5772; relleno 28 px, sin reserva | vista 5980 → 5980; relleno 236 px, `--reserva-abajo: 208px`; pie 686..767 (borde 768); 0 px encima del contenido |
| lo mismo, subiendo 60 px con la reserva puesta | — | pie 686..767; 0 px encima |
| 375 × 812, claro (229 px menos) | vista 8799 → 8570; relleno 24 px, sin reserva | vista 8799 → 8799; relleno 253 px, reserva 229 px; pie 699..811 (borde 812); 0 px encima, también subiendo 60 |
| 1280 × 720 (la hoja no es `fixed`: control) | vista 6110 → 6110; reserva 208 px | igual: vista 6110; pie 613,8..694,8 (borde 696) |

Las filas de 1024 y de 375 se repitieron en oscuro con las mismas cifras, y la de 1024 con las animaciones encendidas. En todas, al subir hasta arriba
la reserva se suelta (relleno de vuelta a 28 o 24 px, sin variable). Muestreada después de pintar cada cuadro, la vista estuvo siempre donde estaba
antes del clic (30 de 30 a 1024, 32 de 32 a 375). **El combo dentro de una hoja sigue igual:** en «Registrar gasto», a 1024 × 768 y a 375 × 812, la
lista de 23 opciones abre `fixed` en la capa de la hoja, elegir la cierra, y ni la lista ni la hoja ni el `body` quedan con relleno o variable. La
diferencia con los 287 px que se midieron el 2026-11-18 a 375 es la tarjeta: cada una pliega lo que mide. Pruebas: `lib/pagina-estable-reglas.test.ts`
(4 nuevas: la regla, y que `<PaginaEstable>`, `useAnclaje` y `<Modal>` sigan usando la misma capa). Nada se guardó en la base.

**El buscador pegado de esa hoja** (`.parecidas-busqueda`, `app/estilos/alta-parecidas.css`). Era el otro pegado a mano: cuentas con 24 px fijos y
papel sólido. Ahora sale de `--parecidas-relleno` (24 px; 28 desde 640, el relleno de `.hoja-serena`) y pinta `--fondo-hoja` con el desenfoque del pie
pegado. No es otra variante: son las cuentas de `.asa-hoja-fija` y el vidrio de `.hoja-serena .pie-hoja-fijo`.

| Caso | Antes | Después |
|---|---|---|
| 1024 × 768 (hoja de 0 a 1024, borde de 1 px) | de 5 a 1019; pegado, arriba en 5: una franja de 4 px por donde asomaban las tarjetas; papel sólido | de 1 a 1023; arriba en 1; vidrio |
| 1280 × 720 (hoja de 256 a 1024, arriba en 57,6) | de 261 a 1019; arriba en 62,6 | de 257 a 1023; arriba en 58,6 |
| 640 × 900 | — | de 1 a 639; arriba en 1 |
| 375 × 812 (hoja de 0 a 375; franja del asa de 1 a 25) | de 1 a 374; arriba en 1; la caja del buscador desde 19: 6 px dentro de la franja del asa, borrosa | de 1 a 374; arriba en 7; la caja desde 25, bajo la franja |

En el celular se pega 6 px más abajo a propósito (`top: -1.125rem`): los primeros 24 px de la hoja son la franja del asa, que desenfoca lo que le pasa
por debajo. En oscuro, las mismas medidas. `lib/pagina-estable-pie.test.ts` (4 nuevas) vigila que no vuelva a un número suelto ni a un color propio, y
avisa si la hoja de vidrio cambia su relleno o el pie su desenfoque. Capturas: `docs/capturas/2026-11-19-parecidas-pantalla-completa/`. Auditoría:
`docs/milimetro/auditorias/2026-11-19-parecidas-pantalla-completa.md` (0 graves, 0 medias).

**Lo que se paga.** Como en toda hoja que reserva: al plegar la última tarjeta queda aire entre la lista y «Ninguna es mi prenda» hasta que la
persona sube. Y el buscador en reposo se ve como una banda apenas más clara que la hoja, igual que el pie (antes, una banda de papel macizo).

**Lo que no cubre.**
- **Un `Dialog.Content` armado a mano que sea `fixed` y se deslice él mismo.** No tiene la capa, así que se sigue saltando. Hoy no hay ninguno:
  `<Cajon>` es `fixed`, pero lo que se desliza es su cuerpo de adentro, que no lo es y ya se vigilaba.
- **Otro pegado a mano, en otra hoja:** la etiqueta de «Prenda sin registrar» (`PrendaSinRegistrarModal.tsx`, `sticky -top-6 … bg-papel`, solo bajo
  768 px) hace las mismas cuentas de 24 px con papel sólido. No se tocó.
- **Sigue abierto de ayer:** pasar por el corte de 640 px con una reserva puesta deja el pie 4 px arriba del borde hasta que se suelta.
- **No se probó en Safari ni en un iPhone real**, ni en una tablet de 640 a 1279 px en la mano.

**CAYLA Dynamic.** `components/ui/PaginaEstable.tsx` es de las piezas que Dynamic mira: el vigilante abrirá una tarea allá. Nada llega solo
(`vidrio/recetas.css` y el contrato no cambiaron; `alta-parecidas.css` ni viaja ni se mira). A mano, si Dynamic tiene estas piezas: (1) en sus reglas
puras, `flotaSobreOtraSuperficie`; (2) en su `PaginaEstable`, que `contenedorDe` le pregunte con la capa de las listas de su `<Modal>`; (3) las pruebas.
Cambia **cómo funciona** la pieza, no cómo se ve: solo se nota donde una hoja de `<Modal>` sea `position: fixed` y se deslice ella misma. Si el
`<Modal>` de Dynamic no monta `[data-capa-flotante]` como hija directa de su hoja, la seña tiene que ser otra.
