# Diccionario — CAYLA Retail (schema `retail`)

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre `pnpm datos:generar`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en `glosario.json` y este generador respeta.
>
> **Origen:** `volcado de producción (retail_*.json)`
> **Leído el:** volcado de producci
> **Tablas y vistas encontradas:** 39
>
> El orden sigue los 14 módulos de `docs/datos/00-MAPA.md`. Para entender **por qué**
> existe cada tabla, abre el archivo del módulo en `docs/datos/modulos/`; este archivo
> solo dice **qué hay**.
---


## 01 · Identidad y acceso

### `colaboradores`

*5 columnas · ~9 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `agregado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `rol` | text | **no** | `'colaborador'::text` | — |
| `ubicacion_asignada_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `colaboradores_rol_check` — `CHECK ((rol = ANY (ARRAY['lider'::text, 'colaborador'::text])))`

**De qué depende:** `(agregado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(ubicacion_asignada_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colaboradores_select` | SELECT | `retail.fn_es_lider()` |


### `ubicaciones`

*6 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `sede_dynamic_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicaciones_nombre_key` — `UNIQUE (nombre)`
- `ubicaciones_tipo_check` — `CHECK ((tipo = ANY (ARRAY['tienda'::text, 'almacen'::text])))`

**De qué depende:** `(sede_dynamic_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ubicaciones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `ubicaciones_write_lider` | ALL | `retail.fn_es_lider()` |


### `sububicaciones`

*5 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `sububicaciones_id_ubicacion_unique` — `UNIQUE (id, ubicacion_id)`
- `sububicaciones_ubicacion_id_nombre_key` — `UNIQUE (ubicacion_id, nombre)`
- `sububicaciones_tipo_unico_por_ubicacion` *(único parcial)* — `ON retail.sububicaciones (ubicacion_id, tipo) WHERE (tipo = ANY (ARRAY['piso_venta'::text, 'almacen_tienda'::text]))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `sububicaciones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `sububicaciones_write_lider` | ALL | `retail.fn_es_lider()` |


### `ubicacion_datos_fiscales`

*8 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `direccion` | text | sí | — | — |
| `ubigeo` | text | sí | — | — |
| `departamento` | text | sí | — | — |
| `provincia` | text | sí | — | — |
| `distrito` | text | sí | — | — |
| `telefono` | text | sí | — | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ubicacion_datos_fiscales_select` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 02 · Catálogo y vocabulario

### `categorias`

*5 columnas · ~38 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la categoría del catálogo a la que apuntan los productos |
| `nombre` | text | **no** | — | cómo se llama la categoría ("Blusas"): es lo que se elige en el desplegable |
| `activo` | boolean | **no** | `true` | — |
| `familia` | text | sí | — | el gran rubro: indumentaria, calzado, accesorios, bisuteria, belleza o papeleria — una séptima exige migración |
| `prefijo` | text | sí | — | las tres letras con las que empieza el código de la prenda (BLU); obligatorio y único |

**Candados** — lo que esta tabla hace imposible:

- `categorias_familia_check` — `CHECK ((familia = ANY (ARRAY['indumentaria'::text, 'calzado'::text, 'accesorios'::text, 'bisuteria'::text, 'belleza'::text, 'papeleria'::text])))`
- `categorias_nombre_key` — `UNIQUE (nombre)`
- `categorias_prefijo_formato` — `CHECK ((prefijo ~ '^[A-Z]{3}$'::text))`
- `categorias_prefijo_unico` *(único parcial)* — `retail.categorias (prefijo) WHERE (prefijo IS NOT NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categorias_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `categorias_write_lider` | ALL | `retail.fn_es_lider()` |


### `productos`

*7 columnas · ~7 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el modelo en sí: de aquí cuelgan sus variantes, su foto y su receta de costo |
| `categoria_id` | uuid | sí | — | en qué categoría del catálogo entra el modelo; vacío = se ve "sin categoría" |
| `referencia` | text | **no** | — | cómo se llama la prenda para la gente: "Blusa Aurora" |
| `descripcion` | text | sí | — | texto largo del modelo que escribe la importación; ninguna pantalla lo muestra todavía |
| `estado` | text | **no** | `'activo'::text` | activa, descontinuada o agotada; descontinuada desaparece del catálogo sin borrarse, borrar no existe |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se dio de alta el modelo en el catálogo |
| `codigo` | text | sí | — | el nombre corto del modelo (BLU-0042): se acuña una vez, y nada en la base impide cambiarlo |

**Candados** — lo que esta tabla hace imposible:

- `productos_estado_check` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'descontinuado'::text])))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `productos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `productos_write_lider` | ALL | `retail.fn_es_lider()` |


### `variantes`

*10 columnas · ~37 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la prenda concreta que se vende, se mueve y se cuenta: talla y color de un modelo |
| `producto_id` | uuid | **no** | — | de qué modelo es esta talla y color; si el modelo se fuera, se van sus variantes |
| `color_codigo` | text | sí | — | — |
| `talla` | text | sí | — | qué talla es; texto libre, solo sugerido por categorias.tallas_sugeridas, nada impide escribir otra |
| `sku` | text | **no** | — | identificador viejo y único: es lo que codifican las etiquetas impresas antes del 2026-09-09 |
| `precio` | numeric | **no** | — | precio de lista con el que la tienda vende; la base no se lo esconde a nadie con sesión |
| `costo` | numeric | **no** | `0` | lo que costó la prenda: uno solo por variante, el nuevo pisa al viejo y cambia márgenes pasados |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo nació la prenda; hace de "días sin venta" cuando nunca se vendió |
| `codigo` | text | sí | — | el nombre corto que se imprime en la etiqueta y se dicta por teléfono (BLU-0042-AZM-M) |

