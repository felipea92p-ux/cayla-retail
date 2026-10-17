# ADR-0417 · Finanzas, Fase 1: que el número diga la verdad

- **Fecha:** 2026-10-15 · **Estado:** **APROBADO por Felipe el 2026-10-15** (las tres decisiones de abajo). Todavía no hay código ni
  migración: este ADR fija las reglas y la Fase 1 se construye encima, actividad por actividad.
- **Nace de:** la investigación «Finanzas que se entienden» (15-oct). Revisó cómo llevan la contabilidad las marcas de moda con taller
  propio, 22 sistemas de referencia y la norma SUNAT 2026. Se cruzó con producción usando solo consultas de lectura. La página es privada
  y no está en el repo, porque lleva cifras de producción.
- **Complementa:** ADR-0198 (diario derivado que se congela al cerrar), ADR-0120 (`fn_asientos`), ADR-0332 (corte «desde cuándo
  cuenta Finanzas»), ADR-0334 y ADR-0337 (ventas sin prenda), y el diseño de cobros con tarjeta del 2026-10-05, que estaba sin aprobar.

## El problema (medido en producción, 1 al 15 de octubre de 2026)

Felipe quiere saber todos los días «¿estoy ganando plata?», en lenguaje de tienda. El motor de Finanzas puede responderlo, pero hoy lo
alimentan datos que hacen falso el número:

| Qué | Medido |
|---|---|
| Venta sin costo | 737 de 1,096 líneas: **S/ 35,311 de S/ 55,339 (64 %)**, todas de «prenda sin registrar». En Arequipa, el 95 % |
| Base del costo | Mezclada: con IGV en las compras con boleta, sin IGV en las compras con factura (ADR-0120, punto 5). En las 359 líneas con costo, el margen bruto es **36 % o 46 %**, según cuál base se suponga |
| Cobros con tarjeta y QR | S/ 23,430 se registran como si entraran completos y al instante al BCP. En realidad llegan a **Interbank**, sin la comisión, de 1 a 3 días después. El QR de Izipay se asienta como si fuera Yape |

Las ventas sin prenda tienen todas `categoria_id` (755 de 755) y ninguna tiene `variante_id`. Las 647 `cerrada_sin_prenda` ya no se van a
regularizar nunca, así que su costo estimado es definitivo.

## Decisiones

### 1 · La venta sin prenda lleva el costo promedio de su categoría, marcado como estimado

DECIDÍ:
- Toda línea de «prenda sin registrar» lleva un **costo estimado**: el costo promedio de su categoría a la fecha de la venta.
- La línea se marca como estimada en el diario y en toda pantalla que muestre margen.
- Cuando una `pendiente` se regulariza, el costo real reemplaza al estimado. Una `cerrada_sin_prenda` se queda con el estimado.
- El estimado **se sella una sola vez y no se recalcula al leer**. Un mes cerrado tiene que dar el mismo número siempre (ADR-0198).
- Si la categoría no tiene con qué promediar, se usa la relación costo/precio de todo el catálogo, y la línea dice que se usó ese respaldo.

DESCARTÉ:
- **Un porcentaje fijo del precio:** aplana el margen por categoría, porque una casaca y un top no dejan lo mismo.
- **Esperar a que cada línea se regularice:** las cerradas no se regularizan nunca y, mientras tanto, el margen sale inflado.
- **Sacarlas del margen:** esconde el 64 % de la venta, y la pregunta «¿estoy ganando?» queda sin respuesta.

SE ROMPE SI:
1. El estimado se calcula al leer en vez de sellarse. El promedio cambia con cada compra y el hash de un mes cerrado deja de coincidir.
2. La venta sin prenda pasa a ser lo normal. La solución entonces está en Vender (regularizar al momento), no en Finanzas.
3. Una categoría con pocas prendas da un promedio ruidoso. Por eso la pantalla dice que el costo es estimado, y nunca lo presenta como real.

### 2 · Todo costo se guarda sin IGV

DECIDÍ:
- `variantes.costo`, `venta_items.costo_unitario` y todo costo de compra o producción se guardan **sin IGV**, igual que las ventas.
- Cuando la compra es con boleta (no da crédito fiscal), ese IGV **se suma al costo**, porque no se recupera.
- Los costos existentes que estén con IGV se corrigen con su rastro (`costo_historial`). Nunca se pisan sin dejar historia.
- Antes de corregir se mide cuántos costos están en cada base. La corrección se ensaya en producción y solo se aplica con el OK de Felipe.

DESCARTÉ:
- **Todo con IGV:** cuando la compra es con factura, el margen sale un 18 % más bajo de lo real, y el contador tiene que convertir todo.
- **Mixto, con una marca por fila:** cada cálculo tiene que acordarse de convertir, y basta un olvido para que el número vuelva a mezclarse.

