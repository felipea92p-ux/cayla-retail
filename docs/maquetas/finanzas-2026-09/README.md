# Spike visual · Finanzas (2026-09-24)

`finanzas-spike.html`: un solo archivo, se abre en el navegador. Datos de ejemplo; nada se guarda.
Se arma desde `src/` con `python3 src/construir.py` (estilos, datos y una vista por archivo).
Plan: `docs/PLAN-FINANZAS.md` · Decisiones: `docs/adr/0194-finanzas-un-comprobante-de-proveedor-y-cinco-modulos.md`.

Paleta oficial «CAYLA Dynamic» (ADR-0169), copiada de `existencias-rediseno-2026-09/demo.html`. Los colores de medio de
pago son los `--color-metodo-*` de `globals.css`. Ventanas con el movimiento de ADR-0136; un solo loader y el aviso
después (ADR-0149); combo «Responsable» en cada guardado (ADR-0161/0162).

## Las 11 piezas en 6 entradas de menú

El menú de un grupo no puede tener más de 6 hijas (`lib/menu.ts`), así que las 11 piezas se reparten en pestañas:

| Menú | Pestañas | Piezas | Módulo (Roles y accesos) |
|---|---|---|---|
| Resumen | — | 4 | `reportes_financieros` |
| Gastos | Gastos · Activos fijos · Egresos de caja por clasificar | 1, 3 | `gastos` |
| Cuentas y dinero | Cuentas · Efectivo por tienda · Por pagar · Conciliación | 2, 5, 6 | `cuentas_dinero` |
| Reportes | Estado de resultados · Flujo de caja · Balance | 7, 8, 9 | `reportes_financieros` |
| Impuestos | — | 10 | `impuestos` |
| Cierre de mes | — | 11 | `cierre_mes` (solo líder) |

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
4. **Cuentas y dinero ▸ Conciliación**: escribe 12,880 en Interbank y pulsa «Comparar».
5. **Cierre de mes**: LIM ya no tiene pendientes → «Cerrar agosto de LIM». Cierra el Taller y «De la empresa»: se
   habilita «CAYLA entera». Un mes cerrado se reabre solo con motivo.
6. **Reportes ▸ Estado de resultados**: toca cualquier cifra para ver de qué tabla y de qué filas sale. En septiembre,
   «Comparar con agosto».
7. **Reportes ▸ Balance**: «Demo: simular un descuadre». El Balance se oculta y dice dónde está la diferencia.
8. **Cuentas y dinero ▸ Por pagar**: marca facturas → «Pagar».

Verificado con Chrome sin ventana: los 8 pasos, sin errores de JavaScript. Sin desborde horizontal a 375 px en ninguna
pestaña, y en modo oscuro.

## Lo que el spike da por supuesto (decisiones o datos pendientes)
1. **Balance por tienda:** el spike muestra solo el Balance de CAYLA entera; por tienda solo sería lo suyo (cajón,
   mercadería, muebles). Pendiente de Felipe.
2. **Retiros y aportes del dueño** aparecen en «Registrar movimiento». Si Felipe no los usa, se quitan.
3. **Mínimo de caja** (S/ 15,000) para el aviso del flujo: es un número nuevo que define el líder.
4. **Gastos fijos** (alquiler, internet) proyectados en el flujo: el spike los da por conocidos. Falta decidir si el
   sistema los propone cada mes.
5. **Cuentas bancarias y a qué cuenta entra cada cobro:** los del spike son inventados. Faltan los reales.
6. **Comisión del POS** como categoría de gasto (cuenta 639): nueva, la confirma el contador. Igual que la UIT, el
   régimen de renta y la retención del recibo por honorarios.
7. **El Taller en el estado de resultados:** muestra lo que gastó y, en positivo, lo absorbido por sus prendas (D-31).
   Si queda en negativo, es costo que no entró a ninguna prenda.
