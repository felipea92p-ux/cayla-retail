# Spike visual · Finanzas (2026-09-24, v3)

`finanzas-spike.html`: un solo archivo, se abre en el navegador. Datos de ejemplo; nada se guarda.
Se arma desde `src/` con `python3 src/construir.py` (estilos, datos y una vista por archivo).
Plan: `docs/PLAN-FINANZAS.md` · Decisiones: `docs/adr/0195-finanzas-un-comprobante-de-proveedor-y-cinco-modulos.md`.

Paleta oficial «CAYLA Dynamic» (ADR-0169), copiada de `existencias-rediseno-2026-09/demo.html`. Los colores de medio de
pago son los `--color-metodo-*` de `globals.css`. Ventanas con el movimiento de ADR-0136; un solo loader y el aviso
después (ADR-0149); combo «Responsable» en cada guardado (ADR-0161/0162).

## v3 (2026-09-24, noche): la plata conectada con todo el ERP

- **Configuración ▸ Tiendas y caja:** meta de cada día de la semana por tienda (con IGV), fondo de caja y temporadas
  (Fiestas Patrias, Navidad, temporada baja) que suben o bajan la meta y cambian el fondo. No se pueden cruzar. La meta
  del mes del Presupuesto sale de aquí.
- **Ventas ▸ Caja (pantalla de ejemplo, no es de Finanzas):** meta de hoy con lo que falta y a qué hora se llega al
  ritmo actual; a qué cuenta entró cada cobro; y el cierre: «Deja S/ X», traslado propuesto, destino «banco» que pregunta
  cuál, y la **confirmación que no bloquea** si se deja menos del fondo. «Demo · día» simula un viernes de Navidad.
- **Cuentas nuevas:** cajas fuertes por tienda, efectivo entregado al líder y tarjeta de crédito de CAYLA (deuda).
- **Pagar a un proveedor** propone «Sale de» con bancos, cajas fuertes, efectivo por rendir, cajones y la tarjeta.
- El mapa de las 22 situaciones donde entra, sale o se mueve plata está en `docs/PLAN-FINANZAS.md` §7 bis.

Guion: **Ventas ▸ Caja** → «Demo · día» Navidad → «Cerrar caja» → sube el traslado 200 → «Cerrar caja» → confirmación
→ «Volver y dejar S/ 500» o «Cerrar igual». **Configuración ▸ Tiendas y caja** → cambia la meta de un sábado: cambia la
meta del mes y el Presupuesto. «+ Nueva temporada» con fechas que chocan con Navidad → la rechaza.

Verificado con Chrome sin ventana: 16 pasos nuevos + los 20 de la v2, sin errores de JavaScript; sin desborde a 375 px
en ninguna pantalla, pestaña ni día simulado.

## v2 (2026-09-24, tarde): la capa para decidir

Felipe pidió que no solo muestre números sino que **ayude a decidir**. Se comparó con Xero, QuickBooks, Float/Fathom,
Shopify, Alegra/Siigo y Odoo, y se sumó lo que les faltaba al spike:

| Qué | Dónde | Qué responde |
|---|---|---|
| **Salud en frases** | Resumen (arriba) | «Tu plata alcanza para 14 días de pagos», «CAYLA cubre sus costos el día 30», «LIM no llega a cubrir sus costos» |
| **Punto de equilibrio** | Resumen · por tienda | Cuánto tiene que vender cada tienda para no perder, y qué día del mes lo logra |
| **Recomendaciones con impacto en soles** | Resumen ▸ Para decidir hoy | Cada aviso dice cuánto está en juego y lleva a donde se resuelve (5 a la vista, «Ver más») |
| **Avisos de lo raro** | Resumen y Gastos | Un gasto sobre su promedio, mermas que se disparan, un proveedor que sube el costo |
| **Presupuesto contra real** | Reportes ▸ Presupuesto | Meta de ventas y topes de gasto; proyección al cierre al ritmo de hoy |
| **Escenarios** | Reportes ▸ Escenarios | ¿Y si bajo el alquiler de LIM? ¿Y si cierro LIM? ¿Y si paso un pago una semana? Recalcula utilidad y caja |
| **Gastos fijos inteligentes** | Gastos ▸ Fijos del mes | Propone los que se repiten (un clic), avisa los que faltan, detecta nuevos repetidos |
| **Conciliación con parejas** | Cuentas y dinero ▸ Conciliación | Para cada línea del extracto propone su pareja; lo que no tiene pareja sugiere qué es |
| **Plata del dueño** | Cuentas y dinero | Poner plata como **aporte** o **préstamo**; sacarla como **retiro** o **devolución**; «CAYLA te debe S/ X» |
| **Configuración** | Gestión ▸ Configuración (módulo general, solo líder) | Empresa · Cuentas y cobros · Caja y avisos (mínimo de caja) · Gastos fijos · Presupuesto · Impuestos |

