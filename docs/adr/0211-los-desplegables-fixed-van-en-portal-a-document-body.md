# ADR-0211 — Todo desplegable `position: fixed` va en portal a `document.body`

**Fecha:** 2026-09-25
**Estado:** Aceptado

## El síntoma

En el celular (375 px), al abrir el filtro «Vendedor» en Ventas ▸ Historial o el filtro «Tipo» en
Facturación ▸ Comprobantes, la lista desplegada se veía **detrás** de la fila de abajo (la venta o el
comprobante siguiente le tapaba media lista) en vez de flotar por encima. En escritorio no se notaba porque
había más aire debajo del control y la lista rara vez llegaba a solaparse con la fila siguiente.

## La causa

`usePosicionLista`/`usePosicionAnclada` (`apps/web/components/ui/useAnclaje.ts`, nacidos 2026-09-22) miden el
control con `getBoundingClientRect` y dibujan la lista en `position: fixed` con `z-50` — para que un
`overflow-hidden` o un `overflow-y-auto` (una hoja de `<Modal>`, una tarjeta) no la recorte. Eso resuelve el
recorte, pero **no resuelve el orden de pintado**: un elemento `position: fixed` deja de posicionarse contra
el viewport y pasa a posicionarse contra el ANCESTRO MÁS CERCANO que sea "containing block" para elementos
fixed — y eso pasa con cualquier ancestro que tenga `transform` (no `none`), `filter`, `perspective`,
`will-change: transform`, o **containment** (`contain: layout`/`paint`, que es justamente lo que
`container-type: inline-size` implica — la utilidad `@container` de Tailwind que usan `ComprobantesPanel`,
`HistorialVentasLista` y varias tarjetas más). Atrapado ahí, el `z-50` de la lista ya no compite contra TODA
la página: compite solo dentro de ese ancestro, y una fila normal más abajo en el DOM —sin ningún
`z-index` especial— puede terminar pintándose encima.

`MenuAcciones.tsx` (el menú «⋯» de una fila) y `ResumenControles.tsx` (el selector de rango de Análisis) ya
habían resuelto esto bien desde el principio: miden igual, pero dibujan el resultado con
`createPortal(nodo, document.body)`. Al generalizar el mecanismo de medición en `useAnclaje.ts`
(2026-09-22, ver su comentario de cabecera) **se perdió la mitad portal** en cuatro de sus consumidores:

- `components/ui/campos.tsx` → `Desplegable` (rama `alineacion="campo"`, la que usa `CampoSelect` en
  cualquier formulario)
- `components/ui/ComboBuscable.tsx`
- `components/ui/FiltrosPildora.tsx` → `DesplegablePildora` (el filtro de las píldoras: Historial, Comprobantes,
  Productos, Compras)
- `components/ComboResponsable.tsx`

Los cuatro quedaron con la posición calculada correctamente pero el nodo colgando adentro del árbol normal —
por eso el bug aparecía en CUALQUIER pantalla que usara uno de estos cuatro dentro de una tarjeta `@container`
(o, en general, dentro de cualquier ancestro con containment/transform), no solo en Historial y Comprobantes.

## La decisión

**Todo desplegable que se dibuja en `position: fixed` medido con `usePosicionLista`/`usePosicionAnclada` va
envuelto en `createPortal(nodo, document.body)`.** Se corrigieron los cuatro consumidores de arriba
(`campos.tsx` solo en su rama `flotante`; la rama `alineacion="derecha"`, que es `absolute` y crece con su
padre a propósito, se queda igual — ver su comentario). `MenuAcciones.tsx` y `ResumenControles.tsx` ya lo
hacían bien y no cambiaron.

Un desplegable NUEVO que use `position: fixed` (propio o vía uno de estos hooks) **tiene que nacer con su
portal** — no confiar en que "ya está en `fixed`, eso alcanza". El portal es lo que garantiza que ningún
ancestro presente o futuro (una tarjeta `@container`, un modal, una animación con `transform`, un `filter`) lo
atrape, sin tener que auditar cada ancestro a mano cada vez.

