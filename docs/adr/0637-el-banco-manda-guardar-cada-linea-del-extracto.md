# ADR-0637 — El banco manda: se guarda cada línea del extracto

**Fecha:** 2026-11-09
**Estado:** Actividad 1 construida y probada en local (rama `claude/redesign-accounts-money-module-7c4f1a`). Migración `20261109232000_banco_lineas.sql` SIN aplicar en producción: la pega Felipe, o la aplica con su OK explícito.
**Afecta:** `retail.banco_cortes`, `retail.banco_cargas`, `retail.banco_lineas`, `cargar_lineas_banco`, `fn_banco_cuadre`; Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco (`BancoDice.tsx`, `CuadrarConExtracto.tsx`, `lib/banco-lineas.ts`).

## El problema

Hasta hoy el extracto de Interbank se leía en la pantalla, se comparaba y se olvidaba. Cada cuadre reconstruía la historia desde cero, y la
diferencia de 5,236.65 entre el ERP y el banco nunca tuvo dónde vivir para explicarse línea por línea.

## Decisión (Felipe, 2026-11-09)

**DECIDÍ:** el banco manda. Cada línea del extracto se guarda tal como la dijo el banco (`banco_lineas`, solo agrega), y «El banco dice» muestra
el saldo del banco, el del ERP al mismo día y la diferencia, sin mover plata.

- Una línea **firme** (ya procesada, con número del banco) se reconoce por su identidad; la **provisional** (fin de semana sin procesar) se
  retira cuando llega firme o cuando el archivo ya no la trae. Dos pagos iguales siguen siendo dos.
- Cada carga guarda **de qué cuenta es el archivo**; el de otra cuenta no entra (contra las cargas anteriores y contra el número anotado).
- Una tabla pegada solo agrega o repite: nunca retira ni entra sobre un día que ya tiene líneas firmes.
- Solo el líder; todo o nada; idempotente por token; las tres tablas sin permisos para `authenticated` y a prueba de `TRUNCATE`.
- El saldo del ERP sale de la misma fórmula que `fn_bal_dinero`, así que no hay una segunda verdad.

**DESCARTÉ:** compararlo todo en memoria sin guardar (no deja historia); retirar firmes (el banco no se desdice); un candado del «casi igual».

## Se rompe si

Se sube el extracto de un mes cerrado que termina en fin de semana: la cadena de saldos sale cortada y se dice, no se acusa de huecos falsos.

## Pendiente (actividades siguientes)

2. «Partir de hoy»: el corte de los cinco bancos a la vez y el tipo `ajuste_de_corte` (especificación en el scratchpad de la sesión).
3. Cuentas personales (BCP Operativa, BCP Maniobra, Interbank Operativa): sin decidir cómo entran sus líneas.
Anular una carga equivocada tampoco existe aún: hoy el freno es la cuenta del archivo.

Prueba: `pnpm pruebas:banco-lineas` (136 casos) y `-- --control` (11 mutantes que tienen que caer).

## Actualización 2026-11-13 — el día a medias y el borde por fecha de proceso

Felipe vio «No cuadra» en Interbank Empresas. Medido con el .txt del 1 al 13 de noviembre y una consulta de solo lectura (las cifras no se
versionan: el repo es público): el extracto se había subido el 9-nov de noche, con ese día todavía en curso. Después entraron un QR y un ITF,
y la diferencia cambió de lado: el banco ya cerrado tenía más que el ERP. `fn_banco_cuadre` compara el último día del banco hasta la hora de
la descarga contra el día entero del ERP.

**DECIDÍ:** decirlo en la pantalla, sin tocar la base. `diaSinCerrar` (`lib/banco-lineas.ts`) mira si la última subida es la que trae el
último día y si se hizo ese mismo día en hora de Lima. En ese caso el estado es «El 9 nov sigue abierto» (pizarra, no ámbar) y explica por
qué la diferencia todavía no vale, y la cifra del banco dice de qué hora es.

**DESCARTÉ:** cambiar `fn_banco_cuadre` para comparar hasta el último día que el banco ya procesó (el de su última línea firme). Es más
exacto, pero necesita una migración que Felipe pega, y castiga al ERP cuando registra un depósito con un día de atraso: con los datos del
13-nov habría mostrado una diferencia de miles al 12-nov por depósitos que el ERP fechó el 13.

**SE ROMPE SI:** el archivo se baja un día y se sube al siguiente. La subida ya no es del mismo día y el aviso no sale, aunque el último
día esté a medias. La señal exacta (líneas provisionales en el último día) vive en la base; si vuelve a pasar, `fn_banco_cuadre` puede
devolverla.

Además, el lector marcaba 11 saltos como «Al extracto le faltan movimientos» en un archivo que empieza el 1-nov. El banco filtra por fecha
de OPERACIÓN pero procesa por lotes: el sábado 31-oct entró al lote del lunes 2-nov con correlativos intercalados, y el archivo trae ese lote
sin esas líneas. `leerExtracto` ahora toma como borde también los saltos dentro del primer lote procesado (y del último, si se procesó
después del último día del archivo). Con el archivo real: 17 saltos, los 17 en el borde.
