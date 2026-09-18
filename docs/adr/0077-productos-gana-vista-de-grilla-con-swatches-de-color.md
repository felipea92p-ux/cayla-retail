# ADR-0077 — Productos gana una vista de grilla con swatches de color y vista rápida

**Fecha:** 2026-09-17
**Estado:** Primera pieza (grilla + swatches + vista rápida, sin fotos reales, sin cambios de esquema) en
construcción esta sesión — se prueba en local y en el navegador antes de pedir merge.
**Afecta:** `apps/web/app/(app)/productos/page.tsx`, `apps/web/components/ProductosGrilla.tsx` (nuevo).
No toca esquema ni RPC en esta primera pieza — ver "Lo que queda pendiente" para lo que sí lo va a tocar.

## El problema

Felipe pidió redefinir cómo se organiza la nomenclatura de las prendas y cómo se muestra el catálogo: "lo más
amigable y visual posible... que lo que más destaque sea la ropa", inspirado en catálogos de moda de otras
empresas — no en la tabla operativa que ya existe hoy en `/productos`.

## Lo primero: la nomenclatura ya estaba resuelta

Verificado contra `supabase/migrations/20260912235500_vocabulario_cerrado.sql` y ADR-0025/ADR-0069: el
código de producto (`BLZ-0001`) es prefijo de categoría (37 categorías fijas, cada una con su prefijo de 3
letras) más un correlativo atómico (`fn_siguiente_correlativo`, una fila por prefijo en
`codigos_correlativos`); el código de variante (`BLZ-0001-AZM-M`) le suma color (FK dura a `colores`) y
talla normalizada (`fn_token_talla`) — todo autogenerado por el disparador `variantes_asignar_codigo` en
cada `insert`, nadie lo escribe a mano. Lo que en la captura de Felipe parecía una nomenclatura inconsistente
(`BLU-001`, `CHO-001` mostrados como si fueran el nombre del producto) son 6 productos de prueba ya
descontinuados que nunca recibieron una `referencia` real (ver BACKLOG, módulo Loro, 2026-09-16) — dato
conocido y ya archivado, no algo que este cambio deba tocar.

Esta pieza es, entonces, 100% de presentación: la nomenclatura no se toca.

## Decisión

DECIDÍ: `/productos` gana una segunda vista, `ProductosGrilla.tsx`, alternable con la tabla existente
(`ProductosAgrupados.tsx`, sin tocar) vía `?vista=grilla|tabla` en la URL — grilla por defecto. Las dos
vistas comparten el mismo `ProductoListado[]` que `page.tsx` ya pide con `listarProductos()` — cero cambios
en la capa de datos para esta pieza.

Cada tarjeta: foto (o, hasta que existan fotos reales, un tinte derivado del color activo + un ícono de
percha — nunca un ícono de "foto rota") en proporción 4:5, nombre en serif, código, categoría, precio y
stock con el mismo criterio de color semántico que ya usa la tabla (`sinStock`/`stockBajo` → rojo/ámbar/
tinta). Debajo, un swatch por cada color en el que existe el modelo (derivado de `variantes[].color`/
`colorHex`, ya vienen en la respuesta de `fn_productos` — no hace falta pedir nada nuevo): pasar el mouse
por uno cambia el tinte de la tarjeta a ese color (vista previa), un clic lo deja fijo aunque el mouse se
vaya. Un botón sutil — aparece recién al pasar el mouse por la tarjeta, no compite con la foto en reposo —
abre una vista rápida: el `<Modal>` compartido del sistema (`components/ui/Modal.tsx`), con la foto/tinte
ampliado, la lista de variantes (talla/color/precio/costo/código) y accesos a "Ajustar inventario" (el mismo
`AjustarInventarioModal` que ya dispara la tabla) y "Editar".

Explorado en un canvas de diseño antes de escribir código (3 direcciones — editorial sin bordes, muestrario
operativo con tarjeta y stock visible, acento de color con franja lateral); Felipe eligió la operativa y
sobre ella se probó en vivo, ya interactivo, el hover/clic de swatches antes de tocar el repo.