**Candados** — lo que esta tabla hace imposible:

- `variantes_costo_check` — `CHECK ((costo >= (0)::numeric))`
- `variantes_precio_check` — `CHECK ((precio >= (0)::numeric))`
- `variantes_producto_id_talla_color_codigo_key` — `UNIQUE (producto_id, talla, color_codigo)`
- `variantes_sku_key` — `UNIQUE (sku)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(producto_id) REFERENCES retail.productos(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `variantes_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `variantes_write_lider` | ALL | `retail.fn_es_lider()` |


### `colores`

*6 columnas · ~30 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | las tres letras del color (AZM): es el segmento de color del código de la prenda |
| `nombre` | text | **no** | — | cómo se dice el color ("Azul marino"); la base rechaza otra escritura del mismo nombre |
| `hex` | text | sí | — | el chip de color que se ve en pantalla; para Estampado, Multicolor y Animal print queda vacío |
| `activo` | boolean | **no** | `true` | si el color todavía aparece en el selector; un color no se borra, se apaga |
| `familia_color` | text | sí | — | en qué grupo entra: neutro, azul, rojo, amarillo, verde, morado, tierra, metalico o estampado |
| `orden` | integer | **no** | `100` | en qué posición sale en el selector; los 30 de CAYLA van del 10 al 92, los importados en 200 |

**Candados** — lo que esta tabla hace imposible:

- `colores_familia_color_check` — `CHECK ((familia_color = ANY (ARRAY['neutro'::text, 'azul'::text, 'rojo'::text, 'amarillo'::text, 'verde'::text, 'morado'::text, 'tierra'::text, 'metalico'::text, 'estampado'::text])))`
- `colores_hex_check` — `CHECK (((hex IS NULL) OR (hex ~ '^#[0-9A-Fa-f]{6}$'::text)))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `colores_write_lider` | ALL | `retail.fn_es_lider()` |


### `codigos_barras`

*5 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la fila del código registrado; nadie la referencia, lo que se busca es el código |
| `variante_id` | uuid | **no** | — | a qué prenda concreta (talla y color) lleva ese escaneo; si se borra la prenda, el código también |
| `codigo` | text | **no** | — | lo que sale de la pistola: el corto CAYLA, el sku viejo o el EAN de fábrica |
| `origen` | text | **no** | `'propio'::text` | de dónde salió el código: 'cayla', 'proveedor' u 'otro', el check no admite nada más |
| `created_at` | timestamp with time zone | **no** | `now()` | desde cuándo esa prenda quedó escaneable con ese código |

**Candados** — lo que esta tabla hace imposible:

- `codigos_barras_codigo_key` — `UNIQUE (codigo)`
- `codigos_barras_origen_check` — `CHECK ((origen = ANY (ARRAY['propio'::text, 'fabrica'::text])))`

**De qué depende:** `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_barras_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `codigos_barras_write_lider` | ALL | `retail.fn_es_lider()` |


### `codigos_correlativos`

*3 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `prefijo` | text | **no** | — | las tres letras de la categoría (BLU, JEA, GEN): un contador por familia de prenda |
| `ultimo` | integer | **no** | `0` | el último número entregado — BLU-0042 significa que acá dice 42; nunca deja huecos ni retrocede |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se acuñó el último código de ese prefijo |

**Candados** — lo que esta tabla hace imposible:

