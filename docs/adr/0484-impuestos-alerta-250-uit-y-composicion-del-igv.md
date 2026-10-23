# ADR-0484 · Impuestos: el aviso de 250 UIT, la tarjeta del límite en año calendario y la composición del IGV

- **Fecha:** 2026-10-22 · **Estado:** construido y probado en local (`pnpm pruebas:impuestos`, 123 verificaciones); SQL por pegar en producción.
  Migración `20261023013000_impuestos_aviso_250_uit_y_composicion_del_igv.sql` (versión reservada con `pnpm reservar migracion`; ADR-0484 reservado con `pnpm reservar adr`).
- **Decide:** Felipe, 2026-10-22 (régimen RMT; avisar al llegar a 250 UIT de ventas del año; la alerta cuenta lo registrado en el sistema; la tarjeta de 300 UIT pasa al año calendario).
- **Toca:** ADR-0195 (F8 Impuestos: el límite del régimen) y ADR-0433 (parámetros tributarios que se guardan desde Configuración).

## El problema primero

CAYLA tributa en el Régimen MYPE Tributario. Mientras las ventas del **año** (sin IGV) no pasen de 300 UIT (S/ 1 650 000 con la UIT de 2026, S/ 5 500) el pago a cuenta de renta es
1 % de lo vendido en el mes; pasadas las 300 UIT sube a 1,5 % o al coeficiente que fije el contador. Tres cosas, medidas el 22-oct:

1. **El aviso llegaba tarde.** `fn_impuestos_panel` medía el límite con los **últimos 12 meses móviles** (`ventas_12m`) y Resumen avisa «Vas al X %» desde el 60 %. No hay un aviso que diga
   «habla con tu contador *antes* de que cambie el pago a cuenta». Felipe quiere avisar al llegar a 250 UIT (S/ 1 375 000).
2. **La tarjeta y el aviso no hablaban de lo mismo.** La norma mide el ejercicio (el año calendario), no 12 meses móviles. Con la tarjeta en 12 meses y el aviso en año, la misma pantalla
   tendría dos cifras para una sola regla; y en enero la tarjeta arrastraría diciembre.
3. **La nota del IGV era falsa desde enero.** La fila `igv` = 0.18 decía «IGV 16 % + IPM 2 %». Con la Ley 32387 (página de SUNAT «Concepto, tasa y operaciones gravadas»)
   el reparto cambia cada año y el total no: 2026 = 15,5 % + 2,5 %; 2027 = 15 % + 3 %; 2028 = 14,5 % + 3,5 %; 2029 = 14 % + 4 %; siempre 18 %.

## Respuestas de Felipe (22-oct)

- **La alerta cuenta solo lo registrado en el sistema** (los comprobantes del ERP). La pantalla lo dice con una frase fija: «El aviso cuenta lo registrado en el sistema: puede quedar por debajo de la cifra real.»
  Nada se exige cargar ni queda pendiente. El parámetro `ventas_previas_erp` se queda como un **ajuste opcional** por año (sin IGV, en soles; sin fila vale 0, y editable en Configuración).
- **La tarjeta de 300 UIT pasa al año calendario**, la misma cifra del aviso. En enero se reinicia sola.

## Qué se construyó

- **Parámetros nuevos** en `retail.parametros_tributarios` (siguen siendo solo-agregar; una corrección es una fila nueva):
  `aviso_umbral_uit` (250, por año, **se hereda** como el límite), `ventas_previas_erp` (el ajuste opcional, por año **exacto**, **no se siembra**) e `igv_general` / `igv_ipm`
  (referencia, desde cualquier fecha; la suma de cada día = el total `igv` de ese día, y una prueba lo vigila). El total 0.18, `fn_tasa_igv` y todo lo que los lee no se tocó.
- **La nota de `igv`** se corrige con una fila nueva de la misma vigencia (la vieja queda en la historia): «Tasa total del IGV con el IPM (18 %)… ver igv_general e igv_ipm».
- **`fn_impuestos_panel`** (reemplazo anclado sobre la definición viva; ver «Cómo se pega») mide el **año calendario**: `umbral.ventas_anio` = comprobantes de enero a hoy + el ajuste del año, y de ahí salen
  `avance`, `cruzado` (el límite) y `aviso_alcanzado` (el aviso): la tarjeta y el aviso leen la misma cifra. Salen del JSON `ventas_12m`, `anio_avance`, `anio_cruzado` y `previas_confirmadas`; entran `anio`,
  `ventas_anio_erp`, `ajuste`, `aviso_soles`. En enero la ventana «de enero a hoy» queda vacía y la cuenta vuelve a cero sola.
- **`guardar_parametro_tributario`** acepta y valida los dos nombres nuevos (el aviso en UIT y **antes** del límite del año; el ajuste en soles, de 0 a 10 millones, desde el 1 de enero).
  `igv_general` / `igv_ipm` **no** se guardan desde la función: son referencia.
- **La web** decide el nivel con esos booleanos y escribe la frase (`avisoUmbral` en `lib/impuestos-reglas.ts`): ninguna cifra tributaria está escrita en el código. `proyectarUmbral` proyecta el año
  (acumulado de enero a diciembre, el mes en que se cruzaría; ya no mira 24 meses adelante).
