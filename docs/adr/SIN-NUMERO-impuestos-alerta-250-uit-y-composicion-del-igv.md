# ADR (sin número aún) · Impuestos: el aviso de 250 UIT, lo vendido antes del sistema y la composición del IGV

- **Fecha:** 2026-10-22 · **Estado:** construido y probado en local (`pnpm pruebas:impuestos`, 121 verificaciones); SQL por pegar en producción.
  Migración `20261023161000_impuestos_aviso_250_uit_y_composicion_del_igv.sql` (versión provisional: se reserva con `pnpm reservar migracion` y este archivo toma su número con `pnpm reservar adr`).
- **Decide:** Felipe, 2026-10-22 (régimen RMT; avisar al llegar a 250 UIT de ventas del año). Lo que sigue lo propone el arquitecto y queda a su revisión.
- **Toca:** ADR-0195 (F8 Impuestos: el límite del régimen) y ADR-0433 (parámetros tributarios que se guardan desde Configuración).

## El problema primero

CAYLA tributa en el Régimen MYPE Tributario. Mientras las ventas del **año** (sin IGV) no pasen de 300 UIT (S/ 1 650 000 con la UIT de 2026, S/ 5 500) el pago a cuenta de renta es
1 % de lo vendido en el mes; pasadas las 300 UIT sube a 1,5 % o al coeficiente que fije el contador. Tres cosas, medidas el 22-oct:

1. **El aviso llegaba tarde.** `fn_impuestos_panel` mide el límite con los **últimos 12 meses móviles** (`ventas_12m`) y Resumen avisa «Vas al X %» desde el 60 %. No hay un aviso que diga
   «habla con tu contador *antes* de que cambie el pago a cuenta». Felipe quiere avisar al llegar a 250 UIT (S/ 1 375 000).
2. **El ERP solo cuenta desde septiembre.** Lo vendido de enero a agosto de 2026 se emitió antes del sistema y no está en `comprobantes`. La tarjeta actual lo sabe y lo dice
   («el sistema tiene ventas desde septiembre: los 12 meses cuentan menos de lo real»), pero **no hay forma de sumarlo**. Un aviso que lo ignora se queda corto justo este año.
3. **La nota del IGV era falsa desde enero.** La fila `igv` = 0.18 decía «IGV 16 % + IPM 2 %». Con la Ley 32387 (página de SUNAT «Concepto, tasa y operaciones gravadas») el reparto
   cambia cada año y el total no: 2026 = 15,5 % + 2,5 %; 2027 = 15 % + 3 %; 2028 = 14,5 % + 3,5 %; 2029 = 14 % + 4 %; siempre 18 %.

## Qué se construyó

- **Parámetros nuevos** en `retail.parametros_tributarios` (siguen siendo solo-agregar; una corrección es una fila nueva):
  `aviso_umbral_uit` (250, por año, **se hereda** como el límite), `ventas_previas_erp` (soles sin IGV, por año **exacto**, arranca en 0 «por confirmar»), y `igv_general` / `igv_ipm`
  (referencia, desde cualquier fecha; la suma de cada día = el total `igv` de ese día, y una prueba lo vigila). El total 0.18, `fn_tasa_igv` y todo lo que los lee no se tocó.
- **La nota de `igv`** se corrige con una fila nueva de la misma vigencia (la vieja queda en la historia): «Tasa total del IGV con el IPM (18 %)… ver igv_general e igv_ipm».
- **`fn_impuestos_panel`** suma al JSON: `umbral.ventas_anio` (= comprobantes de enero a hoy + lo cargado de antes), `aviso_soles` (UIT × aviso), `aviso_alcanzado`, `anio_cruzado`, `previas_confirmadas`
  y los dos parámetros. La web decide el nivel con esos booleanos y escribe la frase (`avisoUmbral` en `lib/impuestos-reglas.ts`): ninguna cifra tributaria está escrita en el código.
- **`guardar_parametro_tributario`** acepta y valida los dos nombres nuevos (el aviso en UIT y **antes** del límite del año; lo de antes en soles, de 0 a 10 millones, desde el 1 de enero).
  `igv_general` / `igv_ipm` **no** se guardan desde la función: son referencia.
