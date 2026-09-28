# Spike visual · Guardar los cambios de un producto (2026-09-28)

`guardar-cambios-spike.html`: un solo archivo, se abre con doble clic en el navegador. Es la ficha real de «Editar producto»
(`/productos/[id]/editar`, `ProductoForm.tsx`) con datos de ejemplo; nada se guarda. Pedido de Felipe, con una captura de
CMS-0001: *una colaboradora desactiva una talla, activa otra o cambia un precio, pero no sabe qué paso sigue ni si lo que hizo
se guardó, y puede salirse y perder el progreso. Un mensaje, o algo parecido.*

## El problema, en el código de hoy

1. **Lo que toca no se marca.** El interruptor «Activa» y el precio solo cambian en pantalla (`ProductoForm.tsx:825`); ni la fila
   ni nada dice «pendiente». Un interruptor parece una acción que ya ocurrió.
2. **El botón gris no explica nada.** «Guardar cambios» queda apagado hasta elegir Responsable, y el único motivo es una línea
   gris chica bajo el combo (`ComboResponsable.tsx:298`, `ProductoForm.tsx:905`).
3. **Se sale sin preguntar.** «Cancelar» navega directo (`ProductoForm.tsx:908`), y el menú lateral también.
4. **En tablet el panel queda al final de la página** (`lg:sticky`, `ProductoForm.tsx:887`): solo pega en pantalla ancha.

## Decisiones de Felipe (2026-09-28)

| # | Pregunta | Respuesta |
|---|---|---|
| 3 | ¿Qué pasa si intenta salir con cambios sin guardar? | **Preguntar antes de perder.** Cancelar, «← Productos», el menú, el botón Atrás y cerrar la pestaña. |
| 4 | Cuando confirma y se guarda, ¿qué ve? | **Aviso detallado y volver a Productos:** «Camisa Lino guardado» y, debajo, «Por Rosa · 1 variante desactivada, 1 variante activada, 1 precio cambiado». |
| 1 | ¿Cómo se entera de que tiene cambios sin guardar? | **Pidió verlas todas** → este spike (A, B y C). |
| 2 | ¿Dónde elige quién hace la operación? | **Pidió verlas todas** → este spike (A, B y C). |

Las decisiones 3 y 4 están dentro de todas las versiones menos «Hoy». Falta elegir la 1 y la 2.

## Qué se ve

Arriba, una barra punteada con los controles de la maqueta (no es parte del ERP):

- **1 · Aviso de cambios:** *Hoy* (la pantalla como está) · *A · Barra fija* · *B · Panel vivo* · *C · Aviso arriba*.
- **2 · Responsable:** *A · Hoja al guardar* · *B · Pasos numerados* · *C · Mejores textos* (se apaga en «Hoy»).
- **Cuenta:** *Tablet de la tienda* (el combo viene vacío, como en la captura) o *Con tu nombre* (viene elegido).
- **Ancho:** *Escritorio*, *Tablet 820*, *Celular 390*. La pantalla se adapta al ancho de su marco, no al de la ventana.
- **▶ Hacer 3 cambios de ejemplo** (apaga una talla, activa otra, cambia un precio), **← Simular «Atrás»** y **↺ Reiniciar**.
- Enlace directo a una combinación: `guardar-cambios-spike.html#aviso=barra&resp=hoja&cuenta=persona&ancho=celular&demo=1`.

| Versión | Qué hace | Se ve en… |
|---|---|---|
| **Hoy** | Panel derecho con el combo y un botón gris. Nada marca lo pendiente. Salir borra todo sin avisar (la maqueta lo anota en la lista). | Escritorio; en tablet y celular el panel cae al final de la página |
| **A · Barra fija** | En cuanto toca algo sube una barra pegada abajo: «Tienes 3 cambios sin guardar. Aún no se guardó nada. Cuando termines, pulsa «Revisar y guardar»», con [Descartar]. Las filas tocadas llevan un borde ámbar, «Se desactiva al guardar» / «Precio: antes 90» y [↺ Deshacer]. El panel derecho desaparece. | Toda pantalla y todo ancho |
| **B · Panel vivo** | El panel de hoy dice «Sin cambios» o «3 sin guardar» y resume qué cambió; mismas marcas en las filas. | Escritorio; en tablet queda al final |
| **C · Aviso arriba** | Una franja sobre la ficha; sin marcas en las filas. | Solo mientras no se baje a las tallas |
| **Responsable A** | «Revisar y guardar» abre la hoja «Revisa y guarda los cambios»: lista agrupada de lo que cambia, el combo adentro y [Confirmar y guardar]. Con tu nombre, es un clic. | |
| **Responsable B** | El combo se queda, con pasos 1-2-3 que se marcan solos; en la barra se dice en palabras («Paso 2 de 3»). El botón dice qué falta. | |
| **Responsable C** | Como hoy, pero el botón dice «Falta elegir responsable» y el aviso del combo pasa a ámbar. | |

