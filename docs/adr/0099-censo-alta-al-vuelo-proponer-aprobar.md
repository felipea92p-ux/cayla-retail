# ADR-0099 — Alta de producto al vuelo durante el censo: proponer/aprobar, no líder-only

**Fecha:** 2026-09-18
**Decidido con:** Felipe, vía AskUserQuestion

## Contexto

El censo real de catálogo (300-900 SKUs físicos, decisión de Felipe del
2026-09-09) lo cuentan las Encargadas de sede, no un Líder parado al lado de
cada una. Pero la única función que existe para crear un producto nuevo,
`crear_producto_con_variantes`, exige `fn_es_lider()`: "Solo un líder puede
dar de alta un producto nuevo". Con ese candado, cada prenda que el catálogo
no reconoce durante el conteo detiene a la Encargada hasta que otra persona
la crea aparte en `/productos/nuevo`.

El diseño original del censo (V1, `unificacion/30_conteos.sql`,
`conteo_crear_variante`) no tenía este candado — cualquiera podía crear al
vuelo. Se perdió en el corte a V2 (2026-09-12) junto con el resto del
mecanismo de censo.

## Decisión

**No revivir el diseño V1 (sin candado) ni restringir el alta al Líder.**
Se usa el mismo patrón proponer/aprobar que ya rige colores, tallas,
tejidos, patrones y etiquetas (ADR-0070, ADR-0095): cualquier colaborador
con sesión puede crear una prenda al vuelo durante el conteo; queda
`estado_alta = 'pendiente'` pero se puede contar y vender de inmediato (no
bloquea el conteo); un Líder la revisa después desde `/productos/[id]/
editar` y la aprueba o rechaza.

`productos.estado_alta` es una columna nueva, independiente de
`productos.estado` (`'activo'`/`'descontinuado'`, el ciclo de vida
comercial). Mezclar ambas hubiera sido un solo campo cargando dos preguntas
distintas ("¿se puede vender?" y "¿alguien ya lo revisó?") — el mismo error
de diseño que el principio de estados imposibles primero pide evitar.

`censo_crear_variante` (nueva RPC, `security definer`, sin el chequeo de
`fn_es_lider()` que sí tiene `crear_producto_con_variantes`) crea un
producto de una sola variante — no una matriz — y liga el código de barras
escaneado con `origen = 'fabrica'`. `revisar_producto_censo` es la única
puerta de aprobar/rechazar; la transición real la sigue exigiendo el
trigger `fn_productos_estado_alta_trigger` (mismo mecanismo que los otros 5
vocabularios), no el RPC.

## Alternativas descartadas

- **Sin candado (diseño V1):** cero fricción, pero cualquiera podría crear
  productos duplicados o mal cargados sin que nadie los revise — reintroduce
  el problema exacto que llevó a poner el candado de Líder en V2.
- **Solo Líder puede crear (mantener el candado actual):** no resuelve nada
  — vuelve al problema original si el Líder no está físicamente en la
  tienda contando, que es el caso normal durante un censo de 300-900
  prendas.

## Consecuencias

- Un producto `estado_alta = 'pendiente'` ya es `estado = 'activo'` por
  defecto: aparece en `/vender` y en `/productos` antes de que un Líder lo
  revise. Es la misma superficie de riesgo que ya existe para un color o una
  talla propuestos — aceptada porque el punto del censo es no bloquear el
  conteo, y el Líder ve la cola de pendientes en el banner de `/productos`.
- Si un Líder rechaza una prenda (era un duplicado, un error de tipeo), el
  trigger apaga `estado` a `'descontinuado'` — a diferencia de un color/talla
  rechazado, que solo apaga `activo`, porque acá sí hay que sacarla de venta
  y de conteo real, no solo del vocabulario.

## Se rompe si

Dos Encargadas escanean el mismo código de fábrica en el mismo segundo en
dos conteos distintos: la segunda inserción en `codigos_barras` choca contra
el `unique` de la columna `codigo` y la RPC falla con "ese código de barras
ya está registrado" — la segunda persona tiene que refrescar la búsqueda en
vez de crear un duplicado. Aceptado: es el mismo comportamiento que
`variantes_asignar_codigo` ya tiene para cualquier alta concurrente, y el
mensaje de error le dice a la Encargada que ya existe, no que algo se rompió.
