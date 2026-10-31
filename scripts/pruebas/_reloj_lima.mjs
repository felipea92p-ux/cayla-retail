/**
 * Las horas de una escena de prueba, siempre dentro del día de Lima que les toca.
 *
 * EL PROBLEMA (2026-10-31, PR #1511). Las pruebas de CLAURE fechaban lo «de hoy» con `now() - interval '2 hours'` y lo «de ayer» con
 * `now() - interval '1 day 2 hours'`, pero las funciones que miden (`fn_claure_cierre`, `fn_claure_saldo_a`) parten el día con la fecha de
 * Lima. Entre las 00:00 y las 03:00 de Lima, «hace 2 horas» ya es ayer: la venta de hoy pasaba al «saldo de antes» (215.60 donde iban 49.00)
 * y lo de ayer, a anteayer. El CI de esa noche corrió a las 00:00:09 de Lima y puso rojas 11 pruebas que no tenían nada que ver con el PR.
 *
 * QUÉ PROMETE. `haceHoras(h)` es «hace h horas», pero nunca antes de las 00:00 de hoy en Lima; con `diasAtras: 1`, lo mismo un día antes y
 * nunca antes de las 00:00 de ayer. Así una escena queda en su día a cualquier hora y nunca en el futuro (todo cae entre la medianoche y
 * `now()`). Cerca de la medianoche varias horas se vuelven la misma (las 00:00): las pruebas que solo cuentan por día no lo notan. Como cada
 * caso corre en UNA transacción, `now()` no cambia entre armar la escena y leerla.
 */

const INICIO_DEL_DIA = (diasAtras) => `(((now() at time zone 'America/Lima')::date - ${diasAtras})::timestamp at time zone 'America/Lima')`;

export const haceHoras = (horas, { diasAtras = 0 } = {}) =>
  `greatest(now() - interval '${diasAtras} days ${horas} hours', ${INICIO_DEL_DIA(diasAtras)})`;
