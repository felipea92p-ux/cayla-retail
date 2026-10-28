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

## 2026-10-02 (B implementada en el repo real, en tres pasos verificables)
Qué hice: «implementa tal cual al local para probarlo» — construí la maqueta B sobre `ProductoForm.tsx` real, pero
tal cual chocaba con dos piezas que YA existen y son más sofisticadas que lo que dibujé en HTML estático; en vez de
reemplazarlas, frené y le pregunté a Felipe (protocolo de pregunta, `~/.claude/CLAUDE.md`), que confirmó las dos
opciones recomendadas: (1) el stock se sigue ajustando con el `AjustarInventarioModal` real (motivo + sede +
responsable + reporte CSV), no con el stepper simplificado de la maqueta — ese stepper era una simulación de lo que
ya existe, no una mejora; y (2) las variantes de la izquierda se quedan como lista agrupada por color
(`VariantesFicha.tsx`), no como grilla — cambiarlas a grilla era puro remaquetado sin beneficio real y tocaba un
componente de 693 líneas sin necesidad.
Tres commits, cada uno un corte vertical probado en el navegador:
1. `941d3f4f` — `PanelDelTaller.tsx` nuevo: columna derecha de solo lectura (foto por color reusando
   `vistaDeFotos()`, swatches, identidad, stock por talla con el MISMO `AjusteDeStock`/`AjustarInventarioModal` que
   ya vive en la lista de abajo, precio). `ProductoForm.tsx` pasa a grid `minmax(0,1fr) 340px`. «Cambiar foto» no
   duplica el subidor de `FotosPorColor` — solo hace scroll a `#fotos` con el mismo ancla que ya usa la guía de foco.
2. `6f6a823a` — la sección «Producto» se parte en dos bloques numerados («① Identidad y categoría», «② Tejido,
   patrón y estado») dentro de LA MISMA card, sin colapsar ni usar `<section>` separados: un acordeón habría
   escondido `data-campo="tejido"`/`data-campo="patron"` detrás de un clic, rompiendo el scroll-to-campo-pendiente de
   `TiraFicha.tsx` (ADR-0284) — un riesgo real de guía de foco por una mejora puramente visual.
3. `1ca9f941` — `RecordatorioEtiquetas.tsx` nuevo: Felipe pidió que el aviso de «Imprimir etiquetas» (ya diseñado en
   la ronda anterior) «sea bastante visible y que no desaparezca hasta cambiar de módulo» — más persistente que un
   aviso de `avisar.exito` (que se apaga solo en 4-8 s). En vez de forzar un modo permanente nuevo en `Avisos.tsx`
   (arquitectura de toast, no de banner) o inventar persistencia con `localStorage` (esto es de la visita, no de
   mañana), usé el ciclo de vida que ya tiene `app/(app)/productos/layout.tsx`: se queda montado mientras se
   navega DENTRO de Productos (lista, ficha, Nuevo producto) y se desmonta al salir a otro módulo — exactamente lo
   que pedía Felipe, sin estado nuevo que mantener. `AjustarInventarioModal.tsx` llama a
   `agregarRecordatorioEtiquetas()` cuando alguna talla sube de stock, justo antes de `router.refresh()`.
Por qué así: las dos decisiones de reuso (no el stepper simulado, no la grilla) bajan el riesgo de romper
`AjustarInventarioModal` (motivo/sede/responsable, principio 4) o `VariantesFicha.tsx` (693 líneas probadas) solo
para calzar con una maqueta — el espíritu del pedido («implementa tal cual») era el RESULTADO visual y funcional de
B, no una reescritura literal del HTML.
Verificado en el navegador local (`cayla-retail-dev-3070`, puerto 3070): ajuste real de stock con motivo
«Reposición» desde el panel del taller → aviso «1 variante ajustada» (toast) + franja «1 prenda nueva sin etiquetar ·
Blanco · M» (banner) en el mismo instante, orden correcto (ADR-0149) → la franja persiste al navegar con el Link
«← Productos» a la lista → desaparece al entrar a Inventario por el menú lateral (layout de Productos desmontado).
`tsc --noEmit` y `eslint` en verde en los tres commits (hook de pre-commit); `lib/guia-de-foco.test.ts` y
`lib/sugerir.test.ts` siguen en verde (el panel nuevo no agrega campos editables propios ni ejemplos escritos a
mano).
Felipe se lleva: Editar producto con el panel del taller operativo en local, el recordatorio de etiquetas persistente
probado de punta a punta, y las dos superficies de ajuste de stock (panel + lista de variantes) compartiendo el
mismo `AjustarInventarioModal` y ahora también el mismo recordatorio.

## 2026-10-02 (noche: la maqueta B tal cual en el ERP local)
Qué hice: Felipe vio la ficha y dijo que la estética no era la de la maqueta («no nos estamos entendiendo»): yo había hecho el
panel derecho pero dejado la lista de variantes de siempre. Rehíce Editar producto igual a la B: cuatro secciones plegables, la
matriz color × talla con el stepper en cada celda, totales, precio o costo tocable, la línea del motivo de la visita, «+ Agregar
color» con su stock y el panel del taller completo (`c6a56e53`).
Por qué así: el stepper no pisa el stock; cada toque es un ajuste de inventario real (`ajustar_inventario`) en lotes, sin loader, con
motivo y responsable, leyendo el stock con la misma consulta del modal (la prueba de ADR-0270 lo exigió). Lo que la maqueta no
mostraba (corregir, etiquetas, margen) quedó plegado en «Más de cada variante», no perdido.
Felipe se lleva: la ficha en `http://localhost:3070/productos/<id>/editar` probada contra la base local (lotes 200 OK, dos toques
cuentan dos, Beige nuevo entra con 2+1 unidades, franja de etiquetas al volver). Pendiente de mirar con él: si la línea del motivo,
el lugar y el responsable debe ir más compacta, y si «Más de cada variante» se integra a la matriz.
