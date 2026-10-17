// Cuánto falta para que termine la campaña (la cuenta regresiva de la portada y del Inicio). Aparte de `lib/portada.ts` (2026-10-17):
// esa lee la campaña de la base con zod, y la cuenta regresiva se dibuja en el navegador; juntas, la portada cargaba zod entero en el
// celular del cliente solo para restar dos fechas.

/** La campaña rige todo su último día en Lima: termina a las 23:59:59 (UTC−5). */
export const finDeCampana = (hasta: string) => new Date(`${hasta}T23:59:59-05:00`).getTime();

export function partesCuenta(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