- `codigos_correlativos_ultimo_check` — `CHECK ((ultimo >= 0))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_correlativos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 05 · Inventario y movimientos

### `movimientos`

*19 columnas · ~193 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el hecho concreto de inventario; lo cita conteo_lineas.movimiento_id para justificar cada ajuste del censo |
| `variante_id` | uuid | **no** | — | la prenda exacta, talla y color, que se movió |
| `ubicacion_id` | uuid | **no** | — | — |
| `ubicacion_destino_id` | uuid | sí | — | — |
| `sububicacion_id` | uuid | sí | — | — |
| `sububicacion_destino_id` | uuid | sí | — | — |
| `tipo` | text | **no** | — | entrada, salida, ajuste o traslado — nada más; define el signo y a qué bolsa se aplica |
| `cantidad` | integer | **no** | — | cuántas unidades; siempre positiva salvo en 'ajuste', el único tipo que admite negativo |
| `motivo` | text | sí | — | por qué se movió: venta, merma, conteo, bajada a piso — texto libre, y solo el exacto 'venta' sella stock.ultima_venta |
| `venta_item_id` | uuid | sí | — | — |
| `lote_id` | uuid | sí | — | de qué fardo recibido vino la prenda; solo lo llena recibir_lote |
| `devolucion_item_id` | uuid | sí | — | — |
| `conteo_item_id` | uuid | sí | — | — |
| `transferencia_item_id` | uuid | sí | — | — |
| `usuario_id` | uuid | sí | — | qué integrante lo registró; la RPC lo resuelve de la sesión, pero un insert directo puede falsearlo |
| `nota` | text | sí | — | lo que escribió quien registró: 'vino roto', 'Conteo censo AQP' — texto libre para auditar después |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo pasó el hecho; es el orden del libro y la fecha que se copia a stock.ultima_* |
| `cambio_id` | uuid | sí | — | — |
| `compra_item_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_cantidad_valida` — `CHECK ((((tipo <> 'ajuste'::text) AND (cantidad > 0)) OR ((tipo = 'ajuste'::text) AND (cantidad <> 0))))`
- `movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'traslado'::text])))`
- `movimientos_traslado_tiene_destino` — `CHECK ((((tipo = 'traslado'::text) AND (ubicacion_destino_id IS NOT NULL) AND ((ubicacion_destino_id <> ubicacion_id) OR (sububicacion_destino_id IS DISTINCT FROM sububicacion_id))) OR ((tipo <> 'traslado'::text) AND (ubicacion_destino_id IS NULL))))`

**De qué depende:** `(cambio_id) REFERENCES retail.cambios(id)` · `(compra_item_id) REFERENCES retail.compra_items(id)` · `(conteo_item_id) REFERENCES retail.conteo_items(id)` · `(devolucion_item_id) REFERENCES retail.devolucion_items(id)` · `(lote_id) REFERENCES retail.lotes(id)` · `(sububicacion_destino_id, ubicacion_destino_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(transferencia_item_id) REFERENCES retail.transferencia_items(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `movimientos_select` | SELECT | `(retail.fn_puede_operar_ubicacion(ubicacion_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id))` |


### `stock`

*5 columnas · ~112 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `variante_id` | uuid | **no** | — | qué prenda cuenta esta fila, parte de la llave junto con la sede |
| `ubicacion_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | `0` | lo que se puede vender ahora mismo en esa sede; la base nunca la deja negativa |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó la fila por última vez, sea por movimiento o por recálculo |
| `sububicacion_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `stock_cantidad_check` — `CHECK ((cantidad >= 0))`
- `stock_variante_ubicacion_sububicacion_key` — `UNIQUE NULLS NOT DISTINCT (variante_id, ubicacion_id, sububicacion_id)`

**De qué depende:** `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `stock_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `lotes`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la recepción completa: el fardo descargado de una vez, al que apuntan sus movimientos de entrada |
| `ubicacion_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | el proveedor del directorio que trajo el fardo: existe y hoy nadie la llena |
| `numero_guia` | text | sí | — | la guía de remisión del transportista, para cruzar el fardo contra el papel que llegó |
| `fecha_recepcion` | timestamp with time zone | **no** | `now()` | qué día llegó la mercadería; recibir_lote nunca la manda, así que siempre queda el día del registro |
| `recibido_por` | uuid | sí | — | qué integrante recibió y registró el fardo; queda vacío si esa cuenta no tiene ficha en personas |
| `nota` | text | sí | — | observaciones de la descarga: 'faltaron 2 blusas', 'caja mojada' — texto libre que nadie procesa |

**De qué depende:** `(proveedor_id) REFERENCES retail.proveedores(id)` · `(recibido_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `lotes_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `lotes_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `transferencias`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_origen_id` | uuid | **no** | — | — |
| `ubicacion_destino_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'completada'::text` | — |
| `creado_por` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `transferencias_estado_check` — `CHECK ((estado = 'completada'::text))`
- `transferencias_origen_destino_distintos` — `CHECK ((ubicacion_origen_id <> ubicacion_destino_id))`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_origen_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencias_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_origen_id)` |
| `transferencias_select` | SELECT | `(retail.fn_puede_operar_ubicacion(ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id))` |


### `transferencia_items`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `transferencia_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `transferencia_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `transferencia_items_transferencia_id_variante_id_key` — `UNIQUE (transferencia_id, variante_id)`

**De qué depende:** `(movimiento_id) REFERENCES retail.transferencia_items(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencia_items_insert` | INSERT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_items.transferencia_id) AND retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id))))` |
| `transferencia_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_items.transferencia_id) AND (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id)))))` |



## 06 · Conteo y censo físico

### `conteos`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la sesión de conteo concreta: una tienda, una tarde, una firma al final |
| `ubicacion_id` | uuid | **no** | — | — |
| `sububicacion_id` | uuid | sí | — | — |
| `estado` | text | **no** | `'abierto'::text` | 'abierto' mientras se cuenta, 'cerrado' cuando el líder de equipo firma, 'anulado' si se descarta |
| `abierto_por` | uuid | sí | — | qué colaboradora arrancó la sesión de conteo en la tienda |
| `cerrado_por` | uuid | sí | — | quién firmó el cierre o quién anuló: la misma columna guarda las dos firmas |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `cerrado_en` | timestamp with time zone | sí | — | cuándo se firmó el cierre o se anuló; vacío mientras el conteo sigue abierto |

**Candados** — lo que esta tabla hace imposible:

- `conteos_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'anulado'::text])))`
- `conteos_un_abierto_por_ubicacion` *(único parcial)* — `ON retail.conteos (ubicacion_id) WHERE (estado = 'abierto'::text)`

**De qué depende:** `(abierto_por) REFERENCES personas(id)` · `(cerrado_por) REFERENCES personas(id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `conteos_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `conteos_write` | ALL | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `conteo_items`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `conteo_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad_sistema` | integer | **no** | — | — |
| `cantidad_contada` | integer | **no** | — | — |
| `diferencia` | integer | sí | — | — |
| `movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `conteo_items_cantidad_contada_check` — `CHECK ((cantidad_contada >= 0))`
- `conteo_items_conteo_id_variante_id_key` — `UNIQUE (conteo_id, variante_id)`

**De qué depende:** `(conteo_id) REFERENCES retail.conteos(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `conteo_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.conteos c   WHERE ((c.id = conteo_items.conteo_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_id))))` |



## 07 · Ventas y caja

### `cajas`

*12 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | El turno de caja de una sede: cada venta apunta acá para que el cierre sume solo lo suyo |
| `ubicacion_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'abierta'::text` | 'abierta' o 'cerrada', nada más; un índice parcial impide dos cajas abiertas en la misma sede |
| `monto_apertura` | numeric | **no** | — | Con cuánto efectivo arrancó el cajón, declarado a mano; la base acepta hasta un monto negativo |
| `abierta_por` | uuid | sí | — | Qué colaborador abrió el turno; puede venir vacío y no es necesariamente quien cierra |
| `abierta_en` | timestamp with time zone | **no** | `now()` | Cuándo se abrió el cajón; con esto la bandeja avisa de cajas de días anteriores sin cerrar |
| `monto_cierre_sistema` | numeric | sí | — | — |
| `monto_cierre_real` | numeric | sí | — | — |
| `diferencia` | numeric | sí | — | Contado menos esperado: positivo sobra, negativo falta, y es el número por el que se pregunta al día siguiente |
| `cerrada_por` | uuid | sí | — | Qué colaborador contó el cajón y cerró el turno; puede ser distinto de quien abrió |
| `cerrada_en` | timestamp with time zone | sí | — | Cuándo se contó el efectivo y se cerró el turno; vacío mientras la caja siga abierta |
| `nota` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cajas_estado_check` — `CHECK ((estado = ANY (ARRAY['abierta'::text, 'cerrada'::text])))`
- `cajas_monto_apertura_check` — `CHECK ((monto_apertura >= (0)::numeric))`
- `cajas_ubicacion_abierta_unica` *(único parcial)* — `retail.cajas (ubicacion_id) WHERE (estado = 'abierta'::text)`

