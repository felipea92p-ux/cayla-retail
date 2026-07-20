import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getEERRMensual, mesActualLima, mesLimaUTC } from "@/lib/finanzas-nucleo";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { RegistrarGastoButton } from "@/components/RegistrarGastoButton";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const ETIQUETA_CATEGORIA: Record<string, string> = {
  alquiler: "Alquiler",
  servicios: "Servicios",
  planilla: "Planilla / honorarios",
  transporte: "Transporte",
  marketing: "Marketing",
  mantenimiento: "Mantenimiento",
  suministros: "Suministros",
  otro: "Otro",
};

const ETIQUETA_PAGO: Record<string, string> = { efectivo: "Efectivo", banco: "Banco", yape: "Yape", tarjeta: "Tarjeta" };

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

// Resumen financiero por MES CALENDARIO (decisión de Felipe: "enero es enero",
// no una ventana móvil de 30 días como antes).
export default async function FinanzasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const { m } = await searchParams;
  const actual = mesActualLima();
  const [anio, mes] = m && /^\d{4}-\d{1,2}$/.test(m) ? m.split("-").map(Number) : [actual.anio, actual.mes];

  const supabase = await createClient();
  const { desde, hasta } = mesLimaUTC(anio, mes);
  const [eerr, { data: gastosData }, sedesResult] = await Promise.all([
    getEERRMensual(persona, anio, mes),
    supabase
      .from("gastos")
      .select("id, categoria, total, metodo_pago, especificacion, created_at, sedes(codigo)")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false }),
    supabase.from("sedes").select("id, codigo").neq("tipo", "almacen").order("codigo"),
  ]);

  const sedes = sedesResult.data ?? [];
  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? { id: persona.sedeId, codigo: persona.sedeCodigo };
  const otrasSedes = sedes.filter((s) => s.id !== sedeActual.id);

  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const mesSiguiente = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const esMesActual = anio === actual.anio && mes === actual.mes;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Finanzas</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            {MESES[mes - 1]} {anio}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/finanzas?m=${mesPrevio}`}
            className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
          >
            ← {MESES[(mes + 10) % 12]}
          </Link>
          {!esMesActual && (
            <Link
              href={`/finanzas?m=${mesSiguiente}`}
              className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
            >
              {MESES[mes % 12]} →
            </Link>
          )}
        </div>
      </div>

      <FinanzasNav />

      {/* Estado de Resultados del mes */}
      <div>
        <div className="grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-5">
          <div className="bg-crema p-4">
            <p className="label-cayla text-[9px] text-tinta/45">Ventas</p>
            <p className="font-display mt-1 text-2xl text-tinta">{money(eerr?.ventas ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[9px] text-tinta/45">Costo mercadería</p>
            <p className="font-display mt-1 text-2xl text-tinta/70">{money(eerr?.cogs ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[9px] text-tinta/45">Mermas</p>
            <p className="font-display mt-1 text-2xl text-tinta/70">{money(eerr?.mermas ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[9px] text-tinta/45">Gastos</p>
            <p className="font-display mt-1 text-2xl text-tinta/70">{money(eerr?.gastos ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[9px] text-tinta/45">Utilidad neta</p>
            <p className={`font-display mt-1 text-2xl ${(eerr?.utilidad ?? 0) >= 0 ? "text-tinta" : "text-rojo"}`}>
              {money(eerr?.utilidad ?? 0)}
            </p>
            <p className="mt-0.5 text-xs text-tinta/45">
              Margen bruto {eerr?.margenBrutoPct != null ? `${eerr.margenBrutoPct}%` : "—"}
            </p>
          </div>
        </div>

        {eerr && eerr.porSede.length > 0 && (
          <div className="mt-3 overflow-x-auto border border-tinta/10 bg-papel">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/40">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[9px]">Sede</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Ventas</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Costo</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Mermas</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Gastos</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {eerr.porSede.map((s) => (
                  <tr key={s.sedeCodigo}>
                    <td className="px-3 py-2.5 font-medium text-tinta">{s.sedeCodigo}</td>
                    <td className="px-3 py-2.5 text-tinta/60">{money(s.ventas)}</td>
                    <td className="px-3 py-2.5 text-tinta/60">{money(s.cogs)}</td>
                    <td className="px-3 py-2.5 text-tinta/60">{money(s.mermas)}</td>
                    <td className="px-3 py-2.5 text-tinta/60">{money(s.gastos)}</td>
                    <td className={`px-3 py-2.5 font-medium ${s.utilidad >= 0 ? "text-tinta" : "text-rojo"}`}>
                      {money(s.utilidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gastos del mes */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-cayla text-[10px] text-tinta/45">Gastos de {MESES[mes - 1]}</h2>
          <RegistrarGastoButton sedeId={sedeActual.id} sedeCodigo={sedeActual.codigo} otrasSedes={otrasSedes} />
        </div>
        {!gastosData || gastosData.length === 0 ? (
          <p className="font-display border border-tinta/10 bg-papel py-8 text-center text-base italic text-tinta/40">
            Sin gastos registrados este mes.
          </p>
        ) : (
          <div className="overflow-x-auto border border-tinta/10 bg-papel">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/40">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[9px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Sede</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Categoría</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Pago</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Detalle</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {gastosData.map((g) => {
                  const sede = Array.isArray(g.sedes) ? g.sedes[0] : g.sedes;
                  return (
                    <tr key={g.id}>
                      <td className="px-3 py-2.5 text-tinta/60">{formatearFecha(g.created_at)}</td>
                      <td className="px-3 py-2.5 font-medium text-tinta">{sede?.codigo ?? "—"}</td>
                      <td className="px-3 py-2.5 text-tinta/60">{ETIQUETA_CATEGORIA[g.categoria] ?? g.categoria}</td>
                      <td className="px-3 py-2.5 text-tinta/60">
                        {g.metodo_pago ? ETIQUETA_PAGO[g.metodo_pago] ?? g.metodo_pago : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-tinta/60">{g.especificacion ?? "—"}</td>
                      <td className="px-3 py-2.5 font-medium text-tinta">{money(Number(g.total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
