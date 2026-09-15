# BITÁCORA — CAYLA Retail

> 3 líneas por cierre de sesión/paso: fecha, qué se cerró, qué aprendió Felipe.
> Se acumula, no se reescribe — es historia, no un resumen que se actualiza.

## 2026-09-15 (Productos: filtros y paginado server-side — Sesión B1)

Felipe pidió migrar `/productos` del filtrado-en-memoria a filtros en la URL +
Postgres, con tarjetas de resumen y stock bajo/sin stock — cruzando a
propósito la separación documentada "Productos = qué existe, Inventario =
cuánto hay". Confirmado con Felipe antes de construir (protocolo de
pregunta): paginado por NÚMERO de página, no cursor (el catálogo no crece
como un ledger — decisión documentada en la migración), y "stock bajo" se
mide contra un `stock_minimo` NUEVO por producto (no un umbral hardcodeado),
a agregar al mantenedor de ficha por la sesión A1. `fn_productos`/
`fn_productos_resumen` (`20260915160000_productos_listado_filtros.sql`)
agregan y paginan por PRODUCTO, no por fila de variante, para que una prenda
de 12 variantes no corte a la mitad entre dos páginas. Dos bugs reales de
Postgres atrapados recién al probar contra datos (no en el diseño en papel):
`stock_total`/`stock_minimo`/`codigo` son también OUT params de la función,
así que referenciarlos sin calificar dentro del CTE es ambiguo — Postgres no
avisa hasta ejecutar. Y la variante centinela "Cargo especial" (POS, no es
mercadería) aparecía en el catálogo y en "sin stock": se excluye por id,
mismo criterio que ya usa `fn_movimientos`.

Verificado dos veces: con psql directo contra `retail` local (búsqueda,
categoría, color, precio, estado, sin_stock, stock bajo con umbral real,
paginado, exclusión del centinela) y con una petición HTTP real al `next dev`
del propio worktree, autenticado reconstruyendo a mano la cookie
`sb-127-auth-token` de `@supabase/ssr` (no hay navegador disponible en esta
sesión) — los filtros por querystring cambiaron el HTML servido, no solo la
consulta SQL aislada. `tsc --noEmit` y `eslint` limpios; tipos de
`fn_productos`/`fn_productos_resumen`/`productos.stock_minimo` agregados a
mano en `packages/database/src/types.ts` (no regenerados: la migración no
está en producción, y regenerar desde local pisaría tipos de producción que
sí lo están — mismo cuidado que ya deja escrito CLAUDE.md).

Lo que Felipe se lleva: **el Postgres local no tiene worktree propio por
sesión — lo comparten las 7 sesiones de Productos y el checkout principal.**
Esta sesión encontró el contenedor reiniciado dos veces en minutos (otra
sesión corriendo `db reset`/`stop`/`start`), perdiendo migraciones recién
probadas sin ningún aviso. No bloqueó el trabajo (se reaplicó y se
reverificó cada vez) pero es una fuente real de confusión mientras dure este
nivel de paralelismo — queda anotado en BACKLOG para que Felipe decida si
vale la pena un Postgres local por sesión.

## 2026-09-15 (Productos: stock mínimo en la ficha — cerrando un hueco entre sesiones)

La sesión de listado/filtros (B1) agregó `retail.productos.stock_minimo` para el
filtro/tarjeta de "stock bajo" en `/productos`, pero esta sesión (A1) ya había
cerrado `catalogo_crear_producto`/`catalogo_actualizar_producto` antes de que esa
columna existiera — quedó un umbral sin dónde escribirse. `20260915170000_stock_
minimo_en_alta_edicion.sql` agrega `p_stock_minimo` (default null, rechaza
negativos) a las dos RPC con `drop` + `create` (agregar un parámetro cambia la
firma); `ProductoForm.tsx` suma el campo "Stock mínimo (opcional)". Se trajo la
migración base de B1 con `git cherry-pick` para que esta rama sea reseteable sola,
sin depender de que ya esté mergeada la otra.

Verificado con psql en una transacción con rollback (crear con umbral 3, limpiarlo
en la edición, rechazo de -1) y con HTTP real a `/productos/nuevo` y
`/productos/[id]/editar` (cookie de `@supabase/ssr` reconstruida a mano — sin
navegador disponible en esta sesión): el campo renderiza y precarga el valor real.

Lo que Felipe se lleva: **un campo nuevo puede quedar "huérfano" cuando dos
sesiones en paralelo tocan el mismo módulo en momentos distintos** — el que agrega
la columna no siempre es el que construye el formulario que la usa. `BACKLOG.md`
es el enganche entre las dos (B1 lo dejó anotado ahí), no la memoria de quien
programó primero.

## 2026-09-15 (Productos: alta y edición de producto+variantes, V2)

`/productos/nuevo` y `/productos/[id]/editar`, sobre `catalogo_crear_producto` /
`catalogo_actualizar_producto` — sin `security definer`: la RLS ya deja escribir a un
Líder, la RPC solo da atomicidad (producto + N variantes en un solo `insert`/`update`, sin
ventana donde el producto exista sin variantes). SKU se sugiere solo (referencia+talla+color)
y queda editable sin gastar el correlativo real; una variante existente no deja tocar
color/talla/sku/`codigo` — solo precio/costo/activo, para no reabrir el hueco que V1 nunca
cerró. Desactivar una variante se permite siempre (decidido con Felipe): es un flag, y
`movimientos` ya es append-only. Quedan dos TODO explícitos en la ficha para Ajustar
inventario (A2) y Ver historial (A3). Verificado en Chrome headless contra Supabase local:
alta con 2 variantes, edición con 3ra variante agregada y precio cambiado, persistencia
confirmada. De paso: dos migraciones del mismo minuto (`produccion_del_taller` /
`reparar_fk_transferencia_items`) rompían `db reset` para cualquier sesión en paralelo —
renombrada la segunda a `115959`, sin tocar contenido. Lo aprendido de la sesión, aparte del
módulo: las 7 sesiones paralelas comparten un solo `git HEAD` (no worktrees separados) —
`db reset` y un `packages/database/src/types.ts` truncado a mitad de escritura por una
carrera entre dos `gen-types` a la vez lo delataron.

## 2026-09-15 (Categorías: editar y desactivar — y un candado que nunca se escribió)

Sesión C1, en paralelo a otras seis sobre Productos. `/productos/categorias` solo tenía
listado + alta desde el portado de V1; se agregó PUT/PATCH (`actualizar_categoria`,
`desactivar_categoria`, `reactivar_categoria`, RPC security-definer igual que
`proveedores_administrables`). Decidido con Felipe: el prefijo queda fijo apenas hay un
producto con esa categoría (el código corto ya puede estar impreso), y desactivar se
bloquea (no solo avisa) si hay productos activos. Al auditar el candado de nombre para el
paso verificable, `categorias.nombre` resultó ser un `unique` plano — "Blusas" y "BLUSAS"
no chocaban, aunque el comentario de `20260914150000_proveedores_administrables.sql` decía
que sí. Se cerró con `categorias_nombre_clave_unica` (mismo `fn_clave_texto` que
colores/proveedores). Verificado en navegador (Playwright) contra Supabase local: rename,
rechazo de duplicado por acento/mayúscula, bloqueo de desactivar con conteo de productos
(2), y desactivar/reactivar de una categoría sin productos. **Hallazgo de entorno:** las 7
sesiones paralelas comparten el mismo working directory de git — un `checkout` ajeno movió
la rama por debajo dos veces durante esta sesión. Se resolvió respaldando los archivos
propios y stageando por nombre explícito, nunca `git add -A`.

## 2026-09-15 (Colores: editar, desactivar y reactivar — el candado de nombre único sigue de pie)

El vocabulario de colores (`/productos/colores`) tenía listado y alta; ahora también edita
(nombre, familia, orden, hex) y desactiva/reactiva vía `activo` — nunca `DELETE` — con un
solo `PATCH` nuevo en `apps/web/app/api/productos/colores/route.ts`, mismo guard de rol
Líder que ya tenía el POST. Antes de desactivar cuenta cuántas `variantes` activas usan ese
`color_codigo` y bloquea si hay alguna: probado en el navegador contra Azul marino (9
variantes activas, bloqueado) y Amarillo (0, desactivó y reactivó sin problema). El HEX no
tiene candado técnico real — nada en `movimientos`/ventas guarda una copia, todo lo resuelve
en vivo desde `colores.hex` (`lib/catalogo-v2.ts`, `lib/inventario-v2.ts`, `lib/produccion.ts`)
— pero el formulario lo esconde detrás de "Cambiar color" para que no se mueva sin querer al
editar otra cosa. Se volvió a probar el candado real (`colores_clave_unica`) renombrando
"Crudo" a "  Amarillo  " y lo sigue rechazando por tildes/mayúsculas/espacios de más.

Lo que Felipe se lleva: verificar en el navegador exigió loguearse sin escribir una
contraseña (regla de la sesión del 2026-09-08) — se generó un magic link con el service role
local y se canjeó por una sesión propia, sin tocar ninguna credencial real; de paso se pisó
el bloqueo de Next a recursos de dev por origen cruzado (`127.0.0.1` vs `localhost`), que no
tiene nada que ver con Colores pero hubiera bloqueado cualquier prueba headless futura contra
este dev server.

## 2026-09-15 (Movimientos también centrado — mismo criterio que Inventario, sin sorpresas esta vez)

Felipe pidió centrar la tabla de Movimientos, "solo ese cambio puntual". Las 6 columnas
(encabezado y filas) pasan a `alinear: "centro"`; las dos celdas con dos y tres líneas
(Prenda, Proceso · Referencia) no usan `celda()` — llevan `sm:text-center` directo, mismo
criterio que el resto (en celular la fila sigue apilada a la izquierda). A diferencia de
Inventario, acá NO apareció el bug del `1fr` en 0px: esta tabla reparte el espacio entre
DOS columnas flexibles (`1.1fr`/`1fr`, no una sola contra seis fijas), así que ninguna
llegó a colapsar en la misma ventana angosta donde se probó — y aunque hubiera pasado,
`ui/Tabla.tsx` ya tiene `overflow-x-auto` desde el arreglo de ayer. Verificado con las
medidas del DOM: 5 columnas visibles con texto centrado, sin desborde a este ancho.

Lo que Felipe se lleva: **la misma corrección, aplicada una vez en el componente
compartido, hizo que centrar la segunda tabla fuera solo estética** — no hubo que repetir
el diagnóstico del día anterior.

## 2026-09-15 (Inventario: la muestra de color pasa a cápsula, la tabla se centra, y un bug real que apareció al probarlo)

Dos ajustes de Felipe sobre lo de hoy: (1) la muestra de color deja de ser un círculo
(`h-3.5 w-3.5 rounded-full`) y pasa a ser una cápsula (`h-3.5 w-7 rounded-full` — mismo
`rounded-full`, pero sobre un rectángulo 2:1, que cierra en semicírculo a cada lado). (2)
Todas las columnas de la tabla de Inventario quedan centradas (encabezado y filas), no solo
Color — `ui/Tabla.tsx` gana el modo `centro` que ya existía en el tipo pero nunca se usaba
(`celda("centro")` ahora también trunca, igual que `izq`).

Al centrar y verificar en el navegador salió un bug real, no de hoy: con las 8 columnas
fijas más angostas que la ventana disponible, la columna Producto (`1fr`) colapsaba a
**0px — invisible, no acortada** — porque `truncate` (`overflow: hidden`) le permite al
navegador ignorar el contenido como mínimo de la pista. No es un bug de centrar: el mismo
`min-w-0 truncate` ya estaba en la versión `izq` de ayer; solo se hizo visible al probar en
una ventana angosta. Arreglo en dos capas: `ui/Tabla.tsx` gana `overflow-x-auto` (beneficia
también a Compras y Movimientos, que comparten el componente); Inventario cambia su `1fr`
por `minmax(8rem, 1fr)` (piso legible tipo "Casaca Ximena" antes de entrar a scroll).
Verificado con las medidas reales del DOM (no solo la foto): columna en 128px con texto
visible, tabla en `scrollWidth 844 > clientWidth 587` (desborda y scrollea, no colapsa).

Lo que Felipe se lleva: **un componente compartido (`ui/Tabla.tsx`) que nunca desborda
silenciosamente es más barato que corregir la misma fuga en cada pantalla que lo usa** —
la próxima tabla con muchas columnas fijas hereda la protección gratis.

## 2026-09-15 (Inventario: el color se ve, y «Reponer piso» avisa antes de que el piso quede vacío)

Dos pedidos puntuales de Felipe sobre la tabla de Inventario. (1) La columna Color deja de
decir «Blanco» y muestra el color: un círculo con el `hex` de `retail.colores` (borde tenue
para que Blanco y Crudo se vean sobre crema); al pasar el mouse el nombre se desliza desde el
círculo hacia la derecha en una pastilla que flota sobre la fila, sin mover nada; en celular
el nombre va siempre al lado. Estampado, Multicolor y Animal print no tienen hex y se dibujan
con una rueda de varios tonos. Pieza nueva y reutilizable: `ui/MuestraColor.tsx`. (2) El
estado «Reponer piso» salta con **4 unidades o menos** en el piso (antes solo con 0), siempre
que haya algo en el almacén para bajar; con el almacén vacío no hay qué reponer y sigue en
«Normal». La regla vive en `lib/inventario-reglas.ts` (`UMBRAL_REPOSICION_PISO = 4`,
`calcularEstado`) con pruebas; la tarjeta «Requieren reposición» y el filtro usan la misma.

Lo que Felipe se lleva: **un umbral es una decisión de negocio y vive en UNA constante con
nombre** — el día que las tiendas pidan 6 en vez de 4, es un número en un archivo, no una
cacería por la pantalla, el filtro y la tarjeta.

## 2026-09-15 (Producción vuelve sobre V2 — y la migración estaba solo en la base)

Felipe pidió restaurar Producción, borrada en el corte V1→V2. La sorpresa: el Postgres
local ya tenía aplicada `20260915120000_produccion_del_taller` (V2-nativa, bien hecha) pero
el `.sql` no existía en ningún branch ni worktree — se reconstruyó desde la base con
`pg_dump` + `pg_get_functiondef` y se validó con `db reset` + diff (idénticas). El reset
delató lo que el dump de tablas no mostraba: el check de `ubicaciones.tipo` también había
cambiado; el Taller pasa a tipo `taller` (ADR-0051). Pantalla nueva sobre las 5 RPC; el
primer intento dio 500 por importar reglas desde un módulo con `next/headers` — de ahí
`produccion-reglas.ts`. Lo que aprendió Felipe: una migración aplicada sin archivo en git
"funciona" hasta el primer `db reset`; y `datos:comparar` es quien avisa que producción
aún no la tiene. Al abrir sesión, `.env.local` apuntaba a producción — arreglado a local.

> **Nota de esta fusión (2026-09-15):** esta sesión y la de Producción numeraron el
> mismo ADR-0050 en paralelo, sin verse — el riesgo de siempre de trabajar en worktrees
> simultáneos (ver memoria «Riesgo de sesiones paralelas»). Se quedó con 0050 el primero
> en llegar a `main` (Movimientos); Producción pasó a ADR-0051, con sus referencias
> corregidas en el mismo commit que resolvió esta fusión.
>
> **Segunda nota (integración de las 7 sesiones de Productos en `diegoN`,
> 2026-09-15):** ADR-0051 volvió a chocar — la sesión de Historial de producto (A3)
> también lo usó, en paralelo y sin verse con Producción, por el mismo motivo de
> siempre. Producción pasa a **ADR-0052** (queda libre); sus referencias en
> `ARQUITECTURA.md` y en el propio archivo se corrigen en el mismo commit que
> resolvió esta integración. Nota aparte para Felipe: `0035` también tiene dos
> archivos con el mismo número — no se tocó acá, queda pendiente de revisar cuándo
> se audite `docs/adr/` completo.

## 2026-09-15 (Movimientos: el modelo ya lo tenía todo; lo que faltaba era leerlo)

Felipe pidió cinco tipos, búsqueda, filtros, detalle y trazabilidad de proceso en
Movimientos, «sin aplicar a ciegas». La auditoría dio que ninguna tabla necesita cambiar:
`retail.movimientos` ya guarda tipo, motivo (el proceso), sububicación origen y destino,
usuario, nota y una FK a cada proceso — y es inmutable. La pantalla era el problema: embeds
sobre los últimos 100, sin filtros, sin el nombre de la persona (otro schema) y con «−» en
todo traslado, incluidos los que entran. `20260915090000_movimientos_lectura.sql` agrega
`fn_movimientos` (una fila plana por movimiento con comprobante/guía/factura/conteo/
devolución/cambio resueltos, categoría y signo calculados en SQL, filtros y cursor
server-side, `security definer` con `p_ubicacion_id` obligatorio) y `fn_movimientos_resumen`;
la categoría INTERNO/TRANSFERENCIA se deriva de `ubicacion_id = ubicacion_destino_id`, no de
un 5.º `tipo` (ADR-0050). Pantalla nueva: resumen del período, filtros en la URL, lista por
día, modal de detalle por proceso, paginado. La variante centinela «Cargo especial» queda
fuera de Movimientos, Inventario e Inicio por constante (`lib/cargo-especial.ts`); el script
de activación piso/almacén que corrió ayer en producción queda versionado
(`activacion-piso-almacen-produccion.sql`). Probado en local: los 7 procesos en el
navegador, filtros, búsqueda por SKU y código de barras, cursor 50+46 en Taller, Micaela
fija en Trujillo y rechazada por la base al pedir Lima; 165.000 filas sintéticas → ~30 ms.
**Solo local hasta el merge.** Mismo día, más tarde: PR #33 mergeado (`9a23290`), Vercel
en verde, y la migración aplicada en producción con `execute_sql` — verificada como
Benjamin en Tienda AQP con rollback (288 entradas de carga inicial, 288 internas de la
activación, centinela excluida). Las tres migraciones aplicadas a mano (`…230000`,
`…231015`, `…090000`) quedaron registradas en `schema_migrations`.

Cierre del día: `docs/datos/generado/` se refrescó desde producción (siete volcados
copiados en trozos y verificados con md5 contra la base real; `scripts/datos/generar.mjs`
aprendió el mapa de módulos de V2) y `pnpm datos:comparar` volvió a servir: 0 pantallas
rotas. Al comparar producción contra local, tabla por tabla, salió UNA diferencia:
`transferencia_items.movimiento_id` apunta a sí misma en producción. Comprobado con
rollback que la primera transferencia entre sedes habría fallado entera; la reparación es
`20260915120000_reparar_fk_transferencia_items.sql`, pendiente de aplicar con el ok de
Felipe. De paso: el detalle de un movimiento ahora vive en la URL (`?mov=`) y Buscar deja
fuera la centinela.

Lo que Felipe se lleva: **cuando el enunciado pide «un tipo nuevo», primero hay que mirar
si ya está escrito en dos columnas** — INTERNO es un traslado cuya sede de origen y destino
coinciden; guardarlo como quinto tipo obligaría al motor de stock a aprender una rama más
para un hecho que ya sabe. Y un centinela que vive en el ledger no se borra: se excluye al
leer, por su id, en todos los lugares que cuentan unidades.

## 2026-09-15 (Ajustar inventario: un modal, ninguna vía de escritura nueva)

Sesión A2, en paralelo a otras seis sobre Productos. `AjustarInventarioModal.tsx` no
inventa cómo escribir stock: reusa `retail.registrar_movimiento` (tipo='ajuste'), la misma
RPC que ya existía desde `20260914230000_inventario_piso_almacen.sql` — la guarda de
negativos (ADR-0023) sigue viviendo solo en `fn_aplicar_movimiento`. Motivos nuevos
(`reposicion`/`merma`/`conteo_fisico`/`otro`) sumados a `ETIQUETA_PROCESO` en
`movimientos-reglas.ts`, deliberadamente distintos de `conteo` — ese lo escribe solo
`cerrar_conteo`, con `conteo_item_id` enlazado al conteo formal. La pantalla valida el
negativo con el stock ya cargado (sin viaje a la base) y la RPC queda como red real; probado
en Chrome headless con Tienda Lima (separa piso/almacén): 6 variantes de Blusa Valentina
cargadas, un `-2` sobre stock 0 bloqueado en pantalla sin llamar a la RPC, dos ajustes
positivos confirmados y visibles en `/movimientos` como AJUSTE · Conteo físico (manual).
Como la ficha de producto real no existe aún (la arma la Sesión A1), quedó una ruta demo en
`/productos/dev-ajustar-inventario` — nació como `_dev/` según el enunciado, pero Next.js
excluye del ruteo cualquier carpeta con prefijo `_` (404 real, no hipotético); se renombró
sin el guion bajo. **TODO(B2):** borrar esa ruta al conectar el modal al menú de acciones
de la lista real.

## 2026-09-14 (una sola registrar_venta: el piso de Inventario y la nota de Vender se pisaron sin verse)

Al cerrar las dos sesiones de Vender y fusionar los 14 commits ajenos de la tarde apareció el
conflicto que ningún diff mostraba: Inventario (`inventario_piso_almacen.sql`) recreó
`registrar_venta` con 9 parámetros y el cuerpo que descuenta del piso; las tres migraciones
de Vender la llevaron a 11 con `drop` de la firma anterior — y al pegarlas en producción se
borró justo la versión piso. Quedó una función que valida precio, código y nota pero
descuenta por (variante, ubicación) sobre una `stock` que ya admite varias filas por prenda.
No rompió nada porque ninguna tienda tiene sububicaciones todavía. `…231015_registrar_venta_
piso_con_nota.sql` deja UNA función con todo (son literalmente dos líneas de diferencia:
`v_sub` y la columna en el `insert into movimientos`), y `fn_stock_por_sede` pasa a sumar
piso+almacén por sede (D12). Probado en local dentro de una transacción con rollback: la venta
bajó el piso 4→3, el almacén siguió en 2, la nota quedó guardada. De paso: la migración de la
izquierda chocaba de versión (`220000`) con una de Compras ya pública → renombrada a `220001`.

Lo que Felipe se lleva: **dos migraciones que redefinen la misma función son un conflicto
aunque git no lo vea** — y el orden en que se pegan en producción decide cuál sobrevive.
Cualquier cambio futuro de `registrar_venta` empieza por `drop function` con la firma de 11.
Y antes de crear piso/almacén en una tienda real, el stock «sin sububicación» se lleva al piso
con `mover_interno(…, null, piso, …)`; si no, la primera venta falla por «sin stock».

## 2026-09-14 (poner al día el Postgres local de un colaborador sin reset)

Al validar la base local contra `supabase/migrations/` faltaban 11 de 30 en el historial, pero
el esquema real contaba otra historia: 7 de Compras (`150000`…`220000`) ya estaban pegadas a
mano sin registrarse, `0014`-`0016` y `movimientos_inmutables` faltaban de verdad, y `0014`
reventaba porque el stub `0000_local_stub_dynamic.sql` (fuera de git) era anterior a `f1dba0d` y
no tenía `datos_personales`/`foto_url`/`fn_actualizar_foto_perfil`. Se aplicó el delta del stub a
`public`, se copió la plantilla nueva sobre el stub, `migration repair --status applied` para las
7 ya presentes y `migration up --include-all` para las 4 restantes. Sin `db reset`: se conservaron
6 compras, 3 ventas y 105 movimientos de prueba. Verificado en Postgres, no por el registro: el
trigger de inmutabilidad frena un `update` incluso como superusuario.

Lo que se lleva: **después de un `git pull` con migraciones ajenas hay que mirar dos cosas, no
una** — el historial de Supabase Y si la plantilla del stub cambió; y pegar SQL a mano en local
sin registrarlo deja la base "adelantada" y el CLI mintiendo hasta que alguien repara el historial.

## 2026-09-14 (recibir por curva de tallas)

Diego pasó una captura de Recibir mercadería: las líneas facturadas sin talla ni color
("Blusa Emma x 24") se repartían en una hilera de chips con un `0` cada uno, y con 5 tallas ×
3 colores era una pared donde no se veía qué estaba contado. Se cambió por la curva de tallas
que taller y tiendas ya usan de cabeza: filas = color, columnas = talla (orden canónico nuevo en
`lib/tallas.ts`), celda resaltada cuando tiene unidades, total por fila; el avance de cada línea
y de cada factura es ahora un chip ámbar/verde/rojo, no texto gris; el encabezado de columnas
solo sale cuando hay filas con variante, y "Vaciar" también sirve para las agrupadas. Verificado
en navegador con Playwright contra el Supabase local (escritorio y 375 px, la tabla cabe sin
scroll). No toca RPC ni esquema.

De paso, en Proveedores (misma captura de Diego): la fila era inerte y cada una llevaba
"Editar" + "Desactivar" con el mismo peso. Ahora la fila entera abre las facturas del proveedor
(`/compras?prov=`), el saldo abre Por pagar filtrado, queda una sola acción por fila (Editar /
Reactivar) y Desactivar vive al pie del modal de edición. Solo `ProveedoresPanel.tsx`.

Lo que se lleva: **la pantalla se dibuja con la forma en que la gente ya cuenta la mercadería**,
no con la forma en que la base la guarda — la base sigue viendo variantes sueltas.

## 2026-09-14 (piso de venta y almacén de tienda: la extensión que el código ya anunciaba)

Felipe pidió que Inventario distinga cuánto de una prenda está en el piso
(vendible) y cuánto en el almacén interno de la tienda — una venta nunca
debe descontar del almacén en silencio, y tiene que existir una reposición
explícita y auditable entre los dos. No era una idea nueva para el repo:
`sububicaciones` ya existía (Taller usa "Rack A"/"Rack B"), y `movimientos`/
`conteos` ya tenían `sububicacion_id` opcional desde el primer diseño de
V2 — pero `stock`, la tabla que de verdad importa, nunca ganó esa columna,
y `fn_aplicar_movimiento` la ignoraba. `20260914210000_inventario_piso_
almacen.sql` es ese "después" que el propio comentario de
`inventario-v2.ts` dejaba anunciado.

V1 tuvo esta misma feature (`stock_almacen`, `contenedores`) y tuvo bugs
reales documentados en ADR-0031: una reconstrucción de stock que "olvidó"
el almacén y duplicó mercadería, y un traslado que restó del piso sin sumar
en ningún lado. Por eso cada función que toca `stock` (8 en total —
`fn_aplicar_movimiento`, `recalcular_stock`, `registrar_movimiento`,
`recibir_lote`, `recibir_compras`, `registrar_venta`, `registrar_cambio`,
`aprobar_devolucion`, `transferir`, más `abrir_conteo`/`conteo_contar`/
`cerrar_conteo`/`previsualizar_cierre_conteo`) se revisó una por una, no
solo la que aplica el movimiento. El hallazgo más caro de esa revisión:
`transferir()` — el mecanismo real por el que el Taller abastece a las
tiendas, ejercitado por el seed desde el primer `db reset` — no resolvía
sububicación en ninguna punta; sin el fix habría creado una tercera fila de
stock invisible en la pantalla nueva, o rechazado un traslado con "stock
insuficiente" mostrando stock en pantalla. `traslado` se generalizó para
cubrir movimientos dentro de la misma ubicación (reutiliza el `tipo`,
diferencia con `motivo='movimiento_interno'`) en vez de sumar un tipo
nuevo — un tipo nuevo hubiera duplicado la rama en dos funciones, la clase
exacta de bug que rompió V1.

Verificado en navegador con datos reales, no solo en SQL: reposición de
piso conserva el total (1→5 piso / 9→5 almacén), el POS muestra "Sin
stock" en una prenda con 6 unidades en almacén pero 0 en piso, y un conteo
de piso no confunde el stock de almacén con "nunca contado". `recalcular_
stock()` reconstruye a los mismos saldos, byte a byte, después de una
docena de movimientos reales.

Lo que Felipe se lleva: **una columna que existe pero que ningún motor usa
es una promesa a medias** — `sububicacion_id` llevaba desde el primer
diseño de V2 esperando este día, y encontrarla ya ahí cambió el trabajo de
"diseñar algo nuevo" a "terminar de conectar algo que ya empezó bien”.

## 2026-09-14 (control total temporal termina — Líder y Colaborador, de verdad)

Auditoría de accesos (pedida por Felipe) encontró que `fn_es_lider()` decía
que sí a cualquiera con acceso a retail desde 0012 — sin fecha de
vencimiento. `0016_roles_colaborador.sql` lo cierra: las 9 personas ya
registradas quedan Líder (backfill explícito, "eso no cambia"); un
Colaborador nuevo entra fijo a la sede que se le asigna al darlo de alta
(nunca la de Dynamic) y sin acceso a Compras/Facturación/Colaboradores.
Sorpresa real al revisar: el frontend ya gateaba esas tres pantallas con
`esLider` desde que se escribieron — corrigiendo una sola función en la
base, las tres quedan cerradas sin tocar React.

Encontrado y corregido de paso: a Compras le faltaba el guard de servidor
que Facturación y Colaboradores ya tenían — probado en vivo, una cuenta
Colaborador cargaba `/compras` completo por URL directa aunque el menú lo
escondiera (las escrituras sí estaban bien cerradas, la lectura no).

Aplicado a producción el mismo día junto con `0015_previsualizar_conteo.sql`
(la RPC que le faltaba a la pantalla de Conteo). Verificado después de
pegar, no solo antes: las 9 personas quedaron en `lider`, `agregar_colaborador`
con una sola firma viva, y `public.personas`/`datos_personales`/
`fn_actualizar_foto_perfil` de Dynamic exactamente iguales a como estaban.

## 2026-09-14 (fusionar 13 commits ajenos sobre 34 de Vender: el conflicto de fondo no salía en el diff)

Mientras las dos sesiones de Vender trabajaban, `origin/main` recibió 13 commits de tres
manos con 7 migraciones. Uno de ellos (`d22dad0`, con mensaje «añadir CampoFecha») reescribía
el `PuntoDeVenta.tsx` monolítico para adoptar los avisos globales (ADR-0047). Git lo fusionaba
«limpio» sobre las tres piezas nuevas —las líneas no se pisaban— y dejaba `setError` sin
declarar y un `<p>` de error vivo en el Ticket que el equipo ya había decidido matar. Se vio
compilando la fusión en un branch temporal, no leyendo el diff. Resolución: la guarda de dos
momentos (ADR-0044) manda y el mensaje sale por `avisar.error`; la prop `error` desaparece del
contrato del Ticket. De paso, dos ADR de origin chocaban de número con los de Vender
(0042/0043) → renumerados a 0046/0047. Las 7 migraciones entraron a la base local compartida
con `migration up --include-all`, sin reset y sin perder las ventas de prueba; el CLI solo
frenó porque el worktree no tenía el stub `0000` (fuera de git a propósito) — se copia, no se
«repara» el historial.

Lo que Felipe se lleva: **una fusión sin conflictos no es una fusión correcta** — se compila
y se prueba antes de mover `main`. Y los números de ADR chocan igual que chocaban las
migraciones antes del ADR-0034: cinco personas con push directo a `main` lo garantizan.

## 2026-09-14 («Ventas de hoy» muestra la nota, y el SQL pendiente de producción está medido)

Dos cierres chicos de la sesión A. La nota que B guardó en `ventas.nota` ya se lee en la
fila de «Ventas de hoy» (truncada, completa en `title`, nada si es null). Y el paquete
`docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-14.sql`: se midió contra el catálogo de
producción con una consulta de solo lectura por migración —no contra el registro, porque
lo pegado a mano no siempre se registra— y faltan 7 de 18. Dos sorpresas: `registrar_venta`
allá tiene 9 parámetros y el front ya manda 11 (no desplegar antes de pegar), y la variante
centinela del «Cargo especial» no existe en producción — «Monto manual» está roto allá hoy.

Lo que Felipe se lleva: **el registro de migraciones dice qué se registró, no qué existe.**
Para saber qué le falta a producción se le pregunta al catálogo (`to_regclass`,
`to_regprocedure`, `information_schema`), un booleano por migración.

## 2026-09-14 (la cabecera de Vender enlaza a Caja, Cambios y Devoluciones)

Paso chico en zona del padre. Desde la caja no había cómo llegar a ingreso/egreso y
arqueo, cambio de talla ni devoluciones — `/cambios` ni siquiera está en el menú lateral.
Tres enlaces discretos antes del botón de caja, vivos con la caja cerrada y sin gate de
rol (AppShell ya decide). Lo que enseñó la medición: a 800 px de ancho, con el lateral
abierto, la fila se partía y dejaba el botón suelto en la segunda línea; la salida no fue
ocultar (el `sm:` que se pensó no cubre 800) sino agrupar enlaces y botón en un solo ítem
del flex, que al partirse cae entero a la derecha. Bajo `sm` sí se ocultan.

Lo que Felipe se lleva: **en un `flex-wrap`, lo que debe moverse junto tiene que ser un
solo ítem** — agrupar es lo que decide cómo se parte una fila, no los márgenes.

## 2026-09-14 («Ventas de hoy» firma cada venta con la integrante)

Paso chico de la sesión A. `fn_ventas_del_dia` devolvía `vendedor` desde siempre y la
lista de «Ventas de hoy» no lo pintaba; sin la firma, los objetivos por integrante se
miden a mano. Ahora cada fila lleva a la integrante entre la hora y el comprobante:
primer nombre, inicial del apellido solo si dos integrantes del día se llaman igual
(`lib/nombre-integrante.ts`, 6 tests). Un detalle que importa: la RPC no devuelve `null`
cuando no hay persona sino el relleno «—» — la UI lo trata como nada y no inventa «Sin
integrante». Verificado con las 9 ventas de hoy en Lima. Queda esperando que la sesión
derecha exponga `nota` en la RPC para pintarla en la misma fila.

Lo que Felipe se lleva: **el dato ya estaba; lo que faltaba era leerlo.** Antes de pedir
una migración para "saber quién vendió", mirar qué devuelve la RPC que ya se llama.

## 2026-09-14 (dos arreglos, y la talla agotada dice en qué sede sí hay)

Tercera ola de la sesión A. Dos arreglos pedidos por Felipe: `catalogo-grupos.ts` llevaba
un byte NUL literal dentro del template string de la clave del grupo y git trataba el
archivo como **binario** (sin diff, sin blame) — ahora es el escape `\u001f` en seis
caracteres, y la prueba correcta no es `numstat main~1 main` (marca binario si cualquiera
de los dos lados lo es) sino el archivo entero contra un punto donde no existía: `91 0`,
cero NUL en el blob, `blame` línea a línea. Y el reveal al scroll salió del POS (opción A
de Felipe): dejaba tarjetas en 0.35 mientras las sin stock van en 0.55 — dos atenuados con
significados distintos en la misma grilla; `RevelarAlScroll` sigue en `ui/` para tableros.

Lo nuevo: la talla tachada ya dice **dónde sí hay**. `vender/page.tsx` pide el stock de
todas las sedes y `lib/stock-por-sede.ts` (TDD, 9 tests) lo parte en `aqui` + `otrasSedes`
(solo > 0, sin la actual, de más a menos); el catálogo lo pinta en el tooltip de cada talla
(«3 aquí · 14 en Taller», «Sin stock aquí · 15 en Taller · 5 en Trujillo») y en el
desplegable del escáner. Un hallazgo de paso: `etiquetaSede` (V1) **no tiene ningún uso en
V2** y con las filas de hoy daría «TND» para «Tienda Trujillo» (`ubicaciones` no tiene
`codigo`), así que la sede se nombra por su nombre sin el «Tienda» delante — sin inventar
códigos. Y el freno que pidió Felipe: **RLS**. `stock_select` deja ver solo las sedes que la
persona puede operar; medido con el JWT de Micaela como colaboradora de Trujillo (en una
transacción con rollback): Taller 0 filas, Lima 0, Trujillo 16 — la encargada de sede, que
es justo quien vende «sí hay en Trujillo», recibe `otrasSedes` vacío y la pantalla se queda
en «Sin stock aquí» sin romperse. La salida es una RPC `security definer` de solo cantidades
(`fn_stock_por_sede`), escrita en `20260914220000_stock_por_sede.sql` y **no aplicada**:
esquema en la base compartida no era de esta sesión. Micaela quedó como colaboradora de
Trujillo con un `update` de datos (el `insert` del seed no hacía nada: ya existía como líder
por el backfill de `0016`).

