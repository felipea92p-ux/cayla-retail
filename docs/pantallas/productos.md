# Pantalla — Productos, listado (`/productos`, vistas Grilla y Tabla)

> Modo: completo (re-análisis) · Fecha: 2026-09-29 · Rol/sede: líder y admin, Tienda Lima (local; la pantalla sí depende de la sede: «En tu sede») · Datos: **real** — consultas de solo lectura a producción hechas por el agente en la sesión (no las corrió Felipe; el apéndice de `catalogo-plan-de-ataque.md` las lista para que las confirme) y recorrido visual en local (10 productos de siembra; **producción tiene 2 productos, y uno es el centinela que esta pantalla esconde**)
> SHA analizado: `38f9d7ce` (origin/main; el código se leyó en `123bb733` y entre los dos solo cambió `alta-producto/ProductoCreado.tsx`). Si cambian `productos/page.tsx`, `ProductosGrilla.tsx`, `ProductosTabla.tsx`, `FiltrosProductos.tsx`, `lib/catalogo-v2.ts`, `lib/productos-stock.ts`, `lib/productos-vista.ts` o `fn_productos*` (`20260929020000`), este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/{page,layout}.tsx` · `@modal/` · `components/ProductosGrilla.tsx` · `components/ProductosTabla.tsx` · `components/FiltrosProductos.tsx` · `components/AQuienPedirle.tsx` · `components/Paginacion.tsx` · `components/EliminarProductoModal.tsx` · `lib/catalogo-v2.ts` · `lib/productos-stock.ts` · `lib/productos-vista.ts` · `lib/useStockEnSede.ts` · RPC `fn_productos`, `fn_productos_resumen`, `fn_productos_buscar`, `fn_existencias_productos`, `cambiar_estado_productos` · tablas `productos`, `variantes`, `stock`, `producto_fotos`, `marcas`, `proveedores`, `categorias`
> Otra sesión tocándola: **no directamente.** Las filas 20, 21 y 25 de `docs/SESIONES-ACTIVAS.md` nombran `ProductosAgrupados.tsx` y `productos-margen.ts`, que **ya no existen** (ramas fusionadas): filas viejas.
> **Re-análisis.** El anterior (`518132fb`, 2026-09-21) estaba **vencido** (68 commits desde entonces; `ProductosAgrupados.tsx` se reemplazó por `ProductosTabla.tsx`; ADR-0254 quitó las cifras de la cabecera; ADR-0270 cambió la cifra de stock) y no se tomó como base. Las tareas abiertas de `catalogo-inventario.md` (2026-09-28) siguen vigentes y **no se repiten aquí**: #1, #6, #8–#12.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción-agente]` consulta de solo lectura del 2026-09-29 · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
La pantalla ya dejó de mentir en lo grande: la cifra de stock es una sola en la base (ADR-0270, en producción desde el 28-sep) y la cabecera ya no muestra cifras que se contradigan. Lo que queda son **tres números que aún salen de caminos distintos** (Grilla «En tu sede», Tabla «Stock» sin rotular y la vista rápida leyendo la tabla cruda), un panel de reposición («A quién pedirle») que **se calcula caro, subcuenta sin avisar y puede tumbar la pantalla entera**, y un catálogo que mañana se llena con cientos de prendas **sin foto** y se verá como una pared de perchas.
**Cumple su finalidad:** 6,9/10 · **Relevancia:** 6,8/10 — Soporte (es la pantalla del catálogo que más gente abre)

## 1 · Finalidad declarada
"Esta pantalla existe para que CAYLA sepa qué prendas tiene (modelo → talla → color), a qué precio, de qué marca y proveedor, cuánto hay en su sede y a quién pedirle lo que se agota." Fuente: ADR-0077 (grilla), ADR-0109 (marca y proveedor), ADR-0254 (tabla para todos y cabecera de Ventas) y ADR-0270 (una sola cifra); `docs/datos/modulos/02-catalogo-y-vocabulario.md` avisa que describe V1 y no se cita como vigente. **No la captura.** ¿Docs y pantalla coinciden? **Casi:** la frase de la cabecera (`productos-stock.ts:31`) dice «Aquí es lo que se puede vender en la sede elegida» y solo la Grilla lo cumple; la Tabla y la vista rápida no lo rotulan igual. `SESIONES-ACTIVAS.md` está desactualizado en tres filas. Ninguna D-nn cubre el umbral de margen «sano».