- **Dónde se ve.** Impuestos ▸ tarjeta del límite (aviso, «Ventas de 2026» con su desglose y la advertencia), Impuestos ▸ «Antes de declarar» (la frase y, si falta, el enlace a cargar lo de antes),
  Resumen ▸ «Para decidir hoy» (reemplaza al «Vas al X %» cuando el aviso salta). Configuración ▸ Impuestos: columna «Aviso (UIT)» en la tabla del régimen y el bloque «Ventas de antes del sistema».

Mensajes: «Llevas S/ 1,400,000 vendidos este año, a S/ 250,000 de las 300 UIT: habla con tu contador.» · «El sistema tiene ventas desde septiembre 2026 y lo vendido antes no está cargado: este aviso puede quedarse corto.»

## Decisión

**DECIDÍ:** el aviso mide el **año calendario** (enero a hoy) y suma `ventas_previas_erp` del año. Es lo que dice la regla del pago a cuenta (acumulado del ejercicio) y lo único que admite un
«lo vendido antes del sistema» honesto: un monto por año.
**DESCARTÉ:** reutilizar `ventas_12m` para el aviso. En enero de 2027 diría «84 %» con el año recién empezado (arrastra diciembre) y lo de antes del sistema no tendría cómo salir de la ventana mes a mes.
**DESCARTÉ:** pasar también la tarjeta de 300 UIT al año calendario. Cambia una cifra que ya se ve en dos pantallas; la decide Felipe (pregunta 1).
**DESCARTÉ:** editar la nota vieja o desactivar el disparador de solo-agregar. La historia de parámetros es la garantía de que el pasado no se reescribe; se corrige con una fila.
**DESCARTÉ:** inventar un monto para enero–agosto. Sin dato, el parámetro vale 0 «por confirmar» y el aviso lo dice en la propia pantalla.
**SE ROMPE SI:** (1) se cargan las ventas de enero–agosto a `comprobantes` y `ventas_previas_erp` sigue con monto: se cuentan dos veces (la nota de Configuración lo dice); (2) un líder cambia el total del
IGV desde Configuración: `igv_general` / `igv_ipm` no lo siguen (no las lee ningún cálculo; sí la prueba de suma, solo sobre lo sembrado); (3) la UIT del año no está cargada: sin soles el aviso calla, como el límite;
(4) el SQL se pega con `fn_impuestos_panel` o `guardar_parametro_tributario` distintas a las de local: los reemplazos anclados abortan nombrando la función (no dejan una mezcla).

## Pruebas

`scripts/pruebas/impuestos.mjs` (44 verificaciones nuevas, de 77 a 121): composición (suma = total en cada fecha; 2026 y 2027 con la ley; el total y `fn_tasa_igv` intactos; la nota vieja queda en la historia y la vigente
ya no la dice), reglas de la tabla, validaciones y permisos del guardado, el panel (año ≠ 12 meses; anuladas, pruebas y año pasado no cuentan; la nota de crédito resta; lo de antes no se hereda; el aviso se enciende,
se apaga al cruzar el límite y vuelve a estar lejos; los umbrales de la prueba salen de los parámetros) y la migración pegada dos veces (ni filas ni funciones cambian).
`lib/impuestos-reglas.test.ts`, `impuestos-pulso-reglas.test.ts` y `resumen-finanzas-reglas.test.ts` cubren las frases. **Mutación:** 8 fallos puestos a propósito en el SQL (lo de antes no suma, se hereda, el aviso sin tope,
aviso sin validar, componente mal cargado, ventana de 12 meses, lo de antes nunca confirmado, nota vieja) — cada uno hizo fallar al menos una verificación de comportamiento.
`no_deducible.mjs` re-pega su migración vieja sobre la base nueva: ahora deshace antes los reemplazos de esta migración y apaga sus filas dentro de su transacción.

## Preguntas abiertas para Felipe

1. ¿Pasamos la tarjeta de 300 UIT (12 meses móviles, hoy sin lo de antes del sistema) al año calendario + lo cargado de antes, para que las dos cifras de Impuestos hablen de lo mismo?
2. ¿De dónde y quién da el monto de enero a agosto de 2026 (emitido fuera del sistema, sin IGV)? Hasta que se cargue, el aviso se queda corto y lo dice.
3. ¿El aviso cuenta también las ventas sin boleta ni factura (notas de venta)? Hoy no: igual que el IGV, solo cuentan los comprobantes que valen para SUNAT.
