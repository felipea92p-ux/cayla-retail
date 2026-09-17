# ADR-0016 — Anular un comprobante: dos caminos según el tipo, y solo el líder

**Fecha:** 2026-09-09
**Estado:** Aplicado y probado en local (2026-09-09). Siete reglas verificadas
contra Postgres real, suplantando a la líder sembrada: no se marca aceptado sin
ambiente; no se anula un pendiente; no se anula sin motivo; no se anula con una
nota viva colgada; una baja en trámite NO escribe 'anulado'; una confirmada sí,
con motivo y `anulado_por`. Código verificado (tsc, eslint, 51 tests).
**Aplicado en producción el 2026-09-09** (`unificacion/24`; restricción
`VALIDADO`) **y probado contra el sandbox real de Lucode el mismo día** — la
prueba encontró dos errores en el adaptador que la documentación no dejaba ver;
ver "Lo que la prueba real corrigió". Falta desplegar el código a Vercel.

## Contexto

El sistema podía emitir y transmitir, pero no deshacer. `anularDocumentoLucode`
existía en `lib/lucode.ts` sin ruta ni botón, y `actualizar_transmision_comprobante`
rechaza `'anulado'` a propósito. Anular era un trámite manual en el panel de
Lucode — le pasó a **B004-000001** el 05-09: una boleta real, en producción, por
una venta que no existió, que quedó viva porque el sistema no sabía darla de baja.

Eso convertía cada "Transmitir" de producción en algo irreversible desde el
sistema, y es la razón por la que este paso va **antes** de poner las
credenciales de producción en Vercel: darle el botón a tres sedes sin darles el
deshacer es un diseño que le pasa el costo del error a quien menos puede
absorberlo.

## Decisión

**1. Dos caminos, no uno, porque SUNAT tiene dos.** Verificado en
`docs.apisunat.pe/llms-full.txt`:

| Tipo | Camino SUNAT | Endpoint de Lucode |
|---|---|---|
| Factura, NC, ND | Comunicación de Baja | `POST /api/v3/voided` |
| **Boleta** | **Resumen Diario** | `POST /api/v3/daily-summary` con `accion_resumen: "anular"` |

Una boleta **no** se puede dar de baja individualmente. El adaptador ya excluía
`boleta` del tipo de `anularDocumentoLucode` — la mitad que faltaba es
`anularBoletaLucode`, no un `if` adentro de la que ya estaba.

**2. "Anulado" solo cuando SUNAT lo confirma.** El resumen diario se procesa de
forma diferida: la respuesta puede volver `PENDIENTE`. En ese caso el
comprobante conserva `estado='aceptado'` y gana `anulacion_solicitada_at`; la
pantalla dice **"Anulación en trámite"**. Escribir `'anulado'` con una respuesta
pendiente sería exactamente la mentira que cerró [ADR-0015](0015-entorno-de-transmision-en-el-comprobante.md),
en la otra dirección.

**3. Solo el líder anula.** Decisión de Felipe (2026-09-09) sobre cómo opera el
negocio, no técnica. Emitir de más se corrige; anular es irreversible ante SUNAT
y corre contra un plazo. La regla vive en la RPC (`fn_es_lider()`), no solo en la
pantalla: la pantalla ya era líder-only, pero una pantalla no es un permiso.

**4. Motivo obligatorio, con nombre y fecha.** `check (estado <> 'anulado' or
motivo_anulacion is not null)` + `anulado_por`. Un comprobante dado de baja sin
razón no le sirve a nadie en una fiscalización.

**5. No se anula un comprobante con notas vivas.** Una NC/ND exige que su
original esté `aceptado` (trigger de `0034`). Anular el original dejaría la nota
colgando de un documento de baja: la RPC obliga a resolver la nota primero.

**6. El sistema no decide el plazo.** La documentación de Lucode se contradice
—una página dice 3 días, otra 5— y SUNAT habla de 7. Bloquear por una fecha
inventada acá negaría anulaciones legítimas. Se intenta, y si el proveedor
rechaza se muestra su motivo textual. El proveedor es la autoridad sobre su
propia regla; nosotros no la adivinamos.

## Alternativas descartadas

- **Un solo endpoint con un `if tipo === 'boleta'` adentro.** Son dos hechos
  tributarios distintos con respuestas distintas (una síncrona, otra diferida).
  Esconderlos bajo una función haría que quien la lea asuma que anular una
  boleta y una factura son lo mismo — y no lo son.
- **Anular emitiendo una nota de crédito automática.** Es la salida cuando el
  plazo venció, pero no es lo mismo: una NC corrige una operación que existió;
  una baja dice que nunca existió. Confundirlas ensucia el registro contable.
  Cuando SUNAT rechace por plazo, la pantalla lo dice y la nota se emite a mano.
- **Permitir anular un comprobante `pendiente`.** Nunca se transmitió: no hay
  nada que dar de baja ante SUNAT, y marcarlo `'anulado'` inventaría una baja
  que jamás ocurrió. Queda para un ítem propio: qué hacer con un correlativo
  reservado que nunca se transmitió.