DESCARTÉ mostrar stock por variante o por sede en la vista rápida: no es un dato que `fn_productos` traiga
hoy, y no fue lo que Felipe pidió en esta pasada — quedó evaluada como alternativa a la "vista rápida"
("stock por sede desde la tarjeta") y no elegida, no perdida.

DESCARTÉ reemplazar la tabla: tiene selección múltiple, activar/desactivar en bloque y el detalle de
variantes por fila — ninguna grilla lo reemplaza bien, y la audiencia que Felipe pidió ("ambos por igual":
colaboradoras de sede Y Felipe/líderes) la sigue necesitando para el trabajo operativo fino.

## Lo que queda pendiente (a propósito, fuera de esta pieza)

- **Fotos reales, por color.** `producto_fotos` es hoy una galería a nivel de PRODUCTO (migración
  20260915224500), sin color asociado. Para que el hover de un swatch muestre la FOTO real de ese color (no
  solo su tinte), `producto_fotos` va a necesitar `color_codigo` (nullable, referencia a `colores`) y
  `fn_productos` va a necesitar devolver ese `foto_url` por variante — migración aparte, después de que
  Felipe fotografíe el piloto (3-5 productos, **una foto por cada color**, no una por producto; guía de
  estilo de fondo/encuadre/luz dada en el chat el 2026-09-17). Mientras tanto, el tinte de color hace de
  placeholder honesto — nunca un ícono genérico de "sin foto".
- **Stock por sede desde la tarjeta.** Evaluado junto a "vista rápida" y no elegido en esta pasada — el
  hueco real que cerraría (el semáforo "stock bajo" no dice a qué sede pedirle el traslado) sigue en
  BACKLOG, sección Inventario.

## Addenda — la ropa por sobre los controles (2026-09-17, mismo día)

Construida la primera pieza, Felipe la vio y pidió un paso más: en la Grilla, el Resumen
(la tarjeta de 5 cifras) y `FiltrosProductos` (la tarjeta de 6 campos) competían con la
ropa por el primer vistazo — dos tarjetas grandes antes de ver una sola prenda.

DECIDÍ: en `vista=grilla`, el Resumen deja de ser tarjeta y pasa a una línea bajo el
título — muda si no hay nada que atender (0 para pedir, 0 stock bajo, 0 sin stock no se
imprimen; solo se nombra lo que sí importa). `FiltrosProductos` gana un modo `compacto`:
solo el buscador queda siempre a la vista, el resto (categoría/color/estado/precio/stock)
vive detrás de un botón "Filtros" con contador, que despliega el mismo bloque de campos
de siempre — mismo estado, misma URL, mismo debounce, nada de lógica duplicada. La Tabla
(`vista=tabla`) no se tocó: sigue con las dos tarjetas completas, porque ahí sí se filtra
seguido para el trabajo operativo.

DESCARTÉ un panel flotante (popover con posición absoluta, cierre por clic-afuera): el
mismo resultado con más superficie de bug (z-index, click-outside, Escape) para un cambio
que no lo necesita — un panel que empuja la grilla hacia abajo alcanza.

## Addenda 2 — píldoras con ícono y precio de arrastre (2026-09-17, mismo día)

El panel compacto de la addenda anterior seguía siendo la tarjeta de formulario de
siempre (etiqueta arriba, línea, harto aire) — solo se abría/cerraba, no achicaba el
problema de fondo. Captura de Felipe: "no me convence para nada, ocupa demasiado
espacio y se ve mal".

DECIDÍ: en `vista=grilla` los 6 campos pasan a píldoras (ícono de `lucide-react` +
`<select>` nativo sin caja propia, `aria-label` como etiqueta), todas siempre a la
vista en una sola fila que envuelve en pantallas chicas — nada que abrir. Categoría =
percha, Color = paleta, Estado = check, Stock = caja con lupa. Precio deja de ser dos
`<input>` de texto y pasa a un rango de arrastre (`Slider` de `radix-ui`, ya instalado
— lo usan `toggle.tsx`/`badge.tsx` — sin dependencia nueva): un solo `Slider.Root` con
dos `Slider.Thumb`, 0 a 999, paso 5. El buscador se suma a la fila como una píldora
más (antes tenía su propia etiqueta "Buscar" arriba). El botón "Filtros" y su panel
plegable de la addenda 1 se sacaron enteros: con la fila ya tan chica, un clic extra
para verla dejó de tener sentido.

