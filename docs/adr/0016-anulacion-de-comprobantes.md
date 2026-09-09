# ADR-0016 — Anular un comprobante: dos caminos según el tipo, y solo el líder

**Fecha:** 2026-09-09
**Estado:** Aplicado y probado en local (2026-09-09). Siete reglas verificadas
contra Postgres real, suplantando a la líder sembrada: no se marca aceptado sin
ambiente; no se anula un pendiente; no se anula sin motivo; no se anula con una
nota viva colgada; una baja en trámite NO escribe 'anulado'; una confirmada sí,
con motivo y `anulado_por`. Código verificado (tsc, eslint, 51 tests).
**Aplicado en producción el 2026-09-09** (`unificacion/24`; restricción
`VALIDADO`). **Falta la llamada real a Lucode**, que sigue sin probarse contra
el sandbox — ver "Lo que falta confirmar".

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

## Lo que falta confirmar en sandbox real

Se construyó contra la documentación pública, no contra respuestas reales:

- El campo del motivo en `/voided` es **`motivo`** (documentado, con default
  "ANULACIÓN DE OPERACIÓN"), no `motivo_de_anulacion` como decía el adaptador
  — ese nombre no aparece en ninguna página de `docs.apisunat.pe`. Corregido acá,
  sin probar.
- La forma de la respuesta de `/api/v3/daily-summary`: se asume que `traducirEstado`
  la lee igual que la de `/documents`. No está confirmado.
- Si el resumen diario devuelve ACEPTADO al toque o siempre PENDIENTE.

Hasta que eso se pruebe en sandbox, el botón puede fallar con el error crudo del
proveedor — que es el comportamiento correcto, no un bug: nunca escribe un estado
que no le confirmaron.

## Consecuencias

Un error de emisión se arregla desde el sistema, con motivo y responsable
registrados, en vez de con un trámite manual que nadie anota. Eso es lo que hace
razonable el paso siguiente (`LUCODE_ENTORNO=produccion` en Vercel): las sedes
reciben el botón de facturar cuando ya existe el de deshacer.

Queda abierto: cerrar el ciclo de confirmación de una anulación en trámite
(consultar el estado y pasar a `anulado` sin intervención), y decidir qué hacer
con los correlativos reservados que nunca se transmitieron.
