# ADR-0375 — Caja ▸ Registrar ingreso: «Depósito o retiro» deja la cabecera

> **Número:** este ADR nació como 0371 y sus migraciones como `20261010160000` y `20261010170000`. Los tres números chocaron con otros PR
> que entraron antes a `main` («Por revisar», ADR-0371; colores, `…160000`; revisar productos, `…170000`). En producción ya estaban
> aplicadas (versiones `20261010144148` y `20261010144250`), y lo que guardaron en la base (comentarios de la columna y de
> `registrar_ingreso_caja`, el interior de las funciones) dice «ADR-0371». Se deja así, para que el repo y producción sigan iguales.

**Fecha:** 2026-10-10 · **Decide:** Felipe · **Estado:** aceptada (web + migraciones `20261010220000_caja_motivos_de_ingreso.sql` y `20261010220100_caja_ingresos_con_su_origen.sql`, **EN PRODUCCIÓN desde el 2026-10-10**, en ese orden, aplicadas por el MCP de Supabase a pedido de Felipe; `apply_migration` las registró
con la hora de aplicación, `20261010144148` y `20261010144250`, no con la del archivo. Antes de aplicarlas se verificó que cada ancla
apareciera exactamente una vez en producción y que el md5 de `fn_movimientos_dinero_validar` fuera el revisado (`49e42887…`). Después se
verificó cada función parchada, la columna nueva y los permisos, que siguen iguales)

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

## Actualización 2026-10-10 (b): cada ingreso baja la cuenta de donde sale

**El problema que apareció.** En Finanzas ▸ Cuentas y dinero, la caja fuerte es una cuenta con saldo propio: sube con cada
cierre que guarda ahí y solo baja con un depósito o un retiro. No había camino de vuelta al cajón: un movimiento de dinero no
podía tener un cajón como destino. Con la baldosa «Caja fuerte», el cajón subía y la caja fuerte no bajaba, así que la plata se
contaba dos veces, y el flujo la leía como «otros ingresos», como si CAYLA la hubiera ganado. Lo mismo pasaba con la plata que
trae el líder (el efectivo por rendir de un cierre «entregado al líder») y con el préstamo de otra sede (a la sede que prestaba le
faltaba esa plata al cerrar).

**Lo que decidió Felipe:**
- **Caja fuerte:** baja sola la caja fuerte de esa sede (movimiento «entre cuentas»).
- **Lo trae el líder:** la hoja pregunta «¿De qué plata es?». Con «Se la llevó en un cierre» baja el efectivo por rendir; con
  «Es plata del dueño» queda como aporte del dueño. Son dos píldoras sin opción por defecto, porque es plata y se elige a
  conciencia (el segmento subrayaba la primera opción aunque no se hubiera elegido nada).
- **Otra sede:** las dos puntas van juntas. Sale del cajón de la sede que presta (su caja tiene que estar abierta) con el motivo
  «Préstamo a otra sede» y entra a este. Quien ve Caja puede hacerlo aunque la otra caja no sea suya: lo decidió Felipe.
- **«Compra de insumos»** deja de ser una salida: es un gasto y se registra con el gasto rápido. Lo ya registrado no se toca.

**El modelo.** Es el espejo de lo que ya existía. Lo que SALE de un cajón se respaldaba con su egreso de caja
(`movimientos_dinero.caja_movimiento_id`); ahora lo que ENTRA a un cajón se respalda con su ingreso (`caja_ingreso_id`, columna
nueva, única entre los movimientos vigentes). El disparador `fn_movimientos_dinero_validar` acepta un cajón como destino de un
aporte, de un préstamo del dueño o de un «entre cuentas» desde otro cajón, la caja fuerte o el efectivo por rendir, siempre con
su ingreso: uno, del mismo monto y de esa tienda. Con eso el diario, el flujo y el balance lo leen como cualquier otro movimiento
de dinero: 101 contra 101 si es entre cuentas, 101 contra 52 si es aporte. Los cambios en Finanzas son:
- `fn_dinero_libro` no lleva al libro la punta que llega al cajón (su saldo sale de sus cajas).
- `fn_flujo_lineas` lee el ingreso como plata del dueño o como entre cuentas.
- `fn_bal_causas_dinero` ya no lo cuenta como «ingreso sin origen».
- `anular_movimiento_dinero` no anula lo que nació en Caja: el ingreso ya está contado en la caja y anularlo dejaría el ingreso
  sin origen.

**`registrar_ingreso_caja`** hace todo en una sola operación (la llama la hoja): registra el ingreso con la misma
`registrar_movimiento_caja` de siempre y crea su contraparte. Los tres motivos que tienen contraparte («Sencillo de la caja
fuerte», «Entrega del líder», «Préstamo de otra sede») y «Préstamo a otra sede» pasan a ser **de sistema**: solo se aceptan
cuando los registra esta función, así que no puede quedar un ingreso de la caja fuerte sin su contraparte. Si dos sedes se
prestan plata al mismo tiempo en sentido contrario, las dos cajas se bloquean juntas, en orden de id y en modo compartido: no se
traban entre sí y las ventas no esperan.

**Un hueco viejo que salió en la prueba.** En una sesión donde nunca se había puesto la marca `retail.movimiento_de_sistema`,
`current_setting(…, true)` devolvía NULL, `not (… and NULL)` daba NULL y el `if` no rechazaba. Por eso «Pago a proveedor» y
«Reembolso de proveedor» se podían tipear sueltos desde `20260925150000`. Se corrigió con `coalesce`.

**Cómo se vigila:** `scripts/pruebas/caja_ingresos_con_origen.mjs` (`pnpm pruebas:caja-ingresos`, en el CI) cubre 31 casos.
Se actualizaron dos pruebas que dependían de lo anterior: `cuentas_dinero.mjs` (un aporte directo al cajón sigue rechazado,
ahora porque le falta su ingreso de caja) y `candado_dinero_caja_cambios_devoluciones.mjs` («Compra de insumos» ya no es salida).

**Lo que queda abierto:**
- **Saldos negativos:** la caja fuerte o el efectivo por rendir pueden quedar en negativo si un cierre anterior no se registró
  bien. No se bloquea: el negativo avisa que falta un registro, y bloquear frenaría a la tienda por un error de otro día. Si
  Felipe prefiere que se bloquee, va en `registrar_ingreso_caja`.
- **«Vuelve de un retiro»** sigue sin contraparte: aparece en el flujo como «otros ingresos» y en el balance como «ingreso sin
  origen». Para unirlo hay que saber a qué retiro devuelve la plata.
- **Abrir la caja con más plata de la que dejó el cierre** sigue contándose como «Diferencias al abrir la caja». Es otro camino
  de la caja fuerte al cajón, anterior a este ADR.

## Pendiente

- ~~Aplicar en producción `20261010220000` y `20261010220100`~~: hecho el 2026-10-10 (ver Estado).
- Refrescar el diccionario (`docs/datos/generado/`) con un volcado nuevo de producción: `movimientos_dinero.caja_ingreso_id` y
  `registrar_ingreso_caja` todavía no están ahí.
- ~~Finanzas lee estas entradas como «otros ingresos»~~ y ~~«Compra de insumos» sigue entre las salidas~~: resuelto en la
  actualización (b).
