import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getClientas } from "@/lib/clientas";
import { ClientasPanel } from "@/components/ClientasPanel";

// Ficha de clienta, v1 — SOLO backend (D-76/D-77, 20260922140000_ficha_de_clienta_v1_backend.sql).
// Pantalla MÍNIMA de verificación, sin engancharse a `lib/menu.ts` (lo toca otra tarea de esta
// misma tanda) — solo para poder abrir /clientas a mano y probar buscar_clienta/registrar_clienta
// en el navegador. La captura real en el mostrador (Punto de Venta) es de otra tanda de agentes.
//
// Cualquier colaborador con sesión, sin gate de líder: retail no tiene noción de "mi clienta"
// (es de la marca), y la RLS de `clientas` ya lo exige del lado de la base.
export default async function ClientasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePersonaActualV2();
  // `?q=`: «Ficha de la clienta» desde Ventas ▸ Historial (ADR-0230) llega con su nombre ya buscado.
  const [clientas, { q }] = await Promise.all([getClientas(), searchParams]);
  return <ClientasPanel clientasIniciales={clientas} busquedaInicial={q?.trim().slice(0, 80) ?? ""} />;
}