## De paso: los filtros de píldora no se apilan en celular

`PanelPildoras` (`FiltrosPildora.tsx`) usaba `flex flex-wrap`: con 4-5 píldoras de texto largo («Todos los
vendedores», «Todos los tipos») el panel no cabía en 375 px y cada píldora terminaba en su propia fila, con
aire desperdiciado a los costados de cada una — feo y ningún filtro se leía de un vistazo. Ahora, por debajo
de `sm` (640px), el panel es una sola fila que se desliza en horizontal (`overflow-x-auto` + `scroll-cayla`,
el mismo patrón de scrollbar fina que ya usa el resto del sistema) — como el riel de períodos «7/30/90 días»
que ya vive arriba, en la misma pantalla. Desde `sm` hay aire de sobra y vuelve a `flex-wrap`, sin cambio de
comportamiento en escritorio. Este componente es compartido (`FiltrosProductos`, `FiltrosCompras`,
`FiltrosHistorialVentas`, `ComprobantesPanel`): el arreglo alcanza a las cuatro pantallas de una sola vez.

**Segunda vuelta (mismo día):** el texto de cada píldora (`<span>{elegida?.texto ?? etiqueta}</span>`, sin
`white-space: nowrap`) se envolvía en 2-3 líneas dentro de la caja `h-9` en vez de mantenerse en una — un
`flex-shrink: 0` no evita que el texto envuelva, porque el tamaño "de contenido" de un ítem flex con texto se
calcula dejándolo envolver primero. Eso hacía overflow VERTICAL dentro de la fila, y con `overflow-x: auto` puesto
y `overflow-y` en su valor por defecto (`visible`), la especificación obliga al navegador a resolver `overflow-y`
como `auto` también — de ahí "tiene scroll hacia arriba y abajo" con solo 44px de alto. Arreglado con
`whitespace-nowrap` en la píldora (`DesplegablePildora` y `PildoraFechas`, el rango de fechas de Compras que
copia a propósito el mismo hueco visual — ver su comentario).

Y la «fea línea negra»: `Hilo` (`campos.tsx`) siempre dibuja una línea de reposo de 1px bajo el control —
pensada para un campo SUELTO sobre el fondo de la página (dice "acá se puede tocar"). Dentro del panel de
píldoras, que ya tiene su propio fondo (`bg-sand/50`) y separadores (`divide-x`), esa línea por píldora,
puestas borde a borde, se leía como una sola barra continua de punta a punta del panel — no como el borde de
cada una. `Hilo` ahora acepta `reposo={false}` para apagar solo esa línea de reposo y dejar el trazo
rojo/verde de la interacción; se usa en `DesplegablePildora` y en `PildoraFechas`. El resto de los
consumidores de `Hilo` (campos de formulario sueltos: `CampoTexto`, `CampoFecha`, buscadores) no cambia —
siguen con `reposo` en su valor por defecto (`true`).

## Cómo verificar

1. `pnpm --filter web dev`, celular (375 px, `resize_window` preset `mobile`).
2. Ventas ▸ Historial → «Filtros» → «Vendedor»: la lista abre por encima de la venta de abajo, sin que la
   tape.
3. Facturación ▸ Comprobantes (dentro de una tarjeta `@container`, el caso que sí estaba roto) → «Tipo»: mismo
   resultado.
4. Con 3+ píldoras de filtro abiertas en 375px: el panel es una sola fila que se desliza, no una torre de
   píldoras.
5. `pnpm --filter web typecheck` y `pnpm --filter web lint` sobre los cuatro archivos tocados.

## Qué se descartó

- **Subir el `z-index` del desplegable por encima de todo.** No ataca la causa: mientras el nodo siga
  atrapado dentro de un ancestro con stacking context propio, ningún `z-index`, por alto que sea, lo saca de
  ahí — solo compite dentro de ese ancestro.
- **Quitar `@container`/`overflow-hidden` de las tarjetas que lo necesitan** (`ComprobantesPanel`, para el
  hover recortado en las esquinas redondas). Son necesarios por su propia razón (ver el comentario en cada
  archivo) y quitarlos rompería otra cosa para arreglar esta.