Lo que Felipe se lleva: **una policy de "quién puede operar" no es una policy de "quién
puede saber".** `stock_select` mezcla las dos preguntas, y por eso abrirla para que una
colaboradora vea Trujillo abriría también que opere Trujillo. La RPC separa las preguntas:
expone cantidades y nada más. Y sobre las pruebas: simular la sesión de una colaboradora
con `set local role authenticated` + `request.jwt.claims` dentro de un `begin … rollback`
mide RLS de verdad sin contraseñas ni tocar la base — es la forma de verificar cualquier
policy antes de prometer una pantalla.

## 2026-09-14 (el catálogo se mira por prenda, no por variante — y vuelven shadcn y GSAP)

Segunda ola de la sesión A, sobre lo mismo. Felipe pidió cuatro cosas mirando la grilla
nueva: la barra de scroll del sistema (no la nativa), un borde rojo suave en lo que no
tiene stock, **una tarjeta por prenda + color con las tallas adentro** («cada ítem va a
tener foto, no hace falta ver seis Blusa Emma; la pistola ya trae talla, color y precio»),
y las animaciones "con los componentes de shadcn, para que el sistema tenga un mismo
orden" más el reveal suave al bajar. Dos decisiones fueron suyas: la talla a mano se
elige **en la tarjeta** (chips por talla; el ticket nunca ve una línea sin variante) y no en
el ticket; y shadcn + GSAP **vuelven a V2** — el corte `0af2f1b` los había borrado con sus
ADR (0037/0038) sin que nadie lo decidiera.

El revival chocó de frente: la sesión B lo hizo en paralelo y llegó primera a `main`
(V1 literal, ADR-0045). Esta rama descartó la suya y portó solo lo que faltaba como
adenda: `tooltip`/`toggle`/`badge` instalados con el CLI, que hoy importa `cn` del paquete
`cn` y los primitivos de `radix-ui` — se adopta y `lib/utils.ts` reexporta ese `cn` para
que no haya dos implementaciones; `tw-animate-css` para las entradas/salidas propias de
shadcn; `RevelarAlScroll` que descubre el contenedor que scrollea y no anima lo que ya se
ve al montar (ADR-0011). Lo construido en Vender: `lib/catalogo-grupos.ts` (TDD, 10 tests:
agrupa en el orden del catálogo, tallas XS<S<M<L y 28<30<32, stock total, rango de
precio); tarjeta con hueco de foto 4:5 (iniciales en serif mientras no haya columna de
foto), chips de talla con `Tooltip` «N en sede», talla agotada tachada, sin stock con
`border-rojo-profundo/40`, `Toggle` para «Solo con stock» (esconde la tarjeta solo si
ninguna talla tiene), `Badge` con `anim-asentar` en el globito, `alza-cayla`,
`scroll-cayla` y `RevelarAlScroll` por tarjeta. Medido en navegador a 1440×900: 48 → 16
tarjetas; al montar, las 8 a la vista en opacidad 1 y las de abajo en 0.35 hasta que el
scroll las trae; tocar «M» agrega `BLU-EMMA-BEI-M` y devuelve el foco; tooltip animado
(`enter`, 150 ms); toggle 16 → 10; abrir caja deja el foco en el escáner y la tecla suelta
sigue viva después (el defecto de `hayModal` quedó cerrado de verdad).

Lo que Felipe se lleva: **el revival no era "instalar shadcn", era decidir quién anima
qué.** Tres capas con una responsabilidad cada una — shadcn conserva su `tw-animate` en
sus componentes, todo lo que no es shadcn sigue con `anim-*` de `globals.css`, y GSAP es
solo scroll y reflujo — es lo que hace que "un mismo orden" sea una regla y no un deseo.
Y una trampa del entorno que costó media hora: **`tw-animate-css` no llegaba al CSS
servido** aunque el import, el paquete y el CLI de Tailwind estaban bien; era la caché
persistente de Turbopack (`apps/web/.next`), que sobrevive a reiniciar el servidor. Con
la caché borrada, `.animate-in` y `@keyframes enter` aparecieron a la primera. Aviso:
el borde rojo de las tarjetas sin stock rompe a propósito el "máximo 2 rojos por
pantalla" del brandbook — lo pidió Felipe; queda escrito para que nadie lo "arregle".

## 2026-09-14 (el escaneo manda en Vender; el catálogo pasa a plan B)

Sesión A sobre la costura del ADR-0043, rama `feat/pos-escaneo-primero`. La encargada de
sede tiene lector, pero la pantalla estaba armada como navegador de catálogo: un título
serif de cuatro columnas de alto («Catálogo De Prendas») y recién debajo el campo de
escaneo. Además el foco se perdía en tres lugares que la captura no muestra: `autoFocus`
solo actúa al montar (con la caja cerrada el campo nace `disabled`, y al abrirla nadie lo
enfocaba); al cerrar «Venta registrada» el `Modal` —Radix— hace `preventDefault` del
retorno de foco y busca un trigger que estos modales controlados no tienen, así que el
foco caía al `body`; y si el foco quedaba en un botón (un chip, «Quitar»), la pistola
perdía el código y **el Enter final activaba ese botón**.

Lo construido: el campo de escaneo es lo primero y lo más grande del panel (h-14, ícono de
código de barras, `<section>` con el mismo tope de alto que el ticket para que nunca salga
de la vista); fuera el título; chips + grilla debajo sin encabezado; «Monto manual» al lado
del campo (medido: en la fila de chips le robaba 277 px a las categorías a 1440); sin
stock con borde punteado, fondo plano y `opacity-55`, con el chip «Solo con stock» que
filtra la grilla pero no al escáner (una sin stock escaneada avisa «no tiene stock en
Tienda Lima», no «no encontramos»). El foco vuelve al escáner por tres vías: `Modal`
ganó `alCerrarEnfocar` sobre `onCloseAutoFocus` (los otros 12 modales, idénticos); un
efecto lo enfoca al abrir caja; y una tecla suelta —carácter imprimible con el foco fuera
de un campo de texto, sin modal abierto— lo enfoca antes de que el carácter caiga
(`lib/escaner-tecla-suelta.ts`, TDD, 9 tests). Verificado en navegador con sesión real y
ventas de verdad en la base local (B001-000002 a 000004): pistola + Enter agrega sin mouse;
con el foco en «Quitar» el código se redirige y la línea sobrevive; DNI y modales
conservan sus teclas; «Nueva venta» devuelve el foco al escáner (el stack lo firma:
`Modal … onCloseAutoFocus`). El padre se tocó en dos commits chicos que entraron a
`main` local apenas compilaron; el único conflicto con B fue la línea anunciada
(«Venta registrada»: `onClose` de B + `alCerrarEnfocar` de A), resuelto conservando ambas.

Lo que Felipe se lleva: **la pistola es un teclado, y un teclado escribe donde esté el
foco.** Toda la jerarquía visual no sirve si después de tocar un chip el siguiente
escaneo cae en un botón; por eso la regla de «qué tecla va al escáner» vive en `lib/`
con prueba y no en un `onClick` más. Y un segundo aprendizaje del propio código: la guarda
de «hay modal abierto» tiene que mirar los modales **montados**, no el estado que los
abre — «Abrir caja» se desmonta porque la caja abrió, no por su `onClose`, y el estado
queda en `"abrir"` para siempre. Hallazgos que quedan en el backlog: el buscador global
del AppShell es un segundo campo de escaneo en la misma pantalla (Enter navega a
`/buscar` y abandona la venta), y el «Cargo especial» tiene stock 0 en la base local.

## 2026-09-14 (el ticket de Vender deja de pedir decisiones antes de que exista la venta)

Sesión B sobre la costura del ADR-0043: con el ticket vacío el panel derecho ya mostraba
los cinco métodos de pago, Boleta/Factura, el DNI y dos «(!)» encendidos. El diagnóstico
midió tres causas y ninguna era la que parecía: no existía el concepto de momento (el pie
se renderizaba entero siempre); los (!) **no eran advertencias sino `Ayuda`**, el botón
de docencia del 19-jul, que usa el glifo «!» y por eso se lee como alerta; y nunca
«faltaba» nada porque `efectivo` venía preseleccionado — la única condición de bloqueo
real (`facturaSinRuc`) apagaba el botón en silencio. Felipe decidió las tres cosas que
el diagnóstico dejó sobre la mesa: método sin preselección, los (!) del cobro pasan a
significar «falta algo», y el cobro va dentro del panel, no en un modal (ADR-0044).

Lo construido: el padre aprende `momento` («armar» / «cobrar») y un único
`motivoBloqueoCobro` (`lib/vender-reglas.ts`, TDD, 7 tests) que alimenta a la vez el
`disabled` del botón, la línea que lo explica debajo y el freno de `cobrar()`. El
ticket sigue siendo render puro: en «armar» solo líneas y total; en «cobrar» primero
cuánto y cómo pagó, después el comprobante con el documento adentro, «← Ticket» para
volver sin perder lo elegido. `Ayuda` acepta `tono="falta"` con default byte a byte
igual (probado con `renderToString` contra la versión anterior). Se respetó el protocolo
del ADR-0043 al pie: el commit del padre entró a `main` local apenas compiló; la UI
después, en su archivo. Verificado en navegador con sesión real y una venta de verdad en
la base local (Boleta B001-000001, S/159.80, efectivo): vacío → prenda → Cobrar → método
→ boleta → «Venta registrada» → vuelve a «armar», y escanear durante el cobro sigue
sumando al ticket con el total en vivo.

Lo que Felipe se lleva: **un mismo glifo no puede significar dos cosas en la misma
pantalla.** El (!) de docencia y el (!) de alerta compartían forma, así que la ayuda se
leía como reproche permanente; la salida no fue un tercer ícono sino darle al (!) del
cobro una sola regla —aparece solo cuando falta algo y dice qué— y dejar la docencia
dentro de ese mismo globo. Y el reverso: **un botón apagado que no explica por qué es
una decisión escondida**; un solo motivo derivado una vez evita que el `disabled`, el
mensaje y la validación digan cosas distintas.

Adenda del mismo día: Felipe pidió que el ticket llene toda la altura visible y que la
página no scrollee. Resultó que el catálogo **ya tenía** su scroll interno y no se
activaba porque nada acotaba la altura: la raíz toma `100dvh − 9rem` (el padding del
`<main>` de AppShell, sin tocarlo) y la fila de la grilla pasa a `minmax(0,1fr)` para que
los paneles puedan encoger. Lo que Felipe se lleva: **un `overflow-y-auto` no scrollea
solo — necesita que algo por encima le ponga tope**; sin la cadena de `min-h-0` hasta la
raíz, el contenedor crece y el `overflow-hidden` de arriba recorta en silencio.

Tercera vuelta del día sobre el ticket: precio de solo lectura, basurero en «1», campo sin
flechitas, «Ticket actual» grande, íconos por apartado y un **apartado de descuento** (%
global o por prenda) que viaja como `descuento_unitario` por línea — la columna que
`venta_items` ya tenía. Al pedir «los componentes animados de shadcn, tal vez ya
existentes» se midió que **no existían**: el corte V1→V2 (`0af2f1b`) se había llevado el
puente shadcn (ADR-0037), GSAP con el `Flip` del carrito (ADR-0038) y los tres ADR, sin
dejarlo escrito en ningún documento vivo — `docs/adr/` saltaba de 0036 a 0041 y nadie lo
había notado. Felipe decidió traerlos de vuelta tal cual (ADR-0045), y el `Flip` volvió al
lugar que tenía en V1: el reflujo de las líneas del ticket. Los códigos de descuento
quedaron como paso propio (no hay tabla). Verificado en navegador con venta real: Boleta
B001-000005, dos líneas `79.90 / 7.99 / 71.91`, total 143.82.

Lo que Felipe se lleva: **un corte grande borra cosas que nadie decidió borrar** — la
pregunta al reemplazar un núcleo no es solo "¿qué se pierde de negocio?" sino "¿qué se
pierde de infraestructura que otro ADR ya había decidido?". La huella era visible en la
numeración de los ADR. Y el reverso: **restaurar no es rehacer** — se trajo lo que había,
con las mismas versiones y el mismo texto, y lo de Finanzas V1 se dejó ir a propósito.

## 2026-09-14 (el ticket aprende a esperar: Park/Resume sin tabla)

Séptima vuelta. Si una clienta iba a probarse otra talla, la caja quedaba tomada. Felipe
pidió el «ticket en espera» sin tabla y «bien desde el inicio» porque la cola offline va a
usar el mismo almacén: nació `lib/almacen-local.ts` (llave `cayla:vender:<sede>:<uso>`,
puro, con 9 tests que fijan lo que importa — en el servidor es inerte y con el storage
lleno, bloqueado o con JSON roto degrada a «no se guardó» / «no había nada», nunca a una
excepción a mitad de un cobro). El padre carga la espera **después de montar** (el lint
lo marca; el `eslint-disable` lleva el motivo, misma decisión del 10-sep), la vacía al
cerrar caja con el patrón «previo + comparación» que documenta React, y el ticket suma
el momento «espera» (chip, lista con hora/prendas/total/nota, Retomar) y «Dejar en
espera». Decisiones de Felipe: tope 5 (el sexto avisa), retomar intercambia, al cerrar caja
se vacía, sin reserva de stock. Verificado de punta a punta en navegador, con el cierre de
caja real al final (avisado antes) — chip fuera y llave borrada.

Lo que Felipe se lleva: **hay estado que es del mostrador, no del negocio.** Un ticket que
todavía no se cobró no es una venta ni una reserva; meterlo en la base habría obligado a
inventarle limpieza, permisos y sincronización para algo que vive en una caja y muere al
cerrarla. Y el reverso: **lo que vive en el navegador se lee después de hidratar** — el
servidor no tiene `localStorage`, y leerlo durante el render es la desincronización que
React castiga; el efecto es el lugar correcto aunque el lint proteste.

## 2026-09-14 (la venta aprende a llevar una nota)

Sexta vuelta, corta: «lo recoge el sábado», «va con arreglo de bastilla» — la venta no
tenía dónde guardarlo. Una migración con timestamp: `ventas.nota` (≤ 200), `registrar_venta`
con `p_nota` (vacía → null) y `fn_ventas_del_dia` recreada con `nota` al final (drop +
create: cambia el `returns table`). El campo va en «armar», bajo las líneas y solo con
ticket no vacío: la nota nace con la clienta al frente y es parte del ticket, no del cobro
— el ticket en espera la guardará con las líneas. Contador recién al pasar de 160; no va al
comprobante. Mismo protocolo de base compartida (aviso a A, `migration up`, sin reset);
probado en psql con rollback (recorte, vacío → null, 201 → `ventas_nota_corta`, ya
traducido con test en rojo primero) y en navegador con venta real (B001-000008).

Lo que Felipe se lleva: **cuándo una columna nueva obliga a recrear una función** —
`create or replace` no puede cambiar el `returns table` de `fn_ventas_del_dia`, así que
sumarle `nota` es drop + create, y por eso la migración lo dice en su cabecera: quien
la vuelva a recrear sin `nota` deja «Ventas de hoy» muda sin que nada avise.

## 2026-09-14 (la base deja de confiar en el precio del navegador; el descuento pide código)

Quinta vuelta sobre Vender, y la primera en la base. La caja ya no editaba el precio,
pero `registrar_venta` (0011) seguía insertando `precio_unitario` y `descuento_unitario`
tal cual llegaban — un candado de pantalla. Dos migraciones con timestamp
(ADR-0048): la RPC compara cada precio con `variantes.precio` antes de escribir nada
(salvo el Cargo especial, precio libre por diseño) y levanta un nombre estable con la
prenda en `detail`; y la tabla `codigos_descuento` + `p_codigo_descuento`, con la regla
que decidió Felipe: un Líder descuenta sin código, una Colaboradora necesita uno válido
y su % es el tope por línea. `error-escritura.ts` aprendió a armar la frase con el
detalle («El precio de Blusa Emma (BLU-EMMA-BEI-S) cambió: quítala del ticket y vuelve
a agregarla»), con los tests en rojo primero. Protocolo de base compartida cumplido:
aviso a la sesión del panel izquierdo, `migration up --include-all` (que aplicó también
su `stock_por_sede`, pendiente), sin `db reset`. Siete casos probados en psql, cada uno
en una transacción con `rollback`, y uno por HTTP contra PostgREST; el caso del tope
destapó un `format('%')` inválido en un `hint`, corregido antes del commit.

Lo que Felipe se lleva: **la regla vive donde no se puede esquivar.** Esconder el campo
de precio en la pantalla no protege de una llamada hecha a mano; la comparación con el
catálogo dentro de la RPC sí, y con el mismo mensaje para la pantalla y para la consola.
Y el reverso: **el nombre del error es parte del contrato** — la RPC levanta un nombre
estable y el traductor pone la frase; si mañana alguien cambia el nombre en la migración
y no en el traductor, la colaboradora lee `venta_precio_cambiado` crudo en el mostrador,
que es exactamente lo que los cuatro tests nuevos vigilan.

## 2026-09-14 (el cobro deja de ser de un solo medio: pago mixto y vuelto)

Cuarta vuelta sobre el ticket. «Yape + efectivo» es la venta más común de la tienda y los
métodos eran excluyentes — y la base ya lo soportaba entera (`p_pagos` como lista, cuadre
al centavo, una fila por medio en `venta_pagos`): faltaba la pantalla. Antes de dibujar se
miró `LineasPago` (llegó de Compras el mismo día) y se decidió NO reusarlo: es un
formulario contable y el POS es táctil; se le copió la separación de reglas puras y el
copy. Reglas con TDD (30/30: restante a 2 decimales, vuelto solo en efectivo y nunca
negativo, `motivoBloqueoCobro` con «Falta cubrir S/X» y «Los pagos superan el total»),
padre en un commit chico a `main`, y el bloque en el ticket: tocar un ícono agrega su
fila con lo que falta, «Recibido» con teclas que suman billetes y «Vuelto» grande que se
muestra y no se graba. Verificado con venta real: Boleta B001-000006, `venta_pagos` con
`efectivo 109.80` + `yape 50.00`, «efectivo + yape» en Ventas de hoy.

Lo que Felipe se lleva: **lo recibido y lo que cubre son dos números distintos, y solo uno
viaja.** Mandar los S/120 que entregó la clienta en vez de los S/109.80 que cubre habría
hecho que `registrar_venta` rechace la venta por no cuadrar — el vuelto es una resta de
mostrador, no un dato de la venta. Y el reverso, otra vez: **la base ya sabía hacerlo**; la
pregunta antes de construir fue «¿qué falta de verdad?», y la respuesta era solo la
pantalla.

## 2026-09-14 (Vender se parte en tres para que dos sesiones trabajen a la vez)

Refactor puro de `PuntoDeVenta.tsx` (705 → 415 líneas) en dos commits: primero el ticket
(`PuntoDeVentaTicket.tsx`), después el catálogo (`PuntoDeVentaCatalogo.tsx`). El padre se
queda con TODO el estado, los handlers, la cabecera y los modales; los hijos son render puro
sobre props `valor`/`onValor`. Cero cambios medidos, no supuestos: `renderToString` de la
versión original y la final es byte a byte idéntico (ids de `useId` incluidos), el HTML del
servidor para `/vender` da el mismo sha256, y las interacciones responden igual. ADR-0043
deja el contrato y las cinco reglas de convivencia para las dos ramas que salen de acá.

Lo que Felipe se lleva: **la costura vale más que el corte**. Partir un archivo no evita
conflictos por sí solo — lo que los evita es que cada sesión sea dueña de un archivo y que
lo compartido (el padre) se toque en commits chicos que entran a `main` apenas compilan.
De paso, dos detalles del arnés: el panel del navegador oculto deja las cargas duras en
«Cargando…» (ya estaba en memoria) y **dos `next dev` en `localhost` comparten la cookie de
Supabase** — al pisarse el refresh token, la sesión de uno cierra la del otro.

## 2026-09-14 (la primera vez que el sistema guarda un archivo)

Felipe pidió adjuntar la factura del proveedor y sus documentos. Antes de escribir se
verificó que el ERP no guardaba ningún archivo todavía — así que las decisiones son las que
van a heredar las fotos de producto y lo que venga (ADR-0046): bucket privado con prefijo
`retail-` (el proyecto es compartido con Dynamic) y URL firmada de una hora; la tabla
`compra_adjuntos` es la verdad y se escribe solo por RPC, que exige que la ruta viva en la
carpeta de esa compra; el archivo sube del navegador al bucket sin pasar por Next; nunca se
borra, se archiva. En local Storage está apagado y el Postgres ni tiene el schema, así que la
migración crea el bucket solo si existe `storage.buckets`; las 5 reglas de la RPC se probaron
con psql como persona autenticada. La subida real queda para producción.

Lo que Felipe se lleva: **cuando algo se hace por primera vez en el sistema, el costo de
decidirlo bien se paga una vez y el de decidirlo mal se paga en cada copia** — por eso un
"botón para subir un PDF" terminó en un ADR.

## 2026-09-14 (Compras se rediseña sin tocar una regla)

Felipe pidió un prompt para que Lovable rediseñara Compras "más amigable e intuitivo", y
después que los ajustes los hiciera yo. Se hicieron sobre el módulo real, sin migración ni
RPC nueva: filtros en dos niveles (principales a la vista, el resto bajo "Más filtros", lo
aplicado como chips con ×), chips de estado con tono (`ui/Chip.tsx`, misma receta de
Facturación), tarjetas de cifras que llevan a donde se actúa ("1 vencida" → Por pagar
filtrado), detalle con dos barras (pago y recepción) en vez de cuatro cajas iguales, "Por
pagar" partido en Vencidas / Al día con botón Pagar en la fila (mismo modal del detalle: un
pago sigue siendo contra UNA factura), combobox con búsqueda para el producto de cada línea
(`ui/ComboBuscable.tsx` — el `<select>` con 300 referencias no se aguantaba), pie fijo con
el total y el botón en Registrar factura, barra fija con "N unidades de M facturas → sede"
en Recibir, esqueleto de carga propio, y Compras a todo el ancho como Vender (pedido de
Felipe). Verificado con tsc y eslint; el paseo en navegador queda para Felipe.

Después, sobre lo mismo: Proveedores ganó buscador en memoria (una línea a todo el ancho) y
la columna Acciones dejó de apilar los botones; la tarjeta de SUNAT quedó sin relleno porque
`bg-papel` se veía blanco sobre el crema del modal; y Recibir mercadería se rehízo como
**lista + panel** (Felipe eligió entre lista+panel, recibir desde el detalle, y asistente de
3 pasos): pendientes a la izquierda con buscador, la guía a la derecha con "Todo llegó" /
"Nada" por factura y "+ Sumar" para las del mismo proveedor. Misma RPC `recibir_compras`,
mismo reparto por variante.

Lo que Felipe se lleva: **rediseñar una pantalla y cambiar una regla son dos trabajos
distintos** — todo lo de arriba cambió cómo se ve y cómo se llega, y ninguna RPC ni `check`
se movió. Si un rediseño obliga a tocar la base, es que no era un rediseño.

## 2026-09-14 (el IGV solo existe en la factura)

Felipe preguntó si al elegir "nota de venta" el IGV no debería irse a cero, porque ese
documento no se informa. Sí — y el hueco era mayor: el "IGV %" era un campo libre en 18
para cualquier tipo, y `registrar_compra` aceptaba lo que le mandaran. Una nota de venta
registrada con 18% encima hacía que "Por pagar" le debiera al proveedor un 18% más de lo
que dice el papel. La regla no es de CAYLA, es de SUNAT: solo la factura discrimina IGV y
da crédito fiscal; en boleta y nota de venta el precio del papel ya es el costo. Se puso
como `check` en `compras` (frena a la RPC, a la importación futura y al SQL pegado a
mano), la pantalla acomoda el IGV sola al cambiar de tipo y bloquea el campo con la razón,
y `error-escritura.ts` traduce el candado por si algún camino lo esquiva.

Lo que Felipe se lleva: **cuando una pregunta de negocio se responde con "sí, la pantalla
debería…", la respuesta completa es "sí, y la base también"** — la pantalla es cortesía; el
candado es lo que evita que el próximo camino de escritura repita el error.

## 2026-09-14 (Proveedores: la puerta del módulo de Compras que faltaba)

Felipe miró las tres pestañas de Compras y preguntó dónde se administraban los
proveedores. En ningún lado: `CompraFormV2` pintaba un `<select>` con lo que hubiera en
`retail.proveedores`, y el único camino para meter uno era el SQL Editor — o sea que el
día que llegara un proveedor nuevo no se podía registrar su factura. Se construyó
`/compras/proveedores` como primera pestaña, con alta (RUC → razón social desde SUNAT por
`/api/padron`, el mismo camino que Facturación), edición y desactivar/reactivar —
"desactivar", no "archivar", corrección de Felipe: la columna es `activo` y el par tiene
que decir lo mismo que la columna. Todo por RPC, como el resto del repo, y con los dos
candados que faltaban: RUC único y nombre normalizado único sobre `fn_clave_texto`, el
mismo normalizador que cerró `colores` el 12-sep.

En el cierre pasó algo que vale más que la pantalla: al correr `pnpm datos:generar` como
manda la regla de oro de CLAUDE.md, el diccionario de producción (45 tablas, 63 de Dynamic)
quedó pisado con la foto local (37 y 2). El repo tenía dos instrucciones contradictorias
—`datos:generar` en CLAUDE.md y README, `datos:generar:produccion` en COMO-REFRESCAR— y
obedecer la primera rompía la promesa de la segunda. Se revirtió con `git checkout` y se
corrigieron las dos fuentes para que digan lo mismo.

Lo que Felipe se lleva: **una tabla que existe pero que ninguna pantalla escribe es un
cuello de botella con nombre propio**, y aparece justo cuando el negocio lo necesita (un
proveedor nuevo, un viernes). Y la segunda: cuando dos documentos del repo dan
instrucciones distintas para lo mismo, no es un detalle de redacción — uno de los dos va a
destruir el trabajo del otro, y el que lo ejecuta no se entera hasta ver el diff.

## 2026-09-14 (la base local atrasada no se arregla bajando producción)

Felipe pidió "tener la base de producción en local otra vez": el equipo había subido
código y migraciones a `main` y corrido esas migraciones en el servidor, así que su
local ya no servía. El diagnóstico salió más barato que el pedido: el repo tenía 19
migraciones y el Postgres local solo 15 aplicadas — faltaban `0013_colaboradores_
autorizados`, `cargo_especial_pos`, `vocabulario_cerrado` y `activos_fijos`, justo las
del 12-sep. `npx supabase db reset` las corrió todas (35 tablas en `retail`, 30 colores,
38 categorías, el candado `colores_clave_unica` puesto). Cero credenciales de producción,
cero datos personales de clientas en la laptop.

Quedó sin responder lo que sí necesitaría producción: **si el servidor tiene lo mismo
que el repo**. La única foto que existe de producción es del 2026-09-12 y es de forma
V1 (`funciones-produccion.txt` lista `abrir_conteo(p_alcance_familia …)`), así que
`pnpm datos:comparar` reporta 23 pantallas rotas contra ella — puede ser drift real o
puede ser que la foto esté vieja, y con lo que hay en el repo no se distingue. Para
resolverlo se dejó `scripts/local/traer-produccion.sh`, que reemplaza al viejo
`restore-cayla-v1.sh` (su dump en `backups/` ya no existe): pide la foto a producción
en el momento, solo lee de allá, y por defecto restaura en el stack local de
`cayla-dynamic` para no pisar el V2 en construcción. Falta la contraseña de la base de
producción para poder correrlo.

Lo que Felipe se lleva: **"mi base está desactualizada" casi nunca significa "necesito
producción"** — significa que faltan correr las migraciones que ya están en el repo. Bajar
producción es la herramienta para otra pregunta distinta (¿el servidor tiene lo mismo que
el repo?), y trae consigo datos reales de clientas a una laptop, que no es gratis. También:
cuatro archivos de `supabase/migrations/` (`benja-migracion.sql`, `colaboradores-iniciales-
produccion.sql`, `datos-prueba-catalogo-produccion.sql`, `datos-reales-produccion.sql`)
**nunca corren en local** — el CLI los salta por no tener nombre `<timestamp>_nombre.sql`,
y lo dice en una línea que se pierde entre las otras veinte.

## 2026-09-14 (el candado que faltaba sobre el pasado, y el conteo ciego que no era ciego)

Con el entorno ya verificado, Felipe pidió leer `docs/datos/` para ver qué falta desde
la base. Primer hallazgo de método: esa carpeta audita **producción** (45 tablas, el
proyecto de Dynamic) con referencias de código **V1**, y el corte V1→V2 las dejó
apuntando a archivos que ya no existen — pero lo que dice de producción sigue siendo
cierto, porque producción no cambia sola. Reconciliar los 15 huecos del módulo de
ventas contra el código y la base V2 reales mostró tres grupos distintos: los que V2
arregló solo al reconstruir (venta↔comprobante en la misma transacción, candados por
línea en `venta_items`/`venta_pagos`, el bug del `NULL` neutralizado dentro de
`fn_puede_operar_ubicacion`, la caja sin policy de UPDATE), los que heredó intactos, y
uno que **empeoró**.

Se cerraron dos. **ADR-0042:** `movimientos` —la única fuente desde la que se
reconstruye el stock— pasó de "nadie lo edita por costumbre" a no poder editarse:
disparador `before update or delete` más el retiro de `UPDATE`/`DELETE`/`TRUNCATE` a
`authenticated`. Se verificó antes de escribirlo que ninguna función del schema toca el
pasado (cero filas), y se probó en rojo después: las dos operaciones fallan con mensaje
en castellano y las 105 filas quedan intactas. **Y el conteo ciego:** el modal de cierre
mostraba el esperado en su propio subtítulo, así que contar era confirmar, no medir.
Ahora el número sale de la respuesta de `cerrar_caja` —calculado en el instante del
cierre, no al cargar la pantalla— y se muestra después, al lado de lo contado. Probando
eso apareció un defecto que nadie había visto: `router.refresh()` corría junto con el
resultado, el servidor respondía "ya no hay caja abierta", y el modal se desmontaba
antes de que nadie leyera la diferencia — el número por el que se pregunta al día
siguiente, invisible. Se movió el refresco al botón "Listo".

Felipe probó los dos y preguntó qué hacer con la tarjeta "Esperado en el cajón" del
panel, que era la otra mitad del mismo control. Se recomendó quitarla y la decidió así.
El argumento a favor de dejarla resultó más débil de lo que parecía —para saber si
alcanza para dar vuelto se mira el cajón, no la pantalla—, y en contra pesó el
precedente propio de CAYLA: los SINATRA traían cuadres de **−S/6,122 (TRU) y −S/7,675
(LIM) sin fecha de origen**, que es exactamente lo que pasa cuando la diferencia diaria
no se mide. Se quitó también del tipo y de `getResumenCaja`, para que el número ni
siquiera viaje al navegador durante el turno.

Lo que Felipe se lleva: **la pregunta que separa un candado de una costumbre es "¿si
alguien pega un `insert` a mano, entra?"** — `movimientos` se salvaba por omisión (nadie
había escrito la policy), no por decisión, y una omisión no protege contra el dueño de
la tabla ni contra las funciones `security definer`. Y el reverso, que se dijo con todas
las letras al recomendar lo de la tarjeta: **quitarla es fricción, no un candado.** Las
otras cuatro tarjetas permiten sumar el total a mano y `ventas_select` deja consultarlo
desde la consola; el candado real necesita los roles de D-12, que no existen. Quedó
escrito así en el BACKLOG para que nadie lo lea como "conteo ciego resuelto", junto con
la cola offline que V2 perdió respecto de V1 y el "control total temporal" sin fecha.

## 2026-09-14 (preparar el entorno local para POS destapó que el backlog describe un sistema que ya no existe)

Felipe pidió retomar el trabajo local en Vender/Caja (POS) y verificar el entorno antes
de tocar código (rama `claude/local-pos-setup-2bab48`, sin commits propios todavía). La
auditoría de apertura de sesión (BACKLOG.md + BITACORA.md) mostró un hallazgo que cambia
cómo leer ambos documentos: el corte V1→V2 (`0af2f1b`, 2026-09-12, ADR-0035) borró
Finanzas, Producción y buena parte de Inventario V1 — así que casi todo lo que
BACKLOG.md describe en detalle (Facturación con Lucode/SUNAT, EERR, Producción del
Taller) es sobre un V1 que ya no está en el código; solo la entrada de BITÁCORA del
12-sep hablaba de V2. Se agregó un aviso al inicio de BACKLOG.md para que ninguna
sesión futura pierda tiempo con eso — falta la reescritura completa, que es tarea aparte.

Entorno verificado contra el V2 real, no contra los docs: Docker con ambos stacks de
Supabase sanos y sin cruzarse (`cayla-retail` :54421, `cayla-dynamic` :54321 —
confirmado con `pnpm local:donde`), dependencias reinstaladas (lockfile había cambiado,
`node_modules` de este worktree estaba desalineado), y el stub gitignored de Dynamic
(`supabase/migrations/0000_local_stub_dynamic.sql`) copiado de su `.example` — no
existía en este worktree porque cada worktree tiene su propio working directory para
archivos ignorados, aunque todos comparten el mismo Postgres de Docker. `pnpm typecheck`
fallaba con 28 errores `Cannot find module` sobre rutas que V1 ya no tiene — no era
código roto, era `apps/web/.next/types/` cacheado de antes del corte; se borró `.next`
y quedó limpio. Verificado en navegador con sesión real (Felipe Alvarez · Líder ·
Tienda Lima): `/vender` carga catálogo con stock y precios reales, caja abierta,
escaneo listo — sin errores de consola ni de red.

Lo que Felipe se lleva: en un repo con worktrees en paralelo, "el entorno ya funcionó
antes" no significa que funcione en ESTE checkout — Docker/Postgres se comparte entre
worktrees pero los archivos ignorados (`.next`, el stub de Dynamic, a veces
`node_modules`) no, y son justo los que rompen algo "sin razón aparente" al cambiar de
worktree.

## 2026-09-14 (Mi perfil: leer de Dynamic antes de crear tabla propia)

Felipe pidió una ventana "Mi perfil" (foto, teléfono, contraseña) a partir de un
mockup de referencia. El primer diseño proponía columnas nuevas en
`retail.colaboradores` — Felipe lo frenó: "¿ya existen esos datos en Dynamic?".
Sí: teléfono vive en `datos_personales.celular`, y la foto ya tenía autoservicio
real construido en Dynamic (`personas.foto_url` + `fn_actualizar_foto_perfil`,
bucket `fotos-perfil`). `retail.fn_mi_perfil()` extiende el mismo puente de
solo-lectura que ya existía (0009, 0013) para nombre/rol/sede; la escritura de
foto es un wrapper de una línea que delega en la función real de Dynamic, nunca
la reimplementa. Cero columnas nuevas en retail. Ubicación quedó de solo lectura
a propósito — "eso no representa ningún permiso, el tema de permisos se ve más
adelante", corrigiendo el diseño original que la hacía editable por un líder.

Aplicado a producción el mismo día: `0014_perfil.sql` (las dos funciones) y el
rename de "Almacén Principal" a "Taller" en `retail.ubicaciones` (mismo id,
pedido ya probado antes en local). Verificado campo por campo contra la base
real antes de pegar nada — `docs/datos/` (generado 2026-09-12) ya estaba
desactualizado en varios puntos para esa fecha, así que no se le creyó a ciegas.
Con `execute_sql`, nunca `apply_migration` — ya se sabía por qué (deja un rastro
fantasma en el historial de migraciones de Dynamic, no del nuestro).

## 2026-09-12 (vocabulario cerrado + activos fijos: lo rescatable de V1 se porta, no se fusiona)

