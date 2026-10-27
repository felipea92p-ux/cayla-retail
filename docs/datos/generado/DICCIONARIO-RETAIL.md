# Diccionario — CAYLA Retail (schema `retail`)

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre `pnpm datos:generar`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en `glosario.json` y este generador respeta.
>
> **Origen:** `volcado de producción (retail_*.json)`
> **Leído el:** 2026-10-26 23:32:24 UTC
> **Tablas y vistas encontradas:** 287
> **Funciones en `retail`:** 1657 (las firmas, en `funciones-produccion.txt`)
>
> El orden sigue los 14 pájaros de `scripts/datos/aviario.mjs`, la única lista de qué
> pájaro es cada tabla (el índice está en `AVIARIO.md`). Para entender **por qué**
> existe cada tabla, abre el archivo del módulo en `docs/datos/modulos/`; este archivo
> solo dice **qué hay**.
---


## 01 · Ganso — Identidad y acceso

### `colaboradores`

*9 columnas · ~27 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `agregado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `rol` | text | **no** | `'colaborador'::text` | — |
| `ubicacion_asignada_id` | uuid | sí | — | — |
| `tope_descuento_pct` | numeric | sí | `10` | — |
| `estado` | text | **no** | `'activo'::text` | — |
| `terminal` | text | sí | — | — |
| `rol_id` | uuid | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `colaboradores_colaborador_con_ubicacion` — `CHECK (((rol = 'lider'::text) OR (ubicacion_asignada_id IS NOT NULL)))`
- `colaboradores_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente_aprobacion'::text, 'activo'::text])))`
- `colaboradores_montos_finitos` — `CHECK ((abs(tope_descuento_pct) < 'Infinity'::numeric))`
- `colaboradores_rol_check` — `CHECK ((rol = ANY (ARRAY['lider'::text, 'colaborador'::text, 'integrante'::text])))`
- `colaboradores_terminal_retirada` — `CHECK ((terminal IS NULL))`
- `colaboradores_terminal_valida` — `CHECK (((terminal IS NULL) OR ((terminal = ANY (ARRAY['ventas'::text, 'administrativa'::text])) AND (rol = ANY (ARRAY['colaborador'::text, 'integrante'::text])))))`
- `colaboradores_tope_descuento_pct_rango` — `CHECK (((tope_descuento_pct IS NULL) OR ((tope_descuento_pct >= (0)::numeric) AND (tope_descuento_pct <= (100)::numeric))))`
- `colaboradores_una_terminal_por_tipo_y_tienda` *(único parcial)* — `retail.colaboradores (ubicacion_asignada_id, terminal) WHERE (terminal IS NOT NULL)`

**De qué depende:** `(agregado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(rol_id) REFERENCES retail.roles(id)` · `(ubicacion_asignada_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colaboradores_select` | SELECT | `( SELECT retail.fn_puede_gestionar_colaboradores() AS fn_puede_gestionar_colaboradores)` |


### `ubicaciones`

*11 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `sede_dynamic_id` | uuid | sí | — | — |
| `meta_venta_diaria` | numeric | sí | — | — |
| `fondo_caja` | numeric | sí | — | — |
| `hora_cierre` | time without time zone | sí | — | — |
| `whatsapp_numero` | text | sí | — | — |
| `carga_inicial_hasta` | date | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicaciones_fondo_caja_no_negativo` — `CHECK (((fondo_caja IS NULL) OR (fondo_caja >= (0)::numeric)))`
- `ubicaciones_meta_venta_diaria_positiva` — `CHECK (((meta_venta_diaria IS NULL) OR (meta_venta_diaria > (0)::numeric)))`
- `ubicaciones_montos_finitos` — `CHECK (((abs(meta_venta_diaria) < 'Infinity'::numeric) AND (abs(fondo_caja) < 'Infinity'::numeric)))`
- `ubicaciones_nombre_key` — `UNIQUE (nombre)`
- `ubicaciones_tipo_check` — `CHECK ((tipo = ANY (ARRAY['tienda'::text, 'almacen'::text, 'taller'::text])))`
- `ubicaciones_whatsapp_numero_formato` — `CHECK (((whatsapp_numero IS NULL) OR (whatsapp_numero ~ '^9[0-9]{8}$'::text)))`

**De qué depende:** `(sede_dynamic_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ubicaciones_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `ubicaciones_write_lider` | ALL | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `colaboradores_historial`

*9 columnas · ~62 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `accion` | text | **no** | — | — |
| `por` | uuid | sí | — | — |
| `rol` | text | sí | — | — |
| `ubicacion_anterior_id` | uuid | sí | — | — |
| `ubicacion_nueva_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `colaboradores_historial_accion_check` — `CHECK ((accion = ANY (ARRAY['alta'::text, 'baja'::text, 'suspension'::text, 'reactivacion'::text, 'ubicacion'::text, 'aprobacion'::text])))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colaboradores_historial_select` | SELECT | `( SELECT retail.fn_puede_gestionar_colaboradores() AS fn_puede_gestionar_colaboradores)` |


### `colaboradores_suspendidos`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `rol` | text | **no** | — | — |
| `ubicacion_asignada_id` | uuid | sí | — | — |
| `agregado_por` | uuid | sí | — | — |
| `agregado_en` | timestamp with time zone | **no** | — | — |
| `suspendido_por` | uuid | **no** | — | — |
| `suspendido_en` | timestamp with time zone | **no** | `now()` | — |
| `motivo` | text | sí | — | — |
| `terminal` | text | sí | — | — |
| `rol_id` | uuid | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `colaboradores_suspendidos_colaborador_con_ubicacion` — `CHECK (((rol = 'lider'::text) OR (ubicacion_asignada_id IS NOT NULL)))`
- `colaboradores_suspendidos_motivo_largo` — `CHECK (((motivo IS NULL) OR ((char_length(motivo) >= 1) AND (char_length(motivo) <= 300))))`
- `colaboradores_suspendidos_rol_check` — `CHECK ((rol = ANY (ARRAY['lider'::text, 'colaborador'::text, 'integrante'::text])))`
- `colaboradores_suspendidos_terminal_valida` — `CHECK (((terminal IS NULL) OR ((terminal = ANY (ARRAY['ventas'::text, 'administrativa'::text])) AND (rol = ANY (ARRAY['colaborador'::text, 'integrante'::text])))))`

**De qué depende:** `(agregado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(rol_id) REFERENCES retail.roles(id)` · `(suspendido_por) REFERENCES personas(id)` · `(ubicacion_asignada_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colaboradores_suspendidos_select` | SELECT | `( SELECT retail.fn_puede_gestionar_colaboradores() AS fn_puede_gestionar_colaboradores)` |


### `roles`

*13 columnas · ~8 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clave` | text | sí | — | — |
| `nombre` | text | **no** | — | — |
| `descripcion` | text | sí | — | — |
| `es_sistema` | boolean | **no** | `false` | — |
| `fijo` | boolean | **no** | `false` | — |
| `limitado_como_hoy` | boolean | **no** | `false` | — |
| `creado_at` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `archivado_at` | timestamp with time zone | sí | — | — |
| `archivado_por` | uuid | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `pantalla_principal` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `roles_clave_check` — `CHECK (((clave IS NULL) OR (clave = ANY (ARRAY['lider'::text, 'integrante'::text, 'terminal_ventas'::text, 'terminal_administrativa'::text]))))`
- `roles_clave_key` — `UNIQUE (clave)`
- `roles_descripcion_check` — `CHECK (((descripcion IS NULL) OR (length(descripcion) <= 200)))`
- `roles_fijo_es_sistema` — `CHECK (((NOT fijo) OR es_sistema))`
- `roles_nombre_check` — `CHECK (((length(btrim(nombre)) >= 1) AND (length(btrim(nombre)) <= 60)))`
- `roles_sistema_no_se_archiva` — `CHECK ((NOT (es_sistema AND (archivado_at IS NOT NULL))))`
- `roles_nombre_unico_vigente` *(único parcial)* — `retail.roles (lower(btrim(nombre))) WHERE (archivado_at IS NULL)`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(pantalla_principal) REFERENCES retail.modulos(clave)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `roles_select` | SELECT | `( SELECT retail.fn_puede_administrar_roles() AS fn_puede_administrar_roles)` |


### `modulos`

*8 columnas · ~50 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `clave` | text | **no** | — | — |
| `grupo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `incluye` | text | **no** | — | — |
| `orden` | integer | **no** | — | — |
| `solo_lider` | boolean | **no** | `false` | — |
| `delegable` | boolean | **no** | `true` | — |
| `del_admin` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `modulos_clave_check` — `CHECK ((clave ~ '^[a-z_]+$'::text))`
- `modulos_solo_lider_no_delegable` — `CHECK ((NOT (solo_lider AND delegable)))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `modulos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |


### `rol_modulos`

*2 columnas · ~60 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `rol_id` | uuid | **no** | — | — |
| `modulo` | text | **no** | — | — |

**De qué depende:** `(modulo) REFERENCES retail.modulos(clave)` · `(rol_id) REFERENCES retail.roles(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `rol_modulos_select` | SELECT | `( SELECT retail.fn_puede_administrar_roles() AS fn_puede_administrar_roles)` |


### `roles_historial`

*6 columnas · ~68 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `rol_id` | uuid | **no** | — | — |
| `accion` | text | **no** | — | — |
| `detalle` | jsonb | **no** | `'{}'::jsonb` | — |
| `hecho_por` | uuid | sí | — | — |
| `hecho_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `roles_historial_accion_check` — `CHECK ((accion = ANY (ARRAY['creacion'::text, 'modulos'::text, 'renombre'::text, 'archivo'::text, 'restauracion'::text, 'asignacion'::text])))`

**De qué depende:** `(hecho_por) REFERENCES personas(id)` · `(rol_id) REFERENCES retail.roles(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `roles_historial_select` | SELECT | `( SELECT retail.fn_puede_administrar_roles() AS fn_puede_administrar_roles)` |


### `terminales`

*16 columnas · ~6 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | sí | — | — |
| `auth_user_id` | uuid | sí | — | — |
| `activo` | boolean | **no** | `true` | — |
| `creada_at` | timestamp with time zone | **no** | `now()` | — |
| `creada_por` | uuid | sí | — | — |
| `desactivada_at` | timestamp with time zone | sí | — | — |
| `desactivada_por` | uuid | sí | — | — |
| `rol_id` | uuid | **no** | — | — |
| `reactivada_por` | uuid | sí | — | — |
| `reactivada_at` | timestamp with time zone | sí | — | — |
| `clave_cambiada_por` | uuid | sí | — | — |
| `clave_cambiada_at` | timestamp with time zone | sí | — | — |
| `firma_respaldo_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `terminales_activa_con_cuenta` — `CHECK (((NOT activo) OR (auth_user_id IS NOT NULL)))`
- `terminales_auth_user_id_key` — `UNIQUE (auth_user_id)`
- `terminales_nombre_check` — `CHECK ((length(TRIM(BOTH FROM nombre)) > 0))`
- `terminales_tipo_check` — `CHECK ((tipo = ANY (ARRAY['ventas'::text, 'administrativa'::text])))`
- `terminales_nombre_unico_activa` *(único parcial)* — `retail.terminales (ubicacion_id, lower(btrim(nombre))) WHERE activo`

**De qué depende:** `(auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL` · `(clave_cambiada_por) REFERENCES personas(id)` · `(creada_por) REFERENCES personas(id)` · `(desactivada_por) REFERENCES personas(id)` · `(firma_respaldo_id) REFERENCES personas(id)` · `(reactivada_por) REFERENCES personas(id)` · `(rol_id) REFERENCES retail.roles(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `terminales_select` | SELECT | `(( SELECT retail.fn_puede_gestionar_colaboradores() AS fn_puede_gestionar_colaboradores) OR (auth_user_id = ( SELECT auth.uid() AS uid)))` |


### `lider_modulos_ocultos`

*2 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `modulo` | text | **no** | — | — |
| `ocultado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `lider_modulos_ocultos_roles_no` — `CHECK ((modulo <> 'roles'::text))`

**De qué depende:** `(modulo) REFERENCES retail.modulos(clave)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `guias_vistas`

*4 columnas · ~243 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `quien` | uuid | **no** | — | — |
| `guia` | text | **no** | — | — |
| `ofrecida_en` | timestamp with time zone | **no** | `now()` | — |
| `completada_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `guias_vistas_guia_check` — `CHECK ((guia ~ '^[a-z0-9][a-z0-9._-]{0,79}$'::text))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `acciones_sin_responsable`

*2 columnas · ~66 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `clave` | text | **no** | — | — |
| `descripcion` | text | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `acciones_sin_responsable_clave_check` — `CHECK ((clave ~ '^[a-z0-9_]+$'::text))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `preferencias_colaborador`

*3 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `mensaje_pedidos_web` | text | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `preferencias_colaborador_mensaje_pedidos_web_check` — `CHECK (((mensaje_pedidos_web IS NULL) OR ((length(mensaje_pedidos_web) >= 1) AND (length(mensaje_pedidos_web) <= 600))))`

**De qué depende:** `(persona_id) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 02 · Loro — Catálogo y vocabulario

### `productos`

*22 columnas · ~466 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el modelo en sí: de aquí cuelgan sus variantes (talla y color) |
| `categoria_id` | uuid | sí | — | en qué categoría del catálogo entra el modelo; puede quedar vacío |
| `referencia` | text | **no** | — | cómo se llama la prenda para la gente: "Blusa Aurora" |
| `descripcion` | text | sí | — | texto largo del modelo |
| `estado` | text | **no** | `'activo'::text` | si el modelo sigue en el catálogo: 'activo' o 'descontinuado'; descontinuar no borra nada |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se dio de alta el modelo en el catálogo |
| `codigo` | text | sí | — | el nombre corto del modelo (BLU-0042); no se repite |
| `token_cliente` | uuid | sí | — | — |
| `stock_minimo` | integer | sí | — | — |
| `temporada` | text | sí | — | de qué temporada es («Verano 26»), texto libre |
| `permitir_venta_sin_stock` | boolean | **no** | `false` | — |
| `tejido_id` | uuid | sí | — | — |
| `patron_id` | uuid | sí | — | — |
| `estado_alta` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `marca_id` | uuid | sí | — | — |
| `proveedor_id` | uuid | sí | — | a qué proveedor se le compra habitualmente este modelo; quién trajo cada lote vive en lotes |
| `es_prueba` | boolean | **no** | `false` | — |
| `version` | integer | **no** | `1` | — |
| `empresa_id` | uuid | **no** | `retail.fn_empresa_casa_id()` | — |

**Candados** — lo que esta tabla hace imposible:

- `productos_estado_alta_check` — `CHECK ((estado_alta = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `productos_estado_check` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'descontinuado'::text])))`
- `productos_rechazado_descontinuado_check` — `CHECK (((estado_alta <> 'rechazado'::text) OR (estado = 'descontinuado'::text)))`
- `productos_stock_minimo_no_negativo` — `CHECK (((stock_minimo IS NULL) OR (stock_minimo >= 0)))`
- `productos_textos_con_tope` — `CHECK (((char_length(referencia) <= 80) AND (char_length(descripcion) <= 500)))`
- `productos_token_cliente_key` — `UNIQUE (token_cliente)`
- `productos_marca_referencia_clave_unica` *(único parcial)* — `retail.productos (marca_id, retail.fn_clave_referencia(referencia)) NULLS NOT DISTINCT WHERE (estado_alta <> 'rechazado'::text)`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(categoria_id) REFERENCES retail.categorias(id)` · `(empresa_id) REFERENCES retail.empresas(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(marca_id, proveedor_id) REFERENCES retail.marca_proveedores(marca_id, proveedor_id)` · `(patron_id) REFERENCES retail.patrones(id)` · `(propuesto_por) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(tejido_id) REFERENCES retail.tejidos(id)` · `(temporada) REFERENCES retail.temporadas(clave)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `productos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `productos_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `variantes`

*10 columnas · ~2697 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la prenda concreta que se vende, se mueve y se cuenta: talla y color de un modelo |
| `producto_id` | uuid | **no** | — | de qué modelo es esta talla y color |
| `color_codigo` | text | sí | — | — |
| `sku` | text | sí | — | identificador viejo y único: es lo que codifican las etiquetas impresas antes del 2026-09-09 |
| `precio` | numeric | **no** | — | precio de lista con el que la tienda vende; lo puede leer cualquier cuenta con sesión |
| `costo` | numeric | **no** | `0` | lo que costó la prenda, en soles; no puede ser negativo |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo nació la prenda |
| `codigo` | text | sí | — | el nombre corto que se imprime en la etiqueta y se dicta por teléfono (BLU-0042-AZM-M) |
| `talla_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `variantes_costo_check` — `CHECK ((costo >= (0)::numeric))`
- `variantes_montos_finitos` — `CHECK (((abs(precio) < 'Infinity'::numeric) AND (abs(costo) < 'Infinity'::numeric)))`
- `variantes_precio_check` — `CHECK ((precio >= (0)::numeric))`
- `variantes_precio_con_tope` — `CHECK ((((precio <= (5000)::numeric) OR (precio = 'NaN'::numeric)) AND ((costo <= (5000)::numeric) OR (costo = 'NaN'::numeric))))`
- `variantes_sku_key` — `UNIQUE (sku)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(producto_id) REFERENCES retail.productos(id)` · `(talla_id) REFERENCES retail.tallas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `variantes_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `variantes_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `precios_sede`

*9 columnas · ~25 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `variante_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `precio` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `archivado_en` | timestamp with time zone | sí | — | — |
| `archivado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `precios_sede_montos_finitos` — `CHECK ((abs(precio) < 'Infinity'::numeric))`
- `precios_sede_motivo_no_vacio` — `CHECK ((length(btrim(motivo)) >= 3))`
- `precios_sede_precio_con_tope` — `CHECK (((precio <= (5000)::numeric) OR (precio = 'NaN'::numeric)))`
- `precios_sede_precio_positivo` — `CHECK ((precio > (0)::numeric))`
- `precios_sede_vigente_unico` *(único parcial)* — `retail.precios_sede (variante_id, ubicacion_id) WHERE (archivado_en IS NULL)`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `categorias`

*8 columnas · ~52 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la categoría del catálogo a la que apuntan los productos |
| `nombre` | text | **no** | — | cómo se llama la categoría («Blusas»); no puede haber dos con el mismo nombre |
| `activo` | boolean | **no** | `true` | — |
| `familia` | text | sí | — | el gran rubro de la categoría (indumentaria, calzado, accesorios…); los rubros válidos son las filas de la tabla familias |
| `prefijo` | text | sí | — | las tres letras mayúsculas con las que empieza el código de la prenda (BLU); no se repite entre categorías |
| `categoria_padre_id` | uuid | sí | — | — |
| `notas` | text | sí | — | — |
| `temporada` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `categorias_prefijo_formato` — `CHECK ((prefijo ~ '^[A-Z]{3}$'::text))`
- `categorias_textos_con_tope` — `CHECK ((char_length(nombre) <= 80))`
- `categorias_prefijo_unico` *(único parcial)* — `retail.categorias (prefijo) WHERE (prefijo IS NOT NULL)`

**De qué depende:** `(categoria_padre_id) REFERENCES retail.categorias(id)` · `(familia) REFERENCES retail.familias(codigo)` · `(temporada) REFERENCES retail.temporadas(clave)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categorias_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `categorias_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `familias`

*7 columnas · ~7 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | `100` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `exige_tejido_patron` | boolean | **no** | `false` | — |
| `entra_a_motores` | boolean | **no** | `true` | — |

**Candados** — lo que esta tabla hace imposible:

- `familias_textos_con_tope` — `CHECK ((char_length(nombre) <= 80))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `familias_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `familias_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `producto_fotos`

*7 columnas · ~850 filas · permisos por fila **activos***

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
| `producto_fotos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `producto_fotos_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `historial_producto_cambios`

*9 columnas · ~3764 filas · permisos por fila **activos***

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
| `ubicacion_id` | uuid | sí | `retail.fn_historial_sede()` | — |

**Candados** — lo que esta tabla hace imposible:

- `historial_producto_cambios_entidad_check` — `CHECK ((entidad = ANY (ARRAY['producto'::text, 'variante'::text])))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `precios_sede_prenda`

*11 columnas · ~28 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `producto_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `precio` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `vigente_desde` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `archivado_en` | timestamp with time zone | sí | — | — |
| `archivado_por` | uuid | sí | — | — |
| `archivado_motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `precios_sede_prenda_montos_finitos` — `CHECK ((abs(precio) < 'Infinity'::numeric))`
- `precios_sede_prenda_motivo_no_vacio` — `CHECK ((length(btrim(motivo)) >= 3))`
- `precios_sede_prenda_precio_con_tope` — `CHECK (((precio <= (5000)::numeric) OR (precio = 'NaN'::numeric)))`
- `precios_sede_prenda_precio_positivo` — `CHECK ((precio > (0)::numeric))`
- `precios_sede_prenda_vigente_unico` *(único parcial)* — `retail.precios_sede_prenda (producto_id, ubicacion_id) WHERE (archivado_en IS NULL)`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `marcas`

*4 columnas · ~108 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `marcas_nombre_check` — `CHECK ((btrim(nombre) <> ''::text))`
- `marcas_textos_con_tope` — `CHECK ((char_length(nombre) <= 80))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `marcas_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `marcas_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `marca_proveedores`

*3 columnas · ~109 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `marca_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(marca_id) REFERENCES retail.marcas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `marca_proveedores_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `marca_proveedores_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `codigos_barras`

*5 columnas · ~2733 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la fila del código registrado |
| `variante_id` | uuid | **no** | — | a qué prenda concreta (talla y color) lleva ese escaneo |
| `codigo` | text | **no** | — | lo que sale de la pistola: el corto CAYLA, el sku viejo o el EAN de fábrica |
| `origen` | text | **no** | `'propio'::text` | de dónde salió el código: 'propio' o 'fabrica'; el check no admite otro |
| `created_at` | timestamp with time zone | **no** | `now()` | desde cuándo esa prenda quedó escaneable con ese código |

**Candados** — lo que esta tabla hace imposible:

- `codigos_barras_codigo_key` — `UNIQUE (codigo)`
- `codigos_barras_origen_check` — `CHECK ((origen = ANY (ARRAY['propio'::text, 'fabrica'::text])))`

**De qué depende:** `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_barras_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `codigos_barras_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `codigos_correlativos`

*3 columnas · ~36 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `prefijo` | text | **no** | — | las tres letras de la categoría (BLU, JEA, GEN): un contador por familia de prenda |
| `ultimo` | integer | **no** | `0` | el último número entregado — BLU-0042 significa que acá dice 42; no puede ser negativo |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se acuñó el último código de ese prefijo |

**Candados** — lo que esta tabla hace imposible:

- `codigos_correlativos_ultimo_check` — `CHECK ((ultimo >= 0))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_correlativos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |


### `colores`

*17 columnas · ~105 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | las tres letras del color (AZM): es el segmento de color del código de la prenda |
| `nombre` | text | **no** | — | cómo se dice el color ("Azul marino"); la base rechaza otra escritura del mismo nombre |
| `hex` | text | sí | — | el chip de color que se ve en pantalla, en formato #RRGGBB; puede quedar vacío |
| `activo` | boolean | **no** | `true` | si el color está disponible para elegir; un color no se borra, se apaga |
| `familia_color` | text | sí | — | en qué grupo entra: neutro, azul, rojo, amarillo, verde, morado, tierra, metalico o estampado |
| `orden` | integer | **no** | `100` | en qué posición sale el color en el selector; el menor va primero |
| `tipo` | text | **no** | `'solido'::text` | — |
| `imagen_muestra_url` | text | sí | — | — |
| `notas` | text | sí | — | — |
| `estado` | text | **no** | `'aprobado'::text` | — |
| `propuesto_por` | uuid | sí | — | — |
| `aprobado_por` | uuid | sí | — | — |
| `aprobado_en` | timestamp with time zone | sí | — | — |
| `pantone_tcx` | text | sí | — | — |
| `sinonimos` | ARRAY | **no** | `'{}'::text[]` | — |
| `descripcion` | text | sí | — | — |
| `combina_con` | ARRAY | **no** | `'{}'::text[]` | — |

**Candados** — lo que esta tabla hace imposible:

- `colores_combina_con_maximo` — `CHECK ((cardinality(combina_con) <= 8))`
- `colores_descripcion_largo` — `CHECK (((descripcion IS NULL) OR ((char_length(descripcion) >= 1) AND (char_length(descripcion) <= 300))))`
- `colores_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `colores_familia_color_check` — `CHECK ((familia_color = ANY (ARRAY['neutro'::text, 'tierra'::text, 'rosado'::text, 'rojo'::text, 'naranja'::text, 'amarillo'::text, 'verde'::text, 'azul'::text, 'morado'::text, 'metalico'::text])))`
- `colores_hex_check` — `CHECK (((hex IS NULL) OR (hex ~ '^#[0-9A-Fa-f]{6}$'::text)))`
- `colores_pantone_tcx_formato` — `CHECK (((pantone_tcx IS NULL) OR (pantone_tcx ~ '^[0-9]{2}-[0-9]{4} TCX$'::text)))`
- `colores_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`
- `colores_textos_con_tope` — `CHECK ((char_length(nombre) <= 80))`
- `colores_tipo_check` — `CHECK ((tipo = ANY (ARRAY['solido'::text, 'textura'::text, 'estampado'::text])))`
- `colores_pantone_tcx_unico` *(único parcial)* — `retail.colores (pantone_tcx) WHERE (pantone_tcx IS NOT NULL)`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `colores_insert_autenticado` | INSERT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `colores_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `colores_update_lider` | UPDATE | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `tallas`

*9 columnas · ~35 filas · permisos por fila **activos***

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
| `tallas_insert_autenticado` | INSERT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `tallas_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `tallas_update_lider` | UPDATE | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `categoria_tallas`

*4 columnas · ~250 filas · permisos por fila **activos***

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
| `categoria_tallas_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `categoria_tallas_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `tejidos`

*11 columnas · ~48 filas · permisos por fila **activos***

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
| `descripcion_dibujo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `tejidos_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `tejidos_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tejidos_insert_autenticado` | INSERT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `tejidos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `tejidos_update_lider` | UPDATE | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `categoria_tejidos`

*3 columnas · ~227 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `tejido_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(tejido_id) REFERENCES retail.tejidos(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categoria_tejidos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `categoria_tejidos_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `patrones`

*11 columnas · ~15 filas · permisos por fila **activos***

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
| `descripcion_dibujo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `patrones_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `patrones_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `patrones_insert_autenticado` | INSERT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `patrones_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `patrones_update_lider` | UPDATE | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `categoria_patrones`

*3 columnas · ~146 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `patron_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(patron_id) REFERENCES retail.patrones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categoria_patrones_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `categoria_patrones_write_lider` | ALL | `( SELECT retail.fn_puede_editar_catalogo() AS fn_puede_editar_catalogo)` |


### `etiquetas`

*17 columnas · ~27 filas · permisos por fila **activos***

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
| `icono` | text | sí | — | — |
| `icono_imagen` | text | sí | — | — |
| `icono_imagen_silueta` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `etiquetas_descuento_rango` — `CHECK (((descuento_pct IS NULL) OR ((descuento_pct > (0)::numeric) AND (descuento_pct <= (100)::numeric))))`
- `etiquetas_descuento_solo_aprobada` — `CHECK (((descuento_pct IS NULL) OR (estado = 'aprobado'::text)))`
- `etiquetas_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))`
- `etiquetas_estilo_valido` — `CHECK ((estilo = ANY (ARRAY['neutral'::text, 'urgencia'::text, 'positivo'::text, 'campana'::text])))`
- `etiquetas_icono_forma` — `CHECK (((icono IS NULL) OR (icono ~ '^[a-z]{3,20}$'::text)))`
- `etiquetas_icono_imagen_es_suya` — `CHECK (((icono_imagen IS NULL) OR (icono_imagen ~~ (('insignias/'::text \|\| (id)::text) \|\| '/%'::text))))`
- `etiquetas_icono_imagen_forma` — `CHECK (((icono_imagen IS NULL) OR (icono_imagen ~ '^insignias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'::text)))`
- `etiquetas_icono_o_imagen` — `CHECK (((icono IS NULL) OR (icono_imagen IS NULL)))`
- `etiquetas_icono_silueta_con_imagen` — `CHECK (((NOT icono_imagen_silueta) OR (icono_imagen IS NOT NULL)))`
- `etiquetas_montos_finitos` — `CHECK ((abs(descuento_pct) < 'Infinity'::numeric))`
- `etiquetas_rechazado_no_activo` — `CHECK (((estado <> 'rechazado'::text) OR (activo = false)))`
- `etiquetas_vigencia_coherente` — `CHECK (((vigente_desde IS NULL) OR (vigente_hasta IS NULL) OR (vigente_desde <= vigente_hasta)))`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(propuesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `etiquetas_insert_autenticado` | INSERT | `(( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail) AND ((descuento_pct IS NULL) OR ( SELECT retail.fn_puede_dar_descuento_por_etiqueta() AS fn_puede_dar_descuento_por_etiqueta)))` |
| `etiquetas_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `etiquetas_update` | UPDATE | `(( SELECT retail.fn_puede_dar_descuento_por_etiqueta() AS fn_puede_dar_descuento_por_etiqueta) OR (( SELECT retail.fn_puede_editar_etiquetas() AS fn_puede_editar_etiquetas) AND (descuento_pct IS NULL)))` |


### `etiqueta_categorias`

*3 columnas · ~51 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `etiqueta_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE` · `(etiqueta_id) REFERENCES retail.etiquetas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `etiqueta_categorias_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `etiqueta_categorias_write_lider` | ALL | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `variante_etiquetas`

*3 columnas · ~383 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `variante_id` | uuid | **no** | — | — |
| `etiqueta_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(etiqueta_id) REFERENCES retail.etiquetas(id)` · `(variante_id) REFERENCES retail.variantes(id) ON DELETE CASCADE`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `variante_etiquetas_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `variante_etiquetas_write_lider` | ALL | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `catalogo_version`

*3 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | smallint | **no** | `1` | — |
| `version` | bigint | **no** | `0` | — |
| `cambiado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `catalogo_version_id_check` — `CHECK ((id = 1))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `temporada_fechas`

*6 columnas · ~12 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `anio` | smallint | **no** | — | — |
| `estacion` | text | **no** | — | — |
| `inicio` | timestamp with time zone | **no** | — | — |
| `fuente` | text | **no** | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `temporada_fechas_anio_check` — `CHECK (((anio >= 2024) AND (anio <= 2100)))`
- `temporada_fechas_cerca_de_su_estacion` — `CHECK ((abs((((inicio AT TIME ZONE 'America/Lima'::text))::date - make_date((anio)::integer, CASE estacion     WHEN 'otono'::text THEN 3     WHEN 'invierno'::text THEN 6     WHEN 'primavera'::text THEN 9     ELSE 12 END, 21))) <= 60))`
- `temporada_fechas_estacion_check` — `CHECK ((estacion = ANY (ARRAY['otono'::text, 'invierno'::text, 'primavera'::text, 'verano'::text])))`
- `temporada_fechas_fuente_check` — `CHECK ((fuente = ANY (ARRAY['senamhi'::text, 'usno'::text, 'ajustada'::text])))`
- `temporada_fechas_inicio_unico` — `UNIQUE (inicio)`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `temporadas`

*7 columnas · ~9 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `clave` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `orden` | smallint | **no** | — | — |
| `es_clasico` | boolean | **no** | `false` | — |
| `estacion_desde` | text | sí | — | — |
| `estacion_hasta` | text | sí | — | — |
| `mitad` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `temporadas_clave_check` — `CHECK ((clave ~ '^[a-z][a-z_]*$'::text))`
- `temporadas_estacion_desde_check` — `CHECK ((estacion_desde = ANY (ARRAY['primavera'::text, 'verano'::text, 'otono'::text, 'invierno'::text])))`
- `temporadas_estacion_hasta_check` — `CHECK ((estacion_hasta = ANY (ARRAY['primavera'::text, 'verano'::text, 'otono'::text, 'invierno'::text])))`
- `temporadas_moda_con_ventana` — `CHECK ((es_clasico OR (estacion_desde IS NOT NULL)))`
- `temporadas_nombre_check` — `CHECK (((length(btrim(nombre)) >= 1) AND (length(btrim(nombre)) <= 40)))`
- `temporadas_nombre_key` — `UNIQUE (nombre)`
- `temporadas_orden_key` — `UNIQUE (orden)`
- `temporadas_ventana_completa` — `CHECK (((estacion_desde IS NULL) = (estacion_hasta IS NULL)))`
- `temporadas_ventana_en_su_mitad` — `CHECK (((estacion_desde IS NULL) OR (((((((estacion_desde = 'primavera'::text) AND (estacion_hasta = 'verano'::text)) OR ((estacion_desde = 'primavera'::text) AND (estacion_hasta = 'otono'::text))) OR ((estacion_desde = 'verano'::text) AND (estacion_hasta = 'otono'::text))) OR ((estacion_desde = 'otono'::text) AND (estacion_hasta = 'invierno'::text))) OR ((estacion_desde = 'otono'::text) AND (estacion_hasta = 'primavera'::text))) OR ((estacion_desde = 'invierno'::text) AND (estacion_hasta = 'primavera'::text)))))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `producto_color_temporadas`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `producto_id` | uuid | **no** | — | — |
| `color_codigo` | text | **no** | — | — |
| `temporada` | text | **no** | — | — |
| `asignado_por` | uuid | sí | — | — |
| `asignado_en` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(asignado_por) REFERENCES personas(id)` · `(color_codigo) REFERENCES retail.colores(codigo)` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE` · `(temporada) REFERENCES retail.temporadas(clave)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `producto_origen`

*5 columnas · ~465 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `producto_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `persona_id` | uuid | sí | — | — |
| `registrado_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `vitrina_productos`

*11 columnas · ~392 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `producto_id` | uuid | **no** | — | — |
| `publicado` | boolean | **no** | — | — |
| `en_lo_nuevo` | text | **no** | `'automatico'::text` | — |
| `descripcion_web` | text | sí | — | — |
| `publicado_en` | timestamp with time zone | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |
| `largo_cm` | smallint | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `vitrina_productos_descripcion` — `CHECK (((descripcion_web IS NULL) OR ((char_length(descripcion_web) >= 1) AND (char_length(descripcion_web) <= 600))))`
- `vitrina_productos_en_lo_nuevo` — `CHECK ((en_lo_nuevo = ANY (ARRAY['automatico'::text, 'fijo'::text, 'quitado'::text])))`
- `vitrina_productos_largo` — `CHECK (((largo_cm IS NULL) OR ((largo_cm >= 5) AND (largo_cm <= 250))))`
- `vitrina_productos_publicado_en` — `CHECK (((NOT publicado) OR (publicado_en IS NOT NULL)))`
- `vitrina_productos_version` — `CHECK ((version >= 1))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `vitrina_looks`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `frase` | text | sí | — | — |
| `publicado` | boolean | **no** | `false` | — |
| `orden` | integer | **no** | — | — |
| `piezas` | smallint | **no** | — | — |
| `publicado_en` | timestamp with time zone | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `vitrina_looks_frase` — `CHECK (((frase IS NULL) OR ((frase = btrim(frase)) AND ((char_length(frase) >= 1) AND (char_length(frase) <= 200)))))`
- `vitrina_looks_nombre` — `CHECK (((nombre = btrim(nombre)) AND ((char_length(nombre) >= 1) AND (char_length(nombre) <= 60))))`
- `vitrina_looks_orden` — `CHECK ((orden >= 1))`
- `vitrina_looks_piezas` — `CHECK (((piezas >= 2) AND (piezas <= 4)))`
- `vitrina_looks_publicado_en` — `CHECK (((NOT publicado) OR (publicado_en IS NOT NULL)))`
- `vitrina_looks_version` — `CHECK ((version >= 1))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `vitrina_look_piezas`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `look_id` | uuid | **no** | — | — |
| `posicion` | smallint | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `color_codigo` | text | **no** | — | — |
| `x` | numeric | **no** | — | — |
| `y` | numeric | **no** | — | — |
| `ancho` | numeric | **no** | — | — |
| `giro` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `vitrina_look_piezas_lamina` — `CHECK ((((x >= (0)::numeric) AND (x <= (100)::numeric)) AND ((y >= (0)::numeric) AND (y <= (100)::numeric)) AND (ancho > (0)::numeric) AND (ancho <= (100)::numeric) AND ((giro >= ('-45'::integer)::numeric) AND (giro <= (45)::numeric))))`
- `vitrina_look_piezas_posicion` — `CHECK (((posicion >= 1) AND (posicion <= 4)))`
- `vitrina_look_piezas_un_modelo` — `UNIQUE (look_id, producto_id)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(look_id) REFERENCES retail.vitrina_looks(id) ON DELETE CASCADE` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `foto_recortes`

*9 columnas · ~589 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `foto` | text | **no** | — | — |
| `recorte` | text | **no** | — | — |
| `proporcion` | numeric | **no** | — | — |
| `estado` | text | **no** | `'listo'::text` | — |
| `motivo` | text | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `foto_recortes_estado_valido` — `CHECK ((estado = ANY (ARRAY['listo'::text, 'por_revisar'::text, 'descartado'::text])))`
- `foto_recortes_foto_valida` — `CHECK (((foto ~ '^[^/]'::text) AND (foto !~ '^(recortes\|originales)/'::text)))`
- `foto_recortes_motivo_valido` — `CHECK (((motivo IS NULL) OR (motivo = ANY (ARRAY['huecos'::text, 'con_fondo'::text, 'sin_original'::text]))))`
- `foto_recortes_proporcion_valida` — `CHECK (((proporcion > 0.05) AND (proporcion < (20)::numeric)))`
- `foto_recortes_recorte_valido` — `CHECK ((recorte ~ '^recortes/[^/]+\.png$'::text))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `vitrina_largos_tipicos`

*4 columnas · ~17 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `largo_cm` | smallint | **no** | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `vitrina_largos_tipicos_largo` — `CHECK (((largo_cm >= 5) AND (largo_cm <= 250)))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(categoria_id) REFERENCES retail.categorias(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_disenos`

*23 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `etiqueta_id` | uuid | **no** | — | — |
| `estado` | text | **no** | — | — |
| `paleta` | text | **no** | — | — |
| `colores` | jsonb | sí | — | — |
| `fondo` | text | **no** | — | — |
| `patron` | text | **no** | — | — |
| `intensidad` | text | **no** | — | — |
| `acomodo` | text | **no** | — | — |
| `corte` | smallint | sí | — | — |
| `tamano` | text | **no** | — | — |
| `frase` | text | **no** | `''::text` | — |
| `prendas` | ARRAY | sí | — | — |
| `cuenta` | boolean | **no** | — | — |
| `pct_gigante` | boolean | **no** | — | — |
| `colibri` | boolean | **no** | — | — |
| `sello` | text | **no** | — | — |
| `version` | integer | **no** | `1` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |
| `publicado_en` | timestamp with time zone | sí | — | — |
| `publicado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `campana_disenos_acomodo` — `CHECK ((acomodo = ANY (ARRAY['polaroids'::text, 'grande'::text, 'mosaico'::text, 'letras'::text])))`
- `campana_disenos_colores_de_la_paleta` — `CHECK (((paleta = 'propia'::text) = (colores IS NOT NULL)))`
- `campana_disenos_colores_validos` — `CHECK (((colores IS NULL) OR retail.fn_colores_de_portada_validos(colores)))`
- `campana_disenos_corte` — `CHECK (((corte IS NULL) OR (corte >= 0)))`
- `campana_disenos_estado` — `CHECK ((estado = ANY (ARRAY['borrador'::text, 'publicado'::text, 'anterior'::text, 'archivado'::text])))`
- `campana_disenos_fondo` — `CHECK ((fondo = ANY (ARRAY['degradado'::text, 'liso'::text, 'dibujo'::text])))`
- `campana_disenos_frase` — `CHECK (((char_length(frase) <= 60) AND (frase = btrim(frase))))`
- `campana_disenos_intensidad` — `CHECK ((intensidad = ANY (ARRAY['suave'::text, 'medio'::text, 'fuerte'::text])))`
- `campana_disenos_paleta` — `CHECK ((paleta = ANY (ARRAY['cayla'::text, 'noche'::text, 'caramelo'::text, 'calabaza'::text, 'bosque'::text, 'medianoche'::text, 'oliva'::text, 'terracota'::text, 'negro-rojo'::text, 'patria'::text, 'arena'::text, 'rosa'::text, 'lavanda'::text, 'menta'::text, 'propia'::text])))`
- `campana_disenos_patron` — `CHECK ((patron = ANY (ARRAY['huellitas'::text, 'rayas'::text, 'puntos'::text, 'cuadros'::text, 'corazones'::text, 'estrellas'::text, 'confeti'::text, 'ondas'::text])))`
- `campana_disenos_prendas` — `CHECK (((prendas IS NULL) OR ((cardinality(prendas) >= 1) AND (cardinality(prendas) <= 4))))`
- `campana_disenos_publicado_con_fecha` — `CHECK (((estado = 'borrador'::text) = (publicado_en IS NULL)))`
- `campana_disenos_sello` — `CHECK ((sello = ANY (ARRAY['ninguno'::text, 'descuento'::text, 'dias'::text, 'nuevo'::text])))`
- `campana_disenos_tamano` — `CHECK ((tamano = ANY (ARRAY['grande'::text, 'enorme'::text])))`
- `campana_disenos_version` — `CHECK ((version >= 1))`
- `campana_disenos_un_anterior` *(único parcial)* — `retail.campana_disenos (etiqueta_id) WHERE (estado = 'anterior'::text)`
- `campana_disenos_un_borrador` *(único parcial)* — `retail.campana_disenos (etiqueta_id) WHERE (estado = 'borrador'::text)`
- `campana_disenos_un_publicado` *(único parcial)* — `retail.campana_disenos (etiqueta_id) WHERE (estado = 'publicado'::text)`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(etiqueta_id) REFERENCES retail.etiquetas(id)` · `(publicado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_web_disenos`

*27 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `etiqueta_id` | uuid | **no** | — | — |
| `modo` | text | **no** | — | — |
| `plantilla` | text | sí | — | — |
| `paleta` | smallint | **no** | `0` | — |
| `acento` | text | sí | — | — |
| `franja` | text | **no** | `'rota'::text` | — |
| `entrada` | text | **no** | `'telon'::text` | — |
| `efecto` | text | **no** | `'ninguno'::text` | — |
| `intensidad` | text | **no** | `'poca'::text` | — |
| `duracion` | text | **no** | `'una'::text` | — |
| `cuenta` | text | **no** | `'siempre'::text` | — |
| `titular` | text | sí | — | — |
| `bajada` | text | sí | — | — |
| `boton` | text | sí | — | — |
| `imagen_ruta` | text | sí | — | — |
| `imagen_vertical_ruta` | text | sí | — | — |
| `donde_franja` | boolean | **no** | `true` | — |
| `donde_portada` | boolean | **no** | `true` | — |
| `donde_catalogo` | boolean | **no** | `true` | — |
| `donde_sello` | boolean | **no** | `true` | — |
| `donde_bolsa` | boolean | **no** | `true` | — |
| `estado` | text | **no** | `'borrador'::text` | — |
| `version` | integer | **no** | `1` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `campana_web_disenos_acento` — `CHECK (((acento IS NULL) OR (acento ~ '^#[0-9a-f]{6}$'::text)))`
- `campana_web_disenos_bajada` — `CHECK (((bajada IS NULL) OR ((char_length(bajada) >= 1) AND (char_length(bajada) <= 40))))`
- `campana_web_disenos_boton` — `CHECK (((boton IS NULL) OR ((char_length(boton) >= 1) AND (char_length(boton) <= 22))))`
- `campana_web_disenos_cuenta` — `CHECK ((cuenta = ANY (ARRAY['siempre'::text, 'ultimo'::text, 'no'::text])))`
- `campana_web_disenos_duracion` — `CHECK ((duracion = ANY (ARRAY['una'::text, 'continuo'::text])))`
- `campana_web_disenos_efecto` — `CHECK ((efecto = ANY (ARRAY['ninguno'::text, 'destellos'::text, 'confeti'::text, 'petalos'::text, 'copos'::text, 'corazones'::text, 'estrellas'::text, 'hojas'::text, 'burbujas'::text, 'patitas'::text])))`
- `campana_web_disenos_entrada` — `CHECK ((entrada = ANY (ARRAY['telon'::text, 'caen'::text, 'aparece'::text, 'ninguna'::text])))`
- `campana_web_disenos_estado` — `CHECK ((estado = ANY (ARRAY['borrador'::text, 'programado'::text])))`
- `campana_web_disenos_franja` — `CHECK ((franja = ANY (ARRAY['rota'::text, 'marquesina'::text, 'quieta'::text])))`
- `campana_web_disenos_imagen_ruta_forma` — `CHECK (((imagen_ruta IS NULL) OR (imagen_ruta ~ '^campanas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp\|jpg)$'::text)))`
- `campana_web_disenos_imagen_vertical_forma` — `CHECK (((imagen_vertical_ruta IS NULL) OR ((imagen_ruta IS NOT NULL) AND (imagen_vertical_ruta ~ '^campanas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp\|jpg)$'::text))))`
- `campana_web_disenos_intensidad` — `CHECK ((intensidad = ANY (ARRAY['poca'::text, 'media'::text])))`
- `campana_web_disenos_modo` — `CHECK ((modo = ANY (ARRAY['ambiente'::text, 'imagen'::text])))`
- `campana_web_disenos_modo_coherente` — `CHECK ((((modo = 'ambiente'::text) = (plantilla IS NOT NULL)) AND ((modo <> 'imagen'::text) OR (imagen_ruta IS NOT NULL))))`
- `campana_web_disenos_paleta` — `CHECK (((paleta >= 0) AND (paleta <= 2)))`
- `campana_web_disenos_plantilla` — `CHECK (((plantilla IS NULL) OR (plantilla = ANY (ARRAY['sobrio'::text, 'aniversario'::text, 'patrias'::text, 'madre'::text, 'cyber'::text, 'gato'::text, 'navidad'::text]))))`
- `campana_web_disenos_titular` — `CHECK (((titular IS NULL) OR ((char_length(titular) >= 1) AND (char_length(titular) <= 28))))`
- `campana_web_disenos_version` — `CHECK ((version >= 1))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(etiqueta_id) REFERENCES retail.etiquetas(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_web_previas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `etiqueta_id` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `expira_en` | timestamp with time zone | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `campana_web_previas_huella_check` — `CHECK ((huella ~ '^[0-9a-f]{64}$'::text))`
- `campana_web_previas_huella_key` — `UNIQUE (huella)`

**De qué depende:** `(etiqueta_id) REFERENCES retail.etiquetas(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_sedes`

*3 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `etiqueta_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(etiqueta_id) REFERENCES retail.etiquetas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_reglas`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `etiqueta_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | `'pct'::text` | — |
| `porcentaje` | numeric | **no** | — | — |
| `desde` | date | **no** | — | — |
| `hasta` | date | **no** | — | — |
| `dias_semana` | ARRAY | **no** | `ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]` | — |
| `incluye_claure` | boolean | **no** | `false` | — |
| `estado` | text | **no** | `'borrador'::text` | — |
| `creada_por` | uuid | sí | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `activada_por` | uuid | sí | — | — |
| `activada_en` | timestamp with time zone | sí | — | — |
| `actualizada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `campana_reglas_activa_firmada` — `CHECK (((estado <> 'activa'::text) OR ((activada_en IS NOT NULL) AND (activada_por IS NOT NULL))))`
- `campana_reglas_dias` — `CHECK (retail.fn_dias_semana_validos(dias_semana))`
- `campana_reglas_estado` — `CHECK ((estado = ANY (ARRAY['borrador'::text, 'activa'::text, 'desactivada'::text])))`
- `campana_reglas_fechas` — `CHECK ((hasta >= desde))`
- `campana_reglas_nombre` — `CHECK (((btrim(nombre) <> ''::text) AND (length(nombre) <= 80)))`
- `campana_reglas_porcentaje` — `CHECK (((porcentaje > (0)::numeric) AND (porcentaje <= (70)::numeric)))`
- `campana_reglas_tipo` — `CHECK ((tipo = 'pct'::text))`

**De qué depende:** `(etiqueta_id) REFERENCES retail.etiquetas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_regla_categorias`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `regla_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `modo` | text | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `campana_regla_categorias_modo` — `CHECK ((modo = ANY (ARRAY['solo'::text, 'fuera'::text])))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(regla_id) REFERENCES retail.campana_reglas(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_regla_sedes`

*2 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `regla_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |

**De qué depende:** `(regla_id) REFERENCES retail.campana_reglas(id) ON DELETE CASCADE` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_regla_historial`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `regla_id` | uuid | **no** | — | — |
| `antes` | jsonb | **no** | — | — |
| `por` | uuid | sí | — | — |
| `en` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(regla_id) REFERENCES retail.campana_reglas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `empresas`

*8 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `logo_url` | text | sí | — | — |
| `web` | text | sí | — | — |
| `orden` | integer | **no** | `0` | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `empresas_clave_check` — `CHECK ((clave ~ '^[a-z0-9_]+$'::text))`
- `empresas_clave_key` — `UNIQUE (clave)`
- `empresas_nombre_check` — `CHECK ((btrim(nombre) <> ''::text))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `empresa_sedes`

*2 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `empresa_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |

**De qué depende:** `(empresa_id) REFERENCES retail.empresas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 05 · Halcón — Inventario y movimientos

### `movimientos`

*22 columnas · ~6585 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el hecho concreto de inventario: una prenda que entra, sale, se ajusta, se traslada o se aparta |
| `variante_id` | uuid | **no** | — | la prenda exacta, talla y color, que se movió |
| `ubicacion_id` | uuid | **no** | — | — |
| `ubicacion_destino_id` | uuid | sí | — | — |
| `sububicacion_id` | uuid | sí | — | — |
| `sububicacion_destino_id` | uuid | sí | — | — |
| `tipo` | text | **no** | — | qué clase de hecho es: entrada, salida, ajuste, traslado, apartado o liberacion_apartado; define el signo y a qué bolsa se aplica |
| `cantidad` | integer | **no** | — | cuántas unidades; siempre positiva salvo en 'ajuste', el único tipo que admite negativo |
| `motivo` | text | sí | — | por qué se movió: venta, merma, conteo, bajada a piso — texto libre |
| `venta_item_id` | uuid | sí | — | — |
| `lote_id` | uuid | sí | — | de qué fardo recibido vino la prenda |
| `devolucion_item_id` | uuid | sí | — | — |
| `conteo_item_id` | uuid | sí | — | — |
| `transferencia_item_id` | uuid | sí | — | — |
| `usuario_id` | uuid | sí | — | qué integrante lo registró |
| `nota` | text | sí | — | lo que escribió quien registró: «vino roto», «Conteo censo AQP» — texto libre para auditar después |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo pasó el hecho; es el orden del libro de movimientos |
| `cambio_id` | uuid | sí | — | — |
| `compra_item_id` | uuid | sí | — | — |
| `produccion_id` | uuid | sí | — | — |
| `transferencia_recepcion_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_cantidad_valida` — `CHECK ((((tipo <> 'ajuste'::text) AND (cantidad > 0)) OR ((tipo = 'ajuste'::text) AND (cantidad <> 0))))`
- `movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'traslado'::text, 'apartado'::text, 'liberacion_apartado'::text])))`
- `movimientos_traslado_tiene_destino` — `CHECK ((((tipo = 'traslado'::text) AND (ubicacion_destino_id IS NOT NULL) AND ((ubicacion_destino_id <> ubicacion_id) OR (sububicacion_destino_id IS DISTINCT FROM sububicacion_id))) OR ((tipo <> 'traslado'::text) AND (ubicacion_destino_id IS NULL))))`

**De qué depende:** `(cambio_id) REFERENCES retail.cambios(id)` · `(compra_item_id) REFERENCES retail.compra_items(id)` · `(conteo_item_id) REFERENCES retail.conteo_items(id)` · `(devolucion_item_id) REFERENCES retail.devolucion_items(id)` · `(lote_id) REFERENCES retail.lotes(id)` · `(produccion_id) REFERENCES retail.producciones(id)` · `(sububicacion_destino_id, ubicacion_destino_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(transferencia_item_id) REFERENCES retail.transferencia_items(id)` · `(transferencia_recepcion_id) REFERENCES retail.transferencia_recepciones(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_insert` | INSERT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |
| `movimientos_select` | SELECT | `(COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_destino_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))` |


### `stock`

*6 columnas · ~4130 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `variante_id` | uuid | **no** | — | qué prenda cuenta esta fila, parte de la llave junto con la sede |
| `ubicacion_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | `0` | las unidades físicas de la prenda en esa ubicación, incluidas las que están apartadas para una clienta (cantidad_apartada); nunca negativa |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocó la fila por última vez, sea por movimiento o por recálculo |
| `sububicacion_id` | uuid | sí | — | — |
| `cantidad_apartada` | integer | **no** | `0` | — |

**Candados** — lo que esta tabla hace imposible:

- `stock_cantidad_apartada_no_excede_cantidad` — `CHECK ((cantidad_apartada <= cantidad))`
- `stock_cantidad_apartada_no_negativa` — `CHECK ((cantidad_apartada >= 0))`
- `stock_cantidad_check` — `CHECK ((cantidad >= 0))`
- `stock_variante_ubicacion_sububicacion_key` — `UNIQUE NULLS NOT DISTINCT (variante_id, ubicacion_id, sububicacion_id)`

**De qué depende:** `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `stock_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `lotes`

*10 columnas · ~9 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la recepción completa: el fardo descargado de una vez, al que apuntan sus movimientos de entrada |
| `ubicacion_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | el proveedor del directorio que trajo el fardo; obligatorio |
| `numero_guia` | text | sí | — | la guía de remisión del transportista, para cruzar el fardo contra el papel que llegó |
| `fecha_recepcion` | timestamp with time zone | **no** | `now()` | qué día llegó la mercadería; si no se indica, queda el momento del registro |
| `recibido_por` | uuid | sí | — | qué integrante recibió y registró el fardo |
| `nota` | text | sí | — | observaciones de la descarga, en texto libre: «faltaron 2 blusas», «caja mojada» |
| `envio_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `despacho_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `lotes_despacho_proveedor_unico` *(único parcial)* — `retail.lotes (despacho_id, proveedor_id) WHERE (despacho_id IS NOT NULL)`
- `lotes_token_cliente_key` *(único parcial)* — `retail.lotes (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(despacho_id) REFERENCES retail.despachos(id)` · `(envio_id) REFERENCES retail.envios(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(recibido_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `lotes_insert` | INSERT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |
| `lotes_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


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
| `sububicaciones_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `sububicaciones_write_lider` | ALL | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `costo_historial`

*11 columnas · ~24 filas · permisos por fila **activos***

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
- `costo_historial_montos_finitos` — `CHECK (((abs(costo_anterior) < 'Infinity'::numeric) AND (abs(costo_unitario_nuevo) < 'Infinity'::numeric) AND (abs(costo_resultante) < 'Infinity'::numeric)))`
- `costo_historial_movimiento_id_key` — `UNIQUE (movimiento_id)`
- `costo_historial_origen_check` — `CHECK ((origen = ANY (ARRAY['compra'::text, 'produccion'::text])))`
- `costo_historial_stock_previo_check` — `CHECK ((stock_previo >= 0))`

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `costo_historial_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.movimientos m   WHERE ((m.id = costo_historial.movimiento_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (m.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `prendas_danadas`

*15 columnas · ~1 filas · permisos por fila **activos***

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
| `motivo_reporte` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `prendas_danadas_arreglo_con_nota` — `CHECK (((estado <> 'se_arreglo'::text) OR (char_length(btrim(COALESCE(nota, ''::text))) >= 3)))`
- `prendas_danadas_cambio_id_key` — `UNIQUE (cambio_id)`
- `prendas_danadas_cantidad_check` — `CHECK ((cantidad > 0))`
- `prendas_danadas_devolucion_item_id_key` — `UNIQUE (devolucion_item_id)`
- `prendas_danadas_estado_check` — `CHECK ((estado = ANY (ARRAY['en_cuarentena'::text, 'liquidada'::text, 'se_boto'::text, 'donada'::text, 'devuelta_proveedor'::text, 'se_arreglo'::text])))`
- `prendas_danadas_motivo_reporte_valido` — `CHECK (((motivo_reporte IS NULL) OR ((char_length(btrim(motivo_reporte)) >= 3) AND (char_length(btrim(motivo_reporte)) <= 200))))`
- `prendas_danadas_proveedor_coherente` — `CHECK (((estado = 'devuelta_proveedor'::text) = (proveedor_id IS NOT NULL)))`
- `prendas_danadas_resolucion_coherente` — `CHECK ((((estado = 'en_cuarentena'::text) AND (movimiento_salida_id IS NULL) AND (resuelto_en IS NULL)) OR ((estado <> 'en_cuarentena'::text) AND (movimiento_salida_id IS NOT NULL) AND (resuelto_en IS NOT NULL))))`
- `prendas_danadas_un_origen` — `CHECK ((num_nonnulls(devolucion_item_id, cambio_id, motivo_reporte) = 1))`

**De qué depende:** `(cambio_id) REFERENCES retail.cambios(id)` · `(devolucion_item_id) REFERENCES retail.devolucion_items(id)` · `(movimiento_entrada_id) REFERENCES retail.movimientos(id)` · `(movimiento_salida_id) REFERENCES retail.movimientos(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(resuelto_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `prendas_danadas_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `transferencias`

*22 columnas · ~4 filas · permisos por fila **activos***

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
| `terminal_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `sububicacion_destino_id` | uuid | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `motivo_anulacion` | text | sí | — | — |
| `recepcion_firmada_por` | uuid | sí | — | — |
| `recepcion_firmada_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `transferencias_anulada_con_fecha` — `CHECK (((estado = 'anulada'::text) = (anulado_en IS NOT NULL)))`
- `transferencias_anulada_con_motivo` — `CHECK (((estado = 'anulada'::text) = (NULLIF(btrim(motivo_anulacion), ''::text) IS NOT NULL)))`
- `transferencias_anulado_por_solo_si_anulada` — `CHECK (((anulado_por IS NULL) OR (estado = 'anulada'::text)))`
- `transferencias_estado_check` — `CHECK ((estado = ANY (ARRAY['completada'::text, 'en_transito'::text, 'recibido_con_diferencia'::text, 'cerrada'::text, 'anulada'::text])))`
- `transferencias_firma_recepcion_completa` — `CHECK (((recepcion_firmada_por IS NULL) = (recepcion_firmada_en IS NULL)))`
- `transferencias_numero_unique` — `UNIQUE (numero)`
- `transferencias_origen_destino_distintos` — `CHECK ((ubicacion_origen_id <> ubicacion_destino_id))`
- `transferencias_token_cliente_key` *(único parcial)* — `retail.transferencias (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(cerrado_por) REFERENCES personas(id)` · `(confirmado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(recepcion_firmada_por) REFERENCES personas(id)` · `(sububicacion_destino_id, ubicacion_destino_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_origen_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencias_insert` | INSERT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_origen_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |
| `transferencias_select` | SELECT | `(COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_origen_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_destino_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))` |
| `transferencias_update` | UPDATE | `(COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_origen_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_destino_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))` |


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

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencia_items_insert` | INSERT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_items.transferencia_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (t.ubicacion_origen_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |
| `transferencia_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_items.transferencia_id) AND (COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (t.ubicacion_origen_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (t.ubicacion_destino_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)))))` |


### `transferencia_recepciones`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `transferencia_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad_recibida` | integer | **no** | — | — |
| `movimiento_id` | uuid | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `terminal_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `transferencia_recepciones_cantidad_recibida_check` — `CHECK ((cantidad_recibida >= 0))`
- `transferencia_recepciones_transferencia_id_variante_id_key` — `UNIQUE (transferencia_id, variante_id)`

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(registrado_por) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `transferencia_recepciones_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.transferencias t   WHERE ((t.id = transferencia_recepciones.transferencia_id) AND (COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (t.ubicacion_origen_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (t.ubicacion_destino_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)))))` |


### `traslado_sobrantes`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `transferencia_id` | uuid | **no** | — | — |
| `transferencia_recepcion_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `ubicacion_origen_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `estado` | text | **no** | `'por_revisar'::text` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `revisado_en` | timestamp with time zone | sí | — | — |
| `revisado_por` | uuid | sí | — | — |
| `nota_revision` | text | sí | — | — |
| `movimiento_salida_id` | uuid | sí | — | — |
| `movimiento_entrada_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `traslado_sobrantes_cantidad_check` — `CHECK ((cantidad > 0))`
- `traslado_sobrantes_estado_check` — `CHECK ((estado = ANY (ARRAY['por_revisar'::text, 'salio_del_origen'::text, 'encontrada'::text, 'error_de_conteo'::text])))`
- `traslado_sobrantes_nota_revision_check` — `CHECK (((nota_revision IS NULL) OR (length(nota_revision) <= 200)))`
- `traslado_sobrantes_revision_coherente` — `CHECK ((((estado = 'por_revisar'::text) AND (revisado_en IS NULL) AND (movimiento_salida_id IS NULL) AND (movimiento_entrada_id IS NULL)) OR ((estado = 'salio_del_origen'::text) AND (revisado_en IS NOT NULL) AND (movimiento_salida_id IS NOT NULL) AND (movimiento_entrada_id IS NOT NULL)) OR ((estado = 'encontrada'::text) AND (revisado_en IS NOT NULL) AND (movimiento_salida_id IS NULL) AND (movimiento_entrada_id IS NOT NULL)) OR ((estado = 'error_de_conteo'::text) AND (revisado_en IS NOT NULL) AND (movimiento_salida_id IS NULL) AND (movimiento_entrada_id IS NULL))))`
- `traslado_sobrantes_transferencia_id_variante_id_key` — `UNIQUE (transferencia_id, variante_id)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(movimiento_entrada_id) REFERENCES retail.movimientos(id)` · `(movimiento_salida_id) REFERENCES retail.movimientos(id)` · `(revisado_por) REFERENCES personas(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(transferencia_recepcion_id) REFERENCES retail.transferencia_recepciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_origen_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `prendas_para_enviar`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `ubicacion_destino_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `nota` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `cancelado_en` | timestamp with time zone | sí | — | — |
| `cancelado_por` | uuid | sí | — | — |
| `cancelado_motivo` | text | sí | — | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `prendas_para_enviar_cancelacion_coherente` — `CHECK (((cancelado_en IS NULL) = (cancelado_motivo IS NULL)))`
- `prendas_para_enviar_cancelado_motivo_check` — `CHECK (((cancelado_motivo IS NULL) OR (char_length(cancelado_motivo) <= 200)))`
- `prendas_para_enviar_cantidad_check` — `CHECK ((cantidad > 0))`
- `prendas_para_enviar_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 200)))`
- `prendas_para_enviar_otra_sede` — `CHECK ((ubicacion_destino_id <> ubicacion_id))`
- `prendas_para_enviar_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(cancelado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `prendas_para_enviar_salidas`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `prenda_para_enviar_id` | uuid | **no** | — | — |
| `transferencia_item_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `prendas_para_enviar_salidas_cantidad_check` — `CHECK ((cantidad > 0))`
- `prendas_para_enviar_salidas_una_vez` — `UNIQUE (prenda_para_enviar_id, transferencia_item_id)`

**De qué depende:** `(prenda_para_enviar_id) REFERENCES retail.prendas_para_enviar(id)` · `(transferencia_item_id) REFERENCES retail.transferencia_items(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


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
| `envios_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


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
| `envio_extras_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.envios e   WHERE ((e.id = envio_extras.envio_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (e.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


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
| `envio_traslados_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.envios e   WHERE ((e.id = envio_traslados.envio_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (e.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `despachos`

*22 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `numero` | integer | **no** | `nextval('retail.despachos_numero_seq'::regclass)` | — |
| `ubicacion_destino_id` | uuid | **no** | — | — |
| `numero_guia` | text | sí | — | — |
| `estado` | text | **no** | `'en_camino'::text` | — |
| `nota` | text | sí | — | — |
| `despachado_por` | uuid | **no** | — | — |
| `despachado_en` | timestamp with time zone | **no** | `now()` | — |
| `abierto_por` | uuid | sí | — | — |
| `abierto_en` | timestamp with time zone | sí | — | — |
| `cerrado_por` | uuid | sí | — | — |
| `cerrado_en` | timestamp with time zone | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `motivo_anulacion` | text | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `huella_envio` | text | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `nota_recepcion` | text | sí | — | — |
| `recepcion_token` | uuid | sí | — | — |
| `recepcion_huella` | text | sí | — | — |
| `bultos` | smallint | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `despachos_anulacion` — `CHECK ( CASE     WHEN (estado = 'anulado'::text) THEN ((anulado_por IS NOT NULL) AND (anulado_en IS NOT NULL) AND (COALESCE(btrim(motivo_anulacion), ''::text) <> ''::text) AND (length(motivo_anulacion) <= 300))     ELSE ((anulado_por IS NULL) AND (anulado_en IS NULL) AND (motivo_anulacion IS NULL)) END)`
- `despachos_apertura` — `CHECK ( CASE     WHEN (estado = ANY (ARRAY['abierto'::text, 'cerrado'::text])) THEN ((abierto_por IS NOT NULL) AND (abierto_en IS NOT NULL))     ELSE ((abierto_por IS NULL) AND (abierto_en IS NULL)) END)`
- `despachos_bultos_check` — `CHECK (((bultos IS NULL) OR ((bultos >= 1) AND (bultos <= 99))))`
- `despachos_cierre` — `CHECK ( CASE     WHEN (estado = 'cerrado'::text) THEN ((cerrado_por IS NOT NULL) AND (cerrado_en IS NOT NULL))     ELSE ((cerrado_por IS NULL) AND (cerrado_en IS NULL)) END)`
- `despachos_estado` — `CHECK ((estado = ANY (ARRAY['en_camino'::text, 'abierto'::text, 'cerrado'::text, 'anulado'::text])))`
- `despachos_nota_check` — `CHECK (((nota IS NULL) OR ((btrim(nota) <> ''::text) AND (length(nota) <= 500))))`
- `despachos_nota_recepcion_check` — `CHECK (((nota_recepcion IS NULL) OR ((btrim(nota_recepcion) <> ''::text) AND (length(nota_recepcion) <= 500))))`
- `despachos_numero_guia_check` — `CHECK (((numero_guia IS NULL) OR ((btrim(numero_guia) <> ''::text) AND (length(numero_guia) <= 40))))`
- `despachos_numero_unico` — `UNIQUE (numero)`
- `despachos_recepcion_solo_al_cerrar` — `CHECK (((estado = 'cerrado'::text) OR ((nota_recepcion IS NULL) AND (recepcion_token IS NULL) AND (recepcion_huella IS NULL))))`
- `despachos_recepcion_token_key` — `UNIQUE (recepcion_token)`
- `despachos_token_cliente_key` — `UNIQUE (token_cliente)`
- `despachos_version_check` — `CHECK ((version > 0))`

**De qué depende:** `(abierto_por) REFERENCES personas(id)` · `(anulado_por) REFERENCES personas(id)` · `(cerrado_por) REFERENCES personas(id)` · `(despachado_por) REFERENCES personas(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_items`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `orden_compra_item_id` | uuid | **no** | — | — |
| `compra_item_id` | uuid | sí | — | — |
| `cantidad` | integer | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `marca_id` | uuid | **no** | — | — |
| `descripcion` | text | sí | — | — |
| `precio_unitario` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `despacho_items_descripcion_check` — `CHECK (((descripcion IS NULL) OR (btrim(descripcion) <> ''::text)))`
- `despacho_items_linea_unica` — `UNIQUE (despacho_id, orden_compra_item_id)`
- `despacho_items_montos_finitos` — `CHECK ((abs(precio_unitario) < 'Infinity'::numeric))`
- `despacho_items_precio_unitario_check` — `CHECK ((precio_unitario >= (0)::numeric))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(compra_item_id) REFERENCES retail.compra_items(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(orden_compra_item_id) REFERENCES retail.orden_compra_items(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_recibidos`

*18 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `extra_posicion` | integer | sí | — | — |
| `proveedor_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `marca_id` | uuid | sí | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `danadas` | integer | **no** | `0` | — |
| `danada_solucion` | text | sí | — | — |
| `costo_unitario` | numeric | sí | — | — |
| `movimiento_id` | uuid | sí | — | — |
| `movimiento_danada_id` | uuid | sí | — | — |
| `compra_item_id` | uuid | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `pendiente_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_recibidos_cantidad_check` — `CHECK ((cantidad > 0))`
- `despacho_recibidos_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `despacho_recibidos_danadas` — `CHECK (((danadas >= 0) AND (danadas <= cantidad)))`
- `despacho_recibidos_extra_posicion_check` — `CHECK (((extra_posicion IS NULL) OR (extra_posicion > 0)))`
- `despacho_recibidos_extra_sin_papel` — `CHECK (((despacho_item_id IS NOT NULL) OR (compra_item_id IS NULL)))`
- `despacho_recibidos_linea_o_extra` — `CHECK (((despacho_item_id IS NULL) <> (extra_posicion IS NULL)))`
- `despacho_recibidos_montos_finitos` — `CHECK ((abs(costo_unitario) < 'Infinity'::numeric))`
- `despacho_recibidos_movimientos` — `CHECK ((((movimiento_id IS NOT NULL) = (cantidad > danadas)) AND ((movimiento_danada_id IS NOT NULL) = (danadas > 0))))`
- `despacho_recibidos_solucion` — `CHECK ( CASE     WHEN (danadas = 0) THEN (danada_solucion IS NULL)     ELSE (danada_solucion = ANY (ARRAY['pendiente'::text, 'sin_solucion'::text])) END)`
- `despacho_recibidos_movimiento_danada_unico` *(único parcial)* — `retail.despacho_recibidos (movimiento_danada_id) WHERE (movimiento_danada_id IS NOT NULL)`
- `despacho_recibidos_movimiento_unico` *(único parcial)* — `retail.despacho_recibidos (movimiento_id) WHERE (movimiento_id IS NOT NULL)`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(compra_item_id) REFERENCES retail.compra_items(id)` · `(creado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(despacho_item_id) REFERENCES retail.despacho_items(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(movimiento_danada_id) REFERENCES retail.movimientos(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(pendiente_id) REFERENCES retail.despacho_pendientes(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_conteos`

*14 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `extra_posicion` | integer | sí | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `categoria_id` | uuid | sí | — | — |
| `marca_id` | uuid | sí | — | — |
| `contadas` | integer | **no** | — | — |
| `separado` | jsonb | **no** | `'{"nuevas": [], "prendas": []}'::jsonb` | — |
| `costo_unitario` | numeric | sí | — | — |
| `contado_por` | uuid | **no** | — | — |
| `contado_en` | timestamp with time zone | **no** | `now()` | — |
| `version` | integer | **no** | `1` | — |
| `costos_prendas` | jsonb | **no** | `'{}'::jsonb` | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_conteos_contadas_check` — `CHECK (((contadas >= 0) AND (contadas <= 99999)))`
- `despacho_conteos_costo_unitario_check` — `CHECK (((costo_unitario IS NULL) OR (costo_unitario >= (0)::numeric)))`
- `despacho_conteos_costos_prendas_objeto` — `CHECK ((jsonb_typeof(costos_prendas) = 'object'::text))`
- `despacho_conteos_extra_con_que` — `CHECK (((extra_posicion IS NULL) OR (categoria_id IS NOT NULL)))`
- `despacho_conteos_extra_posicion_check` — `CHECK (((extra_posicion IS NULL) OR (extra_posicion > 0)))`
- `despacho_conteos_linea_o_extra` — `CHECK (((despacho_item_id IS NULL) <> (extra_posicion IS NULL)))`
- `despacho_conteos_linea_sin_que` — `CHECK (((despacho_item_id IS NULL) OR ((proveedor_id IS NULL) AND (categoria_id IS NULL) AND (marca_id IS NULL))))`
- `despacho_conteos_separado_cabe` — `CHECK ((retail.fn_envio_total_separado(separado) <= contadas))`
- `despacho_conteos_separado_forma` — `CHECK (((jsonb_typeof(separado) = 'object'::text) AND (jsonb_typeof((separado -> 'prendas'::text)) = 'array'::text) AND (jsonb_typeof((separado -> 'nuevas'::text)) = 'array'::text)))`
- `despacho_conteos_version_check` — `CHECK ((version > 0))`
- `despacho_conteos_extra_unica` *(único parcial)* — `retail.despacho_conteos (despacho_id, extra_posicion) WHERE (extra_posicion IS NOT NULL)`
- `despacho_conteos_linea_unica` *(único parcial)* — `retail.despacho_conteos (despacho_id, despacho_item_id) WHERE (despacho_item_id IS NOT NULL)`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(contado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(despacho_item_id) REFERENCES retail.despacho_items(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_pendientes`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `extra_posicion` | integer | sí | — | — |
| `tipo` | text | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `producto_id` | uuid | sí | — | — |
| `descripcion` | text | sí | — | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `anotado_por` | uuid | **no** | — | — |
| `anotado_en` | timestamp with time zone | **no** | `now()` | — |
| `resuelto_por` | uuid | sí | — | — |
| `resuelto_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_pendientes_cantidad_check` — `CHECK (((cantidad >= 1) AND (cantidad <= 99999)))`
- `despacho_pendientes_descripcion_check` — `CHECK (((descripcion IS NULL) OR ((length(descripcion) >= 1) AND (length(descripcion) <= 200))))`
- `despacho_pendientes_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'resuelto'::text, 'anulado'::text])))`
- `despacho_pendientes_extra_posicion_check` — `CHECK (((extra_posicion IS NULL) OR (extra_posicion > 0)))`
- `despacho_pendientes_linea_o_extra` — `CHECK (((despacho_item_id IS NULL) <> (extra_posicion IS NULL)))`
- `despacho_pendientes_que` — `CHECK ((((tipo = 'detalle'::text) AND (producto_id IS NOT NULL) AND (descripcion IS NULL)) OR ((tipo = 'crear'::text) AND (producto_id IS NULL))))`
- `despacho_pendientes_quien_lo_cerro` — `CHECK (((estado = 'pendiente'::text) = ((resuelto_por IS NULL) AND (resuelto_en IS NULL))))`
- `despacho_pendientes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['detalle'::text, 'crear'::text])))`

**De qué depende:** `(anotado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(despacho_item_id) REFERENCES retail.despacho_items(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(resuelto_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_separaciones`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `extra_posicion` | integer | sí | — | — |
| `pendiente_id` | uuid | sí | — | — |
| `token` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `entraron` | integer | **no** | — | — |
| `quedaron_pendientes` | integer | **no** | — | — |
| `hecho_por` | uuid | **no** | — | — |
| `hecho_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_separaciones_entraron_check` — `CHECK ((entraron >= 0))`
- `despacho_separaciones_extra_posicion_check` — `CHECK (((extra_posicion IS NULL) OR (extra_posicion > 0)))`
- `despacho_separaciones_linea_o_extra` — `CHECK (((despacho_item_id IS NULL) <> (extra_posicion IS NULL)))`
- `despacho_separaciones_quedaron_pendientes_check` — `CHECK ((quedaron_pendientes >= 0))`
- `despacho_separaciones_token_key` — `UNIQUE (token)`

**De qué depende:** `(despacho_id) REFERENCES retail.despachos(id)` · `(despacho_item_id) REFERENCES retail.despacho_items(id)` · `(hecho_por) REFERENCES personas(id)` · `(pendiente_id) REFERENCES retail.despacho_pendientes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_cierres`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `motivo` | text | sí | — | — |
| `resultado` | jsonb | sí | — | — |
| `nota` | text | sí | — | — |
| `token` | uuid | sí | — | — |
| `hecho_por` | uuid | **no** | — | — |
| `hecho_en` | timestamp with time zone | **no** | `clock_timestamp()` | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_cierres_motivo` — `CHECK (((tipo = 'reapertura'::text) = (motivo IS NOT NULL)))`
- `despacho_cierres_motivo_check` — `CHECK (((motivo IS NULL) OR ((length(motivo) >= 3) AND (length(motivo) <= 300))))`
- `despacho_cierres_nota` — `CHECK (((tipo = 'cierre'::text) OR (nota IS NULL)))`
- `despacho_cierres_nota_check` — `CHECK (((nota IS NULL) OR (length(nota) <= 500)))`
- `despacho_cierres_resultado` — `CHECK (((tipo = 'cierre'::text) = (resultado IS NOT NULL)))`
- `despacho_cierres_tipo_check` — `CHECK ((tipo = ANY (ARRAY['cierre'::text, 'reapertura'::text])))`
- `despacho_cierres_token_key` — `UNIQUE (token)`

**De qué depende:** `(despacho_id) REFERENCES retail.despachos(id)` · `(hecho_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despachos_sin_aviso`

*4 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `despacho_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_observaciones`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `tipo` | text | **no** | — | — |
| `mensaje` | text | **no** | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `clock_timestamp()` | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_observaciones_mensaje` — `CHECK (((btrim(mensaje) <> ''::text) AND (length(mensaje) <= 300)))`
- `despacho_observaciones_tipo` — `CHECK ((tipo = ANY (ARRAY['prenda_rota'::text, 'prenda_faltante'::text, 'prenda_manchada'::text, 'prenda_distinta'::text, 'prenda_de_mas'::text, 'empaque_danado'::text, 'otro'::text])))`
- `despacho_observaciones_token_unico` *(único parcial)* — `retail.despacho_observaciones (despacho_id, token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(despacho_item_id) REFERENCES retail.despacho_items(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `costo_correcciones`

*17 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `correccion_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `movimiento_id` | uuid | **no** | — | — |
| `compra_en` | timestamp with time zone | **no** | — | — |
| `stock_previo` | integer | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `costo_unitario_antes` | numeric | **no** | — | — |
| `costo_unitario_despues` | numeric | **no** | — | — |
| `costo_anterior_despues` | numeric | **no** | — | — |
| `costo_resultante_antes` | numeric | **no** | — | — |
| `costo_resultante_despues` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `costo_atipico_confirmado` | boolean | **no** | `false` | — |
| `persona_id` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `clock_timestamp()` | — |

**Candados** — lo que esta tabla hace imposible:

- `costo_correcciones_cantidad_check` — `CHECK ((cantidad > 0))`
- `costo_correcciones_costo_anterior_despues_check` — `CHECK ((costo_anterior_despues >= (0)::numeric))`
- `costo_correcciones_costo_resultante_antes_check` — `CHECK ((costo_resultante_antes >= (0)::numeric))`
- `costo_correcciones_costo_resultante_despues_check` — `CHECK ((costo_resultante_despues >= (0)::numeric))`
- `costo_correcciones_costo_unitario_antes_check` — `CHECK ((costo_unitario_antes >= (0)::numeric))`
- `costo_correcciones_costo_unitario_despues_check` — `CHECK ((costo_unitario_despues > (0)::numeric))`
- `costo_correcciones_motivo_check` — `CHECK (((length(btrim(motivo)) >= 3) AND (length(btrim(motivo)) <= 300)))`
- `costo_correcciones_stock_previo_check` — `CHECK ((stock_previo >= 0))`

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)` · `(persona_id) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `bajadas_piso`

*6 columnas · ~863 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `token_cliente` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `bajadas_piso_huella_check` — `CHECK ((length(huella) = 32))`
- `bajadas_piso_token_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `bajada_piso_items`

*4 columnas · ~2069 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `movimiento_id` | uuid | **no** | — | — |
| `bajada_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `bajada_piso_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `bajada_piso_items_no_centinela` — `CHECK ((variante_id <> '22222222-2222-4222-8222-222222222222'::uuid))`
- `bajada_piso_items_una_por_prenda` — `UNIQUE (bajada_id, variante_id)`

**De qué depende:** `(bajada_id) REFERENCES retail.bajadas_piso(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `parametros_analisis`

*4 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | boolean | **no** | `true` | — |
| `liquidar_desde` | smallint | **no** | `60` | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `parametros_analisis_liquidar_desde_rango` — `CHECK (((liquidar_desde >= 1) AND (liquidar_desde <= 999)))`
- `parametros_analisis_una_fila` — `CHECK (id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `bajadas_en_mano`

*2 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `bajada_id` | uuid | **no** | — | — |
| `ajuste_movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `bajadas_en_mano_ajuste_unico` — `UNIQUE (ajuste_movimiento_id)`

**De qué depende:** `(ajuste_movimiento_id) REFERENCES retail.movimientos(id) ON DELETE CASCADE` · `(bajada_id) REFERENCES retail.bajadas_piso(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuadres_piso`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `token_cliente` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `escaneo_desde` | timestamp with time zone | **no** | — | — |
| `resumen` | jsonb | **no** | — | — |
| `no_cargado` | jsonb | **no** | `'[]'::jsonb` | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cuadres_piso_escaneo_antes` — `CHECK ((escaneo_desde <= created_at))`
- `cuadres_piso_huella_check` — `CHECK ((huella ~ '^[0-9a-f]{32}$'::text))`
- `cuadres_piso_no_cargado_check` — `CHECK ((jsonb_typeof(no_cargado) = 'array'::text))`
- `cuadres_piso_nota_check` — `CHECK (((nota IS NULL) OR ((nota = btrim(nota)) AND ((char_length(nota) >= 1) AND (char_length(nota) <= 300)))))`
- `cuadres_piso_resumen_check` — `CHECK ((jsonb_typeof(resumen) = 'object'::text))`
- `cuadres_piso_token_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuadre_piso_items`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `movimiento_id` | uuid | **no** | — | — |
| `cuadre_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `sentido` | text | **no** | — | — |
| `cantidad` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuadre_piso_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `cuadre_piso_items_no_centinela` — `CHECK ((variante_id <> '22222222-2222-4222-8222-222222222222'::uuid))`
- `cuadre_piso_items_sentido_check` — `CHECK ((sentido = ANY (ARRAY['al_piso'::text, 'al_almacen'::text])))`
- `cuadre_piso_items_una_por_prenda` — `UNIQUE (cuadre_id, variante_id)`

**De qué depende:** `(cuadre_id) REFERENCES retail.cuadres_piso(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `capacidad_piso`

*8 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `m2_sala` | numeric | **no** | — | — |
| `densidad` | numeric | **no** | — | — |
| `capacidad` | integer | sí | — | — |
| `contada_el` | date | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `capacidad_piso_cabe_al_menos_una` — `CHECK (((m2_sala * densidad) >= (1)::numeric))`
- `capacidad_piso_contada_desde_2026` — `CHECK (((contada_el IS NULL) OR (contada_el >= '2026-01-01'::date)))`
- `capacidad_piso_densidad_rango` — `CHECK (((densidad > (0)::numeric) AND (densidad <= (150)::numeric)))`
- `capacidad_piso_m2_sala_rango` — `CHECK (((m2_sala > (0)::numeric) AND (m2_sala <= (2000)::numeric)))`
- `capacidad_piso_montos_finitos` — `CHECK (((abs(m2_sala) < 'Infinity'::numeric) AND (abs(densidad) < 'Infinity'::numeric)))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `espacio_piso`

*7 columnas · ~414 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `prendas` | integer | **no** | — | — |
| `modelos` | integer | **no** | — | — |
| `piso_cuadrado` | boolean | **no** | — | — |
| `tomada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `espacio_piso_desde_2026` — `CHECK ((fecha >= '2026-01-01'::date))`
- `espacio_piso_modelos_caben` — `CHECK (((modelos >= 0) AND (modelos <= prendas)))`
- `espacio_piso_prendas_no_negativas` — `CHECK ((prendas >= 0))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `grupos_mix`

*5 columnas · ~8 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `clave` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `rol` | text | **no** | — | — |
| `en_riel` | boolean | **no** | — | — |
| `orden` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `grupos_mix_clave_formato` — `CHECK ((clave ~ '^[a-z_]+$'::text))`
- `grupos_mix_nombre_no_vacio` — `CHECK ((length(btrim(nombre)) > 0))`
- `grupos_mix_orden_unico` — `UNIQUE (orden)`
- `grupos_mix_rol_valido` — `CHECK ((rol = ANY (ARRAY['destino'::text, 'rutina'::text, 'ocasional'::text, 'estacional'::text, 'conveniencia'::text])))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `categoria_grupo_mix`

*7 columnas · ~45 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `grupo_clave` | text | **no** | — | — |
| `confirmada_por` | uuid | sí | — | — |
| `confirmada_en` | timestamp with time zone | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `categoria_grupo_mix_firma_completa` — `CHECK (((confirmada_por IS NULL) = (confirmada_en IS NULL)))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(grupo_clave) REFERENCES retail.grupos_mix(clave)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `movimientos_internos_intentos`

*4 columnas · ~199 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `token_cliente` | uuid | **no** | — | — |
| `movimiento_id` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_internos_intentos_huella_check` — `CHECK ((length(huella) = 32))`
- `movimientos_internos_intentos_movimiento_id_key` — `UNIQUE (movimiento_id)`

**De qué depende:** `(movimiento_id) REFERENCES retail.movimientos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ajustes_inventario_intentos`

*5 columnas · ~706 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `token_cliente` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `resultado` | jsonb | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `ajustes_inventario_intentos_huella_check` — `CHECK ((length(huella) = 32))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `frescura_decisiones`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `color_codigo` | text | sí | — | — |
| `color_clave` | text | sí | — | — |
| `accion` | text | **no** | — | — |
| `anterior_id` | uuid | sí | — | — |
| `anterior_accion` | text | sí | — | — |
| `transferencia_id` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `plazo_dias` | integer | sí | — | — |
| `persona_id` | uuid | **no** | — | — |
| `terminal_id` | uuid | sí | — | — |
| `token_cliente` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `frescura_decisiones_accion_valida` — `CHECK ((accion = ANY (ARRAY['cambie_lugar'::text, 'hasta_agotar'::text, 'traslade'::text, 'rebaje'::text, 'anulacion'::text])))`
- `frescura_decisiones_anterior_coherente` — `CHECK ((((anterior_id IS NULL) = (anterior_accion IS NULL)) AND (anterior_id IS DISTINCT FROM id)))`
- `frescura_decisiones_anula_una_decision` — `CHECK (((accion <> 'anulacion'::text) OR ((anterior_accion = ANY (ARRAY['cambie_lugar'::text, 'hasta_agotar'::text, 'traslade'::text, 'rebaje'::text])) IS TRUE)))`
- `frescura_decisiones_nota` — `CHECK (((nota IS NULL) OR ((char_length(btrim(nota)) >= 1) AND (char_length(btrim(nota)) <= 280))))`
- `frescura_decisiones_plazo` — `CHECK ((((accion = 'anulacion'::text) = (plazo_dias IS NULL)) AND ((plazo_dias IS NULL) OR ((plazo_dias >= 1) AND (plazo_dias <= 30)))))`
- `frescura_decisiones_renglon` — `UNIQUE (id, ubicacion_id, producto_id, color_clave, accion)`
- `frescura_decisiones_token_unico` — `UNIQUE (token_cliente)`
- `frescura_decisiones_traslado` — `CHECK (((accion = 'traslade'::text) = (transferencia_id IS NOT NULL)))`
- `frescura_decisiones_una_respuesta` — `UNIQUE (anterior_id)`
- `frescura_decisiones_una_cabeza` *(único parcial)* — `retail.frescura_decisiones (ubicacion_id, producto_id, color_clave) WHERE (anterior_id IS NULL)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(anterior_id, ubicacion_id, producto_id, color_clave, anterior_accion) REFERENCES retail.frescura_decisiones(id, ubicacion_id, producto_id, color_clave, accion)` · `(persona_id) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `frescura_vara_cayla`

*8 columnas · ~20 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `categoria_id` | uuid | **no** | — | — |
| `calculada_en` | timestamp with time zone | **no** | — | — |
| `tiendas` | integer | **no** | — | — |
| `ventana_dias` | integer | **no** | — | — |
| `vendidas` | numeric | **no** | — | — |
| `unidades` | numeric | **no** | — | — |
| `nivel` | text | sí | — | — |
| `observaciones` | jsonb | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `frescura_vara_cayla_cifras` — `CHECK (((vendidas >= (0)::numeric) AND (unidades >= vendidas)))`
- `frescura_vara_cayla_montos_finitos` — `CHECK (((abs(vendidas) < 'Infinity'::numeric) AND (abs(unidades) < 'Infinity'::numeric)))`
- `frescura_vara_cayla_nivel` — `CHECK (((nivel IS NULL) OR (nivel = ANY (ARRAY['pocos_datos'::text, 'aceptable'::text, 'solido'::text]))))`
- `frescura_vara_cayla_observaciones_lista` — `CHECK ((jsonb_typeof(observaciones) = 'array'::text))`
- `frescura_vara_cayla_tiendas` — `CHECK ((tiendas >= 1))`
- `frescura_vara_cayla_ventana` — `CHECK ((ventana_dias = ANY (ARRAY[30, 60, 90, 120])))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 06 · Lechuza — Conteo y censo físico

### `conteos`

*15 columnas · ~31 filas · permisos por fila **activos***

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
| `alcance` | text | **no** | `'todo'::text` | qué universo declara cubrir: 'todo' o 'categoria' |
| `alcance_categoria_id` | uuid | sí | — | la categoría declarada cuando el alcance es 'categoria'; vacía cuando es 'todo' |
| `numero` | integer | **no** | `nextval('retail.conteos_numero_seq'::regclass)` | — |
| `es_prueba` | boolean | **no** | `false` | — |
| `terminal_id` | uuid | sí | — | — |
| `foto_en` | timestamp with time zone | sí | — | — |
| `es_arranque` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `conteos_alcance_categoria_coherente` — `CHECK ((((alcance = 'categoria'::text) AND (alcance_categoria_id IS NOT NULL)) OR ((alcance = 'todo'::text) AND (alcance_categoria_id IS NULL))))`
- `conteos_alcance_check` — `CHECK ((alcance = ANY (ARRAY['todo'::text, 'categoria'::text])))`
- `conteos_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'anulado'::text])))`
- `conteos_numero_unique` — `UNIQUE (numero)`
- `conteos_un_abierto_por_ubicacion` *(único parcial)* — `ON retail.conteos (ubicacion_id) WHERE (estado = 'abierto'::text)`

**De qué depende:** `(abierto_por) REFERENCES personas(id)` · `(alcance_categoria_id) REFERENCES retail.categorias(id)` · `(cerrado_por) REFERENCES personas(id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `conteos_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |
| `conteos_write` | ALL | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `conteo_items`

*13 columnas · ~551 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `conteo_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad_sistema` | integer | **no** | — | — |
| `cantidad_contada` | integer | sí | — | — |
| `diferencia` | integer | sí | — | — |
| `movimiento_id` | uuid | sí | — | — |
| `cantidad_foto` | integer | sí | — | — |
| `verificado_en` | timestamp with time zone | sí | — | — |
| `contada_anterior` | integer | sí | — | — |
| `confirmada_en` | timestamp with time zone | sí | — | — |
| `aplicada_sin_contar` | boolean | **no** | `false` | — |
| `completada_con_atajo` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `conteo_items_atajo_coherente` — `CHECK (((NOT completada_con_atajo) OR ((cantidad_contada IS NOT NULL) AND (NOT aplicada_sin_contar))))`
- `conteo_items_cantidad_contada_check` — `CHECK ((cantidad_contada >= 0))`
- `conteo_items_cantidad_foto_check` — `CHECK ((cantidad_foto >= 0))`
- `conteo_items_confirmada_coherente` — `CHECK (((confirmada_en IS NULL) OR (cantidad_contada IS NOT NULL)))`
- `conteo_items_contada_anterior_check` — `CHECK ((contada_anterior >= 0))`
- `conteo_items_conteo_id_variante_id_key` — `UNIQUE (conteo_id, variante_id)`
- `conteo_items_sin_contar_es_lo_esperado` — `CHECK (((NOT aplicada_sin_contar) OR ((cantidad_contada IS NOT NULL) AND (cantidad_contada = cantidad_sistema))))`

**De qué depende:** `(conteo_id) REFERENCES retail.conteos(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `conteo_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.conteos c   WHERE ((c.id = conteo_items.conteo_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (c.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |



## 07 · Colibrí — Ventas y caja

### `ventas`

*20 columnas · ~1326 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | El cobro completo a una clienta, no la prenda; sus prendas se enlazan por venta_items.venta_id |
| `ubicacion_id` | uuid | **no** | — | — |
| `cliente_id` | uuid | sí | — | — |
| `usuario_id` | uuid | sí | — | Qué colaborador cobró |
| `token_cliente` | uuid | sí | — | El identificador que el navegador genera por carrito para que reintentar no cobre dos veces; vacío es válido |
| `created_at` | timestamp with time zone | **no** | `now()` | Cuándo se cobró |
| `caja_id` | uuid | sí | — | A qué turno de caja pertenece el cobro; por acá el cierre suma solo lo suyo |
| `nota` | text | sí | — | Texto libre del mostrador sobre el cobro; hasta 200 caracteres |
| `estado` | text | **no** | `'completada'::text` | — |
| `motivo_anulacion` | text | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `es_prueba` | boolean | **no** | `false` | — |
| `asesora_id` | uuid | sí | — | — |
| `emisor` | text | **no** | `'retail'::text` | — |
| `boleta_alegra_numero` | text | sí | — | — |
| `descuento_pct` | numeric | **no** | `0` | — |
| `descuento_autorizado_por` | uuid | sí | — | — |
| `descuento_motivo` | text | sí | — | — |
| `terminal_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ventas_anulacion_coherente` — `CHECK ((((estado = 'completada'::text) AND (anulado_en IS NULL) AND (motivo_anulacion IS NULL) AND (anulado_por IS NULL)) OR ((estado = 'anulada'::text) AND (anulado_en IS NOT NULL) AND (motivo_anulacion IS NOT NULL))))`
- `ventas_boleta_alegra_solo_si_alegra` — `CHECK (((boleta_alegra_numero IS NULL) OR (emisor = 'alegra'::text)))`
- `ventas_descuento_autorizado_requiere_descuento` — `CHECK (((descuento_autorizado_por IS NULL) OR (descuento_pct > (0)::numeric)))`
- `ventas_descuento_pct_rango` — `CHECK (((descuento_pct >= (0)::numeric) AND (descuento_pct <= (100)::numeric)))`
- `ventas_emisor_check` — `CHECK ((emisor = ANY (ARRAY['alegra'::text, 'retail'::text])))`
- `ventas_estado_check` — `CHECK ((estado = ANY (ARRAY['completada'::text, 'anulada'::text])))`
- `ventas_montos_finitos` — `CHECK ((abs(descuento_pct) < 'Infinity'::numeric))`
- `ventas_nota_corta` — `CHECK ((char_length(nota) <= 200))`
- `ventas_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(asesora_id) REFERENCES personas(id)` · `(caja_id) REFERENCES retail.cajas(id)` · `(cliente_id) REFERENCES retail.clientas(id)` · `(descuento_autorizado_por) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ventas_insert` | INSERT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |
| `ventas_select` | SELECT | `(( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona)))` |


### `venta_items`

*15 columnas · ~2168 filas · permisos por fila **activos***

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
| `descuento_club_unitario` | numeric | **no** | `0` | — |
| `origen_sugerencia` | text | sí | — | — |
| `costo_estimado` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_items_campana_coherente` — `CHECK ((COALESCE((motivo_descuento = 'campana'::text), false) = (descuento_etiqueta_id IS NOT NULL)))`
- `venta_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `venta_items_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `venta_items_descuento_club_valido` — `CHECK (((descuento_club_unitario >= (0)::numeric) AND (descuento_club_unitario <= descuento_unitario)))`
- `venta_items_descuento_no_supera_precio` — `CHECK ((descuento_unitario <= precio_unitario))`
- `venta_items_descuento_unitario_check` — `CHECK ((descuento_unitario >= (0)::numeric))`
- `venta_items_montos_finitos` — `CHECK (((abs(precio_unitario) < 'Infinity'::numeric) AND (abs(descuento_unitario) < 'Infinity'::numeric) AND (abs(costo_unitario) < 'Infinity'::numeric) AND (abs(descuento_club_unitario) < 'Infinity'::numeric)))`
- `venta_items_motivo_coherente_con_descuento` — `CHECK (((((descuento_unitario - descuento_club_unitario) = (0)::numeric) AND (motivo_descuento IS NULL)) OR (((descuento_unitario - descuento_club_unitario) > (0)::numeric) AND (motivo_descuento IS NOT NULL)))) NOT VALID`
- `venta_items_motivo_descuento_valido` — `CHECK (((motivo_descuento IS NULL) OR (motivo_descuento = ANY (ARRAY['cumpleanos_clienta_top'::text, 'prenda_con_desperfecto'::text, 'liquidacion_temporada'::text, 'cerrar_venta'::text, 'otro'::text, 'campana'::text]))))`
- `venta_items_origen_sugerencia_valido` — `CHECK (((origen_sugerencia IS NULL) OR (origen_sugerencia = 'combina_bien_con'::text)))`
- `venta_items_otro_tiene_detalle` — `CHECK (((motivo_descuento IS DISTINCT FROM 'otro'::text) OR ((motivo_descuento_detalle IS NOT NULL) AND (btrim(motivo_descuento_detalle) <> ''::text)))) NOT VALID`
- `venta_items_precio_unitario_check` — `CHECK ((precio_unitario >= (0)::numeric))`

**De qué depende:** `(descuento_etiqueta_id) REFERENCES retail.etiquetas(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `venta_items_insert` | INSERT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_items.venta_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (v.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |
| `venta_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_items.venta_id) AND (( SELECT retail.fn_es_lider() AS fn_es_lider) OR (v.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))))))` |


### `venta_pagos`

*7 columnas · ~1369 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_id` | uuid | **no** | — | — |
| `metodo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `recibido` | numeric | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |
| `referencia` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text, 'anticipo'::text, 'qr'::text, 'redondeo'::text])))`
- `venta_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `venta_pagos_montos_finitos` — `CHECK (((abs(monto) < 'Infinity'::numeric) AND (abs(recibido) < 'Infinity'::numeric)))`
- `venta_pagos_recibido_coherente` — `CHECK (((recibido IS NULL) OR ((metodo = 'efectivo'::text) AND (recibido >= monto))))`
- `venta_pagos_recibido_con_tope` — `CHECK (((recibido IS NULL) OR ((metodo = 'efectivo'::text) AND (recibido >= monto) AND ((recibido - monto) <= (500)::numeric))))`
- `venta_pagos_redondeo_valido` — `CHECK (((metodo <> 'redondeo'::text) OR (monto < 0.10)))`
- `venta_pagos_referencia_valida` — `CHECK (((referencia IS NULL) OR ((referencia ~ '^[0-9A-Za-z]{1,40}$'::text) AND (metodo = ANY (ARRAY['yape'::text, 'plin'::text, 'transferencia'::text])))))`
- `venta_pagos_un_redondeo_por_venta` *(único parcial)* — `retail.venta_pagos (venta_id) WHERE (metodo = 'redondeo'::text)`

**De qué depende:** `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `venta_pagos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_pagos.venta_id) AND (( SELECT retail.fn_es_lider() AS fn_es_lider) OR (v.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))))))` |


### `venta_anulacion_items`

*6 columnas · ~3 filas · permisos por fila **activos***

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
| `venta_anulacion_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_anulacion_items.venta_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (v.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |
| `venta_anulacion_items_write` | ALL | `(EXISTS ( SELECT 1    FROM retail.ventas v   WHERE ((v.id = venta_anulacion_items.venta_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (v.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `cajas`

*20 columnas · ~74 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | El turno de caja de una sede: cada venta apunta acá para que el cierre sume solo lo suyo |
| `ubicacion_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'abierta'::text` | 'abierta' o 'cerrada', nada más; un índice parcial impide dos cajas abiertas en la misma sede |
| `monto_apertura` | numeric | **no** | — | Con cuánto efectivo arrancó el cajón, declarado al abrir; no puede ser negativo |
| `abierta_por` | uuid | sí | — | Qué colaborador abrió el turno; puede venir vacío y no es necesariamente quien cierra |
| `abierta_en` | timestamp with time zone | **no** | `now()` | Cuándo se abrió el cajón |
| `monto_cierre_sistema` | numeric | sí | — | — |
| `monto_cierre_real` | numeric | sí | — | — |
| `diferencia` | numeric | sí | — | Contado menos esperado: positivo sobra, negativo falta, y es el número por el que se pregunta al día siguiente |
| `cerrada_por` | uuid | sí | — | Qué colaborador contó el cajón y cerró el turno; puede ser distinto de quien abrió |
| `cerrada_en` | timestamp with time zone | sí | — | Cuándo se contó el efectivo y se cerró el turno; vacío mientras la caja siga abierta |
| `nota` | text | sí | — | — |
| `es_prueba` | boolean | **no** | `false` | — |
| `terminal_id` | uuid | sí | — | — |
| `monto_fondo` | numeric | sí | — | — |
| `monto_apertura_esperado` | numeric | sí | — | — |
| `motivo_diferencia_apertura` | text | sí | — | — |
| `apertura_revisada_por` | uuid | sí | — | — |
| `apertura_revisada_en` | timestamp with time zone | sí | — | — |
| `fondo_requerido` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `caja_apertura_explica_diferencia` — `CHECK (((monto_apertura_esperado IS NULL) OR (abs((monto_apertura - monto_apertura_esperado)) < 0.01) OR (length(btrim(COALESCE(motivo_diferencia_apertura, ''::text))) >= 3)))`
- `cajas_estado_check` — `CHECK ((estado = ANY (ARRAY['abierta'::text, 'cerrada'::text])))`
- `cajas_monto_apertura_check` — `CHECK ((monto_apertura >= (0)::numeric))`
- `cajas_montos_finitos` — `CHECK (((abs(monto_apertura) < 'Infinity'::numeric) AND (abs(monto_cierre_sistema) < 'Infinity'::numeric) AND (abs(monto_cierre_real) < 'Infinity'::numeric) AND (abs(diferencia) < 'Infinity'::numeric) AND (abs(monto_fondo) < 'Infinity'::numeric) AND (abs(monto_apertura_esperado) < 'Infinity'::numeric) AND (abs(fondo_requerido) < 'Infinity'::numeric)))`
- `cajas_ubicacion_abierta_unica` *(único parcial)* — `retail.cajas (ubicacion_id) WHERE (estado = 'abierta'::text)`

**De qué depende:** `(abierta_por) REFERENCES personas(id)` · `(cerrada_por) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cajas_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `caja_movimientos`

*12 columnas · ~185 filas · permisos por fila **activos***

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
| `separacion_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `caja_movimientos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `caja_movimientos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `caja_movimientos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))`
- `caja_movimientos_token_cliente_key` *(único parcial)* — `retail.caja_movimientos (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `caja_movimientos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.cajas c   WHERE ((c.id = caja_movimientos.caja_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (c.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `venta_pagos_correcciones`

*9 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_id` | uuid | **no** | — | — |
| `caja_id` | uuid | **no** | — | — |
| `persona_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |
| `antes` | jsonb | **no** | — | — |
| `despues` | jsonb | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `venta_pagos_correcciones_motivo_check` — `CHECK (((motivo IS NULL) OR ((length(btrim(motivo)) >= 1) AND (length(btrim(motivo)) <= 200))))`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(persona_id) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `clientas`

*25 columnas · ~60 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `documento_numero` | text | sí | — | — |
| `nombre` | text | sí | — | — |
| `telefono_whatsapp` | text | sí | — | — |
| `whatsapp_consentimiento_en` | timestamp with time zone | sí | — | — |
| `cumple_dia` | smallint | sí | — | — |
| `cumple_mes` | smallint | sí | — | — |
| `tallas` | jsonb | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `created_por` | uuid | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `archivada_en` | timestamp with time zone | sí | — | — |
| `archivada_por` | uuid | sí | — | — |
| `motivo_archivo` | text | sí | — | — |
| `anonimizada` | boolean | **no** | `false` | — |
| `fusionada_en_id` | uuid | sí | — | — |
| `documento_tipo` | text | **no** | `'dni'::text` | — |
| `club_desde` | timestamp with time zone | sí | — | — |
| `publicidad_desde` | timestamp with time zone | sí | — | — |
| `codigo_club` | text | sí | — | — |
| `cumple_anio` | smallint | sí | — | — |
| `preferencias` | jsonb | **no** | `'{}'::jsonb` | — |
| `correo` | text | sí | — | — |
| `registro_origen` | text | **no** | `'caja'::text` | — |
| `club_ubicacion_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `clientas_anonimizada_implica_archivada` — `CHECK (((NOT anonimizada) OR (archivada_en IS NOT NULL)))`
- `clientas_anonimizada_sin_club` — `CHECK (((NOT anonimizada) OR ((club_desde IS NULL) AND (publicidad_desde IS NULL) AND (codigo_club IS NULL) AND (cumple_anio IS NULL))))`
- `clientas_anonimizada_sin_correo` — `CHECK (((NOT anonimizada) OR ((correo IS NULL) AND (club_ubicacion_id IS NULL))))`
- `clientas_anonimizada_sin_datos_personales` — `CHECK (((NOT anonimizada) OR ((documento_numero IS NULL) AND (telefono_whatsapp IS NULL) AND (whatsapp_consentimiento_en IS NULL) AND (cumple_dia IS NULL) AND (cumple_mes IS NULL) AND (tallas IS NULL) AND (COALESCE(nombre, ''::text) = 'Clienta anonimizada'::text))))`
- `clientas_archivada_tiene_motivo` — `CHECK (((archivada_en IS NULL) OR (NULLIF(btrim(motivo_archivo), ''::text) IS NOT NULL)))`
- `clientas_club_ubicacion_solo_socia` — `CHECK (((club_ubicacion_id IS NULL) OR (club_desde IS NOT NULL)))`
- `clientas_codigo_club_formato` — `CHECK (((codigo_club IS NULL) OR (codigo_club ~ '^C-[0-9]{4,}$'::text)))`
- `clientas_codigo_si_y_solo_si_club` — `CHECK (((codigo_club IS NULL) = (club_desde IS NULL)))`
- `clientas_con_algun_dato` — `CHECK ((anonimizada OR (documento_numero IS NOT NULL) OR (NULLIF(btrim(nombre), ''::text) IS NOT NULL) OR (telefono_whatsapp IS NOT NULL)))`
- `clientas_correo_formato` — `CHECK (((correo IS NULL) OR ((correo = lower(btrim(correo))) AND (char_length(correo) <= 254) AND (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))))`
- `clientas_cumple_anio_valido` — `CHECK (((cumple_anio IS NULL) OR ((cumple_anio >= 1900) AND (cumple_anio <= 2100))))`
- `clientas_cumple_dia_valido` — `CHECK (((cumple_dia IS NULL) OR ((cumple_dia >= 1) AND (cumple_dia <= 31))))`
- `clientas_cumple_fecha_real` — `CHECK (((cumple_dia IS NULL) OR (cumple_mes IS NULL) OR ((cumple_dia <= CASE cumple_mes     WHEN 2 THEN 29     WHEN 4 THEN 30     WHEN 6 THEN 30     WHEN 9 THEN 30     WHEN 11 THEN 30     ELSE 31 END) AND ((cumple_anio IS NULL) OR (NOT ((cumple_mes = 2) AND (cumple_dia = 29))) OR ((((cumple_anio)::integer % 4) = 0) AND ((((cumple_anio)::integer % 100) <> 0) OR (((cumple_anio)::integer % 400) = 0)))))))`
- `clientas_cumple_mes_valido` — `CHECK (((cumple_mes IS NULL) OR ((cumple_mes >= 1) AND (cumple_mes <= 12))))`
- `clientas_documento_formato` — `CHECK (((documento_numero IS NULL) OR ((documento_tipo = 'dni'::text) AND (documento_numero ~ '^[0-9]{8}$'::text)) OR ((documento_tipo = ANY (ARRAY['carne_extranjeria'::text, 'pasaporte'::text])) AND (documento_numero ~ '^[A-Z0-9]{6,12}$'::text))))`
- `clientas_documento_no_vacio` — `CHECK (((documento_numero IS NULL) OR (btrim(documento_numero) <> ''::text)))`
- `clientas_documento_tipo_valido` — `CHECK ((documento_tipo = ANY (ARRAY['dni'::text, 'carne_extranjeria'::text, 'pasaporte'::text])))`
- `clientas_fusionada_implica_anonimizada` — `CHECK (((fusionada_en_id IS NULL) OR anonimizada))`
- `clientas_fusionada_no_a_si_misma` — `CHECK (((fusionada_en_id IS NULL) OR (fusionada_en_id <> id)))`
- `clientas_preferencias_forma` — `CHECK ((jsonb_typeof(preferencias) = 'object'::text))`
- `clientas_preferencias_solo_socia` — `CHECK (((preferencias = '{}'::jsonb) OR (club_desde IS NOT NULL)))`
- `clientas_publicidad_exige_club` — `CHECK (((publicidad_desde IS NULL) OR (club_desde IS NOT NULL)))`
- `clientas_registro_origen_valido` — `CHECK ((registro_origen = ANY (ARRAY['caja'::text, 'cartel'::text, 'web'::text])))`
- `clientas_socia_con_celular` — `CHECK (((club_desde IS NULL) OR ((telefono_whatsapp IS NOT NULL) AND (telefono_whatsapp ~ '^9[0-9]{8}$'::text))))`
- `clientas_socia_con_documento_y_nombre` — `CHECK (((club_desde IS NULL) OR ((documento_numero IS NOT NULL) AND (NULLIF(btrim(nombre), ''::text) IS NOT NULL))))`
- `clientas_textos_con_tope` — `CHECK (((char_length(nombre) <= 120) AND (char_length(motivo_archivo) <= 300)))`
- `clientas_correo_unico` *(único parcial)* — `retail.clientas (lower(btrim(correo))) WHERE (correo IS NOT NULL)`
- `clientas_documento_unico` *(único parcial)* — `retail.clientas (documento_tipo, documento_numero) WHERE (documento_numero IS NOT NULL)`

**De qué depende:** `(archivada_por) REFERENCES personas(id)` · `(club_ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(created_por) REFERENCES personas(id)` · `(fusionada_en_id) REFERENCES retail.clientas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `clientas_select` | SELECT | `( SELECT retail.fn_ve_modulo('clientas'::text) AS fn_ve_modulo)` |


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
- `codigos_descuento_montos_finitos` — `CHECK ((abs(porcentaje) < 'Infinity'::numeric))`
- `codigos_descuento_porcentaje_valido` — `CHECK (((porcentaje > (0)::numeric) AND (porcentaje <= (100)::numeric)))`
- `codigos_descuento_vigencia_coherente` — `CHECK (((vigente_desde IS NULL) OR (vigente_hasta IS NULL) OR (vigente_desde <= vigente_hasta)))`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `codigos_descuento_insert` | INSERT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |
| `codigos_descuento_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `codigos_descuento_update` | UPDATE | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `cambios`

*15 columnas · ~11 filas · permisos por fila **activos***

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
| `terminal_id` | uuid | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cambios_cantidad_check` — `CHECK ((cantidad > 0))`
- `cambios_condicion_check` — `CHECK ((condicion = ANY (ARRAY['vendible'::text, 'no_vendible'::text])))`
- `cambios_defecto_no_vuelve_al_piso` — `CHECK (((motivo IS DISTINCT FROM 'defecto'::text) OR (condicion = 'no_vendible'::text)))`
- `cambios_diferencia_liquidada` — `CHECK (((diferencia = (0)::numeric) OR (metodo_pago_diferencia IS NOT NULL)))`
- `cambios_metodo_pago_diferencia_check` — `CHECK ((metodo_pago_diferencia = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text, 'qr'::text])))`
- `cambios_montos_finitos` — `CHECK ((abs(diferencia) < 'Infinity'::numeric))`
- `cambios_motivo_check` — `CHECK ((motivo = ANY (ARRAY['talla_chica'::text, 'talla_grande'::text, 'otro_color'::text, 'defecto'::text, 'otro'::text])))`
- `cambios_token_cliente_key` *(único parcial)* — `retail.cambios (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(variante_nueva_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cambios_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `devoluciones`

*17 columnas · ~2 filas · permisos por fila **activos***

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
| `motivo_codigo` | text | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `reembolso_cuenta_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `devoluciones_aprobacion_coherente` — `CHECK ((((estado = 'pendiente'::text) AND (aprobado_en IS NULL)) OR ((estado <> 'pendiente'::text) AND (aprobado_en IS NOT NULL))))`
- `devoluciones_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])))`
- `devoluciones_montos_finitos` — `CHECK ((abs(reembolso_monto) < 'Infinity'::numeric))`
- `devoluciones_motivo_codigo_check` — `CHECK (((motivo_codigo IS NULL) OR (motivo_codigo = ANY (ARRAY['talla'::text, 'calce'::text, 'defecto'::text, 'no_le_gusto'::text, 'regalo'::text, 'otro'::text]))))`
- `devoluciones_reembolso_con_metodo` — `CHECK (((COALESCE(reembolso_monto, (0)::numeric) = (0)::numeric) OR (reembolso_metodo IS NOT NULL)))`
- `devoluciones_reembolso_metodo_valido` — `CHECK (((reembolso_metodo IS NULL) OR (reembolso_metodo = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text]))))`
- `devoluciones_reembolso_valido` — `CHECK (((reembolso_monto IS NULL) OR (reembolso_monto >= (0)::numeric)))`
- `devoluciones_token_cliente_key` *(único parcial)* — `retail.devoluciones (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(aprobado_por) REFERENCES personas(id)` · `(caja_id) REFERENCES retail.cajas(id)` · `(nota_credito_id) REFERENCES retail.comprobantes(id)` · `(reembolso_cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(solicitado_por) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `devoluciones_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |
| `devoluciones_write` | ALL | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `devolucion_items`

*6 columnas · ~3 filas · permisos por fila **activos***

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
| `devolucion_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.devoluciones d   WHERE ((d.id = devolucion_items.devolucion_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (d.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |
| `devolucion_items_write` | ALL | `(EXISTS ( SELECT 1    FROM retail.devoluciones d   WHERE ((d.id = devolucion_items.devolucion_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (d.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `cambio_salidas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cambio_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `precio_unitario` | numeric | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cambio_salidas_cambio_id_variante_id_key` — `UNIQUE (cambio_id, variante_id)`
- `cambio_salidas_cantidad_check` — `CHECK ((cantidad > 0))`
- `cambio_salidas_precio_unitario_check` — `CHECK ((precio_unitario > (0)::numeric))`

**De qué depende:** `(cambio_id) REFERENCES retail.cambios(id) DEFERRABLE INITIALLY DEFERRED` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cambio_salidas_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.cambios c   WHERE (c.id = cambio_salidas.cambio_id)))` |


### `clientas_fusiones`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clienta_mantiene_id` | uuid | **no** | — | — |
| `clienta_fusionada_id` | uuid | **no** | — | — |
| `ficha_fusionada` | jsonb | **no** | — | — |
| `ventas_movidas` | integer | **no** | `0` | — |
| `separaciones_movidas` | integer | **no** | `0` | — |
| `pedidos_movidos` | integer | **no** | `0` | — |
| `fusionada_por` | uuid | sí | — | — |
| `fusionada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `clientas_fusiones_no_a_si_misma` — `CHECK ((clienta_mantiene_id <> clienta_fusionada_id))`

**De qué depende:** `(clienta_fusionada_id) REFERENCES retail.clientas(id)` · `(clienta_mantiene_id) REFERENCES retail.clientas(id)` · `(fusionada_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `apartados`

*23 columnas · ~12 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `variante_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `sububicacion_id` | uuid | sí | — | — |
| `cantidad` | integer | **no** | — | — |
| `clienta_nombre` | text | **no** | — | — |
| `clienta_contacto` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `vence_el` | date | sí | — | — |
| `estado` | text | **no** | `'abierto'::text` | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `cerrado_por` | uuid | sí | — | — |
| `cerrado_en` | timestamp with time zone | sí | — | — |
| `cierre_motivo` | text | sí | — | — |
| `movimiento_id` | uuid | **no** | — | — |
| `movimiento_cierre_id` | uuid | sí | — | — |
| `adelanto_monto` | numeric | sí | — | — |
| `adelanto_medio` | text | sí | — | — |
| `adelanto_caja_movimiento_id` | uuid | sí | — | — |
| `venta_id` | uuid | sí | — | — |
| `separacion_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `apartados_adelanto_monto_check` — `CHECK (((adelanto_monto IS NULL) OR (adelanto_monto > (0)::numeric)))`
- `apartados_cantidad_check` — `CHECK ((cantidad > 0))`
- `apartados_cierre_coherente` — `CHECK ((((estado = 'abierto'::text) AND (cerrado_en IS NULL) AND (cierre_motivo IS NULL) AND (movimiento_cierre_id IS NULL)) OR ((estado = 'liberado'::text) AND (cerrado_en IS NOT NULL) AND (cierre_motivo IS NOT NULL) AND (movimiento_cierre_id IS NOT NULL))))`
- `apartados_cierre_motivo_check` — `CHECK ((cierre_motivo = ANY (ARRAY['clienta_no_vino'::text, 'entregada'::text, 'error_de_carga'::text, 'otro'::text])))`
- `apartados_clienta_contacto_check` — `CHECK ((length(btrim(clienta_contacto)) > 0))`
- `apartados_clienta_nombre_check` — `CHECK ((length(btrim(clienta_nombre)) > 0))`
- `apartados_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'liberado'::text])))`
- `apartados_montos_finitos` — `CHECK ((abs(adelanto_monto) < 'Infinity'::numeric))`
- `apartados_token_cliente_key` *(único parcial)* — `retail.apartados (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(cerrado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(movimiento_cierre_id) REFERENCES retail.movimientos(id)` · `(movimiento_id) REFERENCES retail.movimientos(id)` · `(separacion_id) REFERENCES retail.separaciones(id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `apartados_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `separaciones`

*40 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `codigo` | text | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `caja_id` | uuid | **no** | — | — |
| `clienta_id` | uuid | sí | — | — |
| `clienta_nombres` | text | **no** | — | — |
| `clienta_apellidos` | text | **no** | — | — |
| `clienta_celular` | text | sí | — | — |
| `clienta_dni` | text | sí | — | — |
| `comprobante_tipo` | text | **no** | — | — |
| `cliente_ruc` | text | sí | — | — |
| `cliente_razon_social` | text | sí | — | — |
| `asesora_id` | uuid | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `nota` | text | sí | — | — |
| `total` | numeric | **no** | — | — |
| `adelanto` | numeric | **no** | — | — |
| `vence_el` | date | **no** | — | — |
| `extensiones` | smallint | **no** | `0` | — |
| `devolucion_medio` | text | **no** | — | — |
| `devolucion_numero` | text | sí | — | — |
| `devolucion_cci` | text | sí | — | — |
| `estado` | text | **no** | `'abierta'::text` | — |
| `comprobante_anticipo_id` | uuid | sí | — | — |
| `venta_id` | uuid | sí | — | — |
| `entregada_en` | timestamp with time zone | sí | — | — |
| `entregada_por` | uuid | sí | — | — |
| `liberada_en` | timestamp with time zone | sí | — | — |
| `liberada_por` | uuid | sí | — | — |
| `liberada_motivo` | text | sí | — | — |
| `devuelta_en` | timestamp with time zone | sí | — | — |
| `devuelta_por` | uuid | sí | — | — |
| `devolucion_medio_real` | text | sí | — | — |
| `devolucion_operacion` | text | sí | — | — |
| `devolucion_caja_movimiento_id` | uuid | sí | — | — |
| `nota_credito_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `devolucion_cuenta_id` | uuid | sí | — | — |
| `estante` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `separaciones_check` — `CHECK (((adelanto > (0)::numeric) AND (adelanto <= total)))`
- `separaciones_clienta_apellidos_check` — `CHECK ((btrim(clienta_apellidos) <> ''::text))`
- `separaciones_clienta_celular_check` — `CHECK ((clienta_celular ~ '^[0-9]{9}$'::text))`
- `separaciones_clienta_dni_check` — `CHECK (((clienta_dni IS NULL) OR (clienta_dni ~ '^[0-9]{8}$'::text)))`
- `separaciones_clienta_nombres_check` — `CHECK ((btrim(clienta_nombres) <> ''::text))`
- `separaciones_cliente_ruc_check` — `CHECK (((cliente_ruc IS NULL) OR (cliente_ruc ~ '^(10\|20)[0-9]{9}$'::text)))`
- `separaciones_codigo_key` — `UNIQUE (codigo)`
- `separaciones_comprobante_tipo_check` — `CHECK ((comprobante_tipo = ANY (ARRAY['boleta'::text, 'factura'::text])))`
- `separaciones_devolucion_destino` — `CHECK ((((devolucion_medio = 'transferencia'::text) AND (devolucion_cci ~ '^[0-9]{20}$'::text) AND (devolucion_numero IS NULL)) OR ((devolucion_medio = ANY (ARRAY['yape'::text, 'plin'::text])) AND (devolucion_numero ~ '^[0-9]{9}$'::text) AND (devolucion_cci IS NULL))))`
- `separaciones_devolucion_efectivo_en_caja` — `CHECK (((devolucion_medio_real = 'efectivo'::text) = (devolucion_caja_movimiento_id IS NOT NULL)))`
- `separaciones_devolucion_medio_check` — `CHECK ((devolucion_medio = ANY (ARRAY['yape'::text, 'plin'::text, 'transferencia'::text])))`
- `separaciones_devolucion_medio_real_check` — `CHECK ((devolucion_medio_real = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])))`
- `separaciones_estado_check` — `CHECK ((estado = ANY (ARRAY['abierta'::text, 'entregada'::text, 'liberada'::text, 'devuelta'::text])))`
- `separaciones_estado_coherente` — `CHECK ((((estado = 'abierta'::text) AND (venta_id IS NULL) AND (entregada_en IS NULL) AND (liberada_en IS NULL) AND (devuelta_en IS NULL)) OR ((estado = 'entregada'::text) AND (venta_id IS NOT NULL) AND (entregada_en IS NOT NULL) AND (liberada_en IS NULL) AND (devuelta_en IS NULL)) OR ((estado = 'liberada'::text) AND (venta_id IS NULL) AND (entregada_en IS NULL) AND (liberada_en IS NOT NULL) AND (liberada_motivo IS NOT NULL) AND (devuelta_en IS NULL)) OR ((estado = 'devuelta'::text) AND (venta_id IS NULL) AND (entregada_en IS NULL) AND (liberada_en IS NOT NULL) AND (liberada_motivo IS NOT NULL) AND (devuelta_en IS NOT NULL) AND (devolucion_medio_real IS NOT NULL))))`
- `separaciones_estante_check` — `CHECK (((estante IS NULL) OR (estante ~ '^A-[0-9]{2,3}$'::text)))`
- `separaciones_extensiones_check` — `CHECK (((extensiones >= 0) AND (extensiones <= 2)))`
- `separaciones_factura_con_ruc` — `CHECK (((comprobante_tipo <> 'factura'::text) OR ((cliente_ruc IS NOT NULL) AND (btrim(COALESCE(cliente_razon_social, ''::text)) <> ''::text))))`
- `separaciones_liberada_motivo_check` — `CHECK ((liberada_motivo = ANY (ARRAY['vencio'::text, 'clienta_desistio'::text, 'error_de_carga'::text])))`
- `separaciones_montos_finitos` — `CHECK (((abs(total) < 'Infinity'::numeric) AND (abs(adelanto) < 'Infinity'::numeric)))`
- `separaciones_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 200)))`
- `separaciones_token_cliente_key` — `UNIQUE (token_cliente)`
- `separaciones_total_check` — `CHECK ((total > (0)::numeric))`

**De qué depende:** `(asesora_id) REFERENCES personas(id)` · `(caja_id) REFERENCES retail.cajas(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(comprobante_anticipo_id) REFERENCES retail.comprobantes(id)` · `(creado_por) REFERENCES personas(id)` · `(devolucion_caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(devolucion_cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(devuelta_por) REFERENCES personas(id)` · `(entregada_por) REFERENCES personas(id)` · `(liberada_por) REFERENCES personas(id)` · `(nota_credito_id) REFERENCES retail.comprobantes(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `separaciones_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `separacion_items`

*8 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `separacion_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `precio_unitario` | numeric | **no** | — | — |
| `descuento_unitario` | numeric | **no** | `0` | — |
| `descuento_etiqueta_id` | uuid | sí | — | — |
| `apartado_id` | uuid | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_items_apartado_id_key` — `UNIQUE (apartado_id)`
- `separacion_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `separacion_items_check` — `CHECK (((descuento_unitario >= (0)::numeric) AND (descuento_unitario < precio_unitario)))`
- `separacion_items_descuento_con_etiqueta` — `CHECK (((descuento_unitario > (0)::numeric) = (descuento_etiqueta_id IS NOT NULL)))`
- `separacion_items_montos_finitos` — `CHECK (((abs(precio_unitario) < 'Infinity'::numeric) AND (abs(descuento_unitario) < 'Infinity'::numeric)))`
- `separacion_items_precio_unitario_check` — `CHECK ((precio_unitario > (0)::numeric))`

**De qué depende:** `(apartado_id) REFERENCES retail.apartados(id)` · `(separacion_id) REFERENCES retail.separaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `separacion_items_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.separaciones s   WHERE ((s.id = separacion_items.separacion_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (s.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `separacion_pagos`

*9 columnas · ~7 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `separacion_id` | uuid | **no** | — | — |
| `metodo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `recibido` | numeric | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `cuenta_dinero_id` | uuid | sí | — | — |
| `abono_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_pagos_efectivo_en_caja` — `CHECK (((metodo = 'efectivo'::text) = (caja_movimiento_id IS NOT NULL)))`
- `separacion_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])))`
- `separacion_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `separacion_pagos_montos_finitos` — `CHECK (((abs(monto) < 'Infinity'::numeric) AND (abs(recibido) < 'Infinity'::numeric)))`
- `separacion_pagos_recibido_coherente` — `CHECK (((recibido IS NULL) OR ((metodo = 'efectivo'::text) AND (recibido >= monto))))`
- `separacion_pagos_recibido_con_tope` — `CHECK (((recibido IS NULL) OR ((metodo = 'efectivo'::text) AND (recibido >= monto) AND ((recibido - monto) <= (500)::numeric))))`

**De qué depende:** `(abono_id) REFERENCES retail.separacion_abonos(id)` · `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(separacion_id) REFERENCES retail.separaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `separacion_pagos_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.separaciones s   WHERE ((s.id = separacion_pagos.separacion_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (s.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `separacion_correlativos`

*2 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `siguiente` | integer | **no** | `1` | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_correlativos_siguiente_check` — `CHECK ((siguiente > 0))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pedidos_no_atendidos`

*13 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `producto_id` | uuid | sí | — | — |
| `descripcion_libre` | text | sí | — | — |
| `talla` | text | sí | — | — |
| `clienta_id` | uuid | sí | — | — |
| `atendido_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `resuelto` | boolean | **no** | `false` | — |
| `resuelto_en` | timestamp with time zone | sí | — | — |
| `motivo` | text | **no** | `'no_habia_talla'::text` | — |
| `razon` | text | sí | — | — |
| `variante_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `pedidos_no_atendidos_motivo_valido` — `CHECK ((motivo = ANY (ARRAY['no_habia_talla'::text, 'se_probo_no_llevo'::text])))`
- `pedidos_no_atendidos_producto_o_descripcion` — `CHECK (((producto_id IS NOT NULL) OR (NULLIF(btrim(COALESCE(descripcion_libre, ''::text)), ''::text) IS NOT NULL)))`
- `pedidos_no_atendidos_razon_solo_si_se_probo` — `CHECK (((razon IS NULL) OR ((motivo = 'se_probo_no_llevo'::text) AND (razon = ANY (ARRAY['no_le_quedo'::text, 'precio'::text, 'color'::text, 'lo_piensa'::text])))))`
- `pedidos_no_atendidos_resuelto_coherente` — `CHECK ((((resuelto = false) AND (resuelto_en IS NULL)) OR ((resuelto = true) AND (resuelto_en IS NOT NULL))))`

**De qué depende:** `(atendido_por) REFERENCES personas(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `pedidos_no_atendidos_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `caja_traslados`

*8 columnas · ~40 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `caja_id` | uuid | **no** | — | — |
| `destino` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `referencia` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `cuenta_dinero_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `caja_traslados_destino_check` — `CHECK ((destino = ANY (ARRAY['caja_fuerte'::text, 'banco'::text, 'lider'::text])))`
- `caja_traslados_monto_check` — `CHECK ((monto > (0)::numeric))`
- `caja_traslados_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `caja_traslados_referencia` — `CHECK (((destino <> 'lider'::text) OR (length(btrim(COALESCE(referencia, ''::text))) >= 2)))`

**De qué depende:** `(caja_id) REFERENCES retail.cajas(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `caja_traslados_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.cajas c   WHERE ((c.id = caja_traslados.caja_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (c.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `prendas_por_regularizar`

*18 columnas · ~1007 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `venta_item_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `descripcion` | text | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `talla_id` | uuid | **no** | — | — |
| `color_codigo` | text | **no** | — | — |
| `precio_cobrado` | numeric | **no** | — | — |
| `vendido_por` | uuid | sí | — | — |
| `vendido_en` | timestamp with time zone | **no** | `now()` | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `variante_id` | uuid | sí | — | — |
| `forma` | text | sí | — | — |
| `precio_oficial` | numeric | sí | — | — |
| `diferencia` | numeric | sí | — | — |
| `regularizado_por` | uuid | sí | — | — |
| `regularizado_en` | timestamp with time zone | sí | — | — |
| `cierre_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `prendas_por_regularizar_cierre_coherente` — `CHECK ((((estado = 'cerrada_sin_prenda'::text) AND (cierre_id IS NOT NULL) AND (variante_id IS NULL) AND (forma IS NULL)) OR ((estado <> 'cerrada_sin_prenda'::text) AND ((cierre_id IS NULL) OR (estado = 'anulada'::text)))))`
- `prendas_por_regularizar_completa` — `CHECK (((estado = 'regularizada'::text) = ((variante_id IS NOT NULL) AND (forma IS NOT NULL) AND (precio_oficial IS NOT NULL) AND (diferencia IS NOT NULL) AND (regularizado_en IS NOT NULL))))`
- `prendas_por_regularizar_descripcion_check` — `CHECK ((btrim(descripcion) <> ''::text))`
- `prendas_por_regularizar_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'regularizada'::text, 'anulada'::text, 'cerrada_sin_prenda'::text])))`
- `prendas_por_regularizar_forma_check` — `CHECK ((forma = ANY (ARRAY['ya_registrada'::text, 'llego_nueva'::text])))`
- `prendas_por_regularizar_montos_finitos` — `CHECK (((abs(precio_cobrado) < 'Infinity'::numeric) AND (abs(precio_oficial) < 'Infinity'::numeric) AND (abs(diferencia) < 'Infinity'::numeric)))`
- `prendas_por_regularizar_precio_cobrado_check` — `CHECK ((precio_cobrado > (0)::numeric))`
- `prendas_por_regularizar_venta_item_id_key` — `UNIQUE (venta_item_id)`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(cierre_id, ubicacion_id) REFERENCES retail.cierres_cola_arranque(id, ubicacion_id)` · `(color_codigo) REFERENCES retail.colores(codigo)` · `(regularizado_por) REFERENCES personas(id)` · `(talla_id) REFERENCES retail.tallas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(vendido_por) REFERENCES personas(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `prendas_por_regularizar_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `prendas_por_regularizar_correcciones`

*7 columnas · ~62 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `prenda_id` | uuid | **no** | — | — |
| `persona_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `antes` | jsonb | **no** | — | — |
| `despues` | jsonb | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(prenda_id) REFERENCES retail.prendas_por_regularizar(id)` · `(terminal_id) REFERENCES retail.terminales(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cierres_cola_arranque`

*9 columnas · ~4 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `corte` | timestamp with time zone | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `filas` | integer | **no** | — | — |
| `soles` | numeric | **no** | — | — |
| `cerrado_por` | uuid | **no** | — | — |
| `cerrado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cierres_cola_arranque_filas_check` — `CHECK ((filas > 0))`
- `cierres_cola_arranque_id_sede_key` — `UNIQUE (id, ubicacion_id)`
- `cierres_cola_arranque_montos_finitos` — `CHECK ((abs(soles) < 'Infinity'::numeric))`
- `cierres_cola_arranque_motivo_check` — `CHECK ((motivo = ANY (ARRAY['no_se_sabe'::text, 'aun_no_cargada'::text, 'ultima_unidad'::text])))`
- `cierres_cola_arranque_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `cierres_cola_arranque_soles_check` — `CHECK ((soles > (0)::numeric))`

**De qué depende:** `(cerrado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cierres_cola_arranque_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `cola_arranque_plazo`

*3 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `hasta` | date | **no** | — | — |
| `fijado_en` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cola_arranque_plazo_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `ubicacion_metas_dia`

*5 columnas · ~19 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `dia_semana` | smallint | **no** | — | — |
| `meta` | numeric | **no** | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicacion_metas_dia_dia_semana_check` — `CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))`
- `ubicacion_metas_dia_meta_check` — `CHECK ((meta > (0)::numeric))`
- `ubicacion_metas_dia_montos_finitos` — `CHECK ((abs(meta) < 'Infinity'::numeric))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `campana_efecto_caja`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `etiqueta_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `meta_pct` | numeric | **no** | `0` | — |
| `fondo` | numeric | sí | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `campana_efecto_caja_fondo_check` — `CHECK (((fondo IS NULL) OR (fondo >= (0)::numeric)))`
- `campana_efecto_caja_meta_pct_check` — `CHECK (((meta_pct > ('-100'::integer)::numeric) AND (meta_pct <= (300)::numeric)))`
- `campana_efecto_caja_montos_finitos` — `CHECK (((abs(meta_pct) < 'Infinity'::numeric) AND (abs(fondo) < 'Infinity'::numeric)))`
- `campana_efecto_caja_no_vacio` — `CHECK (((meta_pct <> (0)::numeric) OR (fondo IS NOT NULL)))`

**De qué depende:** `(etiqueta_id) REFERENCES retail.etiquetas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `configuracion_historial`

*5 columnas · ~126 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `que` | text | **no** | — | — |
| `detalle` | jsonb | **no** | `'{}'::jsonb` | — |
| `hecho_por` | uuid | sí | — | — |
| `hecho_en` | timestamp with time zone | **no** | `now()` | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `separacion_abonos`

*10 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `separacion_id` | uuid | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `comprobante_id` | uuid | sí | — | — |
| `dias_espera` | smallint | **no** | `0` | — |
| `vence_antes` | date | **no** | — | — |
| `vence_despues` | date | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_abonos_check` — `CHECK ((vence_despues >= vence_antes))`
- `separacion_abonos_dias_espera_check` — `CHECK ((dias_espera = ANY (ARRAY[0, 2, 3])))`
- `separacion_abonos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `separacion_abonos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `separacion_abonos_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(comprobante_id) REFERENCES retail.comprobantes(id)` · `(creado_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `separacion_avisos`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `separacion_id` | uuid | **no** | — | — |
| `canal` | text | **no** | `'whatsapp'::text` | — |
| `avisado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_avisos_canal_check` — `CHECK ((canal = 'whatsapp'::text))`

**De qué depende:** `(avisado_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `separacion_ediciones`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `separacion_id` | uuid | **no** | — | — |
| `items_antes` | jsonb | **no** | — | — |
| `items_despues` | jsonb | **no** | — | — |
| `total_antes` | numeric | **no** | — | — |
| `total_despues` | numeric | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_ediciones_montos_finitos` — `CHECK (((abs(total_antes) < 'Infinity'::numeric) AND (abs(total_despues) < 'Infinity'::numeric)))`
- `separacion_ediciones_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `separacion_items_retirados`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | — | — |
| `separacion_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `precio_unitario` | numeric | **no** | — | — |
| `descuento_unitario` | numeric | **no** | — | — |
| `descuento_etiqueta_id` | uuid | sí | — | — |
| `apartado_id` | uuid | sí | — | — |
| `edicion_id` | uuid | **no** | — | — |
| `retirado_por` | uuid | sí | — | — |
| `retirado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_items_retirados_montos_finitos` — `CHECK (((abs(precio_unitario) < 'Infinity'::numeric) AND (abs(descuento_unitario) < 'Infinity'::numeric)))`

**De qué depende:** `(apartado_id) REFERENCES retail.apartados(id)` · `(edicion_id) REFERENCES retail.separacion_ediciones(id)` · `(retirado_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `separacion_pedidos`

*27 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `ubicacion_origen_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `clienta_nombres` | text | sí | — | — |
| `clienta_apellidos` | text | sí | — | — |
| `clienta_celular` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `estado` | text | **no** | `'pedido'::text` | — |
| `transferencia_id` | uuid | sí | — | — |
| `apartado_id` | uuid | sí | — | — |
| `separacion_id` | uuid | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `enviado_por` | uuid | sí | — | — |
| `cancelado_por` | uuid | sí | — | — |
| `cancelado_motivo` | text | sí | — | — |
| `llego_en` | timestamp with time zone | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `grupo_id` | uuid | sí | — | — |
| `apartado_origen_id` | uuid | sí | — | — |
| `avisado_en` | timestamp with time zone | sí | — | — |
| `avisado_por` | uuid | sí | — | — |
| `cancelado_desde` | text | sí | — | — |
| `sigue_en_pie_en` | timestamp with time zone | sí | — | — |
| `sigue_en_pie_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_pedidos_aviso_con_cliente_y_llegada` — `CHECK (((avisado_en IS NULL) OR ((clienta_nombres IS NOT NULL) AND ((llego_en IS NOT NULL) OR (COALESCE(cancelado_desde, ''::text) = ANY (ARRAY['envia'::text, 'traslado'::text]))))))`
- `separacion_pedidos_cancelado_desde_valido` — `CHECK (((cancelado_desde IS NULL) OR ((estado = 'cancelado'::text) AND (cancelado_desde = ANY (ARRAY['pidio'::text, 'envia'::text, 'traslado'::text])))))`
- `separacion_pedidos_cantidad_check` — `CHECK ((cantidad > 0))`
- `separacion_pedidos_clienta_apellidos_check` — `CHECK ((btrim(clienta_apellidos) <> ''::text))`
- `separacion_pedidos_clienta_celular_check` — `CHECK ((clienta_celular ~ '^9[0-9]{8}$'::text))`
- `separacion_pedidos_clienta_completa` — `CHECK ((((clienta_nombres IS NULL) = (clienta_apellidos IS NULL)) AND ((clienta_celular IS NULL) OR (clienta_nombres IS NOT NULL))))`
- `separacion_pedidos_clienta_nombres_check` — `CHECK ((btrim(clienta_nombres) <> ''::text))`
- `separacion_pedidos_estado_check` — `CHECK ((estado = ANY (ARRAY['pedido'::text, 'en_camino'::text, 'llego'::text, 'apartado'::text, 'cancelado'::text, 'recibido'::text])))`
- `separacion_pedidos_estado_segun_clienta` — `CHECK ( CASE     WHEN (clienta_nombres IS NULL) THEN (estado = ANY (ARRAY['pedido'::text, 'en_camino'::text, 'recibido'::text, 'cancelado'::text]))     ELSE (estado <> 'recibido'::text) END)`
- `separacion_pedidos_no_llego_si_llego` — `CHECK (((cancelado_desde IS NULL) OR (cancelado_desde = 'pidio'::text) OR (llego_en IS NULL)))`
- `separacion_pedidos_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 200)))`
- `separacion_pedidos_otra_sede` — `CHECK ((ubicacion_id <> ubicacion_origen_id))`
- `separacion_pedidos_reposicion_con_grupo` — `CHECK (((clienta_nombres IS NOT NULL) OR (grupo_id IS NOT NULL)))`
- `separacion_pedidos_reserva_origen_solo_con_cliente` — `CHECK (((apartado_origen_id IS NULL) OR (clienta_nombres IS NOT NULL)))`
- `separacion_pedidos_sigue_en_pie_con_cliente` — `CHECK (((sigue_en_pie_en IS NULL) OR (clienta_nombres IS NOT NULL)))`
- `separacion_pedidos_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(apartado_id) REFERENCES retail.apartados(id)` · `(apartado_origen_id) REFERENCES retail.apartados(id)` · `(avisado_por) REFERENCES personas(id)` · `(cancelado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(enviado_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)` · `(sigue_en_pie_por) REFERENCES personas(id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_origen_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `apartados_opciones`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `apagadas` | ARRAY | **no** | `'{}'::text[]` | — |
| `actualizado_por` | uuid | sí | — | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `apartados_opciones_apagadas_check` — `CHECK ((apagadas <@ ARRAY['clienta'::text, 'qr'::text, 'abonos'::text, 'estante'::text, 'lote'::text, 'actividad'::text, 'editar'::text, 'otra_sede'::text]))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_permisos`

*12 columnas · ~17 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clienta_id` | uuid | **no** | — | — |
| `finalidad` | text | **no** | — | — |
| `accion` | text | **no** | — | — |
| `medio` | text | **no** | — | — |
| `texto_tipo` | text | sí | — | — |
| `texto_version` | integer | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `venta_id` | uuid | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `club_permisos_accion_valida` — `CHECK ((accion = ANY (ARRAY['otorga'::text, 'revoca'::text])))`
- `club_permisos_con_quien_registra` — `CHECK (((medio = ANY (ARRAY['legado'::text, 'qr_web'::text, 'pagina_cartel'::text, 'tienda_web'::text])) OR (registrado_por IS NOT NULL) OR ((medio = 'anonimizar'::text) AND (NULLIF(btrim(nota), ''::text) IS NOT NULL))))`
- `club_permisos_finalidad_valida` — `CHECK ((finalidad = ANY (ARRAY['club'::text, 'publicidad_whatsapp'::text])))`
- `club_permisos_legado_con_nota` — `CHECK (((medio <> 'legado'::text) OR (NULLIF(btrim(nota), ''::text) IS NOT NULL)))`
- `club_permisos_medio_coherente` — `CHECK ((((medio = ANY (ARRAY['caja_palabra'::text, 'ficha'::text])) AND (finalidad = 'club'::text) AND (accion = 'otorga'::text)) OR ((medio = 'whatsapp_propio'::text) AND (accion = 'otorga'::text)) OR ((medio = 'qr_web'::text) AND (finalidad = 'publicidad_whatsapp'::text) AND (accion = 'otorga'::text)) OR ((medio = 'pagina_cartel'::text) AND (accion = 'otorga'::text)) OR ((medio = 'pagina_cartel'::text) AND (finalidad = 'publicidad_whatsapp'::text) AND (accion = 'revoca'::text)) OR ((medio = ANY (ARRAY['baja_whatsapp'::text, 'cambio_celular'::text])) AND (finalidad = 'publicidad_whatsapp'::text) AND (accion = 'revoca'::text)) OR ((medio = 'anonimizar'::text) AND (accion = 'revoca'::text)) OR ((medio = 'legado'::text) AND (finalidad = 'club'::text) AND (accion = 'otorga'::text)) OR ((medio = 'tienda_web'::text) AND (finalidad = 'publicidad_whatsapp'::text) AND (accion = 'otorga'::text))))`
- `club_permisos_medio_valido` — `CHECK ((medio = ANY (ARRAY['caja_palabra'::text, 'ficha'::text, 'whatsapp_propio'::text, 'qr_web'::text, 'pagina_cartel'::text, 'baja_whatsapp'::text, 'cambio_celular'::text, 'anonimizar'::text, 'legado'::text, 'tienda_web'::text])))`
- `club_permisos_otorga_con_texto` — `CHECK (((accion <> 'otorga'::text) OR (medio = 'legado'::text) OR (texto_version IS NOT NULL)))`
- `club_permisos_pagina_cartel_lo_registra_ella` — `CHECK (((medio <> 'pagina_cartel'::text) OR (registrado_por IS NULL)))`
- `club_permisos_publicidad_solo_por_su_mensaje` — `CHECK (((NOT ((finalidad = 'publicidad_whatsapp'::text) AND (accion = 'otorga'::text))) OR (medio = ANY (ARRAY['whatsapp_propio'::text, 'qr_web'::text, 'pagina_cartel'::text, 'tienda_web'::text]))))`
- `club_permisos_qr_web_lo_registra_ella` — `CHECK (((medio <> 'qr_web'::text) OR (registrado_por IS NULL)))`
- `club_permisos_texto_completo` — `CHECK (((texto_tipo IS NULL) = (texto_version IS NULL)))`
- `club_permisos_texto_del_medio` — `CHECK (((texto_tipo IS NULL) OR ((medio = ANY (ARRAY['caja_palabra'::text, 'ficha'::text])) AND (texto_tipo = 'club'::text)) OR ((medio = 'whatsapp_propio'::text) AND (texto_tipo = ANY (ARRAY['mensaje_personal'::text, 'mensaje_generico'::text]))) OR ((medio = 'qr_web'::text) AND (texto_tipo = 'pagina_publicidad'::text)) OR ((medio = 'pagina_cartel'::text) AND (finalidad = 'club'::text) AND (texto_tipo = 'terminos'::text)) OR ((medio = 'pagina_cartel'::text) AND (finalidad = 'publicidad_whatsapp'::text) AND (texto_tipo = 'casilla_publicidad'::text)) OR ((medio = 'tienda_web'::text) AND (finalidad = 'publicidad_whatsapp'::text) AND (texto_tipo = 'casilla_publicidad'::text))))`
- `club_permisos_tienda_web_lo_registra_ella` — `CHECK (((medio <> 'tienda_web'::text) OR (registrado_por IS NULL)))`

**De qué depende:** `(clienta_id) REFERENCES retail.clientas(id)` · `(registrado_por) REFERENCES personas(id)` · `(texto_tipo, texto_version) REFERENCES retail.club_textos(tipo, version)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_textos`

*5 columnas · ~27 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `tipo` | text | **no** | — | — |
| `version` | integer | **no** | — | — |
| `texto` | text | **no** | — | — |
| `vigente_desde` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_textos_aviso_con_baja` — `CHECK (((tipo <> ALL (ARRAY['aviso_cumpleanos'::text, 'aviso_aniversario'::text, 'aviso_novedades'::text, 'aviso_rebaja'::text, 'aviso_puntos'::text])) OR ((POSITION(('{nombre}'::text) IN (texto)) > 0) AND ("right"(texto, 50) = 'Si no quieres recibir más mensajes, responde BAJA.'::text))))`
- `club_textos_no_vacio` — `CHECK ((btrim(texto) <> ''::text))`
- `club_textos_pagina_con_celular` — `CHECK (((tipo <> 'pagina_publicidad'::text) OR (POSITION(('{celular}'::text) IN (texto)) > 0)))`
- `club_textos_personal_con_codigo` — `CHECK (((tipo <> 'mensaje_personal'::text) OR (POSITION(('{codigo}'::text) IN (texto)) > 0)))`
- `club_textos_saludo_con_codigo` — `CHECK (((tipo <> 'saludo'::text) OR (POSITION(('{codigo}'::text) IN (texto)) > 0)))`
- `club_textos_tipo_valido` — `CHECK ((tipo = ANY (ARRAY['club'::text, 'mensaje_personal'::text, 'mensaje_generico'::text, 'pagina_publicidad'::text, 'terminos'::text, 'privacidad'::text, 'casilla_publicidad'::text, 'saludo'::text, 'aviso_cumpleanos'::text, 'aviso_aniversario'::text, 'aviso_novedades'::text, 'aviso_rebaja'::text, 'aviso_puntos'::text, 'aviso_cierre'::text])))`
- `club_textos_version_positiva` — `CHECK ((version >= 1))`

**De qué depende:** `(creado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_invitaciones`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clienta_id` | uuid | **no** | — | — |
| `token` | text | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `creada_por` | uuid | **no** | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `vence_en` | timestamp with time zone | **no** | — | — |
| `usada_en` | timestamp with time zone | sí | — | — |
| `texto_version` | integer | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_invitaciones_token_formato` — `CHECK ((token ~ '^[A-Za-z0-9_-]{16}$'::text))`
- `club_invitaciones_usada_antes_de_vencer` — `CHECK (((usada_en IS NULL) OR (usada_en <= vence_en)))`
- `club_invitaciones_usada_con_texto` — `CHECK (((usada_en IS NULL) = (texto_version IS NULL)))`
- `club_invitaciones_vigencia` — `CHECK (((vence_en >= creada_en) AND (vence_en <= (creada_en + '7 days'::interval))))`

**De qué depende:** `(clienta_id) REFERENCES retail.clientas(id)` · `(creada_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_canjes`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clienta_id` | uuid | **no** | — | — |
| `venta_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `anio` | smallint | **no** | — | — |
| `pct` | numeric | sí | — | — |
| `monto` | numeric | **no** | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anio_club` | smallint | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_canjes_anio_club_valido` — `CHECK ((((tipo = 'aniversario'::text) = (anio_club IS NOT NULL)) AND ((anio_club IS NULL) OR ((anio_club >= 1) AND (anio_club <= 200)))))`
- `club_canjes_anio_valido` — `CHECK (((anio >= 2026) AND (anio <= 2200)))`
- `club_canjes_anulado_completo` — `CHECK (((anulado_por IS NULL) OR (anulado_en IS NOT NULL)))`
- `club_canjes_monto_valido` — `CHECK ((monto > (0)::numeric))`
- `club_canjes_montos_finitos` — `CHECK (((abs(pct) < 'Infinity'::numeric) AND (abs(monto) < 'Infinity'::numeric)))`
- `club_canjes_pct_valido` — `CHECK ((((tipo = 'cumpleanos'::text) AND (pct IS NOT NULL) AND (pct >= (1)::numeric) AND (pct <= (50)::numeric)) OR ((tipo = 'aniversario'::text) AND (pct IS NULL))))`
- `club_canjes_tipo_no_vacio` — `CHECK ((btrim(tipo) <> ''::text))`
- `club_canjes_tipo_valido` — `CHECK ((tipo = ANY (ARRAY['cumpleanos'::text, 'aniversario'::text])))`
- `club_canjes_aniversario_uno_vivo` *(único parcial)* — `retail.club_canjes (clienta_id, anio_club) WHERE ((tipo = 'aniversario'::text) AND (anulado_en IS NULL))`
- `club_canjes_uno_vivo_por_anio` *(único parcial)* — `retail.club_canjes (clienta_id, tipo, anio) WHERE (anulado_en IS NULL)`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(registrado_por) REFERENCES personas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_aniversario_escala`

*2 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `anio` | smallint | **no** | — | — |
| `monto` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_aniversario_escala_anio_valido` — `CHECK (((anio >= 1) AND (anio <= 5)))`
- `club_aniversario_escala_monto_valido` — `CHECK (((monto > (0)::numeric) AND (monto <= (100000)::numeric)))`
- `club_aniversario_escala_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_avisos_enviados`

*11 columnas · ~6 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clienta_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `referencia` | text | **no** | — | — |
| `telefono` | text | sí | — | — |
| `texto` | text | sí | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `enviado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `deshecho_en` | timestamp with time zone | sí | — | — |
| `deshecho_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_avisos_enviados_deshecho_completo` — `CHECK (((deshecho_en IS NULL) = (deshecho_por IS NULL)))`
- `club_avisos_enviados_referencia_no_vacia` — `CHECK (((btrim(referencia) <> ''::text) AND (char_length(referencia) <= 200)))`
- `club_avisos_enviados_tipo_valido` — `CHECK ((tipo = ANY (ARRAY['cumpleanos'::text, 'aniversario'::text, 'novedades'::text, 'rebaja'::text, 'puntos'::text])))`
- `club_avisos_enviados_uno_vivo` *(único parcial)* — `retail.club_avisos_enviados (clienta_id, tipo, referencia) WHERE (deshecho_en IS NULL)`

**De qué depende:** `(clienta_id) REFERENCES retail.clientas(id)` · `(deshecho_por) REFERENCES personas(id)` · `(enviado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_intentos_registro`

*6 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `tipo` | text | **no** | — | — |
| `ip_hash` | text | **no** | — | — |
| `documento_hash` | text | sí | — | — |
| `celular` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_intentos_registro_celular_formato` — `CHECK (((celular IS NULL) OR (celular ~ '^[0-9]{9}$'::text)))`
- `club_intentos_registro_documento_corto` — `CHECK (((documento_hash IS NULL) OR (char_length(documento_hash) <= 128)))`
- `club_intentos_registro_ip_no_vacia` — `CHECK (((btrim(ip_hash) <> ''::text) AND (char_length(ip_hash) <= 128)))`
- `club_intentos_registro_tipo_valido` — `CHECK ((tipo = ANY (ARRAY['consulta'::text, 'registro'::text])))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_etiquetas`

*6 columnas · ~11 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `grupo` | text | **no** | — | — |
| `valor` | text | **no** | — | — |
| `orden` | integer | **no** | `0` | — |
| `activa` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `club_etiquetas_grupo_valido` — `CHECK ((grupo = ANY (ARRAY['ocasion'::text, 'estilo'::text, 'evita'::text])))`
- `club_etiquetas_unico` — `UNIQUE (grupo, valor)`
- `club_etiquetas_valor_limpio` — `CHECK (((valor = btrim(valor)) AND (valor <> ''::text) AND (char_length(valor) <= 40)))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `metas_persona_ajustes`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `mes` | date | **no** | — | — |
| `meta` | numeric | sí | — | — |
| `meta_antes` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `detalle` | text | sí | — | — |
| `cambiado_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `metas_ajustes_automatica_sin_valor` — `CHECK (((motivo = 'automatica'::text) = (meta IS NULL)))`
- `metas_ajustes_otro_con_detalle` — `CHECK (((motivo <> 'otro'::text) OR (detalle IS NOT NULL)))`
- `metas_persona_ajustes_detalle_check` — `CHECK (((detalle IS NULL) OR ((char_length(btrim(detalle)) >= 1) AND (char_length(btrim(detalle)) <= 80))))`
- `metas_persona_ajustes_mes_check` — `CHECK ((mes = (date_trunc('month'::text, (mes)::timestamp with time zone))::date))`
- `metas_persona_ajustes_meta_antes_check` — `CHECK ((meta_antes >= (0)::numeric))`
- `metas_persona_ajustes_meta_check` — `CHECK (((meta IS NULL) OR (meta > (0)::numeric)))`
- `metas_persona_ajustes_montos_finitos` — `CHECK (((abs(meta) < 'Infinity'::numeric) AND (abs(meta_antes) < 'Infinity'::numeric)))`
- `metas_persona_ajustes_motivo_check` — `CHECK ((motivo = ANY (ARRAY['cambia_horario'::text, 'capacitacion'::text, 'cubre_otra_tienda'::text, 'vuelve_de_descanso'::text, 'otro'::text, 'automatica'::text])))`

**De qué depende:** `(cambiado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `piezas_liquidacion`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `precio` | numeric | **no** | — | — |
| `estado` | text | **no** | `'disponible'::text` | — |
| `creada_por` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `venta_item_id` | uuid | sí | — | — |
| `vendida_en` | timestamp with time zone | sí | — | — |
| `retirada_en` | timestamp with time zone | sí | — | — |
| `retirada_por` | uuid | sí | — | — |
| `motivo_retiro` | text | sí | — | — |
| `token` | uuid | sí | — | — |
| `descripcion` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `piezas_liquidacion_descripcion_corta` — `CHECK (((descripcion IS NULL) OR (((length(btrim(descripcion)) >= 1) AND (length(btrim(descripcion)) <= 60)) AND (descripcion = btrim(descripcion)))))`
- `piezas_liquidacion_estado_check` — `CHECK ((estado = ANY (ARRAY['disponible'::text, 'vendida'::text, 'retirada'::text])))`
- `piezas_liquidacion_estado_coherente` — `CHECK ((((estado = 'disponible'::text) AND (venta_item_id IS NULL) AND (retirada_en IS NULL)) OR ((estado = 'vendida'::text) AND (venta_item_id IS NOT NULL) AND (vendida_en IS NOT NULL)) OR ((estado = 'retirada'::text) AND (retirada_en IS NOT NULL) AND (venta_item_id IS NULL))))`
- `piezas_liquidacion_montos_finitos` — `CHECK ((abs(precio) < 'Infinity'::numeric))`
- `piezas_liquidacion_precio_check` — `CHECK ((precio > (0)::numeric))`
- `piezas_liquidacion_precio_con_tope` — `CHECK (((precio <= (5000)::numeric) OR (precio = 'NaN'::numeric)))`
- `piezas_liquidacion_venta_item_id_key` — `UNIQUE (venta_item_id)`
- `piezas_liquidacion_token_key` *(único parcial)* — `retail.piezas_liquidacion (token) WHERE (token IS NOT NULL)`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(creada_por) REFERENCES personas(id)` · `(retirada_por) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `piezas_liquidacion_etiquetas`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `pieza_id` | uuid | **no** | — | — |
| `precio` | numeric | **no** | — | — |
| `vigente` | boolean | **no** | `true` | — |
| `persona_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `piezas_liquidacion_etiquetas_codigo_check` — `CHECK ((codigo ~ '^LQ[0-9A-Z]{6}$'::text))`
- `piezas_liquidacion_etiquetas_montos_finitos` — `CHECK ((abs(precio) < 'Infinity'::numeric))`
- `piezas_liquidacion_etiquetas_precio_check` — `CHECK ((precio > (0)::numeric))`
- `piezas_liquidacion_etiquetas_precio_con_tope` — `CHECK (((precio <= (5000)::numeric) OR (precio = 'NaN'::numeric)))`
- `piezas_liquidacion_etiquetas_una_vigente` *(único parcial)* — `retail.piezas_liquidacion_etiquetas (pieza_id) WHERE vigente`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(pieza_id) REFERENCES retail.piezas_liquidacion(id)` · `(terminal_id) REFERENCES retail.terminales(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `parametros_liquidacion`

*4 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | boolean | **no** | `true` | — |
| `precio_minimo` | numeric | **no** | `10` | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `parametros_liquidacion_id_check` — `CHECK (id)`
- `parametros_liquidacion_montos_finitos` — `CHECK ((abs(precio_minimo) < 'Infinity'::numeric))`
- `parametros_liquidacion_precio_con_tope` — `CHECK (((precio_minimo <= (5000)::numeric) OR (precio_minimo = 'NaN'::numeric)))`
- `parametros_liquidacion_precio_minimo_check` — `CHECK ((precio_minimo > (0)::numeric))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `intentos_con_token`

*5 columnas · ~1076 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `operacion` | text | **no** | — | — |
| `token` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `descartado_en` | timestamp with time zone | sí | — | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pedidos_web`

*26 columnas · ~19 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `numero` | integer | **no** | `nextval('retail.pedidos_web_numero_seq'::regclass)` | — |
| `codigo` | text | sí | — | — |
| `clienta_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'por_confirmar'::text` | — |
| `total` | numeric | **no** | `0` | — |
| `pagado` | numeric | **no** | `0` | — |
| `codigo_recojo` | text | **no** | `retail.fn_pedido_web_codigo_recojo()` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `confirmado_en` | timestamp with time zone | sí | — | — |
| `confirmado_por` | uuid | sí | — | — |
| `pagado_en` | timestamp with time zone | sí | — | — |
| `entregado_en` | timestamp with time zone | sí | — | — |
| `entregado_por` | uuid | sí | — | — |
| `cerrado_en` | timestamp with time zone | sí | — | — |
| `cerrado_por` | uuid | sí | — | — |
| `cierre_motivo` | text | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `venta_id` | uuid | sí | — | — |
| `entrega_token` | uuid | sí | — | — |
| `anulacion_token` | uuid | sí | — | — |
| `cupon_id` | uuid | sí | — | — |
| `descuento_cupon` | numeric | **no** | `0` | — |
| `cupon_liberado_en` | timestamp with time zone | sí | — | — |
| `cupon_liberado_motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `pedidos_web_anulacion_token_coherente` — `CHECK (((anulacion_token IS NULL) OR ((estado = 'anulado'::text) AND (pagado_en IS NOT NULL))))`
- `pedidos_web_cierre_coherente` — `CHECK ((((estado = ANY (ARRAY['vencido'::text, 'anulado'::text])) = (cerrado_en IS NOT NULL)) AND ((cerrado_en IS NULL) = (cierre_motivo IS NULL)) AND ((cerrado_en IS NOT NULL) OR (cerrado_por IS NULL)) AND ((estado <> 'vencido'::text) OR ((cierre_motivo = 'sin_confirmar'::text) AND (cerrado_por IS NULL))) AND ((estado <> 'anulado'::text) OR (((cerrado_por IS NOT NULL) OR ((confirmado_en IS NOT NULL) AND (pagado_en IS NULL) AND (pagado = (0)::numeric) AND (cierre_motivo = 'cliente_no_pago'::text))) AND (((confirmado_en IS NULL) AND (cierre_motivo = ANY (ARRAY['sin_stock'::text, 'cliente_no_respondio'::text, 'cliente_desistio'::text]))) OR ((confirmado_en IS NOT NULL) AND (pagado_en IS NULL) AND (cierre_motivo = ANY (ARRAY['cliente_no_pago'::text, 'cliente_desistio'::text, 'error_en_pedido'::text]))) OR ((pagado_en IS NOT NULL) AND (cierre_motivo = ANY (ARRAY['cliente_desistio'::text, 'error_en_pedido'::text, 'no_se_puede_entregar'::text]))))))))`
- `pedidos_web_codigo_recojo_formato` — `CHECK ((codigo_recojo ~ '^[1-9][0-9]{3}$'::text))`
- `pedidos_web_confirmacion_coherente` — `CHECK ((((confirmado_en IS NULL) = (confirmado_por IS NULL)) AND ((estado <> ALL (ARRAY['confirmado'::text, 'pagado'::text, 'entregado'::text])) OR (confirmado_en IS NOT NULL)) AND ((estado <> ALL (ARRAY['por_confirmar'::text, 'vencido'::text])) OR (confirmado_en IS NULL))))`
- `pedidos_web_cupon_coherente` — `CHECK (((descuento_cupon >= (0)::numeric) AND (abs(descuento_cupon) < 'Infinity'::numeric) AND ((descuento_cupon = (0)::numeric) OR (cupon_id IS NOT NULL)) AND ((cupon_liberado_en IS NULL) = (cupon_liberado_motivo IS NULL)) AND ((cupon_liberado_en IS NULL) OR (cupon_id IS NOT NULL)) AND ((cupon_liberado_motivo IS NULL) OR (cupon_liberado_motivo = ANY (ARRAY['compra_minima'::text, 'cubre_todo'::text, 'pedido_anulado'::text, 'pedido_vencido'::text])))))`
- `pedidos_web_entrega_coherente` — `CHECK ((((estado = 'entregado'::text) = (entregado_en IS NOT NULL)) AND ((entregado_en IS NULL) = (entregado_por IS NULL))))`
- `pedidos_web_estado_check` — `CHECK ((estado = ANY (ARRAY['por_confirmar'::text, 'confirmado'::text, 'pagado'::text, 'entregado'::text, 'vencido'::text, 'anulado'::text])))`
- `pedidos_web_montos_finitos` — `CHECK (((abs(total) < 'Infinity'::numeric) AND (abs(pagado) < 'Infinity'::numeric)))`
- `pedidos_web_numero_key` — `UNIQUE (numero)`
- `pedidos_web_numero_positivo` — `CHECK ((numero > 0))`
- `pedidos_web_pagado_completo` — `CHECK ( CASE     WHEN (estado = ANY (ARRAY['pagado'::text, 'entregado'::text])) THEN ((total > (0)::numeric) AND (pagado = total))     WHEN ((estado = 'anulado'::text) AND (pagado_en IS NOT NULL)) THEN true     ELSE (NOT ((total > (0)::numeric) AND (pagado = total))) END)`
- `pedidos_web_pagado_en_rango` — `CHECK (((total >= (0)::numeric) AND (pagado >= (0)::numeric) AND (pagado <= total)))`
- `pedidos_web_pago_coherente` — `CHECK ((((estado <> ALL (ARRAY['pagado'::text, 'entregado'::text])) OR (pagado_en IS NOT NULL)) AND ((pagado_en IS NULL) OR (estado = ANY (ARRAY['pagado'::text, 'entregado'::text, 'anulado'::text])))))`
- `pedidos_web_sin_pagos_sin_confirmar` — `CHECK (((estado <> ALL (ARRAY['por_confirmar'::text, 'vencido'::text])) OR (pagado = (0)::numeric)))`
- `pedidos_web_token_cliente_key` — `UNIQUE (token_cliente)`
- `pedidos_web_anulacion_token_key` *(único parcial)* — `retail.pedidos_web (anulacion_token) WHERE (anulacion_token IS NOT NULL)`
- `pedidos_web_entrega_token_key` *(único parcial)* — `retail.pedidos_web (entrega_token) WHERE (entrega_token IS NOT NULL)`
- `pedidos_web_venta_unica` *(único parcial)* — `retail.pedidos_web (venta_id) WHERE (venta_id IS NOT NULL)`

**De qué depende:** `(cerrado_por) REFERENCES personas(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(confirmado_por) REFERENCES personas(id)` · `(cupon_id) REFERENCES retail.club_cupones(id)` · `(entregado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pedido_web_lineas`

*19 columnas · ~24 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `pedido_id` | uuid | **no** | — | — |
| `posicion` | smallint | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `precio_lista` | numeric | **no** | — | — |
| `descuento` | numeric | **no** | `0` | — |
| `descuento_etiqueta_id` | uuid | sí | — | — |
| `precio` | numeric | sí | — | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `ubicacion_id` | uuid | sí | — | — |
| `sububicacion_id` | uuid | sí | — | — |
| `apartado_id` | uuid | sí | — | — |
| `reservada_en` | timestamp with time zone | sí | — | — |
| `fecha_compromiso` | date | sí | — | — |
| `resuelta_en` | timestamp with time zone | sí | — | — |
| `resuelta_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `transferencia_id` | uuid | sí | — | — |
| `venta_item_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `pedido_web_lineas_apartado_unico` — `UNIQUE (apartado_id)`
- `pedido_web_lineas_descuento_con_campana` — `CHECK (((descuento > (0)::numeric) = (descuento_etiqueta_id IS NOT NULL)))`
- `pedido_web_lineas_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'reservada'::text, 'por_conseguir'::text, 'quitada'::text, 'liberada'::text, 'entregada'::text])))`
- `pedido_web_lineas_montos_finitos` — `CHECK (((abs(precio_lista) < 'Infinity'::numeric) AND (abs(descuento) < 'Infinity'::numeric)))`
- `pedido_web_lineas_por_conseguir_con_fecha` — `CHECK (((estado <> 'por_conseguir'::text) OR (fecha_compromiso IS NOT NULL)))`
- `pedido_web_lineas_posicion_unica` — `UNIQUE (pedido_id, posicion)`
- `pedido_web_lineas_posicion_valida` — `CHECK (((posicion >= 1) AND (posicion <= 20)))`
- `pedido_web_lineas_precio_valido` — `CHECK (((precio_lista > (0)::numeric) AND (descuento >= (0)::numeric) AND (descuento < precio_lista)))`
- `pedido_web_lineas_reserva_coherente` — `CHECK ((((estado = ANY (ARRAY['reservada'::text, 'liberada'::text, 'entregada'::text])) = (apartado_id IS NOT NULL)) AND ((apartado_id IS NULL) = (ubicacion_id IS NULL)) AND ((apartado_id IS NULL) = (reservada_en IS NULL)) AND ((apartado_id IS NOT NULL) OR (sububicacion_id IS NULL))))`
- `pedido_web_lineas_resolucion_coherente` — `CHECK ((((estado = 'pendiente'::text) = (resuelta_en IS NULL)) AND ((resuelta_en IS NULL) = (resuelta_por IS NULL))))`
- `pedido_web_lineas_venta_item_unica` *(único parcial)* — `retail.pedido_web_lineas (venta_item_id) WHERE (venta_item_id IS NOT NULL)`

**De qué depende:** `(apartado_id) REFERENCES retail.apartados(id)` · `(descuento_etiqueta_id) REFERENCES retail.etiquetas(id)` · `(pedido_id) REFERENCES retail.pedidos_web(id)` · `(resuelta_por) REFERENCES personas(id)` · `(sububicacion_id, ubicacion_id) REFERENCES retail.sububicaciones(id, ubicacion_id)` · `(transferencia_id) REFERENCES retail.transferencias(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(venta_item_id) REFERENCES retail.venta_items(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pedido_web_pagos`

*22 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `pedido_id` | uuid | **no** | — | — |
| `origen` | text | **no** | — | — |
| `medio` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `estado` | text | **no** | — | — |
| `numero_operacion` | text | sí | — | — |
| `proveedor` | text | sí | — | — |
| `referencia_externa` | text | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |
| `observacion` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `registrado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_en` | timestamp with time zone | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_motivo` | text | sí | — | — |
| `anulado_caja_movimiento_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |
| `verificado_por` | uuid | sí | — | — |
| `verificado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `pedido_web_pagos_anulacion_coherente` — `CHECK ((((estado = 'anulado'::text) = (anulado_en IS NOT NULL)) AND ((anulado_en IS NULL) = (anulado_motivo IS NULL)) AND ((origen <> 'tienda'::text) OR ((anulado_en IS NULL) = (anulado_por IS NULL))) AND (((estado = 'anulado'::text) AND (medio = 'efectivo'::text)) = (anulado_caja_movimiento_id IS NOT NULL))))`
- `pedido_web_pagos_anulado_caja_movimiento_key` — `UNIQUE (anulado_caja_movimiento_id)`
- `pedido_web_pagos_caja_movimiento_key` — `UNIQUE (caja_movimiento_id)`
- `pedido_web_pagos_efectivo_en_caja` — `CHECK (((medio = 'efectivo'::text) = (caja_movimiento_id IS NOT NULL)))`
- `pedido_web_pagos_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text, 'por_revisar'::text, 'anulado'::text])))`
- `pedido_web_pagos_medio_check` — `CHECK ((medio = ANY (ARRAY['efectivo'::text, 'yape'::text, 'plin'::text, 'transferencia'::text, 'tarjeta'::text])))`
- `pedido_web_pagos_monto_positivo` — `CHECK ((monto > (0)::numeric))`
- `pedido_web_pagos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `pedido_web_pagos_motivo_anulacion` — `CHECK (((anulado_motivo IS NULL) OR (anulado_motivo = ANY (ARRAY['error_al_anotar'::text, 'devuelto_al_cliente'::text, 'reembolso_pasarela'::text]))))`
- `pedido_web_pagos_operacion_formato` — `CHECK (((((origen = 'tienda'::text) AND (medio <> 'efectivo'::text)) = (numero_operacion IS NOT NULL)) AND ((numero_operacion IS NULL) OR (numero_operacion ~ '^[0-9]{6,12}$'::text))))`
- `pedido_web_pagos_origen_check` — `CHECK ((origen = ANY (ARRAY['tienda'::text, 'pasarela'::text])))`
- `pedido_web_pagos_pasarela_coherente` — `CHECK (((origen <> 'pasarela'::text) OR ((medio <> 'efectivo'::text) AND (proveedor ~ '^[a-z][a-z0-9_]{1,29}$'::text) AND ((char_length(referencia_externa) >= 1) AND (char_length(referencia_externa) <= 100)) AND (numero_operacion IS NULL))))`
- `pedido_web_pagos_pasarela_unica` — `UNIQUE (proveedor, referencia_externa)`
- `pedido_web_pagos_revision_con_observacion` — `CHECK (((estado <> 'por_revisar'::text) OR ((char_length(btrim(COALESCE(observacion, ''::text))) >= 1) AND (char_length(btrim(COALESCE(observacion, ''::text))) <= 300))))`
- `pedido_web_pagos_tienda_coherente` — `CHECK (((origen <> 'tienda'::text) OR ((medio = ANY (ARRAY['efectivo'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])) AND (proveedor IS NULL) AND (referencia_externa IS NULL) AND (registrado_por IS NOT NULL) AND ((estado = ANY (ARRAY['aprobado'::text, 'anulado'::text])) OR ((estado = ANY (ARRAY['pendiente'::text, 'rechazado'::text])) AND (medio <> 'efectivo'::text))))))`
- `pedido_web_pagos_token_cliente_key` — `UNIQUE (token_cliente)`
- `pedido_web_pagos_verificacion_coherente` — `CHECK ((((verificado_por IS NULL) = (verificado_en IS NULL)) AND ((origen <> 'tienda'::text) OR (estado <> 'pendiente'::text) OR (verificado_por IS NULL)) AND ((origen <> 'tienda'::text) OR (estado <> 'rechazado'::text) OR ((verificado_por IS NOT NULL) AND COALESCE((observacion = ANY (ARRAY['no_aparece_en_el_banco'::text, 'monto_no_coincide'::text, 'operacion_equivocada'::text])), false)))))`
- `pedido_web_pagos_operacion_unica` *(único parcial)* — `retail.pedido_web_pagos (numero_operacion) WHERE ((numero_operacion IS NOT NULL) AND (estado <> 'anulado'::text))`

**De qué depende:** `(anulado_caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(anulado_por) REFERENCES personas(id)` · `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(pedido_id) REFERENCES retail.pedidos_web(id)` · `(registrado_por) REFERENCES personas(id)` · `(verificado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_web`

*11 columnas · ~13 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `usuario_web_id` | uuid | sí | — | — |
| `clienta_id` | uuid | **no** | — | — |
| `correo` | text | sí | — | — |
| `textos_aceptados` | text | **no** | — | — |
| `aceptados_en` | timestamp with time zone | **no** | `now()` | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `ultima_entrada_en` | timestamp with time zone | sí | — | — |
| `cerrada_en` | timestamp with time zone | sí | — | — |
| `usuario_cerrado_id` | uuid | sí | — | — |
| `usuario_borrado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_web_abierta_o_cerrada` — `CHECK ((((cerrada_en IS NULL) AND (usuario_web_id IS NOT NULL) AND (correo IS NOT NULL) AND (usuario_cerrado_id IS NULL) AND (usuario_borrado_en IS NULL)) OR ((cerrada_en IS NOT NULL) AND (usuario_web_id IS NULL) AND (correo IS NULL) AND (usuario_cerrado_id IS NOT NULL) AND ((usuario_borrado_en IS NULL) OR (usuario_borrado_en >= cerrada_en)))))`
- `cuentas_web_clienta_unica` — `UNIQUE (clienta_id)`
- `cuentas_web_correo_formato` — `CHECK (((correo = lower(btrim(correo))) AND (char_length(correo) <= 254) AND (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)))`
- `cuentas_web_correo_unico` — `UNIQUE (correo)`
- `cuentas_web_entrada_despues` — `CHECK (((ultima_entrada_en IS NULL) OR (ultima_entrada_en >= creada_en)))`
- `cuentas_web_textos_validos` — `CHECK ((textos_aceptados ~ '^[a-z0-9-]{1,60}$'::text))`
- `cuentas_web_usuario_unico` — `UNIQUE (usuario_web_id)`
- `cuentas_web_usuario_cerrado_unico` *(único parcial)* — `retail.cuentas_web (usuario_cerrado_id) WHERE (usuario_cerrado_id IS NOT NULL)`

**De qué depende:** `(clienta_id) REFERENCES retail.clientas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_web_pendientes`

*9 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `correo` | text | **no** | — | — |
| `usuario_web_id` | uuid | sí | — | — |
| `envios` | integer | **no** | `0` | — |
| `primer_envio_en` | timestamp with time zone | sí | — | — |
| `ultimo_envio_en` | timestamp with time zone | sí | — | — |
| `vence_en` | timestamp with time zone | sí | — | — |
| `intentos` | integer | **no** | `0` | — |
| `bloqueado_hasta` | timestamp with time zone | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_web_pendientes_correo_formato` — `CHECK (((correo = lower(btrim(correo))) AND (char_length(correo) <= 254) AND (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)))`
- `cuentas_web_pendientes_cuentas_validas` — `CHECK (((envios >= 0) AND (intentos >= 0)))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_web_cambios_correo`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cuenta_web_id` | uuid | **no** | — | — |
| `correo_nuevo` | text | **no** | — | — |
| `origen` | text | **no** | — | — |
| `pedido_en` | timestamp with time zone | **no** | `now()` | — |
| `vence_en` | timestamp with time zone | **no** | — | — |
| `envios` | integer | **no** | `0` | — |
| `primer_envio_en` | timestamp with time zone | sí | — | — |
| `ultimo_envio_en` | timestamp with time zone | sí | — | — |
| `codigo_vence_en` | timestamp with time zone | sí | — | — |
| `intentos` | integer | **no** | `0` | — |
| `bloqueado_hasta` | timestamp with time zone | sí | — | — |
| `token_hash` | text | sí | — | — |
| `token_vence_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_web_cambios_correo_cuentas` — `CHECK (((envios >= 0) AND (intentos >= 0)))`
- `cuentas_web_cambios_correo_ficha` — `CHECK ((((token_hash IS NULL) = (token_vence_en IS NULL)) AND ((token_hash IS NULL) OR ((origen = 'tienda'::text) AND (token_hash ~ '^[0-9a-f]{64}$'::text)))))`
- `cuentas_web_cambios_correo_formato` — `CHECK (((correo_nuevo = lower(btrim(correo_nuevo))) AND (char_length(correo_nuevo) <= 254) AND (correo_nuevo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)))`
- `cuentas_web_cambios_correo_origen` — `CHECK ((origen = ANY (ARRAY['cuenta'::text, 'tienda'::text])))`
- `cuentas_web_cambios_correo_vence` — `CHECK ((vence_en > pedido_en))`
- `cuentas_web_cambios_correo_ficha_unica` *(único parcial)* — `retail.cuentas_web_cambios_correo (token_hash) WHERE (token_hash IS NOT NULL)`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_web_intentos_clave`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cuenta_web_id` | uuid | **no** | — | — |
| `intentos` | integer | **no** | `0` | — |
| `primer_intento_en` | timestamp with time zone | **no** | `now()` | — |
| `bloqueada_hasta` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_web_intentos_clave_cuenta` — `CHECK ((intentos >= 0))`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_web_visitas`

*3 columnas · ~11 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cuenta_web_id` | uuid | **no** | — | — |
| `visita_en` | timestamp with time zone | **no** | — | — |
| `visita_anterior_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_web_visitas_orden` — `CHECK (((visita_anterior_en IS NULL) OR (visita_anterior_en <= visita_en)))`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `favoritos_web`

*4 columnas · ~42 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cuenta_web_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `guardado_en` | timestamp with time zone | **no** | `now()` | — |
| `quitado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `favoritos_web_quitado_despues` — `CHECK (((quitado_en IS NULL) OR (quitado_en >= guardado_en)))`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id)` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `esperas_web`

*7 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_web_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `quitada_en` | timestamp with time zone | sí | — | — |
| `pedido_web_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `esperas_web_cerrada_con_pedido` — `CHECK (((pedido_web_id IS NULL) OR (quitada_en IS NOT NULL)))`
- `esperas_web_quitada_despues` — `CHECK (((quitada_en IS NULL) OR (quitada_en >= creada_en)))`
- `esperas_web_viva_unica` *(único parcial)* — `retail.esperas_web (cuenta_web_id, variante_id, ubicacion_id) NULLS NOT DISTINCT WHERE (quitada_en IS NULL)`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id)` · `(pedido_web_id) REFERENCES retail.pedidos_web(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(variante_id) REFERENCES retail.variantes(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `recomendaciones_web`

*15 columnas · ~6 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_web_id` | uuid | **no** | — | — |
| `clienta_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `texto` | text | **no** | — | — |
| `marca` | uuid | **no** | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `leida_en` | timestamp with time zone | sí | — | — |
| `leida_por` | uuid | sí | — | — |
| `respuesta` | text | sí | — | — |
| `respondida_en` | timestamp with time zone | sí | — | — |
| `respondida_por` | uuid | sí | — | — |
| `archivada_en` | timestamp with time zone | sí | — | — |
| `archivada_por` | uuid | sí | — | — |
| `sin_nombre_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `recomendaciones_web_archivada_leida` — `CHECK (((archivada_en IS NULL) OR (leida_en IS NOT NULL)))`
- `recomendaciones_web_archivada_por` — `CHECK (((archivada_por IS NULL) OR (archivada_en IS NOT NULL)))`
- `recomendaciones_web_fechas` — `CHECK ((((leida_en IS NULL) OR (leida_en >= creada_en)) AND ((respondida_en IS NULL) OR (respondida_en >= creada_en)) AND ((archivada_en IS NULL) OR (archivada_en >= creada_en)) AND ((sin_nombre_en IS NULL) OR (sin_nombre_en >= creada_en))))`
- `recomendaciones_web_leida_por` — `CHECK (((leida_por IS NULL) OR (leida_en IS NOT NULL)))`
- `recomendaciones_web_marca_unica` — `UNIQUE (cuenta_web_id, marca)`
- `recomendaciones_web_respondida` — `CHECK ((((respuesta IS NULL) = (respondida_en IS NULL)) AND ((respondida_por IS NULL) OR (respondida_en IS NOT NULL))))`
- `recomendaciones_web_respondida_leida` — `CHECK (((respondida_en IS NULL) OR (leida_en IS NOT NULL)))`
- `recomendaciones_web_respuesta_larga` — `CHECK (((respuesta IS NULL) OR ((char_length(respuesta) <= 400) AND ((sin_nombre_en IS NOT NULL) OR (char_length(btrim(respuesta)) >= 2)))))`
- `recomendaciones_web_texto_largo` — `CHECK (((char_length(texto) <= 1000) AND ((sin_nombre_en IS NOT NULL) OR (char_length(btrim(texto)) >= 10))))`

**De qué depende:** `(archivada_por) REFERENCES personas(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(cuenta_web_id) REFERENCES retail.cuentas_web(id)` · `(leida_por) REFERENCES personas(id)` · `(respondida_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `configuracion_tienda_web`

*6 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | boolean | **no** | `true` | — |
| `horas_para_confirmar` | integer | **no** | `24` | — |
| `horas_aviso_sin_pagar` | integer | **no** | `48` | — |
| `dias_aviso_sin_recoger` | integer | **no** | `7` | — |
| `quedan_pocas_desde` | integer | **no** | `3` | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `configuracion_tienda_web_dias_aviso_sin_recoger_rango` — `CHECK (((dias_aviso_sin_recoger >= 1) AND (dias_aviso_sin_recoger <= 60)))`
- `configuracion_tienda_web_horas_aviso_sin_pagar_rango` — `CHECK (((horas_aviso_sin_pagar >= 1) AND (horas_aviso_sin_pagar <= 720)))`
- `configuracion_tienda_web_horas_para_confirmar_rango` — `CHECK (((horas_para_confirmar >= 1) AND (horas_para_confirmar <= 168)))`
- `configuracion_tienda_web_quedan_pocas_desde_rango` — `CHECK (((quedan_pocas_desde >= 1) AND (quedan_pocas_desde <= 3)))`
- `configuracion_tienda_web_una_fila` — `CHECK (id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ubicacion_datos_web`

*9 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `nombre_web` | text | sí | — | — |
| `direccion` | text | sí | — | — |
| `horario` | text | sí | — | — |
| `mostrar` | boolean | **no** | `false` | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `orden` | integer | sí | — | — |
| `mapa_url` | text | sí | — | — |
| `foto_ruta` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicacion_datos_web_direccion_valida` — `CHECK (((direccion IS NULL) OR ((direccion = btrim(direccion)) AND ((char_length(direccion) >= 1) AND (char_length(direccion) <= 160)))))`
- `ubicacion_datos_web_foto_valida` — `CHECK (((foto_ruta IS NULL) OR (foto_ruta ~ (('^tiendas/'::text \|\| (ubicacion_id)::text) \|\| '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp\|jpg)$'::text))))`
- `ubicacion_datos_web_horario_valido` — `CHECK (((horario IS NULL) OR ((horario = btrim(horario)) AND ((char_length(horario) >= 1) AND (char_length(horario) <= 120)))))`
- `ubicacion_datos_web_mapa_valido` — `CHECK (((mapa_url IS NULL) OR (((char_length(mapa_url) >= 1) AND (char_length(mapa_url) <= 400)) AND (mapa_url = btrim(mapa_url)) AND (mapa_url ~* '^https://(www\.google\.com/maps\|google\.com/maps\|maps\.google\.com\|maps\.app\.goo\.gl\|goo\.gl/maps)(/\S*)?(\?\S*)?$'::text))))`
- `ubicacion_datos_web_mostrar_completa` — `CHECK (((NOT mostrar) OR ((nombre_web IS NOT NULL) AND (direccion IS NOT NULL))))`
- `ubicacion_datos_web_nombre_valido` — `CHECK (((nombre_web IS NULL) OR ((nombre_web = btrim(nombre_web)) AND ((char_length(nombre_web) >= 1) AND (char_length(nombre_web) <= 40)))))`
- `ubicacion_datos_web_nombre_unico` *(único parcial)* — `retail.ubicacion_datos_web (lower(nombre_web)) WHERE (nombre_web IS NOT NULL)`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ubicacion_horario_web`

*4 columnas · ~20 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `dia` | smallint | **no** | — | — |
| `abre` | smallint | **no** | — | — |
| `cierra` | smallint | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicacion_horario_web_dia` — `CHECK (((dia >= 0) AND (dia <= 6)))`
- `ubicacion_horario_web_horas` — `CHECK (((abre >= 0) AND (abre < cierra) AND (cierra <= 1440) AND (((abre)::integer % 15) = 0) AND (((cierra)::integer % 15) = 0)))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ubicacion_cierres_web`

*2 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `trafico_web`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `ocurrio_en` | timestamp with time zone | **no** | `now()` | — |
| `visitante` | uuid | **no** | — | — |
| `paso` | smallint | **no** | — | — |
| `camino` | text | sí | — | — |
| `region` | text | sí | — | — |
| `producto_id` | uuid | sí | — | — |
| `variante_id` | uuid | sí | — | — |
| `pedido_web_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `trafico_web_camino` — `CHECK (((camino IS NULL) OR (camino = ANY (ARRAY['instagram'::text, 'directo'::text, 'whatsapp'::text, 'tiktok'::text, 'google'::text, 'qr'::text, 'otros'::text]))))`
- `trafico_web_camino_al_entrar` — `CHECK (((paso = 0) = (camino IS NOT NULL)))`
- `trafico_web_paso` — `CHECK (((paso >= 0) AND (paso <= 4)))`
- `trafico_web_pedido` — `CHECK (((paso = 4) = (pedido_web_id IS NOT NULL)))`
- `trafico_web_prenda` — `CHECK (((paso = ANY (ARRAY[1, 2, 3])) = (producto_id IS NOT NULL)))`
- `trafico_web_region` — `CHECK (((region IS NULL) OR (region ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'::text)))`
- `trafico_web_region_al_entrar` — `CHECK (((paso = 0) OR (region IS NULL)))`
- `trafico_web_talla` — `CHECK (((paso = ANY (ARRAY[2, 3])) OR (variante_id IS NULL)))`
- `trafico_web_talla_obligatoria` — `CHECK (((paso <> ALL (ARRAY[2, 3])) OR (variante_id IS NOT NULL)))`
- `trafico_web_pedido_una_vez` *(único parcial)* — `retail.trafico_web (pedido_web_id) WHERE (pedido_web_id IS NOT NULL)`

**De qué depende:** `(pedido_web_id) REFERENCES retail.pedidos_web(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `tickets_abiertos`

*18 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `estado` | text | **no** | `'abierto'::text` | — |
| `lineas` | jsonb | **no** | `'[]'::jsonb` | — |
| `nota` | text | **no** | `''::text` | — |
| `clienta` | jsonb | sí | — | — |
| `cobro` | jsonb | sí | — | — |
| `posicion` | integer | **no** | `0` | — |
| `tomado_por` | uuid | sí | — | — |
| `tomado_etiqueta` | text | sí | — | — |
| `tomado_hasta` | timestamp with time zone | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `venta_id` | uuid | sí | — | — |
| `creado_por` | uuid | **no** | `auth.uid()` | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `cerrado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `tickets_abiertos_clienta_check` — `CHECK (((clienta IS NULL) OR (jsonb_typeof(clienta) = 'object'::text)))`
- `tickets_abiertos_cobro_check` — `CHECK (((cobro IS NULL) OR (jsonb_typeof(cobro) = 'object'::text)))`
- `tickets_abiertos_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'cobrado'::text, 'descartado'::text])))`
- `tickets_abiertos_lineas_check` — `CHECK (((jsonb_typeof(lineas) = 'array'::text) AND (octet_length((lineas)::text) <= 60000)))`
- `tickets_abiertos_nombre_check` — `CHECK (((char_length(btrim(nombre)) >= 1) AND (char_length(btrim(nombre)) <= 30)))`
- `tickets_abiertos_nota_check` — `CHECK ((char_length(nota) <= 200))`
- `tickets_abiertos_tomado_etiqueta_check` — `CHECK (((tomado_etiqueta IS NULL) OR (char_length(tomado_etiqueta) <= 40)))`
- `tickets_cerrado_no_se_tiene` — `CHECK (((estado = 'abierto'::text) OR (tomado_por IS NULL)))`
- `tickets_cerrado_si_y_solo_si_no_abierto` — `CHECK (((estado = 'abierto'::text) = (cerrado_en IS NULL)))`
- `tickets_cobrado_si_y_solo_si_hay_venta` — `CHECK (((estado = 'cobrado'::text) = (venta_id IS NOT NULL)))`
- `tickets_un_nombre_por_sede` *(único parcial)* — `retail.tickets_abiertos (ubicacion_id, lower(btrim(nombre))) WHERE (estado = 'abierto'::text)`
- `tickets_una_venta` *(único parcial)* — `retail.tickets_abiertos (venta_id) WHERE (venta_id IS NOT NULL)`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `padron_lecturas`

*2 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `huella` | text | **no** | — | — |
| `leida_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `padron_lecturas_huella_check` — `CHECK ((huella ~ '^[0-9a-f]{64}$'::text))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `separacion_aplazamientos`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `separacion_id` | uuid | **no** | — | — |
| `vence_antes` | date | **no** | — | — |
| `vence_despues` | date | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `separacion_aplazamientos_hacia_adelante` — `CHECK ((vence_despues > vence_antes))`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `looks_web`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_web_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `huella` | text | **no** | — | — |
| `guardado_en` | timestamp with time zone | **no** | `now()` | — |
| `quitado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `looks_web_nombre_valido` — `CHECK (((nombre = btrim(nombre)) AND ((char_length(nombre) >= 1) AND (char_length(nombre) <= 40))))`
- `looks_web_quitado_despues` — `CHECK (((quitado_en IS NULL) OR (quitado_en >= guardado_en)))`
- `looks_web_uno_vivo_por_huella` *(único parcial)* — `retail.looks_web (cuenta_web_id, huella) WHERE (quitado_en IS NULL)`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `look_web_piezas`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `look_id` | uuid | **no** | — | — |
| `posicion` | smallint | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `color_codigo` | text | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `look_web_piezas_posicion_valida` — `CHECK (((posicion >= 1) AND (posicion <= 4)))`
- `look_web_piezas_un_modelo` — `UNIQUE (look_id, producto_id)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(look_id) REFERENCES retail.looks_web(id) ON DELETE CASCADE` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ubicacion_metas_mes`

*6 columnas · ~26 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `mes` | date | **no** | — | — |
| `dia_semana` | smallint | **no** | — | — |
| `meta` | numeric | **no** | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicacion_metas_mes_dia` — `CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))`
- `ubicacion_metas_mes_monto` — `CHECK (((meta > (0)::numeric) AND (meta < (10000000)::numeric)))`
- `ubicacion_metas_mes_primer_dia` — `CHECK ((mes = (date_trunc('month'::text, (mes)::timestamp with time zone))::date))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ubicacion_metas_fecha`

*6 columnas · ~7 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `meta` | numeric | **no** | — | — |
| `nota` | text | sí | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `ubicacion_metas_fecha_monto` — `CHECK (((meta >= (0)::numeric) AND (meta < (10000000)::numeric)))`
- `ubicacion_metas_fecha_nota` — `CHECK (((nota IS NULL) OR ((char_length(nota) >= 1) AND (char_length(nota) <= 140))))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `avisos_bandeja`

*2 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cuenta_web_id` | uuid | **no** | — | — |
| `vaciada_en` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `avisos_tienda`

*10 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cuenta_web_id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `titulo` | text | **no** | — | — |
| `texto` | text | **no** | — | — |
| `href` | text | **no** | — | — |
| `recibido_en` | timestamp with time zone | **no** | `now()` | — |
| `vigente` | boolean | **no** | `true` | — |
| `borrado_en` | timestamp with time zone | sí | — | — |
| `quitada_de_bandeja_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `avisos_tienda_check` — `CHECK ((tipo = split_part(clave, '-'::text, 1)))`
- `avisos_tienda_clave_check` — `CHECK ((clave ~ '^(llego\|respuesta)-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))`
- `avisos_tienda_href_check` — `CHECK (((char_length(href) >= 1) AND (char_length(href) <= 300)))`
- `avisos_tienda_texto_check` — `CHECK (((char_length(texto) >= 1) AND (char_length(texto) <= 600)))`
- `avisos_tienda_tipo_check` — `CHECK ((tipo = ANY (ARRAY['llego'::text, 'respuesta'::text])))`
- `avisos_tienda_titulo_check` — `CHECK (((char_length(titulo) >= 1) AND (char_length(titulo) <= 200)))`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `tienda_push_suscripciones`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_web_id` | uuid | **no** | — | — |
| `endpoint` | text | **no** | — | — |
| `p256dh` | text | **no** | — | — |
| `auth` | text | **no** | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `tienda_push_suscripciones_auth_check` — `CHECK (((char_length(auth) >= 10) AND (char_length(auth) <= 100)))`
- `tienda_push_suscripciones_endpoint_check` — `CHECK ((((char_length(endpoint) >= 20) AND (char_length(endpoint) <= 1000)) AND (endpoint ~~ 'https://%'::text)))`
- `tienda_push_suscripciones_endpoint_key` — `UNIQUE (endpoint)`
- `tienda_push_suscripciones_p256dh_check` — `CHECK (((char_length(p256dh) >= 40) AND (char_length(p256dh) <= 200)))`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `tienda_push_envios`

*9 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_web_id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `titulo` | text | **no** | — | — |
| `texto` | text | **no** | — | — |
| `enlace` | text | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `enviado_en` | timestamp with time zone | sí | — | — |
| `intentos` | integer | **no** | `0` | — |

**Candados** — lo que esta tabla hace imposible:

- `tienda_push_envios_clave_check` — `CHECK (((char_length(clave) >= 1) AND (char_length(clave) <= 200)))`
- `tienda_push_envios_clave_unica` — `UNIQUE (cuenta_web_id, clave)`
- `tienda_push_envios_enlace_check` — `CHECK (((enlace ~~ '/%'::text) AND (char_length(enlace) <= 300)))`
- `tienda_push_envios_intentos_check` — `CHECK (((intentos >= 0) AND (intentos <= 5)))`
- `tienda_push_envios_texto_check` — `CHECK (((char_length(texto) >= 1) AND (char_length(texto) <= 240)))`
- `tienda_push_envios_titulo_check` — `CHECK (((char_length(titulo) >= 1) AND (char_length(titulo) <= 120)))`

**De qué depende:** `(cuenta_web_id) REFERENCES retail.cuentas_web(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_puntos_config`

*11 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `puntos_por_sol` | numeric | **no** | — | — |
| `soles_por_100` | numeric | **no** | — | — |
| `canje_minimo_puntos` | integer | **no** | — | — |
| `compra_minima_x` | numeric | **no** | — | — |
| `vigencia_cupon_dias` | integer | **no** | — | — |
| `regalo_cumple_puntos` | integer | **no** | — | — |
| `tope_costo_pct` | numeric | **no** | — | — |
| `creada_por` | uuid | sí | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `club_puntos_config_valores` — `CHECK (((puntos_por_sol > (0)::numeric) AND (puntos_por_sol <= (100)::numeric) AND (soles_por_100 > (0)::numeric) AND (soles_por_100 <= (1000)::numeric) AND (canje_minimo_puntos >= 100) AND ((canje_minimo_puntos % 100) = 0) AND (canje_minimo_puntos <= 100000) AND (compra_minima_x >= (1)::numeric) AND (compra_minima_x <= (20)::numeric) AND ((vigencia_cupon_dias >= 1) AND (vigencia_cupon_dias <= 90)) AND ((regalo_cumple_puntos >= 0) AND (regalo_cumple_puntos <= 10000)) AND (tope_costo_pct >= (0)::numeric) AND (tope_costo_pct <= (100)::numeric)))`

**De qué depende:** `(creada_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_puntos_movimientos`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clienta_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `puntos` | integer | **no** | — | — |
| `venta_id` | uuid | sí | — | — |
| `anio` | smallint | sí | — | — |
| `referencia` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `de_movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_puntos_mov_anio_del_cumple` — `CHECK ((((tipo = 'cumple'::text) = (anio IS NOT NULL)) AND ((anio IS NULL) OR ((anio >= 2026) AND (anio <= 2200)))))`
- `club_puntos_mov_de_movimiento` — `CHECK (((tipo = ANY (ARRAY['revierte'::text, 'devuelve'::text])) = (de_movimiento_id IS NOT NULL)))`
- `club_puntos_mov_signo` — `CHECK (((puntos <> 0) AND (((tipo = ANY (ARRAY['compra'::text, 'cumple'::text, 'devuelve'::text])) AND (puntos > 0)) OR ((tipo = ANY (ARRAY['canje'::text, 'revierte'::text, 'pierde'::text])) AND (puntos < 0)) OR (tipo = 'ajuste'::text))))`
- `club_puntos_mov_tipo_valido` — `CHECK ((tipo = ANY (ARRAY['compra'::text, 'cumple'::text, 'canje'::text, 'devuelve'::text, 'revierte'::text, 'pierde'::text, 'ajuste'::text])))`
- `club_puntos_mov_tope` — `CHECK ((abs(puntos) <= 10000000))`
- `club_puntos_mov_una_compra_por_venta` *(único parcial)* — `retail.club_puntos_movimientos (venta_id) WHERE (tipo = 'compra'::text)`

**De qué depende:** `(clienta_id) REFERENCES retail.clientas(id)` · `(de_movimiento_id) REFERENCES retail.club_puntos_movimientos(id)` · `(registrado_por) REFERENCES personas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_puntos_saldos`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `clienta_id` | uuid | **no** | — | — |
| `saldo` | integer | **no** | `0` | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `club_puntos_saldo_no_negativo` — `CHECK ((saldo >= 0))`

**De qué depende:** `(clienta_id) REFERENCES retail.clientas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_cupones`

*18 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `codigo` | text | **no** | — | — |
| `clienta_id` | uuid | **no** | — | — |
| `puntos` | integer | **no** | — | — |
| `valor` | numeric | **no** | — | — |
| `compra_minima` | numeric | **no** | — | — |
| `vence_el` | date | **no** | — | — |
| `origen` | text | **no** | — | — |
| `token` | uuid | sí | — | — |
| `canje_movimiento_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'activo'::text` | — |
| `creado_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `usado_en` | timestamp with time zone | sí | — | — |
| `venta_id` | uuid | sí | — | — |
| `usado_por_clienta_id` | uuid | sí | — | — |
| `vencido_en` | timestamp with time zone | sí | — | — |
| `pedido_web_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_cupones_codigo_formato` — `CHECK ((codigo ~ '^CAY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'::text))`
- `club_cupones_estado_coherente` — `CHECK ((((estado = 'usado'::text) = ((usado_en IS NOT NULL) AND (venta_id IS NOT NULL))) AND ((estado = 'vencido'::text) = (vencido_en IS NOT NULL)) AND ((usado_por_clienta_id IS NULL) OR (estado = 'usado'::text)) AND ((estado <> 'reservado'::text) OR (pedido_web_id IS NOT NULL)) AND ((pedido_web_id IS NULL) OR (estado = ANY (ARRAY['reservado'::text, 'usado'::text])))))`
- `club_cupones_estado_valido` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'reservado'::text, 'usado'::text, 'vencido'::text])))`
- `club_cupones_valores` — `CHECK (((puntos >= 100) AND ((puntos % 100) = 0) AND (valor > (0)::numeric) AND (compra_minima >= valor) AND (origen = ANY (ARRAY['web'::text, 'caja'::text]))))`
- `club_cupones_token_unico` *(único parcial)* — `retail.club_cupones (token) WHERE (token IS NOT NULL)`
- `club_cupones_un_cupon_por_pedido` *(único parcial)* — `retail.club_cupones (pedido_web_id) WHERE (pedido_web_id IS NOT NULL)`

**De qué depende:** `(canje_movimiento_id) REFERENCES retail.club_puntos_movimientos(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(creado_por) REFERENCES personas(id)` · `(pedido_web_id) REFERENCES retail.pedidos_web(id)` · `(usado_por_clienta_id) REFERENCES retail.clientas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_cupon_intentos`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `clave` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `club_avisos_textos_sede`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `version` | integer | **no** | — | — |
| `texto` | text | **no** | — | — |
| `vigente_desde` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `club_avisos_textos_sede_con_baja` — `CHECK (((tipo = 'cierre'::text) OR ((POSITION(('{nombre}'::text) IN (texto)) > 0) AND ("right"(texto, 50) = 'Si no quieres recibir más mensajes, responde BAJA.'::text))))`
- `club_avisos_textos_sede_tipo` — `CHECK ((tipo = ANY (ARRAY['cumpleanos'::text, 'puntos'::text, 'novedades'::text, 'rebaja'::text, 'cierre'::text])))`
- `club_avisos_textos_sede_version` — `CHECK ((version >= 1))`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_web_vinculos_google`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `usuario_web_id` | uuid | **no** | — | — |
| `clienta_id` | uuid | **no** | — | — |
| `correo` | text | **no** | — | — |
| `nombre_google` | text | **no** | — | — |
| `nombre_ficha` | text | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `aviso_estado` | text | **no** | `'pendiente'::text` | — |
| `avisado_en` | timestamp with time zone | sí | — | — |
| `avisado_por` | uuid | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `revertido_en` | timestamp with time zone | sí | — | — |
| `revertido_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_web_vinculos_google_aviso_completo` — `CHECK (((aviso_estado = 'enviado'::text) = ((avisado_en IS NOT NULL) AND (avisado_por IS NOT NULL))))`
- `cuentas_web_vinculos_google_aviso_valido` — `CHECK ((aviso_estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'sin_celular'::text])))`
- `cuentas_web_vinculos_google_revertido_completo` — `CHECK (((revertido_en IS NULL) = (revertido_por IS NULL)))`

**De qué depende:** `(avisado_por) REFERENCES personas(id)` · `(clienta_id) REFERENCES retail.clientas(id)` · `(revertido_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 08 · Cuervo — Facturación SUNAT

### `comprobantes`

*41 columnas · ~1329 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el documento legal concreto —boleta, factura o nota— que se emitió y quedó ante SUNAT |
| `venta_id` | uuid | sí | — | qué venta documenta |
| `ubicacion_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | qué documento es: boleta, factura, nota_credito, nota_debito o nota_venta; el check no admite otro |
| `serie` | text | **no** | — | el prefijo impreso (B004, F001) copiado al emitir; si la sede cambia de serie, los viejos no se reescriben |
| `numero` | integer | **no** | — | el correlativo que se llevó esta emisión; irreversible ante SUNAT y único junto con tipo y serie |
| `cliente_tipo_doc` | text | **no** | `'sin_documento'::text` | dni, ruc o sin_documento; en boleta sin documento se transmite el DNI comodín 99999999 |
| `cliente_num_doc` | text | sí | — | el DNI o RUC de la clienta; si el documento es factura, la base lo exige sí o sí |
| `cliente_nombre` | text | sí | — | a nombre de quién sale el documento; si va vacío, Lucode recibe CLIENTE VARIOS |
| `moneda` | text | **no** | `'PEN'::text` | en qué moneda se cobró; por defecto PEN |
| `subtotal` | numeric | **no** | `0` | el valor de venta sin IGV |
| `igv` | numeric | **no** | `0` | el IGV del documento |
| `total` | numeric | **no** | — | lo que paga la clienta con IGV incluido; la base exige que sea mayor que cero |
| `estado` | text | **no** | `'pendiente'::text` | dónde va el documento en su camino a SUNAT: pendiente, enviado, aceptado, rechazado, anulado, no_emitido, pendiente_reintento o interna |
| `motivo_rechazo` | text | sí | — | con qué texto SUNAT o Lucode lo rechazó |
| `respuesta_sunat` | jsonb | sí | — | la respuesta cruda de Lucode —CDR, XML, PDF, hash—, la prueba de lo que realmente pasó |
| `usuario_id` | uuid | sí | — | qué colaborador lo emitió |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se reservó el correlativo |
| `enviado_at` | timestamp with time zone | sí | — | cuándo se intentó transmitir por primera vez; los reintentos quedan en ultimo_intento_transmision_at |
| `comprobante_original_id` | uuid | sí | — | solo notas: qué comprobante aceptado corrige esta nota de crédito o débito |
| `motivo` | text | sí | — | solo notas: por qué se emite la nota de crédito o débito; es obligatorio en ellas |
| `items` | jsonb | sí | — | el desglose de líneas del documento |
| `entorno_transmision` | text | sí | — | sandbox o produccion: impide confundir un aceptado de prueba con uno real ante SUNAT |
| `motivo_anulacion` | text | sí | — | por qué se dio de baja el documento; sin esto no puede quedar anulado |
| `anulacion_solicitada_at` | timestamp with time zone | sí | — | cuándo se pidió la baja |
| `anulado_at` | timestamp with time zone | sí | — | cuándo SUNAT confirmó la baja, no cuándo se pidió |
| `respuesta_anulacion` | jsonb | sí | — | la respuesta cruda del proveedor a la baja, la prueba de que SUNAT la procesó |
| `anulado_por` | uuid | sí | — | qué persona pidió la baja |
| `motivo_no_emitido` | text | sí | — | — |
| `marcado_no_emitido_por` | uuid | sí | — | — |
| `marcado_no_emitido_at` | timestamp with time zone | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `intentos_transmision` | integer | **no** | `0` | — |
| `ultimo_intento_transmision_at` | timestamp with time zone | sí | — | — |
| `ultimo_error_transmision` | text | sí | — | — |
| `proximo_reintento_at` | timestamp with time zone | sí | — | — |
| `separacion_id` | uuid | sí | — | — |
| `es_anticipo` | boolean | **no** | `false` | — |
| `anticipo_deducido` | numeric | **no** | `0` | — |
| `anticipo_comprobante_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_anticipo_coherente` — `CHECK (((anticipo_deducido >= (0)::numeric) AND ((anticipo_deducido > (0)::numeric) = (anticipo_comprobante_id IS NOT NULL)) AND (NOT (es_anticipo AND (anticipo_deducido > (0)::numeric)))))`
- `comprobantes_anulado_tiene_motivo` — `CHECK (((estado <> 'anulado'::text) OR (motivo_anulacion IS NOT NULL)))`
- `comprobantes_carne_pasaporte_formato` — `CHECK (((cliente_tipo_doc <> ALL (ARRAY['carne_extranjeria'::text, 'pasaporte'::text])) OR (COALESCE(cliente_num_doc, ''::text) ~ '^[A-Z0-9]{6,12}$'::text)))`
- `comprobantes_cliente_tipo_doc_check` — `CHECK ((cliente_tipo_doc = ANY (ARRAY['dni'::text, 'ruc'::text, 'carne_extranjeria'::text, 'pasaporte'::text, 'sin_documento'::text])))`
- `comprobantes_entorno_transmision_check` — `CHECK ((entorno_transmision = ANY (ARRAY['sandbox'::text, 'produccion'::text])))`
- `comprobantes_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'aceptado'::text, 'rechazado'::text, 'anulado'::text, 'no_emitido'::text, 'pendiente_reintento'::text, 'interna'::text])))`
- `comprobantes_factura_requiere_ruc` — `CHECK (((tipo <> 'factura'::text) OR ((cliente_tipo_doc = 'ruc'::text) AND (cliente_num_doc IS NOT NULL))))`
- `comprobantes_intentos_transmision_no_negativo` — `CHECK ((intentos_transmision >= 0))`
- `comprobantes_montos_finitos` — `CHECK (((abs(subtotal) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric) AND (abs(total) < 'Infinity'::numeric) AND (abs(anticipo_deducido) < 'Infinity'::numeric)))`
- `comprobantes_no_emitido_tiene_motivo` — `CHECK (((estado <> 'no_emitido'::text) OR (motivo_no_emitido IS NOT NULL)))`
- `comprobantes_nota_requiere_original` — `CHECK (((tipo <> ALL (ARRAY['nota_credito'::text, 'nota_debito'::text])) OR ((comprobante_original_id IS NOT NULL) AND (motivo IS NOT NULL))))`
- `comprobantes_nota_venta_es_interna` — `CHECK ((((tipo = 'nota_venta'::text) = (estado = 'interna'::text)) OR ((tipo = 'nota_venta'::text) AND (estado = 'no_emitido'::text))))`
- `comprobantes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['boleta'::text, 'factura'::text, 'nota_credito'::text, 'nota_debito'::text, 'nota_venta'::text])))`
- `comprobantes_tipo_serie_numero_key` — `UNIQUE (tipo, serie, numero)`
- `comprobantes_token_cliente_key` — `UNIQUE (token_cliente)`
- `comprobantes_total_check` — `CHECK ((total > (0)::numeric))`
- `comprobantes_transmitido_tiene_entorno` — `CHECK (((estado = ANY (ARRAY['pendiente'::text, 'no_emitido'::text, 'pendiente_reintento'::text, 'interna'::text])) OR (entorno_transmision IS NOT NULL))) NOT VALID`

**De qué depende:** `(anticipo_comprobante_id) REFERENCES retail.comprobantes(id)` · `(anulado_por) REFERENCES personas(id)` · `(comprobante_original_id) REFERENCES retail.comprobantes(id)` · `(marcado_no_emitido_por) REFERENCES personas(id)` · `(separacion_id) REFERENCES retail.separaciones(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_select` | SELECT | `(( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona)))` |


### `series_comprobantes`

*8 columnas · ~41 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el contador vivo de una sede para un tipo de documento |
| `ubicacion_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | boleta, factura, nota_credito, nota_debito o nota_venta — cada tipo lleva su propio contador |
| `serie` | text | **no** | — | el prefijo que define CAYLA, no SUNAT (B004, F001) |
| `siguiente_numero` | integer | **no** | `1` | el correlativo que se entregará en la próxima emisión; siempre mayor que cero |
| `archivada_at` | timestamp with time zone | sí | — | — |
| `archivada_por` | uuid | sí | — | — |
| `motivo_archivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `series_comprobantes_archivada_tiene_motivo` — `CHECK (((archivada_at IS NULL) OR (NULLIF(btrim(motivo_archivo), ''::text) IS NOT NULL)))`
- `series_comprobantes_siguiente_numero_check` — `CHECK ((siguiente_numero > 0))`
- `series_comprobantes_tipo_check` — `CHECK ((tipo = ANY (ARRAY['boleta'::text, 'factura'::text, 'nota_credito'::text, 'nota_debito'::text, 'nota_venta'::text])))`
- `series_comprobantes_activa_por_tienda_tipo_y_letra` *(único parcial)* — `retail.series_comprobantes (ubicacion_id, tipo, ( CASE     WHEN (tipo = ANY (ARRAY['nota_credito'::text, 'nota_debito'::text])) THEN "left"(serie, 1)     ELSE ''::text END)) WHERE (archivada_at IS NULL)`

**De qué depende:** `(archivada_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `series_comprobantes_select` | SELECT | `(( SELECT retail.fn_es_lider() AS fn_es_lider) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))` |


### `proformas`

*16 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | La cotización entregada a la clienta, que no es comprobante de pago ante SUNAT |
| `ubicacion_id` | uuid | **no** | — | — |
| `cliente_nombre` | text | sí | — | A quién se le cotizó |
| `cliente_num_doc` | text | sí | — | El DNI o RUC de la clienta |
| `items` | jsonb | **no** | — | Lo cotizado, en JSON |
| `subtotal` | numeric | **no** | `0` | El valor cotizado sin IGV |
| `igv` | numeric | **no** | `0` | El IGV de la cotización |
| `total` | numeric | **no** | — | Lo cotizado con IGV incluido; el check exige mayor a cero, no se cotiza S/0 |
| `estado` | text | **no** | `'vigente'::text` | 'vigente', 'convertida', 'vencida' o 'anulada' |
| `comprobante_id` | uuid | sí | — | Qué boleta o factura nació de esta cotización, cuando se convirtió |
| `usuario_id` | uuid | sí | — | Qué colaborador armó la cotización en el mostrador |
| `created_at` | timestamp with time zone | **no** | `now()` | Cuándo se le dio ese precio a la clienta; ordena la lista de cotizaciones |
| `vence_at` | timestamp with time zone | sí | — | Hasta cuándo vale el precio cotizado |
| `numero` | bigint | **no** | — | — |
| `nota` | text | sí | — | — |
| `venta_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `proformas_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'convertida'::text, 'vencida'::text, 'anulada'::text])))`
- `proformas_montos_finitos` — `CHECK (((abs(subtotal) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric) AND (abs(total) < 'Infinity'::numeric)))`
- `proformas_nota_largo` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 500)))`
- `proformas_numero_unico` — `UNIQUE (numero)`
- `proformas_total_check` — `CHECK ((total > (0)::numeric))`

**De qué depende:** `(comprobante_id) REFERENCES retail.comprobantes(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)` · `(venta_id) REFERENCES retail.ventas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proformas_select` | SELECT | `(( SELECT retail.fn_es_lider() AS fn_es_lider) OR COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))` |


### `configuracion_empresa`

*14 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | boolean | **no** | `true` | candado de fila única: siempre true, porque la empresa que emite es una sola |
| `ruc` | text | **no** | — | el RUC con el que CAYLA emite ante SUNAT |
| `razon_social` | text | **no** | — | el nombre legal de CAYLA que debería encabezar cada comprobante emitido |
| `nombre_comercial` | text | sí | — | la marca con la que la clienta conoce a CAYLA, distinta del nombre legal |
| `email` | text | sí | — | correo de la empresa para enviarle el comprobante a la clienta |
| `web` | text | sí | — | la página de CAYLA que iría en el pie del comprobante |
| `telefono` | text | sí | — | el teléfono de la empresa para el comprobante |
| `resolucion_autorizacion` | text | sí | — | la resolución de SUNAT que autoriza a CAYLA a emitir electrónicamente |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se tocaron por última vez los datos de la empresa emisora |
| `exige_responsable` | boolean | **no** | `false` | — |
| `club_cumple_pct` | numeric | **no** | `10` | — |
| `club_aniversario_compras` | integer | **no** | `6` | — |
| `club_aniversario_monto` | numeric | **no** | `600` | — |
| `club_aniversario_dias` | integer | **no** | `60` | — |

**Candados** — lo que esta tabla hace imposible:

- `configuracion_empresa_club_aniversario_valido` — `CHECK ((((club_aniversario_compras >= 1) AND (club_aniversario_compras <= 100)) AND (club_aniversario_monto > (0)::numeric) AND (club_aniversario_monto <= (100000)::numeric) AND ((club_aniversario_dias >= 1) AND (club_aniversario_dias <= 180))))`
- `configuracion_empresa_club_cumple_pct_valido` — `CHECK (((club_cumple_pct >= (1)::numeric) AND (club_cumple_pct <= (50)::numeric)))`
- `configuracion_empresa_id_check` — `CHECK (id)`
- `configuracion_empresa_montos_finitos` — `CHECK (((abs(club_cumple_pct) < 'Infinity'::numeric) AND (abs(club_aniversario_monto) < 'Infinity'::numeric)))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `configuracion_empresa_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |


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
| `ubicacion_datos_fiscales_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |


### `comprobante_anticipos`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `comprobante_id` | uuid | **no** | — | — |
| `anticipo_comprobante_id` | uuid | **no** | — | — |
| `monto` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobante_anticipos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `comprobante_anticipos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`

**De qué depende:** `(anticipo_comprobante_id) REFERENCES retail.comprobantes(id)` · `(comprobante_id) REFERENCES retail.comprobantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `respaldo_b002_renumeradas_20261002`

*14 columnas · ~32 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `comprobante_id` | uuid | **no** | — | — |
| `serie_vieja` | text | **no** | — | — |
| `numero_viejo` | integer | **no** | — | — |
| `serie_nueva` | text | **no** | — | — |
| `numero_nuevo` | integer | **no** | — | — |
| `estado_viejo` | text | **no** | — | — |
| `entorno_transmision_viejo` | text | sí | — | — |
| `respuesta_sunat_vieja` | jsonb | sí | — | — |
| `motivo_rechazo_viejo` | text | sí | — | — |
| `enviado_at_viejo` | timestamp with time zone | sí | — | — |
| `intentos_transmision_viejo` | integer | sí | — | — |
| `ultimo_error_transmision_viejo` | text | sí | — | — |
| `created_at_comprobante` | timestamp with time zone | **no** | — | — |
| `respaldado_at` | timestamp with time zone | **no** | `now()` | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `respaldo_b001_f001_renumeradas_20261007`

*20 columnas · ~193 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `comprobante_id` | uuid | **no** | — | — |
| `serie_vieja` | text | **no** | — | — |
| `numero_viejo` | integer | **no** | — | — |
| `serie_nueva` | text | **no** | — | — |
| `numero_nuevo` | integer | **no** | — | — |
| `estado_viejo` | text | **no** | — | — |
| `entorno_transmision_viejo` | text | sí | — | — |
| `respuesta_sunat_vieja` | jsonb | sí | — | — |
| `motivo_rechazo_viejo` | text | sí | — | — |
| `enviado_at_viejo` | timestamp with time zone | sí | — | — |
| `intentos_transmision_viejo` | integer | sí | — | — |
| `ultimo_error_transmision_viejo` | text | sí | — | — |
| `created_at_comprobante` | timestamp with time zone | **no** | — | — |
| `respaldado_at` | timestamp with time zone | **no** | `now()` | — |
| `ajuste_posterior` | text | sí | — | — |
| `b005_aceptada_respuesta` | jsonb | sí | — | — |
| `b005_baja_motivo` | text | sí | — | — |
| `b005_baja_solicitada_at` | timestamp with time zone | sí | — | — |
| `b005_baja_respuesta` | jsonb | sí | — | — |
| `b005_baja_pedida_por` | uuid | sí | — | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 09 · Pelícano — Compras y proveedores

### `proveedores`

*17 columnas · ~120 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el proveedor como ficha única para las tres tiendas; lo citan compras, lotes y productos |
| `nombre` | text | **no** | — | con qué nombre se le conoce en la tienda; no puede haber dos fichas con el mismo nombre |
| `ruc` | text | sí | — | su RUC de 11 dígitos, para el comprobante de compra; no se repite entre proveedores |
| `contacto` | text | sí | — | el nombre de la persona con quien se habla para pactar el fardo |
| `activo` | boolean | **no** | `true` | si le seguimos comprando; desactivar archiva la ficha, no la borra |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró al directorio único que reemplazó los tres Excel desincronizados de las tiendas |
| `plazo_credito_dias` | integer | sí | — | — |
| `forma_pago_preferida` | text | sí | — | — |
| `telefono` | text | sí | — | el WhatsApp por el que se cierra la compra, que es como compra CAYLA; desde ADR-0134 ya NO es el destino del Yape |
| `banco` | text | sí | — | en qué banco cobra ese proveedor; visible para cualquiera con cuenta, decisión consciente D-27 |
| `cuenta_bancaria` | text | sí | — | el número de cuenta del banco (depósito o mismo banco); el interbancario vive en `cci`. Dato de un tercero y visible para todos |
| `cci` | text | sí | — | el Código de Cuenta Interbancario (20 dígitos) para transferirle desde otro banco; se guarda solo con números |
| `celular_billetera` | text | sí | — | el celular al que se yapea o se plinea (9 dígitos, sin +51); distinto del WhatsApp de contacto, porque mandar plata al celular equivocado no se revierte |
| `billeteras` | ARRAY | sí | — | en qué app tiene ese celular: Yape, Plin o ambas; va de la mano con el celular (uno sin el otro no puede existir) |
| `titular_cuenta` | text | sí | — | el nombre que muestra el banco o Yape antes de confirmar; quien paga lo compara con este para no equivocarse de destino |
| `rubros` | ARRAY | **no** | `'{}'::text[]` | — |
| `tipo` | text | **no** | `'mercaderia'::text` | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedores_billetera_coherente` — `CHECK (((celular_billetera IS NULL) = (billeteras IS NULL)))`
- `proveedores_billeteras_validas` — `CHECK (((billeteras IS NULL) OR (((cardinality(billeteras) >= 1) AND (cardinality(billeteras) <= 2)) AND (billeteras <@ ARRAY['yape'::text, 'plin'::text]))))`
- `proveedores_cci_formato` — `CHECK (((cci IS NULL) OR (cci ~ '^[0-9]{20}$'::text)))`
- `proveedores_celular_billetera_formato` — `CHECK (((celular_billetera IS NULL) OR (celular_billetera ~ '^9[0-9]{8}$'::text)))`
- `proveedores_forma_pago_valida` — `CHECK (((forma_pago_preferida IS NULL) OR (forma_pago_preferida = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'otro'::text]))))`
- `proveedores_plazo_credito_positivo` — `CHECK (((plazo_credito_dias IS NULL) OR (plazo_credito_dias > 0)))`
- `proveedores_rubros_limpios` — `CHECK ((rubros = retail.fn_rubros_limpios(rubros)))`
- `proveedores_ruc_check` — `CHECK (((ruc IS NULL) OR (ruc ~ '^[0-9]{11}$'::text)))`
- `proveedores_textos_con_tope` — `CHECK ((char_length(nombre) <= 120))`
- `proveedores_tipo_valido` — `CHECK ((tipo = ANY (ARRAY['mercaderia'::text, 'servicios'::text])))`
- `proveedores_titular_largo` — `CHECK (((titular_cuenta IS NULL) OR ((char_length(titular_cuenta) >= 2) AND (char_length(titular_cuenta) <= 120))))`
- `proveedores_ruc_unico` *(único parcial)* — `retail.proveedores (ruc) WHERE (ruc IS NOT NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedores_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `proveedores_write` | ALL | `( SELECT retail.fn_puede_gestionar_proveedores() AS fn_puede_gestionar_proveedores)` |


### `compras`

*33 columnas · ~9 filas · permisos por fila **activos***

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
| `ubicacion_gestion_id` | uuid | sí | — | — |
| `anulada_por` | uuid | sí | — | — |
| `anulada_at` | timestamp with time zone | sí | — | — |
| `naturaleza` | text | **no** | `'mercaderia'::text` | — |
| `orden_compra_id` | uuid | sí | — | — |
| `huella_envio` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compras_cerrado_cantidad_check` — `CHECK ((cerrado_cantidad >= 0))`
- `compras_condicion_check` — `CHECK ((condicion = ANY (ARRAY['contado'::text, 'credito'::text])))`
- `compras_credito_tiene_vencimiento` — `CHECK (((condicion = 'contado'::text) OR (fecha_vencimiento IS NOT NULL)))`
- `compras_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulada'::text])))`
- `compras_facturado_cantidad_check` — `CHECK ((facturado_cantidad >= 0))`
- `compras_gestora_obligatoria` — `CHECK (((estado <> 'vigente'::text) OR (ubicacion_gestion_id IS NOT NULL) OR (naturaleza <> 'mercaderia'::text)))`
- `compras_honorarios_solo_gasto` — `CHECK (((tipo <> 'recibo_por_honorarios'::text) OR (naturaleza <> 'mercaderia'::text)))`
- `compras_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `compras_igv_solo_factura` — `CHECK (((tipo = 'factura'::text) OR (igv = (0)::numeric)))`
- `compras_montos_finitos` — `CHECK (((abs(subtotal) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric) AND (abs(total) < 'Infinity'::numeric) AND (abs(pagado) < 'Infinity'::numeric) AND (abs(notas_credito) < 'Infinity'::numeric) AND (abs(saldo) < 'Infinity'::numeric)))`
- `compras_naturaleza_check` — `CHECK ((naturaleza = ANY (ARRAY['mercaderia'::text, 'gasto'::text, 'activo'::text])))`
- `compras_no_mercaderia_sin_unidades` — `CHECK (((naturaleza = 'mercaderia'::text) OR ((facturado_cantidad = 0) AND (recibido_cantidad = 0) AND (cerrado_cantidad = 0))))`
- `compras_no_sobrepagada` — `CHECK (((pagado + notas_credito) <= total))`
- `compras_no_sobrerecibida` — `CHECK (((recibido_cantidad + cerrado_cantidad) <= facturado_cantidad))`
- `compras_notas_credito_check` — `CHECK ((notas_credito >= (0)::numeric))`
- `compras_pagado_check` — `CHECK ((pagado >= (0)::numeric))`
- `compras_recibido_cantidad_check` — `CHECK ((recibido_cantidad >= 0))`
- `compras_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `compras_tipo_check` — `CHECK ((tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'nota_venta'::text, 'recibo_por_honorarios'::text, 'sin_comprobante'::text])))`
- `compras_total_check` — `CHECK ((total >= (0)::numeric))`
- `compras_total_cuadra` — `CHECK ((total = (subtotal + igv)))`
- `compras_vence_despues_de_emitir` — `CHECK (((fecha_vencimiento IS NULL) OR (fecha_emision IS NULL) OR (fecha_vencimiento >= fecha_emision)))`
- `compras_papel_vigente_unico` *(único parcial)* — `retail.compras (proveedor_id, serie, numero) WHERE (estado = 'vigente'::text)`

**De qué depende:** `(anulada_por) REFERENCES personas(id)` · `(orden_compra_id) REFERENCES retail.ordenes_compra(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_gestion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compras_select` | SELECT | `( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras)` |


### `compra_items`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_id` | uuid | **no** | — | — |
| `producto_id` | uuid | sí | — | — |
| `variante_id` | uuid | sí | — | — |
| `descripcion` | text | sí | — | — |
| `cantidad` | integer | **no** | — | — |
| `costo_unitario` | numeric | **no** | — | — |
| `subtotal` | numeric | sí | — | — |
| `categoria_id` | uuid | sí | — | — |
| `marca_id` | uuid | sí | — | — |
| `orden_compra_item_id` | uuid | sí | — | — |
| `precio_venta_sugerido` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `compra_items_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `compra_items_montos_finitos` — `CHECK (((abs(costo_unitario) < 'Infinity'::numeric) AND (abs(subtotal) < 'Infinity'::numeric) AND (abs(precio_venta_sugerido) < 'Infinity'::numeric)))`
- `compra_items_precio_venta_sugerido_check` — `CHECK (((precio_venta_sugerido IS NULL) OR (precio_venta_sugerido >= (0)::numeric)))`
- `compra_items_prenda_o_categoria_marca` — `CHECK (((producto_id IS NOT NULL) OR ((categoria_id IS NOT NULL) AND (marca_id IS NOT NULL))))`
- `compra_items_variante_con_prenda` — `CHECK (((variante_id IS NULL) OR (producto_id IS NOT NULL)))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(orden_compra_item_id) REFERENCES retail.orden_compra_items(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_items_select` | SELECT | `( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras)` |


### `compra_pagos`

*12 columnas · ~9 filas · permisos por fila **activos***

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
| `ubicacion_id` | uuid | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'tarjeta'::text, 'otro'::text, 'saldo_a_favor'::text])))`
- `compra_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `compra_pagos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `compra_pagos_egreso_uq` *(único parcial)* — `retail.compra_pagos (caja_movimiento_id) WHERE (caja_movimiento_id IS NOT NULL)`

**De qué depende:** `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_pagos_select` | SELECT | `( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras)` |


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
- `compra_adjuntos_ruta_un_archivo` — `CHECK ((ruta ~ (('^'::text \|\| (compra_id)::text) \|\| '/[A-Za-z0-9._-]{1,200}$'::text)))`
- `compra_adjuntos_tamano_maximo` — `CHECK ((bytes <= ((10 * 1024) * 1024)))`
- `compra_adjuntos_textos_con_tope` — `CHECK (((char_length(nombre) <= 255) AND (char_length(ruta) <= 300)))`
- `compra_adjuntos_tipo_permitido` — `CHECK ((tipo = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text, 'image/heif'::text])))`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(nota_credito_id, compra_id) REFERENCES retail.compra_notas_credito(id, compra_id)` · `(subido_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_adjuntos_select` | SELECT | `( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras)` |


### `compras_resumen` *(vista)*

*33 columnas*

*El volcado de producción no trae la definición de esta vista.*

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
| `naturaleza` | text | sí | — | — |


### `compra_items_resumen` *(vista)*

*13 columnas*

*El volcado de producción no trae la definición de esta vista.*

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
| `categoria_id` | uuid | sí | — | — |
| `marca_id` | uuid | sí | — | — |


### `planes_compra`

*20 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `desde` | date | **no** | — | — |
| `hasta` | date | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `tope_inversion` | numeric | sí | — | — |
| `tope_actualizado_por` | uuid | sí | — | — |
| `tope_actualizado_en` | timestamp with time zone | sí | — | — |
| `etiqueta_id` | uuid | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `editado_por` | uuid | sí | — | — |
| `editado_en` | timestamp with time zone | sí | — | — |
| `archivado_por` | uuid | sí | — | — |
| `archivado_en` | timestamp with time zone | sí | — | — |
| `recupero_defecto_pct` | integer | sí | — | — |
| `recupero_actualizado_por` | uuid | sí | — | — |
| `recupero_actualizado_en` | timestamp with time zone | sí | — | — |
| `dias_para_llegar` | integer | sí | — | — |
| `plazo_actualizado_por` | uuid | sí | — | — |
| `plazo_actualizado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `planes_compra_archivado_con_autor` — `CHECK (((archivado_en IS NULL) = (archivado_por IS NULL)))`
- `planes_compra_editado_con_autor` — `CHECK (((editado_en IS NULL) = (editado_por IS NULL)))`
- `planes_compra_fechas` — `CHECK ((hasta >= desde))`
- `planes_compra_montos_finitos` — `CHECK ((abs(tope_inversion) < 'Infinity'::numeric))`
- `planes_compra_nombre_check` — `CHECK ((btrim(nombre) <> ''::text))`
- `planes_compra_nombre_key` — `UNIQUE (nombre)`
- `planes_compra_plazo_con_autor` — `CHECK (((dias_para_llegar IS NULL) OR ((plazo_actualizado_por IS NOT NULL) AND (plazo_actualizado_en IS NOT NULL))))`
- `planes_compra_plazo_rango` — `CHECK (((dias_para_llegar IS NULL) OR ((dias_para_llegar >= 1) AND (dias_para_llegar <= 365))))`
- `planes_compra_recupero_con_autor` — `CHECK (((recupero_defecto_pct IS NULL) OR ((recupero_actualizado_por IS NOT NULL) AND (recupero_actualizado_en IS NOT NULL))))`
- `planes_compra_recupero_defecto_pct_check` — `CHECK (((recupero_defecto_pct IS NULL) OR ((recupero_defecto_pct >= 0) AND (recupero_defecto_pct <= 100))))`
- `planes_compra_tope_con_autor` — `CHECK (((tope_inversion IS NULL) OR ((tope_actualizado_por IS NOT NULL) AND (tope_actualizado_en IS NOT NULL))))`
- `planes_compra_tope_inversion_check` — `CHECK (((tope_inversion IS NULL) OR (tope_inversion > (0)::numeric)))`
- `planes_compra_una_por_etiqueta_y_anio` *(único parcial)* — `retail.planes_compra (etiqueta_id, ((EXTRACT(year FROM hasta))::integer)) WHERE (etiqueta_id IS NOT NULL)`

**De qué depende:** `(archivado_por) REFERENCES personas(id)` · `(creado_por) REFERENCES personas(id)` · `(editado_por) REFERENCES personas(id)` · `(etiqueta_id) REFERENCES retail.etiquetas(id)` · `(plazo_actualizado_por) REFERENCES personas(id)` · `(recupero_actualizado_por) REFERENCES personas(id)` · `(tope_actualizado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `planes_compra_lineas`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `plan_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `flojo` | integer | **no** | — | — |
| `normal` | integer | **no** | — | — |
| `bueno` | integer | **no** | — | — |
| `precio` | numeric | **no** | — | — |
| `costo` | numeric | **no** | — | — |
| `recupero_pct` | integer | **no** | — | — |
| `curva` | jsonb | **no** | `'{}'::jsonb` | — |
| `nota` | text | sí | — | — |
| `actualizado_por` | uuid | **no** | — | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `version` | integer | **no** | `1` | — |
| `descuento_pct` | numeric | **no** | `0` | — |

**Candados** — lo que esta tabla hace imposible:

- `planes_compra_lineas_costo_check` — `CHECK ((costo >= (0)::numeric))`
- `planes_compra_lineas_curva_check` — `CHECK ((jsonb_typeof(curva) = 'object'::text))`
- `planes_compra_lineas_descuento_rango` — `CHECK (((descuento_pct >= (0)::numeric) AND (descuento_pct < (100)::numeric)))`
- `planes_compra_lineas_escenarios` — `CHECK (((flojo <= normal) AND (normal <= bueno)))`
- `planes_compra_lineas_flojo_check` — `CHECK ((flojo >= 0))`
- `planes_compra_lineas_margen` — `CHECK ((costo < precio))`
- `planes_compra_lineas_montos_finitos` — `CHECK (((abs(precio) < 'Infinity'::numeric) AND (abs(costo) < 'Infinity'::numeric)))`
- `planes_compra_lineas_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `planes_compra_lineas_precio_check` — `CHECK ((precio > (0)::numeric))`
- `planes_compra_lineas_recupero_pct_check` — `CHECK (((recupero_pct >= 0) AND (recupero_pct <= 100)))`
- `planes_compra_lineas_una_por_categoria` — `UNIQUE (plan_id, categoria_id)`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(categoria_id) REFERENCES retail.categorias(id)` · `(plan_id) REFERENCES retail.planes_compra(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `planes_compra_reparto`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `plan_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `minimo_pct` | integer | sí | — | — |
| `actualizado_por` | uuid | **no** | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `planes_compra_reparto_minimo_pct_check` — `CHECK (((minimo_pct IS NULL) OR ((minimo_pct >= 1) AND (minimo_pct <= 90))))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(plan_id) REFERENCES retail.planes_compra(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ventas_historicas`

*5 columnas · ~3901 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `ubicacion_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `soles` | numeric | **no** | — | — |
| `fuente` | text | **no** | — | — |
| `cargado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `ventas_historicas_fuente_check` — `CHECK ((btrim(fuente) <> ''::text))`
- `ventas_historicas_montos_finitos` — `CHECK ((abs(soles) < 'Infinity'::numeric))`
- `ventas_historicas_soles_check` — `CHECK ((soles >= (0)::numeric))`

**De qué depende:** `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `ordenes_compra`

*17 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la orden de compra por dentro; la persona la reconoce por `numero`, que es correlativo y único |
| `numero` | integer | **no** | `nextval('retail.ordenes_compra_numero_seq'::regclass)` | — |
| `proveedor_id` | uuid | **no** | — | a qué proveedor del directorio se le hace el pedido; es obligatorio, no admite un nombre suelto |
| `ubicacion_destino_id` | uuid | sí | — | — |
| `fecha_emision` | date | **no** | `retail.fn_hoy_lima()` | — |
| `fecha_entrega_estimada` | date | sí | — | — |
| `estado` | text | **no** | `'generada'::text` | generada o anulada; una anulada exige quién, cuándo y por qué, y una generada no puede traer esos tres datos |
| `nota` | text | sí | — | texto libre del pedido; si se escribe no puede ir en blanco |
| `creada_por` | uuid | **no** | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizada_por` | uuid | sí | — | — |
| `actualizada_en` | timestamp with time zone | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `anulada_por` | uuid | sí | — | — |
| `anulada_en` | timestamp with time zone | sí | — | — |
| `motivo_anulacion` | text | sí | — | — |
| `papel_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ordenes_compra_anulacion` — `CHECK ( CASE     WHEN (estado = 'anulada'::text) THEN ((anulada_por IS NOT NULL) AND (anulada_en IS NOT NULL) AND (COALESCE(btrim(motivo_anulacion), ''::text) <> ''::text))     ELSE ((anulada_por IS NULL) AND (anulada_en IS NULL) AND (motivo_anulacion IS NULL)) END)`
- `ordenes_compra_entrega` — `CHECK (((fecha_entrega_estimada IS NULL) OR (fecha_entrega_estimada >= fecha_emision)))`
- `ordenes_compra_estado` — `CHECK ((estado = ANY (ARRAY['generada'::text, 'anulada'::text])))`
- `ordenes_compra_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `ordenes_compra_numero_unico` — `UNIQUE (numero)`
- `ordenes_compra_version_check` — `CHECK ((version > 0))`

**De qué depende:** `(actualizada_por) REFERENCES personas(id)` · `(anulada_por) REFERENCES personas(id)` · `(creada_por) REFERENCES personas(id)` · `(papel_id) REFERENCES retail.compra_papeles(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `orden_compra_items`

*14 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `orden_compra_id` | uuid | **no** | — | — |
| `posicion` | integer | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `marca_id` | uuid | **no** | — | — |
| `descripcion` | text | sí | — | — |
| `cantidad` | integer | **no** | — | — |
| `precio_unitario` | numeric | **no** | — | — |
| `descuento` | numeric | **no** | `0` | — |
| `descuento_pct` | numeric | sí | — | — |
| `subtotal` | numeric | sí | — | — |
| `precio_venta_sugerido` | numeric | sí | — | — |
| `sugerido_motivos` | ARRAY | sí | — | — |
| `producto_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `orden_compra_items_cantidad_check` — `CHECK ((cantidad > 0))`
- `orden_compra_items_descripcion_check` — `CHECK (((descripcion IS NULL) OR (btrim(descripcion) <> ''::text)))`
- `orden_compra_items_descuento_check` — `CHECK ((descuento >= (0)::numeric))`
- `orden_compra_items_descuento_cuadra` — `CHECK (((descuento_pct IS NULL) OR (descuento = round(((((cantidad)::numeric * precio_unitario) * descuento_pct) / (100)::numeric), 2))))`
- `orden_compra_items_descuento_pct_check` — `CHECK (((descuento_pct IS NULL) OR ((descuento_pct >= (0)::numeric) AND (descuento_pct <= (100)::numeric))))`
- `orden_compra_items_descuento_tope` — `CHECK ((descuento <= ((cantidad)::numeric * precio_unitario)))`
- `orden_compra_items_montos_finitos` — `CHECK (((abs(precio_unitario) < 'Infinity'::numeric) AND (abs(descuento) < 'Infinity'::numeric) AND (abs(descuento_pct) < 'Infinity'::numeric) AND (abs(subtotal) < 'Infinity'::numeric)))`
- `orden_compra_items_posicion_check` — `CHECK ((posicion > 0))`
- `orden_compra_items_posicion_unica` — `UNIQUE (orden_compra_id, posicion)`
- `orden_compra_items_precio_unitario_check` — `CHECK ((precio_unitario >= (0)::numeric))`
- `orden_compra_items_sugerido_motivos` — `CHECK (((sugerido_motivos IS NULL) OR ((precio_venta_sugerido IS NOT NULL) AND ((cardinality(sugerido_motivos) >= 1) AND (cardinality(sugerido_motivos) <= 8)) AND (length(array_to_string(sugerido_motivos, '\|'::text)) <= 520))))`
- `orden_compra_items_sugerido_tope` — `CHECK (((precio_venta_sugerido IS NULL) OR ((precio_venta_sugerido >= (0)::numeric) AND (precio_venta_sugerido <= (5000)::numeric))))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(orden_compra_id) REFERENCES retail.ordenes_compra(id)` · `(producto_id) REFERENCES retail.productos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `orden_compra_versiones`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `orden_compra_id` | uuid | **no** | — | — |
| `version` | integer | **no** | — | — |
| `datos` | jsonb | **no** | — | — |
| `reemplazada_por` | uuid | sí | — | — |
| `reemplazada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `orden_compra_versiones_unica` — `UNIQUE (orden_compra_id, version)`

**De qué depende:** `(orden_compra_id) REFERENCES retail.ordenes_compra(id)` · `(reemplazada_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_diferencias`

*16 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `despacho_id` | uuid | **no** | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `extra_posicion` | integer | sí | — | — |
| `proveedor_id` | uuid | **no** | — | — |
| `categoria_id` | uuid | **no** | — | — |
| `marca_id` | uuid | sí | — | — |
| `tipo` | text | **no** | — | — |
| `causa` | text | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `costo_unitario` | numeric | **no** | — | — |
| `nota` | text | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `vigente` | boolean | **no** | `true` | — |
| `prenda_danada_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `despacho_diferencias_cantidad_check` — `CHECK ((cantidad > 0))`
- `despacho_diferencias_causa` — `CHECK ((((tipo = 'faltante'::text) AND (causa = ANY (ARRAY['no_vino'::text, 'se_perdio'::text, 'otra_sede'::text, 'devuelta'::text]))) OR ((tipo = 'sobrante'::text) AND (causa = ANY (ARRAY['regalo'::text, 'cobra_aparte'::text, 'proxima_compra'::text, 'reposicion_faltante'::text])))))`
- `despacho_diferencias_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `despacho_diferencias_devuelta_con_su_prenda` — `CHECK (((causa = 'devuelta'::text) = (prenda_danada_id IS NOT NULL)))`
- `despacho_diferencias_extra_posicion_check` — `CHECK (((extra_posicion IS NULL) OR (extra_posicion > 0)))`
- `despacho_diferencias_faltante_de_la_guia` — `CHECK (((tipo = 'sobrante'::text) OR (despacho_item_id IS NOT NULL)))`
- `despacho_diferencias_linea_o_extra` — `CHECK (((despacho_item_id IS NULL) <> (extra_posicion IS NULL)))`
- `despacho_diferencias_montos_finitos` — `CHECK ((abs(costo_unitario) < 'Infinity'::numeric))`
- `despacho_diferencias_nota_check` — `CHECK (((nota IS NULL) OR ((btrim(nota) <> ''::text) AND (length(nota) <= 300))))`
- `despacho_diferencias_tipo` — `CHECK ((tipo = ANY (ARRAY['faltante'::text, 'sobrante'::text])))`
- `despacho_diferencias_extra_vigente_unica` *(único parcial)* — `retail.despacho_diferencias (despacho_id, extra_posicion) WHERE ((extra_posicion IS NOT NULL) AND vigente)`
- `despacho_diferencias_linea_vigente_unica` *(único parcial)* — `retail.despacho_diferencias (despacho_id, despacho_item_id) WHERE ((despacho_item_id IS NOT NULL) AND vigente AND (causa <> 'devuelta'::text))`
- `despacho_diferencias_una_por_prenda` *(único parcial)* — `retail.despacho_diferencias (prenda_danada_id) WHERE (prenda_danada_id IS NOT NULL)`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(creado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(despacho_item_id) REFERENCES retail.despacho_items(id)` · `(marca_id) REFERENCES retail.marcas(id)` · `(prenda_danada_id) REFERENCES retail.prendas_danadas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `proveedor_deuda_resoluciones`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `diferencia_id` | uuid | **no** | — | — |
| `forma` | text | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `despacho_id` | uuid | sí | — | — |
| `sobrante_id` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `huella` | text | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `nota_credito_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedor_deuda_resoluciones_cantidad_check` — `CHECK ((cantidad > 0))`
- `proveedor_deuda_resoluciones_con_plata` — `CHECK (((forma = ANY (ARRAY['saldo_a_favor'::text, 'deposito'::text])) = (nota_credito_id IS NOT NULL)))`
- `proveedor_deuda_resoluciones_forma` — `CHECK ((forma = ANY (ARRAY['repuesta'::text, 'saldo_a_favor'::text, 'deposito'::text])))`
- `proveedor_deuda_resoluciones_nota` — `CHECK (((nota IS NULL) OR ((btrim(nota) <> ''::text) AND (length(nota) <= 300))))`
- `proveedor_deuda_resoluciones_recepcion` — `CHECK ((((despacho_id IS NULL) = (sobrante_id IS NULL)) AND ((despacho_id IS NULL) OR (forma = 'repuesta'::text))))`
- `proveedor_deuda_resoluciones_token_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(despacho_id) REFERENCES retail.despachos(id)` · `(diferencia_id) REFERENCES retail.despacho_diferencias(id)` · `(nota_credito_id) REFERENCES retail.compra_notas_credito(id)` · `(sobrante_id) REFERENCES retail.despacho_diferencias(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `despacho_diferencias_vigentes` *(vista)*

*16 columnas*

*El volcado de producción no trae la definición de esta vista.*

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | — |
| `despacho_id` | uuid | sí | — | — |
| `despacho_item_id` | uuid | sí | — | — |
| `extra_posicion` | integer | sí | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `categoria_id` | uuid | sí | — | — |
| `marca_id` | uuid | sí | — | — |
| `tipo` | text | sí | — | — |
| `causa` | text | sí | — | — |
| `cantidad` | integer | sí | — | — |
| `costo_unitario` | numeric | sí | — | — |
| `nota` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | sí | — | — |
| `vigente` | boolean | sí | — | — |
| `prenda_danada_id` | uuid | sí | — | — |


### `compra_parte_por_tienda` *(vista)*

*6 columnas*

*El volcado de producción no trae la definición de esta vista.*

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `compra_id` | uuid | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `unidades` | integer | sí | — | — |
| `subtotal` | numeric | sí | — | — |
| `igv` | numeric | sí | — | — |
| `total` | numeric | sí | — | — |


### `compradores_de_tienda`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `agregado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(agregado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compradores_de_tienda_select` | SELECT | `(( SELECT retail.fn_es_lider() AS fn_es_lider) OR (persona_id = ( SELECT retail.fn_actor_persona_id(false) AS fn_actor_persona_id)))` |


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
| `compra_item_cierres_select` | SELECT | `(( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras) OR COALESCE((ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona)), false))` |


### `compra_notas_credito`

*14 columnas · ~0 filas · permisos por fila **activos***

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
| `interna` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_notas_credito_aplicado_valido` — `CHECK (((aplicado >= (0)::numeric) AND (aplicado <= monto)))`
- `compra_notas_credito_compra_id_serie_numero_key` — `UNIQUE (compra_id, serie_numero)`
- `compra_notas_credito_id_compra_key` — `UNIQUE (id, compra_id)`
- `compra_notas_credito_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `compra_notas_credito_interna_serie` — `CHECK ((interna = (serie_numero ~~ 'DI-%'::text)))`
- `compra_notas_credito_monto_check` — `CHECK ((monto > (0)::numeric))`
- `compra_notas_credito_monto_cuadra` — `CHECK ((monto = (subtotal + igv)))`
- `compra_notas_credito_montos_finitos` — `CHECK (((abs(subtotal) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric) AND (abs(monto) < 'Infinity'::numeric) AND (abs(aplicado) < 'Infinity'::numeric)))`
- `compra_notas_credito_motivo_check` — `CHECK ((motivo = ANY (ARRAY['faltante'::text, 'devolucion'::text, 'descuento'::text, 'otro'::text])))`
- `compra_notas_credito_serie_numero_check` — `CHECK ((btrim(serie_numero) <> ''::text))`
- `compra_notas_credito_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `compra_notas_credito_faltante_unica` *(único parcial)* — `retail.compra_notas_credito (compra_id) WHERE ((motivo = 'faltante'::text) AND (NOT interna))`

**De qué depende:** `(cierre_id) REFERENCES retail.compra_item_cierres(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `compra_notas_credito_select` | SELECT | `( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras)` |


### `proveedor_creditos`

*15 columnas · ~0 filas · permisos por fila **activos***

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
| `cuenta_dinero_id` | uuid | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedor_creditos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `proveedor_creditos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `proveedor_creditos_origen` — `CHECK ((((tipo = 'nota_credito'::text) AND (nota_credito_id IS NOT NULL)) OR ((tipo = 'aplicacion'::text) AND (compra_pago_id IS NOT NULL)) OR ((tipo = 'reembolso'::text) AND (metodo IS NOT NULL))))`
- `proveedor_creditos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['nota_credito'::text, 'aplicacion'::text, 'reembolso'::text])))`

**De qué depende:** `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(compra_pago_id) REFERENCES retail.compra_pagos(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(nota_credito_id) REFERENCES retail.compra_notas_credito(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedor_creditos_select` | SELECT | `( SELECT retail.fn_puede_registrar_compras() AS fn_puede_registrar_compras)` |


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
| `compra_item_destinos_select` | SELECT | `(( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras) OR COALESCE((ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona)), false))` |


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
| `compra_reasignaciones_select` | SELECT | `(( SELECT retail.fn_puede_ver_dinero_de_compras() AS fn_puede_ver_dinero_de_compras) OR COALESCE((desde_ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona)), false) OR COALESCE((hacia_ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona)), false))` |


### `compra_item_reparto_resumen` *(vista)*

*7 columnas*

*El volcado de producción no trae la definición de esta vista.*

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `compra_item_id` | uuid | sí | — | — |
| `compra_id` | uuid | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `asignado` | integer | sí | — | — |
| `recibido` | bigint | sí | — | — |
| `cerrado` | bigint | sí | — | — |
| `pendiente` | bigint | sí | — | — |


### `compra_notas_proveedor`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_id` | uuid | **no** | — | — |
| `serie_numero` | text | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `subtotal` | numeric | **no** | — | — |
| `igv` | numeric | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `usuario_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `huella` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_notas_proveedor_cifras` — `CHECK (((igv > (0)::numeric) AND (subtotal >= (0)::numeric) AND (monto = (subtotal + igv))))`
- `compra_notas_proveedor_montos_finitos` — `CHECK (((abs(subtotal) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric) AND (abs(monto) < 'Infinity'::numeric)))`
- `compra_notas_proveedor_serie` — `CHECK (((serie_numero = upper(btrim(serie_numero))) AND (serie_numero <> ''::text) AND (serie_numero !~~ 'DI-%'::text) AND (length(serie_numero) <= 30)))`
- `compra_notas_proveedor_serie_unica` — `UNIQUE (compra_id, serie_numero)`
- `compra_notas_proveedor_token` *(único parcial)* — `retail.compra_notas_proveedor (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(compra_id) REFERENCES retail.compras(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `compra_notas_proveedor_documentos`

*2 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `nota_proveedor_id` | uuid | **no** | — | — |
| `nota_credito_id` | uuid | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_notas_proveedor_documentos_una` — `UNIQUE (nota_credito_id)`

**De qué depende:** `(nota_credito_id) REFERENCES retail.compra_notas_credito(id)` · `(nota_proveedor_id) REFERENCES retail.compra_notas_proveedor(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `proveedores_cambios_bancarios`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `proveedor_id` | uuid | **no** | — | — |
| `campo` | text | **no** | — | — |
| `antes` | text | sí | — | — |
| `despues` | text | sí | — | — |
| `cambiado_por` | uuid | sí | — | — |
| `cambiado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedores_cambios_bancarios_cambio_real` — `CHECK ((antes IS DISTINCT FROM despues))`
- `proveedores_cambios_bancarios_campo_check` — `CHECK ((campo = ANY (ARRAY['banco'::text, 'cuenta_bancaria'::text, 'cci'::text, 'celular_billetera'::text, 'billeteras'::text, 'titular_cuenta'::text])))`

**De qué depende:** `(proveedor_id) REFERENCES retail.proveedores(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `compra_papeles`

*14 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `proveedor_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `foto_ruta` | text | sí | — | — |
| `fecha` | date | **no** | — | — |
| `estado` | text | **no** | `'por_completar'::text` | — |
| `huella` | text | **no** | — | — |
| `registrado_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `pagado` | numeric | **no** | — | — |
| `medio_pago` | text | sí | — | — |
| `ronda_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_papeles_estado_check` — `CHECK ((estado = ANY (ARRAY['por_completar'::text, 'completado'::text, 'anulado'::text])))`
- `compra_papeles_foto_ruta_check` — `CHECK (((foto_ruta IS NULL) OR ((foto_ruta ~~ 'papeles/%'::text) AND (char_length(foto_ruta) <= 300))))`
- `compra_papeles_medio_pago` — `CHECK ((((pagado = (0)::numeric) AND (medio_pago IS NULL)) OR ((pagado > (0)::numeric) AND (medio_pago = ANY (ARRAY['yape'::text, 'efectivo'::text, 'transferencia'::text])))))`
- `compra_papeles_monto_check` — `CHECK (((monto > (0)::numeric) AND (monto <= (1000000)::numeric)))`
- `compra_papeles_pagado_rango` — `CHECK (((pagado >= (0)::numeric) AND (pagado <= monto)))`
- `compra_papeles_tipo_check` — `CHECK ((tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'nota_venta'::text, 'sin_comprobante'::text])))`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(registrado_por) REFERENCES personas(id)` · `(ronda_id) REFERENCES retail.compra_rondas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `compra_gastos`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `concepto` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `monto` | numeric | **no** | — | — |
| `foto_ruta` | text | sí | — | — |
| `fecha` | date | **no** | — | — |
| `estado` | text | **no** | `'por_completar'::text` | — |
| `huella` | text | **no** | — | — |
| `registrado_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `ronda_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_gastos_concepto_check` — `CHECK ((concepto = ANY (ARRAY['taxi'::text, 'cargador'::text, 'comida'::text, 'envio'::text, 'bolsas'::text, 'otro'::text])))`
- `compra_gastos_estado_check` — `CHECK ((estado = ANY (ARRAY['por_completar'::text, 'completado'::text, 'anulado'::text])))`
- `compra_gastos_foto_ruta_check` — `CHECK (((foto_ruta IS NULL) OR ((foto_ruta ~~ 'gastos/%'::text) AND (char_length(foto_ruta) <= 300))))`
- `compra_gastos_monto_check` — `CHECK (((monto > (0)::numeric) AND (monto <= (100000)::numeric)))`
- `compra_gastos_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 120)))`
- `compra_gastos_otro_dice_que` — `CHECK (((concepto <> 'otro'::text) OR (NULLIF(btrim(COALESCE(nota, ''::text)), ''::text) IS NOT NULL)))`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(registrado_por) REFERENCES personas(id)` · `(ronda_id) REFERENCES retail.compra_rondas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `compra_cierres`

*10 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `decision` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `resuelto_en` | timestamp with time zone | sí | — | — |
| `resuelto_por` | uuid | sí | — | — |
| `cerrado_por` | uuid | **no** | — | — |
| `cerrado_en` | timestamp with time zone | **no** | `now()` | — |
| `ronda_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_cierres_decision_check` — `CHECK ((decision = ANY (ARRAY['se_queda'::text, 'devuelve'::text, 'le_deben'::text])))`
- `compra_cierres_monto_check` — `CHECK ((monto >= (0)::numeric))`
- `compra_cierres_queda_sin_resolver` — `CHECK (((decision <> 'se_queda'::text) OR (resuelto_en IS NULL)))`
- `compra_cierres_ronda_id_key` — `UNIQUE (ronda_id)`

**De qué depende:** `(cerrado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(resuelto_por) REFERENCES personas(id)` · `(ronda_id) REFERENCES retail.compra_rondas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `compra_item_recibido_antes`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `compra_item_id` | uuid | **no** | — | — |
| `despacho_recibido_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_item_recibido_antes_cantidad_check` — `CHECK ((cantidad > 0))`
- `compra_item_recibido_antes_compra_item_id_despacho_recibido_key` — `UNIQUE (compra_item_id, despacho_recibido_id)`

**De qué depende:** `(compra_item_id) REFERENCES retail.compra_items(id)` · `(creado_por) REFERENCES personas(id)` · `(despacho_recibido_id) REFERENCES retail.despacho_recibidos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `fondo_plata_anotada`

*17 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `medio` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `foto_ruta` | text | sí | — | — |
| `fecha` | date | **no** | — | — |
| `estado` | text | **no** | `'por_confirmar'::text` | — |
| `monto_confirmado` | numeric | sí | — | — |
| `cuenta_origen_id` | uuid | sí | — | — |
| `movimiento_id` | uuid | sí | — | — |
| `confirmada_por` | uuid | sí | — | — |
| `confirmada_en` | timestamp with time zone | sí | — | — |
| `anotada_por` | uuid | **no** | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `ronda_id` | uuid | sí | — | — |
| `cuenta_indicada_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `fondo_plata_anotada_cuenta_indicada` — `CHECK (((cuenta_indicada_id IS NULL) OR (medio = 'transferencia'::text)))`
- `fondo_plata_anotada_estado` — `CHECK ((((estado = 'por_confirmar'::text) AND (monto_confirmado IS NULL) AND (cuenta_origen_id IS NULL) AND (movimiento_id IS NULL) AND (confirmada_por IS NULL) AND (confirmada_en IS NULL)) OR ((estado = 'confirmada'::text) AND (monto_confirmado IS NOT NULL) AND (confirmada_por IS NOT NULL) AND (confirmada_en IS NOT NULL) AND ((medio = 'ya_tenia'::text) = (cuenta_origen_id IS NULL)) AND ((medio = 'ya_tenia'::text) = (movimiento_id IS NULL)))))`
- `fondo_plata_anotada_estado_check` — `CHECK ((estado = ANY (ARRAY['por_confirmar'::text, 'confirmada'::text])))`
- `fondo_plata_anotada_foto_ruta_check` — `CHECK (((foto_ruta IS NULL) OR ((foto_ruta ~~ 'plata/%'::text) AND (char_length(foto_ruta) <= 300))))`
- `fondo_plata_anotada_medio_check` — `CHECK ((medio = ANY (ARRAY['transferencia'::text, 'yape_plin'::text, 'efectivo'::text, 'ya_tenia'::text])))`
- `fondo_plata_anotada_monto_check` — `CHECK (((monto > (0)::numeric) AND (monto <= (1000000)::numeric)))`
- `fondo_plata_anotada_monto_confirmado_check` — `CHECK (((monto_confirmado IS NULL) OR ((monto_confirmado > (0)::numeric) AND (monto_confirmado <= (1000000)::numeric))))`
- `fondo_plata_anotada_movimiento_id_key` — `UNIQUE (movimiento_id)`
- `fondo_plata_anotada_token_cliente_key` — `UNIQUE (token_cliente)`
- `fondo_plata_anotada_ya_tenia_uq` *(único parcial)* — `retail.fondo_plata_anotada (persona_id) WHERE (medio = 'ya_tenia'::text)`

**De qué depende:** `(anotada_por) REFERENCES personas(id)` · `(confirmada_por) REFERENCES personas(id)` · `(cuenta_indicada_id) REFERENCES retail.cuentas_dinero(id)` · `(cuenta_origen_id) REFERENCES retail.cuentas_dinero(id)` · `(movimiento_id) REFERENCES retail.movimientos_dinero(id)` · `(persona_id) REFERENCES personas(id)` · `(ronda_id) REFERENCES retail.compra_rondas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `compra_rondas`

*7 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `numero` | integer | **no** | `nextval('retail.compra_rondas_numero_seq'::regclass)` | — |
| `persona_id` | uuid | **no** | — | — |
| `abierta_en` | timestamp with time zone | **no** | `now()` | — |
| `abierta_por` | uuid | **no** | — | — |
| `cerrada_en` | timestamp with time zone | sí | — | — |
| `cierre_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `compra_rondas_cerrada_con_cierre` — `CHECK (((cerrada_en IS NULL) = (cierre_id IS NULL)))`
- `compra_rondas_cierre_id_key` — `UNIQUE (cierre_id)`
- `compra_rondas_numero_key` — `UNIQUE (numero)`
- `compra_rondas_una_abierta` *(único parcial)* — `retail.compra_rondas (persona_id) WHERE (cerrada_en IS NULL)`

**De qué depende:** `(abierta_por) REFERENCES personas(id)` · `(cierre_id) REFERENCES retail.compra_cierres(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 10 · Gallito — Producción del Taller

### `producciones`

*19 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la corrida concreta del Taller; los movimientos de stock que genera la apuntan con produccion_id |
| `ubicacion_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | qué modelo se fabricó; obligatorio |
| `estado` | text | **no** | `'en_proceso'::text` | en qué punto va la corrida: 'en_proceso', 'terminada' o 'anulada'; nace en_proceso |
| `es_muestra` | boolean | **no** | `false` | si es desarrollo del modelo y no producción vendible |
| `etapas` | jsonb | **no** | `'{}'::jsonb` | tablero de avance de la corrida, etapa por etapa |
| `costo_tela` | numeric | **no** | `0` | soles de tela de toda la corrida, no por prenda; no puede ser negativo |
| `costo_avios` | numeric | **no** | `0` | botones, cierres, etiquetas e hilo de toda la corrida: el resto del material directo |
| `costo_maquila` | numeric | **no** | `0` | lo que se mandó afuera en esa corrida (planchado, corte tercerizado), nunca una cotización de comparación |
| `cantidad_plan` | integer | **no** | — | — |
| `cantidad_buenas` | integer | sí | — | — |
| `costo_unitario` | numeric | sí | — | costo por prenda, columna calculada: no se escribe a mano y cerrar con menos buenas lo sube solo |
| `fecha_entrega` | date | sí | — | para cuándo se comprometió la corrida |
| `nota` | text | sí | — | observación libre de la corrida |
| `inventariado_at` | timestamp with time zone | sí | — | cuándo entraron las prendas al stock; vacío quiere decir que no han entrado, y solo se llena en una corrida terminada |
| `token_cliente` | uuid | sí | — | — |
| `creado_por` | uuid | sí | — | qué integrante del Taller abrió la corrida |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo se abrió la corrida |
| `numero` | integer | **no** | `nextval('retail.producciones_numero_seq'::regclass)` | — |

**Candados** — lo que esta tabla hace imposible:

- `producciones_cantidad_buenas_check` — `CHECK (((cantidad_buenas IS NULL) OR (cantidad_buenas > 0)))`
- `producciones_cantidad_plan_check` — `CHECK ((cantidad_plan > 0))`
- `producciones_costo_avios_check` — `CHECK ((costo_avios >= (0)::numeric))`
- `producciones_costo_maquila_check` — `CHECK ((costo_maquila >= (0)::numeric))`
- `producciones_costo_tela_check` — `CHECK ((costo_tela >= (0)::numeric))`
- `producciones_estado_check` — `CHECK ((estado = ANY (ARRAY['en_proceso'::text, 'terminada'::text, 'anulada'::text])))`
- `producciones_montos_finitos` — `CHECK (((abs(costo_tela) < 'Infinity'::numeric) AND (abs(costo_avios) < 'Infinity'::numeric) AND (abs(costo_maquila) < 'Infinity'::numeric) AND (abs(costo_unitario) < 'Infinity'::numeric)))`
- `producciones_terminada_coherente` — `CHECK ((((estado = 'terminada'::text) AND (cantidad_buenas IS NOT NULL)) OR ((estado <> 'terminada'::text) AND (cantidad_buenas IS NULL) AND (inventariado_at IS NULL))))`
- `producciones_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `producciones_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `produccion_lineas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | la línea de desglose de una corrida: una talla-color con su cantidad |
| `produccion_id` | uuid | **no** | — | de qué corrida del Taller viene |
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
| `produccion_lineas_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.producciones p   WHERE ((p.id = produccion_lineas.produccion_id) AND COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (p.ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false))))` |


### `insumos`

*15 columnas · ~0 filas · permisos por fila **activos***

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
| `creado_por` | uuid | sí | — | — |
| `tejido_id` | uuid | sí | — | — |
| `color_codigo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `insumos_codigo_key` — `UNIQUE (codigo)`
- `insumos_merma_pct_check` — `CHECK (((merma_pct >= (0)::numeric) AND (merma_pct < 0.5)))`
- `insumos_montos_finitos` — `CHECK (((abs(stock_minimo) < 'Infinity'::numeric) AND (abs(merma_pct) < 'Infinity'::numeric)))`
- `insumos_stock_minimo_check` — `CHECK (((stock_minimo IS NULL) OR (stock_minimo >= (0)::numeric)))`
- `insumos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['tela'::text, 'avio'::text])))`
- `insumos_unidad_medida_check` — `CHECK ((unidad_medida = ANY (ARRAY['metro'::text, 'unidad'::text, 'kilo'::text, 'cono'::text, 'par'::text, 'docena'::text])))`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(creado_por) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores_produccion(id)` · `(tejido_id) REFERENCES retail.tejidos(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `insumos_insert_lider` | INSERT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |
| `insumos_select_autenticado` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `insumos_update_lider` | UPDATE | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `insumo_lotes`

*17 columnas · ~0 filas · permisos por fila **activos***

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
| `comprobante_item_id` | uuid | sí | — | — |
| `recepcion_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `orden_insumo_item_id` | uuid | sí | — | — |
| `orden_insumo_recepcion_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `insumo_lotes_cantidad_ingresada_check` — `CHECK ((cantidad_ingresada > (0)::numeric))`
- `insumo_lotes_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `insumo_lotes_linea_de_orden_con_recepcion` — `CHECK (((orden_insumo_item_id IS NULL) OR (orden_insumo_recepcion_id IS NOT NULL)))`
- `insumo_lotes_montos_finitos` — `CHECK (((abs(cantidad_ingresada) < 'Infinity'::numeric) AND (abs(costo_unitario) < 'Infinity'::numeric)))`
- `insumo_lotes_origen_check` — `CHECK ((origen = ANY (ARRAY['compra'::text, 'saldo_inicial'::text])))`
- `insumo_lotes_una_recepcion` — `CHECK (((recepcion_id IS NULL) OR (orden_insumo_recepcion_id IS NULL)))`
- `insumo_lotes_codigo_unico` *(único parcial)* — `retail.insumo_lotes (insumo_id, codigo_lote) WHERE (codigo_lote IS NOT NULL)`
- `insumo_lotes_token_cliente_key` *(único parcial)* — `retail.insumo_lotes (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(comprobante_item_id) REFERENCES retail.comprobantes_produccion_items(id)` · `(insumo_id) REFERENCES retail.insumos(id)` · `(orden_insumo_item_id) REFERENCES retail.orden_insumo_items(id)` · `(orden_insumo_recepcion_id) REFERENCES retail.orden_insumo_recepciones(id)` · `(proveedor_id) REFERENCES retail.proveedores_produccion(id)` · `(recepcion_id) REFERENCES retail.comprobantes_produccion_recepciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `insumo_lotes_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


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
- `movimientos_insumo_montos_finitos` — `CHECK (((abs(cantidad) < 'Infinity'::numeric) AND (abs(costo_unitario) < 'Infinity'::numeric)))`
- `movimientos_insumo_produccion_segun_tipo` — `CHECK ((((tipo = ANY (ARRAY['consumo'::text, 'devolucion'::text])) AND (produccion_id IS NOT NULL)) OR ((tipo = ANY (ARRAY['compra'::text, 'merma'::text, 'ajuste'::text])) AND (produccion_id IS NULL))))`
- `movimientos_insumo_tipo_check` — `CHECK ((tipo = ANY (ARRAY['compra'::text, 'consumo'::text, 'devolucion'::text, 'merma'::text, 'ajuste'::text])))`

**De qué depende:** `(insumo_id) REFERENCES retail.insumos(id)` · `(insumo_lote_id) REFERENCES retail.insumo_lotes(id)` · `(produccion_id) REFERENCES retail.producciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_insumo_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `v_insumo_saldos` *(vista)*

*8 columnas*

*El volcado de producción no trae la definición de esta vista.*

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


### `proveedores_produccion`

*19 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `rubro` | text | **no** | — | — |
| `ruc` | text | sí | — | — |
| `contacto` | text | sí | — | — |
| `telefono` | text | sí | — | — |
| `plazo_credito_dias` | integer | sí | — | — |
| `forma_pago_preferida` | text | sí | — | — |
| `banco` | text | sí | — | — |
| `cuenta_bancaria` | text | sí | — | — |
| `cci` | text | sí | — | — |
| `celular_billetera` | text | sí | — | — |
| `billeteras` | ARRAY | sí | — | — |
| `titular_cuenta` | text | sí | — | — |
| `activo` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `creado_por` | uuid | sí | — | — |
| `modificado_por` | uuid | sí | — | — |
| `modificado_at` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedores_produccion_billetera_coherente` — `CHECK (((celular_billetera IS NULL) = (billeteras IS NULL)))`
- `proveedores_produccion_billeteras_check` — `CHECK (((billeteras IS NULL) OR (((cardinality(billeteras) >= 1) AND (cardinality(billeteras) <= 2)) AND (billeteras <@ ARRAY['yape'::text, 'plin'::text]))))`
- `proveedores_produccion_cci_check` — `CHECK (((cci IS NULL) OR (cci ~ '^[0-9]{20}$'::text)))`
- `proveedores_produccion_celular_billetera_check` — `CHECK (((celular_billetera IS NULL) OR (celular_billetera ~ '^9[0-9]{8}$'::text)))`
- `proveedores_produccion_forma_pago_preferida_check` — `CHECK (((forma_pago_preferida IS NULL) OR (forma_pago_preferida = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'otro'::text]))))`
- `proveedores_produccion_nombre_check` — `CHECK ((char_length(btrim(nombre)) > 0))`
- `proveedores_produccion_plazo_credito_dias_check` — `CHECK (((plazo_credito_dias IS NULL) OR (plazo_credito_dias > 0)))`
- `proveedores_produccion_rubro_check` — `CHECK ((rubro = ANY (ARRAY['tela'::text, 'avios'::text, 'maquila'::text, 'otro'::text])))`
- `proveedores_produccion_ruc_check` — `CHECK (((ruc IS NULL) OR (ruc ~ '^[0-9]{11}$'::text)))`
- `proveedores_produccion_titular_cuenta_check` — `CHECK (((titular_cuenta IS NULL) OR ((char_length(titular_cuenta) >= 2) AND (char_length(titular_cuenta) <= 120))))`
- `proveedores_produccion_ruc_unico` *(único parcial)* — `retail.proveedores_produccion (ruc) WHERE (ruc IS NOT NULL)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(modificado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `proveedores_produccion_select_lider` | SELECT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `comprobantes_produccion`

*20 columnas · ~0 filas · permisos por fila **activos***

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
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `anulada_por` | uuid | sí | — | — |
| `anulada_at` | timestamp with time zone | sí | — | — |
| `orden_insumo_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_produccion_anulada_con_motivo` — `CHECK (((estado = 'vigente'::text) OR ((motivo_anulacion IS NOT NULL) AND (char_length(btrim(motivo_anulacion)) > 0))))`
- `comprobantes_produccion_condicion_check` — `CHECK ((condicion = ANY (ARRAY['contado'::text, 'credito'::text])))`
- `comprobantes_produccion_credito_con_vencimiento` — `CHECK (((condicion = 'contado'::text) OR (fecha_vencimiento IS NOT NULL)))`
- `comprobantes_produccion_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulada'::text])))`
- `comprobantes_produccion_igv_check` — `CHECK ((igv >= (0)::numeric))`
- `comprobantes_produccion_igv_solo_factura` — `CHECK (((tipo = 'factura'::text) OR (igv = (0)::numeric)))`
- `comprobantes_produccion_montos_finitos` — `CHECK (((abs(subtotal) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric) AND (abs(total) < 'Infinity'::numeric)))`
- `comprobantes_produccion_numero_check` — `CHECK ((char_length(btrim(numero)) > 0))`
- `comprobantes_produccion_serie_check` — `CHECK ((char_length(btrim(serie)) > 0))`
- `comprobantes_produccion_subtotal_check` — `CHECK ((subtotal >= (0)::numeric))`
- `comprobantes_produccion_tipo_check` — `CHECK ((tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'nota_venta'::text, 'sin_comprobante'::text])))`
- `comprobantes_produccion_token_cliente_key` — `UNIQUE (token_cliente)`
- `comprobantes_produccion_total_check` — `CHECK ((total >= (0)::numeric))`
- `comprobantes_produccion_total_cuadra` — `CHECK ((total = (subtotal + igv)))`
- `comprobantes_produccion_papel_vigente_unico` *(único parcial)* — `retail.comprobantes_produccion (proveedor_id, serie, numero) WHERE (estado = 'vigente'::text)`

**De qué depende:** `(anulada_por) REFERENCES personas(id)` · `(orden_insumo_id) REFERENCES retail.ordenes_insumo(id)` · `(proveedor_id) REFERENCES retail.proveedores_produccion(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_produccion_select_lider` | SELECT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `comprobantes_produccion_items`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `comprobante_id` | uuid | **no** | — | — |
| `insumo_id` | uuid | sí | — | — |
| `descripcion` | text | sí | — | — |
| `cantidad` | numeric | **no** | — | — |
| `costo_unitario` | numeric | **no** | — | — |
| `subtotal` | numeric | sí | — | — |
| `orden_insumo_item_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_produccion_items_cantidad_check` — `CHECK ((cantidad > (0)::numeric))`
- `comprobantes_produccion_items_costo_unitario_check` — `CHECK ((costo_unitario >= (0)::numeric))`
- `comprobantes_produccion_items_insumo_o_concepto` — `CHECK (((insumo_id IS NOT NULL) OR ((descripcion IS NOT NULL) AND (char_length(btrim(descripcion)) > 0))))`
- `comprobantes_produccion_items_montos_finitos` — `CHECK (((abs(cantidad) < 'Infinity'::numeric) AND (abs(costo_unitario) < 'Infinity'::numeric) AND (abs(subtotal) < 'Infinity'::numeric)))`

**De qué depende:** `(comprobante_id) REFERENCES retail.comprobantes_produccion(id)` · `(insumo_id) REFERENCES retail.insumos(id)` · `(orden_insumo_item_id) REFERENCES retail.orden_insumo_items(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_produccion_items_select_lider` | SELECT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `comprobantes_produccion_pagos`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `comprobante_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | `CURRENT_DATE` | — |
| `monto` | numeric | **no** | — | — |
| `metodo` | text | **no** | — | — |
| `referencia` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `grupo_id` | uuid | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_produccion_pagos_metodo_check` — `CHECK ((metodo = ANY (ARRAY['transferencia'::text, 'yape'::text, 'plin'::text, 'efectivo'::text, 'deposito'::text, 'otro'::text])))`
- `comprobantes_produccion_pagos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `comprobantes_produccion_pagos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `comprobantes_produccion_pagos_egreso_uq` *(único parcial)* — `retail.comprobantes_produccion_pagos (caja_movimiento_id) WHERE (caja_movimiento_id IS NOT NULL)`

**De qué depende:** `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(comprobante_id) REFERENCES retail.comprobantes_produccion(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_produccion_pagos_select_lider` | SELECT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `comprobantes_produccion_recepciones`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `comprobante_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_produccion_recepciones_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(comprobante_id) REFERENCES retail.comprobantes_produccion(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_produccion_recepciones_select` | SELECT | `COALESCE((( SELECT retail.fn_es_lider() AS fn_es_lider) OR (ubicacion_id = ( SELECT retail.fn_ubicacion_actual_persona() AS fn_ubicacion_actual_persona))), false)` |


### `comprobantes_produccion_cierres`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `item_id` | uuid | **no** | — | — |
| `recepcion_id` | uuid | sí | — | — |
| `cantidad` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `comprobantes_produccion_cierres_cantidad_check` — `CHECK ((cantidad > (0)::numeric))`
- `comprobantes_produccion_cierres_montos_finitos` — `CHECK ((abs(cantidad) < 'Infinity'::numeric))`
- `comprobantes_produccion_cierres_motivo_check` — `CHECK ((motivo = ANY (ARRAY['faltante'::text, 'devolucion'::text, 'otro'::text])))`

**De qué depende:** `(item_id) REFERENCES retail.comprobantes_produccion_items(id)` · `(recepcion_id) REFERENCES retail.comprobantes_produccion_recepciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `comprobantes_produccion_cierres_select_lider` | SELECT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `cotizaciones_maquila`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `categoria_id` | uuid | **no** | — | — |
| `precio_maquila` | numeric | **no** | — | — |
| `fecha_cotizacion` | date | **no** | — | — |
| `vigente_hasta` | date | **no** | — | — |
| `proveedor_referencia` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cotizaciones_maquila_montos_finitos` — `CHECK ((abs(precio_maquila) < 'Infinity'::numeric))`
- `cotizaciones_maquila_precio_maquila_check` — `CHECK ((precio_maquila >= (0)::numeric))`
- `cotizaciones_maquila_vigencia_coherente` — `CHECK ((vigente_hasta >= fecha_cotizacion))`

**De qué depende:** `(categoria_id) REFERENCES retail.categorias(id)` · `(creado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `cotizaciones_maquila_insert` | INSERT | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |
| `cotizaciones_maquila_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `cotizaciones_maquila_update` | UPDATE | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `produccion_etapas_historial`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `produccion_id` | uuid | **no** | — | — |
| `etapa` | text | **no** | — | — |
| `estado` | text | **no** | — | — |
| `hecho_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(hecho_por) REFERENCES personas(id)` · `(produccion_id) REFERENCES retail.producciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `produccion_etapas_historial_select` | SELECT | `(EXISTS ( SELECT 1    FROM retail.producciones p   WHERE (p.id = produccion_etapas_historial.produccion_id)))` |


### `ordenes_insumo`

*16 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `numero` | integer | **no** | `nextval('retail.ordenes_insumo_numero_seq'::regclass)` | — |
| `proveedor_id` | uuid | **no** | — | — |
| `ubicacion_destino_id` | uuid | **no** | — | — |
| `fecha_emision` | date | **no** | `retail.fn_hoy_lima()` | — |
| `fecha_entrega_estimada` | date | sí | — | — |
| `estado` | text | **no** | `'generada'::text` | — |
| `nota` | text | sí | — | — |
| `creada_por` | uuid | **no** | — | — |
| `creada_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizada_por` | uuid | sí | — | — |
| `actualizada_en` | timestamp with time zone | sí | — | — |
| `version` | integer | **no** | `1` | — |
| `anulada_por` | uuid | sí | — | — |
| `anulada_en` | timestamp with time zone | sí | — | — |
| `motivo_anulacion` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `ordenes_insumo_anulacion` — `CHECK ( CASE     WHEN (estado = 'anulada'::text) THEN ((anulada_por IS NOT NULL) AND (anulada_en IS NOT NULL) AND (COALESCE(btrim(motivo_anulacion), ''::text) <> ''::text))     ELSE ((anulada_por IS NULL) AND (anulada_en IS NULL) AND (motivo_anulacion IS NULL)) END)`
- `ordenes_insumo_entrega` — `CHECK (((fecha_entrega_estimada IS NULL) OR (fecha_entrega_estimada >= fecha_emision)))`
- `ordenes_insumo_estado` — `CHECK ((estado = ANY (ARRAY['generada'::text, 'anulada'::text])))`
- `ordenes_insumo_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `ordenes_insumo_numero_unico` — `UNIQUE (numero)`
- `ordenes_insumo_version_check` — `CHECK ((version > 0))`

**De qué depende:** `(actualizada_por) REFERENCES personas(id)` · `(anulada_por) REFERENCES personas(id)` · `(creada_por) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores_produccion(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `orden_insumo_items`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `orden_insumo_id` | uuid | **no** | — | — |
| `posicion` | integer | **no** | — | — |
| `insumo_id` | uuid | **no** | — | — |
| `descripcion` | text | sí | — | — |
| `cantidad` | numeric | **no** | — | — |
| `unidad_medida` | text | **no** | — | — |
| `precio_unitario` | numeric | **no** | — | — |
| `descuento` | numeric | **no** | `0` | — |
| `descuento_pct` | numeric | sí | — | — |
| `subtotal` | numeric | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `orden_insumo_items_cantidad_check` — `CHECK ((cantidad > (0)::numeric))`
- `orden_insumo_items_descripcion_check` — `CHECK (((descripcion IS NULL) OR (btrim(descripcion) <> ''::text)))`
- `orden_insumo_items_descuento_check` — `CHECK ((descuento >= (0)::numeric))`
- `orden_insumo_items_descuento_cuadra` — `CHECK (((descuento_pct IS NULL) OR (descuento = round(((round((cantidad * precio_unitario), 2) * descuento_pct) / (100)::numeric), 2))))`
- `orden_insumo_items_descuento_pct_check` — `CHECK (((descuento_pct IS NULL) OR ((descuento_pct >= (0)::numeric) AND (descuento_pct <= (100)::numeric))))`
- `orden_insumo_items_descuento_tope` — `CHECK ((descuento <= round((cantidad * precio_unitario), 2)))`
- `orden_insumo_items_montos_finitos` — `CHECK (((abs(cantidad) < 'Infinity'::numeric) AND (abs(precio_unitario) < 'Infinity'::numeric) AND (abs(descuento) < 'Infinity'::numeric) AND (abs(descuento_pct) < 'Infinity'::numeric) AND (abs(subtotal) < 'Infinity'::numeric)))`
- `orden_insumo_items_posicion_check` — `CHECK ((posicion > 0))`
- `orden_insumo_items_posicion_unica` — `UNIQUE (orden_insumo_id, posicion)`
- `orden_insumo_items_precio_unitario_check` — `CHECK ((precio_unitario >= (0)::numeric))`
- `orden_insumo_items_unidad_medida_check` — `CHECK ((btrim(unidad_medida) <> ''::text))`

**De qué depende:** `(insumo_id) REFERENCES retail.insumos(id)` · `(orden_insumo_id) REFERENCES retail.ordenes_insumo(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `orden_insumo_versiones`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `orden_insumo_id` | uuid | **no** | — | — |
| `version` | integer | **no** | — | — |
| `datos` | jsonb | **no** | — | — |
| `reemplazada_por` | uuid | sí | — | — |
| `reemplazada_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `orden_insumo_versiones_unica` — `UNIQUE (orden_insumo_id, version)`

**De qué depende:** `(orden_insumo_id) REFERENCES retail.ordenes_insumo(id)` · `(reemplazada_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `orden_insumo_recepciones`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `orden_insumo_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `orden_insumo_recepciones_nota_larga` — `CHECK (((nota IS NULL) OR (length(nota) <= 500)))`
- `orden_insumo_recepciones_token_cliente_key` — `UNIQUE (token_cliente)`

**De qué depende:** `(orden_insumo_id) REFERENCES retail.ordenes_insumo(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `orden_insumo_cierres`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `orden_insumo_id` | uuid | **no** | — | — |
| `orden_insumo_item_id` | uuid | sí | — | — |
| `comprobante_item_id` | uuid | sí | — | — |
| `recepcion_id` | uuid | **no** | — | — |
| `insumo_id` | uuid | **no** | — | — |
| `cantidad` | numeric | **no** | — | — |
| `costo_unitario` | numeric | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `orden_insumo_cierres_cantidad` — `CHECK (((cantidad > (0)::numeric) AND (cantidad < 'Infinity'::numeric)))`
- `orden_insumo_cierres_costo` — `CHECK (((costo_unitario >= (0)::numeric) AND (costo_unitario < 'Infinity'::numeric)))`
- `orden_insumo_cierres_motivo` — `CHECK ((motivo = ANY (ARRAY['faltante'::text, 'devolucion'::text, 'otro'::text])))`
- `orden_insumo_cierres_nota_larga` — `CHECK (((nota IS NULL) OR (length(nota) <= 300)))`
- `orden_insumo_cierres_una_linea` — `CHECK (((orden_insumo_item_id IS NULL) <> (comprobante_item_id IS NULL)))`

**De qué depende:** `(comprobante_item_id) REFERENCES retail.comprobantes_produccion_items(id)` · `(insumo_id) REFERENCES retail.insumos(id)` · `(orden_insumo_id) REFERENCES retail.ordenes_insumo(id)` · `(orden_insumo_item_id) REFERENCES retail.orden_insumo_items(id)` · `(recepcion_id) REFERENCES retail.orden_insumo_recepciones(id)` · `(usuario_id) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_fases`

*14 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `produccion_id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `secuencia` | smallint | **no** | — | — |
| `posicion` | text | sí | — | — |
| `quien` | text | **no** | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `tarifa_prenda` | numeric | sí | — | — |
| `fijo_orden` | numeric | **no** | `0` | — |
| `cantidad_minima` | integer | sí | — | — |
| `fecha_prometida` | date | sí | — | — |
| `nota` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_fases_cantidad_minima_check` — `CHECK (((cantidad_minima IS NULL) OR (cantidad_minima > 0)))`
- `produccion_fases_clave_check` — `CHECK ((clave = ANY (ARRAY['ploteo'::text, 'corte'::text, 'habilitado'::text, 'costura'::text, 'ojales_botones'::text, 'limpieza_revision'::text, 'planchado'::text, 'etiquetado_embolsado'::text, 'acabado'::text, 'bordado'::text, 'estampado'::text, 'lavanderia'::text])))`
- `produccion_fases_fijo_orden_check` — `CHECK ((fijo_orden >= (0)::numeric))`
- `produccion_fases_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `produccion_fases_posicion` — `CHECK (((clave = ANY (ARRAY['bordado'::text, 'estampado'::text])) = (posicion IS NOT NULL)))`
- `produccion_fases_posicion_check` — `CHECK ((posicion = ANY (ARRAY['pieza'::text, 'prenda'::text])))`
- `produccion_fases_quien` — `CHECK ( CASE     WHEN (quien = 'servicio'::text) THEN ((proveedor_id IS NOT NULL) AND ((tarifa_prenda IS NOT NULL) OR ((clave = 'ploteo'::text) AND (fijo_orden > (0)::numeric))))     ELSE ((proveedor_id IS NULL) AND (tarifa_prenda IS NULL) AND (fecha_prometida IS NULL) AND (cantidad_minima IS NULL)) END)`
- `produccion_fases_quien_check` — `CHECK ((quien = ANY (ARRAY['taller'::text, 'servicio'::text])))`
- `produccion_fases_secuencia_check` — `CHECK ((secuencia > 0))`
- `produccion_fases_secuencia_de_la_ruta` — `CHECK ((secuencia = retail.fn_fase_secuencia(clave, posicion)))`
- `produccion_fases_secuencia_unica` — `UNIQUE (produccion_id, secuencia)`
- `produccion_fases_tarifa_prenda_check` — `CHECK (((tarifa_prenda IS NULL) OR (tarifa_prenda > (0)::numeric)))`
- `produccion_fases_una_por_orden` — `UNIQUE (produccion_id, clave)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(produccion_id) REFERENCES retail.producciones(id)` · `(proveedor_id) REFERENCES retail.proveedores_produccion(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_avances`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `fase_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |
| `origen` | text | **no** | — | — |
| `vuelta_id` | uuid | sí | — | — |
| `deshace_id` | uuid | sí | — | — |
| `bulto` | text | sí | — | — |
| `operacion` | text | sí | — | — |
| `operaria_persona_id` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `hecho_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_avances_cantidad_check` — `CHECK ((cantidad <> 0))`
- `produccion_avances_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `produccion_avances_origen` — `CHECK ( CASE origen     WHEN 'deshacer'::text THEN ((cantidad < 0) AND (deshace_id IS NOT NULL))     WHEN 'vuelta'::text THEN ((cantidad > 0) AND (vuelta_id IS NOT NULL))     ELSE ((cantidad > 0) AND (vuelta_id IS NULL) AND (deshace_id IS NULL)) END)`
- `produccion_avances_origen_check` — `CHECK ((origen = ANY (ARRAY['taller'::text, 'vuelta'::text, 'deshacer'::text])))`

**De qué depende:** `(deshace_id) REFERENCES retail.produccion_avances(id)` · `(fase_id) REFERENCES retail.produccion_fases(id)` · `(hecho_por) REFERENCES personas(id)` · `(operaria_persona_id) REFERENCES personas(id)` · `(variante_id) REFERENCES retail.variantes(id)` · `(vuelta_id) REFERENCES retail.produccion_vueltas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_insumos`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `produccion_id` | uuid | **no** | — | — |
| `insumo_id` | uuid | **no** | — | — |
| `color_codigo` | text | sí | — | — |
| `consumo_por_prenda` | numeric | **no** | — | — |
| `cantidad_plan` | numeric | **no** | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `consumo_por_talla` | jsonb | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_insumos_cantidad_plan_check` — `CHECK ((cantidad_plan > (0)::numeric))`
- `produccion_insumos_consumo_por_prenda_check` — `CHECK ((consumo_por_prenda > (0)::numeric))`
- `produccion_insumos_consumo_por_talla_check` — `CHECK (((consumo_por_talla IS NULL) OR (jsonb_typeof(consumo_por_talla) = 'object'::text)))`
- `produccion_insumos_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(insumo_id) REFERENCES retail.insumos(id)` · `(produccion_id) REFERENCES retail.producciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_salidas`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `fase_id` | uuid | **no** | — | — |
| `guia` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `hecho_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `anula_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_salidas_anulacion` — `CHECK ((((anula_id IS NULL) = (motivo IS NULL)) AND ((motivo IS NULL) OR (btrim(motivo) <> ''::text))))`
- `produccion_salidas_guia_check` — `CHECK (((guia IS NULL) OR (btrim(guia) <> ''::text)))`
- `produccion_salidas_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `produccion_salidas_anula_unico` *(único parcial)* — `retail.produccion_salidas (anula_id) WHERE (anula_id IS NOT NULL)`

**De qué depende:** `(anula_id) REFERENCES retail.produccion_salidas(id)` · `(fase_id) REFERENCES retail.produccion_fases(id)` · `(hecho_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_salida_lineas`

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `salida_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `cantidad` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_salida_lineas_cantidad_check` — `CHECK ((cantidad <> 0))`
- `produccion_salida_lineas_unica` — `UNIQUE (salida_id, variante_id)`

**De qué depende:** `(salida_id) REFERENCES retail.produccion_salidas(id)` · `(variante_id) REFERENCES retail.variantes(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_fase_marcas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `fase_id` | uuid | **no** | — | — |
| `deshace_id` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `hecho_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_fase_marcas_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `produccion_fase_marcas_una_vez` — `UNIQUE (deshace_id)`

**De qué depende:** `(deshace_id) REFERENCES retail.produccion_fase_marcas(id)` · `(fase_id) REFERENCES retail.produccion_fases(id)` · `(hecho_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_vueltas`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `fase_id` | uuid | **no** | — | — |
| `guia` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `hecho_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `anula_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_vueltas_anulacion` — `CHECK ((((anula_id IS NULL) = (motivo IS NULL)) AND ((motivo IS NULL) OR (btrim(motivo) <> ''::text))))`
- `produccion_vueltas_guia_check` — `CHECK (((guia IS NULL) OR (btrim(guia) <> ''::text)))`
- `produccion_vueltas_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `produccion_vueltas_anula_unico` *(único parcial)* — `retail.produccion_vueltas (anula_id) WHERE (anula_id IS NOT NULL)`

**De qué depende:** `(anula_id) REFERENCES retail.produccion_vueltas(id)` · `(fase_id) REFERENCES retail.produccion_fases(id)` · `(hecho_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `produccion_vuelta_lineas`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `vuelta_id` | uuid | **no** | — | — |
| `variante_id` | uuid | **no** | — | — |
| `buenas` | integer | **no** | `0` | — |
| `segundas` | integer | **no** | `0` | — |
| `faltantes` | integer | **no** | `0` | — |
| `motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `produccion_vuelta_lineas_forma` — `CHECK ((((buenas >= 0) AND (segundas >= 0) AND (faltantes >= 0) AND (((buenas + segundas) + faltantes) > 0) AND (((segundas + faltantes) = 0) OR (motivo IS NOT NULL))) OR ((buenas <= 0) AND (segundas <= 0) AND (faltantes <= 0) AND (((buenas + segundas) + faltantes) < 0))))`
- `produccion_vuelta_lineas_motivo_check` — `CHECK (((motivo IS NULL) OR (btrim(motivo) <> ''::text)))`
- `produccion_vuelta_lineas_unica` — `UNIQUE (vuelta_id, variante_id)`

**De qué depende:** `(variante_id) REFERENCES retail.variantes(id)` · `(vuelta_id) REFERENCES retail.produccion_vueltas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `producto_consumos`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `producto_id` | uuid | **no** | — | — |
| `tela_por_prenda` | numeric | **no** | — | — |
| `por_talla` | jsonb | sí | — | — |
| `fuente` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `producto_consumos_fuente_check` — `CHECK ((fuente = ANY (ARRAY['declarado'::text, 'medido'::text])))`
- `producto_consumos_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `producto_consumos_tela_por_prenda_check` — `CHECK ((tela_por_prenda > (0)::numeric))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `proveedor_tarifas`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `proveedor_id` | uuid | **no** | — | — |
| `fase_clave` | text | **no** | — | — |
| `tarifa_prenda` | numeric | sí | — | — |
| `cantidad_minima` | integer | sí | — | — |
| `fijo_orden` | numeric | **no** | `0` | — |
| `vigente_desde` | date | **no** | `retail.fn_hoy_lima()` | — |
| `nota` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `proveedor_tarifas_cantidad_minima_check` — `CHECK (((cantidad_minima IS NULL) OR (cantidad_minima > 0)))`
- `proveedor_tarifas_fase_clave_check` — `CHECK ((fase_clave = ANY (ARRAY['ploteo'::text, 'corte'::text, 'habilitado'::text, 'costura'::text, 'ojales_botones'::text, 'limpieza_revision'::text, 'planchado'::text, 'etiquetado_embolsado'::text, 'acabado'::text, 'bordado'::text, 'estampado'::text, 'lavanderia'::text])))`
- `proveedor_tarifas_fijo_orden_check` — `CHECK ((fijo_orden >= (0)::numeric))`
- `proveedor_tarifas_nota_check` — `CHECK (((nota IS NULL) OR (btrim(nota) <> ''::text)))`
- `proveedor_tarifas_tarifa_o_ploteo` — `CHECK (((tarifa_prenda IS NOT NULL) OR ((fase_clave = 'ploteo'::text) AND (fijo_orden > (0)::numeric))))`
- `proveedor_tarifas_tarifa_prenda_check` — `CHECK ((tarifa_prenda > (0)::numeric))`
- `proveedor_tarifas_unica` — `UNIQUE (proveedor_id, fase_clave, vigente_desde)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores_produccion(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `producto_avios`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `producto_id` | uuid | **no** | — | — |
| `insumo_id` | uuid | **no** | — | — |
| `color_codigo` | text | sí | — | — |
| `cantidad_por_prenda` | numeric | **no** | — | — |
| `declarado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `archivado_at` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `producto_avios_cantidad_por_prenda_check` — `CHECK (((cantidad_por_prenda > (0)::numeric) AND (cantidad_por_prenda <= (9999)::numeric)))`
- `producto_avios_vigente_uq` *(único parcial)* — `retail.producto_avios (producto_id, insumo_id, COALESCE(color_codigo, ''::text)) WHERE (archivado_at IS NULL)`

**De qué depende:** `(color_codigo) REFERENCES retail.colores(codigo)` · `(declarado_por) REFERENCES personas(id)` · `(insumo_id) REFERENCES retail.insumos(id)` · `(producto_id) REFERENCES retail.productos(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `producto_consumo_medido`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `produccion_id` | uuid | **no** | — | — |
| `producto_id` | uuid | **no** | — | — |
| `buenas` | integer | **no** | — | — |
| `metros` | numeric | **no** | — | — |
| `cerrada_en` | timestamp with time zone | **no** | `clock_timestamp()` | — |

**Candados** — lo que esta tabla hace imposible:

- `producto_consumo_medido_buenas_check` — `CHECK ((buenas > 0))`
- `producto_consumo_medido_metros_check` — `CHECK ((metros > (0)::numeric))`

**De qué depende:** `(produccion_id) REFERENCES retail.producciones(id)` · `(producto_id) REFERENCES retail.productos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 11 · Garza — Finanzas operativas

### `gastos`

*19 columnas · ~215 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | sí | — | — |
| `categoria` | text | **no** | — | — |
| `descripcion` | text | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `monto_total` | numeric | **no** | — | — |
| `igv` | numeric | **no** | `0` | — |
| `compra_id` | uuid | sí | — | — |
| `medio_pago` | text | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |
| `estado` | text | **no** | `'vigente'::text` | — |
| `motivo_anulacion` | text | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `gasto_fijo_id` | uuid | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_anulacion_coherente` — `CHECK ((((estado = 'vigente'::text) AND (motivo_anulacion IS NULL) AND (anulado_por IS NULL) AND (anulado_en IS NULL)) OR ((estado = 'anulado'::text) AND (motivo_anulacion IS NOT NULL) AND (TRIM(BOTH FROM motivo_anulacion) <> ''::text) AND (anulado_en IS NOT NULL))))`
- `gastos_descripcion_check` — `CHECK ((TRIM(BOTH FROM descripcion) <> ''::text))`
- `gastos_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulado'::text])))`
- `gastos_igv_check1` — `CHECK ((igv >= (0)::numeric))`
- `gastos_igv_menor_al_total` — `CHECK ((igv < monto_total))`
- `gastos_igv_solo_con_comprobante` — `CHECK (((igv = (0)::numeric) OR (compra_id IS NOT NULL) OR (categoria = ANY (ARRAY['traer_mercaderia'::text, 'viaje_compra'::text]))))`
- `gastos_medio_pago_check` — `CHECK ((medio_pago = ANY (ARRAY['efectivo'::text, 'yape'::text, 'plin'::text, 'transferencia'::text, 'tarjeta'::text])))`
- `gastos_monto_con_tope` — `CHECK (((monto_total <= (1000000)::numeric) OR (monto_total = 'NaN'::numeric)))`
- `gastos_monto_total_check` — `CHECK ((monto_total > (0)::numeric))`
- `gastos_montos_finitos` — `CHECK (((abs(monto_total) < 'Infinity'::numeric) AND (abs(igv) < 'Infinity'::numeric)))`
- `gastos_pago_coherente` — `CHECK ((((compra_id IS NULL) AND (medio_pago IS NOT NULL) AND ((caja_movimiento_id IS NULL) OR (medio_pago = 'efectivo'::text)) AND ((medio_pago <> 'efectivo'::text) OR (caja_movimiento_id IS NOT NULL) OR (cuenta_dinero_id IS NOT NULL))) OR ((compra_id IS NOT NULL) AND (medio_pago IS NULL) AND (cuenta_dinero_id IS NULL))))`
- `gastos_textos_con_tope` — `CHECK (((char_length(descripcion) <= 200) AND (char_length(motivo_anulacion) <= 300)))`
- `gastos_token_cliente_key` — `UNIQUE (token_cliente)`
- `gastos_compra_vigente_uq` *(único parcial)* — `retail.gastos (compra_id) WHERE ((estado = 'vigente'::text) AND (compra_id IS NOT NULL))`
- `gastos_egreso_vigente_uq` *(único parcial)* — `retail.gastos (caja_movimiento_id) WHERE ((estado = 'vigente'::text) AND (caja_movimiento_id IS NOT NULL))`
- `gastos_fijo_mes_uq` *(único parcial)* — `retail.gastos (gasto_fijo_id, date_trunc('month'::text, (fecha)::timestamp without time zone)) WHERE ((estado = 'vigente'::text) AND (gasto_fijo_id IS NOT NULL))`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(categoria) REFERENCES retail.categorias_gasto(codigo)` · `(compra_id) REFERENCES retail.compras(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(gasto_fijo_id) REFERENCES retail.gastos_fijos(id)` · `(registrado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `planilla_por_sede` *(vista)*

*9 columnas*

*El volcado de producción no trae la definición de esta vista.*

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `sede_codigo` | text | sí | — | — |
| `sede_tipo` | text | sí | — | — |
| `periodo_id` | uuid | sí | — | — |
| `fecha_ini` | date | sí | — | — |
| `fecha_fin` | date | sí | — | — |
| `personas` | bigint | sí | — | — |
| `pagado` | numeric | sí | — | — |
| `provisiones` | numeric | sí | — | — |
| `costo_total` | numeric | sí | — | — |


### `categorias_gasto`

*6 columnas · ~18 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `ejemplos` | text | **no** | `''::text` | — |
| `cuenta_pcge` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `categorias_gasto_codigo_check` — `CHECK ((codigo ~ '^[a-z_]+$'::text))`
- `categorias_gasto_nombre_check` — `CHECK ((TRIM(BOTH FROM nombre) <> ''::text))`

**De qué depende:** `(cuenta_pcge) REFERENCES retail.cuentas(codigo)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_fijos`

*16 columnas · ~29 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | sí | — | — |
| `categoria` | text | **no** | — | — |
| `descripcion` | text | **no** | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `comprobante_tipo` | text | **no** | `'factura'::text` | — |
| `monto` | numeric | **no** | — | — |
| `monto_variable` | boolean | **no** | `false` | — |
| `dia_del_mes` | smallint | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `creado_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `momento` | text | **no** | `'dia'::text` | — |
| `dias_antes` | smallint | **no** | `0` | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_fijos_comprobante_tipo_check` — `CHECK ((comprobante_tipo = ANY (ARRAY['factura'::text, 'boleta'::text, 'recibo_por_honorarios'::text, 'sin_comprobante'::text])))`
- `gastos_fijos_descripcion_check` — `CHECK ((TRIM(BOTH FROM descripcion) <> ''::text))`
- `gastos_fijos_dia_del_mes_check` — `CHECK (((dia_del_mes >= 1) AND (dia_del_mes <= 28)))`
- `gastos_fijos_dias_antes_valido` — `CHECK (((dias_antes >= 0) AND (dias_antes <= 30)))`
- `gastos_fijos_momento_coherente` — `CHECK (((momento = 'dia'::text) OR (dia_del_mes = CASE momento     WHEN 'primera_semana'::text THEN 7     WHEN 'quincena'::text THEN 15     ELSE 28 END)))`
- `gastos_fijos_momento_valido` — `CHECK ((momento = ANY (ARRAY['dia'::text, 'primera_semana'::text, 'quincena'::text, 'fin_de_mes'::text])))`
- `gastos_fijos_monto_check` — `CHECK ((monto > (0)::numeric))`
- `gastos_fijos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `gastos_fijos_textos_con_tope` — `CHECK ((char_length(descripcion) <= 200))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(categoria) REFERENCES retail.categorias_gasto(codigo)` · `(creado_por) REFERENCES personas(id)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_fijos_descartados`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | sí | — | — |
| `categoria` | text | **no** | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `descartado_por` | uuid | **no** | — | — |
| `descartado_en` | timestamp with time zone | **no** | `now()` | — |
| `revertido_por` | uuid | sí | — | — |
| `revertido_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_fijos_descartados_reversion_coherente` — `CHECK (((revertido_en IS NULL) = (revertido_por IS NULL)))`
- `gastos_fijos_descartados_vigente` *(único parcial)* — `retail.gastos_fijos_descartados (COALESCE(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria, COALESCE(proveedor_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (revertido_en IS NULL)`

**De qué depende:** `(categoria) REFERENCES retail.categorias_gasto(codigo)` · `(proveedor_id) REFERENCES retail.proveedores(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `egresos_no_gasto`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `caja_movimiento_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `motivo` | text | sí | — | — |
| `revisado_por` | uuid | sí | — | — |
| `revisado_en` | timestamp with time zone | **no** | `now()` | — |
| `revertido_por` | uuid | sí | — | — |
| `revertido_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `egresos_no_gasto_check` — `CHECK (((tipo <> 'otro'::text) OR ((motivo IS NOT NULL) AND (TRIM(BOTH FROM motivo) <> ''::text))))`
- `egresos_no_gasto_check1` — `CHECK (((revertido_en IS NULL) OR (revertido_en >= revisado_en)))`
- `egresos_no_gasto_tipo_check` — `CHECK ((tipo = ANY (ARRAY['deposito'::text, 'retiro'::text, 'ajuste'::text, 'otro'::text])))`
- `egresos_no_gasto_vigente_uq` *(único parcial)* — `retail.egresos_no_gasto (caja_movimiento_id) WHERE (revertido_en IS NULL)`

**De qué depende:** `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(revertido_por) REFERENCES personas(id)` · `(revisado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_legado_2026_09`

*15 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `categoria` | text | **no** | — | — |
| `proveedor_id` | uuid | sí | — | — |
| `documento_tipo` | text | **no** | `'sin_documento'::text` | — |
| `documento_serie` | text | sí | — | — |
| `documento_numero` | text | sí | — | — |
| `subtotal` | numeric | **no** | `0` | — |
| `igv` | numeric | **no** | `0` | — |
| `total` | numeric | **no** | — | — |
| `metodo_pago` | text | **no** | — | — |
| `especificacion` | text | sí | — | — |
| `usuario_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
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
| `gastos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |


### `cuentas_dinero`

*14 columnas · ~15 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `cuenta_contable` | text | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `numero` | text | sí | — | — |
| `saldo_inicial` | numeric | **no** | `0` | — |
| `saldo_desde` | date | sí | — | — |
| `orden` | integer | **no** | `100` | — |
| `archivada_en` | timestamp with time zone | sí | — | — |
| `archivada_por` | uuid | sí | — | — |
| `creada_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `persona_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_dinero_cajon_sin_saldo` — `CHECK (((tipo <> 'cajon'::text) OR ((saldo_inicial = (0)::numeric) AND (saldo_desde IS NULL))))`
- `cuentas_dinero_contable_del_tipo` — `CHECK ((((tipo = ANY (ARRAY['cajon'::text, 'caja_fuerte'::text, 'por_rendir'::text])) AND (cuenta_contable = '101'::text)) OR ((tipo = 'banco'::text) AND (cuenta_contable = '104'::text)) OR ((tipo = 'por_abonar'::text) AND (cuenta_contable = '105'::text)) OR ((tipo = 'tarjeta_credito'::text) AND (cuenta_contable = '451'::text)) OR ((tipo = 'fondo'::text) AND (cuenta_contable = '1413'::text))))`
- `cuentas_dinero_fondo_con_duena` — `CHECK (((tipo = 'fondo'::text) = (persona_id IS NOT NULL)))`
- `cuentas_dinero_fondo_sin_saldo` — `CHECK (((tipo <> 'fondo'::text) OR ((saldo_inicial = (0)::numeric) AND (saldo_desde IS NULL)) OR ((saldo_inicial > (0)::numeric) AND (saldo_desde IS NOT NULL))))`
- `cuentas_dinero_montos_finitos` — `CHECK ((abs(saldo_inicial) < 'Infinity'::numeric))`
- `cuentas_dinero_nombre_check` — `CHECK (((TRIM(BOTH FROM nombre) <> ''::text) AND (char_length(nombre) <= 80)))`
- `cuentas_dinero_numero_check` — `CHECK (((numero IS NULL) OR (char_length(numero) <= 40)))`
- `cuentas_dinero_saldo_con_fecha` — `CHECK (((saldo_inicial = (0)::numeric) OR (saldo_desde IS NOT NULL)))`
- `cuentas_dinero_tienda_del_tipo` — `CHECK (((tipo = ANY (ARRAY['cajon'::text, 'caja_fuerte'::text])) = (ubicacion_id IS NOT NULL)))`
- `cuentas_dinero_tipo_check` — `CHECK ((tipo = ANY (ARRAY['cajon'::text, 'caja_fuerte'::text, 'por_rendir'::text, 'banco'::text, 'por_abonar'::text, 'tarjeta_credito'::text, 'fondo'::text])))`
- `cuentas_dinero_de_sede_uq` *(único parcial)* — `retail.cuentas_dinero (ubicacion_id, tipo) WHERE (tipo = ANY (ARRAY['cajon'::text, 'caja_fuerte'::text]))`
- `cuentas_dinero_fondo_uq` *(único parcial)* — `retail.cuentas_dinero (persona_id) WHERE ((tipo = 'fondo'::text) AND (archivada_en IS NULL))`
- `cuentas_dinero_nombre_uq` *(único parcial)* — `retail.cuentas_dinero (lower(nombre)) WHERE (archivada_en IS NULL)`
- `cuentas_dinero_por_rendir_uq` *(único parcial)* — `retail.cuentas_dinero (tipo) WHERE (tipo = 'por_rendir'::text)`

**De qué depende:** `(archivada_por) REFERENCES personas(id)` · `(creada_por) REFERENCES personas(id)` · `(cuenta_contable) REFERENCES retail.cuentas(codigo)` · `(persona_id) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `medios_de_cobro`

*7 columnas · ~33 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `medio` | text | **no** | — | — |
| `cuenta_id` | uuid | sí | — | — |
| `vigente_desde` | date | **no** | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `medios_de_cobro_medio_check` — `CHECK ((medio = ANY (ARRAY['yape'::text, 'plin'::text, 'tarjeta'::text, 'transferencia'::text, 'qr'::text])))`

**De qué depende:** `(cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(registrado_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `movimientos_dinero`

*20 columnas · ~9 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `tipo` | text | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `cuenta_origen_id` | uuid | sí | — | — |
| `cuenta_destino_id` | uuid | sí | — | — |
| `monto` | numeric | **no** | — | — |
| `comision` | numeric | **no** | `0` | — |
| `gasto_comision_id` | uuid | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `referencia` | text | sí | — | — |
| `estado` | text | **no** | `'vigente'::text` | — |
| `motivo_anulacion` | text | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `caja_ingreso_id` | uuid | sí | — | — |
| `rendicion_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_dinero_anulacion` — `CHECK ((((estado = 'vigente'::text) AND (motivo_anulacion IS NULL) AND (anulado_por IS NULL) AND (anulado_en IS NULL)) OR ((estado = 'anulado'::text) AND (motivo_anulacion IS NOT NULL) AND (TRIM(BOTH FROM motivo_anulacion) <> ''::text) AND (anulado_en IS NOT NULL))))`
- `movimientos_dinero_comision` — `CHECK ((((tipo = 'abono_tarjeta'::text) OR (comision = (0)::numeric)) AND ((comision > (0)::numeric) = (gasto_comision_id IS NOT NULL))))`
- `movimientos_dinero_comision_check` — `CHECK ((comision >= (0)::numeric))`
- `movimientos_dinero_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulado'::text])))`
- `movimientos_dinero_faltante_de_rendicion` — `CHECK (((tipo = ANY (ARRAY['faltante_fondo_asumido'::text, 'faltante_fondo_deuda'::text, 'pago_deuda_fondo'::text])) = (rendicion_id IS NOT NULL)))`
- `movimientos_dinero_monto_check` — `CHECK ((monto > (0)::numeric))`
- `movimientos_dinero_monto_con_tope` — `CHECK (((monto <= (1000000)::numeric) OR (monto = 'NaN'::numeric)))`
- `movimientos_dinero_montos_finitos` — `CHECK (((abs(monto) < 'Infinity'::numeric) AND (abs(comision) < 'Infinity'::numeric)))`
- `movimientos_dinero_puntas` — `CHECK ( CASE     WHEN (tipo = ANY (ARRAY['aporte'::text, 'prestamo'::text, 'pago_deuda_fondo'::text])) THEN ((cuenta_origen_id IS NULL) AND (cuenta_destino_id IS NOT NULL))     WHEN (tipo = ANY (ARRAY['retiro'::text, 'devolucion_prestamo'::text, 'faltante_fondo_asumido'::text, 'faltante_fondo_deuda'::text, 'pago_planilla'::text, 'pago_sunat'::text])) THEN ((cuenta_origen_id IS NOT NULL) AND (cuenta_destino_id IS NULL))     ELSE ((cuenta_origen_id IS NOT NULL) AND (cuenta_destino_id IS NOT NULL) AND (cuenta_origen_id <> cuenta_destino_id)) END)`
- `movimientos_dinero_referencia_check` — `CHECK (((referencia IS NULL) OR (char_length(referencia) <= 200)))`
- `movimientos_dinero_tipo_check` — `CHECK ((tipo = ANY (ARRAY['aporte'::text, 'prestamo'::text, 'retiro'::text, 'devolucion_prestamo'::text, 'deposito'::text, 'abono_tarjeta'::text, 'pago_tarjeta'::text, 'entre_cuentas'::text, 'entrega_fondo'::text, 'devolucion_fondo'::text, 'faltante_fondo_asumido'::text, 'faltante_fondo_deuda'::text, 'pago_deuda_fondo'::text, 'pago_planilla'::text, 'pago_sunat'::text])))`
- `movimientos_dinero_token_cliente_key` — `UNIQUE (token_cliente)`
- `movimientos_dinero_caja_ingreso_uno` *(único parcial)* — `retail.movimientos_dinero (caja_ingreso_id) WHERE ((caja_ingreso_id IS NOT NULL) AND (estado = 'vigente'::text))`
- `movimientos_dinero_egreso_uq` *(único parcial)* — `retail.movimientos_dinero (caja_movimiento_id) WHERE ((estado = 'vigente'::text) AND (caja_movimiento_id IS NOT NULL))`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(caja_ingreso_id) REFERENCES retail.caja_movimientos(id)` · `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(cuenta_destino_id) REFERENCES retail.cuentas_dinero(id)` · `(cuenta_origen_id) REFERENCES retail.cuentas_dinero(id)` · `(gasto_comision_id) REFERENCES retail.gastos(id)` · `(registrado_por) REFERENCES personas(id)` · `(rendicion_id) REFERENCES retail.rendiciones_fondo(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `conciliaciones`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `saldo_banco` | numeric | **no** | — | — |
| `nota` | text | sí | — | — |
| `estado` | text | **no** | `'vigente'::text` | — |
| `motivo_anulacion` | text | sí | — | — |
| `anulada_por` | uuid | sí | — | — |
| `anulada_en` | timestamp with time zone | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `conciliaciones_anulacion` — `CHECK ((((estado = 'vigente'::text) AND (motivo_anulacion IS NULL) AND (anulada_en IS NULL)) OR ((estado = 'anulada'::text) AND (motivo_anulacion IS NOT NULL) AND (TRIM(BOTH FROM motivo_anulacion) <> ''::text) AND (anulada_en IS NOT NULL))))`
- `conciliaciones_estado_check` — `CHECK ((estado = ANY (ARRAY['vigente'::text, 'anulada'::text])))`
- `conciliaciones_montos_finitos` — `CHECK ((abs(saldo_banco) < 'Infinity'::numeric))`
- `conciliaciones_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 200)))`
- `conciliaciones_dia_uq` *(único parcial)* — `retail.conciliaciones (cuenta_id, fecha) WHERE (estado = 'vigente'::text)`

**De qué depende:** `(anulada_por) REFERENCES personas(id)` · `(cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `dinero_revisados`

*8 columnas · ~54 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `revisado_por` | uuid | sí | — | — |
| `revisado_en` | timestamp with time zone | **no** | `now()` | — |
| `desmarcado_por` | uuid | sí | — | — |
| `desmarcado_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `dinero_revisados_clave_check` — `CHECK ((char_length(clave) <= 200))`
- `dinero_revisados_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `dinero_revisados_vigente_uq` *(único parcial)* — `retail.dinero_revisados (cuenta_id, clave) WHERE (desmarcado_en IS NULL)`

**De qué depende:** `(cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(desmarcado_por) REFERENCES personas(id)` · `(revisado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cuentas_asignadas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `origen` | text | **no** | — | — |
| `origen_id` | uuid | **no** | — | — |
| `cuenta_id` | uuid | **no** | — | — |
| `asignado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_asignadas_origen_check` — `CHECK ((origen = ANY (ARRAY['pago'::text, 'pagoprod'::text, 'reembolso'::text, 'gasto'::text, 'activo'::text, 'traslado'::text])))`
- `cuentas_asignadas_una_vez` — `UNIQUE (origen, origen_id)`

**De qué depende:** `(asignado_por) REFERENCES personas(id)` · `(cuenta_id) REFERENCES retail.cuentas_dinero(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `parametros_finanzas`

*8 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | boolean | **no** | `true` | — |
| `minimo_caja` | numeric | **no** | `15000` | — |
| `aviso_gasto_pct` | numeric | **no** | `25` | — |
| `aviso_vence_dias` | integer | **no** | `7` | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |
| `inicio_finanzas` | date | sí | — | — |
| `cierre_pendientes_bloquean_desde` | date | **no** | `'2026-11-01'::date` | — |

**Candados** — lo que esta tabla hace imposible:

- `parametros_finanzas_aviso_gasto_pct_check` — `CHECK (((aviso_gasto_pct > (0)::numeric) AND (aviso_gasto_pct <= (500)::numeric)))`
- `parametros_finanzas_aviso_vence_dias_check` — `CHECK (((aviso_vence_dias >= 1) AND (aviso_vence_dias <= 60)))`
- `parametros_finanzas_id_check` — `CHECK (id)`
- `parametros_finanzas_inicio_primer_dia` — `CHECK (((inicio_finanzas IS NULL) OR (EXTRACT(day FROM inicio_finanzas) = (1)::numeric)))`
- `parametros_finanzas_minimo_caja_check` — `CHECK ((minimo_caja >= (0)::numeric))`
- `parametros_finanzas_montos_finitos` — `CHECK (((abs(minimo_caja) < 'Infinity'::numeric) AND (abs(aviso_gasto_pct) < 'Infinity'::numeric)))`
- `parametros_finanzas_pendientes_primer_dia` — `CHECK ((EXTRACT(day FROM cierre_pendientes_bloquean_desde) = (1)::numeric))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `presupuestos`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `mes` | date | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `cuenta` | text | **no** | — | — |
| `monto` | numeric | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `creado_en` | timestamp with time zone | **no** | `now()` | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `presupuestos_mes_check` — `CHECK ((mes = (date_trunc('month'::text, (mes)::timestamp with time zone))::date))`
- `presupuestos_monto_check` — `CHECK (((monto IS NULL) OR (monto > (0)::numeric)))`
- `presupuestos_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `presupuestos_una_casilla` — `UNIQUE NULLS NOT DISTINCT (mes, ubicacion_id, cuenta)`

**De qué depende:** `(cuenta) REFERENCES retail.cuentas(codigo)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_viaje`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `gasto_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `concepto` | text | **no** | — | — |
| `papel` | text | **no** | — | — |
| `serie_numero` | text | sí | — | — |
| `ruc_emisor` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_viaje_concepto_check` — `CHECK ((concepto = ANY (ARRAY['flete'::text, 'agencia'::text, 'cargador'::text, 'embalaje'::text, 'pasaje'::text, 'hotel'::text, 'comida'::text, 'taxi'::text, 'otro'::text])))`
- `gastos_viaje_concepto_del_tipo` — `CHECK ((((tipo = 'mercaderia'::text) AND (concepto = ANY (ARRAY['flete'::text, 'agencia'::text, 'cargador'::text, 'embalaje'::text, 'otro'::text]))) OR ((tipo = 'viaje'::text) AND (concepto = ANY (ARRAY['pasaje'::text, 'hotel'::text, 'comida'::text, 'taxi'::text, 'otro'::text])))))`
- `gastos_viaje_papel_check` — `CHECK ((papel = ANY (ARRAY['boleta'::text, 'factura'::text, 'ticket'::text, 'planilla_movilidad'::text])))`
- `gastos_viaje_planilla_sin_papel` — `CHECK (((papel <> 'planilla_movilidad'::text) OR ((serie_numero IS NULL) AND (ruc_emisor IS NULL))))`
- `gastos_viaje_planilla_solo_movilidad` — `CHECK (((papel <> 'planilla_movilidad'::text) OR (concepto = ANY (ARRAY['taxi'::text, 'cargador'::text]))))`
- `gastos_viaje_ruc_emisor_check` — `CHECK (((ruc_emisor IS NULL) OR (ruc_emisor ~ '^[0-9]{11}$'::text)))`
- `gastos_viaje_serie_numero_check` — `CHECK (((serie_numero IS NULL) OR ((length(btrim(serie_numero)) >= 1) AND (length(btrim(serie_numero)) <= 40))))`
- `gastos_viaje_tipo_check` — `CHECK ((tipo = ANY (ARRAY['mercaderia'::text, 'viaje'::text])))`

**De qué depende:** `(gasto_id) REFERENCES retail.gastos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_viaje_ordenes`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `gasto_id` | uuid | **no** | — | — |
| `orden_compra_id` | uuid | **no** | — | — |
| `monto` | numeric | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_viaje_ordenes_monto_check` — `CHECK ((monto > (0)::numeric))`
- `gastos_viaje_ordenes_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`

**De qué depende:** `(gasto_id) REFERENCES retail.gastos_viaje(gasto_id)` · `(orden_compra_id) REFERENCES retail.ordenes_compra(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gasto_viaje_fotos`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `gasto_id` | uuid | **no** | — | — |
| `ruta` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `bytes` | integer | **no** | — | — |
| `subida_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `archivada_en` | timestamp with time zone | sí | — | — |
| `archivada_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `gasto_viaje_fotos_bytes_check` — `CHECK (((bytes > 0) AND (bytes <= ((10 * 1024) * 1024))))`
- `gasto_viaje_fotos_nombre_check` — `CHECK (((char_length(btrim(nombre)) >= 1) AND (char_length(btrim(nombre)) <= 200)))`
- `gasto_viaje_fotos_ruta_de_su_gasto` — `CHECK ((ruta ~~ ((gasto_id)::text \|\| '/%'::text)))`
- `gasto_viaje_fotos_ruta_key` — `UNIQUE (ruta)`
- `gasto_viaje_fotos_tipo_permitido` — `CHECK ((tipo = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text, 'image/heif'::text])))`

**De qué depende:** `(archivada_por) REFERENCES personas(id)` · `(gasto_id) REFERENCES retail.gastos_viaje(gasto_id)` · `(subida_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `rendiciones_fondo`

*26 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `cuenta_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `estado` | text | **no** | `'por_aprobar'::text` | — |
| `arrastre` | numeric | **no** | — | — |
| `entregado` | numeric | **no** | — | — |
| `devuelto` | numeric | **no** | — | — |
| `pagado` | numeric | **no** | — | — |
| `gastos` | numeric | **no** | — | — |
| `otros` | numeric | **no** | — | — |
| `saldo` | numeric | **no** | — | — |
| `efectivo` | numeric | **no** | — | — |
| `faltante` | numeric | **no** | — | — |
| `explicacion` | text | sí | — | — |
| `items` | integer | **no** | — | — |
| `sin_foto` | integer | **no** | `0` | — |
| `rendida_por` | uuid | **no** | — | — |
| `rendida_en` | timestamp with time zone | **no** | `now()` | — |
| `token_cliente` | uuid | sí | — | — |
| `decision` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `aprobada_por` | uuid | sí | — | — |
| `aprobada_en` | timestamp with time zone | sí | — | — |
| `motivo_devolucion` | text | sí | — | — |
| `devuelta_por` | uuid | sí | — | — |
| `devuelta_en` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `rendiciones_fondo_cuadra` — `CHECK ((saldo = (((((arrastre + entregado) - devuelto) - pagado) - gastos) + otros)))`
- `rendiciones_fondo_decision_check` — `CHECK ((decision = ANY (ARRAY['asume_cayla'::text, 'deuda_persona'::text])))`
- `rendiciones_fondo_devuelto_check` — `CHECK ((devuelto >= (0)::numeric))`
- `rendiciones_fondo_efectivo_check` — `CHECK ((efectivo >= (0)::numeric))`
- `rendiciones_fondo_entregado_check` — `CHECK ((entregado >= (0)::numeric))`
- `rendiciones_fondo_estado_check` — `CHECK ((estado = ANY (ARRAY['por_aprobar'::text, 'aprobada'::text, 'devuelta'::text])))`
- `rendiciones_fondo_estados` — `CHECK ((((estado = 'por_aprobar'::text) AND (aprobada_en IS NULL) AND (devuelta_en IS NULL) AND (decision IS NULL)) OR ((estado = 'aprobada'::text) AND (aprobada_en IS NOT NULL) AND (aprobada_por IS NOT NULL) AND (devuelta_en IS NULL) AND (((faltante = (0)::numeric) AND (decision IS NULL)) OR ((faltante > (0)::numeric) AND (decision IS NOT NULL)))) OR ((estado = 'devuelta'::text) AND (devuelta_en IS NOT NULL) AND (devuelta_por IS NOT NULL) AND (aprobada_en IS NULL) AND (NULLIF(btrim(COALESCE(motivo_devolucion, ''::text)), ''::text) IS NOT NULL))))`
- `rendiciones_fondo_explicacion_check` — `CHECK (((explicacion IS NULL) OR ((char_length(btrim(explicacion)) >= 1) AND (char_length(btrim(explicacion)) <= 500))))`
- `rendiciones_fondo_faltante` — `CHECK ((faltante = (GREATEST(saldo, (0)::numeric) - efectivo)))`
- `rendiciones_fondo_faltante_check` — `CHECK ((faltante >= (0)::numeric))`
- `rendiciones_fondo_gastos_check` — `CHECK ((gastos >= (0)::numeric))`
- `rendiciones_fondo_items_check` — `CHECK ((items > 0))`
- `rendiciones_fondo_montos_finitos` — `CHECK (((abs(arrastre) < 'Infinity'::numeric) AND (abs(entregado) < 'Infinity'::numeric) AND (abs(devuelto) < 'Infinity'::numeric) AND (abs(pagado) < 'Infinity'::numeric) AND (abs(gastos) < 'Infinity'::numeric) AND (abs(otros) < 'Infinity'::numeric) AND (abs(saldo) < 'Infinity'::numeric) AND (abs(efectivo) < 'Infinity'::numeric) AND (abs(faltante) < 'Infinity'::numeric)))`
- `rendiciones_fondo_motivo_devolucion_check` — `CHECK (((motivo_devolucion IS NULL) OR (char_length(motivo_devolucion) <= 500)))`
- `rendiciones_fondo_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 500)))`
- `rendiciones_fondo_pagado_check` — `CHECK ((pagado >= (0)::numeric))`
- `rendiciones_fondo_sin_foto_check` — `CHECK ((sin_foto >= 0))`
- `rendiciones_fondo_token_cliente_key` — `UNIQUE (token_cliente)`
- `rendiciones_fondo_una_abierta` *(único parcial)* — `retail.rendiciones_fondo (cuenta_id) WHERE (estado = 'por_aprobar'::text)`

**De qué depende:** `(aprobada_por) REFERENCES personas(id)` · `(cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(devuelta_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(rendida_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `rendicion_fondo_items`

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `rendicion_id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `origen` | text | **no** | — | — |
| `monto` | numeric | **no** | — | — |
| `vigente` | boolean | **no** | `true` | — |

**Candados** — lo que esta tabla hace imposible:

- `rendicion_fondo_items_montos_finitos` — `CHECK ((abs(monto) < 'Infinity'::numeric))`
- `rendicion_fondo_items_una_vez` *(único parcial)* — `retail.rendicion_fondo_items (clave) WHERE vigente`

**De qué depende:** `(rendicion_id) REFERENCES retail.rendiciones_fondo(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_fijos_ficha`

*19 columnas · ~29 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `gasto_fijo_id` | uuid | **no** | — | — |
| `beneficiario` | text | sí | — | — |
| `documento_tipo` | text | sí | — | — |
| `documento_numero` | text | sí | — | — |
| `telefono` | text | sí | — | — |
| `correo` | text | sí | — | — |
| `forma_de_pago` | text | sí | — | — |
| `banco` | text | sí | — | — |
| `cuenta_bancaria` | text | sí | — | — |
| `cci` | text | sí | — | — |
| `celular_billetera` | text | sí | — | — |
| `billeteras` | ARRAY | sí | — | — |
| `titular_cuenta` | text | sí | — | — |
| `codigo_servicio` | text | sí | — | — |
| `recibo_llega` | text | sí | — | — |
| `contrato_vence` | date | sí | — | — |
| `notas` | text | sí | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_fijos_ficha_billetera_coherente` — `CHECK (((celular_billetera IS NULL) = (billeteras IS NULL)))`
- `gastos_fijos_ficha_billeteras_validas` — `CHECK (((billeteras IS NULL) OR (((cardinality(billeteras) >= 1) AND (cardinality(billeteras) <= 2)) AND (billeteras <@ ARRAY['yape'::text, 'plin'::text]))))`
- `gastos_fijos_ficha_cci_formato` — `CHECK (((cci IS NULL) OR (cci ~ '^[0-9]{20}$'::text)))`
- `gastos_fijos_ficha_celular_formato` — `CHECK (((celular_billetera IS NULL) OR (celular_billetera ~ '^9[0-9]{8}$'::text)))`
- `gastos_fijos_ficha_contacto_formato` — `CHECK ((((telefono IS NULL) OR ((telefono ~ '^[0-9+() -]+$'::text) AND ((char_length(regexp_replace(telefono, '[^0-9]'::text, ''::text, 'g'::text)) >= 6) AND (char_length(regexp_replace(telefono, '[^0-9]'::text, ''::text, 'g'::text)) <= 15)))) AND ((correo IS NULL) OR (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))))`
- `gastos_fijos_ficha_contrato_fecha_real` — `CHECK (((contrato_vence IS NULL) OR ((contrato_vence >= '2000-01-01'::date) AND (contrato_vence <= '2100-01-01'::date))))`
- `gastos_fijos_ficha_documento` — `CHECK ((((documento_tipo IS NULL) = (documento_numero IS NULL)) AND ((documento_tipo IS NULL) OR (documento_tipo = ANY (ARRAY['dni'::text, 'ruc'::text, 'ce'::text, 'otro'::text]))) AND ((documento_tipo IS DISTINCT FROM 'dni'::text) OR (documento_numero ~ '^[0-9]{8}$'::text)) AND ((documento_tipo IS DISTINCT FROM 'ruc'::text) OR (documento_numero ~ '^[0-9]{11}$'::text)) AND ((documento_tipo IS DISTINCT FROM 'ce'::text) OR (documento_numero ~ '^[A-Za-z0-9]{6,20}$'::text)) AND ((documento_tipo IS DISTINCT FROM 'otro'::text) OR ((char_length(documento_numero) >= 1) AND (char_length(documento_numero) <= 20)))))`
- `gastos_fijos_ficha_forma_valida` — `CHECK (((forma_de_pago IS NULL) OR (forma_de_pago = ANY (ARRAY['transferencia'::text, 'billetera'::text, 'deposito'::text, 'efectivo'::text, 'recibo'::text, 'debito'::text]))))`
- `gastos_fijos_ficha_sin_vacios` — `CHECK ((((beneficiario IS NULL) OR (btrim(beneficiario) <> ''::text)) AND ((documento_numero IS NULL) OR (btrim(documento_numero) <> ''::text)) AND ((telefono IS NULL) OR (btrim(telefono) <> ''::text)) AND ((correo IS NULL) OR (btrim(correo) <> ''::text)) AND ((banco IS NULL) OR (btrim(banco) <> ''::text)) AND ((cuenta_bancaria IS NULL) OR (btrim(cuenta_bancaria) <> ''::text)) AND ((titular_cuenta IS NULL) OR (btrim(titular_cuenta) <> ''::text)) AND ((codigo_servicio IS NULL) OR (btrim(codigo_servicio) <> ''::text)) AND ((recibo_llega IS NULL) OR (btrim(recibo_llega) <> ''::text)) AND ((notas IS NULL) OR (btrim(notas) <> ''::text))))`
- `gastos_fijos_ficha_textos_con_tope` — `CHECK (((char_length(beneficiario) <= 120) AND (char_length(telefono) <= 30) AND (char_length(correo) <= 120) AND (char_length(banco) <= 60) AND (char_length(cuenta_bancaria) <= 40) AND (char_length(titular_cuenta) <= 120) AND (char_length(codigo_servicio) <= 60) AND (char_length(recibo_llega) <= 200) AND (char_length(notas) <= 500)))`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(gasto_fijo_id) REFERENCES retail.gastos_fijos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `gastos_fijos_ficha_cambios`

*7 columnas · ~58 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `gasto_fijo_id` | uuid | **no** | — | — |
| `campo` | text | **no** | — | — |
| `antes` | text | sí | — | — |
| `despues` | text | sí | — | — |
| `cambiado_por` | uuid | sí | — | — |
| `cambiado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `gastos_fijos_ficha_cambios_cambio_real` — `CHECK ((antes IS DISTINCT FROM despues))`
- `gastos_fijos_ficha_cambios_campo_check` — `CHECK ((campo = ANY (ARRAY['beneficiario'::text, 'documento'::text, 'forma_de_pago'::text, 'banco'::text, 'cuenta_bancaria'::text, 'cci'::text, 'celular_billetera'::text, 'billeteras'::text, 'titular_cuenta'::text])))`

**De qué depende:** `(gasto_fijo_id) REFERENCES retail.gastos_fijos(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pos_maquinas`

*7 columnas · ~2 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombre` | text | **no** | — | — |
| `cuenta_id` | uuid | **no** | — | — |
| `orden` | integer | **no** | `100` | — |
| `archivada_en` | timestamp with time zone | sí | — | — |
| `creada_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `pos_maquinas_cuenta_id_key` — `UNIQUE (cuenta_id)`
- `pos_maquinas_nombre_check` — `CHECK (((TRIM(BOTH FROM nombre) <> ''::text) AND (char_length(nombre) <= 40)))`
- `pos_maquinas_nombre_uq` *(único parcial)* — `retail.pos_maquinas (lower(nombre)) WHERE (archivada_en IS NULL)`

**De qué depende:** `(creada_por) REFERENCES personas(id)` · `(cuenta_id) REFERENCES retail.cuentas_dinero(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pos_maquinas_sedes`

*4 columnas · ~8 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `maquina_id` | uuid | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `medio` | text | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `pos_maquinas_sedes_medio_check` — `CHECK ((medio = ANY (ARRAY['tarjeta'::text, 'qr'::text])))`

**De qué depende:** `(maquina_id) REFERENCES retail.pos_maquinas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pos_tarifas`

*10 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `maquina_id` | uuid | **no** | — | — |
| `medio` | text | **no** | — | — |
| `tasa_pct` | numeric | **no** | — | — |
| `igv_sobre_tasa` | boolean | **no** | `true` | — |
| `cargo_fijo` | numeric | **no** | `0` | — |
| `dias_abono` | smallint | **no** | `3` | — |
| `vigente_desde` | date | **no** | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `pos_tarifas_cargo_fijo_check` — `CHECK (((cargo_fijo >= (0)::numeric) AND (cargo_fijo <= (50)::numeric)))`
- `pos_tarifas_dias_abono_check` — `CHECK (((dias_abono >= 0) AND (dias_abono <= 15)))`
- `pos_tarifas_medio_check` — `CHECK ((medio = ANY (ARRAY['tarjeta'::text, 'qr'::text])))`
- `pos_tarifas_tasa_pct_check` — `CHECK (((tasa_pct >= (0)::numeric) AND (tasa_pct <= (100)::numeric)))`

**De qué depende:** `(maquina_id) REFERENCES retail.pos_maquinas(id)` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `pos_abonos_lotes`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `movimiento_dinero_id` | uuid | **no** | — | — |
| `cuenta_id` | uuid | **no** | — | — |
| `clave` | text | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `ubicacion_id` | uuid | **no** | — | — |
| `medio` | text | **no** | — | — |
| `bruto` | numeric | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `pos_abonos_lotes_clave_check` — `CHECK ((clave ~~ 'cobros:%'::text))`
- `pos_abonos_lotes_medio_check` — `CHECK ((medio = ANY (ARRAY['tarjeta'::text, 'qr'::text])))`
- `pos_abonos_lotes_movimiento_dinero_id_clave_key` — `UNIQUE (movimiento_dinero_id, clave)`

**De qué depende:** `(cuenta_id) REFERENCES retail.cuentas_dinero(id)` · `(movimiento_dinero_id) REFERENCES retail.movimientos_dinero(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `cobros_resellados`

*7 columnas · ~317 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `origen` | text | **no** | — | — |
| `origen_id` | uuid | **no** | — | — |
| `cuenta_antes` | uuid | sí | — | — |
| `cuenta_despues` | uuid | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `hecho_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `cobros_resellados_motivo_check` — `CHECK ((TRIM(BOTH FROM motivo) <> ''::text))`
- `cobros_resellados_origen_check` — `CHECK ((origen = 'venta_pago'::text))`

**De qué depende:** `(cuenta_antes) REFERENCES retail.cuentas_dinero(id)` · `(cuenta_despues) REFERENCES retail.cuentas_dinero(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 12 · Urraca — Contabilidad

### `activos_fijos`

*29 columnas · ~33 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | el bien concreto: esa máquina, ese mostrador, ese equipo de cómputo |
| `ubicacion_id` | uuid | **no** | — | — |
| `nombre` | text | **no** | — | cómo se le dice al bien en la boutique o el taller: «Remalladora Siruba» |
| `serie` | text | sí | — | número de serie del fabricante; sin él un robo no se le prueba al seguro |
| `descripcion` | text | sí | — | detalle libre del bien |
| `cuenta_codigo` | text | sí | — | código de la cuenta del plan contable donde se lleva el bien: 333 maquinaria, 335 muebles, 336 equipos diversos |
| `costo` | numeric | **no** | — | lo que costó el bien el día que se compró, en soles |
| `valor_residual` | numeric | **no** | `0` | lo que valdría al terminar su vida útil: el costo menos este valor es lo que se reparte como depreciación, y tiene que ser menor que el costo |
| `vida_util_meses` | integer | **no** | — | cuántos meses dura el bien: en ese plazo se reparte su depreciación; entre 1 y 600 |
| `tasa_anual` | numeric | **no** | — | tasa SUNAT de depreciación anual, 0.1000 es 10% |
| `fecha_adquisicion` | date | **no** | — | desde cuándo se deprecia el bien |
| `depreciacion_apertura` | numeric | **no** | `0` | desgaste que el bien ya traía acumulado cuando se cargó al sistema: el punto de partida de su depreciación |
| `estado` | text | **no** | `'activo'::text` | — |
| `nota` | text | sí | — | comentario libre sobre el bien |
| `created_at` | timestamp with time zone | **no** | `now()` | cuándo entró la ficha al sistema, no cuándo se compró el bien |
| `updated_at` | timestamp with time zone | **no** | `now()` | cuándo se editó la ficha por última vez; lo pisa solo el trigger |
| `tipo` | text | sí | — | — |
| `compra_id` | uuid | sí | — | — |
| `medio_pago` | text | sí | — | — |
| `caja_movimiento_id` | uuid | sí | — | — |
| `fecha_baja` | date | sí | — | — |
| `motivo_baja` | text | sí | — | — |
| `motivo_anulacion` | text | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_en` | timestamp with time zone | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `token_cliente` | uuid | sí | — | — |
| `cuenta_dinero_id` | uuid | sí | — | — |
| `carga_inicial` | boolean | **no** | `false` | — |

**Candados** — lo que esta tabla hace imposible:

- `activos_fijos_anulacion_coherente` — `CHECK (((estado = 'anulado'::text) = ((motivo_anulacion IS NOT NULL) AND (TRIM(BOTH FROM motivo_anulacion) <> ''::text) AND (anulado_en IS NOT NULL))))`
- `activos_fijos_baja_coherente` — `CHECK (((estado = 'baja'::text) = ((fecha_baja IS NOT NULL) AND (motivo_baja IS NOT NULL) AND (TRIM(BOTH FROM motivo_baja) <> ''::text))))`
- `activos_fijos_costo_positivo` — `CHECK (((costo > (0)::numeric) AND (valor_residual >= (0)::numeric) AND (valor_residual < costo) AND ((vida_util_meses >= 1) AND (vida_util_meses <= 600))))`
- `activos_fijos_estado_check` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'baja'::text, 'vendido'::text, 'anulado'::text])))`
- `activos_fijos_medio_pago_check` — `CHECK (((medio_pago IS NULL) OR (medio_pago = ANY (ARRAY['efectivo'::text, 'yape'::text, 'plin'::text, 'transferencia'::text, 'tarjeta'::text]))))`
- `activos_fijos_montos_finitos` — `CHECK (((abs(costo) < 'Infinity'::numeric) AND (abs(valor_residual) < 'Infinity'::numeric) AND (abs(tasa_anual) < 'Infinity'::numeric) AND (abs(depreciacion_apertura) < 'Infinity'::numeric)))`
- `activos_fijos_pago_coherente` — `CHECK (((carga_inicial AND (compra_id IS NULL) AND (medio_pago IS NULL) AND (caja_movimiento_id IS NULL) AND (cuenta_dinero_id IS NULL)) OR ((NOT carga_inicial) AND (((compra_id IS NULL) AND (medio_pago IS NOT NULL) AND ((caja_movimiento_id IS NULL) OR (medio_pago = 'efectivo'::text)) AND ((medio_pago <> 'efectivo'::text) OR (caja_movimiento_id IS NOT NULL) OR (cuenta_dinero_id IS NOT NULL))) OR ((compra_id IS NOT NULL) AND (medio_pago IS NULL) AND (cuenta_dinero_id IS NULL))))))`
- `activos_fijos_textos_con_tope` — `CHECK (((char_length(nombre) <= 120) AND (char_length(serie) <= 60)))`
- `activos_fijos_compra_uq` *(único parcial)* — `retail.activos_fijos (compra_id) WHERE ((compra_id IS NOT NULL) AND (estado <> 'anulado'::text))`
- `activos_fijos_egreso_uq` *(único parcial)* — `retail.activos_fijos (caja_movimiento_id) WHERE ((caja_movimiento_id IS NOT NULL) AND (estado <> 'anulado'::text))`
- `activos_fijos_token_uq` *(único parcial)* — `retail.activos_fijos (token_cliente) WHERE (token_cliente IS NOT NULL)`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(caja_movimiento_id) REFERENCES retail.caja_movimientos(id)` · `(compra_id) REFERENCES retail.compras(id)` · `(cuenta_dinero_id) REFERENCES retail.cuentas_dinero(id)` · `(registrado_por) REFERENCES personas(id)` · `(tipo) REFERENCES retail.tipos_activo(codigo)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `activos_fijos_select` | SELECT | `( SELECT retail.fn_tiene_acceso_retail() AS fn_tiene_acceso_retail)` |
| `activos_fijos_write_lider` | ALL | `( SELECT retail.fn_es_lider() AS fn_es_lider)` |


### `cuentas`

*6 columnas · ~47 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `seccion_resultados` | text | sí | — | — |
| `activo` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `cuentas_codigo_check` — `CHECK ((codigo ~ '^[0-9]{2,4}$'::text))`
- `cuentas_nombre_check` — `CHECK ((TRIM(BOTH FROM nombre) <> ''::text))`
- `cuentas_seccion_coherente` — `CHECK (((seccion_resultados IS NULL) OR (tipo = ANY (ARRAY['ingreso'::text, 'gasto'::text]))))`
- `cuentas_seccion_resultados_check` — `CHECK ((seccion_resultados = ANY (ARRAY['ventas'::text, 'costo_ventas'::text, 'fletes'::text, 'mermas'::text, 'gastos_operacion'::text])))`
- `cuentas_tipo_check` — `CHECK ((tipo = ANY (ARRAY['activo'::text, 'pasivo'::text, 'patrimonio'::text, 'ingreso'::text, 'gasto'::text])))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `tipos_activo`

*7 columnas · ~6 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `ejemplos` | text | **no** | `''::text` | — |
| `cuenta_pcge` | text | **no** | — | — |
| `vida_util_meses` | integer | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `tipos_activo_codigo_check` — `CHECK ((codigo ~ '^[a-z_]+$'::text))`
- `tipos_activo_nombre_check` — `CHECK ((TRIM(BOTH FROM nombre) <> ''::text))`
- `tipos_activo_vida_util_meses_check` — `CHECK (((vida_util_meses >= 12) AND (vida_util_meses <= 600)))`

**De qué depende:** `(cuenta_pcge) REFERENCES retail.cuentas(codigo)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `parametros_tributarios`

*9 columnas · ~22 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `nombre` | text | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `valor` | numeric | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `texto` | text | sí | — | — |
| `provisional` | boolean | **no** | `false` | — |
| `registrado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `parametros_tributarios_anual` — `CHECK (((nombre = ANY (ARRAY['igv'::text, 'igv_general'::text, 'igv_ipm'::text, 'tope_planilla_movilidad'::text, 'saldo_favor_igv'::text])) OR ((EXTRACT(month FROM vigente_desde) = (1)::numeric) AND (EXTRACT(day FROM vigente_desde) = (1)::numeric))))`
- `parametros_tributarios_montos_finitos` — `CHECK ((abs(valor) < 'Infinity'::numeric))`
- `parametros_tributarios_nombre_check` — `CHECK ((nombre = ANY (ARRAY['igv'::text, 'uit'::text, 'umbral_uit'::text, 'renta_pago_cuenta'::text, 'regimen'::text, 'tope_planilla_movilidad'::text, 'saldo_favor_igv'::text, 'igv_general'::text, 'igv_ipm'::text, 'aviso_umbral_uit'::text, 'ventas_previas_erp'::text])))`
- `parametros_tributarios_valor_coherente` — `CHECK ( CASE nombre     WHEN 'regimen'::text THEN ((valor IS NULL) AND (texto = ANY (ARRAY['rmt'::text, 'general'::text, 'rer'::text, 'nrus'::text])))     WHEN 'igv'::text THEN ((texto IS NULL) AND (valor > (0)::numeric) AND (valor < (1)::numeric))     WHEN 'igv_general'::text THEN ((texto IS NULL) AND (valor > (0)::numeric) AND (valor < (1)::numeric))     WHEN 'igv_ipm'::text THEN ((texto IS NULL) AND (valor > (0)::numeric) AND (valor < (1)::numeric))     WHEN 'renta_pago_cuenta'::text THEN ((texto IS NULL) AND (valor >= (0)::numeric) AND (valor < (1)::numeric))     WHEN 'uit'::text THEN ((texto IS NULL) AND (valor >= (1000)::numeric) AND (valor <= (100000)::numeric))     WHEN 'umbral_uit'::text THEN ((texto IS NULL) AND (valor > (0)::numeric) AND (valor <= (100000)::numeric))     WHEN 'aviso_umbral_uit'::text THEN ((texto IS NULL) AND (valor > (0)::numeric) AND (valor <= (100000)::numeric))     WHEN 'tope_planilla_movilidad'::text THEN ((texto IS NULL) AND (valor > (0)::numeric) AND (valor <= (1000)::numeric))     WHEN 'saldo_favor_igv'::text THEN ((texto IS NULL) AND (valor >= (0)::numeric) AND (valor <= (10000000)::numeric))     WHEN 'ventas_previas_erp'::text THEN ((texto IS NULL) AND (valor >= (0)::numeric) AND (valor <= (10000000)::numeric))     ELSE false END)`

**De qué depende:** `(registrado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `saldos_iniciales`

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `fecha` | date | **no** | — | — |
| `cuenta` | text | **no** | — | — |
| `debe` | numeric | **no** | `0` | — |
| `haber` | numeric | **no** | `0` | — |
| `origen` | text | **no** | `'manual'::text` | — |
| `nota` | text | sí | — | — |
| `reemplaza_id` | uuid | sí | — | — |
| `motivo` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `clock_timestamp()` | — |

**Candados** — lo que esta tabla hace imposible:

- `saldos_iniciales_correccion_con_motivo` — `CHECK (((reemplaza_id IS NULL) OR (char_length(TRIM(BOTH FROM COALESCE(motivo, ''::text))) >= 5)))`
- `saldos_iniciales_debe_check` — `CHECK ((debe >= (0)::numeric))`
- `saldos_iniciales_haber_check` — `CHECK ((haber >= (0)::numeric))`
- `saldos_iniciales_montos_finitos` — `CHECK (((abs(debe) < 'Infinity'::numeric) AND (abs(haber) < 'Infinity'::numeric)))`
- `saldos_iniciales_motivo_check` — `CHECK (((motivo IS NULL) OR (char_length(motivo) <= 300)))`
- `saldos_iniciales_nota_check` — `CHECK (((nota IS NULL) OR (char_length(nota) <= 300)))`
- `saldos_iniciales_origen_check` — `CHECK ((origen = ANY (ARRAY['sistema'::text, 'manual'::text])))`
- `saldos_iniciales_un_lado` — `CHECK ((NOT ((debe > (0)::numeric) AND (haber > (0)::numeric))))`
- `saldos_iniciales_reemplaza_uq` *(único parcial)* — `retail.saldos_iniciales (reemplaza_id) WHERE (reemplaza_id IS NOT NULL)`

**De qué depende:** `(cuenta) REFERENCES retail.cuentas(codigo)` · `(reemplaza_id) REFERENCES retail.saldos_iniciales(id)` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `periodos`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `mes` | date | **no** | — | — |
| `alcance` | text | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `estado` | text | **no** | — | — |
| `cierre_id` | uuid | sí | — | — |
| `actualizado_en` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `periodos_alcance_check` — `CHECK ((alcance = ANY (ARRAY['ubicacion'::text, 'empresa'::text, 'consolidado'::text])))`
- `periodos_cerrado_con_cierre` — `CHECK (((estado = 'cerrado'::text) = (cierre_id IS NOT NULL)))`
- `periodos_estado_check` — `CHECK ((estado = ANY (ARRAY['cerrado'::text, 'reabierto'::text])))`
- `periodos_mes_primer_dia` — `CHECK ((mes = (date_trunc('month'::text, (mes)::timestamp with time zone))::date))`
- `periodos_unidad_coherente` — `CHECK (((alcance = 'ubicacion'::text) = (ubicacion_id IS NOT NULL)))`

**De qué depende:** `(cierre_id) REFERENCES retail.periodo_cierres(id) DEFERRABLE INITIALLY DEFERRED` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `periodo_cierres`

*17 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | — | — |
| `periodo_id` | uuid | **no** | — | — |
| `mes` | date | **no** | — | — |
| `alcance` | text | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `version` | integer | **no** | — | — |
| `cerrado_en` | timestamp with time zone | **no** | `now()` | — |
| `cerrado_por` | uuid | **no** | — | — |
| `huella` | text | **no** | — | — |
| `lineas` | integer | **no** | — | — |
| `total_debe` | numeric | **no** | — | — |
| `total_haber` | numeric | **no** | — | — |
| `unidades` | jsonb | sí | — | — |
| `avisos` | jsonb | **no** | `'[]'::jsonb` | — |
| `reabierto_en` | timestamp with time zone | sí | — | — |
| `reabierto_por` | uuid | sí | — | — |
| `motivo_reapertura` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `periodo_cierres_cuadra` — `CHECK ((round(total_debe, 2) = round(total_haber, 2)))`
- `periodo_cierres_huella_check` — `CHECK ((huella ~ '^[0-9a-f]{64}$'::text))`
- `periodo_cierres_lineas_check` — `CHECK ((lineas >= 0))`
- `periodo_cierres_montos_finitos` — `CHECK (((abs(total_debe) < 'Infinity'::numeric) AND (abs(total_haber) < 'Infinity'::numeric)))`
- `periodo_cierres_periodo_id_version_key` — `UNIQUE (periodo_id, version)`
- `periodo_cierres_reapertura` — `CHECK ((((reabierto_en IS NULL) AND (reabierto_por IS NULL) AND (motivo_reapertura IS NULL)) OR ((reabierto_en IS NOT NULL) AND (reabierto_por IS NOT NULL) AND (char_length(TRIM(BOTH FROM motivo_reapertura)) >= 5))))`
- `periodo_cierres_version_check` — `CHECK ((version >= 1))`

**De qué depende:** `(cerrado_por) REFERENCES personas(id)` · `(periodo_id) REFERENCES retail.periodos(id)` · `(reabierto_por) REFERENCES personas(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `diario_cerrado`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `cierre_id` | uuid | **no** | — | — |
| `n` | integer | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `asiento` | text | **no** | — | — |
| `regla` | text | **no** | — | — |
| `cuenta` | text | **no** | — | — |
| `debe` | numeric | **no** | `0` | — |
| `haber` | numeric | **no** | `0` | — |
| `origen_tabla` | text | sí | — | — |
| `origen_id` | uuid | sí | — | — |
| `glosa` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `diario_cerrado_linea` — `CHECK (((debe >= (0)::numeric) AND (haber >= (0)::numeric) AND (NOT ((debe > (0)::numeric) AND (haber > (0)::numeric)))))`
- `diario_cerrado_montos_finitos` — `CHECK (((abs(debe) < 'Infinity'::numeric) AND (abs(haber) < 'Infinity'::numeric)))`

**De qué depende:** `(cierre_id) REFERENCES retail.periodo_cierres(id) DEFERRABLE INITIALLY DEFERRED` · `(cuenta) REFERENCES retail.cuentas(codigo)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 13 · Águila — Inteligencia y reportes

### `actividad`

*14 columnas · ~5244 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | bigint | **no** | — | — |
| `ocurrio_at` | timestamp with time zone | **no** | — | — |
| `modulo` | text | **no** | — | — |
| `accion` | text | **no** | — | — |
| `descripcion` | text | **no** | — | — |
| `persona_id` | uuid | sí | — | — |
| `terminal_id` | uuid | sí | — | — |
| `ubicacion_id` | uuid | sí | — | — |
| `ubicacion_destino_id` | uuid | sí | — | — |
| `tabla` | text | **no** | — | — |
| `registro_id` | text | **no** | — | — |
| `detalle` | jsonb | **no** | `'{}'::jsonb` | — |
| `origen` | text | **no** | `'vivo'::text` | — |
| `anotado_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `actividad_accion_check` — `CHECK ((accion ~ '^[a-z_]+$'::text))`
- `actividad_descripcion_check` — `CHECK ((length(btrim(descripcion)) > 0))`
- `actividad_origen_check` — `CHECK ((origen = ANY (ARRAY['vivo'::text, 'carga_inicial'::text])))`

**De qué depende:** `(modulo) REFERENCES retail.modulos(clave)` · `(persona_id) REFERENCES personas(id)` · `(terminal_id) REFERENCES retail.terminales(id)` · `(ubicacion_destino_id) REFERENCES retail.ubicaciones(id)` · `(ubicacion_id) REFERENCES retail.ubicaciones(id)`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.



## 14 · Gorrión — Plataforma y esquema

### `huellas_llave`

*3 columnas · ~1 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | smallint | **no** | `1` | — |
| `llave_sha256` | text | **no** | — | — |
| `creada_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `huellas_llave_id_check` — `CHECK ((id = 1))`
- `huellas_llave_llave_sha256_check` — `CHECK ((llave_sha256 ~ '^[0-9a-f]{64}$'::text))`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.