## Actualización 2026-09-26 — dos defectos del portal, y dónde se cuelga dentro de un modal

El portal a `document.body` resolvió el orden de pintado, pero rompió dos cosas que nadie probó con el mouse,
porque las pruebas de este ADR eran de celular y de «¿se ve encima?», no de «¿se puede elegir?».

**1. Tocar una opción cerraba la lista antes de elegir — en TODA pantalla.** `Desplegable` (todo `CampoSelect`),
`DesplegablePildora` y `ComboResponsable` deciden «tocaste afuera, cierro» preguntando si el clic cayó dentro de
su caja en el DOM (`contenedor.contains(...)` / `raiz.contains(...)`). Con la lista en un portal, sus opciones ya
no están dentro de esa caja: el `mousedown`/`pointerdown` en una opción contaba como «afuera», la lista se
desmontaba y el `click` de la opción (que es el que elige) ya no llegaba. Con teclado sí se podía elegir; con
mouse o con el dedo, no. Además, en `ComboResponsable` las flechas buscaban las opciones dentro de `raiz` y no
encontraban ninguna. `MenuAcciones` ya lo hacía bien (mira el menú Y el botón). Arreglo: cada uno guarda un ref
a su caja flotante (`capa`) y el «afuera» mira las dos.

**2. Dentro de un `<Modal>`, la lista quedaba fuera de la hoja de Radix.** Radix Dialog deja todo lo que está
fuera de su hoja sin clics (`pointer-events: none` en `body`), le devuelve el foco a la hoja si algo de afuera
lo toma (FocusScope) y lo esconde a los lectores de pantalla. Resultado: la lista se veía, pero el clic caía en
el formulario de atrás, lo tecleado en su buscador iba a otro campo, y en el combo «Responsable» el toque
contaba como «clic fuera del modal» y **cerraba el modal entero**, perdiendo lo escrito (medido en el
navegador contra `main` el 2026-09-26). Arreglo: `useDestinoFlotante` (`useAnclaje.ts`) cuelga la lista en la
propia hoja (`[role="dialog"]`) cuando el control está dentro de un modal, y en `document.body` en el resto.
La hoja en reposo no crea containing block para `fixed` (sin `transform` ni containment), así que la posición
medida por `usePosicionLista` sigue valiendo; durante su animación de entrada sí lleva `transform`, y eso ya lo
cubre la medición cuadro a cuadro — es como vivían estas listas en los modales antes de este ADR.

**Verificado en el navegador** (página de prueba con los componentes reales, sin base): `CampoSelect` y
`DesplegablePildora` fuera de un modal, `CampoSelect` («Familia» de Nuevo color) y `ComboResponsable` dentro
de un `<Modal>` real, con mouse, con teclado (flechas) y a 375 px con toque. Contra `main`, el mismo recorrido
fallaba: la familia no cambiaba y el modal del responsable se cerraba.

**Descartado:** dejar la lista en `body` y darle `pointer-events: auto` y un `z-index` por encima del modal.
Arregla el clic, pero no el foco (FocusScope sigue robándoselo al buscador de la lista) ni el «clic fuera» de
Radix, que se decide por DOM y cerraría el modal.

## Actualización 2026-09-26 (b) — dentro de la hoja, en su CAPA: la cascada del modal retrasaba cada combo hasta 1 s

**Pedido de Felipe:** «hay combos que demoran en desplegarse y mostrar la información; que todos abran como el selector de
sede de la cabecera».

**Medido en el navegador**, leyendo de cada lista sus animaciones (`getAnimations()`: retraso y duración reales). Contar
cuadros no sirve en el navegador integrado: con el panel detrás dibuja a 1 cuadro por segundo, y hasta el de sede parecía lento.

| Combo | Se empieza a ver | Entero |
|---|---|---|
| Selector de sede (cabecera) | 5 ms | 334 ms |
| Cualquier combo en una página (fuera de un modal) | 5–16 ms | 250–340 ms |
| Cualquier combo dentro de un `<Modal>` (banco de prueba) | 285–345 ms | 790–850 ms |
| «Registrar gasto», Finanzas, con sesión real | 508 ms | 1.008 ms |

