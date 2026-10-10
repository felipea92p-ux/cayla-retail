import { celda, fila, type Columna } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { enteroES, fraseDeLoReal, solesES, type EstadoCampana, type FilaPlan } from "@/lib/plan-compra-reglas";

// Una fila de la tabla del plan de campaña (ADR-0349): la categoría, sus tres escenarios, lo que ya hay en la red, cuánto comprar y
// cuánto cuesta; durante y después de la campaña, lo que se vendió de verdad al lado. Toda ella es un botón que abre su hoja.

export const plantillaDelPlan = (verReal: boolean) =>
  verReal
    ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1.4fr)]"
    : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]";

export function columnasDelPlan(estado: EstadoCampana): Columna[] {
  return [
    { titulo: "Categoría" },
    { titulo: "Venta esperada", subtitulo: "flojo · normal · bueno" },
    { titulo: "Hay hoy", subtitulo: "en la red", alinear: "der" },
    { titulo: "Comprar", alinear: "der" },
    { titulo: "Inversión", subtitulo: "al costo", alinear: "der" },
    ...(estado !== "antes" ? [{ titulo: estado === "durante" ? "Vendido hasta hoy" : "Lo que pasó" } as Columna] : []),
  ];
}

export function FilaCategoria({ f, estado, onAbrir }: { f: FilaPlan; estado: EstadoCampana; onAbrir: () => void }) {
  const { c, linea, stock, calculo, vendido } = f;
  const plantilla = plantillaDelPlan(estado !== "antes");
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`${fila(plantilla)} w-full text-left transition-colors hover:bg-sand/30`}
      aria-label={`${linea ? "Corregir" : "Armar"} el plan de ${c.nombre}`}
    >
      <span className={celda("izq", "font-medium text-tinta")}>{c.nombre}</span>
      <span className={celda("izq", "tabular-nums text-tinta/80")}>
        {linea ? (
          `${enteroES.format(linea.flojo)} · ${enteroES.format(linea.normal)} · ${enteroES.format(linea.bueno)}`
        ) : (
          <Chip tono="pizarra">Sin plan</Chip>
        )}
      </span>
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Hay hoy: </span>
        {enteroES.format(stock)}
      </span>
      <span className={celda("der", "tabular-nums font-semibold text-tinta")}>
        <span className="font-normal text-taupe-profundo sm:hidden">Comprar: </span>
        {calculo ? enteroES.format(calculo.comprar) : "—"}
      </span>
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Inversión: </span>
        {calculo ? solesES(calculo.inversion) : "—"}
      </span>
      {estado !== "antes" && (
        <span className={celda("izq", "text-sm text-tinta/75")}>{linea ? fraseDeLoReal(vendido, linea) : `Se vendieron ${enteroES.format(vendido)}.`}</span>
      )}
    </button>
  );
}
