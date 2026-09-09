import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getEERRMensual, mesActualLima, mesLimaUTC } from "@/lib/finanzas-nucleo";
import { getSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_GASTO_CATEGORIA, ETIQUETA_METODO_PAGO_GASTO, type GastoCategoria, type MetodoPagoGasto } from "@cayla-retail/shared";
import { FinanzasNav } from "@/components/FinanzasNav";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { RegistrarGastoButton } from "@/components/RegistrarGastoButton";
import { Ayuda } from "@/components/Ayuda";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

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

  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const mesSiguiente = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const esMesActual = anio === actual.anio && mes === actual.mes;

  // El mes sale de la URL, no del EERR. Antes el título y las flechas de mes esperaban a
  // que se calculara el estado de resultados completo. — ADR-0021.
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Finanzas</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            {MESES[mes - 1]} {anio}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/finanzas?m=${mesPrevio}`}
            className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          >
            ← {MESES[(mes + 10) % 12]}
          </Link>
          {!esMesActual && (
            <Link
              href={`/finanzas?m=${mesSiguiente}`}
              className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
            >
              {MESES[mes % 12]} →
            </Link>
          )}
        </div>
      </div>

      <FinanzasNav />

      <Suspense fallback={<EsqueletoTabla filas={6} />}>
        <Resumen anio={anio} mes={mes} />
      </Suspense>
    </div>
  );
}

/** El EERR del mes y el detalle de gastos: lo que sí espera la red. */
async function Resumen({ anio, mes }: { anio: number; mes: number }) {
  const persona = await requirePersonaActual(); // memorizado por request
  const supabase = await createClient();
  const { desde, hasta } = mesLimaUTC(anio, mes);
  const [eerr, { data: gastosData }, todasSedes] = await Promise.all([
    getEERRMensual(persona, anio, mes),
    supabase
      .from("gastos")
      .select("id, categoria, total, metodo_pago, especificacion, created_at, sede_id")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false }),
    getSedes(),
  ]);

  const sedes = todasSedes.filter((s) => s.tipo !== "almacen");
  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? { id: persona.sedeId, codigo: persona.sedeCodigo };
  const otrasSedes = sedes.filter((s) => s.id !== sedeActual.id);

  return (
    <>

      {/* Estado de Resultados del mes */}
      <div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12 sm:grid-cols-5">
          <div className="bg-crema p-4">
            <p className="label-cayla text-[11px] text-tinta/65">Ventas</p>
            <p className="font-display mt-1 text-2xl text-tinta">{money(eerr?.ventas ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[11px] text-tinta/65">Costo mercadería
              <Ayuda titulo="Costo de mercadería">
                Cuánto te costó comprar (o producir) exactamente lo que se vendió este mes. Es el gasto
                más grande de una tienda de ropa y define tu margen.
              </Ayuda>
            </p>
            <p className="font-display mt-1 text-2xl text-tinta/80">{money(eerr?.cogs ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[11px] text-tinta/65">Mermas</p>
            <p className="font-display mt-1 text-2xl text-tinta/80">{money(eerr?.mermas ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[11px] text-tinta/65">Gastos</p>
            <p className="font-display mt-1 text-2xl text-tinta/80">{money(eerr?.gastos ?? 0)}</p>
          </div>
          <div className="bg-crema p-4">
            <p className="label-cayla text-[11px] text-tinta/65">Utilidad neta
              <Ayuda titulo="Utilidad neta">
                Lo que de verdad ganó el negocio este mes: ventas menos el costo de la mercadería,
                las mermas y todos los gastos. Es la última línea, la que importa.
              </Ayuda>
            </p>
            <p className={`font-display mt-1 text-2xl ${(eerr?.utilidad ?? 0) >= 0 ? "text-tinta" : "text-rojo"}`}>
              {money(eerr?.utilidad ?? 0)}
            </p>
            <p className="mt-0.5 text-xs text-tinta/65">
              Margen bruto {eerr?.margenBrutoPct != null ? `${eerr.margenBrutoPct}%` : "—"}
            </p>
          </div>
        </div>

        {eerr && eerr.porSede.length > 0 && (
          <div className="mt-3 overflow-x-auto card-cayla">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/65">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[11px]">Sede</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Ventas</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Costo</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Mermas</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Gastos</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {eerr.porSede.map((s) => (
                  <tr key={s.sedeCodigo}>
                    <td className="px-3 py-2.5 font-medium text-tinta">{s.sedeCodigo}</td>
                    <td className="px-3 py-2.5 text-tinta/75">{money(s.ventas)}</td>
                    <td className="px-3 py-2.5 text-tinta/75">{money(s.cogs)}</td>
                    <td className="px-3 py-2.5 text-tinta/75">{money(s.mermas)}</td>
                    <td className="px-3 py-2.5 text-tinta/75">{money(s.gastos)}</td>
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
          <h2 className="label-cayla text-[11px] text-tinta/65">Gastos de {MESES[mes - 1]}</h2>
          <RegistrarGastoButton sedeId={sedeActual.id} sedeCodigo={sedeActual.codigo} otrasSedes={otrasSedes} />
        </div>
        {!gastosData || gastosData.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Sin gastos registrados este mes.
          </p>
        ) : (
          <div className="overflow-x-auto card-cayla">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/65">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[11px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Sede</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Categoría</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Pago</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Detalle</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {gastosData.map((g) => {
                  const sede = sedes.find((s) => s.id === g.sede_id);
                  return (
                    <tr key={g.id}>
                      <td className="px-3 py-2.5 text-tinta/75">{formatearFecha(g.created_at)}</td>
                      <td className="px-3 py-2.5 font-medium text-tinta">{sede?.codigo ?? "—"}</td>
                      <td className="px-3 py-2.5 text-tinta/75">
                        {ETIQUETA_GASTO_CATEGORIA[g.categoria as GastoCategoria] ?? g.categoria}
                      </td>
                      <td className="px-3 py-2.5 text-tinta/75">
                        {g.metodo_pago ? ETIQUETA_METODO_PAGO_GASTO[g.metodo_pago as MetodoPagoGasto] ?? g.metodo_pago : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-tinta/75">{g.especificacion ?? "—"}</td>
                      <td className="px-3 py-2.5 font-medium text-tinta">{money(Number(g.total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
