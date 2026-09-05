# ADR-0009 — `comprobantes.items` + conector Lucode (Fase 1 completa)

**Fecha:** 2026-09-05
**Estado:** Migración escrita y verificada en local (`0037_comprobantes_items.sql`,
`0038_actualizar_transmision_comprobante.sql`), pendiente de pegar en producción
(`supabase/unificacion/20_comprobantes_items.sql` y
`21_actualizar_transmision_comprobante.sql`). Parte de la Fase 1 del plan de
reemplazo de Alegra (`~/.claude/plans/cozy-gathering-nova.md`).

Nota de numeración: estas migraciones nacieron como `0035`/`0036` y
`unificacion/18`/`19`, pero para cuando se commitearon otra sesión en paralelo
ya había tomado esos números para una feature distinta (proveedor habitual del
producto + categorías completas, ver `docs/BITACORA.md`). Se renumeraron a
`0037`/`0038` y `20`/`21` antes de commitear — sin tocar contenido, solo el
nombre del archivo.

## Contexto

Al diseñar el conector real con Lucode (`apps/web/lib/lucode.ts`) se leyó su
documentación pública (`docs.apisunat.pe/llms-full.txt`): el endpoint
`POST /api/v3/documents` exige un array `items` por comprobante (descripción,
cantidad, valor unitario, código de afectación IGV) — sin eso no hay nada
válido que transmitir a SUNAT.

