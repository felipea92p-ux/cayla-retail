> Anexo de diseño de ADR-0362 (sesión «Flujo de órdenes de compra», 2026-10-07/08). Salida de un workflow de agentes: **las
> decisiones de Felipe en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` mandan sobre este texto** donde choquen.
> Lo que existe hoy en el repo y en producción, leído al 2026-10-07 (compras, catálogo, numeración, recepción) y contraste del brief con el ERP.

### Lectura «compras»
Modelo actual de Compras, leído en el repo y verificado en vivo en producción (vovjyyiafkxteijimpuy) el 2026-10-07. Solo lectura, no edité nada.

## 1. Tablas reales (producción)

- **`compras`**, creada en `20260912231956_compras_desde_factura.sql:123`.
  - Columnas: proveedor_id!, tipo! (factura | boleta | nota_venta | recibo_por_honorarios), serie!, numero!, fecha_emision!, condicion! (contado | credito), fecha_vencimiento, subtotal!, igv!, total!, estado! (vigente | anulada), motivo_anulacion, nota, usuario_id, token_cliente, fecha_estimada_llegada, ubicacion_gestion_id, anulada_por, anulada_at, naturaleza! (mercaderia | gasto | activo).
  - Fotos mantenidas por trigger: pagado, facturado_cantidad, recibido_cantidad, cerrado_cantidad, notas_credito.
  - Columnas generadas: documento, saldo, estado_pago, estado_recepcion.
  - Se eliminó `ubicacion_destino_id` (`20260919173000…:285`). Ahora el destino vive en el reparto.
  - Restricciones:
    - `unique(proveedor_id, serie, numero)`.
    - `compras_total_cuadra`, `compras_igv_solo_factura`, `compras_credito_tiene_vencimiento`.
    - `compras_no_sobrerecibida` y `compras_no_sobrepagada` (`20260918202000…:83-84`).
    - `compras_gestora_obligatoria` (`20260923180200…:110`) y `compras_no_mercaderia_sin_unidades`.
  - Triggers: `compras_mes_abierto`, `compras_gestora_con_parte`, `compras_naturaleza_fija`, `compras_gasto_se_anula_desde_gastos`.
- **`compra_items`** (`…231956:151`): compra_id!, **producto_id! (NOT NULL)**, variante_id (nula si la factura viene agrupada por modelo), descripcion, cantidad! (>0), costo_unitario!, subtotal (generada). Triggers: `compra_items_foto` y `compra_items_reparto_cuadra`.
- **`compra_item_destinos`** (`20260919172000…:83`): PK (compra_item_id, ubicacion_id), cantidad > 0.
  - El trigger `fn_compra_item_reparto_cuadra` exige que **la suma sea igual a lo facturado** y que a una tienda no le quede asignado menos de lo que ya recibió o cerró.
  - `fn_gestora_con_parte` exige que la tienda gestora conserve parte de la mercadería.
- **`compra_reasignaciones`** (`…172000:93`): solo se agrega, nunca se edita. Motivos: llego_de_mas, error_de_tienda, otro.
- **`compra_item_cierres`** (`20260918201000…:63`): solo se agrega, nunca se edita. compra_item_id, cantidad, motivo (no_llego | danada | error_proveedor), ubicacion_id!.
- **`compra_pagos`**: compra_id, fecha, monto, metodo, referencia, pago_grupo_id, ubicacion_id, cuenta_dinero_id, caja_movimiento_id. Triggers: mes abierto, `no_supera_tienda`, `sellar_cuenta`.
- **`envios`** (`20260919120000…:45`): ubicacion_id!, numero_guia, nota, recibido_por, fecha_recepcion, token_cliente. **Es la llegada a la puerta de la sede (lado de quien recibe), no un despacho.** No tiene despachado_por, ni estado, ni orden ni proveedor.
- **`lotes`** (`0002_esquema.sql:185`): ubicacion_id!, proveedor_id!, numero_guia, fecha_recepcion, recibido_por, nota, envio_id, token_cliente. El `orden_compra_id` se borró en `…231956:72`. Hoy no hay ningún enlace del lote a una compra o a un fardo: ese enlace va por `movimientos.compra_item_id` (`…231956:177`).
- **`envio_extras`**: movimiento_id (PK), envio_id, proveedor_id, es_regalo, nota.
- **Vistas.** `compras_resumen` es cabecera + proveedor + vencida + recepcion_atrasada + `ubicaciones_destino[]`, sacado de los destinos. `compra_item_reparto_resumen` da, por cada (línea, sede): asignado, recibido (movimientos por compra_item_id y sede), cerrado y pendiente. También existen `compra_items_resumen` (la lee `lib/compras.ts:412`) y `compra_parte_por_tienda`, que prorratea el dinero por sede según el peso del subtotal.

## 2. Funciones RPC (firmas en producción)

- **`registrar_compra(p_proveedor_id, p_serie, p_numero, p_condicion, p_ubicacion_destino_id, p_items jsonb, p_tipo, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago jsonb, p_nota, p_total, p_token, p_fecha_estimada_llegada)`**
  - Ojo: `p_ubicacion_destino_id` es en realidad la tienda gestora.
  - Validaciones:
    - Permisos: `fn_puede_registrar_facturas_compra` + `fn_puede_comprar_en`.
    - Cada línea exige producto_id, y la variante tiene que pertenecer a ese producto.
    - El reparto tiene que sumar lo facturado; el total tiene que cuadrar con las líneas.
    - Contado: el pago es obligatorio y debe ser igual al total. Crédito: exige fecha de vencimiento.
    - `p_pago` exige `fn_puede_pagar_compras`.
    - Revisa el costo atípico.
    - Token idempotente: el índice único `compras_token_cliente_key`.
    - Firma con `fn_actor_persona_id(true)`.
- **`recibir_compras(p_ubicacion_id, p_items, p_numero_guia, p_nota)`**
  - Bloquea con `fn_bloquear_en_orden`.
  - Compara con lo asignado, recibido y cerrado de su sede.
  - **Exige que la variante pertenezca a `v_linea.producto_id`** (cuerpo de la función, líneas 96-102).
  - Recalcula el costo.
- **`recibir_envio(p_ubicacion_id, p_items, p_extras, p_traslados, p_cierres, p_notas_credito, p_numero_guia, p_nota, p_token)`**: crea el envío, un lote por proveedor y los extras, y pasa las líneas de comprobante por `recibir_compras`.
- **`recibir_lote(p_ubicacion_id, p_proveedor_id, p_items, p_numero_guia, p_nota, p_token)`**: candado consultivo por token, `fn_puede_operar_ubicacion`, costo atípico, inserta en `lotes` y `movimientos`. **No conoce compras.**
- **`anular_compra(p_compra_id, p_motivo)`**: bloquea si la factura tiene pagos, mercadería recibida, notas de crédito o cierres. Firma con anulada_por.
- **`registrar_pago_compra(p_compra_id, p_monto, p_metodo, p_referencia, p_fecha)`** y sus variantes `registrar_pagos_compra`, `registrar_pago_compras` y `_medios`.
- **`fn_aplicar_candado_de_dinero()`** (ADR-0126): reinyecta el candado de montos en las funciones de indicadores. `fn_compras_ubicaciones` / `fn_compras_visibles` / `fn_compra_es_de_mis_tiendas` hacen que cada tienda vea lo suyo (ADR-0184, `20260924100000…`).

## 3. Si `compra_items.producto_id` pasa a ser opcional y la línea va por categoria_id + marca_id

**Se rompe:**
- `registrar_compra`: rechaza la línea con «Cada línea necesita producto_id». También su revisión de costo atípico, que hace join de `variantes` por `producto_id`.
- `recibir_compras` (líneas 100-102): con producto_id nulo **rechaza toda recepción** contra esa línea. Arrastra a `recibir_envio`.
- Funciones que leen producto_id de la línea, según producción:
  - De compras: `lineas_compra_operativo`, `fn_mi_parte_de_compra`.
  - Análisis: `fn_analisis_por_llegar`, `fn_analisis_sede`.
  - Catálogo e historial: `fn_costo_historial`, `fn_origen_producto`, `fn_producto_historia`, `fn_productos`, `_facetas`, `_listado`, `_resumen`.
  - Movimientos y proveedor: `fn_movimientos`, `fn_proveedor_costo_evolucion`.
  - Hay que revisarlas una por una: varias hacen join interno y la línea desaparecería sin aviso.
- Vista `compra_items_resumen`: expone producto_id.
- Web:
  - `lib/compras.ts:361,413,421,439`.
  - `components/CompraFormV2.tsx:50,71,141,153,222`.
  - `lib/compra-form-progreso.ts:84-88`: «válida» hoy significa que tiene productoId.
  - `components/RecepcionEnvio.tsx:314,870`: `traeLinea` empareja por productoId.
  - `lib/envio-reglas.ts`.

**No se rompe:** destinos, cuadre del reparto, cierres, reasignaciones, pagos, `compra_parte_por_tienda` y `anular_compra` (no usan producto).

## 4. Qué se puede reusar

1. **Orden de compra.** Sin `compras` ni la tabla vieja `ordenes_compra`, que se borró.
   - **No puede vivir en `compras`:** serie y número son NOT NULL y únicos, y además están el candado de mes abierto, la gestora obligatoria, las fotos de pago y los indicadores de dinero.
   - Tablas nuevas: `ordenes_compra` (correlativo por secuencia; estados generada / anulada / recibida) y `orden_compra_items` (categoria_id!, marca_id, descripcion, cantidad, precio_unitario, descuento_pct).
   - Patrones a copiar: token_cliente, `fn_actor_persona_id(true)`, `fn_puede_comprar_en`.
2. **Comprobante cargado desde la OC.** Reusar `registrar_compra` entero (contado ⇒ pago, IGV, cuadre, token, candado de dinero) agregando `compras.orden_compra_id` y `compra_items.orden_compra_item_id`. Requiere el punto 3: producto_id opcional + categoria_id, y relajar el candado de `recibir_compras` cuando la línea no trae producto.
3. **Reparto por sede.** Reusar `compra_item_destinos` + `compra_item_reparto_resumen` + `reasignar_reparto_compra` + `cerrar_linea_compra` tal cual, porque ya van por (línea, sede). La regla «suma = facturado» es justo el reparto a todas las sedes. `fn_gestora_con_parte` puede chocar con «todo a una sede distinta de la gestora».
4. **Despacho, fardo y guía.** `envios` no sirve como despacho: es del lado de la recepción. Tablas nuevas:
   - `guias`: numero_guia opcional; agrupa fardos, y así varias facturas quedan en una guía.
   - `fardos`: orden_compra_id, proveedor_id, ubicacion_destino_id, guia_id, despachado_por (`fn_actor_persona_id(true)`), despachado_at y estado (en_camino → abierto → cerrado). La sesión de Recepción solo hace las dos últimas transiciones.
   - `fardo_items`: fardo_id, orden_compra_item_id, categoria_id, cantidad, descripcion.
   - Candado «lo repartido ≤ lo pedido»: un trigger como `fn_compra_item_reparto_cuadra`, pero con ≤.
   - `lotes` necesita una columna nueva `fardo_id`.
   - Recepción usa `recibir_lote` tal cual. La diferencia por categoría sale de `fardo_items` menos `movimientos` del lote, uniendo `variantes`→`productos.categoria_id`.

Riesgo de choque: compras, envíos y lotes están en 0 en producción (2 lotes), así que relajar `producto_id` no rompe datos. Lo que rompe son las funciones y la web listadas en el punto 3.

### Lectura «catalogo»
**Informe del modelo de catálogo para la orden de compra y el fardo** (solo lectura, ningún archivo editado)

**1. ¿`categoria_id` sirve para comparar lo pedido contra lo contado?**
- Sí. `productos.categoria_id` es una llave obligatoria a `retail.categorias`. Los nombres se pueden renombrar pero el id no cambia, así que sirve para comparar.
- Sí hay subcategorías, pero de un solo nivel. Están en `supabase/migrations/20260915224501_categorias_subcategoria.sql:28-32`: la columna `categoria_padre_id` es opcional y por defecto vacía.
  - El trigger `fn_valida_categoria_subcategoria` (`:40-89`) impide tener nietas y que una categoría que ya es madre pase a ser hija.
  - La hija hereda siempre la familia de su madre (`:78`).
- En producción hoy no hay hijas: `categoria_padre_id` estaba vacía en las 45 filas (`20260918160000_etiquetas_descuento_y_categorias.sql:38-41`). Ese mismo archivo deja abierta la pregunta «si "Jeans" cubre a "Jeans niño" se decide al leer».
- La familia viaja como texto en `categorias.familia`, que apunta a `familias.codigo` (`20260918010000_familias_tabla_propia.sql`). No sirve para comparar: es demasiado gruesa.
- **Si la orden pide en la categoría madre y la prenda nace en una hija:**
  - Propuesta: comparar por categoría efectiva, `coalesce(c.categoria_padre_id, c.id)`, a ambos lados.
  - Como hay un solo nivel, alcanza un único `coalesce`, sin recursión.
  - Así, una línea pedida en «Vestidos» se compara contra todo lo contado en «Vestidos» más «Vestidos largos».
  - Si la orden pide justo en la hija, la comparación es exacta.
  - Conviene que la línea de la orden acepte cualquiera de las dos y que la regla viva en una sola función, por ejemplo `fn_categoria_raiz(id)`, que usen Compras y la recepción.

**2. Marcas**
- Las tablas están en `20260918231000_marcas_y_proveedor_en_productos.sql`:
  - `retail.marcas` (`:42`), con nombre único sin distinguir mayúsculas ni espacios (`:51`). Solo un líder la edita (`:73-74`).
  - `retail.marca_proveedores` (`:57-61`), una relación N:N: un proveedor trae varias marcas y una marca puede llegar por más de un proveedor.
- `productos.marca_id` y `productos.proveedor_id` existen y son opcionales desde ADR-0283 (`20260930020000_producto_sin_marca_ni_proveedor.sql:50-51`).
  - La llave compuesta `productos_marca_proveedor_fk` es MATCH SIMPLE (`:16-20`): si vienen los dos, tienen que ser una pareja registrada; si viene uno solo, no se comprueba.
  - `fn_validar_marca_proveedor` exige que lo que venga esté activo (`:59+`).
  - Al editar no se puede borrar una marca ya guardada (`:33-37`).
- **Consecuencia para la orden de compra:** si una línea lleva marca y la orden un proveedor obligatorio, la pareja debería existir en `marca_proveedores`. Si no, el producto creado al abrir el fardo con esa marca y ese proveedor será rechazado por la llave. Hay que validarlo al guardar la orden, o crear la pareja ahí mismo con la función `crear_marca(p_nombre, p_proveedor_id)` (`apps/web/components/alta-producto/NuevaMarcaForm.tsx:242`).

**3. Qué función crea un producto con sus variantes**
- La pantalla usa `retail.crear_producto_con_stock_inicial(...)` (`apps/web/components/NuevoProductoForm.tsx:588`; versión actual en `20260928100000_temporadas_como_atributo.sql:652-666`). Por dentro envuelve a `crear_producto_con_variantes` (`:700`) y suma una carga inicial opcional por sede.
  - Firma de 14 parámetros: `p_referencia, p_categoria_id, p_variantes jsonb, p_descripcion, p_token, p_tejido_id, p_patron_id, p_confirmo_distinto, p_etiqueta_ids, p_marca_id, p_proveedor_id, p_ubicacion_id, p_al_piso, p_temporada`.
- **Datos mínimos que exige `crear_producto_con_variantes`** (último cuerpo completo en el repo: `20260918231100_alta_y_edicion_exigen_marca_y_proveedor.sql:68-254`; producción tiene parches por ancla encima):
  - Nombre (`referencia`) con al menos una letra o número (`:108-112`).
  - Una categoría activa (`:115`).
  - Al menos una variante (`:120`).
  - Precio de venta por variante, 0 o más, obligatorio (`:201-205`). El costo es opcional y por defecto 0 (`:202`).
  - Colores y tallas activos, y las tallas habilitadas para esa categoría (`:211-220`). Sin combinaciones talla-color repetidas (`:226`).
  - **Tejido y patrón obligatorios si la familia los exige** (Indumentaria), y habilitados para la categoría (`:149-181`).
  - Frena el nombre idéntico y el que se escribe casi igual (`:139-143`). Desde `20261002120100_nombre_unico_por_marca_y_carrera_entre_sedes.sql:14,156` solo compara dentro de la misma marca.
  - No exige fotos (ADR-0260: las fotos se suben aparte al crear) ni código de barras.
- **Quién puede llamarla:**
  - El `fn_es_lider()` original se cambió por `fn_puede_editar_catalogo()` (`20260922200000_terminales_por_tienda.sql:329`).
  - `fn_puede_editar_catalogo()` = líder, o un rol que ve el módulo `productos` o `atributos` (`20260923030000_roles_por_modulo.sql:443-445`).
  - Es decir, una encargada de sede que solo ve Inventario o Recibir **no puede** usarla.
- **Alternativa que ya existe para crear la prenda en la sede:** `censo_crear_variante(p_referencia, p_categoria_id, p_codigo_barras, p_talla_id, p_color_codigo, p_costo, p_precio, p_marca_id, p_proveedor_id)` (`20260923193700_costo_solo_con_permiso_de_dinero.sql:309`).
  - Sigue el patrón proponer/aprobar: la prenda queda con `productos.estado_alta = 'pendiente'` y se puede contar y vender ya, y un líder la revisa después (`20260918020000_censo_alta_al_vuelo.sql:1-40`).
  - Exige nombre, categoría y **código de barras**; precio y costo valen 0 o más.
  - Crea una variante por llamada.
  - La sesión de recepción debería partir de esta función (o de una variante sin código de barras), no de `crear_producto_con_variantes`, para no tener que dar el módulo Productos a la sede.
  - Pendiente de decidir: el bloqueo por tejido y patrón no aplica en este camino.

**4. El costo de una variante**
- `variantes.costo` es `numeric(12,2) not null default 0 check (>= 0)` (`0002_esquema.sql:58`). Es un solo valor global, no uno por sede.
- `fn_recalcular_costo_variante(variante_id, cantidad, costo_unitario, origen, movimiento_id)` (`20260916090000_costo_promedio_ponderado.sql:91-178`; ADR-0067):
  - Calcula el promedio ponderado contra el stock de **todas** las sedes (`:127-132`). Si el stock previo es 0, toma el costo nuevo tal cual.
  - Deja rastro en `costo_historial`.
  - Hay que llamarla **antes** de `fn_aplicar_movimiento`.
  - No es ejecutable por `authenticated` (`:174-175`).
  - Hoy la llaman `recibir_lote`, `recibir_compras` y `cerrar_produccion`.
- `recibir_lote(p_ubicacion_id, p_proveedor_id, p_items, p_numero_guia, p_nota, p_token)` (`20260930122000_recibir_lote_costo_atipico.sql:47-54`):
  - Recalcula el costo solo si la línea trae `costo_unitario` (`:132`).
  - Marca los costos atípicos con `fn_costo_fuera_de_banda` (`:83-96`).
- **Choque con el contrato pedido** («la sede no pone el costo»): la sede debería llamar `recibir_lote` sin `costo_unitario`, y el costo tendría que entrar por la factura o nota de venta. No existe ninguna función que aplique el costo **sin movimiento de stock**. `fn_recalcular_costo_variante` asume que la cantidad nueva todavía no está en el stock, así que llamarla después de que la sede contó deja el promedio mal. Hace falta una pieza nueva, por ejemplo `fn_ajustar_costo_por_factura`, que recalcule sobre el stock ya entrado. Es decisión de Felipe porque toca dinero.
- Leer el costo exige permiso de dinero: `fn_costos_variantes_json` (`20260923193700_costo_solo_con_permiso_de_dinero.sql:41-53`).

### Lectura «numeracion»
## Hallazgos (solo lectura)

### 1) Correlativos sin huecos: tres patrones que ya hay en el repo

- **Contador global, una fila por clave.** Lo usan los códigos de producto.
  - La tabla `retail.codigos_correlativos(prefijo pk, ultimo int)` está en `supabase/migrations/20260912235500_vocabulario_cerrado.sql:136-147`. Su comentario explica por qué es una tabla y no una `sequence`: una secuencia quema el número cuando la transacción hace rollback.
  - `fn_siguiente_correlativo(p_prefijo)` está en `:149-158`. Hace un `insert … on conflict do update set ultimo = ultimo+1 returning`, que toma un lock de fila: es atómico y no deja huecos.
  - El permiso de ejecución se revoca a `authenticated` en `20260917150001_revocar_execute_correlativos_y_codigos.sql:68-69`.
- **Series de comprobantes de venta por sede.**
  - La tabla `retail.series_comprobantes(ubicacion_id, tipo, serie, siguiente_numero)` está en `0010_facturacion.sql:32-39`.
  - La versión vigente de `fn_reservar_numero_serie` está en `20260929170000_notas_de_credito_una_serie_por_letra.sql:61`: hace `select … for update` en `:77` y `update … siguiente_numero = v_numero+1` en `:85`.
  - El ADR-0165, punto 6 (`docs/adr/0165-comprobantes-envio-automatico-y-series.md:23`), dice que un número nunca se reusa, que la serie se archiva en vez de reemplazarse, y que hay un `unique (tipo, serie, numero)`.
- **Correlativo por sede con `for update` explícito.** Lo usan las separaciones: `separacion_correlativos` en `20260923090000_separaciones.sql:57`, y el insert + `for update` + update en `:423-425`.
- **Recomendación para la orden de compra.** Reusar `fn_siguiente_correlativo('OC')`: una fila nueva en `codigos_correlativos`, de toda la empresa. Además, `ordenes_compra.numero` con `unique` y `not null`, asignado dentro de la misma RPC `security definer` que inserta.
  - Anular es solo cambiar `estado='anulada'`: la fila se queda, así que el número nunca se libera.
  - Riesgo: `codigos_correlativos` comparte espacio con los prefijos de categoría (`MAQ`, `LAP`…). Hay que verificar que ninguna categoría use `OC` como prefijo, o usar una clave como `'orden_compra'`, que no puede chocar.

### 2) Cómo se da de alta un módulo nuevo

1. **Migración.** `insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) … on conflict (clave) do nothing`, sin ningún insert en `rol_modulos`. El ejemplo es `20261005220000_plan_de_campana.sql:72-76`. Lo vigila `apps/web/lib/modulos.test.ts:350-351`.
2. **Claves en la web.** `CLAVES_MODULO` está en `apps/web/lib/modulos.ts:13-26` y `MODULOS` en `:46` y siguientes. El orden tiene que coincidir con el de la base: `modulos.test.ts:71` lo compara contra todas las migraciones.
3. **Menú.** Un nodo con `modulo: "<clave>"` en `apps/web/lib/menu.ts`. El grupo Compras está en `:352` y siguientes y sus hojas en `:356-366`, con `exige: "verDineroCompras"`. Lo vigila `modulos.test.ts:117`.
4. **Puerta.** Un `layout.tsx` que llame a `await exigirModulo("<clave>")`, definido en `apps/web/lib/persona-actual.ts:246`. El modelo es `app/(app)/compras/plan/layout.tsx`. Por encima ya está el layout de `/compras`, que pide `verDineroCompras` (`app/(app)/compras/layout.tsx:33`).
5. **Guía de foco.** Hay que declarar las pantallas y modales nuevos en `lib/guia-de-foco-pantallas.ts`.

**Módulos de Compras hoy** (clave, con su `orden` entre paréntesis):

| Clave | Orden |
|---|---|
| `facturas_compra` | 150 |
| `recibir` | 160 |
| `por_pagar` | 170 |
| `proveedores` | 180 |
| `notas_credito` | 190 |
| `plan_compra` | 195 |

Siembra en `20260923030000_roles_por_modulo.sql:96-100` y en `20261005220000_plan_de_campana.sql`. El siguiente es `produccion` (200).

- En esta rama `recibir` sigue en el grupo «Compras» (`modulos.ts:80`). La sesión de Recepción lo movió a Inventario en producción, pero ese cambio todavía no está en `main`. En el menú ya hay dos filas que apuntan a `/recibir`: `menu.ts:320` (Inventario) y `:360` (Compras).
- **Orden libre para `ordenes_compra`:** 145, justo antes de `facturas_compra`. No hay ninguno entre 141 y 159 salvo el 150; `etiquetas` usa el 140.

### 3) Choques de numeración

- **ADR.** El más alto en `origin/main` es el **0360**, y también en los 74 worktrees locales y en todas las ramas locales y remotas revisadas. El 0361 está reservado por la sesión de Recepción. Ni su rama (`claude/recepcion-mercaderia-inventario-16e55e`) ni su worktree aparecen en local ni en `origin`, así que no pude leer su ADR. **Propongo el ADR-0362.**
- **Migraciones 20261007\* y 20261008\*.**

  | Migración | Dónde está |
  |---|---|
  | `20261007100000_analisis_liquidar_desde_sin_tope.sql` | `main` y varios worktrees |
  | `20261007120000_analisis_salio_al_piso.sql` | worktree `erp-analysis-module-design-c1a525`, rama local `claude/analisis-nunca-salio-al-piso`, sin subir a `origin` |

  - **Ese `20261007120000` choca de verdad** con el número que la sesión de Recepción dice tener.
  - Hay además una inconsistencia: el pedido de Recepción dice que su migración es la `20261007120000`, pero la tarea dice que en producción está `20261007182535_recibir_es_de_inventario`. No consulté la base para confirmar cuál es la real.
  - No existe ninguna migración `20261008*` en el repo ni en las ramas.
- **Rango que propongo para órdenes de compra:** `20261008100000` a `20261008109999`, por ejemplo `20261008100000_ordenes_compra.sql`, `…100100_despacho_fardos.sql`, `…100200_modulo_ordenes_compra.sql`. Queda lejos de 20261007\* y del sufijo `182535`. Antes de fijarlo, conviene correr una consulta de solo lectura en producción: `select version from supabase_migrations.schema_migrations where version like '20261008%'`.

### Lectura «recepcion»
**Lado de recepción y movimiento entre sedes: hallazgos de la investigación (solo lectura)**

**1. `recibir_lote`**
- La definición vigente es `supabase/migrations/20260930122000_recibir_lote_costo_atipico.sql:47-53`. Firma: `recibir_lote(p_ubicacion_id uuid, p_proveedor_id uuid, p_items jsonb, p_numero_guia text default null, p_nota text default null, p_token uuid default null) returns uuid`, y devuelve `lote_id`. La línea 14 de esa migración advierte que otras migraciones nombran esta función por su firma exacta. Si se cambia la firma, se crea una sobrecarga en vez de reemplazarla.
- Contra el doble clic (ADR-0190, :65-70) usa un advisory lock y `lotes.token_cliente`: un segundo intento con el mismo token devuelve el lote ya creado.
- Exige `fn_puede_operar_ubicacion` (:74). Si el costo viene fuera de rango, lanza `costo_atipico` y solo un líder lo confirma (:85-108).
- Escribe un `insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)` (:114), firmado con `fn_actor_persona_id(true)` (:111). Por cada ítem escribe un `movimientos` con `tipo='entrada'`, `motivo='recepcion'` y `lote_id`, en la sububicación de entrada (:127-129). Si la línea trae `costo_unitario`, llama a `fn_recalcular_costo_variante(…,'compra',mov)` (:131-139). Al final aplica `fn_aplicar_movimiento`.
- **No acepta ningún vínculo externo.** No hay parámetro de envío, compra ni fardo. `lotes` tiene `envio_id` (`20260919120000_envios_recepcion_multiproveedor.sql:64`), pero solo lo escribe `recibir_envio`. La columna `orden_compra_id` se borró en `20260912231956_compras_desde_factura.sql:72`. Para ligar el lote al fardo hace falta una de dos cosas: un parámetro nuevo o una RPC envoltorio que haga `update lotes set fardo_id`. Lo más limpio es que la otra sesión cree un `recibir_fardo`, como ya hace `recibir_envio`.
- La cola sin conexión (ADR-0210) está en `apps/web/lib/cola-offline.ts` y `lib/useColaRecibir.ts`. Sus RPC permitidas son `["recibir_envio","recibir_lote"]` (`lib/cola-offline.test.ts:8`). Una RPC nueva tendría que sumarse ahí.

**2. La pantalla `/recibir`**
- `apps/web/app/(app)/recibir/page.tsx` monta `LlegoMercaderia`, que es la puerta única de ADR-0330 y usa el motor `recibir_lote`. Al lado están `RecepcionEnvio` (la rama «viene con factura», motor `recibir_envio`), `KpisRecibir`, `RecepcionesCompraLista`, `RecepcionesRecientes` y `AvisoTrasladosEnCamino`.
- `recibir_envio` está en `20260919121000_recibir_envio.sql:49-59`, con el costo atípico en `20260930124000`. Recibe `p_items`, `p_extras`, `p_traslados`, `p_cierres` y `p_notas_credito`. Crea un `envios`, un lote por proveedor con `envio_id`, filas en `envio_extras` y `envio_traslados`, y los cierres de faltante con motivo.
- **Ojo con el nombre:** `envios` (:45-52) es una **llegada a la puerta**: una sede, una guía, `recibido_por`, `fecha_recepcion`. No es un despacho. No conviene reutilizar el nombre «envío» para el despacho del fardo.
- ADR-0330 (:90) deja pendiente su «Fase 2»: unir una factura a una o varias llegadas ya recibidas. La regla «una factura ↔ varias llegadas de varias sedes desde el primer día» (:50) es justo el caso del fardo.
- Ya existe un **precedente de reparto por sede** en `20260919172000_reparto_compra_por_tienda.sql:83-90`. Es `compra_item_destinos(compra_item_id, ubicacion_id, cantidad>0)`, con pk `(compra_item_id, ubicacion_id)`. El trigger `fn_compra_item_reparto_cuadra` (:253) controla que el reparto cuadre, y `compra_reasignaciones` (:93) registra cuando una línea se mueve de una sede a otra, con motivo cerrado. El candado de sobre-recepción es `compras_no_sobrerecibida`: `recibido + cerrado <= facturado` (`20260918202000…:84`). Ese es el modelo directo del candado 5, «lo repartido de una línea entre sus fardos ≤ lo pedido».

**3. Traslados entre sedes (`retail.transferencias`)**
- La tabla se creó en `0002_esquema.sql:306-324`, con `transferencia_items(variante_id, cantidad, movimiento_id)` y unique `(transferencia_id, variante_id)`.
- Las dos fases se agregaron en `20260916150000_traslados_dos_fases.sql:56-61`: `fecha_estimada_llegada`, `confirmado_por/en`, `cerrado_por/en`, `nota_cierre`.
- Los estados están en `20260927160000_traslados_recibir_sin_perder_nada.sql:77`: `completada | en_transito | recibido_con_diferencia | cerrada | anulada`. La anulación lleva checks de coherencia: fecha, motivo y quién (:80-89). El correlativo `numero` está en `20260916200000…:43`.
- **No tiene columna de guía de transportista.** La «guía» de ADR-0242 es un papel impreso con QR que abre el conteo de ese traslado, y a propósito no dice cantidades: es conteo ciego (`docs/adr/0242-…:39-44`).
- **No sirve como tabla del fardo.** Al despachar escribe un `movimientos` `tipo='salida'`, `motivo='traslado_salida'` desde la sede de origen (ADR-0068:35). Eso exige stock en el origen y `variante_id` por línea. La mercadería del proveedor todavía no está en el stock de ninguna sede, y la línea del fardo va por `categoria_id`, no por variante.
- **Sí sirve como modelo de estados y firmas:** en camino → abierto → cerrado, con quién y cuándo en cada paso, anulación con motivo, número correlativo, QR y conteo ciego. Recomendación: una tabla propia, por ejemplo `retail.fardos` (`compra_id` u `orden_compra_id`, `proveedor_id`, `ubicacion_destino_id`, `estado`, `despachado_por/en`, `numero_guia` opcional, `abierto_*`, `cerrado_*`), con `retail.fardo_items(fardo_id, orden_compra_item_id, categoria_id, cantidad>0, descripcion)`. El candado de suma por línea iría en un trigger, como `fn_compra_item_reparto_cuadra`.

**4. Avisos a Compras o al líder**
- **No hay una tabla genérica de avisos ni de notificaciones.** `separacion_avisos` (`20260926233000…:25`) es solo la constancia de un WhatsApp a un cliente.
- Los avisos del Inicio («Te toca») se **calculan** en `apps/web/lib/inicio-avisos.ts`. `avisosInicio(f: FuentesAvisos)` está en :110, las claves en :21-38 (ya existen `recibir`, en :363, y `porPagar`, en :343), y los niveles son `urgente|toca|info|aldia|sinleer`. Cada aviso sale de una lectura que ya existe y solo lo ve quien tiene el módulo (ADR-0161). El modelo más cercano es `perdidas` (:304-318), que se alimenta de `retail.fn_perdidas_resumen`.
- Esto calza con «la diferencia no se guarda, se calcula». Hace falta una función de lectura (por ejemplo `fn_fardos_con_diferencia`: esperado por categoría menos contado en los lotes del fardo cerrado), una clave nueva en `ClaveAviso`, y el aviso con `grupo: "Compras"`, nivel `toca` y `href` a la OC o al fardo.
- El registro de actividad es aparte: `lib/actividad-reglas.ts` y `fn_actividad` (ADR-0207). `recibir` ya anota actividad.

**Respuestas que se desprenden para la sesión «Recibir Mercadería»**
- (a) El fardo todavía no es tabla. El reparto que existe hoy es `compra_item_destinos`, que va por compra o factura, no por OC.
- (b) Por esta investigación, la línea debería ir por `categoria_id`. Esa decisión le toca al lado de la OC.
- (c) Encaja que nosotros creemos el fardo «en camino» y ella lo pase a abierto y cerrado, siguiendo el patrón de los estados de `transferencias`.

---

# El brief contra el ERP

### fondo
Respuesta corregida: revisé los archivos del repo. No volví a consultar producción, así que las cifras de producción quedan como las dio el otro agente, sin verificar.

**Hoy no existe un fondo por rendir a nombre de una persona.** Lo más cercano es una sola cuenta de efectivo sin dueño, «lo que tiene el líder». Esto se confirma en el repo:
- El tipo `por_rendir` está en `cuentas_dinero` (`20260925110000_finanzas_cuentas_y_dinero.sql:70`).
- Solo puede haber una: hay un índice único por tipo (línea 99).
- Nace sola como «Efectivo entregado al líder» (línea 114) y no se archiva (líneas 129-130).
- La tabla no tiene columna de persona.
- Su saldo se suma, no se guarda. Sale de los traslados del cierre de caja con destino `'lider'` (línea 452) y de `movimientos_dinero`.
- Solo el líder la mueve (`20260925150000_finanzas_cuenta_sellada.sql:138-139`).
- Ninguna migración tiene «rendición» en el texto.

Dato de producción sin verificar: la cuenta tendría 0 movimientos y 0 traslados al líder.

**Cómo se pagan hoy las compras.** Se confirma:
- `fn_cuenta_sirve` (línea 63) dice qué cuenta vale para cada medio. El efectivo puede salir del cajón, la caja fuerte o la cuenta por rendir. La tarjeta, de la tarjeta de crédito o un banco. Lo demás, de un banco o billetera.
- La cuenta de cada pago se graba al pagar y después no cambia (líneas 385-386).
- El saldo a favor no sale de ninguna cuenta (línea 390).
- Si el pago sale de un cajón, se crea el egreso de caja «Pago a proveedor» (líneas 405-410).

Dato de producción sin verificar: `compra_pagos` estaría vacía.

**Qué serviría de base, con una corrección:**
1. Agregar a `cuentas_dinero` un tipo `fondo_encargada` con persona, sin el límite de uno solo. Así hereda el saldo calculado, la cuenta grabada al pagar y los movimientos anulables. Hay que sumar el tipo nuevo a `fn_cuenta_sirve` (línea 63) y al bloque de reglas de puntas (líneas 288-295).
2. **[FALSO en la respuesta original]** «La entrega sería un `entre_cuentas` del banco al fondo; ya está permitido (línea 192)». La línea 192 solo enumera los tipos de movimiento. La regla de la línea 295 rechaza un `entre_cuentas` que no vaya de banco a banco, y ninguna migración posterior la cambia. Lo único que hoy entra a una cuenta de efectivo desde un banco es nada: un `deposito` solo va de efectivo a banco. Para registrar la entrega hay que **cambiar esa regla** (o crear un tipo `entrega_fondo`) en la misma migración.
3. La tabla de rendiciones es lo único nuevo de verdad: cruzaría `compra_pagos` y `gastos` de esa cuenta, y registraría el sobrante devuelto. Ese sobrante también necesitaría su propio tipo de movimiento, del fondo al banco o a la caja fuerte.

**Recomendación:** que el fondo de la encargada sea una cuenta aparte, sin tocar «Efectivo entregado al líder». La regla de la línea 138 («solo el líder la mueve») choca con que la encargada pague con su propio fondo.

### llegada
Las afirmaciones centrales se sostienen en el repo; solo corrijo una cita. Revisé `fn_recalcular_costo_variante`, `costo_historial.origen`, la lista de categorías de gasto, la validación y el candado de `registrar_gasto`, la cuenta 609 sin categoría y la ausencia de viáticos y fondo por rendir. Lo de producción (proyecto `vovjyyiafkxteijimpuy`, 0 filas en `retail.gastos`) no lo volví a consultar.

**Veredicto: no existe nada para costos de llegada ni para viáticos, y Gastos no bloquea la mercadería con una regla explícita.**

1. **El costo de la prenda no incluye flete.** `retail.fn_recalcular_costo_variante` (`20260916090000_costo_promedio_ponderado.sql:91`) recibe un solo `p_costo_unitario_nuevo` y no tiene ningún parámetro de costo adicional que repartir. **Corrección:** `costo_historial` empieza en la línea 41, como dijo el otro agente, pero el candado `origen in ('compra','produccion')` está en la línea 49, no en la 41. La tabla no tiene columnas de flete. Lo único que dice «prorrateo» es `lib/recepciones-reglas.ts` (`valorPorLlegar`), y reparte el total de un comprobante entre tiendas (ADR-0139), no el flete. En las migraciones, «prorratear» solo aparece en un comentario de caja (`20261003230000…:3`) que no tiene nada que ver.

2. **Para el flete contable existe el lugar, pero no hay cómo registrarlo.** La cuenta `609` está en la sección `fletes` (`20260924235000…:66`), pero ninguna categoría de gasto apunta a ella. Eso lo dicen el comentario de `20260925130000…:51` y el código de `lib/resultados-reglas.ts`.

3. **Viáticos y fondo por rendir no existen.** No aparecen ni en las migraciones, ni en `lib/` ni en `components/`. Un viático hoy solo cabría en la categoría `transporte` (cuenta 631).

4. **La regla anti-duplicado se cumple solo en parte.**
   - `registrar_gasto` solo exige que la categoría exista y esté activa (`20260925000000…:491-494`).
   - La lista cerrada tiene 10 categorías (`20260924235000…:135-144`), ninguna de mercadería ni de insumos. Ninguna migración posterior agrega categorías.
   - Nada impide anotar tela como «Suministros».
   - Sí hay un candado contra registrar dos veces el mismo comprobante, venga como mercadería, gasto o activo (`20260925000000…:396-398`).
   - El egreso nace junto con el gasto, en el mismo paso. No existe la regla del brief de que nazca solo con el pago confirmado.

No encontré ninguna afirmación falsa. La única corrección es el número de línea del candado de `origen` (49 en vez de 41).

### insumos
Revisé en el repo las afirmaciones principales y todas se sostienen. No encontré ninguna falsa. Los conteos de filas en producción (todo en 0) no los volví a consultar: solo revisé archivos.

**Insumos y Producción frente a la orden de compra (ADR-0362), versión corregida**

1. **Los insumos ya tienen su propio circuito en Producción, separado de Compras.** Verificado.
   - `retail.insumos` tiene tipo `tela`/`avio` y unidad `metro`/`unidad`/`kilo`/`cono`/`par`/`docena` (`supabase/migrations/20260917145000_insumos_taller_reconstruido.sql:63-64`).
   - `retail.insumo_lotes` guarda `cantidad_ingresada numeric(12,3)`, `costo_unitario numeric(12,4)` y `origen` `compra`/`saldo_inicial` (`:106-118`).
   - Las líneas de `comprobantes_produccion_items` llevan `insumo_id` o una `descripcion` libre, y un check exige una de las dos (`20260921100000_comprobantes_produccion.sql:81-91`). Su `cantidad` también es `numeric(12,3)`.
   - `recibir_comprobante_produccion` está en `20260921140000_recibir_comprobante_produccion.sql:122`. El vínculo con el lote es `insumo_lotes.comprobante_item_id` / `.recepcion_id` (`:113-114`).
   - `registrar_consumo_insumo` existe (`20260917141500_registrar_consumo_insumo.sql`).

2. **ADR-0133: Felipe lo decidió en contra de lo que el propio ADR recomendaba.** Verificado.
   - Producción tiene sus propios proveedores, comprobantes, «Por pagar» y «Recibir»: `docs/adr/0133-produccion-modulo-propio-conectado-con-compras.md`, sección «Historia».
   - Se descartó una columna `insumo_id` en `compra_items` (`:79`).
   - El costo quedó escrito: deuda con proveedores en dos lugares, IGV crédito fiscal en dos libros y proveedores duplicados.

3. **`compra_items` solo sirve para prendas.** Verificado.
   - Tiene `producto_id NOT NULL`, `cantidad integer` y `costo_unitario numeric(12,2)` (`20260912231956_compras_desde_factura.sql:151-160`).
   - No hay tipo de ítem ni unidad de medida.

4. **ADR-0362 exige categoría y marca en cada línea.** Verificado en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md:52`.
   - Precisión: la tabla nueva se llama `orden_compra_items`, no `ordenes_compra_items`.
   - En la línea 54 también se exigen `categoria_id`/`marca_id`, congelados en `despachos` al despachar.