`onValueChange` del slider llama a los mismos `setPrecioMin`/`setPrecioMax` de
siempre — el debounce de 350 ms que ya escuchaba esos dos estados hace de límite de
frecuencia también para el arrastre, cero lógica nueva. En los extremos (0 o 999)
manda `""`, igual que un campo de texto vacío: "sin tope", no "el precio es
literalmente 0". La Tabla no se tocó — ver Addenda 1.

## Addenda 3 — vuelve el panel plegable, los desplegables ganan estilo propio (2026-09-17, mismo día)

Felipe vio la addenda 2 (todo siempre visible, `<select>` nativo) y pidió volver al
botón "Filtros" plegable y al buscador con etiqueta de la addenda 1 — eso sí le
gustaba — pero conservando las píldoras con ícono, "con más estilo", y pidió
explícitamente vestir también los desplegables.

El problema de fondo: un `<select>` nativo no se puede vestir por dentro — la lista
que se abre la dibuja el sistema operativo, no el CSS de la página. Ninguna cantidad de
clases iba a cerrar ese pedido sobre el control que ya había.

DECIDÍ: Categoría/Color/Estado/Stock pasan de `<select>` nativo a **Radix Select**
(`Select` de `radix-ui`, el mismo paquete que ya usan `toggle.tsx`/`badge.tsx` y el
`Slider` de precio — sin dependencia nueva): un botón disparador con el mismo look de
píldora de antes, y un panel de opciones (`Select.Content`/`Select.Item`) que SÍ es
HTML+CSS normal, vestido igual que cualquier desplegable del sistema (`papel`, borde
`sand`, `shadow-md`, `anim-revelar`). De paso, Color muestra el swatch real de cada
opción (mismo `hex` que ya expone `colores`, sumado a la consulta de `page.tsx`) — y
ese swatch queda también en el botón disparador una vez elegido, porque
`Select.Value` refleja el contenido de `Select.ItemText` de la opción activa.

Radix Select no acepta `value=""` (la reserva para "sin selección"): se resuelve con
un sentinel `TODOS = "__todos__"`, convertido a `""` justo antes de tocar la URL — el
resto de la lógica (estado, debounce, chips) no se entera del cambio.

El botón "Filtros" y el panel plegable vuelven tal como estaban en la Addenda 1,
recién ahora con las píldoras (en vez de la tarjeta de formulario) adentro. El
buscador vuelve a `CampoTexto` con etiqueta "Buscar", en su fila con el botón, como
en la Addenda 1.

## Addenda 4 — sin cajas, el hilo vivo hace de marca (2026-09-17, mismo día)

Felipe: "no me gusta que estén encapsulados en esos rectángulos blancos, quiero que
sigan la estética del sistema" — en contraste, le seguía gustando el botón "Filtros".

La razón de fondo, no solo de gusto: `CampoTexto`/`SelectNativo`/`Segmentado` — todo
campo real del sistema — usa el hilo vivo (`Hilo` de `campos.tsx`, una línea de 1px que
se dibuja en rojo al enfocar), NUNCA una caja con borde. Las píldoras de la addenda 2/3
sí llevaban borde + fondo propio: un patrón genérico de "filter chip", no el idioma real
de CAYLA. El botón "Filtros" es distinto por naturaleza — es una ACCIÓN (abrir/cerrar el
panel), no un campo de datos, y una acción sí puede vestirse de botón.

