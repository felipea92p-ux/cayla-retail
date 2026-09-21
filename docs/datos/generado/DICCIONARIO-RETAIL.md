# Diccionario — CAYLA Retail (schema `retail`)

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre `pnpm datos:generar`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en `glosario.json` y este generador respeta.
>
> **Origen:** `volcado de producción (retail_*.json)`
> **Leído el:** volcado de producci
> **Tablas y vistas encontradas:** 73
>
> El orden sigue los 14 pájaros de `scripts/datos/aviario.mjs`, la única lista de qué
> pájaro es cada tabla (el índice está en `AVIARIO.md`). Para entender **por qué**
> existe cada tabla, abre el archivo del módulo en `docs/datos/modulos/`; este archivo
> solo dice **qué hay**.
---


## 01 · Ganso — Identidad y acceso

### `colaboradores`

*5 columnas · ~25 filas · permisos por fila **activos***

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

*7 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `sede_dynamic_id` | uuid | sí | — | — |
| `meta_venta_diaria` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicaciones_meta_venta_diaria_positiva` — `CHECK (((meta_venta_diaria IS NULL) OR (meta_venta_diaria > (0)::numeric)))`
- `ubicaciones_nombre_key` — `UNIQUE (nombre)`
- `ubicaciones_tipo_check` — `CHECK ((tipo = ANY (ARRAY['tienda'::text, 'almacen'::text, 'taller'::text])))`

**De qué depende:** `(sede_dynamic_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ubicaciones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `ubicaciones_write_lider` | ALL | `retail.fn_es_lider()` |



## 02 · Loro — Catálogo y vocabulario

### `productos`

*19 columnas · ~45 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el modelo en sí: de aquí cuelgan sus variantes, su foto y su receta de costo |
| `categoria_id` | uuid | sí | — | en qué categoría del catálogo entra el modelo; vacío = se ve "sin categoría" |
| `referencia` | text | **no** | — | cómo se llama la prenda para la gente: "Blusa Aurora" |
| `descripcion` | text | sí | — | texto largo del modelo que escribe la importación; ninguna pantalla lo muestra todavía |
| `estado` | text | **no** | `'activo'::text` | activa, descontinuada o agotada; descontinuada desaparece del catálogo sin borrarse, borrar no existe |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se dio de alta el modelo en el catálogo |
| `codigo` | text | sí | — | el nombre corto del modelo (BLU-0042): se acuña una vez, y nada en la base impide cambiarlo |
| `token_cliente` | uuid | sí | — | — |
| `stock_minimo` | integer | sí | — | — |
| `temporada` | text | sí | — | de qué temporada es ("Verano 26"), texto libre; ninguna pantalla lo lee |
| `permitir_venta_sin_stock` | boolean | **no** | `false` | — |
| `tejido_id` | uuid | sí | — | — |
| `patron_id` | uuid | sí | — | — |
| `estado_alta` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `marca_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | a qué proveedor se le compra habitualmente este modelo; quién trajo cada lote vive en lotes |

**Candados** — lo que esta tabla hace imposible:

- `productos_estado_alta_check` — `CHECK ((estado_alta = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `productos_estado_check` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'descontinuado'::text])))`
- `productos_rechazado_descontinuado_check` — `CHECK (((estado_alta <> 'rechazado'::text) OR (estado = 'descontinuado'::text)))`
- `productos_stock_minimo_no_negativo` — `CHECK (((stock_minimo IS NULL) OR (stock_minimo >= 0)))`
- `productos_token_cliente_key` — `UNIQUE (token_cliente)`
- `productos_referencia_clave_unica` *(único parcial)* — `retail.productos (retail.fn_clave_referencia(referencia)) WHERE (estado_alta <> 'rechazado'::text)`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(categoria_id) REFERENCES retail.categorias(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(marca_id, proveedor_id) REFERENCES retail.marca_proveedores(marca_id, proveedor_id)` · `(patron_id) REFERENCES retail.patrones(id)` · `(propuesto_por) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(tejido_id) REFERENCES retail.tejidos(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `productos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `productos_write_lider` | ALL | `retail.fn_es_lider()` |


### `variantes`

*10 columnas · ~164 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la prenda concreta que se vende, se mueve y se cuenta: talla y color de un modelo |
| `producto_id` | uuid | **no** | — | de qué modelo es esta talla y color; si el modelo se fuera, se van sus variantes |
| `color_codigo` | text | sí | — | — |
| `sku` | text | sí | — | identificador viejo y único: es lo que codifican las etiquetas impresas antes del 2026-09-09 |
| `precio` | numeric | **no** | — | precio de lista con el que la tienda vende; la base no se lo esconde a nadie con sesión |
| `costo` | numeric | **no** | `0` | lo que costó la prenda: uno solo por variante, el nuevo pisa al viejo y cambia márgenes pasados |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo nació la prenda; hace de "días sin venta" cuando nunca se vendió |
| `codigo` | text | sí | — | el nombre corto que se imprime en la etiqueta y se dicta por teléfono (BLU-0042-AZM-M) |
| `talla_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `variantes_costo_check` — `CHECK ((costo >= (0)::numeric))`
- `variantes_precio_check` — `CHECK ((precio >= (0)::numeric))`
- `variantes_producto_talla_color_unico` — `UNIQUE (producto_id, talla_id, color_codigo)`
- `variantes_sku_key` — `UNIQUE (sku)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(producto_id) REFERENCES retail.productos(id)` · `(talla_id) REFERENCES retail.tallas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `variantes_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `variantes_write_lider` | ALL | `retail.fn_es_lider()` |


### `categorias`

*7 columnas · ~45 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la categoría del catálogo a la que apuntan los productos |
| `nombre` | text | **no** | — | cómo se llama la categoría ("Blusas"): es lo que se elige en el desplegable |
| `activo` | boolean | **no** | `true` | — |
| `familia` | text | sí | — | el gran rubro: indumentaria, calzado, accesorios, bisuteria, belleza o papeleria — una séptima exige migración |
| `prefijo` | text | sí | — | las tres letras con las que empieza el código de la prenda (BLU); obligatorio y único |
| `categoria_padre_id` | uuid | sí | — | — |
| `notas` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `categorias_prefijo_formato` — `CHECK ((prefijo ~ '^[A-Z]{3}$'::text))`
- `categorias_prefijo_unico` *(único parcial)* — `retail.categorias (prefijo) WHERE (prefijo IS NOT NULL)`

**De qué depende:** `(categoria_padre_id) REFERENCES retail.categorias(id)` · `(familia) REFERENCES retail.familias(codigo)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categorias_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `categorias_write_lider` | ALL | `retail.fn_es_lider()` |


### `familias`

