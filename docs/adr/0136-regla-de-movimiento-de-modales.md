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