El corte V1→V2 (`0af2f1b`) dejó `colores`/`categorias` de V2 sin el candado que evita
duplicados ("Azul marino" vs "azul marino" — el mismo bug que V1 tuvo que pagar carísimo
con ADR-0024) y sin código corto de prenda. Un intento real de fusionar la rama V1
(`trix/catalogo-vocabulario`) mostró por qué no correspondía: 350 archivos tocados, la
mayoría módulos enteros que V2 ya había borrado a propósito (Producción, Inventario V1,
Finanzas), y `supabase/migrations/` habría quedado con los dos núcleos completos a la vez
sin que Git lo marcara como conflicto — el peor tipo de "sin errores".

Se portó en cambio solo lo que demostró valer la pena, como migraciones nuevas sobre el
esquema real de V2: `colores_clave_unica` (el candado, vía `fn_clave_texto`) + los 30
colores de CAYLA, `categorias.familia`/`prefijo` + las 37 reales, y el código corto
(`BLU-0042-AZM-M`) — pero acuñado con un TRIGGER en `variantes`, no dentro de una RPC como
en V1: V2 no tiene una única función que cree variantes, así que un trigger cierra la
puerta para cualquier camino de escritura presente o futuro, sin depender de que cada uno
se acuerde de llamarlo (la causa exacta de por qué 3 de 5 caminos quedaron rotos en V1).
De paso se rescató `activos_fijos` (39 filas reales en producción, sin tabla equivalente en
V2) simplificada — sin la FK a `cuentas_contables` que V1 tenía, porque Contabilidad sigue
sin dato real y no se está reconstruyendo hoy.

Lo que Felipe se lleva: **un merge "sin conflictos" no es lo mismo que un merge sano** — Git
solo avisa cuando dos lados tocan la misma línea; cuando un lado borra un archivo entero y
el otro nunca lo tocó, no hay conflicto que resolver, solo una pérdida silenciosa. La
pregunta correcta no era "¿hay errores?" sino "¿qué se pierde?" — y la respuesta salió de
mirar las filas reales de producción, no de adivinar.

## 2026-09-10 (el estándar universal va debajo, no en lugar de)

Felipe preguntó si se podía usar IA para importar el inventario de cada cliente
nuevo. La primera respuesta apuntaba al vocabulario de CAYLA y él la frenó en
seco: **ese vocabulario es de CAYLA**, no sirve para una zapatería ni para una
marca deportiva, y pidió buscar un estándar universal si existía. Existe: la
Shopify Standard Product Taxonomy — MIT, en español, release de hace un mes, 663
categorías de ropa y 8.240 atributos con valores predefinidos. Google Product
Taxonomy lleva congelada desde 2021 y no tiene atributos; los códigos de color y
talla del NRF (hoy GS1 US) cuestan 250 dólares y están pensados para EDI.

**El dato que ordenó todo el diseño: Shopify tiene 19 colores y CAYLA tiene 30.**
El estándar universal es más pobre que el vocabulario propio, y eso no es un
defecto — es lo que significa interoperar. Por eso va DEBAJO y no EN LUGAR DE:
"Arena" sigue siendo Arena para la Líder y es "Beige" para el sistema. Con eso el
trabajo de la IA cambia de naturaleza: deja de ser "adivina a qué categoría de
CAYLA va esto" (imposible de generalizar a otra marca) y pasa a ser "mapea al
universal", que es el mismo trabajo para todos los clientes, para siempre
(ADR-0030). Quedaron cargadas 1.849 categorías y 10.216 valores en local.

Lo que Felipe se lleva: **un estándar de interoperabilidad no es el vocabulario
más rico, es el más compartido** — y por eso se pone debajo del propio en vez de
reemplazarlo. Y la regla que va a gobernar el importador entero: lo que resuelve
el código no se le pregunta a la IA (la mitad de los 30 colores se ancla por
comparación exacta de cadenas, gratis, sin que el modelo los vea). Queda
pendiente ejecutarlo: no hay ANTHROPIC_API_KEY en el entorno, así que la calidad
real de las propuestas del modelo todavía no se ha visto.

## 2026-09-10 (el identificador no es la etiqueta, y el flag prestado no es tuyo)
Felipe preguntó dónde cambiar a mano las letras del selector de sede: quería que
`LIM` dijera Taller y `003` dijera Tienda Lima. No hacía falta escribirlas — la
base ya lo sabía (`nombre` = "Taller LIM" / "Tienda LIM"); la pantalla estaba
mostrando el **identificador** en vez de la **etiqueta**. Son cosas distintas:
`codigo` sirve para cruzar, imprimir y comparar (y por eso Dynamic lo dejó en
"003", porque "LIM" ya se lo había llevado el Taller); `nombre` existe para que
una persona lo lea. Con Felipe pidiendo algo más angosto quedó `TND LIM` / `TLL
LIM`, derivado del tipo + la ciudad en `lib/etiqueta-sede.ts` — derivado, no
escrito a mano, así una tienda nueva de Dynamic sale legible sola.

**El hallazgo que valía más que el pedido:** rastreando por qué `003` se veía
raro apareció `activo = false`. La tienda estaba a medias — se podía vender ahí,
pero `egresos` y `registrar` la escondían, o sea que no se le podía cargar el
alquiler. Y el flag no era de retail: `retail.sedes` es una vista y ese campo es
`public.sedes.activa`, **la columna de Dynamic**. Activarla habría cambiado los
dos sistemas. Felipe decidió que retail no mire ese flag (ADR-0029), con el
precio anotado junto al código: el día que se cierre una sede de verdad, la
salida es una columna propia en `retail.sede_meta`, no volver a la de Dynamic.

Lo que Felipe se lleva: **un identificador estable y una etiqueta legible son dos
columnas, no una** — cuando la pantalla muestra la primera, la gente memoriza
mapas en vez de leer. Y que un flag que viene de otro sistema trae el criterio de
ese otro sistema; si no coincide con el tuyo, no se pelea con él, se deja de
usar. Queda pendiente verlo en navegador: Docker estaba apagado, así que la
prueba fue typecheck + 88 tests, no demo.

## 2026-09-08 (el deploy no es el sistema: producción estaba a medio configurar)
Felipe reportó que la consulta de DNI/RUC "antes funcionaba y ya no". El código
estaba bien: el token `sk_` responde 200 contra apis.net.pe y `lib/padron.ts`
maneja la v1 desde `6dca050`. Lo que faltaba era la mitad de la configuración —
producción tenía `PADRON_PROVEEDOR` pero no `PADRON_TOKEN`, y `sin_proveedor`
se dispara igual con que falte una sola de las dos, mostrando el mismo texto
que si no hubiera nada configurado. `.env.local` nunca se despliega; Vercel
necesita sus propias variables y nadie las había puesto. `.env.example`
además seguía listando solo `decolecta/apisnetpe/factiliza`, así que la doc
empujaba a configurar `apisnetpe` (v2) con un token `sk_`, que responde 401.

**El hallazgo que vale más que el arreglo:** buscando eso se vio que producción
tampoco tiene `LUCODE_TOKEN` ni `LUCODE_ENTORNO`, y que `retail.comprobantes`
está vacía. O sea, la boleta B004-000001 del 5-sep no salió del deploy: salió
de `npm run dev` en la computadora de Felipe, apuntando a la base de producción
y al SUNAT de producción. **Hoy el sistema que opera de verdad es el local de
Felipe, no lo que está desplegado** — algo que nadie había escrito y que cambia
cómo se lee todo el estado del proyecto.

Y una tercera capa: producción estaba tres migraciones atrás en facturación
(`unificacion/20`, `21` y `22` nunca se pegaron en el SQL Editor). Por eso
registrar una serie fallaba con "Could not find the function ... in the schema
cache": PostgREST resuelve por firma exacta y ahí vivía la de 3 parámetros. Se
aplicaron las tres y se verificó que no quedaran sobrecargas duplicadas, el
riesgo que el propio archivo advierte. Se aprovechó que `comprobantes` y
`series_comprobantes` estaban en cero: no hubo datos que migrar.

Lo que queda abierto y va al backlog: no existe forma de saber qué archivos de
`supabase/unificacion/` están aplicados en producción. Se descubrió por una
pantalla rota, no por una alerta — y esta vez salió barato solo porque no había
datos.

## 2026-09-05 (PRIMERA TRANSMISIÓN REAL A SUNAT + choque de sesiones paralelas)
Sesión en paralelo que terminó enseñando más por el error que por el código.
**Lo que sirve y queda:** se transmitió a SUNAT, en producción, la boleta
**B004-000001 (Trujillo, S/1.00, "Cliente varios")** — SUNAT la aceptó en cola
(estado PENDIENTE, firmada) y devolvió su PDF. Antes se había probado el
circuito completo en sandbox con **B005-000001 (S/189.90)**, ACEPTADA con CDR,
cliente identificado por DNI verificado contra RENIEC. O sea: **transmitir a
producción funciona hoy**, con el token de Lucode que Felipe ya tiene. Dos
consecuencias operativas que hay que respetar sí o sí: (1) **B004-000001 ya
está consumida ante SUNAT** — cuando se configure la base definitiva, la serie
B004 de TRU debe registrarse con próximo número **2**, o SUNAT rechazará todo
por duplicado; (2) esa boleta es un documento legal por una venta que no
existió y **hay que darla de baja** (resumen diario de bajas, 7 días) desde el
panel de Lucode. Numeración decidida con Felipe, una serie por tienda para
saber de dónde vino cada venta: **TRU B004/F004, AQP B005/F005, LIM B006/F006**.
De ahí sale el único código rescatado: `0039_serie_numero_inicial.sql` (+
`unificacion/22`), que permite fijar el próximo correlativo al registrar una
serie — antes siempre nacía en 1, sin forma de continuar una serie ya usada.
Se corrigió también un error de fondo en la UI: decía "Serie (la que dio
SUNAT)" y que SUNAT asigna las series. Falso en facturación electrónica: las
define el emisor, sin autorización; solo mandan el formato y que el correlativo
sea único y ascendente.
**El error, que vale más que lo anterior:** esta sesión reimplementó desde cero
el conector con Lucode y la verificación RENIEC/SUNAT **que ya existían en
`origin/main`** (`lib/lucode.ts`, `/api/lucode/emitir`, `/api/padron`,
comprobantes con ítems por ADR-0009), porque nunca hizo `git fetch` al abrir.
Trabajó cinco commits sobre un `main` local desactualizado en 30+ commits. Al
descubrirlo se descartó todo ese código en vez de mergearlo —habría dejado dos
conectores, dos rutas, dos variables de entorno y migraciones 0033/0034/0035
duplicadas con contenido distinto— y se rescató solo lo que main no tenía. La
rama `prueba/lo-que-estes-cambiando` queda como registro. **Regla que este
repo ya sabía y se saltó: `git fetch` ANTES de escribir la primera línea**; la
propia bitácora ya documenta dos choques de sesiones paralelas antes de este.
Aparte: el token de Lucode se pegó en el chat, justo lo que el backlog pedía no
hacer — conviene rotarlo desde el panel.

## 2026-09-05 (Fase 2 — Egresos, primera pantalla nueva del reemplazo de Alegra)
Con Fase 0/0.5/1 ya cerradas (por sesiones paralelas), primer trabajo propio de
esta sesión sobre el plan: `/finanzas/egresos`, pantalla nueva que antes no
existía — los gastos solo se veían agregados dentro del EERR del Resumen, sin
lista propia. Small multiples (hallazgo Ramp/Tufte, Ronda 2): una
`TarjetaIndicador` por sede siempre visible, no un selector que esconda que
una sede gasta distinto a otra — verificado en vivo (entorno local por fin
funciona, ADR-0010): registré un gasto de prueba en AQP y solo esa tarjeta
subió, las otras tres siguieron en S/0.

De paso, dos huecos reales encontrados al construir: (1) `RegistrarGastoModal`/
`RegistrarGastoButton` nunca habían recibido el sistema de identidad CAYLA —
usaban `bg-white`/`rounded-2xl`/`text-red-600` desde que se construyeron, ajeno
por completo a rojo/crema/tinta — corregido; (2) `METODOS_PAGO` compartido
(efectivo/pos/yape/transferencia, para ventas) se estaba a punto de reusar para
gastos, que tienen su propio constraint real distinto
(efectivo/banco/yape/tarjeta, `0013_finanzas_nucleo.sql`) — mismo nombre, dos
dominios. Se le dio su propio tipo (`MetodoPagoGasto`) en vez de forzar el
existente. Aparte, `getGastos()`/`GastoConDetalle` en `lib/finanzas.ts` estaban
muertos (nadie los llamaba, quedaron atrás cuando Felipe cambió el criterio a
mes calendario) — se borraron en vez de sumarles un uso más. Las etiquetas de
categoría/método, antes copiadas en 2-3 archivos, ahora viven una sola vez en
`packages/shared/src/enums.ts`.

## 2026-09-05 (Fase 1 — conector real con Lucode en sandbox)
Felipe pidió adelantar la Fase 1 (transmisión real a SUNAT vía Lucode, el PSE
que ya tiene en sandbox, ADR-0005). Bloqueante encontrado antes de tocar
Lucode: `comprobantes` nunca guardó detalle por ítem (solo subtotal/igv/total
agregados) y la API de Lucode exige un array `items` — sin eso no hay nada
válido que transmitir. Se agregó `comprobantes.items jsonb` con un fallback: si
`ComprobantesPanel.tsx` (el único flujo real hoy, manual, sin desglose) no
manda items, `emitir_comprobante`/`emitir_nota` arman uno genérico con el monto
real; el desglose por SKU exacto queda pendiente de que Facturación se conecte
a `ventas`/`movimientos` (decisión de UX de Felipe, no de esta fase). Se
construyó `apps/web/lib/lucode.ts` (mismo patrón que `lib/padron.ts`,
ADR-0008: nunca tumba la pantalla si Lucode no responde), la ruta
`/api/lucode/emitir` y el botón "Transmitir" en `ComprobantesPanel.tsx`
(visible solo en pendiente/rechazado). Bug real cazado probando la migración,
no leyendo código: `CREATE OR REPLACE` con un parámetro nuevo al final no
reemplaza la función vieja — Postgres la identifica por tipos de parámetros de
entrada, así que quedaron dos versiones ambiguas hasta agregar un `DROP
FUNCTION IF EXISTS` explícito de la firma vieja. ADR-0009. Migraciones
renumeradas de 0035/0036 a 0037/0038 (y unificacion 18/19 a 20/21) porque para
cuando se commitearon, otra sesión en paralelo ya había tomado esos números
(ver entrada de proveedor habitual, abajo) — mismo contenido, solo cambió el
nombre del archivo. Pendiente: Felipe pegue `20_comprobantes_items.sql` y
`21_actualizar_transmision_comprobante.sql` en producción, y ponga su
`LUCODE_TOKEN` real en `.env.local` (nunca en el chat) para la primera prueba
real contra el sandbox de Lucode.

## 2026-09-05 (Proforma: la pantalla que faltaba desde la Fase 0)
Felipe pidió "diseñemos algo que nos permita emitir boletas y facturas". Boleta
y factura ya emitían (con verificación RENIEC/SUNAT, ADR-0008) — lo que
faltaba, con backend listo desde la Fase 0 (ADR-0007) pero sin una sola
pantalla que lo usara, era la Proforma. Se construyó `ProformasPanel.tsx` +
`lib/proformas.ts`: crear proforma (sin verificación de documento — no es
fiscal, no lo exige la ley) y "Convertir a comprobante" (sí exige RUC si se
convierte a factura, reusa `ConsultaDocumento`). Nunca un `UPDATE` de estado —
convertir llama a `convertir_proforma_a_comprobante`, que crea un comprobante
nuevo. Proformas por vencer en 48h se ordenan primero (patrón "excepciones
primero", Ronda 2) y usan `TarjetaIndicador` ya construido en Fase 0.5 en vez
de repetir el markup de KPI a mano.

`packages/database/src/types.ts` seguía sin `proformas` ni las columnas de
NC/ND de la Fase 0 (`comprobante_original_id`, `motivo`) — la migración 0034/17
se aplicó a producción después de la última regeneración. Se agregaron a mano
(mismo patrón ya usado para `crear_producto_con_variantes`), no se regeneró
completo: el script de `gen-types` sigue apuntando al proyecto viejo de retail
(deuda ya trackeada). `next build` completo corrido y limpio, no solo `tsc` —
la lección de la sesión anterior sobre que uno solo no basta.

## 2026-09-05 (Catálogo no mostraba lo recibido — faltaba conectar el almacén interno)
Felipe registró una recepción de prueba y preguntó por qué no aparecía en su
stock. No era un bug de datos: "Recibir mercadería" sí mete las unidades a
`retail.stock_almacen` (el almacén interno, construido el 09-03), pero
`getCatalogoConStock` (lo que alimenta Catálogo, Vender, Comercial, etc.)
solo leía `retail.stock` (piso) — nadie había conectado esa fuente al
frontend todavía. Se agregó `stockAlmacenPorSede/Total` a `VarianteConStock`
de forma aditiva (Vender sigue viendo solo piso, para no ofrecer como
vendible algo que sigue en la bodega) y Catálogo ahora muestra "+N en
almacén" junto al stock total. Aprendizaje para explicarle a Felipe: recibir
≠ tener en venta — el paso "Bajar a tienda" en Almacén es el que de verdad
habilita vender algo recién llegado.

## 2026-09-05 (hallazgo real: faltaban 25 de 30 categorías en producción)
Felipe llenó "Recibir mercadería" con un ejemplo real (Blusa Manga Larga,
proveedor EGTI) y notó que Categoría no ofrecía "Blusas" — solo las 5 de
`0030_categorias_captura_real.sql`. Causa raíz encontrada leyendo el propio
repo: `supabase/unificacion/04_catalogo.sql` (paso 4 de la unificación con
Dynamic, jul-2026) recreó la tabla `retail.categorias` desde cero pero nunca
volvió a correr las 30 filas semilla de `0009_categorias.sql` — solo definió
la estructura. Las 5 de `0030` fueron las PRIMERAS que existieron en
producción, no una adición a 30 previas. El gap llevaba desde julio sin
notarse porque el catálogo real recién empezó a cargarse el 09-03. Repuestas
las 25 faltantes (`0036` local, `unificacion/19` producción, `on conflict do
nothing`, seguro de correr). De paso, Felipe notó que Costo/Precio/Stock
mínimo en el mismo formulario solo tenían placeholder — se veían idénticos
una vez llenos porque el placeholder desaparece al escribir; se agregaron
etiquetas fijas a todos los campos del ítem, y la confirmación al recibir
ahora dice cuántos ítems/unidades entraron con enlaces a Catálogo/Almacén.

## 2026-09-05 (proveedor habitual del producto — cierra la pregunta de Felipe)
Felipe probó Proveedores (le gustó editar/desactivar) y preguntó cómo debía
relacionarse con "Nuevo producto": ¿primero el proveedor, luego el producto
"de ese proveedor"? Se explicó el patrón de los ERP serios (Shopify: vendor
como etiqueta del producto; Odoo/QuickBooks: proveedor preferido en el
producto vs. proveedor real por orden de compra/recepción — dos preguntas
distintas, no una) y se completó la mitad que faltaba: `productos.proveedor_id`
(opcional, no candado) + selector en `NuevoProductoForm`. La otra mitad
("¿quién trajo este lote?") ya existía desde Fase 3 en `lotes.proveedor_id` —
no se tocó. De paso, a pedido de Felipe, se quitó "Categoría" del formulario
de Proveedores (duplicaba la misma idea que ahora vive en el vínculo
producto↔proveedor). Migración local `0035`, producción en
`unificacion/18_productos_proveedor.sql` (reemplaza a `16` si Felipe todavía
no lo pegó). Empujado a `main` y a la rama propia a pedido explícito.

## 2026-09-05 (Fase 0 confirmada en producción + reconciliación con 2 sesiones paralelas)
Felipe pegó `17_facturacion_completa.sql` en producción. Confirmado con
`pg_proc`/`information_schema.tables`: las 6 funciones y las 3 tablas
(`comprobantes`, `series_comprobantes`, `proformas`) existen — Fase 0 cerrada
de punta a punta, no solo "escrita". En el camino, dos sesiones paralelas
habían avanzado bastante en el mismo árbol compartido: verificación RENIEC/
SUNAT (ADR-0008), corrección del proveedor SUNAT a Lucode (no Nubefact — ver
esa entrada abajo), Fase 0.5 de tokens de diseño empezada, y Proveedores
(editar/desactivar) ya en GitHub. Un solo conflicto real al fusionar
(`BITACORA.md`, aditivo — dos sesiones agregando entradas al mismo punto, se
combinan sin perder nada). Backlog actualizado para reflejar el estado real:
Lucode reemplaza a Nubefact en toda referencia, con el trámite pendiente que
le toca a Felipe (alta como PSE tercero en SUNAT SOL, no antes de mañana).

## 2026-09-05 (hook de pre-commit: el linter deja de ser opcional)
`pnpm lint` llevaba días en rojo y nadie lo veía — así se coló a producción el
`Date.now()` en el render de Proformas y un renombrado a medias que rompía el
build. Se puso `.githooks/pre-commit`, activado solo con `pnpm install` (script
`prepare` que apunta `core.hooksPath`, cero dependencias nuevas: es todo lo que
hace husky).

Lo que manda de la decisión fueron los NÚMEROS, no la opinión: `eslint` sobre el
proyecto entero tarda **4 min 15 s**; sobre los archivos de un commit, ~15 s.
Un hook de cuatro minutos no protege nada porque se saltea con `--no-verify` a la
tercera vez. Por eso revisa solo lo que estás commiteando: tipos (7,5 s), tests
(10 s) y lint (14 s) — ~19 s en total, y 0,5 s si el commit es solo de
documentación o SQL. Se añadió `tsc` además de lo pedido porque era lo único que
habría cazado el error que rompió el build hoy; los errores de tipos de archivos
AJENOS avisan pero no bloquean, para que el trabajo a medias de otra sesión no
te secuestre un commit terminado.

Probado en los cinco escenarios antes de darlo por bueno: commit de solo docs
(pasa en 0,5 s), error de lint (bloquea y señala la línea), error de tipos propio
(bloquea), error de tipos ajeno (avisa y deja pasar), y todo limpio (pasa en
18,7 s). Un hook sin probar es un hook que no existe.

## 2026-09-05 (el entorno local por fin existe)
Felipe pidió arreglar lo del Supabase local. Eran tres causas encadenadas, no
una: (1) `supabase start` aborta y borra TODOS los contenedores si uno solo
falla el healthcheck, y fallaban cuatro —analytics, vector, realtime y storage—
por saturación de tener dos stacks de Supabase en la misma máquina; como la CLI
ve el contenedor de Postgres y dice "setup is running", el fallo era invisible.
(2) La app pide el schema `retail` y las migraciones locales dejan todo en
`public`. (3) `lib/persona.ts` solo reconocía el rol `admin` de dynamic, así que
un Líder local se volvía integrante y quedaba fuera de media app.

Lo que manda de la solución: el renombrado `public` → `retail` va en
`supabase/seed.sql`, que corre SOLO en local — así las migraciones se siguen
escribiendo sin prefijo (una sola forma, como manda CLAUDE.md) y el local queda
con la misma forma que producción, sin que el código de la app tenga un camino
distinto según dónde corra. Se descartó reescribir las 34 migraciones con
prefijo `retail.` (mataría de paso el archivo dual que causó ADR-0004 y
ADR-0006, pero es un proyecto aparte) y se descartó una variable de entorno para
el schema, que es justo el patrón que produce bugs que nadie reproduce. ADR-0010.

Ahora sí hay evidencia en vez de razonamiento: login real como "Felipe Alvarez ·
Líder · AQP", `/vender/facturacion` cargando con las series del seed, un DNI
incompleto respondiendo "Falta 1 dígito", una boleta real emitida
(B001-000001, S/118.00) por la RPC contra el schema `retail`, y al reteclear el
mismo DNI la tarjeta "MARIA FERNANDA ALVAREZ QUISPE — De un comprobante
anterior". Eso último es el camino de degradación de ADR-0008 probado de punta a
punta, sin proveedor de padrón y sin internet. Precio consciente: Storage queda
apagado en local, así que subir fotos de producto no funciona ahí.

## 2026-09-05 (facturación — verificar al cliente contra RENIEC/SUNAT antes de emitir)
Felipe pidió que boletas y facturas lean el DNI (o el RUC, si es factura) y
muestren en pantalla los datos del cliente para poder verificarlos antes de
emitir. Se construyó como tres piezas separadas y no como un campo con una
llamada adentro: validación pura (`packages/shared/src/documento.ts`), adaptador
de proveedores (`apps/web/lib/padron.ts`, tres proveedores intercambiables por
variable de entorno) y un campo reutilizable (`ConsultaDocumento.tsx`) que va a
servir igual en el punto de venta. Decisiones y descartes en ADR-0008.

Lo que manda del hallazgo: ni RENIEC ni SUNAT tienen API abierta —todo pasa por
intermediarios que cobran por consulta y a veces desaparecen—, y Nubefact (el
OSE ya elegido) no sirve para consultar, solo para emitir. Por eso el dígito
verificador del RUC se calcula en casa: caza casi todos los tipeos sin gastar
una consulta pagada y funciona sin internet. Y por eso lo que se muestra no es
solo el nombre sino el estado y la condición del RUC: una factura a un RUC de
baja o "no habido" la rechaza SUNAT y la clienta pierde el crédito fiscal, con
el correlativo ya quemado.

Dos bugs reales cazados por probar en vez de razonar: (1) el middleware mandaba
a `/login` también a las rutas de API, así que un `fetch()` recibía HTML en vez
de JSON y el formulario decía "no se pudo consultar" cuando en realidad la
sesión había vencido — le pasaba igual a `/api/export/inventario` desde antes;
(2) el formulario guardaba el tipo de documento como estado aparte del tipo de
comprobante, así que tipear un DNI y luego cambiar a Factura dejaba
"factura + dni" y la venta se caía recién al apretar Emitir. Ahora se deriva:
el estado imposible no existe. Aparte, se confirmó que el stack local de retail
es solo Postgres (los demás servicios no levantan y `retail` no está expuesto
como schema), así que la app nunca ha corrido contra local — está en el backlog.

## 2026-09-05 (reemplazo total de Alegra — Fase 0: esquema legal completo)
Felipe pidió reemplazar Alegra por completo, con un módulo propio superior a
QuickBooks y estética de casa de moda de herencia. Se hicieron 27 preguntas de
descubrimiento y se investigó con 7 agentes en paralelo (UX de Stripe/Mercury/
Ramp/QuickBooks/Xero, estética Hermès/LVMH/Ralph Lauren/Aesop/The Row, motores
de insights fintech, API de Nubefact y normativa SUNAT real). Hallazgo que
manda: OSE=Nubefact confirmado (S/70/mes, hasta 500 comprobantes, locales sin
límite); proforma/nota de venta NO es comprobante de pago (Art. 2, RS 007-99);
ningún benchmark segmenta por sede física — CAYLA debe hacerlo desde el día 1
o un consolidado esconde que una tienda cae mientras otra sube. Plan de 7 fases
escrito y aprobado (`~/.claude/plans/cozy-gathering-nova.md`).

Fase 0 completa: migración `0034_facturacion_completa.sql` — tabla `proformas`
separada (nunca se "promociona" con UPDATE, se convierte creando un comprobante
nuevo), NC/ND con referencia obligatoria a un comprobante ACEPTADO (CHECK de
fila + trigger, dos capas), `nota_debito` agregado al tipo. Se probó
empíricamente contra Postgres local (puerto reconfigurado a 54421-54429 para no
chocar con el de cayla-dynamic) — y la prueba cazó un bug real antes de
entregarlo: se me olvidó actualizar el check de `series_comprobantes.tipo`
además del de `comprobantes.tipo`, la misma familia de deriva que ya costó
ADR-0004 y ADR-0006. Corregido antes de commitear, no después. ADR-0007.

## 2026-09-04 (Proveedores — editar, desactivar, banco/marca)
Felipe revisó Proveedores y preguntó si estaba bien así. Hallazgo: el
formulario solo insertaba, `activo` existía y el query ya filtraba por ella
pero nada la usaba (no había forma de archivar un proveedor), y `marca`/
`banco`/`cuenta_bancaria` vivían en el schema sin exponerse en pantalla.
Cada fila (Líder) abre ahora el mismo formulario en modo edición con
Desactivar/Reactivar — nunca se borra la fila — y se agregaron los tres
campos que faltaban. Sin RPC nueva: `.update()` directo contra la tabla,
mismo patrón que ya usaba el `.insert()` (RLS `proveedores_write_lider`
cubre ambos). Empujado a `main` después de fast-forward con un commit nuevo
en paralelo (traslado de Facturación de Finanzas a Vender, sin overlap).

## 2026-09-04 (alta de producto con matriz talla × color)
Felipe pidió crear un producto ("Reflixme") pensando en todo — tallas y
colores incluidos — y encontró el hueco real: "Recibir mercadería" crea un
`producto` nuevo por CADA ítem agregado con "+ Agregar prenda nueva", así que
pedir la misma referencia varias veces (una por talla/color) deja productos
duplicados en vez de un modelo con N variantes. Se construyó
`crear_producto_con_variantes` + pantalla `/inventario/producto/nuevo` (solo
Líder): chips de talla/color, matriz generada con SKU/costo/precio editable
por fila, un solo INSERT a `productos` + N a `variantes`, sin tocar stock
(nace con 0 unidades hasta el primer lote real). Antes de comitear, un
`git fetch` mostró que esta rama estaba 12 commits detrás de `origin/main`
(otra sesión en paralelo, misma máquina, ya había cerrado almacén interno,
facturación parte 1 y el fix de seguridad de `recibir_lote` — ver ADR-0004);
se fusionó todo antes de tocar nada más, con un solo conflicto real en
`packages/database/src/types.ts` (se tomó la versión regenerada y se le
reinsertó a mano la entrada de la función nueva). Se siguió el mismo patrón
dual que `recibir_lote`: versión local sin prefijo en
`0033_crear_producto_variantes.sql`, versión schema-calificada lista para
pegar en producción en `supabase/unificacion/16_crear_producto_variantes.sql`
— Claude no pega SQL en producción directo, eso lo hace Felipe. `next build`
completo (no solo `tsc`) corrido a propósito: la sesión paralela ya había
encontrado que `tsc` solo no bastaba para atrapar los 30 errores de
null-safety que bloqueaban el deploy. Empujado a `main` (fast-forward limpio)
a pedido explícito de Felipe; falta que pegue el archivo 16 en el SQL Editor
y confirme que el producto aparece en Catálogo — cierra de paso la
verificación pendiente de "almacén interno".

## 2026-09-03 (auditoría — la bitácora estaba congelada desde julio)
Felipe pidió retomar CAYLA retail; la carpeta local llegó vacía a la sesión y se
repobló (clon/sync de otra Mac) mientras se investigaba. Corrí `/backlog`: la
bitácora y el backlog llevaban parados desde el 19-20 de julio pero el repo tiene
commits reales hasta el 23, incluida una fase de "Unificación" (retail pasa a leer
`sedes`/`personas` de Dynamic vía schema dedicado) nunca documentada aquí.
Hallazgo que manda sobre todo lo demás: el código de HEAD fuerza
`db:{schema:"retail"}` en cada consulta, pero `cayla-dynamic/supabase/migrations/0097`
(27-jul, posterior) dice explícitamente que el puente con retail "todavía no
existe" — o producción quedó desincronizada del repo, o cada consulta falla desde
hace 6 semanas. No se puede saber leyendo código; queda como primer punto a
verificar con Felipe contra Vercel/Supabase antes de construir nada más. Backlog
reescrito completo con esto como ítem #1 de ARREGLAR.

## 2026-09-03 (verificación — el schema `retail` sí existe en producción)
Felipe corrió en el SQL Editor de producción: `select schema_name from
information_schema.schemata where schema_name = 'retail'` → devolvió la fila. El
peor escenario (app rota 6 semanas, o desincronizada del repo) queda descartado:
`NEXT_PUBLIC_SUPABASE_URL` de producción sí apunta al proyecto con el schema
unificado. Sigue sin confirmar si las 22 tablas y las vistas puente están
completas y sirviendo datos reales — próximo paso queda anotado en el backlog
como dos `select` de una línea, no una investigación nueva.

**Mismo día, segundo chequeo:** Felipe corrió los dos `select` pendientes.
`retail.sedes` devolvió 5 filas (no vacío) y `information_schema.tables` para el
schema `retail` devolvió 28 (más que las ~22 esperadas — las migraciones de
producción `0024`-`0029`, escritas después de la unificación, sumaron tablas
propias encima). Cierra la duda del hallazgo #1: la unificación con Dynamic está
aplicada y con datos reales, no a medias ni rota. Backlog actualizado: el ítem
pasa de ARREGLAR (riesgo) a CERRADO; queda solo una deuda de documentación (falta
el ADR y el `02_*.sql` que crea el schema, nunca se guardó en el repo).

## 2026-09-03 (arranca Frente 1 — captura del catálogo real)
Felipe pidió seguir con el catálogo real. Antes de tocar la captura física, se
retomó una decisión de julio que quedó escrita en `docs/PLAN-DE-TRABAJO.md` §4 y
nunca se migró: 5 categorías nuevas (Conjuntos, Enterizos, Chalecos, Bodys,
Blazers/Sacos) respaldadas por el historial real de compras. Felipe pidió ver el
detalle completo antes de aprobar ("2 y 4" a la pregunta: explicar más Y dejar
espacio a ajustes) — se mostró la tabla con tallas sugeridas propuestas y no pidió
cambios. Migración `0030_categorias_captura_real.sql` escrita (aditiva, sin tocar
esquema) y ADR-0003. Pendiente: que Felipe la corra en el SQL Editor de producción.

## 2026-09-03 (recibir_lote — la unificación perdió tres cosas)
Con `0030` ya corrida, se comparó `retail.recibir_lote` de producción contra el
frontend y contra `supabase/migrations/0018` (la última versión local antes de
la unificación). Confirmado con `pg_get_functiondef`: la unificación migró una
copia más vieja — sin validar sede (mismo hueco que `0012` ya había cerrado),
sin guardar `categoria_id` (cada producto nuevo quedaba sin categoría pese a
que el formulario sí la manda — rompía lo de `0030`), y sin aceptar
`p_orden_compra_id` (recibir ligado a una compra fallaba). Felipe pidió
arreglar las tres juntas. Al escribir el fix salió una cuarta cosa, más
grande: el frontend también manda `p_orden_produccion_id`, pero apunta a un
modelo de Producción (`ordenes_produccion`) que las migraciones `0025`-`0029`
reemplazaron por `producciones` sin propagar el cambio — ni `lotes` tiene
columna para ese vínculo, ni la pantalla de recibir se actualizó. Felipe
decidió dejarlo como tarea aparte, no meterlo en el mismo arreglo. Migración
`0031` escrita (local, idéntica a 0018) + ADR-0004, con el cuerpo
schema-calificado listo para pegar en producción. Sin `BEGIN…ROLLBACK` local
esta vez — el puerto de Supabase local estaba ocupado por otra sesión
(cayla-dynamic).

## 2026-09-03 (hallazgo de una sesión paralela — almacén interno)
Mientras se trabajaba la taxonomía con Felipe, otra sesión (misma Mac, otro
proceso) descubrió que "Recibir mercadería" está bloqueada en producción: la
unificación nunca recreó las sedes-almacén (TRU-ALM/AQP-ALM/LIM-ALM), así que
Recibir y "Bajar a tienda" no tienen dónde escribir. Diseñó y dejó lista (sin
aplicar, sin commitear) `supabase/unificacion/12_almacen_interno.sql` — un
contenedor tipo 'almacen' por sede en vez de una sede hermana — y encontró de
paso el hueco de seguridad de `recibir_lote` (ver arriba). Se commiteó su
trabajo sin tocarlo. Verificado 2026-09-03 (esta sesión): `fn_aplicar_movimiento`
y `recalcular_stock` de producción coinciden exactos con lo que la migración
asume — es seguro pegarla — pero `recibir_lote` queda fuera de esa migración a
propósito (ver entrada de arriba).

## 2026-07-16
Fase 1 (inventario multi-sede) verificada en vivo. Felipe pausó el plan de retomar la
Fase 2 financiera y pidió en su lugar "Inventario Inteligente" (rotación, alertas,
reorder point) inspirado en cómo lo resuelven Zara/Walmart/marcas premium, escalado a
3 tiendas + 1 taller — no a esa escala real.

## 2026-07-17 (mañana)
Inventario Inteligente construido y verificado (build/lint limpios). En revisión
autónoma se encontraron y corrigieron 2 bugs reales (sugerencia de traslado limitada
a una sola sede, clasificación ABC mal calculada en el límite) y se documentó un gap
de RLS sin corregir a la espera de confirmación.

## 2026-07-17 (tarde)
Se adoptó el "Protocolo Pedagógico": Claude decide lo técnico, pregunta lo que tiene
consecuencia de negocio, y enseña siempre. Se commiteó todo lo de la mañana (3
commits). Se aplicó el fix de RLS confirmado por Felipe. Al dar de alta la cuenta de
Felipe se descubrieron 4 filas duplicadas en `personas` para el mismo `auth_user_id`
— el login fallaba con el mismo error que "cuenta no vinculada" porque
`requirePersonaActual()` usa `.single()`, que exige exactamente una fila. Felipe
aprendió a diagnosticar esto con una consulta antes de borrar nada, y por qué el motor
bloqueó el primer intento de borrado (una de las filas ya tenía movimientos reales
asociados). Se agregó `unique(auth_user_id)` para que esta clase de error sea
imposible de repetir.

## 2026-07-17 (noche)
Se subió cayla-retail a GitHub por primera vez — no tenía remoto configurado, ni
siquiera la Fase 1 tenía respaldo fuera de la Mac de Felipe. El primer intento con
token embebido en la URL falló dos veces por errores de transcripción manual en
Terminal (token duplicado); funcionó al tercer intento con el token correcto. Se
conectó Vercel al repo de GitHub para que cada push despliegue solo, reemplazando el
flujo anterior de deploy manual por CLI. Primer intento de conexión no disparó build
del código ya existente (solo dispara con push nuevos); un segundo push (el commit de
docs) lo activó. Felipe confirmó en pantalla, logueado en `cayla-retail.vercel.app`,
que Inventario Inteligente está completo en producción: 4 KPIs, panel de alertas,
filtros y badges. Fase 2 (Inventario Inteligente) queda cerrada de punta a punta:
construida, verificada local y en producción, con respaldo en GitHub.

## 2026-07-17 (madrugada)
Retomada la Fase 2 financiera. Investigué manejo de caja retail y contabilidad antes
de diseñar (conteo ciego, mermas como COGS, categorías de gasto estructuradas — no
solo inventado). Construidos Diario de Caja, Gastos y Estado de Resultados sobre
tablas nuevas (`cajas`, `ventas`, `gastos`). Felipe probó en vivo y dio feedback real
que corregí en el momento: el formulario de gasto pedía subtotal cuando lo natural es
partir del total del comprobante (se invirtió el cálculo), y la diferencia de caja se
mostraba en rojo sin importar el signo (se corrigió a verde/rojo según sobra o falta).
También encontré una inconsistencia real revisando el módulo: el modal de
movimiento genérico todavía ofrecía "Venta" como motivo, lo que crearía una venta
"fantasma" sin fila en `ventas` ni caja asociada — se retiró de ahí, el botón "Vender"
es ahora la única forma correcta de registrar una venta.

## 2026-07-17 (noche 2 — Fase 3: almacén)
Felipe pidió expresamente 21-33 preguntas antes de diseñar el ingreso de mercadería
("para diseñar algo formidable") — se hicieron 24, en dos tandas (4 fundacionales con
opciones, 20 más en texto libre). Hallazgo clave que cambió el plan sobre la marcha:
Integrante necesita poder crear un SKU nuevo al recibir un fardo (con costo/precio),
lo que choca con la regla de Fase 1 de que solo Líder crea catálogo — Felipe decidió
"hay que confiar en el equipo"; se resolvió sin relajar la regla general, dejando que
`recibir_lote` cree catálogo con permisos elevados solo para sus propias inserciones
internas (security definer), no abriendo la tabla `productos`/`variantes` a Integrante
en general. Construido: almacén hermano por tienda, contenedores, lotes, bajada y
devolución reutilizando `traslado`. Verificado en producción.

Fricción real de la sesión, no de la app: subir a GitHub y mantener el push
funcionando tomó muchísimo más tiempo que el código — tokens que caducan cada vez que
se revocan, ventanas nuevas de Terminal que no heredan la carpeta de trabajo, y un
archivo `Index.html` suelto que apareció en GitHub y causó un historial divergente
que hubo que reconciliar con merge. Nada de esto es un problema del código de CAYLA;
es la curva de aprendizaje normal de git/GitHub para alguien que no lo usa a diario.

Felipe probó "Recibir mercadería" en vivo y dio feedback real: los campos de talla/
color/categoría quedan escondidos hasta buscar y crear un producto nuevo, no es obvio
a primera vista. Pidió retomar el rediseño de ese formulario en una sesión aparte —
queda anotado en el backlog, no se improvisó un cambio de UX apurado al cierre.

## 2026-07-17 (madrugada 2 — taxonomía de categorías)
La misma sesión siguió: en vez de abrir el rediseño de UX en otro chat, Felipe pidió
diseñar la estructura de familias/categorías del catálogo. Se construyó con 2 rondas
de preguntas cortas en vez de las 24 de la fase anterior — la primera fijó el criterio
(estándar por categoría, no por familia; varias marcas/proveedores), la segunda afinó
categorías reales (Maquillaje, Útiles de oficina) comparando con LVMH/Zara/Hermès.
Felipe corrigió el diseño tres veces en vivo sobre Bisutería: primero pidió agregarla,
luego pidió separarla en 4 categorías (pulseras/aretes/anillos/collares), y finalmente
— con frustración visible por tener que repetirlo — la elevó a familia propia, séptima
decisión que ya no se debe volver a cuestionar. Resultado: 6 familias fijas, 30
categorías en tabla editable por Líder, con tallas sugeridas por categoría (ej.
Zapatillas → 34-42, Bisutería → Único) que ahora alimentan un selector real en vez de
texto libre en "Recibir mercadería". `productos.categoria` (texto libre, sin dueño de
qué valores eran válidos) se reemplazó por `categoria_id` — sin backfill porque el
catálogo real todavía no está cargado, más barato cambiar el terreno ahora que
después de 900 SKUs reales. Build y lint verificados limpios. Migración
`0009_categorias.sql` pendiente de correr en Supabase (Felipe debe pegarla en el SQL
Editor, igual que las anteriores).

Felipe corrigió las tallas sugeridas antes de correr la migración — había asumido
rangos "de catálogo genérico" (28-38 para Jeans, "Único" para Anillos) en vez de
preguntar qué vende Cayla realmente: Jeans y Pantalones van 26-34, "Estándar" es una
talla adicional muy usada junto a XS-XXL (no un reemplazo) en Polos/Camisetas,
Blusas, Poleras/Sudaderas, Camisas, y dos categorías que faltaban del todo (Chompas,
Tops), y Anillos sí tiene talla numérica real (6-9), no es "Único" como el resto de
Bisutería. Corregido en el archivo antes de que Felipe la corra — ninguna de las 30
categorías originales cambió de nombre o familia, solo las tallas sugeridas de 8 de
ellas y 2 categorías nuevas. Felipe corrió la migración en Supabase y verificó en
vivo en "Recibir mercadería": Familia filtra Categoría, y Categoría cambia la Talla
de texto libre a un desplegable con las tallas reales (Zapatillas 34-42, Jeans
26-34, Polos con Estándar primero, Anillos 6-9). Fase de taxonomía cerrada de punta
a punta: construida, verificada en producción. Se commiteó y subió a GitHub — y de
paso se resolvió la causa raíz del dolor recurrente de git: se cambió el remoto de
HTTPS-con-token (que caduca) a SSH (llave permanente que ya existía y ya estaba
autorizada en la cuenta). Ya no hará falta generar tokens nunca más en esta Mac.

## 2026-07-17 (noche — revisión autónoma del proyecto)
Felipe pidió revisar todo el proyecto en modo autónomo y dejar un checklist. Leí las
9 migraciones, las RPCs de stock/dinero, todas las políticas RLS, la lógica de
inteligencia/finanzas y los 15 componentes. El código está sano — no hubo bugs de UI
que arreglar a ciegas. Hallazgo principal (real, no teórico): una **condición de
carrera** en `fn_aplicar_movimiento` — dos ventas de la última unidad de la misma
prenda/sede en el mismo instante dejan el stock en -1, porque la validación lee sin
bloquear la fila. Es el escenario "dos clientas se llevan la última prenda en el mismo
segundo" del propio criterio de arquitectura. NO lo apliqué (toca el corazón del stock
y es decisión de Felipe): dejé la migración lista en `docs/propuestas/0010_stock_concurrencia.sql`
(fuera de supabase/migrations/ para que no se aplique sola) con `for update` + `check
(cantidad>=0)` + la FK que le faltaba a movimientos.venta_id. Segundo hallazgo: el
indicador "Estancado" se reinicia con las bajadas de almacén (mide "días sin salida"
en vez de "días sin venta", que es la intención declarada) — documentado como Decisión
2, necesita una columna nueva, no se improvisó. Único cambio de código aplicado: un
texto del login que aún decía "hoja `personas`" (herencia de Sheets) → "el sistema".
Todo quedó en `docs/CHECKLIST-MANANA.md`. Build y lint limpios.