`comprobantes` (Fase 0, ADR-0007) nunca guardó ese detalle: solo tiene
`subtotal`/`igv`/`total` agregados. Y el único flujo que existe hoy para
emitir (`ComprobantesPanel.tsx`, en `/vender/facturacion`) es manual — el
usuario tipea un TOTAL, sin desglose por producto, con un comentario propio en
el código reconociendo la brecha ("la desagregación exacta por línea queda
para cuando esto se conecte a `ventas`"). `ventas` tampoco ayuda hoy: es solo
una cabecera (sede, caja, método de pago, monto total) — el detalle real de
qué se vendió vive en `movimientos` (una fila por variante, vía `venta_id`),
pero conectar Facturación a eso es un rediseño de flujo, no una migración.

## Decisión

Agregar `comprobantes.items jsonb`, con esta regla en `emitir_comprobante` y
`emitir_nota`:

1. **Si el llamador manda `p_items`, se usa tal cual.** Es el camino correcto
   para cuando Facturación se conecte a `ventas`/`movimientos` — fuera de
   alcance de esta fase, no bloqueado por ella.
2. **Si no se manda nada** (el único caso real hoy, desde
   `ComprobantesPanel.tsx`), se construye **un solo ítem genérico** con el
   `subtotal` real: `{"descripcion": "Venta de mercadería", "cantidad": 1,
   "precio_unitario": <subtotal>}`. El monto sigue siendo verdad contable
   exacta — lo único que falta es el desglose por SKU, no el dinero.
3. **`emitir_nota` sin items explícitos hereda los del comprobante original**
   antes de caer al genérico — una nota corrige una operación ya hecha; tiene
   más sentido partir de lo que ya se facturó que inventar una línea nueva.

El formato interno (`descripcion`/`cantidad`/`precio_unitario`) es
deliberadamente **más simple** que el que pide Lucode
(`unidad_de_medida`/`porcentaje_igv`/`codigo_tipo_afectacion_igv`, etc.). La
traducción entre uno y otro vive en `apps/web/lib/lucode.ts`, no en la base —
mismo criterio que `apps/web/lib/padron.ts` ya aplica para RENIEC/SUNAT
(ADR-0008): el esquema no se amarra a la forma exacta de un proveedor externo,
así que cambiar de proveedor de transmisión el día de mañana no toca una
migración.

**No se tocó `ComprobantesPanel.tsx`.** Rediseñar cómo una Encargada captura
el desglose de una venta en esa pantalla es una decisión de UX real —
queda para cuando Felipe decida si esa pantalla se conecta a `ventas` o si el
ítem genérico es aceptable indefinidamente para ventas de mostrador simples.

## Un bug real encontrado probando esta migración, no leyendo el código

`create or replace function emitir_comprobante(...)` con un parámetro nuevo
al final (`p_items`) **no reemplazó** la versión de 8 parámetros de la
Fase 0 — Postgres identifica una función por nombre + tipos de los parámetros
de ENTRADA, así que una firma con un argumento más es una función *distinta*.
El primer intento de esta migración dejó **las dos versiones conviviendo**, y
cualquier llamada con la lista de parámetros vieja se volvió ambigua
("function emitir_comprobante(...) is not unique"). Se corrigió agregando un
`drop function if exists` explícito de la firma vieja, antes del `create or
replace`, para ambas funciones (`emitir_comprobante`, `emitir_nota`). Se cazó
corriendo la migración contra Postgres local con datos reales — un `EXPLAIN`
o una lectura de código no lo habría mostrado, porque el `CREATE OR REPLACE`
no avisa que está creando una sobrecarga nueva en vez de reemplazar.

## El conector real (la otra mitad de la Fase 1)

Con `items` resuelto, se construyó lo que realmente transmite a SUNAT:

- **`apps/web/lib/lucode.ts`** — adaptador puro hacia la API de Lucode
  (`sandbox.apisunat.pe` / `app.apisunat.pe`, según `LUCODE_ENTORNO`), mismo
  criterio que `apps/web/lib/padron.ts` (ADR-0008): traduce el formato interno
  a lo que pide Lucode, nunca al revés, y devuelve siempre
  `{ok:true,...} | {ok:false, motivo, detalle}` — nunca lanza una excepción que
  tumbe la pantalla si Lucode no responde (principio 9).
- **`POST /api/lucode/emitir`** — separado de la RPC a propósito:
  `emitir_comprobante` es Postgres puro y puede correr sin que Lucode esté
  arriba (reserva el correlativo igual). Esta ruta es la única pieza que
  depende de la red externa; si el día de mañana se cambia de PSE otra vez
  (como ya pasó de Nubefact a Lucode, ADR-0005), se reemplaza este archivo, no
  el esquema. Valida estado (`pendiente`/`rechazado` únicamente — nunca
  reintenta algo ya `aceptado`), y si Lucode transmite pero el guardado del
  resultado en la base falla, devuelve el detalle completo para reintentar
  **solo el guardado** — nunca reenvía el mismo documento a SUNAT, porque eso
  sí sería un correlativo duplicado real.
- **`actualizar_transmision_comprobante`** (`0038_actualizar_transmision_comprobante.sql`)
  — la única RPC que puede mover `comprobantes.estado` a
  `enviado`/`aceptado`/`rechazado` tras una respuesta real de SUNAT; guarda
  `respuesta_sunat` completa (auditoría) y `motivo_rechazo` solo cuando
  corresponde.
- **Botón "Transmitir"** en `ComprobantesPanel.tsx` — visible solo en filas
  `pendiente`/`rechazado`, deliberadamente sin rediseñar el resto de la
  pantalla (ver más abajo).

Sin `LUCODE_TOKEN` configurado, el botón responde `sin_credenciales` y el
comprobante se queda en `pendiente` — no hay riesgo de transmitir a medias.

## Alternativas descartadas

- **Exigir `p_items` obligatorio (sin default).** Habría roto de inmediato el
  único flujo de emisión que existe hoy (`ComprobantesPanel.tsx`) sin avisar
  con tiempo — el "Emitir" dejaría de funcionar hasta rediseñar esa pantalla.
  El fallback genérico deja el sistema usable mientras se decide el rediseño.
- **Guardar los items ya en el formato exacto de Lucode.** Amarra el esquema
  a un proveedor específico — si Felipe cambia de PSE otra vez (como ya pasó
  de Nubefact a Lucode), tocaría una migración en vez de solo el adaptador.

## Consecuencias

`emitir_comprobante`/`emitir_nota` ya producen un `comprobante` con items
válidos siempre, sin excepción — condición necesaria para que
`apps/web/lib/lucode.ts` pueda construir un payload real. Queda pendiente,
fuera de esta fase: decidir si `ComprobantesPanel.tsx` debe capturar el
desglose real (conectándose a `ventas`) o si el ítem genérico es el diseño
final para ventas de mostrador.
