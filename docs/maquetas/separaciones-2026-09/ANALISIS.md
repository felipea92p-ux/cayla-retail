# Separaciones — análisis antes de construir (2026-09-22)

> Pedido de Felipe: un apartado para **separar prendas** con adelanto, entregar después cobrando el saldo, vencimiento con
> aviso y liberación automática, y el dinero del adelanto fuera de los ingresos hasta que se liquide.
> Esto es la **Fase 2 de ADR-0141** (Apartar stock), que ya dejó el candado de stock construido.
> Demo funcional: `demo.html` en esta carpeta (se abre en el navegador, sin base de datos).
> **Nada de esto está construido en el ERP todavía.** Primero se validan las funciones; después, lo visual.

## 1. El nombre y el lugar

- **«Separaciones»**, dentro de **Ventas**, entre *Punto de Venta* y *Caja*. Los dos actos se llaman **Separar** y **Entregar**.
- **No «Preventa»:** en Perú preventa es vender algo que *aún no llega* (una colección nueva, sin stock). Aquí la prenda existe
  y se guarda. Mezclarlos confunde a la colaboradora y a la clienta. Si algún día CAYLA hace preventa de colección, reutiliza
  el mismo motor de adelanto, pero sin apartar stock.
- «Preorden» es anglicismo y en retail peruano nadie lo dice en caja; «separar una prenda» sí.

## 2. Qué ya existe en el repo (y se reutiliza)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Candado de stock | `stock.cantidad_apartada`, `apartar_stock`, `liberar_apartado` (`20260920160000_apartar_stock.sql`) | La prenda separada sigue en el conteo físico pero **no se puede vender** en ninguna caja. Probado con 120 conexiones. **No está en producción.** |
| Columnas para esta fase | `apartados.adelanto_monto`, `adelanto_medio`, `adelanto_caja_movimiento_id`, `venta_id` | Nacieron vacías esperando este diseño. |
| Quién atendió | `ventas.asesora_id` + `fn_asesoras_de_turno(ubicacion)` (`20260922150000_…`) | La lista de quienes marcaron asistencia hoy en esa tienda (Dynamic). Resuelve el «solo los de esa sede» sin inventar nada. |
| Clienta | `retail.clientas` (dni, nombre, telefono_whatsapp, whatsapp_consentimiento_en) + `buscar_clienta` / `registrar_clienta` | Los datos de la separación son una ficha de clienta; en la entrega ya no se piden. |
| Cobro | `PuntoDeVentaTicket.tsx`, `lib/vender-reglas.ts` (`vueltoDe`, `pagosParaRpc`, F1–F5) | El panel de medios y el vuelto se reutilizan tal cual. |
| Terminal de ventas | ADR-0160 | La cuenta de ventas de cada tienda ve solo su tienda: la separación nace con la `ubicacion_id` de la caja abierta. |

Lo que **no** existe: tareas programadas (`pg_cron`), notificaciones, y nada de anticipos en comprobantes (el PSE es **Lucode / apisunat.pe**, ADR-0005).

## 3. Cómo lo hacen otros (lo que tomamos y lo que mejoramos)

| Referente | Cómo funciona | Tomamos | Mejoramos |
|---|---|---|---|
| **Lightspeed X-Series** | La separación es una venta abierta; clienta obligatoria; el stock se descuenta al crearla; se busca por N.º de ticket; el saldo es un balance aparte. | Clienta obligatoria, búsqueda por comprobante, saldo aparte. | No vence sola: aquí sí, con aviso. |
| **Lightspeed R-Series / OnSite** | Cancelar **no** devuelve el depósito: es otro paso, que se olvida. | Liberar y devolver son dos pasos… | …pero la bandeja **no deja cerrada** una separación con devolución pendiente. |
| **Shopify POS + apps** (Layaway, Reservo) | Shopify no trae layaway; las apps agregan plazo, aviso por correo y vuelta automática del stock. | Plazo fijo, aviso previo, vuelta automática. | 2 días de gracia para que una persona decida antes de que el sistema libere. |
| **Contabilidad** (Square/QuickBooks, PCGE) | Un depósito de layaway **no es ingreso**: es un pasivo («anticipos de clientes», cuenta 122 del PCGE) hasta la entrega. | La intuición de Felipe es la correcta. | Tarjeta «En custodia» en Caja. |
| **SUNAT** | En bienes muebles el comprobante se emite al entregar **o al cobrar, lo primero**; el IGV nace con el anticipo por el monto recibido (Informe 201-2008-SUNAT/2B0000). Factura de anticipo: sí. Al entregar, el comprobante final deduce el anticipo; si se devuelve, nota de crédito. | Boleta/factura de anticipo (ver decisión D1). | — |
| **Indecopi** | Retener parte del adelanto solo con cláusula expresa informada **antes** de pagar; una penalidad desproporcionada es abusiva. | Devolución del 100%, impresa en la boleta. | — |