**De qué depende:** `(abierta_por) REFERENCES personas(id)` · `(cerrada_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cajas_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `caja_movimientos`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `caja_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `caja_movimientos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `caja_movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `caja_movimientos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.cajas c   WHERE ((c.id = caja_movimientos.caja_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_id))))` |


### `ventas`

*8 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | El cobro completo a una clienta, no la prenda; cada movimiento de salida lo guarda en venta_id |
| `ubicacion_id` | uuid | **no** | — | — |
| `cliente_id` | uuid | sí | — | — |
| `usuario_id` | uuid | sí | — | Qué colaborador cobró; lo resuelve la RPC desde la sesión, no viaja desde el navegador |
| `token_cliente` | uuid | sí | — | El identificador que el navegador genera por carrito para que reintentar no cobre dos veces; vacío es válido |
| `created_at` | timestamp with time zone | **no** | `now()` | Cuándo se cobró; sobre esta columna se arma 'Ventas de hoy' y toda la serie del panel |
| `caja_id` | uuid | sí | — | A qué turno de caja pertenece el cobro; por acá el cierre suma solo lo suyo |
| `nota` | text | sí | — | Texto libre del mostrador sobre el cobro; existe y hoy ninguna pantalla la llena |

**Candados** — lo que esta tabla hace imposible:

- `ventas_nota_corta` — `CHECK ((char_length(nota) <= 200))`
- `ventas_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(cliente_id) REFERENCES retail.clientes(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ventas_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `ventas_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `venta_items`

