# Pantalla — Productos, vista Grilla (`/productos`)

> Modo: completo · Fecha: 2026-09-21 (reescrito el mismo día con los cuerpos reales de producción y una verificación adversarial) · Rol/sede: líder, sede TRU · Datos: **casi completo** (A1–A3, C1, D2, D3, E3, E4c de Felipe; agregados de solo lectura que consultó un agente; pendientes al final)
> SHA analizado: `518132fb` (origin/main). Comprobado contra `3966c1d0` (origin/main al cierre de esta reescritura): los archivos de esta pantalla (`page.tsx`, `ProductosGrilla.tsx`, `ProductosAgrupados.tsx`, `catalogo-v2.ts`, `fn_productos*`) no cambiaron; solo cambiaron `/productos/categorias` y la migración `20260921170000_productos_por_categoria.sql` (otra pantalla). Si cambian después, este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/page.tsx` · `components/ProductosGrilla.tsx` · `components/FiltrosProductos.tsx` · `components/ProductosAgrupados.tsx` · `lib/catalogo-v2.ts` · RPC `fn_productos`, `fn_productos_resumen`, `fn_productos_buscar` (`20260918231300_productos_por_marca_y_proveedor.sql`) · tablas `productos`, `variantes`, `stock`, `producto_fotos`, `marcas`, `proveedores`, `categorias`, `codigos_barras`
> **Ejecución (2026-09-22):** Felipe eligió la **opción A** y ordenó las tareas #1 a #4: hechas en la rama `claude/pantalla-ebc078` (ADR-0150), y pasaron una revisión adversarial de tres revisores cuyos hallazgos están corregidos. La migración (una sola, `20260922120000`) **no está en producción**. El resto del análisis (#5 a #12) sigue vigente y sin ejecutar.
> Otra sesión tocándola: sí — `product-creation-decision-tree-0afe63` (ADR-0109: marca, proveedor y «A quién pedirle»); `AppShell.tsx` tiene 6 PRs abiertos.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` cuerpo o consulta que pegó Felipe · `[producción-agente]` lectura de solo lectura hecha por un agente de verificación (Felipe debe confirmarla con las consultas del apéndice) · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
Es un catálogo sano por dentro (la base impide los estados peligrosos) pero **tres números de su cabecera dicen algo distinto de lo que el ojo lee**: «Stock» suma toda la red incluido el Taller, «sin stock» y «para pedir» cuentan prendas descontinuadas, y «190 variantes» está inflado por un `count` sobre un `join`. Además está pensada para administrar, no para el mostrador.
**Cumple su finalidad:** 5/10 (promedio 5.6, con tope 5: un modelo descontinuado puede salir en «A quién pedirle») · **Relevancia:** 6.8/10 — Soporte

## 1 · Finalidad declarada
"Esta pantalla existe para que CAYLA sepa qué prendas tiene (modelo → talla → color), a qué precio, de qué marca y proveedor, y a quién pedirle lo que se agota." Fuente: `docs/datos/modulos/02-catalogo-y-vocabulario.md` (pájaro LORO), ADR-0077 y ADR-0109. El módulo 02 avisa que describe V1: sobre el modelo mandan el código y producción. ¿Docs y pantalla coinciden? En lo esencial sí; en el stock, no (ver objeción 2).

## 2 · Objeción
1. **Los descontinuados se mezclan con los activos y ensucian los contadores que deciden qué pedir.** `fn_productos` y `fn_productos_resumen` no filtran `estado` (`filtrosProductosDesdeParams` deja `estado` en `undefined`); `reponer_de_proveedor` tampoco lo mira. La tarjeta de la Grilla no muestra el estado (solo el chip dentro de la vista rápida, `ProductosGrilla.tsx:293`; la Tabla sí lo muestra). `[código]` `[producción]` Hay 45 productos, 39 activos; la pantalla muestra 44 (= 45 menos el producto especial de cargos), o sea unos 38 activos y 6 descontinuados. Por eso «23 sin stock» no coincide con los 18 activos sin stock que midió E4c. `[inferido]` `[producción-agente]` Con los descontinuados fuera, «sin stock» sería 17 y «para pedir» 0: los «3 para pedir» y el bloque «A quién pedirle · CAYLA SAC · 3 productos» son prendas de prueba descontinuadas con ventas de los últimos 30 días, y se apagan solas hacia el 14–16 de octubre. El defecto es estructural: una prenda real que se descontinúa en liquidación saldría como «pídele al proveedor». Es una decisión de negocio tuya: ¿un descontinuado cuenta como «sin stock»?
2. **«Stock N» no es lo que se puede vender en mi sede.** `stock_total = sum(stock.cantidad)` sobre todas las ubicaciones, sububicaciones y variantes inactivas, sin filtro `[producción D3]` `[código migración :101,:115]`. Incluye el Taller y la cuarentena: hoy el Taller aporta unas 1 079 de ~1 470 unidades de productos reales, TRU 315 y AQP 76 `[producción-agente]`. «Stock 26» puede ser mercadería del Taller que ninguna tienda vende. No es un descuido: es decisión de Felipe del 2026-09-15 (`20260915160000_productos_listado_filtros.sql:38-49`, `security definer` a propósito para que una colaboradora no vea «sin stock» en una prenda que existe en otra sede). Pero choca con **R-48** («Cada líder ve solo su sede. Decidido», `docs/datos/15-COMO-OPERA-CAYLA.md`), con el modal de ajuste que sí opera sobre la sede activa (`AjustarInventarioModal.tsx:75,161`) y con el selector «TIENDA TRU», que no cambia nada de esta pantalla. El defecto, hasta que decidas, es que **nada en la pantalla dice «toda la red»**.
3. **El «190 variantes» del subtítulo es falso.** `fn_productos_resumen` hace `count(v.id)` después de `left join stock s` (`:251`, `:262`): cuenta cada variante una vez por fila de stock. Producción tiene 163 variantes (127 activas, 36 inactivas de 6 productos de prueba) y 138 filas de stock `[producción-agente]`. La prueba de regresión de la migración comparó contra la versión anterior, que ya tenía el mismo error `[código migración :16-19]`. Se arregla con `count(distinct v.id)`.
4. **El rojo se rompe con datos reales.** «23 sin stock» + un «Stock 0» rojo en cada tarjeta agotada: con 23 de 44 productos, más de la mitad de la grilla en rojo (`ProductosGrilla.tsx:179-181`, `page.tsx:247`; `MAX_ROJO_POR_PANTALLA = 2`, `design-tokens.ts:73`). `[visto]` ya hay tres en la captura.

