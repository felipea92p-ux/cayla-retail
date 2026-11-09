import { rehacerFotosDelDiario } from "@/lib/foto-diario-cron";

// GET /api/finanzas/foto-diario — cada 5 minutos (`vercel.json` → `crons`): rehace las fotos del diario vencidas y las que faltan
// (ADR-0633). Solo con la clave del cron; la lógica, en `lib/foto-diario-cron.ts`.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return rehacerFotosDelDiario(request, false);
}