## 4. El flujo (lo que hace la demo)

**Separar** — escanear o escribir el código → solo aparece esa prenda (si el texto coincide con varias, se elige talla/color) →
clienta → quién atendió → adelanto (monto libre, atajos 30/50/100%, varios medios, vuelto si es efectivo) → cómo se le devuelve si no recoge → la clienta acepta las
condiciones → **Confirmar separación**. Sale el comprobante con: sello `SEPARACIÓN SEP-TRU-0007`, prendas, total, anticipo con IGV,
saldo, **fecha límite** y condiciones cortas. Después, tres pasos físicos: etiqueta «SEPARADO», guardarla en la zona «Separados»
del almacén (no en el piso), enviar el comprobante por WhatsApp.

**Bandeja «Separaciones»** — estados calculados contra la fecha, nunca guardados a mano:

| Estado | Cuándo | Qué se puede hacer |
|---|---|---|
| Vigente | faltan más de 2 días | Entregar, avisar por WhatsApp |
| Vence en N días | faltan 2 días o menos → **alerta** arriba | Entregar, avisar |
| Vencida · quedan N días para decidir | venció; 2 días de gracia | Entregar, **+7 días** (una vez), Liberar |
| Devolver S/X | se liberó (a mano o **sola** al pasar los 2 días) | Registrar devolución (medio, N.º de operación, CCI si es transferencia) |
| Entregada / Liberada · devuelta | cerradas | — |

**Entregar** — buscar por nombre, DNI, celular, `SEP-…` o `B004-…` → se ve lo pagado y el saldo → se cobra con la misma lógica del
Punto de Venta (vuelto solo en efectivo; con Yape/tarjeta se cobra justo) → comprobante final: total, **(−) anticipo B004-… del
dd/mm**, saldo pagado hoy, «SEPARACIÓN LIQUIDADA · PAGADO S/X». Los datos de la clienta no se vuelven a pedir.

**Caja** — tres cifras: *Ventas por separaciones entregadas* (ya son de CAYLA), **En custodia** (adelantos de separaciones abiertas,
no son ingreso) y *Por devolver*. El efectivo de un adelanto sí entra al cajón (el arqueo lo cuenta), pero no suma a «Ventas del
día». El día que se entrega, el total pasa a venta.

**Stock** — la separada sigue en *En tienda (físico)* pero no en *Disponible*. Punto de Venta dice **«Separada para una clienta»**,
no «Agotada» (pendiente ya anotado en el BACKLOG de ADR-0141).

## 5. Datos que se piden a la clienta

| Dato | ¿Obligatorio? | Por qué |
|---|---|---|
| Nombres y apellidos | Sí | Identifica a quién se le entrega. |
| Celular (WhatsApp) | Sí | Aviso de vencimiento y devolución. Con consentimiento registrado (`whatsapp_consentimiento_en`, Ley 29733). |
| DNI | Recomendado; **obligatorio si el total pasa S/700** (boleta con identificación) | Verifica la identidad al recoger si perdió el comprobante. |
| RUC + razón social | Solo si pide factura | Factura de anticipo. |
| Medio de devolución | Sí (Yape/Plin por defecto al mismo celular) | D4: devolver sin que la clienta vuelva. |
| CCI | Solo si elige transferencia como medio de devolución | Dato bancario: lo ven solo quienes operan esa tienda y la líder; nunca se imprime completo. |

## 6. Modelo de datos

> **Implementado el 2026-09-23 (ADR-0166, `supabase/migrations/20260923090000_separaciones.sql`).** Lo que cambió respecto de esta propuesta
> está en el ADR (p. ej. la venta de la entrega no pasa por `registrar_venta`, y la devolución no espera a la nota de crédito). Lo de abajo es
> la propuesta original.

- **`separaciones`** (el documento): `id`, `codigo` (`SEP-TRU-0007`, correlativo por tienda), `ubicacion_id`, `clienta_id → clientas`,
  `asesora_id → personas`, `total`, `adelanto`, `vence_el`, `extensiones`, `estado` (`abierta` | `entregada` | `liberada` | `devuelta`),
  `comprobante_anticipo_id`, `venta_id`, `nota_credito_id`, `liberada_por` (persona o `null` = sistema), fechas.
