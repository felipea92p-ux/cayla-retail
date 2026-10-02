## 2026-10-02 (3 maquetas para el espacio vacío de Editar producto)
Qué hice: construí 3 maquetas estáticas (`docs/maquetas/producto-editar-rediseno-2026-10/`) que responden la pregunta 3,
sin responder, del spike de ADR-0257 («sin panel derecho la ficha quedó en 1080 px: ¿se deja así o se usa el ancho?»):
A) Ficha espejo (copia el panel de `FichaPrevia.tsx` de Nuevo producto, solo lectura), B) Panel del taller (foto por
color + stock por talla en vivo) y C) Riel que acompaña (el panel cambia de contenido solo con el scroll). Las tres
reusan el grid `minmax(0,1fr) 340px` del alta y reorganizan la columna izquierda en tarjetas numeradas al estilo
`PasoAlta`.
Por qué así: Felipe pidió aprovechar el espacio a la derecha y guardar concordancia visual con Nuevo producto. Ninguna
reintroduce un botón de guardar en el panel derecho — eso fue justo el bug que ADR-0257 corrigió (colaboradora sin saber
si lo tocado se guardó); guardar sigue siendo solo `BarraDeCambios` + la hoja.
Felipe se lleva: 3 archivos `.html` que se abren con doble clic, con un botón «Simular 2 cambios» para ver el
movimiento, no solo la foto fija. Recomiendo B. Nada se implementó — `ProductoForm.tsx` sigue intacto; al elegir una,
toca correr `/focus` sobre el componente real antes de cerrarlo (`TiraFicha.tsx`/`ProductoForm.tsx` ya están en
`aplicada` en `lib/guia-de-foco-pantallas.ts` y el rediseño tiene que conservar esa guía).

## 2026-10-02 (B elegida: cambiar precio/costo en bloque + ajustar stock sin salir de la ficha)
Qué hice: Felipe eligió B y pidió poder corregir precio, costo y stock «desde un solo lugar» en vez de ir celda por
celda. Sumé a la maqueta (y al artifact publicado) tres piezas que YA existen en el repo real, ninguna inventada: la
barra «Cambiar [Precio|Costo] de [alcance] a [monto] · Aplicar» (igual a `CambiarEnBloque.tsx`), un lápiz de «Ajustar
stock» junto a cada número (matriz y panel del taller) que abre un ajuste con motivo, y un banner «nació sin unidades»
cuando «+ Agregar color» crea una variante en 0.
Por qué así: lo de precio/costo era un gap real de la maqueta (`CambiarEnBloque` ya existe en producción, solo no
estaba en el mock). Lo de stock NO lo resolví con un cuarto campo en la misma barra: «poner el mismo stock a varias
tallas» no tiene el mismo sentido que precio/costo (cada talla trae una cantidad distinta de verdad), y sobre todo el
stock es un snapshot derivado de `movimientos` (principio 4) — un campo que lo pisa directo reabriría el hueco que
ADR-0270 (decisión 9) cierra a propósito. El lápiz de ajuste (mismo camino que `AjusteDeStock.tsx` →
`AjustarInventarioModal`, inmediato y CON motivo, aparte de «Revisar y guardar») es la respuesta real al mismo dolor.
Felipe se lleva: el artifact actualizado (https://claude.ai/artifact/UgwbENYBWhvpcLpYMcmPeS) con las tres piezas
interactivas y probadas (bloque, ajuste con popover+toast, «+ Agregar color» → banner), más una lista de casuísticas
reales para revisar antes de construir (etiqueta con descuento activa, costo que viene de Compras, variante ya vendida,
multi-sede, permiso de «ver costo»). Nada se implementó todavía en `ProductoForm.tsx`.

## 2026-10-02 (la misma tarde: el ajuste de stock pasa a ser un stepper, como en Nuevo producto)
Qué hice: Felipe probó el lápiz+ventana flotante del punto anterior con una captura de Nuevo producto al lado y marcó
dos problemas: el clic sobre la celda entera (para «desactivar» una talla) solo la opacaba sin decir qué pasó
(¿desactivada? ¿borrada? ¿oculta?), y el delta de la ventana flotante arrancaba siempre en 0, leyéndose como «no hay
nada» cuando el stock real podía ser 4. Rehice la matriz con el mismo stepper (−/N/+) que ya usa
`MatrizCantidades.tsx` del alta, en cada celda y también junto a cada barra del panel del taller, con fila y columna
«Total». Quité el clic ambiguo y la ventana flotante; el motivo del ajuste (Conteo físico, Corrección de ingreso,
Merma, Traslado recibido) pasó a un solo selector arriba de la matriz para toda la visita, no un formulario por cada
clic. Subir una cantidad ahora ofrece «Imprimir etiqueta» de esa talla y color en el aviso de confirmación, mismo
patrón que ya usa `avisar.exito({accion:{texto:'Imprimir etiquetas',…}})` al corregir color/talla en producción.
Por qué así: «sencillo mientras sigue siendo sofisticado» —el pedido de Felipe— significa reusar un patrón que la
propia gente de piso ya conoce (el stepper de alta), no inventar uno nuevo; y mostrar el número real en vez de un
delta en 0 es, literalmente, no mentir sobre el estado del inventario (principio 2).
Felipe se lleva: el artifact republicado con el stepper probado en las dos superficies (matriz y panel del taller,
sincronizados), el flujo «+ Agregar color» → banner → stepper en 0 (ya no popover), y el aviso con acción de
imprimir etiqueta. De paso until encontré y corregí dos bugs reales del merge de hoy: un `querySelector('#id')` sin
el prefijo `b-`/`a-` que rompía «+ Agregar color» con un error de consola, y un `[hidden]` que un `display:flex`
propio pisaba silenciosamente (el banner se veía siempre, aunque el atributo `hidden` estuviera puesto). Nada se
implementó todavía en `ProductoForm.tsx` real.

## 2026-10-02 (tercera vuelta: el aviso de imprimir etiqueta espera a guardar, no al clic)
Qué hice: Felipe marcó que el aviso «Imprimir etiqueta» salía apenas se tocaba el stepper, antes de guardar nada.
Lo moví: cada +/- en el stepper sigue escribiendo YA (instantáneo, principio 4 — eso no cambió), pero ya no ofrece
imprimir ahí mismo; solo junta qué talla y color subieron en la visita (`aumentos`, un objeto color|talla → delta
neto). Al pulsar «Revisar y guardar» sale UN aviso consolidado —«Blusa Alba guardado · N prendas nuevas sin
etiquetar (…)»— con el botón «Imprimir etiquetas», y recién ahí se vacía la cuenta.
Por qué así: un aviso con acción después de cada clic mientras la persona todavía está corrigiendo cantidades
interrumpe el trabajo; juntarlo y ofrecerlo una sola vez, al cerrar la visita, es el mismo momento en que
`ProductoForm.tsx` real ya ofrece «Imprimir etiquetas» (en el aviso de éxito de `avisar.exito`, después de
`guardar()`) — no un patrón nuevo, el mismo aplicado a este caso.
Felipe se lleva: el artifact republicado y probado (stepper → sin aviso de imprimir; «Revisar y guardar» → aviso
consolidado con la lista de talla·color). Nada se implementó todavía en `ProductoForm.tsx` real.