**Qué implica para ADR-0362**
- Con `categoria_id` y `marca_id` NOT NULL, una línea de tela o avío no se puede registrar. La orden de compra queda solo para mercadería terminada, que es coherente con ADR-0133.
- El brief externo pide un módulo único para prendas e insumos. Eso contradice una decisión ya tomada por Felipe, no un vacío del diseño.
- Si se unificara, cada línea necesitaría:
  - `tipo_item` (`prenda` o `insumo`);
  - un check que exija categoría y marca cuando es prenda, o `insumo_id` cuando es insumo;
  - `cantidad numeric(12,3)`;
  - recibir el insumo abriendo un lote con la lógica de `recibir_comprobante_produccion`, en vez de repartirlo en tallas.
- **Recomendación:** dejar ADR-0362 escrito como «solo mercadería terminada» y que los insumos sigan por Producción. Antes de fijar el esquema hay que preguntarle a Felipe si quiere unir los dos circuitos: con ambos sin uso, hoy es el momento más barato para cambiarlo.

### plan
Verifiqué en el repo las afirmaciones principales y son correctas. Solo hay dos números de línea mal citados. Los datos de producción (0 filas, el plan «Diciembre 2026», la búsqueda en `information_schema`) no los volví a consultar.

**Respuesta corta (se mantiene):** el Plan de campaña no guarda un presupuesto en soles. Guarda supuestos por categoría, y la plata a invertir la calcula la pantalla sin guardarla. «Precio sugerido de venta» no existe en el repo: el alta solo sugiere el costo.

