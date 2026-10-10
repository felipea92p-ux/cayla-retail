import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { enteroES, solesES, type EstadoCampana, type TotalesPlan } from "@/lib/plan-compra-reglas";

// Las cifras del plan de campaña (ADR-0349): cuántas categorías ya tienen plan, cuántas prendas comprar y cuánto cuesta; en la
// campaña y después, lo que se vendió de verdad. Solo dibuja: los totales los saca `totalesDelPlan` (lib/plan-compra-reglas.ts).

export function CifrasPlan({ totales, estado }: { totales: TotalesPlan; estado: EstadoCampana }) {
  const verReal = estado !== "antes";
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TarjetaCifra etiqueta="Categorías con plan" valor={`${totales.conPlan} de ${totales.total}`}>
        {totales.conPlan === 0 ? "Empieza por las que más venden" : "Las demás no suman a la compra"}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Prendas a comprar" valor={enteroES.format(totales.aComprar)}>
        Lo que conviene tener menos lo que ya hay
      </TarjetaCifra>
      <TarjetaCifra etiqueta={verReal ? "Vendido en la campaña" : "Inversión al costo"} valor={verReal ? enteroES.format(totales.vendido) : solesES(totales.inversion)}>
        {verReal ? (estado === "durante" ? "Hasta hoy, todas las categorías" : "Todas las categorías") : "Solo las categorías con plan"}
      </TarjetaCifra>
    </div>
  );
}
