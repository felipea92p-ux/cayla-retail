import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getDiarioCaja, getGastos, getEstadoResultados } from "@/lib/finanzas";
import { createClient } from "@/lib/supabase/server";
import { RegistrarGastoButton } from "@/components/RegistrarGastoButton";

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};

const ETIQUETA_CATEGORIA: Record<string, string> = {
  alquiler: "Alquiler",
  servicios: "Servicios",
  planilla: "Planilla / honorarios",
  transporte: "Transporte",
  marketing: "Marketing",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function FinanzasPage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const supabase = await createClient();
  const [diario, gastos, eerr, sedesResult] = await Promise.all([
    getDiarioCaja(persona, 30),
    getGastos(persona, 30),
    getEstadoResultados(persona, 30),
    supabase.from("sedes").select("id, codigo").order("codigo"),
  ]);
  const sedes: { id: string; codigo: string }[] = sedesResult.data ?? [];
  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? { id: persona.sedeId, codigo: persona.sedeCodigo };
  const otrasSedes = sedes.filter((s) => s.id !== sedeActual.id);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-xs text-neutral-400 hover:underline">← Volver</Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Finanzas · últimos {eerr.ventanaDias} días</h1>
      </div>

      {/* Estado de Resultados */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Estado de Resultados</h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Utilidad neta</p>
          <p className={`text-2xl font-semibold ${eerr.utilidad >= 0 ? "text-neutral-900" : "text-red-600"}`}>
            {money(eerr.utilidad)}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Margen bruto {eerr.margenBrutoPct != null ? `${eerr.margenBrutoPct}%` : "—"} · Ventas {money(eerr.ventas)} · Costo
            mercadería {money(eerr.cogs)} · Mermas {money(eerr.mermas)} · Gastos {money(eerr.gastos)}
          </p>
        </div>
        {eerr.porSede.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Sede</th>
                  <th className="px-3 py-2 font-medium">Ventas</th>
                  <th className="px-3 py-2 font-medium">Costo merc.</th>
                  <th className="px-3 py-2 font-medium">Mermas</th>
                  <th className="px-3 py-2 font-medium">Gastos</th>
                  <th className="px-3 py-2 font-medium">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {eerr.porSede.map((s) => (
                  <tr key={s.sedeCodigo} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-neutral-900">{s.sedeCodigo}</td>
                    <td className="px-3 py-2 text-neutral-600">{money(s.ventas)}</td>
                    <td className="px-3 py-2 text-neutral-600">{money(s.cogs)}</td>
                    <td className="px-3 py-2 text-neutral-600">{money(s.mermas)}</td>
                    <td className="px-3 py-2 text-neutral-600">{money(s.gastos)}</td>
                    <td className={`px-3 py-2 font-medium ${s.utilidad >= 0 ? "text-neutral-900" : "text-red-600"}`}>
                      {money(s.utilidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Diario de Caja */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Diario de Caja</h2>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(diario.totalPorMetodo).map(([metodo, monto]) => (
            <div key={metodo} className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xs text-neutral-400">{ETIQUETA_METODO[metodo] ?? metodo}</p>
              <p className="text-lg font-semibold text-neutral-900">{money(monto)}</p>
            </div>
          ))}
        </div>
        {diario.cajas.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-neutral-400">Sin cajas registradas en este período.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Sede</th>
                  <th className="px-3 py-2 font-medium">Apertura</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Esperado</th>
                  <th className="px-3 py-2 font-medium">Contado</th>
                  <th className="px-3 py-2 font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {diario.cajas.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-neutral-900">{c.sedeCodigo}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {formatearFecha(c.abiertaEn)} · {money(c.montoApertura)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          c.estado === "abierta" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {c.estado === "abierta" ? "Abierta" : "Cerrada"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {c.montoCierreEsperado != null ? money(c.montoCierreEsperado) : "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {c.montoCierreContado != null ? money(c.montoCierreContado) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 font-medium ${
                        c.diferencia == null
                          ? "text-neutral-400"
                          : c.diferencia === 0
                            ? "text-neutral-900"
                            : c.diferencia > 0
                              ? "text-green-600"
                              : "text-red-600"
                      }`}
                    >
                      {c.diferencia != null ? money(c.diferencia) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gastos */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Gastos</h2>
          <RegistrarGastoButton sedeId={sedeActual.id} sedeCodigo={sedeActual.codigo} otrasSedes={otrasSedes} />
        </div>
        <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Total del período</p>
          <p className="text-lg font-semibold text-neutral-900">{money(gastos.total)}</p>
        </div>
        {gastos.gastos.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-neutral-400">Sin gastos registrados en este período.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Sede</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Especificación</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {gastos.gastos.map((g) => (
                  <tr key={g.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2 text-neutral-600">{formatearFecha(g.createdAt)}</td>
                    <td className="px-3 py-2 font-medium text-neutral-900">{g.sedeCodigo}</td>
                    <td className="px-3 py-2 text-neutral-600">{ETIQUETA_CATEGORIA[g.categoria] ?? g.categoria}</td>
                    <td className="px-3 py-2 text-neutral-600">{g.especificacion ?? "—"}</td>
                    <td className="px-3 py-2 font-medium text-neutral-900">{money(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
