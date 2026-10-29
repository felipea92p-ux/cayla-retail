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

## Avance de la obra (`/construir`, 9 actividades aprobadas el 2026-10-28)

- [x] **1. La cuenta con CLAURE (solo lectura)** — `7814315c6`. Migración `20261029004000`, pestaña «CLAURE» en Cuentas y dinero, guía y pruebas.
- [x] **2. Pagar a CLAURE** — migración `20261029011000`, tipo `pago_claure` (como `pago_sunat`: sale de un banco, de la empresa, solo el líder, con su n.º de operación), «Pagar a CLAURE» en la pestaña (abre «Registrar movimiento» con el saldo escrito), `fn_claure_pagos()`, saldo = cobrado − devuelto − comisión − pagado. Pruebas: `pnpm pruebas:claure-pago` (14 casos).
- [x] **3. Aviso en el cierre de caja de Lima** — migración `20261029013000` (`fn_claure_cierre`), bloque «Cuentas con Claudia» en el modal de cierre (neto, lo de hoy, detalle plegado, «Copiar resumen», «Pagar a CLAURE» para el líder) y el efectivo partido CAYLA/CLAURE en el paso de contar. Pruebas: `pnpm pruebas:claure-cierre` (10 casos). Se partió `fn_claure_cuenta` en `fn_claure_filas` (interna) + la lectura con candado, en la migración 1.
- [x] **4. Disponible real** — sin migración: «De eso, S/ X es de Claudia · Disponible real S/ Y» bajo «¿Cuánta plata tienes hoy?» (Dónde está) y en «¿Cuánto tienes?» del Resumen, más una tarjeta «¿Cuánto le debes a CLAURE?» en el Resumen que lleva a su pantalla. Los saldos de los bancos no se tocan.
- [x] **5. CLAURE fuera de Finanzas** — migración `20261029020000`: el Diario reclasifica lo vendido de CLAURE (7011 y el costo) a lo que se le debe (479), así que el Estado de resultados, el Resumen, el Balance y el Cierre de mes dejan de contarlo sin cambiar; Impuestos sigue con el IGV real de SUNAT y dice «de ese IGV, S/ X es de CLAURE»; el Estado de resultados lleva la nota «No incluye lo vendido de CLAURE»; el Flujo cuenta el pago a CLAURE como salida.
- [ ] 6. CLAURE fuera del resto de pantallas — **partida en cuatro cortes por Felipe (2026-10-29): eran ~40 funciones de la base y varias lecturas directas de la web, con reglas distintas**:
  - [x] **6a. Inicio y Observatorio** — migración `20261029023000`: `fn_item_es_de_claure` (la regla común, la de la actividad 5), `fn_claure_de_hoy` (el Inicio de la líder resta lo de CLAURE de lo que lee de Caja, con su nota «No incluye S/ X de lo que se vendió de CLAURE») y dos reemplazos anclados en `fn_observatorio` y `fn_observatorio_tienda` (solo lo de CAYLA; prendas quietas solo con sus unidades).
  - [x] **6b. Rendimiento, metas, Comercial y «Mis ventas»** — migración `20261029030000`: once reemplazos anclados (`fn_rendimiento_*`, `fn_metas_equipo`, `fn_comercial_*`, `fn_mis_ventas_*`) con la regla de 6a; sus «Ayuda» dicen que lo de CLAURE no cuenta.
  - [ ] 6c. Club y clientes (`fn_club_*`, `fn_ledger_puntos`, `fn_clienta_*`, `unirse_al_club`; aquí mandan los puntos: decisión de Felipe).
  - [ ] 6d. Análisis y motores (`fn_analisis_sede`, Frescura, demanda, Plan del piso, plan de compra, Calidad, rentabilidad: unas 20 funciones; puede pedir dos commits).
- [ ] 7. Apartados y pedidos web · [ ] 8. Gastos por empresa · [ ] 9. Cierre.

**Decisiones tomadas en la actividad 2 (sin preguntar, con su porqué):**
- La cuenta contable de lo que se le debe es la **479 «Otras cuentas por pagar — relacionadas»**, **provisional hasta el contador**: el Diario se arma al leer, así que cambiarla es una línea de `fn_asientos_dinero_y_caja`.
- **Solo el líder** registra el pago (sale de un banco: la regla de siempre de `registrar_movimiento_dinero`). El cierre de caja (actividad 3) mostrará el botón solo al líder.
- **Pagar de más se permite**: el saldo pasa a negativo y la pantalla dice «¿Cuánto te debe CLAURE?» («queda a favor de CAYLA», decisión 19). La base no lo impide.
- **Anular un pago** se hace en Dónde está ▸ Movimientos (el líder), y el saldo vuelve a subir. No se duplicó ese botón en la pestaña CLAURE.