*6 columnas · ~6 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | `100` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `exige_tejido_patron` | boolean | **no** | `false` | — |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `familias_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `familias_write_lider` | ALL | `retail.fn_es_lider()` |


### `producto_fotos`

*7 columnas · ~20 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `producto_id` | uuid | **no** | — | — |
| `url` | text | **no** | — | — |
| `orden` | integer | **no** | `0` | — |
| `es_principal` | boolean | **no** | `false` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `color_codigo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `producto_fotos_principal_unico` *(único parcial)* — `retail.producto_fotos (producto_id) WHERE es_principal`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(producto_id) REFERENCES retail.productos(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `producto_fotos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `producto_fotos_write_lider` | ALL | `retail.fn_es_lider()` |


### `historial_producto_cambios`

*8 columnas · ~6 filas · ⚠️ **sin permisos por fila***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `entidad` | text | **no** | — | — |
| `entidad_id` | uuid | **no** | — | — |
| `campo` | text | **no** | — | — |
| `valor_anterior` | text | sí | — | — |
| `valor_nuevo` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `historial_producto_cambios_entidad_check` — `CHECK ((entidad = ANY (ARRAY['producto'::text, 'variante'::text])))`

**De qué depende:** `(usuario_id) REFERENCES personas(id)`


### `marcas`

*4 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `marcas_nombre_check` — `CHECK ((btrim(nombre) <> ''::text))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `marcas_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `marcas_write_lider` | ALL | `retail.fn_es_lider()` |


### `marca_proveedores`

*3 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `marca_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(marca_id) REFERENCES retail.marcas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `marca_proveedores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `marca_proveedores_write_lider` | ALL | `retail.fn_es_lider()` |


### `codigos_barras`

*5 columnas · ~148 filas · permisos por fila **activos***

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

*3 columnas · ~12 filas · permisos por fila **activos***

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


### `colores`

*13 columnas · ~35 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | las tres letras del color (AZM): es el segmento de color del código de la prenda |
| `nombre` | text | **no** | — | cómo se dice el color ("Azul marino"); la base rechaza otra escritura del mismo nombre |
| `hex` | text | sí | — | el chip de color que se ve en pantalla; para Estampado, Multicolor y Animal print queda vacío |
| `activo` | boolean | **no** | `true` | si el color todavía aparece en el selector; un color no se borra, se apaga |
| `familia_color` | text | sí | — | en qué grupo entra: neutro, azul, rojo, amarillo, verde, morado, tierra, metalico o estampado |
| `orden` | integer | **no** | `100` | en qué posición sale en el selector; los 30 de CAYLA van del 10 al 92, los importados en 200 |
| `tipo` | text | **no** | `'solido'::text` | — |
| `imagen_muestra_url` | text | sí | — | — |
| `notas` | text | sí | — | — |
| `estado` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `colores_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `colores_familia_color_check` — `CHECK ((familia_color = ANY (ARRAY['neutro'::text, 'azul'::text, 'rojo'::text, 'amarillo'::text, 'verde'::text, 'morado'::text, 'tierra'::text, 'metalico'::text, 'estampado'::text])))`
- `colores_hex_check` — `CHECK (((hex IS NULL) OR (hex ~ '^#[0-9A-Fa-f]{6}$'::text)))`
- `colores_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`
- `colores_tipo_check` — `CHECK ((tipo = ANY (ARRAY['solido'::text, 'textura'::text, 'estampado'::text])))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colores_insert_autenticado` | INSERT | `(auth.role() = 'authenticated'::text)` |
| `colores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `colores_update_lider` | UPDATE | `retail.fn_es_lider()` |


### `tallas`

*9 columnas · ~25 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `valor` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `estado` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `notas` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `tallas_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `tallas_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tallas_insert_autenticado` | INSERT | `(auth.role() = 'authenticated'::text)` |
| `tallas_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `tallas_update_lider` | UPDATE | `retail.fn_es_lider()` |


### `categoria_tallas`

*4 columnas · ~216 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `talla_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `habitual` | boolean | **no** | `false` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(talla_id) REFERENCES retail.tallas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categoria_tallas_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `categoria_tallas_write_lider` | ALL | `retail.fn_es_lider()` |


### `tejidos`

*10 columnas · ~17 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `estado` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `notas` | text | sí | — | — |
| `imagen_muestra_url` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `tejidos_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `tejidos_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tejidos_insert_autenticado` | INSERT | `(auth.role() = 'authenticated'::text)` |
| `tejidos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `tejidos_update_lider` | UPDATE | `retail.fn_es_lider()` |


### `categoria_tejidos`

*3 columnas · ~139 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `tejido_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(tejido_id) REFERENCES retail.tejidos(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categoria_tejidos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `categoria_tejidos_write_lider` | ALL | `retail.fn_es_lider()` |


### `patrones`

*10 columnas · ~7 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `estado` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `notas` | text | sí | — | — |
| `imagen_muestra_url` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `patrones_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `patrones_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `patrones_insert_autenticado` | INSERT | `(auth.role() = 'authenticated'::text)` |
| `patrones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `patrones_update_lider` | UPDATE | `retail.fn_es_lider()` |


### `categoria_patrones`

*3 columnas · ~133 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `patron_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(patron_id) REFERENCES retail.patrones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categoria_patrones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `categoria_patrones_write_lider` | ALL | `retail.fn_es_lider()` |


### `etiquetas`

*14 columnas · ~24 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `sedes_permitidas` | ARRAY | sí | — | — |
| `estado` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `notas` | text | sí | — | — |
| `vigente_desde` | date | sí | — | — |
| `vigente_hasta` | date | sí | — | — |
| `estilo` | text | **no** | `'neutral'::text` | — |
| `descuento_pct` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `etiquetas_descuento_rango` — `CHECK (((descuento_pct IS NULL) OR ((descuento_pct > (0)::numeric) AND (descuento_pct <= (100)::numeric))))`
- `etiquetas_descuento_solo_aprobada` — `CHECK (((descuento_pct IS NULL) OR (estado = 'aprobado'::text)))`
- `etiquetas_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `etiquetas_estilo_valido` — `CHECK ((estilo = ANY (ARRAY['neutral'::text, 'urgencia'::text, 'positivo'::text, 'campana'::text])))`
- `etiquetas_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`
- `etiquetas_vigencia_coherente` — `CHECK (((vigente_desde IS NULL) OR (vigente_hasta IS NULL) OR (vigente_desde <= vigente_hasta)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `etiquetas_insert_autenticado` | INSERT | `((auth.role() = 'authenticated'::text) AND ((descuento_pct IS NULL) OR retail.fn_es_lider()))` |
| `etiquetas_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `etiquetas_update_lider` | UPDATE | `retail.fn_es_lider()` |


### `etiqueta_categorias`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `etiqueta_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(etiqueta_id) REFERENCES retail.etiquetas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `etiqueta_categorias_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `etiqueta_categorias_write_lider` | ALL | `retail.fn_es_lider()` |


### `variante_etiquetas`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `variante_id` | uuid | **no** | — | — |
| `etiqueta_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(etiqueta_id) REFERENCES retail.etiquetas(id)` · `(variante_id) REFERENCES retail.variantes(id) ON DELETE CASCADE`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `variante_etiquetas_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `variante_etiquetas_write_lider` | ALL | `retail.fn_es_lider()` |



## 05 · Halcón — Inventario y movimientos

### `movimientos`

*21 columnas · ~464 filas · permisos por fila **activos***

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
| `produccion_id` | uuid | sí | — | — |
| `transferencia_recepcion_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_cantidad_valida` — `CHECK ((((tipo <> 'ajuste'::text) AND (cantidad > 0)) OR ((tipo = 'ajuste'::text) AND (cantidad <> 0))))`
- `movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'traslado'::text])))`
- `movimientos_traslado_tiene_destino` — `CHECK ((((tipo = 'traslado'::text) AND (ubicacion_destino_id IS NOT NULL) AND ((ubicacion_destino_id <> ubicacion_id) OR (sububicacion_destino_id IS DISTINCT FROM sububicacion_id))) OR ((tipo <> 'traslado'::text) AND (ubicacion_destino_id IS NULL))))`

**De qué depende:** `(cambio_id) REFERENCES retail.cambios(id)` · `(compra_item_id) REFERENCES retail.compra_items(id)` · `(conteo_item_id) REFERENCES retail.conteo_items(id)` · `(devolucion_item_id) REFERENCES retail.devolucion_items(id)` · `(lote_id) REFERENCES retail.lotes(id)` · `(produccion_id) REFERENCES retail.producciones(id)` · `(sububicacion_destino_id, ubicacion_destino_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(transferencia_item_id) REFERENCES retail.transferencia_items(id)` · `(transferencia_recepcion_id) REFERENCES retail.transferencia_recepciones(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `movimientos_select` | SELECT | `(retail.fn_puede_operar_ubicacion(ubicacion_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id))` |


### `stock`

*5 columnas · ~138 filas · permisos por fila **activos***

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

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la recepción completa: el fardo descargado de una vez, al que apuntan sus movimientos de entrada |
| `ubicacion_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | el proveedor del directorio que trajo el fardo: existe y hoy nadie la llena |
| `numero_guia` | text | sí | — | la guía de remisión del transportista, para cruzar el fardo contra el papel que llegó |
| `fecha_recepcion` | timestamp with time zone | **no** | `now()` | qué día llegó la mercadería; recibir_lote nunca la manda, así que siempre queda el día del registro |
| `recibido_por` | uuid | sí | — | qué integrante recibió y registró el fardo; queda vacío si esa cuenta no tiene ficha en personas |
| `nota` | text | sí | — | observaciones de la descarga: 'faltaron 2 blusas', 'caja mojada' — texto libre que nadie procesa |
| `envio_id` | uuid | sí | — | — |

**De qué depende:** `(envio_id) REFERENCES retail.envios(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(recibido_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `lotes_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `lotes_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `sububicaciones`

*5 columnas · ~9 filas · permisos por fila **activos***

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
- `sububicaciones_tipo_unico_por_ubicacion` *(único parcial)* — `ON retail.sububicaciones (ubicacion_id, tipo) WHERE (tipo = ANY (ARRAY['piso_venta'::text, 'almacen_tienda'::text, 'cuarentena'::text]))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `sububicaciones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `sububicaciones_write_lider` | ALL | `retail.fn_es_lider()` |


### `costo_historial`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `variante_id` | uuid | **no** | — | — |
| `stock_previo` | integer | **no** | — | — |
| `costo_anterior` | numeric | **no** | — | — |
| `cantidad_nueva` | integer | **no** | — | — |
| `costo_unitario_nuevo` | numeric | **no** | — | — |
| `costo_resultante` | numeric | **no** | — | — |
| `origen` | text | **no** | — | — |
| `movimiento_id` | uuid | **no** | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `costo_historial_cantidad_nueva_check` — `CHECK ((cantidad_nueva > 0))`
- `costo_historial_costo_anterior_check` — `CHECK ((costo_anterior >= (0)::numeric))`
- `costo_historial_costo_resultante_check` — `CHECK ((costo_resultante >= (0)::numeric))`
- `costo_historial_costo_unitario_nuevo_check` — `CHECK ((costo_unitario_nuevo >= (0)::numeric))`
- `costo_historial_movimiento_id_key` — `UNIQUE (movimiento_id)`
- `costo_historial_origen_check` — `CHECK ((origen = ANY (ARRAY['compra'::text, 'produccion'::text])))`
- `costo_historial_stock_previo_check` — `CHECK ((stock_previo >= 0))`

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `costo_historial_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.movimientos m   WHERE ((m.id = costo_historial.movimiento_id) AND retail.fn_puede_operar_ubicacion(m.ubicacion_id))))` |


### `prendas_danadas`

*14 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `variante_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `devolucion_item_id` | uuid | sí | — | — |
| `movimiento_entrada_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'en_cuarentena'::text` | — |
| `movimiento_salida_id` | uuid | sí | — | — |
| `resuelto_por` | uuid | sí | — | — |
| `resuelto_en` | timestamp with time zone | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `proveedor_id` | uuid | sí | — | — |
| `cambio_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `prendas_danadas_cambio_id_key` — `UNIQUE (cambio_id)`
- `prendas_danadas_cantidad_check` — `CHECK ((cantidad > 0))`
- `prendas_danadas_devolucion_item_id_key` — `UNIQUE (devolucion_item_id)`
- `prendas_danadas_estado_check` — `CHECK ((estado = ANY (ARRAY['en_cuarentena'::text, 'liquidada'::text, 'se_boto'::text, 'donada'::text, 'devuelta_proveedor'::text])))`
- `prendas_danadas_proveedor_coherente` — `CHECK (((estado = 'devuelta_proveedor'::text) = (proveedor_id IS NOT NULL)))`
- `prendas_danadas_resolucion_coherente` — `CHECK ((((estado = 'en_cuarentena'::text) AND (movimiento_salida_id IS NULL) AND (resuelto_en IS NULL)) OR ((estado <> 'en_cuarentena'::text) AND (movimiento_salida_id IS NOT NULL) AND (resuelto_en IS NOT NULL))))`
- `prendas_danadas_un_origen` — `CHECK ((num_nonnulls(devolucion_item_id, cambio_id) = 1))`

**De qué depende:** `(cambio_id) REFERENCES retail.cambios(id)` · `(devolucion_item_id) REFERENCES retail.devolucion_items(id)` · `(movimiento_entrada_id) REFERENCES retail.movimientos(id)` · `(movimiento_salida_id) REFERENCES retail.movimientos(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(resuelto_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `prendas_danadas_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `transferencias`

*14 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_origen_id` | uuid | **no** | — | — |
| `ubicacion_destino_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'en_transito'::text` | — |
| `creado_por` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `fecha_estimada_llegada` | timestamp with time zone | sí | — | — |
| `confirmado_por` | uuid | sí | — | — |
| `confirmado_en` | timestamp with time zone | sí | — | — |
| `cerrado_por` | uuid | sí | — | — |
| `cerrado_en` | timestamp with time zone | sí | — | — |
| `nota_cierre` | text | sí | — | — |
| `numero` | integer | **no** | `nextval('retail.transferencias_numero_seq'::regclass)` | — |

**Candados** — lo que esta tabla hace imposible:

- `transferencias_estado_check` — `CHECK ((estado = ANY (ARRAY['completada'::text, 'en_transito'::text, 'recibido_con_diferencia'::text, 'cerrada'::text])))`
- `transferencias_numero_unique` — `UNIQUE (numero)`
- `transferencias_origen_destino_distintos` — `CHECK ((ubicacion_origen_id <> ubicacion_destino_id))`

**De qué depende:** `(cerrado_por) REFERENCES personas(id)` · `(confirmado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_origen_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencias_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_origen_id)` |
| `transferencias_select` | SELECT | `(retail.fn_puede_operar_ubicacion(ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id))` |
| `transferencias_update` | UPDATE | `(retail.fn_puede_operar_ubicacion(ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id))` |


### `transferencia_items`

*5 columnas · ~11 filas · permisos por fila **activos***

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

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencia_items_insert` | INSERT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_items.transferencia_id) AND retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id))))` |
| `transferencia_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_items.transferencia_id) AND (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id)))))` |


### `transferencia_recepciones`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `transferencia_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad_recibida` | integer | **no** | — | — |
| `movimiento_id` | uuid | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `transferencia_recepciones_cantidad_recibida_check` — `CHECK ((cantidad_recibida >= 0))`
- `transferencia_recepciones_transferencia_id_variante_id_key` — `UNIQUE (transferencia_id, variante_id)`

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(registrado_por) REFERENCES personas(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencia_recepciones_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_recepciones.transferencia_id) AND (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id)))))` |