*8 columnas · ~9 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `precio_unitario` | numeric | **no** | — | — |
| `descuento_unitario` | numeric | **no** | `0` | — |
| `costo_unitario` | numeric | **no** | — | — |
| `subtotal` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `venta_items_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `venta_items_descuento_no_supera_precio` — `CHECK ((descuento_unitario <= precio_unitario))`
- `venta_items_descuento_unitario_check` — `CHECK ((descuento_unitario >= (0)::numeric))`
- `venta_items_precio_unitario_check` — `CHECK ((precio_unitario >= (0)::numeric))`

**De qué depende:** `(variante_id) REFERENCES retail.variantes(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `venta_items_insert` | INSERT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |
| `venta_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |


### `venta_pagos`

*4 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_id` | uuid | **no** | — | — |
| `metodo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])))`
- `venta_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`

**De qué depende:** `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `venta_pagos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_pagos.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |


### `clientes`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `tipo_doc` | text | sí | — | — |
| `num_doc` | text | sí | — | — |
| `nombre` | text | **no** | — | — |
| `telefono` | text | sí | — | — |
| `email` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `clientes_tipo_doc_check` — `CHECK ((tipo_doc = ANY (ARRAY['dni'::text, 'ruc'::text, 'sin_documento'::text])))`
- `clientes_doc_unico` *(único parcial)* — `retail.clientes (tipo_doc, num_doc) WHERE (num_doc IS NOT NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `clientes_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `clientes_write_autenticado` | INSERT | `(auth.role() = 'authenticated'::text)` |


### `codigos_descuento`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `porcentaje` | numeric | **no** | — | — |
| `vigente_desde` | date | sí | — | — |
| `vigente_hasta` | date | sí | — | — |
| `activo` | boolean | **no** | `true` | — |
| `ubicacion_id` | uuid | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `codigos_descuento_codigo_formato` — `CHECK (((codigo = upper(btrim(codigo))) AND ((length(codigo) >= 3) AND (length(codigo) <= 20))))`
- `codigos_descuento_porcentaje_valido` — `CHECK (((porcentaje > (0)::numeric) AND (porcentaje <= (100)::numeric)))`
- `codigos_descuento_vigencia_coherente` — `CHECK (((vigente_desde IS NULL) OR (vigente_hasta IS NULL) OR (vigente_desde <= vigente_hasta)))`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_descuento_insert` | INSERT | `retail.fn_es_lider()` |
| `codigos_descuento_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `codigos_descuento_update` | UPDATE | `retail.fn_es_lider()` |


### `cambios`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_item_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `variante_nueva_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `diferencia` | numeric | **no** | `0` | — |
| `metodo_pago_diferencia` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cambios_cantidad_check` — `CHECK ((cantidad > 0))`
- `cambios_diferencia_liquidada` — `CHECK (((diferencia = (0)::numeric) OR (metodo_pago_diferencia IS NOT NULL)))`
- `cambios_metodo_pago_diferencia_check` — `CHECK ((metodo_pago_diferencia = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])))`
- `cambios_token_cliente_key` *(único parcial)* — `retail.cambios (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_nueva_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cambios_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `devoluciones`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `motivo` | text | **no** | — | — |
| `reembolso_monto` | numeric | sí | — | — |
| `reembolso_metodo` | text | sí | — | — |
| `solicitado_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `devoluciones_aprobacion_coherente` — `CHECK ((((estado = 'pendiente'::text) AND (aprobado_en IS NULL)) OR ((estado <> 'pendiente'::text) AND (aprobado_en IS NOT NULL))))`
- `devoluciones_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(solicitado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `devoluciones_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `devoluciones_write` | ALL | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `devolucion_items`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `devolucion_id` | uuid | **no** | — | — |
| `venta_item_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `condicion` | text | **no** | — | — |
| `movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `devolucion_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `devolucion_items_condicion_check` — `CHECK ((condicion = ANY (ARRAY['vendible'::text, 'danada_reparacion'::text, 'danada_donar'::text, 'devolver_proveedor'::text])))`
- `devolucion_items_devolucion_id_venta_item_id_key` — `UNIQUE (devolucion_id, venta_item_id)`

**De qué depende:** `(devolucion_id) REFERENCES retail.devoluciones(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `devolucion_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.devoluciones d   WHERE ((d.id = devolucion_items.devolucion_id) AND retail.fn_puede_operar_ubicacion(d.ubicacion_id))))` |
| `devolucion_items_write` | ALL | `(EXISTS ( SELECT 1    FROM retail.devoluciones d   WHERE ((d.id = devolucion_items.devolucion_id) AND retail.fn_puede_operar_ubicacion(d.ubicacion_id))))` |



## 08 · Facturación SUNAT

### `series_comprobantes`

*5 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el contador vivo de una sede para un tipo de documento |
| `ubicacion_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | boleta, factura, nota_credito o nota_debito — cada tipo lleva su propio contador |
| `serie` | text | **no** | — | el prefijo que define CAYLA, no SUNAT (B004, F001); se guarda siempre en mayúsculas |
| `siguiente_numero` | integer | **no** | `1` | el correlativo que se entregará en la próxima emisión; puede saltar adelante, nunca retroceder |

**Candados** — lo que esta tabla hace imposible:

- `series_comprobantes_siguiente_numero_check` — `CHECK ((siguiente_numero > 0))`
- `series_comprobantes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['boleta'::text, 'factura'::text, 'nota_credito'::text, 'nota_debito'::text])))`
- `series_comprobantes_ubicacion_id_tipo_key` — `UNIQUE (ubicacion_id, tipo)`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `series_comprobantes_select` | SELECT | `(retail.fn_es_lider() OR retail.fn_puede_operar_ubicacion(ubicacion_id))` |


### `comprobantes`