Lo que descarté tras verificar: el candado de «Editar» **no es un hueco de seguridad** (ver «Lo que está bien»). Mi primera versión decía lo contrario y estaba mal.

## 3 · Lo que está bien y no se toca
- **Candados de datos reales:** `stock_cantidad_check` (≥ 0), `productos_referencia_clave_unica` (sin nombres duplicados), la llave compuesta `productos_marca_proveedor_fk` (no hay producto con un par marca-proveedor inválido), `productos_estado_check`. `[producción A2]` Matiz: `variantes_producto_talla_color_unico` es `UNIQUE (producto_id, talla_id, color_codigo)` **sin** `NULLS NOT DISTINCT`; dos variantes sin color o sin talla (accesorios) no chocan (`stock` sí lo usa). Ver Q9.
- **Editar un producto no lo puede hacer un integrante.** `catalogo_actualizar_producto` es `SECURITY INVOKER` `[producción D3]`: corre con los derechos de quien llama, la RLS de `productos`, `variantes` y `producto_fotos` es `*_write_lider` (`fn_es_lider()`) `[código retail_policies.json]` y un `if not found then raise` corta la transacción justo después del `UPDATE` de `productos`. Tercera capa: `editar/page.tsx:17` redirige al que no es líder. El error real es `P0001` («No se pudo guardar el producto… no tienes permiso para editarlo»), no `42501`. Falta comprobar en producción la lista de políticas vigentes (Q10b).
- **Crear y ajustar exigen líder en la base:** `crear_producto_con_variantes` llama a `fn_es_lider()` `[producción D3]`; `registrar_movimiento` también `[producción D3]`. Reintento idempotente con `token_cliente` antes del chequeo de nombre duplicado.
- **Los conteos y la paginación vienen del servidor** (`count(*) over ()`), no de contar tarjetas: la página 2 no distorsiona el total. `[código migración :162]`
- **Filtros y búsqueda en la URL**, con 350 ms de espera (`FiltrosProductos.tsx:66-80`); búsqueda por código de barras exacto. `[código]`
- **Costo visible a cualquier sesión es decisión consciente (D-27, «transparencia»).** No se toca.
- **Swatches accesibles:** `role=radiogroup`, `aria-checked`, `aria-label`. `[código ProductosGrilla.tsx:82]`
- **RLS activo en las 8 tablas** `[producción D2]`. Mérito acotado: `fn_productos*` son `security definer` y saltan la RLS; vale para las lecturas directas de `page.tsx`, no para las cifras de stock ni el costo.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | Coherente con CAYLA, pero más de la mitad de las tarjetas en rojo, ~87 % de las tarjetas con el rótulo «MUESTRA» y texto chico de contraste bajo | `[visto]` `[producción E3]` `[código ProductosGrilla.tsx:179-181,199]` |
| Lógica de negocio | 4 | «Stock» de toda la red bajo un selector de sede; descontinuados en «sin stock» y «para pedir»; «190 variantes» inflado | `[producción D3]` `[código migración :101,:251,:298-299]` |
| Arquitectura | 6 | Buena base; pero fan-out que infla un conteo, dos caminos para cambiar el mismo estado y RPC de lectura sin verificar que quien llama sea colaborador | `[producción D3]` `[código]` |
| Funciones | 6 | Ninguna fantasma para el líder; «Editar» es un botón muerto para el integrante; «stock bajo» casi no puede encenderse | `[código ProductosGrilla.tsx:323]` `[producción E3]` |
| Utilidad | 5 | Tres números que engañan a una colaboradora sin contexto | `[visto]` `[inferido]` |
| Conexión con el ERP | 6.5 | Bien conectada aguas arriba; sin puente a existencias por sede ni a «dónde más hay» | `[código]` |

### Estética — 6
- `[visto]` Alineada con las hermanas: papel crema, títulos serif, etiquetas en mayúsculas espaciadas.
- `[código ProductosGrilla.tsx:179-181,220]` Rojo en cada `Stock 0` más el del subtítulo y el del foco.
- `[producción E3]` 34 de 39 activos no tienen **ninguna** foto, así que la grilla es casi toda tinte más percha, cada uno con «MUESTRA — COLOR».
- `[código]` Swatches de 16 px; textos de 9–11 px con `text-tinta/55` y `/60` (marca y proveedor en `:213`, código en `:209`, color en `:224`). `[inferido]` Por cálculo con los tokens de `ProductosGrilla.tsx:50,64` salen ~3.7:1 y ~4.3:1, bajo 4.5. Hay que medirlo en el navegador.

