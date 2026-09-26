# Spike visual · Caja como pantalla de trabajo (2026-09-26)

> **Estado: solo diseño, sin decidir.** Nada de esto está en el ERP. Parte de `CajaAbiertaPanel.tsx` tal como está en
> `origin/main` (`92912e29`). Los datos son inventados: Tienda TRU, apertura S/ 300.00, cuatro ventas.

`caja-tablero-spike.html` es un solo archivo que se abre en el navegador. La barra negra de arriba cambia cada variante
en vivo y la nota bajo ella explica la que está elegida.

## Qué decidió Felipe antes del spike (AskUserQuestion, 2026-09-26)

- **«Efectivo en el cajón ahora» lo ven todas**, no solo quien cierra, en línea con ADR-0186 (sin conteo ciego).
- Los cuatro accesos entran: Cobrar/Apartados, Gasto en efectivo, Cambio y devolución, y Pendientes del turno. Queda
  por elegir **cómo se muestran**: variante A (botones a la vista) o B (filtros a elegir).
- Celular e historial: pidió ver las variantes antes de decidir.

## Versión 2 (2026-09-26, lo que eligió Felipe)

El spike ya no muestra variantes para comparar: dibuja lo elegido. En la barra negra solo quedan Pantalla y Quién mira.

- **Accesos: botones y filtros juntos.** «Hacer»: Cobrar, Registrar gasto, Depósito o retiro, Cambio o devolución y
  Apartados. «Tu caja muestra»: píldoras que prenden tarjetas (Pendientes, Apartados, Gastos, Cambios y devoluciones).
  **Predeterminado: Pendientes y Apartados**, que es lo que pide acción. Una píldora apagada con algo por atender se
  marca en ámbar, y «Volver a lo predeterminado» restaura la elección. Las tarjetas ya no repiten los botones de arriba:
  solo traen «Ver en…».
- **Celular: barra fija.** Cobrar / Gasto / Movimiento / Cerrar (o Apartados si quien mira no cierra). En la pantalla
  solo quedan los botones que no están en la barra.
- **Cierres anteriores: una tarjeta con cuatro vistas** (Último cierre, Semáforo, Tabla de turnos, Gráfico), que se
  cambian en la misma tarjeta. **Predeterminada según quién mira: Último cierre para la colaboradora** (cómo recibió la
  caja) **y Semáforo para el líder** (el patrón de descuadres). Se marca con un punto rojo. La elección se recuerda en el
  aparato y «Volver a la predeterminada» la deshace. Tabla y Gráfico ocupan todo el ancho en la computadora.
- «Registrar movimiento» sale de la cabecera: lo reemplazan los botones «Registrar gasto» y «Depósito o retiro», que
  abren el mismo «¿Qué pasó con la plata?».

## Qué cambia y por qué (versión 1)

| Idea | Problema de hoy | Dónde se portaría |
|---|---|---|
| **Cifra principal: efectivo en el cajón ahora**, con su desglose (apertura + ventas en efectivo + entradas − salidas) | La cifra con la que se cuadra no aparece. Hoy solo sale en «Al cerrar», que exige ser líder y que la tienda tenga meta; TRU no tiene meta | `getEsperadoCaja`/`fn_esperado_caja` hoy exige poder cerrar: habría que abrirla a quien ve el módulo Caja |
| **«Cobrado en el turno» sin el anticipo** | «Ventas otro método» y la dona cuentan el `anticipo` (el adelanto de una separación, `20260923090000_separaciones.sql:597`) como plata de hoy | `caja-panel-reglas.ts`: separar `metodo = 'anticipo'` del total y mostrarlo aparte |
| **Accesos a las pantallas vecinas** (Vender, Gastos, Posventa, Apartados) | Caja solo tenía «Registrar movimiento» y «Cerrar caja» | Enlaces más un modal de gasto reutilizado |
| **«¿Qué pasó con la plata?»** en vez del modal genérico | Un gasto en efectivo ya sale del cajón desde Finanzas (`gastos-reglas.ts:405`, F3b). Pero el modal de Caja sigue ofreciendo «Compra de insumos» y «Otro» como egreso: dos caminos para lo mismo, y solo uno queda como gasto | `MovimientoCajaModal.tsx`: «gasto» abre el formulario de `registrar_gasto` con el cajón ya elegido. Depósito y entrega al líder van a Cuentas y dinero |
| **Pendientes del turno** (comprobantes sin emitir, separaciones que vencen hoy, traslados por recibir) | Todo eso se descubre al cerrar, o no se descubre | Lecturas que ya existen: `lib/comprobantes.ts:124`, separaciones y `trasladosPorAtender` del menú |
| **Movimientos del turno con filtro** «Todo / Ventas / Mueve el cajón» | La lista mezcla ventas con tarjeta, que no tocan el cajón | Solo presentación |
| **Historial**: último cierre, semáforo, tabla de turnos o gráfico corregido | Tres «mar 22» seguidos, un «S/0», rojo y verde sin leyenda, y media pantalla usada para algo que tiene su propia página | `TendenciaCierres` en `CajaAbiertaPanel.tsx` |
| **Celular**: barra fija Cobrar / Gasto / Movimiento / Cerrar (o Apartados), sobre el menú del ERP | Hoy el reloj y las 5 cifras llenan la primera pantalla y las acciones quedan arriba, lejos del pulgar | Nuevo `BarraCajaMovil` con `@container`, visible solo bajo ~640 px |

## Referentes del historial (de memoria, no se revisaron en vivo el 2026-09-26)

- **Square** (reporte de caja por turno) y **Shopify POS** (sesiones de caja): una fila por turno con esperado, contado y
  diferencia. La columna que manda es la diferencia, no la venta.
- **Odoo POS**: el tablero del punto de venta muestra solo el último cierre. La lista de sesiones vive aparte.
- **Loyverse** (turnos): cada turno es una tarjeta con esperado y real, pensada para el celular.

Lo que tienen en común: ninguno pone en el tablero un gráfico de cuánto se vendió en cada cierre. Todos muestran si
cuadró.

## Lo que el spike NO resuelve

- Qué pasa con la meta de hoy y la tarjeta «Al cerrar» (ADR-0195 F1): no se dibujaron porque TRU no tiene meta. Si se
  implementa, la meta va dentro de «Ritmo del turno».
- Abrir `fn_esperado_caja` a quien no cierra es un cambio de permisos en la base: necesita su migración y su prueba de
  roles (`pnpm pruebas:roles`).
- «Pendientes» lee datos de tres módulos distintos. Hay que decidir qué se muestra a quien no ve alguno de ellos (regla
  ADR-0161: se oculta el pendiente del módulo que no ve).
