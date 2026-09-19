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

/** «19/09» y «16:34» de un instante, en hora de Lima (UTC−5, sin horario de verano). Lima nunca
 *  cambia de hora, así que basta correr el instante cinco horas y leerlo en UTC: sin `Intl`, sin
 *  diferencias entre servidor y navegador. */
export function diaYHoraLima(iso: string): { dia: string; hora: string } {
  const lima = new Date(Date.parse(iso) - LIMA_OFFSET_MS);
  const dos = (n: number) => String(n).padStart(2, "0");
  return { dia: `${dos(lima.getUTCDate())}/${dos(lima.getUTCMonth() + 1)}`, hora: `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}` };
}