## 2026-07-18 (madrugada — Felipe resuelve el checklist)
Felipe volvió y pidió resolver los pasos del checklist en vivo. **Decisión 1 (concurrencia
de stock):** revisó que no hubiera stock negativo previo, corrió la migración 0010 en
Supabase (for update + check cantidad>=0 + FK de venta_id), y el archivo pasó de propuesta
a `supabase/migrations/0010`. **Decisión 2 (Estancado):** patrón migración-primero para no
romper producción — Felipe corrió 0011 (columna `stock.ultima_venta`, backfill del
histórico, y fn_aplicar_movimiento sella la fecha solo con motivo='venta'), y recién
después se subió el cambio de pantalla (inteligencia.ts lee ultima_venta; el indicador se
renombró de "Días sin salida" a "Días sin venta" en las 3 pantallas que lo usaban, para
que diga lo que mide). Aprendizaje de método: cuando un cambio toca base + pantalla, la
base va primero y la pantalla después, para que nunca exista un momento donde la pantalla
pida una columna que aún no existe. **Decisión 3 (seguridad):** Felipe corrió 0012 —
las 5 funciones security-definer (registrar_movimiento, abrir/cerrar caja, registrar_venta,
recibir_lote) ahora validan la sede del que llama con el helper `fn_puede_operar_sede`
(Líder, o tu sede, o el almacén de tu tienda). 100% base, sin cambio de pantalla. Con esto
cierran las tres deudas grandes de la revisión nocturna; el cubo ARREGLAR quedó casi vacío
(solo el warning de middleware deprecado, que no rompe nada).

## 2026-07-19 (Fase F1 — el núcleo financiero, jubilación de SINATRA)
Felipe compartió los 3 SINATRA reales (.xlsm por sede). Se disecaron a fondo (hojas,
fórmulas, rangos, VBA extraído): S/646K de ventas 2026 registradas, 2,368 celdas con
error, cuadres de efectivo en -S/6,122 (TRU) y -S/7,675 (LIM) sin fecha de origen,
Proveedores desincronizado entre archivos (295 vs 287 filas), macros que solo navegan.
Informe completo en docs/ANALISIS-SINATRA.md. Decisiones de Felipe (6 preguntas):
NO replicar — estándar QuickBooks o superior; corte limpio; monto total en caja;
tipos de costo/gasto se revisan juntos después; los 4 reportes irrenunciables (EERR
mensual calendario, año vs año, cuadre de efectivo continuo, patrimonio); compras+
proveedores ahora ligado a recibir. Se construyó y desplegó F1 completo: migraciones
0013 (proveedores, depósitos bancarios, ajustes de efectivo, históricos mensuales,
patrimonio_items) y 0014 (registrar_gasto con método de pago), lib finanzas-nucleo
(meses calendario de Lima), y el mundo Finanzas con 4 secciones: Resumen (EERR
mensual con selector), Efectivo (cuadre continuo + depósitos + ajustes con motivo),
Año vs año (con editor de siembra de históricos), Patrimonio (neto en vivo +
partidas manuales). Proveedores como directorio único en Inventario, seleccionable
al recibir mercadería. Nota didáctica del día: correr una migración dos veces da
"already exists" — es Postgres negándose a duplicar, no un error real.

## 2026-07-19 (Fase B — etiquetas, fotos y mínimos por sede)
Tras cerrar F1, Felipe pidió seguir. Se eligió Fase B de inventario (su prioridad
declarada) sobre F2 de finanzas (que necesita su tiempo en la revisión de tipos).
Tres entregas: (1) /inventario/etiquetas — etiquetas 62×29mm para la Brother
QL-1110NWB con código de barras Code 128 B generado como SVG propio (tabla oficial
de patrones, checksum y stop; sin librerías externas), vista previa = impresión;
(2) fotos de producto — una por modelo (decisión de Felipe), bucket público
`fotos-productos`, subida desde el detalle (Líder), miniaturas en catálogo agrupado
y búsqueda; (3) stock mínimo por sede — stock.stock_minimo por (variante, sede) vía
RPC fijar_stock_minimo (única puerta de escritura: stock no tiene política de
UPDATE), alerta "bajo mínimo" por tienda integrada a reponerYa y visible en rojo en
el detalle. Migraciones 0015 y 0016 corridas por Felipe. Aprendizaje del día:
"already exists" al correr una migración dos veces no es un error — es Postgres
negándose a duplicar lo que ya está.

