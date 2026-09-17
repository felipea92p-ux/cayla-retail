# Diccionario — CAYLA Dynamic (schema `public`)

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre `pnpm datos:generar`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en `glosario.json` y este generador respeta.
>
> **Origen:** `supabase_db_cayla-dynamic`
> **Leído el:** 2026-09-12 20:18:01
> **Tablas y vistas encontradas:** 67
>
> Este es el sistema de personas de CAYLA (asistencia, planilla). Vive en el mismo
> proyecto de base de datos que Retail: `public` es Dynamic, `retail` es la tienda.
> La frontera entre ambos está explicada en `docs/datos/14-DYNAMIC.md`.
---

### `actas_descanso_sustitutorio`

> Documento firmado que respalda un acuerdo de descanso sustitutorio. Un acta cubre muchos registros de feriados_descanso_sustitutorio; el vínculo es actas.referencia = dcs.acta_ref.

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `referencia` | text | **no** | — | — |
| `archivo_base64` | text | sí | — | — |
| `archivo_nombre` | text | sí | — | — |
| `subida_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `storage_path` | text | sí | — | Ruta en el bucket «actas». Las actas subidas antes de la 0175 tienen esto en null y su archivo en archivo_base64; se leen de ahí. |

**Candados** — lo que esta tabla hace imposible:

- `actas_descanso_sustitutorio_referencia_check` — `CHECK ((length(TRIM(BOTH FROM referencia)) >= 3))`
- `chk_acta_un_solo_archivo` — `CHECK (((archivo_base64 IS NULL) OR (storage_path IS NULL)))`
- `actas_descanso_sustitutorio_referencia_key` — `UNIQUE (referencia)`

**De qué depende:** `(subida_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `actas_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `alertas`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | sí | — | — |
| `tipo` | text | **no** | — | — |
| `canal` | text | **no** | — | — |
| `payload` | jsonb | **no** | `'{}'::jsonb` | — |
| `enviado_at` | timestamp with time zone | sí | — | — |
| `leido_at` | timestamp with time zone | sí | — | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `nota_fallo` | text | sí | — | — |
| `intentos` | integer | **no** | `0` | Cuántas veces el despacho reservó esta fila para intentar enviarla. Lo sube fn_alertas_reservar; a partir de 3 ya no se reintenta (0362). |
| `procesando_desde` | timestamp with time zone | sí | — | Desde cuándo está reservada por una ejecución del despacho. Más de una hora en 'procesando' significa que esa ejecución murió (0362). |
| `ultimo_intento_at` | timestamp with time zone | sí | — | Última vez que el despacho intentó enviarla, con éxito o sin él (0362). |

**Candados** — lo que esta tabla hace imposible:

- `alertas_canal_check` — `CHECK ((canal = ANY (ARRAY['push'::text, 'email'::text])))`
- `alertas_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'procesando'::text, 'enviado'::text, 'fallido'::text])))`
- `alertas_tipo_check` — `CHECK ((tipo = ANY (ARRAY['olvido_salida'::text, 'tardanza'::text, 'salida_no_retornada'::text, 'auto_cierre'::text, 'digest_diario'::text, 'vacaciones_por_vencer'::text, 'contrato_por_vencer'::text])))`

**De qué depende:** `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `alertas_marcar_leida_propia` | UPDATE | `(persona_id = fn_persona_actual_id())` |
| `alertas_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `alertas_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `alertas_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `anuncios`

> Comunicados de Desarrollo Organizacional al equipo. Nunca se edita ni se borra: se anula y, si hace falta corregir, se publica uno nuevo.

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `titulo` | text | **no** | — | — |
| `cuerpo` | text | **no** | — | — |
| `sede_id` | uuid | sí | — | null = las cuatro sedes. Con valor, solo esa sede lo ve. |
| `publicado_por` | uuid | **no** | — | — |
| `publicado_at` | timestamp with time zone | **no** | `now()` | — |
| `anulado_at` | timestamp with time zone | sí | — | — |
| `anulado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `anuncios_cuerpo_check` — `CHECK ((btrim(cuerpo) <> ''::text))`
- `anuncios_titulo_check` — `CHECK (((btrim(titulo) <> ''::text) AND (char_length(titulo) <= 200)))`
- `chk_anuncios_anulado_completo` — `CHECK (((anulado_at IS NULL) = (anulado_por IS NULL)))`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(publicado_por) REFERENCES personas(id)` · `(sede_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `anuncios_select_do` | SELECT | `(fn_es_admin_o_lider() IS TRUE)` |
| `anuncios_select_equipo` | SELECT | `((anulado_at IS NULL) AND ((sede_id IS NULL) OR (sede_id = ( SELECT p.sede_base_id    FROM personas p   WHERE (p.id = fn_persona_actual_id())))))` |


### `anuncios_leidos`

> Quién ya vio cada anuncio. Marcador de alcance, no un acuse legal — para eso está documentos_institucionales.

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `anuncio_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `leido_at` | timestamp with time zone | **no** | `now()` | — |

**De qué depende:** `(anuncio_id) REFERENCES anuncios(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `anuncios_leidos_select_do` | SELECT | `(fn_es_admin_o_lider() IS TRUE)` |
| `anuncios_leidos_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |


### `areas`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `operativa` | boolean | **no** | `false` | — |
| `activa` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | `100` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `areas_codigo_check` — `CHECK ((codigo ~ '^[a-z0-9_]{2,40}$'::text))`
- `areas_nombre_check` — `CHECK ((length(TRIM(BOTH FROM nombre)) >= 2))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `areas_select_autenticados` | SELECT | `true` |


### `asignaciones_educacion`

> Asignación por educación (art. 19 f) D.S. 001-97-TR), por persona y con vigencia. El CHECK educacion_no_excede_el_comprobante impide pagar más de lo que sostiene el comprobante: es la lección de la RTF 07222-3-2018 (Albis) escrita en el esquema y no en una validación de pantalla. El monto NO se prorratea por asistencia.

*14 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `monto` | numeric(10,2) | **no** | — | — |
| `institucion` | text | **no** | — | — |
| `costo_declarado` | numeric(10,2) | **no** | — | Lo que dice el comprobante del instituto o colegio. Es la referencia contra la que se valida el monto pagado, así que tiene que ser el importe real y no una estimación. |
| `cobertura_pct` | numeric(5,2) | **no** | `75` | — |
| `beneficiario` | text | **no** | `'trabajador'::text` | — |
| `comprobante_url` | text | sí | — | DERIVADA desde la 0290: la mantiene un trigger y apunta al papel más reciente de educacion_comprobantes. No se escribe a mano. Existe porque fn_planilla_calcular la lee para decidir si la asignación devenga, y esa función no se toca por esto. |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | **no** | — | — |
| `nota` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `beneficiario_nombre` | text | sí | — | Nombre de la persona a la que pertenece el comprobante. Obligatorio cuando el beneficiario es un hijo: sin él, un comprobante a nombre de un tercero no tiene cómo atarse a quien cobra, que es el hueco por el que estos conceptos se desconocen en fiscalización. Dato personal: no sale en la boleta. |

**Candados** — lo que esta tabla hace imposible:

- `asignaciones_educacion_beneficiario_check` — `CHECK ((beneficiario = ANY (ARRAY['trabajador'::text, 'hijo'::text])))`
- `asignaciones_educacion_check` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `asignaciones_educacion_cobertura_pct_check` — `CHECK (((cobertura_pct > (0)::numeric) AND (cobertura_pct <= (100)::numeric)))`
- `asignaciones_educacion_costo_declarado_check` — `CHECK ((costo_declarado > (0)::numeric))`
- `asignaciones_educacion_monto_check` — `CHECK ((monto >= (0)::numeric))`
- `educacion_cobertura_es_75` — `CHECK ((cobertura_pct = (75)::numeric))`
- `educacion_hijo_lleva_nombre` — `CHECK (((beneficiario <> 'hijo'::text) OR ((beneficiario_nombre IS NOT NULL) AND (length(TRIM(BOTH FROM beneficiario_nombre)) >= 3))))`
- `educacion_no_excede_el_comprobante` — `CHECK ((monto <= round(((costo_declarado * cobertura_pct) / (100)::numeric), 2)))`

**De qué depende:** `(persona_id) REFERENCES personas(id) ON DELETE RESTRICT` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `asignaciones_educacion_lectura` | SELECT | `(fn_es_admin_o_lider() OR (persona_id = fn_persona_actual_id()))` |


### `asignaciones_regimen_pension`

> Desde cuándo cada persona pertenece a cada régimen de pensión. La TASA vive en tasas_pension (0114/0115); esto es la PERTENENCIA, que antes no tenía fecha y hacía que recalcular un periodo pasado usara el régimen de hoy.

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `regimen` | text | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | sí | — | — |
| `asignado_por` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `asignaciones_regimen_pension_rango_valido` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `asignaciones_regimen_pension_regimen_valido` — `CHECK ((regimen = ANY (ARRAY['onp'::text, 'profuturo'::text, 'prima'::text, 'integra'::text, 'habitat'::text, 'jubilada'::text, 'profuturo_mixta'::text, 'prima_mixta'::text, 'integra_mixta'::text, 'habitat_mixta'::text])))`
- `asignacion_regimen_sin_solape` — `EXCLUDE USING gist (persona_id WITH =, daterange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::date), '[]'::text) WITH &&)`
- `idx_regimen_vigente_unico` *(único parcial)* — `public.asignaciones_regimen_pension (persona_id) WHERE (vigente_hasta IS NULL)`

**De qué depende:** `(asignado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `regimen_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `asignaciones_salario`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `rango` | text | **no** | — | — |
| `salario_mensual_soles` | numeric(10,2) | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | sí | — | — |
| `asignado_por` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `base_provision` | numeric(10,2) | sí | — | Base sobre la que se provisionan gratificación, CTS y vacaciones, cuando debe ser distinta del salario del tramo. NULL = se provisiona sobre el salario, que es el comportamiento de siempre. Existe para que bajar el rango (y con ello eliminar el Rendimiento Extraordinario) no recorte los beneficios del equipo. |

**Candados** — lo que esta tabla hace imposible:

- `asignaciones_salario_base_provision_check` — `CHECK (((base_provision IS NULL) OR (base_provision > (0)::numeric)))`
- `asignaciones_salario_check` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `asignaciones_salario_rango_check` — `CHECK ((rango = ANY (ARRAY['colibri'::text, 'cayla'::text, 'support'::text, 'aurora'::text, 'oraculo'::text, 'archicaylo'::text])))`
- `asignaciones_salario_salario_mensual_soles_check` — `CHECK ((salario_mensual_soles > (0)::numeric))`
- `asignacion_salario_sin_solape` — `EXCLUDE USING gist (persona_id WITH =, daterange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::date), '[]'::text) WITH &&)`
- `idx_salario_vigente_unico` *(único parcial)* — `public.asignaciones_salario (persona_id) WHERE (vigente_hasta IS NULL)`

**De qué depende:** `(asignado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `salario_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `ausencias`

> Todos los días que alguien no vino, y por qué. Absorbe lo que antes eran las tablas `vacaciones` y `justificaciones_asistencia`, que ahora son vistas sobre esta. No absorbe suspensiones ni descansos sustitutorios: esos no son ausencias concedidas.

*19 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `fecha_inicio` | date | **no** | — | — |
| `fecha_fin` | date | **no** | — | — |
| `motivo` | text | sí | — | — |
| `doc_profesional` | text | sí | — | — |
| `doc_colegiatura` | text | sí | — | — |
| `doc_fecha` | date | sí | — | — |
| `aprobada_por` | uuid | sí | — | — |
| `aprobada_at` | timestamp with time zone | sí | — | — |
| `registrada_por` | uuid | **no** | — | — |
| `registrada_at` | timestamp with time zone | **no** | `now()` | — |
| `registrada_tarde` | boolean | **no** | `false` | — |
| `anulada_at` | timestamp with time zone | sí | — | — |
| `anulada_por` | uuid | sí | — | — |
| `anulada_motivo` | text | sí | — | — |
| `doc_storage_path` | text | sí | — | Ruta del certificado en el almacen `certificados`. OPCIONAL: lo obligatorio siguen siendo doc_profesional, doc_colegiatura y doc_fecha (0101). Existe por el reembolso de EsSalud, que se sustenta con el CITT. Solo lo ven admin y lider de DO: es dato de salud. |
| `subsidio_diario` | numeric(12,2) | sí | — | Subsidio diario de EsSalud por dia calendario de licencia por maternidad. Lo entra DO tomandolo del calculo de EsSalud: NO se deriva de la planilla, porque los 12 meses del promedio pueden incluir empleadores anteriores a CAYLA y porque el divisor 360 es practica de EsSalud, no texto del D.S. 013-2019-TR. Null en toda ausencia que no sea un subsidio adelantado (0262). |

**Candados** — lo que esta tabla hace imposible:

- `chk_ausencia_anulacion` — `CHECK ((((anulada_at IS NULL) AND (anulada_por IS NULL) AND (anulada_motivo IS NULL)) OR ((anulada_at IS NOT NULL) AND (anulada_por IS NOT NULL) AND (anulada_motivo IS NOT NULL) AND (length(TRIM(BOTH FROM anulada_motivo)) >= 4))))`
- `chk_ausencia_aprobacion` — `CHECK ((((aprobada_at IS NULL) AND (aprobada_por IS NULL)) OR ((aprobada_at IS NOT NULL) AND (aprobada_por IS NOT NULL))))`
- `chk_ausencia_rango` — `CHECK ((fecha_fin >= fecha_inicio))`
- `chk_maternidad_tope_legal` — `CHECK (((subsidio_diario IS NULL) OR (((fecha_fin - fecha_inicio) + 1) <= 128)))`
- `chk_subsidio_solo_maternidad` — `CHECK (((subsidio_diario IS NULL) OR ((tipo = 'maternidad'::text) AND (subsidio_diario > (0)::numeric))))`
- `ausencias_sin_solape` — `EXCLUDE USING gist (persona_id WITH =, daterange(fecha_inicio, fecha_fin, '[]'::text) WITH &&) WHERE ((anulada_at IS NULL))`

**De qué depende:** `(anulada_por) REFERENCES personas(id)` · `(aprobada_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(registrada_por) REFERENCES personas(id)` · `(tipo) REFERENCES tipos_ausencia(codigo)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `ausencias_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `ausencias_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `ausencias_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (EXISTS ( SELECT 1    FROM personas p   WHERE ((p.id = ausencias.persona_id) AND (p.sede_base_id = fn_sede_actual_persona())))))` |


### `bonos_umbral_permitido`

> Permisos de un solo uso para que un bono cruce el umbral de 3 meses del art. 16 del D.S. 001-97-TR. Lo crea fn_permitir_bono_regular con motivo obligatorio; el trigger lo consume y lo marca usado.

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `autorizado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `usado_at` | timestamp with time zone | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `bonos_umbral_motivo_check` — `CHECK ((length(TRIM(BOTH FROM motivo)) >= 10))`

