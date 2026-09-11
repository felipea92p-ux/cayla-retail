import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { exigir } from "@/lib/resultado";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CAT_NOMBRE: Record<string, string> = {
  "333": "Maquinaria y equipo",
  "336": "Equipos de cómputo",
  "335": "Muebles y enseres",
  "168": "Otros activos",
};

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", month: "short", year: "numeric" }).format(
    new Date(iso + "T12:00:00")
  );
}

// Registro de activos fijos de la unidad: cada bien con su serie, valor y desgaste.
export default async function ActivosPage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  // La cabecera y la navegación de Finanzas no dependen de ninguna consulta.
  // Antes esperaban a que llegaran todos los datos de la pantalla. — ADR-0021.
  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Finanzas · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Activos</h1>
        <p className="mt-1 text-sm text-tinta/70">Tus máquinas y equipos, con su valor real de hoy.</p>
      </div>

      <FinanzasNav />

      <Suspense fallback={<EsqueletoTabla filas={5} />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

/** Todo lo que sí espera la red. */
async function Contenido() {
  const persona = await requirePersonaActual(); // memorizado por request

  const supabase = await createClient();
  // Patrimonio: un activo que no se ve es un activo que se compra dos veces.
  const data = exigir(
    await supabase
      .from("activos_fijos")
      .select("nombre, serie, cuenta_codigo, costo, depreciacion_apertura, fecha_adquisicion")
      .eq("unidad_id", persona.sedeId)
      .eq("estado", "activo")
      .order("costo", { ascending: false }),
    "los activos fijos"
  );

  const activos = data;
  const totalCosto = activos.reduce((a, x) => a + Number(x.costo), 0);
  const totalDep = activos.reduce((a, x) => a + Number(x.depreciacion_apertura), 0);
  const totalNeto = totalCosto - totalDep;
  return (
    <>

      {activos.length === 0 ? (
        <p className="font-display card-cayla py-10 text-center text-base italic text-tinta/65">
          No hay activos registrados en esta unidad. Máquinas, muebles y equipos se cargan hoy
          directo en la base — esta pantalla todavía solo los muestra.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
            <div className="bg-crema p-4">
              <p className="label-cayla text-[11px] text-tinta/65">Bienes</p>
              <p className="font-display mt-1 text-2xl text-tinta">{activos.length}</p>
            </div>
            <div className="bg-crema p-4">
              <p className="label-cayla text-[11px] text-tinta/65">Costo total</p>
              <p className="font-display mt-1 text-2xl text-tinta/80">{money(totalCosto)}</p>
            </div>
            <div className="bg-crema p-4">
              <p className="label-cayla text-[11px] text-tinta/65">Valor hoy</p>
              <p className="font-display mt-1 text-2xl text-rojo">{money(totalNeto)}</p>
            </div>
          </div>

          <div className="overflow-x-auto card-cayla">
            <Table className="text-left text-xs">
              <TableHeader className="border-b border-tinta/10 text-tinta/65">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="label-cayla px-3 py-2 text-[11px]">Bien</TableHead>
                  <TableHead className="label-cayla px-3 py-2 text-[11px]">Serie</TableHead>
                  <TableHead className="label-cayla px-3 py-2 text-[11px]">Categoría</TableHead>
                  <TableHead className="label-cayla px-3 py-2 text-[11px]">Desde</TableHead>
                  <TableHead className="label-cayla px-3 py-2 text-right text-[11px]">Costo</TableHead>
                  <TableHead className="label-cayla px-3 py-2 text-right text-[11px]">Desgaste</TableHead>
                  <TableHead className="label-cayla px-3 py-2 text-right text-[11px]">Valor hoy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-tinta/5">
                {activos.map((a, i) => {
                  const neto = Number(a.costo) - Number(a.depreciacion_apertura);
                  return (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell className="px-3 py-2.5 font-medium text-tinta">{a.nombre}</TableCell>
                      <TableCell className="px-3 py-2.5 text-tinta/65">{a.serie ?? "—"}</TableCell>
                      <TableCell className="px-3 py-2.5 text-tinta/75">{CAT_NOMBRE[a.cuenta_codigo] ?? a.cuenta_codigo}</TableCell>
                      <TableCell className="px-3 py-2.5 text-tinta/65">{fecha(a.fecha_adquisicion)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums text-tinta/75">{money(Number(a.costo))}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums text-tinta/65">
                        −{money(Number(a.depreciacion_apertura))}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-medium tabular-nums text-tinta">{money(neto)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter className="border-t border-tinta/10 bg-transparent font-medium text-tinta">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="label-cayla px-3 py-2.5 text-[11px] text-tinta/65" colSpan={4}>
                    Total
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">{money(totalCosto)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums text-tinta/75">−{money(totalDep)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">{money(totalNeto)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <p className="text-xs text-tinta/65">
            El desgaste (depreciación) se calculó desde la fecha de compra de cada bien, con tasas SUNAT y valor
            residual, según NIIF.
          </p>
        </>
      )}
    </>
  );
}
