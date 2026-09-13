# Diccionario — CAYLA Retail (schema `retail`)

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre `pnpm datos:generar`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en `glosario.json` y este generador respeta.
>
> **Origen:** `volcado de producción (retail_*.json)`
> **Leído el:** volcado de producci
> **Tablas y vistas encontradas:** 47
>
> El orden sigue los 14 módulos de `docs/datos/00-MAPA.md`. Para entender **por qué**
> existe cada tabla, abre el archivo del módulo en `docs/datos/modulos/`; este archivo
> solo dice **qué hay**.
---


## 01 · Identidad y acceso

### `sedes` *(vista)*

*6 columnas*

<details><summary>Cómo se construye esta vista</summary>

```sql

```

</details>

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | la sede concreta donde ocurrió la cosa: viaja en cada movimiento, venta, caja y comprobante |
| `codigo` | text | sí | — | cómo la nombra Dynamic: TRU, AQP, 003 (tienda de Lima), LIM (el Taller), CCO; ya no se lee solo |
| `nombre` | text | sí | — | el nombre largo de Dynamic, único lugar donde quedó la ciudad de la tienda 003 |
| `tipo` | text | sí | — | tienda, fabrica, corporativo o almacen; sale de sede_meta y es como el sistema encuentra el Taller |
| `tienda_asociada_id` | uuid | sí | — | a qué tienda colgaría un almacén; hoy vacío en las cinco sedes, el modelo cambió |
| `activo` | boolean | sí | — | la bandera activa de Dynamic prestada; retail dejó de mirarla y no frena ninguna operación |


### `personas` *(vista)*

*7 columnas*

<details><summary>Cómo se construye esta vista</summary>

```sql

```

</details>

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | el colaborador que queda estampado en cada movimiento, venta, cierre de caja y conteo |
| `auth_user_id` | uuid | sí | — | el login con el que entra a la app; la cuenta es la misma que usa Dynamic |
| `nombre` | text | sí | — | cómo se le llama en pantalla; Dynamic lo arma juntando nombres y apellidos, no se puede escribir |
| `sede_id` | uuid | sí | — | su sede base, la única donde puede operar si no es Líder de Equipo; es sede_base_id de Dynamic |
| `rol` | text | sí | — | admin, supervisor_sede o integrante; solo admin es Líder de Equipo y supervisor_sede se trata como integrante |
| `email` | text | sí | — | correo del colaborador que trae Dynamic; existe solo en producción, la tabla local no tiene esta columna |
| `estado` | text | sí | — | si sigue trabajando según Dynamic: activo o inactivo; ninguna pantalla de retail lo mira todavía |


### `sede_meta`

*4 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `sede_id` | uuid | **no** | — | la sede de Dynamic a la que se le cuelga el tipo; una sola fila por sede |
| `tipo` | text | **no** | — | tienda, fabrica, corporativo o almacen: el dato que Dynamic no modela y sin el cual el Taller no se encuentra |
| `tienda_asociada_id` | uuid | sí | — | apuntaría de un almacén a su tienda; hoy vacío en las cinco filas, modelo abandonado |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se le colgó el tipo a esa sede, en la siembra única de julio 2026 |

**Candados** — lo que esta tabla hace imposible:

- `sede_meta_tipo_check` — `CHECK ((tipo = ANY (ARRAY['tienda'::text, 'fabrica'::text, 'corporativo'::text, 'almacen'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `sede_meta_read` | SELECT | `true` |



## 02 · Catálogo y vocabulario

### `categorias`

*7 columnas · ~37 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la categoría del catálogo a la que apuntan los productos |
| `familia` | text | **no** | — | el gran rubro: indumentaria, calzado, accesorios, bisuteria, belleza o papeleria — una séptima exige migración |
| `nombre` | text | **no** | — | cómo se llama la categoría ("Blusas"): es lo que se elige en el desplegable |
| `tallas_sugeridas` | ARRAY | sí | — | qué tallas propone el formulario para esta categoría; es sugerencia, nadie impide escribir otra |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró esta categoría al vocabulario |
| `prefijo` | text | **no** | — | las tres letras con las que empieza el código de la prenda (BLU); obligatorio y único |
| `taxonomia_categoria_id` | text | sí | — | de qué categoría del estándar universal cuelga ésta; vacío = todavía sin anclar |

**Candados** — lo que esta tabla hace imposible:

- `categorias_familia_check` — `CHECK ((familia = ANY (ARRAY['indumentaria'::text, 'calzado'::text, 'accesorios'::text, 'bisuteria'::text, 'belleza'::text, 'papeleria'::text])))`
- `categorias_familia_nombre_key` — `UNIQUE (familia, nombre)`
- `categorias_prefijo_formato` — `CHECK ((prefijo ~ '^[A-Z]{3}$'::text))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categorias_insert_lider` | INSERT | `retail.es_lider()` |
| `categorias_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `categorias_update_lider` | UPDATE | `retail.es_lider()` |


### `productos`

*17 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el modelo en sí: de aquí cuelgan sus variantes, su foto y su receta de costo |
| `sku_padre` | text | **no** | — | identificador viejo del modelo, obligatorio y único, pero ya no nombra nada: el nombre es codigo |
| `referencia` | text | **no** | — | cómo se llama la prenda para la gente: "Blusa Aurora" |
| `descripcion` | text | sí | — | texto largo del modelo que escribe la importación; ninguna pantalla lo muestra todavía |
| `categoria_id` | uuid | sí | — | en qué categoría del catálogo entra el modelo; vacío = se ve "sin categoría" |
| `genero` | text | sí | — | para quién es la prenda ("Mujer"), texto libre; se escribe y nunca se muestra |
| `marca` | text | sí | — | de qué marca es el modelo; se ve en el catálogo y se puede buscar por ella |
| `temporada` | text | sí | — | de qué temporada es ("Verano 26"), texto libre; ninguna pantalla lo lee |
| `estado` | text | **no** | `'activa'::text` | activa, descontinuada o agotada; descontinuada desaparece del catálogo sin borrarse, borrar no existe |
| `foto_url` | text | sí | — | la única foto del modelo, del bucket público fotos-productos; la sube la pantalla sin pasar por RPC |
| `costo_mano_obra` | numeric | sí | — | cuánta mano de obra del Taller lleva ese modelo; alimenta la receta de costo |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se dio de alta el modelo en el catálogo |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó por última vez el modelo; lo mueve un trigger, nadie lo escribe a mano |
| `material` | text | sí | — | de qué tela es el modelo; existe solo en producción y la pide la pantalla de Producción |
| `proveedor_id` | uuid | sí | — | a qué proveedor se le compra habitualmente este modelo; quién trajo cada lote vive en lotes |
| `codigo` | text | sí | — | el nombre corto del modelo (BLU-0042): se acuña una vez, y nada en la base impide cambiarlo |
| `importacion_id` | uuid | sí | — | de qué importación de catálogo nació el modelo; permite descontinuar toda esa carga en bloque |

**Candados** — lo que esta tabla hace imposible:

- `productos_estado_check` — `CHECK ((estado = ANY (ARRAY['activa'::text, 'descontinuada'::text, 'agotada'::text])))`
- `productos_sku_padre_key` — `UNIQUE (sku_padre)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `productos_insert_lider` | INSERT | `retail.es_lider()` |
| `productos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `productos_update_lider` | UPDATE | `retail.es_lider()` |


### `variantes`