**De qué depende:** `(autorizado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `bonos_umbral_admin` | SELECT | `(fn_es_admin_o_lider() IS TRUE)` |


### `categorias_laborales`

> Cuadro de categorias y funciones que exige la Ley 30709 y el D.S. 002-2018-TR. No tenerlo es infraccion muy grave (25.22 RLGIT); no informarlo, la 25.23.

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `rango` | text | **no** | — | — |
| `orden` | integer | **no** | — | — |
| `proposito` | text | sí | — | Para que existe la categoria, en una frase. Es lo que abre la conversacion cuando alguien pregunta que se espera de el. |
| `funciones` | text | sí | — | Que hace esta categoria. Es lo que permite comparar dos puestos y sostener que valen lo mismo. |
| `requisitos` | text | sí | — | Que se necesita para estar en ella. Criterio objetivo que justifica quien entra. |
| `criterio` | text | sí | — | Por que esta categoria se remunera por encima de la anterior. La norma no lo nombra asi, pero es lo primero que pregunta una inspeccion. |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_at` | timestamp with time zone | **no** | `now()` | — |
| `salario_declarado` | numeric(10,2) | sí | — | Lo que la empresa declara que vale esta categoria. Es LA POLITICA: lo que se publica en el cuadro de la Ley 30709 y lo que se aplica a nuevas incorporaciones y cambios de categoria. No se deduce de los sueldos vigentes, porque un sueldo negociado por encima de su categoria reescribiria la politica sin que nadie lo decida. |

**Candados** — lo que esta tabla hace imposible:

- `categorias_laborales_salario_declarado_positivo` — `CHECK (((salario_declarado IS NULL) OR (salario_declarado > (0)::numeric)))`
- `categorias_laborales_orden_key` — `UNIQUE (orden)`

**De qué depende:** `(actualizado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `categorias_lectura` | SELECT | `true` |


### `configuracion`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `clave` | text | **no** | — | — |
| `valor` | jsonb | **no** | — | — |
| `descripcion` | text | sí | — | — |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `configuracion_select_autenticados` | SELECT | `true` |
| `configuracion_write_admin_lider` | TODAS | `fn_es_admin_o_lider()` |


### `contratos_generados`

> Cada contrato de trabajo generado por el sistema, con su texto completo congelado en el momento de generarse — antes de que exista el escaneo firmado, no después. Se versiona por fila, nunca se reemplaza: si un contrato se generó por error, se anula (con motivo) y se genera uno nuevo.

*20 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | Tipo de documento generado. nuevo/renovacion/adendum/indefinido son contratos de trabajo (D.Leg. 728) — indefinido (0347) a plazo indeterminado, los otros tres sujetos a modalidad temporal. convenio_practicas (0333) NO es un contrato de trabajo: es un convenio de modalidad formativa (Ley 28518) para tipo_vinculo='practicante'. No se funden: un convenio no tiene causa objetiva, periodo de prueba ni régimen disciplinario laboral, y un indefinido no tiene causa objetiva ni fecha de término. |
| `cargo` | text | **no** | — | — |
| `sede_id` | uuid | **no** | — | — |
| `remuneracion_mensual` | numeric(10,2) | **no** | — | — |
| `fecha_inicio` | date | **no** | — | — |
| `fecha_fin` | date | sí | — | Fecha de término del documento. NULL únicamente cuando tipo='indefinido' (0347) — un contrato a plazo indeterminado no vence. Cualquier otro tipo la exige, y tiene que ser posterior a fecha_inicio (ver constraint contrato_fecha_fin_segun_tipo). |
| `horas_semanales` | numeric(5,2) | sí | — | — |
| `documento_html` | text | **no** | — | — |
| `generado_por` | uuid | **no** | — | — |
| `generado_at` | timestamp with time zone | **no** | `now()` | — |
| `storage_path` | text | sí | — | — |
| `fecha_firma` | date | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `anulado_at` | timestamp with time zone | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_motivo` | text | sí | — | — |
| `copia_entregada_at` | date | sí | — | Cuando se le entrego copia del contrato a la colaboradora. La clausula decima octava da 3 dias habiles desde el inicio de la prestacion. Fecha y no booleano: «se entrego» no prueba nada, «se entrego el 3 de enero» si. |
| `comunicado_mtpe_at` | date | sí | — | Cuando se comunico el contrato a la Autoridad Administrativa de Trabajo. La clausula decima octava da 15 dias naturales desde la suscripcion. Si esa obligacion cambia, se cambia el molde del contrato: este campo sigue sirviendo para anotar la fecha en que se hizo. |

**Candados** — lo que esta tabla hace imposible:

