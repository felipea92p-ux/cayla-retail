# ADR-0371 — Caja ▸ Registrar ingreso: «Depósito o retiro» deja la cabecera

**Fecha:** 2026-10-10 · **Decide:** Felipe · **Estado:** aceptada (web + migración `20261010160000_caja_motivos_de_ingreso.sql`, **aplicada en local, pendiente en producción**)

## Problema

La cabecera de Caja tenía «Registrar gasto» (el mosaico rápido, ADR-0368) y «Depósito o retiro», un formulario de tipo (entrada o
salida) + motivo + referencia. Para una ENTRADA solo ofrecía «Ajuste de caja (sobrante)», que es solo del líder, y «Otro». Lo que de
verdad entra al cajón a mitad del turno se anotaba como «Otro», y al cerrar nadie sabía de dónde había salido la plata: el sencillo
que se saca de la caja fuerte, lo que trae el líder, lo que presta otra sede o lo que vuelve de un retiro. Felipe pidió cambiar el
botón por «Registrar ingreso», con la misma hoja que el gasto.

## Decisión

1. **La cabecera dice «Registrar gasto» y «Registrar ingreso».** También cambian la tarjeta «Hacer» y la barra del celular
   («Mover» → «Ingreso»). `IngresoRapidoModal` es la hermana del gasto rápido: la misma hoja, el mismo mosaico (exporta y reutiliza
   `Baldosa`, ADR-0358), el mismo monto (la coma cuenta como decimal), la misma guía de foco y el mismo sello de «listo». Su movimiento es el del gasto
   rápido (excepción de ADR-0136 act. 2026-10-09), con las mismas clases `gr-*`. Se agrega una sola regla: el mosaico de 3 columnas.
2. **Seis conceptos** (`lib/ingreso-rapido-reglas.ts`), cada uno con su motivo y su dato:

   | Baldosa | Motivo en la base | Pide |
   |---|---|---|
   | Caja fuerte | Sencillo de la caja fuerte | — |
   | Lo trae el líder | Entrega del líder | quién (obligatorio) |
   | Otra sede | Préstamo de otra sede | qué sede (obligatorio; las tiendas y el taller activos, sin la propia) |
   | Vuelve de un retiro | Devolución de un retiro | — |
   | Sobrante | Ajuste de caja (sobrante) | — (solo el líder; a los demás no se les muestra) |
   | Otro | Otro | qué fue (obligatorio) |

   El dato se guarda en la nota del movimiento («Trajo: Sandra», «De Tienda Trujillo»), seguido de la nota libre. **Siempre en
   efectivo, al cajón abierto y con fecha de hoy.**
3. **Lo que NO es un ingreso y la hoja manda a su lugar:** un abono de apartado (Apartados), una venta (Vender) y el reembolso de un
   proveedor (Finanzas, con su marca de sistema). Registrarlos aquí los contaría dos veces.
4. **Retiro y depósito a mitad del turno** (Felipe eligió esta opción): se abren con el enlace «Retiro o depósito» al pie de las
   hojas de gasto y de ingreso. Ese enlace abre `MovimientoCajaModal` con `soloSalida`: el tipo ya viene fijo como salida y no se muestra.
   El depósito al cerrar sigue dentro del cierre de caja (ADR-0186).
5. **La base** (`registrar_movimiento_caja`, vocabulario cerrado): suma los cuatro motivos de entrada y exige nota para «Entrega del
   líder» y «Préstamo de otra sede», igual que ya la exigía para «Otro». El cambio es un parche sobre la definición viva, como en
   `20260925150000`: se detiene si un ancla no aparece exactamente una vez, y no hace nada si ya está aplicado. No tiene políticas
   ni `alter`, así que se pega en una sola parte.

## Lo que se vigila

- `lib/ingreso-rapido-reglas.test.ts` lee la migración. Exige que cada motivo de la pantalla esté en la lista de la base, que los
  motivos con nota obligatoria en la base sean justo los que piden un dato en la pantalla, y que la guía de foco y `validarIngreso`
  coincidan en 15 escenarios.
- `lib/guia-de-foco-pantallas.ts`: el modal está como `aplicada`.

## Descarté

- **Una sola hoja de entrada y salida con el tipo arriba**: era el formulario de antes y no le contestaba a nadie «de dónde viene la plata».
- **Frecuencia y «Lo de siempre» en el ingreso**: una entrada a mitad del turno es rara, y la ★ o los montos repetidos mentirían con
  tan pocos datos. Si se vuelven frecuentes, se puede copiar `ordenarPorFrecuencia`.
- **Un combo de colaboradores para «quién la trajo»**: el líder puede ser de otra sede o de Dynamic, y un texto libre de 3
  caracteres basta para rastrearlo al cerrar.

## Pendiente

- Aplicar `20261010160000` en producción **antes** de publicar la web: sin la migración, la base rechaza las baldosas nuevas con
  «Motivo de ingreso desconocido». Sobrante y Otro sí funcionan sin ella.
- Finanzas sigue leyendo todas estas entradas como «otros ingresos» (`fn_flujo_lineas`). Separar «Lo trae el líder» como aporte del
  dueño o «Otra sede» como préstamo entre sedes es un paso aparte.
- «Compra de insumos» sigue entre las salidas de «Retiro o depósito», aunque es un gasto. Quitarla es una decisión aparte.