Lo pendiente va en **ámbar** (la paleta lo reserva para «en proceso») y no en rojo, que ya pintan los interruptores encendidos y
que la guía limita a 2 por pantalla. El verde queda para lo ya guardado.

## Lo que recomiendo, y por qué

**Barra fija (A) + hoja «Revisar y guardar» (A).** La barra es la única que resuelve el problema en la tablet de la tienda, y el
ERP ya usa ese patrón en Recibir y Por pagar (`ui/BarraFija.tsx`). La hoja pone la pregunta del responsable justo cuando hace falta
y es el mismo patrón que Felipe aprobó para Catálogo el 23-sep (`ConfirmarConResponsable`, `docs/maquetas/catalogo-responsable-confirmacion-2026-09/`).
Con una cuenta de persona el costo es un clic; con la tablet, elegir quién es, que ya era obligatorio.

## Cómo se construiría (si se aprueba)

- `lib/producto-cambios-reglas.ts`: función pura `resumenDeCambios(original, actual)` con pruebas (lo que hace `cambios()` del
  spike), más las frases del aviso y del toast. Sin ella no hay forma de saber qué cambió sin repetir la cuenta en cada pieza.
- `components/BarraDeCambios.tsx` sobre `ui/BarraFija.tsx` (prop `visible`: sube 420 ms, baja 240 ms), con `role="status"`.
- `components/ConfirmarCambios.tsx` sobre `<Modal variante="hoja">` + `<ComboResponsable>`, hermana de `ConfirmarConResponsable`.
- Un hook `useAvisoDeSalida(hayCambios)`: `beforeunload` (ya existe en `BajarAlPisoForm.tsx:251`), clic en enlaces internos del
  menú (captura en `document`) y el botón Atrás (truco de historial con `popstate`).
- `ProductoForm.tsx`: sin `<aside>`; `onSubmit` se parte en `revisar()` (valida y abre la hoja) y `guardar()` (lo de hoy).
  El aviso del código corto pasa al pie de las variantes. **Sin migración.**
- El aviso de éxito ya soporta `detalle` (`avisar.exito`).
- Si Felipe aprueba, ADR del mismo día: «formularios de edición largos: barra de cambios + hoja al guardar», porque pasa a ser regla
  del sistema (como ADR-0136 para los modales).

## Lo que el spike no cubre y la construcción sí tiene que cubrir

- **Conflicto de versión** (ADR-0193) o **rechazo por el responsable** al confirmar: la hoja tiene que quedarse abierta con el aviso, no cerrarse.
- Cambios que el spike no simula pero cuentan: fotos subidas o quitadas, filas nuevas («+ Agregar variante»), etiquetas por variante,
  temporada por color, marca y proveedor. Todos entran en el resumen y en el conteo.
- **Cerrar la pestaña** muestra el aviso propio del navegador (su texto no se puede cambiar). **El botón Atrás** se cubre con el truco
  de historial: hay que probarlo en una tablet real, no solo en el navegador de escritorio.
- «Descartar» no pide confirmación: deshace todo y ofrece «Deshacer» en el aviso (así no hay un mensaje más).
- Sin el panel derecho la ficha ganaría todo el ancho; el spike la limita a 1080 px. Es una decisión abierta (ver abajo).

## Preguntas abiertas para Felipe

1. **Pregunta 1:** ¿A (barra fija), B (panel vivo) o C (aviso arriba)? Recomendada: A.
2. **Pregunta 2:** ¿hoja «Revisar y guardar», pasos numerados o solo mejores textos? Recomendada: hoja.
3. Si es A: ¿la ficha sin panel derecho queda a 1080 px o a todo el ancho?
4. ¿Se lleva después a las otras pantallas de edición larga (Proveedor, Cuenta…)? Propuesta: no ahora; primero esta.

## Verificado

En el panel del navegador, con la ficha a 1440, 820 y 390 px de ancho (y, solo para «Hoy» y la barra A, en un viewport real de 375 px):

- Las **30 combinaciones** (4 avisos × 3 responsables × 3 anchos, contando «Hoy» una vez por ancho) sin desborde horizontal y sin errores de JavaScript.
- Flujo completo: cambios → barra → hoja → elegir responsable → confirmar → espera → aviso detallado en Productos.
- Salida por el menú, por «← Productos» y por «Atrás», con y sin cambios; «Seguir editando» conserva todo.
- Descartar y «Deshacer»; deshacer una sola fila o un solo campo; precio vacío rechazado antes de abrir la hoja.
- Con «Con tu nombre» el combo viene elegido y confirmar queda habilitado.

**No se probó** en una tablet física, ni con lector de pantalla.