### Lógica de negocio — 4
- `[código]` «Para pedir» es global y coherente consigo mismo: la demanda del punto de reorden también es de toda la red (`migración :116-123`). Filtrar solo el stock por sede sin filtrar la demanda rompería esa coherencia.
- Reglas que la tocan: **R-48** (cada líder ve solo su sede, decidido), **D-27** (costo visible), **D-39** (las alertas cuentan piso y almacén y avisan cuántas hay guardadas: precedente para «qué stock es vendible»). Hay además una decisión de Felipe del 2026-09-15 escrita en una migración (no en un ADR) que pide el total. Dos decisiones que no se hablan entre sí: eso es la objeción 2.
- `[código persona-actual.ts:87]` El selector de sede del líder ya rompe R-48 de hecho («control total temporal»), y `fn_stock_por_sede` entrega stock de todas las ubicaciones activas a cualquier colaborador.
- `[código]` La cifra incluye cuarentena, almacén, taller y variantes inactivas (hoy sin efecto: 0 variantes inactivas en productos activos, 0 stock en inactivas `[producción-agente]`).

### Arquitectura — 6
- **Estados imposibles:** el stock no baja de 0, no hay nombres duplicados, marca+proveedor van juntos. Hueco: `productos.codigo` acepta NULL, pero el trigger `variantes_asignar_codigo` (AFTER INSERT en `variantes`, `20260912235500_vocabulario_cerrado.sql:233-242`) lo acuña con la primera variante (`PREFIJO-NNNN`; sin categoría → `GEN-NNNN`); 0 activos sin código `[producción E3]`. **Un `CHECK codigo NOT NULL` habría roto todas las altas** (el `INSERT` a `productos` precede al de `variantes`); se propone una consulta invariante, no un candado.
- **Transacción:** esta pantalla lee; escribe en dos sitios: el modal de ajuste (`registrar_movimiento`, todo-o-nada, con candado) y el **Activar/Desactivar en bloque de la Tabla**, que hace `update productos set estado` directo por RLS (`ProductosAgrupados.tsx:97-115`) y se salta la revalidación de marca y proveedor que sí hace `catalogo_actualizar_producto` al reactivar. Dos caminos, una regla.
- **Concurrencia:** dos lectores no chocan; un ajuste mientras alguien pagina puede dar totales distintos entre página 1 y 2 (offset). Aceptable a 44 productos. `[inferido]`
- **Caída externa:** no toca API externa. Si `fn_productos` no responde, cae a `error.tsx`; no se pierde ningún dato. «A quién pedirle» se omite si falla su consulta, con el comentario declarado en `catalogo-v2.ts:293-296`; el «N para pedir» del subtítulo sigue visible porque sale del resumen.
- **Volumen:** volcado 477 movimientos, 138 filas de stock, 164 variantes, 20 fotos; hoy 0 lotes y 0 compras `[producción-agente]`. `fn_productos` y `fn_productos_resumen` recorren **todo el catálogo** antes de paginar y el `lead_time` (`:124-133`) recorre todas las recepciones del libro en cada evaluación: costo ≈ productos × recepciones × 3–5 llamadas por carga. Hoy es 0; **crece con Compras**. Un agente lo midió en una base sintética propia, no en producción. Medir con `EXPLAIN (ANALYZE)` antes de decidir (Q11).
- **Seguridad:** `fn_productos`, `fn_productos_resumen` y `fn_productos_buscar` (esta última invoker) con `execute` a `authenticated` (`migración :306-309`) y **sin comprobar que quien llama sea colaborador**. Ver «Fuera de esta pantalla».

### Funciones — 6
- **Existen y funcionan:** búsqueda, filtros, chips para quitar, grilla/tabla, paginación, vista rápida, nuevo producto, ajustar inventario (líder), «A quién pedirle».
- **Fantasma:** «Editar» para el integrante: sale en `ProductosGrilla.tsx:323` y `ProductosAgrupados.tsx:353` y al pulsarlo rebota a `/productos` sin mensaje y sin conservar filtros. `productos/layout.tsx` declara la pantalla de solo lectura para integrantes. No lo vi antes porque analicé con rol líder.
- **A medias:** «con stock bajo» y el ámbar de la tarjeta: 38 de 39 activos no tienen `stock_minimo`. Causa raíz: el alta viva (`crear_producto_con_variantes`, `censo_crear_variante`) no tiene el parámetro; solo lo escribe el modal de edición; `catalogo_crear_producto`, que sí lo aceptaba, se retiró el 2026-09-18 sin trasladarlo. `[código]` `[producción E3]`
- **Faltan:** foto general o principal como respaldo (`fn_productos` une la foto por color con `is not distinct from`, sin caída a `es_principal`; `ProductosGrilla.tsx:28` descarta variantes sin color), un contador «sin foto», stock por sede.
- **Sobran:** nada que borrar.