SE ROMPE SI:
1. Una pantalla nueva pide «costo con IGV» y lo guarda sin convertirlo. La conversión vive en una sola regla pura, con su prueba, y no en cada formulario.
2. Se corrige el costo de una variante sin corregir el `costo_unitario` sellado de sus ventas pasadas. Si eso pasa, el margen de los meses ya vendidos queda en la base vieja.

### 3 · Cobros con tarjeta y QR: Interbank y dos cuentas «por depositar»

DECIDÍ:
- Se crea la cuenta bancaria **Interbank** y dos cuentas puente: **«Por depositar Izipay»** y **«Por depositar Vendemás»**.
- Cada cobro con tarjeta o QR **anota su máquina**. En Trujillo y Arequipa se elige con un toque y Vendemás ya viene marcado; Lima no pregunta.
- La venta se registra completa. Cuando llega el depósito a Interbank, se cruza contra lo pendiente y la diferencia es la **comisión real** (gasto).
- La tarifa vigente de cada máquina sirve para **estimar y avisar**: comisión esperada y «el depósito no llegó al cuarto día». Nunca reemplaza a la real.
- Los cobros con tarjeta y QR desde el corte se rehacen hacia sus cuentas correctas, como decidió Felipe el 2026-10-05.

DESCARTÉ:
- **Una sola cuenta «por depositar»:** si falta plata, no se sabe si fue Izipay o Vendemás, ni cuál cobra más.
- **Directo a Interbank:** la comisión queda siempre estimada, y Conciliación nunca cuadra, porque el depósito llega días después y por menos.

SE ROMPE SI:
1. La cajera marca la máquina equivocada. El depósito de una queda corto y el de la otra largo. La conciliación lo muestra como «cruzado entre máquinas», no como faltante.
2. Izipay o Vendemás junta varios días en un solo depósito. El cruce tiene que aceptar una liquidación contra muchas ventas.

## Lo que queda abierto

- **Trujillo vende 33 % menos que en 2025.** La comparación es día por día, del 2 al 14 de octubre. La caída empezó **antes** del ERP:
  en junio de 2026 ya era −22 % y en julio, −36 %, según la serie diaria de `ventas_historicas`. Arequipa se mantiene igual. Es un dato
  de negocio, no del sistema: Felipe lo revisa con la tienda.
- **CAYLA pasó las 300 UIT en 2025.** La serie diaria suma S/ 1.73 millones sin IGV, unas 324 UIT con la UIT de 2025 (S/ 5,350). Si el
  contador lo confirma, en 2026 corresponden el Libro Diario y el Mayor completos, además del SIRE. Eso sube la prioridad de la vista
  del contador. Es la primera pregunta para la reunión con él.

## Cómo se verifica (cuando se construya)

- **Ventas sin prenda:** con el estimado sellado, el margen bruto de octubre deja de tener líneas en 0. La pantalla dice cuánto es estimado.
- **Costo único:** una prueba recorre todas las formas de guardar un costo y exige que salga sin IGV. El margen medido en producción
  sale una sola cifra, no 36 % o 46 %.
- **Cobros:** una venta con tarjeta en Trujillo queda en «Por depositar Vendemás». Al registrar el depósito neto, la diferencia aparece
  como comisión y la cuenta puente vuelve a 0.

## Actualización 2026-10-15 (construcción, misma sesión)

Felipe eligió el **camino A («La respuesta»)** para los seis submódulos de Finanzas entre las 18 maquetas de
`docs/maquetas/finanzas-v2-2026-10/`, y pidió construir sin esperar. Se construyó en nueve actividades con un commit cada una
(`/construir`); todo el SQL está en migraciones **sin pegar en producción**:

| # | Qué | Dónde | Estado |
|---|---|---|---|
| 1 | Decisión 1: la venta sin prenda nace con el costo promedio de su categoría, sellado y marcado `venta_items.costo_estimado`; lo existente se rellena al pegar; al regularizar manda el costo real | `20261015233000_costo_estimado_venta_sin_prenda.sql`, `scripts/pruebas/costo_estimado_venta_sin_prenda.mjs` (20 casos) | construido, probado en una pila local al día con `main` |
| 2 | El medidor de confianza: `fn_finanzas_confianza` (hechos) + `lib/finanzas-confianza.ts` (pesos que suman 100) + `<Confianza>` | `20261015235000_finanzas_confianza.sql`, `scripts/pruebas/finanzas_confianza.mjs` (20), `lib/finanzas-confianza.test.ts` (11) | ídem |
| 3 | Resumen A, «El Pulso»: ¿estoy ganando plata?, ¿por qué? (cascada que siempre cuadra), el ritmo, qué deja cada lugar sin repartir lo de la empresa | `lib/pulso-reglas.ts` (19), `components/finanzas/ResumenFinanzas.tsx`, `CascadaPulso.tsx` | ídem |
| 4 | Situaciones 15 y 16: `pago_planilla` (41 \| 104) y `pago_sunat` (4011 \| 104) como movimientos de dinero, por reemplazos anclados al texto original | `20261016002000_pago_planilla_y_sunat.sql`, `scripts/pruebas/pago_planilla_y_sunat.mjs` (14) | ídem |
| 5–9 | Cuentas y dinero, Impuestos, Gastos, Reportes y Cierre en camino A: la pregunta y la respuesta grande arriba de lo que ya existía | `lib/{dinero,impuestos,gastos,cierre}-pulso-reglas.ts` y sus `*Pulso.tsx` | ídem |

