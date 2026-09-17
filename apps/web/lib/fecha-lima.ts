// Extraído de `lib/finanzas-nucleo.ts` (V1, no portado — el resto de ese
// archivo calcula EERR sobre tablas que V2 no tiene). Estas dos funciones
// son matemática de fechas pura, sin esquema: se quedan, el resto no.
const LIMA_OFFSET_MS = 5 * 3600 * 1000;

export function mesLimaUTC(anio: number, mes: number): { desde: string; hasta: string } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1) + LIMA_OFFSET_MS);
  const hasta = new Date(Date.UTC(anio, mes, 1) + LIMA_OFFSET_MS);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export function mesActualLima(): { anio: number; mes: number } {
  const lima = new Date(Date.now() - LIMA_OFFSET_MS);
  return { anio: lima.getUTCFullYear(), mes: lima.getUTCMonth() + 1 };
}