### Utilidad (persona sin contexto) — 5
Escenario: una colaboradora nueva, un sábado en hora pico; una clienta pide una blusa blanca talla S.
1. Escribe «blusa» y la encuentra. Bien.
2. Ve «MUESTRA — BLANCO». ¿Es una prenda de muestra? ¿Se puede vender? Duda. Significa «falta la foto».
3. Ve «Stock 26». ¿En mi tienda o en todas? Ni ella ni el líder lo saben: incluye el Taller.
4. Ve «23 sin stock» arriba y se preocupa; unos 5 son descontinuados que no importan. `[inferido]`
5. Para saber la talla S, abre la vista rápida: solo trae talla, color, precio y código (`ProductosGrilla.tsx:303-306`), no el stock por talla. `[código]`
6. Si es integrante y pulsa «Editar», no pasa nada. El error es del diseño, no de la capacitación.

### Conexión con el ERP — 6.5
Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Raíz de precios, marca, proveedor y reposición; casi toda la analítica cuelga de estos datos |
| Dinero y stock que toca | ×1 | 6 | Lectura casi toda, pero alimenta la reposición: una sugerencia mala se vuelve una compra |
| Frecuencia y personas que la usan | ×1 | 7 | Consulta diaria de todas las sedes; la venta corre por el punto de venta |
| Qué se detiene si falla | ×1 | 5 | No se da de alta ni se repone; vender sigue por Vender |

Relevancia = (2·8 + 6 + 7 + 5) / 5 = **6.8** → **Soporte**.
Tope de 5 en «cumple su finalidad»: **aplicado**. Motivo: `reponer_de_proveedor` no mira `estado` y «A quién pedirle» puede sugerir pedir un modelo descontinuado (hoy son prendas de prueba; mañana pueden ser reales). La sugerencia no compra sola, pero es el camino más corto entre un dato equivocado y dinero.

## 6 · Conexión con el ERP
- **Aguas arriba:** altas desde `/productos/nuevo` y el censo (`crear_producto_con_variantes`, `censo_crear_variante`); marcas y proveedores (`marca_proveedores`, ADR-0109); movimientos de compras y ventas que alimentan `stock` y `demanda_diaria`.
- **Aguas abajo:** Vender (variantes y precios), Inventario (existencias, conteo, traslados; **Inventario sí filtra variante activa**, `inventario-v2.ts:108-114`, y Productos no: dos definiciones del mismo universo), Compras (reposición por proveedor), etiquetas y códigos de barras.
- **Pájaro dueño y vecinos:** LORO (catálogo y vocabulario), con Inventario, Compras y Vender de vecinos (`AVIARIO.md`).
- **Externos, y qué pasa si caen:** ninguno directo. Se degrada así: si Supabase no responde, la pantalla cae a `error.tsx` y no se pierde ningún dato porque no escribe (salvo el ajuste, que es todo-o-nada).

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Los descontinuados fuera de «sin stock», «para pedir» y «A quién pedirle», y marcados en la Grilla ✅ hecha en local (ADR-0150, migración `20260922120000`)
- **Dónde:** `fn_productos` (`:150`) y `fn_productos_resumen` (`:298-299`): agregar `estado = 'activo'` a los tres contadores; `ProductosGrilla.tsx:207-218` (chip «Descontinuado» o tarjeta atenuada); `catalogo-v2.ts:297-316` (reposición sin `estado`).
- **Por qué en este puesto:** es el único camino de esta pantalla hacia dinero (compra de un modelo que ya no se vende) y hace mentir a «23 sin stock». Sin esto, cada liquidación futura dispara una sugerencia falsa.
- **Cómo lo verificas tú:** con la Q2 (apéndice), `sin_stock` para activos = 17 o 18 y `para_pedir` = 0 para descontinuados; en la Grilla, las 6 tarjetas descontinuadas se ven distintas; «A quién pedirle» desaparece hoy.
- **Esfuerzo / dependencias:** M. Decisión tuya primero: ¿un descontinuado en liquidación con stock cuenta como «para pedir»? Recomendación: no. No ocultarlos por defecto: la Tabla tiene «Activar» en bloque y hay que poder alcanzarlos.

### #2 · Corregir — Decir qué significa «Stock N» (y decidir cuál número debe ver una tienda) ✅ opción A hecha; B/C sin decidir
- **Dónde:** `ProductosGrilla.tsx:220` (rótulo), `page.tsx` (contadores), `fn_productos`/`fn_productos_resumen`; `docs/datos/15-COMO-OPERA-CAYLA.md` (R-48).
- **Por qué en este puesto:** es el número que más se lee y hoy induce a error en la venta. La decisión de fondo es tuya y está en la sección 8.
- **Cómo lo verificas tú:** el rótulo dice «en toda la red» y, si eliges la opción B, cambiar de sede en la cabecera cambia la cifra y coincide con Inventario → Existencias de esa sede.
- **Esfuerzo / dependencias:** S (solo rótulo) o M (cifra por sede). Si `fn_productos` gana `p_ubicacion_id` y sigue siendo `security definer`, debe validarlo con `fn_puede_operar_ubicacion`; si no, cualquiera lee la sede ajena pasándole el id.
- **DECIDÍ:** proponer A ahora y B después (sección 8).
- **DESCARTÉ:** quitar el total, porque el líder pierde la vista de reposición global de la que sale «para pedir».
- **SE ROMPE SI:** una colaboradora de TRU ve «0 en mi sede» de una prenda que hay en Lima y le dice a la clienta que no hay, con la venta perdida por decisión de una regla que nadie eligió mirando esta pantalla.

