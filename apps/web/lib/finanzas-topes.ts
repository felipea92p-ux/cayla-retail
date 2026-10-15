// Los topes de los textos y del monto de Finanzas (ADR-0412, /chaos 2026-10-14). La base los hace cumplir con `<tabla>_textos_con_tope`
// y `<tabla>_monto_con_tope` (20261015002000); la pantalla corta antes con `maxLength` para que nadie llegue a ese rechazo. Una sola
// definición: la prueba `finanzas-topes.test.ts` exige que coincidan con la migración. En producción, lo más largo guardado medía 68
// (descripción de un gasto), 45 (motivo de anular), 27 (nombre de cuenta), 7 (su número) y 43 (nombre de un activo) letras el 2026-10-14.

/** Lo que se pagó (o, si es un activo, el gasto que lo registra) y lo que se paga cada mes. */
export const MAX_DESCRIPCION_GASTO = 200;
export const MAX_MOTIVO_ANULAR_GASTO = 300;
export const MAX_REFERENCIA_MOVIMIENTO = 200;
export const MAX_NOMBRE_CUENTA = 80;
export const MAX_NUMERO_CUENTA = 40;
export const MAX_NOMBRE_ACTIVO = 120;
/** Un gasto o un movimiento de dinero, en soles (Felipe 2026-10-14: frena un dedo pegado en el 9). */
export const MAX_MONTO_FINANZAS = 1_000_000;