**1. Plan de campaña (`supabase/migrations/20261005220000_plan_de_campana.sql`)**
- `retail.planes_compra` (`:29`) guarda `nombre`, `desde` y `hasta`. No tiene monto. Correcto.
- `retail.planes_compra_lineas` (`:40-58`) es una fila por plan y categoría, con `unique (plan_id, categoria_id)` en `:57`. Correcto.
  - `flojo`, `normal` y `bueno` son enteros en unidades (`:45-47`).
  - `precio` y `costo` son `numeric(10,2)` en soles por unidad (`:48-49`), con `costo < precio`.
  - `recupero_pct` va de 0 a 100 (`:51`).
  - `curva` es un jsonb por talla (`:53`).
  - RLS está encendido (`:65-66`) y no hay `create policy`. Correcto.
- **CORREGIDO:** `fn_plan_compra` está en `:79`, no en `:193`. `guardar_plan_compra_linea` está en `:199`, no en `:285`.
- `apps/web/lib/plan-compra-reglas.ts`: `calcular()` devuelve `{cuantil, objetivo, stock, comprar, inversion}`, con `inversion = comprar × costo` y `comprar = max(0, objetivo − stock)`. Correcto. Además devuelve `cuantil`, que la respuesta original no mencionaba. Como depende del stock vivo, el número de referencia cambia mientras entra mercadería.
- Lo que implica sigue igual. Una orden puede compararse en vivo contra `comprar` (unidades) o contra `inversion` (soles). Si se quiere un tope fijo, falta una columna nueva (por ejemplo `presupuesto_soles`), que hoy no existe.

