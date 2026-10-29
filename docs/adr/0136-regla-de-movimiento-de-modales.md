# ADR-0136 — Regla de movimiento de los modales del retail

- **Fecha:** 2026-09-19
- **Estado:** Aceptado (Felipe, 2026-09-19: «ese efecto del modal hay que colocarlo como regla para el retail, para que
  si se realizan nuevos modales se sepa qué efecto/animación tomar»). Implementado en el `<Modal>` central: **ya lo
  heredan los 49 modales que lo usan**, sin tocar ninguno.
- **Decide:** Felipe. Arquitectura: este documento.
- **Diseño de referencia:** `docs/maquetas/comprobantes-animaciones-2026-09/comprobantes-vivo.html`
  (`.velo`, `.modal`, `.st`, `@keyframes hoja / velo / sube`).
- **Toca** la regla de movimiento de `app/globals.css` (revisada en ADR-0128: el movimiento responde a una acción o
  acompaña la llegada). No la cambia: la aplica a los modales.

## Contexto — el problema

Cada pantalla que abre un modal necesita saber cómo se mueve. Sin una regla escrita, cada sesión de desarrollo decide sola
—o copia la de la pantalla que tiene a mano—, y el retail termina con modales que entran de tres maneras distintas.
El `<Modal>` real (`components/ui/Modal.tsx`) ya centralizaba el overlay y el foco (Radix Dialog), pero su entrada era
discreta: la hoja subía 8 px con escala .985 y **el contenido aparecía de golpe**. El prototipo aprobado de Comprobantes
se sentía distinto justamente por eso: la hoja sube más, y lo que hay adentro **entra en cascada**, en el orden en que
se lee.

## Decisión — un solo efecto, en un solo lugar

**El efecto lo define `<Modal>` (más `app/globals.css`, sección «REGLA DE MODALES»). Un modal nuevo lo hereda sin escribir
nada; NO define su propia animación de entrada ni reimplementa el overlay.** En orden:

| Paso | Qué pasa | Cómo | Duración |
|---|---|---|---|
| 1 | El velo aparece con desenfoque leve | `anim-velo` (`bg-tinta/35 backdrop-blur-[2px]`) | 220 ms |
| 2 | La hoja sube 18 px y crece de .965 a 1 (escritorio). En móvil sube desde el borde, sin escala | `anim-modal-entra` | 420 ms (380 en móvil), `--ease-cayla` |
| 3 | El contenido entra en cascada: cada pieza sube 10 px y aparece | `cascada-modal` (sobre el panel) | 500 ms por pieza, 55 ms de desfase, empieza 120 ms después de la hoja |
| 4 | Al cerrar, la hoja baja 10 px y se apaga; el velo se apaga | `anim-modal-sale`, `anim-velo-salida` | 220 ms, `--ease-salida` |

- **Qué cuenta como «pieza» de la cascada:** el título, la bajada y los hijos directos del modal; si el modal es un único
  `<form>`, cuentan los hijos del form (el form en sí no se anima: animar el form y sus piezas a la vez multiplica la
  opacidad). Hasta 8 pasos; del octavo en adelante comparten el último desfase.
- **Salirse de la cascada:** `data-sin-cascada` en una pieza (p. ej. una lista larga que ya se anima sola).
- **Movimiento reducido:** todo colapsa a un instante (`prefers-reduced-motion`), incluida la cascada.

### Lo que un modal SÍ puede agregar por su cuenta

Solo respuestas a una acción de la persona, dentro del contenido, nunca la entrada del propio modal: una barra que se
llena (avance), una cifra que cuenta hasta su valor, el «visto» que se dibuja al confirmar (`check-trazo`, `anim-pop`),
una fila nueva que se desliza al entrar a una lista. Siempre con `--ease-cayla`, 200–500 ms, **sin rebote, nunca decorativo y
nunca en bucle**, con dos excepciones que son señal y no adorno: el punto que late en el chip «Vencida» (lo único urgente
se mueve; está en el prototipo aprobado) y el giro del botón mientras la base responde.

### Cómo se hace un modal nuevo

```tsx
<Modal titulo="Pago a Tejidos Rímac" subtitulo="F001-000482 · saldo S/ 3,923.60" onClose={cerrar}>
  {(pedirCierre) => (
    <form onSubmit={…}>   {/* sus hijos entran en cascada, solos */}
      …
    </form>
  )}
</Modal>
```

Un modal que se abre por URL (rutas interceptadas `@modal/(.)…`) usa `<ModalRuta>`, que envuelve a `<Modal>`.

## Alternativas descartadas

- **Que cada modal declare su animación.** Es lo que ya pasaba a pequeña escala y produce inconsistencia; además obliga a
  tocar 49 archivos cada vez que se quiera ajustar el movimiento.
- **Cascada con retardos escritos a mano en cada pieza (`style={{ "--k": n }}`).** Funciona en el prototipo (donde el HTML
  es estático), pero en React obliga a numerar piezas y se rompe al agregar o quitar una. Con `:nth-child` en CSS la
  cascada se calcula sola. Costo aceptado: el orden de la cascada es el orden del DOM, y pasa de 8 pasos plano.
- **Botón X de cierre en todos los modales** (lo trae el prototipo). Cambia la cabecera de 49 pantallas y muchas ya
  tienen «Cancelar»/«Cerrar» en el pie. Queda fuera de esta regla; si se quiere, es una decisión aparte.
- **Animar con una librería (Framer Motion/GSAP).** El sistema ya tiene GSAP para lo suyo, pero un modal se resuelve con
  CSS y sin JavaScript en el camino crítico de abrir una hoja.

## Consecuencias

- Los 49 modales del sistema cambian de sensación de golpe (la hoja sube más y su contenido entra escalonado). Es el
  objetivo, pero conviene un recorrido visual por los más usados (Vender, Caja, Compras) al fusionar.
- **Pendiente de decidir:** cuatro piezas dibujan su propio overlay/animación y NO heredan la regla:
  `ProveedorModal.tsx` y `ProveedorVistaRapida.tsx` (movimiento propio desde ADR-0128), `ConteoPanel.tsx`,
  `ProductosAgrupados.tsx`. Migrarlas a `<Modal>` es trabajo mecánico pero cambia su aspecto; se hace pantalla por
  pantalla con ok de Felipe.
- La regla vive también en `CLAUDE.md` (sección «Movimiento y modales») y en el comentario de cabecera de `Modal.tsx`,
  que son lo primero que lee una sesión nueva.

## Implementación en Comprobantes (misma fecha)

La regla se estrenó en las pantallas de Comprobantes, que fueron el origen del prototipo: lista `/compras`, detalle
(`@modal/(.)factura/[compraId]`), pago (individual y en lote) y registro `/compras/nueva`. Estilos propios en
`app/estilos/comprobantes-{lista,detalle,registro}.css` (importados por `globals.css`), cada uno con su bloque de movimiento reducido.
Lo que esas pantallas agregan encima de la regla son respuestas a acciones (barras que se llenan, cifras que cuentan, «visto» al
confirmar), nunca otra entrada de modal. Dos desviaciones conscientes del prototipo, documentadas: las barras de avance se llenan en
1000 ms (más que los 200–500 de la regla, como en el prototipo y en `.hilo-dibuja`), y el giro del botón mientras la base responde es
la única animación en bucle.

## Segunda pasada de fidelidad (misma fecha)

