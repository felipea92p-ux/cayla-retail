import { createClient } from "@/lib/supabase/server";
import type { PersonaActual } from "@/lib/persona";

// Panel del día del Líder (Inicio): el pulso del negocio en una pantalla.
// "Hoy" se calcula en hora de Lima (UTC-5), no del servidor — un cierre a las 11pm
// en Trujillo debe contar como hoy, aunque en UTC ya sea mañana.
const LIMA_OFFSET_MS = 5 * 3600 * 1000;

function inicioDiaLima(): Date {
  const lima = new Date(Date.now() - LIMA_OFFSET_MS);
  lima.setUTCHours(0, 0, 0, 0);
  return new Date(lima.getTime() + LIMA_OFFSET_MS);
}

export type PanelLider = {
  ventasHoyTotal: number;
  ventasHoyPorSede: { codigo: string; monto: number }[];
  cajasTiendas: { codigo: string; abierta: boolean }[];
  valorInventarioTotal: number; // a costo
  valorPorSede: { codigo: string; valor: number }[];
};

export async function getPanelLider(persona: PersonaActual): Promise<PanelLider | null> {
  if (persona.rol !== "lider") return null;
  const supabase = await createClient();
  const desde = inicioDiaLima().toISOString();

  const [{ data: sedes }, { data: ventasHoy }, { data: cajasAbiertas }, { data: stockRows }] = await Promise.all([
    supabase.from("sedes").select("id, codigo, tipo").order("codigo"),
    supabase.from("ventas").select("sede_id, monto_total").gte("created_at", desde),
    supabase.from("cajas").select("sede_id").eq("estado", "abierta"),
    supabase.from("stock").select("sede_id, cantidad, variantes(costo)"),
  ]);

  const codigoPorId = new Map((sedes ?? []).map((s) => [s.id, s.codigo]));
  const sedesAbiertas = new Set((cajasAbiertas ?? []).map((c) => c.sede_id));

  let ventasHoyTotal = 0;
  const ventasPorSede = new Map<string, number>();
  (ventasHoy ?? []).forEach((v) => {
    const monto = Number(v.monto_total);
    ventasHoyTotal += monto;
    const codigo = codigoPorId.get(v.sede_id) ?? "?";
    ventasPorSede.set(codigo, (ventasPorSede.get(codigo) ?? 0) + monto);
  });

  let valorInventarioTotal = 0;
  const valorPorSedeMap = new Map<string, number>();
  (stockRows ?? []).forEach((r) => {
    const variante = Array.isArray(r.variantes) ? r.variantes[0] : r.variantes;
    const valor = (Number(variante?.costo) || 0) * r.cantidad;
    valorInventarioTotal += valor;
    const codigo = codigoPorId.get(r.sede_id) ?? "?";
    valorPorSedeMap.set(codigo, (valorPorSedeMap.get(codigo) ?? 0) + valor);
  });

  return {
    ventasHoyTotal,
    ventasHoyPorSede: [...ventasPorSede.entries()].map(([codigo, monto]) => ({ codigo, monto })).sort((a, b) => b.monto - a.monto),
    cajasTiendas: (sedes ?? [])
      .filter((s) => s.tipo === "tienda")
      .map((s) => ({ codigo: s.codigo, abierta: sedesAbiertas.has(s.id) })),
    valorInventarioTotal,
    valorPorSede: [...valorPorSedeMap.entries()].map(([codigo, valor]) => ({ codigo, valor })).sort((a, b) => b.valor - a.valor),
  };
}
