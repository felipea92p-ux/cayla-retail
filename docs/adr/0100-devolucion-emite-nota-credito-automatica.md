# ADR-0100 — Aprobar una devolución emite la Nota de Crédito sola

**Fecha:** 2026-09-18
**Decidido con:** Felipe, vía AskUserQuestion (toca SUNAT/dinero real — regla del CLAUDE.md del repo)

## Contexto

La auditoría de Facturación del 2026-09-17 (hueco 5 del doc de módulo) encontró que
`devoluciones.ts` solo usa `parsearComprobante` para BUSCAR la venta original —
`emitir_nota` existe desde la Fase 0 (`0010_facturacion.sql`) y nunca tuvo un
llamador real en todo el repo. Con Devoluciones ya en producción, una devolución
sobre una venta con boleta o factura **ya aceptada por SUNAT** deja el IGV
declarado de más ante SUNAT para siempre — no es un bug de pantalla, es una
obligación tributaria mal cerrada que crece cada día que se posterga.

## Decisión

`aprobar_devolucion` (el momento en que la devolución se vuelve real — no
`crear_devolucion`, que todavía puede rechazarse) revisa si la venta devuelta
tiene un comprobante `aceptado`. Si lo tiene, reserva una Nota de Crédito
(`emitir_nota`) por el valor exacto de lo devuelto — no de toda la venta, en
devoluciones parciales — y guarda su id en `devoluciones.nota_credito_id`.

**Automático, no un botón aparte** (principio 12: el error es del diseño, no de
la persona que se olvida de apretarlo). La Nota de Crédito se RESERVA en
Postgres puro (principio 9, mismo patrón que `emitir_comprobante`); transmitirla
a SUNAT sigue pasando por el mismo botón "Transmitir" de `ComprobantesPanel.tsx`
— aparece sola en la lista de comprobantes de `/vender/facturacion`, con sus
PDF/XML/CDR (la pieza construida horas antes en esta misma sesión) en cuanto
SUNAT la acepta. Cero pantalla nueva.

**Motivo del Catálogo 09 SUNAT:** "06" (devolución total) si esta devolución
cubre exactamente el 100% de cada línea de la venta original, "07" (por ítem)
si es parcial — simplificación documentada: no mira devoluciones previas sobre
la misma venta, solo si ESTA devolución agota lo vendido.

**Cálculo de subtotal/IGV:** mismo orden exacto que `ComprobantesPanel.tsx`
(`onEmitir`) — IGV primero (`total − total/1.18`), subtotal = `total − igv`. Un
orden distinto redondea distinto el último céntimo; usar el mismo evita que dos
documentos del mismo sistema calculen IGV de dos formas.

## Prerrequisito real, no solo de código

**Producción no tiene ninguna serie de `nota_credito` registrada para ninguna
ubicación hoy** (verificado con `execute_sql` contra `series_comprobantes` antes
de escribir esta migración — solo existen boleta/factura). Sin registrar una,
`emitir_nota` fallaría con un mensaje genérico de `fn_reservar_numero_serie` y
se llevaría entre las patas la aprobación ENTERA de la devolución (todo-o-nada).
Se agregó un chequeo explícito antes de intentar `emitir_nota` que corta con un
mensaje claro y accionable ("hace falta registrar la serie de Nota de Crédito de
esta ubicación en Facturación") en vez de dejar pasar el error genérico.
**Felipe necesita registrar la serie de Nota de Crédito de cada ubicación (botón
"Registrar serie", ya existente en `/vender/facturacion`) antes de que esta
función haga algo la primera vez que alguien apruebe una devolución sobre una
venta facturada.**

## Alternativas descartadas

- **Botón manual "Emitir Nota de Crédito" aparte, en la pantalla de
  Devoluciones:** más control, pero es exactamente el patrón que ya falló —
  nueve días con la RPC construida y cero llamadores porque nadie construyó el
  botón, y un botón manual siempre corre el riesgo de que alguien lo olvide.
- **Dejar que `emitir_nota` falle en silencio (catch y seguir) si no hay
  serie:** la devolución aprobaría igual pero la Nota de Crédito quedaría
  pendiente para siempre sin que nadie se entere — es literalmente el bug que
  esta ADR corrige, solo que más difícil de detectar (no hay excepción que avise).

## Se rompe si

Una devolución cubre parcialmente varias ventas distintas en una sola operación
— hoy `crear_devolucion` ata la devolución a UNA `venta_id`, así que este
escenario no puede ocurrir con el esquema actual; si algún día se permite
devolver ítems de varias ventas en un solo trámite, esta lógica necesita
revisarse para emitir una Nota de Crédito por cada comprobante afectado, no una
sola.
