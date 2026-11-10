# ADR-0618 — El arranque del Balance separa el capital de lo perdido en octubre

- Estado: aceptado (Felipe, 2026-11-06)
- Migración: `supabase/migrations/20261107014000_arranque_capital_y_resultados.sql`, **aplicada en producción el 2026-11-06**
- Relacionados: ADR-0198 (diario derivado y saldos de arranque), ADR-0552 (el reinicio de las cuentas de dinero del 28-oct),
  migraciones `20261106171000` y `20261106204000`

> **Actualización (ADR-0620, 2026-11-06, sin aplicar en producción):** la decisión de este ADR sigue cierta, pero la migración `20261107035000` cambia tres cifras al aplicarse:
> la 4011 pasa de 20,157.00 por pagar a 41,878.00 a favor, la 50 Capital de 139,723.78 a 201,758.78 y el patrimonio al arranque de 110,423.63 a 172,458.63. La 591 no cambia.

## El problema

Felipe quería ver la plata de CAYLA cuadrada «desde el inicio del ERP» (primera venta, 30-sep). Las cuentas de dinero ya
cuadraban con el banco desde el reinicio del 28-oct, pero lo anterior no tenía saldo inicial y casi nada de lo que salió de
los bancos estaba registrado. La primera idea fue cargar un saldo inicial en un banco al 30-sep y la mercadería como egreso.
Ocho lectores en paralelo (solo lectura) mostraron que **todas esas formas rompen algo**:

- Mover el `saldo_desde` de un banco al 30-sep cambia su saldo de hoy (decenas de miles) y deja de cuadrar con el banco. Además, las RPC rechazan fechas anteriores al 1-oct (`inicio_finanzas`).
- La mercadería como **gasto** es una pérdida falsa: su costo ya pasa a resultados al venderse (691), y lo no vendido está en la 201.
- La mercadería como **compra** retroactiva crea ítems «por recibir» que duplican el stock y obliga a inventar un proveedor.
- El saldo inicial como **aporte** dice algo falso: que el dueño puso plata en octubre.

El único lugar correcto es el **patrimonio del arranque del Balance** (1-nov). Ese patrimonio tenía todo en una sola línea,
Capital 104,749.13, y además tenía dos huecos que la Comprobación marcaba: faltaba el fondo por rendir de la ronda 4 (1413 =
5,700 al 31-oct), y el banco (104) decía 5,330.74 cuando el sistema tiene 5,305.24 (un pago al Taller de 25.50 fechado el 28-oct
se registró después de fijar el arranque). Y el modal de Saldos de arranque no podía guardar ninguna corrección:
`fn_saldos_iniciales_propuesta` no devolvía las líneas 231 y 241 registradas a mano, así que el modal nunca cuadraba.

## La decisión

1. **104 y 1413 como el sistema al 31-oct** (`fn_bal_otro_camino`): 5,305.24 y 5,700.
2. **El patrimonio se parte en dos, deducido de los datos del ERP (sin extractos, por decisión de Felipe):**
   - **591 Resultados acumulados = −29,300.15**: el resultado de octubre del Estado de resultados (−26,488.05) menos los
     retiros de octubre (2,812.10, caja fuerte de AQP).
   - **50 Capital = 139,723.78**: lo que falta para cuadrar.
   - Total del patrimonio al arranque: 110,423.63 (antes 104,749.13; +5,700 del fondo, −25.50 del banco).
3. **La propuesta devuelve toda cuenta con saldo vigente** que no está en su lista. Así el modal vuelve a cuadrar y las
   correcciones siguientes se hacen desde la web, no por migración.

Octubre cerró con pérdida, así que **no hubo ganancia reinvertida**: la mercadería del periodo (carga inicial, reposiciones y
conteos, que Felipe confirmó pagados con plata del negocio) se pagó con capital. Eso no cambia ningún resultado. Comprar
mercadería no toca el Estado de resultados; solo explica de dónde salió la plata.

### Lo que NO se cambió, y por qué

- **La carga inicial que llega después del 1-nov sigue entrando contra el capital (50)** (`fn_asientos_carga_inicial`).
  Felipe eligió «descontarla del fondo de las rondas». Hacerlo solo en el diario dejaría la 1413 en 7,367.50 contra 17,108 en
  Fondos por rendir, y la Comprobación se bloquearía. El camino correcto ya existe: completar los papeles de las rondas en Compras.
  Eso las vuelve compra de mercadería pagada con el fondo. Pero entonces la misma prenda, ya cargada como «carga inicial», entraría
  dos veces a la 201. Resolver ese cruce (no cargar como «carga inicial» lo que trae una ronda, o enlazarlos) es otra decisión.
- **La diferencia de 88.00 en la 104**: los pagos del Taller (`comprobantes_produccion_pagos`, ploteos del 6-nov) salen del banco
  en Cuentas y dinero, pero el diario no tiene regla para ellos. Es un hueco del módulo de Producción.

## Cómo se verificó

Antes de aplicar, la migración corrió entera en producción **dentro de una transacción con rollback**, y se midió lo que
cambiaba. Después de aplicarla:

| Comprobación (`fn_conciliacion_contable`) | Antes | Después |
|---|---|---|
| Arranque cuadra | 147,468.43 = 147,468.43 | 182,443.08 = 182,443.08 |
| 1413 Fondos por rendir | −5,700.00 | 0.00 |
| 104 Bancos | 113.50 | 88.00 (pagos del Taller) |
| Cuadre del modal (vigentes) | −1,436.86 | 0.00 |

Los saldos de Cuentas y dinero (bancos y fondo) y el Estado de resultados de octubre no cambiaron.

## Cómo deshacerlo

Desde el modal de Saldos de arranque (ya puede guardar): 104 = 5,330.74, 1413 = 0, 50 = 104,749.13, 591 = 0, con motivo.
`saldos_iniciales` es inmutable: cada corrección agrega una fila y la anterior queda a la vista.

## El cuadre de caja que motivó esto (30-sep → 6-nov)

Ventas 154,611.03 + ajustes de conciliación sin ubicar 2,867.29 − salidas registradas 92,141.43 (planilla 45,839,
gastos 19,666.13, rondas 17,108, activos 4,600, retiros 2,812.10, faltantes de caja 1,521.80, Taller 594.40) − mercadería no
registrada como salida 98,325.72 (carga inicial 96,918.40 + recepciones anteriores al 28-oct 1,407.32) = saldo de hoy 5,086.48,
con un saldo inicial implícito al 30-sep de 38,075.31. Ese cálculo no incluía los +25,280.80 de «ajuste/reposición» ni los
+13,885.49 netos de conteo anteriores al 1-nov. Como también se pagaron con plata del periodo, el saldo inicial real fue
mayor (≈ 77,000). El reparto 50/591 no depende de esa cifra: sale del Estado de resultados.
