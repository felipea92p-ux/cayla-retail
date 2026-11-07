# ADR-0621 — Los estados financieros no afirman lo que no saben

**Fecha:** 2026-11-06 · **Estado:** aceptado (la parte de pantalla, hecha; el fondo y la proyección, por construir)

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

- Mientras no se construya el punto 1, «Hoy» y los días de caja siguen contando el fondo.
- Los arreglos de costo, IGV y arranque se hacen juntos, antes de cerrar octubre con el contador: cualquiera de ellos mueve la cifra del arranque (ADR-0618).