**Pendientes que dejó la actividad 2:**
- [x] ~~El Flujo real no cuenta el pago a CLAURE~~ — resuelto en la actividad 5 (`fn_flujo_lineas` lo cuenta como `pago_claure`, salida). Falta sacarlo del «día normal» de la proyección (`fn_flujo_caja_proyeccion`), que sigue viendo la plata de Claudia como disponible: ver pendientes de la actividad 5.
- [ ] **Al pegar `20261029011000` en producción**: sus cuatro reemplazos anclados abortan sin cambiar nada si una función de producción no tiene el texto esperado. No pude leer las funciones vivas de producción (el permiso del MCP lo rechazó); en la base local, con el mismo código de main, las cuatro calzan.
- [ ] Orden de pegado en producción: primero `20261029004000`, después `20261029011000`. Las dos con lock_timeout; ninguna con políticas.
- [ ] `pruebas:cuentas-dinero` (16 casos) y `pruebas:cuenta-sellada` (6) fallan en la base local por «Esa tienda no existe o no está activa» (el Taller en `guardar_medio_de_cobro`) y por la migración #1419 que la base local no tiene aplicada: ya fallaban antes de esta obra.

**Decisiones tomadas en la actividad 3 (sin preguntar, con su porqué):**
- **El neto del cierre es el saldo con Claudia** (cobrado en cuentas de CAYLA − devuelto − comisión estimada − pagado). **El efectivo de CAYLA que Claudia se quede NO se resta**: no hay una regla aprobada para saber cuánto es (lo que se traslada al cierre es del cajón entero, no de una empresa). El cierre lo muestra aparte, informativo: «S/ X es de CLAURE (lo tiene Claudia) y S/ Y es de CAYLA».
- **«Registrar el pago desde el cierre» = un enlace** a `/finanzas/dinero/claure?pagar=1`, que abre la hoja de pago con el saldo escrito. Registrar un pago dentro del propio modal de cierre habría duplicado el formulario de pago; el líder llega en un clic.
- **Quien cierra y no es líder** ve el aviso (neto, detalle y resumen para copiar) pero no el botón de pagar. No necesita el módulo Finanzas: `fn_claure_cierre` usa el candado de `fn_esperado_caja`.
- El aviso **nunca bloquea ni cambia el cierre**: si CLAURE no opera en esa sede o la lectura falla, no se dibuja nada.

**Pendientes que dejó la actividad 3:**
- [ ] **Decisión de Felipe:** ¿cómo se resta del neto el efectivo de CAYLA que queda en poder de Claudia? (por ejemplo, un destino del traslado «Se queda con Claudia»). Mientras no se decida, el neto es solo lo cobrado en cuentas de CAYLA.
- [ ] El bloque sale en el modal de cierre (Caja y Vender); **todavía no en el detalle de un cierre pasado** (`CierreCajaDetalle`, `UltimoCierreCaja`). La función ya lee la caja y el día que se le pidan.

**Decisiones tomadas en la actividad 4 (sin preguntar, con su porqué):**
- **El disponible real es «lo que hay en las cuentas − lo que se le debe a Claudia»** y solo se dice mirando CAYLA entera o la Empresa, y solo al líder: una sede no lleva los bancos ni las máquinas, donde cae lo de Claudia, y quien no es líder no ve los saldos de los bancos. Con saldo a favor de CAYLA (se le pagó de más) o sin deuda no se dice nada.
- **No se resta el efectivo de CLAURE que está en el cajón de Lima**: esa plata la tiene Claudia, pero el cajón la cuenta en su saldo. Es el mismo hueco del cierre (efectivo de CAYLA que se queda Claudia): falta la regla que decida cómo se reparte el efectivo.
- **La tarjeta del Resumen** va aparte de las tres preguntas (no es una cuarta) y solo la ve quien ve las finanzas de todo y tiene el módulo Cuentas y dinero; si la base no responde, dice que no se pudo leer.

**Pendientes que dejó la actividad 4:**
- [ ] «¿Me alcanza?» (Flujo de caja) y «Tu caja en las próximas dos semanas» siguen usando lo que hay en las cuentas sin restar lo de Claudia: se decide con la actividad 5 (cómo cuenta CLAURE el Flujo).

**Decisiones tomadas en la actividad 5 (sin preguntar, con su porqué):**
- **Se reclasifica en el Diario, no en cada pantalla.** Todo Finanzas (Estado de resultados, Resumen, Balance, Cierre de mes) lee `fn_asientos`; tocarlo ahí lo arregla en un solo lugar y deja cuadrados los asientos (cada documento de CLAURE es un asiento que suma cero). Era la única forma de no tocar seis funciones cuyos textos guardan pruebas viejas.
- **Lo que se le debe es la parte SIN IGV (la 479).** El IGV queda en 4011 porque la boleta sale con el RUC de CAYLA y SUNAT lo cuenta aquí; la pantalla de Impuestos lo dice con su línea «de ese IGV, S/ X es de CLAURE», y el saldo de la pestaña CLAURE ya lo muestra aparte. Si CAYLA se lo cobra a Claudia es decisión de Felipe.
- **El efectivo entra en la 479** (aunque lo tenga Claudia) porque lo vendido de CLAURE no es ingreso de CAYLA se cobre como se cobre; por eso la 479 puede subir más que el saldo de la pestaña CLAURE (que solo cuenta lo cobrado en cuentas de CAYLA).
- **La comisión del POS sigue siendo gasto de CAYLA** en el Diario (recobrársela a Claudia no se asienta todavía; el saldo de la pestaña sí la resta).
- **Un mes ya cerrado conserva su foto**: la reclasificación solo se ve en meses abiertos. Los meses de antes del 23-oct no cambian.