## 2 · Objeción
1. **Todavía hay tres caminos para «cuánto hay».** La Grilla dice «Stock total 118 / En tu sede: 32» (de `fn_existencias_productos`, la cifra única); la Tabla dice solo «Stock 118» sin decir de qué universo `[visto]`; y la vista rápida y la ficha de la Tabla leen la tabla `stock` cruda con `useStockEnSede.ts`, que sigue en la lista LEGADO de la guardia (`lib/stock-una-sola-cifra.test.ts:22-23`) y cuenta apartadas, dañadas, tallas retiradas y pruebas (`ProductosTabla.tsx:673,688`, `ProductosGrilla.tsx:286`). La misma prenda puede decir 32 en la tarjeta y otro número al abrirla.
2. **«A quién pedirle» se calcula mal y sale caro.** `getResumenProductos` (`page.tsx:80`) corre `fn_productos_resumen` en cada carga **solo para un `> 0`** (`page.tsx:93`); es la función más cara (340 ms con 3 000 productos, medido en la migración `20260929020000:26-31`) y si cae, `exigir` tumba toda la pantalla. Además, `getReposicionPorProveedor` lee como máximo 3 páginas de 100 filas (`catalogo-v2.ts:392-411`): con más de 300 variantes por reponer **subcuenta sin avisar**, justo cuando el catálogo real sea grande. Y el clic en el panel hace `router.push` y **pierde la vista, la búsqueda y los demás filtros** (`AQuienPedirle.tsx:22`).
3. **El catálogo de mañana se va a ver mal en la Grilla.** El censo carga cientos de prendas sin foto. La tarjeta sin foto muestra un perchero y la etiqueta «MUESTRA — BEIGE» `[visto]`, que se lee como si el producto fuera una muestra. No hay filtro «Sin foto» ni contador de las que faltan.
4. **«Editar» se ofrece a quien no puede.** La vista rápida (`ProductosGrilla.tsx:372`) lo muestra a todos y `editar/page.tsx:29` rebota en silencio a `/productos`. La Tabla sí lo condiciona; la Grilla no. Es un error del diseño, no de la persona.
5. **Un mismo margen tiene tres umbrales:** 30 % en el alta (`alta-producto.ts:81-86`), 45 % «provisional» en esta pantalla (`productos-vista.ts:66`, la leyenda «bajo 45 %» `[visto]`) y 40/60 % en Producción. Ninguna decisión escrita dice cuál es el margen sano.
6. Trade-off: no rehagas la cifra de stock (ya está en la base y protegida por 3 pruebas); cierra los tres caminos restantes con el mismo mecanismo. Antes del censo, lo urgente es #1 y #5 (fotos); el panel de reposición (#2) puede esperar a que haya ventas.

## 3 · Lo que está bien y no se toca
- **Una sola cifra de stock en la base:** `fn_existencias_base` y `fn_existencias`; «N aquí» de la tarjeta sale de `fn_existencias_productos` (`20260929020000:388`), con guardia `lib/stock-una-sola-cifra.test.ts` y pruebas `fn-existencias` 15/15, `catalogo-cifra-unica` 14/14. ADR-0270, en producción.
- **Cabecera honesta:** ADR-0254 quitó las cifras que se contradecían; la frase dice qué mira cada número.
- **El servidor pagina y cuenta** (24 por página, `catalogo-v2.ts:210`; tope de 100 en SQL): no hay N+1; con 3 000 productos y 90 000 filas de stock, lista sin filtro 44 ms y con filtro de stock 270 ms (medido en la migración). Hoy son 2 productos.
- **El producto centinela no aparece:** `fn_productos` lo excluye por uuid (`c_cargo_especial`, `20260929020000:69,98`).
- **Costo y margen protegidos en la base:** `revoke select` de `variantes.costo` para `authenticated` `[producción-agente]` y `case` en `fn_productos` (`:234`); la Tabla solo los muestra a quien ve el dinero de compras.
- **Candados de tabla que ya existen:** `productos_estado_check`, `productos_rechazado_descontinuado_check`, marca y proveedor NOT NULL con llave compuesta, `productos_referencia_clave_unica`, `variantes_identidad_unica` (NULLS NOT DISTINCT), `variantes_talla_con_prendas_no_se_retira`, `variantes_sin_mezcla_de_color` `[producción-agente]`.
- **Eliminar es de lo mejor construido:** `EliminarProductoModal.tsx:58-69` pregunta primero a `fn_producto_como_eliminar` y **nunca ofrece un botón que la base va a rechazar**; el Admin puede borrar con historia y queda respaldo en `respaldo_purgas.filas`.
- **Filtros y búsqueda en la URL** con espera de 350 ms; búsqueda por código de barras exacto; paginación con «página X de Y».
- **Acciones en bloque con RPC** (`cambiar_estado_productos`, `:905`) y confirmación con lista de lo que cambia.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Grilla y Tabla coherentes; cabecera con un párrafo de cinco líneas; perchero con «MUESTRA» | `[visto]` |
| Lógica de negocio | 7 | Cifra única lista, tres caminos por cerrar; tres umbrales de margen | `[código]` `[visto]` |
| Arquitectura | 6,5 | Un `> 0` cuesta 340 ms y puede tumbar la pantalla; reposición subcuenta | `[código page.tsx:80,93]` `[código catalogo-v2.ts:397]` |
| Funciones | 6,5 | «Editar» a quien no puede; Grilla sin historial ni estado en bloque; sin filtro «Sin foto» | `[código ProductosGrilla.tsx:372]` |
| Utilidad | 6,5 | El caso «encontrar una prenda en mostrador» funciona; el caso «catálogo nuevo sin fotos» no | `[visto]` `[inferido]` |
| Conexión con el ERP | 8 | Catálogo → Existencias, Vender, Compras, Etiquetas, Análisis | `[código]` |