- `contrato_anulado_con_motivo` — `CHECK ((((anulado_at IS NULL) AND (anulado_por IS NULL) AND (anulado_motivo IS NULL)) OR ((anulado_at IS NOT NULL) AND (anulado_por IS NOT NULL) AND (anulado_motivo IS NOT NULL) AND (length(TRIM(BOTH FROM anulado_motivo)) >= 3))))`
- `contrato_fecha_fin_segun_tipo` — `CHECK (((tipo = 'indefinido'::text) = (fecha_fin IS NULL)))`
- `contrato_firma_coherente` — `CHECK ((((storage_path IS NULL) AND (fecha_firma IS NULL) AND (registrado_por IS NULL)) OR ((storage_path IS NOT NULL) AND (fecha_firma IS NOT NULL) AND (registrado_por IS NOT NULL))))`
- `contratos_generados_cargo_check` — `CHECK ((btrim(cargo) <> ''::text))`
- `contratos_generados_check` — `CHECK ((fecha_fin > fecha_inicio))`
- `contratos_generados_documento_html_check` — `CHECK ((btrim(documento_html) <> ''::text))`
- `contratos_generados_horas_semanales_check` — `CHECK (((horas_semanales IS NULL) OR (horas_semanales > (0)::numeric)))`
- `contratos_generados_remuneracion_mensual_check` — `CHECK ((remuneracion_mensual >= (0)::numeric))`
- `contratos_generados_tipo_check` — `CHECK ((tipo = ANY (ARRAY['nuevo'::text, 'renovacion'::text, 'adendum'::text, 'convenio_practicas'::text, 'indefinido'::text])))`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(generado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id) ON DELETE RESTRICT` · `(registrado_por) REFERENCES personas(id)` · `(sede_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `contratos_lectura` | SELECT | `((fn_es_admin_o_lider() IS TRUE) OR (persona_id = fn_persona_actual_id()))` |


### `correcciones_auditoria`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `marcaje_id` | uuid | sí | — | — |
| `persona_id` | uuid | **no** | — | — |
| `campo_modificado` | text | **no** | — | — |
| `valor_anterior` | text | sí | — | — |
| `valor_nuevo` | text | sí | — | — |
| `corregido_por` | uuid | **no** | — | — |
| `corregido_at` | timestamp with time zone | **no** | `now()` | — |
| `motivo` | text | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `correcciones_auditoria_motivo_check` — `CHECK ((length(TRIM(BOTH FROM motivo)) >= 3))`

**De qué depende:** `(corregido_por) REFERENCES personas(id)` · `(marcaje_id) REFERENCES marcajes(id) ON DELETE SET NULL` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `auditoria_insert_admin_lider` | INSERT | `fn_es_admin_o_lider()` |
| `auditoria_insert_supervisor` | INSERT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |
| `auditoria_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `auditoria_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `auditoria_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `datos_personales`

*21 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `nombre_dni` | text | sí | — | — |
| `fecha_nacimiento` | date | sí | — | — |
| `estado_civil` | text | sí | — | — |
| `direccion` | text | sí | — | — |
| `celular` | text | sí | — | — |
| `entidad_bancaria` | text | sí | — | — |
| `numero_cuenta` | text | sí | — | — |
| `grado_instruccion` | text | sí | — | — |
| `hijos_menores` | boolean | sí | — | — |
| `foto_dni_url` | text | sí | — | — |
| `foto_personal_url` | text | sí | — | — |
| `foto_profesional_url` | text | sí | — | — |
| `actualizado_por` | uuid | sí | — | — |
| `actualizado_at` | timestamp with time zone | **no** | `now()` | — |
| `emergencia_nombre` | text | sí | — | — |
| `emergencia_vinculo` | text | sí | — | — |
| `emergencia_telefono` | text | sí | — | — |
| `discapacidad` | boolean | sí | — | — |
| `discapacidad_conadis` | text | sí | — | Número del certificado o carné del CONADIS. Se guarda porque la deducción adicional de la Ley 29973 exige el certificado, no la declaración: sin el número el beneficio no se sustenta. Hoy CAYLA no tiene a nadie en planilla con discapacidad (Carlos Espejo está por honorarios, y la deducción solo aplica en planilla), así que el campo es de valor futuro. |
| `cuspp` | text | sí | — | Código Único de Identificación del SPP: identifica la cuenta individual de la persona en su AFP y es obligatorio en el T-Registro para afiliados al sistema privado. NO aplica a ONP ni a jubilados — ahí no hay cuenta individual. Quién debe tenerlo lo decide la pantalla según regimen_pension; esta columna guarda lo que le den. |

**De qué depende:** `(actualizado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id) ON DELETE CASCADE`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `dp_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `dp_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `dp_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `derechohabientes`

> Familiares de cada integrante, con dos propósitos en una sola tabla: la bandera essalud dice si están inscritos ante SUNAT (formulario 1602) y la bandera vida_ley si están declarados como beneficiarios del Seguro de Vida Ley (D.Leg. 688). No se borran: se cierran con vigente_hasta, para que el periodo en que estuvieron cubiertos siga siendo explicable.

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `nombres` | text | **no** | — | — |
| `apellidos` | text | **no** | — | — |
| `documento` | text | sí | — | — |
| `fecha_nacimiento` | date | sí | — | — |
| `vinculo` | text | **no** | — | — |
| `essalud` | boolean | **no** | `false` | — |
| `vida_ley` | boolean | **no** | `false` | Declarado como beneficiario del Seguro de Vida Ley. Es una bandera y no un porcentaje porque el D.Leg. 688 fija el orden y la proporción por ley: la declaración jurada identifica a los beneficiarios, no reparte a criterio del trabajador. |
| `vigente_hasta` | date | sí | — | — |
| `nota` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `derechohabientes_check` — `CHECK (((vinculo <> 'hijo'::text) OR (fecha_nacimiento IS NOT NULL)))`
- `derechohabientes_vinculo_check` — `CHECK ((vinculo = ANY (ARRAY['conyuge'::text, 'conviviente'::text, 'hijo'::text, 'madre'::text, 'padre'::text, 'hermano'::text, 'otro'::text])))`

**De qué depende:** `(persona_id) REFERENCES personas(id) ON DELETE CASCADE` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `dh_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `dh_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `dh_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `desembolsos_beneficios`

> Libro de beneficios desembolsados: las cinco ventanas del año (dos gratificaciones, dos CTS, vacaciones), de qué año, cuánto, cuándo y por dónde salió. Creada a mano en producción antes de la 0153 y descrita en el repositorio recién en la 0155. Solo lectura para admin o líder de DO. NINGUNA función del sistema la lee todavía: lo que se debe y lo que se pagó se calculan por separado y no se descuentan entre sí.

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `ventana` | text | **no** | — | — |
| `anio` | integer | **no** | — | — |
| `monto` | numeric(12,2) | **no** | — | Monto desembolsado. numeric(12,2) para que redondee a céntimos igual que el resto del sistema. La 0155 lo declaró sin precisión por leer `data_type`, que no distingue `numeric` de `numeric(12,2)`; corregido en la 0168. |
| `fecha_pago` | date | **no** | — | — |
| `origen` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `registrado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `desembolsos_beneficios_anio_check` — `CHECK (((anio >= 2020) AND (anio <= 2100)))`
- `desembolsos_beneficios_monto_check` — `CHECK ((monto > (0)::numeric))`
- `desembolsos_beneficios_origen_check` — `CHECK ((origen = ANY (ARRAY['plame'::text, 'transferencia'::text, 'otro'::text])))`
- `desembolsos_beneficios_ventana_check` — `CHECK ((ventana = ANY (ARRAY['grati_s1'::text, 'grati_s2'::text, 'cts_may'::text, 'cts_nov'::text, 'vacaciones'::text])))`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `desembolsos_lectura_admin` | SELECT | `fn_es_admin_o_lider()` |


### `documentos_acuses`

> Constancia de que una persona recibio una VERSION concreta de un documento. Una fila por persona y version: no se acusa dos veces lo mismo, y publicar una version nueva vuelve a pedir constancia a todo el mundo.

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `documento_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `via` | text | **no** | — | sistema = la dejo la propia persona desde el panel. papel = la registro DO por alguien sin cuenta, con el escaneo del cargo firmado adjunto. |
| `nombre_declarado` | text | sí | — | — |
| `acusado_at` | timestamp with time zone | **no** | `now()` | — |
| `registrado_por` | uuid | sí | — | — |
| `storage_path` | text | sí | — | — |
| `nota` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `chk_acuse_coherente` — `CHECK ((((via = 'sistema'::text) AND (nombre_declarado IS NOT NULL) AND (btrim(nombre_declarado) <> ''::text) AND (registrado_por IS NULL)) OR ((via = 'papel'::text) AND (storage_path IS NOT NULL) AND (btrim(storage_path) <> ''::text) AND (registrado_por IS NOT NULL))))`
- `documentos_acuses_via_check` — `CHECK ((via = ANY (ARRAY['sistema'::text, 'papel'::text])))`

**De qué depende:** `(documento_id) REFERENCES documentos_institucionales(id) ON DELETE CASCADE` · `(persona_id) REFERENCES personas(id)` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `documentos_acuses_lectura` | SELECT | `((persona_id = fn_persona_actual_id()) OR (fn_es_admin_o_lider() IS TRUE))` |


### `documentos_firmados`

> Los papeles firmados que sostienen los conceptos no remunerativos: la declaración de ruta que respalda la movilidad (D.S. 001-97-TR art. 19 e), la política de movilidad de la empresa, y la constancia del bono de cumpleaños (art. 19 g). Se versiona: la firma más reciente rige y las anteriores quedan, porque un pago de marzo se defiende con el papel que regía en marzo.

*16 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `alcance` | text | **no** | — | individual = lo firma una persona · empresa = lo emite CAYLA y no es de nadie. Se declara y no se deduce del hueco en persona_id: un hueco no explica por qué está vacío, y una declaración de ruta guardada sin persona sería indistinguible de un documento institucional. |
| `persona_id` | uuid | sí | — | — |
| `tipo` | text | **no** | — | — |
| `storage_path` | text | sí | — | — |
| `fecha_firma` | date | **no** | — | — |
| `ruta_declarada` | text | sí | — | — |
| `monto_declarado` | numeric(10,2) | sí | — | — |
| `anio` | integer | sí | — | — |
| `es_negativa` | boolean | **no** | `false` | — |
| `nota` | text | sí | — | — |
| `registrado_por` | uuid | **no** | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `anulado_at` | timestamp with time zone | sí | — | — |
| `anulado_por` | uuid | sí | — | — |
| `anulado_motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `doc_alcance_coherente` — `CHECK ((((alcance = 'individual'::text) AND (persona_id IS NOT NULL)) OR ((alcance = 'empresa'::text) AND (persona_id IS NULL))))`
- `doc_anulado_con_motivo` — `CHECK ((((anulado_at IS NULL) AND (anulado_por IS NULL) AND (anulado_motivo IS NULL)) OR ((anulado_at IS NOT NULL) AND (anulado_por IS NOT NULL) AND (anulado_motivo IS NOT NULL) AND (length(TRIM(BOTH FROM anulado_motivo)) >= 3))))`
- `doc_bono_lleva_su_anio` — `CHECK (((tipo <> 'bono'::text) OR (anio IS NOT NULL)))`
- `doc_negativa_sin_monto` — `CHECK (((NOT es_negativa) OR (monto_declarado IS NULL)))`
- `doc_politica_es_de_empresa` — `CHECK (((tipo <> 'politica'::text) OR (alcance = 'empresa'::text)))`
- `doc_ruta_y_bono_son_individuales` — `CHECK (((tipo <> ALL (ARRAY['ruta'::text, 'bono'::text])) OR (alcance = 'individual'::text)))`
- `documentos_firmados_alcance_check` — `CHECK ((alcance = ANY (ARRAY['individual'::text, 'empresa'::text])))`
- `documentos_firmados_anio_check` — `CHECK (((anio IS NULL) OR ((anio >= 2020) AND (anio <= 2100))))`
- `documentos_firmados_monto_declarado_check` — `CHECK (((monto_declarado IS NULL) OR (monto_declarado >= (0)::numeric)))`
- `documentos_firmados_tipo_check` — `CHECK ((tipo = ANY (ARRAY['ruta'::text, 'politica'::text, 'bono'::text])))`
- `idx_documentos_bono_uno_por_anio` *(único parcial)* — `public.documentos_firmados (persona_id, anio) WHERE ((tipo = 'bono'::text) AND (anulado_at IS NULL) AND (NOT es_negativa))`

**De qué depende:** `(anulado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id) ON DELETE RESTRICT` · `(registrado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `documentos_lectura` | SELECT | `((fn_es_admin_o_lider() IS TRUE) OR (persona_id = fn_persona_actual_id()))` |


### `documentos_institucionales`

> Cada version publicada de un documento institucional, con su texto congelado. Congelado y no regenerado: si se regenerara, cambiar una coma dejaria todos los acuses previos apuntando a un texto que nadie firmo.

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `tipo` | text | **no** | — | — |
| `version` | integer | **no** | — | — |
| `titulo` | text | **no** | — | — |
| `documento` | text | **no** | — | El texto literal que se comunico. Es la prueba: tiene que poder mostrarse igual dentro de cinco anios. |
| `notas` | text | sí | — | — |
| `vigente_desde` | date | **no** | — | Desde cuando rige esta version. No es la fecha de publicacion: un reglamento puede publicarse hoy y regir el primero del mes que viene. |
| `publicado_por` | uuid | sí | — | — |
| `publicado_at` | timestamp with time zone | **no** | `now()` | — |
| `etiqueta_version` | text | sí | — | La version que el DOCUMENTO declara en su propio texto —«4.0»—, que es la que aparece en el cargo que la integrante firma. Distinta del correlativo `version`, que solo cuenta cuantas veces se ha publicado este tipo en el sistema. Sin las dos, el legajo de papel y la base no se pueden cruzar. |

**Candados** — lo que esta tabla hace imposible:

- `documentos_institucionales_documento_check` — `CHECK ((btrim(documento) <> ''::text))`
- `documentos_institucionales_titulo_check` — `CHECK ((btrim(titulo) <> ''::text))`
- `documentos_institucionales_version_check` — `CHECK ((version > 0))`
- `documentos_institucionales_tipo_version_key` — `UNIQUE (tipo, version)`

**De qué depende:** `(publicado_por) REFERENCES personas(id)` · `(tipo) REFERENCES documentos_tipos(codigo)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `documentos_lectura` | SELECT | `true` |


### `documentos_tipos`

> Las clases de documento institucional que la empresa publica. Vive en tabla y no en el codigo para que anadir uno no exija una migracion.

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `orden` | integer | **no** | `100` | — |
| `requiere_acuse` | boolean | **no** | `true` | Si es false, el documento se publica para consulta pero no se le pide constancia a nadie. |
| `activo` | boolean | **no** | `true` | — |

**Candados** — lo que esta tabla hace imposible:

- `documentos_tipos_codigo_check` — `CHECK ((codigo ~ '^[a-z0-9_]{2,40}$'::text))`
- `documentos_tipos_nombre_check` — `CHECK ((btrim(nombre) <> ''::text))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `documentos_tipos_alta` | INSERT | `(fn_es_admin_o_lider() IS TRUE)` |
| `documentos_tipos_edicion` | UPDATE | `(fn_es_admin_o_lider() IS TRUE)` |
| `documentos_tipos_lectura` | SELECT | `true` |


### `educacion_comprobantes`

> Los papeles que sostienen una asignación por educación, uno por mes de periodo. Antes vivía uno solo, en asignaciones_educacion.comprobante_url, y por eso una vigencia de tres meses no podía tener más de un recibo.

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `asignacion_id` | uuid | **no** | — | — |
| `storage_path` | text | **no** | — | — |
| `mes_cubierto` | date | **no** | — | — |
| `nota` | text | sí | — | — |
| `subido_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `educacion_comprobante_mes_es_el_dia_1` — `CHECK ((EXTRACT(day FROM mes_cubierto) = (1)::numeric))`
- `educacion_comprobante_no_duplicado` — `UNIQUE (asignacion_id, storage_path)`

**De qué depende:** `(asignacion_id) REFERENCES asignaciones_educacion(id) ON DELETE CASCADE` · `(subido_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `educacion_comprobantes_lectura` | SELECT | `(EXISTS ( SELECT 1    FROM asignaciones_educacion a   WHERE ((a.id = educacion_comprobantes.asignacion_id) AND (fn_es_admin_o_lider() OR (a.persona_id = fn_persona_actual_id())))))` |


### `etiquetas_complemento`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `etiqueta` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `orden` | integer | **no** | `100` | — |
| `activa` | boolean | **no** | `true` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `etiquetas_complemento_select` | SELECT | `fn_es_admin_o_lider()` |


### `expediente_adjuntos`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `documento_id` | uuid | **no** | — | — |
| `storage_path` | text | **no** | — | — |
| `tipo` | text | **no** | `'cargo_firmado'::text` | cargo_firmado = el acuse de la persona · acta_negativa = se ofreció y no quiso firmar · descargo = su defensa escrita del art. 31 LPCL. |
| `nota` | text | sí | — | — |
| `subido_por` | uuid | **no** | — | — |
| `subido_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `expediente_adjuntos_tipo_check` — `CHECK ((tipo = ANY (ARRAY['cargo_firmado'::text, 'acta_negativa'::text, 'descargo'::text])))`
- `expediente_adjuntos_storage_path_key` — `UNIQUE (storage_path)`

**De qué depende:** `(documento_id) REFERENCES expediente_disciplinario(id) ON DELETE CASCADE` · `(subido_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `expediente_adjuntos_select` | SELECT | `(EXISTS ( SELECT 1    FROM (expediente_disciplinario d      JOIN personas p ON ((p.id = d.persona_id)))   WHERE ((d.id = expediente_adjuntos.documento_id) AND (fn_es_admin_o_lider() OR ((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (p.sede_base_id = fn_sede_actual_persona())) OR (d.persona_id = fn_persona_actual_id())))))` |


### `expediente_correlativo_seq`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `anio` | integer | **no** | — | — |
| `prefijo` | text | **no** | — | — |
| `ultimo` | integer | **no** | `0` | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `expediente_disciplinario`

*33 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `correlativo` | text | sí | — | — |
| `persona_id` | uuid | **no** | — | — |
| `tipo_causal` | text | **no** | — | — |
| `nivel` | text | **no** | — | — |
| `estado` | text | **no** | `'borrador'::text` | — |
| `periodo_desde` | date | sí | — | — |
| `periodo_hasta` | date | sí | — | — |
| `hechos` | jsonb | **no** | `'[]'::jsonb` | — |
| `suspension_dias` | integer | sí | — | — |
| `suspension_desde` | date | sí | — | — |
| `suspension_hasta` | date | sí | — | — |
| `doc_previo_id` | uuid | sí | — | — |
| `firmante_id` | uuid | sí | — | — |
| `firmado_at` | timestamp with time zone | sí | — | — |
| `medio_entrega` | text | sí | — | — |
| `entregado_at` | timestamp with time zone | sí | — | — |
| `observacion` | text | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_at` | timestamp with time zone | **no** | `now()` | — |
| `suspension_fechas` | date[] | sí | — | — |
| `fecha_cese` | date | sí | — | Fecha de cese DECLARADA en la carta de despido (art. 32 LPCL). Distinta de personas.fecha_cese, que es la baja efectiva: se conservan las dos para poder comparar lo que dijo el papel con lo que hizo la empresa. |
| `resuelto_at` | timestamp with time zone | sí | — | — |
| `resuelto_por` | uuid | sí | — | — |
| `resuelto_resultado` | text | sí | — | Qué se decidió tras evaluar los descargos: archivado (no se sanciona) o despido. Anotar «despido» NO emite la carta: esa se redacta y se firma por el camino normal. |
| `resuelto_motivo` | text | sí | — | — |
| `cargos_comunicados_at` | timestamp with time zone | sí | — | Cuando se comunicaron los cargos a la colaboradora. Abre el plazo del art. 55.2 del RIT. |
| `descargo_vence_at` | timestamp with time zone | sí | — | Cuando vence el plazo de descargo. En dias HABILES desde la comunicacion, nunca menos de dos. |
| `descargo_valoracion` | text | sí | — | La valoracion escrita que exige el art. 19.3: por que se acogio o por que no. |
| `descargo_acogido` | text | sí | — | total \| parcial \| no \| sin_descargo. Lo ultimo cuando el plazo vencio sin que se presentara. |
| `entregado_por` | uuid | sí | — | — |
| `entrega_testigo_nombre` | text | sí | — | Numeral 55.4: quien atestigua la negativa a firmar. Va en la fila y no solo en el acta escaneada porque es el dato que hace valida la entrega. |
| `entrega_testigo_id` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `chk_acta_negativa_con_testigo` — `CHECK (((medio_entrega IS DISTINCT FROM 'acta_negativa'::text) OR ((entrega_testigo_nombre IS NOT NULL) AND (btrim(entrega_testigo_nombre) <> ''::text))))`
- `chk_descargo_acogido` — `CHECK (((descargo_acogido IS NULL) OR (descargo_acogido = ANY (ARRAY['total'::text, 'parcial'::text, 'no'::text, 'sin_descargo'::text]))))`
- `chk_descargo_coherente` — `CHECK ((((cargos_comunicados_at IS NULL) AND (descargo_vence_at IS NULL)) OR ((cargos_comunicados_at IS NOT NULL) AND (descargo_vence_at IS NOT NULL) AND (descargo_vence_at > cargos_comunicados_at))))`
- `chk_entregado_completo` — `CHECK (((estado <> 'entregado'::text) OR ((medio_entrega IS NOT NULL) AND (entregado_at IS NOT NULL))))`
- `chk_firmado_completo` — `CHECK (((estado = 'borrador'::text) OR (estado = 'anulado'::text) OR ((firmante_id IS NOT NULL) AND (firmado_at IS NOT NULL) AND (correlativo IS NOT NULL))))`
- `chk_periodo` — `CHECK (((periodo_desde IS NULL) OR (periodo_hasta IS NULL) OR (periodo_hasta >= periodo_desde)))`
- `chk_resuelto_completo` — `CHECK (((resuelto_at IS NULL) OR ((resuelto_por IS NOT NULL) AND (resuelto_resultado = ANY (ARRAY['archivado'::text, 'despido'::text])) AND (length(TRIM(BOTH FROM COALESCE(resuelto_motivo, ''::text))) >= 10))))`
- `chk_susp_completa` — `CHECK (((nivel <> 'suspension'::text) OR ((suspension_dias IS NOT NULL) AND (suspension_dias > 0) AND (suspension_desde IS NOT NULL) AND (suspension_hasta IS NOT NULL) AND (suspension_hasta >= suspension_desde))))`
- `expediente_disciplinario_estado_check` — `CHECK ((estado = ANY (ARRAY['borrador'::text, 'firmado'::text, 'entregado'::text, 'anulado'::text])))`
- `expediente_disciplinario_medio_entrega_check` — `CHECK ((medio_entrega = ANY (ARRAY['fisico'::text, 'correo'::text, 'notarial'::text, 'acta_negativa'::text])))`
- `expediente_disciplinario_nivel_check` — `CHECK ((nivel = ANY (ARRAY['verbal'::text, 'amonestacion'::text, 'suspension'::text, 'imputacion'::text, 'despido'::text])))`
- `expediente_disciplinario_tipo_causal_check` — `CHECK ((tipo_causal = ANY (ARRAY['tardanza'::text, 'falta'::text, 'conducta'::text])))`
- `expediente_disciplinario_correlativo_key` — `UNIQUE (correlativo)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(doc_previo_id) REFERENCES expediente_disciplinario(id)` · `(entrega_testigo_id) REFERENCES personas(id)` · `(entregado_por) REFERENCES personas(id)` · `(firmante_id) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(resuelto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `exp_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `exp_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `exp_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `factores_categoria`

> Los seis criterios objetivos que separan una categoria de la siguiente. Es lo que la Ley 30709 pide poder demostrar: que la diferencia salarial responde a algo verificable y no a la persona.

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `factor` | text | **no** | — | — |
| `factor_orden` | integer | **no** | — | — |
| `rango` | text | **no** | — | — |
| `nivel` | text | **no** | — | — |

**De qué depende:** `(rango) REFERENCES categorias_laborales(rango) ON DELETE CASCADE`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `factores_lectura` | SELECT | `true` |


### `feriados`

*2 columnas · ~112 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `fecha` | date | **no** | — | — |
| `nombre` | text | **no** | — | — |

**Candados** — lo que esta tabla hace imposible:

- `feriados_nombre_check` — `CHECK ((length(TRIM(BOTH FROM nombre)) >= 2))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `feriados_select_autenticados` | SELECT | `true` |


### `feriados_descanso_sustitutorio`

> Feriados laborados compensados con día libre (D. Leg. 713). Con estado OTORGADO el feriado deja de pagar sobretasa y vale como feriado no laborado.

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha_feriado` | date | **no** | — | — |
| `fecha_descanso_sustitutorio` | date | **no** | — | — |
| `estado` | text | **no** | `'PENDIENTE'::text` | PENDIENTE = acordado, aún sin respaldo/ejecución · OTORGADO = descanso efectivo y con acta (anula la sobretasa) · NO_OTORGADO = no se dio; la planilla vuelve a pagar la sobretasa. |
| `acta_ref` | text | sí | — | Documento firmado que respalda el acuerdo. Obligatorio para OTORGADO. |
| `otorgado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `motivo_fuera_de_plazo` | text | sí | — | Por qué el día compensatorio cae a más de 30 días del feriado. Obligatorio en ese caso desde la 0238; null cuando está dentro del plazo. |

**Candados** — lo que esta tabla hace imposible:

- `chk_dcs_acta` — `CHECK (((estado <> 'OTORGADO'::text) OR ((acta_ref IS NOT NULL) AND (length(TRIM(BOTH FROM acta_ref)) >= 3))))`
- `chk_dcs_dias_distintos` — `CHECK ((fecha_descanso_sustitutorio <> fecha_feriado))`
- `feriados_descanso_sustitutorio_estado_check` — `CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'OTORGADO'::text, 'NO_OTORGADO'::text])))`
- `uq_dcs_descanso` — `UNIQUE (persona_id, fecha_descanso_sustitutorio)`
- `uq_dcs_feriado` — `UNIQUE (persona_id, fecha_feriado)`

**De qué depende:** `(fecha_feriado) REFERENCES feriados(fecha) ON DELETE RESTRICT` · `(otorgado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id) ON DELETE CASCADE`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `dcs_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `firmas_escaneadas`

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `imagen` | text | **no** | — | — |
| `actualizado_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `chk_firma_es_imagen` — `CHECK ((imagen ~ '^data:image/(png\|jpeg);base64,'::text))`
- `chk_firma_peso` — `CHECK ((length(imagen) <= 1048576))`

**De qué depende:** `(persona_id) REFERENCES personas(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `funciones_nunca_para_authenticated`

> Funciones que NO deben concederse a authenticated. Todo barrido de permisos debe saltarlas. Nacida de la 0090: la 0076 abrió la planilla entera a cualquier sesión al conceder en masa.

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `funcion` | text | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `desde` | date | **no** | `CURRENT_DATE` | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `google_sheets_sync_queue`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `marcaje_id` | uuid | sí | — | — |
| `jornada_id` | uuid | sí | — | — |
| `payload` | jsonb | **no** | — | — |
| `intentos` | integer | **no** | `0` | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `last_error` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `google_sheets_sync_queue_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'sincronizado'::text, 'fallido'::text])))`

**De qué depende:** `(jornada_id) REFERENCES jornadas(id)` · `(marcaje_id) REFERENCES marcajes(id) ON DELETE CASCADE`

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `horarios_asignados`

*12 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | sí | — | — |
| `hora_entrada` | time without time zone | **no** | — | — |
| `hora_salida` | time without time zone | **no** | — | — |
| `almuerzo_min_minutos` | integer | **no** | `45` | — |
| `almuerzo_max_minutos` | integer | **no** | `75` | — |
| `dias_laborables` | integer[] | **no** | `'{1,2,3,4,5}'::integer[]` | — |
| `horas_semana_objetivo` | numeric(5,2) | **no** | `45` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `horario_por_dia` | jsonb | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `horarios_asignados_check` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `horarios_asignados_check1` — `CHECK ((almuerzo_min_minutos <= almuerzo_max_minutos))`
- `horarios_sin_solape` — `EXCLUDE USING gist (persona_id WITH =, daterange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::date), '[]'::text) WITH &&)`
- `idx_horario_vigente_unico` *(único parcial)* — `public.horarios_asignados (persona_id) WHERE (vigente_hasta IS NULL)`

**De qué depende:** `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `horarios_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `horarios_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `horarios_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |
| `horarios_select_terminal` | SELECT | `(persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_terminal())))` |
| `horarios_write_admin_lider` | TODAS | `fn_es_admin_o_lider()` |


### `incidencias_aceptadas`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `nota` | text | sí | — | — |
| `aceptado_por` | uuid | **no** | — | — |
| `aceptado_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `incidencias_aceptadas_persona_id_fecha_tipo_key` — `UNIQUE (persona_id, fecha, tipo)`

**De qué depende:** `(aceptado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `inc_acept_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `inc_acept_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `jornadas`

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `sede_id` | uuid | sí | — | — |
| `entrada_ts` | timestamp with time zone | sí | — | — |
| `salida_final_ts` | timestamp with time zone | sí | — | — |
| `minutos_tarde` | integer | sí | — | — |
| `horas_trabajadas` | numeric(6,2) | sí | — | — |
| `horas_extra_detectadas` | numeric(6,2) | **no** | `0` | — |
| `estado` | estado_jornada | **no** | `'abierta'::estado_jornada` | — |
| `tiene_salida_no_retornada` | boolean | **no** | `false` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `minutos_salida_temprana` | integer | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `chk_horas_no_negativas` — `CHECK (((horas_trabajadas IS NULL) OR (horas_trabajadas >= (0)::numeric)))`
- `jornadas_persona_id_fecha_key` — `UNIQUE (persona_id, fecha)`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(sede_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `jornadas_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `jornadas_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `jornadas_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (sede_id = fn_sede_actual_persona()))` |
| `jornadas_select_terminal` | SELECT | `(sede_id = fn_sede_actual_terminal())` |


### `justificaciones_asistencia` *(vista)*

> Vista sobre `ausencias`, un día por fila. Era una tabla hasta la 0101 — existía, funcionaba y ninguna pantalla la usaba nunca. Un día de ausencia registrada deja de contar como falta injustificada gracias a esta vista, sin tocar ninguna función de faltas.

*7 columnas*

<details><summary>Cómo se construye esta vista</summary>

```sql
SELECT a.id,
    a.persona_id,
    g.g::date AS fecha,
    a.tipo AS motivo,
    a.motivo AS observacion,
    a.registrada_por AS creado_por,
    a.registrada_at AS creado_at
   FROM ausencias a
     CROSS JOIN LATERAL generate_series(a.fecha_inicio::timestamp with time zone, a.fecha_fin::timestamp with time zone, '1 day'::interval) g(g)
  WHERE a.anulada_at IS NULL AND a.tipo <> 'vacaciones'::text;
```

</details>

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | — |
| `persona_id` | uuid | sí | — | — |
| `fecha` | date | sí | — | — |
| `motivo` | text | sí | — | — |
| `observacion` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `creado_at` | timestamp with time zone | sí | — | — |


### `liquidacion_pagada`

> Copia intacta de la liquidación con la que se pagó a cada persona que cesó. No se edita ni se borra: si un recálculo posterior ya no coincide, el sistema lo dice (fn_liquidacion_diferencias) y la cifra pagada no se mueve. Un error acá no lo reclama nadie — la persona ya no está.

*17 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `version` | integer | **no** | — | — |
| `congelada_at` | timestamp with time zone | **no** | `now()` | — |
| `congelada_por` | uuid | **no** | — | — |
| `nota` | text | sí | — | — |
| `persona` | text | **no** | — | — |
| `fecha_ingreso` | date | sí | — | — |
| `fecha_cese` | date | **no** | — | — |
| `monto_periodo` | numeric(12,2) | **no** | `0` | — |
| `monto_vacaciones` | numeric(12,2) | **no** | `0` | — |
| `monto_grati` | numeric(12,2) | **no** | `0` | — |
| `monto_cts` | numeric(12,2) | **no** | `0` | — |
| `total` | numeric(12,2) | **no** | — | — |
| `detalle` | jsonb | **no** | — | — |
| `anulada` | boolean | **no** | `false` | Esta versión NO es un pago: es la anulación de la versión anterior, que se marcó como pagada por error. Sus cinco montos están en cero por CHECK. La versión anulada sigue guardada entera. Ver 0251. |
| `motivo_anulacion` | text | sí | — | Por qué se anuló, escrito a mano y obligatorio. Dentro de un año, una fila en cero sin motivo no se puede leer. |
| `anula_version` | integer | sí | — | Qué versión anula esta fila. Siempre la inmediatamente anterior; se guarda igual para que la fila se explique sola sin abrir el jsonb. |

**Candados** — lo que esta tabla hace imposible:

- `liquidacion_anulada_en_cero` — `CHECK (((anulada IS NOT TRUE) OR ((monto_periodo = (0)::numeric) AND (monto_vacaciones = (0)::numeric) AND (monto_grati = (0)::numeric) AND (monto_cts = (0)::numeric) AND (total = (0)::numeric))))`
- `liquidacion_anulada_se_explica` — `CHECK (((anulada IS NOT TRUE) OR ((length(TRIM(BOTH FROM COALESCE(motivo_anulacion, ''::text))) >= 3) AND (anula_version IS NOT NULL))))`

**De qué depende:** `(congelada_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id) ON DELETE RESTRICT`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `liquidacion_pagada_lectura` | SELECT | `((fn_es_admin_o_lider() IS TRUE) OR (persona_id = fn_persona_actual_id()))` |


### `marcajes`

*16 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `client_uuid` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `sede_id` | uuid | **no** | — | — |
| `terminal_id` | uuid | sí | — | — |
| `tipo` | tipo_marca | **no** | — | — |
| `motivo_otro` | text | sí | — | — |
| `timestamp_marca` | timestamp with time zone | **no** | — | — |
| `server_received_at` | timestamp with time zone | **no** | `now()` | — |
| `origen` | origen_marca | **no** | `'terminal'::origen_marca` | — |
| `estado_revision` | estado_revision | **no** | `'normal'::estado_revision` | — |
| `anulada_at` | timestamp with time zone | sí | — | Cuándo se anuló. NULL = marca viva. Una marca anulada no cuenta para la jornada pero sigue en el historial. |
| `anulada_por` | uuid | sí | — | — |
| `anulada_motivo` | text | sí | — | — |
| `fecha_jornada` | date | sí | — | Solo cuando la marca pertenece a la jornada de OTRO día: quien cruza la medianoche. Null en todo lo demás, y entonces manda la fecha de Lima del timestamp. Desde la 0240. |
| `confirmo_sin_refrigerio` | boolean | sí | — | Solo en marcajes de salida_final cuando ese día no había ninguna salida_almuerzo marcada. true = la persona confirmó, al marcar, que trabajó corrido sin parar a almorzar. false = dijo que sí almorzó pero olvidó marcar la salida a refrigerio. null = no se le preguntó (ese día sí marcó su salida a refrigerio, o el marcaje es de otro tipo). |

**Candados** — lo que esta tabla hace imposible:

- `chk_anulacion_completa` — `CHECK ((((anulada_at IS NULL) AND (anulada_por IS NULL) AND (anulada_motivo IS NULL)) OR ((anulada_at IS NOT NULL) AND (anulada_por IS NOT NULL) AND (anulada_motivo IS NOT NULL) AND (length(TRIM(BOTH FROM anulada_motivo)) >= 3))))`
- `marcajes_check` — `CHECK (((tipo <> 'salida_otro'::tipo_marca) OR ((motivo_otro IS NOT NULL) AND (length(TRIM(BOTH FROM motivo_otro)) >= 3))))`
- `marcajes_client_uuid_key` — `UNIQUE (client_uuid)`

**De qué depende:** `(anulada_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)` · `(sede_id) REFERENCES sedes(id)` · `(terminal_id) REFERENCES terminales(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `marcajes_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `marcajes_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `marcajes_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (sede_id = fn_sede_actual_persona()))` |
| `marcajes_select_terminal` | SELECT | `((fn_sede_actual_terminal() IS NOT NULL) AND fn_persona_en_roster_terminal(persona_id))` |


### `marcas_apartadas`

> Marcas que el terminal no logró enviar y apartó tras seis intentos. Existen para que dejen de vivir solo en el navegador de una Mac mini: acá se ven desde el panel y se resuelven. No son marcajes — un marcaje solo nace por fn_registrar_marcaje.

*13 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `client_uuid` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `terminal_id` | uuid | sí | — | — |
| `tipo` | tipo_marca | **no** | — | — |
| `motivo_otro` | text | sí | — | — |
| `timestamp_cliente` | timestamp with time zone | **no** | — | — |
| `ultimo_error` | text | sí | — | — |
| `reportada_at` | timestamp with time zone | **no** | `now()` | — |
| `resuelta_at` | timestamp with time zone | sí | — | — |
| `resuelta_por` | uuid | sí | — | — |
| `resolucion` | text | sí | — | — |
| `motivo` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `marca_apartada_resolucion_completa` — `CHECK ((((resuelta_at IS NULL) AND (resuelta_por IS NULL) AND (resolucion IS NULL) AND (motivo IS NULL)) OR ((resuelta_at IS NOT NULL) AND (resuelta_por IS NOT NULL) AND (resolucion IS NOT NULL) AND (motivo IS NOT NULL) AND (length(TRIM(BOTH FROM motivo)) >= 3))))`
- `marcas_apartadas_resolucion_check` — `CHECK ((resolucion = ANY (ARRAY['repuesta'::text, 'improcedente'::text])))`
- `marcas_apartadas_client_uuid_key` — `UNIQUE (client_uuid)`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(resuelta_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `marcas_apartadas_lectura` | SELECT | `(fn_es_admin_o_lider() OR (EXISTS ( SELECT 1    FROM personas p   WHERE ((p.id = marcas_apartadas.persona_id) AND (fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (p.sede_base_id = fn_sede_actual_persona())))))` |


### `metas_cobertura`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `sede_id` | uuid | **no** | — | — |
| `dia_semana` | integer | **no** | — | — |
| `meta` | integer | **no** | `0` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `meta_encargadas` | integer | **no** | `0` | — |
| `meta_tarde` | integer | **no** | `0` | — |

**Candados** — lo que esta tabla hace imposible:

- `metas_cobertura_dia_semana_check` — `CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))`
- `metas_cobertura_meta_check` — `CHECK ((meta >= 0))`
- `metas_cobertura_meta_encargadas_check` — `CHECK ((meta_encargadas >= 0))`
- `metas_cobertura_meta_tarde_check` — `CHECK ((meta_tarde >= 0))`

**De qué depende:** `(sede_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `metas_select_admin` | SELECT | `fn_es_admin_o_lider()` |
| `metas_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (sede_id = fn_sede_actual_persona()))` |


### `migraciones_aplicadas`

*3 columnas · ~360 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `numero` | integer | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `aplicada_at` | timestamp with time zone | **no** | `now()` | — |

**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.


### `movimientos_planilla`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `periodo_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `tipo` | text | **no** | — | — |
| `concepto` | text | **no** | — | — |
| `monto` | numeric(10,2) | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `categoria` | text | sí | — | — |
| `periodo_origen_id` | uuid | sí | — | De qué periodo YA PAGADO viene esta corrección. NULL —lo normal— significa que el movimiento es de este mes y no corrige nada (0305). |

**Candados** — lo que esta tabla hace imposible:

- `movimientos_categoria_valida` — `CHECK (((categoria IS NULL) OR (categoria = ANY (ARRAY['vacaciones'::text, 'otros'::text, 'gratificacion'::text, 'cts'::text, 'bonificacion_extraordinaria'::text]))))`
- `movimientos_planilla_concepto_check` — `CHECK ((length(TRIM(BOTH FROM concepto)) >= 2))`
- `movimientos_planilla_monto_check` — `CHECK ((monto > (0)::numeric))`
- `movimientos_planilla_tipo_check` — `CHECK ((tipo = ANY (ARRAY['bono'::text, 'descuento'::text])))`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(periodo_id) REFERENCES periodos_planilla(id) ON DELETE CASCADE` · `(periodo_origen_id) REFERENCES periodos_planilla(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `movimientos_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `objetivos_items`

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `anio` | integer | **no** | — | — |
| `mes` | integer | **no** | — | — |
| `descripcion` | text | **no** | — | — |
| `cumplido` | boolean | **no** | `false` | — |
| `orden` | integer | **no** | `0` | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `indicaciones` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `objetivos_items_anio_check` — `CHECK (((anio >= 2020) AND (anio <= 2100)))`
- `objetivos_items_descripcion_check` — `CHECK (((length(btrim(descripcion)) >= 1) AND (length(btrim(descripcion)) <= 300)))`
- `objetivos_items_indicaciones_check` — `CHECK (((indicaciones IS NULL) OR (length(indicaciones) <= 2000)))`
- `objetivos_items_mes_check` — `CHECK (((mes >= 1) AND (mes <= 12)))`

**De qué depende:** `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `objetivos_items_select` | SELECT | `((fn_es_admin_o_lider() IS TRUE) OR ((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (EXISTS ( SELECT 1    FROM personas p   WHERE ((p.id = objetivos_items.persona_id) AND (p.sede_base_id = fn_sede_actual_persona()))))) OR (persona_id = fn_persona_actual_id()))` |


### `objetivos_mensuales`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `anio` | integer | **no** | — | — |
| `mes` | integer | **no** | — | — |
| `cumplidos` | integer | **no** | — | — |
| `total` | integer | **no** | `10` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `objetivos_mensuales_anio_check` — `CHECK (((anio >= 2020) AND (anio <= 2100)))`
- `objetivos_mensuales_check` — `CHECK ((cumplidos <= total))`
- `objetivos_mensuales_cumplidos_check` — `CHECK ((cumplidos >= 0))`
- `objetivos_mensuales_mes_check` — `CHECK (((mes >= 1) AND (mes <= 12)))`
- `objetivos_mensuales_total_check` — `CHECK ((total > 0))`

**De qué depende:** `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `objetivos_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `parametros_laborales`

> Parámetros legales con vigencia (RMV, tasa de EsSalud). Versionada a propósito: un valor global sin fecha reescribe los periodos ya pagados al cambiarlo, y la norma exige que el piso de EsSalud se congele con la RMV vigente al último día del período. Solo lectura para admin o líder; se escribe por migración.

*8 columnas · ~5 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `clave` | text | **no** | — | — |
| `valor` | numeric(12,5) | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | sí | — | — |
| `sustento` | text | sí | — | De dónde sale el número: norma, fecha de publicación, o el hecho que lo justifica. Viaja pegado al valor para que dentro de un año se entienda por qué era ese. |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `sede_codigo` | text | sí | — | Sede a la que aplica este parametro. NULL = aplica a todas, y es el respaldo cuando una sede no tiene fila propia. |

**Candados** — lo que esta tabla hace imposible:

- `parametros_laborales_check` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `parametros_laborales_valor_check` — `CHECK ((valor >= (0)::numeric))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `parametros_laborales_lectura_admin` | SELECT | `fn_es_admin_o_lider()` |


### `periodo_grupo_pago`

> Estado de pago INDEPENDIENTE por grupo (tipo_vinculo) dentro de un periodo — 0323: RxH se paga más tarde que planilla, y cada uno se congela y se marca pagado por su cuenta. La fila de un grupo se crea recién cuando ese grupo se paga por primera vez (no hace falta tocar fn_crear_periodo). periodos_planilla.estado sigue existiendo sin cambios de significado para el candado de horas: pasa a pagado solo cuando TODOS los grupos con gente en el periodo están aquí como pagado, y vuelve a abierto en cuanto se reabre cualquiera.

*5 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `periodo_id` | uuid | **no** | — | — |
| `grupo` | text | **no** | — | — |
| `estado` | text | **no** | `'abierto'::text` | — |
| `pagado_at` | timestamp with time zone | sí | — | — |
| `pagado_por` | uuid | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `periodo_grupo_pago_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'pagado'::text])))`
- `periodo_grupo_pago_grupo_check` — `CHECK ((grupo = ANY (ARRAY['planilla'::text, 'prueba'::text, 'rxh'::text, 'no_trabajador'::text, 'practicante'::text])))`

**De qué depende:** `(pagado_por) REFERENCES personas(id)` · `(periodo_id) REFERENCES periodos_planilla(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `periodo_grupo_pago_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `periodos_planilla`

> El calendario de pago: del 29 al 28, con su estado. Lo lee cualquiera con sesión desde la 0234 —la pantalla /mio necesita saber en qué periodo está—; escribirlo sigue siendo solo por RPC.

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `fecha_ini` | date | **no** | — | — |
| `fecha_fin` | date | **no** | — | — |
| `estado` | text | **no** | `'abierto'::text` | — |
| `pagado_at` | timestamp with time zone | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `periodos_planilla_check` — `CHECK (((fecha_fin >= (fecha_ini + 19)) AND (fecha_fin <= (fecha_ini + 45))))`
- `periodos_planilla_estado_check` — `CHECK ((estado = ANY (ARRAY['abierto'::text, 'pagado'::text])))`
- `periodos_sin_solape` — `EXCLUDE USING gist (daterange(fecha_ini, fecha_fin, '[]'::text) WITH &&)`

**De qué depende:** `(creado_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `periodos_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `periodos_select_calendario` | SELECT | `true` |


### `personas`

*39 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `nombres` | text | **no** | — | — |
| `apellidos` | text | **no** | — | — |
| `documento` | text | sí | — | — |
| `sede_base_id` | uuid | **no** | — | — |
| `rol` | rol_usuario | **no** | `'integrante'::rol_usuario` | — |
| `estado` | text | **no** | `'activo'::text` | — |
| `pin_hash` | text | **no** | — | — |
| `fecha_ingreso` | date | **no** | `CURRENT_DATE` | — |
| `fecha_estado_cambio` | timestamp with time zone | sí | — | — |
| `auth_user_id` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |
| `email` | text | sí | — | — |
| `visible_todas_sedes` | boolean | **no** | `false` | — |
| `funcion` | text | **no** | `'calidad_servicio'::text` | — |
| `con_hijos` | boolean | **no** | `false` | — |
| `es_encargada_piso` | boolean | **no** | `false` | — |
| `sueldo_fijo` | boolean | **no** | `false` | true = cobra su remuneración completa del periodo aunque no marque (socios, dirección). Su pago no se calcula por horas y no se le mide asistencia. |
| `tipo_vinculo` | text | **no** | `'planilla'::text` | planilla \| prueba \| rxh \| no_trabajador \| practicante (0322: modalidad formativa, Ley 28518 — no es relación laboral, sin CTS/grati/vacaciones ni AFP, pero SÍ genera EsSalud por decisión de CAYLA). |
| `en_planilla *(calculada)*` | boolean | sí | `(tipo_vinculo = ANY (ARRAY['planilla'::text, 'prueba'::text]))` | DERIVADA de tipo_vinculo — no se puede escribir. Responde: ¿se le mide asistencia y disciplina? Es true para planilla y prueba; false para rxh y no_trabajador. |
| `fecha_cese` | date | sí | — | Ultimo dia efectivamente trabajado. Es la fecha de la que dependen grati, CTS y vacaciones truncas. NO es el dia en que se registro la baja. |
| `motivo_cese` | text | sí | — | Por que termino el vinculo. fin_contrato = vencio el plazo pactado y no se renovo (extincion por vencimiento, D.Leg. 728 art.16.c): NO requiere procedimiento previo. despido = la empresa termino con causa, y ese si exige carta de preaviso y descargo (D.S. 003-97-TR). fin_convenio_practicas = termino un convenio de modalidad formativa (Ley 28518): no es un cese laboral y no genera liquidacion de beneficios sociales. No son intercambiables. |
| `sueldo_base_legal` | numeric(10,2) | sí | `1130.00` | Remuneración básica ordinaria fija pactada: la que se declara en PLAME y sirve de base a CTS, gratificaciones y vacaciones. NULL = no confirmada todavía, y la boleta interna omite la línea en ese caso. Distinta de asignaciones_salario, que guarda el potencial del rango. |
| `regimen_pension` | text | sí | — | A que sistema previsional aporta, y con que esquema de comision. Los codigos sin sufijo (`integra`, `prima`, `profuturo`, `habitat`) son COMISION SOBRE FLUJO: la AFP cobra su comision del sueldo. Los que terminan en `_mixta` son COMISION MIXTA: 0 % sobre el sueldo desde febrero de 2023, la comision se cobra contra el saldo del fondo y no pasa por la boleta (0328). Quien se afilio al SPP desde 2013 esta en mixta de forma obligatoria (Ley 29903). `jubilada` = ya percibe pension y por eso NO aporta (0190); es una decision escrita, no un dato faltante. NULL sigue significando «todavia no se clasifico» y cae a configuracion.tasa_afp. |
| `fecha_fin_contrato` | date | sí | — | Fecha PREVISTA de termino del contrato a plazo fijo. Es un plan, no un hecho: la persona sigue activa y cobrando hasta ese dia. NO confundir con fecha_cese, que es el ultimo dia EFECTIVAMENTE trabajado y solo se escribe cuando ya ocurrio. Null = contrato sin fecha de termino conocida. |
| `sede_fisica_id` | uuid | sí | — | Sede donde la persona trabaja FÍSICAMENTE, cuando no es la misma que su sede base. Solo decide la tarifa de movilidad (el pasaje depende de la ciudad). Asistencia, reportes y planilla por sede siguen usando sede_base_id. |
| `cobra_movilidad` | boolean | **no** | `true` | false = no devenga movilidad aunque esté en planilla (p. ej. su traslado se cubre por viáticos). Exige movilidad_motivo. |
| `movilidad_motivo` | text | sí | — | — |
| `cargo` | text | sí | — | Que ES esta persona para CAYLA: Socia, Asesor, Encargada de tienda. Es lo que se MUESTRA. No decide ningun permiso — eso es `rol`, que lo consultan 88 politicas RLS. Vacio = la pantalla muestra la etiqueta del rol, como antes de la 0182. |
| `personal_direccion` | boolean | **no** | `false` | Personal de dirección o no sujeto a fiscalización inmediata (art. 5, D.S. 007-2002-TR): queda fuera de la jornada máxima de 48 h y no genera sobretiempo. NO exime del descanso semanal del D. Leg. 713. Es una categoría laboral, distinta de sueldo_fijo (condición de pago) y de rol (permiso del sistema). |
| `devenga_beneficios` | boolean | sí | — | OBSOLETA desde la 0196: la reemplazan devenga_grati, devenga_cts y devenga_vacaciones. Se conserva por su historial; ninguna función la lee. |
| `devenga_hasta` | date | sí | — | Fecha en que se congeló el devengo al apagar el interruptor. La escribe fn_set_devenga_beneficios; apagar sin dar fecha congela el día de hoy. |
| `devenga_grati` | boolean | sí | — | Excepción por persona. NULL = decide el tipo de vínculo. Ver la 0196. |
| `devenga_cts` | boolean | sí | — | Excepción por persona. NULL = decide el tipo de vínculo. Ver la 0196. |
| `devenga_vacaciones` | boolean | sí | — | Excepción por persona. NULL = decide el tipo de vínculo. Ver la 0196. |
| `retencion_4ta` | text | sí | — | Renta de 4ta categoria, solo para tipo_vinculo=rxh. NULL = sin configurar, no se retiene (y la planilla avisa si el pago supera el tope). automatica = 8% solo si el pago del mes supera el tope legal. siempre = 8% sea cual sea el monto, que es lo que pide el prestador que no califica para la suspension. |
| `constancia_4ta_hasta` | date | sí | — | Hasta cuando esta vigente su constancia de suspension de retenciones (Formulario Virtual 1609). Mientras cubra el fin del periodo NO se retiene, diga lo que diga retencion_4ta. Dura el ano calendario y hay que volver a pedirla: cuando vence, el modo vuelve a mandar. |
| `practicante_modalidad` | text | sí | — | preprofesional \| profesional \| null (0324). Solo tiene sentido para tipo_vinculo='practicante' — decide el máximo legal de jornada semanal (30h / 48h, art. 44 Ley 28518) que avisa la pantalla de Horarios. |

**Candados** — lo que esta tabla hace imposible:

- `personas_cargo_no_vacio` — `CHECK (((cargo IS NULL) OR (length(btrim(cargo)) > 0)))`
- `personas_cese_coherente` — `CHECK ((((estado = 'activo'::text) AND (fecha_cese IS NULL)) OR ((estado = 'inactivo'::text) AND (fecha_cese IS NOT NULL))))`
- `personas_estado_check` — `CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text])))`
- `personas_fin_contrato_coherente` — `CHECK (((fecha_fin_contrato IS NULL) OR (fecha_fin_contrato >= fecha_ingreso)))`
- `personas_motivo_cese_valido` — `CHECK (((motivo_cese IS NULL) OR (motivo_cese = ANY (ARRAY['renuncia'::text, 'despido'::text, 'fin_contrato'::text, 'fin_periodo_prueba'::text, 'fin_servicio_rxh'::text, 'fin_convenio_practicas'::text, 'mutuo_acuerdo'::text, 'por_revisar'::text]))))`
- `personas_movilidad_con_motivo` — `CHECK ((cobra_movilidad OR (NULLIF(TRIM(BOTH FROM COALESCE(movilidad_motivo, ''::text)), ''::text) IS NOT NULL)))`
- `personas_practicante_modalidad_coherente` — `CHECK (((practicante_modalidad IS NULL) OR (tipo_vinculo = 'practicante'::text)))`
- `personas_practicante_modalidad_valida` — `CHECK (((practicante_modalidad IS NULL) OR (practicante_modalidad = ANY (ARRAY['preprofesional'::text, 'profesional'::text]))))`
- `personas_regimen_pension_valido` — `CHECK (((regimen_pension IS NULL) OR (regimen_pension = ANY (ARRAY['onp'::text, 'profuturo'::text, 'prima'::text, 'integra'::text, 'habitat'::text, 'jubilada'::text, 'profuturo_mixta'::text, 'prima_mixta'::text, 'integra_mixta'::text, 'habitat_mixta'::text]))))`
- `personas_retencion_4ta_valida` — `CHECK (((retencion_4ta IS NULL) OR (retencion_4ta = ANY (ARRAY['automatica'::text, 'siempre'::text]))))`
- `personas_sueldo_base_legal_positivo` — `CHECK (((sueldo_base_legal IS NULL) OR (sueldo_base_legal > (0)::numeric)))`
- `personas_tipo_vinculo_valido` — `CHECK ((tipo_vinculo = ANY (ARRAY['planilla'::text, 'prueba'::text, 'rxh'::text, 'no_trabajador'::text, 'practicante'::text])))`
- `personas_auth_user_id_key` — `UNIQUE (auth_user_id)`
- `personas_email_key` — `UNIQUE (email)`
- `idx_personas_documento_unico` *(único parcial)* — `public.personas (documento) WHERE (documento IS NOT NULL)`

**De qué depende:** `(auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL` · `(funcion) REFERENCES areas(codigo)` · `(sede_base_id) REFERENCES sedes(id)` · `(sede_fisica_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `personas_insert_admin_lider` | INSERT | `fn_es_admin_o_lider()` |
| `personas_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `personas_select_propia` | SELECT | `(auth_user_id = auth.uid())` |
| `personas_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (sede_base_id = fn_sede_actual_persona()))` |
| `personas_update_admin_lider` | UPDATE | `fn_es_admin_o_lider()` |


### `planilla_pagada_detalle`

> La foto del pago: el desglose por persona congelado en el momento de marcar el periodo como pagado. Append-only — no se edita ni se borra. La vigente de cada periodo es la de mayor version.

*35 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `periodo_id` | uuid | **no** | — | — |
| `persona_id` | uuid | **no** | — | — |
| `version` | integer | **no** | — | — |
| `congelada_at` | timestamp with time zone | **no** | `now()` | — |
| `congelada_por` | uuid | sí | — | — |
| `origen` | text | **no** | — | 'pago' = tomada al marcar el periodo como pagado. 'retroactivo' = reconstruida por la 0096 para periodos que ya figuraban pagados; es el número del día de la migración, no el del día del pago. |
| `nombre` | text | **no** | — | — |
| `sede_codigo` | text | **no** | — | — |
| `area_codigo` | text | sí | — | — |
| `rango` | text | sí | — | — |
| `salario_ref` | numeric(12,2) | sí | — | — |
| `horas_mes` | numeric(10,2) | **no** | `0` | — |
| `dias_trabajados` | integer | **no** | `0` | — |
| `pago_base` | numeric(12,2) | **no** | `0` | — |
| `monto_feriados` | numeric(12,2) | **no** | `0` | — |
| `monto_plus` | numeric(12,2) | **no** | `0` | — |
| `asignacion_familiar` | numeric(12,2) | **no** | `0` | — |
| `bonos` | numeric(12,2) | **no** | `0` | — |
| `descuentos` | numeric(12,2) | **no** | `0` | — |
| `total` | numeric(12,2) | **no** | — | — |
| `provision_gratificacion` | numeric(12,2) | **no** | `0` | — |
| `provision_cts` | numeric(12,2) | **no** | `0` | — |
| `provision_vacaciones` | numeric(12,2) | **no** | `0` | — |
| `provision_total` | numeric(12,2) | **no** | `0` | — |
| `costo_total *(calculada)*` | numeric(12,2) | sí | `(total + provision_total)` | Lo que le cuesta a CAYLA (total + provisiones). Distinto de `total`, que es lo que recibe la persona. |
| `fila` | jsonb | **no** | — | — |
| `monto_movilidad` | numeric(12,2) | **no** | `0` | — |
| `monto_educacion` | numeric(12,2) | **no** | `0` | — |
| `descuento_pension` | numeric(12,2) | **no** | `0` | Lo que se le retuvo para su fondo de pensión (AFP u ONP). RESTA del total: es plata que la persona no recibe en la mano, pero que tampoco se queda en CAYLA. |
| `aporte_essalud` | numeric(12,2) | **no** | `0` | Aporte del empleador a EsSalud. NO entra en el total porque no se le paga ni se le descuenta a la persona: se guarda para que la foto sea el registro completo de lo que costó el mes. |
| `provision_bonif_extraordinaria` | numeric(10,2) | **no** | `0` | Provision de la bonificacion extraordinaria (Ley 30334): 9% de la provision de gratificacion. Las filas anteriores a la 0134 quedan en 0 a proposito: en su momento no se provisiono. |
| `monto_sobretiempo` | numeric(12,2) | **no** | `0` | El RECARGO por sobretiempo (25 % / 35 %), no la hora completa: las horas ya están dentro de pago_base. SUMA al total. Las horas, el desde y el hasta viajan en la columna `fila`. Se mide contra 48 h semanales en ciclos de siete días que no se solapan, nunca contra 8 h diarias — ver la 0185. |
| `retencion_4ta *(calculada)*` | numeric(12,2) | sí | `round(COALESCE(((fila ->> 'retencion_4ta'::text))::numeric, (0)::numeric), 2)` | Retención de 4ta categoría congelada con el pago (art. 71 LIR, migración 0245). Se DERIVA de fila->>'retencion_4ta', no se escribe: así no puede desincronizarse del JSON de la boleta ni obliga a tocar fn_planilla_congelar. Entra en chk_foto_cuadra restando, como descuento_pension. |
| `monto_descanso_semanal` | numeric(12,2) | **no** | `0` | — |
| `grupo` | text | **no** | `'planilla'::text` | tipo_vinculo de la persona AL MOMENTO de congelar esta fila — 0323. Es lo que separa el version de planilla del de RxH dentro del mismo periodo: cada grupo tiene su propia secuencia de versiones. |

**Candados** — lo que esta tabla hace imposible:

- `chk_foto_cuadra` — `CHECK ((total = (((((((((((pago_base + monto_feriados) + monto_plus) + asignacion_familiar) + monto_movilidad) + monto_educacion) - descuento_pension) + monto_sobretiempo) + monto_descanso_semanal) + bonos) - descuentos) - retencion_4ta)))`
- `chk_foto_grupo_valido` — `CHECK ((grupo = ANY (ARRAY['planilla'::text, 'prueba'::text, 'rxh'::text, 'no_trabajador'::text, 'practicante'::text])))`
- `planilla_pagada_detalle_dias_trabajados_check` — `CHECK ((dias_trabajados >= 0))`
- `planilla_pagada_detalle_horas_mes_check` — `CHECK ((horas_mes >= (0)::numeric))`
- `planilla_pagada_detalle_origen_check` — `CHECK ((origen = ANY (ARRAY['pago'::text, 'retroactivo'::text])))`
- `planilla_pagada_detalle_version_check` — `CHECK ((version >= 1))`

**De qué depende:** `(congelada_por) REFERENCES personas(id)` · `(periodo_id) REFERENCES periodos_planilla(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `foto_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `foto_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |


### `politica_salarial`

> Cada version publicada del cuadro de categorias y politica salarial, con el documento congelado. Congelado y no regenerado: si se regenerara, cambiar una banda dejaria todos los acuses previos apuntando a un texto que nadie firmo.

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `version` | integer | **no** | — | — |
| `documento` | text | **no** | — | El texto literal que se comunico. Es la prueba: tiene que poder mostrarse igual dentro de cinco anios. |
| `huella_cuadro` | text | **no** | — | Huella del cuadro al momento de publicar. Sirve para detectar que el cuadro cambio y que hay que publicar una version nueva. |
| `notas` | text | sí | — | — |
| `publicada_por` | uuid | sí | — | — |
| `publicada_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `politica_salarial_documento_check` — `CHECK ((btrim(documento) <> ''::text))`

**De qué depende:** `(publicada_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `politica_lectura` | SELECT | `true` |


### `politica_salarial_acuses`

> Constancia de que una persona fue informada de una version concreta. Es lo que cierra el numeral 25.23 del RLGIT.

*4 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `version` | integer | **no** | — | — |
| `nombre_declarado` | text | **no** | — | El nombre que la persona escribio al dejar constancia. No es un requisito legal; es lo que convierte un clic en un acto deliberado. |
| `acusado_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `politica_salarial_acuses_nombre_declarado_check` — `CHECK ((btrim(nombre_declarado) <> ''::text))`

**De qué depende:** `(persona_id) REFERENCES personas(id)` · `(version) REFERENCES politica_salarial(version)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `acuses_lectura` | SELECT | `((persona_id = fn_persona_actual_id()) OR (fn_es_admin_o_lider() IS TRUE))` |


### `push_tokens`

*6 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `expo_push_token` | text | **no** | — | — |
| `plataforma` | text | **no** | — | — |
| `activo` | boolean | **no** | `true` | — |
| `last_seen_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `push_tokens_plataforma_check` — `CHECK ((plataforma = ANY (ARRAY['ios'::text, 'android'::text])))`
- `push_tokens_persona_id_expo_push_token_key` — `UNIQUE (persona_id, expo_push_token)`

**De qué depende:** `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `push_tokens_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `push_tokens_propio` | TODAS | `(persona_id = fn_persona_actual_id())` |


### `rendimiento_mensual`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `persona_id` | uuid | **no** | — | — |
| `anio` | integer | **no** | — | — |
| `mes` | integer | **no** | — | — |
| `porcentaje` | numeric(5,2) | **no** | — | — |
| `etiqueta_codigo` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `puesto_por` | uuid | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `updated_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `rendimiento_mensual_mes_check` — `CHECK (((mes >= 1) AND (mes <= 12)))`
- `rendimiento_mensual_porcentaje_check` — `CHECK (((porcentaje >= (0)::numeric) AND (porcentaje <= (100)::numeric)))`

**De qué depende:** `(etiqueta_codigo) REFERENCES etiquetas_complemento(codigo)` · `(persona_id) REFERENCES personas(id) ON DELETE CASCADE` · `(puesto_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `rendimiento_mensual_select` | SELECT | `fn_es_admin_o_lider()` |
| `rendimiento_mensual_write` | TODAS | `fn_es_admin_o_lider()` |


### `reversas_pago`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `periodo_id` | uuid | **no** | — | — |
| `revertido_por` | uuid | sí | — | — |
| `revertido_at` | timestamp with time zone | **no** | `now()` | — |
| `motivo` | text | **no** | — | — |
| `pagado_at_previo` | timestamp with time zone | sí | — | — |
| `tipo` | text | **no** | `'reapertura'::text` | 'reapertura' = el periodo volvió a estado abierto y sus candados se levantaron (fn_revertir_pago). 'repago' = nunca se abrió, solo se recalculó la foto (fn_repagar_periodo, 0098). No son lo mismo y la auditoría tiene que poder distinguirlas. |
| `grupo` | text | sí | — | Grupo (tipo_vinculo) que se reabrió o se repagó — 0323. NULL en las filas anteriores a esta migración, cuando reabrir siempre afectaba al periodo entero de una sola vez. |

**Candados** — lo que esta tabla hace imposible:

- `chk_reversa_grupo_valido` — `CHECK (((grupo IS NULL) OR (grupo = ANY (ARRAY['planilla'::text, 'prueba'::text, 'rxh'::text, 'no_trabajador'::text, 'practicante'::text]))))`
- `chk_reversa_tipo` — `CHECK ((tipo = ANY (ARRAY['reapertura'::text, 'repago'::text])))`

**De qué depende:** `(periodo_id) REFERENCES periodos_planilla(id) ON DELETE CASCADE` · `(revertido_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `reversas_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |


### `revisiones_pedidas`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `comentario` | text | **no** | — | — |
| `pedida_at` | timestamp with time zone | **no** | `now()` | — |
| `atendida_at` | timestamp with time zone | sí | — | — |
| `atendida_por` | uuid | sí | — | — |
| `respuesta` | text | sí | — | — |

**Candados** — lo que esta tabla hace imposible:

- `chk_revision_atendida_completa` — `CHECK (((atendida_at IS NULL) OR (atendida_por IS NOT NULL)))`
- `revisiones_pedidas_comentario_check` — `CHECK ((length(TRIM(BOTH FROM comentario)) >= 5))`
- `revisiones_pedidas_persona_id_fecha_key` — `UNIQUE (persona_id, fecha)`

**De qué depende:** `(atendida_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `revisiones_select_admin_lider` | SELECT | `(fn_es_admin_o_lider() IS TRUE)` |
| `revisiones_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `revisiones_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (EXISTS ( SELECT 1    FROM personas p   WHERE ((p.id = revisiones_pedidas.persona_id) AND (p.sede_base_id = fn_sede_actual_persona())))))` |


### `sedes`

*6 columnas · ~3 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `activa` | boolean | **no** | `true` | — |
| `tipo` | text | **no** | `'tienda'::text` | Qué es este local: 'central' (administración y Desarrollo Organizacional, no vende), 'taller' (producción) o 'tienda' (atiende clientas). Propiedad del local, no de quien trabaje ahí este mes. Sirve para no comparar el costo de una oficina con el de una tienda. |
| `ciudad` | text | sí | — | La ciudad donde opera la sede, para los documentos legales que la nombran («En la ciudad de …»). Solo la tienen las sedes que SON un local: tienda y taller. Una sede de tipo `central` la deja en null a proposito (0282) — central es una clasificacion de personal administrativo, no un lugar, y su gente puede estar en cualquier ciudad: la ciudad se elige por persona al generar el contrato. |

**Candados** — lo que esta tabla hace imposible:

- `chk_sede_tipo` — `CHECK ((tipo = ANY (ARRAY['central'::text, 'taller'::text, 'tienda'::text])))`
- `sedes_codigo_formato` — `CHECK ((codigo ~ '^[A-Z0-9]{2,8}$'::text))`
- `sedes_codigo_key` — `UNIQUE (codigo)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `sedes_select_autenticados` | SELECT | `true` |


### `solicitudes_vacaciones`

> Una persona pide sus vacaciones; DO aprueba o rechaza. Aprobar crea la fila real en `ausencias` via fn_registrar_ausencia — esta tabla nunca es la fuente de verdad de una ausencia, solo del pedido.

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha_inicio` | date | **no** | — | — |
| `fecha_fin` | date | **no** | — | — |
| `comentario` | text | sí | — | — |
| `estado` | text | **no** | `'pendiente'::text` | — |
| `pedida_at` | timestamp with time zone | **no** | `now()` | — |
| `resuelta_at` | timestamp with time zone | sí | — | — |
| `resuelta_por` | uuid | sí | — | — |
| `respuesta` | text | sí | — | — |
| `ausencia_id` | uuid | sí | — | La ausencia que esta solicitud produjo al aprobarse. Trazabilidad, no una segunda fuente: la ausencia manda desde que existe. |

**Candados** — lo que esta tabla hace imposible:

- `chk_solicitud_vacaciones_ausencia_solo_si_aprobada` — `CHECK (((estado = 'aprobada'::text) = (ausencia_id IS NOT NULL)))`
- `chk_solicitud_vacaciones_rango` — `CHECK ((fecha_fin >= fecha_inicio))`
- `chk_solicitud_vacaciones_resuelta_completa` — `CHECK (((estado = 'pendiente'::text) OR ((resuelta_at IS NOT NULL) AND (resuelta_por IS NOT NULL))))`
- `solicitudes_vacaciones_estado_check` — `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text, 'cancelada'::text])))`
- `solicitudes_vacaciones_pendientes_sin_solape` — `EXCLUDE USING gist (persona_id WITH =, daterange(fecha_inicio, fecha_fin, '[]'::text) WITH &&) WHERE ((estado = 'pendiente'::text))`

**De qué depende:** `(ausencia_id) REFERENCES ausencias(id)` · `(persona_id) REFERENCES personas(id)` · `(resuelta_por) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `solicitudes_vacaciones_select_admin_lider` | SELECT | `(fn_es_admin_o_lider() IS TRUE)` |
| `solicitudes_vacaciones_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |


### `tardanzas_justificadas`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `motivo` | text | **no** | — | — |
| `observacion` | text | sí | — | — |
| `creado_por` | uuid | **no** | — | — |
| `creado_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `tardanzas_justificadas_motivo_check` — `CHECK ((motivo = ANY (ARRAY['fuerza_mayor'::text, 'salud'::text, 'transporte'::text, 'otro'::text])))`
- `tardanzas_justificadas_persona_id_fecha_key` — `UNIQUE (persona_id, fecha)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tardj_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `tardj_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `tardj_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |


### `tarifas_hora`

*8 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | sí | — | — |
| `tarifa_hora_soles` | numeric(10,2) | **no** | — | — |
| `creado_por` | uuid | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `tarifas_hora_check` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `tarifas_hora_tarifa_hora_soles_check` — `CHECK ((tarifa_hora_soles > (0)::numeric))`
- `idx_tarifa_vigente_unica` *(único parcial)* — `public.tarifas_hora (persona_id) WHERE (vigente_hasta IS NULL)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tarifas_admin_lider` | TODAS | `fn_es_admin_o_lider()` |


### `tasas_pension`

> Tasas de aporte previsional por régimen, versionadas por vigencia. Solo lectura para admin o líder (0115). La escritura se hace por migración: una tasa mal puesta acá cambia el descuento de toda la planilla, y fn_planilla_calcular es security definer, así que aplica lo que encuentre sin validar.

*11 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `regimen` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `aporte` | numeric(7,5) | **no** | — | — |
| `comision` | numeric(7,5) | **no** | `0` | — |
| `prima` | numeric(7,5) | **no** | `0` | — |
| `vigente_desde` | date | **no** | — | — |
| `vigente_hasta` | date | sí | — | — |
| `nota` | text | sí | — | — |
| `created_at` | timestamp with time zone | **no** | `now()` | — |
| `grava_subsidio` | boolean | **no** | `true` | Si el subsidio de EsSalud entra en la base de aporte de este regimen. AFP si (Ley 26504 art. 16; TUO Ley SPP art. 30 ultimo parrafo), sistema nacional no (Informe 049-2014-SUNAT/5D0000). Vive aqui y no en una lista dentro de fn_planilla_calcular para que cambiarlo sea un UPDATE (0262). |

**Candados** — lo que esta tabla hace imposible:

- `tasas_pension_aporte_check` — `CHECK ((aporte >= (0)::numeric))`
- `tasas_pension_check` — `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- `tasas_pension_comision_check` — `CHECK ((comision >= (0)::numeric))`
- `tasas_pension_prima_check` — `CHECK ((prima >= (0)::numeric))`
- `idx_tasas_pension_vigente_unica` *(único parcial)* — `public.tasas_pension (regimen) WHERE (vigente_hasta IS NULL)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tasas_pension_lectura_admin` | SELECT | `fn_es_admin_o_lider()` |


