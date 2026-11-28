// Desde cuándo hay ventas que respalden las cantidades del Resumen de Producción (Formidable, 2026-10-27). Puro: sin Supabase ni React.
//
// Mientras el sistema lleve pocas semanas de ventas, lo que el Resumen sugiere fabricar es una guía y lo dice (`notaDeHistoria`, en el «?» de «Qué fabricar primero»); la nota se apaga
// sola. Las cuatro cifras de dinero que este archivo también explicaba («Capital en insumos», «Valor en proceso», «Por pagar», «Entregas por atender») salieron del Resumen el 2026-11-26.

/** El día del primer movimiento del ERP en las tiendas (el censo de TRU, consultado en producción el 2026-10-27). Desde ahí se cuentan las ventas que respaldan un ritmo. */
export const VENTAS_DESDE = "2026-09-29";
/** Mientras haya menos semanas de ventas que esto, el Resumen avisa que las cantidades son una guía. Es el primer número razonable, NO ajustado con meses de venta: lo cambia Felipe tocando esta constante. */
export const SEMANAS_DE_HISTORIA_CORTA = 8;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * El aviso de que el sistema lleva poco tiempo midiendo ventas, o `null` si ya lleva suficiente (la nota se apaga sola). `hoy` es el día de Lima, «AAAA-MM-DD».
 * «El sistema lleva 4 semanas de ventas (desde el 29 de setiembre): las cantidades son una guía, no una orden.»
 */
export function notaDeHistoria(hoy: string, desde: string = VENTAS_DESDE): string | null {
  const dias = Math.floor((dia(hoy) - dia(desde)) / 86_400_000);
  const semanas = Math.floor(dias / 7);
  if (dias < 0 || semanas >= SEMANAS_DE_HISTORIA_CORTA) return null;
  const cuanto = semanas < 1 ? "menos de una semana" : semanas === 1 ? "1 semana" : `${semanas} semanas`;
  return `El sistema lleva ${cuanto} de ventas (desde el ${Number(desde.slice(8, 10))} de ${MESES[Number(desde.slice(5, 7)) - 1]}): las cantidades son una guía, no una orden.`;
}