### `envios`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `numero_guia` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `recibido_por` | uuid | sí | — | — |
| `fecha_recepcion` | timestamp with time zone | **no** | `now()` | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `envios_token_cliente_key` *(único parcial)* — `retail.envios (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(recibido_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `envios_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `envio_extras`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `movimiento_id` | uuid | **no** | — | — |
| `envio_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | — |
| `es_regalo` | boolean | **no** | `false` | — |
| `nota` | text | sí | — | — |

**De qué depende:** `(envio_id) REFERENCES retail.envios(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `envio_extras_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.envios e   WHERE ((e.id = envio_extras.envio_id) AND retail.fn_puede_operar_ubicacion(e.ubicacion_id))))` |


### `envio_traslados`

*2 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `envio_id` | uuid | **no** | — | — |
| `transferencia_id` | uuid | **no** | — | — |

**De qué depende:** `(envio_id) REFERENCES retail.envios(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `envio_traslados_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.envios e   WHERE ((e.id = envio_traslados.envio_id) AND retail.fn_puede_operar_ubicacion(e.ubicacion_id))))` |



## 06 · Lechuza — Conteo y censo físico

### `conteos`

*11 columnas · ~3 filas · permisos por fila **activos***

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
| `alcance` | text | **no** | `'todo'::text` | qué universo declara cubrir: 'todo', 'familia', 'categoria' o 'contenedor' — descriptivo, nunca impide contar algo de fuera |
| `alcance_categoria_id` | uuid | sí | — | la categoría declarada cuando el alcance es 'categoria'; existe y hoy nadie la llena |
| `numero` | integer | **no** | `nextval('retail.conteos_numero_seq'::regclass)` | — |

**Candados** — lo que esta tabla hace imposible:

- `conteos_alcance_categoria_coherente` — `CHECK ((((alcance = 'categoria'::text) AND (alcance_categoria_id IS NOT NULL)) OR ((alcance = 'todo'::text) AND (alcance_categoria_id IS NULL))))`
- `conteos_alcance_check` — `CHECK ((alcance = ANY (ARRAY['todo'::text, 'categoria'::text])))`
- `conteos_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'anulado'::text])))`
- `conteos_numero_unique` — `UNIQUE (numero)`
- `conteos_un_abierto_por_ubicacion` *(único parcial)* — `ON retail.conteos (ubicacion_id) WHERE (estado = 'abierto'::text)`

**De qué depende:** `(abierto_por) REFERENCES personas(id)` · `(alcance_categoria_id) REFERENCES retail.categorias(id)` · `(cerrado_por) REFERENCES personas(id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

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



## 07 · Colibrí — Ventas y caja

### `ventas`

*12 columnas · ~9 filas · permisos por fila **activos***

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
| `estado` | text | **no** | `'completada'::text` | — |
| `motivo_anulacion` | text | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ventas_anulacion_coherente` — `CHECK ((((estado = 'completada'::text) AND (anulado_en IS NULL) AND (motivo_anulacion IS NULL) AND (anulado_por IS NULL)) OR ((estado = 'anulada'::text) AND (anulado_en IS NOT NULL) AND (motivo_anulacion IS NOT NULL))))`
- `ventas_estado_check` — `CHECK ((estado = ANY (ARRAY['completada'::text, 'anulada'::text])))`
- `ventas_nota_corta` — `CHECK ((char_length(nota) <= 200))`
- `ventas_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(caja_id) REFERENCES retail.cajas(id)` · `(cliente_id) REFERENCES retail.clientes(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ventas_insert` | INSERT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `ventas_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `venta_items`

*12 columnas · ~23 filas · permisos por fila **activos***

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
| `motivo_descuento` | text | sí | — | — |
| `motivo_descuento_detalle` | text | sí | — | — |
| `argumento_descuento` | text | sí | — | — |
| `descuento_etiqueta_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_items_campana_coherente` — `CHECK ((COALESCE((motivo_descuento = 'campana'::text), false) = (descuento_etiqueta_id IS NOT NULL)))`
- `venta_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `venta_items_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `venta_items_descuento_no_supera_precio` — `CHECK ((descuento_unitario <= precio_unitario))`
- `venta_items_descuento_unitario_check` — `CHECK ((descuento_unitario >= (0)::numeric))`
- `venta_items_motivo_coherente_con_descuento` — `CHECK ((((descuento_unitario = (0)::numeric) AND (motivo_descuento IS NULL)) OR ((descuento_unitario > (0)::numeric) AND (motivo_descuento IS NOT NULL)))) NOT VALID`
- `venta_items_motivo_descuento_valido` — `CHECK (((motivo_descuento IS NULL) OR (motivo_descuento = ANY (ARRAY['cumpleanos_clienta_top'::text, 'prenda_con_desperfecto'::text, 'liquidacion_temporada'::text, 'cerrar_venta'::text, 'otro'::text, 'campana'::text]))))`
- `venta_items_otro_tiene_detalle` — `CHECK (((motivo_descuento IS DISTINCT FROM 'otro'::text) OR ((motivo_descuento_detalle IS NOT NULL) AND (btrim(motivo_descuento_detalle) <> ''::text)))) NOT VALID`
- `venta_items_precio_unitario_check` — `CHECK ((precio_unitario >= (0)::numeric))`

**De qué depende:** `(descuento_etiqueta_id) REFERENCES retail.etiquetas(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `venta_items_insert` | INSERT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |
| `venta_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |


### `venta_pagos`

*4 columnas · ~11 filas · permisos por fila **activos***

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


### `venta_anulacion_items`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_id` | uuid | **no** | — | — |
| `venta_item_id` | uuid | **no** | — | — |
| `condicion` | text | **no** | — | — |
| `movimiento_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_anulacion_items_condicion_check` — `CHECK ((condicion = ANY (ARRAY['vendible'::text, 'danada_reparacion'::text, 'danada_donar'::text, 'devolver_proveedor'::text])))`
- `venta_anulacion_items_una_vez_por_linea` — `UNIQUE (venta_item_id)`

**De qué depende:** `(venta_id) REFERENCES retail.ventas(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `venta_anulacion_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_anulacion_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |
| `venta_anulacion_items_write` | ALL | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_anulacion_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id))))` |


### `cajas`

*12 columnas · ~9 filas · permisos por fila **activos***

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

*9 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `caja_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `nota` | text | sí | — | — |
| `es_ajuste` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `caja_movimientos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `caja_movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `caja_movimientos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.cajas c   WHERE ((c.id = caja_movimientos.caja_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_id))))` |


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