### `terminal_roster` *(vista)*

> Lo unico que el kiosco de marcaje necesita ver de una persona: como se llama, de que sede es y su pin_hash. Existe porque RLS filtra filas y no columnas, asi que mientras el terminal leyera `personas` su token alcanzaba el DNI y la remuneracion (0285).

*6 columnas*

<details><summary>Cómo se construye esta vista</summary>

```sql
SELECT p.id,
    p.nombres,
    p.apellidos,
    p.pin_hash,
    s.codigo AS sede_codigo,
    s.nombre AS sede_nombre
   FROM personas p
     JOIN sedes s ON s.id = p.sede_base_id
  WHERE p.estado = 'activo'::text AND fn_sede_actual_terminal() IS NOT NULL AND (p.sede_base_id = fn_sede_actual_terminal() OR p.visible_todas_sedes = true);
```

</details>

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | — |
| `nombres` | text | sí | — | — |
| `apellidos` | text | sí | — | — |
| `pin_hash` | text | sí | — | — |
| `sede_codigo` | text | sí | — | — |
| `sede_nombre` | text | sí | — | — |


### `terminales`

*7 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `sede_id` | uuid | **no** | — | — |
| `nombre_dispositivo` | text | **no** | — | — |
| `auth_user_id` | uuid | sí | — | — |
| `activo` | boolean | **no** | `true` | — |
| `ultimo_visto_at` | timestamp with time zone | sí | — | — |
| `requiere_pin` | boolean | **no** | `true` | — |