**2. `retail.presupuestos`** (`supabase/migrations/20260925190000_finanzas_presupuesto.sql:63`): tiene `mes`, `ubicacion_id` (null = «De la empresa»), `cuenta` y `monto` (tope sin IGV). No tiene categoría de producto, así que no sirve para un lote por categoría. Correcto.

**3. Precio sugerido de venta**
- `grep` de `precio_sugerido`, `precioSugerido` y `sugerido_venta` en `apps`, `supabase` y `packages`: 0 resultados. Correcto.
- El costo sugerido existe: `apps/web/lib/alta-producto-datos.ts:~104-117` toma el último costo cargado por categoría y solo lo entrega a quien ve el dinero (vía `getCostosVariantes`). Lo usa `NuevoProductoForm.tsx:350,504`. Correcto.
- `precioBase` es un campo libre sin sugerencia (`NuevoProductoForm.tsx:215`). Correcto.
- Lo más cercano a un precio sugerido es `planes_compra_lineas.precio`, que hoy no está conectado ni a Compras ni al alta.

**Para el ADR-0362:** el «precio sugerido opcional» sería un concepto nuevo. Conviene que lo tome de `planes_compra_lineas.precio` cuando haya plan, y que pase de la recepción al alta ya precargado.

### roles
**Revisión:** abrí 9 de las citas. Ninguna resultó falsa. Agregué un matiz y dejé marcado lo que no pude comprobar desde el repo.