Felipe comparó la pantalla real con el prototipo y no coincidían. La comparación imagen contra imagen encontró diferencias que una lista de
requisitos no había visto: en **Registrar comprobante**, «Tipo de documento» y «Condición» eran desplegable y subrayado en vez de la píldora
deslizante, «Vence el» desaparecía al contado, «Condición / Vence / Llegada» iban en dos filas y no había «← Comprobantes» ni el avance junto
al título; en el **detalle de factura**, la cabecera era un título chico con una cuadrícula, las tarjetas iban Pago | Recepción (el diseño:
Recepción | Pago) y el pie tenía «Cerrar» en vez de «Registrar pago» como botón principal. Todo se alineó, y la llegada estimada ahora muestra
su valor por defecto (emisión + 7 días) en lugar de un campo vacío. **Lección:** un requisito cumplido en el código no es una pantalla igual
al diseño; se verifica comparando las dos a la misma medida.

## Cómo se verifica

1. Abrir cualquier modal: la hoja sube ~18 px con un leve crecimiento y el contenido va apareciendo de arriba hacia
   abajo (título, bajada, campos, botones). Al cerrarlo baja y se apaga en un instante.
2. Activar «reducir movimiento» en el sistema: el modal aparece de una vez, sin cascada.
3. Un modal cuyo hijo directo es un `<form>` cascadea los campos, no el form entero (sin destellos dobles).

## Actualización 2026-09-26 — Escape: la hoja se cierra solo con un Escape que nadie usó

**El problema.** Dentro de cualquier `<Modal>`, con la lista de un combo abierta, Escape cerraba el MODAL entero y se
perdía lo escrito. Radix escucha Escape en la fase de **captura** del `document`
(`@radix-ui/react-dismissable-layer` 1.1.19), que corre antes de que el evento llegue al control enfocado: el
`stopPropagation()` con que `Desplegable`, `DesplegablePildora` y `ComboResponsable` se quedaban con su Escape llegaba
tarde. Lo mismo le pasaba al buscador de «Registrar nota de crédito» (Escape debía borrar primero lo escrito) y a
`OrdenPanel`, un cajón que arma su propio `Dialog.Content` y trae el combo «Responsable».

**La decisión.** `components/ui/useEscapeLibre.ts`: la hoja no decide en la captura. Su `onEscapeKeyDown` le pide a Radix
que no cierre (`preventDefault`) y marca ese Escape como pendiente; un oyente en `window` lo espera al final del
recorrido. Si llega, nadie lo usó y la hoja se cierra; si un control lo usó y cortó su propagación, la hoja se queda y el
Escape siguiente la cierra. Sirve `window` porque Next hidrata React sobre `document`: el `onKeyDown` de cada control
corre allí y su `stopPropagation()` impide que el evento siga subiendo. Lo usan `<Modal>` (respetando `bloqueado`) y los
seis cajones con `Dialog.Content` propio (las cuatro vistas rápidas, `OrdenPanel` y `ProveedorModal`).

**La regla para un control nuevo** que viva en una hoja: si usa el Escape (cierra su lista, borra su búsqueda),
`e.stopPropagation()`; si no, lo deja pasar. Se ajustaron los que lo usaban sin decirlo: `ComboBuscable`, `CampoFecha`
(además devuelve el foco a la fecha al cerrar desde la grilla) y `MenuAcciones`. `ComboResponsable` devuelve el foco a su
botón al cerrar con Escape y cierra la lista con `Tab` desde el botón, para que no quede abierta con el foco en otro
campo, donde el Escape ya no le llegaría. `lib/hojas-escape.test.ts` falla si un `Dialog.Content` no pasa por
`useEscapeLibre`.

**Descartado.** (1) Revisar en la hoja si hay un disparador con `aria-expanded="true"` y `aria-haspopup` (o
`role="combobox"`) y no cerrar: el buscador de «Registrar nota de crédito» tiene `role="combobox"` con
`aria-expanded` = «hay resultados», y calcula sus resultados aunque su sección esté plegada. Con esa regla, Escape
**nunca** habría cerrado ese modal mientras hubiera facturas, y su «borra primero lo escrito, después cancela el cambio
de factura» igual se perdía con cero resultados. (2) `onKeyDownCapture` en cada combo: depende de que React haya
registrado su oyente en el `document` antes que Radix, y obliga a repetirlo combo por combo. (3) Pasar los seis cajones
a `<Modal>`: es la deuda real con esta regla, pero cambia su aspecto y su entrada; queda fuera de este arreglo.

**Se rompe si** un control usa el Escape sin cortar su propagación (la hoja se cierra con él: el bug vuelve, solo en
ese control), o si un contenedor dentro de una hoja corta la propagación de TODAS las teclas (Escape ya no cerraría
esa hoja). Hoy no hay ninguno: se revisaron los siete `stopPropagation` de teclado de la web y todos son de un control
que usa su tecla.

**Cómo se verifica.** En cualquier modal con combos: escribir algo, abrir un combo, Escape → se cierra solo la lista y
lo escrito sigue; otro Escape → se cierra el modal. Sin nada abierto, un solo Escape lo cierra. Con dos modales
apilados, cada Escape cierra solo el de más arriba. Verificado el 2026-09-26 en un banco de pruebas temporal (todos los
combos, un acordeón, el buscador escalonado, un cajón propio, `bloqueado` y dos modales apilados, en escritorio y a
375 px) y en Catálogo ▸ Atributos ▸ Colores ▸ «+ Agregar color» con sesión real.

## Actualización 2026-09-26 (b) — la lista de un combo no es una pieza de la cascada

La hoja tiene ahora una última hija vacía, `<div data-capa-flotante data-sin-cascada />`, y de ella cuelgan las listas de los
combos (`useDestinoFlotante`). Colgadas directo en la hoja, la cascada las tomaba por contenido: un combo de «Registrar
gasto» tardaba 1 s en verse entero, contra 0,33 s del selector de sede. Detalle, números y lo descartado: ADR-0211,
«Actualización 2026-09-26 (b)». Lo vigila `lib/combos-fuera-de-la-cascada.test.ts`.

**Sin resolver (decisión de Felipe):** la cascada también retrasa lo que aparece DESPUÉS de abrir el modal (hasta ~0,6 s
de espera y 500 ms de entrada). Hoy se esquiva a mano con `data-sin-cascada`, en 14 bloques. Propuesta en el BACKLOG:
limitar la cascada a la entrada de la hoja.

## Actualización 2026-09-30 (c) — una tercera excepción a «nunca en bucle»: el círculo punteado de lo opcional

Felipe pidió que las rayas del círculo punteado que marca un campo **opcional** (la guía de foco, ADR-0284) se muevan en círculo «para que se
note»: quieto, un círculo de rayas se leía como adorno y no como «esto puedes saltarlo». Es la tercera excepción y, como las otras dos, es una
**señal y no un adorno**: dice el estado de un campo. Los límites que no cambian:
- **Solo esa marca** (`.hilo-marca[data-estado="opcional"]`, `app/estilos/alta-guia.css`): una vuelta cada 8 s, lineal, sin rebote, sin
  desfase ni brillo. Nada más de la guía entra en bucle (el pulso de «sigue aquí», el ✓ y el destello siguen siendo de una sola vez).
- **Con `prefers-reduced-motion` queda quieto.**
- Al pasar el campo a «hecho», «sigue aquí» o «falta», la marca se vuelve a montar con su estado y deja de girar.
- Se anima con `transform`, que no repinta ni recalcula el layout: decenas de marcas a la vez (un alta con muchos campos opcionales) no pesan.
Si en una pantalla con muchos opcionales el movimiento cansa, lo siguiente es bajar la velocidad o girar solo el campo que sigue, no quitarlo.

