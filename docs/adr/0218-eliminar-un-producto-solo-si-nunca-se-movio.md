# ADR-0218 — Eliminar un producto solo si nunca se movió (y solo un Líder o Admin)

**Fecha:** 2026-09-26
**Estado:** Construido y verificado contra un Postgres 17 desechable (35/35, mutaciones, carreras con `COMMIT`) y en navegador (grilla, tabla, 375 px).
**Migración EN PRODUCCIÓN desde el 2026-09-26** (Felipe dio el «dale»; aplicada por MCP como `eliminar_producto`, versión `20260926075140`, con ensayo previo
revertido). Quedó **antes que la web**, como debe: la ventana llama a `fn_producto_se_puede_eliminar`. Verificada por efectos: firmas, `security definer`,
`search_path` fijo, `authenticated` sí / `anon` no, una sola versión de cada una y md5 del cuerpo idéntico al archivo (`fdfbf849…` y `331ad3b5…`).
**Decide:** Felipe, 2026-09-26: «tiene que existir la opción de eliminar productos que la tengan las cuentas de adm» — y, al preguntar quién: «adm y líderes».
**Afecta:** `supabase/migrations/20260926220000_eliminar_producto.sql` (dos funciones), `apps/web/components/EliminarProductoModal.tsx` (nuevo),
`ProductosGrilla.tsx`, `ProductosAgrupados.tsx`, `app/(app)/productos/page.tsx`, `lib/eliminar-producto-reglas.ts` (nuevo, con prueba),
`packages/database/src/types.ts`, `scripts/pruebas/eliminar_producto.mjs` (sumada al CI). No toca `productos` ni `variantes` como estructura.

## Contexto

Un producto dado de alta por error solo se podía **desactivar** (queda como «Descontinuado» para siempre, con sus variantes, sus códigos de barras y el nombre
ocupado). Es el mismo problema que ADR-0217 resolvió para las marcas («Cayla 2»), y esa decisión fija el criterio: **se puede borrar lo que no tiene historia**.
`movimientos` y `costo_historial` son inmutables por trigger; las ventas, compras y traslados citan la variante con llave foránea `NO ACTION`. Un producto
con historia no se puede borrar sin romper la contabilidad del inventario; uno que nunca se movió no tiene nada que perder.

Datos reales de producción, consultados en solo lectura el 2026-09-26: **13 productos**. **6 no tienen ninguna historia** (Básico Manga Larga, Camisa con
Brillos, Pantalon Cayla, Pantalon Sastre, Vestido Aurora, Y.j.j) y se podrían eliminar. **6 la tienen** (Blusa Carlita, Blusa Xd, Jean Baggy, Polo Básico
M/corta, Producto de Prueba, **Top Aurora**: 65 u. y 7 líneas de venta). El decimotercero es «Prenda sin Registrar», que **no es una prenda**: ver el hallazgo.

## Decisión

**DECIDÍ:** dos funciones.
- `retail.fn_producto_se_puede_eliminar(p_producto_id) → (puede, razon)`: la **única definición** de «historia de un producto». Cuenta 15 maneras en que ya
  se usó (líneas de venta, movimientos, unidades en stock, compras, órdenes de producción, traslados, apartados, separaciones, conteos, cambios, prendas
  dañadas, por regularizar, bajadas al piso, costos registrados, pedidos que no se pudieron atender). La razón viene lista para mostrar.
- `retail.eliminar_producto(p_producto_id) → referencia`: toma el producto y **todas sus variantes `for update`** antes de contar, vuelve a preguntar a la
  función de arriba, y borra —todo o nada— solo lo que nació con la ficha: stock en cero, códigos de barras, fotos, variantes (con sus etiquetas) y el producto.
  Deja **una fila de rastro** en `historial_producto_cambios` (`campo = 'eliminado'`, cómo se llamaba y quién).
- **Solo `fn_es_lider()`.** Un Admin es un Líder activo (`fn_es_admin()` ⊂ `fn_es_lider()`, ADR-0178): «adm y líderes» son exactamente quienes la pasan.
  En la web, `persona.rol === "lider"` (la convención de Devoluciones e Inicio); no se agrega un permiso nuevo a `PERMISOS`, que `menu.test.ts` recorre
  en todas sus combinaciones y dobla cada vez.
