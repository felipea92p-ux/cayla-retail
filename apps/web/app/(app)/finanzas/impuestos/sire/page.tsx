import { esMes, mesDe } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { getComparacionSire } from "@/lib/sire";
import { SirePanel } from "@/components/finanzas/SirePanel";

// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601). La puerta del módulo es el layout de Impuestos; la base vuelve a pedirlo en cada
// función (`fn_puede_ver_impuestos`). El mes viene de la mesa de mando (`?mes=2026-10`); sin él, el mes anterior al de hoy, que es el que
// se declara y cuya propuesta ya está completa.
export default async function SirePage({ searchParams }: { searchParams: Promise<{ mes?: string; registro?: string }> }) {
  const sp = await searchParams;
  const hoy = mesDe(hoyLima());
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const mes = esMes(sp.mes) ? sp.mes : anterior;
  // `?registro=ventas` compara la propuesta del RVIE (actividad 3); sin él, la de compras, que es la que esconde IGV perdido.
  const registro = sp.registro === "ventas" ? "ventas" : "compras";
  const comparacion = await getComparacionSire(registro, mes);
  return <SirePanel registro={registro} mes={mes} comparacion={comparacion} />;
}
