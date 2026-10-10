import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { enteroES, solesES, type EstadoCampana, type FilaPlan, type FiltroPlan, type TotalesPlan } from "@/lib/plan-compra-reglas";

// Las cifras del plan de campaña (ADR-0349): cuántas categorías ya tienen plan (y filtra la tabla), cuántas prendas comprar y cuánto
// cuesta y, la cuarta, la que cambia con el momento: antes, cuántas de las que más venden faltan por llenar; durante y después, lo que
// se vendió de verdad. Solo dibuja: los totales los saca `totalesDelPlan` (lib/plan-compra-reglas.ts).

export function CifrasPlan({
  totales,
  estado,
  filas,
  filtro,
  onFiltro,
}: {
  totales: TotalesPlan;
  estado: EstadoCampana;
  filas: readonly FilaPlan[];
  filtro: FiltroPlan;
  onFiltro: (f: FiltroPlan) => void;
}) {
  const verReal = estado !== "antes";
  const lasQueMasVenden = filas.filter((f) => f.puesto !== null);
  const faltan = lasQueMasVenden.filter((f) => !f.linea).length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TarjetaCifra
        etiqueta="Categorías con plan"
        valor={`${totales.conPlan} de ${totales.total}`}
        activa={filtro === "con"}
        onClick={() => onFiltro(filtro === "con" ? "todas" : "con")}
      >
        {totales.conPlan === 0 ? "Empieza por las que más venden" : "Las demás no suman a la compra"}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Prendas a comprar" valor={enteroES.format(totales.aComprar)}>
        Lo que conviene tener menos lo que ya hay
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Inversión al costo" valor={solesES(totales.inversion)}>
        Solo las categorías con plan
      </TarjetaCifra>
      {verReal ? (
        <TarjetaCifra etiqueta="Vendido en la campaña" valor={enteroES.format(totales.vendido)}>
          {estado === "durante" ? "Hasta hoy, todas las categorías" : "Todas las categorías"}
        </TarjetaCifra>
      ) : lasQueMasVenden.length === 0 ? (
        <TarjetaCifra etiqueta="Por llenar primero" valor={null}>
          Todavía no hay ventas de los últimos 90 días para decir cuáles venden más
        </TarjetaCifra>
      ) : (
        <TarjetaCifra etiqueta="Por llenar primero" valor={enteroES.format(faltan)}>
          {faltan === 0 ? `Las ${lasQueMasVenden.length} que más venden ya tienen plan` : `de las ${lasQueMasVenden.length} que más venden, sin plan todavía`}
        </TarjetaCifra>
      )}
    </div>
  );
}