*13 columnas · ~1 filas · permisos por fila **activos***

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
| `caja_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |
| `condicion` | text | **no** | `'vendible'::text` | — |

**Candados** — lo que esta tabla hace imposible:

- `cambios_cantidad_check` — `CHECK ((cantidad > 0))`
- `cambios_condicion_check` — `CHECK ((condicion = ANY (ARRAY['vendible'::text, 'no_vendible'::text])))`
- `cambios_defecto_no_vuelve_al_piso` — `CHECK (((motivo IS DISTINCT FROM 'defecto'::text) OR (condicion = 'no_vendible'::text)))`
- `cambios_diferencia_liquidada` — `CHECK (((diferencia = (0)::numeric) OR (metodo_pago_diferencia IS NOT NULL)))`
- `cambios_metodo_pago_diferencia_check` — `CHECK ((metodo_pago_diferencia = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])))`
- `cambios_motivo_check` — `CHECK ((motivo = ANY (ARRAY['talla_chica'::text, 'talla_grande'::text, 'otro_color'::text, 'defecto'::text, 'otro'::text])))`
- `cambios_token_cliente_key` *(único parcial)* — `retail.cambios (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_nueva_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cambios_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `devoluciones`

*13 columnas · ~1 filas · permisos por fila **activos***

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
| `caja_id` | uuid | sí | — | — |
| `nota_credito_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `devoluciones_aprobacion_coherente` — `CHECK ((((estado = 'pendiente'::text) AND (aprobado_en IS NULL)) OR ((estado <> 'pendiente'::text) AND (aprobado_en IS NOT NULL))))`
- `devoluciones_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(caja_id) REFERENCES retail.cajas(id)` · `(nota_credito_id) REFERENCES retail.comprobantes(id)` · `(solicitado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `devoluciones_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |
| `devoluciones_write` | ALL | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `devolucion_items`

*6 columnas · ~1 filas · permisos por fila **activos***

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



## 08 · Cuervo — Facturación SUNAT

### `comprobantes`

*32 columnas · ~11 filas · permisos por fila **activos***

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
| `motivo_no_emitido` | text | sí | — | — |
| `marcado_no_emitido_por` | uuid | sí | — | — |
| `marcado_no_emitido_at` | timestamp with time zone | sí | — | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_anulado_tiene_motivo` — `CHECK (((estado <> 'anulado'::text) OR (motivo_anulacion IS NOT NULL)))`
- `comprobantes_cliente_tipo_doc_check` — `CHECK ((cliente_tipo_doc = ANY (ARRAY['dni'::text, 'ruc'::text, 'sin_documento'::text])))`
- `comprobantes_entorno_transmision_check` — `CHECK ((entorno_transmision = ANY (ARRAY['sandbox'::text, 'produccion'::text])))`
- `comprobantes_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'aceptado'::text, 'rechazado'::text, 'anulado'::text, 'no_emitido'::text])))`
- `comprobantes_factura_requiere_ruc` — `CHECK (((tipo <> 'factura'::text) OR ((cliente_tipo_doc = 'ruc'::text) AND (cliente_num_doc IS NOT NULL))))`
- `comprobantes_no_emitido_tiene_motivo` — `CHECK (((estado <> 'no_emitido'::text) OR (motivo_no_emitido IS NOT NULL)))`
- `comprobantes_nota_requiere_original` — `CHECK (((tipo <> ALL (ARRAY['nota_credito'::text, 'nota_debito'::text])) OR ((comprobante_original_id IS NOT NULL) AND (motivo IS NOT NULL))))`
- `comprobantes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['boleta'::text, 'factura'::text, 'nota_credito'::text, 'nota_debito'::text])))`
- `comprobantes_tipo_serie_numero_key` — `UNIQUE (tipo, serie, numero)`
- `comprobantes_token_cliente_key` — `UNIQUE (token_cliente)`
- `comprobantes_total_check` — `CHECK ((total > (0)::numeric))`
- `comprobantes_transmitido_tiene_entorno` — `CHECK (((estado = ANY (ARRAY['pendiente'::text, 'no_emitido'::text])) OR (entorno_transmision IS NOT NULL))) NOT VALID`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(comprobante_original_id) REFERENCES retail.comprobantes(id)` · `(marcado_no_emitido_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_select` | SELECT | `(retail.fn_es_lider() OR retail.fn_puede_operar_ubicacion(ubicacion_id))` |


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


### `proformas`

*13 columnas · ~1 filas · permisos por fila **activos***

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



## 09 · Pelícano — Compras y proveedores

### `proveedores`

*16 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el proveedor como ficha única para las tres tiendas; lo citan órdenes, lotes y productos |
| `nombre` | text | **no** | — | con qué nombre se le conoce en la tienda; en producción nada impide dos fichas iguales |
| `ruc` | text | sí | — | su RUC para el comprobante de compra; se escribe a mano y nadie lo valida contra SUNAT |
| `contacto` | text | sí | — | el nombre de la persona con quien se habla para pactar el fardo |
| `activo` | boolean | **no** | `true` | si le seguimos comprando; desactivar archiva la ficha y nunca borra la fila |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró al directorio único que reemplazó los tres Excel desincronizados de las tiendas |
| `rubro` | text | sí | — | — |
| `plazo_credito_dias` | integer | sí | — | — |
| `forma_pago_preferida` | text | sí | — | — |
| `telefono` | text | sí | — | el WhatsApp por el que se cierra la compra, que es como compra CAYLA; desde ADR-0134 ya NO es el destino del Yape |
| `banco` | text | sí | — | en qué banco cobra ese proveedor; visible para cualquiera con cuenta, decisión consciente D-27 |
| `cuenta_bancaria` | text | sí | — | el número de cuenta del banco (depósito o mismo banco); el interbancario vive en `cci`. Dato de un tercero y visible para todos |
| `cci` | text | sí | — | el Código de Cuenta Interbancario (20 dígitos) para transferirle desde otro banco; se guarda solo con números |
| `celular_billetera` | text | sí | — | el celular al que se yapea o se plinea (9 dígitos, sin +51); distinto del WhatsApp de contacto, porque mandar plata al celular equivocado no se revierte |
| `billeteras` | ARRAY | sí | — | en qué app tiene ese celular: Yape, Plin o ambas; va de la mano con el celular (uno sin el otro no puede existir) |
| `titular_cuenta` | text | sí | — | el nombre que muestra el banco o Yape antes de confirmar; quien paga lo compara con este para no equivocarse de destino |

**Candados** — lo que esta tabla hace imposible:

- `proveedores_billetera_coherente` — `CHECK (((celular_billetera IS NULL) = (billeteras IS NULL)))`
- `proveedores_billeteras_validas` — `CHECK (((billeteras IS NULL) OR (((cardinality(billeteras) >= 1) AND (cardinality(billeteras) <= 2)) AND (billeteras <@ ARRAY['yape'::text, 'plin'::text]))))`
- `proveedores_cci_formato` — `CHECK (((cci IS NULL) OR (cci ~ '^[0-9]{20}$'::text)))`
- `proveedores_celular_billetera_formato` — `CHECK (((celular_billetera IS NULL) OR (celular_billetera ~ '^9[0-9]{8}$'::text)))`
- `proveedores_forma_pago_valida` — `CHECK (((forma_pago_preferida IS NULL) OR (forma_pago_preferida = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'otro'::text]))))`
- `proveedores_plazo_credito_positivo` — `CHECK (((plazo_credito_dias IS NULL) OR (plazo_credito_dias > 0)))`
- `proveedores_ruc_check` — `CHECK (((ruc IS NULL) OR (ruc ~ '^[0-9]{11}$'::text)))`
- `proveedores_titular_largo` — `CHECK (((titular_cuenta IS NULL) OR ((char_length(titular_cuenta) >= 2) AND (char_length(titular_cuenta) <= 120))))`
- `proveedores_ruc_unico` *(único parcial)* — `retail.proveedores (ruc) WHERE (ruc IS NOT NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `proveedores_write_lider` | ALL | `retail.fn_es_lider()` |


### `compras`

*27 columnas · ~0 filas · permisos por fila **activos***

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
| `token_cliente` | uuid | sí | — | — |
| `fecha_estimada_llegada` | date | sí | — | — |
| `notas_credito` | numeric | **no** | `0` | — |
| `cerrado_cantidad` | integer | **no** | `0` | — |
| `saldo` | numeric | sí | — | — |
| `estado_pago` | text | sí | — | — |
| `estado_recepcion` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compras_cerrado_cantidad_check` — `CHECK ((cerrado_cantidad >= 0))`
- `compras_condicion_check` — `CHECK ((condicion = ANY (ARRAY['contado'::text, 'credito'::text])))`
- `compras_credito_tiene_vencimiento` — `CHECK (((condicion = 'contado'::text) OR (fecha_vencimiento IS NOT NULL)))`
- `compras_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulada'::text])))`
- `compras_facturado_cantidad_check` — `CHECK ((facturado_cantidad >= 0))`
- `compras_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `compras_igv_solo_factura` — `CHECK (((tipo = 'factura'::text) OR (igv = (0)::numeric)))`
- `compras_no_sobrepagada` — `CHECK (((pagado + notas_credito) <= total))`
- `compras_no_sobrerecibida` — `CHECK (((recibido_cantidad + cerrado_cantidad) <= facturado_cantidad))`
- `compras_notas_credito_check` — `CHECK ((notas_credito >= (0)::numeric))`
- `compras_pagado_check` — `CHECK ((pagado >= (0)::numeric))`
- `compras_proveedor_id_serie_numero_key` — `UNIQUE (proveedor_id, serie, numero)`
- `compras_recibido_cantidad_check` — `CHECK ((recibido_cantidad >= 0))`
- `compras_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `compras_tipo_check` — `CHECK ((tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'nota_venta'::text])))`
- `compras_total_check` — `CHECK ((total >= (0)::numeric))`
- `compras_total_cuadra` — `CHECK ((total = (subtotal + igv)))`

**De qué depende:** `(proveedor_id) REFERENCES retail.proveedores(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compras_select` | SELECT | `retail.fn_puede_ver_dinero_de_compras()` |


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
| `compra_items_select` | SELECT | `retail.fn_puede_ver_dinero_de_compras()` |


### `compra_pagos`

*9 columnas · ~0 filas · permisos por fila **activos***

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
| `pago_grupo_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'otro'::text, 'saldo_a_favor'::text])))`
- `compra_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`

**De qué depende:** `(compra_id) REFERENCES retail.compras(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_pagos_select` | SELECT | `retail.fn_puede_ver_dinero_de_compras()` |


### `compra_adjuntos`

*11 columnas · ~0 filas · permisos por fila **activos***

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
| `nota_credito_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_adjuntos_bytes_check` — `CHECK ((bytes > 0))`
- `compra_adjuntos_ruta_de_su_compra` — `CHECK ((ruta ~~ ((compra_id)::text \|\| '/%'::text)))`
- `compra_adjuntos_ruta_key` — `UNIQUE (ruta)`
- `compra_adjuntos_tamano_maximo` — `CHECK ((bytes <= ((10 * 1024) * 1024)))`
- `compra_adjuntos_tipo_permitido` — `CHECK ((tipo = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text, 'image/heif'::text])))`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(nota_credito_id, compra_id) REFERENCES retail.compra_notas_credito(id, compra_id)` · `(subido_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_adjuntos_select` | SELECT | `retail.fn_puede_ver_dinero_de_compras()` |


### `compras_resumen`

*32 columnas · ~0 filas · ⚠️ **sin permisos por fila***

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
| `fecha_estimada_llegada` | date | sí | — | — |
| `recepcion_atrasada` | boolean | sí | — | — |
| `proveedor_telefono` | text | sí | — | — |
| `proveedor_banco` | text | sí | — | — |
| `proveedor_cuenta_bancaria` | text | sí | — | — |
| `notas_credito` | numeric | sí | — | — |
| `cerrado_cantidad` | integer | sí | — | — |
| `ubicaciones_destino` | ARRAY | sí | — | — |


### `compra_items_resumen`

*11 columnas · ~0 filas · ⚠️ **sin permisos por fila***

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
| `cerrado` | bigint | sí | — | — |


### `compra_item_cierres`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_item_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `ubicacion_id` | uuid | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_item_cierres_cantidad_check` — `CHECK ((cantidad > 0))`
- `compra_item_cierres_motivo_check` — `CHECK ((motivo = ANY (ARRAY['no_llego'::text, 'danada'::text, 'error_proveedor'::text])))`

**De qué depende:** `(compra_item_id) REFERENCES retail.compra_items(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_item_cierres_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `compra_notas_credito`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_id` | uuid | **no** | — | — |
| `cierre_id` | uuid | sí | — | — |
| `serie_numero` | text | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `subtotal` | numeric | **no** | — | — |
| `igv` | numeric | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `aplicado` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_notas_credito_aplicado_valido` — `CHECK (((aplicado >= (0)::numeric) AND (aplicado <= monto)))`
- `compra_notas_credito_compra_id_serie_numero_key` — `UNIQUE (compra_id, serie_numero)`
- `compra_notas_credito_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `compra_notas_credito_monto_check` — `CHECK ((monto > (0)::numeric))`
- `compra_notas_credito_monto_cuadra` — `CHECK ((monto = (subtotal + igv)))`
- `compra_notas_credito_motivo_check` — `CHECK ((motivo = ANY (ARRAY['faltante'::text, 'devolucion'::text, 'descuento'::text, 'otro'::text])))`
- `compra_notas_credito_serie_numero_check` — `CHECK ((btrim(serie_numero) <> ''::text))`
- `compra_notas_credito_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `compra_notas_credito_faltante_unica` *(único parcial)* — `retail.compra_notas_credito (compra_id) WHERE (motivo = 'faltante'::text)`

**De qué depende:** `(cierre_id) REFERENCES retail.compra_item_cierres(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_notas_credito_select` | SELECT | `retail.fn_puede_ver_dinero_de_compras()` |


### `proveedor_creditos`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `proveedor_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `compra_id` | uuid | sí | — | — |
| `nota_credito_id` | uuid | sí | — | — |
| `compra_pago_id` | uuid | sí | — | — |
| `metodo` | text | sí | — | — |
| `referencia` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedor_creditos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `proveedor_creditos_origen` — `CHECK ((((tipo = 'nota_credito'::text) AND (nota_credito_id IS NOT NULL)) OR ((tipo = 'aplicacion'::text) AND (compra_pago_id IS NOT NULL)) OR ((tipo = 'reembolso'::text) AND (metodo IS NOT NULL))))`
- `proveedor_creditos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['nota_credito'::text, 'aplicacion'::text, 'reembolso'::text])))`

**De qué depende:** `(compra_id) REFERENCES retail.compras(id)` · `(compra_pago_id) REFERENCES retail.compra_pagos(id)` · `(nota_credito_id) REFERENCES retail.compra_notas_credito(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedor_creditos_select` | SELECT | `retail.fn_puede_registrar_compras()` |


### `compra_item_destinos`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `compra_item_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_item_destinos_cantidad_check` — `CHECK ((cantidad > 0))`

**De qué depende:** `(compra_item_id) REFERENCES retail.compra_items(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_item_destinos_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `compra_reasignaciones`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_item_id` | uuid | **no** | — | — |
| `desde_ubicacion_id` | uuid | **no** | — | — |
| `hacia_ubicacion_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_reasignaciones_cantidad_check` — `CHECK ((cantidad > 0))`
- `compra_reasignaciones_distintas_check` — `CHECK ((desde_ubicacion_id <> hacia_ubicacion_id))`
- `compra_reasignaciones_motivo_check` — `CHECK ((motivo = ANY (ARRAY['llego_de_mas'::text, 'error_de_tienda'::text, 'otro'::text])))`

**De qué depende:** `(compra_item_id) REFERENCES retail.compra_items(id)` · `(desde_ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(hacia_ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_reasignaciones_select` | SELECT | `(retail.fn_puede_operar_ubicacion(desde_ubicacion_id) OR retail.fn_puede_operar_ubicacion(hacia_ubicacion_id))` |


### `compra_item_reparto_resumen`

*7 columnas · ~0 filas · ⚠️ **sin permisos por fila***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `compra_item_id` | uuid | sí | — | — |
| `compra_id` | uuid | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `asignado` | integer | sí | — | — |
| `recibido` | bigint | sí | — | — |
| `cerrado` | bigint | sí | — | — |
| `pendiente` | bigint | sí | — | — |



## 10 · Gallito — Producción del Taller

### `producciones`

*18 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la corrida concreta del Taller; su prefijo de 8 caracteres queda escrito en el movimiento de stock |
| `ubicacion_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | qué modelo se fabricó; acepta vacío por herencia, pero en la práctica todo RPC lo llena |
| `estado` | text | **no** | `'en_proceso'::text` | en_proceso o terminado, nada más; el default dice terminado pero la RPC siempre inserta en_proceso |
| `es_muestra` | boolean | **no** | `false` | si es desarrollo del modelo y no producción vendible; una muestra nunca entra al inventario |
| `etapas` | jsonb | **no** | `'{}'::jsonb` | tablero de avance: cada etapa en pendiente, hecho o tercerizado; producción acepta seis etapas, local solo tres |
| `costo_tela` | numeric | **no** | `0` | soles de tela de toda la corrida, no por prenda; lo teclea una persona sin nada que lo contraste |
| `costo_avios` | numeric | **no** | `0` | botones, cierres, etiquetas e hilo de toda la corrida: el resto del material directo |
| `costo_maquila` | numeric | **no** | `0` | lo que se mandó afuera en esa corrida (planchado, corte tercerizado), nunca una cotización de comparación |
| `cantidad_plan` | integer | **no** | — | — |
| `cantidad_buenas` | integer | sí | — | — |
| `costo_unitario` | numeric | sí | — | costo por prenda, columna calculada: no se escribe a mano y cerrar con menos buenas lo sube solo |
| `fecha_entrega` | date | sí | — | para cuándo se comprometió la corrida; alimenta la alarma de orden pasada de fecha |
| `nota` | text | sí | — | observación libre de la corrida; existe y la pantalla del Taller siempre la manda vacía |
| `inventariado_at` | timestamp with time zone | sí | — | cuándo entraron las prendas al stock; vacío es todavía no, y es el candado contra el doble conteo |
| `token_cliente` | uuid | sí | — | — |
| `creado_por` | uuid | sí | — | qué integrante del Taller abrió la corrida |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se abrió la corrida; es el orden del tablero del Taller |

**Candados** — lo que esta tabla hace imposible:

- `producciones_cantidad_buenas_check` — `CHECK (((cantidad_buenas IS NULL) OR (cantidad_buenas > 0)))`
- `producciones_cantidad_plan_check` — `CHECK ((cantidad_plan > 0))`
- `producciones_costo_avios_check` — `CHECK ((costo_avios >= (0)::numeric))`
- `producciones_costo_maquila_check` — `CHECK ((costo_maquila >= (0)::numeric))`
- `producciones_costo_tela_check` — `CHECK ((costo_tela >= (0)::numeric))`
- `producciones_estado_check` — `CHECK ((estado = ANY (ARRAY['en_proceso'::text, 'terminada'::text, 'anulada'::text])))`
- `producciones_terminada_coherente` — `CHECK ((((estado = 'terminada'::text) AND (cantidad_buenas IS NOT NULL)) OR ((estado <> 'terminada'::text) AND (cantidad_buenas IS NULL) AND (inventariado_at IS NULL))))`
- `producciones_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `producciones_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `produccion_lineas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la línea de desglose de una corrida: una talla-color con su cantidad |
| `produccion_id` | uuid | **no** | — | de qué corrida del Taller viene; borrar la corrida se lleva sus líneas en cascada |
| `variante_id` | uuid | **no** | — | qué prenda exacta, talla y color, recibe la entrada de stock al cerrar la corrida |
| `cantidad_plan` | integer | **no** | — | — |
| `cantidad_buenas` | integer | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se agregó esa talla-color al desglose de la corrida |

**Candados** — lo que esta tabla hace imposible:

- `produccion_lineas_cantidad_buenas_check` — `CHECK (((cantidad_buenas IS NULL) OR (cantidad_buenas >= 0)))`
- `produccion_lineas_cantidad_plan_check` — `CHECK ((cantidad_plan > 0))`
- `produccion_lineas_produccion_id_variante_id_key` — `UNIQUE (produccion_id, variante_id)`

**De qué depende:** `(produccion_id) REFERENCES retail.producciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `produccion_lineas_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.producciones p   WHERE ((p.id = produccion_lineas.produccion_id) AND retail.fn_puede_operar_ubicacion(p.ubicacion_id))))` |


### `insumos`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `unidad_medida` | text | **no** | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `merma_pct` | numeric | **no** | `0` | — |
| `stock_minimo` | numeric | sí | — | — |
| `archivado_at` | timestamp with time zone | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `insumos_codigo_key` — `UNIQUE (codigo)`
- `insumos_merma_pct_check` — `CHECK (((merma_pct >= (0)::numeric) AND (merma_pct < 0.5)))`
- `insumos_stock_minimo_check` — `CHECK (((stock_minimo IS NULL) OR (stock_minimo >= (0)::numeric)))`
- `insumos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['tela'::text, 'avio'::text])))`
- `insumos_unidad_medida_check` — `CHECK ((unidad_medida = ANY (ARRAY['metro'::text, 'unidad'::text, 'kilo'::text, 'cono'::text, 'par'::text, 'docena'::text])))`

**De qué depende:** `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `insumos_insert_lider` | INSERT | `retail.fn_es_lider()` |
| `insumos_select_autenticado` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `insumos_update_lider` | UPDATE | `retail.fn_es_lider()` |