### #3 · Corregir — «190 variantes» → `count(distinct v.id)` ✅ hecha en local (misma migración `20260922120000`)
- **Dónde:** `fn_productos_resumen` (`migración :251`), mostrado en `page.tsx:227` y `:262-265`.
- **Por qué en este puesto:** es un número falso en el encabezado, arreglable en una línea. Va en su propia migración (cambia un número visible), separada de la #7 (Beck: un cambio de resultado y un cambio de forma no se mezclan).
- **Cómo lo verificas tú:** Q4a: `variantes_que_dice_la_pantalla` debe igualar `variantes_reales` (hoy 163 en producción, sin contar el producto especial).
- **Esfuerzo / dependencias:** S. Agregar una prueba de regresión contra datos con más de una fila de stock por variante.

### #4 · Corregir — Quitar el rojo de «Stock 0» en cada tarjeta ✅ hecha en local (Grilla y Tabla)
- **Dónde:** `ProductosGrilla.tsx:179-181` (`tonoStock`); `page.tsx:247`.
- **Por qué en este puesto:** rompe la regla de ≤ 2 rojos y le quita fuerza al rojo cuando importa. Con 23 agotados, más de la mitad de la grilla en rojo.
- **Cómo lo verificas tú:** abre `/productos`, cuenta los elementos en rojo con el inspector: máximo 2. «Sin stock» sale en un chip neutro (Grilla) o en tinta (Tabla).
- **Esfuerzo / dependencias:** S. Misma línea que #2.

### #5 · Mejorar — Fotos: ocultar «MUESTRA» cuando el producto no tiene ninguna, dar respaldo y contar las faltantes
- **Dónde:** `ProductosGrilla.tsx:28-29,175-203` (descarta variantes sin color al buscar foto); `fn_productos` (`migración :204-211`, sin caída a foto general ni a `es_principal`); `FotosProducto.tsx:102` (el color de la foto es opcional y nace `NULL`).
- **Por qué en este puesto:** 34 de 39 activos no tienen ninguna foto; el rótulo sale en ~87 % de las tarjetas y deja de significar algo. Además hay caminos por los que un producto **con** foto también dice «MUESTRA» (foto sin color y variantes con color; foto solo en algunos colores).
- **Cómo lo verificas tú:** Q7a/Q7b; un producto sin fotos no lleva rótulo y el líder ve «34 sin foto»; uno con foto general la muestra en todos sus colores.
- **Esfuerzo / dependencias:** M. La causa raíz es de contenido (quién fotografía y etiqueta por color), no solo de pantalla. Tabla aparte: el respaldo ya existe en `apps/web/lib/producto-fotos-reglas.ts:12-16` y en `fn_resumen_variantes`.

### #6 · Corregir — Esconder «Editar» al integrante en la Grilla y en la Tabla
- **Dónde:** `ProductosGrilla.tsx:323` y `ProductosAgrupados.tsx:353` (mismo patrón que «+ Nuevo producto», `page.tsx:114`).
- **Por qué en este puesto:** no hay riesgo de datos (la base lo impide) pero es un botón muerto: rebota sin mensaje y sin conservar los filtros.
- **Cómo lo verificas tú:** entra como integrante: no aparece «Editar»; como líder, sigue apareciendo.
- **Esfuerzo / dependencias:** S. Añadir una prueba que ejecute el rechazo de un integrante contra la RPC (hoy no existe, la garantía descansa en que la RLS siga activa).

### #7 · Corregir — Calcular demanda y plazo de entrega una vez por producto *(medir primero)*
- **Dónde:** `fn_productos` (`:88`, laterals `:116-133`) y `fn_productos_resumen` (`:247`, laterals `:263-280`).
- **Por qué en este puesto:** hoy cuesta 0 (0 lotes y 0 compras), pero el `lead_time` recorre todas las recepciones en cada evaluación y se ejecuta 3–5 veces por carga: crece con Compras. Antes de tocarlo, medir con `EXPLAIN (ANALYZE, TIMING OFF)` sobre el cuerpo del CTE `agregado` (Q11).
- **Cómo lo verificas tú:** misma respuesta que antes (prueba con `EXCEPT` entre versión vieja y nueva) y menos evaluaciones en el plan.
- **Esfuerzo / dependencias:** M. Forma mínima, sin cambiar firma ni columnas: dos CTEs `demanda` y `entrega` con `group by producto_id` y `left join ... on vd.producto_id = p.id`; el resto (`max()`, `coalesce`) queda igual. Segundo paso, aparte: una sola función de lectura para las dos RPC (hoy la misma fórmula está copiada en dos cuerpos). No antes de la #3.
- **DECIDÍ:** CTE por producto con el mismo resultado.
- **DESCARTÉ:** cachear en una tabla o vista materializada, porque es una segunda fuente de verdad que hay que mantener al día para un catálogo de 300 productos.
- **SE ROMPE SI:** un producto sin ventas ni recepciones queda con `NULL` y el `coalesce` no lo lleva a 0 y 14 como antes.

### #8 · Mejorar — Que el alta pida `stock_minimo` (o que «stock bajo» se esconda hasta tenerlo)
- **Dónde:** `crear_producto_con_variantes` (agregar `p_stock_minimo` con default `NULL`), `NuevoProductoForm`, `censo_crear_variante`; `ProductosGrilla.tsx:180`.
- **Por qué en este puesto:** 38 de 39 activos no lo tienen: el atajo «con stock bajo» y el ámbar casi no pueden encenderse (como mucho 1 producto). Es una regresión de diseño (el retiro de `catalogo_crear_producto`), no un olvido de captura. Nota: el mínimo se **suma** al punto de reorden, no lo sustituye.
- **Cómo lo verificas tú:** un producto nuevo con mínimo 3 y stock 2 sale ámbar y aparece en el atajo.
- **Esfuerzo / dependencias:** M. Considerar un valor por categoría antes que exigirlo por producto (con 44 productos exigirlo es fricción sin valor).