*28 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el documento legal concreto —boleta, factura o nota— que se emitió y quedó ante SUNAT |
| `venta_id` | uuid | sí | — | qué venta documenta; existe y hoy siempre viene vacío, la boleta y la venta siguen sueltas |
| `ubicacion_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | boleta, factura, nota_credito o nota_debito — los cuatro documentos legales, ninguno más |
| `serie` | text | **no** | — | el prefijo impreso (B004, F001) copiado al emitir; si la sede cambia de serie, los viejos no se reescriben |
| `numero` | integer | **no** | — | el correlativo que se llevó esta emisión; irreversible ante SUNAT y único junto con tipo y serie |
| `cliente_tipo_doc` | text | **no** | `'sin_documento'::text` | dni, ruc o sin_documento; en boleta sin documento se transmite el DNI comodín 99999999 |
| `cliente_num_doc` | text | sí | — | el DNI o RUC de la clienta; si el documento es factura, la base lo exige sí o sí |
| `cliente_nombre` | text | sí | — | a nombre de quién sale el documento; si va vacío, Lucode recibe CLIENTE VARIOS |
| `moneda` | text | **no** | `'PEN'::text` | en qué moneda se cobró; sin candado, acepta cualquier texto aunque el conector solo entiende PEN y USD |
| `subtotal` | numeric | **no** | `0` | el valor de venta sin IGV; nadie valida que cuadre contra igv y total |
| `igv` | numeric | **no** | `0` | el IGV del documento; hoy lo despeja el navegador con 18% escrito a mano, la base no lo verifica |
| `total` | numeric | **no** | — | lo que paga la clienta con IGV incluido; la base exige que sea mayor que cero |
| `estado` | text | **no** | `'pendiente'::text` | pendiente, enviado, aceptado, rechazado o anulado — dónde va el documento en su camino a SUNAT |
| `motivo_rechazo` | text | sí | — | con qué texto SUNAT o Lucode lo rechazó; solo se llena cuando el estado pasa a rechazado |
| `respuesta_sunat` | jsonb | sí | — | la respuesta cruda de Lucode —CDR, XML, PDF, hash—, la prueba de lo que realmente pasó |
| `usuario_id` | uuid | sí | — | qué colaborador lo emitió; queda vacío si quien llamó no tiene ficha en personas |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se reservó el correlativo; es la fecha por la que la pantalla filtra el mes |
| `enviado_at` | timestamp with time zone | sí | — | cuándo se intentó transmitir por primera vez; un reintento no pisa esa fecha original |
| `comprobante_original_id` | uuid | sí | — | solo notas: qué comprobante aceptado corrige esta nota de crédito o débito |
| `motivo` | text | sí | — | solo notas: declarado texto libre, pero se transmite a SUNAT como código del catálogo 09/10 |
| `items` | jsonb | sí | — | el desglose de líneas que Lucode exige; sin él la RPC arma un ítem genérico 'Venta de mercadería' |
| `entorno_transmision` | text | sí | — | sandbox o produccion: impide confundir un aceptado de prueba con uno real ante SUNAT |
| `motivo_anulacion` | text | sí | — | por qué se dio de baja el documento; sin esto no puede quedar anulado |
| `anulacion_solicitada_at` | timestamp with time zone | sí | — | cuándo se pidió la baja; lleno y todavía aceptado significa anulación en trámite |
| `anulado_at` | timestamp with time zone | sí | — | cuándo SUNAT confirmó la baja, no cuándo se pidió |
| `respuesta_anulacion` | jsonb | sí | — | la respuesta cruda del proveedor a la baja, la prueba de que SUNAT la procesó |
| `anulado_por` | uuid | sí | — | qué líder de equipo pidió la baja; anular es el único paso que exige ser líder |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_anulado_tiene_motivo` — `CHECK (((estado <> 'anulado'::text) OR (motivo_anulacion IS NOT NULL)))`
- `comprobantes_cliente_tipo_doc_check` — `CHECK ((cliente_tipo_doc = ANY (ARRAY['dni'::text, 'ruc'::text, 'sin_documento'::text])))`
- `comprobantes_entorno_transmision_check` — `CHECK ((entorno_transmision = ANY (ARRAY['sandbox'::text, 'produccion'::text])))`
- `comprobantes_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'aceptado'::text, 'rechazado'::text, 'anulado'::text])))`
- `comprobantes_factura_requiere_ruc` — `CHECK (((tipo <> 'factura'::text) OR ((cliente_tipo_doc = 'ruc'::text) AND (cliente_num_doc IS NOT NULL))))`
- `comprobantes_nota_requiere_original` — `CHECK (((tipo <> ALL (ARRAY['nota_credito'::text, 'nota_debito'::text])) OR ((comprobante_original_id IS NOT NULL) AND (motivo IS NOT NULL))))`
- `comprobantes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['boleta'::text, 'factura'::text, 'nota_credito'::text, 'nota_debito'::text])))`
- `comprobantes_tipo_serie_numero_key` — `UNIQUE (tipo, serie, numero)`
- `comprobantes_total_check` — `CHECK ((total > (0)::numeric))`
- `comprobantes_transmitido_tiene_entorno` — `CHECK (((estado = 'pendiente'::text) OR (entorno_transmision IS NOT NULL)))`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(comprobante_original_id) REFERENCES retail.comprobantes(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_select` | SELECT | `(retail.fn_es_lider() OR retail.fn_puede_operar_ubicacion(ubicacion_id))` |


### `proformas`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | La cotización entregada a la clienta, que no es comprobante de pago ante SUNAT |
| `ubicacion_id` | uuid | **no** | — | — |
| `cliente_nombre` | text | sí | — | A quién se le cotizó; es lo único de la clienta que la pantalla manda al crear |
| `cliente_num_doc` | text | sí | — | El DNI o RUC de la clienta; la pantalla no lo manda al cotizar, se pide recién al convertir |
| `items` | jsonb | **no** | — | Lo cotizado en JSON sin forma fija; hoy es un ítem 'Venta' con el total, que nunca viaja al comprobante |
| `subtotal` | numeric | **no** | `0` | El valor cotizado sin IGV; lo calcula el navegador dividiendo el total, no la base |
| `igv` | numeric | **no** | `0` | El IGV de la cotización, calculado en el navegador igual que en el comprobante |
| `total` | numeric | **no** | — | Lo cotizado con IGV incluido; el check exige mayor a cero, no se cotiza S/0 |
| `estado` | text | **no** | `'vigente'::text` | 'vigente', 'convertida', 'vencida' o 'anulada'; los dos últimos no los escribe nadie todavía |
| `comprobante_id` | uuid | sí | — | Qué boleta o factura nació de esta cotización; solo lo anota la conversión, nunca se llena a mano |
| `usuario_id` | uuid | sí | — | Qué colaborador armó la cotización en el mostrador |
| `created_at` | timestamp with time zone | **no** | `now()` | Cuándo se le dio ese precio a la clienta; ordena la lista de cotizaciones |
| `vence_at` | timestamp with time zone | sí | — | Hasta cuándo vale el precio cotizado; la base no lo hace cumplir y una vencida se convierte igual |

**Candados** — lo que esta tabla hace imposible:

- `proformas_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'convertida'::text, 'vencida'::text, 'anulada'::text])))`
- `proformas_total_check` — `CHECK ((total > (0)::numeric))`

**De qué depende:** `(comprobante_id) REFERENCES retail.comprobantes(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proformas_select` | SELECT | `(retail.fn_es_lider() OR retail.fn_puede_operar_ubicacion(ubicacion_id))` |


### `configuracion_empresa`

*9 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | boolean | **no** | `true` | candado de fila única: siempre true, porque la empresa que emite es una sola |
| `ruc` | text | **no** | — | el RUC con el que CAYLA emite ante SUNAT; se cargó a mano y ningún código lo lee |
| `razon_social` | text | **no** | — | el nombre legal de CAYLA que debería encabezar cada comprobante emitido |
| `nombre_comercial` | text | sí | — | la marca con la que la clienta conoce a CAYLA, distinta del nombre legal |
| `email` | text | sí | — | correo de la empresa para enviarle el comprobante a la clienta; hoy nadie lo usa |
| `web` | text | sí | — | la página de CAYLA que iría en el pie del comprobante; existe y ninguna pantalla la muestra |
| `telefono` | text | sí | — | el teléfono de la empresa para el comprobante; guardado aquí pero sin consumidor |
| `resolucion_autorizacion` | text | sí | — | la resolución de SUNAT que autoriza a CAYLA a emitir electrónicamente; se guarda y no se imprime |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocaron por última vez los datos de la empresa emisora |

**Candados** — lo que esta tabla hace imposible:

- `configuracion_empresa_id_check` — `CHECK (id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `configuracion_empresa_select` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 09 · Compras y proveedores

### `proveedores`

*6 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el proveedor como ficha única para las tres tiendas; lo citan órdenes, lotes y productos |
| `nombre` | text | **no** | — | con qué nombre se le conoce en la tienda; en producción nada impide dos fichas iguales |
| `ruc` | text | sí | — | su RUC para el comprobante de compra; se escribe a mano y nadie lo valida contra SUNAT |
| `contacto` | text | sí | — | el nombre de la persona con quien se habla para pactar el fardo |
| `activo` | boolean | **no** | `true` | si le seguimos comprando; desactivar archiva la ficha y nunca borra la fila |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró al directorio único que reemplazó los tres Excel desincronizados de las tiendas |

**Candados** — lo que esta tabla hace imposible:

- `proveedores_ruc_check` — `CHECK (((ruc IS NULL) OR (ruc ~ '^[0-9]{11}$'::text)))`
- `proveedores_ruc_unico` *(único parcial)* — `retail.proveedores (ruc) WHERE (ruc IS NOT NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `proveedores_write_lider` | ALL | `retail.fn_es_lider()` |


### `compras`

*24 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `proveedor_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | `'factura'::text` | — |
| `serie` | text | **no** | — | — |
| `numero` | text | **no** | — | — |
| `fecha_emision` | date | **no** | `CURRENT_DATE` | — |
| `condicion` | text | **no** | — | — |
| `fecha_vencimiento` | date | sí | — | — |
| `ubicacion_destino_id` | uuid | **no** | — | — |
| `subtotal` | numeric | **no** | — | — |
| `igv` | numeric | **no** | — | — |
| `total` | numeric | **no** | — | — |
| `estado` | text | **no** | `'vigente'::text` | — |
| `motivo_anulacion` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `pagado` | numeric | **no** | `0` | — |
| `facturado_cantidad` | integer | **no** | `0` | — |
| `recibido_cantidad` | integer | **no** | `0` | — |
| `documento` | text | sí | — | — |
| `saldo` | numeric | sí | — | — |
| `estado_pago` | text | sí | — | — |
| `estado_recepcion` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compras_condicion_check` — `CHECK ((condicion = ANY (ARRAY['contado'::text, 'credito'::text])))`
- `compras_credito_tiene_vencimiento` — `CHECK (((condicion = 'contado'::text) OR (fecha_vencimiento IS NOT NULL)))`
- `compras_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulada'::text])))`
- `compras_facturado_cantidad_check` — `CHECK ((facturado_cantidad >= 0))`
- `compras_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `compras_igv_solo_factura` — `CHECK (((tipo = 'factura'::text) OR (igv = (0)::numeric)))`
- `compras_pagado_check` — `CHECK ((pagado >= (0)::numeric))`
- `compras_proveedor_id_serie_numero_key` — `UNIQUE (proveedor_id, serie, numero)`
- `compras_recibido_cantidad_check` — `CHECK ((recibido_cantidad >= 0))`
- `compras_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `compras_tipo_check` — `CHECK ((tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'nota_venta'::text])))`
- `compras_total_check` — `CHECK ((total >= (0)::numeric))`
- `compras_total_cuadra` — `CHECK ((total = (subtotal + igv)))`

**De qué depende:** `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compras_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_destino_id)` |


### `compra_items`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `variante_id` | uuid | sí | — | — |
| `descripcion` | text | sí | — | — |
| `cantidad` | integer | **no** | — | — |
| `costo_unitario` | numeric | **no** | — | — |
| `subtotal` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `compra_items_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`

**De qué depende:** `(compra_id) REFERENCES retail.compras(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.compras c   WHERE ((c.id = compra_items.compra_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_destino_id))))` |


### `compra_pagos`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | `CURRENT_DATE` | — |
| `monto` | numeric | **no** | — | — |
| `metodo` | text | **no** | — | — |
| `referencia` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'otro'::text])))`
- `compra_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`

**De qué depende:** `(compra_id) REFERENCES retail.compras(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_pagos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.compras c   WHERE ((c.id = compra_pagos.compra_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_destino_id))))` |


### `compra_adjuntos`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_id` | uuid | **no** | — | — |
| `ruta` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `bytes` | integer | **no** | — | — |
| `subido_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `archivado_en` | timestamp with time zone | sí | — | — |
| `archivado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_adjuntos_bytes_check` — `CHECK ((bytes > 0))`
- `compra_adjuntos_ruta_de_su_compra` — `CHECK ((ruta ~~ ((compra_id)::text \|\| '/%'::text)))`
- `compra_adjuntos_ruta_key` — `UNIQUE (ruta)`
- `compra_adjuntos_tamano_maximo` — `CHECK ((bytes <= ((10 * 1024) * 1024)))`
- `compra_adjuntos_tipo_permitido` — `CHECK ((tipo = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text, 'image/heif'::text])))`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(subido_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_adjuntos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.compras c   WHERE ((c.id = compra_adjuntos.compra_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_destino_id))))` |