### `insumo_lotes`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `insumo_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `codigo_lote` | text | sí | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `cantidad_ingresada` | numeric | **no** | — | — |
| `costo_unitario` | numeric | **no** | — | — |
| `documento` | text | sí | — | — |
| `fecha_ingreso` | date | **no** | `CURRENT_DATE` | — |
| `origen` | text | **no** | `'compra'::text` | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `insumo_lotes_cantidad_ingresada_check` — `CHECK ((cantidad_ingresada > (0)::numeric))`
- `insumo_lotes_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `insumo_lotes_origen_check` — `CHECK ((origen = ANY (ARRAY['compra'::text, 'saldo_inicial'::text])))`
- `insumo_lotes_codigo_unico` *(único parcial)* — `retail.insumo_lotes (insumo_id, codigo_lote) WHERE (codigo_lote IS NOT NULL)`

**De qué depende:** `(insumo_id) REFERENCES retail.insumos(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `insumo_lotes_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `movimientos_insumo`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `insumo_id` | uuid | **no** | — | — |
| `insumo_lote_id` | uuid | sí | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `cantidad` | numeric | **no** | — | — |
| `costo_unitario` | numeric | **no** | `0` | — |
| `produccion_id` | uuid | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_insumo_ajuste_con_motivo` — `CHECK (((tipo <> 'ajuste'::text) OR ((motivo IS NOT NULL) AND (length(TRIM(BOTH FROM motivo)) > 0))))`
- `movimientos_insumo_cantidad_segun_tipo` — `CHECK ((((tipo = 'ajuste'::text) AND (cantidad <> (0)::numeric)) OR ((tipo <> 'ajuste'::text) AND (cantidad > (0)::numeric))))`
- `movimientos_insumo_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `movimientos_insumo_lote_obligatorio` — `CHECK (((tipo = 'ajuste'::text) OR (insumo_lote_id IS NOT NULL)))`
- `movimientos_insumo_produccion_segun_tipo` — `CHECK ((((tipo = ANY (ARRAY['consumo'::text, 'devolucion'::text])) AND (produccion_id IS NOT NULL)) OR ((tipo = ANY (ARRAY['compra'::text, 'merma'::text, 'ajuste'::text])) AND (produccion_id IS NULL))))`
- `movimientos_insumo_tipo_check` — `CHECK ((tipo = ANY (ARRAY['compra'::text, 'consumo'::text, 'devolucion'::text, 'merma'::text, 'ajuste'::text])))`

**De qué depende:** `(insumo_id) REFERENCES retail.insumos(id)` · `(insumo_lote_id) REFERENCES retail.insumo_lotes(id)` · `(produccion_id) REFERENCES retail.producciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_insumo_select` | SELECT | `retail.fn_puede_operar_ubicacion(ubicacion_id)` |


### `v_insumo_saldos`

*8 columnas · ~0 filas · ⚠️ **sin permisos por fila***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `insumo_id` | uuid | sí | — | — |
| `codigo` | text | sí | — | — |
| `nombre` | text | sí | — | — |
| `tipo` | text | sí | — | — |
| `unidad_medida` | text | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `fisico` | numeric | sí | — | — |
| `valor` | numeric | sí | — | — |



## 11 · Garza — Finanzas operativas

### `gastos`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | cada salida de plata que solo el Líder de equipo registra; nada impide anotarla dos veces |
| `ubicacion_id` | uuid | **no** | — | — |
| `categoria` | text | **no** | — | en qué se gastó: la pantalla ofrece ocho (alquiler, servicios, planilla…), la base acepta cualquier texto |
| `proveedor_id` | uuid | sí | — | — |
| `documento_tipo` | text | **no** | `'sin_documento'::text` | — |
| `documento_serie` | text | sí | — | — |
| `documento_numero` | text | sí | — | — |
| `subtotal` | numeric | **no** | `0` | el monto sin IGV, calculado al revés desde el total; ningún reporte lo suma |
| `igv` | numeric | **no** | `0` | el IGV del comprobante, guardado esperando el crédito fiscal que todavía nadie usa |
| `total` | numeric | **no** | — | lo que realmente salió del bolsillo; es el único de los tres que suman los reportes |
| `metodo_pago` | text | **no** | — | con qué se pagó; solo 'efectivo' exacto baja el cuadre, y en producción viene siempre vacía |
| `especificacion` | text | sí | — | la frase que escribe quien registra ('Alquiler julio', 'luz'), lo único que permite reconocer el gasto después |
| `usuario_id` | uuid | sí | — | qué colaborador lo registró; lo llena la RPC desde la sesión, nunca la pantalla |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se anotó y a qué mes se carga: uno de junio anotado en julio cae en julio |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_documento_tipo_check` — `CHECK ((documento_tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'sin_documento'::text])))`
- `gastos_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `gastos_igv_requiere_factura` — `CHECK (((documento_tipo = 'factura'::text) OR (igv = (0)::numeric)))`
- `gastos_metodo_pago_check` — `CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'yape'::text, 'plin'::text, 'deposito'::text, 'tarjeta'::text, 'otro'::text])))`
- `gastos_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `gastos_total_check` — `CHECK ((total > (0)::numeric))`
- `gastos_total_cuadra` — `CHECK ((total = (subtotal + igv)))`

**De qué depende:** `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `gastos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 12 · Urraca — Contabilidad

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

