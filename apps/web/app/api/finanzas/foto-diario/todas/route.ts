import { rehacerFotosDelDiario } from "@/lib/foto-diario-cron";

// GET /api/finanzas/foto-diario/todas — cada madrugada a las 4:00 de Lima (09:00 UTC, después del vigía de las 3:30): rehace la foto
// del diario de TODOS los meses (ADR-0633), por si alguna regla del diario depende del día y no de una escritura. Solo con la clave del
// cron; la lógica, en `lib/foto-diario-cron.ts`.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return rehacerFotosDelDiario(request, true);
}