**1. «Quien crea no confirma la recepción» y «quien recibe no paga»: no existe (confirmado)**
- `recibir_lote` guarda quién recibió con `fn_actor_persona_id(true)` (`20260930122000_recibir_lote_costo_atipico.sql:111`). `registrar_compra` hace lo mismo (`20260930123000_registrar_compra_costo_atipico.sql:260`). Ninguna de las dos compara a esa persona con nadie.
- `recibir_lote` (`:74`) y `recibir_envio` (`20260930124000…:89`) solo preguntan `fn_puede_operar_ubicacion`, es decir, si la persona puede operar en esa sede.
- Busqué en todas las migraciones comparaciones del tipo `recibido_por/registrado_por/creado_por = v_persona` y no hay ninguna en Compras. La única regla de separación del mismo tipo es la de `aprobar_devolucion`: quien registró la devolución no puede aprobarla (`20260922235000…:306-308`, ADR-0177). `liberar_apartado` tiene otra parecida pero al revés: solo quien apartó o una líder puede liberar.
- **Matiz que faltaba:** hay un candado por rol, no por persona. Una línea con costo atípico la confirma solo un líder; un no líder no puede recibirla con ese costo (`recibir_lote…:18,154`, `recibir_envio…:17,130`).
- Crear proveedores sigue siendo solo del líder, para frenar el riesgo de un proveedor inventado (ADR-0184 `:88` y `:196`). Confirmado.
- **No verificado:** que en producción ninguna definición de `registrar_pago*` compare personas. No lo consulté en la base.

