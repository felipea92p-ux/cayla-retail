# Flujo — Ciclo de vida de un producto: alta, ficha, edición, historial y eliminación (`/productos/nuevo` → `/productos/[id]/editar` → `/productos/[id]/historial`)

> Modo: completo (flujo de varias pantallas y sus costuras) · Fecha: 2026-09-29 · Rol/sede: líder y admin, Tienda Lima · Datos: **real** — consultas de solo lectura a producción hechas por el agente en la sesión (no las corrió Felipe; el apéndice de `catalogo-plan-de-ataque.md` las lista para que las confirme) y recorrido visual en local (alta a medio cargar y editor de «Blusa Emma»)
> SHA analizado: `38f9d7ce` (origin/main; el código se leyó en `123bb733`; entre los dos solo cambió `alta-producto/ProductoCreado.tsx`, que suma «Imprimir etiquetas» al terminar el alta). Si cambian `NuevoProductoForm.tsx`, `ProductoForm.tsx`, `alta-producto/*`, `ficha-producto/*`, `lib/alta-producto.ts`, `lib/variantes-ficha-reglas.ts` o las RPC `crear_producto_con_variantes`, `crear_producto_con_stock_inicial`, `catalogo_actualizar_producto`, este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/{nuevo,[id]/editar,[id]/historial}/page.tsx` · `@modal/(.)[id]/historial/page.tsx` · `components/NuevoProductoForm.tsx` · `components/alta-producto/*` · `components/ProductoForm.tsx` · `components/ficha-producto/*` · `components/BarraDeCambios.tsx` · `components/ConfirmarCambios.tsx` · `components/EliminarProductoModal.tsx` · `lib/alta-producto.ts` · `lib/alta-producto-datos.ts` · `lib/variantes-ficha-reglas.ts` · `lib/producto-cambios-reglas.ts` · `lib/historial-producto*.ts` · `lib/fotos-pendientes.ts` · RPC `crear_producto_con_variantes`, `crear_producto_con_stock_inicial`, `catalogo_actualizar_producto`, `fn_corregir_identidad_variante`, `fn_historial_producto_cambios`, `eliminar_producto`, `eliminar_producto_con_historia` · tablas `productos`, `variantes`, `producto_fotos`, `stock`, `movimientos`, `historial_producto_cambios`
> Otra sesión tocándola: **no directamente** (los ADR-0257, 0258, 0260 y 0263 ya están en `main`; `docs/SESIONES-ACTIVAS.md` los sigue mostrando como reservados o sin pegar: filas viejas). Una rama viva, `claude/catalogo-submodulos-estandarizacion-b75f02`, toca `NuevaMarcaForm.tsx`.
> Este es el **primer análisis** del ciclo de vida completo. No existe una página `/productos/[id]`: la «ficha» son tres piezas —`FichaVariantes` en la Tabla, `VistaRapidaModal` en la Grilla y `/editar`, que el aviso de la cola llama «Ver la ficha» (`lib/useColaProductos.ts:29`). ADR-0243 (variante solo lectura) quedó superado por ADR-0258 y luego por ADR-0263.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción-agente]` consulta de solo lectura del 2026-09-29 · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
El alta es un ejemplo de buen diseño —cuatro preguntas, la prenda a la derecha tal como quedará, una sola transacción con token contra el doble clic, cola sin red— y la edición ya guarda «en dos tiempos» con control de versión. Lo que falla no está en la pantalla sino **en lo que la base no impide**: el precio mayor que cero solo se exige en el formulario, y el censo de mañana no usa el formulario. Además la edición reemplaza todo lo que no se le manda y guarda en tres transacciones, y el historial no registra ni el nombre ni la creación.
**Cumple su finalidad:** 5,0/10 (promedio 7,5, con tope 5: la regla «precio > 0» vive solo en la pantalla y el censo entra por la RPC; se levanta si se comprueba que Vender rechaza el precio 0) · **Relevancia:** 7,8/10 — Soporte (a un paso de Núcleo: de aquí sale todo lo que después se vende, se cuenta y se analiza)

## 1 · Finalidad declarada
"Estas pantallas existen para dar de alta una prenda (modelo, tallas, colores, precio y, si se quiere, el stock de hoy), corregirla mientras la vida de la prenda lo permita, ver quién cambió qué y retirarla cuando nunca se movió." Fuente: ADR-0058 (alta con matriz), ADR-0109 (árbol de decisión), ADR-0197 y ADR-0260 (cuatro pasos/preguntas), ADR-0212 (stock de hoy), ADR-0193 (control de versión), ADR-0257 (dos tiempos), ADR-0258 y ADR-0263 (corregir color y talla), ADR-0252 (eliminar con historia); **no las capturas**. ¿Docs y pantallas coinciden? **Sí en lo esencial.** Tres desalineaciones: `SESIONES-ACTIVAS.md` (filas viejas), el error «Solo un líder puede dar de alta…» de la RPC cuando el permiso ya es `fn_puede_editar_catalogo()`, y el texto «Quién lo registra… queda a su nombre en el historial», que solo se cumple si hay stock. Ninguna D-nn cubre el precio 0.

## 2 · Objeción
1. **«Precio mayor que cero» está en la pantalla y no en la base.** El formulario lo exige (`alta-producto.ts:221-222`); la tabla y las RPC lo permiten (`variantes_precio_check`: `precio >= 0` `[producción-agente]`). El censo de TRU entra por lotes y llama a `crear_producto_con_stock_inicial` directamente (auditoría del 29-sep, D2): si una fila llega con precio vacío o 0, la prenda nace activa a S/0. No encontré en `registrar_venta` ni en Vender ninguna comprobación de precio 0 `[no verificable: solo busqué en las tres últimas definiciones y en `vender-reglas.ts`]`. Es un candado que vive en el lugar equivocado (Lamport).
2. **Editar reemplaza todo y guarda en tres transacciones.** `catalogo_actualizar_producto` borra lo que no recibe (descripción, stock mínimo, temporada, tejido, patrón); y después `ProductoForm.tsx:665,686` llama a `actualizar_variantes_etiquetas` y `asignar_temporadas` por separado: si la pestaña se cierra entre la 1.ª y la 2.ª, las etiquetas de las variantes nuevas y la temporada por color **no se aplican** y la pantalla ya dijo «guardado».
3. **El control de versión tiene tres huecos.** `p_version_esperada` es opcional (un cliente viejo o la API caen en «gana el último»); solo cuenta la fila de `productos` (etiquetas, fotos que inserta el alta o la cola sin red, y `cambiar_estado_productos` ni la revisan ni la suben: un formulario viejo puede **borrar fotos recién subidas**, porque `p_fotos` reemplaza todo); y cualquier `UPDATE` a `productos` (descontinuar en bloque, temporadas) sube la versión y provoca falsos conflictos.
4. **Para guardar hay que salir a otra pantalla.** En el editor de «Blusa Emma», el campo Patrón dice: «Esta prenda ya tenía patrón y Camisas y Blusas no tiene ninguno habilitado: habilítalos en Catálogo → Categorías para poder guardar» `[visto]`. Quien edita a las 6 de la tarde no tiene permiso en Categorías, y el alta sí resuelve esto en el mismo lugar (`ConfigurarCategoria.tsx`).
5. **El historial no registra lo importante.** Anota categoría, estado, marca, proveedor, precio, costo, color, talla, código, activo y temporada; **no** anota el nombre, la descripción, el tejido, el patrón, el stock mínimo, «permitir venta sin stock», las fotos, una variante nueva ni **la propia creación** (`fn_registrar_cambio_producto`). En producción hay 79 filas y solo cinco tipos de campo `[producción-agente]`.
6. **Las etiquetas prometen otra cosa:** «Quién lo registra… queda a su nombre en el historial» solo se cumple si hay stock (`NuevoProductoForm.tsx:969`; sin stock el combo bloquea el botón pero la base no lo guarda); «Costo · Opcional» y vacío se guarda como 0 (`:417`), lo que hace ver un margen de 100 %; `puedeCrear` está fijo en `true` (`NuevoProductoForm.tsx:721`, `ProductoForm.tsx:878`).
7. Trade-off: no toques la estructura de cuatro preguntas ni el guardado en dos tiempos: funcionan y son lo mejor del módulo. Lo urgente es cerrar en la base lo que hoy solo cuida el formulario, **antes** de que el censo lo evite.

## 3 · Lo que está bien y no se toca
- **Una sola transacción para el alta:** `crear_producto_con_stock_inicial` incluye producto, variantes, etiquetas, temporada, movimientos de carga inicial y bajada al piso; `advisory_xact_lock` por token: un doble clic o un reintento devuelve el mismo producto sin recargar el stock (`20260928100000:694`).
- **Sin red no se pierde el alta:** entra a una cola con su token (localStorage) y las fotos a IndexedDB (`lib/fotos-pendientes.ts:57`); el código lo pone la base al subir.
- **Los candados de tabla son firmes:** nombre único normalizado (`productos_referencia_clave_unica`, excluye rechazados), `productos_marca_proveedor_fk`, `variantes_identidad_unica` (NULLS NOT DISTINCT), `variantes_identidad_solo_por_funcion`, `variantes_sin_mezcla_de_color`, `variantes_talla_con_prendas_no_se_retira`, el costo solo editable hasta la primera compra `[producción-agente]`.
- **Control de versión en Editar (ADR-0193):** la RPC hace `FOR UPDATE` filtrando por versión y responde PT409; la pantalla bloquea el guardado y ofrece recargar.
- **Guardar en dos tiempos (ADR-0257):** barra «Tienes N cambios sin guardar» y hoja «Revisa y guarda» con lo que cambia antes de aplicarlo.
- **Eliminar:** `EliminarProductoModal.tsx:58-69` pregunta primero a `fn_producto_como_eliminar` y nunca ofrece un botón que la base va a rechazar; el Admin borra con historia (`20260928230000:266`, `lock_timeout` de 3 s, respaldo en `respaldo_purgas.filas`); ventas, compras y traslados nunca se borran desde la web.
- **Degradan sin perder nada:** el quitafondos corre en el navegador y, si falla o no hay red, la foto se ofrece «con fondo» (`lib/preparar-foto.ts:155`); la comprobación de nombre tiene corte de 6 s y avisa «no se pudo comprobar» (la base vuelve a revisar al guardar).
- **Permisos alineados:** el candado real es `fn_puede_editar_catalogo()` en la RPC y en las políticas; la pantalla usa `editarCatalogo`. El **costo** solo lo ve quien ve el dinero de compras (`revoke select` de `variantes.costo` `[producción-agente]`).
- **Precio y costo editables solo donde corresponde:** el líder corrige color y talla de una variante ya vendida; la colaboradora no.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 8 | Cuatro preguntas con la prenda a la derecha: claro y coherente; el editor es largo | `[visto]` |
| Lógica de negocio | 7,5 | Reglas firmes en la base; precio 0 y costo 0 solo se cuidan en la pantalla | `[producción-agente]` `[código alta-producto.ts:221]` |
| Arquitectura | 7,5 | Alta atómica e idempotente; editar en tres transacciones y con «reemplaza todo» | `[código ProductoForm.tsx:665,686]` |
| Funciones | 7 | Falta poder habilitar un patrón desde el editor; el historial omite la creación | `[código]` |
| Utilidad | 7 | Un alta de 5 tallas × 3 colores: ~15 toques y ~20 datos; dos dudas reales | `[código]` `[inferido]` |
| Conexión con el ERP | 8 | Alimenta Existencias, Vender, Compras, Etiquetas y Análisis | `[código]` |

### Estética (8)
- `[visto]` **Alta:** encabezado con la vuelta «← Productos», «Cuatro preguntas sobre la prenda que tienes en la mano. A la derecha la ves tal como va a quedar», tarjeta de la pregunta activa y, a la derecha, la ficha previa («código, Sin nombre, Variantes, Hoy en tienda, Precio») y la lista de los cuatro pasos. Las familias se ofrecen como tarjetas grandes (Indumentaria, Accesorios, Bisutería, «Ver más»).
- `[visto]` **Editor:** franja roja «Pendiente de revisar — se dio de alta al vuelo durante un conteo…» con «Eres admin: no necesitas autorización» y Rechazar/Aprobar; campos en caja, muestra de tejido, «Sin patrón», Estado (Activo/Descontinuado), Stock mínimo, «Temporada por color». Denso pero ordenado.
- `[visto]` A 1024 px el nombre de la familia «Accesorios y Complementos» llega al borde de su tarjeta (`nuevo`); solo estético.
- Rojo dentro de norma.

### Lógica de negocio (7,5)
- Regla violada #1: CLAUDE.md principio 2 y criterio global exigencia 4 (estados imposibles primero): un precio 0 activo debe ser imposible en el esquema, no en el formulario.
- Regla violada #2: principio 4 (una sola fuente de verdad): el formulario, la RPC y el censo (`censo_crear_variante`) son **tres caminos de alta** con reglas parecidas escritas tres veces.
- **Solo en la RPC:** que la talla sea de la categoría; tejido y patrón exigidos y habilitados; color activo; la confirmación de «una letra»; cantidades 0–9999; que la carga inicial sea solo para prendas sin movimientos. **Solo en la pantalla:** precio > 0, al menos una talla, el Enter que no envía. Marca y proveedor *activos*: la llave solo prueba que la pareja exista.
- Cambiar la categoría de un producto no revisa las tallas de sus variantes existentes.
- El **costo vacío se guarda como 0** y ese 0 alimenta el margen y el valor del inventario; el disparador `variantes_costo_hasta_la_primera_compra` lo deja corregible hasta la primera compra.

### Arquitectura (7,5)
- **Transacciones (dónde empieza y termina):** alta = una (`crear_producto_con_stock_inicial`); editar = tres seguidas (datos/variantes/correcciones/fotos → etiquetas de variantes → temporadas por color); eliminar = una.
- **Fuera de la transacción del alta:** las fotos suben después, una por una, con un solo insert (`NuevoProductoForm.tsx:522-543`): si una falla, el producto queda sin ella y la pantalla dice cuál; si falla el insert, quedan archivos huérfanos en el bucket público; **si se cierra la pestaña a media subida se pierden** (solo viven en memoria). Marca, proveedor, color, talla, tejido, patrón y etiqueta creados «al vuelo» se escriben al instante y no se deshacen al cancelar.
- **Concurrencia:** mismo nombre — el pre-chequeo no está serializado y lo cierra el índice único; quien pierde la carrera recibe un 23505 traducido, pero el formulario **no vuelve al paso 2** (solo lo hace con el hint de la RPC, `NuevoProductoForm.tsx:507-515`). Editar — ver objeción 3. El correlativo del código es atómico.
- **Volumen:** el alta hoy escribe 1 producto + hasta 15–60 variantes + sus movimientos en una transacción; el censo cargará del orden de cientos de modelos `[no verificable]`; con 100 modelos por hora en hora pico no hay contención observable (bloqueo por token, no por tabla).
- **Caída externa:** quitafondos (CDN jsdelivr, modelo de 26 MB la primera vez por equipo) → «con fondo»; storage → foto fallida y producto creado; RPC con 5xx o sin red → cola con el mismo token. **No degrada:** `getContextoAlta` usa `exigir` también para las «variantes recientes», que solo son una sugerencia (`alta-producto-datos.ts:103`): si esa lectura falla, se cae toda la pantalla de alta.
- **Lectura del historial:** un hallazgo de acceso a datos se entrega a Felipe aparte, no en este archivo (repo público); ver §10.

### Funciones (7)
- **Existen y funcionan:** alta de cuatro pasos con vista previa y matriz de tallas × colores, fotos con quitafondos, stock de hoy, «Crear otro parecido», cola sin red, editor con barra de cambios y hoja de confirmación, corregir color y talla mientras no haya historia, aprobar/rechazar una prenda «pendiente de revisar», historial, eliminar (líder y admin).
- **Engañosas:** ver objeción 6; el error «Solo un líder puede dar de alta…» cuando ya puede un rol con Productos o Atributos completo.
- **Faltan:** habilitar un patrón o tejido desde el editor; historial de la creación y del nombre; aviso del precio atípico entre tallas (una blusa con una talla a S/10.00 entre tallas de S/79.90 `[visto]`); cargar stock inicial al **agregar** una variante en Editar (nacen «sin unidades», `variantes-ficha-reglas.ts:1074`).
- **Sobran:** el componente `FotosAlta` (nadie lo renderiza, `alta-producto/FotosAlta.tsx:35`), `frecuentes` de `ordenarColores`, `usoColores`, la rama `!producto` de `ProductoForm` (unos 31 `producto?.` vestigiales).

### Utilidad — persona sin contexto (7)
Escenario real: *dar de alta un modelo con 5 tallas y 3 colores y su stock de hoy.*
1. «+ Nuevo producto» → paso 1: dos toques (familia y categoría).
2. Paso 2: nombre; abrir el buscador y elegir la pareja marca·proveedor; un tejido y un patrón; «Seguir →».
3. Paso 3: tres colores y «Seguir →» (las tallas ya vienen marcadas por la curva de la categoría).
4. Paso 4: precio y costo; «Llenar todas con…» (2 acciones) o 15 celdas a mano; «¿Dónde están?» (por defecto almacén); responsable; «Crear». **~15 toques y ~20 datos.**
- **Dónde duda o se equivoca:** (a) marca versus proveedor: un error de pareja aparece recién en la base; (b) tejido y patrón obligatorios: para «Liso» hay que saber elegir «Liso»; (c) si la curva de la categoría no es la suya, «+ Otra talla» o crear un color escriben en el catálogo de todas las sedes al instante y no se deshacen si cancela; (d) cantidad vacía es 0 y una celda tachada «no existe»; (e) para colgar en el piso hace falta el módulo «Bajada al piso»; (f) con precios distintos por celda no se ven los precios en la vista de cantidades; (g) las fotos van una por una por la revisión del quitafondos.
- El costo vacío guarda 0 sin avisar.

### Conexión con el ERP (8) — ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Es la raíz de toda analítica: categoría, marca, tejido, patrón, temporada, precio y costo nacen aquí |
| Dinero y stock que toca | ×1 | 7 | Fija el precio y el costo de cada prenda y, con stock inicial, crea los primeros movimientos |
| Frecuencia y personas que la usan | ×1 | 5 | Pocas altas por día tras el censo; muchas ediciones puntuales |
| Qué se detiene si falla | ×1 | 9 | Sin alta no hay producto, y sin producto no hay venta, conteo ni compra |

Relevancia = (2·9 + 7 + 5 + 9) / 5 = **7,8** — Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** Categorías (ejes y curva), Marcas/Proveedores (pareja), Atributos (colores, tallas, tejidos, patrones, etiquetas, temporadas), Existencias (`fn_cargar_stock_inicial` exige tienda activa, permiso de operar y prenda sin movimientos).
- **Aguas abajo:** Productos (listado), Existencias, Vender (busca y vende), Compras (proveedor), Etiquetas de precio (el paso final ofrece imprimirlas, #601), Análisis, historial. El **censo** (`censo_crear_variante`) es un tercer camino de alta que crea prendas «pendientes de revisar».
- **Pájaro dueño y vecinos:** 02 Loro (catálogo). Vecinos: Existencias, Compras y Ventas.
- **Externos, y qué pasa si caen:** jsdelivr (quitafondos), Supabase Storage (fotos). Se degrada así: sin CDN la foto sale «con fondo»; sin storage el producto se crea sin foto y se completa en `/editar#fotos`; sin red el alta queda en la cola del navegador con su token, no se pierde el dato.

## 7 · Las 12 tareas, por importancia

### #1 · Reconstruir — Que un precio 0 activo sea imposible en la base
- **Dónde:** `variantes` (`variantes_precio_check`: `precio >= 0`); `crear_producto_con_variantes`, `crear_producto_con_stock_inicial`, `censo_crear_variante`; `alta-producto.ts:221-222` (la regla que hoy vive solo aquí).
- **Por qué en este puesto:** mañana entra el catálogo por lotes, sin formulario. Una fila con precio vacío o 0 nace activa, y no hay prueba de que Vender la rechace. Es el único punto de la lista que puede dañar dinero y tiene fecha.
- **Cómo lo verificas tú:** `update retail.variantes set precio = 0 where activo` falla con mensaje claro; cargar por la RPC una prenda con precio 0 devuelve «Pon el precio de venta»; el producto centinela (precio 0, inactivo) no se ve afectado.
- **Esfuerzo / dependencias:** M · migración con `retail.` y **confirmación de Felipe antes de pegarla** · **antes del censo**.
- **DECIDÍ:** un `CHECK (precio > 0 or not activo)` en la tabla más el mismo rechazo en las tres RPC de alta. **DESCARTÉ:** un `CHECK precio > 0` a secas, porque el centinela y «Monto manual» tienen precio 0 e inactivos a propósito; y validar solo en las RPC, porque el cargador del censo y `censo_crear_variante` son caminos que podrían saltárselo. **SE ROMPE SI:** hace falta regalar una prenda o una muestra a S/0: eso debe ser un descuento del 100 % en la venta, no un precio 0 en el catálogo.

### #2 · Eliminar/fusionar — Los tres caminos de alta pasan por las mismas reglas
- **Dónde:** `crear_producto_con_variantes` (base `20260918231100:68`), `crear_producto_con_stock_inicial` (`20260928100000:652`), `censo_crear_variante`; el cargador del censo (pendiente de la auditoría, «cargador del censo físico»).
- **Por qué en este puesto:** tres caminos con reglas escritas tres veces es cómo termina una marca comodín, un tejido vacío o un precio 0 entrando por el que nadie revisó (Brooks).
- **Cómo lo verificas tú:** la misma prenda mal formada (sin precio, marca desactivada, talla fuera de la categoría) es rechazada con el mismo mensaje por los tres caminos.
- **Esfuerzo / dependencias:** M · junto con la #1 y con las decisiones D3–D5 de la auditoría (tejido vacío, marca desconocida).

### #3 · Reconstruir — Editar no borra lo que no recibe, y el control de versión cubre todo
- **Dónde:** `catalogo_actualizar_producto` (base `20260918231100:395`, más parches `20260923193700`, `20260924160000:118`, `20260928235500`, `20260929045000`); `p_version_esperada` (hoy opcional); fotos (`p_fotos` reemplaza todo); `cambiar_estado_productos`.
- **Por qué en este puesto:** un formulario abierto desde hace una hora puede borrar fotos recién subidas o dejar en blanco el stock mínimo; y el mismo producto lo tocan varias personas durante el censo.
- **Cómo lo verificas tú:** abrir «Editar» en dos pestañas, subir una foto en la A y guardar la B: la B responde «cambió mientras editabas» y no borra la foto.
- **Esfuerzo / dependencias:** L · parche por ancla sobre una función con cinco capas de historia: **la C1 de la auditoría del 29-sep (una sola fuente legible del SQL vivo, `docs/backlog/2026-09-29-audit-sales-inventory-catalog-5ba247.md`) debería ir antes**.
- **DECIDÍ:** versión obligatoria (`p_version_esperada` NOT NULL) y que la versión suba también con fotos y etiquetas; campos no enviados se conservan. **DESCARTÉ:** «fusionar» los cambios de dos personas, porque con 3 tiendas y muy pocas ediciones simultáneas no compensa la complejidad; el costo es volver a teclear lo que se perdió. **SE ROMPE SI:** un cliente antiguo (la caja en tablet sin recargar) sigue mandando sin versión: la RPC debe responder «recarga la pantalla», no fallar en silencio.

### #4 · Reconstruir — Guardar todo el editor en una sola transacción
- **Dónde:** `ProductoForm.tsx:665` (`actualizar_variantes_etiquetas`), `:686` (`asignar_temporadas`), y la primera llamada `catalogo_actualizar_producto`.
- **Por qué en este puesto:** si la pestaña se cierra entre la 1.ª y la 2.ª llamada, las etiquetas de las variantes nuevas y la temporada por color no se aplican y la pantalla ya dijo «guardado» (`hayQueRecargar` lo cuenta, pero solo mientras la pestaña siga abierta).
- **Cómo lo verificas tú:** forzar un error en las etiquetas y comprobar que **ninguno** de los tres cambios queda aplicado.
- **Esfuerzo / dependencias:** M–L · **no antes de la #3** (mismo cuerpo de función).
- **DECIDÍ:** una sola RPC `catalogo_guardar_producto` que envuelve las tres. **DESCARTÉ:** dejar tres llamadas y reintentar desde la cola, porque un cierre de pestaña pierde la cola (localStorage) y el usuario no sabe qué falta. **SE ROMPE SI:** una de las tres es lenta (asignar temporadas «hasta 500» prendas) y alarga la transacción: mantenerla fuera del camino común y llamarla solo si la persona la usó.

### #5 · Corregir — Habilitar un patrón o tejido desde el editor, sin salir a Categorías
- **Dónde:** `ProductoForm.tsx` (campos Tejido y Patrón, mensaje «habilítalos en Catálogo → Categorías»); `alta-producto/ConfigurarCategoria.tsx` (ya lo hace en el alta); `catalogo_actualizar_producto` (rechazo por tejido/patrón no habilitado, `20260918231100:508-517`).
- **Por qué en este puesto:** obliga a salir de la pantalla y a tener otro permiso para poder guardar; y es la misma trampa que aparece «Fuera de esta pantalla» en Categorías y Atributos.
- **Cómo lo verificas tú:** en «Blusa Emma», «Habilitar Cuadros para Camisas y Blusas» aparece junto al campo y, tras aceptarlo, se puede guardar sin salir del editor.
- **Esfuerzo / dependencias:** S–M · junto con `productos-categorias.md` #2 (guardar la categoría y sus ejes de una vez).

### #6 · Mejorar — Las fotos no se pierden ni quedan huérfanas
- **Dónde:** `NuevoProductoForm.tsx:522-543` (suben después, una por una, en memoria); `FotosProducto.tsx:124` (en editar suben al elegirlas); `lib/producto-fotos.ts`.
- **Por qué en este puesto:** cerrar la pestaña a media subida pierde las fotos; si falla el insert quedan archivos huérfanos en un bucket público; y hay dos estrategias distintas (alta diferida con IndexedDB, editar inmediata) para lo mismo.
- **Cómo lo verificas tú:** cerrar la pestaña con 3 fotos en cola y reabrir: siguen en la cola; ningún archivo del bucket queda sin fila en `producto_fotos` tras un fallo.
- **Esfuerzo / dependencias:** M · después de la #3 (las fotos entran al control de versión).

### #7 · Mejorar — Un historial que cuente la vida completa del producto
- **Dónde:** `fn_registrar_cambio_producto` (base `20260918231000`, parches `20260923100000`, `20260927190000:123`, `20260928235500`, `20260929045000`); `lib/historial-producto-reglas.ts:36-51`; `historial_producto_cambios` (hoy solo cinco tipos de campo `[producción-agente]`).
- **Por qué en este puesto:** no dice quién creó un producto ni quién le cambió el nombre, el tejido, el patrón, el stock mínimo o las fotos; y la etiqueta «queda a su nombre» promete más de lo que se cumple. Es la misma falta que en Marcas y en Atributos: una **raíz compartida** (raíz R1 de `catalogo-plan-de-ataque.md`).
- **Cómo lo verificas tú:** crear un producto sin stock y ver en «Historial» «Creado por [responsable], hoy 14:05»; renombrarlo y ver el cambio.
- **Esfuerzo / dependencias:** M · después del diseño único de historial (raíz R1 del plan).

### #8 · Corregir — Que las etiquetas digan lo que la pantalla hace
- **Dónde:** `NuevoProductoForm.tsx:969` («Quién lo registra…»), `:417` (costo «Opcional» → 0), `:721` y `ProductoForm.tsx:878` (`puedeCrear` fijo `true`); `crear_producto_con_variantes` (`20260918231100:104`, el error «Solo un líder…»); la vista de cantidades que esconde los precios por celda.
- **Por qué en este puesto:** cada una es una promesa que la base no cumple; el costo 0 sin aviso inventa un margen de 100 %.
- **Cómo lo verificas tú:** dejar el costo vacío muestra «Sin costo» en el margen (no 100 %); el error de permiso dice quién sí puede; el rótulo de «Quién lo registra» dice cuándo se guarda.
- **Esfuerzo / dependencias:** S · ninguna.

### #9 · Corregir — Que el alta no se caiga por una sugerencia, y que el nombre duplicado vuelva al paso 2
- **Dónde:** `alta-producto-datos.ts:103` (`exigir` de las «variantes recientes»); `NuevoProductoForm.tsx:507-515` (solo con el hint de la RPC vuelve al paso 2; con un 23505 traducido no); `lib/error-escritura.ts:110`.
- **Por qué en este puesto:** una lectura que solo alimenta una sugerencia puede tumbar toda la pantalla, y quien pierde la carrera del nombre queda en el paso 4 sin saber dónde corregir.
- **Cómo lo verificas tú:** forzar un fallo en «variantes recientes»: el alta carga igual; crear dos veces «Blusa Emma» a la vez: la segunda vuelve al paso 2 con «ya existe».
- **Esfuerzo / dependencias:** S.

### #10 · Eliminar/fusionar — Una sola matriz de variantes y un solo selector de tallas
- **Dónde:** `MatrizVariantes`, `MatrizCantidades` y `MatrizNuevas` (`ficha-producto/piezas.tsx:151`, que importa `RAYADO_FUERA` del alta); `ElegirTallas` del alta contra `AgregarTallasModal` de la ficha.
- **Por qué en este puesto:** tres tablas y dos selectores para lo mismo divergen con cada cambio (dos ADR seguidos, 0258 y 0263, ya tocaron los dos lados).
- **Cómo lo verificas tú:** cambiar una regla de celda tachada en un solo archivo la cambia en el alta y en la ficha.
- **Esfuerzo / dependencias:** L · después de la #4.

### #11 · Replantear — ¿La «ficha» de un producto existe, o `/editar` hace de ficha?
- **Dónde:** no existe `/productos/[id]` ni `@modal/(.)[id]/page.tsx`; la ficha son `FichaVariantes` (Tabla), `VistaRapidaModal` (Grilla) y `/editar` (`lib/useColaProductos.ts:29`, «Ver la ficha»).
- **Por qué en este puesto:** leer y escribir están entrelazados (Hickey): para saber cuánto vendió una prenda, cuánto hay y a quién se pide, hay que abrir un editor. No es un defecto, es una decisión de rumbo.
- **Cómo lo verificas tú:** — (pide una decisión).
- **Esfuerzo / dependencias:** L según la respuesta · después de la #4.
- **DECIDÍ:** proponerle a Felipe una **ficha de solo lectura** por producto (fotos, variantes con stock por sede, ventas de 30 días, marca y proveedor, historial resumido) y dejar `/editar` solo para escribir. **DESCARTÉ:** seguir con la vista rápida y el editor como ficha, porque cada uno tiene contenido distinto (la Grilla no tiene historial, la Tabla sí) y quien decide compras necesita ventas y stock juntos. **SE ROMPE SI:** se construye antes de que exista catálogo real y ventas: una ficha con ceros no le sirve a nadie.

### #12 · Eliminar/fusionar — Código muerto y comentarios viejos · *bajo valor / opcional*
- **Dónde:** `FotosAlta.tsx:35` (nadie lo renderiza), `frecuentes` y `usoColores`, la rama `!producto` de `ProductoForm.tsx`; comentarios que citan la RPC retirada `catalogo_crear_producto` (`lib/producto-fotos.ts:14-16`, `FotosProducto.tsx:14`, `alta-producto-datos.ts:23`); `historial-producto.ts:11` («no tienen updated_at»); las filas viejas de `SESIONES-ACTIVAS.md`.
- **Por qué en este puesto:** no dañan datos; engañan a la próxima persona que los lea.
- **Cómo lo verificas tú:** `grep -R catalogo_crear_producto apps/web` solo encuentra el ADR; `ProductoForm.tsx` no contiene `producto?.`.
- **Esfuerzo / dependencias:** S–M.

## 8 · Estrategia alternativa
La de la #11. **Ganas:** el ciclo de vida se separa en leer (ficha) y escribir (editar y alta); cada una es más simple, y la ficha sirve a quien decide compras. **Pagas:** una pantalla más y decidir qué muestra la ficha. **No cambia** el alta de cuatro pasos ni el guardado en dos tiempos. Decide Felipe.

## 9 · Referentes de ERP y futuro
- *(De memoria, no verificado)* Shopify separa la vista del producto de su edición; Odoo tiene la ficha del producto con pestañas (inventario, ventas, compras) sobre el mismo formulario. Con 3 tiendas y un taller alcanza con una ficha corta.
- **Futuro (no cuenta entre las 12):** duplicar un producto con otro color; importar catálogo por hoja (ya en el plan del censo); versiones de precio con vigencia.

## 10 · Fuera de esta pantalla
**Hay un hallazgo de acceso a datos que Felipe recibe en el chat y no está en este archivo:** el repo es público y el detalle no se publica mientras siga abierto. Está relacionado con el historial de producto.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:productos-ciclo-de-vida]` #1 Precio 0 activo imposible en la base — M (antes del censo)
- [ ] `[pantalla:productos-ciclo-de-vida]` #2 Los tres caminos de alta con las mismas reglas — M
- [ ] `[pantalla:productos-ciclo-de-vida]` #3 Editar no borra lo que no recibe; versión obligatoria y completa — L
- [ ] `[pantalla:productos-ciclo-de-vida]` #4 Guardar el editor en una sola transacción — M–L
- [ ] `[pantalla:productos-ciclo-de-vida]` #5 Habilitar patrón/tejido desde el editor — S–M
- [ ] `[pantalla:productos-ciclo-de-vida]` #6 Fotos que no se pierden ni quedan huérfanas — M
- [ ] `[pantalla:productos-ciclo-de-vida]` #7 Historial de la vida completa del producto — M
- [ ] `[pantalla:productos-ciclo-de-vida]` #8 Etiquetas que digan lo que se hace (costo vacío = «Sin costo») — S
- [ ] `[pantalla:productos-ciclo-de-vida]` #9 El alta no se cae por una sugerencia; duplicado vuelve al paso 2 — S
- [ ] `[pantalla:productos-ciclo-de-vida]` #10 Una sola matriz y un solo selector de tallas — L
- [ ] `[pantalla:productos-ciclo-de-vida]` #11 Decidir: ¿ficha de solo lectura aparte del editor? — L
- [ ] `[pantalla:productos-ciclo-de-vida]` #12 Código muerto y comentarios viejos — S–M (bajo valor)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Alta | Paso 1 «¿A qué categoría pertenece?» | Elige familia y categoría; pasa sola | bien | `[visto]` |
| Alta | Paso 2 «¿Cómo es?» | Nombre, marca+proveedor, tejido, patrón | ajustar (marca vs proveedor confunde) | `[código NuevoProductoForm.tsx]` |
| Alta | Paso 3 «Tallas y colores» | Matriz y fotos | ajustar (crear «al vuelo» sin deshacer) | `[código]` |
| Alta | Paso 4 «Cuánto cuesta y cuántas hay» | Precio, costo, cantidades, dónde, responsable | **ajustar** (costo vacío = 0; precio 0 solo en pantalla) | `[código alta-producto.ts:221]` |
| Alta | Ficha previa a la derecha | Muestra cómo quedará | bien | `[visto]` |
| Alta | Cola sin red y token | Reintento seguro | bien | `[código :462-501]` |
| Alta | «Imprimir etiquetas» al terminar | #601 | bien | `[código ProductoCreado.tsx]` |
| Editar | Franja «Pendiente de revisar» | Aprobar/rechazar alta al vuelo | bien | `[visto]` |
| Editar | Patrón sin habilitar | Manda a Categorías | **ajustar** | `[visto]` |
| Editar | Barra «Tienes N cambios» + hoja | Guarda en dos tiempos | bien | `[código BarraDeCambios.tsx]` |
| Editar | Guardado (3 RPC) | Datos, etiquetas, temporadas | **ajustar** (tres transacciones) | `[código ProductoForm.tsx:665,686]` |
| Historial | Página y modal | Lista de cambios | ajustar (omite creación, nombre, tejido…) | `[producción-agente]` |
| Eliminar | Modal que pregunta primero | Pregunta a la base | bien | `[código EliminarProductoModal.tsx:58-69]` |
| — | Ficha de solo lectura | No existe | falta (decisión) | `[código]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-29 | completo, flujo (código + producción por agente + recorrido visual) | 5,0 (tope) | 7,8 (Soporte) | — (primer análisis del ciclo de vida; algunas piezas se tocaron en `productos.md`, `catalogo-inventario.md` y `atributos.md`) |
