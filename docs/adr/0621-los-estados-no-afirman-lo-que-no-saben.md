# ADR-0621 — Los estados financieros no afirman lo que no saben

**Fecha:** 2026-11-06 · **Estado:** aceptado (la parte de pantalla y el fondo, hechos; la proyección, por construir)

## Contexto

Felipe vio que el Flujo de efectivo mentía. Una auditoría de solo lectura contra producción revisó los cuatro estados y el cruce entre ellos: 101 hallazgos verificados, 16 causas raíz. Las cifras reales viven fuera del repo, que es público.

## Decisiones de Felipe

1. **El fondo de compras deja de ser plata disponible al gastarse**, no al entregarse. La mercadería sale del flujo con la fecha de su papel, aunque el papel siga por completar. Lo entregado y no gastado se muestra aparte, como «Por volver de compras», y no cuenta para días de caja ni para el mínimo. Respeta ADR-0362 y no toca `fn_dinero_libro`, que sostiene `fn_mi_plata_tiene` y la cuenta 1413.
2. **Los cobros proyectados salen del nivel real por temporada.** La meta queda como escenario aparte.
3. **La reposición futura es un % de costo sobre lo cobrado.** El plan de compra todavía no alcanza para sostener una cifra.
4. **El resultado oficial del mes incluye la estimación de sueldos, con el puente al libro a la vista.**

## Decisiones de arquitectura (hechas)

- **Una columna de antes con una cuenta sin arrancar no se muestra.** `fn_cuentas_dinero_saldos` devuelve hacia atrás el saldo declarado, así que sus saldos no fueron reales. `comparadaDelFlujo` deja «—» y dice el motivo. No se cambia la base: tocar `saldo_inicial` o `fn_flujo_disponible` rompería la identidad del `descuadre`.
- **Un mes a medias se nombra con sus días** («1–6 oct»), en los cuatro estados.
- **«Por eso» solo cuando el día a día explica toda la subida.** Lo demás se dice como lo que es.
- **«Cuánto hay que vender» reutiliza la cuenta de «¿Ya pagaste el mes?»** (`ventaParaElMesEntero`). Si no se puede leer lo que falta del mes, no se da cifra. Con fechas sueltas no se afirma nada mensual.
- **La cascada del flujo son filas, no columnas:** en la columna angosta del informe, una columna no alcanza para una cifra de seis dígitos.

## Descartado

- **El fondo sale al entregarlo:** daría la cifra más prudente, pero revierte ADR-0362 y la línea diría «Entregado».
- **Cerrar `cerrar_periodo` «con urgencia»:** la auditoría temía que congelara el mes sin sueldos. No puede: el chequeo `planilla` de `fn_cierre_mes_estado` bloquea con la misma `fn_planilla_visible()`.
- **Sumar `v_diarias` a la proyección:** contaría dos veces la planilla.

## Consecuencias

- El punto 1 está construido en `20261107165000_fondo_de_compras_sale_al_gastarse.sql`, en el repo y todavía sin pegar en producción (ver la actualización de abajo).
- Los arreglos de costo, IGV y arranque se hacen juntos, antes de cerrar octubre con el contador: cualquiera de ellos mueve la cifra del arranque (ADR-0618).

## Actualización 2026-11-07 — el fondo sale al gastarse (decisión 1, construida)

**Dónde se resta.** En el saldo de la cuenta `fondo` dentro de `fn_cuentas_dinero_saldos`, no solo en `fn_flujo_disponible`. Si se restara solo en el disponible, Cuentas y dinero, el Resumen («¿Cuánto tienes?» y su desglose, que exige cuadrar con el titular) y el disponible dirían tres cifras distintas, y el desglose se apagaría en silencio. Con la resta en el saldo de la cuenta, todo lo que lee saldos (el disponible incluido) dice lo mismo, y un integrante sin la cuenta a la vista no recibe una resta de una cuenta que no ve.

**Cómo.** `fn_fondo_por_completar(hasta)` devuelve un renglón por papel y por gasto del viaje «por completar», con la cuenta del fondo vivo de quien compró, la fecha del papel y el mismo origen que tendrá en el libro (papel → mercadería, gasto → gastos). Lo suman `fn_cuentas_dinero_saldos` y `fn_flujo_lineas`, así que el `descuadre` del Flujo sigue en 0. Al completarse, el renglón se va y entra el real con la misma fecha, cuenta y categoría: nada se mueve. `fn_dinero_libro` no se toca, así que `fn_fondo_saldo`, `fn_mi_plata_tiene` y Revisar compras siguen como estaban (ya restaban lo por completar por su cuenta).

**Por volver de compras.** `fn_flujo_por_volver(corte)` es lo que queda en los fondos vivos, nunca negativo. La proyección lo resta del saldo de partida, junto con lo de Claudia (ADR-0560), y lo dice en `por_volver_compras`. Por eso no cuenta para días de caja ni para el mínimo. El Flujo real también lo dice, y la pantalla lo explica en un aviso. Si alguien gastó de más, el fondo queda en negativo (CAYLA le debe): baja el disponible y no hay nada por volver.

**Lo que cambia en pantalla.**
- Cuentas y dinero: la fila del fondo dice lo que la compradora tiene en la mano, y «Tienes en total» suma ahora una parte «Por volver de compras». Antes no la sumaba y no cuadraba con el telar ni con el disponible.
- Resumen: «¿Cuánto tienes?» separa «por volver de compras» de «con el líder». Antes iban juntos como «en fondos».
- «Hoy tienes» y «¿Me alcanza?»: dicen que ya no cuentan lo por volver.
- «Sale de ▸ Mi fondo» (el combo con que la compradora paga): `fn_mi_fondo` dice lo mismo que Cuentas y dinero. La revisión adversaria encontró que seguía mostrando lo ya gastado.
- Un fondo gastado de más no se muestra como «por volver» negativo: «por volver» no baja de 0 (igual que la base), y lo que CAYLA le debe a la compradora se dice aparte («le debes a las compradoras»), dentro del total.
- Días de caja: bajan por dos lados. Uno, el saldo de partida sin lo por volver. Otro, lo gastado por completar entra a las salidas de los últimos 30 días con la fecha del papel. Las dos cosas son correctas: esa plata ya salió.

**Descartado.**
- **Restar solo en `fn_flujo_disponible`** (lo que decía el plan de la auditoría): por lo de arriba.
- **Tocar `fn_dinero_libro`:** lo descartó Felipe (ADR-0362); además movería Revisar compras.
- **Contar también la plata anotada por confirmar y lo que la compradora decidió devolver:** siguen en el fondo hasta que se mueven de verdad, y no son un gasto.

**Se rompe si:**
- `completar_papel_compra` o `revisar_gasto_compra` dejan de marcar `completado` en la misma transacción en que insertan el pago o el gasto.
- Cambian la fecha o la cuenta con que lo insertan.
- Compras corrige el monto de un papel por debajo de lo pagado. Al completarse, el Flujo cambia por esa diferencia, y es una corrección real.
- Un papel es de alguien sin fondo vivo: no resta nada hasta completarse.