## Actualización 2026-10-01 (d) — la persiana de «Caja cerrada»: un rebote y tres bucles, con nombre propio

Felipe eligió la maqueta B de «Vender con la caja cerrada» (ADR-0301, `docs/maquetas/caja-cerrada-2026-10/`) sabiendo que traía
movimiento fuera de esta regla. Quedan como excepciones **solo de esa pieza** (`components/punto-de-venta/CajaCerrada.tsx`,
`app/estilos/caja-cerrada.css`); no se copian a otra pantalla:
- **Un rebote amortiguado, una sola vez:** el cartel «Cerrado» cae colgado de su clavo y se mece hasta quedar quieto.
- **Tres bucles mientras la caja sigue cerrada:** el punto rojo del cartel que late (señal, como el del chip «Vencida»), un
  reflejo que cruza la persiana cada 8 s y el cartel que se mece ±0,9°. Se paran en cuanto la caja abre.
- **Con `prefers-reduced-motion`, nada de eso:** la capa aparece y desaparece sin movimiento.
Por qué se acepta aquí: no es un modal ni una respuesta a una acción. Es un estado de la tienda que tiene que leerse de lejos y
sin leer («la tienda está cerrada»), y que dura lo que tarda alguien en abrir la caja.

## Actualización 2026-10-01 (e) — `<Modal lateral>`: la foto de la prenda a la izquierda de la hoja

Felipe pidió que Reponer, Subir a almacén y Ajustar inventario muestren la **foto de la prenda** a un costado: más intuitivo, y no deja
duda de sobre cuál prenda se está operando. El `Modal` gana una opción, `lateral`, que pone algo a la izquierda de toda la hoja (título,
bajada y contenido quedan a su derecha, igual que antes).
- **La hoja crece justo lo que ocupa el costado y el resto no se mueve:** `.hoja-con-lateral` (`app/globals.css`) suma al máximo de la hoja
  el ancho del costado (11 rem) y su separación (1,25 rem), y el relleno izquierdo lo absorbe. Medido en el navegador: la columna de la
  derecha queda en 334 px en Reponer y Subir (antes 336) y en 400 px en Ajustar (como `max-w-md`). Va en **`@layer utilities`** (no en `components`, ADR-0105): tiene que ganarle a `p-6` y
  `max-w-*`, y lo hace por especificidad (dos clases por selector). Funciona con `ancho` = `max-w-sm | md | lg`.
- **Movimiento:** ninguno propio. El costado va con `data-sin-cascada`, llega con la hoja y se coloca con `position: absolute`, así que no
  corre el orden de la cascada. La hoja nunca es más baja que la foto (`min-height`).
- **Solo escritorio (≥ 640 px):** en celular, donde la hoja sube desde abajo, el costado no se muestra (no se probó ahí, a pedido).
- **La pieza:** `components/ui/FotoDePrenda.tsx` (3:4, recortada con `object-cover`; sin foto, el isotipo y un punto con el color).
- **Ajustar sin foto cuando quien lo abre no la tiene:** la ficha del producto en edición (`AjusteDeStock`) no sabe la foto del color, así
  que ahí la ventana va como antes (`PrendaAjuste.fotoUrl` indefinido = sin costado).

## Actualización 2026-10-01 (f) — la página pública del Club CAYLA tiene su propio movimiento

**Alcance:** esta regla gobierna el ERP (lo que usa el equipo). La página a la que llega una clienta al escanear el cartel del
club (`/club/<tienda>`, ADR-0288 act. g e i) es una pieza de marca para clientas, y Felipe aprobó el 2026-10-01 un movimiento
más vistoso: el colibrí que entra volando y queda flotando, el hilo rojo que se dibuja, tarjetas que suben en cascada, un
destello y un latido en el botón principal, pétalos que caen una vez y la tarjeta de socia que entra girando.
- **Lo que se mantiene:** sin rebotes exagerados; cada efecto pasa una o dos veces y se detiene; el único bucle es el colibrí
  flotando; colores solo con tokens; con `prefers-reduced-motion` todo se apaga y cada pieza queda en su estado final.
- **Dónde vive:** `apps/web/app/estilos/club-publico.css` (sus `@keyframes`), sin tocar la «REGLA DE MODALES» de
  `globals.css`. No se copia a pantallas del ERP.

## Actualización 2026-10-03 — el Observatorio del Admin: tres bucles que son señales

- **Qué:** el Inicio del Admin (ADR-0322) repite tres cosas mientras está a la vista: el **latido** de una tienda con su caja abierta,
  el **cometa** que recorre el arco de un traslado en camino y el **halo** que respira alrededor de un aviso urgente.
- **Por qué se admiten:** cada uno dice algo que cambia («esta tienda está operando», «esto viene en camino», «esto no espera»); se
  apagan solos cuando la señal deja de ser cierta. Nada más del Observatorio se repite.
- **Dónde vive:** `apps/web/app/estilos/observatorio.css`; con `prefers-reduced-motion`, los tres se detienen.

## Actualización 2026-10-05 — la vista rápida de producto: la única hoja con movimiento rico

- **Qué:** Felipe pidió «todas las animaciones posibles» para la vista rápida de producto (Catálogo ▸ Productos ▸ Grilla, maqueta A «Matriz»,
  `docs/maquetas/catalogo-modal-producto-2026-10/`). Es la **única hoja del ERP** con movimiento más allá de la cascada de esta regla, y es una
  decisión suya, no un descuido: una prenda es lo más visual que tiene el sistema y es lo que más se abre en el piso.
- **Qué se permite, y solo en esa hoja:** el título que se barre de izquierda a derecha; los datos que suben en cascada; la foto que «se asienta»
  con un destello que la cruza una vez; las celdas de la matriz en **ola diagonal** (cada una a su hora, con su barra que se llena y su cifra que
  cuenta justo cuando aparece); la foto que cruza y se asienta al cambiar de color; la **cruz** (al pasar el mouse por una celda se alumbra su fila
  y su columna y el resto baja); el check y la onda al elegir; el texto del botón de etiquetas y el de la cabecera que cambian deslizándose; el
  paralaje de ±6 px de la foto y un brillo tibio que sigue al puntero sobre la matriz (estos dos solo con mouse).
- **Lo que NO cambia (los límites son los de siempre):** `--ease-cayla`; **nada con rebote; nada en bucle** (medido: 0 animaciones infinitas);
  ninguna dura más de ~1,3 s en total (la ola de 45 celdas es la más larga); colores solo con tokens; y con `prefers-reduced-motion` todo se apaga
  (los efectos que siguen al puntero ni siquiera se montan: `hayPunteroFino()`). Las opacidades y transformaciones usan `backwards`, no `both`,
  para que el hover pueda mover después lo que la entrada movió. El destello de la foto tiene su estado de reposo FUERA de la foto: con
  `backwards`, lo que no es el reposo reaparece al terminar (un destello cuyo reposo es «visible» se queda pegado).
- **Por qué no se generaliza:** otra hoja que quiera lo mismo lo pide con Felipe y se agrega aquí con su alcance. La regla de arriba sigue
  siendo la de todos los demás modales.
- **Dónde vive:** `apps/web/app/estilos/vista-rapida.css` (clases `vr-*` y sus `@keyframes`, en `@layer components`) y
  `components/vista-rapida/` (`VistaRapidaProducto`, `MatrizUnidades`, `FotoVistaRapida`, `movimiento.ts`). Lo único que toca el sistema de modales
  es `<Modal conCerrar tituloGrande>` (dos opciones nuevas y opcionales: la ✕ visible y un título de 26 px), que no mueve a ningún otro.

