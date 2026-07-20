# Análisis SINATRA (LIM · TRU · AQP) — 2026-07-19

> Pedido por Felipe: "cubrir todo esto y más… lista de lo bueno, lo malo, lo mejorable
> y cómo construimos un sistema de alto nivel. No lo repliques: ve a un estándar tipo
> QuickBooks o superior." Análisis hecho sobre los 3 archivos reales (.xlsm
> descargados y disecados: hojas, fórmulas, macros VBA, rangos de fechas).

## Qué es SINATRA

El sistema financiero real de CAYLA: un Excel con macros por sede (~14-26 hojas cada
uno). Diario de ventas por día, compras, costos (fijo/variable + IGV), gastos, cajas
mensuales por denominación (AQP), caja chica, cuadre de efectivo, EERR, patrimonio,
comparativo 2025 vs 2026, directorio de proveedores. Registra un negocio real y
grande: **S/438,674 vendidos en TRU, S/177,522 en AQP y S/30,454 en LIM en 2026**
(a la fecha del análisis).

## ✅ LO BUENO (lo que SINATRA demuestra y hay que conservar)

1. **Disciplina de registro diaria** — el Diario tiene fila por día desde el 1 de
   enero, sin huecos. El hábito operativo existe; ningún sistema funciona sin eso.
2. **Las preguntas correctas** — EERR, liquidez, patrimonio, comparativo año contra
   año, costos fijo/variable: SINATRA pregunta lo mismo que un CFO. El modelo mental
   financiero de Felipe es correcto; la herramienta es la que no da más.
3. **Directorio de proveedores serio** — ~290 proveedores con categoría, marca,
   score, RUC, contacto, banco. Un activo valioso del negocio.
4. **Trazabilidad de años** — gastos desde 2020, costos clasificados. La intención de
   historia larga está.

## ❌ LO MALO (con evidencia medida, no opinión)

1. **2,368 celdas con error** entre los 3 archivos (TRU 1,303 · AQP 997 · LIM 68).
   Solo "Ingreso Mercadería" de TRU tiene 1,172 (#DIV/0!, #REF!…). Los reportes
   mayores (EERR, Patrimonio, Resumen) están contaminados: números que no se pueden
   defender ante un banco o un socio.
2. **El cuadre de efectivo está roto y nadie sabe desde cuándo** — TRU **−S/6,122.91**,
   LIM **−S/7,675.50**. En Excel no hay forma de saber QUÉ día se rompió: la fórmula
   suma todo y da un número final.
3. **Tres copias del mismo universo que se desincronizan** — Proveedores tiene 295
   filas en TRU y 287 en AQP/LIM: ya divergieron. Cada corrección hay que hacerla 3
   veces (y no se hace).
4. **Hojas-copia como sistema de versiones** — "Copia de CAJA FEBRERO", "Copia de
   Ingreso Mercadería", CAJA CHICA 1 y 2 con saldos que quedan en negativo (−173.87).
   El Excel acumula capas muertas que nadie se atreve a borrar.
5. **Un archivo POR AÑO por sede** — "SINATRA 2026": en enero 2027 hay que clonar
   todo y el historial queda partido en archivos.
6. **Sin permisos ni auditoría** — quien abre el archivo ve TODO (patrimonio,
   inversiones, sueldos de caja chica) y puede tocar cualquier celda sin rastro de
   quién cambió qué.
7. **Las macros no hacen nada de negocio** — solo son botones de navegación entre
   hojas (verificado con extracción del VBA). Toda la lógica vive en fórmulas
   frágiles que un arrastre mal hecho rompe en silencio.

## 🔧 LO MEJORABLE (el puente entre lo que hay y lo que viene)

- El **Diario de ventas ya está reemplazado** por el módulo Vender (Felipe lo
  confirmó). Cada venta del sistema ya es una fila con método de pago y caja.
- Las **Compras reales ya son derivables** del sistema: cada lote recibido con costo
  por prenda ES la compra — no hace falta re-digitar montos.
- El **comparativo año vs año** no necesita migrar 2025: una tabla mínima de totales
  mensuales históricos (12 números por sede por año, tomados de SINATRA una sola
  vez) alimenta el reporte desde el día uno. Corte limpio, YoY completo.

## 🏛 EL SISTEMA DE ALTO NIVEL (decisiones confirmadas por Felipe)

Corte limpio · monto total en caja · tipos de costo/gasto se revisan juntos después ·
compras+proveedores ahora, ligado a recibir mercadería · reportes irrenunciables:
EERR por mes calendario, comparativo YoY, cuadre de efectivo continuo, patrimonio.

### Fase F1 — Núcleo financiero (construir ya)
1. **Proveedores** — tabla única central (fin de las 3 copias), ligada a recibir
   mercadería. Editable por Líder, visible al recibir.
2. **Cuadre de efectivo continuo** — el sistema conoce el efectivo teórico de cada
   sede día a día: ventas en efectivo − gastos en efectivo − depósitos al banco,
   anclado a un saldo inicial del día del corte. Cada cierre de caja compara contra
   lo contado: la diferencia deja de ser un misterio acumulado y se vuelve un dato
   diario con responsable y fecha.
3. **EERR por mes calendario** — enero, febrero, marzo… cerrados, con selector de
   mes. La ventana "últimos 30 días" queda como vista adicional, no la única.
4. **Comparativo año vs año** — por sede y total, alimentado por el sistema desde el
   corte + los totales históricos sembrados a mano (una sola vez).
5. **Patrimonio v1** — efectivo teórico + inventario a costo (ya lo calcula el
   sistema) + partidas manuales (banco, deudas, activos) que el Líder mantiene.

### Fase F2 — Profundidad
Órdenes de compra formales (pendiente→recibida ligada a lotes) · revisión conjunta
de tipos de costo/gasto (la sesión que Felipe pidió "luego") · exportar Excel/CSV ·
gastos con IGV visible como en SINATRA.

### Fase F3 — Formalización
Comprobante electrónico (Nubefact/SUNAT) con la Epson TM-T20III · caja chica formal
si la operación lo pide.

## Regla maestra de esta migración

SINATRA no se replica: se **jubila con honores**. Cada módulo nuevo debe responder
las mismas preguntas que Felipe ya se hacía, con números que no se rompen, permisos
por rol, y auditoría de quién hizo qué — o no es mejor que el Excel.