## 2026-07-19 (F2 — compras, exportar y el modelo de gastos corregido)
Cerrando el día: órdenes de compra formales (/inventario/compras) reutilizando la
tabla de Fase 1 que nunca tuvo UI — proveedor del directorio, monto estimado,
"dinero comprometido en camino", y el ciclo se cierra solo: al recibir el lote
ligado, la orden pasa a recibida (0017). Exportar Excel del inventario (CSV con BOM,
punto y coma para Excel en español, costo solo Líder). Y la revisión de tipos de
gasto que quedó de F1: Felipe pidió NO replicar su clasificación ("yo diseñé
SINATRA pero es imperfecto — no repitas mis errores"). Modelo adoptado: 3 destinos
del dinero — gastos del mes (EERR, +categoría "suministros"), inversiones (su
antiguo "IME" → Patrimonio como activo, no gasto), insumos de taller (dentro de
variantes.costo, nunca duplicados como gasto). Fijo/Variable pospuesto a su pedido.
Migración 0017 corrida por Felipe. Tres fases desplegadas en un solo día:
F1 (núcleo financiero), Fase B (etiquetas/fotos/mínimos) y F2 (compras/export).

## 2026-07-19 (Producción — el Taller entra al sistema)
Felipe eligió Producción sobre el plan de carga del catálogo. Descubrimiento en 2
tandas (8 preguntas): el Taller produce EN CONTINUO (no por encargo), es la minoría
del catálogo pero >100 prendas/semana, registran ambos (equipo del Taller con cuenta
+ Felipe), entrega directa a cada tienda, quiere etapas corte→confección→acabado y
costo CALCULADO — pero insumos "después". La tensión se resolvió con la receta de
costo: bom_items (Fase 1, dormida) + precio_unitario + productos.costo_mano_obra =
costo sugerido SIN inventario de materia prima. Construido: /produccion (tablero con
etapas, cantidades hechas, destino), receta de costo en el detalle de producto
(aplicable a todas las variantes del modelo), y el ciclo cerrado — recibir con
origen Taller liga la producción y la completa sola (0018, simétrico a órdenes de
compra). RLS: el Taller opera sus órdenes, la tienda destino ve lo que viene hacia
ella. Regla de arquitectura sostenida: avanzar producción NO toca stock — el stock
nace únicamente cuando la tienda recibe el fardo.

## 2026-07-19 (Fase C1 — los 4 estados financieros)
Tras dos rondas de investigación contable (docs/ESTUDIO-CONTABILIDAD.md y
docs/MANUAL-CONTABLE-CAYLA.md) y guardarlas en memoria, Felipe pidió armar los
balances de verdad: Balance General, EERR, Flujo de Efectivo y Estado de Cambios en
el Patrimonio. Decisión de arquitectura: modelo de LECTURA (lib/contabilidad.ts) que
calcula los 4 estados sobre los sub-libros existentes aplicando las reglas del
manual — SIN tabla de asientos, SIN migración, SIN tocar ningún money path (venta,
stock, gastos intactos). Cuadra por construcción: Patrimonio = Activo − Pasivo, y se
desglosa en Capital (residual: aportes e inventario por formalizar) + Utilidades
acumuladas (EERR de toda la historia). Verificación algebraica hecha: la identidad
contable se sostiene con el modelo caja/inventario/IGV. Página Finanzas → Balances
con los 4 estados y selector de mes. Corrección del manual aplicada: el flete
(gasto "transporte") se presenta dentro del margen bruto (cuenta 609), no entre
gastos de operación. Simplificaciones declaradas en la propia pantalla: Balance a
hoy, costo vigente, sin depreciación ni cuentas por pagar (llegan en C2). El
endurecimiento a libro mayor inmutable con asientos persistidos queda para C4/SUNAT.

## 2026-07-19 (loop autónomo — ayudas (!) que enseñan)
Felipe pidió trabajar en loop agregando descripciones fáciles y botones (!)
clicables que expliquen cada concepto en su idioma. Se construyó el componente
`Ayuda` (un (!) sutil en la marca; abre panel al tocar, cierra al tocar afuera o con
Escape; fuerza texto normal aunque viva dentro de una etiqueta en versalitas — bug
de herencia detectado y arreglado en verificación en vivo). Regado por todas las
pantallas con jerga: los 4 estados financieros (cada término del Balance/EERR/Flujo/
Cambios explicado con analogía del negocio), el Resumen de Finanzas, el cuadre de
Efectivo, Comercial (rotación, reponer, dinero parado) y los indicadores del detalle
de producto (velocidad, días de inventario, días sin venta, sell-through, clase ABC)
y del Inicio del Líder. Encarna el protocolo de docencia del CLAUDE.md: dejar a
Felipe más capaz de discutir el sistema, no de aplaudirlo. Verificado en vivo con el
navegador: el (!) abre, cierra y se ve en la marca.

## 2026-07-19 (noche — carga de data + plan maestro)
Felipe pidió cargar su data real de las 3 unidades. Estudio profundo de los SINATRA
para catálogo: "Ingreso Mercadería" es un REGISTRO DE COMPRAS, no un catálogo (sin SKU,
sin tallas, sin colores; 350 "detalles" distintos solo en Polos&Tops). FRENO y discuto:
importarlo crearía cientos de productos a medias — el catálogo real se captura bien vía
recepciones. Lo cargable sí: PROVEEDORES, 292 únicos limpiados de 866 filas crudas (228
con RUC válido; me auto-corregí un bug donde el ".0" de RUC-como-float rompía la
validación; 3 conflictos reales de RUC entre archivos flagueados: Amuza/Ivanana/Maju
Vogue; 2 RUC rotos: Tawas/Tiska). SQL de carga dejado en Downloads (NO en git — es PII de
proveedores). Felipe también preguntó dónde va su IME: respuesta = Finanzas → Patrimonio
como Activo, NO gasto (corrige el enredo de SINATRA); se construyó categorización de IME
(muebles/equipos/intangibles) — migración 0019 + editor, PENDIENTE de que Felipe la corra
(sin subir para no romper prod). Antes de irse pidió plan detallado: escrito en
docs/PLAN-DE-TRABAJO.md (estado actual, 3 frentes, taxonomía alineada a su data real con 5
categorías nuevas propuestas: Conjuntos/Enterizos/Chalecos/Bodys/Blazers, plan de captura,
quién hace qué) + docs/GUIA-CARGA-CATALOGO.md (guía imprimible para Encargadas). Hallazgo:
su "Complementos" (412 compras, 2ª más grande) es mayormente bisutería — no es rubro menor.

## 2026-07-18 (tarde — identidad visual + rediseño UX total)
Dos saltos grandes en un día. Primero, la identidad: se leyó el brandbook CAYLA v3.0
(los dos PDFs de marca) y se aplicó a la app — Rojo #B8412D como acento sagrado, Crema
#F5F0E8 de fondo (nunca blanco puro), Tinta #1A1A18 (nunca negro absoluto), EB Garamond
para títulos/cifras + DM Sans para interfaz, sin sombras/gradientes/bordes redondeados,
el colibrí como marca. Tensión resuelta: Felipe pidió "tipo Apple" pero el brandbook
prohíbe justo el look Apple genérico — se decidió que la esencia CAYLA manda en el cómo
y Apple es la vara de calidad (espacio, tipografía, quitar lo que sobra).

Después, Felipe pidió rediseñar la funcionalidad completa ("no me gusta la distribución
de botones y todo el sistema") con descubrimiento tipo QuickBooks. Objeción aceptada:
en vez de las 99-300 preguntas que pidió, se hicieron ~24 de alto impacto en tandas de
4 (mismo método que el almacén). Decisiones clave: 50% escritorio / 40% celular; las
**Encargadas de atención al cliente** (vocabulario corregido por Felipe: jamás
"vendedoras" ni "empleados") son las usuarias principales; foco en INVENTARIO;
catálogo agrupado por producto con matriz de tallas; dolores nombrados: "ir al almacén
a buscar a ciegas" y "comprar por intuición sin datos". Felipe detectó él mismo la
redundancia Inventario/Almacén → se investigó QuickBooks + POS retail (Square,
Lightspeed): navegación v3 aprobada = lateral escritorio con "+ Nuevo" global, 4
pestañas + botón + central en celular, Almacén DENTRO de Inventario. Tiene escáner
Zebra (funciona como teclado — soportado de fábrica por la búsqueda) e impresoras
Epson TM-T20III (boletas) y Brother QL-1110NWB (etiquetas). Fase A construida y
desplegada de un tirón: AppShell, /buscar con ubicación de contenedor, /inventario
agrupado, inicios por rol, /vender, /comercial v1. Precio ahora visible para
Encargadas (lo necesitan para vender; el costo sigue siendo solo del Líder).
Pendiente fase B: fotos (una por modelo), etiquetas Brother, stock mínimo por sede,
exportar Excel, conteo físico. Al cierre, Felipe pidió y se construyó el selector de
sede del Líder (TRU/AQP/LIM/Taller en la cabecera): cambia la perspectiva de toda la
app sin tocar permisos — el servidor ya validaba por 0012. Verificado en vivo por
Felipe ("bien muy bien").

## 2026-09-04 (modernización de interfaces — primer paso)
Felipe pidió "descargar skills para el diseño de todas las interfaces" y que la app
sea "moderna". Antes de tocar código se auditó el repo: ya existe un sistema de
identidad completo y verificado en producción (brandbook v3.0), y hay un precedente
explícito del 18-jul donde se decidió que la esencia CAYLA manda sobre una estética
genérica "tipo Apple". Se le presentó la tensión a Felipe con AskUserQuestion: eligió
modernizar DENTRO del sistema CAYLA, usando Radix/shadcn solo como base de
accesibilidad sin estilo propio, nunca el look por defecto de un kit externo.

Se encontró el punto real de la petición: 6 modales del núcleo (abrir/cerrar caja,
vender, bajar a tienda, registrar gasto, movimiento de stock) seguían con estilos
genéricos pre-brandbook (blanco/negro/neutral-*), y ninguno de los 8 modales de la
app atrapaba el foco ni cerraba con Escape. Se construyó `components/ui/Modal.tsx`
(Radix Dialog + tokens CAYLA) y se migraron los 6 modales + `EfectivoPanel` →
ADR-0003. Verificado en navegador (página de prueba temporal, borrada al cerrar):
overlay y panel con la paleta correcta, Escape y click-afuera cierran. Pendiente,
anotado en BACKLOG: `MenuNuevo` del AppShell sigue sin el mismo tratamiento (patrón
distinto, no modal). Commiteado.

## 2026-09-08 (campos con estado y capa de movimiento)
Felipe pidió rediseñar "emitir comprobante" — desplegables, campos, etiquetas,
animaciones — "futurista y elegante" y reutilizable, sin tocar la lógica interna que
él está trabajando en paralelo. Se le marcó la tensión antes de escribir código:
"futurista" en su forma habitual (glassmorphism, glow, gradientes, redondeos) choca
con el brandbook v3.0, cuyos tokens de radio están en 0 y cuyas sombras están
desactivadas a propósito. Se resolvió como instrumento de precisión: el futurismo
viene del comportamiento, no de la decoración. Cero colores nuevos → ADR-0011.

Se construyó `components/ui/campos.tsx` (Campo, CampoTexto, CampoMonto, CampoSelect,
Segmentado, Boton) sobre un solo dispositivo visual — el "hilo vivo", 1px que se
dibuja en rojo al enfocar — más una capa de movimiento en `globals.css` con
`prefers-reduced-motion`. `CampoSelect` es un listbox propio con teclado completo, sin
sumar dependencias. El modal de emisión ahora muestra el correlativo que se va a
reservar ANTES de emitir, o avisa que la sede no tiene serie: el dato ya venía en la
prop `series` y solo faltaba mostrarlo — antes eso se descubría con la RPC fallando y
la clienta en el mostrador.

Verificado en navegador con ruta de prueba temporal (borrada al cerrar): modal
centrado en escritorio y hoja desde abajo en móvil, desplegable con flechas/Enter/
Escape, segmentado que desliza y cambia el formulario a RUC, banda del correlativo
avisando la sede sin serie. Dos bugs propios encontrados y corregidos en el camino:
el centrado del modal peleaba con el transform de la animación, y Escape sobre el
desplegable abierto cerraba el modal entero. tsc, eslint y 51 tests en verde.

## 2026-09-08 (legibilidad y suavizado — todo el sistema)
Con Facturación ya en producción, Felipe pidió tres cosas para toda la app: texto más
grande o con más contraste ("las letras pequeñas no se llegan a notar"), menos sharp /
más smooth, y más animaciones. Lo segundo revierte su propia decisión del 05-sep
(radio 0, sin sombras); se le marcó antes de tocar nada y confirmó el cambio de
criterio → ADR-0012, para que no se lea como drift dentro de seis meses.

Lo del texto resultó medible, no de gusto: `text-tinta/45` — la etiqueta más usada del
sistema, 136 apariciones — daba 2.57:1 sobre crema, contra el mínimo AA de 4.5. El
ámbar de los chips daba 3.07 y el verde 4.21. Se subió el PISO sin tocar el techo:
tamaños 8→10/9→11/10→11/11→12, tokens xs 12→13 y sm 14→15 (mueve ~320 usos desde un
solo lugar), piso de contraste en tinta/65, y verde/ámbar oscurecidos con hermanos
"profundos" para el texto sobre su propio tinte. Medido después sobre el DOM
renderizado: 0 elementos reprueban AA, el peor quedó en 4.72. `EtiquetasGenerator`
quedó congelado a propósito — imprime en rollo físico de 62×29mm.

Radios 0 → 4/8/12/16/22px y sombras reactivadas solo para lo que flota. Movimiento
nuevo: salida animada del modal (antes desaparecía de golpe), globo de ayuda,
escalonado del desplegable, alza al pasar el mouse y barrido de luz en los botones.
61 archivos por sustitución mecánica, verificado con tsc, eslint, 51 tests, `next
build` y medición de contraste en el navegador. Subido a GitHub y desplegado a Vercel
sin consultar, por pedido explícito de Felipe al ser un cambio solo estético.

## 2026-09-09 (la pantalla mentía: SUNAT sí estaba conectado)
Felipe preguntó si el aviso del modal de emisión —"el envío a SUNAT todavía no está
conectado, ver SEE propio vs. OSE"— seguía vigente. No: es texto de la Fase 0, falso
desde el 05-09, y peor, manda a decidir algo que ya se decidió y que no era ninguna de
las dos opciones que nombra (ni SEE propio ni OSE: Lucode como PSE, ADR-0005). En la
misma pantalla ya vivía el botón "Transmitir" que sí manda a SUNAT.

Corregido el texto del modal y el comentario de cabecera de `ComprobantesPanel.tsx`;
`ARQUITECTURA.md` repetía la misma afirmación en la línea de `/vender/facturacion` y
nunca había documentado `/api/lucode/emitir` ni la RPC
`actualizar_transmision_comprobante` — agregados los dos. tsc, eslint y 51 tests en
verde. De paso se corrigió el BACKLOG, que todavía daba las migraciones
`unificacion/20`/`21` por pegar cuando la BITÁCORA del 08-09 dice que se aplicaron.

**Lo que Felipe aprende acá:** un texto de interfaz es tan estado del sistema como una
tabla — envejece igual y nadie lo revisa, porque no rompe ningún test. Este llevaba
cuatro días diciéndole a quien está en el mostrador que no había nada que hacer después
de "Emitir", cuando faltaba exactamente un clic. Lo que sí sigue bloqueado no es el
código: producción no tiene `LUCODE_TOKEN` en Vercel, así que en el deploy "Transmitir"
responde `sin_credenciales`. La máquina de Felipe sí puede transmitir
(`apps/web/.env.local` tiene token y `LUCODE_ENTORNO=sandbox`) — el archivo que
`vercel env pull` sobrescribió es el `.env.local` de la raíz, que Next no lee. Con
`sandbox` ahí, un "Transmitir" de hoy queda "Aceptado" en la app sin haber llegado a
SUNAT, y nada en `respuesta_sunat` dice de qué ambiente vino: eso es un estado
inconsistente de verdad (principio 2), no un detalle de configuración.

## 2026-09-09 (la lentitud era geografía, no datos)
Felipe reportó pantallas lentas y pidió apostar por local-first. Se midió antes de
proponer, y la hipótesis obvia resultó falsa: la base responde en **0.862 ms** — 19
variantes, 28 movimientos, todo el schema `retail` por debajo de 1 MB. No hay consulta
que optimizar ni índice que agregar. La causa es geográfica: `X-Vercel-Id: iad1::…`
delata que la función corre en Washington D.C. mientras Supabase está en `sa-east-1`
(São Paulo), así que cada consulta cruza el continente y vuelve. Medido desde Perú, una
página **estática ya cacheada en el edge** tarda 430 ms de TTFB — ese es el piso, antes
de consultar nada. Encima, cada navegación encadena 4 viajes secuenciales, y dos son el
mismo `auth.getUser()` pedido dos veces (`middleware.ts:31` y `lib/persona.ts:52`: el
`cache()` de React memoriza dentro de un render, pero middleware y RSC son invocaciones
distintas). Hallazgos menores: las 28 rutas salen `ƒ` sin una sola directiva de caché en
todo el repo, `next.config.ts` está vacío, y `getEstadoResultados` (`lib/finanzas.ts:150`)
tiene 5 consultas independientes en fila india que el resto del repo ya había migrado a
`Promise.all`. El bundle quedó descartado como causa: 352 kB gzip, rango normal.

Se le marcó a Felipe la tensión de su propio pedido: local-first es la apuesta correcta
y se mantiene como destino, pero no es lo que está lento hoy — hacerlo primero sería
arreglar la capa equivocada, semanas de trabajo tras las cuales la primera carga
seguiría cruzando a Washington. Eligió el orden propuesto (Fase 0: región + cascadas +
`getClaims()`; Fase 1: caché y streaming; Fase 2: local-first) y decidió la regla de
negocio que faltaba: si se cae el internet en plena venta, se vende offline **solo con
stock de sobra**; si es la última unidad, bloquea — el punto medio entre perder la venta
y sobrevender. La arquitectura queda asentada en ADR-0013: lecturas replicadas al
navegador, escrituras siempre por RPC con `movimientos` como única fuente de verdad.
Nada de código tocado todavía, por pedido explícito suyo.

## 2026-09-09 (el riel del lateral — ADR-0014)
Felipe pidió rediseñar el menú lateral: "muy chico, muy hacia arriba, muy junto",
más futurista y elegante, con las animaciones ya establecidas pero algo innovador, y
"solo cambios estéticos" para poder pushear desde otra sesión sin sorpresas. Las tres
quejas eran medibles: lateral de 224px, filas de 39px con 2px de aire, y 6 ítems
apretados arriba dejando ~380px de vacío muerto abajo. Debajo había algo de fondo: el
lateral era el último rincón que seguía marcando "dónde estás" con un bloque `bg-sand`
plano, la gramática de julio, mientras desde ADR-0011 todo el resto usa el hilo vivo.

Se resolvió con UN riel que se desliza entre filas en vez de seis luces que se
prenden — el indicador del `Segmentado` puesto de canto, con la forma exacta de la
marca del desplegable: dos piezas que ya existían, unidas. Lo innovador propio: al
pasar el mouse por una fila apagada aparece el mismo riel en gris, donde va a quedar
el rojo si sueltas el clic ("estás acá / irías allá"). El alto de fila y el paso del
riel salen de las mismas dos constantes, así que no puede desalinearse y no hay que
medir el DOM. Ancho 224→272px desde un token nuevo (`--spacing-lateral`), que además
destapó que el panel "+ Nuevo" abría 16px corrido por un `left-60` suelto. Dos grupos,
Operación y Dirección, que coinciden con lo que solo ve el Líder; con un solo grupo el
título se oculta. De paso se cerró un pendiente del BACKLOG desde ADR-0003: `Escape`
cierra el "+ Nuevo" y el foco vuelve al botón.

Verificado en navegador con ruta de prueba temporal bajo `/auth` (el único prefijo que
el middleware deja pasar sin sesión; borrada al cerrar): riel en los 6 destinos, marca
fantasma, vista de Encargada sin el grupo "Dirección", `Escape` + devolución de foco,
riel del celular deslizándose, y contraste medido sobre el DOM. Ahí salió un hallazgo:
`text-taupe` sobre crema da 3.39:1 y reprueba AA — la firma del lateral quedó en
`tinta/65`, y los otros 9 usos de taupe de la app quedaron anotados en BACKLOG.
`tsc`, `eslint`, 51 tests y `next build` en verde. **Commiteado sin pushear**, por
pedido de Felipe: el push sale de otra sesión.

## 2026-09-09 (paso "a": el comprobante ya sabe contra qué ambiente se transmitió)
Buscando qué se ganaba con arreglar las variables de Lucode apareció algo peor que la
variable: `lib/lucode.ts` habla con sandbox o con producción según `LUCODE_ENTORNO`, y
las dos respuestas se guardaban idénticas — `estado='aceptado'`, con CDR y PDF. La base
afirmaba "SUNAT lo aceptó" sin poder respaldarlo, y se propagaba: `emitir_nota` solo
exige que el original esté aceptado, así que una nota de crédito real podía colgarse de
una boleta que solo existe en el sandbox.

Construido (ADR-0015): columna `comprobantes.entorno_transmision` con `check (estado =
'pendiente' or entorno_transmision is not null)`; `p_entorno` obligatorio en la RPC, con
la firma vieja de 4 parámetros dropeada a propósito para no dejar sobrecarga (el error
de PostgREST del 08-09); el ambiente viaja pegado al `ResultadoLucode` en vez de releerse
del entorno al guardar; la ruta rechaza notas que cruzan de ambiente; y el chip dice
"Aceptado · prueba" con borde punteado, más el conteo en el resumen del mes. tsc, eslint
y 51 tests en verde. **El SQL no se corrió en ningún lado todavía** — Docker estaba
abajo, así que `supabase db reset` no pudo verificarlo; queda como el primer paso de la
próxima vez que se abra el stack.

**Lo que Felipe aprende acá:** "está aceptado" no es un estado del sistema si el sistema
no sabe quién lo aceptó. El bug no era que se pudiera transmitir a un sandbox —eso hace
falta para probar—, era que después nadie pudiera notar la diferencia. Cuando dos hechos
con consecuencias legales opuestas se guardan iguales, el error no aparece el día que
ocurre sino el día que alguien confía en el dato.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.** Archivos de esta
sesión: `ComprobantesPanel.tsx`, `lib/lucode.ts`, `lib/comprobantes.ts`,
`app/api/lucode/emitir/route.ts`, `packages/database/src/types.ts`,
`supabase/migrations/0040_*.sql`, `supabase/unificacion/23_*.sql`, `docs/adr/0013-*`,
BACKLOG y BITÁCORA. NO son de esta sesión y quedan sin tocar: `AppShell.tsx`,
`globals.css`, `ui/campos.tsx`, `app/auth/`.

## 2026-09-09 (Fase 0 aplicada — de la geografía al código)
Felipe dio luz verde a la Fase 0 del ADR-0013 y se aplicó completa, con una advertencia
suya: había varias sesiones trabajando en paralelo sobre el mismo árbol. Se verificó
antes de escribir nada — las otras estaban en `lucode.ts`, `comprobantes.ts`,
`AppShell.tsx`, `campos.tsx` y `globals.css`; la Fase 0 iba sobre `finanzas.ts`,
`middleware.ts`, `persona.ts` y config. Cero cruce. (Detalle simpático: la sesión de
"Rediseño inicio" reescribió `lib/panel.ts` haciendo la misma clase de optimización —
quitar la relectura de `stock`, reusar `getSedes()` cacheado — sin coordinación previa.)

Los tres cambios: (1) `apps/web/vercel.json` fija la región en `gru1`; el archivo va en
`apps/web/` y no en la raíz porque el `package.json` raíz no declara `next` — si Vercel
construyera desde ahí no detectaría el framework, y el middleware que sí corre hoy no
existiría. Es una inferencia, no un dato leído: la config del proyecto Vercel da 403, así
que se confirma tras desplegar mirando `X-Vercel-Id`. (2) `getEstadoResultados` pasó de 5
consultas en fila india a `Promise.all` de 4, porque `sedes` salió de `getSedes()`
cacheado — esa consulta desaparece del todo en vez de paralelizarse; `getDiarioCaja`
igual, de 3 a una tanda. (3) `getUser()` → `getClaims()` en middleware y persona.

Lo más útil del día fue una suposición que se cayó al verificarla. El ADR daba por hecho
que (3) exigiría migrar el proyecto a claves JWT asimétricas — cambio de auth en
producción, y encima compartido con Dynamic, así que se había planificado como el paso
riesgoso, al final y por separado. Bastó pedir `/auth/v1/.well-known/jwks.json` para ver
que **el proyecto ya firma con ES256 asimétrica**: la verificación ya podía ser local con
WebCrypto y no había nada que migrar. La fase estuvo a punto de partirse en dos y de
gastar una consulta a Felipe por un riesgo inexistente. Queda anotado en el ADR.

Verificado: `tsc`, `eslint`, 51 tests y `next build` en verde. **Sin desplegar**: quedan 6
commits sin subir y 3 son de otras sesiones — hacer push habría desplegado trabajo ajeno
sin su visto bueno. La medición real del antes/después queda pendiente del despliegue;
hasta entonces la mejora es una estimación, no un hecho.

## 2026-09-09 (paso "c": el sistema ya sabe deshacer)
Felipe eligió construir la anulación ANTES de darle credenciales de producción a las
sedes — el orden correcto: el botón de facturar llega cuando ya existe el de deshacer.
Investigado contra `docs.apisunat.pe/llms-full.txt`, no de memoria: SUNAT tiene DOS
caminos, no uno. Factura y notas van por comunicación de baja (`/api/v3/voided`);
las boletas NO se pueden dar de baja individualmente, van por resumen diario
(`/api/v3/daily-summary` con `accion_resumen: "anular"`). El adaptador ya excluía
`boleta` de su firma — quien lo escribió sabía que faltaba la otra mitad.

Construido (ADR-0016): `anularBoletaLucode` en el adaptador, ruta `/api/lucode/anular`,
RPC `anular_comprobante` con motivo obligatorio, `anulado_por` y `anulado_at`, y botón
+ modal en la fila. Tres reglas que valen más que el botón: "anulado" solo se escribe
cuando SUNAT lo confirma (si el resumen diario vuelve PENDIENTE, la fila dice "Anulación
en trámite"); no se anula un comprobante con notas vivas colgadas; y el sistema NO
decide el plazo — la doc de Lucode se contradice (3 vs 5 días) y SUNAT habla de 7, así
que se intenta y se muestra el rechazo textual del proveedor. Decisión de Felipe: anular
es solo de líder, y la regla vive en la RPC, no en la pantalla.

De paso se corrigió el nombre del campo del motivo en `/voided`: el adaptador mandaba
`motivo_de_anulacion`, que no aparece en ninguna página de la documentación; el
documentado es `motivo`. tsc, eslint y 51 tests en verde. **Nada de esto está probado
contra el sandbox real ni corrido en Postgres** — Docker sigue abajo.

**Lo que Felipe aprende acá:** cuando una API externa tiene dos caminos para lo que
parece una sola acción, meterlos en una función con un `if` adentro no simplifica: hace
que el próximo que lea el código asuma que anular una boleta y anular una factura son lo
mismo. No lo son — una es síncrona y la otra la procesa SUNAT después. El código debe
dejar ver la diferencia que el negocio ya tiene.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.** Archivos de esta
sesión: `ComprobantesPanel.tsx`, `lib/lucode.ts`, `lib/comprobantes.ts`,
`app/api/lucode/{emitir,anular}/route.ts`, `app/(app)/vender/facturacion/page.tsx`,
`packages/database/src/types.ts`, `supabase/migrations/0040_*` y `0041_*`,
`supabase/unificacion/23_*` y `24_*`, `docs/adr/0015-*` y `0016-*`, BACKLOG y BITÁCORA.

## 2026-09-09 (tarde — middleware → proxy, la convención de Next 16)
Felipe pidió saldar el aviso de deprecación antes de seguir con la Fase 1. Next 16
renombró `middleware` a `proxy`: cambia el nombre del archivo y el de la función, y nada
más — `config.matcher` y los tipos `NextRequest`/`NextResponse` quedan idénticos. No se
usó el codemod oficial (`npx @next/codemod@canary middleware-to-proxy .`) porque corre
sobre todo el repo y había trabajo sin commitear de otras sesiones en el mismo árbol; a
mano fueron dos renombres y `git mv`, así que el historial del archivo se conserva.

El renombre no es cosmético y quedó explicado dentro del propio archivo: "middleware" se
confundía con el de Express —algo que corre DENTRO de la app— cuando en realidad es una
barrera de red por DELANTE, en otro proceso y potencialmente en otra región. Esa
separación es exactamente la razón de que `cache()` de React no comparta nada entre este
archivo y el render, que fue el hallazgo del ADR-0013. Se anotó además una trampa que
trae la doc: las Server Actions no son rutas propias (viajan como POST a la ruta donde se
usan), así que un matcher que excluya esa ruta deja la acción sin cubrir — se verificó
que `app/actions/sede.ts` ya valida por su cuenta antes de afirmarlo en el comentario.

Se verificó en vivo, no solo compilando, porque acá el riesgo no es que el build falle
sino que compile y el guardia de sesión desaparezca en silencio: con el server local, una
ruta protegida sin sesión da 307 a `/login`, una ruta de API da 401 JSON (el caso especial
que evita que un `fetch` reciba el HTML del login) y `/login` da 200. El propio log de
Next nombra `proxy.ts` en su desglose de tiempos. Build sin el aviso, `tsc`, `eslint` y 51
tests en verde.

Hallazgo de paso, **solo local**: hay un `package.json` + `package-lock.json` sueltos en
`C:\Users\danyj\` (de una instalación del CLI de supabase) y Next infiere ESE directorio
como raíz del workspace en vez del repo. En Vercel no pasa —el contenedor de build no
tiene ese home—, así que no afecta producción. Se arregla con `turbopack.root` en
`next.config.ts`; se deja para la Fase 1, que va a tocar ese archivo igual.

## 2026-09-09 (taupe deja de ser color de texto — ADR-0017)
Primero de los dos pasos que pidió Felipe después del lateral. `--color-taupe`
(#a47865) da 3.39:1 sobre crema y 3.21:1 sobre `bg-sand/40`: reprueba AA en todos los
fondos donde se usa, y siete de sus nueve usos son información operativa, no adorno —
los chips "Estancado", "muestra", "tercerizado", la categoría de un activo, el score de
un proveedor. ADR-0012 no lo vio porque esos 9 usos viven en pantallas que necesitan
sesión y el barrido de esa vez solo midió lo visible sin login.

Se agregó `--color-taupe-profundo: #805c4c` — mismo tono (18.1°) y saturación, la
luminosidad baja de 52% a 40% — y se pasaron los 9 usos de texto. Da 5.23:1 sobre crema,
4.94 sobre sand/40 y 4.72 sobre su propio tinte; medido después sobre el DOM renderizado
en `/login`: 5.21. El borde `border-taupe/40` de OrdenesProduccion queda como estaba: un
borde no es texto. El matiz que quedó escrito en el ADR es que acá "profundo" NO
significa lo mismo que en ADR-0012 — verde y ámbar solo fallaban sobre su propio tinte,
taupe falla en todos lados, así que el profundo lo reemplaza en todo texto.

De paso me corregí a mí mismo: la firma "Donde el estilo transforma." la había puesto en
`tinta/65` en el lateral porque era el arreglo seguro sin token nuevo. Con el token
existiendo eso dejaba la misma frase de dos colores según la pantalla, así que las tres
apariciones (login, /mas, lateral) quedaron en `taupe-profundo`. tsc, eslint y 63 tests
en verde.

## 2026-09-09 (Fase 1 — lo que sí entró, y por qué `cacheComponents` no)
Fase 1 se planificó con tres piezas: caché del router, `cacheComponents` para que el
armazón aparezca al instante, y cachear `sedes` de verdad. Al ir a construirlas, dos de
las tres se cayeron por razones distintas, y ambas caídas son el contenido real del día.

**Lo que entró.** `staleTimes.dynamic = 30`: el default de Next es 0, así que volver
atrás a una pantalla ya vista repetía el render completo en el servidor — desde Perú
~400ms para ver algo que se acababa de mirar, y en el mostrador se navega Vender →
Inventario → Vender todo el tiempo. Subirlo es seguro por una disciplina que el repo ya
tenía: los 22 componentes que mutan algo llaman `router.refresh()` al terminar, lo que
invalida esa caché entera. Se verificaron uno por uno (venta, recepción de lote, gasto,
movimiento, caja) ANTES de subir el valor, no después. Y `turbopack.root`, que silencia
la inferencia equivocada de la raíz del workspace; se comprobó instrumentando la config
temporalmente para ver el path resuelto, en vez de asumir que `__dirname` apuntaba donde
uno cree.

**Lo que se cayó por medición, no por pereza.** `cacheComponents` no es un flag que se
prende: con él, `Date.now()` y `new Date()` durante el prerender son **error de build**, y
el escape `instant = false` explícitamente no los perdona. Este repo tiene **16 de esos**
en código de servidor, más **24 archivos** que llaman `requirePersonaActual()` → `cookies()`
y necesitarían cada uno su `<Suspense>`. Encima `<Activity>` cambia el ciclo de vida —el
estado sobrevive a la navegación, así que los 8 modales hay que revisarlos uno a uno. Es
una migración de casi todas las páginas, y hoy había otras sesiones con `app/(app)/page.tsx`,
`lib/panel.ts` y el rediseño del riel abiertos. Se difiere a su propia sesión con el árbol
quieto; Vercel publica una skill oficial para conducirla (`next-cache-components-adoption`).

**Lo que se descartó por ser inútil.** Cachear `sedes` globalmente sonaba obvio —5 filas
que no cambian nunca, pedidas en cada carga— pero al mirar el código no gana nada: ya sale
dentro del `Promise.all` de `requirePersonaActual`, **en paralelo con la consulta a
`personas`, que es por usuario y no se puede cachear**. Eliminar el viaje de `sedes` no
acorta la ruta crítica ni un milisegundo, porque el otro viaje de esa misma tanda sigue
ahí. Y hacerlo habría costado caro: `unstable_cache` corre fuera del contexto de request,
así que `cookies()` revienta adentro, y un cliente anónimo chocaría con la política
`sedes_select_autenticado`. Habría que debilitar RLS o meter una service key al proyecto
para ganar cero. Se anota como idea muerta para que no se vuelva a proponer.

## 2026-09-09 (0040 y 0041 corridas: el local no era lo que decía ser)
Al ir a correr las migraciones apareció que `supabase_migrations` registraba hasta la
0035 aplicada, pero `retail.comprobantes` no tenía `comprobante_original_id` ni
`motivo` (columnas de la 0034) y `emitir_nota` no existía. El número registrado y el
esquema real no coincidían — arrastre de la renumeración de migraciones que ADR-0009 ya
documenta. Y por el diseño de ADR-0010 (el seed renombra `public`→`retail` DESPUÉS de
migrar), `supabase migration up` no puede arreglarlo: aplicaría contra un `public`
vacío. La única salida es `db reset`, que Felipe autorizó con el costo medido — 1
comprobante de prueba, todo lo demás lo regenera el seed.

Reset corrido: las 41 migraciones aplican en orden. Verificado en Postgres real, no por
inspección: la restricción de ambiente y la de motivo quedan `VALIDADO` (el bloque que
las valida solas funcionó), y `actualizar_transmision_comprobante` tiene UNA sola firma
de 5 argumentos — el drop de la vieja evitó la sobrecarga que rompió PostgREST el 08-09.
Después, siete reglas probadas suplantando a la líder sembrada: aceptado sin ambiente
rechazado; anular un pendiente rechazado; anular sin motivo rechazado; anular con una
nota viva rechazado; baja en trámite deja el estado en "aceptado" y solo pone
`anulacion_solicitada_at`; baja confirmada escribe 'anulado' con motivo y `anulado_por`.

**El hallazgo que queda para el proyecto:** hay DOS stacks locales corriendo —
`cayla-retail` (API 54421 / DB 54422) y `cayla-dynamic` (54321 / 54322) — y
`apps/web/.env.local` apunta al de **Dynamic**, cuyo schema `retail` no tiene
`comprobantes` ni `series_comprobantes` ni `proformas`. O sea: el "local" que levanta
la app y el "local" que administra `supabase db reset` desde este repo NO son la misma
base. Por eso no se verificó la pantalla en navegador — y explica de dónde salía la
sensación de que "en local no se ve lo que acabo de migrar". No se tocó `.env.local`:
tiene los tokens de Felipe y la sesión de latencia está midiendo contra local ahora.

**Lo que Felipe aprende acá:** "está aplicado" no es un hecho hasta que lo dice la base,
no la tabla de migraciones. Acá el registro decía 0035 y el esquema decía otra cosa —
y ese desfase es justo lo que hace que una migración "ya probada" falle en producción.
Correrla contra un Postgres de verdad y preguntarle a `pg_constraint` y `pg_proc` qué
quedó es la diferencia entre creer y saber.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (Fase 2 — el motor de sincronización, decidido por un hallazgo de seguridad)
Con el punto 2 (`cacheComponents`) bloqueado por el árbol en movimiento, se pasó a resolver
lo que ADR-0013 había dejado abierto: qué motor de sincronización para local-first. Se
evaluaron los tres reales — ElectricSQL (solo lecturas, sobre replicación lógica),
PowerSync (bidireccional, el único con escrituras offline de primera) y Zero (bidireccional
server-authoritative con `zero-cache`).

ElectricSQL parecía la respuesta obvia: su modelo es solo-lectura, sin CRDT ni conflictos,
que es exactamente la forma que ADR-0013 había decidido. **Hasta que apareció el dato que da
vuelta todo: ElectricSQL no implementa RLS** — su equipo declaró que hasta la 1.0 dependen de
autorización por API. Y lo mismo, en distinto grado, vale para los tres: todos esperan que la
autorización viva en una capa propia delante de la base. Eso choca de frente con lo que este
proyecto ya escribió en `CLAUDE.md`: "la seguridad la resuelve RLS directamente, no una capa
de API separada". Adoptar cualquiera significaría reexpresar `stock_select_lider`,
`stock_select_propia_sede`, `fn_es_lider()` y `fn_sede_actual_persona()` como reglas de un
proxy — reescribir el modelo de seguridad para ganar velocidad de lectura.

Decisión (ADR-0018): **local-first a mano sobre lo que ya hay** — instantánea en IndexedDB +
Supabase Realtime para los cambios, que sí respeta RLS de fábrica. Sin servicio nuevo, sin
tocar la replicación del proyecto compartido con Dynamic, y con la autorización viviendo en
un solo lugar. Se acepta que es código propio: es código pequeño para datos pequeños (<1 MB
hoy), y la alternativa no era menos código sino menos código acá y un modelo de seguridad
nuevo allá.

Verificado antes de escribirlo como supuesto: la publicación `supabase_realtime` en
producción tiene **0 tablas**. Habilitarla es DDL sobre el proyecto compartido, así que es el
primer paso de la Fase 2 y necesita el visto bueno de Felipe, no ejecución directa.

**Y la precondición que importa más que todo lo anterior: la Fase 0 sigue sin desplegar.** El
"~700ms" es estimación, no medición. Construir el cambio de arquitectura más grande desde la
unificación encima de una línea base sin medir es justo lo que el método prohíbe. El ADR
queda escrito para que la decisión sea rápida cuando haya números — no para adelantarla.

## 2026-09-09 (Desplegable: el selector de sede deja el <select> nativo)
Segundo de los dos pasos. El `SedeSwitcher` era el último control de la cabecera con la
lista gris que dibuja Windows, al lado del buscador y del lateral que ya hablan la
gramática de CAYLA. El obstáculo real no era el estilo: `CampoSelect` es `Campo` +
combobox, y `Campo` dibuja un <label> y reserva alto fijo para el pie — meterlo en la
cabecera le sumaba ~30px de alto a la barra superior de TODAS las pantallas.

Se partió en dos en vez de agregarle un prop `compacto`: `Desplegable` es el control y
`CampoSelect` pasa a ser `Campo` + `Desplegable`. Un flag de modo adentro obliga a pensar
cada cambio futuro dos veces ("¿con etiqueta o sin?"); partirlo deja a cada pieza haciendo
una cosa. La API de `CampoSelect` quedó idéntica — su único consumidor, `ComprobantesPanel`,
no se tocó, y se verificó que su lista sigue midiendo exactamente el ancho del campo
(334px = 334px). El `Desplegable` toma dos formas: `campo` (se para sobre el hilo vivo) y
`pastilla` (se defiende con borde, para la cabecera), y dos anclajes de lista, porque el
disparador de la cabecera dice "TRU" y mide 65px — una lista de 65px no se puede leer.

El arreglo de fondo no es visual: mientras la app se repuntaba a la otra sede, lo único
que avisaba era un `disabled:opacity-50`, o sea nada. Ahora corre el barrido del hilo.
Verificado en navegador (ruta de prueba temporal, borrada al cerrar): lista anclada a la
derecha sin salirse de pantalla en 375px, Escape cierra y devuelve el foco, flechas+Enter
eligen, barrido corriendo a 1.1s, y `CampoSelect` sin cambios.

**Hallazgo del camino, y su corrección al cerrar la sesión:** `next build` falló dos veces
con "Uncached data accessed outside of <Suspense>" y después pasó cinco veces seguidas con
el mismo código. Supuse que no era mío, lo verifiqué con un A/B (stash → build → pop →
build) y tampoco era del A/B. Lo anoté como build intermitente, culpando a un supuesto
"Cache Components activado por defecto en Next 16.2" que salía en el banner.

**Eso era falso, y se descubrió al auditar el cierre.** El banner ya no lo dice: la sesión
paralela tenía `cacheComponents` prendido en el árbol de trabajo justo en esa ventana,
probándolo, y después lo sacó (ver la entrada "Fase 1 — lo que sí entró, y por qué
`cacheComponents` no", más arriba). Nunca fue intermitente ni mío: era el árbol compartido
cambiando debajo. Se borró el pendiente equivocado del BACKLOG — duplicaba, encima mal, el
que esa sesión ya había dejado bien escrito. La lección para dos sesiones en paralelo sobre
un mismo working tree: un build que falla puede no ser del código de nadie, sino del
minuto. tsc, eslint, 63 tests y 5 builds seguidos en verde.

## 2026-09-09 (23 y 24 en producción: (a) y (c) cerrados salvo la prueba con Lucode)
Antes de pasarle el SQL a Felipe se verificó contra producción que los tres supuestos de
los archivos fueran ciertos: que `retail.es_lider()` y `retail.puede_operar_sede(uuid)`
existan con esos nombres, y que `actualizar_transmision_comprobante` tuviera hoy la
firma de 4 argumentos que el `drop` apunta. Los tres, correctos — el round-trip que
costó la primera migración post-unificación (03-09) esta vez no pasó.

Felipe pegó las dos. Confirmado leyendo la base: una sola firma de 5 argumentos (sin la
sobrecarga que rompió PostgREST el 08-09), las 6 columnas, y
`comprobantes_anulado_tiene_motivo` en VALIDADO.

**Lo que la verificación encontró de paso:** `retail.comprobantes` NO estaba vacía como
decía el backlog — tiene **B004-000002** (boleta, S/10.00, aceptada, transmitida el 08-09
17:35 Lima). Por eso `comprobantes_transmitido_tiene_entorno` quedó NOT VALID, que es
justo lo que el bloque `do $$` estaba diseñado para hacer sin romper el script. Nadie
sabe si esa boleta salió al SUNAT real o al sandbox: es el agujero que ADR-0015 cierra,
llegado un día tarde. No se rellenó a mano — se resuelve mirando el panel de Lucode.
Consecuencia para (b): la serie B004 de TRU va por el número **3**, no el 2 del backlog.

**Lo que Felipe aprende acá:** una migración se verifica ANTES de pegarla, no solo
después. Los tres `select` contra `pg_proc` que corrieron primero costaron un minuto y
son la diferencia entre pegar sabiendo y pegar a ver qué pasa — sobre todo en un esquema
que no es el propio, donde el nombre de una función (`fn_es_lider` en local,
`es_lider` en producción) no es el mismo.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (el "+ Nuevo" es un menú, no un diálogo — ADR-0019)
Tercero y último de los pendientes que quedaron del lateral. La pregunta "¿lo migramos a
`Modal`?" se había reabierto tres veces (ADR-0003 lo dejó afuera a propósito, ADR-0014 lo
resolvió a medias), así que esta vez quedó como ADR en lugar de comentario. La respuesta
es no, y no por ahorrar: atrapar el foco es el patrón de un DIÁLOGO. Un menú hace lo
contrario — el tabulador lo cierra y sigue de largo.

Lo que seguía roto no era la falta de trampa de foco: era que Tab recorría las cinco
opciones y después seguía por la app de atrás, tapada por el velo pero entera tabulable.
Quien navega con teclado terminaba escribiendo en un formulario que no podía ver. Se
implementó el patrón menu button completo: `role="menu"`/`menuitem`, `aria-haspopup="menu"`
en los dos disparadores, flechas con vuelta, Inicio/Fin, Espacio (Enter ya andaba solo,
son `<a>`), tipeo para saltar, y Tab cerrando. El teclado es el mismo de `CampoSelect`:
se levantó de ahí, no se inventó, así que se comporta igual.

Una diferencia con la letra del patrón, asumida: la W3C dice que Tab mueve al siguiente
elemento de la página; acá devuelve el foco al botón que abrió. Cuesta un Tab más y evita
arrastrar para siempre un buscador de "próximo tabulable" por un menú de cinco opciones.
Verificado en navegador con ruta de prueba temporal (borrada al cerrar): flechas con
vuelta en los dos sentidos, Inicio/Fin, "b" saltando a "Bajar a tienda", Espacio navegando
de verdad, y Tab y Escape cerrando con el foco de vuelta en el botón sin caer en el enlace
de atrás. tsc, eslint y 63 tests en verde. Con esto quedan cerradas las tres cosas que el
lateral había dejado anotadas.

## 2026-09-09 (b1: la primera llamada real encontró dos bugs que la doc tapaba)
El plan era poner el token en Vercel. Antes de eso apareció un riesgo de orden que había
que decir: el deploy vivo llama a `actualizar_transmision_comprobante` con 4 argumentos y
producción ya solo tiene la de 5 (por la migración 23 recién pegada). Poner el token sin
desplegar el código habría hecho lo peor posible — transmitir el documento a SUNAT y
fallar al guardarlo. Hoy no pasa solo porque la ruta corta antes, en `sin_credenciales`.
Y desplegar exige pushear 19 commits, 14 de otras sesiones, incluida una reescritura de
auth que su propia sesión marcó "pendiente de desplegar". Felipe eligió probar en local.

No se pudo levantar el dev (ya corría otro `next dev` de otra sesión, PID 37052, y Next
no permite dos para el mismo directorio; no se mató su proceso). Así que se probó lo
único que de verdad estaba sin verificar: el contrato con Lucode, llamando al sandbox
con el adaptador REAL del repo, no con un payload inventado.

**Encontró dos bugs que solo una llamada real podía mostrar.** La documentación describe
mal el cuerpo de LOS DOS endpoints de anulación: ninguno acepta la forma plana. Boleta
necesita `{documento:"resumen_diario", documentos_afectados:[...]}` y factura
`{documento:"comunicacion_baja", motivo, documento_afectado:{...}}`. Los errores no
ayudaban: `Undefined array key "documentos_afectados"` uno, `El campo documento
seleccionado no es válido` el otro. Corregidos y reprobados: los dos devuelven `ok`.

**Y confirmaron la decisión más discutible de ADR-0016:** los dos caminos responden
PENDIENTE, no ACEPTADO — el de boletas lo dice con todas sus letras, "firmado
correctamente, pero aún no ha sido validado por la SUNAT". O sea que "Anulación en
trámite" no era un caso raro del resumen diario: es el camino normal de toda anulación.
Si la RPC hubiera escrito 'anulado' con el primer 200, el sistema estaría dando por dado
de baja algo que SUNAT ni miró.

**Lo que Felipe aprende acá:** la documentación de un proveedor es una hipótesis, no un
hecho. Estos dos bugs pasaron tsc, eslint, 63 tests y una revisión de esquema completa —
ninguna de esas herramientas puede saber qué espera un servidor ajeno. La única prueba
que valía era la llamada, y costó diez minutos. Fíjate el orden que salvó esto: se probó
en SANDBOX antes de poner el token de producción, así que el precio de estar equivocado
fue cero.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (el Inicio: pasos 0 y 1 — y la red de seguridad que nunca funcionó)

Rediseño del Inicio contra cómo lo resuelven los ERPs serios (cues de Dynamics 365,
KPI Scorecard de NetSuite, Activities de Odoo). Del plan de 6 pasos entraron dos.
**Paso 0:** `getPanelLider` dejó de releer `stock` entero con su join a `variantes`
para sumar el inventario a costo — ahora lo saca de las variantes que la pantalla ya
cargó. El Inicio era la pantalla más visitada y la que más leía. Efecto de lado que
vale más que el rendimiento: el inventario a costo del Inicio y el de Comercial salen
del mismo cálculo, así que ya no pueden discrepar. **Paso 1:** las 4 cifras pasaron a
`TarjetaIndicador` (la de Finanzas, extendida con dos huecos opcionales: `ayuda` y
`pie`), con mini-línea de 14 días y comparativo. Decisión de Felipe: el inventario a
costo ahora **incluye el almacén**, con una línea chica que lo dice — la mercadería
recibida y sin bajar es la plata más dormida que hay, esconderla la volvía invisible.

**Lo que Felipe aprendió y no era obvio:** un porcentaje necesita dos cosas del mismo
tamaño. El comparativo no es contra ayer sino contra el mismo día de la semana pasada
**y solo hasta esta misma hora**: a las 10am ninguna tienda vendió su día entero, así
que comparar contra el día completo pinta un rojo permanente por las mañanas que no
significa nada. En TRU, que vende casi todo entre 5 y 8 de la tarde, ese número mal
hecho se aprende a ignorar en una semana. La aritmética de "qué día es esto" en hora
de Lima salió a `lib/panel-serie.ts` (puro, sin Supabase) con 12 pruebas que fijan los
bordes donde UTC y Lima no coinciden — una venta a las 11pm en Trujillo cayendo en el
día equivocado no rompe nada, solo deja la cifra mal, en silencio.

**El hallazgo de la sesión, que no era del Inicio:** `retail.recalcular_stock()` —lo
que ARQUITECTURA.md §4.2 llama la red de seguridad del inventario— **nunca pudo correr
en una base con ventas.** Insertaba las salidas como `-sum(cantidad)` confiando en que
el `on conflict do update` las restara de la fila existente, pero Postgres evalúa los
CHECK sobre la fila PROPUESTA antes de detectar el conflicto: `stock_cantidad_no_negativa`
la rechazaba antes de que el update llegara a existir. Confirmado con una reproducción
de 4 líneas, no por deducción. Arreglado calculando el neto por (variante, sede) en una
sola pasada (ADR-0020, `0042` local + `unificacion/25` sin pegar). De paso salió un
segundo defecto del mismo tamaño: el `truncate` de la versión vieja borraba también
`stock_minimo` y `contenedor_id`, que no se derivan de `movimientos` — arreglar solo el
error de Postgres habría entregado algo peor, una función que ahora sí corre y borra en
silencio los mínimos de cada sede.

**Tres trampas de entorno que costaron media hora y valen más que el tiempo perdido:**
(1) hay **dos** `.env.local` —el de la raíz, restos de un `vercel env pull` con los
valores literales `"[SENSITIVE]"`, y el de `apps/web`, que es el que Next lee—; diagnostiqué
sobre el equivocado y llegué a una conclusión falsa antes de corregirme. (2) El servidor
de desarrollo tiene `NEXT_PUBLIC_SUPABASE_URL` **exportada en su terminal**, y en Next eso
le gana al archivo: `apps/web/.env.local` dice `:54321` (stack de dynamic) pero la app
habla con `:54421` (stack de retail). Se resolvió mirando `auth.users.last_sign_in_at` en
las dos bases, no razonando. (3) `retail.stock_almacen` **no existe en local** — solo la
crea `unificacion/12`, que es de producción — así que la línea del almacén no se puede
verificar acá. Cuarto caso del patrón de migraciones duales.

Y para poder ver funcionar algo alguna vez: `supabase/seed-demo.sql`, opt-in (no está en
`config.toml`), 28 ventas en 14 días con forma, una prenda que dispara "reponer ya" y otra
estancada. Respeta la regla: inserta `movimientos` con su fecha real y deriva `stock`, nunca
escribe una cantidad a mano.

**SESIÓN EN CURSO — quedan los pasos 2 a 6 del Inicio.** Lo de esta parte es seguro de
commitear: `lib/panel.ts`, `lib/panel-serie.ts` (+ pruebas), `components/TarjetaIndicador.tsx`,
`app/(app)/page.tsx`, `supabase/migrations/0042`, `supabase/unificacion/25`, `supabase/seed-demo.sql`,
`docs/adr/0020`.

## 2026-09-09 (Inicio, paso 2 — la bandeja de pendientes: estado vs. acción)

El Inicio pasa a tener dos mitades con naturalezas distintas, y la diferencia es
lo que hace útil el bloque nuevo. Las 4 tarjetas de arriba describen un ESTADO
("vendiste S/306", "3 de 3 cajas abiertas"). La bandeja de abajo lista ACCIONES:
cosas con consecuencia si nadie las hace hoy. Seis, cada una con su contador y su
enlace a la pantalla donde se resuelve — patrón "Activity Cues" de Dynamics 365:
comprobantes rechazados por SUNAT, comprobantes emitidos y nunca transmitidos,
cajas que amanecieron abiertas, producción terminada sin inventariar, producción
pasada de su fecha de entrega, y órdenes de compra que ya debieron llegar.

**Lo que Felipe aprendió y no era obvio:** el valor del bloque está en cuándo NO
aparece. Un tablero que muestra "0 pendientes · 0 rechazados · 0 atrasados"
enseña a ignorar esa zona de la pantalla, y el día que salga un número real ya
nadie lo mira. Así que si no hay nada que hacer, el bloque no existe — verificado
en vivo neutralizando las seis condiciones y recargando: desaparece entero, sin
encabezado huérfano. De la misma familia es la decisión de dónde va el rojo: solo
lo llevan los tres que tienen plazo legal o dinero suelto (SUNAT × 2 y la caja
sin cerrar). Si se pintara todo, el rojo dejaría de significar nada.

Eso obligó a corregir algo del paso 1: la tarjeta "Cajas" pintaba de rojo toda
caja cerrada, pero una caja cerrada de noche es lo normal, no una alerta. Ahora
la tarjeta dice el estado sin rojo ("3 de 3 abiertas") y la alerta de verdad —una
caja que lleva días abierta— vive en la bandeja. Dos reglas más que quedaron
escritas: una orden de compra SIN `fecha_estimada` no se marca atrasada nunca
(no sabemos cuándo debía llegar, y avisar de algo que quizá no lo está es la
forma más rápida de que la bandeja pierda credibilidad), y un comprobante
emitido HOY y todavía sin transmitir tampoco cuenta: sigue en el flujo normal.

El seed de demostración se extendió para poder ver todo esto (comprobante
rechazado con su código real de SUNAT, uno sin transmitir, caja de LIM abierta
hace 3 días, dos corridas del Taller y una orden de compra vencida). De paso
dejó registrada una trampa real: al sembrar comprobantes a mano hay que mover
`series_comprobantes.siguiente_numero`, o la primera boleta emitida desde la
pantalla choca contra el `unique(tipo, serie, numero)` — el mismo problema que
dejó B004-000001 en producción el 05-09.

## 2026-09-09 (Inicio, paso 3 — el traslado deja de mirar el cero y mira el límite)

El paso iba a ser el más barato del plan: mostrar `alertasTraslado`, que
`inteligencia.ts` calculaba desde que existe y no leía ninguna pantalla —
trabajo pagado y tirado, cero consultas nuevas para rescatarlo. Al explicarle a
Felipe la limitación del algoritmo (solo avisa con una sede en CERO exacto, así
que una tienda con 1 unidad de algo que vuela no aparece nunca), decidió
cambiar la regla: **que el aviso lo dispare el límite que cada sede fija, no el
cero.**

Lo bueno es que ese límite ya existía entero y nadie lo estaba aprovechando:
`stock.stock_minimo` se fija por sede desde `/producto/[varianteId]` con la RPC
`fijar_stock_minimo` (componente `MinimosPorSede`, Fase B), pero solo alimentaba
"reponer ya". El traslado lo ignoraba. O sea que la función que Felipe pedía ya
estaba a medio construir hacía meses, en el lado del negocio, sin conectar.

**Lo que Felipe aprendió y no era obvio:** cambiar un umbral obliga a cambiar
también la explicación. Con la regla vieja el motivo era evidente y no había
nada que decir ("está en cero"). Con un límite configurable, el mismo número
significa cosas distintas en cada tienda: 2 blusas están bien en una sede con
límite 1 y mal en una con límite 5. Por eso la línea ahora dice el porqué —
"TRU tiene 2, su mínimo es 5"— y no solo el número. Un aviso configurable que no
dice contra qué se configuró es un aviso que nadie sabe si creer.

Dos decisiones que se tomaron de paso, ambas consecuencia de la de Felipe y no
opcionales: (1) `max(límite, 1)` conserva el comportamiento viejo donde nadie
fijó un límite, así que nada de lo que avisaba hoy deja de avisar — y respeta lo
que `MinimosPorSede` le promete a la usuaria, que vacío significa "usa el mínimo
general", no cero; (2) el origen tampoco puede quedar por debajo del suyo:
tapar un hueco abriendo otro no es una sugerencia, es mover el problema de
tienda. Y el orden pasó a ser por lo que le FALTA al destino, no por lo que le
sobra al origen: lo urgente es el hueco, no el excedente.

## 2026-09-09 (b2 ya estaba hecho, y el circuito completo se probó solo)
Al ir a poner `LUCODE_TOKEN` en Vercel, el CLI respondió que la variable ya existía.
`vercel env ls`: `LUCODE_TOKEN` y `LUCODE_ENTORNO=produccion` estaban puestas desde
hacía 19 horas — Felipe las configuró la noche del 08-09 y no quedó anotado. El backlog
seguía diciendo lo contrario, que es el mismo agujero de "nadie sabe qué está aplicado"
que ya nos costó un reset local hoy.

Eso explica de dónde salió B004-000002: del deploy, no de la máquina de Felipe. Y
apareció **B004-000003** (09-09 11:57) con `entorno_transmision='produccion'` ya escrito
— un dato que SOLO puede escribir la RPC de 5 argumentos. Cruzado con las horas de los
deploys (11:50:31 el del push, 12:07:16 un redeploy), queda probado que el circuito
completo funciona en producción: pantalla → Lucode → SUNAT → base, con el código nuevo.

**Mi error del día, para que quede:** dije que el deploy seguía sirviendo código viejo.
Falso. Estaba leyendo una copia de CDN cacheada antes de las 11:50 (`X-Vercel-Cache:
HIT`, `Age: 192`) y usando una clase CSS como marcador, que es un indicador frágil. El
marcador bueno lo declara el propio HTML: `data-dpl-id`, que `vercel inspect` ata al
deployment exacto. Un chequeo indirecto que da negativo no prueba nada; solo prueba que
el chequeo era malo.

**Lo que Felipe aprende acá:** la configuración también es estado del sistema, y también
envejece sin avisar. Dos veces en un día el repo dijo una cosa y la realidad otra — las
migraciones en local, y estas variables. Ninguna de las dos se descubrió por una alerta:
las dos salieron porque alguien fue a mirar. Escribir "ya lo configuré" cuesta diez
segundos y es lo único que evita que la próxima sesión trabaje sobre un mapa viejo.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (la primera anulación real, y el botón que faltaba para cerrarla)
Felipe emitió B004-000003 como prueba a las 11:57:11 y la anuló a las 11:58:49 — ocho
minutos después de que el deploy con el código nuevo entrara en producción. El botón
funcionó a la primera y quedó en "Anulación en trámite", que es lo correcto: el panel de
Lucode muestra ese mismo documento como **ANULANDO**. Nuestro estado resultó ser espejo
del suyo sin que nadie lo hubiera coordinado.

Pero ahí se vio el hueco: nada podía sacarla de "en trámite". El botón "Anular" se
esconde cuando hay una baja pedida —para que nadie la pida dos veces— y la otra mitad no
existía. Un documento real atascado por diseño. Se construyó
`/api/lucode/consultar-anulacion` + botón "Consultar" en las filas en trámite.

**Lo que salvó la consulta en vivo.** Antes de escribir el lector se consultó
`/api/v3/status` contra producción: devuelve `estado: "ANULANDO"`. Lucode tiene un
vocabulario de anulación distinto al de emisión, y `traducirEstado` manda a PENDIENTE
todo lo que no reconoce — o sea que habría leído un `ANULADO` real como "sigue en
trámite" para siempre. El botón nuevo no habría cerrado nada nunca, y el síntoma sería
"consulto y no pasa nada". Por eso `interpretarEstadoAnulacion` es función propia, pura
y con 5 tests. tsc, eslint y 68 tests en verde.

**Lo que Felipe aprende acá:** dos sistemas pueden usar la misma palabra para cosas
distintas y ninguno de los dos avisa. "Estado" en la emisión significa qué dijo SUNAT del
documento; "estado" en la anulación significa qué dijo SUNAT de la baja. Reusar el lector
por parecido de forma es el error clásico — el código habría compilado, pasado todos los
tests y fallado en silencio. La única forma de saberlo era preguntarle al servidor de
verdad, antes de escribir el lector y no después.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (tarde — medir la cosa equivocada tres veces seguidas)
Con la Fase 0 desplegada se fue a comprobar la región y salió `iad1` tres veces. Se
descartó el plan (Hobby permite una región; y resultó que la cuenta es Pro, con cinco),
se descartó el timing de build, y se llegó a acusar a la ubicación de `vercel.json` —
"mi apuesta estuvo mal"— cuando Felipe confirmó que el Root Directory sí era `apps/web`,
o sea que el archivo estaba bien puesto desde el principio.

**El error era el método, no la configuración.** Las tres rutas medidas —`/login`,
`/inventario`, `/api/padron`— las responde el **proxy** o el CDN antes de llegar a
ninguna función de página: estático con `X-Vercel-Cache: PRERENDER`, 307 al login, y 401
JSON respectivamente. Y Vercel despliega el proxy al borde justamente para resolver
redirects rápido. O sea que `X-Vercel-Id: iad1` habría salido igual con la región
perfectamente cambiada. Se verificó que **no existe ninguna ruta que ejecute función de
página sin sesión**: `/auth/*` está exento del guardia pero no tiene handler, y todo lo
demás lo intercepta el proxy.

Lo zanjó una captura del panel: el badge **"Overridden"** en Function Regions es Vercel
avisando que `vercel.json` sobreescribe el ajuste del panel — prueba de que el archivo SÍ
se lee, en `apps/web/`, donde estaba. La región es `gru1`. Bonus del mismo panel: Fluid
Compute está encendido, así que las instancias se reutilizan y el JWKS que `getClaims()`
descarga queda cacheado entre peticiones en vez de re-pedirse por invocación.

**La lección, que es la que vale:** una medición que no puede distinguir entre "funcionó"
y "no funcionó" no es una medición. Las tres rutas daban el mismo número en ambos mundos,
y aun así se sacaron conclusiones de ellas —y se acusó a un archivo inocente— durante tres
rondas. Antes de medir hay que preguntarse qué se vería si el cambio SÍ hubiera funcionado.

**Segunda corrección, más incómoda: el "~2 s" original nunca se midió.** Salió de la
percepción de Felipe más la cuenta de 4 viajes de red, y el "~700 ms después de Fase 0"
era una estimación encima de esa estimación. Lo que sí está medido: 0.86 ms de ejecución
en base, ~95 ms de RTT Perú↔São Paulo, ~400-430 ms de respuesta del borde, y 2 de los 4
viajes eliminados. De ahí sale la recalibración honesta: como `getClaims()` ya quitó dos
viajes, la región puede ahorrar la mitad de lo estimado (~250-350 ms), no lo que se dijo.
Y no mejora el `/login` de 430 ms, que es CDN y no depende de la región de funciones.

**Sigue sin medirse lo único que importa:** el TTFB de una pantalla CON sesión iniciada.
Es el número que todo este trabajo pretende bajar y nadie lo ha tomado nunca.

## 2026-09-09 (por fin la medición real: la región funcionó y el costo no está en los datos)
Con permiso de Felipe se midió desde su propio navegador, con sesión iniciada — lo único
que faltaba y que ninguna medición anterior podía dar.

**La región funcionó.** `x-vercel-id` en una petición que SÍ ejecuta función devuelve
`iad1::gru1::…` — **dos** segmentos: el primero es el borde que recibió, el segundo es
dónde ejecutó. `gru1` = São Paulo. Las mediciones con `curl` daban un solo segmento
porque las respondía el proxy o el CDN sin llegar nunca a la función.

**La pantalla real, con sesión:** navegación completa a `/inventario` con TTFB de **131 ms**
y carga total de **750 ms** (HTML de 9.3 kB, conexión reutilizada). Forzando render dinámico
por RSC: TTFB ~300-400 ms, total ~390-500 ms. O sea: el sistema está entre **300 y 750 ms**,
no en los ~2 s que se venían asumiendo. Ese "~2 s" nunca existió como medición.

**Y el hallazgo que manda:** se midieron cuatro rutas de peso muy distinto y **no hay
correlación entre lo que la pantalla hace y lo que tarda**. `/mas` (47 líneas, casi solo
enlaces, 11 kB) tardó 409 ms; `/comercial`, la más pesada del sistema (24.5 kB, catálogo +
inteligencia + ABC + traslados), tardó 297 ms. La liviana es la más lenta.

Eso significa que lo que queda **no es trabajo de datos: es sobrecosto fijo por petición** —
consistente con los 0.86 ms que tarda la base. Y explica la estructura que queda: la
petición entra por `iad1` (Washington) aunque la función corra en `gru1`, así que cada carga
hace Perú → Washington → São Paulo → Washington → Perú. El desvío del borde no lo
controlamos; la región de la función sí, y ya está donde debe.

**Consecuencia para la Fase 2, y es a favor:** como el costo es por-petición y no por-dato,
cachear datos no ayudaría — lo que ayuda es **no hacer la petición**, que es exactamente lo
que hace local-first. El diagnóstico de ADR-0018 sobrevive a la medición. Lo que cambia es
la magnitud del premio: pasa de "arreglar un sistema roto" a "volver instantáneo un sistema
que ya responde decente". Eso ya no es decisión técnica, es de Felipe.

## 2026-09-09 (la red de seguridad corre por primera vez y encuentra 2 filas)

Felipe pegó `unificacion/25` en producción y corrió la verificación: **2
diferencias**. `retail.stock` y `retail.movimientos` llevaban meses discrepando
en dos filas sin que nadie pudiera enterarse, porque la única herramienta capaz
de detectarlo —`recalcular_stock()`— no podía ni ejecutarse (ADR-0020). Revisado
después: las 10 filas de stock siguen siendo 10 y **todas tienen entre 1 y 5
movimientos detrás**, así que no se borró nada; la función corrigió dos
cantidades hacia el neto de la fuente de verdad. Las filas eran SKUs de prueba
de la unificación (`A`, `B`, `T281d432ae4f`), no catálogo real.

**Lo que Felipe aprendió, y vale más que el arreglo:** una verificación puede
destruir su propia evidencia. La que escribí guardaba el estado previo en un
`create temporary table`, y el SQL Editor de Supabase corre cada ejecución en
una conexión distinta del pool — la tabla murió al terminar la primera consulta.
Resultado: se supo que había 2 diferencias y ya no había con qué mirarlas. Eso
es peor que no tener verificación: cuando todo cuadra da confianza, y cuando NO
cuadra deja ciego justo en el momento que importa. La regla que queda: una
verificación que compara "antes y después" tiene que persistir el "antes" en
una tabla real, y borrarla a mano al final. Corregido en `unificacion/25`.

Segunda lección, del push de hoy: verifiqué tres commits y se subieron cuatro.
Entre el chequeo y el `git push` otra sesión commiteó sobre el mismo `main`
local. La verificación era correcta cuando se hizo y quedó vieja al ejecutar.
En un repo donde varias sesiones commitean a la misma rama, "verifico y después
pusheo" tiene una ventana abierta: hay que fijar el rango y pushear ese SHA
(`git push origin <sha>:main`). El cuarto commit resultó inofensivo —revisado
después, usa `getClaims()` y `mapearRol()`, patrones que ya corrían en
producción— pero eso fue suerte, no proceso.

## 2026-09-09 (robustez: las pantallas que mentían)
Felipe pidió el sistema "lo más robusto posible" y sugirió local-first para agilizarlo. Se
le marcó la tensión antes de tocar nada: **robusto y ágil no son lo mismo, y local-first
los empuja en direcciones opuestas** — agrega una segunda copia de la verdad en cada
navegador, que es exactamente una forma nueva de tener estados imposibles (principio 2).

Como nadie usa el sistema todavía, se auditó la robustez en vez de la velocidad. El
resultado: **20 consultas descartaban el error de Supabase, 1 lo revisaba, y no había una
sola error boundary en toda la app.** El camino de escritura sí estaba bien —la venta
revisa el error del RPC y lo muestra—, el problema era todo el de lectura.

Lo grave no es que una pantalla se caiga: es que NO se caiga. `const { data } = await
supabase...` deja `data` en null al fallar, el código hace `data ?? []`, y la pantalla
dibuja vacío con cara de normalidad. Si fallaba la consulta de `ventas`, el Estado de
Resultados mostraba **S/0 en ventas** y un Líder concluía que no vendió nada.
`getCatalogoConStock` hacía `return []`: CAYLA sin una sola prenda. Una pantalla caída se
nota; una que miente, no.

Felipe eligió el comportamiento "depende de la pantalla", que es el que corresponde:
`exigir()` lanza para plata, stock y catálogo; `tolerar()` deja seguir con aviso para
listados de apoyo. Vive en `lib/resultado.ts` con la regla escrita para elegir entre los
dos. Aplicado a los tres cimientos + dos barreras de error nuevas.

Anotado con honestidad: el `Promise.all` de Finanzas lo había escrito yo esa misma mañana
optimizando velocidad, y mantuve intacta su forma de fallar callada. Y **la barrera no se
pudo probar en vivo**: llegar a ella exige sesión iniciada porque el layout redirige antes
de renderizar. Está en la ruta correcta y el build la registra, pero eso no es lo mismo
que verla atrapar — la misma distinción que hoy costó tres rondas con la región.

## 2026-09-09 (el punto medio: rápido sin abrir la puerta a conflictos)
Felipe pidió las tres cosas juntas — rápido, robusto, y sin que queden cosas en el aire ni
haya conflictos — y preguntó si había un punto medio. Lo hay, y la distinción que lo define
es la que resuelve su preocupación: **local-first guarda una COPIA de los datos (dos
verdades que sincronizar, pueden divergir); el punto medio guarda una RESPUESTA RECIENTE
del servidor (una sola verdad, solo puede ser vieja).** En cinco palabras: datos viejos,
nunca datos distintos. Un dato viejo se corrige con el siguiente refresco y su antigüedad
tiene techo; un dato distinto es un estado imposible, que es lo que prohíbe el principio 2.

Parte ya estaba andando sin que se notara: el `staleTimes: 30` de la Fase 1 hace que volver
a una pantalla vista hace menos de 30 s no vaya al servidor, y cualquier mutación lo
invalida vía `router.refresh()`.

Faltaba la otra mitad, y era un hueco claro: `/inventario` y `/vender` hacían `await` de
TODO antes de devolver JSX. La cabecera, la navegación y los botones —que no dependen de
ninguna consulta— esperaban detrás del catálogo entero. Ahora la página solo espera la
persona (memorizada por el layout, sin viaje nuevo) y el resto baja en su `<Suspense>` con
esqueleto. En `/vender` se partió en dos: el historial del día era una consulta chica que
esperaba al catálogo entero solo por compartir `Promise.all`.

Salió el primer caso real de `tolerar()`, y vale como ejemplo de cómo se aplica la regla:
el historial de `/vender` muestra dinero pero no lo decide —el cuadre lo calcula
`cerrar_caja` en el servidor contra `ventas`, no contra esa lista—, y fallar en duro ahí
significaría dejar a una Encargada sin poder vender, con la clienta enfrente, porque no
cargó un historial. Ese intercambio no se paga. → ADR-0021.

Detalle técnico que casi se me pasa: los anchos del esqueleto son fijos y no aleatorios.
`Math.random()` en un Server Component daría un valor distinto en servidor y cliente, y
React lo marcaría como desajuste de hidratación.

Pendiente y anotado: extenderlo a `/comercial`, `/finanzas/*`, `/produccion` y `/buscar`
—es mecánico—, y **verlo funcionar en vivo**. Compila y pasa 68 pruebas, pero que la
estructura aparezca antes que los datos hay que verlo corriendo con sesión iniciada. Es la
misma distinción entre "compila" y "funciona" que hoy mismo costó tres rondas con la región.

## 2026-09-09 (Inicio, paso 4 — la actividad, y tres choques de sesiones en una hora)

`movimientos` es la fuente de verdad del inventario desde el primer día y
ninguna pantalla la había mostrado nunca en orden cronológico. Ahora el Inicio
cierra con las últimas 8: hora, sede, qué pasó, prenda, cantidad, monto y quién.
Las de hoy muestran solo la hora; las anteriores, el día — leer "18:30" sin
saber de qué día es peor que un texto más largo. Es un bloque de naturaleza
distinta a los otros dos: no pide nada (eso es la bandeja) y no resume nada (eso
son las tarjetas); responde "¿qué está pasando?", que para un Líder en Lima que
no ve el piso de Trujillo hoy solo se responde por teléfono.

Las etiquetas del feed se escribieron aparte de las de `MovimientoModal` a
propósito: las del modal son instructivas ("Otro (especificar en nota)") porque
guían a quien registra, y leídas de corrido en una lista sobran. Son dos
redacciones del mismo dominio para dos usos, no una duplicación — pero van
tipadas contra el mismo enum de `@cayla-retail/shared`, así que un motivo nuevo
no compila hasta traducirse en ambos lados.

**Lo que Felipe aprendió, y no fue del código:** hoy se cruzaron tres sesiones en
el mismo árbol y cada cruce enseñó algo distinto.

(1) **El servidor de desarrollo cambió de base sin que nadie lo tocara.** Su
`NEXT_PUBLIC_SUPABASE_URL` venía exportada en la terminal donde se levantó —y en
Next eso le gana al archivo—; al reiniciarse, pasó a leer `apps/web/.env.local`,
que apuntaba al stack de cayla-dynamic (`:54321`) en vez del de este repo
(`:54421`). Síntoma: "tu cuenta no está vinculada a ningún integrante", con los
datos intactos. Se resolvió mirando en qué puerto responde el bundle servido, no
razonando. El archivo quedó corregido: local ya no depende de una variable
invisible.

(2) **Un error tragado convierte una falla en un dato falso.** Otra sesión hizo
que `getCatalogoConStock` fallara en voz alta (`exigir`), y eso tumbó el Inicio
en local con `Could not find the table 'retail.stock_almacen'`. No era un bug
nuevo: era el agujero que este mismo backlog anotó por la mañana, invisible seis
días porque el error se descartaba y el almacén se veía "vacío" — indistinguible
de "no hay nada guardado". Su cambio es correcto; lo que hizo fue encender la luz.

(3) **Dos sesiones resolvieron el mismo problema a la vez, con el mismo número.**
Esa sesión escribió `0042_almacen_interno.sql` mientras yo escribía
`0043_almacen_interno_local.sql`, y el 0042 ya estaba tomado por
`0042_recalcular_stock_neto.sql`, pusheado horas antes. `npx supabase db reset`
falló con `duplicate key ... schema_migrations_pkey` y local quedó bloqueado para
todos. Se resolvió por asimetría, no por gusto: **lo pusheado no se renumera, lo
no commiteado sí** — renumerar una migración que alguien ya aplicó rompe su
historial. Se borró mi versión (la suya era superior: 385 líneas contra 89, y de
paso arregla que `unificacion/12` partió de un cuerpo anterior a `0011` y perdió
la línea que sella `stock.ultima_venta`) y se renumeraron los suyos a `0044` y
`unificacion/26`, sin tocarles una línea de SQL.

La regla que queda de las tres: en un repo con sesiones paralelas, el número de
migración es un recurso compartido y hay que pedirlo mirando `origin`, no el
directorio local.

## 2026-09-09 (streaming extendido: 8 de 10 pantallas)
Se aplicó el patrón de ADR-0021 al resto: `/buscar`, `/produccion`, `/comercial` y tres de
Finanzas (`efectivo`, `patrimonio`, `activos`), sumadas a `/inventario` y `/vender` que ya
estaban. Ocho pantallas donde la estructura ya no espera a los datos.

`/buscar` fue el caso con más efecto: el título sale de lo que la Encargada acaba de
escribir y esperaba a que cargara el catálogo ENTERO para dibujarse — con la pistola Zebra
eso se siente como si el escaneo no hubiera entrado. Lleva además `key={term}` en el
boundary, deliberado: sin él, cambiar de búsqueda reusa el boundary ya resuelto y se
siguen viendo los resultados VIEJOS mientras llegan los nuevos, sin señal de carga. Y su
consulta de stock pasó a `exigir()`: decir "sin coincidencias" porque falló una consulta
mandaría a alguien al almacén a buscar algo que sí está.

Las tres de Finanzas comparten forma (cabecera + `FinanzasNav` + secciones), así que
salieron con una sola transformación mecánica. **`egresos` y `comparativo` no**: sus
cabeceras sí dependen de datos calculados —navegación de meses, selector de sede— y el
corte automático las rompió. Se intentaron, falló `tsc`, y se revirtieron limpias en vez de
forzarlas. Quedan para tratarse una por una, junto con `/finanzas` y `/finanzas/balances`.

Se limpiaron tres variables que quedaron sin uso tras mover código a los componentes hijos
(`ventanaDias` en comercial, `persona` en efectivo, `supabase` en producción). eslint sin
warnings, tsc, 68 pruebas y `next build` en verde.

Sigue sin verificarse en vivo que el streaming se vea: hace falta sesión iniciada. Es lo
primero al desplegar.

## 2026-09-09 (streaming completo: las 10 pantallas)
Se cerraron las cuatro que faltaban. Todas tenían cabeceras que dependían de valores
calculados, por eso el corte mecánico que sirvió para efectivo/patrimonio/activos las
rompía; se hicieron una por una. En `/finanzas` y `/finanzas/balances` el título y las
flechas de mes esperaban a que se calcularan los CUATRO estados financieros completos solo
para poder decir "Septiembre 2026".

`/finanzas/comparativo` salió mejor que el resto y vale la pena por qué: se partió en TRES
boundaries en vez de dos. El selector de sedes es **navegación**, no dato — hacerlo esperar
significaría no poder cambiar de tienda hasta que cargue la tabla— y solo necesita
`getSedes()`, memorizada, así que quedó instantáneo. El editor de históricos y la
comparación van cada uno por su lado, y el editor usa `tolerar()`: si falla su consulta se
oculta el botón en vez de tumbar la pantalla, porque sembrar históricos es una tarea
ocasional del Líder que no debería impedir mirar el comparativo.

Dos veces el script automático dejó las variables en el lado equivocado del corte (las
constantes de estilo de `balances`, el `eerr` de `finanzas`). `tsc` lo cazó las dos veces;
se revirtieron limpias y se rehicieron a mano en vez de parchear.

`tsc` y `eslint` limpios sobre lo tocado, 68 pruebas en verde. El `next build` completo no
pasa en este momento, pero por trabajo en curso de otra sesión en `app/(app)/page.tsx`
(`getPanelLider` cambió de firma), no por esto — verificado revisando que ningún error
apunte a los archivos de esta tanda.

## 2026-09-09 (Inicio, pasos 5 y 6 — un inicio por rol, y el código de sede como fuente de bugs)

El Inicio tenía dos ramas y hacían falta tres. La persona del Taller caía en la
de la Encargada, que le ofrece Vender, Bajar a tienda y el estado de la caja:
tres cosas que en el Taller no existen. Y encima, por el bug de abajo, en
producción ni siquiera veía el enlace a Producción.

**Lo que Felipe aprendió y no era obvio:** el bug no estaba en el `if`. `AppShell`
y `/mas` preguntaban `sedeCodigo === "TALLER"`, y tras la unificación el Taller se
llama **LIM** en producción — `unificacion/01_sedes.sql:35` lo mapea a
`tipo=fabrica` justamente porque su código no es TALLER. La causa raíz es que el
CÓDIGO de una sede no sirve para decidir nada (cambia entre local y producción) y
cada pantalla lo re-deducía por su cuenta. Tres copias de la misma pregunta, dos
equivocadas. Se arregla exponiendo `sedeTipo` en `PersonaActual`: una sola
respuesta, en el sitio que ya buscaba la sede. `/produccion` llevaba meses
haciéndolo bien y sirvió de modelo — la pista estaba en el propio repo.

La otra decisión de fondo fue no volver a filtrar por sede en TypeScript. RLS ya
acota las filas a la sede de quien mira, así que las tres funciones del panel
sirven a los dos roles sin cambio. Filtrar de nuevo en el código habría sido
mantener dos copias de la misma regla, y esas copias siempre se desincronizan.
Solo se filtra a mano donde RLS no puede saber la intención: la lista de cajas
(`getSedes()` devuelve todas y la Encargada vería dos tiendas ajenas siempre
cerradas) y QUÉ pendientes tienen sentido por rol — a una Encargada no le toca
perseguir una orden de compra ni una corrida del Taller. Verlas sin poder hacer
nada con ellas es la forma más rápida de que deje de mirar el bloque.

El seed suma los otros dos usuarios (`encargada@` y `taller@`). Hasta hoy esos dos
inicios no se podían ver funcionar porque no había con quién entrar — el mismo
agujero que el seed vino a tapar para los datos, ahora para los roles.

## 2026-09-09 (la caja aprende a que la escaneen, y los errores dejan de hablar Postgres)
Se analizó el apartado D del documento *el estándar, los doce y el camino* — la
comparativa no funcional de 16 sistemas— y se rescataron las celdas de 5/5, que son
el estándar que alguien ya alcanzó. Nadie saca 5 en las cinco dimensiones: Square
llega a tres y se cae en soporte y apertura; Loyverse llega a tres y se cae en
belleza y apertura. Contrastado contra el repo, CAYLA ya tiene dos casi regaladas
(belleza ≈5, español =5) y una medida y decente (velocidad, 131 ms TTFB). La más
floja resultó ser **facilidad de aprendizaje** — y es justo donde INVY, marcado en
el propio documento como "nuestro competidor", ya saca 5. Felipe eligió esa.

**El hallazgo que justifica la sesión entera:** el buscador del modal de venta era
un `<input>` dentro de un `<form>` con botón submit y **sin `onKeyDown`**. La pistola
Zebra tipea el SKU y da Enter sola —es lo que ya hace funcionar `/buscar` sin
configurar nada—, así que en la caja ese Enter caía en el envío implícito del
formulario: con el carrito vacío mostraba "El carrito está vacío", y **con el
carrito ya cargado registraba la venta a mitad del escaneo**. El equipo ya había
aprendido el gesto de escanear; la única pantalla donde no servía era la de vender.

**Lo que Felipe aprendió y no era obvio:** que `lib/resultado.ts`, del mismo día,
solo cubría la mitad del problema. Arregló las **lecturas** que fallaban en silencio
y dejó escrita la regla —"sin jerga de Postgres, que no le sirve de nada y la
asusta"— pero del lado de la **escritura** no había equivalente: 29 llamadas en 17
componentes mostraban el texto crudo, incluida la pantalla de más presión del
sistema. Nace `lib/error-escritura.ts` (ADR-0022) como hermano suyo, y lo que lo
define es lo que decide NO tocar: los `raise exception` de las RPC ya están en
castellano de CAYLA y pasan palabra por palabra, porque re-escribirlos dejaría dos
textos que se pueden desincronizar — la misma trampa que ADR-0018 evitó al no
duplicar las reglas de RLS. Traduce solo lo que escribe Postgres por su cuenta, y lo
que no reconoce no se lo traga: cae con el texto original detrás de "Código:".

Verificado: build, lint, `tsc --noEmit` y 77 pruebas (9 nuevas, una por huella).
**Sin verificar en vivo** —y anotado en BACKLOG— el escaneo con la pistola real: el
layout redirige al login y no corresponde que Claude escriba la contraseña.

## 2026-09-09 (medición post-despliegue: el streaming NO mejoró los tiempos)
Se empujaron los 4 commits del streaming (solo hasta `7fe820c`; el commit de la sesión del
Inicio se dejó sin subir porque esa tanda seguía abierta) y se midió en el navegador de
Felipe, con sesión iniciada.

**Lo que sí se confirmó:** la función ejecuta en `gru1` (`x-vercel-id: iad1::gru1::…`), el
streaming funciona de verdad —el HTML trae el marcado del esqueleto y la respuesta llega en
**3 trozos**, no en uno—, y el despliegue nuevo estuvo vivo 40 s después del push.

**Lo que NO se cumplió, y hay que decirlo:** los tiempos no se movieron.

| | Antes | Después |
|---|---|---|
| TTFB `/inventario` | 131 ms | 124 ms |
| Carga total | 750 ms | 730 ms |

Eso está dentro del ruido. **El streaming no produjo una mejora medible de tiempo**, y la
razón es la misma que ya había aparecido midiendo por rutas: entre el primer byte y el HTML
completo solo hay ~100 ms. Casi todo el tiempo está ANTES del primer byte. El streaming solo
puede repartir lo que viene DESPUÉS — y ahí había poco que repartir.

Queda como resultado negativo medido, no como intuición: **el cuello no es cuándo llegan los
datos, es el peaje fijo por petición** (Perú → borde en Washington → función en São Paulo →
y de vuelta). Lo único que atacó eso de verdad fue el cambio de región.

Lo que el cambio sí hace, y no es tiempo: antes la pantalla mostraba un "Cargando…"
centrado mientras esperaba TODO; ahora muestra la cabecera, la navegación, los botones y un
esqueleto con la forma del contenido. Es una mejora de qué se ve durante la espera, no de
cuánto dura. Se mantiene por eso —y porque el `tolerar()` de `/vender` es robustez
independiente de la velocidad—, pero **deja de contarse como ganancia de velocidad**.

## 2026-09-09 (la medición que redirige todo: el cuello es el cliente, no la red)
Se midieron en el navegador de Felipe las dos cosas que faltaban.

**`staleTimes: 30` funciona.** Navegando con clics reales entre `/vender` e `/inventario`:
la primera ida y vuelta hizo 1 petición `?_rsc=` cada una; **la segunda hizo CERO**. La
caché del router sirve la pantalla sin tocar el servidor. Confirmado.

**Y ahí apareció lo que da vuelta el diagnóstico del día: con CERO peticiones de red, la
navegación sigue tardando ~1000 ms.**

| Navegación | Peticiones | Tiempo |
|---|---|---|
| 1ª ida a /vender | 1 | 1447 ms |
| 1ª vuelta a /inventario | 1 | 1004 ms |
| 2ª ida a /vender | **0** | 1010 ms |
| 2ª vuelta a /inventario | **0** | 993 ms |

Con red y sin red tarda lo mismo. Se descartó que fuera la capa de animación midiendo con
`textContent` (existe apenas React monta el nodo) además de `innerText` (solo cuando ya es
visible): ambos dan ~1000 ms, así que no es el CSS, es el montaje.

**Consecuencia:** todo el trabajo del día —región, viajes de red, cascadas, streaming— atacó
el camino del SERVIDOR. Y el tiempo que la Encargada siente al tocar un enlace está dominado
por ~1 s de trabajo del CLIENTE que nada de eso toca. Es el mismo error de forma que ya se
cometió dos veces hoy: optimizar donde se estaba mirando en vez de donde estaba el costo.

Esto también recalibra local-first una vez más: eliminar la petición no bajaría de ~1 s si
el montaje del árbol de React sigue costando eso. **Antes de cualquier otra cosa de
rendimiento hay que perfilar el cliente** — cuánto de ese segundo es hidratación, cuánto son
los 37 componentes marcados `"use client"`, y cuánto el tamaño del árbol.

**La barrera de error sigue sin verificarse.** Se intentó forzarla con
`/producto/esto-no-es-un-uuid`, pero esa ruta maneja el caso y devuelve 404 correctamente
—buen comportamiento, pero no ejercita el boundary—. Forzar un fallo real de consulta en
producción exigiría romper algo a propósito; queda pendiente probarlo en local con sesión.

## 2026-09-09 (CORRECCIÓN: no hay cuello en el cliente — era mi instrumento)
**La entrada anterior está equivocada y se corrige acá.** Se afirmó que la navegación tardaba
~1000 ms incluso sin red y que el cuello se había mudado al cliente. Falso, y el error fue de
medición otra vez.

El detector usaba `setInterval(…, 8)` para vigilar cuándo cambiaba la pantalla. **Chrome
estrangula los temporizadores a uno por segundo en pestañas de segundo plano** —y la pestaña
lo estaba, porque se conducía por automatización—, así que el detector solo podía comprobar
una vez por segundo. De ahí el "~1000 ms" clavado en las cuatro mediciones: era el período de
mi propio reloj, no la duración de la navegación. La pista que lo delató estaba en los datos y
casi se pasa por alto: `latidos_registrados: 0` — un intervalo de 16 ms que no se ejecutó ni
una vez en un segundo es imposible salvo que esté estrangulado.

Repetido con `MutationObserver`, que corre en microtareas y es inmune a ese
estrangulamiento:

| Navegación | Peticiones | Tiempo real |
|---|---|---|
| 1ª a /vender | 1 | 1634 ms |
| 1ª a /inventario | 0 | 441 ms |
| 2ª ida y vuelta | 0 | **7 ms y 7 ms** |
| 3ª ida y vuelta | 0 | **6 ms y 6 ms** |

**Una pantalla ya visitada se abre en 6-7 ms.** `staleTimes: 30` no solo funciona: es, con
diferencia, el cambio más efectivo de todo el día — y estuvo a punto de darse por inútil por
un error de medición propio.

Recalibra local-first una vez más, y ahora hacia abajo: para navegación repetida la caché del
router ya entrega 6 ms, así que local-first no compraría velocidad ahí. Lo que sí añadiría es
sobrevivir más allá de los 30 s y funcionar sin internet. Ese es todo su valor restante, y
hay que decidirlo con eso en la mano.

**Tercer error de medición del día, de la misma familia:** medir el instrumento en vez de la
cosa (el proxy en vez de la región; el tiempo posterior al primer byte sin comprobar cuánto
había; ahora el período del temporizador). La defensa que funcionó las tres veces fue la
misma: desconfiar de un número sospechosamente redondo o idéntico y buscar con qué se vería
distinto si la hipótesis fuera falsa.

## 2026-09-09 (organización del inventario, bloques 0 y 1 — contar hacia abajo ya se puede)

Arranca el proyecto de organizar el inventario y traer los 300-900 SKUs reales de una vez.
Felipe decidió: censo big-bang, **solo el piso** de las 3 tiendas, **costo por modelo** (no
por talla/color), **código corto nuevo** (`BLU-0042-AZM-M`), y las Encargadas cuentan mientras
él aprueba antes de que entre nada. Dato que cambia el diseño: **casi todas las prendas ya
traen código de barras de fábrica** — el censo puede escanear desde el minuto uno en vez de
imprimir y pegar 900 etiquetas primero.

**Bloque 0 (`0044_almacen_interno.sql` + `unificacion/26_…`):** `stock_almacen`, el contenedor
`tipo='almacen'`, `bajar_a_piso` y `devolver_a_almacen` solo existían en producción desde el
3-sep; ahora están en el riel numerado y `npx supabase db reset` deja una base local igual a
la de producción. Y en el camino apareció la deriva inversa: al reescribir
`fn_aplicar_movimiento` para el almacén, `unificacion/12` partió de un cuerpo anterior a
`0011` y **perdió el `ultima_venta`**. En producción esa columna existe y nadie la escribe, así
que "Días sin venta" viene midiendo la edad de la variante desde que se creó — todo el catálogo
aparece estancado para siempre. `unificacion/26` la restaura y hace backfill desde `movimientos`.

**Bloque 1 (`0045_ajuste_con_signo.sql` + `unificacion/27_…`, ADR-0023):** era **imposible
registrar un conteo menor a lo que dice el sistema**. No por `min={1}` en la pantalla, que era
el síntoma: la rama `ajuste` proponía la fila con el delta y el CHECK se evalúa sobre la fila
propuesta. El mismo bug de ADR-0020, a cincuenta líneas de la función que ese ADR daba por
segura. Peor: producción **nunca tuvo** `stock_cantidad_no_negativa`, así que allá no habría
explotado — habría creado stock negativo en silencio. Se arregla con
asegurar→bloquear→verificar→sumar y se ponen las tres redes que faltaban.

**Lo que aprendió Felipe:** que escribir la regla en un ADR no basta — ADR-0020 dejó anotado el
patrón peligroso y aun así la tercera ocurrencia estaba dentro de la misma función que ese ADR
declaraba a salvo; hay que ir a buscar todas las apariciones el mismo día. Y que un error que
avisa vale más que uno que no: el mismo defecto era ruidoso en local y silencioso en producción,
y el silencioso es el caro.

**Choque de sesiones paralelas, otra vez** (como el 5-sep). Mientras se escribía esto, otra
sesión comiteaba `0042_recalcular_stock_neto.sql` y ADR-0019 a 0022 sobre los mismos archivos.
Se resolvió de forma aditiva —mis migraciones se renumeraron a `0044`/`0045` y `recalcular_stock`
quedó con la versión de ADR-0020 *extendida* para conocer el almacén, no reemplazada— pero
conviene no tener dos sesiones en el mismo módulo a la vez.

## 2026-09-09 (segunda mitad del aprendizaje: los callejones sin salida)
Cerrada la dimensión que faltaba del apartado D. Ocho estados vacíos decían que no
había nada y ahí terminaban; ahora cada uno nombra dónde se resuelve. La regla que
se siguió al escribirlos vale más que los textos: **se verificó componente por
componente dónde vive de verdad cada acción antes de nombrarla**. Ahí apareció que
`/finanzas/activos` solo LEE `activos_fijos` — ninguna pantalla de la app los crea,
entran a mano por SQL. El estado vacío lo dice tal cual en vez de sugerir un botón
que no existe, y el hueco quedó en BACKLOG. Un estado vacío que apunta a un lugar
equivocado es peor que uno que no apunta a ninguno.

Uno no se tocó a propósito: `/finanzas/registrar` ya decía "Corre la migración 0020
en Supabase". Suena a jerga, pero el lector real de esa pantalla es el Líder, o sea
Felipe. Lo que ya está bien dicho para quien lo lee no se reescribe.

Cinco botones (!) nuevos en Inventario, Recibir mercadería y Buscar. Los 38 que ya
existían estaban TODOS en pantallas del Líder —Balances 13, Comercial 3, Producto
5—: la ayuda del sistema estaba escrita para quien lo mandó a construir, no para
quien lo usa ocho horas al día.

**Lo que Felipe aprendió y no era obvio:** al intentar verificar en su Chrome, el
sistema rebotó con `sin_persona` — la cuenta tiene usuario en Auth local pero no
fila en `personas`. No es un bug del código: es que `supabase/seed.sql` solo siembra
`felipe@cayla.local`, y cualquier otro correo entra a Auth sin quedar ligado a un
integrante. El mensaje del login ya lo explicaba bien ("Pide a un Líder que te dé de
alta"), que es exactamente el trabajo que esta sesión vino a hacer en el resto de la
app: el error correcto se ve como una instrucción, no como una falla.

## 2026-09-09 (el traductor llega a los 17 componentes, y destapa dos mudos)
`traducirError` quedó aplicado en los 31 sitios de escritura del repo. El grep de
`error.message` fuera de `lib/error-escritura.ts` ya no devuelve nada. Cada sitio
nombra su acción en idioma de negocio —"registrar el depósito", "cerrar la orden al
inventario", "convertir la proforma en comprobante"— y eso obligó a leer qué hacía
cada función antes de nombrarla, que es la parte que un reemplazo mecánico se salta.
En `OrdenesProduccion` el envoltorio `llamar()` recibe ahora el nombre de la acción:
un mensaje genérico en las tres RPC de la orden no habría orientado a nadie.

**El hallazgo:** dos escrituras no mostraban el error, se lo tragaban enteras.
`ComprasManager.cancelar` y `RecetaCosto.quitarItem`, las dos con el mismo
`if (!error) router.refresh()`. Se tocaba "Cancelar" o "Quitar", no pasaba nada, y no
había manera de saber por qué. Es exactamente la falla que `lib/resultado.ts` arregló
en las lecturas el mismo día —la pantalla que miente en vez de caerse— viva del otro
lado y sin que la auditoría de robustez la viera, porque esa auditoría buscaba
`select` descartando su error, no `insert`.

**Lo que Felipe aprendió y no era obvio:** el heurístico de "insertar el import
después del último `import`" partió dos archivos por la mitad. `RegistrarGastoModal` y
`RegistroContableForm` tienen imports multilínea, y la línea nueva cayó DENTRO de la
llave abierta. Lo atrapó `tsc` en el acto con siete errores de sintaxis por archivo,
no una revisión visual. La lección no es "no automatizar": es que un cambio mecánico
sobre 17 archivos necesita una verificación mecánica detrás, y acá el compilador es
esa red — build, lint, tsc y 77 pruebas antes de commitear, siempre en ese orden.


## 2026-09-09 (verificada la robustez, y con un fallo real en vez de un simulacro)
Se montó un entorno aparte para probar las barreras sin tocar el trabajo de otras sesiones:
worktree propio (porque Next no permite dos `dev` en el mismo directorio y había uno
corriendo), `pnpm install` ahí, y el servidor levantado con las variables del Supabase LOCAL
pasadas en línea — sin crear ningún `.env`, para no cambiarle el entorno a nadie si reinicia.
Dos intentos fallaron antes: `--dir` no existe en `next dev`, y Turbopack rechaza un
`node_modules` enlazado por junction ("points out of the filesystem root").

**Y entonces apareció algo mejor que la prueba planeada: un fallo de verdad.** El overlay de
Next mostró exactamente esto:

```
No se pudo leer las sedes: JWT issued in the future
  exigir        lib/resultado.ts (42:11)
  <anonymous>   lib/sedes.ts (32:22)
  <anonymous>   lib/persona.ts (54:26)
```

`exigir()` atrapó un fallo genuino —desfase de reloj entre el contenedor de Supabase local y
la máquina— y lanzó con el contexto en idioma de negocio ("las sedes"), no con jerga de
Postgres. **Antes de este cambio, `getSedes()` habría devuelto `[]` en silencio** y la app se
habría dibujado sin ninguna sede, sin un solo aviso: exactamente la falla silenciosa que se
auditó esta mañana, reproducida sola.

Y debajo del overlay, la pantalla real:

```
CAYLA
El sistema no pudo arrancar
Esto no es un problema de tu computadora. Reintenta; si sigue igual, avisa a Felipe.
REINTENTAR      Código: 1080313944
```

`global-error.tsx` verificado en vivo, con su botón y su código para los logs.

**Lo que sigue sin ejercitarse:** `(app)/error.tsx`, la barrera de sección. El fallo ocurrió
en el layout, así que sube a la global sin pasar por ella — que es el comportamiento correcto,
pero deja esa otra sin probar. La maquinaria de boundaries queda demostrada por la global.

**Hallazgo de entorno para Felipe, no del código:** el Supabase local tiene el reloj adelantado
respecto a la máquina, y eso rompe el login local con "JWT issued in the future". Cualquiera
que intente levantar el entorno local se va a topar con esto hasta reiniciar el contenedor.

Todo lo montado quedó desmontado: servidor detenido, worktree eliminado, página de prueba
borrada, `git status` limpio de rastros propios.

## 2026-09-09 (organización del inventario, bloques 2 y 3 — el color deja de ser texto libre y la prenda tiene varios códigos)

**Bloque 2 (`0046_colores.sql` + `unificacion/28`, ADR-0024).** `variantes.color` era texto
libre sin restricción. Con cuatro Encargadas capturando 900 prendas en paralelo iban a nacer
"Azul marino", "azul marino", "AZUL MARINO" y "marino" — cuatro colores para la base, uno para
la clienta. Lo que decide hacerlo AHORA es lo que cuesta después: unificar dos colores no es un
`update` de texto, es **fusionar variantes** con stock e historial, o sea escribir movimientos
para arreglar una falta de ortografía. 29 colores aprobados por Felipe, con un índice único
sobre el nombre normalizado que hace imposible el duplicado ortográfico — lo rechaza la base,
no un `if` en el cliente. **No se hizo tabla de tallas**, y la asimetría es el argumento:
agregar tallas tarde es barato (no es FK de nada), agregar colores tarde es caro.

**Bloque 3 (`0047_codigos.sql` + `unificacion/29`, ADR-0025).** El código corto `BLU-0042-AZM-M`
al lado del SKU, que no se toca. El argumento que cierra la discusión no es estético: **la
etiqueta no entra**. `EtiquetasGenerator` estira el Code 128 al ancho de la etiqueta sin
importar cuántos módulos tenga, así que un SKU de 40 caracteres da 1.2 puntos por módulo a 300
dpi cuando la regla térmica es ≥3. Ésa es la razón real de que la pistola a veces no lea. El
código corto da 3.1. Más `variantes_identidad_unica`, que es lo que impide que cuatro personas
creen la misma prenda cuatro veces el primer día del censo.

**La pieza que más cambia el proyecto: `codigos_barras`.** Como casi todas las prendas ya traen
código de fábrica, una tabla donde una prenda puede tener VARIOS códigos convierte el censo de
"imprimir y pegar 900 etiquetas antes de escanear nada" a "escanear lo que ya está en la
percha". Y de yapa el backfill registra el `sku` viejo, así que toda etiqueta ya impresa sigue
funcionando el día que cambiemos de nomenclatura. Verificado: tres códigos distintos
(`BLU-0001-AZM-M`, el sku viejo, y un EAN `7501234567890`) resuelven a la misma prenda.

**Lo que aprendió Felipe:** que un backfill es la mitad fácil del problema. La primera versión
registraba los códigos con un `insert … select` al final — cubría el pasado y nada mantenía el
futuro: una variante creada al día siguiente quedaba con código pero sin ser escaneable. Lo
encontró una prueba, no una revisión. Se movió el registro dentro de la única función que acuña
códigos, y así el invariante se sostiene solo. Misma lección que ADR-0023, dos veces en el
mismo día: escribir la regla no alcanza, hay que ponerla donde no se pueda saltear.

**Nota de sesiones paralelas:** esta vez salió bien. La otra sesión construyó **sobre** el
bloque 1 (`ce51374`: tradujo al castellano las dos redes que trajo `0045`) en vez de chocar.

## 2026-09-09 (cierre: las tres pruebas pendientes, todas en verde)
Con el Supabase local reiniciado por Felipe, se probaron las tres cosas que quedaban. Entorno
montado otra vez en un worktree aparte (Next no permite dos `dev` en el mismo directorio) con
las variables pasadas en línea, sin crear ningún `.env`.

**Tropiezo del que vale aprender:** el primer intento seguía fallando, ahora con "Invalid
schema: retail". La causa era mía: estaba apuntando al puerto **54321**, el default de
Supabase, cuando `supabase/config.toml` de este repo define la API en **54421**. Es decir,
estuve hablando todo el rato con OTRA instancia local de Supabase que también corre en esta
máquina. El síntoma —"el schema retail no existe"— parecía un problema del repo y era un
puerto equivocado. Mismo patrón del día: el instrumento apuntando al lugar equivocado.

Con el puerto correcto, entrando como Líder (la sesión de `localhost` se comparte entre
puertos, así que se heredó la de Felipe):

1. **`(app)/error.tsx` — la barrera de sección.** Página de prueba que lanza desde `exigir()`:
   sale "NO SE PUDO CARGAR / Esta pantalla no está mostrando datos", con Reintentar, Volver al
   inicio y el código para logs. Y el detalle que confirma que es la de SECCIÓN y no la
   global: el contenido salió dentro de `<main>` **con la navegación intacta** — solo se
   reemplazó la pantalla, no la app entera.

2. **`tolerar()` — la franja de aviso.** Rompiendo a propósito la consulta del historial de
   `/vender` (columna inexistente, solo en el worktree): la caja **sigue operativa** —"Abre la
   caja de AQP", con su botón— y debajo la franja: "No se pudo cargar las ventas de hoy. Lo
   demás de esta pantalla sí está al día. Puedes seguir vendiendo con normalidad." Es
   exactamente el intercambio que Felipe eligió: nunca dejar a una Encargada sin vender por un
   historial.

3. **El arreglo de `actions/sede.ts`.** El selector cambió de AQP a TRU y la pantalla lo
   siguió ("VENDER · TRU", "Abre la caja de TRU"). Antes del arreglo esto no hacía nada en
   local, en silencio, porque la acción comparaba contra `'admin'` y en local el rol es
   `'lider'`.

Con esto queda verificado en vivo TODO lo construido hoy salvo lo ya medido en producción.
Entorno desmontado: servidor detenido, worktree eliminado, repo principal sin rastros.

## 2026-09-09 (por fin sabemos qué corrió, y lo primero que dijo fue malo)
Nace `scripts/migraciones/` — una consulta que se pega en el SQL Editor y devuelve el
inventario de objetos vivos, y un verificador que lo compara contra lo que promete
cada uno de los 75 archivos SQL del repo. Responde el ítem que el BACKLOG llamaba "la
deuda que produce todas las anteriores". Sin dependencias nuevas y sin credenciales
nuevas: usa el camino de pegar-en-el-editor que el repo ya usa para producción, y en
local habla con el contenedor del `supabase start`.

Lo que define su diseño no es lo que detecta sino lo que se le prohíbe afirmar: la
AUSENCIA es certeza, la PRESENCIA solo dice que existe algo con ese nombre —
`create or replace` se repite entre archivos, así que encontrar `fn_aplicar_movimiento`
no dice cuál de sus cinco versiones está viva. Y lo que no supo leer lo declara: cuatro
archivos salen como "sin promesas detectables", no como aprobados.

**El hallazgo de la primera corrida, y es serio:** cuatro funciones tienen dos o tres
firmas vivas al mismo tiempo. `registrar_movimiento` con 10 y 12 argumentos,
`recibir_lote` con 6, 7 y 8, `registrar_produccion` con 11, 13 y 15,
`crear_producto_con_variantes` con 7 y 8. Probado con `explain`, que no ejecuta nada:
una llamada que solo nombra los parámetros comunes devuelve `function is not unique`.
En la base local eso significa que **una devolución al almacén funciona y un ajuste,
una merma o un traslado normal no** — `MovimientoModal` solo manda `p_contenedor_id`
cuando es devolución, y `supabase-js` borra del JSON las claves `undefined`.

**Lo que Felipe aprendió y no era obvio:** `create or replace function` con un
argumento NUEVO no reemplaza nada — crea una segunda función y deja viva la vieja. Eso
ya estaba documentado en ADR-0009, pero como anécdota de una migración; resultó ser un
patrón repetido cuatro veces. Y explica dos cosas que este BACKLOG venía atribuyendo a
otra causa: que `recibir_lote` no aparezca en los tipos generados, y que
`RecibirLoteForm` "siempre falla cuando se usa". Desde hoy, toda migración que cambie
la firma de una función lleva su `drop function` de la vieja con los tipos explícitos
(ADR-0026). El arreglo en producción NO se hizo: es DDL en el proyecto compartido con
Dynamic, o sea parar-y-confirmar.

## 2026-09-09 (el arreglo de las firmas duplicadas, con candado)
Escrita `0049_una_sola_firma_por_funcion.sql` y su gemelo `unificacion/31`. Se queda
siempre la firma más nueva, que se verificó una por una contra lo que la app manda de
verdad: `registrar_movimiento` de 12 porque `MovimientoModal` manda `p_contenedor_id`,
`recibir_lote` de 8 por `p_orden_produccion_id`, `registrar_produccion` de 15 por
`p_costo_maquila` y `p_fecha_entrega`, `crear_producto_con_variantes` de 8 por
`p_proveedor_id`. Aplicado en local: las cinco formas de llamada resuelven y el
verificador ya no reporta sobrecargas.

**Lo que Felipe aprendió y no era obvio:** un script que borra cosas necesita un
candado que le impida borrar la ÚLTIMA. Antes de eliminar cada firma vieja se comprueba
que la nueva existe; si no está —producción recibió las migraciones pegadas a mano, no
con `db reset`, así que puede tener otra combinación— no borra nada y avisa. Sin ese
candado, correrlo contra una base con solo la firma vieja habría dejado la función sin
ninguna implementación: pasar de "dos y no se sabe cuál" a "ninguna" no es limpiar, es
romper. Y sin `cascade`, a propósito: si algo depende de una firma vieja, que falle y se
vea, no que se lleve el dependiente por delante.

Segundo detalle de oficio: el gemelo termina con un `select` que muestra una tabla de
estado, no con `raise notice`. El SQL Editor de Supabase no siempre enseña los notices,
y un script destructivo que corre sin decir qué hizo es un script que nadie va a querer
correr dos veces. Probado corriéndolo dos veces: la segunda no cambia nada.

Producción no se tocó: es DDL en el proyecto compartido con Dynamic.


## 2026-09-09 (organización del inventario, bloque 4 — el censo es el primer conteo)

`0048_conteos.sql` + `unificacion/30` + ADR-0027. Dos tablas (`conteos`, `conteo_lineas`) y
siete RPC. **La idea que sostiene todo:** un conteo que puede crear prendas al vuelo es un
censo, y un censo sobre un catálogo ya cargado es un conteo — son la misma operación. Por eso
no hay código de "carga inicial" que se use una vez y se abandone.

**El permiso que hace posible el censo, verificado con una Encargada real de AQP.** Abre el
conteo, crea "Blusa Reflixme M Azul marino" al vuelo adoptando su código de fábrica
`7501111111111`, y cuenta 4. Intenta cerrar: *"Solo un líder puede cerrar un conteo — es la
aprobación de lo contado"*. **El stock se quedó en 0 hasta que Felipe cerró.** Eso es
exactamente lo que Felipe pidió: las Encargadas cuentan, él aprueba, y recién ahí entra.
Comparación en la misma prueba: la puerta vieja (`crear_producto_con_variantes`) sí la rechaza.

**La decisión más fina, y la que más fácil se hacía mal: `cantidad_sistema` se congela al
contar, no al cerrar.** Sistema 10 → a las 15:00 cuenta 8 → a las 15:30 se vende 1 → cierra a
las 16:00. Con el sistema congelado: 8−10 = −2 sobre 9 = **7**, correcto. Leyendo el sistema al
cerrar: 8−9 = −1 sobre 9 = 8, y **la venta desaparece**. Un conteo afirma un instante, no el
presente. Probado reproduciendo el escenario entero.

Y `ajuste` con signo en vez de un `tipo='conteo'` nuevo, por una razón que vale anotar:
`recalcular_stock` conoce cuatro tipos y nada más, así que un tipo nuevo quedaría excluido EN
SILENCIO — el día que alguien corriera la red de seguridad para arreglar otra cosa, el censo
entero se borraría. Bug latente que estalla meses después.

**Lo que aprendió Felipe:** que una prueba que falla no prueba que el código esté mal. La
primera corrida dijo "FALLA — la venta se perdió"; el código estaba bien y la **aserción**
estaba mal (conté 3 sobre 10 y esperaba el resultado de contar 8 sobre 10). Averiguar cuál de
los dos miente es parte del trabajo, no un trámite — y en este caso la respuesta correcta era
volver a correr el escenario exacto del diseño, no cambiar el código para que la prueba pasara.

**Confirmación de un hallazgo ajeno:** una prueba lateral chocó con
`crear_producto_con_variantes(unknown, unknown, jsonb) is not unique` — las dos sobrecargas que
la otra sesión ya documentó en ADR-0026 y dejó pendientes de decisión de Felipe. No es nuevo;
es una segunda confirmación de que ese arreglo hace falta.

## 2026-09-09 (cerrada la auditoría de lecturas silenciosas: de 20 a 1)
Se completaron las ~15 que faltaban. El repo pasó de **20 consultas que descartaban el error
de Supabase a 1**, y esa única es deliberada y está documentada en su propio archivo.

Apareció un tercer comportamiento que no estaba previsto y resultó el más importante:
**`exigirOpcional()`**, para las consultas `.maybeSingle()` donde "no hay fila" es una
respuesta legítima. El caso que lo motivó es el mejor ejemplo de todo el trabajo:
`getCajaAbierta` devolvía `null` **tanto si no había caja abierta como si la consulta
fallaba**. La pantalla decía "caja cerrada" en ambos casos — invitando a abrir una segunda
caja sobre una que sí estaba abierta. Ese es exactamente el estado imposible que prohíbe el
principio 2, y estaba escondido dentro de un `const { data }`. Lo mismo con el contenedor de
almacén: "tu sede no tiene almacén configurado" cuando lo que pasó fue que se cayó la red.

En las rutas de API el arreglo es distinto, porque ahí lanzar no sirve: tienen que devolver
el estado correcto. Las tres de Lucode reportaban un fallo de consulta como **"Comprobante no
encontrado" (404)** — en facturación eso hace que alguien re-emita una boleta que sí existe.
Ahora 503 dice "reintenta" y 404 dice "no está", que son cosas distintas. El export y el
padrón acusaban al usuario con "Sin persona vinculada" (403) por un fallo del servidor.

Y la Server Action del selector de sede: si su consulta se caía, el Líder tocaba el selector
y no pasaba nada — indistinguible de "no tienes permiso". Ahora revienta y se ve.

79 pruebas (subieron de 68 con trabajo de otras sesiones), eslint sin un solo warning, `tsc`
y `next build` en verde.

## 2026-09-09 (producción estaba limpia, y eso enseñó más que el bug)
Felipe corrió la comprobación en el SQL Editor de Dynamic: **cero funciones con más de
una firma en `retail`**. La inferencia que yo había escrito horas antes —que las
sobrecargas explicaban que `recibir_lote` no esté en los tipos generados y que
`RecibirLoteForm` "siempre falla cuando se usa"— era falsa para producción. Corregido en
ADR-0026 y en el BACKLOG: allá esos dos síntomas siguen sin causa conocida, y el arreglo
`0049` valió solo para local, donde el problema sí era real.

**Lo que Felipe aprendió y no era obvio, y vale más que el bug:** las dos bases se
construyen por caminos distintos. Local replica el historial COMPLETO —`0002_functions`
crea `registrar_movimiento` con 10 argumentos, `0008_almacen` la redefine con 12, y como
`create or replace` con firma nueva no reemplaza, la de 10 sobrevive a cada `db reset`—.
Producción nunca vio esa secuencia: `unificacion/07_funciones_operacion.sql:55` la define
UNA sola vez, ya con las 12. O sea que **la base local no es una réplica fiel de
producción**, y la diferencia no está en los datos sino en la forma del schema. Un bug
encontrado en local puede no existir allá (acaba de pasar) y uno de producción puede no
reproducirse acá. Es el costo real, con un caso concreto detrás, de la deuda de
migraciones duales que el BACKLOG ya tenía anotada.

Y una lección de método: la afirmación "esto explica aquello" es una hipótesis hasta que
alguien la mide. Estaba escrita en un ADR con tono de hecho. Medir costó diez segundos.


## 2026-09-09 (verificación post-despliegue de la robustez: 18 pantallas, ninguna rota)
Felipe empujó los 10 commits pendientes. Verificado en producción con sesión iniciada: se
recorrieron **las 18 pantallas de la app** buscando el texto de las barreras de error
("Esta pantalla no está mostrando datos" / "El sistema no pudo arrancar").

Resultado: **18 de 18 en HTTP 200, ninguna rota.**

Ese era el riesgo real del cambio y por eso se comprobó: `exigir()` convierte fallos que
antes eran invisibles en pantallas que se caen. Si alguna consulta llevaba meses fallando en
silencio, hoy se habría visto. Ninguna lo estaba — o sea que el sistema funcionaba de verdad,
no por accidente, y ahora además avisa cuando deje de hacerlo.

Rutas públicas sanas también: `/login` 200, `/inventario` 307 al login, `/api/padron` 401 con
su JSON. La región sigue en `gru1`.

## 2026-09-09 (de 52 a 1: el barrido completo de las lecturas silenciosas)
Cerradas las 52 lecturas que descartaban el error de Supabase, en 16 archivos. Queda
una: la memoria de conveniencia del padrón, deliberada y explicada en su propio
código. El criterio fue el que ya estaba escrito —¿alguien puede tomar una decisión de
negocio mirando ese dato?— y resultó que casi todo el barrido caía del lado del sí:
`finanzas-nucleo.ts` (13) mueve EERR, cuadre, comparativo y patrimonio;
`contabilidad.ts` (8), los cuatro estados financieros.

**Dos casos no se resolvieron con `exigir` y son los que enseñan.** La bandeja de
pendientes del Inicio **se esconde** cuando no hay nada que hacer, así que una consulta
caída se vería exactamente igual que un día tranquilo: el silencio es su estado normal
y por eso ahí miente mejor que en ninguna otra parte del sistema. `exigir` habría
tumbado el Inicio entero por un bloque secundario. La salida fue meter el fallo A LA
BANDEJA como un pendiente más — no poder leer tu cola de trabajo es, literalmente, algo
que atender— y no hubo que tocar la pantalla. El otro es la ficha de producto, donde
tres consultas solo corren para el Líder: ahí va `exigirOpcional`, porque el null es a
propósito y lo que no puede pasar callado es el error.

**Lo que Felipe aprendió y no era obvio:** el peor de todos no mostraba un cero, mostraba
una frase falsa. `inventario/recibir` derivaba «¿esta sede tiene almacén?» de una consulta
sin revisar; si fallaba, la pantalla decía «tu sede no tiene un almacén configurado» y
mandaba a configurar lo que ya estaba, con el fardo abierto en el mostrador. Un error se
entiende y se reintenta; una respuesta falsa manda a alguien a hacer trabajo inventado. Esa
es la diferencia entre una pantalla caída y una pantalla que miente, y por qué el principio
9 llama a esto no degradarse con gracia.

Nota de método: el barrido se hizo con un script que cuenta destructuraciones `{ data: x }`
sin `error` y separa los falsos positivos verificados uno por uno —los `auth.getClaims()`,
que degradan a "sin sesión", y el `getPublicUrl`, que arma una URL en memoria—. Medir
antes y después con la misma regla es lo que permite decir "de 52 a 1" en vez de "quedó
mejor".


## 2026-09-09 (cacheComponents: archivado tras intentarlo, no aplazado otra vez)
Felipe paró sus otras sesiones para dejar el árbol quieto y se intentó de verdad: flag
activado, codemod oficial (`cache-components-instant-false`, 27 rutas, 0 errores) y build.

Varias preocupaciones de la mañana se cayeron al medirlas: **0** configs de segmento que
migrar, **0** `unstable_cache`, y **13 pantallas ya tenían `<Suspense>`** del trabajo del
mismo día. Se llegó mucho más lejos que en el intento anterior.

Y apareció un arreglo legítimo por el camino: `/almacen` y `/almacen/recibir` eran páginas
de React que solo llamaban a `redirect()` — pantallas que no dibujan nada. Con Cache
Components eso rompe el prerender, porque Next intenta prerenderizarlas, choca con la
lectura de cookies del layout y no hay shell que producir. Un alias de ruta pertenece a la
config. Se revirtió con el resto pero **queda anotado como arreglo válido por su cuenta**.

**El impedimento real resultó ser de producto, no de código.** El build siguió fallando en
pantallas que SÍ tenían `<Suspense>`, y la causa está en `AppShell.tsx:328`: `esLider` decide
qué enlaces se dibujan. La navegación depende del rol — Comercial y Finanzas solo para el
Líder, el Taller ve lo suyo. Un armazón prerenderizado no puede contener un menú que cambia
según quién mira, así que el layout lee cookies y bloquea la ruta entera por más `<Suspense>`
que se le agregue a cada página. El trabajo por página no compra nada mientras eso siga así.

Se archiva, no se aplaza (ADR-0028). Las tres salidas cuestan más de lo que dan: mostrar
todo a todos es regresión de UX para la Encargada; transmitir el menú deja el armazón en el
logo; rediseñar el riel del lateral —hecho ese mismo día— por una ganancia sin medir. Y el
contexto lo cierra: el streaming ya dio CERO en tiempo, la caché del router entrega 6-7 ms
en pantalla repetida, y el armazón llega en 124 ms.

Queda escrito el intento y no solo la conclusión, para que quien lea "PPR haría esto más
rápido" encuentre dónde exactamente se detuvo y con qué números se decidió.

## 2026-09-09 (los dos Supabase locales: el arreglo no era apagar uno)
Felipe pidió arreglar que corrieran dos instancias locales a la vez (54321 y 54421). La
verificación dio vuelta el pedido: los dos son legítimos y los dos se quedan — son dos
repos distintos, `cayla-retail` (54421/54422) y `cayla-dynamic` (54321/54322, en
`~/cayla-dynamic`). Apagar el de Dynamic habría roto el otro proyecto para arreglar un
problema que no era ese. Hoy además ya no leen distinto: `apps/web/.env.local` dice
`:54421` y el bundle servido por el `:3000` vivo lo confirma.

**Lo que sí estaba mal, y es más chico y más feo.** Seguía en la raíz el `.env.local` del
`vercel env pull` del 08-09, con `NEXT_PUBLIC_SUPABASE_URL="[SENSITIVE]"` literal. Nada
lo lee —no hay `dotenv`, ni `globalDotEnv` en `turbo.json`, ni OIDC; Next lee el de
`apps/web`—, o sea que su único efecto posible era ser una pista falsa al alcance de la
mano, y ya había cobrado media hora. Archivado fuera del repo; se regenera con
`vercel env pull` el día que haga falta.

**El dato que faltaba en los cuatro diagnósticos anteriores:** la base local de Dynamic
TAMBIÉN tiene schema `retail`. 28 tablas contra las 36 de acá; le faltan `comprobantes`,
`conteos`, `colores`, `stock_almacen`, `proformas`, `series_comprobantes`,
`codigos_barras` y `codigos_correlativos` — todo lo construido después de la unificación.
Por eso el puerto equivocado no explota: catálogo, stock y ventas responden normal y
fallan Facturación y Conteo. Un fallo parcial se lee como bug del repo, y ahí está la
hora. Contra eso se construyó `pnpm local:donde` (`scripts/local/donde-estoy.mjs`): dice
qué stacks corren, cuál declara `config.toml`, cuál leerá la app —incluida la variable
exportada que le gana al archivo— y qué puerto trae de verdad el bundle del `:3000`.
Probado en verde y forzando el puerto malo. Y la tabla de puertos abre el README.

**Lo que Felipe aprende acá:** el mismo error costó una hora cuatro veces, y las cuatro se
resolvió mirando, no razonando — pero nadie dejó el mirar hecho. Documentar el tropiezo en
la bitácora conserva la lección; solo un comando la aplica sin acordarse de ella. Cuando un
diagnóstico se repite, lo que falta no es más disciplina: es un instrumento.

## 2026-09-09 (el segundo verde vacío del día: `pnpm typecheck`)
Mismo patrón que los dos Supabase locales, y por eso valía cerrarlo el mismo día: un
instrumento que contesta sin haber mirado. `turbo run typecheck` recorría los 3 paquetes,
ninguno definía la tarea, y turbo respondía *"No tasks were executed · 0 successful, 0
total"* con salida 0. Un gate que sale verde sin abrir un archivo es peor que no tenerlo:
enseña a confiar en él justo antes de pushear.

Encendido: `"typecheck": "tsc --noEmit"` en los tres. `apps/web` y `packages/shared`
salieron limpios —`next build` ya los tipaba, así que no había deuda escondida ahí—, y
`packages/database` tenía **un error real**: `client.ts:12` usa `process.env` sin
`@types/node`. Llevaba invisible desde que existe el paquete porque nadie lo tipa solo:
`apps/web` lo compila con su propio tsconfig, que sí trae los tipos de Node. Se agregó la
dependencia, que es lo que el paquete necesita de verdad.

Dos detalles del cableado, cada uno descubierto por una corrida y no por leer la
documentación: **sin** `dependsOn: ["^typecheck"]` (apps/web tipa el código fuente de los
paquetes, no un artefacto; encadenarlos hace que el primer roto cancele y esconda a los
demás) y **con** `--continue` (turbo cancela lo pendiente en cuanto algo falla, y un gate
tiene que dar la lista completa en un viaje). Con ambos, dos errores plantados a propósito
salieron los dos, salida 2. Después, verde otra vez: 5 s en frío, **39 ms cacheado**.

**Lo que Felipe aprende acá:** un verificador no está terminado cuando sale verde — está
terminado cuando lo viste salir rojo por algo que sabías que estaba mal. El verde de antes
y el de ahora se ven idénticos en la terminal; lo único que los distingue es haber
comprobado que este sí sabe fallar. Es la misma regla de ADR-0026, aplicada al gate en vez
de a las migraciones.

## 2026-09-10 (CI mínimo: el gate deja de depender de que alguien se acuerde)
`.github/workflows/ci.yml` corre `typecheck` + `lint` + `test` en cada push a main y en
cada PR. Los tres van con `if: always()` (condicionados a que la instalación haya
funcionado, no a ciegas): un push malo devuelve el diagnóstico COMPLETO en una vuelta, en
vez de enseñar el error del lint, esperar el arreglo, y recién entonces confesar que
también fallaban las pruebas. Se agregó `test` a `turbo.json` y a la raíz, para que el CI
corra exactamente el comando que corre Felipe, y `.nvmrc` con `24`, para que la versión de
Node salga de un solo lugar.

**No corre `build`, y es deliberado.** Vercel ya construye en cada push con el mismo Next
y el mismo lockfile, y `next.config.ts` no tiene `ignoreBuildErrors`. Repetirlo costaría
minutos por corrida sin agregar señal. Lo que Vercel no corre —lint y pruebas— es
justamente lo que hace este CI.

**Se tapó de paso el agujero que la sesión de `typecheck` había dejado anotado:**
`apps/web/tsconfig.json` incluye `.next/types/**`, que en un clon limpio no existe, así
que el CI habría tipado SIN los tipos de ruta de Next — verde cubriendo menos que la
máquina de Felipe. `next typegen` los genera en 3,5 s sin construir nada. Sin ese paso, el
CI habría sido otra vez un verde que promete más de lo que miró.

**La primera corrida va a salir en ROJO, y no es un error de montaje.** Simulada localmente
la secuencia exacta: typegen ✓, tipos ✓, lint ✗, pruebas ✓. Los 2 errores de lint son de
código ya commiteado (`ConteoPanel.tsx`, `react-hooks/set-state-in-effect`) y quedaron
anotados en el BACKLOG con el diagnóstico de cada uno — uno parece falso positivo de SSR,
el otro es el antipatrón de verdad. No se tocaron: son el guardado optimista de la pantalla
de conteo, recién aterrizada por otra sesión.

**Lo que Felipe aprende acá:** un CI que nace en verde no probó nada — solo demuestra que
el YAML parsea. Éste nace señalando algo real que ya estaba en main y que nadie había
visto, y por eso se le puede creer el día que diga verde. Mismo principio que el
verificador de migraciones: primero verlo fallar, después creerle.

## 2026-09-10 (los 2 errores de lint: uno era falso positivo y el otro un parpadeo real)
El CI encendido esta mañana señaló dos `react-hooks/set-state-in-effect` en
`ConteoPanel.tsx`, y la lección está en que NO eran el mismo problema aunque la regla los
llame igual.

**El `:95` es un falso positivo, y apagarlo es la respuesta correcta.** Hidrata la cola de
reintento desde `localStorage` al montar. La regla propone leerlo durante el render, pero
`localStorage` no existe en el servidor: devolvería `[]` en Node y la cola real en el
navegador — dos árboles distintos para el mismo render, que es literalmente cómo se rompe
la hidratación. Quedó un `eslint-disable-next-line` de una sola línea con el motivo
escrito al lado. Un `disable` sin explicación es deuda; con el porqué es una decisión.

**El `:106` sí era el antipatrón, y arreglarlo mejoró la pantalla.** Copiaba
`conteo.lineas` del servidor al estado local desde un efecto. Reemplazado por el ajuste
durante el render que documenta React (`conteoPrevio` + comparación). Lo que se gana no es
callar al linter: un efecto corre DESPUÉS de pintar, así que la lista vieja alcanzaba a
verse un instante antes de corregirse. En una pantalla donde se cuenta inventario, ese
parpadeo es una fila que alguien puede leer como buena.

**El detalle que hizo el cambio seguro** fue mirar el `useState` antes de tocar el efecto:
`lineas` ya nacía de `conteo?.lineas ?? []` (`:62`), o sea que el efecto en el montaje solo
repetía ese mismo valor. Por eso quitarlo no cambia nada — y si `lineas` hubiera nacido en
`[]`, el mismo cambio habría dejado la lista vacía al abrir la pantalla. Y no hay riesgo de
bucle porque `conteo` llega de un Server Component: su identidad solo cambia cuando el
servidor manda datos nuevos, igual que disparaba el `[conteo]` del efecto.

**Lo que Felipe aprende acá:** dos errores del mismo linter, misma regla, mismo archivo — y
la respuesta correcta fue opuesta en cada uno. Un linter señala una forma, no un problema;
quien decide si esa forma está mal acá es quien entiende por qué el código la tomó. Apagar
los dos habría sido pereza, arreglar los dos habría roto la hidratación.

## 2026-09-10 (auditoría antes del push: el backlog decía cuatro y faltaba una)
Antes de pushear se auditó producción **contra la base**, no contra los documentos: se leyó
el inventario con `scripts/migraciones/inventario.sql` y se pasó por
`migraciones:verificar`. El backlog decía que faltaban las migraciones `27`, `28`, `29` y
`30`. Estaban las cuatro, más la `31` y la `32`. La única pendiente era la `33`, que ni
siquiera figuraba en ese item porque se escribió después.

**Cómo se supo, que es lo transferible.** Las tablas se comprueban con `to_regclass` y eso
es certeza. Pero la `33` es un `create or replace` de una función que YA existía con la
misma firma de 12 argumentos: la firma no distingue la versión vieja de la nueva. Hubo que
buscar dentro del cuerpo (`v_color_id := nullif(trim(p_color_codigo)`, la línea que la `33`
agrega). Es literalmente lo que advierte el encabezado del verificador — "una presencia solo
dice que existe algo con ese nombre, no cuál versión" — y acá esa advertencia era la
diferencia entre "todo aplicado" y una pantalla que revienta.

**Lo que habría pasado sin la auditoría:** el push habilita el enlace a Conteo en
`InventarioNav`, y crear una prenda al vuelo dejando el color vacío habría fallado en
producción — el formulario manda `''` y la versión de la `30` solo contempla `null`. El bug
ya estaba arreglado en local desde la mañana; lo que faltaba era que la base lo supiera.

Aplicada a pedido de Felipe con `execute_sql` y **no** con `apply_migration`: esta última
habría escrito una fila en `supabase_migrations.schema_migrations` del proyecto de Dynamic,
que es el historial de ellos. Una versión fantasma ahí le rompe el `db push` a quien
mantenga Dynamic. `unificacion/` se pega, no se registra.

Verificado después de aplicar: marcador presente, **una sola firma viva**, idéntica a local.
Y de paso quedaron descartadas dos falsas alarmas del verificador: `retail_sede_meta` figura
ausente porque la unificación la movió a `retail.sede_meta`, y la sobrecarga de
`fn_set_meta_cobertura` vive en `public`, o sea es de Dynamic.

**Lo que Felipe aprende acá:** el backlog es memoria, no evidencia. Decía cuatro pendientes
y la realidad eran una — pero en la dirección peligrosa: la que faltaba no estaba escrita en
ningún lado. Antes de un despliegue, la pregunta no es "¿qué dice mi lista?" sino "¿qué dice
la base?", y son dos preguntas distintas cada vez que alguien aplica algo sin anotarlo.

## 2026-09-10 (idempotencia de `registrar_venta` — dos bugs cerrados antes de llegar a producción)

Felipe pidió avanzar el pendiente de dinero real que quedaba: `registrar_venta`
no era idempotente, y un reintento por corte de red duplicaba la venta y el
descuento de stock. Se diseñó el arreglo con un patrón de tres pasadas —
redactar, verificar adversarialmente, corregir — en vez de escribir la
migración una sola vez y confiar en ella.

**Ronda 1** propuso devolver la venta existente apenas se encontraba el
token, antes de validar sede/caja/estado. El revisor adversarial lo refutó:
es un bypass de autorización real, no solo un detalle de estilo — cualquiera
con el token recibía el resultado de una venta ajena sin que se revisara
ningún permiso. **Ronda 2** corrigió eso pero dejó la rama de la carrera
concurrente (`exception when unique_violation`, la que de verdad se dispara
con dos requests casi simultáneos) sin la misma comparación de contexto
(caja/método/monto) que sí tenía la rama normal — exactamente la rama que
existe PARA ese escenario, dejada sin candado. La tercera pasada cerró
ambos, con las dos ramas repitiendo la misma comparación vía
`is distinct from` (no `<>`, para que un campo nulo nunca deje pasar la
comparación sin resolver).

Aplicado a producción con `execute_sql` (no `apply_migration`, mismo motivo
de siempre: no ensuciar el historial de migraciones de Dynamic). Verificado
tres veces: el bloque de autocomprobación del propio script (que incluye una
prueba de COMPORTAMIENTO real — llamar la función con una caja inventada y
confirmar que se rechaza, no solo revisar que el texto del candado esté en
algún lado del código fuente), una consulta directa independiente después de
aplicar, y el verificador de `scripts/migraciones/` corrido contra una foto
fresca de producción — que confirmó el archivo sin nada pendiente.

Se descubrió en el camino que `docs/adr/0029-*.md` ya estaba prometido en
`BACKLOG.md` por otra sesión el mismo día (fix de etiqueta de sede) aunque el
archivo todavía no existiera en este checkout — colisión de numeración de
ADR, el mismo patrón que ya documentó la memoria de "sesiones paralelas".
Se renumeró a ADR-0030 antes de commitear, sin esperar a que la otra rama se
fusionara para descubrirlo tarde. **Al fusionar contra `origin/main` (que ya
llevaba 8 commits más) la misma colisión volvió a pasar una segunda vez**:
otra sesión también usó `0030` (taxonomía universal) y `0052` para su
migración local — se renumeró de nuevo a ADR-0032 y `0054`/`0055` recién al
resolver el merge, no antes, porque `origin/main` siguió avanzando mientras
esta rama esperaba. La lección se repite: verificar la numeración libre justo
antes de fusionar, no solo antes de escribir.

**Lo que Felipe aprende acá:** un borrador que "se ve bien" y un borrador
verificado no son lo mismo — los dos bugs de las rondas 1 y 2 habrían pasado
cualquier lectura casual, porque el código alrededor de cada uno es correcto;
solo se ven intentando romperlos a propósito. La disciplina de pedirle a un
revisor que refute en vez de aprobar es la que los sacó a la luz antes de
que una clienta real los encontrara primero.

## 2026-09-10 (recalcular_stock ciego al almacén, y dos filas de stock que ya estaban mal)

Cerrado el fix de `registrar_venta`, se revisó el siguiente ítem real del
backlog: `recalcular_stock` borraba el `stock_minimo` de una variante sin
movimientos, un borde que `0044_almacen_interno.sql` había dejado anotado
sin resolver. Al ir a corregir esa línea, verificar el cuerpo REAL de la
función en producción (no el del repo) mostró algo más grave: la versión
vigente es la de ADR-0020, escrita antes de que existiera el almacén
interno — no sabe nada de `contenedores` ni de `stock_almacen`. Producción
ya tiene 4 contenedores de almacén reales y 9 movimientos enrutados ahí; si
alguien invocara esta función hoy (es la "red de seguridad" manual, no algo
que corra solo), mezclaría el almacén de vuelta al piso de venta.

Se portó el diseño de `0044` (ya en `origin/main`, nunca pegado a
producción con ese alcance) sumando el guard de `stock_minimo`, el candado
de Líder (perdido en algún punto desde ADR-0020) y el `EXECUTE` de más para
`PUBLIC`. Una revisión adversarial encontró un bug antes de aplicar: sin
una excepción para traslados, el mecanismo real de "devolver a almacén"
—hoy una rama muerta en el frontend, pero viva en el RPC— habría dejado
inventario fantasma (restado del origen, sumado en ningún lado). Se corrigió
antes de tocar producción. La misma revisión levantó una alarma sobre
`es_lider()` (parecía estar chequeando el rol equivocado, el de Dynamic en
vez de uno propio de retail) que se verificó y resultó falsa: `admin` en
Dynamic y `lider` en retail son la misma persona, por diseño
(`lib/persona.ts:mapearRol`) — vale la pena que quede registrado que se
investigó y se descartó, para que nadie la vuelva a levantar sin revisar.

Antes de aplicar, se comparó (con `select` de solo lectura, sin invocar la
función) lo que el nuevo cálculo produciría contra el `stock` real de las 4
sedes. Coincidencia exacta en almacén; 8 de 10 filas de piso también. Las 2
que no coincidían resultaron ser una misma prenda con el mismo patrón: un
`ingreso de lote` al almacén contado también como piso, del 2026-09-05 —
antes de que `fn_aplicar_movimiento` supiera separar ambos. Es decir: dos
SKUs en Arequipa llevaban mostrando entre 40 y 50 unidades de más en
Catálogo y Vender, hoy, con la tienda operando sobre ese número. Felipe
confirmó explícitamente la corrección (99→49, 98→58) antes de aplicarla —
un `update` de dos filas puntuales, sin tocar `movimientos`, en vez de
invocar la función completa (que habría exigido impersonar la sesión de un
Líder para pasar su propio candado).

**Lo que Felipe aprende acá:** una "red de seguridad" que nadie corrió
todavía no es una red de seguridad — es una promesa sin probar. Estaba rota
desde que se construyó el almacén interno y nadie lo supo porque nadie la
había invocado; el mismo ejercicio de verificarla para otra cosa (el borde
de `stock_minimo`) fue lo que sacó a la luz que dos números reales, en
pantalla, ya estaban mal.

## 2026-09-10 (auditoría del código ajeno, ya desplegado — y una trampa que casi muerde)
Felipe pidió verificar si era seguro pushear los commits de las otras sesiones. Se habían
pusheado ya: `origin/main` estaba en `f7bdfc4`, los 10 commits arriba. Así que la pregunta
cambió de "¿conviene?" a "¿hay que revertir algo?". No hay que revertir nada.

**Lo auditado, contra la base y contra el código, no contra la intención.** Los 3 RPC que
llama la pantalla de conteo existen en producción con firma idéntica a local. Las 6 tablas
también. `EtiquetasGenerator` trata el `codigo` nulo con `?? sku` en las cuatro partes donde
lo usa — importa porque producción tiene 2 variantes sin código (las de color "azul " con
espacio) y habrían impreso etiqueta en blanco. Y cero lecturas silenciosas en el código
nuevo: la única coincidencia de `{ data }` en `lib/conteo.ts` está DENTRO de un comentario
que explica por qué usaron `exigirOpcional` en su lugar. El CI —estrenado hoy— salió verde
en su primera corrida real, 42 s.

**La trampa, que es el hallazgo que sobrevive a esta sesión:** la función de permiso se
llama distinto en cada lado. Local `retail.fn_puede_operar_sede`, producción
`retail.puede_operar_sede`, sin el `fn_`. Los archivos están bien —20 de `migrations/` usan
una y 17 de `unificacion/` la otra—, pero el cuerpo de una función plpgsql **no se resuelve
al crearla, solo al ejecutarla**. Copiar un gemelo al otro, que es el gesto natural cuando
escribes el par, deja un `create or replace` que corre en verde y falla la primera vez que
alguien lo usa. `migraciones:verificar` tampoco lo vería: comprueba que la función exista,
no a quién llama por dentro. Anotado en el BACKLOG con las dos salidas.

**Lo que Felipe aprende acá:** hoy leí `retail.puede_operar_sede` en el archivo que estaba
por aplicar, lo busqué en local, no estaba, y por un momento pensé que iba a romper
producción. La costumbre de comprobar antes de opinar convirtió un susto en un hallazgo — y
el hallazgo vale más que el susto, porque esa diferencia de nombres sigue ahí esperando a
quien escriba el próximo par de gemelos.

## 2026-09-10 (cierre: qué falta de verdad, cruzado contra la base)
Con todo pusheado y el CI en verde, se auditó qué queda. El resultado más útil no es la
lista sino que **el backlog mentía en tres items más**, siempre en la misma dirección:
daba por pendiente algo ya hecho, porque quien lo hizo no lo anotó.

**El cruce que conviene repetir antes de cada despliegue:** se extrajeron los 25 `.rpc(` que
llama `apps/web` y se preguntaron de golpe contra producción. **Los 25 existen, con
exactamente una firma cada uno** — ni falta ninguno ni hay sobrecargas (la trampa del
ADR-0009). Es una consulta, contesta en un segundo, y responde de verdad la pregunta "¿la
app y la base están de acuerdo?", que hasta hoy se contestaba pantalla por pantalla cuando
algo se rompía.

Corregidos: `crear_producto_con_variantes` YA está en producción (con su pantalla
`/inventario/producto/nuevo` desplegada), o sea que `unificacion/16` se pegó y nadie lo
registró; y el padrón YA tiene proveedor contratado — hay un token real de `apisnetpe_v1` y
la bitácora del 08-09 registra la consulta funcionando —, así que lo único abierto ahí es
confirmar el valor exacto en Vercel.

**Un susto que no lo era:** `recibir_lote_completo` no aparecía en producción y
`/inventario/recibir` es de uso diario. Resultó que ese es el nombre del ARCHIVO de
migración (`0031_recibir_lote_completo.sql`); la función se llama `recibir_lote` y está.
Segunda vez en el día que un nombre de archivo o una diferencia de nombres entre entornos
manda por el camino equivocado.

**Lo que Felipe aprende acá:** tres items del backlog decían "falta pegar X" y X estaba
pegado. El patrón no es descuido de una persona: es que aplicar algo en producción y
anotarlo son dos gestos distintos, y el segundo se olvida cuando el primero salió bien. Por
eso el cruce automático vale más que la lista escrita — la lista recuerda lo que alguien
decidió anotar, la base sabe lo que pasó.

## 2026-09-10 (cierre de sesión)
Se le pasó a la sesión "Daniel - Organizacion inventario INC" —la de las etiquetas, que
sigue trabajando— los dos cabos que dejó su propio commit `d80c57d`: ADR-0025 quedó con la
razón equivocada escrita (el código corto se justifica por el ancho físico, no por la
degradación a 1.2 puntos/módulo), y la cabecera de `lib/codigo128.ts` todavía describe el
estirado que ese commit eliminó, o sea que contradice al código que tiene debajo. Enviado
como aviso, no como encargo: si ya lo tenían en el refactor, siguen.

Y queda publicado un resumen visual de la jornada, con el libro de cuentas de las ocho
afirmaciones que la base desmintió.

**Lo que Felipe aprende acá:** un comentario que envejece mal es peor que no tenerlo. El de
`codigo128.ts` explica con precisión un bug que ya no existe — quien lo lea mañana va a
diagnosticar hacia atrás. Cuando un arreglo desmiente la razón escrita, corregir el texto
es parte del arreglo, no papeleo posterior.

## 2026-09-10 (la etiqueta deja de ser una hipótesis — y un ADR enseñaba una causa falsa)

**La etiqueta de CAYLA está verificada con hardware real.** Felipe imprimió la hoja de prueba
y la escaneó con la pistola: cada QR devuelve exactamente el código impreso debajo, la Zebra
los engancha rápido y de lejos, y el texto de la derecha se lee sin esfuerzo a la distancia a
la que se mira una etiqueta colgada. La etiqueta pasó a ser **QR + el código legible al lado**
(`397e666`), que es además lo que CAYLA ya venía usando en la operación.

**Leer QR no requirió construir nada.** El lector manda el contenido como si lo tecleara, y
`conteo_contar_por_codigo` resuelve cualquier texto contra `codigos_barras` → `variantes.codigo`
→ `sku`. Como esa tabla ya modela "varios códigos, una prenda" sin importar la simbología, los
QR que CAYLA ya tiene pegados se adoptan con un `insert`: la ropa ya etiquetada queda escaneable
sin reimprimir nada.

**El camino hasta acá tuvo dos errores míos, y el segundo enseña más que el primero.**

El 09-09 escribí en ADR-0025 que el SKU largo no se leía porque se degradaba a 1.2 puntos por
módulo. El 09-10 Felipe escaneó y salió basura — pero salió basura con `BLU-0001-AZM-M`, **el
código CORTO de 14 caracteres**. Si la causa hubiera sido el largo, ése tenía que haber leído
bien. El defecto real era que el SVG se **estiraba** al ancho de la etiqueta y deformaba la
proporción de anchos de la que Code 128 depende: rompía cualquier código. Un round-trip probó
que el encoder siempre estuvo bien. El arreglo fue dejar de estirar (`d80c57d`).

**Lo que aprendió Felipe:** que un ADR puede observar bien el síntoma y sacar la conclusión
equivocada. Ese ADR TENÍA descrito el estirado, en su propia línea 17 — y aun así le echó la
culpa al largo del texto en vez de al renderizador. Actuar sobre ese diagnóstico habría dado un
código más corto que igual no se leía. La aritmética estaba escrita como si fuera evidencia,
y decía "verificar el dpi exacto" como si fuera un detalle pendiente y no la prueba entera.

Corregido el 10-09: ADR-0025 lleva ahora la corrección ANTES del contexto —quien lee de arriba
hacia abajo se topaba primero con la causa falsa— y el contexto viejo queda como estaba, con su
error incluido. Un ADR es historia; borrar el razonamiento equivocado borraría la lección.
La cabecera de `lib/codigo128.ts` también contaba la historia vieja y contradecía al código de
abajo. Los dos cabos los detectó una sesión paralela leyendo mi propio commit.

**Se sumó una librería, rompiendo la tradición del repo, y vale decir por qué.** Code 128 se
escribió a mano con razón: una tabla de patrones y un checksum, 40 líneas auditables. QR no es
comparable — Reed-Solomon sobre campos de Galois, ocho patrones de enmascarado con evaluación de
penalidad, formato con códigos BCH. Son 600+ líneas donde un error produce un código que *a
veces* escanea: pasa las pruebas y falla en el mostrador. `qrcode.react` 4.2.0.

Y se aplicó dos veces la misma disciplina: **la hoja de prueba dibuja con el mismo código que la
app**, no con una copia. Para el QR eso significó renderizar el propio componente a HTML estático
desde Node. Si generara el suyo, mediría otra cosa — que es exactamente el error que casi
cometemos con el código de barras.

## 2026-09-10 (el conteo por fin se puede cerrar)
El censo tenía un callejón sin salida que ningún documento registraba: la pantalla de
conteo funcionaba entera —escanear, contar a ciegas, crear al vuelo— y le decía a la
Encargada, con esas palabras, «lo contado no entra al inventario hasta que la Líder
cierra». Pero `cerrar_conteo` **no estaba cableada en ninguna parte de la app**. Ni
`previsualizar_cierre_conteo`, ni `anular_conteo`. Las tres RPC existían en la base desde
`0048` y ninguna tenía un botón: el equipo podía contar 900 prendas y esas 900 no entraban
nunca. Una pantalla prometiendo algo que el sistema no podía cumplir.

Nace `/inventario/conteo/cerrar`: la varianza valorizada al costo, el aviso aparte de lo
que nadie contó (que al cerrar queda en cero), y las dos decisiones de la Líder. Va en
pantalla propia y no como sección de la de contar, porque son dos trabajos distintos de
dos personas distintas — contar es un gesto que se repite 500 veces con el foco clavado en
el buscador; aprobar pasa una vez y necesita ver todo antes de tocar nada. Y navegar es lo
que garantiza que la cifra esté fresca.

**Lo que Felipe aprende acá:** «faltan 47 unidades» no se puede aprobar. 47 medias y 47
abrigos son el mismo número y no el mismo problema. Por eso la varianza se muestra en
soles al costo, y por eso la conversión vive en `lib/`, no en la RPC: el costo es un dato
del catálogo, no del conteo, y meterlo adentro ataría lo contable a la mecánica de contar.

Y la regla que se probó aparte, porque es la que se rompe callada: **una prenda sin costo
no vale cero.** Durante el censo se crean prendas al vuelo y muchas nacen sin costo;
sumarlas como 0 daría una varianza más chica que la real — la dirección en la que un
número equivocado hace daño, porque un faltante que se ve pequeño no se investiga. La
pantalla las declara aparte: «la cifra real es mayor que esta, no menor». La aritmética se
extrajo a `lib/conteo-varianza.ts` para poder probarla sin montar Supabase, el mismo
patrón que `panel-serie.ts` frente a `panel.ts`. 7 pruebas nuevas.

De paso, el ítem del backlog estaba viejo por tercera vez esta semana: daba por pendientes
la proyección delgada y la pantalla de conteo, que ya existían desde `ab479ba`.

## 2026-09-10 (el alta deja de repetirse, y con eso deja de partir prendas en dos)
El backlog pedía una MATRIZ talla × color para el alta durante el censo. Se descartó y se
hizo otra cosa, con el desacuerdo puesto sobre la mesa antes de construir. Dos razones:
`conteo_crear_variante` siempre termina llamando a `conteo_contar`, así que crear las 12
celdas de golpe metería 11 líneas «contadas: 0» — que en el cierre significa «miré y no
había», una afirmación y no un vacío, justo en el informe que se acababa de construir para
que fuera confiable. Y porque el dolor real no era declarar 12 celdas: era que la segunda
talla del mismo modelo volvía a pedir los siete campos.

Ahora el alta recuerda el modelo: la siguiente pide talla, color y cantidad.

**Lo que Felipe aprende acá, y vale más que la comodidad:** buscando el ahorro de tecleo
apareció un defecto que el censo habría golpeado en la prenda número dos. `AltaEnConteo`
nunca pasaba `p_producto_id`, y la RPC, sin ese dato, **inserta un producto nuevo cada
vez**. Declarar la talla M y después la L de la misma blusa creaba dos productos con la
misma referencia y DOS códigos cortos distintos. El código corto es lo que va impreso en la
etiqueta y lo que agrupa el catálogo por modelo: la prenda quedaba partida en dos para el
inventario, la rotación y la clase ABC, sin que nada fallara. Recordar el modelo no es un
atajo de tecleo; es lo que impide esa partición.

La lección de método: la funcionalidad que se pidió (la matriz) y el problema que la
motivaba (repetir trabajo) no eran lo mismo, y atacar el segundo destapó un bug que la
primera habría tapado — con la matriz, las 12 variantes nacen del mismo producto y el
defecto no se ve nunca, hasta que alguien da de alta dos prendas sueltas.

## 2026-09-12 (el corte V1→V2 dejó el entorno local roto para todos menos para quien lo cortó)

`0009_integracion_dynamic.sql` (el corte de hoy) delega la identidad en `public.fn_rol_actual()`/
`fn_sede_actual_persona()` de Dynamic, pero el stub local que `seed.sql` ya asumía
(`0000_local_stub_dynamic.sql`) nunca se commiteó. Casi se resuelve mal: el primer intento fue
crearlo directo en `supabase/migrations/`, hasta encontrar que `.gitignore` ya lo excluía a
propósito, con la razón escrita al lado — esa carpeta se copia/pega al SQL Editor de
producción, y ahí `public.sedes`/`personas` son las tablas reales de Dynamic; un
`create or replace function` de este stub pegado por error las sobreescribiría en silencio.
La regla estaba bien. Lo que faltaba era otra cosa: nada generaba ese archivo la primera vez.
Se agregó `supabase/0000_local_stub_dynamic.sql.example`, versionado, mismo patrón que
`.env.example` → `.env.local` — copiar es un paso nuevo del setup, no una excepción a la regla
de seguridad. Cuerpo de las dos funciones y el enum `rol_usuario`, copiados exactos desde
cayla-dynamic (`pg_get_functiondef`, producción, no a mano). Verificado con `db reset` limpio
desde la plantilla y una consulta directa: `fn_rol_actual()` resuelve `admin` para Felipe,
`retail.fn_es_lider()` da `true`.

De paso, auditando cómo colabora el equipo (5 personas con push directo a `main`, cero
protección) salió el mismo patrón de siempre: dos migraciones `0054` duplicadas el 11-sep,
`0057`→`0059` renumerado hoy mismo. ADR-0034 mueve las migraciones nuevas a timestamp
(`supabase migration new`) para que el choque sea imposible por diseño, no por acordarse de
revisar contra `origin/main` al fusionar.

Lo que Felipe se lleva: **una regla de seguridad puede estar perfectamente bien y romper el
onboarding igual** — "fuera de git a propósito" cerraba el riesgo real (contaminar
producción) pero no traía consigo cómo cumplirla la primera vez. Corregir la regla habría sido
el error; lo que faltaba era la plantilla, no menos candado.

## 2026-09-12 (el mismo corte también se llevó el pre-commit, y nadie lo vio)

Explicándole a Felipe el paso 2 del setup ("`pnpm install` activa el hook") salió que
`0af2f1b` borró `.githooks/pre-commit` (tipos+tests+lint sobre lo commiteado) y el script
`prepare` que lo activa — sin que ningún commit lo señalara, porque git, si `core.hooksPath`
apunta a un archivo que ya no existe, no corre nada y no avisa. Restaurado byte a byte desde
`3cfb6e2` (mismo blob, mismo modo `100755` — se había perdido el bit ejecutable en el primer
commit porque este checkout tiene `core.filemode=false`, arreglado con `update-index
--chmod=+x` aparte). Verificado antes de restaurar, no asumido: `apps/web`/`packages/*/src`
siguen calzando con la estructura V2, y los tres checks pasan limpio (tsc 0 errores reales —
el único ruido es `.next/types` desactualizado, que el propio hook clasifica como aviso no
bloqueante, nunca como fallo; vitest 95/95; eslint limpio).

Mismo patrón que el stub de arriba: un corte de núcleo grande (`0af2f1b`) se llevó por delante
una pieza de infraestructura que no tenía nada que ver con el motivo del corte, y como el
fallo es silencioso (git no avisa, el commit simplemente pasa) pudo haber quedado así
indefinidamente si nadie preguntaba "¿y esto de verdad sigue haciendo lo que dice?".

## 2026-09-14 (compras: el costo del papel puede venir con IGV)

Felipe pidió un switch para tipear el costo unitario tal como lo lista el proveedor —muchos
lo dan con IGV— en vez de dividir entre 1.18 a mano. La base no se tocó: `compra_items.
costo_unitario` sigue sin IGV y `registrar_compra` sigue armando el total desde ahí; el
selector "Sin IGV / Con IGV" (`CompraFormV2.tsx`, sección de líneas) solo cambia cómo se
interpreta lo tipeado, y `costoBase` / `costoParaTipear` (`lib/compras-reglas.ts`, con
test) hacen la conversión redondeando a 2 decimales igual que `numeric(12,2)`, para que el
resumen en pantalla y lo que guarda la RPC nunca difieran. Solo aparece en factura con IGV
> 0: en boleta y nota de venta no hay nada que descontar.

**Y a la primera prueba salió el centavo:** 1 × S/ 10.00 con IGV → base 8.47 → IGV 1.52 →
total 9.99. La causa no era la pantalla sino la RPC, que derivaba el total desde la base.
Con precios con IGV la lectura correcta es la inversa (la de SUNAT): el total del papel es
el dato y el IGV es lo que falta. `20260914190000_compras_total_del_papel`: `registrar_
compra` acepta `p_total`, exige que cuadre con las líneas (un centavo por línea más uno) y
guarda `igv = total − subtotal`; check `compras_total_cuadra`. Se descartó subir el costo a
4 decimales: empuja el redondeo un decimal más lejos en vez de resolverlo donde nace.

**Multipago.** Felipe quiere pagar una factura con dos medios en el mismo acto. El modelo ya
era "una fila de `compra_pagos` por medio"; lo que faltaba era escribirlas en una sola
transacción: `registrar_pagos_compra` (`20260914200000_compras_multipago`) valida cada medio
y la suma contra el saldo con la factura bloqueada, y escribe todo o nada — antes, dos pagos
sueltos podían dejar el primero registrado y el segundo no. `LineasPago.tsx` es el bloque
compartido por las tres pantallas.

**Avisos (ADR-0047).** Felipe pidió que toda validación, error, éxito o proceso se vea arriba
a la derecha, y que el cursor vaya al campo de la validación. `components/ui/Avisos.tsx`
(estado fuera de React, sobrevive a la navegación; todos se van solos con una barra de tiempo al pie que se pausa con el mouse encima) y 22
pantallas cableadas: desaparecieron 16 `useState` de error y todos los `<p>` rojos inline.
Lo que es del campo ("Supera el saldo") se queda pegado al campo — eso no es notificación.
También de hoy: `CampoFecha` (calendario propio, lunes a domingo, `dd/mm/aaaa` tipeable) en
lugar del nativo del navegador, y el proveedor se elige con el mismo `ComboBuscable` que la
prenda (busca por nombre o RUC).

De paso salió que la anulación de facturas ya existía con la regla que Felipe proponía
(sin recepción) más una (sin pagos) — y que un pago registrado por error no tiene reverso,
lo que deja esa factura bloqueada para siempre. Decisión pendiente de Felipe (A: RPC
`anular_pago_compra` append-only, recomendada).

## 2026-09-14 (por pagar: una tabla, tres tramos)

Se rehízo `/compras/por-pagar` porque no se entendía: el mismo monto aparecía en cuatro
niveles (tarjeta, bloque "en esta página", proveedor, fila), cada proveedor tenía su propia
tabla con su propio encabezado, y "Pagar" —la única acción de la pantalla— era el botón más
discreto. Ahora es UNA tabla con tres tramos por urgencia (Vencidas en rojo, Vencen esta
semana en ámbar, Más adelante), el proveedor va en la fila (agrupar por proveedor es trabajo
del filtro, no de la estructura), el vencimiento se lee relativo ("Venció hace 15 días",
"Vence en 3 días") con la fecha debajo, y "Pagar" sube a peso fantasma. La tarjeta "Vence
esta semana" dejaba de mentir: se sumaba con las filas de la página; ahora la cuenta
Postgres (`20260914210000_compras_resumen_por_vencer`, pendiente en producción).

## 2026-09-14 (compras: mismo día, la registrada después va primera)

La lista ordenaba por `fecha_emision desc, id desc`, y `id` es un uuid aleatorio: entre
facturas del mismo día el orden era un sorteo. Ahora desempata por `created_at` (cuándo
la registró el colaborador) y `id` queda al final solo para que el cursor sea único. El
cursor del paginado pasa a tres partes (`fecha~creadoEn~id`) y los 4 índices de orden se
recrean con `created_at`; verificado con 100k filas ficticias (rollback) que el plan sigue
siendo `Index Scan using compras_orden_idx` sin `Sort`. Migración
`20260914220000_compras_orden_por_creacion`, pendiente en producción.

## 2026-09-14 (detalle de factura en modal)

Abrir una factura desde la lista ya no cambia de pantalla: el detalle se abre como modal
encima de la lista (rutas interceptadas de Next, slot `@modal/` en el layout de
`/compras`), y al cerrarlo —Escape, velo, botón— se vuelve exactamente donde se estaba.
La URL sigue siendo compartible: recargar o entrar por enlace muestra la página completa.
El detalle se movió a `/compras/factura/<id>` porque `(.)[compraId]` directo bajo
`/compras` interceptaba también `/compras/por-pagar` y `/compras/nueva` (apareció en la
demo, no en el typecheck). De paso salió un bug latente de `ui/Modal.tsx`: el
`setTimeout(onClose)` vivía dentro de un updater de `setState` y StrictMode lo disparaba
dos veces — invisible con `setModal(null)`, fatal con `router.back()` (retrocedía dos
páginas). Ahora el temporizador va en un `useEffect`. Verificado en Chrome headless: 10
escenarios (lista, por pagar, pestañas hermanas, carga directa, `desde=nueva`, móvil, pago
anidado) sin errores de consola.

## 2026-09-15 (producción: matriz color × talla, y las variantes nacen en Productos)

Felipe pidió comparar con la Producción de V1 (jul-2026, borrada en el corte V1→V2):
avíos, maquila y tercerizado ya estaban en V2 —solo las etiquetas salían pegadas
("TELADE TODA LA CORRIDA") porque el formulario pasaba texto por `ayuda`, que es el
slot del botón de ayuda, no `pie`—; lo que faltaba era la grilla estilo Shopify. Se
decidió la ruta A: la orden reparte cantidades en una matriz color × talla sobre las
variantes que el catálogo ya tiene (celda «—» si la combinación no existe, enlace a
Productos), y no crea variantes al vuelo como V1 (ADR-0050 §5). Verificado en Chrome
headless: 4 S + 6 M → `producciones` en_proceso con `S=4, M=6`. Quedan dos decisiones
abiertas en BACKLOG (atajo «Nuevo modelo», tercerizado al abrir).

## 2026-09-15 (historial de producto: movimientos por producto + ledger de precio/categoría)

`fn_movimientos` gana `p_producto_id` (resuelve a sus variantes, sede sigue obligatoria —
mismo permiso que `/movimientos`, ADR-0051) y nace `historial_producto_cambios`, un
ledger append-only que un trigger en `productos`/`variantes` llena solo, sin que ninguna
pantalla tenga que acordarse (decisión de Felipe: precio/categoría entran al historial
aunque no sean movimientos de stock). Verificado en Chrome headless contra datos reales:
`HistorialProductoPanel` muestra los 10 movimientos de Pantalón Carla en Tienda Lima
(signo y categoría idénticos a `/movimientos` para las mismas filas), cambia a 16 en
Taller con el signo invertido en las transferencias, y un cambio real de precio
(S/99.90 → S/104.90) aparece en la sección "Precio y categoría" al instante. De paso:
`_dev/` como carpeta de ruta de demo NO funciona (Next.js la excluye del ruteo por
completo, "private folder") — la demo quedó en `productos/dev/historial/[id]`; si otra
sesión usó `_dev` para la suya, tiene el mismo 404 silencioso.

## 2026-09-15 (productos: integración final del menú "..." y acciones masivas)

Cierre del bloque (Sesión B2): mergeadas A2+A3+B1 en `feat/productos-acciones-masivas`
(un solo conflicto trivial, en BITÁCORA). "Ajustar inventario" e "Historial" del menú
"..." no calzaban como decía la consigna — ninguna era un simple `productoId`:
la primera también pedía `ubicacionId`/`sububicaciones` (resuelto con
`persona.ubicacionId`, dato ya disponible), la segunda no era un componente liviano
sino una página entera con paginado por cursor y selector de sede. Para "Ver historial"
Felipe eligió copiar el patrón de Compras: `/productos/@modal/(.)[id]/historial`
(ruta interceptada) + `/productos/[id]/historial` (página real), en vez del camino
más corto (navegación simple sin overlay). Acciones masivas Activar/Desactivar:
un solo `UPDATE productos SET estado=... WHERE id IN (...)` desde el cliente —ninguna
RPC nueva, alcanza con la RLS `productos_write_lider`— pero el trigger de historial de
A3 solo miraba `categoria_id`/`precio`; se extendió
(`20260915223000_historial_producto_estado.sql`) para no perder justo el cambio que
esta sesión agrega. De paso: dos migraciones de otra sesión (anteriores a esta,
ya en `main`) compartían el mismo timestamp `20260915120000` y rompían
`supabase db reset` para cualquiera — renombrado el archivo (no el contenido) a
`...120001`. Verificado con Playwright headless contra datos reales: login,
ambos modales, recarga directa de `/productos/<id>/historial` sin overlay, "Estado
Activo → Descontinuado" apareciendo en el historial tras desactivar en bloque, y las
tres rutas de demo (`dev-ajustar-inventario`, `dev/historial`, `_dev`) ya sin el
contenido viejo. Borradas `productos/dev-ajustar-inventario/` y `productos/dev/`.

## 2026-09-15 (colores: tipo visual y muestra real)

Sesión F2 (`feat/colores-tipo-muestra`, sobre `DiegoN`): `colores.tipo` (sólido/textura/
estampado, ortogonal a `familia_color`), `colores.imagen_muestra_url` (bucket público
`retail-colores-muestras` — ADR-0053 justifica público sobre el precedente privado de
adjuntos de factura) y `colores.notas`. `ColoresLista.tsx` con selector de tipo, subida de
muestra y notas en alta/edición; el listado cae al cuadradito de HEX cuando no hay foto.
Verificado con `typecheck`/`lint`/`build`/`vitest` (215/215) limpios; sin Docker/Supabase
local en este sandbox, la subida real a Storage queda pendiente de un navegador con
Storage encendido (local o producción) — documentado en BACKLOG.
