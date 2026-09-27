import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getClientas } from "@/lib/clientas";
import { ClientasPanel } from "@/components/ClientasPanel";

// Clientas, paso 2 del acta (D-92 a D-111, docs/datos/DECISIONES-2026-09-26-clientas.md sección
// H): la ficha de verdad — buscar, ver su actividad, editar, archivar/anonimizar y unir fichas.
// Reemplaza la pantalla mínima de verificación de D-76/D-77.
//
// Cualquier colaborador con sesión, sin gate de líder: retail no tiene noción de "mi clienta"
// (es de la marca, D-109 — cualquier cuenta con el módulo ve a todas), y la RLS de `clientas`
// ya lo exige del lado de la base.
export default async function ClientasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePersonaActualV2();
  // `?q=`: «Ficha de la clienta» desde Ventas ▸ Historial (ADR-0230) llega con su nombre ya buscado.
  const [clientas, { q }] = await Promise.all([getClientas(), searchParams]);
  return <ClientasPanel clientasIniciales={clientas} busquedaInicial={q?.trim().slice(0, 80) ?? ""} />;
}