**El filtro de tienda (decisión de Felipe, 2026-09-24):** la cabecera dice **dónde trabajas** (una sede; de ahí sale el
combo Responsable y el permiso de cada guardado). Dentro de cada pantalla, **«Ver»** dice **qué miras**: arranca en la
sede de la cabecera y ofrece «Todas las tiendas». Es la misma forma que ya usan Historial de ventas, Compras y
Facturación. Una tienda a la vez: con «Todas», las tablas ya ponen cada tienda en su columna. Flujo, Balance, Impuestos,
Cierre y Conciliación son de CAYLA entera y lo dicen con una etiqueta.

Todo lo «inteligente» son **reglas y cálculos** que muestran de qué dato salen, no inteligencia artificial que invente
números. Los avisos de lo raro y los fijos detectados usan el promedio de los últimos 6 meses (umbral configurable).

## Las 11 piezas en 6 entradas de menú

El menú de un grupo no puede tener más de 6 hijas (`lib/menu.ts`), así que las 11 piezas se reparten en pestañas:

| Menú | Pestañas | Piezas | Módulo (Roles y accesos) |
|---|---|---|---|
| Resumen | — | 4 + capa de decisiones | `reportes_financieros` |
| Gastos | Gastos · Fijos del mes · Activos fijos · Egresos de caja por clasificar | 1, 3 | `gastos` |
| Cuentas y dinero | Cuentas · Efectivo por tienda · Por pagar · Conciliación | 2, 5, 6 | `cuentas_dinero` |
| Reportes | Estado de resultados · Presupuesto · Escenarios · Flujo de caja · Balance | 7, 8, 9 | `reportes_financieros` |
| Impuestos | — | 10 | `impuestos` |
| Cierre de mes | — | 11 | `cierre_mes` (solo líder) |
| **Gestión ▸ Configuración** | Empresa · Cuentas y cobros · Caja y avisos · Gastos fijos · Presupuesto · Impuestos | — | `configuracion` (solo líder) |

**Cambio respecto del plan:** Por pagar vive en «Cuentas y dinero» (es pagar, no mirar reportes) y Efectivo por tienda
también. El plan se actualizó para que coincida.

## Botones de la barra de la demo (no son parte del ERP)
- **Ver como:** Líder, o Rosa (encargada de TRU) con los módulos Gastos y Cuentas y dinero. Ella ve solo su tienda, no
  puede cargar gastos «de la empresa», solo registra depósitos de su cajón y no ve Conciliación. Si abre Reportes, le
  sale «Sin acceso».
- **De dónde sale cada dato:** una etiqueta junto a cada número: **Existe** (tabla en producción), **Se calcula** o
  **Nuevo** (hay que construirlo).
- **Tema:** claro u oscuro.

## Guion de prueba (el ciclo completo funciona)
1. **Resumen**: 5 cifras y «Para decidir hoy». Cada aviso lleva a la pantalla donde se resuelve.
2. **Gastos ▸ Registrar gasto**: factura, «A crédito» → el gasto sale «Por pagar» y aparece en **Cuentas y dinero ▸ Por
   pagar**. Con «Ya se pagó» desde un cajón, baja el saldo de ese cajón.
