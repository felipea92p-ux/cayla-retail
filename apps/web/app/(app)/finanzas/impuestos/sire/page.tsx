import { mesDe } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDeLaRuta, RUTA_SIRE } from "@/lib/finanzas-telar-reglas";
import { getComparacionSire } from "@/lib/sire";
import { SirePanel } from "@/components/finanzas/SirePanel";
import { credencialesDe } from "@/lib/sire-api-reglas";

// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601). La puerta del módulo es el layout de Impuestos; la base vuelve a pedirlo en cada
// función (`fn_puede_ver_impuestos`). El mes viene de la mesa de mando (`?mes=2026-10`); sin él, o con uno que todavía corre, el mes anterior
// al de hoy, que es el que se declara y cuya propuesta ya está completa. La barra lee la misma regla (`mesDeLaRuta`): las dos dicen el mismo mes.
export default async function SirePage({ searchParams }: { searchParams: Promise<{ mes?: string; registro?: string }> }) {
  const sp = await searchParams;
  const mes = mesDeLaRuta(RUTA_SIRE, sp.mes, mesDe(hoyLima()));
  // `?registro=ventas` compara la propuesta del RVIE (actividad 3); sin él, la de compras, que es la que esconde IGV perdido.
  const registro = sp.registro === "ventas" ? "ventas" : "compras";
  const comparacion = await getComparacionSire(registro, mes);
  // Si el servidor tiene las credenciales del SIRE (actividad 5), la propuesta llega sola: el vacío lo dice. Solo se pregunta si están, nunca
  // viaja un valor al navegador.
  return <SirePanel registro={registro} mes={mes} comparacion={comparacion} automatica={credencialesDe(process.env).ok} />;
}