## Actualización 2026-10-05 (b) — Movimientos: el sello de cada tipo y su trayecto

- **Qué:** en Movimientos (ADR-0353) cada fila lleva el sello de su tipo, cuyo ícono se mueve **una vez** al entrar a la vista y otra al pasar el mouse por la
  fila (la bolsa sube, la caja levanta su tapa, el paquete cae, el camión llega…), y un trayecto «Piso → Cliente» con una prenda que viaja de un punto al otro.
  El **perchero de la colgada se mece** (un péndulo que se asienta, como el cartel de ADR-0301). También cuentan los números de los botones de tipo y se llenan
  sus barras, las franjas del día suben y las capas del mazo se abren en abanico.
- **Por qué se admite:** Felipe pidió que se distinguiera «de un vistazo» una venta, una colgada y una guardada, y el movimiento es parte de cómo se reconoce cada una. Es
  una decisión suya, no un descuido.
- **Los límites son los de siempre:** `--ease-cayla`, **nada en bucle, nada con rebote**, colores solo de la paleta, y con `prefers-reduced-motion` todo se apaga.
  Corre al **verse**, así que filtrar una lista nueva vuelve a mover sus sellos (la regla de «buscar o filtrar no re-anima toda la tabla» no se cumple aquí a
  propósito: cada fila nueva es una fila que aparece).
- **Dónde vive:** `apps/web/app/estilos/movimientos-sellos.css` (clases `mv-*`) y `components/movimientos/`. No se generaliza.

## Actualización 2026-10-06 — Nuevo producto: el punto del paso abierto late

- **Qué:** en los puntos de avance de Nuevo producto (ADR-0260, act. 2026-10-06) el punto del paso donde está la persona **late todo
  el tiempo**: su centro respira (1,8 s) y de él salen dos ondas suaves alternadas (2,4 s). Al llegar a un paso, su punto crece desde
  chico (500 ms); el ✓ de un paso terminado se dibuja una vez y la línea verde corre al punto siguiente (700 ms).
- **Por qué se admite el bucle:** Felipe lo pidió así («todo el tiempo late») después de ver la versión quieta: el latido dice dónde está
  la persona, no decora. Es la misma clase de señal que el punto que late en el chip «Vencida».
- **Los límites:** `--ease-cayla`, nada con rebote, solo tokens (`verde`, `crema`, `sand`, `tinta`), y con `prefers-reduced-motion`
  el latido, las ondas y las entradas se apagan (el punto queda verde y quieto).
- **Dónde vive:** `apps/web/app/estilos/puntos-avance.css` (clases `puntos-*`). No se generaliza: otra pantalla que quiera un paso que
  late lo pide con Felipe y se agrega aquí.

## Actualización 2026-10-06 (b) — Análisis: los gráficos se arman una vez al entrar a la pestaña

- **Qué:** en Análisis (ADR-0357), al entrar a una pestaña:
  - las piezas suben en cascada (`.entra`: 380 ms, 55 ms entre una y otra, hasta la octava);
  - las barras crecen desde su base (`.cx`, `.cxd`, `.cy`: 700 ms);
  - las perchas y los puntos asoman (`.po`: 520 ms);
  - los arcos de los anillos se dibujan (`.arco`: 900 ms);
  - las cintas del flujo «Qué hacer hoy» se tienden, primero las que llegan a la tienda y después las que salen (650 ms cada una);
  - las cifras cuentan desde 0 (700 ms).

  Además, al llegar desde Hoy a un grupo de un carril, ese grupo destella una vez (1,1 s), y el subrayado de las pestañas se desliza (260 ms).
- **Una sola vez:** la pantalla pone `.anim` al entrar a la pestaña y la quita a los 2 s. Buscar, filtrar o mover «Liquidar desde» no vuelve a
  animar. La ficha de la prenda y la hoja «Datos confiables» son `<Modal>`: entran con la cascada de esta regla, y sus gráficos se arman una vez
  al abrirse.
- **Por qué se admite:** Felipe aprobó la maqueta con su movimiento (2026-10-06). Un gráfico que se arma se lee (la barra crece hasta su valor), y
  una sola vez no distrae. Es una decisión suya, no un descuido.
- **Los límites son los de siempre:** `--ease-cayla`, nada en bucle, nada con rebote, ninguna pieza dura más de 1,2 s, solo tokens y
  `@layer components`. Con `prefers-reduced-motion` nada se mueve y las cifras aparecen en su valor. Lo vigila `lib/analisis-movimiento.test.ts`
  sobre todas las hojas `app/estilos/analisis*.css`.
- **Dónde vive:** `apps/web/app/estilos/analisis.css` (sus `@keyframes an-*`) y las hojas de cada pestaña (`analisis-hoy.css`,
  `analisis-acaba.css`, `analisis-quieta.css`, `analisis-pedir.css`, `analisis-ficha.css`). Las cifras que cuentan, en
  `components/analisis/AnalisisPantalla.tsx` (`data-cuenta`). No se generaliza: otra pantalla que quiera lo mismo lo pide con Felipe y se agrega
  aquí.
- **Los puntos del flujo (Felipe, 2026-10-06, después de verlo):** al pasar el mouse (o el foco) por un camino de «Qué hacer hoy», corren puntos
  del color del camino por su cinta: de la Compra hacia «Tu tienda», y de «Tu tienda» hacia la otra tienda o hacia «Liquidar», para que se lea
  hacia dónde van las prendas. Es la **única pieza de Análisis que se repite**, y solo mientras el mouse o el foco está encima: al salir, los
  puntos se van. Velocidad pareja (1,6 s por cruce, sin curva: es un flujo, no una entrada), de 3 a 6 puntos según el grosor, en dos carriles
  fuera de la pastilla «N prendas». Con `prefers-reduced-motion` no se dibujan. Vive en `PuntosCinta` (`components/analisis/PestanaHoy.tsx`,
  con `<animateMotion>` de SVG) y la geometría en `ejeCinta` / `carrilesDeCinta` / `puntosDeCinta` (`lib/analisis-hoy.ts`); lo vigila
  `lib/analisis-movimiento.test.ts` (ningún otro `repeatCount="indefinite"` en Análisis).

## Actualización 2026-10-06 (c) — el aviso de cierre de caja (Marcador): dos bucles decorativos que Felipe eligió

- **Qué:** el aviso de cierre de caja de la cabecera (ADR-0359, antes la «Isla» de ADR-0305) repite tres cosas mientras está a la
  vista: unas **ondas** que salen sin parar desde la hora de cierre (la misma onda de cuando sube de nivel; es una señal: «ya es la hora»),
  un **resplandor** que deriva lento hacia los lados (8 s) y un **destello** que cruza la cápsula cada 6 s solo en «sin cerrar».
  Se suman al punto que late de siempre.
- **Por qué se admiten:** Felipe vio la maqueta con ambos y la eligió («Completo»); el resplandor además es parte de lo que pidió que
  fuera más notorio en rojo. A diferencia de las otras excepciones, son de ambiente y no señales: si se prefiere el modo «Sobrio», se
  quitan sin perder información (el color del nivel, las paletas y la pestaña dicen lo mismo).
- **Los límites:** `--ease-cayla`, sin rebote, solo tokens, y con `prefers-reduced-motion` se detienen. En celular el resplandor es corto y suave.
- **Dónde vive:** `apps/web/app/estilos/recordatorio-cierre.css` (`.rcc-aurora`, `.rcc-caps::before`).

## Actualización 2026-10-07 — la mesa de Ventas sin registrar (ADR-0360): movimiento rico, elegido por Felipe