**Decisiones de detalle tomadas al construir** (Felipe puede objetarlas):
- El estimado se sella con el promedio SIMPLE del costo de las variantes de la categoría (sin pesar por stock) y no se recalcula al corregir
  lo anotado (`corregir_prenda_sin_registrar`).
- «Lo fijo del mes» del ritmo se estima con lo registrado a la fecha llevado al mes entero, más la planilla (asentada o proyectada por el Flujo).
- La cascada lleva un tramo «Otros ajustes» cuando lo nombrado no suma el resultado (un gasto devuelto, una nota de crédito): una cuenta que
  no cuadra es peor que una línea de más.
- El pago a SUNAT es el del IGV; el 1 % de renta a cuenta sigue siendo un gasto de «Tributos».
- Los pesos del medidor (costo 30 · fijos 20 · facturas 15 · saldos 10 · tarjeta 10 · planilla 10 · conciliación 5) viven en la web, no en la base.

**Lo que NO se construyó, a propósito** (ver el backlog del día): la corrección masiva de costos a «sin IGV» (decisión 2: hay que medir y
ensayar en producción), Interbank y las cuentas «por depositar» (decisión 3: toca la hoja de cobro de Vender), la planilla con sede,
`/formidable`, `/chaos` y `guias:recorrer` sobre las seis pantallas, y pegar las tres migraciones.

## Actualización 2026-10-16 (las tres migraciones en producción)

Pegadas por Claude con la orden de Felipe, a las 00:15 de Lima, en orden: `20261015233000` (en producción `20261016171442`), `20261015235000`
(`20261016171526`) y `20261016002000` (`20261016171602`). Protocolo: sonda de solo lectura (791 líneas del centinela con costo 0: 790 en
meses abiertos y una `anulada`; las cuatro anclas de los reemplazos exactamente una vez; las 48 columnas que usan las tres en su lugar), dos
ensayos en un solo lote que termina en excepción —el segundo con la llamada real a `fn_finanzas_confianza` y `fn_costo_estimado_resumen`
como un líder activo en Dynamic— y, después de pegar, las siete huellas `md5(prosrc)` iguales a la pila donde corrieron las 54 pruebas.
Resultado del relleno: 790 líneas con `costo_estimado`, ninguna en 0 (S/ 20,937 de costo estimado sobre S/ 36,367 vendidos en octubre al 16).
El medidor de confianza de octubre sale bajo en producción, y es correcto: cero fijos, cero saldos de arranque, la tarjeta directo al banco,
nueve lotes sin factura y el banco sin conciliar. Lo que lo sube es la Fase 0, que es de Felipe.

## Actualización 2026-10-16 (b): la 183000 corrige dónde ancla la 002000

Tras traer `main`, la suite `rendicion_fondo` (que repega 20261013181000 … 20261014222000 sobre la base ya migrada) salió 0/12: la
002000 había puesto `when 'pago_planilla' then '41' when 'pago_sunat' then '4011'` al INICIO del `case` del debe del Diario, y la
235000 ancla ese `case` entero (su `p_nuevo` dejó de ser un texto contiguo), así que al repegarla abortaba. Lo mismo, sin abortar,
en el candado (mi bloque justo antes de «Qué va en cada punta», que es el final del texto de la 235000) y en los nombres (mis dos
`when` entre «Entre cuentas» y «Entrega de fondo», que la 182000 deja juntos).

DECIDÍ: una migración nueva, `20261016183000_pago_planilla_anclas_que_no_rompen_al_fondo.sql`, que MUEVE ese texto a donde nadie
ancla: el mapeo 41/4011 al `c_d` del CTE `md` (de donde el `case` lee su `else`), el bloque del candado después de la línea «Qué va
en cada punta», los nombres al final del `case` antes de `else p_tipo`. Idempotente por marcas; si alguien repega la 002000 encima,
vuelve a sacar la copia que estorba. Pegada en producción el 2026-10-16 (`20261016183947`) con ensayo previo; las tres huellas
iguales a la pila. DESCARTÉ editar la 002000 (ya corrió en producción: dos caminos distintos para llegar al mismo cuerpo son dos
oportunidades de que no sea el mismo) y tocar la 235000 (está en `main` y en producción). SE ROMPE SI: un parche futuro vuelve a
meter texto DENTRO del `p_nuevo` de otro; la regla, desde hoy, es sumar antes o después y mirar quién más ancla esa función
(`grep -ln "reemplazar('retail.<función>"` en `supabase/migrations`). `pago_planilla_y_sunat.mjs` lo vigila (caso «anclas del fondo»).