**Candados** — lo que esta tabla hace imposible:

- `terminal_activo_con_dueno` — `CHECK (((NOT activo) OR (auth_user_id IS NOT NULL)))`
- `terminales_auth_user_id_key` — `UNIQUE (auth_user_id)`

**De qué depende:** `(auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL` · `(sede_id) REFERENCES sedes(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `terminales_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `terminales_select_propio` | SELECT | `(auth_user_id = auth.uid())` |
| `terminales_write_admin_lider` | TODAS | `fn_es_admin_o_lider()` |


### `tipos_ausencia`

> Que tipos de ausencia existen y como se comporta cada uno. Editable sin migracion: cambiar la politica de permisos no deberia exigir tocar el esquema. OJO: `paga` gobierna las PROVISIONES (grati/CTS/vacaciones), NO el sueldo del periodo — fn_planilla_calcular no lee esta tabla. El sueldo de una licencia con goce se paga con un movimiento de planilla.

*10 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `codigo` | text | **no** | — | — |
| `nombre` | text | **no** | — | — |
| `paga` | boolean | **no** | `false` | Para descanso_medico y maternidad lo manda la ley peruana, no CAYLA. Para el resto es decisión de la empresa: en CAYLA no existe el permiso con goce. |
| `requiere_documento` | boolean | **no** | `false` | — |
| `requiere_aprobacion` | boolean | **no** | `false` | — |
| `descuenta_vacaciones` | boolean | **no** | `false` | — |
| `alerta_desde` | integer | sí | — | — |
| `ventana_alerta_dias` | integer | sí | — | — |
| `activo` | boolean | **no** | `true` | — |
| `orden` | integer | **no** | `100` | — |