**2. Separación por módulo (confirmado en el repo)**
- Los tres módulos `facturas_compra`, `recibir` y `por_pagar` están en `apps/web/lib/modulos.ts:80-82`. `fn_puede_registrar_facturas_compra()` y `fn_puede_pagar_compras()` están en `20260923140000…:156-165`.
- **No verificado:** qué módulos tiene hoy cada rol en producción (Integrante y Terminal Almacén con los tres; Terminal de ventas sin `por_pagar`). Eso está en `rol_modulos`, que ninguna migración escribe, así que solo se ve consultando la base.
- ADR-0184 `:88`, decisión 17: Compras queda firmado por la terminal y no por la persona; Felipe lo acepta. Confirmado. Ojo: la frase «la terminal es una persona de Dynamic» (`:92`) la reemplazó después ADR-0162 (terminales sin persona). La consecuencia no cambia: el registro no distingue a la persona.

**3. ¿«Recibido – pago pendiente» es lo mismo que Por pagar? Casi (confirmado)**
- `compras` tiene dos columnas generadas por la base: `estado_pago` (pendiente, parcial, pagada) y `estado_recepcion` (sin recibir, parcial, recibida) (`20260912234815…:50-65`). Juntar `estado_recepcion='recibida'` con `estado_pago<>'pagada'` da el estado del brief.
- La diferencia de fondo se mantiene. Hoy la deuda nace al registrar el comprobante; en el brief nace al confirmar el pago. Además, Por pagar es en sí un módulo de cuentas por pagar, que es justo lo que el brief no quiere.
- Lo que se recibe sin factura aparece en `recepciones_sin_comprobante` (ADR-0111 `:164`), que no tiene estado de pago. Confirmado.

**Resultado:** ninguna afirmación falsa. Dos quedan sin verificar porque dependen de producción: los módulos de cada rol y las definiciones vivas de los pagos.