- **La ventana pregunta antes de ofrecer.** `EliminarProductoModal` llama primero a `fn_producto_se_puede_eliminar`: si se puede, muestra qué se borra y el
  botón; si no, dice por qué y ofrece la salida (descontinuarlo desde Editar); si no pudo preguntar, lo dice y **no** ofrece borrar a ciegas.

**DESCARTÉ:**
- *Reutilizar `fn_puede_editar_catalogo()`, como `eliminar_marca`.* Ganas: una sola regla de permiso para todo el catálogo. Pagas: deja eliminar a cualquier
  rol que vea Productos, y borrar un producto es más grave que borrar una marca. La prueba lo demuestra: una integrante con Productos **sí** edita el
  catálogo y **no** elimina.
- *Eliminar «con historia» arrastrando ventas y movimientos.* Ganas: el botón siempre funciona. Pagas: es imposible sin desactivar el trigger de
  `movimientos` y falsear cada venta y cada comprobante ya emitido. Es exactamente lo que ADR-0159 decidió no hacer.
- *Una columna `eliminado_at` en `productos` (borrado lógico) para que «Eliminar» siempre funcione.* Ganas: el botón nunca dice que no. Pagas: toca el núcleo
  (`productos`), y cada pantalla y función que lista productos —docenas— tiene que aprender a esconderlos: es el costo que ADR-0159 ya nombró para
  `es_prueba`. Además el stock vivo del producto «eliminado» seguiría en la tienda, con lo que habría que dar de baja unidades con un movimiento. Es otra
  decisión, no esta.
- *Un permiso nuevo `eliminarProductos` en `PERMISOS`.* Ganas: la pantalla pregunta por un permiso, no por el rol. Pagas: `menu.test.ts` prueba todas las
  combinaciones de permisos (un incidente previo tumbó el proceso con 688 mil casos) y este permiso no lo usa ningún menú.
- *Borrar los archivos de las fotos del almacenamiento.* Ganas: nada queda suelto. Pagas: quitar una foto desde la ficha tampoco los borra hoy; sería una
  segunda regla para lo mismo (integridad conceptual), con permisos de Storage aparte. Un archivo suelto de una prenda no cuesta ni expone nada.

**SE ROMPE SI:** dos personas hacen a la vez «vender/mover una variante» y «eliminar su producto». No se rompe: `eliminar_producto` toma las variantes
`for update` y una venta o un movimiento toma `for key share` sobre la misma fila por su llave foránea. Probado con dos sesiones y `COMMIT` reales, en los
dos órdenes: si el movimiento llega primero, «eliminar» **espera 2 s**, lo ve y se rechaza (producto intacto); si «eliminar» llega primero, el movimiento
espera y falla por «la variante ya no existe» (**0 huérfanos**). Sí se rompería si algún día nace una tabla que cita `variantes` y no se le enseña a
`fn_producto_se_puede_eliminar`: el `DELETE` fallaría por llave y la función lo traduce a «otra parte del sistema todavía lo usa» (probado), pero el mensaje
sería menos claro. Por eso hay una **prueba de deriva**: falla si aparece una tabla que cita `productos` o `variantes` sin clasificar como «suya» (se borra
con la ficha), «historia» (frena) o «contada por su madre».

## El hallazgo que nadie pidió: la pieza «Monto manual»

El producto `11111111-1111-4111-8111-111111111111` (hoy llamado «Prenda sin Registrar») y su variante `22222222-…` son el centinela del cobro «Monto manual»
del punto de venta: `registrar_venta` los cita **por id fijo**. En el seed local tienen un movimiento de siembra; **en producción tienen cero** (verificado).
Con la regla «sin historia se puede borrar» —la de las marcas—, un Líder habría podido eliminarlos y **todas las tiendas habrían perdido el cobro manual**
sin ningún error visible hasta el siguiente cobro. Se protegen por nombre propio y la prueba reproduce el estado de producción (borra los movimientos de
siembra dentro de su transacción) para demostrarlo. Es el argumento para no generalizar «sin historia = borrable» sin mirar los datos reales.

## Lo que esto NO resuelve (dicho, no escondido)

