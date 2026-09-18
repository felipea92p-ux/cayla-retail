# ADR-0095 — Taxonomía de variante cerrada: tallas, tejidos, patrones,
etiquetas, y por qué colores por fin puede rechazar

**Fecha:** 2026-09-17
**Estado:** Construido y verificado en local (ver "Cómo se verificó" —
incluye un bug real que el propio proceso de verificación encontró y
corrigió, no solo "corrió sin error"). Producción: pendiente de pegar el
SQL con el prefijo `retail.` (ver CLAUDE.md §"Cómo aplicar SQL a
producción").
**Afecta:** `retail.tallas`, `retail.tejidos`, `retail.patrones`,
`retail.etiquetas`, `retail.variante_etiquetas`, `retail.categoria_tallas`,
`retail.categoria_tejidos`, `retail.categoria_patrones`; `retail.colores`
(gana rechazar); `retail.productos` (`tejido_id`, `patron_id`);
`retail.variantes` (`talla_id` reemplaza `talla`); `catalogo_crear_producto`,
`catalogo_actualizar_producto`, `crear_producto_con_variantes`,
`registrar_venta`, `transferir`, y 7 funciones de lectura (`fn_productos`,
`fn_movimientos`, `fn_ventas_del_dia`, `fn_prioridad_conteo`,
`fn_traslado_lineas`, `fn_historial_producto_cambios`,
`previsualizar_cierre_conteo`); `NuevoProductoForm.tsx`, `ProductoForm.tsx`,
sus dos páginas server, y `lib/catalogo-v2.ts`.

## El problema

Con el censo real (300-900 SKUs) por arrancar, tres huecos del catálogo se
volvían más caros cada día que seguían abiertos:

1. `variantes.talla` seguía siendo texto libre desde el día uno — "M"/"m"/
   "Medium"/"Mediano" iban a convivir como tallas distintas para siempre.
2. Tejido y patrón de tela no existían como atributo de catálogo en
   absoluto — no había cómo filtrar/reportar "vestidos de algodón".
3. No existía un tag de catálogo (folksonomy) distinto de la etiqueta física
   de código de barras — ni forma de restringir una prenda a una sede.
4. Colores tenía "proponer/aprobar" (ADR-0070) pero no "rechazar" — una
   propuesta basura solo se podía aprobar y desactivar después.

## La decisión

**DECIDÍ:** los 4 vocabularios nuevos (tallas, tejidos, patrones, etiquetas)
copian exactamente el mecanismo ya probado de colores — propone cualquiera,
aprueba un Líder, mismo candado de clave única normalizada
(`fn_clave_texto`) — y nacen con **rechazar incluido desde el día uno**
(candado de "hay una fila en uso" + transición atómica solo-desde-pendiente
+ motivo opcional en `notas`), en vez de construirlo en una segunda pasada
como pasó con colores. Colores mismo gana rechazar acá, para no ser la
única excepción al mecanismo común (integridad conceptual, principio 2).

**DESCARTÉ:** las dos implementaciones de "rechazar color" que ya existían
en ramas sin fusionar (ADR-0072/rama `color-proposal-rejection-fdbcf3` y
ADR-0078/rama `respuesta-rapida-0b969b`) como *cherry-pick* directo — se
usó la decisión de fondo de la primera (candado de variante en uso +
atómico) pero reconstruida limpia sobre el estado actual del esquema, no
importada tal cual.

**DECIDÍ — tejido/patrón, atributo de PRODUCTO, no de variante:**
confirmado con Felipe: el tejido no cambia entre tallas de la misma prenda;
si un diseño existe en dos telas, son dos productos distintos. Consecuencia
directa: el máximo de variantes por producto sigue siendo talla × color,
nunca 3+ ejes.

**DECIDÍ — filtro por categoría, no vocabulario plano:** `categoria_tallas`
/ `categoria_tejidos` / `categoria_patrones` son tablas puente reales (con
FK, no el array de texto de `categorias.tallas_sugeridas`, que se retira
en esta misma migración). Una categoría/subcategoría **reemplaza**, no
amplía, la lista del padre — decisión explícita de Felipe: más predecible,
un cambio en la categoría padre nunca afecta en silencio a sus hijas.

**DESCARTÉ:** heredar de categoría a subcategoría. Ganas: menos repetición.
Pagas: un cambio en el padre golpea a todas las hijas sin que nadie lo
pida — el costo de sorpresa es mayor que el de escribir la lista dos veces.

**DECIDÍ — talla exige comentario al aprobar, las otras 4 no:** colores/
tejidos/patrones/etiquetas siguen de un clic (ADR-0070: fricción cero,
decidido a propósito). Talla es la única excepción — Felipe: un color de
más es barato de limpiar, una talla mal aprobada ensucia la unicidad de
variante y es más cara de deshacer una vez que hay SKUs colgando.

**DECIDÍ — etiquetas por VARIANTE, no por producto:** pedido explícito de
Felipe — "última unidad" aplica a una talla específica, no a todo el
modelo. `sedes_permitidas` (array, no tabla de unión — hoy son ~4
ubicaciones fijas) restringe venta/traslado; una etiqueta `pendiente` nunca
restringe nada.

**DECIDÍ — el candado de sede se extiende a `transferir`, no solo a
`registrar_venta`:** el diseño original (rama sin fusionar) solo lo puso en
venta. Felipe: es un estado inconsistente real — una prenda restringida a
Tienda TRU podía terminar en AQP por un traslado normal. Una sola función
compartida (`fn_variante_permitida_en_sede`) la usan las dos, para no
repetir el mismo `EXISTS` dos veces con el riesgo de que un día diverjan
(mismo error que ya pasó con "rechazar color" en dos ramas distintas).

**DESCARTÉ:** meter el mismo candado en `registrar_movimiento`
(entrada/salida/ajuste). Esos no mueven una variante HACIA una sede nueva
— ocurren dentro de la sede donde ya se opera. El caso real que rompe la
regla es cruzar de una sede a otra: venta y traslado, nada más.

## Cómo se hace cumplir

- Cada vocabulario nuevo: `estado` (`pendiente`/`aprobado`/`rechazado`),
  trigger `before insert or update` que decide el estado (nunca el
  cliente), candado `check (estado <> 'rechazado' or activo = false)`.
- `fn_variante_permitida_en_sede(variante_id, ubicacion_id)` — única fuente
  de verdad, la llaman `registrar_venta` y `transferir`.
- Las 3 RPC de alta/edición validan tejido/patrón/talla contra la tabla
  puente de la categoría elegida — sin fila ahí, error claro antes de
  escribir nada.

## Cómo se verificó

**No "debería funcionar" — contra Postgres local real, con roles
impersonados (Líder y no-Líder vía `request.jwt.claims`), dentro de
transacciones con `ROLLBACK`:**

1. Talla: proponer sin sesión → `pendiente`; aprobar sin comentario →
   bloqueado con el mensaje exacto; aprobar con comentario → sella
   `aprobado_por`/`aprobado_en`; rechazar algo ya aprobado → bloqueado;
   rechazar una talla con una variante activa usándola → bloqueado.
2. Colores: proponer → rechazar → confirmado `estado='rechazado'`,
   `activo=false`.
3. `crear_producto_con_variantes` con tejido/patrón NO mapeados a la
   categoría → bloqueado con mensaje claro; mapeados → crea correctamente
   con `tejido_id`/`patron_id` sellados en `productos`.
4. `transferir` hacia una sede prohibida por `sedes_permitidas` →
   bloqueado con `traslado_variante_restringida_a_otra_sede`; sede
   permitida → sigue igual que siempre.
5. Las 7 funciones de lectura corren sin error contra datos reales del
   seed (`fn_movimientos`: 45 filas; `fn_prioridad_conteo`: 20; etc.).
6. **El bug real que esto encontró:** el trigger de `tallas` decide
   `estado` mirando `fn_es_lider()` — y una migración corre sin sesión, así
   que el backfill de `categorias.tallas_sugeridas` nacía `'pendiente'`
   pese al `estado='aprobado'` explícito en el INSERT. Se detectó
   navegando `/productos/nuevo` de verdad (la categoría "Blusas", que sí
   tenía 7 tallas migradas, mostraba "sin tallas habilitadas") — no
   inspeccionando SQL. Corregido desactivando el trigger solo durante el
   backfill (`20260917100400`/`20260917100500`).
7. **Otro hallazgo del mismo tipo:** el primer intento de conectar
   `catalogo_crear_producto`/`catalogo_actualizar_producto` partió de la
   firma ORIGINAL (`20260915150001`) sin ver que `20260915170000`
   (stock_minimo) y `20260915224500` (temporada/venta sin stock/fotos) ya
   la habían extendido dos veces más — un `CREATE OR REPLACE` con esa firma
   vieja habría borrado esos tres campos que `ProductoForm.tsx` ya manda
   hoy. Se detectó leyendo `ProductoForm.tsx` antes de dar la conexión por
   cerrada, no en producción.
8. **Flujo completo en navegador, como Felipe (Líder), sesión real:**
   `/productos/nuevo` → categoría "Blusas" → 2 tallas × 2 colores → crear →
   toast "creado, 4 variantes" → `/productos` pasó de 10 a 11 productos,
   102 a 106 variantes → el código corto de cada variante se armó bien
   (`BLU-0003-BLA-S`, etc., confirmando que `fn_asignar_codigo_variante`
   sigue funcionando con `talla_id`) → editar el mismo producto en
   `/productos/[id]/editar` precarga tallas/color correctos → guardar
   cambios → toast "guardado".
9. `pnpm typecheck` (3/3 paquetes), `pnpm lint` y los 293 tests existentes,
   en verde — incluida la corrección de **10 archivos más**
   (`AnularVentaForm.tsx`, `lib/compras.ts`, `lib/conteos.ts`,
   `lib/devoluciones.ts`, `lib/inventario-v2.ts`, `lib/produccion.ts`,
   `lib/ventas-v2.ts`) que leían `variantes.talla` directo en un `.select()`
   de PostgREST y el compilador de tipos generados marcó uno por uno.

**Límite, dicho sin adornos:** no se probó `registrar_venta` de punta a
punta en el navegador (exige caja abierta — se verificó la lógica del
candado de sede por SQL directo, con el mismo patrón que `transferir`, pero
no clickeando una venta real). Las 4 pantallas de administración de
vocabulario (`/productos/tallas`, `/productos/tejidos`, `/productos/patrones`,
`/productos/etiquetas`, mismo patrón que `ColoresLista.tsx`) no se
construyeron en esta pasada — hoy el backend está listo y probado, pero
proponer/aprobar/rechazar un tejido o una talla nueva no tiene pantalla
propia todavía. Mapear qué categorías ofrecen qué talla/tejido/patrón
(`categoria_tallas` etc.) tampoco tiene UI — hoy solo lo backfillado desde
`tallas_sugeridas` existe; agregar una talla nueva a una categoría exige
SQL directo hasta que exista esa pantalla.