- **Qué:** en `/inventario/por-regularizar` (maqueta A2 «Puente») el talón elegido se adelanta y su hilo se dibuja hasta el puente; la cuerda se traza y
  los tres visitos (prenda, talla, color) entran en cascada; la balanza de precio se llena; las tarjetas de prendas suben una a una y se levantan
  al pasar el mouse; y al guardar las dos mitades del puente se juntan, cae el sello «Regularizada» y el talón se pliega.
- **Por qué se admite:** Felipe pidió «muchas animaciones» para esta pantalla y eligió la maqueta con su movimiento (2026-10-07). Cada efecto
  responde a algo que la persona hizo (elegir, pasar el mouse, guardar): ninguno es decorativo ni corre solo.
- **Los límites son los de siempre:** `--ease-cayla`, nada con rebote, **nada en bucle** (salvo el punto de «Vencida», que late tres veces como el
  del chip), cada efecto una vez, solo tokens y `@layer components`. Con `prefers-reduced-motion` todo queda quieto y los trazos aparecen ya dibujados.
- **Dónde vive:** `apps/web/app/estilos/ventas-sin-registrar.css` (sus `@keyframes vsr-*`) y los hilos en `components/por-regularizar/HilosMesa.tsx`
  (SVG medido en el DOM). No se generaliza: otra pantalla que quiera lo mismo lo pide con Felipe y se agrega aquí. La hoja del celular es un
  `<Modal>` y entra con la cascada de esta regla.


## Actualización 2026-10-09 — el gasto rápido de Caja (ADR-0368): movimiento rico, pedido por Felipe

- **Qué:** en `components/GastoRapidoModal.tsx` (Caja ▸ Registrar gasto) el mosaico entra en ola (cada baldosa 34 ms después de la anterior);
  la ★ de lo más frecuente llega girando y se rellena, y sus «12 veces» cuentan desde cero; al tocar una baldosa la tinta se derrama desde el
  punto del clic y su ícono se vuelve a trazar; la línea «Va a …» sube cada vez que cambia; «Otro» y «¿Te dieron factura o boleta?» se abren
  midiendo su alto; los montos de siempre entran en cascada; la cifra del botón «Registrar S/ 0.80» sube al cambiar; y al guardar se dibuja un
  sello (aro y check) con el monto, DESPUÉS del loader (ADR-0149), antes de cerrarse.
- **Por qué se admite:** Felipe pidió «full animaciones para que sea sofisticado» (2026-10-09). Cada efecto responde a algo que la persona hizo o
  a la entrada de la hoja; ninguno corre solo.
- **Los límites son los de siempre:** `--ease-cayla`, sin rebote, **nada en bucle**, solo tokens y `@layer components`. Con
  `prefers-reduced-motion` todo queda quieto, los trazos aparecen dibujados y las veces llegan de una.
- **Dónde vive:** `apps/web/app/estilos/gasto-rapido.css` (sus `@keyframes gr-*`) y la cuenta de las veces en `useCuenta` del mismo componente.
  No se generaliza.


## Actualización 2026-10-13 — el login «El vuelo vivo»: el colibrí que cose las sedes, pedido por Felipe

- **Qué:** en `/login`, en pantalla ancha, el colibrí rojo aparece en Trujillo dibujándose trazo a trazo y aleteando (el ala sube y baja
  desde el hombro); salta a Arequipa y a Lima, flota un instante en cada una y la «cose» (el ojal se rellena y suelta una onda); da la vuelta,
  crece, cruza por detrás del lema y tiñe «transforma.» de rojo al pasar; llega a su lugar, flota, da dos aleteos que se apagan hasta quedar
  en la pose exacta del logo y el hilo punteado da un último tirón. Se voltea con suavidad cuando vuela a la izquierda y se ladea al subir
  (nunca más de 22°). Dura 4,3 s. En el celular no hay panel ni vuelo: el formulario con la marca arriba.
- **Por qué se admite:** es la única pantalla que ve todo el que entra y la puerta de la marca. Felipe pidió que el login «no sea tan simple»,
  eligió la maqueta C2, pidió «que el colibrí haga el recorrido hasta llegar a su posición» y después «una mejor animación», y eligió la C4
  mirando el video (2026-10-13). Es decorativo, y por eso queda escrito como excepción: no corre sobre nada que la persona tenga que leer
  para trabajar, y el formulario se puede llenar mientras vuela.
- **Los límites:** una sola vez al entrar, sin rebote (los ritmos `ritmoDelVuelo` y `ritmoDelSalto` están probados: nunca se pasan ni
  retroceden). El aleteo y el mecerse se repiten mientras vuela, pero **se detienen al llegar**: nada queda moviéndose. Solo tokens. Con
  `prefers-reduced-motion`, o si la ventana cambia de tamaño a medio vuelo, se ve terminado (ave en su lugar, hilo y palabra completos).
- **Dónde vive:** la geometría del ala, el recorrido, la línea de tiempo y el teñido en `apps/web/lib/login-vuelo.ts` (con su prueba, que
  además exige que el ave sea la misma de `IsotipoCayla`), el panel en `components/login/PanelVuelo.tsx` y los estilos en
  `app/estilos/login.css`. Maqueta: `docs/maquetas/login-2026-10/` (`?v=C4`; la C2 queda para comparar). No se generaliza.

## Actualización 2026-10-13 (b) — la entrada al ERP «El colibrí se abre», pedida por Felipe

- **Qué es:** al iniciar sesión, el colibrí del login cruza al centro de la pantalla, el fondo se oscurece (como la mitad de la marca) y, en el
  centro, se abre una ventana con la forma del propio colibrí que deja ver la pantalla de destino de verdad; luego el ave se agranda hasta
  salirse y la ventana la sigue hasta cubrir todo (≈3,5 s desde el clic). Si la pantalla de destino todavía no cargó, el ave flota en el centro
  aleteando y la ventana espera (no abre un vacío).
- **Por qué se admite:** Felipe lo pidió («que el colibrí se coloque en el centro y se agrande hasta que aparece la pantalla de después de iniciar
  sesión») y eligió la maqueta mirándola (`docs/maquetas/login-entrada-2026-10/`). Corre una sola vez, al entrar, sobre nada que haya que leer.
- **Los límites:** una sola vez, sin rebote ni bucle (mismos ritmos que el vuelo del login; el aleteo se apaga en la pose del logo al terminar). Solo
  se dispara al iniciar sesión (no al recargar ni al cambiar de sede). Solo tokens (`tinta-fija`/`papel`, `rojo`). Con `prefers-reduced-motion`
  **no empieza**: el login entra como siempre. Mientras dura, la capa frena clics y teclas (no se inicia sesión dos veces) y el loader general
  (ADR-0149) se aparta: el vuelo ocupa su lugar. Se deshace sola (velo que se va en 300 ms) si te devuelven al login con un motivo
  (`?error=`) o si la pantalla tarda más de 15 s.
- **Dónde vive:** la geometría, la línea de tiempo y la espera en `apps/web/lib/login-entrada.ts` (con su prueba, que además mide que la silueta cubre
  la pantalla de 375×812 a 1920×1080), el estado en `lib/entrada-estado.ts`, la capa en `components/login/EntradaColibri.tsx` (montada una vez en
  `app/layout.tsx`, como el loader, para sobrevivir a la navegación) y los estilos `.entrada-*` en `app/estilos/login.css`. No se generaliza.
- **Lo que no hace (decidido):** no encoge la pantalla de verdad dentro de la ventana (como sí lo hace la maqueta): se ve a su tamaño, recortada por la
  silueta que crece. Encogerla exigía transformar el contenido real y movería los elementos `fixed` (menú lateral, cabecera) hasta el último cuadro.