*15 columnas · ~19 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la prenda concreta que se vende, se mueve y se cuenta: talla y color de un modelo |
| `producto_id` | uuid | **no** | — | de qué modelo es esta talla y color; si el modelo se fuera, se van sus variantes |
| `sku` | text | **no** | — | identificador viejo y único: es lo que codifican las etiquetas impresas antes del 2026-09-09 |
| `talla` | text | sí | — | qué talla es; texto libre, solo sugerido por categorias.tallas_sugeridas, nada impide escribir otra |
| `color` | text | sí | — | el nombre del color escrito a mano; es la columna sucia que vigila la identidad única |
| `costo` | numeric | **no** | `0` | lo que costó la prenda: uno solo por variante, el nuevo pisa al viejo y cambia márgenes pasados |
| `precio` | numeric | **no** | `0` | precio de lista con el que la tienda vende; la base no se lo esconde a nadie con sesión |
| `precio_oferta` | numeric | sí | — | precio rebajado que se guarda y nunca se cobra: ni la venta ni ninguna pantalla lo aplican |
| `foto_url` | text | sí | — | foto de la talla-color: nadie la escribe ni la lee, la foto es del modelo |
| `stock_minimo` | integer | **no** | `0` | desde cuántas unidades hay que reponer esta prenda en general; el mínimo por sede vive en stock |
| `precio_taller` | numeric | **no** | `0` | a qué precio el Taller le pasa esta prenda a las tiendas; lo escribe Producción |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo nació la prenda; hace de "días sin venta" cuando nunca se vendió |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó por última vez esta prenda; lo mueve un trigger |
| `color_id` | text | sí | — | el color del vocabulario cerrado; vacío en lo viejo y en tres de los cinco caminos de alta |
| `codigo` | text | sí | — | el nombre corto que se imprime en la etiqueta y se dicta por teléfono (BLU-0042-AZM-M) |

**Candados** — lo que esta tabla hace imposible:

- `variantes_sku_key` — `UNIQUE (sku)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `variantes_insert_lider` | INSERT | `retail.es_lider()` |
| `variantes_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `variantes_update_lider` | UPDATE | `retail.es_lider()` |


### `colores`

*8 columnas · ~30 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | las tres letras del color (AZM): es el segmento de color del código de la prenda |
| `nombre` | text | **no** | — | cómo se dice el color ("Azul marino"); la base rechaza otra escritura del mismo nombre |
| `familia_color` | text | **no** | — | en qué grupo entra: neutro, azul, rojo, amarillo, verde, morado, tierra, metalico o estampado |
| `hex` | text | sí | — | el chip de color que se ve en pantalla; para Estampado, Multicolor y Animal print queda vacío |
| `activo` | boolean | **no** | `true` | si el color todavía aparece en el selector; un color no se borra, se apaga |
| `orden` | integer | **no** | `100` | en qué posición sale en el selector; los 30 de CAYLA van del 10 al 92, los importados en 200 |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró este color al vocabulario |
| `taxonomia_valor_id` | text | sí | — | de qué color del estándar universal cuelga éste: Arena → Beige; vacío = sin anclar |

**Candados** — lo que esta tabla hace imposible:

- `colores_codigo_check` — `CHECK ((codigo ~ '^[A-Z]{3}$'::text))`
- `colores_familia_color_check` — `CHECK ((familia_color = ANY (ARRAY['neutro'::text, 'azul'::text, 'rojo'::text, 'amarillo'::text, 'verde'::text, 'morado'::text, 'tierra'::text, 'metalico'::text, 'estampado'::text])))`
- `colores_hex_check` — `CHECK (((hex IS NULL) OR (hex ~ '^#[0-9A-Fa-f]{6}$'::text)))`
- `colores_nombre_key` — `UNIQUE (nombre)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colores_insert_lider` | INSERT | `retail.es_lider()` |
| `colores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `colores_update_lider` | UPDATE | `retail.es_lider()` |


### `codigos_barras`

*7 columnas · ~38 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la fila del código registrado; nadie la referencia, lo que se busca es el código |
| `codigo` | text | **no** | — | lo que sale de la pistola: el corto CAYLA, el sku viejo o el EAN de fábrica |
| `variante_id` | uuid | **no** | — | a qué prenda concreta (talla y color) lleva ese escaneo; si se borra la prenda, el código también |
| `origen` | text | **no** | — | de dónde salió el código: 'cayla', 'proveedor' u 'otro', el check no admite nada más |
| `nota` | text | sí | — | por qué se registró: 'código corto CAYLA', 'sku anterior', 'adoptado durante el conteo' — texto libre |
| `created_at` | timestamp with time zone | **no** | `now()` | desde cuándo esa prenda quedó escaneable con ese código |
| `creado_por` | uuid | sí | — | qué integrante lo registró; vacío cuando lo metió el backfill o un RPC sin sesión |

**Candados** — lo que esta tabla hace imposible:

- `codigos_barras_codigo_key` — `UNIQUE (codigo)`
- `codigos_barras_origen_check` — `CHECK ((origen = ANY (ARRAY['cayla'::text, 'proveedor'::text, 'otro'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_barras_select` | SELECT | `(auth.role() = 'authenticated'::text)` |


### `codigos_correlativos`

*3 columnas · ~4 filas · permisos por fila **activos***

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



## 03 · Taxonomía universal

### `taxonomia_versiones`

*3 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `version` | text | **no** | — | Qué release del estándar Shopify es este, '2026-08'; ninguna consulta del sistema filtra por él |
| `cargada_en` | timestamp with time zone | **no** | `now()` | Cuándo entró ese release del estándar a esta base; el seed la repisa al reactivar |
| `es_activa` | boolean | **no** | `false` | Cuál release manda hoy: solo una puede ir en true, aunque hoy ninguna consulta la respeta |

**Candados** — lo que esta tabla hace imposible:

- `taxonomia_una_sola_activa` *(único parcial)* — `retail.taxonomia_versiones (es_activa) WHERE es_activa`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `taxonomia_versiones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |


### `taxonomia_categorias`

*6 columnas · ~1849 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | text | **no** | — | El id parlante de Shopify, 'aa-1-1-2-4': estable entre releases y legible en un log o un prompt |
| `nombre` | text | **no** | — | La hoja sola de la categoría universal, 'Camisetas de capa base', sin su rama |
| `ruta` | text | **no** | — | La rama completa separada por ' > ': es lo que ve la pantalla y lo que lee el modelo |
| `padre_id` | text | sí | — | De qué categoría universal cuelga esta; vacío solo en la raíz de cada rubro |
| `nivel` | integer | **no** | — | Qué tan hondo está en el árbol; el nivel 1 es el rubro y nunca sirve como respuesta |
| `vertical` | text | **no** | — | El rubro cargado: aa ropa y accesorios, hb belleza, os papelería, lb bolsos de viaje |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `taxonomia_categorias_select` | SELECT | `(auth.role() = 'authenticated'::text)` |


### `taxonomia_atributos`

*4 columnas · ~993 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | text | **no** | — | El id de Shopify de la pregunta: '1' es Color, '2778' es Talla |
| `handle` | text | **no** | — | El nombre estable en inglés ('color', 'size'): por acá lo busca el código, nunca por id |
| `nombre` | text | **no** | — | Cómo se llama el atributo en español —Color, Talla— para mostrarlo y para el prompt |
| `descripcion` | text | sí | — | El texto explicativo del estándar; existe y hoy no lo lee ninguna pantalla ni prompt |

**Candados** — lo que esta tabla hace imposible:

- `taxonomia_atributos_handle_key` — `UNIQUE (handle)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `taxonomia_atributos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |


### `taxonomia_valores`

*4 columnas · ~10216 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | text | **no** | — | El id de Shopify del valor concreto, '15' para Azul marino |
| `atributo_id` | text | **no** | — | De qué pregunta es respuesta este valor: 'Azul marino' es de Color, no de Tejido |
| `handle` | text | **no** | — | 'color__navy': de acá sale la familia de color de la marca, y no tiene candado de unicidad |
| `nombre` | text | **no** | — | El nombre en español del valor, 'Azul marino'; de los 10.216 solo 19 son colores |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `taxonomia_valores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |


### `taxonomia_categoria_atributos`

*2 columnas · ~16527 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | text | **no** | — | Para qué categoría del estándar tiene sentido la pregunta: una camiseta tiene Cuello, un arete no |
| `atributo_id` | text | **no** | — | Qué atributo se le puede preguntar a una prenda de esa categoría, sin repetirse |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `taxonomia_categoria_atributos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 04 · Importación de catálogo

### `importaciones`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el acta de cada archivo de catálogo importado, de la que cuelgan sus prendas; en producción todavía cero |
| `persona_id` | uuid | sí | — | quién corrió la importación; queda vacía si esa cuenta no tiene ficha en personas y el acta pierde autor |
| `origen` | text | **no** | — | de qué archivo y hoja salió, en texto para leer: 'inventario.xlsx · hoja Stock' |
| `plan` | jsonb | **no** | — | el mapeo aplicado tal cual, para ver qué se interpretó como qué y reimportar sin pagar otra vez al modelo |
| `productos_creados` | integer | **no** | `0` | cuántas prendas nuevas entraron con ese archivo; no vuelve a cero cuando la importación se deshace |
| `variantes_creadas` | integer | **no** | `0` | cuántas combinaciones de talla y color entraron, que es el tamaño real de la importación |
| `colores_creados` | integer | **no** | `0` | cuántos colores nuevos se sembraron en el vocabulario de la marca; deshacer no los borra |
| `categorias_creadas` | integer | **no** | `0` | cuántas categorías nuevas se sembraron; igual que los colores, deshacer las deja vivas |
| `estado` | text | **no** | `'aplicada'::text` | 'aplicada' o 'deshecha', nada a medias; y no se deshace si alguna prenda ya se movió o se contó |
| `deshecha_en` | timestamp with time zone | sí | — | cuándo un Líder de equipo revirtió la importación; vacía mientras siga aplicada |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró el archivo; ordena las últimas importaciones cuando se busca un plan para reusar |
| `token` | uuid | sí | — | el intento que generó la pantalla: reintentar con el mismo token devuelve la importación en vez de repetirla |

**Candados** — lo que esta tabla hace imposible:

- `importaciones_estado_check` — `CHECK ((estado = ANY (ARRAY['aplicada'::text, 'deshecha'::text])))`
- `importaciones_token_unico` *(único parcial)* — `retail.importaciones (token) WHERE (token IS NOT NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `importaciones_select` | SELECT | `(auth.role() = 'authenticated'::text)` |


### `producto_atributos`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `producto_id` | uuid | **no** | — | el modelo que se está describiendo; existe y hoy nadie llena esta tabla |
| `atributo_id` | text | **no** | — | qué se describe — tejido, cuello, largo de manga — en el vocabulario universal |
| `valor_id` | text | sí | — | el valor universal cuando el texto del archivo calzó con el estándar; hoy siempre vacío |
| `valor_texto` | text | sí | — | el texto crudo del archivo si nada calzó — salva 'lino peruano 60/40'; uno de los dos es obligatorio |

**Candados** — lo que esta tabla hace imposible:

- `producto_atributos_check` — `CHECK (((valor_id IS NOT NULL) OR (valor_texto IS NOT NULL)))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `producto_atributos_select` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 05 · Inventario y movimientos

### `movimientos`

*15 columnas · ~28 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el hecho concreto de inventario; lo cita conteo_lineas.movimiento_id para justificar cada ajuste del censo |
| `variante_id` | uuid | **no** | — | la prenda exacta, talla y color, que se movió |
| `sede_id` | uuid | **no** | — | en qué sede ocurrió; en un traslado es la sede que ENTREGA la mercadería |
| `tipo` | text | **no** | — | entrada, salida, ajuste o traslado — nada más; define el signo y a qué bolsa se aplica |
| `cantidad` | integer | **no** | — | cuántas unidades; siempre positiva salvo en 'ajuste', el único tipo que admite negativo |
| `motivo` | text | sí | — | por qué se movió: venta, merma, conteo, bajada a piso — texto libre, y solo el exacto 'venta' sella stock.ultima_venta |
| `canal` | text | sí | — | tienda u online; hoy solo lo llena registrar_venta y siempre escribe 'tienda' |
| `sede_destino_id` | uuid | sí | — | en un traslado, la sede que RECIBE; obligatorio por código, no por candado de base |
| `monto` | numeric | sí | — | soles de la línea vendida, precio por cantidad; solo la venta lo llena y alimenta el análisis ABC |
| `venta_id` | uuid | sí | — | a qué venta pertenece esta salida; en producción no hay FK y puede citar una venta inexistente |
| `usuario_id` | uuid | sí | — | qué integrante lo registró; la RPC lo resuelve de la sesión, pero un insert directo puede falsearlo |
| `nota` | text | sí | — | lo que escribió quien registró: 'vino roto', 'Conteo censo AQP' — texto libre para auditar después |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo pasó el hecho; es el orden del libro y la fecha que se copia a stock.ultima_* |
| `contenedor_id` | uuid | sí | — | en qué ubicación cayó; si el contenedor es tipo 'almacen' el movimiento va a stock_almacen y no a stock |
| `lote_id` | uuid | sí | — | de qué fardo recibido vino la prenda; solo lo llena recibir_lote |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_canal_check` — `CHECK ((canal = ANY (ARRAY['tienda'::text, 'online'::text])))`
- `movimientos_cantidad_coherente` — `CHECK (((cantidad <> 0) AND ((tipo = 'ajuste'::text) OR (cantidad > 0))))`
- `movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'traslado'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_insert` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `movimientos_select` | SELECT | `(retail.puede_operar_sede(sede_id) OR (sede_destino_id = retail.mi_sede()))` |


### `stock`

*9 columnas · ~10 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `variante_id` | uuid | **no** | — | qué prenda cuenta esta fila, parte de la llave junto con la sede |
| `sede_id` | uuid | **no** | — | en qué boutique está contado este piso de venta |
| `cantidad` | integer | **no** | `0` | lo que se puede vender ahora mismo en esa sede; la base nunca la deja negativa |
| `ultima_entrada` | timestamp with time zone | sí | — | cuándo entró la última unidad al piso, contando las bajadas del almacén |
| `ultima_salida` | timestamp with time zone | sí | — | cuándo salió la última: venta, merma, traslado o devolución al almacén |
| `ultima_venta` | timestamp with time zone | sí | — | cuándo se vendió por última vez; solo se sella si el motivo dice exactamente 'venta' |
| `contenedor_id` | uuid | sí | — | etiqueta de la última ubicación conocida, NO reparte cantidad: puede decir almacén y contarse como vendible |
| `stock_minimo` | integer | sí | — | mínimo propio de esta prenda en esta sede; vacío significa usar el mínimo general de variantes |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó la fila por última vez, sea por movimiento o por recálculo |

**Candados** — lo que esta tabla hace imposible:

- `stock_cantidad_no_negativa` — `CHECK ((cantidad >= 0))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `stock_select` | SELECT | `retail.puede_operar_sede(sede_id)` |


### `stock_almacen`

*6 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `variante_id` | uuid | **no** | — | qué prenda está guardada atrás, parte de la llave junto con la sede |
| `sede_id` | uuid | **no** | — | de qué sede es ese almacén; hay uno solo por sede, por diseño |
| `cantidad` | integer | **no** | `0` | unidades recibidas que siguen guardadas y que nadie puede vender hasta bajarlas al piso |
| `ultima_entrada` | timestamp with time zone | sí | — | cuándo entró la última unidad al almacén, casi siempre al recibir un fardo |
| `ultima_salida` | timestamp with time zone | sí | — | cuándo se bajó la última unidad al piso de venta |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó la fila por última vez, sea por movimiento o por recálculo |

**Candados** — lo que esta tabla hace imposible:

- `stock_almacen_cantidad_no_negativa` — `CHECK ((cantidad >= 0))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `stock_almacen_select` | SELECT | `retail.puede_operar_sede(sede_id)` |


### `contenedores`

*5 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la ubicación física concreta dentro de la sede: ese estante, esa caja o el almacén |
| `sede_id` | uuid | **no** | — | en qué tienda está ese estante o caja; el código solo es único dentro de ella |
| `codigo` | text | **no** | — | cómo lo llama el equipo en piso: A1, CAJA-3, ALMACEN; no se repite en la misma sede |
| `tipo` | text | **no** | — | estante, caja o almacen; 'almacen' no es decorativo, rutea el movimiento a stock_almacen y hay uno solo por sede |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se dio de alta esa ubicación; el contenedor ALMACEN lo sembró la propia migración |

**Candados** — lo que esta tabla hace imposible:

- `contenedores_sede_id_codigo_key` — `UNIQUE (sede_id, codigo)`
- `contenedores_tipo_check` — `CHECK ((tipo = ANY (ARRAY['estante'::text, 'caja'::text, 'almacen'::text])))`
- `contenedores_un_almacen_por_sede` *(único parcial)* — `retail.contenedores (sede_id) WHERE (tipo = 'almacen'::text)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `contenedores_insert` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `contenedores_select` | SELECT | `retail.puede_operar_sede(sede_id)` |


### `lotes`

*11 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la recepción completa: el fardo descargado de una vez, al que apuntan sus movimientos de entrada |
| `sede_id` | uuid | **no** | — | en qué tienda se descargó el fardo, que es donde entra el stock |
| `origen` | text | **no** | — | de dónde vino el fardo: 'taller' (Taller Lima) o 'proveedor', el candado no acepta otra cosa |
| `proveedor` | text | sí | — | quién trajo el fardo, tecleado a mano como texto libre; hoy es el único proveedor que queda guardado |
| `numero_guia` | text | sí | — | la guía de remisión del transportista, para cruzar el fardo contra el papel que llegó |
| `fecha_recepcion` | date | **no** | `CURRENT_DATE` | qué día llegó la mercadería; recibir_lote nunca la manda, así que siempre queda el día del registro |
| `recibido_por` | uuid | sí | — | qué integrante recibió y registró el fardo; queda vacío si esa cuenta no tiene ficha en personas |
| `nota` | text | sí | — | observaciones de la descarga: 'faltaron 2 blusas', 'caja mojada' — texto libre que nadie procesa |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se tecleó la recepción, que puede ser días después de que el fardo llegó |
| `proveedor_id` | uuid | sí | — | el proveedor del directorio que trajo el fardo: existe y hoy nadie la llena |
| `orden_compra_id` | uuid | sí | — | qué orden de compra cierra esta recepción; en producción no se llena, la recibir_lote viva la rechaza |

**Candados** — lo que esta tabla hace imposible:

- `lotes_origen_check` — `CHECK ((origen = ANY (ARRAY['taller'::text, 'proveedor'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `lotes_insert` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `lotes_select` | SELECT | `retail.puede_operar_sede(sede_id)` |



## 06 · Conteo y censo físico

### `conteos`

*17 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la sesión de conteo concreta: una tienda, una tarde, una firma al final |
| `sede_id` | uuid | **no** | — | en qué tienda se está contando: TRU, AQP, LIM o el taller |
| `ubicacion` | text | **no** | `'piso'::text` | qué bolsillo se cuenta, 'piso' o 'almacen'; hoy toda pantalla abre solo en piso |
| `alcance` | text | **no** | `'todo'::text` | qué universo declara cubrir: 'todo', 'familia', 'categoria' o 'contenedor' — descriptivo, nunca impide contar algo de fuera |
| `alcance_familia` | text | sí | — | la familia declarada (indumentaria, calzado, accesorios, bisutería, belleza, papelería); existe y hoy ninguna pantalla la llena |
| `alcance_categoria_id` | uuid | sí | — | la categoría declarada cuando el alcance es 'categoria'; existe y hoy nadie la llena |
| `alcance_contenedor_id` | uuid | sí | — | el estante o caja declarado cuando el alcance es 'contenedor'; existe y hoy nadie la llena |
| `tratar_no_contado` | text | **no** | `'ignorar'::text` | qué hacer con lo que nadie contó: 'ignorar' o 'poner_en_cero', que borra stock y solo actúa en piso |
| `estado` | text | **no** | `'abierto'::text` | 'abierto' mientras se cuenta, 'cerrado' cuando el líder de equipo firma, 'anulado' si se descarta |
| `nombre` | text | sí | — | etiqueta legible tipo 'Conteo TRU 12/9/2026'; viaja a la nota de cada ajuste del cierre |
| `abierto_por` | uuid | sí | — | qué colaboradora arrancó la sesión de conteo en la tienda |
| `abierto_en` | timestamp with time zone | **no** | `now()` | cuándo se abrió la sesión y empezó a contarse el piso |
| `cerrado_por` | uuid | sí | — | quién firmó el cierre o quién anuló: la misma columna guarda las dos firmas |
| `cerrado_en` | timestamp with time zone | sí | — | cuándo se firmó el cierre o se anuló; vacío mientras el conteo sigue abierto |
| `lineas_ajustadas` | integer | sí | — | cuántas prendas salieron con diferencia distinta de cero; se sella al cerrar, vacío mientras está abierto |
| `unidades_diferencia` | integer | sí | — | sobrantes menos faltantes en unidades: es un neto que puede tapar descuadres grandes que se compensan |
| `nota` | text | sí | — | texto libre; hoy solo la escribe la anulación, que le concatena 'anulado: <motivo>' |

**Candados** — lo que esta tabla hace imposible:

- `conteos_alcance_check` — `CHECK ((alcance = ANY (ARRAY['todo'::text, 'familia'::text, 'categoria'::text, 'contenedor'::text])))`
- `conteos_alcance_coherente` — `CHECK (alcance-dependent: exige que solo el campo alcance_* correspondiente al tipo de alcance esté lleno`
- `conteos_alcance_familia_check` — `CHECK ((alcance_familia = ANY (ARRAY['indumentaria'::text, 'calzado'::text, 'accesorios'::text, 'bisuteria'::text, 'belleza'::text, 'papeleria'::text])))`
- `conteos_cierre_coherente` — `CHECK ((((estado = 'abierto'::text) AND (cerrado_en IS NULL)) OR ((estado <> 'abierto'::text) AND (cerrado_en IS NOT NULL))))`
- `conteos_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'anulado'::text])))`
- `conteos_tratar_no_contado_check` — `CHECK ((tratar_no_contado = ANY (ARRAY['ignorar'::text, 'poner_en_cero'::text])))`
- `conteos_ubicacion_check` — `CHECK ((ubicacion = ANY (ARRAY['piso'::text, 'almacen'::text])))`
- `conteos_un_abierto_por_sede` *(único parcial)* — `retail.conteos (sede_id, ubicacion) WHERE (estado = 'abierto'::text)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `conteos_select` | SELECT | `retail.puede_operar_sede(sede_id)` |


### `conteo_lineas`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | una prenda contada dentro de una sesión: la fila que afirma un instante |
| `conteo_id` | uuid | **no** | — | a qué sesión de conteo pertenece esta prenda contada |
| `variante_id` | uuid | **no** | — | la prenda concreta (modelo, talla y color) que se contó en la percha |
| `cantidad_contada` | integer | **no** | — | cuántas hay de verdad en la percha; cada disparo de la pistola suma, salvo modo 'fijar' |
| `cantidad_sistema` | integer | **no** | — | lo que el sistema decía al momento de contar, congelado: no se recalcula nunca, ni al cerrar |
| `contenedor_id` | uuid | sí | — | en qué estante o caja estaba la prenda; la RPC lo acepta y hoy ninguna pantalla lo manda |
| `contado_por` | uuid | sí | — | qué colaboradora contó esta prenda la primera vez |
| `contado_en` | timestamp with time zone | **no** | `now()` | cuándo se contó por primera vez; es el orden de la lista en pantalla |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | cuándo se re-contó o corrigió esta misma prenda por última vez |
| `diferencia` | integer | sí | — | contada menos sistema; vacía mientras el conteo está abierto, se sella al cerrar y hace idempotente el cierre |
| `movimiento_id` | uuid | sí | — | el ajuste de stock que salió de esta línea; vacío si la diferencia fue cero |
| `nota` | text | sí | — | texto libre; hoy solo la escribe el cierre con 'no contada — puesta en cero al cerrar' |

**Candados** — lo que esta tabla hace imposible:

- `conteo_lineas_cantidad_contada_check` — `CHECK ((cantidad_contada >= 0))`
- `conteo_lineas_conteo_id_variante_id_key` — `UNIQUE (conteo_id, variante_id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `conteo_lineas_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.conteos c   WHERE ((c.id = conteo_lineas.conteo_id) AND retail.puede_operar_sede(c.sede_id))))` |



## 07 · Ventas y caja

### `cajas`

*11 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | El turno de caja de una sede: cada venta apunta acá para que el cierre sume solo lo suyo |
| `sede_id` | uuid | **no** | — | En qué tienda es este turno; decide quién puede verlo y operarlo |
| `monto_apertura` | numeric | **no** | — | Con cuánto efectivo arrancó el cajón, declarado a mano; la base acepta hasta un monto negativo |
| `abierta_por` | uuid | sí | — | Qué colaborador abrió el turno; puede venir vacío y no es necesariamente quien cierra |
| `abierta_en` | timestamp with time zone | **no** | `now()` | Cuándo se abrió el cajón; con esto la bandeja avisa de cajas de días anteriores sin cerrar |
| `monto_cierre_contado` | numeric | sí | — | El efectivo que alguien contó físicamente al cerrar; vacío mientras la caja siga abierta |
| `monto_cierre_esperado` | numeric | sí | — | Lo que el servidor calculó que debería haber: apertura más ventas en efectivo, sin restar gastos ni depósitos |
| `diferencia` | numeric | sí | — | Contado menos esperado: positivo sobra, negativo falta, y es el número por el que se pregunta al día siguiente |
| `cerrada_por` | uuid | sí | — | Qué colaborador contó el cajón y cerró el turno; puede ser distinto de quien abrió |
| `cerrada_en` | timestamp with time zone | sí | — | Cuándo se contó el efectivo y se cerró el turno; vacío mientras la caja siga abierta |
| `estado` | text | **no** | `'abierta'::text` | 'abierta' o 'cerrada', nada más; un índice parcial impide dos cajas abiertas en la misma sede |

**Candados** — lo que esta tabla hace imposible:

- `cajas_estado_check` — `CHECK ((estado = ANY (ARRAY['abierta'::text, 'cerrada'::text])))`
- `cajas_sede_abierta_unique` *(único parcial)* — `retail.cajas (sede_id) WHERE (estado = 'abierta'::text)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cajas_insert` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `cajas_select` | SELECT | `retail.puede_operar_sede(sede_id)` |
| `cajas_update` | UPDATE | `retail.puede_operar_sede(sede_id)` |


### `ventas`

*9 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | El cobro completo a una clienta, no la prenda; cada movimiento de salida lo guarda en venta_id |
| `sede_id` | uuid | **no** | — | En qué tienda se cobró; lo copia la RPC desde la caja, nunca lo manda el navegador |
| `caja_id` | uuid | **no** | — | A qué turno de caja pertenece el cobro; por acá el cierre suma solo lo suyo |
| `metodo_pago` | text | **no** | — | Cómo pagó la clienta: efectivo, pos, yape o transferencia; solo 'efectivo' mueve el cajón físico |
| `monto_total` | numeric | **no** | — | Lo cobrado en total; lo suma la RPC con el precio que manda la pantalla, nunca el del catálogo |
| `usuario_id` | uuid | sí | — | Qué colaborador cobró; lo resuelve la RPC desde la sesión, no viaja desde el navegador |
| `nota` | text | sí | — | Texto libre del mostrador sobre el cobro; existe y hoy ninguna pantalla la llena |
| `created_at` | timestamp with time zone | **no** | `now()` | Cuándo se cobró; sobre esta columna se arma 'Ventas de hoy' y toda la serie del panel |
| `token_cliente` | uuid | sí | — | El identificador que el navegador genera por carrito para que reintentar no cobre dos veces; vacío es válido |

**Candados** — lo que esta tabla hace imposible:

- `ventas_metodo_pago_check` — `CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'pos'::text, 'yape'::text, 'transferencia'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ventas_insert` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `ventas_select` | SELECT | `retail.puede_operar_sede(sede_id)` |



## 08 · Facturación SUNAT

### `series_comprobantes`

*5 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el contador vivo de una sede para un tipo de documento |
| `sede_id` | uuid | **no** | — | qué boutique usa esta serie; de ahí sale también el permiso para verla |
| `tipo` | text | **no** | — | boleta, factura, nota_credito o nota_debito — cada tipo lleva su propio contador |
| `serie` | text | **no** | — | el prefijo que define CAYLA, no SUNAT (B004, F001); se guarda siempre en mayúsculas |
| `siguiente_numero` | integer | **no** | `1` | el correlativo que se entregará en la próxima emisión; puede saltar adelante, nunca retroceder |

**Candados** — lo que esta tabla hace imposible:

- `series_comprobantes_sede_id_tipo_key` — `UNIQUE (sede_id, tipo)`
- `series_comprobantes_siguiente_numero_check` — `CHECK ((siguiente_numero > 0))`
- `series_comprobantes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['boleta'::text, 'factura'::text, 'nota_credito'::text, 'nota_debito'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `series_comprobantes_select` | SELECT | `(retail.es_lider() OR retail.puede_operar_sede(sede_id))` |


### `comprobantes`

*28 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el documento legal concreto —boleta, factura o nota— que se emitió y quedó ante SUNAT |
| `venta_id` | uuid | sí | — | qué venta documenta; existe y hoy siempre viene vacío, la boleta y la venta siguen sueltas |
| `sede_id` | uuid | **no** | — | en qué boutique se emitió; decide quién lo ve y de qué serie sale el correlativo |
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

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_select` | SELECT | `(retail.es_lider() OR retail.puede_operar_sede(sede_id))` |


### `proformas`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | La cotización entregada a la clienta, que no es comprobante de pago ante SUNAT |
| `sede_id` | uuid | **no** | — | En qué boutique se cotizó; decide quién puede verla y convertirla |
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

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proformas_select` | SELECT | `(retail.es_lider() OR retail.puede_operar_sede(sede_id))` |


### `sede_datos_fiscales`

*8 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `sede_id` | uuid | **no** | — | de qué local son estos datos para el comprobante; hoy solo una sede los tiene cargados |
| `direccion` | text | sí | — | la dirección del local que iría impresa en la boleta; ningún código la lee todavía |
| `ubigeo` | text | sí | — | el código de distrito de SUNAT del local, exigido en el comprobante electrónico; nadie lo consume aún |
| `departamento` | text | sí | — | el departamento del local tal como debe declararse a SUNAT; escrito a mano, sin lista cerrada |
| `provincia` | text | sí | — | la provincia del local para el domicilio fiscal del comprobante; texto libre, sin validar contra ubigeo |
| `distrito` | text | sí | — | el distrito del local para el comprobante; texto libre, puede no coincidir con el ubigeo |
| `telefono` | text | sí | — | teléfono de la tienda para el pie del comprobante; hoy ninguna pantalla lo muestra |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se corrigieron por última vez los datos fiscales de ese local |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `sede_datos_fiscales_select_autenticado` | SELECT | `(auth.role() = 'authenticated'::text)` |


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
| `configuracion_empresa_select_autenticado` | SELECT | `(auth.role() = 'authenticated'::text)` |



## 09 · Compras y proveedores

### `proveedores`

*15 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el proveedor como ficha única para las tres tiendas; lo citan órdenes, lotes y productos |
| `nombre` | text | **no** | — | con qué nombre se le conoce en la tienda; en producción nada impide dos fichas iguales |
| `ruc` | text | sí | — | su RUC para el comprobante de compra; se escribe a mano y nadie lo valida contra SUNAT |
| `categoria` | text | sí | — | etiqueta heredada de SINATRA que se muestra y se busca, pero el formulario ya no deja editarla |
| `marca` | text | sí | — | la línea que maneja ese proveedor: jeans, blusas de vestir, ropa de niño |
| `score` | numeric | sí | — | nota de calidad heredada de SINATRA; se muestra en la lista y ninguna pantalla la escribe |
| `contacto` | text | sí | — | el nombre de la persona con quien se habla para pactar el fardo |
| `telefono` | text | sí | — | el WhatsApp por el que se cierra la compra, que es como compra CAYLA |
| `banco` | text | sí | — | en qué banco cobra ese proveedor; visible para cualquiera con cuenta, decisión consciente D-27 |
| `cuenta_bancaria` | text | sí | — | el número de cuenta al que se le transfiere; dato de un tercero y visible para todos |
| `direccion` | text | sí | — | dónde queda su local o almacén cuando hay que ir a recoger |
| `nota` | text | sí | — | texto libre sobre el proveedor; existe y hoy ninguna pantalla la escribe ni la lee |
| `activo` | boolean | **no** | `true` | si le seguimos comprando; desactivar archiva la ficha y nunca borra la fila |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró al directorio único que reemplazó los tres Excel desincronizados de las tiendas |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó la ficha por última vez; lo pone un trigger, no la pantalla |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedores_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `proveedores_write_lider` | ALL | `retail.es_lider()` |


### `ordenes_compra`

*11 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el pedido pactado; es lo que el lote guarda en orden_compra_id al recibir el fardo |
| `proveedor` | text | **no** | — | el nombre copiado como texto al crear la orden; es lo que se muestra, no el del directorio |
| `estado` | text | **no** | `'pendiente'::text` | pendiente, confirmada, recibida o cancelada; en producción no hay check y entra cualquier texto |
| `sede_destino_id` | uuid | **no** | — | a qué tienda llega el fardo, y también quién tiene permiso de ver la orden |
| `fecha` | date | **no** | `CURRENT_DATE` | el día en que se pactó la compra, arranque de la línea de control pedido-llegada |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se registró la orden; la lista se ordena por esto, no por la fecha pactada |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se movió por última vez, normalmente al cancelarla o al cerrarla con el fardo |
| `proveedor_id` | uuid | sí | — | a qué ficha del directorio apunta; puede ir vacía porque el formulario deja escribir un proveedor suelto |
| `monto_estimado` | numeric | sí | — | cuánto se espera pagar; suma el dinero comprometido en camino y nunca se concilia con lo pagado |
| `fecha_estimada` | date | sí | — | cuándo debería llegar el fardo; sin ella la orden nunca se marca atrasada |
| `nota` | text | sí | — | lo pactado por WhatsApp en texto, '40 blusas y 20 jeans'; sustituye al detalle por prenda |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ordenes_compra_lider` | ALL | `retail.es_lider()` |
| `ordenes_compra_select_sede` | SELECT | `(sede_destino_id = retail.mi_sede())` |


### `ordenes_compra_items`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la línea de detalle del pedido; existe y hoy nadie la llena, cero filas en producción |
| `orden_id` | uuid | **no** | — | a qué pedido pertenece la línea; borrar la orden se lleva sus líneas en cascada |
| `variante_id` | uuid | **no** | — | qué prenda exacta, talla y color, se pidió; tabla muerta, ninguna pantalla la escribe |
| `cantidad` | integer | **no** | — | cuántas unidades de esa prenda se pidieron; sin candado de mayor que cero y sin uso real |
| `costo_unitario` | numeric | **no** | — | a cuánto se pactó cada prenda; CAYLA compra por fardo y monto, nunca por SKU |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ordenes_compra_items_lider` | ALL | `retail.es_lider()` |



## 10 · Producción del Taller

### `producciones`

*20 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la corrida concreta del Taller; su prefijo de 8 caracteres queda escrito en el movimiento de stock |
| `unidad_id` | uuid | **no** | — | en qué sede se fabricó, siempre el Taller de Lima; decide quién puede tocar la corrida |
| `variante_id` | uuid | sí | — | MUERTA: la talla-color del modelo viejo, ningún RPC la llena desde la 0026 |
| `producto_id` | uuid | sí | — | qué modelo se fabricó; acepta vacío por herencia, pero en la práctica todo RPC lo llena |
| `fecha` | date | **no** | `CURRENT_DATE` | la fecha de la corrida, pero nadie la escribe ni la lee: siempre queda el día del registro |
| `cantidad` | integer | **no** | — | cuántas prendas: al abrir es el plan, al cerrar la pisan las que salieron buenas |
| `costo_tela` | numeric | **no** | `0` | soles de tela de toda la corrida, no por prenda; lo teclea una persona sin nada que lo contraste |
| `costo_avios` | numeric | **no** | `0` | botones, cierres, etiquetas e hilo de toda la corrida: el resto del material directo |
| `costo_maquila` | numeric | **no** | `0` | lo que se mandó afuera en esa corrida (planchado, corte tercerizado), nunca una cotización de comparación |
| `precio_taller` | numeric | **no** | `0` | precio al que el Taller le vende a la tienda; alimenta un semáforo que D-31 prohíbe |
| `costo_unitario` | numeric | sí | — | costo por prenda, columna calculada: no se escribe a mano y cerrar con menos buenas lo sube solo |
| `es_muestra` | boolean | **no** | `false` | si es desarrollo del modelo y no producción vendible; una muestra nunca entra al inventario |
| `estado` | text | **no** | `'terminado'::text` | en_proceso o terminado, nada más; el default dice terminado pero la RPC siempre inserta en_proceso |
| `etapas` | jsonb | **no** | `'{}'::jsonb` | tablero de avance: cada etapa en pendiente, hecho o tercerizado; producción acepta seis etapas, local solo tres |
| `detalle` | text | sí | — | texto libre con las tallas y colores de la corrida; es lo que se ve en la bandeja de pendientes |
| `fecha_entrega` | date | sí | — | para cuándo se comprometió la corrida; alimenta la alarma de orden pasada de fecha |
| `inventariado_at` | timestamp with time zone | sí | — | cuándo entraron las prendas al stock; vacío es todavía no, y es el candado contra el doble conteo |
| `nota` | text | sí | — | observación libre de la corrida; existe y la pantalla del Taller siempre la manda vacía |
| `creado_por` | uuid | sí | — | qué integrante del Taller abrió la corrida |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se abrió la corrida; es el orden del tablero del Taller |

**Candados** — lo que esta tabla hace imposible:

- `producciones_estado_check` — `CHECK ((estado = ANY (ARRAY['en_proceso'::text, 'terminado'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `producciones_all_lider` | ALL | `retail.es_lider()` |
| `producciones_select_propia` | SELECT | `(unidad_id = retail.mi_sede())` |


### `produccion_lineas`

*5 columnas · ~15 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la línea de desglose de una corrida: una talla-color con su cantidad |
| `produccion_id` | uuid | **no** | — | de qué corrida del Taller viene; borrar la corrida se lleva sus líneas en cascada |
| `variante_id` | uuid | **no** | — | qué prenda exacta, talla y color, recibe la entrada de stock al cerrar la corrida |
| `cantidad` | integer | **no** | — | cuántas unidades de esa talla-color: al abrir el plan, al cerrar las buenas; cero borra la línea |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se agregó esa talla-color al desglose de la corrida |

**Candados** — lo que esta tabla hace imposible:

- `produccion_lineas_cantidad_check` — `CHECK ((cantidad > 0))`
- `produccion_lineas_produccion_id_variante_id_key` — `UNIQUE (produccion_id, variante_id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `pl_select` | SELECT | `(retail.es_lider() OR (EXISTS ( SELECT 1    FROM retail.producciones p   WHERE ((p.id = produccion_lineas.produccion_id) AND retail.puede_operar_sede(p.unidad_id)))))` |


### `ordenes_produccion` — ⚰️ MUERTA

> **Por qué sigue viva:** Modelo de producción de la Fase 1. Reemplazado por `producciones` + `produccion_lineas`. Sigue vivo porque nunca se retiró; no tiene RPC activo.

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la orden del rastreador viejo del Taller; tabla muerta, hoy sin una sola fila |
| `variante_id` | uuid | **no** | — | qué talla-color se iba a producir cuando el plan era por prenda y no por corrida |
| `sede_id` | uuid | **no** | — | en qué sede se iba a producir; manda quién puede ver y editar la orden |
| `cantidad_planeada` | integer | **no** | — | cuántas prendas se pidieron en el plan viejo |
| `cantidad_producida` | integer | **no** | `0` | cuántas salieron de verdad; existe y nadie la actualiza nunca |
| `estado` | text | **no** | `'planeada'::text` | planeada, en_proceso, completada o cancelada; solo recibir_lote en local la mueve a completada |
| `fecha_inicio` | date | sí | — | cuándo arrancó la orden en el taller; existe y hoy nadie la llena |
| `fecha_fin` | date | sí | — | cuándo se dio por terminada; solo la escribe recibir_lote en local al recibir el lote |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se creó la orden del modelo viejo |
| `updated_at` | timestamp with time zone | **no** | `now()` | última vez que se tocó la orden; la mantiene un trigger y no se puede falsear a mano |
| `etapa` | text | sí | `'corte'::text` | corte, confeccion o acabado del modelo viejo; en producción no tiene candado y acepta cualquier texto |
| `destino_sede_id` | uuid | sí | — | a qué tienda iba la mercadería; es lo que deja a esa tienda ver la orden que viene hacia ella |
| `nota` | text | sí | — | observación libre de la orden; existe y hoy nadie la llena |

**Candados** — lo que esta tabla hace imposible:

- `ordenes_produccion_estado_check` — `CHECK ((estado = ANY (ARRAY['planeada'::text, 'en_proceso'::text, 'completada'::text, 'cancelada'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `op_all_lider` | ALL | `retail.es_lider()` |
| `op_insert_sede` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `op_select_destino` | SELECT | `(destino_sede_id = retail.mi_sede())` |
| `op_select_sede` | SELECT | `(sede_id = retail.mi_sede())` |
| `op_update_sede` | UPDATE | `retail.puede_operar_sede(sede_id)` |


### `bom_items` — ⚰️ MUERTA

> **Por qué sigue viva:** Legado de la Fase 1 — pero OJO: sí tiene pantalla propia (la receta de costo en la ficha de producto). No se puede borrar sin decidir qué pasa con esa pantalla.

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la línea de receta de un modelo; la pantalla la borra físicamente, sin dejar rastro |
| `producto_id` | uuid | **no** | — | de qué modelo es la receta de costo; borrar el modelo borra su receta entera |
| `insumo` | text | **no** | — | cómo se llama el insumo: Lino crudo, Botón 4 huecos — texto libre, y se puede repetir dos veces |
| `cantidad_requerida` | numeric | **no** | — | cuánto de ese insumo entra en una prenda; producción guarda tres decimales y local cuatro |
| `unidad` | text | **no** | — | en qué se mide el insumo: m, und — texto libre, sin vocabulario cerrado |
| `precio_unitario` | numeric | sí | — | precio de referencia del insumo; vacío significa que la línea no suma al costo sugerido |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se agregó la línea a la receta; es el orden en que aparece en pantalla |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `bom_all_lider` | ALL | `retail.es_lider()` |



## 11 · Finanzas operativas

### `gastos`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | cada salida de plata que solo el Líder de equipo registra; nada impide anotarla dos veces |
| `sede_id` | uuid | **no** | — | a qué tienda se le carga la plata; los gastos comunes se cargan a CCO |
| `categoria` | text | **no** | — | en qué se gastó: la pantalla ofrece ocho (alquiler, servicios, planilla…), la base acepta cualquier texto |
| `subtotal` | numeric | **no** | `0` | el monto sin IGV, calculado al revés desde el total; ningún reporte lo suma |
| `igv` | numeric | **no** | `0` | el IGV del comprobante, guardado esperando el crédito fiscal que todavía nadie usa |
| `total` | numeric | **no** | — | lo que realmente salió del bolsillo; es el único de los tres que suman los reportes |
| `especificacion` | text | sí | — | la frase que escribe quien registra ('Alquiler julio', 'luz'), lo único que permite reconocer el gasto después |
| `usuario_id` | uuid | sí | — | qué colaborador lo registró; lo llena la RPC desde la sesión, nunca la pantalla |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se anotó y a qué mes se carga: uno de junio anotado en julio cae en julio |
| `metodo_pago` | text | sí | — | con qué se pagó; solo 'efectivo' exacto baja el cuadre, y en producción viene siempre vacía |

**Candados** — lo que esta tabla hace imposible:

- `gastos_total_check` — `CHECK ((total > (0)::numeric))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `gastos_all_lider` | ALL | `retail.es_lider()` |


### `depositos_bancarios`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | cada viaje de efectivo al banco; no se puede editar ni borrar, dos clics son dos depósitos |
| `sede_id` | uuid | **no** | — | de qué cajón de qué tienda salió ese efectivo |
| `fecha` | date | **no** | `CURRENT_DATE` | el día en que se llevó la plata al banco; se muestra, pero nadie filtra por ella |
| `monto` | numeric | **no** | — | cuánto efectivo se llevó al banco, siempre positivo: resta del efectivo teórico de la tienda |
| `nota` | text | sí | — | el banco o el número de voucher anotado a mano para reencontrarlo en el extracto |
| `usuario_id` | uuid | sí | — | qué colaborador registró el depósito; lo llena la RPC desde la sesión |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se anotó en el sistema, que puede no ser el día del depósito |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `depositos_insert` | INSERT | `retail.puede_operar_sede(sede_id)` |
| `depositos_select` | SELECT | `retail.puede_operar_sede(sede_id)` |


### `ajustes_efectivo`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | cada corrección manual del efectivo teórico; el Líder de equipo puede editarla o borrarla después |
| `sede_id` | uuid | **no** | — | qué cajón de qué tienda se está corrigiendo |
| `fecha` | date | **no** | `CURRENT_DATE` | el día del ajuste; la pantalla no la manda, así que queda el día del botón |
| `monto` | numeric | **no** | — | va con signo: +100 sube el efectivo teórico, −100 lo baja, y un cero también entra |
| `motivo` | text | **no** | — | por qué se corrige; obligatorio, pero la pantalla rellena 'Ajuste sin motivo' si lo dejan vacío |
| `usuario_id` | uuid | sí | — | qué colaborador lo hizo; existe y hoy siempre llega vacía porque la pantalla no la manda |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se apretó el botón del ajuste, la única huella real de cuándo pasó |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ajustes_all_lider` | ALL | `retail.es_lider()` |



## 12 · Contabilidad

### `cuentas_contables`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la cuenta concreta que cada línea del diario mueve — el amarre real, no el código |
| `codigo` | text | **no** | — | el número PCGE que el contador espera, 101 Caja o 701 Ventas, único y llave de la RPC |
| `nombre` | text | **no** | — | cómo se llama la cuenta en el desplegable de /finanzas/registrar |
| `elemento` | text | **no** | — | en qué mitad del balance cae: activo, pasivo, patrimonio, ingreso o gasto — sin check en producción |
| `naturaleza` | text | **no** | — | deudora o acreedora: traduce el debe y haber a sube o baja — producción no valida el valor |
| `es_contra` | boolean | **no** | `false` | marca la cuenta que resta de su grupo en vez de sumar, hoy solo 391 Depreciación acumulada |
| `explicacion` | text | **no** | — | la frase en criollo que evita cargar el alquiler en la cuenta equivocada, obligatoria en cada cuenta |
| `orden` | integer | **no** | `0` | en qué posición sale la cuenta en el desplegable de registro, no es jerarquía contable |
| `activo` | boolean | **no** | `true` | cuenta retirada sin borrarla: la pantalla de registro solo ofrece las que siguen en true |
| `created_at` | timestamp with time zone | **no** | `now()` | desde cuándo existe la cuenta en el plan; en producción está vacío, nadie ha creado ninguna |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se editó por última vez la cuenta, lo pisa el trigger y no la pantalla |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_contables_codigo_key` — `UNIQUE (codigo)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cuentas_select` | SELECT | `(auth.role() = 'authenticated'::text)` |
| `cuentas_write_lider` | ALL | `retail.es_lider()` |


### `asientos`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el hecho contable al que se cuelgan sus líneas; en producción no existe ni uno todavía |
| `fecha` | date | **no** | `CURRENT_DATE` | el día al que pertenece el hecho; la RPC la recibe, así se puede asentar en un mes ya cerrado |
| `unidad_id` | uuid | **no** | — | a qué sede se le carga el resultado: TRU, AQP, Tienda Lima, Taller o Corporativo |
| `glosa` | text | **no** | — | la explicación en humano del hecho, tipo alquiler de setiembre con su factura |
| `origen` | text | **no** | `'manual'::text` | de qué evento nació: apertura, manual, venta, compra, gasto, deposito, despacho, depreciacion, cierre o ajuste — sin check en producción |
| `referencia_tipo` | text | sí | — | qué clase de documento originó el asiento, venta o gasto: existe y hoy siempre viene vacío |
| `referencia_id` | uuid | sí | — | el id de ese documento, el amarre contra el asiento duplicado — hoy siempre vacío y sin único |
| `creado_por` | uuid | sí | — | qué persona registró el asiento; la RPC lo resuelve por sesión y no se puede falsear |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró de verdad al sistema, que no es lo mismo que la fecha del hecho |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `asientos_select_lider` | SELECT | `retail.es_lider()` |
| `asientos_select_propia` | SELECT | `(unidad_id = retail.mi_sede())` |


### `asiento_lineas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | cada renglón suelto del debe o del haber de un asiento; hoy el libro está en cero |
| `asiento_id` | uuid | **no** | — | a qué hecho contable pertenece el renglón; borrar el asiento se llevaría sus líneas en cascada |
| `cuenta_id` | uuid | **no** | — | qué cuenta del plan se mueve en este renglón, imposible una que no esté en el plan |
| `debe` | numeric | **no** | `0` | lo que entra a esa cuenta, sube un activo o un gasto — producción admite hasta un negativo |
| `haber` | numeric | **no** | `0` | lo que sale de esa cuenta; en producción una misma línea puede traer debe y haber a la vez |
| `glosa` | text | sí | — | detalle de ese renglón cuando la glosa de la cabecera no alcanza, opcional |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `lineas_select_lider` | SELECT | `retail.es_lider()` |
| `lineas_select_propia` | SELECT | `(EXISTS ( SELECT 1    FROM retail.asientos a   WHERE ((a.id = asiento_lineas.asiento_id) AND (a.unidad_id = retail.mi_sede()))))` |


### `activos_fijos`

*16 columnas · ~39 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el bien concreto: esa máquina, ese mostrador, ese equipo de cómputo |
| `unidad_id` | uuid | **no** | — | en qué sede vive el bien; la pantalla de Activos solo muestra los de tu sede |
| `nombre` | text | **no** | — | cómo se le dice al bien en la boutique o el taller: 'Remalladora Siruba' |
| `serie` | text | sí | — | número de serie del fabricante; sin él un robo no se le prueba al seguro |
| `descripcion` | text | sí | — | detalle libre del bien; se puede llenar pero hoy ninguna pantalla lo muestra |
| `cuenta_codigo` | text | **no** | — | a qué cuenta del plan va: 333 maquinaria, 336 cómputo, 335 muebles; hoy apunta a cuentas que no existen |
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

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `activos_all_lider` | ALL | `retail.es_lider()` |
| `activos_select_propia` | SELECT | `(unidad_id = retail.mi_sede())` |


### `patrimonio_items`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | una partida del Balance cargada a mano; es de CAYLA entera, no de una sede |
| `nombre` | text | **no** | — | cómo se llama la partida: 'Estantería tienda Trujillo', 'Préstamo Interbank' |
| `tipo` | text | **no** | — | activo, que suma al patrimonio, o pasivo, que resta; producción no impide otro valor |
| `monto` | numeric | **no** | `0` | cuánto vale o cuánto se debe, en soles; sin fecha, cambiarlo mueve el Balance de todos los meses |
| `nota` | text | sí | — | detalle libre de la partida, para explicar de dónde salió ese monto |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se cargó la partida al Balance; en producción todavía no hay ninguna |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se corrigió por última vez el monto o el nombre; lo pisa el trigger |
| `categoria` | text | sí | — | muebles, equipos, intangible, banco, deuda_proveedor, prestamo, impuesto u otro; la lista vive en la pantalla, no en la base |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `patrimonio_all_lider` | ALL | `retail.es_lider()` |



## 13 · Inteligencia y reportes

### `ventas_historicas_mensuales`

*5 columnas · ~12 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | cada total mensual sembrado a mano desde el Excel viejo; si se borra no hay cómo recalcularlo |
| `sede_id` | uuid | **no** | — | de qué tienda es ese total mensual traído del Excel |
| `anio` | integer | **no** | — | el año calendario del total; arma las columnas del comparativo, solo se acepta entre 2020 y 2100 |
| `mes` | integer | **no** | — | el mes calendario, 1 a 12; arma las filas del comparativo año contra año |
| `monto` | numeric | **no** | `0` | cuánto vendió esa tienda ese mes según el Excel; se SUMA a lo que calcula el sistema |

**Candados** — lo que esta tabla hace imposible:

- `ventas_historicas_mensuales_anio_check` — `CHECK (((anio >= 2020) AND (anio <= 2100)))`
- `ventas_historicas_mensuales_mes_check` — `CHECK (((mes >= 1) AND (mes <= 12)))`
- `ventas_historicas_mensuales_sede_id_anio_mes_key` — `UNIQUE (sede_id, anio, mes)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ventas_hist_all_lider` | ALL | `retail.es_lider()` |



## 14 · Plataforma y esquema

### `migraciones_aplicadas`

*3 columnas · ~18 filas · ⚠️ **sin permisos por fila***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `archivo` | text | **no** | — | el SQL que Felipe pegó a mano en las tiendas; re-pegarlo no duplica la fila |
| `aplicada_at` | timestamp with time zone | **no** | `now()` | cuándo corrió la PRIMERA vez; re-pegar el archivo no pisa esa fecha, ahí está su valor |
| `nota` | text | sí | — | con qué certeza se sabe esa fecha: 'verificado en vivo' o 'según BACKLOG, no re-verificado' |