- **Cada prenda es un `apartado`** (la tabla de ADR-0141) con `separacion_id`: el candado de stock no se toca.
- **`separacion_pagos`** (medio, monto, recibido) — igual que `venta_pagos`.
- **Dinero:** los adelantos **no** van a `venta_pagos` ni a «ventas del día»; `cerrar_caja` los suma al efectivo esperado del cajón
  (si no, el arqueo sale con sobrante) y el reporte de ingresos los excluye hasta la entrega.
- **Tres RPC, cada una una transacción:** `separar(...)` (aparta cada línea + pagos + comprobante de anticipo),
  `entregar_separacion(...)` (consume los apartados **dentro** de la venta — cierra la ventana de segundos que ADR-0141 dejó abierta),
  `liberar_separacion(...)` / `registrar_devolucion_separacion(...)`.
- **Vencimiento sin `pg_cron`:** `fn_vencer_separaciones(ubicacion)` se ejecuta al abrir Separaciones, Punto de Venta o la caja; libera
  las vencidas hace más de 2 días. Es idempotente; si nadie abre el sistema, no pasa nada malo (la prenda sigue guardada).

## 7. Decisiones (Felipe, 2026-09-22)

- **D1 · Comprobante del adelanto → A: boleta/factura de anticipo** al cobrar; la boleta final deduce el anticipo; si se devuelve,
  nota de crédito. **Revierte** la línea «sin comprobante» de la Fase 2 de ADR-0141 (el ADR nuevo lo dirá). Falta confirmar que Lucode
  emite anticipo + regularización, y el visto bueno del contador.
- **D2 · Adelanto → monto libre** (mayor a cero). La demo sugiere 30/50/100% como atajos, sin exigirlos.
- **D3 · Plazo → 7 días calendario, aviso a 2 días, 2 días de gracia, una sola extensión de +7** (máximo 16 días).
- **D4 · Devolución → 100%, preferentemente por Yape, Plin o transferencia**, para que la clienta no tenga que volver. Por eso, **al separar**
  se registra cómo se le devuelve (Yape/Plin al celular por defecto, o CCI si elige transferencia; esto corrige §5, donde el CCI se
  pedía solo al devolver). Si la clienta viene a la tienda antes de que se le transfiera, se le puede devolver por cualquier medio,
  efectivo incluido (egreso de caja).
- **D5 · Quién libera y devuelve** — sigue abierta. Propuesta: cualquier colaboradora entrega; liberar y registrar la devolución, la líder
  o la terminal de ventas (misma capacidad que gestionar caja).

## 8. Ruta

1. **Validar funciones** con la demo (ahora). D1–D4 cerradas; falta D5.
2. **Pegar ADR-0141 en producción** (requisito: hoy el front ya lo llama y falla) y confirmar anticipos con Lucode + contador.
3. **Construir** en pasos verificables: migración + pruebas SQL → pantalla Separar → Entregar → Bandeja y alertas → Caja. ADR propio.
4. **Después:** diseño visual fino.

## Fuentes

- SUNAT, Informe N.° 201-2008-SUNAT/2B0000: https://www.sunat.gob.pe/legislacion/oficios/2008/oficios/i2012008.htm
- SUNAT Orientación, nacimiento de la obligación del IGV: https://www.gob.pe/8314-nacimiento-de-la-obligacion-tributaria-igv
- Casación 836-2025-Lima (IGV nace con el pago anticipado): https://bybconsultores.pe/impuesto-general-a-las-ventas/anticipo-igv/igv-pagos-anticipados-contrato-no-perfeccionado/
- Lightspeed X-Series, layaway: https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533693114011-Creating-and-managing-layaway-sales
- Lightspeed OnSite, layaways: https://onsite-support.lightspeedhq.com/hc/en-us/articles/231804667-Doing-layaways
- Lightspeed R-Series, depósitos: https://retail-support.lightspeedhq.com/hc/en-us/articles/229129228-Managing-credit-accounts
- Shopify, programa de layaway: https://www.shopify.com/blog/how-to-start-a-layaway-program · Reservo: https://apps.shopify.com/pos-layaway-stock-reservations
- AccountingTools, customer deposit: https://www.accountingtools.com/articles/what-is-a-customer-deposit.html
- Gestión, retención de pagos de separación (Indecopi): https://gestion.pe/economia/inmobiliarias-y-consumidores-condiciones-para-retener-o-devolver-pagos-por-separacion-vivienda-inmueble-garantia-noticia/