- **Top Aurora** —el producto que Felipe tiene en pantalla y que el BACKLOG ya marca como probable dato de prueba— **no se puede eliminar**: tiene 7 líneas
  de venta y 15 movimientos. La ventana lo dice y ofrece descontinuarlo. Si es de prueba, el camino de ADR-0159 (`archivar_producto_prueba` y
  `archivar_venta_prueba`) lo esconde sin borrar; **no está conectado a esta ventana** y es una decisión aparte (archivar un producto no archiva sus ventas).
- Los archivos de las fotos quedan en el almacenamiento (arriba). Las filas viejas de `historial_producto_cambios` del producto también: ninguna lectura las
  junta con `productos` sin pasar por `variantes`.
- El menú «···» de la vista tabla conserva el «Archivar» de adorno que ya estaba («todavía no está conectado»). No se tocó.

## Estimación (Jeff Dean)

Hoy 13 productos. Proyección a 3 años: ~200 productos, ~20 variantes cada uno. Las tablas grandes citan `variantes` con índice (`movimientos`, `venta_items`,
`stock`, `apartados`, `producciones`); 11 tablas menores no lo tienen (`transferencia_items`, `compra_items`, `conteo_items`…). Peor caso: ~20 variantes ×
11 tablas × unos cientos de miles de filas ≈ 1–2 s por eliminación, una acción rara y deliberada del Líder. No justifica 11 índices hoy.

## Verificación

- `pnpm pruebas:eliminar-producto` **35/35** en Postgres 17 desechable (las 303 migraciones de `main` + el seed, más esta). Cubre: el producto virgen se elimina completo sin tocar al
  resto; el rastro (una fila, cómo se llamaba y quién); el nombre queda libre; un descontinuado también; movimiento de stock, ventas del seed y un pedido no
  atendido frenan y se nombran; la pieza «Monto manual» no se elimina ni sin historia; sin persona, integrante con Productos, y `anon` no eliminan; un Admin sí;
  doble clic y producto fantasma; la red de seguridad de la llave foránea; y la deriva.
- **Mutación:** sin la protección del centinela → 32/35; permiso relajado en las dos puertas (`fn_puede_editar_catalogo`) → 32/35; sin el rastro → 33/35; sin
  contar las líneas de venta → 34/35. Las cuatro se detectan. La quinta —quitar el bloqueo de filas— **ninguna prueba con `ROLLBACK` la puede ver**: la cubre la
  carrera real (arriba); y aun sin el bloqueo, la llave foránea evita el daño (solo cambiaría el mensaje).
- `eliminar-producto-reglas.test.ts` 10/10; `tsc` y `eslint` limpios sobre lo tocado.
- **Navegador** (arnés temporal, ya borrado): producto sin historia → ventana con qué se borra, combo «Responsable» de Admin («Eres admin: no necesitas
  autorización»), llamada a `eliminar_producto` con el producto correcto y aviso «eliminado»; con historia → razón + Editar, sin botón de borrar; ya
  descontinuado → «Ya está descontinuado»; pieza del sistema → solo Cerrar; comprobación fallida → no afirma nada; sin permiso → la opción no existe en
  ninguna de las dos vistas. A 375 px sube como hoja y se lee. Corregidos en la revisión: el título decía «No se puede eliminar» cuando en realidad no se había
  podido comprobar, y los botones «Cerrar»/«Editar» no alineaban su texto.

## Producción

Solo crea dos funciones: sin `alter` de tablas en uso ni políticas (ADR-0195), **una sola parte**, prefijo `retail.` escrito, re-ejecutable, se pegó sin tocarla.
**Orden seguido:** SQL primero, luego el PR (lección del #444).
**Ensayo previo** (2026-09-26, en la base real, un solo lote que termina en excepción a propósito, con la sesión de un Admin Líder y la de una colaboradora): un
producto de ensayo sin historia se eliminó dejando el rastro a nombre del Admin; «Top Aurora» se rechazó con «tiene líneas de venta (7), movimientos de stock (15),
unidades en stock (65)»; «Prenda sin Registrar» se rechazó como pieza del sistema; la colaboradora recibió «Solo un líder puede eliminar productos.». Después
del lote: 0 funciones, 13 productos, ningún resto ni rastro. Recién entonces `apply_migration`.
`pnpm datos:comparar` ya no debería avisar de estas dos funciones cuando se refresque el volcado (`docs/datos/generado/COMO-REFRESCAR.md`).
