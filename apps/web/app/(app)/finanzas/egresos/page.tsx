import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getSedes, type Sede } from "@/lib/sedes";
import { getEgresosMes } from "@/lib/egresos";
import { mesActualLima } from "@/lib/finanzas-nucleo";
import { ETIQUETA_GASTO_CATEGORIA, ETIQUETA_METODO_PAGO_GASTO } from "@cayla-retail/shared";
import { FinanzasNav } from "@/components/FinanzasNav";
import { EsqueletoTarjetas } from "@/components/Esqueleto";
import { TarjetaIndicador } from "@/components/TarjetaIndicador";
import { RegistrarGastoButton } from "@/components/RegistrarGastoButton";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

// Fase 2 del reemplazo de Alegra (~/.claude/plans/cozy-gathering-nova.md):
// primera pantalla de "small multiples" del módulo Finanzas — una
// <TarjetaIndicador> por sede, siempre visibles a la vez (hallazgo Ramp/Tufte,
// Ronda 2), nunca un selector que oculta las otras. Mes calendario, mismo
// criterio "enero es enero" que ya usa Resumen (finanzas/page.tsx).
export default async function EgresosPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const { m } = await searchParams;
  const actual = mesActualLima();
  const [anio, mes] = m && /^\d{4}-\d{1,2}$/.test(m) ? m.split("-").map(Number) : [actual.anio, actual.mes];

  const todasSedes = await getSedes();
  // Sin `s.activo`: esa columna es de Dynamic (`retail.sedes` la expone como vista sobre
  // `public.sedes.activa`), y su criterio no es el de retail — la tienda de Lima está
  // abierta y operando, pero allá figura inactiva. Filtrar por ella dejaba una sede donde
  // se puede vender pero no cargarle el alquiler, que es el estado inconsistente que el
  // principio 2 prohíbe. Decisión de Felipe, 2026-09-10: retail no mira ese flag (ADR-0029).
  // El día que se cierre una sede de verdad, esto se resuelve con una columna propia en
  // `retail.sede_meta` — NO volviendo a colgarse del flag de Dynamic.
  const sedes = todasSedes.filter((s) => s.tipo !== "almacen");
  const sedeActual = sedes.find((s) => s.id === persona.sedeId) ?? sedes[0];
  const otrasSedes = sedes.filter((s) => s.id !== sedeActual?.id);

  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const mesSiguiente = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const esMesActual = anio === actual.anio && mes === actual.mes;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Finanzas</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            Egresos · {MESES[mes - 1]} {anio}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/finanzas/egresos?m=${mesPrevio}`}
            className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          >
            ← {MESES[(mes + 10) % 12]}
          </Link>
          {!esMesActual && (
            <Link
              href={`/finanzas/egresos?m=${mesSiguiente}`}
              className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
            >
              {MESES[mes % 12]} →
            </Link>
          )}
          {sedeActual && (
            <RegistrarGastoButton sedeId={sedeActual.id} sedeCodigo={sedeActual.codigo} otrasSedes={otrasSedes} />
          )}
        </div>
      </div>

      <FinanzasNav />

      {/* Solo esto espera la red: la cabecera, la navegación de meses y el botón de
          registrar gasto ya están arriba, dibujados. `sedes` sale de getSedes(), que el
          layout ya memorizó, así que la cabecera no paga viaje por ellas. — ADR-0021. */}
      <Suspense fallback={<EsqueletoTarjetas tarjetas={4} />}>
        <Egresos sedes={sedes} anio={anio} mes={mes} />
      </Suspense>
    </div>
  );
}

async function Egresos({ sedes, anio, mes }: { sedes: Sede[]; anio: number; mes: number }) {
  const { gastos, porSede, total, totalMesPrevio } = await getEgresosMes(sedes, anio, mes);

  return (
    <>

      {/* Small multiples: una tarjeta por sede, siempre las 4 a la vista —
          nunca un dropdown que esconda que una sede gasta distinto a otra. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {porSede.map((s) => {
          const delta = s.totalMesPrevio > 0 ? ((s.total - s.totalMesPrevio) / s.totalMesPrevio) * 100 : null;
          return (
            <TarjetaIndicador
              key={s.sedeId}
              etiqueta={s.sedeCodigo}
              valor={money(s.total)}
              comparativo={
                delta !== null
                  ? { texto: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs ${MESES[(mes + 10) % 12]}`, positivo: delta <= 0 }
                  : undefined
              }
            />
          );
        })}
      </div>

      <div className="card-cayla p-4">
        <p className="label-cayla text-[11px] text-tinta/65">Total del mes</p>
        <p className="font-display mt-1 text-3xl text-tinta">{money(total)}</p>
        {totalMesPrevio > 0 && (
          <p className="mt-1 text-xs text-tinta/70">
            {money(totalMesPrevio)} el mes anterior
          </p>
        )}
      </div>

      <div>
        <p className="label-cayla mb-2 text-[11px] text-tinta/65">Detalle ({gastos.length})</p>
        {gastos.length === 0 ? (
          <div className="card-cayla p-6">
            <p className="font-display text-base italic text-tinta/70">Sin gastos registrados este mes — se anotan con «Registrar gasto», arriba.</p>
          </div>
        ) : (
          <div className="overflow-x-auto card-cayla">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-left">
                  <th className="label-cayla px-3 py-2 text-[11px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Sede</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Categoría</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Especificación</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Método</th>
                  <th className="label-cayla px-3 py-2 text-right text-[11px]">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} className="border-b border-sand/60 last:border-0 hover:bg-sand/40">
                    <td className="px-3 py-2 text-tinta/80">{formatearFecha(g.createdAt)}</td>
                    <td className="px-3 py-2 text-tinta/80">{g.sedeCodigo}</td>
                    <td className="px-3 py-2 text-tinta">{ETIQUETA_GASTO_CATEGORIA[g.categoria]}</td>
                    <td className="px-3 py-2 text-tinta/80">{g.especificacion ?? "—"}</td>
                    <td className="px-3 py-2 text-tinta/80">{ETIQUETA_METODO_PAGO_GASTO[g.metodoPago]}</td>
                    <td className="font-display px-3 py-2 text-right tabular-nums text-tinta">{money(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