### Estética (7)
- `[visto]` Encabezado de módulo (`<EncabezadoPagina>`: sede y fecha, título de 46 px, frase), toggle Grilla/Tabla, «+ Nuevo producto», franja «10 prendas sin temporada · Completar», buscador y «Filtros». La Grilla usa tarjetas con foto, marca·proveedor, precio, «Stock total N / En tu sede: N», colores.
- `[visto]` **La frase de cabecera es un párrafo de cinco líneas** con vocabulario interno («Sin stock y Stock bajo miran toda la empresa: de ahí sale qué pedirle al proveedor»). Una colaboradora nueva no lo lee.
- `[visto]` La tarjeta sin foto: perchero y «MUESTRA — <color>». Con datos reales sería la mayoría de la grilla.
- `[visto]` La vista rápida es limpia: tabla talla/color/precio/stock/código, cuatro botones (Editar, Etiquetas, Ver en Existencias, Eliminar). **Precio por talla sin alerta:** la misma blusa tiene tallas a S/79.90, una XL a S/10.00 y una XS a S/81.00 (dato de siembra); la pantalla no marca el atípico.
- Rojo dentro de norma `[visto]`.

### Lógica de negocio (7)
- Regla violada #1: ADR-0270 (una sola cifra) — tres caminos aún (objeción 1).
- Regla violada #2: principio 4 de CLAUDE.md (una sola fuente de verdad) — el umbral de margen vive en tres sitios; ninguna D-nn cubre el margen sano.
- Las alertas ignoran `es_prueba` en la tarjeta (`productos-stock.ts:40`) aunque el SQL la excluye del contador y del filtro: una prueba pinta «Sin stock» sin estar contada.
- **Reactivar en bloque salta la revalidación de marca y proveedor** en el camino de respaldo (`ProductosTabla.tsx:907`, `update` directo si falta la RPC); `fn_validar_marca_proveedor` no es un disparador, solo lo llaman las RPC.
- Un producto descontinuado con stock 0 no sale de las listas de alertas (ADR-0270, #11 de `catalogo-inventario.md`).

### Arquitectura (6,5)
- **Transacción:** las acciones en bloque son una RPC (`cambiar_estado_productos`), una transacción. El toast de éxito cuenta `ids.length`, no lo devuelto por la RPC (`ProductosTabla.tsx:916`).
- **Concurrencia:** dos personas descontinúan/reactivan en bloque el mismo producto: la RPC manda el último; sin control de versión aquí (el editor sí lo tiene, ADR-0193). Baja probabilidad.
- **Volumen (números):** hoy 2 productos (1 visible); tras el censo del orden de cientos de modelos y miles de variantes `[no verificable]`; en 3 años 3 000 productos / 90 000 filas de stock es el escenario medido: 44 / 270 / 340 ms. Cada carga hace 8–12 consultas en 3 rondas (`page.tsx`), sin N+1; la Grilla hace además un GET a `stock` de los 24 modelos al montar que ya no pinta nada (`ProductosGrilla.tsx:66`); la Tabla, uno por ficha abierta y otro tras cada refresh.
- **Caída externa:** ninguna dependencia externa. Se degrada así: si falla la lista o el resumen sale «No se pudo cargar… Reintentar» (`app/(app)/error.tsx`) y no se pierde ningún dato; si falla «A quién pedirle» desaparece sin aviso; si fallan las existencias la tarjeta pasa a «Stock total N» y la frase de la cabecera sigue diciendo «Aquí».
- **Buscar:** `fn_productos_buscar` usa `ILIKE` y no escapa `%` ni `_`: buscar «50%» trae casi todo; corre 2–4 veces por búsqueda. `router.push` (no `replace`) por cada pausa de tecleo: llena el historial del navegador.
- **URL:** «Etiquetas en bloque» mete todos los uuid en la URL: unos 3 KB hoy, más de 8 KB con curvas de 10 tallas.
- **Permisos:** el candado real de escritura es `fn_puede_editar_catalogo()`; la lectura de `productos` está abierta a cualquier sesión autenticada (`0004_rls.sql:29`); `fn_productos` y `fn_productos_resumen` no llaman a `fn_tiene_acceso_retail()` a diferencia de las `fn_existencias*`.

### Funciones (6,5)
- **Existen y funcionan:** Grilla y Tabla, búsqueda, once filtros, orden por precio, paginación, vista rápida, ficha de variantes en la Tabla, Editar/Existencias/Etiquetas/Historial, Descontinuar/Reactivar en bloque, Etiquetas en bloque, Eliminar. No hay botones fantasma (el «Archivar» falso ya no existe).
- **Engañosas:** «Editar» de la Grilla (rebote mudo); el texto de la hoja de estado habla de «Para pedir», que ya no existe como etiqueta, y lista «N en stock» con el total de la red, no «aquí» (`ProductosTabla.tsx:929-943`); el desplegable de proveedor dice «Todos · 1 proveedores» tras elegir uno.
- **Faltan:** filtro «Sin foto» y contador; aviso de precio atípico entre tallas; historial y estado en bloque en la Grilla (solo la Tabla los tiene).
- **Sobran:** `ResumenProductos` salvo `reponerDeProveedor`; `puntoReorden`, `leadTimeDias` y `categoriaId` de `ProductoListado`; el comentario de `catalogo-v2.ts:43`.

### Utilidad — persona sin contexto (6,5)
Escenario real 1: *la clienta pregunta si hay la blusa en talla M y la colaboradora busca en el celular.* Escribe «blusa» → aparece la Grilla → abre la vista rápida → ve «Stock en Tienda Lima: 32» y la talla M. Funciona. Duda: la tarjeta dice «Stock total 118 / En tu sede: 32» y la Tabla «Stock 118»; quien cambia de vista ve dos números para la misma prenda.
Escenario real 2: *primera mañana con el catálogo nuevo del censo.* La Grilla es una pared de perchas con «MUESTRA — BEIGE»; para encontrar una blusa hay que leer el nombre bajo cada perchero; no hay «Sin foto» para pedir que las suban. La Tabla lo resuelve mejor, pero no es la vista por defecto.
Escenario real 3: *un integrante abre «Editar».* Lo rebotan en silencio a la lista sin decir por qué.

### Conexión con el ERP (8) — ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Base de casi toda decisión de compra y exhibición; «A quién pedirle» lleva a Compras |
| Dinero y stock que toca | ×1 | 5 | No mueve stock, pero muestra precio y costo, y acciones en bloque cambian el estado de venta |
| Frecuencia y personas que la usan | ×1 | 8 | La abre casi toda la tienda todos los días |
| Qué se detiene si falla | ×1 | 7 | Sin ella no se encuentra una prenda ni se llega a Editar/Eliminar; Vender tiene su propio buscador |

Relevancia = (2·7 + 5 + 8 + 7) / 5 = **6,8** — Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** Categorías, Marcas y Atributos (los filtros y las tarjetas leen esos vocabularios); Nuevo producto y Censo (crean lo que aquí se lista); Existencias (la cifra única, `fn_existencias_base`).
- **Aguas abajo:** Editar producto (`/productos/[id]/editar`); Existencias (`/inventario?variante=`); Etiquetas de precio; historial de producto; Vender (busca por marca, `catalogo-v2.ts:127-156`); Compras vía «A quién pedirle».
- **Pájaro dueño y vecinos:** 02 Loro (catálogo). Vecinos: Existencias (stock), Compras (proveedor), Ventas (precio).
- **Externos, y qué pasa si caen:** ninguno. Se degrada así: nada externo de qué depender; si Supabase no responde la pantalla no carga y no se pierde ningún dato. Las fotos viven en storage: si falla, la tarjeta muestra el perchero.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — El mismo «cuánto hay» en Grilla, Tabla, vista rápida y ficha
- **Dónde:** `lib/useStockEnSede.ts` (sacarlo de la lista LEGADO de `stock-una-sola-cifra.test.ts:22-23`); `ProductosTabla.tsx:673,688` y `ProductosGrilla.tsx:286` (leer `fn_existencias` por producto); la columna «Stock» de la Tabla (rotular «Aquí» y «Red»).
- **Por qué en este puesto:** es lo que ADR-0270 vino a cerrar y dejó a medias; una colaboradora que cambia de vista o abre una prenda ve otro número, y decide una venta por él.
- **Cómo lo verificas tú:** para «Blusa Emma», la tarjeta, la fila de la Tabla, la vista rápida y la ficha dicen 32 «en tu sede»; la guardia `stock-una-sola-cifra.test.ts` ya no lista ningún archivo LEGADO de Productos.
- **Esfuerzo / dependencias:** M · ninguna.

### #2 · Reconstruir — «A quién pedirle»: correcto, barato y sin tumbar la pantalla
- **Dónde:** `page.tsx:80,93` (`getResumenProductos` solo para un `> 0`); `catalogo-v2.ts:392-411` (tope de 3 páginas × 100); `AQuienPedirle.tsx:22-33`; `fn_productos_resumen`.
- **Por qué en este puesto:** es el único bloque de esta pantalla que lleva a una decisión de dinero (qué comprar), hoy se calcula caro, subcuenta y su caída tumba todo.
- **Cómo lo verificas tú:** con más de 300 variantes por reponer el panel dice el total real y el número de pedidos por proveedor; si `fn_productos_resumen` falla, la lista carga igual y el panel dice «no se pudo calcular ahora».
- **Esfuerzo / dependencias:** M · después de la #11 (decidir dónde vive el panel).
- **DECIDÍ:** una RPC propia que devuelve reposición agrupada por proveedor, con conteo total, y desacoplar el `> 0`. **DESCARTÉ:** subir el tope de 3 a 10 páginas, porque solo pospone el problema y cada página es una consulta más; **y** dejar el `> 0` con `fn_productos_resumen`, porque recalcula la red entera en cada página que la persona pase. **SE ROMPE SI:** dos sedes tienen el mismo modelo en «reponer» por motivos distintos (una vendió, la otra lo tiene apartado): la función debe agrupar por proveedor, no por sede.

### #3 · Corregir — Que el panel y los filtros no pierdan lo que la persona tenía puesto
- **Dónde:** `AQuienPedirle.tsx:22` (`router.push` → conservar `vista`, `q` y filtros); `FiltrosProductos.tsx:41` (búsqueda en `useState` sin resincronizar con la URL); `getReposicionPorProveedor(filtros)` («Todos · 1 proveedores»).
- **Por qué en este puesto:** un clic que borra la búsqueda y la vista es un error del diseño; tras Atrás/Adelante el campo puede mostrar un texto que ya no filtra.
- **Cómo lo verificas tú:** con la Tabla y la búsqueda «blusa», pulsar un proveedor conserva ambas; Atrás restaura el campo con lo que filtra.
- **Esfuerzo / dependencias:** S · ninguna. `[no verificable]`: estos tres puntos salen de leer el código y no se probaron en el navegador.

### #4 · Corregir — «Editar» solo a quien puede
- **Dónde:** `ProductosGrilla.tsx:372` (vista rápida), `editar/page.tsx:29` (redirect mudo); la Tabla ya lo condiciona.
- **Por qué en este puesto:** ofrecer un botón que la base va a rechazar es culpa del diseño (Norman); y estaba en el análisis del 21-sep (#6) sin cerrar.
- **Cómo lo verificas tú:** con un rol sin edición, la vista rápida no muestra «Editar»; y si entra por URL directa ve «No tienes permiso» en vez de un rebote sin mensaje.
- **Esfuerzo / dependencias:** S · ninguna.

### #5 · Mejorar — Sin foto: no aparentar «muestra» y poder pedir las que faltan
- **Dónde:** `ProductosGrilla.tsx` (etiqueta «MUESTRA — <color>» y perchero); filtro nuevo «Sin foto» en `FiltrosProductos.tsx` y contador en la franja de avisos; `catalogo-v2.ts:354-369` (consulta de fotos redundante).
- **Por qué en este puesto:** mañana entra el catálogo del censo sin fotos; la Grilla se vuelve una pared de perchas, y no hay forma de listar lo que falta subir.
- **Cómo lo verificas tú:** en un producto sin foto la tarjeta dice «Sin foto» (no «MUESTRA»); el filtro «Sin foto» lista solo esos; el aviso «N prendas sin foto · Completar» lleva a `/editar#fotos`.
- **Esfuerzo / dependencias:** S–M · ninguna.

### #6 · Corregir — Descontinuar/Reactivar en bloque coherente con el resto
- **Dónde:** `ProductosTabla.tsx:905-916` (el `update` de respaldo, el toast que cuenta `ids.length`), `:929-943` (texto «Para pedir» y «N en stock» de la red); `cambiar_estado_productos:69-74`.
- **Por qué en este puesto:** reactivar sin revalidar marca y proveedor puede dejar un producto activo con marca desactivada; el toast dice «reactivé 10» cuando la RPC devolvió 8.
- **Cómo lo verificas tú:** reactivar un producto cuya marca está desactivada falla con mensaje; el toast cuenta lo que devolvió la RPC; el texto dice «en tu sede».
- **Esfuerzo / dependencias:** S–M · ninguna.

### #7 · Corregir — Un solo umbral de margen (y avisar el precio atípico)
- **Dónde:** `alta-producto.ts:81-86` (30 %), `productos-vista.ts:66` (45 %, «provisional»), Producción (40/60 %); aviso nuevo en la vista rápida y en Editar cuando una talla se aparta más de X % de las demás del mismo color.
- **Por qué en este puesto:** tres números para lo mismo hacen que «margen sano» signifique cosas distintas según la pantalla; y un precio de S/10.00 en una blusa de S/79.90 pasa sin una palabra.
- **Cómo lo verificas tú:** «Blusa Emma» marca las tallas XL y XS como atípicas; la leyenda de la Tabla y la alerta del alta dicen el mismo porcentaje.
- **Esfuerzo / dependencias:** S · **primero una decisión de Felipe**: ¿cuál es el margen sano?

### #8 · Mejorar — Estados vacío y «página fuera de rango» que expliquen y salgan solos
- **Dónde:** `productos-stock.ts:173` (un solo texto para dos situaciones); `Paginacion.tsx:98` (oculta los controles cuando `totalProductos` es 0); `catalogo-v2.ts:310`.
- **Por qué en este puesto:** tras descontinuar la última fila de una página con filtro, o con `?pagina=5`, la persona queda en un callejón: sin filas, sin controles y sin explicación; y «Ningún producto calza» no distingue «catálogo vacío» de «tu filtro no encuentra».
- **Cómo lo verificas tú:** `?pagina=99` vuelve a la última página; un catálogo vacío dice «Aún no hay productos: crea el primero o carga el censo».
- **Esfuerzo / dependencias:** S · ninguna.

### #9 · Eliminar/fusionar — Una sola ficha de variantes para Tabla y Grilla
- **Dónde:** `ProductosTabla.tsx:649-770` (`FichaVariantes`) contra `ProductosGrilla.tsx:248-410` (`VistaRapidaModal`); `useColorActivo` (`ProductosTabla.tsx:336`) contra dos copias en la Grilla (`:110`, `:273`); `StockDeVariante` contra `StockDeTalla`.
- **Por qué en este puesto:** dos componentes que resuelven lo mismo con contenido desigual (uno tiene Historial y el otro no): una de las dos está mal aunque ambas «funcionen» (Brooks); también es la raíz de la #1.
- **Cómo lo verificas tú:** Tabla y Grilla abren la misma ficha con los mismos botones y el mismo stock por talla.
- **Esfuerzo / dependencias:** M · **junto con la #1** (mismo cambio de fondo).

### #10 · Mejorar — Búsqueda y URL sin efectos raros
- **Dónde:** `fn_productos_buscar` (escapar `%` y `_`); `FiltrosProductos.tsx:71-85` (`router.replace` en vez de `push`); `ProductosGrilla.tsx:66` (el GET a `stock` que ya no pinta); Etiquetas en bloque (`ProductosTabla.tsx:846-862`, uuid en la URL).
- **Por qué en este puesto:** buscar «50%» devuelve todo, cada pausa de tecleo ensucia el historial y una URL de 8 KB puede cortarse con curvas grandes; ninguno daña datos.
- **Cómo lo verificas tú:** buscar «50%» no trae todo; Atrás vuelve a la pantalla anterior, no a una búsqueda a medias.
- **Esfuerzo / dependencias:** S–M.

### #11 · Replantear — ¿«A quién pedirle» vive en Productos o en Compras?
- **Dónde:** `AQuienPedirle.tsx`, `catalogo-v2.ts:392-411`, y el módulo de Compras (`/compras/*`).
- **Por qué en este puesto:** el panel decide qué comprar y a quién, que es una decisión de Compras, pero está pegado a la lista de catálogo y con ella se recalcula en cada página; no es un defecto, es una decisión de rumbo.
- **Cómo lo verificas tú:** — (pide una decisión).
- **Esfuerzo / dependencias:** M–L según la respuesta · antes de la #2.
- **DECIDÍ:** proponerle a Felipe **moverlo a Compras** como «Qué pedir» (mismo cálculo, su propia pantalla, con la lista de proveedores y la cantidad sugerida), y dejar en Productos solo un aviso con enlace. **DESCARTÉ:** mantenerlo en Productos, porque acopla dos pantallas con públicos distintos (quien cataloga y quien compra) y la carga de una tumba la otra. **SE ROMPE SI:** Compras no tiene aún datos de plazo por proveedor y el punto de reorden usa un plazo por defecto de 14 días: la sugerencia sería igual de imprecisa en una pantalla nueva.

### #12 · Eliminar/fusionar — Cabecera en dos líneas y deuda muerta · *bajo valor / opcional*
- **Dónde:** `productos-stock.ts:31` (la frase de cabecera); `ResumenProductos`, `puntoReorden`, `leadTimeDias`, `categoriaId`; el `update` de respaldo una vez pegada la migración; el comentario de `catalogo-v2.ts:43`; las filas viejas de `SESIONES-ACTIVAS.md`.
- **Por qué en este puesto:** no dañan datos; ordenan la lectura para la próxima persona.
- **Cómo lo verificas tú:** la cabecera cabe en dos líneas y el detalle queda en el «?»; `grep ProductosAgrupados docs/SESIONES-ACTIVAS.md` da 0.
- **Esfuerzo / dependencias:** S.

## 8 · Estrategia alternativa
Solo se justifica la de la #11. **Ganas:** Productos se queda en lo suyo (qué tenemos, a qué precio, en qué sede) y carga rápido; la reposición tiene su lugar con la lista de proveedores. **Pagas:** una pantalla nueva en Compras y un módulo que ya existe con la puerta abierta a `verDineroCompras`. **No cambia** la cifra de stock ni los filtros. Decide Felipe.

## 9 · Referentes de ERP y futuro
- *(De memoria, no verificado)* Odoo y NetSuite separan «Productos» (catálogo) de «Reposición» (reglas de reorden y pedidos sugeridos); Shopify POS lista el catálogo con el inventario por ubicación en la misma vista. Con 3 tiendas y un taller, lo segundo alcanza, lo primero se justifica si crecen las compras.
- **Futuro (no cuenta entre las 12):** vista por marca con margen y rotación; comparador de precios entre sedes; carga de fotos en lote.

## 10 · Fuera de esta pantalla
**El censo de mañana crea productos por una RPC que acepta precio 0**, y la única defensa está en la pantalla del alta (`alta-producto.ts:222`); la base (`variantes_precio_check`: `precio >= 0`) y las RPC del alta lo permiten, y no hay ninguna comprobación de precio 0 en `registrar_venta` ni en Vender `[no verificable]`. Ver el flujo `productos-ciclo-de-vida.md` (#1).

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:productos]` #1 El mismo «cuánto hay» en Grilla, Tabla, vista rápida y ficha — M
- [ ] `[pantalla:productos]` #2 «A quién pedirle» correcto, barato y sin tumbar la pantalla — M
- [ ] `[pantalla:productos]` #3 Panel y filtros no pierden estado — S
- [ ] `[pantalla:productos]` #4 «Editar» solo a quien puede — S
- [ ] `[pantalla:productos]` #5 Sin foto: no aparentar «muestra» + filtro y contador — S–M
- [ ] `[pantalla:productos]` #6 Descontinuar/Reactivar en bloque coherente — S–M
- [ ] `[pantalla:productos]` #7 Un solo umbral de margen + precio atípico — S (decide Felipe)
- [ ] `[pantalla:productos]` #8 Vacío y fuera de rango que expliquen — S
- [ ] `[pantalla:productos]` #9 Una sola ficha de variantes (Tabla y Grilla) — M
- [ ] `[pantalla:productos]` #10 Búsqueda y URL sin efectos raros — S–M
- [ ] `[pantalla:productos]` #11 Decidir: ¿«A quién pedirle» en Productos o en Compras? — M–L
- [ ] `[pantalla:productos]` #12 Cabecera en dos líneas y deuda muerta — S (bajo valor)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Frase de cinco líneas | Explica cada número | **ajustar** (larga, vocabulario interno) | `[visto]` `[código productos-stock.ts:31]` |
| Cabecera | Toggle Grilla/Tabla | `?vista=` | bien | `[visto]` |
| Cabecera | «+ Nuevo producto» | Lleva al alta | bien | `[código page.tsx:137]` |
| Franja | «N prendas sin temporada · Completar» | Aviso para quien edita | bien | `[visto]` |
| Panel | «A quién pedirle» | Reposición por proveedor | **ajustar** (cálculo caro, subcuenta, pierde estado) | `[código AQuienPedirle.tsx:22]` |
| Barra | Buscador + Filtros + chips | URL, 350 ms | bien / ajustar (ILIKE sin escapar) | `[código FiltrosProductos.tsx:71-85]` |
| Grilla | Tarjeta | Foto, marca, precio, «N aquí» | ajustar («MUESTRA») | `[visto]` |
| Grilla | Vista rápida | Stock por talla y 4 botones | ajustar («Editar» a todos) | `[código ProductosGrilla.tsx:372]` |
| Tabla | 9 columnas | Precio, costo, margen, stock, estado | ajustar («Stock» sin rotular) | `[visto]` |
| Tabla | Casillas y barra en bloque | Descontinuar, Reactivar, Etiquetas | bien / ajustar | `[código :836-862]` |
| Tabla | Eliminar | Pregunta a la base primero | bien | `[código EliminarProductoModal.tsx:58-69]` |
| Pie | Paginación | 24 por página | ajustar (fuera de rango) | `[código Paginacion.tsx:98]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo, primera versión (sin D3 ni E3) | 6.5 | 6.6 (Soporte) | primer análisis; reemplazada el mismo día |
| 2026-09-21 | completo, con D3, E3, E4c y verificación adversarial (8 agentes) | 5.0 (tope) | 6.8 (Soporte) | no aplica: reescritura antes de ejecutar ninguna tarea. Caen: «candado de Editar» (era falso), `CHECK` de código (rompería las altas), «A quién pedirle falla en silencio» (omisión declarada) |
| 2026-09-22 | ejecución (sin re-análisis) | 5.0 → se recalcula al re-analizar | 6.8 | #1, #2 (opción A), #3 y #4 hechas en local (ADR-0151); pendientes de producción las 2 migraciones |
| 2026-09-29 | completo, re-análisis (código + producción por agente + recorrido visual) | 6,9 | 6,8 (Soporte) | Del análisis del 21-sep, **cerradas 4 de 12**: #1 descontinuados fuera de alertas, #2 «Stock N» (ADR-0270), #3 `count(distinct)`, #4 sin rojo en «Stock 0»; **#10 parcial** (la RPC revalida, pero queda el `update` de respaldo); **siguen abiertas** #5 fotos (`MUESTRA`), #6 «Editar» en la Grilla, #7 demanda por producto, #8 `stock_minimo`, #9 un universo de variantes (ahora `catalogo-inventario.md` #8), #11 táctil/contraste. **#12 Replantear** quedó decidido en ADR-0254 («tabla para todos»). El análisis del 21-sep estaba vencido: sube de 5.0 a 6.9 sobre todo porque desaparece el tope (ya no hay cifra que dañe stock) |