**Causa.** La actualización anterior colgó la lista como hija DIRECTA de la hoja (`[role="dialog"]`). La hoja es
`.cascada-modal`, y la cascada de entrada (ADR-0136) anima `.cascada-modal > :not(form):not([data-sin-cascada])`: toda
hija directa, también la que llega después de abrir. Con más especificidad que `.anim-revelar`, la cascada le ganaba: la
lista quedaba invisible `120 + k × 55 ms` (k según su lugar entre las hijas; en «Registrar gasto» era la número 12, k = 7:
505 ms) y entraba en 500 ms. Fuera de un modal cuelga de `body` y no pasaba; por eso el de sede y los filtros de página se
sentían rápidos. Les pasaba a los cinco tipos: `CampoSelect`/`Desplegable`/`SelectFin`, `ComboBuscable`,
`DesplegablePildora` y `ComboResponsable`.

**Decisión.** `<Modal>` monta, como última hija de la hoja, una capa vacía: `<div data-capa-flotante data-sin-cascada />`.
`useDestinoFlotante` cuelga la lista en esa capa (`:scope > [data-capa-flotante]`). Si la hoja no tiene capa, la cuelga en
la hoja misma: pasa en los seis cajones con `Dialog.Content` propio, que tampoco tienen cascada. Fuera de un modal, en
`body`. La capa sale de la cascada con el mecanismo que ya existía, y lo que cuelga de ella no es hija directa: la lista
entra con su `anim-revelar`, la de la sede. Sigue dentro de la hoja, así que conserva lo que ganó la actualización anterior:
clics, foco y lector de pantalla. Va al final para no correr el turno de ninguna pieza, y vacía no ocupa lugar: medida en
0 px, también en la variante `ticket` a 375 px. De paso, `ComboBuscable`, el único que aparecía de golpe, entra ahora con
`anim-revelar` como los demás.

**Descartado:**
- **`data-sin-cascada` en la caja flotante de cada combo.** Arregla los cinco de hoy, pero cada combo nuevo tendría que
  acordarse, y el bug volvería en silencio con el primero que se olvide. Con la capa, toda lista que pase por
  `useDestinoFlotante` queda bien sin saberlo.
- **Sacar las listas por su rol en el selector de la cascada (`:not([role="listbox"])`).** La raíz flotante no siempre es el
  `listbox`: en `Desplegable` y en `ComboResponsable` es la caja que también lleva el buscador. Sería otra regla que recordar.
- **Que el hook cree la capa (`appendChild` en la hoja).** Mete un nodo que React no conoce dentro de un árbol que React
  maneja. Declarada en `<Modal>`, la capa es explícita y se ve en el código.

**Verificado en el navegador:**
- Banco temporal con los cinco tipos dentro y fuera de un `<Modal>`, más la variante `ticket` a 375 px. Borrado antes del commit.
- «Registrar gasto» con sesión real.
- Después del arreglo, todos se ven en 3–18 ms y están enteros en 243–347 ms, dentro y fuera de un modal.
- Probado con clic real, con teclado (buscar y Enter), con toque a 375 px, y con Escape: cierra solo la lista y el modal sigue abierto.

Prueba nueva: `lib/combos-fuera-de-la-cascada.test.ts`. Revisa que la capa exista, fuera de la cascada y al final de la
hoja; que el hook la use; y que los cuatro archivos de combo cuelguen su lista con el hook y entren con `anim-revelar`.

**Queda abierto (decisión de Felipe, toca ADR-0136).** La cascada también anima lo que aparece DESPUÉS de abrir un modal.
Un bloque que se revela al elegir una opción espera hasta ~0,6 s y entra en 500 ms. Hoy se esquiva a mano con
`data-sin-cascada` en 14 bloques (Gastos, Cuentas y dinero, Registrar gasto, Nueva proforma, Cerrar caja, la cámara de
Vender). Ver el BACKLOG.