### #9 · Corregir — Un solo universo de «variantes vigentes» para Productos e Inventario
- **Dónde:** `fn_productos` (`:101,:114`), `fn_productos_resumen` (`:252`), `catalogo-v2.ts:235-268`, `ProductosGrilla.tsx:25-41` (`coloresDe`, `rangoPrecio`).
- **Por qué en este puesto:** riesgo latente, hoy sin daño (0 variantes inactivas en productos activos): en cuanto un líder desactive una variante con stock, o cambie un color por desactivar+agregar (flujo documentado en `ProductoForm.tsx:49-53`), sus swatches, su precio y su stock siguen apareciendo en la tarjeta. Inventario sí las filtra.
- **Cómo lo verificas tú:** Q4b; desactiva una variante con stock: desaparece de los swatches y del rango de precio, pero se ve atenuada en la tabla de detalle.
- **Esfuerzo / dependencias:** M. No antes de la #3 (misma función).

### #10 · Corregir — El «Activar» en bloque de la Tabla salta la revalidación de marca y proveedor
- **Dónde:** `ProductosAgrupados.tsx:97-115` (`update productos set estado`) frente a `catalogo_actualizar_producto` (`20260918231100_alta_y_edicion_exigen_marca_y_proveedor.sql:475-480`, llama a `fn_validar_marca_proveedor` al reactivar).
- **Por qué en este puesto:** dos caminos para el mismo cambio con reglas distintas: se puede reactivar un producto cuya marca o proveedor ya se desactivó. Hoy no hay caso (Q13); es un candado que se vuelve decorativo.
- **Cómo lo verificas tú:** Q13 = 0; desactiva una marca y reactiva en bloque un producto suyo: debe fallar con el mismo mensaje que la edición.
- **Esfuerzo / dependencias:** S (una RPC de estado o un trigger `BEFORE UPDATE`). Ningún trigger de `productos` lo valida hoy.

### #11 · Mejorar — Objetivos táctiles, contraste y estado vacío *(bajo valor / opcional: el catálogo lo usa poca gente a la vez)*
- **Dónde:** `ProductosGrilla.tsx:82` (swatches 16 px), `:209,:213,:224` (texto `/55`, `/60`, 9–11 px); toggle y chips de filtro; `ProductosGrilla.tsx:146` («Ningún producto calza con esos filtros.» sin botón para limpiar).
- **Por qué en este puesto:** en la tablet del mostrador un swatch de 16 px es más chico que un dedo (`ADR-0012`); `[inferido]` el contraste de `/55` y `/60` está bajo 4.5:1, a medir en el navegador.
- **Cómo lo verificas tú:** tocar un swatch sin fallar; el inspector muestra área táctil ≥ 40 px; el estado vacío ofrece «Quitar todos los filtros».
- **Esfuerzo / dependencias:** S. Mismo defecto en otra pantalla: `docs/pantallas/productos-categorias.md` señala `text-[9px] text-tinta/50` en `CategoriasLista.tsx:670`. Con una tercera pantalla, pasa a ser **una** tarea raíz (piso de tamaño y contraste en `globals.css`), no tres.

### #12 · Replantear — ¿Un solo «Productos» para administrar y para consultar en el mostrador?
- **Dónde:** toda la ruta `/productos` y el menú (`AppShell.tsx`, hoy con 6 PRs abiertos).
- **Por qué en este puesto:** es la pregunta de fondo y no cambia el orden de las anteriores. Es decisión tuya.
- **Cómo lo verificas tú:** ver sección 8.
- **Esfuerzo / dependencias:** L. No antes de la #2.
- **DECIDÍ:** proponerte separar «Catálogo» (gestión: costo, marca, proveedor, reposición; líder) de «Consultar» (mostrador: talla, color, vendible en mi sede, dónde más hay).
- **DESCARTÉ:** dejar todo en una pantalla con más filtros, porque cada filtro nuevo agrega un rol más a una pantalla que ya sirve a dos oficios distintos.
- **SE ROMPE SI:** los integrantes siguen usando el punto de venta para consultar (ya lo hacen) y «Consultar» es una tercera pantalla que nadie abre; o si R-48 se mantiene estricta y «dónde más hay» no puede existir.