- **Dónde se ve.** Impuestos ▸ tarjeta del límite («Vendido en 2026», la frase de qué cuenta y, si hay ajuste, el desglose), Impuestos ▸ «Antes de declarar» (la frase del aviso),
  Resumen ▸ «Para decidir hoy» (reemplaza al «Vas al X %» cuando el aviso salta; pasado el límite manda el aviso rojo de siempre). Configuración ▸ Impuestos: columna «Aviso (UIT)» en la tabla del régimen y
  el bloque «Ajuste de ventas del año» (opcional).

Mensajes: «Llevas S/ X vendidos este año, a S/ Y de las 300 UIT: habla con tu contador.» · «El aviso cuenta lo registrado en el sistema: puede quedar por debajo de la cifra real.»

## Decisión

**DECIDÍ:** la tarjeta de 300 UIT y el aviso de 250 UIT miden la **misma cifra**: el año calendario (enero a hoy) de lo registrado en el sistema, más un ajuste opcional. Es lo que dice la regla del pago a cuenta
(acumulado del ejercicio).
**DESCARTÉ:** dejar la tarjeta en 12 meses móviles y solo el aviso en año. Dos cifras para una norma; y en enero la tarjeta diría «84 %» con el año recién empezado (arrastra diciembre) mientras el aviso diría 0 %.
**DESCARTÉ:** exigir una carga previa para que el aviso funcione. El aviso cuenta lo registrado y lo dice; un monto inventado sería peor que un aviso honesto que puede quedar por debajo.
**DESCARTÉ:** editar la nota vieja o desactivar el disparador de solo-agregar. La historia de parámetros es la garantía de que el pasado no se reescribe; se corrige con una fila.
**SE ROMPE SI:** (1) se carga un ajuste de un monto que ya está en los comprobantes: se cuenta dos veces (la nota de Configuración lo dice); (2) un líder cambia el total del
IGV desde Configuración: `igv_general` / `igv_ipm` no lo siguen (no las lee ningún cálculo; sí la prueba de suma, solo sobre lo sembrado); (3) la UIT del año no está cargada: sin soles el aviso calla, como el límite;
(4) el SQL se pega con `fn_impuestos_panel` o `guardar_parametro_tributario` distintas a las de producción al 22-oct: los reemplazos anclados abortan nombrando la función (no dejan una mezcla);
(5) el SQL se pega antes que la web: la web vieja lee `ventas_12m` (ya no existe) y muestra S/ 0 en su tarjeta hasta publicarse; si la web va primero, la tarjeta dice que falta actualizar la base y el aviso calla.

## Cómo se pega

Dos ejecuciones separadas, en orden (parte 1: `parametros_tributarios`; parte 2: funciones). Antes de la parte 2, en producción y solo lectura, `select md5(pg_get_functiondef('retail.<nombre>(<firma>)'::regprocedure))`
debe dar, al 22-oct-2026: `fn_impuestos_panel(date)` = `ee108db11780bfea96b70202f8493f67` y `guardar_parametro_tributario(text, date, numeric, text)` = `b1afb4b970c0e855c60ba41fa4ba4754`.
Si no coinciden, producción cambió y hay que revisar los reemplazos. Los textos anclados evitan la forma corta de lectura que el SQL Editor confunde (ADR-0288); por eso la variable `v_12m` de la función
conserva su nombre de antes (ahora suma de enero a hoy, y lo dice un comentario).

## Pruebas

`scripts/pruebas/impuestos.mjs` (123 verificaciones): composición (suma = total en cada fecha; 2026 y 2027 con la ley; el total y `fn_tasa_igv` intactos; la nota vieja queda en la historia y la vigente
ya no la dice), reglas de la tabla, validaciones y permisos del guardado, el panel (año ≠ 12 meses: la boleta del 31 de diciembre pasado no cuenta; anuladas y pruebas no cuentan; la nota de crédito resta; el ajuste no se hereda
ni se siembra; el aviso se enciende, se apaga al cruzar el límite y vuelve a estar lejos; los umbrales de la prueba salen de los parámetros), **el reloj puesto en enero** (el 31 de diciembre suma 2026; el 15 de enero, solo 2027
y sin el ajuste de 2026), **el reloj en junio** (enero y junio suman, diciembre pasado no) y la migración pegada dos veces (ni filas ni funciones cambian).
`lib/impuestos-reglas.test.ts`, `impuestos-pulso-reglas.test.ts` y `resumen-finanzas-reglas.test.ts` cubren las frases y la proyección del año (incluido el reinicio en enero).
**Mutación:** 7 fallos puestos a propósito en el SQL (ventana de 12 meses, ajuste que se hereda, avance sin ajuste, límite sin ajuste, aviso sin tope, ajuste que no suma, solo el mes en curso) y 1 en la web
(`proyectarUmbral` con 12 meses): cada uno hizo fallar al menos una verificación de comportamiento.
`no_deducible.mjs` re-pega su migración vieja sobre la base nueva: deshace antes los reemplazos de esta migración sobre `guardar_parametro_tributario` y apaga sus filas dentro de su transacción.

## Preguntas abiertas

Ninguna de esta pieza: las tres que quedaban (año calendario en la tarjeta, qué cuenta el aviso, si el ajuste se exige) las contestó Felipe el 22-oct y están arriba.