**Candados** — lo que esta tabla hace imposible:

- `tipos_ausencia_codigo_check` — `CHECK ((codigo ~ '^[a-z_]{3,30}$'::text))`
- `tipos_ausencia_nombre_check` — `CHECK ((length(TRIM(BOTH FROM nombre)) >= 3))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `tipos_ausencia_select` | SELECT | `true` |


### `topes_educacion_rango`

> Techo mensual de la asignación por educación de cada rango. NO es un monto a pagar: cada persona cobra el 75% de lo que sostiene su comprobante (0120) y nunca más que este techo. Única fuente: no hay copia en el código. `apps/web/lib/rangos.ts` no declara ningún tope de educación a propósito desde 2026-08-06 (ver la 0178) — ese campo pagó de más por quedar desactualizado, y se borró en vez de sincronizarse.

*3 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `rango` | text | **no** | — | — |
| `tope_mensual` | numeric(10,2) | **no** | — | — |
| `actualizado_at` | timestamp with time zone | **no** | `now()` | — |

**Candados** — lo que esta tabla hace imposible:

- `topes_educacion_rango_rango_check` — `CHECK ((rango = ANY (ARRAY['colibri'::text, 'cayla'::text, 'support'::text, 'aurora'::text, 'oraculo'::text, 'archicaylo'::text])))`
- `topes_educacion_rango_tope_mensual_check` — `CHECK ((tope_mensual >= (0)::numeric))`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `topes_educacion_lectura_admin` | SELECT | `fn_es_admin_o_lider()` |


### `turnos`

*9 columnas · ~0 filas · permisos por fila **activos***

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` | — |
| `persona_id` | uuid | **no** | — | — |
| `fecha` | date | **no** | — | — |
| `hora_entrada` | time without time zone | sí | — | — |
| `hora_salida` | time without time zone | sí | — | — |
| `origen` | text | **no** | `'import'::text` | — |
| `es_descanso` | boolean | **no** | `false` | — |
| `created_at` | timestamp with time zone | sí | — | Cuándo se escribió esta fila. NULL en las filas anteriores a la 0298, y eso es a propósito: sellarlas con la fecha de la migración habría sido inventar. |
| `creado_por` | uuid | sí | — | Quién lo puso, vía fn_verificar_corrector. NULL en lo anterior a la 0298. |

