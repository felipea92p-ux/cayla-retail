import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getComparativoAnual } from "@/lib/finanzas-nucleo";
import { getSedes, type Sede } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { FinanzasNav } from "@/components/FinanzasNav";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { HistoricosEditor } from "@/components/HistoricosEditor";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  // Solo `getSedes()` —memorizada por el layout, sin viaje nuevo— para poder pintar el
  // selector de sedes de inmediato: es navegación, y hacerla esperar la comparación
  // significaría no poder cambiar de tienda hasta que cargue la tabla. — ADR-0021.
  const todasSedes = await getSedes();
  const sedes = todasSedes.filter((s) => s.tipo === "tienda");

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Año contra año</h1>
      </div>

      <FinanzasNav />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/finanzas/comparativo"
          className={`label-cayla border px-3 py-1.5 text-[11px] transition-colors ${
            !sede ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/70 hover:border-rojo hover:text-rojo"
          }`}
        >
          Todas
        </Link>
        {sedes.map((s) => (
          <Link
            key={s.id}
            href={`/finanzas/comparativo?sede=${s.codigo}`}
            className={`label-cayla border px-3 py-1.5 text-[11px] transition-colors ${
              sede === s.codigo ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/70 hover:border-rojo hover:text-rojo"
            }`}
          >
            {s.codigo}
          </Link>
        ))}
        <span className="ml-auto">
          <Suspense fallback={null}>
            <EditorHistoricos sedes={sedes} />
          </Suspense>
        </span>
      </div>

      <Suspense fallback={<EsqueletoTabla filas={7} />}>
        <Comparacion sede={sede} />
      </Suspense>
    </div>
  );
}

/** El editor de históricos necesita su propia consulta; el selector de arriba no. */
async function EditorHistoricos({ sedes }: { sedes: Sede[] }) {
  const supabase = await createClient();
  const { datos } = tolerar(
    await supabase.from("ventas_historicas_mensuales").select("sede_id, anio, mes, monto"),
    "los históricos sembrados"
  );
  // Si falla, se oculta el botón en vez de tumbar la pantalla: sembrar históricos es una
  // tarea ocasional del Líder, no algo que bloquee mirar el comparativo.
  if (!datos) return null;
  return <HistoricosEditor sedes={sedes} existentes={datos.map((h) => ({ ...h, monto: Number(h.monto) }))} />;
}

/** La comparación año contra año: lo pesado de la pantalla. */
async function Comparacion({ sede }: { sede?: string }) {
  const persona = await requirePersonaActual(); // memorizado por request
  const comparativo = await getComparativoAnual(persona, sede || undefined);

  return (
    <>
      {!comparativo || comparativo.anios.length === 0 ? (
        <p className="font-display card-cayla py-10 text-center text-base italic text-tinta/65">
          Aún no hay datos — siembra los históricos o registra ventas.
        </p>
      ) : (
        <div className="overflow-x-auto card-cayla">
          <Table className="text-left text-xs">
            <TableHeader className="border-b border-tinta/10 text-tinta/65">
              <TableRow className="hover:bg-transparent">
                <TableHead className="label-cayla px-3 py-2 text-[11px]">Mes</TableHead>
                {comparativo.anios.map((a) => (
                  <TableHead key={a} className="label-cayla px-3 py-2 text-right text-[11px]">{a}</TableHead>
                ))}
                {comparativo.anios.length >= 2 && (
                  <TableHead className="label-cayla px-3 py-2 text-right text-[11px]">Δ último año</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-tinta/5">
              {comparativo.filas.map((f) => {
                const ultimo = comparativo.anios[comparativo.anios.length - 1];
                const previo = comparativo.anios[comparativo.anios.length - 2];
                const delta = previo != null && f.porAnio[previo] > 0
                  ? Math.round(((f.porAnio[ultimo] - f.porAnio[previo]) / f.porAnio[previo]) * 100)
                  : null;
                return (
                  <TableRow key={f.mes} className="hover:bg-transparent">
                    <TableCell className="px-3 py-2.5 font-medium text-tinta">{MESES[f.mes - 1]}</TableCell>
                    {comparativo.anios.map((a) => (
                      <TableCell key={a} className="px-3 py-2.5 text-right text-tinta/75">
                        {f.porAnio[a] > 0 ? money(f.porAnio[a]) : "—"}
                      </TableCell>
                    ))}
                    {comparativo.anios.length >= 2 && (
                      <TableCell className={`px-3 py-2.5 text-right font-medium ${delta == null ? "text-tinta/65" : delta >= 0 ? "text-tinta" : "text-rojo"}`}>
                        {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter className="border-t border-tinta/15 bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableCell className="label-cayla px-3 py-2.5 text-[11px] text-tinta/70">Total</TableCell>
                {comparativo.anios.map((a) => (
                  <TableCell key={a} className="font-display px-3 py-2.5 text-right text-sm text-tinta">
                    {money(comparativo.totalPorAnio[a] ?? 0)}
                  </TableCell>
                ))}
                {comparativo.anios.length >= 2 && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </>
  );
}