3. **Gastos ▸ Egresos de caja por clasificar**: clasifica el depósito de LIM del 31 de agosto como «depósito al banco».
4. **Cuentas y dinero ▸ Conciliación**: «Confirmar las 5 propuestas» y «Registrar gasto» en la comisión: Interbank queda conciliada.
5. **Cierre de mes**: LIM ya no tiene pendientes → «Cerrar agosto de LIM». Cierra el Taller y «De la empresa»: se
   habilita «CAYLA entera». Un mes cerrado se reabre solo con motivo.
6. **Reportes ▸ Estado de resultados**: toca cualquier cifra para ver de qué tabla y de qué filas sale. En septiembre,
   «Comparar con agosto».
7. **Reportes ▸ Balance**: «Demo: simular un descuadre». El Balance se oculta y dice dónde está la diferencia.
8. **Cuentas y dinero ▸ Por pagar**: marca facturas → «Pagar».

Verificado con Chrome sin ventana: los 8 pasos, sin errores de JavaScript. Sin desborde horizontal a 375 px en ninguna
pestaña, y en modo oscuro.

## Guion de la v2
1. **Resumen** arranca en la sede de la cabecera (TRU). Cambia «Ver» a «Todas las tiendas»: salud en frases, punto de
   equilibrio por tienda, «Para decidir hoy» con impacto en soles.
2. Cambia la sede de la cabecera a AQP: el filtro la sigue.
3. **Gestión ▸ Configuración ▸ Caja y avisos**: baja el mínimo de caja a 10000 → en el Resumen desaparece el aviso de
   la semana del 12 de octubre.
4. **Gastos ▸ Fijos del mes**: «Registrar» el alquiler del Taller; «Marcar fijo» a Shalom.
5. **Reportes ▸ Escenarios**: alquiler de LIM a S/ 5,000, ventas de LIM +15 %, pasar el pago a Distribuidora Norte.
6. **Reportes ▸ Presupuesto**: suministros de TRU y publicidad se pasan del tope. Cámbialos en Configuración ▸ Presupuesto.
7. **Cuentas y dinero ▸ Conciliación**: «Confirmar las 5 propuestas» y «Registrar gasto» para la comisión.
8. **Cuentas y dinero ▸ Plata del dueño**: «Poner plata» como préstamo → sube «CAYLA te debe»; «Sacar plata» → baja.

Verificado con Chrome sin ventana: los 20 pasos del guion v1 + v2, sin errores de JavaScript; sin desborde horizontal a
375 px en ninguna pantalla ni pestaña, con «Todas», con una tienda y con el Taller.

## Lo que el spike da por supuesto (decisiones o datos pendientes)
1. **Balance por tienda:** el spike muestra solo el Balance de CAYLA entera. Las dos opciones («lo que es de la tienda» o
   «completo, repartiendo») están explicadas en el plan, §10. Pendiente de Felipe.
2. ~~Retiros y aportes del dueño~~ → resuelto en v2: aporte o préstamo al poner; retiro o devolución al sacar. Cómo se contabiliza cada uno lo confirma el contador (préstamo = cuenta 47, por confirmar).
3. ~~Mínimo de caja~~ → resuelto en v2: se configura en Gestión ▸ Configuración.
4. ~~Gastos fijos~~ → resuelto en v2: el sistema los propone, avisa los que faltan y detecta los nuevos.
5. **Cuentas bancarias y a qué cuenta entra cada cobro:** los del spike son inventados. Faltan los reales.
6. **Comisión del POS** como categoría de gasto (cuenta 639): nueva, la confirma el contador. Igual que la UIT, el
   régimen de renta y la retención del recibo por honorarios.
7. **El Taller en el estado de resultados:** muestra lo que gastó y, en positivo, lo absorbido por sus prendas (D-31).
   Si queda en negativo, es costo que no entró a ninguna prenda.