## Actualización 2026-10-13 (c) — la salida «El colibrí se abre» al revés (versión B), pedida por Felipe

- **Qué es:** al apretar **Salir**, la entrada pero al revés y más rápido (~2,2 s sin esperas): la ventana con forma de colibrí, que cubre la pantalla que se deja, se
  encoge sobre el colibrí y se cierra; con el fondo oscuro, el colibrí flota en el centro mientras se cierra la sesión y carga el login; cuando el login está
  listo, el colibrí vuela a su lugar (se mide en ese momento, no se supone) y el fondo oscuro se va. El login llega ya terminado, con su colibrí en su lugar: el
  vuelo propio del login no corre (`PanelVuelo` lee `data-entrando`), y la capa aterriza sobre él sin salto.
- **Por qué se admite:** Felipe pidió «un efecto similar al de iniciar sesión pero al revés», recibió tres versiones en la maqueta (A espejo 3,8 s · B espejo rápido
  2,2 s · C cortina y vuelo 1,5 s) y eligió la B mirándolas. Una salida se repite a diario: por eso la rápida.
- **Los límites:** los de la entrada (una vez, sin rebote ni bucle, solo tokens, sin empezar con `prefers-reduced-motion`: `Salir` cierra la sesión como siempre) y
  además: el loader general se aparta mientras dura; la sesión se cierra RECIÉN con la ventana cerrada (no al hacer clic), con la marca de «salida propia» de
  ADR-0309; un segundo clic o tecla sobre Salir no inicia otra; si el login no carga en 15 s o no hay colibrí a la vista, el velo se va en 300 ms y la persona queda
  fuera de sesión como al salir normal.
- **Dónde vive:** `estadoDeLaSalida` y `msCorridosDeLaSalida` en `lib/login-entrada.ts` (es `estadoDeLaEntrada` con el tiempo corrido hacia atrás: no hay otra
  coreografía; con su prueba), `iniciarSalida` y `medirAveDelLogin` en `lib/entrada-estado.ts`, la misma capa `components/login/EntradaColibri.tsx` y el botón en
  `components/LogoutButton.tsx`. Maqueta: `docs/maquetas/login-entrada-2026-10/` (`?modo=salir&s=B`). No se generaliza.
- **Lo que no hace:** igual que la entrada, la pantalla que se deja no se encoge de verdad: la silueta la va recortando.

## Actualización 2026-10-13 (d) — el saludo de la entrada y la salida, pedido por Felipe

- **Qué es:** mientras el colibrí flota en el centro, un saludo bajo él: **«Bienvenido(a)» y el nombre** al entrar, **«Hasta luego» y el nombre** al salir. Una persona se saluda por su
  nombre de pila; una terminal (ADR-0162), por el nombre completo del aparato («Terminal Ventas TRU»). Es el diseño B de la maqueta: la frase pequeña en versalitas y el nombre grande en
  serif cursiva y rojo, sobre el velo oscuro (crema fija en los dos temas).
- **Por qué se admite:** Felipe lo pidió como un «plus», eligió el texto corto y el diseño B mirando la maqueta (`docs/maquetas/login-entrada-2026-10/`). Es texto que se lee en una pausa, no
  movimiento continuo: asoma, se queda y se va una sola vez (misma curva `ritmoDelVuelo`, sin rebote). No es un aviso (no pide nada ni se cierra).
- **La pausa:** para que alcance a leerse, el colibrí flota en el centro **al menos 450 ms** (`PAUSA_MINIMA_EN_EL_CENTRO`) aunque la pantalla de destino cargue al instante: la entrada y la salida
  duran ese tiempo más. Es un mínimo: si la pantalla tarda, flota lo que haga falta. El aleteo NO se detiene en la pausa (corre con el tiempo real).
- **De dónde sale el nombre:** al salir, de `persona.nombre` que el menú ya tiene (`AppShell` → `LogoutButton`); al entrar, de `fn_persona_actual_resumen()` y `fn_mi_terminal()` pedidas apenas se abre la
  sesión, con un tope de 4 s (si falla o tarda, el saludo va sin nombre y la entrada no se retrasa). El nombre se escribe con `textContent`, nunca como HTML.
- **El texto:** «Bienvenido(a)» lo pidió Felipe literal; no se adivina el género a partir del nombre (regla del vocabulario del ERP).
- **Dónde vive:** el texto y las curvas en `lib/login-saludo.ts` y `lib/login-entrada.ts` (`instanteParaSeguir`, `opacidadDelSaludo`; con su prueba), el nombre en `lib/entrada-estado.ts`
  (`ponerNombreDelSaludo`), el dibujo en `components/login/EntradaColibri.tsx` y los estilos `.entrada-saludo*` en `app/estilos/login.css`.

## Actualización 2026-10-13 (e) — al entrar ya no «se ve el inicio»: la pantalla de destino espera tras el velo, reportado por Felipe

- **El problema:** Felipe vio «un pequeño parpadeo muy breve y se ve el inicio» al iniciar sesión. Medido cuadro por cuadro (versión de producción local, 120 ms de latencia
  simulada) eran **dos** parpadeos con la misma cara: (1) el login navegaba a `/` y el Inicio redirigía en el servidor; una redirección desde una página no se salta el paso, así
  que Next pintaba `/` —la app con «Inicio» marcado en el menú— y recién después pedía el destino (8 a 17 cuadros, casi sin velo, en una cuenta cuya pantalla principal no es el
  Inicio, una terminal de ventas o CAYLA Global); y (2) la pantalla de destino llegaba antes de que el velo de la entrada tapara (entra de 250 a 1000 ms y es casi transparente
  su primer medio segundo), así que se veía —también el Inicio de quien aterriza ahí— antes de que la ventana del colibrí la abriera (27 a 39 cuadros, en todas las cuentas).
- **Lo que se hace:** (1) el login pregunta primero a `/api/aterrizaje` a dónde entra la cuenta (`aterrizajeDe`, la regla del Inicio, que ahora incluye la de CAYLA Global y el
  Admin: una sola para los dos) y navega UNA vez, directo, con `router.replace` y sin `router.refresh()` (era otro viaje a `/`, descartado pero pagado); (2) la pantalla de
  destino se pide de inmediato pero **no se muestra hasta que el velo tapa** (`veloCubre`): `EsperaAlVelo`, montada en el layout de la app por encima de todo `loading.tsx`,
  suspende mientras tanto y React deja el login a la vista (la navegación es una transición). Resultado medido: 0 cuadros en `/` y 0 con la app a la vista antes de la ventana,
  con la ventana abriéndose a los mismos ~1,8 s; sin animación, Existencias llega en 0,47 s en vez de 1,46 s.
- **Lo que se descartó:** esperar al velo para *pedir* la pantalla (la primera versión): limpio, pero alargaba la entrada 0,2–0,45 s, porque el servidor empezaba recién al
  segundo. Tapar el cambio con un velo que salta a negro de golpe: otro parpadeo, a oscuras.
- **Los límites:** la espera es UNA promesa por entrada y se suelta sola al tope (`MS_TOPE_DEL_VELO`, 1,5 s: pestaña en segundo plano), si la entrada se deshace o en la salida
  (no espera nada); con `prefers-reduced-motion` no hay entrada ni espera, y el loader (ADR-0149) cubre desde que se abre la sesión hasta la pantalla de destino (el login toma
  su ficha con `useEsperando`). Si `/api/aterrizaje` falla o tarda más de 5 s, el login entra por `/` como antes: el parpadeo vuelve, nunca una pantalla equivocada.