**Candados** — lo que esta tabla hace imposible:

- `turnos_entrada_o_descanso` — `CHECK ((es_descanso OR (hora_entrada IS NOT NULL)))`
- `turnos_persona_id_fecha_key` — `UNIQUE (persona_id, fecha)`

**De qué depende:** `(creado_por) REFERENCES personas(id)` · `(persona_id) REFERENCES personas(id)`

**Quién puede qué** (políticas de fila):

| Política | Operación | Condición |
|---|---|---|
| `turnos_select_admin_lider` | SELECT | `fn_es_admin_o_lider()` |
| `turnos_select_propia` | SELECT | `(persona_id = fn_persona_actual_id())` |
| `turnos_select_supervisor` | SELECT | `((fn_rol_actual() = 'supervisor_sede'::rol_usuario) AND (persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_persona()))))` |
| `turnos_select_terminal` | SELECT | `(persona_id IN ( SELECT personas.id    FROM personas   WHERE (personas.sede_base_id = fn_sede_actual_terminal())))` |


### `v_planilla_pagada` *(vista)*

> Solo la foto vigente de cada (periodo, grupo) — la de mayor version DENTRO de ese grupo, no del periodo entero (0323). Lo que hay que sumar para contabilidad.

*35 columnas*

<details><summary>Cómo se construye esta vista</summary>