DECIDÍ: `DesplegablePildora` y `PildoraPrecio` pierden el borde y el fondo — quedan
ícono + texto sueltos sobre el panel, activo el mismo `Hilo` que ya usa el resto del
formulario (`activo={abierto}` en vez de `activo={enfocado}`, mismo componente,
mismo `onOpenChange` de Radix haciendo de disparador). El panel que los agrupa
(`card-cayla` + `divide-x divide-tinta/10`) pasa a ser la ÚNICA superficie — antes
había una caja grande con cinco cajas chicas adentro, ahora es una sola tarjeta con
separadores de 1px, como una barra de herramientas. El valor elegido se distingue por
peso tipográfico (`font-medium` + `text-tinta` vs. `text-tinta/60`), no por color de
fondo — "la profundidad viene de la tipografía y el espacio", como ya dice el propio
brandbook (`globals.css`). El botón "Filtros" no se tocó.

## Addenda 5 — orden por precio, y el color/tipografía del panel (2026-09-17, mismo día)

Felipe: el panel de filtros seguía sin convencerlo ("no le des un color blanco sólido...
cambia a un color tal vez plomo que combine más y dale la tipografía de 'Filtros'"), y
pidió sumar orden por precio ascendente/descendente al lado izquierdo.

**Color y tipografía:** el panel deja `card-cayla` (`bg-papel` + borde `sand`) por
`bg-sand/50` sin borde propio — `sand` ya es, por diseño del sistema, "bordes y
recuadros neutrales" (`globals.css`), el tono correcto para una superficie de
herramienta, no de contenido. El texto de cada píldora pasa a `label-cayla text-[11px]`
— versalitas, mismo tamaño que el botón "Filtros" — en vez de `text-sm` normal.

**Orden por precio:** nuevo parámetro `p_orden` ('precio_asc'|'precio_desc'|null) en
`fn_productos`, ordenando por el precio MÍNIMO del producto (mismo criterio que
`rangoPrecio()` en el cliente). Ver `20260917180000_productos_ordenar_por_precio.sql`
para el detalle SQL (el truco del `case when ... end` en vez de `order by` dinámico).
Nueva píldora "Ordenar" (ícono `ArrowUpDown`), primera de la fila (a la izquierda de
Categoría, como pidió Felipe), reusando `DesplegablePildora` tal cual.

**Casi-error, corregido antes de mostrarlo:** la primera versión de la migración se
armó sobre `20260915160000_productos_listado_filtros.sql` (la definición ORIGINAL de
`fn_productos`) en vez de sobre `20260916100000_punto_reorden.sql` (la que está
REALMENTE viva — le agregó demanda/lead time/punto de reorden y el filtro
`p_stock='reponer'`). Aplicarla tal cual habría revertido el punto de reorden en
local. Se detectó ANTES de tocar el navegador (el propio `paramsFiltrosProductos`
del cliente ya esperaba `f.demanda_diaria` etc., que dejaban de existir) y se corrigió
rehaciendo la migración sobre la base correcta — verificado con `pg_proc` que
`fn_productos` quedó con una sola sobrecarga (10 argumentos), y con SQL directo que
`p_orden` y `p_stock='reponer'`/`punto_reorden` conviven. Aprendizaje: al tocar una
RPC que otra sesión ya extendió, `grep` por el nombre de la función en TODAS las
migraciones antes de escribir el `create or replace` — la primera definición que
aparece casi nunca es la última.

## Addenda 6 — el orden por precio pasa de texto a dos flechas (2026-09-17, mismo día)

Felipe: nada de la palabra "Relevancia" — quería dos flechas, cada una clicable por
separado, que se entienda que ordenan por precio ascendente/descendente. El
desplegable `DesplegablePildora`/`ItemDesplegable` de la addenda 5 se reemplaza por
`BotonesOrdenPrecio`: dos `<button>` icono-solo (`ArrowUp`/`ArrowDown` de
`lucide-react`), sin texto visible — el color (rojo si está activa, `tinta/40` si no)
es la única marca en reposo, y un tooltip (`components/ui/tooltip.tsx`, mismo patrón
que ya usa `PuntoDeVentaCatalogo.tsx`) dice qué hace cada una al pasar el mouse. Clic
en la que ya está activa la apaga (vuelve al orden de siempre); clic en la otra la
reemplaza — nunca las dos a la vez. `p_orden`/la migración no cambiaron, solo el
control que los dispara. Verificado en navegador: cada flecha ordena por separado,
clic repetido en la misma apaga el orden, el chip sigue confirmando en texto qué
orden quedó activo.

## Addenda 7 — cada foto sabe de qué color es (2026-09-17, mismo día)

Felipe preguntó cómo agregar fotos antes de salir a fotografiar el piloto. Respuesta
corta: el formulario de `/productos/[id]/editar` ya subía fotos (Sesión F1,
2026-09-15) — lo que faltaba era que cada foto supiera a qué COLOR pertenece, la
pieza que esta ADR dejaba pendiente desde la primera versión.

DECIDÍ: `producto_fotos` gana `color_codigo` (nullable, FK a `colores`) — ver
`20260917190000_producto_fotos_por_color.sql`. `catalogo_crear_producto`/
`catalogo_actualizar_producto` leen ese campo de cada foto en `p_fotos` (mismo array,
un campo más: `{url, es_principal?, color_codigo?}`) — su firma no cambió, no hizo
falta dropearlas. `fn_productos` sí cambió de forma (columna de salida nueva,
`foto_url`) y se dropeó primero — partiendo esta vez de la versión CORRECTA
(`20260917180000`, con punto de reorden y orden por precio; ver la addenda 5 sobre
el casi-error de basarse en la definición vieja). El join busca la foto de CADA
variante por su propio color — `pf.color_codigo IS NOT DISTINCT FROM v.color_codigo`,
no `=`: en SQL `NULL = NULL` da NULL, no verdadero, así que una variante sin color
(un accesorio) nunca hubiera calzado con una foto sin color usando `=`.

`FotosProducto.tsx` gana un selector de color (reusa `ComboBuscable`, el mismo
control que ya usa cada fila de variante en `ProductoForm.tsx` — no uno nuevo) debajo
de cada miniatura. `ProductosGrilla.tsx` usa `variantes[].fotoUrl`: si el color activo
tiene foto, se muestra con `next/image` (`unoptimized`, mismo patrón que
`FotosProducto.tsx` — el bucket es público, no hace falta el optimizador); si no,
sigue el tinte de siempre. El rótulo "Muestra — color" desaparece solo cuando hay
foto real — ya no hace falta aclarar que es un placeholder.

**Verificado sin poder simular un `<input type=file>` real** (la herramienta de
navegador de esta sesión no puede elegir un archivo del disco): se probó la RPC
directo por SQL (`catalogo_actualizar_producto` con una foto + `color_codigo`,
verificado que la fila queda bien escrita), y el resto de punta a punta en el
navegador — el formulario de edición carga el selector con el color ya elegido, la
Grilla muestra la foto real en el color con foto y el tinte en el que no la tiene,
clic en cada swatch cambia entre las dos correctamente. La subida de bytes en sí
(`subirFotoProducto`) no se tocó — es la misma pieza ya probada en la Sesión F1.

**Error de prueba, no de código:** la llamada de prueba a `catalogo_actualizar_producto`
por SQL no incluyó `p_categoria_id` (no hacía falta para lo que se estaba probando) —
la función lo sobreescribe siempre con lo que reciba, así que le borró la categoría a
"Blusa Emma" hasta que se notó y se corrigió a mano. El formulario real nunca tiene
este problema: siempre manda la categoría vigente, se haya tocado o no. Aprendizaje:
al simular una RPC de escritura a mano, mandar SIEMPRE el valor actual de cada campo
que la función sobreescribe sin condición — no solo el que se quiere probar.

## Cómo se verifica

`pnpm --filter web typecheck` / `lint` en verde, y en el navegador: `/productos?vista=grilla` con los 21
productos reales de producción — swatches cambiando el tinte de la tarjeta al pasar el mouse y quedando
fijos al hacer clic, vista rápida abriendo con "Ajustar inventario" funcionando de punta a punta, y
`/productos` (la tabla, `?vista=tabla`) exactamente como estaba.
