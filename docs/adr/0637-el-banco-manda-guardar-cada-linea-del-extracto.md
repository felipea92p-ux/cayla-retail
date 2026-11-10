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