```sql
SELECT periodo_id,
    persona_id,
    version,
    congelada_at,
    congelada_por,
    origen,
    nombre,
    sede_codigo,
    area_codigo,
    rango,
    salario_ref,
    horas_mes,
    dias_trabajados,
    pago_base,
    monto_feriados,
    monto_plus,
    asignacion_familiar,
    bonos,
    descuentos,
    total,
    provision_gratificacion,
    provision_cts,
    provision_vacaciones,
    provision_total,
    costo_total,
    fila,
    monto_movilidad,
    monto_educacion,
    descuento_pension,
    aporte_essalud,
    provision_bonif_extraordinaria,
    monto_sobretiempo,
    retencion_4ta,
    monto_descanso_semanal,
    grupo
   FROM planilla_pagada_detalle d
  WHERE version = (( SELECT max(x.version) AS max
           FROM planilla_pagada_detalle x
          WHERE x.periodo_id = d.periodo_id AND x.grupo = d.grupo));
```

</details>

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `periodo_id` | uuid | sí | — | — |
| `persona_id` | uuid | sí | — | — |
| `version` | integer | sí | — | — |
| `congelada_at` | timestamp with time zone | sí | — | — |
| `congelada_por` | uuid | sí | — | — |
| `origen` | text | sí | — | — |
| `nombre` | text | sí | — | — |
| `sede_codigo` | text | sí | — | — |
| `area_codigo` | text | sí | — | — |
| `rango` | text | sí | — | — |
| `salario_ref` | numeric(12,2) | sí | — | — |
| `horas_mes` | numeric(10,2) | sí | — | — |
| `dias_trabajados` | integer | sí | — | — |
| `pago_base` | numeric(12,2) | sí | — | — |
| `monto_feriados` | numeric(12,2) | sí | — | — |
| `monto_plus` | numeric(12,2) | sí | — | — |
| `asignacion_familiar` | numeric(12,2) | sí | — | — |
| `bonos` | numeric(12,2) | sí | — | — |
| `descuentos` | numeric(12,2) | sí | — | — |
| `total` | numeric(12,2) | sí | — | — |
| `provision_gratificacion` | numeric(12,2) | sí | — | — |
| `provision_cts` | numeric(12,2) | sí | — | — |
| `provision_vacaciones` | numeric(12,2) | sí | — | — |
| `provision_total` | numeric(12,2) | sí | — | — |
| `costo_total` | numeric(12,2) | sí | — | — |
| `fila` | jsonb | sí | — | — |
| `monto_movilidad` | numeric(12,2) | sí | — | — |
| `monto_educacion` | numeric(12,2) | sí | — | — |
| `descuento_pension` | numeric(12,2) | sí | — | — |
| `aporte_essalud` | numeric(12,2) | sí | — | — |
| `provision_bonif_extraordinaria` | numeric(10,2) | sí | — | — |
| `monto_sobretiempo` | numeric(12,2) | sí | — | — |
| `retencion_4ta` | numeric(12,2) | sí | — | — |
| `monto_descanso_semanal` | numeric(12,2) | sí | — | — |
| `grupo` | text | sí | — | — |


### `vacaciones` *(vista)*

> Vista sobre `ausencias` (tipo = vacaciones). Era una tabla hasta la 0101. Se conserva con las mismas columnas para que fn_vacaciones_resumen, fn_faltas y la pantalla de Vacaciones sigan funcionando sin cambios.

*7 columnas*

<details><summary>Cómo se construye esta vista</summary>

```sql
SELECT id,
    persona_id,
    fecha_inicio,
    fecha_fin,
    motivo AS observacion,
    registrada_por AS creado_por,
    registrada_at AS creado_at
   FROM ausencias a
  WHERE tipo = 'vacaciones'::text AND anulada_at IS NULL;
```

</details>

| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |
|---|---|---|---|---|
| `id` | uuid | sí | — | — |
| `persona_id` | uuid | sí | — | — |
| `fecha_inicio` | date | sí | — | — |
| `fecha_fin` | date | sí | — | — |
| `observacion` | text | sí | — | — |
| `creado_por` | uuid | sí | — | — |
| `creado_at` | timestamp with time zone | sí | — | — |

