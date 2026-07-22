import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getComparativoAnual } from "@/lib/finanzas-nucleo";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { HistoricosEditor } from "@/components/HistoricosEditor";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Comparativo año vs año (la hoja "comparación" de SINATRA, hecha sistema):
// históricos sembrados una vez + ventas del sistema desde el corte, por sede o total.
export default async function ComparativoPage({ searchParams }: { searchParams: Promise<{ sede?: string }> }) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const { sede } = await searchParams;
  const supabase = await createClient();
  const [comparativo, { data: sedesData }, { data: historicos }] = await Promise.all([
    getComparativoAnual(persona, sede || undefined),
    supabase.from("sedes").select("id, codigo").eq("tipo", "tienda").order("codigo"),
    supabase.from("ventas_historicas_mensuales").select("sede_id, anio, mes, monto"),
  ]);
  const sedes = sedesData ?? [];

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Año contra año</h1>
      </div>

      <FinanzasNav />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/finanzas/comparativo"
          className={`label-cayla border px-3 py-1.5 text-[9px] transition-colors ${
            !sede ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/55 hover:border-rojo hover:text-rojo"
          }`}
        >
          Todas
        </Link>
        {sedes.map((s) => (
          <Link
            key={s.id}
            href={`/finanzas/comparativo?sede=${s.codigo}`}
            className={`label-cayla border px-3 py-1.5 text-[9px] transition-colors ${
              sede === s.codigo ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/55 hover:border-rojo hover:text-rojo"
            }`}
          >
            {s.codigo}
          </Link>
        ))}
        <span className="ml-auto"><HistoricosEditor sedes={sedes} existentes={(historicos ?? []).map((h) => ({ ...h, monto: Number(h.monto) }))} /></span>
      </div>

      {!comparativo || comparativo.anios.length === 0 ? (
        <p className="font-display card-cayla py-10 text-center text-base italic text-tinta/40">
          Aún no hay datos — siembra los históricos o registra ventas.
        </p>
      ) : (
        <div className="overflow-x-auto card-cayla">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-tinta/10 text-tinta/40">
              <tr>
                <th className="label-cayla px-3 py-2 text-[9px]">Mes</th>
                {comparativo.anios.map((a) => (
                  <th key={a} className="label-cayla px-3 py-2 text-right text-[9px]">{a}</th>
                ))}
                {comparativo.anios.length >= 2 && (
                  <th className="label-cayla px-3 py-2 text-right text-[9px]">Δ último año</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/5">
              {comparativo.filas.map((f) => {
                const ultimo = comparativo.anios[comparativo.anios.length - 1];
                const previo = comparativo.anios[comparativo.anios.length - 2];
                const delta = previo != null && f.porAnio[previo] > 0
                  ? Math.round(((f.porAnio[ultimo] - f.porAnio[previo]) / f.porAnio[previo]) * 100)
                  : null;
                return (
                  <tr key={f.mes}>
                    <td className="px-3 py-2.5 font-medium text-tinta">{MESES[f.mes - 1]}</td>
                    {comparativo.anios.map((a) => (
                      <td key={a} className="px-3 py-2.5 text-right text-tinta/60">
                        {f.porAnio[a] > 0 ? money(f.porAnio[a]) : "—"}
                      </td>
                    ))}
                    {comparativo.anios.length >= 2 && (
                      <td className={`px-3 py-2.5 text-right font-medium ${delta == null ? "text-tinta/30" : delta >= 0 ? "text-tinta" : "text-rojo"}`}>
                        {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-tinta/15">
              <tr>
                <td className="label-cayla px-3 py-2.5 text-[9px] text-tinta/50">Total</td>
                {comparativo.anios.map((a) => (
                  <td key={a} className="font-display px-3 py-2.5 text-right text-sm text-tinta">
                    {money(comparativo.totalPorAnio[a] ?? 0)}
                  </td>
                ))}
                {comparativo.anios.length >= 2 && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