## 8 · Estrategia alternativa y decisión que necesita Felipe
**Decisión 1 — qué número debe mostrar Productos como «Stock» (bloquea la #2).** Hay dos decisiones tuyas que no se hablan: R-48 («cada líder ve solo su sede») y la del 2026-09-15 («Productos muestra el total de todas las sedes»).
| Opción | Ganas | Pagas |
|---|---|---|
| **A · Solo rótulo:** «Stock en toda la red (incluye Taller)» | Cero riesgo, respeta la decisión del 2026-09-15, S | Sigue sin decir qué puedo vender en mi tienda |
| **B · «Vendible en mi sede»** (piso de venta de la sede activa) como cifra principal; el total, solo para el líder | Cumple R-48 para el integrante; responde lo que la clienta pregunta | Cambia el contrato de dos RPC; hay que validar la sede con `fn_puede_operar_ubicacion`; el «para pedir» sigue global |
| **C · Mi sede + «hay en otra sede»** sin cantidad ni nombre | Es lo que R-48 sugiere para los traslados | Más lógica y más pantallas |
**Decidido por Felipe el 2026-09-22: A.** B y C siguen abiertas (recomendación original: B después; C solo si se quiere R-48 estricta).

**Estrategia alternativa (#12):**
| | Ganas | Pagas |
|---|---|---|
| **Actual: una pantalla** | Un solo lugar; menos código; ya funciona | Sirve a dos oficios con una sola vista; los números confunden |
| **Catálogo (gestión) + Consultar (mostrador)** | La colaboradora ve solo lo que necesita; el líder conserva costo y reposición | Dos pantallas que mantener; hay que resolver R-48 antes |
Recomendación: primero #1–#4 en la pantalla actual; reevalúa el Replantear cuando veas cómo se usa en TRU.

## 9 · Referentes de ERP y futuro
Lo que sigue viene de memoria, **no verificado**:
- Shopify POS y Lightspeed muestran el stock por ubicación en la ficha del producto (equivale a la opción B; pasa el filtro «¿le sirve a 3 tiendas y 1 taller hoy?»).
- Odoo separa la vista de gestión de la de consulta por permisos (equivale a #12; pasa con reservas: R-48).
- Punto de reorden por proveedor con aprobación de compras: futuro, cuando el volumen pase de 3 tiendas.

## 10 · Fuera de esta pantalla
**`fn_productos`, `fn_productos_resumen` y las lecturas directas de `productos` y `variantes` sirven costo y stock a cualquier sesión autenticada del proyecto, y ese proyecto es el de Dynamic.** Las tres funciones son `security definer` con `execute` a `authenticated` (`migración :306-309`) y no comprueban que quien llama sea colaborador de retail; `variantes_select` y `productos_select` dicen `auth.role() = 'authenticated'` `[código retail_policies.json]`. D-27 («costo visible, transparencia») se decidió pensando en cuentas de retail; desde la unificación con Dynamic, `auth.users` incluye cuentas que no lo son. `fn_stock_por_sede` sí lo comprueba (`20260914231015:233-238`): son dos criterios para el mismo dato. Cuántas cuentas hay hoy fuera de retail: **Q12** (solo conteos). Hasta tenerla, `[no verificable]`.

## 11 · Líneas propuestas para BACKLOG.md
- [x] `[pantalla:productos]` #1 Descontinuados fuera de «sin stock», «para pedir» y «A quién pedirle», y marcados en la Grilla — M (decisión de Felipe) — hecha en local, ver ADR-0150
- [x] `[pantalla:productos]` #2 Rótulo «Stock en toda la red» y decisión R-48 vs 2026-09-15 (opciones A/B/C) — S/M — opción A hecha; B/C abiertas, ver ADR-0150
- [x] `[pantalla:productos]` #3 `count(distinct v.id)` en `fn_productos_resumen` («190 variantes») — S — hecha en local, ver ADR-0150
- [x] `[pantalla:productos]` #4 Quitar el rojo de «Stock 0» por tarjeta (≤ 2 rojos) — S — hecha en local, ver ADR-0150
- [ ] `[pantalla:productos]` #5 Fotos: sin rótulo si no tiene ninguna, respaldo a foto general/principal, contador «sin foto» — M
- [ ] `[pantalla:productos]` #6 Esconder «Editar» al integrante en Grilla y Tabla + prueba del rechazo — S
- [ ] `[pantalla:productos]` #7 Demanda y plazo de entrega por producto en `fn_productos*` (medir primero) — M
- [ ] `[pantalla:productos]` #8 `p_stock_minimo` en el alta (o esconder «stock bajo») — M
- [ ] `[pantalla:productos]` #9 Un solo universo de variantes vigentes en Productos e Inventario — M
- [ ] `[pantalla:productos]` #10 «Activar» en bloque debe revalidar marca y proveedor — S
- [ ] `[pantalla:productos]` #11 Táctil, contraste y estado vacío (bajo valor) — S
- [ ] `[pantalla:productos]` #12 Decidir: Catálogo (gestión) + Consultar (mostrador) — L
- [ ] `[pantalla:productos]` Fuera: cuentas fuera de retail que pueden llamar `fn_productos*` (Q12) y una sola regla de acceso con `fn_stock_por_sede` — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Selector «TIENDA TRU» | Cambia la sede activa (solo líder) | Ajustar: no cambia el stock de esta pantalla | `[código AppShell.tsx:1209]` |
| Título | Subtítulo con conteos | Enlaces que aplican filtros de stock | **Ajustar:** variantes inflado; sin stock y para pedir cuentan descontinuados; rojo | `[código page.tsx:227,247]` `[producción D3]` |
| Título | Toggle GRILLA / TABLA | Cambia la vista, conserva filtros | Bien; ajustar tamaño | `[código page.tsx]` |
| Título | «+ Nuevo producto» | Lleva a `/productos/nuevo` (solo líder) | Bien | `[código page.tsx:114]` |
| Bloque | «A quién pedirle» | Filtra por proveedor con reposición | Ajustar: sin filtro de estado | `[código catalogo-v2.ts:297-316]` |
| Búsqueda | Buscador | Texto, código y barras, en el servidor | Bien; `ilike` sin escapar `%` y `_` (menor) | `[producción D3]` |
| Búsqueda | Filtros | Categoría, marca, proveedor, color, estado, precio, stock, orden | Bien; falta orden por nombre y por stock (bajo valor) | `[código]` |
| Tarjeta | Foto o tinte | Abre la vista rápida | Ajustar: sin respaldo a foto general | `[código :28-29]` |
| Tarjeta | Badge «MUESTRA — COLOR» | Marca que falta la foto | **Ajustar:** sale en ~87 % de las tarjetas | `[código :199]` `[producción E3]` |
| Tarjeta | Nombre, código, categoría, marca · proveedor | Identidad | Bien; sin distintivo de estado | `[código :207-218]` |
| Tarjeta | Precio | Rango de precio de las variantes | Ajustar: incluye variantes inactivas | `[código :35-41]` |
| Tarjeta | «Stock N» | Total de toda la red | **Ajustar (#2, #4)** | `[código :220]` `[producción D3]` |
| Tarjeta | Swatches | Cambian el color mostrado | Ajustar: 16 px; incluye variantes inactivas | `[código :25-32,:82]` |
| Vista rápida | Variantes, «Editar», «Ajustar inventario» | Detalle y acciones | Ajustar: sin stock por sede; «Editar» muerto para el integrante | `[código :303-306,:323]` |
| Pie | Paginación | 24 por página | Bien | `[código catalogo-v2.ts:136]` |

## Apéndice — Consultas que aún faltan (solo lectura, sin datos personales, prefijo `retail.`)
Las consultas Q1–Q13 que propuso el verificador están en la conversación; estas son las que cambian una conclusión de este archivo.

```sql
-- Q2. Reproduce «sin stock» y «para pedir» con la función real, partidos por estado (confirma la objeción 1).
with p as (select distinct producto_id, estado, stock_total, demanda_diaria, reponer_de_proveedor
           from retail.fn_productos(p_por_pagina => 100))
select estado, count(*) as productos,
       count(*) filter (where stock_total = 0) as sin_stock,
       count(*) filter (where reponer_de_proveedor) as para_pedir,
       count(*) filter (where stock_total = 0 and demanda_diaria = 0) as sin_stock_y_sin_ventas_30d
from p group by estado order by estado;

-- Q4a. ¿Está inflado el conteo de variantes? (confirma la #3)
select (select total_variantes from retail.fn_productos_resumen()) as variantes_que_dice_la_pantalla,
       (select count(*) from retail.variantes where producto_id <> '11111111-1111-4111-8111-111111111111'::uuid) as variantes_reales,
       (select count(*) from retail.variantes where producto_id <> '11111111-1111-4111-8111-111111111111'::uuid and not activo) as variantes_inactivas,
       (select count(*) from retail.stock) as filas_de_stock;

-- Q5. De dónde sale el «Stock N»: por ubicación, tipo y sububicación (confirma la #2).
select u.nombre as ubicacion, u.tipo as tipo_ubicacion, u.activo as ubicacion_activa,
       coalesce(su.tipo, '(sin sububicación)') as sububicacion,
       count(*) as filas, coalesce(sum(s.cantidad), 0) as unidades
from retail.stock s join retail.ubicaciones u on u.id = s.ubicacion_id
left join retail.sububicaciones su on su.id = s.sububicacion_id
group by 1, 2, 3, 4 order by 1, 2, 4;

-- Q7a. Fotos sin color (confirma la #5).
select count(*) as fotos, count(distinct producto_id) as productos_con_foto,
       count(*) filter (where color_codigo is null) as fotos_sin_color
from retail.producto_fotos;

-- Q10a. Quién ejecuta cada función de la pantalla (cierra E2 y la nota «Fuera de esta pantalla»).
select p.proname, case when p.prosecdef then 'definer' else 'invoker' end as corre_como, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_ejecuta,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_ejecuta
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail'
  and p.proname in ('fn_productos','fn_productos_resumen','fn_productos_buscar','fn_stock_por_sede',
                    'catalogo_actualizar_producto','crear_producto_con_variantes','registrar_movimiento');

-- Q12. Solo conteos: cuentas del proyecto vs. cuentas con acceso a retail.
select count(*) as cuentas_auth,
       count(*) filter (where exists (select 1 from public.personas pe join retail.colaboradores c on c.persona_id = pe.id
                                      where pe.auth_user_id = u.id)) as con_acceso_a_retail
from auth.users u;

-- Q13. Activos con marca o proveedor desactivado (confirma la #10).
select count(*) as activos_con_marca_o_proveedor_inactivo
from retail.productos p join retail.marcas m on m.id = p.marca_id join retail.proveedores pv on pv.id = p.proveedor_id
where p.estado = 'activo' and (not m.activo or not pv.activo);
```

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo, primera versión (sin D3 ni E3) | 6.5 | 6.6 (Soporte) | primer análisis; reemplazada el mismo día |
| 2026-09-21 | completo, con D3, E3, E4c y verificación adversarial (8 agentes) | 5.0 (tope) | 6.8 (Soporte) | no aplica: reescritura antes de ejecutar ninguna tarea. Caen: «candado de Editar» (era falso), `CHECK` de código (rompería las altas), «A quién pedirle falla en silencio» (omisión declarada) |
| 2026-09-22 | ejecución (sin re-análisis) | 5.0 → se recalcula al re-analizar | 6.8 | #1, #2 (opción A), #3 y #4 hechas en local (ADR-0150); pendientes de producción las 2 migraciones |