**Pendientes que dejó la actividad 5:**
- [ ] **Decisión de Felipe y contador:** la 479 es provisional; ¿se cobra el IGV a Claudia o se le descuenta?; ¿cómo se registra el efectivo de CLAURE que ya tiene Claudia (hoy sube la 479 sin que baje nada)?
- [ ] **Los CAMBIOS con prendas de CLAURE** (la actividad 1 ya los lista aparte) siguen contando en CAYLA hasta que se decida cómo contarlos.
- [ ] **El Balance valora el stock de CLAURE como si fuera de CAYLA** (`fn_bal_stock`): la 201 que la reclasificación saca por lo vendido no corrige el inventario que queda en la tienda.
- [ ] **«¿Me alcanza?» y la proyección de caja** (`fn_flujo_caja_proyeccion`) siguen contando la plata de Claudia como disponible.
- [ ] **Al pegar `20261029020000` en producción**: sus dos reemplazos anclados abortan sin cambiar nada si `fn_asientos` o `fn_flujo_lineas` de producción no tienen el texto esperado (no pude leer las funciones vivas). Orden: `20261029004000` → `20261029011000` → `20261029013000` → `20261029020000`.
- [ ] **Falla ajena que salió al correr las suites:** `pruebas:estado-resultados` (N2, N7) y `pruebas:perdidas` (M5) fallan en la base local también SIN este cambio: el detalle de mermas del Estado de resultados se ordena por monto (`order by q.monto desc`, `fn_estado_resultados`) sin desempate, y con dos reglas empatadas en el mismo monto el orden cambia de una corrida a otra. Una coma (`, q.regla`) lo hace estable. `pruebas:finanzas-montos-y-caja-fuerte` falla de noche (después de las 19:00 de Lima, `current_date` del contenedor ya es mañana: «La fecha no puede ser futura»).

**Decisiones tomadas en la actividad 6a (sin preguntar, con su porqué):**
- **Caja, Vender, Historial, Movimientos e Impuestos siguen mostrando todo** (decisión de Felipe). Por eso `fn_ventas_del_dia` NO se toca: el Inicio de la líder le resta lo de CLAURE con una función hermana, y así Caja y Vender no cambian.
- **Una venta solo de CLAURE no cuenta como venta ni como ticket** en «Hoy» ni en el Observatorio; una mixta cuenta por sus líneas de CAYLA. Cambia el valor medio, a propósito.
- **Desde el 23-oct** (`cuenta_corriente_desde`), igual que Finanzas, para que todas las pantallas cuadren. La primera semana, «vs. el mismo día de la semana pasada» compara un hoy sin CLAURE con un ayer que no lo separaba; se corrige solo desde el 30-oct.
- **La meta del día no se toca**: sigue siendo la de la sede (`fn_parametros_caja`), contra lo de CAYLA solamente. Si Lima debe tener una meta distinta para CAYLA sola, es decisión de Felipe.
- **No agregué ninguna nota al Observatorio**: su diseño es una decisión propia (ADR-0322) y «Toda CAYLA» ya dice de qué empresa habla.

**Pendientes que dejó la actividad 6a:**
- [ ] **Al pegar `20261029023000` en producción:** sus dos reemplazos anclados abortan sin cambiar nada si `fn_observatorio` o `fn_observatorio_tienda` de producción no tienen el texto esperado (la de la tienda se leyó el 2026-10-22; su huella está en `pruebas:arreglos-en-vivo-roles-observatorio`, que la migración actualiza). Orden: `20261029004000` → … → `20261029020000` → `20261029023000`.
- [ ] `fn_mis_ventas_del_dia` (el «Tu día» de una integrante en el Inicio) sigue sumando lo de CLAURE: va con 6b.

**Decisiones tomadas en la actividad 6b (Felipe pidió seguir sin parar: se decidió con el valor por defecto de abajo y queda como pendiente suyo):**
- **La meta de cada persona y de la sede no se toca** (`fn_metas_por_dia`, `fn_parametros_caja`): lo de CLAURE ya no la llena. Si Lima necesita una meta distinta para CAYLA sola, la carga Felipe en Configuración.
- **Una devolución de una prenda de CLAURE no resta a CAYLA** en el panel Comercial (la de una de CAYLA sí).
- **Sin comisión ni bono**: Rendimiento «es para reconocer y acompañar»; no hay pago que recalcular.

**Pendientes que dejó la actividad 6b:**
- [ ] **Al pegar `20261029030000` en producción:** sus once reemplazos anclados abortan sin cambiar nada si una de las nueve funciones no tiene el texto esperado (no pude leer las vivas; el mensaje dice cuál). Va después de `20261029023000`.
- [ ] Verificación visual de Rendimiento y Comercial con datos de CLAURE: se hace junto con las demás pantallas en el cierre (actividad 9).