### `compras_resumen`

*25 columnas · ~0 filas · ⚠️ **sin permisos por fila***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `proveedor_nombre` | text | sí | — | — |
| `proveedor_ruc` | text | sí | — | — |
| `tipo` | text | sí | — | — |
| `serie` | text | sí | — | — |
| `numero` | text | sí | — | — |
| `documento` | text | sí | — | — |
| `fecha_emision` | date | sí | — | — |
| `condicion` | text | sí | — | — |
| `fecha_vencimiento` | date | sí | — | — |
| `ubicacion_destino_id` | uuid | sí | — | — |
| `subtotal` | numeric | sí | — | — |
| `igv` | numeric | sí | — | — |
| `total` | numeric | sí | — | — |
| `estado` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | sí | — | — |
| `pagado` | numeric | sí | — | — |
| `saldo` | numeric | sí | — | — |
| `estado_pago` | text | sí | — | — |
| `facturado_cantidad` | integer | sí | — | — |
| `recibido_cantidad` | integer | sí | — | — |
| `estado_recepcion` | text | sí | — | — |
| `vencida` | boolean | sí | — | — |


### `compra_items_resumen`

*10 columnas · ~0 filas · ⚠️ **sin permisos por fila***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | — |
| `compra_id` | uuid | sí | — | — |
| `producto_id` | uuid | sí | — | — |
| `variante_id` | uuid | sí | — | — |
| `descripcion` | text | sí | — | — |
| `cantidad` | integer | sí | — | — |
| `costo_unitario` | numeric | sí | — | — |
| `subtotal` | numeric | sí | — | — |
| `recibido` | bigint | sí | — | — |
| `pendiente` | bigint | sí | — | — |



