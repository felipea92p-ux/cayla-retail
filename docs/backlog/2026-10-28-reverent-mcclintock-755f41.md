# Backlog · Cuentas con Claudia: el dinero de CLAURE aparte del de CAYLA en Lima (2026-10-28)

Decisiones de Felipe en 5 rondas de preguntas (20 en total). **Todavía no hay código ni ADR**: falta la lista de actividades para `/construir`, que Felipe aprueba antes de tocar nada. Se apoya en ADR-0542 (dueño real de cada unidad en Lima, PR #1441 sin fusionar al escribir esto).

## Contexto

El POS de Tienda LIM cobra en cuentas de CAYLA. Claudia (dueña de CLAURE) administra la caja de Lima y ya tiene el efectivo. Al cerrar caja y en Finanzas el sistema debe decir cuánto se le debe a Claudia según los medios de pago, y las ventas de CLAURE no suman a los ingresos ni a las cifras de CAYLA.

## Decisiones

| # | Tema | Decisión |
|---|---|---|
| 1 | Qué se le debe | Lo cobrado de las ventas de CLAURE que entró por el POS (tarjeta o QR) a cuentas de CAYLA. El efectivo no genera deuda: lo tiene Claudia |
| 2 | IGV | Mostrar las dos cifras (cobrado · IGV · base). La boleta sale con el RUC de CAYLA |
| 3 | Comisión del POS/QR | La asume Claudia; se descuenta de lo de tarjeta/QR. Hay que cargar el % de cada medio |
| 4 | Descuentos | Los absorbe Claudia: se le debe lo que se cobró |
| 5 | Efectivo de CAYLA en la caja de Lima | Se compensa: se muestra el **neto** («quién debe a quién») y el detalle queda como información |
| 6 | Qué genera la deuda | La **cuenta destino** del pago (`venta_pagos.cuenta_dinero_id`), no el medio. Cada cuenta debe decir de quién es |
| 7 | Cuándo se debe | Desde la venta, no desde el depósito del banco |
| 8 | Saldos en Finanzas | El saldo del banco no se toca; debajo, «de eso S/ X es de Claudia · disponible real» |
| 9 | Cierre de caja | Bloque «Cuentas con Claudia» (neto + detalle) y botón «Copiar resumen» para WhatsApp (el sistema no envía) |
| 10 | Quién lo ve | Quien cierra la caja y el líder |
| 11 | Pago a Claudia | «Registrar pago a Claudia» desde el cierre y desde Finanzas (parcial, cuenta de origen, n.º de operación) |
| 12 | Si no se paga | Saldo corrido |
| 13 | No suma en | Finanzas (Resumen, Reportes, Cierre) · Análisis, Rendimiento y metas · Inicio, Observatorio y Resumen de ventas · Club y clientes. Caja, Historial y Movimientos muestran todo con su insignia |
| 14 | Impuestos | Lo real de SUNAT (incluye CLAURE) con una línea «de eso CLAURE: S/ X» |
| 15 | Dónde se ve | Pantalla propia «CLAURE» en Finanzas + tarjeta de saldo en el Resumen |
| 16 | Apartados y tienda web | Se debe cuando la prenda sale (entrega del apartado, despacho del pedido) |
| 17 | Gastos | Mantenimiento, luz y alquiler se dividen entre las dos empresas; planilla, limpieza y bolsas «solo son de CLAURE» (ver dudas) |
| 18 | Compras de CLAURE | No pasan por el ERP: solo ingresa el stock |
| 19 | Devoluciones y cambios | Restan del saldo corrido (puede quedar a favor de CAYLA) |
| 20 | Desde cuándo | Retroactivo desde el 23-oct (las ventas rehechas con la regla del botón); Felipe carga lo que ya se le pagó a Claudia |

## Respondido por Felipe (2026-10-28, segunda vuelta)

- [x] **Gastos compartidos: 50/50.** Mantenimiento, luz y alquiler se dividen mitad y mitad.
- [x] **IGV:** el neto se calcula sobre lo cobrado, con el IGV como dato al lado («está bien»).
- [x] **Comisión:** los porcentajes ya están en Finanzas: `pos_tarifas` (Tienda LIM solo tiene la máquina Izipay: tarjeta y QR a 2,38 % + IGV, sin cargo fijo; Yape y transferencia no llevan comisión). Se estima con esa tarifa; la comisión real del depósito queda para después.
- [x] **Saldo de arranque:** se calcula **solo con los datos de las ventas** desde el 23-oct. No se cargan pagos previos a Claudia ni gastos.
- [x] **Orden:** el PR #1441 (ADR-0542) se fusionó el 2026-10-28 y sus migraciones **ya están en producción** (`fn_dueno_de_la_linea` y `stock_dueno` existen, verificado con una consulta de solo lectura).

## Dudas que siguen abiertas

- [ ] **Planilla, limpieza y bolsas «solo de CLAURE»:** ¿las paga CLAURE (CAYLA las adelanta y entran al neto) o quiso decir solo de CAYLA? Se pregunta antes de la actividad de gastos.
- [ ] **Yape en la cuenta de CAYLA:** en Lima el Yape cae en «BCP Empresa». Con la regla de la cuenta destino (P6) cuenta para la deuda; en P1 se dijo «tarjeta o QR del POS». Por defecto cuenta (regla de la cuenta destino).
- [ ] **Venta mezclada** (prendas de las dos empresas, un solo pago): el pago se reparte en proporción al valor de las líneas de cada empresa. Por confirmar.

## Lo que mostró producción (solo lectura, 2026-10-28)

- Desde el 23-oct, Tienda LIM: 16 ventas, 5 con prendas de CLAURE, S/ 330 en líneas. Pagadas con efectivo S/ 35, tarjeta S/ 118 y Yape S/ 177.
- Cuentas de CAYLA en producción: BCP Empresa, BCP Operativa, Interbank Empresas, Interbank Operativa, Por depositar Izipay, Por depositar Vendemás. No existe ninguna de Claudia.
- Saldo de arranque por las ventas: S/ 118 + S/ 177 − S/ 3,31 de comisión estimada (118 × 2,38 % × 1,18) ≈ **S/ 291,69**. El efectivo (S/ 35) lo tiene Claudia. Aún sin descontar devoluciones.

## Siguiente paso

Lista de actividades para `/construir` (cuentas de dinero con dueño · cálculo del saldo · cierre de caja · pantalla CLAURE · exclusión en las pantallas de CAYLA · gastos por empresa), a aprobar por Felipe. Dinero, migraciones y cualquier cambio a producción esperan su OK. Memoria: `cuentas-con-claudia-decisiones`.