## Lo que la prueba real corrigió (2026-09-09)

Se construyó contra la documentación pública y **se probó llamando de verdad al
sandbox**. La prueba encontró que la documentación describe mal el cuerpo de los
**dos** endpoints — ninguno acepta la forma plana que decía `llms-full.txt`:

| | Lo que decía la doc | Lo que el sandbox acepta |
|---|---|---|
| Boleta (`/daily-summary`) | `{documento:"boleta", serie, numero, accion_resumen}` | `{documento:"resumen_diario", documentos_afectados:[{accion_resumen, documento, serie, numero}]}` |
| Factura (`/voided`) | `{documento:"factura", serie, numero, motivo}` | `{documento:"comunicacion_baja", motivo, documento_afectado:{documento, serie, numero}}` |

El error que devolvían era distinto en cada uno y ninguno decía "falta un
envoltorio": `Undefined array key "documentos_afectados"` el primero, `El campo
documento seleccionado no es válido` el segundo. La clave conceptual que la doc
no explicita: el `documento` de la raíz es el tipo del documento que se está
**emitiendo** —una comunicación de baja y un resumen diario son documentos
tributarios propios— y el comprobante que se da de baja va **anidado**. Uno usa
lista (`documentos_afectados`) y el otro objeto (`documento_afectado`, singular).

**El hallazgo que confirma la decisión 2 de este ADR:** los dos caminos
devuelven **`PENDIENTE`**, no `ACEPTADO`. El de boletas hasta lo dice con todas
sus letras — *"El resumen diario fue firmado correctamente, pero aún no ha sido
validado por la SUNAT"*. O sea que "Anulación en trámite" no es un caso raro del
resumen diario: es el camino normal de **toda** anulación, factura incluida. Si
la RPC hubiera escrito `'anulado'` con la primera respuesta 200, el sistema
estaría dando por dado de baja algo que SUNAT todavía no miró.

## Lo que sigue sin confirmar

- **El plazo.** Una página de la doc dice 3 días, otra 5, y SUNAT habla de 7. El
  sistema sigue sin bloquear por fecha: intenta y muestra el rechazo textual.
- **La forma de la respuesta de `/voided`.** Devuelve 200 con todo en null: sin
  `hash`, sin `mensaje`, sin ticket visible. `traducirEstado` lo lee como
  `PENDIENTE`, que es la lectura conservadora — pero no sabemos si adentro
  viene un identificador para consultar la baja después.
- ~~**Cómo se confirma una baja en trámite.**~~ **RESUELTO el mismo día**, ver
  abajo — dejó de ser hipotético en cuanto B004-000003 se quedó atascada.

## Consecuencias

Un error de emisión se arregla desde el sistema, con motivo y responsable
registrados, en vez de con un trámite manual que nadie anota. Eso es lo que hace
razonable el paso siguiente (`LUCODE_ENTORNO=produccion` en Vercel): las sedes
reciben el botón de facturar cuando ya existe el de deshacer.

Queda abierto: cerrar el ciclo de confirmación de una anulación en trámite
(consultar el estado y pasar a `anulado` sin intervención), y decidir qué hacer
con los correlativos reservados que nunca se transmitieron.

## Cerrar el ciclo: "Consultar" (2026-09-09, mismo día)

B004-000003 se anuló en producción a las 11:58:49 y se quedó en "Anulación en
trámite". Nada podía sacarla de ahí: el botón "Anular" se esconde justo cuando
hay una baja pedida —para que nadie pida dos veces la misma baja— y no existía
lo otro. Un documento real atascado por diseño.

Se agregó `POST /api/lucode/consultar-anulacion` y un botón **"Consultar"** que
aparece exactamente en las filas en trámite. Solo lee; si SUNAT confirmó, recién
ahí llama a `anular_comprobante` con `p_confirmada = true` y con el **motivo
original**, no uno nuevo: esta ruta confirma una decisión ya tomada, no toma otra.

**El bug que la consulta a producción evitó.** Lucode tiene un vocabulario de
anulación aparte del de emisión. Consultado en vivo, `/api/v3/status` devolvió:

```json
{ "payload": { "estado": "ANULANDO" },
  "message": "El documento está siendo anulado, por favor espere unos minutos…" }
```

`traducirEstado` —el lector de la emisión— manda a `PENDIENTE` todo lo que no
sea `ACEPTADO`/`RECHAZADO`. Reusarlo habría leído un `ANULADO` real como "sigue
en trámite" **para siempre**: el botón nuevo no habría cerrado nunca nada, y el
síntoma sería "consulto y no pasa nada", de los más caros de diagnosticar. Por
eso `interpretarEstadoAnulacion` es una función propia, pura y con tests
(`lib/lucode.test.ts`).

Solo `ANULADO` cuenta como confirmada, y todo lo desconocido se lee como "todavía
no". La asimetría es deliberada: equivocarse hacia "todavía no" cuesta un clic;
equivocarse hacia "ya está" deja un documento vivo ante SUNAT marcado como dado
de baja. `ANULANDO` está verificado contra producción; `ANULADO` es la
contraparte esperada y todavía no se vio con los ojos.