## 12 · Contabilidad

### `activos_fijos`

*16 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el bien concreto: esa máquina, ese mostrador, ese equipo de cómputo |
| `ubicacion_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | cómo se le dice al bien en la boutique o el taller: 'Remalladora Siruba' |
| `serie` | text | sí | — | número de serie del fabricante; sin él un robo no se le prueba al seguro |
| `descripcion` | text | sí | — | detalle libre del bien; se puede llenar pero hoy ninguna pantalla lo muestra |
| `cuenta_codigo` | text | sí | — | a qué cuenta del plan va: 333 maquinaria, 336 cómputo, 335 muebles; hoy apunta a cuentas que no existen |
| `costo` | numeric | **no** | — | lo que costó el bien el día que se compró, en soles |
| `valor_residual` | numeric | **no** | `0` | lo que valdría al terminar su vida útil, 10% máquinas y muebles, 5% cómputo; nadie lo lee |
| `vida_util_meses` | integer | **no** | — | cuántos meses dura el bien: 120 máquinas y muebles, 48 cómputo; ningún cálculo lo usa |
| `tasa_anual` | numeric | **no** | — | tasa SUNAT de depreciación anual, 0.1000 es 10%; existe y hoy nadie la lee |
| `fecha_adquisicion` | date | **no** | — | desde cuándo se deprecia el bien; sale como 'Desde' en la pantalla de Activos |
| `depreciacion_apertura` | numeric | **no** | `0` | desgaste ya acumulado al cargar la ficha; número congelado a mano que no crece nunca |
| `estado` | text | **no** | `'activo'::text` | activo, baja o vendido; la pantalla solo lista 'activo' y producción no tiene ese candado |
| `nota` | text | sí | — | comentario libre sobre el bien; ninguna pantalla lo muestra todavía |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró la ficha al sistema, no cuándo se compró el bien |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se editó la ficha por última vez; lo pisa solo el trigger |

**Candados** — lo que esta tabla hace imposible:

- `activos_fijos_estado_check` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'baja'::text, 'vendido'::text])))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `activos_fijos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `activos_fijos_write_lider` | ALL | `retail.fn_es_lider()` |