- **Dónde vive:** la espera en `lib/entrada-estado.ts` (`veloPendiente`, `marcarVeloCubierto`; con su prueba), el umbral en `lib/login-entrada.ts` (`veloCubre`,
  `MS_TOPE_DEL_VELO`), `EsperaAlVelo` y el aviso de la capa en `components/login/EntradaColibri.tsx`, la consulta en `app/api/aterrizaje/route.ts` y lo que el login hace con
  su respuesta en `lib/login-aterrizaje.ts`.

## Actualización 2026-10-15 — Aventurero: el gato que teclea en «Sin acceso» y en los errores, pedido por Felipe

- **Qué:** las pantallas donde la persona NO llega a lo que buscaba —«Sin acceso» (su rol no ve el módulo, o no ve ninguna pantalla) y las
  cuatro barreras de error (la de la app, la de una vista de Facturación y la global)— abren con un meme: la foto de Aventurero, un gato
  naranja con las patas en el teclado, y en letra de meme (Impact, o Anton donde no hay Impact) «Aventurero decidió / que no puedes ver
  esto» o «Aventurero lo está dando todo / para solucionarlo». Sus **patas se mueven en bucle**: en un error teclea apurado, las dos por
  turno (un golpe cada ~0,4 s); en «Sin acceso» da dos toques con la de atrás, levanta la de adelante, la sostiene y la deja caer (el Enter
  de quien decidió), y descansa casi 2 s antes de repetir.
- **Por qué se admite:** lo pidió Felipe («que le animes las patas al gatito»). Es adorno, no señal: quitarlo no pierde información, porque
  lo que hay que hacer (reintentar, a quién pedir el acceso, el código del error) lo sigue diciendo el texto de la tarjeta, que no cambió.
  Lo que sí cambió: «Sin acceso» de una cuenta que no ve NINGUNA pantalla ya no ofrece «Volver al inicio» (el Inicio la devolvía ahí), sino
  «Ya me lo activaron», para entrar después de que un líder le active algo.
- **Cómo se mueve sin deformar la foto:** cada pata es la misma foto otra vez, recortada por una elipse difusa que no se mueve, y girada
  3–4,5° desde su codo: dentro de la elipse la pata se levanta y deja ver el teclado; fuera, la foto sigue quieta. Sube con la curva de
  entrada (--ease-cayla) y cae con la de salida (--ease-salida); nunca baja de donde estaba, así que no hay rebote.
- **Los límites:** sin rebote, solo los dos colores fijos (`tinta-fija`, `crema-fija`: el texto va sobre una foto, igual en claro y en
  oscuro), y con `prefers-reduced-motion` el gato se queda quieto.
- **Dónde vive:** `apps/web/components/ui/Aventurero.tsx`, `apps/web/app/estilos/aventurero.css` (que también importa `global-error.tsx`,
  pintada sin globals.css) y la foto en `apps/web/public/aventurero.webp` (recortada para que el texto no tape al gato; la pantalla del
  monitor y el teléfono no se leen a ese tamaño).

## Actualización 2026-10-22 — la hoja del celular: llega desde el borde, se baja con el dedo y aleja lo de atrás (ADR-0479)

- **Qué cambia, solo bajo 640 px:** el paso 2 de la tabla («en móvil sube desde el borde») ahora es literal: la hoja de `<Modal>` y de
  `<Cajon>` llega desde el borde de abajo (`cayla-hoja-movil-entra`, 460 ms) y se va entera (`cayla-hoja-movil-sale`, 300 ms). Antes subía
  24 px con un fundido. Tiene asa, sigue al dedo y, al soltarla, va a su punto en 180–420 ms según la velocidad del dedo.
- **Lo de atrás se aleja** (la «B» que eligió Felipe): la cabecera, el contenido y la persiana de Caja cerrada se alejan a 0,92 mientras la
  hoja está abierta y vuelven al ritmo del dedo. Es parte del movimiento de la hoja, no adorno suelto: dice que la pantalla sigue ahí.
- **Lo que no cambia:** el velo, la cascada del contenido (los mismos 55 ms), la salida corta, el escritorio entero y la cámara. Sin rebote:
  tirada más arriba de abierta, la hoja resiste y se frena, nunca vuelve pasándose. Sin bucle. Con `prefers-reduced-motion` la hoja aparece
  y se va de una y lo de atrás no se mueve; el dedo la sigue igual (es el dedo, no una animación).
- **Detalle, números y verificación:** `docs/adr/0479-la-hoja-del-celular-viva-y-con-profundidad.md` y `docs/unificar/hoja-movil.md`.

## Actualización 2026-10-22 — Catálogo ▸ Insignias (se llamó «Sellos» hasta el 2026-10-23), la billetera de pases (ADR-0481), pedido por Felipe

- **Qué:** el sello de tinta se estampa al aparecer (baja, gira a su lugar y deja un anillo de tinta que se abre), el pase se abre y se cierra
  (su cuerpo baja de 0fr a 1fr y lo de adentro entra en cascada), el pase cerrado sube 8 px al pasar el mouse, el título del pase abierto sube
  por su ranura, la frase y las prendas entran en cascada, las cifras cuentan desde cero (`CifraQueCuenta`) y el visto de «Lo que ya tiene» se
  dibuja.
- **Por qué se admite:** Felipe pidió «sofisticado, elegante y con full animaciones» y eligió esta maqueta entre seis (docs/maquetas/sellos-2026-10/).
- **Los límites:** todo corre UNA vez, con `--ease-cayla`, sin rebote, solo tokens del tema, y con `prefers-reduced-motion` todo queda quieto.
  **Nada en bucle:** el punto que respiraba junto a «rige hoy» en la maqueta no entró; un bucle nuevo es otra decisión de Felipe.
- **Dónde vive:** `apps/web/app/estilos/sellos.css`, `components/sellos/` y lo vigila `lib/sellos-movimiento.test.ts`.

## Actualización 2026-10-23 — la hoja «Configuración» de una campaña, la etiqueta viva (ADR-0488), pedido por Felipe

- **Qué:** el hilo de la etiqueta se dibuja y la etiqueta baja y se asienta al abrir la hoja, el descuento de la etiqueta entra subiendo cada
  vez que cambia, las casillas de las categorías entran en cascada, cada pieza del mosaico aparece, la categoría que se marca vuela de su
  casilla a su pieza (el vuelo de «Prendas») y, al guardar, el sello de la campaña se estampa sobre la etiqueta (`SelloTinta`, el de Insignias)
  antes de que la hoja se cierre.
- **Por qué se admite:** Felipe pidió «elegante, sofisticado y con full animaciones» y eligió la «II · La etiqueta» mirándola
  (docs/maquetas/campana-configuracion-2026-10/), con «ricas, una vez, sin bucle».
- **Los límites:** todo corre UNA vez, con `--ease-cayla`, sin rebote, cada pieza en 1,2 s o menos, solo tokens del tema, y con
  `prefers-reduced-motion` todo queda quieto (la hoja se cierra al instante al guardar). **Nada en bucle.**
- **Dónde vive:** `apps/web/app/estilos/campana-hoja.css`, `components/campana-hoja/` y lo vigila `lib/campana-hoja-movimiento.test.ts`.

## Actualización 2026-10-23 (b) — El telar de Finanzas (ADR-0493), aprobado por Felipe

- **Qué:** en la barra común de Finanzas, los hilos de sede que crecen bajo la sede elegida, el orillo que se teje al entrar y se reacomoda al
  cambiar de sede, la cifra de la respuesta que cuenta y el dock que sube. En cada submódulo, su gráfico propio entra una vez: el retazo y el
  calendario de Gastos, los frascos de Cuentas y dinero, la biblioteca de Reportes, la balanza de Impuestos y el mapa del Cierre.
- **Por qué se admite:** Felipe eligió «El telar de Finanzas» mirando la maqueta (docs/maquetas/finanzas-telar-2026-10/), que pedía «muchas
  animaciones», y aprobó la excepción acotada a lo que la maqueta muestra (decisión b, 2026-10-23).
- **Los límites:** todo corre UNA vez, con `--ease-cayla`, sin rebote y solo con tokens del tema; con `prefers-reduced-motion`, todo queda
  quieto. **Nada en bucle**, salvo las señales que esta regla ya admite.
- **Dónde vive:** `apps/web/app/estilos/telar.css` y `components/finanzas/telar/`.

## Actualización 2026-10-23 (c) — «Ajustar stock» en el modal de la prenda de Existencias, la planilla (ADR-0494), pedido por Felipe

- **Qué:** al abrir el modal, una luz cruza la banda «¿No es lo que ves en la tienda?» y su lápiz se dibuja. Al tocarla, la foto se achica
  y dice «Ajustando», lo de la prenda se pliega, el modal crece solo si la planilla no cabe, el hilo de la cabecera se dibuja columna por
  columna, las filas llegan en cascada y las celdas en una ola en diagonal (las que no están en foco llegan ya en sombra), y un anillo se
  cierra sobre la talla en foco. Al contar, el número rueda hacia arriba o hacia abajo y el talón de la izquierda entra con su cambio. Al
  guardar, el hilo del botón corre mientras la base responde, cada talla se sella en verde una tras otra, el talón recibe el sello
  «Guardado», salen las etiquetas por la ranura (la tira de Editar producto) y las cifras de «Dónde está» cuentan desde el número viejo.
- **Por qué se admite:** Felipe pidió que la vista de ajuste sea «sofisticada, elegante y full animaciones» y eligió la ronda 3 mirándola
  (docs/maquetas/existencias-ajustar-stock-2026-10/ronda-3.html), con el contrato de siempre: rico, una vez, sin bucle.
- **Los límites:** todo corre UNA vez, con `--ease-cayla`, sin rebote, cada pieza en 1,2 s o menos, solo tokens del tema, y con
  `prefers-reduced-motion` todo queda quieto (el sellado no espera). **Nada en bucle** (el hilo del botón ya era una excepción).
- **Dónde vive:** `apps/web/app/estilos/ajuste-modelo.css`, `components/existencias/AjusteDelModelo.tsx` y `PanelTalla.tsx`; lo vigila
  `lib/ajuste-modelo-movimiento.test.ts`.

## Actualización 2026-10-23 (d) — Tienda web ▸ Tráfico, la vitrina por miradas (ADR-0495), elegida por Felipe

- **Qué:** las tarjetas de la pantalla suben en cascada con `anim-sube` (la del sistema); en la vitrina, cada baldosa crece desde casi su
  tamaño en cascada (de la más mirada a la menos), su etiqueta de papel se cuelga girando a su lugar y, cuando ya están todas, una luz cruza
  el mosaico una vez. Las barras del recorrido, de «De dónde vienen» y de las horas son `BarraAvance` y `BarrasTiempo`, con su propio
  movimiento.
- **Por qué se admite:** Felipe eligió la maqueta C «La vitrina» entre tres, con este movimiento (docs/maquetas/trafico-cero-2026-10/), y la
  lista de actividades aprobada lo incluía.
- **Los límites:** todo corre UNA vez, con `--ease-cayla`, sin rebote, cada pieza en 1,2 s o menos, solo tokens del tema, y con
  `prefers-reduced-motion` todo queda quieto. **Un solo bucle, que es señal y no adorno:** el punto verde de «Ahora, N mirando» respira
  (una onda que se abre cada 2,4 s) solo mientras alguien mira la tienda online; si nadie mira, el punto no se dibuja.
- **Dónde vive:** `apps/web/app/estilos/trafico.css`, `components/trafico/` y lo vigila `lib/trafico-movimiento.test.ts`.

## Actualización 2026-10-27 — El stock inicial se sella (ADR-0494, actividad 3)

Dos movimientos de una sola vez, sin rebote ni bucle y apagados con «reducir movimiento»: **el sello de «Stock inicial»** de Nuevo producto (la
pantalla de «Se creó…»: gira de 22° a −8° mientras baja de 1,7× a su tamaño, 780 ms con `--ease-cayla`) y **el destello del candado** de una variante
que acaba de guardarse con sus unidades de partida (la caja pasa de ámbar a verde y el grillete se cierra, 900 ms). En «Agregar color / talla», la fila
nueva de «Así quedará en la tabla» entra con `anim-revelar`. El sello (`.sello-stock-inicial`) vive en `app/estilos/alta-guia.css` y el candado
(`.matriz-paso[data-sellada]`) en `app/estilos/ficha-taller.css`.


## Actualización 2026-10-28 — la gota del aviso «Hay una versión nueva»: un rebote, con nombre propio

Felipe pidió, mirando maquetas (`docs/maquetas/version-nueva-2026-10/gota.html`), que el aviso de versión nueva (ADR-0422) entre como una gota. Es una
excepción a «sin rebote»: **la única pieza del ERP con un rebote, y es uno solo**, una vez al aparecer y otra al irse, sin bucle.

- **Entrada (~2,2 s):** cae suave hasta lo más bajo de la sección del aviso, **rebota una vez** y sube suave al centro; desde ahí se riega como un
  líquido —primero por el suelo, con la punta redonda, después sube el nivel ondulado— hasta ser la píldora; el texto aparece al final.
- **Salida con la ✕ (1,45 s):** la entrada al revés: el texto se apaga, el nivel baja, el líquido se recoge al centro hasta ser una gota, que se desprende
  y cae desvaneciéndose. «Más tarde» sigue callando 30 min.
- **Cómo se hace:** círculos y columnas de borde redondo que un filtro SVG de «goteo» (`#liquido`, blur + contraste del alfa) funde en una masa blanda,
  recortada por la forma de la píldora; `--m` (la mitad del ancho, medida al montar) hace que llegue a las paredes con cualquier texto. Detalle y tiempos
  en `app/estilos/avisos.css`.
- **Lo que lo mantiene discreto:** una vez, menos de 2,5 s, nunca en bucle, y con `prefers-reduced-motion` aparece y se va ya hecha.
- **Se rompe si:** se publican muchas versiones por hora y la gota deja de ser una señal y pasa a ser ruido (ver ADR-0422, «Opciones»); o si alguien reutiliza
  el rebote en otra pieza: esta excepción es solo del aviso. Pruebas: `lib/version-nueva-reglas.test.ts`.

## Actualización 2026-10-29 — Tienda web ▸ Tráfico, «Observatorio» (ADR-0568)

La vitrina de baldosas de Tráfico (act. 2026-10-23 (d)) se fue: su cascada, la etiqueta que se cuelga y la luz que cruza ya no existen. Lo que
queda propio de la pantalla: **los 100 puntos de «Hasta dónde llega la gente» se encienden una vez**, paso tras paso (90 ms) y punto tras punto
(6 ms), 360 ms cada uno con `--ease-cayla`, sin rebote; y el único bucle sigue siendo la señal del punto verde de «N mirando ahora», que respira
solo mientras alguien mira. Todo quieto con `prefers-reduced-motion`. Lo vigila `lib/trafico-movimiento.test.ts`.
